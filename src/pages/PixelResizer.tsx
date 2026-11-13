import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Download, Maximize, Image as ImageIcon, CheckCircle2, Loader2 } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { encodeCanvasUnderByteBudget } from '../lib/imageByteBudget';
import { useSEO } from '../hooks/useSEO';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

export default function PixelResizer() {
  useSEO('Pixel Resizer Online Free | PDF Media Suite', 'Free online Pixel Resizer tool. No signup or installation required.');

  const [file, setFile] = useState<File | null>(null);
  const [width, setWidth] = useState<number | ''>('');
  const [height, setHeight] = useState<number | ''>('');
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true);
  const [originalDimensions, setOriginalDimensions] = useState<{ w: number; h: number } | null>(null);
  const [maxTargetKb, setMaxTargetKb] = useState<string>('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [resizedUrl, setResizedUrl] = useState<string | null>(null);
  const [resizedFile, setResizedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const prefersReduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  useEffect(() => {
    return () => {
      if (resizedUrl) {
        URL.revokeObjectURL(resizedUrl);
      }
    };
  }, [resizedUrl]);

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      setFile(selectedFile);
      setResizedUrl(null);
      setResizedFile(null);

      // Get original dimensions
      const img = new Image();
      const tempUrl = URL.createObjectURL(selectedFile);
      img.onload = () => {
        setOriginalDimensions({ w: img.width, h: img.height });
        setWidth(img.width);
        setHeight(img.height);
        URL.revokeObjectURL(tempUrl);
      };
      img.onerror = () => {
        URL.revokeObjectURL(tempUrl);
      };
      img.src = tempUrl;
    }
  };

  const handleWidthChange = (val: string) => {
    const newWidth = parseInt(val, 10);
    setWidth(isNaN(newWidth) ? '' : newWidth);

    if (maintainAspectRatio && originalDimensions && !isNaN(newWidth)) {
      const ratio = originalDimensions.h / originalDimensions.w;
      setHeight(Math.round(newWidth * ratio));
    }
  };

  const handleHeightChange = (val: string) => {
    const newHeight = parseInt(val, 10);
    setHeight(isNaN(newHeight) ? '' : newHeight);

    if (maintainAspectRatio && originalDimensions && !isNaN(newHeight)) {
      const ratio = originalDimensions.w / originalDimensions.h;
      setWidth(Math.round(newHeight * ratio));
    }
  };

  const resizeImage = async () => {
    if (!file || !width || !height || !canvasRef.current) return;

    setIsProcessing(true);
    const tempSrc = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = tempSrc;

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        setIsProcessing(false);
        return;
      }

      canvas.width = width as number;
      canvas.height = height as number;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.drawImage(img, 0, 0, width as number, height as number);

      const maxKb = parseFloat(maxTargetKb.replace(',', '.'));
      const maxBytes =
        Number.isFinite(maxKb) && maxKb > 0 ? Math.round(maxKb * 1024) : null;

      let blob: Blob | null = null;
      let outType = file.type;
      let outName = `resized_${file.name}`;

      if (maxBytes) {
        const enc = await encodeCanvasUnderByteBudget(canvas, 'image/jpeg', maxBytes);
        blob = enc.blob;
        outType = 'image/jpeg';
        outName = outName.replace(/\.[^.]+$/, '') + '.jpg';
      } else {
        blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b) => resolve(b), file.type, 0.95);
        });
      }

      if (blob) {
        const url = URL.createObjectURL(blob);
        setResizedUrl(url);
        setResizedFile(new File([blob], outName, { type: outType }));
      }
    } catch (error) {
      console.error('Error resizing image:', error);
      alert('An error occurred while resizing the image.');
    } finally {
      URL.revokeObjectURL(tempSrc);
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Pixel Resizer"
      subtitle="Resize image height and width to exact pixel dimensions with optional byte-budget compression."
      categoryLabel="Pixel Geometry Studio"
      icon={Maximize}
      microVariant="crop"
      tone="sky"
      trustNote="High-quality smoothing & optional KB ceiling · 100% browser-only"
    >
      {/* Hidden canvas kept mounted synchronously outside stage switches */}
      <canvas ref={canvasRef} className="hidden" />

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
            accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] }}
            title="Select Image file"
            subtitle="Drop PNG, JPG, or WebP here"
          />
        </motion.div>
      ) : (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.26 }}
          className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[1.08fr_0.92fr] gap-6 items-start"
        >
          {/* Controls / Result Panel */}
          <div className="relative pms-glass-panel rounded-3xl p-6 sm:p-8 space-y-6 overflow-hidden">
            <PearlScanOverlay active={isProcessing} label={`Resampling to ${width} × ${height} px…`} />

            <div
              className="flex items-center gap-4 p-4 rounded-2xl border"
              style={{ backgroundColor: 'var(--pms-white)', borderColor: 'var(--pms-border)' }}
            >
              <div className="w-14 h-14 bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] rounded-xl flex items-center justify-center shrink-0">
                <ImageIcon className="w-7 h-7" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-gray-900 dark:text-white truncate">{file.name}</p>
                {originalDimensions && (
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">
                    Original: <span className="font-semibold">{originalDimensions.w} × {originalDimensions.h} px</span>
                  </p>
                )}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {!resizedUrl ? (
                <motion.div
                  key="controls"
                  initial={prefersReduced ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReduced ? undefined : { opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-5"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-slate-400 mb-1.5">
                        Width (px)
                      </label>
                      <input
                        type="number"
                        value={width}
                        onChange={(e) => handleWidthChange(e.target.value)}
                        className="w-full px-4 py-3 rounded-2xl border border-[var(--pms-border)] bg-white/85 dark:bg-slate-900/70 text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 outline-none transition-all font-semibold"
                        placeholder="e.g. 1920"
                        min="1"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-slate-400 mb-1.5">
                        Height (px)
                      </label>
                      <input
                        type="number"
                        value={height}
                        onChange={(e) => handleHeightChange(e.target.value)}
                        className="w-full px-4 py-3 rounded-2xl border border-[var(--pms-border)] bg-white/85 dark:bg-slate-900/70 text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 outline-none transition-all font-semibold"
                        placeholder="e.g. 1080"
                        min="1"
                      />
                    </div>
                  </div>

                  <label htmlFor="aspect-ratio" className="flex items-center gap-2.5 text-sm font-semibold text-gray-700 dark:text-slate-300 cursor-pointer select-none">
                    <input
                      id="aspect-ratio"
                      type="checkbox"
                      checked={maintainAspectRatio}
                      onChange={(e) => setMaintainAspectRatio(e.target.checked)}
                      className="w-4 h-4 accent-sky-600 rounded"
                    />
                    Maintain aspect ratio
                  </label>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-slate-400 mb-1.5">
                      Max output size (optional, KB)
                    </label>
                    <input
                      type="number"
                      min={1}
                      className="w-full px-4 py-3 rounded-2xl border border-[var(--pms-border)] bg-white/85 dark:bg-slate-900/70 text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 outline-none transition-all"
                      placeholder="e.g. 200 — uses JPEG byte-budget tuning"
                      value={maxTargetKb}
                      onChange={(e) => setMaxTargetKb(e.target.value)}
                    />
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5">
                      When set, export uses the same byte-budget encoder as the form resizer (JPEG).
                    </p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <motion.button
                      whileHover={prefersReduced || isProcessing || !width || !height ? undefined : { scale: 1.01 }}
                      whileTap={prefersReduced || isProcessing || !width || !height ? undefined : { scale: 0.985 }}
                      onClick={resizeImage}
                      disabled={isProcessing || !width || !height}
                      className="flex-1 pms-btn-primary py-3.5 text-base font-bold rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Maximize className="w-5 h-5" />}
                      <span>{isProcessing ? 'Resizing…' : 'Resize Image'}</span>
                    </motion.button>
                    <button
                      onClick={() => setFile(null)}
                      disabled={isProcessing}
                      className="px-5 py-3.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-semibold rounded-2xl hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
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
                    <h3 className="text-xl font-extrabold text-emerald-900 dark:text-emerald-200 mb-4">Image Resized!</h3>
                    <div className="grid grid-cols-2 gap-3 mb-6 text-sm">
                      <div className="rounded-xl bg-white/70 dark:bg-slate-900/50 p-3 border border-emerald-200/50 dark:border-emerald-800/40">
                        <p className="text-[11px] text-gray-500 dark:text-slate-400">New Dimensions</p>
                        <p className="font-bold text-gray-900 dark:text-white">
                          <AnimatedNumber value={Number(width) || 0} /> × <AnimatedNumber value={Number(height) || 0} suffix=" px" />
                        </p>
                      </div>
                      {resizedFile && (
                        <div className="rounded-xl bg-white/70 dark:bg-slate-900/50 p-3 border border-emerald-200/50 dark:border-emerald-800/40">
                          <p className="text-[11px] text-gray-500 dark:text-slate-400">New Size</p>
                          <p className="font-bold text-emerald-700 dark:text-emerald-400">
                            <AnimatedNumber value={resizedFile.size / 1024} decimals={2} suffix=" KB" />
                          </p>
                        </div>
                      )}
                    </div>
                    <motion.a
                      whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                      whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                      href={resizedUrl}
                      download={resizedFile?.name || `resized_${file.name}`}
                      className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-base font-bold rounded-2xl shadow-lg shadow-emerald-600/20 transition-colors"
                    >
                      <Download className="w-5 h-5" />
                      Download Image
                    </motion.a>
                  </div>
                  <button
                    onClick={() => {
                      setFile(null);
                      setResizedUrl(null);
                    }}
                    className="w-full py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-2xl font-semibold text-sm transition-colors cursor-pointer"
                  >
                    Resize another Image
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Crisp Preview Panel */}
          <div className="relative pms-glass-panel rounded-3xl p-5 sm:p-6 flex flex-col gap-3 overflow-hidden">
            <PearlScanOverlay active={isProcessing} label="Rendering pixels…" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                {resizedUrl ? 'Resized Output' : 'Source Preview'}
              </span>
              {resizedUrl && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300">
                  {width}×{height}px
                </span>
              )}
            </div>
            <div className="pms-checkerboard bg-white dark:bg-slate-950 rounded-2xl border border-[var(--pms-border)] p-4 flex items-center justify-center min-h-[320px] overflow-hidden">
              {resizedUrl ? (
                <img src={resizedUrl} alt="Resized preview" className="max-w-full max-h-[380px] object-contain rounded-lg shadow-sm" />
              ) : previewUrl ? (
                <img src={previewUrl} alt="Original preview" className="max-w-full max-h-[380px] object-contain opacity-80 rounded-lg" />
              ) : null}
            </div>
          </div>
        </motion.div>
      )}
    </ToolWorkspaceShell>
  );
}
