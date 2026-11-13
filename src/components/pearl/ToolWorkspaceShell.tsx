import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { ShieldCheck, Sparkles } from 'lucide-react';
import PearlAuroraBackground from './PearlAuroraBackground';
import ToolMicroPreview, { type MicroPreviewVariant } from './ToolMicroPreview';
import type { PearlAccentTone } from './PearlToolCard';

interface ToolWorkspaceShellProps {
  title: string;
  subtitle: string;
  categoryLabel?: string;
  icon: LucideIcon;
  microVariant?: MicroPreviewVariant;
  tone?: PearlAccentTone;
  trustNote?: string;
  children: ReactNode;
}

const TONE_PILL: Record<PearlAccentTone, { bg: string; fg: string }> = {
  rose: { bg: 'var(--pms-soft-rose)', fg: 'var(--pms-rose)' },
  blue: { bg: 'var(--pms-soft-blue)', fg: 'var(--pms-blue)' },
  sky: { bg: 'var(--pms-soft-blue)', fg: 'var(--pms-blue)' },
  violet: { bg: 'var(--pms-soft-lavender)', fg: 'var(--pms-violet)' },
  indigo: { bg: 'var(--pms-soft-lavender)', fg: 'var(--pms-violet)' },
  emerald: { bg: 'var(--pms-soft-mint)', fg: '#047857' },
  amber: { bg: 'var(--pms-soft-rose)', fg: '#B45309' },
};

/**
 * Unified Pearl Aurora workspace frame for tool pages.
 * Renders the calm workspace aurora background, editorial tool header with micro-preview,
 * and clean container stacking without altering underlying upload/processing state.
 */
export default function ToolWorkspaceShell({
  title,
  subtitle,
  categoryLabel = 'PDF Media Suite Workspace',
  icon: Icon,
  microVariant = 'generic',
  tone = 'rose',
  trustNote = 'Browser-first processing · Zero watermarks',
  children,
}: ToolWorkspaceShellProps) {
  const pill = TONE_MAP_PILL(tone);
  const prefersReduced = useReducedMotion();

  return (
    <div
      className="relative flex-1 min-h-[82vh] transition-colors"
      style={{ backgroundColor: 'var(--pms-pearl)', color: 'var(--pms-ink)' }}
    >
      <PearlAuroraBackground mode="workspace" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10 pb-16">
        {/* Editorial Workspace Header */}
        <motion.header
          initial={prefersReduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="text-center max-w-3xl mx-auto mb-8 sm:mb-10"
        >
          <div className="inline-flex items-center gap-2.5 mb-4">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase border"
              style={{
                backgroundColor: pill.bg,
                color: pill.fg,
                borderColor: 'var(--pms-border)',
              }}
            >
              <Sparkles className="w-3 h-3" />
              {categoryLabel}
            </span>
          </div>

          <div className="flex items-center justify-center gap-3.5 mb-3">
            <motion.span
              whileHover={prefersReduced ? undefined : { scale: 1.06, rotate: -3 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              className="w-12 h-12 rounded-2xl flex items-center justify-center border shrink-0"
              style={{
                backgroundColor: 'var(--pms-white)',
                borderColor: 'var(--pms-border)',
                color: pill.fg,
                boxShadow: 'var(--pms-shadow-sm)',
              }}
            >
              <Icon className="w-6 h-6" />
            </motion.span>
            <h1
              className="text-3xl sm:text-4xl font-extrabold tracking-tight text-left sm:text-center"
              style={{ color: 'var(--pms-ink)' }}
            >
              {title}
            </h1>
            <div className="hidden sm:block group">
              <ToolMicroPreview variant={microVariant} />
            </div>
          </div>

          <p className="text-sm sm:text-base leading-relaxed max-w-2xl mx-auto" style={{ color: 'var(--pms-muted)' }}>
            {subtitle}
          </p>

          {trustNote && (
            <div className="mt-3.5 inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--pms-muted)' }}>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{trustNote}</span>
            </div>
          )}
        </motion.header>

        {/* Tool Workspace Body */}
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}

function TONE_MAP_PILL(tone: PearlAccentTone) {
  return TONE_PILL[tone] || TONE_PILL.rose;
}
