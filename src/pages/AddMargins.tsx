import { useState, useRef, useEffect } from 'react';
import { Download, FileText, Maximize, Sparkles, CheckCircle2, Eye, Sliders, BookOpen, Scissors } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

// Initialize pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface MarginPreset {
  label: string;
  top: number;
  bottom: number;
  left: number;
  right: number;
  desc: string;
}

const PRESETS: MarginPreset[] = [
  { label: '0.5 Inch (Standard)', top: 36, bottom: 36, left: 36, right: 36, desc: 'Even 0.5" border for clean reading' },
  { label: '1.0 Inch (Wide)', top: 72, bottom: 72, left: 72, right: 72, desc: 'Generous 1" margin for legal & printing' },
  { label: 'Hole Punch / Binder', top: 36, bottom: 36, left: 64, right: 36, desc: 'Extra left gutter margin for 3-ring binder' },
  { label: 'Note Taking / Review', top: 36, bottom: 36, left: 36, right: 90, desc: 'Extra right margin for annotations' },
];

export default function AddMargins() {
  useSEO(
    'Add Margins to PDF Online Free — Custom Padding & Live Preview | PDF Media Suite',
    'Increase white space and margins around PDF pages online free. Add gutter margins for hole punching or spiral binding with live document preview.'
  );

  usePageSEO(
    'Add Margins to PDF',
    'Add custom padding and margin borders to PDF pages. Independent top, bottom, left, and right margins with binder hole-punch presets and live visual preview.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [marginedUrl, setMarginedUrl] = useState<string | null>(null);

  // Margins in points (72 points = 1 inch)
  const [topMargin, setTopMargin] = useState<number>(36);
  const [bottomMargin, setBottomMargin] = useState<number>(36);
  const [leftMargin, setLeftMargin] = useState<number>(36);
  const [rightMargin, setRightMargin] = useState<number>(36);
  const [linkAll, setLinkAll] = useState<boolean>(true);

  // Live Canvas Preview
  const [pageThumbUrl, setPageThumbUrl] = useState<string | null>(null);
  const [origW, setOrigW] = useState(400);
  const [origH, setOrigH] = useState(550);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const selected = acceptedFiles[0];
      setFile(selected);
      setMarginedUrl(null);
      await loadPreviewPage(selected);
    }
  };

  const loadPreviewPage = async (pdfFile: File) => {
    setLoadingPreview(true);
    try {
      const buf = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const page = await pdf.getPage(1);
      const vp = page.getViewport({ scale: 1.0 });

      const maxDim = 450;
      const scale = Math.min(maxDim / vp.width, maxDim / vp.height);
      const scaledVp = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = scaledVp.width;
      canvas.height = scaledVp.height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, scaledVp.width, scaledVp.height);

      await page.render({ canvasContext: ctx, viewport: scaledVp, canvas }).promise;
      setPageThumbUrl(canvas.toDataURL('image/jpeg', 0.85));
      setOrigW(scaledVp.width);
      setOrigH(scaledVp.height);
      canvas.width = 0;
      canvas.height = 0;
    } catch (e) {
      console.error('Error rendering preview:', e);
    } finally {
      setLoadingPreview(false);
    }
  };

  // Draw simulated expanded page on preview canvas
  useEffect(() => {
    if (!pageThumbUrl || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bgImg = new Image();
    bgImg.onload = () => {
      const scaleFactor = origW / 595; // normalize points to preview canvas pixels
      const tPx = topMargin * scaleFactor;
      const bPx = bottomMargin * scaleFactor;
      const lPx = leftMargin * scaleFactor;
      const rPx = rightMargin * scaleFactor;

      const totalW = origW + lPx + rPx;
      const totalH = origH + tPx + bPx;

      canvas.width = totalW;
      canvas.height = totalH;

      // Draw outer margin white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, totalW, totalH);

      // Draw subtle dashed boundary of new margins
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(1, 1, totalW - 2, totalH - 2);

      // Draw original content in the translated position
      ctx.setLineDash([]);
      ctx.drawImage(bgImg, lPx, tPx, origW, origH);

      // Draw original document content outline
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.strokeRect(lPx, tPx, origW, origH);
    };
    bgImg.src = pageThumbUrl;
  }, [pageThumbUrl, topMargin, bottomMargin, leftMargin, rightMargin, origW, origH]);

  const handleAllMarginsChange = (val: number) => {
    setTopMargin(val);
    setBottomMargin(val);
    setLeftMargin(val);
    setRightMargin(val);
  };

  const applyPreset = (preset: MarginPreset) => {
    setTopMargin(preset.top);
    setBottomMargin(preset.bottom);
    setLeftMargin(preset.left);
    setRightMargin(preset.right);
    setLinkAll(preset.top === preset.left && preset.top === preset.bottom && preset.top === preset.right);
  };

  const addMargins = async () => {
    if (!file) return;

    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const pages = pdfDoc.getPages();

      for (const page of pages) {
        const { width, height } = page.getSize();

        // Calculate new page size with specific directional margins
        const newW = width + leftMargin + rightMargin;
        const newH = height + topMargin + bottomMargin;

        page.setSize(newW, newH);

        // Translate content: in PDF coordinates, (0,0) is bottom-left
        page.translateContent(leftMargin, bottomMargin);
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setMarginedUrl(url);
    } catch (error) {
      console.error('Error adding margins:', error);
      alert('An error occurred while adding margins.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 text-xs font-bold tracking-widest uppercase mb-3 border border-sky-200 dark:border-sky-800">
          <Maximize className="w-3.5 h-3.5" /> Document Layout Padding
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-3">
          Add Margins & Padding to PDF
        </h1>
        <p className="text-lg text-gray-600 dark:text-slate-400 max-w-2xl mx-auto">
          Expand document edges with extra margins for binder hole punching, book binding, or teacher notes with live preview.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-4xl">
          <FileDropzone
            onDrop={handleDrop}
            multiple={false}
            accept={{ 'application/pdf': ['.pdf'] }}
            title="Select PDF file"
            subtitle="or drop document here to add margins"
          />
        </div>
      ) : marginedUrl ? (
        /* Results View */
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-8 text-center space-y-6">
          <div className="p-8 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-emerald-900 dark:text-emerald-200 mb-2">
              Margins Added Successfully!
            </h3>
            <p className="text-sm text-emerald-700 dark:text-emerald-400 mb-6">
              New dimensions expanded with Top: {topMargin}pt • Bottom: {bottomMargin}pt • Left: {leftMargin}pt • Right: {rightMargin}pt.
            </p>
            <a
              href={marginedUrl}
              download={`margined_${file.name}`}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-bold rounded-xl shadow-lg transition-all"
            >
              <Download className="w-5 h-5" /> Download Margined PDF
            </a>
          </div>

          <div className="flex justify-center gap-4">
            <button
              onClick={() => setMarginedUrl(null)}
              className="px-6 py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-xl transition-all"
            >
              Adjust Margin Sizes
            </button>
            <button
              onClick={() => {
                setFile(null);
                setMarginedUrl(null);
              }}
              className="px-6 py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-xl transition-all"
            >
              Process Another PDF
            </button>
          </div>
        </div>
      ) : (
        /* Workspace */
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Controls Panel (7 Cols) */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 rounded-xl flex items-center justify-center shrink-0">
                  <Maximize className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white truncate max-w-xs">{file.name}</h3>
                  <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              <button
                onClick={() => setFile(null)}
                className="text-xs font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-slate-300"
              >
                Change File
              </button>
            </div>

            {/* Presets */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2">
                Standard Layout Presets
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p)}
                    className="p-2.5 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 hover:border-sky-400 text-left transition-all"
                  >
                    <div className="font-bold text-gray-900 dark:text-white mb-0.5">{p.label}</div>
                    <div className="text-[11px] text-gray-500 dark:text-slate-400">{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Link Margins Switch */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                Directional Margins
              </span>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-sky-600 dark:text-sky-400">
                <input
                  type="checkbox"
                  checked={linkAll}
                  onChange={(e) => setLinkAll(e.target.checked)}
                  className="w-4 h-4 accent-sky-600 rounded"
                />
                Keep all 4 margins equal
              </label>
            </div>

            {/* 4 Direction Inputs */}
            {linkAll ? (
              <div>
                <div className="flex justify-between text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">
                  <span>Equal Margin Size</span>
                  <span>{topMargin} points ({(topMargin / 72).toFixed(2)} inches)</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="144"
                  value={topMargin}
                  onChange={(e) => handleAllMarginsChange(parseInt(e.target.value, 10))}
                  className="w-full accent-sky-600"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">
                    Top Margin: {topMargin}pt
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="144"
                    value={topMargin}
                    onChange={(e) => setTopMargin(parseInt(e.target.value, 10))}
                    className="w-full accent-sky-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">
                    Bottom Margin: {bottomMargin}pt
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="144"
                    value={bottomMargin}
                    onChange={(e) => setBottomMargin(parseInt(e.target.value, 10))}
                    className="w-full accent-sky-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">
                    Left Margin (Gutter): {leftMargin}pt
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="144"
                    value={leftMargin}
                    onChange={(e) => setLeftMargin(parseInt(e.target.value, 10))}
                    className="w-full accent-sky-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">
                    Right Margin: {rightMargin}pt
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="144"
                    value={rightMargin}
                    onChange={(e) => setRightMargin(parseInt(e.target.value, 10))}
                    className="w-full accent-sky-600"
                  />
                </div>
              </div>
            )}

            <p className="text-[11px] text-gray-400 dark:text-slate-500">
              Note: 72 points equals 1.0 inch (25.4 mm). 36 points equals 0.5 inch.
            </p>

            {/* Action Button */}
            <button
              onClick={addMargins}
              disabled={isProcessing}
              className="w-full py-4 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Maximize className="w-5 h-5" />
              {isProcessing ? 'Processing Margins...' : 'Add Margins & Save PDF'}
            </button>
          </div>

          {/* Live Canvas Preview (5 Cols) */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm flex flex-col items-center">
            <div className="flex items-center justify-between w-full mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 flex items-center gap-1.5">
                <Eye className="w-4 h-4" /> Live Margin Preview (Page 1)
              </span>
              <span className="text-[10px] text-sky-600 dark:text-sky-400 font-bold px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800">
                Interactive
              </span>
            </div>

            <div className="relative bg-gray-100 dark:bg-slate-950 p-4 rounded-xl shadow-inner border border-gray-200 dark:border-slate-800 flex items-center justify-center overflow-hidden min-h-[350px] w-full">
              {loadingPreview ? (
                <div className="flex flex-col items-center gap-2 text-gray-500">
                  <span className="text-xs">Rendering preview...</span>
                </div>
              ) : (
                <canvas
                  ref={previewCanvasRef}
                  className="max-w-full max-h-[500px] object-contain shadow-md rounded"
                />
              )}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-3 text-center">
              The blue dashed line represents the expanded page canvas boundary with extra margins.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
