"""
Deep-Tech & Forensics Processing Engine
========================================
Provides genuine signal-processing, computer vision, cryptographic/structural,
vector-tracing, and semantic document auditing backends for:
  1. DocForensics™       — JPEG ELA tamper heatmaps, whiteout concealed-text X-Ray,
                           font/baseline-jitter splice checks, AcroForm ByteRange checks,
                           and EXIF/XMP camera software forensics (PDF + Images).
  2. TrueVector 4K™      — Morphological shadow/illumination normalization,
                           bilateral denoising, authentic color ink separation,
                           OpenCV RETR_CCOMP hierarchical Cubic Bezier tracing
                           to native SVG & PyMuPDF vector PDFs, plus RapidOCR searchability.
  3. Contract Redliner™  — 18-category legal/financial trap engine, RapidOCR fallback for
                           scanned stamp papers, numeric notice-period asymmetry checks,
                           missing safeguard checks, exact PDF clause bounding boxes,
                           and optional server-key-safe Gemini semantic deep audit.
"""

from __future__ import annotations

import base64
import collections
import io
import json
import logging
import math
import os
import re
from typing import Any, Optional

import cv2
import pymupdf as fitz
import numpy as np
from PIL import Image, ExifTags

logger = logging.getLogger("pdf_tool")

# ─── Shared Constants ────────────────────────────────────────────────────────

SUSPICIOUS_PRODUCERS = [
    "canva",
    "photoshop",
    "illustrator",
    "coreldraw",
    "gimp",
    "sejda",
    "ilovepdf",
    "pdfescape",
    "smallpdf",
    "inkscape",
    "pdf24",
    "phantompdf",
    "nitro",
    "wondershare",
    "foxit",
    "camscanner",
    "picsart",
    "snapseed",
    "pixlr",
    "photopea",
    "lightroom",
    "libreoffice draw",
    "ms paint",
    "paint.net",
    "remini",
]

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff")


def _encode_png_data_url(img_rgb_or_bgr: np.ndarray, is_bgr: bool = True, max_dim: int = 1200) -> str:
    """Encode an OpenCV/NumPy image array as a compact PNG data URL for live inspector previews."""
    h, w = img_rgb_or_bgr.shape[:2]
    scale = min(1.0, max_dim / float(max(h, w, 1)))
    work = img_rgb_or_bgr
    if scale < 0.99:
        work = cv2.resize(
            work,
            (max(1, int(round(w * scale))), max(1, int(round(h * scale)))),
            interpolation=cv2.INTER_AREA,
        )
    if is_bgr and work.ndim == 3 and work.shape[2] == 3:
        ok, buf = cv2.imencode(".png", work, [cv2.IMWRITE_PNG_COMPRESSION, 6])
    else:
        ok, buf = cv2.imencode(".png", work, [cv2.IMWRITE_PNG_COMPRESSION, 6])
    if not ok:
        return ""
    return "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode("ascii")


def _compute_ela_from_rgb_array(
    img_rgb: np.ndarray,
    quality: int = 90,
    gain: float = 14.0,
) -> tuple[np.ndarray, list[dict[str, Any]], float]:
    """
    Perform real Error Level Analysis (ELA) on an RGB image array.
    Re-encodes the image at JPEG quality 90 in memory and compares spatial error residual blocks.
    Returns (ela_colormap_bgr, hotspot_boxes_norm, ela_global_std).
    Hotspot boxes use normalized [x0, y0, x1, y1] coordinates in [0.0..1.0].
    """
    h, w = img_rgb.shape[:2]
    pil_orig = Image.fromarray(img_rgb, mode="RGB")
    buf = io.BytesIO()
    pil_orig.save(buf, format="JPEG", quality=quality, subsampling=0)
    buf.seek(0)
    pil_recomp = Image.open(buf).convert("RGB")
    recomp_arr = np.asarray(pil_recomp, dtype=np.int16)
    orig_arr = img_rgb.astype(np.int16)

    diff = np.abs(orig_arr - recomp_arr).astype(np.float32)
    diff_gray = diff.mean(axis=2)  # per-pixel mean absolute RGB diff [0..255]

    # Visual ELA X-Ray heatmap (INFERNO perceptual palette reveals pasted edges starkly)
    vis = np.clip(diff_gray * gain, 0, 255).astype(np.uint8)
    ela_heatmap_bgr = cv2.applyColorMap(vis, cv2.COLORMAP_INFERNO)

    # Spatial block outlier detection (split image into adaptive tiles ~32..64 px)
    grid_n = 16
    tile_h = max(12, h // grid_n)
    tile_w = max(12, w // grid_n)
    rows = max(1, h // tile_h)
    cols = max(1, w // tile_w)

    tile_means = np.zeros((rows, cols), dtype=np.float32)
    tile_stds = np.zeros((rows, cols), dtype=np.float32)
    tile_p95 = np.zeros((rows, cols), dtype=np.float32)
    for r in range(rows):
        y0 = r * tile_h
        y1 = h if r == rows - 1 else (r + 1) * tile_h
        for c in range(cols):
            x0 = c * tile_w
            x1 = w if c == cols - 1 else (c + 1) * tile_w
            patch = diff_gray[y0:y1, x0:x1]
            tile_means[r, c] = float(np.mean(patch))
            tile_stds[r, c] = float(np.std(patch))
            tile_p95[r, c] = float(np.percentile(patch, 95))

    med_mean = float(np.median(tile_means))
    mad_mean = float(np.median(np.abs(tile_means - med_mean))) + 1e-4
    non_zero_p95 = tile_p95[tile_p95 > 0.4]
    med_p95 = float(np.median(non_zero_p95)) if non_zero_p95.size > 0 else 0.0
    mad_p95 = float(np.median(np.abs(non_zero_p95 - med_p95))) + 1e-4 if non_zero_p95.size > 0 else 1.0
    global_std = float(np.std(diff_gray))

    # Flag tiles whose ELA residual or 95th-percentile peak diverges sharply from document baseline
    high_thresh = max(med_mean + 4.2 * mad_mean, med_mean * 2.2 + 1.5, 2.2)
    p95_thresh = max(med_p95 + 4.0 * mad_p95, med_p95 * 1.9 + 3.0, 6.0)
    hotspots: list[dict[str, Any]] = []
    flagged_mask = np.zeros((rows, cols), dtype=np.uint8)

    for r in range(rows):
        for c in range(cols):
            m = tile_means[r, c]
            s = tile_stds[r, c]
            p95 = tile_p95[r, c]
            if (m > high_thresh and s > 1.1) or (p95 > p95_thresh and m > max(0.8, med_mean * 1.6) and s > 1.2):
                flagged_mask[r, c] = 1

    # Group contiguous flagged tiles via connected components so overlapping boxes merge cleanly
    num_lbl, labels, stats, _ = cv2.connectedComponentsWithStats(flagged_mask, connectivity=8)
    for lbl in range(1, num_lbl):
        bx, by, bw, bh, area = stats[lbl]
        if area <= 0 or (bw * bh) > (rows * cols * 0.45):
            # Ignore global texture covering half the page
            continue
        nx0 = round(float(bx * tile_w) / max(1, w), 4)
        ny0 = round(float(by * tile_h) / max(1, h), 4)
        nx1 = round(min(1.0, float((bx + bw) * tile_w) / max(1, w)), 4)
        ny1 = round(min(1.0, float((by + bh) * tile_h) / max(1, h)), 4)
        region_peak = float(np.max(tile_means[by : by + bh, bx : bx + bw]))
        hotspots.append(
            {
                "norm_bbox": [nx0, ny0, nx1, ny1],
                "peak_residual": round(region_peak, 2),
                "baseline_median": round(med_mean, 2),
            }
        )

    # Sort strongest anomalies first, keep top 8 clean regions per page
    hotspots.sort(key=lambda item: item["peak_residual"], reverse=True)
    return ela_heatmap_bgr, hotspots[:8], round(global_std, 2)


# ─── 1. DocForensics™ Deep Multimodal Inspector ──────────────────────────────

def analyze_forensics_deep(raw_bytes: bytes, filename: str) -> dict[str, Any]:
    """
    Perform deep multi-layer forensic inspection on either a PDF document or a raster scan image.
    Includes SHA-256 hash verification, EXIF/XMP tool fingerprinting, AcroForm ByteRange checks,
    opaque whiteout concealment recovery ('X-Ray'), font/baseline splice detection, and ELA X-Ray.
    """
    import hashlib

    file_sha256 = hashlib.sha256(raw_bytes).hexdigest()
    ext = os.path.splitext((filename or "").lower())[1]
    is_image = ext in IMAGE_EXTENSIONS or raw_bytes[:3] == b"\xff\xd8\xff" or raw_bytes[:8] == b"\x89PNG\r\n\x1a\n"

    anomalies: list[dict[str, Any]] = []
    tamper_points = 0
    ela_previews: dict[str, str] = {}

    if is_image:
        return _analyze_image_forensics(raw_bytes, filename or "document.jpg", file_sha256)

    # ── PDF Forensics Path ───────────────────────────────────────────────────
    doc = fitz.open(stream=raw_bytes, filetype="pdf")
    try:
        meta = doc.metadata or {}
        producer = (meta.get("producer") or "").strip().lower()
        creator = (meta.get("creator") or "").strip().lower()
        creation_date = (meta.get("creationDate") or "").strip()
        mod_date = (meta.get("modDate") or "").strip()

        suspicious_tool = None
        for sp in SUSPICIOUS_PRODUCERS:
            if sp in producer or sp in creator:
                suspicious_tool = sp.title()
                break

        meta_audit: dict[str, Any] = {
            "producer": meta.get("producer") or "Not Specified",
            "creator": meta.get("creator") or "Not Specified",
            "creation_date": creation_date or "Unknown",
            "mod_date": mod_date or "Unknown",
            "is_encrypted": doc.is_encrypted,
            "is_repaired": doc.is_repaired,
            "page_count": len(doc),
            "file_sha256": file_sha256,
            "software_warning": None,
            "revision_warning": None,
            "signature_warning": None,
            "recovered_hidden_count": 0,
        }

        if suspicious_tool:
            tamper_points += 25
            warning_msg = (
                f"Document traces indicate graphic design / PDF manipulation software ({suspicious_tool}). "
                "Official banking, payroll, or government PDFs are typically output directly by core enterprise engines."
            )
            meta_audit["software_warning"] = warning_msg
            anomalies.append(
                {
                    "id": "anom_meta_tool",
                    "page": 0,
                    "type": "GRAPHIC_EDITOR_METADATA",
                    "title": f"Editing Software Detected: {suspicious_tool}",
                    "description": warning_msg,
                    "bbox": None,
                    "severity": "HIGH",
                }
            )

        # Creation vs Modification mismatch check
        if creation_date and mod_date and creation_date != mod_date:
            # Strip prefix D: and timezone noise to compare core YYYYMMDDHHMM
            c_clean = re.sub(r"[^0-9]", "", creation_date)[:12]
            m_clean = re.sub(r"[^0-9]", "", mod_date)[:12]
            if c_clean and m_clean and c_clean != m_clean:
                tamper_points += 10
                anomalies.append(
                    {
                        "id": "anom_date_mismatch",
                        "page": 0,
                        "type": "TIMESTAMP_DRIFT",
                        "title": "Creation vs Modification Timestamp Mismatch",
                        "description": f"Document was re-modified after initial generation (Created: {creation_date[:18]} vs Modified: {mod_date[:18]}).",
                        "bbox": None,
                        "severity": "MEDIUM",
                    }
                )

        # Incremental XRef revisions & post-signature ByteRange check
        startxref_count = len(re.findall(rb"startxref", raw_bytes))
        if startxref_count > 1:
            tamper_points += 15
            rev_msg = (
                f"Document contains {startxref_count} incremental XRef revisions. "
                "New objects or overlays were appended onto an existing signed/finalized PDF."
            )
            meta_audit["revision_warning"] = rev_msg
            anomalies.append(
                {
                    "id": "anom_incremental_update",
                    "page": 0,
                    "type": "INCREMENTAL_REVISION",
                    "title": f"Multiple Revisions Detected ({startxref_count} Saves)",
                    "description": rev_msg,
                    "bbox": None,
                    "severity": "HIGH",
                }
            )

        # Cryptographic /Sig ByteRange coverage check
        for m in re.finditer(rb"/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]", raw_bytes):
            b0, b1, b2, b3 = int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4))
            signed_end = b2 + b3
            # Allow tiny trailing whitespace/%%EOF tolerance (<= 32 bytes)
            if signed_end + 32 < len(raw_bytes):
                extra_bytes = len(raw_bytes) - signed_end
                tamper_points += 40
                sig_msg = (
                    f"AcroForm Digital Signature Integrity Breach: {extra_bytes:,} unauthenticated bytes "
                    "were appended AFTER the cryptographic signature ByteRange ended."
                )
                meta_audit["signature_warning"] = sig_msg
                anomalies.append(
                    {
                        "id": "anom_sig_byterange",
                        "page": 0,
                        "type": "POST_SIGNATURE_TAMPER",
                        "title": "Post-Signature Tampering (ByteRange Breach)",
                        "description": sig_msg,
                        "bbox": None,
                        "severity": "CRITICAL",
                    }
                )

        # ── Page-Level Forensic Inspection ───────────────────────────────────
        for p_idx in range(len(doc)):
            page = doc[p_idx]
            page_rect = page.rect
            pw, ph = float(page_rect.width), float(page_rect.height)

            img_info_list = page.get_image_info(xrefs=True)
            has_bg_scan = any(
                fitz.Rect(info["bbox"]).width > pw * 0.65 and fitz.Rect(info["bbox"]).height > ph * 0.65
                for info in img_info_list
            )

            # Collect all text spans once for collision, whiteout recovery, stealth text & font audit
            blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE).get("blocks", [])
            spans_list: list[dict[str, Any]] = []
            for b in blocks:
                if b.get("type") == 0:
                    for line in b.get("lines", []):
                        for span in line.get("spans", []):
                            txt = (span.get("text") or "").strip()
                            if txt:
                                spans_list.append(span)

            # A. Annotations & FreeText Layers
            for annot in page.annots() or []:
                a_rect = annot.rect
                a_type = annot.type[1] if isinstance(annot.type, tuple) else str(annot.type)
                a_info = annot.info or {}
                a_content = (a_info.get("content") or "").strip()

                if a_type in ("FreeText", "Square", "Stamp", "Ink", "Redact", "Text"):
                    tamper_points += 30
                    anomalies.append(
                        {
                            "id": f"anom_annot_p{p_idx+1}_{len(anomalies)}",
                            "page": p_idx + 1,
                            "type": f"ANNOTATION_{a_type.upper()}",
                            "title": f"Injected {a_type} Layer (p.{p_idx+1})",
                            "description": (
                                f"External {a_type} object added post-generation: '{a_content[:50]}'. "
                                "Frequently used in PDF editors to overwrite amounts, dates, or names."
                            ),
                            "bbox": [round(a_rect.x0, 1), round(a_rect.y0, 1), round(a_rect.x1, 1), round(a_rect.y1, 1)],
                            "severity": "CRITICAL",
                        }
                    )

            # B. Vector Whiteout / Patch Boxes + Concealed Underlying Text Recovery ("X-Ray")
            drawings = page.get_drawings()
            white_boxes: list[fitz.Rect] = []
            for d in drawings:
                fill = d.get("fill")
                if fill is not None:
                    if isinstance(fill, (list, tuple)) and len(fill) >= 3:
                        # Catch near-white & off-white form patch tones too (r,g,b >= 0.90)
                        is_white = all(float(c) >= 0.90 for c in fill[:3])
                    elif isinstance(fill, (int, float)):
                        is_white = float(fill) >= 0.90
                    else:
                        is_white = False

                    if is_white and d.get("rect"):
                        r = fitz.Rect(d["rect"])
                        if (r.width < pw * 0.92 or r.height < ph * 0.92) and r.width > 7 and r.height > 6 and (r.width * r.height) > 48:
                            white_boxes.append(r)

            for r in white_boxes:
                concealed_texts: list[str] = []
                for sp in spans_list:
                    sb = fitz.Rect(sp.get("bbox", [0, 0, 0, 0]))
                    s_area = max(1.0, sb.width * sb.height)
                    inter = r & sb
                    if not inter.is_empty and (inter.width * inter.height) >= s_area * 0.25:
                        st = (sp.get("text") or "").strip()
                        if st and st not in concealed_texts:
                            concealed_texts.append(st)

                if concealed_texts:
                    recovered_str = " ".join(concealed_texts)[:110]
                    meta_audit["recovered_hidden_count"] += 1
                    tamper_points += 40
                    anomalies.append(
                        {
                            "id": f"anom_whiteout_rec_p{p_idx+1}_{len(anomalies)}",
                            "page": p_idx + 1,
                            "type": "WHITEOUT_CONCEALED_TEXT",
                            "title": f"Hidden Text Recovered Under Whiteout (p.{p_idx+1})",
                            "description": (
                                f"Opaque white vector mask ({round(r.width)}x{round(r.height)}pt) conceals underlying text. "
                                f"Recovered Original Content: \"{recovered_str}\""
                            ),
                            "recovered_text": recovered_str,
                            "bbox": [round(r.x0, 1), round(r.y0, 1), round(r.x1, 1), round(r.y1, 1)],
                            "severity": "CRITICAL",
                        }
                    )
                elif has_bg_scan:
                    # On scanned PDFs without underlying vector text, a smaller white vector patch is strongly suspicious
                    tamper_points += 35
                    anomalies.append(
                        {
                            "id": f"anom_whiteout_p{p_idx+1}_{len(anomalies)}",
                            "page": p_idx + 1,
                            "type": "WHITEOUT_MASK_TAMPER",
                            "title": f"Whiteout Patch Box Over Scan (p.{p_idx+1})",
                            "description": f"Opaque white vector rectangle ({round(r.width)}x{round(r.height)}pt) placed on top of scanned background to erase content.",
                            "bbox": [round(r.x0, 1), round(r.y0, 1), round(r.x1, 1), round(r.y1, 1)],
                            "severity": "CRITICAL",
                        }
                    )

            # C. Stealth / Invisible White-on-White / Off-Page Text
            for sp in spans_list:
                s_color = int(sp.get("color", 0) or 0)
                sr = (s_color >> 16) & 0xFF
                sg = (s_color >> 8) & 0xFF
                sb_c = s_color & 0xFF
                s_size = float(sp.get("size", 10) or 10)
                s_txt = (sp.get("text") or "").strip()
                s_bbox = sp.get("bbox", [0, 0, 0, 0])
                s_rect = fitz.Rect(s_bbox)

                # Skip invisible OCR text (render_mode 3 handled separately) when legitimate scan OCR
                flags = int(sp.get("flags", 0) or 0)
                # Detect very bright white text painted inside page or outside page bounds
                if s_rect.x1 < 0 or s_rect.x0 > pw or s_rect.y1 < 0 or s_rect.y0 > ph:
                    if len(s_txt) >= 3:
                        tamper_points += 15
                        anomalies.append(
                            {
                                "id": f"anom_offpage_p{p_idx+1}_{len(anomalies)}",
                                "page": p_idx + 1,
                                "type": "OFFPAGE_HIDDEN_TEXT",
                                "title": f"Off-Page Hidden Text Detected (p.{p_idx+1})",
                                "description": f"Text string '{s_txt[:45]}' placed outside visible page boundaries.",
                                "bbox": [round(max(0, min(pw - 20, s_bbox[0])), 1), round(max(0, min(ph - 15, s_bbox[1])), 1), round(max(20, min(pw, s_bbox[2])), 1), round(max(15, min(ph, s_bbox[3])), 1)],
                                "severity": "MEDIUM",
                            }
                        )
                elif s_size < 1.5 and len(s_txt) >= 2:
                    tamper_points += 15
                    anomalies.append(
                        {
                            "id": f"anom_micro_p{p_idx+1}_{len(anomalies)}",
                            "page": p_idx + 1,
                            "type": "MICRO_STEALTH_TEXT",
                            "title": f"Microscopic {round(s_size, 2)}pt Stealth Text (p.{p_idx+1})",
                            "description": f"Invisible sub-2pt text embedded on page: '{s_txt[:45]}'",
                            "bbox": [round(s_bbox[0], 1), round(s_bbox[1], 1), round(s_bbox[2], 1), round(s_bbox[3], 1)],
                            "severity": "MEDIUM",
                        }
                    )
                elif sr >= 248 and sg >= 248 and sb_c >= 248 and len(s_txt) >= 2 and (flags & 0x01) == 0:
                    # Only flag pure white text if not simply overlapping colored banner headers
                    # Check if a dark colored box sits right behind it
                    has_dark_bg = False
                    for d in drawings:
                        df = d.get("fill")
                        dr = d.get("rect")
                        if dr and df is not None:
                            drect = fitz.Rect(dr)
                            if drect.intersects(s_rect):
                                if isinstance(df, (list, tuple)) and len(df) >= 3 and any(float(c) < 0.78 for c in df[:3]):
                                    has_dark_bg = True
                                    break
                                elif isinstance(df, (int, float)) and float(df) < 0.78:
                                    has_dark_bg = True
                                    break
                    if not has_dark_bg and not has_bg_scan:
                        tamper_points += 20
                        anomalies.append(
                            {
                                "id": f"anom_white_txt_p{p_idx+1}_{len(anomalies)}",
                                "page": p_idx + 1,
                                "type": "WHITE_ON_WHITE_TEXT",
                                "title": f"White-on-White Hidden Text (p.{p_idx+1})",
                                "description": f"White ink text (#{sr:02X}{sg:02X}{sb_c:02X}) without dark header backdrop: '{s_txt[:50]}'",
                                "bbox": [round(s_bbox[0], 1), round(s_bbox[1], 1), round(s_bbox[2], 1), round(s_bbox[3], 1)],
                                "severity": "HIGH",
                            }
                        )

            # D. Spliced Secondary Images + Embedded Raster ELA Check (First 3 pages max for speed)
            if has_bg_scan and len(img_info_list) > 1:
                for info in img_info_list:
                    ibox = fitz.Rect(info["bbox"])
                    if ibox.width < pw * 0.8 and ibox.height < ph * 0.8 and (ibox.width * ibox.height) > 150:
                        tamper_points += 25
                        anomalies.append(
                            {
                                "id": f"anom_imgpatch_p{p_idx+1}_{len(anomalies)}",
                                "page": p_idx + 1,
                                "type": "SPLICED_IMAGE_LAYER",
                                "title": f"Overlaid Image Patch (p.{p_idx+1})",
                                "description": f"Secondary image ({round(ibox.width)}x{round(ibox.height)}pt) pasted on top of scan. Common in forged stamps, signatures, and altered balances.",
                                "bbox": [round(ibox.x0, 1), round(ibox.y0, 1), round(ibox.x1, 1), round(ibox.y1, 1)],
                                "severity": "HIGH",
                            }
                        )

            if p_idx < 3:
                # Generate ELA compression X-Ray on rasterized or primary scanned image of page
                try:
                    ela_target_rgb: Optional[np.ndarray] = None
                    target_rect = page_rect

                    # Prefer inspecting largest embedded scan image directly at native pixels if present
                    largest_img = None
                    largest_area = 0.0
                    for info in img_info_list:
                        ir = fitz.Rect(info["bbox"])
                        area = ir.width * ir.height
                        if area > pw * ph * 0.35 and area > largest_area and info.get("xref"):
                            largest_area = area
                            largest_img = info

                    if largest_img and largest_img.get("xref"):
                        img_dict = doc.extract_image(largest_img["xref"])
                        raw_img_bytes = img_dict.get("image")
                        if raw_img_bytes:
                            pil_em = Image.open(io.BytesIO(raw_img_bytes))
                            # Also inspect embedded image EXIF software metadata
                            exif_data = pil_em.getexif()
                            sw_tag = str(exif_data.get(305) or pil_em.info.get("Software") or "").strip()
                            if sw_tag and any(sp in sw_tag.lower() for sp in SUSPICIOUS_PRODUCERS):
                                tamper_points += 30
                                anomalies.append(
                                    {
                                        "id": f"anom_img_exif_p{p_idx+1}_{len(anomalies)}",
                                        "page": p_idx + 1,
                                        "type": "EMBEDDED_IMAGE_EXIF",
                                        "title": f"Photo Editor Tag Inside Embedded Image (p.{p_idx+1})",
                                        "description": f"Embedded image stream carries Software EXIF header: '{sw_tag}'.",
                                        "bbox": [round(fitz.Rect(largest_img["bbox"]).x0, 1), round(fitz.Rect(largest_img["bbox"]).y0, 1), round(fitz.Rect(largest_img["bbox"]).x1, 1), round(fitz.Rect(largest_img["bbox"]).y1, 1)],
                                        "severity": "HIGH",
                                    }
                                )
                            ela_target_rgb = np.asarray(pil_em.convert("RGB"))
                            target_rect = fitz.Rect(largest_img["bbox"])
                    elif p_idx == 0:
                        pix = page.get_pixmap(dpi=130, alpha=False)
                        ela_target_rgb = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)

                    if ela_target_rgb is not None and ela_target_rgb.shape[0] >= 64 and ela_target_rgb.shape[1] >= 64:
                        ela_bgr, hotspots, _ = _compute_ela_from_rgb_array(ela_target_rgb)
                        b64_ela = _encode_png_data_url(ela_bgr, is_bgr=True, max_dim=1100)
                        if b64_ela:
                            ela_previews[str(p_idx + 1)] = b64_ela
                        # Only report ELA splice boxes on scanned images (vector PDF renders naturally trigger sharp font edges in ELA)
                        if largest_img is not None:
                            for hs in hotspots[:4]:
                                nx0, ny0, nx1, ny1 = hs["norm_bbox"]
                                rx0 = target_rect.x0 + nx0 * target_rect.width
                                ry0 = target_rect.y0 + ny0 * target_rect.height
                                rx1 = target_rect.x0 + nx1 * target_rect.width
                                ry1 = target_rect.y0 + ny1 * target_rect.height
                                tamper_points += 20
                                anomalies.append(
                                    {
                                        "id": f"anom_ela_p{p_idx+1}_{len(anomalies)}",
                                        "page": p_idx + 1,
                                        "type": "ELA_SPLICE_HOTSPOT",
                                        "title": f"JPEG ELA Compression Anomaly (p.{p_idx+1})",
                                        "description": (
                                            f"Localized re-compression residual spike ({hs['peak_residual']} vs page baseline {hs['baseline_median']}). "
                                            "Indicates airbrushing, copy-paste splice, or retouched text inside the scan image."
                                        ),
                                        "bbox": [round(rx0, 1), round(ry0, 1), round(rx1, 1), round(ry1, 1)],
                                        "severity": "HIGH",
                                    }
                                )
                except Exception as ela_err:
                    logger.debug(f"[DocForensics] Non-fatal ELA skipped p.{p_idx+1}: {ela_err}")

            # E. Spliced Vector Text on Scanned Raster Document (Skip invisible OCR Tr=3 text)
            if has_bg_scan and spans_list:
                # Inspect raw dict spans for invisible OCR flag vs visible spliced vector text
                # In PyMuPDF, OCR layers typically use Tr=3 (which sets flags bit? actually check render_mode if needed via page.get_texttrace!)
                trace_invisible_rects: list[fitz.Rect] = []
                try:
                    for tr in page.get_texttrace():
                        if tr.get("type") == 3:
                            trace_invisible_rects.append(fitz.Rect(tr.get("bbox", [0, 0, 0, 0])))
                except Exception:
                    pass

                visible_vector_count = 0
                for s in spans_list:
                    s_text = (s.get("text") or "").strip()
                    s_rect = fitz.Rect(s.get("bbox", [0, 0, 0, 0]))
                    is_ocr_hidden = any((ir & s_rect).width > s_rect.width * 0.5 for ir in trace_invisible_rects)
                    if is_ocr_hidden:
                        continue
                    if len(s_text) > 1 and re.search(r"[\d\w]", s_text):
                        visible_vector_count += 1
                        if visible_vector_count <= 12:
                            tamper_points += 20
                            s_bbox = s.get("bbox", [0, 0, 0, 0])
                            anomalies.append(
                                {
                                    "id": f"anom_vectorscan_p{p_idx+1}_{len(anomalies)}",
                                    "page": p_idx + 1,
                                    "type": "SPLICED_VECTOR_ON_SCAN",
                                    "title": f"Spliced Text on Scan: '{s_text[:25]}'",
                                    "description": f"Visible vector font text '{s_text}' typed directly over scanned raster image.",
                                    "bbox": [round(s_bbox[0], 1), round(s_bbox[1], 1), round(s_bbox[2], 1), round(s_bbox[3], 1)],
                                    "severity": "CRITICAL",
                                }
                            )

            # F. Overwritten Text Collisions
            for i in range(len(spans_list)):
                r1 = fitz.Rect(spans_list[i].get("bbox", [0, 0, 0, 0]))
                t1 = (spans_list[i].get("text") or "").strip()
                for j in range(i + 1, min(i + 15, len(spans_list))):
                    r2 = fitz.Rect(spans_list[j].get("bbox", [0, 0, 0, 0]))
                    t2 = (spans_list[j].get("text") or "").strip()
                    inter = r1 & r2
                    if inter.width > 4 and inter.height > 4 and t1 != t2:
                        tamper_points += 25
                        anomalies.append(
                            {
                                "id": f"anom_collision_p{p_idx+1}_{len(anomalies)}",
                                "page": p_idx + 1,
                                "type": "OVERWRITTEN_TEXT_COLLISION",
                                "title": f"Overwritten Text Collision (p.{p_idx+1})",
                                "description": f"Text '{t2[:24]}' collides directly over underlying '{t1[:24]}'.",
                                "bbox": [round(inter.x0, 1), round(inter.y0, 1), round(inter.x1, 1), round(inter.y1, 1)],
                                "severity": "CRITICAL",
                            }
                        )

            # G. In-Line Font Family Splicing + Baseline Y-Jitter + Page-Dominant Numeric Outlier
            body_fonts = collections.Counter(s.get("font", "") for s in spans_list if len((s.get("text") or "").strip()) >= 3)
            page_dom_font = body_fonts.most_common(1)[0][0] if body_fonts else ""
            for b in blocks:
                if b.get("type") == 0:
                    for line in b.get("lines", []):
                        line_spans = [s for s in line.get("spans", []) if (s.get("text") or "").strip()]
                        if len(line_spans) < 2:
                            continue
                        line_fonts = collections.Counter(s.get("font", "") for s in line_spans)
                        dom_font, dom_cnt = line_fonts.most_common(1)[0]
                        y_bottoms = sorted(float(s["bbox"][3]) for s in line_spans if s.get("bbox"))
                        med_y1 = y_bottoms[len(y_bottoms) // 2] if y_bottoms else 0.0
                        sizes = sorted(float(s.get("size", 10) or 10) for s in line_spans)
                        med_sz = sizes[len(sizes) // 2] if sizes else 10.0

                        for s in line_spans:
                            s_font = s.get("font", "")
                            s_text = (s.get("text") or "").strip()
                            s_bbox = s.get("bbox", [0, 0, 0, 0])
                            s_size = float(s.get("size", 10) or 10)
                            has_num = bool(re.search(r"\d", s_text))

                            # Strip subset prefix (e.g. ABCDEF+ArialMT -> ArialMT) for clean family comparison
                            clean_sf = s_font.split("+", 1)[-1]
                            clean_dom = dom_font.split("+", 1)[-1]
                            clean_pg = page_dom_font.split("+", 1)[-1]

                            # 1) Font family discrepancy on numeric/financial fields
                            if has_num and clean_sf and clean_dom and clean_sf != clean_dom:
                                if dom_cnt >= 2 or (clean_pg and clean_sf != clean_pg):
                                    # Avoid false positive on normal Bold header/label when whole bold span is same family
                                    base_sf = re.sub(r"[-,](Bold|Italic|Oblique|Regular|Medium|Light).*$", "", clean_sf, flags=re.I)
                                    base_dom = re.sub(r"[-,](Bold|Italic|Oblique|Regular|Medium|Light).*$", "", clean_dom, flags=re.I)
                                    if base_sf.lower() != base_dom.lower():
                                        tamper_points += 18
                                        anomalies.append(
                                            {
                                                "id": f"anom_font_p{p_idx+1}_{len(anomalies)}",
                                                "page": p_idx + 1,
                                                "type": "FONT_MISMATCH_ANOMALY",
                                                "title": f"In-Line Font Splicing on '{s_text[:20]}'",
                                                "description": f"Numeric/date field '{s_text}' uses alien font '{clean_sf}' while line uses '{clean_dom}'.",
                                                "bbox": [round(s_bbox[0], 1), round(s_bbox[1], 1), round(s_bbox[2], 1), round(s_bbox[3], 1)],
                                                "severity": "HIGH",
                                            }
                                        )

                            # 2) Baseline Y-jitter check (manual copy-paste text misalignment)
                            y_diff = abs(float(s_bbox[3]) - med_y1)
                            if (
                                len(line_spans) >= 3
                                and len(s_text) >= 2
                                and re.search(r"\d{2,}", s_text)
                                and y_diff > 1.6
                                and abs(s_size - med_sz) < 1.5
                            ):
                                tamper_points += 14
                                anomalies.append(
                                    {
                                        "id": f"anom_jitter_p{p_idx+1}_{len(anomalies)}",
                                        "page": p_idx + 1,
                                        "type": "BASELINE_ALIGNMENT_DRIFT",
                                        "title": f"Misaligned Number Baseline '{s_text[:18]}' (p.{p_idx+1})",
                                        "description": f"Field '{s_text}' is vertically offset by {y_diff:.1f}pt relative to surrounding row baseline — hallmark of manual overlay replacement.",
                                        "bbox": [round(s_bbox[0], 1), round(s_bbox[1], 1), round(s_bbox[2], 1), round(s_bbox[3], 1)],
                                        "severity": "MEDIUM",
                                    }
                                )

        final_score = min(100, tamper_points)
        if final_score >= 60:
            risk_level = "CRITICAL"
            verdict = "High probability of digital document tampering or artificial content substitution."
        elif final_score >= 35:
            risk_level = "HIGH"
            verdict = "Significant forensic anomalies detected. Independent source verification strongly advised."
        elif final_score >= 15:
            risk_level = "MEDIUM"
            verdict = "Moderate metadata, font, or alignment anomalies detected."
        else:
            risk_level = "LOW"
            verdict = "Document passes multi-layer vector, whiteout, revision, and ELA structural audits cleanly."

        return {
            "success": True,
            "input_kind": "pdf",
            "filename": filename or "Document.pdf",
            "tamper_score": final_score,
            "risk_level": risk_level,
            "verdict": verdict,
            "metadata_audit": meta_audit,
            "total_anomalies": len(anomalies),
            "anomalies": anomalies,
            "ela_previews": ela_previews,
        }
    finally:
        doc.close()


def _analyze_image_forensics(raw_bytes: bytes, filename: str, file_sha256: str) -> dict[str, Any]:
    """Forensic audit for uploaded JPG/PNG/WebP screenshots or WhatsApp scans."""
    pil_img = Image.open(io.BytesIO(raw_bytes))
    orig_w, orig_h = pil_img.size
    rgb_img = np.asarray(pil_img.convert("RGB"))
    anomalies: list[dict[str, Any]] = []
    tamper_points = 0

    exif = pil_img.getexif()
    exif_readable: dict[str, str] = {}
    for k, v in exif.items():
        tag_name = ExifTags.TAGS.get(k, str(k))
        exif_readable[tag_name] = str(v)[:100]

    software = str(exif_readable.get("Software") or pil_img.info.get("Software") or pil_img.info.get("Creator") or "").strip()
    camera_make = str(exif_readable.get("Make") or "").strip()
    camera_model = str(exif_readable.get("Model") or "").strip()
    mod_dt = str(exif_readable.get("DateTime") or "").strip()
    orig_dt = str(exif_readable.get("DateTimeOriginal") or "").strip()

    suspicious_sw = None
    for sp in SUSPICIOUS_PRODUCERS:
        if sp in software.lower():
            suspicious_sw = sp.title()
            break

    # Also check raw bytes for embedded Adobe XMP edit history
    has_xmp_ps = b"Adobe Photoshop" in raw_bytes or b"xmpMM:History" in raw_bytes or b"Canva" in raw_bytes
    if not suspicious_sw and has_xmp_ps:
        if b"Canva" in raw_bytes:
            suspicious_sw = "Canva"
        elif b"Photoshop" in raw_bytes:
            suspicious_sw = "Adobe Photoshop"
        else:
            suspicious_sw = "XMP Editor History"

    meta_audit = {
        "producer": software or (f"{camera_make} {camera_model}".strip() or "No EXIF Software Tag"),
        "creator": f"{camera_make} {camera_model}".strip() or f"Image ({orig_w}x{orig_h}px)",
        "creation_date": orig_dt or "Stripped / Unknown",
        "mod_date": mod_dt or "Unknown",
        "is_encrypted": False,
        "is_repaired": False,
        "page_count": 1,
        "file_sha256": file_sha256,
        "software_warning": None,
        "revision_warning": None,
        "signature_warning": None,
        "recovered_hidden_count": 0,
    }

    if suspicious_sw:
        tamper_points += 35
        sw_msg = f"Image carries editing tool trace ({suspicious_sw}). Photographic receipts/slips modified in design editors frequently have altered figures."
        meta_audit["software_warning"] = sw_msg
        anomalies.append(
            {
                "id": "anom_img_editor",
                "page": 0,
                "type": "GRAPHIC_EDITOR_EXIF",
                "title": f"Photo Editor Footprint: {suspicious_sw}",
                "description": sw_msg,
                "bbox": None,
                "severity": "CRITICAL",
            }
        )

    ela_bgr, hotspots, ela_std = _compute_ela_from_rgb_array(rgb_img)
    ela_preview_b64 = _encode_png_data_url(ela_bgr, is_bgr=True, max_dim=1200)
    orig_preview_b64 = _encode_png_data_url(cv2.cvtColor(rgb_img, cv2.COLOR_RGB2BGR), is_bgr=True, max_dim=1200)

    for hs in hotspots:
        nx0, ny0, nx1, ny1 = hs["norm_bbox"]
        tamper_points += 24
        anomalies.append(
            {
                "id": f"anom_img_ela_{len(anomalies)}",
                "page": 1,
                "type": "ELA_SPLICE_HOTSPOT",
                "title": "ELA Re-Compression Splice Zone",
                "description": (
                    f"Abnormal error-level peak ({hs['peak_residual']} vs median {hs['baseline_median']}). "
                    "Consistent with pasted digits, cloned textures, or brush whiteout edits."
                ),
                "bbox": [round(nx0 * orig_w, 1), round(ny0 * orig_h, 1), round(nx1 * orig_w, 1), round(ny1 * orig_h, 1)],
                "severity": "CRITICAL" if hs["peak_residual"] > hs["baseline_median"] * 3.5 else "HIGH",
            }
        )

    final_score = min(100, tamper_points)
    risk_level = "CRITICAL" if final_score >= 60 else "HIGH" if final_score >= 35 else "MEDIUM" if final_score >= 15 else "LOW"
    verdict = (
        "Strong pixel-level compression mismatch or editing tool trace found in image scan."
        if final_score >= 35
        else f"Image compression grid appears uniform (ELA variance {ela_std})."
    )

    return {
        "success": True,
        "input_kind": "image",
        "filename": filename,
        "image_width": orig_w,
        "image_height": orig_h,
        "image_preview": orig_preview_b64,
        "tamper_score": final_score,
        "risk_level": risk_level,
        "verdict": verdict,
        "metadata_audit": meta_audit,
        "total_anomalies": len(anomalies),
        "anomalies": anomalies,
        "ela_previews": {"1": ela_preview_b64} if ela_preview_b64 else {},
    }


# ─── 2. TrueVector 4K™ Deep Engine (Shadow Removal + Cubic Bezier Vectorizer) ──

def _normalize_illumination_bgr(
    bgr: np.ndarray,
    shadow_strength: float = 0.85,
) -> np.ndarray:
    """
    Estimate smooth uneven paper illumination / camera shadows via morphological closing
    in LAB L-channel and divide out shadow gradients without erasing pen ink.
    """
    h, w = bgr.shape[:2]
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    l_chan, a_chan, b_chan = cv2.split(lab)

    small_w = max(32, w // 4)
    small_h = max(32, h // 4)
    small_l = cv2.resize(l_chan, (small_w, small_h), interpolation=cv2.INTER_AREA)
    k_sz = max(15, (min(small_w, small_h) // 16) | 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_sz, k_sz))
    bg_small = cv2.morphologyEx(small_l, cv2.MORPH_CLOSE, kernel)
    bg_small = cv2.GaussianBlur(bg_small, (0, 0), sigmaX=max(3.0, k_sz * 0.35))
    bg_full = cv2.resize(bg_small, (w, h), interpolation=cv2.INTER_LINEAR).astype(np.float32)

    ratio_l = np.clip((l_chan.astype(np.float32) / np.maximum(bg_full, 24.0)) * 255.0, 0.0, 255.0)
    blended_l = (
        (1.0 - shadow_strength) * l_chan.astype(np.float32) + shadow_strength * ratio_l
    ).clip(0, 255).astype(np.uint8)

    merged_lab = cv2.merge([blended_l, a_chan, b_chan])
    return cv2.cvtColor(merged_lab, cv2.COLOR_LAB2BGR)


def _enhance_scan_page_bgr(
    bgr: np.ndarray,
    color_mode: str = "color",
    sharpness: float = 1.6,
    paper_whitening: int = 212,
    ink_darkness: int = 75,
    color_vibrance: int = 130,
    shadow_removal: int = 85,
) -> np.ndarray:
    """
    4K adaptive illumination normalization + bilateral denoising + authentic chroma preservation.
    """
    norm_bgr = _normalize_illumination_bgr(bgr, shadow_strength=max(0.0, min(1.0, shadow_removal / 100.0)))
    # Fast edge-preserving bilateral filter eliminates JPEG mosquito noise without blurring strokes
    denoised = cv2.bilateralFilter(norm_bgr, d=5, sigmaColor=24, sigmaSpace=24)

    # Unsharp-mask edge accutance
    blur = cv2.GaussianBlur(denoised, (0, 0), sigmaX=1.25)
    sharpened = cv2.addWeighted(denoised, 1.0 + (sharpness - 1.0) * 0.85, blur, -(sharpness - 1.0) * 0.85, 0)

    b_c, g_c, r_c = cv2.split(sharpened)
    lum = (0.299 * r_c.astype(np.float32) + 0.587 * g_c.astype(np.float32) + 0.114 * b_c.astype(np.float32))
    max_c = np.maximum(np.maximum(r_c, g_c), b_c).astype(np.float32)
    min_c = np.minimum(np.minimum(r_c, g_c), b_c).astype(np.float32)
    chroma = max_c - min_c

    thresh = float(max(130, min(245, paper_whitening)))
    ink_factor = float(max(0.35, min(1.0, ink_darkness / 100.0)))

    if color_mode == "bw":
        paper_mask = lum >= thresh
        norm_ink = np.clip(lum / thresh, 0.0, 1.0)
        ink_vals = np.clip(np.power(norm_ink, 1.38) * ink_factor * 255.0, 0.0, 255.0)
        out_gray = np.where(paper_mask, 255.0, ink_vals).astype(np.uint8)
        return cv2.cvtColor(out_gray, cv2.COLOR_GRAY2BGR)

    # Vivid Color mode: spotless white paper + crisp dark text + vivid blue/red/green ink & stamps
    vib = float(max(0.8, min(2.0, color_vibrance / 100.0)))
    paper_mask = (lum >= thresh) & (chroma < 26.0)
    neutral_ink_mask = (~paper_mask) & (chroma < 16.0)
    color_ink_mask = (~paper_mask) & (~neutral_ink_mask)

    norm_ink = np.clip(lum / thresh, 0.0, 1.0)
    dark_val = np.clip(np.power(norm_ink, 1.32) * ink_factor * 255.0, 0.0, 255.0)

    out_b = b_c.astype(np.float32)
    out_g = g_c.astype(np.float32)
    out_r = r_c.astype(np.float32)

    out_b = np.where(paper_mask, 255.0, out_b)
    out_g = np.where(paper_mask, 255.0, out_g)
    out_r = np.where(paper_mask, 255.0, out_r)

    out_b = np.where(neutral_ink_mask, dark_val, out_b)
    out_g = np.where(neutral_ink_mask, dark_val, out_g)
    out_r = np.where(neutral_ink_mask, dark_val, out_r)

    # Boost colorful stamps, blue signatures, logos cleanly
    out_b = np.where(color_ink_mask, np.clip(lum + (out_b - lum) * vib, 0.0, 255.0), out_b)
    out_g = np.where(color_ink_mask, np.clip(lum + (out_g - lum) * vib, 0.0, 255.0), out_g)
    out_r = np.where(color_ink_mask, np.clip(lum + (out_r - lum) * vib, 0.0, 255.0), out_r)

    return cv2.merge([out_b.astype(np.uint8), out_g.astype(np.uint8), out_r.astype(np.uint8)])


def _poly_to_smooth_bezier_segments(pts: np.ndarray, tension: float = 0.22) -> list[tuple[str, Any]]:
    """
    Convert a closed polygon loop [(x, y), ...] into smooth Cubic Bezier / Line segments
    keeping sharp corners (cos < -0.15) angular while smoothing curves with Catmull-Rom tangents.
    """
    n = len(pts)
    if n < 3:
        return []
    segs: list[tuple[str, Any]] = [("M", (float(pts[0][0]), float(pts[0][1])))]

    # Pre-check corner sharpness at every vertex
    sharp = []
    for i in range(n):
        p_prev = pts[(i - 1) % n]
        p_curr = pts[i]
        p_next = pts[(i + 1) % n]
        v1 = p_curr - p_prev
        v2 = p_next - p_curr
        l1 = float(np.hypot(v1[0], v1[1])) + 1e-6
        l2 = float(np.hypot(v2[0], v2[1])) + 1e-6
        cos_a = float((v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2))
        sharp.append(cos_a < 0.28)  # > ~73 degree turn keeps crisp corner

    for i in range(n):
        p0 = pts[(i - 1) % n]
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n]

        dist = float(np.hypot(p2[0] - p1[0], p2[1] - p1[1]))
        if dist < 1.2 or (sharp[i] and sharp[(i + 1) % n] and dist > 12.0):
            segs.append(("L", (float(p2[0]), float(p2[1]))))
            continue

        # Catmull-Rom tangent handles clamped safely inside corner vertices
        t1 = (p2 - p0) * tension if not sharp[i] else (p2 - p1) * (tension * 0.45)
        t2 = (p3 - p1) * tension if not sharp[(i + 1) % n] else (p2 - p1) * (tension * 0.45)
        c1 = p1 + t1
        c2 = p2 - t2
        segs.append(
            (
                "C",
                (float(c1[0]), float(c1[1]), float(c2[0]), float(c2[1]), float(p2[0]), float(p2[1])),
            )
        )
    segs.append(("Z", None))
    return segs


def _vectorize_mask_to_layers(
    enhanced_bgr: np.ndarray,
    color_mode: str,
    target_w_pt: float,
    target_h_pt: float,
    max_paths: int = 16000,
) -> tuple[list[dict[str, Any]], int]:
    """
    Trace ink contours with RETR_CCOMP outer+hole hierarchy into smooth Bezier curves
    scaled to exact PDF points [0..target_w_pt, 0..target_h_pt].
    Separates neutral dark ink and primary chromatic ink clusters in color mode!
    """
    h, w = enhanced_bgr.shape[:2]
    sx = target_w_pt / float(max(1, w))
    sy = target_h_pt / float(max(1, h))

    b, g, r = cv2.split(enhanced_bgr)
    lum = (0.299 * r.astype(np.float32) + 0.587 * g.astype(np.float32) + 0.114 * b.astype(np.float32))
    max_c = np.maximum(np.maximum(r, g), b).astype(np.float32)
    min_c = np.minimum(np.minimum(r, g), b).astype(np.float32)
    chroma = max_c - min_c

    layers_spec: list[tuple[np.ndarray, tuple[float, float, float], str]] = []
    if color_mode == "bw":
        ink_mask = (lum < 210).astype(np.uint8) * 255
        layers_spec.append((ink_mask, (0.04, 0.04, 0.05), "#0a0a0d"))
    else:
        # Layer 1: Dark/neutral ink & CAD lines
        dark_mask = ((lum < 210) & (chroma < 32)).astype(np.uint8) * 255
        layers_spec.append((dark_mask, (0.04, 0.04, 0.05), "#0a0a0d"))
        # Layer 2: Blue / Cyan ink (ballpoint pens, blueprint lines)
        blue_mask = ((chroma >= 32) & (b.astype(np.int16) >= r.astype(np.int16) + 18)).astype(np.uint8) * 255
        if np.any(blue_mask):
            layers_spec.append((blue_mask, (0.06, 0.25, 0.72), "#0f40b8"))
        # Layer 3: Red / Orange / Magenta seals & rubber stamps
        red_mask = ((chroma >= 32) & (r.astype(np.int16) >= b.astype(np.int16) + 22) & (r.astype(np.int16) >= g.astype(np.int16) + 12)).astype(np.uint8) * 255
        if np.any(red_mask):
            layers_spec.append((red_mask, (0.76, 0.12, 0.15), "#c21f26"))
        # Layer 4: Green / remaining colored ink
        green_mask = ((chroma >= 32) & (dark_mask == 0) & (blue_mask == 0) & (red_mask == 0)).astype(np.uint8) * 255
        if np.any(green_mask):
            layers_spec.append((green_mask, (0.08, 0.48, 0.28), "#147a47"))

    compound_paths: list[dict[str, Any]] = []
    total_nodes = 0

    for mask, rgb_f, hex_col in layers_spec:
        if not np.any(mask):
            continue
        contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        if hierarchy is None or len(contours) == 0:
            continue
        hier = hierarchy[0]  # shape (N, 4): [next, prev, first_child, parent]

        for idx, cnt in enumerate(contours):
            if len(compound_paths) >= max_paths:
                break
            if hier[idx][3] != -1:
                continue  # Child hole: handled with its parent
            area = cv2.contourArea(cnt)
            if area < 4.5:
                continue

            subpaths: list[list[tuple[str, Any]]] = []
            approx = cv2.approxPolyDP(cnt, epsilon=1.05, closed=True)
            pts = approx.reshape(-1, 2).astype(np.float32)
            pts[:, 0] *= sx
            pts[:, 1] *= sy
            segs = _poly_to_smooth_bezier_segments(pts)
            if segs:
                subpaths.append(segs)
                total_nodes += len(pts)

            # Attach direct interior holes so glyphs ('O','A','8') cut cleanly with even-odd fill
            child_idx = int(hier[idx][2])
            while child_idx != -1:
                c_cnt = contours[child_idx]
                if cv2.contourArea(c_cnt) >= 2.5:
                    c_approx = cv2.approxPolyDP(c_cnt, epsilon=0.95, closed=True)
                    c_pts = c_approx.reshape(-1, 2).astype(np.float32)
                    c_pts[:, 0] *= sx
                    c_pts[:, 1] *= sy
                    c_segs = _poly_to_smooth_bezier_segments(c_pts)
                    if c_segs:
                        subpaths.append(c_segs)
                        total_nodes += len(c_pts)
                child_idx = int(hier[child_idx][0])

            if subpaths:
                compound_paths.append({"subpaths": subpaths, "rgb": rgb_f, "hex": hex_col})

    return compound_paths, total_nodes


def _build_svg_from_layers(
    compound_paths: list[dict[str, Any]],
    width_pt: float,
    height_pt: float,
) -> str:
    """Serialize mathematical Cubic Bezier subpaths into crisp W3C SVG 1.1 markup."""
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width_pt:.2f} {height_pt:.2f}" '
        f'width="{width_pt:.0f}" height="{height_pt:.0f}">',
        f'<rect width="100%" height="100%" fill="#ffffff" />',
    ]
    by_color: dict[str, list[str]] = collections.defaultdict(list)
    for item in compound_paths:
        d_tokens: list[str] = []
        for sp in item["subpaths"]:
            for cmd, args in sp:
                if cmd == "M":
                    d_tokens.append(f"M{args[0]:.2f} {args[1]:.2f}")
                elif cmd == "L":
                    d_tokens.append(f"L{args[0]:.2f} {args[1]:.2f}")
                elif cmd == "C":
                    d_tokens.append(
                        f"C{args[0]:.2f} {args[1]:.2f} {args[2]:.2f} {args[3]:.2f} {args[4]:.2f} {args[5]:.2f}"
                    )
                elif cmd == "Z":
                    d_tokens.append("Z")
        by_color[item["hex"]].append("".join(d_tokens))

    for hex_col, ds in by_color.items():
        # Combine paths of same color in compact path chunks for lightweight DOM
        combined_d = "".join(ds)
        parts.append(f'<path d="{combined_d}" fill="{hex_col}" fill-rule="evenodd" />')

    parts.append("</svg>")
    return "\n".join(parts)


def _draw_vector_layers_on_pdf_page(
    out_page: fitz.Page,
    compound_paths: list[dict[str, Any]],
) -> None:
    """Draw mathematical Bezier compound paths onto a PyMuPDF PDF page with even-odd winding holes."""
    for item in compound_paths:
        shape = out_page.new_shape()
        for sp in item["subpaths"]:
            curr_pt = None
            for cmd, args in sp:
                if cmd == "M":
                    curr_pt = fitz.Point(args[0], args[1])
                elif cmd == "L" and curr_pt is not None:
                    nxt = fitz.Point(args[0], args[1])
                    shape.draw_line(curr_pt, nxt)
                    curr_pt = nxt
                elif cmd == "C" and curr_pt is not None:
                    c1 = fitz.Point(args[0], args[1])
                    c2 = fitz.Point(args[2], args[3])
                    nxt = fitz.Point(args[4], args[5])
                    shape.draw_bezier(curr_pt, c1, c2, nxt)
                    curr_pt = nxt
        shape.finish(color=None, fill=item["rgb"], closePath=True, even_odd=True)
        shape.commit()


def process_true_vector_4k(
    raw_bytes: bytes,
    filename: str,
    mode: str = "adaptive_4k",
    color_mode: str = "color",
    sharpness: float = 1.6,
    paper_whitening: int = 212,
    ink_darkness: int = 75,
    color_vibrance: int = 130,
    shadow_removal: int = 85,
    dpi_target: int = 280,
    page_num: int = 1,
    include_ocr: bool = False,
    output_format: str = "json_bundle",
) -> dict[str, Any]:
    """
    Process a PDF or image through TrueVector 4K:
      - mode in ('adaptive_4k', 'true_vector', 'blueprint_cad', 'photocopy_bw')
      - If true_vector or blueprint_cad: traces crisp Cubic Bezier SVG & native vector PDF paths.
      - Always performs morphological shadow illumination normalization + bilateral denoiser.
      - Optional RapidOCR overlays an invisible selectable text layer inside the output PDF.
    """
    ext = os.path.splitext((filename or "").lower())[1]
    is_image = ext in IMAGE_EXTENSIONS or raw_bytes[:3] == b"\xff\xd8\xff" or raw_bytes[:8] == b"\x89PNG\r\n\x1a\n"

    src_pages_bgr: list[tuple[np.ndarray, float, float]] = []
    if is_image:
        pil = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
        bgr = cv2.cvtColor(np.asarray(pil), cv2.COLOR_RGB2BGR)
        w_pt = round(bgr.shape[1] * 72.0 / 150.0, 2)
        h_pt = round(bgr.shape[0] * 72.0 / 150.0, 2)
        # Upscale low-res phone snaps cleanly using Lanczos4 before enhancement
        scale_up = min(3.0, max(1.0, 2000.0 / float(max(bgr.shape[0], bgr.shape[1], 1))))
        if scale_up > 1.05:
            bgr = cv2.resize(
                bgr,
                (int(round(bgr.shape[1] * scale_up)), int(round(bgr.shape[0] * scale_up))),
                interpolation=cv2.INTER_LANCZOS4,
            )
        src_pages_bgr.append((bgr, w_pt, h_pt))
    else:
        src_doc = fitz.open(stream=raw_bytes, filetype="pdf")
        try:
            total_p = len(src_doc)
            if page_num <= 0:
                target_indices = list(range(min(total_p, 20)))  # Safety cap for all-page sync export
            else:
                idx = max(0, min(total_p - 1, page_num - 1))
                target_indices = [idx]

            eff_dpi = max(140, min(320, int(dpi_target)))
            for p_idx in target_indices:
                pg = src_doc[p_idx]
                pix = pg.get_pixmap(dpi=eff_dpi, alpha=False)
                bgr = cv2.cvtColor(
                    np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n),
                    cv2.COLOR_RGB2BGR,
                )
                src_pages_bgr.append((bgr, float(pg.rect.width), float(pg.rect.height)))
        finally:
            src_doc.close()

    is_vector_trace_mode = mode in ("true_vector", "blueprint_cad")
    out_doc = fitz.open()
    first_svg = ""
    first_orig_preview = ""
    first_enh_preview = ""
    total_vector_paths = 0
    total_bezier_nodes = 0
    total_ocr_words = 0

    ocr_engine = None
    if include_ocr:
        try:
            from ocr_engine import get_rapidocr
            ocr_engine = get_rapidocr()
        except Exception as e:
            logger.warning(f"[TrueVector4K] RapidOCR unavailable: {e}")

    for loop_i, (orig_bgr, w_pt, h_pt) in enumerate(src_pages_bgr):
        eff_color = "bw" if mode == "photocopy_bw" else color_mode
        enh_bgr = _enhance_scan_page_bgr(
            orig_bgr,
            color_mode=eff_color,
            sharpness=sharpness,
            paper_whitening=paper_whitening,
            ink_darkness=ink_darkness,
            color_vibrance=color_vibrance,
            shadow_removal=shadow_removal,
        )

        out_page = out_doc.new_page(width=w_pt, height=h_pt)

        if is_vector_trace_mode:
            compound_paths, n_nodes = _vectorize_mask_to_layers(enh_bgr, eff_color, w_pt, h_pt)
            total_vector_paths += len(compound_paths)
            total_bezier_nodes += n_nodes
            if compound_paths:
                _draw_vector_layers_on_pdf_page(out_page, compound_paths)
                if loop_i == 0:
                    first_svg = _build_svg_from_layers(compound_paths, w_pt, h_pt)
            else:
                # Empty blank page fallback
                ok_enc, jpg_buf = cv2.imencode(".jpg", enh_bgr, [cv2.IMWRITE_JPEG_QUALITY, 94])
                if ok_enc:
                    out_page.insert_image(out_page.rect, stream=jpg_buf.tobytes())
        else:
            ok_enc, jpg_buf = cv2.imencode(".jpg", enh_bgr, [cv2.IMWRITE_JPEG_QUALITY, 94])
            if ok_enc:
                out_page.insert_image(out_page.rect, stream=jpg_buf.tobytes())

        # Optional invisible searchable OCR overlay (render_mode=3)
        if ocr_engine is not None:
            try:
                res, _ = ocr_engine(enh_bgr, use_cls=False)
                sx = w_pt / float(max(1, enh_bgr.shape[1]))
                sy = h_pt / float(max(1, enh_bgr.shape[0]))
                for item in res or []:
                    if not item or len(item) < 3:
                        continue
                    quad, txt, score = item[0], str(item[1] or "").strip(), float(item[2] or 0.0)
                    txt = re.sub(r"[\u3400-\u9FFF\uF900-\uFAFF\u3000-\u303F]+", "", txt).strip()
                    if not txt or score < 0.30 or len(quad) != 4:
                        continue
                    xs = [float(p[0]) * sx for p in quad]
                    ys = [float(p[1]) * sy for p in quad]
                    x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
                    font_sz = max(5.0, min(72.0, (y1 - y0) * 0.85))
                    # Clamp to printable Latin/ASCII or unicode-safe Helvetica fallback
                    safe_txt = txt.encode("latin-1", "replace").decode("latin-1")
                    out_page.insert_text(
                        fitz.Point(x0, y1 - max(1.0, (y1 - y0) * 0.12)),
                        safe_txt,
                        fontsize=font_sz,
                        fontname="helv",
                        render_mode=3,
                    )
                    total_ocr_words += len(safe_txt.split())
            except Exception as ocr_err:
                logger.warning(f"[TrueVector4K] OCR text layer warning: {ocr_err}")

        if loop_i == 0:
            first_orig_preview = _encode_png_data_url(orig_bgr, is_bgr=True, max_dim=1150)
            if not is_vector_trace_mode:
                first_enh_preview = _encode_png_data_url(enh_bgr, is_bgr=True, max_dim=1150)
            else:
                # Render actual native vector PDF output to preview so UI displays true vector crispness!
                vec_pix = out_page.get_pixmap(dpi=165, alpha=False)
                vec_bgr = cv2.cvtColor(
                    np.frombuffer(vec_pix.samples, dtype=np.uint8).reshape(vec_pix.height, vec_pix.width, vec_pix.n),
                    cv2.COLOR_RGB2BGR,
                )
                first_enh_preview = _encode_png_data_url(vec_bgr, is_bgr=True, max_dim=1250)

    pdf_bytes = out_doc.tobytes(garbage=4, deflate=True)
    out_doc.close()

    if output_format == "svg":
        if not first_svg and src_pages_bgr:
            cp, nn = _vectorize_mask_to_layers(
                _enhance_scan_page_bgr(src_pages_bgr[0][0], color_mode=color_mode),
                color_mode,
                src_pages_bgr[0][1],
                src_pages_bgr[0][2],
            )
            first_svg = _build_svg_from_layers(cp, src_pages_bgr[0][1], src_pages_bgr[0][2])
            total_vector_paths = len(cp)
            total_bezier_nodes = nn
        return {
            "content_type": "image/svg+xml",
            "bytes": first_svg.encode("utf-8"),
            "path_count": total_vector_paths,
            "bezier_nodes": total_bezier_nodes,
        }

    if output_format == "pdf":
        return {
            "content_type": "application/pdf",
            "bytes": pdf_bytes,
            "path_count": total_vector_paths,
            "bezier_nodes": total_bezier_nodes,
            "ocr_words": total_ocr_words,
        }

    return {
        "success": True,
        "is_true_vector": is_vector_trace_mode,
        "dpi": dpi_target,
        "path_count": total_vector_paths,
        "bezier_nodes": total_bezier_nodes,
        "ocr_words": total_ocr_words,
        "original_preview": first_orig_preview,
        "enhanced_preview": first_enh_preview,
        "svg_markup": first_svg,
        "pdf_b64": base64.b64encode(pdf_bytes).decode("ascii"),
    }


# ─── 3. Contract Trap Redliner™ Deep Engine ───────────────────────────────────

CONTRACT_TRAP_RULES: list[dict[str, Any]] = [
    {
        "category": "Unilateral Auto-Renewal & Silent Lock-In",
        "severity": "CRITICAL",
        "regex": re.compile(
            r"(auto[- ]?renew(?:al|s)?|automatically\s*renew(?:ed)?|deemed\s*renewed|successive\s*(?:annual|12[- ]month)\s*terms|prior\s+written\s+notice\s+of\s+at\s+least\s+(?:30|45|60|90)\s+days)",
            re.IGNORECASE,
        ),
        "why_dangerous": "Silently locks you into another multi-month or annual term unless you remember to send formal notice 30-90 days ahead.",
        "counter_proposal": 'Replace with: "Upon expiration of the Initial Term, this Agreement shall convert to month-to-month or renew only upon mutual written confirmation."',
    },
    {
        "category": "Unlimited Indemnity & Consequential Liability",
        "severity": "CRITICAL",
        "regex": re.compile(
            r"(indemnif(?:y|ies)\s+and\s+hold\s+harmless|defend,\s+indemnify|unlimited\s+liability|shall\s+not\s+be\s+limited\s+to\s+fees|indirect,\s+incidental,?\s+(?:special|or)?\s*consequential\s+damages)",
            re.IGNORECASE,
        ),
        "why_dangerous": "Exposes your personal assets or business to uncapped legal claims and consequential losses vastly higher than your fee.",
        "counter_proposal": 'Add cap: "Either party\'s aggregate liability shall strictly be capped at fees actually paid in the preceding 6 months, excluding consequential damages."',
    },
    {
        "category": "Restraint of Trade & Non-Compete Bar",
        "severity": "HIGH",
        "regex": re.compile(
            r"(shall\s+not\s+(?:directly\s+or\s+indirectly\s+)?(?:compete|engage\s+in\s+(?:any\s+)?similar\s+business|solicit|work\s+for\s+any\s+competitor)|non[- ]compete(?:\s+period)?|cooling[- ]off\s+period\s+of\s+(?:6|12|24|36)\s+months)",
            re.IGNORECASE,
        ),
        "why_dangerous": "Restricts you from earning a livelihood in your industry for 6-36 months after exit (frequently unenforceable under Sec. 27 Indian Contract Act, yet used to intimidate).",
        "counter_proposal": 'Delete post-employment non-compete entirely and restrict only to direct misuse of documented confidential trade secrets.',
    },
    {
        "category": "One-Sided Termination Without Cause",
        "severity": "HIGH",
        "regex": re.compile(
            r"(terminate\s+(?:this\s+agreement\s+)?at\s+any\s+time\s+without\s+(?:assigning\s+any\s+)?(?:cause|reason)|sole\s+(?:and\s+absolute\s+)?discretion\s+(?:to\s+)?terminate|terminate\s+immediately\s+without\s+notice)",
            re.IGNORECASE,
        ),
        "why_dangerous": "Gives only the issuer instant no-notice termination while still binding you to rigid notice or lock-in clauses.",
        "counter_proposal": 'Propose parity: "Either party may terminate without cause by providing 30 days\' mutual written notice, with pro-rata payment for work completed."',
    },
    {
        "category": "Employment / Training Bond & Salary Clawback",
        "severity": "CRITICAL",
        "regex": re.compile(
            r"(minimum\s+service\s+period|employment\s+bond|training\s+(?:cost|bond|expenses)\s+of|liable\s+to\s+pay\s+(?:rupees|rs\.?|inr|usd|\$)|forfeit\s+(?:all\s+)?(?:pending\s+)?salary|bond\s+amount\s+of)",
            re.IGNORECASE,
        ),
        "why_dangerous": "Imposes punitive exit penalties or salary forfeiture if you resign before an arbitrary lock-in period.",
        "counter_proposal": 'Propose: "Any training reimbursement applies strictly to verified external third-party certifications and amortizes monthly on a pro-rata basis."',
    },
    {
        "category": "Background / Pre-Existing IP & Moral Rights Grab",
        "severity": "CRITICAL",
        "regex": re.compile(
            r"(waives?\s+all\s+moral\s+rights|irrevocably\s+assigns\s+all\s+(?:right|title|intellectual\s+property)|work\s+made\s+for\s+hire|all\s+inventions.*(?:conceived|developed).*during\s+and\s+(?:before|prior))",
            re.IGNORECASE,
        ),
        "why_dangerous": "Could claim company ownership over personal side-projects, open-source libraries, or reusable tools you built before signing.",
        "counter_proposal": 'Carve out Background IP: "All Pre-Existing IP, open-source tools, and off-hours personal work unrelated to Company business remain the sole property of Contractor/Employee."',
    },
    {
        "category": "Hostile Exclusive Jurisdiction & Unilateral Arbitrator",
        "severity": "MEDIUM",
        "regex": re.compile(
            r"(exclusive\s+jurisdiction\s+of\s+(?:the\s+)?courts\s+(?:at|in|of)\s+[a-z\s]+|sole\s+arbitrator\s+to\s+be\s+(?:nominated|appointed)\s+(?:solely\s+)?by\s+(?:the\s+)?(?:company|lender|lessor)|exclusive\s+venue)",
            re.IGNORECASE,
        ),
        "why_dangerous": "Forces expensive litigation in a distant city or lets the stronger party hand-pick the arbitrator.",
        "counter_proposal": 'Require neutral seat: "Arbitration shall be conducted by a mutually agreed sole arbitrator via virtual hearing or local jurisdiction."',
    },
    {
        "category": "Salary Withholding / Unilateral Set-Off / Deductions",
        "severity": "HIGH",
        "regex": re.compile(
            r"(right\s+to\s+(?:withhold|deduct|set[- ]off)|withhold\s+(?:full\s+and\s+final|salary|dues|payouts)|deduct\s+from\s+(?:any\s+)?(?:salary|remuneration|invoice))",
            re.IGNORECASE,
        ),
        "why_dangerous": "Allows the counter-party to freeze your paycheck or invoices unilaterally over subjective disputes.",
        "counter_proposal": 'Restrict deductions: "Undisputed compensation cannot be withheld; any deduction requires mutual written itemization or judicial order."',
    },
    {
        "category": "Extreme Penalties & Punitive Interest",
        "severity": "HIGH",
        "regex": re.compile(
            r"(liquidated\s+damages\s+of|penalty\s+of\s+(?:rs|inr|\$|10|15|18|24|36)|interest\s+(?:at\s+the\s+rate\s+of|@)\s*(?:18|21|24|30|36)%)",
            re.IGNORECASE,
        ),
        "why_dangerous": "Punitive delay fines or 18%-36% annualized compounding interest can rapidly surpass the principal sum.",
        "counter_proposal": 'Insert cure window: "Late fees are capped at 1% per month after a 10-business-day written cure notice."',
    },
    {
        "category": "Unilateral Modification Without Consent",
        "severity": "MEDIUM",
        "regex": re.compile(
            r"(reserve(?:s)?\s+the\s+right\s+to\s+(?:amend|modify|alter|update)\s+(?:any\s+)?terms|terms\s+may\s+be\s+(?:modified|updated)\s+from\s+time\s+to\s+time|without\s+prior\s+written\s+consent)",
            re.IGNORECASE,
        ),
        "why_dangerous": "Lets the issuing party change commissions, targets, rent rules, or policy terms overnight without your signature.",
        "counter_proposal": 'Insert amendment lock: "No amendment or modification of these terms shall bind either party unless signed in writing by both parties."',
    },
    {
        "category": "Security Deposit Forfeiture & Steep Rent Escalation",
        "severity": "HIGH",
        "regex": re.compile(
            r"(forfeit\s*(?:all\s*|the\s*)?security\s*deposit|non[- ]?refundable\s*deposit|(?:annual|yearly)\s+(?:rent\s+)?(?:escalation|increase)\s+of\s+(?:10|12|15|20)%)",
            re.IGNORECASE,
        ),
        "why_dangerous": "Allows landlord to seize security deposits over minor wear-and-tear or locks in steep 10-20% yearly rent hikes.",
        "counter_proposal": 'Clarify: "Security deposit shall be refunded on handover minus documented structural repairs beyond normal wear-and-tear; escalation capped at 5% annually."',
    },
    {
        "category": "Device Surveillance & Invasive Monitoring",
        "severity": "HIGH",
        "regex": re.compile(
            r"(monitor\s+(?:all\s+)?(?:personal\s+)?(?:devices|communications|keystrokes|screenshots|webcam|location)|no\s+expectation\s+of\s+privacy)",
            re.IGNORECASE,
        ),
        "why_dangerous": "Permits invasive spyware or webcam/location tracking even on personal phones or laptops.",
        "counter_proposal": 'Limit scope: "Monitoring applies strictly to company-owned hardware and corporate email accounts during official working hours."',
    },
    {
        "category": "Perpetual Confidentiality (No Standard Exclusions)",
        "severity": "MEDIUM",
        "regex": re.compile(
            r"(confidentiality\s+obligations?\s+shall\s+(?:survive\s+)?(?:in\s+perpetuity|forever|indefinitely))",
            re.IGNORECASE,
        ),
        "why_dangerous": "Binds you forever with zero expiry date even when information becomes public knowledge.",
        "counter_proposal": 'Cap duration: "Confidentiality survives for 3 years post-termination and excludes information that enters the public domain lawfully."',
    },
    {
        "category": "Waiver of Statutory / Jury / Class Action Rights",
        "severity": "MEDIUM",
        "regex": re.compile(
            r"(irrevocably\s+waives?\s+(?:any\s+)?(?:right\s+to\s+)?(?:jury|class\s+action|statutory|appeal)|waive\s+all\s+claims\s+against)",
            re.IGNORECASE,
        ),
        "why_dangerous": "Forces you to sign away statutory employee/consumer remedies and collective legal recourse.",
        "counter_proposal": 'Strike blanket statutory waivers: "Nothing herein waives mandatory non-waivable statutory protections under applicable law."',
    },
]


def _check_missing_safeguards(full_doc_text: str) -> list[dict[str, Any]]:
    """Detect protective legal clauses that SHOULD appear in a fair agreement but are absent."""
    missing: list[dict[str, Any]] = []
    lower = full_doc_text.lower()
    if len(lower) < 250:
        return missing

    if not re.search(r"(limit(?:ation)?\s+of\s+liability|aggregate\s+liability|liability\s+shall\s+not\s+exceed)", lower):
        missing.append(
            {
                "id": "anom_missing_cap",
                "category": "Missing Liability Cap Shield",
                "severity": "HIGH",
                "clauseSnippet": "[Clause Missing Across Document] No limitation-of-liability cap detected.",
                "pageNumber": 1,
                "bbox": None,
                "whyDangerous": "Without a written liability cap, standard breach claims can expose you to uncapped financial damages.",
                "counterProposalTip": 'Insert: "Maximum cumulative liability of either party shall not exceed the total fees paid in the prior 6 months."',
            }
        )

    if not re.search(r"(cure\s+period|opportunity\s+to\s+cure|rectify\s+(?:such\s+)?breach\s+within\s+\d+\s+days)", lower):
        missing.append(
            {
                "id": "anom_missing_cure",
                "category": "Missing Breach Cure Grace Period",
                "severity": "MEDIUM",
                "clauseSnippet": "[Clause Missing Across Document] No cure/grace period before breach termination or penalty.",
                "pageNumber": 1,
                "bbox": None,
                "whyDangerous": "Without a 7-15 day written cure window, accidental delays can trigger instant default penalties.",
                "counterProposalTip": 'Insert: "Termination or liquidated damages for curable breach require 15 days prior written notice and failure to cure."',
            }
        )

    return missing


def _locate_clause_bbox(
    page: fitz.Page,
    snippet: str,
    ocr_words: Optional[list[dict[str, Any]]] = None,
) -> Optional[list[float]]:
    """Find best exact [x0, y0, x1, y1] bounding box on PDF page for a matched clause phrase."""
    clean = re.sub(r"\s+", " ", snippet or "").strip()
    if not clean:
        return None

    words = clean.split()
    # Try progressive anchor substrings via PyMuPDF native search_for
    for take in (min(6, len(words)), min(4, len(words)), min(3, len(words))):
        if take <= 0:
            continue
        query = " ".join(words[:take])
        if len(query) >= 6:
            hits = page.search_for(query)
            if hits:
                r = fitz.Rect(hits[0])
                # Expand slightly horizontally across the line for clear highlight
                return [round(r.x0, 1), round(r.y0, 1), round(min(page.rect.width - 15, r.x1 + 120), 1), round(r.y1, 1)]

    # Fallback on scanned agreements using OCR word coords
    if ocr_words:
        target = words[0].lower().strip(".,;:\"'()")
        for w in ocr_words:
            wt = w["text"].lower().strip(".,;:\"'()")
            if wt and target in wt:
                return [round(w["x0"], 1), round(w["y0"], 1), round(min(page.rect.width - 15, w["x1"] + 160), 1), round(w["y1"], 1)]

    return None


def analyze_contract_redline_deep(
    raw_bytes: bytes,
    filename: str,
    use_ai: bool = True,
    ai_quota_ok: bool = True,
) -> dict[str, Any]:
    """
    Audit digital OR scanned PDF contracts with 14+ comprehensive trap categories,
    numeric notice asymmetry detection, OCR stamp-paper support, exact PDF coordinates,
    and optional Gemini deep semantic clause detection.
    """
    doc = fitz.open(stream=raw_bytes, filetype="pdf")
    try:
        traps: list[dict[str, Any]] = []
        full_text_pages: list[tuple[int, str]] = []
        ocr_pages_count = 0
        ocr_engine = None
        seen_keys: set[tuple[int, str]] = set()

        for p_idx in range(min(len(doc), 60)):
            page = doc[p_idx]
            page_text = (page.get_text("text") or "").strip()
            page_ocr_words: list[dict[str, Any]] = []

            # Scanned stamp-paper / image PDF OCR fallback
            if len(page_text.split()) < 12 and len(page.get_images()) > 0:
                try:
                    if ocr_engine is None:
                        from ocr_engine import get_rapidocr
                        ocr_engine = get_rapidocr()
                    if ocr_engine is not None:
                        pix = page.get_pixmap(dpi=215, alpha=False)
                        bgr = cv2.cvtColor(
                            np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n),
                            cv2.COLOR_RGB2BGR,
                        )
                        res, _ = ocr_engine(bgr, use_cls=False)
                        sx = float(page.rect.width) / float(max(1, bgr.shape[1]))
                        sy = float(page.rect.height) / float(max(1, bgr.shape[0]))
                        lines_txt: list[str] = []
                        for item in res or []:
                            if not item or len(item) < 3:
                                continue
                            quad, txt, score = item[0], str(item[1] or "").strip(), float(item[2] or 0.0)
                            if not txt or score < 0.25 or len(quad) != 4:
                                continue
                            lines_txt.append(txt)
                            xs = [float(p[0]) * sx for p in quad]
                            ys = [float(p[1]) * sy for p in quad]
                            page_ocr_words.append({"text": txt, "x0": min(xs), "y0": min(ys), "x1": max(xs), "y1": max(ys)})
                        if lines_txt:
                            page_text = " ".join(lines_txt)
                            ocr_pages_count += 1
                except Exception as ocr_err:
                    logger.warning(f"[ContractRedline] OCR fallback warning p.{p_idx+1}: {ocr_err}")

            norm_page_text = re.sub(r"\s+", " ", page_text).strip()
            full_text_pages.append((p_idx + 1, norm_page_text))

            # Scan ALL matches per category per page (not just first single match!)
            for rule in CONTRACT_TRAP_RULES:
                for m in rule["regex"].finditer(norm_page_text):
                    start = max(0, m.start() - 55)
                    end = min(len(norm_page_text), m.end() + 145)
                    snippet = norm_page_text[start:end].strip()
                    dedup_key = (p_idx + 1, rule["category"] + "::" + m.group(0)[:24].lower())
                    if dedup_key in seen_keys:
                        continue
                    seen_keys.add(dedup_key)

                    bbox = _locate_clause_bbox(page, m.group(0), page_ocr_words)
                    traps.append(
                        {
                            "id": f"trap_p{p_idx+1}_{len(traps)}",
                            "category": rule["category"],
                            "severity": rule["severity"],
                            "clauseSnippet": f"...{snippet}...",
                            "matchedPhrase": m.group(0),
                            "pageNumber": p_idx + 1,
                            "bbox": bbox,
                            "whyDangerous": rule["why_dangerous"],
                            "counterProposalTip": rule["counter_proposal"],
                            "source": "rule_engine",
                        }
                    )

            # Quantitative Numeric Notice-Period Asymmetry check
            emp_notices = [int(x) for x in re.findall(r"(?:employee|contractor|tenant|vendor)\s+(?:shall|must|agree[s]?\s+to)?\s*(?:give|provide|serve)\s+(?:at\s+least\s+)?(\d{1,3})\s+days", norm_page_text, re.I)]
            co_notices = [int(x) for x in re.findall(r"(?:company|employer|client|landlord)\s+(?:may|can|shall)\s+terminate.*?(?:upon|with)\s+(\d{1,3})\s+days", norm_page_text, re.I)]
            if emp_notices and co_notices and max(emp_notices) >= max(co_notices) * 2 and max(emp_notices) >= 30:
                asym_phrase = f"{max(emp_notices)} days"
                traps.append(
                    {
                        "id": f"trap_asym_p{p_idx+1}_{len(traps)}",
                        "category": "Asymmetric Notice Period Imbalance",
                        "severity": "HIGH",
                        "clauseSnippet": f"Notice imbalance detected: You must give {max(emp_notices)} days notice vs issuer's {min(co_notices)} days.",
                        "matchedPhrase": asym_phrase,
                        "pageNumber": p_idx + 1,
                        "bbox": _locate_clause_bbox(page, asym_phrase, page_ocr_words),
                        "whyDangerous": f"Requires {max(emp_notices)} days exit notice from you while allowing them to terminate in {min(co_notices)} days.",
                        "counterProposalTip": f'Propose symmetrical notice: "Notice period shall be mutual at {min(30, max(emp_notices))} days for both parties."',
                        "source": "numeric_audit",
                    }
                )

        # Missing standard contract protections
        all_doc_text = "\n\n".join(f"[PAGE {p}]\n{t}" for p, t in full_text_pages if t)
        missing_shields = _check_missing_safeguards(all_doc_text)
        traps.extend(missing_shields)

        # Optional Gemini Deep Semantic Clause Audit (server key safe + budget limited)
        ai_enhanced = False
        if use_ai and ai_quota_ok and len(all_doc_text) > 120:
            try:
                from ai_vision_refiner import _dispatch_provider_text, is_provider_blocked, resolve_vision_credentials

                prov, api_key = resolve_vision_credentials(provider="auto", user_api_key="", strict_local=False)
                if prov and api_key and not is_provider_blocked(prov, api_key):
                    existing_cats = ", ".join(sorted({t["category"] for t in traps}))
                    prompt = (
                        "You are an expert corporate & employment contract lawyer auditing an agreement for hidden fine-print traps.\n"
                        f"Already flagged categories: [{existing_cats}].\n"
                        "Find ONLY up to 3 ADDITIONAL sneaky legal or financial traps in the text below that were NOT already caught above "
                        "(for example: disguised IP ownership, automatic debt acceleration, hidden fee markups, unfair SLAs, hidden exclusivity, or tax-shift clauses).\n"
                        "Return strictly valid JSON: {\"traps\":[{\"category\":\"...\",\"severity\":\"CRITICAL|HIGH|MEDIUM\","
                        "\"pageNumber\":1,\"exactQuote\":\"short verbatim 4-8 word quote from text\","
                        "\"whyDangerous\":\"1-2 sentences\",\"counterProposalTip\":\"verbatim safer counter-clause\"}]}\n"
                        "If no additional serious traps exist, return {\"traps\":[]}.\n\n"
                        f"CONTRACT TEXT:\n{all_doc_text[:13500]}"
                    )
                    raw_resp = _dispatch_provider_text(prov, api_key, prompt, b64_jpg="", json_object_mode=True, max_total_s=12.0)
                    if raw_resp:
                        parsed = json.loads(raw_resp)
                        for idx_ai, item in enumerate(parsed.get("traps", [])[:3]):
                            p_num = max(1, min(len(doc), int(item.get("pageNumber") or 1)))
                            quote = str(item.get("exactQuote") or "").strip()
                            if not quote:
                                continue
                            cat = str(item.get("category") or "Hidden Semantic Clause Risk").strip()
                            if any(t["category"].lower() == cat.lower() for t in traps):
                                continue
                            pg_obj = doc[p_num - 1]
                            bbox = _locate_clause_bbox(pg_obj, quote)
                            traps.append(
                                {
                                    "id": f"trap_ai_p{p_num}_{idx_ai}",
                                    "category": cat,
                                    "severity": str(item.get("severity") or "HIGH").upper() if str(item.get("severity") or "").upper() in ("CRITICAL", "HIGH", "MEDIUM") else "HIGH",
                                    "clauseSnippet": f'"{quote}"',
                                    "matchedPhrase": quote,
                                    "pageNumber": p_num,
                                    "bbox": bbox,
                                    "whyDangerous": str(item.get("whyDangerous") or ""),
                                    "counterProposalTip": str(item.get("counterProposalTip") or ""),
                                    "source": "gemini_ai",
                                }
                            )
                            ai_enhanced = True
            except Exception as ai_err:
                logger.warning(f"[ContractRedline] Semantic AI skipped cleanly: {ai_err}")

        # Score calculation weighted cleanly by severity
        score = 0
        for t in traps:
            sev = t.get("severity", "MEDIUM")
            score += 22 if sev == "CRITICAL" else 14 if sev == "HIGH" else 8
        danger_score = min(100, score)

        return {
            "success": True,
            "filename": filename or "Agreement.pdf",
            "page_count": len(doc),
            "ocr_pages": ocr_pages_count,
            "ai_enhanced": ai_enhanced,
            "danger_score": danger_score,
            "traps": traps,
            "total_characters": len(all_doc_text),
        }
    finally:
        doc.close()
