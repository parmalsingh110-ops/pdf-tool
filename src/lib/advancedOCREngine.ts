/**
 * Advanced OCR Engine v2 — PDF Tool
 * Preserves: bold, italic, font-size, alignment, indentation, paragraph gaps, underline
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createWorker } from 'tesseract.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PageAnalysis {
  pageIndex: number;
  isScanned: boolean;
  hasText: boolean;
  embeddedTextCount: number;
  imageDataUrl?: string;
  width: number;
  height: number;
  /** Left margin (pts) — smallest X of any text item on the page */
  leftMargin: number;
  /** Right margin (pts) */
  rightMargin: number;
}

/** One rich text run extracted from pdfjs */
export interface RichRun {
  text: string;
  x: number;       // left edge (pts, from left)
  y: number;       // top edge (pts, from top — already flipped)
  w: number;
  h: number;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  fontName: string;
  pageIndex: number;
  pageW: number;
  pageH: number;
  leftMargin: number;
  rightMargin: number;
}

/** A logical paragraph — one or more lines grouped by gap analysis */
export interface RichParagraph {
  runs: RichRun[];      // all runs in this paragraph, sorted by y then x
  text: string;         // joined text
  y: number;            // top of first line
  x: number;            // left of first line
  right: number;        // right edge
  fontSize: number;     // dominant font size
  bold: boolean;
  italic: boolean;
  alignment: 'left' | 'center' | 'right' | 'justify';
  indent: number;       // pts of indent beyond left margin
  isListItem: boolean;
  pageIndex: number;
  pageW: number;
  pageH: number;
  paragraphSpaceBefore: number; // pts gap above this paragraph
}

export type OCRLanguage =
  | 'auto' | 'eng' | 'hin' | 'eng+hin' | 'mar' | 'ben' | 'guj' | 'tel'
  | 'tam' | 'kan' | 'mal' | 'pan' | 'urd' | 'nep' | 'ara' | 'fas' | 'heb'
  | 'chi_sim' | 'chi_tra' | 'jpn' | 'kor' | 'rus' | 'ukr' | 'bel' | 'bul'
  | 'srp' | 'ell' | 'fra' | 'deu' | 'spa' | 'por' | 'ita' | 'nld' | 'pol'
  | 'ces' | 'slk' | 'hun' | 'ron' | 'hrv' | 'tur' | 'swe' | 'nor' | 'dan'
  | 'fin' | 'ind' | 'msa' | 'fil' | 'vie' | 'tha' | 'mya' | 'khm' | 'sin'
  | 'kat' | 'lat' | 'isl';

export const LANGUAGE_OPTIONS: { value: OCRLanguage; label: string; script: string }[] = [
  { value: 'auto',    label: '🌐 Auto Detect (Multi-Language)',  script: 'Multiple' },
  { value: 'eng',     label: '🇬🇧 English',                       script: 'Latin' },
  { value: 'hin',     label: '🇮🇳 Hindi (हिन्दी)',                script: 'Devanagari' },
  { value: 'eng+hin', label: '🇮🇳 Hindi + English',               script: 'Mixed' },
  { value: 'mar',     label: '🇮🇳 Marathi (मराठी)',               script: 'Devanagari' },
  { value: 'ben',     label: '🇮🇳 Bengali (বাংলা)',               script: 'Bengali' },
  { value: 'guj',     label: '🇮🇳 Gujarati (ગુજરાતી)',           script: 'Gujarati' },
  { value: 'tel',     label: '🇮🇳 Telugu (తెలుగు)',               script: 'Telugu' },
  { value: 'tam',     label: '🇮🇳 Tamil (தமிழ்)',                 script: 'Tamil' },
  { value: 'kan',     label: '🇮🇳 Kannada (ಕನ್ನಡ)',              script: 'Kannada' },
  { value: 'mal',     label: '🇮🇳 Malayalam (മലയാളം)',            script: 'Malayalam' },
  { value: 'pan',     label: '🇮🇳 Punjabi (ਪੰਜਾਬੀ)',             script: 'Gurmukhi' },
  { value: 'urd',     label: '🇵🇰 Urdu (اردو)',                   script: 'Arabic' },
  { value: 'nep',     label: '🇳🇵 Nepali (नेपाली)',               script: 'Devanagari' },
  { value: 'ara',     label: '🇸🇦 Arabic (العربية)',              script: 'Arabic' },
  { value: 'fas',     label: '🇮🇷 Persian / Farsi (فارسی)',       script: 'Arabic' },
  { value: 'heb',     label: '🇮🇱 Hebrew (עברית)',                script: 'Hebrew' },
  { value: 'chi_sim', label: '🇨🇳 Chinese Simplified (简体)',     script: 'CJK' },
  { value: 'chi_tra', label: '🇹🇼 Chinese Traditional (繁體)',    script: 'CJK' },
  { value: 'jpn',     label: '🇯🇵 Japanese (日本語)',              script: 'CJK' },
  { value: 'kor',     label: '🇰🇷 Korean (한국어)',               script: 'Hangul' },
  { value: 'rus',     label: '🇷🇺 Russian (Русский)',             script: 'Cyrillic' },
  { value: 'ukr',     label: '🇺🇦 Ukrainian (Українська)',        script: 'Cyrillic' },
  { value: 'bel',     label: '🇧🇾 Belarusian',                    script: 'Cyrillic' },
  { value: 'bul',     label: '🇧🇬 Bulgarian',                     script: 'Cyrillic' },
  { value: 'srp',     label: '🇷🇸 Serbian (Srpski)',              script: 'Cyrillic' },
  { value: 'ell',     label: '🇬🇷 Greek (Ελληνικά)',              script: 'Greek' },
  { value: 'fra',     label: '🇫🇷 French (Français)',             script: 'Latin' },
  { value: 'deu',     label: '🇩🇪 German (Deutsch)',              script: 'Latin' },
  { value: 'spa',     label: '🇪🇸 Spanish (Español)',             script: 'Latin' },
  { value: 'por',     label: '🇵🇹 Portuguese (Português)',        script: 'Latin' },
  { value: 'ita',     label: '🇮🇹 Italian (Italiano)',            script: 'Latin' },
  { value: 'nld',     label: '🇳🇱 Dutch (Nederlands)',            script: 'Latin' },
  { value: 'pol',     label: '🇵🇱 Polish (Polski)',               script: 'Latin' },
  { value: 'ces',     label: '🇨🇿 Czech (Čeština)',               script: 'Latin' },
  { value: 'slk',     label: '🇸🇰 Slovak (Slovenčina)',           script: 'Latin' },
  { value: 'hun',     label: '🇭🇺 Hungarian (Magyar)',            script: 'Latin' },
  { value: 'ron',     label: '🇷🇴 Romanian (Română)',             script: 'Latin' },
  { value: 'hrv',     label: '🇭🇷 Croatian (Hrvatski)',           script: 'Latin' },
  { value: 'tur',     label: '🇹🇷 Turkish (Türkçe)',              script: 'Latin' },
  { value: 'swe',     label: '🇸🇪 Swedish (Svenska)',             script: 'Latin' },
  { value: 'nor',     label: '🇳🇴 Norwegian (Norsk)',             script: 'Latin' },
  { value: 'dan',     label: '🇩🇰 Danish (Dansk)',                script: 'Latin' },
  { value: 'fin',     label: '🇫🇮 Finnish (Suomi)',               script: 'Latin' },
  { value: 'ind',     label: '🇮🇩 Indonesian (Bahasa)',           script: 'Latin' },
  { value: 'msa',     label: '🇲🇾 Malay (Bahasa Melayu)',        script: 'Latin' },
  { value: 'fil',     label: '🇵🇭 Filipino / Tagalog',           script: 'Latin' },
  { value: 'vie',     label: '🇻🇳 Vietnamese (Tiếng Việt)',       script: 'Latin' },
  { value: 'tha',     label: '🇹🇭 Thai (ภาษาไทย)',               script: 'Thai' },
  { value: 'mya',     label: '🇲🇲 Burmese / Myanmar (မြန်မာ)',   script: 'Myanmar' },
  { value: 'khm',     label: '🇰🇭 Khmer (ភាសាខ្មែរ)',            script: 'Khmer' },
  { value: 'sin',     label: '🇱🇰 Sinhala (සිංහල)',               script: 'Sinhala' },
  { value: 'kat',     label: '🇬🇪 Georgian (ქართული)',            script: 'Georgian' },
  { value: 'lat',     label: '🏛️ Latin',                          script: 'Latin' },
  { value: 'isl',     label: '🇮🇸 Icelandic (Íslenska)',          script: 'Latin' },
];

const AUTO_DETECT_LANG = 'eng+hin+chi_sim+ara+rus+jpn+kor';

// ── Helpers ───────────────────────────────────────────────────────────────────

function isBoldFont(fontName: string): boolean {
  const n = fontName.toLowerCase();
  return n.includes('bold') || n.includes('black') || n.includes('heavy') || n.includes('demi');
}
function isItalicFont(fontName: string): boolean {
  const n = fontName.toLowerCase();
  return n.includes('italic') || n.includes('oblique') || n.includes('slant');
}

// ── Step 1: Analyse pages ─────────────────────────────────────────────────────

export async function analysePDF(
  file: File,
  onProgress?: (msg: string, pct: number) => void,
): Promise<PageAnalysis[]> {
  const ab = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
  const results: PageAnalysis[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.(`Analysing page ${i} of ${pdf.numPages}…`, (i / pdf.numPages) * 25);
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const chars = content.items.map((it: any) => it.str?.trim() ?? '').join('').length;
    const isScanned = chars < 10;

    // Compute margins from actual text positions
    let leftMargin = vp.width;
    let rightMargin = 0;
    if (!isScanned) {
      for (const it of content.items as any[]) {
        if (!it.str?.trim()) continue;
        const tx = it.transform[4];
        const tw = it.width ?? 0;
        leftMargin  = Math.min(leftMargin, tx);
        rightMargin = Math.max(rightMargin, tx + tw);
      }
    }
    if (leftMargin === vp.width) leftMargin = 50;
    if (rightMargin === 0)       rightMargin = vp.width - 50;

    let imageDataUrl: string | undefined;
    if (isScanned) {
      const scale = 2;
      const rv = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(rv.width);
      canvas.height = Math.round(rv.height);
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport: rv, canvas }).promise;
      imageDataUrl = canvas.toDataURL('image/png');
    }

    results.push({
      pageIndex: i - 1, isScanned, hasText: chars >= 10,
      embeddedTextCount: chars, imageDataUrl,
      width: vp.width, height: vp.height,
      leftMargin, rightMargin,
    });
  }
  return results;
}

// ── Step 2: Extract rich runs from embedded text ───────────────────────────────

export async function extractRichRuns(
  file: File,
  pageAnalyses: PageAnalysis[],
  onProgress?: (msg: string, pct: number) => void,
): Promise<RichRun[]> {
  const ab = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
  const runs: RichRun[] = [];

  for (const pa of pageAnalyses) {
    if (pa.isScanned) continue;
    onProgress?.(`Extracting text from page ${pa.pageIndex + 1}…`, 25 + (pa.pageIndex / pageAnalyses.length) * 20);

    const page = await pdf.getPage(pa.pageIndex + 1);
    const content = await page.getTextContent({ includeMarkedContent: false } as any);

    for (const item of content.items as any[]) {
      if (!item.str?.trim()) continue;
      const [a, , , d, tx, ty] = item.transform;
      // Font size: use the scale factor from the matrix
      const fontSize = Math.abs(d) || Math.abs(a) || 12;
      const w = item.width ?? fontSize * item.str.length * 0.55;
      const h = item.height ?? fontSize;
      const fontName: string = item.fontName ?? '';

      runs.push({
        text: item.str,
        x: tx,
        y: pa.height - ty - h,   // flip: 0 = top of page
        w, h,
        fontSize: Math.max(6, Math.round(fontSize)),
        bold: isBoldFont(fontName),
        italic: isItalicFont(fontName),
        fontName,
        pageIndex: pa.pageIndex,
        pageW: pa.width,
        pageH: pa.height,
        leftMargin: pa.leftMargin,
        rightMargin: pa.rightMargin,
      });
    }
  }
  return runs;
}

// ── Step 3: OCR scanned pages → RichRun[] ─────────────────────────────────────

export async function ocrScannedPages(
  pageAnalyses: PageAnalysis[],
  lang: OCRLanguage,
  onProgress?: (msg: string, pct: number) => void,
): Promise<RichRun[]> {
  const scanned = pageAnalyses.filter(p => p.isScanned && p.imageDataUrl);
  if (!scanned.length) return [];

  const tesseractLang = lang === 'auto' ? AUTO_DETECT_LANG : lang;
  const worker = await createWorker(tesseractLang, 1, {
    logger: (m: any) => {
      if (m.status === 'recognizing text') {
        onProgress?.(`OCR ${Math.round((m.progress || 0) * 100)}%…`, 45 + Math.round((m.progress || 0) * 40));
      }
    },
  });

  const runs: RichRun[] = [];
  const OCR_SCALE = 2;

  for (let pi = 0; pi < scanned.length; pi++) {
    const pa = scanned[pi];
    onProgress?.(`Running OCR on page ${pa.pageIndex + 1}…`, 45 + (pi / scanned.length) * 40);
    const { data } = await worker.recognize(pa.imageDataUrl!, {}, { blocks: true });

    for (const block of (data as any).blocks ?? []) {
      for (const para of block.paragraphs ?? []) {
        for (const line of para.lines ?? []) {
          // Collect whole line as one run (better than word-by-word for layout)
          if (!line.text?.trim()) continue;
          const bbox = line.bbox;
          const x = bbox.x0 / OCR_SCALE;
          const y = bbox.y0 / OCR_SCALE;
          const w = (bbox.x1 - bbox.x0) / OCR_SCALE;
          const h = (bbox.y1 - bbox.y0) / OCR_SCALE;
          runs.push({
            text: line.text.trim(),
            x, y, w, h,
            fontSize: Math.max(8, Math.round(h * 0.75)),
            bold: false, italic: false, fontName: '',
            pageIndex: pa.pageIndex,
            pageW: pa.width, pageH: pa.height,
            leftMargin: pa.leftMargin, rightMargin: pa.rightMargin,
          });
        }
      }
    }
  }
  await worker.terminate();
  return runs;
}

// ── Step 4: Group runs → lines → paragraphs ───────────────────────────────────

function detectAlignment(
  lineX: number, lineRight: number,
  pageW: number, lm: number, rm: number,
): 'left' | 'center' | 'right' | 'justify' {
  const textW = lineRight - lineX;
  const usableW = rm - lm;
  const centerOfLine = lineX + textW / 2;
  const centerOfPage = lm + usableW / 2;

  // Full-width (>85% of usable) → justify
  if (textW > usableW * 0.85) return 'justify';

  // Centered: center of text within 8% of page center
  if (Math.abs(centerOfLine - centerOfPage) < usableW * 0.08) return 'center';

  // Right-aligned: text ends near right margin, starts far from left
  const rightGap = rm - lineRight;
  const leftGap  = lineX - lm;
  if (rightGap < usableW * 0.05 && leftGap > usableW * 0.3) return 'right';

  return 'left';
}

export function groupRunsIntoParagraphs(runs: RichRun[]): RichParagraph[] {
  // Group by page
  const byPage = new Map<number, RichRun[]>();
  for (const r of runs) {
    if (!byPage.has(r.pageIndex)) byPage.set(r.pageIndex, []);
    byPage.get(r.pageIndex)!.push(r);
  }

  const allParas: RichParagraph[] = [];

  for (const [, pageRuns] of byPage) {
    if (!pageRuns.length) continue;
    const pageW  = pageRuns[0].pageW;
    const lm     = pageRuns[0].leftMargin;
    const rm     = pageRuns[0].rightMargin;

    // Sort top→bottom, left→right
    pageRuns.sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);

    // --- Pass 1: merge runs into visual lines (same Y ± half lineHeight) ---
    interface LineGroup { runs: RichRun[]; y: number; }
    const lineGroups: LineGroup[] = [];

    for (const run of pageRuns) {
      const avgH = run.h || run.fontSize;
      const tol  = Math.max(3, avgH * 0.55); // tolerance = ~55% of line height
      const found = lineGroups.find(lg => Math.abs(lg.y - run.y) <= tol);
      if (found) {
        found.runs.push(run);
        found.y = (found.y + run.y) / 2; // average y
      } else {
        lineGroups.push({ runs: [run], y: run.y });
      }
    }
    lineGroups.sort((a, b) => a.y - b.y);

    // Compute median line height across the page (used for paragraph gap detection)
    const lineHeights = lineGroups.map(lg =>
      Math.max(...lg.runs.map(r => r.h || r.fontSize))
    );
    lineHeights.sort((a, b) => a - b);
    const medianH = lineHeights[Math.floor(lineHeights.length / 2)] || 12;

    // --- Pass 2: merge lines into paragraphs (gap > 1.4× median = new paragraph) ---
    const PARA_GAP_FACTOR = 1.4;
    let currentPara: LineGroup[] = [];
    const paraGroups: { lines: LineGroup[]; spaceBefore: number }[] = [];
    let prevLineBottom = 0;

    for (let li = 0; li < lineGroups.length; li++) {
      const lg = lineGroups[li];
      if (currentPara.length === 0) {
        currentPara.push(lg);
        prevLineBottom = lg.y + medianH;
        continue;
      }
      const gap = lg.y - prevLineBottom;
      if (gap > medianH * PARA_GAP_FACTOR) {
        paraGroups.push({ lines: currentPara, spaceBefore: li === 0 ? 0 : gap });
        currentPara = [lg];
      } else {
        currentPara.push(lg);
      }
      prevLineBottom = lg.y + medianH;
    }
    if (currentPara.length) paraGroups.push({ lines: currentPara, spaceBefore: 0 });

    // --- Pass 3: build RichParagraph objects ---
    for (const pg of paraGroups) {
      const allRuns = pg.lines.flatMap(lg => {
        lg.runs.sort((a, b) => a.x - b.x);
        return lg.runs;
      });
      if (!allRuns.length) continue;

      // Text: join runs in each line with space, separate lines with \n
      const lineTexts = pg.lines.map(lg =>
        lg.runs.sort((a, b) => a.x - b.x).map(r => r.text).join(' ')
      );
      const text = lineTexts.join('\n');

      const xs     = allRuns.map(r => r.x);
      const rights = allRuns.map(r => r.x + r.w);
      const minX   = Math.min(...xs);
      const maxX   = Math.max(...rights);
      const y      = allRuns[0].y;

      // Dominant font size (mode)
      const fsMap = new Map<number, number>();
      for (const r of allRuns) fsMap.set(r.fontSize, (fsMap.get(r.fontSize) ?? 0) + 1);
      const fontSize = [...fsMap.entries()].sort((a, b) => b[1] - a[1])[0][0];

      const bold   = allRuns.some(r => r.bold);
      const italic = allRuns.some(r => r.italic);

      // Use the FIRST line of the paragraph for alignment detection
      const firstLineRuns = pg.lines[0].runs;
      firstLineRuns.sort((a, b) => a.x - b.x);
      const lineX     = firstLineRuns[0].x;
      const lineRight = firstLineRuns[firstLineRuns.length - 1].x + firstLineRuns[firstLineRuns.length - 1].w;

      const alignment = detectAlignment(lineX, lineRight, pageW, lm, rm);

      // Indentation
      const indent = Math.max(0, minX - lm);

      // List item detection: short indent (<3× median font) OR starts with bullet chars
      const bulletRe = /^[\u2022\u2023\u2043\u25E6\u2219•\-\*]\s/;
      const isListItem = (indent > 0 && indent < medianH * 3) || bulletRe.test(text.trim());

      allParas.push({
        runs: allRuns, text, y,
        x: minX, right: maxX,
        fontSize, bold, italic, alignment,
        indent, isListItem,
        pageIndex: pageRuns[0].pageIndex,
        pageW, pageH: pageRuns[0].pageH,
        paragraphSpaceBefore: pg.spaceBefore,
      });
    }
  }

  return allParas;
}

// ── Pipeline types ─────────────────────────────────────────────────────────────

export interface PipelineOptions {
  lang: OCRLanguage;
  useOcr: boolean;
  onProgress?: (msg: string, pct: number) => void;
}

export interface PipelineResult {
  paragraphs: RichParagraph[];
  pageAnalyses: PageAnalysis[];
  pdfPageCount: number;
  hasAnyScannedPage: boolean;
  hasAnyTextPage: boolean;
}

// ── Master pipeline ────────────────────────────────────────────────────────────

export async function runOCRPipeline(
  file: File,
  options: PipelineOptions,
): Promise<PipelineResult> {
  const { lang, useOcr, onProgress } = options;

  onProgress?.('Analysing PDF structure…', 5);
  const pageAnalyses = await analysePDF(file, onProgress);

  const hasAnyScannedPage = pageAnalyses.some(p => p.isScanned);
  const hasAnyTextPage    = pageAnalyses.some(p => p.hasText);

  onProgress?.('Extracting embedded text…', 25);
  const embeddedRuns = await extractRichRuns(file, pageAnalyses, onProgress);

  let ocrRuns: RichRun[] = [];
  if (useOcr && hasAnyScannedPage) {
    onProgress?.('Starting OCR engine…', 45);
    ocrRuns = await ocrScannedPages(pageAnalyses, lang, onProgress);
  }

  onProgress?.('Analysing layout and formatting…', 88);
  const allRuns   = [...embeddedRuns, ...ocrRuns];
  const paragraphs = groupRunsIntoParagraphs(allRuns);

  onProgress?.('Done!', 100);
  return { paragraphs, pageAnalyses, pdfPageCount: pageAnalyses.length, hasAnyScannedPage, hasAnyTextPage };
}

// ── Legacy shim so old code referencing TextLine still compiles ────────────────
export type TextLine = RichParagraph;
