"""
PDF Tool — FastAPI Backend v2.1 (Security Hardened)
====================================================
High-quality PDF/Office conversions using Python open-source tools.

Security hardening applied:
  - Upload size limits (MAX_UPLOAD_MB env var)
  - Safe error messages (no raw exception leakage)
  - Rate limiting on all expensive endpoints
  - Security response headers
  - CORS restricted to allowed origins
  - DPI clamping, page-count limits
  - LibreOffice concurrency semaphore
  - Safe filenames in all FileResponse
  - /docs disabled in production (ENABLE_DOCS=false)
  - All print() replaced with structured logger
  - iLovePDF API key strictly server-side (env var only)

Run:
    uvicorn main:app --reload --port 8000
"""

import os
import re
import hmac
import hashlib
import secrets
import shutil
import tempfile
import subprocess
import uuid
import json
import time
import logging
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, Form, BackgroundTasks, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.background import BackgroundTask
from starlette.middleware.base import BaseHTTPMiddleware
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from vision_reconstructor import (
    normalize_input_to_pdf,
    is_pdf_scanned_or_raster,
    build_exact_docx_from_scans,
    build_exact_xlsx_from_scans,
    build_exact_pptx_from_scans,
)
from security_shield import (
    LOAD_BALANCER,
    RESULT_CACHE,
    LoadBalancerAndFirewallMiddleware,
    verify_upload_payload_safety,
)

load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv()

# ─── Logging Setup ─────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("pdf_tool")

# ─── Security Configuration (from environment) ─────────────────
# All limits are configurable via Render Environment Variables.
# Defaults are reasonable for a free-tier public tool.

MAX_UPLOAD_MB: int = int(os.environ.get("MAX_UPLOAD_MB", "50"))
MAX_UPLOAD_BYTES: int = MAX_UPLOAD_MB * 1024 * 1024

MAX_PDF_PAGES: int = int(os.environ.get("MAX_PDF_PAGES", "300"))
MAX_DPI: int = int(os.environ.get("MAX_DPI", "300"))
MIN_DPI: int = 72
MAX_PROCESSING_SECONDS: int = int(os.environ.get("MAX_PROCESSING_SECONDS", "300"))
MAX_IMAGE_PIXELS: int = int(os.environ.get("MAX_IMAGE_PIXELS", "100000000"))

try:
    from PIL import Image as _PILImage
    _PILImage.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
except Exception:
    pass

# Disable /docs and /redoc in production (set ENABLE_DOCS=true to re-enable)
ENABLE_DOCS: bool = os.environ.get("ENABLE_DOCS", "false").lower() == "true"

# CORS: comma-separated list of allowed origins
_raw_origins = os.environ.get(
    "ALLOWED_ORIGINS",
    "https://www.pdfmediasuite.in,https://pdfmediasuite.in,http://localhost:3000,http://localhost:4173,http://127.0.0.1:3000"
)
ALLOWED_ORIGINS_SET = {
    "https://www.pdfmediasuite.in",
    "https://pdfmediasuite.in",
    "http://localhost:3000",
    "http://localhost:4173",
    "http://127.0.0.1:3000",
}
for o in _raw_origins.split(","):
    cleaned = o.strip().strip('"').strip("'").rstrip("/")
    if cleaned:
        ALLOWED_ORIGINS_SET.add(cleaned)
        if "pdfmediasuite.in" in cleaned:
            ALLOWED_ORIGINS_SET.add("https://pdfmediasuite.in")
            ALLOWED_ORIGINS_SET.add("https://www.pdfmediasuite.in")
ALLOWED_ORIGINS: list[str] = list(ALLOWED_ORIGINS_SET)

# LibreOffice concurrency: limit concurrent soffice processes to avoid RAM exhaustion
LIBREOFFICE_SEMAPHORE = asyncio.Semaphore(int(os.environ.get("MAX_CONCURRENT_LIBREOFFICE", "2")))

# ─── Rate Limiter Setup ─────────────────────────────────────────
# Uses genuine client IP behind Cloudflare, Render, and reverse proxies.
def get_real_client_ip(request: Request) -> str:
    """
    Extract genuine client IP behind Cloudflare, Render, or reverse proxies.
    Falls back to request.client.host if no proxy headers are present.
    """
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip and cf_ip.strip():
        return cf_ip.strip()

    true_client_ip = request.headers.get("true-client-ip")
    if true_client_ip and true_client_ip.strip():
        return true_client_ip.strip()

    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        parts = [p.strip() for p in forwarded_for.split(",") if p.strip()]
        if parts:
            return parts[0]

    if request.client and request.client.host:
        return request.client.host

    return "127.0.0.1"


limiter = Limiter(key_func=get_real_client_ip)


# ─── Secret redaction (API keys can NEVER reach logs, Discord/Telegram alerts or responses) ───
_SECRET_PATTERNS = [
    re.compile(r"AIza[0-9A-Za-z\-_]{20,}"),
    re.compile(r"\bAQ\.[0-9A-Za-z\-_.]{20,}"),
    re.compile(r"sk-ant-[0-9A-Za-z\-_]{16,}"),
    re.compile(r"\bsk-[0-9A-Za-z\-_]{20,}"),
]
_SECRET_KEEP_PREFIX_PATTERNS = [
    re.compile(r"(?i)((?:x-goog-api-key|x-api-key|authorization)\s*[:=]\s*)['\"]?(?:Bearer\s+)?[^\s'\",}]+"),
    re.compile(r"(?i)([?&](?:key|api_key|apikey|token)=)[^&\s'\"]+"),
]


def redact_secrets(text: Any) -> str:
    """Scrub provider keys / auth headers / env-key values from any string before it is logged or sent out."""
    s = str(text)
    for env_name in ("GEMINI_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "ILOVEPDF_SECRET_KEY",
                     "TELEGRAM_BOT_TOKEN", "ADMIN_SECRET_KEY"):
        val = os.environ.get(env_name, "").strip()
        if len(val) >= 8 and val in s:
            s = s.replace(val, "[REDACTED_KEY]")
    for pat in _SECRET_PATTERNS:
        s = pat.sub("[REDACTED_KEY]", s)
    for pat in _SECRET_KEEP_PREFIX_PATTERNS:
        s = pat.sub(lambda m: m.group(1) + "[REDACTED_KEY]", s)
    return s


class _SecretRedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            rendered = record.getMessage()
            cleaned = redact_secrets(rendered)
            if cleaned != rendered:
                record.msg = cleaned
                record.args = ()
        except Exception:
            pass
        return True


for _lg_name in ("", "uvicorn", "uvicorn.error", "uvicorn.access", "pdf_tool", "mediasuite.ai_vision"):
    _lg = logging.getLogger(_lg_name)
    _lg.addFilter(_SecretRedactingFilter())
    for _h in _lg.handlers:
        _h.addFilter(_SecretRedactingFilter())


def server_ai_quota_ok(request: Request, user_key_supplied: bool, strict_local: bool) -> bool:
    """
    Per-client daily quota for AI requests that would spend the OPERATOR's server key.
    Returns False -> caller silently switches to the strong local engines (no error, no waiting).
    User-supplied keys and local-only runs are never counted.
    """
    if strict_local or user_key_supplied:
        return True
    try:
        from ai_vision_refiner import consume_client_ai_quota, get_server_vision_status
        if not get_server_vision_status().get("enhanced_available"):
            return True
        return consume_client_ai_quota(get_real_client_ip(request))
    except Exception:
        return True

@asynccontextmanager
async def _app_lifespan(app_instance: FastAPI):
    """Startup & background janitor: sweeps stale temp/spool files so abandoned uploads never linger."""
    def _sweep_old_files():
        now = time.time()
        try:
            if TEMP_DIR.exists():
                for p in TEMP_DIR.iterdir():
                    try:
                        if now - p.stat().st_mtime > 1800:  # 30 minutes
                            if p.is_dir():
                                shutil.rmtree(p, ignore_errors=True)
                            else:
                                p.unlink(missing_ok=True)
                    except Exception:
                        pass
        except Exception:
            pass
        try:
            if PRINT_DROP_SPOOL_DIR.exists():
                for folder in PRINT_DROP_SPOOL_DIR.iterdir():
                    if folder.is_dir():
                        try:
                            if now - folder.stat().st_mtime > 1200:
                                shutil.rmtree(folder, ignore_errors=True)
                        except Exception:
                            pass
        except Exception:
            pass

    _sweep_old_files()

    async def _periodic_janitor():
        while True:
            try:
                await asyncio.sleep(60)
                _prune_expired_print_rooms()
                _sweep_old_files()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.warning(f"[Janitor] Sweep notice: {exc}")

    janitor_task = asyncio.create_task(_periodic_janitor())
    try:
        yield
    finally:
        janitor_task.cancel()
        try:
            await janitor_task
        except asyncio.CancelledError:
            pass


# ─── FastAPI App ─────────────────────────────────────────────────
docs_url = "/docs" if ENABLE_DOCS else None
redoc_url = "/redoc" if ENABLE_DOCS else None
openapi_url = "/openapi.json" if ENABLE_DOCS else None

app = FastAPI(
    title="PDF Tool Backend",
    version="2.1.0",
    docs_url=docs_url,
    redoc_url=redoc_url,
    openapi_url=openapi_url,
    lifespan=_app_lifespan,
)

# Attach rate limiter to app state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(Exception)
async def _global_crash_shield_handler(request: Request, exc: Exception):
    """
    Last-resort crash boundary: ensures no unhandled exception (including MemoryError)
    ever kills the worker or strips CORS headers.
    """
    if isinstance(exc, MemoryError):
        import gc
        gc.collect()
    err_type = type(exc).__name__
    err_msg = redact_secrets(str(exc))[:300]
    logger.error(f"[CRASH-SHIELD] path={request.url.path} type={err_type} msg={err_msg}")
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Server encountered a temporary processing error and recovered safely. Please try again.",
            "recovered": True,
        },
    )


# ─── Middleware Stack ───────────────────────────────────────────

# 1. GZip compression
app.add_middleware(GZipMiddleware, minimum_size=500)

# 2. Multi-Lane Priority Load Balancer, Virtual Waiting Room & Edge WAF
app.add_middleware(LoadBalancerAndFirewallMiddleware, ip_resolver=get_real_client_ip)

# 3. CORS — restricted to known production origins & subdomains (outermost so 429/503 carry CORS headers)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"^https:\/\/([a-zA-Z0-9-]+\.)*pdfmediasuite\.in$",
    allow_methods=["GET", "POST", "DELETE", "HEAD", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-Admin-Key",
        "X-Room-Token",
        "X-Request-Id",
        "X-Idempotency-Key",
        "Accept",
        "Origin",
        "X-Requested-With",
        "Cache-Control",
    ],
    expose_headers=[
        "X-Match-Count",
        "X-Request-Id",
        "X-Load-Lane",
        "X-Queue-Wait-Ms",
        "X-Cache",
        "X-Orig-Bytes",
        "X-Compressed-Bytes",
        "Retry-After",
    ],
    allow_credentials=False,
)


# 4. Security Headers Middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adds security response headers to every response."""

    # CSP for the FastAPI backend responses.
    # The backend only serves JSON / binary file downloads (no HTML pages),
    # so we lock it down very tightly.  The permissive CSP for the React SPA
    # lives in index.html (served by Vite/Render static hosting).
    _STRICT_CSP = (
        "default-src 'none'; "
        "script-src  'none'; "
        "style-src   'none'; "
        "img-src     'none'; "
        "connect-src 'self'; "
        "frame-ancestors 'none'; "
        "form-action 'self';"
    )
    _HTML_CSP = (
        "default-src 'self'; "
        "script-src  'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "style-src   'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "img-src     'self' data: https://fastapi.tiangolo.com; "
        "connect-src 'self'; "
        "frame-ancestors 'none'; "
        "form-action 'self';"
    )

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path.startswith("/share-target") or path in ("/docs", "/redoc", "/openapi.json"):
            response.headers["Content-Security-Policy"] = self._HTML_CSP
        else:
            response.headers["Content-Security-Policy"] = self._STRICT_CSP
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=(), payment=(), usb=()"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
        response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
        response.headers["Origin-Agent-Cluster"] = "?1"
        # HSTS: check both direct scheme and reverse-proxy X-Forwarded-Proto (Render / Cloudflare)
        forwarded_proto = request.headers.get("x-forwarded-proto", "").lower()
        if request.url.scheme == "https" or "https" in forwarded_proto:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        return response


app.add_middleware(SecurityHeadersMiddleware)


# 4. Bandwidth Logging Middleware — logs IP, route, method, status, response size.
class BandwidthLoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)

        # We must NOT buffer the response in memory (bad for large PDFs).
        # Instead, we wrap the streaming iterator to count bytes as they go out.
        original_iterator = response.body_iterator

        async def logging_iterator():
            total_bytes = 0
            try:
                async for chunk in original_iterator:
                    total_bytes += len(chunk)
                    yield chunk
            finally:
                elapsed_ms = round((time.perf_counter() - start) * 1000, 1)
                size_kb = round(total_bytes / 1024, 2)
                # Safely extract client IP — prefer X-Forwarded-For (Render proxy)
                forwarded = request.headers.get("x-forwarded-for", "")
                # Only use the first IP from X-Forwarded-For to prevent IP spoofing
                client_ip = forwarded.split(",")[0].strip() if forwarded else (
                    request.client.host if request.client else "unknown"
                )
                try:
                    import telemetry as _telemetry_mod
                    masked_ip = _telemetry_mod.hash_ip(client_ip) or "anon"
                except Exception:
                    masked_ip = hashlib.sha256(client_ip.encode("utf-8")).hexdigest()[:12]
                logger.info(
                    f"[BANDWIDTH] ip:{masked_ip} | {request.method} {request.url.path} "
                    f"→ {response.status_code} | {size_kb}KB | {elapsed_ms}ms"
                )

        response.body_iterator = logging_iterator()
        return response


app.add_middleware(BandwidthLoggerMiddleware)

TEMP_DIR = Path(tempfile.gettempdir()) / "pdf_tool_backend"
TEMP_DIR.mkdir(exist_ok=True)


# ─── Security Helpers ──────────────────────────────────────────

async def safe_read_upload(file: UploadFile) -> bytes:
    """
    Read uploaded file into bytes with a hard size cap.
    Raises HTTP 413 if the file exceeds MAX_UPLOAD_BYTES.
    Avoids reading the entire file when the Content-Length header already
    reveals the file is too large.
    """
    # Quick check: if Content-Length header is present and already too large, reject early
    content_length = file.size  # FastAPI sets this from Content-Length
    if content_length is not None and content_length > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is {MAX_UPLOAD_MB} MB."
        )

    # Read in chunks so we can enforce the limit even without a Content-Length header
    chunks: list[bytes] = []
    total = 0
    chunk_size = 1024 * 64  # 64 KB chunks
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum allowed size is {MAX_UPLOAD_MB} MB."
            )
        chunks.append(chunk)
    raw_data = b"".join(chunks)
    verify_upload_payload_safety(raw_data, getattr(file, "filename", "") or "")
    return raw_data


def safe_filename(user_filename: str | None, fallback: str = "output") -> str:
    """
    Sanitize a user-supplied filename for use in Content-Disposition headers.
    - Strips path separators (../  /  \\)
    - Keeps only alphanumeric, dash, underscore, dot
    - Truncates to 200 characters
    - Falls back to 'output' if result is empty
    """
    if not user_filename:
        return fallback
    # Take only the basename — no directory traversal possible
    name = Path(user_filename).name
    # Strip non-safe characters
    name = re.sub(r"[^\w.\-]", "_", name)
    # Truncate
    name = name[:200]
    return name if name else fallback


def safe_error(e: Exception, endpoint: str = "") -> HTTPException:
    """
    Logs the real exception server-side (including stack details) and dispatches
    alerts to Discord and Telegram via telemetry.
    Returns a generic HTTP 500 that does NOT expose internal state to the user.
    """
    err_type = type(e).__name__
    err_msg = redact_secrets(str(e))[:500]
    logger.error(f"[ERROR] endpoint={endpoint} type={err_type} msg={err_msg}")

    try:
        import telemetry
        telemetry.save_error(
            tool_path=f"/{endpoint.lstrip('/')}",
            tool_name=f"Backend: {endpoint}",
            error_message=f"[{err_type}] {err_msg}",
            error_stack=redact_secrets(str(e))
        )
    except Exception as tel_err:
        logger.error(f"[TELEMETRY] Failed to dispatch error alert: {tel_err}")

    return HTTPException(
        status_code=500,
        detail="Unable to process this file. Please try again. If the problem persists, try a different or smaller file."
    )


def check_pdf_page_count(path: Path, endpoint: str = "") -> int:
    """
    Open a PDF and check its page count against MAX_PDF_PAGES.
    Raises HTTP 400 if too many pages. Returns page count on success.
    """
    try:
        import pymupdf as fitz
        doc = fitz.open(str(path))
        pages = len(doc)
        doc.close()
        if pages > MAX_PDF_PAGES:
            raise HTTPException(
                status_code=400,
                detail=f"PDF has too many pages ({pages}). Maximum allowed is {MAX_PDF_PAGES} pages."
            )
        return pages
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"[PAGE-COUNT] Could not check page count for {path.name}: {e}")
        return 0  # If we can't read it, let the downstream handler deal with it


# ─── General Helpers ───────────────────────────────────────────

def temp_path(suffix: str) -> Path:
    return TEMP_DIR / f"{uuid.uuid4().hex}{suffix}"


def cleanup(*paths: Path):
    for p in paths:
        try:
            if p.exists():
                shutil.rmtree(p) if p.is_dir() else p.unlink()
        except Exception:
            pass


def hex_to_rgb(hx: str):
    hx = str(hx).lstrip("#")
    if len(hx) == 6:
        return tuple(int(hx[i:i+2], 16) / 255.0 for i in (0, 2, 4))
    return (0, 0, 0)


def has_non_latin(text: str) -> bool:
    return any(ord(c) > 0x00FF for c in text)


# ─── Root & Health ─────────────────────────────────────────────

@app.api_route("/", methods=["GET", "HEAD"])
def read_root(request: Request):
    if request.method == "HEAD":
        return Response(status_code=200)
    # Minimal root response — avoids large JSON payload draining bandwidth
    return {"status": "ok", "version": "2.1.0"}


# Ultra-lightweight health check — supports both HEAD (Uptime Robot) and GET.
# HEAD request: server sends ONLY headers (zero body bytes transferred).
# GET request: returns a tiny fixed-size JSON body.
# Rate-limited to 30 requests/minute per IP to block bots.
@app.api_route("/health", methods=["GET", "HEAD"])
@limiter.limit("30/minute")
def health(request: Request, response: Response):
    if request.method == "HEAD":
        # Zero bytes sent — perfect for Uptime Robot pings
        response.status_code = 200
        return Response(status_code=200)
    # GET: return a tiny JSON (only ~15 bytes after GZip)
    return JSONResponse(content={"status": "ok"}, status_code=200)


@app.get("/api/system/health")
@limiter.limit("30/minute")
def system_load_health(request: Request):
    """Live multi-lane load balancer, virtual waiting queue, and cache metrics."""
    return JSONResponse(content=LOAD_BALANCER.snapshot(), status_code=200)


# Web Share Target Fallback: hydrates shared files into client CacheStorage + IndexedDB if SW was bypassed
@app.api_route("/share-target", methods=["GET", "POST"])
@limiter.limit("15/minute")
async def share_target_fallback(request: Request):
    from fastapi.responses import RedirectResponse, HTMLResponse
    import base64
    import json

    if request.method != "POST":
        return RedirectResponse(url="/scan-to-print?from_share=true", status_code=303)

    try:
        MAX_SHARE_FILE_BYTES = 25 * 1024 * 1024  # 25 MB max per shared file
        MAX_SHARE_FILES = 10
        MAX_TOTAL_SHARE_BYTES = 50 * 1024 * 1024
        form = await request.form()
        extracted_files = []
        total_bytes = 0
        for _, value in form.multi_items():
            if len(extracted_files) >= MAX_SHARE_FILES:
                break
            if hasattr(value, "read") and hasattr(value, "filename"):
                raw_bytes = await value.read(MAX_SHARE_FILE_BYTES + 1024)
                if raw_bytes and len(raw_bytes) <= MAX_SHARE_FILE_BYTES and (total_bytes + len(raw_bytes)) <= MAX_TOTAL_SHARE_BYTES:
                    total_bytes += len(raw_bytes)
                    extracted_files.append({
                        "name": safe_filename(getattr(value, "filename", None), f"Shared_Document_{int(time.time())}.pdf"),
                        "type": getattr(value, "content_type", None) or "application/pdf",
                        "size": len(raw_bytes),
                        "b64": base64.b64encode(raw_bytes).decode("ascii"),
                    })

        if not extracted_files:
            return RedirectResponse(url="/scan-to-print?from_share=true", status_code=303)

        payload_json = json.dumps({
            "files": extracted_files,
            "title": str(form.get("title") or ""),
            "text": str(form.get("text") or ""),
            "timestamp": int(time.time() * 1000),
        }).replace("<", "\\u003c")

        html = f"""<!doctype html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Loading Shared Document…</title></head>
<body style="margin:0;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,sans-serif;">
  <div>Preparing Shared Document…</div>
  <script>
    (async function() {{
      try {{
        var data = {payload_json};
        var now = data.timestamp || Date.now();
        var materialized = [];
        for (var i = 0; i < (data.files || []).length; i++) {{
          var item = data.files[i];
          var binStr = atob(item.b64);
          var bytes = new Uint8Array(binStr.length);
          for (var j = 0; j < binStr.length; j++) bytes[j] = binStr.charCodeAt(j);
          materialized.push({{ name: item.name, type: item.type || 'application/pdf', size: bytes.byteLength, lastModified: now, buffer: bytes.buffer }});
        }}
        if (materialized.length > 0 && typeof caches !== 'undefined') {{
          var cache = await caches.open('pms-share-cache-v2');
          var metaItems = [];
          for (var k = 0; k < materialized.length; k++) {{
            var mf = materialized[k];
            await cache.put('/__pms_shared_file__/' + k, new Response(mf.buffer, {{ status: 200, headers: {{ 'Content-Type': mf.type }} }}));
            metaItems.push({{ index: k, name: mf.name, type: mf.type, size: mf.size, lastModified: now }});
          }}
          await cache.put('/__pms_shared_meta__', new Response(JSON.stringify({{ id: 'latest_share', title: data.title || '', text: data.text || '', timestamp: now, items: metaItems }}), {{ status: 200, headers: {{ 'Content-Type': 'application/json' }} }}));
        }}
      }} catch (e) {{}}
      window.location.replace('/scan-to-print?from_share=true&share_ts=' + Date.now());
    }})();
  </script>
</body>
</html>"""
        return HTMLResponse(content=html, status_code=200)
    except Exception:
        return RedirectResponse(url="/scan-to-print?from_share=true", status_code=303)



# ─── AUTO-OCR HELPER ────────────────────────────────────────────
# Smart scan detection: checks text density per page, not just total chars.
# If >= 50% pages are mostly blank of text → treat as scanned.

def is_pdf_scanned(inp_path: Path) -> bool:
    """
    Returns True if the PDF is a scanned/image-based document, including
    OCR-layered scanned PDFs (`3 Tr`, `GlyphLessFont`, full-page camera scans).
    """
    return is_pdf_scanned_or_raster(inp_path)


async def run_hybrid_ocr(
    inp_path: Path,
    out_path: Path,
    lang: str = "eng+hin",
    deskew: bool = True,
    rotate: bool = True,
    force_ocr: bool = False,
    strict_local: bool = False,
    engine_mode: str = "pro_local",
    clean_watermarks: bool = True,
):
    """
    Pro Hybrid OCR Pipeline:
    - Primary Local AI Engine (`pro_local`): PyMuPDF composite rendering (resolves multi-layer OCG/CropBox/Rotate)
      + OpenCV watermark/background cleaner + RapidOCR (ONNX PP-OCRv4) + Tesseract Devanagari TSV fusion
      + PyMuPDF `render_mode=3` / `morph` sub-point invisible text overlay.
    - Never calls external iLovePDF API when strict_local=True, ALLOW_EXTERNAL_ILOVEPDF_OCR=false,
      Hindi ("hin") is requested, or engine_mode is "pro_local" / "ocrmypdf".
    - Supports optional `engine_mode="hybrid"` / `"ilovepdf"` when explicitly requested and keys exist.
    """
    from fastapi.concurrency import run_in_threadpool

    allow_external = os.environ.get("ALLOW_EXTERNAL_ILOVEPDF_OCR", "true").strip().lower() not in ("0", "false", "no")
    ilovepdf_pub = os.environ.get("ILOVEPDF_PUBLIC_KEY", "").strip()
    ilovepdf_sec = os.environ.get("ILOVEPDF_SECRET_KEY", "").strip()
    mode = (engine_mode or "pro_local").strip().lower()

    use_ilovepdf = (
        mode in ("hybrid", "ilovepdf")
        and not strict_local
        and allow_external
        and "hin" not in lang.lower()
        and bool(ilovepdf_pub and ilovepdf_sec)
    )

    if use_ilovepdf:
        logger.info("[OCR] Using iLovePDF API (explicit hybrid mode, server-side keys)")
        def run_ilovepdf():
            import concurrent.futures

            def _do_ilovepdf():
                from ilovepdf import PdfOcrTask
                task = PdfOcrTask(public_key=ilovepdf_pub, secret_key=ilovepdf_sec)
                task.add_file(str(inp_path))
                task.execute()

                out_dir = Path(tempfile.gettempdir()) / uuid.uuid4().hex
                out_dir.mkdir(exist_ok=True)
                try:
                    task.download(str(out_dir))

                    downloaded_files = list(out_dir.iterdir())
                    if not downloaded_files:
                        raise RuntimeError("iLovePDF returned no output files")
                    shutil.move(str(downloaded_files[0]), str(out_path))
                finally:
                    shutil.rmtree(out_dir, ignore_errors=True)

                if not out_path.exists() or out_path.stat().st_size == 0:
                    raise RuntimeError("iLovePDF produced an empty output file")

            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(_do_ilovepdf)
                try:
                    future.result(timeout=90)
                except concurrent.futures.TimeoutError:
                    raise RuntimeError("iLovePDF OCR timed out after 90 seconds")

        try:
            await run_in_threadpool(run_ilovepdf)
            logger.info("[OCR] iLovePDF succeeded")
            return True
        except Exception as e:
            logger.error(f"[OCR] iLovePDF API failed: {type(e).__name__}. Falling back to Pro Local OCR.")
            if out_path.exists():
                out_path.unlink(missing_ok=True)

    # Try Pro Multi-Layer Local OCR (RapidOCR ONNX + OpenCV Watermark Cleaner + PyMuPDF 3-Tr Pixel-Lock)
    if mode != "ocrmypdf":
        try:
            from ocr_engine import make_searchable_pdf_pro

            logger.info(f"[OCR] Running Pro Multi-Layer Local OCR (lang={lang}, clean_watermarks={clean_watermarks})")
            pages_done, words_done = await run_in_threadpool(
                make_searchable_pdf_pro,
                inp_path,
                out_path,
                lang,
                force_ocr,
                clean_watermarks,
            )
            if out_path.exists() and out_path.stat().st_size > 0 and words_done > 0:
                logger.info(f"[OCR] Pro Local OCR succeeded ({pages_done} pages, {words_done} words)")
                return True
            logger.warning("[OCR] Pro Local OCR produced 0 words, falling back to OCRmyPDF.")
            out_path.unlink(missing_ok=True)
        except Exception as pro_err:
            logger.warning(f"[OCR] Pro Local OCR fallback triggered ({type(pro_err).__name__}: {pro_err})")
            out_path.unlink(missing_ok=True)

    logger.info("[OCR] Using local OCRmyPDF engine")
    try:
        import ocrmypdf
    except ImportError:
        raise RuntimeError("ocrmypdf is not installed. Run: pip install ocrmypdf")

    def run_ocrmypdf():
        from ocr_engine import resolve_ocr_lang

        ocrmypdf_lang = resolve_ocr_lang(lang)
        if ocrmypdf_lang == "auto":
            ocrmypdf_lang = "eng"
        ocrmypdf.ocr(
            str(inp_path), str(out_path), language=ocrmypdf_lang,
            deskew=deskew, rotate_pages=rotate,
            skip_text=not force_ocr, force_ocr=force_ocr,
            output_type="pdf",
            optimize=1,
            progress_bar=False
        )

    await run_in_threadpool(run_ocrmypdf)
    if not out_path.exists() or out_path.stat().st_size == 0:
        raise RuntimeError("Local OCRmyPDF produced no output")
    logger.info("[OCR] Local OCRmyPDF succeeded")
    return True


def validate_ocr_output(original_pdf: Path, ocr_pdf: Path) -> tuple[bool, str]:
    """
    Validate the OCR output PDF against the original.
    Returns (True, "") on success, or (False, reason) on failure.
    Checks:
      1. File exists
      2. File size > 0
      3. Opens without error
      4. Page count matches original
      5. At least one page has a meaningful text layer
      6. No page renders as a completely blank (all-zero) pixmap
    """
    try:
        import pymupdf as fitz

        # 1. Existence
        if not ocr_pdf.exists():
            return False, "OCR output file does not exist"

        # 2. Size
        if ocr_pdf.stat().st_size == 0:
            return False, "OCR output file is empty (0 bytes)"

        # 3 & 4. Openability + page count
        try:
            ocr_doc = fitz.open(str(ocr_pdf))
        except Exception as open_err:
            return False, f"OCR output cannot be opened: {type(open_err).__name__}"

        try:
            orig_doc = fitz.open(str(original_pdf))
            orig_pages = len(orig_doc)
            orig_doc.close()
        except Exception:
            orig_pages = None

        ocr_pages = len(ocr_doc)
        if ocr_pages == 0:
            ocr_doc.close()
            return False, "OCR output PDF has 0 pages"

        if orig_pages is not None and ocr_pages != orig_pages:
            ocr_doc.close()
            return False, (
                f"OCR output page count ({ocr_pages}) does not match "
                f"original ({orig_pages})"
            )

        # 5. Text layer check — at least some text must be present across all pages
        total_text_len = 0
        blank_page_count = 0
        for page in ocr_doc:
            page_text = page.get_text("text").strip()
            total_text_len += len(page_text)

            # 6. Pixmap non-blank check (render at low DPI to save memory)
            try:
                pix = page.get_pixmap(dpi=36)
                if pix.width > 0 and pix.height > 0:
                    # Check if all pixels are white/near-white (sum of non-255 bytes)
                    import struct
                    samples = pix.samples
                    # samples is a bytes object — check if all bytes are 255 (white)
                    non_white = sum(1 for b in samples if b < 250)
                    if non_white == 0:
                        blank_page_count += 1
            except Exception:
                pass  # Pixmap failure is not fatal for validation

        ocr_doc.close()

        if total_text_len < 10:
            return False, (
                f"OCR output has no meaningful text layer "
                f"(only {total_text_len} chars extracted across all pages)"
            )

        if blank_page_count == ocr_pages:
            return False, "All pages in OCR output render as blank"

        return True, ""

    except Exception as e:
        return False, f"Validation error: {type(e).__name__}: {str(e)[:200]}"


async def ensure_auto_ocr(inp_path: Path, force: bool = False, strict_local: bool = False) -> Path:
    """
    If the PDF is scanned (or force=True), run hybrid OCR and return the path
    to a validated OCR PDF.

    SAFE ARCHITECTURE:
    - OCR is written to a TEMPORARY file (never overwrites the original until validated)
    - OCR output is fully validated before the original is replaced
    - If OCR fails or validation fails, raises HTTP 422 with a user-friendly message
    - NEVER silently returns the original scanned PDF to converters
    """
    if not force and not is_pdf_scanned(inp_path):
        logger.info(f"[Auto-OCR] PDF has text layer, OCR skipped: {inp_path.name}")
        return inp_path

    logger.info(f"[Auto-OCR] Scanned PDF detected, running hybrid OCR: {inp_path.name}")

    # Write OCR output to a NEW temp file — do NOT overwrite the original yet
    out_path = inp_path.with_name(inp_path.stem + "_ocr_candidate.pdf")
    if out_path.exists():
        out_path.unlink(missing_ok=True)

    ocr_succeeded = False
    ocr_error_detail = ""

    try:
        await run_hybrid_ocr(inp_path, out_path, force_ocr=force, strict_local=strict_local)
        ocr_succeeded = True
    except Exception as e:
        ocr_error_detail = f"{type(e).__name__}: {str(e)[:300]}"
        logger.error(f"[Auto-OCR] OCR processing failed: {ocr_error_detail}")

    if not ocr_succeeded:
        # Clean up any partial output
        out_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=422,
            detail=(
                "Unable to extract readable text from this scanned PDF. "
                "OCR processing failed. Please try a clearer scan or a different file."
            )
        )

    # Validate the OCR output BEFORE touching the original
    logger.info(f"[Auto-OCR] Validating OCR output: {out_path.name}")
    valid, reason = validate_ocr_output(inp_path, out_path)

    if not valid:
        logger.error(f"[Auto-OCR] OCR output validation failed: {reason}")
        out_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=422,
            detail=(
                "Unable to extract readable text from this scanned PDF. "
                "The OCR process completed but produced no usable text layer. "
                "Please try another PDF or a clearer scan."
            )
        )

    logger.info(f"[Auto-OCR] Validation passed. Replacing original with OCR output.")
    # Only NOW replace the original with the validated OCR output
    shutil.move(str(out_path), str(inp_path))
    return inp_path


def remove_scanned_page_backgrounds_from_docx(docx_path: str, pdf_path: str):
    """
    Safely removes ONLY the full-page scanned background images from a DOCX generated by pdf2docx,
    while preserving legitimate media (logos, photos, tables) using localized image fallbacks,
    and making the OCR text visible securely.
    """
    temp_dir = None
    try:
        import zipfile
        import tempfile
        import os
        import shutil
        import copy
        import xml.etree.ElementTree as ET
        import pymupdf as fitz
        import cv2
        import numpy as np

        logger.info(f"[RemoveBackgrounds] Analyzing {pdf_path} for non-text regions...")
        
        # Phase 1: Detect non-text regions using PyMuPDF + OpenCV
        doc = fitz.open(pdf_path)
        regions_by_page = {}
        for page_num in range(len(doc)):
            page = doc[page_num]
            text_blocks = page.get_text("blocks")
            text_rects = []
            for b in text_blocks:
                if b[6] == 0:
                    r = fitz.Rect(b[:4])
                    r.x0 = max(0, r.x0 - 5)
                    r.y0 = max(0, r.y0 - 5)
                    r.x1 += 5
                    r.y1 += 5
                    text_rects.append(r)
            
            pix = page.get_pixmap(dpi=150)
            img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
            if pix.n == 4:
                img = cv2.cvtColor(img, cv2.COLOR_RGBA2GRAY)
            elif pix.n == 3:
                img = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
            else:
                img = np.copy(img)
                
            thresh = cv2.adaptiveThreshold(img, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2)
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
            dilated = cv2.dilate(thresh, kernel, iterations=2)
            contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            non_text_rects = []
            page_area = page.rect.get_area()
            
            for cnt in contours:
                x, y, w, h = cv2.boundingRect(cnt)
                x_pt = x * 72.0 / 150.0
                y_pt = y * 72.0 / 150.0
                w_pt = w * 72.0 / 150.0
                h_pt = h * 72.0 / 150.0
                
                if w_pt < 15 or h_pt < 15:
                    continue
                    
                rect = fitz.Rect(x_pt, y_pt, x_pt + w_pt, y_pt + h_pt)
                area = rect.get_area()
                if area == 0 or area > page_area * 0.90:
                    continue
                    
                overlap_area = 0
                for t_rect in text_rects:
                    intersect = rect.intersect(t_rect)
                    if not intersect.is_empty:
                        overlap_area += intersect.get_area()
                        
                if overlap_area / area > 0.4:
                    continue
                non_text_rects.append(rect)
                
            merged = []
            for r in non_text_rects:
                if not merged:
                    merged.append(r)
                    continue
                has_merged = False
                for i, m in enumerate(merged):
                    if r.intersects(m):
                        merged[i] = m.include_rect(r)
                        has_merged = True
                        break
                if not has_merged:
                    merged.append(r)
            regions_by_page[page_num] = merged
        doc.close()

        # Phase 2: Process the DOCX
        temp_dir = tempfile.mkdtemp()
        with zipfile.ZipFile(docx_path, 'r') as zip_ref:
            zip_ref.extractall(temp_dir)
            
        doc_xml_path = os.path.join(temp_dir, 'word', 'document.xml')
        if not os.path.exists(doc_xml_path):
            return

        namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
                      'v': 'urn:schemas-microsoft-com:vml',
                      'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
                      'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
                      'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture',
                      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
                      'mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
                      'w14': 'http://schemas.microsoft.com/office/word/2010/wordml',
                      'wp14': 'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing'}
                      
        # CRITICAL FIX: Register ALL namespaces from the raw XML before parsing.
        # Python's xml.etree.ElementTree only knows about explicitly registered
        # namespaces. Any unknown namespace prefix (e.g. w15, w16, wps, o, m, etc.)
        # gets renamed to ns0:, ns1:, ... which makes Word reject the file with
        # "XML data is invalid according to the schema".
        import re as _re_ns
        with open(doc_xml_path, 'rb') as _fns:
            _raw_xml_ns = _fns.read().decode('utf-8', errors='replace')
        # Register every xmlns:prefix="uri" found in the document
        for _ns_pfx, _ns_uri in _re_ns.findall(r'xmlns:(\w[\w.-]*)="([^"]+)"', _raw_xml_ns):
            ET.register_namespace(_ns_pfx, _ns_uri)
        # Register default namespace if present
        _dm = _re_ns.search(r'(?<![:\w])xmlns="([^"]+)"', _raw_xml_ns)
        if _dm:
            ET.register_namespace('', _dm.group(1))
        # Also register the known namespaces from our dict (redundant but safe)
        for prefix, uri in namespaces.items():
            ET.register_namespace(prefix, uri)

        tree = ET.parse(doc_xml_path)
        root = tree.getroot()
        
        default_w, default_h = 11906, 16838
        for sect in root.findall('.//w:sectPr', namespaces):
            pgSz = sect.find('w:pgSz', namespaces)
            if pgSz is not None:
                w_attr = pgSz.get('{' + namespaces['w'] + '}w')
                h_attr = pgSz.get('{' + namespaces['w'] + '}h')
                if w_attr: default_w = int(w_attr)
                if h_attr: default_h = int(h_attr)
                
        W_pt = default_w / 20.0
        H_pt = default_h / 20.0
        page_area_pt = W_pt * H_pt
        
        changed = False
        removed_image_rIds = set()
        
        for parent in root.findall('.//w:drawing/..', namespaces):
            for drawing in parent.findall('w:drawing', namespaces):
                is_background = False
                coverage = 0.0
                
                extent = drawing.find('.//wp:extent', namespaces)
                if extent is not None:
                    cx = int(extent.get('cx', 0)) / 12700.0
                    cy = int(extent.get('cy', 0)) / 12700.0
                    img_area = cx * cy
                    coverage = img_area / page_area_pt
                    
                    if coverage >= 0.85:
                        blip = drawing.find('.//a:blip', namespaces)
                        if blip is not None:
                            is_background = True
                            
                if is_background:
                    logger.info(f"[RemoveBackgrounds] Background scan identified (coverage {coverage:.2f}). Applying fallbacks.")
                    blip = drawing.find('.//a:blip', namespaces)
                    if blip is not None:
                        embed_id = blip.get('{' + namespaces['r'] + '}embed')
                        if embed_id:
                            removed_image_rIds.add(embed_id)
                            
                    # Get regions for page 0 (assuming simple mapping for single background)
                    # For multi-page docs, pdf2docx usually outputs sequentially. We just use all regions.
                    # To be safer, we merge all non-text regions from all pages.
                    all_regions = []
                    for rs in regions_by_page.values():
                        all_regions.extend(rs)
                        
                    max_docpr_id = 1000
                    for d in root.findall('.//wp:docPr', namespaces):
                        try:
                            max_docpr_id = max(max_docpr_id, int(d.get('id', '0')))
                        except: pass
                        
                    for r in all_regions:
                        # PyMuPDF Rect normalizes to x0 <= x1, y0 <= y1
                        x_pt, y_pt, x1_pt, y1_pt = r.x0, r.y0, r.x1, r.y1
                        w_pt = x1_pt - x_pt
                        h_pt = y1_pt - y_pt
                        
                        fallback = copy.deepcopy(drawing)
                        
                        # UNIQUE ID fix for MS Word rendering bug
                        max_docpr_id += 1
                        docPr = fallback.find('.//wp:docPr', namespaces)
                        if docPr is not None:
                            docPr.set('id', str(max_docpr_id))
                            docPr.set('name', f'Fallback_{max_docpr_id}')
                            
                        # CRITICAL: Also update pic:cNvPr ID to prevent "unreadable content" corruption
                        cNvPr = fallback.find('.//pic:cNvPr', namespaces)
                        if cNvPr is not None:
                            cNvPr.set('id', str(max_docpr_id))
                            cNvPr.set('name', f'Fallback_Pic_{max_docpr_id}')
                        
                        # Adjust extent
                        ext = fallback.find('.//wp:extent', namespaces)
                        if ext is not None:
                            ext.set('cx', str(int(w_pt * 12700)))
                            ext.set('cy', str(int(h_pt * 12700)))
                        
                        spPr = fallback.find('.//pic:spPr', namespaces)
                        if spPr is not None:
                            xfrm = spPr.find('.//a:xfrm', namespaces)
                            if xfrm is not None:
                                ext2 = xfrm.find('.//a:ext', namespaces)
                                if ext2 is not None:
                                    ext2.set('cx', str(int(w_pt * 12700)))
                                    ext2.set('cy', str(int(h_pt * 12700)))
                        
                        # Adjust position
                        posH = fallback.find('.//wp:positionH/wp:posOffset', namespaces)
                        if posH is not None: posH.text = str(int(x_pt * 12700))
                        posV = fallback.find('.//wp:positionV/wp:posOffset', namespaces)
                        if posV is not None: posV.text = str(int(y_pt * 12700))
                        
                        # Add crop
                        blipFill = fallback.find('.//pic:blipFill', namespaces)
                        if blipFill is not None:
                            srcRect = ET.Element('{http://schemas.openxmlformats.org/drawingml/2006/main}srcRect')
                            srcRect.set('l', str(max(0, int(x_pt / W_pt * 100000))))
                            srcRect.set('t', str(max(0, int(y_pt / H_pt * 100000))))
                            srcRect.set('r', str(max(0, int((W_pt - x1_pt) / W_pt * 100000))))
                            srcRect.set('b', str(max(0, int((H_pt - y1_pt) / H_pt * 100000))))
                            blipFill.insert(1, srcRect)
                        
                        parent.append(fallback)
                    
                    parent.remove(drawing)
                    changed = True
                        
        if removed_image_rIds:
            for p in root.findall('.//w:p', namespaces):
                # 1. Remove paragraph level shading because pdf2docx uses it to mimic scan background
                pPr = p.find('w:pPr', namespaces)
                if pPr is not None:
                    p_shd = pPr.find('w:shd', namespaces)
                    if p_shd is not None:
                        pPr.remove(p_shd)
                        changed = True
                        
                # 2. Force text visibility unconditionally
                for r in p.findall('.//w:r', namespaces):
                    rPr = r.find('w:rPr', namespaces)
                    if rPr is not None:
                        vanish = rPr.find('w:vanish', namespaces)
                        color = rPr.find('w:color', namespaces)
                        shd = rPr.find('w:shd', namespaces)
                        
                        if vanish is not None:
                            rPr.remove(vanish)
                            changed = True
                            
                        # If color is white/hidden, force to auto
                        if color is not None:
                            val = color.get('{' + namespaces['w'] + '}val')
                            if val in ('FFFFFF', 'white', 'F2F2F2', 'f2f2f2'):
                                color.set('{' + namespaces['w'] + '}val', 'auto')
                                changed = True
                        else:
                            # If no color tag, sometimes it defaults to hidden if inherited. Ensure auto.
                            pass
                            
                        if shd is not None:
                            rPr.remove(shd)
                            changed = True

        if not changed:
            # Nothing was modified — skip XML rewrite and ZIP rebuild entirely.
            # The original DOCX file is perfectly valid as-is.
            shutil.rmtree(temp_dir, ignore_errors=True)
            logger.info(f"[RemoveBackgrounds] No changes needed, original DOCX preserved.")
            return

        tree.write(doc_xml_path, xml_declaration=True, encoding='UTF-8')
        # CRITICAL FIX: ET writes <?xml version='1.0' encoding='UTF-8'?> (no standalone)
        # OOXML / Word requires: <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        with open(doc_xml_path, 'rb') as _fw:
            _fc = _fw.read()
        _fc = _re_ns.sub(
            rb"<\?xml[^?]*\?>",
            b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            _fc, count=1
        )
        
        # CRITICAL FIX 2 for MS Word Line 0 Column 0 Schema Error:
        # ElementTree strips xmlns declarations that it thinks are "unused".
        # But 'w14', 'wp14', etc. are referenced inside the mc:Ignorable="w14 wp14" string value.
        # Word crashes instantly if these are missing. 
        # Fix: Overwrite the generated <w:document> tag with the exact original one!
        _orig_root_match = _re_ns.search(r"<w:document[^>]+>", _raw_xml_ns)
        if _orig_root_match:
            _orig_root_bytes = _orig_root_match.group(0).encode('utf-8')
            _fc = _re_ns.sub(rb"<w:document[^>]+>", _orig_root_bytes, _fc, count=1)

        with open(doc_xml_path, 'wb') as _fw:
            _fw.write(_fc)
            
        with zipfile.ZipFile(docx_path, 'w', zipfile.ZIP_DEFLATED) as zip_out:
            for root_dir, dirs, files in os.walk(temp_dir):
                for file in files:
                    file_path = os.path.join(root_dir, file)
                    arcname = os.path.relpath(file_path, temp_dir)
                    # CRITICAL FIX for Windows: OpenXML strictly requires forward slashes
                    # for ZIP entry names. os.path.relpath uses backslashes on Windows,
                    # which causes MS Word to completely fail reading the document structure.
                    zip_out.write(file_path, arcname.replace('\\', '/'))
        logger.info(f"[RemoveBackgrounds] Successfully processed {docx_path}")
    except Exception as e:
        logger.error(f"[RemoveBackgrounds] Failed: {e}")
    finally:
        if temp_dir:
            try:
                import shutil as _shutil_cleanup
                _shutil_cleanup.rmtree(temp_dir, ignore_errors=True)
            except Exception:
                pass

# ─── Helper: Table detection for scanned PDFs ─────────────────


def _cluster_blocks_into_visual_rows(blocks):
    """
    Group PyMuPDF text blocks into visual rows based on Y-coordinate overlap.

    For scanned PDFs, OCR (Tesseract) often reads one wide table row as
    2–3 horizontal blocks that share the same Y position. This function
    clusters those blocks so all blocks in the same physical row are merged
    before cell-splitting.

    Returns: list of (row_y0, row_y1, [(x0, text), ...]) sorted top→bottom.
    Each inner list is already sorted left→right by x0.
    """
    import re

    text_blocks = []
    for b in blocks:
        if b[6] != 0:
            continue
        raw = b[4]
        if not raw or not raw.strip():
            continue
        raw = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]', '', raw)
        text = raw.strip()
        if text:
            text_blocks.append((b[0], b[1], b[2], b[3], text))  # x0,y0,x1,y1,text

    if not text_blocks:
        return []

    text_blocks.sort(key=lambda b: b[1])   # top → bottom

    used = [False] * len(text_blocks)
    rows = []

    for i, (x0, y0, x1, y1, text) in enumerate(text_blocks):
        if used[i]:
            continue

        row_cells = [(x0, text)]
        row_y0, row_y1 = y0, y1
        used[i] = True

        for j, (ox0, oy0, ox1, oy1, otext) in enumerate(text_blocks):
            if used[j]:
                continue
            # Two blocks share a visual row if their Y ranges overlap
            # by ≥40% of the shorter block's height.
            y_overlap = min(y1, oy1) - max(y0, oy0)
            short_h = min(max(y1 - y0, 1), max(oy1 - oy0, 1))
            if y_overlap / short_h >= 0.4:
                row_cells.append((ox0, otext))
                row_y0 = min(row_y0, oy0)
                row_y1 = max(row_y1, oy1)
                used[j] = True

        row_cells.sort(key=lambda c: c[0])          # left → right
        rows.append((row_y0, row_y1, row_cells))

    rows.sort(key=lambda r: r[0])                    # top → bottom
    return rows


def _try_build_word_table(doc, rows_of_cells) -> bool:
    """
    Write a Word table to *doc* from a 2-D list of cell strings.
    First row is treated as the header (bold).
    Returns True on success, False if data is too sparse to render as a table.
    """
    from docx.shared import Pt

    rows_of_cells = [r for r in rows_of_cells if any(c.strip() for c in r)]
    if not rows_of_cells:
        return False
    max_cols = max(len(r) for r in rows_of_cells)
    if max_cols < 2:
        return False

    normalized = [list(r) + [''] * (max_cols - len(r)) for r in rows_of_cells]

    table = doc.add_table(rows=len(normalized), cols=max_cols)
    try:
        table.style = 'Table Grid'
    except Exception:
        pass

    for r_idx, row_cells in enumerate(normalized):
        for c_idx, cell_text in enumerate(row_cells):
            cell = table.cell(r_idx, c_idx)
            para = cell.paragraphs[0]
            run = para.add_run(cell_text[:500])
            run.font.name = 'Calibri'
            run.font.size = Pt(10)
            if r_idx == 0:
                run.bold = True

    return True


# ─── Helper: Build clean DOCX from OCR'd PDF ─────────────────


def _build_clean_docx_from_ocr_pdf(pdf_path: Path, out_path: Path):
    """
    Advanced Vision-Reconstruction Engine for Scanned/OCR PDFs:
    1. Table Detection: Uses PyMuPDF's built-in vector grid & line analyzer (find_tables).
       Extracts structured 2D table matrices and formats them as real Word Tables.
    2. Spatial Exclusion: Table cell text is isolated and not duplicated as paragraphs.
    3. Typography & Hierarchy: Analyzes span-level bounding box heights and median font size
       to automatically reconstruct Heading 1 (Title), Heading 2 (Subtitle), and Body text.
    4. Text Alignment: Detects center and right-aligned text based on physical page geometry.
    5. Clean XML: Strips invalid control characters ensuring 100% Microsoft Word and Apple Pages compatibility.
    6. Zero Regression: Digital PDFs remain on their separate pdf2docx pipeline.
    """
    import re
    import statistics
    import pymupdf as fitz  # PyMuPDF
    from docx import Document
    from docx.shared import Pt, Inches, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    def _clean_str(s: str) -> str:
        if not s:
            return ''
        return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]', '', str(s)).strip()

    doc = Document()

    for section in doc.sections:
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1)
        section.right_margin = Inches(1)

    style = doc.styles['Normal']
    style.font.name = 'Calibri'
    style.font.size = Pt(11)

    pdf = fitz.open(str(pdf_path))
    total_pages = len(pdf)

    for page_num, page in enumerate(pdf):
        if page_num > 0:
            doc.add_page_break()

        page_width = page.rect.width
        page_has_content = False

        # ── Step 1: Detect Real Table Grids via Computer Vision / Line Geometry ─
        tab_rects = []
        found_tables = []
        try:
            tabs = page.find_tables()
            if tabs and tabs.tables:
                for tab in tabs.tables:
                    mat = tab.extract()
                    # Filter valid tables with at least 1 non-empty cell
                    if mat and any(any(c and str(c).strip() for c in r) for r in mat):
                        found_tables.append((tab.bbox[1], 'table', mat))
                        tab_rects.append(fitz.Rect(tab.bbox))
        except Exception as tab_err:
            logger.warning(f"[OCR-DOCX] PyMuPDF find_tables notice: {tab_err}")

        # ── Step 2: Extract text spans outside of tables ────────────────────────
        page_dict = page.get_text('dict')
        sizes = []
        for b in page_dict.get('blocks', []):
            if 'lines' in b:
                for l in b['lines']:
                    for s in l['spans']:
                        txt = s.get('text', '').strip()
                        if txt:
                            sizes.append(s.get('size', 11.0))
        med_size = statistics.median(sizes) if sizes else 11.0

        flow_items = list(found_tables)

        for b in page_dict.get('blocks', []):
            if 'lines' in b:
                for l in b['lines']:
                    l_rect = fitz.Rect(l['bbox'])
                    # Skip text inside detected table bounds to avoid duplicates
                    if any(l_rect.intersects(tr) for tr in tab_rects):
                        continue

                    raw_txt = ' '.join(s.get('text', '').strip() for s in l['spans'] if s.get('text', '').strip())
                    clean_txt = _clean_str(raw_txt)
                    if not clean_txt:
                        continue

                    max_s = max(s.get('size', 11.0) for s in l['spans'])
                    is_bold = any((s.get('flags', 0) & 16 != 0) or ('bold' in s.get('font', '').lower()) for s in l['spans'])
                    is_italic = any((s.get('flags', 0) & 2 != 0) or ('italic' in s.get('font', '').lower()) for s in l['spans'])

                    flow_items.append((l['bbox'][1], 'text', {
                        'text': clean_txt,
                        'size': max_s,
                        'bold': is_bold,
                        'italic': is_italic,
                        'x0': l['bbox'][0],
                        'x1': l['bbox'][2],
                        'y0': l['bbox'][1],
                        'y1': l['bbox'][3]
                    }))

        # ── Step 3: Fallback if no tables or text spans detected ────────────────
        if not flow_items:
            blocks = page.get_text("blocks", sort=True)
            visual_rows = _cluster_blocks_into_visual_rows(blocks)
            for (row_y0, row_y1, row_cells) in visual_rows:
                merged = ' '.join(text for _, text in row_cells)
                pipe_count = merged.count('|')
                if pipe_count >= 2:
                    s = merged.strip().strip('|')
                    cells = [_clean_str(c) for c in s.split('|') if c.strip()]
                    flow_items.append((row_y0, 'table', [cells]))
                else:
                    first_x0 = row_cells[0][0] if row_cells else 0
                    last_x1  = max(x for x, _ in row_cells) if row_cells else page_width
                    flow_items.append((row_y0, 'text', {
                        'text': _clean_str(merged),
                        'size': 11.0,
                        'bold': False,
                        'italic': False,
                        'x0': first_x0,
                        'x1': last_x1,
                        'y0': row_y0,
                        'y1': row_y1
                    }))

        # ── Step 4: Sort all elements in natural top-to-bottom reading order ────
        flow_items.sort(key=lambda x: x[0])

        prev_y1 = None
        for item in flow_items:
            if item[1] == 'table':
                mat = item[2]
                clean_rows = [[_clean_str(c) for c in r] for r in mat if any(c and str(c).strip() for c in r)]
                if clean_rows:
                    built = _try_build_word_table(doc, clean_rows)
                    if built:
                        page_has_content = True
                        prev_y1 = None
            else:
                tdata = item[2]
                txt = tdata['text']
                if not txt:
                    continue

                sz = tdata['size']
                x0, x1 = tdata['x0'], tdata['x1']
                ly0, ly1 = tdata['y0'], tdata['y1']
                mid_x = (x0 + x1) / 2
                line_w = x1 - x0

                # Paragraph spacing heuristic
                if prev_y1 is not None and (ly0 - prev_y1) > 18:
                    gap = doc.add_paragraph()
                    gap.paragraph_format.space_after = Pt(2)
                prev_y1 = ly1

                para = doc.add_paragraph()

                # Visual Hierarchy detection
                is_h1 = (sz >= med_size * 1.35 and len(txt) < 120) or (line_w > page_width * 0.45 and txt.isupper() and len(txt) < 80)
                is_h2 = (sz >= med_size * 1.18 and not is_h1 and len(txt) < 140)

                if is_h1:
                    para.paragraph_format.space_before = Pt(10)
                    para.paragraph_format.space_after = Pt(4)
                    run = para.add_run(txt)
                    run.bold = True
                    run.font.size = Pt(15)
                elif is_h2:
                    para.paragraph_format.space_before = Pt(6)
                    para.paragraph_format.space_after = Pt(3)
                    run = para.add_run(txt)
                    run.bold = True
                    run.font.size = Pt(13)
                else:
                    para.paragraph_format.space_before = Pt(0)
                    para.paragraph_format.space_after = Pt(3.5)
                    run = para.add_run(txt)
                    run.font.size = Pt(11)
                    run.bold = tdata['bold']
                    run.italic = tdata['italic']

                # Horizontal alignment heuristic
                if abs(mid_x - page_width / 2) < page_width * 0.12 and line_w < page_width * 0.8:
                    para.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
                elif x0 > page_width * 0.58:
                    para.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.RIGHT

                page_has_content = True

        if not page_has_content:
            note = doc.add_paragraph(f"[Page {page_num + 1}: No text could be extracted]")
            note.paragraph_format.space_after = Pt(6)
            run = note.runs[0]
            run.italic = True
            run.font.color.rgb = RGBColor(0x80, 0x80, 0x80)

    pdf.close()

    if total_pages == 0:
        doc.add_paragraph("[This PDF appears to be empty or could not be read.]")

    doc.save(str(out_path))
    logger.info(
        f"[CleanDOCX] Built advanced vision DOCX from {total_pages} page(s): "
        f"{out_path.stat().st_size / 1024:.1f}KB"
    )


def _inspect_digital_pdf_complexity(pdf_path: Path) -> dict[str, int]:
    """
    Fast PyMuPDF structural scan (<10ms/page) of a born-digital PDF to detect:
    - `raster_assets`: distinct placed raster images (photos, signatures, stamps, logos)
    - `vector_clusters`: dense non-gridline vector drawing clusters (vector signatures/QRs/crests)
    - `raster_text_boxes`: large text-free embedded raster boxes likely containing OCR-needed text
    - `side_by_side_assets`: images positioned horizontally beside text or tables
    - `src_chars`, `src_tbl_rows`, `page_count`
    """
    import pymupdf as fitz

    stats = {
        "page_count": 0,
        "src_chars": 0,
        "src_tbl_rows": 0,
        "raster_assets": 0,
        "vector_clusters": 0,
        "raster_text_boxes": 0,
        "side_by_side_assets": 0,
        "corrupt_cmap_chars": 0,
        "rotated_watermark_chars": 0,
        "bilingual_two_col_pages": 0,
    }
    _corrupt_re = re.compile(r"[\u0130-\u02ff\ufffd]")
    _legacy_font_re = re.compile(r"(?:krutidev|devlys|chanakya|kundli|shusha|aps-?c|agra|walkman)", re.IGNORECASE)
    doc = fitz.open(str(pdf_path))
    try:
        stats["page_count"] = len(doc)
        for _p in doc:
            p_w = max(1.0, float(_p.rect.width))
            p_area = max(1.0, float(p_w * _p.rect.height))
            stats["src_chars"] += len(re.sub(r"\s+", "", _p.get_text("text") or ""))
            try:
                _pdict = _p.get_text("dict")
                _left_col = 0
                _right_col = 0
                for _blk in _pdict.get("blocks", []):
                    if _blk.get("type") != 0:
                        continue
                    for _ln in _blk.get("lines", []):
                        _dir = _ln.get("dir", (1.0, 0.0))
                        _diag = abs(float(_dir[0])) < 0.90 and abs(float(_dir[1])) < 0.90
                        _lb = _ln.get("bbox")
                        for _sp in _ln.get("spans", []):
                            _st = (_sp.get("text") or "").strip()
                            if not _st:
                                continue
                            _col = int(_sp.get("color", 0) or 0)
                            _r, _g, _b = (_col >> 16) & 0xFF, (_col >> 8) & 0xFF, _col & 0xFF
                            _sz = float(_sp.get("size", 10.0) or 10.0)
                            _fn = str(_sp.get("font", "") or "")
                            if _diag and (min(_r, _g, _b) >= 145 or _sz >= 13.0):
                                stats["rotated_watermark_chars"] += len(re.sub(r"\s+", "", _st))
                                continue
                            _bad_cnt = len(_corrupt_re.findall(_st))
                            if _bad_cnt:
                                stats["corrupt_cmap_chars"] += _bad_cnt
                            elif _legacy_font_re.search(_fn) and len(re.sub(r"\s+", "", _st)) >= 3:
                                stats["corrupt_cmap_chars"] += len(re.sub(r"\s+", "", _st))
                        if not _diag and _lb and len(_lb) >= 4:
                            if _lb[2] <= p_w * 0.49 and _lb[0] >= p_w * 0.04:
                                _left_col += 1
                            elif _lb[0] >= p_w * 0.50 and _lb[2] <= p_w * 0.96:
                                _right_col += 1
                if _left_col >= 8 and _right_col >= 8:
                    stats["bilingual_two_col_pages"] += 1
            except Exception:
                pass
            tbl_rects = []
            try:
                _ft = _p.find_tables()
                for _t in (_ft.tables if _ft else []):
                    if getattr(_t, "row_count", 0) >= 3 and getattr(_t, "col_count", 0) >= 3:
                        stats["src_tbl_rows"] += int(_t.row_count)
                    if getattr(_t, "bbox", None):
                        tbl_rects.append(fitz.Rect(_t.bbox))
            except Exception:
                pass

            words = _p.get_text("words") or []
            seen_boxes: list[fitz.Rect] = []
            for info in _p.get_image_info(xrefs=False):
                bbox = info.get("bbox")
                if not bbox or len(bbox) < 4:
                    continue
                r = fitz.Rect(bbox) & _p.rect
                if r.is_empty or r.width < 18.0 or r.height < 14.0:
                    continue
                r_area = float(r.width * r.height)
                if r_area > p_area * 0.74 or (r.width > _p.rect.width * 0.65 and r.height < 14.0):
                    continue
                # Deduplicate overlapping placements
                dup = False
                for sb in seen_boxes:
                    inter = (r & sb)
                    inter_a = 0.0 if inter.is_empty else float(inter.width * inter.height)
                    union_a = max(1e-6, r_area + float(sb.width * sb.height) - inter_a)
                    if (inter_a / union_a) > 0.70:
                        dup = True
                        break
                if dup:
                    continue
                seen_boxes.append(r)
                stats["raster_assets"] += 1

                inside_words = sum(
                    1
                    for wt in words
                    if len(wt) >= 4
                    and r.x0 - 2 <= ((wt[0] + wt[2]) * 0.5) <= r.x1 + 2
                    and r.y0 - 2 <= ((wt[1] + wt[3]) * 0.5) <= r.y1 + 2
                )
                img_aspect = float(r.width / max(1.0, r.height))
                # Detect boxes large enough to hold pasted screenshot tables/clauses (skip portrait photos)
                if (
                    inside_words == 0
                    and r.height >= 40.0
                    and (
                        (r.width >= 165.0 and r_area >= 8000.0)
                        or (img_aspect >= 1.35 and r.width >= 125.0 and r_area >= 5500.0 and not (r.height <= 65.0 and r.width <= 190.0))
                    )
                ):
                    stats["raster_text_boxes"] += 1

                # Detect horizontal neighbor overlap with text lines or tables
                has_side_text = any(
                    len(wt) >= 4
                    and (min(r.y1, wt[3]) - max(r.y0, wt[1])) >= min(r.height, wt[3] - wt[1]) * 0.35
                    and (wt[2] <= r.x0 - 6.0 or wt[0] >= r.x1 + 6.0)
                    for wt in words
                )
                has_side_tbl = any(
                    (min(r.y1, tr.y1) - max(r.y0, tr.y0)) >= min(r.height, tr.height) * 0.35
                    and (tr.x1 <= r.x0 - 6.0 or tr.x0 >= r.x1 + 6.0)
                    for tr in tbl_rects
                )
                if has_side_text or has_side_tbl:
                    stats["side_by_side_assets"] += 1

            # Check non-table dense vector clusters (e.g. vector signature/logo/QR strokes)
            try:
                non_line_paths = 0
                for dr in _p.get_drawings():
                    dr_rect = dr.get("rect")
                    if not dr_rect:
                        continue
                    rr = fitz.Rect(dr_rect)
                    if rr.width < 2.0 or rr.height < 2.0 or (rr.width > _p.rect.width * 0.45 and rr.height < 6.0):
                        continue
                    if any(rr.intersects(tr) for tr in tbl_rects):
                        continue
                    if rr.width < _p.rect.width * 0.35 and rr.height < _p.rect.height * 0.30:
                        non_line_paths += 1
                if non_line_paths >= 14:
                    stats["vector_clusters"] += 1
            except Exception:
                pass
    finally:
        doc.close()
    return stats


def _form_str(val, default: Optional[str] = None) -> Optional[str]:
    """Resolve FastAPI `Form(...)` defaults cleanly when handlers are invoked both via HTTP and directly in Python."""
    if isinstance(val, str):
        return val
    if val is None:
        return default
    raw = getattr(val, "default", default)
    return raw if isinstance(raw, str) else default


def _form_bool(val, default: bool = False) -> bool:
    if isinstance(val, bool):
        return val
    raw = getattr(val, "default", default)
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, str):
        return raw.strip().lower() in ("1", "true", "yes")
    return default


@app.post("/convert/pdf-to-word")
@limiter.limit("10/minute")
async def pdf_to_word(
    request: Request,
    file: UploadFile = File(...),
    force_ocr: bool = Form(False),
    strict_local: bool = Form(False),
    layer_mode: str = Form("clean_real"),
    ai_provider: str = Form("auto"),
    ai_api_key: Optional[str] = Form(None),
    lang: str = Form("auto"),
):
    inp = temp_path(".pdf")
    out = temp_path(".docx")
    try:
        raw_bytes = await safe_read_upload(file)
        inp, was_image = normalize_input_to_pdf(raw_bytes, file.filename, inp)
        check_pdf_page_count(inp, "pdf-to-word")

        eff_strict = _form_bool(strict_local, False)
        eff_layer_raw = _form_str(layer_mode, "clean_real") or "clean_real"
        eff_provider = _form_str(ai_provider, "auto") or "auto"
        raw_ai_key = _form_str(ai_api_key, None)
        eff_lang = _form_str(lang, "auto") or "auto"
        eff_layer_mode = "layered_replica" if eff_layer_raw.strip().lower() == "layered_replica" else "clean_real"
        eff_strict = eff_strict or not server_ai_quota_ok(request, bool(raw_ai_key and raw_ai_key.strip()), eff_strict)
        eff_ai_key = None if eff_strict else (raw_ai_key.strip() if raw_ai_key else None)

        # ── Path detection ────────────────────────────────────────────────────
        was_scanned = was_image or force_ocr or is_pdf_scanned(inp)

        if was_scanned:
            # ══════════════════════════════════════════════════════════════════
            # PATH A — SCANNED / OCR-LAYERED / IMAGE DOCUMENT
            # 3-Layer CV + Global Multi-Script OCR + Smart-Gated Vision AI
            # ══════════════════════════════════════════════════════════════════
            logger.info(f"[PDF2Word] Scanned/OCR/Image input detected → 3-Layer Vision DOCX ({eff_layer_mode}, lang={eff_lang})")
            await run_in_threadpool(
                build_exact_docx_from_scans,
                inp,
                out,
                eff_lang,
                200,
                eff_layer_mode,
                eff_ai_key,
                eff_provider,
                eff_strict,
            )

        else:
            # ══════════════════════════════════════════════════════════════════
            # PATH B — TEXT-BASED PDF  (digital/born-digital documents)
            # PRIMARY:  pdf2docx (verified for text, tables, AND images/assets)
            # UPGRADE:  Digital Vision + Transparent-Asset + Local/AI Hybrid Builder
            # ══════════════════════════════════════════════════════════════════
            digital_stats = await run_in_threadpool(_inspect_digital_pdf_complexity, inp)
            need_image_ocr_upgrade = digital_stats.get("raster_text_boxes", 0) >= 1
            need_cmap_or_layout_upgrade = (
                digital_stats.get("corrupt_cmap_chars", 0) >= 4
                or (digital_stats.get("rotated_watermark_chars", 0) >= 10 and digital_stats.get("src_tbl_rows", 0) >= 4)
                or (
                    digital_stats.get("raster_assets", 0) >= 2
                    and digital_stats.get("side_by_side_assets", 0) >= 1
                    and digital_stats.get("src_tbl_rows", 0) >= 4
                )
            )
            pdf2docx_ok = False
            if need_image_ocr_upgrade or need_cmap_or_layout_upgrade:
                logger.info(
                    f"[PDF2Word] Digital PDF complexity (raster_boxes={digital_stats.get('raster_text_boxes', 0)}, "
                    f"corrupt_cmap={digital_stats.get('corrupt_cmap_chars', 0)}, "
                    f"wm={digital_stats.get('rotated_watermark_chars', 0)}, "
                    f"tbl_rows={digital_stats.get('src_tbl_rows', 0)}, "
                    f"side_assets={digital_stats.get('side_by_side_assets', 0)}) "
                    "→ routing directly to Digital Vision + Local/AI Reconstructor"
                )
            else:
                try:
                    from pdf2docx import Converter
                    logger.info("[PDF2Word] Text PDF → pdf2docx (primary path)")

                    def _run_pdf2docx():
                        _cv = Converter(str(inp))
                        _cv.convert(
                            str(out),
                            multi_processing=False,
                            # Fine-tuned thresholds for accurate layout reconstruction
                            line_overlap_threshold=0.9,       # merge lines that overlap ≥90%
                            line_break_width_ratio=0.5,       # conservative line-break detection
                            min_svg_gap_dx=15.0,              # SVG shape gap tolerance
                            connected_border_tolerance=3.0,   # table border snapping
                            page_margin_factor=0.02,          # ignore very small margins
                            float_image_ignorable_gap=5.0,    # float image merge gap
                            line_break_free_space_ratio=0.1,  # paragraph break sensitivity
                        )
                        _cv.close()

                    await run_in_threadpool(_run_pdf2docx)

                    # Self-Verify pdf2docx output against source PDF text, tables & embedded visual assets
                    if out.exists() and out.stat().st_size > 4500:
                        def _verify_pdf2docx() -> bool:
                            try:
                                from docx import Document as _VDoc
                                from docx.oxml.ns import qn as _v_qn
                                _vd = _VDoc(str(out))
                                _WT = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"
                                docx_chars = sum(len((el.text or "").strip()) for el in _vd.element.iter(_WT))
                                docx_tbl_rows = sum(len(t.rows) for t in _vd.tables)
                                total_all_tbls = sum(1 for _ in _vd.element.body.iter(_v_qn("w:tbl")))
                                has_nested_tbl = total_all_tbls > len(_vd.tables)
                                docx_drawings = sum(1 for _ in _vd.element.iter(_v_qn("w:drawing")))
                                docx_media = sum(
                                    1 for p in _vd.part.package.parts if "/word/media/" in str(getattr(p, "partname", ""))
                                )
                                eff_docx_imgs = max(docx_drawings, docx_media)

                                src_chars = int(digital_stats.get("src_chars", 0))
                                src_tbl_rows = int(digital_stats.get("src_tbl_rows", 0))
                                expected_assets = int(digital_stats.get("raster_assets", 0))
                                vector_clusters = int(digital_stats.get("vector_clusters", 0))
                                side_assets = int(digital_stats.get("side_by_side_assets", 0))

                                if has_nested_tbl and (side_assets >= 1 or expected_assets >= 1):
                                    logger.warning(
                                        "[PDF2Word] Self-verify: pdf2docx wrapped content in nested tables beside visual assets; upgrading to Digital Vision Builder"
                                    )
                                    return False

                                if src_chars >= 40 and docx_chars < src_chars * 0.65:
                                    logger.warning(
                                        f"[PDF2Word] Self-verify: pdf2docx char coverage low ({docx_chars}/{src_chars}); upgrading to Digital Vision Builder"
                                    )
                                    return False
                                if src_tbl_rows >= 4 and docx_tbl_rows < max(2, int(src_tbl_rows * 0.55)):
                                    logger.warning(
                                        f"[PDF2Word] Self-verify: pdf2docx table rows incomplete ({docx_tbl_rows}/{src_tbl_rows}); upgrading to Digital Vision Builder"
                                    )
                                    return False
                                if expected_assets >= 1 and eff_docx_imgs < max(1, int(expected_assets * 0.6)):
                                    logger.warning(
                                        f"[PDF2Word] Self-verify: pdf2docx dropped visual assets ({eff_docx_imgs}/{expected_assets}); upgrading to Digital Vision Builder"
                                    )
                                    return False
                                if vector_clusters >= 1 and eff_docx_imgs == 0 and docx_tbl_rows == 0:
                                    logger.warning(
                                        "[PDF2Word] Self-verify: vector graphics/signatures uncaptured by pdf2docx; upgrading to Digital Vision Builder"
                                    )
                                    return False
                                if side_assets >= 1 and len(_vd.tables) >= 4 and len(_vd.paragraphs) < 2:
                                    logger.warning(
                                        "[PDF2Word] Self-verify: heavy wrapper table nesting around side assets; upgrading to Digital Vision Builder"
                                    )
                                    return False
                                return True
                            except Exception:
                                return True

                        pdf2docx_ok = await run_in_threadpool(_verify_pdf2docx)
                    else:
                        logger.warning("[PDF2Word] pdf2docx output too small/empty, upgrading to Digital Vision Builder")

                except Exception as pdf2docx_err:
                    logger.warning(f"[PDF2Word] pdf2docx failed: {pdf2docx_err} — falling back to Digital Vision Builder")

            if not pdf2docx_ok:
                # ── AUTO-UPGRADE PATH: Transparent Native Assets + Exact Styles + Local/AI Vision ──
                logger.info("[PDF2Word] Running Digital Vision + Native Asset & Layout Reconstructor")
                try:
                    await run_in_threadpool(
                        build_exact_docx_from_scans,
                        inp,
                        out,
                        eff_lang,
                        200,
                        eff_layer_mode,
                        eff_ai_key,
                        eff_provider,
                        eff_strict,
                        digital_layout_fallback=True,
                    )
                except Exception as vis_err:
                    logger.warning(f"[PDF2Word] Vision builder fallback error ({vis_err}), using rich span builder")
                    await run_in_threadpool(_build_rich_span_docx, inp, out)

        # ── Optimize & sanitize output for Apple Pages & Word ─────────────────
        if out.exists() and out.stat().st_size > 0:
            await run_in_threadpool(_clean_and_optimize_docx, out)

        # ── Validate output ───────────────────────────────────────────────────
        if not out.exists() or out.stat().st_size == 0:
            raise HTTPException(
                status_code=422,
                detail="Conversion produced an empty document. Please try a different file."
            )

        try:
            from docx import Document as _DocxDoc
            _check_doc = _DocxDoc(str(out))
            _W_T = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"
            _total_chars = sum(
                len(elem.text or "")
                for elem in _check_doc.element.iter(_W_T)
            )
            _docx_size_kb = out.stat().st_size / 1024
            _has_content_by_size = _docx_size_kb > 8
            logger.info(f"[PDF2Word] DOCX chars={_total_chars}, size={_docx_size_kb:.1f}KB")

            if _total_chars < 5 and not _has_content_by_size:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        "Conversion produced a document with no readable text. "
                        "If this is a scanned PDF, please ensure it is a clear scan."
                    )
                )
            logger.info(f"[PDF2Word] Output validated: {_total_chars} chars, {_docx_size_kb:.1f}KB")
        except HTTPException:
            raise
        except Exception as docx_val_err:
            logger.warning(f"[PDF2Word] DOCX validation skipped: {type(docx_val_err).__name__}")

        stem = safe_filename(file.filename, "document")
        out_name = Path(stem).stem + "_converted.docx"
        return FileResponse(
            str(out),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=out_name,
            background=BackgroundTask(cleanup, inp, out)
        )
    except HTTPException:
        cleanup(inp, out)
        raise
    except Exception as e:
        cleanup(inp, out)
        raise safe_error(e, "pdf-to-word")


def _clean_and_optimize_docx(docx_path: Path):
    """
    Post-process DOCX generated by pdf2docx or fallback builders:
    1. Sanitize illegal XML 1.0 control characters that can crash Word/Pages XML parsers.
    2. Unwrap 1x1 dummy container tables created by pdf2docx for layout boxes,
       promoting their paragraphs and tables directly to body level so Apple Pages
       doesn't strip nested tables with "Tables inside other tables were imported as text".
    """
    try:
        from docx import Document
        from docx.oxml.ns import qn
        import re

        doc = Document(str(docx_path))
        body = doc._body._element
        ctrl_re = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')

        # 1. Sanitize XML control characters in all runs
        for t in body.iter(qn('w:t')):
            if t.text and ctrl_re.search(t.text):
                t.text = ctrl_re.sub('', t.text)

        # 2. Unwrap 1x1 borderless dummy container tables ONLY (keep styled bordered/shaded 1x1 cells intact)
        while True:
            unwrapped_any = False
            for elem in list(body):
                if elem.tag.endswith('tbl'):
                    rows = elem.findall(qn('w:tr'))
                    if len(rows) == 1:
                        cells = rows[0].findall(qn('w:tc'))
                        if len(cells) == 1:
                            tc = cells[0]
                            tcPr = tc.find(qn('w:tcPr'))
                            has_visible_style = False
                            if tcPr is not None:
                                if tcPr.find(qn('w:shd')) is not None:
                                    has_visible_style = True
                                borders = tcPr.find(qn('w:tcBorders'))
                                if borders is not None:
                                    for side in borders:
                                        if side.get(qn('w:val')) not in (None, 'none', 'nil'):
                                            has_visible_style = True
                                            break
                            if has_visible_style:
                                continue
                            parent = elem.getparent()
                            idx = parent.index(elem)
                            for child in list(tc):
                                if not child.tag.endswith('tcPr'):
                                    parent.insert(idx, child)
                                    idx += 1
                            parent.remove(elem)
                            unwrapped_any = True
            if not unwrapped_any:
                break

        doc.save(str(docx_path))
        logger.info(f"[PDF2Word] Document sanitized and optimized for Pages/Word: {docx_path.name}")
    except Exception as e:
        logger.warning(f"[PDF2Word] _clean_and_optimize_docx encountered non-fatal error: {e}")


def _build_rich_span_docx(pdf_path: Path, out_path: Path):
    """
    Advanced PDF→DOCX converter using PyMuPDF span-level data.
    Preserves: exact font sizes, bold/italic, text colors, paragraph alignment,
    indentation, heading detection, multi-column layout (columns merged left→right),
    and inter-paragraph spacing.
    """
    import pymupdf as fitz
    import re
    from docx import Document
    from docx.shared import Pt, RGBColor, Inches
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement

    def _set_run_color(run, hex_color: str):
        """Apply hex color (#rrggbb) to a docx run."""
        try:
            h = hex_color.lstrip('#')
            if len(h) == 6:
                r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
                run.font.color.rgb = RGBColor(r, g, b)
        except Exception:
            pass

    def _map_font_name(pdf_font: str) -> str:
        """Map a PDF/PyMuPDF font name to the closest Word-friendly font family."""
        f = pdf_font.lower()
        # Strip subset prefix (e.g. "ABCDEF+Helvetica" → "Helvetica")
        if '+' in f:
            f = f.split('+', 1)[-1]
        if any(x in f for x in ['times', 'timesnew', 'palatino', 'garamond', 'georgia',
                                  'bookman', 'minion', 'caslon', 'cambria', 'constantia']):
            return 'Times New Roman'
        if any(x in f for x in ['courier', 'consolas', 'inconsolata', 'lucidaconsole',
                                  'menlo', 'jetbrains', 'anonymous', 'sourcecode']):
            return 'Courier New'
        if any(x in f for x in ['devanagari', 'mangal', 'kokila', 'utsaah',
                                  'aparajita', 'shree', 'kruti']):
            return 'Mangal'
        if 'impact' in f or 'condensed' in f or 'narrow' in f:
            return 'Arial Narrow'
        if any(x in f for x in ['calibri', 'candara', 'corbel']):
            return 'Calibri'
        if any(x in f for x in ['verdana', 'tahoma']):
            return 'Verdana'
        if any(x in f for x in ['trebuchet']):
            return 'Trebuchet MS'
        if any(x in f for x in ['gill', 'franklin', 'futura']):
            return 'Century Gothic'
        # Helvetica / Arial family (default)
        return 'Arial'

    doc = Document()
    pdf = fitz.open(str(pdf_path))
    total_pages = len(pdf)

    # Configure document sections based on first page dimensions
    if total_pages > 0:
        first_p = pdf[0]
        for section in doc.sections:
            section.page_width = Pt(first_p.rect.width)
            section.page_height = Pt(first_p.rect.height)
            section.top_margin = Pt(36)
            section.bottom_margin = Pt(36)
            section.left_margin = Pt(40)
            section.right_margin = Pt(40)

    # Remove default empty paragraph
    if doc.paragraphs:
        p = doc.paragraphs[0]._element
        p.getparent().remove(p)

    for page_num in range(total_pages):
        page = pdf[page_num]
        page_width = page.rect.width

        # get_text("dict") → blocks → lines → spans with full font metadata
        blocks_data = page.get_text(
            "dict",
            flags=fitz.TEXT_PRESERVE_WHITESPACE | fitz.TEXT_PRESERVE_LIGATURES
        )

        from vision_reconstructor import build_alpha_image_bbox_map
        all_blocks = [
            b for b in blocks_data.get("blocks", [])
            if b.get("type") in (0, 1)
        ]
        all_blocks.sort(key=lambda b: (b.get("bbox", [0, 0, 0, 0])[1], b.get("bbox", [0, 0, 0, 0])[0]))
        text_blocks = [b for b in all_blocks if b.get("type") == 0]
        if not all_blocks:
            if page_num < total_pages - 1:
                doc.add_page_break()
            continue

        img_alpha_map = build_alpha_image_bbox_map(page)

        # Compute global median font size for heading detection
        all_sizes = []
        for blk in text_blocks:
            for ln in blk.get("lines", []):
                for sp in ln.get("spans", []):
                    if sp.get("text", "").strip():
                        all_sizes.append(sp.get("size", 11))
        all_sizes.sort()
        median_size = all_sizes[len(all_sizes) // 2] if all_sizes else 11.0

        p_area = max(1.0, float(page.rect.width * page.rect.height))
        for blk in all_blocks:
            if blk.get("type") == 1:
                bb = blk.get("bbox", [0, 0, 0, 0])
                bw = float(bb[2] - bb[0])
                bh = float(bb[3] - bb[1])
                if bw >= 16.0 and bh >= 12.0 and (bw * bh) < p_area * 0.74:
                    k = (int(round(bb[0])), int(round(bb[1])), int(round(bb[2])), int(round(bb[3])))
                    ibytes = img_alpha_map.get(k) or blk.get("image")
                    if ibytes and len(ibytes) >= 32:
                        try:
                            import io as _io
                            ip = doc.add_paragraph()
                            ip.paragraph_format.space_before = Pt(2)
                            ip.paragraph_format.space_after = Pt(2)
                            if (bb[0] + bb[2]) * 0.5 > page_width * 0.58:
                                ip.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                            elif abs((bb[0] + bb[2]) * 0.5 - page_width * 0.5) < page_width * 0.14:
                                ip.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
                            ip.add_run().add_picture(_io.BytesIO(ibytes), width=Pt(min(page_width - 80.0, bw)))
                        except Exception:
                            pass
                continue
            lines = blk.get("lines", [])
            if not lines:
                continue

            # Determine block X position (for left-indent detection)
            blk_x0 = blk.get("bbox", [0, 0, 0, 0])[0]
            blk_x1 = blk.get("bbox", [0, 0, 0, 0])[2]
            blk_w = blk_x1 - blk_x0

            # Determine paragraph alignment from block position relative to page width
            page_center = page_width / 2
            blk_center = (blk_x0 + blk_x1) / 2
            left_margin_ratio = blk_x0 / page_width
            right_margin_ratio = (page_width - blk_x1) / page_width
            margin_diff = abs(left_margin_ratio - right_margin_ratio)

            if margin_diff < 0.08 and blk_w > page_width * 0.3:
                alignment = WD_ALIGN_PARAGRAPH.CENTER
            elif right_margin_ratio < 0.08 and left_margin_ratio > 0.3:
                alignment = WD_ALIGN_PARAGRAPH.RIGHT
            else:
                alignment = WD_ALIGN_PARAGRAPH.LEFT

            # Compute left indent (in points)
            left_indent_pt = max(0.0, blk_x0 - 60)  # 60pt ≈ standard left margin

            for line_idx, line in enumerate(lines):
                spans = line.get("spans", [])
                if not spans:
                    continue

                # Collect non-empty spans
                valid_spans = [s for s in spans if s.get("text", "").strip()]
                if not valid_spans:
                    continue

                # Line-level font stats for heading detection
                line_max_size = max(s.get("size", 11) for s in valid_spans)
                line_bold = any(
                    (s.get("flags", 0) & 16) or
                    any(x in s.get("font", "").lower() for x in ["bold", "heavy", "black"])
                    for s in valid_spans
                )

                # Heading detection: font size significantly larger than median
                is_h1 = line_max_size > median_size * 1.55 and len("".join(s.get("text","") for s in valid_spans).strip()) < 120
                is_h2 = line_max_size > median_size * 1.25 and not is_h1 and len("".join(s.get("text","") for s in valid_spans).strip()) < 150
                is_heading = is_h1 or is_h2

                para = doc.add_paragraph()
                pf = para.paragraph_format
                pf.alignment = alignment if not is_heading else WD_ALIGN_PARAGRAPH.LEFT
                pf.space_before = Pt(4 if not is_heading else (10 if is_h1 else 6))
                pf.space_after = Pt(4 if not is_heading else (8 if is_h1 else 5))
                pf.left_indent = Pt(min(left_indent_pt, 72)) if not is_heading else None

                # Apply paragraph style for headings
                if is_h1:
                    para.style = doc.styles['Heading 1'] if 'Heading 1' in [s.name for s in doc.styles] else doc.styles['Normal']
                elif is_h2:
                    para.style = doc.styles['Heading 2'] if 'Heading 2' in [s.name for s in doc.styles] else doc.styles['Normal']

                for span in valid_spans:
                    text = span.get("text", "")
                    if not text:
                        continue
                    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
                    if not text:
                        continue

                    raw_font = span.get("font", "Arial")
                    font_size = span.get("size", median_size)
                    flags = span.get("flags", 0)

                    is_bold = bool(flags & 16) or any(x in raw_font.lower() for x in ["bold", "heavy", "black"])
                    is_italic = bool(flags & 2) or any(x in raw_font.lower() for x in ["italic", "oblique", "slant"])

                    # Color
                    raw_color = span.get("color", 0) or 0
                    r_c = (raw_color >> 16) & 0xFF
                    g_c = (raw_color >> 8) & 0xFF
                    b_c = raw_color & 0xFF
                    color_hex = f"#{r_c:02x}{g_c:02x}{b_c:02x}"

                    run = para.add_run(text)
                    run.font.name = _map_font_name(raw_font)
                    run.font.size = Pt(max(6.0, min(round(font_size, 1), 72.0)))
                    run.bold = is_bold or is_heading
                    run.italic = is_italic

                    # Apply color (skip pure black #000000 to use default)
                    if color_hex not in ("#000000", "#000001"):
                        _set_run_color(run, color_hex)

        # Page break between pages (not after last)
        if page_num < total_pages - 1:
            doc.add_page_break()

    pdf.close()
    doc.save(str(out_path))
    logger.info(
        f"[RichSpanDOCX] Built rich DOCX from {total_pages} pages: "
        f"{out_path.stat().st_size / 1024:.1f}KB"
    )


@app.post("/convert/pdf-to-word-plaintext")
@limiter.limit("10/minute")
async def pdf_to_word_plaintext(request: Request, file: UploadFile = File(...), force_ocr: bool = Form(False), strict_local: bool = Form(False)):
    try:
        import pymupdf as fitz
        from docx import Document
    except ImportError:
        raise HTTPException(500, "Run: pip install PyMuPDF python-docx")

    inp = temp_path(".pdf")
    out = temp_path(".docx")
    try:
        inp.write_bytes(await safe_read_upload(file))
        check_pdf_page_count(inp, "pdf-to-word-plaintext")

        # 1. OCR if necessary — raises HTTP 422 on failure, never silently continues
        inp = await ensure_auto_ocr(inp, force=force_ocr, strict_local=strict_local)

        # 2. Extract plain text using fitz in threadpool to avoid blocking async event loop
        logger.info(f"[PDF2Word-Plaintext] Extracting text from {inp.name}")

        def _build_plaintext_docx():
            doc = fitz.open(str(inp))
            docx_doc = Document()
            added = 0
            for page in doc:
                text = page.get_text("text")
                if text.strip():
                    docx_doc.add_paragraph(text.strip())
                    docx_doc.add_page_break()
                    added += len(text.strip())
            doc.close()
            if added >= 5:
                docx_doc.save(str(out))
            return added

        total_text_added = await run_in_threadpool(_build_plaintext_docx)

        # 4. Guard: do not return a blank document
        if total_text_added < 5:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Unable to extract readable text from this PDF. "
                    "If this is a scanned document, please ensure OCR was performed successfully."
                )
            )

        stem = safe_filename(file.filename, "document")
        out_name = Path(stem).stem + "_plaintext.docx"
        return FileResponse(
            str(out),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=out_name,
            background=BackgroundTask(cleanup, inp, out)
        )
    except HTTPException:
        cleanup(inp, out)
        raise
    except Exception as e:
        cleanup(inp, out)
        raise safe_error(e, "pdf-to-word-plaintext")



# ─── 2. PDF → Excel ────────────────────────────────────────────

def _extract_tables_to_excel(inp: Path, out: Path, method: str) -> int:
    """Synchronous CPU/IO worker function executed in threadpool."""
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    tables_found = False
    total_cells_written = 0

    # Try camelot (best for bordered tables)
    try:
        import camelot
        for flavor in (["lattice", "stream"] if method == "auto" else [method]):
            tables = camelot.read_pdf(str(inp), pages="all", flavor=flavor)
            if tables and len(tables) > 0:
                tables_found = True
                for i, tbl in enumerate(tables):
                    sheet_name = f"Table_{i+1}_p{tbl.page}"[:31]
                    ws = wb.create_sheet(sheet_name)
                    for r_idx, row in enumerate(tbl.df.values, 1):
                        for c_idx, val in enumerate(row, 1):
                            cell_val = str(val).strip() if val else ""
                            cell = ws.cell(r_idx, c_idx, cell_val)
                            if cell_val:
                                total_cells_written += 1
                            if r_idx == 1:
                                cell.font = Font(bold=True)
                                cell.fill = PatternFill("solid", fgColor="D9E1F2")
                            cell.border = Border(
                                left=Side(style="thin"), right=Side(style="thin"),
                                top=Side(style="thin"), bottom=Side(style="thin")
                            )
                            cell.alignment = Alignment(wrap_text=True)
                break
    except Exception as camelot_err:
        logger.warning(f"[PDF2Excel] Camelot failed, using pdfplumber fallback: {type(camelot_err).__name__}")

    # Fallback: pdfplumber
    if not tables_found:
        import pdfplumber
        with pdfplumber.open(str(inp)) as pdf:
            for pg_num, pg in enumerate(pdf.pages, 1):
                ws = wb.create_sheet(f"Page_{pg_num}")
                row_idx = 1
                pg_tables = pg.extract_tables(table_settings={
                    "vertical_strategy": "text",
                    "horizontal_strategy": "text",
                    "intersection_y_tolerance": 15
                })
                if pg_tables:
                    for tbl in pg_tables:
                        for row in tbl:
                            for c_idx, v in enumerate(row, 1):
                                cell_val = str(v).strip() if v else ""
                                ws.cell(row_idx, c_idx, cell_val)
                                if cell_val:
                                    total_cells_written += 1
                            row_idx += 1
                        row_idx += 2  # gap between tables
                else:
                    words = pg.extract_words()
                    if words:
                        lines = {}
                        for w in words:
                            y = round(w['top'] / 5) * 5
                            lines.setdefault(y, []).append(w)

                        for y in sorted(lines.keys()):
                            line_words = sorted(lines[y], key=lambda w: w['x0'])
                            for w in line_words:
                                col_idx = max(1, int(w['x0'] / 50) + 1)
                                ws.cell(row_idx, col_idx, w['text'])
                                total_cells_written += 1
                            row_idx += 1

    if total_cells_written == 0:
        raise HTTPException(
            status_code=422,
            detail=(
                "No readable table or text data was detected in this PDF. "
                "If this is a scanned document, ensure it contains legible text."
            )
        )

    logger.info(f"[PDF2Excel] Extracted {total_cells_written} non-empty cells")
    wb.save(str(out))
    return total_cells_written


@app.post("/convert/pdf-to-excel")
@limiter.limit("10/minute")
async def pdf_to_excel(
    request: Request,
    file: UploadFile = File(...),
    method: str = Form("auto"),
    force_ocr: bool = Form(False),
    strict_local: bool = Form(False),
    ai_provider: str = Form("auto"),
    ai_api_key: Optional[str] = Form(None),
    lang: str = Form("auto"),
):
    try:
        import pdfplumber, openpyxl
    except ImportError:
        raise HTTPException(500, "Run: pip install pdfplumber openpyxl")

    inp = temp_path(".pdf")
    out = temp_path(".xlsx")
    try:
        raw_bytes = await safe_read_upload(file)
        inp, was_image = normalize_input_to_pdf(raw_bytes, file.filename, inp)
        check_pdf_page_count(inp, "pdf-to-excel")
        eff_strict = _form_bool(strict_local, False)
        eff_provider = _form_str(ai_provider, "auto") or "auto"
        raw_ai_key = _form_str(ai_api_key, None)
        eff_lang = _form_str(lang, "auto") or "auto"
        eff_strict = eff_strict or not server_ai_quota_ok(request, bool(raw_ai_key and raw_ai_key.strip()), eff_strict)
        eff_ai_key = None if eff_strict else (raw_ai_key.strip() if raw_ai_key else None)

        was_scanned = was_image or force_ocr or is_pdf_scanned(inp)
        if was_scanned:
            logger.info(f"[PDF2Excel] Scanned/OCR/Image input detected → 3-Layer Vision XLSX builder (lang={eff_lang})")
            _, tables_cnt = await run_in_threadpool(
                build_exact_xlsx_from_scans, inp, out, eff_lang, 200, eff_ai_key, eff_provider, eff_strict
            )
            logger.info(f"[PDF2Excel] Vision builder wrote {tables_cnt} reconstructed table(s)")
        else:
            digital_stats = await run_in_threadpool(_inspect_digital_pdf_complexity, inp)
            if digital_stats.get("raster_text_boxes", 0) >= 1 and digital_stats.get("src_tbl_rows", 0) == 0:
                logger.info(
                    f"[PDF2Excel] Digital PDF has {digital_stats['raster_text_boxes']} embedded raster image box(es) and 0 vector tables "
                    "→ routing to Digital Vision XLSX builder"
                )
                _, tables_cnt = await run_in_threadpool(
                    build_exact_xlsx_from_scans,
                    inp,
                    out,
                    eff_lang,
                    200,
                    eff_ai_key,
                    eff_provider,
                    eff_strict,
                    digital_layout_fallback=True,
                )
                logger.info(f"[PDF2Excel] Digital Vision builder wrote {tables_cnt} table(s)")
            else:
                try:
                    await run_in_threadpool(_extract_tables_to_excel, inp, out, method)
                except Exception as ex:
                    logger.warning(f"[PDF2Excel] Vector extraction fallback to Vision builder ({type(ex).__name__})")
                    await run_in_threadpool(
                        build_exact_xlsx_from_scans,
                        inp,
                        out,
                        eff_lang,
                        200,
                        eff_ai_key,
                        eff_provider,
                        eff_strict,
                        digital_layout_fallback=True,
                    )

        stem = safe_filename(file.filename, "document")
        out_name = Path(stem).stem + ".xlsx"
        return FileResponse(
            str(out),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=out_name,
            background=BackgroundTask(cleanup, inp, out)
        )
    except HTTPException:
        cleanup(inp, out)
        raise
    except Exception as e:
        cleanup(inp, out)
        raise safe_error(e, "pdf-to-excel")


# ─── Helper: Build structural (fully editable) PPTX from OCR'd PDF ───

def _build_structural_pptx(pdf_path: Path, out_path: Path):
    """
    Converts a PDF (including scanned/OCR'd) into a NATIVE PowerPoint presentation.

    DESIGN PHILOSOPHY:
    The old approach was:  render page as image → overlay transparent OCR text
    Problem:               editing text = floating text over a frozen scan image

    The new approach:
      1. Detect tables using pdfplumber → create real PPT Table shapes
      2. Extract text blocks via PyMuPDF  → create real PPT TextBox shapes
      3. Use a clean white background – no background image embedded

    Result: A presentation that looks professional, edits cleanly, and shows
    no signs of being a scan when content is modified.

    NOTE: For scanned PDFs, OCRmyPDF must have already run before calling
    this function so that a proper text layer exists in the PDF.
    """
    import pymupdf as fitz  # PyMuPDF
    import pdfplumber
    from pptx import Presentation
    from pptx.util import Inches, Pt, Emu
    from pptx.dml.color import RGBColor
    from pptx.enum.text import PP_ALIGN

    # ── PPT color palette ────────────────────────────────────────────
    CLR_WHITE       = RGBColor(0xFF, 0xFF, 0xFF)
    CLR_BG_SLIDE    = RGBColor(0xF8, 0xF9, 0xFA)   # very light gray slide bg
    CLR_TEXT        = RGBColor(0x1A, 0x1A, 0x2E)   # near-black for body text
    CLR_HDR_BG      = RGBColor(0x1F, 0x4E, 0x79)   # dark blue header row
    CLR_HDR_FG      = RGBColor(0xFF, 0xFF, 0xFF)   # white header text
    CLR_ROW_ALT     = RGBColor(0xDE, 0xEB, 0xF7)   # alternating row tint
    CLR_BORDER      = RGBColor(0xBF, 0xBF, 0xBF)   # table cell border

    prs = Presentation()

    pdf_fitz = fitz.open(str(pdf_path))

    with pdfplumber.open(str(pdf_path)) as pdf_plumb:
        total_pages = len(pdf_plumb.pages)
        slides_built = 0

        for page_idx in range(total_pages):
            page_fitz  = pdf_fitz[page_idx]
            page_plumb = pdf_plumb.pages[page_idx]

            if page_fitz.rect.width <= 0 or page_fitz.rect.height <= 0:
                logger.warning(f"[PDF2PPT] Page {page_idx+1} zero dimensions, skipping")
                continue

            # Convert PDF points → inches (1 pt = 1/72 inch)
            w_pt = page_fitz.rect.width
            h_pt = page_fitz.rect.height
            w_in = w_pt / 72.0
            h_in = h_pt / 72.0

            prs.slide_width  = Inches(w_in)
            prs.slide_height = Inches(h_in)

            slide = prs.slides.add_slide(prs.slide_layouts[6])  # blank layout

            # Clean light-gray background (no image)
            bg = slide.background
            bg.fill.solid()
            bg.fill.fore_color.rgb = CLR_BG_SLIDE

            # ───────────────────────────────────────────────────────
            # PHASE 1 — Table detection and rendering
            # Strategy A: line-based (works for digital PDFs with vector borders)
            # Strategy B: text-based (works for OCR'd text-aligned tables)
            # ───────────────────────────────────────────────────────
            table_rects = []  # (x0, top, x1, bottom) in PDF points of each placed table

            for strategy in ("lines", "text"):
                if strategy == "lines":
                    ts = {
                        "vertical_strategy": "lines",
                        "horizontal_strategy": "lines",
                        "snap_tolerance": 5,
                        "join_tolerance": 5,
                    }
                else:
                    ts = {
                        "vertical_strategy": "text",
                        "horizontal_strategy": "text",
                        "intersection_y_tolerance": 12,
                        "intersection_x_tolerance": 12,
                    }

                try:
                    found_tables = page_plumb.find_tables(table_settings=ts)
                except Exception:
                    found_tables = []

                if not found_tables:
                    continue  # try next strategy

                for tbl_obj in found_tables:
                    try:
                        tbl_data = tbl_obj.extract()
                    except Exception:
                        continue

                    if not tbl_data:
                        continue

                    # Filter empty rows/cols
                    tbl_data = [
                        [str(c).strip() if c else "" for c in row]
                        for row in tbl_data
                        if any(c for c in row)
                    ]
                    if not tbl_data:
                        continue

                    rows = len(tbl_data)
                    cols = max(len(r) for r in tbl_data)
                    if rows == 0 or cols == 0:
                        continue

                    # pdfplumber bbox: (x0, top, x1, bottom) measured from page top
                    x0, top, x1, bottom = tbl_obj.bbox

                    tbl_x = Inches(x0   / 72.0)
                    tbl_y = Inches(top  / 72.0)
                    tbl_w = Inches(max((x1 - x0), 0.5) / 72.0)
                    tbl_h = Inches(max((bottom - top), 0.2) / 72.0)

                    try:
                        tbl_shape = slide.shapes.add_table(
                            rows, cols, tbl_x, tbl_y, tbl_w, tbl_h
                        )
                        tbl = tbl_shape.table

                        # Normalize column widths proportionally
                        col_width_emu = int(int(tbl_w) // max(1, cols))
                        for ci in range(cols):
                            tbl.columns[ci].width = Emu(col_width_emu)

                        for r_idx, row in enumerate(tbl_data):
                            # Pad short rows
                            row_padded = row + [""] * (cols - len(row))
                            for c_idx, cell_text in enumerate(row_padded[:cols]):
                                cell = tbl.cell(r_idx, c_idx)
                                cell.text = cell_text

                                # Fill colors
                                fill = cell.fill
                                fill.solid()
                                if r_idx == 0:
                                    fill.fore_color.rgb = CLR_HDR_BG
                                elif r_idx % 2 == 0:
                                    fill.fore_color.rgb = CLR_ROW_ALT
                                else:
                                    fill.fore_color.rgb = CLR_WHITE

                                # Text styling
                                for para in cell.text_frame.paragraphs:
                                    for run in para.runs:
                                        run.font.size = Pt(9)
                                        run.font.bold = (r_idx == 0)
                                        run.font.color.rgb = CLR_HDR_FG if r_idx == 0 else CLR_TEXT

                        table_rects.append((x0, top, x1, bottom))
                        logger.info(
                            f"[PDF2PPT] Table {rows}×{cols} placed on slide {page_idx+1} "
                            f"[strategy={strategy}]"
                        )

                    except Exception as tbl_err:
                        logger.warning(
                            f"[PDF2PPT] Table shape failed (p{page_idx+1}): {type(tbl_err).__name__}: {tbl_err}"
                        )

                if table_rects:  # if line-strategy worked, don't try text strategy
                    break

            # ───────────────────────────────────────────────────────
            # PHASE 2 — Text block extraction (non-table regions only)
            # ───────────────────────────────────────────────────────
            def _overlaps_table(bx0, by0, bx1, by1):
                for (tx0, ttop, tx1, tbot) in table_rects:
                    if bx0 < tx1 and bx1 > tx0 and by0 < tbot and by1 > ttop:
                        return True
                return False

            # Also render native transparent SMask / clipped images cleanly instead of raw opaque dict bytes
            from vision_reconstructor import build_alpha_image_bbox_map
            img_info_smask = build_alpha_image_bbox_map(page_fitz)

            fitz_blocks = page_fitz.get_text("dict", sort=True).get("blocks", [])

            for block in fitz_blocks:
                if block["type"] == 1:
                    # Preserve embedded PDF images/logos/signatures (with SMask transparency!) on the slide
                    ibx0, iby0, ibx1, iby1 = block["bbox"]
                    key = (int(round(ibx0)), int(round(iby0)), int(round(ibx1)), int(round(iby1)))
                    img_bytes = img_info_smask.get(key) or block.get("image")
                    if img_bytes and len(img_bytes) >= 32:
                        try:
                            import io as _io
                            img_x = Inches(max(0.0, ibx0) / 72.0)
                            img_y = Inches(max(0.0, iby0) / 72.0)
                            img_w = Inches(max(0.25, ibx1 - ibx0) / 72.0)
                            img_h = Inches(max(0.25, iby1 - iby0) / 72.0)
                            slide.shapes.add_picture(_io.BytesIO(img_bytes), img_x, img_y, width=img_w, height=img_h)
                        except Exception as img_err:
                            logger.debug(f"[PDF2PPT] Image block skip on p{page_idx+1}: {img_err}")
                    continue
                if block["type"] != 0:
                    continue

                bx0, by0, bx1, by1 = block["bbox"]

                # Skip if block sits inside a table we already rendered
                if _overlaps_table(bx0, by0, bx1, by1):
                    continue

                # Gather text + style + exact color from spans
                lines_data   = block.get("lines", [])
                text_lines   = []
                max_size     = 11.0
                has_bold     = False
                has_italic   = False
                dom_rgb      = CLR_TEXT

                for line in lines_data:
                    line_parts = []
                    for span in line.get("spans", []):
                        t = span.get("text", "").rstrip()
                        if t:
                            line_parts.append(t)
                            sz = span.get("size", 11.0)
                            if sz > max_size:
                                max_size = sz
                            s_flags = span.get("flags", 0)
                            if s_flags & (1 << 4):
                                has_bold = True
                            if s_flags & (1 << 1):
                                has_italic = True
                            scol = int(span.get("color", 0) or 0)
                            if scol:
                                dom_rgb = RGBColor((scol >> 16) & 0xFF, (scol >> 8) & 0xFF, scol & 0xFF)
                    joined = " ".join(line_parts).strip()
                    if joined:
                        text_lines.append(joined)

                if not text_lines:
                    continue

                combined = "\n".join(text_lines)

                # Detect heading heuristic: short, large, bold, or ALL CAPS
                is_heading = (
                    max_size >= 13
                    or has_bold
                    or (len(combined) < 80 and combined == combined.upper() and len(combined) > 2)
                )

                # Padding around text block
                pad = 1.5  # points
                tb_x = Inches(max(0.0, bx0 - pad) / 72.0)
                tb_y = Inches(max(0.0, by0 - pad) / 72.0)
                tb_w = Inches(max(0.4, bx1 - bx0 + pad * 2) / 72.0)
                tb_h = Inches(max(0.18, by1 - by0 + pad * 2) / 72.0)

                try:
                    txb = slide.shapes.add_textbox(tb_x, tb_y, tb_w, tb_h)
                    tf  = txb.text_frame
                    tf.word_wrap = True

                    for li, line_text in enumerate(text_lines):
                        p = tf.paragraphs[0] if li == 0 else tf.add_paragraph()
                        p.space_after = Pt(2)

                        run = p.add_run()
                        run.text = line_text

                        font_pt = max(7.0, min(max_size, 32.0))
                        run.font.size   = Pt(font_pt)
                        run.font.bold   = has_bold or is_heading
                        run.font.italic = has_italic
                        run.font.color.rgb = dom_rgb

                        if is_heading:
                            p.alignment = PP_ALIGN.CENTER if len(line_text) < 60 else PP_ALIGN.LEFT

                except Exception as txb_err:
                    logger.debug(
                        f"[PDF2PPT] TextBox failed p{page_idx+1}: {type(txb_err).__name__}"
                    )

            slides_built += 1
            logger.info(
                f"[PDF2PPT] Slide {page_idx+1} built: {len(table_rects)} table(s), "
                f"{len([b for b in fitz_blocks if b['type']==0])} text block(s)"
            )

    pdf_fitz.close()

    if slides_built == 0:
        raise ValueError("No slides could be built from this PDF.")

    prs.save(str(out_path))
    logger.info(
        f"[PDF2PPT] Structural PPTX complete: {slides_built} slide(s), "
        f"{out_path.stat().st_size / 1024:.1f}KB"
    )


# ─── 3. PDF → PPT ──────────────────────────────────────────────

@app.post("/convert/pdf-to-ppt")
@limiter.limit("10/minute")
async def pdf_to_ppt(
    request: Request,
    file: UploadFile = File(...),
    force_ocr: bool = Form(False),
    strict_local: bool = Form(False),
    slide_mode: str = Form("structural"),
    layer_mode: str = Form("clean_real"),
    ai_provider: str = Form("auto"),
    ai_api_key: Optional[str] = Form(None),
    lang: str = Form("auto"),
):
    """
    PDF / Scan / Image → 3-Layer Editable Structural PowerPoint
    - For scanned, OCR-layered scanned PDFs, or image uploads: runs 3-Layer CV Table+Span
      Reconstruction + Global Multi-Script OCR + Cropped Visual Assets + Smart-Gated
      Vision AI Semantic Boost directly into native PowerPoint tables, pictures, & textboxes.
    - `layer_mode="clean_real"` / `slide_mode="structural"` builds clean native slides;
      `layer_mode="layered_replica"` / `slide_mode="hybrid"` adds an ink-free Layer-1 canvas.
    """
    inp = temp_path(".pdf")
    out = temp_path(".pptx")
    try:
        raw_bytes = await safe_read_upload(file)
        inp, was_image = normalize_input_to_pdf(raw_bytes, file.filename, inp)
        check_pdf_page_count(inp, "pdf-to-ppt")

        eff_strict = _form_bool(strict_local, False)
        slide_mode_raw = _form_str(slide_mode, "structural") or "structural"
        layer_mode_raw = _form_str(layer_mode, "clean_real") or "clean_real"
        eff_provider = _form_str(ai_provider, "auto") or "auto"
        raw_ai_key = _form_str(ai_api_key, None)
        eff_lang = _form_str(lang, "auto") or "auto"

        mode_clean = "hybrid" if (
            slide_mode_raw.strip().lower() == "hybrid"
            or layer_mode_raw.strip().lower() == "layered_replica"
        ) else "structural"
        eff_layer_mode = "layered_replica" if mode_clean == "hybrid" else "clean_real"
        eff_strict = eff_strict or not server_ai_quota_ok(request, bool(raw_ai_key and raw_ai_key.strip()), eff_strict)
        eff_ai_key = None if eff_strict else (raw_ai_key.strip() if raw_ai_key else None)
        was_scanned = was_image or force_ocr or is_pdf_scanned(inp)

        if was_scanned:
            logger.info(f"[PDF2PPT] Scanned/OCR/Image input detected → 3-Layer Vision PPTX ({eff_layer_mode}, lang={eff_lang})")
            await run_in_threadpool(
                build_exact_pptx_from_scans,
                inp,
                out,
                eff_lang,
                200,
                mode_clean,
                eff_layer_mode,
                eff_ai_key,
                eff_provider,
                eff_strict,
            )
        else:
            digital_stats = await run_in_threadpool(_inspect_digital_pdf_complexity, inp)
            use_digital_vision = (
                digital_stats.get("raster_text_boxes", 0) >= 1
                or (digital_stats.get("vector_clusters", 0) >= 1 and digital_stats.get("raster_assets", 0) == 0)
            )
            if use_digital_vision:
                logger.info(
                    f"[PDF2PPT] Complex born-digital PDF (raster_txt={digital_stats['raster_text_boxes']}, "
                    f"vec_clusters={digital_stats['vector_clusters']}) → Digital Vision PPTX builder"
                )
                await run_in_threadpool(
                    build_exact_pptx_from_scans,
                    inp,
                    out,
                    eff_lang,
                    200,
                    mode_clean,
                    eff_layer_mode,
                    eff_ai_key,
                    eff_provider,
                    eff_strict,
                    digital_layout_fallback=True,
                )
            else:
                try:
                    await run_in_threadpool(_build_structural_pptx, inp, out)
                    if not out.exists() or out.stat().st_size < 1800:
                        await run_in_threadpool(
                            build_exact_pptx_from_scans,
                            inp,
                            out,
                            eff_lang,
                            200,
                            mode_clean,
                            eff_layer_mode,
                            eff_ai_key,
                            eff_provider,
                            eff_strict,
                            digital_layout_fallback=True,
                        )
                except Exception as ppt_err:
                    logger.warning(f"[PDF2PPT] Structural digital builder fallback to Vision PPTX ({type(ppt_err).__name__})")
                    await run_in_threadpool(
                        build_exact_pptx_from_scans,
                        inp,
                        out,
                        eff_lang,
                        200,
                        mode_clean,
                        eff_layer_mode,
                        eff_ai_key,
                        eff_provider,
                        eff_strict,
                        digital_layout_fallback=True,
                    )

        if not out.exists() or out.stat().st_size < 1000:
            raise HTTPException(
                status_code=422,
                detail="Conversion produced an empty presentation. Please try a different file."
            )

        stem = safe_filename(file.filename, "presentation")
        out_name = Path(stem).stem + "_converted.pptx"
        return FileResponse(
            str(out),
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            filename=out_name,
            background=BackgroundTask(cleanup, inp, out)
        )
    except HTTPException:
        cleanup(inp, out)
        raise
    except Exception as e:
        cleanup(inp, out)
        raise safe_error(e, "pdf-to-ppt")



# ─── 4. Office → PDF (LibreOffice) ────────────────────────────

def _find_libreoffice() -> str:
    """Find LibreOffice executable. Returns path or raises RuntimeError."""
    candidates = [
        "soffice", "libreoffice",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "/usr/bin/soffice",
    ]
    for c in candidates:
        if shutil.which(c) or Path(c).exists():
            return c
    raise RuntimeError("LibreOffice not found.")


def libreoffice_convert(inp: Path, out_dir: Path) -> Path:
    """
    Convert a file to PDF using LibreOffice.
    Uses an isolated UserInstallation profile directory to prevent concurrent worker lockups.
    """
    lo = _find_libreoffice()
    with tempfile.TemporaryDirectory(prefix="lo_prof_") as tmp_prof:
        profile_url = f"file://{Path(tmp_prof).resolve()}"
        r = subprocess.run(
            [
                lo,
                f"-env:UserInstallation={profile_url}",
                "--headless",
                "--convert-to", "pdf",
                "--outdir", str(out_dir),
                str(inp)
            ],
            capture_output=True, text=True, timeout=MAX_PROCESSING_SECONDS
        )
    if r.returncode != 0:
        logger.error(f"[LibreOffice] Conversion failed: {r.stderr[:300]}")
        raise RuntimeError("LibreOffice conversion failed.")
    out_pdf = out_dir / (inp.stem + ".pdf")
    if not out_pdf.exists():
        raise RuntimeError("LibreOffice output PDF not found.")
    return out_pdf


ALLOWED_OFFICE_EXTENSIONS = {".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls", ".odt", ".odp"}


@app.post("/convert/office-to-pdf")
@limiter.limit("10/minute")
async def office_to_pdf(request: Request, file: UploadFile = File(...)):
    ext = Path(safe_filename(file.filename or "")).suffix.lower()
    if ext not in ALLOWED_OFFICE_EXTENSIONS:
        raise HTTPException(400, f"Unsupported format. Allowed: {', '.join(ALLOWED_OFFICE_EXTENSIONS)}")

    inp = temp_path(ext)
    out_dir = TEMP_DIR / uuid.uuid4().hex
    out_dir.mkdir(exist_ok=True)
    try:
        inp.write_bytes(await safe_read_upload(file))

        # Acquire semaphore to limit concurrent LibreOffice processes
        async with LIBREOFFICE_SEMAPHORE:
            from fastapi.concurrency import run_in_threadpool
            out_pdf = await run_in_threadpool(libreoffice_convert, inp, out_dir)

        stem = safe_filename(file.filename, "document")
        out_name = Path(stem).stem + ".pdf"
        return FileResponse(
            str(out_pdf), media_type="application/pdf",
            filename=out_name,
            background=BackgroundTask(cleanup, inp, out_dir)
        )
    except HTTPException:
        cleanup(inp, out_dir)
        raise
    except Exception as e:
        cleanup(inp, out_dir)
        raise safe_error(e, "office-to-pdf")


@app.post("/convert/make-searchable")
@limiter.limit("5/minute")
async def make_searchable(
    request: Request,
    file: UploadFile = File(...),
    lang: str = Form("auto"),
    deskew: bool = Form(True),
    rotate: bool = Form(True),
    force_ocr: bool = Form(False),
    strict_local: bool = Form(False),
    engine_mode: str = Form("pro_local"),
    clean_watermarks: bool = Form(True),
):
    inp = temp_path(".pdf")
    out = temp_path("_searchable.pdf")
    try:
        inp.write_bytes(await safe_read_upload(file))
        check_pdf_page_count(inp, "make-searchable")

        # Smart Check: If it's not scanned and user didn't force OCR, skip to save processing!
        if not force_ocr and not is_pdf_scanned(inp):
            logger.info(f"[OCR] Skipping OCR — PDF already has text. (Credit Saver)")
            # Just return the original file
            stem = safe_filename(file.filename, "document")
            out_name = Path(stem).stem + "_searchable.pdf"
            return FileResponse(
                str(inp), media_type="application/pdf",
                filename=out_name,
                background=BackgroundTask(cleanup, inp)
            )

        await run_hybrid_ocr(
            inp,
            out,
            lang=lang,
            deskew=deskew,
            rotate=rotate,
            force_ocr=force_ocr,
            strict_local=strict_local,
            engine_mode=engine_mode,
            clean_watermarks=clean_watermarks,
        )
        stem = safe_filename(file.filename, "document")
        out_name = Path(stem).stem + "_searchable.pdf"
        return FileResponse(
            str(out), media_type="application/pdf",
            filename=out_name,
            background=BackgroundTask(cleanup, inp, out)
        )
    except HTTPException:
        cleanup(inp, out)
        raise
    except Exception as e:
        cleanup(inp, out)
        raise safe_error(e, "make-searchable")


# ─── 6. PPT → Word ────────────────────────────────────────────

@app.post("/convert/ppt-to-word")
@limiter.limit("10/minute")
async def ppt_to_word(request: Request, file: UploadFile = File(...)):
    try:
        from pptx import Presentation as Pptx
        from docx import Document
        from docx.shared import Pt as DPt
    except ImportError:
        raise HTTPException(500, "Run: pip install python-pptx python-docx")

    inp = temp_path(".pptx")
    out = temp_path(".docx")
    try:
        inp.write_bytes(await safe_read_upload(file))

        def _convert_ppt_to_word():
            prs = Pptx(str(inp))
            doc = Document()
            doc.add_heading("Presentation Content", 0)

            for i, slide in enumerate(prs.slides, 1):
                doc.add_heading(f"Slide {i}", 1)
                for shape in slide.shapes:
                    if shape.has_text_frame:
                        for para in shape.text_frame.paragraphs:
                            txt = para.text.strip()
                            if txt:
                                p = doc.add_paragraph(txt)
                                if para.runs and para.runs[0].font.size:
                                    p.runs[0].font.size = para.runs[0].font.size

            doc.save(str(out))

        await run_in_threadpool(_convert_ppt_to_word)
        stem = safe_filename(file.filename, "document")
        out_name = Path(stem).stem + ".docx"
        return FileResponse(
            str(out),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=out_name,
            background=BackgroundTask(cleanup, inp, out)
        )
    except HTTPException:
        cleanup(inp, out)
        raise
    except Exception as e:
        cleanup(inp, out)
        raise safe_error(e, "ppt-to-word")


# ─── 7. Word → PPT (improved: headings→slides, bullets, tables) ──

@app.post("/convert/word-to-ppt")
@limiter.limit("10/minute")
async def word_to_ppt(request: Request, file: UploadFile = File(...)):
    try:
        from docx import Document
        from docx.oxml.ns import qn
        from pptx import Presentation
        from pptx.util import Inches, Pt, Emu
        from pptx.dml.color import RGBColor
        from pptx.enum.text import PP_ALIGN
    except ImportError:
        raise HTTPException(500, "Run: pip install python-docx python-pptx")

    inp = temp_path(".docx")
    out = temp_path(".pptx")
    try:
        inp.write_bytes(await safe_read_upload(file))

        def _convert_word_to_ppt():
            doc = Document(str(inp))
            prs = Presentation()
            prs.slide_width  = Inches(13.33)
            prs.slide_height = Inches(7.5)

            TITLE_LAYOUT   = prs.slide_layouts[0]   # Title Slide
            CONTENT_LAYOUT = prs.slide_layouts[1]   # Title + Content
            BLANK_LAYOUT   = prs.slide_layouts[6]   # Blank

            def _add_content_slide(title_text: str) -> any:
                sl = prs.slides.add_slide(CONTENT_LAYOUT)
                sl.shapes.title.text = title_text[:200]
                return sl

            def _tf_for_slide(sl) -> any:
                for ph in sl.placeholders:
                    if ph.placeholder_format.idx == 1:
                        return ph.text_frame
                return None

            current_slide: any = None
            current_tf: any = None
            current_title: str = "Content"
            para_count_on_slide: int = 0
            first_slide = True

            for elem in doc.element.body:
                tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag

                if tag == 'p':
                    from docx.text.paragraph import Paragraph as _P
                    para = _P(elem, doc)
                    txt  = para.text.strip()
                    style = para.style.name if para.style else ''

                    is_h1 = 'Heading 1' in style or 'Title' in style
                    is_h2 = 'Heading 2' in style
                    is_h3 = 'Heading 3' in style or 'Heading 4' in style

                    if is_h1:
                        current_title = txt or 'Slide'
                        current_slide = _add_content_slide(current_title)
                        current_tf    = _tf_for_slide(current_slide)
                        if current_tf:
                            current_tf.clear()
                        para_count_on_slide = 0
                        first_slide = False
                        continue

                    if first_slide and txt:
                        current_title = txt[:120] or 'Content'
                        current_slide = _add_content_slide(current_title)
                        current_tf    = _tf_for_slide(current_slide)
                        if current_tf:
                            current_tf.clear()
                        para_count_on_slide = 0
                        first_slide = False
                        continue

                    if not txt:
                        continue

                    # Auto-paginate after 8 paragraphs on a single slide so content never overflows
                    if current_slide is None or para_count_on_slide >= 8:
                        cont_title = f"{current_title} (Cont.)" if current_slide is not None else current_title
                        current_slide = _add_content_slide(cont_title)
                        current_tf    = _tf_for_slide(current_slide)
                        if current_tf:
                            current_tf.clear()
                        para_count_on_slide = 0

                    if current_tf:
                        level = 0
                        if is_h2:     level = 0
                        elif is_h3:   level = 1
                        elif para.paragraph_format.left_indent and para.paragraph_format.left_indent > 0:
                            level = min(4, int(para.paragraph_format.left_indent / 360000))

                        pptx_para = current_tf.add_paragraph() if para_count_on_slide > 0 else current_tf.paragraphs[0]
                        pptx_para.level = level
                        para_count_on_slide += 1
                        added_run = False
                        for run in para.runs:
                            run_text = run.text
                            if not run_text:
                                continue
                            pptx_run = pptx_para.add_run()
                            pptx_run.text = run_text
                            pptx_run.font.bold   = run.bold
                            pptx_run.font.italic = run.italic
                            if run.font.size:
                                pptx_run.font.size = run.font.size
                            else:
                                pptx_run.font.size = Pt(20 if is_h2 else 18)
                            if run.font.color and run.font.color.type:
                                try:
                                    col = run.font.color.rgb
                                    pptx_run.font.color.rgb = RGBColor(col.red, col.green, col.blue)
                                except Exception:
                                    pass
                            added_run = True
                        if not added_run:
                            pptx_run = pptx_para.add_run()
                            pptx_run.text = txt
                            pptx_run.font.size = Pt(20 if is_h2 else 18)

                elif tag == 'tbl':
                    # Word table → native editable PPTX table shape
                    from docx.table import Table as _T
                    tbl = _T(elem, doc)
                    rows_count = len(tbl.rows)
                    cols_count = len(tbl.columns) if rows_count > 0 else 0
                    if rows_count > 0 and cols_count > 0:
                        tbl_slide = prs.slides.add_slide(BLANK_LAYOUT)
                        max_rows = min(rows_count, 18)
                        max_cols = min(cols_count, 10)
                        t_shape = tbl_slide.shapes.add_table(
                            max_rows, max_cols,
                            Inches(0.6), Inches(0.8),
                            Inches(12.1), Inches(min(6.0, max_rows * 0.42))
                        )
                        pptx_tbl = t_shape.table
                        for r_idx in range(max_rows):
                            row_cells = tbl.rows[r_idx].cells
                            for c_idx in range(min(max_cols, len(row_cells))):
                                cell_text = row_cells[c_idx].text.strip()
                                cell = pptx_tbl.cell(r_idx, c_idx)
                                cell.text = cell_text
                                for p in cell.text_frame.paragraphs:
                                    for r in p.runs:
                                        r.font.size = Pt(12)
                                        if r_idx == 0:
                                            r.font.bold = True

            if len(prs.slides) == 0:
                prs.slides.add_slide(BLANK_LAYOUT)
            prs.save(str(out))

        await run_in_threadpool(_convert_word_to_ppt)

        stem     = safe_filename(file.filename, "presentation")
        out_name = Path(stem).stem + ".pptx"
        return FileResponse(
            str(out),
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            filename=out_name,
            background=BackgroundTask(cleanup, inp, out)
        )
    except HTTPException:
        cleanup(inp, out)
        raise
    except Exception as e:
        cleanup(inp, out)
        raise safe_error(e, "word-to-ppt")


# ─── 8. Excel → Word ────────────────────────────────────────────

@app.post("/convert/excel-to-word")
@limiter.limit("10/minute")
async def excel_to_word(request: Request, file: UploadFile = File(...)):
    try:
        import openpyxl
        from docx import Document
        from docx.shared import Pt, RGBColor, Inches
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.oxml.ns import qn
        from docx.oxml import OxmlElement
    except ImportError:
        raise HTTPException(500, "Run: pip install openpyxl python-docx")

    inp = temp_path(".xlsx")
    out = temp_path(".docx")
    try:
        inp.write_bytes(await safe_read_upload(file))
        wb = openpyxl.load_workbook(str(inp), data_only=True)
        doc = Document()

        # Document margins
        for section in doc.sections:
            section.top_margin    = Inches(0.75)
            section.bottom_margin = Inches(0.75)
            section.left_margin   = Inches(0.75)
            section.right_margin  = Inches(0.75)

        for sheet_idx, sheet_name in enumerate(wb.sheetnames):
            ws = wb[sheet_name]
            if sheet_idx > 0:
                doc.add_page_break()

            h = doc.add_heading(sheet_name, level=1)
            h.runs[0].font.color.rgb = RGBColor(0x1a, 0x3a, 0x8f)

            # Determine data range (skip completely empty rows/cols)
            rows_data = []
            for row in ws.iter_rows(values_only=True):
                if any(c is not None and str(c).strip() for c in row):
                    rows_data.append([str(c) if c is not None else '' for c in row])
            if not rows_data:
                doc.add_paragraph('(Empty sheet)')
                continue

            # Trim trailing empty columns
            max_cols = max((len([c for c in r if c.strip()]) for r in rows_data), default=0)
            max_cols = max(max_cols, 1)
            rows_data = [r[:max_cols] for r in rows_data]
            # Pad short rows
            rows_data = [r + [''] * (max_cols - len(r)) for r in rows_data]

            table = doc.add_table(rows=len(rows_data), cols=max_cols)
            table.style = 'Table Grid'

            for ri, row in enumerate(rows_data):
                is_header = ri == 0
                tr = table.rows[ri]
                for ci, val in enumerate(row):
                    cell = tr.cells[ci]
                    cell.text = val
                    run = cell.paragraphs[0].runs[0] if cell.paragraphs[0].runs else cell.paragraphs[0].add_run(val)
                    run.bold = is_header
                    run.font.size = Pt(10 if not is_header else 11)
                    # Header shading
                    if is_header:
                        from docx.oxml.ns import qn
                        from docx.oxml import OxmlElement
                        tc = cell._tc
                        tcPr = tc.get_or_add_tcPr()
                        shd = OxmlElement('w:shd')
                        shd.set(qn('w:val'), 'clear')
                        shd.set(qn('w:color'), 'auto')
                        shd.set(qn('w:fill'), '1A3A8F')
                        tcPr.append(shd)
                        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
                    elif ri % 2 == 0:
                        tc = cell._tc
                        tcPr = tc.get_or_add_tcPr()
                        shd = OxmlElement('w:shd')
                        shd.set(qn('w:val'), 'clear')
                        shd.set(qn('w:color'), 'auto')
                        shd.set(qn('w:fill'), 'EFF6FF')
                        tcPr.append(shd)

            doc.add_paragraph()

        doc.save(str(out))
        stem     = safe_filename(file.filename, "document")
        out_name = Path(stem).stem + ".docx"
        return FileResponse(
            str(out),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=out_name,
            background=BackgroundTask(cleanup, inp, out)
        )
    except HTTPException:
        cleanup(inp, out)
        raise
    except Exception as e:
        cleanup(inp, out)
        raise safe_error(e, "excel-to-word")


# ─── 9. Excel → PPT ────────────────────────────────────────────

@app.post("/convert/excel-to-ppt")
@limiter.limit("10/minute")
async def excel_to_ppt(request: Request, file: UploadFile = File(...)):
    try:
        import openpyxl
        from pptx import Presentation
        from pptx.util import Inches, Pt, Emu
        from pptx.dml.color import RGBColor
    except ImportError:
        raise HTTPException(500, "Run: pip install openpyxl python-pptx")

    inp = temp_path(".xlsx")
    out = temp_path(".pptx")
    try:
        inp.write_bytes(await safe_read_upload(file))
        wb = openpyxl.load_workbook(str(inp), data_only=True)
        prs = Presentation()
        prs.slide_width  = Inches(13.33)
        prs.slide_height = Inches(7.5)

        TITLE_LAYOUT   = prs.slide_layouts[0]
        CONTENT_LAYOUT = prs.slide_layouts[5]  # blank layout to draw manually
        TABLE_LAYOUT   = prs.slide_layouts[6]  # blank

        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]

            # Collect non-empty rows
            rows_data = []
            for row in ws.iter_rows(values_only=True):
                row_vals = [str(c) if c is not None else '' for c in row]
                if any(v.strip() for v in row_vals):
                    rows_data.append(row_vals)
            if not rows_data:
                continue

            # Trim trailing empty columns
            max_cols = max((len([c for c in r if c.strip()]) for r in rows_data), default=1)
            rows_data = [r[:max_cols] for r in rows_data]
            rows_data = [r + [''] * (max_cols - len(r)) for r in rows_data]

            # One slide per sheet — add title + table shape
            slide = prs.slides.add_slide(TABLE_LAYOUT)

            # Title text box at top
            title_box = slide.shapes.add_textbox(
                Inches(0.3), Inches(0.15), Inches(12.5), Inches(0.65)
            )
            tf = title_box.text_frame
            tf.word_wrap = False
            p = tf.paragraphs[0]
            run = p.add_run()
            run.text = sheet_name
            run.font.size = Pt(24)
            run.font.bold = True
            run.font.color.rgb = RGBColor(0x1a, 0x3a, 0x8f)

            # Add pptx table
            max_rows = min(len(rows_data), 30)  # cap at 30 rows per slide
            table_rows = rows_data[:max_rows]
            n_rows = len(table_rows)
            n_cols = max_cols

            left   = Inches(0.3)
            top    = Inches(0.9)
            width  = Inches(12.7)
            height = Inches(6.4)

            tbl_shape = slide.shapes.add_table(n_rows, n_cols, left, top, width, height)
            tbl = tbl_shape.table

            for ri, row in enumerate(table_rows):
                is_header = ri == 0
                for ci, val in enumerate(row):
                    cell = tbl.cell(ri, ci)
                    cell.text = val[:100]
                    tf2 = cell.text_frame
                    tf2.word_wrap = True
                    run2 = tf2.paragraphs[0].runs[0] if tf2.paragraphs[0].runs else tf2.paragraphs[0].add_run()
                    run2.text = val[:100]
                    run2.font.size = Pt(11 if is_header else 10)
                    run2.font.bold = is_header
                    # Header background
                    from pptx.oxml.ns import qn as pqn
                    from lxml import etree
                    tc = cell._tc
                    tcPr = tc.get_or_add_tcPr()
                    solidFill = etree.SubElement(tcPr, pqn('a:solidFill'))
                    srgbClr = etree.SubElement(solidFill, pqn('a:srgbClr'))
                    srgbClr.set('val', '1A3A8F' if is_header else ('EFF6FF' if ri % 2 == 0 else 'FFFFFF'))
                    if is_header:
                        run2.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

            # If sheet had more rows, add continuation slide
            if len(rows_data) > max_rows:
                remaining = rows_data[max_rows:]
                slide2 = prs.slides.add_slide(TABLE_LAYOUT)
                tb2 = slide2.shapes.add_textbox(Inches(0.3), Inches(0.15), Inches(12.5), Inches(0.65))
                tf3 = tb2.text_frame
                r3 = tf3.paragraphs[0].add_run()
                r3.text = f"{sheet_name} (continued)"
                r3.font.size = Pt(22); r3.font.bold = True
                r3.font.color.rgb = RGBColor(0x1a, 0x3a, 0x8f)

                n2 = min(len(remaining), 30)
                tbl2_shape = slide2.shapes.add_table(n2, n_cols, left, top, width, height)
                tbl2 = tbl2_shape.table
                for ri, row in enumerate(remaining[:n2]):
                    for ci, val in enumerate(row):
                        tbl2.cell(ri, ci).text = val[:100]

        if len(prs.slides) == 0:
            prs.slides.add_slide(prs.slide_layouts[6])

        prs.save(str(out))
        stem     = safe_filename(file.filename, "presentation")
        out_name = Path(stem).stem + ".pptx"
        return FileResponse(
            str(out),
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            filename=out_name,
            background=BackgroundTask(cleanup, inp, out)
        )
    except HTTPException:
        cleanup(inp, out)
        raise
    except Exception as e:
        cleanup(inp, out)
        raise safe_error(e, "excel-to-ppt")


# ─── 10. PPT → Excel ────────────────────────────────────────────

@app.post("/convert/ppt-to-excel")
@limiter.limit("10/minute")
async def ppt_to_excel(request: Request, file: UploadFile = File(...)):
    try:
        from pptx import Presentation as Pptx
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    except ImportError:
        raise HTTPException(500, "Run: pip install python-pptx openpyxl")

    inp = temp_path(".pptx")
    out = temp_path(".xlsx")
    try:
        inp.write_bytes(await safe_read_upload(file))
        prs = Pptx(str(inp))
        wb  = openpyxl.Workbook()
        wb.remove(wb.active)

        HDR_FILL  = PatternFill("solid", fgColor="1A3A8F")
        ALT_FILL  = PatternFill("solid", fgColor="EFF6FF")
        HDR_FONT  = Font(bold=True, color="FFFFFF", size=11)
        BODY_FONT = Font(size=10)
        THIN      = Side(style="thin")
        BORDER    = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
        WRAP      = Alignment(wrap_text=True, vertical="top")

        for slide_idx, slide in enumerate(prs.slides, 1):
            ws = wb.create_sheet(f"Slide_{slide_idx}")
            row_idx = 1

            # Slide title in first row
            title_text = ""
            for shape in slide.shapes:
                if shape.has_text_frame and shape.shape_type == 13:
                    title_text = shape.text_frame.text.strip()
                    break
            if not title_text:
                for shape in slide.shapes:
                    if hasattr(shape, 'placeholder_format') and shape.placeholder_format:
                        if shape.placeholder_format.idx == 0:
                            title_text = shape.text_frame.text.strip() if shape.has_text_frame else ''
                            break

            if title_text:
                cell = ws.cell(row_idx, 1, title_text)
                cell.font  = Font(bold=True, size=14, color="1A3A8F")
                cell.fill  = PatternFill("solid", fgColor="D1E4FF")
                cell.alignment = WRAP
                ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=4)
                row_idx += 2

            # Extract tables from slide
            for shape in slide.shapes:
                if shape.has_table:
                    tbl = shape.table
                    for ri, row in enumerate(tbl.rows):
                        is_header = ri == 0
                        for ci, cell in enumerate(row.cells):
                            c = ws.cell(row_idx, ci + 1, cell.text.strip())
                            c.font      = HDR_FONT if is_header else BODY_FONT
                            c.fill      = HDR_FILL if is_header else (ALT_FILL if row_idx % 2 == 0 else PatternFill())
                            c.border    = BORDER
                            c.alignment = WRAP
                        row_idx += 1
                    row_idx += 1  # gap after table

            # Extract text frames (non-title)
            for shape in slide.shapes:
                if not shape.has_text_frame:
                    continue
                is_title_shape = (hasattr(shape, 'placeholder_format') and
                                  shape.placeholder_format and
                                  shape.placeholder_format.idx == 0)
                if is_title_shape:
                    continue
                for para in shape.text_frame.paragraphs:
                    txt = para.text.strip()
                    if txt:
                        c = ws.cell(row_idx, 1, txt)
                        c.font      = BODY_FONT
                        c.alignment = WRAP
                        row_idx += 1

            # Auto-column widths
            from openpyxl.utils import get_column_letter
            for col in ws.columns:
                max_len = 0
                col_letter = get_column_letter(col[0].column)
                for cell in col:
                    try:
                        if cell.value:
                            max_len = max(max_len, len(str(cell.value)))
                    except Exception:
                        pass
                ws.column_dimensions[col_letter].width = min(max(max_len + 2, 12), 50)

        if not wb.sheetnames:
            wb.create_sheet("Sheet1")

        wb.save(str(out))
        stem     = safe_filename(file.filename, "spreadsheet")
        out_name = Path(stem).stem + ".xlsx"
        return FileResponse(
            str(out),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=out_name,
            background=BackgroundTask(cleanup, inp, out)
        )
    except HTTPException:
        cleanup(inp, out)
        raise
    except Exception as e:
        cleanup(inp, out)
        raise safe_error(e, "ppt-to-excel")


# ─── 11. Edit PDF (PyMuPDF redact + rewrite) ────────────────────


@app.post("/edit-pdf")
@limiter.limit("15/minute")
async def edit_pdf_endpoint(request: Request, file: UploadFile = File(...), edits: str = Form(...)):
    import pymupdf as fitz
    inp = temp_path(".pdf")
    out = temp_path(".pdf")
    try:
        inp.write_bytes(await safe_read_upload(file))
        check_pdf_page_count(inp, "edit-pdf")

        # Validate edits JSON — cap payload size to prevent memory abuse
        if len(edits) > 12_000_000:  # 12 MB max (allows replacement image assets)
            raise HTTPException(400, "Edit data is too large.")
        edit_actions = json.loads(edits)
        if not isinstance(edit_actions, list):
            raise HTTPException(400, "Invalid edit format.")

        doc = fitz.open(str(inp))

        # ── Font path resolver for Devanagari/Hindi ──────────────────────────
        _fonts_dir = Path(__file__).parent.parent / "public" / "fonts"

        def _resolve_font_path(bold: bool) -> Path | None:
            """Return the correct NotoSansDevanagari font path, or None if not found."""
            key = "NotoSansDevanagari-Bold.ttf" if bold else "NotoSansDevanagari-Regular.ttf"
            candidate = _fonts_dir / key
            if candidate.exists():
                return candidate
            candidate2 = Path(__file__).parent / "fonts" / key
            if candidate2.exists():
                return candidate2
            return None

        _registered_fonts: dict[int, set] = {}
        _hb_font_cache: dict = {}

        def _get_hb_components(font_path: Path):
            path_str = str(font_path)
            if path_str not in _hb_font_cache:
                import uharfbuzz as hb
                from fontTools.ttLib import TTFont
                blob = hb.Blob.from_file_path(path_str)
                face = hb.Face(blob)
                hb_font = hb.Font(face)
                tt_font = TTFont(path_str)
                glyph_set = tt_font.getGlyphSet()
                glyph_order = tt_font.getGlyphOrder()
                _hb_font_cache[path_str] = (hb, hb_font, face.upem, tt_font, glyph_set, glyph_order)
            return _hb_font_cache[path_str]

        def _q_to_cubic(p0, p1, p2):
            cp1 = fitz.Point(p0.x + 2/3 * (p1.x - p0.x), p0.y + 2/3 * (p1.y - p0.y))
            cp2 = fitz.Point(p2.x + 2/3 * (p1.x - p2.x), p2.y + 2/3 * (p1.y - p2.y))
            return cp1, cp2

        def _draw_vector_harfbuzz(
            target_page,
            text_str: str,
            font_file: Path,
            font_sz: float,
            orig_x: float,
            base_y: float,
            fill_rgb=(0, 0, 0),
            text_align=fitz.TEXT_ALIGN_LEFT,
            box_width: float = 0.0,
            is_italic: bool = False,
            underline: bool = False,
            strikethrough: bool = False,
        ):
            from fontTools.pens.recordingPen import RecordingPen
            hb, hb_font, upem, tt_font, glyph_set, glyph_order = _get_hb_components(font_file)
            scale_factor = font_sz / upem
            line_height = font_sz * 1.25
            shear = 0.2125 if is_italic else 0.0  # tan(12 deg)

            lines = text_str.replace("\r\n", "\n").split("\n")
            shaped_lines = []
            for line_txt in lines:
                if not line_txt:
                    shaped_lines.append(([], 0.0))
                    continue
                buf = hb.Buffer()
                buf.add_str(line_txt)
                buf.guess_segment_properties()
                hb.shape(hb_font, buf)
                pairs = list(zip(buf.glyph_infos, buf.glyph_positions))
                for info, _ in pairs:
                    if info.codepoint == 0:
                        cluster_ch = line_txt[info.cluster] if 0 <= info.cluster < len(line_txt) else ""
                        if cluster_ch and not cluster_ch.isspace():
                            raise ValueError(f"Unsupported glyph U+{ord(cluster_ch):04X} for vector HarfBuzz")
                adv = sum(pos.x_advance for _, pos in pairs) * scale_factor
                shaped_lines.append((pairs, adv))

            shape = target_page.new_shape()
            max_adv = 0.0
            deco_jobs = []

            for line_idx, (pairs, total_adv) in enumerate(shaped_lines):
                if total_adv > max_adv:
                    max_adv = total_adv
                if not pairs:
                    continue

                line_base_y = base_y + line_idx * line_height
                ins_x = orig_x
                if text_align == fitz.TEXT_ALIGN_CENTER and box_width > total_adv:
                    ins_x = orig_x + (box_width - total_adv) / 2
                elif text_align == fitz.TEXT_ALIGN_RIGHT and box_width > total_adv:
                    ins_x = orig_x + (box_width - total_adv)

                cur_x = ins_x
                cur_y = line_base_y

                def _pt(px: float, py: float) -> fitz.Point:
                    if shear != 0.0:
                        px = px + (line_base_y - py) * shear
                    return fitz.Point(px, py)

                for info, pos in pairs:
                    gid = info.codepoint
                    gname = glyph_order[gid]
                    pen = RecordingPen()
                    glyph_set[gname].draw(pen)

                    gx = cur_x + pos.x_offset * scale_factor
                    gy = cur_y - pos.y_offset * scale_factor

                    curr_pt = _pt(gx, gy)
                    start_pt = curr_pt

                    for op, args in pen.value:
                        if op == 'moveTo':
                            p = args[0]
                            curr_pt = _pt(gx + p[0] * scale_factor, gy - p[1] * scale_factor)
                            start_pt = curr_pt
                        elif op == 'lineTo':
                            p = args[0]
                            target = _pt(gx + p[0] * scale_factor, gy - p[1] * scale_factor)
                            shape.draw_line(curr_pt, target)
                            curr_pt = target
                        elif op == 'qCurveTo':
                            pts = [_pt(gx + p[0] * scale_factor, gy - p[1] * scale_factor) for p in args]
                            for i in range(len(pts) - 1):
                                p1 = pts[i]
                                p2 = pts[i+1] if i == len(pts)-2 else fitz.Point((pts[i].x + pts[i+1].x)/2, (pts[i].y + pts[i+1].y)/2)
                                cp1, cp2 = _q_to_cubic(curr_pt, p1, p2)
                                shape.draw_bezier(curr_pt, cp1, cp2, p2)
                                curr_pt = p2
                        elif op == 'curveTo':
                            p1, p2, p3 = [_pt(gx + p[0] * scale_factor, gy - p[1] * scale_factor) for p in args]
                            shape.draw_bezier(curr_pt, p1, p2, p3)
                            curr_pt = p3
                        elif op == 'closePath':
                            if curr_pt != start_pt:
                                shape.draw_line(curr_pt, start_pt)
                            curr_pt = start_pt

                    cur_x += pos.x_advance * scale_factor
                    cur_y -= pos.y_advance * scale_factor

                if (underline or strikethrough) and total_adv > 0:
                    deco_jobs.append((ins_x, line_base_y, total_adv))

            shape.finish(color=None, fill=fill_rgb, even_odd=True)
            shape.commit()

            if deco_jobs:
                deco_shape = target_page.new_shape()
                stroke_w = max(0.55, font_sz * 0.068)
                for dx0, dbase, dw in deco_jobs:
                    if underline:
                        uy = dbase + font_sz * 0.14
                        deco_shape.draw_line(fitz.Point(dx0, uy), fitz.Point(dx0 + dw, uy))
                    if strikethrough:
                        sy = dbase - font_sz * 0.30
                        deco_shape.draw_line(fitz.Point(dx0, sy), fitz.Point(dx0 + dw, sy))
                deco_shape.finish(color=fill_rgb, width=stroke_w)
                deco_shape.commit()

            return max_adv

        def _decode_data_url_bytes(raw_url: str) -> bytes | None:
            if not raw_url or not isinstance(raw_url, str):
                return None
            import base64 as _b64
            payload_b64 = raw_url.split(",", 1)[-1] if raw_url.startswith("data:") else raw_url
            try:
                return _b64.b64decode(payload_b64)
            except Exception:
                return None

        for action in edit_actions:
            page_idx = action.get("page", 0)
            if page_idx >= len(doc):
                continue
            page = doc[page_idx]
            action_type = str(action.get("type") or "text").strip().lower()

            # PyMuPDF uses TOP-LEFT origin (same as browser canvas).
            # Frontend divides canvas coords by viewport.scale before sending,
            # so x,y,w,h are already in PDF points with y measured from top.
            x   = float(action["x"])
            y   = float(action["y"])   # top of text bounding box, from top of page
            w   = float(action["w"])
            h   = float(action["h"])
            orig_x = float(action.get("origX", x))
            orig_y = float(action.get("origY", y))
            orig_w = float(action.get("origW", w))
            orig_h = float(action.get("origH", h))

            if action_type == "magic_erase":
                erase_rect = fitz.Rect(x, y, x + w, y + h) & page.rect
                if erase_rect.width < 2 or erase_rect.height < 2:
                    continue
                # Strip text & annotations inside erase_rect without painting flat fill first
                try:
                    page.add_redact_annot(erase_rect, fill=None)
                    page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)
                except Exception:
                    pass
                try:
                    from scan_blender import erase_region_seamlessly
                    erase_res = erase_region_seamlessly(page, erase_rect)
                    if erase_res is not None:
                        page.insert_image(erase_res["paste_rect"], stream=erase_res["png_bytes"])
                except Exception as erase_err:
                    logger.warning(f"[EditPDF] Magic erase fallback triggered: {erase_err}")
                    page.add_redact_annot(erase_rect, fill=(1, 1, 1))
                    page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_PIXELS)
                continue

            if action_type in ("delete_image", "replace_image", "move_image"):
                orig_rect = fitz.Rect(orig_x, orig_y, orig_x + orig_w, orig_y + orig_h) & page.rect
                target_rect = fitz.Rect(x, y, x + w, y + h) & page.rect
                try:
                    xref = int(action.get("xref") or 0)
                except (TypeError, ValueError):
                    xref = 0
                asset_source = str(action.get("source") or ("native" if xref > 0 else "scan")).lower()
                img_bytes = _decode_data_url_bytes(str(action.get("imageDataUrl") or ""))

                # Same-box native replace stays cleanly in-place via doc.replace_image
                same_box = (
                    abs(target_rect.x0 - orig_rect.x0) < 1.5
                    and abs(target_rect.y0 - orig_rect.y0) < 1.5
                    and abs(target_rect.width - orig_rect.width) < 1.5
                    and abs(target_rect.height - orig_rect.height) < 1.5
                )
                if action_type == "replace_image" and asset_source == "native" and xref > 0 and same_box and img_bytes:
                    try:
                        page.replace_image(xref, stream=img_bytes)
                        continue
                    except Exception:
                        pass

                # If moving a raster crop without imageDataUrl, snapshot it before inpainting orig_rect
                if action_type == "move_image" and not img_bytes and orig_rect.width >= 2 and orig_rect.height >= 2:
                    try:
                        snap_pix = page.get_pixmap(dpi=200, clip=orig_rect, alpha=False)
                        img_bytes = snap_pix.tobytes("png")
                    except Exception:
                        img_bytes = None

                # Remove old placement cleanly
                removed_native = False
                if asset_source == "native" and xref > 0:
                    try:
                        rects_for_xref = page.get_image_rects(xref)
                        if len(rects_for_xref) <= 1 and hasattr(page, "delete_image"):
                            page.delete_image(xref)
                            removed_native = True
                    except Exception:
                        removed_native = False

                if not removed_native and orig_rect.width >= 2 and orig_rect.height >= 2:
                    if asset_source == "native":
                        try:
                            page.add_redact_annot(orig_rect, fill=None)
                            page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_REMOVE)
                            removed_native = True
                        except Exception:
                            removed_native = False
                    if not removed_native:
                        try:
                            from scan_blender import erase_region_seamlessly
                            erase_res = erase_region_seamlessly(page, orig_rect)
                            if erase_res is not None:
                                page.insert_image(erase_res["paste_rect"], stream=erase_res["png_bytes"])
                        except Exception:
                            page.add_redact_annot(orig_rect, fill=(1, 1, 1))
                            page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_PIXELS)

                if action_type in ("replace_image", "move_image") and img_bytes and target_rect.width >= 2 and target_rect.height >= 2:
                    page.insert_image(target_rect, stream=img_bytes, keep_proportion=False)
                continue

            new_text = action.get("newText", "")

            # Redact: use exact bounding box of the ORIGINAL text to delete it from source
            rect = fitz.Rect(orig_x, orig_y, orig_x + orig_w, orig_y + orig_h)
            annot_rect = fitz.Rect(orig_x - 0.5, orig_y - 0.5, orig_x + orig_w + 0.5, orig_y + orig_h + 0.5)

            # Extract dominant visible/matching span inside annot_rect by overlap ratio & center proximity
            orig_dict = page.get_text("dict", clip=annot_rect)
            detected_baseline = None
            detected_font = None
            detected_size = None
            tight_redact_rect = None
            best_score = -1e9
            rect_mid_x = (rect.x0 + rect.x1) * 0.5
            rect_mid_y = (rect.y0 + rect.y1) * 0.5
            for blk in orig_dict.get("blocks", []):
                for ln in blk.get("lines", []):
                    for sp in ln.get("spans", []):
                        sp_txt = sp.get("text", "").strip()
                        if not sp_txt:
                            continue
                        sb = sp.get("bbox", [0, 0, 0, 0])
                        sp_r = fitz.Rect(sb)
                        overlap = sp_r & rect
                        ov_area = overlap.width * overlap.height if not overlap.is_empty else 0.0
                        if ov_area <= 0.0:
                            continue
                        sp_area = max(1.0, sp_r.width * sp_r.height)
                        ov_frac = ov_area / min(sp_area, max(1.0, rect.width * rect.height))
                        sp_mid_y = (sb[1] + sb[3]) * 0.5
                        sp_mid_x = (sb[0] + sb[2]) * 0.5
                        score = ov_frac * 50.0 + ov_area - abs(sp_mid_y - rect_mid_y) * 6.0 - abs(sp_mid_x - rect_mid_x) * 0.2
                        if score > best_score:
                            best_score = score
                            detected_baseline = sp.get("origin", [0, 0])[1]
                            detected_font = sp.get("font")
                            detected_size = sp.get("size")
                        # Include span vertically in tight redaction bounds if on same visual line
                        if abs(sp_mid_y - rect_mid_y) <= max(3.5, rect.height * 0.42):
                            clipped_sp = fitz.Rect(
                                max(rect.x0 - 0.25, sp_r.x0),
                                max(rect.y0 - 0.25, sp_r.y0),
                                min(rect.x1 + 0.25, sp_r.x1),
                                min(rect.y1 + 0.25, sp_r.y1),
                            )
                            if clipped_sp.width > 0 and clipped_sp.height > 0:
                                tight_redact_rect = clipped_sp if tight_redact_rect is None else (tight_redact_rect | clipped_sp)

            # Narrow redaction rect slightly away from vector table borders so borders stay 100% intact
            redact_box = tight_redact_rect if (tight_redact_rect is not None and not tight_redact_rect.is_empty) else rect
            try:
                for dr in page.get_drawings():
                    dr_r = fitz.Rect(dr.get("rect", (0, 0, 0, 0)))
                    if dr_r.is_empty or not dr_r.intersects(redact_box):
                        continue
                    # Horizontal border rule (wide & thin)
                    if dr_r.width >= 12.0 and dr_r.height <= 3.0:
                        if dr_r.y1 <= redact_box.y0 + 3.0 and dr_r.y1 < redact_box.y1 - 2.0:
                            redact_box.y0 = max(redact_box.y0, dr_r.y1 + 0.35)
                        elif dr_r.y0 >= redact_box.y1 - 3.0 and dr_r.y0 > redact_box.y0 + 2.0:
                            redact_box.y1 = min(redact_box.y1, dr_r.y0 - 0.35)
                    # Vertical border rule (tall & thin)
                    elif dr_r.height >= 12.0 and dr_r.width <= 3.0:
                        if dr_r.x1 <= redact_box.x0 + 3.0 and dr_r.x1 < redact_box.x1 - 2.0:
                            redact_box.x0 = max(redact_box.x0, dr_r.x1 + 0.35)
                        elif dr_r.x0 >= redact_box.x1 - 3.0 and dr_r.x0 > redact_box.x0 + 2.0:
                            redact_box.x1 = min(redact_box.x1, dr_r.x0 - 0.35)
            except Exception:
                pass
            if redact_box.width < 1.0 or redact_box.height < 1.0:
                redact_box = rect

            # Distinguish true VISIBLE vector text (render_mode != 3) from invisible OCR 3-Tr text
            # sitting over a scanned raster image!
            traces_in_rect = [
                t for t in page.get_texttrace()
                if fitz.Rect(t.get("bbox", (0, 0, 0, 0))).intersects(annot_rect)
            ]
            has_visible_native = any(t.get("type", 0) != 3 for t in traces_in_rect)
            has_invisible_ocr = any(t.get("type", 0) == 3 for t in traces_in_rect)

            page_image_rects = []
            try:
                for img_info in page.get_images(full=True):
                    page_image_rects.extend(page.get_image_rects(img_info[0]))
            except Exception:
                page_image_rects = []
            has_raster_underneath = any(ir.intersects(annot_rect) for ir in page_image_rects)

            fg_color  = hex_to_rgb(action.get("color", "#000000"))
            has_explicit_size = action.get("fontSize") is not None
            orig_size = float(action.get("fontSize") or detected_size or 12)
            is_bold   = bool(action.get("bold"))
            is_italic = bool(action.get("italic"))
            is_underline = bool(action.get("underline"))
            is_strike    = bool(action.get("strikethrough"))

            # Smart font matching based on detected/specified font family
            # Strip "sans-serif" before checking for "serif" substring!
            f_fam = str(action.get("fontFamily") or action.get("fontName") or detected_font or "").lower()
            f_fam_clean = f_fam.replace("sans-serif", "").replace("sans serif", "")
            is_serif = any(x in f_fam_clean for x in [
                "times", "serif", "georgia", "palatino", "garamond", "cambria",
                "roman", "bookman", "minion", "baskerville", "caslon"
            ])
            is_mono = any(x in f_fam_clean for x in [
                "courier", "mono", "consolas", "code", "menlo", "inconsolata",
                "sourcecode", "jetbrains", "lucida"
            ])

            if is_serif:
                if is_bold and is_italic:
                    fontname = "tibi"
                elif is_bold:
                    fontname = "tibo"
                elif is_italic:
                    fontname = "tiit"
                else:
                    fontname = "tiro"
            elif is_mono:
                if is_bold and is_italic:
                    fontname = "cobi"
                elif is_bold:
                    fontname = "cobo"
                elif is_italic:
                    fontname = "coit"
                else:
                    fontname = "cour"
            else:
                if is_bold and is_italic:
                    fontname = "hebi"
                elif is_bold:
                    fontname = "hebo"
                elif is_italic:
                    fontname = "heit"
                else:
                    fontname = "helv"

            # Resolve exact metric-matched TTF font on disk when available (e.g. Verdana/Georgia/Arial/Times)
            native_ttf_path: Path | None = None
            native_fitz_font = None
            if new_text and not has_non_latin(new_text):
                try:
                    from scan_blender import _resolve_render_font_spec
                    cand_ttf, _ = _resolve_render_font_spec(
                        has_hindi=False,
                        is_serif=is_serif,
                        is_mono=is_mono,
                        is_bold=is_bold,
                        is_italic=is_italic,
                        preferred_family=f_fam,
                    )
                    if cand_ttf is not None:
                        cand_font_obj = fitz.Font(fontfile=str(cand_ttf))
                        if all(ch.isspace() or cand_font_obj.has_glyph(ord(ch)) > 0 for ch in new_text):
                            native_ttf_path = cand_ttf
                            native_fitz_font = cand_font_obj
                except Exception:
                    native_ttf_path = None
                    native_fitz_font = None

            # Alignment support
            align_req = str(action.get("align", "left")).lower()
            if align_req == "center":
                align = fitz.TEXT_ALIGN_CENTER
            elif align_req == "right":
                align = fitz.TEXT_ALIGN_RIGHT
            elif align_req == "justify":
                align = fitz.TEXT_ALIGN_JUSTIFY
            else:
                align = fitz.TEXT_ALIGN_LEFT

            dy = y - orig_y
            dy_eff = 0.0 if (detected_baseline is not None and abs(dy) < 1.2) else dy
            req_baseline = action.get("baseline")
            if detected_baseline is not None and (req_baseline is None or abs(float(req_baseline) - detected_baseline) <= 3.5):
                base_anchor = detected_baseline
            elif req_baseline is not None:
                base_anchor = float(req_baseline)
            else:
                base_anchor = detected_baseline

            if base_anchor is not None:
                baseline_y = base_anchor + dy_eff
            elif h > 0:
                baseline_y = y + orig_size * 0.94
            else:
                baseline_y = None

            if has_visible_native or (has_invisible_ocr and not has_raster_underneath):
                # Pure vector PDF: tight layer-safe text deletion protecting adjacent borders & rows
                page.add_redact_annot(redact_box, fill=None)
                page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)
            else:
                # Scanned PDF OR Searchable OCR PDF over raster image:
                # Use Adobe-style Seamless Scan Blender (texture-preserving inpainting +
                # neighbor ink/stroke/blur/grain matching + tight feathered RGBA composite)
                seamless_applied = False
                try:
                    from scan_blender import apply_seamless_scan_edit
                    scan_base = baseline_y if baseline_y is not None else (y + orig_size * 0.85)
                    scan_res = apply_seamless_scan_edit(
                        page=page,
                        orig_rect=rect,
                        new_x=x,
                        new_y=y,
                        new_w=w,
                        new_h=h,
                        new_text=new_text,
                        font_size_pt=orig_size,
                        baseline_pt=scan_base,
                        fg_rgb=fg_color,
                        is_bold=is_bold,
                        is_italic=is_italic,
                        is_serif=is_serif,
                        is_mono=is_mono,
                        underline=is_underline,
                        strikethrough=is_strike,
                        text_align=align,
                        has_explicit_size=has_explicit_size,
                        preferred_family=f_fam,
                        line_height_ratio=float(action.get("lineHeightRatio") or 1.25),
                    )
                    if scan_res is not None:
                        # Remove old invisible 3-Tr OCR text cleanly without painting flat boxes
                        if has_invisible_ocr:
                            page.add_redact_annot(annot_rect, fill=None)
                            page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)
                        page.insert_image(scan_res["paste_rect"], stream=scan_res["png_bytes"])
                        # Keep newly edited word searchable via invisible render_mode=3 text layer
                        if new_text.strip():
                            try:
                                tr = scan_res["text_rect"]
                                s_fs = max(4.0, float(scan_res["font_size_pt"]))
                                s_base = float(scan_res["baseline_pt"])
                                if has_non_latin(new_text):
                                    d_path = _resolve_font_path(is_bold)
                                    if d_path is not None:
                                        page.insert_text(
                                            fitz.Point(tr.x0, s_base),
                                            new_text.replace("\n", " "),
                                            fontsize=s_fs,
                                            fontname="scan_dev_ocr",
                                            fontfile=str(d_path),
                                            render_mode=3,
                                        )
                                else:
                                    page.insert_text(
                                        fitz.Point(tr.x0, s_base),
                                        new_text.replace("\n", " "),
                                        fontsize=s_fs,
                                        fontname="helv",
                                        render_mode=3,
                                    )
                            except Exception:
                                pass
                        seamless_applied = True
                except Exception as scan_err:
                    logger.warning(f"[EditPDF] Seamless scan blend fallback triggered: {scan_err}")

                if seamless_applied:
                    continue

                # Fallback redaction path if scan_blender could not run
                bg_color = (1, 1, 1)
                bg_req = str(action.get("bgColor", "")).strip().lower()
                if bg_req in ["#ffffff", "#fbfcfc", "#fcfcfc", "#fafafa", "#f7f7f7", "white"]:
                    bg_color = (1, 1, 1)
                elif bg_req.startswith("#") and len(bg_req) == 7:
                    try:
                        parsed_bg = hex_to_rgb(bg_req)
                        lum_bg = 0.299 * parsed_bg[0] + 0.587 * parsed_bg[1] + 0.114 * parsed_bg[2]
                        chroma_bg = max(parsed_bg) - min(parsed_bg)
                        is_neutral_white = (lum_bg >= 0.94) or (chroma_bg <= 0.085 and lum_bg >= 0.78)
                        bg_color = (1, 1, 1) if is_neutral_white else parsed_bg
                    except Exception:
                        bg_color = (1, 1, 1)
                else:
                    try:
                        ring_rect = fitz.Rect(
                            max(0.0, rect.x0 - 2.0),
                            max(0.0, rect.y0 - 2.0),
                            min(page.rect.width, rect.x1 + 2.0),
                            min(page.rect.height, rect.y1 + 2.0),
                        )
                        pm = page.get_pixmap(clip=ring_rect)
                        edges = []
                        if pm.width >= 2 and pm.height >= 2:
                            for px in range(pm.width):
                                edges.append(pm.pixel(px, 0)[:3])
                                edges.append(pm.pixel(px, pm.height - 1)[:3])
                            for py in range(pm.height):
                                edges.append(pm.pixel(0, py)[:3])
                                edges.append(pm.pixel(pm.width - 1, py)[:3])
                        if edges:
                            edges.sort(key=lambda c: 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2], reverse=True)
                            bright = edges[:max(1, len(edges) // 2)]
                            r_b = sum(c[0] for c in bright) / len(bright)
                            g_b = sum(c[1] for c in bright) / len(bright)
                            b_b = sum(c[2] for c in bright) / len(bright)
                            lum_b = 0.299 * r_b + 0.587 * g_b + 0.114 * b_b
                            chroma_b = max(r_b, g_b, b_b) - min(r_b, g_b, b_b)
                            if lum_b >= 242 or (chroma_b <= 22 and lum_b >= 200):
                                bg_color = (1, 1, 1)
                            else:
                                bg_color = (r_b / 255.0, g_b / 255.0, b_b / 255.0)
                    except Exception:
                        bg_color = (1, 1, 1)

                # Clear original raster text + invisible OCR layer cleanly using orig_* coords
                clean_scan_rect = fitz.Rect(orig_x - 0.8, orig_y - 0.8, orig_x + orig_w + 0.8, orig_y + orig_h + 1.4)
                page.add_redact_annot(clean_scan_rect, fill=bg_color)
                page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_PIXELS)

            if not new_text:
                continue

            # ── Hindi/Devanagari font handling with True Native Vector HarfBuzz ──
            inserted = False
            if has_non_latin(new_text):
                deva_path = _resolve_font_path(is_bold)
                if deva_path is not None:
                    text_size = orig_size
                    if not has_explicit_size and detected_size is not None:
                        text_size = detected_size

                    base_calc = baseline_y if baseline_y is not None else (y + text_size * 0.90)

                    try:
                        # 1. Pure Native PDF Vector Bézier path insertion shaped via HarfBuzz
                        # Eliminates broken virama tofu boxes (□) in Adobe Acrobat and keeps 100% crisp vector outlines
                        _draw_vector_harfbuzz(
                            target_page=page,
                            text_str=new_text,
                            font_file=deva_path,
                            font_sz=text_size,
                            orig_x=x,
                            base_y=base_calc,
                            fill_rgb=fg_color,
                            text_align=align,
                            box_width=w,
                            is_italic=is_italic,
                            underline=is_underline,
                            strikethrough=is_strike,
                        )
                        inserted = True
                    except Exception as vector_err:
                        logger.warning(f"[EditPDF] Vector HarfBuzz drawing failed: {vector_err}. Falling back to Pillow PNG.")
                        try:
                            from PIL import Image, ImageDraw, ImageFont
                            import io
                            RENDER_SCALE = 4
                            pil_font = ImageFont.truetype(str(deva_path), int(text_size * RENDER_SCALE), layout_engine=ImageFont.Layout.RAQM)
                            bbox = pil_font.getbbox(new_text)
                            txt_w = max(4, bbox[2] - bbox[0])
                            txt_h = max(4, bbox[3] - bbox[1])
                            pil_img = Image.new("RGBA", (txt_w, txt_h), (0, 0, 0, 0))
                            pil_draw = ImageDraw.Draw(pil_img)
                            r_i, g_i, b_i = int(fg_color[0] * 255), int(fg_color[1] * 255), int(fg_color[2] * 255)
                            pil_draw.text((-bbox[0], -bbox[1]), new_text, font=pil_font, fill=(r_i, g_i, b_i, 255))
                            buf = io.BytesIO()
                            pil_img.save(buf, format="PNG")
                            deva_png = buf.getvalue()
                            img_w_pt = txt_w / RENDER_SCALE
                            img_h_pt = txt_h / RENDER_SCALE
                            ins_x = x
                            if align == fitz.TEXT_ALIGN_CENTER:
                                ins_x = x + (w - img_w_pt) / 2
                            elif align == fitz.TEXT_ALIGN_RIGHT:
                                ins_x = x + w - img_w_pt
                            ascent, _ = pil_font.getmetrics()
                            ins_y = (base_calc - (ascent - bbox[1]) / RENDER_SCALE)
                            img_rect = fitz.Rect(ins_x, ins_y, ins_x + img_w_pt, ins_y + img_h_pt)
                            page.insert_image(img_rect, stream=deva_png)
                            inserted = True
                        except Exception as deva_err:
                            logger.warning(f"[EditPDF] Pillow HarfBuzz rendering failed: {deva_err}. Falling back to insert_font.")
                            fontname = "NotoDevaB" if is_bold else "NotoDeva"
                            page_fonts = _registered_fonts.setdefault(page_idx, set())
                            if fontname not in page_fonts:
                                try:
                                    font_bytes = deva_path.read_bytes()
                                    page.insert_font(fontname=fontname, fontbuffer=font_bytes)
                                    page_fonts.add(fontname)
                                except Exception:
                                    pass
                else:
                    logger.warning(f"[EditPDF] Devanagari font not found at {_fonts_dir}.")
            # ─────────────────────────────────────────────────────────────────

            # Register matched metric TTF font on page if available
            active_fontname = fontname
            active_fontfile = None
            if native_ttf_path is not None and native_fitz_font is not None:
                try:
                    ttf_key = f"EdTTF_{abs(hash(str(native_ttf_path))) % 100000}"
                    page_fonts = _registered_fonts.setdefault(page_idx, set())
                    if ttf_key not in page_fonts:
                        page.insert_font(fontname=ttf_key, fontfile=str(native_ttf_path))
                        page_fonts.add(ttf_key)
                    active_fontname = ttf_key
                    active_fontfile = str(native_ttf_path)
                except Exception:
                    active_fontname = fontname
                    active_fontfile = None

            # If native text baseline is detected, insert each line anchored at exact PDF baseline
            if not inserted and baseline_y is not None:
                try:
                    text_size = orig_size
                    if not has_explicit_size and detected_size is not None:
                        text_size = detected_size

                    eff_lh_ratio = max(1.02, min(1.85, float(action.get("lineHeightRatio") or 1.22)))
                    text_lines = new_text.replace("\r\n", "\n").split("\n")
                    line_step_pt = text_size * eff_lh_ratio
                    all_lines_ok = True

                    for li, line_txt in enumerate(text_lines):
                        if not line_txt:
                            continue
                        cur_base_y = baseline_y + li * line_step_pt
                        ins_x = x
                        if native_fitz_font is not None and active_fontfile is not None:
                            ins_w = native_fitz_font.text_length(line_txt, fontsize=text_size)
                        else:
                            ins_w = fitz.get_text_length(line_txt, fontname=fontname, fontsize=text_size)
                        if align == fitz.TEXT_ALIGN_CENTER and w > ins_w:
                            ins_x = x + (w - ins_w) / 2
                        elif align == fitz.TEXT_ALIGN_RIGHT and w > ins_w:
                            ins_x = x + w - ins_w

                        try:
                            page.insert_text(
                                fitz.Point(ins_x, cur_base_y),
                                line_txt,
                                fontsize=text_size,
                                fontname=active_fontname,
                                fontfile=active_fontfile,
                                color=fg_color,
                            )
                        except Exception:
                            page.insert_text(
                                fitz.Point(ins_x, cur_base_y),
                                line_txt,
                                fontsize=text_size,
                                fontname=fontname,
                                color=fg_color,
                            )
                        if is_underline or is_strike:
                            deco_shape = page.new_shape()
                            stroke_w = max(0.55, text_size * 0.068)
                            if is_underline:
                                uy = cur_base_y + text_size * 0.14
                                deco_shape.draw_line(fitz.Point(ins_x, uy), fitz.Point(ins_x + ins_w, uy))
                            if is_strike:
                                sy = cur_base_y - text_size * 0.30
                                deco_shape.draw_line(fitz.Point(ins_x, sy), fitz.Point(ins_x + ins_w, sy))
                            deco_shape.finish(color=fg_color, width=stroke_w)
                            deco_shape.commit()
                    inserted = all_lines_ok
                except Exception as ins_err:
                    logger.warning(f"[EditPDF] Baseline text insert error: {ins_err}")

            if not inserted:
                # Use insert_textbox for multiline wrapping and proper baseline handling
                text_rect = fitz.Rect(x, y, x + w, y + h)
                rc = -1
                final_size = orig_size
                min_size = max(0.5, orig_size * 0.3)

                # Try to fit the text box, reducing font size if it doesn't fit
                while final_size >= min_size:
                    rc = page.insert_textbox(
                        text_rect,
                        new_text,
                        fontsize=final_size,
                        fontname=active_fontname,
                        color=fg_color,
                        align=align,
                    )
                    if rc >= 0:
                        break
                    final_size -= max(0.2, orig_size * 0.05)

                # If it still didn't fit, force it at the minimum size
                if rc < 0:
                    try:
                        page.insert_textbox(
                            text_rect,
                            new_text,
                            fontsize=final_size,
                            fontname=active_fontname,
                            color=fg_color,
                            align=align,
                        )
                    except Exception:
                        page.insert_textbox(
                            text_rect,
                            new_text,
                            fontsize=final_size,
                            fontname=fontname,
                            color=fg_color,
                            align=align,
                        )

        doc.save(str(out), garbage=3, deflate=True)
        doc.close()

        stem = safe_filename(file.filename, "document")
        out_name = "edited_" + stem
        return FileResponse(str(out), media_type="application/pdf",
                            filename=out_name,
                            background=BackgroundTask(cleanup, inp, out))
    except HTTPException:
        cleanup(inp, out)
        raise
    except Exception as e:
        cleanup(inp, out)

        raise safe_error(e, "edit-pdf")


# ─── 8b. Text Layout Analyzer ─────────────────────────────────
# Returns rich span-level text info for the Advanced Editor frontend.
# Uses fitz get_text("dict") which gives per-span: font, size, color, bold/italic, bbox.
# This is much richer than what pdfjs textContent provides.

@app.post("/analyze/text-layout")
@limiter.limit("30/minute")
async def analyze_text_layout(
    request: Request,
    file: UploadFile = File(...),
    page: int = Form(0)
):
    """
    Analyze a single page of a PDF and return span-level text layout info.
    """
    import pymupdf as fitz
    from vision_reconstructor import extract_native_text_layout

    inp = temp_path(".pdf")
    try:
        raw_bytes = await safe_read_upload(file)
        cache_key = f"text_layout:{hashlib.sha256(raw_bytes).hexdigest()}:{page}"
        cached = RESULT_CACHE.get(cache_key)
        if cached is not None:
            return Response(content=cached[0], media_type=cached[1], headers={"X-Cache": "HIT"})

        inp.write_bytes(raw_bytes)
        doc = fitz.open(str(inp))
        try:
            if page < 0 or page >= len(doc):
                raise HTTPException(400, f"Page index {page} is out of range (0 to {len(doc)-1}).")
            layout = extract_native_text_layout(doc[page])
        finally:
            doc.close()

        payload_bytes = json.dumps({"page": page, **layout}).encode("utf-8")
        RESULT_CACHE.put(cache_key, payload_bytes, "application/json")
        return Response(content=payload_bytes, media_type="application/json", headers={"X-Cache": "MISS"})
    except HTTPException:
        raise
    except Exception as e:
        raise safe_error(e, "analyze/text-layout")
    finally:
        cleanup(inp)


@app.post("/analyze/page-layers")
@limiter.limit("20/minute")
async def analyze_page_layers(
    request: Request,
    file: UploadFile = File(...),
    page: int = Form(0),
    lang: str = Form("auto"),
    strict_local: bool = Form(False),
):
    """
    Extract unified layer-wise page metadata (text, objects/images, tables, blank form fields)
    for both native vector and scanned PDFs.
    """
    import pymupdf as fitz
    from ocr_engine import resolve_ocr_lang
    from vision_reconstructor import extract_page_layers_for_editor

    inp = temp_path(".pdf")
    try:
        raw_bytes = await safe_read_upload(file)
        norm_lang = resolve_ocr_lang(lang)
        cache_key = f"page_layers:{hashlib.sha256(raw_bytes).hexdigest()}:{page}:{norm_lang}:{int(bool(strict_local))}"
        cached = RESULT_CACHE.get(cache_key)
        if cached is not None:
            return Response(content=cached[0], media_type=cached[1], headers={"X-Cache": "HIT"})

        inp.write_bytes(raw_bytes)
        check_pdf_page_count(inp, "analyze/page-layers")
        doc = fitz.open(str(inp))
        total_pages = len(doc)
        doc.close()
        if page < 0 or page >= total_pages:
            raise HTTPException(400, f"Page index {page} is out of range (0 to {total_pages - 1}).")

        layers = await run_in_threadpool(
            extract_page_layers_for_editor,
            inp,
            page,
            norm_lang,
            bool(strict_local),
        )
        payload_bytes = json.dumps(layers).encode("utf-8")
        RESULT_CACHE.put(cache_key, payload_bytes, "application/json")
        return Response(content=payload_bytes, media_type="application/json", headers={"X-Cache": "MISS"})
    except HTTPException:
        raise
    except Exception as e:
        raise safe_error(e, "analyze/page-layers")
    finally:
        cleanup(inp)


# ─── 8c. Image Replacement ─────────────────────────────────────
# Replace an existing image in a PDF page with a new image.
# Uses PyMuPDF page.replace_image() for accurate in-place replacement.

@app.post("/edit-pdf/replace-image")
@limiter.limit("15/minute")
async def replace_pdf_image(
    request: Request,
    file: UploadFile = File(...),
    image: UploadFile = File(...),
    page: int = Form(0),
    xref: int = Form(-1),  # -1 = auto-select first image on page
):
    """
    Replace an existing image in a PDF with a new uploaded image.
    xref: the PDF object reference number of the image to replace.
          If -1, the first image found on the page is replaced.
    """
    import pymupdf as fitz
    inp = temp_path(".pdf")
    out = temp_path(".pdf")
    img_path = temp_path(".png")
    try:
        inp.write_bytes(await safe_read_upload(file))
        img_bytes = await safe_read_upload(image)
        img_path.write_bytes(img_bytes)

        check_pdf_page_count(inp, "edit-pdf/replace-image")

        doc = fitz.open(str(inp))
        if page < 0 or page >= len(doc):
            raise HTTPException(400, f"Page index {page} out of range.")

        pg = doc[page]
        image_list = pg.get_images(full=True)

        if not image_list:
            raise HTTPException(404, "No images found on the specified page.")

        # Find target xref
        target_xref = xref
        if target_xref <= 0:
            # Auto-select the largest image on the page
            best = max(image_list, key=lambda img: img[2] * img[3])  # sort by w*h
            target_xref = best[0]

        # Validate xref exists in image list
        valid_xrefs = {img[0] for img in image_list}
        if target_xref not in valid_xrefs:
            raise HTTPException(404, f"Image xref {target_xref} not found on page {page}.")

        # Replace the image
        pg.replace_image(target_xref, filename=str(img_path))

        doc.save(str(out), garbage=3, deflate=True)
        doc.close()

        stem = safe_filename(file.filename, "document")
        out_name = "img_replaced_" + stem
        return FileResponse(
            str(out), media_type="application/pdf",
            filename=out_name,
            background=BackgroundTask(cleanup, inp, out, img_path)
        )
    except HTTPException:
        cleanup(inp, out, img_path)
        raise
    except Exception as e:
        cleanup(inp, out, img_path)
        raise safe_error(e, "edit-pdf/replace-image")


# ─── 9. CMYK Color Converter ───────────────────────────────────
# Converts RGB PDF to CMYK color space for professional printing.
# Uses Ghostscript (already required for compress-pdf).

@app.post("/convert/cmyk")
@limiter.limit("10/minute")
async def convert_to_cmyk(request: Request, file: UploadFile = File(...)):
    """
    Convert an RGB PDF to CMYK color space using Ghostscript.
    Required for professional offset printing (ISO Coated v2 compatible).
    """
    inp = temp_path(".pdf")
    out = temp_path("_cmyk.pdf")
    try:
        inp.write_bytes(await safe_read_upload(file))
        check_pdf_page_count(inp, "convert-cmyk")

        gs_cmd = [
            "gs",
            "-dBATCH", "-dNOPAUSE", "-dQUIET",
            "-dSAFER",
            "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.4",
            "-sColorConversionStrategy=CMYK",
            "-dProcessColorModel=/DeviceCMYK",
            "-dOverrideICC=true",
            f"-sOutputFile={out}",
            str(inp)
        ]

        try:
            result = subprocess.run(
                gs_cmd, check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                timeout=120
            )
        except subprocess.CalledProcessError as e:
            logger.error(f"[CMYK] Ghostscript failed: {e.stderr[:300] if e.stderr else 'no stderr'}")
            raise RuntimeError("Ghostscript CMYK conversion failed.")
        except FileNotFoundError:
            raise HTTPException(500, "Ghostscript is not installed on this server. Cannot perform CMYK conversion.")

        if not out.exists() or out.stat().st_size == 0:
            raise RuntimeError("CMYK output PDF not generated.")

        stem = safe_filename(file.filename, "document")
        out_name = Path(stem).stem + "_CMYK.pdf"
        return FileResponse(
            str(out), media_type="application/pdf",
            filename=out_name,
            background=BackgroundTask(cleanup, inp, out)
        )
    except HTTPException:
        cleanup(inp, out)
        raise
    except Exception as e:
        cleanup(inp, out)
        raise safe_error(e, "convert-cmyk")


# ─── 10. PDF Repair (Corrupt PDF Recovery) ─────────────────────
# Multi-strategy: Ghostscript → mutool → PyMuPDF open(repair=True)

@app.post("/repair-pdf")
@limiter.limit("10/minute")
async def repair_pdf(request: Request, file: UploadFile = File(...)):
    """
    Attempt to repair a corrupted or partially downloaded PDF.
    Tries 3 fallback strategies in order:
      1. Ghostscript (best for structural XREF/stream errors)
      2. mutool clean (MuPDF CLI — good for linearization errors)
      3. PyMuPDF open with garbage collection (last resort)
    """
    inp = temp_path(".pdf")
    out = temp_path("_repaired.pdf")
    try:
        raw_data = await safe_read_upload(file)
        inp.write_bytes(raw_data)

        repaired = False
        strategy_used = "unknown"

        # Strategy 1: Ghostscript rebuild
        try:
            gs_cmd = [
                "gs",
                "-dBATCH", "-dNOPAUSE", "-dQUIET",
                "-dSAFER",
                "-sDEVICE=pdfwrite",
                "-dCompatibilityLevel=1.4",
                f"-sOutputFile={out}",
                str(inp)
            ]
            r = subprocess.run(gs_cmd, capture_output=True, timeout=120)
            if r.returncode == 0 and out.exists() and out.stat().st_size > 0:
                repaired = True
                strategy_used = "Ghostscript (XREF rebuild)"
        except Exception as e:
            logger.warning(f"[REPAIR] Ghostscript failed: {type(e).__name__}")

        # Strategy 2: mutool clean
        if not repaired:
            try:
                mutool_path = shutil.which("mutool")
                if mutool_path:
                    r2 = subprocess.run(
                        [mutool_path, "clean", "-g", str(inp), str(out)],
                        capture_output=True, timeout=60
                    )
                    if r2.returncode == 0 and out.exists() and out.stat().st_size > 0:
                        repaired = True
                        strategy_used = "mutool (MuPDF clean)"
            except Exception as e:
                logger.warning(f"[REPAIR] mutool failed: {type(e).__name__}")

        # Strategy 3: PyMuPDF garbage collection
        if not repaired:
            try:
                import pymupdf as fitz
                doc = fitz.open(str(inp))
                doc.save(str(out), garbage=4, deflate=True, clean=True)
                doc.close()
                if out.exists() and out.stat().st_size > 0:
                    repaired = True
                    strategy_used = "PyMuPDF (garbage collection)"
            except Exception as e:
                logger.warning(f"[REPAIR] PyMuPDF failed: {type(e).__name__}")

        if not repaired:
            raise HTTPException(
                400,
                "This PDF is too severely damaged to recover. None of our repair strategies could reconstruct it."
            )

        stem = safe_filename(file.filename, "document")
        out_name = "repaired_" + stem
        response = FileResponse(
            str(out), media_type="application/pdf",
            filename=out_name,
            background=BackgroundTask(cleanup, inp, out)
        )
        response.headers["X-Repair-Strategy"] = strategy_used
        response.headers["Access-Control-Expose-Headers"] = "X-Repair-Strategy"
        return response
    except HTTPException:
        cleanup(inp, out)
        raise
    except Exception as e:
        cleanup(inp, out)
        raise safe_error(e, "repair-pdf")


# ─── Unlock PDF (Lossless Decrypt via PyMuPDF) ─────────────────
# Removes password protection from an encrypted PDF without
# rasterizing — preserves all text, links, and vector content.

@app.post("/unlock-pdf")
@limiter.limit("30/minute")
async def unlock_pdf(
    request: Request,
    file: UploadFile = File(...),
    password: str = Form("")
):
    """
    Losslessly decrypt a password-protected or owner-permission-locked PDF using PyMuPDF.
    Preserves full vector content, text selectability, and metadata.
    """
    import pymupdf as fitz  # PyMuPDF
    inp = temp_path(".pdf")
    out = temp_path("_unlocked.pdf")
    try:
        raw_data = await safe_read_upload(file)
        inp.write_bytes(raw_data)

        doc = fitz.open(str(inp))

        has_encrypt_dict = doc.xref_get_key(-1, "Encrypt")[0] != "null"
        if not doc.is_encrypted and not has_encrypt_dict:
            doc.close()
            cleanup(inp, out)
            raise HTTPException(400, "PDF is not encrypted.")

        eff_pass = _form_str(password, "") or ""
        if doc.needs_pass:
            authenticated = doc.authenticate(eff_pass)
            if not authenticated:
                doc.close()
                cleanup(inp, out)
                raise HTTPException(403, "Incorrect password. Could not unlock PDF.")
        elif eff_pass:
            # Owner-locked viewable PDF (empty user password): optional owner password check is tolerant
            doc.authenticate(eff_pass)

        # Save with no encryption — lossless vector preservation
        doc.save(str(out), encryption=fitz.PDF_ENCRYPT_NONE, garbage=1, deflate=True)
        doc.close()

        stem = safe_filename(file.filename or "document", "document")
        out_name = Path(stem).stem + "_unlocked.pdf"
        return FileResponse(
            str(out),
            media_type="application/pdf",
            filename=out_name,
            background=BackgroundTask(cleanup, inp, out)
        )
    except HTTPException:
        cleanup(inp, out)
        raise
    except Exception as e:
        cleanup(inp, out)
        raise safe_error(e, "unlock-pdf")


# ─── 11. Webpage to PDF (Playwright) ───────────────────────────
# Converts any public URL to a high-quality paginated PDF.
# Requires: pip install playwright && playwright install chromium

WEBPAGE_TO_PDF_SEMAPHORE = asyncio.Semaphore(int(os.environ.get("MAX_CONCURRENT_PLAYWRIGHT", "2")))
ALLOWED_URL_SCHEMES = {"http", "https"}


def _validate_url(url: str) -> str:
    """Enterprise SSRF hardening: validate protocol, resolve DNS, and block private/loopback/cloud metadata ranges."""
    from urllib.parse import urlparse
    import ipaddress
    import socket

    parsed = urlparse(url)
    if parsed.scheme not in ALLOWED_URL_SCHEMES:
        raise HTTPException(400, "Only http:// and https:// URLs are allowed.")

    hostname = (parsed.hostname or "").strip().lower()
    if not hostname:
        raise HTTPException(400, "Invalid URL: missing hostname.")

    # Direct name checks
    if hostname in ("localhost", "127.0.0.1", "::1", "metadata.google.internal", "instance-data"):
        raise HTTPException(400, "Access to localhost and cloud metadata endpoints is prohibited.")

    # Resolve hostname to actual IP addresses
    try:
        addr_info = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
    except socket.gaierror:
        raise HTTPException(400, f"Cannot resolve hostname: {hostname}")

    if not addr_info:
        raise HTTPException(400, f"No IP addresses resolved for: {hostname}")

    for entry in addr_info:
        sockaddr = entry[4]
        raw_ip = sockaddr[0]
        try:
            ip = ipaddress.ip_address(raw_ip)
            check_ips = [ip]
            if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
                check_ips.append(ip.ipv4_mapped)
            for candidate in check_ips:
                if (
                    candidate.is_private
                    or candidate.is_loopback
                    or candidate.is_link_local
                    or candidate.is_reserved
                    or candidate.is_multicast
                    or candidate.is_unspecified
                ):
                    raise HTTPException(400, f"Access to private/internal network addresses ({raw_ip}) is prohibited.")
        except HTTPException:
            raise
        except ValueError:
            raise HTTPException(400, "Invalid IP resolution result.")

    return url


_ALLOWED_PLAYWRIGHT_FORMATS = {"A4", "A3", "Letter", "Legal", "Tabloid"}
_ALLOWED_PLAYWRIGHT_MARGINS = {"0cm", "0.5cm", "1cm", "1.5cm", "2cm"}
_LOW_RAM_CHROMIUM_ARGS = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-sync",
    "--mute-audio",
    "--no-first-run",
]


async def _launch_low_ram_browser(playwright_inst: Any):
    """Launch headless Chromium tuned for low-memory containers with auto-install fallback."""
    try:
        return await playwright_inst.chromium.launch(headless=True, args=_LOW_RAM_CHROMIUM_ARGS)
    except Exception as launch_err:
        err_msg = str(launch_err)
        if "Executable doesn't exist" in err_msg or "playwright install" in err_msg:
            logger.info("[WebpageToPdf] Chromium binary missing on server — downloading automatically...")
            import sys
            await run_in_threadpool(
                subprocess.run,
                [sys.executable, "-m", "playwright", "install", "chromium"],
                check=True,
                timeout=180,
            )
            return await playwright_inst.chromium.launch(headless=True, args=_LOW_RAM_CHROMIUM_ARGS)
        raise launch_err


async def _attach_ssrf_guard(page: Any) -> None:
    """Attach SSRF route interceptor blocking internal/private IPs, file://, and cloud metadata."""
    validated_hosts: dict[str, float] = {}
    from urllib.parse import urlparse as _urlparse

    async def _ssrf_route_guard(route):
        req_url = route.request.url
        lower_u = req_url.lower()
        if lower_u.startswith(("data:", "blob:", "about:")):
            await route.continue_()
            return
        try:
            parsed = _urlparse(req_url)
            if parsed.scheme not in ALLOWED_URL_SCHEMES:
                await route.abort()
                return
            host_key = (parsed.hostname or "").lower()
            now_t = time.monotonic()
            cached_at = validated_hosts.get(host_key)
            if cached_at is None or (now_t - cached_at) > 3.0:
                await run_in_threadpool(_validate_url, req_url)
                validated_hosts[host_key] = now_t
            await route.continue_()
        except Exception:
            logger.warning(f"[WebpageToPdf] Blocked restricted subresource URL: {req_url[:120]}")
            await route.abort()

    await page.route("**/*", _ssrf_route_guard)


async def _finalize_playwright_pdf(
    page: Any,
    out_path: Path,
    paper_format: str,
    landscape: bool,
    margin: str,
    background: bool,
) -> None:
    """Wait briefly for fonts, preserve screen CSS if background enabled, and render PDF."""
    safe_fmt = paper_format if paper_format in _ALLOWED_PLAYWRIGHT_FORMATS else "A4"
    safe_margin = margin if margin in _ALLOWED_PLAYWRIGHT_MARGINS else "1cm"
    try:
        await page.evaluate("() => document.fonts ? document.fonts.ready : Promise.resolve()")
    except Exception:
        pass
    await asyncio.sleep(0.55)
    try:
        await page.emulate_media(media="screen" if background else "print")
    except Exception:
        pass
    await page.pdf(
        path=str(out_path),
        format=safe_fmt,
        landscape=landscape,
        print_background=background,
        margin={"top": safe_margin, "right": safe_margin, "bottom": safe_margin, "left": safe_margin},
    )


@app.post("/convert/webpage-to-pdf")
@limiter.limit("8/minute")
async def webpage_to_pdf(
    request: Request,
    url: str = Form(...),
    paper_format: str = Form("A4"),
    landscape: bool = Form(False),
    margin: str = Form("1cm"),
    background: bool = Form(True),
):
    """
    Convert a public webpage URL to a paginated PDF using Playwright (Headless Chromium).
    """
    _validate_url(url)

    out = temp_path(".pdf")
    try:
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            raise HTTPException(
                500,
                "Playwright is not installed. Run: pip install playwright && playwright install chromium"
            )

        async with WEBPAGE_TO_PDF_SEMAPHORE:
            async with async_playwright() as p:
                browser = None
                try:
                    browser = await _launch_low_ram_browser(p)
                    page = await browser.new_page(
                        viewport={"width": 1280, "height": 800},
                        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                    )
                    await _attach_ssrf_guard(page)

                    # Single fast navigation: wait for DOM first, then up to 10s for subresources (no duplicate goto!)
                    try:
                        await page.goto(url, wait_until="domcontentloaded", timeout=22000)
                        try:
                            await page.wait_for_load_state("load", timeout=10000)
                        except Exception:
                            logger.info("[WebpageToPdf] Subresource load timeout — rendering DOM as loaded")
                    except Exception as goto_err:
                        logger.warning(f"[WebpageToPdf] Navigation notice: {goto_err}")

                    if page.url and page.url != "about:blank":
                        _validate_url(page.url)

                    await _finalize_playwright_pdf(page, out, paper_format, landscape, margin, background)
                finally:
                    if browser is not None:
                        try:
                            await browser.close()
                        except Exception:
                            pass

        if not out.exists() or out.stat().st_size == 0:
            raise RuntimeError("Playwright did not generate a PDF.")

        from urllib.parse import urlparse
        domain = safe_filename(urlparse(url).netloc.replace(".", "_")[:50], "page")
        return FileResponse(
            str(out), media_type="application/pdf",
            filename=f"webpage_{domain}.pdf",
            background=BackgroundTask(cleanup, out)
        )
    except HTTPException:
        cleanup(out)
        raise
    except Exception as e:
        cleanup(out)
        logger.error(f"[ERROR] endpoint=webpage-to-pdf type={type(e).__name__} msg={str(e)[:500]}")
        raise HTTPException(
            status_code=500,
            detail="Failed to convert webpage to PDF. Please ensure the URL is publicly accessible and does not require login authentication."
        )


@app.post("/convert/html-to-pdf")
@limiter.limit("12/minute")
async def html_to_pdf(
    request: Request,
    html: str = Form(...),
    paper_format: str = Form("A4"),
    landscape: bool = Form(False),
    margin: str = Form("1cm"),
    background: bool = Form(True),
):
    """
    Render raw HTML/CSS markup into a paginated vector PDF using Playwright (Chromium)
    with full SSRF guard blocking private/internal network subresources.
    """
    if not html or not html.strip():
        raise HTTPException(400, "HTML content cannot be empty.")
    if len(html.encode("utf-8", errors="ignore")) > 2 * 1024 * 1024:
        raise HTTPException(413, "HTML payload exceeds 2 MB limit.")

    out = temp_path(".pdf")
    try:
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            raise HTTPException(
                500,
                "Playwright is not installed. Run: pip install playwright && playwright install chromium"
            )

        async with WEBPAGE_TO_PDF_SEMAPHORE:
            async with async_playwright() as p:
                browser = None
                try:
                    browser = await _launch_low_ram_browser(p)
                    page = await browser.new_page(viewport={"width": 1240, "height": 1754})
                    await _attach_ssrf_guard(page)
                    await page.set_content(html, wait_until="domcontentloaded", timeout=15000)
                    await _finalize_playwright_pdf(page, out, paper_format, landscape, margin, background)
                finally:
                    if browser is not None:
                        try:
                            await browser.close()
                        except Exception:
                            pass

        if not out.exists() or out.stat().st_size == 0:
            raise RuntimeError("Playwright did not generate a PDF from HTML.")

        return FileResponse(
            str(out), media_type="application/pdf",
            filename="html_document.pdf",
            background=BackgroundTask(cleanup, out)
        )
    except HTTPException:
        cleanup(out)
        raise
    except Exception as e:
        cleanup(out)
        raise safe_error(e, "html-to-pdf")


# ─── 12. PDF Font Replacer ─────────────────────────────────────
# Extracts text from PDF pages and re-renders with chosen standard font.

ALLOWED_REPLACE_FONTS = {
    "helv": "Helvetica", "tiro": "Times-Roman",
    "cour": "Courier", "zadb": "ZapfDingbats"
}


@app.post("/convert/replace-font")
@limiter.limit("8/minute")
async def replace_font(
    request: Request,
    file: UploadFile = File(...),
    font_name: str = Form("helv"),
):
    """
    Replace all text in a PDF with a chosen standard font (Helvetica, Times, Courier).
    Text content and positions are preserved; only the font face changes.
    """
    if font_name not in ALLOWED_REPLACE_FONTS:
        font_name = "helv"

    import pymupdf as fitz
    import subprocess
    import shutil
    
    inp = temp_path(".pdf")
    out = temp_path("_font_replaced.pdf")
    no_text = temp_path("_notext.pdf")
    
    try:
        inp.write_bytes(await safe_read_upload(file))
        check_pdf_page_count(inp, "replace-font")

        # 1. Use Ghostscript to strip all existing text (preserves vectors/images)
        gs_exe = "gs" if shutil.which("gs") else "gswin64c" if shutil.which("gswin64c") else "gswin32c"
        try:
            subprocess.run([
                gs_exe, "-q", "-dNOPAUSE", "-dBATCH", "-dSAFER",
                "-sDEVICE=pdfwrite", "-dFILTERTEXT",
                f"-sOutputFile={no_text}", str(inp)
            ], check=True, capture_output=True, timeout=120)
            has_gs = True
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError):
            has_gs = False

        src_doc = fitz.open(str(inp))
        if has_gs and no_text.exists():
            out_doc = fitz.open(str(no_text))
        else:
            out_doc = fitz.open()

        for page_num in range(len(src_doc)):
            src_page = src_doc[page_num]
            
            if has_gs and no_text.exists():
                new_page = out_doc[page_num]
            else:
                w, h = src_page.rect.width, src_page.rect.height
                new_page = out_doc.new_page(width=w, height=h)
                # Fallback: Redact old text (will leave white boxes, but better than double text)
                new_page.show_pdf_page(new_page.rect, src_doc, page_num)
                for block in src_page.get_text("dict")["blocks"]:
                    if block.get("type") == 0:
                        for line in block.get("lines", []):
                            for span in line.get("spans", []):
                                new_page.add_redact_annot(span["bbox"])
                new_page.apply_redactions()

            # 2. Re-insert text spans with new font
            for block in src_page.get_text("dict")["blocks"]:
                if block.get("type") != 0:
                    continue
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        txt = span.get("text", "").strip()
                        if not txt:
                            continue
                        x0, y0, _, y1 = span["bbox"]
                        size = max(4, span.get("size", 11))
                        
                        raw_color = span.get("color", 0)
                        if isinstance(raw_color, int):
                            r = ((raw_color >> 16) & 0xFF) / 255.0
                            g = ((raw_color >> 8) & 0xFF) / 255.0
                            b = (raw_color & 0xFF) / 255.0
                            color = (r, g, b)
                        else:
                            color = (0, 0, 0)
                            
                        new_page.insert_text(
                            fitz.Point(x0, y1 - 1),
                            txt,
                            fontname=font_name,
                            fontsize=size,
                            color=color,
                        )

        out_doc.save(str(out), garbage=3, deflate=True)
        src_doc.close()
        out_doc.close()

        font_label = ALLOWED_REPLACE_FONTS[font_name]
        stem = safe_filename(file.filename, "document")
        out_name = f"{Path(stem).stem}_{font_label}.pdf"
        return FileResponse(
            str(out), media_type="application/pdf",
            filename=out_name,
            background=BackgroundTask(cleanup, inp, out, no_text)
        )
    except HTTPException:
        cleanup(inp, out, no_text)
        raise
    except Exception as e:
        cleanup(inp, out, no_text)
        raise safe_error(e, "replace-font")


# ─── 13. Auto-Crop White Margins ───────────────────────────────
# Detects content bounding box per page and sets CropBox accordingly.

@app.post("/convert/auto-crop")
@limiter.limit("10/minute")
async def auto_crop_margins(
    request: Request,
    file: UploadFile = File(...),
    padding_pt: int = Form(10),
):
    """
    Automatically detect and remove white margins from every PDF page.
    Sets the CropBox to the content bounding box + optional padding.
    """
    import pymupdf as fitz
    padding_pt = max(0, min(padding_pt, 72))  # clamp 0–72pt

    inp = temp_path(".pdf")
    out = temp_path("_autocropped.pdf")
    try:
        inp.write_bytes(await safe_read_upload(file))
        check_pdf_page_count(inp, "auto-crop")

        doc = fitz.open(str(inp))
        for page in doc:
            # get_text("blocks") returns (x0, y0, x1, y1, text, ...) per block
            blocks = page.get_text("blocks")
            # Also include drawings/images
            paths = page.get_drawings()

            all_rects = []
            for b in blocks:
                if b[4].strip():  # has text
                    all_rects.append(fitz.Rect(b[:4]))
            for path in paths:
                if path.get("rect"):
                    all_rects.append(path["rect"])
            for img_info in page.get_images(full=True):
                try:
                    for rect in page.get_image_rects(img_info[0]):
                        if isinstance(rect, fitz.Rect):
                            all_rects.append(rect)
                except Exception:
                    pass

            if all_rects:
                content_bbox = all_rects[0]
                for r in all_rects[1:]:
                    content_bbox = content_bbox | r  # union
                # Add padding
                padded = fitz.Rect(
                    max(0, content_bbox.x0 - padding_pt),
                    max(0, content_bbox.y0 - padding_pt),
                    min(page.rect.width, content_bbox.x1 + padding_pt),
                    min(page.rect.height, content_bbox.y1 + padding_pt),
                )
                page.set_cropbox(padded)

        doc.save(str(out), garbage=3, deflate=True)
        doc.close()

        stem = safe_filename(file.filename, "document")
        out_name = "autocropped_" + stem
        return FileResponse(
            str(out), media_type="application/pdf",
            filename=out_name,
            background=BackgroundTask(cleanup, inp, out)
        )
    except HTTPException:
        cleanup(inp, out)
        raise
    except Exception as e:
        cleanup(inp, out)
        raise safe_error(e, "auto-crop")


# ─── 14. PDF Link Extractor ─────────────────────────────────────

@app.post("/analyze/links")
@limiter.limit("15/minute")
async def extract_links(request: Request, file: UploadFile = File(...)):
    """
    Extract all hyperlinks from a PDF and return them as JSON.
    """
    import pymupdf as fitz
    inp = temp_path(".pdf")
    try:
        raw_bytes = await safe_read_upload(file)
        cache_key = f"links:{hashlib.sha256(raw_bytes).hexdigest()}"
        cached = RESULT_CACHE.get(cache_key)
        if cached is not None:
            return Response(content=cached[0], media_type=cached[1], headers={"X-Cache": "HIT"})

        inp.write_bytes(raw_bytes)
        check_pdf_page_count(inp, "extract-links")

        doc = fitz.open(str(inp))
        links_found = []
        for i, page in enumerate(doc):
            for link in page.get_links():
                uri = link.get("uri", "")
                if uri:
                    links_found.append({
                        "page": i + 1,
                        "url": uri,
                        "rect": [round(v, 1) for v in link.get("from", fitz.Rect())]
                    })
        doc.close()

        payload_bytes = json.dumps({
            "success": True,
            "total_links": len(links_found),
            "links": links_found
        }).encode("utf-8")
        RESULT_CACHE.put(cache_key, payload_bytes, "application/json")
        return Response(content=payload_bytes, media_type="application/json", headers={"X-Cache": "MISS"})
    except HTTPException:
        raise
    except Exception as e:
        raise safe_error(e, "extract-links")
    finally:
        cleanup(inp)


# ─── 15. Compress PDF ───────────────────────────────────────────
# quality: screen (max), ebook (good), printer (high quality), prepress (best)

ALLOWED_QUALITY_VALUES = {"screen", "ebook", "printer", "prepress"}

_QUALITY_IMG_CONFIG = {
    "screen": (96, 52),
    "ebook": (144, 68),
    "printer": (210, 80),
    "prepress": (260, 88),
}


def _recompress_pdf_with_fitz(src: Path, dst: Path, dpi_target: int, jpeg_q: int) -> bool:
    """
    In-place vector-preserving PDF compression via PyMuPDF + Pillow:
    Recompresses large non-alpha embedded raster XObjects, subsets fonts, and strips bloat.
    Returns True if valid compressed output was written.
    """
    import pymupdf as fitz
    import io as _io
    from PIL import Image

    doc = fitz.open(str(src))
    seen_xrefs: set[int] = set()
    try:
        for page in doc:
            for img_info in page.get_images(full=True):
                xref = img_info[0]
                smask = img_info[1] if len(img_info) > 1 else 0
                if xref in seen_xrefs or smask != 0:
                    continue
                seen_xrefs.add(xref)
                try:
                    extracted = doc.extract_image(xref)
                    raw_img = extracted.get("image") or b""
                    if len(raw_img) < 12 * 1024:
                        continue
                    pil_img = Image.open(_io.BytesIO(raw_img))
                    if pil_img.mode not in ("RGB", "L"):
                        pil_img = pil_img.convert("RGB")
                    # Compute scale bound relative to target DPI
                    max_side = int(max(400, dpi_target * 11.5))
                    if max(pil_img.size) > max_side:
                        ratio = max_side / max(pil_img.size)
                        new_sz = (max(32, int(pil_img.width * ratio)), max(32, int(pil_img.height * ratio)))
                        pil_img = pil_img.resize(new_sz, Image.Resampling.LANCZOS)
                    buf = _io.BytesIO()
                    pil_img.save(buf, format="JPEG", quality=jpeg_q, optimize=True)
                    new_bytes = buf.getvalue()
                    if 0 < len(new_bytes) < len(raw_img):
                        page.replace_image(xref, stream=new_bytes)
                except Exception:
                    continue
        try:
            doc.subset_fonts()
        except Exception:
            pass
        doc.save(str(dst), garbage=4, deflate=True, clean=True)
        return dst.exists() and dst.stat().st_size > 0
    finally:
        doc.close()


def _run_best_pdf_compression(inp: Path, out: Path, quality: str, target_kb: int) -> tuple[int, int]:
    """Run Ghostscript + PyMuPDF vector-preserving compression and pick strictly the smallest output."""
    orig_size = inp.stat().st_size
    target_bytes = target_kb * 1024 if target_kb > 0 else 0
    best_path: Optional[Path] = None
    best_size = orig_size
    tmp_candidates: list[Path] = []

    def _consider(candidate: Path):
        nonlocal best_path, best_size
        if candidate.exists():
            sz = candidate.stat().st_size
            if 0 < sz < best_size:
                best_size = sz
                best_path = candidate

    gs_presets = [quality]
    if target_bytes > 0 and quality != "screen":
        gs_presets.append("screen")

    dpi_map = {"screen": 96, "ebook": 144, "printer": 220, "prepress": 300}
    for gs_q in gs_presets:
        dpi_val = dpi_map.get(gs_q, 144)
        cand_gs = temp_path("_gs.pdf")
        tmp_candidates.append(cand_gs)
        gs_cmd = [
            "gs", "-dSAFER", "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.4",
            f"-dPDFSETTINGS=/{gs_q}", "-dNOPAUSE", "-dQUIET", "-dBATCH",
            "-dDetectDuplicateImages=true", "-dCompressFonts=true", "-dSubsetFonts=true",
            "-dDownsampleColorImages=true", f"-dColorImageResolution={dpi_val}",
            "-dDownsampleGrayImages=true", f"-dGrayImageResolution={dpi_val}",
            f"-sOutputFile={cand_gs}", str(inp),
        ]
        try:
            subprocess.run(gs_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
            _consider(cand_gs)
            if target_bytes > 0 and best_size <= target_bytes:
                break
        except Exception:
            pass

    # If Ghostscript missing, barely compressed (< 6% reduction), or still above target_bytes -> try PyMuPDF pass
    needs_fitz = (best_path is None) or (best_size > orig_size * 0.94) or (target_bytes > 0 and best_size > target_bytes)
    if needs_fitz:
        dpi_target, jpeg_q = _QUALITY_IMG_CONFIG.get(quality, (144, 68))
        fitz_passes = [(dpi_target, jpeg_q)]
        if target_bytes > 0:
            fitz_passes.extend([(110, 52), (82, 38)])
        for f_dpi, f_q in fitz_passes:
            cand_fitz = temp_path("_fitz.pdf")
            tmp_candidates.append(cand_fitz)
            try:
                if _recompress_pdf_with_fitz(inp, cand_fitz, f_dpi, f_q):
                    _consider(cand_fitz)
                    if target_bytes > 0 and best_size <= target_bytes:
                        break
            except Exception:
                pass

    if best_path is not None and best_path.exists():
        shutil.copyfile(str(best_path), str(out))
    else:
        # Never return a bigger PDF than input
        shutil.copyfile(str(inp), str(out))

    for p in tmp_candidates:
        cleanup(p)

    return orig_size, out.stat().st_size


@app.post("/compress-pdf")
@limiter.limit("15/minute")
async def compress_pdf(
    request: Request,
    file: UploadFile = File(...),
    quality: str = Form("ebook"),  # screen | ebook | printer | prepress
    target_kb: int = Form(0),
):
    if quality not in ALLOWED_QUALITY_VALUES:
        quality = "ebook"

    inp = temp_path(".pdf")
    out = temp_path("_compressed.pdf")
    try:
        inp.write_bytes(await safe_read_upload(file))
        check_pdf_page_count(inp, "compress-pdf")

        orig_bytes, out_bytes = await run_in_threadpool(
            _run_best_pdf_compression, inp, out, quality, max(0, int(target_kb or 0))
        )

        stem = safe_filename(file.filename, "document")
        out_name = "compressed_" + stem
        return FileResponse(
            str(out),
            media_type="application/pdf",
            filename=out_name,
            headers={
                "X-Orig-Bytes": str(orig_bytes),
                "X-Compressed-Bytes": str(out_bytes),
            },
            background=BackgroundTask(cleanup, inp, out),
        )
    except HTTPException:
        cleanup(inp, out)
        raise
    except Exception as e:
        cleanup(inp, out)
        raise safe_error(e, "compress-pdf")


# ─── 10. Extract Tables ────────────────────────────────────────

@app.post("/extract-tables")
@limiter.limit("10/minute")
async def extract_tables(
    request: Request,
    file: UploadFile = File(...),
    strict_local: bool = Form(False),
    ai_provider: str = Form("auto"),
    ai_api_key: Optional[str] = Form(None),
    lang: str = Form("auto"),
):
    try:
        import camelot, pandas as pd
    except ImportError:
        raise HTTPException(500, "Run: pip install camelot-py[cv] pandas openpyxl")

    inp = temp_path(".pdf")
    out = temp_path(".xlsx")
    try:
        raw_bytes = await safe_read_upload(file)
        inp, was_image = normalize_input_to_pdf(raw_bytes, file.filename, inp)
        check_pdf_page_count(inp, "extract-tables")
        eff_strict = _form_bool(strict_local, False)
        eff_provider = _form_str(ai_provider, "auto") or "auto"
        raw_ai_key = _form_str(ai_api_key, None)
        eff_lang = _form_str(lang, "auto") or "auto"
        eff_strict = eff_strict or not server_ai_quota_ok(request, bool(raw_ai_key and raw_ai_key.strip()), eff_strict)
        eff_ai_key = None if eff_strict else (raw_ai_key.strip() if raw_ai_key else None)

        if was_image or is_pdf_scanned(inp):
            _, tables_cnt = await run_in_threadpool(
                build_exact_xlsx_from_scans, inp, out, eff_lang, 200, eff_ai_key, eff_provider, eff_strict
            )
            if tables_cnt == 0 and (not out.exists() or out.stat().st_size < 1500):
                raise HTTPException(400, "No tables found in this document.")
        else:
            tables = None
            for flavor in ["lattice", "stream"]:
                try:
                    t = camelot.read_pdf(str(inp), pages="all", flavor=flavor)
                    if t and len(t) > 0:
                        tables = t
                        break
                except Exception:
                    continue

            if not tables:
                _, tables_cnt = await run_in_threadpool(
                    build_exact_xlsx_from_scans, inp, out, eff_lang, 200, eff_ai_key, eff_provider, eff_strict
                )
                if tables_cnt == 0 and (not out.exists() or out.stat().st_size < 1500):
                    raise HTTPException(400, "No tables found in this PDF.")
            else:
                with pd.ExcelWriter(str(out), engine="openpyxl") as writer:
                    for i, table in enumerate(tables):
                        sheet_name = f"Table_{i+1}"[:31]
                        df = table.df
                        df.to_excel(writer, sheet_name=sheet_name, index=False, header=False)

        stem = safe_filename(file.filename, "document")
        out_name = "tables_" + Path(stem).stem + ".xlsx"
        return FileResponse(
            str(out),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=out_name,
            background=BackgroundTask(cleanup, inp, out)
        )
    except HTTPException:
        cleanup(inp, out)
        raise
    except Exception as e:
        cleanup(inp, out)
        raise safe_error(e, "extract-tables")


# ─── 11. Extract Images ────────────────────────────────────────

@app.post("/extract-images")
@limiter.limit("10/minute")
async def extract_images(request: Request, file: UploadFile = File(...)):
    import zipfile
    inp = temp_path(".pdf")
    out_zip = temp_path(".zip")
    img_dir = temp_path("_imgdir")
    img_dir.mkdir(exist_ok=True)

    try:
        inp.write_bytes(await safe_read_upload(file))
        check_pdf_page_count(inp, "extract-images")

        import pymupdf as fitz
        doc = fitz.open(inp)
        count = 0
        seen_xrefs = set()  # deduplicate images appearing on multiple pages

        for page_num in range(len(doc)):
            page = doc[page_num]
            for img in page.get_images(full=True):
                xref = img[0]
                if xref in seen_xrefs:
                    continue
                seen_xrefs.add(xref)
                try:
                    base_image = doc.extract_image(xref)
                    image_bytes = base_image["image"]
                    if len(image_bytes) < 500:  # skip tiny/empty images
                        continue
                    ext = base_image.get("ext", "png")
                    count += 1
                    img_filepath = img_dir / f"page_{page_num+1}_img_{count}.{ext}"
                    img_filepath.write_bytes(image_bytes)
                except Exception:
                    continue

        doc.close()

        if count == 0:
            cleanup(inp, out_zip, img_dir)
            raise HTTPException(400, "No images found in this PDF.")

        with zipfile.ZipFile(str(out_zip), "w", zipfile.ZIP_DEFLATED) as zipf:
            for f in img_dir.iterdir():
                zipf.write(f, f.name)

        stem = safe_filename(file.filename, "document")
        out_name = "images_" + Path(stem).stem + ".zip"
        return FileResponse(str(out_zip), media_type="application/zip",
                            filename=out_name,
                            background=BackgroundTask(cleanup, inp, out_zip, img_dir))
    except HTTPException:
        cleanup(inp, out_zip, img_dir)
        raise
    except Exception as e:
        cleanup(inp, out_zip, img_dir)
        raise safe_error(e, "extract-images")


# ─── 12. Search & Replace ──────────────────────────────────────
# Matches the original font size so replaced text looks correct.

@app.post("/search-replace")
@limiter.limit("15/minute")
async def search_replace(
    request: Request,
    file: UploadFile = File(...),
    search_term: str = Form(...),
    replace_term: str = Form("")
):
    inp = temp_path(".pdf")
    out = temp_path("_replaced.pdf")
    try:
        inp.write_bytes(await safe_read_upload(file))
        check_pdf_page_count(inp, "search-replace")

        import pymupdf as fitz
        doc = fitz.open(inp)
        match_count = 0

        for page in doc:
            instances = page.search_for(search_term)
            if not instances:
                continue
            match_count += len(instances)

            # Collect original font info before redacting
            font_info = {}
            blocks = page.get_text("dict").get("blocks", [])
            for block in blocks:
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        if search_term.lower() in span["text"].lower():
                            font_info = {
                                "size": span.get("size", 11),
                                "color": span.get("color", 0)
                            }

            # Redact (erase old text with white fill)
            for inst in instances:
                page.add_redact_annot(inst, fill=(1, 1, 1))
            page.apply_redactions()

            # Insert replacement with matched font size
            font_size = font_info.get("size", 11)
            # Convert packed int color to tuple
            raw_color = font_info.get("color", 0)
            if isinstance(raw_color, int):
                r = ((raw_color >> 16) & 0xFF) / 255.0
                g = ((raw_color >> 8) & 0xFF) / 255.0
                b = (raw_color & 0xFF) / 255.0
                text_color = (r, g, b)
            else:
                text_color = (0, 0, 0)

            # Determine font for replacement text
            _sr_fonts_dir = Path(__file__).parent.parent / "public" / "fonts"
            _sr_fontname = "helv"
            if has_non_latin(replace_term):
                _sr_font_file = _sr_fonts_dir / "NotoSansDevanagari-Regular.ttf"
                if not _sr_font_file.exists():
                    _sr_font_file = Path(__file__).parent / "fonts" / "NotoSansDevanagari-Regular.ttf"
                if _sr_font_file.exists():
                    _sr_fontname = "NotoDevaRep"
                    try:
                        page.insert_font(fontname=_sr_fontname, fontbuffer=_sr_font_file.read_bytes())
                    except Exception:
                        pass  # Already registered on this page

            if replace_term:
                for inst in instances:
                    page.insert_text(
                        fitz.Point(inst.x0, inst.y1 - 1),
                        replace_term,
                        fontname=_sr_fontname,
                        fontsize=font_size,
                        color=text_color
                    )

        doc.save(str(out))
        doc.close()

        stem = safe_filename(file.filename, "document")
        out_name = "replaced_" + stem
        return FileResponse(
            str(out), media_type="application/pdf",
            filename=out_name,
            headers={
                "X-Match-Count": str(match_count),
                "Access-Control-Expose-Headers": "X-Match-Count"
            },
            background=BackgroundTask(cleanup, inp, out)
        )
    except HTTPException:
        cleanup(inp, out)
        raise
    except Exception as e:
        cleanup(inp, out)
        raise safe_error(e, "search-replace")


# ─── 13. OCR Analyze (Detect Scan + Return Text) ──────────────

@app.post("/ocr/analyze")
@limiter.limit("10/minute")
async def ocr_analyze(request: Request, file: UploadFile = File(...)):
    """
    Analyze a PDF: detect if it's scanned, extract text per page.
    Returns JSON with is_scanned flag and text for each page.
    """
    inp = temp_path(".pdf")
    try:
        inp.write_bytes(await safe_read_upload(file))
        check_pdf_page_count(inp, "ocr-analyze")

        import pymupdf as fitz
        doc = fitz.open(inp)
        pages_data = []
        total_chars = 0
        for i, page in enumerate(doc):
            text = page.get_text("text")
            total_chars += len(text.strip())
            pages_data.append({"page": i + 1, "char_count": len(text.strip()), "text_preview": text[:300]})
        doc.close()

        scanned = is_pdf_scanned(inp)
        return JSONResponse({
            "success": True,
            "is_scanned": scanned,
            "total_chars": total_chars,
            "pages": pages_data
        })
    except HTTPException:
        raise
    except Exception as e:
        raise safe_error(e, "ocr-analyze")
    finally:
        cleanup(inp)


@app.post("/ocr/page-words")
@limiter.limit("30/minute")
async def ocr_page_words(
    request: Request,
    file: UploadFile = File(...),
    page: int = Form(0),
    lang: str = Form("auto"),
):
    """
    Fast single-page word-level OCR endpoint for the Advanced PDF Editor.
    Uses hybrid RapidOCR (ONNX PP-OCRv4) + OpenCV watermark/illumination cleaner + global Tesseract TSV
    so scanned/colored documents in any script produce accurate clickable word boxes.
    Coordinates returned are in CropBox-relative top-left PDF points (matching pdf.js canvas at scale=1).
    """
    inp = temp_path(".pdf")
    try:
        inp.write_bytes(await safe_read_upload(file))
        check_pdf_page_count(inp, "ocr-page-words")

        import pymupdf as fitz
        import cv2
        import numpy as np
        from ocr_engine import _ocr_page_words, find_devanagari_font, resolve_ocr_lang

        norm_lang = resolve_ocr_lang(lang)

        doc = fitz.open(str(inp))
        try:
            if page < 0 or page >= len(doc):
                raise HTTPException(400, f"Page index {page} is out of range (0 to {len(doc)-1}).")

            pg = doc[page]
            page_w = float(pg.rect.width)
            page_h = float(pg.rect.height)
            max_dim_pt = max(page_w, page_h, 1.0)
            eff_dpi = min(400, max(180, int((2500.0 * 72.0) / max_dim_pt)))
            if max_dim_pt * (eff_dpi / 72.0) > 3600.0:
                eff_dpi = max(120, int((3600.0 * 72.0) / max_dim_pt))

            pix = pg.get_pixmap(dpi=eff_dpi, alpha=False)
        finally:
            doc.close()

        if pix.width < 16 or pix.height < 16:
            return JSONResponse({
                "page": page,
                "pageWidth": round(page_w, 2),
                "pageHeight": round(page_h, 2),
                "words": [],
            })

        img_rgb = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        if pix.n == 3:
            img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
        elif pix.n == 4:
            img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGBA2BGR)
        else:
            img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_GRAY2BGR)

        latin_font = fitz.Font("helv")
        dev_font_path = find_devanagari_font()
        dev_font = fitz.Font(fontfile=str(dev_font_path)) if dev_font_path else None

        ocr_words = await run_in_threadpool(
            _ocr_page_words,
            img_bgr,
            norm_lang,
            True,
            latin_font,
            dev_font,
        )

        from vision_reconstructor import build_lines_and_paragraphs, ocr_words_to_editor_blocks
        words_out = [
            {k: v for k, v in b.items() if k != "conf"}
            for b in ocr_words_to_editor_blocks(img_bgr, ocr_words, page_w, page_h)
        ]
        lines_out, paragraphs_out = build_lines_and_paragraphs(words_out)

        return JSONResponse({
            "page": page,
            "pageWidth": round(page_w, 2),
            "pageHeight": round(page_h, 2),
            "words": words_out,
            "lines": lines_out,
            "paragraphs": paragraphs_out,
        })
    except HTTPException:
        raise
    except Exception as e:
        raise safe_error(e, "ocr-page-words")
    finally:
        cleanup(inp)


@app.post("/remove-watermark")
@limiter.limit("20/minute")
async def remove_watermark(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    remove_bottom: bool = Form(False),
    bottom_percentage: float = Form(5.0),
    remove_background: bool = Form(False)
):
    """
    Removes watermarks from a PDF.

    Strategies used:
    1. remove_bottom=True  → Draws a solid white rectangle over the bottom
       X% of every page (covers "Scanned with CamScanner / Oken Scanner" text).
    2. remove_background=True → Two-pass approach:
         a) For DIGITAL PDFs: removes watermark-flagged annotations, then
            attempts to redact any semi-transparent text/image objects that
            look like watermarks (low opacity, centered placement, etc.).
         b) For SCANNED PDFs (image-only pages): applies a subtle contrast
            filter to wash out light-grey background watermarks embedded
            in the scanned image pixels.
    """
    inp = temp_path(".pdf")
    out = temp_path(".pdf")
    scheduled_cleanup = False
    try:
        inp.write_bytes(await safe_read_upload(file))
        check_pdf_page_count(inp, "remove-watermark")

        # Clamp bottom_percentage to a safe range
        bottom_pct = max(1.0, min(float(bottom_percentage), 40.0))

        import pymupdf as fitz  # PyMuPDF — already a project dependency

        doc = fitz.open(str(inp))

        for page in doc:
            page_rect = page.rect
            pw = page_rect.width
            ph = page_rect.height

            # ── 1. BOTTOM WATERMARK ────────────────────────────────────────
            # Paint a solid white box over the bottom N% of the page.
            # This reliably covers footer watermarks regardless of whether
            # the page is digital text or a scanned image.
            if remove_bottom:
                bh = ph * (bottom_pct / 100.0)
                bottom_box = fitz.Rect(page_rect.x0, page_rect.y1 - bh,
                                       page_rect.x1, page_rect.y1)
                # Draw filled white rectangle on top of everything
                page.draw_rect(bottom_box, color=(1, 1, 1), fill=(1, 1, 1),
                               overlay=True)

            # ── 2. BACKGROUND / MIDDLE WATERMARK ──────────────────────────
            if remove_background:
                # ── 2a. Remove watermark annotations (any type) ────────────
                # Iterate safely by collecting annots first, then deleting.
                annots_to_delete = []
                for annot in page.annots():
                    try:
                        atype = annot.type  # (int, str) tuple in PyMuPDF
                        type_str = atype[1] if isinstance(atype, (list, tuple)) and len(atype) > 1 else str(atype)
                        # PDF spec watermark annotation type is "Watermark" (type int=26)
                        if "watermark" in type_str.lower() or (isinstance(atype, (list, tuple)) and atype[0] == 26):
                            annots_to_delete.append(annot)
                    except Exception:
                        pass
                for annot in annots_to_delete:
                    try:
                        page.delete_annot(annot)
                    except Exception:
                        pass

                # ── 2b. Remove semi-transparent / watermark-looking text ───
                # Inspect text blocks: if a block is centred on the page and
                # uses a colour that is NOT near-black (i.e. it looks like a
                # light-grey or coloured watermark), redact it.
                blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE).get("blocks", [])
                redact_rects = []
                for block in blocks:
                    if block.get("type") != 0:  # 0 = text block
                        continue
                    for line in block.get("lines", []):
                        for span in line.get("spans", []):
                            color = span.get("color", 0)
                            # color is an integer RGB (0xRRGGBB)
                            r = ((color >> 16) & 0xFF) / 255.0
                            g = ((color >> 8) & 0xFF) / 255.0
                            b = (color & 0xFF) / 255.0
                            # Light-grey / near-white text = watermark candidate
                            brightness = 0.299 * r + 0.587 * g + 0.114 * b
                            # Also check if span is large, centered, and light
                            span_rect = fitz.Rect(span["bbox"])
                            cx = (span_rect.x0 + span_rect.x1) / 2
                            # Consider "centered" if within the middle 60% of page width
                            is_centered = (pw * 0.2) < cx < (pw * 0.8)
                            is_light = brightness > 0.65  # light grey / coloured wm
                            font_size = span.get("size", 0)
                            is_large = font_size >= 18  # watermarks are usually big
                            if is_light and is_centered and is_large:
                                redact_rects.append(span_rect)

                # Apply redactions (white fill over matched areas)
                for r in redact_rects:
                    page.add_redact_annot(r, fill=(1, 1, 1))
                if redact_rects:
                    page.apply_redactions()

        doc.save(str(out), garbage=4, deflate=True)
        doc.close()

        background_tasks.add_task(cleanup, inp)
        background_tasks.add_task(cleanup, out)
        scheduled_cleanup = True

        safe_name = safe_filename(file.filename, "clean_output.pdf")
        return FileResponse(
            str(out),
            media_type="application/pdf",
            filename=f"clean_{safe_name}",
            headers={"Content-Disposition": f'attachment; filename="clean_{safe_name}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise safe_error(e, "remove-watermark")
    finally:
        if not scheduled_cleanup:
            cleanup(inp, out)


# ─── Telemetry & Feedback Endpoints ─────────────────────────────
try:
    import telemetry
    telemetry.init_db()
except Exception as _te_err:
    logger.warning(f"[TELEMETRY] Failed to initialize telemetry module: {_te_err}")


@app.post("/api/feedback")
@limiter.limit("10/minute")
async def submit_feedback(request: Request):
    """Save user rating and feedback with optional instant alerts."""
    try:
        body = await request.json()
        tool_path = str(body.get("tool_path", "/")).strip()
        tool_name = str(body.get("tool_name", "Unknown Tool")).strip()
        rating = int(body.get("rating", 5))
        feedback_type = str(body.get("feedback_type", "general")).strip()
        comment = str(body.get("comment", "")).strip()
        user_agent = request.headers.get("user-agent", "")
        client_ip = get_real_client_ip(request)

        import telemetry
        fid = telemetry.save_feedback(
            tool_path=tool_path,
            tool_name=tool_name,
            rating=rating,
            feedback_type=feedback_type,
            comment=comment,
            user_agent=user_agent,
            client_ip=client_ip
        )
        return {"success": True, "id": fid}
    except Exception as e:
        logger.error(f"[FEEDBACK] Error processing feedback: {e}")
        return {"success": False, "error": "Unable to save feedback right now."}


@app.post("/api/telemetry/error")
@limiter.limit("30/minute")
async def report_telemetry_error(request: Request):
    """Log an automatic crash/error occurrence for diagnostics and alerts."""
    try:
        body = await request.json()
        tool_path = str(body.get("tool_path", "/")).strip()
        tool_name = str(body.get("tool_name", "Unknown Tool")).strip()
        error_message = str(body.get("error_message", "Unknown error")).strip()
        error_stack = str(body.get("error_stack", "")).strip()
        raw_file_info = body.get("file_info", {})
        file_info = (
            {
                k: v
                for k, v in raw_file_info.items()
                if k in ("size", "sizeFormatted", "type")
            }
            if isinstance(raw_file_info, dict)
            else {}
        )
        user_agent = request.headers.get("user-agent", "")
        client_ip = get_real_client_ip(request)

        import telemetry
        eid = telemetry.save_error(
            tool_path=tool_path,
            tool_name=tool_name,
            error_message=error_message,
            error_stack=error_stack,
            file_info=file_info,
            user_agent=user_agent,
            client_ip=client_ip
        )
        return {"success": True, "id": eid}
    except Exception as e:
        logger.error(f"[TELEMETRY] Error logging telemetry: {e}")
        return {"success": False, "error": "Unable to record telemetry."}


def _extract_admin_header_key(request: Request) -> str:
    """Extract admin key strictly from request headers (never from URL query params)."""
    auth_header = request.headers.get("Authorization", "")
    bearer_key = auth_header.replace("Bearer ", "").strip() if auth_header.startswith("Bearer ") else ""
    return (request.headers.get("X-Admin-Key") or bearer_key or "").strip()


@app.get("/api/admin/telemetry")
@limiter.limit("20/minute")
async def get_admin_telemetry(request: Request):
    """Retrieve full telemetry, ratings, and error analytics for admin dashboard."""
    import telemetry
    if not telemetry.is_admin_configured():
        raise HTTPException(
            status_code=503,
            detail="Admin passcode is not configured on the server. Set ADMIN_SECRET_KEY environment variable."
        )
    key = _extract_admin_header_key(request)
    if not telemetry.verify_admin_key(key):
        raise HTTPException(status_code=401, detail="Unauthorized: Access denied")

    return telemetry.get_telemetry_summary()


@app.post("/api/admin/change-passcode")
@limiter.limit("10/minute")
async def change_admin_passcode(request: Request):
    """Allow authorized admin to update their passcode directly."""
    import telemetry
    if not telemetry.is_admin_configured():
        raise HTTPException(
            status_code=503,
            detail="Admin passcode is not configured on the server. Set ADMIN_SECRET_KEY environment variable."
        )
    key = _extract_admin_header_key(request)
    if not telemetry.verify_admin_key(key):
        raise HTTPException(status_code=401, detail="Unauthorized: Access denied")

    try:
        body = await request.json()
        new_passcode = str(body.get("new_passcode", "")).strip()
        if len(new_passcode) < 6:
            raise HTTPException(status_code=400, detail="New passcode must be at least 6 characters long.")

        ok = telemetry.set_admin_passcode(new_passcode)
        if not ok:
            raise HTTPException(status_code=500, detail="Failed to save new passcode to database.")

        return {"success": True, "message": "Admin passcode updated successfully."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[PASSCODE] Failed to change passcode: {e}")
        raise HTTPException(status_code=500, detail="Failed to update passcode.")


@app.post("/api/admin/test-webhook")
@limiter.limit("10/minute")
async def test_webhook(request: Request):
    """Send test alert to verify Discord or Telegram notifications."""
    import telemetry
    if not telemetry.is_admin_configured():
        raise HTTPException(
            status_code=503,
            detail="Admin passcode is not configured on the server. Set ADMIN_SECRET_KEY environment variable."
        )
    key = _extract_admin_header_key(request)
    if not telemetry.verify_admin_key(key):
        raise HTTPException(status_code=401, detail="Unauthorized")

    telemetry.send_discord_alert(
        "🔔 Test Notification",
        "Your Discord webhook is working properly! You will receive instant alerts whenever a user encounters an error or leaves feedback.",
        [{"name": "Status", "value": "✅ Online", "inline": True}],
        0x2ECC71
    )
    telemetry.send_telegram_alert(
        "🔔 *PDF Tool Test Alert!*\nYour Telegram webhook is connected successfully! You will now receive instant alerts when a tool fails or gets a review."
    )
    return {"success": True, "message": "Test notifications triggered."}


# ============================================================================
# SCAN-TO-PRINT ENTERPRISE ZERO-RAM DISK-SPOOLED RELAY (MILLIONS OF USERS SCALE)
# ============================================================================

PRINT_DROP_ROOMS: dict = {}
PRINT_DROP_ROOM_TIMESTAMPS: dict = {}
PRINT_DROP_ROOM_TOKENS: dict = {}
PRINT_DROP_DEVICE_TOKENS: dict = {}
PRINT_DROP_ROOM_SECRETS: dict = {}
PRINT_DROP_SPOOL_DIR = Path(tempfile.gettempdir()) / "pms_print_spool"
PRINT_DROP_SPOOL_DIR.mkdir(parents=True, exist_ok=True)
PIN_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"  # 32 unambiguous chars (no 0/O, 1/I/L)


def _hash_room_token(token: str) -> str:
    return hashlib.sha256(token.strip().encode("utf-8")).hexdigest()


def _get_room_secret_hash(clean_session: str) -> str:
    h = PRINT_DROP_ROOM_SECRETS.get(clean_session, "")
    if h:
        return h
    secret_file = PRINT_DROP_SPOOL_DIR / clean_session / ".room_secret"
    if secret_file.exists():
        try:
            h = secret_file.read_text(encoding="utf-8").strip()
            if h:
                PRINT_DROP_ROOM_SECRETS[clean_session] = h
                return h
        except Exception:
            pass
    return ""


def _set_room_secret_hash(clean_session: str, secret_hash: str):
    PRINT_DROP_ROOM_SECRETS[clean_session] = secret_hash
    session_folder = PRINT_DROP_SPOOL_DIR / clean_session
    session_folder.mkdir(parents=True, exist_ok=True)
    try:
        (session_folder / ".room_secret").write_text(secret_hash, encoding="utf-8")
    except Exception:
        pass


def _extract_room_token(request: Request) -> str:
    hdr = request.headers.get("X-Room-Token", "").strip()
    if hdr:
        return hdr
    auth = request.headers.get("Authorization", "").strip()
    if auth.startswith("Bearer "):
        return auth[7:].strip()
    return ""


def _read_disk_room_queue(clean_session: str) -> list[dict]:
    q_file = PRINT_DROP_SPOOL_DIR / clean_session / ".jobs.json"
    if not q_file.exists():
        return []
    try:
        data = json.loads(q_file.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _write_disk_room_queue(clean_session: str, jobs: list[dict]) -> None:
    session_folder = PRINT_DROP_SPOOL_DIR / clean_session
    session_folder.mkdir(parents=True, exist_ok=True)
    q_file = session_folder / ".jobs.json"
    tmp_file = session_folder / f".jobs_{uuid.uuid4().hex[:8]}.tmp"
    try:
        tmp_file.write_text(json.dumps(jobs), encoding="utf-8")
        tmp_file.replace(q_file)
    except Exception:
        tmp_file.unlink(missing_ok=True)


def _prune_expired_print_rooms():
    """Background garbage collection: strictly frees RAM and temp files older than 20 minutes."""
    try:
        now = time.time()
        expired_sessions = [k for k, v in PRINT_DROP_ROOM_TIMESTAMPS.items() if now - v > 1200]
        for s in expired_sessions:
            PRINT_DROP_ROOMS.pop(s, None)
            PRINT_DROP_ROOM_TIMESTAMPS.pop(s, None)
            PRINT_DROP_ROOM_TOKENS.pop(s, None)
            PRINT_DROP_DEVICE_TOKENS.pop(s, None)
            PRINT_DROP_ROOM_SECRETS.pop(s, None)
            session_folder = PRINT_DROP_SPOOL_DIR / s
            if session_folder.exists():
                shutil.rmtree(session_folder, ignore_errors=True)

        # Also sweep any individual spooled .bin files older than 15 minutes and stale room folders on disk
        if PRINT_DROP_SPOOL_DIR.exists():
            for bin_file in PRINT_DROP_SPOOL_DIR.glob("*/*.bin"):
                try:
                    if now - bin_file.stat().st_mtime > 900:
                        bin_file.unlink(missing_ok=True)
                except Exception:
                    pass
            for sdir in PRINT_DROP_SPOOL_DIR.iterdir():
                try:
                    if sdir.is_dir() and (now - sdir.stat().st_mtime > 1200):
                        shutil.rmtree(sdir, ignore_errors=True)
                except Exception:
                    pass

        # LRU safety valve: cap total active rooms tracked in memory to 5,000
        if len(PRINT_DROP_ROOM_TIMESTAMPS) > 5000:
            sorted_rooms = sorted(PRINT_DROP_ROOM_TIMESTAMPS.items(), key=lambda x: x[1])
            for s, _ in sorted_rooms[:1000]:
                PRINT_DROP_ROOMS.pop(s, None)
                PRINT_DROP_ROOM_TIMESTAMPS.pop(s, None)
                PRINT_DROP_ROOM_TOKENS.pop(s, None)
                PRINT_DROP_DEVICE_TOKENS.pop(s, None)
                PRINT_DROP_ROOM_SECRETS.pop(s, None)
                session_folder = PRINT_DROP_SPOOL_DIR / s
                if session_folder.exists():
                    shutil.rmtree(session_folder, ignore_errors=True)
    except Exception as e:
        logging.warning(f"ScanToPrint cleanup notice: {e}")

@app.get("/api/print-drop/new-session")
@limiter.limit("20/minute")
async def print_drop_new_session(request: Request):
    """Generate a guaranteed unique, collision-proof 6-character room PIN + secret read token."""
    _prune_expired_print_rooms()
    read_token = secrets.token_urlsafe(24)
    secret_hash = _hash_room_token(read_token)
    for _ in range(20):
        pin = "".join(secrets.choice(PIN_CHARS) for _ in range(6))
        if pin not in PRINT_DROP_ROOMS and not _get_room_secret_hash(pin):
            PRINT_DROP_ROOMS[pin] = []
            PRINT_DROP_ROOM_TIMESTAMPS[pin] = time.time()
            _set_room_secret_hash(pin, secret_hash)
            return {"success": True, "session_id": pin, "read_token": read_token}
    fallback_pin = "".join(secrets.choice(PIN_CHARS) for _ in range(4)) + f"{int(time.time()) % 100:02d}"
    PRINT_DROP_ROOMS[fallback_pin] = []
    PRINT_DROP_ROOM_TIMESTAMPS[fallback_pin] = time.time()
    _set_room_secret_hash(fallback_pin, secret_hash)
    return {"success": True, "session_id": fallback_pin, "read_token": read_token}


@app.post("/api/print-drop/register")
@limiter.limit("30/minute")
async def print_drop_register(
    request: Request,
    session_id: str = Form(...),
    read_token: str = Form(""),
):
    """Bind a Counter PC's secret read_token to its room PIN (returns 409 if room is already claimed by another station)."""
    _prune_expired_print_rooms()
    clean_session = re.sub(r"[^A-Z0-9]", "", session_id.strip().upper())
    if len(clean_session) < 3 or len(clean_session) > 12:
        raise HTTPException(status_code=400, detail="Invalid session room PIN")
    if clean_session in ("KIOSKSTATION", "AUDIONOTES"):
        raise HTTPException(status_code=400, detail="Shared global rooms are disabled for security. Use an isolated room PIN.")

    token = (read_token or _extract_room_token(request)).strip()
    if len(token) < 16:
        raise HTTPException(status_code=400, detail="Invalid room secret token")

    candidate_hash = _hash_room_token(token)
    existing_hash = _get_room_secret_hash(clean_session)
    if existing_hash:
        if not hmac.compare_digest(candidate_hash, existing_hash):
            raise HTTPException(status_code=409, detail="Room PIN is already claimed by another active station.")
        PRINT_DROP_ROOM_TIMESTAMPS[clean_session] = time.time()
        return {"success": True, "session_id": clean_session}

    # Prevent claiming a room that already has pending unauthenticated files from someone else
    if PRINT_DROP_ROOMS.get(clean_session) or _read_disk_room_queue(clean_session):
        raise HTTPException(status_code=409, detail="Room already active; please choose a fresh PIN.")

    PRINT_DROP_ROOMS.setdefault(clean_session, [])
    PRINT_DROP_ROOM_TIMESTAMPS[clean_session] = time.time()
    _set_room_secret_hash(clean_session, candidate_hash)
    return {"success": True, "session_id": clean_session}

@app.post("/api/print-drop/upload")
@limiter.limit("60/minute")
async def print_drop_upload(
    request: Request,
    session_id: str = Form(...),
    file: UploadFile = File(...),
    copies: int = Form(1),
    color_mode: str = Form("bw"),
    sender_device_id: str = Form(""),
    job_id: str = Form(""),
    device_label: str = Form(""),
    enc_meta: str = Form(""),
):
    """
    Zero-RAM disk streaming relay:
    Streams 20MB-50MB files directly to disk in 64KB chunks.
    RAM usage per upload is strictly < 64KB, preventing Out-Of-Memory (OOM)
    even when thousands of E-Mitra counters receive files simultaneously.
    """
    _prune_expired_print_rooms()
    clean_session = re.sub(r"[^A-Z0-9]", "", session_id.strip().upper())
    if len(clean_session) < 3 or len(clean_session) > 12:
        raise HTTPException(status_code=400, detail="Invalid session room PIN")
    if clean_session in ("KIOSKSTATION", "AUDIONOTES"):
        raise HTTPException(status_code=400, detail="Shared global rooms are disabled. Use an isolated room PIN.")

    # Require an active registered counter station so attackers cannot squat or spam unused PINs
    if not _get_room_secret_hash(clean_session):
        raise HTTPException(
            status_code=404,
            detail="Counter station PIN is inactive. Ask the operator to keep Scan-to-Print open."
        )

    # Anti-Spam Queue Cap: Max 30 pending uncollected files per room (check both RAM and disk fallback)
    disk_queue = _read_disk_room_queue(clean_session)
    ram_queue = PRINT_DROP_ROOMS.get(clean_session, [])
    current_queue = disk_queue if len(disk_queue) >= len(ram_queue) else ram_queue
    if len(current_queue) >= 30:
        raise HTTPException(
            status_code=429,
            detail="Counter queue is full (30 pending files). Please tell the operator to print pending items first."
        )

    session_folder = PRINT_DROP_SPOOL_DIR / clean_session
    session_folder.mkdir(parents=True, exist_ok=True)

    clean_client_job_id = re.sub(r"[^a-zA-Z0-9_-]", "", (job_id or "").strip())[:48]
    final_job_id = clean_client_job_id if clean_client_job_id else f"job_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}"
    file_path = session_folder / f"{final_job_id}.bin"

    # Stream file to disk in 64KB chunks — zero base64 memory allocation
    total_size = 0
    try:
        with open(file_path, "wb") as f_out:
            while chunk := await file.read(64 * 1024):
                total_size += len(chunk)
                if total_size > 100 * 1024 * 1024:
                    f_out.close()
                    file_path.unlink(missing_ok=True)
                    raise HTTPException(status_code=400, detail="File too large (max 100MB)")
                f_out.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        file_path.unlink(missing_ok=True)
        logger.error(f"[PRINT-DROP] Stream failure for room={clean_session}: {e}")
        raise HTTPException(status_code=500, detail="Failed to stream uploaded file.")

    mime = file.content_type or "application/pdf"
    # Map device ID to room token if provided, so subsequent files from same phone share customer token
    device_token_map = PRINT_DROP_DEVICE_TOKENS.setdefault(clean_session, {})
    clean_device_id = re.sub(r"[^a-zA-Z0-9_-]", "", (sender_device_id or "").strip())[:48]
    if clean_device_id and clean_device_id in device_token_map:
        room_token = device_token_map[clean_device_id]
    else:
        room_token = max(PRINT_DROP_ROOM_TOKENS.get(clean_session, 0), len(current_queue)) + 1
        PRINT_DROP_ROOM_TOKENS[clean_session] = room_token
        if clean_device_id:
            device_token_map[clean_device_id] = room_token

    safe_label = re.sub(r"[\x00-\x1f\x7f<>]", "", (device_label or "Mobile Phone").strip())[:32] or "Mobile Phone"
    safe_doc_name = safe_filename(file.filename, "Document.pdf")
    clean_enc_meta = re.sub(r"[^A-Za-z0-9\-_]", "", (enc_meta or "").strip())[:4096]

    # Lightweight metadata (< 250 bytes in RAM; encrypted metadata keeps original filename hidden)
    job = {
        "id": final_job_id,
        "tokenNum": room_token,
        "senderDeviceId": clean_device_id,
        "deviceLabel": safe_label,
        "name": safe_doc_name,
        "encMeta": clean_enc_meta,
        "size": total_size,
        "type": mime,
        "fileUrl": f"/api/print-drop/file/{clean_session}/{final_job_id}",
        "timestamp": time.strftime("%I:%M:%S %p"),
        "copies": max(1, min(20, copies)),
        "colorMode": "color" if color_mode == "color" else "bw",
    }

    updated_queue = list(current_queue) + [job]
    PRINT_DROP_ROOMS[clean_session] = updated_queue
    _write_disk_room_queue(clean_session, updated_queue)
    PRINT_DROP_ROOM_TIMESTAMPS[clean_session] = time.time()

    return {"success": True, "job_id": final_job_id, "token_num": room_token, "session_id": clean_session}

@app.get("/api/print-drop/jobs/{session_id}")
@limiter.limit("120/minute")
async def print_drop_poll(request: Request, session_id: str, peek: bool = False):
    """Retrieve and clear new jobs for the authenticated counter PC queue."""
    clean_session = re.sub(r"[^A-Z0-9]", "", session_id.strip().upper())
    expected_hash = _get_room_secret_hash(clean_session)
    if not expected_hash:
        raise HTTPException(status_code=412, detail="Room not registered")
    provided = _extract_room_token(request)
    if not provided or not hmac.compare_digest(_hash_room_token(provided), expected_hash):
        raise HTTPException(status_code=403, detail="Unauthorized: Invalid room token")

    ram_jobs = PRINT_DROP_ROOMS.get(clean_session, [])
    disk_jobs = _read_disk_room_queue(clean_session)
    merged = disk_jobs if len(disk_jobs) >= len(ram_jobs) else ram_jobs

    if peek:
        jobs = list(merged)
    else:
        jobs = list(merged)
        PRINT_DROP_ROOMS[clean_session] = []
        _write_disk_room_queue(clean_session, [])
    PRINT_DROP_ROOM_TIMESTAMPS[clean_session] = time.time()
    return {"success": True, "jobs": jobs}

@app.get("/api/print-drop/file/{session_id}/{job_id}")
@limiter.limit("60/minute")
async def print_drop_download_file(request: Request, session_id: str, job_id: str, keep: bool = False):
    """Serve spooled document to authenticated counter PC with immediate post-delivery deletion."""
    clean_session = re.sub(r"[^A-Z0-9]", "", session_id.strip().upper())
    expected_hash = _get_room_secret_hash(clean_session)
    if not expected_hash:
        raise HTTPException(status_code=403, detail="Unauthorized: Room is not registered")
    provided = _extract_room_token(request)
    if not provided or not hmac.compare_digest(_hash_room_token(provided), expected_hash):
        raise HTTPException(status_code=403, detail="Unauthorized: Invalid room token")

    safe_job_id = re.sub(r"[^a-zA-Z0-9_-]", "", job_id)
    file_path = PRINT_DROP_SPOOL_DIR / clean_session / f"{safe_job_id}.bin"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Document expired or already processed")

    # Only per-note Talking Notes rooms (TN...) allow multi-student reads during the 20-min TTL
    is_audio_note = clean_session.startswith("TN")
    persist_file = is_audio_note and keep
    media_type = "audio/webm" if is_audio_note else "application/octet-stream"

    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        headers={
            "Cache-Control": "private, no-cache, no-store, must-revalidate",
            "Content-Disposition": f'inline; filename="{safe_job_id}.bin"',
        },
        background=None if persist_file else BackgroundTask(lambda: file_path.unlink(missing_ok=True)),
    )


@app.delete("/api/print-drop/session/{session_id}")
@limiter.limit("20/minute")
async def print_drop_purge_session(request: Request, session_id: str):
    """Immediately destroy a counter station room and wipe all spooled files on demand."""
    clean_session = re.sub(r"[^A-Z0-9]", "", session_id.strip().upper())
    expected_hash = _get_room_secret_hash(clean_session)
    if not expected_hash:
        return {"success": True, "purged": False}
    provided = _extract_room_token(request)
    if not provided or not hmac.compare_digest(_hash_room_token(provided), expected_hash):
        raise HTTPException(status_code=403, detail="Unauthorized: Invalid room token")

    PRINT_DROP_ROOMS.pop(clean_session, None)
    PRINT_DROP_ROOM_TIMESTAMPS.pop(clean_session, None)
    PRINT_DROP_ROOM_TOKENS.pop(clean_session, None)
    PRINT_DROP_DEVICE_TOKENS.pop(clean_session, None)
    PRINT_DROP_ROOM_SECRETS.pop(clean_session, None)
    session_folder = PRINT_DROP_SPOOL_DIR / clean_session
    if session_folder.exists():
        shutil.rmtree(session_folder, ignore_errors=True)
    return {"success": True, "purged": True, "session_id": clean_session}


# ─── 16. Deep-Tech Forensic, Vectorizer & Contract Engines ─────────────────

@app.post("/analyze/forensics")
@limiter.limit("20/minute")
async def analyze_forensics(request: Request, file: UploadFile = File(...)):
    """
    Deep multimodal forensic inspection of PDFs & raster image scans:
      - SHA-256 checksum & editing-tool EXIF/XMP fingerprinting
      - Cryptographic /Sig ByteRange coverage & incremental XRef revisions
      - Whiteout mask detection with concealed underlying text X-Ray recovery
      - Inline font splicing, baseline vertical jitter & text-over-scan detection
      - Real JPEG Error Level Analysis (ELA) heatmap & splice hotspot detection
    """
    from deep_tech_engine import analyze_forensics_deep, IMAGE_EXTENSIONS

    inp = None
    try:
        raw_bytes = await safe_read_upload(file)
        fname = file.filename or "Document.pdf"
        ext = Path(fname).suffix.lower()
        is_img = ext in IMAGE_EXTENSIONS or raw_bytes[:3] == b"\xff\xd8\xff" or raw_bytes[:8] == b"\x89PNG\r\n\x1a\n"
        if not is_img:
            inp = temp_path(".pdf")
            inp.write_bytes(raw_bytes)
            check_pdf_page_count(inp, "analyze-forensics")
            cleanup(inp)
            inp = None

        result = await asyncio.to_thread(analyze_forensics_deep, raw_bytes, fname)
        return JSONResponse(result)
    except HTTPException:
        if inp:
            cleanup(inp)
        raise
    except Exception as e:
        if inp:
            cleanup(inp)
        raise safe_error(e, "analyze-forensics")


@app.post("/convert/true-vector-4k")
@limiter.limit("20/minute")
async def convert_true_vector_4k(
    request: Request,
    file: UploadFile = File(...),
    mode: str = Form("adaptive_4k"),
    color_mode: str = Form("color"),
    sharpness: float = Form(1.6),
    paper_whitening: int = Form(212),
    ink_darkness: int = Form(75),
    color_vibrance: int = Form(130),
    shadow_removal: int = Form(85),
    dpi_target: int = Form(280),
    page_num: int = Form(1),
    include_ocr: bool = Form(False),
    output_format: str = Form("json_bundle"),
):
    """
    Deep-Tech TrueVector 4K Engine:
      - Morphological LAB shadow/illumination normalization & bilateral denoising
      - Authentic colored ink / stamp separation & adaptive 4K sharpening
      - Mathematical OpenCV RETR_CCOMP Cubic Bezier SVG & native Vector PDF tracing
      - Optional RapidOCR searchable invisible text layer
    """
    from deep_tech_engine import process_true_vector_4k, IMAGE_EXTENSIONS

    inp = None
    try:
        raw_bytes = await safe_read_upload(file)
        fname = file.filename or "scan.pdf"
        ext = Path(fname).suffix.lower()
        is_img = ext in IMAGE_EXTENSIONS or raw_bytes[:3] == b"\xff\xd8\xff" or raw_bytes[:8] == b"\x89PNG\r\n\x1a\n"
        if not is_img:
            inp = temp_path(".pdf")
            inp.write_bytes(raw_bytes)
            check_pdf_page_count(inp, "true-vector-4k")
            cleanup(inp)
            inp = None

        res = await asyncio.to_thread(
            process_true_vector_4k,
            raw_bytes,
            fname,
            mode=mode,
            color_mode=color_mode,
            sharpness=float(sharpness),
            paper_whitening=int(paper_whitening),
            ink_darkness=int(ink_darkness),
            color_vibrance=int(color_vibrance),
            shadow_removal=int(shadow_removal),
            dpi_target=int(dpi_target),
            page_num=int(page_num),
            include_ocr=bool(include_ocr),
            output_format=output_format,
        )

        if output_format in ("svg", "pdf"):
            return Response(
                content=res["bytes"],
                media_type=res["content_type"],
                headers={
                    "X-Vector-Paths": str(res.get("path_count", 0)),
                    "X-Bezier-Nodes": str(res.get("bezier_nodes", 0)),
                    "X-Ocr-Words": str(res.get("ocr_words", 0)),
                },
            )
        return JSONResponse(res)
    except HTTPException:
        if inp:
            cleanup(inp)
        raise
    except Exception as e:
        if inp:
            cleanup(inp)
        raise safe_error(e, "true-vector-4k")


@app.post("/analyze/contract-redline")
@limiter.limit("20/minute")
async def analyze_contract_redline_endpoint(
    request: Request,
    file: UploadFile = File(...),
    use_ai: bool = Form(True),
):
    """
    Deep-Tech Contract Trap Redliner:
      - 14+ comprehensive legal/financial risk patterns & missing safeguard checks
      - Automatic RapidOCR fallback for scanned stamp papers & image agreements
      - Exact PDF coordinate bounding-box extraction for clause-level highlighting
      - Optional server-side Gemini semantic deep audit (budget & quota protected)
    """
    from deep_tech_engine import analyze_contract_redline_deep

    inp = temp_path(".pdf")
    try:
        raw_bytes = await safe_read_upload(file)
        inp.write_bytes(raw_bytes)
        check_pdf_page_count(inp, "contract-redline")
        cleanup(inp)
        inp = None

        quota_ok = bool(use_ai) and server_ai_quota_ok(request, user_key_supplied=False, strict_local=False)
        res = await asyncio.to_thread(
            analyze_contract_redline_deep,
            raw_bytes,
            file.filename or "Agreement.pdf",
            use_ai=bool(use_ai),
            ai_quota_ok=quota_ok,
        )
        return JSONResponse(res)
    except HTTPException:
        if inp:
            cleanup(inp)
        raise
    except Exception as e:
        if inp:
            cleanup(inp)
        raise safe_error(e, "contract-redline")


@app.get("/vision/status")
async def vision_status():
    """
    Lightweight status check reporting whether enhanced document processing is available.
    Returns capability booleans only; never exposes internal provider details or credentials.
    """
    from ai_vision_refiner import get_server_vision_status

    return JSONResponse(get_server_vision_status())


@app.post("/vision/assist")
@limiter.limit("30/minute")
async def vision_assist(request: Request):
    """
    Server-side document intelligence helper so browser JS never calls external
    endpoints directly or exposes credentials or provider details in Network/Console.
    """
    from ai_vision_refiner import run_vision_assist_task

    try:
        raw_bytes = await request.body()
        if len(raw_bytes) > 12 * 1024 * 1024:
            raise HTTPException(413, "Vision payload exceeds 12MB limit.")
        payload = json.loads(raw_bytes.decode("utf-8"))
        if not isinstance(payload, dict):
            raise HTTPException(400, "Invalid JSON payload.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Invalid JSON request body.")

    task = str(payload.get("task") or "").strip().lower()
    if task not in (
        "document_layout",
        "text_regions",
        "table_data",
        "enhance_text",
        "polish_paragraphs",
        "universal_layout",
        "fix_text",
        "translate_hi_en",
        "shorten_text",
    ):
        raise HTTPException(400, "Unsupported document assist task.")

    strict_local = bool(payload.get("strict_local", False))
    provider = str(payload.get("ai_provider") or "auto").strip()
    user_api_key = payload.get("ai_api_key")
    if not strict_local and not server_ai_quota_ok(request, bool(user_api_key and str(user_api_key).strip()), strict_local):
        strict_local = True
    text_in = str(payload.get("text") or "")
    if len(text_in) > 20000:
        raise HTTPException(413, "Text payload too large.")
    image_b64 = str(payload.get("image_b64") or "")
    text = str(payload.get("text") or "")
    paras = payload.get("paras") if isinstance(payload.get("paras"), list) else None
    lang = str(payload.get("lang") or "auto").strip()
    try:
        max_chars = int(payload.get("max_chars") or 0)
    except (TypeError, ValueError):
        max_chars = 0

    result = await run_in_threadpool(
        run_vision_assist_task,
        task,
        image_b64=image_b64,
        text=text,
        paras=paras,
        provider=provider,
        user_api_key=str(user_api_key) if user_api_key else None,
        strict_local=strict_local,
        max_chars=max_chars,
        lang=lang,
    )
    if result is None:
        return JSONResponse({"ok": False, "result": None}, status_code=503)
    return JSONResponse({"ok": True, "result": result})

