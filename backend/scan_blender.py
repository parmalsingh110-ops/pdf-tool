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
import fitz
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
) -> tuple[Optional[Path], Optional[str]]:
    """
    Locate best matching valid TTF font path on disk, plus PyMuPDF built-in font key
    (`helv`/`hebo`/`tiro`/`tibo`/`cour` etc.) whose embedded font buffer always works
    cross-platform even if OS fonts are absent.
    """
    here = Path(__file__).resolve().parent
    pub_fonts = here.parent / "public" / "fonts"
    be_fonts = here / "fonts"

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
        serif_cands: list[Path] = []
        if is_bold and is_italic:
            serif_cands += [
                Path("/System/Library/Fonts/Supplemental/Times New Roman Bold Italic.ttf"),
                Path("/System/Library/Fonts/Supplemental/Georgia Bold Italic.ttf"),
                Path("/usr/share/fonts/truetype/liberation/LiberationSerif-BoldItalic.ttf"),
                Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif-BoldItalic.ttf"),
            ]
        elif is_bold:
            serif_cands += [
                Path("/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf"),
                Path("/System/Library/Fonts/Supplemental/Georgia Bold.ttf"),
                Path("/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"),
                Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"),
            ]
        elif is_italic:
            serif_cands += [
                Path("/System/Library/Fonts/Supplemental/Times New Roman Italic.ttf"),
                Path("/System/Library/Fonts/Supplemental/Georgia Italic.ttf"),
                Path("/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf"),
                Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf"),
            ]
        else:
            serif_cands += [
                Path("/System/Library/Fonts/Supplemental/Times New Roman.ttf"),
                Path("/System/Library/Fonts/Supplemental/Georgia.ttf"),
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

    # Default clean Sans-Serif (matching Aadhaar / Govt / modern documents)
    fitz_key = "hebi" if (is_bold and is_italic) else ("hebo" if is_bold else ("heit" if is_italic else "helv"))
    if is_bold and is_italic:
        sans_names = ["NotoSans-BoldItalic.ttf", "NotoSans-Bold.ttf", "NotoSans-Regular.ttf"]
        os_sans = [
            Path("/System/Library/Fonts/Supplemental/Arial Bold Italic.ttf"),
            Path("/usr/share/fonts/truetype/liberation/LiberationSans-BoldItalic.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf"),
        ]
    elif is_bold:
        sans_names = ["NotoSans-Bold.ttf", "NotoSans-Regular.ttf"]
        os_sans = [
            Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
            Path("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ]
    elif is_italic:
        sans_names = ["NotoSans-Italic.ttf", "NotoSans-Regular.ttf"]
        os_sans = [
            Path("/System/Library/Fonts/Supplemental/Arial Italic.ttf"),
            Path("/usr/share/fonts/truetype/liberation/LiberationSans-Italic.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf"),
        ]
    else:
        sans_names = ["NotoSans-Regular.ttf", "NotoSans-Bold.ttf"]
        os_sans = [
            Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
            Path("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        ]

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


def _extract_ink_mask_in_box(
    roi_bgr: np.ndarray,
    box_px: tuple[int, int, int, int],
    dilate_px: int = 2,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Build an accurate binary mask (255 = ink pixels) strictly inside `box_px`,
    plus return smoothed illumination gray of the ROI.
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

    # Chromatic difference from local background helps catch colored ink on darkish cards too
    roi_blur = cv2.GaussianBlur(roi_bgr, (21, 21), 0)
    color_dist = np.linalg.norm(
        roi_bgr.astype(np.float32) - roi_blur.astype(np.float32), axis=2
    )
    sub_cdist = color_dist[by0:by1, bx0:bx1]

    # Dynamic contrast threshold calibrated inside target box
    pos_vals = sub_diff[sub_diff > 8]
    if pos_vals.size >= 12:
        p85 = float(np.percentile(pos_vals, 85))
        thresh_diff = max(16.0, min(52.0, p85 * 0.42))
    else:
        thresh_diff = 22.0

    local_ink = (sub_diff > thresh_diff) | ((sub_diff > 10) & (sub_cdist > thresh_diff * 1.15))

    mask = np.zeros((H, W), dtype=np.uint8)
    mask[by0:by1, bx0:bx1] = (local_ink.astype(np.uint8)) * 255

    if dilate_px > 0:
        dk = dilate_px * 2 + 1
        k_el = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dk, dk))
        # Restrict dilation slightly around box so neighboring words aren't touched
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
    - Visual ink height (cap height or Devanagari shirorekha->core base in px) and baseline y
    - Right-neighbor glyph start x (to prevent colliding when replacement word is wider)
    - Scanner PSF edge blur sigma (px)
    """
    H, W = roi_bgr.shape[:2]
    gray = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2GRAY)
    ex0, ey0, ex1, ey1 = orig_box
    eh = max(6, ey1 - ey0)

    diff = bg_gray.astype(np.float32) - gray.astype(np.float32)

    # 1. Analyze original word ink before erasure + horizontal row neighbors
    row_y0 = max(0, ey0 - int(eh * 0.25))
    row_y1 = min(H, ey1 + int(eh * 0.25))
    row_mask = np.zeros((H, W), dtype=np.uint8)
    row_diff = diff[row_y0:row_y1, :]
    row_pos = row_diff[row_diff > 10]
    row_thr = max(18.0, float(np.percentile(row_pos, 80)) * 0.45) if row_pos.size >= 16 else 24.0
    row_bin = ((row_diff > row_thr).astype(np.uint8)) * 255

    # Filter connected components to letter-sized glyphs (ignore borders / huge lines / tiny speckles)
    n_lbl, labels, stats, _ = cv2.connectedComponentsWithStats(row_bin, connectivity=8)
    valid_glyph_mask = np.zeros_like(row_bin)
    right_neighbor_px: Optional[int] = None
    for i in range(1, n_lbl):
        cx = stats[i, cv2.CC_STAT_LEFT]
        cw = stats[i, cv2.CC_STAT_WIDTH]
        ch = stats[i, cv2.CC_STAT_HEIGHT]
        area = stats[i, cv2.CC_STAT_AREA]
        if area < 6:
            continue
        if ch < max(4, int(eh * 0.24)) or ch > int(eh * 1.45):
            continue
        if cw > int(eh * 6.0):  # horizontal rule/border
            continue
        valid_glyph_mask[labels == i] = 255
        if cx >= ex1 + 2 and (right_neighbor_px is None or cx < right_neighbor_px):
            right_neighbor_px = int(cx)

    row_mask[row_y0:row_y1, :] = valid_glyph_mask

    # Restrict strictly to inside orig_box first for baseline/height precision
    orig_only = np.zeros_like(row_mask)
    orig_only[max(0, ey0):min(H, ey1), max(0, ex0):min(W, ex1)] = row_mask[
        max(0, ey0):min(H, ey1), max(0, ex0):min(W, ex1)
    ]

    # Measure visual tall cap/ascender height & baseline (ignoring shorter lowercase x-height tops!)
    active_glyphs = orig_only if np.count_nonzero(orig_only) >= 24 else row_mask
    glyph_tops, glyph_bots, tall_tops = [], [], []
    if np.count_nonzero(active_glyphs) >= 24:
        n2, _, s2, _ = cv2.connectedComponentsWithStats(active_glyphs, connectivity=8)
        for i in range(1, n2):
            ch = s2[i, cv2.CC_STAT_HEIGHT]
            if ch >= max(4, int(eh * 0.28)) and s2[i, cv2.CC_STAT_AREA] >= 6:
                gt = s2[i, cv2.CC_STAT_TOP]
                glyph_tops.append(gt)
                glyph_bots.append(gt + ch)
                if ch >= int(eh * 0.62):
                    tall_tops.append(gt)

    if has_hindi and np.count_nonzero(active_glyphs) >= 24:
        # Devanagari horizontal projection: locate shirorekha bar peak & main body baseline
        gy0 = max(0, ey0 - 2)
        gy1 = min(H, ey1 + 2)
        sub_mask = active_glyphs[gy0:gy1, :] > 0
        row_proj = np.sum(sub_mask, axis=1).astype(np.float32)
        max_proj = float(row_proj.max()) if row_proj.size > 0 else 0.0
        sh = gy1 - gy0
        shiro_idx = None
        core_bot_idx = None
        if max_proj >= 6.0 and sh >= 8:
            # Shirorekha sits in upper 55% of box
            upper_end = max(3, int(sh * 0.56))
            shiro_rel = int(np.argmax(row_proj[:upper_end]))
            # Walk down from shirorekha through vertical stems until density drops sharply (<22% max_proj)
            stem_band = row_proj[shiro_rel:]
            core_rows = np.where(stem_band >= max_proj * 0.22)[0]
            if core_rows.size >= 4:
                shiro_idx = gy0 + shiro_rel
                # Check if below core body there's a sparse lower matra tail (<22% density);
                # walk linearly down from peak body density to separate sub-baseline matras (`ु/ू`)
                last_strong = shiro_rel + int(core_rows[-1])
                core_bot_idx = gy0 + last_strong
        if shiro_idx is not None and core_bot_idx is not None and (core_bot_idx - shiro_idx) >= max(6, int(eh * 0.48)):
            cap_top_px = float(shiro_idx)
            baseline_px = float(core_bot_idx)
            visual_h_px = max(float(eh) * 0.50, baseline_px - cap_top_px)
        else:
            baseline_px = float(np.percentile(glyph_bots, 60)) if glyph_bots else float(ey0) + eh * 0.88
            cap_top_px = float(ey0) + eh * 0.16
            visual_h_px = max(float(eh) * 0.55, baseline_px - cap_top_px)
    elif glyph_bots:
        baseline_px = float(np.percentile(glyph_bots, 60))
        cap_top_px = float(np.percentile(tall_tops if tall_tops else glyph_tops, 20))
        visual_h_px = max(float(eh) * 0.62, baseline_px - cap_top_px)
    else:
        cap_top_px = float(ey0) + eh * 0.08
        baseline_px = float(ey0) + eh * 0.90
        visual_h_px = eh * 0.76

    # Ink color: prefer neighbor/row core pixels (inner eroded core so no edge fringe bleed)
    sample_mask = row_mask if np.count_nonzero(row_mask) >= 30 else active_glyphs
    ink_bgr = np.array([24, 22, 20], dtype=np.float32)
    psf_sigma = 0.55
    auto_bold = False
    is_serif_visual = False

    if np.count_nonzero(sample_mask) >= 20:
        core_mask = cv2.erode(sample_mask, np.ones((3, 3), np.uint8), iterations=1)
        core_pts = roi_bgr[core_mask > 0] if np.count_nonzero(core_mask) >= 12 else roi_bgr[sample_mask > 0]
        if len(core_pts) > 0:
            lum_pts = 0.114 * core_pts[:, 0] + 0.587 * core_pts[:, 1] + 0.299 * core_pts[:, 2]
            dark_keep = lum_pts <= float(np.percentile(lum_pts, 22))
            ink_pts = core_pts[dark_keep] if np.any(dark_keep) else core_pts
            ink_bgr = np.median(ink_pts, axis=0).astype(np.float32)

        # Optical edge sharpness -> match PSF Gaussian blur
        edge_ring = cv2.dilate(sample_mask, np.ones((3, 3), np.uint8)) - cv2.erode(sample_mask, np.ones((3, 3), np.uint8))
        lap = np.abs(cv2.Laplacian(gray.astype(np.float32), cv2.CV_32F, ksize=3))
        ring_lap = lap[edge_ring > 0]
        bg_contrast = max(25.0, float(np.median(bg_gray[sample_mask > 0])) - float(0.114 * ink_bgr[0] + 0.587 * ink_bgr[1] + 0.299 * ink_bgr[2]))
        if ring_lap.size > 10:
            norm_edge = float(np.percentile(ring_lap, 80)) / bg_contrast
            # Sharp vector/600dpi ~ >2.8, soft 150-250dpi scan ~ 1.1..2.0
            psf_sigma = float(np.clip(1.35 - 0.30 * norm_edge, 0.35, 0.95))

        # Stroke width estimation via distance transform (with PSF blur compensation)
        dist = cv2.distanceTransform(sample_mask, cv2.DIST_L2, 3)
        dist_vals = dist[dist > 0.5]
        if dist_vals.size > 15:
            stroke_w = float(np.percentile(dist_vals, 78)) * 2.0
            eff_stroke_w = max(1.0, stroke_w - 1.25 * psf_sigma)
            stroke_ratio = eff_stroke_w / max(8.0, visual_h_px)
            if stroke_ratio >= 0.154:
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
    }


def _reconstruct_textured_background(
    roi_bgr: np.ndarray,
    bg_gray: np.ndarray,
    erase_mask: np.ndarray,
    erase_box: tuple[int, int, int, int],
) -> np.ndarray:
    """
    Remove ONLY the masked old text ink inside `erase_mask` while preserving
    authentic surrounding paper texture, color shading, and scanner grain.
    """
    H, W = roi_bgr.shape[:2]
    if np.count_nonzero(erase_mask) == 0:
        return roi_bgr.copy()

    # 1. Try optional LaMa ONNX neural inpainting if model file is available
    lama_out = _run_lama_patch(roi_bgr, erase_mask)
    if lama_out is not None:
        alpha = cv2.GaussianBlur(erase_mask.astype(np.float32) / 255.0, (5, 5), 1.4)[:, :, None]
        blended = np.clip(roi_bgr.astype(np.float32) * (1.0 - alpha) + lama_out.astype(np.float32) * alpha, 0, 255).astype(np.uint8)
        return blended

    # 2. Zero-bloat Two-Band OpenCV Paper Texture Synthesis (Illumination + High-Freq Grain)
    # Inpaint smooth base across strokes + narrow surrounding box for gradient continuity
    smooth_inpaint = cv2.inpaint(roi_bgr, erase_mask, inpaintRadius=5, flags=cv2.INPAINT_NS)

    # Identify CLEAN untouched paper pixels across the whole ROI (excluding all dark ink)
    gray = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2GRAY)
    all_ink = (bg_gray.astype(np.int16) - gray.astype(np.int16)) > 14
    all_ink_dil = cv2.dilate((all_ink.astype(np.uint8)) * 255, np.ones((5, 5), np.uint8)) > 0
    clean_mask = (~all_ink_dil) & (erase_mask == 0)

    # Compute high-frequency paper grain (deviation from smoothed ROI)
    roi_f = roi_bgr.astype(np.float32)
    base_blur = cv2.GaussianBlur(roi_f, (9, 9), 2.5)
    high_freq = roi_f - base_blur

    ex0, ey0, ex1, ey1 = erase_box
    ex0 = max(0, ex0); ey0 = max(0, ey0); ex1 = min(W, ex1); ey1 = min(H, ey1)

    # Build a clean donor texture strip from nearest margins right above / below / beside erase_box
    donor_patches: list[np.ndarray] = []
    # Top clean strip & Bottom clean strip match horizontal color/grain pattern best on cards
    strip_rects = [
        (max(0, ex0 - 20), max(0, ey0 - 26), min(W, ex1 + 20), max(0, ey0 - 3)),
        (max(0, ex0 - 20), min(H, ey1 + 3), min(W, ex1 + 20), min(H, ey1 + 26)),
        (max(0, ex0 - 40), max(0, ey0 - 10), max(0, ex0 - 4), min(H, ey1 + 10)),
        (min(W, ex1 + 4), max(0, ey0 - 10), min(W, ex1 + 40), min(H, ey1 + 10)),
    ]
    clean_grain_pool = []
    for sx0, sy0, sx1, sy1 in strip_rects:
        if sx1 - sx0 < 6 or sy1 - sy0 < 4:
            continue
        sub_c = clean_mask[sy0:sy1, sx0:sx1]
        sub_g = high_freq[sy0:sy1, sx0:sx1]
        if np.count_nonzero(sub_c) >= 16:
            clean_grain_pool.append(sub_g[sub_c])

    if not clean_grain_pool and np.count_nonzero(clean_mask) >= 24:
        clean_grain_pool.append(high_freq[clean_mask])

    if clean_grain_pool:
        grain_samples = np.vstack(clean_grain_pool)  # (N, 3)
        # Synthesize correlated 2D paper grain matching spatial smoothness of local scanner noise
        rng = np.random.default_rng(abs(hash(erase_box)) % (2**31 - 1))
        idx_map = rng.integers(0, len(grain_samples), size=(H, W))
        noise_field = grain_samples[idx_map].astype(np.float32)
        # Light 3x3 smoothing reproduces realistic ~2px scanner grain cluster correlation
        noise_field = cv2.GaussianBlur(noise_field, (3, 3), 0.75) * 1.15
    else:
        noise_field = np.zeros_like(roi_f)

    reconstructed = np.clip(smooth_inpaint.astype(np.float32) + noise_field, 0, 255)

    # Blend ONLY over the erased ink mask with smooth soft feathering
    soft_mask = cv2.GaussianBlur(erase_mask.astype(np.float32) / 255.0, (5, 5), 1.3)[:, :, None]
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
    line_h_ss = font_sz_px * 1.25 * SS

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

    # 1. Extract ink-stroke mask of old word + local illumination
    erase_mask, bg_gray = _extract_ink_mask_in_box(roi_bgr, orig_box, dilate_px=2)

    # 2. Profile surrounding text optics, ink color, stroke weight, and baseline
    profile = _analyze_local_typography_and_optics(roi_bgr, bg_gray, orig_box, has_hindi=has_hindi)

    # 3. Reconstruct seamless textured paper background (no flat patch!)
    clean_roi_bgr = _reconstruct_textured_background(roi_bgr, bg_gray, erase_mask, orig_box)

    # If deleting text only (empty new_text), composite feathered inpainted patch
    if not new_text.strip():
        patch_alpha = cv2.GaussianBlur(
            cv2.dilate(erase_mask, np.ones((5, 5), np.uint8)).astype(np.float32) / 255.0,
            (7, 7),
            1.8,
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

    # 4. Match typography weight & ink color to local document
    effective_bold = bool(is_bold or profile["auto_bold"])
    font_path, fitz_font_key = _resolve_render_font_spec(has_hindi, is_serif, is_mono, effective_bold, is_italic)
    has_dedicated_italic = (
        (font_path is not None and "italic" in font_path.name.lower())
        or (font_path is None and fitz_font_key in ("heit", "hebi", "tiit", "tibi", "coit", "cobi"))
    )

    # Align visual font size & baseline with neighboring text when not heavily resized by user
    dy_pt = new_y - orig_rect.y0
    measured_base_px = profile["baseline_px"] + dy_pt * sy
    req_base_px = _pt_to_px_y(baseline_pt)
    # Blend measured visual baseline with OCR baseline (preferring visual bottom of original glyphs)
    final_base_px = 0.72 * measured_base_px + 0.28 * req_base_px

    # Calibrate em size: visual cap height ≈ 0.72*em (Latin) or shirorekha->core-base ≈ 0.68*em (Devanagari)
    cap_ratio = 0.68 if has_hindi else 0.72
    est_em_from_visual = profile["visual_h_px"] / cap_ratio
    req_em_px = font_size_pt * sy
    if not has_explicit_size:
        font_sz_px = est_em_from_visual
    elif abs(req_em_px - est_em_from_visual) <= max(6.0, est_em_from_visual * 0.28):
        font_sz_px = 0.68 * est_em_from_visual + 0.32 * req_em_px
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
    mod_dil = cv2.dilate((mod_mask > 0.05).astype(np.uint8) * 255, np.ones((7, 7), np.uint8))
    patch_alpha = cv2.GaussianBlur(mod_dil.astype(np.float32) / 255.0, (5, 5), 1.3)

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
