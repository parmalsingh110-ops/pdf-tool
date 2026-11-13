import { useState, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { RefreshCw, Download, Loader2, Trash2, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { useAutoRevokeUrls } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

type OutputFormat = 'image/jpeg' | 'image/png' | 'image/webp';
const FORMATS: { label: string; value: OutputFormat; ext: string }[] = [
  { label: 'JPEG', value: 'image/jpeg', ext: '.jpg' },
  { label: 'PNG', value: 'image/png', ext: '.png' },
  { label: 'WebP', value: 'image/webp', ext: '.webp' },
];

export default function ImageConverter() {
  useSEO('Image Converter Online Free | PDF Media Suite', 'Free online Image Converter tool. No signup or installation required.');

  usePageSEO('Image Format Converter', 'Convert images between JPG, PNG, and WebP formats. Free online batch image converter with quality control.');
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<OutputFormat>('image/png');
  const [quality, setQuality] = useState(0.9);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ name: string; url: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const prefersReduced = useReducedMotion();
  useAutoRevokeUrls(results.map((r) => r.url));

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFiles((prev) => [...prev, ...acceptedFiles]);
      setResults([]);
    }
  };

  const handleAddMore = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
      setResults([]);
    }
    e.target.value = '';
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const convert = async () => {
    if (files.length === 0) return;
    setBusy(true);
    try {
      const output: { name: string; url: string }[] = [];
      const ext = FORMATS.find((f) => f.value === format)!.ext;
      for (const file of files) {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej();
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(img.src);
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), format, quality));
        if (blob) {
          const baseName = file.name.replace(/\.[^/.]+$/, '');
          output.push({ name: `${baseName}${ext}`, url: URL.createObjectURL(blob) });
        }
        canvas.width = 0;
        canvas.height = 0;
      }
      setResults(output);
    } catch (e: any) {
      alert(e?.message || 'Conversion failed');
    } finally {
      setBusy(false);
    }
  };

  const stageKey = files.length === 0 ? 'drop' : results.length > 0 ? 'done' : 'configure';

  return (
    <ToolWorkspaceShell
      title="Image Format Converter"
      subtitle="Batch convert images between JPEG, PNG, and WebP with precise quality control."
      categoryLabel="Raster Format Studio"
      icon={RefreshCw}
      microVariant="convert"
      tone="rose"
      trustNote="Batch lossless & lossy conversion · 100% browser-only"
    >
      <PearlStageSwitch stageKey={stageKey}>
        {files.length === 0 ? (
          <div className="max-w-2xl mx-auto">
            <FileDropzone
              onDrop={handleDrop}
              multiple={true}
              accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.bmp'] }}
              title="Select Images"
              subtitle="JPG, PNG, WebP, BMP — batch conversion supported"
            />
          </div>
        ) : results.length > 0 ? (
          <div className="w-full max-w-2xl mx-auto space-y-5">
            <div className="pms-glass-panel rounded-3xl p-7 text-center border border-emerald-200/80 dark:border-emerald-800/70">
              <motion.div
                initial={prefersReduced ? false : { scale: 0.45, rotate: -10, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 360, damping: 18 }}
                className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner"
              >
                <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </motion.div>
              <h3 className="text-2xl font-extrabold text-emerald-900 dark:text-emerald-200 mb-1">
                Converted <AnimatedNumber value={results.length} /> image(s)!
              </h3>
              <p className="text-sm text-emerald-700 dark:text-emerald-400 mb-5">
                Ready for instant download in {FORMATS.find((f) => f.value === format)?.label} format
              </p>
              <div className="space-y-2.5 text-left">
                {results.map((r, i) => (
                  <motion.a
                    key={i}
                    initial={prefersReduced ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    href={r.url}
                    download={r.name}
                    className="flex items-center justify-between gap-3 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-sm shadow-md shadow-emerald-600/15 transition-colors"
                  >
                    <span className="truncate">{r.name}</span>
                    <span className="inline-flex items-center gap-1.5 shrink-0 text-xs bg-white/15 px-2.5 py-1 rounded-xl">
                      <Download className="w-3.5 h-3.5" /> Save
                    </span>
                  </motion.a>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                setFiles([]);
                setResults([]);
              }}
              className="w-full py-3.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-2xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Convert more images
            </button>
          </div>
        ) : (
          <div className="relative w-full max-w-2xl mx-auto pms-glass-panel rounded-3xl p-6 sm:p-8 space-y-6 overflow-hidden">
            <PearlScanOverlay active={busy} label={`Converting ${files.length} image(s) to ${FORMATS.find((f) => f.value === format)?.label}…`} />

            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-gray-800 dark:text-slate-200">
                <AnimatedNumber value={files.length} /> image(s) queued
              </p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="px-3 py-1.5 rounded-xl bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer"
              >
                + Add more
              </button>
              <input ref={inputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleAddMore} />
            </div>

            <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
              {files.map((f, idx) => (
                <div
                  key={`${f.name}-${idx}`}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl border bg-white/75 dark:bg-slate-900/60 border-[var(--pms-border)]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ImageIcon className="w-4 h-4 text-[var(--pms-rose)] shrink-0" />
                    <span className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-slate-200 truncate">
                      {f.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-gray-500 dark:text-slate-400">
                      {(f.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="p-1 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                      aria-label={`Remove ${f.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-slate-400 mb-2">
                Output Format
              </label>
              <div className="grid grid-cols-3 gap-3">
                {FORMATS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setFormat(f.value)}
                    className={`py-3 rounded-2xl font-bold text-sm border transition-all cursor-pointer ${
                      format === f.value
                        ? 'pms-btn-primary border-transparent'
                        : 'bg-white/75 dark:bg-slate-800/75 border-[var(--pms-border)] text-gray-700 dark:text-slate-300 hover:border-rose-300'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {format !== 'image/png' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-slate-400">
                    Quality
                  </label>
                  <span className="text-xs font-extrabold text-[var(--pms-rose)]">
                    <AnimatedNumber value={Math.round(quality * 100)} suffix="%" />
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={quality}
                  onChange={(e) => setQuality(parseFloat(e.target.value))}
                  className="w-full accent-rose-600 cursor-pointer"
                />
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <motion.button
                whileHover={prefersReduced || busy ? undefined : { scale: 1.01 }}
                whileTap={prefersReduced || busy ? undefined : { scale: 0.985 }}
                onClick={convert}
                disabled={busy}
                className="flex-1 pms-btn-primary py-4 font-bold rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                <span>{busy ? 'Converting…' : 'Convert All'}</span>
              </motion.button>
              <button
                onClick={() => setFiles([])}
                disabled={busy}
                className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-semibold rounded-2xl hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
