/**
 * Local DOCX Builder — builds Word documents from raw RichRun[] positions.
 *
 * Works directly with pdf.js-extracted text runs to detect:
 * - Visual lines (using baseline alignment)
 * - Side-by-side columns (using gap analysis)
 * - Bordered table regions (consecutive multi-column lines)
 * - Single paragraphs with PER-RUN bold, italic, font-size, font, alignment
 *
 * NO AI or API calls needed.
 */

import {
  Document,
  Paragraph,
  TextRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  SectionType,
  PageBreak,
} from 'docx';
import { RichRun } from './advancedOCREngine';

// ── Font picker ───────────────────────────────────────────────────────────────

function pickFont(text: string, pdfFontName: string): string {
  if (/[\u0900-\u097F]/.test(text)) return 'Arial Unicode MS';
  if (/[\u0980-\u09FF]/.test(text)) return 'Vrinda';
  if (/[\u0A80-\u0AFF]/.test(text)) return 'Shruti';
  if (/[\u0A00-\u0A7F]/.test(text)) return 'Raavi';
  if (/[\u0B80-\u0BFF]/.test(text)) return 'Latha';
  if (/[\u0C00-\u0C7F]/.test(text)) return 'Gautami';
  if (/[\u0D00-\u0D7F]/.test(text)) return 'Kartika';
  if (/[\u0600-\u06FF]/.test(text)) return 'Arial';
  if (/[\u4E00-\u9FFF]/.test(text)) return 'SimSun';
  // Strip subset prefix (e.g. "ABCDEF+Helvetica-Bold" → "Helvetica")
  const cleaned = pdfFontName
    .replace(/^[A-Z]{6}\+/, '')
    .replace(/[-_,].*$/, '')
    .trim();
  if (cleaned && !cleaned.toLowerCase().includes('identity') && cleaned.length > 2) return cleaned;
  return 'Calibri';
}

function toHalfPt(pts: number): number {
  return Math.max(16, Math.min(96, Math.round(pts * 2)));
}

function toTwips(pts: number): number {
  return Math.round(pts * 20);
}

function alignOf(a: string): (typeof AlignmentType)[keyof typeof AlignmentType] {
  if (a === 'center') return AlignmentType.CENTER;
  if (a === 'right')  return AlignmentType.RIGHT;
  if (a === 'justify') return AlignmentType.BOTH;
  return AlignmentType.LEFT;
}

function sanitize(s: string): string {
  return s.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '').trim();
}

// ── Internal types ────────────────────────────────────────────────────────────

interface Segment {
  runs: RichRun[];
  text: string;
  x: number;
  xEnd: number;
  bold: boolean;
  italic: boolean;
  fontSize: number;
  fontName: string;
}

interface VisualLine {
  segments: Segment[];
  baseline: number;
  yTop: number;
  yBottom: number;
  lineHeight: number;
}

// ── Step 1: Group runs into visual lines by baseline ──────────────────────────

function groupRunsIntoLines(runs: RichRun[]): VisualLine[] {
  if (!runs.length) return [];

  const sorted = [...runs].sort((a, b) => {
    const aB = a.baseline ?? (a.y + a.h);
    const bB = b.baseline ?? (b.y + b.h);
    return aB !== bB ? aB - bB : a.x - b.x;
  });

  const lines: { runs: RichRun[]; baseline: number; yTop: number; yBottom: number; lineH: number }[] = [];

  for (const run of sorted) {
    const rb = run.baseline ?? (run.y + run.h);
    const rh = run.h || run.fontSize;
    const tolerance = Math.max(4, rh * 0.6);

    let found = false;
    for (const line of lines) {
      if (Math.abs(line.baseline - rb) <= tolerance) {
        line.runs.push(run);
        line.baseline = (line.baseline * (line.runs.length - 1) + rb) / line.runs.length;
        line.yTop = Math.min(line.yTop, run.y);
        line.yBottom = Math.max(line.yBottom, run.y + rh);
        line.lineH = Math.max(line.lineH, rh);
        found = true;
        break;
      }
    }

    if (!found) {
      lines.push({ runs: [run], baseline: rb, yTop: run.y, yBottom: run.y + rh, lineH: rh });
    }
  }

  lines.sort((a, b) => a.baseline - b.baseline);
  for (const line of lines) line.runs.sort((a, b) => a.x - b.x);

  return lines.map(line => ({
    segments: detectSegments(line.runs),
    baseline: line.baseline,
    yTop: line.yTop,
    yBottom: line.yBottom,
    lineHeight: line.lineH,
  }));
}

// ── Step 2: Detect segments (columns) within a line ───────────────────────────

function detectSegments(runs: RichRun[]): Segment[] {
  if (!runs.length) return [];

  const segments: Segment[] = [];
  let currentRuns: RichRun[] = [runs[0]];

  for (let i = 1; i < runs.length; i++) {
    const prev = runs[i - 1];
    const curr = runs[i];
    const prevRight = prev.x + prev.w;
    const gap = curr.x - prevRight;
    const avgFS = (prev.fontSize + curr.fontSize) / 2;
    const charW = avgFS * 0.5;
    // Column gap: if gap > 3× char width (and at least 15 pts)
    const threshold = Math.max(charW * 3, 15);

    if (gap > threshold) {
      segments.push(buildSegment(currentRuns));
      currentRuns = [curr];
    } else {
      currentRuns.push(curr);
    }
  }

  segments.push(buildSegment(currentRuns));
  return segments;
}

function buildSegment(runs: RichRun[]): Segment {
  let text = '';
  for (let i = 0; i < runs.length; i++) {
    if (i > 0) {
      const prev = runs[i - 1];
      const gap = runs[i].x - (prev.x + prev.w);
      const charW = prev.fontSize * 0.5;
      if (gap > charW * 0.3) text += ' ';
    }
    text += runs[i].text;
  }

  const x = runs[0].x;
  const lastRun = runs[runs.length - 1];
  const fsMap = new Map<number, number>();
  for (const r of runs) fsMap.set(r.fontSize, (fsMap.get(r.fontSize) ?? 0) + 1);
  const fontSize = [...fsMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 12;

  return {
    runs,
    text: text.trim(),
    x,
    xEnd: lastRun.x + lastRun.w,
    bold: runs.some(r => r.bold),
    italic: runs.some(r => r.italic),
    fontSize,
    fontName: runs[0].fontName || '',
  };
}

// ── Step 3: Detect alignment of a line ────────────────────────────────────────

function detectLineAlignment(
  lineX: number,
  lineRight: number,
  leftMargin: number,
  rightMargin: number,
): 'left' | 'center' | 'right' | 'justify' {
  const textW = lineRight - lineX;
  const usableW = rightMargin - leftMargin;
  if (usableW <= 0) return 'left';

  // Full-width → justify
  if (textW > usableW * 0.85) return 'justify';

  // Centered
  const centerLine = lineX + textW / 2;
  const centerPage = leftMargin + usableW / 2;
  if (Math.abs(centerLine - centerPage) < usableW * 0.08) return 'center';

  // Right-aligned
  if ((rightMargin - lineRight) < usableW * 0.05 && (lineX - leftMargin) > usableW * 0.3) return 'right';

  return 'left';
}

// ── Step 4: Detect table regions ──────────────────────────────────────────────

interface TableRegion {
  startIdx: number;
  endIdx: number; // inclusive
}

function detectTableRegions(lines: VisualLine[], pageW: number): TableRegion[] {
  const regions: TableRegion[] = [];
  const n = lines.length;
  let i = 0;

  while (i < n) {
    if (lines[i].segments.length < 2) { i++; continue; }

    const startIdx = i;
    // Reference column X-positions from the first multi-column line
    const refXs = lines[i].segments.map(s => s.x);
    let endIdx = i;

    let j = i + 1;
    while (j < n) {
      const next = lines[j];
      // Allow a single-column gap line (e.g., empty line between table rows)
      if (next.segments.length === 0) { j++; continue; }
      if (next.segments.length < 2) break;

      // Check column alignment with tighter tolerance (5% of page width)
      const testXs = next.segments.map(s => s.x);
      let aligned = 0;
      const tol = pageW * 0.05;
      for (const tx of testXs) {
        if (refXs.some(rx => Math.abs(rx - tx) < tol)) aligned++;
      }
      const minMatch = Math.max(1, Math.min(refXs.length, testXs.length) * 0.4);
      if (aligned >= minMatch) {
        endIdx = j;
        j++;
      } else {
        break;
      }
    }

    // Need at least 3 multi-column rows to be considered a table (reduces false positives)
    if (endIdx - startIdx >= 2) {
      regions.push({ startIdx, endIdx });
    }

    i = endIdx + 1;
  }

  return regions;
}

// ── Build Word Table from table region ────────────────────────────────────────

function buildWordTable(lines: VisualLine[], pageW: number): Table {
  // Find all unique column positions across all lines
  const allXs = lines.flatMap(l => l.segments.map(s => s.x));
  const colPositions = clusterPositions(allXs, pageW * 0.05);
  const colCount = colPositions.length;

  // Right edge of table
  const rightEdge = Math.max(
    ...lines.flatMap(l => l.segments.map(s => s.xEnd)),
    pageW * 0.85,
  );

  // Column widths
  const colWidths: number[] = [];
  for (let c = 0; c < colCount; c++) {
    const start = colPositions[c];
    const end = c + 1 < colCount ? colPositions[c + 1] : rightEdge;
    colWidths.push(Math.max(end - start, 20));
  }
  const totalW = colWidths.reduce((s, w) => s + w, 0);
  const pctWidths = colWidths.map(w => Math.max(5, Math.round((w / totalW) * 100)));

  // Build rows
  const rows = lines.map((line, ri) => {
    const isHeader = ri === 0;

    // Map segments to columns
    const cellData: { runs: RichRun[]; text: string; bold: boolean; italic: boolean; fontSize: number; fontName: string }[] = [];
    for (let c = 0; c < colCount; c++) {
      cellData.push({ runs: [], text: '', bold: false, italic: false, fontSize: 11, fontName: '' });
    }

    for (const seg of line.segments) {
      const segCenter = (seg.x + seg.xEnd) / 2;
      let bestCol = 0;
      let bestDist = Infinity;
      for (let c = 0; c < colCount; c++) {
        const colLeft = colPositions[c];
        const colRight = c + 1 < colCount ? colPositions[c + 1] : rightEdge;
        const colCenter = (colLeft + colRight) / 2;
        const dist = Math.abs(segCenter - colCenter);
        if (dist < bestDist) { bestDist = dist; bestCol = c; }
      }

      const existing = cellData[bestCol];
      if (existing.text) existing.text += ' ';
      existing.text += seg.text;
      existing.runs.push(...seg.runs);
      existing.bold = existing.bold || seg.bold;
      existing.italic = existing.italic || seg.italic;
      existing.fontSize = seg.fontSize;
      existing.fontName = seg.fontName;
    }

    return new TableRow({
      tableHeader: isHeader,
      children: cellData.map((cell, ci) => {
        const safe = sanitize(cell.text);
        // Build per-run TextRuns for the cell if we have run data
        const cellRuns = buildTextRunsFromRuns(cell.runs, isHeader || cell.bold);
        return new TableCell({
          width: { size: pctWidths[ci], type: WidthType.PERCENTAGE },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          shading: isHeader ? { fill: '1a3a8f', color: 'FFFFFF' } : undefined,
          children: [
            new Paragraph({
              children: cellRuns.length > 0 ? cellRuns : (safe ? [
                new TextRun({
                  text: safe,
                  bold: isHeader || cell.bold,
                  italics: cell.italic,
                  size: toHalfPt(cell.fontSize),
                  font: pickFont(safe, cell.fontName),
                  color: isHeader ? 'FFFFFF' : undefined,
                }),
              ] : []),
            }),
          ],
        });
      }),
    });
  });

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top:              { style: BorderStyle.SINGLE, size: 4, color: '2563EB' },
      bottom:           { style: BorderStyle.SINGLE, size: 4, color: '2563EB' },
      left:             { style: BorderStyle.SINGLE, size: 4, color: '2563EB' },
      right:            { style: BorderStyle.SINGLE, size: 4, color: '2563EB' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: '93C5FD' },
      insideVertical:   { style: BorderStyle.SINGLE, size: 2, color: '93C5FD' },
    },
  });
}

function clusterPositions(positions: number[], tolerance: number): number[] {
  if (!positions.length) return [];
  const sorted = [...positions].sort((a, b) => a - b);
  const clusters: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const last = clusters[clusters.length - 1];
    const avg = last.reduce((s, v) => s + v, 0) / last.length;
    if (Math.abs(sorted[i] - avg) < tolerance) last.push(sorted[i]);
    else clusters.push([sorted[i]]);
  }
  return clusters.map(c => c.reduce((s, v) => s + v, 0) / c.length);
}

// ── Build TextRun[] from RichRun[] (preserves per-run bold/italic/font) ───────

function buildTextRunsFromRuns(runs: RichRun[], forceHeader = false): TextRun[] {
  if (!runs.length) return [];

  const result: TextRun[] = [];
  // Merge adjacent runs with same style to reduce noise
  const merged: RichRun[] = [];
  for (const run of runs) {
    if (!run.text.trim()) continue;
    const prev = merged[merged.length - 1];
    if (prev && prev.bold === run.bold && prev.italic === run.italic &&
        Math.abs(prev.fontSize - run.fontSize) < 2 && prev.fontName === run.fontName) {
      // Merge: append with space if needed
      const prevRight = prev.x + prev.w;
      const gap = run.x - prevRight;
      const charW = prev.fontSize * 0.5;
      prev.text += (gap > charW * 0.3 ? ' ' : '') + run.text;
      prev.w = (run.x + run.w) - prev.x;
    } else {
      merged.push({ ...run });
    }
  }

  for (const run of merged) {
    const safe = sanitize(run.text);
    if (!safe) continue;
    result.push(new TextRun({
      text: safe,
      bold: forceHeader || run.bold,
      italics: run.italic,
      size: toHalfPt(run.fontSize),
      font: pickFont(safe, run.fontName),
      color: forceHeader ? 'FFFFFF' : undefined,
    }));
  }

  return result;
}

// ── Build borderless table for single side-by-side line ───────────────────────

function buildBorderlessRow(line: VisualLine, pageW: number): Table {
  const rightEdge = pageW * 0.85;
  const segs = line.segments;
  const colWidths: number[] = [];

  for (let i = 0; i < segs.length; i++) {
    const start = segs[i].x;
    const end = i + 1 < segs.length ? segs[i + 1].x : rightEdge;
    colWidths.push(Math.max(end - start, 30));
  }
  const totalW = colWidths.reduce((s, w) => s + w, 0);
  const pctWidths = colWidths.map(w => Math.max(5, Math.round((w / totalW) * 100)));

  const noBorder = {
    top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  };

  const cells = segs.map((seg, i) => {
    // Build per-run TextRuns for this segment
    const textRuns = buildTextRunsFromRuns(seg.runs);
    const safe = sanitize(seg.text);

    return new TableCell({
      width: { size: pctWidths[i], type: WidthType.PERCENTAGE },
      margins: { top: 0, bottom: 0, left: 40, right: 40 },
      borders: noBorder,
      children: [
        new Paragraph({
          children: textRuns.length > 0 ? textRuns : (safe ? [
            new TextRun({
              text: safe,
              bold: seg.bold,
              italics: seg.italic,
              size: toHalfPt(seg.fontSize),
              font: pickFont(safe, seg.fontName),
            }),
          ] : []),
        }),
      ],
    });
  });

  return new Table({
    rows: [new TableRow({ children: cells })],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top:              { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom:           { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left:             { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right:            { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideVertical:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
  });
}

// ── Build paragraph from single-column line (per-run TextRuns) ────────────────

function buildWordParagraph(line: VisualLine, spaceBefore: number): Paragraph {
  const seg = line.segments[0];
  if (!seg) return new Paragraph({ children: [] });

  const lm = seg.runs[0]?.leftMargin ?? 50;
  const rm = seg.runs[0]?.rightMargin ?? (seg.runs[0]?.pageW ?? 595) - 50;
  const alignment = detectLineAlignment(seg.x, seg.xEnd, lm, rm);

  const indent = Math.max(0, seg.x - lm);
  const indentProps = indent > 5 && (alignment === 'left' || alignment === 'justify')
    ? { left: toTwips(indent) }
    : undefined;

  // List item detection
  const bulletRe = /^[\u2022\u2023\u2043\u25E6\u2219•\-\*]\s/;
  const firstText = seg.runs[0]?.text ?? '';
  const isListItem = bulletRe.test(firstText);
  const listIndent = isListItem
    ? { left: toTwips(Math.max(indent, 28)), hanging: toTwips(14) }
    : undefined;

  // Build per-run TextRuns (key change: preserves inline bold/italic/font switches)
  const textRuns = buildTextRunsFromRuns(seg.runs);
  const safe = sanitize(seg.text);

  const children: TextRun[] = textRuns.length > 0 ? textRuns : (safe ? [
    new TextRun({
      text: safe,
      bold: seg.bold,
      italics: seg.italic,
      size: toHalfPt(seg.fontSize),
      font: pickFont(safe, seg.fontName),
    }),
  ] : []);

  return new Paragraph({
    alignment: alignOf(alignment),
    spacing: {
      before: Math.min(toTwips(Math.max(spaceBefore, 0)), 400),
      after: 0,
      line: 276,
      lineRule: 'auto' as any,
    },
    indent: listIndent ?? indentProps,
    children,
  });
}

// ── MAIN: Build Document from RichRun[] ───────────────────────────────────────

export function buildDocxFromRuns(runs: RichRun[], pageCount: number): Document {
  const children: any[] = [];
  let firstPage = true;

  for (let pageIdx = 0; pageIdx < pageCount; pageIdx++) {
    const pageRuns = runs.filter(r => r.pageIndex === pageIdx);

    if (!firstPage) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
    firstPage = false;

    if (!pageRuns.length) continue;

    const pageW = pageRuns[0].pageW;

    const lines = groupRunsIntoLines(pageRuns);
    const tableRegions = detectTableRegions(lines, pageW);
    const inTable = new Set<number>();
    for (const region of tableRegions) {
      for (let idx = region.startIdx; idx <= region.endIdx; idx++) {
        inTable.add(idx);
      }
    }

    let prevBottom = -1;
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Check if this line starts a table region
      const tableRegion = tableRegions.find(r => r.startIdx === i);
      if (tableRegion) {
        if (prevBottom >= 0) {
          const gap = line.yTop - prevBottom;
          if (gap > 3) {
            children.push(new Paragraph({ spacing: { before: Math.min(toTwips(gap), 300), after: 0 } }));
          }
        }

        const tableLines = lines.slice(tableRegion.startIdx, tableRegion.endIdx + 1);
        children.push(buildWordTable(tableLines, pageW));
        children.push(new Paragraph({ spacing: { before: 80, after: 0 } }));

        prevBottom = lines[tableRegion.endIdx].yBottom;
        i = tableRegion.endIdx + 1;
        continue;
      }

      if (inTable.has(i)) { i++; continue; }

      const spaceBefore = prevBottom >= 0 ? Math.max(0, line.yTop - prevBottom) : 0;

      if (line.segments.length > 1) {
        // Multi-column but not part of a table region → borderless table
        if (prevBottom >= 0 && spaceBefore > 3) {
          children.push(new Paragraph({ spacing: { before: Math.min(toTwips(spaceBefore), 300), after: 0 } }));
        }
        children.push(buildBorderlessRow(line, pageW));
      } else if (line.segments.length === 1) {
        children.push(buildWordParagraph(line, spaceBefore));
      }

      prevBottom = line.yBottom;
      i++;
    }
  }

  if (!children.length) {
    children.push(new Paragraph({ children: [new TextRun('')] }));
  }

  return new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 24 } },
      },
    },
    sections: [{
      properties: {
        type: SectionType.CONTINUOUS,
        page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } },
      },
      children,
    }],
  });
}
