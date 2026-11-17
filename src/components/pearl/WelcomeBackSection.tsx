import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Clock3, Sparkles, X } from 'lucide-react';
import { formatRelativeVisit, type RecentEntry } from '../../lib/recentFiles';
import { resolveToolMetadata } from '../GlobalSearch';
import { TONE_MAP } from './PearlToolCard';

interface WelcomeBackSectionProps {
  recent: RecentEntry[];
  onRemove: (path: string) => void;
  onClearAll: () => void;
}

function getTimeGreeting(): string {
  try {
    const hr = new Date().getHours();
    if (hr < 12) return 'Good morning';
    if (hr < 17) return 'Good afternoon';
    return 'Good evening';
  } catch {
    return 'Ready to continue';
  }
}

/**
 * Editorial Pearl Aurora "Welcome back" quick-resume deck for recent tools.
 * Resolves raw paths to proper tool titles, category icons, pastel accents, and timestamps.
 */
export default function WelcomeBackSection({
  recent,
  onRemove,
  onClearAll,
}: WelcomeBackSectionProps) {
  const prefersReduced = useReducedMotion();

  if (recent.length === 0) return null;

  const greeting = getTimeGreeting();
  const latestLabel = formatRelativeVisit(recent[0].at);

  return (
    <section aria-label="Welcome back recent tools" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
      <motion.div
        initial={prefersReduced ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={prefersReduced ? { duration: 0.1 } : { duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
        className="relative rounded-3xl border overflow-hidden p-4 sm:p-5 lg:p-6"
        style={{
          backgroundColor: 'var(--pms-white)',
          borderColor: 'var(--pms-border)',
          boxShadow: 'var(--pms-shadow-card)',
        }}
      >
        {/* Subtle Pearl gradient top edge & soft ambient corner washes */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 inset-x-0 h-[2px] opacity-75"
          style={{ backgroundImage: 'var(--pms-hero-gradient)' }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 -left-20 w-64 h-64 rounded-full opacity-55 blur-2xl"
          style={{ background: 'radial-gradient(circle, var(--pms-soft-rose) 0%, transparent 70%)' }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -right-16 w-72 h-72 rounded-full opacity-55 blur-2xl"
          style={{ background: 'radial-gradient(circle, var(--pms-soft-blue) 0%, transparent 70%)' }}
        />

        {/* Header Row */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="relative w-10 h-10 rounded-xl flex items-center justify-center border shrink-0"
              style={{
                background: 'linear-gradient(135deg, var(--pms-soft-rose) 0%, var(--pms-soft-lavender) 100%)',
                borderColor: 'var(--pms-border)',
                color: 'var(--pms-rose)',
              }}
            >
              <Clock3 className="w-[18px] h-[18px]" />
              {!prefersReduced && (
                <motion.span
                  aria-hidden="true"
                  animate={{ scale: [1, 1.35, 1], opacity: [0.85, 0.35, 0.85] }}
                  transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--pms-rose)] ring-2 ring-[var(--pms-white)]"
                />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-extrabold tracking-tight" style={{ color: 'var(--pms-ink)' }}>
                  Welcome back
                </h2>
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold tracking-tight"
                  style={{
                    backgroundColor: 'var(--pms-soft-lavender)',
                    color: 'var(--pms-violet)',
                  }}
                >
                  <Sparkles className="w-3 h-3" />
                  {greeting}
                </span>
              </div>
              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--pms-muted)' }}>
                Pick up right where you left off · Last opened <span className="font-semibold" style={{ color: 'var(--pms-ink)' }}>{latestLabel}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border"
              style={{
                backgroundColor: 'var(--pms-pearl)',
                borderColor: 'var(--pms-border)',
                color: 'var(--pms-muted)',
              }}
            >
              {recent.length} recent {recent.length === 1 ? 'tool' : 'tools'}
            </span>
            <motion.button
              type="button"
              whileTap={prefersReduced ? undefined : { scale: 0.96 }}
              onClick={onClearAll}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors hover:border-rose-300 dark:hover:border-rose-700 hover:text-[var(--pms-rose)] cursor-pointer"
              style={{
                backgroundColor: 'var(--pms-pearl)',
                borderColor: 'var(--pms-border)',
                color: 'var(--pms-muted)',
              }}
              title="Clear recent tools history"
            >
              <X className="w-3 h-3" />
              Clear
            </motion.button>
          </div>
        </div>

        {/* Recent Tools Interactive Cards Grid */}
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <AnimatePresence mode="popLayout">
            {recent.map((tool, idx) => {
              const meta = resolveToolMetadata(tool.path, tool.title);
              const tone = TONE_MAP[meta.tone] || TONE_MAP.rose;
              const Icon = meta.icon;
              const relTime = formatRelativeVisit(tool.at);
              const isLatest = idx === 0;

              return (
                <motion.div
                  key={tool.path}
                  layout={!prefersReduced}
                  initial={prefersReduced ? false : { opacity: 0, y: 12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
                  transition={
                    prefersReduced
                      ? { duration: 0.1 }
                      : { delay: idx * 0.045, type: 'spring', stiffness: 420, damping: 28 }
                  }
                  whileHover={prefersReduced ? undefined : { y: -3, scale: 1.01 }}
                  whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                  className="relative group"
                >
                  <Link
                    to={meta.path}
                    className={`relative flex items-center gap-3 rounded-2xl border p-3.5 overflow-hidden transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pms-rose)] ${tone.hoverRing}`}
                    style={{
                      backgroundColor: 'var(--pms-pearl)',
                      borderColor: isLatest ? 'var(--pms-border-strong)' : 'var(--pms-border)',
                      boxShadow: 'var(--pms-shadow-sm)',
                    }}
                    title={`${meta.title} · ${meta.category}`}
                  >
                    {/* Hover corner aurora radial tint */}
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -top-8 -right-8 w-28 h-28 rounded-full opacity-0 group-hover:opacity-90 transition-opacity duration-200"
                      style={{ background: `radial-gradient(circle, ${tone.iconBg} 0%, transparent 72%)` }}
                    />

                    {/* Pastel Category Icon Tile */}
                    <span
                      className="relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-3"
                      style={{ backgroundColor: tone.iconBg, color: tone.iconColor }}
                    >
                      <Icon className="w-5 h-5" />
                      {isLatest && (
                        <span
                          aria-hidden="true"
                          className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-[var(--pms-pearl)]"
                          style={{ backgroundColor: tone.iconColor }}
                        />
                      )}
                    </span>

                    {/* Title & Rich Metadata */}
                    <div className="relative z-10 flex-1 min-w-0">
                      <p
                        className="text-sm font-bold leading-snug truncate transition-colors group-hover:text-[var(--pms-ink)]"
                        style={{ color: 'var(--pms-ink)' }}
                      >
                        {meta.title}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] min-w-0">
                        {isLatest && (
                          <span
                            className="px-1.5 py-[1px] rounded-md text-[9.5px] font-extrabold uppercase tracking-wider shrink-0"
                            style={{ backgroundColor: tone.badgeBg, color: tone.badgeText }}
                          >
                            Latest
                          </span>
                        )}
                        <span className="font-semibold truncate" style={{ color: tone.badgeText }}>
                          {meta.category}
                        </span>
                        <span aria-hidden="true" style={{ color: 'var(--pms-subtle-text)' }}>·</span>
                        <span className="shrink-0 tabular-nums" style={{ color: 'var(--pms-subtle-text)' }}>
                          {relTime}
                        </span>
                      </div>
                    </div>

                    {/* Interactive Launch Arrow */}
                    <span
                      aria-hidden="true"
                      className="relative z-10 w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 group-hover:translate-x-0.5"
                      style={{ backgroundColor: 'var(--pms-white)', color: tone.iconColor }}
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </Link>

                  {/* Non-nested individual dismiss button peeking cleanly on card corner hover */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onRemove(meta.path);
                    }}
                    aria-label={`Remove ${meta.title} from recent tools`}
                    title="Remove from recent"
                    className="absolute -top-1.5 -right-1.5 z-20 w-5 h-5 rounded-full border flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity shadow-sm hover:border-rose-300 dark:hover:border-rose-700 hover:text-[var(--pms-rose)] cursor-pointer"
                    style={{
                      backgroundColor: 'var(--pms-white)',
                      borderColor: 'var(--pms-border-strong)',
                      color: 'var(--pms-subtle-text)',
                    }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </motion.div>
    </section>
  );
}
