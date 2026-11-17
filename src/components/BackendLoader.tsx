import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check, Sparkles } from 'lucide-react';
import { PearlScanOverlay } from './pearl/PearlMotion';

export interface LoaderStep {
  icon: string;
  label: string;
  detail: string;
}

export interface BackendLoaderProps {
  title?: string;
  steps?: LoaderStep[];
  tips?: string[];
  accentColor?: 'rose' | 'blue' | 'emerald' | 'orange' | 'indigo' | 'violet';
  progressOverride?: number;
  activeStepOverride?: number;
}

const DEFAULT_STEPS: LoaderStep[] = [
  { icon: '📤', label: 'Uploading', detail: 'Securing and validating document layers…' },
  { icon: '🔍', label: 'Analyzing', detail: 'Detecting layout structure, scripts & tables…' },
  { icon: '⚡', label: 'Reconstructing', detail: 'Formatting clean vector & text fidelity…' },
  { icon: '✨', label: 'Finalizing', detail: 'Polishing output for instant download…' },
];

const DEFAULT_TIPS = [
  'Files are processed transiently and automatically purged right after export.',
  'Smart layout detection preserves merged tables, columns, and reading order.',
  'Multilingual script recognition automatically adapts to 100+ global languages.',
  'High-DPI layer analysis isolates stamps, signatures, and tables cleanly.',
];

const PALETTES: Record<
  NonNullable<BackendLoaderProps['accentColor']>,
  { a: string; b: string; glow: string; badgeBg: string; badgeText: string }
> = {
  rose: {
    a: '#E11D48',
    b: '#7C3AED',
    glow: 'rgba(225, 29, 72, 0.20)',
    badgeBg: 'var(--pms-soft-rose)',
    badgeText: 'var(--pms-rose)',
  },
  blue: {
    a: '#0284C7',
    b: '#7C3AED',
    glow: 'rgba(2, 132, 199, 0.20)',
    badgeBg: 'var(--pms-soft-blue)',
    badgeText: 'var(--pms-blue)',
  },
  emerald: {
    a: '#059669',
    b: '#0284C7',
    glow: 'rgba(5, 150, 105, 0.20)',
    badgeBg: 'var(--pms-soft-mint)',
    badgeText: '#059669',
  },
  orange: {
    a: '#EA580C',
    b: '#E11D48',
    glow: 'rgba(234, 88, 12, 0.20)',
    badgeBg: 'rgba(255, 237, 213, 0.7)',
    badgeText: '#EA580C',
  },
  indigo: {
    a: '#6366F1',
    b: '#0284C7',
    glow: 'rgba(99, 102, 241, 0.20)',
    badgeBg: 'var(--pms-soft-lavender)',
    badgeText: 'var(--pms-violet)',
  },
  violet: {
    a: '#7C3AED',
    b: '#E11D48',
    glow: 'rgba(124, 58, 237, 0.20)',
    badgeBg: 'var(--pms-soft-lavender)',
    badgeText: 'var(--pms-violet)',
  },
};

export default function BackendLoader({
  title = 'Processing Document…',
  steps = DEFAULT_STEPS,
  tips = DEFAULT_TIPS,
  accentColor = 'rose',
  progressOverride,
  activeStepOverride,
}: BackendLoaderProps) {
  const pal = PALETTES[accentColor] || PALETTES.rose;
  const prefersReduced = useReducedMotion();

  const [autoStep, setAutoStep] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);
  const [autoProgress, setAutoProgress] = useState(8);

  useEffect(() => {
    if (typeof activeStepOverride === 'number') return;
    const id = setInterval(() => {
      setAutoStep((s) => (s + 1) % Math.max(1, steps.length));
    }, 2200);
    return () => clearInterval(id);
  }, [steps.length, activeStepOverride]);

  useEffect(() => {
    const id = setInterval(() => {
      setTipIdx((i) => (i + 1) % Math.max(1, tips.length));
    }, 4200);
    return () => clearInterval(id);
  }, [tips.length]);

  useEffect(() => {
    if (typeof progressOverride === 'number') return;
    const id = setInterval(() => {
      setAutoProgress((p) => {
        if (p >= 96) return 96;
        if (p > 82) return p + 0.35;
        if (p > 60) return p + 0.85;
        return p + 1.8;
      });
    }, 180);
    return () => clearInterval(id);
  }, [progressOverride]);

  const activeStep =
    typeof activeStepOverride === 'number'
      ? Math.max(0, Math.min(steps.length - 1, activeStepOverride))
      : autoStep;
  const pct = Math.min(
    99,
    Math.max(4, Math.round(typeof progressOverride === 'number' ? progressOverride : autoProgress))
  );
  const grad = `linear-gradient(135deg, ${pal.a}, ${pal.b})`;

  return (
    <div
      className="relative overflow-hidden rounded-3xl pms-glass-panel p-6 sm:p-8 border"
      style={{
        borderColor: 'var(--pms-border)',
        boxShadow: `0 20px 52px -18px ${pal.glow}, var(--pms-shadow-card)`,
      }}
      role="status"
      aria-live="polite"
    >
      <PearlScanOverlay active={!prefersReduced} />

      {/* Subtle radial aurora halo */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-52 rounded-full blur-3xl opacity-45"
        style={{ background: grad }}
      />

      {/* Orbital Aurora Core */}
      <div className="relative z-10 flex justify-center mb-5">
        <div className="relative w-20 h-20 flex items-center justify-center">
          {/* Outer breathing halo */}
          {!prefersReduced && (
            <motion.div
              animate={{ scale: [1, 1.14, 1], opacity: [0.35, 0.7, 0.35] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute inset-0 rounded-full border"
              style={{ borderColor: pal.a }}
            />
          )}

          {/* Smooth GPU conic arc */}
          <div
            className="absolute inset-1.5 rounded-full"
            style={{
              background: `conic-gradient(from 0deg, transparent 35%, ${pal.a} 78%, ${pal.b} 100%)`,
              animation: prefersReduced ? 'none' : 'pms-conic-spin 1.15s linear infinite',
              boxShadow: `0 0 20px -4px ${pal.glow}`,
            }}
          >
            <div
              className="absolute inset-[3.5px] rounded-full"
              style={{ backgroundColor: 'var(--pms-white)' }}
            />
          </div>

          {/* Center active emoji / icon */}
          <motion.span
            key={activeStep}
            initial={prefersReduced ? false : { scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="relative z-10 text-2xl select-none"
          >
            {steps[activeStep]?.icon || '⚡'}
          </motion.span>
        </div>
      </div>

      {/* Title & Active Stage Badge */}
      <div className="relative z-10 text-center space-y-1.5 mb-6">
        <h3 className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--pms-ink)]">
          {title}
        </h3>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase"
          style={{ backgroundColor: pal.badgeBg, color: pal.badgeText }}
        >
          <Sparkles className="w-3 h-3" />
          <span>{steps[activeStep]?.label}</span>
        </div>
      </div>

      {/* Stepper Timeline */}
      <div className="relative z-10 flex items-start justify-between gap-1 mb-6 px-1">
        {steps.map((step, i) => {
          const isDone = i < activeStep;
          const isCurrent = i === activeStep;
          return (
            <div key={step.label + i} className="flex-1 flex flex-col items-center relative">
              {i < steps.length - 1 && (
                <div
                  className="absolute top-3.5 left-1/2 w-full h-[2px] -z-0 transition-all duration-500"
                  style={{
                    background: isDone ? grad : 'var(--pms-border)',
                  }}
                />
              )}
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold relative z-10 transition-all duration-300"
                style={{
                  background: isDone ? grad : 'var(--pms-white)',
                  border: isCurrent
                    ? `2px solid ${pal.a}`
                    : isDone
                      ? 'none'
                      : '1.5px solid var(--pms-border-strong)',
                  color: isDone ? '#FFFFFF' : isCurrent ? pal.a : 'var(--pms-subtle-text)',
                  boxShadow: isCurrent ? `0 0 0 4px ${pal.glow}` : 'none',
                }}
              >
                {isDone ? <Check className="w-3.5 h-3.5 stroke-[2.8]" /> : i + 1}
              </div>
              <span
                className="mt-1.5 text-[10px] font-bold text-center leading-tight line-clamp-1"
                style={{
                  color: isCurrent
                    ? 'var(--pms-ink)'
                    : isDone
                      ? 'var(--pms-muted)'
                      : 'var(--pms-subtle-text)',
                }}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress Meter */}
      <div className="relative z-10 space-y-2 mb-5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--pms-muted)] font-medium truncate pr-3">
            {steps[activeStep]?.detail}
          </span>
          <span
            className="font-extrabold tabular-nums shrink-0"
            style={{
              backgroundImage: grad,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            {pct}%
          </span>
        </div>

        <div
          className="h-2 rounded-full overflow-hidden"
          style={{ backgroundColor: 'var(--pms-lavender-surface)' }}
        >
          <div
            className="h-full rounded-full relative overflow-hidden transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%`, backgroundImage: grad }}
          >
            {!prefersReduced && (
              <div className="absolute inset-0 pms-shimmer opacity-55" />
            )}
          </div>
        </div>
      </div>

      {/* Rotating Pearl Glass Tip */}
      {tips.length > 0 && (
        <div
          className="relative z-10 rounded-2xl px-4 py-3 text-xs font-medium text-[var(--pms-muted)] leading-relaxed border flex items-center gap-2.5"
          style={{
            backgroundColor: 'var(--pms-pearl)',
            borderColor: 'var(--pms-border)',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundImage: grad }}
          />
          <motion.span
            key={tipIdx}
            initial={prefersReduced ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            {tips[tipIdx]}
          </motion.span>
        </div>
      )}

      <style>{`
        @keyframes pms-conic-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
