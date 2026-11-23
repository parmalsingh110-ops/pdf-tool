"""
Lightweight Google Cloud Vertex AI Authentication & Priority Routing Helper
---------------------------------------------------------------------------
Enables production Google Cloud Vertex AI (`aiplatform.googleapis.com`) using:
  1. Service Account JSON (`VERTEX_SERVICE_ACCOUNT_JSON` raw/base64 or
     `GOOGLE_APPLICATION_CREDENTIALS` file path) — native OAuth2 Bearer tokens
     via PyJWT + cryptography (zero google-cloud SDK RAM overhead!).
     This routes Gemini traffic directly to your GCP Paid Billing Project so
     Google Cloud / Startup Promotional Credits (e.g. $2,000 Start Tier) and
     enterprise Priority PayGo quotas apply automatically.
  2. Optional Priority Pay-As-You-Go headers (`VERTEX_PRIORITY_PAYGO=true`):
       X-Vertex-AI-LLM-Request-Type: shared
       X-Vertex-AI-LLM-Shared-Request-Type: priority
  3. Optional `PREFER_VERTEX_AI=true` for Vertex AI Express (`AQ.*`) keys.

Security: NEVER logs private keys, access tokens, client emails, or project IDs.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any, Optional

import jwt
import requests

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env")
except Exception:
    pass

logger = logging.getLogger("mediasuite.vertex_auth")

_TOKEN_URI_DEFAULT = "https://oauth2.googleapis.com/token"
_CLOUD_SCOPE = "https://www.googleapis.com/auth/cloud-platform"

_AUTH_LOCK = threading.Lock()
_TOKEN_SESSION: Optional[requests.Session] = None
# Cache OAuth2 token per credential fingerprint: {cred_id: (expires_monotonic, access_token)}
_TOKEN_CACHE: dict[str, tuple[float, str]] = {}


def _get_token_session() -> requests.Session:
    global _TOKEN_SESSION
    with _AUTH_LOCK:
        if _TOKEN_SESSION is None:
            from requests.adapters import HTTPAdapter

            s = requests.Session()
            adapter = HTTPAdapter(pool_connections=2, pool_maxsize=4)
            s.mount("https://", adapter)
            _TOKEN_SESSION = s
        return _TOKEN_SESSION


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def is_priority_paygo_enabled() -> bool:
    """Return True when `VERTEX_PRIORITY_PAYGO=true` is enabled for low-latency Vertex queue."""
    return _env_bool("VERTEX_PRIORITY_PAYGO", False)


def prefer_vertex_express() -> bool:
    """Return True when `PREFER_VERTEX_AI=true` (or Priority PayGo is enabled)."""
    return _env_bool("PREFER_VERTEX_AI", False) or is_priority_paygo_enabled()


def get_priority_headers() -> dict[str, str]:
    """Return Vertex AI Priority PayGo HTTP headers when enabled, else empty dict."""
    if not is_priority_paygo_enabled():
        return {}
    return {
        "X-Vertex-AI-LLM-Request-Type": "shared",
        "X-Vertex-AI-LLM-Shared-Request-Type": "priority",
    }


def _parse_sa_json_blob(raw_str: str) -> Optional[dict[str, Any]]:
    s = (raw_str or "").strip()
    if not s:
        return None
    # Strip accidental surrounding single/double quotes from env UI paste
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ("'", '"') and not s.startswith('{"'):
        s = s[1:-1].strip()
    # 1. Try direct JSON
    if s.startswith("{"):
        try:
            obj = json.loads(s)
            if isinstance(obj, dict) and obj.get("client_email") and obj.get("private_key"):
                return obj
        except Exception:
            pass
    # 2. Try Base64-encoded JSON (recommended for Render/Docker env vars)
    try:
        pad = "=" * (-len(s) % 4)
        decoded = base64.b64decode(s + pad).decode("utf-8", errors="strict").strip()
        if decoded.startswith("{"):
            obj = json.loads(decoded)
            if isinstance(obj, dict) and obj.get("client_email") and obj.get("private_key"):
                return obj
    except Exception:
        pass
    return None


def load_vertex_service_account() -> Optional[dict[str, str]]:
    """
    Resolve configured Google Cloud Service Account metadata from environment:
      - `VERTEX_SERVICE_ACCOUNT_JSON` (raw JSON or base64 JSON)
      - `GOOGLE_APPLICATION_CREDENTIALS` (path to JSON key file)
    Returns dict with keys: `project_id`, `location`, `client_email`, `private_key`,
    `private_key_id`, `token_uri`, `cred_id`; or `None` if not configured.
    """
    if not _env_bool("ALLOW_AI_VISION_OCR", True):
        return None

    info: Optional[dict[str, Any]] = None
    env_json = (os.environ.get("VERTEX_SERVICE_ACCOUNT_JSON") or "").strip()
    if env_json:
        info = _parse_sa_json_blob(env_json)
        if info is None:
            logger.warning("[VertexAuth] VERTEX_SERVICE_ACCOUNT_JSON is set but could not be parsed as valid service account JSON")

    if info is None:
        cred_path = (os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or "").strip()
        if cred_path:
            try:
                p = Path(cred_path)
                if p.is_file():
                    info = _parse_sa_json_blob(p.read_text(encoding="utf-8"))
            except Exception as exc:
                logger.warning(f"[VertexAuth] Could not read GOOGLE_APPLICATION_CREDENTIALS ({type(exc).__name__})")

    if not info:
        return None

    project_id = (
        os.environ.get("VERTEX_PROJECT_ID")
        or os.environ.get("GOOGLE_CLOUD_PROJECT")
        or str(info.get("project_id") or "")
    ).strip()
    client_email = str(info.get("client_email") or "").strip()
    private_key = str(info.get("private_key") or "").replace("\\n", "\n").strip()
    if not project_id or not client_email or "PRIVATE KEY" not in private_key:
        logger.warning("[VertexAuth] Service account missing project_id, client_email, or private_key")
        return None

    location = (os.environ.get("VERTEX_LOCATION") or "global").strip().lower() or "global"
    token_uri = str(info.get("token_uri") or _TOKEN_URI_DEFAULT).strip() or _TOKEN_URI_DEFAULT
    private_key_id = str(info.get("private_key_id") or "").strip()
    cred_id = hashlib.sha256(f"{project_id}|{client_email}|{private_key_id}".encode("utf-8")).hexdigest()[:16]

    return {
        "project_id": project_id,
        "location": location,
        "client_email": client_email,
        "private_key": private_key,
        "private_key_id": private_key_id,
        "token_uri": token_uri,
        "cred_id": cred_id,
    }


def is_vertex_sa_configured() -> bool:
    """True when valid Vertex AI Service Account credentials are configured on this server."""
    return load_vertex_service_account() is not None


def build_vertex_generate_url(project_id: str, location: str, model: str, api_version: str = "v1") -> str:
    """
    Build official Google Cloud Vertex AI `generateContent` REST URL.
    Uses global endpoint (`https://aiplatform.googleapis.com/.../locations/global/...`)
    by default for highest Gemini 2.5 / 3.x availability and dynamic load routing.
    """
    loc = (location or "global").strip().lower()
    host = "aiplatform.googleapis.com" if loc == "global" else f"{loc}-aiplatform.googleapis.com"
    ver = "v1beta1" if api_version == "v1beta1" else "v1"
    return (
        f"https://{host}/{ver}/projects/{project_id}/locations/{loc}"
        f"/publishers/google/models/{model}:generateContent"
    )


def get_vertex_access_token(sa: Optional[dict[str, str]] = None, timeout_s: float = 6.0) -> Optional[str]:
    """
    Mint or return cached OAuth2 Bearer access token for the configured Service Account.
    Tokens are cached in RAM for ~50 minutes (refreshed 2 minutes before expiry).
    """
    cfg = sa or load_vertex_service_account()
    if not cfg:
        return None

    cred_id = cfg["cred_id"]
    now_mono = time.monotonic()
    with _AUTH_LOCK:
        cached = _TOKEN_CACHE.get(cred_id)
        if cached and cached[0] > now_mono + 120.0:
            return cached[1]

    now_epoch = int(time.time())
    claims = {
        "iss": cfg["client_email"],
        "sub": cfg["client_email"],
        "scope": _CLOUD_SCOPE,
        "aud": cfg["token_uri"],
        "iat": now_epoch,
        "exp": now_epoch + 3600,
    }
    headers_jwt: dict[str, str] = {"alg": "RS256", "typ": "JWT"}
    if cfg.get("private_key_id"):
        headers_jwt["kid"] = cfg["private_key_id"]

    try:
        assertion = jwt.encode(claims, cfg["private_key"], algorithm="RS256", headers=headers_jwt)
        if isinstance(assertion, bytes):
            assertion = assertion.decode("ascii")
        resp = _get_token_session().post(
            cfg["token_uri"],
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": assertion,
            },
            timeout=(3.0, max(3.0, float(timeout_s))),
        )
        if not resp.ok:
            logger.warning(f"[VertexAuth] OAuth2 token exchange failed (HTTP {resp.status_code})")
            return None
        data = resp.json()
        token = str(data.get("access_token") or "").strip()
        expires_in = max(300, min(3600, int(data.get("expires_in") or 3500)))
        if not token:
            logger.warning("[VertexAuth] OAuth2 token exchange returned empty access_token")
            return None
        with _AUTH_LOCK:
            _TOKEN_CACHE[cred_id] = (time.monotonic() + float(expires_in), token)
        return token
    except Exception as exc:
        logger.warning(f"[VertexAuth] OAuth2 token minting failed ({type(exc).__name__})")
        return None


def clear_token_cache() -> None:
    """Clear cached OAuth2 tokens (primarily for unit tests)."""
    with _AUTH_LOCK:
        _TOKEN_CACHE.clear()
