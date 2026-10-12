import { useState, useRef, useEffect } from 'react';
import { Layers, Download, Loader2, Sparkles, CheckCircle2, Eye, Calendar, FileText, Settings, Sliders } from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

// Initialize pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export default function HeadersFooters() {
  useSEO(
    'Add Headers and Footers to PDF Online Free — Live Preview | PDF Media Suite',
    'Add custom headers, footers, page numbers, and dates to PDF documents online free. 6 independent slots, skip cover page, custom fonts, and live visual preview.'
  );

  usePageSEO(
    'Add Headers & Footers to PDF',
    'Insert running headers, footers, date stamps, and page numbers into PDF pages with live document preview and cover page exclusion.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  // 6 Slots
  const [headerLeft, setHeaderLeft] = useState('CONFIDENTIAL');
  const [headerCenter, setHeaderCenter] = useState('');
  const [headerRight, setHeaderRight] = useState('{date}');

  const [footerLeft, setFooterLeft] = useState('');
  const [footerCenter, setFooterCenter] = useState('Page {page} of {total}');
  const [footerRight, setFooterRight] = useState('');

  // Settings
  const [fontSize, setFontSize] = useState(10);
  const [fontColor, setFontColor] = useState('#475569');
  const [marginOffset, setMarginOffset] = useState(25); // points from edge
  const [skipFirstPage, setSkipFirstPage] = useState(false);
  const [startNumber, setStartNumber] = useState(1);

  // Live Canvas Preview
  const [pageThumbUrl, setPageThumbUrl] = useState<string | null>(null);
  const [previewW, setPreviewW] = useState(400);
  const [previewH, setPreviewH] = useState(550);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleDrop = async (files: File[]) => {
    if (files[0]) {
      const selected = files[0];
      setFile(selected);
      setResultUrl(null);
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

      const maxDim = 500;
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
      setPreviewW(scaledVp.width);
      setPreviewH(scaledVp.height);
      canvas.width = 0;
      canvas.height = 0;
    } catch (e) {
      console.error('Error rendering preview:', e);
    } finally {
      setLoadingPreview(false);
    }
  };

  const formatText = (text: string, pageNum: number, totalPages: number): string => {
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const fileName = file?.name.replace(/\.[^/.]+$/, '') || 'Document';
    return text
      .replace(/{page}/gi, String(pageNum))
      .replace(/{total}/gi, String(totalPages))
      .replace(/{date}/gi, dateStr)
      .replace(/{title}/gi, fileName);
  };

  // Draw live header/footer on preview canvas
  useEffect(() => {
    if (!pageThumbUrl || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bgImg = new Image();
    bgImg.onload = () => {
      canvas.width = previewW;
      canvas.height = previewH;
      ctx.drawImage(bgImg, 0, 0);

      // Check if page 1 is skipped
      if (skipFirstPage) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('(Cover Page — Headers & Footers Excluded)', previewW / 2, 40);
        return;
      }

      ctx.fillStyle = fontColor;
      ctx.font = `${fontSize}px Helvetica, Arial, sans-serif`;

      const scaleFactor = previewW / 595; // normalize scale
      const padX = 25 * scaleFactor;
      const topY = marginOffset * scaleFactor;
      const botY = previewH - marginOffset * scaleFactor;

      // Header Left
      if (headerLeft) {
        ctx.textAlign = 'left';
        ctx.fillText(formatText(headerLeft, 1, 1), padX, topY);
      }
      // Header Center
      if (headerCenter) {
        ctx.textAlign = 'center';
        ctx.fillText(formatText(headerCenter, 1, 1), previewW / 2, topY);
      }
      // Header Right
      if (headerRight) {
        ctx.textAlign = 'right';
        ctx.fillText(formatText(headerRight, 1, 1), previewW - padX, topY);
      }

      // Footer Left
      if (footerLeft) {
        ctx.textAlign = 'left';
        ctx.fillText(formatText(footerLeft, 1, 1), padX, botY);
      }
      // Footer Center
      if (footerCenter) {
        ctx.textAlign = 'center';
        ctx.fillText(formatText(footerCenter, 1, 1), previewW / 2, botY);
      }
      // Footer Right
      if (footerRight) {
        ctx.textAlign = 'right';
        ctx.fillText(formatText(footerRight, 1, 1), previewW - padX, botY);
      }
    };
    bgImg.src = pageThumbUrl;
  }, [pageThumbUrl, headerLeft, headerCenter, headerRight, footerLeft, footerCenter, footerRight, fontSize, fontColor, marginOffset, skipFirstPage, previewW, previewH]);

  const hexToRgb = (hex: string) => {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r
      ? { r: parseInt(r[1], 16) / 255, g: parseInt(r[2], 16) / 255, b: parseInt(r[3], 16) / 255 }
      : { r: 0.3, g: 0.35, b: 0.4 };
  };

  const handleProcess = async () => {
    if (!file) return;
    setBusy(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();
      const totalPages = pages.length;
      const { r, g, b } = hexToRgb(fontColor);

      pages.forEach((page, idx) => {
        if (skipFirstPage && idx === 0) return;

        const { width, height } = page.getSize();
        const pageNum = startNumber + idx - (skipFirstPage ? 1 : 0);
        const padX = 35;
        const topY = height - marginOffset;
        const botY = marginOffset;

        // Header Left
        if (headerLeft.trim()) {
          const text = formatText(headerLeft, pageNum, totalPages);
          page.drawText(text, { x: padX, y: topY, size: fontSize, font, color: rgb(r, g, b) });
        }
        // Header Center
        if (headerCenter.trim()) {
          const text = formatText(headerCenter, pageNum, totalPages);
          const tw = font.widthOfTextAtSize(text, fontSize);
          page.drawText(text, { x: (width - tw) / 2, y: topY, size: fontSize, font, color: rgb(r, g, b) });
        }
        // Header Right
        if (headerRight.trim()) {
          const text = formatText(headerRight, pageNum, totalPages);
          const tw = font.widthOfTextAtSize(text, fontSize);
          page.drawText(text, { x: width - tw - padX, y: topY, size: fontSize, font, color: rgb(r, g, b) });
        }

        // Footer Left
        if (footerLeft.trim()) {
          const text = formatText(footerLeft, pageNum, totalPages);
          page.drawText(text, { x: padX, y: botY, size: fontSize, font, color: rgb(r, g, b) });
        }
        // Footer Center
        if (footerCenter.trim()) {
          const text = formatText(footerCenter, pageNum, totalPages);
          const tw = font.widthOfTextAtSize(text, fontSize);
          page.drawText(text, { x: (width - tw) / 2, y: botY, size: fontSize, font, color: rgb(r, g, b) });
        }
        // Footer Right
        if (footerRight.trim()) {
          const text = formatText(footerRight, pageNum, totalPages);
          const tw = font.widthOfTextAtSize(text, fontSize);
          page.drawText(text, { x: width - tw - padX, y: botY, size: fontSize, font, color: rgb(r, g, b) });
        }
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      console.error(e);
      alert('Failed to apply headers/footers: ' + (e?.message || 'Unknown error'));
    } finally {
      setBusy(false);
    }
  };

  const insertVariable = (setter: React.Dispatch<React.SetStateAction<string>>, variable: string) => {
    setter((prev) => (prev ? `${prev} ${variable}` : variable));
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 text-xs font-bold tracking-widest uppercase mb-3 border border-teal-200 dark:border-teal-800">
          <Sparkles className="w-3.5 h-3.5" /> Professional Running Headers & Footers
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-3">
          Add Headers & Footers to PDF
        </h1>
        <p className="text-lg text-gray-600 dark:text-slate-400 max-w-2xl mx-auto">
          Add custom running headers, page numbers, title metadata, and dates with live document preview and cover page skip.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-4xl">
          <FileDropzone
            onDrop={handleDrop}
            multiple={false}
            accept={{ 'application/pdf': ['.pdf'] }}
            title="Select PDF file"
            subtitle="or drop document here to add headers & footers"
          />
        </div>
      ) : resultUrl ? (
        /* Results Screen */
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-8 text-center space-y-6">
          <div className="p-8 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-emerald-900 dark:text-emerald-200 mb-2">
              Headers & Footers Applied!
            </h3>
            <p className="text-sm text-emerald-700 dark:text-emerald-400 mb-6">
              Your document has been compiled with running headers and page numbers.
            </p>
            <a
              href={resultUrl}
              download={`headers_${file.name}`}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-bold rounded-xl shadow-lg transition-all"
            >
              <Download className="w-5 h-5" /> Download PDF Document
            </a>
          </div>

          <div className="flex justify-center gap-4">
            <button
              onClick={() => setResultUrl(null)}
              className="px-6 py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-xl transition-all"
            >
              Adjust Headers/Footers
            </button>
            <button
              onClick={() => {
                setFile(null);
                setResultUrl(null);
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
                <div className="w-10 h-10 bg-teal-100 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 rounded-xl flex items-center justify-center shrink-0">
                  <Layers className="w-5 h-5" />
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

            {/* Quick Variable Chips */}
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 block mb-2">
                Dynamic Variables (Click to copy text into slot)
              </span>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className="px-2.5 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-lg font-mono">
                  {'{page}'} = Page No
                </span>
                <span className="px-2.5 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-lg font-mono">
                  {'{total}'} = Total Pages
                </span>
                <span className="px-2.5 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-lg font-mono">
                  {'{date}'} = Today&apos;s Date
                </span>
                <span className="px-2.5 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-lg font-mono">
                  {'{title}'} = File Name
                </span>
              </div>
            </div>

            {/* Header Slots (Top 3) */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 block">
                Top Running Header (Left • Center • Right)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={headerLeft}
                  onChange={(e) => setHeaderLeft(e.target.value)}
                  placeholder="Header Left"
                  className="px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:border-teal-500"
                />
                <input
                  type="text"
                  value={headerCenter}
                  onChange={(e) => setHeaderCenter(e.target.value)}
                  placeholder="Header Center"
                  className="px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:border-teal-500 text-center"
                />
                <input
                  type="text"
                  value={headerRight}
                  onChange={(e) => setHeaderRight(e.target.value)}
                  placeholder="Header Right"
                  className="px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:border-teal-500 text-right"
                />
              </div>
            </div>

            {/* Footer Slots (Bottom 3) */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 block">
                Bottom Running Footer (Left • Center • Right)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={footerLeft}
                  onChange={(e) => setFooterLeft(e.target.value)}
                  placeholder="Footer Left"
                  className="px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:border-teal-500"
                />
                <input
                  type="text"
                  value={footerCenter}
                  onChange={(e) => setFooterCenter(e.target.value)}
                  placeholder="Footer Center"
                  className="px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:border-teal-500 text-center"
                />
                <input
                  type="text"
                  value={footerRight}
                  onChange={(e) => setFooterRight(e.target.value)}
                  placeholder="Footer Right"
                  className="px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:border-teal-500 text-right"
                />
              </div>
            </div>

            {/* Typography & Position Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">
                  Font Size ({fontSize}pt)
                </label>
                <input
                  type="range"
                  min="8"
                  max="16"
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                  className="w-full accent-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">
                  Margin Offset ({marginOffset}pt)
                </label>
                <input
                  type="range"
                  min="15"
                  max="50"
                  value={marginOffset}
                  onChange={(e) => setMarginOffset(parseInt(e.target.value, 10))}
                  className="w-full accent-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">
                  Text Color
                </label>
                <div className="flex items-center gap-2 p-1 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
                  <input
                    type="color"
                    value={fontColor}
                    onChange={(e) => setFontColor(e.target.value)}
                    className="w-7 h-7 rounded-lg cursor-pointer border-0 p-0 bg-transparent"
                  />
                  <span className="text-xs font-mono font-bold text-gray-700 dark:text-slate-300 uppercase">
                    {fontColor}
                  </span>
                </div>
              </div>
            </div>

            {/* Checkbox Options */}
            <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-gray-100 dark:border-slate-800 text-xs font-semibold">
              <label className="flex items-center gap-2 cursor-pointer text-gray-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={skipFirstPage}
                  onChange={(e) => setSkipFirstPage(e.target.checked)}
                  className="w-4 h-4 accent-teal-600 rounded"
                />
                Exclude First Page (Cover / Title Page)
              </label>

              <div className="flex items-center gap-2 text-gray-700 dark:text-slate-300">
                <span>Start Page #:</span>
                <input
                  type="number"
                  min="1"
                  value={startNumber}
                  onChange={(e) => setStartNumber(parseInt(e.target.value, 10) || 1)}
                  className="w-14 px-2 py-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-center font-bold"
                />
              </div>
            </div>

            {/* Action Button */}
            <button
              onClick={handleProcess}
              disabled={busy}
              className="w-full py-4 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Layers className="w-5 h-5" />}
              {busy ? 'Applying Headers & Footers...' : 'Apply Headers & Footers to PDF'}
            </button>
          </div>

          {/* Live Document Canvas Preview (5 Cols) */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm flex flex-col items-center">
            <div className="flex items-center justify-between w-full mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 flex items-center gap-1.5">
                <Eye className="w-4 h-4" /> Live Document Preview (Page 1)
              </span>
              <span className="text-[10px] text-teal-600 dark:text-teal-400 font-bold px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800">
                Real-Time
              </span>
            </div>

            <div className="relative bg-gray-100 dark:bg-slate-950 p-2 rounded-xl shadow-inner border border-gray-200 dark:border-slate-800 flex items-center justify-center overflow-hidden min-h-[350px] w-full">
              {loadingPreview ? (
                <div className="flex flex-col items-center gap-2 text-gray-500">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <span className="text-xs">Generating preview...</span>
                </div>
              ) : (
                <canvas
                  ref={previewCanvasRef}
                  className="max-w-full max-h-[500px] object-contain shadow-lg rounded"
                />
              )}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-3 text-center">
              Headers and footers will appear at these exact coordinates on your PDF.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
