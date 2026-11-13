import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Copy, Loader2, Trash2, Download, ExternalLink, Eye, CheckCircle2, ShieldCheck, FileText, Sparkles } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';
import { useAutoRevokeUrl, toArrayBufferBytes } from '../lib/blobUrl';

interface PageInfo {
  index: number; // 1-based
  url: string;
  hash: string;
  isDuplicate: boolean;
  duplicateOf: number | null; // index of the original master
  markedForRemoval: boolean;
}

function hashCanvas(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d')!;
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let h = 0;
  for (let i = 0; i < d.length; i += 64) {
    h = ((h << 5) - h + d[i]) | 0;
  }
  return h.toString(36);
}

export default function DuplicatePages() {
  useSEO(
    'Find & Remove Duplicate PDF Pages Online Free | PDF Media Suite',
    'Free online duplicate PDF page finder. Visually detect identical pages, inspect side-by-side duplicates, and safely delete copies while keeping originals.'
  );

  usePageSEO(
    'Find & Remove Duplicate PDF Pages',
    'Detect duplicate and repeated pages in PDF documents with perceptual hashing. Side-by-side visual comparison and 1-click clean export.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  useAutoRevokeUrl(resultUrl);
  const [showPreview, setShowPreview] = useState(true);
  const prefersReduced = useReducedMotion();

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    const selected = files[0];
    setFile(selected);
    setResultUrl(null);
    setPages([]);
    setLoading(true);

    try {
      const buf = await selected.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const items: PageInfo[] = [];
      const hashMap = new Map<string, number>();

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 0.35 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;

        const h = hashCanvas(canvas);
        const url = canvas.toDataURL('image/jpeg', 0.6);
        const existing = hashMap.get(h);

        const isDup = existing !== undefined;
        items.push({
          index: i,
          url,
          hash: h,
          isDuplicate: isDup,
          duplicateOf: existing ?? null,
          markedForRemoval: isDup, // default remove duplicates
        });

        if (!hashMap.has(h)) {
          hashMap.set(h, i);
        }

        canvas.width = 0;
        canvas.height = 0;
      }

      setPages(items);
    } catch (e: any) {
      console.error('Scan failed:', e);
      alert(e?.message || 'Failed to scan PDF pages for duplicates.');
    } finally {
      setLoading(false);
    }
  };

  const toggleRemoval = (idx: number) => {
    setPages((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, markedForRemoval: !p.markedForRemoval } : p))
    );
  };

  const selectAllDuplicates = () => {
    setPages((prev) =>
      prev.map((p) => ({ ...p, markedForRemoval: p.isDuplicate }))
    );
  };

  const deselectAllDuplicates = () => {
    setPages((prev) =>
      prev.map((p) => ({ ...p, markedForRemoval: false }))
    );
  };

  const removeDuplicates = async () => {
    if (!file) return;
    setBusy(true);

    try {
      // Keep pages that are NOT marked for removal
      const pagesToKeep = pages.filter((p) => !p.markedForRemoval).map((p) => p.index - 1);
      if (pagesToKeep.length === 0) {
        alert('You cannot delete all pages in the document.');
        return;
      }

      const buf = await file.arrayBuffer();
      const src = await PDFDocument.load(buf, { ignoreEncryption: true });
      const doc = await PDFDocument.create();

      const copied = await doc.copyPages(src, pagesToKeep);
      copied.forEach((p) => doc.addPage(p));

      const bytes = await doc.save();
      const blob = new Blob([toArrayBufferBytes(bytes)], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      console.error('De-duplication failed:', e);
      alert(e?.message || 'Failed to clean duplicate pages.');
    } finally {
      setBusy(false);
    }
  };

  const resetAll = () => {
    setFile(null);
    setPages([]);
    setResultUrl(null);
  };

  const totalDuplicates = pages.filter((p) => p.isDuplicate).length;
  const markedCount = pages.filter((p) => p.markedForRemoval).length;
  const remainingCount = pages.length - markedCount;

  return (
    <ToolWorkspaceShell
      title="Find & Remove Duplicate PDF Pages"
      subtitle="Scan every page for visual clones and repeated scans. Review duplicate pairs side-by-side and prune redundant pages with 1 click."
      categoryLabel="Intelligent Page Deduplication"
      icon={Copy}
      microVariant="split"
      tone="rose"
    >
      <div className="flex flex-col items-center justify-center max-w-6xl mx-auto w-full">

      <PearlStageSwitch
        stageKey={!file ? 'upload' : loading ? 'loading' : !resultUrl ? 'configure' : 'result'}
        className="w-full"
      >
      {!file ? (
        <div className="w-full max-w-2xl mx-auto">
          <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF to Find Duplicates" />
        </div>
      ) : loading ? (
        <div className="relative overflow-hidden w-full max-w-2xl mx-auto pms-glass-panel rounded-3xl p-12 text-center space-y-4">
          <PearlScanOverlay active label="Computing perceptual pixel fingerprints..." />
          <Loader2 className="w-10 h-10 animate-spin text-[var(--pms-rose)] mx-auto" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Scanning Document for Duplicates...</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400">Computing perceptual pixel fingerprints across all pages</p>
        </div>
      ) : !resultUrl ? (
        <div className="relative overflow-hidden w-full pms-glass-panel rounded-3xl p-6 md:p-8 space-y-6">
          <PearlScanOverlay active={busy} label={`Removing ${markedCount} duplicate page(s)...`} />
          {/* Top Status Banner */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-5 bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)]">
            <div className="flex items-center gap-4 min-w-0 w-full md:w-auto">
              <div className="w-12 h-12 bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] border border-[var(--pms-border)] rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{file.name}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 tabular-nums">
                  {pages.length} total pages • Found <strong className="text-[var(--pms-rose)]">{totalDuplicates} duplicate page(s)</strong>
                </p>
              </div>
            </div>

            {totalDuplicates > 0 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllDuplicates}
                  className="px-3.5 py-1.5 bg-[var(--pms-soft-rose)] text-rose-800 dark:text-rose-200 border border-[var(--pms-border)] font-bold rounded-xl text-xs hover:brightness-95 transition-all"
                >
                  Select All Duplicates
                </button>
                <button
                  type="button"
                  onClick={deselectAllDuplicates}
                  className="px-3.5 py-1.5 bg-white/80 dark:bg-slate-800/80 border border-[var(--pms-border)] text-gray-700 dark:text-slate-200 font-semibold rounded-xl text-xs hover:bg-white dark:hover:bg-slate-700 transition-colors"
                >
                  Keep All
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-[var(--pms-soft-mint)] px-3.5 py-1.5 rounded-xl border border-emerald-300/60 dark:border-emerald-800">
                <ShieldCheck className="w-4 h-4" /> 100% Unique Pages — No Duplicates
              </div>
            )}
          </div>

          {/* Visual Grid of All Pages */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[var(--pms-rose)]" />
                Page Inventory & Duplicate Status
              </h3>
              <span className="text-xs text-gray-500 dark:text-slate-400">
                Red cards are marked for deletion
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 max-h-[440px] overflow-y-auto p-4 bg-white/55 dark:bg-slate-950/60 rounded-2xl border border-[var(--pms-border)] shadow-inner">
              {pages.map((p, i) => (
                <div
                  key={p.index}
                  onClick={() => p.isDuplicate && toggleRemoval(i)}
                  className={`group relative rounded-xl overflow-hidden border-2 transition-all p-1.5 bg-white/85 dark:bg-slate-900/85 flex flex-col ${
                    p.markedForRemoval
                      ? 'border-rose-500 ring-2 ring-rose-200/70 dark:ring-rose-900/60 shadow-md cursor-pointer'
                      : p.isDuplicate
                      ? 'border-amber-300 dark:border-amber-700 cursor-pointer'
                      : 'border-[var(--pms-border)]'
                  }`}
                >
                  <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-white border border-gray-200 flex items-center justify-center">
                    <img
                      src={p.url}
                      alt={`Page ${p.index}`}
                      className={`w-full h-full object-contain transition-opacity ${
                        p.markedForRemoval ? 'opacity-40 grayscale' : 'opacity-100'
                      }`}
                    />

                    {p.markedForRemoval && (
                      <div className="absolute inset-0 flex items-center justify-center bg-rose-950/40 backdrop-blur-2xs">
                        <Trash2 className="w-6 h-6 text-rose-500 animate-pulse" />
                      </div>
                    )}
                  </div>

                  <div className="mt-1.5 flex items-center justify-between text-[11px] px-1">
                    <span className="font-bold text-gray-700 dark:text-slate-300">P.{p.index}</span>
                    {p.isDuplicate ? (
                      <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${
                        p.markedForRemoval
                          ? 'bg-[var(--pms-soft-rose)] text-rose-700 dark:text-rose-300'
                          : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                      }`}>
                        {p.markedForRemoval ? 'Delete' : `Clone of P.${p.duplicateOf}`}
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-400">Master</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <motion.button
              whileHover={prefersReduced || busy || markedCount === 0 ? undefined : { scale: 1.01 }}
              whileTap={prefersReduced || busy || markedCount === 0 ? undefined : { scale: 0.99 }}
              onClick={removeDuplicates}
              disabled={busy || markedCount === 0}
              className="pms-btn-primary relative overflow-hidden flex-1 py-4 font-bold rounded-2xl shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 text-base"
            >
              <span className="pms-shimmer pointer-events-none" />
              {busy ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Pruning Duplicates...
                </>
              ) : (
                <>
                  <Trash2 className="w-5 h-5" />
                  {markedCount > 0
                    ? `Remove ${markedCount} Duplicate(s) & Export (${remainingCount} Pages)`
                    : 'No Duplicates Selected'}
                </>
              )}
            </motion.button>
            <button
              onClick={resetAll}
              disabled={busy}
              className="px-6 py-4 bg-white/80 hover:bg-white dark:bg-slate-800/80 dark:hover:bg-slate-700 border border-[var(--pms-border)] text-gray-700 dark:text-slate-200 font-semibold rounded-2xl transition-all text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* Success Screen with Live Preview */
        <div className="w-full max-w-4xl mx-auto pms-glass-panel rounded-3xl p-8 text-center space-y-6">
          <div className="p-8 rounded-3xl bg-gradient-to-br from-emerald-500/12 via-white/75 to-teal-500/12 dark:from-emerald-950/50 dark:via-slate-900/80 dark:to-teal-950/40 border border-emerald-200/80 dark:border-emerald-800/60">
            <motion.div
              initial={prefersReduced ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 24 }}
              className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/25"
            >
              <CheckCircle2 className="w-8 h-8" />
            </motion.div>
            <h3 className="text-2xl md:text-3xl font-extrabold text-gray-900 dark:text-white mb-2">
              Duplicates Removed Successfully!
            </h3>
            <p className="text-gray-600 dark:text-slate-300 mb-6 text-sm max-w-md mx-auto tabular-nums">
              Removed <AnimatedNumber value={markedCount} /> duplicate page(s). Your clean document now has <AnimatedNumber value={remainingCount} /> unique page(s).
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <motion.a
                whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                href={resultUrl}
                download={`deduped_${file.name}`}
                className="pms-btn-primary relative overflow-hidden inline-flex items-center justify-center gap-2 px-8 py-3.5 font-bold rounded-2xl shadow-md hover:shadow-lg text-base"
              >
                <span className="pms-shimmer pointer-events-none" />
                <Download className="w-5 h-5" />
                Download Clean PDF
              </motion.a>
              <a
                href={resultUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white/85 dark:bg-slate-800/85 hover:bg-white dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 font-semibold rounded-2xl border border-[var(--pms-border)] transition-all text-sm shadow-xs"
              >
                <ExternalLink className="w-4 h-4" />
                Open in New Tab
              </a>
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white/85 dark:bg-slate-800/85 hover:bg-white dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 font-semibold rounded-2xl border border-[var(--pms-border)] transition-all text-sm shadow-xs"
              >
                <Eye className="w-4 h-4" />
                {showPreview ? 'Hide Preview' : 'Show Live Preview'}
              </button>
            </div>

            {showPreview && (
              <div className="mt-6 text-left">
                <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Deduplicated PDF Output Preview
                </p>
                <div className="w-full h-[550px] rounded-2xl border border-[var(--pms-border)] overflow-hidden bg-white dark:bg-slate-950 shadow-inner">
                  <iframe
                    src={resultUrl}
                    title="Deduplicated PDF Preview"
                    className="w-full h-full border-0"
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={resetAll}
            className="text-sm text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white font-semibold"
          >
            ← Deduplicate another document
          </button>
        </div>
      )}
      </PearlStageSwitch>
      </div>
    </ToolWorkspaceShell>
  );
}
