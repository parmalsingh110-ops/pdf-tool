import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Eraser, Download, Loader2, Sparkles, Sliders, Check, 
  ChevronLeft, ChevronRight, Eye, ShieldCheck, FileText, Trash2, ArrowRight
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';

type RemovalMode = 'bottom-crop' | 'box-erase' | 'contrast-cleaner';

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
    'Remove Watermark from PDF Online Free — Interactive Watermark Eraser',
    'Remove watermarks from PDF files online. Erase CamScanner bottom footers, draw custom watermark eraser boxes, or suppress background stamps in your browser.'
  );

  usePageSEO(
    'PDF Watermark Remover Studio — Interactive Eraser & Background Cleaner',
    'Erase unwanted watermarks, CamScanner footers, and background stamps from your PDF. 100% client-side with before-and-after live preview.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);

  const [mode, setMode] = useState<RemovalMode>('bottom-crop');
  const [bottomCropPercent, setBottomCropPercent] = useState(5.5);
  const [contrastThreshold, setContrastThreshold] = useState(190);

  const [boxes, setBoxes] = useState<EraseBox[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [startPt, setStartPt] = useState<{ x: number; y: number } | null>(null);

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFileName, setResultFileName] = useState('');

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
    setStartPt(null);
  };

  const executeWatermarkRemoval = async () => {
    if (!file) return;
    setBusy(true);

    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const newDoc = await PDFDocument.create();

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 2.0 }); // High-res 2x
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

        // Apply Mode 1: Bottom CamScanner footer wipe
        if (mode === 'bottom-crop') {
          const cutH = (bottomCropPercent / 100) * canvas.height;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, canvas.height - cutH, canvas.width, cutH);
        }

        // Apply Mode 2: Custom erase boxes
        if (mode === 'box-erase') {
          const relevantBoxes = boxes.filter(b => b.allPages || b.pageIndex === p - 1);
          ctx.fillStyle = '#ffffff';
          for (const b of relevantBoxes) {
            const rx = (b.x / 100) * canvas.width;
            const ry = (b.y / 100) * canvas.height;
            const rw = (b.w / 100) * canvas.width;
            const rh = (b.h / 100) * canvas.height;
            ctx.fillRect(rx, ry, rw, rh);
          }
        }

        // Apply Mode 3: Contrast Thresholding (suppresses light gray watermarks)
        if (mode === 'contrast-cleaner') {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            const brightness = (d[i] + d[i + 1] + d[i + 2]) / 3;
            if (brightness > contrastThreshold) {
              // Wash out to pure white
              d[i] = 255;
              d[i + 1] = 255;
              d[i + 2] = 255;
            } else {
              // Deepen dark text
              d[i] = Math.max(0, d[i] - 30);
              d[i + 1] = Math.max(0, d[i + 1] - 30);
              d[i + 2] = Math.max(0, d[i + 2] - 30);
            }
          }
          ctx.putImageData(imgData, 0, 0);
        }

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
        canvas.width = 0;
        canvas.height = 0;
      }

      const finalBytes = await newDoc.save();
      const blob = new Blob([finalBytes as any], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
      setResultFileName(`${file.name.replace(/\.pdf$/i, '')}_Watermark_Removed.pdf`);
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
          Erase CamScanner footer watermarks, draw custom eraser boxes, or suppress background watermark stamps cleanly.
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
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Scanner Footer Wipe</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Cleans bottom "Scanned by CamScanner/TapScanner" tags.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Sliders className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Eraser Box Tool</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Draw custom eraser rectangles across all pages at once.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Contrast Filter</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Eliminates faded background draft stamps and diagonal text.</p>
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
              Watermark Removed
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              Clean PDF Ready!
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
              Your document has been cleaned and the watermarks have been removed.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <a
              href={resultUrl}
              download={resultFileName}
              className="flex-1 py-4 px-6 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-2xl shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2 text-base transition-all"
            >
              <Download className="w-5 h-5" />
              Download Clean PDF
            </a>
            <button
              onClick={reset}
              className="py-4 px-6 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-2xl transition-all text-sm"
            >
              Clean Another
            </button>
          </div>
        </div>
      ) : (
        /* Workspace */
        <div className="w-full space-y-4">
          {/* Top Control Bar */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
            {/* Mode Selector */}
            <div className="flex items-center gap-2">
              {[
                { id: 'bottom-crop', label: 'Scanner Footer Wipe' },
                { id: 'box-erase', label: 'Draw Eraser Box' },
                { id: 'contrast-cleaner', label: 'Background Contrast Clean' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setMode(tab.id as RemovalMode)}
                  className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all ${
                    mode === tab.id
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Mode-specific Controls */}
            {mode === 'bottom-crop' && (
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300">Cut Height: {bottomCropPercent}%</span>
                <input
                  type="range"
                  min="2"
                  max="15"
                  step="0.5"
                  value={bottomCropPercent}
                  onChange={e => setBottomCropPercent(Number(e.target.value))}
                  className="w-28 accent-rose-600"
                />
              </div>
            )}

            {mode === 'contrast-cleaner' && (
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300">Wash Threshold: {contrastThreshold}</span>
                <input
                  type="range"
                  min="140"
                  max="230"
                  value={contrastThreshold}
                  onChange={e => setContrastThreshold(Number(e.target.value))}
                  className="w-28 accent-rose-600"
                />
              </div>
            )}

            {mode === 'box-erase' && boxes.length > 0 && (
              <button
                onClick={() => setBoxes([])}
                className="py-1.5 px-3 bg-red-100 text-red-700 hover:bg-red-200 text-xs font-bold rounded-xl flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Boxes ({boxes.length})
              </button>
            )}

            {/* Action Button */}
            <div className="flex items-center gap-3">
              <button
                onClick={executeWatermarkRemoval}
                disabled={busy}
                className="py-2.5 px-6 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-all disabled:opacity-40"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eraser className="w-4 h-4" />}
                Remove Watermark & Save
              </button>
              <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600 underline">Change</button>
            </div>
          </div>

          {/* Viewport with Visual Overlay */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-400">
              <button
                onClick={() => setCurrentPage(p => Math.max(p - 1, 0))}
                disabled={currentPage === 0}
                className="p-1.5 rounded-lg border hover:bg-slate-100 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>Page {currentPage + 1} of {pageImages.length}</span>
              <button
                onClick={() => setCurrentPage(p => Math.min(p + 1, pageImages.length - 1))}
                disabled={currentPage === pageImages.length - 1}
                className="p-1.5 rounded-lg border hover:bg-slate-100 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div
              className={`relative border shadow-xl bg-white select-none overflow-hidden rounded-lg max-w-full ${
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
              {mode === 'bottom-crop' && (
                <div
                  className="absolute bottom-0 left-0 right-0 bg-red-500/30 border-t-2 border-red-500 flex items-center justify-center text-[11px] font-bold text-red-900 pointer-events-none"
                  style={{ height: `${bottomCropPercent}%` }}
                >
                  Scanner Watermark Wipe Area
                </div>
              )}

              {/* Box eraser preview overlays */}
              {mode === 'box-erase' && boxes.map((b, idx) => (
                <div
                  key={idx}
                  className="absolute bg-red-500/30 border-2 border-red-600 flex items-center justify-center text-[10px] font-bold text-red-900 pointer-events-none"
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
