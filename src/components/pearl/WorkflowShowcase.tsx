import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, useSpring, useReducedMotion } from 'motion/react';
import { ArrowRight, CheckCircle2, Cpu, FileSpreadsheet, FileText, Layers, ScanSearch, Sparkles } from 'lucide-react';

/**
 * Scroll-linked editorial workflow demonstration:
 * Source Input -> Browser WebAssembly / OCR Engine -> Clean Aligned Export.
 * Purely illustrative (no fabricated metrics, no scroll-jacking).
 */
export default function WorkflowShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  const smooth = useSpring(scrollYProgress, { stiffness: 110, damping: 24, mass: 0.5 });

  // Gentle scroll-linked 2.5D flatten & convergence as user scrolls into center of section
  const stageRotateX = useTransform(smooth, [0.08, 0.45, 0.85], [10, 0, -4]);
  const stageScale = useTransform(smooth, [0.08, 0.45, 0.85], [0.96, 1, 0.99]);
  const leftCardX = useTransform(smooth, [0.1, 0.48], [-18, 0]);
  const rightCardX = useTransform(smooth, [0.1, 0.48], [18, 0]);

  return (
    <section
      ref={containerRef}
      aria-labelledby="workflow-showcase-heading"
      className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20"
    >
      <div
        className="rounded-[2rem] border p-6 sm:p-10 lg:p-12 overflow-hidden relative"
        style={{
          backgroundColor: 'var(--pms-white)',
          borderColor: 'var(--pms-border)',
          boxShadow: 'var(--pms-shadow-card)',
        }}
      >
        {/* Soft Pearl Backdrop Glow inside Stage Card */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-80"
          style={{
            background:
              'radial-gradient(50% 60% at 15% 15%, var(--pms-soft-rose) 0%, transparent 70%), radial-gradient(45% 60% at 88% 82%, var(--pms-soft-blue) 0%, transparent 72%)',
          }}
        />

        {/* Header */}
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-end justify-between gap-5 mb-10">
          <div className="max-w-2xl">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider mb-3 border"
              style={{
                backgroundColor: 'var(--pms-soft-lavender)',
                color: 'var(--pms-violet)',
                borderColor: 'var(--pms-border)',
              }}
            >
              <Layers className="w-3.5 h-3.5" />
              Editorial Document Pipeline
            </span>
            <h2
              id="workflow-showcase-heading"
              className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight leading-tight"
              style={{ color: 'var(--pms-ink)' }}
            >
              From raw scan or multi-page PDF to{' '}
              <span className="pms-gradient-accent">print-ready clarity</span>
            </h2>
            <p className="mt-2.5 text-sm sm:text-base leading-relaxed" style={{ color: 'var(--pms-muted)' }}>
              Every workspace pairs crisp browser-side rendering with dedicated layout, OCR, and vector engines — no account wall or watermark clutter.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Link
              to="/edit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border transition-colors hover:opacity-90"
              style={{
                backgroundColor: 'var(--pms-lavender-surface)',
                borderColor: 'var(--pms-border-strong)',
                color: 'var(--pms-ink)',
              }}
            >
              Try PDF Editor
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              to="/searchable-pdf"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-colors pms-btn-primary"
            >
              Try Searchable OCR
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* 3-Stage Scroll-Linked Interactive Sheet Pipeline */}
        <motion.div
          style={
            prefersReduced
              ? undefined
              : {
                  rotateX: stageRotateX,
                  scale: stageScale,
                  transformPerspective: 1100,
                }
          }
          className="relative z-10 grid grid-cols-1 lg:grid-cols-11 gap-4 lg:gap-5 items-stretch"
        >
          {/* Stage 1: Input File */}
          <motion.div
            className="lg:col-span-3 rounded-2xl border p-5 flex flex-col justify-between"
            style={
              prefersReduced
                ? { backgroundColor: 'var(--pms-pearl)', borderColor: 'var(--pms-border)' }
                : { x: leftCardX, backgroundColor: 'var(--pms-pearl)', borderColor: 'var(--pms-border)' }
            }
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span
                  className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full"
                  style={{ backgroundColor: 'var(--pms-soft-rose)', color: 'var(--pms-rose)' }}
                >
                  01 · Source Input
                </span>
                <FileText className="w-4 h-4" style={{ color: 'var(--pms-rose)' }} />
              </div>
              <h3 className="text-sm font-bold mb-1.5" style={{ color: 'var(--pms-ink)' }}>
                Scanned Pages &amp; PDFs
              </h3>
              <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--pms-muted)' }}>
                Drop multi-page PDFs, camera scans, ID sheets, or Office documents directly into the stage.
              </p>
            </div>

            {/* Visual sheet preview */}
            <div
              className="rounded-xl border p-3 space-y-2"
              style={{ backgroundColor: 'var(--pms-white)', borderColor: 'var(--pms-border)' }}
            >
              <div className="flex items-center justify-between text-[10px] font-bold" style={{ color: 'var(--pms-muted)' }}>
                <span>Scan_Receipt.pdf</span>
                <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400">PDF / IMG</span>
              </div>
              <div className="space-y-1.5">
                <div className="h-2 w-4/5 rounded-full bg-slate-200/80 dark:bg-slate-700/70 -rotate-[0.6deg]" />
                <div className="h-2 w-full rounded-full bg-slate-200/70 dark:bg-slate-700/60" />
                <div className="h-2 w-3/5 rounded-full bg-slate-200/60 dark:bg-slate-700/50 rotate-[0.5deg]" />
              </div>
            </div>
          </motion.div>

          {/* Connector 1 */}
          <div className="hidden lg:flex lg:col-span-1 items-center justify-center relative">
            {!prefersReduced && (
              <motion.span
                aria-hidden="true"
                className="absolute w-12 h-[2px] rounded-full opacity-50"
                style={{ background: 'linear-gradient(90deg, var(--pms-rose), var(--pms-violet))' }}
                animate={{ opacity: [0.25, 0.75, 0.25] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
            <motion.div
              animate={prefersReduced ? undefined : { x: [0, 3, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              className="relative z-10 w-9 h-9 rounded-full border flex items-center justify-center"
              style={{
                backgroundColor: 'var(--pms-white)',
                borderColor: 'var(--pms-border-strong)',
                color: 'var(--pms-violet)',
                boxShadow: 'var(--pms-shadow-sm)',
              }}
            >
              <ArrowRight className="w-4 h-4" />
            </motion.div>
          </div>

          {/* Stage 2: Processing Engine */}
          <div
            className="lg:col-span-3 rounded-2xl border p-5 flex flex-col justify-between relative overflow-hidden"
            style={{
              backgroundColor: 'var(--pms-lavender-surface)',
              borderColor: 'var(--pms-border-strong)',
            }}
          >
            {!prefersReduced && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-1/2 pms-scan-bar opacity-40"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(124, 58, 237, 0.12), transparent)',
                }}
              />
            )}
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <span
                  className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full"
                  style={{ backgroundColor: 'var(--pms-white)', color: 'var(--pms-violet)' }}
                >
                  02 · Processing Core
                </span>
                <Cpu className="w-4 h-4" style={{ color: 'var(--pms-violet)' }} />
              </div>
              <h3 className="text-sm font-bold mb-1.5" style={{ color: 'var(--pms-ink)' }}>
                Local Wasm + OCR Engine
              </h3>
              <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--pms-muted)' }}>
                Font geometry matching, Devanagari + Latin text shaping, background cleanup &amp; page reflow.
              </p>
            </div>

            <div className="relative z-10 grid grid-cols-2 gap-2">
              <div
                className="rounded-xl border px-2.5 py-2 text-[11px] font-semibold flex items-center gap-1.5"
                style={{ backgroundColor: 'var(--pms-white)', borderColor: 'var(--pms-border)', color: 'var(--pms-ink)' }}
              >
                <ScanSearch className="w-3.5 h-3.5 text-[#7C3AED] shrink-0" />
                Span OCR
              </div>
              <div
                className="rounded-xl border px-2.5 py-2 text-[11px] font-semibold flex items-center gap-1.5"
                style={{ backgroundColor: 'var(--pms-white)', borderColor: 'var(--pms-border)', color: 'var(--pms-ink)' }}
              >
                <Sparkles className="w-3.5 h-3.5 text-[#E11D48] shrink-0" />
                Style Match
              </div>
            </div>
          </div>

          {/* Connector 2 */}
          <div className="hidden lg:flex lg:col-span-1 items-center justify-center relative">
            {!prefersReduced && (
              <motion.span
                aria-hidden="true"
                className="absolute w-12 h-[2px] rounded-full opacity-50"
                style={{ background: 'linear-gradient(90deg, var(--pms-violet), var(--pms-blue))' }}
                animate={{ opacity: [0.25, 0.75, 0.25] }}
                transition={{ duration: 2.4, delay: 0.6, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
            <motion.div
              animate={prefersReduced ? undefined : { x: [0, 3, 0] }}
              transition={{ duration: 2.2, delay: 0.6, repeat: Infinity, ease: 'easeInOut' }}
              className="relative z-10 w-9 h-9 rounded-full border flex items-center justify-center"
              style={{
                backgroundColor: 'var(--pms-white)',
                borderColor: 'var(--pms-border-strong)',
                color: 'var(--pms-blue)',
                boxShadow: 'var(--pms-shadow-sm)',
              }}
            >
              <ArrowRight className="w-4 h-4" />
            </motion.div>
          </div>

          {/* Stage 3: Clean Output */}
          <motion.div
            style={
              prefersReduced
                ? { backgroundColor: 'var(--pms-pearl)', borderColor: 'var(--pms-border)' }
                : { x: rightCardX, backgroundColor: 'var(--pms-pearl)', borderColor: 'var(--pms-border)' }
            }
            className="lg:col-span-3 rounded-2xl border p-5 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span
                  className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full"
                  style={{ backgroundColor: 'var(--pms-soft-mint)', color: '#047857' }}
                >
                  03 · Clean Export
                </span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-sm font-bold mb-1.5" style={{ color: 'var(--pms-ink)' }}>
                Aligned &amp; Ready to Print
              </h3>
              <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--pms-muted)' }}>
                Export clean PDF, editable DOCX, structured XLSX tables, or high-DPI images with zero watermarks.
              </p>
            </div>

            <div
              className="rounded-xl border p-3 flex items-center justify-between gap-2"
              style={{ backgroundColor: 'var(--pms-white)', borderColor: 'var(--pms-border)' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'var(--pms-soft-blue)', color: 'var(--pms-blue)' }}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold truncate" style={{ color: 'var(--pms-ink)' }}>
                    Clean_Export.pdf
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--pms-muted)' }}>
                    PDF · DOCX · XLSX · PNG
                  </p>
                </div>
              </div>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                style={{ backgroundColor: 'var(--pms-soft-mint)', color: '#047857' }}
              >
                Ready
              </span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
