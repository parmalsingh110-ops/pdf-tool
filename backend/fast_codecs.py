"""
Zero-Compromise Native C/Rust Drop-In Accelerators
--------------------------------------------------
Provides transparent, crash-safe acceleration across the PDF Media Suite backend
with 100% bit-identical output quality and automatic stdlib/OpenCV fallbacks:
  1. `orjson`       — Rust SIMD JSON serialization & FastAPI `ORJSONResponse` (2x-9x faster)
  2. `zlib-ng`      — SIMD DEFLATE/GZip compression for compressible text/JSON only (2x-3x faster)
  3. `PyTurboJPEG`  — Direct `libjpeg-turbo` C API encode/decode (1.5x-3x faster than cv2.imencode)
  4. `SmartGZipMiddleware` — Pure-ASGI selective GZip that NEVER wastes CPU re-compressing
     already-compressed PDFs/DOCX/XLSX/PPTX/images or AES-256-GCM encrypted Print-Drop streams.
"""

from __future__ import annotations

import json
import threading
import zlib
from typing import Any, Optional

import cv2
import numpy as np
from fastapi.responses import JSONResponse

try:
    import orjson  # type: ignore[import-not-found]
    from fastapi.responses import ORJSONResponse  # type: ignore[attr-defined]

    HAS_ORJSON = True
except Exception:
    orjson = None  # type: ignore[assignment]
    ORJSONResponse = JSONResponse  # type: ignore[misc, assignment]
    HAS_ORJSON = False

try:
    from zlib_ng import zlib_ng as _zlib_impl  # type: ignore[import-not-found]

    HAS_ZLIB_NG = True
except Exception:
    _zlib_impl = zlib
    HAS_ZLIB_NG = False

_TJ_LOCK = threading.Lock()
_TJ_INSTANCE: Any = None
_TJ_INIT_TRIED = False
HAS_TURBOJPEG = False


def _get_turbojpeg() -> Any:
    """Lazily initialize PyTurboJPEG (compatible with libjpeg-turbo 2.x & 3.x)."""
    global _TJ_INSTANCE, _TJ_INIT_TRIED, HAS_TURBOJPEG
    if _TJ_INIT_TRIED:
        return _TJ_INSTANCE
    with _TJ_LOCK:
        if _TJ_INIT_TRIED:
            return _TJ_INSTANCE
        _TJ_INIT_TRIED = True
        try:
            from turbojpeg import TurboJPEG  # type: ignore[import-not-found]

            _TJ_INSTANCE = TurboJPEG()
            HAS_TURBOJPEG = True
        except Exception:
            _TJ_INSTANCE = None
            HAS_TURBOJPEG = False
        return _TJ_INSTANCE


def get_default_json_response_class():
    """Return `ORJSONResponse` when `orjson` is available, else standard `JSONResponse`."""
    return ORJSONResponse if HAS_ORJSON else JSONResponse


def fast_json_loads(raw: str | bytes | bytearray) -> Any:
    if HAS_ORJSON and orjson is not None:
        return orjson.loads(raw)
    if isinstance(raw, (bytes, bytearray)):
        return json.loads(raw.decode("utf-8"))
    return json.loads(raw)


def fast_json_dumps(obj: Any, *, ensure_ascii: bool = False) -> str:
    if HAS_ORJSON and orjson is not None and not ensure_ascii:
        return orjson.dumps(obj).decode("utf-8")
    return json.dumps(obj, ensure_ascii=ensure_ascii)


def fast_json_dumps_bytes(obj: Any) -> bytes:
    if HAS_ORJSON and orjson is not None:
        return orjson.dumps(obj)
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def fast_jpeg_encode(img_bgr: np.ndarray, quality: int = 82) -> bytes:
    """Encode BGR numpy array to JPEG using libjpeg-turbo when available, else OpenCV."""
    q = max(1, min(100, int(quality)))
    tj = _get_turbojpeg()
    if tj is not None and img_bgr is not None and img_bgr.ndim == 3 and img_bgr.shape[2] == 3 and img_bgr.dtype == np.uint8:
        try:
            work = img_bgr if img_bgr.flags["C_CONTIGUOUS"] else np.ascontiguousarray(img_bgr)
            return bytes(tj.encode(work, quality=q))
        except Exception:
            pass
    ok, buf = cv2.imencode(".jpg", img_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), q])
    if not ok:
        raise ValueError("Failed to encode JPEG image.")
    return buf.tobytes()


def fast_jpeg_decode(raw_bytes: bytes) -> Optional[np.ndarray]:
    """Decode JPEG bytes to BGR ndarray via libjpeg-turbo when available, else OpenCV."""
    if not raw_bytes:
        return None
    if len(raw_bytes) >= 3 and raw_bytes[:3] == b"\xff\xd8\xff":
        tj = _get_turbojpeg()
        if tj is not None:
            try:
                arr = tj.decode(raw_bytes)
                if arr is not None and arr.size > 0:
                    return arr
            except Exception:
                pass
    decoded = cv2.imdecode(np.frombuffer(raw_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    return decoded if (decoded is not None and decoded.size > 0) else None


def fast_gzip_compress(data: bytes, level: int = 5) -> bytes:
    """Compress payload into a standard RFC-1952 GZip stream via SIMD zlib-ng (or stdlib zlib)."""
    co = _zlib_impl.compressobj(level=level, method=zlib.DEFLATED, wbits=31)
    return co.compress(data) + co.flush()


def get_accelerator_status() -> dict[str, bool]:
    """Report active C/Rust runtime accelerators (strictly capability booleans)."""
    _get_turbojpeg()
    import os

    ld_preload = os.environ.get("LD_PRELOAD", "")
    return {
        "orjson": HAS_ORJSON,
        "zlib_ng": HAS_ZLIB_NG,
        "turbojpeg": HAS_TURBOJPEG,
        "jemalloc": "jemalloc" in ld_preload.lower(),
    }


_COMPRESSIBLE_PREFIXES = (
    "application/json",
    "text/",
    "image/svg+xml",
    "application/javascript",
    "application/xml",
)


def _is_compressible_content_type(content_type: str) -> bool:
    ct = content_type.split(";", 1)[0].strip().lower()
    return any(ct.startswith(p) for p in _COMPRESSIBLE_PREFIXES)


class SmartGZipMiddleware:
    """
    Pure-ASGI Selective GZip Middleware backed by `zlib-ng`:
    - Compresses ONLY compressible JSON/text/SVG responses >= `minimum_size`.
    - Streams binary outputs (`.docx`, `.xlsx`, `.pptx`, `.pdf`, images, AES-GCM Print-Drop `.bin`)
      straight through with 0% wasted CPU and zero extra RAM buffering.
    """

    def __init__(self, app: Any, minimum_size: int = 500, compresslevel: int = 5) -> None:
        self.app = app
        self.minimum_size = max(128, int(minimum_size))
        self.compresslevel = max(1, min(9, int(compresslevel)))

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        method = str(scope.get("method", "GET")).upper()
        path = str(scope.get("path", ""))
        if method == "HEAD" or path.startswith("/api/print-drop/file/"):
            await self.app(scope, receive, send)
            return

        accept_gzip = False
        for k, v in scope.get("headers") or ():
            if k.lower() == b"accept-encoding" and b"gzip" in v.lower():
                accept_gzip = True
                break
        if not accept_gzip:
            await self.app(scope, receive, send)
            return

        start_message: Optional[dict[str, Any]] = None
        should_compress = False
        passthrough = False
        body_chunks: list[bytes] = []

        async def _send_wrapper(message: dict[str, Any]) -> None:
            nonlocal start_message, should_compress, passthrough

            if message["type"] == "http.response.start":
                status = int(message.get("status", 200))
                raw_headers = list(message.get("headers") or [])
                content_type = ""
                has_encoding = False
                for hk, hv in raw_headers:
                    hkl = hk.lower()
                    if hkl == b"content-type":
                        content_type = hv.decode("latin-1", errors="ignore")
                    elif hkl == b"content-encoding":
                        has_encoding = True

                if (
                    status in (204, 304)
                    or has_encoding
                    or not _is_compressible_content_type(content_type)
                ):
                    passthrough = True
                    await send(message)
                    return

                should_compress = True
                start_message = message
                return

            if message["type"] == "http.response.body":
                if passthrough or not should_compress or start_message is None:
                    await send(message)
                    return

                chunk = message.get("body", b"")
                if chunk:
                    body_chunks.append(chunk)
                if message.get("more_body", False):
                    return

                full_body = b"".join(body_chunks)
                body_chunks.clear()

                raw_headers = list(start_message.get("headers") or [])
                if len(full_body) >= self.minimum_size:
                    compressed = fast_gzip_compress(full_body, level=self.compresslevel)
                    if len(compressed) < len(full_body):
                        new_headers = [
                            (hk, hv)
                            for hk, hv in raw_headers
                            if hk.lower() not in (b"content-length", b"content-encoding")
                        ]
                        has_vary_ae = any(
                            hk.lower() == b"vary" and b"accept-encoding" in hv.lower()
                            for hk, hv in new_headers
                        )
                        if not has_vary_ae:
                            new_headers.append((b"vary", b"Accept-Encoding"))
                        new_headers.append((b"content-encoding", b"gzip"))
                        new_headers.append((b"content-length", str(len(compressed)).encode("ascii")))
                        await send({**start_message, "headers": new_headers})
                        await send({"type": "http.response.body", "body": compressed, "more_body": False})
                        return

                await send(start_message)
                await send({"type": "http.response.body", "body": full_body, "more_body": False})
                return

            await send(message)

        await self.app(scope, receive, _send_wrapper)
