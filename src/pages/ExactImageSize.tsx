import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Download, Sliders, Image as ImageIcon, CheckCircle2, Loader2, ArrowUpRight, Minimize2 } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import imageCompression from 'browser-image-compression';
import { encodeCanvasExactByteTarget, type RasterMime } from '../lib/imageByteBudget';
import { useSEO } from '../hooks/useSEO';
import { useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

const PRESET_TARGETS: Array<{ label: string; value: number; unit: 'KB' | 'MB' }> = [
  { label: '20 KB', value: 20, unit: 'KB' },
  { label: '50 KB', value: 50, unit: 'KB' },
  { label: '100 KB', value: 100, unit: 'KB' },
  { label: '200 KB', value: 200, unit: 'KB' },
  { label: '500 KB', value: 500, unit: 'KB' },
  { label: '1 MB', value: 1, unit: 'MB' },
];

export default function ExactImageSize() {
  useSEO(
    'Exact Image & Signature Size (Reduce or Increase KB / MB) | PDF Media Suite',
    'Set an exact target file size (KB or MB) for photos and signatures — automatically shrink oversized files or cleanly increase small files to exact size.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [targetValue, setTargetValue] = useState<number>(50);
  const [targetUnit, setTargetUnit] = useState<'KB' | 'MB'>('KB');
  const [outputFormat, setOutputFormat] = useState<'auto' | 'jpeg' | 'png'>('auto');
  const [isProcessing, setIsProcessing] = useState(false);
  const [compressedUrl, setCompressedUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<{ original: number; result: number; note?: string } | null>(null);
  const [resultFile, setResultFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const prefersReduced = useReducedMotion();

  useAutoRevokeUrl(compressedUrl);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setCompressedUrl(null);
      setStats(null);
      setResultFile(null);
    }
  };

  const targetBytes = Math.max(
    2048,
    Math.round((targetUnit === 'MB' ? targetValue * 1024 * 1024 : targetValue * 1024)),
  );
  const isGrowMode = Boolean(file && targetBytes > file.size);

  const processExactSize = async () => {
    if (!file || targetValue <= 0) return;

    setIsProcessing(true);
    try {
      const wantPng = outputFormat === 'png' || (outputFormat === 'auto' && file.type === 'image/png');
      const targetMime: RasterMime = wantPng
        ? 'image/png'
        : file.type === 'image/webp' && outputFormat === 'auto'
          ? 'image/webp'
          : 'image/jpeg';

      // Fast bitmap decode onto canvas
      let sourceFile: Blob = file;
      if (file.size > targetBytes * 1.8 && targetMime !== 'image/png') {
        try {
          sourceFile = await imageCompression(file, {
            maxSizeMB: Math.max(0.01, targetBytes / (1024 * 1024)),
            maxWidthOrHeight: 2200,
            useWebWorker: true,
            initialQuality: 0.85,
          });
        } catch {
          sourceFile = file;
        }
      }

      const bmp = await createImageBitmap(sourceFile);
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        bmp.close?.();
        throw new Error('Could not initialize image canvas.');
      }

      if (targetMime === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(bmp, 0, 0);
      bmp.close?.();

      const encoded = await encodeCanvasExactByteTarget(canvas, targetMime, targetBytes, {
        allowGrow: true,
      });
      canvas.width = 0;
      canvas.height = 0;

      const outExt =
        encoded.blob.type === 'image/png' ? 'png' : encoded.blob.type === 'image/webp' ? 'webp' : 'jpg';
      const stem = file.name.replace(/\.[^.]+$/, '') || 'image';
      const outName = `${stem}_${Math.round(targetBytes / 1024)}kb.${outExt}`;

      setStats({
        original: file.size,
        result: encoded.blob.size,
        note: encoded.note,
      });
      setCompressedUrl(URL.createObjectURL(encoded.blob));
      setResultFile(new File([encoded.blob], outName, { type: encoded.blob.type }));
    } catch (error) {
      console.error('Error sizing image:', error);
      alert('An error occurred while resizing the image to your target size.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Exact Image & Signature Size"
      subtitle="Compress oversized photos/signatures OR cleanly increase small files to hit exact KB/MB portal limits."
      categoryLabel="Bidirectional Byte-Budget Optimizer"
      icon={Sliders}
      microVariant="compress"
      tone="emerald"
      trustNote="Exact KB/MB ceiling & minimum sizing · Shrink or grow cleanly · 100% browser-only"
    >
      <PearlStageSwitch stageKey={!file ? 'drop' : 'studio'}>
        {!file ? (
          <div className="max-w-2xl mx-auto">
            <FileDropzone
              onDrop={handleDrop}
              multiple={false}
              accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] }}
              title="Select Image or Signature"
              subtitle="Drop PNG, JPG, or WebP here to reduce or increase exact file size"
            />
          </div>
        ) : (
          <div className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6 items-start">
            {/* Control / Result Panel */}
            <div className="relative pms-glass-panel rounded-3xl p-6 sm:p-8 space-y-6 overflow-hidden">
              <PearlScanOverlay active={isProcessing} label={`Shaping file to ${targetValue} ${targetUnit}…`} />

              <div
                className="flex items-center gap-4 p-4 rounded-2xl border"
                style={{ backgroundColor: 'var(--pms-white)', borderColor: 'var(--pms-border)' }}
              >
                <div className="w-14 h-14 bg-[var(--pms-soft-mint)] text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
                  <ImageIcon className="w-7 h-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-gray-900 dark:text-white truncate">{file.name}</p>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">
                    Current Size: <span className="font-semibold tabular-nums">{(file.size / 1024).toFixed(2)} KB</span>
                  </p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 inline-flex items-center gap-1 ${
                    isGrowMode
                      ? 'bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)]'
                      : 'bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  {isGrowMode ? <ArrowUpRight className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
                  {isGrowMode ? 'Increase Mode' : 'Compress Mode'}
                </span>
              </div>

              <AnimatePresence mode="wait">
                {!compressedUrl ? (
                  <motion.div
                    key="config"
                    initial={prefersReduced ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReduced ? undefined : { opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                    className="space-y-5"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-2.5">
                        <label className="block text-sm font-bold text-gray-700 dark:text-slate-300">
                          Exact Target Size ({targetUnit})
                        </label>
                        {/* Unit Selector */}
                        <div className="inline-flex rounded-xl p-1 bg-white/80 dark:bg-slate-800/80 border border-[var(--pms-border)]">
                          {(['KB', 'MB'] as const).map((unit) => (
                            <button
                              key={unit}
                              type="button"
                              onClick={() => {
                                if (targetUnit !== unit) {
                                  setTargetUnit(unit);
                                  setTargetValue((prev) =>
                                    unit === 'MB' ? Math.max(0.1, Math.round((prev / 1024) * 10) / 10) : Math.max(10, Math.round(prev * 1024)),
                                  );
                                }
                              }}
                              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                                targetUnit === unit
                                  ? 'bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300'
                                  : 'text-gray-500 dark:text-slate-400'
                              }`}
                            >
                              {unit}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {PRESET_TARGETS.map((preset) => {
                          const active = targetValue === preset.value && targetUnit === preset.unit;
                          return (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => {
                                setTargetValue(preset.value);
                                setTargetUnit(preset.unit);
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                                active
                                  ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-white/70 dark:bg-slate-800/70 border-[var(--pms-border)] text-gray-600 dark:text-slate-300 hover:border-emerald-400'
                              }`}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>

                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <Sliders className="h-4 w-4 text-emerald-500" />
                        </div>
                        <input
                          type="number"
                          value={targetValue}
                          onChange={(e) => setTargetValue(Math.max(1, Number(e.target.value) || 0))}
                          className="w-full pl-11 pr-14 py-3 rounded-2xl border border-[var(--pms-border)] bg-white/85 dark:bg-slate-900/70 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none transition-all font-bold tabular-nums"
                          placeholder="50"
                          min="1"
                          step={targetUnit === 'MB' ? '0.1' : '1'}
                        />
                        <span className="absolute inset-y-0 right-0 pr-4 flex items-center text-xs font-extrabold text-gray-400 dark:text-slate-500 pointer-events-none">
                          {targetUnit}
                        </span>
                      </div>
                    </div>

                    {/* Output Format Option */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2">
                        Output Format
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { id: 'auto', label: 'Auto Match' },
                          { id: 'jpeg', label: 'JPG (Forms)' },
                          { id: 'png', label: 'PNG (Alpha)' },
                        ] as const).map((fmt) => (
                          <button
                            key={fmt.id}
                            type="button"
                            onClick={() => setOutputFormat(fmt.id)}
                            className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                              outputFormat === fmt.id
                                ? 'bg-[var(--pms-soft-mint)] border-emerald-500 text-emerald-800 dark:text-emerald-200'
                                : 'bg-white/75 dark:bg-slate-800/75 border-[var(--pms-border)] text-gray-600 dark:text-slate-300'
                            }`}
                          >
                            {fmt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-3 pt-1">
                      <motion.button
                        whileHover={prefersReduced || isProcessing || !targetValue ? undefined : { scale: 1.01 }}
                        whileTap={prefersReduced || isProcessing || !targetValue ? undefined : { scale: 0.985 }}
                        onClick={processExactSize}
                        disabled={isProcessing || !targetValue}
                        className="flex-1 pms-btn-primary py-3.5 text-base font-bold rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sliders className="w-5 h-5" />}
                        <span>
                          {isProcessing
                            ? 'Processing…'
                            : isGrowMode
                              ? `Increase to ${targetValue} ${targetUnit}`
                              : `Compress to ${targetValue} ${targetUnit}`}
                        </span>
                      </motion.button>
                      <button
                        onClick={() => setFile(null)}
                        disabled={isProcessing}
                        className="px-5 py-3.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-semibold rounded-2xl hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="result"
                    initial={prefersReduced ? false : { opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-5 text-center"
                  >
                    <div className="p-6 sm:p-7 rounded-2xl bg-emerald-50/75 dark:bg-emerald-950/35 border border-emerald-200/90 dark:border-emerald-800/70">
                      <motion.div
                        initial={prefersReduced ? false : { scale: 0.45, rotate: -10, opacity: 0 }}
                        animate={{ scale: 1, rotate: 0, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 360, damping: 18 }}
                        className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/50 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner"
                      >
                        <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                      </motion.div>
                      <h3 className="text-xl font-extrabold text-emerald-900 dark:text-emerald-200 mb-4">
                        Exact Size Ready!
                      </h3>
                      {stats && (
                        <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
                          <div className="rounded-xl bg-white/70 dark:bg-slate-900/50 p-2.5 border border-emerald-200/50 dark:border-emerald-800/40">
                            <p className="text-[11px] text-gray-500 dark:text-slate-400">Original</p>
                            <p className="font-bold text-gray-900 dark:text-white tabular-nums">
                              <AnimatedNumber value={stats.original / 1024} decimals={1} suffix=" KB" />
                            </p>
                          </div>
                          <div className="rounded-xl bg-white/70 dark:bg-slate-900/50 p-2.5 border border-emerald-200/50 dark:border-emerald-800/40">
                            <p className="text-[11px] text-gray-500 dark:text-slate-400">New Size</p>
                            <p className="font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                              <AnimatedNumber value={stats.result / 1024} decimals={1} suffix=" KB" />
                            </p>
                          </div>
                          <div className="rounded-xl bg-white/70 dark:bg-slate-900/50 p-2.5 border border-emerald-200/50 dark:border-emerald-800/40">
                            <p className="text-[11px] text-gray-500 dark:text-slate-400">Target</p>
                            <p className="font-bold text-teal-700 dark:text-teal-400 tabular-nums">
                              {targetValue} {targetUnit}
                            </p>
                          </div>
                        </div>
                      )}
                      {stats?.note && (
                        <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mb-4">{stats.note}</p>
                      )}
                      <motion.a
                        whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                        whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                        href={compressedUrl}
                        download={resultFile?.name || `resized_${file.name}`}
                        className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-base font-bold rounded-2xl shadow-lg shadow-emerald-600/20 transition-colors"
                      >
                        <Download className="w-5 h-5" />
                        Download Image
                      </motion.a>
                    </div>
                    <button
                      onClick={() => {
                        setFile(null);
                        setCompressedUrl(null);
                        setStats(null);
                      }}
                      className="w-full py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 font-semibold rounded-2xl text-sm transition-colors cursor-pointer"
                    >
                      Resize another Image
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Crisp Preview Panel */}
            <div className="relative pms-glass-panel rounded-3xl p-5 sm:p-6 flex flex-col gap-3 overflow-hidden">
              <PearlScanOverlay active={isProcessing} label="Optimizing pixels…" />
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                  {compressedUrl ? 'Resized Preview' : 'Original Preview'}
                </span>
                {compressedUrl && (
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300">
                    Exact Size Ready
                  </span>
                )}
              </div>
              <div className="pms-checkerboard bg-white dark:bg-slate-950 rounded-2xl border border-[var(--pms-border)] p-4 flex items-center justify-center min-h-[300px] overflow-hidden">
                {compressedUrl ? (
                  <img src={compressedUrl} alt="Resized preview" className="max-w-full max-h-[380px] object-contain rounded-lg shadow-sm" />
                ) : previewUrl ? (
                  <img src={previewUrl} alt="Original preview" className="max-w-full max-h-[380px] object-contain opacity-80 rounded-lg" />
                ) : null}
              </div>
            </div>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
