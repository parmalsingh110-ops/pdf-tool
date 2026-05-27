import { Document, Paragraph, TextRun, AlignmentType, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle, TabStopType } from 'docx';
import { UniversalLayoutResponse, UniversalLayoutElement } from './advancedVisionEngine';

/**
 * Crop an image region from a canvas given a normalized bbox [ymin, xmin, ymax, xmax] (0-1000).
 */
async function cropImageFromCanvas(canvas: HTMLCanvasElement, bbox: [number, number, number, number]): Promise<{ data: Uint8Array, width: number, height: number } | null> {
  const [ymin, xmin, ymax, xmax] = bbox;
  const x = (xmin / 1000) * canvas.width;
  const y = (ymin / 1000) * canvas.height;
  const w = ((xmax - xmin) / 1000) * canvas.width;
  const h = ((ymax - ymin) / 1000) * canvas.height;

  if (w <= 0 || h <= 0) return null;

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = Math.round(w);
  cropCanvas.height = Math.round(h);
  const ctx = cropCanvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(canvas, x, y, w, h, 0, 0, cropCanvas.width, cropCanvas.height);
  
  const base64 = cropCanvas.toDataURL('image/jpeg', 0.92);
  const base64Data = base64.split(',')[1];
  if (!base64Data) return null;

  const binaryStr = atob(base64Data);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // Scale for docx: target ~550px max width for good quality
  let outW = cropCanvas.width;
  let outH = cropCanvas.height;
  if (outW > 550) {
    const ratio = 550 / outW;
    outW = 550;
    outH = cropCanvas.height * ratio;
  }

  return { data: bytes, width: Math.round(outW), height: Math.round(outH) };
}

/**
 * Capture the entire page as a single full-page image for embedding.
 */
async function captureFullPageImage(canvas: HTMLCanvasElement): Promise<{ data: Uint8Array, width: number, height: number } | null> {
  const base64 = canvas.toDataURL('image/jpeg', 0.88);
  const base64Data = base64.split(',')[1];
  if (!base64Data) return null;

  const binaryStr = atob(base64Data);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // Standard A4 Word page width is about 595pt = ~550px at screen resolution
  const targetW = 550;
  const ratio = targetW / canvas.width;
  const targetH = Math.round(canvas.height * ratio);

  return { data: bytes, width: targetW, height: targetH };
}

function getAlignment(align?: string): AlignmentType {
  switch (align) {
    case 'center': return AlignmentType.CENTER;
    case 'right': return AlignmentType.RIGHT;
    case 'justify': return AlignmentType.JUSTIFY;
    default: return AlignmentType.LEFT;
  }
}

/**
 * Build a Word document from AI-extracted layout data.
 * 
 * Key design decisions:
 * - Elements are grouped into "lines" based on Y-coordinate proximity.
 * - Vertical spacing between lines is calculated from bbox gaps and translated to Word twips.
 * - Side-by-side elements on the same line use TabStops for horizontal positioning.
 * - If layout has no elements (AI failed / scanned without OCR), embed the full page as an image.
 */
export async function buildUniversalDocx(pages: { layout: UniversalLayoutResponse, canvas: HTMLCanvasElement }[]): Promise<Document> {
  const allChildren: any[] = [];

  // A4 page has ~15840 twips of usable height (792pt * 20). We map 1000 bbox units to this.
  // 1 bbox unit ≈ 15.84 twips. We use a multiplier for gap-to-twips conversion.
  const TWIPS_PER_BBOX_UNIT = 14; // Tuned for A4-ish pages

  for (let i = 0; i < pages.length; i++) {
    const { layout, canvas } = pages[i];
    
    // Page break before every page except the first
    if (i > 0) {
      allChildren.push(new Paragraph({ pageBreakBefore: true }));
    }

    // Filter elements that have valid bbox
    const elements = (layout.elements || []).filter(
      (el: any) => el.bbox && Array.isArray(el.bbox) && el.bbox.length === 4
    );

    // If no elements were extracted (AI failed, or scanned page without OCR),
    // embed the entire page as a full-page image so the user doesn't get a blank page.
    if (elements.length === 0) {
      const fullImg = await captureFullPageImage(canvas);
      if (fullImg) {
        allChildren.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              type: 'jpg',
              data: fullImg.data,
              transformation: { width: fullImg.width, height: fullImg.height }
            })
          ]
        }));
      }
      continue;
    }
    
    // Sort all elements top-to-bottom by ymin
    elements.sort((a: any, b: any) => a.bbox[0] - b.bbox[0]);

    // ── Group elements into visual "lines" ──
    // Two elements are on the same line if their ymin values are within 20 units (~2% of page).
    type Line = (typeof elements[0])[];
    const lines: Line[] = [];

    for (const el of elements) {
      if (lines.length === 0) {
        lines.push([el]);
        continue;
      }
      const lastLine = lines[lines.length - 1];
      // Average ymin of elements already on this line
      const avgY = lastLine.reduce((s: number, e: any) => s + e.bbox[0], 0) / lastLine.length;
      const yDiff = Math.abs(el.bbox[0] - avgY);
      
      // Tables always get their own line
      if (el.type === 'table' || lastLine.some((e: any) => e.type === 'table')) {
        lines.push([el]);
      } else if (yDiff < 20) {
        // Same horizontal line
        lastLine.push(el);
      } else {
        lines.push([el]);
      }
    }

    // Sort elements within each line left-to-right by xmin
    for (const line of lines) {
      line.sort((a: any, b: any) => a.bbox[1] - b.bbox[1]);
    }

    let prevLineYMax = -1; // Track bottom of previous line for gap calculation

    for (const line of lines) {
      const lineYMin = Math.min(...line.map((e: any) => e.bbox[0]));
      const lineYMax = Math.max(...line.map((e: any) => e.bbox[2]));
      
      // ── Calculate vertical spacing ──
      let spacingBefore = 0;
      if (prevLineYMax >= 0) {
        const gap = Math.max(0, lineYMin - prevLineYMax);
        spacingBefore = Math.round(gap * TWIPS_PER_BBOX_UNIT);
      }
      prevLineYMax = lineYMax;

      // ── Handle table element ──
      if (line.length === 1 && line[0].type === 'table') {
        const el = line[0];
        if (spacingBefore > 40) {
          allChildren.push(new Paragraph({ spacing: { before: spacingBefore } }));
        }
        
        const tableRows = (el.rows || []).map((row: any) => {
          const cells = row.map((cell: any) => {
            const cellText = typeof cell === 'string' ? cell : (cell.text || '');
            const safeCellText = cellText.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '');
            const isBold = typeof cell === 'object' && cell.bold;
            const cellAlign = typeof cell === 'object' ? getAlignment(cell.alignment) : AlignmentType.LEFT;
            return new TableCell({
              margins: { top: 40, bottom: 40, left: 60, right: 60 },
              borders: el.has_borders === false ? {
                top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              } : undefined,
              children: [
                new Paragraph({
                  alignment: cellAlign,
                  children: [new TextRun({ text: safeCellText, bold: isBold, size: 22 })]
                })
              ]
            });
          });
          return new TableRow({ children: cells });
        });

        if (tableRows.length > 0) {
          const noBorder = el.has_borders === false;
          const borderDef = noBorder ? {
            top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          } : {
            top: { style: BorderStyle.SINGLE, size: 1 },
            bottom: { style: BorderStyle.SINGLE, size: 1 },
            left: { style: BorderStyle.SINGLE, size: 1 },
            right: { style: BorderStyle.SINGLE, size: 1 },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
            insideVertical: { style: BorderStyle.SINGLE, size: 1 },
          };
          allChildren.push(new Table({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: borderDef,
          }));
        }
        continue;
      }

      // ── Handle text/image line ──
      const runs: any[] = [];
      const tabStops: any[] = [];
      
      // Determine alignment: if only one element, use its alignment; if multiple, use LEFT with tabs
      let lineAlignment = getAlignment(line[0].alignment);
      if (line.length > 1) {
        lineAlignment = AlignmentType.LEFT;
      }

      for (let j = 0; j < line.length; j++) {
        const el = line[j];
        const isFirst = j === 0;

        if (el.type === 'image') {
          const imgData = await cropImageFromCanvas(canvas, el.bbox);
          if (imgData) {
            if (!isFirst) {
              // Add a tab to position the image
              tabStops.push({ type: TabStopType.LEFT, position: Math.round(el.bbox[1] * 9.5) });
              runs.push(new TextRun("\t"));
            }
            runs.push(new ImageRun({
              type: 'jpg',
              data: imgData.data,
              transformation: { width: imgData.width, height: imgData.height }
            }));
          }
        } else {
          // Text element
          let prefix = "";
          if (!isFirst) {
            prefix = "\t";
            tabStops.push({ type: TabStopType.LEFT, position: Math.round(el.bbox[1] * 9.5) });
          }
          const safeElText = (el.text || '').replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '');
          runs.push(new TextRun({
            text: prefix + safeElText,
            bold: el.bold,
            italics: el.italic,
            size: (el.font_size || 11) * 2, // half-points
          }));
        }
      }

      if (runs.length > 0) {
        allChildren.push(new Paragraph({
          alignment: lineAlignment,
          spacing: { before: spacingBefore, after: 0 },
          tabStops: tabStops.length > 0 ? tabStops : undefined,
          children: runs,
        }));
      }
    }
  }

  return new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 },
        },
      },
    },
    settings: {
      // Ensure compatibility with older Word versions (prevents corrupt file errors)
      compat: {
        compatibilityMode: 15,  // Word 2013+ compatibility mode
      },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 720, right: 720, bottom: 720, left: 720 } // 0.5 inch margins
        }
      },
      children: allChildren.length > 0 ? allChildren : [new Paragraph({ children: [new TextRun("")] })]
    }]
  });
}
