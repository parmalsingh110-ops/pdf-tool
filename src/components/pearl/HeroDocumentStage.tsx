import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import {
  ArrowLeftRight,
  ArrowRight,
  Bold,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Italic,
  Layers,
  ScanText,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

type StudioMode = 'pdf' | 'docx' | 'xlsx' | 'img';

interface ModeConfig {
  id: StudioMode;
  pill: string;
  title: string;
  subtitle: string;
  accentHex: string;
  softBgClass: string;
  pillTextClass: string;
  popBadge: string;
  ctaLabel: string;
  ctaPath: string;
}

const STUDIO_MODES: ModeConfig[] = [
  {
    id: 'pdf',
    pill: 'PDF',
    title: 'Document_Master.pdf',
    subtitle: 'Vector · Bilingual · Fonts Synced',
    accentHex: '#E11D48',
    softBgClass: 'bg-[#FFE4ED] dark:bg-rose-950/60',
    pillTextClass: 'text-[#BE123C] dark:text-rose-300',
    popBadge: 'Direct Span Edit · अ / A',
    ctaLabel: 'Open PDF Editor',
    ctaPath: '/edit',
  },
  {
    id: 'docx',
    pill: 'DOCX',
    title: 'Agreement_Draft.docx',
    subtitle: 'Layout Sync · Margins & Styles',
    accentHex: '#0284C7',
    softBgClass: 'bg-[#E1F5FF] dark:bg-sky-950/60',
    pillTextClass: 'text-[#0369A1] dark:text-sky-300',
    popBadge: 'Bidirectional PDF ↔ Word',
    ctaLabel: 'Convert PDF to Word',
    ctaPath: '/pdf-to-word',
  },
  {
    id: 'xlsx',
    pill: 'XLSX',
    title: 'Financial_Q4.xlsx',
    subtitle: 'Grid Auto-Detect · Clean Columns',
    accentHex: '#059669',
    softBgClass: 'bg-[#DDF8EF] dark:bg-emerald-950/60',
    pillTextClass: 'text-[#047857] dark:text-emerald-300',
    popBadge: 'Structured Cell Detection',
    ctaLabel: 'Extract Tables',
    ctaPath: '/extract-tables',
  },
  {
    id: 'img',
    pill: 'IMG',
    title: 'Cutout_Scan_4K.png',
    subtitle: '4K Alpha Cutout · Hindi + Eng OCR',
    accentHex: '#7C3AED',
    softBgClass: 'bg-[#EEE7FF] dark:bg-violet-950/60',
    pillTextClass: 'text-[#6D28D9] dark:text-violet-300',
    popBadge: '4K Alpha · Live OCR Sweep',
    ctaLabel: 'Try BG Cutout',
    ctaPath: '/remove-background',
  },
];

const MODE_ORDER: StudioMode[] = ['pdf', 'docx', 'xlsx', 'img'];

const TABLE_SAMPLE_ROWS = [
  { item: 'GST Tax Summary', pages: '12p', format: 'XLSX Ready' },
  { item: 'Quarterly Ledger', pages: '36p', format: 'Grid Locked' },
  { item: 'Audit Schedule B', pages: '08p', format: 'Formulas OK' },
];

/**
 * Interactive 3D Editorial Document Atelier for PDF Media Suite Hero.
 * Combines:
 *   - Multi-plane Z-axis hardware 3D parallax + pointer specular glass glare
 *   - Magic UI-inspired Animated Gradient Beams + Border Beam perimeter sheen
 *   - Live switchable studio modes (PDF Edit / DOCX Sync / XLSX Grid / 4K Cutout & OCR)
 *   - Reduced-motion fallbacks & full Pearl Aurora light/dark support
 */
export default function HeroDocumentStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();
  const beamId = useId().replace(/:/g, '');

  const [activeMode, setActiveMode] = useState<StudioMode>('pdf');
  const [isHovered, setIsHovered] = useState(false);
  const [userLockedMode, setUserLockedMode] = useState(false);

  // Interactive states inside the live product previews
  const [pdfEdited, setPdfEdited] = useState(true);
  const [pdfBold, setPdfBold] = useState(true);
  const [pdfItalic, setPdfItalic] = useState(false);
  const [docxReverse, setDocxReverse] = useState(false);
  const [selectedRow, setSelectedRow] = useState(0);
  const [cutoutSplit, setCutoutSplit] = useState(56);

  // Smooth auto-cycle through showcase tabs unless hovered, manually selected, or reduced motion
  useEffect(() => {
    if (prefersReduced || isHovered || userLockedMode) return;
    const timer = window.setInterval(() => {
      setActiveMode((prev) => {
        const nextIdx = (MODE_ORDER.indexOf(prev) + 1) % MODE_ORDER.length;
        return MODE_ORDER[nextIdx];
      });
    }, 4600);
    return () => window.clearInterval(timer);
  }, [prefersReduced, isHovered, userLockedMode]);

  const handleSelectMode = (mode: StudioMode) => {
    setActiveMode(mode);
    setUserLockedMode(true);
  };

  // Multi-axis pointer 3D physics + specular cursor highlight
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const glareRawX = useMotionValue(260);
  const glareRawY = useMotionValue(170);

  const springCfg = { stiffness: 170, damping: 22, mass: 0.6 };
  const rotateY = useSpring(useTransform(rawX, [-0.5, 0.5], [-8.5, 8.5]), springCfg);
  const rotateX = useSpring(useTransform(rawY, [-0.5, 0.5], [6.5, -6.5]), springCfg);
  const glareX = useSpring(glareRawX, { stiffness: 210, damping: 28 });
  const glareY = useSpring(glareRawY, { stiffness: 210, damping: 28 });

  // Independent multi-plane parallax shifts per Z layer
  const backLeftMouseX = useSpring(useTransform(rawX, [-0.5, 0.5], [10, -10]), springCfg);
  const backLeftMouseY = useSpring(useTransform(rawY, [-0.5, 0.5], [7, -7]), springCfg);
  const backRightMouseX = useSpring(useTransform(rawX, [-0.5, 0.5], [-12, 12]), springCfg);
  const backRightMouseY = useSpring(useTransform(rawY, [-0.5, 0.5], [8, -8]), springCfg);
  const badgeFloatX = useSpring(useTransform(rawX, [-0.5, 0.5], [-14, 14]), springCfg);
  const badgeFloatY = useSpring(useTransform(rawY, [-0.5, 0.5], [-10, 10]), springCfg);

  const specularGlare = useMotionTemplate`radial-gradient(280px circle at ${glareX}px ${glareY}px, rgba(255,255,255,0.65), rgba(238,231,255,0.22) 45%, transparent 72%)`;
  const darkSpecularGlare = useMotionTemplate`radial-gradient(280px circle at ${glareX}px ${glareY}px, rgba(167,139,250,0.18), rgba(56,189,248,0.08) 45%, transparent 72%)`;

  // Subtle scroll-linked separation over hero scroll range
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start'],
  });
  const stageLift = useTransform(scrollYProgress, [0, 1], [0, -24]);
  const frontScrollY = useTransform(scrollYProgress, [0, 1], [0, -14]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (prefersReduced || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const lx = e.clientX - rect.left;
    const ly = e.clientY - rect.top;
    rawX.set(lx / rect.width - 0.5);
    rawY.set(ly / rect.height - 0.5);
    glareRawX.set(lx);
    glareRawY.set(ly);
  };

  const handleMouseEnter = () => setIsHovered(true);
  const handleMouseLeave = () => {
    setIsHovered(false);
    rawX.set(0);
    rawY.set(0);
  };

  const currentMode = STUDIO_MODES.find((m) => m.id === activeMode) ?? STUDIO_MODES[0];

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative w-full max-w-[560px] mx-auto select-none pt-3 pb-4"
      style={{ perspective: '1400px' }}
    >
      {/* Ambient Pearl Aurora Halo */}
      <div
        aria-hidden="true"
        className="absolute -inset-6 rounded-[44px] opacity-85 dark:opacity-45 blur-2xl pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 30% 25%, rgba(255,228,237,0.9), transparent 55%), radial-gradient(circle at 78% 65%, rgba(225,245,255,0.88), transparent 58%), radial-gradient(circle at 50% 85%, rgba(238,231,255,0.92), transparent 64%)',
        }}
      />

      {/* Outer 3D Perspective Stage */}
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
        className="relative rounded-[28px] p-4 sm:p-5 will-change-transform"
        aria-label="Interactive 3D Document Atelier previewing PDF Editor, Word Sync, Table Extraction, and 4K Cutout OCR"
      >
        {/* Light / Dark Frosted Glass Chassis + Subtle Paper Grid (backdrop-blur lives on sibling so preserve-3d stays active) */}
        <div
          className="dark:hidden absolute inset-0 rounded-[28px] -z-20 border backdrop-blur-xl overflow-hidden"
          style={{
            background: 'linear-gradient(155deg, rgba(255,255,255,0.9) 0%, rgba(244,241,255,0.76) 100%)',
            borderColor: 'var(--pms-border-strong)',
            boxShadow: 'var(--pms-shadow-float)',
          }}
        >
          <div className="absolute inset-0 pms-paper-grid opacity-55" />
        </div>
        <div
          className="hidden dark:block absolute inset-0 rounded-[28px] -z-20 border backdrop-blur-xl overflow-hidden"
          style={{
            background: 'linear-gradient(155deg, rgba(24,24,48,0.9) 0%, rgba(15,15,32,0.86) 100%)',
            borderColor: 'var(--pms-border-strong)',
            boxShadow: 'var(--pms-shadow-float)',
          }}
        >
          <div className="absolute inset-0 pms-paper-grid opacity-25" />
        </div>

        {/* Specular Cursor Glass Glare */}
        {!prefersReduced && (
          <>
            <motion.div
              aria-hidden="true"
              className="dark:hidden absolute inset-0 rounded-[28px] pointer-events-none -z-10 transition-opacity duration-300"
              style={{
                background: specularGlare,
                opacity: isHovered ? 0.9 : 0.35,
              }}
            />
            <motion.div
              aria-hidden="true"
              className="hidden dark:block absolute inset-0 rounded-[28px] pointer-events-none -z-10 transition-opacity duration-300"
              style={{
                background: darkSpecularGlare,
                opacity: isHovered ? 1 : 0.35,
              }}
            />
          </>
        )}

        {/* Magic UI Border Beam Perimeter Ring */}
        {!prefersReduced && (
          <div
            aria-hidden="true"
            className="pms-border-beam-ring absolute inset-0 rounded-[28px] pointer-events-none overflow-hidden transition-opacity duration-300"
            style={{ opacity: isHovered ? 0.92 : 0.45 }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 7.5, repeat: Infinity, ease: 'linear' }}
              className="absolute -inset-[65%]"
              style={{
                background:
                  'conic-gradient(from 0deg, transparent 68%, rgba(225,29,72,0.85) 78%, rgba(124,58,237,0.92) 88%, rgba(2,132,199,0.85) 97%, transparent 100%)',
              }}
            />
          </div>
        )}

        {/* Pop-Out Top-Right 3D Floating Trust Badge */}
        <motion.div
          style={
            prefersReduced
              ? undefined
              : {
                  x: badgeFloatX,
                  y: badgeFloatY,
                  z: 112,
                }
          }
          className="hidden sm:flex items-center gap-1.5 absolute -top-3.5 right-5 z-30 px-3 py-1.5 rounded-full border backdrop-blur-md shadow-lg bg-white/92 dark:bg-[#171732]/92 border-[#D4CDE8] dark:border-slate-700"
        >
          <span className="relative flex h-2 w-2">
            {!prefersReduced && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            )}
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <ShieldCheck className="w-3.5 h-3.5 text-[#0284C7]" />
          <span className="text-[10px] font-bold tracking-tight text-[#17172F] dark:text-slate-100">
            Browser WASM · 0 Watermark
          </span>
        </motion.div>

        {/* Top Studio Chrome Bar with Interactive Mode Pills */}
        <div
          className="relative z-20 flex flex-wrap items-center justify-between gap-2 mb-3.5 sm:mb-4 px-0.5"
          style={prefersReduced ? undefined : { transform: 'translateZ(26px)' }}
        >
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/85 shadow-xs" />
            <span className="w-2.5 h-2.5 rounded-full bg-violet-500/75 shadow-xs" />
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500/80 shadow-xs" />
            <span className="ml-1 text-[10.5px] sm:text-[11px] font-extrabold tracking-wider text-slate-600 dark:text-slate-300">
              DOCUMENT ATELIER
            </span>
          </div>

          <div
            role="tablist"
            aria-label="Document studio modes"
            className="flex items-center gap-1 p-1 rounded-full border bg-white/75 dark:bg-slate-900/75 border-[#E7E3F1] dark:border-slate-700/80 shadow-xs"
          >
            {STUDIO_MODES.map((m) => {
              const isActive = m.id === activeMode;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => handleSelectMode(m.id)}
                  className={`relative px-2.5 py-1 rounded-full text-[10px] font-extrabold transition-colors cursor-pointer ${
                    isActive
                      ? m.pillTextClass
                      : 'text-slate-500 hover:text-[#17172F] dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="atelier-tab-pill"
                      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                      className={`absolute inset-0 rounded-full -z-10 ${m.softBgClass} ring-1 ring-inset ring-black/5 dark:ring-white/10`}
                    />
                  )}
                  {m.pill}
                </button>
              );
            })}
          </div>
        </div>

        {/* Interactive Multi-Plane 3D Stack */}
        <div
          className="relative h-[306px] sm:h-[324px] flex items-center justify-center"
          style={prefersReduced ? undefined : { transformStyle: 'preserve-3d' }}
        >
          {/* Magic UI Animated Gradient Beams Connecting Input Sheets -> Active Center Studio */}
          <svg
            aria-hidden="true"
            viewBox="0 0 480 320"
            className="absolute inset-0 w-full h-full pointer-events-none"
            fill="none"
          >
            {/* Exposed Flank Connector Tracks */}
            <path
              d="M 28 86 Q 8 158 46 218"
              stroke="var(--pms-border-strong)"
              strokeWidth="1.4"
              strokeDasharray="4 5"
              opacity="0.75"
            />
            <path
              d="M 452 94 Q 472 162 434 220"
              stroke="var(--pms-border-strong)"
              strokeWidth="1.4"
              strokeDasharray="4 5"
              opacity="0.75"
            />
            <circle cx="46" cy="218" r="3" fill="#0284C7" opacity="0.75" />
            <circle cx="434" cy="220" r="3" fill="#7C3AED" opacity="0.75" />

            {/* Animated Signal Packets Flowing Along Flanks */}
            {!prefersReduced && (
              <>
                <path
                  d="M 28 86 Q 8 158 46 218"
                  stroke={`url(#beam-left-${beamId})`}
                  strokeWidth={activeMode === 'docx' || activeMode === 'xlsx' ? '2.8' : '2'}
                  strokeLinecap="round"
                  pathLength="100"
                  strokeDasharray="28 72"
                  opacity={activeMode === 'docx' || activeMode === 'xlsx' ? 1 : 0.65}
                >
                  <animate attributeName="stroke-dashoffset" values="100;0" dur="2.2s" repeatCount="indefinite" />
                </path>
                <path
                  d="M 452 94 Q 472 162 434 220"
                  stroke={`url(#beam-right-${beamId})`}
                  strokeWidth={activeMode === 'img' ? '2.8' : '2'}
                  strokeLinecap="round"
                  pathLength="100"
                  strokeDasharray="28 72"
                  opacity={activeMode === 'img' ? 1 : 0.65}
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    values="100;0"
                    dur="2.2s"
                    begin="0.9s"
                    repeatCount="indefinite"
                  />
                </path>
              </>
            )}

            <defs>
              <linearGradient id={`beam-left-${beamId}`} x1="28" y1="86" x2="46" y2="218" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#0284C7" stopOpacity="0.2" />
                <stop offset="60%" stopColor="#0284C7" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.95" />
              </linearGradient>
              <linearGradient id={`beam-right-${beamId}`} x1="452" y1="94" x2="434" y2="220" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#10B981" stopOpacity="0.2" />
                <stop offset="55%" stopColor="#7C3AED" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#E11D48" stopOpacity="0.95" />
              </linearGradient>
            </defs>
          </svg>

          {/* LAYER 1 (Left-Back Sheet, z=32): Clickable DOCX · XLSX Sheet */}
          <motion.button
            type="button"
            onClick={() => handleSelectMode(activeMode === 'docx' ? 'xlsx' : 'docx')}
            initial={prefersReduced ? false : { opacity: 0, x: -24, rotate: -9 }}
            animate={{
              opacity: 1,
              x: 0,
              rotate: activeMode === 'docx' || activeMode === 'xlsx' ? -3.5 : -6.5,
              scale: activeMode === 'docx' || activeMode === 'xlsx' ? 1.03 : 0.98,
            }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            style={
              prefersReduced
                ? undefined
                : { x: backLeftMouseX, y: backLeftMouseY, z: 32 }
            }
            className={`text-left absolute left-0 sm:left-2 top-2 w-[56%] sm:w-[53%] rounded-2xl bg-white/95 dark:bg-slate-900/95 border p-3 shadow-lg origin-bottom-left transition-colors cursor-pointer ${
              activeMode === 'docx' || activeMode === 'xlsx'
                ? 'border-sky-300 dark:border-sky-600/80 ring-2 ring-sky-400/20'
                : 'border-[#E7E3F1] dark:border-slate-700 hover:border-sky-200'
            }`}
            title="Click to preview DOCX / XLSX workspace"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-lg bg-[#E1F5FF] text-[#0284C7] dark:bg-sky-950 dark:text-sky-300 flex items-center justify-center">
                  <FileText className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] font-bold text-[#17172F] dark:text-white">DOCX · XLSX</span>
              </div>
              <span className="text-[9px] font-bold text-[#0369A1] dark:text-sky-400">Sync</span>
            </div>
            <div className="space-y-1.5">
              <div className="h-1.5 w-4/5 rounded-full bg-slate-200/90 dark:bg-slate-700" />
              <div className="mt-1.5 grid grid-cols-3 gap-1 p-1.5 rounded-lg bg-[#F4F1FF]/85 dark:bg-slate-800/75 border border-[#E7E3F1] dark:border-slate-700">
                <div className="h-2 rounded bg-sky-300/70 dark:bg-sky-800/80" />
                <div className="h-2 rounded bg-violet-300/65 dark:bg-violet-800/70" />
                <div className="h-2 rounded bg-emerald-300/70 dark:bg-emerald-800/70" />
                <div className="h-1.5 rounded bg-white dark:bg-slate-700" />
                <div className="h-1.5 rounded bg-white dark:bg-slate-700" />
                <div className="h-1.5 rounded bg-white dark:bg-slate-700" />
              </div>
            </div>
          </motion.button>

          {/* LAYER 2 (Right-Back Sheet, z=44): Clickable IMG · PNG Cutout Card */}
          <motion.button
            type="button"
            onClick={() => handleSelectMode('img')}
            initial={prefersReduced ? false : { opacity: 0, x: 24, rotate: 9 }}
            animate={{
              opacity: 1,
              x: 0,
              rotate: activeMode === 'img' ? 3.5 : 6.5,
              scale: activeMode === 'img' ? 1.03 : 0.98,
            }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            style={
              prefersReduced
                ? undefined
                : { x: backRightMouseX, y: backRightMouseY, z: 44 }
            }
            className={`hidden sm:block text-left absolute right-1 top-3 w-[45%] rounded-2xl bg-white/95 dark:bg-slate-900/95 border p-3 shadow-lg origin-bottom-right transition-colors cursor-pointer ${
              activeMode === 'img'
                ? 'border-violet-300 dark:border-violet-600/80 ring-2 ring-violet-400/20'
                : 'border-[#E7E3F1] dark:border-slate-700 hover:border-violet-200'
            }`}
            title="Click to preview 4K BG Cutout & OCR"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-lg bg-[#DDF8EF] text-[#059669] dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center">
                  <ImageIcon className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] font-bold text-[#17172F] dark:text-white">IMG · PNG</span>
              </div>
              <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">Cutout</span>
            </div>
            <div className="h-14 rounded-xl pms-checkerboard border border-[#E7E3F1] dark:border-slate-700 flex items-center justify-center relative overflow-hidden">
              <div className="w-9 h-10 rounded-lg bg-gradient-to-br from-rose-400 via-violet-500 to-sky-500 shadow-md flex items-center justify-center text-white text-[10px] font-black">
                4K
              </div>
            </div>
            <div className="mt-1.5 flex items-center gap-1 text-[9.5px] font-semibold text-slate-500 dark:text-slate-400">
              <ScanText className="w-3 h-3 text-violet-500" />
              <span>Hindi + Eng OCR</span>
            </div>
          </motion.button>

          {/* LAYER 3 (Foreground Hero Interactive Product Card, z=84) */}
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 20, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.55, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
            style={
              prefersReduced
                ? undefined
                : {
                    y: frontScrollY,
                    z: 84,
                    boxShadow:
                      '0 28px 54px -16px rgba(23,23,47,0.22), 0 12px 24px -10px rgba(124,58,237,0.18)',
                  }
            }
            className="relative z-20 mt-10 sm:mt-11 w-[94%] sm:w-[82%] rounded-2xl bg-white/98 dark:bg-[#13132B]/98 border border-[#D4CDE8] dark:border-slate-700 p-4 shadow-2xl backdrop-blur-md"
          >
            {/* Active Document Sheet Header */}
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-8 h-8 rounded-xl text-white flex items-center justify-center shadow-sm shrink-0 transition-colors duration-300"
                  style={{
                    background: `linear-gradient(135deg, ${currentMode.accentHex} 0%, #7C3AED 100%)`,
                  }}
                >
                  {activeMode === 'pdf' && <Layers className="w-4 h-4" />}
                  {activeMode === 'docx' && <FileText className="w-4 h-4" />}
                  {activeMode === 'xlsx' && <FileSpreadsheet className="w-4 h-4" />}
                  {activeMode === 'img' && <ScanText className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-[#17172F] dark:text-white leading-none truncate">
                    {currentMode.title}
                  </div>
                  <div className="text-[10px] font-medium text-[#5B647A] dark:text-slate-400 mt-1 truncate">
                    {currentMode.subtitle}
                  </div>
                </div>
              </div>

              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${currentMode.softBgClass} ${currentMode.pillTextClass}`}>
                {activeMode === 'pdf' && 'अ / A'}
                {activeMode === 'docx' && 'Layout'}
                {activeMode === 'xlsx' && 'Tables'}
                {activeMode === 'img' && 'Alpha 4K'}
              </span>
            </div>

            {/* Interactive Mode Viewport (Fixed Height Prevents Layout Shift) */}
            <div className="h-[118px] relative overflow-hidden">
              <AnimatePresence mode="wait">
                {activeMode === 'pdf' && (
                  <motion.div
                    key="view-pdf"
                    initial={prefersReduced ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReduced ? undefined : { opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="h-full flex flex-col justify-between"
                  >
                    {/* Live Bilingual Text Editor Selection Box */}
                    <div className="relative rounded-xl border border-dashed border-[#7C3AED]/75 bg-[#F4F1FF]/65 dark:bg-violet-950/30 p-2.5">
                      <span className="absolute -top-1 -left-1 w-2 h-2 rounded-xs bg-white border border-[#7C3AED]" />
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-xs bg-white border border-[#7C3AED]" />
                      <span className="absolute -bottom-1 -left-1 w-2 h-2 rounded-xs bg-white border border-[#7C3AED]" />
                      <span className="absolute -bottom-1 -right-1 w-2 h-2 rounded-xs bg-white border border-[#7C3AED]" />

                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div
                            className={`text-[12px] text-[#17172F] dark:text-white leading-snug ${
                              pdfBold ? 'font-extrabold' : 'font-medium'
                            } ${pdfItalic ? 'italic' : ''}`}
                          >
                            {pdfEdited ? 'वार्षिक रिपोर्ट · Annual Report 2026' : 'Original Invoice Heading · Draft'}
                            {!prefersReduced && (
                              <span className="inline-block w-[2px] h-3.5 bg-[#E11D48] ml-1 align-middle animate-pulse" />
                            )}
                          </div>
                          <div className="text-[10px] text-[#5B647A] dark:text-slate-400 mt-0.5 truncate">
                            Font matched: Noto Sans Devanagari · 14pt
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setPdfEdited((v) => !v)}
                          className="shrink-0 text-[9.5px] font-bold px-2 py-1 rounded-md bg-white dark:bg-slate-800 text-[#7C3AED] dark:text-violet-300 border border-[#D4CDE8] dark:border-slate-700 shadow-xs hover:border-[#7C3AED] transition-colors cursor-pointer"
                        >
                          {pdfEdited ? 'Edit Match ✓' : 'Apply Edit'}
                        </button>
                      </div>
                    </div>

                    {/* Interactive Mini Vector Formatting Bar */}
                    <div className="flex items-center justify-between gap-2 px-1">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setPdfBold((v) => !v)}
                          aria-label="Toggle bold preview"
                          className={`p-1 rounded-md border text-[10px] transition-colors cursor-pointer ${
                            pdfBold
                              ? 'bg-[#EEE7FF] border-[#7C3AED]/50 text-[#7C3AED] dark:bg-violet-900/50 dark:text-violet-200'
                              : 'border-[#E7E3F1] dark:border-slate-700 text-slate-500'
                          }`}
                        >
                          <Bold className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPdfItalic((v) => !v)}
                          aria-label="Toggle italic preview"
                          className={`p-1 rounded-md border text-[10px] transition-colors cursor-pointer ${
                            pdfItalic
                              ? 'bg-[#EEE7FF] border-[#7C3AED]/50 text-[#7C3AED] dark:bg-violet-900/50 dark:text-violet-200'
                              : 'border-[#E7E3F1] dark:border-slate-700 text-slate-500'
                          }`}
                        >
                          <Italic className="w-3 h-3" />
                        </button>
                        <span className="ml-1 text-[9.5px] font-semibold text-slate-500 dark:text-slate-400">
                          Try formatting live
                        </span>
                      </div>
                      <span className="text-[9.5px] font-bold text-emerald-600 dark:text-emerald-400">
                        Vector Text
                      </span>
                    </div>
                  </motion.div>
                )}

                {activeMode === 'docx' && (
                  <motion.div
                    key="view-docx"
                    initial={prefersReduced ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReduced ? undefined : { opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="h-full flex flex-col justify-between"
                  >
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border border-[#E7E3F1] dark:border-slate-700 bg-[#F4F1FF]/55 dark:bg-slate-800/55 p-2.5">
                      {/* Source Node */}
                      <div className="rounded-lg bg-white dark:bg-slate-900 border border-[#E7E3F1] dark:border-slate-700 p-2 shadow-xs">
                        <span
                          className={`inline-block text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
                            docxReverse ? 'bg-[#E1F5FF] text-[#0369A1]' : 'bg-[#FFE4ED] text-[#BE123C]'
                          }`}
                        >
                          {docxReverse ? 'DOCX' : 'PDF'}
                        </span>
                        <div className="mt-1.5 space-y-1">
                          <div className="h-1.5 w-5/6 rounded-full bg-slate-300 dark:bg-slate-600" />
                          <div className="h-1.5 w-3/4 rounded-full bg-slate-200 dark:bg-slate-700" />
                        </div>
                      </div>

                      {/* Direction Toggle */}
                      <button
                        type="button"
                        onClick={() => setDocxReverse((v) => !v)}
                        title="Swap conversion direction"
                        className="p-1.5 rounded-full bg-white dark:bg-slate-800 border border-[#D4CDE8] dark:border-slate-600 text-[#0284C7] hover:scale-105 transition-transform shadow-xs cursor-pointer"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                      </button>

                      {/* Output Node */}
                      <div className="rounded-lg bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-800/70 p-2 shadow-xs">
                        <span
                          className={`inline-block text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
                            docxReverse ? 'bg-[#FFE4ED] text-[#BE123C]' : 'bg-[#E1F5FF] text-[#0369A1]'
                          }`}
                        >
                          {docxReverse ? 'PDF' : 'DOCX'}
                        </span>
                        <div className="mt-1.5 space-y-1">
                          <div className="h-1.5 w-full rounded-full bg-sky-200 dark:bg-sky-800" />
                          <div className="h-1.5 w-4/5 rounded-full bg-emerald-200 dark:bg-emerald-800" />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[9.5px] font-semibold text-[#5B647A] dark:text-slate-400 px-1">
                      <span>Headers, Margins &amp; Fonts Intact</span>
                      <span className="text-[#0284C7] dark:text-sky-400 font-bold">
                        {docxReverse ? 'Word → Exact PDF' : 'PDF → Editable Word'}
                      </span>
                    </div>
                  </motion.div>
                )}

                {activeMode === 'xlsx' && (
                  <motion.div
                    key="view-xlsx"
                    initial={prefersReduced ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReduced ? undefined : { opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="h-full flex flex-col justify-between"
                  >
                    <div className="rounded-xl border border-[#E7E3F1] dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
                      <div className="grid grid-cols-3 text-[9px] font-extrabold uppercase tracking-wide px-2.5 py-1.5 bg-[#DDF8EF]/70 dark:bg-emerald-950/50 text-[#047857] dark:text-emerald-300 border-b border-[#E7E3F1] dark:border-slate-700">
                        <span>Document</span>
                        <span className="text-center">Pages</span>
                        <span className="text-right">Status</span>
                      </div>
                      {TABLE_SAMPLE_ROWS.map((row, idx) => {
                        const isPicked = selectedRow === idx;
                        return (
                          <button
                            key={row.item}
                            type="button"
                            onClick={() => setSelectedRow(idx)}
                            className={`w-full grid grid-cols-3 items-center px-2.5 py-1 text-[10px] text-left transition-colors cursor-pointer ${
                              isPicked
                                ? 'bg-[#EEE7FF]/75 dark:bg-violet-950/45 text-[#17172F] dark:text-white font-bold'
                                : 'text-[#5B647A] dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            <span className="truncate">{row.item}</span>
                            <span className="text-center">{row.pages}</span>
                            <span className="text-right text-emerald-600 dark:text-emerald-400 font-bold">
                              {row.format}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between text-[9.5px] font-semibold text-[#5B647A] dark:text-slate-400 px-1">
                      <span>Click any row to inspect</span>
                      <span className="text-[#059669] dark:text-emerald-400 font-bold">Multi-Page Grid Sync</span>
                    </div>
                  </motion.div>
                )}

                {activeMode === 'img' && (
                  <motion.div
                    key="view-img"
                    initial={prefersReduced ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReduced ? undefined : { opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="h-full flex flex-col justify-between"
                  >
                    {/* Interactive Before / After Cutout + OCR Sweep Box */}
                    <div className="relative h-[88px] rounded-xl border border-[#D4CDE8] dark:border-slate-700 overflow-hidden bg-slate-100 dark:bg-slate-800">
                      {/* After Layer (Clean Transparent Checkerboard + 4K Cutout + OCR Sweep) */}
                      <div className="absolute inset-0 pms-checkerboard flex items-center justify-between px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-11 h-12 rounded-xl bg-gradient-to-br from-[#E11D48] via-[#7C3AED] to-[#0284C7] shadow-lg flex items-center justify-center text-white text-xs font-black">
                            4K
                          </div>
                          <div>
                            <div className="text-[11px] font-extrabold text-[#17172F]">Clean Alpha</div>
                            <div className="text-[9.5px] font-semibold text-[#7C3AED]">OCR Text Ready</div>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-extrabold">
                          Cutout
                        </span>
                        {!prefersReduced && (
                          <div
                            aria-hidden="true"
                            className="pms-scan-bar absolute inset-y-0 w-10 pointer-events-none"
                            style={{
                              background:
                                'linear-gradient(90deg, transparent, rgba(124,58,237,0.22), transparent)',
                            }}
                          />
                        )}
                      </div>

                      {/* Before Layer (Exact-Aligned Clipped Raw Scan Overlay) */}
                      <div
                        className="absolute inset-0 bg-gradient-to-br from-amber-50 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-between px-4"
                        style={{ clipPath: `inset(0 ${100 - cutoutSplit}% 0 0)` }}
                      >
                        <div className="flex items-center gap-2.5 opacity-80">
                          <div className="w-11 h-12 rounded-xl bg-slate-400/75 flex items-center justify-center text-white text-xs font-bold blur-[0.6px]">
                            RAW
                          </div>
                          <div>
                            <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Raw Scan</div>
                            <div className="text-[9.5px] text-slate-500 dark:text-slate-400">Shadow &amp; BG</div>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[9px] font-bold">
                          Original
                        </span>
                      </div>

                      {/* Hairline Vertical Split Line */}
                      <div
                        aria-hidden="true"
                        className="absolute inset-y-0 w-[2px] bg-white shadow-sm pointer-events-none z-10"
                        style={{ left: `${cutoutSplit}%` }}
                      />

                      {/* Draggable Slider Overlay */}
                      <input
                        type="range"
                        min={15}
                        max={85}
                        value={cutoutSplit}
                        onChange={(e) => setCutoutSplit(Number(e.target.value))}
                        aria-label="Slide before and after background removal comparison"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-20"
                      />
                      <div
                        aria-hidden="true"
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-white border border-[#7C3AED] shadow-md flex items-center justify-center pointer-events-none z-10"
                        style={{ left: `${cutoutSplit}%` }}
                      >
                        <ArrowLeftRight className="w-2.5 h-2.5 text-[#7C3AED]" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[9.5px] font-semibold text-[#5B647A] dark:text-slate-400 px-1">
                      <span>Drag slider to compare cutout</span>
                      <span className="text-[#7C3AED] dark:text-violet-300 font-bold">Hindi + English OCR</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Bottom Action Bar inside Foreground Card */}
            <div className="flex items-center justify-between gap-2 pt-2.5 mt-1 border-t border-[#E7E3F1] dark:border-slate-800 text-[10.5px] font-semibold">
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                Zero Watermark
              </span>

              <Link
                to={currentMode.ctaPath}
                className="inline-flex items-center gap-1 font-extrabold text-[#E11D48] dark:text-rose-400 hover:underline group"
              >
                {currentMode.ctaLabel}
                <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </motion.div>

          {/* Pop-Out Bottom-Left 3D Floating Telemetry Pill (z=116) */}
          <motion.div
            style={
              prefersReduced
                ? undefined
                : {
                    x: badgeFloatX,
                    y: badgeFloatY,
                    z: 116,
                  }
            }
            className="hidden sm:flex items-center gap-1.5 absolute -bottom-3 -left-2 z-30 px-3 py-1.5 rounded-full border backdrop-blur-md shadow-xl bg-white/95 dark:bg-[#171732]/95 border-[#D4CDE8] dark:border-slate-700"
          >
            <Sparkles className="w-3 h-3 text-[#7C3AED]" />
            <span className="text-[10px] font-extrabold text-[#17172F] dark:text-slate-100">
              {currentMode.popBadge}
            </span>
          </motion.div>
        </div>

        {/* Subtle Auto-Cycle Indicator & Floor Reflection */}
        <div className="mt-2.5 flex items-center justify-between px-1 text-[9.5px] font-medium text-slate-400 dark:text-slate-500">
          <span>
            {userLockedMode || isHovered ? 'Interactive mode active' : 'Auto-previewing studio modes'}
          </span>
          {userLockedMode && !prefersReduced && (
            <button
              type="button"
              onClick={() => setUserLockedMode(false)}
              className="text-[#7C3AED] dark:text-violet-400 font-bold hover:underline cursor-pointer"
            >
              Resume tour
            </button>
          )}
        </div>

        <div
          aria-hidden="true"
          className="mt-1.5 mx-auto w-[84%] h-3.5 rounded-full blur-md opacity-70 dark:opacity-35"
          style={{
            background:
              'linear-gradient(90deg, rgba(225,29,72,0.2) 0%, rgba(124,58,237,0.25) 50%, rgba(2,132,199,0.2) 100%)',
          }}
        />
      </motion.div>
    </div>
  );
}
