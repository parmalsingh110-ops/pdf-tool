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
  height: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  // Draw source image to an offscreen canvas to get its ImageData
  const srcCv = document.createElement('canvas');
  srcCv.width = img.width || (img as HTMLCanvasElement).width;
  srcCv.height = img.height || (img as HTMLCanvasElement).height;
  const srcCtx = srcCv.getContext('2d', { willReadFrequently: true })!;
  srcCtx.drawImage(img, 0, 0);
  const srcImgData = srcCtx.getImageData(0, 0, srcCv.width, srcCv.height);
  const srcData = srcImgData.data;

  // Create empty output ImageData
  const dstImgData = ctx.createImageData(canvas.width, canvas.height);
  const dstData = dstImgData.data;

  // Dest bounds
  const dw = canvas.width;
  const dh = canvas.height;
  const sw = srcCv.width;
  const sh = srcCv.height;

  // Perspective Matrix Math
  // We want a matrix M that maps (0,0)->pts[0], (w,0)->pts[1], (w,h)->pts[2], (0,h)->pts[3]
  // Then for each dest pixel (x,y), we transform back to (u,v) = M * (x,y,1)
  const srcPts = [
    { x: 0, y: 0 },
    { x: dw, y: 0 },
    { x: dw, y: dh },
    { x: 0, y: dh },
  ];
  const dstPts = pts; // We are mapping Dst->Src mathematically, so src=Rectangle, dst=Quad bounds
  
  const hMat = getTransformMatrix(srcPts, dstPts);

  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      // Map (x, y) back to source image coordinates (u, v) using homography matrix
      const denom = hMat[6] * x + hMat[7] * y + hMat[8];
      const u = (hMat[0] * x + hMat[1] * y + hMat[2]) / denom;
      const v = (hMat[3] * x + hMat[4] * y + hMat[5]) / denom;

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

        for (let c = 0; c < 3; c++) {
          const val00 = srcData[idx00 + c];
          const val10 = srcData[idx10 + c];
          const val01 = srcData[idx01 + c];
          const val11 = srcData[idx11 + c];

          const top = val00 + (val10 - val00) * ufrac;
          const bot = val01 + (val11 - val01) * ufrac;
          const val = top + (bot - top) * vfrac;

          dstData[(y * dw + x) * 4 + c] = val;
        }
        dstData[(y * dw + x) * 4 + 3] = 255; // Alpha
      } else {
        // Transparent out of bounds
        dstData[(y * dw + x) * 4 + 3] = 0;
      }
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
