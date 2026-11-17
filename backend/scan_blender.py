"""
Adobe-Level Seamless Scanned Document Text Synthesis Engine
-----------------------------------------------------------
Replaces words on scanned PDFs and OCR-layered raster PDFs without leaving
flat solid-color rectangles or harsh digital vector stickers:

1. Texture-Preserving Inpainting:
   - Masks ONLY the old ink strokes inside orig_rect.
   - Optional LaMa ONNX (opencv/inpainting_lama) support when present on disk,
     plus zero-bloat Two-Band OpenCV reconstruction (Navier-Stokes low-freq
     illumination + real high-frequency paper grain synthesis from clean strips).
2. Neighbor Optical & Typography Profiler:
   - Inspects untouched words on the same visual row (and orig word before erase)
     to measure true local ink tone (e.g. #211c17 instead of harsh #000000),
     stroke thickness (Distance Transform -> auto-Bold when nearby text is medium/bold),
     serif vs sans-serif cues, visual cap-height, baseline, and scanner PSF softness.
3. Scanned Realistic Ink Synthesis & Tight Feathered RGBA Composite:
   - Renders replacement text (Latin + Devanagari/Hindi via NotoSans/NotoSansDevanagari
     or Serif via Times/Liberation) at high DPI, applies matched optical softness and
     subtle paper-grain modulation inside strokes, and composites only a tightly
     feathered RGBA patch onto the PDF so neighboring original pixels stay 100% intact.
"""

from __future__ import annotations

import io
import logging
import math
import os
import re
from pathlib import Path
from typing import Optional

import cv2
import pymupdf as fitz
import numpy as np
from PIL import Image, ImageDraw, ImageFont, features

logger = logging.getLogger("mediasuite.scan_blender")

_DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")
_HAS_RAQM = bool(features.check("raqm"))

_LAMA_LOCK = None
_LAMA_SESSION = None
_LAMA_LOAD_ATTEMPTED = False


def _get_lama_session():
    """Optional lazy loader for LaMa ONNX inpainting if cached locally."""
    global _LAMA_SESSION, _LAMA_LOAD_ATTEMPTED
    if _LAMA_LOAD_ATTEMPTED:
        return _LAMA_SESSION
    _LAMA_LOAD_ATTEMPTED = True
    try:
        here = Path(__file__).resolve().parent
        candidates = [
            here / "models" / "inpainting_lama_2025jan.onnx",
            here / "models" / "lama_fp32.onnx",
            Path(os.environ.get("LAMA_ONNX_PATH", "")),
        ]
        model_path = next((p for p in candidates if str(p) and p.exists() and p.is_file()), None)
        if model_path is None:
            return None
        import onnxruntime as ort
        _LAMA_SESSION = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
        logger.info(f"[ScanBlender] Loaded optional LaMa ONNX model: {model_path.name}")
        return _LAMA_SESSION
    except Exception as e:
        logger.warning(f"[ScanBlender] LaMa ONNX unavailable ({type(e).__name__}: {e})")
        return None


def _run_lama_patch(roi_bgr: np.ndarray, mask_u8: np.ndarray) -> Optional[np.ndarray]:
    """Run optional LaMa ONNX inpainting on a 512x512 crop and return BGR image."""
    session = _get_lama_session()
    if session is None:
        return None
    try:
        h, w = roi_bgr.shape[:2]
        img_512 = cv2.resize(roi_bgr, (512, 512), interpolation=cv2.INTER_AREA)
        img_rgb = cv2.cvtColor(img_512, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        img_t = np.expand_dims(np.transpose(img_rgb, (2, 0, 1)), axis=0)

        m_512 = cv2.resize(mask_u8, (512, 512), interpolation=cv2.INTER_NEAREST)
        m_t = np.expand_dims((m_512 > 127).astype(np.float32), axis=(0, 1))

        inps = session.get_inputs()
        feeds = {inps[0].name: img_t, inps[1].name: m_t}
        out_name = session.get_outputs()[0].name
        out = session.run([out_name], feeds)[0][0]
        out_hwc = np.transpose(out, (1, 2, 0))
        if out_hwc.max() <= 1.5:
            out_hwc = out_hwc * 255.0
        out_bgr = cv2.cvtColor(np.clip(out_hwc, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
        return cv2.resize(out_bgr, (w, h), interpolation=cv2.INTER_CUBIC)
    except Exception as e:
        logger.warning(f"[ScanBlender] LaMa patch failed, using texture synthesis: {e}")
        return None


def _is_valid_font_file(path: Path) -> bool:
    """Verify file is an actual SFNT/TTF/OTF/TTC font (never a corrupt HTML stub)."""
    try:
        if not (path.exists() and path.is_file() and path.stat().st_size > 1024):
            return False
        with path.open("rb") as f:
            hdr = f.read(4)
        return hdr in (b"\x00\x01\x00\x00", b"OTTO", b"ttcf", b"true")
    except Exception:
        return False


def _resolve_render_font_spec(
    has_hindi: bool,
    is_serif: bool,
    is_mono: bool,
    is_bold: bool,
    is_italic: bool,
    preferred_family: str = "",
) -> tuple[Optional[Path], Optional[str]]:
    """
    Locate best matching valid TTF font path on disk (honoring exact family hints
    such as Verdana, Georgia, Times, Arial, Courier when available), plus PyMuPDF
    built-in font key fallback (`helv`/`hebo`/`tiro`/`tibo`/`cour` etc.).
    """
    here = Path(__file__).resolve().parent
    pub_fonts = here.parent / "public" / "fonts"
    be_fonts = here / "fonts"
    fam = (preferred_family or "").lower()

    def _first_valid(paths: list[Path]) -> Optional[Path]:
        for p in paths:
            if _is_valid_font_file(p):
                return p
        return None

    if has_hindi:
        names = (
            ["NotoSansDevanagari-Bold.ttf", "NotoSansDevanagari-Regular.ttf"]
            if is_bold
            else ["NotoSansDevanagari-Regular.ttf", "NotoSansDevanagari-Bold.ttf"]
        )
        cands = [d / n for n in names for d in (pub_fonts, be_fonts)]
        cands.append(Path("/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf"))
        return _first_valid(cands), None

    if is_serif:
        fitz_key = "tibi" if (is_bold and is_italic) else ("tibo" if is_bold else ("tiit" if is_italic else "tiro"))
        prefer_georgia = any(k in fam for k in ("georgia", "cambria", "bookman", "palatino"))
        serif_cands: list[Path] = []
        if is_bold and is_italic:
            order = ["Georgia Bold Italic.ttf", "Times New Roman Bold Italic.ttf"] if prefer_georgia else ["Times New Roman Bold Italic.ttf", "Georgia Bold Italic.ttf"]
            serif_cands += [Path("/System/Library/Fonts/Supplemental") / n for n in order]
            serif_cands += [
                Path("/usr/share/fonts/truetype/liberation/LiberationSerif-BoldItalic.ttf"),
                Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif-BoldItalic.ttf"),
            ]
        elif is_bold:
            order = ["Georgia Bold.ttf", "Times New Roman Bold.ttf"] if prefer_georgia else ["Times New Roman Bold.ttf", "Georgia Bold.ttf"]
            serif_cands += [Path("/System/Library/Fonts/Supplemental") / n for n in order]
            serif_cands += [
                Path("/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"),
                Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"),
            ]
        elif is_italic:
            order = ["Georgia Italic.ttf", "Times New Roman Italic.ttf"] if prefer_georgia else ["Times New Roman Italic.ttf", "Georgia Italic.ttf"]
            serif_cands += [Path("/System/Library/Fonts/Supplemental") / n for n in order]
            serif_cands += [
                Path("/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf"),
                Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf"),
            ]
        else:
            order = ["Georgia.ttf", "Times New Roman.ttf"] if prefer_georgia else ["Times New Roman.ttf", "Georgia.ttf"]
            serif_cands += [Path("/System/Library/Fonts/Supplemental") / n for n in order]
            serif_cands += [
                Path("/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"),
                Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"),
            ]
        return _first_valid(serif_cands), fitz_key

    if is_mono:
        fitz_key = "cobi" if (is_bold and is_italic) else ("cobo" if is_bold else ("coit" if is_italic else "cour"))
        mono_cands = [
            Path("/System/Library/Fonts/Supplemental/Courier New Bold.ttf" if is_bold else "/System/Library/Fonts/Supplemental/Courier New.ttf"),
            Path("/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf" if is_bold else "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf" if is_bold else "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"),
        ]
        return _first_valid(mono_cands), fitz_key

    # Default clean Sans-Serif — prioritize exact wide-xheight families like Verdana/DejaVu when hinted
    fitz_key = "hebi" if (is_bold and is_italic) else ("hebo" if is_bold else ("heit" if is_italic else "helv"))
    prefer_wide_sans = any(k in fam for k in ("verdana", "dejavu", "tahoma", "segoe", "trebuchet", "calibri", "carlito"))
    if is_bold and is_italic:
        sans_names = ["NotoSans-BoldItalic.ttf", "NotoSans-Bold.ttf", "NotoSans-Regular.ttf"]
        os_sans = [
            *([Path("/System/Library/Fonts/Supplemental/Verdana Bold Italic.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf")] if prefer_wide_sans else []),
            Path("/System/Library/Fonts/Supplemental/Arial Bold Italic.ttf"),
            Path("/usr/share/fonts/truetype/liberation/LiberationSans-BoldItalic.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf"),
        ]
    elif is_bold:
        sans_names = ["NotoSans-Bold.ttf", "NotoSans-Regular.ttf"]
        os_sans = [
            *([Path("/System/Library/Fonts/Supplemental/Verdana Bold.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")] if prefer_wide_sans else []),
            Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
            Path("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ]
    elif is_italic:
        sans_names = ["NotoSans-Italic.ttf", "NotoSans-Regular.ttf"]
        os_sans = [
            *([Path("/System/Library/Fonts/Supplemental/Verdana Italic.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf")] if prefer_wide_sans else []),
            Path("/System/Library/Fonts/Supplemental/Arial Italic.ttf"),
            Path("/usr/share/fonts/truetype/liberation/LiberationSans-Italic.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf"),
        ]
    else:
        sans_names = ["NotoSans-Regular.ttf", "NotoSans-Bold.ttf"]
        os_sans = [
            *([Path("/System/Library/Fonts/Supplemental/Verdana.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")] if prefer_wide_sans else []),
            Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
            Path("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        ]

    if prefer_wide_sans:
        cands = os_sans + [d / n for n in sans_names for d in (pub_fonts, be_fonts)]
    else:
        cands = [d / n for n in sans_names for d in (pub_fonts, be_fonts)] + os_sans
    return _first_valid(cands), fitz_key


def _estimate_smooth_bg_gray(gray: np.ndarray) -> np.ndarray:
    """Estimate smooth local paper illumination while ignoring dark foreground ink."""
    h, w = gray.shape[:2]
    k = max(9, min(35, (min(h, w) // 5) | 1))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    closed = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, kernel)
    blur_k = max(9, (k * 2) | 1)
    return cv2.GaussianBlur(closed, (blur_k, blur_k), 0)


def _is_serif_from_glyph_mask(glyph_mask: np.ndarray, median_h: float) -> bool:
    """
    Visually classify Serif (Times/Georgia) vs Sans-Serif (Helvetica/Arial)
    by measuring baseline serif-foot flare on vertical stems of glyphs in a row.
    """
    if np.count_nonzero(glyph_mask) < 40 or median_h < 10.0:
        return False
    n_lbl, labels, stats, _ = cv2.connectedComponentsWithStats(glyph_mask, connectivity=8)
    stem_foot_ratios: list[float] = []
    narrow_ratios: list[float] = []
    for i in range(1, n_lbl):
        w = int(stats[i, cv2.CC_STAT_WIDTH])
        h = int(stats[i, cv2.CC_STAT_HEIGHT])
        area = int(stats[i, cv2.CC_STAT_AREA])
        if h < median_h * 0.58 or area < 15:
            continue
        x0 = int(stats[i, cv2.CC_STAT_LEFT])
        y0 = int(stats[i, cv2.CC_STAT_TOP])
        sub = (labels[y0:y0 + h, x0:x0 + w] == i)

        shaft = sub[int(h * 0.30):max(int(h * 0.30) + 1, int(h * 0.78)), :]
        if shaft.shape[0] >= 4:
            stem_cols = np.where(np.mean(shaft, axis=0) >= 0.70)[0]
            if stem_cols.size > 0:
                mid = sub[int(h * 0.52):max(int(h * 0.52) + 1, int(h * 0.76)), :]
                bot = sub[max(0, int(h * 0.87)):, :]
                splits = np.where(np.diff(stem_cols) > 2)[0] + 1
                for grp in np.split(stem_cols, splits):
                    c0, c1 = int(grp[0]), int(grp[-1])
                    sw = c1 - c0 + 1
                    if sw > median_h * 0.35:
                        continue
                    pad = max(2, int(sw * 1.4))
                    xl, xr = max(0, c0 - pad), min(w, c1 + pad + 1)
                    mid_w = float(np.median(np.sum(mid[:, xl:xr], axis=1))) if mid.shape[0] else 0.0
                    bot_w = float(np.max(np.sum(bot[:, xl:xr], axis=1))) if bot.shape[0] else 0.0
                    if mid_w >= 1.1:
                        stem_foot_ratios.append(bot_w / mid_w)

        if 3 <= w <= median_h * 0.45:
            row_sums = np.sum(sub, axis=1).astype(np.float32)
            if row_sums.size >= 10:
                mw = float(np.median(row_sums[int(h * 0.38):max(int(h * 0.38) + 1, int(h * 0.70))]))
                bw = float(np.max(row_sums[max(0, int(h * 0.85)):]))
                tw = float(np.max(row_sums[:max(2, int(h * 0.14))]))
                if mw >= 1.2:
                    narrow_ratios.append(max(bw, 0.9 * tw) / mw)

    if len(stem_foot_ratios) >= 2:
        return float(np.median(stem_foot_ratios)) >= 1.42
    if len(stem_foot_ratios) == 1:
        return stem_foot_ratios[0] >= 1.65
    if len(narrow_ratios) >= 2:
        return float(np.median(narrow_ratios)) >= 1.40
    if len(narrow_ratios) == 1:
        return narrow_ratios[0] >= 1.60
    return False


def _cluster_row_baseline_and_cap(
    glyph_tops: list[int],
    glyph_bots: list[int],
    glyph_heights: list[int],
    eh: int,
    fallback_top: float,
    fallback_base: float,
) -> tuple[float, float, float]:
    """
    Estimate exact row baseline & tall cap height without being skewed up by
    punctuation dots or pulled down by descenders (`g, j, p, q, y`).
    """
    if not glyph_bots:
        return fallback_top, fallback_base, max(6.0, fallback_base - fallback_top)

    bots_arr = np.array(glyph_bots, dtype=np.float32)
    # Build dense clusters within +-max(2.0, eh*0.10) to find the true main baseline mode
    tol = max(2.2, eh * 0.10)
    best_cluster = bots_arr
    best_score = -1.0
    for cand in bots_arr:
        in_c = bots_arr[np.abs(bots_arr - cand) <= tol]
        # Prefer larger cluster, tie-break toward upper-main cluster if descenders exist below
        score = float(in_c.size) - 0.02 * float(np.median(in_c) - np.min(bots_arr))
        if score > best_score:
            best_score = score
            best_cluster = in_c

    baseline_px = float(np.median(best_cluster))

    # Measure true tall ascenders/caps that terminate ON the main baseline (not floating apostrophes/dots)
    tall_tops: list[float] = []
    min_tall_h = max(float(eh) * 0.54, float(np.percentile(glyph_heights, 72)) * 0.86)
    for t, b, h in zip(glyph_tops, glyph_bots, glyph_heights):
        if abs(float(b) - baseline_px) <= max(3.5, eh * 0.14) and float(h) >= min_tall_h:
            tall_tops.append(float(t))

    if tall_tops:
        cap_top_px = float(np.percentile(tall_tops, 20))
    else:
        cap_top_px = float(np.percentile(glyph_tops, 20))

    visual_h_px = max(float(eh) * 0.56, baseline_px - cap_top_px)
    return cap_top_px, baseline_px, visual_h_px


def _measure_word_tight_ink_box(
    roi_bgr: np.ndarray,
    roi_gray: np.ndarray,
    bg_gray: np.ndarray,
    wx0: int,
    wy0: int,
    wx1: int,
    wy1: int,
) -> tuple[int, int, int, int]:
    """Refine a single word's pixel bounds tightly around dark ink (ignoring yellow/pastel wash)."""
    ih, iw = roi_gray.shape[:2]
    px0 = max(0, wx0 - 1)
    py0 = max(0, wy0 - 1)
    px1 = min(iw, wx1 + 1)
    py1 = min(ih, wy1 + 1)
    if (px1 - px0) < 3 or (py1 - py0) < 3:
        return wx0, wy0, wx1, wy1

    sub_bgr = roi_bgr[py0:py1, px0:px1]
    sub_gray = roi_gray[py0:py1, px0:px1]
    sub_diff = bg_gray[py0:py1, px0:px1].astype(np.float32) - sub_gray.astype(np.float32)
    bright_wm = (
        (sub_gray >= 165)
        & (sub_bgr[:, :, 2].astype(np.int16) >= 175)
        & (sub_bgr[:, :, 1].astype(np.int16) >= 170)
        & (sub_diff < 52)
    )
    pos = sub_diff[(sub_diff > 18) & (~bright_wm)]
    if pos.size < 6:
        return wx0, wy0, wx1, wy1
    thr = max(24.0, float(np.percentile(pos, 78)) * 0.42)
    ink = (sub_diff > thr) & (~bright_wm)
    ys, xs = np.where(ink)
    if ys.size < 4:
        return wx0, wy0, wx1, wy1
    tx0 = max(0, px0 + int(xs.min()) - 1)
    ty0 = max(0, py0 + int(ys.min()) - 1)
    tx1 = min(iw, px0 + int(xs.max()) + 2)
    ty1 = min(ih, py0 + int(ys.max()) + 2)
    # Never expand wildly outside the OCR box if adjacent neighbors leaked into 1px pad
    if (tx1 - tx0) > (wx1 - wx0) + 6:
        tx0, tx1 = wx0, wx1
    if (ty1 - ty0) > (wy1 - wy0) + 6:
        ty0, ty1 = wy0, wy1
    return tx0, ty0, max(tx0 + 2, tx1), max(ty0 + 3, ty1)


def profile_scanned_word_rows(
    img_bgr: np.ndarray,
    word_boxes_px: list[tuple[float, float, float, float, str]],
) -> list[dict]:
    """
    Analyze groups of scanned words sharing a visual horizontal line so even
    tiny or lowercase-only words (`no.`, `name`, `parmal`) receive accurate row-level
    baseline, cap height, bold weight, tight ink bounds, and serif/sans style metadata.
    Never mixes photo/emblem blocks outside word regions into row glyph statistics.
    """
    if not word_boxes_px or img_bgr.size == 0:
        return []

    ih, iw = img_bgr.shape[:2]
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    bg_gray = _estimate_smooth_bg_gray(gray)
    diff = bg_gray.astype(np.float32) - gray.astype(np.float32)

    # First tighten each word's bounds around actual ink pixels for exact X/Y hitboxes
    tight_boxes: list[tuple[int, int, int, int]] = []
    for wx0, wy0, wx1, wy1, _txt in word_boxes_px:
        ix0 = max(0, min(iw - 1, int(round(wx0))))
        iy0 = max(0, min(ih - 1, int(round(wy0))))
        ix1 = max(ix0 + 1, min(iw, int(round(wx1))))
        iy1 = max(iy0 + 1, min(ih, int(round(wy1))))
        tight_boxes.append(_measure_word_tight_ink_box(img_bgr, gray, bg_gray, ix0, iy0, ix1, iy1))

    # Group words into visual horizontal rows using BOTH overlap & compatible heights
    indexed = sorted(enumerate(tight_boxes), key=lambda kv: ((kv[1][1] + kv[1][3]) * 0.5, kv[1][0]))
    rows: list[list[int]] = []
    row_meta: list[tuple[float, float]] = []  # (median_cy, median_h)

    for idx, (tx0, ty0, tx1, ty1) in indexed:
        wcy = (ty0 + ty1) * 0.5
        wh = max(4.0, float(ty1 - ty0))
        placed = False
        for r_i, (rcy, rh) in enumerate(row_meta):
            h_ratio = min(wh, rh) / max(wh, rh, 1.0)
            if h_ratio < 0.45:
                continue
            ov_y = min(ty1, rcy + rh * 0.5) - max(ty0, rcy - rh * 0.5)
            if ov_y >= min(wh, rh) * 0.22 or abs(wcy - rcy) <= min(wh, rh) * 0.35:
                rows[r_i].append(idx)
                cys = [(tight_boxes[k][1] + tight_boxes[k][3]) * 0.5 for k in rows[r_i]]
                hs = [float(max(4, tight_boxes[k][3] - tight_boxes[k][1])) for k in rows[r_i]]
                row_meta[r_i] = (float(np.median(cys)), float(np.median(hs)))
                placed = True
                break
        if not placed:
            rows.append([idx])
            row_meta.append((wcy, wh))

    out: list[dict] = [{} for _ in word_boxes_px]
    row_results: list[tuple[list[int], float, float, Optional[bool], bool]] = []

    for r_indices in rows:
        row_hs_raw = [float(max(4, tight_boxes[i][3] - tight_boxes[i][1])) for i in r_indices]
        row_med_h = max(6.0, float(np.median(row_hs_raw)))
        inlier_indices = [
            i for i in r_indices
            if 0.45 * row_med_h <= float(tight_boxes[i][3] - tight_boxes[i][1]) <= 1.85 * row_med_h
        ] or r_indices

        pad_v = max(3, int(round(row_med_h * 0.22)))
        ry0 = max(0, int(round(float(np.min([tight_boxes[i][1] for i in inlier_indices])))) - pad_v)
        ry1 = min(ih, int(round(float(np.max([tight_boxes[i][3] for i in inlier_indices])))) + pad_v)
        eh = max(6, int(round(row_med_h * 1.15)))

        # CRITICAL: restrict horizontal scan strictly to actual word X intervals in this row
        # so nearby passport photos / holograms / seals at the same Y NEVER poison row font metrics!
        x_mask = np.zeros(iw, dtype=bool)
        pad_x = max(6, int(round(row_med_h * 0.45)))
        for i in inlier_indices:
            kx0 = max(0, tight_boxes[i][0] - pad_x)
            kx1 = min(iw, tight_boxes[i][2] + pad_x)
            x_mask[kx0:kx1] = True

        band_diff = diff[ry0:ry1, :].copy()
        band_gray = gray[ry0:ry1, :]
        band_bgr = img_bgr[ry0:ry1, :, :]
        bright_wm_band = (
            (band_gray >= 165)
            & (band_bgr[:, :, 2].astype(np.int16) >= 175)
            & (band_bgr[:, :, 1].astype(np.int16) >= 170)
            & (band_diff < 52)
        )
        band_diff[:, ~x_mask] = 0.0
        band_diff[bright_wm_band] = 0.0

        pos = band_diff[band_diff > 18]
        thr = max(24.0, float(np.percentile(pos, 78)) * 0.48) if pos.size >= 16 else 30.0
        band_bin = (band_diff > thr).astype(np.uint8) * 255

        n_lbl, labels, stats, _ = cv2.connectedComponentsWithStats(band_bin, connectivity=8)
        clean_mask = np.zeros_like(band_bin)
        g_tops, g_bots, g_hs = [], [], []
        for l_idx in range(1, n_lbl):
            cw = int(stats[l_idx, cv2.CC_STAT_WIDTH])
            ch = int(stats[l_idx, cv2.CC_STAT_HEIGHT])
            gt = int(stats[l_idx, cv2.CC_STAT_TOP]) + ry0
            area = int(stats[l_idx, cv2.CC_STAT_AREA])
            if area < 6 or ch < max(4, int(row_med_h * 0.28)) or ch > int(row_med_h * 1.48) or cw > int(row_med_h * 4.5):
                continue
            # Ignore solid opaque photo rectangles or heavy box lines
            if cw > row_med_h * 0.85 and ch > row_med_h * 0.75 and (area / float(max(1, cw * ch))) > 0.82:
                continue
            clean_mask[labels == l_idx] = 255
            g_tops.append(gt)
            g_bots.append(gt + ch)
            g_hs.append(ch)

        fallback_top = float(np.median([tight_boxes[i][1] for i in inlier_indices]))
        fallback_base = float(np.median([tight_boxes[i][3] for i in inlier_indices]))
        _, baseline_px, visual_h_px = _cluster_row_baseline_and_cap(
            g_tops, g_bots, g_hs, eh, fallback_top, fallback_base
        )
        # Keep row visual_h_px bounded cleanly around the row's real median word height
        visual_h_px = min(max(visual_h_px, row_med_h * 0.52), row_med_h * 1.15)
        baseline_px = max(fallback_top + row_med_h * 0.52, min(fallback_base + 2.0, baseline_px))

        med_glyph_h = float(np.percentile(g_hs, 75)) if g_hs else row_med_h
        is_serif: Optional[bool] = (
            _is_serif_from_glyph_mask(clean_mask, med_glyph_h)
            if np.count_nonzero(clean_mask) >= 36
            else None
        )
        auto_bold = False
        if np.count_nonzero(clean_mask) >= 24:
            dist = cv2.distanceTransform(clean_mask, cv2.DIST_L2, 3)
            dvals = dist[dist > 0.5]
            if dvals.size > 12:
                stroke_w = float(np.percentile(dvals, 78)) * 2.0
                if (stroke_w / max(8.0, visual_h_px)) >= 0.175:
                    auto_bold = True

        row_results.append((r_indices, baseline_px, visual_h_px, is_serif, auto_bold))

    # Page-level serif fallback only when an isolated short row couldn't decide
    serif_votes = [1 if sr else 0 for _, _, _, sr, _ in row_results if sr is not None]
    page_serif_prior = (sum(serif_votes) / len(serif_votes) >= 0.6) if serif_votes else False

    for r_indices, baseline_px, visual_h_px, is_serif, auto_bold in row_results:
        resolved_serif = bool(page_serif_prior if is_serif is None else is_serif)
        for i in r_indices:
            tb = tight_boxes[i]
            out[i] = {
                "baseline_px": baseline_px,
                "visual_h_px": visual_h_px,
                "is_serif": resolved_serif,
                "auto_bold": auto_bold,
                "tight_box_px": tb,
                "word_ink_h_px": float(max(4, tb[3] - tb[1])),
            }
    return out


def _extract_ink_mask_in_box(
    roi_bgr: np.ndarray,
    box_px: tuple[int, int, int, int],
    dilate_px: int = 1,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Build a tight, watermark-safe binary mask (255 = foreground ink pixels) inside `box_px`,
    preserving bright pastel/yellow watermarks between characters, plus smoothed ROI illumination.
    """
    H, W = roi_bgr.shape[:2]
    gray = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2GRAY)
    bg_gray = _estimate_smooth_bg_gray(gray)

    bx0, by0, bx1, by1 = box_px
    bx0 = max(0, min(W - 1, bx0))
    by0 = max(0, min(H - 1, by0))
    bx1 = max(bx0 + 1, min(W, bx1))
    by1 = max(by0 + 1, min(H, by1))

    diff = bg_gray.astype(np.int16) - gray.astype(np.int16)
    sub_diff = diff[by0:by1, bx0:bx1]
    sub_gray = gray[by0:by1, bx0:bx1]
    sub_bgr = roi_bgr[by0:by1, bx0:bx1]

    # Measure true foreground dark ink level vs pastel/yellow watermark wash inside box
    strong_diffs = sub_diff[sub_diff > 24]
    if strong_diffs.size >= 12:
        p88 = float(np.percentile(strong_diffs, 88))
        thresh_diff = max(24.0, min(68.0, p88 * 0.45))
    else:
        pos_vals = sub_diff[sub_diff > 10]
        p85 = float(np.percentile(pos_vals, 85)) if pos_vals.size >= 8 else 36.0
        thresh_diff = max(22.0, min(62.0, p85 * 0.46))

    # Protect bright yellow/pastel watermark washes (high Red & Green, luminance near paper)
    # when strong dark text strokes are present inside the target word box
    bright_yellow_wm = (
        (sub_gray >= 165)
        & (sub_bgr[:, :, 2].astype(np.int16) >= 175)
        & (sub_bgr[:, :, 1].astype(np.int16) >= 170)
        & (sub_diff < 52)
    )
    local_ink = (sub_diff > thresh_diff) & (~bright_yellow_wm)

    # Also catch saturated colored stamp/signature/blue ink if genuinely darker than bg
    roi_blur = cv2.GaussianBlur(roi_bgr, (21, 21), 0)
    sub_cdist = np.linalg.norm(
        sub_bgr.astype(np.float32) - roi_blur[by0:by1, bx0:bx1].astype(np.float32), axis=2
    )
    colored_ink = (sub_diff > max(20.0, thresh_diff * 0.8)) & (sub_cdist > 42.0) & (~bright_yellow_wm)
    local_ink = local_ink | colored_ink

    mask = np.zeros((H, W), dtype=np.uint8)
    mask[by0:by1, bx0:bx1] = (local_ink.astype(np.uint8)) * 255

    if dilate_px > 0:
        dk = dilate_px * 2 + 1
        k_el = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dk, dk))
        pad_lim = np.zeros((H, W), dtype=np.uint8)
        px0 = max(0, bx0 - dilate_px)
        py0 = max(0, by0 - dilate_px)
        px1 = min(W, bx1 + dilate_px)
        py1 = min(H, by1 + dilate_px)
        pad_lim[py0:py1, px0:px1] = 255
        mask = cv2.dilate(mask, k_el, iterations=1) & pad_lim

    return mask, bg_gray


def _analyze_local_typography_and_optics(
    roi_bgr: np.ndarray,
    bg_gray: np.ndarray,
    orig_box: tuple[int, int, int, int],
    has_hindi: bool = False,
) -> dict:
    """
    Analyze untouched pixels of the ORIGINAL word and horizontal neighbors
    on the same line to extract:
    - True dark ink BGR color (e.g. warm charcoal #221d18 vs synthetic #000000)
    - Stroke thickness & whether text looks medium/bold (PSF-compensated)
    - Visual Serif vs Sans-Serif typography class from neighbor glyph flares
    - Row-calibrated visual cap height & baseline y (immune to isolated lowercase/descenders)
    - Right-neighbor glyph start x (to prevent colliding when replacement word is wider)
    - Scanner PSF edge blur sigma (px)
    """
    H, W = roi_bgr.shape[:2]
    gray = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2GRAY)
    ex0, ey0, ex1, ey1 = orig_box
    eh = max(6, ey1 - ey0)

    diff = bg_gray.astype(np.float32) - gray.astype(np.float32)

    # 1. Analyze original word ink + horizontal neighbors across the SAME baseline row
    row_y0 = max(0, ey0 - int(eh * 0.25))
    row_y1 = min(H, ey1 + int(eh * 0.25))
    row_mask = np.zeros((H, W), dtype=np.uint8)
    row_diff = diff[row_y0:row_y1, :].copy()
    band_gray = gray[row_y0:row_y1, :]
    band_bgr = roi_bgr[row_y0:row_y1, :, :]
    bright_wm_band = (
        (band_gray >= 165)
        & (band_bgr[:, :, 2].astype(np.int16) >= 175)
        & (band_bgr[:, :, 1].astype(np.int16) >= 170)
        & (row_diff < 52)
    )
    row_diff[bright_wm_band] = 0.0
    row_pos = row_diff[row_diff > 16]
    row_thr = max(24.0, float(np.percentile(row_pos, 80)) * 0.48) if row_pos.size >= 16 else 28.0
    row_bin = ((row_diff > row_thr).astype(np.uint8)) * 255

    # Filter connected components to letter-sized glyphs (ignore borders / photos / huge lines / tiny dots)
    n_lbl, labels, stats, _ = cv2.connectedComponentsWithStats(row_bin, connectivity=8)
    valid_glyph_mask = np.zeros_like(row_bin)
    right_neighbor_px: Optional[int] = None

    row_tops, row_bots, row_hs = [], [], []
    orig_tops, orig_bots, orig_hs = [], [], []

    for i in range(1, n_lbl):
        cx = int(stats[i, cv2.CC_STAT_LEFT])
        cy = int(stats[i, cv2.CC_STAT_TOP]) + row_y0
        cw = int(stats[i, cv2.CC_STAT_WIDTH])
        ch = int(stats[i, cv2.CC_STAT_HEIGHT])
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < 6:
            continue
        if ch < max(4, int(eh * 0.26)) or ch > int(eh * 1.45):
            continue
        if cw > int(eh * 5.0):  # horizontal rule/border
            continue
        if cw > eh * 0.85 and ch > eh * 0.75 and (area / float(max(1, cw * ch))) > 0.82:
            continue
        valid_glyph_mask[labels == i] = 255
        row_tops.append(cy)
        row_bots.append(cy + ch)
        row_hs.append(ch)
        gx_mid = cx + cw * 0.5
        if ex0 - 2 <= gx_mid <= ex1 + 2:
            orig_tops.append(cy)
            orig_bots.append(cy + ch)
            orig_hs.append(ch)
        if cx >= ex1 + 2 and (right_neighbor_px is None or cx < right_neighbor_px):
            right_neighbor_px = int(cx)

    row_mask[row_y0:row_y1, :] = valid_glyph_mask

    orig_only = np.zeros_like(row_mask)
    orig_only[max(0, ey0):min(H, ey1), max(0, ex0):min(W, ex1)] = row_mask[
        max(0, ey0):min(H, ey1), max(0, ex0):min(W, ex1)
    ]

    # Separate untouched neighbor glyphs from the word being replaced
    neighbor_mask = row_mask.copy()
    neighbor_mask[:, max(0, ex0 - 2):min(W, ex1 + 2)] = 0
    has_row_neighbors = len(row_hs) > len(orig_hs) + 1

    if has_hindi and np.count_nonzero(row_mask) >= 24:
        gy0 = max(0, ey0 - 2)
        gy1 = min(H, ey1 + 2)
        sub_mask = (orig_only[gy0:gy1, :] if np.count_nonzero(orig_only) >= 24 else row_mask[gy0:gy1, :]) > 0
        row_proj = np.sum(sub_mask, axis=1).astype(np.float32)
        max_proj = float(row_proj.max()) if row_proj.size > 0 else 0.0
        sh = gy1 - gy0
        shiro_idx = None
        core_bot_idx = None
        if max_proj >= 6.0 and sh >= 8:
            upper_end = max(3, int(sh * 0.56))
            shiro_rel = int(np.argmax(row_proj[:upper_end]))
            stem_band = row_proj[shiro_rel:]
            core_rows = np.where(stem_band >= max_proj * 0.22)[0]
            if core_rows.size >= 4:
                shiro_idx = gy0 + shiro_rel
                last_strong = shiro_rel + int(core_rows[-1])
                core_bot_idx = gy0 + last_strong
        if shiro_idx is not None and core_bot_idx is not None and (core_bot_idx - shiro_idx) >= max(6, int(eh * 0.48)):
            cap_top_px = float(shiro_idx)
            baseline_px = float(core_bot_idx)
            visual_h_px = max(float(eh) * 0.50, baseline_px - cap_top_px)
        else:
            cap_top_px, baseline_px, visual_h_px = _cluster_row_baseline_and_cap(
                row_tops, row_bots, row_hs, eh, float(ey0) + eh * 0.14, float(ey0) + eh * 0.88
            )
    elif has_row_neighbors or len(row_hs) >= 4:
        # Calibrate primarily against full row (keeps lowercase-only orig words synced to neighbors!)
        cap_top_px, baseline_px, visual_h_px = _cluster_row_baseline_and_cap(
            row_tops, row_bots, row_hs, eh, float(ey0) + eh * 0.08, float(ey0) + eh * 0.90
        )
    elif orig_bots:
        cap_top_px, baseline_px, visual_h_px = _cluster_row_baseline_and_cap(
            orig_tops, orig_bots, orig_hs, eh, float(ey0) + eh * 0.08, float(ey0) + eh * 0.90
        )
    else:
        cap_top_px = float(ey0) + eh * 0.08
        baseline_px = float(ey0) + eh * 0.90
        visual_h_px = eh * 0.76

    # Measure Serif vs Sans-Serif visually from full row (prefer untouched neighbors when available)
    serif_probe_mask = neighbor_mask if np.count_nonzero(neighbor_mask) >= 45 else row_mask
    is_serif_visual = _is_serif_from_glyph_mask(serif_probe_mask, visual_h_px)

    # Ink color, PSF softness, and stroke thickness
    sample_mask = row_mask if np.count_nonzero(row_mask) >= 30 else orig_only
    ink_bgr = np.array([24, 22, 20], dtype=np.float32)
    psf_sigma = 0.55
    auto_bold = False

    if np.count_nonzero(sample_mask) >= 20:
        core_mask = cv2.erode(sample_mask, np.ones((3, 3), np.uint8), iterations=1)
        core_pts = roi_bgr[core_mask > 0] if np.count_nonzero(core_mask) >= 12 else roi_bgr[sample_mask > 0]
        if len(core_pts) > 0:
            lum_pts = 0.114 * core_pts[:, 0] + 0.587 * core_pts[:, 1] + 0.299 * core_pts[:, 2]
            dark_keep = lum_pts <= float(np.percentile(lum_pts, 22))
            ink_pts = core_pts[dark_keep] if np.any(dark_keep) else core_pts
            ink_bgr = np.median(ink_pts, axis=0).astype(np.float32)

        edge_ring = cv2.dilate(sample_mask, np.ones((3, 3), np.uint8)) - cv2.erode(sample_mask, np.ones((3, 3), np.uint8))
        lap = np.abs(cv2.Laplacian(gray.astype(np.float32), cv2.CV_32F, ksize=3))
        ring_lap = lap[edge_ring > 0]
        bg_contrast = max(
            25.0,
            float(np.median(bg_gray[sample_mask > 0]))
            - float(0.114 * ink_bgr[0] + 0.587 * ink_bgr[1] + 0.299 * ink_bgr[2]),
        )
        if ring_lap.size > 10:
            norm_edge = float(np.percentile(ring_lap, 80)) / bg_contrast
            psf_sigma = float(np.clip(1.30 - 0.30 * norm_edge, 0.30, 0.90))

        dist = cv2.distanceTransform(sample_mask, cv2.DIST_L2, 3)
        dist_vals = dist[dist > 0.5]
        if dist_vals.size > 15:
            stroke_w = float(np.percentile(dist_vals, 78)) * 2.0
            eff_stroke_w = max(1.0, stroke_w - 1.25 * psf_sigma)
            stroke_ratio = eff_stroke_w / max(8.0, visual_h_px)
            if stroke_ratio >= 0.156:
                auto_bold = True

    return {
        "ink_bgr": ink_bgr,
        "psf_sigma": psf_sigma,
        "auto_bold": auto_bold,
        "is_serif_visual": is_serif_visual,
        "baseline_px": baseline_px,
        "cap_top_px": cap_top_px,
        "visual_h_px": visual_h_px,
        "right_neighbor_px": right_neighbor_px,
        "has_measured_baseline": bool(row_bots or orig_bots),
    }


def _reconstruct_textured_background(
    roi_bgr: np.ndarray,
    bg_gray: np.ndarray,
    erase_mask: np.ndarray,
    erase_box: tuple[int, int, int, int],
) -> np.ndarray:
    """
    Remove ONLY the masked old text ink inside `erase_mask` while preserving
    authentic surrounding paper texture, watermarks, color shading, and scanner grain
    without halo bleed or blurry cloud patches.
    """
    H, W = roi_bgr.shape[:2]
    if np.count_nonzero(erase_mask) == 0:
        return roi_bgr.copy()

    # 1. Try optional LaMa ONNX neural inpainting if model file is available
    lama_out = _run_lama_patch(roi_bgr, erase_mask)
    if lama_out is not None:
        alpha = cv2.GaussianBlur(erase_mask.astype(np.float32) / 255.0, (3, 3), 0.9)[:, :, None]
        blended = np.clip(roi_bgr.astype(np.float32) * (1.0 - alpha) + lama_out.astype(np.float32) * alpha, 0, 255).astype(np.uint8)
        return blended

    # 2. Identify clean paper pixels (never seed inpainting from dark anti-aliased fringes!)
    gray = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2GRAY)
    all_ink = (bg_gray.astype(np.int16) - gray.astype(np.int16)) > 20
    all_ink_dil = cv2.dilate((all_ink.astype(np.uint8)) * 255, np.ones((3, 3), np.uint8)) > 0
    clean_mask = (~all_ink_dil) & (erase_mask == 0)

    ex0, ey0, ex1, ey1 = erase_box
    ex0 = max(0, ex0); ey0 = max(0, ey0); ex1 = min(W, ex1); ey1 = min(H, ey1)

    # Expand erase_mask slightly over dark ringing pixels strictly inside erase_box
    # so cv2.inpaint samples ONLY verified clean paper/watermark perimeter pixels
    box_roi_mask = np.zeros((H, W), dtype=np.uint8)
    box_roi_mask[ey0:ey1, ex0:ex1] = 255
    ring_band = cv2.dilate(erase_mask, np.ones((5, 5), np.uint8)) & (erase_mask == 0) & box_roi_mask
    residual_fringe = (ring_band > 0) & ((bg_gray.astype(np.int16) - gray.astype(np.int16)) > 16)
    inpaint_mask = erase_mask.copy()
    inpaint_mask[residual_fringe] = 255

    # Pre-purge any dark perimeter fringe in seed image before Telea/NS inpaint
    seed_bgr = roi_bgr.copy()
    clean_blur = cv2.GaussianBlur(roi_bgr.astype(np.float32), (5, 5), 1.4)
    dirty_border = (cv2.dilate(inpaint_mask, np.ones((3, 3), np.uint8)) > 0) & (~clean_mask) & (inpaint_mask == 0)
    if np.any(dirty_border):
        seed_bgr[dirty_border] = np.clip(clean_blur[dirty_border], 0, 255).astype(np.uint8)

    telea_bgr = cv2.inpaint(seed_bgr, inpaint_mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA)
    ns_bgr = cv2.inpaint(seed_bgr, inpaint_mask, inpaintRadius=3, flags=cv2.INPAINT_NS)
    smooth_inpaint = cv2.addWeighted(telea_bgr, 0.65, ns_bgr, 0.35, 0.0)

    # Compute high-frequency paper grain (deviation from smoothed ROI)
    roi_f = roi_bgr.astype(np.float32)
    base_blur = cv2.GaussianBlur(roi_f, (9, 9), 2.5)
    high_freq = roi_f - base_blur

    strip_rects = [
        (max(0, ex0 - 20), max(0, ey0 - 24), min(W, ex1 + 20), max(0, ey0 - 3)),
        (max(0, ex0 - 20), min(H, ey1 + 3), min(W, ex1 + 20), min(H, ey1 + 24)),
        (max(0, ex0 - 36), max(0, ey0 - 8), max(0, ex0 - 4), min(H, ey1 + 8)),
        (min(W, ex1 + 4), max(0, ey0 - 8), min(W, ex1 + 36), min(H, ey1 + 8)),
    ]
    clean_grain_pool = []
    clean_bgr_pool = []
    for sx0, sy0, sx1, sy1 in strip_rects:
        if sx1 - sx0 < 6 or sy1 - sy0 < 4:
            continue
        sub_c = clean_mask[sy0:sy1, sx0:sx1]
        if np.count_nonzero(sub_c) >= 16:
            clean_grain_pool.append(high_freq[sy0:sy1, sx0:sx1][sub_c])
            clean_bgr_pool.append(roi_f[sy0:sy1, sx0:sx1][sub_c])

    if not clean_grain_pool and np.count_nonzero(clean_mask) >= 24:
        clean_grain_pool.append(high_freq[clean_mask])
        clean_bgr_pool.append(roi_f[clean_mask])

    is_patterned_bg = False
    if clean_bgr_pool:
        clean_bgr_arr = np.vstack(clean_bgr_pool)
        if float(np.max(np.std(clean_bgr_arr, axis=0))) >= 9.0:
            is_patterned_bg = True

    if clean_grain_pool:
        grain_samples = np.vstack(clean_grain_pool)  # (N, 3)
        rng = np.random.default_rng(abs(hash(erase_box)) % (2**31 - 1))
        idx_map = rng.integers(0, len(grain_samples), size=(H, W))
        noise_field = grain_samples[idx_map].astype(np.float32)
        # Watermarked paper uses softer micro-grain so watermark strokes aren't salted with snow
        amp = 0.45 if is_patterned_bg else 1.05
        noise_field = cv2.GaussianBlur(noise_field, (3, 3), 0.8) * amp
    else:
        noise_field = np.zeros_like(roi_f)

    reconstructed = np.clip(smooth_inpaint.astype(np.float32) + noise_field, 0, 255)

    # Blend ONLY over the tight stroke mask with crisp feathering
    soft_mask = cv2.GaussianBlur(inpaint_mask.astype(np.float32) / 255.0, (3, 3), 0.9)[:, :, None]
    out_f = roi_f * (1.0 - soft_mask) + reconstructed * soft_mask
    return np.clip(out_f, 0, 255).astype(np.uint8)


def _render_text_alpha_mask(
    text: str,
    roi_w: int,
    roi_h: int,
    box_x: float,
    box_w: float,
    baseline_y: float,
    font_sz_px: float,
    font_path: Optional[Path],
    fitz_font_key: Optional[str],
    text_align: int,
    is_italic: bool,
    italic_fallback_shear: bool,
    underline: bool,
    strikethrough: bool,
    line_height_ratio: float = 1.25,
) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    """
    Render crisp text onto a high-res grayscale alpha mask `[0..1]` at exact
    baseline and return `(alpha_float, tight_ink_bbox)`.
    """
    SS = 2  # 2x supersampling for clean antialiasing even before PSF scan blur
    cw = max(16, roi_w * SS)
    ch = max(16, roi_h * SS)
    mask_img = Image.new("L", (cw, ch), 0)
    draw = ImageDraw.Draw(mask_img)

    px_size = max(8, int(round(font_sz_px * SS)))
    pil_font = None
    if font_path is not None:
        try:
            kwargs = {"layout_engine": ImageFont.Layout.RAQM} if _HAS_RAQM else {}
            pil_font = ImageFont.truetype(str(font_path), px_size, **kwargs)
        except Exception:
            try:
                pil_font = ImageFont.truetype(str(font_path), px_size)
            except Exception:
                pil_font = None

    if pil_font is None and fitz_font_key:
        try:
            fbuf = fitz.Font(fitz_font_key).buffer
            if fbuf:
                pil_font = ImageFont.truetype(io.BytesIO(fbuf), px_size)
        except Exception:
            pil_font = None

    if pil_font is None:
        pil_font = ImageFont.load_default()

    lines = text.replace("\r\n", "\n").split("\n")
    eff_lh_ratio = max(1.02, min(1.85, float(line_height_ratio or 1.25)))
    line_h_ss = font_sz_px * eff_lh_ratio * SS

    try:
        ascent, descent = pil_font.getmetrics()
    except Exception:
        ascent, descent = int(px_size * 0.8), int(px_size * 0.2)

    bx_ss = box_x * SS
    bw_ss = max(10.0, box_w * SS)
    base0_ss = baseline_y * SS

    for li, line_txt in enumerate(lines):
        if not line_txt:
            continue
        cur_base = base0_ss + li * line_h_ss
        try:
            tb = pil_font.getbbox(line_txt)
            txt_w_ss = max(1.0, float(tb[2] - tb[0]))
            x_off = float(tb[0])
        except Exception:
            txt_w_ss = float(len(line_txt) * px_size * 0.55)
            x_off = 0.0

        ins_x = bx_ss
        if text_align == fitz.TEXT_ALIGN_CENTER and bw_ss > txt_w_ss:
            ins_x = bx_ss + (bw_ss - txt_w_ss) / 2.0
        elif text_align == fitz.TEXT_ALIGN_RIGHT and bw_ss > txt_w_ss:
            ins_x = bx_ss + (bw_ss - txt_w_ss)

        # Draw anchored by baseline: in PIL without anchor='ls' support on all builds,
        # top-left of em square sits at (cur_base - ascent)
        try:
            draw.text((ins_x - x_off, cur_base), line_txt, font=pil_font, fill=255, anchor="ls")
        except Exception:
            draw.text((ins_x - x_off, cur_base - ascent), line_txt, font=pil_font, fill=255)

        stroke_thick = max(2, int(round(px_size * 0.068)))
        if underline:
            uy = int(round(cur_base + px_size * 0.14))
            draw.line([(ins_x, uy), (ins_x + txt_w_ss, uy)], fill=255, width=stroke_thick)
        if strikethrough:
            sy = int(round(cur_base - px_size * 0.30))
            draw.line([(ins_x, sy), (ins_x + txt_w_ss, sy)], fill=255, width=stroke_thick)

    arr_ss = np.array(mask_img, dtype=np.uint8)

    # Apply synthetic shear if italic was requested on a font lacking a dedicated italic face
    if is_italic and italic_fallback_shear:
        shear = -0.20  # tilt top right relative to baseline
        pivot_y = float(base0_ss)
        M = np.float32([[1.0, shear, -shear * pivot_y], [0.0, 1.0, 0.0]])
        arr_ss = cv2.warpAffine(arr_ss, M, (cw, ch), flags=cv2.INTER_LINEAR, borderValue=0)

    arr = cv2.resize(arr_ss, (roi_w, roi_h), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0

    nz = np.argwhere(arr > 0.03)
    if nz.size == 0:
        return arr, (0, 0, 0, 0)
    ty0, tx0 = int(nz[:, 0].min()), int(nz[:, 1].min())
    ty1, tx1 = int(nz[:, 0].max()) + 1, int(nz[:, 1].max()) + 1
    return arr, (tx0, ty0, tx1, ty1)


def apply_seamless_scan_edit(
    page: fitz.Page,
    orig_rect: fitz.Rect,
    new_x: float,
    new_y: float,
    new_w: float,
    new_h: float,
    new_text: str,
    font_size_pt: float,
    baseline_pt: float,
    fg_rgb: tuple[float, float, float],
    is_bold: bool,
    is_italic: bool,
    is_serif: bool,
    is_mono: bool,
    underline: bool,
    strikethrough: bool,
    text_align: int,
    has_explicit_size: bool = False,
    preferred_family: str = "",
    line_height_ratio: float = 1.25,
) -> Optional[dict]:
    """
    Render a seamless, texture-inpainted, optical-scan-matched RGBA PNG patch
    over `orig_rect` + `new_text` so scanned edits match surrounding text & grain.

    Returns dict with keys `{paste_rect, png_bytes, text_rect, font_size_pt, baseline_pt}`
    or None if ROI rendering isn't viable (caller can fall back gracefully).
    """
    pr = page.rect
    # Target dpi ensures sharp rendering (~44px glyph height) while keeping RAM small
    est_h_pt = max(orig_rect.height, new_h, font_size_pt * 1.2, 8.0)
    blend_dpi = min(400, max(260, int((46.0 * 72.0) / est_h_pt)))

    # Generous context window to inspect horizontal neighbors ("Singh Gurjar") & donor paper margins
    pad_l = max(42.0, orig_rect.width * 0.9)
    pad_r = max(110.0, max(orig_rect.width, new_w) * 1.6)
    pad_t = max(24.0, est_h_pt * 1.2)
    pad_b = max(24.0, est_h_pt * 1.2)

    est_right = max(orig_rect.x1, new_x + max(new_w, len(new_text) * font_size_pt * 0.72))
    est_bottom = max(orig_rect.y1, new_y + max(new_h, font_size_pt * 1.45 * max(1, new_text.count("\n") + 1)))

    roi_rect = fitz.Rect(
        max(pr.x0, min(orig_rect.x0, new_x) - pad_l),
        max(pr.y0, min(orig_rect.y0, new_y) - pad_t),
        min(pr.x1, est_right + pad_r),
        min(pr.y1, est_bottom + pad_b),
    )
    if roi_rect.width < 4 or roi_rect.height < 4:
        return None

    # Clamp DPI if region would exceed 1600px on any side
    scale_px_per_pt = blend_dpi / 72.0
    if max(roi_rect.width, roi_rect.height) * scale_px_per_pt > 1500.0:
        scale_px_per_pt = 1500.0 / max(roi_rect.width, roi_rect.height)
        blend_dpi = max(150, int(scale_px_per_pt * 72.0))

    pix = page.get_pixmap(dpi=blend_dpi, clip=roi_rect, alpha=False)
    if pix.width < 12 or pix.height < 12:
        return None

    img_rgb = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    if pix.n == 3:
        roi_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
    elif pix.n == 4:
        roi_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGBA2BGR)
    else:
        roi_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_GRAY2BGR)

    sx = pix.width / roi_rect.width
    sy = pix.height / roi_rect.height

    def _pt_to_px_x(px_pt: float) -> float:
        return (px_pt - roi_rect.x0) * sx

    def _pt_to_px_y(py_pt: float) -> float:
        return (py_pt - roi_rect.y0) * sy

    ex0 = int(round(_pt_to_px_x(orig_rect.x0)))
    ey0 = int(round(_pt_to_px_y(orig_rect.y0)))
    ex1 = int(round(_pt_to_px_x(orig_rect.x1)))
    ey1 = int(round(_pt_to_px_y(orig_rect.y1)))
    orig_box = (ex0, ey0, ex1, ey1)

    has_hindi = bool(_DEVANAGARI_RE.search(new_text))

    # 1. Extract tight, watermark-safe ink-stroke mask of old word + local illumination
    erase_mask, bg_gray = _extract_ink_mask_in_box(roi_bgr, orig_box, dilate_px=1)

    # 2. Profile surrounding text optics, ink color, stroke weight, serif style, and baseline
    profile = _analyze_local_typography_and_optics(roi_bgr, bg_gray, orig_box, has_hindi=has_hindi)

    # 3. Reconstruct seamless textured paper background (no flat patch!)
    clean_roi_bgr = _reconstruct_textured_background(roi_bgr, bg_gray, erase_mask, orig_box)

    # If deleting text only (empty new_text), composite feathered inpainted patch
    if not new_text.strip():
        patch_alpha = cv2.GaussianBlur(
            cv2.dilate(erase_mask, np.ones((3, 3), np.uint8)).astype(np.float32) / 255.0,
            (5, 5),
            1.1,
        )
        nz = np.argwhere(patch_alpha > 0.02)
        if nz.size == 0:
            return None
        py0, px0 = max(0, int(nz[:, 0].min()) - 2), max(0, int(nz[:, 1].min()) - 2)
        py1, px1 = min(pix.height, int(nz[:, 0].max()) + 3), min(pix.width, int(nz[:, 1].max()) + 3)
        sub_bgr = clean_roi_bgr[py0:py1, px0:px1]
        sub_a = np.clip(patch_alpha[py0:py1, px0:px1] * 255.0, 0, 255).astype(np.uint8)
        sub_rgba = np.dstack([sub_bgr[:, :, 2], sub_bgr[:, :, 1], sub_bgr[:, :, 0], sub_a])
        pil_out = Image.fromarray(sub_rgba, mode="RGBA")
        out_buf = io.BytesIO()
        pil_out.save(out_buf, format="PNG")
        paste_rect = fitz.Rect(
            roi_rect.x0 + px0 / sx,
            roi_rect.y0 + py0 / sy,
            roi_rect.x0 + px1 / sx,
            roi_rect.y0 + py1 / sy,
        )
        return {
            "paste_rect": paste_rect,
            "png_bytes": out_buf.getvalue(),
            "text_rect": orig_rect,
            "font_size_pt": font_size_pt,
            "baseline_pt": baseline_pt,
        }

    # 4. Match typography family (Serif/Sans), weight & ink color to local document
    effective_bold = bool(is_bold or profile["auto_bold"])
    effective_serif = bool(is_serif or (not is_mono and profile.get("is_serif_visual", False)))
    font_path, fitz_font_key = _resolve_render_font_spec(
        has_hindi, effective_serif, is_mono, effective_bold, is_italic, preferred_family=preferred_family
    )
    has_dedicated_italic = (
        (font_path is not None and "italic" in font_path.name.lower())
        or (font_path is None and fitz_font_key in ("heit", "hebi", "tiit", "tibi", "coit", "cobi"))
    )

    # Guard tiny subpixel vertical jitter (< 1.2pt) so in-place edits lock strictly to neighbor baseline
    dy_pt = new_y - orig_rect.y0
    if abs(dy_pt) < 1.2:
        dy_pt = 0.0
    measured_base_px = profile["baseline_px"] + dy_pt * sy
    req_base_px = _pt_to_px_y(baseline_pt)
    if profile.get("has_measured_baseline") and abs(dy_pt) < 1.2:
        final_base_px = 0.90 * measured_base_px + 0.10 * req_base_px
    elif profile.get("has_measured_baseline"):
        final_base_px = 0.78 * measured_base_px + 0.22 * req_base_px
    else:
        final_base_px = req_base_px

    # Calibrate em size using font-family accurate CapHeight/Em ratio
    cap_ratio = 0.68 if has_hindi else (0.662 if effective_serif else 0.716)
    est_em_from_visual = profile["visual_h_px"] / cap_ratio
    req_em_px = font_size_pt * sy
    if not has_explicit_size:
        font_sz_px = est_em_from_visual
    elif abs(req_em_px - est_em_from_visual) <= max(8.0, est_em_from_visual * 0.32):
        font_sz_px = 0.85 * est_em_from_visual + 0.15 * req_em_px
    else:
        font_sz_px = req_em_px

    text_x_px = _pt_to_px_x(new_x)
    text_w_px = max(12.0, new_w * sx)

    text_alpha, text_bbox = _render_text_alpha_mask(
        text=new_text,
        roi_w=pix.width,
        roi_h=pix.height,
        box_x=text_x_px,
        box_w=text_w_px,
        baseline_y=final_base_px,
        font_sz_px=font_sz_px,
        font_path=font_path,
        fitz_font_key=fitz_font_key,
        text_align=text_align,
        is_italic=is_italic,
        italic_fallback_shear=not has_dedicated_italic,
        underline=underline,
        strikethrough=strikethrough,
        line_height_ratio=line_height_ratio,
    )

    # Smart Right-Neighbor Collision Guard: if an inline replacement word is slightly wider
    # than the erased word and a close untouched neighbor word sits immediately to the right,
    # subtly fit horizontally (like Acrobat glyph condensing) so it keeps a natural space gap.
    r_neigh = profile.get("right_neighbor_px")
    tx0, ty0, tx1, ty1 = text_bbox
    if (
        text_align == fitz.TEXT_ALIGN_LEFT
        and "\n" not in new_text
        and r_neigh is not None
        and r_neigh > ex1 + 1
        and (new_x + new_w) <= (orig_rect.x1 + 8.0)
        and tx1 > tx0
    ):
        space_gap_px = max(3.5, 0.26 * font_sz_px)
        avail_right = float(r_neigh) - space_gap_px
        if tx1 > avail_right and avail_right > tx0 + 10.0:
            fit_scale = max(0.72, (avail_right - tx0) / max(1.0, float(tx1 - tx0)))
            target_w = max(8, int(round((tx1 - tx0) * fit_scale)))
            strip = text_alpha[:, tx0:tx1]
            condensed = cv2.resize(strip, (target_w, pix.height), interpolation=cv2.INTER_AREA)
            new_alpha = np.zeros_like(text_alpha)
            end_x = min(pix.width, tx0 + target_w)
            new_alpha[:, tx0:end_x] = condensed[:, : (end_x - tx0)]
            text_alpha = new_alpha
            text_bbox = (tx0, ty0, end_x, ty1)

    # 5. Apply scanner optical PSF blur + subtle paper-grain ink interaction
    psf = float(profile["psf_sigma"])
    if psf > 0.15:
        text_alpha = cv2.GaussianBlur(text_alpha, (0, 0), sigmaX=psf, sigmaY=psf)

    # Decide final ink color: use local scanned dark ink tone when requested color is neutral black
    req_bgr = np.array([fg_rgb[2] * 255.0, fg_rgb[1] * 255.0, fg_rgb[0] * 255.0], dtype=np.float32)
    req_lum = 0.114 * req_bgr[0] + 0.587 * req_bgr[1] + 0.299 * req_bgr[2]
    req_chroma = float(req_bgr.max() - req_bgr.min())
    if req_lum < 68.0 and req_chroma < 28.0:
        final_ink_bgr = profile["ink_bgr"]
    else:
        final_ink_bgr = req_bgr

    # Real printer/toner ink lets ~8% local paper grain show slightly inside strokes
    clean_f = clean_roi_bgr.astype(np.float32)
    smooth_clean_f = cv2.GaussianBlur(clean_f, (9, 9), 2.5)
    local_grain = clean_f - smooth_clean_f
    ink_field = np.clip(final_ink_bgr[None, None, :] + local_grain * 0.45, 0, 255)

    # Slightly cap ink opacity (~0.94) so letter edges merge organically into card paper
    ink_opacity = 0.94
    alpha_eff = np.clip(text_alpha * ink_opacity, 0.0, 1.0)[:, :, None]
    composited_f = clean_f * (1.0 - alpha_eff) + ink_field * alpha_eff

    # 6. Build minimal tight RGBA patch covering ONLY (erased old word ∪ new text),
    # feathered softly at edges so surrounding pixels ("Singh Gurjar") stay 100% original!
    mod_mask = np.maximum(
        (erase_mask > 0).astype(np.float32),
        (text_alpha > 0.02).astype(np.float32),
    )
    mod_dil = cv2.dilate((mod_mask > 0.05).astype(np.uint8) * 255, np.ones((3, 3), np.uint8))
    patch_alpha = cv2.GaussianBlur(mod_dil.astype(np.float32) / 255.0, (3, 3), 0.9)

    nz = np.argwhere(patch_alpha > 0.02)
    if nz.size == 0:
        return None
    py0 = max(0, int(nz[:, 0].min()) - 2)
    px0 = max(0, int(nz[:, 1].min()) - 2)
    py1 = min(pix.height, int(nz[:, 0].max()) + 3)
    px1 = min(pix.width, int(nz[:, 1].max()) + 3)

    sub_bgr = np.clip(composited_f[py0:py1, px0:px1], 0, 255).astype(np.uint8)
    sub_a = np.clip(patch_alpha[py0:py1, px0:px1] * 255.0, 0, 255).astype(np.uint8)
    sub_rgba = np.dstack([sub_bgr[:, :, 2], sub_bgr[:, :, 1], sub_bgr[:, :, 0], sub_a])

    pil_out = Image.fromarray(sub_rgba, mode="RGBA")
    out_buf = io.BytesIO()
    pil_out.save(out_buf, format="PNG")

    paste_rect = fitz.Rect(
        roi_rect.x0 + px0 / sx,
        roi_rect.y0 + py0 / sy,
        roi_rect.x0 + px1 / sx,
        roi_rect.y0 + py1 / sy,
    )

    tx0, ty0, tx1, ty1 = text_bbox
    if tx1 > tx0 and ty1 > ty0:
        text_rect = fitz.Rect(
            roi_rect.x0 + tx0 / sx,
            roi_rect.y0 + ty0 / sy,
            roi_rect.x0 + tx1 / sx,
            roi_rect.y0 + ty1 / sy,
        )
    else:
        text_rect = fitz.Rect(new_x, new_y, new_x + new_w, new_y + new_h)

    return {
        "paste_rect": paste_rect,
        "png_bytes": out_buf.getvalue(),
        "text_rect": text_rect,
        "font_size_pt": round(font_sz_px / sy, 2),
        "baseline_pt": round(roi_rect.y0 + final_base_px / sy, 2),
    }


def erase_region_seamlessly(
    page: fitz.Page,
    target_rect: fitz.Rect,
) -> Optional[dict]:
    """
    Seamlessly erase any arbitrary stamp, signature, logo, stain, or raster object
    inside `target_rect` using texture-preserving two-band OpenCV/LaMa inpainting
    and donor scanner grain sampled from clean surrounding margins.

    Returns dict `{paste_rect, png_bytes}` or None if target_rect is invalid.
    """
    pr = page.rect
    rect = target_rect & pr
    if rect.width < 2 or rect.height < 2:
        return None

    pad_x = max(24.0, min(90.0, rect.width * 0.45))
    pad_y = max(24.0, min(90.0, rect.height * 0.45))
    roi_rect = fitz.Rect(
        max(pr.x0, rect.x0 - pad_x),
        max(pr.y0, rect.y0 - pad_y),
        min(pr.x1, rect.x1 + pad_x),
        min(pr.y1, rect.y1 + pad_y),
    )

    max_side_pt = max(roi_rect.width, roi_rect.height, 1.0)
    eff_dpi = min(300, max(140, int((1350.0 * 72.0) / max_side_pt)))
    pix = page.get_pixmap(dpi=eff_dpi, clip=roi_rect, alpha=False)
    if pix.width < 8 or pix.height < 8:
        return None

    img_rgb = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    if pix.n == 3:
        roi_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
    elif pix.n == 4:
        roi_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGBA2BGR)
    else:
        roi_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_GRAY2BGR)

    sx = pix.width / roi_rect.width
    sy = pix.height / roi_rect.height
    ex0 = max(1, int(round((rect.x0 - roi_rect.x0) * sx)))
    ey0 = max(1, int(round((rect.y0 - roi_rect.y0) * sy)))
    ex1 = min(pix.width - 1, int(round((rect.x1 - roi_rect.x0) * sx)))
    ey1 = min(pix.height - 1, int(round((rect.y1 - roi_rect.y0) * sy)))
    if ex1 <= ex0 or ey1 <= ey0:
        return None

    erase_mask = np.zeros((pix.height, pix.width), dtype=np.uint8)
    erase_mask[ey0:ey1, ex0:ex1] = 255

    gray = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2GRAY)
    bg_gray = _estimate_smooth_bg_gray(gray)
    clean_roi_bgr = _reconstruct_textured_background(roi_bgr, bg_gray, erase_mask, (ex0, ey0, ex1, ey1))

    feather = cv2.GaussianBlur(
        cv2.dilate(erase_mask, np.ones((5, 5), np.uint8)).astype(np.float32) / 255.0,
        (7, 7),
        1.8,
    )
    nz = np.argwhere(feather > 0.02)
    if nz.size == 0:
        return None

    py0 = max(0, int(nz[:, 0].min()) - 2)
    px0 = max(0, int(nz[:, 1].min()) - 2)
    py1 = min(pix.height, int(nz[:, 0].max()) + 3)
    px1 = min(pix.width, int(nz[:, 1].max()) + 3)

    sub_bgr = clean_roi_bgr[py0:py1, px0:px1]
    sub_a = np.clip(feather[py0:py1, px0:px1] * 255.0, 0, 255).astype(np.uint8)
    sub_rgba = np.dstack([sub_bgr[:, :, 2], sub_bgr[:, :, 1], sub_bgr[:, :, 0], sub_a])

    out_buf = io.BytesIO()
    Image.fromarray(sub_rgba, mode="RGBA").save(out_buf, format="PNG")
    paste_rect = fitz.Rect(
        roi_rect.x0 + px0 / sx,
        roi_rect.y0 + py0 / sy,
        roi_rect.x0 + px1 / sx,
        roi_rect.y0 + py1 / sy,
    )
    return {
        "paste_rect": paste_rect,
        "png_bytes": out_buf.getvalue(),
    }
