/**
 * perspectiveWarp.ts
 * Pure JS implementation of a 4-point perspective warp for Document Scanner.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Perform a 4-point perspective warp from a source image onto a new canvas.
 * It maps the quadrilateral defined by `pts` onto a rectangle of `width` x `height`.
 * @param img Image or Canvas source
 * @param pts Four corner points [TL, TR, BR, BL]
 * @param width Output width
 * @param height Output height
 */
export function wrapPerspective(
  img: HTMLImageElement | HTMLCanvasElement,
  pts: [Point, Point, Point, Point],
  width: number,
  height: number,
  maxDim = 2048
): HTMLCanvasElement {
  // Cap max output dimension to prevent CPU lockup on 12-48MP smartphone photos
  const currentMax = Math.max(width, height);
  const outScale = currentMax > maxDim ? maxDim / currentMax : 1.0;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * outScale));
  canvas.height = Math.max(1, Math.round(height * outScale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  // Source image bounds - cap source to max 2400px for huge camera photos
  const rawW = img.width || (img as HTMLCanvasElement).width;
  const rawH = img.height || (img as HTMLCanvasElement).height;
  const srcMax = Math.max(rawW, rawH);
  const srcScale = srcMax > 2400 ? 2400 / srcMax : 1.0;

  const srcCv = document.createElement('canvas');
  srcCv.width = Math.max(1, Math.round(rawW * srcScale));
  srcCv.height = Math.max(1, Math.round(rawH * srcScale));
  const srcCtx = srcCv.getContext('2d', { willReadFrequently: true })!;
  srcCtx.drawImage(img, 0, 0, srcCv.width, srcCv.height);
  const srcImgData = srcCtx.getImageData(0, 0, srcCv.width, srcCv.height);
  const srcData = srcImgData.data;

  // Create empty output ImageData
  const dstImgData = ctx.createImageData(canvas.width, canvas.height);
  const dstData = dstImgData.data;

  // Dest and source bounds
  const dw = canvas.width;
  const dh = canvas.height;
  const sw = srcCv.width;
  const sh = srcCv.height;

  // Scale destination quad coordinates to match srcCv scaling
  const scaledDstPts: [Point, Point, Point, Point] = [
    { x: pts[0].x * srcScale, y: pts[0].y * srcScale },
    { x: pts[1].x * srcScale, y: pts[1].y * srcScale },
    { x: pts[2].x * srcScale, y: pts[2].y * srcScale },
    { x: pts[3].x * srcScale, y: pts[3].y * srcScale },
  ];

  // Perspective Matrix Math
  const srcPts = [
    { x: 0, y: 0 },
    { x: dw, y: 0 },
    { x: dw, y: dh },
    { x: 0, y: dh },
  ];
  
  const hMat = getTransformMatrix(srcPts, scaledDstPts);

  for (let y = 0; y < dh; y++) {
    // Hoist y-invariant terms out of inner loop
    const h01y2 = hMat[1] * y + hMat[2];
    const h34y5 = hMat[4] * y + hMat[5];
    const h67y8 = hMat[7] * y + hMat[8];
    let dstIdx = y * dw * 4;

    for (let x = 0; x < dw; x++) {
      const denom = hMat[6] * x + h67y8;
      const invDenom = denom !== 0 ? 1.0 / denom : 0;
      const u = (hMat[0] * x + h01y2) * invDenom;
      const v = (hMat[3] * x + h34y5) * invDenom;

      // Bilinear interpolation
      const ui = Math.floor(u);
      const vi = Math.floor(v);

      if (ui >= 0 && ui < sw - 1 && vi >= 0 && vi < sh - 1) {
        const ufrac = u - ui;
        const vfrac = v - vi;

        const idx00 = (vi * sw + ui) * 4;
        const idx10 = idx00 + 4;
        const idx01 = ((vi + 1) * sw + ui) * 4;
        const idx11 = idx01 + 4;

        const ufrac1 = 1 - ufrac;
        const vfrac1 = 1 - vfrac;

        const w00 = ufrac1 * vfrac1;
        const w10 = ufrac * vfrac1;
        const w01 = ufrac1 * vfrac;
        const w11 = ufrac * vfrac;

        dstData[dstIdx] = srcData[idx00] * w00 + srcData[idx10] * w10 + srcData[idx01] * w01 + srcData[idx11] * w11;
        dstData[dstIdx + 1] = srcData[idx00 + 1] * w00 + srcData[idx10 + 1] * w10 + srcData[idx01 + 1] * w01 + srcData[idx11 + 1] * w11;
        dstData[dstIdx + 2] = srcData[idx00 + 2] * w00 + srcData[idx10 + 2] * w10 + srcData[idx01 + 2] * w01 + srcData[idx11 + 2] * w11;
        dstData[dstIdx + 3] = 255;
      } else {
        dstData[dstIdx + 3] = 0;
      }
      dstIdx += 4;
    }
  }

  ctx.putImageData(dstImgData, 0, 0);
  return canvas;
}

// Helper: Get perspective transform matrix from 4 src and 4 dst points
function getTransformMatrix(s: Point[], d: Point[]) {
  const a = [
    [s[0].x, s[0].y, 1, 0, 0, 0, -s[0].x * d[0].x, -s[0].y * d[0].x],
    [0, 0, 0, s[0].x, s[0].y, 1, -s[0].x * d[0].y, -s[0].y * d[0].y],
    [s[1].x, s[1].y, 1, 0, 0, 0, -s[1].x * d[1].x, -s[1].y * d[1].x],
    [0, 0, 0, s[1].x, s[1].y, 1, -s[1].x * d[1].y, -s[1].y * d[1].y],
    [s[2].x, s[2].y, 1, 0, 0, 0, -s[2].x * d[2].x, -s[2].y * d[2].x],
    [0, 0, 0, s[2].x, s[2].y, 1, -s[2].x * d[2].y, -s[2].y * d[2].y],
    [s[3].x, s[3].y, 1, 0, 0, 0, -s[3].x * d[3].x, -s[3].y * d[3].x],
    [0, 0, 0, s[3].x, s[3].y, 1, -s[3].x * d[3].y, -s[3].y * d[3].y],
  ];
  const b = [d[0].x, d[0].y, d[1].x, d[1].y, d[2].x, d[2].y, d[3].x, d[3].y];
  
  // Gaussian elimination
  const res = solveLinearSystem(a, b);
  res.push(1);
  return res;
}

function solveLinearSystem(A: number[][], B: number[]) {
  const n = A.length;
  for (let i = 0; i < n; i++) A[i].push(B[i]);
  for (let i = 0; i < n; i++) {
    let maxEl = Math.abs(A[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > maxEl) { maxEl = Math.abs(A[k][i]); maxRow = k; }
    }
    for (let k = i; k < n + 1; k++) {
      const tmp = A[maxRow][k];
      A[maxRow][k] = A[i][k];
      A[i][k] = tmp;
    }
    for (let k = i + 1; k < n; k++) {
      const c = -A[k][i] / A[i][i];
      for (let j = i; j < n + 1; j++) {
        if (i === j) A[k][j] = 0;
        else A[k][j] += c * A[i][j];
      }
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i > -1; i--) {
    x[i] = A[i][n] / A[i][i];
    for (let k = i - 1; k > -1; k--) {
      A[k][n] -= A[k][i] * x[i];
    }
  }
  return x;
}
