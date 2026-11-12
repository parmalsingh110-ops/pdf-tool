import {
  PDFDocument,
  PDFFont,
  PDFOperator,
  PDFOperatorNames,
  PDFPage,
  StandardFonts,
  appendBezierCurve,
  closePath,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setFillingColor,
} from 'pdf-lib';

type HarfBuzzModuleNS = typeof import('harfbuzzjs');

interface CachedHbFont {
  hb: HarfBuzzModuleNS;
  blob: InstanceType<HarfBuzzModuleNS['Blob']>;
  face: InstanceType<HarfBuzzModuleNS['Face']>;
  font: InstanceType<HarfBuzzModuleNS['Font']>;
  buffer: InstanceType<HarfBuzzModuleNS['Buffer']>;
  upem: number;
}

const DEFAULT_REGULAR_FONT_URL = '/fonts/NotoSansDevanagari-Regular.ttf';
const DEFAULT_BOLD_FONT_URL = '/fonts/NotoSansDevanagari-Bold.ttf';

let hbModulePromise: Promise<HarfBuzzModuleNS> | null = null;
const hbFontCache = new Map<string, Promise<CachedHbFont>>();
const pdfStandardFontCache = new WeakMap<PDFDocument, Map<string, PDFFont>>();

export interface RgbTuple {
  r: number;
  g: number;
  b: number;
}

export interface VectorTextDrawOptions {
  page: PDFPage;
  text: string;
  xPdf: number;
  baselinePdfY: number;
  boxWidthPt: number;
  fontSizePt: number;
  colorRgb: RgbTuple;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  lineHeightFactor?: number;
  underline?: boolean;
  strikethrough?: boolean;
  /** Optional raw TTF bytes override (primarily for tests outside the browser). */
  fontBytesOverride?: Uint8Array;
}

export interface MatchedLatinDrawOptions {
  pdfDoc: PDFDocument;
  page: PDFPage;
  text: string;
  xPdf: number;
  baselinePdfY: number;
  boxWidthPt: number;
  fontSizePt: number;
  colorRgb: RgbTuple;
  fontHint?: string;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  lineHeightFactor?: number;
  underline?: boolean;
  strikethrough?: boolean;
}

export function hasNonLatinChars(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 0x00ff) return true;
  }
  return false;
}

export function detectFontFamilyCategory(fontHint?: string): 'serif' | 'mono' | 'sans' {
  const f = (fontHint || '').toLowerCase();
  if (
    f.includes('times') ||
    f.includes('serif') ||
    f.includes('georgia') ||
    f.includes('palatino') ||
    f.includes('garamond') ||
    f.includes('cambria') ||
    f.includes('roman') ||
    f.includes('bookman') ||
    f.includes('minion') ||
    f.includes('baskerville') ||
    f.includes('caslon') ||
    f.includes('constantia')
  ) {
    // Wait: 'sans-serif' contains 'serif' — guard against CSS sans-serif tokens!
    if (f.includes('sans-serif') && !f.includes('times') && !f.includes('georgia') && !f.includes('roman')) {
      return 'sans';
    }
    return 'serif';
  }
  if (
    f.includes('courier') ||
    f.includes('mono') ||
    f.includes('consolas') ||
    f.includes('code') ||
    f.includes('menlo') ||
    f.includes('inconsolata') ||
    f.includes('jetbrains') ||
    f.includes('lucidaconsole') ||
    f.includes('lucida')
  ) {
    return 'mono';
  }
  return 'sans';
}

export async function resolvePdfLibStandardFont(
  pdfDoc: PDFDocument,
  fontHint?: string,
  bold?: boolean,
  italic?: boolean
): Promise<PDFFont> {
  const family = detectFontFamilyCategory(fontHint);
  const key = `${family}:${bold ? 'B' : 'R'}:${italic ? 'I' : 'N'}`;
  let docMap = pdfStandardFontCache.get(pdfDoc);
  if (!docMap) {
    docMap = new Map<string, PDFFont>();
    pdfStandardFontCache.set(pdfDoc, docMap);
  }
  const cached = docMap.get(key);
  if (cached) return cached;

  let stdFont: StandardFonts;
  if (family === 'serif') {
    if (bold && italic) stdFont = StandardFonts.TimesRomanBoldItalic;
    else if (bold) stdFont = StandardFonts.TimesRomanBold;
    else if (italic) stdFont = StandardFonts.TimesRomanItalic;
    else stdFont = StandardFonts.TimesRoman;
  } else if (family === 'mono') {
    if (bold && italic) stdFont = StandardFonts.CourierBoldOblique;
    else if (bold) stdFont = StandardFonts.CourierBold;
    else if (italic) stdFont = StandardFonts.CourierOblique;
    else stdFont = StandardFonts.Courier;
  } else {
    if (bold && italic) stdFont = StandardFonts.HelveticaBoldOblique;
    else if (bold) stdFont = StandardFonts.HelveticaBold;
    else if (italic) stdFont = StandardFonts.HelveticaOblique;
    else stdFont = StandardFonts.Helvetica;
  }

  const embedded = await pdfDoc.embedFont(stdFont);
  docMap.set(key, embedded);
  return embedded;
}

async function getHarfBuzzModule(): Promise<HarfBuzzModuleNS> {
  if (!hbModulePromise) {
    hbModulePromise = import('harfbuzzjs').catch((err) => {
      hbModulePromise = null;
      throw err;
    });
  }
  return hbModulePromise;
}

async function loadDevanagariHbFont(
  bold = false,
  fontBytesOverride?: Uint8Array
): Promise<CachedHbFont> {
  const cacheKey = fontBytesOverride
    ? `override:${bold ? 'bold' : 'regular'}:${fontBytesOverride.byteLength}`
    : bold
    ? DEFAULT_BOLD_FONT_URL
    : DEFAULT_REGULAR_FONT_URL;

  const existing = hbFontCache.get(cacheKey);
  if (existing) return existing;

  const loader = (async (): Promise<CachedHbFont> => {
    const hb = await getHarfBuzzModule();
    let bytes: Uint8Array;
    if (fontBytesOverride) {
      bytes = fontBytesOverride;
    } else {
      const url = bold ? DEFAULT_BOLD_FONT_URL : DEFAULT_REGULAR_FONT_URL;
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) {
        throw new Error(`Failed to fetch font ${url}: HTTP ${res.status}`);
      }
      bytes = new Uint8Array(await res.arrayBuffer());
    }

    const blob = new hb.Blob(bytes);
    const face = new hb.Face(blob, 0);
    const font = new hb.Font(face);
    const buffer = new hb.Buffer();
    const upem = face.upem || 1000;
    return { hb, blob, face, font, buffer, upem };
  })().catch((err) => {
    hbFontCache.delete(cacheKey);
    throw err;
  });

  hbFontCache.set(cacheKey, loader);
  return loader;
}

function drawTextDecorations(
  page: PDFPage,
  startX: number,
  baselineY: number,
  lineWidth: number,
  fontSizePt: number,
  colorRgb: RgbTuple,
  underline?: boolean,
  strikethrough?: boolean
) {
  if (lineWidth <= 0) return;
  const strokeThick = Math.max(0.55, fontSizePt * 0.068);
  const c = rgb(colorRgb.r, colorRgb.g, colorRgb.b);

  if (underline) {
    const uy = baselineY - fontSizePt * 0.14;
    page.drawLine({
      start: { x: startX, y: uy },
      end: { x: startX + lineWidth, y: uy },
      thickness: strokeThick,
      color: c,
    });
  }
  if (strikethrough) {
    const sy = baselineY + fontSizePt * 0.30;
    page.drawLine({
      start: { x: startX, y: sy },
      end: { x: startX + lineWidth, y: sy },
      thickness: strokeThick,
      color: c,
    });
  }
}

export async function measureVectorTextWidthPt(
  text: string,
  fontSizePt: number,
  bold = false,
  fontBytesOverride?: Uint8Array
): Promise<number | null> {
  if (!text) return 0;
  try {
    const hbEntry = await loadDevanagariHbFont(bold, fontBytesOverride);
    const { hb, font, buffer, upem } = hbEntry;
    const scale = fontSizePt / upem;
    const lines = text.split(/\r?\n/);
    let maxW = 0;
    for (const line of lines) {
      if (!line) continue;
      buffer.reset();
      buffer.addText(line);
      buffer.guessSegmentProperties();
      hb.shape(font, buffer);
      const shaped = buffer.getGlyphInfosAndPositions();
      const adv = shaped.reduce((sum, g) => sum + (g.xAdvance || 0), 0) * scale;
      if (adv > maxW) maxW = adv;
    }
    return maxW;
  } catch {
    return null;
  }
}

/**
 * Shape and draw Hindi/Devanagari (and mixed Latin) text directly into the PDF page
 * as crisp native vector Bezier outlines using HarfBuzz WASM (harfbuzzjs) + PDF `f*` even-odd fill.
 * Preserves font weight (Regular/Bold), italic slant, horizontal alignment, and underlines.
 */
export async function drawVectorHarfbuzzText(
  opts: VectorTextDrawOptions
): Promise<{ drawn: boolean; lineWidths: number[] }> {
  const {
    page,
    text,
    xPdf,
    baselinePdfY,
    boxWidthPt,
    fontSizePt,
    colorRgb,
    bold = false,
    italic = false,
    align = 'left',
    lineHeightFactor = 1.25,
    underline = false,
    strikethrough = false,
    fontBytesOverride,
  } = opts;

  if (!text) return { drawn: true, lineWidths: [] };

  let hbEntry: CachedHbFont;
  try {
    hbEntry = await loadDevanagariHbFont(bold, fontBytesOverride);
  } catch (err) {
    console.warn('[VectorHarfbuzzPdf] HarfBuzz init/font load failed, falling back:', err);
    return { drawn: false, lineWidths: [] };
  }

  const { hb, font, buffer, upem } = hbEntry;
  const scale = fontSizePt / upem;
  const lineHeightPt = fontSizePt * lineHeightFactor;
  const italicShear = italic ? 0.2125 : 0; // tan(12 deg)
  const lines = text.split(/\r?\n/);

  const shapedLines: Array<{
    shaped: ReturnType<typeof buffer.getGlyphInfosAndPositions>;
    totalAdvPt: number;
    lineText: string;
  }> = [];

  for (const lineText of lines) {
    if (!lineText) {
      shapedLines.push({ shaped: [], totalAdvPt: 0, lineText });
      continue;
    }
    buffer.reset();
    buffer.addText(lineText);
    buffer.guessSegmentProperties();
    hb.shape(font, buffer);
    const shaped = buffer.getGlyphInfosAndPositions();

    // If any visible non-whitespace character resolved to .notdef (gid 0),
    // abort vector draw cleanly so caller can use high-res raster fallback for exotic symbols/emojis.
    for (const g of shaped) {
      if (g.codepoint === 0) {
        const ch = lineText.charAt(g.cluster || 0);
        if (ch && !/\s/.test(ch)) {
          return { drawn: false, lineWidths: [] };
        }
      }
    }

    const totalAdvPt = shaped.reduce((sum, g) => sum + (g.xAdvance || 0), 0) * scale;
    shapedLines.push({ shaped, totalAdvPt, lineText });
  }

  const ops: PDFOperator[] = [
    pushGraphicsState(),
    setFillingColor(rgb(colorRgb.r, colorRgb.g, colorRgb.b)),
  ];

  const lineWidths: number[] = [];
  const decorationJobs: Array<{ x: number; y: number; w: number }> = [];

  shapedLines.forEach(({ shaped, totalAdvPt }, lineIdx) => {
    lineWidths.push(totalAdvPt);
    if (shaped.length === 0) return;

    const lineBaselineY = baselinePdfY - lineIdx * lineHeightPt;
    let startX = xPdf;
    if (align === 'center' && boxWidthPt > totalAdvPt) {
      startX = xPdf + (boxWidthPt - totalAdvPt) / 2;
    } else if (align === 'right' && boxWidthPt > totalAdvPt) {
      startX = xPdf + (boxWidthPt - totalAdvPt);
    }

    let curX = startX;
    let curY = lineBaselineY;

    const xWithShear = (px: number, py: number) =>
      italicShear !== 0 ? px + (py - lineBaselineY) * italicShear : px;

    for (const g of shaped) {
      const gx = curX + (g.xOffset || 0) * scale;
      const gy = curY + (g.yOffset || 0) * scale;
      const cmds = font.glyphToJson(g.codepoint);

      if (cmds && cmds.length > 0) {
        let p0x = gx;
        let p0y = gy;
        let hasPathOps = false;

        for (const cmd of cmds) {
          const v = cmd.values;
          if (cmd.type === 'M' && v.length >= 2) {
            p0x = gx + v[0] * scale;
            p0y = gy + v[1] * scale;
            ops.push(moveTo(xWithShear(p0x, p0y), p0y));
            hasPathOps = true;
          } else if (cmd.type === 'L' && v.length >= 2) {
            p0x = gx + v[0] * scale;
            p0y = gy + v[1] * scale;
            ops.push(lineTo(xWithShear(p0x, p0y), p0y));
            hasPathOps = true;
          } else if (cmd.type === 'Q' && v.length >= 4) {
            const p1x = gx + v[0] * scale;
            const p1y = gy + v[1] * scale;
            const p2x = gx + v[2] * scale;
            const p2y = gy + v[3] * scale;
            const cp1x = p0x + (2 / 3) * (p1x - p0x);
            const cp1y = p0y + (2 / 3) * (p1y - p0y);
            const cp2x = p2x + (2 / 3) * (p1x - p2x);
            const cp2y = p2y + (2 / 3) * (p1y - p2y);
            ops.push(
              appendBezierCurve(
                xWithShear(cp1x, cp1y),
                cp1y,
                xWithShear(cp2x, cp2y),
                cp2y,
                xWithShear(p2x, p2y),
                p2y
              )
            );
            p0x = p2x;
            p0y = p2y;
            hasPathOps = true;
          } else if (cmd.type === 'C' && v.length >= 6) {
            const c1x = gx + v[0] * scale;
            const c1y = gy + v[1] * scale;
            const c2x = gx + v[2] * scale;
            const c2y = gy + v[3] * scale;
            const c3x = gx + v[4] * scale;
            const c3y = gy + v[5] * scale;
            ops.push(
              appendBezierCurve(
                xWithShear(c1x, c1y),
                c1y,
                xWithShear(c2x, c2y),
                c2y,
                xWithShear(c3x, c3y),
                c3y
              )
            );
            p0x = c3x;
            p0y = c3y;
            hasPathOps = true;
          } else if (cmd.type === 'Z') {
            ops.push(closePath());
          }
        }

        // Fill per glyph with Even-Odd rule (`f*`): keeps inner counters hollow
        // and prevents overlapping glyph strokes/matras from cancelling each other.
        if (hasPathOps) {
          ops.push(PDFOperator.of(PDFOperatorNames.FillEvenOdd));
        }
      }

      curX += (g.xAdvance || 0) * scale;
      curY += (g.yAdvance || 0) * scale;
    }

    if ((underline || strikethrough) && totalAdvPt > 0) {
      decorationJobs.push({ x: startX, y: lineBaselineY, w: totalAdvPt });
    }
  });

  ops.push(popGraphicsState());
  page.pushOperators(...ops);

  for (const job of decorationJobs) {
    drawTextDecorations(
      page,
      job.x,
      job.y,
      job.w,
      fontSizePt,
      colorRgb,
      underline,
      strikethrough
    );
  }

  return { drawn: true, lineWidths };
}

/**
 * Draw Latin/WinAnsi text with matched PDF standard font family (TimesRoman / Courier / Helvetica),
 * bold/italic style, alignment (left / center / right), multi-line support, and optional underline/strike.
 */
export async function drawMatchedLatinText(opts: MatchedLatinDrawOptions): Promise<void> {
  const {
    pdfDoc,
    page,
    text,
    xPdf,
    baselinePdfY,
    boxWidthPt,
    fontSizePt,
    colorRgb,
    fontHint,
    bold = false,
    italic = false,
    align = 'left',
    lineHeightFactor = 1.25,
    underline = false,
    strikethrough = false,
  } = opts;

  if (!text) return;

  const font = await resolvePdfLibStandardFont(pdfDoc, fontHint, bold, italic);
  const c = rgb(colorRgb.r, colorRgb.g, colorRgb.b);
  const lineHeightPt = fontSizePt * lineHeightFactor;
  const lines = text.split(/\r?\n/);

  lines.forEach((lineText, idx) => {
    if (!lineText) return;
    const lineBaselineY = baselinePdfY - idx * lineHeightPt;
    let lineW = 0;
    try {
      lineW = font.widthOfTextAtSize(lineText, fontSizePt);
    } catch {
      lineW = lineText.length * fontSizePt * 0.55;
    }

    let lineX = xPdf;
    if (align === 'center' && boxWidthPt > lineW) {
      lineX = xPdf + (boxWidthPt - lineW) / 2;
    } else if (align === 'right' && boxWidthPt > lineW) {
      lineX = xPdf + (boxWidthPt - lineW);
    }

    page.drawText(lineText, {
      x: lineX,
      y: lineBaselineY,
      size: fontSizePt,
      font,
      color: c,
    });

    if (underline || strikethrough) {
      drawTextDecorations(
        page,
        lineX,
        lineBaselineY,
        lineW,
        fontSizePt,
        colorRgb,
        underline,
        strikethrough
      );
    }
  });
}

