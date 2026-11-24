/**
 * photoAdjustments.ts
 * Lightroom-style pixel-level adjustments for passport photos.
 * All functions operate on a canvas or ImageData.
 */

export interface PhotoAdjustments {
  exposure: number;      // -100..+100
  contrast: number;      // -100..+100
  saturation: number;    // -100..+100
  vibrance: number;      // -100..+100
  clarity: number;       // -100..+100
  highlights: number;    // -100..+100
  shadows: number;       // -100..+100
  whites: number;        // -100..+100
  blacks: number;        // -100..+100
  temperature: number;   // -100..+100  (cool ↔ warm)
  tint: number;          // -100..+100  (green ↔ magenta)
  dehaze: number;        //  0..+100
  texture: number;       // -100..+100
  vignette: number;      // -100..+100
  grain: number;         //  0..+100
}

export const DEFAULT_ADJUSTMENTS: PhotoAdjustments = {
  exposure: 0, contrast: 0, saturation: 0, vibrance: 0,
  clarity: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
  temperature: 0, tint: 0, dehaze: 0, texture: 0, vignette: 0, grain: 0,
};

export const PRESETS: Record<string, PhotoAdjustments> = {
  'None': DEFAULT_ADJUSTMENTS,
  'Pro Studio': {
    ...DEFAULT_ADJUSTMENTS,
    exposure: 5, contrast: 15, highlights: 10, shadows: -5,
    clarity: 10, vibrance: 15, temperature: -2
  },
  'Vibrant Clean': {
    ...DEFAULT_ADJUSTMENTS,
    exposure: 8, contrast: 20, saturation: 10, vibrance: 25,
    highlights: 15, shadows: 5, clarity: 15, whites: 10
  },
  'Passport Clear': {
    ...DEFAULT_ADJUSTMENTS,
    exposure: 10, contrast: 25, highlights: 15, shadows: 10,
    clarity: 20, vibrance: 5, whites: 20, blacks: -10
  },
  'Document B&W': {
    ...DEFAULT_ADJUSTMENTS,
    exposure: 15, contrast: 40, highlights: 30, shadows: -15,
    whites: 40, blacks: -30, saturation: -100, clarity: 50
  },
  'Natural Warm': {
    ...DEFAULT_ADJUSTMENTS,
    exposure: 2, contrast: 5, temperature: 10, vibrance: 10,
    shadows: 10, clarity: 5
  }
};

export function isDefault(adj: PhotoAdjustments): boolean {
  return Object.keys(DEFAULT_ADJUSTMENTS).every(
    (k) => adj[k as keyof PhotoAdjustments] === DEFAULT_ADJUSTMENTS[k as keyof PhotoAdjustments],
  );
}

/* ─── helpers ─── */

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** RGB → HSL (all 0-1) */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

/** HSL (0-1) → RGB (0-255) */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/* ─── iOS <17.4 Canvas ctx.filter feature detection & software fallbacks ─── */

let _supportsCanvasFilter: boolean | null = null;

/**
 * Runtime detection for real `CanvasRenderingContext2D.filter` support.
 * Older iOS Safari (<17.4) either lacks `ctx.filter` or silently ignores it as a no-op;
 * this test draws a white 2×2 pixel through `brightness(0%)` and verifies it darkens.
 */
export function supportsCanvasFilter(): boolean {
  if (_supportsCanvasFilter !== null) return _supportsCanvasFilter;
  if (typeof document === 'undefined') {
    _supportsCanvasFilter = false;
    return false;
  }
  try {
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 2;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx || !('filter' in ctx)) {
      c.width = 0;
      c.height = 0;
      _supportsCanvasFilter = false;
      return false;
    }
    ctx.filter = 'brightness(0%)';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 2, 2);
    const px = ctx.getImageData(0, 0, 1, 1).data;
    c.width = 0;
    c.height = 0;
    _supportsCanvasFilter = px[0] < 10 && px[1] < 10 && px[2] < 10;
    return _supportsCanvasFilter;
  } catch {
    _supportsCanvasFilter = false;
    return false;
  }
}

/**
 * Separable 2-pass RGBA sliding-window box blur on raw `ImageData.data`.
 * Used as a fast O(W*H) software fallback when `ctx.filter = 'blur(...)'` is unsupported (iOS <17.4).
 * Returns a new `Uint8ClampedArray` without mutating the input buffer.
 */
export function applyBoxBlurImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): Uint8ClampedArray {
  const len = width * height * 4;
  if (width <= 0 || height <= 0 || radius <= 0 || data.length < len) {
    return new Uint8ClampedArray(data);
  }

  const r = Math.max(1, Math.min(Math.round(radius), Math.max(width, height) - 1));
  const horiz = new Uint8ClampedArray(len);
  const out = new Uint8ClampedArray(len);

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    const rowBase = y * width;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumA = 0;

    const initRight = Math.min(r, width - 1);
    for (let x = 0; x <= initRight; x++) {
      const p = (rowBase + x) * 4;
      sumR += data[p];
      sumG += data[p + 1];
      sumB += data[p + 2];
      sumA += data[p + 3];
    }

    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - r);
      const right = Math.min(width - 1, x + r);
      const count = right - left + 1;
      const dstIdx = (rowBase + x) * 4;
      horiz[dstIdx] = Math.round(sumR / count);
      horiz[dstIdx + 1] = Math.round(sumG / count);
      horiz[dstIdx + 2] = Math.round(sumB / count);
      horiz[dstIdx + 3] = Math.round(sumA / count);

      const addX = x + r + 1;
      if (addX < width) {
        const ap = (rowBase + addX) * 4;
        sumR += data[ap];
        sumG += data[ap + 1];
        sumB += data[ap + 2];
        sumA += data[ap + 3];
      }
      const remX = x - r;
      if (remX >= 0) {
        const rp = (rowBase + remX) * 4;
        sumR -= data[rp];
        sumG -= data[rp + 1];
        sumB -= data[rp + 2];
        sumA -= data[rp + 3];
      }
    }
  }

  // Vertical pass
  for (let x = 0; x < width; x++) {
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumA = 0;

    const initBottom = Math.min(r, height - 1);
    for (let y = 0; y <= initBottom; y++) {
      const p = (y * width + x) * 4;
      sumR += horiz[p];
      sumG += horiz[p + 1];
      sumB += horiz[p + 2];
      sumA += horiz[p + 3];
    }

    for (let y = 0; y < height; y++) {
      const top = Math.max(0, y - r);
      const bottom = Math.min(height - 1, y + r);
      const count = bottom - top + 1;
      const dstIdx = (y * width + x) * 4;
      out[dstIdx] = Math.round(sumR / count);
      out[dstIdx + 1] = Math.round(sumG / count);
      out[dstIdx + 2] = Math.round(sumB / count);
      out[dstIdx + 3] = Math.round(sumA / count);

      const addY = y + r + 1;
      if (addY < height) {
        const ap = (addY * width + x) * 4;
        sumR += horiz[ap];
        sumG += horiz[ap + 1];
        sumB += horiz[ap + 2];
        sumA += horiz[ap + 3];
      }
      const remY = y - r;
      if (remY >= 0) {
        const rp = (remY * width + x) * 4;
        sumR -= horiz[rp];
        sumG -= horiz[rp + 1];
        sumB -= horiz[rp + 2];
        sumA -= horiz[rp + 3];
      }
    }
  }

  return out;
}

/**
 * Software pixel fallback for basic CSS `brightness`, `contrast`, and `saturate` canvas filters
 * (used when `!supportsCanvasFilter()`, e.g. iOS Safari < 17.4).
 * Parameters use `-100..+100` offsets matching `brightness(${100 + brightness}%)`.
 */
export function applyBasicPhotoFilterFallback(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: { brightness?: number; contrast?: number; saturation?: number }
): void {
  const brightness = options.brightness ?? 0;
  const contrast = options.contrast ?? 0;
  const saturation = options.saturation ?? 0;

  if (
    width <= 0 ||
    height <= 0 ||
    (brightness === 0 && contrast === 0 && saturation === 0)
  ) {
    return;
  }

  const imgData = ctx.getImageData(0, 0, width, height);
  const d = imgData.data;
  const bFactor = Math.max(0, (100 + brightness) / 100);
  const cFactor = Math.max(0, (100 + contrast) / 100);
  const sFactor = Math.max(0, (100 + saturation) / 100);

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];

    if (brightness !== 0) {
      r *= bFactor;
      g *= bFactor;
      b *= bFactor;
    }
    if (contrast !== 0) {
      r = (r - 128) * cFactor + 128;
      g = (g - 128) * cFactor + 128;
      b = (b - 128) * cFactor + 128;
    }
    if (saturation !== 0) {
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = lum + (r - lum) * sFactor;
      g = lum + (g - lum) * sFactor;
      b = lum + (b - lum) * sFactor;
    }

    d[i] = clamp(r);
    d[i + 1] = clamp(g);
    d[i + 2] = clamp(b);
  }

  ctx.putImageData(imgData, 0, 0);
}

/* ─── main pipeline ─── */

/**
 * Apply all adjustments to a canvas and return a new canvas.
 * Non-destructive: original canvas is never mutated.
 */
export function applyAdjustments(
  src: HTMLCanvasElement,
  adj: PhotoAdjustments,
): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;

  // Fast path: nothing to do
  if (isDefault(adj)) return src;

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d')!;
  octx.drawImage(src, 0, 0);

  const imgData = octx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const len = d.length;

  // Precompute constants
  const expMul = Math.pow(2, adj.exposure / 100);
  const contFactor = (259 * (adj.contrast * 2.55 + 255)) / (255 * (259 - adj.contrast * 2.55));
  const satScale = 1 + adj.saturation / 100;
  const vibScale = adj.vibrance / 100;
  const tempShift = adj.temperature * 0.5; // +warm = add R, sub B
  const tintShift = adj.tint * 0.3;       // +magenta = add R+B, sub G
  const hlAdj = adj.highlights / 100;
  const shAdj = adj.shadows / 100;
  const whAdj = adj.whites / 200;
  const blAdj = adj.blacks / 200;
  const dhz = adj.dehaze / 100;

  // Pass 1: per-pixel tone + color adjustments
  for (let i = 0; i < len; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];

    // ── Exposure ──
    if (adj.exposure !== 0) {
      r *= expMul;
      g *= expMul;
      b *= expMul;
    }

    // ── Temperature (WB) ──
    if (adj.temperature !== 0) {
      r += tempShift;
      b -= tempShift;
    }

    // ── Tint ──
    if (adj.tint !== 0) {
      g -= tintShift;
      r += tintShift * 0.5;
      b += tintShift * 0.5;
    }

    // ── Contrast ──
    if (adj.contrast !== 0) {
      r = contFactor * (r - 128) + 128;
      g = contFactor * (g - 128) + 128;
      b = contFactor * (b - 128) + 128;
    }

    // ── Highlights / Shadows ──
    const lum = luminance(r, g, b);
    if (adj.highlights !== 0 && lum > 170) {
      const t = (lum - 170) / 85; // 0..1
      const shift = hlAdj * 60 * t;
      r += shift; g += shift; b += shift;
    }
    if (adj.shadows !== 0 && lum < 85) {
      const t = (85 - lum) / 85; // 0..1
      const shift = shAdj * 60 * t;
      r += shift; g += shift; b += shift;
    }

    // ── Whites / Blacks ──
    if (adj.whites !== 0 && lum > 200) {
      const shift = whAdj * 80 * ((lum - 200) / 55);
      r += shift; g += shift; b += shift;
    }
    if (adj.blacks !== 0 && lum < 55) {
      const shift = blAdj * 80 * ((55 - lum) / 55);
      r += shift; g += shift; b += shift;
    }

    // ── Dehaze → boost contrast + saturation in low-contrast mid-tones ──
    if (dhz > 0) {
      const mid = (lum > 60 && lum < 200) ? 1 : 0.3;
      r = r + (r - 128) * dhz * 0.5 * mid;
      g = g + (g - 128) * dhz * 0.5 * mid;
      b = b + (b - 128) * dhz * 0.5 * mid;
    }

    // ── Saturation ──
    if (adj.saturation !== 0) {
      const gray = luminance(r, g, b);
      r = gray + (r - gray) * satScale;
      g = gray + (g - gray) * satScale;
      b = gray + (b - gray) * satScale;
    }

    // ── Vibrance (smart saturation: boosts low-sat more) ──
    if (adj.vibrance !== 0) {
      const [hh, ss, ll] = rgbToHsl(clamp(r), clamp(g), clamp(b));
      const boost = vibScale * (1 - ss); // less effect on already-saturated colors
      const ns = Math.min(1, Math.max(0, ss + boost * 0.5));
      const [nr, ng, nb] = hslToRgb(hh, ns, ll);
      r = nr; g = ng; b = nb;
    }

    d[i] = clamp(r);
    d[i + 1] = clamp(g);
    d[i + 2] = clamp(b);
  }

  octx.putImageData(imgData, 0, 0);

  // Pass 2: filter-based effects (clarity / texture)
  if (adj.clarity !== 0) {
    applyClarityInPlace(out, adj.clarity / 100);
  }
  if (adj.texture !== 0) {
    applyTextureInPlace(out, adj.texture / 100);
  }

  // Pass 3: vignette (radial gradient overlay)
  if (adj.vignette !== 0) {
    applyVignetteInPlace(out, adj.vignette / 100);
  }

  // Pass 4: grain
  if (adj.grain > 0) {
    applyGrainInPlace(out, adj.grain / 100);
  }

  return out;
}

/* ─── clarity: local contrast via unsharp mask on luminance ─── */
function applyClarityInPlace(canvas: HTMLCanvasElement, amount: number) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d')!;
  const origData = ctx.getImageData(0, 0, w, h);
  const od = origData.data;

  const blurPx = Math.abs(amount) * 8 + 2;
  let bd: Uint8ClampedArray;
  if (supportsCanvasFilter()) {
    const blur = document.createElement('canvas');
    blur.width = w; blur.height = h;
    try {
      const bctx = blur.getContext('2d')!;
      bctx.filter = `blur(${blurPx}px)`;
      bctx.drawImage(canvas, 0, 0);
      bctx.filter = 'none';
      bd = bctx.getImageData(0, 0, w, h).data;
    } finally {
      blur.width = 0;
      blur.height = 0;
    }
  } else {
    bd = applyBoxBlurImageData(od, w, h, Math.max(1, Math.round(blurPx)));
  }

  const str = amount * 0.7;

  for (let i = 0; i < od.length; i += 4) {
    const lOrig = luminance(od[i], od[i+1], od[i+2]);
    const lBlur = luminance(bd[i], bd[i+1], bd[i+2]);
    // Only boost midtones (not shadows/highlights)
    const midWeight = 1 - Math.abs(lOrig - 128) / 128;
    const diff = (lOrig - lBlur) * str * midWeight;
    od[i]     = clamp(od[i] + diff);
    od[i + 1] = clamp(od[i + 1] + diff);
    od[i + 2] = clamp(od[i + 2] + diff);
  }
  ctx.putImageData(origData, 0, 0);
}

/* ─── texture: high-frequency detail enhancement ─── */
function applyTextureInPlace(canvas: HTMLCanvasElement, amount: number) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d')!;
  const origData = ctx.getImageData(0, 0, w, h);
  const od = origData.data;

  let bd: Uint8ClampedArray;
  if (supportsCanvasFilter()) {
    const blur = document.createElement('canvas');
    blur.width = w; blur.height = h;
    try {
      const bctx = blur.getContext('2d')!;
      bctx.filter = 'blur(1.5px)';
      bctx.drawImage(canvas, 0, 0);
      bctx.filter = 'none';
      bd = bctx.getImageData(0, 0, w, h).data;
    } finally {
      blur.width = 0;
      blur.height = 0;
    }
  } else {
    bd = applyBoxBlurImageData(od, w, h, 2);
  }

  for (let i = 0; i < od.length; i += 4) {
    od[i]     = clamp(od[i]     + (od[i]     - bd[i])     * amount * 0.6);
    od[i + 1] = clamp(od[i + 1] + (od[i + 1] - bd[i + 1]) * amount * 0.6);
    od[i + 2] = clamp(od[i + 2] + (od[i + 2] - bd[i + 2]) * amount * 0.6);
  }
  ctx.putImageData(origData, 0, 0);
}

/* ─── vignette: radial darkening/lightening ─── */
function applyVignetteInPlace(canvas: HTMLCanvasElement, amount: number) {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width, h = canvas.height;
  const cx = w / 2, cy = h / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);

  const grad = ctx.createRadialGradient(cx, cy, maxR * 0.4, cx, cy, maxR);
  if (amount < 0) {
    // Lighten corners
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, `rgba(255,255,255,${Math.abs(amount) * 0.6})`);
  } else {
    // Darken corners (classic vignette)
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${amount * 0.6})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

/* ─── grain: film-like noise ─── */
function applyGrainInPlace(canvas: HTMLCanvasElement, amount: number) {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width, h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const intensity = amount * 40;

  for (let i = 0; i < d.length; i += 4) {
    const noise = (Math.random() - 0.5) * intensity;
    d[i]     = clamp(d[i] + noise);
    d[i + 1] = clamp(d[i + 1] + noise);
    d[i + 2] = clamp(d[i + 2] + noise);
  }
  ctx.putImageData(imgData, 0, 0);
}

/* ─── Adjustment groups for UI ─── */
export const ADJUSTMENT_GROUPS = [
  {
    label: '💡 Light',
    keys: ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks'] as (keyof PhotoAdjustments)[],
  },
  {
    label: '🎨 Color',
    keys: ['temperature', 'tint', 'saturation', 'vibrance'] as (keyof PhotoAdjustments)[],
  },
  {
    label: '✨ Effects',
    keys: ['clarity', 'texture', 'dehaze'] as (keyof PhotoAdjustments)[],
  },
  {
    label: '🎞️ Finishing',
    keys: ['vignette', 'grain'] as (keyof PhotoAdjustments)[],
  },
];

export const ADJUSTMENT_RANGES: Record<keyof PhotoAdjustments, { min: number; max: number }> = {
  exposure:    { min: -100, max: 100 },
  contrast:    { min: -100, max: 100 },
  saturation:  { min: -100, max: 100 },
  vibrance:    { min: -100, max: 100 },
  clarity:     { min: -100, max: 100 },
  highlights:  { min: -100, max: 100 },
  shadows:     { min: -100, max: 100 },
  whites:      { min: -100, max: 100 },
  blacks:      { min: -100, max: 100 },
  temperature: { min: -100, max: 100 },
  tint:        { min: -100, max: 100 },
  dehaze:      { min: 0,    max: 100 },
  texture:     { min: -100, max: 100 },
  vignette:    { min: -100, max: 100 },
  grain:       { min: 0,    max: 100 },
};
