import { useState, useCallback } from 'react';

interface PdfProcessorOptions {
  onSuccess?: (url: string) => void;
  onError?: (msg: string) => void;
}

interface UsePdfProcessorResult {
  file: File | null;
  setFile: React.Dispatch<React.SetStateAction<File | null>>;
  busy: boolean;
  resultUrl: string | null;
  setResultUrl: React.Dispatch<React.SetStateAction<string | null>>;
  run: (fn: () => Promise<string>) => Promise<void>;
  reset: () => void;
  handleDrop: (files: File[]) => void;
}

/**
 * Shared hook for PDF tool pages.
 * Manages: file selection, loading state, result URL, error handling.
 *
 * Usage:
 *   const { file, busy, resultUrl, run, reset, handleDrop } = usePdfProcessor({
 *     onError: (msg) => toast.error(msg),
 *   });
 *
 *   const process = () => run(async () => {
 *     // ... your processing logic ...
 *     return URL.createObjectURL(blob);
 *   });
 */
export function usePdfProcessor(options: PdfProcessorOptions = {}): UsePdfProcessorResult {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const run = useCallback(
    async (fn: () => Promise<string>) => {
      setBusy(true);
      try {
        const url = await fn();
        setResultUrl(url);
        options.onSuccess?.(url);
      } catch (e: any) {
        const msg = e?.message || 'Something went wrong. Please try again.';
        options.onError?.(msg);
      } finally {
        setBusy(false);
      }
    },
    [options.onSuccess, options.onError],
  );

  const reset = useCallback(() => {
    setFile(null);
    setResultUrl(null);
    setBusy(false);
  }, []);

  const handleDrop = useCallback((files: File[]) => {
    if (files[0]) {
      setFile(files[0]);
      setResultUrl(null);
    }
  }, []);

  return { file, setFile, busy, resultUrl, setResultUrl, run, reset, handleDrop };
}
