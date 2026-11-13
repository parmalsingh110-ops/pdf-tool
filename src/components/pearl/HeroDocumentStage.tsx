import { useRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { FileText, Image as ImageIcon, ScanText, CheckCircle2, Layers } from 'lucide-react';

/**
 * Original 2.5D/3D Editorial Document Atelier for PDF Media Suite Hero.
 * Features:
 *   - Luminous translucent pedestal + soft violet/rose ambient reflections
 *   - Layered document formats (PDF master sheet + Word/Table sheet + OCR/Image sheet)
 *   - Subtle desktop cursor perspective tilt (clamped ±5deg, never interferes with interactions)
 *   - Scroll-linked lift within hero bounds
 *   - Clean mobile-first responsive reorganization
 */
export default function HeroDocumentStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();

  // Gentle desktop pointer parallax
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const rotateY = useSpring(useTransform(rawX, [-0.5, 0.5], [-5, 5]), { stiffness: 140, damping: 20 });
  const rotateX = useSpring(useTransform(rawY, [-0.5, 0.5], [4, -4]), { stiffness: 140, damping: 20 });

  // Scroll-linked subtle separation over hero scroll range
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start'],
  });
  const stageLift = useTransform(scrollYProgress, [0, 1], [0, -28]);
  const backSheetX = useTransform(scrollYProgress, [0, 1], [0, -20]);
  const rightSheetX = useTransform(scrollYProgress, [0, 1], [0, 18]);
  const rightSheetY = useTransform(scrollYProgress, [0, 1], [0, -10]);
  const frontSheetY = useTransform(scrollYProgress, [0, 1], [0, -16]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (prefersReduced || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    rawX.set(nx);
    rawY.set(ny);
  };

  const handleMouseLeave = () => {
    rawX.set(0);
    rawY.set(0);
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative w-full max-w-[540px] mx-auto select-none"
      style={{ perspective: '1200px' }}
    >
      {/* Ambient Pedestal Halo */}
      <div
        aria-hidden="true"
        className="absolute -inset-6 rounded-[40px] opacity-80 dark:opacity-40 blur-2xl pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 35% 30%, rgba(255,228,237,0.85), transparent 55%), radial-gradient(circle at 75% 65%, rgba(225,245,255,0.85), transparent 60%), radial-gradient(circle at 50% 85%, rgba(238,231,255,0.9), transparent 65%)',
        }}
      />

      {/* Interactive Perspective Stage */}
      <motion.div
        initial={prefersReduced ? false : { opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        style={
          prefersReduced
            ? undefined
            : {
                rotateX,
                rotateY,
                y: stageLift,
                transformStyle: 'preserve-3d',
              }
        }
        className="relative rounded-[28px] p-4 sm:p-6 border backdrop-blur-xl will-change-transform"
        aria-label="Layered 3D preview of PDF, Word, Spreadsheet, OCR, and Image document tools"
      >
        <div
          className="dark:hidden absolute inset-0 rounded-[28px] -z-10 border"
          style={{
            background: 'linear-gradient(155deg, rgba(255,255,255,0.88) 0%, rgba(244,241,255,0.72) 100%)',
            borderColor: 'var(--pms-border)',
            boxShadow: 'var(--pms-shadow-float)',
          }}
        />
        <div
          className="hidden dark:block absolute inset-0 rounded-[28px] -z-10 border"
          style={{
            background: 'linear-gradient(155deg, rgba(24,24,48,0.88) 0%, rgba(16,16,34,0.82) 100%)',
            borderColor: 'var(--pms-border)',
          }}
        />

        {/* Delicate Orbital Path SVG */}
        <svg
          aria-hidden="true"
          viewBox="0 0 480 340"
          className="absolute inset-0 w-full h-full pointer-events-none opacity-55 dark:opacity-30"
          fill="none"
        >
          <ellipse
            cx="240"
            cy="178"
            rx="206"
            ry="120"
            transform="rotate(-11 240 178)"
            stroke="url(#pms-orbit-grad)"
            strokeWidth="1.2"
            strokeDasharray="4 6"
          />
          {!prefersReduced && (
            <g transform="rotate(-11 240 178)">
              <circle r="4" fill="#E11D48" opacity="0.85">
                <animateMotion
                  dur="14s"
                  repeatCount="indefinite"
                  path="M 446 178 A 206 120 0 1 1 34 178 A 206 120 0 1 1 446 178"
                />
              </circle>
              <circle r="3" fill="#0284C7" opacity="0.8">
                <animateMotion
                  dur="14s"
                  begin="-7s"
                  repeatCount="indefinite"
                  path="M 446 178 A 206 120 0 1 1 34 178 A 206 120 0 1 1 446 178"
                />
              </circle>
            </g>
          )}
          <defs>
            <linearGradient id="pms-orbit-grad" x1="0" y1="0" x2="480" y2="340" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#E11D48" stopOpacity="0.45" />
              <stop offset="50%" stopColor="#7C3AED" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#0284C7" stopOpacity="0.45" />
            </linearGradient>
          </defs>
        </svg>

        {/* Top Studio Header Bar */}
        <div className="flex items-center justify-between mb-4 sm:mb-5 px-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-violet-500/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500/75" />
            <span className="ml-1.5 text-[11px] font-bold tracking-wide text-slate-500 dark:text-slate-300">
              DOCUMENT ATELIER
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold">
            <span className="px-2 py-0.5 rounded-full bg-[#FFE4ED] text-[#BE123C] dark:bg-rose-950/60 dark:text-rose-300">
              PDF
            </span>
            <span className="px-2 py-0.5 rounded-full bg-[#E1F5FF] text-[#0369A1] dark:bg-sky-950/60 dark:text-sky-300">
              DOCX
            </span>
            <span className="px-2 py-0.5 rounded-full bg-[#DDF8EF] text-[#047857] dark:bg-emerald-950/60 dark:text-emerald-300">
              XLSX
            </span>
            <span className="px-2 py-0.5 rounded-full bg-[#EEE7FF] text-[#6D28D9] dark:bg-violet-950/60 dark:text-violet-300">
              IMG
            </span>
          </div>
        </div>

        {/* Layered 2.5D Document Stack */}
        <div className="relative h-[265px] sm:h-[300px] flex items-center justify-center" style={{ transformStyle: 'preserve-3d' }}>
          {/* Layer A (Left Back): Structured Office / Word & Table Preview Sheet */}
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, x: -24, rotate: -10 }}
            animate={{ opacity: 1, x: 0, rotate: -6 }}
            transition={{ duration: 0.65, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            style={
              prefersReduced
                ? undefined
                : { x: backSheetX, transform: 'translateZ(20px)' }
            }
            className="absolute left-1 sm:left-3 top-4 w-[58%] sm:w-[56%] rounded-2xl bg-white/95 dark:bg-slate-900/95 border border-[#E7E3F1] dark:border-slate-700 p-3.5 shadow-lg origin-bottom-left"
          >
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-lg bg-[#E1F5FF] text-[#0284C7] flex items-center justify-center">
                  <FileText className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] font-bold text-[#17172F] dark:text-white">DOCX · XLSX</span>
              </div>
              <span className="text-[9px] font-semibold text-slate-400">Layout Sync</span>
            </div>
            <div className="space-y-1.5">
              <div className="h-2 w-4/5 rounded-full bg-slate-200/85 dark:bg-slate-700" />
              <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800" />
              {/* Mini Table Grid */}
              <div className="mt-2 grid grid-cols-3 gap-1 p-1.5 rounded-lg bg-[#F4F1FF]/80 dark:bg-slate-800/70 border border-[#E7E3F1] dark:border-slate-700">
                <div className="h-2.5 rounded bg-sky-200/70 dark:bg-sky-900/60" />
                <div className="h-2.5 rounded bg-violet-200/60 dark:bg-violet-900/50" />
                <div className="h-2.5 rounded bg-emerald-200/70 dark:bg-emerald-900/50" />
                <div className="h-2 rounded bg-white dark:bg-slate-700" />
                <div className="h-2 rounded bg-white dark:bg-slate-700" />
                <div className="h-2 rounded bg-white dark:bg-slate-700" />
              </div>
            </div>
          </motion.div>

          {/* Layer B (Right Back): Image / Cutout & OCR Inspector Sheet */}
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, x: 24, rotate: 10 }}
            animate={{ opacity: 1, x: 0, rotate: 6 }}
            transition={{ duration: 0.65, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={
              prefersReduced
                ? undefined
                : { x: rightSheetX, y: rightSheetY, transform: 'translateZ(34px)' }
            }
            className="hidden sm:block absolute right-2 top-8 w-[46%] rounded-2xl bg-white/90 dark:bg-slate-900/90 border border-[#E7E3F1] dark:border-slate-700 p-3 shadow-lg origin-bottom-right"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-lg bg-[#DDF8EF] text-[#059669] flex items-center justify-center">
                  <ImageIcon className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] font-bold text-[#17172F] dark:text-white">IMG · PNG</span>
              </div>
              <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">Cutout</span>
            </div>
            <div className="h-20 rounded-xl pms-checkerboard border border-[#E7E3F1] dark:border-slate-700 flex items-center justify-center relative overflow-hidden">
              <div className="w-10 h-12 rounded-lg bg-gradient-to-br from-rose-400/90 via-violet-500/85 to-sky-500/90 shadow-md flex items-center justify-center text-white text-[10px] font-black">
                4K
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
              <ScanText className="w-3 h-3 text-violet-500" />
              <span>Hindi + English OCR</span>
            </div>
          </motion.div>

          {/* Layer C (Center Foreground Hero Sheet): Active PDF Vector Page */}
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 20, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
            style={
              prefersReduced
                ? undefined
                : { y: frontSheetY, transform: 'translateZ(64px)' }
            }
            className="relative z-10 w-[82%] sm:w-[68%] rounded-2xl bg-white dark:bg-slate-900 border border-[#D4CDE8] dark:border-slate-700 p-4 sm:p-5 shadow-2xl"
          >
            {/* Folded Pearl Corner + PDF Pill */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#E11D48] to-[#7C3AED] text-white flex items-center justify-center shadow-sm">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-[#17172F] dark:text-white leading-none">
                    Document_Master.pdf
                  </div>
                  <div className="text-[10px] font-medium text-[#5B647A] dark:text-slate-400 mt-1">
                    Vector · OCR · Bilingual
                  </div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFE4ED] text-[#E11D48] dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200/70 dark:border-rose-800/50">
                अ / A
              </span>
            </div>

            {/* Selection Box with 4 Editing Handles (Matches Direct Text Editor) */}
            <div className="relative rounded-xl border border-dashed border-[#7C3AED]/60 bg-[#F4F1FF]/55 dark:bg-violet-950/25 p-3 mb-3">
              <span className="absolute -top-1 -left-1 w-2 h-2 rounded-xs bg-white border border-[#7C3AED]" />
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-xs bg-white border border-[#7C3AED]" />
              <span className="absolute -bottom-1 -left-1 w-2 h-2 rounded-xs bg-white border border-[#7C3AED]" />
              <span className="absolute -bottom-1 -right-1 w-2 h-2 rounded-xs bg-white border border-[#7C3AED]" />

              <div className="flex items-center justify-between gap-2">
                <div className="space-y-1.5 flex-1">
                  <div className="h-2.5 w-3/4 rounded-full bg-[#17172F]/80 dark:bg-white/85" />
                  <div className="h-2 w-1/2 rounded-full bg-[#5B647A]/45 dark:bg-slate-400/45" />
                </div>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 text-[#7C3AED] dark:text-violet-300 border border-[#E7E3F1] dark:border-slate-700 shadow-xs">
                  Edit Match
                </span>
              </div>
            </div>

            {/* Bottom Vector Format Indicators */}
            <div className="flex items-center justify-between pt-1 border-t border-[#E7E3F1] dark:border-slate-800 text-[10px] font-semibold text-[#5B647A] dark:text-slate-400">
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-3 h-3" />
                Zero Watermark
              </span>
              <span className="inline-flex items-center gap-1">
                PPTX · PDF · PNG
              </span>
            </div>
          </motion.div>
        </div>

        {/* Luminous Pedestal Reflection Floor */}
        <div
          aria-hidden="true"
          className="mt-2 mx-auto w-[84%] h-4 rounded-full blur-md opacity-70 dark:opacity-35"
          style={{
            background:
              'linear-gradient(90deg, rgba(225,29,72,0.18) 0%, rgba(124,58,237,0.22) 50%, rgba(2,132,199,0.18) 100%)',
          }}
        />
      </motion.div>
    </div>
  );
}

