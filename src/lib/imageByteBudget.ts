/**
 * Shared Image Byte-Budget Engine (Shrink AND Exact-Grow)
 * ======================================================
 * - Compresses canvas/image files strictly under `targetBytes` via quality binary search
 *   and gentle dimensional downscaling when needed.
 * - Can also cleanly shape JPEG (`FF FE` COM markers) and PNG (CRC-verified `tEXt` chunk)
 *   to reach exact requested sizes upwards (e.g., 10 KB signature -> 50 KB / 200 KB / 1 MB)
 *   with 100% standards-compliant decoders (Pillow, Chrome, Preview, Govt portals).
 */
export type RasterMime = 'image/jpeg' | 'image/webp' | 'image/png';

function toBlob(canvas: HTMLCanvasElement, mime: string, q?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), mime, q));
}

async function bestQualityUnderCap(
  c: HTMLCanvasElement,
  mime: 'image/jpeg' | 'image/webp',
  maxBytes: number,
): Promise<{ blob: Blob; q: number }> {
  let lo = 0.03;
  let hi = 0.99;
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

  if (bestBlob.size < maxBytes * 0.88) {
    let q = bestQ;
    for (let s = 0; s < 16; s++) {
      const tryQ = Math.min(0.995, q + 0.02);
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

// ─── CRC-32 Lookup Table for PNG chunk validation ────────────────────────────
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Pad valid JPEG bytes to exact targetBytes using ISO/IEC 10918-1 `COM` (`0xFF 0xFE`)
 * comment segments inserted immediately after SOI (`0xFF 0xD8`).
 * Remains 100% valid across browsers, Pillow, OpenCV, and portal re-encoders.
 */
export function padJpegBytesToExactSize(jpegBytes: Uint8Array, targetBytes: number): Uint8Array {
  if (jpegBytes.length >= targetBytes) return jpegBytes;
  // Must start with JPEG SOI marker FF D8
  if (jpegBytes.length < 4 || jpegBytes[0] !== 0xff || jpegBytes[1] !== 0xd8) {
    return jpegBytes;
  }

  let deficit = targetBytes - jpegBytes.length;
  if (deficit < 4) return jpegBytes;

  // Each COM segment: [0xFF, 0xFE, lenHi, lenLo, ...payload] where totalLen = 4 + payloadLen
  // Max length field = 65535 -> max payload = 65533 -> max segment bytes = 65537.
  const segments: Uint8Array[] = [];
  while (deficit > 0) {
    if (deficit >= 4 && deficit <= 65537) {
      const payloadLen = deficit - 4;
      const segLenField = payloadLen + 2;
      const seg = new Uint8Array(deficit);
      seg[0] = 0xff;
      seg[1] = 0xfe;
      seg[2] = (segLenField >>> 8) & 0xff;
      seg[3] = segLenField & 0xff;
      seg.fill(0x20, 4); // clean ASCII spaces
      segments.push(seg);
      deficit = 0;
    } else if (deficit > 65537) {
      // Leave at least 4 bytes for final chunk if remainder < 4
      const take = deficit - 65537 < 4 ? deficit - 4 : 65537;
      const payloadLen = take - 4;
      const segLenField = payloadLen + 2;
      const seg = new Uint8Array(take);
      seg[0] = 0xff;
      seg[1] = 0xfe;
      seg[2] = (segLenField >>> 8) & 0xff;
      seg[3] = segLenField & 0xff;
      seg.fill(0x20, 4);
      segments.push(seg);
      deficit -= take;
    } else {
      break;
    }
  }

  const extraLen = segments.reduce((acc, s) => acc + s.length, 0);
  const out = new Uint8Array(jpegBytes.length + extraLen);
  out.set(jpegBytes.subarray(0, 2), 0); // FF D8
  let offset = 2;
  for (const s of segments) {
    out.set(s, offset);
    offset += s.length;
  }
  out.set(jpegBytes.subarray(2), offset);
  return out;
}

/**
 * Pad valid PNG bytes cleanly to exact targetBytes using a CRC-verified `tEXt` chunk
 * inserted immediately before the final `IEND` chunk. Preserves alpha transparency.
 */
export function padPngBytesToExactSize(pngBytes: Uint8Array, targetBytes: number): Uint8Array {
  if (pngBytes.length >= targetBytes) return pngBytes;
  // Standard PNG 8-byte signature + 12-byte IEND chunk at end
  if (
    pngBytes.length < 28 ||
    pngBytes[0] !== 0x89 ||
    pngBytes[1] !== 0x50 ||
    pngBytes[2] !== 0x4e ||
    pngBytes[3] !== 0x47
  ) {
    return pngBytes;
  }

  // Verify IEND sits at the final 12 bytes
  const iendPos = pngBytes.length - 12;
  if (
    pngBytes[iendPos + 4] !== 0x49 ||
    pngBytes[iendPos + 5] !== 0x45 ||
    pngBytes[iendPos + 6] !== 0x4e ||
    pngBytes[iendPos + 7] !== 0x44
  ) {
    return pngBytes;
  }

  const deficit = targetBytes - pngBytes.length;
  // PNG chunk overhead = 4 (len) + 4 ("tEXt") + 4 (CRC) = 12 bytes; plus key "Comment\0" (8 bytes) => min 20 bytes
  if (deficit < 20) return pngBytes;

  const dataLen = deficit - 12;
  const chunk = new Uint8Array(deficit);
  // Big-endian chunk data length
  chunk[0] = (dataLen >>> 24) & 0xff;
  chunk[1] = (dataLen >>> 16) & 0xff;
  chunk[2] = (dataLen >>> 8) & 0xff;
  chunk[3] = dataLen & 0xff;
  // Chunk type "tEXt"
  chunk[4] = 0x74;
  chunk[5] = 0x45;
  chunk[6] = 0x58;
  chunk[7] = 0x74;
  // Keyword "Comment\0"
  const key = [0x43, 0x6f, 0x6d, 0x6d, 0x65, 0x6e, 0x74, 0x00];
  for (let i = 0; i < key.length; i++) chunk[8 + i] = key[i];
  // ASCII space padding
  chunk.fill(0x20, 8 + key.length, 8 + dataLen);

  // CRC over [type + data]
  const cVal = crc32(chunk.subarray(4, 8 + dataLen));
  const crcOff = 8 + dataLen;
  chunk[crcOff] = (cVal >>> 24) & 0xff;
  chunk[crcOff + 1] = (cVal >>> 16) & 0xff;
  chunk[crcOff + 2] = (cVal >>> 8) & 0xff;
  chunk[crcOff + 3] = cVal & 0xff;

  const out = new Uint8Array(pngBytes.length + chunk.length);
  out.set(pngBytes.subarray(0, iendPos), 0);
  out.set(chunk, iendPos);
  out.set(pngBytes.subarray(iendPos), iendPos + chunk.length);
  return out;
}

export async function padImageBlobToExactSize(blob: Blob, targetBytes: number): Promise<Blob> {
  if (blob.size >= targetBytes) return blob;
  const buf = new Uint8Array(await blob.arrayBuffer());
  let padded: Uint8Array = buf;
  if (blob.type === 'image/jpeg') {
    padded = padJpegBytesToExactSize(buf, targetBytes);
  } else if (blob.type === 'image/png') {
    padded = padPngBytesToExactSize(buf, targetBytes);
  } else {
    // Convert unsupported grow formats (e.g. WebP) to valid high-quality JPEG via bitmap when needed
    try {
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(bmp, 0, 0);
        const jpgBlob = await toBlob(c, 'image/jpeg', 0.96);
        bmp.close?.();
        c.width = 0;
        c.height = 0;
        if (jpgBlob) {
          const jBuf = new Uint8Array(await jpgBlob.arrayBuffer());
          const jPadded = padJpegBytesToExactSize(jBuf, targetBytes);
          const ab = new ArrayBuffer(jPadded.byteLength);
          new Uint8Array(ab).set(jPadded);
          return new Blob([ab], { type: 'image/jpeg' });
        }
      }
      bmp.close?.();
    } catch {
      /* fallback return original */
    }
    return blob;
  }
  const ab = new ArrayBuffer(padded.byteLength);
  new Uint8Array(ab).set(padded);
  return new Blob([ab], { type: blob.type });
}

export async function encodeCanvasUnderByteBudget(
  source: HTMLCanvasElement,
  mime: 'image/jpeg' | 'image/webp',
  maxBytes: number,
): Promise<{ blob: Blob; qualityUsed: number; scaled: boolean; note?: string }> {
  let scaled = false;
  let note: string | undefined;

  const safeCap = Math.max(1024, maxBytes - Math.min(300, Math.max(120, Math.floor(maxBytes * 0.015))));

  const { blob: first, q: q0 } = await bestQualityUnderCap(source, mime, safeCap);
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
    const { blob, q } = await bestQualityUnderCap(tmp, mime, safeCap);
    lastBlob = blob;
    scaled = true;
    note = 'Dimensions were reduced automatically to meet the target file size.';
    if (blob.size <= maxBytes) {
      tmp.width = 0;
      tmp.height = 0;
      return { blob, qualityUsed: q, scaled, note };
    }
    factor *= 0.9;
  }

  tmp.width = 0;
  tmp.height = 0;
  return { blob: lastBlob, qualityUsed: 0.02, scaled, note };
}

/**
 * Bidirectional exact image byte target encoder:
 * - If source > targetBytes: shrinks strictly <= targetBytes (JPEG/WebP binary-search + PNG downscale if needed).
 * - If source < targetBytes (when allowGrow=true): maximizes visual quality first, then cleanly shapes
 *   standard JPEG COM / PNG tEXt metadata so output lands at exact requested size!
 */
export async function encodeCanvasExactByteTarget(
  source: HTMLCanvasElement,
  mime: RasterMime,
  targetBytes: number,
  options: { allowGrow?: boolean } = {},
): Promise<{ blob: Blob; qualityUsed: number; scaled: boolean; grew: boolean; note?: string }> {
  const { allowGrow = true } = options;

  if (mime === 'image/png') {
    const baseBlob = await toBlob(source, 'image/png');
    if (!baseBlob) throw new Error('PNG encode failed');

    if (baseBlob.size > targetBytes) {
      // Downscale transparent PNG cleanly until under targetBytes
      const tmp = document.createElement('canvas');
      const tctx = tmp.getContext('2d');
      let best = baseBlob;
      if (tctx) {
        tctx.imageSmoothingEnabled = true;
        tctx.imageSmoothingQuality = 'high';
        let factor = 0.88;
        for (let step = 0; step < 18 && best.size > targetBytes; step++) {
          const w = Math.max(48, Math.floor(source.width * factor));
          const h = Math.max(24, Math.floor(source.height * factor));
          tmp.width = w;
          tmp.height = h;
          tctx.clearRect(0, 0, w, h);
          tctx.drawImage(source, 0, 0, w, h);
          const candidate = await toBlob(tmp, 'image/png');
          if (candidate) best = candidate;
          factor *= 0.88;
        }
        tmp.width = 0;
        tmp.height = 0;
      }
      return {
        blob: best,
        qualityUsed: 1,
        scaled: best.size < baseBlob.size,
        grew: false,
        note: best.size <= targetBytes ? 'Scaled PNG to fit target KB.' : 'PNG kept smallest possible dimensions.',
      };
    }

    if (allowGrow && baseBlob.size < targetBytes) {
      const padded = await padImageBlobToExactSize(baseBlob, targetBytes);
      return {
        blob: padded,
        qualityUsed: 1,
        scaled: false,
        grew: padded.size > baseBlob.size,
        note: 'Transparent PNG precisely shaped to requested target size.',
      };
    }

    return { blob: baseBlob, qualityUsed: 1, scaled: false, grew: false };
  }

  // JPEG or WebP
  const enc = await encodeCanvasUnderByteBudget(source, mime, targetBytes);
  if (!allowGrow || enc.blob.size >= targetBytes * 0.97) {
    return { ...enc, grew: false };
  }

  // First try higher quality (up to 0.98) or sharp canvas enlargement if tiny
  let bestGrowBlob = enc.blob;
  let usedQ = enc.qualityUsed;
  const maxQBlob = await toBlob(source, mime, 0.97);
  if (maxQBlob && maxQBlob.size <= targetBytes && maxQBlob.size > bestGrowBlob.size) {
    bestGrowBlob = maxQBlob;
    usedQ = 0.97;
  }

  // If still significantly below targetBytes, use valid header COM metadata padding (zero pixel distortion!)
  if (bestGrowBlob.size < targetBytes - 32) {
    const padded = await padImageBlobToExactSize(bestGrowBlob, targetBytes);
    return {
      blob: padded,
      qualityUsed: usedQ,
      scaled: enc.scaled,
      grew: padded.size > bestGrowBlob.size,
      note: 'Image quality maximized and precisely shaped to requested target size.',
    };
  }

  return { blob: bestGrowBlob, qualityUsed: usedQ, scaled: enc.scaled, grew: false };
}
