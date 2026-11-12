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
import fitz
import numpy as np

logger = logging.getLogger("mediasuite.ocr")

_RAPIDOCR_LOCK = threading.Lock()
_RAPIDOCR_INSTANCE = None
_RAPIDOCR_INIT_FAILED = False

_DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")
_LATIN_SAFE_RE = re.compile(r"[^\x20-\x7E\xA0-\xFF]")


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


def get_rapidocr():
    """Thread-safe lazy singleton for RapidOCR (PaddleOCR PP-OCRv4 ONNX)."""
    global _RAPIDOCR_INSTANCE, _RAPIDOCR_INIT_FAILED
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
    """
    if img_bgr is None or img_bgr.size == 0:
        return img_bgr

    h, w = img_bgr.shape[:2]
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)

    # Fast downscaled illumination normalization (removes uneven scanner shading & smooth stamps)
    scale_ds = 0.25 if max(h, w) > 900 else 0.5
    ds_w = max(32, int(w * scale_ds))
    ds_h = max(32, int(h * scale_ds))
    small = cv2.resize(gray.astype(np.uint8), (ds_w, ds_h), interpolation=cv2.INTER_AREA)
    k = max(11, (min(ds_w, ds_h) // 24) | 1)
    k = min(k, 25)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    bg_small = cv2.morphologyEx(small, cv2.MORPH_CLOSE, kernel)
    bg_small = cv2.GaussianBlur(bg_small, (k, k), 0)
    bg_full = cv2.resize(bg_small, (w, h), interpolation=cv2.INTER_LINEAR).astype(np.float32)

    # Ratio relative to local paper illumination: dark/faded ink stays < 0.87 even under yellow wash
    ratio = np.clip(gray / np.maximum(bg_full, 24.0), 0.0, 1.0)

    # Only erase bright saturated watermarks that are very close to background illumination
    pale_wm = ((hsv[:, :, 1] > 28) & (hsv[:, :, 2] > 155) & (ratio > 0.87)) | (
        (hsv[:, :, 2] > 220) & (ratio > 0.92)
    )
    norm = np.where(pale_wm, 1.0, ratio)

    # Gentle gamma 1.45 contrast boost darkens faded ink-saver gray text without eroding thin serifs
    enhanced = ((np.clip((norm - 0.15) / 0.80, 0.0, 1.0) ** 1.45) * 255.0).astype(np.uint8)
    return cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)


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
        res, _ = engine(img_in)
        if not res:
            return []
        collected: list[OCRWord] = []
        for item in res:
            if not item or len(item) < 3:
                continue
            quad, text, score = item[0], str(item[1] or "").strip(), float(item[2] or 0.0)
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


def extract_tesseract_words(img_bgr: np.ndarray, lang: str = "hin+eng") -> list[OCRWord]:
    """Run system Tesseract TSV on a cleaned image for Devanagari/multilingual word boxes."""
    tess_bin = shutil.which("tesseract")
    if not tess_bin:
        return []

    ok, buf = cv2.imencode(".png", img_bgr)
    if not ok:
        return []

    tess_lang = "hin+eng" if ("hin" in lang.lower() and "eng" in lang.lower()) else (
        "hin" if "hin" in lang.lower() else "eng"
    )
    cmd = [tess_bin, "stdin", "stdout", "--oem", "1", "--psm", "3", "-l", tess_lang, "tsv"]
    try:
        proc = subprocess.run(
            cmd,
            input=buf.tobytes(),
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=60,
            check=False,
        )
        if proc.returncode != 0 or not proc.stdout:
            return []
        text_tsv = proc.stdout.decode("utf-8", errors="replace")
    except Exception as e:
        logger.warning(f"[ProOCR] Tesseract TSV failed: {type(e).__name__}")
        return []

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
            left = float(row.get("left") or 0)
            top = float(row.get("top") or 0)
            width = float(row.get("width") or 0)
            height = float(row.get("height") or 0)
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


def _ocr_page_words(
    img_raw_bgr: np.ndarray,
    lang: str,
    clean_watermarks: bool,
    latin_font: fitz.Font,
    dev_font: Optional[fitz.Font],
) -> list[OCRWord]:
    """Run optimal hybrid local OCR pipeline on one rendered page."""
    img_clean = clean_image_for_ocr(img_raw_bgr) if clean_watermarks else img_raw_bgr
    wants_hindi = "hin" in lang.lower()

    if not wants_hindi:
        words = extract_rapidocr_words(img_clean, img_raw_bgr if clean_watermarks else None, latin_font, dev_font)
        if len(words) >= 3:
            return words
        # Fallback to Tesseract if RapidOCR failed or returned almost nothing
        tess_words = extract_tesseract_words(img_clean, "eng")
        return tess_words if len(tess_words) > len(words) else words

    # Hindi or Hindi+English bilingual documents:
    # 1. Tesseract TSV excels at Devanagari ligatures/matras cleanly once yellow watermark is stripped
    tess_words = extract_tesseract_words(img_clean, lang)
    # 2. RapidOCR recovers crisp English headers, serial numbers, tables, or tilted text missed by Tesseract
    rapid_words = extract_rapidocr_words(img_clean, img_raw_bgr if clean_watermarks else None, latin_font, dev_font)

    if not tess_words:
        return rapid_words

    # Keep all Tesseract words initially; selectively merge/upgrade uncovered or truncated Latin spans with RapidOCR
    merged = list(tess_words)
    for rw in rapid_words:
        # RapidOCR bundled model outputs Latin/ASCII & CJK; ignore hallucinated CJK when English+Hindi requested
        if any("\u4e00" <= ch <= "\u9fff" for ch in rw.text):
            continue
        rbox = (rw.x0, rw.y0, rw.x1, rw.y1)
        r_area = max(1e-6, (rw.x1 - rw.x0) * (rw.y1 - rw.y0))

        # Calculate intersection against every existing word in `merged`
        overlapped_indices: list[tuple[int, float, float]] = []  # (idx, inter/r_area, inter/t_area)
        has_devanagari_overlap = False
        for idx, tw in enumerate(merged):
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
            if frac_r > 0.12 or frac_t > 0.30:
                if _DEVANAGARI_RE.search(tw.text):
                    has_devanagari_overlap = True
                    break
                overlapped_indices.append((idx, frac_r, frac_t))

        if has_devanagari_overlap:
            continue

        if not overlapped_indices:
            merged.append(rw)
            continue

        total_covered_r = sum(fr for _, fr, _ in overlapped_indices)
        existing_chars = sum(len(merged[idx].text.strip()) for idx, _, _ in overlapped_indices)
        rw_chars = len(rw.text.strip())

        # If RapidOCR captured significantly richer/longer Latin text (e.g. 'S.N.:RJ/2017/REVENUE' vs truncated 'S.N.'),
        # upgrade those partial Latin fragments to the crisp RapidOCR word box!
        if rw_chars >= existing_chars + 3 or total_covered_r < 0.35:
            to_drop = {idx for idx, _, ft in overlapped_indices if ft > 0.35}
            if to_drop:
                merged = [w for i, w in enumerate(merged) if i not in to_drop]
            merged.append(rw)
    return merged


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

            # Auto-clamp DPI for huge poster pages so memory stays bounded (~4000px max dim)
            max_dim_pt = max(page.rect.width, page.rect.height, 1.0)
            effective_dpi = min(dpi, max(150, int((4000.0 * 72.0) / max_dim_pt)))

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

        doc.save(str(out_path), garbage=3, deflate=True)
    finally:
        doc.close()

    logger.info(f"[ProOCR] Completed: {pages_ocred} page(s), {total_words} words indexed -> {out_path.name}")
    return pages_ocred, total_words
