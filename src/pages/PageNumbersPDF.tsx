import { useState, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Download, FileText, Hash, Check, CheckCircle2, Eye, RefreshCw } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';
import { useAutoRevokeUrl, toArrayBufferBytes } from '../lib/blobUrl';

type NumberPosition = 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left';
type NumberFormat = 'page-n-of-total' | 'n-of-total' | 'page-n' | 'just-n' | 'dash-n-dash';
type FontFamily = 'Helvetica' | 'TimesRoman' | 'Courier';

const POSITIONS: { id: NumberPosition; label: string; xAlign: 'left' | 'center' | 'right'; yAlign: 'top' | 'bottom' }[] = [
  { id: 'top-left', label: 'Top Left', xAlign: 'left', yAlign: 'top' },
  { id: 'top-center', label: 'Top Center', xAlign: 'center', yAlign: 'top' },
  { id: 'top-right', label: 'Top Right', xAlign: 'right', yAlign: 'top' },
  { id: 'bottom-left', label: 'Bottom Left', xAlign: 'left', yAlign: 'bottom' },
  { id: 'bottom-center', label: 'Bottom Center', xAlign: 'center', yAlign: 'bottom' },
  { id: 'bottom-right', label: 'Bottom Right', xAlign: 'right', yAlign: 'bottom' },
];

const FORMATS: { id: NumberFormat; label: string; preview: string }[] = [
  { id: 'page-n-of-total', label: 'Page X of Y', preview: 'Page 1 of 10' },
  { id: 'n-of-total', label: 'X of Y', preview: '1 of 10' },
  { id: 'page-n', label: 'Page X', preview: 'Page 1' },
  { id: 'just-n', label: 'Numbers only', preview: '1' },
  { id: 'dash-n-dash', label: 'Hyphenated', preview: '- 1 -' },
];

const COLOR_SWATCHES = [
  { name: 'Black', hex: '#000000', rgb: [0, 0, 0] as [number, number, number] },
  { name: 'Dark Gray', hex: '#4b5563', rgb: [0.29, 0.33, 0.39] as [number, number, number] },
  { name: 'Navy Blue', hex: '#1e3a8a', rgb: [0.12, 0.23, 0.54] as [number, number, number] },
  { name: 'Crimson', hex: '#991b1b', rgb: [0.60, 0.11, 0.11] as [number, number, number] },
];

export default function PageNumbersPDF() {
  useSEO('Add Page Numbers to PDF Online Free | PDF Media Suite', 'Number PDF pages online with live visual preview. 6 positions, custom numbering formats, cover page skip, font styling. Free & secure in browser.');
  usePageSEO('Add Page Numbers to PDF Online', 'Add page numbers into PDF documents with live interactive preview. Choose position, format (Page 1 of N, 1 of N), font size, color, and skip cover pages.');

  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);

  // Numbering settings
  const [position, setPosition] = useState<NumberPosition>('bottom-center');
  const [format, setFormat] = useState<NumberFormat>('page-n-of-total');
  const [startNumber, setStartNumber] = useState(1);
  const [skipFirstPage, setSkipFirstPage] = useState(false);
  const [fontSize, setFontSize] = useState(11);
  const [margin, setMargin] = useState(25);
  const [colorHex, setColorHex] = useState('#000000');
  const [fontFamily, setFontFamily] = useState<FontFamily>('Helvetica');

  // Preview & Processing state
  const [previewThumb, setPreviewThumb] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [numberedUrl, setNumberedUrl] = useState<string | null>(null);

  useAutoRevokeUrl(numberedUrl);
  const prefersReduced = useReducedMotion();

  const getFormattedText = (pageIdx: number, total: number) => {
    const num = pageIdx + startNumber;
    switch (format) {
      case 'page-n-of-total': return `Page ${num} of ${total}`;
      case 'n-of-total': return `${num} of ${total}`;
      case 'page-n': return `Page ${num}`;
      case 'just-n': return `${num}`;
      case 'dash-n-dash': return `- ${num} -`;
      default: return `${num}`;
    }
  };

  // Render live preview on Page 1 (or Page 2 if skipping cover)
  const renderPreview = useCallback(async (pdfFile: File) => {
    setLoadingPreview(true);
    try {
      const ab = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
      const previewPageNum = skipFirstPage && pdf.numPages > 1 ? 2 : 1;
      const page = await pdf.getPage(previewPageNum);
      const vp = page.getViewport({ scale: 0.7 });

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

      // Overlay the page number
      const displayPageNum = skipFirstPage && previewPageNum === 2 ? 1 : 0;
      const text = getFormattedText(displayPageNum, pdf.numPages);

      ctx.save();
      const scaledFontSize = (fontSize / 72) * vp.scale * 96;
      ctx.font = `${scaledFontSize}px ${fontFamily === 'Courier' ? 'Courier New' : fontFamily === 'TimesRoman' ? 'Times New Roman' : 'Arial'}`;
      ctx.fillStyle = colorHex;

      const padX = (margin / 72) * vp.scale * 96;
      const padY = (margin / 72) * vp.scale * 96;

      let tx = canvas.width / 2;
      let ty = canvas.height - padY;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (position.includes('left')) {
        tx = padX;
        ctx.textAlign = 'left';
      } else if (position.includes('right')) {
        tx = canvas.width - padX;
        ctx.textAlign = 'right';
      }

      if (position.includes('top')) {
        ty = padY;
      }

      // Draw subtle highlight box for preview visibility
      const textMetrics = ctx.measureText(text);
      const tw = textMetrics.width;
      const th = scaledFontSize;

      ctx.fillStyle = 'rgba(236, 72, 153, 0.15)'; // light pink indicator
      let boxX = tx - tw / 2 - 4;
      if (ctx.textAlign === 'left') boxX = tx - 4;
      if (ctx.textAlign === 'right') boxX = tx - tw - 4;
      ctx.fillRect(boxX, ty - th / 2 - 2, tw + 8, th + 4);

      // Draw actual text
      ctx.fillStyle = colorHex;
      ctx.fillText(text, tx, ty);
      ctx.restore();

      setPreviewThumb(canvas.toDataURL('image/jpeg', 0.85));
      canvas.width = 0; canvas.height = 0;
      page.cleanup();
    } catch (e) {
      console.error('Preview error:', e);
    } finally {
      setLoadingPreview(false);
    }
  }, [position, format, startNumber, skipFirstPage, fontSize, margin, colorHex, fontFamily]);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    const f = acceptedFiles[0];
    setFile(f);
    setNumberedUrl(null);
    try {
      const ab = await f.arrayBuffer();
      const pdf = await PDFDocument.load(ab);
      setPageCount(pdf.getPageCount());
    } catch { /* ignore */ }
    renderPreview(f);
  };

  useEffect(() => {
    if (file) {
      renderPreview(file);
    }
  }, [file, renderPreview]);

  const addPageNumbers = async () => {
    if (!file) return;
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);

      let standardFont = StandardFonts.Helvetica;
      if (fontFamily === 'TimesRoman') standardFont = StandardFonts.TimesRoman;
      if (fontFamily === 'Courier') standardFont = StandardFonts.Courier;
      const font = await pdfDoc.embedFont(standardFont);

      // Parse color hex
      const cleanHex = colorHex.replace('#', '');
      const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
      const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
      const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

      const pages = pdfDoc.getPages();
      const totalPages = pages.length;

      pages.forEach((page, idx) => {
        if (skipFirstPage && idx === 0) return; // skip cover page

        const effectiveIdx = skipFirstPage ? idx - 1 : idx;
        const text = getFormattedText(effectiveIdx, skipFirstPage ? totalPages - 1 : totalPages);
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const textHeight = font.heightAtSize(fontSize);

        let x = width / 2 - textWidth / 2;
        let y = margin;

        if (position.includes('left')) {
          x = margin;
        } else if (position.includes('right')) {
          x = width - margin - textWidth;
        }

        if (position.includes('top')) {
          y = height - margin - textHeight;
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
      const blob = new Blob([toArrayBufferBytes(pdfBytes)], { type: 'application/pdf' });
      setNumberedUrl(URL.createObjectURL(blob));
    } catch (error) {
      console.error('Error adding page numbers:', error);
      alert('An error occurred while adding page numbers.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Add Page Numbers to PDF"
      subtitle="Number PDF pages with live visual preview. Choose positions, formats, and skip cover pages."
      categoryLabel="PDF Pagination Studio"
      icon={Hash}
      microVariant="edit"
      tone="rose"
    >
      <div className="flex flex-col items-center w-full">

      <PearlStageSwitch
        stageKey={!file ? 'upload' : numberedUrl ? 'result' : 'configure'}
        className="w-full max-w-6xl"
      >
      {!file ? (
        <div className="w-full max-w-3xl mx-auto">
          <FileDropzone onDrop={handleDrop} multiple={false} title="Drop PDF here or click to select" />
        </div>
      ) : numberedUrl ? (
        /* Success Screen */
        <div className="w-full max-w-lg mx-auto pms-glass-panel rounded-3xl p-8 text-center">
          <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-500/12 via-white/75 to-teal-500/12 dark:from-emerald-950/50 dark:via-slate-900/80 dark:to-teal-950/40 border border-emerald-200/80 dark:border-emerald-800/60 mb-5">
            <motion.div
              initial={prefersReduced ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 24 }}
              className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/25"
            >
              <CheckCircle2 className="w-8 h-8" />
            </motion.div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-1">Page Numbers Added!</h3>
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-6 tabular-nums">
              <AnimatedNumber value={pageCount} /> pages numbered successfully.
            </p>
            <motion.a
              whileHover={prefersReduced ? undefined : { scale: 1.02 }}
              whileTap={prefersReduced ? undefined : { scale: 0.98 }}
              href={numberedUrl}
              download={`numbered_${file.name}`}
              className="pms-btn-primary relative overflow-hidden inline-flex items-center justify-center gap-2 w-full py-4 font-bold rounded-xl shadow-md"
            >
              <span className="pms-shimmer pointer-events-none" />
              <Download className="w-5 h-5" /> Download Numbered PDF
            </motion.a>
          </div>
          <button
            onClick={() => { setFile(null); setNumberedUrl(null); }}
            className="text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 font-semibold text-sm mt-1 transition-colors"
          >
            Number another PDF
          </button>
        </div>
      ) : (
        /* Interactive Workspace */
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Left: Controls (7 cols) */}
          <div className="relative overflow-hidden lg:col-span-7 pms-glass-panel rounded-3xl p-5 sm:p-6 space-y-5">
            <PearlScanOverlay active={isProcessing} label={`Numbering ${pageCount || ''} PDF pages...`} />

            {/* File info bar */}
            <div className="flex items-center gap-4 p-4 bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)]">
              <div className="w-12 h-12 bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] border border-[var(--pms-border)] rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-slate-100 truncate">{file.name}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 tabular-nums">{pageCount} total pages · {(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <button
                onClick={() => { setFile(null); setPreviewThumb(null); }}
                className="text-xs font-semibold text-gray-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 px-3 py-1.5 rounded-xl border border-[var(--pms-border)] bg-white/80 dark:bg-slate-800/80 hover:bg-[var(--pms-soft-rose)] transition-colors shrink-0"
              >
                Change
              </button>
            </div>

            {/* 1. Position Picker (6 positions) */}
            <div className="bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] p-5 space-y-3">
              <label className="block text-sm font-bold text-gray-800 dark:text-slate-200">
                Placement Position on Page
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {POSITIONS.map(p => {
                  const active = position === p.id;
                  return (
                  <button
                    key={p.id}
                    onClick={() => setPosition(p.id)}
                    className={`relative overflow-hidden p-3 rounded-xl border text-center transition-colors ${
                      active
                        ? 'border-[var(--pms-rose)] text-rose-950 dark:text-rose-100 font-bold shadow-xs'
                        : 'border-[var(--pms-border)] bg-white/70 dark:bg-slate-900/70 text-gray-600 dark:text-slate-300 hover:border-[var(--pms-border-strong)]'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="pagenum-pos-pill"
                        transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                        className="absolute inset-0 bg-[var(--pms-soft-rose)] pointer-events-none"
                      />
                    )}
                    <div className="relative z-10 text-xs">{p.label}</div>
                  </button>
                );
                })}
              </div>
            </div>

            {/* 2. Format selector */}
            <div className="bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] p-5 space-y-3">
              <label className="block text-sm font-bold text-gray-800 dark:text-slate-200">
                Numbering Format
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {FORMATS.map(f => {
                  const active = format === f.id;
                  return (
                  <button
                    key={f.id}
                    onClick={() => setFormat(f.id)}
                    className={`relative overflow-hidden p-3 rounded-xl border text-left transition-colors flex items-center justify-between ${
                      active
                        ? 'border-[var(--pms-rose)] text-rose-950 dark:text-rose-100 font-semibold shadow-xs'
                        : 'border-[var(--pms-border)] bg-white/70 dark:bg-slate-900/70 text-gray-600 dark:text-slate-300 hover:border-[var(--pms-border-strong)]'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="pagenum-fmt-pill"
                        transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                        className="absolute inset-0 bg-[var(--pms-soft-rose)] pointer-events-none"
                      />
                    )}
                    <div className="relative z-10">
                      <div className="text-xs font-semibold">{f.label}</div>
                      <div className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5 font-mono">{f.preview}</div>
                    </div>
                    {active && <Check className="relative z-10 w-4 h-4 text-[var(--pms-rose)] shrink-0" />}
                  </button>
                );
                })}
              </div>
            </div>

            {/* 3. Page range & Cover page options */}
            <div className="bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] p-5 space-y-4">
              <label className="block text-sm font-bold text-gray-800 dark:text-slate-200">
                Page Range & Cover Options
              </label>
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 bg-white/70 dark:bg-slate-800/60 border border-[var(--pms-border)] rounded-xl cursor-pointer hover:border-[var(--pms-border-strong)] transition-colors">
                  <input
                    type="checkbox"
                    checked={skipFirstPage}
                    onChange={e => setSkipFirstPage(e.target.checked)}
                    className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-semibold text-gray-800 dark:text-slate-200">Skip First Page (Cover Page)</span>
                    <p className="text-[11px] text-gray-500 dark:text-slate-400">Do not print number on the title/cover page</p>
                  </div>
                </label>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-medium text-gray-700 dark:text-slate-300">Start counting from number:</span>
                  <input
                    type="number"
                    min={1}
                    value={startNumber}
                    onChange={e => setStartNumber(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 px-3 py-1.5 bg-white/90 dark:bg-slate-800/80 border border-[var(--pms-border)] text-gray-900 dark:text-slate-100 rounded-xl text-xs font-mono text-center focus:ring-2 focus:ring-rose-500 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* 4. Font, Size, Color & Margin */}
            <div className="bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] p-5 space-y-4">
              <label className="block text-sm font-bold text-gray-800 dark:text-slate-200">
                Styling & Typography
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Font Size */}
                <div>
                  <div className="flex justify-between text-xs text-gray-600 dark:text-slate-400 mb-1">
                    <span>Font Size</span>
                    <span className="font-semibold">{fontSize} pt</span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={20}
                    value={fontSize}
                    onChange={e => setFontSize(Number(e.target.value))}
                    className="w-full accent-rose-600"
                  />
                </div>

                {/* Margin from edge */}
                <div>
                  <div className="flex justify-between text-xs text-gray-600 dark:text-slate-400 mb-1">
                    <span>Margin from Edge</span>
                    <span className="font-semibold">{margin} pt</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={60}
                    value={margin}
                    onChange={e => setMargin(Number(e.target.value))}
                    className="w-full accent-rose-600"
                  />
                </div>
              </div>

              {/* Font Family & Color */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[var(--pms-border)]">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">Font Style</label>
                  <select
                    value={fontFamily}
                    onChange={e => setFontFamily(e.target.value as FontFamily)}
                    className="w-full px-3 py-2 border border-[var(--pms-border)] rounded-xl text-xs bg-white/90 dark:bg-slate-800 text-gray-800 dark:text-slate-100 focus:ring-2 focus:ring-rose-500 outline-none"
                  >
                    <option value="Helvetica">Helvetica (Standard Clean)</option>
                    <option value="TimesRoman">Times New Roman (Formal)</option>
                    <option value="Courier">Courier (Monospace / Code)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">Color</label>
                  <div className="flex items-center gap-2">
                    {COLOR_SWATCHES.map(c => (
                      <button
                        key={c.hex}
                        onClick={() => setColorHex(c.hex)}
                        title={c.name}
                        className={`w-7 h-7 rounded-full border-2 transition-transform ${
                          colorHex === c.hex ? 'scale-110 border-rose-500 ring-2 ring-rose-200 dark:ring-rose-900/60' : 'border-gray-200 dark:border-slate-700'
                        }`}
                        style={{ backgroundColor: c.hex }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <motion.button
              whileHover={prefersReduced || isProcessing ? undefined : { scale: 1.01 }}
              whileTap={prefersReduced || isProcessing ? undefined : { scale: 0.99 }}
              onClick={addPageNumbers}
              disabled={isProcessing}
              className="pms-btn-primary relative overflow-hidden w-full py-4 text-base font-bold rounded-xl disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
            >
              <span className="pms-shimmer pointer-events-none" />
              {isProcessing ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" /> Numbering Pages...
                </>
              ) : (
                <>
                  <Hash className="w-5 h-5" /> Add Page Numbers to PDF
                </>
              )}
            </motion.button>
          </div>

          {/* Right: Live Interactive Canvas Preview (5 cols) */}
          <div className="lg:col-span-5 flex flex-col">
            <div className="pms-glass-panel rounded-3xl p-5 flex flex-col sticky top-24">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-700 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                  <Eye className="w-4 h-4 text-[var(--pms-rose)]" /> Live Page Preview
                </span>
                <span className="text-[11px] text-rose-700 dark:text-rose-200 font-semibold bg-[var(--pms-soft-rose)] border border-[var(--pms-border)] px-2.5 py-0.5 rounded-full">
                  {skipFirstPage ? 'Previewing Page 2' : 'Previewing Page 1'}
                </span>
              </div>

              {/* Canvas Preview Container - explicit white paper frame */}
              <div className="bg-white/60 dark:bg-slate-900/60 rounded-2xl border border-[var(--pms-border)] p-3 min-h-[460px] flex items-center justify-center relative overflow-hidden">
                {loadingPreview ? (
                  <div className="flex flex-col items-center gap-2 text-gray-500 dark:text-slate-400">
                    <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs">Updating preview...</span>
                  </div>
                ) : previewThumb ? (
                  <div className="relative bg-white shadow-md rounded-xl border border-gray-200 overflow-hidden max-h-[500px] p-1">
                    <img
                      src={previewThumb}
                      alt="Live Page Preview"
                      className="max-h-[480px] w-auto object-contain mx-auto"
                    />
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 dark:text-slate-500">Loading page preview...</div>
                )}
              </div>

              <p className="text-[11px] text-gray-500 dark:text-slate-400 text-center mt-3">
                Preview reflects live placement, font size, margin, and format.
              </p>
            </div>
          </div>
        </div>
      )}
      </PearlStageSwitch>
      </div>
    </ToolWorkspaceShell>
  );
}
