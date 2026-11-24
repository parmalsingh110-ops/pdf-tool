"""
AI Vision Semantic Refiner (Optional Multi-Provider VLM Plug-In)
-----------------------------------------------------------------
Pairs sub-pixel OpenCV Layer/Grid geometry with Vision-Language AI semantic
understanding (Google Gemini Vision, Anthropic Claude Vision, OpenAI Vision):
  - Works strictly ONLY when enabled (BYOK session key from frontend or server
    env GEMINI_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY) and `strict_local=False`.
  - Never sends files externally in offline / Airgap / `strict_local=True` mode.
  - Preserves OpenCV's exact pixel table grid, merged `(r0, c0, r1, c1)` spans,
    shading colors, and cropped visual assets (photos/logos/QR/seals), while letting
    the VLM accurately transcribe & semantically repair blurry/watermarked text,
    curved arched board titles, Hindi Devanagari Unicode, and cohesive paragraphs.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import re
import threading
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any, Optional
import unicodedata

import cv2
import numpy as np
import requests

from fast_codecs import fast_jpeg_encode, fast_json_loads
from vertex_auth import (
    build_vertex_generate_url,
    get_priority_headers,
    get_vertex_access_token,
    is_vertex_sa_configured,
    load_vertex_service_account,
)

_VERTEX_SA_SENTINEL = "__VERTEX_SA__"

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env")
except Exception:
    pass

logger = logging.getLogger("mediasuite.ai_vision")

# Ordered by verified latency, JSON/multimodal OCR reliability, and capability.
# Each entry pairs a model ID with its verified thinkingConfig (or None if unsupported/unneeded).
_GEMINI_MODEL_SPECS: tuple[tuple[str, Optional[dict[str, Any]]], ...] = (
    ("gemini-3-flash-preview", {"thinkingLevel": "MINIMAL"}),
    ("gemini-2.5-flash", {"thinkingBudget": 0}),
    ("gemini-3.6-flash", {"thinkingBudget": 0}),
    ("gemini-3.5-flash-lite", None),
    ("gemini-3.1-flash-lite", None),
    ("gemini-flash-lite-latest", None),
    ("gemini-3.5-flash", {"thinkingLevel": "LOW"}),
    ("gemini-3.8-flash", {"thinkingLevel": "LOW"}),
    ("gemini-3.7-flash", {"thinkingLevel": "LOW"}),
    ("gemini-flash-latest", {"thinkingBudget": 0}),
    ("gemini-4-hydrogen", None),
)
_GEMINI_MODELS = tuple(name for name, _ in _GEMINI_MODEL_SPECS)
_GEMINI_SPEC_MAP: dict[str, Optional[dict[str, Any]]] = dict(_GEMINI_MODEL_SPECS)
_GEMINI_VERTEX_SPECS: tuple[tuple[str, Optional[dict[str, Any]]], ...] = (
    ("gemini-2.5-flash", {"thinkingBudget": 0}),
    ("gemini-2.0-flash", None),
    ("gemini-2.5-pro", None),
)
_GEMINI_VERTEX_FALLBACK_MODELS: tuple[str, ...] = tuple(m for m, _ in _GEMINI_VERTEX_SPECS)
_GEMINI_DISCOVERY_EXCLUDED = (
    "embedding",
    "-tts",
    "-image",
    "nano-banana",
    "transcribe",
    "robotics",
    "computer-use",
    "customtools",
    "deep-research",
    "lyria",
    "omni",
    "2.0-",
    "2.5-pro",
    "pro-latest",
)

_CACHE_LOCK = threading.Lock()
_HTTP_SESSION: Optional[requests.Session] = None
_ORIG_REQUESTS_GET = requests.get
_ORIG_REQUESTS_POST = requests.post
_DISCOVERED_MODELS_CACHE: dict[str, tuple[float, set[str]]] = {}
_DISCOVER_FAIL_UNTIL: dict[str, float] = {}
_MODEL_COOLDOWN_UNTIL: dict[tuple[str, str, str], float] = {}
_ENDPOINT_BLOCKED_UNTIL: dict[tuple[str, str], float] = {}
_ENDPOINT_TRANSIENT_FAILS: dict[tuple[str, str], int] = {}
_ENDPOINT_PREF: dict[str, str] = {}
_RESPONSE_CACHE: OrderedDict[str, tuple[float, Any]] = OrderedDict()
_RESPONSE_CACHE_MAX = 128
_RESPONSE_CACHE_TTL_S = 1800.0

_CLAUDE_MODELS = ("claude-3-5-sonnet-latest", "claude-3-5-haiku-latest")
_OPENAI_MODELS = ("gpt-4o", "gpt-4o-mini")


def get_server_vision_status() -> dict[str, Any]:
    """
    Report whether enhanced document intelligence is available on the server.
    Strictly returns capability booleans only; NEVER returns provider names or key material.
    """
    allow_server_ai = os.environ.get("ALLOW_AI_VISION_OCR", "true").strip().lower() in ("1", "true", "yes")
    has_configured = bool(
        allow_server_ai
        and (
            is_vertex_sa_configured()
            or os.environ.get("GEMINI_API_KEY", "").strip()
            or os.environ.get("ANTHROPIC_API_KEY", "").strip()
            or os.environ.get("OPENAI_API_KEY", "").strip()
        )
    )
    return {
        "enhanced_available": has_configured,
        "server_ai_configured": has_configured,
        "allow_server_ai": allow_server_ai,
    }


def resolve_vision_credentials(
    user_api_key: Optional[str] = None,
    provider: Optional[str] = None,
    strict_local: bool = False,
) -> tuple[Optional[str], Optional[str]]:
    """
    Resolve active `(provider, api_key)` safely without logging secrets.
    Returns `(None, None)` whenever local-only mode is requested or no key is available.
    """
    if strict_local:
        return None, None

    prov_clean = (provider or "auto").strip().lower()
    if prov_clean in ("offline", "none", "local"):
        return None, None

    allow_server_ai = os.environ.get("ALLOW_AI_VISION_OCR", "true").strip().lower() in ("1", "true", "yes")

    key = (user_api_key or "").strip()
    if key:
        if prov_clean in ("claude", "anthropic") or key.startswith("sk-ant-"):
            return "claude", key
        if prov_clean == "openai" or (key.startswith("sk-") and not key.startswith("sk-ant-")):
            return "openai", key
        if prov_clean == "gemini" or key.startswith(("AIza", "AQ.")):
            return "gemini", key
        # Default fallback if ambiguous custom key string
        return (prov_clean if prov_clean in ("gemini", "claude", "openai") else "gemini"), key

    if not allow_server_ai:
        return None, None

    gemini_env = os.environ.get("GEMINI_API_KEY", "").strip()
    claude_env = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    openai_env = os.environ.get("OPENAI_API_KEY", "").strip()
    has_vertex_sa = is_vertex_sa_configured()

    if prov_clean == "gemini" and (has_vertex_sa or gemini_env):
        return "gemini", (gemini_env or _VERTEX_SA_SENTINEL)
    if prov_clean in ("claude", "anthropic") and claude_env:
        return "claude", claude_env
    if prov_clean == "openai" and openai_env:
        return "openai", openai_env

    # Auto priority: Vertex AI / Gemini Flash/Pro -> Claude Vision -> OpenAI Vision
    if has_vertex_sa or gemini_env:
        return "gemini", (gemini_env or _VERTEX_SA_SENTINEL)
    if claude_env:
        return "claude", claude_env
    if openai_env:
        return "openai", openai_env

    return None, None


def _get_http_session() -> requests.Session:
    """Reuse pooled HTTPS keep-alive connections across Vision API calls (saves TLS handshake latency)."""
    global _HTTP_SESSION
    with _CACHE_LOCK:
        if _HTTP_SESSION is None:
            from requests.adapters import HTTPAdapter

            sess = requests.Session()
            adapter = HTTPAdapter(pool_connections=8, pool_maxsize=16)
            sess.mount("https://", adapter)
            sess.mount("http://", adapter)
            _HTTP_SESSION = sess
        return _HTTP_SESSION


def _http_get(url: str, **kwargs: Any) -> requests.Response:
    if requests.get is not _ORIG_REQUESTS_GET:
        return requests.get(url, **kwargs)
    return _get_http_session().get(url, **kwargs)


def _http_post(url: str, **kwargs: Any) -> requests.Response:
    if requests.post is not _ORIG_REQUESTS_POST:
        return requests.post(url, **kwargs)
    return _get_http_session().post(url, **kwargs)


def _encode_image_b64_jpeg(img_bgr: np.ndarray, max_dim: int = 1240) -> str:
    h, w = img_bgr.shape[:2]
    scale = min(1.0, max_dim / float(max(h, w)))
    work = img_bgr
    if scale < 0.99:
        work = cv2.resize(img_bgr, (max(64, int(w * scale)), max(64, int(h * scale))), interpolation=cv2.INTER_AREA)
    jpg_bytes = fast_jpeg_encode(work, quality=82)
    return base64.b64encode(jpg_bytes).decode("ascii")


def _extract_json_object(raw: str) -> dict[str, Any]:
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", (raw or "").strip(), flags=re.IGNORECASE | re.MULTILINE).strip()
    try:
        obj = fast_json_loads(cleaned)
        return obj if isinstance(obj, dict) else {}
    except Exception:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            snippet = cleaned[start : end + 1]
            for candidate in (snippet, re.sub(r",\s*([}\]])", r"\1", snippet)):
                try:
                    obj = fast_json_loads(candidate)
                    if isinstance(obj, dict):
                        return obj
                except Exception:
                    continue
        return {}


def _build_grid_guided_prompt(
    page_w_pt: float,
    page_h_pt: float,
    skeleton: dict[str, Any],
    lang_hint: str = "auto",
    is_digital_page: bool = False,
) -> str:
    lang_note = (
        f"Requested language/script hint: `{lang_hint}` (always preserve exact document script & Unicode)."
        if lang_hint and lang_hint.lower() != "auto"
        else "Preserve every visible script verbatim in UTF-8 (Latin, Devanagari/Hindi, Arabic, CJK, Cyrillic, Tamil, Bengali, etc.)."
    )
    digital_rule = (
        """
5. BORN-DIGITAL / HYBRID DOCUMENT RULE (EXACT NATIVE TEXT + EMBEDDED IMAGE OCR & POSITIONING):
   - This is a born-digital PDF containing native text mixed with embedded photos, signatures, stamps, or raster screenshots (`assets`).
   - Preserve exact digital IDs, numbers, roll numbers, dates, and URLs shown in `skeleton` (`digital_native_lines` / `ocr_draft`) verbatim without paraphrasing or altering characters.
   - Read and transcribe ALL visible text inside any embedded raster images, pasted screenshot tables, rubber stamps, or signature captions (`assets`) into their proper table cells or `non_table_blocks` using exact `box_2d` coordinates.
   - Carefully separate side-by-side columns (`kv_pair` or tightly bounded `paragraph` `box_2d` on left vs right) so text never collides with adjacent passport photos, signatures, seals, or QR codes in `skeleton.assets`."""
        if is_digital_page
        else ""
    )
    return f"""You are a senior Multilingual Document Understanding & OCR Vision AI supporting all world languages and scripts.
Analyze this {'born-digital/hybrid' if is_digital_page else 'scanned/photographed'} document image and extract ALL visible document text into exact UTF-8 Unicode with accurate 2D bounding boxes (`box_2d`: `[ymin, xmin, ymax, xmax]` on a `0..1000` normalized page scale) while respecting the OpenCV-detected layout & table skeleton below.
{lang_note}

PAGE SIZE (points): {page_w_pt:.1f} x {page_h_pt:.1f}

OPENCV DETECTED STRUCTURE SKELETON:
{json.dumps(skeleton, ensure_ascii=False)}

CRITICAL RULES:
1. EXACT WORDS & EXACT SCRIPT (ZERO TRANSLATION OR OCR GARBAGE):
   - Read every word directly from the image pixels. Never substitute random English words inside Hindi/Devanagari or other non-Latin sentences.
   - Preserve exact Hindi/Devanagari matras, conjuncts, punctuation (`।`, `-`, `:`, `/`), zero-padded roll/certificate/Aadhaar/token numbers, URLs (`www.emitra.rajasthan.gov.in`), and codes (`RJ/2017/...`, `YSKIKCB`).
   - Ignore decorative vertical border ribbons on the left/right edges (such as repeated `e-Mitra` side borders) and faint diagonal/tiled background watermarks.

2. EVERY TABLE CELL STAYS LOCKED INSIDE ITS `cell_id`:
   - If `tables` are present in the skeleton, verify every `cell_id` `(r0, c0) -> (r1, c1)` directly against the image pixels.
   - For large tables (> 40 cells), return in `tables[i].cells` ONLY the `cell_id` entries whose `ocr_draft` is inaccurate, misspelled, or missing compared to the image (omitted `cell_id` entries automatically keep their exact `ocr_draft`). For smaller tables (<= 40 cells), you may return all cells or only corrected ones.
   - If a cell in the image is genuinely blank/empty watermark noise, return `""`.
   - Use "\\n" inside a cell's `text` ONLY if the image cell genuinely stacks multiple visual lines.

3. HEADER & CURVED ARCHED TITLES (`header_lines`):
   - Put ONLY the top centered/header title lines (e.g. `राजस्थान सरकार`, `कार्यालय उपखण्ड अधिकारी...`, `जिला - ...`, `जाति प्रमाण - पत्र`, or institutional/university headings) in `header_lines` ordered top-to-bottom.
   - Provide `box_2d: [ymin, xmin, ymax, xmax]` (`0..1000` normalized coordinates) tightly bounding each header line between any top-left emblem/hologram and top-right photo.
   - Do NOT put left-aligned serial/reference/date/Aadhaar lines (`क्रमांक:...`, `दिनांक:...`) into `header_lines`; put those in `non_table_blocks`.

4. BODY, METADATA, NUMBERED NOTES & FOOTER BLOCKS (`non_table_blocks`):
   - Provide exact `box_2d: [ymin, xmin, ymax, xmax]` (`0..1000` scale) for EVERY block so its horizontal (`xmin..xmax`) and vertical (`ymin..ymax`) placement and multi-line height are preserved 1:1.
   - Keep each left-aligned metadata line (`क्रमांक:...`, `दिनांक:...`, `आवेदक का आधार नम्बर:...`, `भामाशाह कार्ड संख्या:...`) as its own separate `paragraph` item (or `kv_pair` ONLY when two distinct columns sit left-and-right on the same horizontal row).
   - Group each multi-line prose paragraph into ONE cohesive `paragraph` item with its full multi-line `box_2d`.
   - Keep `नोट` and each numbered point (`1. ...`, `2. ...`, `3. ...`, `4. ...`, `5. ...`, `6. ...`) as separate `paragraph` items in `non_table_blocks`.
   - Keep the issuer authority line (`उपखण्ड अधिकारी,...`) and bottom-left Digital Signature block (`Signature valid`, `Digitally signed by ...`, `Date: ...`, `Reason: ...`, `Location: ...`) and bottom serial number (`17792106`, with `"color_hex": "#7f1d1d"` if red/maroon) with their true left-side `box_2d` (`xmin..xmax` on the left half of the page) so they do not collide with any bottom-right QR code.{digital_rule}

RETURN STRICT JSON ONLY matching this schema:
{{
  "header_lines": [
    {{
      "text": "...",
      "box_2d": [55, 230, 72, 610],
      "y_pct": 0.06,
      "align": "center",
      "is_bold": true,
      "font_size_pt": 11,
      "color_hex": "#111827",
      "is_curved_arch": false
    }}
  ],
  "tables": [
    {{
      "table_index": 0,
      "cells": [
        {{"cell_id": 0, "text": "..."}}
      ]
    }}
  ],
  "non_table_blocks": [
    {{
      "zone": "body",
      "kind": "paragraph",
      "box_2d": [180, 140, 195, 650],
      "y_pct": 0.18,
      "align": "left",
      "is_bold": true,
      "font_size_pt": 9.5,
      "color_hex": "#111827",
      "text": "..."
    }},
    {{
      "zone": "body",
      "kind": "kv_pair",
      "box_2d": [300, 80, 318, 900],
      "y_pct": 0.30,
      "align": "left",
      "is_bold": true,
      "font_size_pt": 10,
      "left_text": "...",
      "right_text": "..."
    }}
  ]
}}"""


def _extract_json_any(raw: str) -> Any:
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", (raw or "").strip(), flags=re.IGNORECASE | re.MULTILINE).strip()
    if not cleaned:
        return None
    try:
        return fast_json_loads(cleaned)
    except Exception:
        pass
    for open_c, close_c in (("{", "}"), ("[", "]")):
        s = cleaned.find(open_c)
        e = cleaned.rfind(close_c)
        if s >= 0 and e > s:
            try:
                return fast_json_loads(cleaned[s : e + 1])
            except Exception:
                continue
    return None


def _key_digest(api_key: str) -> str:
    """Return a short non-reversible SHA-256 digest for in-memory endpoint/model caches."""
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()[:16]


def _is_in_cooldown(until_map: dict[Any, float], cache_key: Any) -> bool:
    with _CACHE_LOCK:
        return until_map.get(cache_key, 0.0) > time.monotonic()


def _set_cooldown(until_map: dict[Any, float], cache_key: Any, ttl_s: float) -> None:
    with _CACHE_LOCK:
        until_map[cache_key] = time.monotonic() + ttl_s


def _record_transient_failure(ep_label: str, key_id: str, threshold: int = 2, cooldown_s: float = 120.0) -> bool:
    """Increment transient failure streak; trip endpoint cooldown when consecutive threshold reached."""
    pair = (ep_label, key_id)
    with _CACHE_LOCK:
        fails = _ENDPOINT_TRANSIENT_FAILS.get(pair, 0) + 1
        _ENDPOINT_TRANSIENT_FAILS[pair] = fails
        if fails >= threshold:
            _ENDPOINT_BLOCKED_UNTIL[pair] = time.monotonic() + cooldown_s
            return True
    return False


def _reset_transient_failure(ep_label: str, key_id: str) -> None:
    pair = (ep_label, key_id)
    with _CACHE_LOCK:
        _ENDPOINT_TRANSIENT_FAILS.pop(pair, None)


def is_provider_blocked(provider: str, api_key: str) -> bool:
    """Return True if all candidate endpoints for `(provider, api_key)` are currently cooled down."""
    if not provider or not api_key:
        return True
    key_id = _key_digest(api_key)
    prov = provider.strip().lower()
    if prov == "gemini":
        sa = load_vertex_service_account() if (api_key == _VERTEX_SA_SENTINEL or is_server_key(api_key)) else None
        checks: list[tuple[str, str]] = []
        if sa is not None:
            checks.append(("VertexSA", f"sa:{sa['cred_id']}"))
        if api_key != _VERTEX_SA_SENTINEL:
            eps = ("AIStudio", "VertexExpress") if api_key.startswith("AQ.") else ("AIStudio",)
            for ep in eps:
                checks.append((ep, key_id))
        return bool(checks) and all(_is_in_cooldown(_ENDPOINT_BLOCKED_UNTIL, pair) for pair in checks)
    return _is_in_cooldown(_ENDPOINT_BLOCKED_UNTIL, (prov, key_id))


def _get_cached_response(cache_key: str) -> tuple[bool, Any]:
    now = time.monotonic()
    with _CACHE_LOCK:
        entry = _RESPONSE_CACHE.get(cache_key)
        if not entry:
            return False, None
        exp, val = entry
        if exp <= now:
            _RESPONSE_CACHE.pop(cache_key, None)
            return False, None
        _RESPONSE_CACHE.move_to_end(cache_key)
        return True, val


def _set_cached_response(cache_key: str, value: Any) -> None:
    if value is None:
        return
    with _CACHE_LOCK:
        _RESPONSE_CACHE[cache_key] = (time.monotonic() + _RESPONSE_CACHE_TTL_S, value)
        _RESPONSE_CACHE.move_to_end(cache_key)
        while len(_RESPONSE_CACHE) > _RESPONSE_CACHE_MAX:
            _RESPONSE_CACHE.popitem(last=False)


def assess_page_ai_need(
    words: list[Any],
    tables: Optional[list[Any]] = None,
    img_bgr: Optional[np.ndarray] = None,
    angle_deg: float = 0.0,
    mode: str = "docx",
    page_idx: int = 0,
    img_deskewed_bgr: Optional[np.ndarray] = None,
    assets: Optional[list[Any]] = None,
    is_digital_page: bool = False,
    embedded_ocr_uncertain: bool = False,
    digital_side_layout_risk: bool = False,
    digital_layout_fallback: bool = False,
) -> dict[str, Any]:
    """
    3-Stage Smart AI Decision Gate.
    Determines from objective local OCR/CV signals whether a page benefits from
    external Vision AI (`should_call`), avoiding unnecessary API latency on crisp pages.
    Supports both scanned pages and complex image/layout-heavy born-digital pages.
    Thresholds: `score >= 45` for docx/pptx/pdf-layers, `table_score >= 40` for xlsx.
    """
    del page_idx
    if img_bgr is None and img_deskewed_bgr is not None:
        img_bgr = img_deskewed_bgr
    tbl_list = list(tables or [])
    w_list = list(words or [])
    n_words = len(w_list)

    reasons: list[str] = []
    score = 0
    table_score = 0
    low_conf_ratio = 0.0
    ink_ratio = 0.0

    # Fast image diagnostics on downscaled buffer (max ~480px)
    if img_bgr is not None and img_bgr.size > 0:
        h, w = img_bgr.shape[:2]
        scale = min(1.0, 480.0 / float(max(h, w)))
        small = (
            cv2.resize(img_bgr, (max(32, int(w * scale)), max(32, int(h * scale))), interpolation=cv2.INTER_AREA)
            if scale < 0.99
            else img_bgr
        )
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY) if len(small.shape) == 3 else small
        ink_ratio = float(np.mean(gray < 195))
        lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        if n_words >= 4 and lap_var < 45.0:
            score += 20
            table_score += 15
            reasons.append("blurry_scan")
        elif n_words <= 3 and not tbl_list:
            if ink_ratio >= 0.012:
                score += 50
                table_score += 45
                reasons.append("sparse_ocr_on_ink")
            else:
                return {
                    "score": 0,
                    "table_score": 0,
                    "should_call": False,
                    "reasons": ["blank_page"],
                    "blank": True,
                    "word_count": n_words,
                    "low_conf_ratio": 0.0,
                }
    elif n_words == 0 and not tbl_list:
        return {
            "score": 0,
            "table_score": 0,
            "should_call": False,
            "reasons": ["blank_page"],
            "blank": True,
            "word_count": 0,
            "low_conf_ratio": 0.0,
        }

    # Word confidence & script artifact inspection
    if n_words > 0:
        confs: list[float] = []
        word_txts: list[str] = []
        garbage_cnt = 0
        top_band_words: list[tuple[float, float, float]] = []
        page_h_est = 1.0
        for item in w_list:
            if isinstance(item, dict):
                txt = str(item.get("text", "") or "")
                conf = float(item.get("conf", 1.0))
                y1 = float(item.get("y1", 0.0))
                cy = (float(item.get("y0", 0.0)) + y1) * 0.5
                cx = (float(item.get("x0", 0.0)) + float(item.get("x1", 0.0))) * 0.5
                wh = max(1.0, y1 - float(item.get("y0", 0.0)))
            else:
                txt = str(getattr(item, "text", "") or "")
                conf = float(getattr(item, "conf", 1.0))
                y1 = float(getattr(item, "y1", 0.0))
                cy = (float(getattr(item, "y0", 0.0)) + y1) * 0.5
                cx = (float(getattr(item, "x0", 0.0)) + float(getattr(item, "x1", 0.0))) * 0.5
                wh = max(1.0, y1 - float(getattr(item, "y0", 0.0)))
            confs.append(conf)
            word_txts.append(txt.strip())
            page_h_est = max(page_h_est, y1)
            if "\ufffd" in txt or txt.strip() in {"|", "~", "||"}:
                garbage_cnt += 1
            top_band_words.append((cx, cy, wh))

        low_conf_ratio = sum(1 for c in confs if c < 0.72) / float(n_words)
        if low_conf_ratio > 0.35:
            score += 50
            table_score += 42
            reasons.append("severe_low_ocr_confidence")
        elif low_conf_ratio > 0.22:
            score += 35
            table_score += 30
            reasons.append("low_ocr_confidence")
        elif low_conf_ratio > 0.12:
            score += 18
            table_score += 15
            reasons.append("moderate_low_confidence")

        # Detect mojibake (non-Latin script misread as gibberish ASCII), skipping crisp label+digit tokens (`Word0`, `Form16`)
        try:
            from ocr_engine import is_clean_ascii_token as _is_clean_ascii
            ascii_alpha = [
                (t, c)
                for t, c in zip(word_txts, confs)
                if len(t) >= 3
                and re.search(r"[A-Za-z]", t)
                and not re.search(r"[\u0900-\u097F]", t)
                and not re.fullmatch(r"[A-Za-z]{2,14}\d{1,4}", t)
            ]
            uncertain_cnt = sum(1 for _, c in ascii_alpha if c < 0.88)
            if len(ascii_alpha) >= 8 and (low_conf_ratio >= 0.08 or uncertain_cnt >= 3):
                plausibility = sum(1 for t, _ in ascii_alpha if _is_clean_ascii(t)) / float(len(ascii_alpha))
                if plausibility < 0.68:
                    score += 45
                    table_score += 40
                    reasons.append("ocr_mojibake_suspected")

            dev_cnt = sum(1 for t in word_txts if re.search(r"[\u0900-\u097F]", t))
            cmap_corrupt_cnt = sum(1 for t in word_txts if re.search(r"[\u0130-\u02ff\ufffd]", t))
            if cmap_corrupt_cnt >= 4:
                score += 50
                table_score += 45
                reasons.append("corrupted_cmap_unicode")
            if dev_cnt >= 5 and (low_conf_ratio > 0.14 or uncertain_cnt >= 2 or garbage_cnt >= 1):
                score += 35
                table_score += 25
                reasons.append("mixed_script_ocr_noise")
        except Exception:
            pass

        if garbage_cnt / float(n_words) > 0.08:
            score += 25
            table_score += 20
            reasons.append("broken_glyph_artifacts")

        # Curved header arch heuristic in top 25% of page
        top_slice = [(cx, cy, wh) for cx, cy, wh in top_band_words if cy <= page_h_est * 0.25]
        if len(top_slice) >= 5:
            top_slice.sort(key=lambda t: t[0])
            ys = [t[1] for t in top_slice]
            med_h = sorted(t[2] for t in top_slice)[len(top_slice) // 2]
            if (max(ys) - min(ys)) > max(12.0, med_h * 2.4):
                # Check non-monotonic up-then-down or arched contour along x
                mid_y = ys[len(ys) // 2]
                edge_avg_y = (ys[0] + ys[-1]) * 0.5
                if edge_avg_y - mid_y > max(8.0, med_h * 0.9):
                    score += 20
                    reasons.append("curved_header_arch")

    if abs(float(angle_deg)) > 1.8:
        score += 15
        table_score += 12
        reasons.append("skewed_scan")

    # Table inspection (blank cells, noisy cell OCR tokens, or complex grid needing verification)
    try:
        from ocr_engine import is_clean_ascii_token as _is_clean_ascii
    except Exception:
        def _is_clean_ascii(_tok: str) -> bool:  # type: ignore[misc]
            return True
    total_cells = 0
    empty_cells = 0
    noisy_cells = 0
    for tbl in tbl_list:
        cells = getattr(tbl, "cells", None) or (tbl.get("cells") if isinstance(tbl, dict) else None) or []
        for c in cells:
            total_cells += 1
            ctxt = str(getattr(c, "text", None) if not isinstance(c, dict) else c.get("text", "") or "").strip()
            if not ctxt:
                empty_cells += 1
                continue
            cell_bad = False
            for tok in ctxt.split():
                if len(tok) >= 4 and re.search(r"[A-Za-z]", tok):
                    if not _is_clean_ascii(tok) or re.search(r"[A-Za-z][:;|!][A-Za-z]?$", tok):
                        cell_bad = True
                        break
            if cell_bad:
                noisy_cells += 1
    if total_cells >= 4:
        empty_ratio = empty_cells / float(total_cells)
        if empty_ratio > 0.25:
            score += 30
            table_score += 40
            reasons.append("sparse_table_cells")
        if noisy_cells >= 3 or (total_cells >= 8 and noisy_cells / float(max(1, total_cells - empty_cells)) >= 0.08):
            score += 45
            table_score += 48
            reasons.append("table_cell_ocr_noise")
    elif mode == "xlsx" and total_cells == 0 and n_words >= 12:
        table_score += 45
        reasons.append("borderless_table_need")

    asset_list = list(assets or [])
    if is_digital_page:
        if embedded_ocr_uncertain:
            score += 48
            table_score += 45
            reasons.append("digital_embedded_image_ocr")
        if len(asset_list) >= 3 or (len(asset_list) >= 2 and digital_side_layout_risk):
            score += 46
            reasons.append("digital_asset_layout_alignment")
        if digital_layout_fallback and (
            len(asset_list) >= 1
            or digital_side_layout_risk
            or len(tbl_list) >= 3
            or (len(tbl_list) >= 1 and n_words <= 320)
        ):
            score += 45
            table_score += 42
            reasons.append("digital_layout_positioning_assist")

    eff_mode = (mode or "docx").strip().lower()
    threshold = 40 if eff_mode == "xlsx" else 45
    eff_score = table_score if eff_mode == "xlsx" else score
    return {
        "score": int(score),
        "table_score": int(table_score),
        "should_call": bool(eff_score >= threshold),
        "reasons": reasons,
        "blank": False,
        "word_count": n_words,
        "low_conf_ratio": round(low_conf_ratio, 3),
    }


def _discover_aistudio_models(api_key: str, key_id: str) -> tuple[Optional[set[str]], bool]:
    """
    Query AI Studio `/v1beta/models` (cached 15m per key digest, zero token cost)
    to determine which `generateContent` models this key supports.
    Returns `(model_names_set_or_None, auth_blocked)`.
    """
    now = time.monotonic()
    with _CACHE_LOCK:
        cached = _DISCOVERED_MODELS_CACHE.get(key_id)
        if cached and cached[0] > now:
            return cached[1], False
        if _DISCOVER_FAIL_UNTIL.get(key_id, 0.0) > now:
            return None, False

    try:
        resp = _http_get(
            "https://generativelanguage.googleapis.com/v1beta/models",
            headers={"x-goog-api-key": api_key},
            timeout=(3.0, 4.5),
        )
        if resp.status_code in (401, 403):
            logger.warning(f"[AIVision] Gemini AIStudio/models auth error ({resp.status_code})")
            return None, True
        if resp.ok:
            data = resp.json()
            names: set[str] = set()
            for item in data.get("models", []):
                if not isinstance(item, dict):
                    continue
                methods = item.get("supportedGenerationMethods") or []
                if "generateContent" not in methods:
                    continue
                raw_name = str(item.get("name") or "")
                clean_name = raw_name[7:] if raw_name.startswith("models/") else raw_name
                if clean_name:
                    names.add(clean_name)
            if names:
                with _CACHE_LOCK:
                    _DISCOVERED_MODELS_CACHE[key_id] = (now + 900.0, names)
                return names, False
        with _CACHE_LOCK:
            _DISCOVER_FAIL_UNTIL[key_id] = now + 90.0
    except Exception as exc:
        with _CACHE_LOCK:
            _DISCOVER_FAIL_UNTIL[key_id] = now + 90.0
        logger.debug(f"[AIVision] Model discovery fallback ({type(exc).__name__})")
    return None, False


def _candidate_gemini_specs(
    ep_label: str, api_key: str, key_id: str
) -> tuple[list[tuple[str, Optional[dict[str, Any]]]], bool]:
    """Build ordered `(model_id, thinking_cfg)` candidates skipping models in cooldown."""
    if ep_label == "AIStudio":
        discovered, auth_blocked = _discover_aistudio_models(api_key, key_id)
        if auth_blocked:
            return [], True

        if discovered:
            specs: list[tuple[str, Optional[dict[str, Any]]]] = [
                (m, tc) for m, tc in _GEMINI_MODEL_SPECS if m in discovered
            ]
            for extra in sorted(discovered, reverse=True):
                if extra in _GEMINI_SPEC_MAP or not extra.startswith("gemini-") or "flash" not in extra:
                    continue
                if any(tok in extra for tok in (*_GEMINI_DISCOVERY_EXCLUDED, "2.5-flash-lite")):
                    continue
                specs.append((extra, None))
            if not specs:
                specs = list(_GEMINI_MODEL_SPECS)
        else:
            specs = list(_GEMINI_MODEL_SPECS)
    else:
        seen: set[str] = set()
        specs = []
        for m, tc in (*_GEMINI_VERTEX_SPECS, *_GEMINI_MODEL_SPECS):
            if m not in seen:
                seen.add(m)
                specs.append((m, tc))

    active = [
        (m, tc)
        for m, tc in specs
        if not _is_in_cooldown(_MODEL_COOLDOWN_UNTIL, (ep_label, key_id, m))
    ]
    return active, False


def _extract_gemini_candidate_text(data: dict[str, Any]) -> str:
    """Safely join non-thought text parts from Gemini's top candidate."""
    candidates = data.get("candidates")
    if not isinstance(candidates, list) or not candidates or not isinstance(candidates[0], dict):
        return ""
    content = candidates[0].get("content")
    parts = content.get("parts") if isinstance(content, dict) else None
    if not isinstance(parts, list) or not parts:
        return ""

    non_thought = [
        str(p.get("text", ""))
        for p in parts
        if isinstance(p, dict) and not p.get("thought") and p.get("text")
    ]
    if non_thought:
        return "\n".join(non_thought)
    return "\n".join(str(p.get("text", "")) for p in parts if isinstance(p, dict) and p.get("text"))


def _build_gemini_payload(
    parts: list[dict[str, Any]],
    json_mode: bool,
    thinking_cfg: Optional[dict[str, Any]],
) -> dict[str, Any]:
    gen_cfg: dict[str, Any] = {"temperature": 0.05, "maxOutputTokens": 8192}
    if json_mode:
        gen_cfg["response_mime_type"] = "application/json"
    if thinking_cfg is not None:
        gen_cfg["thinkingConfig"] = dict(thinking_cfg)
    return {"contents": [{"parts": parts}], "generationConfig": gen_cfg}


def _parse_b64_image_mime_and_data(b64_img: str) -> tuple[str, str]:
    """
    Preserve actual MIME type from `data:<mime>;base64,...` or sniff PNG/WebP/GIF/JPEG
    magic bytes from raw base64 instead of hardcoding `image/jpeg`.
    """
    mime = ""
    clean_b64 = (b64_img or "").strip()
    if clean_b64.startswith("data:") and "," in clean_b64:
        header, clean_b64 = clean_b64.split(",", 1)
        m = re.match(r"^data:([a-zA-Z0-9.+_-]+/[a-zA-Z0-9.+_-]+)", header)
        if m:
            cand = m.group(1).lower()
            if cand in ("image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"):
                mime = "image/jpeg" if cand == "image/jpg" else cand
    elif "," in clean_b64:
        clean_b64 = clean_b64.split(",", 1)[1]

    if not mime and clean_b64:
        try:
            head_b64 = clean_b64[:32]
            pad = "=" * ((4 - len(head_b64) % 4) % 4)
            raw_head = base64.b64decode(head_b64 + pad, validate=False)
            if raw_head.startswith(b"\x89PNG\r\n\x1a\n"):
                mime = "image/png"
            elif len(raw_head) >= 12 and raw_head[:4] == b"RIFF" and raw_head[8:12] == b"WEBP":
                mime = "image/webp"
            elif raw_head[:6] in (b"GIF87a", b"GIF89a"):
                mime = "image/gif"
            elif raw_head[:3] == b"\xff\xd8\xff":
                mime = "image/jpeg"
        except Exception:
            pass
    return (mime or "image/jpeg"), clean_b64


def _call_gemini_text(
    api_key: str,
    prompt: str,
    b64_jpg: str = "",
    json_mode: bool = True,
    timeout_s: float = 18.0,
    max_total_s: float = 28.0,
) -> str:
    parts: list[dict[str, Any]] = [{"text": prompt}]
    if b64_jpg:
        img_mime, clean_b64 = _parse_b64_image_mime_and_data(b64_jpg)
        parts.append({"inline_data": {"mime_type": img_mime, "data": clean_b64}})

    key_id = _key_digest(api_key)
    aistudio_ep = ("https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent", "AIStudio")
    vertex_ep = ("https://aiplatform.googleapis.com/v1/publishers/google/models/{m}:generateContent", "VertexExpress")
    vertex_sa_ep = ("__VERTEX_SA__", "VertexSA")

    sa_cfg = load_vertex_service_account() if (api_key == _VERTEX_SA_SENTINEL or is_server_key(api_key)) else None

    with _CACHE_LOCK:
        pref_ep = _ENDPOINT_PREF.get(key_id)
    endpoints_list: list[tuple[str, str]] = []
    if sa_cfg is not None:
        endpoints_list.append(vertex_sa_ep)
    if api_key != _VERTEX_SA_SENTINEL:
        if api_key.startswith("AQ."):
            # AQ.* keys are Google Cloud Vertex Express keys; hit VertexExpress first to skip AIStudio discovery GET + 403 roundtrip
            endpoints_list.extend((aistudio_ep, vertex_ep) if pref_ep == "AIStudio" else (vertex_ep, aistudio_ep))
        else:
            endpoints_list.append(aistudio_ep)

    deadline = time.monotonic() + max(2.0, float(max_total_s))
    priority_hdrs = get_priority_headers()
    attempts = 0
    max_attempts = 4 if sa_cfg is not None else 3

    for url_tmpl, ep_label in endpoints_list:
        if attempts >= max_attempts or time.monotonic() >= deadline - 1.0:
            break
        ep_kid = f"sa:{sa_cfg['cred_id']}" if (ep_label == "VertexSA" and sa_cfg) else key_id
        if _is_in_cooldown(_ENDPOINT_BLOCKED_UNTIL, (ep_label, ep_kid)):
            continue

        is_vertex_ep = ep_label in ("VertexSA", "VertexExpress")
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if ep_label == "VertexSA":
            if not sa_cfg:
                continue
            bearer = get_vertex_access_token(sa_cfg, timeout_s=min(6.0, max(2.0, deadline - time.monotonic())))
            if not bearer:
                _set_cooldown(_ENDPOINT_BLOCKED_UNTIL, (ep_label, ep_kid), 120.0)
                continue
            headers["Authorization"] = f"Bearer {bearer}"
            if priority_hdrs:
                headers.update(priority_hdrs)
            specs, auth_blocked = _candidate_gemini_specs(ep_label, api_key, ep_kid)
        else:
            headers["x-goog-api-key"] = api_key
            if is_vertex_ep and priority_hdrs:
                headers.update(priority_hdrs)
            specs, auth_blocked = _candidate_gemini_specs(ep_label, api_key, ep_kid)

        if auth_blocked:
            _set_cooldown(_ENDPOINT_BLOCKED_UNTIL, (ep_label, ep_kid), 3600.0)
            continue

        for model, thinking_cfg in specs:
            remaining = deadline - time.monotonic()
            if attempts >= max_attempts or remaining < 1.5:
                break
            attempts += 1
            read_budget = min(float(timeout_s), max(1.5, remaining))
            req_timeout = (min(3.5, max(1.0, remaining * 0.4)), read_budget)
            if ep_label == "VertexSA" and sa_cfg:
                api_ver = "v1beta1" if ("preview" in model or priority_hdrs) else "v1"
                url = build_vertex_generate_url(sa_cfg["project_id"], sa_cfg["location"], model, api_version=api_ver)
            else:
                url = url_tmpl.format(m=model)
            active_headers = dict(headers)
            try:
                payload = _build_gemini_payload(parts, json_mode, thinking_cfg)
                if is_vertex_ep:
                    payload["contents"] = [{"role": "user", "parts": parts}]
                resp = _http_post(url, headers=active_headers, json=payload, timeout=req_timeout)

                if (
                    is_vertex_ep
                    and "X-Vertex-AI-LLM-Shared-Request-Type" in active_headers
                    and resp.status_code in (400, 403)
                    and "priority" in (resp.text or "").lower()
                ):
                    active_headers.pop("X-Vertex-AI-LLM-Request-Type", None)
                    active_headers.pop("X-Vertex-AI-LLM-Shared-Request-Type", None)
                    rem_p = deadline - time.monotonic()
                    if rem_p >= 1.5:
                        resp = _http_post(url, headers=active_headers, json=payload, timeout=(min(3.0, max(1.0, rem_p * 0.4)), min(float(timeout_s), max(1.5, rem_p))))

                if resp.status_code == 400 and thinking_cfg is not None:
                    rem2 = deadline - time.monotonic()
                    if rem2 >= 1.5:
                        t2 = (min(3.0, max(1.0, rem2 * 0.4)), min(float(timeout_s), max(1.5, rem2)))
                        payload = _build_gemini_payload(parts, json_mode, None)
                        if is_vertex_ep:
                            payload["contents"] = [{"role": "user", "parts": parts}]
                        resp = _http_post(url, headers=active_headers, json=payload, timeout=t2)

                if resp.ok:
                    txt = _extract_gemini_candidate_text(resp.json())
                    if txt and txt.strip():
                        _reset_transient_failure(ep_label, ep_kid)
                        if ep_label != "VertexSA":
                            with _CACHE_LOCK:
                                _ENDPOINT_PREF[key_id] = ep_label
                        logger.info(f"[AIVision] Gemini ({ep_label}/{model}) succeeded")
                        return txt
                    logger.warning(f"[AIVision] Gemini {ep_label}/{model} returned empty candidate")
                    continue

                if resp.status_code in (401, 403):
                    logger.warning(f"[AIVision] Gemini {ep_label}/{model} auth error ({resp.status_code})")
                    _set_cooldown(_ENDPOINT_BLOCKED_UNTIL, (ep_label, ep_kid), 3600.0)
                    break
                if resp.status_code == 402:
                    logger.warning(f"[AIVision] Gemini {ep_label}/{model} credits depleted (402)")
                    _set_cooldown(_ENDPOINT_BLOCKED_UNTIL, (ep_label, ep_kid), 180.0)
                    break
                if resp.status_code == 404:
                    logger.warning(f"[AIVision] Gemini {ep_label}/{model} status (404)")
                    _set_cooldown(_MODEL_COOLDOWN_UNTIL, (ep_label, ep_kid, model), 3600.0)
                else:
                    logger.warning(f"[AIVision] Gemini {ep_label}/{model} status ({resp.status_code})")
                    _set_cooldown(_MODEL_COOLDOWN_UNTIL, (ep_label, ep_kid, model), 180.0)
                    if resp.status_code in (408, 429) or resp.status_code >= 500:
                        if _record_transient_failure(ep_label, ep_kid):
                            break
            except Exception as exc:
                logger.warning(f"[AIVision] Gemini {ep_label}/{model} error: {type(exc).__name__}")
                _set_cooldown(_MODEL_COOLDOWN_UNTIL, (ep_label, ep_kid, model), 180.0)
                if _record_transient_failure(ep_label, ep_kid):
                    break
    return ""


def _call_claude_text(
    api_key: str, prompt: str, b64_jpg: str = "", timeout_s: float = 11.0, max_total_s: float = 14.0
) -> str:
    key_id = _key_digest(api_key)
    if _is_in_cooldown(_ENDPOINT_BLOCKED_UNTIL, ("claude", key_id)):
        return ""
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    content: list[dict[str, Any]] = []
    if b64_jpg:
        img_mime, clean_b64 = _parse_b64_image_mime_and_data(b64_jpg)
        content.append({"type": "image", "source": {"type": "base64", "media_type": img_mime, "data": clean_b64}})
    content.append({"type": "text", "text": prompt})

    deadline = time.monotonic() + max(2.0, float(max_total_s))
    for model in _CLAUDE_MODELS:
        remaining = deadline - time.monotonic()
        if remaining < 1.2:
            break
        req_timeout = (min(3.5, max(1.0, remaining * 0.4)), min(float(timeout_s), max(1.2, remaining)))
        payload = {
            "model": model,
            "max_tokens": 4096,
            "temperature": 0.05,
            "messages": [{"role": "user", "content": content}],
        }
        try:
            resp = _http_post(
                "https://api.anthropic.com/v1/messages", headers=headers, json=payload, timeout=req_timeout
            )
            if resp.ok:
                data = resp.json()
                blocks = data.get("content", [])
                txt = "\n".join(b.get("text", "") for b in blocks if b.get("type") == "text")
                if txt.strip():
                    _reset_transient_failure("claude", key_id)
                    logger.info(f"[AIVision] Claude ({model}) succeeded")
                    return txt
            elif resp.status_code in (400, 401, 403):
                logger.warning(f"[AIVision] Claude auth/request error ({resp.status_code})")
                if resp.status_code in (401, 403):
                    _set_cooldown(_ENDPOINT_BLOCKED_UNTIL, ("claude", key_id), 3600.0)
                break
            elif resp.status_code in (408, 429) or resp.status_code >= 500:
                if _record_transient_failure("claude", key_id):
                    break
        except Exception as exc:
            logger.warning(f"[AIVision] Claude {model} error: {type(exc).__name__}")
            if _record_transient_failure("claude", key_id):
                break
    return ""


def _call_openai_text(
    api_key: str,
    prompt: str,
    b64_jpg: str = "",
    json_object_mode: bool = True,
    timeout_s: float = 11.0,
    max_total_s: float = 14.0,
) -> str:
    key_id = _key_digest(api_key)
    if _is_in_cooldown(_ENDPOINT_BLOCKED_UNTIL, ("openai", key_id)):
        return ""
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    if b64_jpg:
        img_mime, clean_b64 = _parse_b64_image_mime_and_data(b64_jpg)
        content.append({"type": "image_url", "image_url": {"url": f"data:{img_mime};base64,{clean_b64}", "detail": "high"}})

    deadline = time.monotonic() + max(2.0, float(max_total_s))
    for model in _OPENAI_MODELS:
        remaining = deadline - time.monotonic()
        if remaining < 1.2:
            break
        req_timeout = (min(3.5, max(1.0, remaining * 0.4)), min(float(timeout_s), max(1.2, remaining)))
        payload: dict[str, Any] = {
            "model": model,
            "temperature": 0.05,
            "messages": [{"role": "user", "content": content}],
        }
        if json_object_mode:
            payload["response_format"] = {"type": "json_object"}
        try:
            resp = _http_post(
                "https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=req_timeout
            )
            if resp.ok:
                data = resp.json()
                txt = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                if txt and txt.strip():
                    _reset_transient_failure("openai", key_id)
                    logger.info(f"[AIVision] OpenAI ({model}) succeeded")
                    return txt
            elif resp.status_code in (401, 403):
                logger.warning(f"[AIVision] OpenAI auth error ({resp.status_code})")
                _set_cooldown(_ENDPOINT_BLOCKED_UNTIL, ("openai", key_id), 3600.0)
                break
            elif resp.status_code in (408, 429) or resp.status_code >= 500:
                if _record_transient_failure("openai", key_id):
                    break
        except Exception as exc:
            logger.warning(f"[AIVision] OpenAI {model} error: {type(exc).__name__}")
            if _record_transient_failure("openai", key_id):
                break
    return ""


# ---------------------------------------------------------------------------
# Server-key spend protection (global daily budget + per-client daily quota)
# ---------------------------------------------------------------------------
_BUDGET_LOCK = threading.Lock()
_BUDGET_STATE: dict[str, Any] = {"day": "", "global": 0, "clients": {}}


def _env_int(name: str, default: int) -> int:
    try:
        return max(0, int(os.environ.get(name, str(default)).strip()))
    except (TypeError, ValueError):
        return default


def is_server_key(api_key: Optional[str]) -> bool:
    """True when `api_key` is one of the operator's own env keys (never a user-supplied key)."""
    k = (api_key or "").strip()
    if not k:
        return False
    if k == _VERTEX_SA_SENTINEL:
        return True
    return k in {
        os.environ.get("GEMINI_API_KEY", "").strip(),
        os.environ.get("ANTHROPIC_API_KEY", "").strip(),
        os.environ.get("OPENAI_API_KEY", "").strip(),
    }


def _budget_roll_day_locked() -> None:
    today = time.strftime("%Y-%m-%d", time.gmtime())
    if _BUDGET_STATE["day"] != today:
        _BUDGET_STATE["day"] = today
        _BUDGET_STATE["global"] = 0
        _BUDGET_STATE["clients"] = {}


def consume_server_ai_call() -> bool:
    """Global daily cap of paid upstream calls made with the server key (`AI_DAILY_CALL_LIMIT`, default 600)."""
    limit = _env_int("AI_DAILY_CALL_LIMIT", 600)
    with _BUDGET_LOCK:
        _budget_roll_day_locked()
        if _BUDGET_STATE["global"] >= limit:
            return False
        _BUDGET_STATE["global"] += 1
        return True


def consume_client_ai_quota(client_id: str) -> bool:
    """Per-client daily cap of AI-enabled requests on the server key (`AI_PER_IP_DAILY`, default 25)."""
    limit = _env_int("AI_PER_IP_DAILY", 25)
    cid = hashlib.sha256((client_id or "anon").encode("utf-8", errors="ignore")).hexdigest()[:20]
    with _BUDGET_LOCK:
        _budget_roll_day_locked()
        clients: dict[str, int] = _BUDGET_STATE["clients"]
        if len(clients) > 20000:
            clients.clear()
        used = clients.get(cid, 0)
        if used >= limit:
            return False
        clients[cid] = used + 1
        return True


def _dispatch_provider_text(
    provider: str,
    api_key: str,
    prompt: str,
    b64_jpg: str = "",
    json_object_mode: bool = True,
    max_total_s: float = 28.0,
) -> str:
    # Hard global spend guard: only applies to the operator's own key, user keys are never throttled here.
    if is_server_key(api_key) and not consume_server_ai_call():
        logger.warning("[AIVision] Daily server AI budget reached; using local engines")
        return ""
    if provider == "gemini":
        return _call_gemini_text(api_key, prompt, b64_jpg=b64_jpg, json_mode=json_object_mode, max_total_s=max_total_s)
    if provider == "claude":
        return _call_claude_text(api_key, prompt, b64_jpg=b64_jpg, max_total_s=max_total_s)
    if provider == "openai":
        return _call_openai_text(api_key, prompt, b64_jpg=b64_jpg, json_object_mode=json_object_mode, max_total_s=max_total_s)
    return ""


def request_grid_guided_refinement(
    img_deskewed_bgr: np.ndarray,
    page_w_pt: float,
    page_h_pt: float,
    skeleton: dict[str, Any],
    provider: str,
    api_key: str,
    lang_hint: str = "auto",
    max_total_s: float = 28.0,
    is_digital_page: bool = False,
) -> dict[str, Any]:
    """Send deskewed page + OpenCV layout skeleton to configured Vision LLM and return structured JSON."""
    if not provider or not api_key or is_provider_blocked(provider, api_key):
        return {}
    try:
        b64_jpg = _encode_image_b64_jpeg(img_deskewed_bgr)
        prompt = _build_grid_guided_prompt(
            page_w_pt, page_h_pt, skeleton, lang_hint=lang_hint, is_digital_page=is_digital_page
        )
        full_hash = hashlib.sha256()
        full_hash.update(f"grid|{provider}|{lang_hint}|".encode("utf-8"))
        full_hash.update(b64_jpg.encode("ascii", errors="ignore"))
        full_hash.update(prompt.encode("utf-8", errors="ignore"))
        cache_key = full_hash.hexdigest()

        hit, cached_val = _get_cached_response(cache_key)
        if hit and isinstance(cached_val, dict):
            return cached_val

        raw = _dispatch_provider_text(provider, api_key, prompt, b64_jpg=b64_jpg, json_object_mode=True, max_total_s=max_total_s)
        parsed = _extract_json_object(raw) if raw else {}
        if isinstance(parsed, dict) and parsed:
            _set_cached_response(cache_key, parsed)
            return parsed
        return {}
    except Exception as exc:
        logger.warning(f"[AIVision] Refinement aborted smoothly ({type(exc).__name__})")
    return {}


def _local_clean_ocr_text(raw: str) -> str:
    """Offline fallback cleanup for noisy OCR spacing, Unicode normalization, stray pipes, and punctuation."""
    s = unicodedata.normalize("NFC", raw or "").strip()
    if not s:
        return ""
    s = re.sub(r"[\ufeff\u200b]", "", s)
    s = re.sub(r"[ \t]{2,}", " ", s)
    s = re.sub(r"\s+([,.;:!?।،؛。、])", r"\1", s)
    s = re.sub(r"^[\|\[\]~`]+\s*", "", s)
    s = re.sub(r"\s*[\|\]~`]+$", "", s)
    # Remove stray space before Indic vowel signs / virama across major Indic blocks
    s = re.sub(
        r"([\u0900-\u0D7F])\s+([\u0901-\u0903\u093E-\u094D\u0962\u0963\u09BE-\u09CD\u0A3E-\u0A4D\u0ABE-\u0ACD\u0B3E-\u0B4D\u0BBE-\u0BCD\u0C3E-\u0C4D\u0CBE-\u0CCD\u0D3E-\u0D4D])",
        r"\1\2",
        s,
    )
    return s.strip()


def _strip_single_text_reply(raw_reply: Optional[str]) -> str:
    """Clean plain-text response from quotes or markdown fences."""
    if not raw_reply:
        return ""
    s = raw_reply.strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", s)
        s = re.sub(r"\s*```$", "", s).strip()
    if len(s) >= 2 and ((s[0] == '"' and s[-1] == '"') or (s[0] == "'" and s[-1] == "'")):
        s = s[1:-1].strip()
    return s


def _run_cached_assist_dispatch(
    cache_key: str,
    provider: str,
    api_key: str,
    prompt: str,
    *,
    b64_jpg: str = "",
    json_object_mode: bool = False,
) -> str:
    hit, val = _get_cached_response(cache_key)
    if hit and isinstance(val, str):
        return val
    out = _dispatch_provider_text(provider, api_key, prompt, b64_jpg=b64_jpg, json_object_mode=json_object_mode)
    if out:
        _set_cached_response(cache_key, out)
    return out


def run_vision_assist_task(
    task: str,
    *,
    image_b64: str = "",
    text: str = "",
    paras: Optional[list[str]] = None,
    provider: Optional[str] = None,
    user_api_key: Optional[str] = None,
    strict_local: bool = False,
    max_chars: int = 0,
    lang: str = "auto",
) -> Any:
    """
    Server-side document intelligence helper so browser JS never calls external
    endpoints directly or exposes provider details or credentials.
    """
    clean_task = (task or "").strip().lower()
    eff_prov, eff_key = resolve_vision_credentials(
        user_api_key=user_api_key, provider=provider, strict_local=strict_local
    )
    if eff_prov and eff_key and is_provider_blocked(eff_prov, eff_key):
        eff_prov, eff_key = None, None

    def _task_key(suffix: str) -> str:
        h = hashlib.sha256()
        h.update(f"assist|{clean_task}|{eff_prov}|{lang}|{max_chars}|".encode("utf-8"))
        h.update(suffix.encode("utf-8", errors="ignore"))
        return h.hexdigest()

    if clean_task == "fix_text":
        raw_txt = (text or "").strip()[:4000]
        if not raw_txt:
            return {"text": "", "changed": False}
        cleaned_local = _local_clean_ocr_text(raw_txt)
        if eff_prov and eff_key:
            prompt = (
                "Fix spelling, punctuation, and OCR recognition errors across any script or language "
                "(e.g., Latin, Devanagari, Arabic, CJK, Cyrillic, Indic, European accents) "
                "without changing the original meaning, tone, or language. Return ONLY the corrected text, nothing else.\n\n"
                f"Text:\n{raw_txt}"
            )
            out = _strip_single_text_reply(
                _run_cached_assist_dispatch(
                    _task_key(f"{raw_txt}|{image_b64[:512]}|{len(image_b64)}"),
                    eff_prov,
                    eff_key,
                    prompt,
                    b64_jpg=image_b64,
                    json_object_mode=False,
                )
            )
            if out:
                return {"text": out, "changed": out != raw_txt}
        return {"text": cleaned_local, "changed": cleaned_local != raw_txt}

    if clean_task == "translate_hi_en":
        raw_txt = (text or "").strip()[:4000]
        if not raw_txt:
            return {"text": "", "changed": False}
        has_devanagari = bool(re.search(r"[\u0900-\u097F]", raw_txt))
        target_lang = "English" if has_devanagari else "Hindi (Devanagari Unicode script)"
        if eff_prov and eff_key:
            prompt = (
                f"Translate the following document snippet naturally and concisely into {target_lang}. "
                "Preserve numbers, dates, proper nouns, and formatting. Return ONLY the translated text, nothing else.\n\n"
                f"Text:\n{raw_txt}"
            )
            out = _strip_single_text_reply(
                _run_cached_assist_dispatch(
                    _task_key(f"{target_lang}|{raw_txt}"),
                    eff_prov,
                    eff_key,
                    prompt,
                    b64_jpg="",
                    json_object_mode=False,
                )
            )
            if out:
                return {"text": out, "changed": out != raw_txt}
        return {"text": raw_txt, "changed": False}

    if clean_task == "shorten_text":
        raw_txt = (text or "").strip()[:4000]
        if not raw_txt:
            return {"text": "", "changed": False}
        target_len = int(max_chars) if max_chars and max_chars > 8 else max(12, int(len(raw_txt) * 0.72))
        if eff_prov and eff_key:
            prompt = (
                f"Shorten this document text concisely to fit within about {target_len} characters "
                "while keeping all key facts, numbers, and original language intact. "
                "Return ONLY the shortened text, nothing else.\n\n"
                f"Text:\n{raw_txt}"
            )
            out = _strip_single_text_reply(
                _run_cached_assist_dispatch(
                    _task_key(raw_txt),
                    eff_prov,
                    eff_key,
                    prompt,
                    b64_jpg="",
                    json_object_mode=False,
                )
            )
            if out:
                return {"text": out, "changed": out != raw_txt}
        compacted = _local_clean_ocr_text(raw_txt)
        if len(compacted) > target_len and " " in compacted:
            trimmed = compacted[:target_len].rsplit(" ", 1)[0].rstrip(",;:-")
            if len(trimmed) >= max(8, target_len // 2):
                return {"text": trimmed, "changed": trimmed != raw_txt}
        return {"text": compacted, "changed": compacted != raw_txt}

    if not eff_prov or not eff_key:
        return None
    if clean_task == "enhance_text":
        raw_txt = (text or "").strip()[:8000]
        if not raw_txt:
            return []
        prompt = (
            "You are a multilingual document text cleaner. Clean encoding errors, duplicate spaces, and group into logical paragraphs while preserving original language/script.\n"
            'Return ONLY a valid JSON array of strings, e.g. ["Paragraph 1.", "Paragraph 2."].\n\n'
            f"Raw text:\n{raw_txt}"
        )
        out = _run_cached_assist_dispatch(
            _task_key(raw_txt), eff_prov, eff_key, prompt, b64_jpg="", json_object_mode=False
        )
        parsed = _extract_json_any(out)
        return [str(x) for x in parsed] if isinstance(parsed, list) and parsed else raw_txt.splitlines()

    if clean_task == "polish_paragraphs":
        src = [str(p) for p in (paras or [])][:120]
        if not src:
            return []
        prompt = (
            "You are a multilingual OCR corrector. Fix obvious spelling/OCR mistakes without changing meaning, original script/language, or array length.\n"
            f"Return ONLY a JSON array of strings of exact length {len(src)}.\n\nInput:\n{json.dumps(src, ensure_ascii=False)}"
        )
        out = _run_cached_assist_dispatch(
            _task_key(json.dumps(src, ensure_ascii=False)),
            eff_prov,
            eff_key,
            prompt,
            b64_jpg="",
            json_object_mode=False,
        )
        parsed = _extract_json_any(out)
        return [str(x) for x in parsed] if isinstance(parsed, list) and len(parsed) == len(src) else src

    if not image_b64:
        return None

    img_key = hashlib.sha256(image_b64.encode("ascii", errors="ignore")).hexdigest()

    if clean_task == "text_regions":
        prompt = (
            "Perform highly accurate multilingual OCR (any world script/language in clean Unicode UTF-8) on this document image.\n"
            'Return ONLY a JSON array of objects: [{"text": "...", "box_2d": [ymin, xmin, ymax, xmax]}], normalized 0-1000.'
        )
        out = _run_cached_assist_dispatch(
            _task_key(img_key), eff_prov, eff_key, prompt, b64_jpg=image_b64, json_object_mode=False
        )
        parsed = _extract_json_any(out)
        return parsed if isinstance(parsed, list) else []

    if clean_task == "table_data":
        prompt = (
            "Extract all tabular rows and columns accurately in clean UTF-8 preserving original languages and scripts.\n"
            'Return ONLY a valid JSON array of arrays, e.g. [["Col1", "Col2"], ["Val1", "Val2"]].'
        )
        out = _run_cached_assist_dispatch(
            _task_key(img_key), eff_prov, eff_key, prompt, b64_jpg=image_b64, json_object_mode=False
        )
        parsed = _extract_json_any(out)
        return parsed if isinstance(parsed, list) else []

    if clean_task == "document_layout":
        prompt = (
            "Extract structured document layout accurately in UTF-8 preserving all visible languages and scripts.\n"
            'Return ONLY JSON with keys: "title_lines", "diary_no", "notes", "fields" '
            '([{"label": "...", "value": "...", "bold_value": true}]), "passengers", '
            '"mobile", "relation", "purpose", "reference", "signature_line", "stamp_lines", "note_label", "note_items".'
        )
        out = _run_cached_assist_dispatch(
            _task_key(img_key), eff_prov, eff_key, prompt, b64_jpg=image_b64, json_object_mode=True
        )
        parsed = _extract_json_any(out)
        return parsed if isinstance(parsed, dict) else {}

    if clean_task == "universal_layout":
        prompt = (
            "Analyze document image into pixel-accurate elements on 0-1000 scale in UTF-8 preserving original scripts.\n"
            'Return ONLY JSON: {"page_width": 800, "page_height": 1100, "elements": '
            '[{"type": "text|image|table", "text": "...", "font_size": 12, "bold": false, "italic": false, '
            '"alignment": "left|center|right|justify", "bbox": [ymin, xmin, ymax, xmax], "rows": [], "has_borders": true}]}.'
        )
        out = _run_cached_assist_dispatch(
            _task_key(img_key), eff_prov, eff_key, prompt, b64_jpg=image_b64, json_object_mode=True
        )
        parsed = _extract_json_any(out)
        return parsed if isinstance(parsed, dict) else {"page_width": 800, "page_height": 1100, "elements": []}

    return None
