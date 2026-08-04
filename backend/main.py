"""
PDF Tool — FastAPI Backend
===========================
High-quality PDF/Office conversions using Python open-source tools.

Run:
    uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import os, shutil, tempfile, subprocess, uuid
from pathlib import Path

app = FastAPI(title="PDF Tool Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = Path(tempfile.gettempdir()) / "pdf_tool_backend"
TEMP_DIR.mkdir(exist_ok=True)


def temp_path(suffix: str) -> Path:
    return TEMP_DIR / f"{uuid.uuid4().hex}{suffix}"


def cleanup(*paths: Path):
    for p in paths:
        try:
            if p.exists():
                shutil.rmtree(p) if p.is_dir() else p.unlink()
        except Exception:
            pass


# ─── Health ───────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok"}


# ─── 1. PDF → Word (pdf2docx — layout + tables + images) ──────
@app.post("/convert/pdf-to-word")
async def pdf_to_word(file: UploadFile = File(...), ocr_mode: bool = Form(False)):
    try:
        from pdf2docx import Converter
        import fitz
    except ImportError:
        raise HTTPException(500, "Run: pip install pdf2docx PyMuPDF")

    inp = temp_path(".pdf")
    out = temp_path(".docx")
    try:
        inp.write_bytes(await file.read())
        
        # If OCR mode, create a text-only PDF to strip backgrounds and make invisible text visible
        if ocr_mode:
            doc = fitz.open(inp)
            new_doc = fitz.open()
            
            def has_non_latin(text):
                return any(ord(c) > 0x00FF for c in text)
                
            deva_path = Path(__file__).parent.parent / "pdf-tool" / "public" / "fonts" / "NotoSansDevanagari-Regular.ttf"
            
            for page in doc:
                new_page = new_doc.new_page(width=page.rect.width, height=page.rect.height)
                
                # Pre-register devanagari font if needed
                if deva_path.exists():
                    new_page.insert_font(fontname="deva", fontfile=str(deva_path))
                    
                blocks = page.get_text("dict")["blocks"]
                for b in blocks:
                    if b.get("type") == 0:
                        for line in b.get("lines", []):
                            for span in line.get("spans", []):
                                try:
                                    color = fitz.sRGB_to_pdf(span["color"]) if "color" in span else (0,0,0)
                                    text = span["text"]
                                    fontname = "deva" if has_non_latin(text) and deva_path.exists() else "helv"
                                    
                                    new_page.insert_text(fitz.Point(span["origin"][0], span["origin"][1]), 
                                                         text, fontname=fontname, fontsize=span["size"], color=color)
                                except Exception:
                                    pass
            
            # Save to a new temp file to avoid locking issues
            text_only_inp = temp_path("_textonly.pdf")
            new_doc.save(str(text_only_inp))
            doc.close()
            new_doc.close()
            inp = text_only_inp

        cv = Converter(str(inp))
        cv.convert(str(out))
        cv.close()
        return FileResponse(str(out), media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                            filename=Path(file.filename).stem + ".docx")
    except Exception as e:
        cleanup(inp, out); raise HTTPException(500, str(e))


# ─── 2. PDF → Excel (pdfplumber + camelot) ────────────────────
@app.post("/convert/pdf-to-excel")
async def pdf_to_excel(file: UploadFile = File(...), method: str = Form("auto")):
    try:
        import pdfplumber, openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    except ImportError:
        raise HTTPException(500, "Run: pip install pdfplumber openpyxl camelot-py[cv]")

    inp = temp_path(".pdf")
    out = temp_path(".xlsx")
    try:
        inp.write_bytes(await file.read())
        wb = openpyxl.Workbook(); wb.remove(wb.active)
        tables_found = False

        # Try camelot first (best for bordered tables)
        try:
            import camelot
            flavor = method if method in ("lattice", "stream") else "lattice"
            tables = camelot.read_pdf(str(inp), pages="all", flavor=flavor)
            if tables:
                tables_found = True
                for i, tbl in enumerate(tables):
                    ws = wb.create_sheet(f"Table_{i+1}_p{tbl.page}")
                    for r_idx, row in enumerate(tbl.df.values, 1):
                        for c_idx, val in enumerate(row, 1):
                            cell = ws.cell(r_idx, c_idx, str(val) if val else "")
                            if r_idx == 1:
                                cell.font = Font(bold=True)
                                cell.fill = PatternFill("solid", fgColor="D9E1F2")
                            cell.border = Border(left=Side(style="thin"), right=Side(style="thin"),
                                                 top=Side(style="thin"), bottom=Side(style="thin"))
                            cell.alignment = Alignment(wrap_text=True)
        except Exception:
            pass

        # Fallback: pdfplumber
        if not tables_found:
            with pdfplumber.open(str(inp)) as pdf:
                for pg_num, pg in enumerate(pdf.pages, 1):
                    ws = wb.create_sheet(f"Page_{pg_num}"); row_idx = 1
                    for tbl in pg.extract_tables():
                        for row in tbl:
                            for c_idx, v in enumerate(row, 1):
                                ws.cell(row_idx, c_idx, v or "")
                            row_idx += 1
                        row_idx += 1
                    if not pg.extract_tables():
                        for line in (pg.extract_text() or "").splitlines():
                            ws.cell(row_idx, 1, line); row_idx += 1

        if not wb.sheetnames: wb.create_sheet("Sheet1")
        wb.save(str(out))
        return FileResponse(str(out), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            filename=Path(file.filename).stem + ".xlsx")
    except Exception as e:
        cleanup(inp, out); raise HTTPException(500, str(e))


# ─── 3. PDF → PPT (page as image + invisible text layer) ──────
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

    inp = temp_path(".pdf"); out = temp_path(".pptx")
    try:
        inp.write_bytes(await file.read())
        doc = fitz.open(str(inp)); prs = Presentation()
        for page in doc:
            pix = page.get_pixmap(matrix=fitz.Matrix(dpi/72, dpi/72))
            w_in = page.rect.width / 72; h_in = page.rect.height / 72
            prs.slide_width = Inches(w_in); prs.slide_height = Inches(h_in)
            slide = prs.slides.add_slide(prs.slide_layouts[6])
            slide.shapes.add_picture(io.BytesIO(pix.tobytes("png")), 0, 0, Inches(w_in), Inches(h_in))
            for block in page.get_text("dict").get("blocks", []):
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        txt = span.get("text", "").strip()
                        if not txt: continue
                        x0, y0, x1, y1 = span["bbox"]
                        tb = slide.shapes.add_textbox(Inches(x0/72), Inches(y0/72),
                                                      Inches(max((x1-x0)/72, 0.1)), Inches(max((y1-y0)/72, 0.1)))
                        run = tb.text_frame.paragraphs[0].add_run()
                        run.text = txt; run.font.size = Pt(max(6, span.get("size", 12)))
                        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)  # invisible
                        tb.fill.background(); tb.line.fill.background()
        doc.close(); prs.save(str(out))
        return FileResponse(str(out), media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
                            filename=Path(file.filename).stem + ".pptx")
    except Exception as e:
        cleanup(inp, out); raise HTTPException(500, str(e))


# ─── 4. Word / PPT / Excel → PDF  (LibreOffice headless) ──────
def libreoffice_convert(inp: Path, out_dir: Path) -> Path:
    lo = next((c for c in [
        "soffice", "libreoffice",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "/usr/bin/soffice",
    ] if shutil.which(c) or Path(c).exists()), None)
    if not lo:
        raise RuntimeError("LibreOffice not found. Install: https://www.libreoffice.org/download/")
    r = subprocess.run([lo, "--headless", "--convert-to", "pdf", "--outdir", str(out_dir), str(inp)],
                       capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(r.stderr)
    out_pdf = out_dir / (inp.stem + ".pdf")
    if not out_pdf.exists():
        raise RuntimeError("LibreOffice output PDF not found")
    return out_pdf


@app.post("/convert/office-to-pdf")
async def office_to_pdf(file: UploadFile = File(...)):
    ext = Path(file.filename).suffix.lower()
    if ext not in {".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls", ".odt", ".odp"}:
        raise HTTPException(400, "Unsupported format")
    inp = temp_path(ext); out_dir = TEMP_DIR / uuid.uuid4().hex; out_dir.mkdir(exist_ok=True)
    try:
        inp.write_bytes(await file.read())
        out_pdf = libreoffice_convert(inp, out_dir)
        return FileResponse(str(out_pdf), media_type="application/pdf",
                            filename=Path(file.filename).stem + ".pdf")
    except Exception as e:
        cleanup(inp); raise HTTPException(500, str(e))


# ─── 5. OCR with PaddleOCR (multi-direction, Hindi, rotated) ──
@app.post("/ocr/paddle")
async def ocr_paddle(file: UploadFile = File(...), lang: str = Form("en"),
                     use_angle_cls: bool = Form(True), use_gpu: bool = Form(False)):
    try:
        from paddleocr import PaddleOCR
        import fitz, numpy as np
        from PIL import Image
    except ImportError:
        raise HTTPException(500, "Run: pip install paddleocr paddlepaddle pillow PyMuPDF numpy")

    inp = temp_path(Path(file.filename).suffix or ".pdf")
    try:
        inp.write_bytes(await file.read())
        ocr = PaddleOCR(use_angle_cls=use_angle_cls, lang=lang, use_gpu=use_gpu, show_log=False)
        pages_out = []
        if inp.suffix == ".pdf":
            doc = fitz.open(str(inp))
            for pg_num, pg in enumerate(doc):
                pix = pg.get_pixmap(matrix=fitz.Matrix(2, 2))
                img_arr = np.array(Image.frombytes("RGB", [pix.width, pix.height], pix.samples))
                result = ocr.ocr(img_arr, cls=use_angle_cls)
                lines = [{"text": t, "confidence": float(c), "bbox": b}
                         for line in (result[0] or []) for b, (t, c) in [line]]
                pages_out.append({"page": pg_num+1, "lines": lines})
            doc.close()
        else:
            img_arr = np.array(Image.open(str(inp)).convert("RGB"))
            result = ocr.ocr(img_arr, cls=use_angle_cls)
            lines = [{"text": t, "confidence": float(c), "bbox": b}
                     for line in (result[0] or []) for b, (t, c) in [line]]
            pages_out.append({"page": 1, "lines": lines})
        return JSONResponse({"success": True, "pages": pages_out})
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        cleanup(inp)


# ─── 6. Searchable PDF (OCRmyPDF — adds invisible text layer) ──
@app.post("/convert/make-searchable")
async def make_searchable(file: UploadFile = File(...), lang: str = Form("hin+eng"),
                          deskew: bool = Form(True), rotate: bool = Form(True)):
    try:
        import ocrmypdf
    except ImportError:
        raise HTTPException(500, "Run: pip install ocrmypdf")

    inp = temp_path(".pdf"); out = temp_path("_searchable.pdf")
    try:
        inp.write_bytes(await file.read())
        ocrmypdf.ocr(str(inp), str(out), language=lang, deskew=deskew,
                     rotate_pages=rotate, skip_text=True, output_type="pdfa", progress_bar=False)
        return FileResponse(str(out), media_type="application/pdf",
                            filename=Path(file.filename).stem + "_searchable.pdf")
    except Exception as e:
        cleanup(inp, out); raise HTTPException(500, str(e))


# ─── 7. PPT → Word ────────────────────────────────────────────
@app.post("/convert/ppt-to-word")
async def ppt_to_word(file: UploadFile = File(...)):
    try:
        from pptx import Presentation as Pptx
        from docx import Document
    except ImportError:
        raise HTTPException(500, "Run: pip install python-pptx python-docx")

    inp = temp_path(".pptx"); out = temp_path(".docx")
    try:
        inp.write_bytes(await file.read())
        prs = Pptx(str(inp)); doc = Document()
        doc.add_heading("Presentation Content", 0)
        for i, slide in enumerate(prs.slides, 1):
            doc.add_heading(f"Slide {i}", 1)
            for shape in slide.shapes:
                if shape.has_text_frame:
                    for para in shape.text_frame.paragraphs:
                        if para.text.strip():
                            doc.add_paragraph(para.text.strip())
        doc.save(str(out))
        return FileResponse(str(out), media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                            filename=Path(file.filename).stem + ".docx")
    except Exception as e:
        cleanup(inp, out); raise HTTPException(500, str(e))


# ─── 8. Word → PPT ────────────────────────────────────────────
@app.post("/convert/word-to-ppt")
async def word_to_ppt(file: UploadFile = File(...)):
    try:
        from docx import Document
        from pptx import Presentation
        from pptx.util import Inches, Pt
    except ImportError:
        raise HTTPException(500, "Run: pip install python-docx python-pptx")

    inp = temp_path(".docx"); out = temp_path(".pptx")
    try:
        inp.write_bytes(await file.read())
        doc = Document(str(inp)); prs = Presentation()
        prs.slide_width = Inches(13.33); prs.slide_height = Inches(7.5)
        layout = prs.slide_layouts[1]; content_tf = None

        for para in doc.paragraphs:
            txt = para.text.strip()
            if not txt: continue
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
                    p = content_tf.add_paragraph(); p.text = txt; p.font.size = Pt(18)
                    p.level = 1 if "Heading 2" in style else 0

        if not prs.slides: prs.slides.add_slide(prs.slide_layouts[6])
        prs.save(str(out))
        return FileResponse(str(out), media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
                            filename=Path(file.filename).stem + ".pptx")
    except Exception as e:
        cleanup(inp, out); raise HTTPException(500, str(e))

# ─── 8. Native PDF Editing (No AI) ──────
@app.post("/edit-pdf")
async def edit_pdf_endpoint(file: UploadFile = File(...), edits: str = Form(...)):
    """
    Applies precise text edits to a PDF natively using PyMuPDF.
    edits JSON format: [{"page": 0, "x": float, "y": float, "w": float, "h": float, 
                         "oldText": str, "newText": str, "fontSize": float, "color": str, "bgColor": str, "bold": bool, "italic": bool}]
    """
    import json
    import fitz # PyMuPDF
    inp = temp_path(".pdf"); out = temp_path(".pdf")
    try:
        inp.write_bytes(await file.read())
        edit_actions = json.loads(edits)
        
        doc = fitz.open(str(inp))
        
        for action in edit_actions:
            page_idx = action.get("page", 0)
            if page_idx >= len(doc): continue
            page = doc[page_idx]
            
            x, y, w, h = action["x"], action["y"], action["w"], action["h"]
            new_text = action.get("newText", "")
            
            # 1. Erase old text (Redaction)
            # Add small padding to ensure complete erasure of ascenders/descenders
            rect = fitz.Rect(x - 2, y - 2, x + w + 2, y + h + 2)
            
            bg_color = action.get("bgColor", "#ffffff")
            def hex_to_rgb(hx):
                hx = str(hx).lstrip('#')
                return tuple(int(hx[i:i+2], 16)/255.0 for i in (0, 2, 4)) if len(hx) == 6 else (1,1,1)
            
            print(f"Applying redaction at {rect} with color {bg_color}")
            page.add_redact_annot(rect, fill=hex_to_rgb(bg_color))
            page.apply_redactions()
            
            if not new_text: continue
            
            # 2. Insert new text
            fg_color = action.get("color", "#000000")
            orig_size = action.get("fontSize", 12)
            
            # Font matching
            fontname = "helv" 
            if action.get("bold"): fontname = "hebo"
            if action.get("italic"): fontname = "hebi"
            if action.get("bold") and action.get("italic"): fontname = "hebi"
            
            # Handle Unicode / Hindi text
            def has_non_latin(text):
                return any(ord(c) > 0x00FF for c in text)
            
            if has_non_latin(new_text):
                import os
                font_path = Path(__file__).parent.parent / "pdf-tool" / "public" / "fonts" / "NotoSansDevanagari-Regular.ttf"
                if action.get("bold"):
                    bold_path = Path(__file__).parent.parent / "pdf-tool" / "public" / "fonts" / "NotoSansDevanagari-Bold.ttf"
                    if bold_path.exists(): font_path = bold_path
                
                if font_path.exists():
                    fontname = "deva"
                    page.insert_font(fontname=fontname, fontfile=str(font_path))
            
            # Auto-shrink logic if text is too long
            try:
                text_len = fitz.get_text_length(new_text, fontname=fontname, fontsize=orig_size)
            except Exception:
                # Fallback if get_text_length fails for custom font
                text_len = len(new_text) * orig_size * 0.5
                
            final_size = orig_size
            
            if text_len > w and w > 10:
                scale_factor = w / text_len
                # Shrink to fit, but don't shrink smaller than 60% of original
                final_size = max(orig_size * 0.6, orig_size * scale_factor)
            
            # Calculate baseline. In frontend, y is top-left.
            # Baseline is usually ~80% down the height of the bounding box.
            baseline_y = y + (h * 0.78)
            
            page.insert_text(
                fitz.Point(x, baseline_y),
                new_text,
                fontname=fontname,
                fontsize=final_size,
                color=hex_to_rgb(fg_color)
            )
            
        # Save keeping absolute max quality (no compression changes, native)
        doc.save(str(out), garbage=3, deflate=True)
        doc.close()
        
        return FileResponse(str(out), media_type="application/pdf", filename="edited_" + file.filename)
    except Exception as e:
        cleanup(inp, out)
        raise HTTPException(500, str(e))
