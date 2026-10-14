import { useCallback, useState } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import { UploadCloud, AlertTriangle, AlertCircle, X } from 'lucide-react';
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
  if (exts.includes('.pdf')) return 'PDF files supported';
  const formatted = exts.map((e) => e.replace('.', '').toUpperCase()).join(', ');
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

  return (
    <div
      {...getRootProps()}
      className={cn(
        'w-full max-w-3xl mx-auto p-8 sm:p-10 border-4 border-dashed rounded-2xl cursor-pointer transition-colors duration-200 flex flex-col items-center justify-center text-center',
        isDark
          ? cn(
              'max-w-none mx-0 bg-slate-900/80 border-slate-600',
              isDragActive ? 'border-sky-500 bg-slate-800' : 'hover:border-sky-500 hover:bg-slate-800/90',
            )
          : cn(
              'bg-white',
              isDragActive ? 'border-rose-500 bg-rose-50/40' : 'border-gray-200 hover:border-rose-400 hover:bg-gray-50',
            ),
        className,
      )}
    >
      <input {...getInputProps()} />

      {/* Icon */}
      <div
        className={cn(
          'w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center mb-4 sm:mb-5 transition-colors',
          isDragActive
            ? isDark ? 'bg-sky-500/20 text-sky-400' : 'bg-rose-100 text-rose-600'
            : isDark ? 'bg-sky-900/80 text-sky-400' : 'bg-rose-50 text-rose-400',
        )}
      >
        <UploadCloud className="w-8 h-8 sm:w-10 sm:h-10" />
      </div>

      {/* Title */}
      <h3
        className={cn(
          'text-xl sm:text-2xl font-bold mb-1.5',
          isDark ? 'text-slate-100' : 'text-gray-900',
        )}
      >
        {isDragActive ? 'Drop it here!' : title}
      </h3>

      {/* Subtitle + file type hint */}
      <p className={cn('text-sm sm:text-base', isDark ? 'text-slate-400' : 'text-gray-500')}>
        {subtitle}
      </p>
      {hint && (
        <p className={cn('text-xs mt-1', isDark ? 'text-slate-500' : 'text-gray-400')}>
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

      {/* Max size warning */}
      <div className={cn('flex items-center gap-1.5 mt-2 text-xs', isDark ? 'text-slate-500' : 'text-gray-400')}>
        <AlertTriangle className="w-3 h-3 text-amber-500" />
        <span>Max size: {maxAllowedMB} MB (Safe browser processing limit)</span>
      </div>

      {/* CTA Button */}
      <span
        className={cn(
          'mt-6 sm:mt-7 inline-flex items-center justify-center px-6 sm:px-8 py-3 sm:py-3.5 text-sm sm:text-base font-bold rounded-xl transition-all shadow-md select-none',
          isDark
            ? 'bg-sky-600 text-white hover:bg-sky-500'
            : 'bg-rose-600 text-white hover:bg-rose-700',
          isDragActive && 'scale-95',
        )}
      >
        {buttonLabel}
      </span>
    </div>
  );
}
