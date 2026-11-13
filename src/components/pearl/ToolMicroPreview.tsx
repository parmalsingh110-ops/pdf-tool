import { motion, useReducedMotion } from 'motion/react';

export type MicroPreviewVariant =
  | 'merge'
  | 'split'
  | 'compress'
  | 'convert'
  | 'edit'
  | 'ocr'
  | 'crop'
  | 'remove-bg'
  | 'compare'
  | 'security'
  | 'sign'
  | 'generic';

/**
 * Automatically maps any verified tool route path to a matching behavioral micro-preview.
 */
export function inferToolMicroVariant(path: string): MicroPreviewVariant {
  const p = path.toLowerCase();
  if (p.includes('merge') || p.includes('bundle') || p.includes('alternate-mix') || p.includes('gang-print')) return 'merge';
  if (p.includes('split') || p.includes('extract-pages')) return 'split';
  if (p.includes('compress') || p.includes('increase-size') || p.includes('ink-saver') || p.includes('compactor')) return 'compress';
  if (p.includes('to-word') || p.includes('to-excel') || p.includes('to-ppt') || p.includes('to-jpg') || p.includes('to-pdf') || p.includes('converter') || p.includes('to-images') || p.includes('to-markdown')) return 'convert';
  if (p.includes('ocr') || p.includes('searchable') || p.includes('kyc') || p.includes('image-text')) return 'ocr';
  if (p.includes('remove-background') || p.includes('clean-signature') || p.includes('xerox')) return 'remove-bg';
  if (p.includes('crop') || p.includes('resizer') || p.includes('passport') || p.includes('pvc') || p.includes('exact-image')) return 'crop';
  if (p.includes('compare') || p.includes('redline') || p.includes('forensic')) return 'compare';
  if (p.includes('sign') || p.includes('attest') || p.includes('stamp') || p.includes('handwriting')) return 'sign';
  if (p.includes('protect') || p.includes('unlock') || p.includes('redact') || p.includes('aadhaar') || p.includes('drm') || p.includes('airgap') || p.includes('zero-trace') || p.includes('hash') || p.includes('sanitize')) return 'security';
  if (p.includes('edit') || p.includes('watermark') || p.includes('page-numbers') || p.includes('annotate') || p.includes('organize') || p.includes('rotate')) return 'edit';
  return 'generic';
}

interface ToolMicroPreviewProps {
  variant: MicroPreviewVariant;
  className?: string;
}

/**
 * Category-aware compact SVG/CSS micro-animation.
 * Transitions subtly on parent `.group:hover` and respects `prefers-reduced-motion`.
 */
export default function ToolMicroPreview({ variant, className = '' }: ToolMicroPreviewProps) {
  const prefersReduced = useReducedMotion();
  const hoverMotion = prefersReduced ? '' : 'transition-all duration-300 ease-out';

  return (
    <div
      aria-hidden="true"
      className={`relative w-12 h-9 rounded-lg border border-[#E7E3F1] dark:border-slate-700 bg-[#FAF9FF] dark:bg-slate-800/80 overflow-hidden flex items-center justify-center shrink-0 ${className}`}
    >
      {variant === 'merge' && (
        <div className="relative w-8 h-6 flex items-center justify-center">
          <span
            className={`absolute w-4 h-5 rounded-[3px] border border-rose-300 bg-white dark:bg-slate-900 shadow-2xs -translate-x-2 -rotate-6 ${
              prefersReduced ? '' : 'group-hover:translate-x-0 group-hover:rotate-0 transition-transform duration-300'
            }`}
          />
          <span
            className={`absolute w-4 h-5 rounded-[3px] border border-violet-300 bg-[#F4F1FF] dark:bg-slate-800 shadow-2xs translate-x-2 rotate-6 ${
              prefersReduced ? '' : 'group-hover:translate-x-0 group-hover:rotate-0 transition-transform duration-300'
            }`}
          />
        </div>
      )}

      {variant === 'split' && (
        <div className="relative w-8 h-6 flex items-center justify-center gap-0.5">
          <span
            className={`w-3.5 h-5 rounded-[3px] border border-rose-300 bg-white dark:bg-slate-900 ${
              prefersReduced ? '' : 'group-hover:-translate-x-1 group-hover:-rotate-6 transition-transform duration-300'
            }`}
          />
          <span className="w-[1px] h-5 border-l border-dashed border-rose-400/70" />
          <span
            className={`w-3.5 h-5 rounded-[3px] border border-sky-300 bg-[#E1F5FF]/70 dark:bg-slate-800 ${
              prefersReduced ? '' : 'group-hover:translate-x-1 group-hover:rotate-6 transition-transform duration-300'
            }`}
          />
        </div>
      )}

      {variant === 'compress' && (
        <div className="flex items-center gap-1">
          <span className={`text-[8px] font-black text-emerald-600 ${hoverMotion} ${prefersReduced ? '' : 'group-hover:translate-x-0.5'}`}>
            ›
          </span>
          <span
            className={`w-4 h-5 rounded-[3px] border border-emerald-400/80 bg-[#DDF8EF] dark:bg-emerald-950/60 ${hoverMotion} ${
              prefersReduced ? '' : 'group-hover:scale-y-75 group-hover:scale-x-90'
            }`}
          />
          <span className={`text-[8px] font-black text-emerald-600 ${hoverMotion} ${prefersReduced ? '' : 'group-hover:-translate-x-0.5'}`}>
            ‹
          </span>
        </div>
      )}

      {variant === 'convert' && (
        <div className="flex items-center gap-1">
          <span className="w-3.5 h-4 rounded-[2px] bg-[#FFE4ED] border border-rose-300 text-[6px] font-black text-rose-700 flex items-center justify-center">
            P
          </span>
          <span
            className={`text-[9px] font-bold text-[#0284C7] ${hoverMotion} ${
              prefersReduced ? '' : 'group-hover:translate-x-0.5'
            }`}
          >
            →
          </span>
          <span className="w-3.5 h-4 rounded-[2px] bg-[#E1F5FF] border border-sky-300 text-[6px] font-black text-sky-700 flex items-center justify-center">
            W
          </span>
        </div>
      )}

      {variant === 'edit' && (
        <div className="relative w-7 h-5 rounded-[3px] border border-dashed border-[#7C3AED]/70 bg-[#EEE7FF]/50 dark:bg-violet-950/40 flex flex-col justify-center gap-0.5 px-1">
          <span className="absolute -top-0.5 -left-0.5 w-1 h-1 bg-[#7C3AED] rounded-[1px]" />
          <span className="absolute -top-0.5 -right-0.5 w-1 h-1 bg-[#7C3AED] rounded-[1px]" />
          <span className="absolute -bottom-0.5 -left-0.5 w-1 h-1 bg-[#7C3AED] rounded-[1px]" />
          <span className="absolute -bottom-0.5 -right-0.5 w-1 h-1 bg-[#7C3AED] rounded-[1px]" />
          <span className={`h-1 w-4 rounded-full bg-[#17172F]/70 dark:bg-white/70 ${hoverMotion} ${prefersReduced ? '' : 'group-hover:w-5'}`} />
          <span className="h-1 w-3 rounded-full bg-violet-500/60" />
        </div>
      )}

      {variant === 'ocr' && (
        <div className="relative w-7 h-5 flex flex-col justify-center gap-1">
          <span className="h-1 w-full rounded bg-slate-300 dark:bg-slate-600" />
          <span className={`h-1 w-4/5 rounded bg-sky-400/70 ${hoverMotion} ${prefersReduced ? '' : 'group-hover:bg-violet-500'}`} />
          <span className="h-1 w-3/5 rounded bg-slate-300 dark:bg-slate-600" />
          <motion.span
            animate={prefersReduced ? undefined : { top: ['4px', '15px', '4px'] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-x-0 h-[1.5px] bg-[#0284C7] top-1"
          />
        </div>
      )}

      {variant === 'crop' && (
        <div className="relative w-6 h-5 border border-sky-300 bg-white dark:bg-slate-900 rounded-[2px]">
          <span
            className={`absolute inset-1 border border-dashed border-[#0284C7] ${hoverMotion} ${
              prefersReduced ? '' : 'group-hover:inset-0.5'
            }`}
          />
        </div>
      )}

      {variant === 'remove-bg' && (
        <div className="relative w-7 h-5 rounded-[3px] pms-checkerboard border border-[#E7E3F1] dark:border-slate-600 overflow-hidden flex items-center justify-center">
          <span
            className={`w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-[#E11D48] to-[#7C3AED] ${hoverMotion} ${
              prefersReduced ? '' : 'group-hover:scale-110'
            }`}
          />
        </div>
      )}

      {variant === 'compare' && (
        <div className="relative w-7 h-5 rounded-[3px] border border-[#E7E3F1] dark:border-slate-600 overflow-hidden flex">
          <span className="w-1/2 h-full bg-[#FFE4ED]" />
          <span className="w-1/2 h-full bg-[#E1F5FF]" />
          <span
            className={`absolute top-0 bottom-0 left-1/2 w-[1.5px] bg-[#7C3AED] ${hoverMotion} ${
              prefersReduced ? '' : 'group-hover:translate-x-1'
            }`}
          />
        </div>
      )}

      {variant === 'security' && (
        <div className="relative w-7 h-5 flex flex-col items-center justify-center gap-0.5">
          <span className={`w-5 h-1.5 rounded-xs bg-[#17172F] dark:bg-slate-200 ${hoverMotion} ${prefersReduced ? '' : 'group-hover:scale-x-105'}`} />
          <span className="w-4 h-1 rounded-xs bg-violet-400/70" />
        </div>
      )}

      {variant === 'sign' && (
        <svg viewBox="0 0 32 20" className="w-7 h-5" fill="none">
          <motion.path
            d="M4 14 C 8 6, 12 16, 16 9 C 19 4, 22 14, 28 11"
            stroke="#7C3AED"
            strokeWidth="1.8"
            strokeLinecap="round"
            initial={prefersReduced ? false : { pathLength: 0.7 }}
            whileInView={prefersReduced ? undefined : { pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
            className={prefersReduced ? '' : 'transition-colors duration-300 group-hover:stroke-[#E11D48]'}
          />
        </svg>
      )}

      {variant === 'generic' && (
        <div className="w-5 h-6 rounded-[3px] border border-[#D4CDE8] bg-white dark:bg-slate-900 flex flex-col justify-center gap-1 px-1">
          <span className="h-1 w-full rounded bg-rose-400/70" />
          <span className="h-1 w-2/3 rounded bg-violet-400/60" />
        </div>
      )}
    </div>
  );
}

