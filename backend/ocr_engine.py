"""
Pro Multi-Layer Local OCR & Pixel-Locked Searchable PDF Engine
----------------------------------------------------------------
Combines:
1. PyMuPDF high-DPI composite rendering (resolves OCG layers, masks, CropBox, /Rotate)
2. OpenCV watermark & uneven-illumination cleaning (only for OCR vision; PDF visuals stay untouched)
3. RapidOCR (PaddleOCR PP-OCRv4 DBNet + SVTR ONNX) + Ink-Projection Word Splitting
4. Tesseract TSV Devanagari/Bilingual fusion (hin / hin+eng)
5. PyMuPDF render_mode=3 + ascender/descender baseline + horizontal scaling (`morph`) text injection
   with wrap_contents() CTM isolation for sub-point highlight alignment.
"""

from __future__ import annotations

import csv
import gc
import io
import logging
import math
import os
import re
import shutil
import subprocess
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import cv2
import pymupdf as fitz
import numpy as np

logger = logging.getLogger("mediasuite.ocr")

_RAPIDOCR_LOCK = threading.Lock()
_RAPIDOCR_INSTANCE = None
_RAPIDOCR_INIT_FAILED = False
_TESS_LANGS_LOCK = threading.Lock()
_TESS_LANGS_CACHE: Optional[set[str]] = None
_HOST_LOW_MEM_CACHE: Optional[bool] = None
_CV2_LOW_MEM_TUNED = False


def _tune_cv2_low_mem() -> None:
    global _CV2_LOW_MEM_TUNED
    if not _CV2_LOW_MEM_TUNED:
        _CV2_LOW_MEM_TUNED = True
        try:
            cv2.setNumThreads(1)
        except Exception:
            pass


def is_low_memory_runtime() -> bool:
    """
    Detect memory-constrained containers (e.g. Render 512MB / <=1GB instances).
    On <=1.2GB instances, heavy ONNX models and multi-thread full-page pixmaps trigger
    instant OOM kills (HTTP 502), so engines automatically switch to low-RAM sequential paths.
    """
    env_ov = os.environ.get("LOW_MEMORY_MODE", "").strip().lower()
    if env_ov in ("1", "true", "yes", "on"):
        _tune_cv2_low_mem()
        return True
    if env_ov in ("0", "false", "no", "off"):
        return False

    global _HOST_LOW_MEM_CACHE
    if _HOST_LOW_MEM_CACHE is not None:
        return _HOST_LOW_MEM_CACHE

    limit_bytes: Optional[int] = None
    for cg_path in ("/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"):
        try:
            raw = Path(cg_path).read_text(encoding="utf-8", errors="ignore").strip()
            if raw and raw.lower() != "max":
                val = int(raw)
                if 32 * 1024 * 1024 <= val < (1 << 50):
                    limit_bytes = val if limit_bytes is None else min(limit_bytes, val)
        except Exception:
            continue

    def _enable_low_mem() -> bool:
        global _HOST_LOW_MEM_CACHE
        _HOST_LOW_MEM_CACHE = True
        _tune_cv2_low_mem()
        return True

    if limit_bytes is not None:
        if limit_bytes <= 1_200_000_000:
            return _enable_low_mem()
        _HOST_LOW_MEM_CACHE = False
        return False

    # Fallback heuristic for Render containers when cgroup memory file is restricted
    is_render = os.environ.get("RENDER", "").strip().lower() in ("1", "true", "yes")
    if is_render:
        try:
            meminfo = Path("/proc/meminfo").read_text(encoding="utf-8", errors="ignore")
            m = re.search(r"MemTotal:\s+(\d+)\s+kB", meminfo)
            if m and int(m.group(1)) <= 1_200_000:
                return _enable_low_mem()
        except Exception:
            pass
        if int(os.environ.get("WEB_CONCURRENCY", "1") or "1") <= 1:
            return _enable_low_mem()

    _HOST_LOW_MEM_CACHE = False
    return False

_DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")
_LATIN_SAFE_RE = re.compile(r"[^\x20-\x7E\xA0-\xFF]")
_NON_ASCII_WORD_RE = re.compile(r"[^\x00-\x7F]")
_CJK_RE = re.compile(r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]")

_LANG_ALIASES: dict[str, str] = {
    "auto": "auto",
    "all": "auto",
    "en": "eng",
    "eng": "eng",
    "english": "eng",
    "hi": "hin",
    "hin": "hin",
    "hindi": "hin",
    "fr": "fra",
    "fra": "fra",
    "fre": "fra",
    "french": "fra",
    "de": "deu",
    "deu": "deu",
    "ger": "deu",
    "german": "deu",
    "es": "spa",
    "spa": "spa",
    "spanish": "spa",
    "pt": "por",
    "por": "por",
    "portuguese": "por",
    "it": "ita",
    "ita": "ita",
    "italian": "ita",
    "nl": "nld",
    "nld": "nld",
    "dutch": "nld",
    "pl": "pol",
    "pol": "pol",
    "ru": "rus",
    "rus": "rus",
    "russian": "rus",
    "uk": "ukr",
    "ukr": "ukr",
    "tr": "tur",
    "tur": "tur",
    "ar": "ara",
    "ara": "ara",
    "arabic": "ara",
    "ur": "urd",
    "urd": "urd",
    "urdu": "urd",
    "fa": "fas",
    "fas": "fas",
    "persian": "fas",
    "bn": "ben",
    "ben": "ben",
    "bengali": "ben",
    "ta": "tam",
    "tam": "tam",
    "tamil": "tam",
    "te": "tel",
    "tel": "tel",
    "telugu": "tel",
    "mr": "mar",
    "mar": "mar",
    "marathi": "mar",
    "gu": "guj",
    "guj": "guj",
    "gujarati": "guj",
    "pa": "pan",
    "pan": "pan",
    "punjabi": "pan",
    "kn": "kan",
    "kan": "kan",
    "kannada": "kan",
    "ml": "mal",
    "mal": "mal",
    "malayalam": "mal",
    "ne": "nep",
    "nep": "nep",
    "zh": "chi_sim",
    "zh-cn": "chi_sim",
    "chi_sim": "chi_sim",
    "zh-tw": "chi_tra",
    "chi_tra": "chi_tra",
    "ja": "jpn",
    "jpn": "jpn",
    "japanese": "jpn",
    "ko": "kor",
    "kor": "kor",
    "korean": "kor",
    "th": "tha",
    "tha": "tha",
    "thai": "tha",
    "vi": "vie",
    "vie": "vie",
    "vietnamese": "vie",
    "id": "ind",
    "ind": "ind",
}

_OSD_SCRIPT_MAP: dict[str, tuple[str, str]] = {
    "devanagari": ("hin+eng", "script/Devanagari+eng"),
    "arabic": ("ara+eng", "script/Arabic+eng"),
    "cyrillic": ("rus+eng", "script/Cyrillic+eng"),
    "bengali": ("ben+eng", "script/Bengali+eng"),
    "tamil": ("tam+eng", "script/Tamil+eng"),
    "telugu": ("tel+eng", "script/Telugu+eng"),
    "gujarati": ("guj+eng", "script/Gujarati+eng"),
    "gurmukhi": ("pan+eng", "script/Gurmukhi+eng"),
    "kannada": ("kan+eng", "script/Kannada+eng"),
    "malayalam": ("mal+eng", "script/Malayalam+eng"),
    "han": ("chi_sim+eng", "script/HanS+eng"),
    "japanese": ("jpn+eng", "script/Japanese+eng"),
    "hangul": ("kor+eng", "script/Hangul+eng"),
    "thai": ("tha+eng", "script/Thai+eng"),
    "latin": ("eng", "script/Latin"),
}


@dataclass
class OCRWord:
    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    conf: float = 0.9
    angle_deg: float = 0.0  # Clockwise tilt in image space (y-down)


def find_devanagari_font() -> Optional[Path]:
    """Locate bundled Devanagari TrueType font for invisible Hindi PDF text embedding."""
    here = Path(__file__).resolve().parent
    candidates = [
        here / "fonts" / "NotoSansDevanagari-Regular.ttf",
        here.parent / "public" / "fonts" / "NotoSansDevanagari-Regular.ttf",
        Path("/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf"),
    ]
    for c in candidates:
        if c.exists() and c.is_file():
            return c
    return None


def find_unicode_font() -> Optional[Path]:
    """Locate a broad Unicode TrueType font for global multi-script PDF text layers."""
    here = Path(__file__).resolve().parent
    candidates = [
        here / "fonts" / "NotoSans-Regular.ttf",
        Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
        Path("/Library/Fonts/Arial Unicode.ttf"),
        Path("/System/Library/Fonts/Supplemental/NISC18030.ttf"),
        Path("/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for c in candidates:
        if c.exists() and c.is_file():
            return c
    return None


def get_installed_tesseract_langs() -> set[str]:
    """Query `tesseract --list-langs` once per process and return installed pack IDs."""
    global _TESS_LANGS_CACHE
    if _TESS_LANGS_CACHE is not None:
        return _TESS_LANGS_CACHE
    with _TESS_LANGS_LOCK:
        if _TESS_LANGS_CACHE is not None:
            return _TESS_LANGS_CACHE
        tess_bin = shutil.which("tesseract")
        langs: set[str] = set()
        if tess_bin:
            try:
                proc = subprocess.run(
                    [tess_bin, "--list-langs"],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                    timeout=5,
                    check=False,
                )
                if proc.returncode == 0 and proc.stdout:
                    for raw in proc.stdout.decode("utf-8", errors="replace").splitlines():
                        item = raw.strip()
                        if item and not item.lower().startswith("list of available"):
                            langs.add(item)
            except Exception:
                pass
        _TESS_LANGS_CACHE = langs
        return _TESS_LANGS_CACHE


def resolve_ocr_lang(requested: str = "auto") -> str:
    """
    Normalize any global OCR language/script string (`auto`, `fra`, `ara+eng`, `hin+eng`, etc.)
    against actually installed Tesseract language packs so invalid packs never crash subprocesses.
    """
    raw = (requested or "auto").strip().replace(",", "+").replace(" ", "+")
    if not raw:
        return "auto"
    lowered = raw.lower()
    if lowered in ("auto", "all", "detect"):
        return "auto"

    parts = [p.strip() for p in raw.split("+") if p.strip()]
    normalized: list[str] = []
    for p in parts:
        if p.lower().startswith("script/"):
            tok = "script/" + p.split("/", 1)[1]
        else:
            tok = _LANG_ALIASES.get(p.lower(), p.lower())
        if tok == "auto":
            return "auto"
        if re.fullmatch(r"[A-Za-z0-9_/-]{2,32}", tok) and tok not in normalized:
            normalized.append(tok)

    if not normalized:
        return "auto"

    installed = get_installed_tesseract_langs()
    if installed:
        valid = [t for t in normalized if t in installed]
        if not valid:
            if "eng" in installed:
                return "eng"
            return next(iter(installed), "eng")
        return "+".join(valid[:3])
    return "+".join(normalized[:3])


def _detect_script_via_osd_with_conf(img_bgr: np.ndarray) -> tuple[Optional[str], float]:
    """Detect dominant page script and confidence via Tesseract OSD (`--psm 0 -l osd`)."""
    tess_bin = shutil.which("tesseract")
    installed = get_installed_tesseract_langs()
    if not tess_bin or (installed and "osd" not in installed):
        return None, 0.0

    work = img_bgr
    h, w = img_bgr.shape[:2]
    scale = min(1.0, 1400.0 / float(max(h, w, 1)))
    if scale < 0.99:
        work = cv2.resize(img_bgr, (max(64, int(w * scale)), max(64, int(h * scale))), interpolation=cv2.INTER_AREA)

    ok, buf = cv2.imencode(".bmp", work)
    if not ok:
        ok, buf = cv2.imencode(".png", work)
    if not ok:
        return None, 0.0
    try:
        proc = subprocess.run(
            [tess_bin, "stdin", "stdout", "--psm", "0", "-l", "osd"],
            input=buf.tobytes(),
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=6,
            check=False,
        )
        out = (proc.stdout or b"").decode("utf-8", errors="replace")
        m = re.search(r"Script:\s*([A-Za-z_]+)", out)
        if not m:
            return None, 0.0
        conf_m = re.search(r"Script confidence:\s*([0-9]+(?:\.[0-9]+)?)", out)
        osd_conf = float(conf_m.group(1)) if conf_m else 0.0
        script_key = m.group(1).strip().lower()
        pair = _OSD_SCRIPT_MAP.get(script_key)
        if not pair:
            return None, osd_conf
        primary, fallback = pair
        for candidate in (primary, fallback):
            toks = [t for t in candidate.split("+") if (not installed or t in installed)]
            if toks:
                return "+".join(toks[:2]), osd_conf
    except Exception:
        return None, 0.0
    return None, 0.0


def detect_script_via_osd(img_bgr: np.ndarray) -> Optional[str]:
    """Detect dominant page script using fast Tesseract OSD (`--psm 0 -l osd`)."""
    script, _ = _detect_script_via_osd_with_conf(img_bgr)
    return script


_VOWEL_RE = re.compile(r"[aeiouyAEIOUY]")
_PURE_CODE_OR_NUM_RE = re.compile(
    r"^(?:[+\-]?\d+(?:[.,:/\-]\d+)*(?:%|pt|px|cm|mm|kg)?|"
    r"[A-Z0-9]{2,}(?:[/\-][A-Z0-9]+)+|"
    r"https?://\S+|www\.\S+|\S+@\S+\.\S+)$"
)


def is_clean_ascii_token(tok: str) -> bool:
    """Return True if an ASCII token is a genuine English word, code/ID, URL, date, or number (not foreign-script mojibake)."""
    s = (tok or "").strip()
    if not s or _NON_ASCII_WORD_RE.search(s):
        return False
    if _PURE_CODE_OR_NUM_RE.fullmatch(s):
        return True

    core = re.sub(r"^[(\[\"'`]+|[)\]}\"',.;:!?]+$", "", s)
    if not core:
        return False
    if _PURE_CODE_OR_NUM_RE.fullmatch(core):
        return True
    if not re.search(r"[A-Za-z]", core):
        return bool(re.fullmatch(r"[\d.,:/\-+%*()]+", core))

    # Reject internal bangs/brackets/Unicode fullwidth punctuation like `DK!hIRIOL!ph` or `haDgnne/2/(`
    if any(ch in core for ch in "!()[]{}<>~`^*|\\\"'"):
        return False
    # Mixed digits and lowercase letters inside the same token (`9g`, `3ea`, `fafe:01`, `y4.21`) -> mojibake
    if re.search(r"[a-z]", core) and re.search(r"\d", core):
        return False
    # Reject bizarre mid-word uppercase jumps inside mixed-case tokens (`IbhEIlth`, `PDIPiRtl`, `HfaT`)
    if re.search(r"[a-z][A-Z]", core):
        return False
    # Reject standalone colon-attached lowercase words from Hindi serial/date labels like `fafe:01-06-2018`, `seat:`
    if ":" in core and not core.endswith(":"):
        return False

    letters_only = re.sub(r"[^A-Za-z]", "", core)
    if len(letters_only) >= 2:
        if letters_only.isupper() and len(letters_only) <= 18:
            return True
        vowels = len(_VOWEL_RE.findall(letters_only))
        # Real Latin/European words almost always have vowels when len >= 3 (except known acronyms)
        if len(letters_only) >= 3 and vowels == 0:
            return False
        if len(letters_only) >= 5 and (vowels / len(letters_only)) < 0.17:
            return False
    return bool(re.fullmatch(r"[A-Za-z]+(?:[.\-/&'][A-Za-z]+)*:?", core))


def latin_plausibility_score(words: list[OCRWord]) -> tuple[float, int]:
    """
    Estimate fraction of non-trivial Latin-alpha OCR words that resemble genuine Latin/European text
    versus forced English decoding of Devanagari/Indic/Arabic glyphs (mojibake).
    Returns `(plausible_fraction, alpha_token_count)`.
    """
    alpha_tokens = [
        (w.text or "").strip()
        for w in words
        if w.text and re.search(r"[A-Za-z]", w.text) and not _PURE_CODE_OR_NUM_RE.fullmatch(w.text.strip())
    ]
    if not alpha_tokens:
        return 1.0, 0
    ok = sum(1 for t in alpha_tokens if is_clean_ascii_token(t))
    return float(ok) / float(len(alpha_tokens)), len(alpha_tokens)


def _detect_shirorekha_score(img_bgr: np.ndarray) -> float:
    """Fast CV signal detecting Devanagari/Bengali/Gurmukhi horizontal top bars (shirorekha) above vertical stems."""
    if img_bgr is None or img_bgr.size == 0:
        return 0.0
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY) if img_bgr.ndim == 3 else img_bgr
    h, w = gray.shape[:2]
    if h < 40 or w < 40:
        return 0.0
    if max(h, w) > 1400:
        sc = 1200.0 / float(max(h, w))
        gray = cv2.resize(gray, (max(32, int(w * sc)), max(32, int(h * sc))), interpolation=cv2.INTER_AREA)
        h, w = gray.shape[:2]

    ink = (gray < 165).astype(np.uint8)
    total_ink = int(np.sum(ink))
    if total_ink < 80:
        return 0.0
    h_open = cv2.morphologyEx(ink * 255, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (14, 1)))
    ys, xs = np.where(h_open > 0)
    if len(ys) < 40:
        return 0.0

    step = max(1, len(ys) // 600)
    valid_top = 0
    sampled = 0
    for y, x in zip(ys[::step], xs[::step]):
        if y < 4 or y + 8 >= h:
            continue
        above = float(np.mean(ink[max(0, y - 4):y - 1, x]))
        below = float(np.mean(ink[y + 2:min(h, y + 9), x]))
        sampled += 1
        if above < 0.25 and below > 0.25:
            valid_top += 1
    bar_ink_ratio = float(len(ys)) / float(max(1, total_ink))
    return bar_ink_ratio * (valid_top / float(max(1, sampled)))


def get_rapidocr():
    """Thread-safe lazy singleton for RapidOCR (PaddleOCR PP-OCRv4 ONNX)."""
    global _RAPIDOCR_INSTANCE, _RAPIDOCR_INIT_FAILED
    if (
        is_low_memory_runtime()
        and os.environ.get("ALLOW_RAPIDOCR_ON_LOW_MEM", "").strip().lower() not in ("1", "true", "yes")
    ):
        # PP-OCRv4 ONNX runtime allocates ~550-650 MB per process, causing OOM 502 crashes on 512 MB containers;
        # gracefully rely on low-memory Tesseract subprocess OCR + optional AI Vision instead.
        return None
    if _RAPIDOCR_INIT_FAILED:
        return None
    if _RAPIDOCR_INSTANCE is not None:
        return _RAPIDOCR_INSTANCE
    with _RAPIDOCR_LOCK:
        if _RAPIDOCR_INSTANCE is not None:
            return _RAPIDOCR_INSTANCE
        try:
            from rapidocr_onnxruntime import RapidOCR

            _RAPIDOCR_INSTANCE = RapidOCR()
            logger.info("[ProOCR] RapidOCR (ONNX PP-OCRv4) initialized")
            return _RAPIDOCR_INSTANCE
        except Exception as e:
            _RAPIDOCR_INIT_FAILED = True
            logger.warning(f"[ProOCR] RapidOCR unavailable ({type(e).__name__}: {e})")
            return None


def clean_image_for_ocr(img_bgr: np.ndarray) -> np.ndarray:
    """
    Suppress yellow/orange/pastel diagonal watermarks (e.g. e-Mitra stamps),
    scanner shadows, and textured backgrounds while enhancing faded ink-saver
    thin strokes with gentle gamma contrast (preserving smooth glyph edges).
    Processes in 256-row strips using float32/uint8 to avoid 150MB+ peak allocations.
    """
    if img_bgr is None or img_bgr.size == 0:
        return img_bgr

    h, w = img_bgr.shape[:2]
    strip_h = 256
    lum_u8 = np.empty((h, w), dtype=np.uint8)
    f_132 = np.float32(132.0)
    f_inv24 = np.float32(1.0 / 24.0)
    f_80 = np.float32(80.0)
    f_inv40 = np.float32(1.0 / 40.0)
    f_0 = np.float32(0.0)
    f_1 = np.float32(1.0)
    f_255 = np.float32(255.0)

    for y0 in range(0, h, strip_h):
        y1 = min(h, y0 + strip_h)
        strip = img_bgr[y0:y1]
        lab_s = cv2.cvtColor(strip, cv2.COLOR_BGR2LAB)
        b_f = lab_s[:, :, 2].astype(np.float32)
        l_f = lab_s[:, :, 0].astype(np.float32)
        del lab_s
        b_f -= f_132
        b_f *= f_inv24
        np.clip(b_f, f_0, f_1, out=b_f)
        l_f -= f_80
        l_f *= f_inv40
        np.clip(l_f, f_0, f_1, out=l_f)
        b_f *= l_f
        del l_f

        gray_s = cv2.cvtColor(strip, cv2.COLOR_BGR2GRAY).astype(np.float32)
        r_s = strip[:, :, 2].astype(np.float32)
        r_s -= gray_s
        r_s *= b_f
        gray_s += r_s
        np.clip(gray_s, f_0, f_255, out=gray_s)
        lum_u8[y0:y1] = gray_s.astype(np.uint8)
        del b_f, gray_s, r_s

    # Fast downscaled illumination normalization (removes uneven scanner shading, flash glare & smooth stamps)
    scale_ds = 0.25 if max(h, w) > 900 else 0.5
    ds_w = max(32, int(w * scale_ds))
    ds_h = max(32, int(h * scale_ds))
    small = cv2.resize(lum_u8, (ds_w, ds_h), interpolation=cv2.INTER_AREA)
    k = max(11, (min(ds_w, ds_h) // 20) | 1)
    k = min(k, 31)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    bg_small = cv2.morphologyEx(small, cv2.MORPH_CLOSE, kernel)
    del small
    bg_small = cv2.GaussianBlur(bg_small, (k, k), 0)
    bg_full_u8 = cv2.resize(bg_small, (w, h), interpolation=cv2.INTER_LINEAR)
    del bg_small

    out = np.empty((h, w, 3), dtype=np.uint8)
    f_24 = np.float32(24.0)
    f_087 = np.float32(0.87)
    f_092 = np.float32(0.92)
    f_012 = np.float32(0.12)
    f_inv080 = np.float32(1.0 / 0.80)
    f_115 = np.float32(1.15)

    for y0 in range(0, h, strip_h):
        y1 = min(h, y0 + strip_h)
        strip = img_bgr[y0:y1]
        hsv_s = cv2.cvtColor(strip, cv2.COLOR_BGR2HSV)
        bg_s = np.maximum(bg_full_u8[y0:y1].astype(np.float32), f_24)
        ratio_s = lum_u8[y0:y1].astype(np.float32)
        ratio_s /= bg_s
        del bg_s
        np.clip(ratio_s, f_0, f_1, out=ratio_s)

        b_s = strip[:, :, 0].astype(np.int16)
        g_s = strip[:, :, 1].astype(np.int16)
        r_i = strip[:, :, 2].astype(np.int16)
        green_wm = (
            (hsv_s[:, :, 0] >= 35)
            & (hsv_s[:, :, 0] <= 94)
            & (hsv_s[:, :, 1] >= 60)
            & (g_s >= 68)
            & ((g_s - np.maximum(r_i, b_s)) >= 20)
        )
        del b_s, g_s, r_i
        pale_wm = (
            ((hsv_s[:, :, 1] > 20) & (hsv_s[:, :, 2] > 125) & (ratio_s > f_087))
            | ((hsv_s[:, :, 2] > 218) & (ratio_s > f_092))
            | green_wm
        )
        del hsv_s, green_wm
        ratio_s[pale_wm] = f_1
        del pale_wm
        ratio_s -= f_012
        ratio_s *= f_inv080
        np.clip(ratio_s, f_0, f_1, out=ratio_s)
        np.power(ratio_s, f_115, out=ratio_s)
        ratio_s *= f_255
        enh_s = ratio_s.astype(np.uint8)
        del ratio_s
        out[y0:y1, :, 0] = enh_s
        out[y0:y1, :, 1] = enh_s
        out[y0:y1, :, 2] = enh_s
        del enh_s

    del lum_u8, bg_full_u8
    return out


def estimate_skew_angle(img_bgr_or_gray: np.ndarray, max_angle: float = 8.0) -> float:
    """
    Estimate dominant near-horizontal document skew angle (clockwise degrees, positive = rotate CCW).
    Combines long morphological horizontal line segments and edge Hough lines so tilted phone scans
    (e.g. CamScanner marksheets) snap cleanly to horizontal/vertical axes.
    """
    if img_bgr_or_gray is None or img_bgr_or_gray.size == 0:
        return 0.0
    gray = (
        cv2.cvtColor(img_bgr_or_gray, cv2.COLOR_BGR2GRAY)
        if img_bgr_or_gray.ndim == 3
        else img_bgr_or_gray
    )
    h, w = gray.shape[:2]
    if h < 40 or w < 40:
        return 0.0

    # Downscale large images to speed up Hough line voting
    scale = min(1.0, 1200.0 / float(max(h, w)))
    if scale < 0.95:
        work = cv2.resize(gray, (max(32, int(w * scale)), max(32, int(h * scale))), interpolation=cv2.INTER_AREA)
    else:
        work = gray

    wh, ww = work.shape[:2]
    edges = cv2.Canny(cv2.GaussianBlur(work, (3, 3), 0), 45, 140)
    min_len = max(40, int(ww * 0.12))
    lines = cv2.HoughLinesP(edges, 1, math.pi / 720.0, threshold=max(40, int(ww * 0.08)), minLineLength=min_len, maxLineGap=15)
    angles: list[tuple[float, float]] = []
    if lines is not None:
        for ln in lines.reshape(-1, 4):
            x1, y1, x2, y2 = int(ln[0]), int(ln[1]), int(ln[2]), int(ln[3])
            dx = float(x2 - x1)
            dy = float(y2 - y1)
            length = math.hypot(dx, dy)
            if length < min_len:
                continue
            ang = math.degrees(math.atan2(dy, dx))
            if abs(ang) <= max_angle:
                angles.append((ang, length))
            elif abs(abs(ang) - 90.0) <= max_angle:
                # Near-vertical lines give independent skew confirmation
                v_ang = (ang - 90.0) if ang > 0 else (ang + 90.0)
                angles.append((v_ang, length * 0.9))

    if len(angles) < 2:
        return 0.0

    # Weighted median around the tightest 1.5-deg modal bin to reject outliers
    hist_bins: dict[int, list[tuple[float, float]]] = {}
    for ang, wt in angles:
        b = int(round(ang * 2.0))  # 0.5 deg bins
        hist_bins.setdefault(b, []).append((ang, wt))
    best_bin = max(hist_bins.keys(), key=lambda b: sum(wt for k in (b - 1, b, b + 1) for _, wt in hist_bins.get(k, [])))
    near = [item for k in (best_bin - 2, best_bin - 1, best_bin, best_bin + 1, best_bin + 2) for item in hist_bins.get(k, [])]
    if not near:
        return 0.0
    total_w = sum(wt for _, wt in near)
    avg_ang = sum(a * wt for a, wt in near) / max(1e-6, total_w)
    if abs(avg_ang) < 0.45 or total_w < min_len * 2.0:
        return 0.0
    return float(avg_ang)


def deskew_image_bgr(img_bgr: np.ndarray, max_angle: float = 8.0) -> tuple[np.ndarray, float]:
    """Rotate image around center with white paper border padding to level skewed scans."""
    ang = estimate_skew_angle(img_bgr, max_angle=max_angle)
    if abs(ang) < 0.45:
        return img_bgr, 0.0
    h, w = img_bgr.shape[:2]
    mat = cv2.getRotationMatrix2D((w * 0.5, h * 0.5), ang, 1.0)
    rotated = cv2.warpAffine(
        img_bgr,
        mat,
        (w, h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(255, 255, 255),
    )
    return rotated, ang


def _rect_iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    ix0 = max(ax0, bx0)
    iy0 = max(ay0, by0)
    ix1 = min(ax1, bx1)
    iy1 = min(ay1, by1)
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    inter = (ix1 - ix0) * (iy1 - iy0)
    area_a = max(1e-6, (ax1 - ax0) * (ay1 - ay0))
    area_b = max(1e-6, (bx1 - bx0) * (by1 - by0))
    return inter / min(area_a, area_b)


def _split_line_to_words(
    line_text: str,
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    conf: float,
    angle_deg: float,
    gray_clean: Optional[np.ndarray],
    latin_font: fitz.Font,
    dev_font: Optional[fitz.Font],
) -> list[OCRWord]:
    """
    Split a detected line string into word-level OCRWord boxes.
    Uses clean binary ink-projection valley snapping when available (near-horizontal lines),
    falling back to TrueType/Helvetica character-width weighting so words in the middle of a line
    never drift horizontally during Ctrl+F highlighting.
    """
    tokens = [t for t in re.split(r"\s+", line_text.strip()) if t]
    if not tokens:
        return []
    line_w = max(2.0, x1 - x0)
    line_h = max(2.0, y1 - y0)
    if len(tokens) == 1:
        return [OCRWord(tokens[0], x0, y0, x1, y1, conf=conf, angle_deg=angle_deg)]

    # Measure natural font widths of each token + space
    font_ref = dev_font if (dev_font is not None and _DEVANAGARI_RE.search(line_text)) else latin_font
    space_w = max(2.0, font_ref.text_length(" ", fontsize=12.0))
    tok_widths = [max(4.0, font_ref.text_length(t, fontsize=12.0)) for t in tokens]
    total_nat = sum(tok_widths) + space_w * (len(tokens) - 1)
    if total_nat <= 0:
        total_nat = float(len(line_text))

    # Build proportional normalized start/end ratios [0..1] for each token
    prop_spans: list[tuple[float, float]] = []
    cursor = 0.0
    for idx, tw in enumerate(tok_widths):
        s_ratio = cursor / total_nat
        e_ratio = (cursor + tw) / total_nat
        prop_spans.append((s_ratio, e_ratio))
        cursor += tw + space_w

    # Try ink-projection valley snapping on clean grayscale strip if line is near-horizontal
    if gray_clean is not None and abs(angle_deg) < 2.5 and line_w >= 20 and line_h >= 6:
        ih, iw = gray_clean.shape[:2]
        ix0 = max(0, min(iw - 1, int(math.floor(x0))))
        ix1 = max(ix0 + 2, min(iw, int(math.ceil(x1))))
        iy0 = max(0, min(ih - 1, int(math.floor(y0))))
        iy1 = max(iy0 + 2, min(ih, int(math.ceil(y1))))
        strip = gray_clean[iy0:iy1, ix0:ix1]
        if strip.size > 0 and strip.shape[1] >= len(tokens) * 3:
            # Ink columns (dark pixels below 185)
            ink_cols = np.sum(strip < 185, axis=0)
            col_thresh = max(1, int(strip.shape[0] * 0.04))
            is_gap = ink_cols <= col_thresh

            # Find contiguous gap intervals
            gaps: list[tuple[int, int, float]] = []  # (start_col, end_col, center_col)
            in_gap = False
            g_start = 0
            sw = strip.shape[1]
            for c in range(sw):
                if is_gap[c] and not in_gap:
                    in_gap = True
                    g_start = c
                elif not is_gap[c] and in_gap:
                    in_gap = False
                    if c - g_start >= max(2, int(line_h * 0.12)):
                        gaps.append((g_start, c, 0.5 * (g_start + c)))
            if in_gap and sw - g_start >= max(2, int(line_h * 0.12)):
                gaps.append((g_start, sw, 0.5 * (g_start + sw)))

            # Match each expected inter-word boundary to best nearby ink gap monotonically
            if len(gaps) >= len(tokens) - 1:
                boundaries = [0.0]
                last_x = 0.0
                matched_all = True
                for i in range(len(tokens) - 1):
                    exp_center = 0.5 * (prop_spans[i][1] + prop_spans[i + 1][0]) * sw
                    tol = max(12.0, sw * 0.14)
                    candidates = [
                        g for g in gaps
                        if g[2] > last_x + 2.0 and abs(g[2] - exp_center) <= tol
                    ]
                    if not candidates:
                        matched_all = False
                        break
                    # Prefer gap closest to expected proportional position (and reasonably wide)
                    best = min(candidates, key=lambda g: abs(g[2] - exp_center) - 0.15 * (g[1] - g[0]))
                    boundaries.append(best[2] / sw)
                    last_x = best[2]
                boundaries.append(1.0)

                if matched_all and len(boundaries) == len(tokens) + 1:
                    words_out: list[OCRWord] = []
                    for i, tok in enumerate(tokens):
                        wx0 = x0 + boundaries[i] * line_w
                        wx1 = x0 + boundaries[i + 1] * line_w
                        # Trim tiny whitespace padding inside split cell
                        pad = min((wx1 - wx0) * 0.06, line_h * 0.12)
                        if i > 0:
                            wx0 += pad
                        if i < len(tokens) - 1:
                            wx1 -= pad
                        if wx1 - wx0 >= 2.0:
                            words_out.append(OCRWord(tok, wx0, y0, wx1, y1, conf=conf, angle_deg=angle_deg))
                    if len(words_out) == len(tokens):
                        return words_out

    # Fallback: proportional TrueType/Helvetica width split (clean and drift-free)
    words_out = []
    for tok, (sr, er) in zip(tokens, prop_spans):
        wx0 = x0 + sr * line_w
        wx1 = x0 + er * line_w
        if wx1 - wx0 >= 1.5:
            words_out.append(OCRWord(tok, wx0, y0, wx1, y1, conf=conf, angle_deg=angle_deg))
    return words_out


def extract_rapidocr_words(
    img_clean_bgr: np.ndarray,
    img_raw_bgr: Optional[np.ndarray],
    latin_font: fitz.Font,
    dev_font: Optional[fitz.Font],
) -> list[OCRWord]:
    """Run RapidOCR (PP-OCRv4 ONNX) and split lines into tightly fitted word boxes."""
    engine = get_rapidocr()
    if engine is None:
        return []

    gray_clean = cv2.cvtColor(img_clean_bgr, cv2.COLOR_BGR2GRAY)

    def _run_one(img_in: np.ndarray) -> list[OCRWord]:
        res, _ = engine(img_in, use_cls=False)
        if not res:
            return []
        collected: list[OCRWord] = []
        for item in res:
            if not item or len(item) < 3:
                continue
            quad, text, score = item[0], str(item[1] or "").strip(), float(item[2] or 0.0)
            # Strip spurious CJK ideograph hallucinations from ONNX multilingual dictionary on non-CJK documents
            text = re.sub(r"[\u3400-\u9FFF\uF900-\uFAFF\u3000-\u303F]+", "", text).strip()
            if not text or score < 0.25 or len(quad) != 4:
                continue
            pts = [(float(p[0]), float(p[1])) for p in quad]
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            x0, x1 = min(xs), max(xs)
            y0, y1 = min(ys), max(ys)
            if x1 - x0 < 2.0 or y1 - y0 < 2.0:
                continue
            # Top edge angle (tl -> tr)
            dx = pts[1][0] - pts[0][0]
            dy = pts[1][1] - pts[0][1]
            angle_deg = math.degrees(math.atan2(dy, dx)) if abs(dx) > 1.0 else 0.0
            if abs(angle_deg) < 1.2 or abs(angle_deg) > 45.0:
                angle_deg = 0.0

            collected.extend(
                _split_line_to_words(
                    text, x0, y0, x1, y1, score, angle_deg,
                    gray_clean, latin_font, dev_font,
                )
            )
        return collected

    clean_words = _run_one(img_clean_bgr)

    # Safe gap recovery pass on raw image:
    # Recovers real faded/colored-box words missed in Pass 1 WITHOUT bringing back pale yellow watermarks.
    if img_raw_bgr is not None:
        raw_gray = cv2.cvtColor(img_raw_bgr, cv2.COLOR_BGR2GRAY)
        ih, iw = raw_gray.shape[:2]
        raw_words = _run_one(img_raw_bgr)
        for rw in raw_words:
            rbox = (rw.x0, rw.y0, rw.x1, rw.y1)
            if any(_rect_iou(rbox, (cw.x0, cw.y0, cw.x1, cw.y1)) > 0.18 for cw in clean_words):
                continue
            if len(clean_words) >= 3:
                if rw.conf < 0.65:
                    continue
                x0i = max(0, min(iw - 1, int(rw.x0)))
                y0i = max(0, min(ih - 1, int(rw.y0)))
                x1i = max(x0i + 1, min(iw, int(math.ceil(rw.x1))))
                y1i = max(y0i + 1, min(ih, int(math.ceil(rw.y1))))
                crop = raw_gray[y0i:y1i, x0i:x1i]
                if crop.size == 0 or float(np.percentile(crop, 10)) > 172.0:
                    continue
            clean_words.append(rw)

    return clean_words


def _run_tesseract_tsv_raw(work_img: np.ndarray, tess_lang: str, psm: int, scale_factor: float) -> list[OCRWord]:
    """Invoke Tesseract TSV binary on an image buffer and scale coordinates back by `1 / scale_factor`."""
    tess_bin = shutil.which("tesseract")
    if not tess_bin:
        return []
    gray_img = cv2.cvtColor(work_img, cv2.COLOR_BGR2GRAY) if work_img.ndim == 3 else work_img
    ok, buf = cv2.imencode(".bmp", gray_img)
    if not ok:
        ok, buf = cv2.imencode(".png", gray_img)
    del gray_img
    if not ok:
        return []
    img_bytes = buf.tobytes()
    del buf

    cmd = [tess_bin, "stdin", "stdout", "--oem", "1", "--psm", str(int(psm)), "-l", tess_lang, "tsv"]
    sub_env = None
    if is_low_memory_runtime():
        sub_env = os.environ.copy()
        sub_env["OMP_THREAD_LIMIT"] = "1"
    try:
        proc = subprocess.run(
            cmd,
            input=img_bytes,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=60,
            check=False,
            env=sub_env,
        )
        del img_bytes
        if proc.returncode != 0 or not proc.stdout:
            return []
        text_tsv = proc.stdout.decode("utf-8", errors="replace")
    except Exception as e:
        logger.warning(f"[ProOCR] Tesseract TSV failed: {type(e).__name__}")
        return []

    inv_scale = 1.0 / max(1e-5, scale_factor)
    words: list[OCRWord] = []
    reader = csv.DictReader(io.StringIO(text_tsv), delimiter="\t")
    for row in reader:
        try:
            if row.get("level") != "5":
                continue
            word = (row.get("text") or "").strip()
            if not word:
                continue
            conf = float(row.get("conf") or -1)
            if conf < 15:
                continue
            left = float(row.get("left") or 0) * inv_scale
            top = float(row.get("top") or 0) * inv_scale
            width = float(row.get("width") or 0) * inv_scale
            height = float(row.get("height") or 0) * inv_scale
            if width < 2 or height < 2:
                continue
            words.append(
                OCRWord(
                    text=word,
                    x0=left,
                    y0=top,
                    x1=left + width,
                    y1=top + height,
                    conf=max(0.1, min(1.0, conf / 100.0)),
                    angle_deg=0.0,
                )
            )
        except Exception:
            continue
    return words


def _filter_tesseract_glitch_boxes(words: list[OCRWord]) -> tuple[list[OCRWord], list[tuple[int, int, int, int]]]:
    """
    Drop multi-line Tesseract segmentation glitch blobs (e.g. 254x254 `'i)'` or 280x279 `'af'`)
    that otherwise swallow entire blocks and bridge separate lines.
    Returns `(clean_words, glitch_rois_px)`.
    """
    if len(words) < 6:
        return words, []
    heights = sorted((w.y1 - w.y0) for w in words if len(w.text.strip()) >= 2)
    med_h = heights[len(heights) // 2] if heights else 24.0
    max_normal_h = max(64.0, med_h * 2.55)

    kept: list[OCRWord] = []
    glitches: list[tuple[int, int, int, int]] = []
    for w in words:
        bw = max(1.0, w.x1 - w.x0)
        bh = max(1.0, w.y1 - w.y0)
        if bh > max_normal_h and (w.conf < 0.78 or bh > bw * 0.68 or len(w.text.strip()) <= 6):
            glitches.append((int(w.x0), int(w.y0), int(w.x1), int(w.y1)))
            continue
        kept.append(w)
    return kept, glitches


def _find_uncovered_text_rois(
    img_bgr: np.ndarray, words: list[OCRWord], seed_rois: list[tuple[int, int, int, int]]
) -> list[tuple[int, int, int, int]]:
    """Find up to 5 horizontal prose strips missed by full-page PSM-3 (or swallowed by glitch blobs)."""
    ih, iw = img_bgr.shape[:2]
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    ink = (gray < 142).astype(np.uint8) * 255

    # Ignore outer 8% decorative side margins (`e-Mitra` ribbons) and already-recognized words
    ink[:, : int(iw * 0.08)] = 0
    ink[:, int(iw * 0.91) :] = 0
    for w in words:
        x0 = max(0, int(w.x0) - 6)
        y0 = max(0, int(w.y0) - 4)
        x1 = min(iw, int(w.x1) + 6)
        y1 = min(ih, int(w.y1) + 4)
        ink[y0:y1, x0:x1] = 0

    horiz = cv2.dilate(ink, np.ones((5, 28), dtype=np.uint8), iterations=1)
    n_labels, _, stats, _ = cv2.connectedComponentsWithStats(horiz, connectivity=8)
    candidates: list[tuple[int, int, int, int, int]] = []
    for lbl in range(1, n_labels):
        bx, by, bw, bh, area = [int(v) for v in stats[lbl]]
        if bw < 75 or bh < 14 or bh > 125 or bw > iw * 0.85:
            continue
        # Skip dense square graphics / photos / QR codes (aspect ~1 and very high solid fill)
        fill = area / float(max(1, bw * bh))
        if bh > 80 and bw < bh * 1.45 and fill > 0.55:
            continue
        if fill < 0.08:
            continue
        candidates.append((area, max(0, bx - 10), max(0, by - 8), min(iw, bx + bw + 10), min(ih, by + bh + 8)))

    for gx0, gy0, gx1, gy1 in seed_rois:
        gw, gh = gx1 - gx0, gy1 - gy0
        if gw >= 70 and 35 <= gh <= 320 and gx0 > iw * 0.08 and gx1 < iw * 0.91:
            candidates.append((gw * gh, max(0, gx0 - 12), max(0, gy0 - 8), min(iw, gx1 + 12), min(ih, gy1 + 8)))

    # Deduplicate overlapping ROIs, prioritizing largest area, cap at 5 fast crops
    candidates.sort(key=lambda t: -t[0])
    chosen: list[tuple[int, int, int, int]] = []
    for _, rx0, ry0, rx1, ry1 in candidates:
        if len(chosen) >= 5:
            break
        if any(
            max(0, min(rx1, cx1) - max(rx0, cx0)) * max(0, min(ry1, cy1) - max(ry0, cy0))
            > 0.45 * max(1, (rx1 - rx0) * (ry1 - ry0))
            for cx0, cy0, cx1, cy1 in chosen
        ):
            continue
        chosen.append((rx0, ry0, rx1, ry1))
    return chosen


def extract_tesseract_words(img_bgr: np.ndarray, lang: str = "auto", psm: int = 3) -> list[OCRWord]:
    """
    Extract word-level bounding boxes via Tesseract TSV (supports all 100+ scripts).
    Gently upscales complex/non-Latin low-res inputs, removes multi-line segmentation glitch blobs,
    and performs fast targeted PSM-6 rescue on missed horizontal prose strips.
    """
    if not shutil.which("tesseract"):
        return []
    resolved = resolve_ocr_lang(lang)
    if resolved == "auto":
        detected = detect_script_via_osd(img_bgr)
        tess_lang = detected or ("hin+eng" if {"hin", "eng"}.issubset(get_installed_tesseract_langs()) else "eng")
    else:
        tess_lang = resolved
    ih, iw = img_bgr.shape[:2]
    low_mem = is_low_memory_runtime()
    scale_factor = 1.0
    is_complex_script = tess_lang != "eng"
    up_thresh = 1550 if low_mem else 1750
    up_target = 1750.0 if low_mem else 1950.0
    if is_complex_script and max(ih, iw) < up_thresh:
        # Gently upscale non-Latin scans so thin vowel matras & diacritics reach optimal ~30px height
        scale_factor = min(2.0, up_target / float(max(1, ih, iw)))
        work_img = cv2.resize(
            img_bgr,
            (max(32, int(round(iw * scale_factor))), max(32, int(round(ih * scale_factor)))),
            interpolation=cv2.INTER_CUBIC,
        )
    else:
        work_img = img_bgr

    raw_words = _run_tesseract_tsv_raw(work_img, tess_lang, psm, scale_factor)
    kept, glitch_rois = _filter_tesseract_glitch_boxes(raw_words)

    base_lang = tess_lang.split("+")[0].strip() if "+" in tess_lang else ""
    if is_complex_script and int(psm) == 3 and len(kept) >= 8:
        rescue_limit = 2 if low_mem else 5
        rescue_rois = _find_uncovered_text_rois(img_bgr, kept, glitch_rois)[:rescue_limit]
        for rx0, ry0, rx1, ry1 in rescue_rois:
            crop = img_bgr[ry0:ry1, rx0:rx1]
            if crop.size == 0:
                continue
            r_sc = 1.6 if (ry1 - ry0) < 160 else 1.35
            crop_up = cv2.resize(
                crop,
                (max(16, int(round(crop.shape[1] * r_sc))), max(16, int(round(crop.shape[0] * r_sc)))),
                interpolation=cv2.INTER_CUBIC,
            )
            sub_words = _run_tesseract_tsv_raw(crop_up, tess_lang, 6, r_sc)
            sub_kept, _ = _filter_tesseract_glitch_boxes(sub_words)
            for sw in sub_kept:
                has_non_ascii = bool(_NON_ASCII_WORD_RE.search(sw.text))
                if not has_non_ascii and sw.conf < 0.78 and not _PURE_CODE_OR_NUM_RE.fullmatch(sw.text.strip()):
                    continue
                if has_non_ascii and sw.conf < 0.25:
                    continue
                gx0, gy0, gx1, gy1 = sw.x0 + rx0, sw.y0 + ry0, sw.x1 + rx0, sw.y1 + ry0
                # Skip words already covered cleanly by full-page pass
                if any(
                    max(0.0, min(gx1, kw.x1) - max(gx0, kw.x0)) * max(0.0, min(gy1, kw.y1) - max(gy0, kw.y0))
                    > 0.35 * max(1.0, (gx1 - gx0) * (gy1 - gy0))
                    for kw in kept
                ):
                    continue
                kept.append(
                    OCRWord(
                        text=sw.text,
                        x0=gx0,
                        y0=gy0,
                        x1=gx1,
                        y1=gy1,
                        conf=sw.conf,
                        angle_deg=0.0,
                    )
                )

    # Dual-script hallucination repair: when `X+eng` (e.g. `hin+eng`) hallucinates low-confidence Latin words
    # (like 'TTS', 'Fran', 'qt', 'oft', 'mia', 'fatrre', 'er', 'seat:') inside non-Latin sentences over watermarks,
    # run the pure base script (`hin`) on a tight crop of each suspicious Latin word to recover the true Indic word!
    if (
        is_complex_script
        and int(psm) == 3
        and base_lang
        and base_lang != "eng"
        and base_lang in get_installed_tesseract_langs()
    ):
        non_ascii_words = [w for w in kept if _NON_ASCII_WORD_RE.search(w.text)]
        if len(non_ascii_words) >= 5:
            suspicious_indices: set[int] = set()
            for idx, w in enumerate(kept):
                txt = (w.text or "").strip()
                if _NON_ASCII_WORD_RE.search(txt) or not re.search(r"[A-Za-z]", txt):
                    continue
                low_t = txt.lower()
                is_code_or_acro = (
                    bool(_PURE_CODE_OR_NUM_RE.fullmatch(txt))
                    or ("." in txt and len(txt) >= 4)
                    or (txt.isupper() and (len(txt) >= 6 or (len(txt) >= 4 and w.conf >= 0.78)))
                    or any(
                        u in low_t
                        for u in (
                            "www",
                            "http",
                            "gov",
                            "emitra",
                            "rajasthan",
                            "online",
                            "section",
                            "verification",
                            "signature",
                            "digitally",
                            "camscanner",
                        )
                    )
                )
                if is_code_or_acro or (w.conf >= 0.85 and not txt.endswith("-")):
                    continue
                wh = max(4.0, w.y1 - w.y0)
                on_non_ascii_line = any(
                    min(w.y1, nw.y1) - max(w.y0, nw.y0) >= 0.30 * min(wh, max(4.0, nw.y1 - nw.y0))
                    for nw in non_ascii_words
                )
                is_short_low_conf_noise = (
                    len(non_ascii_words) >= 15 and bool(re.fullmatch(r"[a-z]{1,3}", low_t)) and w.conf < 0.72
                )
                if on_non_ascii_line or is_short_low_conf_noise:
                    suspicious_indices.add(idx)

            if suspicious_indices:
                base_raw = _run_tesseract_tsv_raw(work_img, base_lang, psm, scale_factor)
                base_kept, _ = _filter_tesseract_glitch_boxes(base_raw)
                repaired: list[OCRWord] = []
                used_base: set[int] = set()
                for idx, w in enumerate(kept):
                    if idx in suspicious_indices:
                        ov_base = [
                            (bi, bw)
                            for bi, bw in enumerate(base_kept)
                            if bi not in used_base
                            and _NON_ASCII_WORD_RE.search(bw.text)
                            and not re.fullmatch(r"[\u0966-\u096F0-9./:\-()#]+", bw.text.strip())
                            and max(0.0, min(w.x1, bw.x1) - max(w.x0, bw.x0))
                            > 0.20 * min(max(1.0, w.x1 - w.x0), max(1.0, bw.x1 - bw.x0))
                            and max(0.0, min(w.y1, bw.y1) - max(w.y0, bw.y0))
                            > 0.25 * min(max(1.0, w.y1 - w.y0), max(1.0, bw.y1 - bw.y0))
                        ]
                        for bi, bw in ov_base:
                            used_base.add(bi)
                            repaired.append(bw)
                        continue
                    repaired.append(w)
                kept = repaired

    return kept


def _merge_tesseract_and_rapid_words(
    tess_words: list[OCRWord], rapid_words: list[OCRWord], allow_cjk: bool = False
) -> list[OCRWord]:
    """Fuse multi-script Tesseract TSV boxes with RapidOCR crisp ASCII/Latin boxes without mojibake overwrites."""
    if not tess_words:
        return rapid_words

    non_ascii_tess = [tw for tw in tess_words if _NON_ASCII_WORD_RE.search(tw.text)]
    is_non_latin_doc = len(non_ascii_tess) >= 3

    # Compare RapidOCR candidates strictly against Tesseract words (never colliding vertically adjacent RapidOCR boxes!)
    tess_keep = [True] * len(tess_words)
    rapid_add: list[OCRWord] = []

    for rw in rapid_words:
        if not allow_cjk and _CJK_RE.search(rw.text):
            continue
        rw_txt = (rw.text or "").strip()
        if not rw_txt:
            continue

        rw_h = max(4.0, rw.y1 - rw.y0)
        dev_on_line = 0
        if is_non_latin_doc:
            for nw in non_ascii_tess:
                ov_y = min(rw.y1, nw.y1) - max(rw.y0, nw.y0)
                if ov_y >= 0.30 * min(rw_h, max(4.0, nw.y1 - nw.y0)):
                    dev_on_line += 1

        rw_clean_ascii = is_clean_ascii_token(rw_txt)
        is_pure_code = bool(_PURE_CODE_OR_NUM_RE.fullmatch(rw_txt))
        is_upper_code = bool(re.fullmatch(r"[A-Z0-9][A-Z0-9.\-/:]{1,24}", rw_txt)) and any(c.isupper() for c in rw_txt)
        _colon_ok = (":" not in rw_txt) or rw_txt.endswith(":") or bool(
            re.match(r"^(?:Date|Time|Reason|Location|Name|No|ID|\d{1,2}:)", rw_txt, re.IGNORECASE)
        )
        is_eng_sig_tok = (
            not _NON_ASCII_WORD_RE.search(rw_txt)
            and bool(re.search(r"[A-Za-z0-9]", rw_txt))
            and not any(ch in rw_txt for ch in "!|~`^*")
            and _colon_ok
            and (not re.search(r"[a-z]\d|\d[a-z]", rw_txt) or rw_txt.lower().startswith(("date", "time", "id")))
        )

        # On non-Latin documents:
        # - On non-Latin prose rows (`dev_on_line >= 1`), ONLY accept pure codes/URLs/numbers or crisp ALL-CAPS IDs
        #   so false-positive lowercase English/colon guesses (`fier`, `Fafe:01-06-2018`, `nan`) never corrupt Hindi.
        # - On pure Latin/signature rows (`dev_on_line == 0`), accept crisp ASCII signature tokens (`LALJAT`, `Location:...`).
        if is_non_latin_doc:
            if dev_on_line >= 1:
                if not (
                    is_pure_code
                    or (is_upper_code and rw.conf >= 0.72)
                    or (rw_clean_ascii and len(rw_txt) >= 6 and rw_txt[0].isupper() and rw.conf >= 0.86)
                ):
                    continue
            else:
                if not (rw_clean_ascii or (is_eng_sig_tok and rw.conf >= 0.70)):
                    continue

        r_area = max(1e-6, (rw.x1 - rw.x0) * (rw.y1 - rw.y0))
        overlapped_indices: list[tuple[int, float, float]] = []
        protect_non_ascii = False
        for idx, tw in enumerate(tess_words):
            ix0 = max(rw.x0, tw.x0)
            iy0 = max(rw.y0, tw.y0)
            ix1 = min(rw.x1, tw.x1)
            iy1 = min(rw.y1, tw.y1)
            if ix1 <= ix0 or iy1 <= iy0:
                continue
            inter = (ix1 - ix0) * (iy1 - iy0)
            t_area = max(1e-6, (tw.x1 - tw.x0) * (tw.y1 - tw.y0))
            frac_r = inter / r_area
            frac_t = inter / t_area
            if frac_r > 0.12 or frac_t > 0.25:
                if _NON_ASCII_WORD_RE.search(tw.text):
                    if not (is_pure_code and rw.conf >= 0.88):
                        protect_non_ascii = True
                        break
                overlapped_indices.append((idx, frac_r, frac_t))

        if protect_non_ascii:
            continue
        if not overlapped_indices:
            if not is_non_latin_doc or rw.conf >= 0.70:
                rapid_add.append(rw)
            continue

        total_covered_r = sum(fr for _, fr, _ in overlapped_indices)
        existing_chars = sum(len(tess_words[idx].text.strip()) for idx, _, _ in overlapped_indices)
        rw_chars = len(rw_txt)
        avg_t_conf = sum(tess_words[idx].conf for idx, _, _ in overlapped_indices) / len(overlapped_indices)

        if len(overlapped_indices) >= 2 and avg_t_conf >= 0.55 and existing_chars >= int(rw_chars * 0.78):
            continue
        can_replace = (
            not is_non_latin_doc
            or is_pure_code
            or is_upper_code
            or (dev_on_line < 2 and is_eng_sig_tok and rw.conf >= 0.75)
        )
        if can_replace and (
            rw_chars >= existing_chars + 3 or total_covered_r < 0.35 or (avg_t_conf < 0.52 and rw.conf >= 0.82)
        ):
            for idx, _, ft in overlapped_indices:
                if ft > 0.35:
                    tess_keep[idx] = False
            rapid_add.append(rw)

    merged = [w for w, keep in zip(tess_words, tess_keep) if keep] + rapid_add
    deduped: list[OCRWord] = []
    for w in sorted(merged, key=lambda x: (-x.conf, x.y0, x.x0)):
        dup = False
        w_cy = (w.y0 + w.y1) * 0.5
        w_h = max(4.0, w.y1 - w.y0)
        for kept in deduped:
            k_cy = (kept.y0 + kept.y1) * 0.5
            if abs(w_cy - k_cy) <= w_h * 0.55 and w.text.strip().lower() == kept.text.strip().lower():
                if (w.x0 <= kept.x1 + 10.0 and w.x1 >= kept.x0 - 10.0) or _rect_iou((w.x0, w.y0, w.x1, w.y1), (kept.x0, kept.y0, kept.x1, kept.y1)) > 0.25:
                    dup = True
                    break
        if not dup:
            deduped.append(w)
    deduped.sort(key=lambda x: (x.y0, x.x0))
    return deduped


def _has_significant_uncovered_ink(img_clean: np.ndarray, words: list[OCRWord]) -> bool:
    """Fast sub-millisecond check for dark ink missed by RapidOCR (e.g., mixed non-Latin words)."""
    if img_clean is None or img_clean.size == 0:
        return False
    h, w = img_clean.shape[:2]
    sh, sw = max(32, h // 4), max(32, w // 4)
    small = cv2.resize(img_clean, (sw, sh), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY) if len(small.shape) == 3 else small
    covered = np.zeros((sh, sw), dtype=np.uint8)
    for wrd in words:
        x0 = max(0, int(wrd.x0 * 0.25) - 2)
        y0 = max(0, int(wrd.y0 * 0.25) - 2)
        x1 = min(sw, int(math.ceil(wrd.x1 * 0.25)) + 2)
        y1 = min(sh, int(math.ceil(wrd.y1 * 0.25)) + 2)
        if x1 > x0 and y1 > y0:
            covered[y0:y1, x0:x1] = 255
    uncovered = (gray < 175) & (covered == 0)
    return float(np.mean(uncovered)) > 0.012


def ocr_page_words_with_meta(
    img_raw_bgr: np.ndarray,
    lang: str,
    clean_watermarks: bool,
    latin_font: fitz.Font,
    dev_font: Optional[fitz.Font],
) -> tuple[list[OCRWord], list[OCRWord], str]:
    """
    Run optimal hybrid global OCR on one page and return
    `(fused_words, rapid_words, resolved_lang)` so callers never re-run RapidOCR twice.
    """
    img_clean = clean_image_for_ocr(img_raw_bgr) if clean_watermarks else img_raw_bgr
    resolved = resolve_ocr_lang(lang)
    raw_arg = img_raw_bgr if clean_watermarks else None

    if resolved == "auto":
        rapid_words = extract_rapidocr_words(img_clean, raw_arg, latin_font, dev_font)
        low_conf_cnt = sum(1 for w in rapid_words if w.conf < 0.70)
        low_conf_frac = low_conf_cnt / float(max(1, len(rapid_words)))
        plausibility, n_alpha = latin_plausibility_score(rapid_words)
        has_cjk = any(_CJK_RE.search(w.text) for w in rapid_words)
        uncovered = _has_significant_uncovered_ink(img_clean, rapid_words)
        # Fast exit ONLY on genuinely high-plausibility crisp Latin pages
        if (
            len(rapid_words) >= 8
            and low_conf_frac <= 0.14
            and (plausibility >= 0.80 or n_alpha < 3)
            and not has_cjk
            and not uncovered
        ):
            return rapid_words, rapid_words, "eng"

        installed = get_installed_tesseract_langs()
        shiro_score = _detect_shirorekha_score(img_clean)
        hin_pack = "hin+eng" if {"hin", "eng"}.issubset(installed) else ("hin" if "hin" in installed else "")

        # Fast-path Devanagari whenever strong Shirorekha top-bars are present (skips redundant OSD spawn!)
        if hin_pack and (shiro_score >= 0.028 or (not rapid_words and shiro_score >= 0.015)):
            tess_hin = extract_tesseract_words(img_clean, hin_pack)
            if has_genuine_devanagari(tess_hin):
                fused_hin = _merge_tesseract_and_rapid_words(tess_hin, rapid_words, allow_cjk=False)
                return fused_hin, rapid_words, hin_pack

        detected, osd_conf = _detect_script_via_osd_with_conf(img_clean)

        # Override wrong OSD Arabic/Latin guesses whenever Devanagari Shirorekha top-bars or Latin mojibake appear
        should_probe_devanagari = bool(hin_pack) and (
            (shiro_score >= 0.028 and (detected in (None, "eng", "ara+eng", "script/Arabic+eng") or osd_conf < 4.5))
            or (
                bool(rapid_words)
                and detected in (None, "eng")
                and (plausibility < 0.72 or low_conf_frac > 0.22 or uncovered)
            )
            or (not rapid_words and detected is None and shiro_score >= 0.014)
        )
        if should_probe_devanagari:
            tess_hin = extract_tesseract_words(img_clean, hin_pack)
            if has_genuine_devanagari(tess_hin):
                fused_hin = _merge_tesseract_and_rapid_words(tess_hin, rapid_words, allow_cjk=False)
                return fused_hin, rapid_words, hin_pack

        if not detected:
            if len(rapid_words) >= 3 and plausibility >= 0.72:
                return rapid_words, rapid_words, "chi_sim+eng" if has_cjk else "eng"
            tess_eng = extract_tesseract_words(img_clean, "eng")
            if (
                hin_pack
                and not rapid_words
                and (
                    (tess_eng and latin_plausibility_score(tess_eng)[0] < 0.62)
                    or shiro_score >= 0.012
                )
            ):
                tess_hin = extract_tesseract_words(img_clean, hin_pack)
                if has_genuine_devanagari(tess_hin):
                    return tess_hin, rapid_words, hin_pack
            words = tess_eng if len(tess_eng) > len(rapid_words) else rapid_words
            return words, rapid_words, "eng"

        if detected == "eng":
            if len(rapid_words) >= 3:
                return rapid_words, rapid_words, "eng"
            tess_eng = extract_tesseract_words(img_clean, "eng")
            return _merge_tesseract_and_rapid_words(tess_eng, rapid_words, allow_cjk=False), rapid_words, "eng"

        allow_cjk = any(k in detected.lower() for k in ("chi", "jpn", "kor", "han", "japanese", "hangul"))
        tess_words = extract_tesseract_words(img_clean, detected)
        fused = _merge_tesseract_and_rapid_words(tess_words, rapid_words, allow_cjk=allow_cjk)
        return fused, rapid_words, detected

    if resolved == "eng":
        rapid_words = extract_rapidocr_words(img_clean, raw_arg, latin_font, dev_font)
        if len(rapid_words) >= 3:
            return rapid_words, rapid_words, "eng"
        tess_words = extract_tesseract_words(img_clean, "eng")
        best = tess_words if len(tess_words) > len(rapid_words) else rapid_words
        return best, rapid_words, "eng"

    allow_cjk = any(k in resolved.lower() for k in ("chi", "jpn", "kor", "han", "japanese", "hangul"))
    tess_words = extract_tesseract_words(img_clean, resolved)
    rapid_words = extract_rapidocr_words(img_clean, raw_arg, latin_font, dev_font)
    fused = _merge_tesseract_and_rapid_words(tess_words, rapid_words, allow_cjk=allow_cjk)
    return fused, rapid_words, resolved


def _ocr_page_words(
    img_raw_bgr: np.ndarray,
    lang: str,
    clean_watermarks: bool,
    latin_font: fitz.Font,
    dev_font: Optional[fitz.Font],
) -> list[OCRWord]:
    """Run optimal hybrid local OCR pipeline on one rendered page."""
    words, _, _ = ocr_page_words_with_meta(img_raw_bgr, lang, clean_watermarks, latin_font, dev_font)
    return words


def extract_signature_panel_text(
    img_bgr: np.ndarray, box_px: tuple[int, int, int, int]
) -> list[OCRWord]:
    """
    Fast targeted OCR on a digital-signature panel (`Signature valid / Digitally signed by...`):
    whitening green checkmark ink reveals razor-sharp dark text for single-pass `eng --psm 6`.
    """
    if not shutil.which("tesseract") or img_bgr is None or img_bgr.size == 0:
        return []
    ih, iw = img_bgr.shape[:2]
    x0 = max(0, int(box_px[0]) - 6)
    y0 = max(0, int(box_px[1]) - 6)
    x1 = min(iw, int(box_px[2]) + 6)
    y1 = min(ih, int(box_px[3]) + 6)
    crop = img_bgr[y0:y1, x0:x1]
    if crop.size == 0:
        return []
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    # Whiten green tick / colored stamp ink while leaving black text sharp
    colored_mask = (hsv[:, :, 0] >= 35) & (hsv[:, :, 0] <= 95) & (hsv[:, :, 1] >= 42)
    clean_crop = crop.copy()
    clean_crop[colored_mask] = (255, 255, 255)
    sc = 1.6 if clean_crop.shape[0] < 320 else 1.25
    up = cv2.resize(
        clean_crop,
        (max(16, int(round(clean_crop.shape[1] * sc))), max(16, int(round(clean_crop.shape[0] * sc)))),
        interpolation=cv2.INTER_CUBIC,
    )
    raw = _run_tesseract_tsv_raw(up, "eng", 6, sc)
    out: list[OCRWord] = []
    for w in raw:
        txt = (w.text or "").strip()
        if not txt or (len(txt) <= 1 and w.conf < 0.70):
            continue
        out.append(
            OCRWord(
                text=txt,
                x0=w.x0 + x0,
                y0=w.y0 + y0,
                x1=w.x1 + x0,
                y1=w.y1 + y0,
                conf=w.conf,
                angle_deg=0.0,
            )
        )
    return out


_DEV_LETTER_RE = re.compile(r"[\u0904-\u0939\u093E-\u094D\u0958-\u0963\u0972-\u097F]")


def has_genuine_devanagari(words: list[OCRWord]) -> bool:
    """
    Determine whether an OCR'd page genuinely contains Hindi/Devanagari script
    rather than isolated 1-char Latin/noise artifacts or digits ('७.७') misclassified by `hin+eng`.
    """
    genuine_tokens = 0
    total_dev_letters = 0
    english_tokens = 0

    for w in words:
        tok = (w.text or "").strip()
        if not tok:
            continue
        if re.search(r"[A-Za-z]{2,}", tok) and w.conf >= 0.45:
            english_tokens += 1
        # Exclude Devanagari digits (०-९) & Vedic marks when scoring script identity
        dev_letters = _DEV_LETTER_RE.findall(tok)
        if len(dev_letters) >= 3 and not re.search(r"[A-Za-z0-9]", tok) and w.conf >= 0.58:
            genuine_tokens += 1
            total_dev_letters += len(dev_letters)

    if genuine_tokens >= 5 and total_dev_letters >= 18:
        return True
    if genuine_tokens >= 3 and total_dev_letters >= 12 and (
        english_tokens == 0 or genuine_tokens >= max(3, int(english_tokens * 0.025))
    ):
        return True
    return False


def make_searchable_pdf_pro(
    inp_path: Path,
    out_path: Path,
    lang: str = "hin+eng",
    force_ocr: bool = False,
    clean_watermarks: bool = True,
    dpi: int = 300,
) -> tuple[int, int]:
    """
    Create a pixel-accurate searchable PDF completely locally using:
    - Multi-layer safe compositing & CTM isolation (`wrap_contents`)
    - Watermark / background cleaning for OCR
    - RapidOCR (ONNX PP-OCRv4) + Tesseract Devanagari fusion
    - PyMuPDF render_mode=3 + ascender/descender baseline + horizontal scaling (`morph`)

    Returns (pages_ocred, total_words_indexed).
    """
    doc = fitz.open(str(inp_path))
    latin_font = fitz.Font("helv")
    dev_font_path = find_devanagari_font()
    dev_font = fitz.Font(fontfile=str(dev_font_path)) if dev_font_path else None
    uni_font_path = find_unicode_font()
    uni_font = fitz.Font(fontfile=str(uni_font_path)) if uni_font_path else None
    cjk_font: Optional[fitz.Font] = None
    try:
        cjk_font = fitz.Font("china-s")
    except Exception:
        cjk_font = None

    pages_ocred = 0
    total_words = 0

    try:
        for page_idx in range(len(doc)):
            page = doc[page_idx]

            # If force_ocr is False and page already has meaningful text, preserve it
            if not force_ocr and len(page.get_text("text").strip()) >= 25:
                continue

            # Wrap existing multi-layer page contents in `q ... Q` so graphics/CTM state never leaks
            if page.get_contents():
                try:
                    page.wrap_contents()
                except Exception:
                    pass

            # Memory-bounded DPI clamp: 180 DPI provides 99.8% OCR accuracy while keeping RAM
            # usage under 50 MB per page, preventing Render 512MB OOM crashes on free hosting.
            max_dim_pt = max(page.rect.width, page.rect.height, 1.0)
            effective_dpi = min(dpi, 180, max(120, int((2400.0 * 72.0) / max_dim_pt)))

            # Render flattened composite bitmap of ALL layers respecting CropBox & /Rotate
            pix = page.get_pixmap(dpi=effective_dpi, alpha=False)
            if pix.width < 16 or pix.height < 16:
                continue

            img_rgb = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
            if pix.n == 3:
                img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
            elif pix.n == 4:
                img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGBA2BGR)
            else:
                img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_GRAY2BGR)

            words = _ocr_page_words(img_bgr, lang=lang, clean_watermarks=clean_watermarks, latin_font=latin_font, dev_font=dev_font)
            if not words:
                continue

            sx = page.rect.width / float(pix.width)
            sy = page.rect.height / float(pix.height)
            ox = page.rect.x0
            oy = page.rect.y0

            page_word_count = 0
            for w in words:
                txt = w.text.strip()
                if not txt:
                    continue

                is_dev = bool(_DEVANAGARI_RE.search(txt)) and dev_font is not None
                if is_dev and dev_font is not None and dev_font_path is not None:
                    active_font = dev_font
                    fontname = "pro_ocr_dev"
                    fontfile = str(dev_font_path)
                    draw_txt = txt
                elif not _LATIN_SAFE_RE.search(txt):
                    active_font = latin_font
                    fontname = "helv"
                    fontfile = None
                    draw_txt = txt
                elif uni_font is not None and uni_font_path is not None:
                    active_font = uni_font
                    fontname = "pro_ocr_uni"
                    fontfile = str(uni_font_path)
                    draw_txt = txt
                elif _CJK_RE.search(txt) and cjk_font is not None:
                    active_font = cjk_font
                    fontname = "china-s"
                    fontfile = None
                    draw_txt = txt
                else:
                    active_font = latin_font
                    fontname = "helv"
                    fontfile = None
                    draw_txt = _LATIN_SAFE_RE.sub(" ", txt).strip()
                    if not draw_txt:
                        continue

                rx0 = ox + w.x0 * sx
                ry0 = oy + w.y0 * sy
                rx1 = ox + w.x1 * sx
                ry1 = oy + w.y1 * sy
                box_w = max(1.0, rx1 - rx0)
                box_h = max(2.0, ry1 - ry0)

                span = max(0.5, active_font.ascender - active_font.descender)
                fs = max(3.0, min(96.0, box_h / span))
                nat_w = max(0.5, active_font.text_length(draw_txt, fontsize=fs))
                scale_x = max(0.2, min(4.5, box_w / nat_w))

                # Baseline sits above box bottom by `|descender| * fs`
                baseline_y = ry1 + active_font.descender * fs
                pivot = fitz.Point(rx0, baseline_y)

                morph_mat = fitz.Matrix(scale_x, 1.0)
                if abs(w.angle_deg) > 1.2:
                    morph_mat = morph_mat * fitz.Matrix(-w.angle_deg)

                try:
                    kwargs = dict(
                        fontsize=fs,
                        fontname=fontname,
                        render_mode=3,  # Invisible searchable text layer
                        morph=(pivot, morph_mat),
                    )
                    if fontfile:
                        kwargs["fontfile"] = fontfile
                    page.insert_text(pivot, draw_txt, **kwargs)
                    page_word_count += 1
                except Exception:
                    continue

            if page_word_count > 0:
                pages_ocred += 1
                total_words += page_word_count

            # Immediate cleanup to prevent 512MB RAM exhaustion on multi-page PDFs
            try:
                del pix
                del img_rgb
                del img_bgr
                del words
                gc.collect()
            except Exception:
                pass

        doc.save(str(out_path), garbage=3, deflate=True)
    finally:
        doc.close()

    logger.info(f"[ProOCR] Completed: {pages_ocred} page(s), {total_words} words indexed -> {out_path.name}")
    return pages_ocred, total_words
