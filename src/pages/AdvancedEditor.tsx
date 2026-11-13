import { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createWorker } from 'tesseract.js';
import {
  Type,
  Square,
  Highlighter,
  PenTool,
  Link as LinkIcon,
  Download,
  ChevronLeft,
  ChevronRight,
  X,
  MousePointer2,
  Table,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  ZoomIn,
  ZoomOut,
  Undo2,
  Redo,
  Pencil,
  Loader2,
  Move,
  ScanText,
  ImagePlus,
  Eraser,
  Type as TypeIcon,
  SquarePen,
  Layers,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Sparkles,
} from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import FileDropzone from '../components/FileDropzone';
import { useSEO } from '../hooks/useSEO';
import { apiFetch } from '../lib/api';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import PearlAuroraBackground from '../components/pearl/PearlAuroraBackground';
import { PearlScanOverlay } from '../components/pearl/PearlMotion';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import {
  drawMatchedLatinText,
  drawVectorHarfbuzzText,
  hasNonLatinChars as checkNonLatinChars,
} from '../lib/vectorHarfbuzzPdf';
import {
  preprocessCanvasForOcr,
  extractTesseractWords,
  mergeRecoveredBrowserOcrWords,
  BrowserOcrWord,
} from '../lib/ocrLayerRenderer';

// Initialize pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Tool = 'select' | 'text' | 'whiteout' | 'highlight' | 'signature' | 'link' | 'table' | 'freehand' | 'image' | 'eraser' | 'underline' | 'strikethrough' | null;

interface Annotation {
  id: string;
  type: Tool;
  pageIndex: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  fontSize?: number;
  color?: string;
  /** PDF output uses Standard Helvetica variants (embedded). */
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  rows?: number;
  cols?: number;
  tableData?: string[][];
  signatureDataUrl?: string;
  url?: string;
  /** Freehand drawing SVG path data */
  pathData?: string;
  strokeWidth?: number;
  /** Inserted image data URL */
  imageDataUrl?: string;
  /** Text background to blend with scanned page when replacing OCR text */
  backgroundColor?: string;
  /** Prevent accidental drag for OCR-aligned text replacement */
  lockPosition?: boolean;
  /** Link text <-> whiteout pair for seamless replace */
  linkedId?: string;
  /** Original position of the text block before moving */
  sourceX?: number;
  sourceY?: number;
  /** Keep original OCR line metrics for smart resizing */
  sourceWidth?: number;
  sourceHeight?: number;
  /** Original font name from backend layout analysis */
  originalFontName?: string;
  /** CSS font-family stack derived from original PDF font (for live preview) */
  fontCssFamily?: string;
  /** Text alignment */
  align?: 'left' | 'center' | 'right';
  /** Exact text baseline in unscaled PDF points (from top of page) */
  baseline?: number;
}

/** Span info returned by /analyze/text-layout (PyMuPDF backend) */
interface BackendSpan {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  fontName: string;
  fontNameRaw: string;
  bold: boolean;
  italic: boolean;
  mono: boolean;
  color: string;
  baseline?: number;
  isInvisibleOcr?: boolean;
}

/** Word info returned by /analyze/text-layout (PyMuPDF backend) */
interface BackendWord {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  fontName: string;
  fontNameRaw: string;
  bold: boolean;
  italic: boolean;
  mono?: boolean;
  color: string;
  baseline: number;
  isInvisibleOcr?: boolean;
}

/** Context menu state */
interface ContextMenuState {
  visible: boolean;
  x: number;   // screen px
  y: number;   // screen px
  block: DetectedTextBlock | null;
}

/** Inline edit state — double-click to edit existing text in-place */
interface InlineEditState {
  active: boolean;
  block: DetectedTextBlock | null;
  text: string;
}

interface DetectedTextBlock {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;   // exact font size in unscaled PDF points (pt)
  baselineY?: number; // baseline Y in canvas pixels
  pdfBaselineY?: number; // baseline Y in unscaled PDF points (from top of page)
  fontName?: string;  // pdfjs internal font name
  bold?: boolean;     // detected from fontName
  italic?: boolean;   // detected from fontName
  exactColor?: string; // exact color from pdfjs
  fgColor?: string;   // sampled text color from canvas
  bgColor?: string;   // sampled background color from canvas
}

export default function AdvancedEditor() {
  useSEO('Advanced Editor Online Free | PDF Media Suite', 'Free online Advanced Editor tool. No signup or installation required.');
  const prefersReduced = useReducedMotion();

  const [file, setFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageViewport, setPageViewport] = useState<pdfjsLib.PageViewport | null>(null);

  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detectedText, setDetectedText] = useState<DetectedTextBlock[]>([]);

  // Property states (defaults for newly placed text)
  const [fontSize, setFontSize] = useState(14);
  const [textColor, setTextColor] = useState('#000000');
  const [defaultBold, setDefaultBold] = useState(false);
  const [defaultItalic, setDefaultItalic] = useState(false);

  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState<{ x: number, y: number, w: number, h: number } | null>(null);

  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [pendingLinkRect, setPendingLinkRect] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [linkUrl, setLinkUrl] = useState('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [saveStatusLabel, setSaveStatusLabel] = useState<string>('Saving...');
  const [savedEngineNote, setSavedEngineNote] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<'waking' | 'ready' | 'offline'>('waking');
  const [editedUrl, setEditedUrl] = useState<string | null>(null);

  useAutoRevokeUrl(editedUrl);

  // === Zoom ===
  const [zoomLevel, setZoomLevel] = useState(1.5);

  // === Undo/Redo ===
  const [undoStack, setUndoStack] = useState<Annotation[][]>([]);
  const [redoStack, setRedoStack] = useState<Annotation[][]>([]);

  // === Select granularity (word / line / paragraph) ===
  const [selectionGranularity, setSelectionGranularity] = useState<'word' | 'line' | 'paragraph'>('word');

  // === Continuous / Persistent Auto-Select mode (Default: ON) ===
  const [continuousSelect, setContinuousSelect] = useState(true);

  // Helper to determine if an RGB background is neutral paper-white (preserving tinted cards like Aadhaar beige/green/blue)
  const isNeutralPaperRgb = (r: number, g: number, b: number) => {
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    return lum >= 242 || (chroma <= 22 && lum >= 195);
  };

  // Helper to determine if a hex color is paper-white or neutral light scanner tone (should snap to #ffffff)
  const isPaperWhiteHex = (hex?: string) => {
    if (!hex || hex === 'transparent' || hex === '#ffffff' || hex === '#fbfcfc' || hex === '#fcfcfc') return true;
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return true;
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return isNeutralPaperRgb(r, g, b);
  };

  // === Drag move ===
  const [isDragging, setIsDragging] = useState(false);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // === Smart Magnetic Alignment Guides (Vertical & Horizontal Snap Lines) ===
  const [activeGuides, setActiveGuides] = useState<{ vertical: number | null; horizontal: number | null }>({
    vertical: null,
    horizontal: null,
  });

  // === Freehand ===
  const [freehandPoints, setFreehandPoints] = useState<{ x: number, y: number }[]>([]);
  const [freehandColor, setFreehandColor] = useState('#000000');
  const [freehandWidth, setFreehandWidth] = useState(2);

  // === Signature color ===
  const [signatureColor, setSignatureColor] = useState('#000000');

  // === Eraser ===
  const [eraserSize, setEraserSize] = useState(20);
  const [eraserPos, setEraserPos] = useState<{ x: number, y: number } | null>(null);

  // === Resize for image/signature annotations ===
  const resizeAnnRef = useRef<{ id: string; handle: string; startX: number; startY: number; startAnnX: number; startAnnY: number; startW: number; startH: number } | null>(null);
  const hasAutoScaledFontRef = useRef<boolean>(false);

  // === Eraser drag state ===
  const isErasingRef = useRef(false);
  const lastErasedRef = useRef<Set<string>>(new Set());

  // === OCR for scanned PDFs ===
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrDone, setOcrDone] = useState(false);
  const [isScannedPdf, setIsScannedPdf] = useState(false);
  const [ocrLanguage, setOcrLanguage] = useState<'eng' | 'hin' | 'eng+hin'>('eng+hin');
  const [ocrStatusLabel, setOcrStatusLabel] = useState<string>('');
  const [ocrNotice, setOcrNotice] = useState<string | null>(null);
  // Store unscaled PDF-point OCR blocks per page (1-based) so zooming or changing pages never wipes them
  const ocrBlocksByPageRef = useRef<Map<number, DetectedTextBlock[]>>(new Map());
  const currentPageRef = useRef<number>(1);
  currentPageRef.current = currentPage;

  const scaleOcrBlocks = (blocksPt: DetectedTextBlock[], scale: number): DetectedTextBlock[] =>
    blocksPt.map(b => ({
      ...b,
      x: Math.round(b.x * scale),
      y: Math.round(b.y * scale),
      w: Math.max(2, Math.round(b.w * scale)),
      h: Math.max(4, Math.round(b.h * scale)),
      baselineY: b.pdfBaselineY !== undefined ? Math.round(b.pdfBaselineY * scale) : undefined,
    }));

  // === Signature pen width ===
  const [signaturePenWidth, setSignaturePenWidth] = useState(2);

  // === NEW: Backend text layout (accurate font/color data from PyMuPDF) ===
  const [backendSpans, setBackendSpans] = useState<BackendSpan[]>([]);
  const [backendWords, setBackendWords] = useState<BackendWord[]>([]);
  const [layoutFetching, setLayoutFetching] = useState(false);

  // === NEW: Right-click context menu ===
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, block: null });

  // === NEW: Double-click inline edit ===
  const [inlineEdit, setInlineEdit] = useState<InlineEditState>({ active: false, block: null, text: '' });
  const inlineEditRef = useRef<HTMLTextAreaElement>(null);

  // Underline/Strikethrough tool active state is tracked via activeTool, no separate defaults needed

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pristineCanvasRef = useRef<ImageData | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const sigCanvasRef = useRef<SignatureCanvas>(null);

  const WHITEOUT_BASE_PAD = 2;
  const WHITEOUT_MAX_PAD = 8;
  const getWhiteoutPad = (h: number) => Math.max(WHITEOUT_BASE_PAD, Math.min(WHITEOUT_MAX_PAD, Math.round(h * 0.18)));

  const estimateTextWidth = (text: string, pxSize: number, bold?: boolean, italic?: boolean) => {
    const measureCanvas = document.createElement('canvas');
    const ctx = measureCanvas.getContext('2d');
    if (!ctx) return Math.max(8, text.length * pxSize * 0.56);
    const styleParts = [];
    if (italic) styleParts.push('italic');
    if (bold) styleParts.push('700');
    styleParts.push(`${Math.max(8, pxSize)}px`);
    styleParts.push('Helvetica, Arial, sans-serif');
    ctx.font = styleParts.join(' ');
    return Math.max(8, ctx.measureText(text || ' ').width);
  };

  const fitFontSizeToBox = (text: string, targetW: number, currentSize: number, bold?: boolean, italic?: boolean) => {
    if (!text.trim() || targetW <= 0) return currentSize;
    let size = Math.max(8, currentSize);
    const minSize = 8;
    const maxSize = 96;
    let width = estimateTextWidth(text, size, bold, italic);
    if (width <= targetW) {
      while (size < maxSize) {
        const next = size + 1;
        const nextW = estimateTextWidth(text, next, bold, italic);
        if (nextW > targetW) break;
        size = next;
        width = nextW;
      }
      return size;
    }
    while (width > targetW && size > minSize) {
      size -= 1;
      width = estimateTextWidth(text, size, bold, italic);
    }
    return size;
  };

  const fitFontSizeToBounds = (text: string, targetW: number, targetH: number, currentSize: number, bold?: boolean, italic?: boolean) => {
    let size = fitFontSizeToBox(text, targetW, currentSize, bold, italic);
    const minSize = 7;
    const maxInkH = Math.max(6, targetH * 0.86);
    while (size > minSize && size * 1.05 > maxInkH) size -= 1;
    return size;
  };

  const handleDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      setFile(selectedFile);
      setPdfDoc(null);
      setPageViewport(null);
      setEditedUrl(null);
      setSavedEngineNote(null);
      setAnnotations([]);
      setDetectedText([]);
      setUndoStack([]);
      setRedoStack([]);
      ocrBlocksByPageRef.current.clear();
      setOcrDone(false);
      setIsScannedPdf(false);
      setOcrNotice(null);
      setOcrStatusLabel('');
      hasAutoScaledFontRef.current = false;
      setFontSize(14);

      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        setCurrentPage(1);
        setActiveTool('select');
      } catch (error) {
        console.error("Error loading PDF:", error);
      }
    }
  };

  // === Undo/Redo helpers ===
  const pushUndo = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-30), annotations.map(a => ({ ...a }))]);
    setRedoStack([]);
  }, [annotations]);

  const doUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack(r => [...r, annotations.map(a => ({ ...a }))]);
    setUndoStack(s => s.slice(0, -1));
    setAnnotations(prev);
    setSelectedId(null);
  }, [undoStack, annotations]);

  const doRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(s => [...s, annotations.map(a => ({ ...a }))]);
    setRedoStack(r => r.slice(0, -1));
    setAnnotations(next);
    setSelectedId(null);
  }, [redoStack, annotations]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); doRedo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); doRedo(); }
      if (e.key === 'Delete' && selectedId) { pushUndo(); deleteAnnotation(selectedId); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [doUndo, doRedo, selectedId, pushUndo]);

  // === Render Cold-Start Pre-Warm: Wake backend immediately when user opens /edit ===
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/', {
          method: 'GET',
          timeoutMs: 65000,
          suppressTelemetry: true,
        });
        if (!cancelled) {
          setBackendStatus(res.ok ? 'ready' : 'offline');
        }
      } catch {
        if (!cancelled) {
          setBackendStatus('offline');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (pdfDoc && !editedUrl) {
      renderPage(currentPage);
      // Fetch accurate backend text layout after rendering
      if (file) {
        fetchTextLayout(file, currentPage - 1);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, currentPage, zoomLevel, editedUrl]);

  // If backend finishes waking up after PDF was already rendered on page, fetch layout once
  useEffect(() => {
    if (backendStatus === 'ready' && file && pdfDoc && backendSpans.length === 0 && !layoutFetching) {
      fetchTextLayout(file, currentPage - 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendStatus]);

  // === Fetch accurate text layout from backend (PyMuPDF) ===
  const fetchTextLayout = async (pdfFile: File, pageIndex: number) => {
    setLayoutFetching(true);
    try {
      const formData = new FormData();
      formData.append('file', pdfFile);
      formData.append('page', String(pageIndex));
      const res = await apiFetch('/analyze/text-layout', {
        method: 'POST',
        body: formData,
        timeoutMs: 65000,
        suppressTelemetry: true,
      });
      if (res.ok) {
        const data = await res.json();
        setBackendSpans(data.spans || []);
        setBackendWords(data.words || []);
        setBackendStatus('ready');
      }
    } catch (e) {
      // Silently ignore — pdfjs text detection + frontend vector HarfBuzz is the fallback
      console.warn('[AdvancedEditor] Backend text layout fetch failed:', e);
    } finally {
      setLayoutFetching(false);
    }
  };

  // === Helper: find backend word or span matching a detected text block ===
  const findBackendMatch = (block: DetectedTextBlock): {
    fontSize: number;
    fontName: string;
    bold: boolean;
    italic: boolean;
    color: string;
    baseline: number;
    isInvisibleOcr?: boolean;
  } | null => {
    if (!pageViewport) return null;
    const scale = pageViewport.scale;
    const bx = block.x / scale;
    const by = block.y / scale;
    const bw = block.w / scale;
    const bh = block.h / scale;
    const blockText = block.text.trim().toLowerCase();

    // 1. Search word-level PyMuPDF layout
    if (backendWords.length > 0) {
      const wordMatch = backendWords.find(w => {
        const wText = w.text.trim().toLowerCase();
        const textEqual = wText === blockText || wText.includes(blockText) || blockText.includes(wText);
        const posNear = Math.abs(w.x - bx) < Math.max(16, bw * 0.8) && Math.abs(w.y - by) < Math.max(18, bh * 0.7);
        return textEqual && posNear;
      });
      if (wordMatch) {
        return {
          fontSize: wordMatch.isInvisibleOcr && block.fontSize ? block.fontSize : wordMatch.fontSize,
          fontName: wordMatch.fontName,
          bold: wordMatch.bold,
          italic: wordMatch.italic,
          color: wordMatch.isInvisibleOcr ? (block.fgColor || wordMatch.color) : wordMatch.color,
          baseline: wordMatch.baseline,
          isInvisibleOcr: wordMatch.isInvisibleOcr,
        };
      }
    }

    // 2. Search span-level PyMuPDF layout
    if (backendSpans.length > 0) {
      const spanMatch = backendSpans.find(s => {
        const sText = s.text.trim().toLowerCase();
        const textInSpan = sText.includes(blockText) || blockText.includes(sText);
        const xInside = (bx >= s.x - 8) && (bx <= s.x + s.w + 8);
        const yNear = Math.abs(s.y - by) < Math.max(18, s.h * 1.5);
        return textInSpan && xInside && yNear;
      });
      if (spanMatch) {
        return {
          fontSize: spanMatch.isInvisibleOcr && block.fontSize ? block.fontSize : spanMatch.fontSize,
          fontName: spanMatch.fontName,
          bold: spanMatch.bold,
          italic: spanMatch.italic,
          color: spanMatch.isInvisibleOcr ? (block.fgColor || spanMatch.color) : spanMatch.color,
          baseline: spanMatch.baseline || (spanMatch.y + spanMatch.h * 0.82),
          isInvisibleOcr: spanMatch.isInvisibleOcr,
        };
      }
    }

    return null;
  };

  // Backwards-compatible alias for any callers expecting findBackendSpan
  const findBackendSpan = (block: DetectedTextBlock): BackendSpan | null => {
    const m = findBackendMatch(block);
    if (!m) return null;
    return {
      text: block.text,
      x: block.x / (pageViewport?.scale || 1),
      y: block.y / (pageViewport?.scale || 1),
      w: block.w / (pageViewport?.scale || 1),
      h: block.h / (pageViewport?.scale || 1),
      fontSize: m.fontSize,
      fontName: m.fontName,
      fontNameRaw: m.fontName,
      bold: m.bold,
      italic: m.italic,
      mono: false,
      color: m.color,
      baseline: m.baseline,
    };
  };

  // Clear a specific text block footprint on the rendered canvas so no ghost text stays behind
  const clearTextFootprintOnCanvas = useCallback((sx: number, sy: number, sw: number, sh: number, bg?: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const fill = isPaperWhiteHex(bg) ? '#ffffff' : (bg || '#ffffff');
    ctx.fillStyle = fill;
    ctx.fillRect(Math.floor(sx) - 1, Math.floor(sy) - 1, Math.ceil(sw) + 2, Math.ceil(sh) + 2);
  }, []);

  // Restore pristine canvas and erase all active text annotations' source footprints
  const syncCanvasWithAnnotations = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pristineCanvasRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Restore pristine background from PDF.js
    ctx.putImageData(pristineCanvasRef.current, 0, 0);

    // 2. Erase the original text at source positions for all active text annotations on current page
    const pageAnnotations = annotations.filter(
      a => a.pageIndex === currentPage - 1 && a.type === 'text' && a.sourceWidth && a.sourceWidth > 0
    );
    for (const ann of pageAnnotations) {
      const sx = ann.sourceX !== undefined ? ann.sourceX : ann.x;
      const sy = ann.sourceY !== undefined ? ann.sourceY : ann.y;
      const sw = ann.sourceWidth || ann.width || 80;
      const sh = ann.sourceHeight || ann.height || 20;
      const bg = isPaperWhiteHex(ann.backgroundColor) ? '#ffffff' : (ann.backgroundColor || '#ffffff');

      ctx.fillStyle = bg;
      ctx.fillRect(Math.floor(sx) - 1, Math.floor(sy) - 1, Math.ceil(sw) + 2, Math.ceil(sh) + 2);
    }
  }, [annotations, currentPage]);

  useEffect(() => {
    syncCanvasWithAnnotations();
  }, [syncCanvasWithAnnotations]);

  const renderPage = async (pageNum: number) => {
    if (!pdfDoc || !canvasRef.current) return;

    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: zoomLevel });
      setPageViewport(viewport);

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (context) {
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
          canvasContext: context,
          viewport: viewport,
          canvas: canvas
        }).promise;

        pristineCanvasRef.current = context.getImageData(0, 0, canvas.width, canvas.height);
        syncCanvasWithAnnotations();
      }

      // Text detection for editing
      const textContent = await page.getTextContent();
      const textStyles = ((textContent as any).styles || {}) as Record<string, { fontFamily?: string }>;
      const rawItems: DetectedTextBlock[] = textContent.items
        .map((item: any) => {
          const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
          // True visual PDF font size in points (respects /UserUnit & nested CTM scaling)
          const fontScaleX = Math.hypot(item.transform[0], item.transform[1]);
          const fontScaleY = Math.hypot(item.transform[2], item.transform[3]);
          const txScaleY = Math.hypot(tx[2], tx[3]) / viewport.scale;
          const txScaleX = Math.hypot(tx[0], tx[1]) / viewport.scale;
          const rawPdfPt = txScaleY || fontScaleY || fontScaleX || txScaleX || item.height || 11;
          const extractedFontSize = Math.round(Math.min(Math.max(rawPdfPt, 4), 200) * 10) / 10;

          const baselineCanvasY = Math.round(tx[5]);
          const blockH = Math.round(extractedFontSize * viewport.scale * 1.25);
          const topY = Math.round(baselineCanvasY - (extractedFontSize * viewport.scale * 0.85));
          const blockW = Math.round(Math.max(item.width * viewport.scale, 1));

          // Detect bold / italic and real CSS family from font name + pdf.js font styles table
          const rawFontName: string = item.fontName || '';
          const styleFamily = textStyles[rawFontName]?.fontFamily || '';
          const fontName: string =
            styleFamily && !rawFontName.toLowerCase().includes(styleFamily.toLowerCase())
              ? `${rawFontName} ${styleFamily}`.trim()
              : rawFontName;
          const isBold = /bold|black|heavy|semibold/i.test(fontName);
          const isItalic = /italic|oblique/i.test(fontName);

          let exactColor: string | undefined;
          if (item.color && item.color.length >= 3) {
            exactColor = `#${item.color[0].toString(16).padStart(2, '0')}${item.color[1].toString(16).padStart(2, '0')}${item.color[2].toString(16).padStart(2, '0')}`;
          }

          return {
            text: item.str,
            x: Math.round(tx[4]),
            y: Math.max(0, topY),
            w: blockW,
            h: Math.max(blockH, Math.round(extractedFontSize * viewport.scale) + 2),
            fontSize: extractedFontSize,
            baselineY: baselineCanvasY,
            pdfBaselineY: Math.round((baselineCanvasY / viewport.scale) * 100) / 100,
            fontName,
            bold: isBold,
            italic: isItalic,
            exactColor,
          };
        })
        .filter(i =>
          i.text.trim().length > 0 &&
          i.w > 0 &&
          i.h > 0 &&
          i.h < 400
        );

      // Consolidate adjacent zero-gap fragments on the same baseline into complete words/tokens
      // (PDF streams often break numbers like "10006099872" into "10", "00060998", "72")
      const sortedRaw = [...rawItems].sort((a, b) => {
        const yDiff = a.y - b.y;
        if (Math.abs(yDiff) > Math.max(a.h, b.h) * 0.4) return yDiff;
        return a.x - b.x;
      });
      const consolidated: DetectedTextBlock[] = [];
      for (const cur of sortedRaw) {
        if (!consolidated.length) {
          consolidated.push({ ...cur });
          continue;
        }
        const last = consolidated[consolidated.length - 1];
        const lastBaseY = last.baselineY ?? last.y;
        const curBaseY = cur.baselineY ?? cur.y;
        const sameBaseline = Math.abs(lastBaseY - curBaseY) <= 3 || Math.abs(last.y - cur.y) <= 3;
        const gap = cur.x - (last.x + last.w);
        const noSpace = !last.text.endsWith(' ') && !cur.text.startsWith(' ');
        // If items touch or are within 2.5px without whitespace, they belong to the same word/number token
        if (sameBaseline && gap >= -2 && gap <= 2.5 && noSpace) {
          last.text += cur.text;
          last.w = Math.round((cur.x + cur.w) - last.x);
          last.h = Math.max(last.h, cur.h);
        } else {
          consolidated.push({ ...cur });
        }
      }

      // Sample canvas pixels to detect text (fg) and background colors
      // This runs after rendering so canvas has the page pixels
      const ctx = context; // already obtained above
      const items: DetectedTextBlock[] = consolidated.map(block => {
        if (!ctx) return block;
        try {
          // ── Robust background color: sample paper from left/right margins
          // (NEVER sample top/bottom which hits dark text lines above/below!)
          let bgR = 255, bgG = 255, bgB = 255;
          const candidatePoints = [
            [block.x - 3, block.y + Math.round(block.h * 0.5)],
            [block.x - 6, block.y + Math.round(block.h * 0.5)],
            [block.x + block.w + 3, block.y + Math.round(block.h * 0.5)],
            [block.x + block.w + 6, block.y + Math.round(block.h * 0.5)],
            [block.x - 3, block.y + 2],
            [block.x + block.w + 3, block.y + 2],
          ];
          let maxLum = -1;
          for (const [cx2, cy2] of candidatePoints) {
            const sx = Math.max(0, Math.min(Math.round(cx2), canvas.width - 1));
            const sy = Math.max(0, Math.min(Math.round(cy2), canvas.height - 1));
            const px = ctx.getImageData(sx, sy, 1, 1).data;
            if (px[3] > 128) {
              const lum = 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2];
              if (lum > maxLum) {
                maxLum = lum;
                bgR = px[0]; bgG = px[1]; bgB = px[2];
              }
            }
          }
          let bgColor = '#ffffff';
          // Snap neutral white paper background (preserving tinted ID/card colors) to pure white
          if (maxLum >= 0 && isNeutralPaperRgb(bgR, bgG, bgB)) {
            bgColor = '#ffffff';
          } else if (maxLum >= 0) {
            bgColor = `#${bgR.toString(16).padStart(2,'0')}${bgG.toString(16).padStart(2,'0')}${bgB.toString(16).padStart(2,'0')}`;
          }

          // ── Foreground color: prefer exactColor from pdf.js (100% accurate)
          // Fall back to canvas scan only if exactColor is missing.
          let fgColor = block.exactColor;
          if (!fgColor) {
            // Scan middle row of text bounding box, find darkest pixel (= text color)
            const midY = Math.max(0, Math.min(Math.round(block.y + block.h * 0.52), canvas.height - 1));
            let minL = 999, fR = 0, fG = 0, fB = 0;
            for (let sx = Math.max(0, block.x + 2); sx < Math.min(block.x + block.w - 2, canvas.width); sx += 2) {
              const px = ctx.getImageData(sx, midY, 1, 1).data;
              const l = 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2];
              if (l < minL) { minL = l; fR = px[0]; fG = px[1]; fB = px[2]; }
            }
            fgColor = minL < 200
              ? `#${fR.toString(16).padStart(2,'0')}${fG.toString(16).padStart(2,'0')}${fB.toString(16).padStart(2,'0')}`
              : '#000000';
          }

          return { ...block, bgColor, fgColor };
        } catch {
          return { ...block, fgColor: block.exactColor || '#000000', bgColor: '#ffffff' };
        }
      });

      // Check if native PDF text exists on this page (ignoring invisible empty rects)
      const validNativeItems = items.filter(i => i.w > 2 && i.h > 2);
      const hasText = validNativeItems.length > 3;

      if (!hasText) {
        setIsScannedPdf(true);
        const cachedOcrPt = ocrBlocksByPageRef.current.get(pageNum);
        if (cachedOcrPt && cachedOcrPt.length > 0) {
          // Restore OCR boxes rescaled cleanly to current zoom (e.g. 75% <-> 150%)
          setDetectedText(scaleOcrBlocks(cachedOcrPt, viewport.scale));
          setOcrDone(true);
        } else {
          setDetectedText([]);
          setOcrDone(false);
        }
      } else {
        setDetectedText(items);
        setIsScannedPdf(false);
        setOcrDone(false);
      }

      // Auto-calibrate New Text default fontSize on first load so high-DPI pixel-sized scans
      // (e.g. 1654x2339pt or 2480x3508pt) don't start with microscopic 14pt text
      if (!hasAutoScaledFontRef.current) {
        hasAutoScaledFontRef.current = true;
        const pageWidthPt = viewport.width / viewport.scale;
        if (items.length >= 3) {
          const sizes = items.map(it => it.fontSize).filter(s => s >= 5 && s <= 160).sort((a, b) => a - b);
          if (sizes.length > 0) {
            const medianPt = sizes[Math.floor(sizes.length / 2)];
            setFontSize(Math.round(Math.max(10, Math.min(72, medianPt))));
          }
        } else if (pageWidthPt > 750) {
          const scaledDefault = Math.round(Math.max(12, Math.min(72, 12 * (pageWidthPt / 595))));
          setFontSize(scaledDefault);
        }
      }
    } catch (error) {
      console.error("Error rendering page:", error);
    }
  };

  // === Upgraded Multi-Engine OCR for Scanned PDFs (Backend Pro Hybrid + High-Res Browser Fallback) ===
  const runOcrOnPage = async () => {
    if (!pdfDoc) return;
    const targetPage = currentPage;
    const activeScale = pageViewport?.scale || zoomLevel || 1;
    setOcrBusy(true);
    setOcrNotice(null);
    setOcrStatusLabel('Scanning page...');

    try {
      const apiLang = ocrLanguage === 'eng+hin' ? 'hin+eng' : ocrLanguage;
      let unscaledBlocks: DetectedTextBlock[] = [];

      // 1. Prefer Pro Hybrid Backend OCR (/ocr/page-words: RapidOCR + OpenCV cleaner + Tesseract TSV)
      if (file && backendStatus !== 'offline') {
        try {
          setOcrStatusLabel('Running Pro AI OCR...');
          const fd = new FormData();
          fd.append('file', file);
          fd.append('page', String(targetPage - 1));
          fd.append('lang', apiLang);
          const res = await apiFetch('/ocr/page-words', {
            method: 'POST',
            body: fd,
            timeoutMs: backendStatus === 'ready' ? 28000 : 12000,
          });
          if (res.ok) {
            setBackendStatus('ready');
            const payload = await res.json();
            if (Array.isArray(payload?.words) && payload.words.length > 0) {
              unscaledBlocks = payload.words
                .map((w: any): DetectedTextBlock => {
                  const x = Number(w.x) || 0;
                  const y = Number(w.y) || 0;
                  const bw = Math.max(2, Number(w.w) || 2);
                  const bh = Math.max(4, Number(w.h) || 4);
                  const fsz = Number(w.fontSize) || Math.max(6, Math.min(160, Math.round(bh * 0.76 * 10) / 10));
                  const basePt = Number(w.baseline) || Math.round((y + bh * 0.80) * 100) / 100;
                  return {
                    text: String(w.text || '').trim(),
                    x,
                    y,
                    w: bw,
                    h: bh,
                    fontSize: fsz,
                    pdfBaselineY: basePt,
                    fgColor: String(w.fgColor || '#000000'),
                    bgColor: isPaperWhiteHex(w.bgColor) ? '#ffffff' : String(w.bgColor || '#ffffff'),
                  };
                })
                .filter((b: DetectedTextBlock) => b.text.length > 0);
            }
          }
        } catch (backendErr) {
          console.warn('Backend /ocr/page-words unavailable, falling back to high-res browser OCR:', backendErr);
        }
      }

      // 2. High-Resolution Preprocessed Dual-Pass Browser OCR Fallback (independent of UI zoom!)
      if (unscaledBlocks.length === 0) {
        setOcrStatusLabel('Rendering high-DPI scan...');
        const page = await pdfDoc.getPage(targetPage);
        const baseVp = page.getViewport({ scale: 1.0 });
        const maxBaseDim = Math.max(baseVp.width, baseVp.height, 1);
        const ocrScale = Math.min(
          3.5,
          Math.max(2.2, 2400 / Math.max(350, baseVp.width)),
          3600 / maxBaseDim
        );
        const ocrVp = page.getViewport({ scale: ocrScale });

        const rawCanvas = document.createElement('canvas');
        rawCanvas.width = Math.max(16, Math.round(ocrVp.width));
        rawCanvas.height = Math.max(16, Math.round(ocrVp.height));
        const rawCtx = rawCanvas.getContext('2d', { willReadFrequently: true });
        if (!rawCtx) throw new Error('OCR canvas context unavailable');

        rawCtx.fillStyle = '#ffffff';
        rawCtx.fillRect(0, 0, rawCanvas.width, rawCanvas.height);
        await page.render({ canvasContext: rawCtx, viewport: ocrVp, canvas: rawCanvas }).promise;

        setOcrStatusLabel('Cleaning background...');
        const cleanCanvas = preprocessCanvasForOcr(rawCanvas);
        const rawImgData = rawCtx.getImageData(0, 0, rawCanvas.width, rawCanvas.height).data;

        setOcrStatusLabel('Recognizing words...');
        const tessLang = ocrLanguage === 'eng+hin' ? 'hin+eng' : ocrLanguage;
        const worker = await createWorker(tessLang, 1, {
          logger: (m: any) => {
            if (m?.status === 'recognizing text') {
              const pct = Math.round((m.progress || 0) * 100);
              setOcrStatusLabel(`OCR ${pct}%...`);
            }
          },
        });

        let finalWords: BrowserOcrWord[] = [];
        try {
          const cleanRes = await worker.recognize(cleanCanvas, {}, { blocks: true });
          const cleanWords = extractTesseractWords(cleanRes?.data);

          // Pass 2 recovery on untouched composite canvas catches text on deep colored headers (e.g. Aadhaar)
          const rawRes = await worker.recognize(rawCanvas, {}, { blocks: true });
          const rawWords = extractTesseractWords(rawRes?.data);
          finalWords = mergeRecoveredBrowserOcrWords(cleanWords, rawWords, rawCanvas);
        } finally {
          await worker.terminate();
        }

        const cw = rawCanvas.width;
        const ch = rawCanvas.height;

        for (const word of finalWords) {
          const t = (word.text || '').trim();
          const b = word.bbox;
          if (!t || !b || b.x1 <= b.x0 || b.y1 <= b.y0) continue;

          const x = Math.max(0, Math.floor(b.x0));
          const y = Math.max(0, Math.floor(b.y0));
          const w = Math.max(2, Math.min(cw - x, Math.ceil(b.x1 - x)));
          const h = Math.max(3, Math.min(ch - y, Math.ceil(b.y1 - y)));

          let fgColor = '#000000';
          let bgColor = '#ffffff';

          if (w > 0 && h > 0) {
            let minL = 255;
            let fgR = 0, fgG = 0, fgB = 0;
            const stride = (w * h > 3000) ? 2 : 1;

            for (let py = y; py < y + h; py += stride) {
              for (let px = x; px < x + w; px += stride) {
                const i = (py * cw + px) * 4;
                const r = rawImgData[i], g = rawImgData[i + 1], bl = rawImgData[i + 2];
                const l = 0.299 * r + 0.587 * g + 0.114 * bl;
                if (l < minL) { minL = l; fgR = r; fgG = g; fgB = bl; }
              }
            }
            fgColor = `#${((1 << 24) + (fgR << 16) + (fgG << 8) + fgB).toString(16).slice(1)}`;

            // Sample background from left/right outer margins so nearby lines above/below don't bleed in
            const pad = Math.max(3, Math.round(h * 0.25));
            let ringR = 0, ringG = 0, ringB = 0, ringCnt = 0;
            for (let py = y; py < y + h; py += stride) {
              for (let px = Math.max(0, x - pad); px < x; px += stride) {
                const i = (py * cw + px) * 4;
                ringR += rawImgData[i]; ringG += rawImgData[i + 1]; ringB += rawImgData[i + 2];
                ringCnt++;
              }
              for (let px = x + w; px < Math.min(cw, x + w + pad); px += stride) {
                const i = (py * cw + px) * 4;
                ringR += rawImgData[i]; ringG += rawImgData[i + 1]; ringB += rawImgData[i + 2];
                ringCnt++;
              }
            }
            if (ringCnt > 0) {
              const bR = Math.round(ringR / ringCnt);
              const bG = Math.round(ringG / ringCnt);
              const bB = Math.round(ringB / ringCnt);
              bgColor = isNeutralPaperRgb(bR, bG, bB)
                ? '#ffffff'
                : `#${((1 << 24) + (bR << 16) + (bG << 8) + bB).toString(16).slice(1)}`;
            }
          }

          const xPt = Math.round((x / ocrScale) * 100) / 100;
          const yPt = Math.round((y / ocrScale) * 100) / 100;
          const wPt = Math.round(Math.max(2, w / ocrScale) * 100) / 100;
          const hPt = Math.round(Math.max(4, h / ocrScale) * 100) / 100;
          const hasDescender = /[gjpqy\u0941\u0942\u0943]/.test(t);
          const hasDevUpper = /\u0930\u094D|[\u093F\u0940\u0947\u0948\u094B\u094C\u0902\u0901\u0945\u0949]/.test(t);
          const emDivisor = hasDescender && hasDevUpper ? 1.20 : hasDescender ? 0.96 : hasDevUpper ? 0.98 : 0.76;
          const baseFrac = hasDescender ? 0.78 : 0.95;
          const ocrFontSizePt = Math.max(6, Math.min(140, Math.round((hPt / emDivisor) * 10) / 10));
          const ocrBaselinePdfY = Math.round((yPt + hPt * baseFrac) * 100) / 100;

          unscaledBlocks.push({
            text: t,
            x: xPt,
            y: yPt,
            w: wPt,
            h: hPt,
            fontSize: ocrFontSizePt,
            pdfBaselineY: ocrBaselinePdfY,
            fgColor,
            bgColor,
          });
        }

        // Release offscreen canvas memory cleanly
        rawCanvas.width = 0; rawCanvas.height = 0;
        cleanCanvas.width = 0; cleanCanvas.height = 0;
      }

      if (unscaledBlocks.length > 0) {
        ocrBlocksByPageRef.current.set(targetPage, unscaledBlocks);

        // Calibrate New Text font size from OCR medians if it wasn't set by native items
        const sizes = unscaledBlocks.map(b => b.fontSize).filter(s => s >= 5 && s <= 160).sort((a, b) => a - b);
        if (sizes.length > 0) {
          const medianPt = sizes[Math.floor(sizes.length / 2)];
          setFontSize(Math.round(Math.max(10, Math.min(72, medianPt))));
        }

        if (currentPageRef.current === targetPage) {
          setDetectedText(scaleOcrBlocks(unscaledBlocks, activeScale));
          setOcrDone(true);
          setIsScannedPdf(true);
          setActiveTool('select');
          setOcrNotice(null);
        }
      } else if (currentPageRef.current === targetPage) {
        setDetectedText([]);
        setOcrDone(false);
        setIsScannedPdf(true);
        setOcrNotice('No readable text detected on this page. Try switching OCR Language (Hindi + English / Hindi / English) and click Re-Scan.');
      }
    } catch (e) {
      console.error('OCR failed:', e);
      setOcrDone(false);
      setIsScannedPdf(true);
      setOcrNotice('OCR encountered an issue on this page. Please try again or switch OCR Language.');
    } finally {
      setOcrBusy(false);
      setOcrStatusLabel('');
    }
  };

  // === Eraser helper ===
  const eraseAtPoint = (cx: number, cy: number) => {
    const radius = eraserSize / 2;
    setAnnotations(prev => prev.filter(a => {
      if (a.pageIndex !== currentPage - 1) return true;
      // For freehand: check each recorded path point against eraser radius
      if (a.type === 'freehand' && a.pathData) {
        const parts = a.pathData.trim().split(' ');
        for (const part of parts) {
          if (!part) continue;
          const coords = part.slice(1).split(',').map(Number);
          if (coords.length === 2 && !isNaN(coords[0])) {
            const dx = coords[0] - cx;
            const dy = coords[1] - cy;
            if (Math.sqrt(dx * dx + dy * dy) <= radius + (a.strokeWidth || 2)) return false;
          }
        }
        // Fallback: bounding box check for freehand too
        const ax = a.x, ay = a.y, aw = Math.max(a.width || 0, 4), ah = Math.max(a.height || 0, 4);
        const cx2 = Math.max(ax, Math.min(cx, ax + aw));
        const cy2 = Math.max(ay, Math.min(cy, ay + ah));
        return Math.sqrt((cx2 - cx) ** 2 + (cy2 - cy) ** 2) > radius;
      }
      // For all other annotation types: bounding box proximity
      const ax = a.x, ay = a.y;
      const aw = Math.max(a.width || 0, 20);
      const ah = Math.max(a.height || 0, 20);
      const closestX = Math.max(ax, Math.min(cx, ax + aw));
      const closestY = Math.max(ay, Math.min(cy, ay + ah));
      return Math.sqrt((closestX - cx) ** 2 + (closestY - cy) ** 2) > radius;
    }));
  };

  const handleOverlayMouseDown = (e: React.MouseEvent) => {
    if (!overlayRef.current) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // If no tool is active, check if we're clicking on an annotation to drag
    if (!activeTool) {
      const clickedAnn = [...annotations].reverse().find(a =>
        a.pageIndex === currentPage - 1 &&
        x >= a.x && x <= a.x + (a.width || 100) &&
        y >= a.y && y <= a.y + (a.height || 24)
      );
      if (clickedAnn) {
        setSelectedId(clickedAnn.id);
        if (!clickedAnn.lockPosition) {
          setIsDragging(true);
          setDragTarget(clickedAnn.id);
          setDragOffset({ x: x - clickedAnn.x, y: y - clickedAnn.y });
          pushUndo();
        }
        e.preventDefault();
        return;
      }
      // Clicked on blank area: deselect any active annotation
      setSelectedId(null);
      return;
    }

    if (activeTool === 'select') {
      // Text block clicks are handled by the selblock overlays (e.stopPropagation)
      // Clicking blank area in select mode just deselects
      setSelectedId(null);
      return;
    } else if (activeTool === 'text') {
      pushUndo();
      const curScale = pageViewport?.scale || 1;
      const boxW = Math.round(Math.max(160, fontSize * curScale * 8));
      const boxH = Math.round(Math.max(24, fontSize * curScale * 1.35));
      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        type: 'text',
        pageIndex: currentPage - 1,
        x,
        y,
        width: boxW,
        height: boxH,
        text: 'New Text',
        fontSize,
        color: textColor,
        bold: defaultBold,
        italic: defaultItalic,
      };
      setAnnotations(prev => [...prev, newAnnotation]);
      setSelectedId(newAnnotation.id);
      setActiveTool(null);
    } else if (activeTool === 'freehand') {
      setIsDrawing(true);
      setFreehandPoints([{ x, y }]);
    } else if (activeTool === 'eraser') {
      // Eraser drag begins
      isErasingRef.current = true;
      lastErasedRef.current = new Set();
      pushUndo();
      eraseAtPoint(x, y);
    } else if (['highlight', 'link', 'table', 'underline', 'strikethrough'].includes(activeTool!)) {
      setIsDrawing(true);
      setStartPos({ x, y });
      setCurrentRect({ x, y, w: 0, h: 0 });
    } else if (activeTool === 'signature') {
      setShowSignatureModal(true);
      setStartPos({ x, y });
    }
  };

  const handleOverlayMouseMove = (e: React.MouseEvent) => {
    if (!overlayRef.current) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    // Update eraser cursor position
    if (activeTool === 'eraser') {
      setEraserPos({ x: currentX, y: currentY });
      // Continuous erasing while mouse button held (use ref for reliability)
      if (isErasingRef.current) {
        eraseAtPoint(currentX, currentY);
      }
      return;
    }

    // Handle drag move with smart magnetic alignment guides
    if (isDragging && dragTarget) {
      setAnnotations(prev => {
        const dragAnn = prev.find(a => a.id === dragTarget);
        if (!dragAnn) return prev;

        const rawNextX = currentX - dragOffset.x;
        const rawNextY = currentY - dragOffset.y;
        const annW = dragAnn.width || 80;
        const annH = dragAnn.height || 20;

        // Collect snap candidate targets from other annotations and detected text blocks
        const snapDist = 6;
        let snappedX = rawNextX;
        let snappedY = rawNextY;
        let guideX: number | null = null;
        let guideY: number | null = null;

        const candidateTargets = [
          ...prev
            .filter(a => a.id !== dragTarget && a.pageIndex === currentPage - 1)
            .map(a => ({
              left: a.x,
              right: a.x + (a.width || 80),
              center: a.x + (a.width || 80) / 2,
              top: a.y,
              bottom: a.y + (a.height || 20),
            })),
          ...detectedText.map(b => ({
            left: b.x,
            right: b.x + b.w,
            center: b.x + b.w / 2,
            top: b.y,
            bottom: b.y + b.h,
          })),
        ];

        // Magnetic X-axis Snapping (Left, Right, Center)
        for (const t of candidateTargets) {
          if (Math.abs(rawNextX - t.left) < snapDist) {
            snappedX = t.left;
            guideX = t.left;
            break;
          }
          if (Math.abs(rawNextX + annW - t.right) < snapDist) {
            snappedX = t.right - annW;
            guideX = t.right;
            break;
          }
          if (Math.abs(rawNextX - t.right) < snapDist) {
            snappedX = t.right;
            guideX = t.right;
            break;
          }
          if (Math.abs(rawNextX + annW / 2 - t.center) < snapDist) {
            snappedX = t.center - annW / 2;
            guideX = t.center;
            break;
          }
        }

        // Magnetic Y-axis Snapping (Top, Bottom / Row Baseline)
        for (const t of candidateTargets) {
          if (Math.abs(rawNextY - t.top) < snapDist) {
            snappedY = t.top;
            guideY = t.top;
            break;
          }
          if (Math.abs(rawNextY + annH - t.bottom) < snapDist) {
            snappedY = t.bottom - annH;
            guideY = t.bottom;
            break;
          }
        }

        setActiveGuides({ vertical: guideX, horizontal: guideY });

        const deltaX = snappedX - dragAnn.x;
        const deltaY = snappedY - dragAnn.y;
        return prev.map(a => {
          if (a.id === dragTarget) return { ...a, x: snappedX, y: snappedY };
          if (dragAnn.linkedId && a.id === dragAnn.linkedId) {
            return { ...a, x: a.x + deltaX, y: a.y + deltaY };
          }
          return a;
        });
      });
      return;
    }

    // Freehand drawing
    if (isDrawing && activeTool === 'freehand') {
      setFreehandPoints(prev => [...prev, { x: currentX, y: currentY }]);
      return;
    }

    if (!isDrawing || !currentRect) return;

    setCurrentRect({
      x: Math.min(startPos.x, currentX),
      y: Math.min(startPos.y, currentY),
      w: Math.abs(currentX - startPos.x),
      h: Math.abs(currentY - startPos.y)
    });
  };

  const handleOverlayMouseUp = () => {
    // End eraser drag
    if (isErasingRef.current) {
      isErasingRef.current = false;
      lastErasedRef.current = new Set();
      return;
    }

    // End drag
    if (isDragging && dragTarget) {
      setIsDragging(false);
      setDragTarget(null);
      setActiveGuides({ vertical: null, horizontal: null });
      return;
    }

    // End freehand
    if (isDrawing && activeTool === 'freehand' && freehandPoints.length > 2) {
      pushUndo();
      const path = freehandPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      const xs = freehandPoints.map(p => p.x);
      const ys = freehandPoints.map(p => p.y);
      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        type: 'freehand',
        pageIndex: currentPage - 1,
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
        pathData: path,
        color: freehandColor,
        strokeWidth: freehandWidth,
      };
      setAnnotations(prev => [...prev, newAnnotation]);
      setFreehandPoints([]);
      setIsDrawing(false);
      return;
    }

    if (!isDrawing || !currentRect) {
      setIsDrawing(false);
      setFreehandPoints([]);
      return;
    }

    setIsDrawing(false);

    if (currentRect.w > 5 && currentRect.h > 5) {
      pushUndo();
      if (activeTool === 'link') {
        setPendingLinkRect(currentRect);
        setShowLinkModal(true);
      } else if (activeTool === 'table') {
        const newAnnotation: Annotation = {
          id: Date.now().toString(),
          type: 'table',
          pageIndex: currentPage - 1,
          x: currentRect.x,
          y: currentRect.y,
          width: currentRect.w,
          height: currentRect.h,
          rows: 3,
          cols: 3,
          tableData: [['', '', ''], ['', '', ''], ['', '', '']]
        };
        setAnnotations(prev => [...prev, newAnnotation]);
        setSelectedId(newAnnotation.id);
      } else if (activeTool === 'underline') {
        // Underline: thin rect at bottom edge of drawn area
        const newAnnotation: Annotation = {
          id: Date.now().toString(),
          type: 'underline',
          pageIndex: currentPage - 1,
          x: currentRect.x,
          y: currentRect.y + currentRect.h - 2,
          width: currentRect.w,
          height: 3,
          color: textColor,
        };
        setAnnotations(prev => [...prev, newAnnotation]);
        setSelectedId(newAnnotation.id);
      } else if (activeTool === 'strikethrough') {
        // Strikethrough: thin rect at middle of drawn area
        const newAnnotation: Annotation = {
          id: Date.now().toString(),
          type: 'strikethrough',
          pageIndex: currentPage - 1,
          x: currentRect.x,
          y: currentRect.y + currentRect.h / 2 - 1,
          width: currentRect.w,
          height: 2,
          color: textColor,
        };
        setAnnotations(prev => [...prev, newAnnotation]);
        setSelectedId(newAnnotation.id);
      } else {
        const newAnnotation: Annotation = {
          id: Date.now().toString(),
          type: activeTool,
          pageIndex: currentPage - 1,
          x: currentRect.x,
          y: currentRect.y,
          width: currentRect.w,
          height: currentRect.h
        };
        setAnnotations(prev => [...prev, newAnnotation]);
        setSelectedId(newAnnotation.id);
      }
    }
    setCurrentRect(null);
    setActiveTool(null);
  };

  const saveSignature = () => {
    if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
      pushUndo();
      const dataUrl = sigCanvasRef.current.getTrimmedCanvas().toDataURL('image/png');
      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        type: 'signature',
        pageIndex: currentPage - 1,
        x: startPos.x,
        y: startPos.y,
        width: 200,
        height: 60,
        signatureDataUrl: dataUrl
      };
      setAnnotations(prev => [...prev, newAnnotation]);
      setShowSignatureModal(false);
      setActiveTool(null);
    }
  };

  const saveLink = () => {
    if (pendingLinkRect && linkUrl) {
      pushUndo();
      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        type: 'link',
        pageIndex: currentPage - 1,
        x: pendingLinkRect.x,
        y: pendingLinkRect.y,
        width: pendingLinkRect.w,
        height: pendingLinkRect.h,
        url: linkUrl
      };
      setAnnotations(prev => [...prev, newAnnotation]);
    }
    setShowLinkModal(false);
    setPendingLinkRect(null);
    setLinkUrl('');
    setActiveTool(null);
  };

  const updateAnnotation = (id: string, updates: Partial<Annotation>) => {
    setAnnotations(prev => {
      const target = prev.find(a => a.id === id);
      if (!target) return prev;
      const updatedTarget = { ...target, ...updates };

      return prev.map(a => {
        if (a.id === id) return updatedTarget;
        if (target.type === 'text' && target.linkedId && a.id === target.linkedId && a.type === 'whiteout') {
          const linkedW = updatedTarget.width || target.width || a.width || 0;
          const linkedH = updatedTarget.height || target.height || a.height || 0;
          const pad = getWhiteoutPad(linkedH);
          return {
            ...a,
            x: updatedTarget.x - pad,
            y: updatedTarget.y - pad,
            width: linkedW + pad * 2,
            height: linkedH + pad * 2,
          };
        }
        return a;
      });
    });
  };

  const updateAnnotationText = (id: string, text: string) => {
    setAnnotations(prev => {
      const target = prev.find(a => a.id === id);
      if (!target || target.type !== 'text') return prev;

      // ── Keep original font size: NEVER auto-resize while user is typing.
      // User can manually change size via the toolbar. This prevents the
      // "text gets big/small as I type" problem.
      const preservedFont = target.fontSize || 14;

      // Width: for single-line text, auto-expand if new text exceeds previous box width
      const scale = pageViewport?.scale || 1;
      const isSingleLine = !text.includes('\n') && !(target.text || '').includes('\n');
      const estimatedW = Math.round(text.length * (preservedFont * scale * 0.62));
      const contentW = isSingleLine
        ? Math.max(target.width || 0, target.sourceWidth || 0, estimatedW)
        : (target.width || target.sourceWidth || 120);
      
      // Calculate how many lines we roughly have by splitting by newline
      const lines = text.split('\n').length;
      
      const lineHeight = Math.round(preservedFont * scale * 1.28);
      const minH = lineHeight * lines;
      const contentH = Math.max(target.height || target.sourceHeight || lineHeight, minH);
      
      const pad = getWhiteoutPad(contentH);

      return prev.map(a => {
        if (a.id === id) {
          return { ...a, text, fontSize: preservedFont, width: contentW, height: contentH };
        }
        if (target.linkedId && a.id === target.linkedId && a.type === 'whiteout') {
          return {
            ...a,
            x: target.x - pad,
            y: target.y - pad,
            width: contentW + pad * 2,
            height: contentH + pad * 2,
          };
        }
        return a;
      });
    });
  };

  const selectedTextAnn = annotations.find((a) => a.id === selectedId && a.type === 'text');

  const updateTableData = (id: string, r: number, c: number, value: string) => {
    setAnnotations(annotations.map(a => {
      if (a.id === id && a.tableData) {
        const newData = [...a.tableData.map(row => [...row])];
        newData[r][c] = value;
        return { ...a, tableData: newData };
      }
      return a;
    }));
  };
  const deleteAnnotation = (id: string) => {
    const target = annotations.find(a => a.id === id);
    const linkedId = target?.linkedId;
    setAnnotations(annotations.filter(a => a.id !== id && a.id !== linkedId));
    if (selectedId === id) setSelectedId(null);
  };

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255
    } : { r: 0, g: 0, b: 0 };
  };

  /**
   * Map a PDF/PyMuPDF font name to a CSS font-family stack.
   * This gives a visually accurate live preview of the original font
   * while editing (exact embedding happens in the saved PDF via pdf-lib).
   */
  const pdfFontToCss = (fontName: string | undefined): string => {
    if (!fontName) return 'Helvetica, Arial, sans-serif';
    const f = fontName.toLowerCase();

    // Serif / Times family (avoid matching generic CSS 'sans-serif')
    const hasExplicitSerif =
      f.includes('times') || f.includes('timesnew') || f.includes('palatino') ||
      f.includes('garamond') || f.includes('georgia') || f.includes('bookman') ||
      f.includes('minion') || f.includes('caslon') || f.includes('didot') ||
      f.includes('bodoni') || f.includes('cambria') || f.includes('constantia') ||
      (f.includes('serif') && !f.includes('sans-serif'));
    if (hasExplicitSerif) {
      return '"Times New Roman", Times, Georgia, serif';
    }

    // Monospace / Courier family
    if (f.includes('courier') || f.includes('mono') || f.includes('consolas') ||
        f.includes('inconsolata') || f.includes('sourcecodepro') || f.includes('jetbrains') ||
        f.includes('menlo') || f.includes('lucidaconsole') || f.includes('anonymous')) {
      return '"Courier New", Courier, "Lucida Console", monospace';
    }

    // Devanagari / Hindi fonts
    if (f.includes('devanagari') || f.includes('noto') && f.includes('sans') ||
        f.includes('mangal') || f.includes('kokila') || f.includes('utsaah') ||
        f.includes('aparajita') || f.includes('shree') || f.includes('kruti')) {
      return '"Noto Sans Devanagari", "Mangal", "Kokila", serif';
    }

    // Script / handwriting
    if (f.includes('script') || f.includes('brush') || f.includes('handwriting') ||
        f.includes('cursive') || f.includes('zapfino') || f.includes('comic') ||
        f.includes('pacifico') || f.includes('sacramento')) {
      return '"Comic Sans MS", cursive';
    }

    // Display / decorative
    if (f.includes('impact') || f.includes('compres') || f.includes('condensed') ||
        f.includes('narrow')) {
      return 'Impact, "Arial Narrow", sans-serif';
    }

    // Helvetica / Arial / sans-serif (default catch-all)
    // Includes: Arial, Helvetica, Calibri, Trebuchet, Verdana, Tahoma, Gill Sans, Franklin, Futura
    return 'Helvetica, Arial, Calibri, sans-serif';
  };

  const toggleBoldForText = () => {
    if (selectedTextAnn) {
      updateAnnotation(selectedTextAnn.id, { bold: !selectedTextAnn.bold });
    } else {
      setDefaultBold((b) => !b);
    }
  };

  const toggleItalicForText = () => {
    if (selectedTextAnn) {
      updateAnnotation(selectedTextAnn.id, { italic: !selectedTextAnn.italic });
    } else {
      setDefaultItalic((i) => !i);
    }
  };

  const applyChangesAndSave = async () => {
    if (!file || !pageViewport) return;

    setIsProcessing(true);
    setSaveStatusLabel('Saving...');
    setSavedEngineNote(null);
    let usedLocalVectorFallback = false;

    try {
      // ── FAST PATH: No edits at all — download original file unchanged ──────
      if (annotations.length === 0) {
        const originalBuffer = await file.arrayBuffer();
        const blob = new Blob([originalBuffer], { type: 'application/pdf' });
        setEditedUrl(URL.createObjectURL(blob));
        return;
      }

      // 1. Separate native text replacements (from selection) vs other annotations
      const nativeEditsAll = annotations.filter(a => a.type === 'text' && a.sourceWidth && a.sourceWidth > 0);
      const otherAnnotations = annotations.filter(a => !(a.type === 'text' && a.sourceWidth && a.sourceWidth > 0));

      let currentFileBuffer = await file.arrayBuffer();

      // 2. If there are native text edits, send to Python backend first (with Render cold-start wakeup retry)
      if (nativeEditsAll.length > 0) {
        const editPayload = nativeEditsAll.map(ann => ({
          page: ann.pageIndex,
          origX: (ann.sourceX !== undefined ? ann.sourceX : ann.x) / pageViewport.scale,
          origY: (ann.sourceY !== undefined ? ann.sourceY : ann.y) / pageViewport.scale,
          origW: (ann.sourceWidth || ann.width || 100) / pageViewport.scale,
          origH: (ann.sourceHeight || ann.height || 20) / pageViewport.scale,
          x: ann.x / pageViewport.scale,
          y: ann.y / pageViewport.scale,
          w: (ann.width || ann.sourceWidth || 100) / pageViewport.scale,
          h: (ann.height || ann.sourceHeight || 20) / pageViewport.scale,
          newText: ann.text || '',
          fontSize: ann.fontSize || 12,
          color: ann.color || '#000000',
          bgColor: isPaperWhiteHex(ann.backgroundColor) ? '#ffffff' : ann.backgroundColor,
          bold: ann.bold || false,
          italic: ann.italic || false,
          underline: ann.underline || false,
          strikethrough: ann.strikethrough || false,
          fontFamily: ann.fontCssFamily || ann.originalFontName || '',
          fontName: ann.originalFontName || '',
          align: ann.align || 'left',
          baseline: ann.baseline,
        }));

        const editsJson = JSON.stringify(editPayload);
        const postEditToBackend = async () => {
          const fd = new FormData();
          fd.append('file', new File([currentFileBuffer], file.name, { type: file.type }));
          fd.append('edits', editsJson);
          return apiFetch('/edit-pdf', {
            method: 'POST',
            body: fd,
            timeoutMs: 65000,
          });
        };

        let backendSucceeded = false;
        try {
          setSaveStatusLabel('Applying edits...');
          let res = await postEditToBackend();

          // Render free-tier cold start can return 502/503/504 while Python server boots
          if (!res.ok && (res.status === 502 || res.status === 503 || res.status === 504)) {
            setSaveStatusLabel('Waking server...');
            try {
              const wakeRes = await apiFetch('/', { method: 'GET', timeoutMs: 45000, suppressTelemetry: true });
              if (wakeRes.ok) {
                setBackendStatus('ready');
                setSaveStatusLabel('Retrying server...');
                res = await postEditToBackend();
              }
            } catch {
              // Fall through to pure-vector frontend engine
            }
          }

          if (res.ok) {
            currentFileBuffer = await res.arrayBuffer();
            setBackendStatus('ready');
            backendSucceeded = true;
          } else {
            console.warn('Native Python backend edit failed, using local vector HarfBuzz engine:', await res.text().catch(() => res.status));
          }
        } catch (fetchErr: any) {
          const msg = String(fetchErr?.message || '').toLowerCase();
          // If Render timed out mid-boot, try one fast wakeup + retry before falling back locally
          if (msg.includes('timed out') || msg.includes('waking')) {
            setSaveStatusLabel('Waking server...');
            try {
              const wakeRes = await apiFetch('/', { method: 'GET', timeoutMs: 35000, suppressTelemetry: true });
              if (wakeRes.ok) {
                setBackendStatus('ready');
                setSaveStatusLabel('Retrying server...');
                const retryRes = await postEditToBackend();
                if (retryRes.ok) {
                  currentFileBuffer = await retryRes.arrayBuffer();
                  backendSucceeded = true;
                }
              }
            } catch {
              // Proceed to local vector fallback below
            }
          }
          if (!backendSucceeded) {
            console.warn('Native Python backend offline/asleep, using in-browser vector HarfBuzz fallback:', fetchErr);
          }
        }

        if (!backendSucceeded) {
          usedLocalVectorFallback = true;
          otherAnnotations.push(...nativeEditsAll);
        }
      }

      // Skip pdf-lib rewrite if backend already applied everything and there are no client-only annotations
      if (otherAnnotations.length === 0) {
        const blob = new Blob([currentFileBuffer], { type: 'application/pdf' });
        setEditedUrl(URL.createObjectURL(blob));
        return;
      }

      setSaveStatusLabel(usedLocalVectorFallback ? 'Vectorizing Hindi & fonts...' : 'Finalizing PDF...');

      // 3. Apply remaining annotations (or full local vector fallback) using pdf-lib + HarfBuzz WASM
      const pdf = await PDFDocument.load(currentFileBuffer);

      let browserFontsLoaded = false;
      const loadBrowserFontsOnce = async () => {
        if (browserFontsLoaded) return;
        browserFontsLoaded = true;
        const fontsToLoad: Array<[string, string, object]> = [
          ['NotoSansDevanagari', '/fonts/NotoSansDevanagari-Regular.ttf', { weight: '400' }],
          ['NotoSansDevanagari', '/fonts/NotoSansDevanagari-Bold.ttf',    { weight: '700' }],
        ];
        for (const [name, url, desc] of fontsToLoad) {
          try {
            const face = new FontFace(name, `url(${url})`, desc as FontFaceDescriptors);
            const loaded = await face.load();
            document.fonts.add(loaded);
          } catch (e) {
            console.warn(`[PDF Editor] Failed to load ${name} from ${url}:`, e);
          }
        }
        try { await document.fonts.ready; } catch { /* ignore */ }
      };

      /** Convert a data: URL to ArrayBuffer without fetch() (avoids CSP block on data: scheme) */
      const dataUrlToArrayBuffer = (dataUrl: string): ArrayBuffer => {
        const base64 = dataUrl.split(',')[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
      };

      const renderTextViaCanvas = async (
        text: string,
        pdfFontSize: number,
        colorHex: string,
        bold?: boolean,
        italic?: boolean,
      ) => {
        await loadBrowserFontsOnce();
        const RENDER_SCALE = 4;
        const canvasFontPx = Math.max(8, pdfFontSize * RENDER_SCALE);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;

        const weight = bold ? 'bold' : '400';
        const fontStyle = italic ? 'italic' : 'normal';
        const fontStr = `${fontStyle} ${weight} ${canvasFontPx}px NotoSansDevanagari, 'Noto Sans Devanagari', 'Mangal', Arial Unicode MS, sans-serif`;

        ctx.font = fontStr;
        const metrics = ctx.measureText(text);
        const actualLeft   = Math.max(0, metrics.actualBoundingBoxLeft   || 0);
        const actualRight  = Math.max(1, metrics.actualBoundingBoxRight  || metrics.width);
        const actualAscent = Math.max(1, metrics.actualBoundingBoxAscent || canvasFontPx * 0.85);
        const actualDescent= Math.max(0, metrics.actualBoundingBoxDescent|| canvasFontPx * 0.25);

        const pad = Math.ceil(canvasFontPx * 0.1) + 2;
        const textW = Math.ceil(actualLeft + actualRight);
        const textH = Math.ceil(actualAscent + actualDescent);

        canvas.width  = Math.max(4, textW + pad * 2);
        canvas.height = Math.max(4, textH + pad * 2);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = fontStr;
        ctx.fillStyle = colorHex || '#000000';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(text, pad + actualLeft, pad + actualAscent);

        const dataUrl = canvas.toDataURL('image/png');
        const imgBytes = dataUrlToArrayBuffer(dataUrl);

        const imgPdfW = canvas.width / RENDER_SCALE;
        const imgPdfH = canvas.height / RENDER_SCALE;
        const baselineFromTop = (pad + actualAscent) / RENDER_SCALE;

        canvas.width = 0; canvas.height = 0;
        return { imgBytes, imgPdfW, imgPdfH, baselineFromTop };
      };

      const pages = pdf.getPages();
      const normalizedPages = new Set<number>();

      for (const ann of otherAnnotations) {
        const page = pages[ann.pageIndex];
        if (!page) continue;

        if (!normalizedPages.has(ann.pageIndex)) {
          normalizedPages.add(ann.pageIndex);
          try {
            page.node.normalize();
          } catch {
            /* ignore if leaf lacks normalize */
          }
        }

        const { height: pageHeight } = page.getSize();
        const cb = page.getCropBox();
        const originX = cb.x || 0;
        const originYTop = (cb.y || 0) + (cb.height || pageHeight);

        const scale = pageViewport.scale;
        const pdfX = originX + ann.x / scale;
        const pdfY = originYTop - ann.y / scale;
        const pdfW = (ann.width || 0) / scale;
        const pdfH = (ann.height || 0) / scale;

        if (ann.type === 'text' && ann.text) {
          const textFontSizePt = ann.fontSize || 12;
          const boxPxH = ann.height || Math.max(20, textFontSizePt * scale * 1.25);
          const sourcePxX = ann.sourceX !== undefined ? ann.sourceX : ann.x;
          const sourcePxY = ann.sourceY !== undefined ? ann.sourceY : ann.y;
          const clearPdfX = originX + sourcePxX / scale;
          const clearPdfY = originYTop - sourcePxY / scale;
          const clearPdfW = (ann.sourceWidth || ann.width || 0) / scale;
          const clearPdfH = (ann.sourceHeight || ann.height || boxPxH) / scale;

          // Clean background blend patch for source text erasure (preserves tinted card/page color)
          if (ann.backgroundColor && (ann.sourceWidth || 0) > 0) {
            const { r: bgR, g: bgG, b: bgB } = hexToRgb(ann.backgroundColor);
            const lum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;
            const chroma = Math.max(bgR, bgG, bgB) - Math.min(bgR, bgG, bgB);
            const isPaperWhite = (lum >= 0.94) || (chroma <= 0.085 && lum >= 0.78);
            const fillColor = isPaperWhite ? rgb(1, 1, 1) : rgb(bgR, bgG, bgB);
            page.drawRectangle({
              x: clearPdfX - 0.5,
              y: clearPdfY - clearPdfH - 0.8,
              width: clearPdfW + 1.0,
              height: clearPdfH + 1.4,
              color: fillColor,
            });
          }

          const dyPt = (ann.y - sourcePxY) / scale;
          const actualBaselinePdfY = ann.baseline
            ? originYTop - (ann.baseline + dyPt)
            : pdfY - textFontSizePt * 0.94;

          const colorRgb = hexToRgb(ann.color || '#000000');
          const boxWidthPt = pdfW > 0 ? pdfW : clearPdfW;

          if (checkNonLatinChars(ann.text)) {
            // Pure Native PDF Vector HarfBuzz Path (Hindi / Devanagari / mixed Unicode)
            // Keeps razor-sharp print vectors at any zoom & preserves Bold / Italic / Alignment!
            const vecRes = await drawVectorHarfbuzzText({
              page,
              text: ann.text,
              xPdf: pdfX,
              baselinePdfY: actualBaselinePdfY,
              boxWidthPt,
              fontSizePt: textFontSizePt,
              colorRgb,
              bold: ann.bold,
              italic: ann.italic,
              align: ann.align || 'left',
              lineHeightFactor: 1.25,
              underline: ann.underline,
              strikethrough: ann.strikethrough,
            });

            if (!vecRes.drawn) {
              // Last-resort raster fallback only if WASM/font is unavailable or emoji .notdef
              const lines = ann.text.split(/\r?\n/);
              const lineHeightPt = textFontSizePt * 1.25;
              for (let li = 0; li < lines.length; li++) {
                const lineTxt = lines[li];
                if (!lineTxt) continue;
                const { imgBytes, imgPdfW, imgPdfH, baselineFromTop } =
                  await renderTextViaCanvas(lineTxt, textFontSizePt, ann.color || '#000000', ann.bold, ann.italic);
                const pdfImage = await pdf.embedPng(imgBytes);
                const lineBaseY = actualBaselinePdfY - li * lineHeightPt;
                const imgTopY = lineBaseY + baselineFromTop;
                let lineX = pdfX;
                if (ann.align === 'center' && boxWidthPt > imgPdfW) {
                  lineX = pdfX + (boxWidthPt - imgPdfW) / 2;
                } else if (ann.align === 'right' && boxWidthPt > imgPdfW) {
                  lineX = pdfX + (boxWidthPt - imgPdfW);
                }
                page.drawImage(pdfImage, {
                  x: lineX,
                  y: imgTopY - imgPdfH,
                  width: imgPdfW,
                  height: imgPdfH,
                });
              }
            }
          } else {
            // Matched Standard PDF font family (TimesRoman / Courier / Helvetica) + Bold/Italic + Alignment
            await drawMatchedLatinText({
              pdfDoc: pdf,
              page,
              text: ann.text,
              xPdf: pdfX,
              baselinePdfY: actualBaselinePdfY,
              boxWidthPt,
              fontSizePt: textFontSizePt,
              colorRgb,
              fontHint: ann.originalFontName || ann.fontCssFamily,
              bold: ann.bold,
              italic: ann.italic,
              align: ann.align || 'left',
              lineHeightFactor: 1.25,
              underline: ann.underline,
              strikethrough: ann.strikethrough,
            });
          }
        } else if (ann.type === 'table' && ann.tableData && ann.rows && ann.cols) {
          const cellW = pdfW / ann.cols;
          const cellH = pdfH / ann.rows;
          const cellFontPt = Math.max(6, Math.round((10 / scale) * 10) / 10);

          for (let ri = 0; ri < ann.rows; ri++) {
            for (let ci = 0; ci < ann.cols; ci++) {
              const cell = ann.tableData[ri]?.[ci] || '';
              const cx = pdfX + (ci * cellW);
              const cy = pdfY - ((ri + 1) * cellH);

              page.drawRectangle({
                x: cx,
                y: cy,
                width: cellW,
                height: cellH,
                borderWidth: 1 / scale,
                borderColor: rgb(0.8, 0.8, 0.8),
                color: rgb(1, 1, 1),
              });

              if (cell) {
                if (checkNonLatinChars(cell)) {
                  const vecCell = await drawVectorHarfbuzzText({
                    page,
                    text: cell,
                    xPdf: cx + 2 / scale,
                    baselinePdfY: cy + cellH * 0.32,
                    boxWidthPt: Math.max(0, cellW - 4 / scale),
                    fontSizePt: cellFontPt,
                    colorRgb: { r: 0, g: 0, b: 0 },
                  });
                  if (!vecCell.drawn) {
                    const { imgBytes, imgPdfW, imgPdfH } =
                      await renderTextViaCanvas(cell, cellFontPt, '#000000');
                    const cellImg = await pdf.embedPng(imgBytes);
                    page.drawImage(cellImg, {
                      x: cx + (2 / scale),
                      y: cy + (cellH - imgPdfH) / 2,
                      width: imgPdfW,
                      height: imgPdfH,
                    });
                  }
                } else {
                  await drawMatchedLatinText({
                    pdfDoc: pdf,
                    page,
                    text: cell,
                    xPdf: cx + (2 / scale),
                    baselinePdfY: cy + (cellH / 4),
                    boxWidthPt: Math.max(0, cellW - 4 / scale),
                    fontSizePt: cellFontPt,
                    colorRgb: { r: 0, g: 0, b: 0 },
                    fontHint: 'helvetica',
                  });
                }
              }
            }
          }
        } else if (ann.type === 'whiteout') {
          const { r, g, b } = hexToRgb(ann.color || '#ffffff');
          const padding = 2 / scale;
          page.drawRectangle({
            x: pdfX - padding,
            y: pdfY - pdfH - padding,
            width: pdfW + (padding * 2),
            height: pdfH + (padding * 2),
            color: rgb(r, g, b),
          });
        } else if (ann.type === 'highlight') {
          page.drawRectangle({
            x: pdfX,
            y: pdfY - pdfH,
            width: pdfW,
            height: pdfH,
            color: rgb(1, 1, 0),
            opacity: 0.4,
          });
        } else if (ann.type === 'underline') {
          const { r, g, b } = hexToRgb(ann.color || '#000000');
          page.drawRectangle({
            x: pdfX,
            y: pdfY - pdfH,
            width: pdfW,
            height: Math.max(0.5, pdfH),
            color: rgb(r, g, b),
          });
        } else if (ann.type === 'strikethrough') {
          const { r, g, b } = hexToRgb(ann.color || '#000000');
          page.drawRectangle({
            x: pdfX,
            y: pdfY - pdfH,
            width: pdfW,
            height: Math.max(0.5, pdfH),
            color: rgb(r, g, b),
          });
        } else if (ann.type === 'signature' && ann.signatureDataUrl) {
          const imgBytes = dataUrlToArrayBuffer(ann.signatureDataUrl);
          const pdfImage = await pdf.embedPng(imgBytes);
          page.drawImage(pdfImage, {
            x: pdfX,
            y: pdfY - pdfH,
            width: pdfW,
            height: pdfH,
          });
        } else if (ann.type === 'image' && ann.imageDataUrl) {
          const imgBytes = dataUrlToArrayBuffer(ann.imageDataUrl);
          let pdfImage;
          if (ann.imageDataUrl.includes('image/png')) {
            pdfImage = await pdf.embedPng(imgBytes);
          } else {
            pdfImage = await pdf.embedJpg(imgBytes);
          }
          page.drawImage(pdfImage, {
            x: pdfX,
            y: pdfY - pdfH,
            width: pdfW,
            height: pdfH,
          });
        } else if (ann.type === 'freehand' && ann.pathData) {
          const { r, g, b } = hexToRgb(ann.color || '#000000');
          const parts = ann.pathData.split(/\s+/);
          let prevX = 0, prevY = 0;
          for (const part of parts) {
            const cmd = part[0];
            const coords = part.slice(1).split(',').map(Number);
            const px = originX + coords[0] / scale;
            const py = originYTop - (coords[1] / scale);
            if (cmd === 'L' && prevX !== 0) {
              page.drawLine({
                start: { x: prevX, y: prevY },
                end: { x: px, y: py },
                thickness: (ann.strokeWidth || 2) / scale,
                color: rgb(r, g, b),
              });
            }
            prevX = px;
            prevY = py;
          }
        } else if (ann.type === 'link' && ann.url) {
          const linkAnnotation = pdf.context.obj({
            Type: 'Annot',
            Subtype: 'Link',
            Rect: [pdfX, pdfY - pdfH, pdfX + pdfW, pdfY],
            Border: [0, 0, 0],
            A: {
              Type: 'Action',
              S: 'URI',
              URI: pdf.context.obj(ann.url),
            },
          });

          let annots = page.node.Annots();
          if (!annots) {
            annots = pdf.context.obj([]);
            page.node.set(pdf.context.obj('Annots'), annots);
          }
          // @ts-ignore
          annots.push(linkAnnotation);
        }
      }

      if (usedLocalVectorFallback) {
        setSavedEngineNote('Processed cleanly in browser with Vector HarfBuzz Hindi & Font Matching (backend was asleep/offline).');
      }

      const pdfBytes = await pdf.save();
      const blob = new Blob([toArrayBufferBytes(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setEditedUrl(url);
    } catch (error) {
      console.error("Error saving PDF:", error);
      alert("An error occurred while saving the PDF.");
    } finally {
      setIsProcessing(false);
      setSaveStatusLabel('Saving...');
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // TEXT GROUPING HELPERS (for Word / Line / Paragraph selection modes)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * WORD MODE: Split a single pdfjs text-block (which may be a full phrase)
   * into individual word sub-blocks, using canvas measureText to calculate
   * each word's proportional x position and width.
   */
  const splitBlockIntoWords = (block: DetectedTextBlock): DetectedTextBlock[] => {
    const words = block.text.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length <= 1) return [block]; // already a single word

    // Measure relative widths with canvas
    const mc = document.createElement('canvas');
    const mctx = mc.getContext('2d');
    if (!mctx) return [block]; // fallback: return whole block

    const screenPx = Math.max(8, Math.round(block.fontSize * (pageViewport?.scale || 1)));
    const fontStr = `${block.italic ? 'italic ' : ''}${block.bold ? '700 ' : ''}${screenPx}px Helvetica, Arial, sans-serif`;
    mctx.font = fontStr;

    const wordMeasures = words.map(w => mctx.measureText(w).width);
    const spaceW = mctx.measureText(' ').width;
    const totalMeasured =
      wordMeasures.reduce((a, b) => a + b, 0) +
      spaceW * (words.length - 1);

    // Scale factor: map measured pixels → actual screen pixels
    const scale = totalMeasured > 0 ? block.w / totalMeasured : 1;

    const result: DetectedTextBlock[] = [];
    let cx = block.x;
    for (let i = 0; i < words.length; i++) {
      const ww = Math.max(4, Math.round(wordMeasures[i] * scale));
      result.push({
        ...block,
        text: words[i],
        x: Math.round(cx),
        w: ww,
      });
      cx += ww + spaceW * scale;
    }
    return result;
  };

  /**
   * LINE MODE: Merge adjacent pdfjs/OCR items that are on the SAME visual row
   * AND horizontally close in canvas pixels (`h * 0.85`).
   * Keeps table columns separate while grouping words into full lines at any zoom.
   */
  const mergeBlocksToLines = (blocks: DetectedTextBlock[]): DetectedTextBlock[] => {
    if (!blocks.length) return [];
    const sorted = [...blocks].sort((a, b) => {
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) > Math.max(a.h, b.h) * 0.45) return yDiff;
      return a.x - b.x;
    });
    const result: DetectedTextBlock[] = [];
    let group: DetectedTextBlock = { ...sorted[0] };
    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      const sameRow = Math.abs(next.y - group.y) < Math.max(group.h, next.h) * 0.45;
      const hGap = next.x - (group.x + group.w);
      // Use canvas-pixel word spacing relative to box height so 75%/150%/OCR scales work consistently
      const closeEnough = hGap >= -Math.max(2, group.h * 0.12) && hGap < Math.max(8, group.h * 0.85);
      if (sameRow && closeEnough) {
        const rightEdge = Math.max(group.x + group.w, next.x + next.w);
        const topEdge = Math.min(group.y, next.y);
        const bottomEdge = Math.max(group.y + group.h, next.y + next.h);
        group = {
          ...group,
          text: group.text + (hGap > 1 ? ' ' : '') + next.text,
          y: topEdge,
          w: rightEdge - group.x,
          h: bottomEdge - topEdge,
          fontSize: Math.max(group.fontSize, next.fontSize),
          baselineY: group.baselineY ?? next.baselineY,
          pdfBaselineY: group.pdfBaselineY ?? next.pdfBaselineY,
          bold: group.bold || next.bold,
          italic: group.italic || next.italic,
          fgColor: group.fgColor || next.fgColor,
          bgColor: group.bgColor || next.bgColor,
        };
      } else {
        result.push(group);
        group = { ...next };
      }
    }
    result.push(group);
    return result;
  };

  /**
   * PARAGRAPH MODE: Merge vertically adjacent line-groups into paragraph blocks.
   * Lines must share similar left-margin (< 15px) and have small vertical gap
   * (< 0.8× line height) to be considered part of the same paragraph.
   */
  const mergeLinesToParagraphs = (lines: DetectedTextBlock[]): DetectedTextBlock[] => {
    if (!lines.length) return [];
    const sorted = [...lines].sort((a, b) => a.y - b.y);
    const result: DetectedTextBlock[] = [];
    let para: DetectedTextBlock = { ...sorted[0] };
    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      const vertGap = next.y - (para.y + para.h);
      const lineH = Math.max(para.h, next.h);
      // Strict left-alignment: left edges within 15px
      const alignedLeft = Math.abs(next.x - para.x) < 15;
      // Gap must be small — less than 0.8 line heights (not a paragraph break)
      const sameParagraph = vertGap >= 0 && vertGap < lineH * 0.8 && alignedLeft;
      if (sameParagraph) {
        const newBottom = next.y + next.h;
        const newRight = Math.max(para.x + para.w, next.x + next.w);
        para = {
          ...para,
          text: para.text + ' ' + next.text,
          w: newRight - para.x,
          h: newBottom - para.y,
          fontSize: Math.max(para.fontSize, next.fontSize),
          bold: para.bold || next.bold,
          italic: para.italic || next.italic,
        };
      } else {
        result.push(para);
        para = { ...next };
      }
    }
    result.push(para);
    return result;
  };

  const toolButton = (tool: Tool, icon: React.ReactNode, label: string, title?: string) => {
    const isActive = activeTool === tool;
    return (
      <motion.button
        type="button"
        whileTap={prefersReduced ? undefined : { scale: 0.96 }}
        onClick={() => setActiveTool(isActive ? null : tool)}
        className={`relative px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer ${
          isActive
            ? 'text-[var(--pms-rose)] font-semibold'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/70'
        }`}
        title={title || label}
      >
        {isActive && (
          <motion.span
            layoutId="editor-active-tool-pill"
            transition={{ type: 'spring', stiffness: 460, damping: 32 }}
            className="absolute inset-0 rounded-xl bg-[var(--pms-soft-rose)] border border-rose-200/80 dark:border-rose-800/60 shadow-2xs"
          />
        )}
        <span className="relative z-10 flex items-center gap-1.5">
          {icon}
          <span className="hidden sm:inline text-xs font-semibold">{label}</span>
        </span>
      </motion.button>
    );
  };

  // Helper: commit inline edit as annotation
  const commitInlineEdit = useCallback(() => {
    if (!inlineEdit.active || !inlineEdit.block) return;
    const block = inlineEdit.block;
    const newText = inlineEdit.text.trim();
    if (newText && newText !== block.text.trim()) {
      pushUndo();
      const match = findBackendMatch(block);
      const scale = pageViewport?.scale || 1;
      const realFontSize = match ? match.fontSize : (block.fontSize || Math.max(6, Math.round((block.h / scale) * 0.72)));
      const fs = Math.max(4, Math.min(realFontSize, 200));
      const bw = Math.min(Math.max(block.w, 12), Math.max(800, Math.round(pageViewport?.width || 800)));
      const bh = Math.max(block.h, 10);
      const baselinePt = match?.baseline || block.pdfBaselineY || ((block.y + block.h * 0.78) / scale);
      const id = Date.now().toString() + '_ie';
      const bg = isPaperWhiteHex(block.bgColor) ? '#ffffff' : block.bgColor;
      clearTextFootprintOnCanvas(block.x, block.y, bw, bh, block.bgColor);
      const textAnn: Annotation = {
        id,
        type: 'text',
        pageIndex: currentPage - 1,
        x: block.x,
        y: block.y,
        width: bw,
        height: bh,
        sourceX: block.x,
        sourceY: block.y,
        sourceWidth: bw,
        sourceHeight: bh,
        text: newText,
        fontSize: fs,
        color: match?.color || block.fgColor || '#000000',
        backgroundColor: bg,
        bold: match?.bold ?? block.bold ?? false,
        italic: match?.italic ?? block.italic ?? false,
        lockPosition: false,
        baseline: Math.round(baselinePt * 100) / 100,
        originalFontName: match?.fontName || block.fontName,
        fontCssFamily: pdfFontToCss(match?.fontName || block.fontName),
      };
      setAnnotations(prev => [...prev, textAnn]);
      setSelectedId(textAnn.id);
    }
    setInlineEdit({ active: false, block: null, text: '' });
  }, [inlineEdit, currentPage, pushUndo, findBackendMatch, pageViewport]);

  // Helper: pages that have annotations (for multi-page indicators)
  const pagesWithEdits = new Set(annotations.map(a => a.pageIndex + 1));

  // Keep annotation pixel coordinates synced if user zooms in/out mid-edit
  const handleZoomChange = (nextZoomRaw: number) => {
    const nextZoom = Math.max(0.5, Math.min(3, Math.round(nextZoomRaw * 100) / 100));
    if (nextZoom === zoomLevel) return;
    const ratio = nextZoom / zoomLevel;
    setAnnotations(prev =>
      prev.map(ann => {
        const scaled: Annotation = {
          ...ann,
          x: ann.x * ratio,
          y: ann.y * ratio,
          width: ann.width !== undefined ? ann.width * ratio : undefined,
          height: ann.height !== undefined ? ann.height * ratio : undefined,
          sourceX: ann.sourceX !== undefined ? ann.sourceX * ratio : undefined,
          sourceY: ann.sourceY !== undefined ? ann.sourceY * ratio : undefined,
          sourceWidth: ann.sourceWidth !== undefined ? ann.sourceWidth * ratio : undefined,
          sourceHeight: ann.sourceHeight !== undefined ? ann.sourceHeight * ratio : undefined,
          strokeWidth: ann.strokeWidth !== undefined ? ann.strokeWidth * ratio : undefined,
        };
        if (ann.pathData) {
          scaled.pathData = ann.pathData.replace(/([ML])([\d.-]+),([\d.-]+)/g, (_m, cmd, px, py) => {
            return `${cmd}${(parseFloat(px) * ratio).toFixed(1)},${(parseFloat(py) * ratio).toFixed(1)}`;
          });
        }
        return scaled;
      })
    );
    setZoomLevel(nextZoom);
  };

  return (
    <div
      className="relative flex-1 flex flex-col min-h-0 transition-colors"
      style={{ backgroundColor: 'var(--pms-pearl)', color: 'var(--pms-ink)' }}
    >
      {file && <PearlAuroraBackground mode="workspace" />}

      <div className="relative z-10 flex-1 flex flex-col min-h-0">
      {!file ? (
        <ToolWorkspaceShell
          title="Advanced PDF Editor"
          subtitle="Edit existing vector/scanned text inline with automatic font & background matching, plus annotations, whiteout, signatures & links."
          categoryLabel="Document Atelier · Vector & OCR Editor"
          icon={SquarePen}
          microVariant="edit"
          tone="rose"
        >
          <div className="w-full max-w-3xl mx-auto">
            <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
          </div>
        </ToolWorkspaceShell>
      ) : !editedUrl ? (
        <motion.div
          key="editor-workspace"
          initial={prefersReduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="flex-1 flex flex-col h-full min-h-0"
        >
          {/* Pearl Frosted Editor Toolbar */}
          <div className="pms-glass-header sticky top-0 z-20 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2 border-b border-[var(--pms-border)] transition-colors">
            <div className="flex items-center gap-1 flex-wrap">
              {toolButton('select', <MousePointer2 className="w-5 h-5" />, 'Select', 'Select & Edit Existing Text (click on text, double-click to edit inline)')}
              {/* Granularity toggle — only visible when Select is active */}
              <AnimatePresence initial={false}>
                {activeTool === 'select' && (
                  <motion.div
                    initial={prefersReduced ? false : { opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={prefersReduced ? undefined : { opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.16 }}
                    className="flex items-center gap-0.5 ml-1 rounded-xl p-0.5 border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 backdrop-blur-sm shadow-xs"
                  >
                    {(['word', 'line', 'paragraph'] as const).map(g => {
                      const activeG = selectionGranularity === g;
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setSelectionGranularity(g)}
                          title={g === 'word' ? 'Select individual word/phrase' : g === 'line' ? 'Select full line' : 'Select paragraph'}
                          className={`relative px-2 py-1 rounded-lg text-xs font-bold transition-colors ${
                            activeG
                              ? 'text-white'
                              : 'text-[var(--pms-muted)] hover:text-[var(--pms-ink)]'
                          }`}
                        >
                          {activeG && (
                            <motion.span
                              layoutId="editor-granularity-pill"
                              transition={{ type: 'spring', stiffness: 460, damping: 32 }}
                              className="absolute inset-0 rounded-lg shadow-xs"
                              style={{ background: 'linear-gradient(135deg, var(--pms-rose), var(--pms-violet))' }}
                            />
                          )}
                          <span className="relative z-10">{g === 'word' ? 'W' : g === 'line' ? 'L' : 'P'}</span>
                        </button>
                      );
                    })}
                    <span className="text-[10px] font-semibold px-1.5 capitalize text-[var(--pms-muted)] hidden sm:inline">
                      {selectionGranularity}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
              {/* Persistent Auto-Select ON/OFF Switch */}
              <motion.button
                type="button"
                whileTap={prefersReduced ? undefined : { scale: 0.96 }}
                onClick={() => {
                  setContinuousSelect(prev => {
                    const next = !prev;
                    if (next) setActiveTool('select');
                    return next;
                  });
                }}
                title={continuousSelect ? "⚡ Auto-Select is ON: Hover & click any text to edit continuously without re-clicking Select. Click to turn OFF." : "Auto-Select is OFF: Click to turn ON."}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ml-1 border ${
                  continuousSelect
                    ? 'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/35 shadow-xs hover:bg-emerald-500/20'
                    : 'bg-white/75 dark:bg-slate-800/75 text-[var(--pms-muted)] border-[var(--pms-border)] hover:text-[var(--pms-ink)]'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${continuousSelect ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                <span>Auto-Select: {continuousSelect ? 'ON' : 'OFF'}</span>
              </motion.button>
              <div className="w-px h-6 mx-1" style={{ backgroundColor: 'var(--pms-border)' }}></div>
              {toolButton('text', <Type className="w-5 h-5" />, 'Text', 'Add New Text')}
              <motion.button
                type="button"
                whileTap={prefersReduced ? undefined : { scale: 0.94 }}
                onClick={toggleBoldForText}
                className={`p-2 rounded-xl flex items-center gap-1 transition-all border ${(selectedTextAnn ? !!selectedTextAnn.bold : defaultBold)
                    ? 'bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] border-rose-500/25 shadow-xs font-semibold'
                    : 'border-transparent text-[var(--pms-muted)] hover:text-[var(--pms-ink)] hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                title="Bold"
              >
                <Bold className="w-5 h-5" />
              </motion.button>
              <motion.button
                type="button"
                whileTap={prefersReduced ? undefined : { scale: 0.94 }}
                onClick={toggleItalicForText}
                className={`p-2 rounded-xl flex items-center gap-1 transition-all border ${(selectedTextAnn ? !!selectedTextAnn.italic : defaultItalic)
                    ? 'bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] border-rose-500/25 shadow-xs font-semibold'
                    : 'border-transparent text-[var(--pms-muted)] hover:text-[var(--pms-ink)] hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                title="Italic"
              >
                <Italic className="w-5 h-5" />
              </motion.button>
              {/* NEW: Underline tool */}
              {toolButton('underline', <Underline className="w-5 h-5" />, 'Underline', 'Draw underline over text (drag to mark)')}
              {/* NEW: Strikethrough tool */}
              {toolButton('strikethrough', <Strikethrough className="w-5 h-5" />, 'Strike', 'Draw strikethrough over text (drag to mark)')}
              {toolButton('table', <Table className="w-5 h-5" />, 'Table', 'Add Table')}
              {toolButton('highlight', <Highlighter className="w-5 h-5" />, 'Highlight')}
              {/* Draw tool with color picker */}
              <div className="flex items-center gap-0.5">
                <motion.button
                  type="button"
                  whileTap={prefersReduced ? undefined : { scale: 0.94 }}
                  onClick={() => setActiveTool(activeTool === 'freehand' ? null : 'freehand')}
                  className={`p-2 rounded-xl flex items-center gap-1.5 transition-all border ${activeTool === 'freehand' ? 'bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] border-rose-500/25 shadow-xs font-semibold' : 'border-transparent text-[var(--pms-muted)] hover:text-[var(--pms-ink)] hover:bg-black/5 dark:hover:bg-white/5'}`}
                  title="Freehand Draw"
                >
                  <Pencil className="w-5 h-5" />
                  <span className="text-xs font-medium hidden md:inline">Draw</span>
                </motion.button>
                <div className="relative" title="Draw Color">
                  <input
                    type="color"
                    value={freehandColor}
                    onChange={e => setFreehandColor(e.target.value)}
                    className="w-6 h-6 rounded-md cursor-pointer border-0 p-0 bg-transparent"
                    style={{ appearance: 'none', WebkitAppearance: 'none' }}
                  />
                  <div className="absolute inset-0 rounded-md pointer-events-none border border-[var(--pms-border)] shadow-xs" style={{ background: freehandColor, opacity: 0.92 }} />
                </div>
              </div>
              {/* Sign tool with color picker */}
              <div className="flex items-center gap-0.5">
                <motion.button
                  type="button"
                  whileTap={prefersReduced ? undefined : { scale: 0.94 }}
                  onClick={() => { setActiveTool('signature'); setStartPos({ x: 200, y: 300 }); setShowSignatureModal(true); }}
                  className={`p-2 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all border ${activeTool === 'signature' ? 'bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] border-rose-500/25 shadow-xs font-semibold' : 'border-transparent text-[var(--pms-muted)] hover:text-[var(--pms-ink)] hover:bg-black/5 dark:hover:bg-white/5'}`}
                  title="Sign"
                >
                  <PenTool className="w-5 h-5" />
                  <span className="text-xs font-medium hidden md:inline">Sign</span>
                </motion.button>
                <div className="relative" title="Signature Color">
                  <input
                    type="color"
                    value={signatureColor}
                    onChange={e => setSignatureColor(e.target.value)}
                    className="w-6 h-6 rounded-md cursor-pointer border-0 p-0 bg-transparent"
                    style={{ appearance: 'none', WebkitAppearance: 'none' }}
                  />
                  <div className="absolute inset-0 rounded-md pointer-events-none border border-[var(--pms-border)] shadow-xs" style={{ background: signatureColor, opacity: 0.92 }} />
                </div>
              </div>
              {/* Eraser tool */}
              <motion.button
                type="button"
                whileTap={prefersReduced ? undefined : { scale: 0.94 }}
                onClick={() => setActiveTool(activeTool === 'eraser' ? null : 'eraser')}
                className={`p-2 rounded-xl flex items-center gap-1.5 transition-all border ${activeTool === 'eraser' ? 'bg-red-500/12 dark:bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/25 shadow-xs font-semibold' : 'border-transparent text-[var(--pms-muted)] hover:text-[var(--pms-ink)] hover:bg-black/5 dark:hover:bg-white/5'}`}
                title="Eraser — erase annotations"
              >
                <Eraser className="w-5 h-5" />
                <span className="text-xs font-medium hidden md:inline">Eraser</span>
              </motion.button>
              {toolButton('link', <LinkIcon className="w-5 h-5" />, 'Link')}
              {/* Insert Image */}
              <label
                className="p-2 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all text-[var(--pms-muted)] hover:text-[var(--pms-ink)] hover:bg-black/5 dark:hover:bg-white/5"
                title="Insert Image"
              >
                <ImagePlus className="w-5 h-5" />
                <span className="text-xs font-medium hidden md:inline">Image</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const dataUrl = reader.result as string;
                    const tempImg = new Image();
                    tempImg.onload = () => {
                      pushUndo();
                      const maxW = 200;
                      const scale = Math.min(maxW / tempImg.naturalWidth, 1);
                      const newAnnotation: Annotation = {
                        id: Date.now().toString(),
                        type: 'image',
                        pageIndex: currentPage - 1,
                        x: 50,
                        y: 50,
                        width: tempImg.naturalWidth * scale,
                        height: tempImg.naturalHeight * scale,
                        imageDataUrl: dataUrl,
                      };
                      setAnnotations(prev => [...prev, newAnnotation]);
                      setSelectedId(newAnnotation.id);
                    };
                    tempImg.src = dataUrl;
                  };
                  reader.readAsDataURL(f);
                }} />
              </label>
              <div className="w-px h-6 mx-1" style={{ backgroundColor: 'var(--pms-border)' }}></div>
              {/* Undo / Redo */}
              <div className="flex items-center gap-0.5 shrink-0">
              <motion.button
                type="button"
                whileTap={prefersReduced ? undefined : { scale: 0.92 }}
                onClick={doUndo}
                disabled={undoStack.length === 0}
                className="p-2 rounded-xl text-[var(--pms-muted)] hover:text-[var(--pms-ink)] hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 transition-colors"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-5 h-5" />
              </motion.button>
              <motion.button
                type="button"
                whileTap={prefersReduced ? undefined : { scale: 0.92 }}
                onClick={doRedo}
                disabled={redoStack.length === 0}
                className="p-2 rounded-xl text-[var(--pms-muted)] hover:text-[var(--pms-ink)] hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 transition-colors"
                title="Redo (Ctrl+Shift+Z)"
              >
                <Redo className="w-5 h-5" />
              </motion.button>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Zoom */}
              <div className="flex items-center gap-1 rounded-xl p-1 border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => handleZoomChange(zoomLevel - 0.25)}
                  className="p-1 rounded-lg hover:bg-white dark:hover:bg-slate-800 text-[var(--pms-ink)] transition-colors"
                  title="Zoom out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs font-semibold px-2 min-w-[3rem] text-center tabular-nums text-[var(--pms-ink)]">{Math.round(zoomLevel * 100)}%</span>
                <button
                  type="button"
                  onClick={() => handleZoomChange(zoomLevel + 0.25)}
                  className="p-1 rounded-lg hover:bg-white dark:hover:bg-slate-800 text-[var(--pms-ink)] transition-colors"
                  title="Zoom in"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
              {/* Page nav with multi-page edit indicators */}
              <div className="flex items-center gap-1.5 rounded-xl p-1 border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded-lg hover:bg-white dark:hover:bg-slate-800 disabled:opacity-40 text-[var(--pms-ink)] transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold px-1 tabular-nums text-[var(--pms-ink)]">{currentPage} / {numPages}</span>
                  {pagesWithEdits.size > 0 && (
                    <span
                      className="text-[10px] text-white rounded-full px-1.5 py-0.5 font-bold shadow-xs"
                      style={{ background: 'linear-gradient(135deg, var(--pms-rose), var(--pms-violet))' }}
                      title={`Edited pages: ${[...pagesWithEdits].sort((a, b) => a - b).join(', ')}`}
                    >
                      {pagesWithEdits.size} edited
                    </span>
                  )}
                  {layoutFetching && (
                    <span title="Loading font data..."><Loader2 className="w-3 h-3 animate-spin text-[var(--pms-rose)]" /></span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}
                  disabled={currentPage === numPages}
                  className="p-1 rounded-lg hover:bg-white dark:hover:bg-slate-800 disabled:opacity-40 text-[var(--pms-ink)] transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              {/* OCR button + language selector for scanned PDFs (always accessible before & after scanning) */}
              {(isScannedPdf || ocrDone) && (
                <div className="flex items-center gap-1.5">
                  <select
                    value={ocrLanguage}
                    onChange={e => setOcrLanguage(e.target.value as 'eng' | 'hin' | 'eng+hin')}
                    disabled={ocrBusy}
                    className="px-2.5 py-2 bg-amber-50/90 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/60 text-amber-900 dark:text-amber-200 rounded-xl text-xs font-semibold disabled:opacity-50"
                    title="OCR Language"
                  >
                    <option value="eng+hin">Hindi + English</option>
                    <option value="hin">Hindi OCR</option>
                    <option value="eng">English OCR</option>
                  </select>
                  <motion.button
                    type="button"
                    whileTap={prefersReduced ? undefined : { scale: 0.96 }}
                    onClick={runOcrOnPage}
                    disabled={ocrBusy}
                    className={`px-3 py-2 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center gap-2 transition-colors ${
                      ocrDone
                        ? 'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-500/25 border border-emerald-400/40'
                        : 'bg-amber-500/15 dark:bg-amber-500/20 text-amber-800 dark:text-amber-200 hover:bg-amber-500/25 border border-amber-400/40'
                    }`}
                    title={ocrDone ? 'Re-run OCR scan on this page' : 'Scanned PDF detected. Run OCR to detect editable words & lines.'}
                  >
                    {ocrBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanText className="w-4 h-4" />}
                    {ocrBusy ? (ocrStatusLabel || 'OCR running…') : ocrDone ? 'Re-Scan Text' : 'Scan Text'}
                  </motion.button>
                </div>
              )}
              <motion.button
                type="button"
                whileHover={prefersReduced || isProcessing ? undefined : { y: -1, scale: 1.01 }}
                whileTap={prefersReduced || isProcessing ? undefined : { scale: 0.97 }}
                onClick={applyChangesAndSave}
                disabled={isProcessing}
                className="pms-btn-primary relative overflow-hidden px-5 py-2 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center gap-2"
              >
                {!isProcessing && <span className="pms-shimmer pointer-events-none" />}
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span className="relative z-10">{isProcessing ? saveStatusLabel : 'Apply Changes'}</span>
              </motion.button>
            </div>
          </div>

          {/* Scanned PDF notice / OCR status */}
          <AnimatePresence>
            {(isScannedPdf || ocrNotice) && (
              <motion.div
                initial={prefersReduced ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReduced ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className={`border-b backdrop-blur-md px-4 py-2 text-sm flex items-center justify-between gap-2 ${
                  ocrNotice
                    ? 'bg-red-50/90 dark:bg-red-950/60 border-red-200 dark:border-red-800/50 text-red-800 dark:text-red-200'
                    : ocrDone
                    ? 'bg-emerald-50/90 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-200'
                    : 'bg-amber-50/90 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <ScanText className="w-4 h-4 shrink-0" />
                  {ocrNotice ? (
                    <span>{ocrNotice}</span>
                  ) : ocrDone ? (
                    <span>
                      OCR active on Page {currentPage}: <strong>{detectedText.length} clickable word boxes</strong> ready. Hover &amp; click any word, or switch <strong>W / L / P</strong> mode in toolbar.
                    </span>
                  ) : (
                    <span>
                      Scanned/image-based PDF detected on Page {currentPage}.
                      <strong> Choose language</strong> (Hindi + English default) and click <strong>"Scan Text"</strong> to make words clickable for editing.
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Editor Layout: Canvas + Sidebar */}
          <div className="relative flex-1 flex overflow-hidden">
            <PearlScanOverlay active={isProcessing} label={saveStatusLabel || 'Saving edited PDF...'} />
            <div
              className="relative flex-1 overflow-auto p-6 sm:p-8 flex justify-center items-start bg-slate-900/[0.025] dark:bg-slate-950/35"
              onClick={() => setSelectedId(null)}
            >
              {!pageViewport && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-20">
                  <div className="flex items-center gap-2.5 px-5 py-3 rounded-2xl pms-glass-panel text-sm font-semibold text-[var(--pms-ink)] shadow-lg">
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--pms-rose)]" />
                    <span>Rendering PDF page…</span>
                  </div>
                </div>
              )}
              <div
                className="relative bg-white ring-1 ring-black/5 dark:ring-white/10 shrink-0"
                style={{ width: pageViewport?.width, height: pageViewport?.height, boxShadow: 'var(--pms-shadow-float)' }}
                onClick={(e) => e.stopPropagation()}
              >
                <canvas ref={canvasRef} className="absolute top-0 left-0" />

                {/* Interactive Overlay */}
                <div
                  ref={overlayRef}
                  className={`absolute top-0 left-0 w-full h-full z-10 ${
                    activeTool === 'select' ? 'cursor-default' :
                    activeTool === 'eraser' ? 'cursor-none' :
                    activeTool === 'freehand' ? 'cursor-crosshair' :
                    activeTool ? 'cursor-crosshair' :
                    isDragging ? 'cursor-grabbing' : ''
                  }`}
                  onMouseDown={handleOverlayMouseDown}
                  onMouseMove={(e) => {
                    handleOverlayMouseMove(e);
                    if (resizeAnnRef.current) {
                      const r = resizeAnnRef.current;
                      const dx = e.clientX - r.startX;
                      const dy = e.clientY - r.startY;
                      let newW = r.startW, newH = r.startH;
                      let newX = r.startAnnX, newY = r.startAnnY;
                      const h = r.handle;
                      if (h === 'br') { newW = r.startW + dx; newH = r.startH + dy; }
                      else if (h === 'bl') { newW = r.startW - dx; newH = r.startH + dy; newX = r.startAnnX + dx; }
                      else if (h === 'tr') { newW = r.startW + dx; newH = r.startH - dy; newY = r.startAnnY + dy; }
                      else if (h === 'tl') { newW = r.startW - dx; newH = r.startH - dy; newX = r.startAnnX + dx; newY = r.startAnnY + dy; }
                      else if (h === 'r') { newW = r.startW + dx; }
                      else if (h === 'l') { newW = r.startW - dx; newX = r.startAnnX + dx; }
                      else if (h === 'b') { newH = r.startH + dy; }
                      else if (h === 't') { newH = r.startH - dy; newY = r.startAnnY + dy; }
                      newW = Math.max(10, newW);
                      newH = Math.max(8, newH);
                      updateAnnotation(r.id, { width: newW, height: newH, x: newX, y: newY });
                    }
                  }}
                  onMouseUp={() => {
                    handleOverlayMouseUp();
                    setFreehandPoints([]);
                    if (resizeAnnRef.current) resizeAnnRef.current = null;
                  }}
                  onMouseLeave={() => {
                    setEraserPos(null);
                    // Only finalize eraser on leave; DON'T cancel rect drawings
                    if (isErasingRef.current) {
                      isErasingRef.current = false;
                      lastErasedRef.current = new Set();
                    }
                    if (resizeAnnRef.current) resizeAnnRef.current = null;
                    if (isDragging) { setIsDragging(false); setDragTarget(null); }
                  }}
                >
                  {/* Render Annotations for current page */}
                  {annotations.filter(a => a.pageIndex === currentPage - 1).map(ann => (
                    <div
                      key={ann.id}
                      onClick={(e) => { if (activeTool === 'eraser') return; e.stopPropagation(); setSelectedId(ann.id); }}
                      onMouseDown={(e) => {
                        if (activeTool === 'eraser') {
                          e.stopPropagation();
                          if (!isErasingRef.current) { isErasingRef.current = true; pushUndo(); }
                          deleteAnnotation(ann.id);
                          return;
                        }
                        if (!activeTool || activeTool === 'select') {
                          if (!ann.lockPosition) {
                            e.stopPropagation();
                            setSelectedId(ann.id);
                            setIsDragging(true);
                            setDragTarget(ann.id);
                            const rect = overlayRef.current?.getBoundingClientRect();
                            if (rect) {
                              setDragOffset({ x: e.clientX - rect.left - ann.x, y: e.clientY - rect.top - ann.y });
                            }
                          }
                        }
                      }}
                      className={`absolute group ${activeTool === 'eraser' ? 'cursor-none' : ''
                        } ${selectedId === ann.id && activeTool !== 'eraser' ? 'border border-blue-600 shadow-xs' : ''} ${!activeTool && ann.type !== 'freehand' ? 'cursor-move' : activeTool !== 'eraser' ? 'cursor-pointer' : ''}`}
                      style={{
                        left: ann.x,
                        top: ann.y,
                        width: ann.width !== undefined ? ann.width : (ann.type === 'text' ? Math.max(16, Math.round((ann.text?.length || 4) * (ann.fontSize || 12) * (pageViewport?.scale || 1) * 0.62)) : undefined),
                        height: ann.height !== undefined ? ann.height : Math.max(12, ann.type === 'text' ? Math.round((ann.fontSize || 12) * (pageViewport?.scale || 1) * 1.2) : 0),
                        backgroundColor: ann.type === 'text' ? 'transparent' : ann.type === 'whiteout' ? (ann.color || '#ffffff') : ann.type === 'highlight' ? 'rgba(255, 255, 0, 0.4)' : ann.type === 'link' ? 'rgba(0, 0, 255, 0.2)' : 'transparent',
                        border: selectedId === ann.id ? '1px solid #2563eb' : (ann.type === 'link' ? '1px dashed blue' : ann.type === 'table' ? '1px solid #ccc' : 'none'),
                        boxSizing: 'border-box',
                      }}
                    >
                      {ann.type === 'text' && (
                        <textarea
                          value={ann.text}
                          onChange={(e) => updateAnnotationText(ann.id, e.target.value)}
                          className="bg-transparent border-none outline-none w-full h-full m-0 p-0 box-border resize-none"
                          style={{
                            fontSize: `${(ann.fontSize || 12) * (pageViewport?.scale || 1)}px`,
                            color: ann.color || '#000000',
                            fontWeight: ann.bold ? 700 : 400,
                            fontStyle: ann.italic ? 'italic' : 'normal',
                            textDecoration: [ann.underline && 'underline', ann.strikethrough && 'line-through'].filter(Boolean).join(' ') || 'none',
                            textAlign: ann.align || 'left',
                            lineHeight: 1.25,
                            whiteSpace: 'pre-wrap',
                            // Use detected CSS font family for live WYSIWYG preview
                            fontFamily: ann.fontCssFamily || pdfFontToCss(ann.originalFontName),
                            padding: 0,
                            margin: 0,
                            overflow: 'visible'
                          }}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            // Only Escape cancels now. Enter inserts newline.
                            if (e.key === 'Escape') {
                              setSelectedId(null);
                            }
                          }}
                        />
                      )}
                      {ann.type === 'table' && ann.tableData && (
                        <div
                          className="w-full h-full grid bg-white"
                          style={{
                            gridTemplateRows: `repeat(${ann.rows}, 1fr)`,
                            gridTemplateColumns: `repeat(${ann.cols}, 1fr)`
                          }}
                        >
                          {ann.tableData.map((row, ri) => (
                            row.map((cell, ci) => (
                              <input
                                key={`${ri}-${ci}`}
                                value={cell}
                                onChange={(e) => updateTableData(ann.id, ri, ci, e.target.value)}
                                className="border border-gray-300 text-[10px] p-0.5 outline-none focus:bg-indigo-50"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ))
                          ))}
                        </div>
                      )}
                      {ann.type === 'signature' && ann.signatureDataUrl && (
                        <img src={ann.signatureDataUrl} alt="Signature" className="w-full h-full object-contain pointer-events-none" />
                      )}
                      {ann.type === 'image' && ann.imageDataUrl && (
                        <img src={ann.imageDataUrl} alt="Inserted" className="w-full h-full object-fill pointer-events-none" />
                      )}
                      {/* Sleek 8-Point Bounding Box Handles for Text (LightPDF exact style) */}
                      {ann.type === 'text' && selectedId === ann.id && (
                        <>
                          {/* 4 Corners */}
                          <div className="absolute -top-1 -left-1 w-2 h-2 bg-white border border-blue-600 rounded-none cursor-nwse-resize z-20 pointer-events-auto shadow-xs"
                            title="Resize diagonally"
                            onMouseDown={e => { e.stopPropagation(); resizeAnnRef.current = { id: ann.id, handle: 'tl', startX: e.clientX, startY: e.clientY, startAnnX: ann.x, startAnnY: ann.y, startW: ann.width || 80, startH: ann.height || 20 }; }} />
                          <div className="absolute -top-1 -right-1 w-2 h-2 bg-white border border-blue-600 rounded-none cursor-nesw-resize z-20 pointer-events-auto shadow-xs"
                            title="Resize diagonally"
                            onMouseDown={e => { e.stopPropagation(); resizeAnnRef.current = { id: ann.id, handle: 'tr', startX: e.clientX, startY: e.clientY, startAnnX: ann.x, startAnnY: ann.y, startW: ann.width || 80, startH: ann.height || 20 }; }} />
                          <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-white border border-blue-600 rounded-none cursor-nesw-resize z-20 pointer-events-auto shadow-xs"
                            title="Resize diagonally"
                            onMouseDown={e => { e.stopPropagation(); resizeAnnRef.current = { id: ann.id, handle: 'bl', startX: e.clientX, startY: e.clientY, startAnnX: ann.x, startAnnY: ann.y, startW: ann.width || 80, startH: ann.height || 20 }; }} />
                          <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-white border border-blue-600 rounded-none cursor-nwse-resize z-20 pointer-events-auto shadow-xs"
                            title="Resize diagonally"
                            onMouseDown={e => { e.stopPropagation(); resizeAnnRef.current = { id: ann.id, handle: 'br', startX: e.clientX, startY: e.clientY, startAnnX: ann.x, startAnnY: ann.y, startW: ann.width || 80, startH: ann.height || 20 }; }} />

                          {/* 4 Edge Centers: Top, Bottom, Left, Right */}
                          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white border border-blue-600 rounded-none cursor-ns-resize z-20 pointer-events-auto shadow-xs"
                            title="Resize height vertically"
                            onMouseDown={e => { e.stopPropagation(); resizeAnnRef.current = { id: ann.id, handle: 't', startX: e.clientX, startY: e.clientY, startAnnX: ann.x, startAnnY: ann.y, startW: ann.width || 80, startH: ann.height || 20 }; }} />
                          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white border border-blue-600 rounded-none cursor-ns-resize z-20 pointer-events-auto shadow-xs"
                            title="Resize height vertically"
                            onMouseDown={e => { e.stopPropagation(); resizeAnnRef.current = { id: ann.id, handle: 'b', startX: e.clientX, startY: e.clientY, startAnnX: ann.x, startAnnY: ann.y, startW: ann.width || 80, startH: ann.height || 20 }; }} />
                          <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-white border border-blue-600 rounded-none cursor-ew-resize z-20 pointer-events-auto shadow-xs"
                            title="Resize width horizontally"
                            onMouseDown={e => { e.stopPropagation(); resizeAnnRef.current = { id: ann.id, handle: 'l', startX: e.clientX, startY: e.clientY, startAnnX: ann.x, startAnnY: ann.y, startW: ann.width || 80, startH: ann.height || 20 }; }} />
                          <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-2 bg-white border border-blue-600 rounded-none cursor-ew-resize z-20 pointer-events-auto shadow-xs"
                            title="Resize width horizontally"
                            onMouseDown={e => { e.stopPropagation(); resizeAnnRef.current = { id: ann.id, handle: 'r', startX: e.clientX, startY: e.clientY, startAnnX: ann.x, startAnnY: ann.y, startW: ann.width || 80, startH: ann.height || 20 }; }} />
                        </>
                      )}
                      {/* Resize handles for image & signature */}
                      {(ann.type === 'image' || ann.type === 'signature') && selectedId === ann.id && (
                        <>
                          <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-blue-600 border border-white rounded-sm cursor-nwse-resize z-20"
                            onMouseDown={e => { e.stopPropagation(); resizeAnnRef.current = { id: ann.id, handle: 'tl', startX: e.clientX, startY: e.clientY, startAnnX: ann.x, startAnnY: ann.y, startW: ann.width || 150, startH: ann.height || 50 }; }} />
                          <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-blue-600 border border-white rounded-sm cursor-nesw-resize z-20"
                            onMouseDown={e => { e.stopPropagation(); resizeAnnRef.current = { id: ann.id, handle: 'tr', startX: e.clientX, startY: e.clientY, startAnnX: ann.x, startAnnY: ann.y, startW: ann.width || 150, startH: ann.height || 50 }; }} />
                          <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-blue-600 border border-white rounded-sm cursor-nesw-resize z-20"
                            onMouseDown={e => { e.stopPropagation(); resizeAnnRef.current = { id: ann.id, handle: 'bl', startX: e.clientX, startY: e.clientY, startAnnX: ann.x, startAnnY: ann.y, startW: ann.width || 150, startH: ann.height || 50 }; }} />
                          <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-blue-600 border border-white rounded-sm cursor-nwse-resize z-20"
                            onMouseDown={e => { e.stopPropagation(); resizeAnnRef.current = { id: ann.id, handle: 'br', startX: e.clientX, startY: e.clientY, startAnnX: ann.x, startAnnY: ann.y, startW: ann.width || 150, startH: ann.height || 50 }; }} />
                          {/* Edge handles */}
                          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-6 h-2 bg-blue-500 border border-white rounded-sm cursor-ns-resize z-20"
                            onMouseDown={e => { e.stopPropagation(); resizeAnnRef.current = { id: ann.id, handle: 't', startX: e.clientX, startY: e.clientY, startAnnX: ann.x, startAnnY: ann.y, startW: ann.width || 150, startH: ann.height || 50 }; }} />
                          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-2 bg-blue-500 border border-white rounded-sm cursor-ns-resize z-20"
                            onMouseDown={e => { e.stopPropagation(); resizeAnnRef.current = { id: ann.id, handle: 'b', startX: e.clientX, startY: e.clientY, startAnnX: ann.x, startAnnY: ann.y, startW: ann.width || 150, startH: ann.height || 50 }; }} />
                          <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-6 bg-blue-500 border border-white rounded-sm cursor-ew-resize z-20"
                            onMouseDown={e => { e.stopPropagation(); resizeAnnRef.current = { id: ann.id, handle: 'l', startX: e.clientX, startY: e.clientY, startAnnX: ann.x, startAnnY: ann.y, startW: ann.width || 150, startH: ann.height || 50 }; }} />
                          <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-6 bg-blue-500 border border-white rounded-sm cursor-ew-resize z-20"
                            onMouseDown={e => { e.stopPropagation(); resizeAnnRef.current = { id: ann.id, handle: 'r', startX: e.clientX, startY: e.clientY, startAnnX: ann.x, startAnnY: ann.y, startW: ann.width || 150, startH: ann.height || 50 }; }} />
                        </>
                      )}
                      {ann.type === 'freehand' && ann.pathData && (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" style={{ left: -ann.x, top: -ann.y, width: pageViewport?.width, height: pageViewport?.height }}>
                          <path d={ann.pathData} fill="none" stroke={ann.color || '#000'} strokeWidth={ann.strokeWidth || 2} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                      {ann.type === 'link' && (
                        <div className="w-full h-full flex items-center justify-center text-blue-800 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                          LINK
                        </div>
                      )}

                      {/* Delete indicator for non-text items (images, stamps, etc.) */}
                      {ann.type !== 'text' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); pushUndo(); deleteAnnotation(ann.id); }}
                          className="absolute -top-2.5 -right-2.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-sm"
                          title="Delete"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}

                  {/* ── SELECT MODE: Smart Word / Line / Paragraph Overlays ── */}
                  {activeTool === 'select' && (() => {
                    // Compute grouped blocks based on granularity
                    const baseGroups: DetectedTextBlock[] =
                      selectionGranularity === 'word'
                        ? detectedText.flatMap(b => splitBlockIntoWords(b))
                        : selectionGranularity === 'line'
                        ? mergeBlocksToLines(detectedText)
                        : mergeLinesToParagraphs(mergeBlocksToLines(detectedText));

                    return baseGroups.map((block, idx) => {
                      const replaced = annotations.some(a =>
                        a.pageIndex === currentPage - 1 &&
                        a.type === 'text' &&
                        Math.abs(a.x - block.x) < 8 &&
                        Math.abs(a.y - block.y) < 8
                      );
                      if (replaced || !block.text.trim() || block.w < 2) return null;

                      const badge = selectionGranularity === 'word' ? 'W' : selectionGranularity === 'line' ? 'L' : 'P';

                      return (
                        <div
                          key={`selblock-${selectionGranularity}-${idx}`}
                          title={`[${badge}] ${block.text} — Double-click to edit inline | Right-click for more options`}
                          style={{
                            position: 'absolute',
                            left: block.x,
                            top: block.y,
                            width: Math.max(block.w, 8),
                            height: Math.max(block.h, 8),
                            border: '1px solid transparent',
                            backgroundColor: 'transparent',
                            cursor: 'text',
                            zIndex: 15,
                            boxSizing: 'border-box',
                            borderRadius: 1,
                            pointerEvents: 'all',
                            transition: 'border-color 0.1s ease, background-color 0.1s ease',
                          }}
                          onMouseEnter={e => {
                            const el = e.currentTarget as HTMLElement;
                            el.style.border = '1px solid #2563eb';
                            el.style.backgroundColor = 'rgba(37, 99, 235, 0.08)';
                          }}
                          onMouseLeave={e => {
                            const el = e.currentTarget as HTMLElement;
                            el.style.border = '1px solid transparent';
                            el.style.backgroundColor = 'transparent';
                          }}
                          onMouseDown={e => {
                            // Single click: create text annotation with exact matched font & scale
                            if (e.detail === 1) {
                              e.stopPropagation();
                              pushUndo();
                              const match = findBackendMatch(block);
                              const id = Date.now().toString() + '_tb';
                              const scale = pageViewport?.scale || 1;
                              const realFontSize = match ? match.fontSize : (block.fontSize || Math.max(6, Math.round((block.h / scale) * 0.72)));
                              const fs = Math.max(4, Math.min(realFontSize, 200));
                              const bw = Math.max(block.w, 12);
                              const bh = Math.max(block.h, 10);
                              const baselinePt = match?.baseline || block.pdfBaselineY || ((block.y + block.h * 0.78) / scale);
                              const bg = isPaperWhiteHex(block.bgColor) ? '#ffffff' : block.bgColor;
                              clearTextFootprintOnCanvas(block.x, block.y, bw, bh, block.bgColor);
                              const textAnn: Annotation = {
                                id,
                                type: 'text',
                                pageIndex: currentPage - 1,
                                x: block.x,
                                y: block.y,
                                width: bw,
                                height: bh,
                                sourceX: block.x,
                                sourceY: block.y,
                                sourceWidth: bw,
                                sourceHeight: bh,
                                text: block.text,
                                fontSize: fs,
                                color: match?.color || block.fgColor || '#000000',
                                backgroundColor: bg,
                                bold: match?.bold ?? block.bold ?? false,
                                italic: match?.italic ?? block.italic ?? false,
                                lockPosition: false,
                                baseline: Math.round(baselinePt * 100) / 100,
                                originalFontName: match?.fontName || block.fontName,
                                fontCssFamily: pdfFontToCss(match?.fontName || block.fontName),
                              };
                              setAnnotations(prev => [...prev, textAnn]);
                              setSelectedId(textAnn.id);
                              if (!continuousSelect) {
                                setActiveTool(null);
                              }
                            }
                          }}
                          onDoubleClick={e => {
                            // Double-click: open inline editor at exact position
                            e.stopPropagation();
                            e.preventDefault();
                            setInlineEdit({ active: true, block, text: block.text });
                            setTimeout(() => inlineEditRef.current?.focus(), 30);
                          }}
                          onContextMenu={e => {
                            // Right-click: show context menu
                            e.preventDefault();
                            e.stopPropagation();
                            setContextMenu({ visible: true, x: e.clientX, y: e.clientY, block });
                          }}
                        />
                      );
                    });
                  })()}

                  {/* Live freehand path */}
                  {isDrawing && activeTool === 'freehand' && freehandPoints.length > 1 && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ width: pageViewport?.width, height: pageViewport?.height }}>
                      <path
                        d={freehandPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
                        fill="none"
                        stroke={freehandColor}
                        strokeWidth={freehandWidth}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}

                  {/* Eraser cursor ring */}
                  {activeTool === 'eraser' && eraserPos && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ width: pageViewport?.width, height: pageViewport?.height }}>
                      <circle
                        cx={eraserPos.x}
                        cy={eraserPos.y}
                        r={eraserSize / 2}
                        fill="rgba(239,68,68,0.08)"
                        stroke="rgba(239,68,68,0.7)"
                        strokeWidth="1.5"
                        strokeDasharray="4 2"
                      />
                    </svg>
                  )}

                  {/* Current Drawing Rect */}
                  {isDrawing && currentRect && (
                    <div
                      className="absolute border border-indigo-500 bg-indigo-500/20"
                      style={{
                        left: currentRect.x,
                        top: currentRect.y,
                        width: currentRect.w,
                        height: currentRect.h
                      }}
                    />
                  )}

                  {/* ── SMART MAGNETIC ALIGNMENT GUIDES (Blue Snap Lines - Shown ONLY while dragging/moving) ── */}
                  {isDragging && (activeGuides.vertical !== null || activeGuides.horizontal !== null) && (
                    <svg
                      className="absolute inset-0 pointer-events-none overflow-visible"
                      style={{
                        width: pageViewport?.width || '100%',
                        height: pageViewport?.height || '100%',
                        zIndex: 25,
                      }}
                    >
                      {activeGuides.vertical !== null && (
                        <g>
                          <line
                            x1={activeGuides.vertical}
                            y1={0}
                            x2={activeGuides.vertical}
                            y2={pageViewport?.height || 2000}
                            stroke="#2563eb"
                            strokeWidth="1.2"
                            strokeDasharray="4 3"
                          />
                          <circle cx={activeGuides.vertical} cy={4} r={2.5} fill="#2563eb" />
                          <circle cx={activeGuides.vertical} cy={(pageViewport?.height || 1000) - 4} r={2.5} fill="#2563eb" />
                        </g>
                      )}
                      {activeGuides.horizontal !== null && (
                        <g>
                          <line
                            x1={0}
                            y1={activeGuides.horizontal}
                            x2={pageViewport?.width || 2000}
                            y2={activeGuides.horizontal}
                            stroke="#2563eb"
                            strokeWidth="1.2"
                            strokeDasharray="4 3"
                          />
                          <circle cx={4} cy={activeGuides.horizontal} r={2.5} fill="#2563eb" />
                          <circle cx={(pageViewport?.width || 1000) - 4} cy={activeGuides.horizontal} r={2.5} fill="#2563eb" />
                        </g>
                      )}
                    </svg>
                  )}
                </div>

                  {/* ── INLINE EDIT OVERLAY (double-click) ── */}
                  {inlineEdit.active && inlineEdit.block && (() => {
                    const block = inlineEdit.block;
                    const match = findBackendMatch(block);
                    const scale = pageViewport?.scale || 1;
                    const realFontSize = match ? match.fontSize : (block.fontSize || Math.max(6, Math.round((block.h / scale) * 0.72)));
                    const fs = Math.max(4, Math.min(realFontSize, 200));
                    const fgColor = match?.color || block.fgColor || '#000000';
                    const isBold = match?.bold ?? block.bold ?? false;
                    const isItalic = match?.italic ?? block.italic ?? false;
                    const fontFam = pdfFontToCss(match?.fontName || block.fontName);
                    const bg = isPaperWhiteHex(block.bgColor) ? '#ffffff' : block.bgColor;
                    return (
                      <div
                        style={{
                          position: 'absolute',
                          left: block.x,
                          top: block.y,
                          width: Math.max(block.w, 16),
                          minHeight: Math.max(block.h, 12),
                          zIndex: 100,
                          backgroundColor: bg,
                          border: '1px solid #2563eb',
                          boxShadow: '0 1px 4px rgba(37,99,235,0.18)',
                          borderRadius: 1,
                        }}
                      >
                        <textarea
                          ref={inlineEditRef}
                          value={inlineEdit.text}
                          onChange={e => setInlineEdit(prev => ({ ...prev, text: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Escape') {
                              setInlineEdit({ active: false, block: null, text: '' });
                            } else if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              commitInlineEdit();
                            }
                            e.stopPropagation();
                          }}
                          onBlur={() => commitInlineEdit()}
                          style={{
                            width: '100%',
                            minHeight: block.h,
                            fontSize: `${fs * scale}px`,
                            color: fgColor,
                            fontWeight: isBold ? 700 : 400,
                            fontStyle: isItalic ? 'italic' : 'normal',
                            fontFamily: fontFam,
                            lineHeight: 1.15,
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            resize: 'none',
                            padding: 0,
                            margin: 0,
                            boxSizing: 'border-box',
                          }}
                        />
                        <div style={{ fontSize: 9, color: '#4338ca', padding: '2px 5px', borderTop: '1px solid #e0e7ff', background: '#eef2ff', borderRadius: '0 0 3px 3px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>↵ Enter to save · Esc cancel</span>
                          <span style={{ fontWeight: 600 }}>✨ {match?.fontName || block.fontName || 'Auto-Matched'} {fs}pt</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── UNDERLINE/STRIKETHROUGH visual in overlay ── */}
                  {annotations.filter(a => a.pageIndex === currentPage - 1 && (a.type === 'underline' || a.type === 'strikethrough')).map(ann => (
                    <div
                      key={ann.id + '_ul'}
                      style={{
                        position: 'absolute',
                        left: ann.x,
                        top: ann.y,
                        width: ann.width || 10,
                        height: Math.max(ann.height || 2, 2),
                        backgroundColor: ann.color || '#000000',
                        opacity: selectedId === ann.id ? 1 : 0.8,
                        pointerEvents: 'none',
                        zIndex: 12,
                      }}
                    />
                  ))}
              </div>
            </div>

            {/* Pearl Frosted Properties Sidebar */}
            <aside
              className="w-80 backdrop-blur-xl border-l border-[var(--pms-border)] p-5 sm:p-6 overflow-y-auto z-10 transition-colors"
              style={{ backgroundColor: 'var(--pms-glass-bg)' }}
            >
              <AnimatePresence mode="wait" initial={false}>
              {selectedId ? (
                <motion.div
                  key={`props-${selectedId}`}
                  initial={prefersReduced ? false : { opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={prefersReduced ? undefined : { opacity: 0, x: -10 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-6"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-[var(--pms-ink)]">Properties</h3>
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      className="p-1.5 rounded-lg text-[var(--pms-muted)] hover:text-[var(--pms-ink)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {annotations.find(a => a.id === selectedId)?.type === 'text' && (() => {
                    const selAnn = annotations.find(a => a.id === selectedId)!;
                    return (
                    <div className="space-y-4">
                      {/* Smart typography match card */}
                      <div className="p-3.5 bg-gradient-to-br from-rose-500/[0.08] via-violet-500/[0.08] to-sky-500/[0.08] dark:from-rose-500/15 dark:via-violet-500/15 dark:to-sky-500/15 border border-[var(--pms-border)] rounded-2xl space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--pms-rose)]">
                            <Sparkles className="w-4 h-4 text-[var(--pms-rose)]" />
                            <span>Matched Typography</span>
                          </div>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Exact Match
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] bg-white/75 dark:bg-slate-900/75 p-2.5 rounded-xl border border-[var(--pms-border)]">
                          <div>
                            <span className="text-[var(--pms-muted)] block text-[10px] font-medium">Font Family</span>
                            <span className="font-bold text-[var(--pms-ink)] truncate block" title={selAnn.originalFontName || 'System Default'}>
                              {selAnn.originalFontName || 'Auto-Detected'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[var(--pms-muted)] block text-[10px] font-medium">Size & Style</span>
                            <span className="font-bold text-[var(--pms-ink)]">
                              {selAnn.fontSize || 12} pt · {selAnn.bold ? 'Bold' : 'Regular'}{selAnn.italic ? ', Italic' : ''}
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] text-[var(--pms-muted)] leading-tight">
                          100% matched to original PDF metadata. Replaces in-place with exact typography.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[var(--pms-ink)] mb-1.5">Text Content</label>
                        <textarea
                          value={selAnn.text || ''}
                          onChange={(e) => updateAnnotationText(selectedId, e.target.value)}
                          className="w-full px-3 py-2 border border-[var(--pms-border)] bg-white/80 dark:bg-slate-900/80 text-[var(--pms-ink)] rounded-xl text-sm focus:ring-2 focus:ring-rose-500/20 focus:border-[var(--pms-rose)] outline-none transition-all"
                          rows={3}
                          placeholder="Type replacement text..."
                        />
                      </div>

                      {/* Text alignment buttons */}
                      <div>
                        <label className="block text-xs font-bold text-[var(--pms-ink)] mb-1.5">Text Alignment</label>
                        <div className="grid grid-cols-3 gap-1 bg-white/70 dark:bg-slate-900/70 border border-[var(--pms-border)] p-1 rounded-xl">
                          {[
                            { id: 'left' as const, icon: AlignLeft, label: 'Left' },
                            { id: 'center' as const, icon: AlignCenter, label: 'Center' },
                            { id: 'right' as const, icon: AlignRight, label: 'Right' },
                          ].map(({ id, icon: Icon, label }) => {
                            const activeAlign = (selAnn.align || 'left') === id;
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => updateAnnotation(selectedId, { align: id })}
                                className={`relative flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                  activeAlign
                                    ? 'text-[var(--pms-rose)] font-bold'
                                    : 'text-[var(--pms-muted)] hover:text-[var(--pms-ink)]'
                                }`}
                              >
                                {activeAlign && (
                                  <motion.span
                                    layoutId="editor-align-pill"
                                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                                    className="absolute inset-0 rounded-lg bg-[var(--pms-soft-rose)] border border-rose-500/20 shadow-xs"
                                  />
                                )}
                                <Icon className="relative z-10 w-3.5 h-3.5" />
                                <span className="relative z-10">{label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Font Size & Color */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-[var(--pms-ink)] mb-1.5">Font Size (pt)</label>
                          <input
                            type="number"
                            min="4"
                            max="200"
                            step="0.5"
                            value={selAnn.fontSize || 12}
                            onChange={(e) => {
                              const nextSize = Math.max(4, Math.min(200, parseFloat(e.target.value) || 12));
                              const curScale = pageViewport?.scale || 1;
                              const linesCount = Math.max(1, (selAnn.text || '').split('\n').length);
                              const minBoxH = Math.round(nextSize * curScale * 1.3 * linesCount);
                              updateAnnotation(selectedId, {
                                fontSize: nextSize,
                                height: Math.max(selAnn.height || 0, minBoxH),
                              });
                            }}
                            className="w-full px-3 py-2 border border-[var(--pms-border)] bg-white/80 dark:bg-slate-900/80 text-[var(--pms-ink)] rounded-xl text-sm focus:ring-2 focus:ring-rose-500/20 focus:border-[var(--pms-rose)] outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-[var(--pms-ink)] mb-1.5">Text Color</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={selAnn.color || '#000000'}
                              onChange={(e) => updateAnnotation(selectedId, { color: e.target.value })}
                              className="w-10 h-9 p-0.5 border border-[var(--pms-border)] bg-white/80 dark:bg-slate-900/80 rounded-xl cursor-pointer"
                            />
                            <span className="text-xs font-mono text-[var(--pms-muted)]">{selAnn.color || '#000000'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Background fill color for redaction blending */}
                      <div>
                        <label className="block text-xs font-bold text-[var(--pms-ink)] mb-1.5">Background Blend Color</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={(selAnn.backgroundColor === '#fbfcfc' || !selAnn.backgroundColor) ? '#ffffff' : selAnn.backgroundColor}
                            onChange={(e) => updateAnnotation(selectedId, { backgroundColor: e.target.value })}
                            className="w-10 h-9 p-0.5 border border-[var(--pms-border)] bg-white/80 dark:bg-slate-900/80 rounded-xl cursor-pointer"
                          />
                          <span className="text-xs font-mono text-[var(--pms-muted)]">{(selAnn.backgroundColor === '#fbfcfc' || !selAnn.backgroundColor) ? '#ffffff' : selAnn.backgroundColor}</span>
                          <span className="text-[10px] text-[var(--pms-muted)]">(Auto-matched)</span>
                        </div>
                      </div>

                      {/* Formatting toggles */}
                      <div className="flex gap-4 flex-wrap pt-1">
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--pms-ink)] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!selAnn.bold}
                            onChange={(e) => updateAnnotation(selectedId, { bold: e.target.checked })}
                            className="rounded border-[var(--pms-border)] accent-[var(--pms-rose)]"
                          />
                          Bold
                        </label>
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--pms-ink)] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!selAnn.italic}
                            onChange={(e) => updateAnnotation(selectedId, { italic: e.target.checked })}
                            className="rounded border-[var(--pms-border)] accent-[var(--pms-rose)]"
                          />
                          Italic
                        </label>
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--pms-ink)] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!selAnn.underline}
                            onChange={(e) => updateAnnotation(selectedId, { underline: e.target.checked })}
                            className="rounded border-[var(--pms-border)] accent-[var(--pms-rose)]"
                          />
                          Underline
                        </label>
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--pms-ink)] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!selAnn.strikethrough}
                            onChange={(e) => updateAnnotation(selectedId, { strikethrough: e.target.checked })}
                            className="rounded border-[var(--pms-border)] accent-[var(--pms-rose)]"
                          />
                          Strike
                        </label>
                      </div>
                    </div>
                    );
                  })()}

                  {annotations.find(a => a.id === selectedId)?.type === 'table' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-[var(--pms-ink)] mb-2">Rows</label>
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={annotations.find(a => a.id === selectedId)?.rows || 3}
                            onChange={(e) => {
                              const newRows = parseInt(e.target.value);
                              const currentCols = annotations.find(a => a.id === selectedId)?.cols || 3;
                              const currentData = annotations.find(a => a.id === selectedId)?.tableData || [];
                              const newData = Array.from({ length: newRows }, (_, r) =>
                                Array.from({ length: currentCols }, (_, c) =>
                                  currentData[r]?.[c] || ''
                                )
                              );
                              updateAnnotation(selectedId, { rows: newRows, tableData: newData });
                            }}
                            className="w-full px-3 py-2 border border-[var(--pms-border)] bg-white/80 dark:bg-slate-900/80 text-[var(--pms-ink)] rounded-xl text-sm outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--pms-ink)] mb-2">Cols</label>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={annotations.find(a => a.id === selectedId)?.cols || 3}
                            onChange={(e) => {
                              const newCols = parseInt(e.target.value);
                              const currentRows = annotations.find(a => a.id === selectedId)?.rows || 3;
                              const currentData = annotations.find(a => a.id === selectedId)?.tableData || [];
                              const newData = Array.from({ length: currentRows }, (_, r) =>
                                Array.from({ length: newCols }, (_, c) =>
                                  currentData[r]?.[c] || ''
                                )
                              );
                              updateAnnotation(selectedId, { cols: newCols, tableData: newData });
                            }}
                            className="w-full px-3 py-2 border border-[var(--pms-border)] bg-white/80 dark:bg-slate-900/80 text-[var(--pms-ink)] rounded-xl text-sm outline-none"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-[var(--pms-muted)] italic">Editing table content directly in the grid.</p>
                    </div>
                  )}

                  {annotations.find(a => a.id === selectedId)?.type === 'freehand' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-[var(--pms-ink)] mb-2">Stroke Color</label>
                        <input
                          type="color"
                          value={annotations.find(a => a.id === selectedId)?.color || '#000000'}
                          onChange={(e) => updateAnnotation(selectedId, { color: e.target.value })}
                          className="w-full h-10 p-1 border border-[var(--pms-border)] bg-white/80 dark:bg-slate-900/80 rounded-xl cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--pms-ink)] mb-2">Stroke Width: {annotations.find(a => a.id === selectedId)?.strokeWidth || 2}px</label>
                        <input
                          type="range"
                          min={1}
                          max={10}
                          value={annotations.find(a => a.id === selectedId)?.strokeWidth || 2}
                          onChange={(e) => updateAnnotation(selectedId, { strokeWidth: parseInt(e.target.value) })}
                          className="w-full accent-[var(--pms-rose)]"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <motion.button
                      type="button"
                      whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                      onClick={() => { pushUndo(); deleteAnnotation(selectedId); }}
                      className="w-full py-2.5 text-red-600 dark:text-red-400 border border-red-500/30 rounded-xl hover:bg-red-500/10 text-sm font-semibold transition-colors"
                    >
                      Delete Element
                    </motion.button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="guide"
                  initial={prefersReduced ? false : { opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={prefersReduced ? undefined : { opacity: 0, x: 10 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-5"
                >
                  {/* Smart Editor Guide Card */}
                  <div className="p-4 bg-gradient-to-br from-rose-500/[0.06] via-violet-500/[0.06] to-sky-500/[0.06] dark:from-rose-500/15 dark:via-violet-500/15 dark:to-sky-500/10 border border-[var(--pms-border)] rounded-2xl space-y-3 shadow-xs">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="p-2 text-white rounded-xl shadow-sm shrink-0"
                        style={{ background: 'linear-gradient(135deg, var(--pms-rose), var(--pms-violet))' }}
                      >
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-[var(--pms-ink)]">Direct PDF Text Editor</h4>
                        <p className="text-[10px] font-semibold text-[var(--pms-rose)]">Automatic Font & Style Matching</p>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs text-[var(--pms-muted)]">
                      <div className="flex items-start gap-2.5 bg-white/80 dark:bg-slate-900/75 p-2.5 rounded-xl border border-[var(--pms-border)]">
                        <span className="w-5 h-5 rounded-full bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                        <p className="text-[11px] leading-snug">Hover over any text block in the PDF to view its detected font family and size.</p>
                      </div>
                      <div className="flex items-start gap-2.5 bg-white/80 dark:bg-slate-900/75 p-2.5 rounded-xl border border-[var(--pms-border)]">
                        <span className="w-5 h-5 rounded-full bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                        <p className="text-[11px] leading-snug">Click or double-click any word or line to edit in-place without guessing font or formatting.</p>
                      </div>
                      <div className="flex items-start gap-2.5 bg-white/80 dark:bg-slate-900/75 p-2.5 rounded-xl border border-[var(--pms-border)]">
                        <span className="w-5 h-5 rounded-full bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                        <p className="text-[11px] leading-snug">The exact font style and background blend are matched from native PDF geometry.</p>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-between text-[11px] text-[var(--pms-muted)] border-t border-[var(--pms-border)]">
                      <span>Detected on Page {currentPage}:</span>
                      <span className="font-bold text-[var(--pms-rose)] tabular-nums">{detectedText.length} Text Blocks</span>
                    </div>
                  </div>
                  {/* Freehand settings when freehand tool active */}
                  {activeTool === 'freehand' && (
                    <div className="space-y-4 border-t border-[var(--pms-border)] pt-4">
                      <h3 className="text-sm font-bold text-[var(--pms-ink)]">Draw Settings</h3>
                      <div>
                        <label className="block text-sm font-medium text-[var(--pms-ink)] mb-2">Stroke Color</label>
                        <input type="color" value={freehandColor} onChange={e => setFreehandColor(e.target.value)} className="w-full h-10 p-1 border border-[var(--pms-border)] bg-white/80 dark:bg-slate-900/80 rounded-xl cursor-pointer" />
                        {/* Color presets */}
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {['#000000', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'].map(c => (
                            <button key={c} type="button" onClick={() => setFreehandColor(c)}
                              className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${freehandColor === c ? 'border-[var(--pms-rose)] scale-110 ring-2 ring-rose-300/60' : 'border-[var(--pms-border)]'}`}
                              style={{ background: c }} title={c} />
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--pms-ink)] mb-2">Stroke Width: {freehandWidth}px</label>
                        <input type="range" min={1} max={20} value={freehandWidth} onChange={e => setFreehandWidth(Number(e.target.value))} className="w-full accent-[var(--pms-rose)]" />
                      </div>
                    </div>
                  )}
                  {/* Eraser settings when eraser tool active */}
                  {activeTool === 'eraser' && (
                    <div className="space-y-4 border-t border-[var(--pms-border)] pt-4">
                      <h3 className="text-sm font-bold text-[var(--pms-ink)]">Eraser Settings</h3>
                      <div>
                        <label className="block text-sm font-medium text-[var(--pms-ink)] mb-2">Eraser Size: {eraserSize}px</label>
                        <input type="range" min={8} max={120} step={4} value={eraserSize} onChange={e => setEraserSize(Number(e.target.value))} className="w-full accent-[var(--pms-rose)]" />
                        <div className="flex justify-between text-xs text-[var(--pms-muted)] mt-1">
                          <span>Small (8px)</span>
                          <span>Large (120px)</span>
                        </div>
                      </div>
                      <p className="text-xs text-[var(--pms-muted)]">Click or drag over annotations to erase them.</p>
                    </div>
                  )}
                </motion.div>
              )}
              </AnimatePresence>
            </aside>
          </div>
        </motion.div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-2xl pms-glass-panel rounded-3xl p-7 sm:p-10 text-center shadow-xl"
          >
            <div className="p-7 sm:p-8 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.08] dark:bg-emerald-500/10 mb-6">
              <motion.div
                initial={prefersReduced ? false : { scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 360, damping: 22 }}
                className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center text-white shadow-md"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
              >
                <Download className="w-7 h-7" />
              </motion.div>
              <h3 className="text-2xl font-bold text-[var(--pms-ink)] mb-3">PDF edited successfully!</h3>
              {savedEngineNote && (
                <p className="text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-500/15 border border-emerald-500/25 rounded-xl px-3.5 py-2 mb-5 max-w-md mx-auto font-medium">
                  {savedEngineNote}
                </p>
              )}
              <motion.a
                whileHover={prefersReduced ? undefined : { y: -1, scale: 1.02 }}
                whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                href={editedUrl}
                download={`edited_${file.name}`}
                className="pms-btn-primary relative overflow-hidden inline-flex items-center justify-center gap-2.5 px-8 py-4 text-lg font-bold rounded-2xl shadow-lg"
              >
                <span className="pms-shimmer pointer-events-none" />
                <Download className="w-5 h-5 relative z-10" />
                <span className="relative z-10">Download Edited PDF</span>
              </motion.a>
            </div>
            <button
              type="button"
              onClick={() => { setFile(null); setEditedUrl(null); setSavedEngineNote(null); setAnnotations([]); setUndoStack([]); setRedoStack([]); }}
              className="px-4 py-2 rounded-xl text-[var(--pms-muted)] hover:text-[var(--pms-ink)] hover:bg-black/5 dark:hover:bg-white/5 font-semibold transition-colors"
            >
              Edit another PDF
            </button>
          </motion.div>
        </div>
      )}
      </div>

      {/* Signature Modal */}
      <AnimatePresence>
      {showSignatureModal && (
        <motion.div
          key="signature-modal"
          initial={prefersReduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={prefersReduced ? undefined : { opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={prefersReduced ? undefined : { opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className="pms-glass-panel rounded-2xl p-6 w-full max-w-md shadow-2xl"
          >
            <h3 className="text-xl font-bold text-[var(--pms-ink)] mb-4">Draw your signature</h3>
            {/* Signature color picker */}
            <div className="mb-3">
              <label className="text-sm font-medium text-[var(--pms-ink)] block mb-2">Ink Color:</label>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="color"
                  value={signatureColor}
                  onChange={e => {
                    setSignatureColor(e.target.value);
                    sigCanvasRef.current?.clear();
                  }}
                  className="w-8 h-8 p-0.5 border border-[var(--pms-border)] bg-white/80 dark:bg-slate-900/80 rounded-lg cursor-pointer flex-shrink-0"
                />
                {['#000000', '#1d4ed8', '#dc2626', '#16a34a', '#7c3aed', '#db2777', '#0891b2', '#d97706', '#1e3a8a', '#7f1d1d'].map(c => (
                  <button key={c} type="button"
                    onClick={() => { setSignatureColor(c); sigCanvasRef.current?.clear(); }}
                    className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 flex-shrink-0 ${signatureColor === c ? 'border-[var(--pms-rose)] scale-110 ring-2 ring-rose-300/70' : 'border-[var(--pms-border)]'}`}
                    style={{ background: c }} title={c} />
                ))}
              </div>
            </div>
            {/* Signature pen width */}
            <div className="mb-3">
              <label className="text-sm font-medium text-[var(--pms-ink)] block mb-1">
                Stroke Width: <span className="font-bold text-[var(--pms-rose)]">{signaturePenWidth}px</span>
              </label>
              <input
                type="range" min={1} max={8} step={0.5}
                value={signaturePenWidth}
                onChange={e => { setSignaturePenWidth(Number(e.target.value)); sigCanvasRef.current?.clear(); }}
                className="w-full accent-[var(--pms-rose)]"
              />
              <div className="flex justify-between text-xs text-[var(--pms-muted)]">
                <span>Thin (1px)</span><span>Thick (8px)</span>
              </div>
            </div>
            {/* Keep signature drawing canvas pure white for crisp ink export contrast */}
            <div className="border-2 border-dashed border-[var(--pms-border)] rounded-xl mb-4 bg-white overflow-hidden">
              <SignatureCanvas
                ref={sigCanvasRef}
                canvasProps={{ className: 'w-full h-48 rounded-lg' }}
                penColor={signatureColor}
                dotSize={signaturePenWidth}
                minWidth={signaturePenWidth * 0.5}
                maxWidth={signaturePenWidth * 1.5}
              />
            </div>
            <div className="flex justify-between gap-4">
              <button
                type="button"
                onClick={() => sigCanvasRef.current?.clear()}
                className="px-4 py-2 text-[var(--pms-muted)] hover:text-[var(--pms-ink)] hover:bg-black/5 dark:hover:bg-white/5 rounded-xl font-medium transition-colors"
              >
                Clear
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowSignatureModal(false); setActiveTool(null); }}
                  className="px-4 py-2 text-[var(--pms-muted)] hover:text-[var(--pms-ink)] hover:bg-black/5 dark:hover:bg-white/5 rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <motion.button
                  type="button"
                  whileTap={prefersReduced ? undefined : { scale: 0.96 }}
                  onClick={saveSignature}
                  className="pms-btn-primary px-6 py-2 rounded-xl font-bold"
                >
                  Add
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Link Modal */}
      <AnimatePresence>
      {showLinkModal && (
        <motion.div
          key="link-modal"
          initial={prefersReduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={prefersReduced ? undefined : { opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={prefersReduced ? undefined : { opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className="pms-glass-panel rounded-2xl p-6 w-full max-w-md shadow-2xl"
          >
            <h3 className="text-xl font-bold text-[var(--pms-ink)] mb-4">Add Link URL</h3>
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-4 py-3 rounded-xl border border-[var(--pms-border)] bg-white/80 dark:bg-slate-900/80 text-[var(--pms-ink)] focus:ring-2 focus:ring-rose-500/20 focus:border-[var(--pms-rose)] outline-none mb-6"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowLinkModal(false); setPendingLinkRect(null); setActiveTool(null); }}
                className="px-4 py-2 text-[var(--pms-muted)] hover:text-[var(--pms-ink)] hover:bg-black/5 dark:hover:bg-white/5 rounded-xl font-medium transition-colors"
              >
                Cancel
              </button>
              <motion.button
                type="button"
                whileTap={prefersReduced ? undefined : { scale: 0.96 }}
                onClick={saveLink}
                disabled={!linkUrl}
                className="pms-btn-primary px-6 py-2 rounded-xl font-bold disabled:opacity-50"
              >
                Add Link
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* ── RIGHT-CLICK CONTEXT MENU ── */}
      <AnimatePresence>
      {contextMenu.visible && contextMenu.block && (
        <div key="editor-context-menu-root" className="fixed inset-0 z-[200]">
          {/* Backdrop to close menu */}
          <div
            className="absolute inset-0"
            onClick={() => setContextMenu({ visible: false, x: 0, y: 0, block: null })}
            onContextMenu={e => { e.preventDefault(); setContextMenu({ visible: false, x: 0, y: 0, block: null }); }}
          />
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={prefersReduced ? undefined : { opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.14 }}
            className="fixed z-[201] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-[var(--pms-border)] py-1.5 min-w-[210px] overflow-hidden"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {/* Header */}
            <div className="px-3.5 py-2 border-b border-[var(--pms-border)] text-xs font-semibold text-[var(--pms-muted)] truncate max-w-[230px]">
              "{contextMenu.block.text.slice(0, 40)}{contextMenu.block.text.length > 40 ? '…' : ''}"
            </div>
            {/* Actions */}
            <button
              className="w-full text-left px-3.5 py-2 text-sm text-[var(--pms-ink)] hover:bg-[var(--pms-soft-rose)] hover:text-[var(--pms-rose)] flex items-center gap-2.5 transition-colors"
              onClick={() => {
                setContextMenu({ visible: false, x: 0, y: 0, block: null });
                setInlineEdit({ active: true, block: contextMenu.block!, text: contextMenu.block!.text });
                setTimeout(() => inlineEditRef.current?.focus(), 30);
              }}
            >
              <SquarePen className="w-4 h-4" /> Edit Text Inline
            </button>
            <button
              className="w-full text-left px-3.5 py-2 text-sm text-[var(--pms-ink)] hover:bg-amber-500/12 hover:text-amber-600 dark:hover:text-amber-300 flex items-center gap-2.5 transition-colors"
              onClick={() => {
                const block = contextMenu.block!;
                pushUndo();
                setAnnotations(prev => [...prev, {
                  id: Date.now().toString() + '_hl',
                  type: 'highlight',
                  pageIndex: currentPage - 1,
                  x: block.x,
                  y: block.y,
                  width: block.w,
                  height: block.h,
                }]);
                setContextMenu({ visible: false, x: 0, y: 0, block: null });
              }}
            >
              <Highlighter className="w-4 h-4" /> Highlight
            </button>
            <button
              className="w-full text-left px-3.5 py-2 text-sm text-[var(--pms-ink)] hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-2.5 transition-colors"
              onClick={() => {
                const block = contextMenu.block!;
                pushUndo();
                setAnnotations(prev => [...prev, {
                  id: Date.now().toString() + '_ul',
                  type: 'underline',
                  pageIndex: currentPage - 1,
                  x: block.x,
                  y: block.y + block.h - 2,
                  width: block.w,
                  height: 3,
                  color: '#000000',
                }]);
                setContextMenu({ visible: false, x: 0, y: 0, block: null });
              }}
            >
              <Underline className="w-4 h-4" /> Underline
            </button>
            <button
              className="w-full text-left px-3.5 py-2 text-sm text-[var(--pms-ink)] hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-2.5 transition-colors"
              onClick={() => {
                const block = contextMenu.block!;
                pushUndo();
                setAnnotations(prev => [...prev, {
                  id: Date.now().toString() + '_st',
                  type: 'strikethrough',
                  pageIndex: currentPage - 1,
                  x: block.x,
                  y: block.y + block.h / 2 - 1,
                  width: block.w,
                  height: 2,
                  color: '#000000',
                }]);
                setContextMenu({ visible: false, x: 0, y: 0, block: null });
              }}
            >
              <Strikethrough className="w-4 h-4" /> Strikethrough
            </button>
            <button
              className="w-full text-left px-3.5 py-2 text-sm text-[var(--pms-ink)] hover:bg-red-500/12 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-2.5 transition-colors"
              onClick={() => {
                const block = contextMenu.block!;
                pushUndo();
                setAnnotations(prev => [...prev, {
                  id: Date.now().toString() + '_wo',
                  type: 'whiteout',
                  pageIndex: currentPage - 1,
                  x: block.x,
                  y: block.y,
                  width: block.w,
                  height: block.h,
                  color: isPaperWhiteHex(block.bgColor) ? '#ffffff' : (block.bgColor || '#ffffff'),
                }]);
                setContextMenu({ visible: false, x: 0, y: 0, block: null });
              }}
            >
              <Eraser className="w-4 h-4" /> Redact / Whiteout
            </button>
            <button
              className="w-full text-left px-3.5 py-2 text-sm text-[var(--pms-ink)] hover:bg-sky-500/12 hover:text-sky-600 dark:hover:text-sky-300 flex items-center gap-2.5 transition-colors"
              onClick={() => {
                navigator.clipboard?.writeText(contextMenu.block!.text).catch(() => {});
                setContextMenu({ visible: false, x: 0, y: 0, block: null });
              }}
            >
              <TypeIcon className="w-4 h-4" /> Copy Text
            </button>
          </motion.div>
        </div>
      )}
      </AnimatePresence>
    </div>
  );
}
