/**
 * Pro Document, Xerox, Ink-Saver, Color & Deskew Image Processing Engine
 * 100% client-side, zero external deps, uses Summed-Area Tables (Integral Images)
 * for O(1)-per-pixel local illumination normalization & Sauvola adaptive binarization.
 */

export interface InkMetrics {
  cyanPct: number;
  magentaPct: number;
  yellowPct: number;
  blackPct: number;
  totalCoveragePct: number; // Average TAC across page (0-400%)
  maxTacPct: number; // Peak pixel TAC (0-400%)
  inkScore: number; // Weighted toner/ink usage index (0-100)
}

export interface InkComparison {
  before: InkMetrics;
  after: InkMetrics;
  savedPercent: number; // Real measured % ink reduction (0-98)
  rupeesSavedPer100Pages: number; // Estimated INR saved per 100 prints
}

export type XeroxCleanMode =
  | 'pro_xerox'
  | 'magic_color'
  | 'toner_saver'
  | 'photo_gray'
  | 'faded_rescue';

export interface XeroxOptions {
  mode: XeroxCleanMode;
  shadowRemoval: number; // 0-100 (local background division strength)
  bleachThreshold: number; // 120-240 (paper white sensitivity)
  textDarkness: number; // 0-100 (stroke darkness boost)
  sharpen: number; // 0-100 (unsharp mask text clarity)
  despeckle: boolean; // remove 1px scanner/xerox dust
}

export type InkSaverMode =
  | 'smart_auto'
  | 'invert_dark'
  | 'eco_toner'
  | 'clean_scanned'
  | 'replace_color';

export interface InkSaverOptions {
  mode: InkSaverMode;
  ecoStrength: number; // 15-75 (% fill reduction intensity)
  lumaThreshold: number; // 60-200 (dark slide background threshold)
  preservePhotos: boolean; // avoid inverting embedded photos/charts
  forceMonochrome: boolean; // convert color to K-only gray (0% color ink)
  stripShadedBoxes: boolean; // bleach light pastel fill boxes/headers
  hollowThickFills: boolean; // edge-preserving solid fill lightening
  sourceColorHex: string; // for replace_color mode
  targetBgHex: string; // for replace_color mode
  colorTolerance: number; // 10-160 Euclidean RGB distance
}

export type GrayscaleProMode =
  | 'smooth'
  | 'adaptive_photocopy'
  | 'halftone_dither'
  | 'eco_draft';

export type GrayChannelMix = 'rec709' | 'drop_red' | 'boost_blue' | 'high_green';

export interface GrayscaleProOptions {
  mode: GrayscaleProMode;
  channelMix: GrayChannelMix;
  contrast: number; // -50 to +50
  brightness: number; // -50 to +50
  threshold: number; // 60 to 220
  shadowRemoval: number; // 0 to 100
}

export type DarkModeTheme =
  | 'smart_oled'
  | 'pure_oled'
  | 'sepia'
  | 'solarized'
  | 'emerald_night'
  | 'high_contrast'
  | 'classic';

export interface DarkModeOptions {
  theme: DarkModeTheme;
  preservePhotos: boolean;
  contrast: number; // -30 to +30
  brightness: number; // -30 to +30
}

export type BoardCleanMode =
  | 'whiteboard_deglare'
  | 'blackboard_invert'
  | 'color_markers'
  | 'pure_bw';

export interface BoardCleanOptions {
  mode: BoardCleanMode;
  glareRemoval: number; // 0-100
  markerBoost: number; // 0-100
  sharpen: number; // 0-100
}

export type DenoiseMode = 'bilateral' | 'median' | 'gaussian';

// ─── Core Math Helpers ──────────────────────────────────────────────────────

function clampByte(v: number): number {
  return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) return { r: 255, g: 255, b: 255 };
  const n = parseInt(clean, 16);
  if (Number.isNaN(n)) return { r: 255, g: 255, b: 255 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) * 0.5;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = clampByte(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [
    clampByte(hue2rgb(h + 1 / 3) * 255),
    clampByte(hue2rgb(h) * 255),
    clampByte(hue2rgb(h - 1 / 3) * 255),
  ];
}

// ─── Integral Image (Summed-Area Table) ─────────────────────────────────────

function buildIntegral1D(
  values: Uint8Array,
  width: number,
  height: number,
  withSq = false
): { sum: Float64Array; sumSq?: Float64Array } {
  const stride = width + 1;
  const sum = new Float64Array(stride * (height + 1));
  const sumSq = withSq ? new Float64Array(stride * (height + 1)) : undefined;

  for (let y = 1; y <= height; y++) {
    let rowSum = 0;
    let rowSq = 0;
    const srcRow = (y - 1) * width;
    const dstRow = y * stride;
    const prevRow = (y - 1) * stride;
    for (let x = 1; x <= width; x++) {
      const v = values[srcRow + (x - 1)];
      rowSum += v;
      sum[dstRow + x] = sum[prevRow + x] + rowSum;
      if (sumSq) {
        rowSq += v * v;
        sumSq[dstRow + x] = sumSq[prevRow + x] + rowSq;
      }
    }
  }
  return { sum, sumSq };
}

function boxMeanFromIntegral(
  integral: Float64Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number
): number {
  const stride = width + 1;
  const x0 = x - radius < 0 ? 0 : x - radius;
  const y0 = y - radius < 0 ? 0 : y - radius;
  const x1 = x + radius + 1 > width ? width : x + radius + 1;
  const y1 = y + radius + 1 > height ? height : y + radius + 1;
  const area = (x1 - x0) * (y1 - y0);
  const total =
    integral[y1 * stride + x1] -
    integral[y0 * stride + x1] -
    integral[y1 * stride + x0] +
    integral[y0 * stride + x0];
  return total / area;
}

/**
 * Estimates smooth local paper background illumination (per channel or luma)
 * using downsampled morphological dilation (local max) + box blur so dark text
 * strokes NEVER drag down the paper background estimate!
 */
function estimatePaperBackgroundRGB(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { bgR: Uint8Array; bgG: Uint8Array; bgB: Uint8Array; sw: number; sh: number } {
  // Downsample to ~160px on long side for ultra-fast morphological dilation (takes < 3ms!)
  const maxSmall = 160;
  const scale = Math.min(1, maxSmall / Math.max(width, height));
  const sw = Math.max(8, Math.round(width * scale));
  const sh = Math.max(8, Math.round(height * scale));

  const sR = new Uint8Array(sw * sh);
  const sG = new Uint8Array(sw * sh);
  const sB = new Uint8Array(sw * sh);

  // Sample 90th-percentile-like local maximum in each downsample cell to ignore dark text ink
  const stepX = width / sw;
  const stepY = height / sh;
  for (let sy = 0; sy < sh; sy++) {
    const yStart = Math.floor(sy * stepY);
    const yEnd = Math.min(height, Math.max(yStart + 1, Math.floor((sy + 1) * stepY)));
    for (let sx = 0; sx < sw; sx++) {
      const xStart = Math.floor(sx * stepX);
      const xEnd = Math.min(width, Math.max(xStart + 1, Math.floor((sx + 1) * stepX)));
      let maxLuma = -1;
      let bestR = 255;
      let bestG = 255;
      let bestB = 255;
      const dx = Math.max(1, Math.floor((xEnd - xStart) / 3));
      const dy = Math.max(1, Math.floor((yEnd - yStart) / 3));
      for (let y = yStart; y < yEnd; y += dy) {
        for (let x = xStart; x < xEnd; x += dx) {
          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const l = 0.299 * r + 0.587 * g + 0.114 * b;
          if (l > maxLuma) {
            maxLuma = l;
            bestR = r;
            bestG = g;
            bestB = b;
          }
        }
      }
      const di = sy * sw + sx;
      sR[di] = bestR;
      sG[di] = bestG;
      sB[di] = bestB;
    }
  }

  // Separable morphological dilation (radius 5 on 160px grid ≈ 3% of page width)
  // erases large bold headings & tables from the background surface estimate
  const dilateSep = (src: Uint8Array, r: number): Uint8Array => {
    const tmp = new Uint8Array(sw * sh);
    const out = new Uint8Array(sw * sh);
    for (let y = 0; y < sh; y++) {
      const row = y * sw;
      for (let x = 0; x < sw; x++) {
        let m = 0;
        const x0 = Math.max(0, x - r);
        const x1 = Math.min(sw - 1, x + r);
        for (let k = x0; k <= x1; k++) {
          const v = src[row + k];
          if (v > m) m = v;
        }
        tmp[row + x] = m;
      }
    }
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        let m = 0;
        const y0 = Math.max(0, y - r);
        const y1 = Math.min(sh - 1, y + r);
        for (let k = y0; k <= y1; k++) {
          const v = tmp[k * sw + x];
          if (v > m) m = v;
        }
        out[y * sw + x] = m;
      }
    }
    return out;
  };

  // Smooth the dilated surface with 2-pass box blur via integral image
  const smoothChannel = (src: Uint8Array, blurR: number): Uint8Array => {
    const { sum } = buildIntegral1D(src, sw, sh, false);
    const out = new Uint8Array(sw * sh);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        out[y * sw + x] = clampByte(boxMeanFromIntegral(sum, sw, sh, x, y, blurR));
      }
    }
    return out;
  };

  const dilR = Math.max(3, Math.round(Math.min(sw, sh) * 0.045));
  const blurR = Math.max(4, Math.round(Math.min(sw, sh) * 0.06));
  const bgR = smoothChannel(dilateSep(sR, dilR), blurR);
  const bgG = smoothChannel(dilateSep(sG, dilR), blurR);
  const bgB = smoothChannel(dilateSep(sB, dilR), blurR);

  return { bgR, bgG, bgB, sw, sh };
}

function sampleBilinear(
  grid: Uint8Array,
  sw: number,
  sh: number,
  u: number,
  v: number
): number {
  const gx = u * (sw - 1);
  const gy = v * (sh - 1);
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = x0 + 1 < sw ? x0 + 1 : x0;
  const y1 = y0 + 1 < sh ? y0 + 1 : y0;
  const fx = gx - x0;
  const fy = gy - y0;
  const v00 = grid[y0 * sw + x0];
  const v10 = grid[y0 * sw + x1];
  const v01 = grid[y1 * sw + x0];
  const v11 = grid[y1 * sw + x1];
  return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
}

// ─── Real CMYK & Toner Coverage Calculator ──────────────────────────────────

export function measureInkMetrics(data: Uint8ClampedArray, stridePx = 2): InkMetrics {
  let sumC = 0;
  let sumM = 0;
  let sumY = 0;
  let sumK = 0;
  let maxTac = 0;
  let count = 0;

  const step = Math.max(1, stridePx) * 4;
  for (let i = 0; i < data.length; i += step) {
    if (data[i + 3] < 16) continue;
    const rn = data[i] / 255;
    const gn = data[i + 1] / 255;
    const bn = data[i + 2] / 255;
    const k = 1 - Math.max(rn, gn, bn);
    let c = 0;
    let m = 0;
    let y = 0;
    if (k < 0.999) {
      const inv = 1 / (1 - k);
      c = (1 - rn - k) * inv;
      m = (1 - gn - k) * inv;
      y = (1 - bn - k) * inv;
    }
    sumC += c;
    sumM += m;
    sumY += y;
    sumK += k;
    const tac = (c + m + y + k) * 100;
    if (tac > maxTac) maxTac = tac;
    count++;
  }

  if (count === 0) {
    return {
      cyanPct: 0,
      magentaPct: 0,
      yellowPct: 0,
      blackPct: 0,
      totalCoveragePct: 0,
      maxTacPct: 0,
      inkScore: 0,
    };
  }

  const cyanPct = Math.round((sumC / count) * 1000) / 10;
  const magentaPct = Math.round((sumM / count) * 1000) / 10;
  const yellowPct = Math.round((sumY / count) * 1000) / 10;
  const blackPct = Math.round((sumK / count) * 1000) / 10;
  const totalCoveragePct = Math.round((cyanPct + magentaPct + yellowPct + blackPct) * 10) / 10;
  // Normalize ink usage index: color ink weighs slightly more (costlier) than K toner
  const inkScore = Math.min(100, Math.round((blackPct + (cyanPct + magentaPct + yellowPct) * 1.15) * 10) / 10);

  return {
    cyanPct,
    magentaPct,
    yellowPct,
    blackPct,
    totalCoveragePct,
    maxTacPct: Math.round(maxTac),
    inkScore,
  };
}

export function compareInkMetrics(
  before: InkMetrics,
  after: InkMetrics,
  baseCostPer100PagesInr = 120
): InkComparison {
  const savedPercent =
    before.totalCoveragePct > 0.5
      ? Math.max(
          0,
          Math.min(
            98,
            Math.round(
              ((before.totalCoveragePct - after.totalCoveragePct) / before.totalCoveragePct) * 100
            )
          )
        )
      : 0;
  const rupeesSavedPer100Pages = Math.round((savedPercent / 100) * baseCostPer100PagesInr);
  return { before, after, savedPercent, rupeesSavedPer100Pages };
}

// ─── Sharpen & Despeckle Utilities ──────────────────────────────────────────

function applyUnsharpMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount01: number
): void {
  if (amount01 <= 0.02 || width < 3 || height < 3) return;
  const copy = new Uint8ClampedArray(data);
  const strength = amount01 * 1.35;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const top = idx - width * 4;
      const bot = idx + width * 4;
      for (let c = 0; c < 3; c++) {
        const center = copy[idx + c];
        const avg =
          (copy[top + c] + copy[bot + c] + copy[idx - 4 + c] + copy[idx + 4 + c] + center * 4) *
          0.125;
        const diff = center - avg;
        // Skip tiny noise (< 4 levels) so white background stays spotless
        if (Math.abs(diff) > 4) {
          data[idx + c] = clampByte(center + diff * strength);
        }
      }
    }
  }
}

/** Removes isolated 1-pixel dark scanner dust specks without thinning real text strokes */
function applyDespeckle(data: Uint8ClampedArray, width: number, height: number): void {
  if (width < 3 || height < 3) return;
  const copy = new Uint8ClampedArray(data);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const lum = (copy[idx] * 299 + copy[idx + 1] * 587 + copy[idx + 2] * 114) / 1000;
      if (lum > 210) continue; // already paper white

      // Count how many of the 8 neighbors are pure white (>= 235)
      let whiteNeighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nIdx = ((y + dy) * width + (x + dx)) * 4;
          const nLum = (copy[nIdx] * 299 + copy[nIdx + 1] * 587 + copy[nIdx + 2] * 114) / 1000;
          if (nLum >= 235) whiteNeighbors++;
        }
      }
      // Isolated 1px speck (7 or 8 white neighbors) -> wipe to white
      if (whiteNeighbors >= 7) {
        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
      }
    }
  }
}

// ─── Photo / Chromatic Block Classifier ─────────────────────────────────────

/**
 * Detects photographic/chart blocks (16x16 grid) so Smart Dark Mode & Ink Saver
 * don't create noisy pixel halos around faces, seals, diagrams, or logos.
 */
function buildPhotoMaskGrid(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { mask: Uint8Array; cols: number; rows: number; cellSize: number } {
  const cellSize = Math.max(12, Math.round(Math.min(width, height) / 48));
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const mask = new Uint8Array(cols * rows);

  for (let cy = 0; cy < rows; cy++) {
    const y0 = cy * cellSize;
    const y1 = Math.min(height, y0 + cellSize);
    for (let cx = 0; cx < cols; cx++) {
      const x0 = cx * cellSize;
      const x1 = Math.min(width, x0 + cellSize);
      let chromaticCount = 0;
      let midtoneCount = 0;
      let total = 0;
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const mx = Math.max(r, g, b);
          const mn = Math.min(r, g, b);
          if (mx - mn > 28) chromaticCount++;
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (lum > 35 && lum < 220) midtoneCount++;
          total++;
        }
      }
      if (total > 0 && chromaticCount / total > 0.22 && midtoneCount / total > 0.28) {
        mask[cy * cols + cx] = 1;
      }
    }
  }

  // Dilate mask by 1 block to cover anti-aliased photo borders smoothly
  const dilated = new Uint8Array(mask);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      if (mask[cy * cols + cx]) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = cy + dy;
            const nx = cx + dx;
            if (ny >= 0 && ny < rows && nx >= 0 && nx < cols) {
              dilated[ny * cols + nx] = 1;
            }
          }
        }
      }
    }
  }
  return { mask: dilated, cols, rows, cellSize };
}

// ─── 1. PRO XEROX ECO-CLEANER PIPELINE ──────────────────────────────────────

export function processXeroxCanvas(
  orig: HTMLCanvasElement,
  options: XeroxOptions
): { canvas: HTMLCanvasElement; ink: InkComparison } {
  const w = orig.width;
  const h = orig.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    const m = { cyanPct: 0, magentaPct: 0, yellowPct: 0, blackPct: 0, totalCoveragePct: 0, maxTacPct: 0, inkScore: 0 };
    return { canvas: orig, ink: compareInkMetrics(m, m) };
  }

  ctx.drawImage(orig, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  const beforeInk = measureInkMetrics(data, 3);
  const shadowMix = Math.max(0, Math.min(1, options.shadowRemoval / 100));
  const darkness = Math.max(0, Math.min(1, options.textDarkness / 100));
  const bleach = options.bleachThreshold; // 120..240

  // Step 1: Estimate local illumination surface (removes yellow bulb cast & phone hand shadows!)
  const { bgR, bgG, bgB, sw, sh } = estimatePaperBackgroundRGB(data, w, h);

  // Build normalized luma buffer for adaptive Sauvola / edge detection
  const normLuma = new Uint8Array(w * h);
  const normR = new Uint8Array(w * h);
  const normG = new Uint8Array(w * h);
  const normB = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    const v = h > 1 ? y / (h - 1) : 0;
    for (let x = 0; x < w; x++) {
      const u = w > 1 ? x / (w - 1) : 0;
      const idx = (y * w + x) * 4;
      const pIdx = y * w + x;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      if (shadowMix > 0.01) {
        const lr = Math.max(42, sampleBilinear(bgR, sw, sh, u, v));
        const lg = Math.max(42, sampleBilinear(bgG, sw, sh, u, v));
        const lb = Math.max(42, sampleBilinear(bgB, sw, sh, u, v));

        // Divisive illumination normalization: local paper surface maps cleanly to 255
        const nr = Math.min(255, (r * 255) / lr);
        const ng = Math.min(255, (g * 255) / lg);
        const nb = Math.min(255, (b * 255) / lb);

        normR[pIdx] = clampByte(r * (1 - shadowMix) + nr * shadowMix);
        normG[pIdx] = clampByte(g * (1 - shadowMix) + ng * shadowMix);
        normB[pIdx] = clampByte(b * (1 - shadowMix) + nb * shadowMix);
      } else {
        normR[pIdx] = r;
        normG[pIdx] = g;
        normB[pIdx] = b;
      }

      normLuma[pIdx] = clampByte(0.299 * normR[pIdx] + 0.587 * normG[pIdx] + 0.114 * normB[pIdx]);
    }
  }

  // Step 2: Optional Sauvola local statistics for crisp photocopy & faded stamp-paper rescue
  let sauvolaSum: Float64Array | null = null;
  let sauvolaSumSq: Float64Array | null = null;
  const sauvolaR = Math.max(8, Math.min(28, Math.round(Math.min(w, h) * 0.02)));
  if (options.mode === 'pro_xerox' || options.mode === 'faded_rescue') {
    const built = buildIntegral1D(normLuma, w, h, true);
    sauvolaSum = built.sum;
    sauvolaSumSq = built.sumSq!;
  }

  // Edge map for Toner Saver solid-fill hollowing
  const isTonerSaver = options.mode === 'toner_saver';

  // Step 3: Apply selected cleaning mode
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pIdx = y * w + x;
      const idx = pIdx * 4;
      const r = normR[pIdx];
      const g = normG[pIdx];
      const b = normB[pIdx];
      const gray = normLuma[pIdx];

      if (options.mode === 'pro_xerox' || options.mode === 'faded_rescue') {
        // Hybrid Sauvola + global bleach threshold for razor-sharp Xerox output
        const mean = boxMeanFromIntegral(sauvolaSum!, w, h, x, y, sauvolaR);
        const meanSq = boxMeanFromIntegral(sauvolaSumSq!, w, h, x, y, sauvolaR);
        const variance = Math.max(0, meanSq - mean * mean);
        const std = Math.sqrt(variance);

        // User bleachThreshold tunes Sauvola sensitivity `k` (higher bleach = whiter paper)
        const k =
          options.mode === 'faded_rescue'
            ? 0.08 + ((bleach - 120) / 120) * 0.14
            : 0.14 + ((bleach - 120) / 120) * 0.22;
        const localT = mean * (1 + k * (std / 128 - 1));
        const cutoff = Math.min(bleach + 12, localT);

        // Soft anti-aliased transition band (14 gray levels) keeps fonts smooth, not jagged!
        if (gray >= cutoff + 6 || gray >= bleach + 22) {
          data[idx] = 255;
          data[idx + 1] = 255;
          data[idx + 2] = 255;
        } else if (gray <= cutoff - 18) {
          const ink = clampByte(gray * (1 - darkness * 0.88));
          data[idx] = ink;
          data[idx + 1] = ink;
          data[idx + 2] = ink;
        } else {
          const t = (gray - (cutoff - 18)) / 24;
          const darkBase = gray * (1 - darkness * 0.85);
          const blended = clampByte(darkBase + (255 - darkBase) * t * t);
          data[idx] = blended;
          data[idx + 1] = blended;
          data[idx + 2] = blended;
        }
      } else if (options.mode === 'magic_color') {
        // Keep blue ballpoint pens, red/violet official stamps & green seals vibrant while bleaching paper!
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        const chroma = mx - mn;
        const sat = mx > 0 ? chroma / mx : 0;

        if (gray >= bleach && sat < 0.16) {
          data[idx] = 255;
          data[idx + 1] = 255;
          data[idx + 2] = 255;
        } else if (sat >= 0.16 && chroma >= 22) {
          // Boost stamp/pen color vibrancy + crispness
          const [hh, ss, ll] = rgbToHsl(r, g, b);
          const boostedS = Math.min(1, ss * 1.32 + 0.06);
          const boostedL = Math.max(0.14, ll * (1 - darkness * 0.22));
          const [rr, gg, bb] = hslToRgb(hh, boostedS, boostedL);
          data[idx] = rr;
          data[idx + 1] = gg;
          data[idx + 2] = bb;
        } else {
          // Neutral black/gray text -> darken cleanly
          const scaled = gray < bleach ? clampByte((gray / Math.max(1, bleach)) * 225 * (1 - darkness * 0.7)) : 255;
          data[idx] = scaled;
          data[idx + 1] = scaled;
          data[idx + 2] = scaled;
        }
      } else if (isTonerSaver) {
        // Edge-Preserving Solid-Fill Hollowing Toner Saver:
        // Thin text strokes stay crisp charcoal (~55-85); thick solid black bars/headers hollow to light gray (~165)
        if (gray >= bleach - 14) {
          data[idx] = 255;
          data[idx + 1] = 255;
          data[idx + 2] = 255;
        } else {
          // Check 3px neighborhood to see if pixel is on a text edge or inside a solid black block
          let isEdge = true;
          if (x >= 2 && x < w - 2 && y >= 2 && y < h - 2) {
            const gL = normLuma[pIdx - 2];
            const gR = normLuma[pIdx + 2];
            const gT = normLuma[pIdx - 2 * w];
            const gB = normLuma[pIdx + 2 * w];
            // Interior of a thick dark shape -> all 4 directions are also dark
            if (gL < 110 && gR < 110 && gT < 110 && gB < 110) {
              isEdge = false;
            }
          }
          if (!isEdge) {
            // Hollow interior of solid dark fills -> massive toner savings!
            const hollow = clampByte(155 + (1 - darkness) * 45);
            data[idx] = hollow;
            data[idx + 1] = hollow;
            data[idx + 2] = hollow;
          } else {
            // Crisp readable charcoal outline/text
            const edgeVal = clampByte(55 + (gray / Math.max(1, bleach)) * 95 + (1 - darkness) * 28);
            data[idx] = edgeVal;
            data[idx + 1] = edgeVal;
            data[idx + 2] = edgeVal;
          }
        }
      } else {
        // photo_gray: Shadow-normalized smooth photographic grayscale (great for Aadhaar/Marksheet photos)
        if (gray >= bleach + 10) {
          data[idx] = 255;
          data[idx + 1] = 255;
          data[idx + 2] = 255;
        } else {
          const stretch = Math.min(255, (gray / Math.max(1, bleach + 10)) * 255);
          const gamma = 1 + darkness * 0.45;
          const finalV = clampByte(Math.pow(stretch / 255, gamma) * 255);
          data[idx] = finalV;
          data[idx + 1] = finalV;
          data[idx + 2] = finalV;
        }
      }
    }
  }

  // Step 4: Optional Despeckle + Unsharp Mask Text Crispness
  if (options.despeckle) {
    applyDespeckle(data, w, h);
  }
  if (options.sharpen > 0) {
    applyUnsharpMask(data, w, h, options.sharpen / 100);
  }

  const afterInk = measureInkMetrics(data, 3);
  ctx.putImageData(imgData, 0, 0);

  return {
    canvas: out,
    ink: compareInkMetrics(beforeInk, afterInk),
  };
}

// ─── 2. ENTERPRISE INK-SAVER PDF ENGINE ─────────────────────────────────────

export function processInkSaverCanvas(
  canvas: HTMLCanvasElement,
  options: InkSaverOptions
): InkComparison {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    const z = { cyanPct: 0, magentaPct: 0, yellowPct: 0, blackPct: 0, totalCoveragePct: 0, maxTacPct: 0, inkScore: 0 };
    return compareInkMetrics(z, z);
  }

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  const beforeInk = measureInkMetrics(data, 3);

  // Sample page luminance & background histogram to classify dark slides vs shadowed scans vs clean digital docs
  let totalLuma = 0;
  let darkPixels = 0;
  let midPaperPixels = 0;
  let samples = 0;
  for (let i = 0; i < data.length; i += 4 * 12) {
    if (data[i + 3] < 16) continue;
    const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    totalLuma += l;
    if (l < 95) darkPixels++;
    else if (l >= 145 && l <= 232) midPaperPixels++;
    samples++;
  }
  const avgLuma = samples > 0 ? totalLuma / samples : 220;
  const darkFrac = samples > 0 ? darkPixels / samples : 0;
  const murkyPaperFrac = samples > 0 ? midPaperPixels / samples : 0;

  let activeMode = options.mode;
  if (activeMode === 'smart_auto') {
    if (avgLuma < 125 || darkFrac > 0.48) activeMode = 'invert_dark';
    else if (murkyPaperFrac > 0.45 && avgLuma < 228) activeMode = 'clean_scanned';
    else activeMode = 'eco_toner';
  }

  // Optional Photo Protection mask
  const photoMask =
    options.preservePhotos && (activeMode === 'invert_dark' || activeMode === 'eco_toner')
      ? buildPhotoMaskGrid(data, w, h)
      : null;

  const isInPhoto = (x: number, y: number): boolean => {
    if (!photoMask) return false;
    const cx = Math.min(photoMask.cols - 1, Math.floor(x / photoMask.cellSize));
    const cy = Math.min(photoMask.rows - 1, Math.floor(y / photoMask.cellSize));
    return photoMask.mask[cy * photoMask.cols + cx] === 1;
  };

  if (activeMode === 'clean_scanned') {
    // True Integral-Image Shadow Removal & Paper Bleach
    const { bgR, bgG, bgB, sw, sh } = estimatePaperBackgroundRGB(data, w, h);
    const strength01 = options.ecoStrength / 100;
    for (let y = 0; y < h; y++) {
      const v = h > 1 ? y / (h - 1) : 0;
      for (let x = 0; x < w; x++) {
        const u = w > 1 ? x / (w - 1) : 0;
        const idx = (y * w + x) * 4;
        if (data[idx + 3] < 16) continue;
        const lr = Math.max(45, sampleBilinear(bgR, sw, sh, u, v));
        const lg = Math.max(45, sampleBilinear(bgG, sw, sh, u, v));
        const lb = Math.max(45, sampleBilinear(bgB, sw, sh, u, v));
        let r = Math.min(255, (data[idx] * 255) / lr);
        let g = Math.min(255, (data[idx + 1] * 255) / lg);
        let b = Math.min(255, (data[idx + 2] * 255) / lb);
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        if (luma >= 218) {
          r = 255;
          g = 255;
          b = 255;
        } else if (luma < 140) {
          // Lighten heavy dark ink slightly according to ecoStrength while staying sharp
          const lift = strength01 * 55;
          r = Math.min(255, r + lift);
          g = Math.min(255, g + lift);
          b = Math.min(255, b + lift);
        }
        if (options.forceMonochrome) {
          const gr = clampByte(0.299 * r + 0.587 * g + 0.114 * b);
          data[idx] = gr;
          data[idx + 1] = gr;
          data[idx + 2] = gr;
        } else {
          data[idx] = clampByte(r);
          data[idx + 1] = clampByte(g);
          data[idx + 2] = clampByte(b);
        }
      }
    }
  } else if (activeMode === 'invert_dark') {
    // Hue-Preserving Lightness Inversion (L' = 1 - L) for dark presentation slides!
    const cutoff = options.lumaThreshold / 255;
    const strength01 = options.ecoStrength / 100;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        if (data[idx + 3] < 16) continue;
        let r = data[idx];
        let g = data[idx + 1];
        let b = data[idx + 2];

        if (isInPhoto(x, y)) {
          // Keep embedded photos natural; gently brighten shadows so they don't waste ink
          r = Math.min(255, r * 0.92 + 20);
          g = Math.min(255, g * 0.92 + 20);
          b = Math.min(255, b * 0.92 + 20);
        } else {
          const [hh, ss, ll] = rgbToHsl(r, g, b);
          if (ll <= cutoff * 0.52 && ss < 0.45) {
            // Solid dark slide background (black, charcoal, dark navy) -> pure white paper!
            r = 255;
            g = 255;
            b = 255;
          } else {
            // Invert lightness while keeping Hue intact (blue headings stay crisp dark blue!)
            let invL = 1 - ll;
            // Push very light backgrounds straight to pure white
            if (invL > 0.86) invL = 1;
            else invL = Math.min(0.95, invL + strength01 * 0.16);
            const [nr, ng, nb] = hslToRgb(hh, Math.min(0.95, ss * 1.05), invL);
            r = nr;
            g = ng;
            b = nb;
          }
        }

        if (options.forceMonochrome) {
          const gr = clampByte(0.299 * r + 0.587 * g + 0.114 * b);
          data[idx] = gr;
          data[idx + 1] = gr;
          data[idx + 2] = gr;
        } else {
          data[idx] = clampByte(r);
          data[idx + 1] = clampByte(g);
          data[idx + 2] = clampByte(b);
        }
      }
    }
  } else if (activeMode === 'replace_color') {
    // Manual Color-to-Paper Replacer (great for colored bank forms, blue/yellow backgrounds)
    const src = hexToRgb(options.sourceColorHex);
    const dst = hexToRgb(options.targetBgHex);
    const tol = Math.max(8, options.colorTolerance);
    const tolSoft = tol * 1.25;

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 16) continue;
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      const dist = Math.hypot(r - src.r, g - src.g, b - src.b);
      if (dist <= tol) {
        r = dst.r;
        g = dst.g;
        b = dst.b;
      } else if (dist < tolSoft) {
        const t = (dist - tol) / (tolSoft - tol);
        r = dst.r + (r - dst.r) * t;
        g = dst.g + (g - dst.g) * t;
        b = dst.b + (b - dst.b) * t;
      }
      if (options.forceMonochrome) {
        const gr = clampByte(0.299 * r + 0.587 * g + 0.114 * b);
        data[i] = gr;
        data[i + 1] = gr;
        data[i + 2] = gr;
      } else {
        data[i] = clampByte(r);
        data[i + 1] = clampByte(g);
        data[i + 2] = clampByte(b);
      }
    }
  } else {
    // eco_toner: Edge-Preserving Solid-Fill Hollowing + Shaded Box Stripping
    const strength01 = Math.max(0.1, Math.min(0.85, options.ecoStrength / 100));
    const lumaBuf = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) {
      const i = p * 4;
      lumaBuf[p] = clampByte(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
    }

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const idx = p * 4;
        if (data[idx + 3] < 16) continue;
        let r = data[idx];
        let g = data[idx + 1];
        let b = data[idx + 2];
        const luma = lumaBuf[p];

        if (luma >= 232) {
          r = 255;
          g = 255;
          b = 255;
        } else if (options.stripShadedBoxes && luma >= 182 && !isInPhoto(x, y)) {
          // Strip pastel table fills, shaded highlight headers, light gray form boxes -> pure white!
          r = 255;
          g = 255;
          b = 255;
        } else {
          // Detect whether pixel is on a thin text stroke (edge) or inside a solid heavy fill
          let isInteriorFill = false;
          if (options.hollowThickFills && x >= 2 && x < w - 2 && y >= 2 && y < h - 2) {
            const dL = Math.abs(luma - lumaBuf[p - 2]);
            const dR = Math.abs(luma - lumaBuf[p + 2]);
            const dT = Math.abs(luma - lumaBuf[p - 2 * w]);
            const dB = Math.abs(luma - lumaBuf[p + 2 * w]);
            if (dL < 22 && dR < 22 && dT < 22 && dB < 22 && luma < 175) {
              isInteriorFill = true;
            }
          }

          // Blend pixel toward white: heavy interior fills lighten strongly; thin text edges stay sharp!
          const blendTowardWhite = isInteriorFill
            ? Math.min(0.78, strength01 * 1.18)
            : strength01 * 0.42;

          r = r + (255 - r) * blendTowardWhite;
          g = g + (255 - g) * blendTowardWhite;
          b = b + (255 - b) * blendTowardWhite;
        }

        if (options.forceMonochrome) {
          const gr = clampByte(0.299 * r + 0.587 * g + 0.114 * b);
          data[idx] = gr;
          data[idx + 1] = gr;
          data[idx + 2] = gr;
        } else {
          data[idx] = clampByte(r);
          data[idx + 1] = clampByte(g);
          data[idx + 2] = clampByte(b);
        }
      }
    }
  }

  const afterInk = measureInkMetrics(data, 3);
  ctx.putImageData(imgData, 0, 0);
  return compareInkMetrics(beforeInk, afterInk);
}

// ─── 3. PRO GRAYSCALE & HALFTONE ENGINE ─────────────────────────────────────

export function applyGrayscaleProToImageData(
  sourceData: ImageData,
  options: GrayscaleProOptions
): { output: ImageData; ink: InkComparison } {
  const { width: w, height: h } = sourceData;
  const out = new ImageData(new Uint8ClampedArray(sourceData.data), w, h);
  const data = out.data;

  const beforeInk = measureInkMetrics(data, 3);

  // Channel weights (lets users drop red stamps/exam grids or boost blue pen writing!)
  let wR = 0.2126;
  let wG = 0.7152;
  let wB = 0.0722;
  if (options.channelMix === 'drop_red') {
    wR = 0.92;
    wG = 0.06;
    wB = 0.02; // Red channel makes red stamps/lines bright white!
  } else if (options.channelMix === 'boost_blue') {
    wR = 0.78;
    wG = 0.2;
    wB = 0.02; // Red/Green emphasis makes blue ballpoint ink pitch black!
  } else if (options.channelMix === 'high_green') {
    wR = 0.15;
    wG = 0.8;
    wB = 0.05;
  }

  // Optional illumination shadow normalization
  const shadowMix = Math.max(0, Math.min(1, options.shadowRemoval / 100));
  const bg = shadowMix > 0.01 ? estimatePaperBackgroundRGB(data, w, h) : null;

  const grayBuf = new Uint8Array(w * h);
  const contrastFactor = (259 * (options.contrast * 2.2 + 255)) / (255 * (259 - options.contrast * 2.2));

  for (let y = 0; y < h; y++) {
    const v = h > 1 ? y / (h - 1) : 0;
    for (let x = 0; x < w; x++) {
      const u = w > 1 ? x / (w - 1) : 0;
      const p = y * w + x;
      const idx = p * 4;
      let r = data[idx];
      let g = data[idx + 1];
      let b = data[idx + 2];

      if (bg) {
        const lr = Math.max(42, sampleBilinear(bg.bgR, bg.sw, bg.sh, u, v));
        const lg = Math.max(42, sampleBilinear(bg.bgG, bg.sw, bg.sh, u, v));
        const lb = Math.max(42, sampleBilinear(bg.bgB, bg.sw, bg.sh, u, v));
        r = r * (1 - shadowMix) + Math.min(255, (r * 255) / lr) * shadowMix;
        g = g * (1 - shadowMix) + Math.min(255, (g * 255) / lg) * shadowMix;
        b = b * (1 - shadowMix) + Math.min(255, (b * 255) / lb) * shadowMix;
      }

      let gray = wR * r + wG * g + wB * b + options.brightness * 1.4;
      if (options.contrast !== 0) {
        gray = contrastFactor * (gray - 128) + 128;
      }
      grayBuf[p] = clampByte(gray);
    }
  }

  if (options.mode === 'adaptive_photocopy') {
    const { sum, sumSq } = buildIntegral1D(grayBuf, w, h, true);
    const rad = Math.max(8, Math.min(24, Math.round(Math.min(w, h) * 0.02)));
    const k = 0.12 + ((220 - options.threshold) / 160) * 0.24;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const idx = p * 4;
        const mean = boxMeanFromIntegral(sum, w, h, x, y, rad);
        const meanSq = boxMeanFromIntegral(sumSq!, w, h, x, y, rad);
        const std = Math.sqrt(Math.max(0, meanSq - mean * mean));
        const t = mean * (1 + k * (std / 128 - 1));
        const val = grayBuf[p] < Math.min(t, options.threshold + 25) ? 0 : 255;
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
      }
    }
  } else if (options.mode === 'halftone_dither') {
    // Floyd-Steinberg error-diffusion halftone for smooth photographic printing on 1-bit laser/thermal printers!
    const errBuf = new Float32Array(grayBuf.length);
    for (let i = 0; i < grayBuf.length; i++) errBuf[i] = grayBuf[i];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const oldVal = errBuf[p];
        const newVal = oldVal < options.threshold ? 0 : 255;
        const err = oldVal - newVal;
        const idx = p * 4;
        data[idx] = newVal;
        data[idx + 1] = newVal;
        data[idx + 2] = newVal;

        if (x + 1 < w) errBuf[p + 1] += err * (7 / 16);
        if (y + 1 < h) {
          if (x > 0) errBuf[p + w - 1] += err * (3 / 16);
          errBuf[p + w] += err * (5 / 16);
          if (x + 1 < w) errBuf[p + w + 1] += err * (1 / 16);
        }
      }
    }
  } else if (options.mode === 'eco_draft') {
    for (let p = 0; p < w * h; p++) {
      const idx = p * 4;
      const g = grayBuf[p];
      const v = g >= 218 ? 255 : clampByte(g * 0.72 + 72);
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
    }
  } else {
    for (let p = 0; p < w * h; p++) {
      const idx = p * 4;
      const g = grayBuf[p];
      data[idx] = g;
      data[idx + 1] = g;
      data[idx + 2] = g;
    }
  }

  const afterInk = measureInkMetrics(data, 3);
  return { output: out, ink: compareInkMetrics(beforeInk, afterInk) };
}

// ─── 4. HUE-PRESERVING SMART DARK MODE ENGINE ───────────────────────────────

export function applyDarkModeToImageData(
  sourceData: ImageData,
  options: DarkModeOptions
): ImageData {
  const { width: w, height: h } = sourceData;
  const out = new ImageData(new Uint8ClampedArray(sourceData.data), w, h);
  const data = out.data;

  const photoMask = options.preservePhotos ? buildPhotoMaskGrid(data, w, h) : null;
  const contrastFactor =
    options.contrast !== 0
      ? (259 * (options.contrast * 2.2 + 255)) / (255 * (259 - options.contrast * 2.2))
      : 1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      if (photoMask) {
        const cx = Math.min(photoMask.cols - 1, Math.floor(x / photoMask.cellSize));
        const cy = Math.min(photoMask.rows - 1, Math.floor(y / photoMask.cellSize));
        if (photoMask.mask[cy * photoMask.cols + cx] === 1) {
          // Natural photo preservation with gentle night glare dimming
          data[idx] = clampByte(r * 0.88);
          data[idx + 1] = clampByte(g * 0.88);
          data[idx + 2] = clampByte(b * 0.88);
          continue;
        }
      }

      if (options.theme === 'classic') {
        data[idx] = 255 - r;
        data[idx + 1] = 255 - g;
        data[idx + 2] = 255 - b;
        continue;
      }

      if (options.theme === 'smart_oled') {
        // Hue-Preserving Smart Invert: blue links stay blue, red highlights stay red, white paper becomes OLED #0a0c10!
        const [hh, ss, ll] = rgbToHsl(r, g, b);
        let invL = 1 - ll;
        if (options.brightness !== 0) invL += options.brightness / 255;
        if (options.contrast !== 0) invL = (invL - 0.5) * contrastFactor + 0.5;
        invL = Math.max(0.035, Math.min(0.94, invL));
        const satBoost = ss > 0.12 ? Math.min(0.92, ss * 1.1) : ss;
        const [nr, ng, nb] = hslToRgb(hh, satBoost, invL);
        data[idx] = nr;
        data[idx + 1] = ng;
        data[idx + 2] = nb;
        continue;
      }

      // Luminance-mapped palette themes
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      let invLum = 255 - lum + options.brightness;
      if (options.contrast !== 0) {
        invLum = contrastFactor * (invLum - 128) + 128;
      }
      const t = Math.max(0, Math.min(1, invLum / 255));

      if (options.theme === 'sepia') {
        data[idx] = clampByte(24 + t * (242 - 24));
        data[idx + 1] = clampByte(20 + t * (228 - 20));
        data[idx + 2] = clampByte(16 + t * (198 - 16));
      } else if (options.theme === 'solarized') {
        data[idx] = clampByte(7 + t * (176 - 7));
        data[idx + 1] = clampByte(24 + t * (216 - 24));
        data[idx + 2] = clampByte(42 + t * (252 - 42));
      } else if (options.theme === 'emerald_night') {
        data[idx] = clampByte(10 + t * (205 - 10));
        data[idx + 1] = clampByte(22 + t * (238 - 22));
        data[idx + 2] = clampByte(16 + t * (214 - 16));
      } else if (options.theme === 'high_contrast') {
        // Accessibility High-Contrast Yellow-on-Black
        data[idx] = clampByte(t * 255);
        data[idx + 1] = clampByte(t * 238);
        data[idx + 2] = clampByte(t * 64);
      } else {
        // pure_oled
        const v = clampByte(6 + t * (240 - 6));
        data[idx] = v;
        data[idx + 1] = v;
        data[idx + 2] = v;
      }
    }
  }
  return out;
}

// ─── 5. CLASSROOM BOARD DE-GLARE & CHALK INVERTER ───────────────────────────

export function processBoardCanvas(
  orig: HTMLCanvasElement,
  options: BoardCleanOptions
): { canvas: HTMLCanvasElement; ink: InkComparison } {
  const w = orig.width;
  const h = orig.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    const z = { cyanPct: 0, magentaPct: 0, yellowPct: 0, blackPct: 0, totalCoveragePct: 0, maxTacPct: 0, inkScore: 0 };
    return { canvas: orig, ink: compareInkMetrics(z, z) };
  }

  ctx.drawImage(orig, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const beforeInk = measureInkMetrics(data, 3);

  const glareMix = Math.max(0, Math.min(1, options.glareRemoval / 100));
  const boost01 = Math.max(0, Math.min(1, options.markerBoost / 100));

  if (options.mode === 'blackboard_invert') {
    // Invert green/black board first so chalk becomes dark strokes on bright background,
    // then run local illumination normalization to erase uneven board lighting & chalk dust haze!
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
    const { bgR, bgG, bgB, sw, sh } = estimatePaperBackgroundRGB(data, w, h);
    for (let y = 0; y < h; y++) {
      const v = h > 1 ? y / (h - 1) : 0;
      for (let x = 0; x < w; x++) {
        const u = w > 1 ? x / (w - 1) : 0;
        const idx = (y * w + x) * 4;
        const lr = Math.max(45, sampleBilinear(bgR, sw, sh, u, v));
        const lg = Math.max(45, sampleBilinear(bgG, sw, sh, u, v));
        const lb = Math.max(45, sampleBilinear(bgB, sw, sh, u, v));
        const nr = Math.min(255, (data[idx] * 255) / lr);
        const ng = Math.min(255, (data[idx + 1] * 255) / lg);
        const nb = Math.min(255, (data[idx + 2] * 255) / lb);
        const lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;

        const whiteCutoff = 215 - glareMix * 28;
        if (lum >= whiteCutoff) {
          data[idx] = 255;
          data[idx + 1] = 255;
          data[idx + 2] = 255;
        } else {
          // Crisp dark ink from white/yellow chalk
          const dark = clampByte((lum / whiteCutoff) * 190 * (1 - boost01 * 0.65));
          data[idx] = dark;
          data[idx + 1] = dark;
          data[idx + 2] = dark;
        }
      }
    }
  } else {
    // Whiteboard De-Glare, Multi-Color Marker Boost, or Pure B&W
    const { bgR, bgG, bgB, sw, sh } = estimatePaperBackgroundRGB(data, w, h);
    for (let y = 0; y < h; y++) {
      const v = h > 1 ? y / (h - 1) : 0;
      for (let x = 0; x < w; x++) {
        const u = w > 1 ? x / (w - 1) : 0;
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        const lr = Math.max(48, sampleBilinear(bgR, sw, sh, u, v));
        const lg = Math.max(48, sampleBilinear(bgG, sw, sh, u, v));
        const lb = Math.max(48, sampleBilinear(bgB, sw, sh, u, v));
        const nr = r * (1 - glareMix) + Math.min(255, (r * 255) / lr) * glareMix;
        const ng = g * (1 - glareMix) + Math.min(255, (g * 255) / lg) * glareMix;
        const nb = b * (1 - glareMix) + Math.min(255, (b * 255) / lb) * glareMix;
        const lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;

        if (options.mode === 'pure_bw') {
          const cutoff = 218 - glareMix * 24;
          const val = lum >= cutoff ? 255 : clampByte((lum / cutoff) * 180 * (1 - boost01 * 0.72));
          data[idx] = val;
          data[idx + 1] = val;
          data[idx + 2] = val;
        } else {
          const [hh, ss, ll] = rgbToHsl(nr, ng, nb);
          const whiteCut = options.mode === 'color_markers' ? 0.87 : 0.84;
          if (ll > whiteCut && ss < 0.16) {
            data[idx] = 255;
            data[idx + 1] = 255;
            data[idx + 2] = 255;
          } else {
            const satMult = options.mode === 'color_markers' ? 1 + boost01 * 0.85 : 1 + boost01 * 0.45;
            const darkMult = 1 - boost01 * 0.32;
            const [fr, fg, fb] = hslToRgb(hh, Math.min(1, ss * satMult), Math.max(0.08, ll * darkMult));
            data[idx] = fr;
            data[idx + 1] = fg;
            data[idx + 2] = fb;
          }
        }
      }
    }
  }

  if (options.sharpen > 0) {
    applyUnsharpMask(data, w, h, options.sharpen / 100);
  }

  const afterInk = measureInkMetrics(data, 3);
  ctx.putImageData(imgData, 0, 0);
  return { canvas: out, ink: compareInkMetrics(beforeInk, afterInk) };
}

// ─── 6. COARSE-TO-FINE AUTO-DESKEW (FIXED SIGN + 0.1° PRECISION) ────────────

/**
 * Detects the exact corrective rotation angle (in degrees, range [-15, +15])
 * to make tilted document text lines perfectly horizontal.
 * Positive returned angle = rotate clockwise; negative = rotate counter-clockwise.
 */
export function detectCorrectiveSkewAngle(source: HTMLCanvasElement | HTMLImageElement): number {
  const srcW = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const srcH = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  if (!srcW || !srcH) return 0;

  // Downsample to 320px width for fast, sharp gradient projection
  const sw = 320;
  const sh = Math.max(64, Math.round((srcH / srcW) * sw));
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;

  // Measure horizontal text-line sharpness at candidate corrective rotation `deg`
  const scoreAngle = (deg: number): number => {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sw, sh);
    ctx.translate(sw / 2, sh / 2);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.drawImage(source, -sw / 2, -sh / 2, sw, sh);
    ctx.restore();

    const d = ctx.getImageData(0, 0, sw, sh).data;
    // Ignore outer 10% margins so rotated canvas corners never bias variance
    const x0 = Math.floor(sw * 0.1);
    const x1 = Math.ceil(sw * 0.9);
    const y0 = Math.floor(sh * 0.1);
    const y1 = Math.ceil(sh * 0.9);
    const rowCount = y1 - y0;
    const rowDark = new Float64Array(rowCount);

    for (let y = y0; y < y1; y++) {
      let darkSum = 0;
      for (let x = x0; x < x1; x++) {
        const idx = (y * sw + x) * 4;
        const lum = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
        // Weight dark text pixels heavily; ignore bright paper variations
        if (lum < 195) darkSum += 255 - lum;
      }
      rowDark[y - y0] = darkSum;
    }

    // Sum of squared first-differences between adjacent rows peaks sharply when text baselines are 0° horizontal
    let score = 0;
    for (let i = 1; i < rowCount; i++) {
      const diff = rowDark[i] - rowDark[i - 1];
      score += diff * diff;
    }
    return score;
  };

  // Stage 1: Coarse scan from -15° to +15° at 1.0° steps
  let bestDeg = 0;
  let bestScore = -1;
  for (let deg = -15; deg <= 15; deg += 1.0) {
    const s = scoreAngle(deg);
    if (s > bestScore) {
      bestScore = s;
      bestDeg = deg;
    }
  }

  // Stage 2: Fine scan ±1.2° around bestDeg at 0.1° precision
  const fineStart = Math.max(-15, bestDeg - 1.2);
  const fineEnd = Math.min(15, bestDeg + 1.2);
  for (let deg = fineStart; deg <= fineEnd + 0.001; deg += 0.1) {
    const rounded = Math.round(deg * 10) / 10;
    const s = scoreAngle(rounded);
    if (s > bestScore) {
      bestScore = s;
      bestDeg = rounded;
    }
  }

  canvas.width = 0;
  canvas.height = 0;
  // NOTE: `bestDeg` IS the exact angle passed to ctx.rotate() that maximized horizontal line alignment!
  return Math.abs(bestDeg) < 0.15 ? 0 : Math.round(bestDeg * 10) / 10;
}

/**
 * Renders a deskewed canvas with optional scale-to-fit (prevents corner clipping)
 * and optional dark scanner border auto-trim.
 */
export function renderDeskewedCanvas(
  source: HTMLCanvasElement,
  angleDeg: number,
  rotation90: number,
  scaleToFit = true,
  trimDarkBorders = false
): HTMLCanvasElement {
  const totalDeg = angleDeg + rotation90;
  const swapDims = rotation90 % 180 !== 0;
  const outW = swapDims ? source.height : source.width;
  const outH = swapDims ? source.width : source.height;

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  if (!ctx) return source;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outW, outH);

  // When rotating by small skew angle θ, scale slightly down if scaleToFit so margin text isn't clipped
  let fitScale = 1;
  if (scaleToFit && Math.abs(angleDeg) > 0.1) {
    const rad = (Math.abs(angleDeg) * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const bw = outW * c + outH * s;
    const bh = outW * s + outH * c;
    fitScale = Math.min(outW / bw, outH / bh);
  }

  ctx.save();
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((totalDeg * Math.PI) / 180);
  ctx.scale(fitScale, fitScale);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  ctx.restore();

  if (trimDarkBorders) {
    // Wipe outer dark scanner-lid strips (up to 6% edge width where >70% of row/col is dark < 65)
    const imgData = ctx.getImageData(0, 0, outW, outH);
    const d = imgData.data;
    const maxEdgeX = Math.floor(outW * 0.06);
    const maxEdgeY = Math.floor(outH * 0.06);

    const rowIsDarkBorder = (y: number): boolean => {
      let dark = 0;
      const step = Math.max(1, Math.floor(outW / 80));
      let n = 0;
      for (let x = 0; x < outW; x += step) {
        const idx = (y * outW + x) * 4;
        if ((d[idx] + d[idx + 1] + d[idx + 2]) / 3 < 72) dark++;
        n++;
      }
      return n > 0 && dark / n > 0.55;
    };

    const colIsDarkBorder = (x: number): boolean => {
      let dark = 0;
      const step = Math.max(1, Math.floor(outH / 80));
      let n = 0;
      for (let y = 0; y < outH; y += step) {
        const idx = (y * outW + x) * 4;
        if ((d[idx] + d[idx + 1] + d[idx + 2]) / 3 < 72) dark++;
        n++;
      }
      return n > 0 && dark / n > 0.55;
    };

    let topTrim = 0;
    while (topTrim < maxEdgeY && rowIsDarkBorder(topTrim)) topTrim++;
    let botTrim = 0;
    while (botTrim < maxEdgeY && rowIsDarkBorder(outH - 1 - botTrim)) botTrim++;
    let leftTrim = 0;
    while (leftTrim < maxEdgeX && colIsDarkBorder(leftTrim)) leftTrim++;
    let rightTrim = 0;
    while (rightTrim < maxEdgeX && colIsDarkBorder(outW - 1 - rightTrim)) rightTrim++;

    ctx.fillStyle = '#ffffff';
    if (topTrim > 0) ctx.fillRect(0, 0, outW, topTrim + 2);
    if (botTrim > 0) ctx.fillRect(0, outH - botTrim - 2, outW, botTrim + 2);
    if (leftTrim > 0) ctx.fillRect(0, 0, leftTrim + 2, outH);
    if (rightTrim > 0) ctx.fillRect(outW - rightTrim - 2, 0, rightTrim + 2, outH);
  }

  return out;
}

// ─── 7. LUT-ACCELERATED FAST NON-BLOCKING DENOISER ──────────────────────────

export async function denoiseImageDataAsync(
  imageData: ImageData,
  mode: DenoiseMode,
  strength: number, // 1-15
  detailRecovery: number, // 0-100
  onProgress?: (pct: number) => void
): Promise<ImageData> {
  const { data, width, height } = imageData;
  const radius = Math.max(1, Math.min(7, Math.round(strength / 2)));
  const output = new Uint8ClampedArray(data.length);

  if (mode === 'bilateral') {
    // Fast LUT-accelerated Separable Bilateral Filter (O(r) instead of O(r^2) — 10-20× faster!)
    const sigmaSpace = Math.max(1, radius * 1.6);
    const sigmaColor = Math.max(8, strength * 5.2);
    const spaceLut = new Float32Array(radius + 1);
    for (let k = 0; k <= radius; k++) {
      spaceLut[k] = Math.exp(-(k * k) / (2 * sigmaSpace * sigmaSpace));
    }
    // Range LUT indexed by |dR| + |dG| + |dB| (0..765)
    const rangeLut = new Float32Array(766);
    const denom = 2 * sigmaColor * sigmaColor;
    for (let d = 0; d < 766; d++) {
      const avgD = d / 1.732;
      rangeLut[d] = Math.exp(-(avgD * avgD) / denom);
    }

    const temp = new Uint8ClampedArray(data.length);

    // Horizontal pass (chunked with yields so browser UI never freezes)
    for (let y = 0; y < height; y++) {
      const rowOff = y * width;
      for (let x = 0; x < width; x++) {
        const idx = (rowOff + x) * 4;
        const cR = data[idx];
        const cG = data[idx + 1];
        const cB = data[idx + 2];
        let sR = 0;
        let sG = 0;
        let sB = 0;
        let sW = 0;

        const x0 = Math.max(0, x - radius);
        const x1 = Math.min(width - 1, x + radius);
        for (let nx = x0; nx <= x1; nx++) {
          const nIdx = (rowOff + nx) * 4;
          const nR = data[nIdx];
          const nG = data[nIdx + 1];
          const nB = data[nIdx + 2];
          const dist = Math.abs(cR - nR) + Math.abs(cG - nG) + Math.abs(cB - nB);
          const w = spaceLut[Math.abs(nx - x)] * rangeLut[dist];
          sR += nR * w;
          sG += nG * w;
          sB += nB * w;
          sW += w;
        }
        temp[idx] = sR / sW;
        temp[idx + 1] = sG / sW;
        temp[idx + 2] = sB / sW;
        temp[idx + 3] = data[idx + 3];
      }
      if (y % 96 === 0) {
        onProgress?.(Math.round((y / height) * 45));
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    // Vertical pass
    for (let y = 0; y < height; y++) {
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(height - 1, y + radius);
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const cR = temp[idx];
        const cG = temp[idx + 1];
        const cB = temp[idx + 2];
        let sR = 0;
        let sG = 0;
        let sB = 0;
        let sW = 0;
        for (let ny = y0; ny <= y1; ny++) {
          const nIdx = (ny * width + x) * 4;
          const nR = temp[nIdx];
          const nG = temp[nIdx + 1];
          const nB = temp[nIdx + 2];
          const dist = Math.abs(cR - nR) + Math.abs(cG - nG) + Math.abs(cB - nB);
          const w = spaceLut[Math.abs(ny - y)] * rangeLut[dist];
          sR += nR * w;
          sG += nG * w;
          sB += nB * w;
          sW += w;
        }
        output[idx] = sR / sW;
        output[idx + 1] = sG / sW;
        output[idx + 2] = sB / sW;
        output[idx + 3] = temp[idx + 3];
      }
      if (y % 96 === 0) {
        onProgress?.(45 + Math.round((y / height) * 45));
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  } else if (mode === 'median') {
    // Fast Sliding-Histogram Median Filter (no per-pixel Array.sort allocations!)
    const r = Math.min(4, radius);
    const histR = new Int32Array(256);
    const histG = new Int32Array(256);
    const histB = new Int32Array(256);

    const pickMedian = (hist: Int32Array, half: number): number => {
      let acc = 0;
      for (let v = 0; v < 256; v++) {
        acc += hist[v];
        if (acc > half) return v;
      }
      return 128;
    };

    for (let y = 0; y < height; y++) {
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(height - 1, y + r);
      for (let x = 0; x < width; x++) {
        const x0 = Math.max(0, x - r);
        const x1 = Math.min(width - 1, x + r);
        histR.fill(0);
        histG.fill(0);
        histB.fill(0);
        let cnt = 0;
        for (let ny = y0; ny <= y1; ny++) {
          for (let nx = x0; nx <= x1; nx++) {
            const nIdx = (ny * width + nx) * 4;
            histR[data[nIdx]]++;
            histG[data[nIdx + 1]]++;
            histB[data[nIdx + 2]]++;
            cnt++;
          }
        }
        const half = cnt >> 1;
        const idx = (y * width + x) * 4;
        output[idx] = pickMedian(histR, half);
        output[idx + 1] = pickMedian(histG, half);
        output[idx + 2] = pickMedian(histB, half);
        output[idx + 3] = data[idx + 3];
      }
      if (y % 64 === 0) {
        onProgress?.(Math.round((y / height) * 90));
        await new Promise((r2) => setTimeout(r2, 0));
      }
    }
  } else {
    // Fast Separable Gaussian Blur
    const kernel = new Float32Array(radius * 2 + 1);
    let kSum = 0;
    const sigma = Math.max(0.8, radius * 0.75);
    for (let k = -radius; k <= radius; k++) {
      const val = Math.exp(-(k * k) / (2 * sigma * sigma));
      kernel[k + radius] = val;
      kSum += val;
    }
    for (let i = 0; i < kernel.length; i++) kernel[i] /= kSum;

    const temp = new Uint8ClampedArray(data.length);
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        let rr = 0;
        let gg = 0;
        let bb = 0;
        for (let k = -radius; k <= radius; k++) {
          const nx = Math.min(width - 1, Math.max(0, x + k));
          const nIdx = (row + nx) * 4;
          const w = kernel[k + radius];
          rr += data[nIdx] * w;
          gg += data[nIdx + 1] * w;
          bb += data[nIdx + 2] * w;
        }
        const idx = (row + x) * 4;
        temp[idx] = rr;
        temp[idx + 1] = gg;
        temp[idx + 2] = bb;
        temp[idx + 3] = data[idx + 3];
      }
      if (y % 128 === 0) {
        onProgress?.(Math.round((y / height) * 45));
        await new Promise((r2) => setTimeout(r2, 0));
      }
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let rr = 0;
        let gg = 0;
        let bb = 0;
        for (let k = -radius; k <= radius; k++) {
          const ny = Math.min(height - 1, Math.max(0, y + k));
          const nIdx = (ny * width + x) * 4;
          const w = kernel[k + radius];
          rr += temp[nIdx] * w;
          gg += temp[nIdx + 1] * w;
          bb += temp[nIdx + 2] * w;
        }
        const idx = (y * width + x) * 4;
        output[idx] = rr;
        output[idx + 1] = gg;
        output[idx + 2] = bb;
        output[idx + 3] = temp[idx + 3];
      }
      if (y % 128 === 0) {
        onProgress?.(45 + Math.round((y / height) * 45));
        await new Promise((r2) => setTimeout(r2, 0));
      }
    }
  }

  // Optional Crisp Edge / Detail Recovery
  if (detailRecovery > 0) {
    applyUnsharpMask(output, width, height, (detailRecovery / 100) * 0.75);
  }
  onProgress?.(100);
  return new ImageData(output, width, height);
}

// ─── Page Range Parser Helper (Shared Across PDF Tools) ─────────────────────

export function parsePageRange(input: string, totalPages: number): number[] {
  const clean = input.trim();
  if (!clean) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const set = new Set<number>();
  for (const part of clean.split(',')) {
    const seg = part.trim();
    if (!seg) continue;
    if (seg.includes('-')) {
      const [aStr, bStr] = seg.split('-');
      const a = Math.max(1, parseInt(aStr, 10) || 1);
      const b = Math.min(totalPages, parseInt(bStr, 10) || totalPages);
      for (let p = Math.min(a, b); p <= Math.max(a, b); p++) set.add(p);
    } else {
      const p = parseInt(seg, 10);
      if (p >= 1 && p <= totalPages) set.add(p);
    }
  }
  const sorted = Array.from(set).sort((a, b) => a - b);
  return sorted.length > 0 ? sorted : Array.from({ length: totalPages }, (_, i) => i + 1);
}
