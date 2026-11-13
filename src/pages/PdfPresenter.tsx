import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Presentation, ChevronLeft, ChevronRight, Maximize, X, Sparkles, ShieldCheck } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import PearlAuroraBackground from '../components/pearl/PearlAuroraBackground';
import ToolMicroPreview from '../components/pearl/ToolMicroPreview';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

export default function PdfPresenter() {
  useSEO('Pdf Presenter Online Free | PDF Media Suite', 'Free online Pdf Presenter tool. No signup or installation required.');

  usePageSEO('PDF Slide Presenter', 'Turn PDF pages into fullscreen slideshows. Free online PDF presentation tool — no PowerPoint needed.');
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    setFile(files[0]); setPages([]); setCurrentPage(0);
    setLoading(true);
    try {
      const buf = await files[0].arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const imgs: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 2.5 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
        imgs.push(canvas.toDataURL('image/jpeg', 0.9));
        canvas.width = 0; canvas.height = 0;
      }
      setPages(imgs);
    } catch (e: any) { alert(e?.message || 'Failed to load'); }
    finally { setLoading(false); }
  };

  const next = useCallback(() => setCurrentPage(p => Math.min(pages.length - 1, p + 1)), [pages.length]);
  const prev = useCallback(() => setCurrentPage(p => Math.max(0, p - 1)), []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pages.length === 0) return;
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
      else if (e.key === 'f' || e.key === 'F11') { e.preventDefault(); toggleFullscreen(); }
      else if (e.key === 'Escape' && isFullscreen) { document.exitFullscreen(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pages.length, next, prev, toggleFullscreen, isFullscreen]);

  if (!file || loading || pages.length === 0) {
    return (
      <ToolWorkspaceShell
        title="PDF Slide Presenter"
        subtitle="Turn PDF pages into a full-screen slideshow. No PowerPoint needed."
        categoryLabel="Fullscreen Slide Deck"
        icon={Presentation}
        microVariant="generic"
        tone="violet"
        trustNote="High-DPI 2.5× local rendering · Instant keyboard & fullscreen stage"
      >
        {!file ? (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="w-full max-w-3xl mx-auto"
          >
            <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
          </motion.div>
        ) : loading ? (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="relative max-w-md mx-auto pms-glass-panel rounded-3xl p-10 text-center space-y-4 overflow-hidden"
          >
            <PearlScanOverlay active={true} label="Rendering high-resolution presentation slides…" />
            <div className="w-12 h-12 rounded-2xl bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] flex items-center justify-center mx-auto">
              <div className="w-6 h-6 border-3 border-[var(--pms-violet)] border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="font-bold text-slate-900 dark:text-white">Rendering slides…</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{file.name}</p>
          </motion.div>
        ) : (
          <div className="max-w-md mx-auto pms-glass-panel rounded-3xl p-8 text-center space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">No slides could be rendered from this file.</p>
            <button
              onClick={() => { setFile(null); setPages([]); }}
              className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-sm cursor-pointer"
            >
              Open another PDF
            </button>
          </div>
        )}
      </ToolWorkspaceShell>
    );
  }

  return (
    <div
      className={isFullscreen ? '' : 'relative flex-1 min-h-[82vh] transition-colors'}
      style={isFullscreen ? undefined : { backgroundColor: 'var(--pms-pearl)', color: 'var(--pms-ink)' }}
    >
      {!isFullscreen && <PearlAuroraBackground mode="workspace" />}

      <div className={isFullscreen ? '' : 'relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10 pb-16'}>
        {!isFullscreen && (
          <motion.header
            initial={prefersReduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="text-center max-w-3xl mx-auto mb-6"
          >
            <div className="inline-flex items-center gap-2.5 mb-3">
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase border"
                style={{
                  backgroundColor: 'var(--pms-soft-lavender)',
                  color: 'var(--pms-violet)',
                  borderColor: 'var(--pms-border)',
                }}
              >
                <Sparkles className="w-3 h-3" />
                Fullscreen Slide Deck
              </span>
            </div>
            <div className="flex items-center justify-center gap-3.5 mb-2">
              <span
                className="w-11 h-11 rounded-2xl flex items-center justify-center border shrink-0"
                style={{
                  backgroundColor: 'var(--pms-white)',
                  borderColor: 'var(--pms-border)',
                  color: 'var(--pms-violet)',
                  boxShadow: 'var(--pms-shadow-sm)',
                }}
              >
                <Presentation className="w-5 h-5" />
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight" style={{ color: 'var(--pms-ink)' }}>
                PDF Slide Presenter
              </h1>
              <div className="hidden sm:block group">
                <ToolMicroPreview variant="generic" />
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--pms-muted)' }}>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="truncate max-w-sm">{file.name} · {pages.length} slides ready</span>
            </div>
          </motion.header>
        )}

        {/* Active Presenter Container (ref stays stably mounted across fullscreen toggle) */}
        <div
          ref={containerRef}
          className={`w-full ${isFullscreen ? 'fixed inset-0 z-[9999] bg-slate-950 flex flex-col' : 'max-w-6xl mx-auto'}`}
        >
          {/* Frosted Glass Top Bar */}
          <div
            className={`pms-glass-header flex items-center justify-between gap-4 px-5 py-3 ${
              isFullscreen
                ? '!bg-slate-950/75 !border-white/10 text-white'
                : 'rounded-t-3xl border border-[var(--pms-border)] text-slate-800 dark:text-slate-100'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
                  isFullscreen
                    ? 'bg-white/10 border-white/15 text-white'
                    : 'bg-[var(--pms-soft-lavender)] border-[var(--pms-border)] text-[var(--pms-violet)]'
                }`}
              >
                Slide <AnimatedNumber value={currentPage + 1} /> / {pages.length}
              </span>
              {!isFullscreen && (
                <span className="hidden sm:inline text-xs font-medium text-slate-500 dark:text-slate-400 truncate max-w-xs">
                  {file.name}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <motion.button
                whileTap={prefersReduced ? undefined : { scale: 0.94 }}
                onClick={prev}
                disabled={currentPage === 0}
                className={`p-2 rounded-xl transition-colors disabled:opacity-30 cursor-pointer ${
                  isFullscreen ? 'hover:bg-white/15' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                aria-label="Previous slide"
              >
                <ChevronLeft className="w-5 h-5" />
              </motion.button>
              <motion.button
                whileTap={prefersReduced ? undefined : { scale: 0.94 }}
                onClick={next}
                disabled={currentPage >= pages.length - 1}
                className={`p-2 rounded-xl transition-colors disabled:opacity-30 cursor-pointer ${
                  isFullscreen ? 'hover:bg-white/15' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                aria-label="Next slide"
              >
                <ChevronRight className="w-5 h-5" />
              </motion.button>
              <motion.button
                whileHover={prefersReduced ? undefined : { scale: 1.03 }}
                whileTap={prefersReduced ? undefined : { scale: 0.96 }}
                onClick={toggleFullscreen}
                className={`ml-2 px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer ${
                  isFullscreen
                    ? 'bg-white/15 hover:bg-white/25 text-white border border-white/20'
                    : 'pms-btn-primary'
                }`}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                {isFullscreen ? (
                  <>
                    <X className="w-4 h-4" />
                    <span className="hidden sm:inline">Exit</span>
                  </>
                ) : (
                  <>
                    <Maximize className="w-4 h-4" />
                    <span className="hidden sm:inline">Fullscreen</span>
                  </>
                )}
              </motion.button>
            </div>
          </div>

          {/* Slide Stage */}
          <div
            className={`flex items-center justify-center overflow-hidden ${
              isFullscreen
                ? 'flex-1 p-4 sm:p-6 bg-slate-950'
                : 'bg-slate-900/95 rounded-b-3xl min-h-[60vh] p-4 sm:p-6 border-x border-b border-[var(--pms-border)] shadow-xl'
            }`}
            onClick={next}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.img
                key={currentPage}
                src={pages[currentPage]}
                alt={`Slide ${currentPage + 1}`}
                initial={prefersReduced ? false : { opacity: 0, scale: 0.985 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={prefersReduced ? undefined : { opacity: 0, scale: 0.985 }}
                transition={{ duration: 0.18 }}
                className={`${isFullscreen ? 'max-h-[88vh] max-w-full' : 'max-h-[65vh]'} object-contain select-none bg-white rounded-lg shadow-2xl`}
                draggable={false}
              />
            </AnimatePresence>
          </div>

          {/* Thumbnail strip */}
          {!isFullscreen && (
            <div className="mt-4 pms-glass-panel rounded-2xl p-3 flex gap-2.5 overflow-x-auto">
              {pages.map((p, i) => (
                <motion.button
                  key={i}
                  whileHover={prefersReduced ? undefined : { y: -2 }}
                  whileTap={prefersReduced ? undefined : { scale: 0.96 }}
                  onClick={() => setCurrentPage(i)}
                  className={`flex-shrink-0 w-20 aspect-[4/3] rounded-xl overflow-hidden border-2 transition-all cursor-pointer bg-white ${
                    i === currentPage
                      ? 'border-[var(--pms-violet)] ring-2 ring-violet-400/40 shadow-sm'
                      : 'border-[var(--pms-border)] opacity-65 hover:opacity-100'
                  }`}
                >
                  <img src={p} alt={`Thumbnail ${i + 1}`} className="w-full h-full object-cover" />
                </motion.button>
              ))}
            </div>
          )}

          {!isFullscreen && (
            <div className="mt-4 text-center space-y-2.5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ⌨️ Arrow keys / Space to navigate · F for fullscreen · Click slide to advance
              </p>
              <button
                onClick={() => { setFile(null); setPages([]); }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white/80 dark:bg-slate-800/80 border border-[var(--pms-border)] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                Open another PDF
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
