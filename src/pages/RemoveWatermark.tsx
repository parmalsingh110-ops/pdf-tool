import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Eraser, Download, Loader2, Sparkles, Sliders, Check, 
  ChevronLeft, ChevronRight, Eye, ShieldCheck, FileText, Trash2, ArrowRight,
  Server, Cpu, Layers
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb } from 'pdf-lib';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

type RemovalMode = 'bottom-crop' | 'box-erase' | 'contrast-cleaner' | 'backend-vector';

interface EraseBox {
  x: number;
  y: number;
  w: number;
  h: number;
  allPages: boolean;
  pageIndex: number;
}

export default function RemoveWatermark() {
  useSEO(
    'Remove Watermark from PDF Online Free — Vector Precision & Interactive Eraser',
    'Remove watermarks from PDF files online with vector sharpness preservation. Erase CamScanner bottom footers, delete watermark annotations, or draw custom watermark eraser boxes.'
  );

  usePageSEO(
    'PDF Watermark Remover Studio — Vector Cleaner & Eraser',
    'Erase unwanted watermarks, CamScanner footers, and background stamps from your PDF. Features dual-engine vector cleaning and interactive eraser with before-and-after preview.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);

  const [mode, setMode] = useState<RemovalMode>('backend-vector');
  const [bottomCropPercent, setBottomCropPercent] = useState(5.5);
  const [contrastThreshold, setContrastThreshold] = useState(190);
  const [removeBackgroundAnnots, setRemoveBackgroundAnnots] = useState(true);

  const [boxes, setBoxes] = useState<EraseBox[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [startPt, setStartPt] = useState<{ x: number; y: number } | null>(null);

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFileName, setResultFileName] = useState('');
  const [engineUsed, setEngineUsed] = useState<'backend' | 'client-vector' | 'client-raster'>('backend');

  const imgRef = useRef<HTMLImageElement>(null);

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    const f = files[0];
    setFile(f);
    setResultUrl(null);
    setBoxes([]);
    setCurrentPage(0);
    setLoading(true);

    try {
      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const imgs: string[] = [];

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
        imgs.push(canvas.toDataURL('image/jpeg', 0.88));
      }

      setPageImages(imgs);
    } catch (err: any) {
      alert(`Failed to load PDF: ${err?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const getRelCoords = useCallback((e: React.MouseEvent) => {
    if (!imgRef.current) return { x: 0, y: 0 };
    const r = imgRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100
    };
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if (mode !== 'box-erase') return;
    const pt = getRelCoords(e);
    setStartPt(pt);
    setDrawing(true);
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (!drawing || !startPt) return;
    const end = getRelCoords(e);
    const x = Math.min(startPt.x, end.x);
    const y = Math.min(startPt.y, end.y);
    const w = Math.abs(end.x - startPt.x);
    const h = Math.abs(end.y - startPt.y);

    if (w > 1 && h > 1) {
      setBoxes(prev => [
        ...prev,
        { x, y, w, h, allPages: true, pageIndex: currentPage }
      ]);
    }
    setDrawing(false);
  };

  const executeRemoval = async () => {
    if (!file) return;
    setBusy(true);

    try {
      // ── Strategy A: Backend Vector Engine ────────────────────────
      if (mode === 'backend-vector') {
        try {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('remove_bottom', 'true');
          fd.append('bottom_percentage', bottomCropPercent.toString());
          fd.append('remove_background', removeBackgroundAnnots ? 'true' : 'false');

          const res = await fetch(`${API_BASE}/remove-watermark`, {
            method: 'POST',
            body: fd
          });

          if (res.ok) {
            const blob = await res.blob();
            setResultUrl(URL.createObjectURL(blob));
            setResultFileName(`${file.name.replace(/\.pdf$/i, '')}_Clean_Vector.pdf`);
            setEngineUsed('backend');
            setBusy(false);
            return;
          }
        } catch (backendErr) {
          console.warn('Backend vector watermark removal failed, falling back to client vector mode:', backendErr);
        }
      }

      // ── Strategy B: Client-Side Lossless Vector Whiteout ─────────────
      // If user selected bottom-crop or box-erase without contrast filtering,
      // use pdf-lib to draw filled white rectangles directly onto the existing vector document!
      // This preserves 100% of the vector text, fonts, bookmarks, and keeps the file tiny.
      if (mode === 'bottom-crop' || mode === 'box-erase' || mode === 'backend-vector') {
        const fileBytes = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
        const pages = pdfDoc.getPages();

        for (let pIdx = 0; pIdx < pages.length; pIdx++) {
          const page = pages[pIdx];
          const { width, height } = page.getSize();

          // Bottom scanner watermark wipe
          if (mode === 'bottom-crop' || mode === 'backend-vector') {
            const bh = height * (bottomCropPercent / 100.0);
            page.drawRectangle({
              x: 0,
              y: 0, // In PDF coordinates, (0,0) is bottom-left
              width: width,
              height: bh,
              color: rgb(1, 1, 1),
              opacity: 1.0,
            });
          }

          // Custom drawn eraser boxes
          if (mode === 'box-erase') {
            const relevantBoxes = boxes.filter(b => b.allPages || b.pageIndex === pIdx);
            for (const b of relevantBoxes) {
              const rx = (b.x / 100) * width;
              // b.y is from top (0 to 100). In PDF, y is measured from bottom:
              const ry = height - ((b.y + b.h) / 100) * height;
              const rw = (b.w / 100) * width;
              const rh = (b.h / 100) * height;

              page.drawRectangle({
                x: rx,
                y: ry,
                width: rw,
                height: rh,
                color: rgb(1, 1, 1),
                opacity: 1.0,
              });
            }
          }
        }

        const cleanPdfBytes = await pdfDoc.save();
        const blob = new Blob([cleanPdfBytes as any], { type: 'application/pdf' });
        setResultUrl(URL.createObjectURL(blob));
        setResultFileName(`${file.name.replace(/\.pdf$/i, '')}_Watermark_Removed.pdf`);
        setEngineUsed('client-vector');
        setBusy(false);
        return;
      }

      // ── Strategy C: Scanned Contrast Cleaner (Image-only PDFs) ──────
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const newDoc = await PDFDocument.create();

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const brightness = (d[i] + d[i + 1] + d[i + 2]) / 3;
          if (brightness > contrastThreshold) {
            d[i] = 255;
            d[i + 1] = 255;
            d[i + 2] = 255;
          } else {
            d[i] = Math.max(0, d[i] - 30);
            d[i + 1] = Math.max(0, d[i + 1] - 30);
            d[i + 2] = Math.max(0, d[i + 2] - 30);
          }
        }
        ctx.putImageData(imgData, 0, 0);

        const imgDataUrl = canvas.toDataURL('image/jpeg', 0.94);
        const imgBytes = dataUrlToBytes(imgDataUrl);
        const pdfImg = await newDoc.embedJpg(imgBytes);
        const origVp = page.getViewport({ scale: 1.0 });
        const newPage = newDoc.addPage([origVp.width, origVp.height]);
        newPage.drawImage(pdfImg, {
          x: 0,
          y: 0,
          width: origVp.width,
          height: origVp.height
        });
      }

      const finalBytes = await newDoc.save();
      const blob = new Blob([finalBytes as any], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
      setResultFileName(`${file.name.replace(/\.pdf$/i, '')}_Cleaned_Scan.pdf`);
      setEngineUsed('client-raster');
    } catch (err: any) {
      console.error('Watermark removal error:', err);
      alert(`Removal failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResultUrl(null);
    setBoxes([]);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-4 sm:p-8 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm border border-rose-100 dark:border-rose-900/50">
          <Eraser className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-2">
          PDF Watermark Remover Studio
        </h1>
        <p className="text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          Erase CamScanner footers, delete watermark annotations, and wipe background stamps with 100% vector sharpness preservation.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl space-y-6">
          <FileDropzone 
            onDrop={handleDrop} 
            multiple={false} 
            title="Select PDF Document to Remove Watermark" 
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Sparkles className="w-6 h-6 text-rose-600 dark:text-rose-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Vector Precision Wipe</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Cleans footer tags without turning pages into blurry images.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Sliders className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Interactive Eraser Box</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Draw custom eraser rectangles across all pages at once.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Annotation Stripper</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Deletes built-in PDF watermark layers and draft stamps cleanly.</p>
            </div>
          </div>
        </div>
      ) : resultUrl ? (
        /* Result Screen */
        <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-xl text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <Check className="w-10 h-10" />
          </div>

          <div>
            <span className="inline-block px-3 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
              Watermark Removed Successfully
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              Clean PDF Ready!
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
              {engineUsed === 'backend' 
                ? 'Processed with PyMuPDF High-Precision Vector Engine (Vector quality 100% preserved).'
                : engineUsed === 'client-vector'
                ? 'Processed with Lossless Vector Whiteout (Original text sharpness 100% intact).'
                : 'Processed with High-Resolution Contrast Washout.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <a
              href={resultUrl}
              download={resultFileName}
              className="flex-1 py-3 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all"
            >
              <Download className="w-4 h-4" /> Download Clean PDF
            </a>
            <button
              onClick={reset}
              className="py-3 px-6 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl transition-colors"
            >
              Clean Another PDF
            </button>
          </div>
        </div>
      ) : (
        /* Editor Controls & Preview */
        <div className="w-full flex flex-col lg:flex-row gap-6">
          {/* Sidebar Controls */}
          <div className="w-full lg:w-80 shrink-0 space-y-5">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Removal Strategy
              </h3>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setMode('backend-vector')}
                  className={`w-full p-3 rounded-xl border text-left text-xs transition-all ${
                    mode === 'backend-vector'
                      ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 ring-2 ring-rose-500/20'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="font-bold flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-rose-500" /> Smart Vector Clean (Recommended)
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Erases footers and watermark annotations without losing crisp vector text.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('bottom-crop')}
                  className={`w-full p-3 rounded-xl border text-left text-xs transition-all ${
                    mode === 'bottom-crop'
                      ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 ring-2 ring-rose-500/20'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="font-bold flex items-center gap-2">
                    <Eraser className="w-4 h-4 text-rose-500" /> Scanner Footer Wipe
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Specifically removes bottom "Scanned with CamScanner / Oken Scanner" tags.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('box-erase')}
                  className={`w-full p-3 rounded-xl border text-left text-xs transition-all ${
                    mode === 'box-erase'
                      ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 ring-2 ring-rose-500/20'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="font-bold flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-rose-500" /> Custom Box Eraser
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Click and drag a box directly on the preview to erase any watermark.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('contrast-cleaner')}
                  className={`w-full p-3 rounded-xl border text-left text-xs transition-all ${
                    mode === 'contrast-cleaner'
                      ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 ring-2 ring-rose-500/20'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="font-bold flex items-center gap-2">
                    <Layers className="w-4 h-4 text-rose-500" /> Scanned Contrast Washout
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    For photo/scanned pages with faded gray diagonal stamps in the background.
                  </p>
                </button>
              </div>

              {/* Strategy Parameters */}
              {(mode === 'bottom-crop' || mode === 'backend-vector') && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span>Footer Wipe Height</span>
                    <span className="text-rose-600 font-bold">{bottomCropPercent}%</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    step="0.5"
                    value={bottomCropPercent}
                    onChange={(e) => setBottomCropPercent(parseFloat(e.target.value))}
                    className="w-full accent-rose-600"
                  />
                  <p className="text-[11px] text-slate-400">
                    Typically 5% to 7% cleanly covers CamScanner & TapScanner footer lines.
                  </p>
                </div>
              )}

              {mode === 'backend-vector' && (
                <div className="pt-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={removeBackgroundAnnots}
                      onChange={(e) => setRemoveBackgroundAnnots(e.target.checked)}
                      className="rounded accent-rose-600"
                    />
                    <span>Delete Watermark Annotations & Layers</span>
                  </label>
                </div>
              )}

              {mode === 'contrast-cleaner' && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span>Threshold Filter</span>
                    <span className="text-rose-600 font-bold">{contrastThreshold}</span>
                  </div>
                  <input
                    type="range"
                    min="140"
                    max="240"
                    value={contrastThreshold}
                    onChange={(e) => setContrastThreshold(parseInt(e.target.value))}
                    className="w-full accent-rose-600"
                  />
                  <p className="text-[11px] text-slate-400">
                    Higher threshold washes out fainter light-gray background stamps.
                  </p>
                </div>
              )}

              {mode === 'box-erase' && boxes.length > 0 && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    {boxes.length} Eraser Box{boxes.length > 1 ? 'es' : ''} defined
                  </span>
                  <button
                    onClick={() => setBoxes([])}
                    className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1 font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Clear All
                  </button>
                </div>
              )}

              <button
                onClick={executeRemoval}
                disabled={busy}
                className="w-full py-3 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20 disabled:opacity-50 transition-all text-sm"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Cleaning Watermark...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Apply & Download PDF
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Interactive Document Preview */}
          <div className="flex-1 flex flex-col items-center">
            {/* Page Navigation */}
            <div className="flex items-center gap-3 mb-3 text-xs font-semibold text-slate-600 dark:text-slate-400">
              <button
                onClick={() => setCurrentPage(p => Math.max(p - 1, 0))}
                disabled={currentPage === 0}
                className="p-1.5 rounded-lg border hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>Page {currentPage + 1} of {pageImages.length}</span>
              <button
                onClick={() => setCurrentPage(p => Math.min(p + 1, pageImages.length - 1))}
                disabled={currentPage === pageImages.length - 1}
                className="p-1.5 rounded-lg border hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div
              className={`relative border shadow-xl bg-white select-none overflow-hidden rounded-xl max-w-full ${
                mode === 'box-erase' ? 'cursor-crosshair' : ''
              }`}
              onMouseDown={onMouseDown}
              onMouseUp={onMouseUp}
            >
              <img
                ref={imgRef}
                src={pageImages[currentPage]}
                alt={`Page ${currentPage + 1}`}
                className="max-h-[75vh] object-contain mx-auto block pointer-events-none"
              />

              {/* Bottom crop preview overlay */}
              {(mode === 'bottom-crop' || mode === 'backend-vector') && (
                <div
                  className="absolute bottom-0 left-0 right-0 bg-rose-500/30 border-t-2 border-rose-500 flex items-center justify-center text-[11px] font-bold text-rose-900 pointer-events-none transition-all"
                  style={{ height: `${bottomCropPercent}%` }}
                >
                  Scanner Footer Wipe Zone ({bottomCropPercent}%)
                </div>
              )}

              {/* Box eraser preview overlays */}
              {mode === 'box-erase' && boxes.map((b, idx) => (
                <div
                  key={idx}
                  className="absolute bg-rose-500/30 border-2 border-rose-600 flex items-center justify-center text-[10px] font-bold text-rose-900 pointer-events-none"
                  style={{
                    left: `${b.x}%`,
                    top: `${b.y}%`,
                    width: `${b.w}%`,
                    height: `${b.h}%`
                  }}
                >
                  Eraser
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
