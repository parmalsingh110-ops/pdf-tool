"""
Telemetry & Feedback Engine for PDF Tool
Stores user ratings, feedback, and automatic crash/error reports in SQLite.
Supports optional instant notifications to Telegram or Discord via webhooks.
"""

import os
import sqlite3
import hashlib
import hmac
import json
import logging
import urllib.request
import urllib.parse
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
import concurrent.futures
from dotenv import load_dotenv

logger = logging.getLogger("pdf_tool.telemetry")
_ALERT_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=4, thread_name_prefix="telemetry_alert")

# Database Path
BACKEND_DIR = Path(__file__).resolve().parent
DATA_DIR = BACKEND_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "telemetry.db"

# Ensure environment variables are loaded from backend/.env or root .env
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(BACKEND_DIR.parent / ".env")

# Admin Secret Key (must come from env or hashed SQLite setting — no insecure hardcoded fallback)
ADMIN_SECRET_KEY = os.environ.get("ADMIN_SECRET_KEY", "").strip()
_PBKDF2_PREFIX = "pbkdf2_sha256$"

def get_discord_webhook(webhook_url: Optional[str] = None) -> str:
    """Return configured Discord webhook URL dynamically."""
    if webhook_url and webhook_url.strip():
        return webhook_url.strip()
    return (
        os.environ.get("DISCORD_CRASH_WEBHOOK_URL") or
        os.environ.get("DISCORD_WEBHOOK_URL") or
        ""
    ).strip().strip('"').strip("'")

def get_discord_feedback_webhook() -> str:
    """Return configured Discord feedback webhook URL dynamically."""
    return (
        os.environ.get("DISCORD_FEEDBACK_WEBHOOK_URL") or
        os.environ.get("DISCORD_WEBHOOK_URL") or
        ""
    ).strip().strip('"').strip("'")

def get_telegram_creds() -> tuple[str, str]:
    """Return (bot_token, chat_id) dynamically."""
    token = (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip().strip('"').strip("'")
    chat_id = (os.environ.get("TELEGRAM_CHAT_ID") or "").strip().strip('"').strip("'")
    return token, chat_id


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize SQLite database tables for feedback, error telemetry, and settings."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS tool_feedback (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tool_path TEXT NOT NULL,
                    tool_name TEXT NOT NULL,
                    rating INTEGER NOT NULL,
                    feedback_type TEXT DEFAULT 'general',
                    comment TEXT DEFAULT '',
                    user_agent TEXT DEFAULT '',
                    ip_hash TEXT DEFAULT '',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS error_telemetry (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tool_path TEXT NOT NULL,
                    tool_name TEXT NOT NULL,
                    error_message TEXT NOT NULL,
                    error_stack TEXT DEFAULT '',
                    file_info TEXT DEFAULT '{}',
                    user_agent TEXT DEFAULT '',
                    ip_hash TEXT DEFAULT '',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS system_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # Create indexes for fast query performance
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_feedback_tool ON tool_feedback(tool_path)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_errors_tool ON error_telemetry(tool_path)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_errors_created ON error_telemetry(created_at)")
            conn.commit()
            logger.info("Telemetry database initialized successfully at %s", DB_PATH)
    except Exception as e:
        logger.error("Failed to initialize telemetry database: %s", e)


def _hash_passcode(passcode: str) -> str:
    salt = os.urandom(16).hex()
    dk = hashlib.pbkdf2_hmac("sha256", passcode.strip().encode("utf-8"), bytes.fromhex(salt), 200_000)
    return f"{_PBKDF2_PREFIX}{salt}${dk.hex()}"


def _verify_hashed_passcode(passcode: str, stored: str) -> bool:
    try:
        _, salt_hex, hash_hex = stored.split("$", 2)
        dk = hashlib.pbkdf2_hmac("sha256", passcode.strip().encode("utf-8"), bytes.fromhex(salt_hex), 200_000)
        return hmac.compare_digest(dk.hex(), hash_hex)
    except Exception:
        return False


def _get_stored_db_passcode() -> Optional[str]:
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM system_settings WHERE key = 'admin_passcode'")
            row = cursor.fetchone()
            if row and row[0]:
                return str(row[0])
    except Exception as e:
        logger.warning("Could not read admin passcode from DB: %s", e)
    return None


def is_admin_configured() -> bool:
    """Return True only when a DB passcode or ADMIN_SECRET_KEY env var is explicitly set."""
    if _get_stored_db_passcode():
        return True
    return bool(os.environ.get("ADMIN_SECRET_KEY", "").strip())


def set_admin_passcode(new_passcode: str) -> bool:
    """Persist salted PBKDF2 hash of admin passcode into SQLite settings table."""
    if not new_passcode or len(new_passcode.strip()) < 6:
        return False
    try:
        hashed = _hash_passcode(new_passcode.strip())
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO system_settings (key, value, updated_at)
                VALUES ('admin_passcode', ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
            """, (hashed,))
            conn.commit()
            return True
    except Exception as e:
        logger.error("Failed to update admin passcode: %s", e)
        return False


def verify_admin_key(key: str) -> bool:
    """Constant-time verification of admin passcode (never falls back to hardcoded defaults)."""
    if not key or not key.strip():
        return False
    candidate = key.strip()
    db_val = _get_stored_db_passcode()
    if db_val:
        if db_val.startswith(_PBKDF2_PREFIX):
            return _verify_hashed_passcode(candidate, db_val)
        # Legacy plaintext entry in SQLite: verify then transparently upgrade to salted hash
        if hmac.compare_digest(candidate, db_val.strip()):
            set_admin_passcode(candidate)
            return True
        return False
    env_secret = os.environ.get("ADMIN_SECRET_KEY", "").strip()
    if not env_secret:
        return False
    return hmac.compare_digest(candidate, env_secret)


_RUNTIME_IP_SALT = os.environ.get("IP_HASH_SALT", "").strip() or os.urandom(16).hex()


def hash_ip(ip: str) -> str:
    """Anonymize IP address for privacy while allowing short-term deduplication."""
    if not ip:
        return ""
    return hashlib.sha256(f"{ip}_{_RUNTIME_IP_SALT}".encode()).hexdigest()[:12]


def _sync_send_discord(target_url: str, payload_data: bytes):
    try:
        req = urllib.request.Request(
            target_url,
            data=payload_data,
            headers={"Content-Type": "application/json", "User-Agent": "PdfTool-Telemetry"}
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        logger.warning("Discord webhook alert failed: %s", e)


def send_discord_alert(
    title: str,
    description: str,
    fields: List[Dict[str, str]],
    color: int = 0x3498DB,
    webhook_url: Optional[str] = None
):
    """Send formatted embed message to Discord webhook on background thread."""
    target_url = get_discord_webhook(webhook_url)
    if not target_url:
        return
    try:
        payload = {
            "embeds": [{
                "title": title,
                "description": description[:1000],
                "color": color,
                "fields": fields[:10],
                "timestamp": datetime.utcnow().isoformat(),
                "footer": {"text": "PDF Media Suite Telemetry"}
            }]
        }
        data = json.dumps(payload).encode("utf-8")
        _ALERT_EXECUTOR.submit(_sync_send_discord, target_url, data)
    except Exception as e:
        logger.warning("Failed to queue Discord webhook: %s", e)


def _sync_send_telegram(url: str, payload_data: bytes):
    try:
        req = urllib.request.Request(
            url,
            data=payload_data,
            headers={"Content-Type": "application/json"}
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        logger.warning("Telegram webhook alert failed: %s", e)


def send_telegram_alert(text: str):
    """Send message to Telegram chat on background thread."""
    token, chat_id = get_telegram_creds()
    if not token or not chat_id:
        return
    try:
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": text[:4000],
            "parse_mode": "Markdown"
        }
        data = json.dumps(payload).encode("utf-8")
        _ALERT_EXECUTOR.submit(_sync_send_telegram, url, data)
    except Exception as e:
        logger.warning("Failed to queue Telegram alert: %s", e)


def save_feedback(
    tool_path: str,
    tool_name: str,
    rating: int,
    feedback_type: str = "general",
    comment: str = "",
    user_agent: str = "",
    client_ip: str = ""
) -> int:
    """Save user rating and feedback into SQLite and notify webhooks for all ratings."""
    ip_h = hash_ip(client_ip)
    feedback_id = -1
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO tool_feedback (tool_path, tool_name, rating, feedback_type, comment, user_agent, ip_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (tool_path, tool_name, rating, feedback_type, comment, user_agent, ip_h)
            )
            conn.commit()
            feedback_id = cursor.lastrowid
    except Exception as e:
        logger.error("Error saving feedback: %s", e)
        return -1

    # Send instant alert for ALL user feedback (1 to 5 stars)
    safe_rating = max(1, min(5, rating))
    stars = "⭐" * safe_rating
    disc_fields = [
        {"name": "Tool", "value": f"`{tool_name}` ({tool_path})", "inline": True},
        {"name": "Rating", "value": f"{stars} ({safe_rating}/5)", "inline": True},
        {"name": "Type / Category", "value": feedback_type or "General", "inline": True},
    ]
    if comment:
        disc_fields.append({"name": "User Comment", "value": comment[:500], "inline": False})
    else:
        disc_fields.append({"name": "User Comment", "value": "*(No comment provided)*", "inline": False})

    if safe_rating >= 4:
        color = 0x2ECC71  # Vibrant Green for positive feedback
        title = f"🌟 New Positive Review ({safe_rating}/5 Stars)"
    elif safe_rating == 3:
        color = 0xF1C40F  # Gold/Yellow for neutral
        title = f"💬 New User Review ({safe_rating}/5 Stars)"
    else:
        color = 0xE74C3C  # Red for negative feedback
        title = f"⚠️ Low Rating Feedback ({safe_rating}/5 Stars)"

    send_discord_alert(
        title=title,
        description=f"User submitted a review for **{tool_name}**",
        fields=disc_fields,
        color=color,
        webhook_url=get_discord_feedback_webhook()
    )

    tg_msg = (
        f"🌟 *New User Review* ({safe_rating}/5)\n"
        f"• *Tool:* `{tool_name}` ({tool_path})\n"
        f"• *Rating:* {stars} ({safe_rating}/5)\n"
        f"• *Category:* {feedback_type}\n"
    )
    if comment:
        tg_msg += f"• *Comment:* {comment}\n"
    send_telegram_alert(tg_msg)

    return feedback_id


def _sanitize_file_info(file_info: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Strip client document filenames from telemetry; retain only extension, size, and MIME type."""
    if not file_info or not isinstance(file_info, dict):
        return {}
    raw_name = str(file_info.get("name", "") or "")
    ext = ""
    if "." in raw_name:
        ext = "." + raw_name.rsplit(".", 1)[-1].lower()[:12]
    safe: Dict[str, Any] = {}
    if ext:
        safe["extension"] = ext
    if file_info.get("extension"):
        safe["extension"] = str(file_info["extension"])[:16]
    if file_info.get("size") is not None:
        safe["size"] = file_info.get("size")
    if file_info.get("sizeFormatted"):
        safe["sizeFormatted"] = str(file_info["sizeFormatted"])[:32]
    if file_info.get("type"):
        safe["type"] = str(file_info["type"])[:64]
    return safe


def save_error(
    tool_path: str,
    tool_name: str,
    error_message: str,
    error_stack: str = "",
    file_info: Optional[Dict[str, Any]] = None,
    user_agent: str = "",
    client_ip: str = ""
) -> int:
    """Log an automatic error occurrence into SQLite and alert webhooks (without storing PII filenames)."""
    ip_h = hash_ip(client_ip)
    safe_info = _sanitize_file_info(file_info)
    file_info_json = json.dumps(safe_info)
    error_id = -1
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO error_telemetry (tool_path, tool_name, error_message, error_stack, file_info, user_agent, ip_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (tool_path, tool_name, error_message, error_stack, file_info_json, user_agent, ip_h)
            )
            conn.commit()
            error_id = cursor.lastrowid
    except Exception as e:
        logger.error("Error saving error telemetry: %s", e)
        return -1

    # Filter out client-side dynamic chunk refresh / deployment cache errors
    lower_err = (error_message or "").lower()
    if any(k in lower_err for k in [
        "failed to fetch dynamically imported module",
        "dynamically imported module",
        "loading chunk",
        "chunkloaderror",
        "reading 'default'",
        "_result.default",
        "reading default",
    ]):
        logger.info("Suppressed deployment chunk reload alert from Discord/Telegram: %s", error_message)
        return error_id

    # Send instant crash alert with high-visibility styling
    disc_fields = [
        {"name": "Tool", "value": f"`{tool_name}` ({tool_path})", "inline": True},
        {"name": "Error", "value": f"```{error_message[:300]}```", "inline": False},
    ]
    if safe_info:
        file_desc = f"Type: {safe_info.get('extension', safe_info.get('type', 'N/A'))} | Size: {safe_info.get('sizeFormatted', 'N/A')}"
        disc_fields.append({"name": "File Details", "value": file_desc, "inline": False})

    send_discord_alert(
        title="🚨 Tool Failure / Crash Detected",
        description=f"Error triggered in `{tool_path}`",
        fields=disc_fields,
        color=0xE74C3C,
        webhook_url=get_discord_webhook()
    )

    tg_msg = (
        f"🚨 *Tool Failure Alert!*\n"
        f"• *Tool:* `{tool_name}` ({tool_path})\n"
        f"• *Error:* `{error_message[:200]}`\n"
    )
    if safe_info:
        tg_msg += f"• *File:* {safe_info.get('extension', safe_info.get('type', 'N/A'))} ({safe_info.get('sizeFormatted', 'N/A')})\n"
    send_telegram_alert(tg_msg)

    return error_id


def get_telemetry_summary() -> Dict[str, Any]:
    """Calculate aggregated stats, error rates, and retrieve latest records."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Global counts
            cursor.execute("SELECT COUNT(*), AVG(rating) FROM tool_feedback")
            row = cursor.fetchone()
            total_feedback = row[0] or 0
            avg_rating = round(float(row[1]), 2) if row[1] is not None else 5.0

            cursor.execute("SELECT COUNT(*) FROM error_telemetry")
            total_errors = cursor.fetchone()[0] or 0

            # Last 24 hours errors
            cursor.execute("""
                SELECT COUNT(*) FROM error_telemetry 
                WHERE created_at >= datetime('now', '-1 day')
            """)
            errors_24h = cursor.fetchone()[0] or 0

            # Per-tool statistics (joined feedback + error count)
            cursor.execute("""
                SELECT 
                    f.tool_path,
                    f.tool_name,
                    COUNT(f.id) as feedback_count,
                    ROUND(AVG(f.rating), 2) as avg_rating,
                    COALESCE(e.error_count, 0) as error_count
                FROM tool_feedback f
                LEFT JOIN (
                    SELECT tool_path, COUNT(*) as error_count
                    FROM error_telemetry
                    GROUP BY tool_path
                ) e ON f.tool_path = e.tool_path
                GROUP BY f.tool_path
                ORDER BY error_count DESC, feedback_count DESC
            """)
            tool_stats = [dict(r) for r in cursor.fetchall()]

            # Also include tools that have errors but no feedback yet
            cursor.execute("""
                SELECT 
                    tool_path,
                    tool_name,
                    0 as feedback_count,
                    0 as avg_rating,
                    COUNT(*) as error_count
                FROM error_telemetry
                WHERE tool_path NOT IN (SELECT DISTINCT tool_path FROM tool_feedback)
                GROUP BY tool_path
                ORDER BY error_count DESC
            """)
            orphan_error_tools = [dict(r) for r in cursor.fetchall()]
            all_tool_stats = tool_stats + orphan_error_tools

            # Recent 50 feedbacks
            cursor.execute("""
                SELECT id, tool_path, tool_name, rating, feedback_type, comment, user_agent, created_at
                FROM tool_feedback
                ORDER BY id DESC LIMIT 50
            """)
            recent_feedback = [dict(r) for r in cursor.fetchall()]

            # Recent 50 errors
            cursor.execute("""
                SELECT id, tool_path, tool_name, error_message, error_stack, file_info, user_agent, created_at
                FROM error_telemetry
                ORDER BY id DESC LIMIT 50
            """)
            recent_errors = [dict(r) for r in cursor.fetchall()]

            # Webhook status
            has_discord = bool(get_discord_webhook())
            token, chat_id = get_telegram_creds()
            has_telegram = bool(token and chat_id)

            return {
                "success": True,
                "summary": {
                    "total_feedback": total_feedback,
                    "avg_rating": avg_rating,
                    "total_errors": total_errors,
                    "errors_24h": errors_24h,
                },
                "tool_stats": all_tool_stats,
                "recent_feedback": recent_feedback,
                "recent_errors": recent_errors,
                "integrations": {
                    "discord_configured": has_discord,
                    "telegram_configured": has_telegram,
                }
            }
    except Exception as e:
        logger.error("Failed to generate telemetry summary: %s", e)
        return {
            "success": False,
            "error": str(e),
            "summary": {"total_feedback": 0, "avg_rating": 5.0, "total_errors": 0, "errors_24h": 0},
            "tool_stats": [],
            "recent_feedback": [],
            "recent_errors": [],
            "integrations": {"discord_configured": False, "telegram_configured": False}
        }
