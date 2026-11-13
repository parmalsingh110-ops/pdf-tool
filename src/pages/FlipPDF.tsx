import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Download,
  FileText,
  CheckCircle2,
  Eye,
  Loader2,
  FlipHorizontal,
  FlipVertical,
  RefreshCw,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

export default function FlipPDF() {
  useSEO(
    'Flip PDF Online Free — Mirror Pages Horizontally or Vertically | PDF Media Suite',
    'Mirror PDF pages horizontally or vertically online free. Ideal for iron-on T-shirt heat transfers, transparencies, blueprints, and inverted scans.'
  );

  usePageSEO(
    'Flip PDF — Mirror Pages Horizontally or Vertically',
    'Reflect and mirror PDF documents across the horizontal or vertical axis. Vector-perfect page flipping for transfer paper, printing transparencies, and mirrored documents.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [pageCount, setPageCount] = useState(0);

  // Settings
  const [flipMode, setFlipMode] = useState<'horizontal' | 'vertical' | 'both'>('horizontal');
  const [pageSelection, setPageSelection] = useState<'all' | 'custom'>('all');
  const [customRange, setCustomRange] = useState('');

  // Live preview
  const [previewPageNum, setPreviewPageNum] = useState<number>(1);
  const [previewOriginal, setPreviewOriginal] = useState<string | null>(null);

  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState('');

  useAutoRevokeUrl(resultUrl);
  const prefersReduced = useReducedMotion();

  const handleDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    const f = acceptedFiles[0];
    setFile(f);
    setResultUrl(null);
    setBusy(true);

    try {
      const ab = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
      setPageCount(pdf.numPages);
      setCustomRange(`1-${pdf.numPages}`);
      await renderPreviewPage(pdf, 1);
    } catch (e: any) {
      alert('Could not open PDF: ' + (e?.message || 'Invalid file'));
      setFile(null);
    } finally {
      setBusy(false);
    }
  };

  const renderPreviewPage = async (pdfDoc: pdfjsLib.PDFDocumentProxy, pageNum: number) => {
    setLoadingPreview(true);
    try {
      const page = await pdfDoc.getPage(pageNum);
      const vp = page.getViewport({ scale: 1 });
      const maxW = 400;
      const scale = Math.min(1.5, maxW / vp.width);
      const scaledVp = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = scaledVp.width;
      canvas.height = scaledVp.height;
      const ctx = canvas.getContext('2d')!;

      await page.render({ canvasContext: ctx, viewport: scaledVp, canvas }).promise;
      setPreviewOriginal(canvas.toDataURL('image/jpeg', 0.85));
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    } catch (err) {
      console.error('Preview error:', err);
    } finally {
      setLoadingPreview(false);
    }
  };

  const parseRanges = (str: string, max: number): number[] => {
    const pages = new Set<number>();
    const parts = str.split(',').map(p => p.trim());
    for (const part of parts) {
      if (part.includes('-')) {
        const [s, e] = part.split('-').map(Number);
        if (!isNaN(s) && !isNaN(e)) {
          for (let i = Math.max(1, s); i <= Math.min(max, e); i++) pages.add(i);
        }
      } else {
        const n = parseInt(part, 10);
        if (!isNaN(n) && n >= 1 && n <= max) pages.add(n);
      }
    }
    return Array.from(pages).sort((a, b) => a - b);
  };

  const processFlip = async () => {
    if (!file) return;
    setBusy(true);

    try {
      const ab = await file.arrayBuffer();
      const srcDoc = await PDFDocument.load(ab);
      const outDoc = await PDFDocument.create();
      const total = srcDoc.getPageCount();

      const pagesToFlip = new Set<number>(
        pageSelection === 'all'
          ? Array.from({ length: total }, (_, i) => i + 1)
          : parseRanges(customRange, total)
      );

      for (let i = 0; i < total; i++) {
        const pageNum = i + 1;
        const [embedded] = await outDoc.embedPages([srcDoc.getPage(i)]);
        const srcPage = srcDoc.getPage(i);
        const { width, height } = srcPage.getSize();

        const newPage = outDoc.addPage([width, height]);

        if (!pagesToFlip.has(pageNum)) {
          newPage.drawPage(embedded, { x: 0, y: 0, width, height });
          continue;
        }

        if (flipMode === 'horizontal') {
          newPage.drawPage(embedded, {
            x: width,
            y: 0,
            xScale: -1,
            yScale: 1,
          });
        } else if (flipMode === 'vertical') {
          newPage.drawPage(embedded, {
            x: 0,
            y: height,
            xScale: 1,
            yScale: -1,
          });
        } else {
          newPage.drawPage(embedded, {
            x: width,
            y: height,
            xScale: -1,
            yScale: -1,
          });
        }
      }

      const outBytes = toArrayBufferBytes(await outDoc.save());
      const blob = new Blob([outBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultName(`${file.name.replace(/\.pdf$/i, '')}_flipped_${flipMode}.pdf`);
    } catch (e: any) {
      console.error('Flip error:', e);
      alert('Error flipping PDF: ' + (e?.message || 'Unknown error'));
    } finally {
      setBusy(false);
    }
  };

  const stageKey = !file ? 'upload' : 'workspace';

  return (
    <ToolWorkspaceShell
      title="Flip PDF (Mirror Pages)"
      subtitle="Mirror PDF pages horizontally or vertically. Perfect for iron-on transfer paper, T-shirt printing, transparencies, and mirrored scans."
      categoryLabel="Mirror & Transfer Preparation"
      icon={FlipHorizontal}
      microVariant="edit"
      tone="violet"
      trustNote="100% vector matrix reflection · Preserves crisp selectable text"
    >
      <PearlStageSwitch stageKey={stageKey}>
        {!file ? (
          <div className="max-w-2xl mx-auto">
            <FileDropzone
              onDrop={handleDrop}
              accept={{ 'application/pdf': ['.pdf'] }}
              multiple={false}
              title="Upload PDF to Flip / Mirror"
              subtitle="Drop PDF to mirror horizontally or vertically"
            />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Control Panel */}
            <div className="relative pms-glass-panel rounded-3xl p-6 overflow-hidden">
              <PearlScanOverlay active={busy} label="Mirroring vector page transformation matrices…" />

              <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[var(--pms-border)]">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-3 rounded-xl bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] shrink-0">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 dark:text-white truncate">{file.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      <AnimatedNumber value={pageCount} /> page{pageCount > 1 ? 's' : ''} •{' '}
                      <AnimatedNumber value={file.size / (1024 * 1024)} decimals={2} suffix=" MB" />
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setFile(null);
                    setResultUrl(null);
                    setPreviewOriginal(null);
                  }}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-rose-600 bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] rounded-xl transition-colors cursor-pointer"
                >
                  Change File
                </button>
              </div>

              {/* Settings Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
                {/* 1. Mirror Mode */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">
                    Mirror Axis Mode
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      { id: 'horizontal', label: 'Horizontal (Left/Right)', icon: FlipHorizontal },
                      { id: 'vertical', label: 'Vertical (Upside-Down)', icon: FlipVertical },
                      { id: 'both', label: 'Both (Inverted)', icon: RefreshCw },
                    ].map(opt => {
                      const active = flipMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setFlipMode(opt.id as 'horizontal' | 'vertical' | 'both')}
                          className="relative flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border text-xs font-bold transition-colors cursor-pointer overflow-hidden"
                          style={{
                            borderColor: active ? 'var(--pms-violet)' : 'var(--pms-border)',
                            backgroundColor: active ? 'var(--pms-soft-lavender)' : 'var(--pms-white)',
                            color: active ? 'var(--pms-violet)' : 'var(--pms-ink)',
                          }}
                        >
                          {active && (
                            <motion.span
                              layoutId="flip-axis-pill"
                              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                              className="absolute inset-0 rounded-2xl ring-2 ring-violet-500/35 pointer-events-none"
                            />
                          )}
                          <opt.icon className="relative z-10 w-5 h-5" />
                          <span className="relative z-10 text-center leading-tight">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2.5">
                    {flipMode === 'horizontal'
                      ? 'Horizontal mirror: Perfect for T-shirt transfer printing and transparent overlays.'
                      : flipMode === 'vertical'
                      ? 'Vertical mirror: Flips pages top-to-bottom across horizontal axis.'
                      : 'Dual mirror: Reverses both horizontal and vertical axes.'}
                  </p>
                </div>

                {/* 2. Page Range */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">
                    Pages to Flip
                  </label>
                  <div className="p-4 rounded-2xl bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] space-y-3">
                    <div className="flex items-center gap-5">
                      <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                        <input
                          type="radio"
                          checked={pageSelection === 'all'}
                          onChange={() => setPageSelection('all')}
                          className="accent-violet-600"
                        />
                        All Pages (<AnimatedNumber value={pageCount} />)
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                        <input
                          type="radio"
                          checked={pageSelection === 'custom'}
                          onChange={() => setPageSelection('custom')}
                          className="accent-violet-600"
                        />
                        Custom Range
                      </label>
                    </div>
                    {pageSelection === 'custom' && (
                      <input
                        type="text"
                        value={customRange}
                        onChange={(e) => setCustomRange(e.target.value)}
                        placeholder="e.g. 1-3, 5, 8-10"
                        className="w-full px-3.5 py-2 text-xs border border-[var(--pms-border)] rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-400/50"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-6 pt-5 border-t border-[var(--pms-border)] flex justify-end">
                <motion.button
                  whileHover={prefersReduced || busy ? undefined : { scale: 1.015 }}
                  whileTap={prefersReduced || busy ? undefined : { scale: 0.985 }}
                  onClick={processFlip}
                  disabled={busy}
                  className="pms-btn-primary inline-flex items-center gap-2 px-7 py-3 rounded-2xl font-bold disabled:opacity-50 cursor-pointer"
                >
                  {busy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Mirroring PDF…
                    </>
                  ) : (
                    <>
                      <FlipHorizontal className="w-4 h-4" /> Flip &amp; Save PDF
                    </>
                  )}
                </motion.button>
              </div>
            </div>

            {/* Live Visual Before / After Preview */}
            <div className="relative pms-glass-panel rounded-3xl p-6 overflow-hidden">
              <PearlScanOverlay active={loadingPreview} label="Rendering page preview…" />

              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[var(--pms-violet)]" />
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    Before &amp; After Mirror Comparison (Page {previewPageNum})
                  </h4>
                </div>
                {pageCount > 1 && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Preview page:</span>
                    <select
                      value={previewPageNum}
                      onChange={async (e) => {
                        const num = Number(e.target.value);
                        setPreviewPageNum(num);
                        try {
                          const ab = await file.arrayBuffer();
                          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
                          await renderPreviewPage(pdf, num);
                        } catch (err) {
                          console.error('Failed to switch flip preview page:', err);
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-xl border border-[var(--pms-border)] bg-white/80 dark:bg-slate-900/80 text-slate-800 dark:text-slate-200 text-xs font-semibold"
                    >
                      {Array.from({ length: Math.min(pageCount, 30) }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          Page {n}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {previewOriginal ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  {/* Original - Crisp bg-white paper sheet */}
                  <div className="text-center">
                    <span className="inline-block px-3 py-0.5 rounded-full text-[11px] font-bold bg-white/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-[var(--pms-border)] mb-2.5">
                      Original Orientation
                    </span>
                    <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-md max-h-72 flex items-center justify-center bg-white p-2">
                      <img src={previewOriginal} alt="Original" className="max-h-68 object-contain" />
                    </div>
                  </div>

                  {/* Mirrored - Crisp bg-white paper sheet */}
                  <div className="text-center">
                    <span className="inline-block px-3 py-0.5 rounded-full text-[11px] font-bold bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] border border-[var(--pms-border)] mb-2.5">
                      Flipped Result ({flipMode})
                    </span>
                    <div className="border-2 border-violet-400 dark:border-violet-500 rounded-2xl overflow-hidden shadow-md max-h-72 flex items-center justify-center bg-white p-2">
                      <img
                        src={previewOriginal}
                        alt="Mirrored"
                        className="max-h-68 object-contain transition-transform duration-300"
                        style={{
                          transform:
                            flipMode === 'horizontal'
                              ? 'scaleX(-1)'
                              : flipMode === 'vertical'
                              ? 'scaleY(-1)'
                              : 'scale(-1, -1)',
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Rendering comparison…
                </div>
              )}
            </div>

            {/* Success Box */}
            <AnimatePresence initial={false}>
              {resultUrl && (
                <motion.div
                  initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReduced ? undefined : { opacity: 0 }}
                  className="pms-glass-panel p-7 rounded-3xl border border-emerald-200/80 dark:border-emerald-800/70 text-center space-y-4"
                >
                  <motion.div
                    initial={prefersReduced ? false : { scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 360, damping: 18 }}
                    className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto"
                  >
                    <CheckCircle2 className="w-8 h-8" />
                  </motion.div>
                  <div>
                    <h3 className="text-xl font-extrabold text-slate-900 dark:text-white mb-1">
                      PDF Flipped Successfully!
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Your PDF pages have been mirrored with 100% vector text preservation.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <motion.a
                      whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                      whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                      href={resultUrl}
                      download={resultName}
                      className="pms-btn-primary inline-flex items-center gap-2 px-7 py-3 rounded-2xl font-bold"
                    >
                      <Download className="w-4 h-4" /> Download Mirrored PDF
                    </motion.a>
                    <a
                      href={resultUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-semibold text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-slate-900/80 border border-[var(--pms-border)] hover:bg-white dark:hover:bg-slate-800 transition-colors"
                    >
                      <Eye className="w-4 h-4" /> Preview in Browser
                    </a>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </PearlStageSwitch>

      <ToolSEOSection
        toolName="Flip PDF (Mirror Pages)"
        headline="Mirror Pages Horizontally or Vertically"
        description="Free online tool to reflect PDF pages across the horizontal or vertical axis. Vector-perfect page flipping for transfer paper, printing transparencies, and mirrored documents."
        faqs={[
          {
            q: 'What is the difference between Rotate and Flip?',
            a: 'Rotate turns a page around its center by 90°, 180°, or 270°. Flip creates a mirror reflection (like looking in a mirror or printing on backwards transfer paper) so text appears backwards.',
          },
          {
            q: 'Will text remain selectable after flipping?',
            a: 'Yes! Unlike raster tools that convert pages to blurry images, our tool flips the underlying vector transformation matrix, preserving full PDF text structure.',
          },
        ]}
      />
    </ToolWorkspaceShell>
  );
}
