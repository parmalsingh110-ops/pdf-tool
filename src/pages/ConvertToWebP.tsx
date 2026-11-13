import { useState, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { FileImage, Download, Loader2 } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { useSEO } from '../hooks/useSEO';
import { useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

export default function ConvertToWebP() {
  useSEO('Convert To Web P Online Free | PDF Media Suite', 'Free online Convert To Web P tool. No signup or installation required.');

  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState(80);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const previewUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  useAutoRevokeUrl(previewUrl);
  useAutoRevokeUrl(resultUrl);
  const prefersReduced = useReducedMotion();

  const handleDrop = (files: File[]) => {
    if (files[0]) {
      setFile(files[0]);
      setResultUrl(null);
      setResultSize(null);
    }
  };

  const handleProcess = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = URL.createObjectURL(file);
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('Image load failed'));
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get context');
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(b => resolve(b), 'image/webp', quality / 100));
      if (!blob) throw new Error('Conversion failed');

      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultSize(blob.size);
    } catch (e: any) {
      alert(e?.message || 'Conversion failed.');
    } finally {
      setBusy(false);
    }
  };

  const savingsPct = resultSize ? Math.round((1 - resultSize / file!.size) * 100) : 0;

  return (
    <ToolWorkspaceShell
      title="Convert to WebP"
      subtitle="Convert JPG or PNG images to next-gen WebP format for crisp visuals and dramatically smaller file sizes."
      categoryLabel="Next-Gen Image Optimizer"
      icon={FileImage}
      microVariant="compress"
      tone="emerald"
      trustNote="100% browser canvas encoding · Instant before & after comparison"
    >
      {!file ? (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="max-w-2xl mx-auto"
        >
          <FileDropzone
            onDrop={handleDrop}
            multiple={false}
            title="Select image file"
            subtitle="or drop PNG, JPG, JPEG image here"
            accept={{ 'image/*': ['.png', '.jpg', '.jpeg'] }}
          />
        </motion.div>
      ) : (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="relative w-full max-w-3xl mx-auto pms-glass-panel rounded-3xl p-6 sm:p-8 space-y-6 overflow-hidden"
        >
          <PearlScanOverlay active={busy} label="Encoding next-gen WebP stream…" />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Original */}
            <div className="bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-200">Original</span>
                <span className="px-2.5 py-0.5 rounded-full bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] font-bold">
                  <AnimatedNumber value={file.size / 1024} decimals={1} suffix=" KB" />
                </span>
              </div>
              <div className="rounded-xl border border-[var(--pms-border)] overflow-hidden pms-checkerboard dark:bg-slate-950/60 h-52 flex items-center justify-center">
                {previewUrl && <img src={previewUrl} alt="Original" className="w-full h-full object-contain" />}
              </div>
            </div>

            {/* Result */}
            <div className="bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="font-bold text-slate-700 dark:text-slate-200">WebP Output</span>
                {resultSize !== null && (
                  <div className="flex items-center gap-1.5">
                    <span className="px-2.5 py-0.5 rounded-full bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300 font-bold">
                      <AnimatedNumber value={resultSize / 1024} decimals={1} suffix=" KB" />
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white font-bold text-[10px]">
                      <AnimatedNumber value={savingsPct} suffix="% smaller" />
                    </span>
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-[var(--pms-border)] overflow-hidden pms-checkerboard dark:bg-slate-950/60 flex items-center justify-center h-52">
                <AnimatePresence mode="popLayout" initial={false}>
                  {resultUrl ? (
                    <motion.img
                      key={resultUrl}
                      initial={prefersReduced ? false : { opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      src={resultUrl}
                      alt="WebP"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <motion.span
                      key="placeholder"
                      initial={prefersReduced ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-slate-500 dark:text-slate-400 text-xs font-medium bg-white/80 dark:bg-slate-900/80 px-3 py-1.5 rounded-full border border-[var(--pms-border)]"
                    >
                      Convert to see WebP preview
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="p-4 bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] space-y-2">
            <div className="flex items-center justify-between text-sm font-bold text-slate-800 dark:text-slate-200">
              <span>Compression Quality</span>
              <span className="px-2.5 py-0.5 rounded-full bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] text-xs font-extrabold">
                <AnimatedNumber value={quality} suffix="%" />
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={quality}
              onChange={e => setQuality(Number(e.target.value))}
              className="w-full accent-rose-600 cursor-pointer"
            />
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>10% (smallest file)</span>
              <span>100% (best visual fidelity)</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <motion.button
              whileHover={prefersReduced || busy ? undefined : { scale: 1.01 }}
              whileTap={prefersReduced || busy ? undefined : { scale: 0.985 }}
              onClick={handleProcess}
              disabled={busy}
              className="flex-1 pms-btn-primary py-3.5 px-6 font-bold rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileImage className="w-5 h-5" />}
              {busy ? 'Converting…' : 'Convert to WebP'}
            </motion.button>

            <AnimatePresence initial={false}>
              {resultUrl && (
                <motion.a
                  initial={prefersReduced ? false : { opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={prefersReduced ? undefined : { opacity: 0 }}
                  whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                  whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                  href={resultUrl}
                  download={`${file.name.replace(/\.[^/.]+$/, '')}.webp`}
                  className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl flex items-center gap-2 shadow-md transition-colors"
                >
                  <Download className="w-5 h-5" />
                  Download
                </motion.a>
              )}
            </AnimatePresence>

            <button
              onClick={() => {
                setFile(null);
                setResultUrl(null);
                setResultSize(null);
              }}
              className="px-5 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Reset
            </button>
          </div>
        </motion.div>
      )}
    </ToolWorkspaceShell>
  );
}
