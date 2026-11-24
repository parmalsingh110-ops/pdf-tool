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
        "label": "Keep My Clothes (Straight Passport Pose)",
        "category": "original",
        "desc": "Exact same clothes • Straight front-facing pose, DSLR lighting & clean BG",
        "prompt": (
            "KEEP THE PERSON'S EXACT SAME CLOTHING DESIGN (exact shirt, t-shirt, kurta, top, jacket, saree, or dupatta color, fabric, pattern, and neckline/collar), "
            "BUT ACTIVELY RE-POSE AND RE-DRAPE THAT EXACT OUTFIT ONTO STRAIGHT, LEVEL, FRONT-FACING PASSPORT SHOULDERS. "
            "Do NOT keep a casual sitting, sideways, 3/4-angled, leaning, slouched, or selfie-arm body pose from the input photo! "
            "Reconstruct both shoulders squarely facing the camera symmetrically with arms naturally down at sides, "
            "remove any chair/sofa backrest, raised hand/arm, bag strap, lanyard, or harsh wrinkles so the original clothes look neatly pressed and studio-lit."
        ),
    },
    "men_navy_suit": {
        "label": "Men's Navy Suit & Tie",
        "category": "men",
        "desc": "Tailored dark navy coat, crisp white shirt & silk tie",
        "prompt": (
            "Replace the clothing strictly from the neck/collar down with a sharply tailored dark navy blue formal suit jacket (coat), "
            "a crisp freshly pressed white collared dress shirt, and a neat classic dark burgundy-navy silk tie. "
            "Ensure symmetrical front-facing shoulders, natural realistic neck-to-collar fit, realistic fabric weave, and matching studio lighting."
        ),
    },
    "men_black_suit": {
        "label": "Men's Black Coat & Tie",
        "category": "men",
        "desc": "Classic jet-black formal suit, white shirt & tie",
        "prompt": (
            "Replace the clothing strictly from the neck/collar down with a sharply tailored jet-black formal suit jacket (coat), "
            "a crisp pure white dress shirt, and a clean classic charcoal-black silk tie. "
            "Maintain symmetrical front-facing shoulders, natural collar transition around the neck, and authentic studio lighting."
        ),
    },
    "men_charcoal_suit": {
        "label": "Men's Charcoal Grey Suit & Tie",
        "category": "men",
        "desc": "Modern charcoal-grey coat, white shirt & navy tie",
        "prompt": (
            "Replace the clothing strictly from the neck/collar down with a sharply tailored dark charcoal-grey formal suit jacket (coat), "
            "a crisp pure white dress shirt, and a neat deep navy silk tie. "
            "Maintain symmetrical front-facing shoulders, realistic wool texture, natural neck-to-collar fit, and studio lighting."
        ),
    },
    "men_blazer_open": {
        "label": "Men's Blazer (No Tie)",
        "category": "men",
        "desc": "Smart charcoal blazer over open-collar white shirt",
        "prompt": (
            "Replace the clothing strictly from the neck/collar down with a well-fitted dark charcoal-black formal blazer "
            "worn over a crisp white open-collar button-down shirt (no tie). "
            "Natural symmetrical front-facing shoulder alignment and authentic fabric lighting."
        ),
    },
    "men_white_shirt": {
        "label": "Crisp White Formal Shirt",
        "category": "men",
        "desc": "Clean white collared shirt (Govt Exam / Interview)",
        "prompt": (
            "Replace the clothing strictly from the neck/collar down with a crisp, freshly ironed pure white formal collared button-down shirt. "
            "Keep both shoulders level and front-facing, with neat natural collar fit and realistic cotton texture."
        ),
    },
    "men_blue_shirt": {
        "label": "Sky Blue Formal Shirt",
        "category": "men",
        "desc": "Light blue formal shirt (High contrast on white BG)",
        "prompt": (
            "Replace the clothing strictly from the neck/collar down with a crisp, freshly ironed light sky-blue formal collared button-down shirt. "
            "Gives crisp contrast against white passport backdrops with symmetrical front-facing shoulders and natural collar fit."
        ),
    },
    "men_nehru_jacket": {
        "label": "Men's Formal Nehru Jacket",
        "category": "men",
        "desc": "Classic navy Bandhgala / Nehru jacket over white kurta-shirt",
        "prompt": (
            "Replace the clothing strictly from the neck/collar down with a sharply tailored deep navy blue Indian formal mandarin-collar Nehru jacket (waistcoat) "
            "worn over a crisp white collared kurta-shirt. Ensure symmetrical front-facing shoulders, neat neckline fit, and authentic studio lighting."
        ),
    },
    "women_navy_blazer": {
        "label": "Women's Navy Suit Blazer",
        "category": "women",
        "desc": "Tailored navy corporate blazer & crisp white top",
        "prompt": (
            "Replace the clothing strictly from the neck/collar down with a sharply tailored dark navy blue women's formal blazer "
            "over a neat crisp white formal blouse/top. Keep shoulders level and front-facing, with hair strands falling naturally over collar/shoulders."
        ),
    },
    "women_black_blazer": {
        "label": "Women's Black Coat & Shirt",
        "category": "women",
        "desc": "Classic black formal blazer & ivory collared shirt",
        "prompt": (
            "Replace the clothing strictly from the neck/collar down with a tailored jet-black women's formal blazer "
            "over a neat ivory-white collared formal shirt. Keep shoulders level and front-facing, preserving natural hair strands over shoulders."
        ),
    },
    "women_white_shirt": {
        "label": "Women's Crisp White Shirt",
        "category": "women",
        "desc": "Clean formal white collared shirt (Corporate / Exam)",
        "prompt": (
            "Replace the clothing strictly from the neck/collar down with a crisp, freshly pressed pure white women's formal collared button-down shirt. "
            "Ensure symmetrical front-facing shoulders, neat natural neckline fit, and hair strands falling naturally."
        ),
    },
    "women_formal_kurti": {
        "label": "Formal Collared Kurti",
        "category": "women",
        "desc": "Decent deep-teal / navy official Indian formal wear",
        "prompt": (
            "Replace the clothing strictly from the neck/collar down with a neat, dignified solid deep-navy/teal Indian formal mandarin-collar kurti "
            "suitable for government documents, passport, and official ID cards. Keep shoulders squared front-facing and preserve natural hair strands."
        ),
    },
    "women_saree_formal": {
        "label": "Dignified Formal Saree",
        "category": "women",
        "desc": "Clean solid deep-teal/maroon cotton-silk formal saree",
        "prompt": (
            "Replace the clothing strictly from the neck/collar down with a neat, dignified solid deep-navy or royal-teal Indian formal cotton-silk saree "
            "with matching modest blouse, neatly pleated over the left shoulder, ideal for Indian government, bank, and passport IDs. "
            "Keep shoulders squared front-facing and preserve natural hair strands cleanly."
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
_RESULT_CACHE: OrderedDict[str, tuple[float, bytes, str, str, str, str]] = OrderedDict()
_RESULT_CACHE_MAX = 32
_RESULT_CACHE_TTL_S = 1800.0  # 30 min
_INFLIGHT_EVENTS: dict[str, threading.Event] = {}
_INFLIGHT_RESULTS: dict[str, tuple[Optional[dict[str, Any]], Optional[Exception]]] = {}


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
    fix_pose: bool = True,
) -> str:
    """
    Constructs the high-precision studio passport prompt saved securely on the backend.
    Prioritizes 100% facial identity fidelity, mandatory front-facing ICAO pose correction
    (even when keeping original clothes!), natural DSLR lighting, exact backdrop color,
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
        "CRITICAL PHOTO-OF-A-PHOTO RESTORATION: Strip all paper borders, table/hand edges, glossy flash reflections, screen moiré dots, scanner dust, yellowing, faded ink, tilt, and blur. "
        "Reconstruct razor-sharp DSLR studio clarity, natural skin pores, and crisp hair detail."
        if source_mode == "photo_of_photo"
        else (
            "Upgrade any casual mobile selfie, uneven indoor lighting, harsh face shadows, low resolution, or blur "
            "into crisp DSLR photo-studio quality with natural realistic skin texture (never plastic or waxy)."
        )
    )

    glasses_directive = (
        "If wearing eyeglasses, keep the exact same frames but completely remove all lens glare/reflections so both eyes are 100% clear. "
        if remove_glasses_glare
        else "If wearing glasses, reduce glare so eyes stay clearly visible. "
    )

    if fix_pose:
        if is_joint:
            pose_directive = (
                "MANDATORY FRONT-FACING JOINT PASSPORT POSE & FRAMING (ALWAYS APPLY EVEN WHEN KEEPING ORIGINAL CLOTHES): "
                "Re-pose BOTH people side-by-side upright, facing directly straight toward the camera with both pairs of shoulders horizontally level and balanced, "
                "heads upright and centered symmetrically side-by-side, eyes strictly horizontal at ~38–42% from top edge, ~11–13% clean headroom above top of hair, "
                "and zero casual sitting tilt, raised arms, hands near faces, or chair backrests."
            )
        else:
            pose_directive = (
                "MANDATORY FRONT-FACING ICAO PASSPORT POSE & BIOMETRIC FRAMING (CRITICAL — APPLY EVEN WHEN KEEPING ORIGINAL CLOTHES): "
                "Actively re-stage the person from ANY seated, sideways, 3/4-angled, leaning, slouched, or selfie-angle posture into a textbook straight-facing studio passport portrait: "
                "(a) Rotate and square the torso so BOTH shoulders face 100% straight forward symmetrically toward the camera, horizontally level and evenly balanced left-to-right, upright spine, arms naturally resting down out of frame — remove any raised selfie-arm, hand on face/chin, folded arms, chair/sofa backrest, bag straps, lanyards, or headphones; "
                "(b) Straighten any tilted or turned head so face and eyes look directly straight into the camera lens with eyes strictly horizontal and both ears evenly visible; "
                "(c) Exact ICAO/Indian passport crop proportions: head centered horizontally at 50% width, ~11–13% clean empty backdrop above top of hair/turban, eye-line at ~38–42% from top, chin at ~66–70%, and both symmetrical shoulders filling the chest-up lower frame cleanly."
            )
    else:
        pose_directive = (
            "HEAD & SHOULDER FRAMING (ICAO PASSPORT STANDARD): Keep the subject's natural upright pose, gently level any slight camera tilt, "
            "center head horizontally at 50% width with ~12% clean headroom above hair and balanced shoulders."
        )

    # Safe sanitized optional note (no prompt override allowed)
    safe_note = re.sub(r"[^a-zA-Z0-9 ,.&()'\-]", "", (custom_note or "").strip())[:110]
    note_line = f"\n7. ADDITIONAL STUDIO DETAIL (never override identity lock or pose): {safe_note}." if safe_note else ""

    return (
        f"Transform the uploaded image into a professional, print-ready HD studio passport photograph of {subject_phrase}.\n\n"
        f"STRICT NON-NEGOTIABLE RULES:\n"
        f"1. 100% EXACT FACIAL IDENTITY LOCK: Keep the EXACT same person(s) — identical face geometry, eyes, eyebrows, nose, lips, ears, jawline, hairline, hair color/style, skin complexion, beard/mustache/bindi, age, and gender. "
        f"Natural calm neutral passport expression looking directly at the camera; never alter identity or over-smooth skin.\n"
        f"2. {pose_directive}\n"
        f"3. STUDIO LIGHTING & HD CLARITY: {source_directive} Use soft, balanced, diffused studio strobe lighting with zero harsh shadows on face, neck, or backdrop. {glasses_directive}\n"
        f"4. PURE SOLID BACKGROUND: Replace the entire background cleanly with {bg_directive}. Preserve fine hair strands cleanly with zero cutout halo.\n"
        f"5. CLOTHING / ATTIRE: {attire_directive}\n"
        f"6. ZERO WATERMARKS / CLEAN EDGE-TO-EDGE OUTPUT: Output ONLY the clean edge-to-edge passport portrait — "
        f"ZERO visible 'AI' text, ZERO star or sparkle icon, ZERO corner logo or photographer stamp, ZERO white border frame, ZERO extra props or hands.{note_line}"
    )


def _prepare_fast_input_b64(raw_bytes: bytes, max_dim: int = 896) -> str:
    """
    Fixes EXIF phone orientation (critical for iPhone/Android vertical photos!),
    converts to RGB, resizes to max 896px (40% smaller token/upload payload with
    100% facial pore/hair detail), and encodes with PyTurboJPEG (`fast_jpeg_encode`).
    Zero-recompress fast-path if client already sent a clean <=960px RGB JPEG without EXIF rotation!
    """
    img = Image.open(io.BytesIO(raw_bytes))
    try:
        exif = img.getexif()
        orientation = exif.get(274) if exif else None
    except Exception:
        orientation = None

    w, h = img.size
    if (
        raw_bytes[:3] == b"\xff\xd8\xff"
        and img.mode == "RGB"
        and orientation in (None, 1)
        and max(w, h) <= max(max_dim, 960)
        and len(raw_bytes) <= 220_000
    ):
        return base64.b64encode(raw_bytes).decode("ascii")

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
    jpg_bytes = fast_jpeg_encode(arr_bgr, quality=86)
    return base64.b64encode(jpg_bytes).decode("ascii")


def _parse_hex_to_bgr(hex_code: str) -> tuple[int, int, int]:
    clean = (hex_code or "").strip().upper()
    if not _HEX_RE.match(clean):
        return (255, 255, 255)
    r = int(clean[1:3], 16)
    g = int(clean[3:5], 16)
    b = int(clean[5:7], 16)
    return (b, g, r)


def _aspect_target_dims(target_aspect: str) -> tuple[int, int]:
    mapping = {
        "3:4": (1050, 1400),
        "1:1": (1200, 1200),
        "3:2": (1400, 933),
        "4:5": (1040, 1300),
        "2:3": (1000, 1500),
    }
    return mapping.get(target_aspect, (1050, 1400))


def _biometric_frame_and_polish(
    raw_img_bytes: bytes,
    target_aspect: str = "3:4",
    target_hex: str = "#FFFFFF",
    is_joint: bool = False,
) -> tuple[bytes, str]:
    """
    Pure OpenCV/NumPy (~8ms, 0 extra RAM) Studio Post-Processor:
      1. Flood-fills exterior connected studio background from top border (protects white shirts!).
      2. Scrubs any detached corner AI badge / sparkle / stray speck (<1.5% area in corner margins).
      3. Soft-feathers exterior studio backdrop to exact requested hex (e.g. pure #FFFFFF)
         eliminating gray rectangles on white print sheets while preserving fine hair strands.
      4. Measures silhouette headroom & horizontal head centroid to enforce ICAO biometric centering
         (~11.5% headroom above hair, head dead-center horizontally) without clipping shoulders.
      5. Outputs crisp exact-aspect-ratio print-ready HD JPEG (95% PyTurboJPEG, >=960px short edge).
    Returns `(jpeg_bytes, framing_note)`.
    """
    img = Image.open(io.BytesIO(raw_img_bytes))
    if img.mode != "RGB":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "RGBA":
            bg.paste(img, mask=img.split()[3])
            img = bg
        else:
            img = img.convert("RGB")

    arr_bgr = cv2.cvtColor(np.array(img, dtype=np.uint8), cv2.COLOR_RGB2BGR)
    h, w = arr_bgr.shape[:2]
    target_bgr = np.array(_parse_hex_to_bgr(target_hex), dtype=np.float32)
    framing_notes: list[str] = []

    try:
        if h >= 120 and w >= 120:
            # 1. Estimate studio backdrop color from top corners (avoiding head center)
            p = max(8, min(20, min(h, w) // 24))
            patches = np.concatenate(
                [
                    arr_bgr[:p, :p].reshape(-1, 3),
                    arr_bgr[:p, w - p :].reshape(-1, 3),
                    arr_bgr[h // 8 : h // 8 + p, :p].reshape(-1, 3),
                    arr_bgr[h // 8 : h // 8 + p, w - p :].reshape(-1, 3),
                ],
                axis=0,
            ).astype(np.float32)
            corner_bgr = np.median(patches, axis=0)
            corner_mad = float(np.median(np.abs(patches - corner_bgr)))

            if corner_mad <= 22.0:
                diff = np.linalg.norm(arr_bgr.astype(np.float32) - corner_bgr[None, None, :], axis=2)
                bg_cand = (diff < 22.0).astype(np.uint8)

                # Connected exterior background ONLY touching the top border (protects white shirts!)
                n_bg, bg_labels = cv2.connectedComponents(bg_cand, connectivity=4)
                top_bg_ids = set(np.unique(bg_labels[0, :]).tolist())
                top_bg_ids.discard(0)
                if top_bg_ids:
                    ext_bg = np.isin(bg_labels, list(top_bg_ids))
                    bg_ratio = float(np.mean(ext_bg))

                    if 0.08 <= bg_ratio <= 0.84:
                        fg_u8 = (~ext_bg).astype(np.uint8)
                        n_fg, fg_labels, fg_stats, fg_centroids = cv2.connectedComponentsWithStats(fg_u8, connectivity=8)

                        # Identify main person silhouette (largest foreground component)
                        main_fg_id = 0
                        main_fg_area = 0
                        for cid in range(1, n_fg):
                            area = int(fg_stats[cid, cv2.CC_STAT_AREA])
                            if area > main_fg_area:
                                main_fg_area = area
                                main_fg_id = cid

                        # 2. Corner watermark / detached sparkle scrubber
                        if main_fg_id > 0 and main_fg_area > int(0.14 * h * w):
                            max_speck = int(0.016 * h * w)
                            scrubbed = 0
                            for cid in range(1, n_fg):
                                if cid == main_fg_id:
                                    continue
                                area = int(fg_stats[cid, cv2.CC_STAT_AREA])
                                if area > max_speck:
                                    continue
                                cx, cy = float(fg_centroids[cid][0]), float(fg_centroids[cid][1])
                                in_corner_edge = (
                                    (cx < w * 0.18 or cx > w * 0.82)
                                    and (cy < h * 0.16 or cy > h * 0.84)
                                )
                                if in_corner_edge:
                                    ext_bg[fg_labels == cid] = True
                                    scrubbed += 1
                            if scrubbed:
                                framing_notes.append(f"scrub:{scrubbed}")

                        # 3. Exact target backdrop hex snap (soft 2px edge feather preserves fine hair!)
                        color_dist_to_target = float(np.linalg.norm(corner_bgr - target_bgr))
                        fill_bgr_u8 = tuple(int(round(c)) for c in (target_bgr if color_dist_to_target <= 52.0 else corner_bgr))
                        if color_dist_to_target <= 52.0:
                            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
                            inner_bg = cv2.erode(ext_bg.astype(np.uint8), kernel, iterations=1).astype(np.float32)
                            alpha = cv2.GaussianBlur(inner_bg, (5, 5), 0.9)[..., None]
                            arr_bgr = np.clip(
                                alpha * target_bgr[None, None, :] + (1.0 - alpha) * arr_bgr.astype(np.float32),
                                0,
                                255,
                            ).astype(np.uint8)
                            framing_notes.append("bg_snap")

                        # 4. ICAO Biometric Auto-Center & Headroom Alignment (single portrait)
                        # Union all substantial foreground components (>=1.6% area) so head + torso stay unified
                        # even when a pure white collar blends into a white backdrop!
                        if not is_joint and main_fg_id > 0 and main_fg_area > int(0.14 * h * w):
                            min_body_part = int(0.016 * h * w)
                            body_ids = [
                                cid
                                for cid in range(1, n_fg)
                                if int(fg_stats[cid, cv2.CC_STAT_AREA]) >= min_body_part
                            ]
                            person_mask = np.isin(fg_labels, body_ids) if body_ids else (fg_labels == main_fg_id)
                            row_counts = person_mask.sum(axis=1)
                            valid_rows = np.where(row_counts >= max(4, int(w * 0.03)))[0]
                            if len(valid_rows) >= int(h * 0.35):
                                y_top = int(valid_rows[0])
                                y_bot = int(valid_rows[-1])
                                person_h = max(1, y_bot - y_top + 1)

                                # Head horizontal centroid from top 35% of silhouette (unaffected by asymmetric collar/dupatta)
                                head_slice = person_mask[y_top : min(h, y_top + max(12, int(person_h * 0.35))), :]
                                hx_indices = np.where(head_slice)[1]
                                x_head_cx = float(np.mean(hx_indices)) if len(hx_indices) > 0 else (w * 0.5)

                                headroom_ratio = y_top / float(h)
                                dx_ratio = (w * 0.5 - x_head_cx) / float(w)
                                target_hr = 0.115

                                # Case A: Excess empty headroom (>17.5%) -> bottom-anchored zoom crop keeping shoulders flush!
                                if headroom_ratio > 0.175 and y_bot >= int(h * 0.90):
                                    # Desired crop height so new headroom ≈ 11.5% while bottom stays at h
                                    desired_h = int(round((h - y_top) / (1.0 - target_hr)))
                                    crop_h = max(int(h * 0.78), min(h, desired_h))
                                    crop_w = max(int(w * 0.78), min(w, int(round(crop_h * (w / float(h))))))
                                    y0 = max(0, h - crop_h)
                                    cx_clamped = max(crop_w // 2, min(w - crop_w // 2, int(round(x_head_cx))))
                                    x0 = max(0, min(w - crop_w, cx_clamped - crop_w // 2))
                                    arr_bgr = arr_bgr[y0 : y0 + crop_h, x0 : x0 + crop_w]
                                    h, w = arr_bgr.shape[:2]
                                    framing_notes.append("hr_zoom")
                                else:
                                    # Case B: Cramped headroom (<7.5%) or slight horizontal off-center -> gentle studio canvas recenter
                                    dy = 0
                                    if headroom_ratio < 0.075:
                                        dy = min(int(h * 0.085), int(round((target_hr - headroom_ratio) * h)))
                                    dx = 0
                                    if abs(dx_ratio) >= 0.018:
                                        max_dx = int(w * 0.075)
                                        dx = max(-max_dx, min(max_dx, int(round(dx_ratio * w))))

                                    if dy > 0 or dx != 0:
                                        # Check if body/shoulders touch the side we'd pull away from (prevents white side stripe!)
                                        bottom_band = person_mask[int(h * 0.75) :, :]
                                        touches_left = bool(bottom_band[:, : max(4, int(w * 0.04))].any())
                                        touches_right = bool(bottom_band[:, -max(4, int(w * 0.04)) :].any())
                                        safe_h_shift = not (
                                            (dx > 0 and touches_left) or (dx < 0 and touches_right)
                                        )

                                        if dy > 0:
                                            M_y = np.float32([[1.0, 0.0, 0.0], [0.0, 1.0, float(dy)]])
                                            arr_bgr = cv2.warpAffine(
                                                arr_bgr,
                                                M_y,
                                                (w, h),
                                                flags=cv2.INTER_CUBIC,
                                                borderMode=cv2.BORDER_CONSTANT,
                                                borderValue=fill_bgr_u8,
                                            )
                                            framing_notes.append(f"hr_pad({dy})")

                                        if dx != 0:
                                            if safe_h_shift:
                                                M_x = np.float32([[1.0, 0.0, float(dx)], [0.0, 1.0, 0.0]])
                                                arr_bgr = cv2.warpAffine(
                                                    arr_bgr,
                                                    M_x,
                                                    (w, h),
                                                    flags=cv2.INTER_CUBIC,
                                                    borderMode=cv2.BORDER_CONSTANT,
                                                    borderValue=fill_bgr_u8,
                                                )
                                                framing_notes.append(f"cx_shift({dx})")
                                            else:
                                                # Gentle edge-safe zoom-crop around head center so shoulders stay flush edge-to-edge!
                                                crop_w = max(int(w * 0.88), w - 2 * abs(dx))
                                                crop_h = max(int(h * 0.88), int(round(crop_w * (h / float(w)))))
                                                crop_h = min(h, crop_h)
                                                x0 = max(0, min(w - crop_w, int(round(x_head_cx - crop_w / 2.0))))
                                                y0 = max(0, h - crop_h)  # keep shoulders flush at bottom
                                                arr_bgr = arr_bgr[y0 : y0 + crop_h, x0 : x0 + crop_w]
                                                h, w = arr_bgr.shape[:2]
                                                framing_notes.append(f"cx_crop({dx})")
    except Exception as exc:
        logger.debug(f"[PassportAI] Biometric post-frame skipped safely: {type(exc).__name__}")

    # 5. Exact aspect-ratio studio fit + HD resolution (>=960px short edge, ideal 1050x1400 for 3:4)
    tgt_w, tgt_h = _aspect_target_dims(target_aspect)
    tgt_ratio = tgt_w / float(tgt_h)
    cur_ratio = w / float(max(1, h))
    if abs(cur_ratio - tgt_ratio) > 0.025:
        if cur_ratio > tgt_ratio:
            # Too wide -> center-crop horizontally
            new_w = max(64, int(round(h * tgt_ratio)))
            x0 = max(0, (w - new_w) // 2)
            arr_bgr = arr_bgr[:, x0 : x0 + new_w]
        else:
            # Too tall -> anchor bottom (keep shoulders) and trim top excess if safe, else center crop
            new_h = max(64, int(round(w / tgt_ratio)))
            y0 = max(0, (h - new_h) // 2)
            arr_bgr = arr_bgr[y0 : y0 + new_h, :]
        h, w = arr_bgr.shape[:2]

    min_side = min(w, h)
    if 200 <= min_side < min(tgt_w, tgt_h):
        pil_up = Image.fromarray(cv2.cvtColor(arr_bgr, cv2.COLOR_BGR2RGB)).resize(
            (tgt_w, tgt_h),
            Image.Resampling.LANCZOS,
        )
        arr_bgr = cv2.cvtColor(np.array(pil_up, dtype=np.uint8), cv2.COLOR_RGB2BGR)

    # Very subtle studio print unsharpness (zero ringing, zero noise boost on solid backdrop)
    blur = cv2.GaussianBlur(arr_bgr, (0, 0), sigmaX=0.85)
    crisp = cv2.addWeighted(arr_bgr, 1.10, blur, -0.10, 0)
    return fast_jpeg_encode(crisp, quality=95), ",".join(framing_notes) or "clean"


def _polish_studio_hd_output(raw_img_bytes: bytes, target_aspect: str = "3:4") -> bytes:
    """Backward-compatible helper delegating to `_biometric_frame_and_polish`."""
    jpg, _ = _biometric_frame_and_polish(raw_img_bytes, target_aspect=target_aspect, target_hex="#FFFFFF", is_joint=False)
    return jpg


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
    fix_pose: bool = True,
) -> dict[str, Any]:
    """
    Calls Gemini native image editing (`gemini-2.5-flash-image` / `gemini-3.1-flash-image-preview`)
    to generate a studio HD passport portrait, followed by ~8ms OpenCV biometric centering,
    exact studio backdrop hex enforcement, and corner watermark scrubbing.
    Returns `{"image_bytes": bytes, "model": str, "elapsed_ms": int, "cache": "HIT"|"MISS", "route": str, "traffic_type": str, "framing": str}`.
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
    bg_key = bg_preset if bg_preset in BACKGROUND_PRESETS else "white"
    resolved_hex = (
        bg_hex.strip().upper()
        if bg_key == "custom" and _HEX_RE.match((bg_hex or "").strip())
        else BACKGROUND_PRESETS[bg_key]["hex"]
    )

    # Fast in-memory LRU cache keyed by exact image SHA256 + options (instant 5ms repeat clicks!)
    img_sha = hashlib.sha256(raw_image_bytes).hexdigest()[:24]
    cache_key = (
        f"{img_sha}|{attire}|{bg_key}|{resolved_hex}|{source_mode}|"
        f"{clean_ratio}|{int(is_joint)}|{int(remove_glasses_glare)}|{int(fix_pose)}|{custom_note[:60]}"
    )
    now = time.monotonic()
    inflight_wait: Optional[threading.Event] = None
    is_leader = False
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
                "framing": hit[5],
            }
        # Coalesce concurrent duplicate clicks (prevents duplicate API cost & latency spikes)
        if not user_supplied_key:
            existing_ev = _INFLIGHT_EVENTS.get(cache_key)
            if existing_ev is not None:
                inflight_wait = existing_ev
            else:
                ev = threading.Event()
                _INFLIGHT_EVENTS[cache_key] = ev
                is_leader = True

    if inflight_wait is not None:
        inflight_wait.wait(timeout=max(10.0, float(timeout_s) + 5.0))
        with _LOCK:
            shared = _INFLIGHT_RESULTS.get(cache_key)
        if shared and shared[0] is not None:
            res_copy = dict(shared[0])
            res_copy["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
            res_copy["cache"] = "COALESCED"
            return res_copy

    try:
        b64_input = _prepare_fast_input_b64(raw_image_bytes, max_dim=896)
        prompt = build_passport_studio_prompt(
            attire=attire,
            bg_preset=bg_key,
            bg_hex=resolved_hex,
            source_mode=source_mode,
            is_joint=is_joint,
            remove_glasses_glare=remove_glasses_glare,
            custom_note=custom_note,
            fix_pose=fix_pose,
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
                            polished, framing_note = _biometric_frame_and_polish(
                                raw_out,
                                target_aspect=clean_ratio,
                                target_hex=resolved_hex,
                                is_joint=is_joint,
                            )
                            traffic_type = str((rdata.get("usageMetadata") or {}).get("trafficType") or "")
                            elapsed_ms = int((time.perf_counter() - t0) * 1000)
                            res_obj: dict[str, Any] = {
                                "image_bytes": polished,
                                "model": model,
                                "elapsed_ms": elapsed_ms,
                                "cache": "MISS",
                                "route": ep_label,
                                "traffic_type": traffic_type,
                                "framing": framing_note,
                            }
                            with _LOCK:
                                if ep_label != "VertexSA":
                                    _ENDPOINT_PREF[kid] = ep_label
                                _RESULT_CACHE[cache_key] = (
                                    time.monotonic() + _RESULT_CACHE_TTL_S,
                                    polished,
                                    model,
                                    ep_label,
                                    traffic_type,
                                    framing_note,
                                )
                                while len(_RESULT_CACHE) > _RESULT_CACHE_MAX:
                                    _RESULT_CACHE.popitem(last=False)
                                if is_leader:
                                    _INFLIGHT_RESULTS[cache_key] = (res_obj, None)
                            tier_note = f" [{traffic_type}]" if traffic_type else ""
                            logger.info(
                                f"[PassportAI] Success via {ep_label}/{model}{tier_note} ({framing_note}) in {elapsed_ms}ms"
                            )
                            return res_obj
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

        err = RuntimeError(f"AI Passport Studio could not process this photo right now ({last_err}). Please try again or use local tools.")
        if is_leader:
            with _LOCK:
                _INFLIGHT_RESULTS[cache_key] = (None, err)
        raise err
    finally:
        if is_leader:
            with _LOCK:
                ev = _INFLIGHT_EVENTS.pop(cache_key, None)
            if ev is not None:
                ev.set()
            # Clean up shared result reference after waiters wake up
            def _cleanup_shared(k: str) -> None:
                time.sleep(2.0)
                with _LOCK:
                    _INFLIGHT_RESULTS.pop(k, None)
            threading.Thread(target=_cleanup_shared, args=(cache_key,), daemon=True).start()
