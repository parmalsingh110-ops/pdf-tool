import { useState, useRef, useEffect } from 'react';
import { Hash, Download, Loader2, Sparkles, CheckCircle2, Eye, Shield, Scale, FileText } from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

// Initialize pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Position = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

interface LegalPreset {
  label: string;
  prefix: string;
  padding: number;
  suffix?: string;
}

const LEGAL_PRESETS: LegalPreset[] = [
  { label: 'Litigation (CONF-000001)', prefix: 'CONF-', padding: 6 },
  { label: 'Court Exhibit (EXHIBIT-A-001)', prefix: 'EXHIBIT-A-', padding: 3 },
  { label: 'Plaintiff (PLTF-00001)', prefix: 'PLTF-', padding: 5 },
  { label: 'Defendant (DEFT-00001)', prefix: 'DEFT-', padding: 5 },
  { label: 'Audit Doc (DOC-00001)', prefix: 'DOC-', padding: 5 },
  { label: 'Simple (#0001)', prefix: '#', padding: 4 },
];

export default function BatesNumbering() {
  useSEO(
    'Bates Numbering Online Free — Legal Document Stamp | PDF Media Suite',
    'Apply standard Bates numbering to legal and corporate PDFs online free. Live document preview, customizable prefix/suffix, zero padding, and position controls.'
  );

  usePageSEO(
    'Add Bates Numbering',
    'Apply standard Bates numbering to litigation, legal exhibits, and business audit PDFs with live visual positioning preview and cover page exclusion.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [prefix, setPrefix] = useState('CONF-');
  const [suffix, setSuffix] = useState('');
  const [startNumber, setStartNumber] = useState(1);
  const [padding, setPadding] = useState(6);
  const [fontSize, setFontSize] = useState(10);
  const [fontColor, setFontColor] = useState('#0f172a');
  const [position, setPosition] = useState<Position>('bottom-right');
  const [skipFirstPage, setSkipFirstPage] = useState(false);
  const [marginOffset, setMarginOffset] = useState(25);

  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const currentSampleText = `${prefix}${String(startNumber).padStart(padding, '0')}${suffix}`;

  // Draw live bates number on preview canvas
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

      if (skipFirstPage) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('(Cover Page — Bates Number Excluded)', previewW / 2, 40);
        return;
      }

      ctx.fillStyle = fontColor;
      ctx.font = `bold ${fontSize}px Courier, monospace, Arial`;

      const scaleFactor = previewW / 595;
      const padX = marginOffset * scaleFactor;
      const topY = marginOffset * scaleFactor;
      const botY = previewH - marginOffset * scaleFactor;

      let drawX = previewW - padX;
      let drawY = botY;

      if (position === 'top-left') {
        ctx.textAlign = 'left';
        drawX = padX;
        drawY = topY;
      } else if (position === 'top-center') {
        ctx.textAlign = 'center';
        drawX = previewW / 2;
        drawY = topY;
      } else if (position === 'top-right') {
        ctx.textAlign = 'right';
        drawX = previewW - padX;
        drawY = topY;
      } else if (position === 'bottom-left') {
        ctx.textAlign = 'left';
        drawX = padX;
        drawY = botY;
      } else if (position === 'bottom-center') {
        ctx.textAlign = 'center';
        drawX = previewW / 2;
        drawY = botY;
      } else {
        // bottom-right
        ctx.textAlign = 'right';
        drawX = previewW - padX;
        drawY = botY;
      }

      ctx.fillText(currentSampleText, drawX, drawY);
    };
    bgImg.src = pageThumbUrl;
  }, [pageThumbUrl, currentSampleText, fontSize, fontColor, position, marginOffset, skipFirstPage, previewW, previewH]);

  const hexToRgb = (hex: string) => {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r
      ? { r: parseInt(r[1], 16) / 255, g: parseInt(r[2], 16) / 255, b: parseInt(r[3], 16) / 255 }
      : { r: 0.1, g: 0.1, b: 0.1 };
  };

  const handleProcess = async () => {
    if (!file) return;
    setBusy(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const font = await pdfDoc.embedFont(StandardFonts.CourierBold);
      const pages = pdfDoc.getPages();
      const { r, g, b } = hexToRgb(fontColor);

      let batesSeq = startNumber;

      pages.forEach((page, idx) => {
        if (skipFirstPage && idx === 0) return;

        const { width, height } = page.getSize();
        const text = `${prefix}${String(batesSeq).padStart(padding, '0')}${suffix}`;
        batesSeq++;

        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const padX = marginOffset;
        const topY = height - marginOffset;
        const botY = marginOffset;

        let x = width - textWidth - padX;
        let y = botY;

        switch (position) {
          case 'bottom-right':
            x = width - textWidth - padX;
            y = botY;
            break;
          case 'bottom-left':
            x = padX;
            y = botY;
            break;
          case 'bottom-center':
            x = (width - textWidth) / 2;
            y = botY;
            break;
          case 'top-right':
            x = width - textWidth - padX;
            y = topY;
            break;
          case 'top-left':
            x = padX;
            y = topY;
            break;
          case 'top-center':
            x = (width - textWidth) / 2;
            y = topY;
            break;
        }

        page.drawText(text, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(r, g, b),
        });
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      console.error(e);
      alert('Bates numbering failed: ' + (e?.message || 'Unknown error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold tracking-widest uppercase mb-3 border border-indigo-200 dark:border-indigo-800">
          <Scale className="w-3.5 h-3.5" /> Legal & Compliance Tool
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-3">
          Bates Numbering for PDFs
        </h1>
        <p className="text-lg text-gray-600 dark:text-slate-400 max-w-2xl mx-auto">
          Number court exhibits, litigation discovery, and audit documents sequentially with live positioning preview.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-4xl">
          <FileDropzone
            onDrop={handleDrop}
            multiple={false}
            accept={{ 'application/pdf': ['.pdf'] }}
            title="Select PDF file"
            subtitle="or drop legal document here for Bates numbering"
          />
        </div>
      ) : resultUrl ? (
        /* Results View */
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-8 text-center space-y-6">
          <div className="p-8 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-emerald-900 dark:text-emerald-200 mb-2">
              Bates Numbering Applied!
            </h3>
            <p className="text-sm text-emerald-700 dark:text-emerald-400 mb-6">
              Sequenced from {currentSampleText} onwards across document pages.
            </p>
            <a
              href={resultUrl}
              download={`bates_${file.name}`}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-bold rounded-xl shadow-lg transition-all"
            >
              <Download className="w-5 h-5" /> Download Numbered PDF
            </a>
          </div>

          <div className="flex justify-center gap-4">
            <button
              onClick={() => setResultUrl(null)}
              className="px-6 py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-xl transition-all"
            >
              Adjust Sequence & Position
            </button>
            <button
              onClick={() => {
                setFile(null);
                setResultUrl(null);
              }}
              className="px-6 py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-xl transition-all"
            >
              Number Another PDF
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
                <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center shrink-0">
                  <Hash className="w-5 h-5" />
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

            {/* Legal Presets */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2">
                Industry & Legal Presets
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {LEGAL_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => {
                      setPrefix(p.prefix);
                      setPadding(p.padding);
                      setSuffix(p.suffix || '');
                    }}
                    className={`p-2 text-xs font-semibold rounded-xl border text-left transition-all ${
                      prefix === p.prefix
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                        : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:border-gray-400'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Prefix, Number, Padding, Suffix */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">Prefix</label>
                <input
                  type="text"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. DOC-"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">Start #</label>
                <input
                  type="number"
                  min="0"
                  value={startNumber}
                  onChange={(e) => setStartNumber(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">Zero Padding</label>
                <input
                  type="number"
                  min="2"
                  max="10"
                  value={padding}
                  onChange={(e) => setPadding(parseInt(e.target.value, 10) || 4)}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">Suffix (Optional)</label>
                <input
                  type="text"
                  value={suffix}
                  onChange={(e) => setSuffix(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. -EXH"
                />
              </div>
            </div>

            {/* Position Matrix */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2">
                Stamp Location
              </label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['top-left', '↖ Top Left'],
                  ['top-center', '↑ Top Center'],
                  ['top-right', '↗ Top Right'],
                  ['bottom-left', '↙ Bottom Left'],
                  ['bottom-center', '↓ Bottom Center'],
                  ['bottom-right', '↘ Bottom Right'],
                ] as const).map(([pos, label]) => (
                  <button
                    key={pos}
                    onClick={() => setPosition(pos as Position)}
                    className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all ${
                      position === pos
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                        : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:border-indigo-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size & Margin Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">
                  Font Size ({fontSize}pt)
                </label>
                <input
                  type="range"
                  min="8"
                  max="18"
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                  className="w-full accent-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">
                  Edge Margin ({marginOffset}pt)
                </label>
                <input
                  type="range"
                  min="15"
                  max="50"
                  value={marginOffset}
                  onChange={(e) => setMarginOffset(parseInt(e.target.value, 10))}
                  className="w-full accent-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">
                  Color
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

            {/* Skip Cover Page Checkbox */}
            <div className="pt-2 border-t border-gray-100 dark:border-slate-800">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={skipFirstPage}
                  onChange={(e) => setSkipFirstPage(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 rounded"
                />
                Exclude First Page (Cover / Title Page)
              </label>
            </div>

            {/* Action Button */}
            <button
              onClick={handleProcess}
              disabled={busy}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Hash className="w-5 h-5" />}
              {busy ? 'Applying Bates Numbers...' : 'Apply Bates Numbers & Save PDF'}
            </button>
          </div>

          {/* Live Document Canvas Preview (5 Cols) */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm flex flex-col items-center">
            <div className="flex items-center justify-between w-full mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 flex items-center gap-1.5">
                <Eye className="w-4 h-4" /> Live Document Preview (Page 1)
              </span>
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 font-mono">
                {currentSampleText}
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
              Sample stamp: <strong className="font-mono text-gray-800 dark:text-slate-200">{currentSampleText}</strong>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
