import { useState, useCallback, useEffect, useRef } from 'react';

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
 * Manages: file selection, loading state, result URL, error handling, and memory cleanup.
 */
export function usePdfProcessor(options: PdfProcessorOptions = {}): UsePdfProcessorResult {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const resultUrlRef = useRef<string | null>(null);
  useEffect(() => {
    resultUrlRef.current = resultUrl;
  }, [resultUrl]);

  // Auto revoke object URL on unmount to prevent browser memory leaks
  useEffect(() => {
    return () => {
      if (resultUrlRef.current && resultUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(resultUrlRef.current);
      }
    };
  }, []);

  const clearResultUrl = useCallback(() => {
    setResultUrl((prev) => {
      if (prev && prev.startsWith('blob:')) {
        URL.revokeObjectURL(prev);
      }
      return null;
    });
  }, []);

  const run = useCallback(
    async (fn: () => Promise<string>) => {
      setBusy(true);
      try {
        const url = await fn();
        setResultUrl((prev) => {
          if (prev && prev.startsWith('blob:') && prev !== url) {
            URL.revokeObjectURL(prev);
          }
          return url;
        });
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
    clearResultUrl();
    setBusy(false);
  }, [clearResultUrl]);

  const handleDrop = useCallback((files: File[]) => {
    if (files[0]) {
      setFile(files[0]);
      clearResultUrl();
    }
  }, [clearResultUrl]);

  return { file, setFile, busy, resultUrl, setResultUrl, run, reset, handleDrop };
}
