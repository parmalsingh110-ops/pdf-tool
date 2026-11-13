import { type ReactNode, useEffect, useState } from 'react';
import { animate, AnimatePresence, motion, useReducedMotion } from 'motion/react';
import PearlAuroraBackground from './PearlAuroraBackground';

const SPRING_TRANSITION = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1] as const,
};

/**
 * Animates between multi-step tool views (`upload` -> `configure` -> `result`)
 * while preserving accessibility via `useReducedMotion()`.
 */
export function PearlStageSwitch({
  stageKey,
  children,
  className = 'w-full',
}: {
  stageKey: string;
  children: ReactNode;
  className?: string;
}) {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={stageKey}
        initial={{ opacity: 0, y: 14, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.99 }}
        transition={SPRING_TRANSITION}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Smoothly rolls a numeric metric from 0 (or previous value) to `value`.
 * Falls back immediately to the static formatted target under reduced motion.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const prefersReduced = useReducedMotion();
  const safeTarget = Number.isFinite(value) ? value : 0;
  const [display, setDisplay] = useState(prefersReduced ? safeTarget : 0);

  useEffect(() => {
    if (prefersReduced) {
      setDisplay(safeTarget);
      return;
    }
    const controls = animate(0, safeTarget, {
      duration: 0.65,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setDisplay(latest),
    });
    return () => controls.stop();
  }, [safeTarget, prefersReduced]);

  const formatted = decimals > 0 ? display.toFixed(decimals) : Math.round(display).toString();
  return (
    <span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

/**
 * Sweeping Pearl Aurora scanner beam overlaid on a card while heavy processing runs.
 */
export function PearlScanOverlay({
  active,
  label,
}: {
  active: boolean;
  label?: string;
}) {
  const prefersReduced = useReducedMotion();
  if (!active) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] z-20"
    >
      {!prefersReduced && (
        <div
          className="pms-scan-bar absolute inset-y-0 w-1/3"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(225, 29, 72, 0.08) 35%, rgba(124, 58, 237, 0.14) 55%, rgba(2, 132, 199, 0.08) 80%, transparent 100%)',
          }}
        />
      )}
      {label && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-bold bg-white/90 dark:bg-slate-900/90 border border-[var(--pms-border)] shadow-sm backdrop-blur-md text-[var(--pms-ink)] whitespace-nowrap">
          {label}
        </div>
      )}
    </div>
  );
}

/**
 * Pearl Aurora workspace skeleton shown while lazy-loaded tool chunks resolve.
 */
export function PearlRouteSkeleton() {
  return (
    <div
      className="relative flex-1 min-h-[78vh] overflow-hidden"
      style={{ backgroundColor: 'var(--pms-pearl)', color: 'var(--pms-ink)' }}
    >
      <PearlAuroraBackground mode="workspace" />
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 pt-12 pb-16 space-y-8">
        <div className="flex flex-col items-center space-y-4">
          <div className="h-6 w-44 rounded-full pms-shimmer border border-[var(--pms-border)]" />
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl pms-shimmer border border-[var(--pms-border)]" />
            <div className="h-9 w-64 sm:w-80 rounded-xl pms-shimmer border border-[var(--pms-border)]" />
          </div>
          <div className="h-4 w-72 sm:w-[28rem] rounded-lg pms-shimmer" />
        </div>

        <div
          className="rounded-3xl p-8 sm:p-12 border pms-glass-panel space-y-5"
          style={{ borderColor: 'var(--pms-border)' }}
        >
          <div className="w-16 h-16 rounded-2xl mx-auto pms-shimmer" />
          <div className="h-5 w-48 mx-auto rounded-lg pms-shimmer" />
          <div className="h-4 w-64 mx-auto rounded-lg pms-shimmer" />
          <div className="h-11 w-40 mx-auto rounded-xl pms-shimmer" />
        </div>
      </div>
    </div>
  );
}
