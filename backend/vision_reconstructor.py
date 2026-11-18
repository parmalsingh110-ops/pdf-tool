"""
Precision Hybrid CV + Bilingual OCR Document Reconstruction Engine
------------------------------------------------------------------
Reconstructs scanned PDFs, OCR-layered scanned PDFs (`render_mode=3`),
skewed camera scans, and raw images (JPG/PNG/WebP/TIFF) into 100% editable
Word (.docx), Excel (.xlsx), and PowerPoint (.pptx) files preserving:

- Multi-level merged table grids (`gridSpan`/`vMerge`, `merge_cells`, `cell.merge`)
- Dark-shaded header cell inversion + 2.5x per-cell OCR recovery
- Watermark & camera-glare suppression (e-Mitra yellow, RBSE cyan/green, CamScanner tilt)
- Bilingual English + Devanagari (Hindi) runs with proper script & bidi tagging
- Non-text visual assets (crests, passport photos, QR codes, stamps, signatures)
- Apple Pages + MS Word safe flat layout bands (zero nested `<w:tbl>` traps)
- Render 512MB RAM safety via page-by-page processing and explicit `gc.collect()`
"""

from __future__ import annotations

import base64
from concurrent.futures import ThreadPoolExecutor
import copy
import gc
import io
import logging
import math
import os
import re
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import cv2
import pymupdf as fitz
import img2pdf
import numpy as np
from PIL import Image, ImageOps

from ocr_engine import (
    OCRWord,
    clean_image_for_ocr,
    deskew_image_bgr,
    extract_rapidocr_words,
    extract_signature_panel_text,
    extract_tesseract_words,
    find_devanagari_font,
    has_genuine_devanagari,
    is_clean_ascii_token,
    is_low_memory_runtime,
    latin_plausibility_score,
    ocr_page_words_with_meta,
    resolve_ocr_lang,
    _ocr_page_words,
)

logger = logging.getLogger("mediasuite.vision")

_LOW_MEM_CPU_OCR_SEM = threading.Semaphore(1)

_DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")
_DEV_LETTER_RE = re.compile(r"[\u0904-\u0939\u093E-\u094D\u0958-\u0963\u0972-\u097F]")
_LATIN_RUN_RE = re.compile(r"([\u0900-\u097F\u0980-\u09FF]+|[^\u0900-\u097F\u0980-\u09FF]+)")
_PURE_NUM_RE = re.compile(r"^[+-]?(?:[1-9]\d*|0)(?:\.\d+)?$")

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".bmp"}


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------


@dataclass
class DetectedWord:
    text: str
    x0: float  # pt
    y0: float  # pt
    x1: float  # pt
    y1: float  # pt
    conf: float = 0.9
    font_size_pt: float = 10.0
    color_rgb: tuple[int, int, int] = (17, 24, 39)
    is_bold: bool = False
    is_devanagari: bool = False


@dataclass
class TextLine:
    words: list[DetectedWord]
    x0: float
    y0: float
    x1: float
    y1: float
    text: str
    font_size_pt: float
    is_bold: bool
    color_rgb: tuple[int, int, int]
    align: str = "left"  # left | center | right


@dataclass
class TableCell:
    r0: int
    c0: int
    r1: int  # exclusive
    c1: int  # exclusive
    x0: float
    y0: float
    x1: float
    y1: float
    text: str = ""
    lines: list[str] = field(default_factory=list)
    bg_rgb: Optional[tuple[int, int, int]] = None
    text_rgb: tuple[int, int, int] = (17, 24, 39)
    is_header: bool = False
    is_bold: bool = False
    align: str = "left"
    font_size_pt: float = 9.0
    assets: list["VisualAsset"] = field(default_factory=list)
    has_borders: bool = True


@dataclass
class DetectedTable:
    x0: float
    y0: float
    x1: float
    y1: float
    n_rows: int
    n_cols: int
    col_widths_pt: list[float]
    row_heights_pt: list[float]
    cells: list[TableCell]
    has_visible_borders: bool = True


@dataclass
class VisualAsset:
    x0: float
    y0: float
    x1: float
    y1: float
    kind: str  # photo | logo | qr | stamp | signature
    png_bytes: bytes
    w_px: int
    h_px: int


@dataclass
class ColumnZone:
    x0: float
    x1: float
    lines: list[TextLine] = field(default_factory=list)
    assets: list[VisualAsset] = field(default_factory=list)
    align: str = "left"


@dataclass
class LayoutBand:
    kind: str  # table | columns | paragraph
    y0: float
    y1: float
    table: Optional[DetectedTable] = None
    zones: list[ColumnZone] = field(default_factory=list)
    column_rows: list[list[ColumnZone]] = field(default_factory=list)
    lines: list[TextLine] = field(default_factory=list)
    floating_assets: list[VisualAsset] = field(default_factory=list)


@dataclass
class PageBlueprint:
    page_index: int
    width_pt: float
    height_pt: float
    skew_deg: float
    tables: list[DetectedTable]
    assets: list[VisualAsset]
    lines: list[TextLine]
    bands: list[LayoutBand]
    bg_clean_png: Optional[bytes] = None
    page_border_rgb: Optional[tuple[int, int, int]] = None
    has_curved_arch_header: bool = False
    ai_enhanced: bool = False


# ---------------------------------------------------------------------------
# Input Normalization & Scan/OCR Detection
# ---------------------------------------------------------------------------


def is_image_upload(filename: Optional[str], raw_bytes: bytes) -> bool:
    """Detect whether uploaded bytes represent a raster image rather than a PDF."""
    ext = Path(filename or "").suffix.lower()
    if ext in IMAGE_EXTENSIONS:
        return True
    if raw_bytes.startswith((b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n", b"RIFF", b"BM", b"II*\x00", b"MM\x00*")):
        return True
    return False


def normalize_input_to_pdf(raw_bytes: bytes, filename: Optional[str], out_pdf: Path) -> tuple[Path, bool]:
    """
    Ensure converter input is a PDF on disk. Converts JPG/PNG/WebP/TIFF (including
    multi-page TIFFs and EXIF-rotated phone scans) cleanly to an A4-scaled PDF using
    lossless `img2pdf` framing (avoids PyMuPDF `insert_image` blank-stream edge bugs).
    Returns (pdf_path, was_image).
    """
    if not is_image_upload(filename, raw_bytes):
        out_pdf.write_bytes(raw_bytes)
        return out_pdf, False

    frame_streams: list[bytes] = []
    pil_img = Image.open(io.BytesIO(raw_bytes))
    n_frames = getattr(pil_img, "n_frames", 1)
    first_landscape = False

    for frame_idx in range(n_frames):
        if n_frames > 1:
            pil_img.seek(frame_idx)
        frame = ImageOps.exif_transpose(pil_img)
        if frame.mode not in ("RGB", "L"):
            bg = Image.new("RGB", frame.size, (255, 255, 255))
            if frame.mode == "RGBA":
                bg.paste(frame, mask=frame.split()[3])
            else:
                bg.paste(frame.convert("RGB"))
            frame = bg
        elif frame.mode == "L":
            frame = frame.convert("RGB")

        w_px, h_px = frame.size
        if w_px < 8 or h_px < 8:
            continue
        if frame_idx == 0 and w_px > h_px:
            first_landscape = True

        buf = io.BytesIO()
        frame.save(buf, format="PNG", optimize=False)
        frame_streams.append(buf.getvalue())

    if not frame_streams:
        raise ValueError("Uploaded image contains no valid frames.")

    target_w_pt = 842.0 if first_landscape else 595.0
    layout_fn = img2pdf.get_layout_fun(pagesize=(target_w_pt, None))
    pdf_bytes = img2pdf.convert(frame_streams, layout_fun=layout_fn)
    out_pdf.write_bytes(pdf_bytes)
    return out_pdf, True


def is_page_raster_scan(page: fitz.Page) -> bool:
    """
    Accurately determine whether a PDF page is a raw scan OR an OCR-layered scanned page
    (`render_mode=3`, GlyphLessFont, pro_ocr, or full-page camera photo with invisible text),
    versus a genuine native digital PDF.
    """
    text = page.get_text("text").strip()
    if len(text) < 25:
        return True

    page_area = max(1.0, float(page.rect.width * page.rect.height))

    # Measure raster image coverage
    max_img_cov = 0.0
    total_img_cov = 0.0
    try:
        for info in page.get_image_info(xrefs=False):
            bbox = info.get("bbox")
            if not bbox:
                continue
            ix0, iy0, ix1, iy1 = bbox
            area = max(0.0, (min(page.rect.x1, ix1) - max(page.rect.x0, ix0)) * (min(page.rect.y1, iy1) - max(page.rect.y0, iy0)))
            cov = area / page_area
            max_img_cov = max(max_img_cov, cov)
            total_img_cov += cov
    except Exception:
        pass

    if max_img_cov < 0.45 and total_img_cov < 0.55:
        # Insufficient raster backdrop to be a full-page scan
        return False

    # Inspect fonts for known OCR hidden-text engines (Tesseract GlyphLessFont / OCRmyPDF / ProOCR)
    try:
        fonts = page.get_fonts(full=True)
        font_names = " ".join(str(f[3] or f[4] or "") for f in fonts).lower()
        if "glyphless" in font_names:
            return True
    except Exception:
        pass

    # Inspect page content streams for `3 Tr` invisible text render mode paired with large scan image
    doc = page.parent
    if doc is not None:
        try:
            for xref in page.get_contents():
                stream = doc.xref_stream(xref)
                if not stream:
                    continue
                if re.search(rb"(?:^|[\s\n])3\s+Tr(?:$|[\s\n])", stream):
                    return True
        except Exception:
            pass

    # Fallback check: full-page raster (>= 70% area) + minimal vector stroke paths (< 10 drawings)
    try:
        drawings = page.get_drawings()
        if max_img_cov >= 0.70 and len(drawings) < 10:
            # Check whether all text uses basic synthetic fonts (Helv / Type3) vs native styled fonts
            fonts = page.get_fonts(full=True)
            if len(fonts) <= 2:
                return True
    except Exception:
        pass

    return False


def is_pdf_scanned_or_raster(pdf_path: Path) -> bool:
    """Return True if >50% of pages in the PDF are raw scans or OCR'd scan images."""
    try:
        doc = fitz.open(str(pdf_path))
        total = len(doc)
        if total == 0:
            doc.close()
            return False
        scanned = sum(1 for page in doc if is_page_raster_scan(page))
        doc.close()
        return (scanned / total) > 0.5 or (total == 1 and scanned == 1)
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Color, Font-Size & Stroke Helpers
# ---------------------------------------------------------------------------


def _sample_word_ink_metrics(
    img_bgr: np.ndarray, x0: int, y0: int, x1: int, y1: int
) -> tuple[tuple[int, int, int], float, int]:
    """Return dominant ink RGB, dark-stroke area ratio, and neutral-ink core height in px."""
    ih, iw = img_bgr.shape[:2]
    ax0 = max(0, min(iw - 1, int(round(x0))))
    ay0 = max(0, min(ih - 1, int(round(y0))))
    ax1 = max(ax0 + 1, min(iw, int(round(x1))))
    ay1 = max(ay0 + 1, min(ih, int(round(y1))))
    crop = img_bgr[ay0:ay1, ax0:ax1]
    raw_h = max(1, ay1 - ay0)
    if crop.size == 0:
        return (17, 24, 39), 0.0, raw_h

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    bg_luma = float(np.percentile(gray, 82))
    dark_mask = gray < min(175.0, max(60.0, bg_luma * 0.78))
    if np.sum(dark_mask) < 4:
        return (17, 24, 39), 0.0, raw_h

    # Ignore bright green/yellow stamp/checkmark strokes when measuring vertical text core height
    b_ch = crop[:, :, 0].astype(np.int16)
    g_ch = crop[:, :, 1].astype(np.int16)
    r_ch = crop[:, :, 2].astype(np.int16)
    green_mark = (g_ch > r_ch + 20) & (g_ch > b_ch + 20)
    neutral_dark = dark_mask & (~green_mark)
    ink_for_h = neutral_dark if np.sum(neutral_dark) >= 6 else dark_mask

    row_counts = np.sum(ink_for_h, axis=1)
    peak_val = int(np.max(row_counts)) if row_counts.size else 0
    if peak_val >= 2:
        peak_r = int(np.argmax(row_counts))
        band_thresh = max(2, int(crop.shape[1] * 0.14), int(peak_val * 0.26))
        top_r, bot_r = peak_r, peak_r
        for rr in range(peak_r - 1, -1, -1):
            if row_counts[rr] >= band_thresh:
                top_r = rr
            else:
                break
        for rr in range(peak_r + 1, raw_h):
            if row_counts[rr] >= band_thresh:
                bot_r = rr
            else:
                break
        core_h = int(bot_r - top_r + 1)
    else:
        core_h = raw_h
    core_h = max(4, min(raw_h, core_h))

    # Sample darker stroke core (28th percentile) so anti-aliased thin strokes on yellow/warm scans
    # don't inherit paper tan/olive tint while colored ink stays accurate
    ink_ratio = float(np.mean(ink_for_h))
    pixels = crop[ink_for_h]
    core_bgr = np.percentile(pixels, 28, axis=0)
    r, g, b = int(core_bgr[2]), int(core_bgr[1]), int(core_bgr[0])
    spread = max(r, g, b) - min(r, g, b)
    if (max(r, g, b) < 105 and spread < 32) or (min(r, g, b) < 120 and max(r, g, b) < 175 and spread < 75):
        rgb = (17, 24, 39)
    else:
        rgb = (r, g, b)
    return rgb, ink_ratio, core_h


def _sample_ink_color_and_bold(
    img_bgr: np.ndarray, x0: int, y0: int, x1: int, y1: int
) -> tuple[tuple[int, int, int], bool]:
    """Estimate dominant ink RGB and stroke boldness from a word box crop."""
    rgb, ink_ratio, _ = _sample_word_ink_metrics(img_bgr, x0, y0, x1, y1)
    is_bold = ink_ratio > 0.36 and (y1 - y0) >= 12
    return rgb, is_bold


def _estimate_word_font_size(
    words_px: list[OCRWord], px_to_pt: float, img_bgr: Optional[np.ndarray] = None
) -> dict[int, float]:
    """Normalize height jitter along horizontal lines while preserving distinct heading sizes."""
    if not words_px:
        return {}
    raw_pts = [max(7.5, (w.y1 - w.y0) * px_to_pt * 0.94) for w in words_px]
    # Compute typical body height (40th percentile) to gently clamp wild box outliers
    sorted_pts = sorted(raw_pts)
    body_pt = sorted_pts[max(0, int(len(sorted_pts) * 0.40))]
    body_pt = max(9.0, min(12.5, body_pt))
    snap_tol = max(3.2, body_pt * 0.32)
    out: dict[int, float] = {}
    for idx, pt in enumerate(raw_pts):
        eff_pt = pt
        w = words_px[idx]
        if img_bgr is not None and pt > body_pt + snap_tol:
            _, _, core_h = _sample_word_ink_metrics(img_bgr, w.x0, w.y0, w.x1, w.y1)
            eff_pt = max(7.5, min(pt, core_h * px_to_pt * 0.94))
        txt_len = len((w.text or "").strip())
        if txt_len >= 5 and eff_pt > body_pt + snap_tol:
            char_w_pt = ((w.x1 - w.x0) * px_to_pt) / float(txt_len)
            eff_pt = min(eff_pt, max(body_pt, char_w_pt * 2.35))
        if abs(eff_pt - body_pt) <= snap_tol:
            out[idx] = round(body_pt * 2.0) / 2.0
        else:
            out[idx] = round(min(22.0, eff_pt) * 2.0) / 2.0
    return out


def _rect_iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    ix0, iy0 = max(ax0, bx0), max(ay0, by0)
    ix1, iy1 = min(ax1, bx1), min(ay1, by1)
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    inter = (ix1 - ix0) * (iy1 - iy0)
    area_a = max(1e-6, (ax1 - ax0) * (ay1 - ay0))
    area_b = max(1e-6, (bx1 - bx0) * (by1 - by0))
    return inter / min(area_a, area_b)


def _point_in_box(cx: float, cy: float, box: tuple[float, float, float, float], pad: float = 0.0) -> bool:
    return (box[0] - pad) <= cx <= (box[2] + pad) and (box[1] - pad) <= cy <= (box[3] + pad)


# ---------------------------------------------------------------------------
# Morphological Table Grid & Merged-Cell Topology Solver
# ---------------------------------------------------------------------------


def _cluster_peaks(indices: np.ndarray, max_gap: int = 5) -> list[int]:
    """Cluster adjacent projection indices into sorted single line coordinates."""
    if len(indices) == 0:
        return []
    clusters: list[list[int]] = [[int(indices[0])]]
    for val in indices[1:]:
        v = int(val)
        if v - clusters[-1][-1] <= max_gap:
            clusters[-1].append(v)
        else:
            clusters.append([v])
    return [int(round(sum(c) / len(c))) for c in clusters]


def _extract_table_line_masks(img_bgr: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    Build clean binary horizontal & vertical line masks resilient to colored watermarks,
    uneven lighting, dark-shaded header bands, and double-edged thick strokes.
    """
    h, w = img_bgr.shape[:2]
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    # Detect 2D solid dark-filled cells (e.g. maroon/navy header strips) BEFORE morphological line isolation
    # so adaptiveThreshold halos & bright white letters inside dark bands never spawn fake interior borders.
    dark_raw = (gray < 145).astype(np.uint8) * 255
    dark_fill = cv2.morphologyEx(dark_raw, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (14, 14)))
    del dark_raw
    has_dark_fill = bool(np.any(dark_fill))

    # Local adaptive binary captures faint and dark gridlines on light backgrounds
    block = max(15, (min(h, w) // 48) | 1)
    block = min(block, 31)
    thin_net = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, blockSize=block, C=6
    )
    if has_dark_fill:
        dark_interior = cv2.erode(dark_fill, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)))
        cv2.bitwise_not(dark_interior, dst=dark_interior)
        cv2.bitwise_and(thin_net, dark_interior, dst=thin_net)
        del dark_interior

    # Suppress Devanagari shirorekhas (~40-65px) and short white glyphs while keeping genuine table gridlines
    hk_len = max(68, int(w * 0.052))
    vk_len = max(46, int(h * 0.028))

    # Morphological horizontal & vertical line isolation from thin_net
    h_lines = cv2.morphologyEx(thin_net, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (hk_len, 1)), iterations=1)
    h_lines = cv2.dilate(h_lines, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 3)), iterations=1)

    v_lines = cv2.morphologyEx(thin_net, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, vk_len)), iterations=1)
    v_lines = cv2.dilate(v_lines, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 5)), iterations=1)
    del thin_net

    bright_text_mask: Optional[np.ndarray] = None
    if has_dark_fill:
        bright_in_dark = cv2.bitwise_and((gray > 155).astype(np.uint8) * 255, dark_fill)
        bright_h_line = cv2.morphologyEx(bright_in_dark, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (hk_len, 1)))
        bright_v_line = cv2.morphologyEx(bright_in_dark, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, vk_len)))
        bright_border = cv2.bitwise_or(bright_h_line, bright_v_line)
        del bright_h_line, bright_v_line
        bright_text = cv2.subtract(bright_in_dark, bright_border)
        del bright_in_dark, bright_border
        bright_text_mask = cv2.dilate(bright_text, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)))
        cv2.bitwise_not(bright_text_mask, dst=bright_text_mask)
        del bright_text

    # Restore horizontal border transitions of dark-filled header cells (thresholds <= 38 fit in uint8 convertScaleAbs)
    grad_y_16 = cv2.Sobel(gray, cv2.CV_16S, 0, 1, ksize=3)
    abs_gy = cv2.convertScaleAbs(grad_y_16)
    del grad_y_16
    gy_raw = (np.where(dark_fill > 0, (abs_gy > 18), (abs_gy > 38))).astype(np.uint8) * 255
    del abs_gy
    if bright_text_mask is not None:
        cv2.bitwise_and(gy_raw, bright_text_mask, dst=gy_raw)
    gy_lines = cv2.morphologyEx(gy_raw, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (hk_len, 1)), iterations=1)
    del gy_raw
    gy_lines = cv2.dilate(gy_lines, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)), iterations=1)
    cv2.bitwise_or(h_lines, gy_lines, dst=h_lines)
    del gy_lines

    # Also keep strong vertical border transitions separating adjacent dark filled cells (masked against white text)
    grad_x_16 = cv2.Sobel(gray, cv2.CV_16S, 1, 0, ksize=3)
    abs_gx = cv2.convertScaleAbs(grad_x_16)
    del grad_x_16, gray
    gx_raw = (np.where(dark_fill > 0, (abs_gx > 18), (abs_gx > 38))).astype(np.uint8) * 255
    del abs_gx, dark_fill
    if bright_text_mask is not None:
        cv2.bitwise_and(gx_raw, bright_text_mask, dst=gx_raw)
        del bright_text_mask
    gx_lines = cv2.morphologyEx(gx_raw, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, vk_len)), iterations=1)
    del gx_raw
    gx_lines = cv2.dilate(gx_lines, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)), iterations=1)
    cv2.bitwise_or(v_lines, gx_lines, dst=v_lines)
    del gx_lines

    return h_lines, v_lines


def _extract_vector_table_masks(
    page: fitz.Page, iw: int, ih: int, inv_scale: float
) -> tuple[np.ndarray, np.ndarray]:
    """
    Rasterize genuine vector table border strokes (`l` and `re` items from `page.get_drawings()`)
    into binary horizontal & vertical masks at native raster resolution, capturing 0.5pt light-gray
    internal cell hairlines missed by morphological OCR thresholding while ignoring text/logos/barcodes.
    """
    vec_h = np.zeros((ih, iw), dtype=np.uint8)
    vec_v = np.zeros((ih, iw), dtype=np.uint8)
    pw = max(1.0, float(page.rect.width))
    ph = max(1.0, float(page.rect.height))
    try:
        drawings = page.get_drawings()
    except Exception:
        return vec_h, vec_v

    def _draw_h(x0_pt: float, x1_pt: float, y_pt: float) -> None:
        lx0, lx1 = sorted((x0_pt, x1_pt))
        if lx1 - lx0 < 12.0 or lx1 - lx0 > pw * 0.96:
            return
        px0 = max(0, min(iw - 1, int(round(lx0 * inv_scale))))
        px1 = max(0, min(iw - 1, int(round(lx1 * inv_scale))))
        py = max(0, min(ih - 1, int(round(y_pt * inv_scale))))
        cv2.line(vec_h, (px0, py), (px1, py), 255, thickness=2)

    def _draw_v(y0_pt: float, y1_pt: float, x_pt: float) -> None:
        ly0, ly1 = sorted((y0_pt, y1_pt))
        if ly1 - ly0 < 9.0 or ly1 - ly0 > ph * 0.92:
            return
        py0 = max(0, min(ih - 1, int(round(ly0 * inv_scale))))
        py1 = max(0, min(ih - 1, int(round(ly1 * inv_scale))))
        px = max(0, min(iw - 1, int(round(x_pt * inv_scale))))
        cv2.line(vec_v, (px, py0), (px, py1), 255, thickness=2)

    for dr in drawings:
        col = dr.get("color")
        fill_col = dr.get("fill")
        fill_op = float(dr.get("fill_opacity", 1.0) or 1.0)
        lw = float(dr.get("width", 1.0) or 1.0)
        dashes = str(dr.get("dashes") or "").strip()

        # Respect PDF Painter's Order: an opaque/light filled rectangle painted after earlier
        # borders occludes covered internal grid lines (e.g. footer box spanning left 3 signature columns)
        if fill_col is not None and fill_op >= 0.45:
            for it in dr.get("items") or []:
                if it[0] == "re" and len(it) >= 2:
                    rb = it[1]
                    rw_pt, rh_pt = float(rb.width), float(rb.height)
                    if rw_pt >= 16.0 and rh_pt >= 8.0 and not (rw_pt > pw * 0.90 and rh_pt > ph * 0.85):
                        fx0 = max(0, min(iw, int(round(float(rb.x0) * inv_scale)) + 3))
                        fx1 = max(0, min(iw, int(round(float(rb.x1) * inv_scale)) - 3))
                        fy0 = max(0, min(ih, int(round(float(rb.y0) * inv_scale)) + 3))
                        fy1 = max(0, min(ih, int(round(float(rb.y1) * inv_scale)) - 3))
                        if fx1 > fx0 and fy1 > fy0:
                            vec_h[fy0:fy1, fx0:fx1] = 0
                            vec_v[fy0:fy1, fx0:fx1] = 0

        if col is None or lw > 3.2:
            continue
        # Skip dashed cut lines (`Tear from here`) and brightly chromatic crests
        if dashes and dashes not in ("[] 0", "none", "None"):
            continue
        if len(col) >= 3 and (max(col[:3]) - min(col[:3])) > 0.28 and (col[0] > col[2] + 0.25):
            continue
        rr = dr.get("rect")
        if rr is not None and rr.width > pw * 0.90 and rr.height > ph * 0.85:
            # Skip full-page decorative outer frame
            continue
        for it in dr.get("items") or []:
            kind = it[0]
            if kind == "l" and len(it) >= 3:
                p1, p2 = it[1], it[2]
                dx, dy = abs(float(p2.x) - float(p1.x)), abs(float(p2.y) - float(p1.y))
                if dy <= 1.2 and dx >= 12.0:
                    _draw_h(float(p1.x), float(p2.x), (float(p1.y) + float(p2.y)) * 0.5)
                elif dx <= 1.2 and dy >= 9.0:
                    _draw_v(float(p1.y), float(p2.y), (float(p1.x) + float(p2.x)) * 0.5)
            elif kind == "re" and len(it) >= 2:
                rb = it[1]
                rw_pt, rh_pt = float(rb.width), float(rb.height)
                if rw_pt < 8.0 or rh_pt < 8.0 or (rw_pt > pw * 0.90 and rh_pt > ph * 0.85):
                    continue
                _draw_h(float(rb.x0), float(rb.x1), float(rb.y0))
                _draw_h(float(rb.x0), float(rb.x1), float(rb.y1))
                _draw_v(float(rb.y0), float(rb.y1), float(rb.x0))
                _draw_v(float(rb.y0), float(rb.y1), float(rb.x1))
    return vec_h, vec_v


def _solve_component_grid(
    h_roi: np.ndarray,
    v_roi: np.ndarray,
    tx0: int,
    ty0: int,
    tx1: int,
    ty1: int,
    vec_v_roi: Optional[np.ndarray] = None,
) -> Optional[tuple[list[int], list[int], list[tuple[int, int, int, int]]]]:
    """
    Reconstruct rows_y, cols_x, and merged rectangles (r0, c0, r1, c1) for one
    candidate table ROI (in image coordinates relative to origin, returning global coords).
    Returns None if ROI does not represent a multi-cell structured grid.
    """
    rh, rw = h_roi.shape[:2]
    if rh < 24 or rw < 60:
        return None

    # Horizontal & vertical ink projection ratios with minimum pixel support so residual 0.2 deg tilt
    # merges cleanly and 10px glyph specks inside dark headers never trigger fake columns.
    row_proj = np.sum(h_roi > 0, axis=1).astype(np.float32) / max(1.0, float(rw))
    col_proj = np.sum(v_roi > 0, axis=0).astype(np.float32) / max(1.0, float(rh))

    min_row_frac = max(0.12, min(0.20, 30.0 / max(1.0, float(rw))))
    min_col_frac = max(0.11, min(0.24, 26.0 / max(1.0, float(rh))))

    rows_rel = _cluster_peaks(np.where(row_proj >= min_row_frac)[0], max_gap=max(6, min(13, rh // 55)))
    cols_rel = _cluster_peaks(np.where(col_proj >= min_col_frac)[0], max_gap=max(6, min(13, rw // 55)))

    # Guard against Devanagari shirorekhas / wavy lines producing fake dense grids:
    # a genuine bordered table requires at least 2 strong spanning horizontal and 2 vertical rails.
    strong_rows = sum(
        1 for r in rows_rel if float(np.max(row_proj[max(0, r - 3) : min(rh, r + 4)])) >= 0.44
    )
    strong_cols = sum(
        1 for c in cols_rel if float(np.max(col_proj[max(0, c - 3) : min(rw, c + 4)])) >= 0.38
    )
    if strong_rows < 2 or strong_cols < 2:
        return None

    # Also capture authentic single-row vertical cell hairlines (from PDF vector drawings)
    # that span a full row height (< 11% of a tall multi-row form table)
    vec_col_set: set[int] = set()
    if vec_v_roi is not None and vec_v_roi.shape[:2] == (rh, rw) and len(rows_rel) >= 2:
        vec_peaks_raw: list[int] = []
        min_seg_px = max(12, int(rh * 0.025))
        for r_i in range(len(rows_rel) - 1):
            ry_a, ry_b = rows_rel[r_i], rows_rel[r_i + 1]
            r_span = ry_b - ry_a
            if r_span < min_seg_px:
                continue
            row_vec_frac = np.mean(vec_v_roi[ry_a + 1 : max(ry_a + 2, ry_b - 1), :] > 0, axis=0)
            xs_row = np.where(row_vec_frac >= 0.72)[0]
            if len(xs_row) > 0:
                # Tighter peak merge (4px) preserves distinct sub-row columns even when 9-16px apart horizontally
                vec_peaks_raw.extend(_cluster_peaks(xs_row, max_gap=4))
        if vec_peaks_raw:
            clustered_vec = _cluster_peaks(np.array(sorted(set(vec_peaks_raw))), max_gap=4)
            vec_col_set = set(clustered_vec)
            # Keep raster columns unless a crisp vector peak already sits right beside them (< 5px)
            merged_cols = list(clustered_vec)
            for c_r in cols_rel:
                if not any(abs(c_r - c_v) <= 5 for c_v in clustered_vec):
                    merged_cols.append(c_r)
            cols_rel = sorted(merged_cols)

    # Ensure outer frame boundaries exist cleanly without creating phantom slivers along slightly tilted borders
    if not rows_rel or rows_rel[0] > 22:
        rows_rel.insert(0, 0)
    if rows_rel[-1] < rh - 23:
        rows_rel.append(rh - 1)

    if not cols_rel or cols_rel[0] > 22:
        cols_rel.insert(0, 0)
    if cols_rel[-1] < rw - 23:
        cols_rel.append(rw - 1)

    # Filter out micro-slivers caused by thick/slightly tilted border strokes while keeping compact spreadsheet rows
    min_row_px = max(11, min(18, rh // 45))
    min_col_px = 7 if vec_col_set else max(14, min(20, rw // 45))
    clean_rows = [rows_rel[0]]
    for ry in rows_rel[1:]:
        if ry - clean_rows[-1] >= min_row_px:
            clean_rows.append(ry)
    if len(clean_rows) >= 2 and (rh - 1) - clean_rows[-1] < min_row_px:
        clean_rows[-1] = rows_rel[-1]

    clean_cols = [cols_rel[0]]
    for cx in cols_rel[1:]:
        step_min = 7 if (vec_col_set and (cx in vec_col_set or clean_cols[-1] in vec_col_set)) else max(14, min(20, rw // 45))
        if cx - clean_cols[-1] >= step_min:
            clean_cols.append(cx)
    if len(clean_cols) >= 2 and (rw - 1) - clean_cols[-1] < min_col_px:
        clean_cols[-1] = cols_rel[-1]

    n_rows = len(clean_rows) - 1
    n_cols = len(clean_cols) - 1
    if n_rows < 2 or n_cols < 2:
        return None

    # Drop any redundant interior row/column split where EVERY cell merges cleanly across it
    # (prevents all-vMerge ghost header rows & redundant OOXML table slices)
    changed_grid = True
    while changed_grid and len(clean_rows) > 2 and len(clean_cols) > 2:
        changed_grid = False
        n_rows = len(clean_rows) - 1
        n_cols = len(clean_cols) - 1

        can_merge_right = np.zeros((n_rows, max(1, n_cols - 1)), dtype=bool)
        half_x = 2 if vec_col_set else 5
        for r in range(n_rows):
            y_a = clean_rows[r] + min(4, max(1, (clean_rows[r + 1] - clean_rows[r]) // 5))
            y_b = clean_rows[r + 1] - min(4, max(1, (clean_rows[r + 1] - clean_rows[r]) // 5))
            if y_b <= y_a:
                y_a, y_b = clean_rows[r], clean_rows[r + 1]
            for c in range(n_cols - 1):
                cx = clean_cols[c + 1]
                prev_cx = clean_cols[c]
                next_cx = clean_cols[c + 2]
                x_a = max(prev_cx + 1, (prev_cx + cx) // 2 + 1, cx - half_x)
                x_b = min(next_cx, (cx + next_cx) // 2, cx + half_x + 1)
                if x_b <= x_a:
                    x_a = max(0, cx - 1)
                    x_b = min(rw, cx + 2)
                strip = v_roi[y_a:y_b, x_a:x_b]
                if strip.size == 0:
                    can_merge_right[r, c] = True
                else:
                    ink_frac = float(np.mean(np.max(strip > 0, axis=1)))
                    can_merge_right[r, c] = ink_frac < 0.42

        can_merge_down = np.zeros((max(1, n_rows - 1), n_cols), dtype=bool)
        for r in range(n_rows - 1):
            ry = clean_rows[r + 1]
            y_a, y_b = max(0, ry - 5), min(rh, ry + 6)
            for c in range(n_cols):
                x_a = clean_cols[c] + min(4, max(1, (clean_cols[c + 1] - clean_cols[c]) // 5))
                x_b = clean_cols[c + 1] - min(4, max(1, (clean_cols[c + 1] - clean_cols[c]) // 5))
                if x_b <= x_a:
                    x_a, x_b = clean_cols[c], clean_cols[c + 1]
                strip = h_roi[y_a:y_b, x_a:x_b]
                if strip.size == 0:
                    can_merge_down[r, c] = True
                else:
                    ink_frac = float(np.mean(np.max(strip > 0, axis=0)))
                    can_merge_down[r, c] = ink_frac < 0.42

        bad_r = [r for r in range(n_rows - 1) if bool(np.all(can_merge_down[r, :]))]
        bad_c = [c for c in range(n_cols - 1) if bool(np.all(can_merge_right[:, c]))]
        if bad_r or bad_c:
            keep_rows = [clean_rows[0]] + [clean_rows[i + 1] for i in range(n_rows - 1) if i not in bad_r] + [clean_rows[-1]]
            keep_cols = [clean_cols[0]] + [clean_cols[i + 1] for i in range(n_cols - 1) if i not in bad_c] + [clean_cols[-1]]
            if len(keep_rows) >= 3 and len(keep_cols) >= 3:
                clean_rows, clean_cols = keep_rows, keep_cols
                changed_grid = True
            else:
                return None

    n_rows = len(clean_rows) - 1
    n_cols = len(clean_cols) - 1
    if n_rows < 2 or n_cols < 2:
        return None

    # Greedy rectangular union topological solver -> non-overlapping exact spans (r0, c0, r1, c1)
    visited = np.zeros((n_rows, n_cols), dtype=bool)
    spans: list[tuple[int, int, int, int]] = []
    for r0 in range(n_rows):
        for c0 in range(n_cols):
            if visited[r0, c0]:
                continue
            c1 = c0 + 1
            while c1 < n_cols and not visited[r0, c1] and can_merge_right[r0, c1 - 1]:
                c1 += 1

            r1 = r0 + 1
            while r1 < n_rows:
                # Every sub-column in [c0..c1) must have no bottom wall AND match vertical open continuity
                ok = True
                for c in range(c0, c1):
                    if visited[r1, c] or not can_merge_down[r1 - 1, c]:
                        ok = False
                        break
                if ok:
                    # Also ensure internal right-merges match across this row so span stays rectangular
                    for c in range(c0, c1 - 1):
                        if not can_merge_right[r1, c]:
                            ok = False
                            break
                if ok and c1 < n_cols and can_merge_right[r1, c1 - 1]:
                    # Adjacent row merges wider right than r0; stop vertical merge cleanly to preserve shape
                    pass
                if not ok:
                    break
                r1 += 1

            visited[r0:r1, c0:c1] = True
            spans.append((r0, c0, r1, c1))

    rows_abs = [ty0 + ry for ry in clean_rows]
    cols_abs = [tx0 + cx for cx in clean_cols]
    return rows_abs, cols_abs, spans


def _detect_raw_table_rois(
    img_bgr: np.ndarray,
    *,
    pdf_page: Optional[fitz.Page] = None,
    inv_pt_to_px: float = 0.0,
) -> list[tuple[list[int], list[int], list[tuple[int, int, int, int]]]]:
    """
    Detect table ROIs on a deskewed page image, automatically augmenting with vector border
    hairlines on born-digital pages and splitting outer certificate frames so internal tables
    and prose bodies are cleanly separated.
    """
    ih, iw = img_bgr.shape[:2]
    h_lines, v_lines = _extract_table_line_masks(img_bgr)
    vec_v: Optional[np.ndarray] = None
    if pdf_page is not None and inv_pt_to_px > 0:
        # Suppress fake morphological borders extracted from embedded photos/barcodes before fusing exact vector strokes
        pw_pt = max(1.0, float(pdf_page.rect.width))
        ph_pt = max(1.0, float(pdf_page.rect.height))
        try:
            for im_info in pdf_page.get_image_info(xrefs=False) or []:
                ibb = im_info.get("bbox")
                if not ibb or len(ibb) < 4:
                    continue
                ix0_pt, iy0_pt, ix1_pt, iy1_pt = float(ibb[0]), float(ibb[1]), float(ibb[2]), float(ibb[3])
                rw_pt, rh_pt = ix1_pt - ix0_pt, iy1_pt - iy0_pt
                if rw_pt >= 34.0 and rh_pt >= 28.0 and rw_pt < pw_pt * 0.78 and rh_pt < ph_pt * 0.78:
                    px0 = max(0, int(round(ix0_pt * inv_pt_to_px)) - 4)
                    py0 = max(0, int(round(iy0_pt * inv_pt_to_px)) - 4)
                    px1 = min(iw, int(round(ix1_pt * inv_pt_to_px)) + 4)
                    py1 = min(ih, int(round(iy1_pt * inv_pt_to_px)) + 4)
                    if px1 > px0 and py1 > py0:
                        h_lines[py0:py1, px0:px1] = 0
                        v_lines[py0:py1, px0:px1] = 0
        except Exception:
            pass
        vec_h, vec_v = _extract_vector_table_masks(pdf_page, iw, ih, inv_pt_to_px)
        cv2.bitwise_or(h_lines, vec_h, dst=h_lines)
        del vec_h
        cv2.bitwise_or(v_lines, vec_v, dst=v_lines)
    combined = cv2.bitwise_or(h_lines, v_lines)
    combined = cv2.dilate(combined, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)), iterations=1)

    num_labels, _lbl, stats, _ = cv2.connectedComponentsWithStats(combined, connectivity=8)
    del combined, _lbl
    candidate_boxes: list[tuple[int, int, int, int]] = []
    for lbl in range(1, num_labels):
        bx = int(stats[lbl, cv2.CC_STAT_LEFT])
        by = int(stats[lbl, cv2.CC_STAT_TOP])
        bw = int(stats[lbl, cv2.CC_STAT_WIDTH])
        bh = int(stats[lbl, cv2.CC_STAT_HEIGHT])
        if bw < max(70, int(iw * 0.18)) or bh < 28:
            continue
        candidate_boxes.append((bx, by, bx + bw, by + bh))

    # Peel outer certificate border wrappers before component grouping:
    # Any box spanning >65% width and >28% height that has sparse vertical columns or
    # long edge-frame rails connecting distant regions (e.g. RBSE double frame) is unwrapped.
    def _peel_box_rails(h_m: np.ndarray, v_m: np.ndarray, bx0: int, by0: int, bx1: int, by1: int) -> None:
        bw, bh = bx1 - bx0, by1 - by0
        pad_x = max(14, min(48, int(bw * 0.048)))
        pad_y = max(12, min(42, int(bh * 0.042)))
        h_m[by0:by0 + pad_y, bx0:bx1] = 0
        h_m[by1 - pad_y:by1, bx0:bx1] = 0
        v_m[by0:by1, bx0:bx0 + pad_x] = 0
        v_m[by0:by1, bx1 - pad_x:bx1] = 0
        # Also zero edge border lines inside outer strips along height/width
        v_m[by0:by0 + pad_y, bx0:bx1] = 0
        v_m[by1 - pad_y:by1, bx0:bx1] = 0
        h_m[by0:by1, bx0:bx0 + pad_x] = 0
        h_m[by0:by1, bx1 - pad_x:bx1] = 0

    def _collect_components(h_m: np.ndarray, v_m: np.ndarray, roi: tuple[int, int, int, int]) -> list[tuple[int, int, int, int]]:
        rx0, ry0, rx1, ry1 = roi
        sub_c = cv2.bitwise_or(h_m[ry0:ry1, rx0:rx1], v_m[ry0:ry1, rx0:rx1])
        sub_c = cv2.dilate(sub_c, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)), iterations=1)
        sn, _, s_stats, _ = cv2.connectedComponentsWithStats(sub_c, connectivity=8)
        out: list[tuple[int, int, int, int]] = []
        for sl in range(1, sn):
            sx = int(s_stats[sl, cv2.CC_STAT_LEFT])
            sy = int(s_stats[sl, cv2.CC_STAT_TOP])
            sw = int(s_stats[sl, cv2.CC_STAT_WIDTH])
            sh = int(s_stats[sl, cv2.CC_STAT_HEIGHT])
            if sw >= max(160, int(iw * 0.22)) and sh >= 28:
                out.append((rx0 + sx, ry0 + sy, rx0 + sx + sw, ry0 + sy + sh))
        return out

    # Initial threshold: skip small non-table graphic widgets (QR codes, stamps, photos < 22% width)
    candidate_boxes = [
        b for b in candidate_boxes
        if (b[2] - b[0]) >= max(160, int(iw * 0.22)) and (b[3] - b[1]) >= 28
    ]

    # Initial pass: peel giant full-page certificate borders if peeling yields sub-components
    unwrapped_boxes: list[tuple[int, int, int, int]] = []
    for bx0, by0, bx1, by1 in candidate_boxes:
        bw, bh = bx1 - bx0, by1 - by0
        if bw > iw * 0.68 and bh > ih * 0.55:
            h_tmp = h_lines.copy()
            v_tmp = v_lines.copy()
            _peel_box_rails(h_tmp, v_tmp, bx0, by0, bx1, by1)
            sub_boxes = _collect_components(h_tmp, v_tmp, (bx0, by0, bx1, by1))
            if len(sub_boxes) >= 2:
                h_lines, v_lines = h_tmp, v_tmp
                unwrapped_boxes.extend(sub_boxes)
                continue
        unwrapped_boxes.append((bx0, by0, bx1, by1))

    # Deduplicate overlapping / nested concentric table bboxes (keep LARGER outer table only)
    deduped_boxes: list[tuple[int, int, int, int]] = []
    for cand in sorted(unwrapped_boxes, key=lambda b: -(b[2] - b[0]) * (b[3] - b[1])):
        cw, ch = cand[2] - cand[0], cand[3] - cand[1]
        if cw < max(70, int(iw * 0.16)) or ch < 24:
            continue
        if any(_rect_iou(cand, kept) > 0.35 for kept in deduped_boxes):
            continue
        deduped_boxes.append(cand)

    def _is_wrapper_grid(grid: tuple[list[int], list[int], list[tuple[int, int, int, int]]]) -> list[tuple[int, int]]:
        """Return open non-table vertical ranges (y0, y1) inside a certificate wrapper box."""
        rows_abs, cols_abs, spans = grid
        grid_w = max(1, cols_abs[-1] - cols_abs[0])
        bad_yranges: list[tuple[int, int]] = []
        for r0, c0, r1, c1 in spans:
            sh_px = rows_abs[r1] - rows_abs[r0]
            sw_px = cols_abs[c1] - cols_abs[c0]
            # Giant tall block (> 12% page height) holding emblem/header/photo OR wide un-split body block
            if (sh_px > ih * 0.12 and sw_px > grid_w * 0.38) or (sw_px >= grid_w * 0.80 and sh_px > ih * 0.065):
                bad_yranges.append((rows_abs[r0], rows_abs[r1]))
        return bad_yranges

    solved_grids: list[tuple[list[int], list[int], list[tuple[int, int, int, int]]]] = []
    pending_boxes = sorted(deduped_boxes, key=lambda b: (b[1], b[0]))
    seen_wrap: set[tuple[int, int, int, int]] = set()

    for box in pending_boxes:
        bx0, by0, bx1, by1 = box
        grid = _solve_component_grid(
            h_lines[by0:by1, bx0:bx1],
            v_lines[by0:by1, bx0:bx1],
            bx0,
            by0,
            bx1,
            by1,
            vec_v_roi=(vec_v[by0:by1, bx0:bx1] if vec_v is not None else None),
        )
        if grid is None:
            continue
        rows_abs, cols_abs, spans = grid
        bad_yranges = _is_wrapper_grid(grid)
        total_bad_h = sum(y1 - y0 for y0, y1 in bad_yranges)
        grid_h = max(1, rows_abs[-1] - rows_abs[0])

        # If a wide box mixes giant crest/prose blocks with real internal tables (like RBSE top/bottom halves),
        # zero out its outer margin rails & the giant open prose bands, then recover clean inner tables only!
        if bad_yranges and (total_bad_h > ih * 0.14 or total_bad_h > grid_h * 0.30) and box not in seen_wrap:
            seen_wrap.add(box)
            # Only peel outer left/right border rails on tall page-wrapper boxes; medium bordered forms keep exact left/right bounds
            if grid_h > ih * 0.45:
                _peel_box_rails(h_lines, v_lines, bx0, by0, bx1, by1)
            for oy0, oy1 in bad_yranges:
                # Zero vertical side rails and non-table internal strokes inside giant open prose rows
                # while keeping the shared top/bottom border adjacent to real tables intact (3px inset).
                iy0 = min(oy1, oy0 + 3)
                iy1 = max(oy0, oy1 - 3)
                if iy1 > iy0:
                    v_lines[iy0:iy1, bx0:bx1] = 0
                    h_lines[iy0:iy1, bx0:bx1] = 0
            sub_cands = _collect_components(h_lines, v_lines, (bx0, by0, bx1, by1))
            for sbx0, sby0, sbx1, sby1 in sorted(sub_cands, key=lambda b: (b[1], b[0])):
                sub_grid = _solve_component_grid(
                    h_lines[sby0:sby1, sbx0:sbx1],
                    v_lines[sby0:sby1, sbx0:sbx1],
                    sbx0,
                    sby0,
                    sbx1,
                    sby1,
                    vec_v_roi=(vec_v[sby0:sby1, sbx0:sbx1] if vec_v is not None else None),
                )
                if sub_grid is None:
                    continue
                s_rows, _, s_spans = sub_grid
                s_bad = _is_wrapper_grid(sub_grid)
                s_bad_h = sum(y1 - y0 for y0, y1 in s_bad)
                if s_bad_h > max(1, s_rows[-1] - s_rows[0]) * 0.45 and len(s_spans) <= 8:
                    continue
                solved_grids.append(sub_grid)
            continue

        # Split off huge open un-columned prose bands inside a small fake wrapper box
        open_giant_rows = [
            sp for sp in spans
            if sp[1] == 0 and sp[3] == len(cols_abs) - 1
            and (rows_abs[sp[2]] - rows_abs[sp[0]]) > ih * 0.16
        ]
        if open_giant_rows and len(spans) <= 4:
            continue
        solved_grids.append(grid)

    del h_lines, v_lines, vec_v
    return solved_grids


# ---------------------------------------------------------------------------
# Per-Cell OCR Recovery + Dark Header Inversion + Text Population
# ---------------------------------------------------------------------------


def _run_focused_cell_ocr(
    cell_bgr: np.ndarray,
    wants_hindi: bool,
    latin_font: fitz.Font,
    dev_font: Optional[fitz.Font],
    ocr_lang: str = "auto",
) -> tuple[list[OCRWord], tuple[int, int, int], bool]:
    """
    Run high-accuracy upscaled OCR on an individual table cell crop.
    Automatically detects dark shaded headers (e.g. maroon/charcoal cells with
    white text) and inverts luminance before OCR.
    Returns (words_in_cell_local_px, bg_rgb, is_dark_bg).
    """
    ch, cw = cell_bgr.shape[:2]
    if ch < 8 or cw < 8:
        return [], (255, 255, 255), False

    # Trim 1px outer seam, detect & erase only actual grid border strokes touching outermost 1-5px edges
    # without ever clipping real glyph stems inside compact cells!
    m = 1 if min(ch, cw) >= 12 else 0
    core = cell_bgr[m:ch - m, m:cw - m] if m > 0 else cell_bgr

    # Estimate dominant background color & luma
    core_gray = cv2.cvtColor(core, cv2.COLOR_BGR2GRAY)
    bg_luma = float(np.percentile(core_gray, 75))
    # Median BGR of brighter half pixels -> clean cell fill tint
    bright_mask = core_gray >= np.percentile(core_gray, 55)
    if np.any(bright_mask):
        bg_bgr = np.median(core[bright_mask], axis=0)
        bg_rgb = (int(bg_bgr[2]), int(bg_bgr[1]), int(bg_bgr[0]))
    else:
        bg_rgb = (255, 255, 255)

    is_dark_bg = bg_luma < 155.0

    # Check if cell has meaningful foreground contrast before spending OCR cycles
    fg_std = float(np.std(core_gray))
    if fg_std < 8.5:
        return [], bg_rgb, is_dark_bg

    # Invert dark shaded header cells so OCR sees black text on white paper
    if is_dark_bg:
        proc = cv2.bitwise_not(core)
        proc = clean_image_for_ocr(proc)
    else:
        proc = clean_image_for_ocr(core)

    # Erase ONLY continuous horizontal/vertical border lines along outer 5px edges (ink frac >= 0.58)
    proc_gray = cv2.cvtColor(proc, cv2.COLOR_BGR2GRAY)
    ph, pw = proc_gray.shape[:2]
    max_edge = min(5, max(1, min(ph, pw) // 8))
    dark_bin = proc_gray < 175
    for r_idx in range(max_edge):
        if float(np.mean(dark_bin[r_idx, :])) >= 0.58:
            proc[r_idx, :] = 255
        if float(np.mean(dark_bin[ph - 1 - r_idx, :])) >= 0.58:
            proc[ph - 1 - r_idx, :] = 255
    for c_idx in range(max_edge):
        if float(np.mean(dark_bin[:, c_idx])) >= 0.58:
            proc[:, c_idx] = 255
        if float(np.mean(dark_bin[:, pw - 1 - c_idx])) >= 0.58:
            proc[:, pw - 1 - c_idx] = 255

    # Clean 1px perimeter seam after edge-line erasure
    proc[:1, :] = 255
    proc[-1:, :] = 255
    proc[:, :1] = 255
    proc[:, -1:] = 255

    # Upscale small/dense cells 2.5x + add white quiet-zone border
    ch2, cw2 = proc.shape[:2]
    scale = min(3.0, max(1.6, 56.0 / max(12.0, float(min(ch2, cw2)))))
    up_w = max(16, min(1400, int(round(cw2 * scale))))
    up_h = max(16, min(900, int(round(ch2 * scale))))
    eff_sx = up_w / float(max(1, cw2))
    eff_sy = up_h / float(max(1, ch2))

    upscaled = cv2.resize(proc, (up_w, up_h), interpolation=cv2.INTER_LANCZOS4)
    if ch2 < 48 or cw2 < 140:
        blur_c = cv2.GaussianBlur(upscaled, (0, 0), 1.0)
        upscaled = cv2.addWeighted(upscaled, 1.32, blur_c, -0.32, 0)
    pad = 14
    padded = cv2.copyMakeBorder(upscaled, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(255, 255, 255))

    # Run RapidOCR first (fast & excels at small digits, marks, punctuation, hyphenated codes)
    words_pad = extract_rapidocr_words(padded, None, latin_font, dev_font)

    # Run Tesseract (--psm 6 block mode) only if non-English language requested OR RapidOCR empty/low conf
    eff_lang = resolve_ocr_lang(ocr_lang) if ocr_lang else "auto"
    needs_tess = (
        wants_hindi
        or (eff_lang not in ("auto", "eng"))
        or not words_pad
        or max((w.conf for w in words_pad), default=0.0) < 0.72
    )
    if needs_tess:
        if eff_lang not in ("auto", "eng"):
            tess_lang = eff_lang
        else:
            tess_lang = "hin+eng" if wants_hindi else "eng"
        tess_words = extract_tesseract_words(padded, lang=tess_lang, psm=6)
        # Filter out noisy border bracket/pipe artifacts (`[`, `]`, `|`, `»`, `[=`, etc.)
        cleaned_tess: list[OCRWord] = []
        for tw in tess_words:
            t_txt = re.sub(r"^[\[\]|»«]+(?=[A-Za-z0-9\u0900-\u097F])|(?<=[A-Za-z0-9\u0900-\u097F])[\[\]|»«]+$", "", tw.text.strip())
            if not t_txt or re.fullmatch(r"[\[\]|»«_—~`=+#*]+", t_txt) or tw.conf < 0.45:
                continue
            cleaned_tess.append(OCRWord(t_txt, tw.x0, tw.y0, tw.x1, tw.y1, conf=tw.conf))

        if not words_pad:
            words_pad = cleaned_tess
        elif cleaned_tess:
            merged = list(words_pad)
            for tw in cleaned_tess:
                tbox = (tw.x0, tw.y0, tw.x1, tw.y1)
                dev_letters = _DEV_LETTER_RE.findall(tw.text)
                if len(dev_letters) >= 3 and tw.conf >= 0.56:
                    # Only replace existing crisp pure numeric/ASCII code if Tesseract didn't hallucinate on digits
                    overlaps_ascii_num = any(
                        _rect_iou(tbox, (w.x0, w.y0, w.x1, w.y1)) > 0.25
                        and w.conf >= 0.75
                        and bool(re.fullmatch(r"[\d.,/%+-]{1,8}", w.text.strip()))
                        for w in merged
                    )
                    if not overlaps_ascii_num:
                        merged = [w for w in merged if _rect_iou(tbox, (w.x0, w.y0, w.x1, w.y1)) < 0.25]
                        merged.append(tw)
                elif (
                    tw.conf >= 0.85
                    and re.search(r"[A-Za-z0-9]{2,}", tw.text)
                    and not any(_rect_iou(tbox, (w.x0, w.y0, w.x1, w.y1)) > 0.08 for w in merged)
                ):
                    merged.append(tw)
            words_pad = merged

    # Map coordinates back into original cell_bgr local pixels
    local_words: list[OCRWord] = []
    for w in words_pad:
        txt = w.text.strip().strip("|")
        if not txt:
            continue
        lx0 = max(0.0, (w.x0 - pad) / eff_sx + m)
        ly0 = max(0.0, (w.y0 - pad) / eff_sy + m)
        lx1 = min(float(cw), (w.x1 - pad) / eff_sx + m)
        ly1 = min(float(ch), (w.y1 - pad) / eff_sy + m)
        if lx1 - lx0 < 1.5 or ly1 - ly0 < 2.0:
            continue
        local_words.append(OCRWord(txt, lx0, ly0, lx1, ly1, conf=w.conf))

    return local_words, bg_rgb, is_dark_bg


def _group_words_to_lines(words: list[OCRWord]) -> list[list[OCRWord]]:
    """Cluster words into top-to-bottom horizontal lines, sorted left-to-right per line."""
    if not words:
        return []
    ordered = sorted(words, key=lambda w: ((w.y0 + w.y1) * 0.5, w.x0))
    lines: list[list[OCRWord]] = []
    for w in ordered:
        wy_mid = (w.y0 + w.y1) * 0.5
        wh = max(4.0, w.y1 - w.y0)
        placed = False
        for line in reversed(lines[-4:]):
            ly_mid = sum((lw.y0 + lw.y1) * 0.5 for lw in line) / len(line)
            lh = sum(max(4.0, lw.y1 - lw.y0) for lw in line) / len(line)
            if abs(wy_mid - ly_mid) <= max(4.0, 0.52 * max(wh, lh)):
                # Never merge words stacked vertically in the same X span (separate stacked rows)
                ww = max(4.0, w.x1 - w.x0)
                x_stacked = any(
                    (min(w.x1, lw.x1) - max(w.x0, lw.x0)) > 0.35 * min(ww, max(4.0, lw.x1 - lw.x0))
                    for lw in line
                )
                if not x_stacked:
                    line.append(w)
                    placed = True
                    break
        if not placed:
            lines.append([w])
    for line in lines:
        line.sort(key=lambda w: w.x0)
    lines.sort(key=lambda line: sum(w.y0 for w in line) / len(line))
    return lines


def _detect_borderless_table_grids(
    words_px: list[OCRWord], img_h: int, img_w: int
) -> list[tuple[list[int], list[int], list[tuple[int, int, int, int]]]]:
    """
    Lightweight offline borderless table detector via horizontal row gap splitting
    and consistent multi-column x-interval clustering (`>= 4` aligned rows x `>= 3` columns).
    """
    if len(words_px) < 12 or img_h < 40 or img_w < 40:
        return []
    raw_lines = _group_words_to_lines(words_px)
    if len(raw_lines) < 4:
        return []

    med_h = float(np.median([max(6.0, w.y1 - w.y0) for w in words_px]))
    split_gap = max(20.0, med_h * 1.85)

    row_entries: list[tuple[float, float, list[tuple[float, float, str]]]] = []
    for ln in raw_lines:
        segs: list[list[OCRWord]] = [[ln[0]]]
        for w in ln[1:]:
            if (w.x0 - segs[-1][-1].x1) >= split_gap:
                segs.append([w])
            else:
                segs[-1].append(w)
        if len(segs) >= 3:
            seg_tuples = [
                (min(s.x0 for s in sg), max(s.x1 for s in sg), " ".join(s.text for s in sg))
                for sg in segs
            ]
            # Avoid misclassifying long prose lines with wide accidental spaces
            if all(len(st[2]) <= 56 for st in seg_tuples):
                ry0 = min(w.y0 for w in ln)
                ry1 = max(w.y1 for w in ln)
                row_entries.append((ry0, ry1, seg_tuples))

    if len(row_entries) < 4:
        return []

    # Find longest vertical run of consecutive candidate table rows
    runs: list[list[tuple[float, float, list[tuple[float, float, str]]]]] = []
    cur_run = [row_entries[0]]
    for prev_r, cur_r in zip(row_entries, row_entries[1:]):
        vgap = cur_r[0] - prev_r[1]
        if vgap <= max(45.0, med_h * 3.8):
            cur_run.append(cur_r)
        else:
            runs.append(cur_run)
            cur_run = [cur_r]
    runs.append(cur_run)

    grids: list[tuple[list[int], list[int], list[tuple[int, int, int, int]]]] = []
    for run in runs:
        if len(run) < 4:
            continue
        # Project x-intervals onto a 1D occupancy histogram along page width to discover column gaps
        occ = np.zeros(img_w + 2, dtype=np.int32)
        min_x = float(img_w)
        max_x = 0.0
        for _, _, segs in run:
            for sx0, sx1, _ in segs:
                ix0 = max(0, int(sx0))
                ix1 = min(img_w, int(math.ceil(sx1)))
                if ix1 > ix0:
                    occ[ix0:ix1] += 1
                    min_x = min(min_x, float(ix0))
                    max_x = max(max_x, float(ix1))

        lo = max(0, int(min_x) - 4)
        hi = min(img_w, int(max_x) + 4)
        if hi - lo < 60:
            continue

        zero_runs: list[tuple[int, int]] = []
        in_z = False
        z_start = 0
        for x in range(lo, hi + 1):
            if occ[x] == 0:
                if not in_z:
                    in_z = True
                    z_start = x
            else:
                if in_z:
                    if (x - z_start) >= int(max(12.0, med_h * 0.9)):
                        zero_runs.append((z_start, x))
                    in_z = False

        cols_px = [lo] + [int((za + zb) * 0.5) for za, zb in zero_runs] + [hi]
        cols_px = sorted(set(cols_px))
        if len(cols_px) - 1 < 3 or len(cols_px) - 1 > 16:
            continue

        rows_px: list[int] = [max(0, int(run[0][0] - 4))]
        for r_prev, r_cur in zip(run, run[1:]):
            rows_px.append(int((r_prev[1] + r_cur[0]) * 0.5))
        rows_px.append(min(img_h, int(run[-1][1] + 4)))

        n_r = len(rows_px) - 1
        n_c = len(cols_px) - 1
        spans = [(r, c, r + 1, c + 1) for r in range(n_r) for c in range(n_c)]
        grids.append((rows_px, cols_px, spans))

    return grids


def _ocr_table_cells_batch(
    img_deskewed_bgr: np.ndarray,
    rows_px: list[int],
    cols_px: list[int],
    spans: list[tuple[int, int, int, int]],
    wants_hindi: bool,
    latin_font: fitz.Font,
    dev_font: Optional[fitz.Font],
    ocr_lang: str = "auto",
) -> dict[tuple[int, int, int, int], list[OCRWord]]:
    """
    One-Shot Grid-Expanded Table Canvas OCR:
    Pastes all table cell interiors onto a single white canvas separated by `28px` horizontal
    and `16px` vertical quiet zones (with dark headers inverted and border seams trimmed),
    eliminating cross-border word gluing (`102.33 Ccts`) and border-touching digit loss (`87.46`)
    in a single fast batch pass instead of hundreds of per-cell subprocesses.
    """
    n_rows = len(rows_px) - 1
    n_cols = len(cols_px) - 1
    if n_rows < 1 or n_cols < 1 or not spans:
        return {}

    med_rh = float(np.median([max(4, rows_px[r + 1] - rows_px[r]) for r in range(n_rows)]))
    pad_x = 28
    pad_y = 16
    raw_tbl_w = max(1, cols_px[-1] - cols_px[0])
    raw_tbl_h = max(1, rows_px[-1] - rows_px[0])
    max_fit_w = max(1.0, (4500.0 - pad_x * (n_cols + 1)) / float(raw_tbl_w))
    max_fit_h = max(1.0, (4500.0 - pad_y * (n_rows + 1)) / float(raw_tbl_h))
    scale = min(2.3, 36.0 / max(10.0, med_rh), max_fit_w, max_fit_h) if med_rh < 34.0 else 1.0

    row_offsets = [pad_y]
    for r in range(n_rows):
        rh = max(6, int(round((rows_px[r + 1] - rows_px[r]) * scale)))
        row_offsets.append(row_offsets[-1] + rh + pad_y)

    col_offsets = [pad_x]
    for c in range(n_cols):
        cw = max(6, int(round((cols_px[c + 1] - cols_px[c]) * scale)))
        col_offsets.append(col_offsets[-1] + cw + pad_x)

    canvas_h = row_offsets[-1]
    canvas_w = col_offsets[-1]
    if canvas_h > 4600 or canvas_w > 4600:
        return {}

    page_clean = clean_image_for_ocr(img_deskewed_bgr)
    canvas = np.full((canvas_h, canvas_w, 3), 255, dtype=np.uint8)
    canvas_raw = np.full((canvas_h, canvas_w, 3), 255, dtype=np.uint8)

    for sp in spans:
        r0, c0, r1, c1 = sp
        cy0, cy1 = rows_px[r0], rows_px[r1]
        cx0, cx1 = cols_px[c0], cols_px[c1]
        ch = max(1, cy1 - cy0)
        cw = max(1, cx1 - cx0)
        trim_y = min(2, max(1, ch // 14)) if ch >= 14 else 0
        trim_x = 1 if cw >= 10 else 0

        crop_raw = img_deskewed_bgr[cy0 + trim_y : cy1 - trim_y, cx0 + trim_x : cx1 - trim_x]
        if crop_raw.size == 0:
            continue
        c_gray = cv2.cvtColor(crop_raw, cv2.COLOR_BGR2GRAY)
        bg_luma = float(np.percentile(c_gray, 75))
        if bg_luma < 155.0:
            proc = clean_image_for_ocr(cv2.bitwise_not(crop_raw))
            proc_raw = cv2.bitwise_not(crop_raw)
        else:
            proc = page_clean[cy0 + trim_y : cy1 - trim_y, cx0 + trim_x : cx1 - trim_x]
            proc_raw = crop_raw

        if scale > 1.02:
            tw = max(4, int(round(proc.shape[1] * scale)))
            th = max(4, int(round(proc.shape[0] * scale)))
            proc = cv2.resize(proc, (tw, th), interpolation=cv2.INTER_CUBIC)
            proc_raw = cv2.resize(proc_raw, (tw, th), interpolation=cv2.INTER_CUBIC)

        dy0 = row_offsets[r0] + int(round(trim_y * scale))
        dx0 = col_offsets[c0] + int(round(trim_x * scale))
        ch_max = max(1, row_offsets[r1] - pad_y - dy0)
        cw_max = max(1, col_offsets[c1] - pad_x - dx0)
        proc = proc[:ch_max, :cw_max]
        proc_raw = proc_raw[:ch_max, :cw_max]
        canvas[dy0 : dy0 + proc.shape[0], dx0 : dx0 + proc.shape[1]] = proc
        canvas_raw[dy0 : dy0 + proc_raw.shape[0], dx0 : dx0 + proc_raw.shape[1]] = proc_raw

    r_words = extract_rapidocr_words(canvas, canvas_raw, latin_font, dev_font)
    eff_lang = resolve_ocr_lang(ocr_lang) if ocr_lang else "auto"
    tess_lang = ("hin+eng" if wants_hindi else "eng") if eff_lang == "auto" else eff_lang
    t_words = extract_tesseract_words(canvas, lang=tess_lang, psm=6)

    inv_s = 1.0 / scale

    def _assign_to_spans(word_list: list[OCRWord]) -> dict[tuple[int, int, int, int], list[OCRWord]]:
        assigned: dict[tuple[int, int, int, int], list[OCRWord]] = {}
        for w in word_list:
            txt = re.sub(
                r"^[\[\]|»«=]+(?=[A-Za-z0-9\u0900-\u097F])|(?<=[A-Za-z0-9\u0900-\u097F])[\[\]|»«]+$",
                "",
                (w.text or "").strip().strip("|"),
            )
            if not txt or re.fullmatch(r"[\[\]|»«_—~`=]+", txt):
                continue
            # Ensure space between date and timestamp (e.g. `9/3/202621:18:52` -> `9/3/2026 21:18:52`)
            txt = re.sub(r"(\d{1,2}/\d{1,2}/\d{2,4})(?=\d{1,2}:\d{2})", r"\1 ", txt)
            # Repair common OCR digit confusions in decimal numbers (`B3.04` -> `83.04`)
            txt = re.sub(r"\bB(?=\d+\.\d+\b)", "8", txt)
            wcx = (w.x0 + w.x1) * 0.5
            wcy = (w.y0 + w.y1) * 0.5
            for sp in spans:
                r0, c0, r1, c1 = sp
                by0, by1 = row_offsets[r0] - 6, row_offsets[r1] - pad_y + 6
                bx0, bx1 = col_offsets[c0] - 6, col_offsets[c1] - pad_x + 6
                if bx0 <= wcx <= bx1 and by0 <= wcy <= by1:
                    cw_px = float(max(1, cols_px[c1] - cols_px[c0]))
                    ch_px = float(max(1, rows_px[r1] - rows_px[r0]))
                    lx0 = max(0.0, min(cw_px, (w.x0 - col_offsets[c0]) * inv_s))
                    ly0 = max(0.0, min(ch_px, (w.y0 - row_offsets[r0]) * inv_s))
                    lx1 = max(lx0 + 1.0, min(cw_px, (w.x1 - col_offsets[c0]) * inv_s))
                    ly1 = max(ly0 + 1.0, min(ch_px, (w.y1 - row_offsets[r0]) * inv_s))
                    assigned.setdefault(sp, []).append(
                        OCRWord(txt, lx0, ly0, lx1, ly1, conf=w.conf)
                    )
                    break
        return assigned

    r_map = _assign_to_spans(r_words)
    t_map = _assign_to_spans(t_words)

    out_map: dict[tuple[int, int, int, int], list[OCRWord]] = {}
    for sp in spans:
        r_ws = r_map.get(sp, [])
        t_ws = t_map.get(sp, [])
        if not r_ws and not t_ws:
            continue
        if not r_ws:
            out_map[sp] = t_ws
            continue
        if not t_ws:
            out_map[sp] = r_ws
            continue

        r_txt = " ".join(w.text for w in sorted(r_ws, key=lambda x: x.x0)).strip()
        t_txt = " ".join(w.text for w in sorted(t_ws, key=lambda x: x.x0)).strip()
        r_has_punct_num = bool(re.search(r"\d+[./:]\d+", r_txt))
        t_has_punct_num = bool(re.search(r"\d+[./:]\d+", t_txt))
        if t_has_punct_num and not r_has_punct_num:
            out_map[sp] = t_ws
            continue
        if re.fullmatch(r"\d+", r_txt) and re.fullmatch(r"\d+", t_txt) and len(t_txt) > len(r_txt):
            out_map[sp] = t_ws
            continue
        if r_has_punct_num or re.search(r"\d", r_txt):
            out_map[sp] = r_ws
            continue

        r_toks = [tok for tok in r_txt.split() if tok]
        t_toks = [tok for tok in t_txt.split() if tok]
        r_clean = sum(1 for tok in r_toks if is_clean_ascii_token(tok) or _DEVANAGARI_RE.search(tok)) / max(1, len(r_toks))
        t_clean = sum(1 for tok in t_toks if is_clean_ascii_token(tok) or _DEVANAGARI_RE.search(tok)) / max(1, len(t_toks))
        if t_clean > r_clean:
            out_map[sp] = t_ws
        elif len(t_toks) > len(r_toks) and t_clean >= r_clean:
            out_map[sp] = t_ws
        else:
            out_map[sp] = r_ws

    return out_map


def _populate_tables(
    img_deskewed_bgr: np.ndarray,
    raw_grids: list[tuple[list[int], list[int], list[tuple[int, int, int, int]]]],
    page_words_px: list[OCRWord],
    px_to_pt: float,
    wants_hindi: bool,
    latin_font: fitz.Font,
    dev_font: Optional[fitz.Font],
    paper_rgb: tuple[int, int, int] = (255, 255, 255),
    ocr_lang: str = "auto",
    is_digital_page: bool = False,
    native_style_by_id: Optional[dict[int, tuple[float, bool, tuple[int, int, int]]]] = None,
    skip_cell_ocr: bool = False,
) -> list[DetectedTable]:
    """Convert raw table pixel grids into structured DetectedTable objects with exact text & styles."""
    tables: list[DetectedTable] = []
    is_native_words = bool(page_words_px) and (
        is_digital_page or min(w.conf for w in page_words_px) >= 0.99
    )

    def _is_distinct_tint(rgb: tuple[int, int, int], luma: float, dark: bool) -> bool:
        if dark:
            return True
        dist = abs(rgb[0] - paper_rgb[0]) + abs(rgb[1] - paper_rgb[1]) + abs(rgb[2] - paper_rgb[2])
        if luma < 244.0 and dist >= 32:
            # Avoid painting pale noisy paper tint across entire document
            return (max(rgb) - min(rgb)) >= 8 or (luma < 226.0)
        return False

    for rows_px, cols_px, spans in raw_grids:
        n_rows = len(rows_px) - 1
        n_cols = len(cols_px) - 1
        col_widths_pt = [max(8.0, (cols_px[c + 1] - cols_px[c]) * px_to_pt) for c in range(n_cols)]
        row_heights_pt = [max(10.0, (rows_px[r + 1] - rows_px[r]) * px_to_pt) for r in range(n_rows)]
        table_x0 = cols_px[0] * px_to_pt
        table_y0 = rows_px[0] * px_to_pt
        table_x1 = cols_px[-1] * px_to_pt
        table_y1 = rows_px[-1] * px_to_pt

        # For multi-cell scanned tables, run batch Grid-Expanded Table Canvas OCR once
        batch_cell_map: dict[tuple[int, int, int, int], list[OCRWord]] = {}
        if not is_native_words and not skip_cell_ocr and len(spans) >= 6:
            batch_cell_map = _ocr_table_cells_batch(
                img_deskewed_bgr, rows_px, cols_px, spans, wants_hindi, latin_font, dev_font, ocr_lang=ocr_lang
            )

        # Pre-filter words overlapping this table's bounding box once (avoids scanning full page words per cell)
        tx0_px, ty0_px, tx1_px, ty1_px = cols_px[0], rows_px[0], cols_px[-1], rows_px[-1]
        table_candidate_words = [
            pw
            for pw in page_words_px
            if pw.conf >= 0.45
            and tx0_px <= (pw.x0 + pw.x1) * 0.5 <= tx1_px
            and ty0_px <= (pw.y0 + pw.y1) * 0.5 <= ty1_px
        ]

        cells: list[TableCell] = []
        inked_cell_rows: set[int] = set()
        inked_cell_cnt = 0
        focused_ocr_calls = 0
        for r0, c0, r1, c1 in spans:
            sp_key = (r0, c0, r1, c1)
            cx0_px, cy0_px = cols_px[c0], rows_px[r0]
            cx1_px, cy1_px = cols_px[c1], rows_px[r1]
            cw_px = max(1, cx1_px - cx0_px)
            ch_px = max(1, cy1_px - cy0_px)

            # Gather full-page words strictly inside this cell (rejecting cross-border glued OCR tokens)
            existing_local: list[OCRWord] = []
            local_style_map: dict[int, tuple[float, bool, tuple[int, int, int]]] = {}
            for pw in table_candidate_words:
                wcx = (pw.x0 + pw.x1) * 0.5
                wcy = (pw.y0 + pw.y1) * 0.5
                if cx0_px <= wcx <= cx1_px and cy0_px <= wcy <= cy1_px:
                    # If not native PDF words, reject tokens that straddle left/right cell borders
                    if not is_native_words and (pw.x0 < cx0_px - 4 or pw.x1 > cx1_px + 4):
                        continue
                    cleaned_tok = re.sub(
                        r"^[\[\]|»«]+(?=[A-Za-z0-9\u0900-\u097F])|(?<=[A-Za-z0-9\u0900-\u097F])[\[\]|»«]+$",
                        "",
                        pw.text.strip().strip("|"),
                    )
                    if cleaned_tok and not re.fullmatch(r"[\[\]|»«_—~`]+", cleaned_tok):
                        lw = OCRWord(
                            cleaned_tok,
                            max(0.0, pw.x0 - cx0_px),
                            max(0.0, pw.y0 - cy0_px),
                            min(float(cw_px), pw.x1 - cx0_px),
                            min(float(ch_px), pw.y1 - cy0_px),
                            conf=pw.conf,
                        )
                        existing_local.append(lw)
                        if native_style_by_id is not None:
                            nst = native_style_by_id.get(id(pw))
                            if nst is not None:
                                local_style_map[id(lw)] = nst

            # Prefer batch grid-expanded OCR words for scanned multi-cell tables (border-free & unglued)
            batch_words = batch_cell_map.get(sp_key)
            if batch_words:
                existing_local = batch_words

            cell_crop = img_deskewed_bgr[cy0_px:cy1_px, cx0_px:cx1_px]
            core_gray = cv2.cvtColor(cell_crop, cv2.COLOR_BGR2GRAY) if cell_crop.size > 0 else np.array([[255]], dtype=np.uint8)
            sub_gray = core_gray[::2, ::2]
            if sub_gray.size > 0 and (
                int(np.min(sub_gray)) >= 215
                or (float(np.mean(sub_gray)) >= 245.0 and int(np.percentile(sub_gray, 25)) >= 232)
            ):
                bg_luma = 255.0
                is_dark_bg = False
                bg_rgb: Optional[tuple[int, int, int]] = None
            else:
                bg_luma = float(np.percentile(core_gray, 75)) if core_gray.size > 0 else 255.0
                is_dark_bg = bg_luma < 155.0
                bg_rgb = None
                bright_mask = core_gray >= np.percentile(core_gray, 55) if core_gray.size > 0 else None
                if bright_mask is not None and np.any(bright_mask):
                    bright_pixels = cell_crop[bright_mask]
                    med_bgr = np.median(bright_pixels, axis=0)
                    cand_rgb = (int(med_bgr[2]), int(med_bgr[1]), int(med_bgr[0]))
                    chroma_std = float(np.max(np.std(bright_pixels.astype(np.float32), axis=0)))
                    if _is_distinct_tint(cand_rgb, bg_luma, is_dark_bg) and (is_dark_bg or chroma_std <= 24.0):
                        bg_rgb = cand_rgb

            has_content_ink = False
            interior = core_gray
            if not is_native_words:
                interior = core_gray[3:-3, 3:-3] if (core_gray.shape[0] > 8 and core_gray.shape[1] > 8) else core_gray
                has_content_ink = (
                    (float(np.std(interior)) > 7.5 or int(np.sum(interior < 165)) >= 8)
                    if interior.size > 0
                    else False
                )
                if has_content_ink or is_dark_bg:
                    inked_cell_cnt += 1
                    inked_cell_rows.add(r0)
            focused_dark = is_dark_bg
            focused_bg = bg_rgb or (255, 255, 255)

            uncovered_cell_ink = False
            if not is_native_words and not skip_cell_ocr:
                cell_clean_tokens = bool(existing_local) and min(w.conf for w in existing_local) >= 0.78
                has_edge_junk = any(re.search(r"[\[\]|»«]", w.text) for w in existing_local)
                if cell_clean_tokens and not has_edge_junk and not is_dark_bg and not batch_words and interior.size > 0:
                    ih_c, iw_c = interior.shape[:2]
                    cov = np.zeros((ih_c, iw_c), dtype=np.uint8)
                    for ew in existing_local:
                        ex0 = max(0, int(ew.x0) - 4)
                        ey0 = max(0, int(ew.y0) - 4)
                        ex1 = min(iw_c, int(math.ceil(ew.x1)) + 2)
                        ey1 = min(ih_c, int(math.ceil(ew.y1)) + 2)
                        if ex1 > ex0 and ey1 > ey0:
                            cov[ey0:ey1, ex0:ex1] = 255
                    uncovered_cell_ink = float(np.mean((interior < 150) & (cov == 0))) > 0.015

                needs_focused_ocr = (
                    (not batch_cell_map or (not existing_local and focused_ocr_calls < 10))
                    and (is_dark_bg or (has_content_ink and (not cell_clean_tokens or has_edge_junk or uncovered_cell_ink)))
                )
            else:
                needs_focused_ocr = False

            # Skip redundant per-cell subprocesses when batch/full-page OCR already read cell cleanly
            if needs_focused_ocr:
                focused_ocr_calls += 1
                focused, focused_bg, focused_dark = _run_focused_cell_ocr(
                    cell_crop, wants_hindi, latin_font, dev_font, ocr_lang=ocr_lang
                )
                if focused:
                    existing_local = focused
                elif (
                    is_dark_bg
                    or not existing_local
                    or max((w.conf for w in existing_local), default=0.0) < 0.72
                    or (interior.size > 0 and float(np.mean(interior < 155)) < 0.008 and int(np.sum(interior < 165)) < 10)
                ):
                    # Empty cell with only pastel watermark noise -> clear weak full-page hallucination
                    existing_local = []
                if focused_dark or (bg_rgb is None and _is_distinct_tint(focused_bg, float(sum(focused_bg)) / 3.0, focused_dark)):
                    bg_rgb = focused_bg
                is_dark_bg = is_dark_bg or focused_dark
            elif (
                not is_native_words
                and not is_dark_bg
                and interior.size > 0
                and float(np.mean(interior < 155)) < 0.008
                and int(np.sum(interior < 165)) < 10
            ):
                # Visually empty non-dark cell -> discard stray border/watermark noise leaked from full-page OCR
                existing_local = []

            grouped = _group_words_to_lines(existing_local)
            line_strs = [" ".join(w.text for w in ln).strip() for ln in grouped]
            line_strs = [s for s in line_strs if s]
            cell_text = "\n".join(line_strs)

            # Determine alignment inside cell
            align = "center"
            if existing_local:
                min_lx = min(w.x0 for w in existing_local)
                max_rx = max(w.x1 for w in existing_local)
                left_gap = min_lx
                right_gap = max(0.0, float(cw_px) - max_rx)
                mid_x = (min_lx + max_rx) * 0.5
                is_numeric = bool(re.fullmatch(r"[\d.,/\-+%*()]+", cell_text.replace(" ", "").replace("\n", "")))
                if not is_numeric and cw_px > 95 and left_gap < cw_px * 0.20 and right_gap > left_gap * 1.9:
                    align = "left"
                elif abs(mid_x - cw_px * 0.5) <= cw_px * 0.16 or len(cell_text) <= 8:
                    align = "center"
                elif right_gap < cw_px * 0.14 and left_gap > right_gap * 2.0:
                    align = "right"
                else:
                    align = "left"

            est_font_pt = 8.5
            is_hdr = r0 == 0 or is_dark_bg or (c0 == 0 and c1 == n_cols and bg_rgb is not None and min(bg_rgb) < 235)
            text_rgb = (255, 255, 255) if is_dark_bg else (17, 24, 39)
            native_bold: Optional[bool] = None
            styled_vals = [local_style_map[id(w)] for w in existing_local if id(w) in local_style_map]
            if is_native_words and styled_vals:
                est_font_pt = max(6.5, min(14.0, round(float(np.median([sv[0] for sv in styled_vals])) * 2.0) / 2.0))
                native_bold = sum(1 for sv in styled_vals if sv[1]) > len(styled_vals) // 2
                if not is_dark_bg:
                    best_w = max(existing_local, key=lambda w: len(w.text))
                    text_rgb = local_style_map.get(id(best_w), styled_vals[0])[2]
            else:
                if existing_local:
                    heights_pt = [(w.y1 - w.y0) * px_to_pt * 0.78 for w in existing_local]
                    est_font_pt = max(6.5, min(14.0, round(float(np.median(heights_pt)) * 2.0) / 2.0))
                if not is_dark_bg and existing_local:
                    best_w = max(existing_local, key=lambda w: len(w.text))
                    text_rgb, _ = _sample_ink_color_and_bold(
                        cell_crop, int(best_w.x0), int(best_w.y0), int(best_w.x1), int(best_w.y1)
                    )

            cells.append(
                TableCell(
                    r0=r0,
                    c0=c0,
                    r1=r1,
                    c1=c1,
                    x0=cx0_px * px_to_pt,
                    y0=cy0_px * px_to_pt,
                    x1=cx1_px * px_to_pt,
                    y1=cy1_px * px_to_pt,
                    text=cell_text,
                    lines=line_strs,
                    bg_rgb=bg_rgb,
                    text_rgb=text_rgb,
                    is_header=is_hdr,
                    is_bold=(native_bold if native_bold is not None else False) or is_hdr or is_dark_bg,
                    align=align,
                    font_size_pt=est_font_pt,
                )
            )

        # Sequential integer rank/serial column repair (e.g. `'§'`->'5', or `'8'`,`'1'`,`'33'` in S.No. 1..28)
        if n_rows >= 4 and not skip_cell_ocr:
            for col_i in range(n_cols):
                col_cells = {
                    c.r0: c for c in cells if c.c0 == col_i and c.c1 == col_i + 1 and c.r1 == c.r0 + 1
                }
                int_rows = {
                    r_k: int(c_obj.text.strip())
                    for r_k, c_obj in col_cells.items()
                    if re.fullmatch(r"\d{1,4}", c_obj.text.strip())
                }
                if len(int_rows) >= max(3, (n_rows - 1) // 2):
                    offsets = [val - r_k for r_k, val in int_rows.items() if r_k >= 1]
                    modal_offset: Optional[int] = None
                    strict_seq_consensus = False
                    if offsets:
                        best_off = max(set(offsets), key=offsets.count)
                        if offsets.count(best_off) >= max(3, int(len(offsets) * 0.70)):
                            modal_offset = best_off
                            strict_seq_consensus = len(offsets) >= max(4, (n_rows - 1) // 2) and (
                                offsets.count(best_off) >= max(4, int(len(offsets) * 0.70))
                            )
                    for r_k, c_obj in sorted(col_cells.items()):
                        if r_k == 0 or len(c_obj.text.strip()) > 3:
                            continue
                        prev_v = int_rows.get(r_k - 1)
                        next_v = int_rows.get(r_k + 1)
                        if r_k in int_rows:
                            if not (not is_native_words and strict_seq_consensus and modal_offset is not None):
                                continue
                            expected = r_k + modal_offset
                            if expected <= 0 or int_rows[r_k] == expected:
                                continue
                            if prev_v != expected - 1 and next_v != expected + 1:
                                continue
                            fixed_val = str(expected)
                        elif prev_v is not None and next_v is not None and (next_v - prev_v) == 2:
                            fixed_val = str(prev_v + 1)
                        elif modal_offset is not None and (r_k + modal_offset) > 0:
                            fixed_val = str(r_k + modal_offset)
                        else:
                            continue
                        c_obj.text = fixed_val
                        c_obj.lines = [fixed_val]
                        int_rows[r_k] = int(fixed_val)

                # Dropped decimal-point repair in 2-digit decimal/percentage columns (e.g. `8142` -> `81.42` between `81.76` and `81.03`)
                dec_rows = {
                    r_k: float(c_obj.text.strip())
                    for r_k, c_obj in col_cells.items()
                    if re.fullmatch(r"\d{2}\.\d{1,5}", c_obj.text.strip())
                }
                if len(dec_rows) >= max(3, (n_rows - 1) // 3):
                    for r_k, c_obj in col_cells.items():
                        raw_t = c_obj.text.strip()
                        if re.fullmatch(r"\d{4,7}", raw_t):
                            cand_str = f"{raw_t[:2]}.{raw_t[2:]}"
                            cand_val = float(cand_str)
                            if 10.0 <= cand_val <= 100.0:
                                c_obj.text = cand_str
                                c_obj.lines = [cand_str]

        # Reject sparse/hallucinated fake tables (e.g., QR code checkerboard, photo frame, yellow footer bars)
        # while keeping authentic bordered signature/acknowledgement forms with >= 3 populated multi-char cells.
        if skip_cell_ocr and not is_native_words:
            min_req_ink = 3 if n_cols <= 4 else 4
            if inked_cell_cnt < max(min_req_ink, int(len(cells) * 0.22)) or len(inked_cell_rows) < 2:
                continue
        else:
            non_empty_cells = [c for c in cells if len(re.findall(r"[A-Za-z0-9\u0900-\u097F]", c.text)) >= 1]
            multi_char_cells = [c for c in cells if len(re.findall(r"[A-Za-z0-9\u0900-\u097F]", c.text)) >= 2]
            populated_rows = len({c.r0 for c in non_empty_cells})
            min_req_cells = 3 if (n_cols <= 4 and len(multi_char_cells) >= 3) else 4
            if (
                len(non_empty_cells) < max(min_req_cells, int(len(cells) * 0.25))
                or len(multi_char_cells) < 3
                or populated_rows < 2
            ):
                continue

        # Reject small fake boxes (< 8 cells) whose vertical dividers slice straight through clean prose words
        if n_rows < 3 or n_cols < 3 or len(spans) < 8:
            cell_dividers = [
                (cols_px[c.c1], rows_px[c.r0], rows_px[c.r1])
                for c in cells
                if c.c1 < n_cols
            ]
            straddle_cnt = 0
            if cell_dividers:
                ty0_px, ty1_px = rows_px[0], rows_px[-1]
                for w in page_words_px:
                    if len(w.text.strip()) < 3 or w.conf < 0.45:
                        continue
                    wcy = (w.y0 + w.y1) * 0.5
                    if wcy < ty0_px or wcy > ty1_px:
                        continue
                    if any(
                        dy0 - 2 <= wcy <= dy1 + 2 and w.x0 < dx - 5 and w.x1 > dx + 5
                        for dx, dy0, dy1 in cell_dividers
                    ):
                        straddle_cnt += 1
            if straddle_cnt >= max(3, populated_rows):
                continue

        tables.append(
            DetectedTable(
                x0=table_x0,
                y0=table_y0,
                x1=table_x1,
                y1=table_y1,
                n_rows=n_rows,
                n_cols=n_cols,
                col_widths_pt=col_widths_pt,
                row_heights_pt=row_heights_pt,
                cells=cells,
                has_visible_borders=True,
            )
        )

    return tables


# ---------------------------------------------------------------------------
# Non-Text Visual Asset Extractor (Logos, Passport Photos, QR, Stamps, Sigs)
# ---------------------------------------------------------------------------


def _is_digital_signature_or_text_panel(
    crop_gray: np.ndarray,
    hsv_crop: np.ndarray,
    bw: int,
    bh: int,
    by: int,
    ih: int,
) -> bool:
    """
    Detect digital-signature panels (`Signature valid / Digitally signed by...` over green tick)
    and dense multi-line text blocks sitting on bright paper so they NEVER get cropped as `'photo'`.
    """
    if bw < 85 or bh < 68 or crop_gray.size == 0:
        return False
    bright_frac = float(np.mean(crop_gray > 195))
    if bright_frac < 0.44:
        return False

    edges = cv2.Canny(crop_gray, 60, 160)
    edge_frac = float(np.mean(edges > 0))
    if edge_frac >= 0.165:
        return False  # Preserve square checkerboard QR codes / dense seals

    neutral_dark = (hsv_crop[:, :, 1] < 58) & (crop_gray < 145)
    row_dens = np.mean(neutral_dark, axis=1)
    text_bands = 0
    in_band = False
    run_len = 0
    for val in row_dens > 0.03:
        if val:
            run_len += 1
            if not in_band and run_len >= 3:
                text_bands += 1
                in_band = True
        else:
            in_band = False
            run_len = 0

    if text_bands < 3:
        return False

    green_frac = float(
        np.mean(
            (hsv_crop[:, :, 0] >= 35)
            & (hsv_crop[:, :, 0] <= 92)
            & (hsv_crop[:, :, 1] >= 45)
            & (hsv_crop[:, :, 2] >= 40)
        )
    )
    if 0.015 <= green_frac <= 0.36:
        return True
    dark_frac = float(np.mean(crop_gray < 195))
    return by > ih * 0.45 and dark_frac < 0.56


def _extract_visual_assets(
    img_deskewed_bgr: np.ndarray,
    table_boxes_px: list[tuple[int, int, int, int]],
    keep_words_px: list[OCRWord],
    px_to_pt: float,
    out_sig_boxes: Optional[list[tuple[int, int, int, int]]] = None,
) -> tuple[list[VisualAsset], list[tuple[int, int, int, int]]]:
    """
    Isolate crisp non-text visual graphics (university crests, passport photos,
    QR codes, round ink seals, signatures) while ignoring watermarks, outer decorative
    ribbons, and body text.
    Returns (assets, suppress_ocr_boxes_px) where suppress_ocr_boxes_px lists graphic regions
    whose noisy internal OCR fragments (QR/emblem artifacts) should be discarded.
    """
    ih, iw = img_deskewed_bgr.shape[:2]

    # Start from dark ink + colored ink/photo pixels, excluding pale pastel watermarks
    clean_bgr = clean_image_for_ocr(img_deskewed_bgr)
    clean_gray = cv2.cvtColor(clean_bgr, cv2.COLOR_BGR2GRAY)
    del clean_bgr
    ink_mask = (clean_gray < 210).astype(np.uint8) * 255
    del clean_gray

    gray = cv2.cvtColor(img_deskewed_bgr, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(img_deskewed_bgr, cv2.COLOR_BGR2HSV)

    # Also keep vivid medium-dark color regions (passport photos, green checkmark stamps, red/blue logos)
    # while excluding yellow/orange map watermarks & edge border ribbons
    non_yellow = (hsv[:, :, 0] < 11) | (hsv[:, :, 0] > 42) | (hsv[:, :, 2] < 165)
    color_fg = ((hsv[:, :, 1] > 42) & (hsv[:, :, 2] < 215) & (gray < 225) & non_yellow).astype(np.uint8) * 255
    del hsv, gray, non_yellow
    mask = cv2.bitwise_or(ink_mask, color_fg)
    del ink_mask, color_fg

    # Zero out outer 1.5% scan border noise & detected tables
    margin = max(2, int(min(ih, iw) * 0.006))
    mask[:margin, :] = 0
    mask[-margin:, :] = 0
    mask[:, :margin] = 0
    mask[:, -margin:] = 0

    for tx0, ty0, tx1, ty1 in table_boxes_px:
        mask[max(0, ty0 - 4):min(ih, ty1 + 4), max(0, tx0 - 4):min(iw, tx1 + 4)] = 0

    # Zero out non-table text word boxes (even medium conf over watermarks) so paragraphs
    # inside yellow/tinted watermarks never glue together as cropped image blocks
    for w in keep_words_px:
        if w.conf >= 0.28 and (len(w.text) >= 2 or w.text.isalnum()):
            wx0 = max(0, int(w.x0) - 3)
            wy0 = max(0, int(w.y0) - 3)
            wx1 = min(iw, int(math.ceil(w.x1)) + 3)
            wy1 = min(ih, int(math.ceil(w.y1)) + 3)
            if (wy1 - wy0) < ih * 0.045:
                mask[wy0:wy1, wx0:wx1] = 0

    # Dilate moderately to merge strokes inside a signature, stamp circle, crest, or QR modules
    k_dil = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
    merged = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k_dil, iterations=1)
    del mask
    merged = cv2.dilate(merged, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)), iterations=1)

    num_labels, _lbl, stats, _ = cv2.connectedComponentsWithStats(merged, connectivity=8)
    del merged, _lbl
    raw_candidates: list[tuple[int, int, int, int, float]] = []

    min_w = max(46, int(iw * 0.044))
    min_h = max(46, int(ih * 0.034))
    page_area = float(ih * iw)

    for lbl in range(1, num_labels):
        bx = int(stats[lbl, cv2.CC_STAT_LEFT])
        by = int(stats[lbl, cv2.CC_STAT_TOP])
        bw = int(stats[lbl, cv2.CC_STAT_WIDTH])
        bh = int(stats[lbl, cv2.CC_STAT_HEIGHT])
        area = float(bw * bh)

        is_sig_shape = (
            bw >= max(72, int(iw * 0.06))
            and bh >= 18
            and (bw / max(1, bh)) >= 1.8
            and by > ih * 0.25
        )
        if (bw < min_w or bh < min_h) and not is_sig_shape:
            continue
        # Reject full-page watermarks, wide horizontal rules, and vertical edge ribbons (e.g. e-Mitra side strips)
        if area > page_area * 0.16 or bw > iw * 0.55 or bh > ih * 0.40:
            continue
        # Reject decorative outer margin icons / e-Mitra orange side border tiles
        if (bx + bw < iw * 0.115 or bx > iw * 0.885) and (bw < iw * 0.08 or (bh / max(1, bw)) > 1.75):
            continue
        if bw > iw * 0.40 and bh < 22:
            continue
        raw_candidates.append((bx, by, bx + bw, by + bh, area))

    # Deduplicate nested / overlapping candidate asset boxes (keep LARGER outer emblem/photo frame)
    dedup_candidates: list[tuple[int, int, int, int]] = []
    for bx0, by0, bx1, by1, _ in sorted(raw_candidates, key=lambda c: -c[4]):
        cand = (bx0, by0, bx1, by1)
        if any(_rect_iou(cand, kept) > 0.35 for kept in dedup_candidates):
            continue
        dedup_candidates.append(cand)

    assets: list[VisualAsset] = []
    suppress_boxes: list[tuple[int, int, int, int]] = []

    for bx, by, bx1_a, by1_a in dedup_candidates:
        bw = bx1_a - bx
        bh = by1_a - by
        crop_bgr = img_deskewed_bgr[by:by + bh, bx:bx + bw]
        if crop_bgr.size == 0:
            continue

        crop_gray = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY)
        dark_frac = float(np.mean(crop_gray < 195))
        gray_std = float(np.std(crop_gray))
        aspect_cand = bw / float(max(1, bh))
        is_sig_pos = (
            bw >= max(72, int(iw * 0.06))
            and bh >= 18
            and aspect_cand >= 1.8
            and by > ih * 0.25
        )
        min_dark = 0.014 if is_sig_pos else 0.05
        min_std = 11.0 if is_sig_pos else 14.0
        if dark_frac < min_dark or gray_std < min_std:
            continue

        # Reject yellow/orange pastel watermark map washes & isolated body text fragments (e.g. e-Mitra center map, RBSE arch text)
        # while keeping dark top-header logos/crests and portrait photos intact
        if (aspect_cand < 0.44 or aspect_cand > 2.55) and min(bw, bh) < 64 and not is_sig_pos:
            continue
        # Reject curved/arched header text scraps flanking central board emblems (e.g. RBSE curved title)
        if (
            by < ih * 0.25
            and bx > iw * 0.22
            and (bx + bw) < iw * 0.78
            and min(bw, bh) < 76
            and dark_frac < 0.34
        ):
            continue
        # Reject wide low horizontal strips (printed small-font note lines like "COC: Carry Over...")
        # unless it is a genuine cursive signature (`aspect >= 1.8`, sparse ink `dark_frac < 0.24`)
        if (bh < min_h or aspect_cand >= 2.65) and not (
            by > ih * 0.28 and aspect_cand >= 1.8 and dark_frac < 0.24 and bw >= max(72, int(iw * 0.06)) and bh >= 18
        ):
            continue
        hsv_crop = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2HSV)
        if hsv_crop.size == 0:
            continue
        mean_h = float(np.mean(hsv_crop[:, :, 0]))
        mean_s = float(np.mean(hsv_crop[:, :, 1]))
        mean_v = float(np.mean(hsv_crop[:, :, 2]))

        # Reject small washed-out monochrome single-word scraps (low saturation & soft contrast)
        if min(bw, bh) < 92 and gray_std < 50.0 and mean_s < 24.0:
            continue

        orange_wash_frac = float(
            np.mean((hsv_crop[:, :, 0] >= 10) & (hsv_crop[:, :, 0] <= 45) & (hsv_crop[:, :, 1] >= 26))
        )
        if 10.0 <= mean_h <= 45.0 and mean_v > 145.0 and orange_wash_frac >= 0.08:
            if (by > ih * 0.16 and mean_s > 28.0) or (dark_frac < 0.30 and gray_std < 62.0):
                continue

        # Reject body text paragraphs or small torn checkmark+text cutouts overlapping clean words
        words_inside = sum(
            1
            for w in keep_words_px
            if w.conf >= 0.40
            and len(w.text.strip()) >= 2
            and _point_in_box((w.x0 + w.x1) * 0.5, (w.y0 + w.y1) * 0.5, (bx, by, bx + bw, by + bh), pad=0.0)
        )
        if words_inside >= 3 and (bw > iw * 0.16 or bh > ih * 0.07):
            continue
        clean_word_overlap = any(
            w.conf >= 0.60
            and len(w.text.strip()) >= 3
            and max(0, min(bx + bw, w.x1) - max(bx, w.x0)) * max(0, min(by + bh, w.y1) - max(by, w.y0))
            >= 0.30 * max(1, (w.x1 - w.x0) * (w.y1 - w.y0))
            for w in keep_words_px
        )
        if (words_inside >= 2 or clean_word_overlap) and (bw * bh < iw * ih * 0.025):
            continue

        # Reject digital-signature panels (`Signature valid` over green checkmark) & multi-row printed text panels
        if _is_digital_signature_or_text_panel(crop_gray, hsv_crop, bw, bh, by, ih):
            if out_sig_boxes is not None:
                out_sig_boxes.append((bx, by, bx + bw, by + bh))
            continue

        # Ensure crop is not merely a thin rectangular border box with empty white interior
        if bw > iw * 0.25 and bh > ih * 0.15:
            inner = crop_gray[bh // 6:(5 * bh) // 6, bw // 6:(5 * bw) // 6]
            if inner.size > 0 and float(np.mean(inner < 200)) < 0.03:
                continue

        # Classify visual asset type cleanly using shared size-aware classifier
        kind = _classify_crop_kind(crop_bgr, bw, bh, iw, ih)

        if kind in ("qr", "photo", "logo"):
            suppress_boxes.append((bx, by, bx + bw, by + bh))

        # Tightly encode PNG crop with 2px white trim margin
        ok, buf = cv2.imencode(".png", crop_bgr)
        if not ok:
            continue

        assets.append(
            VisualAsset(
                x0=bx * px_to_pt,
                y0=by * px_to_pt,
                x1=(bx + bw) * px_to_pt,
                y1=(by + bh) * px_to_pt,
                kind=kind,
                png_bytes=buf.tobytes(),
                w_px=bw,
                h_px=bh,
            )
        )

    assets.sort(key=lambda a: (a.y0, a.x0))
    return assets, suppress_boxes


def extract_pdf_image_png_bytes(
    doc: Optional[fitz.Document],
    xref: int,
    smask: int = 0,
    require_alpha: bool = False,
) -> Optional[bytes]:
    """
    Extract crisp RGBA PNG bytes from a PDF image xref (preserving `/SMask` transparency
    so digital signatures, seals, and logos never render with a solid black background).
    Returns `None` if unavailable or `require_alpha=True` when the image is opaque.
    """
    if doc is None or xref <= 0:
        return None
    base_pix = None
    mask_pix = None
    merged_pix = None
    try:
        base_pix = fitz.Pixmap(doc, xref)
        has_alpha = bool(smask and smask > 0) or bool(getattr(base_pix, "alpha", 0))
        if require_alpha and not has_alpha:
            return None
        if base_pix.colorspace is None:
            return None
        if base_pix.n - base_pix.alpha > 3 or base_pix.colorspace.n > 3:
            rgb_pix = fitz.Pixmap(fitz.csRGB, base_pix)
            base_pix = rgb_pix
        if smask and smask > 0:
            mask_pix = fitz.Pixmap(doc, smask)
            if base_pix.alpha:
                base_pix = fitz.Pixmap(fitz.csRGB, base_pix)
            if mask_pix.n > 1:
                mask_pix = fitz.Pixmap(fitz.csGRAY, mask_pix)
            if (mask_pix.width, mask_pix.height) == (base_pix.width, base_pix.height):
                merged_pix = fitz.Pixmap(base_pix, mask_pix)
                return merged_pix.tobytes("png")
        if has_alpha:
            return base_pix.tobytes("png")
        return None if require_alpha else base_pix.tobytes("png")
    except Exception:
        return None
    finally:
        del base_pix, mask_pix, merged_pix


def build_alpha_image_bbox_map(page: fitz.Page) -> dict[tuple[int, int, int, int], bytes]:
    """
    Map rounded image placement bboxes on `page` to RGBA PNG bytes for any embedded
    image possessing an alpha channel or `/SMask` (via `page.get_images(full=True)`).
    """
    doc = page.parent
    if doc is None:
        return {}
    xref_smask: dict[int, int] = {}
    try:
        for entry in page.get_images(full=True):
            if len(entry) >= 2:
                xref_smask[int(entry[0])] = int(entry[1] or 0)
    except Exception:
        return {}

    out: dict[tuple[int, int, int, int], bytes] = {}
    try:
        for info in page.get_image_info(xrefs=True):
            ib = info.get("bbox")
            xref = int(info.get("xref", 0) or 0)
            if not ib or len(ib) < 4 or xref <= 0:
                continue
            smask = int(info.get("smask", 0) or xref_smask.get(xref, 0))
            if smask <= 0 and not info.get("has-mask"):
                continue
            png_a = extract_pdf_image_png_bytes(doc, xref, smask=smask, require_alpha=True)
            if png_a:
                key = (int(round(ib[0])), int(round(ib[1])), int(round(ib[2])), int(round(ib[3])))
                out[key] = png_a
    except Exception:
        pass
    return out


def _classify_crop_kind(
    crop_bgr: np.ndarray, bw_px: int, bh_px: int, iw: int, ih: int = 0
) -> str:
    """Classify a cropped graphic asset into `qr`, `photo`, `signature`, `logo`, or `stamp`."""
    crop_gray = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY)
    hsv_crop = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2HSV)
    dark_frac = float(np.mean(crop_gray < 195))
    gray_std = float(np.std(crop_gray))
    aspect = bw_px / float(max(1, bh_px))
    color_std = float(np.std(hsv_crop[:, :, 0]))
    med_sat = float(np.mean(hsv_crop[:, :, 1]))

    if 0.78 <= aspect <= 1.28 and dark_frac > 0.22 and gray_std > 48:
        green_frac = float(
            np.mean(
                (hsv_crop[:, :, 0] >= 35)
                & (hsv_crop[:, :, 0] <= 92)
                & (hsv_crop[:, :, 1] >= 45)
                & (hsv_crop[:, :, 2] >= 40)
            )
        )
        edges = cv2.Canny(crop_gray, 60, 160)
        if med_sat < 54 and green_frac < 0.05 and float(np.mean(edges > 0)) > 0.16:
            return "qr"
        if med_sat < 32 and gray_std > 52:
            return "stamp"
    if 0.58 <= aspect <= 1.25 and (med_sat > 18 or color_std > 15) and dark_frac > 0.28 and bw_px >= 42 and bh_px >= 48:
        return "photo"
    max_sig_h = int(ih * 0.14) if ih > 0 else int(iw * 0.18)
    if aspect >= 1.85 and dark_frac < 0.28 and bw_px <= int(iw * 0.48) and bh_px <= max(95, max_sig_h):
        return "signature"
    if aspect <= 1.55 and bw_px <= int(iw * 0.24):
        return "logo"
    return "stamp"


def _extract_digital_native_assets(
    page: fitz.Page,
    img_deskewed_bgr: np.ndarray,
    px_to_pt: float,
) -> list[VisualAsset]:
    """
    Extract discrete embedded raster graphics from a born-digital PDF using exact PDF
    image placements (`page.get_image_info(xrefs=True)`) and `/SMask` alpha preservation.
    """
    doc = page.parent
    page_w_pt = float(page.rect.width)
    page_h_pt = float(page.rect.height)
    page_area = max(1.0, page_w_pt * page_h_pt)
    ih, iw = img_deskewed_bgr.shape[:2]
    inv_scale = 1.0 / max(1e-6, px_to_pt)

    placed: list[tuple[tuple[float, float, float, float], int, int]] = []
    try:
        infos = page.get_image_info(xrefs=True)
    except Exception:
        infos = []

    xref_smask_map: dict[int, int] = {}
    try:
        for img_entry in page.get_images(full=True):
            if len(img_entry) >= 2:
                xref_smask_map[int(img_entry[0])] = int(img_entry[1] or 0)
    except Exception:
        pass

    for info in infos:
        bbox = info.get("bbox")
        if not bbox or len(bbox) < 4:
            continue
        r = fitz.Rect(bbox) & page.rect
        if r.is_empty or r.width < 12.0 or r.height < 10.0:
            continue
        area = float(r.width * r.height)
        # Skip tiny ornamental hairlines or full-page canvas backdrops
        if area > page_area * 0.72 or (r.width > page_w_pt * 0.65 and r.height < 14.0):
            continue
        box = (float(r.x0), float(r.y0), float(r.x1), float(r.y1))
        if any(_rect_iou(box, prev_b) > 0.72 for prev_b, _, _ in placed):
            continue
        xref = int(info.get("xref", 0) or 0)
        smask = int(info.get("smask", 0) or xref_smask_map.get(xref, 0))
        placed.append((box, xref, smask))

    out_assets: list[VisualAsset] = []
    page_rot = int(getattr(page, "rotation", 0) or 0)
    for box, xref, smask in placed:
        bx0_pt, by0_pt, bx1_pt, by1_pt = box
        px0 = max(0, int(math.floor(bx0_pt * inv_scale)))
        py0 = max(0, int(math.floor(by0_pt * inv_scale)))
        px1 = min(iw, int(math.ceil(bx1_pt * inv_scale)))
        py1 = min(ih, int(math.ceil(by1_pt * inv_scale)))
        bw_px = px1 - px0
        bh_px = py1 - py0
        if bw_px < 14 or bh_px < 12:
            continue
        crop_bgr = img_deskewed_bgr[py0:py1, px0:px1]
        if crop_bgr.size == 0:
            continue
        crop_gray = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY)
        # Skip flat uniform colored separator boxes with no visual detail
        if float(np.std(crop_gray)) < 8.5 and float(np.mean(crop_gray < 210)) < 0.02:
            continue

        kind = _classify_crop_kind(crop_bgr, bw_px, bh_px, iw, ih)
        png_bytes: Optional[bytes] = None
        if page_rot == 0 and xref > 0:
            png_bytes = extract_pdf_image_png_bytes(doc, xref, smask=smask, require_alpha=True)
        if png_bytes is None:
            ok, buf = cv2.imencode(".png", crop_bgr)
            if not ok:
                continue
            png_bytes = buf.tobytes()

        out_assets.append(
            VisualAsset(
                x0=bx0_pt,
                y0=by0_pt,
                x1=bx1_pt,
                y1=by1_pt,
                kind=kind,
                png_bytes=png_bytes,
                w_px=bw_px,
                h_px=bh_px,
            )
        )

    out_assets.sort(key=lambda a: (a.y0, a.x0))
    return out_assets


_CORRUPT_CMAP_CH_RE = re.compile(r"[\u012f-\u036f\ufffd\ue000-\uf8ff]")
_LEGACY_INDIC_FONT_RE = re.compile(
    r"(?:krutidev|devlys|chanakya|kundli|shusha|aps-?c|agra|walkman)", re.IGNORECASE
)
_DEVANAGARI_OR_CORRUPT_RE = re.compile(r"[\u0900-\u097f\u012f-\u036f\ufffd\ue000-\uf8ff]")
_PURE_ASCII_OR_PUNCT_RE = re.compile(r"^[A-Za-z0-9.,:;!?/()\[\]{}\-_+%@#$&*'\"~=<>\\|]+$")
_STANDALONE_DEVA_MARK_RE = re.compile(r"^[\u0901-\u0903\u093e-\u094d\u0962-\u0963]+$")
# Legacy visual-order CorelDRAW/iText Devanagari swaps left-side vowel sign `ि` (U+093F) before consonant or after vowel/matra
_VISUAL_ORDER_DEVA_RE = re.compile(r"(?:^|[\u0904-\u0914\u093e-\u094d\u0901-\u0903(\[{\s])\u093f")

# Deterministic Nirmala UI / Mangal unmapped OpenType GIDs -> Unicode Devanagari ligatures
_NIRMALA_LIGATURES: dict[str, str] = {
    "\u012f": "\u093f", "\u0130": "\u093f", "\u014c": "\u094d\u0930", "\u0150": "\u0947\u0902",
    "\u0153": "\u0948\u0902", "\u015c": "\u0930\u0941", "\u015d": "\u0930\u0942", "\u0160": "\u0939\u0941",
    "\u0162": "\u0915\u094d\u0930", "\u0164": "\u0917\u094d\u0930", "\u0169": "\u0924\u094d\u0930",
    "\u016b": "\u0926\u094d\u0930", "\u016e": "\u092a\u094d\u0930", "\u0170": "\u092c\u094d\u0930",
    "\u0175": "\u0936\u094d\u0930", "\u017f": "\u0915\u094d\u0915", "\u0183": "\u0915\u094d\u091f",
    "\u0185": "\u0915\u094d\u0924", "\u018b": "\u0915\u094d\u0928", "\u0190": "\u0915\u094d\u092f",
    "\u0191": "\u0915\u094d\u0932", "\u0193": "\u0915\u094d\u0935", "\u0195": "\u0915\u094d\u0936",
    "\u0197": "\u0915\u094d\u0937", "\u019b": "\u0915\u094d\u0938", "\u01a2": "\u0916\u094d\u0924",
    "\u01a5": "\u0916\u094d\u092f", "\u01ad": "\u0917\u094d\u0927", "\u01b0": "\u0917\u094d\u0928",
    "\u01b6": "\u0917\u094d\u092f", "\u01b8": "\u0917\u094d\u0932", "\u020f": "\u0924\u094d\u092e",
    "\u021e": "\u0926\u094d\u0926", "\u022a": "\u0926\u094d\u0935", "\u022f": "\u0927\u094d\u092f",
    "\u0234": "\u0928\u094d\u091f", "\u023e": "\u0928\u094d\u0926\u094d\u0930", "\u0249": "\u0928\u094d\u092e",
    "\u024a": "\u0928\u094d\u092f", "\u024e": "\u0928\u094d\u0939", "\u0257": "\u092a\u094d\u092f",
    "\u0258": "\u092a\u094d\u0932", "\u025d": "\u092b\u094d\u091f", "\u0270": "\u092c\u094d\u0932",
    "\u0272": "\u092c\u094d\u0932\u094d\u092f", "\u0283": "\u092e\u094d\u092e", "\u0290": "\u0932\u094d\u091f",
    "\u0295": "\u0932\u094d\u092a", "\u0299": "\u0932\u094d\u092a", "\u02a9": "\u0935\u094d\u092f",
    "\u02b3": "\u0936\u094d\u092e", "\u02bc": "\u0937\u094d\u091f", "\u02cb": "\u0938\u094d\u0915",
    "\u02cc": "\u0938\u094d\u0915\u094d\u0930", "\u02d0": "\u0938\u094d\u091f", "\u02d1": "\u0938\u094d\u0924",
    "\u02d5": "\u0938\u094d\u0925", "\u02d8": "\u0938\u094d\u0928", "\u02d9": "\u0938\u094d\u092a",
    "\u02df": "\u0938\u094d\u092f", "\u02e2": "\u0938\u094d\u0935", "\u02e3": "\u0938\u094d\u0938",
    "\u02e5": "\u0939\u094d\u0928", "\u02f7": "\u091c\u093c\u094d\u092f", "\u030b": "\u0915\u094d\u0921",
    "\u0346": "\u092b\u093c\u094d",
}
_REPH_SUFFIX_MAP: dict[str, str] = {
    "\u014a": "",
    "\u014d": "\u0902",
    "\u014e": "\u0940",
    "\u0151": "\u0947",
    "\u0158": "\u094b\u0902",
}
_CONS_CLUSTER_REPH_RE = re.compile(
    r"(\uf000)?([क-हक़-य़]\u093c?(?:\u094d[क-हक़-य़]\u093c?)*[\u093e-\u094c\u0962\u0963]?)([\u014a\u014d\u014e\u0151\u0158])"
)
_TAGGED_VISUAL_I_RE = re.compile(r"\uf000([क-हक़-य़]\u093c?(?:\u094d[क-हक़-य़]\u093c?)*)")
_SAFE_LOGICAL_I_RE = re.compile(
    r"(^|[^\u0915-\u0939\u0958-\u095f\u094d\u093c])\u093f([क-हक़-य़]\u093c?(?:\u094d[क-हक़-य़]\u093c?)*)"
)
_U_MATRA_SWAP_RE = re.compile(r"([क-हक़-य़]\u093c?)([क-हक़-य़]\u093c?)([\u0941\u0942])([\u093e-\u094c])")
_I_ANUSVARA_SWAP_RE = re.compile(r"([\u093e-\u094c])\uf000\u0902")
_KRUTIDEV_EXACT_MAP: dict[str, str] = {
    ";gka": "यहाँ",
    ";gk¡": "यहाँ",
    "ls": "से",
    "dkVsa": "काटें",
    "dkVs": "काटे",
    "dkVsaA": "काटें।",
    "dkVsA": "काटे।",
    "gS": "है",
    "gaS": "हैं",
    "gSa": "हैं",
    "dk": "का",
    "dh": "की",
    "ds": "के",
    "esa": "में",
    "ij": "पर",
    "vksj": "ओर",
    "vkSj": "और",
}


def _decode_krutidev_token(txt: str) -> tuple[str, bool]:
    """Decode known KrutiDev010 ASCII tokens deterministically; return `(decoded, was_decoded)`."""
    s = txt.strip()
    if s in _KRUTIDEV_EXACT_MAP:
        return _KRUTIDEV_EXACT_MAP[s], True
    return txt, False


def _decode_deterministic_indic_cmap(
    txt: str,
    font_name: str = "",
    *,
    visual_order_mode: bool = False,
) -> tuple[str, bool]:
    """
    Deterministically decode NirmalaUI/Mangal ToUnicode null-GID artifacts, visual-order `ि`,
    and common KrutiDev010 tokens in microseconds without spawning Tesseract.
    Returns `(decoded_text, resolved_legacy_font)`.
    """
    if not txt:
        return txt, False
    if _LEGACY_INDIC_FONT_RE.search(font_name or ""):
        dec_kd, ok_kd = _decode_krutidev_token(txt)
        if ok_kd:
            return dec_kd, True
        return txt, False

    has_lig = any(ch in _NIRMALA_LIGATURES or ch in _REPH_SUFFIX_MAP for ch in txt)
    has_vis_i = "\u093f" in txt and (visual_order_mode or bool(_VISUAL_ORDER_DEVA_RE.search(txt)))
    has_paren_anusvara = ")ं" in txt or ")ँ" in txt or ")ः" in txt
    if not has_lig and not has_vis_i and not has_paren_anusvara and "पवूक" not in txt and "अनदु" not in txt:
        return txt, False

    if visual_order_mode or has_lig:
        s = txt.replace("\u012f", "\uf000").replace("\u0130", "\uf000").replace("\u093f", "\uf000")
        s = _I_ANUSVARA_SWAP_RE.sub("\\1\u0902\uf000", s)
        s = "".join(_NIRMALA_LIGATURES.get(ch, ch) for ch in s)

        def _reph_repl(m: re.Match[str]) -> str:
            pre_i = "\u093f" if m.group(1) else ""
            cluster = m.group(2)
            suffix = _REPH_SUFFIX_MAP.get(m.group(3), "")
            return "\u0930\u094d" + cluster + pre_i + suffix

        s = _CONS_CLUSTER_REPH_RE.sub(_reph_repl, s)
        for _ in range(4):
            nxt = _TAGGED_VISUAL_I_RE.sub("\\1\u093f", s)
            if nxt == s:
                break
            s = nxt
        s = s.replace("\uf000", "\u093f")
    else:
        s = txt
        for _ in range(3):
            nxt = _SAFE_LOGICAL_I_RE.sub("\\1\\2\u093f", s)
            if nxt == s:
                break
            s = nxt

    # Repair trailing anusvara/chandrabindu pushed outside closing paren ("(हां/नही)ं" -> "(हां/नहीं)")
    s = re.sub(r"([\u0900-\u097f])\)(?:[\u0901\u0902\u0903])", lambda m: m.group(0)[0] + m.group(0)[-1] + ")", s)
    # Repair swapped u/uu matras inside broken NirmalaUI words (e.g. अनदुेशो -> अनुदेशो, ध्यानपवूक -> ध्यानपूर्वक)
    if "पवूक" in s:
        s = s.replace("ध्यानपवूक", "ध्यानपूर्वक").replace("पवूक", "पूर्वक")
    if "अनदु" in s:
        s = _U_MATRA_SWAP_RE.sub("\\1\\3\\2\\4", s)
    return s, False


def _is_corrupted_indic_token(txt: str, font_name: str = "") -> bool:
    if not txt or not txt.strip():
        return False
    if _LEGACY_INDIC_FONT_RE.search(font_name or ""):
        # Legacy ASCII-encoded Devanagari font (e.g. KrutiDev010)
        return bool(re.search(r"[A-Za-z;{}\[\]<>?]", txt))
    if _CORRUPT_CMAP_CH_RE.search(txt):
        return True
    if _VISUAL_ORDER_DEVA_RE.search(txt.strip()):
        return True
    if _STANDALONE_DEVA_MARK_RE.match(txt.strip()):
        return True
    return False


def _repair_corrupted_indic_runs(
    page: fitz.Page,
    tokens: list[dict[str, Any]],
    inv_pt_to_px: float,
) -> list[dict[str, Any]]:
    """
    Repair corrupted-CMap / legacy-Indic-font Hindi tokens on a born-digital page.
    Fast path: deterministic NirmalaUI/KrutiDev decoding (< 1 ms, zero subprocesses).
    Fallback (only for unknown custom fonts): single-DisplayList clip extraction +
    deduplicated in-memory BMP stdin sprite `tesseract --oem 1` batch OCR.
    """
    import shutil
    import subprocess
    from ocr_engine import get_installed_tesseract_langs

    # Fast Pass 0: Deterministic microsecond CMap & visual-order decoding before any OCR subprocess
    visual_order_mode = any(
        _CORRUPT_CMAP_CH_RE.search(t["text"]) or _VISUAL_ORDER_DEVA_RE.search(t["text"])
        for t in tokens
    )
    for tok in tokens:
        dec, resolved_legacy = _decode_deterministic_indic_cmap(
            tok["text"], tok.get("font", ""), visual_order_mode=visual_order_mode
        )
        if dec != tok["text"]:
            tok["text"] = dec
            if resolved_legacy:
                tok["font"] = "NirmalaUI"

    corrupt_indices = [
        idx
        for idx, tok in enumerate(tokens)
        if _is_corrupted_indic_token(tok["text"], tok.get("font", ""))
    ]
    if not corrupt_indices:
        return tokens

    tess_bin = shutil.which("tesseract")
    installed_langs = get_installed_tesseract_langs() if tess_bin else set()
    if not tess_bin:
        return tokens
    if installed_langs and "hin" not in installed_langs:
        tess_lang = "eng"
    else:
        tess_lang = "hin"

    # Group tokens by horizontal line cluster (vertical center overlap)
    line_groups: list[list[int]] = []
    all_sorted_idx = sorted(range(len(tokens)), key=lambda i: ((tokens[i]["y0_pt"] + tokens[i]["y1_pt"]) * 0.5, tokens[i]["x0_pt"]))
    for i in all_sorted_idx:
        t = tokens[i]
        cy = (t["y0_pt"] + t["y1_pt"]) * 0.5
        lh = max(4.0, t["y1_pt"] - t["y0_pt"])
        if not line_groups:
            line_groups.append([i])
            continue
        prev_t = tokens[line_groups[-1][0]]
        prev_cy = (prev_t["y0_pt"] + prev_t["y1_pt"]) * 0.5
        prev_lh = max(4.0, prev_t["y1_pt"] - prev_t["y0_pt"])
        if abs(cy - prev_cy) <= max(3.5, min(lh, prev_lh) * 0.60):
            line_groups[-1].append(i)
        else:
            line_groups.append([i])

    # Build contiguous Devanagari/corrupted phrase runs inside each line (leaving pure ASCII/punct untouched)
    runs: list[list[int]] = []
    for lg in line_groups:
        lg.sort(key=lambda i: tokens[i]["x0_pt"])
        cur_run: list[int] = []
        cur_has_bad = False
        cur_x1 = -1e9
        for i in lg:
            tok = tokens[i]
            tx = tok["text"].strip()
            fn = tok.get("font", "")
            bad = _is_corrupted_indic_token(tx, fn)
            is_deva = bool(_DEVANAGARI_OR_CORRUPT_RE.search(tx) or _LEGACY_INDIC_FONT_RE.search(fn))
            # Keep punctuation delimiters (`/`, `(`, `)`, `:`, digits, English words) OUTSIDE crop boxes!
            is_punct_or_ascii = bool(_PURE_ASCII_OR_PUNCT_RE.match(tx)) and not _LEGACY_INDIC_FONT_RE.search(fn)
            if is_deva and not is_punct_or_ascii:
                if not cur_run:
                    cur_run = [i]
                    cur_has_bad = bad
                    cur_x1 = tok["x1_pt"]
                elif (tok["x0_pt"] - cur_x1) <= 18.0:
                    cur_run.append(i)
                    cur_has_bad = cur_has_bad or bad
                    cur_x1 = max(cur_x1, tok["x1_pt"])
                else:
                    if cur_has_bad and cur_run:
                        runs.append(cur_run)
                    cur_run = [i]
                    cur_has_bad = bad
                    cur_x1 = tok["x1_pt"]
            else:
                if cur_has_bad and cur_run:
                    runs.append(cur_run)
                cur_run = []
                cur_has_bad = False
        if cur_has_bad and cur_run:
            runs.append(cur_run)

    if not runs:
        return tokens

    # Render tight clipped run strips using ONE shared DisplayList (avoids rebuilding page DisplayList per clip)
    # and deduplicate identical corrupted word keys before running Tesseract stdin BMP batches.
    ocr_dpi = 300
    sc = float(ocr_dpi) / 72.0
    render_mat = fitz.Matrix(sc, sc)
    pw_pt = max(1.0, float(page.rect.width))
    ph_pt = max(1.0, float(page.rect.height))
    dlist = page.get_displaylist()

    crop_entries: list[tuple[list[int], np.ndarray, list[tuple[float, float]]]] = []
    orig_run_keys: dict[tuple[int, ...], tuple[str, ...]] = {}
    seen_run_keys: set[tuple[str, ...]] = set()
    all_runs_meta: list[tuple[list[int], tuple[str, ...]]] = []

    for run in runs:
        rkey = tuple(tokens[i]["text"] for i in run)
        orig_run_keys[tuple(run)] = rkey
        all_runs_meta.append((run, rkey))
        if rkey in seen_run_keys:
            continue
        seen_run_keys.add(rkey)
        rx0 = min(tokens[i]["x0_pt"] for i in run)
        ry0 = min(tokens[i]["y0_pt"] for i in run)
        rx1 = max(tokens[i]["x1_pt"] for i in run)
        ry1 = max(tokens[i]["y1_pt"] for i in run)
        lh_pt = max(4.0, ry1 - ry0)
        pad_x_pt = max(1.5, lh_pt * 0.10)
        pad_y_pt = max(2.2, lh_pt * 0.34)
        cx0_pt = max(0.0, rx0 - pad_x_pt)
        cy0_pt = max(0.0, ry0 - pad_y_pt)
        cx1_pt = min(pw_pt, rx1 + pad_x_pt)
        cy1_pt = min(ph_pt, ry1 + pad_y_pt)
        if cx1_pt - cx0_pt < 2.0 or cy1_pt - cy0_pt < 2.0:
            continue
        clip_pix = dlist.get_pixmap(matrix=render_mat, clip=fitz.Rect(cx0_pt, cy0_pt, cx1_pt, cy1_pt), alpha=False)
        try:
            cr_arr = np.frombuffer(clip_pix.samples, dtype=np.uint8).reshape(clip_pix.height, clip_pix.width, clip_pix.n).copy()
            if clip_pix.n == 1:
                gray_c = cr_arr[:, :, 0]
            elif clip_pix.n == 3:
                gray_c = cv2.cvtColor(cr_arr, cv2.COLOR_RGB2GRAY)
            else:
                gray_c = cv2.cvtColor(cr_arr[:, :, :3], cv2.COLOR_RGB2GRAY)
        finally:
            del clip_pix

        gray_c[gray_c > 224] = 255
        ch_c, cw_c = gray_c.shape[:2]
        if cw_c >= 110 or ch_c >= 85:
            bin_c = (gray_c < 145).astype(np.uint8) * 255
            border_c = np.zeros_like(bin_c)
            if cw_c >= 110:
                border_c = cv2.bitwise_or(
                    border_c, cv2.morphologyEx(bin_c, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (90, 1)))
                )
            if ch_c >= 85:
                border_c = cv2.bitwise_or(
                    border_c, cv2.morphologyEx(bin_c, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, 65)))
                )
            if np.any(border_c):
                border_c = cv2.dilate(border_c, np.ones((3, 3), np.uint8))
                gray_c[border_c > 0] = 255

        cr = cv2.copyMakeBorder(gray_c, 8, 8, 16, 16, cv2.BORDER_CONSTANT, value=255)
        rel_spans = [((tokens[i]["x0_pt"] - cx0_pt) * sc + 16.0, (tokens[i]["x1_pt"] - cx0_pt) * sc + 16.0) for i in run]
        crop_entries.append((run, cr, rel_spans))

    del dlist
    try:
        fitz.TOOLS.store_shrink(100)
    except Exception:
        pass

    if not crop_entries:
        return tokens

    # Run compact width-bucketed batched stdin-BMP sprite TSV OCR (<=25 strips & <=2200px height per batch)
    def _width_bucket(w_px: int) -> int:
        if w_px < 320:
            return 0
        if w_px < 900:
            return 1
        return 2

    tess_env = dict(os.environ, OMP_THREAD_LIMIT="1") if "OMP_THREAD_LIMIT" not in os.environ else None
    strip_gap = 44
    known_repairs: dict[tuple[str, ...], list[str]] = {}
    ordered_crops = sorted(crop_entries, key=lambda item: (_width_bucket(item[1].shape[1]), item[1].shape[1]))
    chunk_start = 0
    while chunk_start < len(ordered_crops):
        chunk: list[tuple[list[int], np.ndarray, list[tuple[float, float]]]] = []
        cur_h = strip_gap
        max_w = 180
        first_bucket = _width_bucket(ordered_crops[chunk_start][1].shape[1])
        while chunk_start < len(ordered_crops):
            item = ordered_crops[chunk_start]
            ih_c, iw_c = item[1].shape[:2]
            if chunk and (
                len(chunk) >= 25
                or cur_h + ih_c + strip_gap > 2200
                or _width_bucket(iw_c) != first_bucket
            ):
                break
            chunk.append(item)
            cur_h += ih_c + strip_gap
            max_w = max(max_w, iw_c + 64)
            chunk_start += 1

        canvas = np.full((cur_h, max_w), 255, dtype=np.uint8)
        bands: list[tuple[int, int]] = []
        y_cur = strip_gap
        for _, cr, _ in chunk:
            ch, cw = cr.shape[:2]
            canvas[y_cur : y_cur + ch, 32 : 32 + cw] = cr
            bands.append((y_cur, y_cur + ch))
            y_cur += ch + strip_gap

        tsv_lines: list[str] = []
        try:
            ok_bmp, bmp_buf = cv2.imencode(".bmp", canvas)
            if ok_bmp:
                proc = subprocess.run(
                    [tess_bin, "stdin", "stdout", "-l", tess_lang, "--oem", "1", "--psm", "6", "tsv"],
                    input=bmp_buf.tobytes(),
                    capture_output=True,
                    timeout=15,
                    env=tess_env,
                    check=False,
                )
                if proc.returncode == 0 and proc.stdout:
                    tsv_lines = proc.stdout.decode("utf-8", errors="replace").splitlines()[1:]
        except Exception as ocr_exc:
            logger.debug(f"[CMapRepair] Sprite OCR batch skipped: {ocr_exc}")
            tsv_lines = []

        if not tsv_lines:
            continue

        per_band_words: list[list[tuple[float, str, float]]] = [[] for _ in chunk]
        for tln in tsv_lines:
            cols = tln.split("\t")
            if len(cols) < 12:
                continue
            wtxt = (cols[11] or "").strip().strip("|“”‘")
            if not wtxt:
                continue
            try:
                wx = float(cols[6]) - 32.0
                wy = float(cols[7]) + float(cols[9]) * 0.5
                wconf = max(0.0, min(1.0, float(cols[10]) / 100.0))
            except Exception:
                continue
            if wconf < 0.04:
                continue
            best_bi = -1
            best_dist = 1e9
            for bi, (by0, by1) in enumerate(bands):
                b_mid = (by0 + by1) * 0.5
                b_half = (by1 - by0) * 0.5 + 16.0
                dist = abs(wy - b_mid)
                if dist <= b_half and dist < best_dist:
                    best_dist = dist
                    best_bi = bi
            if best_bi >= 0:
                per_band_words[best_bi].append((wx, wtxt, wconf))

        for bi, (run, _, rel_spans) in enumerate(chunk):
            tess_w = sorted(per_band_words[bi], key=lambda item: item[0])
            if not tess_w:
                continue
            clean_tess: list[str] = []
            for _wx, wt, _wc in tess_w:
                wt_clean = re.sub(r"^['\"?।|/\\]+|['\"|/\\]+$", "", wt).strip()
                if wt_clean:
                    clean_tess.append(wt_clean)
            if not clean_tess:
                continue

            raw_key = orig_run_keys.get(tuple(run), ())
            if len(clean_tess) == len(run):
                all_clean_deva = True
                for pos, tok_idx in enumerate(run):
                    orig_tx = tokens[tok_idx]["text"]
                    orig_fn = tokens[tok_idx].get("font", "")
                    if not _is_corrupted_indic_token(orig_tx, orig_fn):
                        continue
                    rep = clean_tess[pos]
                    if re.search(r"[\u0900-\u097f]", rep):
                        tokens[tok_idx]["text"] = rep
                        tokens[tok_idx]["conf"] = 0.80
                    else:
                        tokens[tok_idx]["conf"] = 0.38
                        all_clean_deva = False
                if all_clean_deva and raw_key and all(re.search(r"[\u0900-\u097f]", t) for t in clean_tess):
                    known_repairs.setdefault(raw_key, list(clean_tess))
            else:
                joined_rep = " ".join(clean_tess)
                if re.search(r"[\u0900-\u097f]", joined_rep):
                    tokens[run[0]]["text"] = joined_rep
                    tokens[run[0]]["x1_pt"] = max(tokens[i]["x1_pt"] for i in run)
                    tokens[run[0]]["conf"] = 0.80
                    for drop_idx in run[1:]:
                        tokens[drop_idx]["drop"] = True
                    if raw_key:
                        known_repairs.setdefault(raw_key, [joined_rep])

    # Apply exact cached clean repairs across all duplicate runs (same CMap font subset)
    if known_repairs:
        for run, rkey in all_runs_meta:
            active_run = [i for i in run if not tokens[i].get("drop")]
            if not active_run or not any(_is_corrupted_indic_token(tokens[i]["text"], tokens[i].get("font", "")) for i in active_run):
                continue
            cached = known_repairs.get(rkey)
            if not cached:
                continue
            if len(cached) == len(active_run):
                for pos, tok_idx in enumerate(active_run):
                    tokens[tok_idx]["text"] = cached[pos]
                    tokens[tok_idx]["conf"] = 0.82
            else:
                tokens[active_run[0]]["text"] = " ".join(cached)
                tokens[active_run[0]]["x1_pt"] = max(tokens[i]["x1_pt"] for i in active_run)
                tokens[active_run[0]]["conf"] = 0.82
                for drop_idx in active_run[1:]:
                    tokens[drop_idx]["drop"] = True

    # Single batched 2.5x stdin-BMP retry for any leftover short runs missed by first pass
    still_bad_entries = [
        (run, cr)
        for run, cr, _ in crop_entries
        if any(not tokens[i].get("drop") and _is_corrupted_indic_token(tokens[i]["text"], tokens[i].get("font", "")) for i in run)
    ]
    if still_bad_entries:
        up_strips: list[tuple[list[int], np.ndarray]] = []
        up_h = 44
        up_w = 220
        for run, cr in still_bad_entries:
            active_run = [i for i in run if not tokens[i].get("drop")]
            if not active_run:
                continue
            cr_up = cv2.resize(cr, None, fx=2.5, fy=2.5, interpolation=cv2.INTER_CUBIC)
            up_strips.append((active_run, cr_up))
            up_h += cr_up.shape[0] + 44
            up_w = max(up_w, cr_up.shape[1] + 64)
        if up_strips:
            up_canvas = np.full((up_h, up_w), 255, dtype=np.uint8)
            up_bands: list[tuple[int, int]] = []
            yc = 44
            for _, cr_up in up_strips:
                uh, uw = cr_up.shape[:2]
                up_canvas[yc : yc + uh, 32 : 32 + uw] = cr_up
                up_bands.append((yc, yc + uh))
                yc += uh + 44
            try:
                ok_up, bmp_up = cv2.imencode(".bmp", up_canvas)
                if ok_up:
                    proc7 = subprocess.run(
                        [tess_bin, "stdin", "stdout", "-l", tess_lang, "--oem", "1", "--psm", "6", "tsv"],
                        input=bmp_up.tobytes(),
                        capture_output=True,
                        timeout=12,
                        env=tess_env,
                        check=False,
                    )
                    if proc7.returncode == 0 and proc7.stdout:
                        up_band_words: list[list[tuple[float, str]]] = [[] for _ in up_strips]
                        for tln in proc7.stdout.decode("utf-8", errors="replace").splitlines()[1:]:
                            cols = tln.split("\t")
                            if len(cols) < 12 or not (cols[11] or "").strip():
                                continue
                            try:
                                wx = float(cols[6])
                                wy = float(cols[7]) + float(cols[9]) * 0.5
                            except Exception:
                                continue
                            best_bi = -1
                            best_d = 1e9
                            for bi, (by0, by1) in enumerate(up_bands):
                                d = abs(wy - (by0 + by1) * 0.5)
                                if d <= (by1 - by0) * 0.5 + 20.0 and d < best_d:
                                    best_d = d
                                    best_bi = bi
                            if best_bi >= 0:
                                up_band_words[best_bi].append((wx, cols[11].strip()))
                        for bi, (active_run, _) in enumerate(up_strips):
                            rep_txt = " ".join(w for _, w in sorted(up_band_words[bi], key=lambda x: x[0]))
                            rep_txt = re.sub(r"^[|'\"`_\\/\[\]]+|[|'\"`_\\/\[\].]+$", "", rep_txt).strip()
                            if not rep_txt or not re.search(r"[\u0900-\u097f]", rep_txt):
                                continue
                            first_raw = tokens[active_run[0]]["text"].strip()
                            last_raw = tokens[active_run[-1]]["text"].strip()
                            if first_raw.startswith("(") and not rep_txt.startswith("("):
                                rep_txt = "(" + rep_txt
                            if last_raw.endswith(")") and not rep_txt.endswith(")"):
                                rep_txt = rep_txt + ")"
                            rep_parts = rep_txt.split()
                            rkey = orig_run_keys.get(tuple(active_run), ())
                            if len(rep_parts) == len(active_run):
                                for pos, tok_idx in enumerate(active_run):
                                    if _is_corrupted_indic_token(tokens[tok_idx]["text"], tokens[tok_idx].get("font", "")):
                                        tokens[tok_idx]["text"] = rep_parts[pos]
                                        tokens[tok_idx]["conf"] = 0.78
                                if rkey:
                                    known_repairs.setdefault(rkey, rep_parts)
                            else:
                                tokens[active_run[0]]["text"] = rep_txt
                                tokens[active_run[0]]["x1_pt"] = max(tokens[i]["x1_pt"] for i in active_run)
                                tokens[active_run[0]]["conf"] = 0.78
                                for drop_idx in active_run[1:]:
                                    tokens[drop_idx]["drop"] = True
                                if rkey:
                                    known_repairs.setdefault(rkey, [rep_txt])
            except Exception:
                pass

    return [tok for tok in tokens if not tok.get("drop")]


def _extract_digital_words_with_styles(
    page: fitz.Page, inv_pt_to_px: float
) -> tuple[list[OCRWord], dict[int, tuple[float, bool, tuple[int, int, int]]]]:
    """
    Extract born-digital words cleanly via PyMuPDF `rawdict` while:
    - Filtering diagonal gray overlay watermarks (`dir != (1,0)`) WITHOUT falsely erasing overlapping horizontal text
    - Filtering vertical/top/bottom repeating border strips and isolated decorative symbol fonts
    - Gluing split-span Hindi characters and repairing corrupted ToUnicode CMap / KrutiDev words locally
    """
    words_px: list[OCRWord] = []
    style_by_word_idx: dict[int, tuple[float, bool, tuple[int, int, int]]] = {}
    pw = max(1.0, float(page.rect.width))
    ph = max(1.0, float(page.rect.height))

    raw_tokens: list[dict[str, Any]] = []
    try:
        rdict = page.get_text("rawdict", flags=fitz.TEXTFLAGS_RAWDICT)
        # Collect opaque foreground images (JPEG or high-opacity non-white PNG regions) with stream index
        # so placeholder text drawn underneath an opaque portrait photo (e.g. "Uploaded photo of candidate") is skipped.
        fg_opaque_imgs: list[tuple[int, float, float, float, float, Optional[np.ndarray], Optional[np.ndarray]]] = []
        blocks = rdict.get("blocks", [])
        for b_idx, blk in enumerate(blocks):
            if blk.get("type") != 1:
                continue
            ibb = blk.get("bbox")
            if not ibb or len(ibb) < 4:
                continue
            ix0, iy0, ix1, iy1 = float(ibb[0]), float(ibb[1]), float(ibb[2]), float(ibb[3])
            if (ix1 - ix0) * (iy1 - iy0) < 1200.0:
                continue
            ext = str(blk.get("ext", "") or "").lower()
            img_bytes = blk.get("image")
            mask_bytes = blk.get("mask")
            img_arr = None
            mask_arr = None
            if img_bytes:
                img_arr = cv2.imdecode(np.frombuffer(img_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
            if mask_bytes:
                mask_arr = cv2.imdecode(np.frombuffer(mask_bytes, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
            if ext in ("jpeg", "jpg") or mask_arr is not None or img_arr is not None:
                fg_opaque_imgs.append((b_idx, ix0, iy0, ix1, iy1, img_arr, mask_arr))

        def _is_occluded_by_fg_img(txt_idx: int, bx0: float, by0: float, bx1: float, by1: float) -> bool:
            b_area = max(1.0, (bx1 - bx0) * (by1 - by0))
            for i_idx, ix0, iy0, ix1, iy1, i_arr, m_arr in fg_opaque_imgs:
                if i_idx <= txt_idx:
                    continue
                inter_w = max(0.0, min(bx1, ix1) - max(bx0, ix0))
                inter_h = max(0.0, min(by1, iy1) - max(by0, iy0))
                if (inter_w * inter_h) / b_area < 0.78:
                    continue
                iw_pt, ih_pt = max(1e-3, ix1 - ix0), max(1e-3, iy1 - iy0)
                if m_arr is not None and m_arr.size > 0:
                    mh, mw = m_arr.shape[:2]
                    mx0 = max(0, min(mw - 1, int(((bx0 - ix0) / iw_pt) * mw)))
                    mx1 = max(mx0 + 1, min(mw, int(((bx1 - ix0) / iw_pt) * mw)))
                    my0 = max(0, min(mh - 1, int(((by0 - iy0) / ih_pt) * mh)))
                    my1 = max(my0 + 1, min(mh, int(((by1 - iy0) / ih_pt) * mh)))
                    if float(np.mean(m_arr[my0:my1, mx0:mx1])) < 185.0:
                        continue
                if i_arr is not None and i_arr.size > 0:
                    ih_px, iw_px = i_arr.shape[:2]
                    rx0 = max(0, min(iw_px - 1, int(((bx0 - ix0) / iw_pt) * iw_px)))
                    rx1 = max(rx0 + 1, min(iw_px, int(((bx1 - ix0) / iw_pt) * iw_px)))
                    ry0 = max(0, min(ih_px - 1, int(((by0 - iy0) / ih_pt) * ih_px)))
                    ry1 = max(ry0 + 1, min(ih_px, int(((by1 - iy0) / ih_pt) * ih_px)))
                    crop_i = i_arr[ry0:ry1, rx0:rx1]
                    if crop_i.size > 0 and float(np.mean(np.min(crop_i, axis=2) < 242)) < 0.25:
                        continue
                return True
            return False

        for b_idx, blk in enumerate(blocks):
            if blk.get("type") != 0:
                continue
            bbb = blk.get("bbox")
            if bbb and len(bbb) >= 4 and fg_opaque_imgs:
                if _is_occluded_by_fg_img(b_idx, float(bbb[0]), float(bbb[1]), float(bbb[2]), float(bbb[3])):
                    continue
            for ln in blk.get("lines", []):
                ldir = ln.get("dir", (1.0, 0.0))
                dx = float(ldir[0]) if len(ldir) >= 2 else 1.0
                dy = float(ldir[1]) if len(ldir) >= 2 else 0.0
                is_diagonal = abs(dx) < 0.90 and abs(dy) < 0.90
                is_vertical = abs(dy) > 0.90

                line_tokens: list[dict[str, Any]] = []
                pending_ws = False
                for sp in ln.get("spans", []):
                    sbbox = sp.get("bbox")
                    if not sbbox or len(sbbox) < 4:
                        continue
                    sx0, sy0, sx1, sy1 = float(sbbox[0]), float(sbbox[1]), float(sbbox[2]), float(sbbox[3])
                    sz = float(sp.get("size", 10.0) or 10.0)
                    fname = str(sp.get("font", "") or "")
                    fname_l = fname.lower()
                    flags = int(sp.get("flags", 0) or 0)
                    is_b = bool(flags & 16) or any(t in fname_l for t in ("bold", "black", "heavy", "demi", "semi"))
                    raw_col = int(sp.get("color", 0) or 0)
                    rgb = ((raw_col >> 16) & 0xFF, (raw_col >> 8) & 0xFF, raw_col & 0xFF)

                    # Skip diagonal faint/large watermarks cleanly
                    if is_diagonal and (min(rgb) >= 145 or sz >= 13.0):
                        continue
                    # Skip rotated vertical repeating security margin strips
                    if is_vertical and sz <= 6.6 and (sx1 < pw * 0.06 or sx0 > pw * 0.94):
                        continue
                    # Skip decorative symbol icon fonts (e.g. Wingdings scissors icon)
                    if "wingding" in fname_l or "webding" in fname_l or "zapfdingbat" in fname_l:
                        continue

                    chars = sp.get("chars") or []
                    cur_t = ""
                    cur_b: Optional[list[float]] = None
                    cur_after_ws = pending_ws

                    def _flush_tok():
                        nonlocal cur_t, cur_b, cur_after_ws
                        if cur_t and cur_b is not None:
                            line_tokens.append(
                                {
                                    "text": cur_t,
                                    "x0_pt": cur_b[0],
                                    "y0_pt": cur_b[1],
                                    "x1_pt": cur_b[2],
                                    "y1_pt": cur_b[3],
                                    "sz": sz,
                                    "bold": is_b,
                                    "rgb": rgb,
                                    "font": fname,
                                    "conf": 0.995,
                                    "after_ws": cur_after_ws,
                                }
                            )
                        cur_t = ""
                        cur_b = None

                    for ch in chars:
                        c = str(ch.get("c", "") or "")
                        cb = ch.get("bbox")
                        if not c or c.isspace():
                            _flush_tok()
                            pending_ws = True
                            continue
                        if cb and len(cb) >= 4:
                            cx0, cy0, cx1, cy1 = float(cb[0]), float(cb[1]), float(cb[2]), float(cb[3])
                            if not cur_t:
                                cur_after_ws = pending_ws
                                pending_ws = False
                            cur_t += c
                            if cur_b is None:
                                cur_b = [cx0, cy0, cx1, cy1]
                            else:
                                cur_b[0] = min(cur_b[0], cx0)
                                cur_b[1] = min(cur_b[1], cy0)
                                cur_b[2] = max(cur_b[2], cx1)
                                cur_b[3] = max(cur_b[3], cy1)
                    _flush_tok()

                if not line_tokens:
                    continue

                # Skip horizontal tiny repeating security border banners along top/bottom page edge
                l_y0 = min(t["y0_pt"] for t in line_tokens)
                l_y1 = max(t["y1_pt"] for t in line_tokens)
                l_sz = max(t["sz"] for t in line_tokens)
                l_txt = " ".join(t["text"] for t in line_tokens)
                if l_sz <= 6.2 and (l_y1 < ph * 0.032 or l_y0 > ph * 0.970) and len(l_txt) >= 48:
                    tok_words = l_txt.split()
                    if len(tok_words) >= 6 and len(set(tok_words)) <= max(3, len(tok_words) // 2):
                        continue

                raw_tokens.extend(line_tokens)
    except Exception:
        raw_tokens = []

    if raw_tokens:
        # Page-wide horizontal line grouping & Indic span gluing across split blocks/fonts
        raw_tokens.sort(key=lambda t: ((t["y0_pt"] + t["y1_pt"]) * 0.5, t["x0_pt"]))
        page_lines: list[list[dict[str, Any]]] = []
        for tok in raw_tokens:
            cy = (tok["y0_pt"] + tok["y1_pt"]) * 0.5
            lh = max(4.0, tok["y1_pt"] - tok["y0_pt"])
            if not page_lines:
                page_lines.append([tok])
                continue
            p0 = page_lines[-1][0]
            pcy = (p0["y0_pt"] + p0["y1_pt"]) * 0.5
            plh = max(4.0, p0["y1_pt"] - p0["y0_pt"])
            if abs(cy - pcy) <= max(3.5, min(lh, plh) * 0.60):
                page_lines[-1].append(tok)
            else:
                page_lines.append([tok])

        glued_tokens: list[dict[str, Any]] = []
        for pl in page_lines:
            pl.sort(key=lambda t: t["x0_pt"])
            merged_line: list[dict[str, Any]] = []
            for tok in pl:
                tx = tok["text"]
                if not tx:
                    continue
                if not merged_line:
                    merged_line.append(tok)
                    continue
                prev = merged_line[-1]
                gap = tok["x0_pt"] - prev["x1_pt"]
                sz_match = abs(tok["sz"] - prev["sz"]) <= 2.2
                prev_is_deva = bool(_DEVANAGARI_OR_CORRUPT_RE.search(prev["text"]))
                tx_is_deva = bool(_DEVANAGARI_OR_CORRUPT_RE.search(tx))
                is_combining_mark = bool(_STANDALONE_DEVA_MARK_RE.match(tx.strip()))

                # Repair space-before-anusvara ("ʃीदवारो ंको" -> "ʃीदवारों को"), `) ं` ("(हां/नही) ं" -> "(हां/नहीं)"),
                # space-before-matra ("डŌ ाइिवंग" -> "डŌाइिवंग"), and split virama/ligatures ("कŐ ū" -> "केंद्र", "िश͆ ट" -> "शिफ़्ट")
                if prev_is_deva and gap <= max(5.5, tok["sz"] * 0.72) and sz_match:
                    if tx[0] in ("\u0901", "\u0902", "\u0903"):
                        if prev["text"].endswith(")") and len(prev["text"]) >= 2 and bool(_DEVANAGARI_OR_CORRUPT_RE.search(prev["text"][-2])):
                            prev["text"] = prev["text"][:-1] + tx[0] + ")"
                        else:
                            prev["text"] += tx[0]
                        tx = tx[1:]
                        if not tx:
                            prev["x1_pt"] = max(prev["x1_pt"], tok["x1_pt"])
                            continue
                        tok["text"] = tx
                    elif tx[0] in "\u093e\u0940\u0941\u0942\u0943\u0947\u0948\u094b\u094c\u094d":
                        prev["text"] += tx
                        prev["x1_pt"] = max(prev["x1_pt"], tok["x1_pt"])
                        prev["y0_pt"] = min(prev["y0_pt"], tok["y0_pt"])
                        prev["y1_pt"] = max(prev["y1_pt"], tok["y1_pt"])
                        continue
                    elif prev["text"].endswith("\u0346") or (prev["text"] == "कŐ" and tx.startswith("\u016b")):
                        prev["text"] += tx
                        prev["x1_pt"] = max(prev["x1_pt"], tok["x1_pt"])
                        prev["y0_pt"] = min(prev["y0_pt"], tok["y0_pt"])
                        prev["y1_pt"] = max(prev["y1_pt"], tok["y1_pt"])
                        continue

                same_indic_word = (
                    not tok.get("after_ws", False)
                    and gap <= max(1.2, tok["sz"] * 0.15)
                    and sz_match
                    and prev_is_deva
                    and tx_is_deva
                    and not _PURE_ASCII_OR_PUNCT_RE.match(prev["text"][-1:])
                    and not _PURE_ASCII_OR_PUNCT_RE.match(tx[:1])
                )
                if is_combining_mark or same_indic_word:
                    prev["text"] += tx
                    prev["x1_pt"] = max(prev["x1_pt"], tok["x1_pt"])
                    prev["y0_pt"] = min(prev["y0_pt"], tok["y0_pt"])
                    prev["y1_pt"] = max(prev["y1_pt"], tok["y1_pt"])
                else:
                    merged_line.append(tok)
            glued_tokens.extend(merged_line)

        raw_tokens = _repair_corrupted_indic_runs(page, glued_tokens, inv_pt_to_px)
        for tok in raw_tokens:
            w_idx = len(words_px)
            words_px.append(
                OCRWord(
                    text=tok["text"],
                    x0=tok["x0_pt"] * inv_pt_to_px,
                    y0=tok["y0_pt"] * inv_pt_to_px,
                    x1=tok["x1_pt"] * inv_pt_to_px,
                    y1=tok["y1_pt"] * inv_pt_to_px,
                    conf=float(tok.get("conf", 0.995)),
                )
            )
            style_by_word_idx[w_idx] = (
                max(6.0, min(28.0, round(float(tok["sz"]) * 2.0) / 2.0)),
                bool(tok["bold"]),
                tuple(tok["rgb"]),  # type: ignore[arg-type]
            )
        return words_px, style_by_word_idx

    # Minimal fallback if rawdict unavailable
    for wt in page.get_text("words") or []:
        if len(wt) < 5 or not str(wt[4]).strip():
            continue
        words_px.append(
            OCRWord(
                text=str(wt[4]).strip(),
                x0=float(wt[0]) * inv_pt_to_px,
                y0=float(wt[1]) * inv_pt_to_px,
                x1=float(wt[2]) * inv_pt_to_px,
                y1=float(wt[3]) * inv_pt_to_px,
                conf=0.995,
            )
        )
    return words_px, style_by_word_idx


def _ocr_embedded_raster_boxes(
    img_deskewed_bgr: np.ndarray,
    native_words_px: list[OCRWord],
    assets: list[VisualAsset],
    px_to_pt: float,
    *,
    latin_font: Optional[fitz.Font] = None,
    dev_font: Optional[fitz.Font] = None,
    lang: str = "auto",
) -> tuple[list[OCRWord], list[VisualAsset], bool]:
    """
    Run fast local OCR cropped ONLY on large text-free embedded raster boxes
    inside a born-digital PDF (e.g., pasted table screenshots, scanned clauses, stamped labels)
    while leaving human photos, QRs, logos, and cursive signatures untouched.
    Returns `(promoted_ocr_words_px, kept_assets, embedded_ocr_uncertain)`.
    """
    ih, iw = img_deskewed_bgr.shape[:2]
    inv_scale = 1.0 / max(1e-6, px_to_pt)
    promoted_words: list[OCRWord] = []
    kept_assets: list[VisualAsset] = []
    embedded_uncertain = False
    l_font = latin_font or fitz.Font("helv")

    for asset in assets:
        w_pt = asset.x1 - asset.x0
        h_pt = asset.y1 - asset.y0
        aspect = w_pt / max(1.0, h_pt)
        # Skip portraits, QRs, small badges, and thin signature strips
        if asset.kind in ("photo", "qr", "signature") or w_pt < 105.0 or h_pt < 36.0 or (w_pt * h_pt) < 4600.0:
            kept_assets.append(asset)
            continue

        ax0 = max(0, int(math.floor(asset.x0 * inv_scale)))
        ay0 = max(0, int(math.floor(asset.y0 * inv_scale)))
        ax1 = min(iw, int(math.ceil(asset.x1 * inv_scale)))
        ay1 = min(ih, int(math.ceil(asset.y1 * inv_scale)))

        # If native digital text already lives inside this graphic, keep graphic as background/asset
        inside_native = sum(
            1
            for nw in native_words_px
            if (ax0 - 2) <= ((nw.x0 + nw.x1) * 0.5) <= (ax1 + 2)
            and (ay0 - 2) <= ((nw.y0 + nw.y1) * 0.5) <= (ay1 + 2)
        )
        if inside_native >= 2:
            kept_assets.append(asset)
            continue

        crop = img_deskewed_bgr[ay0:ay1, ax0:ax1]
        if crop.size == 0:
            kept_assets.append(asset)
            continue

        crop_gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        bright_bg_frac = float(np.mean(crop_gray > 210))
        try:
            roi_words, _, _ = ocr_page_words_with_meta(
                crop, lang=lang, clean_watermarks=False, latin_font=l_font, dev_font=dev_font
            )
        except Exception as ocr_err:
            logger.debug(f"[Blueprint] Embedded raster OCR skip: {ocr_err}")
            roi_words = []

        valid_roi = [rw for rw in roi_words if len(rw.text.strip()) >= 2 and rw.conf >= 0.50]
        if not valid_roi:
            kept_assets.append(asset)
            continue

        avg_conf = sum(rw.conf for rw in valid_roi) / float(len(valid_roi))
        y_rows = sorted({int(round(((rw.y0 + rw.y1) * 0.5) / 14.0)) for rw in valid_roi})
        looks_like_text_block = (
            len(valid_roi) >= 4
            and (len(y_rows) >= 2 or w_pt >= 165.0)
            and h_pt >= 42.0
            and bright_bg_frac >= 0.32
            and avg_conf >= 0.72
            and aspect < 4.5
        )
        if looks_like_text_block:
            for rw in valid_roi:
                promoted_words.append(
                    OCRWord(
                        text=rw.text,
                        x0=float(ax0) + rw.x0,
                        y0=float(ay0) + rw.y0,
                        x1=float(ax0) + rw.x1,
                        y1=float(ay0) + rw.y1,
                        conf=rw.conf,
                    )
                )
            if avg_conf < 0.86 or any(rw.conf < 0.72 for rw in valid_roi):
                embedded_uncertain = True
        else:
            # Stamp/seal/caption graphic — preserve crisp visual crop, flag AI if large unreadable box
            kept_assets.append(asset)
            if len(valid_roi) >= 2 and w_pt >= 115.0 and h_pt >= 42.0 and avg_conf < 0.82:
                embedded_uncertain = True

    return promoted_words, kept_assets, embedded_uncertain


# ---------------------------------------------------------------------------
# Layer 1 Canvas, Border Detection & Layer 2/3 Structural Grouping Helpers
# ---------------------------------------------------------------------------


def _detect_page_border_rgb(img_deskewed_bgr: np.ndarray) -> Optional[tuple[int, int, int]]:
    """
    Detect an outer certificate/marksheet decorative frame or dual vertical margin ribbons
    (e.g. e-Mitra orange side banners or classic 4-sided page frame) while rejecting
    dark scanner edges and interior table borders.
    """
    ih, iw = img_deskewed_bgr.shape[:2]
    if ih < 80 or iw < 80:
        return None

    scale = min(1.0, 900.0 / float(max(ih, iw)))
    small = cv2.resize(img_deskewed_bgr, (max(48, int(iw * scale)), max(48, int(ih * scale))), interpolation=cv2.INTER_AREA) if scale < 0.99 else img_deskewed_bgr
    sh, sw = small.shape[:2]
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)

    # Reject pitch-black camera outer margins right along extreme outer 4px
    edge_black = (gray < 48) & (
        (np.arange(sh)[:, None] < 4)
        | (np.arange(sh)[:, None] >= sh - 4)
        | (np.arange(sw)[None, :] < 4)
        | (np.arange(sw)[None, :] >= sw - 4)
    )

    # Case A: Dual colorful vertical margin ribbons (e.g., e-Mitra orange/gold left+right borders)
    sat_mask = (hsv[:, :, 1] > 72) & (hsv[:, :, 2] > 88) & (hsv[:, :, 2] < 248) & (~edge_black)
    lx0, lx1 = max(2, int(sw * 0.005)), max(10, int(sw * 0.088))
    rx0, rx1 = min(sw - 10, int(sw * 0.912)), min(sw - 2, int(sw * 0.995))
    y_band0, y_band1 = int(sh * 0.04), int(sh * 0.96)
    l_cov = float(np.mean(np.sum(sat_mask[y_band0:y_band1, lx0:lx1], axis=1) >= 4)) if y_band1 > y_band0 else 0.0
    r_cov = float(np.mean(np.sum(sat_mask[y_band0:y_band1, rx0:rx1], axis=1) >= 4)) if y_band1 > y_band0 else 0.0
    if l_cov >= 0.70 and r_cov >= 0.70:
        ribbon_px = np.concatenate([
            small[y_band0:y_band1, lx0:lx1][sat_mask[y_band0:y_band1, lx0:lx1]],
            small[y_band0:y_band1, rx0:rx1][sat_mask[y_band0:y_band1, rx0:rx1]],
        ], axis=0)
        if len(ribbon_px) >= 40:
            med = np.median(ribbon_px, axis=0)
            rgb = (int(med[2]), int(med[1]), int(med[0]))
            if sum(rgb) < 690:
                return rgb

    # Case B: 4-sided rectangular page frame inside outer [1%..9.5%] margins
    cand = ((gray < 210) | ((hsv[:, :, 1] > 60) & (hsv[:, :, 2] < 242))) & (~edge_black)
    tx0, tx1 = int(sw * 0.02), int(sw * 0.98)
    ty0, ty1 = int(sh * 0.012), int(sh * 0.095)
    by0, by1 = int(sh * 0.905), int(sh * 0.988)
    vx0, vx1 = int(sw * 0.012), int(sw * 0.095)
    wx0, wx1 = int(sw * 0.905), int(sw * 0.988)
    vy0, vy1 = int(sh * 0.02), int(sh * 0.98)

    top_rows = np.mean(cand[ty0:ty1, tx0:tx1], axis=1) if ty1 > ty0 and tx1 > tx0 else np.zeros(1)
    bot_rows = np.mean(cand[by0:by1, tx0:tx1], axis=1) if by1 > by0 and tx1 > tx0 else np.zeros(1)
    left_cols = np.mean(cand[vy0:vy1, vx0:vx1], axis=0) if vy1 > vy0 and vx1 > vx0 else np.zeros(1)
    right_cols = np.mean(cand[vy0:vy1, wx0:wx1], axis=0) if vy1 > vy0 and wx1 > wx0 else np.zeros(1)

    edges_ok = sum(1 for arr in (top_rows, bot_rows, left_cols, right_cols) if float(np.max(arr)) >= 0.64)
    if edges_ok >= 3 and (float(np.max(top_rows)) >= 0.58 and float(np.max(bot_rows)) >= 0.58 or float(np.max(left_cols)) >= 0.68 and float(np.max(right_cols)) >= 0.68):
        samples: list[np.ndarray] = []
        t_idx = int(np.argmax(top_rows)) + ty0
        b_idx = int(np.argmax(bot_rows)) + by0
        if float(np.max(top_rows)) >= 0.58:
            samples.append(small[t_idx, tx0:tx1][cand[t_idx, tx0:tx1]])
        if float(np.max(bot_rows)) >= 0.58:
            samples.append(small[b_idx, tx0:tx1][cand[b_idx, tx0:tx1]])
        if samples:
            cat = np.concatenate(samples, axis=0)
            if len(cat) >= 20:
                med = np.median(cat, axis=0)
                rgb = (
                    max(35, min(220, int(med[2]))),
                    max(35, min(220, int(med[1]))),
                    max(35, min(220, int(med[0]))),
                )
                if sum(rgb) < 660:
                    return rgb

    return None


def _build_ink_free_background(
    img_deskewed_bgr: np.ndarray,
    table_boxes_px: list[tuple[int, int, int, int]],
    non_table_words_px: list[OCRWord],
    assets: list[VisualAsset],
    px_to_pt: float,
    text_lines: Optional[list[TextLine]] = None,
) -> Optional[bytes]:
    """
    Create Layer-1 Clean Canvas (`layered_replica` mode): preserves decorative side
    ribbons, certificates borders, paper texture, and watermarks (e.g. Rajasthan map),
    while inpainting out recognized foreground words, tables, and extracted visual assets
    so editable Layer-2/Layer-3 elements sit above with ZERO duplicate double-text ghosts.
    """
    ih, iw = img_deskewed_bgr.shape[:2]
    if ih < 40 or iw < 40:
        return None

    scale = min(1.0, 1250.0 / float(max(ih, iw)))
    wh = max(32, int(round(ih * scale)))
    ww = max(32, int(round(iw * scale)))
    work = cv2.resize(img_deskewed_bgr, (ww, wh), interpolation=cv2.INTER_AREA) if scale < 0.99 else img_deskewed_bgr.copy()
    gray = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY)
    inv_pt_to_work = (1.0 / max(1e-5, px_to_pt)) * scale

    erase_mask = np.zeros((wh, ww), dtype=np.uint8)

    def _non_watermark_ink_mask(roi_bgr: np.ndarray, roi_g: np.ndarray, dark_cutoff: float) -> np.ndarray:
        """Select neutral dark text strokes while preserving yellow watermarks and green checkmarks."""
        b_c = roi_bgr[:, :, 0].astype(np.int16)
        g_c = roi_bgr[:, :, 1].astype(np.int16)
        r_c = roi_bgr[:, :, 2].astype(np.int16)
        is_yellow_wm = (r_c > 150) & (g_c > 130) & (b_c < 130) & ((r_c - b_c) > 40)
        is_green_tick = (g_c > r_c + 14) & (g_c > b_c + 14)
        return (roi_g < dark_cutoff) & (~is_yellow_wm) & (~is_green_tick)

    # 1. Mask foreground ink strokes inside non-table words (keeps watermarks & green ticks underneath!)
    for w in non_table_words_px:
        x0 = max(0, int(math.floor(w.x0 * scale)) - 4)
        y0 = max(0, int(math.floor(w.y0 * scale)) - 4)
        x1 = min(ww, int(math.ceil(w.x1 * scale)) + 4)
        y1 = min(wh, int(math.ceil(w.y1 * scale)) + 4)
        if x1 <= x0 or y1 <= y0:
            continue
        roi_g = gray[y0:y1, x0:x1]
        if roi_g.size == 0:
            continue
        local_bg = float(np.percentile(roi_g, 90))
        cutoff = min(206.0, local_bg - 14.0)
        ink = _non_watermark_ink_mask(work[y0:y1, x0:x1], roi_g, cutoff)
        if not np.any(ink):
            ink = _non_watermark_ink_mask(work[y0:y1, x0:x1], roi_g, 178.0)
        erase_mask[y0:y1, x0:x1][ink] = 255

    # 1b. Also mask neutral dark stroke pixels along recognized TextLine strips so missed matras,
    # punctuation, or skipped tokens never remain as Layer-1 ghost ink under Layer-3 text.
    if text_lines:
        asset_rects_w = [
            (
                int(math.floor(a.x0 * inv_pt_to_work)) - 2,
                int(math.floor(a.y0 * inv_pt_to_work)) - 2,
                int(math.ceil(a.x1 * inv_pt_to_work)) + 2,
                int(math.ceil(a.y1 * inv_pt_to_work)) + 2,
            )
            for a in assets
        ]
        for ln in text_lines:
            x0 = max(0, int(math.floor(ln.x0 * inv_pt_to_work)) - 4)
            y0 = max(0, int(math.floor(ln.y0 * inv_pt_to_work)) - 4)
            x1 = min(ww, int(math.ceil(ln.x1 * inv_pt_to_work)) + 4)
            y1 = min(wh, int(math.ceil(ln.y1 * inv_pt_to_work)) + 4)
            if x1 <= x0 or y1 <= y0:
                continue
            line_ink = _non_watermark_ink_mask(work[y0:y1, x0:x1], gray[y0:y1, x0:x1], 168.0)
            for ax0, ay0, ax1, ay1 in asset_rects_w:
                ix0, iy0 = max(x0, ax0), max(y0, ay0)
                ix1, iy1 = min(x1, ax1), min(y1, ay1)
                if ix1 > ix0 and iy1 > iy0:
                    line_ink[(iy0 - y0) : (iy1 - y0), (ix0 - x0) : (ix1 - x0)] = False
            erase_mask[y0:y1, x0:x1][line_ink] = 255

        # 1c. Also sweep missed compact dark glyph blobs sitting inline in horizontal prose bands
        # (e.g. un-OCR'd numbers `/18111237936` or short Hindi words) while preserving underlines, photos & ribbons.
        band_rows = np.zeros(wh, dtype=bool)
        for ln in text_lines:
            ly0_w = max(0, int(math.floor(ln.y0 * inv_pt_to_work)) - 3)
            ly1_w = min(wh, int(math.ceil(ln.y1 * inv_pt_to_work)) + 3)
            if 0 < (ly1_w - ly0_w) <= 220:
                band_rows[ly0_w:ly1_w] = True
        if np.any(band_rows):
            b_all = work[:, :, 0].astype(np.int16)
            g_all = work[:, :, 1].astype(np.int16)
            r_all = work[:, :, 2].astype(np.int16)
            chroma_all = np.maximum(np.maximum(b_all, g_all), r_all) - np.minimum(np.minimum(b_all, g_all), r_all)
            dark_neutral = ((gray < 152) & (chroma_all < 42) & band_rows[:, None]).astype(np.uint8) * 255
            dark_neutral[:, : int(ww * 0.095)] = 0
            dark_neutral[:, int(ww * 0.895) :] = 0
            for ax0, ay0, ax1, ay1 in asset_rects_w:
                dark_neutral[max(0, ay0) : min(wh, ay1), max(0, ax0) : min(ww, ax1)] = 0
            for tx0_o, ty0_o, tx1_o, ty1_o in table_boxes_px:
                dark_neutral[
                    max(0, int(ty0_o * scale) - 2) : min(wh, int(ty1_o * scale) + 2),
                    max(0, int(tx0_o * scale) - 2) : min(ww, int(tx1_o * scale) + 2),
                ] = 0
            # Preserve long continuous horizontal rules/underlines (where >48% of body width is dark on a single row)
            body_w = max(1, int(ww * 0.80))
            row_dark_frac = np.sum(dark_neutral > 0, axis=1) / float(body_w)
            prose_ink = (dark_neutral > 0) & (row_dark_frac[:, None] < 0.48)
            erase_mask[prose_ink] = 255

    # 2. Cleanly erase table boxes (fill with surrounding paper tint + feather perimeter)
    for tx0_o, ty0_o, tx1_o, ty1_o in table_boxes_px:
        x0 = max(0, int(math.floor(tx0_o * scale)) - 4)
        y0 = max(0, int(math.floor(ty0_o * scale)) - 4)
        x1 = min(ww, int(math.ceil(tx1_o * scale)) + 4)
        y1 = min(wh, int(math.ceil(ty1_o * scale)) + 4)
        if x1 <= x0 or y1 <= y0:
            continue
        rx0, ry0 = max(0, x0 - 8), max(0, y0 - 8)
        rx1, ry1 = min(ww, x1 + 8), min(wh, y1 + 8)
        ring = np.ones((ry1 - ry0, rx1 - rx0), dtype=bool)
        ring[(y0 - ry0) : (y1 - ry0), (x0 - rx0) : (x1 - rx0)] = False
        ring_px = work[ry0:ry1, rx0:rx1][ring]
        ring_g = gray[ry0:ry1, rx0:rx1][ring]
        if len(ring_px) >= 12:
            bright = ring_g >= np.percentile(ring_g, 55)
            fill_bgr = np.median(ring_px[bright] if np.any(bright) else ring_px, axis=0).astype(np.uint8)
        else:
            fill_bgr = np.array([255, 255, 255], dtype=np.uint8)
        work[y0:y1, x0:x1] = fill_bgr
        cv2.rectangle(erase_mask, (x0, y0), (max(x0, x1 - 1), max(y0, y1 - 1)), 255, 2)

    # Also erase any residual table gridlines inside the inner body area (away from page borders)
    try:
        h_mask_bg, v_mask_bg = _extract_table_line_masks(work)
        grid_lines_bg = cv2.bitwise_or(h_mask_bg, v_mask_bg)
        bx0, by0 = int(ww * 0.065), int(wh * 0.065)
        bx1, by1 = int(ww * 0.935), int(wh * 0.935)
        if bx1 > bx0 and by1 > by0:
            erase_mask[by0:by1, bx0:bx1][grid_lines_bg[by0:by1, bx0:bx1] > 0] = 255
    except Exception:
        pass

    # 3. Cleanly erase extracted visual assets (photos, crests, QRs, seals)
    for asset in assets:
        ax0 = max(0, int(math.floor(asset.x0 * inv_pt_to_work)) - 2)
        ay0 = max(0, int(math.floor(asset.y0 * inv_pt_to_work)) - 2)
        ax1 = min(ww, int(math.ceil(asset.x1 * inv_pt_to_work)) + 2)
        ay1 = min(wh, int(math.ceil(asset.y1 * inv_pt_to_work)) + 2)
        if ax1 <= ax0 or ay1 <= ay0:
            continue
        if max(ax1 - ax0, ay1 - ay0) > 36:
            # Sample clean paper ring outside asset rect for fast, smear-free fill
            rx0, ry0 = max(0, ax0 - 6), max(0, ay0 - 6)
            rx1, ry1 = min(ww, ax1 + 6), min(wh, ay1 + 6)
            ring = np.ones((ry1 - ry0, rx1 - rx0), dtype=bool)
            ring[(ay0 - ry0) : (ay1 - ry0), (ax0 - rx0) : (ax1 - rx0)] = False
            ring_px = work[ry0:ry1, rx0:rx1][ring]
            ring_g = gray[ry0:ry1, rx0:rx1][ring]
            if len(ring_px) >= 12:
                bright = ring_g >= np.percentile(ring_g, 45)
                fill_bgr = np.median(ring_px[bright] if np.any(bright) else ring_px, axis=0).astype(np.uint8)
            else:
                fill_bgr = np.array([255, 255, 255], dtype=np.uint8)
            work[ay0:ay1, ax0:ax1] = fill_bgr
            # Feather perimeter seam via inpaint
            cv2.rectangle(erase_mask, (ax0, ay0), (max(ax0, ax1 - 1), max(ay0, ay1 - 1)), 255, 2)
        else:
            erase_mask[ay0:ay1, ax0:ax1] = 255

    if np.any(erase_mask):
        erase_mask = cv2.dilate(erase_mask, np.ones((5, 5), np.uint8), iterations=1)
        cleaned = cv2.inpaint(work, erase_mask, 4, cv2.INPAINT_TELEA)
    else:
        cleaned = work

    ok, buf = cv2.imencode(".jpg", cleaned, [int(cv2.IMWRITE_JPEG_QUALITY), 84])
    return buf.tobytes() if ok else None


_PROSE_BREAK_PREFIX_RE = re.compile(
    r"^(?:\d{1,2}\s*[-\.\)\:]|\([a-zA-Z0-9ivxIVX]{1,4}\)|\*?\s*The Constitution\b|"
    r"Note\s*:|S\.?\s*N\.?\s*:|Date\s*:|Sub(?:ject)?\s*:|Ref\s*:|Name\s*:|Roll\b|Enrollment\b|"
    r"SDM[-\s]|Office\s+of\b|Signature\s+valid|Digitally\s+signed|"
    r"दिनांक\b|नोट\s*:|क्रमांक\b|[•●▪\*]\s+)",
    re.IGNORECASE,
)


def _merge_wrapped_prose_lines(lines: list[TextLine], page_w: float) -> list[TextLine]:
    """
    Merge wrapped continuous prose lines (e.g. e-Mitra legal clauses and amendments)
    into cohesive flowing editable paragraphs while preserving headings, numbered lists,
    key-value lines, and short intentional line breaks.
    """
    if len(lines) <= 1:
        return list(lines)

    ordered = sorted(lines, key=lambda l: (l.y0, l.x0))
    merged: list[TextLine] = [
        TextLine(
            words=list(ordered[0].words),
            x0=ordered[0].x0,
            y0=ordered[0].y0,
            x1=ordered[0].x1,
            y1=ordered[0].y1,
            text=ordered[0].text,
            font_size_pt=ordered[0].font_size_pt,
            is_bold=ordered[0].is_bold,
            color_rgb=ordered[0].color_rgb,
            align=ordered[0].align,
        )
    ]

    for nxt in ordered[1:]:
        prev = merged[-1]
        v_gap = nxt.y0 - prev.y1
        fs_diff = abs(nxt.font_size_pt - prev.font_size_pt)
        txt_nxt = nxt.text.strip()
        txt_prev = prev.text.strip()

        prev_is_wide = (prev.x1 >= page_w * 0.64) and ((prev.x1 - prev.x0) >= page_w * 0.44)
        left_aligned_flow = (
            prev.align in ("left", "justify")
            and nxt.align in ("left", "justify")
            and abs(prev.x0 - nxt.x0) <= 22.0
        )
        ends_terminal = txt_prev.endswith((".", "।", ":", ";")) and prev.x1 < page_w * 0.72
        starts_new_clause = bool(_PROSE_BREAK_PREFIX_RE.match(txt_nxt))

        should_merge = (
            left_aligned_flow
            and prev_is_wide
            and -2.0 <= v_gap <= max(6.5, prev.font_size_pt * 0.62)
            and fs_diff <= 1.8
            and prev.is_bold == nxt.is_bold
            and not ends_terminal
            and not starts_new_clause
        )
        if should_merge:
            joiner = "" if txt_prev.endswith("-") and len(txt_prev) >= 3 and txt_prev[-2].isalpha() else " "
            merged[-1] = TextLine(
                words=prev.words + nxt.words,
                x0=min(prev.x0, nxt.x0),
                y0=prev.y0,
                x1=max(prev.x1, nxt.x1),
                y1=max(prev.y1, nxt.y1),
                text=(txt_prev[:-1] + txt_nxt) if joiner == "" else f"{txt_prev} {txt_nxt}",
                font_size_pt=prev.font_size_pt,
                is_bold=prev.is_bold,
                color_rgb=prev.color_rgb,
                align="justify" if prev.x1 >= page_w * 0.73 else prev.align,
            )
        else:
            merged.append(
                TextLine(
                    words=list(nxt.words),
                    x0=nxt.x0,
                    y0=nxt.y0,
                    x1=nxt.x1,
                    y1=nxt.y1,
                    text=nxt.text,
                    font_size_pt=nxt.font_size_pt,
                    is_bold=nxt.is_bold,
                    color_rgb=nxt.color_rgb,
                    align=nxt.align,
                )
            )

    return merged


# ---------------------------------------------------------------------------
# Full Page Vision Blueprint Analyzer
# ---------------------------------------------------------------------------


def _normalize_table_slivers(tables: list[DetectedTable]) -> None:
    """
    Merge thin blank upper sub-sliver rows caused by inset photo/box top borders
    (e.g. an 8-10pt empty strip directly above `PANKAJ MEENA` next to a row-spanning label),
    so key-value rows align side-by-side cleanly instead of floating a row lower.
    """
    for tbl in tables:
        if tbl.n_rows < 3 or tbl.n_cols < 3:
            continue
        by_rc = {(c.r0, c.c0): c for c in tbl.cells}
        changed = False
        for c_empty in list(tbl.cells):
            if c_empty.text.strip() or c_empty.assets or (c_empty.r1 - c_empty.r0) != 1:
                continue
            r = c_empty.r0
            row_h = c_empty.y1 - c_empty.y0
            if row_h > 13.5 or c_empty.c0 == 0 or (c_empty.c1 - c_empty.c0) < 2:
                continue
            # Check if left sibling spans downward past row r (r..>=r+2) and cell right below starts at same c0
            has_spanning_left = any(
                c.c1 <= c_empty.c0 and c.r0 <= r and c.r1 >= r + 2 and bool(c.text.strip())
                for c in tbl.cells
            )
            c_below = by_rc.get((r + 1, c_empty.c0))
            if (
                has_spanning_left
                and c_below is not None
                and bool(c_below.text.strip())
                and c_below.c1 < c_empty.c1
            ):
                split_col = c_below.c1
                split_x = c_below.x1
                orig_c1 = c_empty.c1
                orig_x1 = c_empty.x1
                # Pull populated lower value cell upward to absorb left slice of empty sliver
                c_below.r0 = r
                c_below.y0 = c_empty.y0
                # Trim empty sliver to trailing unoccupied columns (above photo box)
                c_empty.c0 = split_col
                c_empty.x0 = split_x
                by_rc[(r, split_col)] = c_empty
                by_rc[(r, c_below.c0)] = c_below
                if orig_c1 > split_col:
                    # Ensure valid bounds
                    c_empty.c1 = orig_c1
                    c_empty.x1 = orig_x1
                changed = True
        if changed:
            tbl.cells.sort(key=lambda c: (c.r0, c.c0))


def _attach_asset_to_table_cell(tbl: DetectedTable, asset: VisualAsset) -> None:
    """
    Attach an in-table native asset (candidate photo, chairman signature, barcode/stamp)
    cleanly into its owning `TableCell.assets`, handling:
    - Horizontal cell merges when a wide barcode spans adjacent empty/placeholder cells
    - Left-text / right-asset cell splitting along existing column boundaries
    - Suppressing occluded placeholder text strictly hidden behind an opaque photo
    """
    if not tbl.cells:
        return

    acx = (asset.x0 + asset.x1) * 0.5
    acy = (asset.y0 + asset.y1) * 0.5

    # 1. Merge adjacent empty or placeholder-only cells horizontally spanned by a wide asset (e.g. Barcode)
    row_spans: dict[tuple[int, int], list[TableCell]] = {}
    for c in tbl.cells:
        row_spans.setdefault((c.r0, c.r1), []).append(c)

    for (_r0, _r1), r_cells in row_spans.items():
        if len(r_cells) < 2:
            continue
        r_cells.sort(key=lambda c: c.c0)
        if not (r_cells[0].y0 - 6.0 <= acy <= r_cells[0].y1 + 6.0):
            continue
        spanned: list[TableCell] = []
        for c in r_cells:
            horiz_ov = min(c.x1, asset.x1) - max(c.x0, asset.x0)
            cw = max(1.0, c.x1 - c.x0)
            if horiz_ov >= min(cw * 0.28, 12.0):
                spanned.append(c)
        if len(spanned) >= 2:
            contiguous = all(spanned[k].c1 == spanned[k + 1].c0 for k in range(len(spanned) - 1))
            clean_texts = [re.sub(r"\s+", " ", s.text).strip() for s in spanned]
            placeholder_only = all(
                (not t) or re.fullmatch(r"(?:barcode|bar\s*code|qr|qr\s*code)", t, re.IGNORECASE)
                for t in clean_texts
            )
            if contiguous and placeholder_only:
                anchor_cell = spanned[0]
                anchor_cell.c1 = spanned[-1].c1
                anchor_cell.x1 = spanned[-1].x1
                anchor_cell.text = ""
                anchor_cell.lines = []
                anchor_cell.align = "center"
                anchor_cell.assets.append(asset)
                for extra_c in spanned[1:]:
                    if extra_c in tbl.cells:
                        tbl.cells.remove(extra_c)
                return

    # 2. Pick best enclosing/overlapping cell
    best_cell: Optional[TableCell] = None
    best_score = -1.0
    for c in tbl.cells:
        ix0 = max(c.x0, asset.x0)
        iy0 = max(c.y0, asset.y0)
        ix1 = min(c.x1, asset.x1)
        iy1 = min(c.y1, asset.y1)
        if ix1 <= ix0 or iy1 <= iy0:
            continue
        inter = (ix1 - ix0) * (iy1 - iy0)
        if c.x0 - 4.0 <= acx <= c.x1 + 4.0 and c.y0 - 4.0 <= acy <= c.y1 + 4.0:
            inter *= 2.0
        if inter > best_score:
            best_score = inter
            best_cell = c

    if best_cell is None:
        return

    # 3. If a signature/photo sits cleanly in the right column(s) of a wide multi-column cell whose
    #    text is on the left, split at the exact internal grid column boundary so both remain neat.
    if (
        (best_cell.c1 - best_cell.c0) >= 3
        and bool(best_cell.text.strip())
        and asset.x0 > best_cell.x0 + (best_cell.x1 - best_cell.x0) * 0.45
    ):
        col_x_edges = [tbl.x0]
        cur_x = tbl.x0
        for cw in tbl.col_widths_pt:
            cur_x += cw
            col_x_edges.append(cur_x)
        split_c: Optional[int] = None
        for col_idx in range(best_cell.c1 - 1, best_cell.c0, -1):
            if col_idx < len(col_x_edges) and col_x_edges[col_idx] <= asset.x0 + 6.0:
                split_c = col_idx
                break
        if split_c is not None and split_c > best_cell.c0:
            split_x = col_x_edges[split_c]
            sig_cell = TableCell(
                r0=best_cell.r0,
                c0=split_c,
                r1=best_cell.r1,
                c1=best_cell.c1,
                x0=split_x,
                y0=best_cell.y0,
                x1=best_cell.x1,
                y1=best_cell.y1,
                text="",
                lines=[],
                bg_rgb=best_cell.bg_rgb,
                text_rgb=best_cell.text_rgb,
                is_header=False,
                is_bold=False,
                align="center",
                font_size_pt=best_cell.font_size_pt,
                assets=[asset],
                has_borders=best_cell.has_borders,
            )
            best_cell.c1 = split_c
            best_cell.x1 = split_x
            best_cell.align = "left"
            tbl.cells.append(sig_cell)

            # Also align caption cell immediately below if it holds `For Chairman` / similar short sign-off
            for cap_cell in list(tbl.cells):
                if (
                    cap_cell is not best_cell
                    and cap_cell.r0 == best_cell.r1
                    and cap_cell.c0 <= best_cell.c0 + 1
                    and cap_cell.c1 >= split_c + 1
                    and len(cap_cell.text.strip()) <= 45
                    and any(k in cap_cell.text.lower() for k in ("chairman", "sign", "controller", "अध्यक्ष", "हस्ताक्षर"))
                ):
                    cap_text = cap_cell.text
                    cap_lines = list(cap_cell.lines)
                    cap_right = TableCell(
                        r0=cap_cell.r0,
                        c0=split_c,
                        r1=cap_cell.r1,
                        c1=cap_cell.c1,
                        x0=split_x,
                        y0=cap_cell.y0,
                        x1=cap_cell.x1,
                        y1=cap_cell.y1,
                        text=cap_text,
                        lines=cap_lines,
                        bg_rgb=cap_cell.bg_rgb,
                        text_rgb=cap_cell.text_rgb,
                        is_header=cap_cell.is_header,
                        is_bold=cap_cell.is_bold,
                        align="center",
                        font_size_pt=cap_cell.font_size_pt,
                        has_borders=cap_cell.has_borders,
                    )
                    cap_cell.c1 = split_c
                    cap_cell.x1 = split_x
                    cap_cell.text = ""
                    cap_cell.lines = []
                    tbl.cells.append(cap_right)
            tbl.cells.sort(key=lambda c: (c.r0, c.c0))
            return

    # 4. Suppress generic hidden behind-photo placeholder labels inside opaque photo box
    if asset.kind == "photo":
        low_txt = best_cell.text.lower()
        if "uploaded photo" in low_txt or "candidate to appear" in low_txt or re.fullmatch(r"\s*photo\s*", low_txt):
            best_cell.text = ""
            best_cell.lines = []
    elif asset.kind == "stamp" and re.fullmatch(r"(?:barcode|bar\s*code)", best_cell.text.strip(), re.IGNORECASE):
        best_cell.text = ""
        best_cell.lines = []

    best_cell.assets.append(asset)


def _merge_side_by_side_tables(ordered_tables: list[DetectedTable]) -> list[DetectedTable]:
    """
    Combine side-by-side horizontally disjoint tables (e.g. bilingual `Shift 1` left vs `शिफ्ट 1` right)
    into one flat table separated by a borderless center spacer column (zero nested tables).
    """
    if len(ordered_tables) <= 1:
        return list(ordered_tables)
    used: set[int] = set()
    merged_out: list[DetectedTable] = []
    for i, tbl_a in enumerate(ordered_tables):
        if i in used:
            continue
        partner_idx: Optional[int] = None
        for j in range(i + 1, len(ordered_tables)):
            if j in used:
                continue
            tbl_b = ordered_tables[j]
            y_ov = min(tbl_a.y1, tbl_b.y1) - max(tbl_a.y0, tbl_b.y0)
            min_h = max(1.0, min(tbl_a.y1 - tbl_a.y0, tbl_b.y1 - tbl_b.y0))
            disjoint_x = (tbl_a.x1 <= tbl_b.x0 - 12.0) or (tbl_b.x1 <= tbl_a.x0 - 12.0)
            if y_ov >= min_h * 0.40 and disjoint_x:
                partner_idx = j
                break
        if partner_idx is None:
            used.add(i)
            merged_out.append(tbl_a)
            continue

        used.add(i)
        used.add(partner_idx)
        left, right = sorted((tbl_a, ordered_tables[partner_idx]), key=lambda t: t.x0)
        gap_w = max(14.0, right.x0 - left.x1)
        spacer_col = left.n_cols
        total_rows = max(left.n_rows, right.n_rows)
        row_h_src = left.row_heights_pt if len(left.row_heights_pt) >= len(right.row_heights_pt) else right.row_heights_pt
        row_heights = [
            max(
                left.row_heights_pt[r] if r < len(left.row_heights_pt) else 0.0,
                right.row_heights_pt[r] if r < len(right.row_heights_pt) else 0.0,
                12.0,
            )
            for r in range(total_rows)
        ] if row_h_src else [14.0] * total_rows
        comb_cells: list[TableCell] = [
            TableCell(**{**c.__dict__, "has_borders": True}) for c in left.cells
        ]
        # Borderless spacer column spanning all rows
        comb_cells.append(
            TableCell(
                r0=0,
                c0=spacer_col,
                r1=total_rows,
                c1=spacer_col + 1,
                x0=left.x1,
                y0=min(left.y0, right.y0),
                x1=right.x0,
                y1=max(left.y1, right.y1),
                text="",
                lines=[],
                align="center",
                has_borders=False,
            )
        )
        col_off = spacer_col + 1
        for c in right.cells:
            rc = TableCell(**{**c.__dict__, "c0": c.c0 + col_off, "c1": c.c1 + col_off, "has_borders": True})
            comb_cells.append(rc)
        merged_out.append(
            DetectedTable(
                x0=left.x0,
                y0=min(left.y0, right.y0),
                x1=right.x1,
                y1=max(left.y1, right.y1),
                n_rows=total_rows,
                n_cols=left.n_cols + 1 + right.n_cols,
                col_widths_pt=list(left.col_widths_pt) + [gap_w] + list(right.col_widths_pt),
                row_heights_pt=row_heights,
                cells=comb_cells,
                has_visible_borders=left.has_visible_borders or right.has_visible_borders,
            )
        )
    merged_out.sort(key=lambda t: t.y0)
    return merged_out


def _merge_column_paragraphs(col_lines: list[TextLine], col_x0: float, col_x1: float) -> list[TextLine]:
    """
    Normalize a vertical column's lines into local `[0..col_w]` coordinates, merge wrapped prose
    with `_merge_wrapped_prose_lines`, and return clean column paragraphs in original coordinates.
    """
    if len(col_lines) <= 1:
        return list(col_lines)
    col_w = max(80.0, col_x1 - col_x0)
    local_lines: list[TextLine] = []
    for ln in sorted(col_lines, key=lambda l: (l.y0, l.x0)):
        lx0 = max(0.0, ln.x0 - col_x0)
        lx1 = max(lx0 + 4.0, ln.x1 - col_x0)
        # Preserve centered sub-headings inside the column while keeping body lines left-flowable
        is_col_centered = (
            abs(((ln.x0 + ln.x1) * 0.5) - ((col_x0 + col_x1) * 0.5)) <= col_w * 0.14
            and (lx1 - lx0) < col_w * 0.80
            and ln.is_bold
            and not _PROSE_BREAK_PREFIX_RE.match(ln.text.strip())
        )
        local_lines.append(
            TextLine(
                words=list(ln.words),
                x0=lx0,
                y0=ln.y0,
                x1=lx1,
                y1=ln.y1,
                text=ln.text,
                font_size_pt=ln.font_size_pt,
                is_bold=ln.is_bold,
                color_rgb=ln.color_rgb,
                align="center" if is_col_centered else "left",
            )
        )
    merged_local = _merge_wrapped_prose_lines(local_lines, col_w)
    return [
        TextLine(
            words=ml.words,
            x0=ml.x0 + col_x0,
            y0=ml.y0,
            x1=ml.x1 + col_x0,
            y1=ml.y1,
            text=ml.text,
            font_size_pt=ml.font_size_pt,
            is_bold=ml.is_bold,
            color_rgb=ml.color_rgb,
            align=ml.align,
        )
        for ml in merged_local
    ]


def _build_layout_bands(
    page_w: float,
    tables: list[DetectedTable],
    lines: list[TextLine],
    assets: list[VisualAsset],
) -> list[LayoutBand]:
    """
    Organize all page elements into sequential top-to-bottom bands:
    - Table bands (`kind="table"`) with optional side-by-side `floating_assets`
    - Horizontal multi-column visual/text bands (`kind="columns"`, including full-page two-column
      bilingual instruction blocks and crest+title+logo rows)
    - Cohesive flowing paragraph bands (`kind="paragraph"`)
    """
    ordered_tables = _merge_side_by_side_tables(sorted(tables, key=lambda t: t.y0))
    bands: list[LayoutBand] = []

    # Assign any photo/signature/QR sitting horizontally beside a table (not overlapping it)
    # directly as floating side assets on that table band so they stay next to the table!
    side_assets_by_tbl: dict[int, list[VisualAsset]] = {}
    consumed_side_asset_ids: set[int] = set()
    for t_idx, tbl in enumerate(ordered_tables):
        t_side: list[VisualAsset] = []
        for a in assets:
            if id(a) in consumed_side_asset_ids:
                continue
            a_cy = (a.y0 + a.y1) * 0.5
            if (tbl.y0 - 6.0) <= a_cy <= (tbl.y1 + 6.0):
                disjoint_x = (a.x1 <= tbl.x0 - 4.0) or (a.x0 >= tbl.x1 + 4.0)
                if disjoint_x:
                    t_side.append(a)
                    consumed_side_asset_ids.add(id(a))
        if t_side:
            side_assets_by_tbl[t_idx] = t_side

    remaining_assets = [a for a in assets if id(a) not in consumed_side_asset_ids]

    def _emit_strips(strip_lines: list[TextLine], strip_assets: list[VisualAsset]) -> None:
        if not strip_lines and not strip_assets:
            return
        # Group items inside strip region into cohesive horizontal Y-strips
        items: list[tuple[float, float, float, float, object, str]] = []
        for ln in strip_lines:
            items.append((ln.y0, ln.y1, ln.x0, ln.x1, ln, "line"))
        for a in strip_assets:
            items.append((a.y0, a.y1, a.x0, a.x1, a, "asset"))
        items.sort(key=lambda it: (it[0], it[2]))

        y_strips: list[list[tuple[float, float, float, float, object, str]]] = []
        for it in items:
            iy0, iy1, ix0, ix1, iobj, ikind = it
            if not y_strips:
                y_strips.append([it])
                continue
            cur_min_y = min(x[0] for x in y_strips[-1])
            cur_max_y = max(x[1] for x in y_strips[-1])
            overlap = min(cur_max_y, iy1) - max(cur_min_y, iy0)
            has_asset_strip = any(x[5] == "asset" for x in y_strips[-1])
            strip_tall = (cur_max_y - cur_min_y) <= 115.0

            side_by_side_with_strip = False
            if strip_tall and overlap > -16.0:
                strip_has_right_asset = any(x[5] == "asset" and (x[2] + x[3]) * 0.5 > page_w * 0.58 for x in y_strips[-1])
                strip_has_left_lines = all(x[3] < page_w * 0.56 for x in y_strips[-1] if x[5] == "line") and any(
                    x[5] == "line" for x in y_strips[-1]
                )
                if ikind == "asset" and (ix0 + ix1) * 0.5 > page_w * 0.58 and strip_has_left_lines:
                    side_by_side_with_strip = True
                elif ikind == "line" and ix1 < page_w * 0.56 and (strip_has_right_asset or (has_asset_strip and strip_has_left_lines)):
                    side_by_side_with_strip = True
                elif ikind == "line" and ix1 < page_w * 0.52 and strip_has_left_lines:
                    near_right_asset = any(
                        (a.x0 + a.x1) * 0.5 > page_w * 0.58 and (a.y0 <= iy1 + 45.0 and a.y1 >= cur_min_y - 25.0)
                        for a in strip_assets
                    )
                    if near_right_asset:
                        side_by_side_with_strip = True

            # Require substantial vertical overlap when adding an asset to a narrow centered line strip
            # (prevents top-tip kiss like `Tear from here` at y=393 grabbing `Logo 2` at y=391..425)
            eff_ov = overlap > 0.5
            suppress_centered_asset_pull = False
            if ikind == "asset" and overlap > -6.0:
                strip_has_only_centered_line = all(x[5] == "line" for x in y_strips[-1]) and len(y_strips[-1]) == 1
                if strip_has_only_centered_line:
                    min_it_h = max(4.0, min(iy1 - iy0, cur_max_y - cur_min_y))
                    if overlap < min_it_h * 0.45:
                        eff_ov = False
                        suppress_centered_asset_pull = True

            if eff_ov or side_by_side_with_strip or (
                ikind == "asset"
                and not suppress_centered_asset_pull
                and overlap > -6.0
                and strip_tall
                and (overlap >= 0 or not all(x[5] == "line" and len(y_strips[-1]) == 1 for x in y_strips[-1]))
            ):
                if ikind == "line":
                    it_w = ix1 - ix0
                    strip_lines_prev = [x for x in y_strips[-1] if x[5] == "line"]
                    prev_max_ly1 = max((x[1] for x in strip_lines_prev), default=cur_max_y)
                    prev_all_centered = bool(strip_lines_prev) and all(
                        x[2] > page_w * 0.17 and x[3] < page_w * 0.83 and abs((x[2] + x[3]) * 0.5 - page_w * 0.5) < page_w * 0.16
                        for x in strip_lines_prev
                    )
                    is_left_body_line = ix0 < page_w * 0.17 or getattr(iobj, "align", "") in ("left", "justify")
                    if has_asset_strip and prev_all_centered and is_left_body_line and iy0 >= prev_max_ly1 - 2.0:
                        y_strips.append([it])
                        continue
                    if has_asset_strip and overlap < -1.0 and it_w > page_w * 0.58:
                        y_strips.append([it])
                        continue
                y_strips[-1].append(it)
            else:
                y_strips.append([it])

        for strip in y_strips:
            strip_y0 = min(x[0] for x in strip)
            strip_y1 = max(x[1] for x in strip)
            s_lines = [x[4] for x in strip if x[5] == "line"]
            s_assets = [x[4] for x in strip if x[5] == "asset"]

            wide_center_lines = [
                ln for ln in s_lines
                if (ln.x1 - ln.x0) > page_w * 0.30
                and 0.24 * page_w <= (ln.x0 + ln.x1) * 0.5 <= 0.76 * page_w
            ]
            left_corner: list[tuple[float, float, object, str]] = []
            right_corner: list[tuple[float, float, object, str]] = []
            body_items: list[tuple[float, float, float, float, object, str]] = []

            if s_assets and wide_center_lines:
                for x in strip:
                    ix0, ix1, obj, kind = x[2], x[3], x[4], x[5]
                    mid = (ix0 + ix1) * 0.5
                    aw = ix1 - ix0
                    if kind == "asset" and aw < page_w * 0.28 and mid < page_w * 0.34 and ix1 < page_w * 0.40:
                        left_corner.append((ix0, ix1, obj, kind))
                    elif kind == "asset" and aw < page_w * 0.28 and mid > page_w * 0.62 and ix0 > page_w * 0.54:
                        right_corner.append((ix0, ix1, obj, kind))
                    else:
                        body_items.append(x)
            else:
                body_items = list(strip)

            x_intervals = sorted([(x[2], x[3], x[4], x[5]) for x in body_items], key=lambda iv: iv[0])
            zone_groups: list[list[tuple[float, float, object, str]]] = []
            for iv in x_intervals:
                if not zone_groups:
                    zone_groups.append([iv])
                    continue
                prev_x1 = max(z[1] for z in zone_groups[-1])
                gap = iv[0] - prev_x1
                has_asset_mix = any(z[3] == "asset" for z in zone_groups[-1]) != (iv[3] == "asset")
                split_thresh = 10.0 if has_asset_mix else 24.0
                if gap > split_thresh:
                    zone_groups.append([iv])
                else:
                    zone_groups[-1].append(iv)

            all_groups: list[list[tuple[float, float, object, str]]] = []
            if left_corner:
                all_groups.append(left_corner)
            all_groups.extend(zone_groups)
            if right_corner:
                all_groups.append(right_corner)
            all_groups.sort(key=lambda g: min(z[0] for z in g))

            if len(all_groups) >= 2 or (s_assets and s_lines) or len(s_assets) >= 1:
                zones: list[ColumnZone] = []
                for zg in all_groups:
                    zx0 = min(z[0] for z in zg)
                    zx1 = max(z[1] for z in zg)
                    z_lines = sorted([z[2] for z in zg if z[3] == "line"], key=lambda l: (l.y0, l.x0))
                    z_assets = sorted([z[2] for z in zg if z[3] == "asset"], key=lambda a: (a.y0, a.x0))
                    z_mid = (zx0 + zx1) * 0.5
                    z_align = "center" if abs(z_mid - page_w * 0.5) < page_w * 0.14 else (
                        "right" if zx0 > page_w * 0.62 else "left"
                    )
                    if z_assets and not z_lines:
                        z_align = "center" if zx0 > page_w * 0.25 and zx1 < page_w * 0.75 else (
                            "right" if zx0 > page_w * 0.55 else "left"
                        )
                    zones.append(ColumnZone(x0=zx0, x1=zx1, lines=z_lines, assets=z_assets, align=z_align))
                bands.append(LayoutBand(kind="columns", y0=strip_y0, y1=strip_y1, zones=zones))
            elif s_lines:
                if bands and bands[-1].kind == "paragraph" and (strip_y0 - bands[-1].y1) < 18.0:
                    bands[-1].lines.extend(s_lines)
                    bands[-1].y1 = max(bands[-1].y1, strip_y1)
                else:
                    bands.append(LayoutBand(kind="paragraph", y0=strip_y0, y1=strip_y1, lines=list(s_lines)))

    def _collect_between(y_start: float, y_end: float) -> None:
        sub_lines = [ln for ln in lines if y_start - 2.0 <= (ln.y0 + ln.y1) * 0.5 < y_end]
        sub_assets = [a for a in remaining_assets if y_start - 2.0 <= (a.y0 + a.y1) * 0.5 < y_end]
        if not sub_lines and not sub_assets:
            return

        # Detect contiguous full-page two-column regions (e.g. Left English / Right Hindi instructions)
        # separated by a clean central vertical gutter so lines NEVER interleave across strips!
        if not sub_assets and len(sub_lines) >= 8:
            best_gx: Optional[float] = None
            best_score = -1
            for pct in range(44, 57, 2):
                cand_x = page_w * (pct / 100.0)
                l_cnt = sum(1 for ln in sub_lines if ln.x1 <= cand_x - 3.0)
                r_cnt = sum(1 for ln in sub_lines if ln.x0 >= cand_x + 3.0)
                x_cnt = sum(1 for ln in sub_lines if ln.x0 < cand_x - 3.0 and ln.x1 > cand_x + 3.0)
                if l_cnt >= 4 and r_cnt >= 4 and x_cnt <= 2:
                    sc_val = min(l_cnt, r_cnt) * 4 - x_cnt * 10
                    if sc_val > best_score:
                        best_score = sc_val
                        best_gx = cand_x

            if best_gx is not None:
                # Isolate true two-column body range excluding rare outer header/footer crossing lines
                col_body = [
                    ln for ln in sub_lines
                    if (ln.x1 <= best_gx - 2.0) or (ln.x0 >= best_gx + 2.0)
                ]
                col_y0 = min(ln.y0 for ln in col_body)
                col_y1 = max(ln.y1 for ln in col_body)
                # Exclude bottom page footer metadata line (`Download Date ... | IP Address ...` at extreme bottom >= 94%)
                footer_lines = [ln for ln in sub_lines if ln.y0 >= col_y1 - 24.0 and ("download" in ln.text.lower() or "ip address" in ln.text.lower() or "page " in ln.text.lower())]
                if footer_lines:
                    f_cut = min(ln.y0 for ln in footer_lines)
                    col_body = [ln for ln in col_body if ln.y1 <= f_cut - 1.0]
                else:
                    footer_lines = []
                cross_lines = [ln for ln in sub_lines if ln not in col_body]
                above_lines = [ln for ln in cross_lines if ln.y1 <= col_y0 + 2.0]
                below_lines = [ln for ln in cross_lines if ln.y0 >= (col_y1 - 24.0 if footer_lines else col_y1 - 2.0)]

                left_col = [ln for ln in col_body if ln.x1 <= best_gx - 2.0]
                right_col = [ln for ln in col_body if ln.x0 >= best_gx + 2.0]
                if len(left_col) >= 4 and len(right_col) >= 4:
                    if above_lines:
                        _emit_strips(above_lines, [])
                    lx0 = min(ln.x0 for ln in left_col)
                    lx1 = max(ln.x1 for ln in left_col)
                    rx0 = min(ln.x0 for ln in right_col)
                    rx1 = max(ln.x1 for ln in right_col)
                    m_left = _merge_column_paragraphs(left_col, lx0, lx1)
                    m_right = _merge_column_paragraphs(right_col, rx0, rx1)

                    # Try clean numbered-bullet row pairing (`1.`, `2.`, ..., `28.`) so items align side-by-side
                    # inside ONE flat multi-row borderless table instead of 38 jagged fragment tables!
                    def _bullet_key(txt: str) -> Optional[str]:
                        m = re.match(r"^\s*(\d{1,2})\.\s", txt)
                        return m.group(1) if m else None

                    left_keys = [_bullet_key(p.text) for p in m_left]
                    right_keys = [_bullet_key(p.text) for p in m_right]
                    common_nums = [k for k in left_keys if k is not None and k in right_keys]
                    col_rows: list[list[ColumnZone]] = []
                    if len(common_nums) >= 3:
                        li = 0
                        ri = 0
                        while li < len(m_left) or ri < len(m_right):
                            l_chunk: list[TextLine] = []
                            r_chunk: list[TextLine] = []
                            # Accumulate preamble/non-numbered or matching numbered pair
                            while li < len(m_left) and _bullet_key(m_left[li].text) not in common_nums:
                                l_chunk.append(m_left[li])
                                li += 1
                            while ri < len(m_right) and _bullet_key(m_right[ri].text) not in common_nums:
                                r_chunk.append(m_right[ri])
                                ri += 1
                            if l_chunk or r_chunk:
                                col_rows.append([
                                    ColumnZone(x0=lx0, x1=lx1, lines=l_chunk, align="left"),
                                    ColumnZone(x0=rx0, x1=rx1, lines=r_chunk, align="left"),
                                ])
                            if li < len(m_left) and ri < len(m_right):
                                lk = _bullet_key(m_left[li].text)
                                rk = _bullet_key(m_right[ri].text)
                                if lk == rk and lk is not None:
                                    lp_grp = [m_left[li]]
                                    rp_grp = [m_right[ri]]
                                    li += 1
                                    ri += 1
                                    while li < len(m_left) and _bullet_key(m_left[li].text) is None and (li >= len(m_left) or True):
                                        # Keep trailing sub-clauses `(ii)` attached until next numbered item or large gap before tail slogans
                                        if m_left[li].y0 - lp_grp[-1].y1 > 22.0 and (li == len(m_left) - 1 or m_left[li].align == "center"):
                                            break
                                        lp_grp.append(m_left[li])
                                        li += 1
                                    while ri < len(m_right) and _bullet_key(m_right[ri].text) is None:
                                        if m_right[ri].y0 - rp_grp[-1].y1 > 22.0 and (ri == len(m_right) - 1 or m_right[ri].align == "center"):
                                            break
                                        rp_grp.append(m_right[ri])
                                        ri += 1
                                    col_rows.append([
                                        ColumnZone(x0=lx0, x1=lx1, lines=lp_grp, align="left"),
                                        ColumnZone(x0=rx0, x1=rx1, lines=rp_grp, align="left"),
                                    ])
                                else:
                                    # Mismatched count advance whichever appears earlier
                                    if m_left[li].y0 <= m_right[ri].y0:
                                        col_rows.append([
                                            ColumnZone(x0=lx0, x1=lx1, lines=[m_left[li]], align="left"),
                                            ColumnZone(x0=rx0, x1=rx1, lines=[], align="left"),
                                        ])
                                        li += 1
                                    else:
                                        col_rows.append([
                                            ColumnZone(x0=lx0, x1=lx1, lines=[], align="left"),
                                            ColumnZone(x0=rx0, x1=rx1, lines=[m_right[ri]], align="left"),
                                        ])
                                        ri += 1
                            elif li < len(m_left):
                                col_rows.append([
                                    ColumnZone(x0=lx0, x1=lx1, lines=m_left[li:], align="left"),
                                    ColumnZone(x0=rx0, x1=rx1, lines=[], align="left"),
                                ])
                                break
                            elif ri < len(m_right):
                                col_rows.append([
                                    ColumnZone(x0=lx0, x1=lx1, lines=[], align="left"),
                                    ColumnZone(x0=rx0, x1=rx1, lines=m_right[ri:], align="left"),
                                ])
                                break

                    z_l = ColumnZone(x0=lx0, x1=lx1, lines=m_left, align="left")
                    z_r = ColumnZone(x0=rx0, x1=rx1, lines=m_right, align="left")
                    bands.append(
                        LayoutBand(
                            kind="columns",
                            y0=min(ln.y0 for ln in col_body),
                            y1=max(ln.y1 for ln in col_body),
                            zones=[z_l, z_r],
                            column_rows=col_rows,
                        )
                    )
                    if below_lines:
                        _emit_strips(below_lines, [])
                    return

        _emit_strips(sub_lines, sub_assets)

        # Merge wrapped prose inside contiguous paragraph bands (keeps tables & columns discrete)
        for b in bands:
            if b.kind == "paragraph" and len(b.lines) > 1:
                b.lines = _merge_wrapped_prose_lines(b.lines, page_w)

    cursor_y = -10.0
    for t_idx, tbl in enumerate(ordered_tables):
        _collect_between(cursor_y, tbl.y0)
        bands.append(
            LayoutBand(
                kind="table",
                y0=tbl.y0,
                y1=tbl.y1,
                table=tbl,
                floating_assets=side_assets_by_tbl.get(t_idx, []),
            )
        )
        cursor_y = tbl.y1 + 1.0
    _collect_between(cursor_y, 1e9)

    for b in bands:
        if b.kind == "paragraph" and len(b.lines) > 1:
            b.lines = _merge_wrapped_prose_lines(b.lines, page_w)

    bands.sort(key=lambda b: b.y0)
    return bands


def _parse_box_2d_pt(
    obj: dict[str, Any], page_w_pt: float, page_h_pt: float
) -> Optional[tuple[float, float, float, float]]:
    """Parse VLM `box_2d: [ymin, xmin, ymax, xmax]` (0..1000 or 0..1 scale) into `(x0, y0, x1, y1)` PDF points."""
    raw = obj.get("box_2d") or obj.get("bbox")
    if not isinstance(raw, (list, tuple)) or len(raw) != 4:
        return None
    try:
        vals = [float(v) for v in raw]
    except Exception:
        return None
    scale = 1.0 if max(abs(v) for v in vals) <= 1.05 else 1000.0
    ymin, xmin, ymax, xmax = [max(0.0, min(1.0, v / scale)) for v in vals]
    if xmax <= xmin + 0.005 or ymax <= ymin + 0.003:
        return None
    return (xmin * page_w_pt, ymin * page_h_pt, xmax * page_w_pt, ymax * page_h_pt)


def _parse_hex_rgb(val: Any) -> Optional[tuple[int, int, int]]:
    """Parse optional `#RRGGBB` color string into `(r, g, b)` tuple."""
    if not isinstance(val, str):
        return None
    s = val.strip().lstrip("#")
    if len(s) == 6:
        try:
            return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))
        except Exception:
            return None
    return None


def _apply_ai_refinement(
    ai_result: dict[str, Any],
    tables: list[DetectedTable],
    text_lines: list[TextLine],
    assets: list[VisualAsset],
    page_w_pt: float,
    page_h_pt: float,
    img_deskewed_bgr: Optional[np.ndarray] = None,
    px_to_pt: float = 0.0,
) -> tuple[list[TextLine], list[VisualAsset], bool, bool]:
    """
    Deterministically fuse AI Vision semantic transcription and 2D bounding boxes (`box_2d`)
    into OpenCV's sub-pixel geometry (`tables` cells by exact `cell_id`, curved/header lines,
    cohesive body paragraphs & kv_pairs) while keeping all table coordinates, spans, fills,
    and cropped visual assets intact.
    Returns `(new_text_lines, new_assets, has_curved_arch, ai_enhanced)`.
    """
    if not isinstance(ai_result, dict) or not ai_result:
        return text_lines, assets, False, False

    ai_enhanced = False

    # 1. Fuse table cell text keyed strictly by OpenCV `cell_id`
    ai_tables = ai_result.get("tables")
    if isinstance(ai_tables, list):
        for t_obj in ai_tables:
            if not isinstance(t_obj, dict):
                continue
            try:
                t_idx = int(t_obj.get("table_index", -1))
            except Exception:
                continue
            if not (0 <= t_idx < len(tables)):
                continue
            tbl = tables[t_idx]
            cells_list = t_obj.get("cells")
            if not isinstance(cells_list, list):
                continue
            cell_map: dict[int, str] = {}
            for c_item in cells_list:
                if not isinstance(c_item, dict):
                    continue
                try:
                    cid = int(c_item.get("cell_id", -1))
                except Exception:
                    continue
                if 0 <= cid < len(tbl.cells):
                    cell_map[cid] = str(c_item.get("text", "") or "").strip()
            for cid, new_txt in cell_map.items():
                cell = tbl.cells[cid]
                old_txt = cell.text.strip()
                if new_txt:
                    cell.text = new_txt
                    cell.lines = [ln.strip() for ln in new_txt.splitlines() if ln.strip()]
                    ai_enhanced = True
                elif old_txt and not _PURE_NUM_RE.fullmatch(old_txt) and len(old_txt) <= 5:
                    # Only clear noisy non-numeric junk cells confirmed empty by VLM
                    cell.text = ""
                    cell.lines = []
                    ai_enhanced = True

    first_tbl_y0 = min((t.y0 for t in tables), default=page_h_pt * 0.30)
    header_cutoff_y = min(first_tbl_y0, page_h_pt * 0.25)
    new_assets = list(assets)
    has_curved = False

    # 2. Fuse header & curved arched titles with exact `box_2d` or safe center bounds between corner assets
    ai_header = ai_result.get("header_lines")
    new_header_items: list[tuple[TextLine, bool]] = []
    if isinstance(ai_header, list) and ai_header:
        has_curved = any(isinstance(h, dict) and bool(h.get("is_curved_arch")) for h in ai_header)
        if has_curved:
            # Drop small individual letter-arc image scraps in curved arch zones while
            # keeping circular official seals/crests and portrait photos intact
            kept_assets: list[VisualAsset] = []
            for a in new_assets:
                aw = a.x1 - a.x0
                ah = a.y1 - a.y0
                in_header = a.y1 < header_cutoff_y + 12.0
                looks_like_arc_scrap = in_header and aw < page_w_pt * 0.14 and ah < page_h_pt * 0.055 and a.kind in ("logo", "stamp")
                if not looks_like_arc_scrap:
                    kept_assets.append(a)
            new_assets = kept_assets

        left_edge = max(
            [30.0] + [a.x1 + 8.0 for a in new_assets if a.y0 < header_cutoff_y and (a.x0 + a.x1) * 0.5 < page_w_pt * 0.32]
        )
        right_edge = min(
            [page_w_pt - 30.0]
            + [a.x0 - 26.0 for a in new_assets if a.y0 < header_cutoff_y and (a.x0 + a.x1) * 0.5 > page_w_pt * 0.65]
            + [ol.x0 - 28.0 for ol in text_lines if (ol.y0 + ol.y1) * 0.5 < header_cutoff_y and ol.x0 > page_w_pt * 0.72]
        )
        if right_edge - left_edge < page_w_pt * 0.32:
            left_edge = 36.0
            right_edge = page_w_pt - 36.0

        for idx, h in enumerate(ai_header):
            if not isinstance(h, dict):
                continue
            txt = str(h.get("text", "") or "").strip()
            if not txt:
                continue
            box_pt = _parse_box_2d_pt(h, page_w_pt, page_h_pt)
            fs = max(7.0, min(20.0, float(h.get("font_size_pt", 11.5))))
            al = str(h.get("align", "center")).lower()
            if al not in ("left", "center", "right"):
                al = "center"
            if box_pt is not None:
                bx0, by0, bx1, by1 = box_pt
                if al == "center":
                    lx0 = max(left_edge, bx0)
                    lx1 = min(right_edge, bx1)
                    if lx1 - lx0 < page_w_pt * 0.18:
                        lx0, lx1 = left_edge, right_edge
                else:
                    lx0, lx1 = bx0, bx1
                y0 = max(8.0, by0)
                y1 = max(y0 + fs * 1.15, by1)
            else:
                y_pct = max(0.015, min(0.35, float(h.get("y_pct", 0.04 + idx * 0.03))))
                y0 = min(header_cutoff_y - 6.0, y_pct * page_h_pt) if header_cutoff_y > 24.0 else y_pct * page_h_pt
                y0 = max(10.0, y0)
                y1 = y0 + fs * 1.25
                lx0, lx1 = (left_edge, right_edge) if al == "center" else (
                    (max(30.0, right_edge - page_w_pt * 0.35), right_edge)
                    if al == "right"
                    else (left_edge, min(page_w_pt - 30.0, left_edge + page_w_pt * 0.45))
                )
            explicit_rgb = _parse_hex_rgb(h.get("color_hex"))
            near_colors = [ln.color_rgb for ln in text_lines if abs(ln.y0 - y0) < 28.0]
            if explicit_rgb is not None:
                color = explicit_rgb
            elif near_colors:
                color = near_colors[0]
            elif img_deskewed_bgr is not None and px_to_pt > 0.0:
                inv_p = 1.0 / px_to_pt
                color, _ = _sample_ink_color_and_bold(
                    img_deskewed_bgr, int(lx0 * inv_p), int(y0 * inv_p), int(lx1 * inv_p), int(y1 * inv_p)
                )
            else:
                color = (17, 24, 39)
            new_header_items.append(
                (
                    TextLine(
                        words=[],
                        x0=lx0,
                        y0=y0,
                        x1=lx1,
                        y1=y1,
                        text=txt,
                        font_size_pt=fs,
                        is_bold=bool(h.get("is_bold", True)),
                        color_rgb=color,
                        align=al,
                    ),
                    box_pt is not None,
                )
            )
        if new_header_items:
            ai_enhanced = True

    def _is_line_covered_by_ai(ol: TextLine, ai_pairs: list[tuple[TextLine, bool]], min_x_ov: float) -> bool:
        from difflib import SequenceMatcher

        ol_txt = ol.text.strip()
        ol_toks = {t for t in re.findall(r"[A-Za-z0-9\u0900-\u097F]+", ol_txt.lower()) if len(t) >= 2}
        ol_w = max(1.0, ol.x1 - ol.x0)
        for nl, has_box in ai_pairs:
            y_ov = min(nl.y1, ol.y1) - max(nl.y0, ol.y0)
            x_ov = min(nl.x1, ol.x1) - max(nl.x0, ol.x0)
            if y_ov <= 2.0 or x_ov <= min_x_ov:
                continue
            nl_txt = nl.text.strip()
            nl_toks = {t for t in re.findall(r"[A-Za-z0-9\u0900-\u097F]+", nl_txt.lower()) if len(t) >= 2}
            if ol_toks and (ol_toks & nl_toks):
                return True
            if len(ol_txt) >= 4 and len(nl_txt) >= 4:
                if ol_txt.lower() in nl_txt.lower() or SequenceMatcher(None, ol_txt.lower(), nl_txt.lower()).ratio() >= 0.44:
                    return True
            # When Gemini gave an explicit box_2d specifically tight around this line, allow replacing garbled OCR
            if has_box and x_ov >= ol_w * 0.72 and (nl.x1 - nl.x0) <= max(ol_w * 1.45, 160.0):
                return True
        return False

    orig_header = [ln for ln in text_lines if (ln.y0 + ln.y1) * 0.5 < header_cutoff_y]
    if new_header_items:
        ai_hdr_y0 = min(nl.y0 for nl, _ in new_header_items)
        ai_hdr_y1 = max(nl.y1 for nl, _ in new_header_items)
        kept_header = [nl for nl, _ in new_header_items]
        for ol in orig_header:
            if _is_line_covered_by_ai(ol, new_header_items, min_x_ov=8.0):
                continue
            # Purge curved-arch or watermarked center-column OCR scraps inside the AI header envelope
            in_center_banner = ol.x0 >= left_edge - 16.0 and ol.x1 <= right_edge + 16.0
            in_hdr_band = ol.y1 >= ai_hdr_y0 - 18.0 and ol.y0 <= ai_hdr_y1 + 14.0
            if in_center_banner and in_hdr_band and (has_curved or len(new_header_items) >= 2):
                continue
            kept_header.append(ol)
        kept_header.sort(key=lambda l: (l.y0, l.x0))
    else:
        kept_header = orig_header
    orig_body_footer = [ln for ln in text_lines if (ln.y0 + ln.y1) * 0.5 >= header_cutoff_y]

    # 3. Fuse cohesive body/footer semantic paragraphs & kv_pairs outside tables with exact `box_2d`
    ai_blocks = ai_result.get("non_table_blocks")
    new_body_items: list[tuple[TextLine, bool]] = []
    if isinstance(ai_blocks, list) and len(ai_blocks) >= 1:
        for blk in ai_blocks:
            if not isinstance(blk, dict):
                continue
            box_pt = _parse_box_2d_pt(blk, page_w_pt, page_h_pt)
            if box_pt is not None:
                bx0, by0, bx1, by1 = box_pt
                y0 = by0
            else:
                y_pct = max(0.02, min(0.985, float(blk.get("y_pct", 0.50))))
                y0 = y_pct * page_h_pt
                bx0, bx1, by1 = 36.0, page_w_pt - 52.0, y0
            if any(t.y0 - 4.0 <= y0 <= t.y1 + 4.0 for t in tables):
                continue
            fs = max(6.5, min(18.0, float(blk.get("font_size_pt", 10.0))))
            is_b = bool(blk.get("is_bold", False))
            al = str(blk.get("align", "left")).lower()
            if al not in ("left", "center", "right", "justify"):
                al = "left"
            explicit_rgb = _parse_hex_rgb(blk.get("color_hex"))
            near_colors = [ln.color_rgb for ln in text_lines if abs(ln.y0 - y0) < 24.0]
            if explicit_rgb is not None:
                color = explicit_rgb
            elif near_colors:
                color = near_colors[0]
            elif img_deskewed_bgr is not None and box_pt is not None and px_to_pt > 0.0:
                inv_p = 1.0 / px_to_pt
                color, _ = _sample_ink_color_and_bold(
                    img_deskewed_bgr, int(bx0 * inv_p), int(by0 * inv_p), int(bx1 * inv_p), int(max(by1, y0 + fs) * inv_p)
                )
            else:
                color = (17, 24, 39)
            kind = str(blk.get("kind", "paragraph")).lower()

            if kind == "kv_pair":
                lt = str(blk.get("left_text", "") or "").strip()
                rt = str(blk.get("right_text", "") or "").strip()
                mid_x = (bx0 + bx1) * 0.5 if box_pt is not None else page_w_pt * 0.50
                row_y1 = max(by1, y0 + fs * 1.25)
                if lt:
                    new_body_items.append(
                        (TextLine(words=[], x0=bx0, y0=y0, x1=max(bx0 + 40.0, mid_x - 8.0), y1=row_y1, text=lt, font_size_pt=fs, is_bold=is_b, color_rgb=color, align="left"), box_pt is not None)
                    )
                if rt:
                    new_body_items.append(
                        (TextLine(words=[], x0=min(bx1 - 40.0, mid_x + 8.0), y0=y0, x1=bx1, y1=row_y1, text=rt, font_size_pt=fs, is_bold=is_b, color_rgb=color, align="left"), box_pt is not None)
                    )
            else:
                txt = str(blk.get("text", "") or "").strip()
                if not txt:
                    continue
                if box_pt is None:
                    # Estimate realistic multi-line vertical span & horizontal bounds when box_2d is omitted
                    est_rows = max(1, int(math.ceil(len(txt) / 72.0)))
                    by1 = y0 + est_rows * fs * 1.32
                    # If a right-side QR/asset sits at this Y, keep left-aligned signature blocks in the left column
                    has_right_qr = any(
                        (a.x0 + a.x1) * 0.5 > page_w_pt * 0.58 and a.y0 - 25.0 <= y0 <= a.y1 + 25.0
                        for a in new_assets
                    )
                    if has_right_qr and len(txt) < 120 and al == "left":
                        bx1 = min(bx1, page_w_pt * 0.48)
                else:
                    by1 = max(by1, y0 + fs * 1.20)
                new_body_items.append(
                    (TextLine(words=[], x0=bx0, y0=y0, x1=bx1, y1=by1, text=txt, font_size_pt=fs, is_bold=is_b, color_rgb=color, align=al), box_pt is not None)
                )
        if new_body_items:
            ai_enhanced = True

    if new_body_items:
        final_body_footer = [nb for nb, _ in new_body_items]
        for ol in orig_body_footer:
            if not _is_line_covered_by_ai(ol, new_body_items, min_x_ov=12.0):
                final_body_footer.append(ol)
        final_body_footer.sort(key=lambda l: (l.y0, l.x0))
        # Prune false bottom-half `'photo'`/`'stamp'` crops (such as green-checkmark signature text)
        # that overlap multiple AI text lines (`Signature valid`, `Digitally signed by...`).
        pruned_assets: list[VisualAsset] = []
        for a in new_assets:
            if a.kind == "qr" or a.y0 < page_h_pt * 0.45:
                pruned_assets.append(a)
                continue
            a_box = (a.x0, a.y0, a.x1, a.y1)
            a_area = max(1.0, (a.x1 - a.x0) * (a.y1 - a.y0))
            overlapping_items = 0
            covered_area = 0.0
            has_sig_txt = False
            for nb, _ in new_body_items:
                ix0, iy0 = max(a.x0, nb.x0), max(a.y0, nb.y0)
                ix1, iy1 = min(a.x1, nb.x1), min(a.y1, nb.y1)
                if ix1 > ix0 and iy1 > iy0:
                    overlapping_items += 1
                    covered_area += (ix1 - ix0) * (iy1 - iy0)
                    if re.search(r"signature\s*valid|digitally\s*signed|reason\s*:|location\s*:", nb.text, re.I):
                        has_sig_txt = True
            if has_sig_txt or (overlapping_items >= 2 and covered_area >= a_area * 0.22):
                continue
            pruned_assets.append(a)
        new_assets = pruned_assets
    else:
        final_body_footer = orig_body_footer
    combined_lines = sorted(kept_header + final_body_footer, key=lambda l: (l.y0, l.x0))
    return combined_lines, new_assets, has_curved, ai_enhanced


def _assemble_page_blueprint(
    page_index: int,
    page_w_pt: float,
    page_h_pt: float,
    skew_deg: float,
    tables: list[DetectedTable],
    assets: list[VisualAsset],
    text_lines: list[TextLine],
    has_curved_arch: bool,
    ai_enhanced: bool,
    orig_ocr_lines: list[TextLine],
    clean_non_table_words_px: list[OCRWord],
    table_boxes_px: list[tuple[int, int, int, int]],
    img_deskewed_bgr: np.ndarray,
    px_to_pt: float,
    include_clean_bg: bool,
    layer_mode: str,
) -> PageBlueprint:
    """Assemble final hierarchy bands, optional clean Layer-1 backdrop, and free page bitmaps."""
    page_border_rgb = _detect_page_border_rgb(img_deskewed_bgr)
    bands = _build_layout_bands(page_w_pt, tables, text_lines, assets)

    bg_clean_png: Optional[bytes] = None
    want_clean_bg = include_clean_bg or (str(layer_mode or "").strip().lower() == "layered_replica")
    if want_clean_bg:
        erase_lines = (orig_ocr_lines + text_lines) if ai_enhanced else text_lines
        bg_clean_png = _build_ink_free_background(
            img_deskewed_bgr,
            table_boxes_px,
            clean_non_table_words_px,
            assets,
            px_to_pt,
            text_lines=erase_lines,
        )

    bp = PageBlueprint(
        page_index=page_index,
        width_pt=page_w_pt,
        height_pt=page_h_pt,
        skew_deg=skew_deg,
        tables=tables,
        assets=assets,
        lines=text_lines,
        bands=bands,
        bg_clean_png=bg_clean_png,
        page_border_rgb=page_border_rgb,
        has_curved_arch_header=has_curved_arch,
        ai_enhanced=ai_enhanced,
    )
    gc.collect()
    return bp


def _build_ai_skeleton(
    assets: list[VisualAsset],
    tables: list[DetectedTable],
    text_lines: list[TextLine],
    page_w_pt: float,
    page_h_pt: float,
    is_digital: bool,
) -> dict[str, Any]:
    """Serialize compact OpenCV layout & table geometry (0..1000 coords) for Vision AI."""
    skeleton: dict[str, Any] = {
        "assets": [
            {
                "kind": a.kind,
                "box_2d": [
                    int(round(a.y0 / max(1.0, page_h_pt) * 1000.0)),
                    int(round(a.x0 / max(1.0, page_w_pt) * 1000.0)),
                    int(round(a.y1 / max(1.0, page_h_pt) * 1000.0)),
                    int(round(a.x1 / max(1.0, page_w_pt) * 1000.0)),
                ],
            }
            for a in assets
        ],
        "tables": [
            {
                "table_index": t_idx,
                "n_rows": t.n_rows,
                "n_cols": t.n_cols,
                "y_range_pct": [round(t.y0 / max(1.0, page_h_pt), 3), round(t.y1 / max(1.0, page_h_pt), 3)],
                "cells": [
                    {
                        "cell_id": c_idx,
                        "r0": c.r0,
                        "c0": c.c0,
                        "r1": c.r1,
                        "c1": c.c1,
                        "ocr_draft": c.text,
                    }
                    for c_idx, c in enumerate(t.cells)
                ],
            }
            for t_idx, t in enumerate(tables)
        ],
    }
    if is_digital and text_lines:
        skeleton["digital_native_lines"] = [
            {
                "box_2d": [
                    int(round(ln.y0 / max(1.0, page_h_pt) * 1000.0)),
                    int(round(ln.x0 / max(1.0, page_w_pt) * 1000.0)),
                    int(round(ln.y1 / max(1.0, page_h_pt) * 1000.0)),
                    int(round(ln.x1 / max(1.0, page_w_pt) * 1000.0)),
                ],
                "text": ln.text[:160],
            }
            for ln in text_lines[:45]
        ]
    return skeleton


def analyze_page_blueprint(
    page: fitz.Page,
    page_index: int,
    lang: str = "auto",
    dpi: int = 200,
    include_clean_bg: bool = False,
    layer_mode: str = "clean_real",
    ai_api_key: Optional[str] = None,
    ai_provider: Optional[str] = None,
    strict_local: bool = False,
    ai_mode: str = "docx",
    skip_ai: bool = False,
    detect_borderless: bool = False,
    digital_layout_fallback: bool = False,
) -> PageBlueprint:
    """
    Analyze a single PDF page with OpenCV + Hybrid OCR (+ Smart-Gated Grid-Guided Vision AI)
    to construct a complete 3-layer spatial & structural PageBlueprint.
    """
    page_w_pt = float(page.rect.width)
    page_h_pt = float(page.rect.height)

    # Render flattened bitmap bounded for Render 512MB RAM (or extract native portrait scan directly when 1200..1650px)
    pix = None
    img_raw_bgr: Optional[np.ndarray] = None
    is_raster_scan = is_page_raster_scan(page)
    try:
        imgs = page.get_images(full=True)
        if len(imgs) == 1 and int(getattr(page, "rotation", 0) or 0) == 0 and is_raster_scan:
            xref = int(imgs[0][0])
            nat_w, nat_h = int(imgs[0][2] or 0), int(imgs[0][3] or 0)
            if (
                nat_h > nat_w
                and min(nat_w, nat_h) >= 950
                and 1200 <= max(nat_w, nat_h) <= 1650
                and getattr(page, "parent", None) is not None
            ):
                rects = page.get_image_rects(xref)
                if len(rects) == 1:
                    ir = rects[0] & page.rect
                    if (ir.width * ir.height) >= 0.88 * max(1.0, page_w_pt * page_h_pt):
                        raw_bytes = page.parent.extract_image(xref).get("image", b"")
                        if raw_bytes:
                            decoded = cv2.imdecode(np.frombuffer(raw_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
                            if decoded is not None and decoded.size > 0:
                                img_raw_bgr = decoded
    except Exception:
        img_raw_bgr = None

    if img_raw_bgr is None:
        max_dim_pt = max(page_w_pt, page_h_pt, 1.0)
        if not is_raster_scan and str(layer_mode or "clean_real").strip().lower() == "clean_real":
            min_dpi = 120 if is_low_memory_runtime() else 145
            eff_dpi = min(max(dpi, min_dpi), 150, max(120, int((1800.0 * 72.0) / max_dim_pt)))
        else:
            min_dpi = 165 if is_low_memory_runtime() else 200
            eff_dpi = min(max(dpi, min_dpi), 220, max(145, int((2250.0 * 72.0) / max_dim_pt)))
        pix = page.get_pixmap(dpi=eff_dpi, alpha=False)
        try:
            img_rgb = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
            if pix.n == 3:
                img_raw_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
            elif pix.n == 1:
                img_raw_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_GRAY2BGR)
            else:
                img_raw_bgr = cv2.cvtColor(img_rgb[:, :, :3], cv2.COLOR_RGB2BGR)
        finally:
            del pix
            try:
                fitz.TOOLS.store_shrink(100)
            except Exception:
                pass

    # 1. Auto-deskew camera/scanner tilt BEFORE table grid & row detection
    img_deskewed_bgr, skew_deg = deskew_image_bgr(img_raw_bgr, max_angle=8.0) if is_raster_scan else (img_raw_bgr, 0.0)
    if img_deskewed_bgr is not img_raw_bgr:
        img_raw_bgr = None
    ih, iw = img_deskewed_bgr.shape[:2]
    px_to_pt = page_w_pt / float(max(1, iw))
    inv_pt_to_px = 1.0 / max(1e-6, px_to_pt)

    # Auto-detect Latin vs Indic fonts once per page
    latin_font = fitz.Font("helv")
    dev_font_path = find_devanagari_font()
    dev_font = fitz.Font(fontfile=str(dev_font_path)) if dev_font_path else None

    # 3. Sample dominant page paper tint & detect native digital vector text first (~35ms total)
    low_mem = is_low_memory_runtime()
    inv_scale = (1.0 / px_to_pt) if px_to_pt > 0 else 1.0

    native_words_px: list[OCRWord] = []
    digital_styles_by_idx: dict[int, tuple[float, bool, tuple[int, int, int]]] = {}
    is_digital_page = False
    if not is_raster_scan and abs(skew_deg) < 0.05:
        try:
            native_words_px, digital_styles_by_idx = _extract_digital_words_with_styles(page, inv_pt_to_px)
        except Exception:
            native_words_px, digital_styles_by_idx = [], {}

    all_words_px: list[OCRWord] = []
    rapid_words: list[OCRWord] = []
    resolved_lang = lang
    effective_hindi = False
    native_assets_pre: list[VisualAsset] = []
    embedded_ocr_uncertain = False

    if len(native_words_px) >= 6 and (
        latin_plausibility_score(native_words_px)[0] >= 0.70 or has_genuine_devanagari(native_words_px)
    ):
        is_digital_page = True
        all_words_px = list(native_words_px)
        rapid_words = list(native_words_px)
        resolved_lang = "hin+eng" if has_genuine_devanagari(native_words_px) else "eng"
        effective_hindi = has_genuine_devanagari(native_words_px)

    sub_bgr = img_deskewed_bgr[::4, ::4]
    gray_sub = cv2.cvtColor(sub_bgr, cv2.COLOR_BGR2GRAY)
    bright_sub = gray_sub >= np.percentile(gray_sub, 72)
    if np.any(bright_sub):
        med_p_bgr = np.median(sub_bgr[bright_sub], axis=0)
        paper_rgb = (int(med_p_bgr[2]), int(med_p_bgr[1]), int(med_p_bgr[0]))
    else:
        paper_rgb = (255, 255, 255)
    sub_ink = float(np.mean(gray_sub < 185))
    del sub_bgr, gray_sub, bright_sub

    raw_grids = _detect_raw_table_rois(
        img_deskewed_bgr,
        pdf_page=(page if is_digital_page else None),
        inv_pt_to_px=inv_pt_to_px,
    )

    tables: list[DetectedTable] = []
    table_boxes_px: list[tuple[int, int, int, int]] = []
    clean_non_table_words_px: list[OCRWord] = []
    assets: list[VisualAsset] = []
    text_lines: list[TextLine] = []
    has_curved_arch = False
    ai_enhanced = False
    orig_ocr_lines: list[TextLine] = []

    eff_provider: Optional[str] = None
    eff_key: Optional[str] = None
    if not skip_ai and not strict_local:
        try:
            from ai_vision_refiner import is_provider_blocked, resolve_vision_credentials

            ep, ek = resolve_vision_credentials(
                user_api_key=ai_api_key,
                provider=ai_provider,
                strict_local=strict_local,
            )
            if ep and ek and not is_provider_blocked(ep, ek):
                eff_provider, eff_key = ep, ek
        except Exception:
            pass

    # 3a. AI-First Zero-Tesseract-Wait Path for Scanned Pages:
    #     Skip 6-20s of CPU Tesseract subprocesses on non-table or <=48-cell scanned pages when Vision AI
    #     is active; fall back cleanly to full local CPU OCR only if AI returns empty/unavailable.
    total_raw_cells = sum(len(s) for _, _, s in raw_grids)
    is_blank_scan = sub_ink < 0.0022
    ai_first_attempted = False
    ai_first_succeeded = False
    if (
        not is_digital_page
        and not skip_ai
        and eff_provider
        and eff_key
        and not detect_borderless
        and not is_blank_scan
        and (len(raw_grids) == 0 or total_raw_cells <= 48)
    ):
        ai_first_attempted = True
        try:
            from ai_vision_refiner import request_grid_guided_refinement

            ai_tables: list[DetectedTable] = []
            if raw_grids:
                ai_tables = _populate_tables(
                    img_deskewed_bgr,
                    raw_grids,
                    [],
                    px_to_pt,
                    False,
                    latin_font,
                    dev_font,
                    paper_rgb=paper_rgb,
                    ocr_lang=lang,
                    is_digital_page=False,
                    skip_cell_ocr=True,
                )
            ai_table_boxes_px = [
                (
                    int(math.floor(t.x0 * inv_scale)),
                    int(math.floor(t.y0 * inv_scale)),
                    int(math.ceil(t.x1 * inv_scale)),
                    int(math.ceil(t.y1 * inv_scale)),
                )
                for t in ai_tables
            ]
            ai_assets, _ = _extract_visual_assets(img_deskewed_bgr, ai_table_boxes_px, [], px_to_pt)
            ai_skel = _build_ai_skeleton(ai_assets, ai_tables, [], page_w_pt, page_h_pt, is_digital=False)
            ai_res = request_grid_guided_refinement(
                img_deskewed_bgr,
                page_w_pt,
                page_h_pt,
                ai_skel,
                eff_provider,
                eff_key,
                lang_hint=lang,
                max_total_s=(24.0 if low_mem else 28.0),
                is_digital_page=False,
            )
            if isinstance(ai_res, dict) and ai_res:
                n_hdr = len(ai_res.get("header_lines") or [])
                n_blk = len(ai_res.get("non_table_blocks") or [])
                n_tbl_cells = sum(
                    len(t.get("cells") or [])
                    for t in (ai_res.get("tables") or [])
                    if isinstance(t, dict)
                )
                min_needed = 1 if (ai_tables or sub_ink < 0.015) else 2
                if (n_hdr + n_blk + n_tbl_cells) >= min_needed and (
                    not ai_tables or n_tbl_cells >= 1 or n_blk >= 1
                ):
                    fused_lines, fused_assets, has_curved_arch, ai_enhanced = _apply_ai_refinement(
                        ai_res,
                        ai_tables,
                        [],
                        ai_assets,
                        page_w_pt,
                        page_h_pt,
                        img_deskewed_bgr=img_deskewed_bgr,
                        px_to_pt=px_to_pt,
                    )
                    if fused_lines or any(c.text for t in ai_tables for c in t.cells):
                        bp = _assemble_page_blueprint(
                            page_index,
                            page_w_pt,
                            page_h_pt,
                            skew_deg,
                            ai_tables,
                            fused_assets,
                            fused_lines,
                            has_curved_arch,
                            ai_enhanced,
                            [],
                            [],
                            ai_table_boxes_px,
                            img_deskewed_bgr,
                            px_to_pt,
                            include_clean_bg,
                            layer_mode,
                        )
                        del img_raw_bgr, img_deskewed_bgr
                        return bp
        except Exception as ai_fast_exc:
            logger.warning(f"[Blueprint] AI-First fast path fallback to local OCR: {type(ai_fast_exc).__name__}")

    if not ai_first_succeeded:
        if not is_digital_page:
            if low_mem:
                with _LOW_MEM_CPU_OCR_SEM:
                    all_words_px, rapid_words, resolved_lang = ocr_page_words_with_meta(
                        img_deskewed_bgr, lang=lang, clean_watermarks=True, latin_font=latin_font, dev_font=dev_font
                    )
            else:
                all_words_px, rapid_words, resolved_lang = ocr_page_words_with_meta(
                    img_deskewed_bgr, lang=lang, clean_watermarks=True, latin_font=latin_font, dev_font=dev_font
                )
            wants_hindi = "hin" in resolved_lang.lower()
            genuine_hindi = wants_hindi and has_genuine_devanagari(all_words_px)
            if wants_hindi and not genuine_hindi:
                all_words_px = rapid_words or all_words_px
                effective_hindi = False
                resolved_lang = "eng"
            else:
                effective_hindi = genuine_hindi
        else:
            # 3b. Extract native embedded graphics cleanly and run targeted local RapidOCR
            #     on large text-free raster screenshots/tables inside born-digital pages.
            try:
                native_assets_pre = _extract_digital_native_assets(page, img_deskewed_bgr, px_to_pt)
                if native_assets_pre:
                    extra_img_words, native_assets_pre, embedded_ocr_uncertain = _ocr_embedded_raster_boxes(
                        img_deskewed_bgr,
                        native_words_px,
                        native_assets_pre,
                        px_to_pt,
                        latin_font=latin_font,
                        dev_font=dev_font,
                        lang=lang,
                    )
                    if extra_img_words:
                        all_words_px.extend(extra_img_words)
                        rapid_words.extend(extra_img_words)
                        if has_genuine_devanagari(extra_img_words):
                            effective_hindi = True
                            resolved_lang = "hin+eng"
            except Exception as dig_err:
                logger.debug(f"[Blueprint] Digital native asset pre-pass skip: {dig_err}")
                native_assets_pre = []

        native_style_by_id: dict[int, tuple[float, bool, tuple[int, int, int]]] = {}
        if is_digital_page and digital_styles_by_idx:
            for orig_idx, nw in enumerate(native_words_px):
                st = digital_styles_by_idx.get(orig_idx)
                if st is not None:
                    native_style_by_id[id(nw)] = st

        if not raw_grids and detect_borderless:
            raw_grids = _detect_borderless_table_grids(all_words_px, ih, iw)
        tables = _populate_tables(
            img_deskewed_bgr,
            raw_grids,
            all_words_px,
            px_to_pt,
            effective_hindi,
            latin_font,
            dev_font,
            paper_rgb=paper_rgb,
            ocr_lang=resolved_lang,
            is_digital_page=is_digital_page,
            native_style_by_id=(native_style_by_id or None),
        )
        table_boxes_px = [
            (
                int(math.floor(t.x0 * inv_scale)),
                int(math.floor(t.y0 * inv_scale)),
                int(math.ceil(t.x1 * inv_scale)),
                int(math.ceil(t.y1 * inv_scale)),
            )
            for t in tables
        ]

    # 5. Non-table words (exclude detected tables, decorative color side ribbons & margin specks)
    left_rot_cnt = sum(
        1 for w in all_words_px
        if w.x1 < iw * 0.085 and (w.y1 - w.y0) > (w.x1 - w.x0) * 1.45 and len(w.text.strip()) >= 2
    )
    right_rot_cnt = sum(
        1 for w in all_words_px
        if w.x0 > iw * 0.915 and (w.y1 - w.y0) > (w.x1 - w.x0) * 1.45 and len(w.text.strip()) >= 2
    )

    # Detect saturated vertical side ribbons on outer 11% margin strips (avoiding full-page HSV copy)
    left_lim = min(iw - 1, int(iw * 0.11))
    left_ribbon_x = -1
    if left_lim > 0:
        hsv_left = cv2.cvtColor(img_deskewed_bgr[:, :left_lim], cv2.COLOR_BGR2HSV)
        sat_left = (hsv_left[:, :, 1] >= 65) & (hsv_left[:, :, 2] >= 45) & (hsv_left[:, :, 2] <= 235)
        col_left_frac = np.mean(sat_left, axis=0)
        for cx in range(left_lim):
            if col_left_frac[cx] >= 0.22:
                left_ribbon_x = cx + 4
        del hsv_left, sat_left, col_left_frac

    right_start = max(0, int(iw * 0.89))
    right_ribbon_x = iw + 1
    if right_start < iw:
        hsv_right = cv2.cvtColor(img_deskewed_bgr[:, right_start:], cv2.COLOR_BGR2HSV)
        sat_right = (hsv_right[:, :, 1] >= 65) & (hsv_right[:, :, 2] >= 45) & (hsv_right[:, :, 2] <= 235)
        col_right_frac = np.mean(sat_right, axis=0)
        for cx in range(iw - 1, right_start - 1, -1):
            if col_right_frac[cx - right_start] >= 0.22:
                right_ribbon_x = cx - 4
        del hsv_right, sat_right, col_right_frac

    non_table_words_px: list[OCRWord] = []
    for w in all_words_px:
        wcx = (w.x0 + w.x1) * 0.5
        wcy = (w.y0 + w.y1) * 0.5
        wbw = max(1, w.x1 - w.x0)
        wbh = max(1, w.y1 - w.y0)
        wtxt = w.text.strip()
        if any(_point_in_box(wcx, wcy, tb, pad=2.0) for tb in table_boxes_px):
            continue
        if left_rot_cnt >= 2 and w.x1 < iw * 0.080:
            continue
        if right_rot_cnt >= 2 and w.x0 > iw * 0.920:
            continue
        if (w.x1 < iw * 0.095 or w.x0 > iw * 0.905) and wbh > wbw * 1.40:
            has_same_row_partner = len(wtxt) <= 2 and any(
                w2 is not w
                and abs(((w2.y0 + w2.y1) * 0.5) - wcy) <= max(8.0, wbh * 0.95)
                and 0 < abs((w2.x0 + w2.x1) * 0.5 - wcx) < iw * 0.10
                for w2 in all_words_px
            )
            if not has_same_row_partner:
                continue
        if w.x1 <= left_ribbon_x or w.x0 >= right_ribbon_x:
            continue
        # Suppress outer-margin ornament symbols (`©`, `+`) or isolated specks (`KH`, `R`),
        # while NEVER dropping numbered list markers (`1.`, ..., `(i)`) or inline pagination digits (`Page 1 of 3`).
        if w.x1 < iw * 0.088 or w.x0 > iw * 0.905:
            is_list_bullet = bool(re.match(r"^(?:\d{1,2}\.|[a-zA-Z]\.|\([a-zA-Z0-9]+\))$", wtxt))
            alnum_len = len(re.findall(r"[A-Za-z0-9\u0900-\u097F]", wtxt))
            has_inline_neighbor = (
                alnum_len >= 1
                and any(
                    w2 is not w
                    and abs(((w2.y0 + w2.y1) * 0.5) - wcy) <= max(8.0, wbh * 0.95)
                    and (0 <= abs((w2.x0 + w2.x1) * 0.5 - wcx) < iw * 0.10)
                    for w2 in all_words_px
                )
            )
            if not is_list_bullet and not has_inline_neighbor and (alnum_len == 0 or (len(wtxt) <= 2 and alnum_len <= 1)):
                continue
        if (w.x1 < iw * 0.088 or w.x0 > iw * 0.912) and (len(wtxt) <= 3 or (len(wtxt) <= 4 and w.conf < 0.85)):
            has_neighbor = any(
                w2 is not w
                and abs(((w2.y0 + w2.y1) * 0.5) - wcy) <= max(10.0, wbh * 0.95)
                and (
                    (w.x1 < iw * 0.088 and -6.0 <= (w2.x0 - w.x1) < iw * 0.14)
                    or (w.x0 > iw * 0.912 and -6.0 <= (w.x0 - w2.x1) < iw * 0.14)
                )
                for w2 in all_words_px
            )
            if not has_neighbor:
                continue
        non_table_words_px.append(w)

    # 6. Extract Logos, Passport Photos, QR Codes, Stamps & Signatures
    skip_cv_assets = False
    if is_digital_page:
        if native_assets_pre:
            skip_cv_assets = True
        else:
            try:
                has_imgs = bool(page.get_images(full=False))
                has_non_grid_curves = False
                if not has_imgs:
                    for drw in page.get_drawings():
                        items_d = drw.get("items") or []
                        if any(it[0] == "c" for it in items_d):
                            drw_rect = drw.get("rect")
                            if drw_rect is not None:
                                rcx = ((float(drw_rect.x0) + float(drw_rect.x1)) * 0.5) * inv_scale
                                rcy = ((float(drw_rect.y0) + float(drw_rect.y1)) * 0.5) * inv_scale
                                if not any(_point_in_box(rcx, rcy, tb, pad=4.0) for tb in table_boxes_px):
                                    has_non_grid_curves = True
                                    break
                skip_cv_assets = (not has_imgs) and (not has_non_grid_curves)
            except Exception:
                skip_cv_assets = False

    sig_panel_boxes: list[tuple[int, int, int, int]] = []
    if skip_cv_assets:
        cv_assets, suppress_ocr_boxes = [], []
    else:
        cv_assets, suppress_ocr_boxes = _extract_visual_assets(
            img_deskewed_bgr,
            table_boxes_px,
            non_table_words_px,
            px_to_pt,
            out_sig_boxes=(None if is_digital_page else sig_panel_boxes),
        )
    if not is_digital_page and sig_panel_boxes:
        for sb in sig_panel_boxes:
            inside_cnt = sum(
                1
                for w in non_table_words_px
                if w.conf >= 0.50
                and len(w.text.strip()) >= 2
                and _point_in_box((w.x0 + w.x1) * 0.5, (w.y0 + w.y1) * 0.5, sb, pad=2.0)
            )
            if inside_cnt < 5:
                recovered_sig = extract_signature_panel_text(img_deskewed_bgr, sb)
                if len(recovered_sig) >= 3:
                    non_table_words_px = [
                        w
                        for w in non_table_words_px
                        if not _point_in_box((w.x0 + w.x1) * 0.5, (w.y0 + w.y1) * 0.5, sb, pad=4.0)
                    ]
                    non_table_words_px.extend(recovered_sig)
    if is_digital_page and native_assets_pre:
        # Clean table slivers, merge barcode/wide-asset spans, split left-text|right-signature cells,
        # attach in-table native photos/signatures/barcodes to TableCell.assets, and keep outside
        # assets (logos, side-by-side photos/signatures) anchored externally!
        _normalize_table_slivers(tables)
        filtered_native: list[VisualAsset] = []
        for na in native_assets_pre:
            na_box_px = (
                int(na.x0 * inv_scale),
                int(na.y0 * inv_scale),
                int(na.x1 * inv_scale),
                int(na.y1 * inv_scale),
            )
            in_tbl_idx: Optional[int] = None
            best_tbl_iou = 0.0
            for t_i, tb in enumerate(table_boxes_px):
                sc_iou = _rect_iou(na_box_px, tb)
                if sc_iou > 0.55 and sc_iou > best_tbl_iou:
                    best_tbl_iou = sc_iou
                    in_tbl_idx = t_i
            if in_tbl_idx is None:
                filtered_native.append(na)
            else:
                _attach_asset_to_table_cell(tables[in_tbl_idx], na)
        merged_assets: list[VisualAsset] = list(filtered_native)
        for ca in cv_assets:
            ca_box = (ca.x0, ca.y0, ca.x1, ca.y1)
            if any(_rect_iou(ca_box, (na.x0, na.y0, na.x1, na.y1)) > 0.25 for na in merged_assets):
                continue
            if any(_rect_iou(ca_box, (t.x0, t.y0, t.x1, t.y1)) > 0.55 for t in tables):
                continue
            merged_assets.append(ca)
        merged_assets.sort(key=lambda a: (a.y0, a.x0))
        assets = merged_assets
    else:
        assets = cv_assets

    # Remove spurious garbage OCR tokens inside emblems / QR / photo frames
    clean_non_table_words_px = (
        [
            w
            for w in non_table_words_px
            if not any(_point_in_box((w.x0 + w.x1) * 0.5, (w.y0 + w.y1) * 0.5, sb, pad=2.0) for sb in suppress_ocr_boxes)
        ]
        if suppress_ocr_boxes
        else non_table_words_px
    )

    # 7. Group remaining words into lines with font size, relative boldness, ink color & alignment
    det_words_map: dict[int, DetectedWord] = {}
    all_styled_natively = is_digital_page and bool(clean_non_table_words_px) and all(
        id(w) in native_style_by_id for w in clean_non_table_words_px
    )
    if all_styled_natively:
        for w in clean_non_table_words_px:
            w_fs, bold, w_rgb = native_style_by_id[id(w)]
            det_words_map[id(w)] = DetectedWord(
                text=w.text,
                x0=w.x0 * px_to_pt,
                y0=w.y0 * px_to_pt,
                x1=w.x1 * px_to_pt,
                y1=w.y1 * px_to_pt,
                conf=w.conf,
                font_size_pt=w_fs,
                color_rgb=w_rgb,
                is_bold=bold,
                is_devanagari=bool(_DEVANAGARI_RE.search(w.text)),
            )
    else:
        un_styled_idx = [i for i, w in enumerate(clean_non_table_words_px) if id(w) not in native_style_by_id]
        un_styled_words = [clean_non_table_words_px[i] for i in un_styled_idx]
        font_sizes = _estimate_word_font_size(un_styled_words, px_to_pt, img_bgr=img_deskewed_bgr)
        word_metrics = [
            _sample_word_ink_metrics(img_deskewed_bgr, int(w.x0), int(w.y0), int(w.x1), int(w.y1))
            for w in un_styled_words
        ]
        valid_ratios = [
            m[1]
            for w, m in zip(un_styled_words, word_metrics)
            if (w.y1 - w.y0) >= 12 and len(w.text.strip()) >= 2 and m[1] > 0.05
        ]
        med_ink_ratio = float(np.percentile(valid_ratios, 40)) if valid_ratios else 0.30
        bold_thresh = max(0.36, min(0.56, med_ink_ratio + 0.085))
        metric_by_orig = {orig_i: (pos, word_metrics[pos]) for pos, orig_i in enumerate(un_styled_idx)}

        for idx, w in enumerate(clean_non_table_words_px):
            native_st = native_style_by_id.get(id(w))
            if native_st is not None:
                w_fs, bold, w_rgb = native_st
            else:
                pos, (rgb, ink_ratio, _) = metric_by_orig[idx]
                w_fs = font_sizes.get(pos, 10.0)
                bold = ink_ratio > bold_thresh and (w.y1 - w.y0) >= 12
                w_rgb = rgb
            det_words_map[id(w)] = DetectedWord(
                text=w.text,
                x0=w.x0 * px_to_pt,
                y0=w.y0 * px_to_pt,
                x1=w.x1 * px_to_pt,
                y1=w.y1 * px_to_pt,
                conf=w.conf,
                font_size_pt=w_fs,
                color_rgb=w_rgb,
                is_bold=bold,
                is_devanagari=bool(_DEVANAGARI_RE.search(w.text)),
            )

    grouped_px_lines = _group_words_to_lines(clean_non_table_words_px)
    wide_line_x0s: list[float] = []
    wide_line_x1s: list[float] = []
    for ln_px in grouped_px_lines:
        lx0_pt = min(w.x0 for w in ln_px) * px_to_pt
        lx1_pt = max(w.x1 for w in ln_px) * px_to_pt
        if (lx1_pt - lx0_pt) >= page_w_pt * 0.25:
            wide_line_x0s.append(lx0_pt)
            wide_line_x1s.append(lx1_pt)
    body_left_pt = float(np.percentile(wide_line_x0s, 18)) if wide_line_x0s else page_w_pt * 0.09
    right_bound_pt = min(
        page_w_pt * 0.94,
        float(right_ribbon_x) * px_to_pt if right_ribbon_x <= iw else page_w_pt * 0.94,
    )
    left_bound_pt = max(0.0, float(left_ribbon_x) * px_to_pt if left_ribbon_x >= 0 else 0.0)
    content_mid_pt = (
        (max(left_bound_pt + page_w_pt * 0.04, body_left_pt) + right_bound_pt) * 0.5
        if right_ribbon_x <= iw or left_ribbon_x >= 0
        else page_w_pt * 0.5
    )

    # Detect whether non-table page body has a clean vertical two-column gutter near mid-page
    two_col_gutter_x: Optional[float] = None
    if len(clean_non_table_words_px) >= 40:
        best_g_score = -1
        for pct in range(45, 56, 2):
            gx = page_w_pt * (pct / 100.0)
            l_cnt = sum(1 for ln_px in grouped_px_lines if any(w.x1 * px_to_pt <= gx - 3.0 for w in ln_px))
            r_cnt = sum(1 for ln_px in grouped_px_lines if any(w.x0 * px_to_pt >= gx + 3.0 for w in ln_px))
            straddle_cnt = sum(
                1 for w in clean_non_table_words_px if (w.x0 * px_to_pt) < gx - 2.0 and (w.x1 * px_to_pt) > gx + 2.0
            )
            if l_cnt >= 6 and r_cnt >= 6 and straddle_cnt <= max(2, len(grouped_px_lines) // 10):
                sc_g = min(l_cnt, r_cnt) - straddle_cnt * 6
                if sc_g > best_g_score:
                    best_g_score = sc_g
                    two_col_gutter_x = gx

    text_lines: list[TextLine] = []
    for ln_px in grouped_px_lines:
        d_words = [det_words_map[id(w)] for w in ln_px]
        # Split horizontal line segments cleanly across genuine multi-column gaps OR two-column vertical gutter
        sub_segments: list[list[DetectedWord]] = [[d_words[0]]]
        for dw_idx, dw in enumerate(d_words[1:], 1):
            prev = sub_segments[-1][-1]
            gap_pt = dw.x0 - prev.x1
            rem_txt = " ".join(w_rem.text for w_rem in d_words[dw_idx:])
            crosses_gutter = (
                two_col_gutter_x is not None
                and prev.x1 <= two_col_gutter_x + 2.0
                and dw.x0 >= two_col_gutter_x - 2.0
                and gap_pt >= max(10.0, dw.font_size_pt * 1.35)
            )
            is_col_break = (
                crosses_gutter
                or gap_pt > max(135.0, page_w_pt * 0.24)
                or (is_digital_page and gap_pt > max(68.0, page_w_pt * 0.115))
                or (
                    gap_pt > max(58.0, page_w_pt * 0.10)
                    and (":" in rem_txt or dw.y0 > page_h_pt * 0.76 or dw.y0 < page_h_pt * 0.22)
                )
            )
            if is_col_break:
                sub_segments.append([dw])
            else:
                sub_segments[-1].append(dw)

        for seg in sub_segments:
            lx0 = min(d.x0 for d in seg)
            ly0 = min(d.y0 for d in seg)
            lx1 = max(d.x1 for d in seg)
            ly1 = max(d.y1 for d in seg)
            txt = " ".join(d.text for d in seg).strip()
            if not txt:
                continue
            med_fs = float(np.median([d.font_size_pt for d in seg]))
            is_b = sum(1 for d in seg if d.is_bold) >= max(1, len(seg) // 2 + 1)
            dom_color = max(seg, key=lambda d: len(d.text)).color_rgb
            # Snap washed-out olive/yellow watermark-tinted ink or overly bright grey to crisp dark charcoal
            if (min(dom_color) >= 75 and sum(dom_color) > 345) or (
                dom_color[0] > 115 and dom_color[1] > 115 and dom_color[2] < 135 and sum(dom_color) > 335
            ):
                dom_color = (24, 32, 46)
            seg_mid = (lx0 + lx1) * 0.5
            seg_w = lx1 - lx0
            starts_indented = lx0 > (body_left_pt + max(18.0, page_w_pt * 0.045))
            near_center = (
                min(abs(seg_mid - page_w_pt * 0.5), abs(seg_mid - content_mid_pt)) <= page_w_pt * 0.085
            )
            if near_center and starts_indented and seg_w < page_w_pt * 0.65:
                align = "center"
            elif lx0 > page_w_pt * 0.65:
                align = "right"
            else:
                align = "left"

            text_lines.append(
                TextLine(
                    words=seg,
                    x0=lx0,
                    y0=ly0,
                    x1=lx1,
                    y1=ly1,
                    text=txt,
                    font_size_pt=round(med_fs * 2.0) / 2.0,
                    is_bold=is_b,
                    color_rgb=dom_color,
                    align=align,
                )
            )

    # 8. Smart-Gated Optional Vision AI Semantic Refinement
    #    - For scanned pages: skips crisp scans cleanly, calls Gemini when blur/mojibake/noise detected.
    #    - For born-digital pages: skips crisp text PDFs cleanly, calls Gemini when image/signature
    #      positioning, multi-column visual alignment, or embedded raster-image OCR needs assist.
    has_curved_arch = False
    ai_enhanced = False
    orig_ocr_lines = list(text_lines)
    digital_side_layout_risk = False
    if is_digital_page and assets:
        # Check whether any asset shares a horizontal/vertical band with tables or side-by-side text
        for a in assets:
            a_cy = (a.y0 + a.y1) * 0.5
            shares_tbl_y = any(
                (t.y0 - 8.0) <= a_cy <= (t.y1 + 8.0) and ((a.x1 <= t.x0 - 4.0) or (a.x0 >= t.x1 + 4.0))
                for t in tables
            )
            shares_line_y = sum(
                1 for ln in text_lines
                if (ln.y0 - 6.0) <= a_cy <= (ln.y1 + 6.0) and ((ln.x1 <= a.x0 - 4.0) or (ln.x0 >= a.x1 + 4.0))
            ) >= 2
            if shares_tbl_y or shares_line_y:
                digital_side_layout_risk = True
                break

    if not skip_ai and not ai_first_attempted:
        try:
            from ai_vision_refiner import (
                assess_page_ai_need,
                is_provider_blocked,
                request_grid_guided_refinement,
                resolve_vision_credentials,
            )

            if not (eff_provider and eff_key):
                eff_provider, eff_key = resolve_vision_credentials(
                    user_api_key=ai_api_key,
                    provider=ai_provider,
                    strict_local=strict_local,
                )
            if eff_provider and eff_key and not is_provider_blocked(eff_provider, eff_key):
                gate = assess_page_ai_need(
                    all_words_px,
                    tables,
                    img_bgr=img_deskewed_bgr,
                    angle_deg=skew_deg,
                    mode=ai_mode,
                    page_idx=page_index,
                    assets=assets,
                    is_digital_page=is_digital_page,
                    embedded_ocr_uncertain=embedded_ocr_uncertain,
                    digital_side_layout_risk=digital_side_layout_risk,
                    digital_layout_fallback=digital_layout_fallback,
                )
                logger.info(
                    f"[Blueprint] Page {page_index + 1} AI Gate (digital={is_digital_page}): call={gate['should_call']} "
                    f"(score={gate['score']}, tbl={gate['table_score']}, reasons={gate['reasons']})"
                )
                if gate["should_call"]:
                    skeleton = _build_ai_skeleton(
                        assets, tables, text_lines, page_w_pt, page_h_pt, is_digital=is_digital_page
                    )
                    ai_res = request_grid_guided_refinement(
                        img_deskewed_bgr,
                        page_w_pt,
                        page_h_pt,
                        skeleton,
                        eff_provider,
                        eff_key,
                        lang_hint=resolved_lang,
                        max_total_s=(24.0 if low_mem else 28.0),
                        is_digital_page=is_digital_page,
                    )
                    if ai_res:
                        text_lines, assets, has_curved_arch, ai_enhanced = _apply_ai_refinement(
                            ai_res,
                            tables,
                            text_lines,
                            assets,
                            page_w_pt,
                            page_h_pt,
                            img_deskewed_bgr=img_deskewed_bgr,
                            px_to_pt=px_to_pt,
                        )
        except Exception as exc:
            logger.warning(f"[Blueprint] AI Vision refinement skipped cleanly: {type(exc).__name__}: {exc}")

    # 9. Detect outer decorative certificate border + build hierarchical layout bands
    bp = _assemble_page_blueprint(
        page_index,
        page_w_pt,
        page_h_pt,
        skew_deg,
        tables,
        assets,
        text_lines,
        has_curved_arch,
        ai_enhanced,
        orig_ocr_lines,
        clean_non_table_words_px,
        table_boxes_px,
        img_deskewed_bgr,
        px_to_pt,
        include_clean_bg,
        layer_mode,
    )
    del img_raw_bgr, img_deskewed_bgr
    return bp


# ---------------------------------------------------------------------------
# Bilingual Run Formatting Helpers
# ---------------------------------------------------------------------------


def _split_bilingual_runs(text: str) -> list[tuple[str, bool]]:
    """Split a string into contiguous (segment, is_devanagari) tuples."""
    if not text:
        return []
    out: list[tuple[str, bool]] = []
    for seg in _LATIN_RUN_RE.findall(text):
        if seg:
            out.append((seg, bool(_DEVANAGARI_RE.search(seg))))
    return out


# ---------------------------------------------------------------------------
# Builder 1: Microsoft Word & Apple Pages Exact DOCX Reconstructor
# ---------------------------------------------------------------------------


_TCPR_TEMPLATE_CACHE: dict[tuple[Optional[tuple[int, int, int]], bool, int, int], tuple[Any, ...]] = {}


def _apply_docx_cell_style(
    cell,
    bg_rgb: Optional[tuple[int, int, int]] = None,
    borders: bool = True,
    pad_lr_dxa: int = 60,
    pad_tb_dxa: int = 36,
) -> None:
    """Configure OOXML cell shading, thin borders, and tight compact padding."""
    from docx.oxml import OxmlElement, parse_xml
    from docx.oxml.ns import nsdecls, qn

    tcPr = cell._tc.get_or_add_tcPr()

    for tag_name in ("w:tcMar", "w:vAlign", "w:shd", "w:tcBorders"):
        for old_el in tcPr.findall(qn(tag_name)):
            tcPr.remove(old_el)

    cache_key = (bg_rgb, borders, pad_lr_dxa, pad_tb_dxa)
    tmpl = _TCPR_TEMPLATE_CACHE.get(cache_key)
    if tmpl is None:
        tcMar = OxmlElement("w:tcMar")
        for edge, dxa in (("top", pad_tb_dxa), ("bottom", pad_tb_dxa), ("left", pad_lr_dxa), ("right", pad_lr_dxa)):
            el = OxmlElement(f"w:{edge}")
            el.set(qn("w:w"), str(dxa))
            el.set(qn("w:type"), "dxa")
            tcMar.append(el)

        vAlign = OxmlElement("w:vAlign")
        vAlign.set(qn("w:val"), "center")

        built: list[Any] = [tcMar, vAlign]
        if bg_rgb is not None:
            r, g, b = bg_rgb
            hex_col = f"{r:02X}{g:02X}{b:02X}"
            built.append(parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_col}"/>'))

        if borders:
            b_xml = (
                f'<w:tcBorders {nsdecls("w")}>'
                '<w:top w:val="single" w:sz="4" w:space="0" w:color="374151"/>'
                '<w:left w:val="single" w:sz="4" w:space="0" w:color="374151"/>'
                '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="374151"/>'
                '<w:right w:val="single" w:sz="4" w:space="0" w:color="374151"/>'
                "</w:tcBorders>"
            )
        else:
            b_xml = (
                f'<w:tcBorders {nsdecls("w")}>'
                '<w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
                '<w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
                '<w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
                '<w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
                "</w:tcBorders>"
            )
        built.append(parse_xml(b_xml))
        tmpl = tuple(built)
        _TCPR_TEMPLATE_CACHE[cache_key] = tmpl

    for tmpl_el in tmpl:
        tcPr.append(copy.deepcopy(tmpl_el))


def _set_docx_table_borders_and_cols(table, col_widths_pt: list[float], bordered: bool) -> None:
    """Enforce fixed OOXML tblLayout + explicit <w:gridCol> widths for MS Word + Apple Pages."""
    from docx.oxml import OxmlElement, parse_xml
    from docx.oxml.ns import nsdecls, qn
    from docx.shared import Pt

    tblPr = table._tbl.tblPr
    if tblPr is None:
        tblPr = OxmlElement("w:tblPr")
        table._tbl.insert(0, tblPr)

    # Fixed layout prevents auto-collapsing narrow columns in Pages/Word
    for old_l in tblPr.findall(qn("w:tblLayout")):
        tblPr.remove(old_l)
    tblLayout = OxmlElement("w:tblLayout")
    tblLayout.set(qn("w:type"), "fixed")
    tblPr.append(tblLayout)

    for old_b in tblPr.findall(qn("w:tblBorders")):
        tblPr.remove(old_b)
    if bordered:
        b_xml = (
            f'<w:tblBorders {nsdecls("w")}>'
            '<w:top w:val="single" w:sz="6" w:space="0" w:color="1F2937"/>'
            '<w:left w:val="single" w:sz="6" w:space="0" w:color="1F2937"/>'
            '<w:bottom w:val="single" w:sz="6" w:space="0" w:color="1F2937"/>'
            '<w:right w:val="single" w:sz="6" w:space="0" w:color="1F2937"/>'
            '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="4B5563"/>'
            '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="4B5563"/>'
            "</w:tblBorders>"
        )
    else:
        b_xml = (
            f'<w:tblBorders {nsdecls("w")}>'
            '<w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            '<w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            '<w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            '<w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            '<w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            '<w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            "</w:tblBorders>"
        )
    tblPr.append(parse_xml(b_xml))

    # Set total width & exact column grid widths
    total_w_pt = max(72.0, sum(col_widths_pt))
    total_dxa = int(round(total_w_pt * 20.0))
    for old_w in tblPr.findall(qn("w:tblW")):
        tblPr.remove(old_w)
    tblW = OxmlElement("w:tblW")
    tblW.set(qn("w:w"), str(total_dxa))
    tblW.set(qn("w:type"), "dxa")
    tblPr.append(tblW)

    tblGrid = table._tbl.tblGrid
    if tblGrid is not None:
        for gc_el in list(tblGrid):
            tblGrid.remove(gc_el)
        for cw in col_widths_pt:
            gc_el = OxmlElement("w:gridCol")
            gc_el.set(qn("w:w"), str(max(120, int(round(cw * 20.0)))))
            tblGrid.append(gc_el)

    table.autofit = False
    col_dxa_strs = [str(max(120, int(round(cw * 20.0)))) for cw in col_widths_pt]
    for tr in table._tbl.tr_lst:
        for c_idx, tc in enumerate(tr.tc_lst):
            if c_idx < len(col_dxa_strs):
                tcPr = tc.get_or_add_tcPr()
                tcW = tcPr.find(qn("w:tcW"))
                if tcW is None:
                    tcW = OxmlElement("w:tcW")
                    tcPr.insert(0, tcW)
                tcW.set(qn("w:w"), col_dxa_strs[c_idx])
                tcW.set(qn("w:type"), "dxa")


_XML_CTRL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_RPR_TEMPLATE_CACHE: dict[tuple[bool, int, bool, str], Any] = {}


def _add_bilingual_runs_docx(
    paragraph,
    text: str,
    font_size_pt: float,
    bold: bool = False,
    color_rgb: tuple[int, int, int] = (17, 24, 39),
) -> None:
    """Append styled English + Devanagari (`hi-IN` bidi) runs to a Word paragraph using cached lxml <w:rPr> templates."""
    from docx.oxml import OxmlElement, parse_xml
    from docx.oxml.ns import nsdecls, qn

    if not text:
        return
    clean_text = _XML_CTRL_CHAR_RE.sub("", text)
    if not clean_text:
        return

    half_pts = max(8, min(144, int(round(float(font_size_pt) * 2.0))))
    hex_col = f"{color_rgb[0]:02X}{color_rgb[1]:02X}{color_rgb[2]:02X}"
    p_el = paragraph._p
    w_r_tag = qn("w:r")
    w_t_tag = qn("w:t")
    xml_space_attr = "{http://www.w3.org/XML/1998/namespace}space"

    for seg, is_dev in _split_bilingual_runs(clean_text):
        key = (is_dev, half_pts, bool(bold), hex_col)
        rPr_tmpl = _RPR_TEMPLATE_CACHE.get(key)
        if rPr_tmpl is None:
            font_name = "Noto Sans Devanagari" if is_dev else "Arial"
            b_xml = "<w:b/><w:bCs/>" if bold else ""
            lang_xml = '<w:lang w:bidi="hi-IN"/>' if is_dev else ""
            rFonts_xml = (
                f'<w:rFonts w:ascii="{font_name}" w:hAnsi="{font_name}" w:cs="{font_name}" w:eastAsia="{font_name}"/>'
                if is_dev
                else f'<w:rFonts w:ascii="{font_name}" w:hAnsi="{font_name}"/>'
            )
            rPr_tmpl = parse_xml(
                f'<w:rPr {nsdecls("w")}>{rFonts_xml}{b_xml}<w:color w:val="{hex_col}"/>'
                f'<w:sz w:val="{half_pts}"/><w:szCs w:val="{half_pts}"/>{lang_xml}</w:rPr>'
            )
            if len(_RPR_TEMPLATE_CACHE) >= 512:
                _RPR_TEMPLATE_CACHE.clear()
            _RPR_TEMPLATE_CACHE[key] = rPr_tmpl

        r_el = OxmlElement("w:r")
        r_el.tag = w_r_tag
        r_el.append(copy.deepcopy(rPr_tmpl))
        t_el = OxmlElement("w:t")
        t_el.tag = w_t_tag
        if seg[0].isspace() or seg[-1].isspace():
            t_el.set(xml_space_attr, "preserve")
        t_el.text = seg
        r_el.append(t_el)
        p_el.append(r_el)


def _set_docx_page_border(section, border_rgb: tuple[int, int, int]) -> None:
    """Attach clean OOXML `<w:pgBorders>` matching ISO/IEC 29500 `CT_SectPr` child element order."""
    from docx.oxml import parse_xml
    from docx.oxml.ns import nsdecls, qn

    sectPr = section._sectPr
    for old_pb in sectPr.findall(qn("w:pgBorders")):
        sectPr.remove(old_pb)

    hex_col = f"{border_rgb[0]:02X}{border_rgb[1]:02X}{border_rgb[2]:02X}"
    pb_xml = (
        f'<w:pgBorders {nsdecls("w")} w:offsetFrom="page">'
        f'<w:top w:val="single" w:sz="16" w:space="14" w:color="{hex_col}"/>'
        f'<w:left w:val="single" w:sz="16" w:space="14" w:color="{hex_col}"/>'
        f'<w:bottom w:val="single" w:sz="16" w:space="14" w:color="{hex_col}"/>'
        f'<w:right w:val="single" w:sz="16" w:space="14" w:color="{hex_col}"/>'
        "</w:pgBorders>"
    )
    pb_el = parse_xml(pb_xml)
    pg_mar = sectPr.find(qn("w:pgMar"))
    if pg_mar is not None:
        pg_mar.addnext(pb_el)
    else:
        sectPr.append(pb_el)


def _add_docx_positioned_picture_anchor(
    docx_doc,
    img_bytes: bytes,
    x_pt: float,
    y_pt: float,
    width_pt: float,
    height_pt: float,
    *,
    behind_doc: bool = False,
    shape_id: int = 1,
    shape_name: str = "PositionedAsset",
) -> None:
    """
    Place an image at exact `(x_pt, y_pt)` page coordinates using DrawingML `<wp:anchor>`
    inside a near-zero-height paragraph so floating photos/signatures/canvases never
    push adjacent tables or text paragraphs out of position.
    """
    from docx.oxml import parse_xml
    from docx.oxml.ns import nsdecls, qn
    from docx.shared import Pt

    p = docx_doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    pf.line_spacing = Pt(1)
    run = p.add_run()
    run.font.size = Pt(1)
    run.add_picture(io.BytesIO(img_bytes), width=Pt(width_pt), height=Pt(height_pt))

    drawing = run._r.find(qn("w:drawing"))
    if drawing is None:
        return
    inline = drawing.find(qn("wp:inline"))
    if inline is None:
        return
    graphic = inline.find(qn("a:graphic"))
    if graphic is None:
        return

    px_emu = int(round(max(0.0, x_pt) * 12700.0))
    py_emu = int(round(max(0.0, y_pt) * 12700.0))
    cx = int(round(width_pt * 12700.0))
    cy = int(round(height_pt * 12700.0))
    behind_flag = "1" if behind_doc else "0"
    rel_height = "0" if behind_doc else str(251658240 + shape_id)
    anchor_xml = (
        f'<wp:anchor {nsdecls("wp", "a", "r")} '
        f'distT="0" distB="0" distL="0" distR="0" simplePos="0" '
        f'relativeHeight="{rel_height}" behindDoc="{behind_flag}" locked="0" layoutInCell="1" allowOverlap="1">'
        '<wp:simplePos x="0" y="0"/>'
        f'<wp:positionH relativeFrom="page"><wp:posOffset>{px_emu}</wp:posOffset></wp:positionH>'
        f'<wp:positionV relativeFrom="page"><wp:posOffset>{py_emu}</wp:posOffset></wp:positionV>'
        f'<wp:extent cx="{cx}" cy="{cy}"/>'
        '<wp:effectExtent l="0" t="0" r="0" b="0"/>'
        '<wp:wrapNone/>'
        f'<wp:docPr id="{9000 + shape_id}" name="{shape_name}_{shape_id}"/>'
        '<wp:cNvGraphicFramePr/>'
        "</wp:anchor>"
    )
    anchor_el = parse_xml(anchor_xml)
    anchor_el.append(graphic)
    drawing.remove(inline)
    drawing.append(anchor_el)


def _add_docx_layer1_background_anchor(
    docx_doc,
    bg_jpg_bytes: bytes,
    width_pt: float,
    height_pt: float,
    shape_id: int = 1,
) -> None:
    """Place Layer-1 ink-free background canvas full-bleed `(0, 0)` behind editable content."""
    _add_docx_positioned_picture_anchor(
        docx_doc,
        bg_jpg_bytes,
        0.0,
        0.0,
        width_pt,
        height_pt,
        behind_doc=True,
        shape_id=shape_id,
        shape_name="Layer1Canvas",
    )


def _analyze_pdf_pages_parallel(
    pdf_path: Path,
    total_pages: int,
    *,
    lang: str = "auto",
    dpi: int = 200,
    include_clean_bg: bool = False,
    layer_mode: str = "clean_real",
    ai_api_key: Optional[str] = None,
    ai_provider: Optional[str] = None,
    strict_local: bool = False,
    ai_mode: str = "docx",
    detect_borderless: bool = False,
    digital_layout_fallback: bool = False,
) -> list[PageBlueprint]:
    """
    Analyze all pages of `pdf_path` cleanly with bounded parallelism (`max_workers=2`)
    and multi-page AI fail-fast short-circuiting so circuit-tripped keys never stall pages 2..N.
    Each thread opens its own `fitz.Document` handle for strict thread safety.
    """
    if total_pages <= 0:
        return []

    low_mem = is_low_memory_runtime()
    if low_mem:
        try:
            fitz.TOOLS.set_low_memory(True)
        except Exception:
            pass
    eff_scan_dpi = min(dpi, 175) if low_mem else dpi

    def _run_on_page(page_obj: fitz.Page, p_idx: int, skip_ai_flag: bool) -> PageBlueprint:
        try:
            return analyze_page_blueprint(
                page_obj,
                p_idx,
                lang=lang,
                dpi=eff_scan_dpi,
                include_clean_bg=include_clean_bg,
                layer_mode=layer_mode,
                ai_api_key=ai_api_key,
                ai_provider=ai_provider,
                strict_local=strict_local,
                ai_mode=ai_mode,
                skip_ai=skip_ai_flag,
                detect_borderless=detect_borderless,
                digital_layout_fallback=digital_layout_fallback,
            )
        finally:
            try:
                fitz.TOOLS.store_shrink(100)
            except Exception:
                pass
            if low_mem:
                gc.collect()

    def _run_single(p_idx: int, skip_ai_flag: bool) -> PageBlueprint:
        sub_doc = fitz.open(str(pdf_path))
        try:
            return _run_on_page(sub_doc[p_idx], p_idx, skip_ai_flag)
        finally:
            sub_doc.close()

    # Run page 0 first so provider circuit breaker / credentials status settles before workers spawn
    ai_doc_deadline = time.monotonic() + (75.0 if low_mem else 110.0)
    shared_doc = fitz.open(str(pdf_path))
    try:
        bp0 = _run_on_page(shared_doc[0], 0, False)
        if total_pages == 1:
            return [bp0]

        skip_rest_ai = False
        if not strict_local:
            try:
                from ai_vision_refiner import is_provider_blocked, resolve_vision_credentials

                ep, ek = resolve_vision_credentials(
                    user_api_key=ai_api_key, provider=ai_provider, strict_local=strict_local
                )
                if not ep or not ek or is_provider_blocked(ep, ek):
                    skip_rest_ai = True
            except Exception:
                skip_rest_ai = True

        results: list[Optional[PageBlueprint]] = [None] * total_pages
        results[0] = bp0

        # When Vision AI is active cleanly, allow bounded concurrent IO threads even under 512MB RAM
        # (any heavy CPU OCR fallback remains strictly serialized by `_LOW_MEM_CPU_OCR_SEM`).
        if low_mem and (strict_local or skip_rest_ai):
            for idx in range(1, total_pages):
                ai_budget_exhausted = time.monotonic() >= ai_doc_deadline
                results[idx] = _run_on_page(shared_doc[idx], idx, skip_rest_ai or ai_budget_exhausted)
            return [bp for bp in results if bp is not None]
    finally:
        shared_doc.close()

    worker_cnt = min(3 if low_mem else 4, max(2, total_pages - 1))
    with ThreadPoolExecutor(max_workers=worker_cnt) as pool:
        fut_map = {
            pool.submit(_run_single, idx, skip_rest_ai or (time.monotonic() >= ai_doc_deadline)): idx
            for idx in range(1, total_pages)
        }
        for fut, idx in fut_map.items():
            results[idx] = fut.result()

    return [bp for bp in results if bp is not None]


def build_exact_docx_from_scans(
    pdf_path: Path,
    out_path: Path,
    lang: str = "auto",
    dpi: int = 200,
    layer_mode: str = "clean_real",
    ai_api_key: Optional[str] = None,
    ai_provider: Optional[str] = None,
    strict_local: bool = False,
    digital_layout_fallback: bool = False,
) -> Path:
    """
    Reconstruct every scanned/OCR'd page of `pdf_path` into a 3-layer editable `.docx`:
    - `layer_mode == "clean_real"` (default): Real editable Word document with optional
      native OOXML `<w:pgBorders>` when a certificate border is detected (no scan sheet underneath).
    - `layer_mode == "layered_replica"`: Layer-1 ink-free background canvas (`behindDoc="1"`),
      Layer-2 discrete cropped logos/photos/QRs/stamps, and Layer-3 merged tables & wrapped prose.
    """
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Inches, Pt

    eff_layer_mode = "layered_replica" if str(layer_mode or "").strip().lower() == "layered_replica" else "clean_real"
    doc_fitz = fitz.open(str(pdf_path))
    total_pages = len(doc_fitz)
    doc_fitz.close()
    docx_doc = Document()

    align_map = {
        "left": WD_ALIGN_PARAGRAPH.LEFT,
        "center": WD_ALIGN_PARAGRAPH.CENTER,
        "right": WD_ALIGN_PARAGRAPH.RIGHT,
        "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
    }
    floating_shape_seq = 100

    try:
        blueprints = _analyze_pdf_pages_parallel(
            pdf_path,
            total_pages,
            lang=lang,
            dpi=dpi,
            include_clean_bg=(eff_layer_mode == "layered_replica"),
            layer_mode=eff_layer_mode,
            ai_api_key=ai_api_key,
            ai_provider=ai_provider,
            strict_local=strict_local,
            ai_mode="docx",
            detect_borderless=False,
            digital_layout_fallback=digital_layout_fallback,
        )
        for p_idx, bp in enumerate(blueprints):
            max_elem_y1 = max(
                [ln.y1 for ln in bp.lines] + [a.y1 for a in bp.assets] + [t.y1 for t in bp.tables],
                default=0.0,
            )
            dense_single_page = bp.height_pt <= 900.0 and max_elem_y1 > bp.height_pt * 0.84 and len(bp.bands) >= 12
            font_scale = 0.87 if dense_single_page else 0.90

            # Configure section dimensions on page 0 (or add page break for subsequent pages)
            margin_in = 0.36 if dense_single_page else 0.38
            margin_tb_in = 0.25 if dense_single_page else 0.32
            margin_pt = margin_in * 72.0
            if p_idx == 0:
                sec = docx_doc.sections[0]
                sec.page_width = Pt(bp.width_pt)
                sec.page_height = Pt(bp.height_pt)
                sec.top_margin = Inches(margin_tb_in)
                sec.bottom_margin = Inches(margin_tb_in)
                sec.left_margin = Inches(margin_in)
                sec.right_margin = Inches(margin_in)
                if eff_layer_mode == "clean_real" and bp.page_border_rgb is not None:
                    _set_docx_page_border(sec, bp.page_border_rgb)
            else:
                docx_doc.add_page_break()

            # Layer 1: Ink-free decorative canvas behind editable elements (`layered_replica` mode)
            # Smart Auto Layer-1 Guard: Plain-paper table/spreadsheet pages (where tables cover >=22%
            # of page height and there is no decorative border or emblem) should NEVER attach a
            # floating background scan behind the editable Word table.
            table_h_cov = sum(max(0.0, t.y1 - t.y0) for t in bp.tables) / max(1.0, bp.height_pt)
            is_plain_table_page = table_h_cov >= 0.22 and bp.page_border_rgb is None and len(bp.assets) == 0
            if eff_layer_mode == "layered_replica" and bp.bg_clean_png is not None and not is_plain_table_page:
                _add_docx_layer1_background_anchor(
                    docx_doc, bp.bg_clean_png, bp.width_pt, bp.height_pt, shape_id=p_idx + 1
                )

            usable_w_pt = max(240.0, bp.width_pt - 2.0 * margin_pt)
            page_right_pt = bp.width_pt - margin_pt
            prev_band_y1: Optional[float] = None
            prev_was_paragraph = False
            gap_cap = 10.0 if dense_single_page else 16.0
            gap_slope = 0.30 if dense_single_page else 0.42
            spacer_thresh = 8.5 if dense_single_page else 6.0

            for band in bp.bands:
                band_gap_pt = 0.0
                if prev_band_y1 is not None:
                    raw_gap = max(0.0, band.y0 - prev_band_y1)
                    if raw_gap > 8.0:
                        band_gap_pt = min(gap_cap, (raw_gap - 5.0) * gap_slope)

                if band.kind == "table" and band.table is not None:
                    # Anchor side-by-side photos/signatures/QRs sitting beside this table at exact coordinates
                    right_side_x0s: list[float] = []
                    for fa in band.floating_assets:
                        floating_shape_seq += 1
                        fa_w = max(14.0, fa.x1 - fa.x0)
                        fa_h = max(12.0, fa.y1 - fa.y0)
                        _add_docx_positioned_picture_anchor(
                            docx_doc,
                            fa.png_bytes,
                            fa.x0,
                            fa.y0,
                            fa_w,
                            fa_h,
                            behind_doc=False,
                            shape_id=floating_shape_seq,
                            shape_name=f"SideAsset_{fa.kind}",
                        )
                        if fa.x0 >= band.table.x1 - 2.0:
                            right_side_x0s.append(fa.x0)

                    if not prev_was_paragraph and band_gap_pt > spacer_thresh:
                        sp = docx_doc.add_paragraph()
                        sp.paragraph_format.space_before = Pt(0)
                        sp.paragraph_format.space_after = Pt(0)
                        sp.paragraph_format.line_spacing = 1.0
                        sp_run = sp.add_run(" ")
                        sp_run.font.size = Pt(max(4.0, min(8.0 if dense_single_page else 11.0, band_gap_pt)))
                    tbl_meta = band.table
                    is_dense_tbl = tbl_meta.n_cols >= 8 or tbl_meta.n_rows >= 20
                    min_col_w_pt = 14.0 if is_dense_tbl else 16.0
                    raw_total_w = max(1.0, sum(tbl_meta.col_widths_pt))
                    target_tbl_w = usable_w_pt
                    if right_side_x0s:
                        # Keep Word table strictly left of right-hand side photo/signature assets
                        target_tbl_w = max(160.0, min(usable_w_pt, min(right_side_x0s) - margin_pt - 8.0))
                        scale_w = min(1.0, target_tbl_w / raw_total_w)
                    else:
                        scale_w = target_tbl_w / raw_total_w if raw_total_w > target_tbl_w * 0.85 else min(1.05, target_tbl_w / raw_total_w)
                    scaled_cols = [max(min_col_w_pt, cw * scale_w) for cw in tbl_meta.col_widths_pt]
                    # Adjust widest col gently so sum matches target table width cleanly
                    diff = target_tbl_w - sum(scaled_cols)
                    if (not right_side_x0s and abs(diff) > 1.0 or diff < -1.0) and scaled_cols:
                        widest_idx = int(np.argmax(scaled_cols))
                        scaled_cols[widest_idx] = max(min_col_w_pt, scaled_cols[widest_idx] + diff)

                    has_borderless_cells = any(not c.has_borders for c in tbl_meta.cells)
                    w_tbl = docx_doc.add_table(rows=tbl_meta.n_rows, cols=tbl_meta.n_cols)
                    _set_docx_table_borders_and_cols(
                        w_tbl,
                        scaled_cols,
                        bordered=tbl_meta.has_visible_borders and not has_borderless_cells,
                    )

                    # Apply row heights gently
                    row_h_scale = 0.84 if is_dense_tbl else 0.90
                    min_row_h_pt = 9.5 if is_dense_tbl else 11.0
                    for r_idx, row in enumerate(w_tbl.rows):
                        if r_idx < len(tbl_meta.row_heights_pt):
                            row.height = Pt(max(min_row_h_pt, tbl_meta.row_heights_pt[r_idx] * row_h_scale))

                    pad_lr = 24 if is_dense_tbl else 42
                    pad_tb = 14 if is_dense_tbl else 24
                    pad_lr_pt = (pad_lr / 20.0) * 2.0

                    flat_cells = w_tbl._cells
                    n_cols_tbl = tbl_meta.n_cols
                    for cell_meta in tbl_meta.cells:
                        tl_cell = flat_cells[cell_meta.r0 * n_cols_tbl + cell_meta.c0]
                        if cell_meta.r1 - 1 > cell_meta.r0 or cell_meta.c1 - 1 > cell_meta.c0:
                            br_cell = flat_cells[(cell_meta.r1 - 1) * n_cols_tbl + (cell_meta.c1 - 1)]
                            tl_cell.merge(br_cell)

                        _apply_docx_cell_style(
                            tl_cell,
                            bg_rgb=cell_meta.bg_rgb,
                            borders=cell_meta.has_borders,
                            pad_lr_dxa=pad_lr,
                            pad_tb_dxa=pad_tb,
                        )
                        p = tl_cell.paragraphs[0]
                        p.alignment = align_map.get(cell_meta.align, WD_ALIGN_PARAGRAPH.LEFT)
                        pf = p.paragraph_format
                        pf.space_before = Pt(0)
                        pf.space_after = Pt(0)
                        pf.line_spacing = 1.0 if is_dense_tbl else 1.05

                        cell_w_pt = sum(scaled_cols[cell_meta.c0 : min(len(scaled_cols), cell_meta.c1)])
                        avail_w_pt = max(10.0, cell_w_pt - pad_lr_pt - 2.0)
                        cell_h_pt = max(12.0, (cell_meta.y1 - cell_meta.y0) * 0.92)
                        cell_fs = max(6.0 if is_dense_tbl else 6.5, min(11.5, cell_meta.font_size_pt * 0.88))
                        if len(cell_meta.lines) <= 1 and cell_meta.text:
                            # Ensure single-line cell text fits on 1 line without unwanted wrapping
                            char_factor = 0.52 if cell_meta.is_bold else 0.47
                            fit_fs = avail_w_pt / max(1.0, len(cell_meta.text) * char_factor)
                            if fit_fs < cell_fs:
                                cell_fs = max(5.5 if is_dense_tbl else 6.0, round(fit_fs * 2.0) / 2.0)

                        used_first_p = False
                        for a_item in (cell_meta.assets or []):
                            ap = tl_cell.paragraphs[0] if not used_first_p else tl_cell.add_paragraph()
                            used_first_p = True
                            ap.alignment = WD_ALIGN_PARAGRAPH.CENTER
                            ap.paragraph_format.space_before = Pt(0)
                            ap.paragraph_format.space_after = Pt(1.0 if cell_meta.lines else 0.0)
                            ap.paragraph_format.line_spacing = 1.0
                            nat_w = max(10.0, (a_item.x1 - a_item.x0) * 0.94)
                            nat_h = max(8.0, (a_item.y1 - a_item.y0) * 0.94)
                            scale_a = min(1.0, avail_w_pt / nat_w, cell_h_pt / nat_h)
                            ap.add_run().add_picture(io.BytesIO(a_item.png_bytes), width=Pt(max(12.0, nat_w * scale_a)))

                        for line_str in (cell_meta.lines or ([cell_meta.text] if cell_meta.text else [])):
                            if not line_str:
                                continue
                            cp = tl_cell.paragraphs[0] if not used_first_p else tl_cell.add_paragraph()
                            used_first_p = True
                            cp.alignment = align_map.get(cell_meta.align, WD_ALIGN_PARAGRAPH.LEFT)
                            cp.paragraph_format.space_before = Pt(0)
                            cp.paragraph_format.space_after = Pt(0)
                            cp.paragraph_format.line_spacing = 1.0 if is_dense_tbl else 1.05
                            _add_bilingual_runs_docx(
                                cp, line_str, font_size_pt=cell_fs, bold=cell_meta.is_bold, color_rgb=cell_meta.text_rgb
                            )

                    prev_was_paragraph = False
                    prev_band_y1 = band.y1

                elif band.kind == "columns" and (band.zones or band.column_rows):
                    if not prev_was_paragraph and band_gap_pt > spacer_thresh:
                        sp = docx_doc.add_paragraph()
                        sp.paragraph_format.space_before = Pt(0)
                        sp.paragraph_format.space_after = Pt(0)
                        sp.paragraph_format.line_spacing = 1.0
                        sp_run = sp.add_run(" ")
                        sp_run.font.size = Pt(max(4.0, min(8.0 if dense_single_page else 11.0, band_gap_pt)))
                    # Single flat borderless layout table (NO nested tables -> Apple Pages & Word safe)
                    # Partition [margin_pt .. page_right_pt] by exact horizontal midpoints between zones
                    ref_zones = band.column_rows[0] if band.column_rows else band.zones
                    n_zones = len(ref_zones)
                    if n_zones == 1:
                        z_widths = [usable_w_pt]
                    else:
                        bounds = [margin_pt]
                        for z_i in range(n_zones - 1):
                            cur_z = ref_zones[z_i]
                            nxt_z = ref_zones[z_i + 1]
                            if cur_z.x1 > nxt_z.x0:
                                if nxt_z.assets and not nxt_z.lines:
                                    split_x = nxt_z.x0 - 4.0
                                elif cur_z.assets and not cur_z.lines:
                                    split_x = cur_z.x1 + 4.0
                                else:
                                    split_x = (cur_z.x1 + nxt_z.x0) * 0.5
                            else:
                                split_x = (cur_z.x1 + nxt_z.x0) * 0.5
                            min_split = bounds[-1] + 36.0
                            max_split = page_right_pt - 36.0 * (n_zones - 1 - z_i)
                            bounds.append(max(min_split, min(max_split, split_x)))
                        bounds.append(page_right_pt)
                        z_widths = [max(36.0, bounds[i + 1] - bounds[i]) for i in range(n_zones)]

                    rows_to_write = band.column_rows if band.column_rows else [band.zones]
                    col_tbl = docx_doc.add_table(rows=len(rows_to_write), cols=n_zones)
                    _set_docx_table_borders_and_cols(col_tbl, z_widths, bordered=False)
                    col_flat_cells = col_tbl._cells

                    for r_idx, row_zones in enumerate(rows_to_write):
                        for z_i, zone in enumerate(row_zones):
                            cell = col_flat_cells[r_idx * n_zones + z_i]
                            _apply_docx_cell_style(cell, bg_rgb=None, borders=False, pad_lr_dxa=30, pad_tb_dxa=20)
                            first_p = True
                            max_cell_img_w_pt = max(32.0, z_widths[z_i] - 8.0)

                            z_items: list[tuple[float, str, object]] = []
                            for a in zone.assets:
                                z_items.append((a.y0, "asset", a))
                            for ln in zone.lines:
                                z_items.append((ln.y0, "line", ln))
                            z_items.sort(key=lambda x: x[0])

                            for _, kind, obj in z_items:
                                p = cell.paragraphs[0] if first_p else cell.add_paragraph()
                                first_p = False
                                pf = p.paragraph_format
                                pf.space_before = Pt(0)
                                pf.space_after = Pt(1.5 if band.column_rows else (0.8 if dense_single_page else 1.5))
                                pf.line_spacing = 1.03 if dense_single_page else 1.06

                                if kind == "asset":
                                    asset: VisualAsset = obj  # type: ignore[assignment]
                                    p.alignment = align_map.get(zone.align, WD_ALIGN_PARAGRAPH.CENTER)
                                    draw_w_pt = min(max_cell_img_w_pt, max(20.0, (asset.x1 - asset.x0) * 0.94))
                                    aspect = (asset.y1 - asset.y0) / max(1.0, (asset.x1 - asset.x0))
                                    max_h_by_kind = {
                                        "signature": 72.0,
                                        "qr": 115.0,
                                        "logo": 120.0,
                                        "stamp": 130.0,
                                        "photo": 150.0,
                                    }.get(asset.kind, 220.0)
                                    if draw_w_pt * aspect > max_h_by_kind:
                                        draw_w_pt = min(draw_w_pt, max_h_by_kind / max(0.2, aspect))
                                    p.add_run().add_picture(io.BytesIO(asset.png_bytes), width=Pt(draw_w_pt))
                                else:
                                    ln: TextLine = obj  # type: ignore[assignment]
                                    p.alignment = align_map.get(ln.align if (n_zones == 1 or band.column_rows) else zone.align, WD_ALIGN_PARAGRAPH.LEFT)
                                    fs = max(7.0, min(16.0, ln.font_size_pt * font_scale))
                                    _add_bilingual_runs_docx(
                                        p, ln.text, font_size_pt=fs, bold=ln.is_bold, color_rgb=ln.color_rgb
                                    )

                    prev_was_paragraph = False
                    prev_band_y1 = band.y1

                elif band.kind == "paragraph" and band.lines:
                    prev_ln_y1: Optional[float] = None
                    for l_idx, ln in enumerate(band.lines):
                        p = docx_doc.add_paragraph()
                        p.alignment = align_map.get(ln.align, WD_ALIGN_PARAGRAPH.LEFT)
                        pf = p.paragraph_format
                        fs = max(7.0, min(18.0, ln.font_size_pt * font_scale))
                        if l_idx == 0:
                            pf.space_before = Pt(band_gap_pt)
                        elif prev_ln_y1 is not None:
                            ln_gap = max(0.0, ln.y0 - prev_ln_y1)
                            pf.space_before = (
                                Pt(min(9.0, (ln_gap - 3.0) * 0.45))
                                if ln_gap > max(5.5, fs * 0.55)
                                else Pt(0)
                            )
                        else:
                            pf.space_before = Pt(0)
                        pf.space_after = Pt(0.5 if dense_single_page else 1.0)
                        pf.line_spacing = 1.03 if dense_single_page else 1.06
                        if ln.align in ("left", "justify") and ln.x0 > bp.width_pt * 0.08:
                            indent_pt = min(usable_w_pt * 0.38, max(0.0, ln.x0 - margin_pt))
                            if indent_pt > 6.0:
                                pf.left_indent = Pt(indent_pt)
                        _add_bilingual_runs_docx(
                            p, ln.text, font_size_pt=fs, bold=ln.is_bold, color_rgb=ln.color_rgb
                        )
                        prev_ln_y1 = ln.y1
                    prev_was_paragraph = True
                    prev_band_y1 = band.y1

        docx_doc.save(str(out_path))
    finally:
        gc.collect()

    return out_path


# ---------------------------------------------------------------------------
# Builder 2: Exact Merged-Cell & Key-Value Excel XLSX Reconstructor
# ---------------------------------------------------------------------------


def _excel_typed_value(text: str):
    """Parse pure numeric values safely without corrupting leading-zero roll numbers or dates."""
    s = text.strip()
    if not s or "\n" in s:
        return s
    if _PURE_NUM_RE.fullmatch(s):
        try:
            if "." in s:
                return float(s)
            return int(s)
        except Exception:
            return s
    return s


def build_exact_xlsx_from_scans(
    pdf_path: Path,
    out_path: Path,
    lang: str = "auto",
    dpi: int = 200,
    ai_api_key: Optional[str] = None,
    ai_provider: Optional[str] = None,
    strict_local: bool = False,
    digital_layout_fallback: bool = False,
) -> tuple[Path, int]:
    """
    Reconstruct scanned/OCR'd PDF pages into an Excel workbook featuring:
    1. A structured `Document_Layout` sheet preserving page headers, key-value blocks,
       and exact merged tables (`ws.merge_cells(...)`).
    2. Dedicated `PageX_TableY` clean sheets for every detected merged table.
    Returns (out_path, total_tables_found).
    """
    import openpyxl
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    doc_fitz = fitz.open(str(pdf_path))
    total_pages = len(doc_fitz)
    doc_fitz.close()
    wb = openpyxl.Workbook()
    ws_main = wb.active
    ws_main.title = "Document_Layout"

    thin_side = Side(style="thin", color="4B5563")
    cell_border = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)

    total_tables = 0
    cursor_row = 1

    try:
        blueprints = _analyze_pdf_pages_parallel(
            pdf_path,
            total_pages,
            lang=lang,
            dpi=dpi,
            include_clean_bg=False,
            layer_mode="clean_real",
            ai_api_key=ai_api_key,
            ai_provider=ai_provider,
            strict_local=strict_local,
            ai_mode="xlsx",
            detect_borderless=True,
            digital_layout_fallback=digital_layout_fallback,
        )
        for p_idx, bp in enumerate(blueprints):
            if total_pages > 1:
                ws_main.cell(row=cursor_row, column=1, value=f"--- Page {p_idx + 1} ---").font = Font(bold=True, size=11)
                cursor_row += 1

            for band in bp.bands:
                if band.kind == "table" and band.table is not None:
                    tbl = band.table
                    total_tables += 1
                    start_r = cursor_row

                    # Write table directly onto Document_Layout with exact merged spans
                    for cell_meta in tbl.cells:
                        tl = ws_main.cell(
                            row=start_r + cell_meta.r0,
                            column=1 + cell_meta.c0,
                            value=_excel_typed_value(cell_meta.text),
                        )
                        txt_hex = f"{cell_meta.text_rgb[0]:02X}{cell_meta.text_rgb[1]:02X}{cell_meta.text_rgb[2]:02X}"
                        if cell_meta.bg_rgb is not None and (cell_meta.bg_rgb[0] + cell_meta.bg_rgb[1] + cell_meta.bg_rgb[2]) < 450:
                            txt_hex = "FFFFFF"
                        tl.font = Font(
                            name="Arial",
                            size=max(9, min(12, int(round(cell_meta.font_size_pt)))),
                            bold=cell_meta.is_bold,
                            color=txt_hex,
                        )
                        tl.alignment = Alignment(
                            horizontal=cell_meta.align,
                            vertical="center",
                            wrap_text=True,
                        )
                        if cell_meta.bg_rgb is not None:
                            bg_hex = f"{cell_meta.bg_rgb[0]:02X}{cell_meta.bg_rgb[1]:02X}{cell_meta.bg_rgb[2]:02X}"
                            fill = PatternFill(start_color=bg_hex, end_color=bg_hex, fill_type="solid")
                        elif cell_meta.is_header:
                            fill = PatternFill(start_color="F3F4F6", end_color="F3F4F6", fill_type="solid")
                        else:
                            fill = None

                        for rr in range(start_r + cell_meta.r0, start_r + cell_meta.r1):
                            for cc in range(1 + cell_meta.c0, 1 + cell_meta.c1):
                                c_obj = ws_main.cell(row=rr, column=cc)
                                c_obj.border = cell_border
                                if fill is not None:
                                    c_obj.fill = fill

                        if cell_meta.r1 - cell_meta.r0 > 1 or cell_meta.c1 - cell_meta.c0 > 1:
                            ws_main.merge_cells(
                                start_row=start_r + cell_meta.r0,
                                start_column=1 + cell_meta.c0,
                                end_row=start_r + cell_meta.r1 - 1,
                                end_column=1 + cell_meta.c1 - 1,
                            )

                    cursor_row += tbl.n_rows + 1

                    # Create clean standalone sheet for this table
                    t_sheet = wb.create_sheet(title=f"P{p_idx + 1}_Table{total_tables}"[:31])
                    for cell_meta in tbl.cells:
                        tl = t_sheet.cell(
                            row=1 + cell_meta.r0,
                            column=1 + cell_meta.c0,
                            value=_excel_typed_value(cell_meta.text),
                        )
                        txt_hex = f"{cell_meta.text_rgb[0]:02X}{cell_meta.text_rgb[1]:02X}{cell_meta.text_rgb[2]:02X}"
                        if cell_meta.bg_rgb is not None and (cell_meta.bg_rgb[0] + cell_meta.bg_rgb[1] + cell_meta.bg_rgb[2]) < 450:
                            txt_hex = "FFFFFF"
                        tl.font = Font(
                            name="Arial",
                            size=max(9, min(12, int(round(cell_meta.font_size_pt)))),
                            bold=cell_meta.is_bold,
                            color=txt_hex,
                        )
                        tl.alignment = Alignment(horizontal=cell_meta.align, vertical="center", wrap_text=True)
                        fill = None
                        if cell_meta.bg_rgb is not None:
                            bg_hex = f"{cell_meta.bg_rgb[0]:02X}{cell_meta.bg_rgb[1]:02X}{cell_meta.bg_rgb[2]:02X}"
                            fill = PatternFill(start_color=bg_hex, end_color=bg_hex, fill_type="solid")
                        elif cell_meta.is_header:
                            fill = PatternFill(start_color="F3F4F6", end_color="F3F4F6", fill_type="solid")
                        for rr in range(1 + cell_meta.r0, 1 + cell_meta.r1):
                            for cc in range(1 + cell_meta.c0, 1 + cell_meta.c1):
                                c_obj = t_sheet.cell(row=rr, column=cc)
                                c_obj.border = cell_border
                                if fill is not None:
                                    c_obj.fill = fill
                        if cell_meta.r1 - cell_meta.r0 > 1 or cell_meta.c1 - cell_meta.c0 > 1:
                            t_sheet.merge_cells(
                                start_row=1 + cell_meta.r0,
                                start_column=1 + cell_meta.c0,
                                end_row=1 + cell_meta.r1 - 1,
                                end_column=1 + cell_meta.c1 - 1,
                            )
                    _autosize_excel_sheet(t_sheet)

                elif band.kind == "columns" and band.zones:
                    text_zones = [z for z in band.zones if z.lines]
                    if not text_zones:
                        continue
                    max_lines = max(len(z.lines) for z in text_zones)
                    for r_off in range(max_lines):
                        for col_idx, zone in enumerate(text_zones):
                            if r_off < len(zone.lines):
                                ln = zone.lines[r_off]
                                c_obj = ws_main.cell(row=cursor_row + r_off, column=1 + col_idx, value=ln.text)
                                c_obj.font = Font(name="Arial", size=10, bold=ln.is_bold)
                                c_obj.alignment = Alignment(horizontal=zone.align, vertical="center", wrap_text=True)
                    cursor_row += max_lines + 1

                elif band.kind == "paragraph" and band.lines:
                    for ln in band.lines:
                        c_obj = ws_main.cell(row=cursor_row, column=1, value=ln.text)
                        c_obj.font = Font(
                            name="Arial",
                            size=max(9, min(14, int(round(ln.font_size_pt)))),
                            bold=ln.is_bold,
                        )
                        c_obj.alignment = Alignment(horizontal=ln.align, vertical="center", wrap_text=True)
                        cursor_row += 1
                    cursor_row += 1

        _autosize_excel_sheet(ws_main)
        wb.save(str(out_path))
    finally:
        gc.collect()

    return out_path, total_tables


def _autosize_excel_sheet(ws) -> None:
    """Compute comfortable Excel column widths & row heights without over-expanding merged headers."""
    from openpyxl.utils import get_column_letter

    col_max: dict[int, int] = {}
    for row in ws.iter_rows():
        max_lines_in_row = 1
        for cell in row:
            if cell.value is None:
                continue
            val = str(cell.value)
            lines = val.split("\n")
            max_lines_in_row = max(max_lines_in_row, len(lines))
            # Do not let wide merged header banners distort single narrow columns
            is_merged = any(
                cell.coordinate in m_rng and m_rng.min_col < m_rng.max_col
                for m_rng in ws.merged_cells.ranges
            )
            if not is_merged:
                longest = max((len(l) for l in lines), default=0)
                col_max[cell.column] = max(col_max.get(cell.column, 8), longest + 3)
        ws.row_dimensions[row[0].row].height = max(18, min(64, max_lines_in_row * 15))

    for col_idx, width in col_max.items():
        ws.column_dimensions[get_column_letter(col_idx)].width = max(8, min(42, width))

    # Configure landscape fit-to-1-page-wide printing so wide marksheets never clip columns
    ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True


def extract_tables_from_scan_json(
    pdf_path: Path,
    lang: str = "auto",
    dpi: int = 200,
    ai_api_key: Optional[str] = None,
    ai_provider: Optional[str] = None,
    strict_local: bool = False,
) -> list[list[list[str]]]:
    """Return reconstructed grid tables as 2D string matrices for JSON API (`/extract-tables`)."""
    doc_fitz = fitz.open(str(pdf_path))
    total_pages = len(doc_fitz)
    doc_fitz.close()
    out_tables: list[list[list[str]]] = []
    try:
        blueprints = _analyze_pdf_pages_parallel(
            pdf_path,
            total_pages,
            lang=lang,
            dpi=dpi,
            include_clean_bg=False,
            layer_mode="clean_real",
            ai_api_key=ai_api_key,
            ai_provider=ai_provider,
            strict_local=strict_local,
            ai_mode="xlsx",
            detect_borderless=True,
        )
        for bp in blueprints:
            for tbl in bp.tables:
                matrix = [["" for _ in range(tbl.n_cols)] for _ in range(tbl.n_rows)]
                for cell in tbl.cells:
                    matrix[cell.r0][cell.c0] = cell.text.replace("\n", " ").strip()
                out_tables.append(matrix)
    finally:
        gc.collect()
    return out_tables


# ---------------------------------------------------------------------------
# Builder 3: Structural Editable PowerPoint PPTX Reconstructor
# ---------------------------------------------------------------------------


def _set_pptx_cell_border(cell, hex_color: str = "374151", width_pt: float = 0.75) -> None:
    """Attach clean solid border edges to a python-pptx table cell."""
    from lxml import etree
    from pptx.oxml.ns import qn

    tcPr = cell._tc.get_or_add_tcPr()
    w_emu = str(int(round(width_pt * 12700)))
    for side in ("lnL", "lnR", "lnT", "lnB"):
        for old in tcPr.findall(qn(f"a:{side}")):
            tcPr.remove(old)
        ln = etree.SubElement(tcPr, qn(f"a:{side}"), w=w_emu, cap="flat", cmpd="sng", algn="ctr")
        solid = etree.SubElement(ln, qn("a:solidFill"))
        etree.SubElement(solid, qn("a:srgbClr"), val=hex_color)


def _add_bilingual_runs_pptx(
    p,
    text: str,
    font_size_pt: float,
    bold: bool = False,
    color_rgb: tuple[int, int, int] = (17, 24, 39),
) -> None:
    """Write bilingual English + Devanagari runs into a PowerPoint paragraph."""
    from pptx.dml.color import RGBColor
    from pptx.util import Pt

    rgb_obj = RGBColor(color_rgb[0], color_rgb[1], color_rgb[2])
    for seg, is_dev in _split_bilingual_runs(text):
        run = p.add_run()
        run.text = seg
        run.font.size = Pt(font_size_pt)
        run.font.bold = bold
        run.font.color.rgb = rgb_obj
        run.font.name = "Noto Sans Devanagari" if is_dev else "Arial"


def build_exact_pptx_from_scans(
    pdf_path: Path,
    out_path: Path,
    lang: str = "auto",
    dpi: int = 200,
    slide_mode: str = "structural",
    layer_mode: str = "clean_real",
    ai_api_key: Optional[str] = None,
    ai_provider: Optional[str] = None,
    strict_local: bool = False,
    digital_layout_fallback: bool = False,
) -> Path:
    """
    Reconstruct every scanned/OCR'd PDF page into a 3-layer editable PowerPoint `.pptx` deck:
    - Matches exact slide aspect ratio in inches so portrait documents are crisp 1:1.
    - Reconstructs native merged PPTX tables (`cell.merge(...)`), cropped logos/photos/
      QR codes/stamps, and aligned bilingual English+Hindi textboxes cleanly.
    - `clean_real` / `structural` mode: NO full-page screenshot covers the slide (adds a
      vector border rectangle when a certificate frame is detected).
    - `layered_replica` / `hybrid` mode: Layer-1 ink-free background canvas sits at bottom
      Z-order while editable visual assets, tables, and text sit cleanly above it.
    """
    from pptx import Presentation
    from pptx.dml.color import RGBColor
    from pptx.enum.shapes import MSO_SHAPE
    from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
    from pptx.util import Emu, Pt

    eff_layer_mode = "layered_replica" if (
        str(slide_mode or "").strip().lower() == "hybrid"
        or str(layer_mode or "").strip().lower() == "layered_replica"
    ) else "clean_real"
    effective_bg = (eff_layer_mode == "layered_replica")

    align_map = {
        "left": PP_ALIGN.LEFT,
        "center": PP_ALIGN.CENTER,
        "right": PP_ALIGN.RIGHT,
        "justify": getattr(PP_ALIGN, "JUSTIFY", PP_ALIGN.LEFT),
    }

    doc_fitz = fitz.open(str(pdf_path))
    total_pages = len(doc_fitz)
    doc_fitz.close()
    prs = Presentation()
    blank_layout = prs.slide_layouts[6]

    try:
        blueprints = _analyze_pdf_pages_parallel(
            pdf_path,
            total_pages,
            lang=lang,
            dpi=dpi,
            include_clean_bg=effective_bg,
            layer_mode=eff_layer_mode,
            ai_api_key=ai_api_key,
            ai_provider=ai_provider,
            strict_local=strict_local,
            ai_mode="pptx",
            detect_borderless=False,
            digital_layout_fallback=digital_layout_fallback,
        )
        for p_idx, bp in enumerate(blueprints):
            # Set slide geometry from page 0 (capped neatly in readable presentation inches)
            if p_idx == 0:
                prs.slide_width = Pt(bp.width_pt)
                prs.slide_height = Pt(bp.height_pt)

            slide = prs.slides.add_slide(blank_layout)

            # Layer 1: Ink-free decorative canvas in `layered_replica`/`hybrid`, or crisp vector border in `clean_real`
            if effective_bg and bp.bg_clean_png is not None:
                slide.shapes.add_picture(
                    io.BytesIO(bp.bg_clean_png), Pt(0), Pt(0), width=Pt(bp.width_pt), height=Pt(bp.height_pt)
                )
            elif not effective_bg and bp.page_border_rgb is not None:
                margin_b = 14.0
                frame = slide.shapes.add_shape(
                    MSO_SHAPE.RECTANGLE,
                    Pt(margin_b),
                    Pt(margin_b),
                    Pt(max(72.0, bp.width_pt - 2.0 * margin_b)),
                    Pt(max(72.0, bp.height_pt - 2.0 * margin_b)),
                )
                frame.fill.background()
                frame.line.color.rgb = RGBColor(*bp.page_border_rgb)
                frame.line.width = Pt(2.0)

            # 1. Exact Cropped Visual Assets (Crests, Passport Photos, QR, Stamps, Signatures)
            for asset in bp.assets:
                aw = max(12.0, asset.x1 - asset.x0)
                ah = max(12.0, asset.y1 - asset.y0)
                slide.shapes.add_picture(
                    io.BytesIO(asset.png_bytes), Pt(asset.x0), Pt(asset.y0), width=Pt(aw), height=Pt(ah)
                )

            # 2. Native Merged PowerPoint Tables at Exact Coordinates
            from pptx.oxml.ns import qn as _pptx_qn

            for tbl_meta in bp.tables:
                tw = max(48.0, tbl_meta.x1 - tbl_meta.x0)
                th = max(24.0, tbl_meta.y1 - tbl_meta.y0)
                shape = slide.shapes.add_table(
                    tbl_meta.n_rows, tbl_meta.n_cols, Pt(tbl_meta.x0), Pt(tbl_meta.y0), Pt(tw), Pt(th)
                )
                ppt_tbl = shape.table

                # Replace python-pptx default blue Medium Style 2 theme with clean unstyled Table Grid
                # so LibreOffice Impress & PowerPoint never override cell backgrounds or misalign merged rows.
                tbl_pr = ppt_tbl._tbl.tblPr
                if tbl_pr is not None:
                    tbl_pr.set("firstRow", "0")
                    tbl_pr.set("bandRow", "0")
                    style_el = tbl_pr.find(_pptx_qn("a:tableStyleId"))
                    if style_el is not None:
                        style_el.text = "{2D5ABB26-0587-4C30-8999-92F81FD0307C}"

                for rr in range(tbl_meta.n_rows):
                    for cc in range(tbl_meta.n_cols):
                        base_c = ppt_tbl.cell(rr, cc)
                        if effective_bg:
                            base_c.fill.background()
                        else:
                            base_c.fill.solid()
                            base_c.fill.fore_color.rgb = RGBColor(255, 255, 255)
                        _set_pptx_cell_border(base_c)

                # Enforce proportional columns and row heights
                sum_cw = max(1.0, sum(tbl_meta.col_widths_pt))
                for c_idx, cw in enumerate(tbl_meta.col_widths_pt):
                    ppt_tbl.columns[c_idx].width = Pt(max(8.0, (cw / sum_cw) * tw))
                sum_rh = max(1.0, sum(tbl_meta.row_heights_pt))
                for r_idx, rh in enumerate(tbl_meta.row_heights_pt):
                    ppt_tbl.rows[r_idx].height = Pt(max(10.0, (rh / sum_rh) * th))

                for cell_meta in tbl_meta.cells:
                    tl = ppt_tbl.cell(cell_meta.r0, cell_meta.c0)
                    if cell_meta.r1 - 1 > cell_meta.r0 or cell_meta.c1 - 1 > cell_meta.c0:
                        br = ppt_tbl.cell(cell_meta.r1 - 1, cell_meta.c1 - 1)
                        try:
                            tl.merge(br)
                        except Exception:
                            pass

                    tl.vertical_anchor = MSO_ANCHOR.MIDDLE
                    tl.margin_left = Emu(22000)
                    tl.margin_right = Emu(22000)
                    tl.margin_top = Emu(14000)
                    tl.margin_bottom = Emu(14000)

                    if cell_meta.bg_rgb is not None:
                        tl.fill.solid()
                        tl.fill.fore_color.rgb = RGBColor(*cell_meta.bg_rgb)
                    elif effective_bg:
                        tl.fill.background()
                    else:
                        tl.fill.solid()
                        tl.fill.fore_color.rgb = RGBColor(255, 255, 255)
                    _set_pptx_cell_border(tl)

                    tf = tl.text_frame
                    tf.word_wrap = True
                    cell_fs = max(5.5, min(11.0, cell_meta.font_size_pt * 0.84))
                    lines = cell_meta.lines or ([cell_meta.text] if cell_meta.text else [])
                    for l_i, line_str in enumerate(lines):
                        p = tf.paragraphs[0] if l_i == 0 else tf.add_paragraph()
                        p.alignment = align_map.get(cell_meta.align, PP_ALIGN.LEFT)
                        _add_bilingual_runs_pptx(
                            p, line_str, font_size_pt=cell_fs, bold=cell_meta.is_bold, color_rgb=cell_meta.text_rgb
                        )

            # 3. Exact Non-Table Bilingual Textboxes (Zero Padding to Prevent Overwrap)
            for ln in bp.lines:
                lw = max(24.0, min(bp.width_pt - max(0.0, ln.x0 - 2.0) - 12.0, (ln.x1 - ln.x0) + 12.0))
                lh = max(11.0, (ln.y1 - ln.y0) + 4.0)
                is_long_wrap = lw > bp.width_pt * 0.55 and len(ln.text) > 72
                if is_long_wrap:
                    lh = max(lh, (len(ln.text) / max(32.0, lw / 5.2)) * (ln.font_size_pt * 1.28))
                tb = slide.shapes.add_textbox(Pt(max(0.0, ln.x0 - 2.0)), Pt(max(0.0, ln.y0 - 1.5)), Pt(lw), Pt(lh))
                tf = tb.text_frame
                tf.word_wrap = is_long_wrap
                tf.margin_left = Emu(0)
                tf.margin_right = Emu(0)
                tf.margin_top = Emu(0)
                tf.margin_bottom = Emu(0)
                p = tf.paragraphs[0]
                p.alignment = align_map.get(ln.align, PP_ALIGN.LEFT)
                fs = max(6.0, min(20.0, ln.font_size_pt * 0.88))
                _add_bilingual_runs_pptx(p, ln.text, font_size_pt=fs, bold=ln.is_bold, color_rgb=ln.color_rgb)

        prs.save(str(out_path))
    finally:
        gc.collect()

    return out_path


# ---------------------------------------------------------------------------
# Layer-Wise Editor Extraction Helpers (Shared by /analyze/text-layout,
# /ocr/page-words, and /analyze/page-layers)
# ---------------------------------------------------------------------------


def extract_native_text_layout(pg: fitz.Page) -> dict[str, Any]:
    """Extract span-level and word-level typography metadata from a PDF page."""
    page_height = float(pg.rect.height)
    page_width = float(pg.rect.width)

    invisible_boxes = [
        fitz.Rect(t.get("bbox", (0, 0, 0, 0)))
        for t in pg.get_texttrace()
        if t.get("type", 0) == 3
    ]

    blocks_data = pg.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)
    spans_out: list[dict[str, Any]] = []
    for block in blocks_data.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = span.get("text", "").strip()
                if not text:
                    continue
                bbox = span.get("bbox", [0, 0, 0, 0])
                x0, y0, x1, y1 = bbox
                w = x1 - x0
                h = y1 - y0
                if w <= 0 or h <= 0:
                    continue

                font_name: str = span.get("font", "")
                font_size: float = round(span.get("size", 12), 2)
                span_rect = fitz.Rect(bbox)
                is_invisible_ocr = any(span_rect.intersects(ib) for ib in invisible_boxes)

                flags = span.get("flags", 0)
                is_bold = bool(flags & (1 << 4))
                is_italic = bool(flags & (1 << 1))
                is_mono = bool(flags & (1 << 3))
                fname_lower = font_name.lower()
                if not is_bold:
                    is_bold = any(
                        tok in fname_lower
                        for tok in ("bold", "heavy", "black", "semibold", "demibold", "medium", "-bd", "cmbx", "600", "700")
                    )
                if not is_italic:
                    is_italic = any(tok in fname_lower for tok in ("italic", "oblique", "slant"))

                raw_color = span.get("color", 0)
                if raw_color is None or raw_color < 0:
                    raw_color = 0
                r_comp = (raw_color >> 16) & 0xFF
                g_comp = (raw_color >> 8) & 0xFF
                b_comp = raw_color & 0xFF
                color_hex = f"#{r_comp:02x}{g_comp:02x}{b_comp:02x}"

                clean_font = font_name.split("+", 1)[-1] if "+" in font_name else font_name
                origin = span.get("origin", (x0, y1))
                spans_out.append({
                    "text": text,
                    "x": round(x0, 2),
                    "y": round(y0, 2),
                    "w": round(w, 2),
                    "h": round(h, 2),
                    "fontSize": font_size,
                    "fontName": clean_font,
                    "fontNameRaw": font_name,
                    "bold": is_bold,
                    "italic": is_italic,
                    "mono": is_mono,
                    "color": color_hex,
                    "baseline": round(origin[1], 2),
                    "isInvisibleOcr": is_invisible_ocr,
                })

    words_out: list[dict[str, Any]] = []
    for w_tuple in pg.get_text("words"):
        wx0, wy0, wx1, wy1, wtext, _blk_idx, _line_idx, _word_idx = w_tuple
        if not wtext.strip():
            continue
        w_rect = fitz.Rect(wx0, wy0, wx1, wy1)
        w_mid_y = (wy0 + wy1) * 0.5
        w_mid_x = (wx0 + wx1) * 0.5
        matched_s = None
        best_score = -1e9
        for s in spans_out:
            sx0, sy0 = s["x"], s["y"]
            sx1, sy1 = sx0 + s["w"], sy0 + s["h"]
            if sx1 < wx0 - 4 or sx0 > wx1 + 4 or sy1 < wy0 - 4 or sy0 > wy1 + 4:
                continue
            ov = fitz.Rect(sx0, sy0, sx1, sy1) & w_rect
            ov_area = ov.width * ov.height if not ov.is_empty else 0.0
            dy_dist = abs(((sy0 + sy1) * 0.5) - w_mid_y)
            dx_dist = 0.0 if sx0 <= w_mid_x <= sx1 else min(abs(w_mid_x - sx0), abs(w_mid_x - sx1))
            score = ov_area * 10.0 - dy_dist * 4.0 - dx_dist * 0.5
            if score > best_score:
                best_score = score
                matched_s = s
        words_out.append({
            "text": wtext,
            "x": round(wx0, 2),
            "y": round(wy0, 2),
            "w": round(wx1 - wx0, 2),
            "h": round(wy1 - wy0, 2),
            "fontSize": matched_s["fontSize"] if matched_s else 11.0,
            "fontName": matched_s["fontName"] if matched_s else "Helvetica",
            "fontNameRaw": matched_s["fontNameRaw"] if matched_s else "Helvetica",
            "bold": matched_s["bold"] if matched_s else False,
            "italic": matched_s["italic"] if matched_s else False,
            "color": matched_s["color"] if matched_s else "#000000",
            "baseline": matched_s.get("baseline", round(wy1, 2)) if matched_s else round(wy1, 2),
            "isInvisibleOcr": matched_s.get("isInvisibleOcr", False) if matched_s else False,
        })

    lines_out, paragraphs_out = build_lines_and_paragraphs(
        [w for w in words_out if not w.get("isInvisibleOcr")] or words_out
    )

    return {
        "pageWidth": round(page_width, 2),
        "pageHeight": round(page_height, 2),
        "spans": spans_out,
        "words": words_out,
        "lines": lines_out,
        "paragraphs": paragraphs_out,
    }


def _sample_fg_bg_hex(
    img_bgr: np.ndarray, ix0: int, iy0: int, ix1: int, iy1: int
) -> tuple[str, str]:
    """Sample dominant dark ink hex color and surrounding paper tint hex color."""
    ih, iw = img_bgr.shape[:2]
    bw_px = ix1 - ix0
    bh_px = iy1 - iy0
    fg_hex = "#000000"
    patch = img_bgr[iy0:iy1, ix0:ix1]
    if patch.size > 0:
        lum_patch = 0.114 * patch[:, :, 0] + 0.587 * patch[:, :, 1] + 0.299 * patch[:, :, 2]
        flat_lum = lum_patch.reshape(-1)
        flat_bgr = patch.reshape(-1, 3)
        k_dark = max(1, len(flat_lum) // 10)
        dark_idx = np.argpartition(flat_lum, k_dark - 1)[:k_dark]
        fg_bgr = np.median(flat_bgr[dark_idx], axis=0)
        fg_b, fg_g, fg_r = int(round(fg_bgr[0])), int(round(fg_bgr[1])), int(round(fg_bgr[2]))
        fg_hex = f"#{fg_r:02x}{fg_g:02x}{fg_b:02x}"

    bg_hex = "#ffffff"
    pad_px = max(3, int(round(bh_px * 0.28)))
    samples_bgr = []
    if ix0 - pad_px >= 0:
        left_strip = img_bgr[iy0:iy1, max(0, ix0 - pad_px):ix0]
        if left_strip.size > 0:
            samples_bgr.append(left_strip.reshape(-1, 3))
    if ix1 + pad_px <= iw:
        right_strip = img_bgr[iy0:iy1, ix1:min(iw, ix1 + pad_px)]
        if right_strip.size > 0:
            samples_bgr.append(right_strip.reshape(-1, 3))
    if not samples_bgr:
        rx0 = max(0, ix0 - pad_px)
        ry0 = max(0, iy0 - pad_px)
        rx1 = min(iw, ix1 + pad_px)
        ry1 = min(ih, iy1 + pad_px)
        ring_all = img_bgr[ry0:ry1, rx0:rx1]
        if ring_all.size > 0:
            samples_bgr.append(ring_all.reshape(-1, 3))

    if samples_bgr:
        ring_px = np.vstack(samples_bgr)
        lum_ring = 0.114 * ring_px[:, 0] + 0.587 * ring_px[:, 1] + 0.299 * ring_px[:, 2]
        bright_mask = lum_ring >= float(np.percentile(lum_ring, 65))
        bright_px = ring_px[bright_mask] if np.any(bright_mask) else ring_px
        bg_bgr = np.median(bright_px, axis=0)
        bg_b, bg_g, bg_r = int(round(bg_bgr[0])), int(round(bg_bgr[1])), int(round(bg_bgr[2]))
        lum_b = 0.299 * bg_r + 0.587 * bg_g + 0.114 * bg_b
        chroma_b = max(bg_r, bg_g, bg_b) - min(bg_r, bg_g, bg_b)
        if lum_b >= 242 or (chroma_b <= 22 and lum_b >= 195):
            bg_hex = "#ffffff"
        else:
            bg_hex = f"#{bg_r:02x}{bg_g:02x}{bg_b:02x}"

    return fg_hex, bg_hex


def ocr_words_to_editor_blocks(
    img_bgr: np.ndarray,
    ocr_words: list[OCRWord],
    page_w: float,
    page_h: float,
    suppress_boxes_px: Optional[list[tuple[int, int, int, int]]] = None,
) -> list[dict[str, Any]]:
    """
    Convert pixel-space OCRWord objects into point-space editor word dicts with
    row-calibrated baseline, font size, serif/sans family, bold weight, and colors.
    """
    ih, iw = img_bgr.shape[:2]
    sx = page_w / float(max(1, iw))
    sy = page_h / float(max(1, ih))
    suppress_boxes = suppress_boxes_px or []

    filtered_words: list[tuple[OCRWord, str, int, int, int, int]] = []
    raw_boxes_px: list[tuple[float, float, float, float, str]] = []
    for w in ocr_words:
        txt = (w.text or "").strip()
        if not txt:
            continue
        wcx = (w.x0 + w.x1) * 0.5
        wcy = (w.y0 + w.y1) * 0.5
        if suppress_boxes and any(_point_in_box(wcx, wcy, sb, pad=2.0) for sb in suppress_boxes):
            continue
        ix0 = max(0, min(iw - 1, int(round(w.x0))))
        iy0 = max(0, min(ih - 1, int(round(w.y0))))
        ix1 = max(ix0 + 1, min(iw, int(round(w.x1))))
        iy1 = max(iy0 + 1, min(ih, int(round(w.y1))))
        if (ix1 - ix0) < 2 or (iy1 - iy0) < 2:
            continue
        filtered_words.append((w, txt, ix0, iy0, ix1, iy1))
        raw_boxes_px.append((float(w.x0), float(w.y0), float(w.x1), float(w.y1), txt))

    row_profiles: list[dict[str, Any]] = []
    if raw_boxes_px:
        try:
            from scan_blender import profile_scanned_word_rows
            row_profiles = profile_scanned_word_rows(img_bgr, raw_boxes_px)
        except Exception:
            row_profiles = []

    words_out: list[dict[str, Any]] = []
    for idx, (w, txt, ix0, iy0, ix1, iy1) in enumerate(filtered_words):
        rp = row_profiles[idx] if idx < len(row_profiles) else {}
        tb = rp.get("tight_box_px")
        bx0_px = float(tb[0]) if tb else float(w.x0)
        by0_px = float(tb[1]) if tb else float(w.y0)
        bx1_px = float(tb[2]) if tb else float(w.x1)
        by1_px = float(tb[3]) if tb else float(w.y1)

        c_x0 = max(0, min(iw - 1, int(round(bx0_px))))
        c_y0 = max(0, min(ih - 1, int(round(by0_px))))
        c_x1 = max(c_x0 + 1, min(iw, int(round(bx1_px))))
        c_y1 = max(c_y0 + 1, min(ih, int(round(by1_px))))
        fg_hex, bg_hex = _sample_fg_bg_hex(img_bgr, c_x0, c_y0, c_x1, c_y1)

        x_pt = round(bx0_px * sx, 2)
        y_pt = round(by0_px * sy, 2)
        w_pt = round(max(2.0, (bx1_px - bx0_px) * sx), 2)
        h_pt = round(max(3.0, (by1_px - by0_px) * sy), 2)

        has_hindi_txt = bool(re.search(r"[\u0900-\u097F]", txt))
        row_is_serif = bool(rp.get("is_serif")) and not has_hindi_txt
        row_bold = bool(rp.get("auto_bold"))
        vis_h_px = float(rp.get("visual_h_px") or 0.0)
        meas_base_px = rp.get("baseline_px")
        word_ink_h_pt = float(rp.get("word_ink_h_px") or 0.0) * sy
        ref_h_pt = word_ink_h_pt if word_ink_h_pt >= 3.0 else h_pt

        has_descender = any(c in "gjpqy" for c in txt) or any(c in "\u0941\u0942\u0943" for c in txt)
        has_upper_or_asc = any(c.isupper() or c in "bdfhklt0123456789()[]/" for c in txt)
        has_dev_upper = ("\u0930\u094D" in txt) or any(
            c in "\u093F\u0940\u0947\u0948\u094B\u094C\u0902\u0901\u0945\u0949" for c in txt
        )

        if has_hindi_txt:
            em_divisor = 1.18 if (has_descender and has_dev_upper) else (0.95 if (has_descender or has_dev_upper) else 0.78)
            word_em = ref_h_pt / em_divisor
            min_em = max(5.0, ref_h_pt * 0.65)
            max_em = max(min_em + 2.0, ref_h_pt * 1.45)
        elif has_upper_or_asc and has_descender:
            word_em = ref_h_pt / 0.91
            min_em = max(5.0, ref_h_pt * 0.78)
            max_em = max(min_em + 2.0, ref_h_pt * 1.38)
        elif has_upper_or_asc:
            cap_ratio = 0.662 if row_is_serif else 0.716
            word_em = ref_h_pt / cap_ratio
            min_em = max(5.0, ref_h_pt * 0.92)
            max_em = max(min_em + 2.0, ref_h_pt * 1.68)
        else:
            # Lowercase x-height word only (no caps/ascenders/descenders)
            word_em = ref_h_pt / 0.52
            min_em = max(5.0, ref_h_pt * 1.05)
            max_em = max(min_em + 2.0, ref_h_pt * 2.15)

        if vis_h_px >= 6.0 and not has_hindi_txt:
            cap_ratio = 0.662 if row_is_serif else 0.716
            row_em = (vis_h_px * sy) / cap_ratio
            # Only adopt row-calibrated size when compatible with this word's physical ink height
            if min_em * 0.85 <= row_em <= max_em * 1.12:
                cand_em = row_em
            else:
                cand_em = word_em
        else:
            cand_em = word_em

        font_sz = round(max(5.0, min(160.0, max(min_em, min(max_em, cand_em)))), 1)

        # Width-fit calibration: solve em-size so the word's real advance width (Helvetica/Times metrics)
        # equals the measured ink width. Immune to ascender/descender/x-height ink-height ambiguity,
        # which is what made clicked words appear enlarged.
        scan_fit = False
        if not has_hindi_txt and len(txt) >= 3 and w_pt >= 8.0:
            fit_em = _fit_em_from_width(txt, w_pt, row_is_serif, row_bold)
            if fit_em is not None:
                lo_fit = max(5.0, min_em * 0.80)
                hi_fit = max(lo_fit + 1.0, max_em * 1.10)
                if lo_fit <= fit_em <= hi_fit:
                    font_sz = round(max(5.0, min(160.0, fit_em)), 1)
                    scan_fit = True
                else:
                    font_sz = round(max(lo_fit, min(hi_fit, fit_em)), 1)
        if not scan_fit and len(txt) >= 5 and font_sz > 13.0:
            char_w_cap = max(8.5, (w_pt / float(len(txt))) * 2.35)
            if font_sz > char_w_cap * 1.25:
                font_sz = round(char_w_cap, 1)

        if meas_base_px is not None:
            raw_base = float(meas_base_px) * sy
            # Clamp baseline strictly within/at the bottom of this word's box so text never jumps rows
            min_b = y_pt + h_pt * 0.58
            max_b = y_pt + h_pt * (0.96 if has_descender else 1.04)
            if min_b <= raw_base <= max_b + max(2.0, h_pt * 0.12):
                base_pt = round(max(min_b, min(max_b, raw_base)), 2)
            else:
                base_frac = 0.78 if has_descender else 0.94
                base_pt = round(y_pt + h_pt * base_frac, 2)
        else:
            base_frac = 0.78 if has_descender else 0.94
            base_pt = round(y_pt + h_pt * base_frac, 2)

        words_out.append({
            "text": txt,
            "x": x_pt,
            "y": y_pt,
            "w": w_pt,
            "h": h_pt,
            "fontSize": font_sz,
            "scanFit": scan_fit,
            "baseline": base_pt,
            "fontName": "Times-Roman" if row_is_serif else "Helvetica",
            "bold": row_bold,
            "italic": False,
            "fgColor": fg_hex,
            "bgColor": bg_hex,
            "conf": round(float(w.conf), 3),
        })

    # Short words (`of`, `to`, `a`) cannot be width-fitted reliably: adopt the median fitted size of
    # the same text row so every word on a row shares one exact typography size.
    fitted = [w for w in words_out if w.get("scanFit")]
    if fitted:
        for w in words_out:
            if w.get("scanFit"):
                continue
            mid = float(w["y"]) + float(w["h"]) * 0.5
            peers = [
                float(f["fontSize"]) for f in fitted
                if abs((float(f["y"]) + float(f["h"]) * 0.5) - mid) <= max(4.0, float(f["h"]) * 0.45)
                and abs(float(f["x"]) - float(w["x"])) <= 400.0
            ]
            if len(peers) >= 1 and not re.search(r"[\u0900-\u097F]", str(w["text"])):
                med = float(np.median(peers))
                if 0.55 * float(w["fontSize"]) <= med <= 1.8 * float(w["fontSize"]) or float(w["fontSize"]) > med:
                    w["fontSize"] = round(med, 1)
    return words_out


_FIT_FONT_CACHE: dict[str, Any] = {}


def _fit_em_from_width(text: str, width_pt: float, serif: bool, bold: bool) -> Optional[float]:
    """Return the em-size (pt) at which `text` set in Helvetica/Times has advance width == `width_pt`."""
    try:
        name = ("tibo" if bold else "tiro") if serif else ("hebo" if bold else "helv")
        font = _FIT_FONT_CACHE.get(name)
        if font is None:
            font = fitz.Font(name)
            _FIT_FONT_CACHE[name] = font
        unit = float(font.text_length(text, fontsize=1.0))
        if unit <= 0.05:
            return None
        return float(width_pt) / unit
    except Exception:
        return None


def _weighted_median(vals: list[float], weights: list[float]) -> float:
    """Compute weighted median so single outlier boxes never blow up line/paragraph metrics."""
    if not vals:
        return 0.0
    pairs = sorted(zip(vals, weights), key=lambda kv: kv[0])
    total = sum(max(1.0, w) for _, w in pairs)
    acc = 0.0
    for v, w in pairs:
        acc += max(1.0, w)
        if acc >= total * 0.5:
            return float(v)
    return float(pairs[-1][0])


def build_lines_and_paragraphs(
    words: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Group word blocks into exact X/Y-aligned visual lines and multi-line paragraphs
    with outlier-immune weighted-median fontSize, first-line baseline, and lineHeightRatio.
    """
    if not words:
        return [], []

    clean_words = [w for w in words if str(w.get("text") or "").strip()]
    if not clean_words:
        return [], []

    def _w_base(w: dict[str, Any]) -> float:
        b = w.get("baseline")
        if isinstance(b, (int, float)) and b > 0:
            return float(b)
        return float(w["y"]) + float(w["h"]) * 0.85

    sorted_w = sorted(clean_words, key=lambda w: (_w_base(w), float(w["x"])))
    line_groups: list[list[dict[str, Any]]] = []

    for w in sorted_w:
        wx0, wy0 = float(w["x"]), float(w["y"])
        ww, wh = max(1.0, float(w["w"])), max(2.0, float(w["h"]))
        wb = _w_base(w)
        placed = False
        # Try placing on existing visual row closest in Y & adjacent in X
        for grp in reversed(line_groups):
            last = grp[-1]
            row_base = float(np.median([_w_base(g) for g in grp]))
            row_h = max(2.0, float(np.median([float(g["h"]) for g in grp])))
            same_row = (
                abs(wb - row_base) <= max(2.8, min(wh, row_h) * 0.48)
                or abs((wy0 + wh * 0.5) - (float(last["y"]) + float(last["h"]) * 0.5)) <= min(wh, row_h) * 0.42
            )
            if not same_row:
                continue
            h_compat = min(wh, row_h) / max(wh, row_h) >= 0.50
            if not h_compat:
                continue
            prev_right = float(last["x"]) + float(last["w"])
            h_gap = wx0 - prev_right
            # Keep distant table columns separate
            if -max(3.0, row_h * 0.35) <= h_gap <= max(10.0, row_h * 1.45):
                grp.append(w)
                placed = True
                break
        if not placed:
            line_groups.append([w])

    # Sort each line strictly left-to-right and compute calibrated properties
    lines_out: list[dict[str, Any]] = []
    for grp in line_groups:
        grp_s = sorted(grp, key=lambda g: float(g["x"]))
        lx0 = min(float(g["x"]) for g in grp_s)
        ly0 = min(float(g["y"]) for g in grp_s)
        lx1 = max(float(g["x"]) + float(g["w"]) for g in grp_s)
        ly1 = max(float(g["y"]) + float(g["h"]) for g in grp_s)

        parts: list[str] = []
        for idx_g, g in enumerate(grp_s):
            t_g = str(g["text"]).strip()
            if idx_g == 0:
                parts.append(t_g)
            else:
                prev_r = float(grp_s[idx_g - 1]["x"]) + float(grp_s[idx_g - 1]["w"])
                gap_g = float(g["x"]) - prev_r
                parts.append((" " if gap_g > 0.4 else "") + t_g)
        line_text = " ".join("".join(parts).split())

        weights = [max(1.0, float(len(str(g["text"]).strip()))) for g in grp_s]
        fs_line = round(_weighted_median([float(g["fontSize"]) for g in grp_s], weights), 1)
        base_line = round(_weighted_median([_w_base(g) for g in grp_s], weights), 2)

        total_chars = sum(weights)
        bold_chars = sum(wt for g, wt in zip(grp_s, weights) if g.get("bold"))
        italic_chars = sum(wt for g, wt in zip(grp_s, weights) if g.get("italic"))

        # Dominant font / color weighted by character count
        font_votes: dict[str, float] = {}
        fg_votes: dict[str, float] = {}
        bg_votes: dict[str, float] = {}
        for g, wt in zip(grp_s, weights):
            fn = str(g.get("fontName") or "Helvetica")
            fc = str(g.get("fgColor") or g.get("color") or "#000000")
            bc = str(g.get("bgColor") or "#ffffff")
            font_votes[fn] = font_votes.get(fn, 0.0) + wt
            fg_votes[fc] = fg_votes.get(fc, 0.0) + wt
            bg_votes[bc] = bg_votes.get(bc, 0.0) + wt

        dom_font = max(font_votes.items(), key=lambda kv: kv[1])[0]
        dom_fg = max(fg_votes.items(), key=lambda kv: kv[1])[0]
        dom_bg = max(bg_votes.items(), key=lambda kv: kv[1])[0]

        lines_out.append({
            "text": line_text,
            "x": round(lx0, 2),
            "y": round(ly0, 2),
            "w": round(max(2.0, lx1 - lx0), 2),
            "h": round(max(3.0, ly1 - ly0), 2),
            "fontSize": fs_line,
            "scanFit": any(bool(g.get("scanFit")) for g in grp_s),
            "baseline": base_line,
            "fontName": dom_font,
            "bold": (bold_chars / max(1.0, total_chars)) >= 0.55,
            "italic": (italic_chars / max(1.0, total_chars)) >= 0.55,
            "fgColor": dom_fg,
            "bgColor": dom_bg,
            "isInvisibleOcr": all(bool(g.get("isInvisibleOcr")) for g in grp_s),
        })

    # Group aligned consecutive lines into multi-line paragraphs preserving `\n` and exact spacing
    lines_sorted = sorted(lines_out, key=lambda l: (float(l["y"]), float(l["x"])))
    para_groups: list[list[dict[str, Any]]] = []
    for ln in lines_sorted:
        lx, ly, lw, lh = float(ln["x"]), float(ln["y"]), float(ln["w"]), float(ln["h"])
        lfs = float(ln["fontSize"])
        placed = False
        best_p: Optional[list[dict[str, Any]]] = None
        best_dy = 1e9
        for p_grp in para_groups:
            prev_ln = p_grp[-1]
            px, py, pw, ph = float(prev_ln["x"]), float(prev_ln["y"]), float(prev_ln["w"]), float(prev_ln["h"])
            pfs = float(prev_ln["fontSize"])
            if min(lfs, pfs) / max(lfs, pfs, 1.0) < 0.78:
                continue
            v_gap = ly - (py + ph)
            ref_h = max(lh, ph, lfs)
            if v_gap < -ref_h * 0.22 or v_gap > ref_h * 0.95:
                continue
            first_x = min(float(pl["x"]) for pl in p_grp)
            para_cx = (min(float(pl["x"]) for pl in p_grp) + max(float(pl["x"]) + float(pl["w"]) for pl in p_grp)) * 0.5
            line_cx = lx + lw * 0.5
            ov_x = max(0.0, min(lx + lw, px + pw) - max(lx, px))
            min_w = max(1.0, min(lw, pw))
            left_aligned = abs(lx - first_x) <= max(12.0, ref_h * 1.05)
            center_aligned = abs(line_cx - para_cx) <= max(8.0, ref_h * 0.65) and (ov_x / min_w) >= 0.45
            right_aligned = abs((lx + lw) - (px + pw)) <= max(12.0, ref_h * 1.05) and (ov_x / min_w) >= 0.45
            if (left_aligned or center_aligned or right_aligned) and v_gap < best_dy:
                best_dy = v_gap
                best_p = p_grp
        if best_p is not None:
            best_p.append(ln)
        else:
            para_groups.append([ln])

    paragraphs_out: list[dict[str, Any]] = []
    for p_grp in para_groups:
        px0 = min(float(l["x"]) for l in p_grp)
        py0 = min(float(l["y"]) for l in p_grp)
        px1 = max(float(l["x"]) + float(l["w"]) for l in p_grp)
        py1 = max(float(l["y"]) + float(l["h"]) for l in p_grp)

        weights = [max(1.0, float(len(str(l["text"]).strip()))) for l in p_grp]
        fs_para = round(_weighted_median([float(l["fontSize"]) for l in p_grp], weights), 1)
        first_base = round(float(p_grp[0]["baseline"]), 2)

        if len(p_grp) >= 2:
            steps = [
                float(p_grp[k]["baseline"]) - float(p_grp[k - 1]["baseline"])
                for k in range(1, len(p_grp))
                if float(p_grp[k]["baseline"]) > float(p_grp[k - 1]["baseline"]) + 2.0
            ]
            if steps and fs_para > 1.0:
                lh_ratio = round(max(1.02, min(1.65, float(np.median(steps)) / fs_para)), 3)
            else:
                lh_ratio = 1.20
        else:
            lh_ratio = 1.15

        total_chars = sum(weights)
        bold_chars = sum(wt for l, wt in zip(p_grp, weights) if l.get("bold"))
        italic_chars = sum(wt for l, wt in zip(p_grp, weights) if l.get("italic"))

        font_votes: dict[str, float] = {}
        fg_votes: dict[str, float] = {}
        bg_votes: dict[str, float] = {}
        for l, wt in zip(p_grp, weights):
            fn = str(l.get("fontName") or "Helvetica")
            fc = str(l.get("fgColor") or "#000000")
            bc = str(l.get("bgColor") or "#ffffff")
            font_votes[fn] = font_votes.get(fn, 0.0) + wt
            fg_votes[fc] = fg_votes.get(fc, 0.0) + wt
            bg_votes[bc] = bg_votes.get(bc, 0.0) + wt

        paragraphs_out.append({
            "text": "\n".join(str(l["text"]) for l in p_grp),
            "x": round(px0, 2),
            "y": round(py0, 2),
            "w": round(max(2.0, px1 - px0), 2),
            "h": round(max(3.0, py1 - py0), 2),
            "fontSize": fs_para,
            "scanFit": any(bool(l.get("scanFit")) for l in p_grp),
            "baseline": first_base,
            "lineHeightRatio": lh_ratio,
            "lineCount": len(p_grp),
            "fontName": max(font_votes.items(), key=lambda kv: kv[1])[0],
            "bold": (bold_chars / max(1.0, total_chars)) >= 0.55,
            "italic": (italic_chars / max(1.0, total_chars)) >= 0.55,
            "fgColor": max(fg_votes.items(), key=lambda kv: kv[1])[0],
            "bgColor": max(bg_votes.items(), key=lambda kv: kv[1])[0],
        })

    return lines_out, paragraphs_out


def _detect_blank_form_fields(
    img_bgr: np.ndarray,
    word_boxes_px: list[tuple[float, float, float, float, str]],
    px_to_pt: float,
    page_w_pt: float,
    page_h_pt: float,
    table_boxes_px: list[tuple[int, int, int, int]],
) -> list[dict[str, Any]]:
    """Detect empty fill-in underlines and small square checkboxes on forms cleanly."""
    ih, iw = img_bgr.shape[:2]
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    bw = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 19, 10
    )

    inv_scale = 1.0 / max(px_to_pt, 1e-4)
    min_line_px = max(24, int(round(36.0 * inv_scale)))
    hk = cv2.getStructuringElement(cv2.MORPH_RECT, (min_line_px, 1))
    horiz = cv2.morphologyEx(bw, cv2.MORPH_OPEN, hk)
    num_labels, _, stats, _ = cv2.connectedComponentsWithStats(horiz, connectivity=8)

    fields: list[dict[str, Any]] = []
    band_h_px = max(8, int(round(13.0 * inv_scale)))
    max_stroke_px = max(4, int(round(4.0 * inv_scale)))

    for lbl in range(1, num_labels):
        lx = int(stats[lbl, cv2.CC_STAT_LEFT])
        ly = int(stats[lbl, cv2.CC_STAT_TOP])
        lw = int(stats[lbl, cv2.CC_STAT_WIDTH])
        lh = int(stats[lbl, cv2.CC_STAT_HEIGHT])
        if lh > max_stroke_px or lw < min_line_px or lw > int(iw * 0.72):
            continue
        if ly < ih * 0.04 or ly > ih * 0.96:
            continue

        lcx = lx + lw * 0.5
        if any(_point_in_box(lcx, float(ly), tb, pad=4.0) for tb in table_boxes_px):
            continue

        by0 = max(0, ly - band_h_px)
        by1 = max(by0 + 2, ly - 1)
        band_gray = gray[by0:by1, lx + 2:max(lx + 3, lx + lw - 2)]
        if band_gray.size == 0:
            continue
        ink_ratio = float(np.mean(band_gray < 170))
        if ink_ratio > 0.055:
            continue

        has_word = any(
            wx1 > lx + 2 and wx0 < lx + lw - 2 and wy1 > by0 and wy0 < ly
            for wx0, wy0, wx1, wy1, _ in word_boxes_px
        )
        if has_word:
            continue

        # Look for nearest label slightly to the left on the same baseline row
        label_tokens: list[tuple[float, str]] = []
        search_left = max(0.0, float(lx) - 140.0 * inv_scale)
        for wx0, wy0, wx1, wy1, wtxt in word_boxes_px:
            wcy = (wy0 + wy1) * 0.5
            if search_left <= wx1 <= lx + 6.0 and (by0 - 4) <= wcy <= (ly + 6):
                label_tokens.append((wx0, wtxt))
        label_tokens.sort(key=lambda t: t[0])
        label_hint = " ".join(t[1] for t in label_tokens[-3:]).strip().rstrip(":-.")

        fx = round(lx * px_to_pt, 2)
        fy = round(max(0.0, (ly * px_to_pt) - 14.0), 2)
        fw = round(min(page_w_pt - fx, lw * px_to_pt), 2)
        fh = round(min(page_h_pt - fy, 15.0), 2)
        fields.append({
            "x": fx,
            "y": fy,
            "w": fw,
            "h": fh,
            "kind": "line",
            "labelHint": label_hint[:40],
        })
        if len(fields) >= 35:
            break

    # Detect empty square checkboxes
    min_cb = max(8, int(round(9.0 * inv_scale)))
    max_cb = max(min_cb + 6, int(round(22.0 * inv_scale)))
    contours, _ = cv2.findContours(bw, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    for cnt in contours:
        bx, by, bw_c, bh_c = cv2.boundingRect(cnt)
        if not (min_cb <= bw_c <= max_cb and min_cb <= bh_c <= max_cb):
            continue
        aspect = bw_c / float(max(1, bh_c))
        if not (0.78 <= aspect <= 1.28):
            continue
        cx, cy = bx + bw_c * 0.5, by + bh_c * 0.5
        if any(_point_in_box(cx, cy, tb, pad=2.0) for tb in table_boxes_px):
            continue
        ins_x0 = bx + max(2, bw_c // 4)
        ins_y0 = by + max(2, bh_c // 4)
        ins_x1 = max(ins_x0 + 1, bx + bw_c - max(2, bw_c // 4))
        ins_y1 = max(ins_y0 + 1, by + bh_c - max(2, bh_c // 4))
        interior = gray[ins_y0:ins_y1, ins_x0:ins_x1]
        if interior.size == 0 or float(np.mean(interior > 190)) < 0.86:
            continue
        fields.append({
            "x": round(bx * px_to_pt, 2),
            "y": round(by * px_to_pt, 2),
            "w": round(bw_c * px_to_pt, 2),
            "h": round(bh_c * px_to_pt, 2),
            "kind": "checkbox",
            "labelHint": "Check",
        })
        if len(fields) >= 48:
            break

    return fields


def _encode_bgr_thumbnail_data_url(bgr_or_bytes: Any, max_dim: int = 440) -> str:
    """Encode a BGR numpy array or raw encoded image bytes to a bounded base64 data URL."""
    try:
        if isinstance(bgr_or_bytes, (bytes, bytearray)):
            pil_img = Image.open(io.BytesIO(bgr_or_bytes))
            has_alpha = pil_img.mode in ("RGBA", "LA", "P") and "transparency" in pil_img.info or pil_img.mode == "RGBA"
            if max(pil_img.width, pil_img.height) > max_dim:
                pil_img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            if has_alpha:
                pil_img.convert("RGBA").save(buf, format="PNG")
                return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
            pil_img.convert("RGB").save(buf, format="JPEG", quality=88)
            return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

        # Assume bytes already PNG or ndarray BGR
        arr = np.asarray(bgr_or_bytes)
        if arr.ndim == 3:
            rgb = cv2.cvtColor(arr, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(rgb)
            if max(pil_img.width, pil_img.height) > max_dim:
                pil_img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            pil_img.save(buf, format="PNG")
            return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception:
        pass
    return ""


def _serialize_tables(tables: list[DetectedTable]) -> list[dict[str, Any]]:
    """Serialize DetectedTable dataclasses cleanly for the interactive frontend editor."""
    out: list[dict[str, Any]] = []
    for t_idx, t in enumerate(tables):
        cells_out = []
        for c in t.cells:
            bg_hex = f"#{c.bg_rgb[0]:02x}{c.bg_rgb[1]:02x}{c.bg_rgb[2]:02x}" if c.bg_rgb else ""
            fg_hex = f"#{c.text_rgb[0]:02x}{c.text_rgb[1]:02x}{c.text_rgb[2]:02x}"
            cells_out.append({
                "r0": c.r0,
                "c0": c.c0,
                "r1": c.r1,
                "c1": c.c1,
                "x": round(c.x0, 2),
                "y": round(c.y0, 2),
                "w": round(max(1.0, c.x1 - c.x0), 2),
                "h": round(max(1.0, c.y1 - c.y0), 2),
                "text": c.text,
                "bgColor": bg_hex,
                "textColor": fg_hex,
                "bold": bool(c.is_bold or c.is_header),
                "align": c.align,
                "fontSize": round(float(c.font_size_pt), 1),
            })
        out.append({
            "id": f"table-{t_idx}",
            "x": round(t.x0, 2),
            "y": round(t.y0, 2),
            "w": round(max(1.0, t.x1 - t.x0), 2),
            "h": round(max(1.0, t.y1 - t.y0), 2),
            "nRows": t.n_rows,
            "nCols": t.n_cols,
            "hasBorders": bool(t.has_visible_borders),
            "cells": cells_out,
        })
    return out


def extract_page_layers_for_editor(
    pdf_path: Path,
    page_idx: int,
    lang: str = "auto",
    strict_local: bool = False,
) -> dict[str, Any]:
    """
    Build a complete layer-wise representation (words, spans, images/logos/stamps/QR,
    table grids/cells, and blank form fields) aligned 1:1 with the PDF page coordinates.
    """
    doc = fitz.open(str(pdf_path))
    try:
        if page_idx < 0 or page_idx >= len(doc):
            raise IndexError(f"Page index {page_idx} out of range")

        pg = doc[page_idx]
        page_w = float(pg.rect.width)
        page_h = float(pg.rect.height)
        page_area = max(1.0, page_w * page_h)
        is_scanned = is_page_raster_scan(pg)
        native_layout = extract_native_text_layout(pg)

        # Render aligned page raster WITHOUT deskew so overlay geometry matches canvas 1:1
        max_dim_pt = max(page_w, page_h, 1.0)
        target_dpi = 200 if is_scanned else 135
        eff_dpi = min(target_dpi, max(110, int((2100.0 * 72.0) / max_dim_pt)))
        pix = pg.get_pixmap(dpi=eff_dpi, alpha=False)
        img_rgb = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        if pix.n == 3:
            img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
        elif pix.n == 1:
            img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_GRAY2BGR)
        else:
            img_bgr = cv2.cvtColor(img_rgb[:, :, :3], cv2.COLOR_RGB2BGR)

        ih, iw = img_bgr.shape[:2]
        px_to_pt = page_w / float(max(1, iw))
        inv_scale = 1.0 / max(px_to_pt, 1e-4)

        assets_out: list[dict[str, Any]] = []
        tables_out: list[dict[str, Any]] = []
        words_out: list[dict[str, Any]] = []
        form_fields_out: list[dict[str, Any]] = []
        enhanced = False

        if not is_scanned:
            # Prefer genuine visible spans/words cleanly
            spans_out = native_layout["spans"]
            words_out = [w for w in native_layout["words"] if not w.get("isInvisibleOcr")]
            if not words_out:
                words_out = native_layout["words"]

            # Extract selectable native image XObjects (skip huge full-page backgrounds)
            img_cache: dict[int, str] = {}
            seen_rects: list[tuple[float, float, float, float]] = []
            for img_info in pg.get_images(full=True):
                xref = int(img_info[0])
                # Skip 1x1 transparent stubs created by PDF image deletion
                if int(img_info[2] or 0) <= 2 or int(img_info[3] or 0) <= 2:
                    continue
                try:
                    rects = pg.get_image_rects(xref)
                except Exception:
                    continue
                for r_idx, r in enumerate(rects):
                    ir = r & pg.rect
                    if ir.width < 14 or ir.height < 14:
                        continue
                    if (ir.width * ir.height) / page_area >= 0.80:
                        continue
                    cand_box = (ir.x0, ir.y0, ir.x1, ir.y1)
                    if any(_rect_iou(cand_box, kept) > 0.75 for kept in seen_rects):
                        continue
                    seen_rects.append(cand_box)
                    if xref not in img_cache:
                        try:
                            extracted = doc.extract_image(xref)
                            img_cache[xref] = _encode_bgr_thumbnail_data_url(extracted.get("image", b""))
                        except Exception:
                            img_cache[xref] = ""
                    assets_out.append({
                        "id": f"xref-{xref}-{r_idx}",
                        "source": "native",
                        "xref": xref,
                        "kind": "image",
                        "x": round(ir.x0, 2),
                        "y": round(ir.y0, 2),
                        "w": round(ir.width, 2),
                        "h": round(ir.height, 2),
                        "dataUrl": img_cache[xref],
                    })

            # Detect visual table grids and map native spans into their cells
            raw_grids = _detect_raw_table_rois(img_bgr)
            table_boxes_px = [
                (cols_px[0], rows_px[0], cols_px[-1], rows_px[-1])
                for rows_px, cols_px, _spans in raw_grids
            ]
            for t_idx, (rows_px, cols_px, cell_spans) in enumerate(raw_grids):
                tx0, ty0 = cols_px[0] * px_to_pt, rows_px[0] * px_to_pt
                tx1, ty1 = cols_px[-1] * px_to_pt, rows_px[-1] * px_to_pt
                cells_json = []
                for r0, c0, r1, c1 in cell_spans:
                    cx0, cy0 = cols_px[c0] * px_to_pt, rows_px[r0] * px_to_pt
                    cx1, cy1 = cols_px[c1] * px_to_pt, rows_px[r1] * px_to_pt
                    cell_txts = [
                        sp["text"]
                        for sp in spans_out
                        if (sp["x"] + sp["w"] * 0.5) >= cx0
                        and (sp["x"] + sp["w"] * 0.5) <= cx1
                        and (sp["y"] + sp["h"] * 0.5) >= cy0
                        and (sp["y"] + sp["h"] * 0.5) <= cy1
                    ]
                    cells_json.append({
                        "r0": r0,
                        "c0": c0,
                        "r1": r1,
                        "c1": c1,
                        "x": round(cx0, 2),
                        "y": round(cy0, 2),
                        "w": round(max(1.0, cx1 - cx0), 2),
                        "h": round(max(1.0, cy1 - cy0), 2),
                        "text": " ".join(cell_txts).strip(),
                        "bgColor": "",
                        "textColor": "#000000",
                        "bold": False,
                        "align": "left",
                        "fontSize": 10.0,
                    })
                tables_out.append({
                    "id": f"table-{t_idx}",
                    "x": round(tx0, 2),
                    "y": round(ty0, 2),
                    "w": round(max(1.0, tx1 - tx0), 2),
                    "h": round(max(1.0, ty1 - ty0), 2),
                    "nRows": len(rows_px) - 1,
                    "nCols": len(cols_px) - 1,
                    "hasBorders": True,
                    "cells": cells_json,
                })

            word_boxes_px = [
                (w["x"] * inv_scale, w["y"] * inv_scale, (w["x"] + w["w"]) * inv_scale, (w["y"] + w["h"]) * inv_scale, w["text"])
                for w in words_out
            ]
            form_fields_out = _detect_blank_form_fields(
                img_bgr, word_boxes_px, px_to_pt, page_w, page_h, table_boxes_px
            )
            lines_out = native_layout.get("lines") or []
            paragraphs_out = native_layout.get("paragraphs") or []
            return {
                "page": page_idx,
                "isScanned": False,
                "pageWidth": round(page_w, 2),
                "pageHeight": round(page_h, 2),
                "spans": spans_out,
                "words": words_out,
                "lines": lines_out,
                "paragraphs": paragraphs_out,
                "assets": assets_out,
                "tables": tables_out,
                "formFields": form_fields_out,
                "enhanced": False,
            }

        # ── Scanned Page Path (OpenCV + Global Hybrid OCR; non-blocking local instant load) ──
        latin_font = fitz.Font("helv")
        dev_font_path = find_devanagari_font()
        dev_font = fitz.Font(fontfile=str(dev_font_path)) if dev_font_path else None

        all_words_px, rapid_words, resolved_lang = ocr_page_words_with_meta(
            img_bgr, lang=lang, clean_watermarks=True, latin_font=latin_font, dev_font=dev_font
        )
        wants_hindi = "hin" in resolved_lang.lower()
        genuine_hindi = wants_hindi and has_genuine_devanagari(all_words_px)
        if wants_hindi and not genuine_hindi:
            all_words_px = rapid_words or all_words_px
            effective_hindi = False
            resolved_lang = "eng"
        else:
            effective_hindi = genuine_hindi

        gray_page = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        bright_page = gray_page >= np.percentile(gray_page, 72)
        paper_rgb = (
            tuple(int(v) for v in np.median(img_bgr[bright_page], axis=0)[::-1])
            if np.any(bright_page)
            else (255, 255, 255)
        )

        raw_grids = _detect_raw_table_rois(img_bgr)
        tables = _populate_tables(
            img_bgr,
            raw_grids,
            all_words_px,
            px_to_pt,
            effective_hindi,
            latin_font,
            dev_font,
            paper_rgb=paper_rgb,
            ocr_lang=resolved_lang,
        )
        table_boxes_px = [
            (
                int(math.floor(t.x0 * inv_scale)),
                int(math.floor(t.y0 * inv_scale)),
                int(math.ceil(t.x1 * inv_scale)),
                int(math.ceil(t.y1 * inv_scale)),
            )
            for t in tables
        ]
        non_table_words_px = [
            w for w in all_words_px
            if not any(_point_in_box((w.x0 + w.x1) * 0.5, (w.y0 + w.y1) * 0.5, tb, pad=2.0) for tb in table_boxes_px)
        ]

        assets, suppress_ocr_boxes = _extract_visual_assets(
            img_bgr, table_boxes_px, non_table_words_px, px_to_pt
        )
        border_rgb = _detect_page_border_rgb(img_bgr)
        side_cut_l = iw * 0.088 if border_rgb is not None else -1.0
        side_cut_r = iw * 0.905 if border_rgb is not None else iw + 1.0

        clean_words_px = [
            w for w in all_words_px
            if not any(_point_in_box((w.x0 + w.x1) * 0.5, (w.y0 + w.y1) * 0.5, sb, pad=2.0) for sb in suppress_ocr_boxes)
            and side_cut_l <= (w.x0 + w.x1) * 0.5 <= side_cut_r
        ]
        words_out = ocr_words_to_editor_blocks(
            img_bgr, clean_words_px, page_w, page_h, suppress_boxes_px=suppress_ocr_boxes
        )

        # Ensure focused cell OCR text recovered from dark/tinted headers is also selectable in /edit
        for tbl in tables:
            for cell in tbl.cells:
                c_txt = (cell.text or "").strip()
                if not c_txt:
                    continue
                cw_pt = max(1.0, cell.x1 - cell.x0)
                ch_pt = max(2.0, cell.y1 - cell.y0)
                already_present = any(
                    cell.x0 <= (ew["x"] + ew["w"] * 0.5) <= cell.x1
                    and cell.y0 <= (ew["y"] + ew["h"] * 0.5) <= cell.y1
                    for ew in words_out
                )
                if not already_present:
                    fg_hex = f"#{cell.text_rgb[0]:02x}{cell.text_rgb[1]:02x}{cell.text_rgb[2]:02x}"
                    bg_hex = f"#{cell.bg_rgb[0]:02x}{cell.bg_rgb[1]:02x}{cell.bg_rgb[2]:02x}" if cell.bg_rgb else "#ffffff"
                    fs_cell = round(max(6.0, float(cell.font_size_pt)), 1)
                    words_out.append({
                        "text": c_txt,
                        "x": round(cell.x0 + 2.0, 2),
                        "y": round(cell.y0 + max(1.0, (ch_pt - fs_cell) * 0.45), 2),
                        "w": round(max(4.0, cw_pt - 4.0), 2),
                        "h": round(min(ch_pt, fs_cell * 1.25), 2),
                        "fontSize": fs_cell,
                        "baseline": round(cell.y0 + max(fs_cell, (ch_pt + fs_cell * 0.72) * 0.5), 2),
                        "fgColor": fg_hex,
                        "bgColor": bg_hex,
                        "conf": 0.9,
                        "bold": bool(cell.is_bold or cell.is_header),
                    })

        lines_out, paragraphs_out = build_lines_and_paragraphs(words_out)
        # Keep /analyze/page-layers strictly instant & non-blocking via local CV+OCR
        enhanced = False

        for a_idx, asset in enumerate(assets):
            assets_out.append({
                "id": f"scan-{a_idx}",
                "source": "scan",
                "xref": 0,
                "kind": asset.kind,
                "x": round(asset.x0, 2),
                "y": round(asset.y0, 2),
                "w": round(max(4.0, asset.x1 - asset.x0), 2),
                "h": round(max(4.0, asset.y1 - asset.y0), 2),
                "dataUrl": "data:image/png;base64," + base64.b64encode(asset.png_bytes).decode("ascii"),
            })

        tables_out = _serialize_tables(tables)
        word_boxes_px = [(w.x0, w.y0, w.x1, w.y1, w.text) for w in clean_words_px]
        form_fields_out = _detect_blank_form_fields(
            img_bgr, word_boxes_px, px_to_pt, page_w, page_h, table_boxes_px
        )

        return {
            "page": page_idx,
            "isScanned": True,
            "pageWidth": round(page_w, 2),
            "pageHeight": round(page_h, 2),
            "spans": [],
            "words": words_out,
            "lines": lines_out,
            "paragraphs": paragraphs_out,
            "assets": assets_out,
            "tables": tables_out,
            "formFields": form_fields_out,
            "enhanced": enhanced,
        }
    finally:
        doc.close()
        gc.collect()
