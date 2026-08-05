FROM python:3.12-slim

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

# ── Python deps (cached layer — only rebuild if requirements.txt changes) ──
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ── App code ─────────────────────────────────────────────────────
COPY . .

EXPOSE 8000

# ── Run with gunicorn (proper request timeout for heavy OCR tasks) ────────────
CMD ["gunicorn", "main:app", \
     "-k", "uvicorn.workers.UvicornWorker", \
     "-w", "2", \
     "--timeout", "300", \
     "--bind", "0.0.0.0:8000"]
