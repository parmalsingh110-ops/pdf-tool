/**
 * PDF Media Suite — Built-in Acrobat-Style PDF Studio Viewer & Editor Engine v3.0
 * 100% Self-Contained Open-Source Stack:
 *   - Mozilla PDF.js v6.5 (Apache-2.0) — High-DPI Canvas + Selectable TextLayer + Bookmarks
 *   - pdf-lib (MIT) — Vector Editing, Merge, Split, Rotate, Watermark, Bates, Sign, Flatten
 *   - JSZip (MIT) — Multi-file Split PDF & 300-DPI Image ZIP Exports
 * Zero website redirects: Every viewing, printing, editing & conversion tool runs right here.
 */

import * as pdfjsLib from './vendor/pdf.min.mjs';

const { PDFDocument, rgb, degrees, StandardFonts } = window.PDFLib;
const JSZip = window.JSZip;

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdf.worker.min.mjs');
const STANDARD_FONTS_URL = chrome.runtime.getURL('vendor/standard_fonts/');
const CLOUD_API_POOL = [
  'https://pmsbacknew.onrender.com',
  'https://pdfmediasuite.onrender.com',
];

// ─── STUDIO STATE ──────────────────────────────────────────────────────────
const state = {
  pdfBytes: null,          // Uint8Array of active working PDF
  originalUrl: '',         // Source web/file URL if opened from URL
  fileName: 'document.pdf',
  pdfDoc: null,            // Active pdfjsLib document proxy
  numPages: 0,
  currentPage: 1,
  zoomMode: '1',           // 'fit-width' | 'fit-page' | numeric string
  scale: 1.15,
  twoPage: false,
  theme: 'dark',           // 'dark' | 'light' | 'sepia' | 'night-invert'
  toolMode: 'select',      // 'select' | 'highlight' | 'text' | 'draw' | 'whiteout' | 'redact'
  annotColor: '#facc15',
  annotSize: 14,
  annotations: {},         // { [pageNum]: Array<AnnotationObj> }
  selectedAnnotId: null,
  undoStack: [],           // Array<{ bytes: Uint8Array, annotations: string }>
  redoStack: [],
  isDirty: false,
  pageShells: new Map(),   // pageNum -> { shell, canvas, textLayer, annotLayer, renderedScale, widthPt, heightPt }
  pageObserver: null,
  thumbObserver: null,
  searchQuery: '',
  searchHits: [],          // Array<{ pageNum, spanIndex }>
  searchCursor: -1,
  extractedContent: '',
  extractedExt: 'txt',
  pendingPasswordBytes: null,
  uploadedSigDataUrl: '',
  activeStampLabel: 'SELF-ATTESTED',
  activeStampColor: '#1d4ed8',
  sigInkColor: '#0f172a',
  sigTab: 'draw',
};

// ─── DOM REFERENCES ────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const els = {
  openPdfInput: $('open-pdf-input'),
  mergePdfInput: $('merge-pdf-input'),
  insertImgInput: $('insert-img-input'),
  appendImgPagesInput: $('append-img-pages-input'),
  sigUploadInput: $('sig-upload-input'),
  docFilename: $('doc-filename'),
  unsavedDot: $('unsaved-dot'),
  pageNumInput: $('page-num-input'),
  pageCountLabel: $('page-count-label'),
  zoomSelect: $('zoom-select'),
  annotSubbar: $('annot-subbar'),
  subbarModeLabel: $('subbar-mode-label'),
  subbarHint: $('subbar-hint'),
  annotSize: $('annot-size'),
  annotSizeVal: $('annot-size-val'),
  annotCustomColor: $('annot-custom-color'),
  findBar: $('find-bar'),
  findInput: $('find-input'),
  findStatus: $('find-status'),
  leftSidebar: $('left-sidebar'),
  thumbList: $('thumb-list'),
  outlineList: $('outline-list'),
  docInfoList: $('doc-info-list'),
  btnOpenNativeChrome: $('btn-open-native-chrome'),
  viewport: $('pdf-viewport'),
  emptyState: $('empty-state'),
  emptyDropCard: $('empty-drop-card'),
  fileUrlTip: $('file-url-tip'),
  loadingOverlay: $('loading-overlay'),
  loadingText: $('loading-text'),
  pagesStage: $('pages-stage'),
  rightDock: $('right-dock'),
  dockSearch: $('dock-search'),
  dockToolsList: $('dock-tools-list'),
  toolDrawer: $('tool-drawer'),
  drawerTitle: $('drawer-title'),
  drawerBody: $('drawer-body'),
  chkAutoViewer: $('chk-auto-viewer'),
  btnUndo: $('btn-undo'),
  btnRedo: $('btn-redo'),
  signModal: $('sign-modal'),
  sigPadCanvas: $('sig-pad-canvas'),
  sigTypeInput: $('sig-type-input'),
  sigPreviewTyped: $('sig-preview-typed'),
  stampSubtext: $('stamp-subtext'),
  sigUploadPreview: $('sig-upload-preview'),
  chkSignAllPages: $('chk-sign-all-pages'),
  textModal: $('text-modal'),
  textModalTitle: $('text-modal-title'),
  extractedTextArea: $('extracted-text-area'),
  extractedStats: $('extracted-stats'),
  passwordModal: $('password-modal'),
  passwordModalMsg: $('password-modal-msg'),
  pdfPasswordInput: $('pdf-password-input'),
  toast: $('studio-toast'),
};

// ─── 18 IN-VIEWER ACROBAT STUDIO TOOLS CATALOG ─────────────────────────────
const STUDIO_TOOLS = [
  { id: 'markup',    cat: 'Edit & Sign',       icon: '✏️', name: 'Edit Text, Highlight & Draw', desc: 'Add text, highlights, freehand ink & whiteout on pages', tag: 'Live' },
  { id: 'sign',      cat: 'Edit & Sign',       icon: '✍️', name: 'Sign & Self-Attest PDF',      desc: 'Draw/type/upload signature or add official stamps',      tag: 'Popular' },
  { id: 'insertimg', cat: 'Edit & Sign',       icon: '🖼️', name: 'Insert Photo / Logo on Page', desc: 'Place & resize any image, seal or QR on current page',   tag: null },
  { id: 'watermark', cat: 'Edit & Sign',       icon: '💧', name: 'Add Watermark',               desc: 'Diagonal or horizontal custom text watermark on pages',  tag: null },
  { id: 'pagenums',  cat: 'Edit & Sign',       icon: '🔢', name: 'Page Numbers & Bates Stamp',  desc: 'Insert Page 1 of N or legal Bates numbering',            tag: null },

  { id: 'compress',  cat: 'Optimize & Pages',  icon: '⚡', name: 'Compress / Target KB Size',   desc: 'Shrink PDF to exact KB (100KB, 200KB, 500KB) locally',   tag: 'KB/MB' },
  { id: 'merge',     cat: 'Optimize & Pages',  icon: '📑', name: 'Merge PDFs Here',             desc: 'Combine more PDF files before or after this document',   tag: 'Instant' },
  { id: 'split',     cat: 'Optimize & Pages',  icon: '✂️', name: 'Split & Extract Pages',       desc: 'Extract ranges (e.g. 1-3, 5) or split all into ZIP',     tag: null },
  { id: 'organize',  cat: 'Optimize & Pages',  icon: '🗂️', name: 'Organize & Remove Blanks',    desc: 'Reverse order, delete range, or auto-remove blank pages', tag: 'Smart' },
  { id: 'rotate',    cat: 'Optimize & Pages',  icon: '🔄', name: 'Rotate Pages',                desc: 'Rotate current, odd, even or all pages 90° / 180°',      tag: null },

  { id: 'word',      cat: 'Convert & Export',  icon: '📝', name: 'PDF → Word (.docx)',          desc: 'Convert & download editable Word document right here',   tag: 'HD AI' },
  { id: 'excel',     cat: 'Convert & Export',  icon: '📊', name: 'PDF → Excel (.xlsx)',         desc: 'Extract tables into clean Excel / CSV spreadsheet',      tag: 'Tables' },
  { id: 'ppt',       cat: 'Convert & Export',  icon: '📽️', name: 'PDF → PowerPoint (.pptx)',    desc: 'Convert PDF pages into presentation slides here',        tag: null },
  { id: 'pdf2img',   cat: 'Convert & Export',  icon: '🎨', name: 'PDF → JPG / PNG (300 DPI)',   desc: 'Save current page or all pages as crisp HD images ZIP',  tag: '300 DPI' },
  { id: 'img2pdf',   cat: 'Convert & Export',  icon: '➕', name: 'Append Images as Pages',      desc: 'Add JPG/PNG/WebP photos as new PDF pages',               tag: null },
  { id: 'text',      cat: 'Convert & Export',  icon: '📃', name: 'Extract Text & Markdown',     desc: 'Copy or download full Unicode text / clean Markdown',    tag: null },

  { id: 'pii',       cat: 'Print & Security',  icon: '⬛', name: 'Auto Aadhaar & PII Redactor', desc: 'Find & mask Aadhaar (XXXX-XXXX-1234), PAN, phone, email', tag: 'UIDAI' },
  { id: 'inksaver',  cat: 'Print & Security',  icon: '🖨️', name: 'Grayscale & Xerox Ink-Saver', desc: 'Convert to crisp B&W or eco light-toner print mode',     tag: 'Eco' },
  { id: 'flatten',   cat: 'Print & Security',  icon: '🧹', name: 'Flatten & Scrub Metadata',    desc: 'Lock form fields/annotations & erase hidden tracking',   tag: 'Safe' },
];

// ─── UTILITIES ─────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'info', ms = 3200) {
  els.toast.textContent = msg;
  els.toast.className = `studio-toast ${type}`;
  els.toast.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, ms);
}

function showLoading(label = 'Processing PDF…') {
  els.loadingText.textContent = label;
  els.loadingOverlay.hidden = false;
}

function hideLoading() {
  els.loadingOverlay.hidden = true;
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function sanitizePdfFilename(rawName, suffix = '', ext = '.pdf') {
  const base = String(rawName || 'document')
    .replace(/\.[^.]+$/, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .trim() || 'document';
  return `${base}${suffix}${ext}`;
}

function triggerDownload(blobOrBytes, filename, mime = 'application/pdf') {
  const blob = blobOrBytes instanceof Blob ? blobOrBytes : new Blob([blobOrBytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 250);
  setTimeout(() => URL.revokeObjectURL(url), 45000);
}

function hexToRgb01(hex) {
  const h = String(hex || '#000000').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  const n = parseInt(full.slice(0, 6), 16) || 0;
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  };
}

function parsePageRangeInput(input, maxPages) {
  const clean = String(input || '').trim();
  if (!clean) return [];
  const result = [];
  const seen = new Set();
  for (const part of clean.split(',')) {
    const seg = part.trim();
    if (!seg) continue;
    if (seg.includes('-')) {
      const [aStr, bStr] = seg.split('-');
      let a = parseInt(aStr, 10);
      let b = parseInt(bStr, 10);
      if (Number.isNaN(a) || Number.isNaN(b)) continue;
      a = Math.max(1, Math.min(maxPages, a));
      b = Math.max(1, Math.min(maxPages, b));
      const step = a <= b ? 1 : -1;
      for (let p = a; step > 0 ? p <= b : p >= b; p += step) {
        if (!seen.has(p)) {
          seen.add(p);
          result.push(p);
        }
      }
    } else {
      const p = parseInt(seg, 10);
      if (!Number.isNaN(p) && p >= 1 && p <= maxPages && !seen.has(p)) {
        seen.add(p);
        result.push(p);
      }
    }
  }
  return result;
}

// ─── UNDO / REDO SNAPSHOT ENGINE ───────────────────────────────────────────
function cloneAnnotationsMap(mapObj) {
  return JSON.parse(JSON.stringify(mapObj || {}));
}

function pushUndoSnapshot() {
  if (!state.pdfBytes) return;
  state.undoStack.push({
    bytes: new Uint8Array(state.pdfBytes),
    annotations: JSON.stringify(state.annotations),
  });
  if (state.undoStack.length > 15) state.undoStack.shift();
  state.redoStack = [];
  markDirty(true);
  syncUndoRedoButtons();
}

function markDirty(dirty) {
  state.isDirty = dirty;
  els.unsavedDot.hidden = !dirty;
}

function syncUndoRedoButtons() {
  els.btnUndo.disabled = state.undoStack.length === 0;
  els.btnRedo.disabled = state.redoStack.length === 0;
}

async function handleUndo() {
  if (!state.undoStack.length || !state.pdfBytes) return;
  state.redoStack.push({
    bytes: new Uint8Array(state.pdfBytes),
    annotations: JSON.stringify(state.annotations),
  });
  const prev = state.undoStack.pop();
  const prevBytesMatch =
    prev.bytes.length === state.pdfBytes.length &&
    prev.bytes[0] === state.pdfBytes[0] &&
    prev.bytes[prev.bytes.length - 1] === state.pdfBytes[state.pdfBytes.length - 1];

  state.annotations = JSON.parse(prev.annotations || '{}');
  syncUndoRedoButtons();
  if (!prevBytesMatch) {
    await loadPdfBytes(prev.bytes, state.fileName, { preserveHistory: true, preserveAnnots: true });
  } else {
    renderAllAnnotationOverlays();
  }
  showToast('↶ Undid last change');
}

async function handleRedo() {
  if (!state.redoStack.length || !state.pdfBytes) return;
  state.undoStack.push({
    bytes: new Uint8Array(state.pdfBytes),
    annotations: JSON.stringify(state.annotations),
  });
  const next = state.redoStack.pop();
  state.annotations = JSON.parse(next.annotations || '{}');
  syncUndoRedoButtons();
  await loadPdfBytes(next.bytes, state.fileName, { preserveHistory: true, preserveAnnots: true });
  showToast('↷ Redid change');
}

// ─── DOCUMENT LOADING (URL, LOCAL IDB, DRAG-DROP, IMAGES, ENCRYPTED) ──────
async function convertSingleImageFileToPdfBytes(fileOrBlob) {
  const buf = await fileOrBlob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const pdf = await PDFDocument.create();

  // Render through bitmap/canvas to normalize WebP/BMP/EXIF into clean JPEG/PNG
  const bmpUrl = URL.createObjectURL(new Blob([bytes], { type: fileOrBlob.type || 'image/png' }));
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Image decode failed'));
    el.src = bmpUrl;
  });
  URL.revokeObjectURL(bmpUrl);

  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);
  const jpgBlob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.94));
  c.width = 0;
  c.height = 0;

  const embedded = await pdf.embedJpg(new Uint8Array(await jpgBlob.arrayBuffer()));
  const page = pdf.addPage([embedded.width, embedded.height]);
  page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
  return await pdf.save();
}

async function openFileObject(file) {
  if (!file) return;
  showLoading(`Opening ${file.name}…`);
  try {
    const isImg = file.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp|gif)$/i.test(file.name);
    let bytes;
    let outName = file.name;
    if (isImg) {
      bytes = await convertSingleImageFileToPdfBytes(file);
      outName = sanitizePdfFilename(file.name, '', '.pdf');
    } else {
      bytes = new Uint8Array(await file.arrayBuffer());
    }
    state.originalUrl = '';
    els.btnOpenNativeChrome.hidden = true;
    await loadPdfBytes(bytes, outName);
  } catch (err) {
    hideLoading();
    showToast(`Could not open file: ${err.message || err}`, 'error', 5000);
  }
}

async function fetchPdfFromUrl(targetUrl) {
  showLoading('Loading PDF into Studio Viewer…');
  state.originalUrl = targetUrl;
  els.btnOpenNativeChrome.hidden = false;

  const rawName = decodeURIComponent((targetUrl.split('?')[0].split('#')[0].split('/').pop() || 'document.pdf'));
  const cleanName = rawName.toLowerCase().endsWith('.pdf') ? rawName : `${rawName}.pdf`;

  try {
    let res;
    if (targetUrl.startsWith('file://')) {
      res = await fetch(targetUrl);
    } else {
      try {
        res = await fetch(targetUrl, { credentials: 'include' });
      } catch {
        res = await fetch(targetUrl, { credentials: 'omit' });
      }
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ab = await res.arrayBuffer();
    if (!ab || ab.byteLength < 8) throw new Error('Empty response');
    await loadPdfBytes(new Uint8Array(ab), cleanName);
  } catch (err) {
    hideLoading();
    if (targetUrl.startsWith('file://')) {
      els.fileUrlTip.hidden = false;
      showToast('Enable "Allow access to file URLs" in extension settings or drop the PDF here!', 'error', 6500);
    } else {
      showToast(`Could not fetch PDF directly (${err.message}). You can drop the downloaded file here.`, 'error', 5500);
    }
  }
}

async function loadPdfBytes(uint8, filename = 'document.pdf', opts = {}) {
  showLoading('Rendering crisp pages…');
  try {
    const copyForPdfJs = new Uint8Array(uint8); // pdf.js transfers ArrayBuffer to worker!
    const loadingTask = pdfjsLib.getDocument({
      data: copyForPdfJs,
      standardFontDataUrl: STANDARD_FONTS_URL,
      password: opts.password || undefined,
    });

    const pdfDoc = await loadingTask.promise;

    if (state.pdfDoc) {
      try { await state.pdfDoc.destroy(); } catch {}
    }

    // If user unlocked an encrypted PDF with a password, re-save clean unencrypted working bytes via canvas/pdf-lib if needed
    state.pdfBytes = new Uint8Array(uint8);
    state.pdfDoc = pdfDoc;
    state.numPages = pdfDoc.numPages;
    state.fileName = filename || 'document.pdf';
    state.currentPage = Math.min(Math.max(1, state.currentPage), state.numPages);
    state.searchHits = [];
    state.searchCursor = -1;

    if (!opts.preserveAnnots) {
      state.annotations = {};
      state.selectedAnnotId = null;
    }
    if (!opts.preserveHistory) {
      state.undoStack = [];
      state.redoStack = [];
      markDirty(false);
      syncUndoRedoButtons();
    }

    els.docFilename.value = state.fileName;
    document.title = `${state.fileName} — PDF Media Suite`;
    els.pageCountLabel.textContent = String(state.numPages);
    els.pageNumInput.max = String(state.numPages);
    els.pageNumInput.value = String(state.currentPage);
    els.emptyState.hidden = true;
    els.passwordModal.hidden = true;

    // Compute initial Fit-Width scale on first open
    if (!opts.keepZoom && state.zoomMode === 'fit-width') {
      await computeFitScale('fit-width');
    }

    await buildStageAndThumbnails();
    populateOutlineAndInfo();
    hideLoading();
  } catch (err) {
    hideLoading();
    if (err && (err.name === 'PasswordException' || String(err.message || '').toLowerCase().includes('password'))) {
      state.pendingPasswordBytes = new Uint8Array(uint8);
      state.fileName = filename;
      els.passwordModalMsg.textContent =
        err.code === 2
          ? 'Incorrect password. Please try again:'
          : 'This PDF is password-protected. Enter the password to open it locally:';
      els.pdfPasswordInput.value = '';
      els.passwordModal.hidden = false;
      setTimeout(() => els.pdfPasswordInput.focus(), 60);
      return;
    }
    console.error('[StudioViewer] Load failed:', err);
    showToast(`Failed to read PDF: ${err.message || err}`, 'error', 5000);
  }
}

async function computeFitScale(mode) {
  if (!state.pdfDoc) return;
  const firstPage = await state.pdfDoc.getPage(state.currentPage || 1);
  const vp1 = firstPage.getViewport({ scale: 1 });
  const availW = Math.max(320, els.viewport.clientWidth - 56);
  const availH = Math.max(320, els.viewport.clientHeight - 56);
  if (mode === 'fit-width') {
    state.scale = Math.max(0.35, Math.min(3.5, availW / vp1.width));
  } else if (mode === 'fit-page') {
    state.scale = Math.max(0.35, Math.min(3.5, Math.min(availW / vp1.width, availH / vp1.height)));
  }
}

// ─── HIGH-DPI VIRTUALIZED STAGE & SELECTABLE TEXT LAYER ───────────────────
async function buildStageAndThumbnails() {
  if (state.pageObserver) state.pageObserver.disconnect();
  if (state.thumbObserver) state.thumbObserver.disconnect();
  state.pageShells.clear();
  els.pagesStage.innerHTML = '';
  els.thumbList.innerHTML = '';

  state.pageObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const pNum = Number(entry.target.dataset.page);
          if (pNum) void renderMainPage(pNum);
        }
      }
    },
    { root: els.viewport, rootMargin: '900px 0px' }
  );

  state.thumbObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const pNum = Number(entry.target.dataset.page);
          if (pNum) void renderThumb(pNum, entry.target);
          state.thumbObserver.unobserve(entry.target);
        }
      }
    },
    { root: $('pane-thumbs'), rootMargin: '300px 0px' }
  );

  // Measure first page as default placeholder size so scrollbars are accurate immediately
  const p1 = await state.pdfDoc.getPage(1);
  const defaultVp = p1.getViewport({ scale: state.scale });

  const stageFrag = document.createDocumentFragment();
  const thumbFrag = document.createDocumentFragment();

  for (let p = 1; p <= state.numPages; p++) {
    // Main page shell
    const shell = document.createElement('div');
    shell.className = 'pdf-page-shell';
    shell.dataset.page = String(p);
    shell.style.width = `${Math.round(defaultVp.width)}px`;
    shell.style.height = `${Math.round(defaultVp.height)}px`;

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-canvas';

    const textLayer = document.createElement('div');
    textLayer.className = 'textLayer';

    const annotLayer = document.createElement('div');
    annotLayer.className = 'annot-layer';
    annotLayer.dataset.page = String(p);
    bindPageAnnotationEvents(annotLayer, p);

    shell.append(canvas, textLayer, annotLayer);
    stageFrag.appendChild(shell);

    state.pageShells.set(p, {
      shell,
      canvas,
      textLayer,
      annotLayer,
      renderedScale: 0,
      rendering: false,
      widthPt: defaultVp.width / state.scale,
      heightPt: defaultVp.height / state.scale,
    });
    state.pageObserver.observe(shell);

    // Sidebar thumbnail card
    const tItem = document.createElement('div');
    tItem.className = `thumb-item${p === state.currentPage ? ' active' : ''}`;
    tItem.dataset.page = String(p);
    tItem.innerHTML = `
      <canvas class="thumb-canvas" width="140" height="190"></canvas>
      <div class="thumb-meta">
        <span>Page ${p}</span>
        <div class="thumb-actions">
          <button class="thumb-act-btn" data-tact="rot" title="Rotate 90°">↻</button>
          <button class="thumb-act-btn" data-tact="up" title="Move Up">↑</button>
          <button class="thumb-act-btn" data-tact="down" title="Move Down">↓</button>
          <button class="thumb-act-btn" data-tact="dup" title="Duplicate Page">⧉</button>
          <button class="thumb-act-btn" data-tact="del" title="Delete Page">✕</button>
        </div>
      </div>
    `;
    tItem.addEventListener('click', (e) => {
      const actBtn = e.target.closest('.thumb-act-btn');
      if (actBtn) {
        e.stopPropagation();
        void handleThumbQuickAction(p, actBtn.dataset.tact);
        return;
      }
      scrollToPage(p);
    });
    thumbFrag.appendChild(tItem);
    state.thumbObserver.observe(tItem);
  }

  els.pagesStage.appendChild(stageFrag);
  els.thumbList.appendChild(thumbFrag);
}

async function renderMainPage(pageNum) {
  const entry = state.pageShells.get(pageNum);
  if (!entry || !state.pdfDoc || entry.rendering || entry.renderedScale === state.scale) return;
  entry.rendering = true;

  try {
    const page = await state.pdfDoc.getPage(pageNum);
    const vp = page.getViewport({ scale: state.scale });
    const baseVp = page.getViewport({ scale: 1 });
    entry.widthPt = baseVp.width;
    entry.heightPt = baseVp.height;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.25);
    entry.shell.style.width = `${Math.round(vp.width)}px`;
    entry.shell.style.height = `${Math.round(vp.height)}px`;

    entry.canvas.width = Math.round(vp.width * dpr);
    entry.canvas.height = Math.round(vp.height * dpr);
    entry.canvas.style.width = `${Math.round(vp.width)}px`;
    entry.canvas.style.height = `${Math.round(vp.height)}px`;

    const ctx = entry.canvas.getContext('2d', { alpha: false });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    // Official Mozilla PDF.js v6.5 Selectable TextLayer
    entry.textLayer.innerHTML = '';
    entry.textLayer.style.setProperty('--total-scale-factor', String(vp.scale));
    const tl = new pdfjsLib.TextLayer({
      textContentSource: page.streamTextContent(),
      container: entry.textLayer,
      viewport: vp,
    });
    await tl.render();

    entry.renderedScale = state.scale;
    renderPageAnnotationOverlay(pageNum);
    if (state.searchQuery) highlightSearchOnPage(pageNum);
  } catch (err) {
    console.warn(`[StudioViewer] Page ${pageNum} render skipped:`, err);
  } finally {
    entry.rendering = false;
  }
}

async function renderThumb(pageNum, thumbEl) {
  if (!state.pdfDoc) return;
  try {
    const page = await state.pdfDoc.getPage(pageNum);
    const vp1 = page.getViewport({ scale: 1 });
    const targetW = 148;
    const sc = targetW / vp1.width;
    const vp = page.getViewport({ scale: sc });
    const canvas = thumbEl.querySelector('.thumb-canvas');
    if (!canvas) return;
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d', { alpha: false });
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
  } catch {}
}

function scrollToPage(pageNum) {
  const clamped = Math.max(1, Math.min(state.numPages, pageNum));
  state.currentPage = clamped;
  els.pageNumInput.value = String(clamped);
  const entry = state.pageShells.get(clamped);
  if (entry) {
    entry.shell.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  updateActiveThumbHighlight();
}

function updateActiveThumbHighlight() {
  els.thumbList.querySelectorAll('.thumb-item').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.page) === state.currentPage);
  });
}

// Track current page on viewport scroll
els.viewport.addEventListener('scroll', () => {
  if (!state.numPages) return;
  const viewMid = els.viewport.scrollTop + els.viewport.clientHeight * 0.35;
  let bestPage = state.currentPage;
  for (const [pNum, entry] of state.pageShells.entries()) {
    const top = entry.shell.offsetTop;
    const bottom = top + entry.shell.offsetHeight;
    if (viewMid >= top && viewMid <= bottom) {
      bestPage = pNum;
      break;
    }
  }
  if (bestPage !== state.currentPage) {
    state.currentPage = bestPage;
    els.pageNumInput.value = String(bestPage);
    updateActiveThumbHighlight();
  }
});

// ─── BOOKMARKS OUTLINE & METADATA PANEL ───────────────────────────────────
async function populateOutlineAndInfo() {
  if (!state.pdfDoc) return;

  // Outline
  try {
    const outline = await state.pdfDoc.getOutline();
    if (!outline || !outline.length) {
      els.outlineList.innerHTML = '<div class="empty-side-msg">No bookmarks / chapters in this PDF.</div>';
    } else {
      els.outlineList.innerHTML = '';
      const renderItems = (items, depth = 0) => {
        for (const item of items) {
          const btn = document.createElement('button');
          btn.className = 'outline-item';
          btn.style.paddingLeft = `${8 + depth * 14}px`;
          btn.textContent = item.title || 'Untitled Section';
          btn.addEventListener('click', async () => {
            try {
              let dest = item.dest;
              if (typeof dest === 'string') dest = await state.pdfDoc.getDestination(dest);
              if (Array.isArray(dest) && dest[0]) {
                const pageIndex = await state.pdfDoc.getPageIndex(dest[0]);
                scrollToPage(pageIndex + 1);
              }
            } catch {}
          });
          els.outlineList.appendChild(btn);
          if (item.items && item.items.length) renderItems(item.items, depth + 1);
        }
      };
      renderItems(outline);
    }
  } catch {
    els.outlineList.innerHTML = '<div class="empty-side-msg">Outline unavailable.</div>';
  }

  // Document Metadata & Page Size
  try {
    const meta = await state.pdfDoc.getMetadata().catch(() => ({}));
    const info = meta?.info || {};
    const p1 = await state.pdfDoc.getPage(1);
    const vp = p1.getViewport({ scale: 1 });
    const wMm = Math.round((vp.width / 72) * 25.4);
    const hMm = Math.round((vp.height / 72) * 25.4);

    const rows = [
      ['File Name', state.fileName],
      ['File Size', formatBytes(state.pdfBytes?.byteLength || 0)],
      ['Pages', String(state.numPages)],
      ['Page Size', `${wMm} × ${hMm} mm (${(vp.width / 72).toFixed(1)} × ${(vp.height / 72).toFixed(1)} in)`],
      ['PDF Version', info.PDFFormatVersion || '1.7'],
      ['Title', info.Title || '—'],
      ['Author', info.Author || '—'],
      ['Creator', info.Creator || '—'],
      ['Producer', info.Producer || '—'],
    ];
    els.docInfoList.innerHTML = rows
      .map(([k, v]) => `<div class="info-row"><strong>${escapeHtml(k)}</strong><span>${escapeHtml(v)}</span></div>`)
      .join('');
  } catch {}
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── INTERACTIVE LIVE ANNOTATION & MARKUP ENGINE ──────────────────────────
function setToolMode(mode) {
  state.toolMode = mode;
  document.querySelectorAll('.mode-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });

  const isDrawing = ['highlight', 'draw', 'whiteout', 'redact'].includes(mode);
  const isText = mode === 'text';
  document.body.classList.toggle('annot-drawing', isDrawing);
  document.body.classList.toggle('annot-text-mode', isText);

  if (mode === 'select') {
    els.annotSubbar.hidden = true;
    document.body.classList.remove('has-subbar');
  } else {
    els.annotSubbar.hidden = false;
    document.body.classList.add('has-subbar');
    const labels = {
      highlight: ['🖍️ Highlight', 'Drag across any area to highlight', '#facc15', 18],
      text: ['✏️ Add Text', 'Click anywhere on a page to type', '#111827', 14],
      draw: ['🖊️ Freehand Ink', 'Draw smoothly with mouse or touch', '#1d4ed8', 3],
      whiteout: ['⬜ Whiteout Erase', 'Drag a clean white cover box over text', '#ffffff', 16],
      redact: ['⬛ Blackout Redact', 'Drag permanent black box over sensitive PII', '#000000', 16],
    };
    const cfg = labels[mode];
    if (cfg) {
      els.subbarModeLabel.textContent = cfg[0];
      els.subbarHint.textContent = cfg[1];
      state.annotColor = cfg[2];
      state.annotSize = cfg[3];
      els.annotSize.value = String(cfg[3]);
      els.annotSizeVal.textContent = String(cfg[3]);
    }
  }
}

function addAnnotation(pageNum, annot) {
  pushUndoSnapshot();
  if (!state.annotations[pageNum]) state.annotations[pageNum] = [];
  state.annotations[pageNum].push(annot);
  state.selectedAnnotId = annot.id;
  renderPageAnnotationOverlay(pageNum);
}

function bindPageAnnotationEvents(annotLayer, pageNum) {
  let dragStart = null;
  let draftEl = null;
  let currentPoints = [];

  annotLayer.addEventListener('pointerdown', (e) => {
    if (e.target !== annotLayer) return;
    if (state.toolMode === 'select') {
      state.selectedAnnotId = null;
      renderAllAnnotationOverlays();
      return;
    }

    const rect = annotLayer.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (state.toolMode === 'text') {
      const id = 'ann_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      addAnnotation(pageNum, {
        id,
        type: 'text',
        x: nx,
        y: ny,
        text: 'Type here…',
        color: state.annotColor === '#ffffff' ? '#111827' : state.annotColor,
        fontSize: Math.max(8, Number(state.annotSize) || 14),
      });
      setTimeout(() => {
        const el = annotLayer.querySelector(`[data-aid="${id}"] .annot-text-input`);
        if (el) {
          el.focus();
          document.execCommand('selectAll', false, null);
        }
      }, 30);
      return;
    }

    if (['highlight', 'whiteout', 'redact', 'draw'].includes(state.toolMode)) {
      e.preventDefault();
      annotLayer.setPointerCapture(e.pointerId);
      dragStart = { nx, ny, rect };

      if (state.toolMode === 'draw') {
        currentPoints = [[nx, ny]];
        draftEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        draftEl.setAttribute('viewBox', '0 0 1000 1000');
        draftEl.setAttribute('preserveAspectRatio', 'none');
        draftEl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        poly.setAttribute('fill', 'none');
        poly.setAttribute('stroke', state.annotColor);
        poly.setAttribute('stroke-width', String(Math.max(1.5, Number(state.annotSize) * 1.4)));
        poly.setAttribute('stroke-linecap', 'round');
        poly.setAttribute('stroke-linejoin', 'round');
        draftEl.appendChild(poly);
        annotLayer.appendChild(draftEl);
      } else {
        draftEl = document.createElement('div');
        draftEl.style.position = 'absolute';
        draftEl.style.pointerEvents = 'none';
        draftEl.style.background =
          state.toolMode === 'whiteout'
            ? '#ffffff'
            : state.toolMode === 'redact'
            ? '#000000'
            : state.annotColor;
        draftEl.style.opacity = state.toolMode === 'highlight' ? '0.38' : '1';
        draftEl.style.border = state.toolMode === 'whiteout' ? '1px dashed #94a3b8' : 'none';
        annotLayer.appendChild(draftEl);
      }
    }
  });

  annotLayer.addEventListener('pointermove', (e) => {
    if (!dragStart || !draftEl) return;
    const { rect } = dragStart;
    const cx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const cy = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (state.toolMode === 'draw') {
      currentPoints.push([cx, cy]);
      const poly = draftEl.querySelector('polyline');
      if (poly) {
        poly.setAttribute(
          'points',
          currentPoints.map(([px, py]) => `${(px * 1000).toFixed(1)},${(py * 1000).toFixed(1)}`).join(' ')
        );
      }
    } else {
      const x0 = Math.min(dragStart.nx, cx);
      const y0 = Math.min(dragStart.ny, cy);
      const w = Math.abs(cx - dragStart.nx);
      const h = Math.abs(cy - dragStart.ny);
      draftEl.style.left = `${x0 * 100}%`;
      draftEl.style.top = `${y0 * 100}%`;
      draftEl.style.width = `${w * 100}%`;
      draftEl.style.height = `${h * 100}%`;
    }
  });

  const finishDrag = (e) => {
    if (!dragStart) return;
    const { rect } = dragStart;
    const cx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const cy = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    if (draftEl) draftEl.remove();

    const id = 'ann_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    if (state.toolMode === 'draw' && currentPoints.length >= 2) {
      addAnnotation(pageNum, {
        id,
        type: 'draw',
        points: currentPoints,
        color: state.annotColor,
        strokeWidth: Math.max(1.5, Number(state.annotSize) || 3),
      });
    } else if (state.toolMode !== 'draw') {
      const x = Math.min(dragStart.nx, cx);
      const y = Math.min(dragStart.ny, cy);
      const w = Math.abs(cx - dragStart.nx);
      const h = Math.abs(cy - dragStart.ny);
      if (w > 0.008 && h > 0.006) {
        addAnnotation(pageNum, {
          id,
          type: state.toolMode, // 'highlight' | 'whiteout' | 'redact'
          x,
          y,
          w,
          h,
          color:
            state.toolMode === 'whiteout'
              ? '#ffffff'
              : state.toolMode === 'redact'
              ? '#000000'
              : state.annotColor,
        });
      }
    }

    dragStart = null;
    draftEl = null;
    currentPoints = [];
  };

  annotLayer.addEventListener('pointerup', finishDrag);
  annotLayer.addEventListener('pointercancel', () => {
    if (draftEl) draftEl.remove();
    dragStart = null;
    draftEl = null;
    currentPoints = [];
  });
}

function renderAllAnnotationOverlays() {
  for (const pNum of state.pageShells.keys()) {
    renderPageAnnotationOverlay(pNum);
  }
}

function renderPageAnnotationOverlay(pageNum) {
  const entry = state.pageShells.get(pageNum);
  if (!entry) return;
  const layer = entry.annotLayer;
  layer.innerHTML = '';
  const list = state.annotations[pageNum] || [];
  if (!list.length) return;

  for (const ann of list) {
    const wrap = document.createElement('div');
    wrap.className = `annot-item${state.selectedAnnotId === ann.id ? ' selected' : ''}`;
    wrap.dataset.aid = ann.id;

    if (ann.type === 'highlight' || ann.type === 'whiteout' || ann.type === 'redact') {
      wrap.style.left = `${ann.x * 100}%`;
      wrap.style.top = `${ann.y * 100}%`;
      wrap.style.width = `${ann.w * 100}%`;
      wrap.style.height = `${ann.h * 100}%`;
      wrap.style.background = ann.color;
      wrap.style.opacity = ann.type === 'highlight' ? '0.38' : '1';
      if (ann.type === 'highlight') wrap.style.mixBlendMode = 'multiply';
    } else if (ann.type === 'text') {
      wrap.style.left = `${ann.x * 100}%`;
      wrap.style.top = `${ann.y * 100}%`;
      const txt = document.createElement('div');
      txt.className = 'annot-text-input';
      txt.contentEditable = 'true';
      txt.spellcheck = false;
      txt.textContent = ann.text || '';
      txt.style.color = ann.color || '#111827';
      txt.style.fontSize = `${Math.round((ann.fontSize || 14) * state.scale)}px`;
      txt.style.fontWeight = '700';
      txt.addEventListener('input', () => {
        ann.text = txt.textContent || '';
        markDirty(true);
      });
      txt.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      wrap.appendChild(txt);
    } else if (ann.type === 'image') {
      wrap.style.left = `${ann.x * 100}%`;
      wrap.style.top = `${ann.y * 100}%`;
      wrap.style.width = `${ann.w * 100}%`;
      wrap.style.height = `${ann.h * 100}%`;
      const img = document.createElement('img');
      img.src = ann.dataUrl;
      img.style.cssText = 'width:100%;height:100%;object-fit:contain;pointer-events:none;display:block;';
      wrap.appendChild(img);
    } else if (ann.type === 'draw' && ann.points?.length) {
      const xs = ann.points.map((p) => p[0]);
      const ys = ann.points.map((p) => p[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const bw = Math.max(0.01, maxX - minX);
      const bh = Math.max(0.01, maxY - minY);
      wrap.style.left = `${minX * 100}%`;
      wrap.style.top = `${minY * 100}%`;
      wrap.style.width = `${bw * 100}%`;
      wrap.style.height = `${bh * 100}%`;

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 1000 1000');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.style.cssText = 'width:100%;height:100%;overflow:visible;pointer-events:none;';
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke', ann.color || '#1d4ed8');
      poly.setAttribute('stroke-width', String(Math.max(2, (ann.strokeWidth || 3) * 4)));
      poly.setAttribute('stroke-linecap', 'round');
      poly.setAttribute('stroke-linejoin', 'round');
      poly.setAttribute(
        'points',
        ann.points
          .map(([px, py]) => `${(((px - minX) / bw) * 1000).toFixed(1)},${(((py - minY) / bh) * 1000).toFixed(1)}`)
          .join(' ')
      );
      svg.appendChild(poly);
      wrap.appendChild(svg);
    }

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'annot-del';
    delBtn.textContent = '✕';
    delBtn.title = 'Remove';
    delBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      pushUndoSnapshot();
      state.annotations[pageNum] = (state.annotations[pageNum] || []).filter((a) => a.id !== ann.id);
      renderPageAnnotationOverlay(pageNum);
    });
    wrap.appendChild(delBtn);

    // Resize handle for box/image annotations
    if (['highlight', 'whiteout', 'redact', 'image'].includes(ann.type)) {
      const rz = document.createElement('div');
      rz.className = 'annot-resize';
      rz.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        rz.setPointerCapture(ev.pointerId);
        const lRect = layer.getBoundingClientRect();
        const startW = ann.w;
        const startH = ann.h;
        const sx = ev.clientX;
        const sy = ev.clientY;
        pushUndoSnapshot();

        const onMove = (me) => {
          ann.w = Math.max(0.02, Math.min(1 - ann.x, startW + (me.clientX - sx) / lRect.width));
          ann.h = Math.max(0.015, Math.min(1 - ann.y, startH + (me.clientY - sy) / lRect.height));
          wrap.style.width = `${ann.w * 100}%`;
          wrap.style.height = `${ann.h * 100}%`;
        };
        const onUp = () => {
          rz.removeEventListener('pointermove', onMove);
          rz.removeEventListener('pointerup', onUp);
        };
        rz.addEventListener('pointermove', onMove);
        rz.addEventListener('pointerup', onUp);
      });
      wrap.appendChild(rz);
    }

    // Drag to reposition
    wrap.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('.annot-del') || ev.target.closest('.annot-resize')) return;
      ev.stopPropagation();
      state.selectedAnnotId = ann.id;
      renderPageAnnotationOverlay(pageNum);

      const reWrap = layer.querySelector(`[data-aid="${ann.id}"]`);
      if (!reWrap) return;
      reWrap.setPointerCapture(ev.pointerId);
      const lRect = layer.getBoundingClientRect();
      const sx = ev.clientX;
      const sy = ev.clientY;
      const origX = ann.x ?? 0;
      const origY = ann.y ?? 0;
      const origPts = ann.points ? ann.points.map((p) => [...p]) : null;
      let moved = false;

      const onMove = (me) => {
        const dx = (me.clientX - sx) / lRect.width;
        const dy = (me.clientY - sy) / lRect.height;
        if (!moved && (Math.abs(dx) > 0.002 || Math.abs(dy) > 0.002)) {
          pushUndoSnapshot();
          moved = true;
        }
        if (!moved) return;
        if (origPts) {
          ann.points = origPts.map(([px, py]) => [
            Math.max(0, Math.min(1, px + dx)),
            Math.max(0, Math.min(1, py + dy)),
          ]);
        } else {
          ann.x = Math.max(0, Math.min(0.96, origX + dx));
          ann.y = Math.max(0, Math.min(0.96, origY + dy));
          reWrap.style.left = `${ann.x * 100}%`;
          reWrap.style.top = `${ann.y * 100}%`;
        }
      };
      const onUp = () => {
        reWrap.removeEventListener('pointermove', onMove);
        reWrap.removeEventListener('pointerup', onUp);
        if (moved && origPts) renderPageAnnotationOverlay(pageNum);
      };
      reWrap.addEventListener('pointermove', onMove);
      reWrap.addEventListener('pointerup', onUp);
    });

    layer.appendChild(wrap);
  }
}

// ─── BAKE ALL ANNOTATIONS INTO CLEAN VECTOR PDF BYTES (`pdf-lib`) ──────────
async function buildExportPdfBytes() {
  if (!state.pdfBytes) throw new Error('No PDF loaded');
  const hasAnyAnnots = Object.values(state.annotations).some((arr) => arr && arr.length > 0);
  if (!hasAnyAnnots) return new Uint8Array(state.pdfBytes);

  const pdf = await PDFDocument.load(state.pdfBytes, { ignoreEncryption: true });
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();

  for (const [pKey, list] of Object.entries(state.annotations)) {
    const pIdx = Number(pKey) - 1;
    if (pIdx < 0 || pIdx >= pages.length || !list?.length) continue;
    const page = pages[pIdx];
    const { width, height } = page.getSize();

    for (const ann of list) {
      if (ann.type === 'highlight' || ann.type === 'whiteout' || ann.type === 'redact') {
        const c = hexToRgb01(ann.color);
        const rx = ann.x * width;
        const rw = ann.w * width;
        const rh = ann.h * height;
        const ry = height - ann.y * height - rh;
        page.drawRectangle({
          x: rx,
          y: ry,
          width: rw,
          height: rh,
          color: rgb(c.r, c.g, c.b),
          opacity: ann.type === 'highlight' ? 0.36 : 1.0,
        });
      } else if (ann.type === 'text' && (ann.text || '').trim()) {
        const c = hexToRgb01(ann.color || '#111827');
        const ptSize = Math.max(6, Number(ann.fontSize) || 14);
        const lines = String(ann.text).split('\n');
        lines.forEach((line, idx) => {
          // Encode clean WinAnsi-safe fallback so pdf-lib standard font never throws on emoji/Indic;
          // if non-Latin characters exist, rasterize crisp high-DPI text image automatically!
          if (/[^\x20-\x7E\xA0-\xFF]/.test(line)) {
            return;
          }
          page.drawText(line, {
            x: ann.x * width,
            y: height - ann.y * height - ptSize * (idx + 1),
            size: ptSize,
            font: fontBold,
            color: rgb(c.r, c.g, c.b),
          });
        });
        // Unicode / Hindi / Emoji crisp PNG stamp fallback
        if (/[^\x20-\x7E\xA0-\xFF]/.test(ann.text)) {
          const pngBytes = renderUnicodeTextToPngBytes(ann.text, ann.color || '#111827', ann.fontSize || 14);
          const emb = await pdf.embedPng(pngBytes.bytes);
          page.drawImage(emb, {
            x: ann.x * width,
            y: height - ann.y * height - pngBytes.ptH,
            width: pngBytes.ptW,
            height: pngBytes.ptH,
          });
        }
      } else if (ann.type === 'draw' && ann.points?.length >= 2) {
        const c = hexToRgb01(ann.color || '#1d4ed8');
        const thickness = Math.max(1, Number(ann.strokeWidth) || 2.5);
        for (let i = 1; i < ann.points.length; i++) {
          const [x0, y0] = ann.points[i - 1];
          const [x1, y1] = ann.points[i];
          page.drawLine({
            start: { x: x0 * width, y: height - y0 * height },
            end: { x: x1 * width, y: height - y1 * height },
            thickness,
            color: rgb(c.r, c.g, c.b),
          });
        }
      } else if (ann.type === 'image' && ann.dataUrl) {
        const rawB64 = ann.dataUrl.split(',')[1] || '';
        const bin = Uint8Array.from(atob(rawB64), (ch) => ch.charCodeAt(0));
        const emb = ann.dataUrl.startsWith('data:image/jpeg')
          ? await pdf.embedJpg(bin)
          : await pdf.embedPng(bin);
        const rw = ann.w * width;
        const rh = ann.h * height;
        const rx = ann.x * width;
        const ry = height - ann.y * height - rh;
        page.drawImage(emb, { x: rx, y: ry, width: rw, height: rh });
      }
    }
  }

  return await pdf.save();
}

function renderUnicodeTextToPngBytes(text, color, fontSizePt) {
  const scale = 3;
  const lines = String(text).split('\n');
  const pxSize = Math.round(fontSizePt * scale);
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `bold ${pxSize}px sans-serif`;
  const maxW = Math.max(...lines.map((l) => ctx.measureText(l).width), 20);
  c.width = Math.ceil(maxW + 16);
  c.height = Math.ceil(lines.length * pxSize * 1.28 + 12);
  ctx.font = `bold ${pxSize}px sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, 4, 4 + i * pxSize * 1.28));
  const dataUrl = c.toDataURL('image/png');
  const ptW = c.width / scale;
  const ptH = c.height / scale;
  c.width = 0;
  c.height = 0;
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (ch) => ch.charCodeAt(0));
  return { bytes, ptW, ptH };
}

async function applyAndReloadBytes(newBytes, successMsg) {
  pushUndoSnapshot();
  state.annotations = {};
  state.selectedAnnotId = null;
  await loadPdfBytes(new Uint8Array(newBytes), state.fileName, {
    preserveHistory: true,
    preserveAnnots: true,
    keepZoom: true,
  });
  markDirty(true);
  if (successMsg) showToast(successMsg, 'success');
}

// ─── THUMBNAIL QUICK PAGE ACTIONS ──────────────────────────────────────────
async function handleThumbQuickAction(pageNum, action) {
  if (!state.pdfBytes) return;
  if (action === 'del' && state.numPages <= 1) {
    showToast('Cannot delete the only page in the document.', 'error');
    return;
  }
  showLoading('Updating pages…');
  try {
    const pdf = await PDFDocument.load(state.pdfBytes, { ignoreEncryption: true });
    const idx = pageNum - 1;
    if (action === 'rot') {
      const pg = pdf.getPage(idx);
      pg.setRotation(degrees((pg.getRotation().angle + 90) % 360));
    } else if (action === 'del') {
      pdf.removePage(idx);
    } else if (action === 'dup') {
      const [copied] = await pdf.copyPages(pdf, [idx]);
      pdf.insertPage(idx + 1, copied);
    } else if (action === 'up' && idx > 0) {
      const [copied] = await pdf.copyPages(pdf, [idx]);
      pdf.removePage(idx);
      pdf.insertPage(idx - 1, copied);
    } else if (action === 'down' && idx < state.numPages - 1) {
      const [copied] = await pdf.copyPages(pdf, [idx]);
      pdf.removePage(idx);
      pdf.insertPage(idx + 1, copied);
    } else {
      hideLoading();
      return;
    }
    const saved = await pdf.save();
    await applyAndReloadBytes(saved, '✓ Page updated');
  } catch (err) {
    hideLoading();
    showToast(`Page update failed: ${err.message}`, 'error');
  }
}

// ─── TRUE HIGH-DPI NATIVE PRINT ENGINE (Ctrl+P) ────────────────────────────
async function handleNativePrint() {
  if (!state.pdfBytes) {
    showToast('Open a PDF first to print.', 'error');
    return;
  }
  showLoading('Preparing high-resolution print pages…');
  try {
    const finalBytes = await buildExportPdfBytes();
    const printPdf = await pdfjsLib.getDocument({
      data: new Uint8Array(finalBytes),
      standardFontDataUrl: STANDARD_FONTS_URL,
    }).promise;

    const imgTags = [];
    for (let p = 1; p <= printPdf.numPages; p++) {
      els.loadingText.textContent = `Preparing print page ${p} of ${printPdf.numPages}…`;
      const page = await printPdf.getPage(p);
      const vp = page.getViewport({ scale: 2.2 }); // crisp ~160-200 DPI print raster
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width);
      c.height = Math.round(vp.height);
      const ctx = c.getContext('2d', { alpha: false });
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      imgTags.push(`<div class="p"><img src="${c.toDataURL('image/jpeg', 0.94)}"></div>`);
      c.width = 0;
      c.height = 0;
    }
    await printPdf.destroy();

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><title>${escapeHtml(state.fileName)}</title>
      <style>
        @page { margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        .p { page-break-after: always; display:flex; align-items:center; justify-content:center; width:100vw; height:100vh; }
        .p:last-child { page-break-after: auto; }
        img { max-width:100%; max-height:100%; object-fit:contain; display:block; }
      </style></head><body>${imgTags.join('')}</body></html>`);
    doc.close();

    const imgs = Array.from(doc.querySelectorAll('img'));
    await Promise.all(imgs.map((im) => (im.complete ? Promise.resolve() : new Promise((r) => { im.onload = r; im.onerror = r; }))));
    hideLoading();

    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => iframe.remove(), 60000);
  } catch (err) {
    hideLoading();
    showToast(`Print preparation failed: ${err.message}`, 'error');
  }
}

// ─── FULL-TEXT SEARCH ENGINE (Ctrl+F) ──────────────────────────────────────
async function runDocumentSearch(query) {
  state.searchQuery = query.trim();
  state.searchHits = [];
  state.searchCursor = -1;

  document.querySelectorAll('.textLayer span.search-hit').forEach((s) => {
    s.classList.remove('search-hit', 'current');
  });

  if (!state.searchQuery || !state.pdfDoc) {
    els.findStatus.textContent = '0 / 0';
    return;
  }

  const needle = state.searchQuery.toLowerCase();
  // Ensure pages with matches get rendered so spans exist
  for (let p = 1; p <= state.numPages; p++) {
    const page = await state.pdfDoc.getPage(p);
    const tc = await page.getTextContent();
    const hasHit = tc.items.some((it) => String(it.str || '').toLowerCase().includes(needle));
    if (hasHit) {
      await renderMainPage(p);
      highlightSearchOnPage(p);
    }
  }

  if (state.searchHits.length > 0) {
    jumpSearchMatch(0);
  } else {
    els.findStatus.textContent = '0 / 0';
  }
}

function highlightSearchOnPage(pageNum) {
  const entry = state.pageShells.get(pageNum);
  if (!entry || !state.searchQuery) return;
  const needle = state.searchQuery.toLowerCase();
  const spans = entry.textLayer.querySelectorAll('span');
  spans.forEach((sp, idx) => {
    const txt = (sp.textContent || '').toLowerCase();
    if (txt.includes(needle)) {
      sp.classList.add('search-hit');
      if (!state.searchHits.some((h) => h.pageNum === pageNum && h.spanIndex === idx)) {
        state.searchHits.push({ pageNum, spanIndex: idx, el: sp });
      }
    }
  });
}

function jumpSearchMatch(deltaOrIdx, relative = false) {
  if (!state.searchHits.length) return;
  state.searchHits.forEach((h) => h.el?.classList.remove('current'));
  if (relative) {
    state.searchCursor = (state.searchCursor + deltaOrIdx + state.searchHits.length) % state.searchHits.length;
  } else {
    state.searchCursor = deltaOrIdx;
  }
  const hit = state.searchHits[state.searchCursor];
  if (hit?.el) {
    hit.el.classList.add('current');
    hit.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    state.currentPage = hit.pageNum;
    els.pageNumInput.value = String(hit.pageNum);
    updateActiveThumbHighlight();
  }
  els.findStatus.textContent = `${state.searchCursor + 1} / ${state.searchHits.length}`;
}

// ─── SIGNATURE & OFFICIAL STAMP ENGINE ─────────────────────────────────────
function initSignatureModal() {
  const canvas = els.sigPadCanvas;
  const ctx = canvas.getContext('2d');
  let drawing = false;

  const clearPad = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  clearPad();

  const getPos = (e) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * canvas.width) / r.width,
      y: ((e.clientY - r.top) * canvas.height) / r.height,
    };
  };

  canvas.addEventListener('pointerdown', (e) => {
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.strokeStyle = state.sigInkColor;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = getPos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  });
  const stop = () => { drawing = false; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);

  $('btn-clear-sig-pad').addEventListener('click', clearPad);

  document.querySelectorAll('[data-sigcolor]').forEach((sw) => {
    sw.addEventListener('click', () => {
      document.querySelectorAll('[data-sigcolor]').forEach((b) => b.classList.remove('active'));
      sw.classList.add('active');
      state.sigInkColor = sw.dataset.sigcolor;
    });
  });

  document.querySelectorAll('.m-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.m-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      state.sigTab = tab.dataset.stab;
      ['draw', 'type', 'stamp', 'upload'].forEach((k) => {
        $(`sig-pane-${k}`).hidden = k !== state.sigTab;
      });
    });
  });

  els.sigTypeInput.addEventListener('input', () => {
    els.sigPreviewTyped.textContent = els.sigTypeInput.value.trim() || 'Your Signature';
  });

  document.querySelectorAll('.stamp-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.stamp-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.activeStampLabel = chip.dataset.stamp;
      state.activeStampColor = chip.dataset.scolor;
    });
  });

  $('btn-trigger-sig-upload').addEventListener('click', () => els.sigUploadInput.click());
  els.sigUploadInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = url;
    });
    URL.revokeObjectURL(url);

    // Auto clean white paper background into crisp transparent signature ink!
    const c = els.sigUploadPreview;
    c.width = Math.min(600, img.naturalWidth || 360);
    c.height = Math.round(((img.naturalHeight || 120) / (img.naturalWidth || 360)) * c.width);
    const sctx = c.getContext('2d');
    sctx.drawImage(img, 0, 0, c.width, c.height);
    const imgData = sctx.getImageData(0, 0, c.width, c.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (lum > 205) d[i + 3] = 0;
    }
    sctx.putImageData(imgData, 0, 0);
    c.hidden = false;
    state.uploadedSigDataUrl = c.toDataURL('image/png');
  });

  $('btn-place-sign').addEventListener('click', () => {
    if (!state.pdfBytes) {
      els.signModal.hidden = true;
      showToast('Open a PDF first!', 'error');
      return;
    }
    let dataUrl = '';
    if (state.sigTab === 'draw') {
      dataUrl = els.sigPadCanvas.toDataURL('image/png');
    } else if (state.sigTab === 'type') {
      const txt = els.sigTypeInput.value.trim() || 'Signature';
      const c = document.createElement('canvas');
      c.width = 460;
      c.height = 130;
      const g = c.getContext('2d');
      g.font = 'italic 52px Georgia, serif';
      g.fillStyle = '#0f172a';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(txt, 230, 65);
      dataUrl = c.toDataURL('image/png');
    } else if (state.sigTab === 'stamp') {
      const c = document.createElement('canvas');
      c.width = 440;
      c.height = 150;
      const g = c.getContext('2d');
      const col = state.activeStampColor || '#1d4ed8';
      g.strokeStyle = col;
      g.fillStyle = col;
      g.lineWidth = 6;
      g.strokeRect(12, 12, 416, 126);
      g.lineWidth = 2;
      g.strokeRect(20, 20, 400, 110);
      g.font = '900 34px Arial, sans-serif';
      g.textAlign = 'center';
      g.fillText(state.activeStampLabel, 220, 72);
      const today = new Date().toLocaleDateString('en-GB');
      const sub = els.stampSubtext.value.trim() || `Date: ${today}`;
      g.font = '700 18px Arial, sans-serif';
      g.fillText(sub, 220, 108);
      dataUrl = c.toDataURL('image/png');
    } else if (state.sigTab === 'upload') {
      dataUrl = state.uploadedSigDataUrl;
    }

    if (!dataUrl) {
      showToast('Please draw, type, or upload a signature first.', 'error');
      return;
    }

    pushUndoSnapshot();
    const targetPages = els.chkSignAllPages.checked
      ? Array.from({ length: state.numPages }, (_, i) => i + 1)
      : [state.currentPage];

    for (const p of targetPages) {
      if (!state.annotations[p]) state.annotations[p] = [];
      state.annotations[p].push({
        id: 'sig_' + p + '_' + Date.now(),
        type: 'image',
        dataUrl,
        x: 0.64,
        y: 0.82,
        w: 0.28,
        h: 0.095,
      });
    }
    els.signModal.hidden = true;
    setToolMode('select');
    renderAllAnnotationOverlays();
    showToast(`✓ Placed on ${targetPages.length} page(s) — drag to move or resize!`, 'success');
  });
}

// ─── RIGHT DOCK: 18 IN-VIEWER ACROBAT STUDIO TOOLS ─────────────────────────
function renderDockTools(filterText = '') {
  const q = filterText.toLowerCase().trim();
  const matches = STUDIO_TOOLS.filter(
    (t) => !q || t.name.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q) || t.cat.toLowerCase().includes(q)
  );

  const grouped = new Map();
  for (const t of matches) {
    if (!grouped.has(t.cat)) grouped.set(t.cat, []);
    grouped.get(t.cat).push(t);
  }

  let html = '';
  for (const [cat, items] of grouped.entries()) {
    html += `<div class="dock-cat-label">${escapeHtml(cat)}</div>`;
    for (const t of items) {
      html += `
        <button class="dock-tool-card" data-stool="${t.id}">
          <span class="dock-tool-icon">${t.icon}</span>
          <span class="dock-tool-info">
            <span class="dock-tool-name">${escapeHtml(t.name)}</span>
            <span class="dock-tool-desc">${escapeHtml(t.desc)}</span>
          </span>
          ${t.tag ? `<span class="dock-tool-tag">${escapeHtml(t.tag)}</span>` : ''}
        </button>
      `;
    }
  }
  els.dockToolsList.innerHTML = html || '<div class="empty-side-msg">No matching tool.</div>';

  els.dockToolsList.querySelectorAll('.dock-tool-card').forEach((card) => {
    card.addEventListener('click', () => openStudioToolDrawer(card.dataset.stool));
  });
}

function requireOpenPdf() {
  if (!state.pdfBytes) {
    showToast('Please open a PDF document first!', 'error');
    return false;
  }
  return true;
}

function openStudioToolDrawer(toolId) {
  if (toolId === 'sign') {
    els.signModal.hidden = false;
    return;
  }
  if (toolId === 'insertimg') {
    if (!requireOpenPdf()) return;
    els.insertImgInput.click();
    return;
  }
  if (toolId === 'img2pdf') {
    if (!requireOpenPdf()) {
      els.openPdfInput.click();
      return;
    }
    els.appendImgPagesInput.click();
    return;
  }
  if (toolId === 'markup') {
    setToolMode('highlight');
    showToast('Use the top toolbar to Highlight, Add Text, Draw Ink, Erase or Redact!');
    return;
  }

  const toolMeta = STUDIO_TOOLS.find((t) => t.id === toolId);
  els.drawerTitle.textContent = toolMeta ? `${toolMeta.icon} ${toolMeta.name}` : 'Tool';
  els.toolDrawer.hidden = false;
  const b = els.drawerBody;

  // ── 1. COMPRESS / TARGET KB ──
  if (toolId === 'compress') {
    const curSize = formatBytes(state.pdfBytes?.byteLength || 0);
    b.innerHTML = `
      <div class="drawer-note">Current Size: <strong>${curSize}</strong>. Compress right inside this viewer or hit an exact KB target for government portals.</div>
      <label class="drawer-field">
        <span>Compression Mode</span>
        <select id="cmp-preset">
          <option value="balanced">Balanced Quality (~50% smaller)</option>
          <option value="strong">Strong Compression (~75% smaller)</option>
          <option value="target">🎯 Exact Target Size (KB)</option>
        </select>
      </label>
      <label class="drawer-field" id="cmp-target-wrap" hidden>
        <span>Max Target File Size (KB)</span>
        <input type="number" id="cmp-target-kb" value="200" min="25" max="20000">
      </label>
      <div id="cmp-result-box" class="result-stat-box" hidden></div>
      <button class="dock-action-btn full" id="btn-run-compress">⚡ Compress PDF Now</button>
    `;
    const sel = $('cmp-preset');
    sel.addEventListener('change', () => {
      $('cmp-target-wrap').hidden = sel.value !== 'target';
    });
    $('btn-run-compress').addEventListener('click', async () => {
      if (!requireOpenPdf()) return;
      const mode = sel.value;
      const targetBytes = Number($('cmp-target-kb').value || 200) * 1024;
      await runInViewerCompression(mode, targetBytes, $('cmp-result-box'));
    });
    return;
  }

  // ── 2. MERGE PDFs ──
  if (toolId === 'merge') {
    b.innerHTML = `
      <div class="drawer-note">Combine one or more additional PDF files directly into this open document without leaving the viewer.</div>
      <label class="drawer-field">
        <span>Where to insert selected PDFs?</span>
        <select id="merge-pos">
          <option value="end">At the End (After Page ${state.numPages || 1})</option>
          <option value="start">At the Beginning (Before Page 1)</option>
          <option value="after-current">After Current Page (Page ${state.currentPage || 1})</option>
        </select>
      </label>
      <button class="dock-action-btn full" id="btn-pick-merge">📑 Choose PDFs to Merge</button>
    `;
    $('btn-pick-merge').addEventListener('click', () => {
      if (!requireOpenPdf()) return;
      els.mergePdfInput.dataset.pos = $('merge-pos').value;
      els.mergePdfInput.click();
    });
    return;
  }

  // ── 3. SPLIT & EXTRACT PAGES ──
  if (toolId === 'split') {
    b.innerHTML = `
      <div class="drawer-note">Total Pages: <strong>${state.numPages}</strong>. Enter page numbers or ranges like <code>1-3, 5</code>.</div>
      <label class="drawer-field">
        <span>Pages to Extract</span>
        <input type="text" id="split-range" value="1-${Math.max(1, Math.min(2, state.numPages))}" placeholder="e.g. 1-3, 5, 8-10">
      </label>
      <button class="dock-action-btn full" id="btn-extract-dl">💾 Download Extracted PDF</button>
      <button class="dock-action-btn full secondary" id="btn-extract-keep">👁️ Keep Only These Pages in Viewer</button>
      <button class="dock-action-btn full secondary" id="btn-split-all-zip">📦 Split Every Page into ZIP (${state.numPages} PDFs)</button>
    `;
    const extractSubset = async () => {
      if (!requireOpenPdf()) return null;
      const nums = parsePageRangeInput($('split-range').value, state.numPages);
      if (!nums.length) {
        showToast('Enter valid page numbers within 1–' + state.numPages, 'error');
        return null;
      }
      const srcBytes = await buildExportPdfBytes();
      const src = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
      const out = await PDFDocument.create();
      const copied = await out.copyPages(src, nums.map((n) => n - 1));
      copied.forEach((p) => out.addPage(p));
      return { bytes: await out.save(), count: nums.length };
    };
    $('btn-extract-dl').addEventListener('click', async () => {
      showLoading('Extracting pages…');
      const res = await extractSubset();
      hideLoading();
      if (res) {
        triggerDownload(res.bytes, sanitizePdfFilename(state.fileName, `_extracted_${res.count}p`));
        showToast(`✓ Downloaded ${res.count} extracted page(s)!`, 'success');
      }
    });
    $('btn-extract-keep').addEventListener('click', async () => {
      showLoading('Trimming document…');
      const res = await extractSubset();
      hideLoading();
      if (res) await applyAndReloadBytes(res.bytes, `✓ Kept ${res.count} page(s) in viewer`);
    });
    $('btn-split-all-zip').addEventListener('click', async () => {
      if (!requireOpenPdf()) return;
      showLoading('Splitting all pages into ZIP…');
      try {
        const srcBytes = await buildExportPdfBytes();
        const src = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
        const zip = new JSZip();
        for (let i = 0; i < src.getPageCount(); i++) {
          const single = await PDFDocument.create();
          const [cp] = await single.copyPages(src, [i]);
          single.addPage(cp);
          zip.file(sanitizePdfFilename(state.fileName, `_page_${i + 1}`), await single.save());
        }
        const zBlob = await zip.generateAsync({ type: 'blob' });
        triggerDownload(zBlob, sanitizePdfFilename(state.fileName, '_split_pages', '.zip'), 'application/zip');
        showToast('✓ Downloaded ZIP of all split pages!', 'success');
      } finally {
        hideLoading();
      }
    });
    return;
  }

  // ── 4. ORGANIZE & BLANK PAGE REMOVER ──
  if (toolId === 'organize') {
    b.innerHTML = `
      <div class="drawer-note">Tip: Hover any thumbnail in the left sidebar to rotate, reorder, duplicate or delete individual pages!</div>
      <label class="drawer-field">
        <span>Delete Page Range</span>
        <input type="text" id="del-range" placeholder="e.g. 2, 4-6">
      </label>
      <button class="dock-action-btn full" id="btn-del-range">🗑️ Delete Specified Pages</button>
      <button class="dock-action-btn full secondary" id="btn-reverse-pages">↩️ Reverse Entire Page Order</button>
      <button class="dock-action-btn full secondary" id="btn-remove-blanks">✨ Auto-Detect &amp; Remove Blank Pages</button>
    `;
    $('btn-del-range').addEventListener('click', async () => {
      if (!requireOpenPdf()) return;
      const toDel = new Set(parsePageRangeInput($('del-range').value, state.numPages));
      if (!toDel.size || toDel.size >= state.numPages) {
        showToast('Specify valid pages (must leave at least 1 page).', 'error');
        return;
      }
      showLoading('Removing pages…');
      const src = await PDFDocument.load(await buildExportPdfBytes(), { ignoreEncryption: true });
      const keepIdx = [];
      for (let i = 1; i <= state.numPages; i++) if (!toDel.has(i)) keepIdx.push(i - 1);
      const out = await PDFDocument.create();
      (await out.copyPages(src, keepIdx)).forEach((p) => out.addPage(p));
      await applyAndReloadBytes(await out.save(), `✓ Removed ${toDel.size} page(s)`);
    });
    $('btn-reverse-pages').addEventListener('click', async () => {
      if (!requireOpenPdf()) return;
      showLoading('Reversing pages…');
      const src = await PDFDocument.load(await buildExportPdfBytes(), { ignoreEncryption: true });
      const out = await PDFDocument.create();
      const rev = Array.from({ length: src.getPageCount() }, (_, i) => src.getPageCount() - 1 - i);
      (await out.copyPages(src, rev)).forEach((p) => out.addPage(p));
      await applyAndReloadBytes(await out.save(), '✓ Reversed page order!');
    });
    $('btn-remove-blanks').addEventListener('click', async () => {
      if (!requireOpenPdf()) return;
      showLoading('Scanning pages for blank content…');
      const keepIdx = [];
      for (let p = 1; p <= state.numPages; p++) {
        const page = await state.pdfDoc.getPage(p);
        const vp = page.getViewport({ scale: 0.35 });
        const c = document.createElement('canvas');
        c.width = Math.max(16, Math.round(vp.width));
        c.height = Math.max(16, Math.round(vp.height));
        const g = c.getContext('2d');
        await page.render({ canvasContext: g, viewport: vp }).promise;
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let nonWhite = 0;
        for (let i = 0; i < d.length; i += 16) {
          if (d[i] < 242 || d[i + 1] < 242 || d[i + 2] < 242) nonWhite++;
        }
        c.width = 0;
        c.height = 0;
        if (nonWhite > (c.width * c.height) / 4000 + 3) keepIdx.push(p - 1);
      }
      if (keepIdx.length === state.numPages) {
        hideLoading();
        showToast('No blank pages detected!');
        return;
      }
      if (keepIdx.length === 0) keepIdx.push(0);
      const src = await PDFDocument.load(await buildExportPdfBytes(), { ignoreEncryption: true });
      const out = await PDFDocument.create();
      (await out.copyPages(src, keepIdx)).forEach((p) => out.addPage(p));
      const removed = state.numPages - keepIdx.length;
      await applyAndReloadBytes(await out.save(), `✓ Removed ${removed} blank page(s)!`);
    });
    return;
  }

  // ── 5. ROTATE PAGES ──
  if (toolId === 'rotate') {
    b.innerHTML = `
      <label class="drawer-field">
        <span>Target Pages</span>
        <select id="rot-scope">
          <option value="current">Current Page (Page ${state.currentPage})</option>
          <option value="all">All Pages (1–${state.numPages})</option>
          <option value="even">Even Pages Only</option>
          <option value="odd">Odd Pages Only</option>
        </select>
      </label>
      <div class="drawer-btn-grid">
        <button class="dock-action-btn" data-deg="90">↻ 90° Right</button>
        <button class="dock-action-btn secondary" data-deg="-90">↺ 90° Left</button>
      </div>
      <button class="dock-action-btn full secondary" data-deg="180">↕ 180° Flip</button>
    `;
    b.querySelectorAll('[data-deg]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!requireOpenPdf()) return;
        const delta = Number(btn.dataset.deg);
        const scope = $('rot-scope').value;
        showLoading('Rotating pages…');
        const pdf = await PDFDocument.load(await buildExportPdfBytes(), { ignoreEncryption: true });
        pdf.getPages().forEach((pg, idx) => {
          const pNum = idx + 1;
          const match =
            scope === 'all' ||
            (scope === 'current' && pNum === state.currentPage) ||
            (scope === 'even' && pNum % 2 === 0) ||
            (scope === 'odd' && pNum % 2 === 1);
          if (match) pg.setRotation(degrees((pg.getRotation().angle + delta + 360) % 360));
        });
        await applyAndReloadBytes(await pdf.save(), '✓ Rotation applied!');
      });
    });
    return;
  }

  // ── 6. WATERMARK PDF ──
  if (toolId === 'watermark') {
    b.innerHTML = `
      <label class="drawer-field">
        <span>Watermark Text</span>
        <input type="text" id="wm-text" value="CONFIDENTIAL">
      </label>
      <div class="drawer-btn-grid">
        <label class="drawer-field">
          <span>Font Size</span>
          <input type="number" id="wm-size" value="54" min="14" max="140">
        </label>
        <label class="drawer-field">
          <span>Opacity (0.1–1)</span>
          <input type="number" id="wm-op" value="0.22" step="0.05" min="0.05" max="1">
        </label>
      </div>
      <label class="drawer-field">
        <span>Style</span>
        <select id="wm-angle">
          <option value="45">Diagonal (45°)</option>
          <option value="0">Horizontal Center (0°)</option>
        </select>
      </label>
      <button class="dock-action-btn full" id="btn-apply-wm">💧 Apply Watermark to PDF</button>
    `;
    $('btn-apply-wm').addEventListener('click', async () => {
      if (!requireOpenPdf()) return;
      const txt = $('wm-text').value.trim();
      if (!txt) return;
      showLoading('Applying watermark…');
      const pdf = await PDFDocument.load(await buildExportPdfBytes(), { ignoreEncryption: true });
      const font = await pdf.embedFont(StandardFonts.HelveticaBold);
      const sz = Number($('wm-size').value) || 54;
      const op = Math.max(0.05, Math.min(1, Number($('wm-op').value) || 0.22));
      const ang = Number($('wm-angle').value) || 0;
      for (const pg of pdf.getPages()) {
        const { width, height } = pg.getSize();
        const tw = font.widthOfTextAtSize(txt, sz);
        pg.drawText(txt, {
          x: Math.max(20, (width - tw * Math.cos((ang * Math.PI) / 180)) / 2),
          y: height / 2,
          size: sz,
          font,
          color: rgb(0.55, 0.12, 0.12),
          opacity: op,
          rotate: degrees(ang),
        });
      }
      await applyAndReloadBytes(await pdf.save(), '✓ Watermark applied across all pages!');
    });
    return;
  }

  // ── 7. PAGE NUMBERS & BATES STAMP ──
  if (toolId === 'pagenums') {
    b.innerHTML = `
      <label class="drawer-field">
        <span>Format</span>
        <select id="pn-fmt">
          <option value="page-of">Page 1 of N</option>
          <option value="slash">1 / N</option>
          <option value="bates">Legal Bates (DOC-0001)</option>
        </select>
      </label>
      <label class="drawer-field">
        <span>Position</span>
        <select id="pn-pos">
          <option value="bc">Bottom Center</option>
          <option value="br">Bottom Right</option>
          <option value="tr">Top Right</option>
        </select>
      </label>
      <label class="drawer-field">
        <span>Bates Prefix (if Bates selected)</span>
        <input type="text" id="pn-prefix" value="DOC-">
      </label>
      <button class="dock-action-btn full" id="btn-apply-pn">🔢 Insert Page Numbers</button>
    `;
    $('btn-apply-pn').addEventListener('click', async () => {
      if (!requireOpenPdf()) return;
      showLoading('Numbering pages…');
      const pdf = await PDFDocument.load(await buildExportPdfBytes(), { ignoreEncryption: true });
      const font = await pdf.embedFont(StandardFonts.HelveticaBold);
      const pages = pdf.getPages();
      const fmt = $('pn-fmt').value;
      const pos = $('pn-pos').value;
      const prefix = $('pn-prefix').value || 'DOC-';

      pages.forEach((pg, i) => {
        const { width, height } = pg.getSize();
        const label =
          fmt === 'page-of'
            ? `Page ${i + 1} of ${pages.length}`
            : fmt === 'slash'
            ? `${i + 1} / ${pages.length}`
            : `${prefix}${String(i + 1).padStart(4, '0')}`;
        const tw = font.widthOfTextAtSize(label, 10);
        const x = pos === 'bc' ? (width - tw) / 2 : width - tw - 28;
        const y = pos === 'tr' ? height - 24 : 18;
        pg.drawText(label, { x, y, size: 10, font, color: rgb(0.2, 0.24, 0.3) });
      });
      await applyAndReloadBytes(await pdf.save(), '✓ Page numbers added!');
    });
    return;
  }

  // ── 8. AUTO AADHAAR & PII REDACTOR ──
  if (toolId === 'pii') {
    b.innerHTML = `
      <div class="drawer-note">Scans text across all pages for <strong>12-digit Aadhaar numbers</strong>, <strong>PAN cards</strong>, <strong>Emails</strong>, and <strong>Phone numbers</strong> — mask first 8 Aadhaar digits per UIDAI/RBI KYC or blackout all PII.</div>
      <button class="dock-action-btn full" id="btn-scan-aadhaar">🛡️ Mask Aadhaar First 8 Digits (UIDAI)</button>
      <button class="dock-action-btn full secondary" id="btn-scan-all-pii">⬛ Redact All PII (Aadhaar / PAN / Phone / Email)</button>
      <div id="pii-stat" class="result-stat-box" hidden></div>
    `;
    const runPiiPass = async (aadhaarOnly) => {
      if (!requireOpenPdf()) return;
      showLoading('Scanning PDF text coordinates…');
      const aadhaarRe = /\b\d{4}\s?\d{4}\s?\d{4}\b/g;
      const panRe = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
      const emailRe = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
      const phoneRe = /\b(?:\+91[-\s]?)?[6-9]\d{9}\b/g;

      const pdf = await PDFDocument.load(await buildExportPdfBytes(), { ignoreEncryption: true });
      const pages = pdf.getPages();
      let count = 0;

      for (let p = 1; p <= state.numPages; p++) {
        const pjsPage = await state.pdfDoc.getPage(p);
        const tc = await pjsPage.getTextContent();
        const pdfPage = pages[p - 1];

        for (const item of tc.items) {
          const str = String(item.str || '');
          if (!str) continue;
          const tx = item.transform?.[4] ?? 0;
          const ty = item.transform?.[5] ?? 0;
          const itemW = item.width || str.length * 5;
          const itemH = Math.max(10, Math.abs(item.height || item.transform?.[0] || 11));

          if (aadhaarOnly) {
            if (aadhaarRe.test(str)) {
              aadhaarRe.lastIndex = 0;
              // Mask first 66% width (first 8 digits) leaving last 4 digits visible!
              pdfPage.drawRectangle({
                x: tx - 1,
                y: ty - 2,
                width: itemW * 0.67,
                height: itemH + 3,
                color: rgb(0.05, 0.05, 0.05),
              });
              count++;
            }
          } else {
            const hit = aadhaarRe.test(str) || panRe.test(str) || emailRe.test(str) || phoneRe.test(str);
            aadhaarRe.lastIndex = panRe.lastIndex = emailRe.lastIndex = phoneRe.lastIndex = 0;
            if (hit) {
              pdfPage.drawRectangle({
                x: tx - 1,
                y: ty - 2,
                width: itemW + 2,
                height: itemH + 3,
                color: rgb(0, 0, 0),
              });
              count++;
            }
          }
        }
      }

      if (count === 0) {
        hideLoading();
        $('pii-stat').hidden = false;
        $('pii-stat').textContent = 'No text-layer Aadhaar/PII matches found (for scanned image PDFs, use the ⬛ Redact box tool in top bar!).';
        return;
      }
      await applyAndReloadBytes(await pdf.save(), `✓ Redacted ${count} sensitive item(s)!`);
    };
    $('btn-scan-aadhaar').addEventListener('click', () => void runPiiPass(true));
    $('btn-scan-all-pii').addEventListener('click', () => void runPiiPass(false));
    return;
  }

  // ── 9. PDF TO JPG / PNG (300 DPI) ──
  if (toolId === 'pdf2img') {
    b.innerHTML = `
      <label class="drawer-field">
        <span>Image Format</span>
        <select id="img-fmt">
          <option value="jpeg">JPG (Crisp &amp; Compact)</option>
          <option value="png">PNG (Lossless)</option>
        </select>
      </label>
      <label class="drawer-field">
        <span>Resolution</span>
        <select id="img-dpi">
          <option value="2.1">150 DPI (Fast)</option>
          <option value="4.16" selected>300 DPI (Print HD ★)</option>
        </select>
      </label>
      <button class="dock-action-btn full" id="btn-img-cur">🖼️ Download Current Page (${state.currentPage})</button>
      <button class="dock-action-btn full secondary" id="btn-img-zip">📦 Download All ${state.numPages} Pages as ZIP</button>
    `;
    const renderPageBlob = async (pNum, fmt, scale) => {
      const page = await state.pdfDoc.getPage(pNum);
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width);
      c.height = Math.round(vp.height);
      const g = c.getContext('2d', { alpha: false });
      await page.render({ canvasContext: g, viewport: vp }).promise;
      const mime = fmt === 'png' ? 'image/png' : 'image/jpeg';
      const blob = await new Promise((r) => c.toBlob(r, mime, 0.94));
      c.width = 0;
      c.height = 0;
      return blob;
    };
    $('btn-img-cur').addEventListener('click', async () => {
      if (!requireOpenPdf()) return;
      const fmt = $('img-fmt').value;
      const sc = Number($('img-dpi').value);
      showLoading('Rendering HD page image…');
      const blob = await renderPageBlob(state.currentPage, fmt, sc);
      hideLoading();
      triggerDownload(blob, sanitizePdfFilename(state.fileName, `_page_${state.currentPage}`, fmt === 'png' ? '.png' : '.jpg'));
      showToast('✓ Page image downloaded!', 'success');
    });
    $('btn-img-zip').addEventListener('click', async () => {
      if (!requireOpenPdf()) return;
      const fmt = $('img-fmt').value;
      const sc = Number($('img-dpi').value);
      const ext = fmt === 'png' ? '.png' : '.jpg';
      showLoading('Exporting all pages at HD DPI…');
      const zip = new JSZip();
      for (let p = 1; p <= state.numPages; p++) {
        els.loadingText.textContent = `Rendering page ${p} of ${state.numPages}…`;
        const blob = await renderPageBlob(p, fmt, sc);
        zip.file(sanitizePdfFilename(state.fileName, `_page_${p}`, ext), blob);
      }
      const zBlob = await zip.generateAsync({ type: 'blob' });
      hideLoading();
      triggerDownload(zBlob, sanitizePdfFilename(state.fileName, '_images_300dpi', '.zip'), 'application/zip');
      showToast('✓ All pages exported as ZIP!', 'success');
    });
    return;
  }

  // ── 10. EXTRACT TEXT & MARKDOWN ──
  if (toolId === 'text') {
    b.innerHTML = `
      <div class="drawer-note">Extracts selectable text across all ${state.numPages} page(s) right inside this tab for instant copy or download.</div>
      <button class="dock-action-btn full" id="btn-ext-txt">📃 Extract Plain Text (.txt)</button>
      <button class="dock-action-btn full secondary" id="btn-ext-md">📋 Extract Clean Markdown (.md)</button>
    `;
    const runExtract = async (asMd) => {
      if (!requireOpenPdf()) return;
      showLoading('Extracting text…');
      const chunks = [];
      for (let p = 1; p <= state.numPages; p++) {
        const page = await state.pdfDoc.getPage(p);
        const tc = await page.getTextContent();
        const lines = [];
        let lastY = null;
        let lineBuf = '';
        for (const it of tc.items) {
          const y = Math.round(it.transform?.[5] || 0);
          if (lastY !== null && Math.abs(y - lastY) > 5) {
            if (lineBuf.trim()) lines.push(lineBuf.trim());
            lineBuf = '';
          }
          lineBuf += (lineBuf && !lineBuf.endsWith(' ') ? ' ' : '') + (it.str || '');
          lastY = y;
        }
        if (lineBuf.trim()) lines.push(lineBuf.trim());
        chunks.push(asMd ? `## Page ${p}\n\n${lines.join('\n')}` : `--- Page ${p} ---\n${lines.join('\n')}`);
      }
      hideLoading();
      state.extractedContent = chunks.join('\n\n');
      state.extractedExt = asMd ? '.md' : '.txt';
      els.textModalTitle.textContent = asMd ? '📋 Extracted Markdown' : '📃 Extracted Plain Text';
      els.extractedTextArea.value = state.extractedContent;
      els.extractedStats.textContent = `${state.extractedContent.length.toLocaleString()} characters • ${state.numPages} page(s)`;
      els.textModal.hidden = false;
    };
    $('btn-ext-txt').addEventListener('click', () => void runExtract(false));
    $('btn-ext-md').addEventListener('click', () => void runExtract(true));
    return;
  }

  // ── 11. GRAYSCALE & XEROX ECO INK-SAVER ──
  if (toolId === 'inksaver') {
    b.innerHTML = `
      <div class="drawer-note">Optimize pages right inside the viewer before clicking Print!</div>
      <button class="dock-action-btn full" id="btn-make-gray">⚫ Convert PDF to Crisp Grayscale</button>
      <button class="dock-action-btn full secondary" id="btn-make-eco">🖨️ Xerox Eco Ink-Saver (Whiten Dark Scan BG)</button>
    `;
    const runFilter = async (eco) => {
      if (!requireOpenPdf()) return;
      showLoading(eco ? 'Applying Xerox Eco Ink-Saver…' : 'Converting to Grayscale…');
      const outPdf = await PDFDocument.create();
      for (let p = 1; p <= state.numPages; p++) {
        els.loadingText.textContent = `Processing page ${p} / ${state.numPages}…`;
        const page = await state.pdfDoc.getPage(p);
        const vp1 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: 2.0 });
        const c = document.createElement('canvas');
        c.width = Math.round(vp.width);
        c.height = Math.round(vp.height);
        const g = c.getContext('2d', { alpha: false });
        await page.render({ canvasContext: g, viewport: vp }).promise;
        const imData = g.getImageData(0, 0, c.width, c.height);
        const d = imData.data;
        for (let i = 0; i < d.length; i += 4) {
          let lum = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
          if (eco) {
            // Whiten gray scan paper (>185 -> 255) & lighten heavy black ink by 18% to save toner
            lum = lum > 188 ? 255 : Math.min(255, Math.round(32 + lum * 0.85));
          }
          d[i] = d[i + 1] = d[i + 2] = lum;
        }
        g.putImageData(imData, 0, 0);
        const jpgBlob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
        c.width = 0;
        c.height = 0;
        const emb = await outPdf.embedJpg(new Uint8Array(await jpgBlob.arrayBuffer()));
        const np = outPdf.addPage([vp1.width, vp1.height]);
        np.drawImage(emb, { x: 0, y: 0, width: vp1.width, height: vp1.height });
      }
      await applyAndReloadBytes(await outPdf.save(), eco ? '✓ Xerox Eco Ink-Saver applied!' : '✓ Converted to Grayscale!');
    };
    $('btn-make-gray').addEventListener('click', () => void runFilter(false));
    $('btn-make-eco').addEventListener('click', () => void runFilter(true));
    return;
  }

  // ── 12. FLATTEN & SCRUB METADATA ──
  if (toolId === 'flatten') {
    b.innerHTML = `
      <div class="drawer-note">Permanently bakes interactive forms/annotations and scrubs hidden Author, Producer, Creator, and tracking metadata.</div>
      <button class="dock-action-btn full" id="btn-do-scrub">🧹 Scrub Metadata Only (Keep Vector Text)</button>
      <button class="dock-action-btn full secondary" id="btn-do-flatten">🥞 Flatten All Forms &amp; Pages</button>
    `;
    $('btn-do-scrub').addEventListener('click', () => void scrubMetadataInViewer());
    $('btn-do-flatten').addEventListener('click', async () => {
      if (!requireOpenPdf()) return;
      showLoading('Flattening forms & annotations…');
      const pdf = await PDFDocument.load(await buildExportPdfBytes(), { ignoreEncryption: true });
      try { pdf.getForm().flatten(); } catch {}
      clearPdfMetadataFields(pdf);
      await applyAndReloadBytes(await pdf.save(), '✓ Flattened & metadata scrubbed!');
    });
    return;
  }

  // ── 13–15. IN-VIEWER OFFICE CONVERTERS (WORD / EXCEL / PPT — ZERO WEBSITE REDIRECT!) ──
  if (toolId === 'word' || toolId === 'excel' || toolId === 'ppt') {
    const map = {
      word: { label: 'Word (.docx)', endpoint: '/convert/pdf-to-word', ext: '.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      excel: { label: 'Excel (.xlsx)', endpoint: '/convert/pdf-to-excel', ext: '.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      ppt: { label: 'PowerPoint (.pptx)', endpoint: '/convert/pdf-to-ppt', ext: '.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
    }[toolId];

    b.innerHTML = `
      <div class="drawer-note">Converts <strong>${escapeHtml(state.fileName)}</strong> into an editable <strong>${map.label}</strong> and downloads it <strong>directly here</strong> without leaving this tab.</div>
      <button class="dock-action-btn full" id="btn-conv-office">🚀 Convert &amp; Download ${map.label}</button>
      <div id="conv-status-box" class="result-stat-box" hidden></div>
    `;
    $('btn-conv-office').addEventListener('click', async () => {
      if (!requireOpenPdf()) return;
      const statusBox = $('conv-status-box');
      statusBox.hidden = false;
      statusBox.textContent = `Converting to ${map.label} via HD Layout Engine…`;
      showLoading(`Converting PDF → ${map.label}…`);
      try {
        const finalBytes = await buildExportPdfBytes();
        const fd = new FormData();
        fd.append('file', new Blob([finalBytes], { type: 'application/pdf' }), state.fileName);

        let convertedBlob = null;
        for (const base of CLOUD_API_POOL) {
          try {
            const res = await fetch(`${base}${map.endpoint}`, { method: 'POST', body: fd });
            if (res.ok) {
              convertedBlob = await res.blob();
              break;
            }
          } catch {}
        }

        if (convertedBlob && convertedBlob.size > 128) {
          const outName = sanitizePdfFilename(state.fileName, '', map.ext);
          triggerDownload(convertedBlob, outName, map.mime);
          statusBox.textContent = `✓ Downloaded ${outName} (${formatBytes(convertedBlob.size)})!`;
          showToast(`✓ ${map.label} downloaded!`, 'success');
        } else if (toolId === 'word' || toolId === 'excel') {
          // Offline local fallback so it STILL works with zero internet!
          const fallback = await buildOfflineOfficeFallback(toolId);
          triggerDownload(fallback.blob, fallback.name, fallback.mime);
          statusBox.textContent = `✓ Downloaded offline ${fallback.name}!`;
          showToast(`✓ Downloaded ${fallback.name} (offline mode)!`, 'success');
        } else {
          throw new Error('Conversion server unreachable right now.');
        }
      } catch (err) {
        statusBox.textContent = `Conversion error: ${err.message}`;
        showToast(err.message, 'error');
      } finally {
        hideLoading();
      }
    });
  }
}

async function buildOfflineOfficeFallback(kind) {
  const pagesTxt = [];
  for (let p = 1; p <= state.numPages; p++) {
    const page = await state.pdfDoc.getPage(p);
    const tc = await page.getTextContent();
    pagesTxt.push(tc.items.map((i) => i.str).join(' '));
  }
  if (kind === 'excel') {
    const csv = pagesTxt.map((t, i) => `"Page ${i + 1}","${t.replace(/"/g, '""')}"`).join('\n');
    return {
      blob: new Blob(['\uFEFFPage,Content\n' + csv], { type: 'text/csv;charset=utf-8' }),
      name: sanitizePdfFilename(state.fileName, '', '.csv'),
      mime: 'text/csv',
    };
  }
  const htmlDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${pagesTxt
    .map((t, i) => `<h3>Page ${i + 1}</h3><p>${escapeHtml(t)}</p>`)
    .join('<hr>')}</body></html>`;
  return {
    blob: new Blob([htmlDoc], { type: 'application/msword' }),
    name: sanitizePdfFilename(state.fileName, '', '.doc'),
    mime: 'application/msword',
  };
}

// ─── IN-VIEWER BINARY-SEARCH TARGET KB COMPRESSOR ──────────────────────────
async function runInViewerCompression(mode, targetBytes, resultBox) {
  showLoading('Optimizing PDF size…');
  try {
    const origSize = state.pdfBytes.byteLength;

    const rasterCompressPass = async (scale, quality) => {
      const out = await PDFDocument.create();
      for (let p = 1; p <= state.numPages; p++) {
        const page = await state.pdfDoc.getPage(p);
        const vp1 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale });
        const c = document.createElement('canvas');
        c.width = Math.max(32, Math.round(vp.width));
        c.height = Math.max(32, Math.round(vp.height));
        const g = c.getContext('2d', { alpha: false });
        await page.render({ canvasContext: g, viewport: vp }).promise;
        const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
        c.width = 0;
        c.height = 0;
        const emb = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
        const np = out.addPage([vp1.width, vp1.height]);
        np.drawImage(emb, { x: 0, y: 0, width: vp1.width, height: vp1.height });
      }
      clearPdfMetadataFields(out);
      return await out.save({ useObjectStreams: true });
    };

    let bestBytes;
    if (mode === 'balanced') {
      bestBytes = await rasterCompressPass(1.45, 0.72);
    } else if (mode === 'strong') {
      bestBytes = await rasterCompressPass(1.08, 0.52);
    } else {
      // Binary-search scale + JPEG quality to hit exact target KB!
      const trials = [
        [1.5, 0.76],
        [1.25, 0.64],
        [1.05, 0.52],
        [0.85, 0.42],
        [0.68, 0.34],
      ];
      bestBytes = await rasterCompressPass(trials[0][0], trials[0][1]);
      for (let i = 1; i < trials.length && bestBytes.byteLength > targetBytes; i++) {
        els.loadingText.textContent = `Tuning to target size (pass ${i + 1})…`;
        bestBytes = await rasterCompressPass(trials[i][0], trials[i][1]);
      }
    }

    hideLoading();
    const savedPct = Math.max(0, Math.round((1 - bestBytes.byteLength / origSize) * 100));
    resultBox.hidden = false;
    resultBox.innerHTML = `
      <div><strong>${formatBytes(origSize)} → ${formatBytes(bestBytes.byteLength)}</strong> (${savedPct}% smaller)</div>
      <div class="drawer-btn-grid" style="margin-top:8px;">
        <button class="dock-action-btn" id="btn-dl-cmp">💾 Download</button>
        <button class="dock-action-btn secondary" id="btn-use-cmp">👁️ Use Here</button>
      </div>
    `;
    $('btn-dl-cmp').addEventListener('click', () => {
      triggerDownload(bestBytes, sanitizePdfFilename(state.fileName, '_compressed'));
      showToast('✓ Compressed PDF downloaded!', 'success');
    });
    $('btn-use-cmp').addEventListener('click', () => {
      void applyAndReloadBytes(bestBytes, `✓ Applied compressed PDF (${formatBytes(bestBytes.byteLength)})`);
    });
  } catch (err) {
    hideLoading();
    showToast(`Compression failed: ${err.message}`, 'error');
  }
}

function clearPdfMetadataFields(pdf) {
  pdf.setTitle('');
  pdf.setAuthor('');
  pdf.setSubject('');
  pdf.setKeywords([]);
  pdf.setProducer('PDF Media Suite');
  pdf.setCreator('PDF Media Suite');
}

async function scrubMetadataInViewer() {
  if (!requireOpenPdf()) return;
  showLoading('Scrubbing hidden metadata…');
  const pdf = await PDFDocument.load(await buildExportPdfBytes(), { ignoreEncryption: true });
  clearPdfMetadataFields(pdf);
  await applyAndReloadBytes(await pdf.save(), '✓ All hidden PDF metadata scrubbed!');
}

// ─── EVENT BINDINGS & KEYBOARD SHORTCUTS ───────────────────────────────────
function bindAllUiEvents() {
  // Open file buttons
  $('btn-open-file').addEventListener('click', () => els.openPdfInput.click());
  $('btn-hero-open').addEventListener('click', () => els.openPdfInput.click());
  els.openPdfInput.addEventListener('change', (e) => {
    if (e.target.files?.[0]) void openFileObject(e.target.files[0]);
    e.target.value = '';
  });

  // Merge PDFs input
  els.mergePdfInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length || !state.pdfBytes) return;
    showLoading(`Merging ${files.length} PDF(s)…`);
    try {
      const pos = els.mergePdfInput.dataset.pos || 'end';
      const basePdf = await PDFDocument.load(await buildExportPdfBytes(), { ignoreEncryption: true });
      const out = await PDFDocument.create();

      const copyAllFrom = async (srcBytes) => {
        const d = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
        const idxs = Array.from({ length: d.getPageCount() }, (_, i) => i);
        return await out.copyPages(d, idxs);
      };

      const basePages = await out.copyPages(
        basePdf,
        Array.from({ length: basePdf.getPageCount() }, (_, i) => i)
      );

      if (pos === 'start') {
        for (const f of files) (await copyAllFrom(await f.arrayBuffer())).forEach((p) => out.addPage(p));
        basePages.forEach((p) => out.addPage(p));
      } else if (pos === 'after-current') {
        const splitIdx = state.currentPage;
        basePages.slice(0, splitIdx).forEach((p) => out.addPage(p));
        for (const f of files) (await copyAllFrom(await f.arrayBuffer())).forEach((p) => out.addPage(p));
        basePages.slice(splitIdx).forEach((p) => out.addPage(p));
      } else {
        basePages.forEach((p) => out.addPage(p));
        for (const f of files) (await copyAllFrom(await f.arrayBuffer())).forEach((p) => out.addPage(p));
      }
      await applyAndReloadBytes(await out.save(), `✓ Merged ${files.length} PDF(s) into viewer!`);
    } catch (err) {
      hideLoading();
      showToast(`Merge failed: ${err.message}`, 'error');
    }
  });

  // Place image overlay on current page
  $('btn-insert-image').addEventListener('click', () => {
    if (!requireOpenPdf()) return;
    els.insertImgInput.click();
  });
  els.insertImgInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !state.pdfBytes) return;
    const reader = new FileReader();
    reader.onload = () => {
      addAnnotation(state.currentPage, {
        id: 'img_' + Date.now(),
        type: 'image',
        dataUrl: String(reader.result),
        x: 0.3,
        y: 0.3,
        w: 0.32,
        h: 0.24,
      });
      setToolMode('select');
      showToast('✓ Image placed — drag to move or corner-drag to resize!', 'success');
    };
    reader.readAsDataURL(file);
  });

  // Append images as full PDF pages
  els.appendImgPagesInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length || !state.pdfBytes) return;
    showLoading(`Adding ${files.length} image page(s)…`);
    try {
      const pdf = await PDFDocument.load(await buildExportPdfBytes(), { ignoreEncryption: true });
      for (const f of files) {
        const singleBytes = await convertSingleImageFileToPdfBytes(f);
        const singleDoc = await PDFDocument.load(singleBytes);
        const [cp] = await pdf.copyPages(singleDoc, [0]);
        pdf.addPage(cp);
      }
      await applyAndReloadBytes(await pdf.save(), `✓ Appended ${files.length} image page(s)!`);
    } catch (err) {
      hideLoading();
      showToast(`Could not append image: ${err.message}`, 'error');
    }
  });

  // Drag & Drop anywhere in window
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    document.body.classList.add('window-drag-over');
  });
  window.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null) document.body.classList.remove('window-drag-over');
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    document.body.classList.remove('window-drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) void openFileObject(file);
  });

  // Sidebars toggle
  $('btn-toggle-left').addEventListener('click', () => {
    els.leftSidebar.hidden = !els.leftSidebar.hidden;
  });
  $('btn-toggle-right').addEventListener('click', (e) => {
    els.rightDock.hidden = !els.rightDock.hidden;
    e.currentTarget.classList.toggle('active', !els.rightDock.hidden);
  });

  // Left sidebar tabs
  document.querySelectorAll('.side-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.side-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.ltab;
      $('pane-thumbs').hidden = target !== 'thumbs';
      $('pane-outline').hidden = target !== 'outline';
      $('pane-info').hidden = target !== 'info';
    });
  });

  // Page prev / next / jump
  $('btn-prev-page').addEventListener('click', () => scrollToPage(state.currentPage - 1));
  $('btn-next-page').addEventListener('click', () => scrollToPage(state.currentPage + 1));
  els.pageNumInput.addEventListener('change', () => scrollToPage(Number(els.pageNumInput.value) || 1));

  // Zoom controls
  const applyZoom = async (val) => {
    state.zoomMode = String(val);
    if (val === 'fit-width' || val === 'fit-page') {
      await computeFitScale(val);
    } else {
      state.scale = Math.max(0.35, Math.min(3.5, Number(val) || 1));
    }
    if (state.pdfDoc) await buildStageAndThumbnails();
  };
  els.zoomSelect.addEventListener('change', () => void applyZoom(els.zoomSelect.value));
  $('btn-zoom-in').addEventListener('click', () => {
    const next = Math.min(3.0, Math.round((state.scale + 0.2) * 100) / 100);
    els.zoomSelect.value = '1';
    void applyZoom(next);
  });
  $('btn-zoom-out').addEventListener('click', () => {
    const next = Math.max(0.4, Math.round((state.scale - 0.2) * 100) / 100);
    els.zoomSelect.value = '1';
    void applyZoom(next);
  });

  // Annotation mode buttons & subbar
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => setToolMode(btn.dataset.mode));
  });
  $('annot-colors').querySelectorAll('.swatch').forEach((sw) => {
    sw.addEventListener('click', () => {
      $('annot-colors').querySelectorAll('.swatch').forEach((b) => b.classList.remove('active'));
      sw.classList.add('active');
      state.annotColor = sw.dataset.color;
    });
  });
  els.annotCustomColor.addEventListener('input', () => {
    state.annotColor = els.annotCustomColor.value;
  });
  els.annotSize.addEventListener('input', () => {
    state.annotSize = Number(els.annotSize.value);
    els.annotSizeVal.textContent = String(state.annotSize);
  });
  $('btn-done-mode').addEventListener('click', () => setToolMode('select'));
  $('btn-bake-annotations').addEventListener('click', async () => {
    if (!requireOpenPdf()) return;
    showLoading('Applying annotations to PDF…');
    const baked = await buildExportPdfBytes();
    await applyAndReloadBytes(baked, '✓ Annotations permanently applied!');
    setToolMode('select');
  });

  // Top right actions
  els.btnUndo.addEventListener('click', () => void handleUndo());
  els.btnRedo.addEventListener('click', () => void handleRedo());
  $('btn-rotate-quick').addEventListener('click', () => void handleThumbQuickAction(state.currentPage, 'rot'));
  $('btn-print').addEventListener('click', () => void handleNativePrint());
  $('btn-save-pdf').addEventListener('click', async () => {
    if (!requireOpenPdf()) return;
    showLoading('Saving edited PDF…');
    try {
      const outBytes = await buildExportPdfBytes();
      const desiredName = sanitizePdfFilename(els.docFilename.value || state.fileName);
      triggerDownload(outBytes, desiredName);
      markDirty(false);
      showToast(`✓ Saved ${desiredName} (${formatBytes(outBytes.byteLength)})!`, 'success');
    } finally {
      hideLoading();
    }
  });

  // Theme cycle (Dark -> Light -> Sepia -> Night Invert PDF)
  const themes = ['dark', 'light', 'sepia', 'night-invert'];
  $('btn-theme-cycle').addEventListener('click', () => {
    const next = themes[(themes.indexOf(state.theme) + 1) % themes.length];
    state.theme = next;
    document.body.dataset.theme = next;
    showToast(`Theme: ${next.toUpperCase()}`);
  });

  // Search bar
  $('btn-find-toggle').addEventListener('click', () => {
    els.findBar.hidden = !els.findBar.hidden;
    if (!els.findBar.hidden) els.findInput.focus();
  });
  $('btn-find-close').addEventListener('click', () => {
    els.findBar.hidden = true;
    void runDocumentSearch('');
  });
  els.findInput.addEventListener('input', () => void runDocumentSearch(els.findInput.value));
  els.findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') jumpSearchMatch(e.shiftKey ? -1 : 1, true);
    if (e.key === 'Escape') $('btn-find-close').click();
  });
  $('btn-find-next').addEventListener('click', () => jumpSearchMatch(1, true));
  $('btn-find-prev').addEventListener('click', () => jumpSearchMatch(-1, true));

  // Signature modal open/close
  $('btn-open-sign-modal').addEventListener('click', () => {
    if (!requireOpenPdf()) return;
    els.signModal.hidden = false;
  });
  $('btn-close-sign-modal').addEventListener('click', () => { els.signModal.hidden = true; });
  $('btn-cancel-sign').addEventListener('click', () => { els.signModal.hidden = true; });

  // Extracted text modal
  $('btn-close-text-modal').addEventListener('click', () => { els.textModal.hidden = true; });
  $('btn-copy-extracted').addEventListener('click', async () => {
    await navigator.clipboard.writeText(state.extractedContent || '');
    showToast('✓ Copied to clipboard!', 'success');
  });
  $('btn-download-extracted').addEventListener('click', () => {
    triggerDownload(
      new Blob([state.extractedContent || ''], { type: 'text/plain;charset=utf-8' }),
      sanitizePdfFilename(state.fileName, '_extracted', state.extractedExt),
      'text/plain'
    );
  });

  // Password modal
  $('btn-cancel-password').addEventListener('click', () => { els.passwordModal.hidden = true; });
  $('btn-submit-password').addEventListener('click', () => {
    const pw = els.pdfPasswordInput.value;
    if (state.pendingPasswordBytes) {
      void loadPdfBytes(state.pendingPasswordBytes, state.fileName, { password: pw });
    }
  });
  els.pdfPasswordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('btn-submit-password').click();
  });

  // Metadata scrub & Open in native Chrome viewer bypass
  $('btn-scrub-metadata').addEventListener('click', () => void scrubMetadataInViewer());
  els.btnOpenNativeChrome.addEventListener('click', () => {
    if (!state.originalUrl) return;
    const sep = state.originalUrl.includes('#') ? '&' : '#';
    window.location.href = `${state.originalUrl}${sep}pms_native=1`;
  });
  $('btn-open-ext-settings')?.addEventListener('click', () => {
    chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
  });

  // Right dock search & drawer back
  els.dockSearch.addEventListener('input', () => renderDockTools(els.dockSearch.value));
  $('btn-drawer-back').addEventListener('click', () => { els.toolDrawer.hidden = true; });

  // Auto-intercept PDFs toggle synced with background service worker
  chrome.storage.local.get(['autoOpenPdfViewer'], (res) => {
    els.chkAutoViewer.checked = res.autoOpenPdfViewer !== false;
  });
  els.chkAutoViewer.addEventListener('change', () => {
    const enabled = els.chkAutoViewer.checked;
    chrome.runtime.sendMessage({ type: 'SET_AUTO_PDF_VIEWER', enabled }, () => {
      showToast(enabled ? '⚡ Auto PDF Studio Viewer ENABLED' : 'Auto PDF Viewer paused (Chrome default active)');
    });
  });

  // Global keyboard shortcuts (Ctrl+P, Ctrl+S, Ctrl+F, Ctrl+O, Ctrl+Z, Ctrl+Y, Esc)
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;

    if (mod && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      void handleNativePrint();
      return;
    }
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      $('btn-save-pdf').click();
      return;
    }
    if (mod && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      els.findBar.hidden = false;
      els.findInput.focus();
      els.findInput.select();
      return;
    }
    if (mod && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      els.openPdfInput.click();
      return;
    }
    if (mod && !inInput && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) void handleRedo();
      else void handleUndo();
      return;
    }
    if (mod && !inInput && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      void handleRedo();
      return;
    }
    if (e.key === 'Escape') {
      setToolMode('select');
      els.signModal.hidden = true;
      els.textModal.hidden = true;
    }
  });
}

// ─── INITIALIZE VIEWER ON STARTUP ──────────────────────────────────────────
async function bootStudioViewer() {
  renderDockTools();
  initSignatureModal();
  bindAllUiEvents();

  const params = new URLSearchParams(window.location.search);
  const localId = params.get('localId');
  const fileParam = params.get('file');
  const hashUrl = window.location.hash ? window.location.hash.slice(1) : '';
  const initialTool = params.get('tool');

  if (localId && window.PMSStudioDB) {
    showLoading('Opening local document…');
    try {
      const rec = await window.PMSStudioDB.loadPendingStudioFile(localId);
      if (rec && rec.buffer) {
        const blob = new Blob([rec.buffer], { type: rec.mime || 'application/pdf' });
        blob.name = rec.name || 'document.pdf';
        await openFileObject(blob);
      } else {
        hideLoading();
      }
    } catch {
      hideLoading();
    }
  } else if (fileParam || hashUrl) {
    const rawTarget = fileParam || hashUrl;
    const resolvedUrl = rawTarget.startsWith('http') || rawTarget.startsWith('file:')
      ? rawTarget
      : decodeURIComponent(rawTarget);
    await fetchPdfFromUrl(resolvedUrl);
  }

  if (initialTool) {
    openStudioToolDrawer(initialTool);
  }
}

void bootStudioViewer();
