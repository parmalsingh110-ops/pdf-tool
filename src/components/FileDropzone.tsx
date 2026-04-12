import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud } from 'lucide-react';
import { cn } from '../lib/utils';

interface FileDropzoneProps {
  onDrop: (acceptedFiles: File[]) => void;
  /** Called when files are rejected (wrong type, too many, etc.). */
  onDropRejected?: (message: string) => void;
  accept?: Record<string, string[]>;
  maxFiles?: number;
  multiple?: boolean;
  title?: string;
  subtitle?: string;
  className?: string;
  /** Light (default): white card. Dark: slate panel for dark pages. */
  variant?: 'light' | 'dark';
  buttonLabel?: string;
}

export default function FileDropzone({
  onDrop,
  onDropRejected,
  accept = { 'application/pdf': ['.pdf'] },
  maxFiles = 0,
  multiple = true,
  title = "Select PDF files",
  subtitle = "or drop PDFs here",
  className,
  variant = 'light',
  buttonLabel = 'Select files',
}: FileDropzoneProps) {
  const handleDrop = useCallback((acceptedFiles: File[]) => {
    onDrop(acceptedFiles);
  }, [onDrop]);

  const handleRejected = useCallback(
    (fileRejections: { file: File; errors: { code: string; message: string }[] }[]) => {
      if (!onDropRejected || fileRejections.length === 0) return;
      const codes = fileRejections.flatMap((r) => r.errors.map((e) => e.code));
      const uniq = [...new Set(codes)];
      let msg = 'Some files were not added.';
      if (uniq.includes('file-invalid-type')) msg = 'File type not accepted. Check allowed formats.';
      else if (uniq.includes('too-many-files')) msg = 'Too many files at once.';
      else if (uniq.includes('file-too-large')) msg = 'A file is too large.';
      onDropRejected(msg);
    },
    [onDropRejected],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    onDropRejected: onDropRejected ? handleRejected : undefined,
    accept,
    maxFiles: maxFiles > 0 ? maxFiles : undefined,
    multiple,
  });

  const isDark = variant === 'dark';

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
              isDragActive ? 'border-red-500 bg-red-50' : 'border-gray-300 hover:border-red-400 hover:bg-gray-50',
            ),
        className,
      )}
    >
      <input {...getInputProps()} />
      <div
        className={cn(
          'w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mb-4 sm:mb-6',
          isDark ? 'bg-sky-900/80 text-sky-400' : 'bg-red-100 text-red-600',
        )}
      >
        <UploadCloud className="w-8 h-8 sm:w-10 sm:h-10" />
      </div>
      <h3
        className={cn(
          'text-xl sm:text-2xl font-bold mb-2',
          isDark ? 'text-slate-100' : 'text-gray-900',
        )}
      >
        {title}
      </h3>
      <p className={cn('text-sm sm:text-base', isDark ? 'text-slate-400' : 'text-gray-500')}>{subtitle}</p>
      {/* Span avoids nested <button> inside dropzone root (invalid + macOS picker quirks). */}
      <span
        className={cn(
          'mt-6 sm:mt-8 inline-flex items-center justify-center px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-semibold rounded-xl transition-colors shadow-md select-none',
          isDark ? 'bg-sky-600 text-white' : 'bg-red-600 text-white',
        )}
      >
        {buttonLabel}
      </span>
    </div>
  );
}
