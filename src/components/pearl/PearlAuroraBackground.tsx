import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';

interface PearlAuroraBackgroundProps {
  /** 'home' enables richer multi-stage lighting shifts; 'workspace' keeps calmer tool framing */
  mode?: 'home' | 'workspace';
}

/**
 * Reusable Scroll-Linked Pearl Aurora Atmosphere
 * Layers:
 *   1. Pearl base + radial blush/lavender/sky aura fields
 *   2. Flowing multi-path SVG contour waves (parallax mid-layer)
 *   3. Subtle floating translucent paper sheets & orbital ring geometry
 * All layers are pointer-events-none and sit behind interactive UI.
 */
export default function PearlAuroraBackground({ mode = 'home' }: PearlAuroraBackgroundProps) {
  const prefersReduced = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 70,
    damping: 24,
    restDelta: 0.001,
  });

  // Layer 1: Distant aura glows shift gently down & sideways
  const roseGlowY = useTransform(smoothProgress, [0, 1], [0, mode === 'home' ? 180 : 80]);
  const blueGlowY = useTransform(smoothProgress, [0, 1], [0, mode === 'home' ? -150 : -60]);
  const violetGlowScale = useTransform(smoothProgress, [0, 0.5, 1], [1, 1.12, 0.96]);

  // Layer 2: Architectural wave curves parallax slightly faster
  const waveY = useTransform(smoothProgress, [0, 1], [0, mode === 'home' ? -190 : -70]);
  const waveRotate = useTransform(smoothProgress, [0, 1], [0, mode === 'home' ? 5 : 2]);

  // Layer 3: Floating translucent paper facets & orbital lines
  const sheetLeftY = useTransform(smoothProgress, [0, 1], [0, mode === 'home' ? -240 : -90]);
  const sheetLeftRotate = useTransform(smoothProgress, [0, 1], [-8, 6]);
  const sheetRightY = useTransform(smoothProgress, [0, 1], [0, mode === 'home' ? 210 : 80]);
  const sheetRightRotate = useTransform(smoothProgress, [0, 1], [10, -5]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none"
    >
      {/* Base Pearl Surface */}
      <div
        className="absolute inset-0 transition-colors duration-300"
        style={{ backgroundColor: 'var(--pms-pearl)' }}
      />

      {/* Subtle hairline paper matrix (softly masked) */}
      <div
        className="absolute inset-0 pms-paper-grid opacity-55 dark:opacity-25"
        style={{
          maskImage: 'radial-gradient(ellipse 85% 65% at 50% 25%, black 15%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 85% 65% at 50% 25%, black 15%, transparent 100%)',
        }}
      />

      {/* LAYER 1: Hero & Scroll Aura Fields */}
      <motion.div
        style={prefersReduced ? undefined : { y: roseGlowY }}
        className="absolute -top-40 -left-32 w-[540px] h-[540px] md:w-[760px] md:h-[760px] rounded-full opacity-75 dark:opacity-40 blur-3xl will-change-transform"
      >
        <div
          className={`w-full h-full rounded-full ${prefersReduced ? '' : 'pms-aurora-breathe-a'}`}
          style={{
            background: 'radial-gradient(circle, var(--pms-soft-rose) 0%, rgba(255,228,237,0) 70%)',
          }}
        />
      </motion.div>

      <motion.div
        style={prefersReduced ? undefined : { y: blueGlowY }}
        className="absolute top-[12%] -right-40 w-[520px] h-[520px] md:w-[780px] md:h-[780px] rounded-full opacity-80 dark:opacity-35 blur-3xl will-change-transform"
      >
        <div
          className={`w-full h-full rounded-full ${prefersReduced ? '' : 'pms-aurora-breathe-b'}`}
          style={{
            background: 'radial-gradient(circle, var(--pms-soft-blue) 0%, rgba(225,245,255,0) 70%)',
          }}
        />
      </motion.div>

      <motion.div
        style={prefersReduced ? undefined : { scale: violetGlowScale }}
        className="absolute top-[42%] left-1/2 -translate-x-1/2 w-[680px] h-[520px] md:w-[980px] md:h-[640px] rounded-full opacity-80 dark:opacity-30 blur-3xl will-change-transform"
      >
        <div
          className={`w-full h-full rounded-full ${prefersReduced ? '' : 'pms-aurora-breathe-a'}`}
          style={{
            background: 'radial-gradient(ellipse, var(--pms-soft-lavender) 0%, rgba(238,231,255,0) 72%)',
          }}
        />
      </motion.div>

      {mode === 'home' && (
        <div
          className="absolute bottom-[-180px] right-[10%] w-[560px] h-[420px] rounded-full opacity-60 dark:opacity-20 blur-3xl"
          style={{
            background: 'radial-gradient(circle, var(--pms-soft-mint) 0%, rgba(221,248,239,0) 70%)',
          }}
        />
      )}

      {/* LAYER 2: Flowing Editorial SVG Wave Contours */}
      <motion.svg
        style={prefersReduced ? undefined : { y: waveY, rotate: waveRotate }}
        viewBox="0 0 1440 620"
        fill="none"
        preserveAspectRatio="none"
        className="absolute top-[140px] left-[-6%] w-[112%] h-[520px] opacity-60 dark:opacity-25 will-change-transform"
      >
        <defs>
          <linearGradient id="pms-wave-stroke-1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#E11D48" stopOpacity="0.16" />
            <stop offset="50%" stopColor="#7C3AED" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#0284C7" stopOpacity="0.16" />
          </linearGradient>
          <linearGradient id="pms-wave-stroke-2" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#0284C7" stopOpacity="0.14" />
            <stop offset="55%" stopColor="#7C3AED" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#E11D48" stopOpacity="0.10" />
          </linearGradient>
        </defs>
        <path
          d="M-60 220 C 260 110, 520 340, 820 210 C 1080 95, 1280 260, 1500 160"
          stroke="url(#pms-wave-stroke-1)"
          strokeWidth="1.6"
        />
        <path
          d="M-40 290 C 310 180, 560 410, 860 280 C 1130 165, 1310 320, 1520 230"
          stroke="url(#pms-wave-stroke-2)"
          strokeWidth="1.1"
          strokeDasharray="6 8"
        />
        <path
          d="M-20 375 C 340 285, 620 465, 920 355 C 1180 260, 1350 385, 1520 315"
          stroke="url(#pms-wave-stroke-1)"
          strokeWidth="0.9"
          opacity="0.7"
        />
      </motion.svg>

      {/* LAYER 3: Translucent Floating Document Sheets & Subtle Orbit Arcs (home only, edge-framed) */}
      {mode === 'home' && (
        <>
          <motion.div
            style={prefersReduced ? undefined : { y: sheetLeftY, rotate: sheetLeftRotate }}
            className="hidden lg:block absolute top-[46%] left-[2.5%] w-24 h-32 rounded-2xl border backdrop-blur-sm opacity-65 dark:opacity-25 will-change-transform"
          >
            <div
              className="w-full h-full rounded-2xl p-3 flex flex-col justify-between"
              style={{
                backgroundColor: 'rgba(255,255,255,0.52)',
                borderColor: 'var(--pms-border)',
                boxShadow: 'var(--pms-shadow-sm)',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="w-6 h-1.5 rounded-full bg-rose-400/50" />
                <span className="w-2.5 h-2.5 rounded-full bg-violet-400/35" />
              </div>
              <div className="space-y-1.5">
                <div className="h-1.5 w-full rounded bg-slate-300/60" />
                <div className="h-1.5 w-4/5 rounded bg-slate-300/50" />
                <div className="h-1.5 w-3/5 rounded bg-slate-300/40" />
              </div>
            </div>
          </motion.div>

          <motion.div
            style={prefersReduced ? undefined : { y: sheetRightY, rotate: sheetRightRotate }}
            className="hidden lg:block absolute top-[34%] right-[2.5%] w-28 h-36 rounded-2xl border backdrop-blur-sm opacity-65 dark:opacity-25 will-change-transform"
          >
            <div
              className="w-full h-full rounded-2xl p-3 flex flex-col justify-between"
              style={{
                backgroundColor: 'rgba(255,255,255,0.55)',
                borderColor: 'var(--pms-border)',
                boxShadow: 'var(--pms-shadow-sm)',
              }}
            >
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-sky-100 text-sky-700">SVG</span>
                <span className="h-1.5 flex-1 rounded bg-sky-200/70" />
              </div>
              <div className="h-12 rounded-lg border border-dashed border-violet-300/60 bg-violet-50/40" />
              <div className="h-1.5 w-2/3 rounded bg-slate-300/50" />
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}

