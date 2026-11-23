"""
Gemini HD Passport Studio Photo Engine
--------------------------------------
Transforms ANY casual mobile photo, dimly lit selfie, or photo-of-a-printed-photo
into an ICAO / Indian Passport / Visa compliant studio HD portrait with:
  - Strict 100% facial identity preservation (zero face alteration)
  - Clean solid studio backdrop (Pure White, Sky Blue, Royal Blue, Gray, Red, or Custom Hex)
  - Optional tailored formal attire (Coat & Tie Suit, Blazer, Formal Shirt, Women's Suit/Kurti)
  - Photo-of-a-Photo restoration (strips paper edges, flash glare, moiré, scratches)
  - Fast latency via 1280px PyTurboJPEG input resize, pooled HTTPS keep-alive session,
    Vertex AI Express (`AQ.`) + Google AI Studio (`AIza`) dual routing, per-model cooldowns,
    and in-memory LRU result cache.
"""

from __future__ import annotations

import base64
import hashlib
import io
import logging
import os
import re
import threading
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any, Optional

import cv2
import numpy as np
import requests
from PIL import Image, ImageOps

from fast_codecs import fast_jpeg_encode
from vertex_auth import (
    build_vertex_generate_url,
    get_priority_headers,
    get_vertex_access_token,
    is_vertex_sa_configured,
    load_vertex_service_account,
    prefer_vertex_express,
)

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env")
except Exception:
    pass

logger = logging.getLogger("mediasuite.passport_ai")

# ── Ordered Native Image-Editing Models (Nano Banana family — fastest & sharpest first) ──
_VERTEX_IMAGE_MODELS: tuple[str, ...] = (
    "gemini-2.5-flash-image",
    "gemini-3.1-flash-image-preview",
    "gemini-2.5-flash-image-preview",
    "gemini-3-pro-image-preview",
    "gemini-2.0-flash-preview-image-generation",
)

_AISTUDIO_IMAGE_MODELS: tuple[str, ...] = (
    "gemini-2.5-flash-image",
    "gemini-3.1-flash-image-preview",
    "gemini-2.5-flash-image-preview",
    "gemini-3-pro-image-preview",
    "gemini-2.0-flash-exp-image-generation",
    "gemini-2.0-flash-preview-image-generation",
)

# ── Saved Backend Attire Prompts (never exposed raw to client) ──
ATTIRE_PRESETS: dict[str, dict[str, str]] = {
    "keep_original": {
        "label": "Keep My Clothes (HD Only)",
        "category": "original",
        "desc": "Keep original outfit; studio HD lighting & clean background only",
        "prompt": (
            "Preserve the person's exact existing clothing, neckline, collar, scarf, or dupatta naturally. "
            "Do NOT replace their clothes; only clean up harsh shadows, dust, wrinkles glare, and blend cleanly against the new backdrop."
        ),
    },
    "men_navy_suit": {
        "label": "Men's Navy Suit & Tie",
        "category": "men",
        "desc": "Tailored dark navy coat, crisp white shirt & silk tie",
        "prompt": (
            "Replace the clothing strictly from the neck/collar down with a sharply tailored dark navy blue formal suit jacket (coat), "
            "a crisp freshly pressed white collared dress shirt, and a neat classic dark burgundy-navy silk tie. "
            "Ensure natural realistic neck-to-collar fit, realistic fabric weave, and matching studio lighting on the shoulders."
        ),
    },
    "men_black_suit": {
        "label": "Men's Black Coat & Tie",
        "category": "men",
        "desc": "Classic jet-black formal suit, white shirt & tie",
        "prompt": (
            "Replace the clothing strictly from the neck/collar down with a sharply tailored jet-black formal suit jacket (coat), "
            "a crisp pure white dress shirt, and a clean classic charcoal-black silk tie. "
            "Maintain realistic proportions, natural collar transition around the neck, and authentic studio lighting."
        ),
    },
    "men_blazer_open": {
        "label": "Men's Blazer (No Tie)",
        "category": "men",
        "desc": "Smart charcoal blazer over open-collar white shirt",
        "prompt": (
            "Replace the clothing strictly from the neck/collar down with a well-fitted dark charcoal-black formal blazer "
            "worn over a crisp white open-collar button-down shirt (no tie). "
            "Natural shoulder alignment and authentic fabric lighting."
        ),
    },
    "men_white_shirt": {
        "label": "Crisp White Formal Shirt",
        "category": "men",
        "desc": "Clean white collared shirt (Govt Exam / Interview)",
        "prompt": (
            "Replace the clothing strictly from the neck/collar down with a crisp, freshly ironed pure white formal collared button-down shirt. "
            "Keep the collar neat and natural around the neck with realistic fabric folds."
        ),
    },
    "men_blue_shirt": {
        "label": "Sky Blue Formal Shirt",
        "category": "men",
        "desc": "Light blue formal shirt (High contrast on white BG)",
        "prompt": (
            "Replace the clothing strictly from the neck/collar down with a crisp, freshly ironed light sky-blue formal collared button-down shirt. "
            "Gives clean contrast against white passport backdrops with natural collar fit."
        ),
    },
    "women_navy_blazer": {
        "label": "Women's Navy Suit Blazer",
        "category": "women",
        "desc": "Tailored navy corporate blazer & crisp white top",
        "prompt": (
            "Replace the clothing strictly from the neck/collar down with a sharply tailored dark navy blue women's formal blazer "
            "over a neat crisp white formal blouse/top. Keep hair strands falling naturally over the collar/shoulders with authentic studio lighting."
        ),
    },
    "women_black_blazer": {
        "label": "Women's Black Coat & Shirt",
        "category": "women",
        "desc": "Classic black formal blazer & ivory collared shirt",
        "prompt": (
            "Replace the clothing strictly from the neck/collar down with a tailored jet-black women's formal blazer "
            "over a neat ivory-white collared formal shirt. Preserve natural hair strands over shoulders and realistic neckline fit."
        ),
    },
    "women_formal_kurti": {
        "label": "Formal Collared Kurti",
        "category": "women",
        "desc": "Decent deep-teal / navy official Indian formal wear",
        "prompt": (
            "Replace the clothing strictly from the neck/collar down with a neat, dignified solid deep-navy/teal Indian formal mandarin-collar kurti "
            "suitable for government documents, passport, and official ID cards. Preserve hair strands and natural neckline seamlessly."
        ),
    },
}

# ── Saved Background Presets ──
BACKGROUND_PRESETS: dict[str, dict[str, str]] = {
    "white": {
        "label": "Pure White",
        "hex": "#FFFFFF",
        "desc": "Indian Passport / Visa / SSC / UPSC",
        "prompt": "completely flat, pure uniform studio white (#FFFFFF) with zero gray cast, zero vignette, and zero shadows behind the head or shoulders",
    },
    "light_blue": {
        "label": "Passport Sky Blue",
        "hex": "#BAE6FD",
        "desc": "Classic Indian Studio Light Blue",
        "prompt": "completely flat, clean uniform passport studio sky blue (#BAE6FD) with zero gradient, zero texture, and zero background shadows",
    },
    "royal_blue": {
        "label": "Official Blue",
        "hex": "#2563EB",
        "desc": "Vibrant Visa / Corporate ID Blue",
        "prompt": "completely flat, uniform official studio royal blue (#2563EB) with crisp hair-edge separation and zero background shadows",
    },
    "light_gray": {
        "label": "Studio Light Gray",
        "hex": "#E5E7EB",
        "desc": "UK / Schengen / Corporate Neutral",
        "prompt": "completely flat, uniform neutral light studio gray (#E5E7EB) with zero vignette and zero shadows behind the subject",
    },
    "red": {
        "label": "Official Red",
        "hex": "#DC2626",
        "desc": "Special Visa / Organization ID",
        "prompt": "completely flat, uniform official studio crimson red (#DC2626) with clean hair-edge separation and zero background shadows",
    },
    "custom": {
        "label": "Custom Color",
        "hex": "#FFFFFF",
        "desc": "Uses your selected studio background color",
        "prompt": "",
    },
}

_VALID_ASPECT_RATIOS = {"3:4", "1:1", "3:2", "4:5", "2:3"}
_HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")

# ── Shared Connection Pool, Cooldown & Result Cache ──
_LOCK = threading.Lock()
_SESSION: Optional[requests.Session] = None
_MODEL_COOLDOWN: dict[tuple[str, str, str], float] = {}
_ENDPOINT_COOLDOWN: dict[tuple[str, str], float] = {}
_ENDPOINT_PREF: dict[str, str] = {}
_DISCOVERED_IMG_MODELS: dict[str, tuple[float, list[str]]] = {}
_RESULT_CACHE: OrderedDict[str, tuple[float, bytes, str, str, str]] = OrderedDict()
_RESULT_CACHE_MAX = 24
_RESULT_CACHE_TTL_S = 1200.0  # 20 min


def _get_session() -> requests.Session:
    global _SESSION
    with _LOCK:
        if _SESSION is None:
            from requests.adapters import HTTPAdapter

            sess = requests.Session()
            adapter = HTTPAdapter(pool_connections=6, pool_maxsize=12)
            sess.mount("https://", adapter)
            sess.mount("http://", adapter)
            _SESSION = sess
        return _SESSION


def _key_id(api_key: str) -> str:
    return hashlib.sha256(api_key.encode("utf-8", errors="ignore")).hexdigest()[:12]


def resolve_passport_ai_key(user_api_key: Optional[str] = None) -> Optional[str]:
    allow = os.environ.get("ALLOW_AI_VISION_OCR", "true").strip().lower() in ("1", "true", "yes")
    if user_api_key and user_api_key.strip():
        return user_api_key.strip()
    if not allow:
        return None
    # Support dedicated PASSPORT_GEMINI_API_KEY override or main GEMINI_API_KEY
    key = (os.environ.get("PASSPORT_GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY") or "").strip()
    return key or None


def get_passport_ai_config() -> dict[str, Any]:
    """Public capability & preset catalog for frontend UI (never exposes secrets or raw prompts)."""
    has_server_key = bool(resolve_passport_ai_key(None) or is_vertex_sa_configured())
    return {
        "available": has_server_key,
        "outfits": [
            {
                "id": k,
                "label": v["label"],
                "category": v["category"],
                "desc": v["desc"],
            }
            for k, v in ATTIRE_PRESETS.items()
        ],
        "backgrounds": [
            {
                "id": k,
                "label": v["label"],
                "hex": v["hex"],
                "desc": v["desc"],
            }
            for k, v in BACKGROUND_PRESETS.items()
            if k != "custom"
        ],
    }


def _describe_hex_color(hex_code: str) -> str:
    h = hex_code.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    if r > 240 and g > 240 and b > 240:
        return f"pure uniform white ({hex_code})"
    if abs(r - g) < 18 and abs(g - b) < 18:
        tone = "very light gray" if r > 200 else ("medium neutral gray" if r > 120 else "dark charcoal gray")
        return f"uniform studio {tone} ({hex_code})"
    if b >= r and b >= g:
        tone = "soft sky blue" if (r > 150 or g > 190) else "rich studio blue"
        return f"uniform {tone} ({hex_code})"
    if r >= g and r >= b:
        tone = "soft pastel pink/red" if g > 170 else "official studio red"
        return f"uniform {tone} ({hex_code})"
    if g >= r and g >= b:
        return f"uniform studio green ({hex_code})"
    return f"uniform solid studio color ({hex_code})"


def build_passport_studio_prompt(
    attire: str = "keep_original",
    bg_preset: str = "white",
    bg_hex: str = "#FFFFFF",
    source_mode: str = "auto",
    is_joint: bool = False,
    remove_glasses_glare: bool = False,
    custom_note: str = "",
) -> str:
    """
    Constructs the high-precision studio passport prompt saved securely on the backend.
    Prioritizes 100% facial identity fidelity, natural DSLR lighting, exact backdrop color,
    and realistic formal attire fitting.
    """
    attire_key = attire if attire in ATTIRE_PRESETS else "keep_original"
    attire_directive = ATTIRE_PRESETS[attire_key]["prompt"]

    bg_key = bg_preset if bg_preset in BACKGROUND_PRESETS else "white"
    clean_hex = bg_hex.strip().upper() if _HEX_RE.match((bg_hex or "").strip()) else "#FFFFFF"
    if bg_key == "custom":
        bg_directive = f"completely flat, {_describe_hex_color(clean_hex)} with zero shadows, zero gradient, and zero texture"
    else:
        bg_directive = BACKGROUND_PRESETS[bg_key]["prompt"]

    subject_phrase = (
        "BOTH people shown in the input photo side-by-side (joint couple/pension passport photo)"
        if is_joint
        else "the exact person shown in the input photo"
    )

    source_directive = (
        "CRITICAL PHOTO-OF-A-PHOTO RESTORATION: The input is a phone camera capture of an existing printed photo or screen. "
        "Completely eliminate physical paper borders, table/hand edges, glossy flash reflections, screen moiré dots, scanner dust, "
        "yellowing, faded ink, tilt, and blur. Reconstruct razor-sharp DSLR studio clarity, natural skin texture, and crisp hair detail."
        if source_mode == "photo_of_photo"
        else (
            "Enhance any casual mobile selfie, uneven room lighting, harsh facial shadows, low resolution, slight blur, "
            "or background clutter into crisp, high-definition DSLR photo-studio quality with natural skin texture (never waxy or plastic)."
        )
    )

    glasses_directive = (
        "If the person wears eyeglasses, keep the exact same frames but completely remove lens reflections/glare so both eyes are 100% clearly visible. "
        if remove_glasses_glare
        else "If wearing glasses, reduce distracting glare while keeping eyes clearly visible. "
    )

    # Safe sanitized optional note (no prompt override allowed)
    safe_note = re.sub(r"[^a-zA-Z0-9 ,.&()'\-]", "", (custom_note or "").strip())[:110]
    note_line = f"\n7. ADDITIONAL POLITE STUDIO DETAIL (never override identity lock): {safe_note}." if safe_note else ""

    return (
        f"Transform the uploaded image into a professional, print-ready HD studio passport photograph of {subject_phrase}.\n\n"
        f"STRICT NON-NEGOTIABLE RULES:\n"
        f"1. 100% EXACT FACIAL IDENTITY LOCK: Keep the EXACT same person(s) from the input image — identical face geometry, "
        f"eyes, eyebrows, nose, lips, ears, jawline, hairline, hair color, skin complexion, beard/mustache/bindi, age, and gender. "
        f"Do NOT change who the person is, do NOT over-smooth skin into artificial AI look, and keep a natural calm neutral passport expression looking directly at the camera.\n"
        f"2. HEAD & SHOULDER FRAMING (ICAO / INDIAN PASSPORT STANDARD): Straighten any head or body tilt so the head is perfectly upright and centered, "
        f"eyes horizontal in the upper-middle zone, both shoulders level and squarely facing the camera, chest-up framing with ~12% clean headroom above top of hair.\n"
        f"3. STUDIO LIGHTING & HD QUALITY: {source_directive} Use soft, balanced, diffused front studio lighting with zero harsh shadow cast on the face, neck, or background. {glasses_directive}\n"
        f"4. SOLID BACKGROUND REPLACEMENT: Replace the entire background cleanly with {bg_directive}. Preserve realistic fine hair strands along the edges with zero halo or cutout artifacts.\n"
        f"5. CLOTHING / ATTIRE: {attire_directive}\n"
        f"6. OUTPUT CLEANLINESS (ZERO WATERMARKS): Output ONLY the clean edge-to-edge studio portrait photograph — "
        f"ZERO visible 'AI' text, ZERO star or sparkle icon, ZERO corner logo or photographer stamp, ZERO white frame border, ZERO extra props or hands.{note_line}"
    )


def _prepare_fast_input_b64(raw_bytes: bytes, max_dim: int = 1280) -> str:
    """
    Fixes EXIF phone orientation (critical for iPhone/Android vertical photos!),
    converts to RGB, resizes to max 1280px (fast upload + full facial detail),
    and encodes with PyTurboJPEG (`fast_jpeg_encode`).
    """
    img = Image.open(io.BytesIO(raw_bytes))
    img = ImageOps.exif_transpose(img)
    if img.mode != "RGB":
        img = img.convert("RGB")

    w, h = img.size
    scale = min(1.0, max_dim / float(max(w, h, 1)))
    if scale < 0.99:
        img = img.resize(
            (max(64, int(w * scale)), max(64, int(h * scale))),
            Image.Resampling.LANCZOS,
        )

    arr_rgb = np.array(img, dtype=np.uint8)
    arr_bgr = cv2.cvtColor(arr_rgb, cv2.COLOR_RGB2BGR)
    jpg_bytes = fast_jpeg_encode(arr_bgr, quality=88)
    return base64.b64encode(jpg_bytes).decode("ascii")


def _extract_image_from_gemini_response(data: dict[str, Any]) -> Optional[tuple[bytes, str]]:
    """Extracts the generated image bytes + mime type from Gemini generateContent JSON."""
    candidates = data.get("candidates")
    if not isinstance(candidates, list):
        return None
    for cand in candidates:
        if not isinstance(cand, dict):
            continue
        content = cand.get("content")
        parts = content.get("parts") if isinstance(content, dict) else None
        if not isinstance(parts, list):
            continue
        for part in parts:
            if not isinstance(part, dict):
                continue
            inline = part.get("inlineData") or part.get("inline_data")
            if isinstance(inline, dict) and inline.get("data"):
                mime = str(inline.get("mimeType") or inline.get("mime_type") or "image/png")
                try:
                    raw = base64.b64decode(inline["data"])
                    if len(raw) > 2048:
                        return raw, mime
                except Exception:
                    continue
    return None


def _polish_studio_hd_output(raw_img_bytes: bytes, target_aspect: str = "3:4") -> bytes:
    """
    Ensures the returned studio portrait is crisp print-ready HD JPEG (95% quality,
    minimum 960px on short edge so 300/600 DPI passport prints are razor-sharp,
    and clean RGB color mode).
    """
    img = Image.open(io.BytesIO(raw_img_bytes))
    if img.mode != "RGB":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "RGBA":
            bg.paste(img, mask=img.split()[3])
            img = bg
        else:
            img = img.convert("RGB")

    w, h = img.size
    # Gently upscale if model returned smaller than 900px on short side (e.g. 768x1024 -> 1050x1400)
    min_side = min(w, h)
    if 200 <= min_side < 960:
        up = min(1.5, 960.0 / float(min_side))
        img = img.resize((int(w * up), int(h * up)), Image.Resampling.LANCZOS)

    arr_bgr = cv2.cvtColor(np.array(img, dtype=np.uint8), cv2.COLOR_RGB2BGR)
    # Very subtle unsharp crispness for studio print clarity (zero ringing)
    blur = cv2.GaussianBlur(arr_bgr, (0, 0), sigmaX=0.9)
    crisp = cv2.addWeighted(arr_bgr, 1.12, blur, -0.12, 0)
    return fast_jpeg_encode(crisp, quality=95)


def _discover_aistudio_image_models(api_key: str, kid: str) -> list[str]:
    now = time.monotonic()
    with _LOCK:
        cached = _DISCOVERED_IMG_MODELS.get(kid)
        if cached and cached[0] > now:
            return cached[1]
    try:
        resp = _get_session().get(
            "https://generativelanguage.googleapis.com/v1beta/models",
            headers={"x-goog-api-key": api_key},
            timeout=(3.0, 4.5),
        )
        if resp.ok:
            found: list[str] = []
            for item in resp.json().get("models", []):
                if not isinstance(item, dict):
                    continue
                methods = item.get("supportedGenerationMethods") or []
                if "generateContent" not in methods:
                    continue
                raw_name = str(item.get("name") or "")
                name = raw_name[7:] if raw_name.startswith("models/") else raw_name
                if name and ("image" in name.lower() or "nano-banana" in name.lower()):
                    found.append(name)
            if found:
                # Prioritize our curated fastest models first, then any newly released image models
                ordered = [m for m in _AISTUDIO_IMAGE_MODELS if m in found]
                for extra in sorted(found, reverse=True):
                    if extra not in ordered:
                        ordered.append(extra)
                with _LOCK:
                    _DISCOVERED_IMG_MODELS[kid] = (now + 900.0, ordered)
                return ordered
    except Exception:
        pass
    return list(_AISTUDIO_IMAGE_MODELS)


def generate_studio_passport_photo(
    raw_image_bytes: bytes,
    attire: str = "keep_original",
    bg_preset: str = "white",
    bg_hex: str = "#FFFFFF",
    source_mode: str = "auto",
    aspect_ratio: str = "3:4",
    is_joint: bool = False,
    remove_glasses_glare: bool = False,
    custom_note: str = "",
    user_api_key: Optional[str] = None,
    timeout_s: float = 34.0,
) -> dict[str, Any]:
    """
    Calls Gemini native image editing (`gemini-2.5-flash-image` / `gemini-3.1-flash-image-preview`)
    to generate a studio HD passport portrait.
    Returns `{"image_bytes": bytes, "model": str, "elapsed_ms": int, "cache": "HIT"|"MISS"}`.
    """
    t0 = time.perf_counter()
    user_supplied_key = bool(user_api_key and user_api_key.strip())
    api_key = resolve_passport_ai_key(user_api_key)
    sa_cfg = None if user_supplied_key else load_vertex_service_account()
    if not api_key and not sa_cfg:
        raise RuntimeError(
            "AI Passport Studio is not configured on this server (missing GEMINI_API_KEY / Vertex AI credentials). "
            "You can continue using the instant offline Passport Photo Sheet tools."
        )

    clean_ratio = aspect_ratio if aspect_ratio in _VALID_ASPECT_RATIOS else ("3:2" if is_joint else "3:4")

    # Fast in-memory LRU cache keyed by exact image SHA256 + options (instant 5ms repeat clicks!)
    img_sha = hashlib.sha256(raw_image_bytes).hexdigest()[:24]
    cache_key = (
        f"{img_sha}|{attire}|{bg_preset}|{bg_hex.upper()}|{source_mode}|"
        f"{clean_ratio}|{int(is_joint)}|{int(remove_glasses_glare)}|{custom_note[:60]}"
    )
    now = time.monotonic()
    with _LOCK:
        hit = _RESULT_CACHE.get(cache_key)
        if hit and hit[0] > now:
            _RESULT_CACHE.move_to_end(cache_key)
            return {
                "image_bytes": hit[1],
                "model": hit[2],
                "elapsed_ms": int((time.perf_counter() - t0) * 1000),
                "cache": "HIT",
                "route": hit[3],
                "traffic_type": hit[4],
            }

    b64_input = _prepare_fast_input_b64(raw_image_bytes, max_dim=1024)
    prompt = build_passport_studio_prompt(
        attire=attire,
        bg_preset=bg_preset,
        bg_hex=bg_hex,
        source_mode=source_mode,
        is_joint=is_joint,
        remove_glasses_glare=remove_glasses_glare,
        custom_note=custom_note,
    )

    kid = _key_id(api_key) if api_key else f"sa:{sa_cfg['cred_id']}"
    aistudio_ep = ("https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent", "AIStudio")
    vertex_v1beta = ("https://aiplatform.googleapis.com/v1beta1/publishers/google/models/{m}:generateContent", "VertexExpressBeta")
    vertex_v1 = ("https://aiplatform.googleapis.com/v1/publishers/google/models/{m}:generateContent", "VertexExpress")
    vertex_sa_ep = ("__VERTEX_SA__", "VertexSA")

    with _LOCK:
        pref = _ENDPOINT_PREF.get(kid)

    endpoints_list: list[tuple[str, str]] = []
    # 1. Native Google Cloud Vertex AI Service Account FIRST (uses Paid GCP / Startup Credits + Priority PayGo)
    if sa_cfg is not None:
        endpoints_list.append(vertex_sa_ep)

    # 2. API Key routes (AI Studio + Vertex Express)
    if api_key:
        if pref == "VertexExpressBeta":
            key_eps = (vertex_v1beta, vertex_v1, aistudio_ep)
        elif pref == "VertexExpress":
            key_eps = (vertex_v1, vertex_v1beta, aistudio_ep)
        elif api_key.startswith("AQ.") and prefer_vertex_express():
            key_eps = (vertex_v1beta, vertex_v1, aistudio_ep)
        elif api_key.startswith("AQ."):
            key_eps = (aistudio_ep, vertex_v1beta, vertex_v1)
        else:
            key_eps = (aistudio_ep,)
        endpoints_list.extend(key_eps)

    session = _get_session()
    priority_hdrs = get_priority_headers()
    deadline = time.monotonic() + max(15.0, float(timeout_s) + 12.0)
    last_err = "No compatible Gemini image editing model responded."

    parts = [
        {"inlineData": {"mimeType": "image/jpeg", "data": b64_input}},
        {"text": prompt},
    ]

    for url_tmpl, ep_label in endpoints_list:
        if time.monotonic() >= deadline - 2.0:
            break
        ep_kid = f"sa:{sa_cfg['cred_id']}" if (ep_label == "VertexSA" and sa_cfg) else kid
        with _LOCK:
            ep_cd = _ENDPOINT_COOLDOWN.get((ep_label, ep_kid), 0.0)
        if ep_cd > time.monotonic():
            continue

        is_vertex_ep = ep_label in ("VertexSA", "VertexExpressBeta", "VertexExpress")
        req_headers: dict[str, str] = {"Content-Type": "application/json"}
        if ep_label == "VertexSA":
            if not sa_cfg:
                continue
            bearer = get_vertex_access_token(sa_cfg, timeout_s=min(6.0, max(2.5, deadline - time.monotonic())))
            if not bearer:
                last_err = "VertexSA token exchange failed"
                with _LOCK:
                    _ENDPOINT_COOLDOWN[(ep_label, ep_kid)] = time.monotonic() + 120.0
                continue
            req_headers["Authorization"] = f"Bearer {bearer}"
            if priority_hdrs:
                req_headers.update(priority_hdrs)
            models = list(_VERTEX_IMAGE_MODELS)
        else:
            if not api_key:
                continue
            req_headers["x-goog-api-key"] = api_key
            if is_vertex_ep and priority_hdrs:
                req_headers.update(priority_hdrs)
            # Zero-discovery fast-path: try curated fast image models immediately (saves ~1-1.5s cold GET!)
            models = list(_AISTUDIO_IMAGE_MODELS) if ep_label == "AIStudio" else list(_VERTEX_IMAGE_MODELS)

        endpoint_blocked = False
        all_404 = True
        tried_discovery = False
        idx_m = 0
        while idx_m < len(models):
            model = models[idx_m]
            idx_m += 1
            rem = deadline - time.monotonic()
            if rem < 2.5 or endpoint_blocked:
                break
            with _LOCK:
                cd_until = _MODEL_COOLDOWN.get((ep_label, ep_kid, model), 0.0)
            if cd_until > time.monotonic():
                continue

            if ep_label == "VertexSA" and sa_cfg:
                api_ver = "v1beta1" if ("preview" in model or priority_hdrs) else "v1"
                url = build_vertex_generate_url(sa_cfg["project_id"], sa_cfg["location"], model, api_version=api_ver)
            else:
                url = url_tmpl.format(m=model)

            # First attempt: Fast IMAGE-only modality + exact passport aspectRatio
            payload_variants = [
                {
                    "contents": [{"role": "user", "parts": parts}],
                    "generationConfig": {
                        "temperature": 0.25,
                        "responseModalities": ["IMAGE"],
                        "imageConfig": {"aspectRatio": clean_ratio},
                    },
                },
                # Fallback variant if a model requires ["TEXT", "IMAGE"] or rejects imageConfig
                {
                    "contents": [{"role": "user", "parts": parts}],
                    "generationConfig": {
                        "temperature": 0.25,
                        "responseModalities": ["TEXT", "IMAGE"],
                    },
                },
            ]

            active_headers = dict(req_headers)
            for v_idx, payload in enumerate(payload_variants):
                rem2 = deadline - time.monotonic()
                if rem2 < 2.0:
                    break
                try:
                    resp = session.post(
                        url,
                        headers=active_headers,
                        json=payload,
                        timeout=(4.0, min(float(timeout_s), rem2)),
                    )
                except requests.Timeout:
                    all_404 = False
                    last_err = f"{ep_label}/{model} timed out"
                    logger.warning(f"[PassportAI] {last_err}")
                    break
                except Exception as exc:
                    all_404 = False
                    last_err = f"{ep_label}/{model} network error: {type(exc).__name__}"
                    logger.warning(f"[PassportAI] {last_err}")
                    break

                # If Priority PayGo headers were rejected by endpoint/model, retry once cleanly with standard headers
                if (
                    is_vertex_ep
                    and "X-Vertex-AI-LLM-Shared-Request-Type" in active_headers
                    and resp.status_code in (400, 403)
                    and "priority" in (resp.text or "").lower()
                ):
                    active_headers.pop("X-Vertex-AI-LLM-Request-Type", None)
                    active_headers.pop("X-Vertex-AI-LLM-Shared-Request-Type", None)
                    try:
                        resp = session.post(
                            url,
                            headers=active_headers,
                            json=payload,
                            timeout=(4.0, min(float(timeout_s), max(2.0, deadline - time.monotonic()))),
                        )
                    except Exception:
                        pass

                if resp.ok:
                    try:
                        rdata = resp.json()
                    except Exception:
                        all_404 = False
                        last_err = f"{ep_label}/{model} invalid JSON"
                        break

                    extracted = _extract_image_from_gemini_response(rdata)
                    if extracted:
                        raw_out, _mime = extracted
                        polished = _polish_studio_hd_output(raw_out, target_aspect=clean_ratio)
                        traffic_type = str((rdata.get("usageMetadata") or {}).get("trafficType") or "")
                        with _LOCK:
                            if ep_label != "VertexSA":
                                _ENDPOINT_PREF[kid] = ep_label
                            _RESULT_CACHE[cache_key] = (
                                time.monotonic() + _RESULT_CACHE_TTL_S,
                                polished,
                                model,
                                ep_label,
                                traffic_type,
                            )
                            while len(_RESULT_CACHE) > _RESULT_CACHE_MAX:
                                _RESULT_CACHE.popitem(last=False)
                        elapsed_ms = int((time.perf_counter() - t0) * 1000)
                        tier_note = f" [{traffic_type}]" if traffic_type else ""
                        logger.info(f"[PassportAI] Success via {ep_label}/{model}{tier_note} in {elapsed_ms}ms")
                        return {
                            "image_bytes": polished,
                            "model": model,
                            "elapsed_ms": elapsed_ms,
                            "cache": "MISS",
                            "route": ep_label,
                            "traffic_type": traffic_type,
                        }
                    # Model returned text/safety block without image
                    all_404 = False
                    block_reason = ""
                    try:
                        block_reason = str(rdata.get("candidates", [{}])[0].get("finishReason", ""))
                    except Exception:
                        pass
                    last_err = f"{ep_label}/{model} returned no image ({block_reason or 'empty'})"
                    logger.warning(f"[PassportAI] {last_err}")
                    if v_idx == 0:
                        continue
                    break

                # Error handling: 400 -> retry simpler payload variant; 401/403 -> endpoint/model cooldown
                status = resp.status_code
                err_snippet = (resp.text or "")[:200]
                last_err = f"{ep_label}/{model} HTTP {status}"
                logger.warning(f"[PassportAI] {last_err}: {err_snippet}")

                if status != 404:
                    all_404 = False
                if status == 400 and v_idx == 0:
                    continue
                if status in (401, 403):
                    low = err_snippet.lower()
                    if any(tok in low for tok in ("has not been used", "are blocked", "api_key_invalid", "permission_denied")):
                        with _LOCK:
                            _ENDPOINT_COOLDOWN[(ep_label, ep_kid)] = time.monotonic() + 3600.0
                        endpoint_blocked = True
                    else:
                        with _LOCK:
                            _MODEL_COOLDOWN[(ep_label, ep_kid, model)] = time.monotonic() + 1800.0
                    break
                if status == 404:
                    with _LOCK:
                        _MODEL_COOLDOWN[(ep_label, ep_kid, model)] = time.monotonic() + 1800.0
                    break
                if status == 429:
                    with _LOCK:
                        _MODEL_COOLDOWN[(ep_label, ep_kid, model)] = time.monotonic() + 90.0
                    break
                break

            # Lazy model discovery ONLY if every curated AIStudio model returned 404
            if (
                idx_m >= len(models)
                and ep_label == "AIStudio"
                and all_404
                and not tried_discovery
                and not endpoint_blocked
                and api_key
                and (deadline - time.monotonic()) >= 4.0
            ):
                tried_discovery = True
                discovered = _discover_aistudio_image_models(api_key, kid)
                extras = [m for m in discovered if m not in models]
                if extras:
                    models.extend(extras)

    raise RuntimeError(f"AI Passport Studio could not process this photo right now ({last_err}). Please try again or use local tools.")
