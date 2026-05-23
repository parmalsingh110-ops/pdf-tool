import { Document, Paragraph, TextRun, AlignmentType, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle, TabStopType, TabStopPosition } from 'docx';
import { UniversalLayoutResponse } from './advancedVisionEngine';

export interface UniversalLayoutElement {
  type: 'text' | 'image' | 'table';
  text?: string;
  font_size?: number;
  bold?: boolean;
  italic?: boolean;
  alignment?: 'left' | 'center' | 'right' | 'justify';
  description?: string;
  bbox?: [number, number, number, number];
  rows?: any[][];
  has_borders?: boolean;
}
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
      else if (el.type === 'row') {
        const p = new Paragraph({
          tabStops: [
            { type: TabStopType.RIGHT, position: 9000 }
          ],
          spacing: { after: 120 },
          children: [
            new TextRun({
              text: el.left_text || '',
              bold: el.bold,
              size: (el.font_size || 12) * 2
            }),
            new TextRun({
              text: "\t" + (el.right_text || ''),
              bold: el.bold,
              size: (el.font_size || 12) * 2
            })
          ]
        });
        allChildren.push(p);
      }
      else if (el.type === 'table' && el.rows && el.rows.length > 0) {
        const tableRows = el.rows.map(row => {
          const cells = row.map(cell => {
            const cellText = typeof cell === 'string' ? cell : (cell.text || '');
            const isBold = typeof cell === 'object' && cell.bold;
            const align = typeof cell === 'object' ? getAlignment(cell.alignment) : AlignmentType.LEFT;
            return new TableCell({
              margins: { top: 50, bottom: 50, left: 50, right: 50 },
              borders: el.has_borders === false ? {
                top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              } : undefined,
              children: [
                new Paragraph({
                  alignment: align,
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
          borders: el.has_borders === false ? {
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
