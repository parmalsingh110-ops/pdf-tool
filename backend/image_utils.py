"""
Shared Mobile-Hardened Image Detection, EXIF Orientation, HEIC/AVIF Decoding & OOM Protection
=============================================================================================
Centralizes safe raster image loading across all backend routes:
  - Registers `pillow-heif` (iPhone HEIC/HEIF + Android/Chrome AVIF) safely on import.
  - Enables `ImageFile.LOAD_TRUNCATED_IMAGES = True` so partially transferred mobile camera uploads
    or stripped WhatsApp JPEGs don't crash decoding.
  - Magic-byte-first PDF & image format sniffing (handles extensionless mobile `Blob` uploads).
  - Memory-safe `safe_open_image()`: uses JPEG/MPO `draft()` downscale BEFORE `exif_transpose()`
    so 48–200 MP smartphone photos never spike RAM on 512 MB cloud containers, flattens RGBA/LA/PA/P
    transparency onto white (or custom RGB) instead of black, and applies LANCZOS max-dim capping.
  - `normalize_image_for_pymupdf()`: converts WebP/AVIF/HEIC/MPO/sideways-EXIF images into
    PyMuPDF-safe PNG (if alpha) or JPEG q92 bytes so `insert_image` / `replace_image` never fail.
"""

from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import Any, Optional

from PIL import Image, ImageFile, ImageOps

logger = logging.getLogger("pdf_tool.image_utils")

# Tolerate truncated camera/WhatsApp JPEGs rather than raising OSError mid-stream
ImageFile.LOAD_TRUNCATED_IMAGES = True

# Allow modern 48–200 MP smartphone camera photos (still protected by draft() + max_dim capping)
if Image.MAX_IMAGE_PIXELS is not None and Image.MAX_IMAGE_PIXELS < 220_000_000:
    Image.MAX_IMAGE_PIXELS = 220_000_000

# Safely register HEIC / HEIF / AVIF decoder if pillow-heif is installed
HEIF_SUPPORTED: bool = False
try:
    import pillow_heif

    pillow_heif.register_heif_opener()
    HEIF_SUPPORTED = True
except Exception as _heif_err:
    logger.debug(f"[ImageUtils] pillow-heif opener not registered: {type(_heif_err).__name__}")

IMAGE_EXTENSIONS: frozenset[str] = frozenset(
    {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".bmp",
        ".tif",
        ".tiff",
        ".gif",
        ".heic",
        ".heif",
        ".avif",
        ".jfif",
        ".mpo",
    }
)

_ISO_BMFF_IMAGE_BRANDS: tuple[bytes, ...] = (
    b"heic",
    b"heix",
    b"hevc",
    b"hevx",
    b"mif1",
    b"msf1",
    b"avif",
    b"avis",
    b"heim",
    b"heis",
    b"hevm",
    b"hevs",
)

_ZIP_MAGICS: tuple[bytes, ...] = (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")
_OLE2_MAGIC: bytes = b"\xd0\xcf\x11\xe0"


def is_pdf_bytes(raw_bytes: bytes) -> bool:
    """Return True if raw bytes carry a valid PDF signature within the first 1024 bytes."""
    return bool(raw_bytes) and b"%PDF-" in raw_bytes[:1024]


def is_image_bytes(raw_bytes: bytes, filename: Optional[str] = None) -> bool:
    """
    Detect whether raw bytes represent a raster image (JPEG/MPO, PNG, WebP, GIF, BMP, TIFF,
    or ISO-BMFF HEIC/HEIF/AVIF). Checks magic bytes FIRST; falls back to filename extension
    ONLY if magic bytes do not identify a PDF, ZIP/Office archive, or OLE2 compound document.
    """
    if not raw_bytes:
        return False

    # 1. Authoritative magic-byte checks
    if raw_bytes[:3] == b"\xff\xd8\xff":
        return True
    if raw_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return True
    if len(raw_bytes) >= 12 and raw_bytes[:4] == b"RIFF" and raw_bytes[8:12] == b"WEBP":
        return True
    if raw_bytes[:6] in (b"GIF87a", b"GIF89a"):
        return True
    if raw_bytes[:2] == b"BM":
        return True
    if raw_bytes[:4] in (b"II*\x00", b"MM\x00*"):
        return True

    # ISO-BMFF container: HEIC / HEIF / AVIF (`ftyp` box + major/compatible image brands)
    if len(raw_bytes) >= 12 and raw_bytes[4:8] == b"ftyp":
        major_brand = raw_bytes[8:12]
        if major_brand in _ISO_BMFF_IMAGE_BRANDS:
            return True
        compat_window = raw_bytes[16 : min(len(raw_bytes), 64)]
        if any(brand in compat_window for brand in _ISO_BMFF_IMAGE_BRANDS):
            return True

    # 2. Never misclassify PDF, ZIP/OOXML, or OLE2 documents as images via spoofing/fallback
    if is_pdf_bytes(raw_bytes) or raw_bytes[:4] in _ZIP_MAGICS or raw_bytes[:4] == _OLE2_MAGIC:
        return False

    # 3. Extension fallback for uncommon or slightly header-shifted image payloads
    if filename:
        ext = Path(filename).suffix.lower()
        if ext in IMAGE_EXTENSIONS:
            return True

    return False


def _has_alpha_channel(img: Image.Image) -> bool:
    return img.mode in ("RGBA", "LA", "PA") or (img.mode == "P" and "transparency" in img.info)


def safe_open_image(
    raw_bytes: bytes,
    max_dim: Optional[int] = None,
    flatten_alpha_bg: Optional[tuple[int, int, int]] = (255, 255, 255),
    preserve_exif: bool = False,
) -> tuple[Image.Image, Any]:
    """
    Safely decode any supported raster image (including HEIC/HEIF/AVIF/MPO/WebP/PNG/JPEG):
      - Reads EXIF before transpose if `preserve_exif=True`.
      - Calls JPEG/MPO `draft("RGB", (max_dim * 2, max_dim * 2))` BEFORE `exif_transpose()`
        to avoid 300MB–1.8GB RAM spikes on 48–200 MP smartphone photos.
      - Fixes smartphone camera orientation via `ImageOps.exif_transpose()`.
      - Composites transparent images onto `flatten_alpha_bg` (default pure white) instead of black.
      - Downscales smoothly with `Image.Resampling.LANCZOS` if larger than `max_dim`.
    Returns `(pil_image, exif_obj)`.
    """
    img = Image.open(io.BytesIO(raw_bytes))

    exif_obj: Any = None
    if preserve_exif:
        try:
            exif_obj = img.getexif()
        except Exception:
            exif_obj = None

    fmt = (img.format or "").upper()
    if max_dim and max_dim > 0 and fmt in ("JPEG", "MPO"):
        try:
            img.draft("RGB", (max_dim * 2, max_dim * 2))
        except Exception:
            pass

    transposed = ImageOps.exif_transpose(img)
    if transposed is not None:
        img = transposed

    if flatten_alpha_bg is not None:
        if _has_alpha_channel(img):
            rgba = img.convert("RGBA")
            bg = Image.new("RGB", rgba.size, flatten_alpha_bg)
            bg.paste(rgba, mask=rgba.split()[3])
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")

    if max_dim and max_dim > 0:
        w, h = img.size
        longest = max(w, h)
        if longest > max_dim:
            scale = max_dim / float(longest)
            new_w = max(1, int(round(w * scale)))
            new_h = max(1, int(round(h * scale)))
            img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

    return img, exif_obj


def normalize_image_for_pymupdf(raw_bytes: bytes, max_dim: int = 3200) -> bytes:
    """
    Normalize any uploaded image (WebP/AVIF/HEIC/MPO/TIFF/sideways-EXIF/huge photo)
    into PyMuPDF-safe bytes:
      - Preserves alpha transparency as PNG when image has an alpha channel.
      - Encodes opaque images as clean RGB JPEG (quality=92) so PyMuPDF never hits
        `FzErrorFormat` or embeds rotated/multi-gigapixel camera images.
    """
    img, _ = safe_open_image(raw_bytes, max_dim=max_dim, flatten_alpha_bg=None)
    buf = io.BytesIO()
    if _has_alpha_channel(img):
        img.convert("RGBA").save(buf, format="PNG")
    else:
        if img.mode != "RGB":
            img = img.convert("RGB")
        img.save(buf, format="JPEG", quality=92)
    return buf.getvalue()
