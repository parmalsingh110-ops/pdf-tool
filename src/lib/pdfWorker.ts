// Centralised, idempotent pdf.js worker setup.
//
// Many tool pages also set `pdfjsLib.GlobalWorkerOptions.workerSrc` themselves.
// That's still safe because we use the same import URL and only assign if the
// value isn't already set. Importing this module from `main.tsx` (which we do)
// guarantees the worker is ready before any tool loads — including lazy/async
// routes — and protects against rare boot-time races.

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

try {
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  }
} catch {
  // Should never throw, but if pdf.js internals change shape we don't want to
  // brick app boot. Individual tool pages will fall back to their own setup.
}

/** Convenience accessor so tool pages can use a single import. */
export function getPdfjs() {
  return pdfjsLib;
}

export default pdfjsLib;
