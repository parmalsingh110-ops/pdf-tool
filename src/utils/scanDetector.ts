import * as pdfjsLib from 'pdfjs-dist';

/**
 * Shared dropzone accept filter supporting both PDF documents and direct phone/scanner images.
 */
export const SCAN_CONVERTER_ACCEPT: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/tiff': ['.tif', '.tiff'],
  'image/bmp': ['.bmp'],
};

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|tiff?|bmp)$/i;
const DOC_EXT_RE = /\.(pdf|jpe?g|png|webp|tiff?|bmp)$/i;

/**
 * Check whether an uploaded File is a raster image (JPG/PNG/WebP/TIFF/BMP).
 */
export function isRasterImageFile(file: File): boolean {
  if (file.type && file.type.toLowerCase().startsWith('image/')) {
    return true;
  }
  return IMAGE_EXT_RE.test(file.name || '');
}

/**
 * Strip supported PDF or image extensions cleanly for converted download filenames.
 */
export function stripDocumentExt(filename: string): string {
  return (filename || 'document').replace(DOC_EXT_RE, '');
}

/**
 * Detect whether a PDF is raw-scanned OR an OCR-layered scanned PDF (`3 Tr` invisible
 * text over full-page camera/scanner images, GlyphLessFont, or sparse text with full
 * raster page backdrops) so converters route it to the CV Vision + OCR reconstruction engine.
 */
export async function detectIfPdfScannedOrOcr(pdf: pdfjsLib.PDFDocumentProxy): Promise<boolean> {
  const checkPages = Math.min(3, pdf.numPages);
  if (checkPages === 0) return false;

  let totalTextChars = 0;
  let ocrScannedPages = 0;

  const ops = pdfjsLib.OPS as Record<string, number>;
  const OP_TEXT_RENDER_MODE = ops.setTextRenderingMode ?? 39;
  const OP_PAINT_IMAGE = ops.paintImageXObject ?? 85;
  const OP_PAINT_IMAGE_MASK = ops.paintImageMaskXObject ?? 86;
  const OP_PAINT_INLINE = ops.paintInlineImageXObject ?? 87;
  const OP_TRANSFORM = ops.transform ?? 12;
  const OP_CONSTRUCT_PATH = ops.constructPath ?? 91;

  for (let i = 1; i <= checkPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const pageTextLen = tc.items.reduce((s: number, it: any) => s + (it.str || '').trim().length, 0);
    totalTextChars += pageTextLen;

    // Check font style signatures emitted by OCRmyPDF / Tesseract GlyphLessFont
    const styleValues = Object.values((tc.styles || {}) as Record<string, any>);
    const hasGlyphLess = styleValues.some((st) =>
      /glyphless|pro_ocr/i.test(String(st?.fontFamily || ''))
    );

    let hasInvisibleOcrMode = false;
    let hasFullPageImage = false;
    let pathOpCount = 0;

    try {
      const vp = page.getViewport({ scale: 1 });
      const pageArea = Math.max(1, vp.width * vp.height);
      const opList = await page.getOperatorList();
      let lastTransformArea = 0;
      let paintImageCount = 0;

      for (let k = 0; k < opList.fnArray.length; k++) {
        const fn = opList.fnArray[k];
        const args = opList.argsArray[k];

        if (fn === OP_TEXT_RENDER_MODE && args && Number(args[0]) === 3) {
          hasInvisibleOcrMode = true;
        } else if (fn === OP_TRANSFORM && Array.isArray(args) && args.length >= 4) {
          const sx = Math.abs(Number(args[0]) || 0);
          const sy = Math.abs(Number(args[3]) || 0);
          const area = sx * sy;
          if (area > lastTransformArea) {
            lastTransformArea = area;
          }
        } else if (fn === OP_PAINT_IMAGE || fn === OP_PAINT_IMAGE_MASK || fn === OP_PAINT_INLINE) {
          paintImageCount++;
          if (lastTransformArea >= pageArea * 0.45) {
            hasFullPageImage = true;
          }
        } else if (fn === OP_CONSTRUCT_PATH) {
          pathOpCount++;
        }
      }

      // Single full-page image with few vector paths + invisible OCR text or GlyphLessFont -> scanned
      if (
        (hasInvisibleOcrMode && paintImageCount >= 1) ||
        (hasGlyphLess && paintImageCount >= 1) ||
        (hasFullPageImage && pathOpCount < 10 && styleValues.length <= 2)
      ) {
        ocrScannedPages++;
      }
    } catch {
      // Non-fatal fallback: rely on character count below
    }
  }

  if (totalTextChars < 50) return true;
  return ocrScannedPages / checkPages >= 0.5;
}
