import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Download, ImageMinus, Image as ImageIcon, CheckCircle2, Loader2 } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import imageCompression from 'browser-image-compression';
import { encodeCanvasUnderByteBudget } from '../lib/imageByteBudget';
import { useSEO } from '../hooks/useSEO';
import { useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

const PRESET_KBS = [20, 50, 100, 200];

export default function ExactImageSize() {
  useSEO('Exact Image Size Online Free | PDF Media Suite', 'Free online Exact Image Size tool. No signup or installation required.');

  const [file, setFile] = useState<File | null>(null);
  const [targetSizeKB, setTargetSizeKB] = useState<number>(50);
  const [isProcessing, setIsProcessing] = useState(false);
  const [compressedUrl, setCompressedUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<{ original: number; compressed: number } | null>(null);
  const [compressedFile, setCompressedFile] = useState<File | null>(null);
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
      setCompressedFile(null);
    }
  };

  const compressImage = async () => {
    if (!file || !targetSizeKB) return;

    setIsProcessing(true);
    try {
      const options = {
        maxSizeMB: targetSizeKB / 1024,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        initialQuality: 0.8,
      };

      let compressedBlob: Blob = await imageCompression(file, options);
      const targetBytes = targetSizeKB * 1024;

      if (compressedBlob.size > targetBytes) {
        const bmp = await createImageBitmap(compressedBlob);
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        const x = canvas.getContext('2d');
        if (x) {
          x.drawImage(bmp, 0, 0);
          const mime =
            compressedBlob.type === 'image/webp' || file.type === 'image/webp'
              ? 'image/webp'
              : 'image/jpeg';
          const enc = await encodeCanvasUnderByteBudget(canvas, mime, targetBytes);
          compressedBlob = enc.blob;
        }
        bmp.close?.();
      }

      const url = URL.createObjectURL(compressedBlob);

      setStats({
        original: file.size,
        compressed: compressedBlob.size,
      });
      setCompressedUrl(url);
      const outName =
        compressedBlob.type === 'image/jpeg' && !file.name.toLowerCase().endsWith('.jpg')
          ? file.name.replace(/\.[^.]+$/, '') + '.jpg'
          : file.name;
      setCompressedFile(new File([compressedBlob], outName, { type: compressedBlob.type }));
    } catch (error) {
      console.error('Error compressing image:', error);
      alert('An error occurred while compressing the image.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Exact Image Size"
      subtitle="Compress images to a strict byte limit (e.g., under 50 KB) for upload forms & portals."
      categoryLabel="Byte-Budget Optimizer"
      icon={ImageMinus}
      microVariant="compress"
      tone="emerald"
      trustNote="Strict KB ceiling encoder · 100% browser-only"
    >
      <PearlStageSwitch stageKey={!file ? 'drop' : 'studio'}>
        {!file ? (
          <div className="max-w-2xl mx-auto">
            <FileDropzone
              onDrop={handleDrop}
              multiple={false}
              accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] }}
              title="Select Image file"
              subtitle="Drop PNG, JPG, or WebP here"
            />
          </div>
        ) : (
          <div className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6 items-start">
            {/* Control / Result Panel */}
            <div className="relative pms-glass-panel rounded-3xl p-6 sm:p-8 space-y-6 overflow-hidden">
              <PearlScanOverlay active={isProcessing} label={`Encoding under ${targetSizeKB} KB…`} />

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
                    Original: <span className="font-semibold">{(file.size / 1024).toFixed(2)} KB</span>
                  </p>
                </div>
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
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-bold text-gray-700 dark:text-slate-300">
                          Max Target Size (KB)
                        </label>
                        <div className="flex items-center gap-1.5">
                          {PRESET_KBS.map((kb) => (
                            <button
                              key={kb}
                              type="button"
                              onClick={() => setTargetSizeKB(kb)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                                targetSizeKB === kb
                                  ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-white/70 dark:bg-slate-800/70 border-[var(--pms-border)] text-gray-600 dark:text-slate-300 hover:border-emerald-400'
                              }`}
                            >
                              {kb} KB
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <ImageMinus className="h-5 w-5 text-emerald-500" />
                        </div>
                        <input
                          type="number"
                          value={targetSizeKB}
                          onChange={(e) => setTargetSizeKB(Number(e.target.value))}
                          className="w-full pl-11 pr-4 py-3 rounded-2xl border border-[var(--pms-border)] bg-white/85 dark:bg-slate-900/70 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none transition-all font-semibold"
                          placeholder="50"
                          min="1"
                        />
                      </div>
                    </div>

                    <div className="flex gap-3 pt-1">
                      <motion.button
                        whileHover={prefersReduced || isProcessing || !targetSizeKB ? undefined : { scale: 1.01 }}
                        whileTap={prefersReduced || isProcessing || !targetSizeKB ? undefined : { scale: 0.985 }}
                        onClick={compressImage}
                        disabled={isProcessing || !targetSizeKB}
                        className="flex-1 pms-btn-primary py-3.5 text-base font-bold rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageMinus className="w-5 h-5" />}
                        <span>{isProcessing ? 'Compressing…' : 'Compress Image'}</span>
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
                        Image Compressed!
                      </h3>
                      {stats && (
                        <div className="grid grid-cols-3 gap-3 mb-6 text-sm">
                          <div className="rounded-xl bg-white/70 dark:bg-slate-900/50 p-2.5 border border-emerald-200/50 dark:border-emerald-800/40">
                            <p className="text-[11px] text-gray-500 dark:text-slate-400">Original</p>
                            <p className="font-bold text-gray-900 dark:text-white">
                              <AnimatedNumber value={stats.original / 1024} decimals={2} suffix=" KB" />
                            </p>
                          </div>
                          <div className="rounded-xl bg-white/70 dark:bg-slate-900/50 p-2.5 border border-emerald-200/50 dark:border-emerald-800/40">
                            <p className="text-[11px] text-gray-500 dark:text-slate-400">Compressed</p>
                            <p className="font-extrabold text-emerald-700 dark:text-emerald-400">
                              <AnimatedNumber value={stats.compressed / 1024} decimals={2} suffix=" KB" />
                            </p>
                          </div>
                          <div className="rounded-xl bg-white/70 dark:bg-slate-900/50 p-2.5 border border-emerald-200/50 dark:border-emerald-800/40">
                            <p className="text-[11px] text-gray-500 dark:text-slate-400">Target Max</p>
                            <p className="font-bold text-teal-700 dark:text-teal-400">
                              <AnimatedNumber value={targetSizeKB} suffix=" KB" />
                            </p>
                          </div>
                        </div>
                      )}
                      <motion.a
                        whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                        whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                        href={compressedUrl}
                        download={`compressed_${compressedFile?.name || file.name}`}
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
                      Compress another Image
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
                  {compressedUrl ? 'Compressed Preview' : 'Original Preview'}
                </span>
                {compressedUrl && (
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300">
                    Ready
                  </span>
                )}
              </div>
              <div className="pms-checkerboard bg-white dark:bg-slate-950 rounded-2xl border border-[var(--pms-border)] p-4 flex items-center justify-center min-h-[300px] overflow-hidden">
                {compressedUrl ? (
                  <img src={compressedUrl} alt="Compressed preview" className="max-w-full max-h-[380px] object-contain rounded-lg shadow-sm" />
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
