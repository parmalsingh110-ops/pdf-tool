import { useState, useCallback, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { RotateCw, RotateCcw, Download, Check, CheckCircle2, RefreshCcw, Undo2, ZoomIn, X, CheckSquare, Square } from 'lucide-react';
import { PDFDocument, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { useToast } from '../components/Toast';
import { toArrayBufferBytes } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

interface PageInfo {
  index: number;
  url: string;
  rotation: number; // 0, 90, 180, 270
  selected: boolean;
}

export default function RotatePages() {
  useSEO('Rotate PDF Pages Online Free | PDF Media Suite', 'Rotate individual or all PDF pages clockwise or counter-clockwise (90°, 180°, 270°). Free, instant, private in your browser.');
  usePageSEO('Rotate PDF Pages Online', 'Rotate specific PDF pages or all pages at once. 90-degree clockwise, counter-clockwise, and 180-degree flips. High quality, private, no uploads.');

  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 });
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [zoomPage, setZoomPage] = useState<PageInfo | null>(null);

  const toast = useToast();
  const prefersReduced = useReducedMotion();

  // Cleanup blob URLs for pages and result on unmount
  useEffect(() => {
    return () => {
      pages.forEach(p => { try { URL.revokeObjectURL(p.url); } catch {} });
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, []);

  const handleDrop = useCallback(async (files: File[]) => {
    if (!files[0]) return;
    const f = files[0];
    setFile(f);
    setResultUrl(null);
    setPages([]);
    setLoading(true);

    try {
      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const total = pdf.numPages;
      setLoadingProgress({ current: 0, total });

      const items: PageInfo[] = [];
      for (let i = 1; i <= total; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 0.4 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(vp.width);
        canvas.height = Math.round(vp.height);
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
        items.push({
          index: i,
          url: canvas.toDataURL('image/jpeg', 0.75),
          rotation: 0,
          selected: false,
        });
        canvas.width = 0; canvas.height = 0;
        page.cleanup();
        setLoadingProgress({ current: i, total });
      }
      setPages(items);
    } catch (e: any) {
      console.error('Failed to load PDF pages:', e);
      toast.error(e?.message || 'Failed to load PDF.');
    } finally {
      setLoading(false);
    }
  }, []);

  const rotatePage = (idx: number, delta: number) => {
    setPages(prev => prev.map((p, i) => {
      if (i !== idx) return p;
      const nextRot = (p.rotation + delta + 360) % 360;
      return { ...p, rotation: nextRot };
    }));
  };

  const resetPage = (idx: number) => {
    setPages(prev => prev.map((p, i) => (i === idx ? { ...p, rotation: 0 } : p)));
  };

  const rotateAll = (delta: number) => {
    setPages(prev => prev.map(p => ({
      ...p,
      rotation: (p.rotation + delta + 360) % 360,
    })));
  };

  const rotateSelected = (delta: number) => {
    setPages(prev => prev.map(p => {
      if (!p.selected) return p;
      return { ...p, rotation: (p.rotation + delta + 360) % 360 };
    }));
  };

  const resetAll = () => {
    setPages(prev => prev.map(p => ({ ...p, rotation: 0 })));
  };

  const toggleSelect = (idx: number) => {
    setPages(prev => prev.map((p, i) => (i === idx ? { ...p, selected: !p.selected } : p)));
  };

  const selectAll = (val: boolean) => {
    setPages(prev => prev.map(p => ({ ...p, selected: val })));
  };

  const selectOdd = () => {
    setPages(prev => prev.map(p => ({ ...p, selected: p.index % 2 !== 0 })));
  };

  const selectEven = () => {
    setPages(prev => prev.map(p => ({ ...p, selected: p.index % 2 === 0 })));
  };

  const applyRotation = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const doc = await PDFDocument.load(buf);
      const pdfPages = doc.getPages();

      pages.forEach((pg, i) => {
        if (pg.rotation !== 0 && pdfPages[i]) {
          const currentAngle = pdfPages[i].getRotation().angle;
          pdfPages[i].setRotation(degrees((currentAngle + pg.rotation) % 360));
        }
      });

      const bytes = await doc.save();
      const blob = new Blob([toArrayBufferBytes(bytes)], { type: 'application/pdf' });
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultUrl(URL.createObjectURL(blob));
      toast.success(`Rotated ${pages.filter(p => p.rotation !== 0).length || pages.length} page(s) successfully!`);
    } catch (e: any) {
      console.error('Error saving rotated PDF:', e);
      toast.error(e?.message || 'Failed to rotate PDF.');
    } finally {
      setBusy(false);
    }
  };

  const changedCount = pages.filter(p => p.rotation !== 0).length;
  const selectedCount = pages.filter(p => p.selected).length;

  return (
    <ToolWorkspaceShell
      title="Rotate PDF Pages"
      subtitle="Rotate individual pages, selected ranges, or entire document 90° clockwise, counter-clockwise, or 180°."
      categoryLabel="PDF Page Orientation"
      icon={RotateCw}
      microVariant="edit"
      tone="sky"
    >
      <div className="flex flex-col items-center w-full">

      <PearlStageSwitch
        stageKey={!file ? 'upload' : loading ? 'loading' : resultUrl ? 'result' : 'configure'}
        className="w-full max-w-6xl"
      >
      {!file ? (
        <div className="w-full max-w-3xl mx-auto">
          <FileDropzone onDrop={handleDrop} multiple={false} title="Drop PDF here or click to select" />
        </div>
      ) : loading ? (
        <div className="relative overflow-hidden w-full max-w-md mx-auto pms-glass-panel p-8 rounded-3xl text-center space-y-4">
          <PearlScanOverlay active label={`Rendering page ${loadingProgress.current} of ${loadingProgress.total || '...'}...`} />
          <div className="w-12 h-12 border-3 border-sky-200 dark:border-sky-900 border-t-[var(--pms-blue)] rounded-full animate-spin mx-auto" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">Rendering Page Previews...</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400 tabular-nums">
            Page {loadingProgress.current} of {loadingProgress.total}
          </p>
          <div className="w-full bg-white/75 dark:bg-slate-800 rounded-full h-2 overflow-hidden border border-[var(--pms-border)]">
            <div
              className="bg-gradient-to-r from-sky-500 to-cyan-500 h-full transition-all duration-200"
              style={{ width: `${loadingProgress.total ? (loadingProgress.current / loadingProgress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      ) : resultUrl ? (
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
            <h3 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-1">Rotation Applied Successfully!</h3>
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-6 tabular-nums">
              <AnimatedNumber value={changedCount} /> page{changedCount !== 1 ? 's were' : ' was'} rotated.
            </p>
            <motion.a
              whileHover={prefersReduced ? undefined : { scale: 1.02 }}
              whileTap={prefersReduced ? undefined : { scale: 0.98 }}
              href={resultUrl}
              download={`rotated_${file.name}`}
              className="pms-btn-primary relative overflow-hidden inline-flex items-center justify-center gap-2 w-full py-4 font-bold rounded-xl shadow-md"
            >
              <span className="pms-shimmer pointer-events-none" />
              <Download className="w-5 h-5" /> Download Rotated PDF
            </motion.a>
          </div>
          <button
            onClick={() => { setFile(null); setPages([]); setResultUrl(null); }}
            className="text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 font-semibold text-sm mt-1 transition-colors"
          >
            Rotate another PDF
          </button>
        </div>
      ) : (
        /* Workspace */
        <div className="w-full space-y-5">

          {/* Action Toolbar */}
          <div className="relative overflow-hidden pms-glass-panel rounded-3xl p-4 sm:p-5 space-y-3">
            <PearlScanOverlay active={busy} label="Applying rotation transforms to PDF..." />
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Batch rotation buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mr-1">Rotate All:</span>
                <button
                  onClick={() => rotateAll(-90)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-[var(--pms-soft-blue)] text-sky-800 dark:text-sky-200 font-semibold rounded-xl text-xs hover:brightness-95 transition-all border border-[var(--pms-border)]"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Left 90°
                </button>
                <button
                  onClick={() => rotateAll(90)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-[var(--pms-soft-blue)] text-sky-800 dark:text-sky-200 font-semibold rounded-xl text-xs hover:brightness-95 transition-all border border-[var(--pms-border)]"
                >
                  <RotateCw className="w-3.5 h-3.5" /> Right 90°
                </button>
                <button
                  onClick={() => rotateAll(180)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-[var(--pms-soft-blue)] text-sky-800 dark:text-sky-200 font-semibold rounded-xl text-xs hover:brightness-95 transition-all border border-[var(--pms-border)]"
                >
                  <RefreshCcw className="w-3.5 h-3.5" /> 180° Flip
                </button>
                {changedCount > 0 && (
                  <button
                    onClick={resetAll}
                    className="inline-flex items-center gap-1 px-3 py-2 text-gray-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-xl text-xs hover:bg-[var(--pms-soft-rose)] transition-colors"
                  >
                    <Undo2 className="w-3.5 h-3.5" /> Reset All
                  </button>
                )}
              </div>

              {/* Status pill */}
              <div className="text-xs font-semibold px-3 py-1.5 bg-white/80 dark:bg-slate-800/80 text-gray-700 dark:text-slate-300 rounded-xl border border-[var(--pms-border)] tabular-nums">
                {changedCount > 0 ? (
                  <span className="text-[var(--pms-blue)] font-bold">{changedCount} of {pages.length} pages rotated</span>
                ) : (
                  <span>{pages.length} pages total</span>
                )}
              </div>
            </div>

            {/* Selection bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--pms-border)] text-xs">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 dark:text-slate-400 font-medium">Select:</span>
                <button onClick={() => selectAll(true)} className="px-2.5 py-1 text-gray-700 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-800 rounded-lg font-medium transition-colors">All</button>
                <button onClick={selectOdd} className="px-2.5 py-1 text-gray-700 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-800 rounded-lg font-medium transition-colors">Odd</button>
                <button onClick={selectEven} className="px-2.5 py-1 text-gray-700 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-800 rounded-lg font-medium transition-colors">Even</button>
                <button onClick={() => selectAll(false)} className="px-2.5 py-1 text-gray-500 dark:text-slate-400 hover:bg-white/80 dark:hover:bg-slate-800 rounded-lg transition-colors">Clear</button>
              </div>

              {selectedCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[var(--pms-violet)]">{selectedCount} selected:</span>
                  <button
                    onClick={() => rotateSelected(-90)}
                    className="px-2.5 py-1 bg-[var(--pms-soft-lavender)] text-purple-800 dark:text-purple-200 border border-[var(--pms-border)] font-semibold rounded-lg hover:brightness-95 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" /> Left
                  </button>
                  <button
                    onClick={() => rotateSelected(90)}
                    className="px-2.5 py-1 bg-[var(--pms-soft-lavender)] text-purple-800 dark:text-purple-200 border border-[var(--pms-border)] font-semibold rounded-lg hover:brightness-95 flex items-center gap-1"
                  >
                    <RotateCw className="w-3 h-3" /> Right
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Grid of Pages */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {pages.map((pg, i) => (
              <div
                key={pg.index}
                className={`relative group pms-glass-panel rounded-2xl border-2 transition-all p-3 hover:shadow-md flex flex-col items-center ${
                  pg.rotation !== 0
                    ? 'border-[var(--pms-blue)] ring-2 ring-sky-200/70 dark:ring-sky-900/50 bg-[var(--pms-soft-blue)]'
                    : pg.selected
                    ? 'border-[var(--pms-violet)] ring-2 ring-purple-200/70 dark:ring-purple-900/50'
                    : 'border-[var(--pms-border)] hover:border-[var(--pms-border-strong)]'
                }`}
              >
                {/* Select checkbox & badge header */}
                <div className="w-full flex items-center justify-between mb-2">
                  <button
                    onClick={() => toggleSelect(i)}
                    className="text-gray-400 dark:text-slate-500 hover:text-[var(--pms-violet)] transition-colors p-0.5"
                    title="Select page"
                  >
                    {pg.selected ? (
                      <CheckSquare className="w-4 h-4 text-[var(--pms-violet)]" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-300 dark:text-slate-600" />
                    )}
                  </button>

                  <span className="text-xs font-bold text-gray-700 dark:text-slate-200">#{pg.index}</span>

                  {pg.rotation !== 0 ? (
                    <span className="text-[10px] font-bold bg-[var(--pms-blue)] text-white px-1.5 py-0.5 rounded-full">
                      {pg.rotation}°
                    </span>
                  ) : (
                    <button
                      onClick={() => setZoomPage(pg)}
                      className="text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 p-0.5"
                      title="Enlarge preview"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Page preview - white paper frame */}
                <div
                  onClick={() => rotatePage(i, 90)}
                  className="w-full aspect-[3/4] bg-white rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden flex items-center justify-center cursor-pointer p-1 relative shadow-inner"
                  title="Click to rotate 90° clockwise"
                >
                  <img
                    src={pg.url}
                    alt={`Page ${pg.index}`}
                    className="max-w-full max-h-full object-contain transition-transform duration-300 rounded shadow-xs"
                    style={{ transform: `rotate(${pg.rotation}deg)` }}
                  />
                </div>

                {/* Action buttons on card */}
                <div className="w-full flex items-center justify-between gap-1 mt-2.5 pt-2 border-t border-[var(--pms-border)]">
                  <button
                    onClick={() => rotatePage(i, -90)}
                    className="p-1.5 text-gray-500 dark:text-slate-400 hover:text-[var(--pms-blue)] hover:bg-[var(--pms-soft-blue)] rounded-lg transition-colors"
                    title="Rotate left 90°"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  {pg.rotation !== 0 && (
                    <button
                      onClick={() => resetPage(i)}
                      className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 px-1"
                    >
                      Reset
                    </button>
                  )}
                  <button
                    onClick={() => rotatePage(i, 90)}
                    className="p-1.5 text-gray-500 dark:text-slate-400 hover:text-[var(--pms-blue)] hover:bg-[var(--pms-soft-blue)] rounded-lg transition-colors"
                    title="Rotate right 90°"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Save Bar */}
          <div className="sticky bottom-6 pms-glass-panel rounded-2xl shadow-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-slate-100">
                {changedCount === 0 ? 'Click any page or use toolbar to rotate' : `${changedCount} page${changedCount !== 1 ? 's' : ''} modified`}
              </p>
              <p className="text-xs text-gray-500 dark:text-slate-400">Preview reflects actual output orientation.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setFile(null); setPages([]); }}
                className="px-4 py-2.5 text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white text-sm font-semibold rounded-xl bg-white/75 dark:bg-slate-800/75 border border-[var(--pms-border)] transition-colors"
              >
                Cancel
              </button>
              <motion.button
                whileHover={prefersReduced || busy || changedCount === 0 ? undefined : { scale: 1.02 }}
                whileTap={prefersReduced || busy || changedCount === 0 ? undefined : { scale: 0.98 }}
                onClick={applyRotation}
                disabled={busy || changedCount === 0}
                className="pms-btn-primary relative overflow-hidden px-6 py-2.5 text-sm font-bold rounded-xl disabled:opacity-40 shadow-sm flex items-center gap-2"
              >
                <span className="pms-shimmer pointer-events-none" />
                {busy ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Save Rotated PDF
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </div>
      )}
      </PearlStageSwitch>

      {/* Zoom Modal */}
      {zoomPage && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setZoomPage(null)}>
          <div className="pms-glass-panel rounded-3xl p-5 max-w-lg w-full max-h-[90vh] flex flex-col items-center relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setZoomPage(null)} className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 dark:hover:text-slate-200 p-1 rounded-lg">
              <X className="w-5 h-5" />
            </button>
            <h3 className="font-bold text-gray-900 dark:text-slate-100 mb-3">Page {zoomPage.index} Preview</h3>
            <div className="flex-1 flex items-center justify-center p-3 max-h-[70vh] overflow-hidden bg-white rounded-2xl border border-gray-200 shadow-inner">
              <img
                src={zoomPage.url}
                alt={`Page ${zoomPage.index}`}
                className="max-h-[65vh] object-contain rounded-lg transition-transform duration-300"
                style={{ transform: `rotate(${zoomPage.rotation}deg)` }}
              />
            </div>
          </div>
        </div>
      )}
      </div>
    </ToolWorkspaceShell>
  );
}
