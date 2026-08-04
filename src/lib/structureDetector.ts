/**
 * Structure Detector — Local Table & Layout Detection
 * 
 * Detects tables, key-value pairs, headers, and paragraph structure
 * from pdf.js extracted text positions. NO AI/API required.
 * 
 * Algorithm:
 * 1. Group text runs into visual lines (same Y position)
 * 2. Split each line into "segments" separated by large gaps → columns
 * 3. Find consecutive multi-column lines with aligned column positions → table
 * 4. Non-table lines → group into paragraphs
 */

import { RichRun } from './advancedOCREngine';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DetectedCell {
  text: string;
  bold: boolean;
  italic: boolean;
  fontSize: number;
  alignment: 'left' | 'center' | 'right';
}

export interface DetectedTableRow {
  cells: DetectedCell[];
}

export interface DetectedTable {
  rows: DetectedTableRow[];
  columnWidths: number[];   // percentage of page width per column
  hasBorders: boolean;
}

export interface StructuredParagraph {
  text: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  alignment: 'left' | 'center' | 'right' | 'justify';
  spaceBefore: number;  // pts
  indent: number;       // pts
  isListItem: boolean;
  fontName: string;
}

export interface DocumentBlock {
  type: 'paragraph' | 'table';
  y: number;  // for ordering
  paragraph?: StructuredParagraph;
  table?: DetectedTable;
}

export interface PageStructure {
  pageIndex: number;
  pageW: number;
  pageH: number;
  blocks: DocumentBlock[];
}

// ── Internal Types ────────────────────────────────────────────────────────────

interface VisualLine {
  runs: RichRun[];
  y: number; // For backwards compatibility
  baseline: number;
  yBottom: number;
  lineHeight: number;
}

interface LineSegment {
  runs: RichRun[];
  text: string;
  x: number;
  xEnd: number;
  bold: boolean;
  italic: boolean;
  fontSize: number;
}

interface AnalyzedLine {
  visualLine: VisualLine;
  segments: LineSegment[];
  segmentCount: number;
}

// ── Step 1: Group runs into visual lines ──────────────────────────────────────

function groupIntoLines(runs: RichRun[]): VisualLine[] {
  if (!runs.length) return [];
  
  // Sort by Baseline (or Y) then X
  const sorted = [...runs].sort((a, b) => {
    const aY = a.baseline ?? a.y;
    const bY = b.baseline ?? b.y;
    return aY !== bY ? aY - bY : a.x - b.x;
  });
  
  const lines: VisualLine[] = [];
  
  for (const run of sorted) {
    const lineH = run.h || run.fontSize;
    const tolerance = Math.max(3, lineH * 0.55);
    const runBaseline = run.baseline ?? run.y;
    
    // Try to find an existing line this run belongs to
    let found = false;
    for (const line of lines) {
      if (Math.abs(line.baseline - runBaseline) <= tolerance) {
        line.runs.push(run);
        // Update line metrics
        line.baseline = (line.baseline * (line.runs.length - 1) + runBaseline) / line.runs.length;
        line.y = Math.min(line.y, run.y);
        line.yBottom = Math.max(line.yBottom, run.y + lineH);
        line.lineHeight = Math.max(line.lineHeight, lineH);
        found = true;
        break;
      }
    }
    
    if (!found) {
      lines.push({
        runs: [run],
        y: run.y,
        baseline: runBaseline,
        yBottom: run.y + lineH,
        lineHeight: lineH,
      });
    }
  }
  
  // Sort lines top-to-bottom
  lines.sort((a, b) => a.baseline - b.baseline);
  
  // Sort runs within each line left-to-right
  for (const line of lines) {
    line.runs.sort((a, b) => a.x - b.x);
  }
  
  return lines;
}

// ── Step 2: Detect segments (columns) within each line ────────────────────────

function analyzeLineSegments(line: VisualLine, pageW: number): AnalyzedLine {
  const runs = line.runs;
  if (!runs.length) {
    return { visualLine: line, segments: [], segmentCount: 0 };
  }
  
  // Merge runs that are very close together into segments
  const segments: LineSegment[] = [];
  let currentSegment: RichRun[] = [runs[0]];
  
  for (let i = 1; i < runs.length; i++) {
    const prev = runs[i - 1];
    const curr = runs[i];
    const prevRight = prev.x + prev.w;
    const gap = curr.x - prevRight;
    
    // Average font size for threshold calculation
    const avgFontSize = (prev.fontSize + curr.fontSize) / 2;
    
    // Large gap threshold: if gap > 3x average char width, it's a column break
    // Average char width ≈ fontSize * 0.5
    const charWidth = avgFontSize * 0.5;
    const columnGapThreshold = Math.max(charWidth * 3, 20); // at least 20pts
    
    if (gap > columnGapThreshold) {
      // Column break — finalize current segment, start new one
      segments.push(buildSegment(currentSegment));
      currentSegment = [curr];
    } else {
      // Same segment
      currentSegment.push(curr);
    }
  }
  
  // Finalize last segment
  if (currentSegment.length) {
    segments.push(buildSegment(currentSegment));
  }
  
  return {
    visualLine: line,
    segments,
    segmentCount: segments.length,
  };
}

function buildSegment(runs: RichRun[]): LineSegment {
  // Join text with spaces
  let text = '';
  for (let i = 0; i < runs.length; i++) {
    if (i > 0) {
      const prev = runs[i - 1];
      const gap = runs[i].x - (prev.x + prev.w);
      const charW = prev.fontSize * 0.5;
      if (gap > charW * 0.3) {
        text += ' ';
      }
    }
    text += runs[i].text;
  }
  
  const x = runs[0].x;
  const lastRun = runs[runs.length - 1];
  const xEnd = lastRun.x + lastRun.w;
  
  // Dominant properties
  const bold = runs.some(r => r.bold);
  const italic = runs.some(r => r.italic);
  
  // Mode font size
  const fsMap = new Map<number, number>();
  for (const r of runs) fsMap.set(r.fontSize, (fsMap.get(r.fontSize) ?? 0) + 1);
  const fontSize = [...fsMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 12;
  
  return { runs, text: text.trim(), x, xEnd, bold, italic, fontSize };
}

// ── Step 3: Detect table regions ──────────────────────────────────────────────

interface TableRegion {
  startIdx: number;  // index in analyzedLines
  endIdx: number;    // inclusive
  columnPositions: number[];  // X positions of detected columns
  columnCount: number;
}

function detectTableRegions(analyzedLines: AnalyzedLine[], pageW: number): TableRegion[] {
  const regions: TableRegion[] = [];
  const n = analyzedLines.length;
  
  let i = 0;
  while (i < n) {
    const line = analyzedLines[i];
    
    // Need at least 2 segments to be a potential table line
    if (line.segmentCount < 2) {
      i++;
      continue;
    }
    
    // Start a potential table region
    const startIdx = i;
    const refPositions = line.segments.map(s => s.x);
    let endIdx = i;
    
    // Try to extend the table region
    let j = i + 1;
    while (j < n) {
      const nextLine = analyzedLines[j];
      
      // Single-segment lines can be part of a table if they're within the table width
      // But we need at least some multi-column lines
      if (nextLine.segmentCount < 2) {
        break; // A proper table should be contiguous multi-column lines. Break on single columns.
      }
      
      // Check if column positions align with reference
      const nextPositions = nextLine.segments.map(s => s.x);
      if (columnsAlign(refPositions, nextPositions, pageW)) {
        endIdx = j;
        j++;
      } else {
        break;
      }
    }
    
    // Minimum 2 rows for a table, and at least 2 multi-column lines
    const multiColumnCount = analyzedLines.slice(startIdx, endIdx + 1)
      .filter(l => l.segmentCount >= 2).length;
    
    if (endIdx > startIdx && multiColumnCount >= 2) {
      // Calculate unified column positions
      const allPositions = analyzedLines.slice(startIdx, endIdx + 1)
        .filter(l => l.segmentCount >= 2)
        .flatMap(l => l.segments.map(s => s.x));
      
      const columnPositions = clusterPositions(allPositions, pageW * 0.05);
      
      regions.push({
        startIdx,
        endIdx,
        columnPositions,
        columnCount: columnPositions.length,
      });
    }
    
    i = endIdx + 1;
  }
  
  return regions;
}

/**
 * Check if two sets of column positions are aligned (similar X positions)
 */
function columnsAlign(ref: number[], test: number[], pageW: number): boolean {
  const tolerance = pageW * 0.06; // 6% of page width
  
  // Count how many test positions align with reference positions
  let alignedCount = 0;
  for (const tp of test) {
    for (const rp of ref) {
      if (Math.abs(tp - rp) < tolerance) {
        alignedCount++;
        break;
      }
    }
  }
  
  // At least half of the positions should align, and at least 1
  const minAlign = Math.max(1, Math.min(ref.length, test.length) * 0.4);
  return alignedCount >= minAlign;
}

/**
 * Cluster nearby X positions into column positions
 */
function clusterPositions(positions: number[], tolerance: number): number[] {
  if (!positions.length) return [];
  
  const sorted = [...positions].sort((a, b) => a - b);
  const clusters: number[][] = [[sorted[0]]];
  
  for (let i = 1; i < sorted.length; i++) {
    const lastCluster = clusters[clusters.length - 1];
    const clusterAvg = lastCluster.reduce((s, v) => s + v, 0) / lastCluster.length;
    
    if (Math.abs(sorted[i] - clusterAvg) < tolerance) {
      lastCluster.push(sorted[i]);
    } else {
      clusters.push([sorted[i]]);
    }
  }
  
  // Return average of each cluster
  return clusters.map(c => c.reduce((s, v) => s + v, 0) / c.length);
}

// ── Step 4: Build document blocks ─────────────────────────────────────────────

function detectAlignment(
  segX: number, segXEnd: number,
  pageW: number, leftMargin: number, rightMargin: number,
): 'left' | 'center' | 'right' | 'justify' {
  const textW = segXEnd - segX;
  const usableW = rightMargin - leftMargin;
  if (usableW <= 0) return 'left';
  
  const centerOfSeg = segX + textW / 2;
  const centerOfPage = leftMargin + usableW / 2;
  
  // Full-width (>85%) → justify
  if (textW > usableW * 0.85) return 'justify';
  
  // Centered
  if (Math.abs(centerOfSeg - centerOfPage) < usableW * 0.08) return 'center';
  
  // Right-aligned
  const rightGap = rightMargin - segXEnd;
  const leftGap = segX - leftMargin;
  if (rightGap < usableW * 0.05 && leftGap > usableW * 0.3) return 'right';
  
  return 'left';
}

function buildTableBlock(
  analyzedLines: AnalyzedLine[],
  region: TableRegion,
  pageW: number,
): DocumentBlock {
  const { startIdx, endIdx, columnPositions, columnCount } = region;
  const lines = analyzedLines.slice(startIdx, endIdx + 1);
  
  // Calculate column boundaries
  // Column i starts at columnPositions[i] and ends at columnPositions[i+1] (or page right margin)
  const rightMargin = Math.max(
    ...lines.flatMap(l => l.segments.map(s => s.xEnd)),
    pageW * 0.9,
  );
  
  const colBoundaries: { start: number; end: number }[] = [];
  for (let c = 0; c < columnCount; c++) {
    const start = columnPositions[c];
    const end = c < columnCount - 1 ? columnPositions[c + 1] : rightMargin;
    colBoundaries.push({ start, end });
  }
  
  // Calculate column widths as percentages
  const totalWidth = rightMargin - columnPositions[0];
  const columnWidths = colBoundaries.map(cb => {
    const w = (cb.end - cb.start) / totalWidth * 100;
    return Math.max(5, Math.round(w)); // minimum 5%
  });
  
  // Normalize widths to 100%
  const totalPct = columnWidths.reduce((s, w) => s + w, 0);
  const normalizedWidths = columnWidths.map(w => Math.round(w / totalPct * 100));
  
  // Build table rows
  const rows: DetectedTableRow[] = [];
  
  for (const line of lines) {
    const cells: DetectedCell[] = [];
    
    if (line.segmentCount === 1 && columnCount > 1) {
      // Single segment spanning the whole table — put text in first cell, merge
      const seg = line.segments[0];
      cells.push({
        text: seg.text,
        bold: seg.bold,
        italic: seg.italic,
        fontSize: seg.fontSize,
        alignment: 'left',
      });
      // Fill remaining cells with empty
      for (let c = 1; c < columnCount; c++) {
        cells.push({ text: '', bold: false, italic: false, fontSize: 11, alignment: 'left' });
      }
    } else {
      // Map each segment to the nearest column
      const segmentToColumn = new Map<number, LineSegment[]>();
      
      for (const seg of line.segments) {
        const segCenter = (seg.x + seg.xEnd) / 2;
        let bestCol = 0;
        let bestDist = Infinity;
        
        for (let c = 0; c < columnCount; c++) {
          const colCenter = (colBoundaries[c].start + colBoundaries[c].end) / 2;
          const dist = Math.abs(segCenter - colCenter);
          if (dist < bestDist) {
            bestDist = dist;
            bestCol = c;
          }
        }
        
        if (!segmentToColumn.has(bestCol)) segmentToColumn.set(bestCol, []);
        segmentToColumn.get(bestCol)!.push(seg);
      }
      
      // Build cells for each column
      for (let c = 0; c < columnCount; c++) {
        const segs = segmentToColumn.get(c) || [];
        if (segs.length === 0) {
          cells.push({ text: '', bold: false, italic: false, fontSize: 11, alignment: 'left' });
        } else {
          const text = segs.map(s => s.text).join(' ');
          const bold = segs.some(s => s.bold);
          const italic = segs.some(s => s.italic);
          const fontSize = segs[0].fontSize;
          cells.push({ text, bold, italic, fontSize, alignment: 'left' });
        }
      }
    }
    
    rows.push({ cells });
  }
  
  // Detect if table has borders (heuristic: if text is well-aligned in grid pattern)
  // For now, check if column positions are very consistent
  const multiColLines = lines.filter(l => l.segmentCount >= 2);
  const hasBorders = multiColLines.length >= 2 && columnCount >= 2;
  
  return {
    type: 'table',
    y: lines[0].visualLine.y,
    table: {
      rows,
      columnWidths: normalizedWidths,
      hasBorders,
    },
  };
}

function buildParagraphBlock(
  line: AnalyzedLine,
  prevLineBottom: number,
  pageW: number,
): DocumentBlock {
  const runs = line.visualLine.runs;
  if (!runs.length) {
    return {
      type: 'paragraph',
      y: line.visualLine.y,
      paragraph: {
        text: '', fontSize: 11, bold: false, italic: false,
        alignment: 'left', spaceBefore: 0, indent: 0,
        isListItem: false, fontName: '',
      },
    };
  }
  
  // Join all runs' text
  let text = '';
  for (let i = 0; i < runs.length; i++) {
    if (i > 0) {
      const prev = runs[i - 1];
      const gap = runs[i].x - (prev.x + prev.w);
      const charW = prev.fontSize * 0.5;
      if (gap > charW * 1.5) {
        // Large gap — use non-breaking spaces to preserve spacing
        const spaceCount = Math.max(1, Math.round(gap / (prev.fontSize * 0.25)));
        text += '\u00A0'.repeat(Math.min(spaceCount, 20));
      } else if (gap > charW * 0.3) {
        text += ' ';
      }
    }
    text += runs[i].text;
  }
  
  const leftMargin = runs[0].leftMargin;
  const rightMargin = runs[0].rightMargin;
  const firstRunX = runs[0].x;
  const lastRun = runs[runs.length - 1];
  const lineRight = lastRun.x + lastRun.w;
  
  // Detect alignment
  const alignment = detectAlignment(firstRunX, lineRight, pageW, leftMargin, rightMargin);
  
  // Font properties (dominant)
  const bold = runs.some(r => r.bold);
  const italic = runs.some(r => r.italic);
  const fsMap = new Map<number, number>();
  for (const r of runs) fsMap.set(r.fontSize, (fsMap.get(r.fontSize) ?? 0) + 1);
  const fontSize = [...fsMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 11;
  
  // Space before
  const gap = Math.max(0, line.visualLine.y - prevLineBottom);
  const spaceBefore = Math.round(gap);
  
  // Indent
  const indent = Math.max(0, firstRunX - leftMargin);
  
  // List item detection
  const bulletRe = /^[\u2022\u2023\u2043\u25E6\u2219•\-\*]\s/;
  const numberedRe = /^[0-9]+[\.\)]\s/;
  const isListItem = bulletRe.test(text.trim()) || (numberedRe.test(text.trim()) && indent > 5);
  
  return {
    type: 'paragraph',
    y: line.visualLine.y,
    paragraph: {
      text: text.trim(),
      fontSize, bold, italic, alignment,
      spaceBefore, indent, isListItem,
      fontName: runs[0].fontName || '',
    },
  };
}

// ── Main Detection Function ───────────────────────────────────────────────────

export function detectPageStructure(
  runs: RichRun[],
  pageIndex: number,
): PageStructure {
  const pageRuns = runs.filter(r => r.pageIndex === pageIndex);
  if (!pageRuns.length) {
    return { pageIndex, pageW: 595, pageH: 842, blocks: [] };
  }
  
  const pageW = pageRuns[0].pageW;
  const pageH = pageRuns[0].pageH;
  
  // Step 1: Group into visual lines
  const lines = groupIntoLines(pageRuns);
  
  // Step 2: Analyze segments in each line
  const analyzedLines = lines.map(line => analyzeLineSegments(line, pageW));
  
  // Step 3: Detect table regions
  const tableRegions = detectTableRegions(analyzedLines, pageW);
  
  // Step 4: Build ordered blocks
  const blocks: DocumentBlock[] = [];
  const inTable = new Set<number>(); // line indices that are part of tables
  
  // Create table blocks
  for (const region of tableRegions) {
    for (let idx = region.startIdx; idx <= region.endIdx; idx++) {
      inTable.add(idx);
    }
    blocks.push(buildTableBlock(analyzedLines, region, pageW));
  }
  
  // Create paragraph blocks for non-table lines
  // Group consecutive non-table lines into paragraph groups
  let prevBottom = 0;
  
  for (let idx = 0; idx < analyzedLines.length; idx++) {
    if (inTable.has(idx)) {
      prevBottom = analyzedLines[idx].visualLine.yBottom;
      continue;
    }
    
    const line = analyzedLines[idx];
    
    // If this line has multiple segments but wasn't detected as table,
    // create individual paragraph blocks for each segment
    if (line.segmentCount > 1) {
      // Create a borderless table for side-by-side content
      const rows: DetectedTableRow[] = [{
        cells: line.segments.map(seg => ({
          text: seg.text,
          bold: seg.bold,
          italic: seg.italic,
          fontSize: seg.fontSize,
          alignment: 'left' as const,
        })),
      }];
      
      const columnWidths = [];
      const usableW = pageW * 0.9;
      for (let s = 0; s < line.segments.length; s++) {
        const seg = line.segments[s];
        const nextX = s < line.segments.length - 1 ? line.segments[s + 1].x : usableW;
        const widthPts = Math.max(20, nextX - seg.x);
        columnWidths.push(widthPts);
      }
      
      const totalWidthPts = columnWidths.reduce((sum, w) => sum + w, 0);
      const normalized = columnWidths.map(w => Math.max(5, Math.round((w / totalWidthPts) * 100)));
      
      blocks.push({
        type: 'table',
        y: line.visualLine.y,
        table: {
          rows,
          columnWidths: normalized,
          hasBorders: false, // borderless for side-by-side text
        },
      });
    } else {
      blocks.push(buildParagraphBlock(line, prevBottom, pageW));
    }
    
    prevBottom = line.visualLine.yBottom;
  }
  
  // Sort blocks by Y position
  blocks.sort((a, b) => a.y - b.y);
  
  return { pageIndex, pageW, pageH, blocks };
}

/**
 * Detect structure for all pages
 */
export function detectDocumentStructure(
  runs: RichRun[],
  pageCount: number,
): PageStructure[] {
  const structures: PageStructure[] = [];
  
  for (let i = 0; i < pageCount; i++) {
    structures.push(detectPageStructure(runs, i));
  }
  
  return structures;
}
