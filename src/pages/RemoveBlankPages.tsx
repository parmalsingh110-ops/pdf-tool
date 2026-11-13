import { useState, useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { FileX, Download, Loader2, CheckCircle2, Trash2, SlidersHorizontal } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useToast } from '../components/Toast';
import { useSEO } from '../hooks/useSEO';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';
import { useAutoRevokeUrl, toArrayBufferBytes } from '../lib/blobUrl';

interface PageAnalysis {
  pageNum: number;
  thumbUrl: string;
  whitePct: number;
  textCount: number;
}

export default function RemoveBlankPages() {
  useSEO(
    'Remove Blank Pages from PDF Online Free — Visual Detection | PDF Media Suite',
    'Detect and remove blank or near-blank pages from scanned PDFs online free. Review detected pages with visual thumbnails and custom sensitivity controls.'
  );

  usePageSEO(
    'Remove Blank Pages from PDF',
    'Auto-detect and remove blank pages from scanned PDFs. Review thumbnails, adjust sensitivity threshold, and manually protect pages before removal.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState<PageAnalysis[]>([]);
  const [threshold, setThreshold] = useState(99.0);
  const [manualOverrides, setManualOverrides] = useState<Record<number, boolean>>({}); // pageNum -> isMarkedForDeletion
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [removedCount, setRemovedCount] = useState(0);

  useAutoRevokeUrl(resultUrl);

  const toast = useToast();
  const prefersReduced = useReducedMotion();

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    const selected = files[0];
    setFile(selected);
    setResultUrl(null);
    setManualOverrides({});
    await analyzePdf(selected);
  };

  const analyzePdf = async (pdfFile: File) => {
    setAnalyzing(true);
    try {
      const pdfBuf = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuf) }).promise;
      const analyzed: PageAnalysis[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 0.4 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

        // Also check if text content exists
        const textContent = await page.getTextContent();
        const textCount = textContent.items.length;

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        let whitePixels = 0;
        const totalPixels = canvas.width * canvas.height;
        for (let j = 0; j < d.length; j += 4) {
          // Check for pure white or near-white background pixels
          if (d[j] >= 245 && d[j + 1] >= 245 && d[j + 2] >= 245) {
            whitePixels++;
          }
        }

        const whitePct = (whitePixels / totalPixels) * 100;
        const thumbUrl = canvas.toDataURL('image/jpeg', 0.8);

        analyzed.push({
          pageNum: i,
          thumbUrl,
          whitePct: parseFloat(whitePct.toFixed(2)),
          textCount,
        });

        canvas.width = 0;
        canvas.height = 0;
      }

      setPages(analyzed);
    } catch (e: any) {
      console.error('Failed to analyze PDF:', e);
      toast.error(e?.message || 'Failed to scan PDF');
    } finally {
      setAnalyzing(false);
    }
  };

  // Determine if a page is considered blank based on threshold & manual override
  const isPageMarkedForDeletion = (p: PageAnalysis): boolean => {
    if (manualOverrides[p.pageNum] !== undefined) {
      return manualOverrides[p.pageNum];
    }
    // Auto detection: high white % and little to no text
    return p.whitePct >= threshold && p.textCount < 5;
  };

  const togglePageStatus = (pageNum: number) => {
    const p = pages.find((pg) => pg.pageNum === pageNum);
    if (!p) return;
    const currentStatus = isPageMarkedForDeletion(p);
    setManualOverrides((prev) => ({
      ...prev,
      [pageNum]: !currentStatus,
    }));
  };

  const markAllDetectedAsDelete = () => {
    setManualOverrides({});
  };

  const keepAllPages = () => {
    const overrides: Record<number, boolean> = {};
    pages.forEach((p) => {
      overrides[p.pageNum] = false;
    });
    setManualOverrides(overrides);
  };

  const pagesToDelete = useMemo(() => {
    return pages.filter(isPageMarkedForDeletion);
  }, [pages, threshold, manualOverrides]);

  const pagesToKeep = useMemo(() => {
    return pages.filter((p) => !isPageMarkedForDeletion(p));
  }, [pages, threshold, manualOverrides]);

  const removeBlankPages = async () => {
    if (!file || pages.length === 0) return;

    if (pagesToKeep.length === 0) {
      toast.error('All pages are marked as blank. Please keep at least one page.');
      return;
    }

    if (pagesToDelete.length === 0) {
      toast.info('No pages are marked for removal.');
      return;
    }

    setBusy(true);
    try {
      const srcDoc = await PDFDocument.load(await file.arrayBuffer());
      const newDoc = await PDFDocument.create();

      const keepIndices = pagesToKeep.map((p) => p.pageNum - 1);
      const copied = await newDoc.copyPages(srcDoc, keepIndices);
      copied.forEach((p) => newDoc.addPage(p));

      const bytes = await newDoc.save();
      const blob = new Blob([toArrayBufferBytes(bytes)], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
      setRemovedCount(pagesToDelete.length);
      toast.success(`Removed ${pagesToDelete.length} blank page(s) successfully!`);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to remove blank pages.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Remove Blank Pages from PDF"
      subtitle="Scans and detects empty or near-white pages from documents. Review thumbnails before deleting to ensure zero accidental page loss."
      categoryLabel="Intelligent Blank Page Filter"
      icon={FileX}
      microVariant="split"
      tone="rose"
    >
      <div className="flex flex-col items-center justify-center max-w-7xl mx-auto w-full">

      <PearlStageSwitch
        stageKey={!file ? 'upload' : analyzing ? 'loading' : resultUrl ? 'result' : 'configure'}
        className="w-full max-w-6xl"
      >
      {!file ? (
        <div className="w-full max-w-4xl mx-auto">
          <FileDropzone
            onDrop={handleDrop}
            multiple={false}
            accept={{ 'application/pdf': ['.pdf'] }}
            title="Select PDF file to scan"
            subtitle="or drop PDF document here"
          />
        </div>
      ) : analyzing ? (
        <div className="relative overflow-hidden w-full max-w-2xl mx-auto pms-glass-panel rounded-3xl p-12 text-center">
          <PearlScanOverlay active label="Inspecting pixels and text density per page..." />
          <div className="w-14 h-14 border-4 border-[var(--pms-rose)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Analyzing Document Density...</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400">Inspecting each page for blank pixels, margin artifacts, and text</p>
        </div>
      ) : resultUrl ? (
        /* Results View */
        <div className="w-full max-w-2xl mx-auto pms-glass-panel rounded-3xl p-8 text-center space-y-6">
          <div className="p-8 rounded-2xl bg-gradient-to-br from-emerald-500/12 via-white/75 to-teal-500/12 dark:from-emerald-950/50 dark:via-slate-900/80 dark:to-teal-950/40 border border-emerald-200/80 dark:border-emerald-800/60">
            <motion.div
              initial={prefersReduced ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 24 }}
              className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/25"
            >
              <CheckCircle2 className="w-8 h-8" />
            </motion.div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Cleaned PDF Ready!
            </h3>
            <p className="text-sm text-gray-600 dark:text-slate-300 mb-6 tabular-nums">
              Removed <AnimatedNumber value={removedCount} /> blank page{removedCount !== 1 ? 's' : ''} • Remaining pages: <AnimatedNumber value={pages.length - removedCount} />
            </p>
            <motion.a
              whileHover={prefersReduced ? undefined : { scale: 1.02 }}
              whileTap={prefersReduced ? undefined : { scale: 0.98 }}
              href={resultUrl}
              download={`cleaned_${file.name}`}
              className="pms-btn-primary relative overflow-hidden inline-flex items-center justify-center gap-2 px-8 py-4 text-lg font-bold rounded-xl shadow-lg"
            >
              <span className="pms-shimmer pointer-events-none" />
              <Download className="w-5 h-5" /> Download Cleaned PDF
            </motion.a>
          </div>

          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => setResultUrl(null)}
              className="px-6 py-3 bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 border border-[var(--pms-border)] text-gray-700 dark:text-slate-200 font-semibold rounded-xl transition-all"
            >
              Adjust Selection
            </button>
            <button
              onClick={() => {
                setFile(null);
                setPages([]);
                setResultUrl(null);
              }}
              className="px-6 py-3 bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 border border-[var(--pms-border)] text-gray-700 dark:text-slate-200 font-semibold rounded-xl transition-all"
            >
              Process Another PDF
            </button>
          </div>
        </div>
      ) : (
        /* Workspace & Detection Review */
        <div className="w-full space-y-6">
          {/* Top Control Bar */}
          <div className="relative overflow-hidden pms-glass-panel rounded-3xl p-6">
            <PearlScanOverlay active={busy} label={`Removing ${pagesToDelete.length} blank page(s)...`} />
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-[var(--pms-border)]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] border border-[var(--pms-border)] rounded-xl flex items-center justify-center shrink-0">
                  <FileX className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate max-w-md">
                    {file.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400 tabular-nums">
                    {pages.length} total pages • <span className="text-[var(--pms-rose)] font-semibold">{pagesToDelete.length} blank detected</span> • {pagesToKeep.length} will be kept
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full lg:w-auto">
                <button
                  onClick={() => {
                    setFile(null);
                    setPages([]);
                  }}
                  className="px-4 py-2.5 text-sm font-semibold text-gray-600 dark:text-slate-300 bg-white/75 dark:bg-slate-800/75 hover:bg-white dark:hover:bg-slate-700 border border-[var(--pms-border)] rounded-xl transition-all"
                >
                  Cancel
                </button>
                <motion.button
                  whileHover={prefersReduced || busy || pagesToDelete.length === 0 ? undefined : { scale: 1.02 }}
                  whileTap={prefersReduced || busy || pagesToDelete.length === 0 ? undefined : { scale: 0.98 }}
                  onClick={removeBlankPages}
                  disabled={busy || pagesToDelete.length === 0}
                  className="pms-btn-primary relative overflow-hidden flex-1 lg:flex-initial inline-flex items-center justify-center gap-2 px-8 py-3 font-bold rounded-xl shadow-md disabled:opacity-50"
                >
                  <span className="pms-shimmer pointer-events-none" />
                  {busy ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" /> Removing...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-5 h-5" /> Remove {pagesToDelete.length} Blank Page{pagesToDelete.length !== 1 ? 's' : ''}
                    </>
                  )}
                </motion.button>
              </div>
            </div>

            {/* Threshold Slider & Quick Toggles */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 items-center">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-slate-300 flex items-center gap-2">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--pms-rose)]" /> Sensitivity Threshold: <span className="text-[var(--pms-rose)]">{threshold}% White</span>
                  </label>
                  <span className="text-xs text-gray-500 dark:text-slate-400">
                    {threshold >= 99.5 ? 'Very Strict (Only pure blank)' : threshold <= 96 ? 'Aggressive (Includes light marks)' : 'Balanced Standard'}
                  </span>
                </div>
                <input
                  type="range"
                  min="90"
                  max="99.9"
                  step="0.1"
                  value={threshold}
                  onChange={(e) => {
                    setThreshold(parseFloat(e.target.value));
                    setManualOverrides({});
                  }}
                  className="w-full h-2 bg-white/80 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-rose-600"
                />
                <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
                  Adjusting the slider automatically re-evaluates all pages in real-time.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={markAllDetectedAsDelete}
                  className="px-4 py-2 text-xs font-bold bg-[var(--pms-soft-rose)] hover:brightness-95 border border-[var(--pms-border)] text-rose-800 dark:text-rose-200 rounded-xl transition-all"
                >
                  Auto-Select Detected
                </button>
                <button
                  onClick={keepAllPages}
                  className="px-4 py-2 text-xs font-bold bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 border border-[var(--pms-border)] text-gray-700 dark:text-slate-200 rounded-xl transition-colors"
                >
                  Keep All Pages
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Review Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {pages.map((p) => {
              const isDeleting = isPageMarkedForDeletion(p);
              return (
                <div
                  key={p.pageNum}
                  onClick={() => togglePageStatus(p.pageNum)}
                  className={`relative group pms-glass-panel rounded-2xl border-2 transition-all cursor-pointer p-2.5 flex flex-col select-none hover:shadow-md ${
                    isDeleting
                      ? 'border-rose-500 bg-[var(--pms-soft-rose)]'
                      : 'border-emerald-500/60 hover:border-emerald-500'
                  }`}
                >
                  {/* Status Indicator */}
                  <div
                    className={`absolute top-3.5 right-3.5 px-2 py-0.5 rounded-full text-[10px] font-bold z-10 shadow-sm ${
                      isDeleting
                        ? 'bg-rose-600 text-white'
                        : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {isDeleting ? 'Delete' : 'Keep'}
                  </div>

                  {/* Page Number */}
                  <div className="absolute top-3.5 left-3.5 bg-slate-900/75 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-0.5 rounded z-10">
                    #{p.pageNum}
                  </div>

                  {/* Page Thumbnail - explicit white paper box */}
                  <div className="aspect-[1/1.35] bg-white rounded-xl overflow-hidden flex items-center justify-center p-2 mb-2 border border-gray-200 dark:border-slate-700 shadow-inner">
                    <img
                      src={p.thumbUrl}
                      alt={`Page ${p.pageNum}`}
                      className={`max-w-full max-h-full object-contain transition-opacity ${
                        isDeleting ? 'opacity-40 grayscale' : 'opacity-100'
                      }`}
                    />
                  </div>

                  {/* White Percentage Label */}
                  <div className="flex items-center justify-between px-1 text-[11px]">
                    <span className="text-gray-600 dark:text-slate-300 font-medium tabular-nums">
                      {p.whitePct}% white
                    </span>
                    <span className="text-[10px] text-gray-400">
                      Click to toggle
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </PearlStageSwitch>
      </div>
    </ToolWorkspaceShell>
  );
}
