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
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 max-w-[90%] truncate text-center px-3 py-1 rounded-full text-[11px] font-bold bg-white/90 dark:bg-slate-900/90 border border-[var(--pms-border)] shadow-sm backdrop-blur-md text-[var(--pms-ink)]">
          {label}
        </div>
      )}
    </div>
  );
}

type PearlAccent = 'rose' | 'blue' | 'emerald' | 'violet' | 'amber';

const SPINNER_PALETTE: Record<PearlAccent, { a: string; b: string; glow: string }> = {
  rose: { a: '#E11D48', b: '#7C3AED', glow: 'rgba(225, 29, 72, 0.22)' },
  blue: { a: '#0284C7', b: '#7C3AED', glow: 'rgba(2, 132, 199, 0.22)' },
  emerald: { a: '#059669', b: '#0284C7', glow: 'rgba(5, 150, 105, 0.22)' },
  violet: { a: '#7C3AED', b: '#E11D48', glow: 'rgba(124, 58, 237, 0.22)' },
  amber: { a: '#D97706', b: '#E11D48', glow: 'rgba(217, 119, 6, 0.22)' },
};

/**
 * Crisp luminous orbital spinner aligned with Pearl Aurora tokens.
 */
export function PearlSpinner({
  size = 'md',
  accent = 'rose',
  className = '',
}: {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  accent?: PearlAccent;
  className?: string;
}) {
  const prefersReduced = useReducedMotion();
  const dims =
    size === 'xs'
      ? 'w-4 h-4'
      : size === 'sm'
        ? 'w-6 h-6'
        : size === 'lg'
          ? 'w-16 h-16'
          : 'w-12 h-12';
  const insetPx = size === 'xs' ? 2 : size === 'sm' ? 2.5 : 3.5;
  const pal = SPINNER_PALETTE[accent] || SPINNER_PALETTE.rose;

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${dims} ${className}`}
      aria-hidden="true"
    >
      <div
        className="w-full h-full rounded-full"
        style={{
          background: `conic-gradient(from 0deg, transparent 28%, ${pal.a} 78%, ${pal.b} 100%)`,
          animation: prefersReduced ? 'none' : 'pms-pearl-spin 0.9s linear infinite',
          boxShadow: size === 'xs' || size === 'sm' ? 'none' : `0 0 18px -4px ${pal.glow}`,
        }}
      >
        <div
          className="rounded-full"
          style={{
            position: 'absolute',
            inset: insetPx,
            backgroundColor: 'var(--pms-white)',
          }}
        />
      </div>
      <style>{`
        @keyframes pms-pearl-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

/**
 * Glassmorphic Pearl Aurora processing card replacing raw Tailwind border spinners.
 */
export function PearlProcessCard({
  title,
  subtitle,
  stageLabel,
  progress,
  accent = 'rose',
  badge,
  className = '',
}: {
  title: string;
  subtitle?: string;
  stageLabel?: string;
  progress?: number;
  accent?: PearlAccent;
  badge?: string;
  className?: string;
}) {
  const prefersReduced = useReducedMotion();
  const pal = SPINNER_PALETTE[accent] || SPINNER_PALETTE.rose;
  const grad = `linear-gradient(135deg, ${pal.a}, ${pal.b})`;
  const clampedPct =
    typeof progress === 'number' && Number.isFinite(progress)
      ? Math.max(0, Math.min(100, Math.round(progress)))
      : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`relative overflow-hidden rounded-3xl pms-glass-panel p-7 sm:p-9 text-center space-y-5 ${className}`}
      style={{
        borderColor: 'var(--pms-border)',
        boxShadow: `0 18px 46px -16px ${pal.glow}, var(--pms-shadow-card)`,
      }}
    >
      <PearlScanOverlay active={!prefersReduced} label={badge} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-40 rounded-full blur-3xl opacity-35"
        style={{ background: grad }}
      />

      <div className="relative z-10 flex justify-center">
        <PearlSpinner size="lg" accent={accent} />
      </div>

      <div className="relative z-10 space-y-1.5">
        <h3 className="text-lg font-extrabold tracking-tight text-[var(--pms-ink)]">
          {title}
        </h3>
        {stageLabel && (
          <p
            className="text-xs font-bold uppercase tracking-wider"
            style={{ color: pal.a }}
          >
            {stageLabel}
          </p>
        )}
        {subtitle && (
          <p className="text-sm text-[var(--pms-muted)] max-w-md mx-auto">
            {subtitle}
          </p>
        )}
      </div>

      {clampedPct !== null && (
        <div className="relative z-10 max-w-sm mx-auto space-y-1.5">
          <div className="flex justify-between text-xs font-bold text-[var(--pms-muted)]">
            <span>Progress</span>
            <span className="tabular-nums text-[var(--pms-ink)]">{clampedPct}%</span>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--pms-lavender-surface)' }}
          >
            <div
              className="h-full rounded-full relative overflow-hidden transition-[width] duration-300 ease-out"
              style={{ width: `${clampedPct}%`, backgroundImage: grad }}
            >
              {!prefersReduced && <div className="absolute inset-0 pms-shimmer opacity-50" />}
            </div>
          </div>
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
