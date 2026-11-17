import JSZip from 'jszip';
import { toArrayBufferBytes } from './blobUrl';
import { downloadBlob } from './utils';

export interface XlsxWriteSheet {
  name: string;
  rows: (string | number | boolean | null | undefined)[][];
  colWidths?: number[];
}

export interface ParsedExcelCell {
  text: string;
  align: 'left' | 'center' | 'right';
  bold: boolean;
  italic: boolean;
  fontSize?: number;
}

export interface ParsedExcelSheet {
  name: string;
  nRows: number;
  nCols: number;
  merges: { s: { r: number; c: number }; e: { r: number; c: number } }[];
  colWidths: number[]; // characters (Excel wch)
  rowHeights: number[]; // points (0 = auto)
  cells: Map<string, ParsedExcelCell>; // "r,c" (0-indexed)
  rowsAsStrings: string[][];
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function escXml(s: string): string {
  return String(s ?? '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colIndexToLetters(idx0: number): string {
  let n = idx0 + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function colLettersToIndex(letters: string): number {
  let acc = 0;
  for (let i = 0; i < letters.length; i++) {
    acc = acc * 26 + (letters.charCodeAt(i) - 64);
  }
  return Math.max(0, acc - 1);
}

function parseCellRef(ref: string): { r: number; c: number } | null {
  const m = /^([A-Z]+)(\d+)$/i.exec((ref || '').trim());
  if (!m) return null;
  return {
    c: colLettersToIndex(m[1].toUpperCase()),
    r: Math.max(0, Number(m[2]) - 1),
  };
}

function sanitizeSheetName(raw: string, usedNames: Set<string>, fallbackIndex: number): string {
  let base = String(raw || `Sheet${fallbackIndex + 1}`)
    .replace(/[:\\/?*[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31);
  if (!base) base = `Sheet${fallbackIndex + 1}`;
  let candidate = base;
  let n = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    const suffix = `_${n++}`;
    candidate = base.slice(0, Math.max(1, 31 - suffix.length)) + suffix;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

/** Generate a standards-compliant OOXML (.xlsx) Blob cleanly without SheetJS/xlsx CVE risk. */
export async function buildXlsxBlob(sheetsInput: XlsxWriteSheet[]): Promise<Blob> {
  const sheets = sheetsInput.length > 0 ? sheetsInput : [{ name: 'Sheet1', rows: [['No content']] }];
  const zip = new JSZip();
  const usedNames = new Set<string>();
  const finalNames = sheets.map((s, idx) => sanitizeSheetName(s.name, usedNames, idx));

  const contentTypesOverrides = finalNames
    .map((_, idx) => `<Override PartName="/xl/worksheets/sheet${idx + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join('');

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      contentTypesOverrides +
      `</Types>`
  );

  zip.folder('_rels')?.file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`
  );

  const xlFolder = zip.folder('xl')!;
  const sheetXmlTags = finalNames
    .map((nm, idx) => `<sheet name="${escXml(nm)}" sheetId="${idx + 1}" r:id="rId${idx + 1}"/>`)
    .join('');
  xlFolder.file(
    'workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets>${sheetXmlTags}</sheets></workbook>`
  );

  const relTags =
    finalNames
      .map(
        (_, idx) =>
          `<Relationship Id="rId${idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${idx + 1}.xml"/>`
      )
      .join('') +
    `<Relationship Id="rId${finalNames.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
  xlFolder.folder('_rels')?.file(
    'workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relTags}</Relationships>`
  );

  xlFolder.file(
    'styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
      `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
      `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="2">` +
      `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
      `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
      `</cellXfs>` +
      `</styleSheet>`
  );

  const wsFolder = xlFolder.folder('worksheets')!;
  sheets.forEach((sheet, sIdx) => {
    const rows = sheet.rows.length > 0 ? sheet.rows : [['']];
    const maxCols = Math.max(1, ...rows.map((r) => r.length));
    const colWidths = sheet.colWidths || [];
    const colsXml = `<cols>${Array.from({ length: maxCols }, (_, c) => {
      const w = Math.max(8, Math.min(65, colWidths[c] ?? 18));
      return `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`;
    }).join('')}</cols>`;

    const rowsXml = rows
      .map((row, rIdx) => {
        const styleAttr = rIdx === 0 && rows.length > 1 ? ' s="1"' : '';
        const cellsXml = row
          .map((rawVal, cIdx) => {
            const ref = `${colIndexToLetters(cIdx)}${rIdx + 1}`;
            if (rawVal === null || rawVal === undefined || rawVal === '') {
              return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t></t></is></c>`;
            }
            if (typeof rawVal === 'number' && Number.isFinite(rawVal)) {
              return `<c r="${ref}"${styleAttr}><v>${rawVal}</v></c>`;
            }
            if (typeof rawVal === 'boolean') {
              return `<c r="${ref}"${styleAttr} t="b"><v>${rawVal ? 1 : 0}</v></c>`;
            }
            const strVal = String(rawVal);
            return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${escXml(strVal)}</t></is></c>`;
          })
          .join('');
        return `<row r="${rIdx + 1}">${cellsXml}</row>`;
      })
      .join('');

    wsFolder.file(
      `sheet${sIdx + 1}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `${colsXml}<sheetData>${rowsXml}</sheetData></worksheet>`
    );
  });

  const outBytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return new Blob([toArrayBufferBytes(outBytes)], { type: XLSX_MIME });
}

export async function downloadXlsxFile(sheets: XlsxWriteSheet[], fileName: string): Promise<void> {
  const blob = await buildXlsxBlob(sheets);
  downloadBlob(blob, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}

function parseXmlDoc(xmlStr: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(xmlStr, 'text/xml');
}

function resolveZipPath(zip: JSZip, target: string): JSZip.JSZipObject | null {
  const clean = target.replace(/^\/+/, '');
  return zip.file(clean) || zip.file(`xl/${clean.replace(/^xl\//, '')}`) || null;
}

/** Safely parses an uploaded .xlsx workbook in browser using JSZip + DOMParser (Prototype-Pollution & ReDoS free). */
export async function parseXlsxWorkbook(buffer: ArrayBuffer): Promise<ParsedExcelSheet[]> {
  const zip = await JSZip.loadAsync(buffer);

  // Zip-bomb guard on browser XML entries
  let xmlTotalBytes = 0;
  for (const [, entry] of Object.entries(zip.files)) {
    if (!entry.dir && entry.name.endsWith('.xml')) {
      const uncompressed = (entry as any)._data?.uncompressedSize;
      if (typeof uncompressed === 'number' && uncompressed > 50 * 1024 * 1024) {
        throw new Error('Spreadsheet XML exceeds safe memory limit.');
      }
      xmlTotalBytes += typeof uncompressed === 'number' ? uncompressed : 0;
      if (xmlTotalBytes > 120 * 1024 * 1024) {
        throw new Error('Spreadsheet decompression size exceeds safe limit.');
      }
    }
  }

  // 1. Shared Strings Table
  const sharedStrings: string[] = [];
  const ssFile = zip.file('xl/sharedStrings.xml');
  if (ssFile) {
    const ssDoc = parseXmlDoc(await ssFile.async('string'));
    const siNodes = ssDoc.getElementsByTagName('si');
    for (let i = 0; i < siNodes.length; i++) {
      const tNodes = siNodes[i].getElementsByTagName('t');
      let combined = '';
      for (let j = 0; j < tNodes.length; j++) {
        combined += tNodes[j].textContent || '';
      }
      sharedStrings.push(combined);
    }
  }

  // 2. Styles (fonts + horizontal alignment)
  interface FontStyle { bold: boolean; italic: boolean; fontSize?: number }
  interface XfStyle { bold: boolean; italic: boolean; fontSize?: number; align: 'left' | 'center' | 'right' }
  const fonts: FontStyle[] = [];
  const xfs: XfStyle[] = [];
  const stylesFile = zip.file('xl/styles.xml');
  if (stylesFile) {
    const stDoc = parseXmlDoc(await stylesFile.async('string'));
    const fontsRoot = stDoc.getElementsByTagName('fonts')[0];
    if (fontsRoot) {
      const fNodes = fontsRoot.getElementsByTagName('font');
      for (let i = 0; i < fNodes.length; i++) {
        const fEl = fNodes[i];
        const bEls = fEl.getElementsByTagName('b');
        const bold = bEls.length > 0 && bEls[0].getAttribute('val') !== '0';
        const iEls = fEl.getElementsByTagName('i');
        const italic = iEls.length > 0 && iEls[0].getAttribute('val') !== '0';
        const szEl = fEl.getElementsByTagName('sz')[0];
        const szVal = szEl ? Number(szEl.getAttribute('val')) : NaN;
        fonts.push({ bold, italic, fontSize: Number.isFinite(szVal) ? szVal : undefined });
      }
    }
    const cellXfsRoot = stDoc.getElementsByTagName('cellXfs')[0];
    if (cellXfsRoot) {
      const xfNodes = cellXfsRoot.getElementsByTagName('xf');
      for (let i = 0; i < xfNodes.length; i++) {
        const xf = xfNodes[i];
        const fontId = Number(xf.getAttribute('fontId') || '0');
        const fStyle = fonts[fontId] || { bold: false, italic: false };
        const alignEl = xf.getElementsByTagName('alignment')[0];
        const horiz = alignEl?.getAttribute('horizontal') || '';
        const align: XfStyle['align'] =
          horiz === 'center' || horiz === 'centerContinuous'
            ? 'center'
            : horiz === 'right'
            ? 'right'
            : 'left';
        xfs.push({
          bold: fStyle.bold,
          italic: fStyle.italic,
          fontSize: fStyle.fontSize,
          align,
        });
      }
    }
  }

  // 3. Workbook Sheet Definitions + Relationship Map
  const relMap = new Map<string, string>();
  const wbRelsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (wbRelsFile) {
    const rDoc = parseXmlDoc(await wbRelsFile.async('string'));
    const rels = rDoc.getElementsByTagName('Relationship');
    for (let i = 0; i < rels.length; i++) {
      const id = rels[i].getAttribute('Id');
      const target = rels[i].getAttribute('Target');
      if (id && target) relMap.set(id, target);
    }
  }

  const sheetDefs: { name: string; target: string }[] = [];
  const wbFile = zip.file('xl/workbook.xml');
  if (wbFile) {
    const wbDoc = parseXmlDoc(await wbFile.async('string'));
    const sEls = wbDoc.getElementsByTagName('sheet');
    for (let i = 0; i < sEls.length; i++) {
      const name = sEls[i].getAttribute('name') || `Sheet${i + 1}`;
      const rId = sEls[i].getAttribute('r:id') || sEls[i].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || '';
      const target = relMap.get(rId) || `worksheets/sheet${i + 1}.xml`;
      sheetDefs.push({ name, target });
    }
  }

  const outSheets: ParsedExcelSheet[] = [];
  for (const sDef of sheetDefs) {
    const wsZipObj = resolveZipPath(zip, sDef.target);
    if (!wsZipObj) continue;
    const wsDoc = parseXmlDoc(await wsZipObj.async('string'));

    const merges: ParsedExcelSheet['merges'] = [];
    const mergeEls = wsDoc.getElementsByTagName('mergeCell');
    for (let i = 0; i < mergeEls.length; i++) {
      const refStr = mergeEls[i].getAttribute('ref') || '';
      const [a, b] = refStr.split(':');
      const start = parseCellRef(a);
      const end = parseCellRef(b);
      if (start && end) {
        merges.push({ s: start, e: end });
      }
    }

    const colWidthMap = new Map<number, number>();
    const colEls = wsDoc.getElementsByTagName('col');
    for (let i = 0; i < colEls.length; i++) {
      const cMin = Math.max(1, Number(colEls[i].getAttribute('min') || '1'));
      const cMax = Math.max(cMin, Number(colEls[i].getAttribute('max') || String(cMin)));
      const wVal = Number(colEls[i].getAttribute('width') || '8.43');
      for (let c = cMin; c <= Math.min(cMax, cMin + 200); c++) {
        colWidthMap.set(c - 1, Number.isFinite(wVal) && wVal > 0 ? wVal : 8.43);
      }
    }

    const rowHeightMap = new Map<number, number>();
    const cells = new Map<string, ParsedExcelCell>();
    let maxRowIdx = 0;
    let maxColIdx = 0;

    const rowEls = wsDoc.getElementsByTagName('row');
    for (let i = 0; i < rowEls.length; i++) {
      const rNumAttr = rowEls[i].getAttribute('r');
      const rIdxFallback = i;
      const rIdx = rNumAttr ? Math.max(0, Number(rNumAttr) - 1) : rIdxFallback;
      const htAttr = Number(rowEls[i].getAttribute('ht') || '0');
      if (Number.isFinite(htAttr) && htAttr > 0) rowHeightMap.set(rIdx, htAttr);

      const cEls = rowEls[i].getElementsByTagName('c');
      for (let j = 0; j < cEls.length; j++) {
        const cEl = cEls[j];
        const refAttr = cEl.getAttribute('r') || '';
        const parsed = parseCellRef(refAttr) || { r: rIdx, c: j };
        maxRowIdx = Math.max(maxRowIdx, parsed.r);
        maxColIdx = Math.max(maxColIdx, parsed.c);

        const cellType = cEl.getAttribute('t') || '';
        const sAttr = cEl.getAttribute('s');
        const xf = sAttr !== null ? xfs[Number(sAttr)] : undefined;

        let text = '';
        if (cellType === 'inlineStr') {
          const tNodes = cEl.getElementsByTagName('t');
          for (let k = 0; k < tNodes.length; k++) text += tNodes[k].textContent || '';
        } else {
          const vEl = cEl.getElementsByTagName('v')[0];
          const rawV = vEl?.textContent ?? '';
          if (cellType === 's') {
            text = sharedStrings[Number(rawV)] ?? '';
          } else if (cellType === 'b') {
            text = rawV === '1' ? 'TRUE' : 'FALSE';
          } else {
            text = rawV;
          }
        }

        cells.set(`${parsed.r},${parsed.c}`, {
          text,
          align: xf?.align || 'left',
          bold: Boolean(xf?.bold),
          italic: Boolean(xf?.italic),
          fontSize: xf?.fontSize,
        });
      }
    }

    const nRows = cells.size > 0 ? maxRowIdx + 1 : 0;
    const nCols = cells.size > 0 ? maxColIdx + 1 : 0;
    if (!nRows || !nCols) continue;

    const colWidths = Array.from({ length: nCols }, (_, c) => colWidthMap.get(c) ?? 8.43);
    const rowHeights = Array.from({ length: nRows }, (_, r) => rowHeightMap.get(r) ?? 0);
    const rowsAsStrings: string[][] = [];
    for (let r = 0; r < nRows; r++) {
      const rowArr: string[] = [];
      for (let c = 0; c < nCols; c++) {
        rowArr.push(cells.get(`${r},${c}`)?.text ?? '');
      }
      rowsAsStrings.push(rowArr);
    }

    outSheets.push({
      name: sDef.name,
      nRows,
      nCols,
      merges,
      colWidths,
      rowHeights,
      cells,
      rowsAsStrings,
    });
  }

  return outSheets;
}
