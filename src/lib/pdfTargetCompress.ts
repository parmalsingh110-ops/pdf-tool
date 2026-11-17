import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import './pdfWorker';

function canvasToJpegBytes(canvas: HTMLCanvasElement, q: number): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('jpeg encode failed'));
        else blob.arrayBuffer().then(resolve, reject);
      },
      'image/jpeg',
      q,
    );
  });
}

async function stripPdfMetadataBytes(arrayBuffer: ArrayBuffer): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  pdfDoc.setTitle('');
  pdfDoc.setAuthor('');
  pdfDoc.setSubject('');
  pdfDoc.setKeywords([]);
  pdfDoc.setProducer('');
  pdfDoc.setCreator('');
  return new Uint8Array(await pdfDoc.save({ useObjectStreams: true }));
}

async function rasterizePdfPages(
  pdf: pdfjsLib.PDFDocumentProxy,
  scale: number,
  jpegQ: number,
  onProgress?: (page: number, total: number) => void,
): Promise<Uint8Array> {
  const totalPages = pdf.numPages;
  const newPdfDoc = await PDFDocument.create();

  for (let i = 1; i <= totalPages; i++) {
    onProgress?.(i, totalPages);
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      page.cleanup();
      continue;
    }
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const imgBytes = await canvasToJpegBytes(canvas, jpegQ);
    const pdfImage = await newPdfDoc.embedJpg(imgBytes);
    const newPage = newPdfDoc.addPage([viewport.width, viewport.height]);
    newPage.drawImage(pdfImage, { x: 0, y: 0, width: viewport.width, height: viewport.height });
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
    await new Promise((r) => setTimeout(r, 4));
  }

  return new Uint8Array(await newPdfDoc.save({ useObjectStreams: true }));
}

/**
 * Fast, accurate target-byte PDF compressor:
 * 1. Tries lossless metadata/stream optimization first (keeps crisp selectable vector text if <= targetBytes).
 * 2. Otherwise calibrates JPEG quality & scale on a representative middle page (fast — avoids 50x full re-renders)
 *    and renders once + 1 precision corrective pass if needed.
 */
export async function compressPdfToTargetBytes(
  arrayBuffer: ArrayBuffer,
  targetBytes: number,
  onStep?: (step: string, pct?: number) => void,
): Promise<{ bytes: Uint8Array; lossless: boolean }> {
  onStep?.('Optimizing vector streams…', 10);
  try {
    const losslessBytes = await stripPdfMetadataBytes(arrayBuffer);
    if (losslessBytes.byteLength <= targetBytes) {
      onStep?.('Target achieved losslessly!', 100);
      return { bytes: losslessBytes, lossless: true };
    }
  } catch {
    /* fallback cleanly to raster pipeline below */
  }

  onStep?.('Calibrating page density for exact target…', 22);
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const totalPages = Math.max(1, pdf.numPages);
  const perPageBudget = targetBytes / totalPages;
  const samplePage = await pdf.getPage(Math.max(1, Math.ceil(totalPages / 2)));

  const calibrateOnSamplePage = async (scale: number): Promise<{ bestQ: number; estTotalBytes: number }> => {
    const viewport = samplePage.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return { bestQ: 0.5, estTotalBytes: targetBytes };
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await samplePage.render({ canvas, canvasContext: ctx, viewport }).promise;

    let lo = 0.08;
    let hi = 0.92;
    let bestQ = 0.5;
    let bestPageBytes = (await canvasToJpegBytes(canvas, 0.5)).byteLength;
    const targetPerPage = Math.max(3500, (targetBytes - 1600) / totalPages);

    for (let k = 0; k < 8 && hi - lo > 0.02; k++) {
      const mid = (lo + hi) / 2;
      const bLen = (await canvasToJpegBytes(canvas, mid)).byteLength + 600;
      if (bLen <= targetPerPage) {
        bestQ = mid;
        bestPageBytes = bLen;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    canvas.width = 0;
    canvas.height = 0;
    return { bestQ, estTotalBytes: bestPageBytes * totalPages + 1200 };
  };

  let scale = 1.65;
  if (perPageBudget < 55_000) scale = 1.05;
  if (perPageBudget < 25_000) scale = 0.78;
  if (perPageBudget < 12_000) scale = 0.58;

  let { bestQ, estTotalBytes } = await calibrateOnSamplePage(scale);
  let guard = 0;
  while (estTotalBytes > targetBytes && scale > 0.36 && guard < 6) {
    scale *= 0.85;
    const cal = await calibrateOnSamplePage(scale);
    bestQ = cal.bestQ;
    estTotalBytes = cal.estTotalBytes;
    guard++;
  }
  samplePage.cleanup();

  onStep?.('Compressing PDF pages…', 45);
  let bestPdfBytes = await rasterizePdfPages(pdf, scale, bestQ, (p, n) => {
    onStep?.(`Processing page ${p} of ${n}…`, 45 + Math.round((p / n) * 40));
  });

  if (bestPdfBytes.byteLength > targetBytes) {
    onStep?.('Fine-tuning to exact target size…', 90);
    const ratio = (targetBytes * 0.93) / bestPdfBytes.byteLength;
    const adjQ = Math.max(0.06, bestQ * ratio);
    const adjScale = ratio < 0.7 ? Math.max(0.34, scale * Math.sqrt(ratio)) : scale;
    const retryBytes = await rasterizePdfPages(pdf, adjScale, adjQ);
    if (retryBytes.byteLength < bestPdfBytes.byteLength) {
      bestPdfBytes = retryBytes;
    }
  }

  onStep?.('Compression complete!', 100);
  return { bytes: bestPdfBytes, lossless: false };
}

/**
 * Local adaptive compression when server cannot reduce a file enough or is unreachable.
 * Picks the smallest output among lossless cleanup and calibrated rasterization.
 */
export async function compressPdfAdaptiveLocal(
  arrayBuffer: ArrayBuffer,
  preset: 'recommended' | 'extreme',
  onStep?: (step: string, pct?: number) => void,
): Promise<{ bytes: Uint8Array; lossless: boolean }> {
  const origLen = arrayBuffer.byteLength;
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const scale = preset === 'extreme' ? 0.92 : 1.2;
  const quality = preset === 'extreme' ? 0.36 : 0.62;

  let rasterBytes = await rasterizePdfPages(pdf, scale, quality, (p, n) => {
    onStep?.(`Compressing page ${p} of ${n}…`, Math.round((p / n) * 90));
  });

  // If still >= 95% of original size (already tight scan), apply stronger compaction pass
  if (rasterBytes.byteLength >= origLen * 0.95) {
    const strongerScale = preset === 'extreme' ? 0.72 : 0.95;
    const strongerQ = preset === 'extreme' ? 0.25 : 0.42;
    onStep?.('Applying deep image re-optimization…', 92);
    const deeper = await rasterizePdfPages(pdf, strongerScale, strongerQ);
    if (deeper.byteLength < rasterBytes.byteLength) {
      rasterBytes = deeper;
    }
  }

  try {
    const lossless = await stripPdfMetadataBytes(arrayBuffer);
    if (lossless.byteLength < rasterBytes.byteLength && lossless.byteLength < origLen * 0.92) {
      return { bytes: lossless, lossless: true };
    }
    if (rasterBytes.byteLength >= origLen && lossless.byteLength < origLen) {
      return { bytes: lossless, lossless: true };
    }
  } catch {
    /* ignore */
  }

  if (rasterBytes.byteLength >= origLen) {
    return { bytes: new Uint8Array(arrayBuffer), lossless: true };
  }

  return { bytes: rasterBytes, lossless: false };
}
