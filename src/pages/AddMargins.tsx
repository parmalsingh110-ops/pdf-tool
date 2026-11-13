import { useState, useRef, useEffect } from 'react';
import { Download, Loader2, Maximize, CheckCircle2, Eye } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { motion, useReducedMotion } from 'motion/react';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { PearlScanOverlay } from '../components/pearl/PearlMotion';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';

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

  useAutoRevokeUrl(marginedUrl);

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
  const prefersReduced = useReducedMotion();

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
      const blob = new Blob([toArrayBufferBytes(pdfBytes)], { type: 'application/pdf' });
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
    <ToolWorkspaceShell
      title="Add Margins & Padding to PDF"
      subtitle="Expand document edges with extra margins for binder hole punching, book binding, or teacher notes with live preview."
      categoryLabel="Document Layout Padding"
      icon={Maximize}
      microVariant="crop"
      tone="sky"
    >
      <div className="flex flex-col items-center justify-center max-w-7xl mx-auto w-full">

      {!file ? (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-4xl pms-glass-panel rounded-3xl p-4 sm:p-6"
        >
          <FileDropzone
            onDrop={handleDrop}
            multiple={false}
            accept={{ 'application/pdf': ['.pdf'] }}
            title="Select PDF file"
            subtitle="or drop document here to add margins"
          />
        </motion.div>
      ) : marginedUrl ? (
        /* Results View */
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, scale: 0.98, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-2xl pms-glass-panel rounded-3xl border border-emerald-200/80 dark:border-emerald-800/70 p-8 text-center space-y-6"
        >
          <div className="p-7 bg-[var(--pms-soft-mint)]/65 dark:bg-emerald-950/35 rounded-2xl border border-emerald-200/70 dark:border-emerald-800/60">
            <motion.div
              initial={prefersReduced ? false : { scale: 0.45, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 20 }}
              className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-200 dark:border-emerald-800"
            >
              <CheckCircle2 className="w-8 h-8" />
            </motion.div>
            <h3 className="text-2xl font-bold text-[var(--pms-ink)] mb-2">
              Margins Added Successfully!
            </h3>
            <p className="text-sm text-emerald-700 dark:text-emerald-400 mb-6 tabular-nums">
              New dimensions expanded with Top: {topMargin}pt • Bottom: {bottomMargin}pt • Left: {leftMargin}pt • Right: {rightMargin}pt.
            </p>
            <motion.a
              whileHover={prefersReduced ? undefined : { scale: 1.015 }}
              whileTap={prefersReduced ? undefined : { scale: 0.985 }}
              href={marginedUrl}
              download={`margined_${file.name}`}
              className="pms-btn-primary inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-bold rounded-2xl"
            >
              <Download className="w-5 h-5" /> Download Margined PDF
            </motion.a>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <motion.button
              whileHover={prefersReduced ? undefined : { scale: 1.015 }}
              whileTap={prefersReduced ? undefined : { scale: 0.985 }}
              onClick={() => setMarginedUrl(null)}
              className="px-6 py-3 bg-[var(--pms-pearl)] dark:bg-slate-800/90 hover:bg-[var(--pms-soft-lavender)] dark:hover:bg-slate-700 text-[var(--pms-ink)] font-semibold rounded-2xl border border-[var(--pms-border)] transition-colors text-sm"
            >
              Adjust Margin Sizes
            </motion.button>
            <motion.button
              whileHover={prefersReduced ? undefined : { scale: 1.015 }}
              whileTap={prefersReduced ? undefined : { scale: 0.985 }}
              onClick={() => {
                setFile(null);
                setMarginedUrl(null);
              }}
              className="px-6 py-3 bg-[var(--pms-pearl)] dark:bg-slate-800/90 hover:bg-[var(--pms-soft-lavender)] dark:hover:bg-slate-700 text-[var(--pms-ink)] font-semibold rounded-2xl border border-[var(--pms-border)] transition-colors text-sm"
            >
              Process Another PDF
            </motion.button>
          </div>
        </motion.div>
      ) : (
        /* Workspace */
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
        >
          {/* Controls Panel (7 Cols) */}
          <div className="lg:col-span-7 pms-glass-panel rounded-3xl p-6 sm:p-7 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-[var(--pms-border)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] rounded-xl flex items-center justify-center shrink-0">
                  <Maximize className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-[var(--pms-ink)] truncate max-w-xs">{file.name}</h3>
                  <p className="text-xs text-[var(--pms-muted)]">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              <button
                onClick={() => setFile(null)}
                className="text-xs font-semibold text-[var(--pms-muted)] hover:text-[var(--pms-ink)] transition-colors"
              >
                Change File
              </button>
            </div>

            {/* Paper Size / Resize Conversion */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--pms-subtle-text)]">
                  Resize Page Paper Size (Optional)
                </label>
                <span className="text-[11px] text-[var(--pms-muted)] font-mono">
                  Original: {Math.round(origW)}×{Math.round(origH)} pt
                </span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {[
                  { label: 'Custom', w: 0, h: 0 },
                  { label: 'A4', w: 595.28, h: 841.89 },
                  { label: 'Letter', w: 612, h: 792 },
                  { label: 'Legal', w: 612, h: 1008 },
                  { label: 'A3', w: 841.89, h: 1190.55 },
                  { label: 'A5', w: 419.53, h: 595.28 },
                ].map((paper) => (
                  <button
                    key={paper.label}
                    type="button"
                    onClick={() => {
                      if (paper.w > 0) {
                        const padX = Math.max(0, Math.round((paper.w - origW) / 2));
                        const padY = Math.max(0, Math.round((paper.h - origH) / 2));
                        setLeftMargin(padX);
                        setRightMargin(padX);
                        setTopMargin(padY);
                        setBottomMargin(padY);
                        setLinkAll(false);
                      }
                    }}
                    className="py-1.5 px-2 text-xs font-bold rounded-xl border border-[var(--pms-border)] bg-[var(--pms-pearl)]/70 dark:bg-slate-800/70 hover:border-[var(--pms-blue)] text-[var(--pms-ink)] transition-colors"
                  >
                    {paper.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[var(--pms-subtle-text)] mt-1.5">
                Click a standard size to automatically center content on A4, Letter, Legal, or A3.
              </p>
            </div>

            {/* Presets */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--pms-subtle-text)] mb-2">
                Standard Layout Presets
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p)}
                    className="p-3 text-xs rounded-2xl border border-[var(--pms-border)] bg-[var(--pms-pearl)]/60 dark:bg-slate-800/70 hover:border-[var(--pms-blue)] text-left transition-all"
                  >
                    <div className="font-bold text-[var(--pms-ink)] mb-0.5">{p.label}</div>
                    <div className="text-[11px] text-[var(--pms-muted)]">{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Link Margins Switch */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--pms-subtle-text)]">
                Directional Margins
              </span>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[var(--pms-blue)]">
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
                <div className="flex justify-between text-xs font-bold text-[var(--pms-ink)] mb-1.5 tabular-nums">
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
                  <label className="block text-xs font-bold text-[var(--pms-muted)] mb-1 tabular-nums">
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
                  <label className="block text-xs font-bold text-[var(--pms-muted)] mb-1 tabular-nums">
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
                  <label className="block text-xs font-bold text-[var(--pms-muted)] mb-1 tabular-nums">
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
                  <label className="block text-xs font-bold text-[var(--pms-muted)] mb-1 tabular-nums">
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

            <p className="text-[11px] text-[var(--pms-subtle-text)]">
              Note: 72 points equals 1.0 inch (25.4 mm). 36 points equals 0.5 inch.
            </p>

            {/* Action Button */}
            <motion.button
              whileHover={prefersReduced ? undefined : { scale: 1.01 }}
              whileTap={prefersReduced ? undefined : { scale: 0.99 }}
              onClick={addMargins}
              disabled={isProcessing}
              className="pms-btn-primary w-full py-4 font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Maximize className="w-5 h-5" />}
              {isProcessing ? 'Processing Margins…' : 'Add Margins & Save PDF'}
            </motion.button>
          </div>

          {/* Live Canvas Preview (5 Cols) */}
          <div className="lg:col-span-5 pms-glass-panel rounded-3xl p-6 flex flex-col items-center">
            <div className="flex items-center justify-between w-full mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] flex items-center gap-1.5">
                <Eye className="w-4 h-4" /> Live Margin Preview (Page 1)
              </span>
              <span className="text-[10px] text-[var(--pms-blue)] font-bold px-2.5 py-0.5 rounded-full bg-[var(--pms-soft-blue)] border border-[var(--pms-border)]">
                Interactive
              </span>
            </div>

            <div className="relative bg-[var(--pms-pearl)]/80 dark:bg-slate-950/75 p-4 rounded-2xl shadow-inner border border-[var(--pms-border)] flex items-center justify-center overflow-hidden min-h-[350px] w-full">
              <PearlScanOverlay
                active={isProcessing || loadingPreview}
                label={loadingPreview ? 'Rendering preview…' : 'Adding PDF margins…'}
              />

              {loadingPreview ? (
                <div className="flex flex-col items-center gap-2 text-[var(--pms-muted)]">
                  <Loader2 className="w-8 h-8 animate-spin text-[var(--pms-blue)]" />
                  <span className="text-xs font-medium">Rendering preview…</span>
                </div>
              ) : (
                <canvas
                  ref={previewCanvasRef}
                  className="max-w-full max-h-[500px] object-contain shadow-md rounded bg-white"
                />
              )}
            </div>
            <p className="text-[11px] text-[var(--pms-subtle-text)] mt-3 text-center">
              The blue dashed line represents the expanded page canvas boundary with extra margins.
            </p>
          </div>
        </motion.div>
      )}
      </div>
    </ToolWorkspaceShell>
  );
}
