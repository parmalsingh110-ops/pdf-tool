import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Palette, Download, AlertTriangle, Loader2, FileText, CheckCircle } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { apiFetch } from '../lib/api';
import { useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

export default function CmykConverter() {
  useSEO('Cmyk Converter Online Free | PDF Media Suite', 'Free online Cmyk Converter tool. No signup or installation required.');

  usePageSEO('RGB to CMYK PDF Converter', 'Convert your RGB PDF to CMYK color space for professional offset printing. Free online tool — no sign-up required.');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useAutoRevokeUrl(resultUrl);
  const prefersReduced = useReducedMotion();

  const handleDrop = (files: File[]) => {
    if (files[0]) {
      setFile(files[0]);
      setResultUrl(null);
      setError(null);
    }
  };

  const convert = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResultUrl(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch('/convert/cmyk', { method: 'POST', body: fd, timeoutMs: 60000 });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Conversion failed.' }));
        throw new Error(err.detail || 'Conversion failed.');
      }
      const blob = await res.blob();
      const name = file.name.replace(/\.pdf$/i, '') + '_CMYK.pdf';
      setResultName(name);
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      setError(e.message || 'Conversion failed.');
    } finally {
      setBusy(false);
    }
  };

  const stageKey = !file ? 'upload' : !resultUrl ? 'configure' : 'result';

  return (
    <ToolWorkspaceShell
      title="RGB to CMYK Converter"
      subtitle="Convert your RGB PDF to CMYK color space — ready for professional offset printing presses."
      categoryLabel="Pre-Press Color Separation"
      icon={Palette}
      microVariant="convert"
      tone="violet"
      trustNote="Ghostscript ISO Coated v2 engine · Ephemeral zero-retention conversion"
    >
      <div className="flex flex-wrap justify-center gap-2 mb-7">
        {['ISO Coated v2 Compatible', 'Ghostscript Powered', 'Print-Ready Output', 'No Color Loss'].map((tag, idx) => (
          <motion.span
            key={tag}
            initial={prefersReduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: idx * 0.04 }}
            className="px-3 py-1 bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] text-xs font-semibold rounded-full border border-[var(--pms-border)]"
          >
            ✓ {tag}
          </motion.span>
        ))}
      </div>

      <PearlStageSwitch stageKey={stageKey}>
        {!file ? (
          <div className="max-w-2xl mx-auto">
            <FileDropzone onDrop={handleDrop} multiple={false} />
          </div>
        ) : !resultUrl ? (
          <div className="relative max-w-lg mx-auto pms-glass-panel rounded-3xl p-6 space-y-5 overflow-hidden">
            <PearlScanOverlay active={busy} label="Separating RGB channels to CMYK offset profile…" />

            <div className="bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 dark:text-white truncate">{file.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  <AnimatedNumber value={file.size / 1024 / 1024} decimals={2} suffix=" MB" />
                </p>
              </div>
            </div>

            <AnimatePresence initial={false}>
              {error && (
                <motion.div
                  initial={prefersReduced ? false : { opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReduced ? undefined : { opacity: 0, y: -6 }}
                  className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-2xl flex items-start gap-3 text-rose-700 dark:text-rose-300 text-sm"
                >
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="p-4 bg-[var(--pms-soft-blue)] border border-[var(--pms-border)] rounded-2xl text-slate-700 dark:text-slate-200 text-xs sm:text-sm leading-relaxed">
              <p className="font-bold mb-1">ℹ️ What this tool does</p>
              <p>
                Converts all RGB colors to CMYK using Ghostscript. Some colors may appear slightly different as RGB has a wider gamut than CMYK. This is expected behavior for print preparation.
              </p>
            </div>

            <div className="flex gap-3">
              <motion.button
                whileHover={prefersReduced || busy ? undefined : { scale: 1.01 }}
                whileTap={prefersReduced || busy ? undefined : { scale: 0.985 }}
                onClick={convert}
                disabled={busy}
                className="flex-1 pms-btn-primary py-4 font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 notranslate cursor-pointer"
                translate="no"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Palette className="w-5 h-5" />}
                <span>{busy ? 'Converting…' : 'Convert to CMYK'}</span>
              </motion.button>
              <button
                onClick={() => { setFile(null); setError(null); }}
                disabled={busy}
                className="px-6 py-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-lg mx-auto pms-glass-panel rounded-3xl p-8 text-center space-y-5 border border-[var(--pms-border)]">
            <motion.div
              initial={prefersReduced ? false : { scale: 0.45, rotate: -10, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 360, damping: 18 }}
              className="w-16 h-16 bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] rounded-full flex items-center justify-center mx-auto shadow-inner"
            >
              <CheckCircle className="w-8 h-8" />
            </motion.div>
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">CMYK PDF Ready!</h2>
              <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
                Your PDF has been converted to CMYK color space and is ready for professional printing.
              </p>
            </div>
            <motion.a
              whileHover={prefersReduced ? undefined : { scale: 1.02 }}
              whileTap={prefersReduced ? undefined : { scale: 0.985 }}
              href={resultUrl}
              download={resultName}
              className="pms-btn-primary inline-flex items-center gap-2 px-8 py-3.5 font-bold rounded-2xl"
            >
              <Download className="w-5 h-5" />
              Download CMYK PDF
            </motion.a>
            <button
              onClick={() => { setFile(null); setResultUrl(null); }}
              className="block w-full text-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm font-semibold pt-1 cursor-pointer"
            >
              Convert another file
            </button>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
