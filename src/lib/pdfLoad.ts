import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import './pdfWorker';
import { apiFetch } from './api';
import { dataUrlToBytes } from './utils';

export interface LoadedPdfResult {
  pdfDoc: PDFDocument;
  bytes: Uint8Array;
  wasOwnerUnlocked: boolean;
  usedRasterFallback: boolean;
}

/**
 * Safely load a PDF into `pdf-lib`:
 * 1. Normal unencrypted PDFs load directly via `PDFDocument.load` with zero overhead.
 * 2. Encrypted PDFs are tested against `pdfjs-dist` with an empty open password (`""`).
 *    - If a real user open password is required, throws a clear user-facing error.
 *    - If it is only owner-permission restricted (viewable in browsers/readers with no
 *      password prompt, common on RRB/Govt Admit Cards), losslessly strips the owner
 *      lock via `/unlock-pdf` (or cleanly raster-rebuilds in-browser if offline) so
 *      split/merge/rotate/extract NEVER crash or emit AES-corrupted blank pages.
 */
export async function loadPdfDocumentSafely(
  rawBytes: ArrayBuffer | Uint8Array,
  options?: { fileName?: string; onStatus?: (msg: string) => void }
): Promise<LoadedPdfResult> {
  const bytes = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes);

  try {
    const pdfDoc = await PDFDocument.load(bytes);
    return {
      pdfDoc,
      bytes,
      wasOwnerUnlocked: false,
      usedRasterFallback: false,
    };
  } catch (err: any) {
    const msg = String(err?.message || '').toLowerCase();
    if (!msg.includes('encrypt') && !msg.includes('password')) {
      throw err;
    }
  }

  // Probe with pdfjs-dist using empty password to distinguish owner-permission locks from user locks
  options?.onStatus?.('Checking PDF permission restrictions...');
  let pdfjsDoc: any = null;
  const loadingTask = pdfjsLib.getDocument({
    data: bytes.slice(0),
    password: '',
  });
  try {
    pdfjsDoc = await loadingTask.promise;
  } catch (probeErr: any) {
    const probeMsg = String(probeErr?.message || '').toLowerCase();
    const probeName = String(probeErr?.name || '').toLowerCase();
    try { await loadingTask?.destroy?.(); } catch {}
    if (probeName.includes('password') || probeMsg.includes('password') || probeMsg.includes('incorrect')) {
      throw new Error('This PDF is password-protected. Please unlock it using our Unlock PDF tool first.');
    }
    throw new Error('Could not read this PDF. The file may be damaged.');
  }

  // Opened cleanly with empty password -> owner-permission restricted only!
  // Step A: Lossless vector decrypt via backend `/unlock-pdf`
  try {
    options?.onStatus?.('Removing owner copy/split restriction losslessly...');
    const formData = new FormData();
    const cleanName = (options?.fileName || 'document.pdf').replace(/[^\w.\-() ]+/g, '_');
    formData.append('file', new Blob([bytes.slice(0)], { type: 'application/pdf' }), cleanName);
    formData.append('password', '');

    const resp = await apiFetch('/unlock-pdf', {
      method: 'POST',
      body: formData,
      timeoutMs: 12000,
      maxRetries: 0,
      suppressTelemetry: true,
    });

    if (resp.ok) {
      const unlockedBytes = new Uint8Array(await resp.arrayBuffer());
      const unlockedDoc = await PDFDocument.load(unlockedBytes);
      try { await pdfjsDoc?.cleanup?.(); await loadingTask?.destroy?.(); } catch {}
      return {
        pdfDoc: unlockedDoc,
        bytes: unlockedBytes,
        wasOwnerUnlocked: true,
        usedRasterFallback: false,
      };
    }
  } catch {
    // Backend unavailable or offline -> clean browser raster rebuild fallback below
  }

  // Step B: Clean browser-only fallback (never use raw `ignoreEncryption: true`, which blanks AES streams)
  try {
    const totalPages = Number(pdfjsDoc.numPages || 0);
    if (totalPages <= 0) {
      throw new Error('Empty encrypted PDF');
    }
    const rebuiltDoc = await PDFDocument.create();
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      options?.onStatus?.(`Decrypting page ${pageNum} of ${totalPages} locally...`);
      const page = await pdfjsDoc.getPage(pageNum);
      const baseVp = page.getViewport({ scale: 1.0 });
      const scale = Math.min(2.2, 2100 / Math.max(baseVp.width, baseVp.height, 1));
      const vp = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(vp.width));
      canvas.height = Math.max(1, Math.round(vp.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');

      await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;
      const jpgBytes = dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.92));
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup?.();

      const embedded = await rebuiltDoc.embedJpg(jpgBytes);
      const newPage = rebuiltDoc.addPage([baseVp.width, baseVp.height]);
      newPage.drawImage(embedded, {
        x: 0,
        y: 0,
        width: baseVp.width,
        height: baseVp.height,
      });
    }

    const fallbackBytes = new Uint8Array(await rebuiltDoc.save());
    const cleanDoc = await PDFDocument.load(fallbackBytes);
    return {
      pdfDoc: cleanDoc,
      bytes: fallbackBytes,
      wasOwnerUnlocked: true,
      usedRasterFallback: true,
    };
  } finally {
    try { await pdfjsDoc?.cleanup?.(); await loadingTask?.destroy?.(); } catch {}
  }
}
