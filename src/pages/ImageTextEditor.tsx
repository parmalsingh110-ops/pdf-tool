import { useState, useRef, useEffect, useCallback } from 'react';
import { createWorker, PSM } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  Download,
  ScanText,
  Loader2,
  MousePointer2,
  SquareDashed,
  Undo2,
  RotateCw,
  ZoomIn,
  Columns2,
} from 'lucide-react';
import FileDropzone from '../components/FileDropzone';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** File picker + dropzone: raster images and PDF (first page → PNG for OCR). */
const IMAGE_AND_PDF_ACCEPT: Record<string, string[]> = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'application/pdf': ['.pdf'],
};

async function pdfFirstPageToPngUrl(file: File, scale = 2): Promise<{ url: string; w: number; h: number }> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png'),
  );
  if (!blob) throw new Error('Could not rasterize PDF page');
  const url = URL.createObjectURL(blob);
  return { url, w: canvas.width, h: canvas.height };
}

type Bbox = { x0: number; y0: number; x1: number; y1: number };

interface EditableWord {
  id: string;
  bbox: Bbox;
  origText: string;
  text: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  color: string;
  fontFamily: string;
  confidence: number;
  dirty: boolean;
  /** Line height multiplier for multi-line replacement text */
  lineHeight: number;
  /** Extra letter spacing in px (canvas / overlay) */
  letterSpacing: number;
  textAlign: 'left' | 'center' | 'right';
}

function iou(a: Bbox, b: Bbox): number {
  const x0 = Math.max(a.x0, b.x0);
  const y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1);
  const y1 = Math.min(a.y1, b.y1);
  if (x1 <= x0 || y1 <= y0) return 0;
  const inter = (x1 - x0) * (y1 - y0);
  const areaA = (a.x1 - a.x0) * (a.y1 - a.y0);
  const areaB = (b.x1 - b.x0) * (b.y1 - b.y0);
  const u = areaA + areaB - inter;
  return u <= 0 ? 0 : inter / u;
}

function scaleBbox(b: Bbox, factor: number): Bbox {
  return {
    x0: b.x0 * factor,
    y0: b.y0 * factor,
    x1: b.x1 * factor,
    y1: b.y1 * factor,
  };
}

function mergeDetections(primary: EditableWord[], secondary: EditableWord[], iouThreshold = 0.22): EditableWord[] {
  const out = [...primary];
  let n = 0;
  for (const s of secondary) {
    const overlaps = out.some((p) => iou(p.bbox, s.bbox) > iouThreshold);
    if (!overlaps) {
      out.push({ ...s, id: `x-${n++}-${s.id}` });
    }
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenWords(page: any): EditableWord[] {
  const out: EditableWord[] = [];
  if (!page?.blocks) return out;
  let idx = 0;
  for (const block of page.blocks) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        for (const word of line.words || []) {
          const t = (word.text || '').trim();
          if (!t) continue;
          const b = word.bbox as Bbox;
          if (!b || b.x1 <= b.x0 || b.y1 <= b.y0) continue;
          const h = b.y1 - b.y0;
          out.push({
            id: `w-${idx++}`,
            bbox: b,
            origText: t,
            text: t,
            fontSize: Math.max(10, Math.round(h * 0.78)),
            bold: false,
            italic: false,
            color: '#111827',
            fontFamily: 'system-ui, sans-serif',
            confidence: typeof word.confidence === 'number' ? word.confidence : 0,
            dirty: false,
            lineHeight: 1.25,
            letterSpacing: 0,
            textAlign: 'left',
          });
        }
      }
    }
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenLines(page: any): EditableWord[] {
  const out: EditableWord[] = [];
  if (!page?.blocks) return out;
  let idx = 0;
  for (const block of page.blocks) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        const t = (line.text || '').trim();
        if (!t) continue;
        const b = line.bbox as Bbox;
        if (!b || b.x1 <= b.x0 || b.y1 <= b.y0) continue;
        const h = b.y1 - b.y0;
        out.push({
          id: `l-${idx++}`,
          bbox: b,
          origText: t,
          text: t,
          fontSize: Math.max(10, Math.round(h * 0.72)),
          bold: false,
          italic: false,
          color: '#111827',
          fontFamily: 'system-ui, sans-serif',
          confidence: typeof line.confidence === 'number' ? line.confidence : 0,
          dirty: false,
          lineHeight: 1.25,
          letterSpacing: 0,
          textAlign: 'left',
        });
      }
    }
  }
  return out;
}

export default function ImageTextEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  const [lang, setLang] = useState('eng');
  const [rasterBusy, setRasterBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [words, setWords] = useState<EditableWord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const wordsRef = useRef(words);
  const undoStackRef = useRef<EditableWord[][]>([]);
  const [zoomPct, setZoomPct] = useState(100);
  const [compareSplit, setCompareSplit] = useState(false);

  const [exportBusy, setExportBusy] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportExt, setExportExt] = useState<'png' | 'jpg'>('png');
  /** True when the loaded file was PDF (we rasterized page 1 for OCR). */
  const [sourceWasPdf, setSourceWasPdf] = useState(false);

  const [ocrGranularity, setOcrGranularity] = useState<'words' | 'lines'>('words');
  const [psmChoice, setPsmChoice] = useState<'auto' | 'block' | 'sparse' | 'line'>('auto');
  const [extraSparsePass, setExtraSparsePass] = useState(true);
  const [upscaleOcr, setUpscaleOcr] = useState(false);
  const [toolMode, setToolMode] = useState<'select' | 'draw'>('select');
  const [drawRectDisp, setDrawRectDisp] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);

  const workerRef = useRef<Awaited<ReturnType<typeof createWorker>> | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);

  const maxPreviewWidth = 880;
  const baseScale = natural ? Math.min(1, maxPreviewWidth / natural.w) : 1;
  const viewScale = (baseScale * zoomPct) / 100;
  const viewW = natural ? Math.round(natural.w * viewScale) : 0;
  const viewH = natural ? Math.round(natural.h * viewScale) : 0;

  useEffect(() => {
    wordsRef.current = words;
  }, [words]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!objectUrl) return;
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  useEffect(() => {
    if (!exportUrl) return;
    return () => URL.revokeObjectURL(exportUrl);
  }, [exportUrl]);

  const processFile = useCallback(async (f: File) => {
    setExportUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setWords([]);
    setSelectedId(null);
    setOcrError(null);
    setFileError(null);
    setNatural(null);
    setFile(f);
    setRasterBusy(true);

    const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
    let createdUrl: string | null = null;

    try {
      if (isPdf) {
        const { url, w, h } = await pdfFirstPageToPngUrl(f, 2);
        createdUrl = url;
        setObjectUrl(url);
        setNatural({ w, h });
        setSourceWasPdf(true);
      } else {
        const url = URL.createObjectURL(f);
        createdUrl = url;
        setObjectUrl(url);
        setSourceWasPdf(false);
        await new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            setNatural({ w: img.naturalWidth, h: img.naturalHeight });
            resolve();
          };
          img.onerror = () => reject(new Error('unsupported image'));
          img.src = url;
        });
      }
    } catch (e) {
      console.error(e);
      if (createdUrl) URL.revokeObjectURL(createdUrl);
      setObjectUrl(null);
      setFile(null);
      setNatural(null);
      setSourceWasPdf(false);
      setFileError(
        isPdf
          ? 'PDF could not be read (password / corrupted). Use an unlocked PDF or save as PNG/JPG.'
          : 'This file is not a supported image. Use PNG, JPG, WebP, GIF, or PDF.',
      );
    } finally {
      setRasterBusy(false);
    }
  }, []);

  const handleDrop = (files: File[]) => {
    const f = files[0];
    if (f) void processFile(f);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const pushUndo = useCallback(() => {
    undoStackRef.current.push(wordsRef.current.map((w) => ({ ...w, bbox: { ...w.bbox } })));
    if (undoStackRef.current.length > 40) undoStackRef.current.shift();
  }, []);

  const deleteWord = useCallback((id: string) => {
    pushUndo();
    setWords((prev) => prev.filter((w) => w.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  }, [pushUndo]);

  /**
   * Sample surrounding pixels around a bbox to detect the background color.
   * Falls back to white if sampling fails.
   */
  const sampleBgColor = useCallback((ctx: CanvasRenderingContext2D, bbox: Bbox, imgW: number, imgH: number): string => {
    const samples: number[][] = [];
    const pad = 4;
    // Gather pixels from edges around the bbox
    const positions = [
      [bbox.x0 - pad, bbox.y0 - pad],
      [bbox.x1 + pad, bbox.y0 - pad],
      [bbox.x0 - pad, bbox.y1 + pad],
      [bbox.x1 + pad, bbox.y1 + pad],
      [(bbox.x0 + bbox.x1) / 2, bbox.y0 - pad],
      [(bbox.x0 + bbox.x1) / 2, bbox.y1 + pad],
      [bbox.x0 - pad, (bbox.y0 + bbox.y1) / 2],
      [bbox.x1 + pad, (bbox.y0 + bbox.y1) / 2],
    ];
    for (const [px, py] of positions) {
      const sx = Math.round(Math.min(Math.max(0, px), imgW - 1));
      const sy = Math.round(Math.min(Math.max(0, py), imgH - 1));
      try {
        const id = ctx.getImageData(sx, sy, 1, 1);
        samples.push([id.data[0], id.data[1], id.data[2]]);
      } catch { /* cross-origin or empty */ }
    }
    if (samples.length === 0) return '#ffffff';
    // Average
    const avg = [0, 0, 0];
    for (const s of samples) { avg[0] += s[0]; avg[1] += s[1]; avg[2] += s[2]; }
    avg[0] = Math.round(avg[0] / samples.length);
    avg[1] = Math.round(avg[1] / samples.length);
    avg[2] = Math.round(avg[2] / samples.length);
    return `rgb(${avg[0]},${avg[1]},${avg[2]})`;
  }, []);

  const undoLast = useCallback(() => {
    const st = undoStackRef.current;
    if (!st.length) return;
    const prev = st.pop()!;
    setWords(prev.map((w) => ({ ...w, bbox: { ...w.bbox } })));
  }, []);

  const updateWordText = useCallback((id: string, text: string) => {
    setWords((prev) => prev.map((w) => (w.id === id ? { ...w, text, dirty: true } : w)));
  }, []);

  const updateWord = useCallback(
    (id: string, patch: Partial<EditableWord>) => {
      pushUndo();
      setWords((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch, dirty: true } : w)));
    },
    [pushUndo],
  );

  const psmFromChoice = () => {
    switch (psmChoice) {
      case 'block':
        return PSM.SINGLE_BLOCK;
      case 'sparse':
        return PSM.SPARSE_TEXT;
      case 'line':
        return PSM.SINGLE_LINE;
      default:
        return PSM.AUTO;
    }
  };

  const runOcr = async () => {
    if (!objectUrl || !natural) return;
    if (wordsRef.current.length) pushUndo();
    setOcrBusy(true);
    setOcrError(null);
    setOcrProgress(0);
    setWords([]);
    setSelectedId(null);

    let upscaledRevoke: (() => void) | null = null;
    let ocrSource = objectUrl;
    let coordScale = 1;

    try {
      if (upscaleOcr) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = objectUrl;
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej(new Error('image load'));
        });
        const f = 2;
        const c = document.createElement('canvas');
        c.width = Math.round(natural.w * f);
        c.height = Math.round(natural.h * f);
        const x = c.getContext('2d');
        if (!x) throw new Error('canvas');
        x.imageSmoothingEnabled = true;
        x.imageSmoothingQuality = 'high';
        x.drawImage(img, 0, 0, c.width, c.height);
        const blob = await new Promise<Blob | null>((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
        if (!blob) throw new Error('upscale');
        const u = URL.createObjectURL(blob);
        upscaledRevoke = () => URL.revokeObjectURL(u);
        ocrSource = u;
        coordScale = 1 / f;
      }

      await workerRef.current?.terminate();
      workerRef.current = null;

      const worker = await createWorker(lang, 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round((m.progress || 0) * 100));
          }
        },
      });
      workerRef.current = worker;

      await worker.setParameters({
        tessedit_pageseg_mode: psmFromChoice(),
        user_defined_dpi: '300',
      });

      const mapBoxes = (list: EditableWord[]) =>
        coordScale === 1 ? list : list.map((w) => ({ ...w, bbox: scaleBbox(w.bbox, coordScale) }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extract = (data: any) => {
        const flat = ocrGranularity === 'lines' ? flattenLines(data) : flattenWords(data);
        return mapBoxes(flat);
      };

      const { data: d1 } = await worker.recognize(ocrSource, {}, { blocks: true });
      let combined = extract(d1);

      if (extraSparsePass && psmChoice !== 'sparse') {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
        const { data: d2 } = await worker.recognize(ocrSource, {}, { blocks: true });
        const second = extract(d2);
        combined = mergeDetections(combined, second, 0.22);
      }

      setWords(combined);
      if (combined.length === 0) {
        setOcrError(
          'No text detected. Try Lines mode, “Sparse” layout, enable 2× OCR upscale, or draw a box (Add region) for manual text.',
        );
      }
    } catch (e) {
      console.error(e);
      const detail = e instanceof Error ? e.message : String(e);
      setOcrError(
        `OCR failed. ${detail ? `Details: ${detail}. ` : ''}Check internet (language data download). If “English + Hindi” fails, try English only.`,
      );
    } finally {
      upscaledRevoke?.();
      setOcrBusy(false);
      setOcrProgress(0);
    }
  };

  const selected = words.find((w) => w.id === selectedId) || null;

  const paintDirtyWords = (ctx: CanvasRenderingContext2D, dirty: EditableWord[], srcCtx?: CanvasRenderingContext2D) => {
    const pad = 2;
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    for (const w of dirty) {
      const { bbox: b } = w;
      // Use auto-detected background color from surrounding pixels
      const bg = srcCtx ? sampleBgColor(srcCtx, b, cw, ch) : '#ffffff';
      ctx.fillStyle = bg;
      ctx.fillRect(b.x0 - pad, b.y0 - pad, b.x1 - b.x0 + pad * 2, b.y1 - b.y0 + pad * 2);

      const styleParts: string[] = [];
      if (w.italic) styleParts.push('italic');
      if (w.bold) styleParts.push('bold');
      const fam = w.fontFamily || 'system-ui, sans-serif';
      ctx.font = `${styleParts.join(' ')} ${w.fontSize}px ${fam}`;
      ctx.fillStyle = w.color;
      ctx.textBaseline = 'bottom';
      const align = w.textAlign || 'left';
      ctx.textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
      try {
        ctx.letterSpacing = `${w.letterSpacing ?? 0}px`;
      } catch {
        /* older engines */
      }
      const lines = (w.text || '').split('\n');
      const lh = (w.lineHeight ?? 1.25) * w.fontSize;
      let tx = b.x0;
      if (align === 'center') tx = (b.x0 + b.x1) / 2;
      if (align === 'right') tx = b.x1 - pad;
      const bottomBaseline = b.y1 - 2;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        const ty = lines.length === 1 ? bottomBaseline : b.y0 + lh * (i + 1);
        ctx.fillText(line, tx, ty);
      }
      ctx.textAlign = 'left';
      try {
        ctx.letterSpacing = '0px';
      } catch {
        /* ignore */
      }
    }
  };

  const exportRaster = async (mime: 'image/png' | 'image/jpeg') => {
    if (!objectUrl || !natural) return;
    const dirty = words.filter((w) => w.dirty);
    if (dirty.length === 0) {
      alert('Change at least one word (text or style), or use Download original from your file.');
      return;
    }

    setExportBusy(true);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = objectUrl;
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('load'));
      });

      const canvas = document.createElement('canvas');
      canvas.width = natural.w;
      canvas.height = natural.h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('ctx');
      ctx.drawImage(img, 0, 0);
      // Create a clean copy for background sampling (before any overpainting)
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = natural.w;
      srcCanvas.height = natural.h;
      const srcCtx = srcCanvas.getContext('2d');
      if (srcCtx) srcCtx.drawImage(img, 0, 0);
      paintDirtyWords(ctx, dirty, srcCtx || undefined);

      const q = mime === 'image/jpeg' ? 0.92 : undefined;
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), mime, q as number),
      );
      if (!blob) throw new Error('blob');
      if (exportUrl) URL.revokeObjectURL(exportUrl);
      setExportExt(mime === 'image/jpeg' ? 'jpg' : 'png');
      setExportUrl(URL.createObjectURL(blob));
    } catch (e) {
      console.error(e);
      alert('Export failed.');
    } finally {
      setExportBusy(false);
    }
  };

  const rotateImage = async (dir: 'cw' | 'ccw') => {
    if (!objectUrl || !natural || !file) return;
    setRasterBusy(true);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = objectUrl;
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('load'));
      });
      const c = document.createElement('canvas');
      const cw = dir === 'cw';
      c.width = natural.h;
      c.height = natural.w;
      const x = c.getContext('2d');
      if (!x) throw new Error('ctx');
      if (cw) {
        x.translate(c.width, 0);
        x.rotate(Math.PI / 2);
      } else {
        x.translate(0, c.height);
        x.rotate(-Math.PI / 2);
      }
      x.drawImage(img, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
      if (!blob) throw new Error('blob');
      const name = file.name.replace(/\.[^.]+$/, '') + '-rotated.png';
      const f = new File([blob], name, { type: 'image/png' });
      await processFile(f);
    } catch (e) {
      console.error(e);
      alert('Rotate failed.');
    } finally {
      setRasterBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-900 text-slate-100 min-h-[calc(100vh-4rem)]">
      <div className="max-w-[1400px] mx-auto w-full px-4 py-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold flex items-center gap-3">
              <ScanText className="w-8 h-8 text-sky-400" />
              Image &amp; screenshot text edit
            </h1>
            <p className="mt-2 text-slate-400 max-w-3xl text-sm leading-relaxed">
              Upload a <strong className="text-slate-300">PNG, JPG, WebP, GIF</strong>, or{' '}
              <strong className="text-slate-300">PDF</strong> (first page is converted to an image for OCR).
              Runs in your browser: OCR finds words, you edit text and style, then we white out those boxes and
              redraw text. This is not AI inpainting — for seamless edits similar to{' '}
              <a
                href="https://photext.shop/"
                className="text-sky-400 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                PhoText
              </a>
              , a server-side model would be required.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 flex-1 min-h-0 xl:items-start">
          <aside className="xl:col-span-3 flex flex-col gap-3 min-h-[200px] xl:sticky xl:top-20 xl:z-30 xl:max-h-[calc(100dvh-5.5rem)] xl:overflow-y-auto">
            <div className="rounded-2xl border border-slate-700 bg-slate-800/80 p-4">
              {!file ? (
                <FileDropzone
                  onDrop={handleDrop}
                  multiple={false}
                  maxFiles={1}
                  accept={IMAGE_AND_PDF_ACCEPT}
                  variant="dark"
                  title="Image or PDF"
                  subtitle="Click below or drop — PNG, JPG, WebP, GIF, PDF"
                  buttonLabel="Choose from device"
                />
              ) : (
                <div className="space-y-3 text-sm">
                  <p className="text-slate-300 truncate" title={file.name}>
                    {file.name}
                  </p>
                  {sourceWasPdf && (
                    <p className="text-xs text-amber-200/90 bg-amber-950/40 border border-amber-800/60 rounded-lg px-2 py-1.5">
                      PDF: only <strong>page 1</strong> is shown and used for OCR. Export is always PNG.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Change file
                    </button>
                    <button
                      type="button"
                      className="text-rose-400 font-semibold px-2 py-2 text-xs"
                      onClick={() => {
                        setExportUrl((p) => {
                          if (p) URL.revokeObjectURL(p);
                          return null;
                        });
                        setObjectUrl((p) => {
                          if (p) URL.revokeObjectURL(p);
                          return null;
                        });
                        setFile(null);
                        setNatural(null);
                        setWords([]);
                        setSelectedId(null);
                        setFileError(null);
                        setOcrError(null);
                        setSourceWasPdf(false);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/png,image/jpeg,image/webp,image/gif,.pdf,application/pdf"
                    onChange={(e) => {
                      const next = e.target.files?.[0];
                      if (next) void processFile(next);
                      e.target.value = '';
                    }}
                  />
                  <div>
                    <label className="text-xs text-slate-500">OCR language</label>
                    <select
                      className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-600 px-3 py-2"
                      value={lang}
                      onChange={(e) => setLang(e.target.value)}
                      disabled={ocrBusy}
                    >
                      <option value="eng">English</option>
                      <option value="hin">Hindi</option>
                      <option value="eng+hin">English + Hindi</option>
                      <option value="spa">Spanish</option>
                      <option value="fra">French</option>
                      <option value="deu">German</option>
                      <option value="ara">Arabic</option>
                      <option value="chi_sim">Chinese (Simplified)</option>
                      <option value="jpn">Japanese</option>
                      <option value="rus">Russian</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Detect as</label>
                    <select
                      className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-600 px-3 py-2"
                      value={ocrGranularity}
                      onChange={(e) => setOcrGranularity(e.target.value as 'words' | 'lines')}
                      disabled={ocrBusy}
                    >
                      <option value="words">Words (fine edit)</option>
                      <option value="lines">Lines (more text found)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Page layout (PSM)</label>
                    <select
                      className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-600 px-3 py-2"
                      value={psmChoice}
                      onChange={(e) =>
                        setPsmChoice(e.target.value as 'auto' | 'block' | 'sparse' | 'line')
                      }
                      disabled={ocrBusy}
                    >
                      <option value="auto">Auto</option>
                      <option value="block">Single block</option>
                      <option value="sparse">Sparse / UI text</option>
                      <option value="line">Single line</option>
                    </select>
                  </div>
                  <label className="flex items-start gap-2 text-xs text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded border-slate-500"
                      checked={extraSparsePass}
                      onChange={(e) => setExtraSparsePass(e.target.checked)}
                      disabled={ocrBusy || psmChoice === 'sparse'}
                    />
                    <span>
                      Second pass (sparse) to catch missed snippets
                      {psmChoice === 'sparse' ? ' — off when layout is already Sparse' : ''}
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-xs text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded border-slate-500"
                      checked={upscaleOcr}
                      onChange={(e) => setUpscaleOcr(e.target.checked)}
                      disabled={ocrBusy}
                    />
                    <span>2× upscale before OCR (better for small text; slower)</span>
                  </label>
                  <button
                    type="button"
                    disabled={ocrBusy || !objectUrl || rasterBusy || !natural}
                    onClick={runOcr}
                    className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 font-bold disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {ocrBusy ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        OCR {ocrProgress}%
                      </>
                    ) : (
                      'Run OCR'
                    )}
                  </button>
                  {fileError && (
                    <p className="text-xs text-rose-200 bg-rose-950/50 border border-rose-800 rounded-lg p-2">
                      {fileError}
                    </p>
                  )}
                  {ocrError && (
                    <p className="text-xs text-amber-300 bg-amber-950/50 border border-amber-800 rounded-lg p-2">
                      {ocrError}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-800/80 p-3 flex-1 overflow-hidden flex flex-col min-h-[160px]">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                Detected words ({words.length})
              </h2>
              <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                {words.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setSelectedId(w.id)}
                    className={`w-full text-left px-2 py-1.5 rounded-lg text-xs truncate border flex items-center gap-1.5 ${
                      selectedId === w.id
                        ? 'border-sky-500 bg-sky-950/50 text-sky-100'
                        : 'border-transparent hover:bg-slate-700/80 text-slate-300'
                    }`}
                  >
                    {/* Confidence dot */}
                    <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                      w.confidence >= 85 ? 'bg-emerald-400' : w.confidence >= 60 ? 'bg-amber-400' : 'bg-rose-400'
                    }`} title={`Confidence: ${Math.round(w.confidence)}%`} />
                    {w.dirty ? '✎ ' : ''}
                    <span className="truncate">{w.text}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); deleteWord(w.id); }}
                      className="ml-auto shrink-0 w-4 h-4 rounded bg-rose-600/70 hover:bg-rose-500 text-white flex items-center justify-center text-[8px] font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete this word"
                    >
                      ×
                    </button>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="xl:col-span-6 flex flex-col items-center justify-start gap-2 min-w-0 xl:max-h-none">
            {objectUrl && natural && !rasterBusy && (
              <div className="flex flex-wrap items-center justify-center gap-2 w-full shrink-0">
                <button
                  type="button"
                  onClick={() => setToolMode('select')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${
                    toolMode === 'select' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 border border-slate-600'
                  }`}
                >
                  <MousePointer2 className="w-3.5 h-3.5" />
                  Select
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setToolMode('draw');
                    setSelectedId(null);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${
                    toolMode === 'draw' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300 border border-slate-600'
                  }`}
                >
                  <SquareDashed className="w-3.5 h-3.5" />
                  Add text region
                </button>
                {toolMode === 'draw' && (
                  <span className="text-xs text-amber-200/90">Drag on the image to draw a box, then type text on the right.</span>
                )}
                <button
                  type="button"
                  onClick={undoLast}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-200 border border-slate-600"
                  title="Undo last text / layout change"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  Undo
                </button>
                <button
                  type="button"
                  onClick={() => void rotateImage('cw')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-200 border border-slate-600"
                  title="Rotate 90° clockwise (re-raster, re-OCR)"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  90°
                </button>
                <button
                  type="button"
                  onClick={() => void rotateImage('ccw')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-200 border border-slate-600"
                  title="Rotate 90° counter-clockwise"
                >
                  <RotateCw className="w-3.5 h-3.5 scale-x-[-1]" />
                  90°↺
                </button>
                <label className="inline-flex items-center gap-2 text-[11px] text-slate-400">
                  <ZoomIn className="w-3.5 h-3.5" />
                  <input
                    type="range"
                    min={50}
                    max={200}
                    value={zoomPct}
                    onChange={(e) => setZoomPct(Number(e.target.value))}
                    className="w-24 accent-sky-500"
                  />
                  <span className="tabular-nums w-8">{zoomPct}%</span>
                </label>
                <button
                  type="button"
                  onClick={() => setCompareSplit((v) => !v)}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border ${
                    compareSplit
                      ? 'bg-violet-600 text-white border-violet-500'
                      : 'bg-slate-800 text-slate-200 border-slate-600'
                  }`}
                >
                  <Columns2 className="w-3.5 h-3.5" />
                  Compare
                </button>
              </div>
            )}
            {rasterBusy ? (
              <div className="flex-1 min-h-[280px] w-full flex flex-col items-center justify-center gap-3 border border-dashed border-slate-600 rounded-2xl bg-slate-800/40">
                <Loader2 className="w-10 h-10 text-sky-400 animate-spin" />
                <p className="text-slate-400 text-sm">Preparing preview…</p>
                <p className="text-slate-500 text-xs">PDFs are converted to an image (page 1).</p>
              </div>
            ) : objectUrl && natural ? (
              <div className="w-full flex justify-center overflow-auto max-h-[min(58vh,620px)] rounded-xl border border-slate-800/80 bg-slate-950/50 p-2">
                <div
                  ref={previewBoxRef}
                  className={`relative rounded-lg border border-slate-700 bg-slate-950 overflow-hidden shadow-xl shrink-0 ${
                    toolMode === 'draw' ? 'cursor-crosshair' : ''
                  }`}
                  style={{ width: viewW, height: viewH }}
                  onMouseDown={(e) => {
                    if (toolMode !== 'draw' || !previewBoxRef.current) return;
                    const r = previewBoxRef.current.getBoundingClientRect();
                    drawStartRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
                    const p = drawStartRef.current;
                    setDrawRectDisp({ x: p.x, y: p.y, w: 0, h: 0 });
                  }}
                  onMouseMove={(e) => {
                    if (toolMode !== 'draw' || !drawStartRef.current || !previewBoxRef.current) return;
                    const r = previewBoxRef.current.getBoundingClientRect();
                    const x = e.clientX - r.left;
                    const y = e.clientY - r.top;
                    const s = drawStartRef.current;
                    setDrawRectDisp({
                      x: Math.min(s.x, x),
                      y: Math.min(s.y, y),
                      w: Math.abs(x - s.x),
                      h: Math.abs(y - s.y),
                    });
                  }}
                  onMouseUp={(e) => {
                    const start = drawStartRef.current;
                    if (toolMode !== 'draw' || !natural || !previewBoxRef.current || !start) {
                      drawStartRef.current = null;
                      setDrawRectDisp(null);
                      return;
                    }
                    const r = previewBoxRef.current.getBoundingClientRect();
                    const x = e.clientX - r.left;
                    const y = e.clientY - r.top;
                    const d = {
                      x: Math.min(start.x, x),
                      y: Math.min(start.y, y),
                      w: Math.abs(x - start.x),
                      h: Math.abs(y - start.y),
                    };
                    drawStartRef.current = null;
                    setDrawRectDisp(null);
                    if (d.w < 8 || d.h < 8) return;
                    const nx0 = d.x / viewScale;
                    const ny0 = d.y / viewScale;
                    const nx1 = (d.x + d.w) / viewScale;
                    const ny1 = (d.y + d.h) / viewScale;
                    const bbox: Bbox = {
                      x0: Math.max(0, nx0),
                      y0: Math.max(0, ny0),
                      x1: Math.min(natural.w, nx1),
                      y1: Math.min(natural.h, ny1),
                    };
                    const hh = bbox.y1 - bbox.y0;
                    const newW: EditableWord = {
                      id: `draw-${Date.now()}`,
                      bbox,
                      origText: '',
                      text: 'Text',
                      fontSize: Math.max(12, Math.round(hh * 0.65)),
                      bold: false,
                      italic: false,
                      color: '#111827',
                      fontFamily: 'system-ui, sans-serif',
                      confidence: 100,
                      dirty: true,
                      lineHeight: 1.25,
                      letterSpacing: 0,
                      textAlign: 'left',
                    };
                    pushUndo();
                    setWords((prev) => [...prev, newW]);
                    setSelectedId(newW.id);
                    setToolMode('select');
                  }}
                  onMouseLeave={() => {
                    if (toolMode === 'draw' && drawStartRef.current) {
                      drawStartRef.current = null;
                      setDrawRectDisp(null);
                    }
                  }}
                >
                  <img
                    ref={imgRef}
                    src={objectUrl}
                    alt="Source"
                    className="absolute inset-0 z-0 w-full h-full object-fill pointer-events-none select-none"
                    draggable={false}
                  />
                  {words.map((w) => {
                    const b = w.bbox;
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (toolMode === 'draw') return;
                          setSelectedId(w.id);
                        }}
                        className={`absolute z-20 box-border transition-colors ${
                          selectedId === w.id
                            ? 'bg-sky-500/35 border-2 border-sky-400'
                            : 'bg-sky-400/10 border border-sky-500/40 hover:bg-sky-400/25'
                        } ${toolMode === 'draw' ? 'pointer-events-none opacity-40' : ''}`}
                        style={{
                          left: b.x0 * viewScale,
                          top: b.y0 * viewScale,
                          width: (b.x1 - b.x0) * viewScale,
                          height: (b.y1 - b.y0) * viewScale,
                        }}
                        title={w.text || '(empty)'}
                      />
                    );
                  })}
                  {selected && toolMode === 'select' && (
                    <div
                      className="absolute z-[24] pointer-events-none flex items-center overflow-hidden rounded border border-sky-400/90 bg-white/95 px-1 py-0.5 shadow-md"
                      style={{
                        left: selected.bbox.x0 * viewScale,
                        top: selected.bbox.y0 * viewScale,
                        width: Math.max(
                          4,
                          Math.min(
                            viewW - selected.bbox.x0 * viewScale,
                            (selected.bbox.x1 - selected.bbox.x0) * viewScale,
                          ),
                        ),
                        minHeight: (selected.bbox.y1 - selected.bbox.y0) * viewScale,
                      }}
                    >
                      <span
                        className="w-full whitespace-pre-wrap break-words leading-tight"
                        style={{
                          fontSize: `${Math.max(7, selected.fontSize * viewScale)}px`,
                          fontWeight: selected.bold ? 700 : 400,
                          fontStyle: selected.italic ? 'italic' : 'normal',
                          color: selected.color,
                          fontFamily: selected.fontFamily || 'system-ui, sans-serif',
                          lineHeight: selected.lineHeight ?? 1.25,
                          letterSpacing: `${selected.letterSpacing ?? 0}px`,
                          textAlign: selected.textAlign || 'left',
                        }}
                      >
                        {selected.text || '\u00a0'}
                      </span>
                    </div>
                  )}
                  {drawRectDisp && drawRectDisp.w > 0 && (
                    <div
                      className="absolute z-30 border-2 border-dashed border-amber-400 bg-amber-400/15 pointer-events-none"
                      style={{
                        left: drawRectDisp.x,
                        top: drawRectDisp.y,
                        width: drawRectDisp.w,
                        height: drawRectDisp.h,
                      }}
                    />
                  )}
                </div>
                {compareSplit && (
                  <div className="mt-4 flex flex-col sm:flex-row gap-4 justify-center items-start w-full max-w-[920px] mx-auto">
                    <div className="text-center shrink-0">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Original</p>
                      <div
                        className="relative rounded-lg border border-slate-700 bg-slate-950 overflow-hidden mx-auto"
                        style={{ width: viewW, height: viewH }}
                      >
                        <img
                          src={objectUrl}
                          alt=""
                          className="absolute inset-0 z-0 w-full h-full object-fill pointer-events-none select-none"
                          draggable={false}
                        />
                      </div>
                    </div>
                    <div className="text-center shrink-0">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Regions</p>
                      <div
                        className="relative rounded-lg border border-slate-700 bg-slate-950 overflow-hidden mx-auto"
                        style={{ width: viewW, height: viewH }}
                      >
                        <img
                          src={objectUrl}
                          alt=""
                          className="absolute inset-0 z-0 w-full h-full object-fill pointer-events-none select-none"
                          draggable={false}
                        />
                        {words.map((w) => {
                          const b = w.bbox;
                          return (
                            <div
                              key={`cmp-${w.id}`}
                              className="absolute z-10 box-border bg-sky-400/15 border border-sky-500/50 pointer-events-none"
                              style={{
                                left: b.x0 * viewScale,
                                top: b.y0 * viewScale,
                                width: (b.x1 - b.x0) * viewScale,
                                height: (b.y1 - b.y0) * viewScale,
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 min-h-[280px] w-full flex flex-col gap-4 border border-dashed border-slate-600 rounded-2xl bg-slate-800/30 p-4">
                <p className="text-center text-slate-400 text-sm">
                  No preview yet — choose a file with the button below or from the left panel.
                </p>
                <FileDropzone
                  onDrop={handleDrop}
                  multiple={false}
                  maxFiles={1}
                  accept={IMAGE_AND_PDF_ACCEPT}
                  variant="dark"
                  title="Select image or PDF"
                  subtitle="Opens file picker — or drag a file here"
                  buttonLabel="Browse files"
                />
                {fileError && (
                  <p className="text-sm text-rose-300 bg-rose-950/40 border border-rose-800 rounded-lg p-3 text-center">
                    {fileError}
                  </p>
                )}
              </div>
            )}
          </section>

          <aside className="xl:col-span-3 rounded-2xl border border-slate-700 bg-slate-800/80 p-4 space-y-4 xl:sticky xl:top-20 xl:z-30 xl:max-h-[calc(100dvh-5.5rem)] xl:overflow-y-auto">
            <h2 className="text-sm font-bold text-slate-200">Text style</h2>
            {!selected ? (
              <p className="text-sm text-slate-500">Select a word on the image or from the list.</p>
            ) : (
              <>
                <div>
                  <label className="text-xs text-slate-500">Replacement text</label>
                  <textarea
                    className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-600 px-3 py-2 text-sm min-h-[72px]"
                    value={selected.text}
                    onChange={(e) => updateWordText(selected.id, e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Font size (px)</label>
                  <input
                    type="number"
                    min={6}
                    max={200}
                    className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-600 px-3 py-2 text-sm"
                    value={selected.fontSize}
                    onChange={(e) =>
                      updateWord(selected.id, { fontSize: Math.max(6, parseInt(e.target.value, 10) || 12) })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Font</label>
                  <select
                    className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-600 px-3 py-2 text-sm"
                    value={selected.fontFamily || 'system-ui, sans-serif'}
                    onChange={(e) => updateWord(selected.id, { fontFamily: e.target.value })}
                  >
                    <option value="system-ui, sans-serif">Sans (system)</option>
                    <option value="Arial, Helvetica, sans-serif">Arial / Helvetica</option>
                    <option value="Georgia, 'Times New Roman', serif">Georgia / Times</option>
                    <option value="ui-monospace, SFMono-Regular, monospace">Monospace</option>
                    <option value="'Courier New', Courier, monospace">Courier</option>
                  </select>
                </div>
                <div className="flex gap-4">
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.bold}
                      onChange={(e) => updateWord(selected.id, { bold: e.target.checked })}
                    />
                    Bold
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.italic}
                      onChange={(e) => updateWord(selected.id, { italic: e.target.checked })}
                    />
                    Italic
                  </label>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Color</label>
                  <input
                    type="color"
                    className="mt-1 w-full h-10 rounded-lg cursor-pointer border border-slate-600 bg-slate-900"
                    value={selected.color}
                    onChange={(e) => updateWord(selected.id, { color: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500">Line height</label>
                    <input
                      type="number"
                      step={0.05}
                      min={0.8}
                      max={3}
                      className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-600 px-3 py-2 text-sm"
                      value={selected.lineHeight ?? 1.25}
                      onChange={(e) =>
                        updateWord(selected.id, {
                          lineHeight: Math.min(3, Math.max(0.8, parseFloat(e.target.value) || 1.25)),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Letter spacing (px)</label>
                    <input
                      type="number"
                      step={0.5}
                      min={-2}
                      max={12}
                      className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-600 px-3 py-2 text-sm"
                      value={selected.letterSpacing ?? 0}
                      onChange={(e) =>
                        updateWord(selected.id, {
                          letterSpacing: Math.min(12, Math.max(-2, parseFloat(e.target.value) || 0)),
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Text align</label>
                  <select
                    className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-600 px-3 py-2 text-sm"
                    value={selected.textAlign || 'left'}
                    onChange={(e) =>
                      updateWord(selected.id, {
                        textAlign: e.target.value as 'left' | 'center' | 'right',
                      })
                    }
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
                <p className="text-xs text-slate-500">
                  Original OCR: <span className="text-slate-400">{selected.origText}</span>
                </p>
              </>
            )}

            <div className="pt-4 border-t border-slate-700 space-y-2">
              <button
                type="button"
                disabled={exportBusy || !objectUrl || words.length === 0}
                onClick={() => void exportRaster('image/png')}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {exportBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                Export PNG
              </button>
              <button
                type="button"
                disabled={exportBusy || !objectUrl || words.length === 0}
                onClick={() => void exportRaster('image/jpeg')}
                className="w-full py-3 rounded-xl bg-slate-700 hover:bg-slate-600 font-bold disabled:opacity-40 flex items-center justify-center gap-2 border border-slate-600"
              >
                Export JPG
              </button>
              {exportUrl && (
                <a
                  href={exportUrl}
                  download={`edited_${file?.name?.replace(/\.[^.]+$/, '') || 'image'}.${exportExt}`}
                  className="block text-center text-sm text-sky-400 hover:underline"
                >
                  Download last export
                </a>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
