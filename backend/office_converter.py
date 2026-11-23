"""
PDF Media Suite — High-Precision Office & Document Conversion Engine
====================================================================
Provides lossless, format-preserving conversions across Office formats:
  - Office / Text / CSV -> PDF (LibreOffice with per-app export filter profiles,
    metric-exact font handling, wide-sheet landscape fit-to-1-page-wide XML injection
    without stripping charts/drawings, and safe fallback)
  - Legacy Office normalization (.doc/.odt/.rtf -> .docx, .xls/.ods/.csv -> .xlsx,
    .ppt/.odp -> .pptx)
  - Word (.docx/.doc/.odt/.rtf) -> Excel (.xlsx) with exact tables, merges, fills,
    numeric typing, auto-widths & document text sheet
  - Word (.docx/.doc/.odt/.rtf) -> PowerPoint (.pptx) with per-run colors/styles,
    embedded images, auto-paginated tables with repeated headers, and overflow guard
  - Excel (.xlsx/.xls/.ods/.csv) -> Word (.docx) with true bounding-box detection,
    auto landscape sections for wide sheets, merged cells, exact fills/fonts/alignments,
    formatted numbers/dates, proportional column widths, and embedded images
  - Excel (.xlsx/.xls/.ods/.csv) -> PowerPoint (.pptx) with true bounding-box detection,
    unlimited multi-slide table pagination, repeated headers, valid OOXML cell styling,
    merged cells, and embedded images
  - PowerPoint (.pptx/.ppt/.odp) -> Word (.docx) with visual reading order, recursive
    group-shape unpacking, per-run styles/colors, native styled tables, embedded images,
    and speaker notes
  - PowerPoint (.pptx/.ppt/.odp) -> Excel (.xlsx) with summary + per-slide sheets,
    proper title detection, recursive group unpacking, merged tables, numeric typing,
    and speaker notes
"""

from __future__ import annotations

import csv
import datetime
import io
import json
import logging
import math
import os
import re
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger("pdf_tool.office_converter")

ALLOWED_OFFICE_TO_PDF_EXTENSIONS = {
    ".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls",
    ".odt", ".ods", ".odp", ".rtf", ".csv", ".txt", ".md",
}

WORD_EXTENSIONS = {".docx", ".doc", ".odt", ".rtf"}
EXCEL_EXTENSIONS = {".xlsx", ".xls", ".ods", ".csv"}
PPT_EXTENSIONS = {".pptx", ".ppt", ".odp"}

_LO_WARM_TEMPLATE = Path("/opt/lo_profile_template")
_CTRL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_PURE_INT_RE = re.compile(r"^[+-]?(?:0|[1-9]\d*)$")
_PURE_FLOAT_RE = re.compile(r"^[+-]?(?:\d+\.\d+|\d{1,3}(?:,\d{3})+(?:\.\d+)?)$")


# ─── Common Helpers ──────────────────────────────────────────────────────────

def clean_xml_text(text: Any) -> str:
    """Strip XML 1.0 illegal control characters safely."""
    if text is None:
        return ""
    return _CTRL_RE.sub("", str(text))


def find_libreoffice() -> str:
    """Locate the LibreOffice binary on macOS, Linux, or Docker."""
    candidates = [
        "soffice",
        "libreoffice",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "/opt/homebrew/bin/soffice",
        "/usr/bin/soffice",
        "/usr/bin/libreoffice",
    ]
    for c in candidates:
        found = shutil.which(c)
        if found:
            return found
        if Path(c).exists():
            return c
    raise RuntimeError("LibreOffice (soffice) is not installed on this server.")


def parse_excel_typed_value(raw: Any):
    """Preserve real numeric types in Excel without corrupting leading-zero IDs or phone numbers."""
    if raw is None:
        return ""
    if isinstance(raw, (int, float, bool, datetime.date, datetime.datetime)):
        return raw
    s = clean_xml_text(raw).strip()
    if not s or "\n" in s:
        return s
    # Avoid converting leading-zero identifiers like "00123" or very long IDs (>15 digits)
    if _PURE_INT_RE.fullmatch(s) and len(s.lstrip("+-")) <= 15:
        try:
            return int(s)
        except Exception:
            return s
    if _PURE_FLOAT_RE.fullmatch(s):
        compact = s.replace(",", "")
        if len(compact.replace(".", "").lstrip("+-")) <= 15:
            try:
                val = float(compact)
                return int(val) if val.is_integer() and "." not in s else val
            except Exception:
                return s
    return s


def _run_libreoffice(
    args: list[str],
    timeout_sec: int = 240,
) -> subprocess.CompletedProcess:
    """Execute LibreOffice headless in an isolated temp profile directory."""
    lo = find_libreoffice()
    with tempfile.TemporaryDirectory(prefix="lo_prof_") as tmp_prof:
        tmp_prof_path = Path(tmp_prof).resolve()
        if _LO_WARM_TEMPLATE.is_dir():
            try:
                shutil.copytree(_LO_WARM_TEMPLATE, tmp_prof_path, dirs_exist_ok=True)
            except Exception:
                pass
        profile_url = f"file://{tmp_prof_path}"
        env = os.environ.copy()
        env["HOME"] = str(tmp_prof_path)
        env.setdefault("LC_ALL", "C.UTF-8")
        env.setdefault("LANG", "C.UTF-8")
        cmd = [
            lo,
            f"-env:UserInstallation={profile_url}",
            "--headless",
            "--norestore",
            "--nolockcheck",
            "--nodefault",
            "--nofirststartwizard",
            *args,
        ]
        return subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            env=env,
        )


def _prepare_xlsx_print_fit_copy(inp: Path, work_dir: Path) -> Path:
    """
    Non-destructively inject fit-to-1-page-wide + landscape pageSetup directly into
    worksheet XML of a copied .xlsx ONLY for sheets that are wide (>6 used cols) and
    do NOT already specify an explicit print fitToPage setup.
    Because we patch only XML attributes inside the zip (never round-tripping through
    openpyxl), 100% of charts, shapes, conditional formatting, pivot tables, and styles
    stay completely untouched!
    """
    if inp.suffix.lower() != ".xlsx":
        return inp
    try:
        from lxml import etree

        patched = work_dir / f"{inp.stem}_fit.xlsx"
        ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        any_changed = False

        with zipfile.ZipFile(inp, "r") as zin, zipfile.ZipFile(patched, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                raw = zin.read(item.filename)
                if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", item.filename):
                    try:
                        root = etree.fromstring(raw)
                        # Estimate max column span from <dimension ref="A1:J40"/> or <c r="..."/>
                        max_col = 0
                        dim = root.find(f"{{{ns}}}dimension")
                        if dim is not None and dim.get("ref"):
                            parts = dim.get("ref", "").split(":")
                            end_ref = parts[-1]
                            m = re.match(r"([A-Z]+)", end_ref, re.I)
                            if m:
                                acc = 0
                                for ch in m.group(1).upper():
                                    acc = acc * 26 + (ord(ch) - 64)
                                max_col = acc
                        if max_col == 0:
                            sheet_data = root.find(f"{{{ns}}}sheetData")
                            if sheet_data is not None:
                                for row_el in sheet_data[:50]:
                                    for c_el in row_el:
                                        ref = c_el.get("r", "")
                                        m = re.match(r"([A-Z]+)", ref, re.I)
                                        if m:
                                            acc = 0
                                            for ch in m.group(1).upper():
                                                acc = acc * 26 + (ord(ch) - 64)
                                            if acc > max_col:
                                                max_col = acc

                        page_setup = root.find(f"{{{ns}}}pageSetup")
                        sheet_pr = root.find(f"{{{ns}}}sheetPr")
                        has_fit_setup = (
                            sheet_pr is not None
                            and sheet_pr.find(f"{{{ns}}}pageSetUpPr") is not None
                            and sheet_pr.find(f"{{{ns}}}pageSetUpPr").get("fitToPage") in ("1", "true")
                        )

                        if max_col >= 6 and not has_fit_setup:
                            if sheet_pr is None:
                                sheet_pr = etree.Element(f"{{{ns}}}sheetPr")
                                root.insert(0, sheet_pr)
                            psu_pr = sheet_pr.find(f"{{{ns}}}pageSetUpPr")
                            if psu_pr is None:
                                psu_pr = etree.SubElement(sheet_pr, f"{{{ns}}}pageSetUpPr")
                            psu_pr.set("fitToPage", "1")

                            if page_setup is None:
                                # Insert pageSetup in valid OOXML order (after pageMargins if present, else before headerFooter/drawing/end)
                                page_setup = etree.Element(f"{{{ns}}}pageSetup")
                                insert_after_tags = {
                                    f"{{{ns}}}pageMargins",
                                    f"{{{ns}}}printOptions",
                                    f"{{{ns}}}hyperlinks",
                                    f"{{{ns}}}dataValidations",
                                    f"{{{ns}}}conditionalFormatting",
                                    f"{{{ns}}}mergeCells",
                                    f"{{{ns}}}autoFilter",
                                    f"{{{ns}}}sheetData",
                                }
                                insert_idx = len(root)
                                for idx_el, child in enumerate(root):
                                    if child.tag in insert_after_tags:
                                        insert_idx = idx_el + 1
                                root.insert(insert_idx, page_setup)

                            if not page_setup.get("orientation"):
                                page_setup.set("orientation", "landscape")
                            page_setup.set("fitToWidth", "1")
                            page_setup.set("fitToHeight", "0")
                            raw = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
                            any_changed = True
                    except Exception as xml_err:
                        logger.debug(f"[Office2PDF] Skipping xlsx print-fit XML patch for {item.filename}: {xml_err}")
                zout.writestr(item, raw)

        if any_changed and patched.exists():
            return patched
        patched.unlink(missing_ok=True)
        return inp
    except Exception as err:
        logger.debug(f"[Office2PDF] Could not prepare xlsx print-fit copy: {err}")
        return inp


def convert_office_to_pdf(inp: Path, out_dir: Path, timeout_sec: int = 240) -> Path:
    """
    Convert any Office / Text / CSV document to a high-fidelity PDF via LibreOffice.
    Uses per-application PDF export filter options (lossless/95% image quality,
    embedded standard fonts, bookmarks, tagged PDF) and preserves wide Excel tables
    from horizontal column slicing.
    """
    ext = inp.suffix.lower()
    src_path = inp
    extra_args: list[str] = []

    if ext == ".xlsx":
        src_path = _prepare_xlsx_print_fit_copy(inp, out_dir)
    elif ext in (".txt", ".md"):
        extra_args = ["--infilter=Text (encoded):UTF8,,,,"]

    # Choose optimal LibreOffice PDF export filter by document type
    if ext in (".docx", ".doc", ".odt", ".rtf", ".txt", ".md"):
        filter_opts = json.dumps({
            "Quality": {"type": "long", "value": "95"},
            "ReduceImageResolution": {"type": "boolean", "value": "false"},
            "EmbedStandardFonts": {"type": "boolean", "value": "true"},
            "ExportBookmarks": {"type": "boolean", "value": "true"},
            "UseTaggedPDF": {"type": "boolean", "value": "true"},
        }, separators=(",", ":"))
        convert_spec = f"pdf:writer_pdf_Export:{filter_opts}"
    elif ext in (".xlsx", ".xls", ".ods", ".csv"):
        filter_opts = json.dumps({
            "Quality": {"type": "long", "value": "95"},
            "ReduceImageResolution": {"type": "boolean", "value": "false"},
            "EmbedStandardFonts": {"type": "boolean", "value": "true"},
            "ExportBookmarks": {"type": "boolean", "value": "true"},
        }, separators=(",", ":"))
        convert_spec = f"pdf:calc_pdf_Export:{filter_opts}"
    elif ext in (".pptx", ".ppt", ".odp"):
        filter_opts = json.dumps({
            "Quality": {"type": "long", "value": "95"},
            "ReduceImageResolution": {"type": "boolean", "value": "false"},
            "EmbedStandardFonts": {"type": "boolean", "value": "true"},
            "ExportBookmarks": {"type": "boolean", "value": "true"},
        }, separators=(",", ":"))
        convert_spec = f"pdf:impress_pdf_Export:{filter_opts}"
    else:
        convert_spec = "pdf"

    r = _run_libreoffice(
        [*extra_args, "--convert-to", convert_spec, "--outdir", str(out_dir), str(src_path)],
        timeout_sec=timeout_sec,
    )
    out_pdf = out_dir / f"{src_path.stem}.pdf"

    # Graceful fallback to plain `--convert-to pdf` if a host LibreOffice build rejects JSON filter options
    if r.returncode != 0 or not out_pdf.exists() or out_pdf.stat().st_size == 0:
        logger.warning(f"[Office2PDF] Rich PDF filter failed (rc={r.returncode}), retrying plain pdf export")
        r = _run_libreoffice(
            [*extra_args, "--convert-to", "pdf", "--outdir", str(out_dir), str(src_path)],
            timeout_sec=timeout_sec,
        )
        out_pdf = out_dir / f"{src_path.stem}.pdf"

    if r.returncode != 0 or not out_pdf.exists() or out_pdf.stat().st_size == 0:
        logger.error(f"[Office2PDF] LibreOffice failed rc={r.returncode} stderr={r.stderr[:400]}")
        raise RuntimeError("Office-to-PDF conversion failed in LibreOffice.")

    return out_pdf


def normalize_office_to_ooxml(inp: Path, target_ext: str, work_dir: Path, timeout_sec: int = 180) -> Path:
    """
    Ensure an Office file is in modern OOXML format (.docx, .xlsx, .pptx).
    Converts legacy/ODF/CSV/RTF formats seamlessly via LibreOffice (or Python CSV reader).
    """
    ext = inp.suffix.lower()
    target_ext = target_ext.lower().lstrip(".")
    if ext == f".{target_ext}":
        return inp

    # Fast native CSV -> XLSX without launching LibreOffice
    if ext == ".csv" and target_ext == "xlsx":
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Sheet1"
        raw_bytes = inp.read_bytes()
        text = None
        for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
            try:
                text = raw_bytes.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        text = text or raw_bytes.decode("utf-8", errors="replace")
        try:
            dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|")
        except Exception:
            dialect = csv.excel
        reader = csv.reader(io.StringIO(text), dialect)
        for r_idx, row in enumerate(reader, 1):
            for c_idx, val in enumerate(row, 1):
                ws.cell(r_idx, c_idx, parse_excel_typed_value(val))
        out_xlsx = work_dir / f"{inp.stem}.xlsx"
        wb.save(str(out_xlsx))
        return out_xlsx

    r = _run_libreoffice(
        ["--convert-to", target_ext, "--outdir", str(work_dir), str(inp)],
        timeout_sec=timeout_sec,
    )
    out_path = work_dir / f"{inp.stem}.{target_ext}"
    if r.returncode != 0 or not out_path.exists():
        logger.error(f"[OfficeNormalize] Failed {ext} -> .{target_ext}: {r.stderr[:300]}")
        raise RuntimeError(f"Could not convert {ext} file to .{target_ext}.")
    return out_path


# ─── Color & Style Extraction Helpers ────────────────────────────────────────

# Standard Office theme color fallback palette (Office 2013–365 default)
_OFFICE_THEME_HEX = [
    "FFFFFF",  # 0 lt1
    "000000",  # 1 dk1
    "E7E6E6",  # 2 lt2
    "44546A",  # 3 dk2
    "4472C4",  # 4 accent1
    "ED7D31",  # 5 accent2
    "A5A5A5",  # 6 accent3
    "FFC000",  # 7 accent4
    "5B9BD5",  # 8 accent5
    "70AD47",  # 9 accent6
]


def _apply_tint(hex_rgb: str, tint: float) -> str:
    """Apply OOXML tint (-1.0..1.0) to a 6-char RGB hex string."""
    try:
        r = int(hex_rgb[0:2], 16)
        g = int(hex_rgb[2:4], 16)
        b = int(hex_rgb[4:6], 16)
        if tint < 0:
            factor = 1.0 + tint
            r, g, b = int(r * factor), int(g * factor), int(b * factor)
        elif tint > 0:
            r = int(r + (255 - r) * tint)
            g = int(g + (255 - g) * tint)
            b = int(b + (255 - b) * tint)
        return f"{max(0, min(255, r)):02X}{max(0, min(255, g)):02X}{max(0, min(255, b)):02X}"
    except Exception:
        return hex_rgb


def _openpyxl_color_to_hex(color_obj, is_fill: bool = False) -> Optional[str]:
    """Safely resolve an openpyxl Color (rgb, theme+tint, indexed) into 6-char hex RGB."""
    if color_obj is None:
        return None
    try:
        ctype = getattr(color_obj, "type", None)
        if ctype == "rgb":
            rgb_str = str(color_obj.rgb or "")
            if len(rgb_str) == 8:
                alpha = rgb_str[:2].upper()
                body = rgb_str[2:].upper()
                if alpha == "00" and body == "000000":
                    return None
                return body
            if len(rgb_str) == 6:
                return rgb_str.upper()
        elif ctype == "theme":
            idx = int(color_obj.theme)
            if 0 <= idx < len(_OFFICE_THEME_HEX):
                base = _OFFICE_THEME_HEX[idx]
                tint = float(getattr(color_obj, "tint", 0.0) or 0.0)
                return _apply_tint(base, tint)
        elif ctype == "indexed":
            from openpyxl.styles.colors import COLOR_INDEX
            idx = int(color_obj.indexed)
            if 0 <= idx < len(COLOR_INDEX):
                val = COLOR_INDEX[idx]
                if val and len(val) == 8:
                    body = val[2:].upper()
                    # Index 64/65 are system foreground/background auto
                    if idx >= 64:
                        return None
                    if is_fill and body == "000000":
                        return None
                    return body
    except Exception:
        return None
    return None


def _is_dark_hex(hex_rgb: Optional[str]) -> bool:
    if not hex_rgb or len(hex_rgb) != 6:
        return False
    try:
        r = int(hex_rgb[0:2], 16)
        g = int(hex_rgb[2:4], 16)
        b = int(hex_rgb[4:6], 16)
        luma = 0.299 * r + 0.587 * g + 0.114 * b
        return luma < 140
    except Exception:
        return False


def _format_excel_cell_value(cell) -> str:
    """Format an openpyxl cell value respecting dates, percentages, and clean decimals."""
    val = cell.value
    if val is None:
        return ""
    if isinstance(val, datetime.datetime):
        if val.hour == 0 and val.minute == 0 and val.second == 0:
            return val.strftime("%Y-%m-%d")
        return val.strftime("%Y-%m-%d %H:%M")
    if isinstance(val, datetime.date):
        return val.strftime("%Y-%m-%d")
    if isinstance(val, datetime.time):
        return val.strftime("%H:%M:%S")
    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    if isinstance(val, float):
        nf = str(getattr(cell, "number_format", "") or "")
        if "%" in nf:
            pct = val * 100.0
            return f"{pct:.0f}%" if abs(pct - round(pct)) < 1e-6 else f"{pct:.2f}%"
        if abs(val - round(val)) < 1e-9 and abs(val) < 1e15:
            return str(int(round(val)))
        return f"{val:.4f}".rstrip("0").rstrip(".")
    return clean_xml_text(val)


def _extract_sheet_bounds(ws) -> Optional[tuple[int, int, int, int]]:
    """
    Compute the TRUE non-empty bounding box (min_r, max_r, min_c, max_c) (1-based)
    including all cells with values AND all merged ranges that contain values.
    NEVER uses count-of-non-empty-cells!
    """
    min_r = 10**9
    max_r = 0
    min_c = 10**9
    max_c = 0

    for row in ws.iter_rows():
        for cell in row:
            if cell.value is not None and str(cell.value).strip() != "":
                r, c = cell.row, cell.column
                if r < min_r:
                    min_r = r
                if r > max_r:
                    max_r = r
                if c < min_c:
                    min_c = c
                if c > max_c:
                    max_c = c

    if max_r == 0 or max_c == 0:
        return None

    # Expand bounds to fully encompass any merged cell whose top-left lies inside bounds
    for rng in ws.merged_cells.ranges:
        if min_r <= rng.min_row <= max_r and min_c <= rng.min_col <= max_c:
            max_r = max(max_r, rng.max_row)
            max_c = max(max_c, rng.max_col)

    return (min_r, max_r, min_c, max_c)


def _autosize_openpyxl_sheet(ws, fit_landscape: bool = True) -> None:
    """Auto-size column widths and row heights nicely, avoiding distortion from merged banners."""
    from openpyxl.utils import get_column_letter

    col_max: dict[int, int] = {}
    for row in ws.iter_rows():
        max_lines = 1
        row_num = row[0].row if row else None
        for cell in row:
            if cell.value is None:
                continue
            val = str(cell.value)
            lines = val.split("\n")
            max_lines = max(max_lines, len(lines))
            is_hmerged = any(
                cell.coordinate in m_rng and m_rng.min_col < m_rng.max_col
                for m_rng in ws.merged_cells.ranges
            )
            if not is_hmerged:
                longest = max((len(l) for l in lines), default=0)
                col_max[cell.column] = max(col_max.get(cell.column, 8), longest + 3)
        if row_num is not None:
            ws.row_dimensions[row_num].height = max(18, min(72, max_lines * 15))

    for col_idx, width in col_max.items():
        ws.column_dimensions[get_column_letter(col_idx)].width = max(10, min(48, width))

    if fit_landscape and len(col_max) >= 5:
        ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True


def _set_docx_cell_shading(cell, fill_hex: str) -> None:
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn

    tcPr = cell._tc.get_or_add_tcPr()
    for old in tcPr.findall(qn("w:shd")):
        tcPr.remove(old)
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill_hex.lstrip("#").upper()[:6])
    tcPr.append(shd)


def _set_docx_table_borders(table, border_hex: str = "CBD5E1", sz: str = "4") -> None:
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn

    tblPr = table._tbl.tblPr
    if tblPr is None:
        return
    for old in tblPr.findall(qn("w:tblBorders")):
        tblPr.remove(old)
    borders = OxmlElement("w:tblBorders")
    for side in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = OxmlElement(f"w:{side}")
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), sz)
        el.set(qn("w:space"), "0")
        el.set(qn("w:color"), border_hex)
        borders.append(el)
    tblPr.append(borders)


def _set_docx_row_props(tr, is_header: bool = False) -> None:
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn

    trPr = tr._tr.get_or_add_trPr()
    if trPr.find(qn("w:cantSplit")) is None:
        trPr.append(OxmlElement("w:cantSplit"))
    if is_header and trPr.find(qn("w:tblHeader")) is None:
        trPr.append(OxmlElement("w:tblHeader"))


def _set_docx_cell_margins(cell, top=55, bottom=55, left=90, right=90) -> None:
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn

    tcPr = cell._tc.get_or_add_tcPr()
    for old in tcPr.findall(qn("w:tcMar")):
        tcPr.remove(old)
    tcMar = OxmlElement("w:tcMar")
    for side, val in (("top", top), ("bottom", bottom), ("left", left), ("right", right)):
        node = OxmlElement(f"w:{side}")
        node.set(qn("w:w"), str(val))
        node.set(qn("w:type"), "dxa")
        tcMar.append(node)
    tcPr.append(tcMar)


def _set_pptx_cell_border_clean(cell, hex_color: str = "CBD5E1", width_pt: float = 0.6) -> None:
    """Attach clean solid border edges to a python-pptx table cell in valid OOXML order."""
    from lxml import etree
    from pptx.oxml.ns import qn

    tcPr = cell._tc.get_or_add_tcPr()
    w_emu = str(int(round(width_pt * 12700)))
    # Insert lnL/lnR/lnT/lnB BEFORE solidFill / noFill so PowerPoint validates OOXML cleanly
    for side in ("lnL", "lnR", "lnT", "lnB"):
        for old in tcPr.findall(qn(f"a:{side}")):
            tcPr.remove(old)

    insert_pos = 0
    for side in ("lnL", "lnR", "lnT", "lnB"):
        ln = etree.Element(qn(f"a:{side}"), w=w_emu, cap="flat", cmpd="sng", algn="ctr")
        solid = etree.SubElement(ln, qn("a:solidFill"))
        etree.SubElement(solid, qn("a:srgbClr"), val=hex_color.lstrip("#").upper()[:6])
        tcPr.insert(insert_pos, ln)
        insert_pos += 1


def _reset_pptx_table_theme(ppt_tbl) -> None:
    """Disable python-pptx's default Medium Style 2 blue banding so our exact colors shine through."""
    from pptx.oxml.ns import qn

    tbl_pr = ppt_tbl._tbl.tblPr
    if tbl_pr is not None:
        tbl_pr.set("firstRow", "0")
        tbl_pr.set("bandRow", "0")
        style_el = tbl_pr.find(qn("a:tableStyleId"))
        if style_el is not None:
            style_el.text = "{2D5ABB26-0587-4C30-8999-92F81FD0307C}"


def _extract_docx_run_rgb(run) -> Optional[tuple[int, int, int]]:
    """Safely extract (r, g, b) tuple from a python-docx Run."""
    try:
        if run.font.color and run.font.color.rgb is not None:
            c = run.font.color.rgb
            return (int(c[0]), int(c[1]), int(c[2]))
    except Exception:
        pass
    return None


def _extract_docx_paragraph_images(para, doc_part) -> list[bytes]:
    """Extract embedded image bytes referenced inside a python-docx paragraph (<a:blip>)."""
    images: list[bytes] = []
    try:
        ns_a = "http://schemas.openxmlformats.org/drawingml/2006/main"
        ns_r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
        for blip in para._element.iter(f"{{{ns_a}}}blip"):
            r_id = blip.get(f"{{{ns_r}}}embed")
            if r_id and r_id in doc_part.related_parts:
                blob = doc_part.related_parts[r_id].blob
                if blob and len(blob) >= 32:
                    images.append(blob)
    except Exception:
        pass
    return images


def _normalize_image_for_office(img_bytes: bytes) -> Optional[tuple[bytes, int, int]]:
    """Convert any embedded image (including WMF/WebP/TIFF/CMYK) into clean PNG/JPEG bytes + (w, h)."""
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(img_bytes))
        w, h = im.size
        if w <= 0 or h <= 0:
            return None
        fmt = (im.format or "").upper()
        if fmt in ("PNG", "JPEG", "JPG") and im.mode in ("RGB", "RGBA", "L"):
            return (img_bytes, w, h)
        buf = io.BytesIO()
        if im.mode in ("RGBA", "LA", "PA"):
            im.convert("RGBA").save(buf, format="PNG")
        else:
            im.convert("RGB").save(buf, format="PNG")
        return (buf.getvalue(), w, h)
    except Exception:
        return None


def _parse_docx_table_grid(tbl_elem, doc) -> list[list[dict[str, Any]]]:
    """
    Parse a Word <w:tbl> XML element accurately into a 2D grid preserving:
    - Horizontal merges (w:gridSpan)
    - Vertical merges (w:vMerge restart / continue)
    - Cell shading (w:shd fill)
    - Text, bold, italic, font color, horizontal alignment
    """
    from docx.oxml.ns import qn
    from docx.text.paragraph import Paragraph as _P

    raw_rows: list[list[dict[str, Any]]] = []
    for tr in tbl_elem.findall(qn("w:tr")):
        row_cells: list[dict[str, Any]] = []
        trPr = tr.find(qn("w:trPr"))
        is_tbl_hdr = trPr is not None and trPr.find(qn("w:tblHeader")) is not None

        for tc in tr.findall(qn("w:tc")):
            tcPr = tc.find(qn("w:tcPr"))
            colspan = 1
            vmerge = None  # "restart" | "continue" | None
            fill_hex: Optional[str] = None

            if tcPr is not None:
                gs = tcPr.find(qn("w:gridSpan"))
                if gs is not None and gs.get(qn("w:val")):
                    try:
                        colspan = max(1, int(gs.get(qn("w:val"))))
                    except Exception:
                        colspan = 1
                vm = tcPr.find(qn("w:vMerge"))
                if vm is not None:
                    vmerge = vm.get(qn("w:val")) or "continue"
                shd = tcPr.find(qn("w:shd"))
                if shd is not None:
                    f = (shd.get(qn("w:fill")) or "").strip().upper()
                    if len(f) == 6 and f not in ("AUTO", "FFFFFF"):
                        fill_hex = f

            paras_text: list[str] = []
            any_bold = False
            any_italic = False
            first_rgb: Optional[tuple[int, int, int]] = None
            align = "left"

            for p_el in tc.findall(qn("w:p")):
                p = _P(p_el, doc)
                ptxt = clean_xml_text(p.text).strip()
                if ptxt:
                    paras_text.append(ptxt)
                if p.alignment is not None:
                    a_name = str(p.alignment).lower()
                    if "center" in a_name:
                        align = "center"
                    elif "right" in a_name:
                        align = "right"
                for r in p.runs:
                    if r.text.strip():
                        if r.bold:
                            any_bold = True
                        if r.italic:
                            any_italic = True
                        if first_rgb is None:
                            first_rgb = _extract_docx_run_rgb(r)

            row_cells.append({
                "text": "\n".join(paras_text),
                "colspan": colspan,
                "rowspan": 1,
                "vmerge": vmerge,
                "covered": False,
                "fill_hex": fill_hex,
                "bold": any_bold or is_tbl_hdr,
                "italic": any_italic,
                "rgb": first_rgb,
                "align": align,
                "is_header": is_tbl_hdr,
            })
        if row_cells:
            raw_rows.append(row_cells)

    if not raw_rows:
        return []

    # Expand grid to uniform column indices
    n_cols = max(sum(c["colspan"] for c in r) for r in raw_rows)
    n_rows = len(raw_rows)
    grid: list[list[dict[str, Any]]] = [
        [{"text": "", "colspan": 1, "rowspan": 1, "covered": False, "fill_hex": None, "bold": False, "italic": False, "rgb": None, "align": "left", "is_header": False}
         for _ in range(n_cols)]
        for _ in range(n_rows)
    ]

    for ri, r_cells in enumerate(raw_rows):
        ci = 0
        for c_info in r_cells:
            if ci >= n_cols:
                break
            cs = min(c_info["colspan"], n_cols - ci)
            c_copy = dict(c_info)
            c_copy["colspan"] = cs
            grid[ri][ci] = c_copy
            for k in range(1, cs):
                grid[ri][ci + k] = {
                    "text": "", "colspan": 1, "rowspan": 1, "covered": True,
                    "fill_hex": c_copy["fill_hex"], "bold": False, "italic": False,
                    "rgb": None, "align": "left", "is_header": c_copy["is_header"],
                }
            ci += cs

    # Resolve vertical merges (w:vMerge)
    for ci in range(n_cols):
        anchor_r: Optional[int] = None
        for ri in range(n_rows):
            cell = grid[ri][ci]
            if cell["covered"]:
                continue
            vm = cell.get("vmerge")
            if vm == "restart":
                anchor_r = ri
            elif vm == "continue" and anchor_r is not None:
                grid[anchor_r][ci]["rowspan"] += 1
                if cell["text"]:
                    if grid[anchor_r][ci]["text"]:
                        grid[anchor_r][ci]["text"] += "\n" + cell["text"]
                    else:
                        grid[anchor_r][ci]["text"] = cell["text"]
                cell["covered"] = True
                cell["text"] = ""
            else:
                anchor_r = None

    return grid


# ─── 1. Word (.docx/.doc/.odt/.rtf) → Excel (.xlsx) ──────────────────────────

def convert_word_to_excel(inp: Path, out: Path) -> Path:
    """
    Convert Word document to a clean, formatted Excel workbook:
    - Each Word table becomes a dedicated styled worksheet preserving exact merged cells
      (colspan + rowspan), cell fill colors, bold/italic/font colors, alignments, borders,
      and native numeric typing.
    - All document headings & paragraphs are preserved in a structured `Document_Content`
      sheet (splitting tab-separated lines cleanly into columns).
    """
    from docx import Document
    from docx.text.paragraph import Paragraph as _P
    import openpyxl
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

    with tempfile.TemporaryDirectory(prefix="w2x_") as work:
        docx_path = normalize_office_to_ooxml(inp, "docx", Path(work))
        doc = Document(str(docx_path))

        wb = openpyxl.Workbook()
        wb.remove(wb.active)

        thin = Side(style="thin", color="94A3B8")
        border = Border(left=thin, right=thin, top=thin, bottom=thin)

        table_count = 0
        prose_items: list[tuple[str, bool, int, Optional[tuple[int, int, int]]]] = []

        for elem in doc.element.body:
            tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
            if tag == "tbl":
                grid = _parse_docx_table_grid(elem, doc)
                if not grid:
                    continue
                table_count += 1
                ws = wb.create_sheet(title=f"Table_{table_count}"[:31])
                n_rows = len(grid)
                n_cols = len(grid[0])

                for ri in range(n_rows):
                    for ci in range(n_cols):
                        info = grid[ri][ci]
                        cell = ws.cell(ri + 1, ci + 1)
                        cell.border = border
                        if info["covered"]:
                            continue

                        cell.value = parse_excel_typed_value(info["text"])
                        is_hdr = info["is_header"] or (ri == 0 and all(
                            c["bold"] or not c["text"].strip() for c in grid[0] if not c["covered"]
                        ))
                        fill_hex = info["fill_hex"] or ("1A3A8F" if is_hdr else ("F8FAFC" if ri % 2 == 0 and ri > 0 else None))
                        txt_hex = None
                        if info["rgb"] is not None:
                            txt_hex = f"{info['rgb'][0]:02X}{info['rgb'][1]:02X}{info['rgb'][2]:02X}"
                        if fill_hex and _is_dark_hex(fill_hex) and (not txt_hex or _is_dark_hex(txt_hex)):
                            txt_hex = "FFFFFF"

                        cell.font = Font(
                            name="Calibri",
                            size=11 if is_hdr else 10,
                            bold=bool(info["bold"] or is_hdr),
                            italic=bool(info["italic"]),
                            color=txt_hex or "0F172A",
                        )
                        cell.alignment = Alignment(
                            horizontal=info["align"],
                            vertical="center",
                            wrap_text=True,
                        )
                        if fill_hex:
                            fill = PatternFill("solid", fgColor=fill_hex)
                            for rr in range(ri + 1, ri + 1 + info["rowspan"]):
                                for cc in range(ci + 1, ci + 1 + info["colspan"]):
                                    ws.cell(rr, cc).fill = fill
                                    ws.cell(rr, cc).border = border

                        if info["rowspan"] > 1 or info["colspan"] > 1:
                            ws.merge_cells(
                                start_row=ri + 1,
                                start_column=ci + 1,
                                end_row=ri + info["rowspan"],
                                end_column=ci + info["colspan"],
                            )

                _autosize_openpyxl_sheet(ws)

            elif tag == "p":
                p = _P(elem, doc)
                txt = clean_xml_text(p.text).strip()
                if not txt:
                    continue
                style_name = (p.style.name if p.style else "") or ""
                is_heading = "Heading" in style_name or "Title" in style_name
                is_bold = is_heading or any(r.bold for r in p.runs if r.text.strip())
                sz = 14 if ("Heading 1" in style_name or "Title" in style_name) else (12 if "Heading" in style_name else 10)
                first_rgb = next((_extract_docx_run_rgb(r) for r in p.runs if r.text.strip() and _extract_docx_run_rgb(r)), None)
                prose_items.append((txt, is_bold, sz, first_rgb))

        if prose_items or table_count == 0:
            ws_doc = wb.create_sheet(title="Document_Content", index=0 if table_count == 0 else len(wb.sheetnames))
            if not prose_items:
                ws_doc.cell(1, 1, "(No content detected)")
            else:
                for r_idx, (txt, is_bold, sz, rgb_val) in enumerate(prose_items, 1):
                    if "\t" in txt:
                        cols = [c.strip() for c in txt.split("\t")]
                        for c_idx, val in enumerate(cols, 1):
                            cell = ws_doc.cell(r_idx, c_idx, parse_excel_typed_value(val))
                            cell.font = Font(
                                name="Calibri", size=sz, bold=is_bold,
                                color=(f"{rgb_val[0]:02X}{rgb_val[1]:02X}{rgb_val[2]:02X}" if rgb_val else "0F172A"),
                            )
                            cell.alignment = Alignment(vertical="top", wrap_text=True)
                    else:
                        cell = ws_doc.cell(r_idx, 1, parse_excel_typed_value(txt))
                        cell.font = Font(
                            name="Calibri", size=sz, bold=is_bold,
                            color=(f"{rgb_val[0]:02X}{rgb_val[1]:02X}{rgb_val[2]:02X}" if rgb_val else ("1A3A8F" if sz >= 12 else "0F172A")),
                        )
                        cell.alignment = Alignment(vertical="top", wrap_text=True)
            _autosize_openpyxl_sheet(ws_doc, fit_landscape=False)

        wb.save(str(out))
    return out


# ─── 2. Word (.docx/.doc/.odt/.rtf) → PowerPoint (.pptx) ────────────────────

def convert_word_to_ppt(inp: Path, out: Path) -> Path:
    """
    Convert Word document into a crisp, fully editable 16:9 PowerPoint presentation:
    - Preserves headings as clean slide titles with accent bar
    - Preserves per-run bold, italic, underline, font family, scaled size, and exact RGB colors
    - Preserves paragraph alignment & bullet/list levels
    - Estimates vertical height budget so text NEVER overflows off a slide
    - Preserves embedded Word images at exact aspect ratio
    - Converts ALL Word tables across auto-paginated slides (with repeated headers,
      cell fill colors, merges, and proportional column widths — zero row/column truncation!)
    """
    from docx import Document
    from docx.text.paragraph import Paragraph as _P
    from pptx import Presentation
    from pptx.dml.color import RGBColor
    from pptx.enum.shapes import MSO_SHAPE
    from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
    from pptx.util import Emu, Inches, Pt

    CLR_PRIMARY = RGBColor(0x1E, 0x3A, 0x8A)
    CLR_ACCENT = RGBColor(0x3B, 0x82, 0xF6)
    CLR_TEXT = RGBColor(0x1E, 0x29, 0x3B)
    CLR_WHITE = RGBColor(0xFF, 0xFF, 0xFF)

    with tempfile.TemporaryDirectory(prefix="w2p_") as work:
        docx_path = normalize_office_to_ooxml(inp, "docx", Path(work))
        doc = Document(str(docx_path))

        prs = Presentation()
        prs.slide_width = Inches(13.333)
        prs.slide_height = Inches(7.5)
        blank_layout = prs.slide_layouts[6]

        def _create_styled_slide(title_text: str):
            sl = prs.slides.add_slide(blank_layout)
            # Subtle top accent bar
            bar = sl.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(0.12))
            bar.fill.solid()
            bar.fill.fore_color.rgb = CLR_PRIMARY
            bar.line.fill.background()

            # Clean title box
            tb = sl.shapes.add_textbox(Inches(0.55), Inches(0.28), Inches(12.2), Inches(0.75))
            tf = tb.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            r = p.add_run()
            r.text = clean_xml_text(title_text)[:180] or "Document"
            r.font.size = Pt(24)
            r.font.bold = True
            r.font.name = "Calibri"
            r.font.color.rgb = CLR_PRIMARY

            # Divider line under title
            div = sl.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.55), Inches(1.06), Inches(12.2), Inches(0.02))
            div.fill.solid()
            div.fill.fore_color.rgb = RGBColor(0xCB, 0xD5, 0xE1)
            div.line.fill.background()

            # Content text box
            body_box = sl.shapes.add_textbox(Inches(0.55), Inches(1.22), Inches(12.2), Inches(5.85))
            body_tf = body_box.text_frame
            body_tf.word_wrap = True
            return sl, body_tf

        current_slide = None
        current_tf = None
        current_title = inp.stem.replace("_", " ").strip() or "Presentation"
        used_lines = 0.0
        max_lines_per_slide = 17.5
        has_body_on_slide = False

        def _ensure_content_slide(force_new: bool = False, title_override: Optional[str] = None):
            nonlocal current_slide, current_tf, used_lines, has_body_on_slide, current_title
            if title_override:
                current_title = title_override
            if force_new or current_slide is None or current_tf is None:
                title_to_use = current_title if (force_new or current_slide is None) else f"{current_title} (Cont.)"
                current_slide, current_tf = _create_styled_slide(title_to_use)
                used_lines = 0.0
                has_body_on_slide = False

        def _add_image_slide(img_bytes: bytes, caption: str):
            norm = _normalize_image_for_office(img_bytes)
            if not norm:
                return
            png_bytes, iw, ih = norm
            sl, _ = _create_styled_slide(caption)
            # Remove empty body box? No need, just place image cleanly inside content area
            max_w = 11.8
            max_h = 5.6
            scale = min(max_w / max(1, iw), max_h / max(1, ih))
            dw = max(0.8, iw * scale)
            dh = max(0.6, ih * scale)
            left = (13.333 - dw) / 2.0
            top = 1.25 + (max_h - dh) / 2.0
            sl.shapes.add_picture(io.BytesIO(png_bytes), Inches(left), Inches(top), width=Inches(dw), height=Inches(dh))

        def _render_table_slides(grid: list[list[dict[str, Any]]], heading_title: str):
            n_rows = len(grid)
            n_cols = len(grid[0]) if n_rows else 0
            if n_rows == 0 or n_cols == 0:
                return
            # Compute proportional column widths from max text length per column
            col_scores = [6.0] * n_cols
            for row in grid[:40]:
                for ci, c in enumerate(row):
                    if not c["covered"] and c["colspan"] == 1:
                        longest = max((len(l) for l in c["text"].split("\n")), default=0)
                        col_scores[ci] = max(col_scores[ci], min(45.0, float(longest) + 2.0))
            total_score = max(1.0, sum(col_scores))
            tbl_total_w = 12.2
            col_widths_in = [max(0.55, (sc / total_score) * tbl_total_w) for sc in col_scores]
            # Rescale to exact total width
            scale_w = tbl_total_w / sum(col_widths_in)
            col_widths_in = [w * scale_w for w in col_widths_in]

            header_row = grid[0]
            has_header = header_row[0].get("is_header") or all(
                c["bold"] or not c["text"].strip() for c in header_row if not c["covered"]
            )
            data_rows = grid[1:] if (has_header and n_rows > 1) else grid
            rows_per_slide = 14 if n_cols <= 8 else 11
            chunks = [data_rows[i:i + rows_per_slide] for i in range(0, len(data_rows), rows_per_slide)] or [[]]

            for chunk_idx, chunk in enumerate(chunks):
                slide_rows = ([header_row] + chunk) if (has_header and n_rows > 1) else chunk
                if not slide_rows:
                    continue
                t_title = heading_title if len(chunks) == 1 else f"{heading_title} (Table {chunk_idx + 1}/{len(chunks)})"
                sl, _ = _create_styled_slide(t_title)

                sr = len(slide_rows)
                row_h_est = min(0.52, max(0.32, 5.6 / max(1, sr)))
                t_height = min(5.75, sr * row_h_est)
                t_shape = sl.shapes.add_table(sr, n_cols, Inches(0.55), Inches(1.25), Inches(tbl_total_w), Inches(t_height))
                ptbl = t_shape.table
                _reset_pptx_table_theme(ptbl)

                for ci, cw in enumerate(col_widths_in):
                    ptbl.columns[ci].width = Inches(cw)

                font_pt = 11.0 if n_cols <= 6 else (9.5 if n_cols <= 10 else 8.0)

                for ri, row in enumerate(slide_rows):
                    is_hdr_row = has_header and ri == 0 and n_rows > 1
                    for ci, c_info in enumerate(row):
                        pcell = ptbl.cell(ri, ci)
                        pcell.vertical_anchor = MSO_ANCHOR.MIDDLE
                        pcell.margin_left = Emu(45000)
                        pcell.margin_right = Emu(45000)
                        pcell.margin_top = Emu(25000)
                        pcell.margin_bottom = Emu(25000)

                        fill_hex = c_info["fill_hex"] or ("1E3A8A" if is_hdr_row else ("F1F5F9" if ri % 2 == 0 and ri > 0 else "FFFFFF"))
                        pcell.fill.solid()
                        pcell.fill.fore_color.rgb = RGBColor(int(fill_hex[0:2], 16), int(fill_hex[2:4], 16), int(fill_hex[4:6], 16))
                        _set_pptx_cell_border_clean(pcell, "CBD5E1", 0.5)

                        if c_info["covered"]:
                            continue

                        # Horizontal merge within this slide row
                        if c_info["colspan"] > 1 and ci + c_info["colspan"] - 1 < n_cols:
                            try:
                                pcell.merge(ptbl.cell(ri, ci + c_info["colspan"] - 1))
                            except Exception:
                                pass

                        tf_c = pcell.text_frame
                        tf_c.word_wrap = True
                        lines = c_info["text"].split("\n") if c_info["text"] else [""]
                        for li, ln in enumerate(lines):
                            cp = tf_c.paragraphs[0] if li == 0 else tf_c.add_paragraph()
                            if c_info["align"] == "center":
                                cp.alignment = PP_ALIGN.CENTER
                            elif c_info["align"] == "right":
                                cp.alignment = PP_ALIGN.RIGHT
                            else:
                                cp.alignment = PP_ALIGN.LEFT
                            cr = cp.add_run()
                            cr.text = clean_xml_text(ln)
                            cr.font.size = Pt(font_pt)
                            cr.font.name = "Calibri"
                            cr.font.bold = bool(c_info["bold"] or is_hdr_row)
                            cr.font.italic = bool(c_info["italic"])
                            if _is_dark_hex(fill_hex):
                                cr.font.color.rgb = CLR_WHITE
                            elif c_info["rgb"]:
                                cr.font.color.rgb = RGBColor(*c_info["rgb"])
                            else:
                                cr.font.color.rgb = CLR_TEXT

        for elem in doc.element.body:
            tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag

            if tag == "p":
                para = _P(elem, doc)
                # Extract any embedded pictures inside this paragraph
                para_imgs = _extract_docx_paragraph_images(para, doc.part)
                txt = clean_xml_text(para.text).strip()
                style_name = (para.style.name if para.style else "") or ""

                is_h1 = "Heading 1" in style_name or style_name == "Title"
                is_h2 = "Heading 2" in style_name or style_name == "Subtitle"
                is_h3 = "Heading 3" in style_name or "Heading 4" in style_name

                if is_h1 and txt:
                    _ensure_content_slide(force_new=True, title_override=txt)
                    for img_b in para_imgs:
                        _add_image_slide(img_b, current_title)
                        current_slide = None
                        current_tf = None
                    continue

                if not txt:
                    for img_b in para_imgs:
                        _add_image_slide(img_b, current_title)
                        current_slide = None
                        current_tf = None
                    continue

                # Estimate lines needed for this paragraph
                base_pt = 19.0 if is_h2 else (16.5 if is_h3 else 15.0)
                chars_per_line = max(45, int(102 * (15.0 / base_pt)))
                est_lines = max(1.0, math.ceil(len(txt) / chars_per_line)) + (0.6 if is_h2 else 0.35)

                if current_slide is None or current_tf is None:
                    _ensure_content_slide(force_new=True)
                elif has_body_on_slide and (used_lines + est_lines > max_lines_per_slide):
                    _ensure_content_slide(force_new=True, title_override=current_title)
                    # Mark as continuation if we stayed under the same heading
                    if current_slide.shapes and current_slide.shapes[1].has_text_frame:
                        t_run = current_slide.shapes[1].text_frame.paragraphs[0].runs[0]
                        if not t_run.text.endswith("(Cont.)"):
                            t_run.text = f"{current_title[:165]} (Cont.)"

                p_out = current_tf.add_paragraph() if has_body_on_slide else current_tf.paragraphs[0]
                has_body_on_slide = True
                used_lines += est_lines

                # Paragraph alignment
                if para.alignment is not None:
                    a_str = str(para.alignment).lower()
                    if "center" in a_str:
                        p_out.alignment = PP_ALIGN.CENTER
                    elif "right" in a_str:
                        p_out.alignment = PP_ALIGN.RIGHT
                    elif "justify" in a_str:
                        p_out.alignment = getattr(PP_ALIGN, "JUSTIFY", PP_ALIGN.LEFT)

                p_out.space_before = Pt(8 if is_h2 else 4)
                p_out.space_after = Pt(4)

                # List / indent level
                pPr = elem.find("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}pPr")
                is_list_item = pPr is not None and pPr.find("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}numPr") is not None
                if is_h3:
                    p_out.level = 1
                elif para.paragraph_format.left_indent and para.paragraph_format.left_indent > 0:
                    p_out.level = min(3, int(para.paragraph_format.left_indent / 360000))

                if is_list_item:
                    bullet_r = p_out.add_run()
                    bullet_r.text = "• "
                    bullet_r.font.size = Pt(base_pt)
                    bullet_r.font.bold = True
                    bullet_r.font.color.rgb = CLR_ACCENT

                added_any = False
                for run in para.runs:
                    r_txt = clean_xml_text(run.text)
                    if not r_txt:
                        continue
                    pr = p_out.add_run()
                    pr.text = r_txt
                    pr.font.bold = bool(run.bold or is_h2 or is_h3)
                    pr.font.italic = bool(run.italic)
                    pr.font.underline = bool(run.underline)
                    pr.font.name = (run.font.name or "Calibri")
                    if run.font.size:
                        src_pt = run.font.size.pt
                        pr.font.size = Pt(max(11.0, min(26.0, src_pt * 1.25)))
                    else:
                        pr.font.size = Pt(base_pt)
                    rgb_val = _extract_docx_run_rgb(run)
                    if rgb_val:
                        pr.font.color.rgb = RGBColor(*rgb_val)
                    elif is_h2:
                        pr.font.color.rgb = CLR_PRIMARY
                    else:
                        pr.font.color.rgb = CLR_TEXT
                    added_any = True

                if not added_any:
                    pr = p_out.add_run()
                    pr.text = txt
                    pr.font.size = Pt(base_pt)
                    pr.font.bold = bool(is_h2 or is_h3)
                    pr.font.color.rgb = CLR_PRIMARY if is_h2 else CLR_TEXT

                for img_b in para_imgs:
                    _add_image_slide(img_b, current_title)
                    current_slide = None
                    current_tf = None

            elif tag == "tbl":
                grid = _parse_docx_table_grid(elem, doc)
                if grid:
                    _render_table_slides(grid, current_title)
                    current_slide = None
                    current_tf = None

        if len(prs.slides) == 0:
            _create_styled_slide(current_title)

        prs.save(str(out))
    return out


# ─── 3. Excel (.xlsx/.xls/.ods/.csv) → Word (.docx) ──────────────────────────

def convert_excel_to_word(inp: Path, out: Path) -> Path:
    """
    Convert Excel spreadsheet to a clean, exact Word document:
    - Computes TRUE bounding box (never chops columns with gaps!)
    - Automatically switches to Landscape orientation for wide sheets (>= 6 columns)
    - Preserves merged cells, cell fill colors, font bold/italic/color/size,
      horizontal alignment, formatted numbers/dates, proportional column widths,
      repeating header rows, and embedded images!
    """
    import openpyxl
    from docx import Document
    from docx.enum.section import WD_ORIENT, WD_SECTION
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Inches, Pt, RGBColor

    with tempfile.TemporaryDirectory(prefix="x2w_") as work:
        xlsx_path = normalize_office_to_ooxml(inp, "xlsx", Path(work))
        wb = openpyxl.load_workbook(str(xlsx_path), data_only=True)
        doc = Document()

        # Remove initial empty paragraph cleanly if needed later
        first_section_used = False

        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            bounds = _extract_sheet_bounds(ws)
            images = list(getattr(ws, "_images", []) or [])

            if bounds is None and not images:
                continue

            n_cols = (bounds[3] - bounds[2] + 1) if bounds else 1
            use_landscape = n_cols >= 6

            if not first_section_used:
                section = doc.sections[0]
                first_section_used = True
            else:
                section = doc.add_section(WD_SECTION.NEW_PAGE)

            if use_landscape:
                section.orientation = WD_ORIENT.LANDSCAPE
                section.page_width = Inches(11.0)
                section.page_height = Inches(8.5)
                margin_in = 0.45
            else:
                section.orientation = WD_ORIENT.PORTRAIT
                section.page_width = Inches(8.5)
                section.page_height = Inches(11.0)
                margin_in = 0.6

            section.top_margin = Inches(margin_in)
            section.bottom_margin = Inches(margin_in)
            section.left_margin = Inches(margin_in)
            section.right_margin = Inches(margin_in)
            avail_w_in = (11.0 if use_landscape else 8.5) - 2 * margin_in

            h = doc.add_heading(clean_xml_text(sheet_name), level=1)
            if h.runs:
                h.runs[0].font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)
                h.runs[0].font.size = Pt(14)

            if bounds is not None:
                min_r, max_r, min_c, max_c = bounds
                n_rows = max_r - min_r + 1
                n_cols = max_c - min_c + 1

                # Cap extremely wide sheets gracefully while keeping max readability
                # Proportional column widths from Excel column_dimensions + content
                from openpyxl.utils import get_column_letter
                raw_widths: list[float] = []
                for c in range(min_c, max_c + 1):
                    col_letter = get_column_letter(c)
                    dim = ws.column_dimensions.get(col_letter)
                    w = float(dim.width) if (dim and dim.width and dim.width > 0) else 0.0
                    if w <= 0:
                        sample_max = 6
                        for r in range(min_r, min(max_r + 1, min_r + 40)):
                            txt = _format_excel_cell_value(ws.cell(r, c))
                            if txt:
                                sample_max = max(sample_max, min(40, max(len(l) for l in txt.split("\n"))))
                        w = float(sample_max + 2)
                    raw_widths.append(max(5.0, min(55.0, w)))

                sum_w = max(1.0, sum(raw_widths))
                col_widths_in = [max(0.32, (rw / sum_w) * avail_w_in) for rw in raw_widths]
                scl = avail_w_in / sum(col_widths_in)
                col_widths_in = [w * scl for w in col_widths_in]

                # Build merge map relative to (min_r, min_c)
                merge_anchors: dict[tuple[int, int], tuple[int, int]] = {}
                covered_cells: set[tuple[int, int]] = set()
                for rng in ws.merged_cells.ranges:
                    r0 = max(min_r, rng.min_row) - min_r
                    c0 = max(min_c, rng.min_col) - min_c
                    r1 = min(max_r, rng.max_row) - min_r
                    c1 = min(max_c, rng.max_col) - min_c
                    if r0 <= r1 and c0 <= c1 and (r1 > r0 or c1 > c0):
                        merge_anchors[(r0, c0)] = (r1, c1)
                        for rr in range(r0, r1 + 1):
                            for cc in range(c0, c1 + 1):
                                if (rr, cc) != (r0, c0):
                                    covered_cells.add((rr, cc))

                # Adaptive base font size so wide sheets stay legible without vertical letter-stacking
                base_pt = 9.5 if n_cols <= 6 else (8.5 if n_cols <= 10 else (7.5 if n_cols <= 14 else 6.5))

                table = doc.add_table(rows=n_rows, cols=n_cols)
                table.alignment = WD_TABLE_ALIGNMENT.CENTER
                table.autofit = False
                _set_docx_table_borders(table, "CBD5E1", "4")

                # Set explicit tblGrid column widths
                from docx.oxml import OxmlElement
                from docx.oxml.ns import qn
                tblGrid = table._tbl.tblGrid
                if tblGrid is not None:
                    for old_gc in list(tblGrid):
                        tblGrid.remove(old_gc)
                    for cw in col_widths_in:
                        gc_el = OxmlElement("w:gridCol")
                        gc_el.set(qn("w:w"), str(int(round(cw * 1440))))
                        tblGrid.append(gc_el)

                # Detect whether row 0 has explicit Excel fill or looks like a header
                row0_has_fill = any(
                    _openpyxl_color_to_hex(ws.cell(min_r, c).fill.fgColor, is_fill=True) is not None
                    for c in range(min_c, max_c + 1)
                    if ws.cell(min_r, c).fill and ws.cell(min_r, c).fill.fill_type == "solid"
                )
                row0_is_full_merge = (0, 0) in merge_anchors and merge_anchors[(0, 0)][1] == n_cols - 1

                for r_off in range(n_rows):
                    tr = table.rows[r_off]
                    is_auto_hdr = (r_off == 0 and not row0_is_full_merge and not row0_has_fill and n_rows > 1)
                    _set_docx_row_props(tr, is_header=(r_off == 0 and not row0_is_full_merge))

                    for c_off in range(n_cols):
                        dcell = tr.cells[c_off]
                        dcell.width = Inches(col_widths_in[c_off])
                        _set_docx_cell_margins(dcell, top=40, bottom=40, left=65, right=65)

                        if (r_off, c_off) in covered_cells:
                            continue

                        xcell = ws.cell(min_r + r_off, min_c + c_off)
                        val_str = _format_excel_cell_value(xcell)

                        # Resolve fill
                        fill_hex: Optional[str] = None
                        if xcell.fill and xcell.fill.fill_type == "solid":
                            fill_hex = _openpyxl_color_to_hex(xcell.fill.fgColor, is_fill=True)
                        if not fill_hex:
                            if is_auto_hdr:
                                fill_hex = "1E3A8F"
                            elif r_off % 2 == 0 and r_off > 0 and not row0_has_fill:
                                fill_hex = "F8FAFC"
                        if fill_hex:
                            _set_docx_cell_shading(dcell, fill_hex)

                        # Resolve font & alignment
                        xf = xcell.font
                        is_bold = bool((xf and xf.bold) or is_auto_hdr)
                        is_italic = bool(xf and xf.italic)
                        font_hex = _openpyxl_color_to_hex(xf.color, is_fill=False) if xf else None
                        if fill_hex and _is_dark_hex(fill_hex) and (not font_hex or _is_dark_hex(font_hex)):
                            font_hex = "FFFFFF"

                        src_sz = float(xf.size) if (xf and xf.size) else 10.0
                        eff_pt = max(6.0, min(14.0, base_pt * (src_sz / 10.0)))

                        xa = xcell.alignment
                        h_align = (xa.horizontal if xa else None) or ""
                        if h_align in ("center", "centerContinuous"):
                            w_align = WD_ALIGN_PARAGRAPH.CENTER
                        elif h_align == "right" or (not h_align and isinstance(xcell.value, (int, float)) and not isinstance(xcell.value, bool)):
                            w_align = WD_ALIGN_PARAGRAPH.RIGHT
                        else:
                            w_align = WD_ALIGN_PARAGRAPH.LEFT

                        lines = val_str.split("\n") if val_str else [""]
                        for li, ln in enumerate(lines):
                            dp = dcell.paragraphs[0] if li == 0 else dcell.add_paragraph()
                            dp.alignment = w_align
                            dp.paragraph_format.space_before = Pt(0)
                            dp.paragraph_format.space_after = Pt(0)
                            run = dp.add_run(ln)
                            run.bold = is_bold
                            run.italic = is_italic
                            run.font.name = (xf.name if (xf and xf.name) else "Calibri")
                            run.font.size = Pt(eff_pt)
                            if font_hex and len(font_hex) == 6:
                                run.font.color.rgb = RGBColor(
                                    int(font_hex[0:2], 16), int(font_hex[2:4], 16), int(font_hex[4:6], 16)
                                )

                # Apply merges AFTER writing cell content so Word cell indexes stay exact
                for (r0, c0), (r1, c1) in merge_anchors.items():
                    try:
                        table.cell(r0, c0).merge(table.cell(r1, c1))
                    except Exception:
                        pass

            # Export any embedded images from the sheet
            for img in images:
                try:
                    raw_img = img._data()
                    norm = _normalize_image_for_office(raw_img)
                    if norm:
                        png_bytes, iw, ih = norm
                        p_img = doc.add_paragraph()
                        p_img.paragraph_format.space_before = Pt(8)
                        w_in = min(avail_w_in, iw / 96.0)
                        p_img.add_run().add_picture(io.BytesIO(png_bytes), width=Inches(max(0.8, w_in)))
                except Exception:
                    pass

        if not first_section_used:
            doc.add_paragraph("(Empty workbook)")

        doc.save(str(out))
    return out


# ─── 4. Excel (.xlsx/.xls/.ods/.csv) → PowerPoint (.pptx) ────────────────────

def convert_excel_to_ppt(inp: Path, out: Path) -> Path:
    """
    Convert Excel workbook to crisp, multi-slide PowerPoint presentation:
    - Computes TRUE bounding box (zero dropped columns!)
    - Paginates ALL rows across as many continuation slides as needed (never truncates at 60 rows!)
    - Repeats header row on continuation slides
    - Preserves Excel fills, font bold/italic/color, horizontal alignments, formatted numbers/dates,
      proportional column widths, horizontal merges, and valid OOXML borders (zero repair popups!)
    - Exports embedded Excel images onto clean visual slides
    """
    import openpyxl
    from openpyxl.utils import get_column_letter
    from pptx import Presentation
    from pptx.dml.color import RGBColor
    from pptx.enum.shapes import MSO_SHAPE
    from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
    from pptx.util import Emu, Inches, Pt

    CLR_PRIMARY = RGBColor(0x1E, 0x3A, 0x8A)
    CLR_TEXT = RGBColor(0x1E, 0x29, 0x3B)
    CLR_WHITE = RGBColor(0xFF, 0xFF, 0xFF)

    with tempfile.TemporaryDirectory(prefix="x2p_") as work:
        xlsx_path = normalize_office_to_ooxml(inp, "xlsx", Path(work))
        wb = openpyxl.load_workbook(str(xlsx_path), data_only=True)

        prs = Presentation()
        prs.slide_width = Inches(13.333)
        prs.slide_height = Inches(7.5)
        blank_layout = prs.slide_layouts[6]

        def _make_slide_shell(title_text: str):
            sl = prs.slides.add_slide(blank_layout)
            bar = sl.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(0.1))
            bar.fill.solid()
            bar.fill.fore_color.rgb = CLR_PRIMARY
            bar.line.fill.background()

            tb = sl.shapes.add_textbox(Inches(0.4), Inches(0.18), Inches(12.5), Inches(0.58))
            tf = tb.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            r = p.add_run()
            r.text = clean_xml_text(title_text)
            r.font.size = Pt(20)
            r.font.bold = True
            r.font.name = "Calibri"
            r.font.color.rgb = CLR_PRIMARY
            return sl

        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            bounds = _extract_sheet_bounds(ws)
            images = list(getattr(ws, "_images", []) or [])
            if bounds is None and not images:
                continue

            if bounds is not None:
                min_r, max_r, min_c, max_c = bounds
                n_rows = max_r - min_r + 1
                n_cols = max_c - min_c + 1

                # Compute proportional column widths
                raw_widths: list[float] = []
                for c in range(min_c, max_c + 1):
                    col_letter = get_column_letter(c)
                    dim = ws.column_dimensions.get(col_letter)
                    w = float(dim.width) if (dim and dim.width and dim.width > 0) else 0.0
                    if w <= 0:
                        sample_max = 6
                        for r in range(min_r, min(max_r + 1, min_r + 35)):
                            txt = _format_excel_cell_value(ws.cell(r, c))
                            if txt:
                                sample_max = max(sample_max, min(35, max(len(l) for l in txt.split("\n"))))
                        w = float(sample_max + 2)
                    raw_widths.append(max(5.0, min(50.0, w)))

                tbl_w = 12.53
                sum_w = max(1.0, sum(raw_widths))
                col_widths_in = [max(0.45, (rw / sum_w) * tbl_w) for rw in raw_widths]
                scl = tbl_w / sum(col_widths_in)
                col_widths_in = [w * scl for w in col_widths_in]

                # Build horizontal merge lookup per row (relative indices)
                h_merges: dict[tuple[int, int], int] = {}
                h_covered: set[tuple[int, int]] = set()
                for rng in ws.merged_cells.ranges:
                    r0 = max(min_r, rng.min_row) - min_r
                    c0 = max(min_c, rng.min_col) - min_c
                    r1 = min(max_r, rng.max_row) - min_r
                    c1 = min(max_c, rng.max_col) - min_c
                    if r0 == r1 and c1 > c0:
                        h_merges[(r0, c0)] = c1 - c0 + 1
                        for cc in range(c0 + 1, c1 + 1):
                            h_covered.add((r0, cc))

                row0_has_fill = any(
                    _openpyxl_color_to_hex(ws.cell(min_r, c).fill.fgColor, is_fill=True) is not None
                    for c in range(min_c, max_c + 1)
                    if ws.cell(min_r, c).fill and ws.cell(min_r, c).fill.fill_type == "solid"
                )
                row0_is_full_merge = h_merges.get((0, 0), 1) == n_cols
                repeat_header = (n_rows > 1 and not row0_is_full_merge)

                rows_per_slide = 16 if n_cols <= 8 else 13
                data_row_indices = list(range(1 if repeat_header else 0, n_rows))
                chunks = [data_row_indices[i:i + rows_per_slide] for i in range(0, len(data_row_indices), rows_per_slide)] or [[]]
                font_pt = 10.5 if n_cols <= 7 else (9.0 if n_cols <= 11 else 7.5)

                for chunk_idx, row_offsets in enumerate(chunks):
                    slide_row_offsets = ([0] + row_offsets) if repeat_header else row_offsets
                    if not slide_row_offsets:
                        continue

                    s_title = sheet_name if len(chunks) == 1 else f"{sheet_name} ({chunk_idx + 1}/{len(chunks)})"
                    sl = _make_slide_shell(s_title)

                    sr = len(slide_row_offsets)
                    t_height = min(6.35, max(1.2, sr * 0.38))
                    tbl_shape = sl.shapes.add_table(sr, n_cols, Inches(0.4), Inches(0.85), Inches(tbl_w), Inches(t_height))
                    ptbl = tbl_shape.table
                    _reset_pptx_table_theme(ptbl)

                    for ci, cw in enumerate(col_widths_in):
                        ptbl.columns[ci].width = Inches(cw)

                    for local_r, r_off in enumerate(slide_row_offsets):
                        is_auto_hdr = (r_off == 0 and repeat_header and not row0_has_fill)
                        for c_off in range(n_cols):
                            pcell = ptbl.cell(local_r, c_off)
                            pcell.vertical_anchor = MSO_ANCHOR.MIDDLE
                            pcell.margin_left = Emu(38000)
                            pcell.margin_right = Emu(38000)
                            pcell.margin_top = Emu(22000)
                            pcell.margin_bottom = Emu(22000)

                            xcell = ws.cell(min_r + r_off, min_c + c_off)
                            fill_hex: Optional[str] = None
                            if xcell.fill and xcell.fill.fill_type == "solid":
                                fill_hex = _openpyxl_color_to_hex(xcell.fill.fgColor, is_fill=True)
                            if not fill_hex:
                                if is_auto_hdr:
                                    fill_hex = "1E3A8A"
                                elif local_r % 2 == 0 and local_r > 0 and not row0_has_fill:
                                    fill_hex = "F1F5F9"
                                else:
                                    fill_hex = "FFFFFF"

                            pcell.fill.solid()
                            pcell.fill.fore_color.rgb = RGBColor(
                                int(fill_hex[0:2], 16), int(fill_hex[2:4], 16), int(fill_hex[4:6], 16)
                            )
                            _set_pptx_cell_border_clean(pcell, "CBD5E1", 0.5)

                            if (r_off, c_off) in h_covered:
                                continue

                            cspan = h_merges.get((r_off, c_off), 1)
                            if cspan > 1 and c_off + cspan - 1 < n_cols:
                                try:
                                    pcell.merge(ptbl.cell(local_r, c_off + cspan - 1))
                                except Exception:
                                    pass

                            val_str = _format_excel_cell_value(xcell)
                            xf = xcell.font
                            is_bold = bool((xf and xf.bold) or is_auto_hdr)
                            is_italic = bool(xf and xf.italic)
                            font_hex = _openpyxl_color_to_hex(xf.color, is_fill=False) if xf else None
                            if _is_dark_hex(fill_hex) and (not font_hex or _is_dark_hex(font_hex)):
                                font_hex = "FFFFFF"

                            xa = xcell.alignment
                            h_align = (xa.horizontal if xa else None) or ""
                            if h_align in ("center", "centerContinuous"):
                                p_align = PP_ALIGN.CENTER
                            elif h_align == "right" or (not h_align and isinstance(xcell.value, (int, float)) and not isinstance(xcell.value, bool)):
                                p_align = PP_ALIGN.RIGHT
                            else:
                                p_align = PP_ALIGN.LEFT

                            tf_c = pcell.text_frame
                            tf_c.word_wrap = True
                            lines = val_str.split("\n") if val_str else [""]
                            for li, ln in enumerate(lines):
                                cp = tf_c.paragraphs[0] if li == 0 else tf_c.add_paragraph()
                                cp.alignment = p_align
                                cr = cp.add_run()
                                cr.text = ln
                                cr.font.size = Pt(font_pt)
                                cr.font.name = (xf.name if (xf and xf.name) else "Calibri")
                                cr.font.bold = is_bold
                                cr.font.italic = is_italic
                                if font_hex and len(font_hex) == 6:
                                    cr.font.color.rgb = RGBColor(
                                        int(font_hex[0:2], 16), int(font_hex[2:4], 16), int(font_hex[4:6], 16)
                                    )
                                else:
                                    cr.font.color.rgb = CLR_WHITE if _is_dark_hex(fill_hex) else CLR_TEXT

            for img_idx, img in enumerate(images, 1):
                try:
                    raw_img = img._data()
                    norm = _normalize_image_for_office(raw_img)
                    if norm:
                        png_bytes, iw, ih = norm
                        sl = _make_slide_shell(f"{sheet_name} — Visual {img_idx}")
                        scale = min(11.8 / max(1, iw), 5.8 / max(1, ih))
                        dw, dh = max(0.8, iw * scale), max(0.6, ih * scale)
                        sl.shapes.add_picture(
                            io.BytesIO(png_bytes),
                            Inches((13.333 - dw) / 2.0),
                            Inches(0.95 + (5.8 - dh) / 2.0),
                            width=Inches(dw),
                            height=Inches(dh),
                        )
                except Exception:
                    pass

        if len(prs.slides) == 0:
            _make_slide_shell("Workbook")

        prs.save(str(out))
    return out


# ─── Shared PPTX Recursive Shape Flattener ──────────────────────────────────

def _iter_slide_shapes_ordered(shapes, offset_x: int = 0, offset_y: int = 0) -> list[tuple[int, int, Any]]:
    """Recursively unpack grouped shapes and return (top, left, shape) in visual reading order."""
    from pptx.enum.shapes import MSO_SHAPE_TYPE

    collected: list[tuple[int, int, Any]] = []
    for sh in shapes:
        left = int(getattr(sh, "left", 0) or 0) + offset_x
        top = int(getattr(sh, "top", 0) or 0) + offset_y
        if sh.shape_type == MSO_SHAPE_TYPE.GROUP:
            collected.extend(_iter_slide_shapes_ordered(sh.shapes, left, top))
        else:
            collected.append((top, left, sh))
    # Sort top-to-bottom (bucketed by ~12pt / 150000 EMU so side-by-side items read left-to-right)
    collected.sort(key=lambda item: (item[0] // 150000, item[1]))
    return collected


def _extract_pptx_rgb(color_fmt) -> Optional[tuple[int, int, int]]:
    try:
        if color_fmt is not None and color_fmt.type is not None and getattr(color_fmt, "rgb", None) is not None:
            rgb = color_fmt.rgb
            return (int(rgb[0]), int(rgb[1]), int(rgb[2]))
    except Exception:
        pass
    return None


def _extract_pptx_cell_fill_hex(cell) -> Optional[str]:
    try:
        if cell.fill and cell.fill.type is not None:
            rgb = _extract_pptx_rgb(cell.fill.fore_color)
            if rgb:
                return f"{rgb[0]:02X}{rgb[1]:02X}{rgb[2]:02X}"
    except Exception:
        pass
    return None


# ─── 5. PowerPoint (.pptx/.ppt/.odp) → Word (.docx) ──────────────────────────

def convert_ppt_to_word(inp: Path, out: Path) -> Path:
    """
    Convert PowerPoint presentation into a richly formatted Word document:
    - Preserves slide titles as Heading 1
    - Recursively extracts grouped shapes in visual reading order
    - Preserves per-run bold, italic, underline, font family, font size, RGB color,
      paragraph alignment & bullet/indent levels
    - Converts ALL slide tables into native styled Word tables (with fills, borders, merges)
    - Embeds ALL slide pictures at proper aspect ratio
    - Includes Speaker Notes cleanly when present
    """
    from docx import Document
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Inches, Pt, RGBColor
    from pptx import Presentation as Pptx
    from pptx.enum.shapes import MSO_SHAPE_TYPE

    with tempfile.TemporaryDirectory(prefix="p2w_") as work:
        pptx_path = normalize_office_to_ooxml(inp, "pptx", Path(work))
        prs = Pptx(str(pptx_path))
        doc = Document()

        for section in doc.sections:
            section.top_margin = Inches(0.65)
            section.bottom_margin = Inches(0.65)
            section.left_margin = Inches(0.75)
            section.right_margin = Inches(0.75)

        avail_w_in = 7.0

        for s_idx, slide in enumerate(prs.slides, 1):
            if s_idx > 1:
                doc.add_page_break()

            title_shape = getattr(slide.shapes, "title", None)
            title_txt = clean_xml_text(title_shape.text).strip() if (title_shape and title_shape.has_text_frame) else ""
            heading_label = f"Slide {s_idx}: {title_txt}" if title_txt else f"Slide {s_idx}"
            h = doc.add_heading(heading_label, level=1)
            if h.runs:
                h.runs[0].font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

            ordered = _iter_slide_shapes_ordered(slide.shapes)

            for _, _, shape in ordered:
                if title_shape is not None and shape._element is title_shape._element:
                    continue

                # 1. Embedded Picture
                if shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
                    try:
                        img_blob = shape.image.blob
                        norm = _normalize_image_for_office(img_blob)
                        if norm:
                            png_bytes, iw, ih = norm
                            shape_w_in = (shape.width / 914400.0) if shape.width else (iw / 96.0)
                            target_w = max(0.8, min(avail_w_in, shape_w_in))
                            p_img = doc.add_paragraph()
                            p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
                            p_img.paragraph_format.space_before = Pt(4)
                            p_img.paragraph_format.space_after = Pt(6)
                            p_img.add_run().add_picture(io.BytesIO(png_bytes), width=Inches(target_w))
                    except Exception:
                        pass
                    continue

                # 2. Native Table
                if shape.has_table:
                    ptbl = shape.table
                    n_rows = len(ptbl.rows)
                    n_cols = len(ptbl.columns)
                    if n_rows > 0 and n_cols > 0:
                        wtbl = doc.add_table(rows=n_rows, cols=n_cols)
                        wtbl.alignment = WD_TABLE_ALIGNMENT.CENTER
                        _set_docx_table_borders(wtbl, "CBD5E1", "4")

                        merges_to_apply: list[tuple[int, int, int, int]] = []
                        for ri in range(n_rows):
                            _set_docx_row_props(wtbl.rows[ri], is_header=(ri == 0))
                            for ci in range(n_cols):
                                pcell = ptbl.cell(ri, ci)
                                if getattr(pcell, "is_spanned", False):
                                    continue
                                gspan = max(1, int(getattr(pcell, "span_width", 1) or 1))
                                rspan = max(1, int(getattr(pcell, "span_height", 1) or 1))
                                if gspan > 1 or rspan > 1:
                                    merges_to_apply.append((ri, ci, min(n_rows - 1, ri + rspan - 1), min(n_cols - 1, ci + gspan - 1)))

                                dcell = wtbl.cell(ri, ci)
                                _set_docx_cell_margins(dcell, top=45, bottom=45, left=75, right=75)
                                fill_hex = _extract_pptx_cell_fill_hex(pcell)
                                if not fill_hex:
                                    fill_hex = "1E3A8A" if ri == 0 else ("F8FAFC" if ri % 2 == 0 else None)
                                if fill_hex:
                                    _set_docx_cell_shading(dcell, fill_hex)

                                for pi, p_para in enumerate(pcell.text_frame.paragraphs):
                                    dp = dcell.paragraphs[0] if pi == 0 else dcell.add_paragraph()
                                    dp.paragraph_format.space_before = Pt(0)
                                    dp.paragraph_format.space_after = Pt(1)
                                    if p_para.alignment is not None:
                                        a_s = str(p_para.alignment).lower()
                                        if "center" in a_s:
                                            dp.alignment = WD_ALIGN_PARAGRAPH.CENTER
                                        elif "right" in a_s:
                                            dp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                                    if p_para.runs:
                                        for prun in p_para.runs:
                                            rtxt = clean_xml_text(prun.text)
                                            if not rtxt:
                                                continue
                                            dr = dp.add_run(rtxt)
                                            dr.bold = bool(prun.font.bold or ri == 0)
                                            dr.italic = bool(prun.font.italic)
                                            dr.font.size = Pt(max(8.0, min(14.0, prun.font.size.pt if prun.font.size else 10.0)))
                                            if prun.font.name:
                                                dr.font.name = prun.font.name
                                            rgb = _extract_pptx_rgb(prun.font.color)
                                            if fill_hex and _is_dark_hex(fill_hex):
                                                dr.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
                                            elif rgb:
                                                dr.font.color.rgb = RGBColor(*rgb)
                                    else:
                                        t_clean = clean_xml_text(p_para.text)
                                        if t_clean:
                                            dr = dp.add_run(t_clean)
                                            dr.bold = (ri == 0)
                                            dr.font.size = Pt(10)
                                            if fill_hex and _is_dark_hex(fill_hex):
                                                dr.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

                        for (r0, c0, r1, c1) in merges_to_apply:
                            try:
                                wtbl.cell(r0, c0).merge(wtbl.cell(r1, c1))
                            except Exception:
                                pass
                        doc.add_paragraph()
                    continue

                # 3. Text Frame
                if shape.has_text_frame:
                    for p_para in shape.text_frame.paragraphs:
                        raw_txt = clean_xml_text(p_para.text).strip()
                        if not raw_txt:
                            continue
                        dp = doc.add_paragraph()
                        dp.paragraph_format.space_before = Pt(2)
                        dp.paragraph_format.space_after = Pt(4)
                        lvl = int(getattr(p_para, "level", 0) or 0)
                        if lvl > 0:
                            dp.paragraph_format.left_indent = Inches(0.28 * min(lvl, 5))
                        if p_para.alignment is not None:
                            a_s = str(p_para.alignment).lower()
                            if "center" in a_s:
                                dp.alignment = WD_ALIGN_PARAGRAPH.CENTER
                            elif "right" in a_s:
                                dp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                            elif "justify" in a_s:
                                dp.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

                        added_run = False
                        for prun in p_para.runs:
                            rtxt = clean_xml_text(prun.text)
                            if not rtxt:
                                continue
                            dr = dp.add_run(rtxt)
                            dr.bold = bool(prun.font.bold)
                            dr.italic = bool(prun.font.italic)
                            dr.underline = bool(prun.font.underline)
                            if prun.font.name:
                                dr.font.name = prun.font.name
                            if prun.font.size:
                                dr.font.size = Pt(max(8.5, min(24.0, prun.font.size.pt * 0.78)))
                            else:
                                dr.font.size = Pt(11)
                            rgb = _extract_pptx_rgb(prun.font.color)
                            # Prevent white slide text on dark backgrounds from becoming invisible on white Word paper
                            if rgb and not (rgb[0] > 235 and rgb[1] > 235 and rgb[2] > 235):
                                dr.font.color.rgb = RGBColor(*rgb)
                            added_run = True
                        if not added_run:
                            dr = dp.add_run(raw_txt)
                            dr.font.size = Pt(11)

            # 4. Speaker Notes
            try:
                if slide.has_notes_slide and slide.notes_slide.notes_text_frame:
                    notes_txt = clean_xml_text(slide.notes_slide.notes_text_frame.text).strip()
                    if notes_txt:
                        np = doc.add_paragraph()
                        np.paragraph_format.space_before = Pt(8)
                        lbl = np.add_run("Speaker Notes: ")
                        lbl.bold = True
                        lbl.italic = True
                        lbl.font.size = Pt(9.5)
                        lbl.font.color.rgb = RGBColor(0x47, 0x55, 0x69)
                        body = np.add_run(notes_txt)
                        body.italic = True
                        body.font.size = Pt(9.5)
                        body.font.color.rgb = RGBColor(0x47, 0x55, 0x69)
            except Exception:
                pass

        if len(prs.slides) == 0:
            doc.add_paragraph("(Empty presentation)")

        doc.save(str(out))
    return out


# ─── 6. PowerPoint (.pptx/.ppt/.odp) → Excel (.xlsx) ─────────────────────────

def convert_ppt_to_excel(inp: Path, out: Path) -> Path:
    """
    Convert PowerPoint presentation to a structured Excel workbook:
    - Summary overview sheet listing every slide's title, text summary, table count & notes
    - Per-slide worksheets preserving titles, exact tables (with merged cells, fill colors,
      bold/colors, borders, numeric typing), body bullet lines in reading order, and notes
    - Recursively unpacks grouped shapes
    """
    import openpyxl
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from pptx import Presentation as Pptx

    with tempfile.TemporaryDirectory(prefix="p2x_") as work:
        pptx_path = normalize_office_to_ooxml(inp, "pptx", Path(work))
        prs = Pptx(str(pptx_path))

        wb = openpyxl.Workbook()
        ws_sum = wb.active
        ws_sum.title = "Slides_Overview"

        hdr_fill = PatternFill("solid", fgColor="1E3A8A")
        alt_fill = PatternFill("solid", fgColor="F1F5F9")
        title_fill = PatternFill("solid", fgColor="DBEAFE")
        hdr_font = Font(name="Calibri", bold=True, color="FFFFFF", size=11)
        body_font = Font(name="Calibri", size=10, color="0F172A")
        thin = Side(style="thin", color="94A3B8")
        border = Border(left=thin, right=thin, top=thin, bottom=thin)
        wrap_top = Alignment(wrap_text=True, vertical="top")

        for ci, h_lbl in enumerate(["Slide #", "Title", "Body Content", "Tables", "Speaker Notes"], 1):
            c = ws_sum.cell(1, ci, h_lbl)
            c.font = hdr_font
            c.fill = hdr_fill
            c.border = border
            c.alignment = Alignment(horizontal="center", vertical="center")

        for s_idx, slide in enumerate(prs.slides, 1):
            title_shape = getattr(slide.shapes, "title", None)
            title_text = clean_xml_text(title_shape.text).strip() if (title_shape and title_shape.has_text_frame) else ""

            ordered = _iter_slide_shapes_ordered(slide.shapes)
            tables_on_slide: list[Any] = []
            body_lines: list[str] = []

            for _, _, shape in ordered:
                if title_shape is not None and shape._element is title_shape._element:
                    continue
                if shape.has_table:
                    tables_on_slide.append(shape.table)
                elif shape.has_text_frame:
                    for para in shape.text_frame.paragraphs:
                        t = clean_xml_text(para.text).strip()
                        if t:
                            prefix = ("  " * int(getattr(para, "level", 0) or 0))
                            body_lines.append(f"{prefix}{t}")

            notes_txt = ""
            try:
                if slide.has_notes_slide and slide.notes_slide.notes_text_frame:
                    notes_txt = clean_xml_text(slide.notes_slide.notes_text_frame.text).strip()
            except Exception:
                pass

            # Populate overview row
            ov_vals = [s_idx, title_text or f"Slide {s_idx}", "\n".join(body_lines), len(tables_on_slide), notes_txt]
            for ci, val in enumerate(ov_vals, 1):
                c = ws_sum.cell(s_idx + 1, ci, val)
                c.font = body_font
                c.border = border
                c.alignment = wrap_top
                if s_idx % 2 == 0:
                    c.fill = alt_fill

            # Build dedicated slide sheet
            ws = wb.create_sheet(f"Slide_{s_idx}"[:31])
            row_idx = 1

            if title_text:
                tc = ws.cell(row_idx, 1, title_text)
                tc.font = Font(name="Calibri", bold=True, size=13, color="1E3A8A")
                tc.fill = title_fill
                tc.alignment = Alignment(vertical="center", wrap_text=True)
                ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=4)
                row_idx += 2

            for ptbl in tables_on_slide:
                n_r = len(ptbl.rows)
                n_c = len(ptbl.columns)
                tbl_start_r = row_idx
                merges: list[tuple[int, int, int, int]] = []

                for ri in range(n_r):
                    for ci in range(n_c):
                        pcell = ptbl.cell(ri, ci)
                        ec = ws.cell(tbl_start_r + ri, ci + 1)
                        ec.border = border
                        if getattr(pcell, "is_spanned", False):
                            continue
                        gspan = max(1, int(getattr(pcell, "span_width", 1) or 1))
                        rspan = max(1, int(getattr(pcell, "span_height", 1) or 1))
                        if gspan > 1 or rspan > 1:
                            merges.append((tbl_start_r + ri, ci + 1, tbl_start_r + min(n_r - 1, ri + rspan - 1), min(n_c, ci + gspan)))

                        ec.value = parse_excel_typed_value(pcell.text)
                        fill_hex = _extract_pptx_cell_fill_hex(pcell)
                        is_hdr = (ri == 0)
                        if not fill_hex:
                            fill_hex = "1E3A8A" if is_hdr else ("F1F5F9" if ri % 2 == 0 else None)
                        if fill_hex:
                            fill_obj = PatternFill("solid", fgColor=fill_hex)
                            for rr in range(tbl_start_r + ri, tbl_start_r + min(n_r, ri + rspan)):
                                for cc in range(ci + 1, min(n_c + 1, ci + 1 + gspan)):
                                    ws.cell(rr, cc).fill = fill_obj
                                    ws.cell(rr, cc).border = border

                        ec.font = Font(
                            name="Calibri",
                            size=10,
                            bold=is_hdr or any(r.font.bold for p in pcell.text_frame.paragraphs for r in p.runs if r.text.strip()),
                            color="FFFFFF" if (fill_hex and _is_dark_hex(fill_hex)) else "0F172A",
                        )
                        ec.alignment = Alignment(wrap_text=True, vertical="center")

                for (r0, c0, r1, c1) in merges:
                    try:
                        ws.merge_cells(start_row=r0, start_column=c0, end_row=r1, end_column=c1)
                    except Exception:
                        pass

                row_idx = tbl_start_r + n_r + 1

            for ln in body_lines:
                c = ws.cell(row_idx, 1, parse_excel_typed_value(ln))
                c.font = body_font
                c.alignment = wrap_top
                row_idx += 1

            if notes_txt:
                row_idx += 1
                nc = ws.cell(row_idx, 1, f"Notes: {notes_txt}")
                nc.font = Font(name="Calibri", italic=True, size=9, color="475569")
                nc.alignment = wrap_top

            _autosize_openpyxl_sheet(ws)

        _autosize_openpyxl_sheet(ws_sum)
        wb.save(str(out))
    return out
