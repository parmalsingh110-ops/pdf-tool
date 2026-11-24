"""
Pre-Press CMYK Separation, Ink Coverage Preflight, Pure-K Black Preservation,
Offset Crop Marks, and True Vector DeviceGray Engine.

Built on Ghostscript (`ink_cov`, `pdfwrite`), PyMuPDF (`fitz.csCMYK`),
pikepdf content-stream surgery, and fast_codecs (`fast_jpeg_encode`).
Memory-safe for 512 MB containers.
"""

from __future__ import annotations

import base64
import io
import logging
import re
import subprocess
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF
import numpy as np
import pikepdf
from PIL import Image

from fast_codecs import fast_jpeg_encode
from image_utils import is_image_bytes, is_pdf_bytes, safe_open_image

logger = logging.getLogger("pdf_tool.prepress")

_PT_PER_MM = 72.0 / 25.4
_INK_COV_LINE_RE = re.compile(
    r"^\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+CMYK\s+OK\s*$"
)


def ensure_pdf_input(raw_bytes: bytes, filename: str, out_pdf: Path, dpi: int = 300) -> bool:
    """
    Accepts PDF or raster image (JPG/PNG/WebP/HEIC/AVIF/TIFF/BMP/GIF, including extensionless blobs).
    If input is already PDF, writes directly to `out_pdf` and returns False (not converted from image).
    If input is an image, applies EXIF orientation, white alpha flattening, and 4800px RAM cap,
    then embeds cleanly at target press DPI into `out_pdf` and returns True.
    """
    if is_pdf_bytes(raw_bytes):
        out_pdf.write_bytes(raw_bytes)
        return False

    if is_image_bytes(raw_bytes, filename):
        img, _ = safe_open_image(raw_bytes, max_dim=4800, flatten_alpha_bg=(255, 255, 255))
        target_dpi = max(72, min(600, int(dpi)))
        w_pt = (img.width / target_dpi) * 72.0
        h_pt = (img.height / target_dpi) * 72.0

        buf = io.BytesIO()
        if max(img.width, img.height) <= 2400:
            img.save(buf, format="PNG")
        else:
            img.save(buf, format="JPEG", quality=95)
        img_bytes = buf.getvalue()

        doc = fitz.open()
        page = doc.new_page(width=w_pt, height=h_pt)
        page.insert_image(fitz.Rect(0, 0, w_pt, h_pt), stream=img_bytes)
        doc.save(str(out_pdf), deflate=True)
        doc.close()
        return True

    raise ValueError("Unsupported file format. Please upload a PDF, JPG, PNG, WebP, HEIC, AVIF, or TIFF file.")


def _rewrite_ops_pure_k(ops: list[tuple[Any, Any]]) -> tuple[list[tuple[Any, Any]], bool]:
    """
    Maps neutral RGB (`r≈g≈b` via `rg`/`RG`) and `DeviceGray` (`g`/`G`) operators
    directly to `DeviceCMYK` Pure-K (`0 0 0 k` / `0 0 0 K`).
    Prevents Ghostscript ICC mapping from turning crisp black text into blurry 4-plate rich black.
    """
    changed = False
    new_ops: list[tuple[Any, Any]] = []
    for operands, op in ops:
        op_s = str(op)
        if op_s in ("rg", "RG") and len(operands) == 3:
            try:
                r, g, b = float(operands[0]), float(operands[1]), float(operands[2])
                if abs(r - g) < 0.015 and abs(g - b) < 0.015 and abs(r - b) < 0.015:
                    lum = max(0.0, min(1.0, (r + g + b) / 3.0))
                    k = round(1.0 - lum, 4)
                    new_ops.append(([0, 0, 0, k], pikepdf.Operator("k" if op_s == "rg" else "K")))
                    changed = True
                    continue
            except Exception:
                pass
        elif op_s in ("g", "G") and len(operands) == 1:
            try:
                lum = max(0.0, min(1.0, float(operands[0])))
                k = round(1.0 - lum, 4)
                new_ops.append(([0, 0, 0, k], pikepdf.Operator("k" if op_s == "g" else "K")))
                changed = True
                continue
            except Exception:
                pass
        new_ops.append((operands, op))
    return new_ops, changed


def map_neutral_black_to_pure_k(inp_pdf: Path, out_pdf: Path) -> bool:
    """
    Pre-processes all pages and recursively traverses nested Form XObjects (Canva, Figma,
    Illustrator, crop-marked PDFs) so pure black text & neutral grays become genuine
    100% Pure K-Only CMYK (`0, 0, 0, K`).
    """
    any_changed = False
    visited_xobjs: set[tuple[int, int]] = set()

    def _walk_resources(res_obj: Any, depth: int = 0) -> None:
        nonlocal any_changed
        if not res_obj or depth > 8:
            return
        try:
            xobjects = res_obj.get("/XObject")
        except Exception:
            return
        if not xobjects:
            return
        for _, xobj in list(xobjects.items()):
            try:
                if not isinstance(xobj, pikepdf.Stream):
                    continue
                if str(xobj.get("/Subtype", "")) != "/Form":
                    continue
                og = xobj.objgen
                if og in visited_xobjs:
                    continue
                visited_xobjs.add(og)
                xops = pikepdf.parse_content_stream(xobj)
                new_xops, xchanged = _rewrite_ops_pure_k(xops)
                if xchanged:
                    xobj.write(pikepdf.unparse_content_stream(new_xops))
                    any_changed = True
                _walk_resources(xobj.get("/Resources"), depth + 1)
            except Exception:
                continue

    with pikepdf.open(str(inp_pdf)) as pdf:
        for page in pdf.pages:
            try:
                ops = pikepdf.parse_content_stream(page)
                new_ops, changed = _rewrite_ops_pure_k(ops)
                if changed:
                    page.Contents = pdf.make_stream(pikepdf.unparse_content_stream(new_ops))
                    any_changed = True
            except Exception as e:
                logger.debug(f"[CMYK Pure-K] Skipping page stream parse: {e}")

            try:
                _walk_resources(page.get("/Resources"), 0)
            except Exception:
                pass

        pdf.save(str(out_pdf))
    return any_changed


def run_ghostscript_ink_cov(pdf_path: Path, max_pages: int = 40) -> list[dict[str, float]]:
    """
    Runs Ghostscript `-sDEVICE=ink_cov` to measure real weighted per-plate C, M, Y, K %
    coverage on each page (up to `max_pages` to stay fast on 512 MB containers).
    """
    cmd = [
        "gs",
        "-q",
        "-dNOPAUSE",
        "-dBATCH",
        "-dSAFER",
        "-o",
        "-",
        "-sDEVICE=ink_cov",
        f"-dLastPage={max_pages}",
        str(pdf_path),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    pages: list[dict[str, float]] = []
    for line in (res.stdout or "").splitlines():
        m = _INK_COV_LINE_RE.match(line)
        if m:
            c, mg, y, k = (float(m.group(i)) for i in range(1, 5))
            tac = round(c + mg + y + k, 2)
            pages.append(
                {
                    "page": len(pages) + 1,
                    "cyan": round(c, 2),
                    "magenta": round(mg, 2),
                    "yellow": round(y, 2),
                    "black": round(k, 2),
                    "total_ink_pct": tac,
                }
            )
    return pages


def add_press_crop_marks(
    inp_pdf: Path,
    out_pdf: Path,
    bleed_mm: float = 3.0,
) -> None:
    """
    Expands each page by a press slug margin (`bleed_mm + 9mm`), sets true TrimBox & BleedBox,
    and draws vector crop/trim marks, registration bullseyes, and a mini CMYK ink control bar.
    """
    bleed_mm = max(0.0, min(10.0, float(bleed_mm)))
    bleed_pt = bleed_mm * _PT_PER_MM
    slug_pt = bleed_pt + (9.0 * _PT_PER_MM)
    mark_len = 5.5 * _PT_PER_MM
    mark_gap = max(2.0 * _PT_PER_MM, bleed_pt + 1.5)

    src = fitz.open(str(inp_pdf))
    dst = fitz.open()
    try:
        for i in range(len(src)):
            sp = src[i]
            sr = sp.rect
            w, h = sr.width, sr.height
            new_w = w + 2 * slug_pt
            new_h = h + 2 * slug_pt

            dp = dst.new_page(width=new_w, height=new_h)
            trim_rect = fitz.Rect(slug_pt, slug_pt, slug_pt + w, slug_pt + h)
            bleed_rect = fitz.Rect(
                slug_pt - bleed_pt,
                slug_pt - bleed_pt,
                slug_pt + w + bleed_pt,
                slug_pt + h + bleed_pt,
            )

            # Place original page centered inside TrimBox
            dp.show_pdf_page(trim_rect, src, i)

            # Draw hairline trim crop marks at all 4 corners (0.4pt pure black)
            sh = dp.new_shape()
            corners = [
                (trim_rect.x0, trim_rect.y0, -1, -1),
                (trim_rect.x1, trim_rect.y0, 1, -1),
                (trim_rect.x0, trim_rect.y1, -1, 1),
                (trim_rect.x1, trim_rect.y1, 1, 1),
            ]
            for cx, cy, dx, dy in corners:
                sh.draw_line(
                    fitz.Point(cx + dx * mark_gap, cy),
                    fitz.Point(cx + dx * (mark_gap + mark_len), cy),
                )
                sh.draw_line(
                    fitz.Point(cx, cy + dy * mark_gap),
                    fitz.Point(cx, cy + dy * (mark_gap + mark_len)),
                )

            # Registration bullseyes centered along top/bottom/left/right slugs
            reg_r = 3.2
            reg_points = [
                (new_w / 2, slug_pt / 2),
                (new_w / 2, new_h - slug_pt / 2),
                (slug_pt / 2, new_h / 2),
                (new_w - slug_pt / 2, new_h / 2),
            ]
            for rx, ry in reg_points:
                sh.draw_circle(fitz.Point(rx, ry), reg_r)
                sh.draw_line(fitz.Point(rx - reg_r * 1.7, ry), fitz.Point(rx + reg_r * 1.7, ry))
                sh.draw_line(fitz.Point(rx, ry - reg_r * 1.7), fitz.Point(rx, ry + reg_r * 1.7))

            sh.finish(color=(0, 0, 0), width=0.4)
            sh.commit()

            # Mini CMYK control swatches in bottom-left slug (only if room)
            swatch_y = new_h - slug_pt * 0.65
            swatch_size = 5.5
            swatch_colors = [
                (0.0, 0.68, 0.94),  # Cyan
                (0.92, 0.0, 0.55),  # Magenta
                (1.0, 0.95, 0.0),   # Yellow
                (0.0, 0.0, 0.0),    # Black (K)
            ]
            for idx_c, col in enumerate(swatch_colors):
                sx = trim_rect.x0 + idx_c * (swatch_size + 2.0)
                dp.draw_rect(
                    fitz.Rect(sx, swatch_y, sx + swatch_size, swatch_y + swatch_size),
                    color=(0.2, 0.2, 0.2),
                    fill=col,
                    width=0.25,
                )

            # Set PDF TrimBox and BleedBox metadata (used by RIP & offset press machines)
            try:
                dp.set_trimbox(trim_rect)
                if bleed_pt > 0:
                    dp.set_bleedbox(bleed_rect)
            except Exception:
                pass

        dst.save(str(out_pdf), deflate=True)
    finally:
        src.close()
        dst.close()


def convert_pdf_to_cmyk_pro(
    inp_pdf: Path,
    out_pdf: Path,
    tmp_dir: Path,
    profile: str = "iso_coated",
    preserve_black: bool = True,
    pdfx_compat: str = "pdf14",
    add_crop_marks: bool = False,
    bleed_mm: float = 3.0,
    dpi: int = 300,
) -> dict[str, Any]:
    """
    Professional Ghostscript + pikepdf RGB->CMYK Press Pipeline.
    Returns verification metadata (avg/max TAC, page count, profile used).
    """
    profile_clean = (profile or "iso_coated").strip().lower()
    icc_map = {
        "iso_coated": "default_cmyk.icc",
        "fogra39": "default_cmyk.icc",
        "swop": "ps_cmyk.icc",
        "uncoated": "ps_cmyk.icc",
    }
    output_icc = icc_map.get(profile_clean, "default_cmyk.icc")
    press_dpi = max(150, min(600, int(dpi or 300)))

    stage_pdf = inp_pdf
    intermediates: list[Path] = []

    try:
        # Optional Step 1: Add offset crop marks + trim/bleed boxes before CMYK separation
        if add_crop_marks:
            marked_pdf = tmp_dir / f"{out_pdf.stem}_marked.pdf"
            add_press_crop_marks(stage_pdf, marked_pdf, bleed_mm=bleed_mm)
            stage_pdf = marked_pdf
            intermediates.append(marked_pdf)

        # Optional Step 2: Preserve 100% Pure K-Only Black text & neutral vectors
        if preserve_black:
            purek_pdf = tmp_dir / f"{out_pdf.stem}_purek.pdf"
            map_neutral_black_to_pure_k(stage_pdf, purek_pdf)
            stage_pdf = purek_pdf
            intermediates.append(purek_pdf)

        # Step 3: Ghostscript Pre-Press CMYK Separation
        compat = "1.3" if (pdfx_compat or "").lower() == "pdfx1a" else "1.4"
        gs_cmd = [
            "gs",
            "-dBATCH",
            "-dNOPAUSE",
            "-dQUIET",
            "-dSAFER",
            "-sDEVICE=pdfwrite",
            f"-dCompatibilityLevel={compat}",
            "-dPDFSETTINGS=/prepress",
            "-sColorConversionStrategy=CMYK",
            "-dProcessColorModel=/DeviceCMYK",
            f"-sOutputICCProfile={output_icc}",
            "-dConvertCMYKImagesToRGB=false",
            "-dPreserveOverprintSettings=true",
            "-dDownsampleColorImages=false",
            "-dDownsampleGrayImages=false",
            "-dDownsampleMonoImages=false",
            f"-r{press_dpi}",
            "-dOverrideICC=true",
            f"-sOutputFile={out_pdf}",
            str(stage_pdf),
        ]

        subprocess.run(
            gs_cmd,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            timeout=150,
        )

        if not out_pdf.exists() or out_pdf.stat().st_size == 0:
            raise RuntimeError("CMYK output PDF was not generated.")

        # Post-conversion verification via Ghostscript ink_cov (first 15 pages for speed)
        ink_pages = run_ghostscript_ink_cov(out_pdf, max_pages=15)
        avg_tac = (
            round(sum(p["total_ink_pct"] for p in ink_pages) / len(ink_pages), 2)
            if ink_pages
            else 0.0
        )
        max_tac = max((p["total_ink_pct"] for p in ink_pages), default=0.0)

        return {
            "profile": profile_clean,
            "icc": output_icc,
            "pure_k_black": preserve_black,
            "crop_marks": add_crop_marks,
            "pages_analyzed": len(ink_pages),
            "avg_tac_pct": avg_tac,
            "max_tac_pct": max_tac,
            "ink_pages": ink_pages,
        }
    finally:
        for p in intermediates:
            try:
                if p.exists():
                    p.unlink()
            except Exception:
                pass


def _encode_b64_jpeg(bgr_array: np.ndarray, quality: int = 82) -> str:
    jpg_bytes = fast_jpeg_encode(bgr_array, quality=quality)
    return "data:image/jpeg;base64," + base64.b64encode(jpg_bytes).decode("ascii")


def analyze_cmyk_preflight(pdf_path: Path, preview_page: int = 1) -> dict[str, Any]:
    """
    Complete Pre-Press Preflight & 4-Plate Separation Inspector:
    1. Real Ghostscript `ink_cov` per page (C, M, Y, K, TAC %).
    2. PyMuPDF object inspection: color spaces, image DPI warnings (<200 DPI),
       trim dimensions in mm, and unembedded font warnings.
    3. Real CMYK 4-plate separation previews (Soft-Proof, C, M, Y, K plates + TAC > 280% heatmap).
    """
    ink_pages = run_ghostscript_ink_cov(pdf_path, max_pages=30)

    doc = fitz.open(str(pdf_path))
    try:
        total_pages = len(doc)
        if total_pages == 0:
            raise ValueError("PDF has 0 pages.")

        color_spaces: set[str] = set()
        low_dpi_images: list[dict[str, Any]] = []
        unembedded_fonts: set[str] = set()
        page_sizes_mm: list[dict[str, Any]] = []

        inspect_limit = min(total_pages, 30)
        for idx in range(inspect_limit):
            pg = doc[idx]
            rect = pg.rect
            w_mm = round(rect.width / _PT_PER_MM, 1)
            h_mm = round(rect.height / _PT_PER_MM, 1)
            page_sizes_mm.append({"page": idx + 1, "width_mm": w_mm, "height_mm": h_mm})

            # Inspect images on page for color space + effective print DPI
            try:
                for img_info in pg.get_image_info(xrefs=True):
                    cs = str(img_info.get("colorspace", ""))
                    if cs == "3":
                        color_spaces.add("DeviceRGB")
                    elif cs == "4":
                        color_spaces.add("DeviceCMYK")
                    elif cs == "1":
                        color_spaces.add("DeviceGray")
                    elif cs:
                        color_spaces.add(cs)

                    iw = int(img_info.get("width", 0) or 0)
                    ih = int(img_info.get("height", 0) or 0)
                    bbox = img_info.get("bbox")
                    if iw > 0 and ih > 0 and bbox and len(bbox) == 4:
                        disp_w_in = abs(bbox[2] - bbox[0]) / 72.0
                        disp_h_in = abs(bbox[3] - bbox[1]) / 72.0
                        if disp_w_in > 0.2 and disp_h_in > 0.2:
                            eff_dpi = int(min(iw / disp_w_in, ih / disp_h_in))
                            if eff_dpi < 200 and len(low_dpi_images) < 12:
                                low_dpi_images.append(
                                    {
                                        "page": idx + 1,
                                        "effective_dpi": eff_dpi,
                                        "pixels": f"{iw}x{ih}",
                                    }
                                )
            except Exception:
                pass

            # Inspect content stream operators for vector RGB/CMYK/Gray color spaces
            try:
                stream_bytes = pg.read_contents()
                if b" rg" in stream_bytes or b" RG" in stream_bytes:
                    color_spaces.add("DeviceRGB")
                if b" k" in stream_bytes or b" K" in stream_bytes:
                    color_spaces.add("DeviceCMYK")
                if b" g" in stream_bytes or b" G" in stream_bytes:
                    color_spaces.add("DeviceGray")
            except Exception:
                pass

            # Inspect font embedding
            try:
                for f in pg.get_fonts(full=True):
                    # f = (xref, ext, type, basefont, name, encoding, referencer)
                    ext = f[1] or ""
                    basefont = str(f[3] or "")
                    if not ext and basefont and not basefont.startswith(("Helvetica", "Times", "Courier", "Symbol")):
                        unembedded_fonts.add(basefont)
            except Exception:
                pass

        # Render 4-Plate Separation Previews for requested preview_page
        p_idx = max(0, min(total_pages - 1, int(preview_page) - 1))
        pg = doc[p_idx]
        max_side = max(pg.rect.width, pg.rect.height, 1.0)
        target_px = 680.0
        scale = min(2.0, max(0.4, target_px / max_side))
        mat = fitz.Matrix(scale, scale)

        # Render directly in PyMuPDF CMYK colorspace -> (H, W, 4) bytes [C, M, Y, K] in 0..255!
        cmyk_pix = pg.get_pixmap(matrix=mat, colorspace=fitz.csCMYK, alpha=False)
        cmyk = np.frombuffer(cmyk_pix.samples, dtype=np.uint8).reshape(cmyk_pix.height, cmyk_pix.width, 4)
        c_ch = cmyk[:, :, 0].astype(np.float32) / 255.0
        m_ch = cmyk[:, :, 1].astype(np.float32) / 255.0
        y_ch = cmyk[:, :, 2].astype(np.float32) / 255.0
        k_ch = cmyk[:, :, 3].astype(np.float32) / 255.0

        # Peak Pixel TAC % (0..400%)
        tac_map = (c_ch + m_ch + y_ch + k_ch) * 100.0
        peak_pixel_tac = round(float(np.max(tac_map)), 1)
        over_ink_ratio = round(float(np.mean(tac_map > 280.0)) * 100.0, 2)

        # 1. CMYK Soft-Proof Preview (BGR for fast_jpeg_encode)
        r_sp = np.clip((1.0 - c_ch) * (1.0 - k_ch) * 255.0, 0, 255).astype(np.uint8)
        g_sp = np.clip((1.0 - m_ch) * (1.0 - k_ch) * 255.0, 0, 255).astype(np.uint8)
        b_sp = np.clip((1.0 - y_ch) * (1.0 - k_ch) * 255.0, 0, 255).astype(np.uint8)
        soft_proof_bgr = np.stack([b_sp, g_sp, r_sp], axis=-1)

        # 2. Individual Ink-Tinted Separation Plates (white paper -> pure plate color)
        # Cyan plate (BGR = [255, 255, 255*(1-c)])
        c_u8 = cmyk[:, :, 0]
        m_u8 = cmyk[:, :, 1]
        y_u8 = cmyk[:, :, 2]
        k_u8 = cmyk[:, :, 3]
        ones = np.full_like(c_u8, 255)

        cyan_plate = np.stack([ones, np.clip(255 - (c_u8 * 0.25), 0, 255).astype(np.uint8), 255 - c_u8], axis=-1)
        magenta_plate = np.stack([np.clip(255 - (m_u8 * 0.15), 0, 255).astype(np.uint8), 255 - m_u8, ones], axis=-1)
        yellow_plate = np.stack([255 - y_u8, np.clip(255 - (y_u8 * 0.08), 0, 255).astype(np.uint8), ones], axis=-1)
        k_inv = 255 - k_u8
        black_plate = np.stack([k_inv, k_inv, k_inv], axis=-1)

        # 3. Over-Ink TAC Heatmap (>240% amber warning, >280% bright red smudge alert!)
        heat = (soft_proof_bgr.astype(np.float32) * 0.45 + 140.0).astype(np.uint8)
        warn_mask = (tac_map >= 240.0) & (tac_map < 280.0)
        danger_mask = tac_map >= 280.0
        heat[warn_mask] = [0, 175, 255]    # BGR Amber
        heat[danger_mask] = [30, 30, 245]  # BGR Red Alert

        plates = {
            "soft_proof": _encode_b64_jpeg(soft_proof_bgr, quality=84),
            "cyan": _encode_b64_jpeg(cyan_plate, quality=80),
            "magenta": _encode_b64_jpeg(magenta_plate, quality=80),
            "yellow": _encode_b64_jpeg(yellow_plate, quality=80),
            "black": _encode_b64_jpeg(black_plate, quality=80),
            "tac_heatmap": _encode_b64_jpeg(heat, quality=82),
        }

        avg_c = round(sum(p["cyan"] for p in ink_pages) / len(ink_pages), 2) if ink_pages else 0.0
        avg_m = round(sum(p["magenta"] for p in ink_pages) / len(ink_pages), 2) if ink_pages else 0.0
        avg_y = round(sum(p["yellow"] for p in ink_pages) / len(ink_pages), 2) if ink_pages else 0.0
        avg_k = round(sum(p["black"] for p in ink_pages) / len(ink_pages), 2) if ink_pages else 0.0

        is_already_cmyk = ("DeviceCMYK" in color_spaces) and ("DeviceRGB" not in color_spaces)

        return {
            "total_pages": total_pages,
            "preview_page": p_idx + 1,
            "color_spaces": sorted(color_spaces) or ["Unknown"],
            "is_already_cmyk": is_already_cmyk,
            "average_ink": {
                "cyan": avg_c,
                "magenta": avg_m,
                "yellow": avg_y,
                "black": avg_k,
                "total_ink_pct": round(avg_c + avg_m + avg_y + avg_k, 2),
            },
            "peak_pixel_tac_pct": peak_pixel_tac,
            "over_ink_area_pct": over_ink_ratio,
            "pages": ink_pages,
            "page_sizes_mm": page_sizes_mm[:10],
            "low_dpi_warnings": low_dpi_images,
            "unembedded_fonts": sorted(unembedded_fonts)[:10],
            "plates": plates,
        }
    finally:
        doc.close()


def convert_pdf_to_vector_grayscale(
    inp_pdf: Path,
    out_pdf: Path,
    tmp_dir: Path,
    eco_lighten_pct: int = 0,
) -> dict[str, Any]:
    """
    Converts a PDF into genuine 1-channel `DeviceGray` vector PDF using Ghostscript.
    Preserves 100% crisp vector text, selectable fonts, links, and small file size.
    Optional `eco_lighten_pct` (0..45) lightens heavy dark ink tones in vector streams
    to save black toner while staying 100% vector!
    """
    eco = max(0, min(45, int(eco_lighten_pct or 0)))
    gs_out = out_pdf if eco == 0 else (tmp_dir / f"{out_pdf.stem}_gsgray.pdf")

    gs_cmd = [
        "gs",
        "-dBATCH",
        "-dNOPAUSE",
        "-dQUIET",
        "-dSAFER",
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        "-sColorConversionStrategy=Gray",
        "-dProcessColorModel=/DeviceGray",
        "-dOverrideICC=true",
        f"-sOutputFile={gs_out}",
        str(inp_pdf),
    ]
    subprocess.run(
        gs_cmd,
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        timeout=150,
    )

    if not gs_out.exists() or gs_out.stat().st_size == 0:
        raise RuntimeError("Grayscale output PDF was not generated.")

    # Optional vector Eco-Toner lift (keeps text 100% vector while lifting deep black 0.0 -> ~0.22-0.35 gray)
    if eco > 0:
        lift = round((eco / 100.0) * 0.72, 4)
        try:
            with pikepdf.open(str(gs_out)) as pdf:
                for page in pdf.pages:
                    try:
                        ops = pikepdf.parse_content_stream(page)
                        new_ops = []
                        changed = False
                        for operands, op in ops:
                            op_s = str(op)
                            if op_s in ("g", "G") and len(operands) == 1:
                                val = max(0.0, min(1.0, float(operands[0])))
                                if val < 0.88:
                                    val = round(min(0.96, val + (1.0 - val) * lift), 4)
                                    changed = True
                                new_ops.append(([val], op))
                            else:
                                new_ops.append((operands, op))
                        if changed:
                            page.Contents = pdf.make_stream(pikepdf.unparse_content_stream(new_ops))
                    except Exception:
                        continue
                pdf.save(str(out_pdf))
        finally:
            try:
                if gs_out != out_pdf and gs_out.exists():
                    gs_out.unlink()
            except Exception:
                pass

    ink_pages = run_ghostscript_ink_cov(out_pdf, max_pages=10)
    avg_k = round(sum(p["black"] for p in ink_pages) / len(ink_pages), 2) if ink_pages else 0.0
    return {
        "vector_grayscale": True,
        "eco_lighten_pct": eco,
        "avg_black_ink_pct": avg_k,
    }
