"""
PDF Tool — FastAPI Backend v2.0
================================
High-quality PDF/Office conversions using Python open-source tools.

Run:
    uvicorn main:app --reload --port 8000
"""

import os, shutil, tempfile, subprocess, uuid, json
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

app = FastAPI(title="PDF Tool Backend", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = Path(tempfile.gettempdir()) / "pdf_tool_backend"
TEMP_DIR.mkdir(exist_ok=True)


# ─── Helpers ───────────────────────────────────────────────────

def temp_path(suffix: str) -> Path:
    return TEMP_DIR / f"{uuid.uuid4().hex}{suffix}"


def cleanup(*paths: Path):
    for p in paths:
        try:
            if p.exists():
                shutil.rmtree(p) if p.is_dir() else p.unlink()
        except Exception:
            pass


def hex_to_rgb(hx: str):
    hx = str(hx).lstrip("#")
    if len(hx) == 6:
        return tuple(int(hx[i:i+2], 16) / 255.0 for i in (0, 2, 4))
    return (0, 0, 0)


def has_non_latin(text: str) -> bool:
    return any(ord(c) > 0x00FF for c in text)


# ─── Root & Health ─────────────────────────────────────────────

@app.get("/")
def read_root():
    return {
        "status": "ok",
        "message": "PDF Tool Backend v2.0 is running! 🚀",
        "endpoints": [
            "/convert/pdf-to-word", "/convert/pdf-to-excel", "/convert/pdf-to-ppt",
            "/convert/office-to-pdf", "/convert/make-searchable",
            "/convert/ppt-to-word", "/convert/word-to-ppt",
            "/compress-pdf", "/extract-tables", "/extract-images",
            "/search-replace", "/edit-pdf", "/ocr/analyze",
        ]
    }


@app.get("/health")
def health():
    return {"status": "ok"}


# ─── AUTO-OCR HELPER ────────────────────────────────────────────
# Smart scan detection: checks text density per page, not just total chars.
# If >= 50% pages are mostly blank of text → treat as scanned.

def is_pdf_scanned(inp_path: Path) -> bool:
    """Returns True if the PDF is a scanned/image-based document."""
    try:
        import fitz
        doc = fitz.open(inp_path)
        scanned_pages = 0
        total_pages = len(doc)
        if total_pages == 0:
            doc.close()
            return False
        for page in doc:
            text = page.get_text("text").strip()
            # A normal page with real text has at least 20 chars
            if len(text) < 20:
                scanned_pages += 1
        doc.close()
        # Consider scanned if >50% pages have very little text
        return scanned_pages / total_pages > 0.5
    except Exception:
        return False


def ensure_auto_ocr(inp_path: Path) -> Path:
    """If PDF is scanned, run OCRmyPDF to make it searchable first."""
    if not is_pdf_scanned(inp_path):
        return inp_path

    print(f"[Auto-OCR] Detected scanned PDF, running OCR: {inp_path.name}")
    
    # ─── PADDLE OCR TEST (User Requested) ───────────────────────────
    try:
        print("[Auto-OCR] Attempting PaddleOCR first...")
        from paddleocr import PaddleOCR
        # WARNING: Loading this model on Render Free Tier (512MB RAM) 
        # will likely cause an instant OOM (Out of Memory) crash.
        ocr = PaddleOCR(use_angle_cls=True, lang='en')
        print("[Auto-OCR] PaddleOCR loaded successfully!")
        # Note: PaddleOCR extracts text strings, it doesn't build a 
        # searchable PDF file automatically. We need a PDF file for the 
        # next steps (like Word/Excel conversion).
        raise Exception("PaddleOCR loaded, but cannot generate a searchable PDF file directly.")
    except Exception as e:
        print(f"[Auto-OCR] PaddleOCR Failed/Skipped: {e}")
        print("[Auto-OCR] Falling back to Tesseract (ocrmypdf) for stable PDF generation...")
    # ────────────────────────────────────────────────────────────────

    try:
        result = subprocess.run(
            ["ocrmypdf", "--force-ocr", "-l", "eng+hin",
             "--output-type", "pdf", "--optimize", "0",
             str(inp_path), str(inp_path)],
            capture_output=True, text=True, timeout=180
        )
        if result.returncode == 0:
            print("[Auto-OCR] OCR completed successfully.")
        else:
            print(f"[Auto-OCR] Warning: {result.stderr[:200]}")
    except subprocess.TimeoutExpired:
        print("[Auto-OCR] Timed out, proceeding without OCR.")
    except Exception as e:
        print(f"[Auto-OCR] Failed: {e}")

    return inp_path


# ─── 1. PDF → Word ─────────────────────────────────────────────

@app.post("/convert/pdf-to-word")
async def pdf_to_word(file: UploadFile = File(...)):
    try:
        from pdf2docx import Converter
    except ImportError:
        raise HTTPException(500, "Run: pip install pdf2docx PyMuPDF")

    inp = temp_path(".pdf")
    out = temp_path(".docx")
    try:
        inp.write_bytes(await file.read())
        inp = ensure_auto_ocr(inp)

        cv = Converter(str(inp))
        cv.convert(str(out), multi_processing=False,
                   line_overlap_threshold=0.9,
                   min_svg_gap_dx=15.0)
        cv.close()

        return FileResponse(
            str(out),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=Path(file.filename).stem + ".docx"
        )
    except Exception as e:
        cleanup(inp, out)
        raise HTTPException(500, str(e))


# ─── 2. PDF → Excel ────────────────────────────────────────────

@app.post("/convert/pdf-to-excel")
async def pdf_to_excel(file: UploadFile = File(...), method: str = Form("auto")):
    try:
        import pdfplumber, openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    except ImportError:
        raise HTTPException(500, "Run: pip install pdfplumber openpyxl")

    inp = temp_path(".pdf")
    out = temp_path(".xlsx")
    try:
        inp.write_bytes(await file.read())
        inp = ensure_auto_ocr(inp)

        wb = openpyxl.Workbook()
        wb.remove(wb.active)
        tables_found = False

        # Try camelot (best for bordered tables)
        try:
            import camelot
            for flavor in (["lattice", "stream"] if method == "auto" else [method]):
                tables = camelot.read_pdf(str(inp), pages="all", flavor=flavor)
                if tables and len(tables) > 0:
                    tables_found = True
                    for i, tbl in enumerate(tables):
                        sheet_name = f"Table_{i+1}_p{tbl.page}"[:31]
                        ws = wb.create_sheet(sheet_name)
                        for r_idx, row in enumerate(tbl.df.values, 1):
                            for c_idx, val in enumerate(row, 1):
                                cell = ws.cell(r_idx, c_idx, str(val) if val else "")
                                if r_idx == 1:
                                    cell.font = Font(bold=True)
                                    cell.fill = PatternFill("solid", fgColor="D9E1F2")
                                cell.border = Border(
                                    left=Side(style="thin"), right=Side(style="thin"),
                                    top=Side(style="thin"), bottom=Side(style="thin")
                                )
                                cell.alignment = Alignment(wrap_text=True)
                    break
        except Exception as camelot_err:
            print(f"Camelot failed: {camelot_err}")

        # Fallback: pdfplumber
        if not tables_found:
            with pdfplumber.open(str(inp)) as pdf:
                for pg_num, pg in enumerate(pdf.pages, 1):
                    ws = wb.create_sheet(f"Page_{pg_num}")
                    row_idx = 1
                    pg_tables = pg.extract_tables()
                    if pg_tables:
                        for tbl in pg_tables:
                            for row in tbl:
                                for c_idx, v in enumerate(row, 1):
                                    ws.cell(row_idx, c_idx, v or "")
                                row_idx += 1
                            row_idx += 1
                    else:
                        # Write raw text as single column
                        for line in (pg.extract_text() or "").splitlines():
                            if line.strip():
                                ws.cell(row_idx, 1, line)
                                row_idx += 1

        if not wb.sheetnames:
            wb.create_sheet("Sheet1")
        wb.save(str(out))

        return FileResponse(
            str(out),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=Path(file.filename).stem + ".xlsx"
        )
    except Exception as e:
        cleanup(inp, out)
        raise HTTPException(500, str(e))


# ─── 3. PDF → PPT ──────────────────────────────────────────────

@app.post("/convert/pdf-to-ppt")
async def pdf_to_ppt(file: UploadFile = File(...), dpi: int = Form(150)):
    try:
        import fitz
        from pptx import Presentation
        from pptx.util import Inches, Pt
        from pptx.dml.color import RGBColor
        import io
    except ImportError:
        raise HTTPException(500, "Run: pip install PyMuPDF python-pptx")

    inp = temp_path(".pdf")
    out = temp_path(".pptx")
    try:
        inp.write_bytes(await file.read())
        inp = ensure_auto_ocr(inp)

        doc = fitz.open(str(inp))
        prs = Presentation()

        for page in doc:
            pix = page.get_pixmap(matrix=fitz.Matrix(dpi / 72, dpi / 72))
            w_in = page.rect.width / 72
            h_in = page.rect.height / 72
            prs.slide_width = Inches(w_in)
            prs.slide_height = Inches(h_in)
            slide = prs.slides.add_slide(prs.slide_layouts[6])
            slide.shapes.add_picture(io.BytesIO(pix.tobytes("png")), 0, 0, Inches(w_in), Inches(h_in))

            # Add invisible text layer for searchability
            for block in page.get_text("dict").get("blocks", []):
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        txt = span.get("text", "").strip()
                        if not txt:
                            continue
                        x0, y0, x1, y1 = span["bbox"]
                        tb = slide.shapes.add_textbox(
                            Inches(x0 / 72), Inches(y0 / 72),
                            Inches(max((x1 - x0) / 72, 0.1)), Inches(max((y1 - y0) / 72, 0.1))
                        )
                        run = tb.text_frame.paragraphs[0].add_run()
                        run.text = txt
                        run.font.size = Pt(max(6, span.get("size", 12)))
                        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)  # invisible
                        tb.fill.background()
                        tb.line.fill.background()

        doc.close()
        prs.save(str(out))

        return FileResponse(
            str(out),
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            filename=Path(file.filename).stem + ".pptx"
        )
    except Exception as e:
        cleanup(inp, out)
        raise HTTPException(500, str(e))


# ─── 4. Office → PDF (LibreOffice) ────────────────────────────

def libreoffice_convert(inp: Path, out_dir: Path) -> Path:
    lo = next((c for c in [
        "soffice", "libreoffice",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "/usr/bin/soffice",
    ] if shutil.which(c) or Path(c).exists()), None)
    if not lo:
        raise RuntimeError("LibreOffice not found.")
    r = subprocess.run(
        [lo, "--headless", "--convert-to", "pdf", "--outdir", str(out_dir), str(inp)],
        capture_output=True, text=True, timeout=120
    )
    if r.returncode != 0:
        raise RuntimeError(r.stderr[:500])
    out_pdf = out_dir / (inp.stem + ".pdf")
    if not out_pdf.exists():
        raise RuntimeError("LibreOffice output PDF not found")
    return out_pdf


@app.post("/convert/office-to-pdf")
async def office_to_pdf(file: UploadFile = File(...)):
    ext = Path(file.filename).suffix.lower()
    if ext not in {".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls", ".odt", ".odp"}:
        raise HTTPException(400, f"Unsupported format: {ext}")

    inp = temp_path(ext)
    out_dir = TEMP_DIR / uuid.uuid4().hex
    out_dir.mkdir(exist_ok=True)
    try:
        inp.write_bytes(await file.read())
        out_pdf = libreoffice_convert(inp, out_dir)
        return FileResponse(
            str(out_pdf), media_type="application/pdf",
            filename=Path(file.filename).stem + ".pdf"
        )
    except Exception as e:
        cleanup(inp, out_dir)
        raise HTTPException(500, str(e))


# ─── 5. Make Searchable PDF (OCRmyPDF) ─────────────────────────

@app.post("/convert/make-searchable")
async def make_searchable(
    file: UploadFile = File(...),
    lang: str = Form("hin+eng"),
    deskew: bool = Form(True),
    rotate: bool = Form(True)
):
    try:
        import ocrmypdf
    except ImportError:
        raise HTTPException(500, "Run: pip install ocrmypdf")

    inp = temp_path(".pdf")
    out = temp_path("_searchable.pdf")
    try:
        inp.write_bytes(await file.read())
        ocrmypdf.ocr(
            str(inp), str(out), language=lang,
            deskew=deskew, rotate_pages=rotate,
            skip_text=True, output_type="pdfa",
            progress_bar=False
        )
        return FileResponse(
            str(out), media_type="application/pdf",
            filename=Path(file.filename).stem + "_searchable.pdf"
        )
    except Exception as e:
        cleanup(inp, out)
        raise HTTPException(500, str(e))


# ─── 6. PPT → Word ────────────────────────────────────────────

@app.post("/convert/ppt-to-word")
async def ppt_to_word(file: UploadFile = File(...)):
    try:
        from pptx import Presentation as Pptx
        from docx import Document
        from docx.shared import Pt as DPt
    except ImportError:
        raise HTTPException(500, "Run: pip install python-pptx python-docx")

    inp = temp_path(".pptx")
    out = temp_path(".docx")
    try:
        inp.write_bytes(await file.read())
        prs = Pptx(str(inp))
        doc = Document()
        doc.add_heading("Presentation Content", 0)

        for i, slide in enumerate(prs.slides, 1):
            doc.add_heading(f"Slide {i}", 1)
            for shape in slide.shapes:
                if shape.has_text_frame:
                    for para in shape.text_frame.paragraphs:
                        txt = para.text.strip()
                        if txt:
                            p = doc.add_paragraph(txt)
                            if para.runs and para.runs[0].font.size:
                                p.runs[0].font.size = para.runs[0].font.size

        doc.save(str(out))
        return FileResponse(
            str(out),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=Path(file.filename).stem + ".docx"
        )
    except Exception as e:
        cleanup(inp, out)
        raise HTTPException(500, str(e))


# ─── 7. Word → PPT ────────────────────────────────────────────

@app.post("/convert/word-to-ppt")
async def word_to_ppt(file: UploadFile = File(...)):
    try:
        from docx import Document
        from pptx import Presentation
        from pptx.util import Inches, Pt
    except ImportError:
        raise HTTPException(500, "Run: pip install python-docx python-pptx")

    inp = temp_path(".docx")
    out = temp_path(".pptx")
    try:
        inp.write_bytes(await file.read())
        doc = Document(str(inp))
        prs = Presentation()
        prs.slide_width = Inches(13.33)
        prs.slide_height = Inches(7.5)
        layout = prs.slide_layouts[1]
        content_tf = None

        for para in doc.paragraphs:
            txt = para.text.strip()
            if not txt:
                continue
            style = para.style.name
            if "Heading 1" in style or "Title" in style:
                slide = prs.slides.add_slide(layout)
                slide.shapes.title.text = txt
                content_tf = slide.placeholders[1].text_frame if len(slide.placeholders) > 1 else None
            else:
                if content_tf is None:
                    slide = prs.slides.add_slide(layout)
                    slide.shapes.title.text = "Content"
                    content_tf = slide.placeholders[1].text_frame if len(slide.placeholders) > 1 else None
                if content_tf:
                    p = content_tf.add_paragraph()
                    p.text = txt
                    p.font.size = Pt(18)
                    p.level = 1 if "Heading 2" in style else 0

        if not prs.slides:
            prs.slides.add_slide(prs.slide_layouts[6])
        prs.save(str(out))

        return FileResponse(
            str(out),
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            filename=Path(file.filename).stem + ".pptx"
        )
    except Exception as e:
        cleanup(inp, out)
        raise HTTPException(500, str(e))


# ─── 8. Edit PDF (PyMuPDF redact + rewrite) ────────────────────

@app.post("/edit-pdf")
async def edit_pdf_endpoint(file: UploadFile = File(...), edits: str = Form(...)):
    import fitz
    inp = temp_path(".pdf")
    out = temp_path(".pdf")
    try:
        inp.write_bytes(await file.read())
        edit_actions = json.loads(edits)
        doc = fitz.open(str(inp))

        for action in edit_actions:
            page_idx = action.get("page", 0)
            if page_idx >= len(doc):
                continue
            page = doc[page_idx]
            x, y, w, h = action["x"], action["y"], action["w"], action["h"]
            new_text = action.get("newText", "")

            bg_color = hex_to_rgb(action.get("bgColor", "#ffffff"))
            rect = fitz.Rect(x - 2, y - 2, x + w + 2, y + h + 2)
            page.add_redact_annot(rect, fill=bg_color)
            page.apply_redactions()

            if not new_text:
                continue

            fg_color = hex_to_rgb(action.get("color", "#000000"))
            orig_size = action.get("fontSize", 12)
            fontname = "helv"
            if action.get("bold") and action.get("italic"):
                fontname = "hebi"
            elif action.get("bold"):
                fontname = "hebo"
            elif action.get("italic"):
                fontname = "hebi"

            if has_non_latin(new_text):
                font_key = "NotoSansDevanagari-Bold.ttf" if action.get("bold") else "NotoSansDevanagari-Regular.ttf"
                font_path = Path(__file__).parent / "fonts" / font_key
                if not font_path.exists():
                    font_path = Path(__file__).parent.parent / "pdf-tool" / "public" / "fonts" / font_key
                if font_path.exists():
                    fontname = "deva"
                    page.insert_font(fontname=fontname, fontfile=str(font_path))

            try:
                text_len = fitz.get_text_length(new_text, fontname=fontname, fontsize=orig_size)
            except Exception:
                text_len = len(new_text) * orig_size * 0.5

            final_size = orig_size
            if text_len > w and w > 10:
                final_size = max(orig_size * 0.6, orig_size * (w / text_len))

            baseline_y = y + (h * 0.78)
            page.insert_text(
                fitz.Point(x, baseline_y), new_text,
                fontname=fontname, fontsize=final_size, color=fg_color
            )

        doc.save(str(out), garbage=3, deflate=True)
        doc.close()
        return FileResponse(str(out), media_type="application/pdf",
                            filename="edited_" + file.filename)
    except Exception as e:
        cleanup(inp, out)
        raise HTTPException(500, str(e))


# ─── 9. Compress PDF ───────────────────────────────────────────
# quality: screen (max), ebook (good), printer (high quality), prepress (best)

@app.post("/compress-pdf")
async def compress_pdf(
    file: UploadFile = File(...),
    quality: str = Form("ebook")   # screen | ebook | printer | prepress
):
    if quality not in {"screen", "ebook", "printer", "prepress"}:
        quality = "ebook"

    inp = temp_path(".pdf")
    out = temp_path("_compressed.pdf")
    try:
        inp.write_bytes(await file.read())
        gs_cmd = [
            "gs", "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.4",
            f"-dPDFSETTINGS=/{quality}", "-dNOPAUSE", "-dQUIET",
            "-dBATCH", f"-sOutputFile={out}", str(inp)
        ]
        try:
            subprocess.run(gs_cmd, check=True, stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, timeout=120)
        except Exception:
            import fitz
            doc = fitz.open(inp)
            doc.save(str(out), garbage=4, deflate=True, clean=True)
            doc.close()

        return FileResponse(str(out), media_type="application/pdf",
                            filename=f"compressed_{file.filename}")
    except Exception as e:
        cleanup(inp, out)
        raise HTTPException(500, str(e))


# ─── 10. Extract Tables ────────────────────────────────────────

@app.post("/extract-tables")
async def extract_tables(file: UploadFile = File(...)):
    try:
        import camelot, pandas as pd
    except ImportError:
        raise HTTPException(500, "Run: pip install camelot-py[cv] pandas openpyxl")

    inp = temp_path(".pdf")
    out = temp_path(".xlsx")
    try:
        inp.write_bytes(await file.read())

        tables = None
        for flavor in ["lattice", "stream"]:
            try:
                t = camelot.read_pdf(str(inp), pages="all", flavor=flavor)
                if t and len(t) > 0:
                    tables = t
                    break
            except Exception:
                continue

        if not tables:
            raise HTTPException(400, "No tables found in this PDF.")

        with pd.ExcelWriter(str(out), engine="openpyxl") as writer:
            for i, table in enumerate(tables):
                sheet_name = f"Table_{i+1}"[:31]
                df = table.df
                # Use first row as header if it looks like one
                df.to_excel(writer, sheet_name=sheet_name, index=False, header=False)

        return FileResponse(
            str(out),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=f"tables_{Path(file.filename).stem}.xlsx"
        )
    except HTTPException:
        raise
    except Exception as e:
        cleanup(inp, out)
        raise HTTPException(500, str(e))


# ─── 11. Extract Images ────────────────────────────────────────

@app.post("/extract-images")
async def extract_images(file: UploadFile = File(...)):
    import zipfile
    inp = temp_path(".pdf")
    out_zip = temp_path(".zip")
    img_dir = temp_path("_imgdir")
    img_dir.mkdir(exist_ok=True)

    try:
        inp.write_bytes(await file.read())
        import fitz
        doc = fitz.open(inp)
        count = 0
        seen_xrefs = set()  # deduplicate images appearing on multiple pages

        for page_num in range(len(doc)):
            page = doc[page_num]
            for img in page.get_images(full=True):
                xref = img[0]
                if xref in seen_xrefs:
                    continue
                seen_xrefs.add(xref)
                try:
                    base_image = doc.extract_image(xref)
                    image_bytes = base_image["image"]
                    if len(image_bytes) < 500:  # skip tiny/empty images
                        continue
                    ext = base_image.get("ext", "png")
                    count += 1
                    img_filepath = img_dir / f"page_{page_num+1}_img_{count}.{ext}"
                    img_filepath.write_bytes(image_bytes)
                except Exception:
                    continue

        doc.close()

        if count == 0:
            cleanup(inp, out_zip, img_dir)
            raise HTTPException(400, "No images found in this PDF.")

        with zipfile.ZipFile(str(out_zip), "w", zipfile.ZIP_DEFLATED) as zipf:
            for f in img_dir.iterdir():
                zipf.write(f, f.name)

        return FileResponse(str(out_zip), media_type="application/zip",
                            filename=f"images_{Path(file.filename).stem}.zip")
    except HTTPException:
        raise
    except Exception as e:
        cleanup(inp, out_zip, img_dir)
        raise HTTPException(500, str(e))


# ─── 12. Search & Replace ──────────────────────────────────────
# Matches the original font size so replaced text looks correct.

@app.post("/search-replace")
async def search_replace(
    file: UploadFile = File(...),
    search_term: str = Form(...),
    replace_term: str = Form(...)
):
    inp = temp_path(".pdf")
    out = temp_path("_replaced.pdf")
    try:
        inp.write_bytes(await file.read())
        import fitz
        doc = fitz.open(inp)
        match_count = 0

        for page in doc:
            instances = page.search_for(search_term)
            if not instances:
                continue
            match_count += len(instances)

            # Collect original font info before redacting
            font_info = {}
            blocks = page.get_text("dict").get("blocks", [])
            for block in blocks:
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        if search_term.lower() in span["text"].lower():
                            font_info = {
                                "size": span.get("size", 11),
                                "color": span.get("color", 0)
                            }

            # Redact (erase old text with white fill)
            for inst in instances:
                page.add_redact_annot(inst, fill=(1, 1, 1))
            page.apply_redactions()

            # Insert replacement with matched font size
            font_size = font_info.get("size", 11)
            # Convert packed int color to tuple
            raw_color = font_info.get("color", 0)
            if isinstance(raw_color, int):
                r = ((raw_color >> 16) & 0xFF) / 255.0
                g = ((raw_color >> 8) & 0xFF) / 255.0
                b = (raw_color & 0xFF) / 255.0
                text_color = (r, g, b)
            else:
                text_color = (0, 0, 0)

            for inst in instances:
                page.insert_text(
                    fitz.Point(inst.x0, inst.y1 - 1),
                    replace_term,
                    fontsize=font_size,
                    color=text_color
                )

        doc.save(str(out))
        doc.close()

        return FileResponse(
            str(out), media_type="application/pdf",
            filename=f"replaced_{file.filename}",
            headers={
                "X-Match-Count": str(match_count),
                "Access-Control-Expose-Headers": "X-Match-Count"
            }
        )
    except Exception as e:
        cleanup(inp, out)
        raise HTTPException(500, str(e))


# ─── 13. OCR Analyze (Detect Scan + Return Text) ──────────────

@app.post("/ocr/analyze")
async def ocr_analyze(file: UploadFile = File(...)):
    """
    Analyze a PDF: detect if it's scanned, extract text per page.
    Returns JSON with is_scanned flag and text for each page.
    """
    inp = temp_path(".pdf")
    try:
        inp.write_bytes(await file.read())
        import fitz
        doc = fitz.open(inp)
        pages_data = []
        total_chars = 0
        for i, page in enumerate(doc):
            text = page.get_text("text")
            total_chars += len(text.strip())
            pages_data.append({"page": i + 1, "char_count": len(text.strip()), "text_preview": text[:300]})
        doc.close()

        scanned = is_pdf_scanned(inp)
        return JSONResponse({
            "success": True,
            "is_scanned": scanned,
            "total_chars": total_chars,
            "pages": pages_data
        })
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        cleanup(inp)
