import { Link } from 'react-router-dom';
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
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

const TONE_MAP: Record<PearlAccentTone, ToneStyle> = {
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
  const prefersReduced = useReducedMotion();

  const spotX = useSpring(useMotionValue(50), { stiffness: 260, damping: 28 });
  const spotY = useSpring(useMotionValue(50), { stiffness: 260, damping: 28 });
  const spotlightBg = useMotionTemplate`radial-gradient(220px circle at ${spotX}% ${spotY}%, ${t.iconBg}, transparent 75%)`;

  const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (prefersReduced) return;
    const rect = e.currentTarget.getBoundingClientRect();
    spotX.set(((e.clientX - rect.left) / rect.width) * 100);
    spotY.set(((e.clientY - rect.top) / rect.height) * 100);
  };

  return (
    <motion.div
      whileHover={prefersReduced ? undefined : { y: -4 }}
      whileTap={prefersReduced ? undefined : { scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      className="h-full"
    >
      <Link
        to={path}
        onMouseMove={handleMouseMove}
        className={`group relative h-full flex flex-col justify-between rounded-2xl border p-4 sm:p-5 overflow-hidden transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pms-rose)] ${t.hoverRing}`}
        style={{
          backgroundColor: 'var(--pms-white)',
          borderColor: 'var(--pms-border)',
          boxShadow: 'var(--pms-shadow-sm)',
        }}
      >
        {!prefersReduced && (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{ background: spotlightBg }}
          />
        )}
        <div className="relative z-10">
          <div className="flex items-start justify-between gap-2 mb-3.5">
            <span
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110 shrink-0"
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
    </motion.div>
  );
}

