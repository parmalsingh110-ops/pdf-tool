/**
 * docxExtractor.ts — Structured DOCX Content Extractor
 *
 * Properly reads word/document.xml to extract:
 * - Paragraphs with per-run bold, italic, underline, font size, font name, color
 * - Heading levels (Normal, H1–H6)
 * - Tables (<w:tbl>) with full row/cell structure including colspan
 * - Alignment (left, center, right, justify)
 */

import JSZip from 'jszip';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DocxRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  fontSize: number;   // half-points (e.g. 24 = 12pt)
  fontName: string;
  color: string;      // hex RGB e.g. "FF0000", or "auto"
  highlight: boolean;
}

export interface DocxParagraph {
  type: 'paragraph';
  runs: DocxRun[];
  text: string;       // joined text of all runs
  heading: 0 | 1 | 2 | 3 | 4 | 5 | 6;  // 0 = normal
  alignment: 'left' | 'center' | 'right' | 'justify';
  indentLeft: number; // in twips
  listItem: boolean;
  listLevel: number;  // 0-8
  spaceBefore: number; // in twips
  spaceAfter: number;
}

export interface DocxTableCell {
  paragraphs: DocxParagraph[];
  text: string;       // joined text
  colspan: number;
  rowspan: number;
  bold: boolean;      // true if cell has any bold content
  shading?: string;   // background fill hex color
}

export interface DocxTableRow {
  cells: DocxTableCell[];
  isHeader: boolean;
}

export interface DocxTable {
  type: 'table';
  rows: DocxTableRow[];
  hasBorder: boolean;
}

export type DocxElement = DocxParagraph | DocxTable;

export interface DocxContent {
  elements: DocxElement[];
  paragraphs: DocxParagraph[];
  flatText: string[];
}

// ─── XML Helpers ─────────────────────────────────────────────────────────────

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d)));
}

// ─── Run Parser ───────────────────────────────────────────────────────────────

function parseRun(runXml: string): DocxRun | null {
  // Get run properties
  const rPrMatch = runXml.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
  const rPr = rPrMatch ? rPrMatch[1] : '';

  const boldMatch = rPr && /<w:b[\s/>]/.test(rPr) && !/<w:b[^>]*w:val="0"/.test(rPr);
  const italicMatch = rPr && /<w:i[\s/>]/.test(rPr) && !/<w:i[^>]*w:val="0"/.test(rPr);
  const underlineMatch = rPr && /<w:u\s/.test(rPr) && !/<w:u[^>]*w:val="none"/.test(rPr);

  const szMatch = rPr.match(/<w:sz\s[^>]*w:val="(\d+)"/);
  const fontSize = szMatch ? parseInt(szMatch[1]) : 24;

  const fontMatch = rPr.match(/<w:rFonts[^>]*w:ascii="([^"]+)"/);
  const fontName = fontMatch ? fontMatch[1] : 'Calibri';

  const colorMatch = rPr.match(/<w:color[^>]*w:val="([^"]+)"/);
  const color = colorMatch ? colorMatch[1] : 'auto';

  const highlight = rPr ? /<w:highlight/.test(rPr) : false;

  // Get text content
  const tMatches = [...runXml.matchAll(/<w:t(?:[^>]*)>([^<]*)<\/w:t>/g)];
  let text = decodeXmlEntities(tMatches.map(m => m[1]).join(''));

  // Tab and break characters
  if (/<w:tab\s*\/>/.test(runXml)) text += '\t';
  if (/<w:br\s*\/>/.test(runXml)) text += '\n';

  if (!text) return null;

  return {
    text,
    bold: !!boldMatch,
    italic: !!italicMatch,
    underline: !!underlineMatch,
    fontSize,
    fontName,
    color,
    highlight,
  };
}

// ─── Paragraph Parser ─────────────────────────────────────────────────────────

const HEADING_STYLE_MAP: Record<string, 0 | 1 | 2 | 3 | 4 | 5 | 6> = {
  heading1: 1, heading2: 2, heading3: 3, heading4: 4, heading5: 5, heading6: 6,
  '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
};

function parseParagraph(pXml: string): DocxParagraph {
  // Paragraph properties
  const pPrMatch = pXml.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/);
  const pPr = pPrMatch ? pPrMatch[1] : '';

  // Heading style
  let heading: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0;
  if (pPr) {
    const styleMatch = pPr.match(/<w:pStyle\s[^>]*w:val="([^"]+)"/);
    if (styleMatch) {
      const styleId = styleMatch[1].toLowerCase().replace(/\s/g, '');
      heading = HEADING_STYLE_MAP[styleId] ?? 0;
    }
  }

  // Alignment
  let alignment: DocxParagraph['alignment'] = 'left';
  if (pPr) {
    const jcMatch = pPr.match(/<w:jc\s[^>]*w:val="([^"]+)"/);
    if (jcMatch) {
      const jc = jcMatch[1];
      if (jc === 'center') alignment = 'center';
      else if (jc === 'right') alignment = 'right';
      else if (jc === 'both' || jc === 'distribute') alignment = 'justify';
    }
  }

  // Indent
  let indentLeft = 0;
  if (pPr) {
    const indMatch = pPr.match(/<w:ind\s[^>]*w:left="(\d+)"/);
    if (indMatch) indentLeft = parseInt(indMatch[1]);
  }

  // List
  const isList = pPr ? /<w:numPr/.test(pPr) : false;
  let listLevel = 0;
  if (isList && pPr) {
    const lvlMatch = pPr.match(/<w:ilvl\s[^>]*w:val="(\d+)"/);
    if (lvlMatch) listLevel = parseInt(lvlMatch[1]);
  }

  // Spacing
  let spaceBefore = 0, spaceAfter = 0;
  if (pPr) {
    const spMatch = pPr.match(/<w:spacing\s([^>]*)\/?>/);
    if (spMatch) {
      const beMatch = spMatch[1].match(/w:before="(\d+)"/);
      const afMatch = spMatch[1].match(/w:after="(\d+)"/);
      if (beMatch) spaceBefore = parseInt(beMatch[1]);
      if (afMatch) spaceAfter = parseInt(afMatch[1]);
    }
  }

  // Parse runs — find all <w:r> elements
  const runs: DocxRun[] = [];
  const runMatches = [...pXml.matchAll(/<w:r[ >][\s\S]*?<\/w:r>/g)];
  for (const rm of runMatches) {
    const run = parseRun(rm[0]);
    if (run && run.text) runs.push(run);
  }

  // Hyperlinks contain runs too
  const hyperMatches = [...pXml.matchAll(/<w:hyperlink[^>]*>([\s\S]*?)<\/w:hyperlink>/g)];
  for (const hm of hyperMatches) {
    const innerRuns = [...hm[1].matchAll(/<w:r[ >][\s\S]*?<\/w:r>/g)];
    for (const rm of innerRuns) {
      const run = parseRun(rm[0]);
      if (run && run.text) runs.push(run);
    }
  }

  const text = runs.map(r => r.text).join('');

  return {
    type: 'paragraph',
    runs,
    text,
    heading,
    alignment,
    indentLeft,
    listItem: isList,
    listLevel,
    spaceBefore,
    spaceAfter,
  };
}

// ─── Table Parser ─────────────────────────────────────────────────────────────

function parseTableXml(tblXml: string): DocxTable {
  const tblPrMatch = tblXml.match(/<w:tblPr>([\s\S]*?)<\/w:tblPr>/);
  const hasBorder = tblPrMatch ? /<w:tblBorders/.test(tblPrMatch[1]) : false;

  const rows: DocxTableRow[] = [];

  // Use proper nesting-aware extraction for rows
  const rowXmls = extractTopLevelElements(tblXml, 'w:tr');

  for (let ri = 0; ri < rowXmls.length; ri++) {
    const rowXml = rowXmls[ri];

    const trPrMatch = rowXml.match(/<w:trPr>([\s\S]*?)<\/w:trPr>/);
    const isTblHeader = trPrMatch ? /<w:tblHeader/.test(trPrMatch[1]) : false;

    // Extract cells with nesting-aware extraction
    const cellXmls = extractTopLevelElements(rowXml, 'w:tc');
    const cells: DocxTableCell[] = [];

    for (const cellXml of cellXmls) {
      const tcPrMatch = cellXml.match(/<w:tcPr>([\s\S]*?)<\/w:tcPr>/);
      const tcPr = tcPrMatch ? tcPrMatch[1] : '';
      let colspan = 1;
      let shading: string | undefined;

      const gridSpanMatch = tcPr.match(/<w:gridSpan\s[^>]*w:val="(\d+)"/);
      if (gridSpanMatch) colspan = parseInt(gridSpanMatch[1]);

      const shadingMatch = tcPr.match(/<w:shd\s[^>]*w:fill="([0-9A-Fa-f]{6})"/);
      if (shadingMatch && shadingMatch[1] !== 'auto' && shadingMatch[1].toUpperCase() !== 'FFFFFF') {
        shading = shadingMatch[1];
      }

      // Parse paragraphs in cell
      const cellPXmls = extractTopLevelElements(cellXml, 'w:p');
      const cellParas: DocxParagraph[] = cellPXmls.map(pxml => parseParagraph(pxml));

      const cellText = cellParas.map(p => p.text).join('\n').trim();
      const hasBoldContent = cellParas.some(p => p.runs.some(r => r.bold));

      cells.push({
        paragraphs: cellParas,
        text: cellText,
        colspan,
        rowspan: 1,
        bold: hasBoldContent,
        shading,
      });
    }

    if (cells.length === 0) continue;

    const allBold = ri === 0 && cells.every(c => c.bold || !c.text.trim());
    rows.push({
      cells,
      isHeader: isTblHeader || (ri === 0 && allBold),
    });
  }

  return { type: 'table', rows, hasBorder };
}

// ─── Nesting-Aware XML Element Extraction ─────────────────────────────────────

/**
 * Extract all top-level occurrences of `<tag>...</tag>` from xml,
 * properly handling nested elements of the same tag name.
 */
function extractTopLevelElements(xml: string, tag: string): string[] {
  const results: string[] = [];
  const openPattern = `<${tag}`;
  const closePattern = `</${tag}>`;
  let searchStart = 0;

  while (searchStart < xml.length) {
    const openIdx = xml.indexOf(openPattern, searchStart);
    if (openIdx === -1) break;

    // Make sure this is actually a tag start (followed by space, >, or /)
    const charAfterTag = xml[openIdx + openPattern.length];
    if (charAfterTag && charAfterTag !== ' ' && charAfterTag !== '>' && charAfterTag !== '/' && charAfterTag !== '\n' && charAfterTag !== '\r' && charAfterTag !== '\t') {
      searchStart = openIdx + 1;
      continue;
    }

    // Now find the matching close tag
    let depth = 0;
    let pos = openIdx;
    let foundEnd = -1;

    while (pos < xml.length) {
      const nextOpen = findTagOpen(xml, tag, pos + 1);
      const nextClose = xml.indexOf(closePattern, pos + 1);

      if (nextClose === -1) {
        // No closing tag found — maybe self-closing
        break;
      }

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen;
      } else {
        if (depth === 0) {
          foundEnd = nextClose + closePattern.length;
          break;
        }
        depth--;
        pos = nextClose;
      }
    }

    if (foundEnd > openIdx) {
      results.push(xml.slice(openIdx, foundEnd));
      searchStart = foundEnd;
    } else {
      // Could not find matching close — skip past this open tag
      searchStart = openIdx + openPattern.length;
    }
  }

  return results;
}

/**
 * Find the next actual opening tag for `tag` starting from `startPos`.
 * Must be followed by whitespace, '>', or '/'.
 */
function findTagOpen(xml: string, tag: string, startPos: number): number {
  const pattern = `<${tag}`;
  let pos = startPos;
  while (pos < xml.length) {
    const idx = xml.indexOf(pattern, pos);
    if (idx === -1) return -1;
    const charAfter = xml[idx + pattern.length];
    if (!charAfter || charAfter === ' ' || charAfter === '>' || charAfter === '/' || charAfter === '\n' || charAfter === '\r' || charAfter === '\t') {
      return idx;
    }
    pos = idx + 1;
  }
  return -1;
}

// ─── Main Extractor ───────────────────────────────────────────────────────────

/**
 * Extract structured content from a DOCX file.
 * Returns paragraphs, tables, and headings with full style information.
 */
export async function extractDocxContent(file: File): Promise<DocxContent> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) throw new Error('Invalid DOCX: missing word/document.xml');

  const elements: DocxElement[] = [];
  const paragraphs: DocxParagraph[] = [];

  // Extract the <w:body> content — use greedy match to get full body
  const bodyMatch = docXml.match(/<w:body[^>]*>([\s\S]*)<\/w:body>/);
  const bodyXml = bodyMatch ? bodyMatch[1] : docXml;

  // Extract top-level paragraphs and tables from body in order
  // Strategy: scan for <w:p and <w:tbl at the top level
  let pos = 0;

  while (pos < bodyXml.length) {
    // Find the next <w:p or <w:tbl
    const pIdx = findTagOpen(bodyXml, 'w:p', pos);
    const tIdx = findTagOpen(bodyXml, 'w:tbl', pos);

    // Nothing left
    if (pIdx === -1 && tIdx === -1) break;

    // Also skip <w:sectPr — it's not content
    const sIdx = findTagOpen(bodyXml, 'w:sectPr', pos);

    // Determine which comes first
    let nextTag: 'p' | 'tbl' | 'sect' | null = null;
    let nextIdx = Infinity;

    if (pIdx !== -1 && pIdx < nextIdx) { nextTag = 'p'; nextIdx = pIdx; }
    if (tIdx !== -1 && tIdx < nextIdx) { nextTag = 'tbl'; nextIdx = tIdx; }
    if (sIdx !== -1 && sIdx < nextIdx) { nextTag = 'sect'; nextIdx = sIdx; }

    if (nextTag === null) break;

    if (nextTag === 'sect') {
      // Skip section properties
      const closeTag = '</w:sectPr>';
      const endIdx = bodyXml.indexOf(closeTag, nextIdx);
      pos = endIdx !== -1 ? endIdx + closeTag.length : nextIdx + 1;
      continue;
    }

    if (nextTag === 'tbl') {
      // Extract the full table
      const extracted = extractOneElement(bodyXml, nextIdx, 'w:tbl');
      if (extracted) {
        const table = parseTableXml(extracted.xml);
        if (table.rows.length > 0) {
          elements.push(table);
        }
        pos = extracted.endPos;
      } else {
        pos = nextIdx + 1;
      }
    } else {
      // Extract the paragraph
      const extracted = extractOneElement(bodyXml, nextIdx, 'w:p');
      if (extracted) {
        const para = parseParagraph(extracted.xml);
        // Include even "empty" paragraphs to preserve spacing
        elements.push(para);
        if (para.text.trim()) {
          paragraphs.push(para);
        }
        pos = extracted.endPos;
      } else {
        pos = nextIdx + 1;
      }
    }
  }

  const flatText = paragraphs.map(p => p.text).filter(t => t.trim());

  return { elements, paragraphs, flatText };
}

/**
 * Extract one complete element starting at `startIdx` for the given `tag`.
 * Returns the XML string and the end position, or null if no closing tag found.
 */
function extractOneElement(xml: string, startIdx: number, tag: string): { xml: string; endPos: number } | null {
  const closeTag = `</${tag}>`;

  // Check for self-closing first
  const selfCloseEnd = xml.indexOf('/>', startIdx);
  const openEnd = xml.indexOf('>', startIdx);
  if (selfCloseEnd !== -1 && selfCloseEnd === openEnd - 1) {
    // Self-closing tag
    return { xml: xml.slice(startIdx, selfCloseEnd + 2), endPos: selfCloseEnd + 2 };
  }

  // Find matching close
  let depth = 0;
  let pos = startIdx;
  const openPattern = `<${tag}`;

  while (pos < xml.length) {
    const nextOpen = findTagOpen(xml, tag, pos + 1);
    const nextClose = xml.indexOf(closeTag, pos + 1);

    if (nextClose === -1) return null;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen;
    } else {
      if (depth === 0) {
        const endPos = nextClose + closeTag.length;
        return { xml: xml.slice(startIdx, endPos), endPos };
      }
      depth--;
      pos = nextClose;
    }
  }

  return null;
}

// ─── Utility ───────────────────────────────────────────────────────────────────

export function dominantFontSize(para: DocxParagraph): number {
  if (!para.runs.length) return 24;
  const map = new Map<number, number>();
  for (const r of para.runs) {
    map.set(r.fontSize, (map.get(r.fontSize) ?? 0) + r.text.length);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 24;
}

/** Safe string: strip control characters */
export function safeStr(s: string): string {
  return (s ?? '').replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '');
}
