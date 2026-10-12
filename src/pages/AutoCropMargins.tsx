import React, { useState } from 'react';
import { 
  Crop, Download, Loader2, Sparkles, Sliders, ChevronLeft, ChevronRight, 
  Check, FileText, ArrowRight, Eye
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';

export default function AutoCropMargins() {
  useSEO(
    'Auto-Crop PDF Margins Online Free — Smart Content Bounding Box Cropper',
    'Automatically crop white margins and borders from PDF files online. Detects content bounding boxes, customizable padding slider, and client-side processing.'
  );

  usePageSEO(
    'Smart PDF Margin Auto-Cropper Studio',
    'Remove excessive white margins from scanned documents, slides, and books. Features automatic content detection and custom padding sliders.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [paddingPx, setPaddingPx] = useState(15);
  const [uniformCrop, setUniformCrop] = useState(true);

  const [pageImages, setPageImages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);

  const [busy, setBusy] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFileName, setResultFileName] = useState('');

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    const f = files[0];
    setFile(f);
    setResultUrl(null);
    setCurrentPage(0);
    setBusy(true);

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
    } catch (err) {
      console.error('Failed to load PDF:', err);
    } finally {
      setBusy(false);
    }
  };

  const executeAutoCrop = async () => {
    if (!file) return;
    setBusy(true);
    setProgressMsg('Detecting content bounding boxes...');

    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const newDoc = await PDFDocument.create();

      for (let p = 1; p <= pdf.numPages; p++) {
        setProgressMsg(`Cropping page ${p} of ${pdf.numPages}...`);
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 2.0 }); // High-res 2x
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

        // Scan pixels to find bounding box
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;

        let minX = canvas.width;
        let minY = canvas.height;
        let maxX = 0;
        let maxY = 0;

        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const idx = (y * canvas.width + x) * 4;
            // Detect non-white pixel
            if (d[idx] < 240 || d[idx + 1] < 240 || d[idx + 2] < 240) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        // Apply padding
        const pad = paddingPx * 2;
        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX = Math.min(canvas.width, maxX + pad);
        maxY = Math.min(canvas.height, maxY + pad);

        const cropW = Math.max(maxX - minX, 100);
        const cropH = Math.max(maxY - minY, 100);

        // Crop to sub-canvas
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        const cropCtx = cropCanvas.getContext('2d')!;
        cropCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

        const cropDataUrl = cropCanvas.toDataURL('image/jpeg', 0.94);
        const cropBytes = dataUrlToBytes(cropDataUrl);
        const pdfImg = await newDoc.embedJpg(cropBytes);

        // Add page matching cropped aspect
        const newPage = newDoc.addPage([cropW / 2, cropH / 2]);
        newPage.drawImage(pdfImg, {
          x: 0,
          y: 0,
          width: cropW / 2,
          height: cropH / 2
        });
      }

      const finalBytes = await newDoc.save();
      const blob = new Blob([finalBytes as any], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
      setResultFileName(`${file.name.replace(/\.pdf$/i, '')}_AutoCropped.pdf`);
    } catch (err: any) {
      console.error('Auto crop error:', err);
      alert(`Auto-crop failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setBusy(false);
      setProgressMsg('');
    }
  };

  const reset = () => {
    setFile(null);
    setResultUrl(null);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-4 sm:p-8 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm border border-blue-100 dark:border-blue-900/50">
          <Crop className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-2">
          Smart PDF Margin Auto-Cropper Studio
        </h1>
        <p className="text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          Automatically trim excessive white margins from slides, book scans, and documents with custom padding sliders.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl space-y-6">
          <FileDropzone 
            onDrop={handleDrop} 
            multiple={false} 
            title="Select PDF Document to Auto-Crop Margins" 
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Sparkles className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Bounding Box Detection</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Detects non-white text & graphic boundaries automatically.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Sliders className="w-6 h-6 text-indigo-600 dark:text-indigo-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Custom Padding</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Adjust margin padding from zero tight crop to 50px.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Download className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Client-Side Engine</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Instant processing in browser without server lag.</p>
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
            <span className="inline-block px-3 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
              Auto-Cropped Successfully
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              Cropped PDF Ready!
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
              White margins have been trimmed with {paddingPx}px breathable padding.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <a
              href={resultUrl}
              download={resultFileName}
              className="flex-1 py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 text-base transition-all"
            >
              <Download className="w-5 h-5" />
              Download Cropped PDF
            </a>
            <button
              onClick={reset}
              className="py-4 px-6 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-2xl transition-all text-sm"
            >
              Crop Another File
            </button>
          </div>
        </div>
      ) : (
        /* Workspace */
        <div className="w-full space-y-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300">Padding Margin: {paddingPx}px</span>
              <input
                type="range"
                min="0"
                max="50"
                value={paddingPx}
                onChange={e => setPaddingPx(Number(e.target.value))}
                className="w-32 accent-blue-600"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={executeAutoCrop}
                disabled={busy}
                className="py-2.5 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-all disabled:opacity-40"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crop className="w-4 h-4" />}
                {progressMsg || 'Auto-Crop All Margins'}
              </button>
              <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600 underline">Change</button>
            </div>
          </div>

          {/* Viewport Preview */}
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

            <div className="relative border shadow-xl bg-white select-none overflow-hidden rounded-lg max-w-full">
              <img
                src={pageImages[currentPage]}
                alt={`Page ${currentPage + 1}`}
                className="max-h-[75vh] object-contain mx-auto block pointer-events-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
