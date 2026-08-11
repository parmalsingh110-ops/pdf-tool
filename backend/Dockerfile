FROM python:3.12-slim

# ── Security: set environment ──────────────────────────────────
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# ── System dependencies ──────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-hin \
    libreoffice \
    ghostscript \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# ── Create non-root application user ────────────────────────────
# Running as non-root limits blast radius if a processing library is exploited.
RUN groupadd --gid 1000 appuser \
    && useradd --uid 1000 --gid 1000 --no-create-home --shell /bin/false appuser

# ── Python deps (cached layer — only rebuild if requirements.txt changes) ──
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ── Playwright Chromium (Webpage to PDF) ─────────────────────────
RUN playwright install --with-deps chromium

# ── App code ─────────────────────────────────────────────────────
COPY . .

# ── Create temp directory with correct ownership ────────────────
# Backend uses /tmp/pdf_tool_backend for all processing.
# LibreOffice also writes to /tmp — giving appuser write access.
RUN mkdir -p /tmp/pdf_tool_backend \
    && chown -R appuser:appuser /tmp/pdf_tool_backend \
    && chown -R appuser:appuser /app

# ── Switch to non-root user ──────────────────────────────────────
USER appuser

EXPOSE 8000

# ── Run with gunicorn (proper request timeout for heavy OCR tasks) ────────────
# 2 workers: enough for free Render tier (512 MB RAM), avoids OOM with concurrent OCR
CMD ["gunicorn", "main:app", \
     "-k", "uvicorn.workers.UvicornWorker", \
     "-w", "2", \
     "--timeout", "300", \
     "--bind", "0.0.0.0:8000"]
