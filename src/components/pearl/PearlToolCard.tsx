import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import ToolMicroPreview, { inferToolMicroVariant, type MicroPreviewVariant } from './ToolMicroPreview';

export type PearlAccentTone = 'indigo' | 'rose' | 'blue' | 'sky' | 'violet' | 'emerald' | 'amber';

interface ToneStyle {
  iconBg: string;
  iconColor: string;
  badgeBg: string;
  badgeText: string;
  hoverRing: string;
}

export const TONE_MAP: Record<PearlAccentTone, ToneStyle> = {
  rose: {
    iconBg: 'var(--pms-soft-rose)',
    iconColor: 'var(--pms-rose)',
    badgeBg: 'var(--pms-soft-rose)',
    badgeText: 'var(--pms-rose)',
    hoverRing: 'hover:border-rose-300 dark:hover:border-rose-700',
  },
  blue: {
    iconBg: 'var(--pms-soft-blue)',
    iconColor: 'var(--pms-blue)',
    badgeBg: 'var(--pms-soft-blue)',
    badgeText: 'var(--pms-blue)',
    hoverRing: 'hover:border-sky-300 dark:hover:border-sky-700',
  },
  sky: {
    iconBg: 'var(--pms-soft-blue)',
    iconColor: 'var(--pms-blue)',
    badgeBg: 'var(--pms-soft-blue)',
    badgeText: 'var(--pms-blue)',
    hoverRing: 'hover:border-sky-300 dark:hover:border-sky-700',
  },
  violet: {
    iconBg: 'var(--pms-soft-lavender)',
    iconColor: 'var(--pms-violet)',
    badgeBg: 'var(--pms-soft-lavender)',
    badgeText: 'var(--pms-violet)',
    hoverRing: 'hover:border-violet-300 dark:hover:border-violet-700',
  },
  indigo: {
    iconBg: 'var(--pms-soft-lavender)',
    iconColor: 'var(--pms-violet)',
    badgeBg: 'var(--pms-soft-lavender)',
    badgeText: 'var(--pms-violet)',
    hoverRing: 'hover:border-violet-300 dark:hover:border-violet-700',
  },
  emerald: {
    iconBg: 'var(--pms-soft-mint)',
    iconColor: '#047857',
    badgeBg: 'var(--pms-soft-mint)',
    badgeText: '#047857',
    hoverRing: 'hover:border-emerald-300 dark:hover:border-emerald-700',
  },
  amber: {
    iconBg: 'var(--pms-soft-rose)',
    iconColor: '#B45309',
    badgeBg: 'var(--pms-soft-rose)',
    badgeText: '#B45309',
    hoverRing: 'hover:border-amber-300 dark:hover:border-amber-700',
  },
};

export interface PearlToolCardProps {
  title: string;
  desc: string;
  path: string;
  icon: LucideIcon;
  badge?: string;
  tone?: PearlAccentTone;
  microVariant?: MicroPreviewVariant;
}

/**
 * Reusable Pearl Aurora tool card:
 * Neutral pearl/white card base with selective pastel icon surface, category micro-preview,
 * clear contrast hierarchy, and accessible keyboard focus ring.
 */
export default function PearlToolCard({
  title,
  desc,
  path,
  icon: Icon,
  badge,
  tone = 'rose',
  microVariant,
}: PearlToolCardProps) {
  const t = TONE_MAP[tone] || TONE_MAP.rose;
  const resolvedVariant = microVariant || inferToolMicroVariant(path);

  return (
    <Link
      to={path}
      className={`group pms-card relative h-full flex flex-col justify-between rounded-2xl border p-4 sm:p-5 overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pms-rose)] ${t.hoverRing}`}
      style={{
        backgroundColor: 'var(--pms-white)',
        borderColor: 'var(--pms-border)',
        boxShadow: 'var(--pms-shadow-sm)',
      }}
    >
      {/* Pure-CSS zero-JS corner spotlight tint (hover on desktop, tap on mobile) */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-8 -right-8 w-40 h-40 rounded-full opacity-0 group-hover:opacity-90 group-active:opacity-95 transition-opacity duration-200"
        style={{ background: `radial-gradient(circle, ${t.iconBg} 0%, transparent 72%)` }}
      />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-2 mb-3.5">
          <span
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110 group-active:scale-95 shrink-0"
            style={{ backgroundColor: t.iconBg, color: t.iconColor }}
          >
            <Icon className="w-5 h-5" />
          </span>

          <div className="flex flex-col items-end gap-1">
            <ToolMicroPreview variant={resolvedVariant} />
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <h3 className="font-bold text-sm leading-snug tracking-tight" style={{ color: 'var(--pms-ink)' }}>
            {title}
          </h3>
          {badge && (
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight"
              style={{ backgroundColor: t.badgeBg, color: t.badgeText }}
            >
              {badge}
            </span>
          )}
        </div>

        <p className="mt-1.5 text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--pms-muted)' }}>
          {desc}
        </p>
      </div>
    </Link>
  );
}

