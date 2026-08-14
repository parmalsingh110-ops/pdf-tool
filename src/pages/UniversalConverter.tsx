import { useEffect, useMemo, useRef, useState } from 'react';
import { FileCog, Download, FileText, BarChart2, Layers, RefreshCw } from 'lucide-react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import JSZip from 'jszip';
import {
  Document, Packer, Paragraph, TextRun, Table as DocxTable, TableRow, TableCell,
  WidthType, HeadingLevel, AlignmentType, BorderStyle,
} from 'docx';
import * as XLSX from 'xlsx';
import PptxGenJS from 'pptxgenjs';
import FileDropzone from '../components/FileDropzone';
import { extractTextRegions, extractTableData } from '../lib/advancedVisionEngine';
import { extractDocxContent, DocxElement, DocxParagraph, DocxTable as DTable, DocxTableRow as DRow, safeStr } from '../lib/docxExtractor';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ─── Types ──────────────────────────────────────────────────────────
type Target = 'pdf' | 'png' | 'jpg' | 'jpeg' | 'webp' | 'txt' | 'docx' | 'xlsx' | 'pptx' | 'zip' | 'csv';
type Kind   = 'pdf' | 'image' | 'text' | 'docx' | 'xlsx' | 'pptx' | 'unknown';

const KIND_LABELS: Record<Kind, string> = {
  pdf:     'PDF Document',
  image:   'Image',
  text:    'Text File',
  docx:    'Word Document (.docx)',
  xlsx:    'Excel Spreadsheet (.xlsx)',
  pptx:    'PowerPoint Presentation (.pptx)',
  unknown: 'Unknown Format',
};

const TARGETS_FOR_KIND: Record<Kind, Target[]> = {
  pdf:     ['txt', 'docx', 'xlsx', 'pptx', 'png', 'jpg', 'jpeg', 'zip'],
  image:   ['pdf', 'png', 'jpg', 'jpeg', 'webp'],
  text:    ['pdf'],
  docx:    ['pdf', 'xlsx', 'pptx', 'txt'],
  xlsx:    ['pdf', 'docx', 'pptx', 'txt', 'csv'],
  pptx:    ['pdf', 'docx', 'xlsx', 'txt'],
  unknown: [],
};

const TARGET_LABELS: Record<Target, string> = {
  pdf:  'PDF Document',
  png:  'PNG Image',
  jpg:  'JPG Image',
  jpeg: 'JPEG Image',
  webp: 'WebP Image',
  txt:  'Plain Text (.txt)',
  docx: 'Word (.docx)',
  xlsx: 'Excel (.xlsx)',
  pptx: 'PowerPoint (.pptx)',
  zip:  'ZIP Archive (images)',
  csv:  'CSV File',
};

function detectKind(file: File): Kind {
  const name = file.name.toLowerCase();
  const type = file.type;
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx') || type.includes('wordprocessingml')) return 'docx';
  if (name.endsWith('.xlsx') || type.includes('spreadsheetml')) return 'xlsx';
  if (name.endsWith('.pptx') || type.includes('presentationml')) return 'pptx';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('text/') || name.endsWith('.txt')) return 'text';
  return 'unknown';
}

function baseName(name: string) {
  return name.replace(/\.[^/.]+$/, '');
}

function extensionFor(t: Target): string {
  const map: Record<Target, string> = {
    pdf: '.pdf', png: '.png', jpg: '.jpg', jpeg: '.jpeg', webp: '.webp',
    txt: '.txt', docx: '.docx', xlsx: '.xlsx', pptx: '.pptx', zip: '.zip', csv: '.csv',
  };
  return map[t] ?? `.${t}`;
}

// ─── XML helpers ────────────────────────────────────────────────────
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d)));
}

// ─── Extractors ──────────────────────────────────────────────────────

/** Legacy flat-text extractor — only used as a last-resort fallback */
async function extractDocxParagraphsFlat(file: File): Promise<string[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) throw new Error('Invalid DOCX: missing word/document.xml');
  const paragraphs: string[] = [];
  const pMatches = [...docXml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)];
  for (const pm of pMatches) {
    const tMatches = [...pm[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)];
    const text = decodeXmlEntities(tMatches.map(m => m[1]).join(''));
    if (text.trim()) paragraphs.push(text.trim());
  }
  return paragraphs;
}

type XlsxSheet = { name: string; rows: any[][] };

async function extractXlsxSheets(file: File): Promise<XlsxSheet[]> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellText: true, cellNF: false });
  return wb.SheetNames.map(name => {
    const ws = wb.Sheets[name];
    // Use sheet_to_json with raw:false to get formatted strings including \n for multiline cells
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '', raw: false });
    return { name, rows: rows as any[][] };
  });
}

// ─── XLSX→PDF helpers ────────────────────────────────────────────────

/** Wrap a cell's text (handles both \n line breaks and word wrap) */
function wrapCellText(text: string, maxWidth: number, font: any, size: number): string[] {
  if (!text || maxWidth <= 0) return [''];
  // Sanitize non-ASCII chars for pdf-lib standard fonts
  const safe = text.replace(/[^\x09\x20-\x7E\n]/g, '?');
  const inputLines = safe.split('\n');
  const result: string[] = [];

  for (const inputLine of inputLines) {
    if (!inputLine.trim()) { result.push(''); continue; }
    const words = inputLine.split(/\s+/);
    let line = '';
    for (const word of words) {
      if (!word) continue;
      const test = line ? `${line} ${word}` : word;
      let w = 0;
      try { w = font.widthOfTextAtSize(test, size); } catch { w = test.length * size * 0.55; }
      if (w > maxWidth && line) {
        result.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) result.push(line);
  }
  return result.length ? result : [''];
}

/** Proportional column widths based on content analysis */
function calcColWidths(rows: any[][], maxCols: number, availW: number): number[] {
  if (!maxCols) return [];
  const MIN_W = 32;
  const MAX_SAMPLE = 30;

  // Score = max content length seen in column (capped at 60 chars per natural line)
  const scores = Array(maxCols).fill(0);
  const sampleRows = rows.slice(0, MAX_SAMPLE);
  for (const row of sampleRows) {
    for (let ci = 0; ci < maxCols; ci++) {
      const text = String(row[ci] ?? '');
      const maxNaturalLineLen = Math.max(...text.split('\n').map(l => l.length));
      scores[ci] = Math.max(scores[ci], Math.min(maxNaturalLineLen, 60));
    }
  }
  // Give at least a minimum score to every column
  for (let ci = 0; ci < maxCols; ci++) scores[ci] = Math.max(scores[ci], 6);

  const totalScore = scores.reduce((a, b) => a + b, 0);
  let widths = scores.map(s => Math.max(MIN_W, Math.floor((s / totalScore) * availW)));

  // Scale to fit exactly
  const totalW = widths.reduce((a, b) => a + b, 0);
  const scale = availW / totalW;
  widths = widths.map(w => Math.max(MIN_W, Math.round(w * scale)));

  // Fix rounding
  const diff = availW - widths.reduce((a, b) => a + b, 0);
  widths[widths.length - 1] = Math.max(MIN_W, widths[widths.length - 1] + diff);
  return widths;
}

interface PptxSlide {
  title: string;
  body: string;
  tableRows: string[][];
}

async function extractPptxSlides(file: File): Promise<PptxSlide[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slides: PptxSlide[] = [];
  let i = 1;
  while (i <= 200) {
    const f = zip.file(`ppt/slides/slide${i}.xml`);
    if (!f) break;
    const xml = await f.async('string');

    // Detect title placeholder (ph type="title" or ph type="ctrTitle")
    let title = '';
    const titleMatch = xml.match(/<p:sp>[\s\S]*?<p:ph\s[^>]*type="(?:title|ctrTitle)"[^>]*\/>[\s\S]*?<\/p:sp>/);
    if (titleMatch) {
      const titleTexts = [...titleMatch[0].matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
        .map(m => decodeXmlEntities(m[1]))
        .filter(Boolean);
      title = titleTexts.join(' ').trim();
    }

    // Tables: extract <a:tbl> elements
    const tableRows: string[][] = [];
    const tableMatches = [...xml.matchAll(/<a:tbl>[\s\S]*?<\/a:tbl>/g)];
    for (const tm of tableMatches) {
      const rowMatches = [...tm[0].matchAll(/<a:tr[\s>][\s\S]*?<\/a:tr>/g)];
      for (const rm of rowMatches) {
        const cellMatches = [...rm[0].matchAll(/<a:tc[\s>][\s\S]*?<\/a:tc>/g)];
        const cells = cellMatches.map(cm => {
          return [...cm[0].matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
            .map(m => decodeXmlEntities(m[1]))
            .join('')
            .trim();
        });
        if (cells.some(c => c)) tableRows.push(cells);
      }
    }

    // Body text: all text NOT in the title placeholder and NOT in tables
    // Strip table XML first
    let bodyXml = xml;
    for (const tm of tableMatches) bodyXml = bodyXml.replace(tm[0], '');
    if (titleMatch) bodyXml = bodyXml.replace(titleMatch[0], '');

    const bodyTexts = [...bodyXml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
      .map(m => decodeXmlEntities(m[1].trim()))
      .filter(Boolean);
    const body = bodyTexts.join(' ').trim();

    slides.push({ title, body, tableRows });
    i++;
  }
  return slides;
}

/** Flat text fallback for compatibility */
async function extractPptxSlidesFlat(file: File): Promise<string[]> {
  const structured = await extractPptxSlides(file);
  return structured.map(s => [s.title, s.body].filter(Boolean).join('\n'));
}

async function pdfFromParagraphs(paragraphs: string[], title?: string): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const boldItalic = await doc.embedFont(StandardFonts.HelveticaBoldOblique);
  const W = 595, H = 842, margin = 50, lh = 16, sz = 11;
  let page = doc.addPage([W, H]);
  let y = H - margin;

  if (title) {
    page.drawText(safeStr(title).slice(0, 80), { x: margin, y, size: 18, font: bold, color: rgb(0.1, 0.1, 0.5) });
    y -= 28;
  }

  const ensurePage = () => {
    if (y < margin + lh) { page = doc.addPage([W, H]); y = H - margin; }
  };

  const drawWrapped = (text: string, useFont?: any, useSz?: number) => {
    const f = useFont || font;
    const s = useSz || sz;
    const maxW = W - margin * 2;
    const words = text.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      let testW = 0;
      try { testW = f.widthOfTextAtSize(test, s); } catch { testW = test.length * s * 0.5; }
      if (testW > maxW && line) {
        ensurePage();
        try { page.drawText(line, { x: margin, y, size: s, font: f, color: rgb(0.07, 0.07, 0.07) }); } catch {}
        y -= s * 1.4;
        line = w;
      } else line = test;
    }
    if (line) {
      ensurePage();
      try { page.drawText(line, { x: margin, y, size: s, font: f, color: rgb(0.07, 0.07, 0.07) }); } catch {}
      y -= s * 1.4;
    }
    y -= 3;
  };

  for (const p of paragraphs) {
    const safe = safeStr(p);
    if (!safe) continue;
    drawWrapped(safe);
  }
  return new Blob([await doc.save()], { type: 'application/pdf' });
}

/**
 * Build a rich PDF from structured DOCX elements (paragraphs with styles + tables).
 * Renders headings at larger font sizes, preserves bold/italic/color per-run,
 * draws tables with borders, header row background, and alternating row colors.
 */
async function pdfFromDocxContent(
  elements: DocxElement[],
  title?: string,
): Promise<Blob> {
  const doc = await PDFDocument.create();
  const fontReg  = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const fontBI   = await doc.embedFont(StandardFonts.HelveticaBoldOblique);

  /** Parse a '#rrggbb' hex string to pdf-lib rgb() */
  const hexToRgbPdf = (hex: string) => {
    const h = hex.replace('#', '');
    if (h.length !== 6) return rgb(0.07, 0.07, 0.07);
    return rgb(
      parseInt(h.slice(0,2),16)/255,
      parseInt(h.slice(2,4),16)/255,
      parseInt(h.slice(4,6),16)/255,
    );
  };

  const W = 595, H = 842, MARGIN = 50;
  const AW = W - MARGIN * 2;
  const BASE_SZ = 11;
  const LINE_H = BASE_SZ * 1.45;

  let page = doc.addPage([W, H]);
  let y = H - MARGIN;

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = doc.addPage([W, H]);
      y = H - MARGIN;
    }
  };

  const pickFont = (isBold: boolean, isItalic: boolean) => {
    if (isBold && isItalic) return fontBI;
    if (isBold) return fontBold;
    if (isItalic) return fontItalic;
    return fontReg;
  };

  const headingSizes: Record<number, number> = {
    1: 22, 2: 18, 3: 15, 4: 13, 5: 12, 6: 11,
  };

  /** Word-wrap a text line into multiple lines fitting maxW */
  const wrapText = (text: string, maxW: number, f: any, sz: number): string[] => {
    if (!text) return [];
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      if (!w) continue;
      const test = cur ? `${cur} ${w}` : w;
      let tw = 0;
      try { tw = f.widthOfTextAtSize(test, sz); } catch { tw = test.length * sz * 0.5; }
      if (tw > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  };

  // Title — intentionally omitted: filename as heading causes formatting issues
  // The document content already starts from the first element.

  for (const el of elements) {
    if (el.type === 'paragraph') {
      const p = el as DocxParagraph;
      const text = safeStr(p.text);
      if (!text && p.runs.length === 0) {
        y -= 6; // empty paragraph = small gap
        continue;
      }

      const isHeading = p.heading > 0;
      const sz = isHeading ? (headingSizes[p.heading] ?? BASE_SZ) : BASE_SZ;
      // Add space before headings
      if (isHeading) {
        y -= Math.min(sz * 0.8, 16);
        ensureSpace(sz * 2);
        // Draw heading as one block using its text
        const headingColor = rgb(0.1, 0.12, 0.5);
        const hFont = pickFont(true, false);
        const hLines = wrapText(text, AW, hFont, sz);
        for (const line of hLines) {
          let x = MARGIN;
          if (p.alignment === 'center') {
            let lw = 0; try { lw = hFont.widthOfTextAtSize(line, sz); } catch { lw = line.length * sz * 0.5; }
            x = MARGIN + (AW - lw) / 2;
          }
          try { page.drawText(line, { x, y, size: sz, font: hFont, color: headingColor }); } catch {}
          y -= sz * 1.45;
        }
        y -= 4;
      } else if (p.runs && p.runs.length > 0) {
        // Per-run rendering: preserves bold/italic/color/size from each run
        // We render runs inline, breaking at the available width
        let cursorX = MARGIN + (p.indentLeft > 0 ? Math.min(p.indentLeft / 20, 100) : 0);
        const lineStartX = cursorX;
        const lineAvailW = MARGIN + AW - lineStartX;
        let lineBuffer: { text: string; font: any; sz: number; color: any }[] = [];
        let lineW = 0;

        const flushLine = (extraGap = 0) => {
          if (lineBuffer.length === 0) return;
          // Alignment adjustment
          let startX = lineStartX;
          if (p.alignment === 'center') {
            let totalW = 0;
            for (const seg of lineBuffer) { try { totalW += seg.font.widthOfTextAtSize(seg.text, seg.sz); } catch { totalW += seg.text.length * seg.sz * 0.5; } }
            startX = MARGIN + (AW - totalW) / 2;
          } else if (p.alignment === 'right') {
            let totalW = 0;
            for (const seg of lineBuffer) { try { totalW += seg.font.widthOfTextAtSize(seg.text, seg.sz); } catch { totalW += seg.text.length * seg.sz * 0.5; } }
            startX = MARGIN + AW - totalW;
          }
          let drawX = startX;
          const maxSz = Math.max(...lineBuffer.map(s => s.sz));
          ensureSpace(maxSz * 1.5);
          for (const seg of lineBuffer) {
            try { page.drawText(seg.text, { x: drawX, y, size: seg.sz, font: seg.font, color: seg.color }); } catch {}
            try { drawX += seg.font.widthOfTextAtSize(seg.text, seg.sz); } catch { drawX += seg.text.length * seg.sz * 0.5; }
          }
          y -= maxSz * 1.45 + extraGap;
          lineBuffer = [];
          lineW = 0;
        };

        for (const run of p.runs) {
          if (!run.text) continue;
          const runSz = run.fontSize ? Math.max(6, Math.min(run.fontSize * 0.75, 24)) : BASE_SZ;
          const runFont = pickFont(!!run.bold, !!run.italic);
          const runColor = (run.color && run.color !== 'auto') ? hexToRgbPdf(run.color) : rgb(0.07, 0.07, 0.07);
          const words = run.text.split(' ');
          for (let wi = 0; wi < words.length; wi++) {
            const word = words[wi];
            const piece = wi < words.length - 1 ? word + ' ' : word;
            let pieceW = 0;
            try { pieceW = runFont.widthOfTextAtSize(piece, runSz); } catch { pieceW = piece.length * runSz * 0.5; }
            if (lineW + pieceW > lineAvailW && lineBuffer.length > 0) {
              flushLine();
              cursorX = lineStartX;
            }
            lineBuffer.push({ text: piece, font: runFont, sz: runSz, color: runColor });
            lineW += pieceW;
          }
        }
        flushLine(3);
      } else {
        // Fallback: plain text rendering
        const isBold2 = p.runs.some(r => r.bold);
        const isItalic2 = p.runs.some(r => r.italic);
        const f = pickFont(isBold2, isItalic2);
        const lines = wrapText(text, AW, f, sz);
        const neededH = lines.length * sz * 1.45 + 4;
        ensureSpace(neededH);
        for (const line of lines) {
          let x = MARGIN;
          if (p.alignment === 'center') {
            let lw = 0; try { lw = f.widthOfTextAtSize(line, sz); } catch { lw = line.length * sz * 0.5; }
            x = MARGIN + (AW - lw) / 2;
          } else if (p.alignment === 'right') {
            let lw = 0; try { lw = f.widthOfTextAtSize(line, sz); } catch { lw = line.length * sz * 0.5; }
            x = MARGIN + AW - lw;
          } else if (p.indentLeft > 0) {
            x = MARGIN + Math.min(p.indentLeft / 20, 100);
          }
          try { page.drawText(line, { x, y, size: sz, font: f, color: rgb(0.07, 0.07, 0.07) }); } catch {}
          y -= sz * 1.45;
        }
        y -= 3;
      }

    } else if (el.type === 'table') {
      const t = el as DTable;
      if (!t.rows.length) continue;

      const nRows = t.rows.length;
      const maxCols = Math.max(...t.rows.map((r: DRow) => r.cells.length));
      if (!maxCols) continue;

      // Calculate column widths (equal distribution)
      const colW = AW / maxCols;
      const cellPadH = 4;
      const cellPadV = 3;
      const cellFontSz = Math.min(BASE_SZ, 10);
      const cellLineH = cellFontSz * 1.5;

      y -= 6; // gap before table

      for (let ri = 0; ri < nRows; ri++) {
        const row = t.rows[ri];
        const isHeader = row.isHeader;

        // Calculate row height
        let maxLines = 1;
        for (const cell of row.cells) {
          const cellText = safeStr(cell.text);
          const f = (isHeader || cell.bold) ? fontBold : fontReg;
          const cellMaxW = colW * (cell.colspan || 1) - cellPadH * 2;
          const lines = wrapText(cellText, cellMaxW, f, cellFontSz);
          maxLines = Math.max(maxLines, lines.length);
        }
        const rowH = maxLines * cellLineH + cellPadV * 2;

        ensureSpace(rowH + 2);

        // Background
        if (isHeader) {
          page.drawRectangle({ x: MARGIN, y: y - rowH, width: AW, height: rowH, color: rgb(0.1, 0.23, 0.56) });
        } else if (ri % 2 === 0) {
          page.drawRectangle({ x: MARGIN, y: y - rowH, width: AW, height: rowH, color: rgb(0.94, 0.96, 1.0) });
        }

        // Cell content
        let cellX = MARGIN;
        for (let ci = 0; ci < row.cells.length; ci++) {
          const cell = row.cells[ci];
          const cellText = safeStr(cell.text);
          const cSpan = cell.colspan || 1;
          const thisCellW = colW * cSpan;
          const f = (isHeader || cell.bold) ? fontBold : fontReg;
          const textColor = isHeader ? rgb(1, 1, 1) : rgb(0.07, 0.07, 0.07);
          const cellMaxW = thisCellW - cellPadH * 2;
          const lines = wrapText(cellText, cellMaxW, f, cellFontSz);

          for (let li = 0; li < lines.length; li++) {
            const ty = y - cellPadV - li * cellLineH - cellLineH * 0.2;
            if (ty < y - rowH + 1) break;
            try { page.drawText(lines[li], { x: cellX + cellPadH, y: ty, size: cellFontSz, font: f, color: textColor }); } catch {}
          }

          // Right cell border
          const rightX = cellX + thisCellW;
          page.drawLine({
            start: { x: rightX, y },
            end: { x: rightX, y: y - rowH },
            thickness: 0.3,
            color: rgb(0.6, 0.65, 0.8),
          });

          cellX += thisCellW;
        }

        // Left border
        page.drawLine({
          start: { x: MARGIN, y },
          end: { x: MARGIN, y: y - rowH },
          thickness: 0.3,
          color: rgb(0.6, 0.65, 0.8),
        });

        // Bottom border
        page.drawLine({
          start: { x: MARGIN, y: y - rowH },
          end: { x: MARGIN + AW, y: y - rowH },
          thickness: isHeader ? 0.7 : 0.3,
          color: isHeader ? rgb(0.1, 0.2, 0.5) : rgb(0.6, 0.65, 0.8),
        });

        // Top border (only for first row)
        if (ri === 0) {
          page.drawLine({
            start: { x: MARGIN, y },
            end: { x: MARGIN + AW, y },
            thickness: 0.5,
            color: rgb(0.1, 0.2, 0.5),
          });
        }

        y -= rowH;
      }

      y -= 8; // gap after table
    }
  }

  return new Blob([await doc.save()], { type: 'application/pdf' });
}

// ─── Advanced XLSX → PDF (merge-aware, style-aware) ─────────────────

async function xlsxFileToPdf(file: File): Promise<Blob> {
  const wb = XLSX.read(await file.arrayBuffer(), {
    type: 'array',
    cellStyles: true,    // read alignment, bold, font size
    cellDates: false,
  });

  const pdfDoc   = await PDFDocument.create();
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const FONT_SZ  = 8;
  const LINE_H   = FONT_SZ * 1.58;
  const PAD_H    = 4;   // horizontal cell padding
  const PAD_V    = 3;   // vertical cell padding

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws['!ref']) continue;

    const range  = XLSX.utils.decode_range(ws['!ref']);
    const R0     = range.s.r, C0 = range.s.c;
    const nRows  = range.e.r - range.s.r + 1;
    const nCols  = range.e.c - range.s.c + 1;
    if (!nRows || !nCols) continue;

    // ── Build merge maps ─────────────────────────────────────────────
    // mergeOf[ri][ci] = {cs, rs} for the top-left cell of each merge
    const mergeOf  = new Map<string, { cs: number; rs: number }>();
    const coveredSet = new Set<string>();

    for (const m of (ws['!merges'] ?? [])) {
      const ri = m.s.r - R0, ci = m.s.c - C0;
      const cs = m.e.c - m.s.c + 1, rs = m.e.r - m.s.r + 1;
      mergeOf.set(`${ri},${ci}`, { cs, rs });
      for (let r = m.s.r; r <= m.e.r; r++) {
        for (let c = m.s.c; c <= m.e.c; c++) {
          if (r !== m.s.r || c !== m.s.c) coveredSet.add(`${r - R0},${c - C0}`);
        }
      }
    }

    // ── Column widths from Excel ─────────────────────────────────────
    const colInfoArr = ws['!cols'] ?? [];
    const CHAR_PT    = 6.0;
    const rawColW    = Array.from({ length: nCols }, (_, i) => {
      const info = colInfoArr[i + C0];
      if (info?.wpx) return info.wpx * 0.75;
      if (info?.wch) return Math.max(20, info.wch * CHAR_PT);
      return 8.43 * CHAR_PT;
    });

    // ── Row heights from Excel ───────────────────────────────────────
    const rowInfoArr  = ws['!rows'] ?? [];
    const xlRowHint   = (ri: number) => {
      const h = rowInfoArr[ri + R0];
      return h?.hpt ?? 0; // 0 = use auto
    };

    // ── Page orientation ─────────────────────────────────────────────
    const MARGIN   = 28;
    const rawTotal = rawColW.reduce((a, b) => a + b, 0);
    const W  = rawTotal + MARGIN * 2 > 580 ? 841 : 595;
    const H  = W === 841 ? 595 : 842;
    const AW = W - MARGIN * 2;

    // Scale columns to fit page width
    const scl   = AW / rawTotal;
    const colW  = rawColW.map(w => Math.max(18, Math.round(w * scl)));
    const diff  = AW - colW.reduce((a, b) => a + b, 0);
    colW[colW.length - 1] = Math.max(18, colW[colW.length - 1] + diff);

    // ── Helper: get cell object ──────────────────────────────────────
    const getCell = (ri: number, ci: number) =>
      ws[XLSX.utils.encode_cell({ r: ri + R0, c: ci + C0 })];

    // ── Build full grid ──────────────────────────────────────────────
    type CP = {
      text: string; lines: string[];
      align: 'left' | 'center' | 'right';
      bold: boolean; italic: boolean;
      fontSize: number;
      colSpan: number; rowSpan: number;
      covered: boolean;
      cellW: number;
    };

    const grid: CP[][] = [];
    let colHeaderRowIdx = -1; // first non-covered, non-full-merge row = header

    for (let ri = 0; ri < nRows; ri++) {
      const row: CP[] = [];
      let rowIsFullMerge = false;
      for (let ci = 0; ci < nCols; ci++) {
        const key     = `${ri},${ci}`;
        const isCov   = coveredSet.has(key);
        const minfo   = mergeOf.get(key) ?? { cs: 1, rs: 1 };
        const cell    = getCell(ri, ci);

        let text = '';
        if (!isCov && cell) {
          text = String(cell.w ?? cell.v ?? '').replace(/[^\x09\x0A\x20-\x7E]/g, '?');
        }

        // Style
        let align: CP['align'] = 'left';
        let bold   = false;
        let italic = false;
        let fsize  = FONT_SZ;

        if (cell?.s) {
          const h = cell.s.alignment?.horizontal;
          if (h === 'center' || h === 'centerContinuous') align = 'center';
          else if (h === 'right') align = 'right';
          bold   = cell.s.font?.bold   === true;
          italic = cell.s.font?.italic === true;
          if (cell.s.font?.sz) fsize = Math.max(6, Math.min(16, cell.s.font.sz * 0.72));
        }

        // Heuristic: if this cell's merge spans ALL columns → treat as centered title
        if (minfo.cs >= nCols && nCols > 2 && !cell?.s?.alignment) {
          align = 'center';
          if (text && ri < 6) bold = true; // first few rows of a doc are usually bold
        }

        // Full-merge row detection
        if (ci === 0 && minfo.cs >= nCols) rowIsFullMerge = true;

        const fnt   = bold ? fontBold : fontReg;
        const cellW = colW.slice(ci, ci + minfo.cs).reduce((a, b) => a + b, 0);
        const lines = isCov ? [] : wrapCellText(text, cellW - PAD_H * 2, fnt, fsize);

        row.push({ text, lines, align, bold, italic, fontSize: fsize,
                   colSpan: minfo.cs, rowSpan: minfo.rs, covered: isCov, cellW });
      }

      // First row that has multiple non-covered cells with content and is NOT a full-merge
      // and all main cells appear to be column headers (short text, possibly bold)
      if (colHeaderRowIdx === -1 && !rowIsFullMerge) {
        const hasContent = row.some(c => !c.covered && c.text.trim());
        if (hasContent) colHeaderRowIdx = ri;
      }

      grid.push(row);
    }

    // ── Start rendering ──────────────────────────────────────────────
    let page = pdfDoc.addPage([W, H]);
    let y    = H - MARGIN;

    // Sheet name strip
    const safeSheet = sheetName.replace(/[^\x20-\x7E]/g, '?');
    page.drawRectangle({ x: 0, y: H - MARGIN - 16, width: W, height: 16, color: rgb(0.15, 0.20, 0.50) });
    try { page.drawText(safeSheet, { x: MARGIN, y: H - MARGIN - 12, size: 9, font: fontBold, color: rgb(1, 1, 1) }); } catch { /* */ }
    y -= 20;

    let dataRowCount = 0; // for alternating row color (only data rows)

    for (let ri = 0; ri < nRows; ri++) {
      const row        = grid[ri];
      const isFullMerge = row[0]?.colSpan >= nCols && nCols > 2;
      const isColHdr    = ri === colHeaderRowIdx;
      const isDataRow   = !isFullMerge && !isColHdr;

      // ── Row height: max of Excel hint, content, minimum ──────────
      const maxLines = Math.max(1, ...row.filter(c => !c.covered).map(c => c.lines.length));
      const contentH = maxLines * LINE_H + PAD_V * 2;
      const xlHint   = xlRowHint(ri);
      const rowH     = Math.max(contentH, xlHint > 0 ? xlHint : 0, isColHdr ? 20 : 12);

      // ── Page break ───────────────────────────────────────────────
      if (y - rowH < MARGIN) {
        page = pdfDoc.addPage([W, H]);
        y    = H - MARGIN;

        // Repeat sheet name + col header on new page
        page.drawRectangle({ x: 0, y: H - MARGIN - 16, width: W, height: 16, color: rgb(0.15, 0.20, 0.50) });
        try { page.drawText(`${safeSheet} (cont.)`, { x: MARGIN, y: H - MARGIN - 12, size: 9, font: fontBold, color: rgb(1, 1, 1) }); } catch { /* */ }
        y -= 20;

        if (colHeaderRowIdx >= 0 && ri > colHeaderRowIdx) {
          const hrow  = grid[colHeaderRowIdx];
          const hMaxL = Math.max(1, ...hrow.filter(c => !c.covered).map(c => c.lines.length));
          const hRowH = Math.max(hMaxL * LINE_H + PAD_V * 2, 20);
          renderRow(page, hrow, y, hRowH, MARGIN, AW, colW, nCols, 'header', 0, fontReg, fontBold, LINE_H, PAD_H, PAD_V);
          y -= hRowH;
        }
      }

      // ── Draw row ─────────────────────────────────────────────────
      const rowKind: 'fullmerge' | 'header' | 'data' =
        isFullMerge ? 'fullmerge' : isColHdr ? 'header' : 'data';

      if (isDataRow) dataRowCount++;
      renderRow(page, row, y, rowH, MARGIN, AW, colW, nCols, rowKind, dataRowCount, fontReg, fontBold, LINE_H, PAD_H, PAD_V);
      y -= rowH;
      if (isFullMerge) y -= 1; // slight gap between title sections
    }

    // Final bottom border
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + AW, y }, thickness: 0.3, color: rgb(0.68, 0.70, 0.82) });
  }

  return new Blob([await pdfDoc.save()], { type: 'application/pdf' });
}

/** Render a single row onto a page */
function renderRow(
  page: any,
  row: Array<{
    text: string; lines: string[];
    align: 'left' | 'center' | 'right';
    bold: boolean; fontSize: number;
    colSpan: number; covered: boolean; cellW: number;
  }>,
  y: number, rowH: number,
  margin: number, availW: number,
  colW: number[], nCols: number,
  kind: 'fullmerge' | 'header' | 'data',
  dataRowCount: number,
  fontReg: any, fontBold: any,
  LINE_H: number, PAD_H: number, PAD_V: number,
) {
  // Background
  if (kind === 'fullmerge' && row[0]?.text.trim()) {
    page.drawRectangle({ x: margin, y: y - rowH, width: availW, height: rowH, color: rgb(0.94, 0.95, 0.99) });
  } else if (kind === 'header') {
    page.drawRectangle({ x: margin, y: y - rowH, width: availW, height: rowH, color: rgb(0.16, 0.32, 0.72) });
  } else if (kind === 'data') {
    const bg = dataRowCount % 2 === 1 ? rgb(0.96, 0.97, 1.0) : rgb(1, 1, 1);
    page.drawRectangle({ x: margin, y: y - rowH, width: availW, height: rowH, color: bg });
  }

  // Left outer border (not for full-merge rows)
  if (kind !== 'fullmerge') {
    page.drawLine({ start: { x: margin, y }, end: { x: margin, y: y - rowH }, thickness: 0.3, color: rgb(0.68, 0.70, 0.82) });
  }

  let x = margin;
  for (let ci = 0; ci < nCols; ci++) {
    const cp = row[ci];
    if (!cp || cp.covered) { x += colW[ci] ?? 0; continue; }

    const fnt       = cp.bold ? fontBold : fontReg;
    const sz        = cp.fontSize;
    const textColor = kind === 'header' ? rgb(1, 1, 1) : rgb(0.07, 0.07, 0.07);

    // Draw each wrapped line
    cp.lines.forEach((line, li) => {
      if (!line) return;
      const ty = y - PAD_V - li * LINE_H - LINE_H * 0.18;
      if (ty <= y - rowH + 1) return;

      let tx: number;
      if (cp.align === 'center') {
        let lw = 0; try { lw = fnt.widthOfTextAtSize(line, sz); } catch { lw = line.length * sz * 0.55; }
        tx = x + Math.max(PAD_H, (cp.cellW - lw) / 2);
      } else if (cp.align === 'right') {
        let lw = 0; try { lw = fnt.widthOfTextAtSize(line, sz); } catch { lw = line.length * sz * 0.55; }
        tx = x + cp.cellW - lw - PAD_H;
      } else {
        tx = x + PAD_H;
      }
      try { page.drawText(line, { x: tx, y: ty, size: sz, font: fnt, color: textColor }); } catch { /* */ }
    });

    // Right cell border (not for full-merge rows)
    if (kind !== 'fullmerge') {
      page.drawLine({
        start: { x: x + cp.cellW, y },
        end:   { x: x + cp.cellW, y: y - rowH },
        thickness: 0.3, color: rgb(0.68, 0.70, 0.82),
      });
    }

    x += cp.cellW;
    // Advance ci past covered cells included in this colSpan
    for (let s = 1; s < cp.colSpan; s++) ci++;
  }

  // Bottom border
  if (kind !== 'fullmerge' || row[0]?.text.trim()) {
    page.drawLine({
      start: { x: margin, y: y - rowH },
      end:   { x: margin + availW, y: y - rowH },
      thickness: kind === 'header' ? 0.7 : 0.3,
      color: kind === 'header' ? rgb(0.12, 0.28, 0.65) : rgb(0.68, 0.70, 0.82),
    });
  }
}

// Keep pdfFromXlsxSheets as a fallback (used when no File object available)
async function pdfFromXlsxSheets(sheets: XlsxSheet[]): Promise<Blob> {
  const doc  = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (const { name, rows } of sheets) {
    const nonEmpty = rows.filter(r => r.some(c => String(c ?? '').trim()));
    if (!nonEmpty.length) continue;
    const nCols = Math.max(...nonEmpty.map(r => r.length));
    if (!nCols) continue;

    const W = nCols >= 5 ? 841 : 595, H = W === 841 ? 595 : 842;
    const margin = 32, availW = W - margin * 2;
    const FONT_SZ = 8, LINE_H = FONT_SZ * 1.55, PAD_H = 4, PAD_V = 3.5;
    const colWidths = calcColWidths(nonEmpty, nCols, availW);

    let page = doc.addPage([W, H]);
    let y    = H - margin;
    const safeName = name.replace(/[^\x20-\x7E]/g, '?');
    try { page.drawText(`Sheet: ${safeName}`, { x: margin, y, size: 11, font: bold, color: rgb(0.1, 0.15, 0.55) }); } catch { /* */ }
    y -= 18;

    for (let ri = 0; ri < nonEmpty.length; ri++) {
      const row     = nonEmpty[ri];
      const wrapped = Array.from({ length: nCols }, (_, ci) => wrapCellText(String(row[ci] ?? ''), colWidths[ci] - PAD_H * 2, font, FONT_SZ));
      const maxL    = Math.max(1, ...wrapped.map(w => w.length));
      const rowH    = maxL * LINE_H + PAD_V * 2;
      const isHdr   = ri === 0;

      if (y - rowH < margin) {
        page = doc.addPage([W, H]);
        y    = H - margin;
      }

      if (isHdr) {
        page.drawRectangle({ x: margin, y: y - rowH, width: availW, height: rowH, color: rgb(0.16, 0.32, 0.72) });
      } else if (ri % 2 === 0) {
        page.drawRectangle({ x: margin, y: y - rowH, width: availW, height: rowH, color: rgb(0.96, 0.97, 1) });
      }

      let x = margin;
      for (let ci = 0; ci < nCols; ci++) {
        wrapped[ci].forEach((line, li) => {
          if (!line) return;
          const ty = y - PAD_V - li * LINE_H - LINE_H * 0.15;
          if (ty > y - rowH + 1) {
            try { page.drawText(line, { x: x + PAD_H, y: ty, size: FONT_SZ, font: isHdr ? bold : font, color: isHdr ? rgb(1, 1, 1) : rgb(0.07, 0.07, 0.07) }); } catch { /* */ }
          }
        });
        page.drawLine({ start: { x: x + colWidths[ci], y }, end: { x: x + colWidths[ci], y: y - rowH }, thickness: 0.3, color: rgb(0.68, 0.70, 0.82) });
        x += colWidths[ci];
      }
      page.drawLine({ start: { x: margin, y: y - rowH }, end: { x: margin + availW, y: y - rowH }, thickness: isHdr ? 0.6 : 0.3, color: rgb(0.68, 0.70, 0.82) });
      page.drawLine({ start: { x: margin, y }, end: { x: margin, y: y - rowH }, thickness: 0.3, color: rgb(0.68, 0.70, 0.82) });
      y -= rowH;
    }
  }
  return new Blob([await doc.save()], { type: 'application/pdf' });
}

async function pdfFromSlides(slides: string[], title?: string): Promise<Blob> {
  const doc  = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 792, H = 612;
  const MARGIN = 36;

  for (let i = 0; i < slides.length; i++) {
    const page = doc.addPage([W, H]);
    // Background
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(0.97, 0.97, 1.0) });
    // Header strip
    page.drawRectangle({ x: 0, y: H - 56, width: W, height: 56, color: rgb(0.10, 0.20, 0.60) });
    const heading = `${title ? title + '  ·  ' : ''}Slide ${i + 1} / ${slides.length}`;
    try { page.drawText(heading.slice(0, 80), { x: MARGIN, y: H - 38, size: 15, font: bold, color: rgb(1, 1, 1) }); } catch {}

    const text   = slides[i] || '(No text on this slide)';
    const lines  = text.split('\n').map(l => l.trim()).filter(Boolean);
    let y = H - 72;
    const bodyW = W - MARGIN * 2;

    for (const rawLine of lines) {
      if (y < MARGIN + 20) break;
      // Detect if it's a heading line (all caps, short, or starts with '•')
      const isTitle   = rawLine.length < 60 && rawLine === rawLine.toUpperCase() && rawLine.length > 3;
      const isBullet  = rawLine.startsWith('•') || rawLine.startsWith('-') || rawLine.startsWith('*');
      const sz        = isTitle ? 16 : 13;
      const drawFont  = isTitle ? bold : font;
      const color     = isTitle ? rgb(0.1, 0.2, 0.6) : rgb(0.1, 0.1, 0.1);
      const x0        = isBullet ? MARGIN + 14 : MARGIN;

      if (isBullet) {
        try { page.drawText('•', { x: MARGIN, y, size: sz, font, color: rgb(0.2, 0.4, 0.8) }); } catch {}
      }

      // Word-wrap
      const words2 = rawLine.replace(/^[•\-\*]\s*/, '').split(' ');
      let cur = '';
      for (const w of words2) {
        const test = cur ? `${cur} ${w}` : w;
        let tw = 0; try { tw = drawFont.widthOfTextAtSize(test, sz); } catch { tw = test.length * sz * 0.55; }
        if (tw > bodyW - (isBullet ? 14 : 0) && cur) {
          if (y >= MARGIN) { try { page.drawText(cur, { x: x0, y, size: sz, font: drawFont, color }); } catch {} }
          y -= sz * 1.45;
          cur = w;
          if (y < MARGIN) break;
        } else cur = test;
      }
      if (cur && y >= MARGIN) { try { page.drawText(cur, { x: x0, y, size: sz, font: drawFont, color }); } catch {} }
      y -= sz * 1.6;
    }

    // Slide number footer
    const footer = `${i + 1} / ${slides.length}`;
    try { page.drawText(footer, { x: W - 50, y: 14, size: 9, font, color: rgb(0.5, 0.5, 0.6) }); } catch {}
  }
  return new Blob([await doc.save()], { type: 'application/pdf' });
}

// ─── DOCX builders ──────────────────────────────────────────────────

// ─── Rich DOCX builder from structured DocxContent ───────────────────────────

function buildDocxFromStructured(elements: DocxElement[], title?: string): Document {
  const children: any[] = [];

  if (title) {
    children.push(new Paragraph({
      text: safeStr(title),
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
    }));
  }

  for (const el of elements) {
    if (el.type === 'paragraph') {
      const p = el as DocxParagraph;
      if (!p.text.trim() && p.runs.length === 0) {
        // Empty paragraph — add spacer
        children.push(new Paragraph({ spacing: { before: 80, after: 0 } }));
        continue;
      }

      const headingMap: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined> = {
        1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3,
        4: HeadingLevel.HEADING_4, 5: HeadingLevel.HEADING_5, 6: HeadingLevel.HEADING_6,
      };

      const alignMap: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
        left: AlignmentType.LEFT, center: AlignmentType.CENTER,
        right: AlignmentType.RIGHT, justify: AlignmentType.BOTH,
      };

      // Per-run TextRuns preserving bold/italic/font/size
      const runs = p.runs.length > 0
        ? p.runs.map(r => new TextRun({
            text: safeStr(r.text),
            bold: r.bold,
            italics: r.italic,
            underline: r.underline ? {} : undefined,
            size: r.fontSize,
            font: r.fontName || 'Calibri',
            color: r.color !== 'auto' ? r.color : undefined,
          }))
        : [new TextRun({ text: safeStr(p.text) })];

      children.push(new Paragraph({
        heading: p.heading ? headingMap[p.heading] : undefined,
        alignment: alignMap[p.alignment] ?? AlignmentType.LEFT,
        indent: p.indentLeft > 0 ? { left: p.indentLeft } : undefined,
        spacing: {
          before: p.spaceBefore || 0,
          after: p.spaceAfter || 0,
          line: 276,
          lineRule: 'auto' as any,
        },
        children: runs,
      }));

    } else if (el.type === 'table') {
      const t = el as DTable;
      const docxRows = t.rows.map((row: DRow, ri: number) => {
        const maxCols = Math.max(...t.rows.map((r: DRow) => r.cells.length));
        return new TableRow({
          tableHeader: row.isHeader,
          children: row.cells.map(cell => {
            const cellText = safeStr(cell.text);
            const isHeader = row.isHeader;
            // Per-run content for cell
            const cellRuns = cell.paragraphs.flatMap(cp =>
              cp.runs.length > 0
                ? cp.runs.map(r => new TextRun({
                    text: safeStr(r.text),
                    bold: isHeader || r.bold,
                    italics: r.italic,
                    size: r.fontSize || 22,
                    font: r.fontName || 'Calibri',
                    color: isHeader ? 'FFFFFF' : (r.color !== 'auto' ? r.color : undefined),
                  }))
                : [new TextRun({ text: safeStr(cp.text), bold: isHeader, color: isHeader ? 'FFFFFF' : undefined })]
            );
            return new TableCell({
              columnSpan: cell.colspan > 1 ? cell.colspan : undefined,
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              shading: isHeader ? { fill: '1a3a8f' } : (cell.shading ? { fill: cell.shading } : undefined),
              children: [
                new Paragraph({
                  children: cellRuns.length > 0 ? cellRuns : [new TextRun({ text: cellText, bold: isHeader })],
                })
              ],
            });
          }),
        });
      });

      if (docxRows.length > 0) {
        children.push(new DocxTable({
          rows: docxRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: t.hasBorder ? {
            top:    { style: BorderStyle.SINGLE, size: 4, color: '2563EB' },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: '2563EB' },
            left:   { style: BorderStyle.SINGLE, size: 4, color: '2563EB' },
            right:  { style: BorderStyle.SINGLE, size: 4, color: '2563EB' },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: '93C5FD' },
            insideVertical:   { style: BorderStyle.SINGLE, size: 2, color: '93C5FD' },
          } : {
            top:    { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
            bottom: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
            left:   { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
            right:  { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
            insideVertical:   { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
          },
        }));
        children.push(new Paragraph({ spacing: { before: 100, after: 0 } }));
      }
    }
  }

  if (children.length === 0) children.push(new Paragraph({ children: [new TextRun('')] }));

  return new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 24 } },
      },
    },

    sections: [{
      properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
      children,
    }],
  });
}

async function docxFromParagraphs(paragraphs: string[], title?: string): Promise<Blob> {
  const children: any[] = [];
  const safeTitle = safeStr(title || '');
  if (safeTitle) children.push(new Paragraph({ text: safeTitle, heading: HeadingLevel.HEADING_1 }));
  for (const p of paragraphs) {
    children.push(new Paragraph({ children: [new TextRun(safeStr(p))] }));
  }
  if (children.length === 0) children.push(new Paragraph({ children: [new TextRun('')] }));
  const d = new Document({

    sections: [{ properties: {}, children }]
  });
  return Packer.toBlob(d);
}

async function docxFromXlsxSheets(sheets: XlsxSheet[]): Promise<Blob> {
  const children: any[] = [];
  for (const { name, rows } of sheets) {
    if (!rows.length) continue;
    const maxCols = Math.max(...rows.map((r: any[]) => r.length));
    if (!maxCols) continue;
    const safeName = safeStr(name);
    children.push(new Paragraph({ text: `Sheet: ${safeName}`, heading: HeadingLevel.HEADING_2 }));

    const tableRows = rows.slice(0, 500).map((row: any[], ri: number) =>
      new TableRow({
        tableHeader: ri === 0,
        children: Array.from({ length: maxCols }, (_, ci) => {
          const cellText = safeStr(String(row[ci] ?? ''));
          const isHeader = ri === 0;
          return new TableCell({
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            shading: isHeader ? { fill: '1a3a8f' } : (ri % 2 === 0 ? { fill: 'EFF6FF' } : undefined),
            children: [new Paragraph({
              children: [new TextRun({
                text: cellText,
                bold: isHeader,
                size: isHeader ? 20 : 18,
                color: isHeader ? 'FFFFFF' : undefined,
              })],
            })],
          });
        }),
      })
    );

    children.push(new DocxTable({
      rows: tableRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top:    { style: BorderStyle.SINGLE, size: 4, color: '2563EB' },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: '2563EB' },
        left:   { style: BorderStyle.SINGLE, size: 4, color: '2563EB' },
        right:  { style: BorderStyle.SINGLE, size: 4, color: '2563EB' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: '93C5FD' },
        insideVertical:   { style: BorderStyle.SINGLE, size: 2, color: '93C5FD' },
      },
    }));
    children.push(new Paragraph({ spacing: { before: 200, after: 0 } }));
  }
  if (children.length === 0) children.push(new Paragraph({ children: [new TextRun('')] }));
  const d = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },

    sections: [{ properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children }]
  });
  return Packer.toBlob(d);
}

async function docxFromSlides(slides: PptxSlide[], title?: string): Promise<Blob> {
  const children: any[] = [];
  const safeTitle = safeStr(title || '');
  if (safeTitle) children.push(new Paragraph({ text: safeTitle, heading: HeadingLevel.HEADING_1, spacing: { after: 200 } }));

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    // Slide title as H2
    const slideTitle = slide.title || `Slide ${i + 1}`;
    children.push(new Paragraph({ text: safeStr(slideTitle), heading: HeadingLevel.HEADING_2 }));

    // Body text
    if (slide.body) {
      children.push(new Paragraph({ children: [new TextRun({ text: safeStr(slide.body) })] }));
    }

    // Tables from this slide
    if (slide.tableRows.length > 0) {
      const maxCols = Math.max(...slide.tableRows.map(r => r.length));
      const tableDocxRows = slide.tableRows.map((row, ri) =>
        new TableRow({
          tableHeader: ri === 0,
          children: Array.from({ length: maxCols }, (_, ci) => {
            const isHdr = ri === 0;
            return new TableCell({
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              shading: isHdr ? { fill: '1a3a8f' } : undefined,
              children: [new Paragraph({
                children: [new TextRun({ text: safeStr(row[ci] ?? ''), bold: isHdr, color: isHdr ? 'FFFFFF' : undefined })],
              })],
            });
          }),
        })
      );
      children.push(new DocxTable({
        rows: tableDocxRows,
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 4, color: '2563EB' },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: '2563EB' },
          left: { style: BorderStyle.SINGLE, size: 4, color: '2563EB' },
          right: { style: BorderStyle.SINGLE, size: 4, color: '2563EB' },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: '93C5FD' },
          insideVertical: { style: BorderStyle.SINGLE, size: 2, color: '93C5FD' },
        },
      }));
    }
    children.push(new Paragraph({ spacing: { before: 200, after: 0 } }));
  }

  if (children.length === 0) children.push(new Paragraph({ children: [new TextRun('')] }));
  const d = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 24 } } } },

    sections: [{ properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children }]
  });
  return Packer.toBlob(d);
}

// ─── XLSX builders ──────────────────────────────────────────────────

function xlsxFromParagraphs(paragraphs: string[], sheetName = 'Content'): Blob {
  // Group paragraphs under headings into structured rows
  const aoa: string[][] = [];
  for (const p of paragraphs) {
    const safe = safeStr(p);
    if (!safe) continue;
    // Detect if line looks like a table row (tab-separated or multiple |)
    if (safe.includes('\t') || safe.split('|').length > 2) {
      const cols = safe.includes('\t')
        ? safe.split('\t').map(s => s.trim())
        : safe.split('|').map(s => s.trim()).filter(Boolean);
      aoa.push(cols);
    } else {
      aoa.push([safe]);
    }
  }
  if (!aoa.length) aoa.push(['No content']);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const colWidths = aoa.reduce<number[]>((acc, row) => {
    row.forEach((c, ci) => { acc[ci] = Math.max(acc[ci] ?? 8, c.length + 2); });
    return acc;
  }, []);
  ws['!cols'] = colWidths.map(w => ({ wch: Math.min(w, 60) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, safeStr(sheetName).slice(0, 31) || 'Content');
  const arr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function xlsxFromSlides(slides: PptxSlide[]): Blob {
  const wb = XLSX.utils.book_new();

  slides.forEach((slide, i) => {
    // If slide has a table, output the table as a sheet
    if (slide.tableRows.length > 0) {
      const ws = XLSX.utils.aoa_to_sheet(slide.tableRows.map(r => r.map(safeStr)));
      const sheetName = safeStr(slide.title || `Slide ${i + 1}`).slice(0, 31) || `Slide${i + 1}`;
      try { XLSX.utils.book_append_sheet(wb, ws, sheetName); } catch { /* duplicate name */ }
    }
  });

  // Fallback: summary sheet
  if (!wb.SheetNames.length) {
    const aoa: string[][] = [['Slide', 'Title', 'Content']];
    slides.forEach((s, i) => aoa.push([String(i + 1), safeStr(s.title), safeStr(s.body)]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, 'Slides');
  }

  const arr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ─── PPTX builders ──────────────────────────────────────────────────

async function pptxFromParagraphs(paragraphs: string[], title?: string): Promise<Blob> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';

  // Split paragraphs on heading-like lines (short all-caps or ends with ':') to create separate slides
  const slideGroups: { heading: string; lines: string[] }[] = [];
  let currentGroup: { heading: string; lines: string[] } = { heading: safeStr(title || 'Document'), lines: [] };

  for (const p of paragraphs) {
    const safe = safeStr(p);
    if (!safe) continue;
    // Detect heading: short line ≤60 chars, either all-caps or ends with colon
    const isHeading = safe.length <= 60 && (safe === safe.toUpperCase() || safe.endsWith(':'));
    if (isHeading && currentGroup.lines.length > 0) {
      slideGroups.push(currentGroup);
      currentGroup = { heading: safe, lines: [] };
    } else if (isHeading) {
      currentGroup.heading = safe;
    } else {
      currentGroup.lines.push(safe);
    }
  }
  slideGroups.push(currentGroup);

  // Max 10 lines per slide; overflow creates continuation slides
  for (const group of slideGroups) {
    const lines = group.lines;
    const chunks = lines.length === 0 ? [[]] : [];
    for (let i = 0; i < Math.max(lines.length, 1); i += 10) {
      chunks.push(lines.slice(i, i + 10));
    }
    for (let ci = 0; ci < chunks.length; ci++) {
      const slide = pptx.addSlide();
      // Header bar
      slide.addShape('rect' as any, { x: 0, y: 0, w: '100%', h: 0.7, fill: { color: '1a3a8f' } });
      const headingText = chunks.length > 1 ? `${group.heading} (${ci + 1}/${chunks.length})` : group.heading;
      slide.addText(headingText, { x: 0.3, y: 0.1, w: 12, h: 0.5, bold: true, fontSize: 18, color: 'FFFFFF' });
      if (chunks[ci].length > 0) {
        slide.addText(chunks[ci].join('\n'), { x: 0.3, y: 0.85, w: 12, h: 5.5, fontSize: 13, color: '1e293b', valign: 'top' });
      }
    }
  }

  return pptx.write({ outputType: 'blob' }) as Promise<Blob>;
}

async function pptxFromXlsxSheets(sheets: XlsxSheet[]): Promise<Blob> {
  const sanitize = (s: string) => String(s || '').replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  for (const { name, rows } of sheets) {
    if (!rows.length) continue;
    const maxCols = Math.max(...rows.map(r => r.length));
    const displayRows = rows.slice(0, 25);
    const slide = pptx.addSlide();
    slide.addText(`Sheet: ${sanitize(name)}`, { x: 0.3, y: 0.1, w: 12, h: 0.45, fontSize: 18, bold: true, color: '1a3a8f' });
    const tableData = displayRows.map((row, ri) =>
      Array.from({ length: maxCols }, (_, ci) => ({
        text: sanitize(String(row[ci] ?? '')),
        options: {
          fill: { color: ri === 0 ? '1f4e9c' : ri % 2 === 0 ? 'eff4ff' : 'ffffff' },
          color: ri === 0 ? 'ffffff' : '111111',
          bold: ri === 0,
          fontSize: 9,
        },
      }))
    );
    const colW = Math.min(2.2, 12 / maxCols);
    slide.addTable(tableData, {
      x: 0.3, y: 0.65, w: 12,
      colW: Array(maxCols).fill(colW),
      border: { type: 'solid', color: 'cccccc', pt: 0.5 },
    });
  }
  return pptx.write({ outputType: 'blob' }) as Promise<Blob>;
}

async function pptxFromSlides(slides: PptxSlide[], title?: string): Promise<Blob> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  slides.forEach((slide, i) => {
    const s = pptx.addSlide();
    // Header bar
    s.addShape('rect' as any, { x: 0, y: 0, w: '100%', h: 0.7, fill: { color: '1a3a8f' } });
    const headingText = slide.title || `Slide ${i + 1}`;
    s.addText(safeStr(headingText), { x: 0.3, y: 0.1, w: 12, h: 0.5, bold: true, fontSize: 18, color: 'FFFFFF' });

    let nextY = 0.85;
    if (slide.body) {
      s.addText(safeStr(slide.body), { x: 0.3, y: nextY, w: 12, h: slide.tableRows.length > 0 ? 2.2 : 5.5, fontSize: 13, color: '1e293b', valign: 'top' });
      nextY = slide.tableRows.length > 0 ? 3.2 : nextY;
    }

    // Render table if present
    if (slide.tableRows.length > 0) {
      const maxCols = Math.max(...slide.tableRows.map(r => r.length));
      const tableData = slide.tableRows.map((row, ri) =>
        Array.from({ length: maxCols }, (_, ci) => ({
          text: safeStr(row[ci] ?? ''),
          options: {
            fill: { color: ri === 0 ? '1f4e9c' : ri % 2 === 0 ? 'eff4ff' : 'ffffff' },
            color: ri === 0 ? 'ffffff' : '111111',
            bold: ri === 0,
            fontSize: 10,
          },
        }))
      );
      const colW = Math.min(2.0, 12 / maxCols);
      s.addTable(tableData, {
        x: 0.3, y: nextY, w: 12,
        colW: Array(maxCols).fill(colW),
        border: { type: 'solid', color: '93c5fd', pt: 0.5 },
      });
    }
  });
  return pptx.write({ outputType: 'blob' }) as Promise<Blob>;
}

// ─── Text builders ──────────────────────────────────────────────────

function txtFromParagraphs(paragraphs: string[]): Blob {
  return new Blob([paragraphs.join('\n\n')], { type: 'text/plain;charset=utf-8' });
}

function txtFromXlsxSheets(sheets: XlsxSheet[]): Blob {
  const lines: string[] = [];
  for (const { name, rows } of sheets) {
    lines.push(`=== Sheet: ${name} ===`);
    for (const row of rows) lines.push(row.map(c => String(c ?? '')).join('\t'));
    lines.push('');
  }
  return new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
}

function csvFromXlsxSheets(sheets: XlsxSheet[]): Blob {
  const firstSheet = sheets[0];
  if (!firstSheet) return new Blob([''], { type: 'text/csv;charset=utf-8' });
  const csv = firstSheet.rows
    .map(row => row.map(c => {
      const s = String(c ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\n');
  return new Blob([csv], { type: 'text/csv;charset=utf-8' });
}

function txtFromSlides(slides: PptxSlide[]): Blob {
  const parts = slides.map((s, i) => {
    const parts = [`--- Slide ${i + 1}${s.title ? ': ' + s.title : ''} ---`];
    if (s.body) parts.push(s.body);
    if (s.tableRows.length > 0) parts.push(s.tableRows.map(r => r.join('\t')).join('\n'));
    return parts.join('\n');
  });
  return new Blob([parts.join('\n\n')], { type: 'text/plain;charset=utf-8' });
}

// ─── Existing PDF converters (unchanged) ────────────────────────────

async function convertImageFile(f: File, outType: Target, quality: number): Promise<Blob> {
  const tempUrl = URL.createObjectURL(f);
  let img: HTMLImageElement;
  try {
    img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const m = new Image();
      m.onload  = () => resolve(m);
      m.onerror = () => reject(new Error('Could not load image — file may be corrupted.'));
      m.src = tempUrl;
    });
  } finally {
    URL.revokeObjectURL(tempUrl);
  }

  if (!img.width || !img.height) throw new Error('Image has zero dimensions.');

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available in this browser.');
  ctx.drawImage(img, 0, 0);

  if (outType === 'pdf') {
    const pdf = await PDFDocument.create();
    const jpgBytes = await fetch(canvas.toDataURL('image/jpeg', quality)).then(r => r.arrayBuffer());
    const emb = await pdf.embedJpg(jpgBytes);
    const p = pdf.addPage([emb.width, emb.height]);
    p.drawImage(emb, { x: 0, y: 0, width: emb.width, height: emb.height });
    return new Blob([await pdf.save()], { type: 'application/pdf' });
  }
  const mime = outType === 'png' ? 'image/png' : outType === 'webp' ? 'image/webp' : 'image/jpeg';
  const out = await new Promise<Blob | null>(res => canvas.toBlob(res, mime, quality));
  if (!out) throw new Error('Image conversion failed.');
  return out;
}

async function convertPdfFile(f: File, outType: Target, quality: number): Promise<Blob> {
  const arrayBuffer = await f.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

  // Helper: render a page to base64 for AI
  const pageToBase64 = async (pageNum: number): Promise<string> => {
    const page = await pdf.getPage(pageNum);
    const vp = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
    const b64 = canvas.toDataURL('image/jpeg', 0.85);
    canvas.width = 0; canvas.height = 0;
    return b64;
  };

  if (outType === 'txt') {
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let pageText = content.items.map((x: any) => x.str).join(' ');

      // AI Polishing
      try {
        if (import.meta.env.VITE_GEMINI_API_KEY && pageText.trim().length > 10) {
          const { enhanceTextWithAI } = await import('../lib/advancedVisionEngine');
          const paras = await enhanceTextWithAI(pageText);
          pageText = paras.join('\n\n');
        }
      } catch { /* fallback */ }

      text += `\n\n--- Page ${i} ---\n` + pageText;
    }
    return new Blob([text], { type: 'text/plain;charset=utf-8' });
  }

  if (outType === 'docx' || outType === 'xlsx' || outType === 'pptx') {
    // Attempt Universal Layout Engine for DOCX
    try {
      if (outType === 'docx' && import.meta.env.VITE_GEMINI_API_KEY) {
        const pagesData: { layout: any, canvas: HTMLCanvasElement }[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width; canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          const base64Image = canvas.toDataURL('image/jpeg', 0.85);
          
          const { extractUniversalLayout } = await import('../lib/advancedVisionEngine');
          const layout = await extractUniversalLayout(base64Image);
          pagesData.push({ layout, canvas });
        }
        const { buildUniversalDocx } = await import('../lib/universalDocxBuilder');
        const doc = await buildUniversalDocx(pagesData);
        return await Packer.toBlob(doc);
      }
    } catch (aiError) {
      console.warn("Universal Layout Engine failed in UniversalConverter, falling back", aiError);
    }

    const pageTexts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let pageText = content.items.map((x: any) => x.str).join(' ');

      // AI Polishing
      try {
        if (import.meta.env.VITE_GEMINI_API_KEY && pageText.trim().length > 10) {
          const { enhanceTextWithAI } = await import('../lib/advancedVisionEngine');
          const paras = await enhanceTextWithAI(pageText);
          pageText = paras.join('\n\n');
        }
      } catch { /* fallback */ }

      pageTexts.push(pageText);
    }

    if (outType === 'docx') {
      const children = pageTexts.map(t => {
        const safe = (t || '').replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '');
        return new Paragraph({ children: [new TextRun(safe)] });
      });
      if (children.length === 0) children.push(new Paragraph({ children: [new TextRun('')] }));
      const d = new Document({
    
        sections: [{ properties: {}, children }]
      });
      return Packer.toBlob(d);
    }
    if (outType === 'xlsx') {
      // Silent AI table attempt on page 1
      let tableRows: string[][] | null = null;
      try {
        if (import.meta.env.VITE_GEMINI_API_KEY) {
          const base64 = await pageToBase64(1);
          const rows = await extractTableData(base64);
          if (rows && rows.length > 1) tableRows = rows;
        }
      } catch { /* fallback */ }

      if (tableRows) {
        const ws = XLSX.utils.aoa_to_sheet(tableRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'PDF Data');
        const arr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        return new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      }
      const rows = pageTexts.map((text, idx) => ({ Page: idx + 1, Text: text }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'PDF Text');
      const arr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      return new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_STANDARD';
    pageTexts.forEach((text, idx) => {
      const slide = pptx.addSlide();
      slide.addText(`Page ${idx + 1}`, { x: 0.5, y: 0.2, w: 9, h: 0.5, bold: true, fontSize: 20 });
      slide.addText(text || '(No text)', { x: 0.5, y: 0.9, w: 9, h: 5.8, fontSize: 14 });
    });
    return pptx.write({ outputType: 'blob' }) as Promise<Blob>;
  }

  // PDF → images (ZIP)
  const imageMime = outType === 'png' ? 'image/png' : 'image/jpeg';
  const imageExt  = outType === 'png' ? 'png' : outType === 'jpeg' ? 'jpeg' : 'jpg';
  const zip = new JSZip();
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const binary = await fetch(canvas.toDataURL(imageMime, quality)).then(r => r.arrayBuffer());
    zip.file(`page_${i}.${imageExt}`, binary);
  }
  return zip.generateAsync({ type: 'blob' });
}

async function convertTextFile(f: File): Promise<Blob> {
  const text = await f.text();
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const lines = text.split(/\r?\n/);
  let page = pdf.addPage([595, 842]);
  let y = 800;
  for (const line of lines) {
    if (y < 40) { y = 800; page = pdf.addPage([595, 842]); }
    page.drawText(line.slice(0, 120), { x: 36, y, size: 11, font });
    y -= 14;
  }
  return new Blob([await pdf.save()], { type: 'application/pdf' });
}

// ─── AI text extractor for non-PDF files ─────────────────────────────────────
// Converts the file to an image blob (using pdf.js or a canvas/img), then calls AI
async function aiExtractFromImage(imageBlob: Blob): Promise<string[]> {
  if (!import.meta.env.VITE_GEMINI_API_KEY) return [];
  const { extractTextRegions } = await import('../lib/advancedVisionEngine');
  const base64 = await new Promise<string>((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result as string);
    reader.onerror = rej;
    reader.readAsDataURL(imageBlob);
  });
  const blocks = await extractTextRegions(base64);
  if (!blocks || blocks.length === 0) return [];
  return blocks.map((b: any) => b.text).filter(Boolean);
}

// ─── Main component ──────────────────────────────────────────────────

const KIND_ICONS: Record<Kind, any> = {
  pdf: FileText,
  image: FileCog,
  text: FileText,
  docx: FileText,
  xlsx: BarChart2,
  pptx: Layers,
  unknown: FileCog,
};

// Per-file-type safety caps so a giant upload doesn't crash the browser tab.
const MAX_SIZE_BYTES: Record<Kind, number> = {
  pdf:     200 * 1024 * 1024,   // 200 MB
  image:   100 * 1024 * 1024,   // 100 MB
  text:     50 * 1024 * 1024,   //  50 MB
  docx:    100 * 1024 * 1024,
  xlsx:    100 * 1024 * 1024,
  pptx:    150 * 1024 * 1024,
  unknown:  50 * 1024 * 1024,
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function UniversalConverter() {
  const [file, setFile]           = useState<File | null>(null);
  const [target, setTarget]       = useState<Target>('pdf');
  const [quality, setQuality]     = useState(0.9);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultExt, setResultExt] = useState('');
  const [error, setError]         = useState<string | null>(null);
  const [progress, setProgress]   = useState('');

  // Track current job so stale results from a cancelled job can't race ahead.
  const jobIdRef    = useRef(0);
  const mountedRef  = useRef(true);
  const lastUrlRef  = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Final cleanup: revoke any unreleased blob URL.
      if (lastUrlRef.current) {
        try { URL.revokeObjectURL(lastUrlRef.current); } catch { /* */ }
        lastUrlRef.current = null;
      }
    };
  }, []);

  // Helper that always revokes the previous URL before storing a new one.
  const setResultUrlSafe = (next: string | null) => {
    if (lastUrlRef.current && lastUrlRef.current !== next) {
      try { URL.revokeObjectURL(lastUrlRef.current); } catch { /* */ }
    }
    lastUrlRef.current = next;
    setResultUrl(next);
  };

  const kind = file ? detectKind(file) : 'unknown';
  const targets = useMemo(() => TARGETS_FOR_KIND[kind] ?? [], [kind]);
  const KindIcon = KIND_ICONS[kind] ?? FileCog;

  const handleDrop = (accepted: File[]) => {
    if (!accepted.length) return;
    const f = accepted[0];
    const k = detectKind(f);
    const cap = MAX_SIZE_BYTES[k];
    if (f.size > cap) {
      setError(`File is ${formatBytes(f.size)} — please keep ${KIND_LABELS[k]} files under ${formatBytes(cap)}.`);
      setFile(null);
      return;
    }
    setFile(f);
    setResultUrlSafe(null);
    setError(null);
    setProgress('');
    const available = TARGETS_FOR_KIND[k];
    if (available?.length) setTarget(available[0]);
  };

  const handleConvert = async () => {
    if (!file) return;
    if (!targets.includes(target)) {
      setError('This conversion is not supported for the selected file type.');
      return;
    }
    const myJobId = ++jobIdRef.current;
    setIsProcessing(true);
    setError(null);
    setProgress('Preparing…');

    // ── Backend helper — tries server API, returns null on failure ──
    const tryBackend = async (endpoint: string, extraFields?: Record<string, string>): Promise<Blob | null> => {
      try {
        const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const form = new FormData();
        form.append('file', file);
        if (extraFields) {
          for (const [k, v] of Object.entries(extraFields)) form.append(k, v);
        }
        const res = await fetch(`${API_BASE}${endpoint}`, { method: 'POST', body: form });
        if (!res.ok) return null;
        return await res.blob();
      } catch {
        return null;
      }
    };

    try {
      let blob: Blob;
      const name = baseName(file.name);

      if (kind === 'image') {
        setProgress('Converting image…');
        blob = await convertImageFile(file, target, quality);

      } else if (kind === 'pdf') {

        // ── PDF → docx: try Backend first (best layout), fallback to browser ──
        if (target === 'docx') {
          setProgress('Converting PDF to Word (server-side for best quality)…');
          const backendBlob = await tryBackend('/convert/pdf-to-word');
          if (backendBlob) {
            blob = backendBlob;
          } else {
            setProgress('Server unavailable, converting in browser…');
            blob = await convertPdfFile(file, target, quality);
          }

        // ── PDF → xlsx: try Backend first (Camelot tables), fallback to browser ──
        } else if (target === 'xlsx') {
          setProgress('Extracting tables from PDF (server-side)…');
          const backendBlob = await tryBackend('/convert/pdf-to-excel');
          if (backendBlob) {
            blob = backendBlob;
          } else {
            setProgress('Server unavailable, extracting in browser…');
            blob = await convertPdfFile(file, target, quality);
          }

        // ── PDF → pptx: try Backend first (page images + text), fallback to browser ──
        } else if (target === 'pptx') {
          setProgress('Converting PDF to PowerPoint (server-side)…');
          const backendBlob = await tryBackend('/convert/pdf-to-ppt', { dpi: '120' });
          if (backendBlob) {
            blob = backendBlob;
          } else {
            setProgress('Server unavailable, converting in browser…');
            blob = await convertPdfFile(file, target, quality);
          }

        // ── All other PDF conversions (txt, png, jpg, zip) stay browser-side ──
        } else {
          setProgress('Reading PDF…');
          blob = await convertPdfFile(file, target, quality);
        }

      } else if (kind === 'text') {
        setProgress('Converting text…');
        blob = await convertTextFile(file);

      } else if (kind === 'docx') {
        // ── DOCX → PDF: Backend (LibreOffice) gives pixel-perfect output ──
        if (target === 'pdf') {
          setProgress('Converting Word to PDF (server-side for best quality)…');
          const backendBlob = await tryBackend('/convert/office-to-pdf');
          if (backendBlob) {
            blob = backendBlob;
          } else {
            setProgress('Server unavailable � converting Word document in browser�');
            const docxContent = await extractDocxContent(file);
            blob = await pdfFromDocxContent(docxContent.elements);
          } // end else (backendBlob not available)
        } else {
          setProgress('Extracting Word content (tables, headings, formatting)…');
          const docxContent = await extractDocxContent(file);
          setProgress('Building output…');

          if (target === 'xlsx') {
            const wb = XLSX.utils.book_new();
            let tableIdx = 0;
            for (const el of docxContent.elements) {
              if (el.type === 'table') {
                const t = el as DTable;
                const aoa = t.rows.map((r: DRow) => r.cells.map(c => safeStr(c.text)));
                const ws = XLSX.utils.aoa_to_sheet(aoa);
                const colW = aoa.reduce<number[]>((acc, row) => {
                  row.forEach((c: string, ci: number) => { acc[ci] = Math.max(acc[ci] ?? 8, c.length + 2); });
                  return acc;
                }, []);
                ws['!cols'] = colW.map(w => ({ wch: Math.min(w, 50) }));
                const sheetName = `Table ${++tableIdx}`.slice(0, 31);
                XLSX.utils.book_append_sheet(wb, ws, sheetName);
              }
            }
            if (docxContent.flatText.length > 0) {
              const textAoa = docxContent.flatText.map(t => [safeStr(t)]);
              const ws = XLSX.utils.aoa_to_sheet(textAoa);
              try { XLSX.utils.book_append_sheet(wb, ws, 'Content'); } catch { /* */ }
            }
            if (!wb.SheetNames.length) {
              XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No content']]), 'Sheet1');
            }
            const arr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
            blob = new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          } else if (target === 'pptx') {
            // ── DOCX → PPT: Backend ──
            setProgress('Converting Word to PowerPoint (server-side)…');
            const backendBlob = await tryBackend('/convert/word-to-ppt');
            if (backendBlob) {
              blob = backendBlob;
            } else {
              setProgress('Server unavailable, converting in browser…');
              blob = await pptxFromParagraphs(docxContent.flatText, name);
            }
          } else {
            const doc2 = buildDocxFromStructured(docxContent.elements, name);
            if (target === 'docx') blob = await Packer.toBlob(doc2);
            else blob = txtFromParagraphs(docxContent.flatText);
          }
        }

      } else if (kind === 'xlsx') {
        // ── XLSX → PDF: Backend (LibreOffice) for accurate table rendering ──
        if (target === 'pdf') {
          setProgress('Converting Excel to PDF (server-side)…');
          const backendBlob = await tryBackend('/convert/office-to-pdf');
          if (backendBlob) {
            blob = backendBlob;
          } else {
            setProgress('Server unavailable, converting in browser…');
            blob = await xlsxFileToPdf(file);
          }
        } else if (target === 'docx') {
          // ── XLSX → Word: Backend ──
          setProgress('Converting Excel to Word (server-side)…');
          const backendBlob = await tryBackend('/convert/excel-to-word');
          if (backendBlob) {
            blob = backendBlob;
          } else {
            setProgress('Server unavailable, converting in browser…');
            const sheets = await extractXlsxSheets(file);
            blob = await docxFromXlsxSheets(sheets);
          }
        } else if (target === 'pptx') {
          // ── XLSX → PPT: Backend ──
          setProgress('Converting Excel to PowerPoint (server-side)…');
          const backendBlob = await tryBackend('/convert/excel-to-ppt');
          if (backendBlob) {
            blob = backendBlob;
          } else {
            setProgress('Server unavailable, converting in browser…');
            const sheets = await extractXlsxSheets(file);
            blob = await pptxFromXlsxSheets(sheets);
          }
        } else {
          setProgress('Reading Excel sheets…');
          const sheets = await extractXlsxSheets(file);
          setProgress('Building output…');
          if (target === 'csv') blob = csvFromXlsxSheets(sheets);
          else blob = txtFromXlsxSheets(sheets);
        }

      } else if (kind === 'pptx') {
        // ── PPTX → PDF: Backend (LibreOffice) for accurate rendering ──
        if (target === 'pdf') {
          setProgress('Converting PowerPoint to PDF (server-side)…');
          const backendBlob = await tryBackend('/convert/office-to-pdf');
          if (backendBlob) {
            blob = backendBlob;
          } else {
            setProgress('Server unavailable, converting in browser…');
            const slides = await extractPptxSlides(file);
            const flatSlides = slides.map(s => [s.title, s.body].filter(Boolean).join('\n'));
            blob = await pdfFromSlides(flatSlides, name);
          }
        } else if (target === 'docx') {
          // ── PPTX → Word: Backend ──
          setProgress('Converting PowerPoint to Word (server-side)…');
          const backendBlob = await tryBackend('/convert/ppt-to-word');
          if (backendBlob) {
            blob = backendBlob;
          } else {
            setProgress('Server unavailable, converting in browser…');
            const slides = await extractPptxSlides(file);
            blob = await docxFromSlides(slides, name);
          }
        } else if (target === 'xlsx') {
          // ── PPTX → Excel: Backend ──
          setProgress('Converting PowerPoint to Excel (server-side)…');
          const backendBlob = await tryBackend('/convert/ppt-to-excel');
          if (backendBlob) {
            blob = backendBlob;
          } else {
            setProgress('Server unavailable, converting in browser…');
            const slides = await extractPptxSlides(file);
            blob = xlsxFromSlides(slides);
          }
        } else {
          setProgress('Extracting slides (titles, body, tables)…');
          const slides = await extractPptxSlides(file);
          setProgress('Building output…');
          blob = txtFromSlides(slides);
        }

      } else {
        throw new Error('Unsupported file type for conversion.');
      }

      // Discard result if a newer job was started or the component unmounted.
      if (!mountedRef.current || jobIdRef.current !== myJobId) return;

      const url = URL.createObjectURL(blob!);
      setResultUrlSafe(url);

      // For PDF→image the output is always a ZIP
      const ext = (kind === 'pdf' && (target === 'png' || target === 'jpg' || target === 'jpeg'))
        ? '.zip'
        : extensionFor(target);
      setResultExt(ext);

    } catch (e: any) {
      if (!mountedRef.current || jobIdRef.current !== myJobId) return;
      console.error('[UniversalConverter]', e);
      setError(e?.message ?? 'Conversion failed. Please check the file and try again.');
    } finally {
      if (!mountedRef.current || jobIdRef.current !== myJobId) return;
      setIsProcessing(false);
      setProgress('');
    }
  };

  return (

    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-10">
      {/* Header */}
      <div className="text-center mb-8 max-w-2xl">
        <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-full text-xs font-bold uppercase tracking-wider">
          <RefreshCw className="w-3.5 h-3.5" />
          Universal Converter
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white mb-3">
          Convert Any Document
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          PDF, Word, Excel, PowerPoint, Images, Text — convert to any format. Everything runs in your browser, files never leave your device.
        </p>
      </div>

      {/* Supported format badges */}
      <div className="flex flex-wrap justify-center gap-2 mb-8">
        {(['PDF', 'Word', 'Excel', 'PowerPoint', 'Image', 'Text'] as const).map(f => (
          <span key={f} className="px-3 py-1 text-xs font-semibold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {f}
          </span>
        ))}
      </div>

      {!file ? (
        <div className="w-full max-w-2xl">
          <FileDropzone
            onDrop={handleDrop}
            multiple={false}
            title="Drop any document here"
            subtitle="PDF · Word (.docx) · Excel (.xlsx) · PowerPoint (.pptx) · Images · Text"
            accept={{
              'application/pdf': ['.pdf'],
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
              'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
              'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'],
              'text/plain': ['.txt'],
            }}
          />
          {/* Format conversion grid */}
          <div className="mt-8 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            {[
              ['Word → PDF, Excel, PPT', 'text-blue-600'],
              ['Excel → PDF, Word, PPT', 'text-emerald-600'],
              ['PPT → PDF, Word, Excel', 'text-orange-600'],
              ['PDF → Word, Excel, PPT', 'text-indigo-600'],
              ['Image → PDF, PNG, JPG', 'text-pink-600'],
              ['PDF → Images (ZIP)', 'text-violet-600'],
            ].map(([label, color]) => (
              <div key={label as string} className="flex items-center gap-2 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${color}`} />
                <span className="text-slate-700 dark:text-slate-300 text-xs font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-8">

          {/* File info */}
          <div className="flex items-center gap-4 p-5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 mb-6">
            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center shrink-0">
              <KindIcon className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-slate-900 dark:text-white truncate">{file.name}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {KIND_LABELS[kind]} · {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
          </div>

          {!resultUrl ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Convert to
                  </label>
                  <select
                    value={target}
                    onChange={e => setTarget(e.target.value as Target)}
                    className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-300 outline-none"
                  >
                    {targets.map(t => (
                      <option key={t} value={t}>{TARGET_LABELS[t]}</option>
                    ))}
                  </select>
                </div>

                {(kind === 'image' || (kind === 'pdf' && ['png','jpg','jpeg'].includes(target))) && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Quality — {Math.round(quality * 100)}%
                    </label>
                    <input
                      type="range" min={0.4} max={1} step={0.05}
                      value={quality}
                      onChange={e => setQuality(Number(e.target.value))}
                      className="w-full mt-2"
                    />
                  </div>
                )}
              </div>

              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">{error}</div>
              )}

              {progress && (
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl text-indigo-700 dark:text-indigo-400 text-sm flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {progress}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleConvert}
                  disabled={isProcessing || !targets.length}
                  className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white text-base font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? 'Converting…' : `Convert to ${TARGET_LABELS[target] ?? target.toUpperCase()}`}
                </button>
                <button
                  onClick={() => { setFile(null); setError(null); setResultUrlSafe(null); }}
                  className="px-5 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5 text-center">
              <div className="p-8 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800">
                <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Download className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold text-emerald-800 dark:text-emerald-300 mb-4">Conversion complete!</h3>
                <a
                  href={resultUrl}
                  download={`${baseName(file.name)}${resultExt}`}
                  className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-base font-bold rounded-xl transition-colors shadow-md"
                >
                  <Download className="w-5 h-5" />
                  Download {resultExt.toUpperCase().slice(1)} File
                </a>
              </div>
              <button
                onClick={() => { setFile(null); setResultUrlSafe(null); setError(null); }}
                className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium transition-colors"
              >
                ← Convert another file
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
