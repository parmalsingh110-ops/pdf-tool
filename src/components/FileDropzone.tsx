import { useCallback, useState } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import { motion, useReducedMotion } from 'motion/react';
import { UploadCloud, ShieldCheck, AlertCircle, X, FileText, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';

const MAX_WARN_MB = 50;
const DEFAULT_MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB hard safety ceiling

interface FileDropzoneProps {
  onDrop: (acceptedFiles: File[]) => void;
  onDropRejected?: (message: string) => void;
  accept?: Record<string, string[]>;
  maxFiles?: number;
  maxSize?: number;
  multiple?: boolean;
  title?: string;
  subtitle?: string;
  className?: string;
  /** Light (default): white card. Dark: slate panel for dark pages. */
  variant?: 'light' | 'dark';
  buttonLabel?: string;
}

function getFileTypeHint(accept: Record<string, string[]>): string {
  const exts = Object.values(accept).flat();
  if (exts.length === 0) return '';
  if (exts.includes('.pdf') && exts.length === 1) return 'PDF files supported';
  const formatted = [...new Set(exts.map((e) => e.replace('.', '').toUpperCase()))].join(', ');
  return `${formatted} files supported`;
}

export default function FileDropzone({
  onDrop,
  onDropRejected,
  accept = { 'application/pdf': ['.pdf'] },
  maxFiles = 0,
  maxSize = DEFAULT_MAX_SIZE_BYTES,
  multiple = true,
  title = 'Select PDF files',
  subtitle = 'or drop PDFs here',
  className,
  variant = 'light',
  buttonLabel = 'Select files',
}: FileDropzoneProps) {
  const [dropError, setDropError] = useState<string | null>(null);

  const handleDrop = useCallback(
    (acceptedFiles: File[]) => {
      setDropError(null);
      // Warn if any file exceeds 50 MB (processing may be slower)
      const oversized = acceptedFiles.filter((f) => f.size > MAX_WARN_MB * 1024 * 1024);
      if (oversized.length > 0 && onDropRejected) {
        onDropRejected(
          `Large file detected (${(oversized[0].size / 1024 / 1024).toFixed(1)} MB). Processing may take a moment.`,
        );
      }
      onDrop(acceptedFiles);
    },
    [onDrop, onDropRejected],
  );

  const handleRejected = useCallback(
    (fileRejections: FileRejection[]) => {
      if (fileRejections.length === 0) return;
      const codes = fileRejections.flatMap((r) => r.errors.map((e) => e.code));
      const uniq = [...new Set(codes)];
      const maxMB = Math.round(maxSize / (1024 * 1024));
      let msg = 'Some files were not added.';
      if (uniq.includes('file-too-large')) {
        const rejectedSizeMB = (fileRejections[0].file.size / (1024 * 1024)).toFixed(1);
        msg = `File too large (${rejectedSizeMB} MB). Maximum allowed size is ${maxMB} MB to prevent browser crashes.`;
      } else if (uniq.includes('file-invalid-type')) {
        msg = 'File type not accepted. Please check allowed formats.';
      } else if (uniq.includes('too-many-files')) {
        msg = 'Too many files at once. Please upload fewer files.';
      }
      setDropError(msg);
      if (onDropRejected) {
        onDropRejected(msg);
      }
    },
    [maxSize, onDropRejected],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    onDropRejected: handleRejected,
    accept,
    maxFiles: maxFiles > 0 ? maxFiles : undefined,
    maxSize,
    multiple,
  });

  const isDark = variant === 'dark';
  const hint = getFileTypeHint(accept);
  const maxAllowedMB = Math.round(maxSize / (1024 * 1024));
  const prefersReduced = useReducedMotion();

  return (
    <div
      {...getRootProps()}
      style={
        isDark
          ? undefined
          : {
              backgroundColor: isDragActive ? 'var(--pms-soft-rose)' : 'var(--pms-white)',
              borderColor: isDragActive ? 'var(--pms-rose)' : 'var(--pms-border-strong)',
              boxShadow: 'var(--pms-shadow-card)',
            }
      }
      className={cn(
        'group relative overflow-hidden w-full max-w-3xl mx-auto p-8 sm:p-10 border-2 border-dashed rounded-[1.75rem] cursor-pointer transition-all duration-200 flex flex-col items-center justify-center text-center',
        isDark
          ? cn(
              'max-w-none mx-0 bg-slate-900/80 border-slate-600',
              isDragActive ? 'border-sky-500 bg-slate-800' : 'hover:border-sky-500 hover:bg-slate-800/90',
            )
          : cn(
              'hover:border-rose-400/80 dark:hover:border-rose-500/70',
              isDragActive && 'scale-[1.01]',
            ),
        className,
      )}
    >
      <input {...getInputProps()} />

      {/* Pure-CSS GPU radial ambient spotlight on hover/drag (zero JS layout cost) */}
      {!isDark && (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-20 -left-20 w-64 h-64 rounded-full opacity-0 group-hover:opacity-85 transition-opacity duration-300"
            style={{ background: 'radial-gradient(circle, var(--pms-soft-rose) 0%, transparent 70%)' }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-20 -right-20 w-64 h-64 rounded-full opacity-0 group-hover:opacity-85 transition-opacity duration-300"
            style={{ background: 'radial-gradient(circle, var(--pms-soft-lavender) 0%, transparent 70%)' }}
          />
        </>
      )}

      {/* 2.5D Layered Document Emblem + GPU Composited Float (no idle JS rAF loop) */}
      <div className="relative mb-5 sm:mb-6 flex items-center justify-center">
        {/* Left fanned micro-sheet */}
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute w-12 h-14 rounded-xl border flex items-center justify-center -translate-x-6 translate-y-1 -rotate-12 opacity-70 transition-transform duration-300 group-hover:-translate-x-8 group-hover:-rotate-[16deg]',
            isDragActive && '-translate-x-9 -rotate-[20deg] scale-105',
            isDark ? 'bg-slate-800 border-slate-700 text-sky-400/70' : 'bg-[var(--pms-pearl)] border-[var(--pms-border-strong)] text-[var(--pms-rose)]',
          )}
        >
          <FileText className="w-5 h-5 opacity-75" />
        </span>

        {/* Right fanned micro-sheet */}
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute w-12 h-14 rounded-xl border flex items-center justify-center translate-x-6 translate-y-1 rotate-12 opacity-70 transition-transform duration-300 group-hover:translate-x-8 group-hover:rotate-[16deg]',
            isDragActive && 'translate-x-9 rotate-[20deg] scale-105',
            isDark ? 'bg-slate-800 border-slate-700 text-indigo-400/70' : 'bg-[var(--pms-pearl)] border-[var(--pms-border-strong)] text-[var(--pms-blue)]',
          )}
        />

        {/* Center primary UploadCloud tile */}
        <motion.div
          animate={
            prefersReduced
              ? undefined
              : isDragActive
                ? { y: -6, scale: 1.08 }
                : { y: 0, scale: 1 }
          }
          transition={{ type: 'spring', stiffness: 360, damping: 20 }}
          style={
            isDark
              ? undefined
              : {
                  backgroundColor: isDragActive ? 'var(--pms-soft-rose)' : 'var(--pms-soft-lavender)',
                  color: isDragActive ? 'var(--pms-rose)' : 'var(--pms-violet)',
                  borderColor: 'var(--pms-border)',
                }
          }
          className={cn(
            'relative z-10 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border flex items-center justify-center shadow-sm transition-transform duration-200 group-hover:scale-105',
            !prefersReduced && !isDragActive && 'pms-float-a',
            isDark && (isDragActive ? 'bg-sky-500/20 text-sky-400 border-sky-500/40' : 'bg-sky-900/80 text-sky-400 border-slate-700'),
          )}
        >
          <UploadCloud className="w-8 h-8 sm:w-10 sm:h-10" />
        </motion.div>
      </div>

      {/* Title */}
      <h3
        style={isDark ? undefined : { color: 'var(--pms-ink)' }}
        className={cn(
          'text-xl sm:text-2xl font-bold mb-1.5',
          isDark && 'text-slate-100',
        )}
      >
        {isDragActive ? 'Drop it here!' : title}
      </h3>

      {/* Subtitle + file type hint */}
      <p
        style={isDark ? undefined : { color: 'var(--pms-muted)' }}
        className={cn('text-sm sm:text-base', isDark && 'text-slate-400')}
      >
        {subtitle}
      </p>
      {hint && (
        <p
          style={isDark ? undefined : { color: 'var(--pms-subtle-text)' }}
          className={cn('text-xs mt-1', isDark && 'text-slate-500')}
        >
          {hint}
        </p>
      )}

      {/* Rejection error banner */}
      {dropError && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setDropError(null);
          }}
          className="mt-3 px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs sm:text-sm font-medium flex items-center gap-2 max-w-md shadow-sm transition-all"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600 dark:text-rose-400" />
          <span className="flex-1 text-left">{dropError}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDropError(null);
            }}
            className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-200 p-0.5"
            aria-label="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Trust & capacity micro-pills */}
      <div
        style={isDark ? undefined : { color: 'var(--pms-subtle-text)' }}
        className={cn('relative z-10 flex flex-wrap items-center justify-center gap-2 mt-3 text-xs', isDark && 'text-slate-400')}
      >
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border font-medium',
            isDark ? 'bg-slate-800/90 border-slate-700 text-emerald-400' : 'bg-[var(--pms-pearl)] border-[var(--pms-border)]',
          )}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Up to {maxAllowedMB} MB</span>
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border font-medium',
            isDark ? 'bg-slate-800/90 border-slate-700 text-sky-400' : 'bg-[var(--pms-pearl)] border-[var(--pms-border)]',
          )}
        >
          <Sparkles className="w-3 h-3 text-[var(--pms-violet)]" />
          <span>Zero watermark · Private</span>
        </span>
      </div>

      {/* CTA Button */}
      <span
        className={cn(
          'relative z-10 mt-5 sm:mt-6 inline-flex items-center justify-center px-6 sm:px-8 py-3 sm:py-3.5 text-sm sm:text-base font-bold rounded-full transition-all select-none',
          isDark
            ? 'bg-sky-600 text-white hover:bg-sky-500 shadow-md'
            : 'pms-btn-primary',
          isDragActive && 'scale-95',
        )}
      >
        {buttonLabel}
      </span>
    </div>
  );
}
