import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Download,
  FileText,
  Maximize2,
  Check,
  ChevronRight,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Info,
  CheckCircle2,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { PDFDocument, PDFName } from 'pdf-lib';
import FileDropzone from '../components/FileDropzone';
import { useToast } from '../components/Toast';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

// ─── Presets ────────────────────────────────────────────────────────────────
const PRESETS = [
  { label: '100 KB', bytes: 100 * 1024, portal: 'Many exam forms' },
  { label: '200 KB', bytes: 200 * 1024, portal: 'NTA / JEE' },
  { label: '500 KB', bytes: 500 * 1024, portal: 'UPSC / SSC' },
  { label: '1 MB',   bytes: 1 * 1024 * 1024, portal: 'Railway / Bank' },
  { label: '2 MB',   bytes: 2 * 1024 * 1024, portal: 'High Court' },
  { label: '5 MB',   bytes: 5 * 1024 * 1024, portal: 'General docs' },
  { label: '10 MB',  bytes: 10 * 1024 * 1024, portal: 'Large files' },
  { label: '20 MB',  bytes: 20 * 1024 * 1024, portal: 'Max allowed' },
];

const FAQS = [
  {
    q: 'PDF size increase karna kyon zarori hai?',
    a: 'Bahut se government aur sarkari portals (SSC, UPSC, Railway, bank forms) minimum file size maangte hain jaise "PDF must be between 100 KB and 500 KB". Agar aapki PDF us limit se chhoti hai, toh ye tool use karein.',
  },
  {
    q: 'Increase karne se PDF ki quality kharab hoti hai kya?',
    a: 'Bilkul nahi. Ye tool PDF ke end mein invisible padding append karta hai jo koi bhi PDF reader ignore karta hai. Document ka content, text, images — sab kuch 100% same rehta hai.',
  },
  {
    q: 'Kitni badi PDF ban sakti hai?',
    a: 'Is tool se aap PDF ko 100 KB se lekar 100 MB tak badhaa sakte hain. Government portals ke liye 100 KB, 200 KB, 500 KB, 1 MB, 2 MB — sab presets available hain.',
  },
  {
    q: 'Kya mere document ka data safe hai?',
    a: 'Haan — 100% safe. Ye tool poori tarah aapke browser mein kaam karta hai. Aapki PDF kisi server par upload nahi hoti.',
  },
  {
    q: 'Size badhane ke baad PDF open hogi kya?',
    a: 'Haan, sab PDF readers (Adobe, Chrome, browser, mobile apps) is padded PDF ko perfectly open karenge. Trailing data ko PDF specification ke anusaar ignore kiya jaata hai.',
  },
  {
    q: 'Encrypted ya password-protected PDF ka kya hoga?',
    a: 'Agar aapki PDF password protected hai toh pehle Unlock PDF tool se password hatayein, phir size increase karein. Ya agar portal allow karta hai toh fallback method automatically use hoga.',
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isPdfFile(file: File): boolean {
  return (
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf')
  );
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function IncreasePdfSize() {
  useSEO(
    'Increase PDF File Size Online Free — Exact Target KB & MB',
    'Increase PDF file size to exact KB or MB online free. Set target to 100 KB, 200 KB, 500 KB, 1 MB, 2 MB, 5 MB, 10 MB or 20 MB. Perfect for government portals, SSC, UPSC, Railway forms. No quality loss, no signup.'
  );

  usePageSEO(
    'Increase PDF File Size Online Free — PDF Size Increaser',
    'Increase PDF file size to exact KB or MB online free. Set target to 100 KB, 200 KB, 500 KB, 1 MB, 2 MB, 5 MB, 10 MB or 20 MB. Perfect for government portals, SSC, UPSC, Railway forms. No quality loss, no signup.',
    'increase pdf size, pdf size increase online, pdf file size increase, increase pdf size in mb, pdf kb increase, pdf size increaser, pdf size increase to 200kb, pdf size increase up to 10mb',
    '/increase-size'
  );

  const toast = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [targetBytes, setTargetBytes] = useState<number>(1 * 1024 * 1024);
  const [inputMode, setInputMode] = useState<'kb' | 'mb'>('kb');
  const [inputValue, setInputValue] = useState<string>('1024');
  const [compressedUrl, setCompressedUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<{ original: number; newSize: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);

  const abortRef = useRef(false);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (compressedUrl) URL.revokeObjectURL(compressedUrl);
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, [compressedUrl]);

  // ── Inline warning: update whenever file or targetBytes changes ──
  useEffect(() => {
    if (!file) { setInlineError(null); return; }
    if (file.size >= targetBytes) {
      setInlineError(
        `Your file is already ${formatSize(file.size)}. Target must be larger than the current file size.`
      );
    } else {
      setInlineError(null);
    }
  }, [file, targetBytes]);

  // ── Fake progress animation ──────────────────────────────────────
  function startProgress() {
    setProgress(0);
    let p = 0;
    progressTimerRef.current = setInterval(() => {
      // Accelerate to ~85% quickly, then slow down waiting for real result
      p = p < 70 ? p + 8 : p < 85 ? p + 1.5 : p + 0.3;
      if (p >= 92) { clearInterval(progressTimerRef.current!); return; }
      setProgress(Math.min(p, 92));
    }, 120);
  }

  function finishProgress() {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    setProgress(100);
    setTimeout(() => setProgress(0), 800);
  }

  // ── Handlers ────────────────────────────────────────────────────
  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const dropped = acceptedFiles[0];

    // Validate file type
    if (!isPdfFile(dropped)) {
      toast.error('Please select a PDF file. Images and other files are not supported here.');
      return;
    }

    // Warn about very large files (> 80 MB)
    if (dropped.size > 80 * 1024 * 1024) {
      toast.error('File is larger than 80 MB. Please select a smaller file to avoid browser memory issues.');
      return;
    }

    if (compressedUrl) URL.revokeObjectURL(compressedUrl);
    setFile(dropped);
    setCompressedUrl(null);
    setStats(null);
    setInlineError(null);

    // Pre-fill target to file size + 10% (minimum useful target)
    const suggestedKB = Math.ceil((dropped.size * 1.1) / 1024);
    setInputMode('kb');
    setInputValue(String(suggestedKB));
    setTargetBytes(suggestedKB * 1024);
  };

  const handlePreset = (bytes: number) => {
    setTargetBytes(bytes);
    if (bytes < 1024 * 1024) {
      setInputMode('kb');
      setInputValue(String(Math.round(bytes / 1024)));
    } else {
      setInputMode('mb');
      setInputValue(String(bytes / (1024 * 1024)));
    }
    setInputError(null);
    setCompressedUrl(null);
    setStats(null);
  };

  const handleInputChange = (val: string) => {
    setInputValue(val);
    setInputError(null);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      const newBytes = inputMode === 'kb' ? Math.round(num * 1024) : Math.round(num * 1024 * 1024);
      if (newBytes > 100 * 1024 * 1024) {
        setInputError('Maximum allowed target is 100 MB.');
        return;
      }
      setTargetBytes(newBytes);
    } else if (val !== '') {
      setInputError('Please enter a valid number.');
    }
  };

  const toggleMode = (mode: 'kb' | 'mb') => {
    if (mode === inputMode) return;
    const num = parseFloat(inputValue);
    if (!isNaN(num) && num > 0) {
      if (mode === 'mb') {
        setInputValue(String(Math.round((num / 1024) * 100) / 100));
      } else {
        setInputValue(String(Math.round(num * 1024)));
      }
    }
    setInputMode(mode);
    setInputError(null);
  };

  // ── Core Processing ────────────────────────────────────────────
  const increasePdfSize = async () => {
    if (!file) return;

    // Validate before starting
    if (!isPdfFile(file)) {
      toast.error('Only PDF files are supported.');
      return;
    }
    if (file.size >= targetBytes) {
      toast.error(`File is already ${formatSize(file.size)}. Please choose a larger target.`);
      return;
    }
    if (targetBytes > 100 * 1024 * 1024) {
      toast.error('Maximum target size allowed is 100 MB.');
      return;
    }

    setIsProcessing(true);
    abortRef.current = false;
    startProgress();

    try {
      // Read file with error handling
      let arrayBuffer: ArrayBuffer;
      try {
        arrayBuffer = await file.arrayBuffer();
      } catch {
        throw new Error('Could not read the file. It may be corrupted or too large for your browser.');
      }

      if (abortRef.current) return;

      const origBytes = new Uint8Array(arrayBuffer);
      const targetBytesLength = targetBytes;

      let finalBytes: Uint8Array;

      try {
        // METHOD 1: ISO 32000-1 spec-compliant internal object padding via pdf-lib
        // Accepted by UPSC, SSC, NTA, Bank, High Court, Apache PDFBox validators
        const loadPromise = PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('PDF parsing timed out. Using fallback method.')), 12000)
        );

        const doc = await Promise.race([loadPromise, timeoutPromise]);

        if (abortRef.current) return;

        const baseBytes = await doc.save({ useObjectStreams: false });

        if (baseBytes.length < targetBytesLength) {
          // Leave headroom for stream wrapper syntax and xref table entries
          const streamSize = Math.max(0, targetBytesLength - baseBytes.length - 150);
          if (streamSize > 0) {
            const padData = new Uint8Array(streamSize);
            for (let i = 0; i < streamSize; i++) {
              padData[i] = (i % 26) + 65; // Printable ASCII A–Z
            }
            const stream = doc.context.stream(padData);
            const streamRef = doc.context.register(stream);
            doc.catalog.set(PDFName.of('GovPortalPadding'), streamRef);
          }

          const savedBytes = await doc.save({ useObjectStreams: false });
          const diff = targetBytesLength - savedBytes.length;

          if (diff > 0) {
            // Exact single-byte finishing with standard PDF comment lines
            const exactBuffer = new Uint8Array(targetBytesLength);
            exactBuffer.set(savedBytes, 0);
            exactBuffer[savedBytes.length] = 10; // \n
            if (diff > 1) {
              exactBuffer[savedBytes.length + 1] = 37; // %
              for (let i = savedBytes.length + 2; i < targetBytesLength - 1; i++) {
                exactBuffer[i] = 32; // space
              }
              exactBuffer[targetBytesLength - 1] = 10; // \n
            }
            finalBytes = exactBuffer;
          } else {
            finalBytes = savedBytes;
          }
        } else {
          finalBytes = baseBytes;
        }

      } catch (pdfLibErr) {
        // METHOD 2: Valid PDF comment stream fallback
        // Used for encrypted/corrupt PDFs — appends valid %comment lines + %%EOF
        console.warn('[IncreaseSize] Using comment-padding fallback:', pdfLibErr);

        if (abortRef.current) return;

        const exactBuffer = new Uint8Array(targetBytesLength);
        exactBuffer.set(origBytes, 0);

        let offset = origBytes.length;
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        while (offset < targetBytesLength - 8) {
          exactBuffer[offset++] = 10; // \n
          exactBuffer[offset++] = 37; // %
          exactBuffer[offset++] = 32; // space
          const lineLen = Math.min(70, targetBytesLength - 8 - offset);
          for (let k = 0; k < lineLen; k++) {
            exactBuffer[offset++] = chars.charCodeAt(Math.floor(Math.random() * chars.length));
          }
        }
        const eof = '\n%%EOF\n';
        for (let i = 0; i < eof.length; i++) {
          exactBuffer[targetBytesLength - eof.length + i] = eof.charCodeAt(i);
        }
        finalBytes = exactBuffer;

        // Inform user that fallback was used but it's still valid
        toast.info('PDF was encrypted or non-standard — used compatible padding. Output is valid.');
      }

      if (abortRef.current) return;

      const blob = new Blob([finalBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setStats({ original: file.size, newSize: blob.size });
      setCompressedUrl(url);
      finishProgress();
      toast.success(`PDF size successfully increased to ${formatSize(blob.size)}!`);

    } catch (error: any) {
      finishProgress();
      const msg = error?.message || 'An unexpected error occurred. Please try again.';
      setInlineError(msg);
      toast.error(msg);
      console.error('[IncreasePdfSize] Processing failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    abortRef.current = true;
    setIsProcessing(false);
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    setProgress(0);
    toast.info('Processing cancelled.');
  };

  const handleReset = () => {
    if (compressedUrl) URL.revokeObjectURL(compressedUrl);
    setFile(null);
    setCompressedUrl(null);
    setStats(null);
    setInlineError(null);
    setInputError(null);
    setProgress(0);
  };

  // ── Derived state ───────────────────────────────────────────────
  const fileTooLarge = file ? file.size >= targetBytes : false;
  const canProcess = !!file && !fileTooLarge && !isProcessing && !inputError;
  const paddingNeeded = file ? Math.max(0, targetBytes - file.size) : 0;

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="flex-1 flex flex-col items-center p-4 sm:p-8 bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 min-h-screen">

      {/* ── Header ── */}
      <div className="text-center mb-8 max-w-3xl mx-auto px-4">
        <div className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-xs font-bold px-3 py-1 rounded-full mb-4 border border-blue-200 dark:border-blue-800">
          📄 GOVERNMENT PORTAL & EXAM FORM READY
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-3 leading-tight">
          Increase PDF File Size Online
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
          Set your PDF to <strong>exact 100 KB, 200 KB, 500 KB, 1 MB, 2 MB, 5 MB or 10 MB</strong> — perfect for SSC, UPSC, Railway, bank aur government portals. No quality loss.{' '}
          <span className="text-blue-600 font-semibold">Free, private, no signup needed.</span>
        </p>
      </div>

      <div className="w-full max-w-4xl space-y-5">

        {/* ── Upload / Tool area ── */}
        {!file ? (
          <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file to increase size" />
        ) : (
          <>
            {/* File info card */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 dark:text-white truncate">{file.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  <span>Current size: </span>
                  <strong className="notranslate" translate="no">{formatSize(file.size)}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={handleReset}
                disabled={isProcessing}
                className="text-xs text-slate-500 hover:text-rose-500 dark:text-slate-400 font-medium shrink-0 notranslate disabled:opacity-40"
                translate="no"
              >
                <span>✕ Change</span>
              </button>
            </div>

            {/* ── Global inline warning (file already >= target) ── */}
            {inlineError && !compressedUrl && (
              <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-sm text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
                <span>{inlineError}</span>
              </div>
            )}

            {/* ── Processing / Success / Settings card ── */}
            {!compressedUrl ? (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-5">

                {/* Quick Presets */}
                <div>
                  <label className="block text-sm font-bold text-slate-900 dark:text-white mb-3">
                    ⚡ Quick Presets — One Click Select
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PRESETS.map(p => {
                      const isActive = targetBytes === p.bytes;
                      const tooSmall = file.size >= p.bytes;
                      return (
                        <button
                          key={p.label}
                          onClick={() => !tooSmall && handlePreset(p.bytes)}
                          disabled={tooSmall || isProcessing}
                          title={tooSmall ? `File already ≥ ${p.label}` : `Set target to ${p.label} · Used by: ${p.portal}`}
                          className={`relative px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                            isActive
                              ? 'border-blue-500 bg-blue-500 text-white shadow-md scale-105'
                              : tooSmall
                              ? 'border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed line-through opacity-60'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40'
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 flex items-center gap-1.5">
                    <Info className="w-3 h-3 shrink-0" />
                    Striked-out presets = your file is already that size or larger.
                  </p>
                </div>

                {/* Custom size input */}
                <div>
                  <label className="block text-sm font-bold text-slate-900 dark:text-white mb-2">
                    🎯 Or set Custom Target Size
                  </label>
                  <div className="flex items-stretch gap-2">
                    {/* KB / MB toggle */}
                    <div className="flex rounded-xl border border-slate-300 dark:border-slate-600 overflow-hidden shrink-0">
                      <button
                        onClick={() => toggleMode('kb')}
                        disabled={isProcessing}
                        className={`px-4 py-2.5 text-sm font-bold transition-colors ${inputMode === 'kb' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-blue-50'}`}
                      >
                        KB
                      </button>
                      <button
                        onClick={() => toggleMode('mb')}
                        disabled={isProcessing}
                        className={`px-4 py-2.5 text-sm font-bold transition-colors ${inputMode === 'mb' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-blue-50'}`}
                      >
                        MB
                      </button>
                    </div>
                    <input
                      type="number"
                      min={0.1}
                      step={inputMode === 'kb' ? 1 : 0.1}
                      value={inputValue}
                      onChange={e => handleInputChange(e.target.value)}
                      disabled={isProcessing}
                      className={`flex-1 px-4 py-2.5 rounded-xl border bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base font-medium transition-colors ${
                        inputError
                          ? 'border-rose-400 dark:border-rose-600 focus:ring-rose-500'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                      placeholder={inputMode === 'kb' ? 'e.g. 500' : 'e.g. 2'}
                    />
                    <div className="flex items-center px-3 bg-slate-100 dark:bg-slate-700 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-bold text-slate-600 dark:text-slate-300 shrink-0">
                      {inputMode.toUpperCase()}
                    </div>
                  </div>

                  {/* Input error */}
                  {inputError && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {inputError}
                    </p>
                  )}

                  {/* Size summary */}
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 notranslate" translate="no">
                    <span>Target: </span>
                    <strong className="text-blue-600 dark:text-blue-400">{formatSize(targetBytes)}</strong>
                    {file && !fileTooLarge && (
                      <span>
                        <span> · Will add: </span>
                        <strong className="text-emerald-600 dark:text-emerald-400">{formatSize(paddingNeeded)}</strong>
                      </span>
                    )}
                  </p>
                </div>

                {/* Progress bar — shown during processing */}
                {isProcessing && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs text-slate-600 dark:text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
                        Building padded PDF...
                      </span>
                      <span className="font-bold text-blue-600 notranslate">{Math.round(progress)}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* CTA buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={isProcessing ? handleCancel : increasePdfSize}
                    disabled={!isProcessing && !canProcess}
                    className={`flex-1 py-4 text-white text-base font-extrabold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 notranslate disabled:opacity-40 disabled:cursor-not-allowed ${
                      isProcessing
                        ? 'bg-rose-600 hover:bg-rose-700'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
                    }`}
                    translate="no"
                  >
                    {isProcessing ? (
                      <>
                        <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Cancel</span>
                      </>
                    ) : (
                      <>
                        <Maximize2 className="w-5 h-5" />
                        <span>Increase PDF Size</span>
                      </>
                    )}
                  </button>

                  {!isProcessing && (
                    <button
                      type="button"
                      onClick={handleReset}
                      className="px-5 py-4 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors notranslate"
                      translate="no"
                    >
                      <span>Cancel</span>
                    </button>
                  )}
                </div>

                {/* Helper tip: why button is disabled */}
                {!isProcessing && fileTooLarge && file && (
                  <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                    <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
                    <span>
                      Your file ({formatSize(file.size)}) is already <strong>larger than your target</strong>. Use the presets or custom input above to set a target bigger than your current file size.
                      {' '}Need to make it smaller? Try{' '}
                      <Link to="/target-compress" className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">
                        Target Compress →
                      </Link>
                    </span>
                  </div>
                )}
              </div>

            ) : (
              /* ── Success state ── */
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/30 rounded-2xl border border-blue-200 dark:border-blue-800 p-6 shadow-sm animate-fade-in">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 dark:text-white text-lg">
                      Size Increased Successfully!
                    </h3>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 mt-0.5">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>Quality 100% untouched · ISO 32000 compliant · Ready for SSC, UPSC, Railway & Bank portals.</span>
                    </p>
                  </div>
                </div>

                {/* Stats */}
                {stats && (
                  <div className="flex justify-center gap-10 mb-5 p-4 bg-white dark:bg-slate-800 rounded-xl border border-blue-100 dark:border-blue-900 shadow-sm text-center notranslate" translate="no">
                    <div>
                      <p className="text-xs text-slate-500 mb-1"><span>Original</span></p>
                      <p className="font-bold text-slate-900 dark:text-white text-lg notranslate">{formatSize(stats.original)}</p>
                    </div>
                    <div className="text-2xl text-blue-400 flex items-center notranslate">
                      <ArrowRight className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1"><span>New Size</span></p>
                      <p className="font-bold text-blue-700 dark:text-blue-300 text-xl notranslate">{formatSize(stats.newSize)}</p>
                    </div>
                  </div>
                )}

                {/* Download */}
                <a
                  href={compressedUrl!}
                  download={`increased_${file.name}`}
                  className="flex items-center justify-center gap-2 w-full py-3.5 bg-blue-600 text-white font-extrabold rounded-xl hover:bg-blue-700 transition-colors shadow-md notranslate"
                  translate="no"
                >
                  <Download className="w-5 h-5" />
                  <span>Download Increased PDF</span>
                </a>

                <button
                  type="button"
                  onClick={handleReset}
                  className="mt-3 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-medium mx-auto block notranslate"
                  translate="no"
                >
                  <span>↩ Process another PDF</span>
                </button>

                {/* Cross-links after success */}
                <div className="mt-6 border-t border-blue-100 dark:border-blue-900 pt-4">
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-3">🎓 Need more for your exam form?</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { to: '/id-card-joiner', label: '🪪 ID Card Joiner', desc: 'Aadhaar/PAN front & back' },
                      { to: '/target-compress', label: '🎯 Compress to KB', desc: 'Set exact size limit' },
                      { to: '/passport-photo-sheet', label: '🖼️ Passport Photos', desc: '8 photos on 4×6 sheet' },
                      { to: '/exact-image-size', label: '⚖️ Photo to 20–50KB', desc: 'For exam form photos' },
                    ].map(item => (
                      <Link key={item.to} to={item.to} className="bg-white dark:bg-slate-800 rounded-xl p-2.5 border border-blue-100 dark:border-blue-900 hover:border-blue-400 hover:shadow-md transition-all group">
                        <p className="text-[11px] font-bold text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">{item.label}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{item.desc}</p>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Related Tools (shown before upload) ── */}
        {!file && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20 rounded-2xl border border-blue-100 dark:border-blue-900 p-5">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-500" />
              Govt Portal & Exam Form Toolkit — All Free
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { to: '/id-card-joiner', label: '🪪 ID Card Joiner', desc: 'Aadhaar/PAN front & back on A4' },
                { to: '/target-compress', label: '🎯 Target Compress PDF', desc: 'Compress to exact KB' },
                { to: '/passport-photo-sheet', label: '🖼️ Passport Photo Sheet', desc: '8 photos on 4×6 print' },
                { to: '/exact-image-size', label: '⚖️ Exact Image Size', desc: 'Photo to 20KB–50KB' },
              ].map(item => (
                <Link key={item.to} to={item.to} className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-blue-100 dark:border-blue-900 hover:border-blue-400 hover:shadow-md transition-all group">
                  <p className="text-xs font-bold text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">{item.label}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{item.desc}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Trust badges ── */}
        <div className="flex flex-wrap justify-center gap-4 py-2">
          {[
            { icon: '🔒', text: 'No upload — 100% browser-only' },
            { icon: '⚡', text: 'Instant — no server wait' },
            { icon: '✅', text: 'ISO 32000 PDF compliant' },
            { icon: '🆓', text: 'Free, no signup' },
          ].map(b => (
            <div key={b.text} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
              <span>{b.icon}</span>
              <span>{b.text}</span>
            </div>
          ))}
        </div>

        {/* ── FAQ ── */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-500" />
            Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {FAQS.map((item, i) => (
              <details key={i} className="group border-b border-slate-100 dark:border-slate-700 pb-3 last:border-0 last:pb-0">
                <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-semibold text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400">
                  {item.q}
                  <ChevronRight className="w-4 h-4 shrink-0 ml-2 group-open:rotate-90 transition-transform" />
                </summary>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
