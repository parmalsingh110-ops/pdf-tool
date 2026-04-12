/**
 * Encode canvas as JPEG/WebP with size <= maxBytes when possible.
 * Quality binary search, nudge toward byte ceiling, then shrink from original if needed.
 */
export type RasterMime = 'image/jpeg' | 'image/webp';

function toBlob(canvas: HTMLCanvasElement, mime: RasterMime, q: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), mime, q));
}

async function bestQualityUnderCap(
  c: HTMLCanvasElement,
  mime: RasterMime,
  maxBytes: number,
): Promise<{ blob: Blob; q: number }> {
  let lo = 0.03;
  let hi = 0.98;
  let bestBlob: Blob | null = null;
  let bestQ = 0.45;

  for (let i = 0; i < 24 && hi - lo > 0.01; i++) {
    const mid = (lo + hi) / 2;
    const b = await toBlob(c, mime, mid);
    if (!b) break;
    if (b.size <= maxBytes) {
      bestBlob = b;
      bestQ = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  if (!bestBlob) {
    for (const q of [0.1, 0.06, 0.04, 0.03]) {
      const b = await toBlob(c, mime, q);
      if (b && b.size <= maxBytes) {
        bestBlob = b;
        bestQ = q;
        break;
      }
    }
  }

  if (!bestBlob) {
    const b = await toBlob(c, mime, 0.02);
    if (!b) throw new Error('encode failed');
    bestBlob = b;
    bestQ = 0.02;
  }

  if (bestBlob.size < maxBytes * 0.84) {
    let q = bestQ;
    for (let s = 0; s < 16; s++) {
      const tryQ = Math.min(0.99, q + 0.02);
      if (tryQ <= q + 0.001) break;
      const b = await toBlob(c, mime, tryQ);
      if (!b) break;
      if (b.size <= maxBytes) {
        bestBlob = b;
        bestQ = tryQ;
        q = tryQ;
      } else {
        break;
      }
    }
  }

  return { blob: bestBlob, q: bestQ };
}

export async function encodeCanvasUnderByteBudget(
  source: HTMLCanvasElement,
  mime: RasterMime,
  maxBytes: number,
): Promise<{ blob: Blob; qualityUsed: number; scaled: boolean; note?: string }> {
  let scaled = false;
  let note: string | undefined;

  const { blob: first, q: q0 } = await bestQualityUnderCap(source, mime, maxBytes);
  if (first.size <= maxBytes) {
    return { blob: first, qualityUsed: q0, scaled: false };
  }

  const tmp = document.createElement('canvas');
  const tctx = tmp.getContext('2d');
  if (!tctx) {
    return { blob: first, qualityUsed: q0, scaled: false, note: 'Could not downscale further in this browser.' };
  }

  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = 'high';

  let factor = 0.88;
  let lastBlob = first;

  for (let step = 0; step < 20; step++) {
    const w = Math.max(48, Math.floor(source.width * factor));
    const h = Math.max(48, Math.floor(source.height * factor));
    tmp.width = w;
    tmp.height = h;
    tctx.drawImage(source, 0, 0, w, h);
    const { blob, q } = await bestQualityUnderCap(tmp, mime, maxBytes);
    lastBlob = blob;
    scaled = true;
    note = 'Dimensions were reduced automatically to meet the target file size.';
    if (blob.size <= maxBytes) {
      return { blob, qualityUsed: q, scaled, note };
    }
    factor *= 0.9;
  }

  return { blob: lastBlob, qualityUsed: 0.02, scaled, note };
}
