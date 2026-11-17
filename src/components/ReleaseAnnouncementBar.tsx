import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, CheckCircle2, Sparkles, X } from 'lucide-react';
import { RELEASE_NOTES, type ReleaseHighlight } from '../config/releaseNotes';

const ACCENT_STYLES: Record<ReleaseHighlight['accent'], { bg: string; fg: string }> = {
  rose: { bg: 'var(--pms-soft-rose)', fg: 'var(--pms-rose)' },
  violet: { bg: 'var(--pms-soft-lavender)', fg: 'var(--pms-violet)' },
  blue: { bg: 'var(--pms-soft-blue)', fg: 'var(--pms-blue)' },
  mint: { bg: 'var(--pms-soft-mint)', fg: '#059669' },
};

interface ReleaseAnnouncementBarProps {
  visible: boolean;
  onDismiss: () => void;
  onOpenDetails: () => void;
  onTryFeature: () => void;
}

/**
 * Non-blocking top announcement bar shown once per release version.
 * Sits in-flow directly beneath the fixed navbar so content never overlaps.
 */
export function ReleaseAnnouncementBar({
  visible,
  onDismiss,
  onOpenDetails,
  onTryFeature,
}: ReleaseAnnouncementBarProps) {
  const prefersReduced = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          role="region"
          aria-label="PDF Media Suite update notification"
          data-testid="release-announcement-bar"
          initial={prefersReduced ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={prefersReduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden border-b"
          style={{
            background:
              'linear-gradient(90deg, var(--pms-soft-rose) 0%, var(--pms-soft-lavender) 52%, var(--pms-soft-blue) 100%)',
            borderColor: 'var(--pms-border)',
          }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs sm:text-[13px]">
            <div className="flex items-center justify-between sm:justify-start gap-2 min-w-0 sm:flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider shrink-0 shadow-xs"
                  style={{
                    background: 'var(--pms-cta-gradient)',
                    color: '#FFFFFF',
                  }}
                >
                  <Sparkles className="w-3 h-3" />
                  {RELEASE_NOTES.badgeLabel}
                </span>
                <p className="truncate sm:whitespace-normal font-semibold leading-snug" style={{ color: 'var(--pms-ink)' }}>
                  <span>{RELEASE_NOTES.bannerTitle}</span>
                  <span className="hidden md:inline font-medium" style={{ color: 'var(--pms-muted)' }}>
                    {' '}
                    — {RELEASE_NOTES.bannerSubtitle}
                  </span>
                </p>
              </div>

              <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss update notification"
                title="Dismiss (won't show again for v2.0)"
                className="sm:hidden p-1 rounded-full shrink-0 transition-colors hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                style={{ color: 'var(--pms-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0 sm:ml-auto">
              <button
                type="button"
                onClick={onOpenDetails}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-bold transition-colors hover:border-rose-300 dark:hover:border-rose-700 cursor-pointer"
                style={{
                  backgroundColor: 'var(--pms-white)',
                  borderColor: 'var(--pms-border-strong)',
                  color: 'var(--pms-ink)',
                }}
              >
                See What&apos;s New
              </button>

              <Link
                to={RELEASE_NOTES.quickTryPath}
                onClick={onTryFeature}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold text-white transition-opacity hover:opacity-95"
                style={{ background: 'var(--pms-cta-gradient)' }}
              >
                {RELEASE_NOTES.quickTryLabel}
                <ArrowRight className="w-3 h-3" />
              </Link>

              <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss update notification (desktop)"
                title="Dismiss (won't show again for v2.0)"
                className="hidden sm:inline-flex p-1 rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                style={{ color: 'var(--pms-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface WhatsNewModalProps {
  open: boolean;
  onClose: () => void;
  onSelectFeature: () => void;
}

/**
 * Clean release highlights modal opened manually via "See What's New" or the navbar v2.0 pill.
 */
export function WhatsNewModal({ open, onClose, onSelectFeature }: WhatsNewModalProps) {
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/55 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="whats-new-title"
          onClick={onClose}
        >
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden"
            style={{
              backgroundColor: 'var(--pms-white)',
              borderColor: 'var(--pms-border-strong)',
              color: 'var(--pms-ink)',
            }}
          >
            {/* Header */}
            <div
              className="px-6 py-4 border-b flex items-center justify-between gap-3"
              style={{
                background:
                  'linear-gradient(135deg, var(--pms-soft-rose) 0%, var(--pms-soft-lavender) 55%, var(--pms-soft-blue) 100%)',
                borderColor: 'var(--pms-border)',
              }}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider text-white"
                  style={{ background: 'var(--pms-cta-gradient)' }}
                >
                  <Sparkles className="w-3 h-3" />
                  {RELEASE_NOTES.version}
                </span>
                <div>
                  <h2 id="whats-new-title" className="text-base sm:text-lg font-extrabold tracking-tight">
                    What&apos;s New in PDF Media Suite 2.0
                  </h2>
                  <p className="text-xs font-medium" style={{ color: 'var(--pms-muted)' }}>
                    Try the newly upgraded conversion, OCR &amp; unlocking tools below.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close release notes"
                className="p-2 rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                style={{ color: 'var(--pms-muted)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Upgraded feature cards */}
            <div className="p-5 sm:p-6 max-h-[65vh] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {RELEASE_NOTES.highlights.map((item) => {
                const st = ACCENT_STYLES[item.accent];
                return (
                  <Link
                    key={item.id}
                    to={item.path}
                    onClick={onSelectFeature}
                    className="group p-4 rounded-2xl border transition-all hover:-translate-y-0.5 hover:border-rose-300 dark:hover:border-rose-700 flex flex-col justify-between gap-2.5"
                    style={{
                      backgroundColor: 'var(--pms-pearl)',
                      borderColor: 'var(--pms-border)',
                    }}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider"
                          style={{ backgroundColor: st.bg, color: st.fg }}
                        >
                          {item.tag}
                        </span>
                        <ArrowRight
                          className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
                          style={{ color: 'var(--pms-rose)' }}
                        />
                      </div>
                      <h3
                        className="text-sm font-bold group-hover:text-[var(--pms-rose)] transition-colors"
                        style={{ color: 'var(--pms-ink)' }}
                      >
                        {item.title}
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--pms-muted)' }}>
                        {item.summary}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Footer */}
            <div
              className="px-6 py-3.5 border-t flex flex-wrap items-center justify-between gap-3 text-xs"
              style={{
                backgroundColor: 'var(--pms-lavender-surface)',
                borderColor: 'var(--pms-border)',
              }}
            >
              <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: 'var(--pms-muted)' }}>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                Shown once per release — reopen anytime via the {RELEASE_NOTES.badgeLabel} badge in the navbar.
              </span>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-full font-bold text-white text-xs transition-opacity hover:opacity-95 cursor-pointer"
                style={{ background: 'var(--pms-cta-gradient)' }}
              >
                Got it
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
