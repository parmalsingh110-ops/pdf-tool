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

logger = logging.getLogger("pdf_tool.telemetry")

# Database Path
BACKEND_DIR = Path(__file__).resolve().parent
DATA_DIR = BACKEND_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "telemetry.db"

# Admin Secret Key (from env or default)
ADMIN_SECRET_KEY = os.environ.get("ADMIN_SECRET_KEY", "pdfadmin2026")

# Webhook URLs (optional - if set, sends instant alerts)
DISCORD_WEBHOOK_URL = os.environ.get("DISCORD_WEBHOOK_URL", "")
DISCORD_FEEDBACK_WEBHOOK_URL = os.environ.get("DISCORD_FEEDBACK_WEBHOOK_URL", "") or DISCORD_WEBHOOK_URL
DISCORD_CRASH_WEBHOOK_URL = os.environ.get("DISCORD_CRASH_WEBHOOK_URL", "") or DISCORD_WEBHOOK_URL
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")


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


def get_admin_passcode() -> str:
    """Return configured passcode (checks DB first, then ADMIN_SECRET_KEY env var, then default)."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM system_settings WHERE key = 'admin_passcode'")
            row = cursor.fetchone()
            if row and row[0]:
                return str(row[0])
    except Exception as e:
        logger.warning("Could not read admin passcode from DB: %s", e)
    return os.environ.get("ADMIN_SECRET_KEY", "pdfadmin2026")


def set_admin_passcode(new_passcode: str) -> bool:
    """Persist new admin passcode into SQLite settings table."""
    if not new_passcode or len(new_passcode.strip()) < 6:
        return False
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO system_settings (key, value, updated_at)
                VALUES ('admin_passcode', ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
            """, (new_passcode.strip(),))
            conn.commit()
            return True
    except Exception as e:
        logger.error("Failed to update admin passcode: %s", e)
        return False


def verify_admin_key(key: str) -> bool:
    """Constant-time comparison of admin passcode to protect against timing attacks."""
    if not key:
        return False
    expected = get_admin_passcode()
    return hmac.compare_digest(key.strip(), expected.strip())


def hash_ip(ip: str) -> str:
    """Anonymize IP address for privacy while allowing spam deduplication."""
    if not ip:
        return ""
    salt = "pdf_tool_privacy_salt"
    return hashlib.sha256(f"{ip}_{salt}".encode()).hexdigest()[:16]


def send_discord_alert(
    title: str,
    description: str,
    fields: List[Dict[str, str]],
    color: int = 0x3498DB,
    webhook_url: Optional[str] = None
):
    """Send formatted embed message to Discord webhook if configured."""
    target_url = (webhook_url or DISCORD_WEBHOOK_URL).strip()
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
        req = urllib.request.Request(
            target_url,
            data=data,
            headers={"Content-Type": "application/json", "User-Agent": "PdfTool-Telemetry"}
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        logger.warning("Discord webhook alert failed: %s", e)


def send_telegram_alert(text: str):
    """Send message to Telegram chat if bot token and chat ID are configured."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        payload = {
            "chat_id": TELEGRAM_CHAT_ID,
            "text": text[:4000],
            "parse_mode": "Markdown"
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"}
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        logger.warning("Telegram webhook alert failed: %s", e)


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
        webhook_url=DISCORD_FEEDBACK_WEBHOOK_URL
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


def save_error(
    tool_path: str,
    tool_name: str,
    error_message: str,
    error_stack: str = "",
    file_info: Optional[Dict[str, Any]] = None,
    user_agent: str = "",
    client_ip: str = ""
) -> int:
    """Log an automatic error occurrence into SQLite and alert webhooks."""
    ip_h = hash_ip(client_ip)
    file_info_json = json.dumps(file_info or {})
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
    if file_info:
        file_desc = f"Name: {file_info.get('name', 'N/A')} | Size: {file_info.get('sizeFormatted', 'N/A')}"
        disc_fields.append({"name": "File Details", "value": file_desc, "inline": False})

    send_discord_alert(
        title="🚨 Tool Failure / Crash Detected",
        description=f"Error triggered in `{tool_path}`",
        fields=disc_fields,
        color=0xE74C3C,
        webhook_url=DISCORD_CRASH_WEBHOOK_URL
    )

    tg_msg = (
        f"🚨 *Tool Failure Alert!*\n"
        f"• *Tool:* `{tool_name}` ({tool_path})\n"
        f"• *Error:* `{error_message[:200]}`\n"
    )
    if file_info:
        tg_msg += f"• *File:* {file_info.get('name', 'N/A')} ({file_info.get('sizeFormatted', 'N/A')})\n"
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
            has_discord = bool(DISCORD_WEBHOOK_URL)
            has_telegram = bool(TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID)

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
