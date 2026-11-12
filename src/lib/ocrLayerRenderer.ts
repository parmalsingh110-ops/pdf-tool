/**
 * Multi-Layer Precision OCR Canvas Filter & Pixel-Locked PDF Text Layer Injector
 * -------------------------------------------------------------------------------
 * Fixes highlight coordinate drift in scanned, cropped, rotated, or multi-layered PDFs:
 * 1. Isolates existing page CTM state (`page.node.normalize()`) before appending OCR text.
 * 2. Maps canvas pixel boxes via `pdf.js` Viewport `convertToPdfPoint()` so CropBox offsets,
 *    MediaBox origins, and /Rotate (0/90/180/270) match 1:1.
 * 3. Injects official PDF invisible text (`3 Tr`) + horizontal scaling (`Tz`) + affine Text
 *    Matrix (`Tm`) + font-metric baseline correction so substring search highlights land
 *    at sub-point accuracy matching commercial tools.
 * 4. Includes a fast O(W*H) background-illumination & yellow/pastel watermark suppressor for
 *    OCR vision (original visual PDF pages remain 100% untouched).
 */

import {
  PDFDocument,
  PDFFont,
  PDFName,
  PDFOperator,
  PDFPage,
  TextRenderingMode,
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setCharacterSqueeze,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
} from 'pdf-lib';

export interface BrowserOcrWord {
  text: string;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  confidence?: number;
}

export interface ViewportPointConverter {
  convertToPdfPoint(x: number, y: number): number[];
}

const DEVANAGARI_RE = /[\u0900-\u097F]/;

/**
 * Downscaled box-max + blur illumination estimator followed by watermark ratio suppression.
 * Removes yellow/orange/pastel diagonal stamps (e.g. e-Mitra certificates) and uneven shadows
 * while keeping dark foreground strokes crisp — even underneath semi-transparent watermarks.
 */
export function preprocessCanvasForOcr(srcCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;

  const outCtx = outCanvas.getContext('2d');
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!outCtx || !srcCtx || w < 8 || h < 8) {
    outCtx?.drawImage(srcCanvas, 0, 0);
    return outCanvas;
  }

  const srcData = srcCtx.getImageData(0, 0, w, h);
  const px = srcData.data;
  const n = w * h;

  const gray = new Uint8Array(n);
  const sat = new Uint8Array(n);
  const val = new Uint8Array(n);

  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = px[p];
    const g = px[p + 1];
    const b = px[p + 2];
    gray[i] = ((77 * r + 150 * g + 29 * b) >> 8) & 0xff;
    const maxC = r > g ? (r > b ? r : b) : (g > b ? g : b);
    const minC = r < g ? (r < b ? r : b) : (g < b ? g : b);
    val[i] = maxC;
    sat[i] = maxC > 0 ? Math.round(((maxC - minC) * 255) / maxC) : 0;
  }

  // Downsample 4x for fast local morphological closing (paper illumination field)
  const step = Math.max(2, Math.min(6, Math.floor(Math.max(w, h) / 480)));
  const dw = Math.max(4, Math.ceil(w / step));
  const dh = Math.max(4, Math.ceil(h / step));
  const dsMax = new Uint8Array(dw * dh);

  for (let dy = 0; dy < dh; dy++) {
    const sy0 = dy * step;
    const sy1 = Math.min(h, sy0 + step);
    for (let dx = 0; dx < dw; dx++) {
      const sx0 = dx * step;
      const sx1 = Math.min(w, sx0 + step);
      let m = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        const row = sy * w;
        for (let sx = sx0; sx < sx1; sx++) {
          const v = gray[row + sx];
          if (v > m) m = v;
        }
      }
      dsMax[dy * dw + dx] = m;
    }
  }

  // 2-pass separable morphological dilation + smoothing on small grid to remove watermark strokes from bg estimate
  const radius = Math.max(2, Math.min(6, Math.round(Math.min(dw, dh) / 48)));
  const tmpBg = new Uint8Array(dw * dh);
  const bgGrid = new Uint8Array(dw * dh);

  for (let dy = 0; dy < dh; dy++) {
    const row = dy * dw;
    for (let dx = 0; dx < dw; dx++) {
      let mx = 0;
      const xStart = Math.max(0, dx - radius);
      const xEnd = Math.min(dw - 1, dx + radius);
      for (let k = xStart; k <= xEnd; k++) {
        if (dsMax[row + k] > mx) mx = dsMax[row + k];
      }
      tmpBg[row + dx] = mx;
    }
  }
  for (let dy = 0; dy < dh; dy++) {
    const yStart = Math.max(0, dy - radius);
    const yEnd = Math.min(dh - 1, dy + radius);
    for (let dx = 0; dx < dw; dx++) {
      let mx = 0;
      for (let k = yStart; k <= yEnd; k++) {
        const v = tmpBg[k * dw + dx];
        if (v > mx) mx = v;
      }
      bgGrid[dy * dw + dx] = Math.max(32, mx);
    }
  }

  // 256-step lookup table for fast gentle gamma 1.45 ink-saver darkening
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const r = i / 255;
    const t = Math.max(0, Math.min(1, (r - 0.15) / 0.8));
    lut[i] = Math.round(Math.pow(t, 1.45) * 255);
  }

  const outData = outCtx.createImageData(w, h);
  const dst = outData.data;

  for (let y = 0; y < h; y++) {
    const fy = Math.min(dh - 1, y / step);
    const y0 = Math.floor(fy);
    const y1 = Math.min(dh - 1, y0 + 1);
    const wy = fy - y0;
    const row = y * w;

    for (let x = 0; x < w; x++) {
      const fx = Math.min(dw - 1, x / step);
      const x0 = Math.floor(fx);
      const x1 = Math.min(dw - 1, x0 + 1);
      const wx = fx - x0;

      const b00 = bgGrid[y0 * dw + x0];
      const b10 = bgGrid[y0 * dw + x1];
      const b01 = bgGrid[y1 * dw + x0];
      const b11 = bgGrid[y1 * dw + x1];
      const localBg =
        (b00 * (1 - wx) + b10 * wx) * (1 - wy) +
        (b01 * (1 - wx) + b11 * wx) * wy;

      const idx = row + x;
      const g = gray[idx];
      const ratio = Math.min(1, g / Math.max(24, localBg));

      // Suppress bright colored watermarks close to local illumination without eating thin dark/ink-saver letters
      const isWatermark =
        (sat[idx] > 28 && val[idx] > 155 && ratio > 0.87) ||
        (val[idx] > 220 && ratio > 0.92);

      const cleanVal = isWatermark ? 255 : lut[Math.round(ratio * 255)];

      const p = idx * 4;
      dst[p] = cleanVal;
      dst[p + 1] = cleanVal;
      dst[p + 2] = cleanVal;
      dst[p + 3] = 255;
    }
  }

  outCtx.putImageData(outData, 0, 0);
  return outCanvas;
}

function bboxOverlapRatio(
  a: { x0: number; y0: number; x1: number; y1: number },
  b: { x0: number; y0: number; x1: number; y1: number }
): number {
  const ix0 = Math.max(a.x0, b.x0);
  const iy0 = Math.max(a.y0, b.y0);
  const ix1 = Math.min(a.x1, b.x1);
  const iy1 = Math.min(a.y1, b.y1);
  if (ix1 <= ix0 || iy1 <= iy0) return 0;
  const inter = (ix1 - ix0) * (iy1 - iy0);
  const areaA = Math.max(1, (a.x1 - a.x0) * (a.y1 - a.y0));
  const areaB = Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0));
  return inter / Math.min(areaA, areaB);
}

/**
 * Dual-pass recovery: merges any non-overlapping confident words from raw composite OCR
 * that actually contain dark foreground ink (rejecting bright yellow/pastel watermarks).
 */
export function mergeRecoveredBrowserOcrWords(
  cleanWords: BrowserOcrWord[],
  rawWords: BrowserOcrWord[],
  rawCanvas: HTMLCanvasElement
): BrowserOcrWord[] {
  if (!rawWords.length) return cleanWords;
  if (cleanWords.length < 3) {
    return rawWords.length > cleanWords.length ? rawWords : cleanWords;
  }

  const ctx = rawCanvas.getContext('2d', { willReadFrequently: true });
  const cw = rawCanvas.width;
  const ch = rawCanvas.height;
  const merged = [...cleanWords];

  for (const rw of rawWords) {
    const txt = (rw.text || '').trim();
    if (txt.length < 2 || !rw.bbox) continue;
    if (typeof rw.confidence === 'number' && rw.confidence < 48) continue;
    if (merged.some((cwWord) => bboxOverlapRatio(rw.bbox, cwWord.bbox) > 0.18)) continue;

    // Verify box contains genuine dark foreground ink (rejects yellow/pastel watermark hallucinations)
    if (ctx) {
      const x0 = Math.max(0, Math.min(cw - 1, Math.floor(rw.bbox.x0)));
      const y0 = Math.max(0, Math.min(ch - 1, Math.floor(rw.bbox.y0)));
      const wBox = Math.max(1, Math.min(cw - x0, Math.ceil(rw.bbox.x1 - x0)));
      const hBox = Math.max(1, Math.min(ch - y0, Math.ceil(rw.bbox.y1 - y0)));
      const data = ctx.getImageData(x0, y0, wBox, hBox).data;
      let darkCount = 0;
      const totalPx = wBox * hBox;
      const stride = totalPx > 4000 ? 2 : 1;
      let sampled = 0;
      for (let i = 0; i < totalPx; i += stride) {
        const p = i * 4;
        const luma = (77 * data[p] + 150 * data[p + 1] + 29 * data[p + 2]) >> 8;
        if (luma <= 172) darkCount++;
        sampled++;
      }
      if (sampled > 0 && darkCount / sampled < 0.05) {
        continue;
      }
    }

    merged.push(rw);
  }
  return merged;
}

/**
 * Extract flattened word list from Tesseract.js v7+ recognize() result (`blocks: true`).
 */
export function extractTesseractWords(dataAny: any): BrowserOcrWord[] {
  const words: BrowserOcrWord[] = [];
  if (!dataAny) return words;

  if (Array.isArray(dataAny.blocks)) {
    for (const block of dataAny.blocks) {
      for (const para of block.paragraphs || []) {
        for (const line of para.lines || []) {
          for (const word of line.words || []) {
            if (word?.text && word?.bbox) words.push(word);
          }
        }
      }
    }
  } else if (Array.isArray(dataAny.words)) {
    words.push(...dataAny.words);
  } else if (Array.isArray(dataAny.lines)) {
    for (const line of dataAny.lines) {
      if (Array.isArray(line.words)) words.push(...line.words);
    }
  }
  return words;
}

/**
 * Embed invisible pixel-locked text operators (`3 Tr` + `Tz` + `Tm`) into a pdf-lib page.
 * Isolates existing multi-layer CTM transforms first and uses `vp.convertToPdfPoint`
 * so CropBox offsets and page rotation align sub-point accurately.
 */
export function embedOcrWordsPixelLocked(
  pdfPage: PDFPage,
  vp: ViewportPointConverter,
  words: BrowserOcrWord[],
  latinFont: PDFFont,
  devanagariFont: PDFFont | null
): number {
  if (!words.length) return 0;

  // Guard multi-layer PDFs with unbalanced q/cm transforms by normalizing/wrapping existing streams
  try {
    (pdfPage.node as any).normalize?.();
  } catch {
    // Safe ignore if stream lacks entries
  }

  // Register fonts on this page's /Resources dictionary via pdf-lib internal helper
  const latinKey: PDFName = (pdfPage as any).setOrEmbedFont(latinFont).newFontKey;
  const devKey: PDFName | null = devanagariFont
    ? (pdfPage as any).setOrEmbedFont(devanagariFont).newFontKey
    : null;

  const latinFullH = latinFont.heightAtSize(10, { descender: true });
  const latinAscH = latinFont.heightAtSize(10, { descender: false });
  const latinDescFrac = Math.max(0.08, Math.min(0.32, (latinFullH - latinAscH) / Math.max(1, latinFullH)));
  const latinHeightRatio = Math.max(0.6, latinFullH / 10);

  let devDescFrac = 0.22;
  let devHeightRatio = 1.05;
  if (devanagariFont) {
    try {
      const df = devanagariFont.heightAtSize(10, { descender: true });
      const da = devanagariFont.heightAtSize(10, { descender: false });
      devDescFrac = Math.max(0.08, Math.min(0.35, (df - da) / Math.max(1, df)));
      devHeightRatio = Math.max(0.6, df / 10);
    } catch {
      // Fallback defaults
    }
  }

  const ops: PDFOperator[] = [
    pushGraphicsState(),
    beginText(),
    setTextRenderingMode(TextRenderingMode.Invisible),
  ];

  let wordsDrawn = 0;
  let activeFontKey: PDFName | null = null;
  let activeFontSize = -1;
  let activeTz = -1;

  for (const w of words) {
    const rawText = (w.text || '').trim();
    if (!rawText || !w.bbox) continue;

    const { x0, y0, x1, y1 } = w.bbox;
    if (x1 - x0 < 1 || y1 - y0 < 1) continue;

    const hasDevanagari = DEVANAGARI_RE.test(rawText);
    const useDev = hasDevanagari && devanagariFont !== null && devKey !== null;
    const fontToUse = useDev ? devanagariFont! : latinFont;
    const fontKeyToUse = useDev ? devKey! : latinKey;

    const cleanTxt = useDev
      ? rawText
      : rawText.replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ').trim();
    if (!cleanTxt) continue;

    // Transform bottom-left, bottom-right, and top-left corners from canvas px to raw PDF space
    const bl = vp.convertToPdfPoint(x0, y1);
    const br = vp.convertToPdfPoint(x1, y1);
    const tl = vp.convertToPdfPoint(x0, y0);

    const ux = br[0] - bl[0];
    const uy = br[1] - bl[1];
    const boxW = Math.hypot(ux, uy);

    const vx = tl[0] - bl[0];
    const vy = tl[1] - bl[1];
    const boxH = Math.hypot(vx, vy);

    if (boxW < 0.8 || boxH < 1.5) continue;

    const heightRatio = useDev ? devHeightRatio : latinHeightRatio;
    const descFrac = useDev ? devDescFrac : latinDescFrac;
    const fontSizePt = Math.max(3, Math.min(96, boxH / heightRatio));

    try {
      const natWidth = fontToUse.widthOfTextAtSize(cleanTxt, fontSizePt);
      if (!Number.isFinite(natWidth) || natWidth <= 0) continue;

      const tz = Math.max(20, Math.min(450, (boxW / natWidth) * 100));
      const encoded = fontToUse.encodeText(cleanTxt);

      // Unit vectors along baseline ("right") and ascender ("up") in raw PDF coordinates
      const cosA = ux / boxW;
      const sinA = uy / boxW;
      const upX = vx / boxH;
      const upY = vy / boxH;

      // Shift baseline upward from bottom edge by descender fraction
      const descOffset = boxH * descFrac;
      const baseX = bl[0] + upX * descOffset;
      const baseY = bl[1] + upY * descOffset;

      if (activeFontKey !== fontKeyToUse || Math.abs(activeFontSize - fontSizePt) > 0.05) {
        ops.push(setFontAndSize(fontKeyToUse, Number(fontSizePt.toFixed(2))));
        activeFontKey = fontKeyToUse;
        activeFontSize = fontSizePt;
      }
      if (Math.abs(activeTz - tz) > 0.25) {
        ops.push(setCharacterSqueeze(Number(tz.toFixed(2))));
        activeTz = tz;
      }

      ops.push(
        setTextMatrix(
          Number(cosA.toFixed(5)),
          Number(sinA.toFixed(5)),
          Number((-sinA).toFixed(5)),
          Number(cosA.toFixed(5)),
          Number(baseX.toFixed(2)),
          Number(baseY.toFixed(2))
        ),
        showText(encoded)
      );
      wordsDrawn++;
    } catch {
      // Skip unencodable rare glyph sequences cleanly
    }
  }

  ops.push(endText(), popGraphicsState());

  if (wordsDrawn > 0) {
    pdfPage.pushOperators(...ops);
  }
  return wordsDrawn;
}

