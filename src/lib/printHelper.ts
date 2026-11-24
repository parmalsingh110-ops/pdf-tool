import { safeRevokeUrl, triggerBlobDownload } from './blobUrl';

const MOBILE_PRINT_UA_RE = /Android|iPhone|iPad|iPod/i;

function createHiddenPrintIframe(title?: string): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  if (title) {
    iframe.title = title;
  }
  return iframe;
}

/**
 * Prints an HTML document using a hidden same-origin iframe (avoids mobile popup blockers
 * and premature `window.close()` cancellation on iOS Safari & Android Chrome).
 * Awaits all images (`load` + `decode()`, capped at 5s) before opening the print dialog,
 * and cleans up only on `afterprint` or a 60-second safety timer.
 */
export async function printHtmlDocument(html: string, title?: string): Promise<boolean> {
  if (typeof document === 'undefined' || !document.body) {
    return false;
  }

  // Neutralize any legacy inline window.close() calls that abort mobile print jobs
  const sanitizedHtml = String(html || '').replace(/\b(?:window|self)\.close\s*\(\s*\)/gi, 'void 0');

  const iframe = createHiddenPrintIframe(title);
  document.body.appendChild(iframe);

  const iframeWin = iframe.contentWindow;
  const iframeDoc = iframe.contentDocument || iframeWin?.document;
  if (!iframeWin || !iframeDoc) {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    return false;
  }

  let cleaned = false;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (fallbackTimer !== null) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    try {
      iframeWin.removeEventListener('afterprint', onAfterPrint);
    } catch {}
    try {
      window.removeEventListener('afterprint', onAfterPrint);
    } catch {}
    try {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    } catch {}
  };

  const onAfterPrint = () => {
    // Allow mobile print spoolers a short window to finish snapshotting the DOM
    setTimeout(cleanup, 1000);
  };

  try {
    iframeDoc.open();
    iframeDoc.write(sanitizedHtml);
    iframeDoc.close();
    if (title) {
      try {
        iframeDoc.title = title;
      } catch {}
    }

    // Wait for every <img> in the print frame to load & decode (max 5s safety cap)
    const imgs = Array.from(iframeDoc.querySelectorAll('img'));
    if (imgs.length > 0) {
      const imagesReady = Promise.all(
        imgs.map((img) => {
          const loaded = img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.addEventListener('load', () => resolve(), { once: true });
                img.addEventListener('error', () => resolve(), { once: true });
              });
          return loaded.then(() => {
            if (typeof img.decode === 'function') {
              return img.decode().catch(() => {});
            }
          });
        })
      );
      await Promise.race([
        imagesReady,
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ]);
    }

    // Let layout settle for one paint frame
    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => setTimeout(resolve, 50));
      } else {
        setTimeout(resolve, 60);
      }
    });

    try {
      iframeWin.addEventListener('afterprint', onAfterPrint, { once: true });
    } catch {}
    try {
      window.addEventListener('afterprint', onAfterPrint, { once: true });
    } catch {}
    fallbackTimer = setTimeout(cleanup, 60_000);

    iframeWin.focus();
    iframeWin.print();
    return true;
  } catch {
    cleanup();
    return false;
  }
}

/**
 * Prints or hands off a PDF Blob cleanly across both mobile and desktop browsers:
 * - On Android / iOS, mobile browsers clip or fail printing PDFs inside hidden iframes/popups,
 *   so we share via Web Share API (`'shared'`) or fall back to downloading (`'downloaded'`).
 * - On desktop, loads the PDF Blob into a hidden iframe and triggers `print()` (`'printed'`),
 *   falling back to downloading if blocked, and revokes the Blob URL after 60s.
 */
export async function printPdfBlob(
  blob: Blob,
  filename = 'document.pdf'
): Promise<'printed' | 'shared' | 'downloaded'> {
  const pdfBlob =
    blob.type === 'application/pdf'
      ? blob
      : new Blob([blob], { type: 'application/pdf' });

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isMobile =
    MOBILE_PRINT_UA_RE.test(ua) ||
    (typeof navigator !== 'undefined' &&
      navigator.platform === 'MacIntel' &&
      (navigator.maxTouchPoints || 0) > 1);

  if (isMobile) {
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      typeof File !== 'undefined'
    ) {
      try {
        const file = new File([pdfBlob], filename, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: filename });
          return 'shared';
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return 'shared';
        }
        // Fall through to download when native share fails
      }
    }
    triggerBlobDownload(pdfBlob, filename);
    return 'downloaded';
  }

  if (typeof document === 'undefined' || !document.body) {
    triggerBlobDownload(pdfBlob, filename);
    return 'downloaded';
  }

  const blobUrl = URL.createObjectURL(pdfBlob);
  const iframe = createHiddenPrintIframe(filename);

  let cleaned = false;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (fallbackTimer !== null) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    try {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    } catch {}
    setTimeout(() => safeRevokeUrl(blobUrl), 60_000);
  };

  return new Promise<'printed' | 'shared' | 'downloaded'>((resolve) => {
    let settled = false;
    const finish = (status: 'printed' | 'downloaded') => {
      if (settled) return;
      settled = true;
      resolve(status);
    };

    const loadGuard = setTimeout(() => {
      if (!settled) {
        cleanup();
        triggerBlobDownload(pdfBlob, filename);
        finish('downloaded');
      }
    }, 8000);

    iframe.onload = () => {
      clearTimeout(loadGuard);
      try {
        const win = iframe.contentWindow;
        if (!win) throw new Error('No iframe window');

        const onAfterPrint = () => setTimeout(cleanup, 1000);
        try {
          win.addEventListener('afterprint', onAfterPrint, { once: true });
        } catch {}
        try {
          window.addEventListener('afterprint', onAfterPrint, { once: true });
        } catch {}
        fallbackTimer = setTimeout(cleanup, 60_000);

        setTimeout(() => {
          try {
            win.focus();
            win.print();
            finish('printed');
          } catch {
            cleanup();
            triggerBlobDownload(pdfBlob, filename);
            finish('downloaded');
          }
        }, 120);
      } catch {
        cleanup();
        triggerBlobDownload(pdfBlob, filename);
        finish('downloaded');
      }
    };

    iframe.onerror = () => {
      clearTimeout(loadGuard);
      cleanup();
      triggerBlobDownload(pdfBlob, filename);
      finish('downloaded');
    };

    iframe.src = blobUrl;
    document.body.appendChild(iframe);
  });
}
