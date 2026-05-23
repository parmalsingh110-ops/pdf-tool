import { Document, Paragraph, TextRun, AlignmentType, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx';
import { UniversalLayoutResponse, UniversalLayoutElement } from './advancedVisionEngine';

/**
 * Helper to crop an image from a canvas given a normalized bbox [ymin, xmin, ymax, xmax] 0-1000
 */
async function cropImageFromCanvas(canvas: HTMLCanvasElement, bbox: [number, number, number, number]): Promise<{ data: Uint8Array, width: number, height: number } | null> {
  const [ymin, xmin, ymax, xmax] = bbox;
  const x = (xmin / 1000) * canvas.width;
  const y = (ymin / 1000) * canvas.height;
  const w = ((xmax - xmin) / 1000) * canvas.width;
  const h = ((ymax - ymin) / 1000) * canvas.height;

  if (w <= 0 || h <= 0) return null;

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = w;
  cropCanvas.height = h;
  const ctx = cropCanvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
  
  const base64 = cropCanvas.toDataURL('image/jpeg', 0.9);
  const base64Data = base64.split(',')[1];
  if (!base64Data) return null;

  const binaryStr = atob(base64Data);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // Scale down for docx if too large, max width ~600px
  let outW = w;
  let outH = h;
  if (outW > 600) {
    const ratio = 600 / outW;
    outW = 600;
    outH = h * ratio;
  }

  return { data: bytes, width: Math.round(outW), height: Math.round(outH) };
}

function getAlignment(align?: string): AlignmentType {
  switch (align) {
    case 'center': return AlignmentType.CENTER;
    case 'right': return AlignmentType.RIGHT;
    case 'justify': return AlignmentType.JUSTIFY;
    default: return AlignmentType.LEFT;
  }
}

export async function buildUniversalDocx(pages: { layout: UniversalLayoutResponse, canvas: HTMLCanvasElement }[]): Promise<Document> {
  const allChildren: any[] = [];

  for (let i = 0; i < pages.length; i++) {
    const { layout, canvas } = pages[i];
    
    // Add page break if not first page
    if (i > 0) {
      allChildren.push(new Paragraph({ pageBreakBefore: true }));
    }

    for (const el of layout.elements || []) {
      if (el.type === 'text') {
        const p = new Paragraph({
          alignment: getAlignment(el.alignment),
          spacing: { after: 120 },
          children: [
            new TextRun({
              text: el.text || '',
              bold: el.bold,
              italics: el.italic,
              size: (el.font_size || 12) * 2 // docx size is in half-points
            })
          ]
        });
        allChildren.push(p);
      } 
      else if (el.type === 'image' && el.bbox) {
        const imgData = await cropImageFromCanvas(canvas, el.bbox);
        if (imgData) {
          const p = new Paragraph({
            alignment: getAlignment(el.alignment || 'center'),
            spacing: { after: 200, before: 100 },
            children: [
              new ImageRun({
                data: imgData.data,
                transformation: { width: imgData.width, height: imgData.height }
              })
            ]
          });
          allChildren.push(p);
        }
      }
      else if (el.type === 'table' && el.rows && el.rows.length > 0) {
        const tableRows = el.rows.map(row => {
          const cells = row.map(cell => {
            const cellText = typeof cell === 'string' ? cell : (cell.text || '');
            const isBold = typeof cell === 'object' && cell.bold;
            return new TableCell({
              margins: { top: 100, bottom: 100, left: 100, right: 100 },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: cellText, bold: isBold, size: 24 })]
                })
              ]
            });
          });
          return new TableRow({ children: cells });
        });

        const table = new Table({
          rows: tableRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1 },
            bottom: { style: BorderStyle.SINGLE, size: 1 },
            left: { style: BorderStyle.SINGLE, size: 1 },
            right: { style: BorderStyle.SINGLE, size: 1 },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
            insideVertical: { style: BorderStyle.SINGLE, size: 1 },
          }
        });
        allChildren.push(table);
        allChildren.push(new Paragraph({ spacing: { after: 200 } })); // space after table
      }
    }
  }

  return new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 }
        }
      },
      children: allChildren
    }]
  });
}
