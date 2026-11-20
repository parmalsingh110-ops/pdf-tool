FROM python:3.12-slim

# ── Security: set environment ──────────────────────────────────
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    OMP_THREAD_LIMIT=1 \
    OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MALLOC_ARENA_MAX=2

# ── System dependencies ──────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-hin \
    libreoffice \
    ghostscript \
    mupdf-tools \
    fonts-liberation \
    fonts-dejavu-core \
    libraqm0 \
    libfribidi0 \
    libharfbuzz0b \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    libjemalloc2 \
    libturbojpeg0 \
    && ln -sf "$(find /usr/lib -name 'libjemalloc.so.2' | head -n 1)" /usr/local/lib/libjemalloc.so \
    && rm -rf /var/lib/apt/lists/*

# ── Create non-root application user ────────────────────────────
# Running as non-root limits blast radius if a processing library is exploited.
RUN groupadd --gid 1000 appuser \
    && useradd --uid 1000 --gid 1000 --create-home --home-dir /home/appuser --shell /bin/false appuser

# ── Python deps (cached layer — only rebuild if requirements.txt changes) ──
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ── Playwright Chromium (Webpage to PDF) ─────────────────────────
RUN mkdir -p /ms-playwright \
    && playwright install --with-deps chromium \
    && chmod -R 777 /ms-playwright

# ── App code ─────────────────────────────────────────────────────
COPY . .

# ── Create temp directory & pre-warm LibreOffice profile template ─
# Backend uses /tmp/pdf_tool_backend for all processing.
# Pre-warming /opt/lo_profile_template avoids 2-5s cold registry creation per Office->PDF job (0 idle RAM).
RUN mkdir -p /tmp/pdf_tool_backend /opt/lo_profile_template \
    && printf "ok" > /tmp/_lo_warm.txt \
    && (libreoffice -env:UserInstallation=file:///opt/lo_profile_template --headless --norestore --nolockcheck --convert-to pdf --outdir /tmp /tmp/_lo_warm.txt || true) \
    && rm -f /tmp/_lo_warm.txt /tmp/_lo_warm.pdf \
    && chown -R appuser:appuser /tmp/pdf_tool_backend /opt/lo_profile_template /app

# ── Runtime Memory Allocator (cuts OpenCV/MuPDF/NumPy RSS fragmentation 20-50% & returns freed pages in 2s) ──
ENV LD_PRELOAD=/usr/local/lib/libjemalloc.so \
    MALLOC_CONF="background_thread:true,dirty_decay_ms:2000,muzzy_decay_ms:2000,narenas:2"

# ── Switch to non-root user ──────────────────────────────────────
USER appuser

EXPOSE 8000

# ── Run with Granian (Rust Tokio/Hyper ASGI server + auto uvloop, saves ~20-40MB RAM vs Gunicorn master) ──
CMD ["sh", "-c", "granian --interface asgi --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-1} --loop auto --backlog 2048 --respawn-failed-workers main:app"]
