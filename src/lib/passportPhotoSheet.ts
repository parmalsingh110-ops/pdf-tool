import { PDFDocument } from 'pdf-lib';

/** India-style passport photo aspect (35 × 45 mm). */
export const PASSPORT_ASPECT = 35 / 45;

export const MM_TO_PT = 72 / 25.4;

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Bounding box of foreground from segmentation mask (MediaPipe selfie: person ≈ high alpha). */
export function maskToPersonBBox(imageData: ImageData, iw: number, ih: number): { x0: number; y0: number; x1: number; y1: number } | null {
  const { data, width, height } = imageData;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let found = false;
  const stride = Math.max(1, Math.floor(Math.max(width, height) / 400));

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const person = a > 25 && lum > 35 && lum < 250;
      if (person) {
        found = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!found) return null;

  const sx = iw / width;
  const sy = ih / height;
  return {
    x0: minX * sx,
    y0: minY * sy,
    x1: (maxX + 1) * sx,
    y1: (maxY + 1) * sy,
  };
}

export function centerAspectCrop(nw: number, nh: number, aspect: number): { x: number; y: number; w: number; h: number } {
  let h = nh * 0.92;
  let w = h * aspect;
  if (w > nw * 0.98) {
    w = nw * 0.98;
    h = w / aspect;
  }
  return { x: (nw - w) / 2, y: (nh - h) / 2, w, h };
}

/** Suggest portrait crop around person box (image pixel coords). */
export function suggestCropFromPerson(
  nw: number,
  nh: number,
  bbox: { x0: number; y0: number; x1: number; y1: number } | null,
  aspect: number,
): { x: number; y: number; w: number; h: number } {
  if (!bbox || bbox.x1 - bbox.x0 < 4 || bbox.y1 - bbox.y0 < 4) {
    return centerAspectCrop(nw, nh, aspect);
  }

  const pw = bbox.x1 - bbox.x0;
  const ph = bbox.y1 - bbox.y0;
  const cx = (bbox.x0 + bbox.x1) / 2;
  const cy = (bbox.y0 + bbox.y1) / 2;

  let h = ph * 1.58;
  let w = h * aspect;
  if (w > nw) {
    w = nw;
    h = w / aspect;
  }
  if (h > nh) {
    h = nh;
    w = h * aspect;
  }

  let x = cx - w / 2;
  let y = cy - h * 0.4;

  x = clamp(x, 0, Math.max(0, nw - w));
  y = clamp(y, 0, Math.max(0, nh - h));

  if (x + w > nw) x = nw - w;
  if (y + h > nh) y = nh - h;

  return { x, y, w, h };
}

export function clampCropRect(
  crop: { x: number; y: number; w: number; h: number },
  nw: number,
  nh: number,
  aspect: number,
): { x: number; y: number; w: number; h: number } {
  let { x, y, w, h } = crop;
  h = clamp(h, 32, nh);
  w = h * aspect;
  if (w > nw) {
    w = nw;
    h = w / aspect;
  }
  x = clamp(x, 0, Math.max(0, nw - w));
  y = clamp(y, 0, Math.max(0, nh - h));
  return { x, y, w, h };
}

export type SheetPageSize = 'a4' | 'letter';

const PAGE_PT: Record<SheetPageSize, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

export async function buildPassportGridPdf(options: {
  tilePng: Uint8Array;
  totalCount: number;
  columns: number;
  photoWidthMm: number;
  photoHeightMm: number;
  gapMm: number;
  marginMm: number;
  pageSize: SheetPageSize;
}): Promise<Uint8Array> {
  const { tilePng, totalCount, columns, photoWidthMm, photoHeightMm, gapMm, marginMm, pageSize } = options;
  const [pageW, pageH] = PAGE_PT[pageSize];
  const marginPt = marginMm * MM_TO_PT;
  const gapPt = gapMm * MM_TO_PT;
  const photoW = photoWidthMm * MM_TO_PT;
  const photoH = photoHeightMm * MM_TO_PT;

  const cellW = photoW + gapPt;
  const cellH = photoH + gapPt;
  const usableH = pageH - 2 * marginPt;
  const maxRows = Math.max(1, Math.floor((usableH + gapPt) / cellH));
  const perPage = columns * maxRows;

  const pdf = await PDFDocument.create();
  const embedded = await pdf.embedPng(tilePng);

  let remaining = totalCount;

  const colRow = (i: number) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    return { col, row };
  };

  while (remaining > 0) {
    const page = pdf.addPage([pageW, pageH]);
    const nThisPage = Math.min(remaining, perPage);

    for (let i = 0; i < nThisPage; i++) {
      const { col, row } = colRow(i);
      const px = marginPt + col * cellW;
      const py = pageH - marginPt - (row + 1) * photoH - row * gapPt;
      page.drawImage(embedded, { x: px, y: py, width: photoW, height: photoH });
    }

    remaining -= nThisPage;
  }

  return pdf.save();
}
