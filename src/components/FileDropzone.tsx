import { useCallback, useMemo, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { motion, useReducedMotion } from 'motion/react';
import { UploadCloud, ShieldCheck, AlertCircle, X, FileText, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import { inferMimeFromFile, isImageFile, isPdfFile } from '../lib/fileAccept';

const MAX_WARN_MB = 50;
const DEFAULT_MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB hard safety ceiling

const BROAD_IMAGE_EXTS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.heic',
  '.heif',
  '.avif',
  '.jfif',
];

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
  if (exts.length === 0) {
    const keys = Object.keys(accept);
    if (keys.some((k) => k.startsWith('image/'))) return 'Image files supported';
    if (keys.includes('application/pdf')) return 'PDF files supported';
    return '';
  }
  if (exts.includes('.pdf') && exts.length === 1) return 'PDF files supported';
  const formatted = [...new Set(exts.map((e) => e.replace('.', '').toUpperCase()))].join(', ');
  return `${formatted} files supported`;
}

function ensureFileMime(file: File, mime: string, defaultExt?: string): File {
  const currentMime = (file.type || '').trim().toLowerCase();
  const hasConcreteMime =
    Boolean(currentMime) && currentMime !== 'application/octet-stream' && currentMime !== '*/*';
  const needsExt = Boolean(defaultExt && !/\.[a-z0-9]{2,6}$/i.test(file.name || ''));

  if (hasConcreteMime && !needsExt) return file;
  const nextName = needsExt ? `${file.name || 'file'}${defaultExt}` : file.name;
  try {
    return new File([file], nextName, {
      type: hasConcreteMime ? file.type : mime,
      lastModified: file.lastModified || Date.now(),
    });
  } catch {
    return file;
  }
}

async function sniffMagicMime(file: File): Promise<{ mime: string; ext: string } | null> {
  try {
    const buf = await file.slice(0, 16).arrayBuffer();
    const b = new Uint8Array(buf);
    if (b.length < 4) return null;

    // %PDF
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) {
      return { mime: 'application/pdf', ext: '.pdf' };
    }
    // JPEG
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
      return { mime: 'image/jpeg', ext: '.jpg' };
    }
    // PNG
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
      return { mime: 'image/png', ext: '.png' };
    }
    // GIF
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
      return { mime: 'image/gif', ext: '.gif' };
    }
    // BMP
    if (b[0] === 0x42 && b[1] === 0x4d) {
      return { mime: 'image/bmp', ext: '.bmp' };
    }
    // WebP (RIFF....WEBP)
    if (
      b.length >= 12 &&
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
    ) {
      return { mime: 'image/webp', ext: '.webp' };
    }
    // TIFF
    if (
      (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) ||
      (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a)
    ) {
      return { mime: 'image/tiff', ext: '.tiff' };
    }
    // ISO BMFF (HEIC / HEIF / AVIF): ....ftyp<brand>
    if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
      const brand = String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase();
      if (brand === 'avif' || brand === 'avis') {
        return { mime: 'image/avif', ext: '.avif' };
      }
      if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis'].includes(brand)) {
        return { mime: 'image/heic', ext: '.heic' };
      }
    }
  } catch {
    // Ignore read errors
  }
  return null;
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

  // Broaden `image/*` with mobile camera formats (.heic, .heif, .avif, .jfif) so iOS/Android pickers don't drop photos
  const normalizedAccept = useMemo(() => {
    if (!accept) return undefined;
    const next: Record<string, string[]> = {};
    for (const [mime, exts] of Object.entries(accept)) {
      if (mime === 'image/*') {
        next['image/*'] =
          exts.length === 0 ? [] : Array.from(new Set([...exts, ...BROAD_IMAGE_EXTS]));
      } else {
        next[mime] = exts;
      }
    }
    return next;
  }, [accept]);

  const reportRejections = useCallback(
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

  const finalizeDrop = useCallback(
    (acceptedFiles: File[], rescuedFiles: File[], hardRejections: FileRejection[]) => {
      const combined = [...acceptedFiles, ...rescuedFiles];
      const finalRejections = [...hardRejections];

      let allowed = combined;
      const effectiveMax = !multiple ? 1 : maxFiles > 0 ? maxFiles : 0;
      if (effectiveMax > 0 && combined.length > effectiveMax) {
        allowed = combined.slice(0, effectiveMax);
        const overflow = combined.slice(effectiveMax);
        for (const f of overflow) {
          finalRejections.push({
            file: f,
            errors: [{ code: 'too-many-files', message: 'Too many files' }],
          });
        }
      }

      if (allowed.length > 0) {
        setDropError(null);
        // Warn if any file exceeds 50 MB (processing may be slower)
        const oversized = allowed.filter((f) => f.size > MAX_WARN_MB * 1024 * 1024);
        if (oversized.length > 0 && onDropRejected) {
          onDropRejected(
            `Large file detected (${(oversized[0].size / 1024 / 1024).toFixed(1)} MB). Processing may take a moment.`,
          );
        }
        onDrop(allowed);
      }

      if (finalRejections.length > 0) {
        reportRejections(finalRejections);
      }
    },
    [maxFiles, multiple, onDrop, onDropRejected, reportRejections],
  );

  const handleUnifiedDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      if (fileRejections.length === 0) {
        finalizeDrop(acceptedFiles, [], []);
        return;
      }

      const acceptKeys = Object.keys(accept || {}).map((k) => k.toLowerCase());
      const acceptExts = Object.values(accept || {})
        .flat()
        .map((e) => e.toLowerCase());

      const acceptsAnyImage = acceptKeys.includes('image/*');
      const acceptsSomeImage = acceptKeys.some((k) => k.startsWith('image/'));
      const acceptsPdf =
        acceptKeys.includes('application/pdf') || acceptExts.includes('.pdf');

      const syncRescued: File[] = [];
      const needsMagicSniff: FileRejection[] = [];
      const hardRejections: FileRejection[] = [];

      for (const rej of fileRejections) {
        const onlyTypeError =
          rej.errors.length > 0 && rej.errors.every((e) => e.code === 'file-invalid-type');
        if (!onlyTypeError) {
          hardRejections.push(rej);
          continue;
        }

        const f = rej.file;
        const rawType = (f.type || '').trim().toLowerCase();
        const isGenericMime =
          !rawType || rawType === 'application/octet-stream' || rawType === '*/*';

        // 1. Rescue PDF files with empty/generic Android MIME or uppercase extensions
        if (acceptsPdf && isPdfFile(f)) {
          syncRescued.push(ensureFileMime(f, 'application/pdf', '.pdf'));
          continue;
        }

        // 2. Rescue image files (including HEIC/HEIF/AVIF/JFIF or empty Android content:// MIME)
        if (acceptsSomeImage && isImageFile(f)) {
          const inferred = inferMimeFromFile(f, 'image/jpeg').toLowerCase();
          if (acceptsAnyImage || acceptKeys.includes(inferred)) {
            syncRescued.push(ensureFileMime(f, inferred));
            continue;
          }
        }

        // 3. Android content:// picker often yields extensionless files with empty/octet-stream MIME
        if (isGenericMime && (acceptsPdf || acceptsSomeImage)) {
          needsMagicSniff.push(rej);
          continue;
        }

        hardRejections.push(rej);
      }

      if (needsMagicSniff.length === 0) {
        finalizeDrop(acceptedFiles, syncRescued, hardRejections);
        return;
      }

      void (async () => {
        const asyncRescued = [...syncRescued];
        const remainingRejections = [...hardRejections];

        for (const rej of needsMagicSniff) {
          const sniffed = await sniffMagicMime(rej.file);
          if (
            sniffed &&
            ((sniffed.mime === 'application/pdf' && acceptsPdf) ||
              (sniffed.mime.startsWith('image/') &&
                (acceptsAnyImage || acceptKeys.includes(sniffed.mime))))
          ) {
            asyncRescued.push(ensureFileMime(rej.file, sniffed.mime, sniffed.ext));
          } else {
            remainingRejections.push(rej);
          }
        }

        finalizeDrop(acceptedFiles, asyncRescued, remainingRejections);
      })();
    },
    [accept, finalizeDrop],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleUnifiedDrop,
    accept: normalizedAccept,
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
