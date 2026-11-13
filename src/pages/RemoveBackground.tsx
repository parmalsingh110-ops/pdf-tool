import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CheckCircle2, Download, Eraser, ImageIcon, RefreshCw } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { useSEO } from '../hooks/useSEO';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

// ─── CDN fallback chain ──────────────────────────────────────────────────────
// staticimgly.com often has CORS / availability issues.
// We try multiple CDNs in order until one works.
const CDN_FALLBACKS = [
  'https://cdn.jsdelivr.net/npm/@imgly/background-removal-data@1.7.0/dist/',
  'https://unpkg.com/@imgly/background-removal-data@1.7.0/dist/',
  'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/',
];

const BASE_CONFIG = {
  model: 'isnet_quint8' as const,
  device: 'cpu' as const,
  proxyToWorker: false,
  fetchArgs: { cache: 'force-cache' as RequestCache },
  output: { format: 'image/png' as const, quality: 1 },
};

async function tryLoadWithCDN(
  progressCb: (key: string, cur: number, tot: number) => void
): Promise<string> {
  const { preload } = await import('@imgly/background-removal');

  for (const cdn of CDN_FALLBACKS) {
    try {
      await preload({ ...BASE_CONFIG, publicPath: cdn, progress: progressCb });
      return cdn; // Return whichever CDN worked
    } catch (err) {
      console.warn(`[RemoveBG] CDN failed: ${cdn}`, err);
    }
  }
  throw new Error(
    'All CDN sources failed. Please check your internet connection and try again.'
  );
}

async function removeWithCDN(
  file: File,
  workingCdn: string,
  progressCb: (key: string, cur: number, tot: number) => void
): Promise<Blob> {
  const { removeBackground } = await import('@imgly/background-removal');
  return removeBackground(file, { ...BASE_CONFIG, publicPath: workingCdn, progress: progressCb });
}

export default function RemoveBackground() {
  useSEO('Remove Background Online Free | PDF Media Suite', 'Free online Remove Background tool. No signup or installation required.');

  const prefersReduced = useReducedMotion();
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [quality, setQuality] = useState(0.95);
  const [format, setFormat] = useState<'png' | 'jpg' | 'jpeg' | 'webp'>('png');
  const [progressText, setProgressText] = useState('');
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [loadingModel, setLoadingModel] = useState(false);
  const workingCdnRef = useRef<string>(CDN_FALLBACKS[0]);

  const filePreview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  const loadModel = useCallback(async () => {
    setError(null);
    setModelReady(false);
    setLoadingModel(true);
    setLoadProgress(0);
    setProgressText('Connecting to model server...');
    try {
      const cdn = await tryLoadWithCDN((key, current, total) => {
        const pct = total > 0 ? Math.round((current / total) * 100) : 0;
        setLoadProgress(pct);
        setProgressText(`Downloading AI model: ${pct}%`);
      });
      workingCdnRef.current = cdn;
      setModelReady(true);
      setLoadProgress(100);
      setProgressText('Model ready ✓');
    } catch (e: any) {
      setError(e?.message || 'Failed to load AI model. Check your internet connection.');
      setProgressText('');
      setLoadProgress(0);
    } finally {
      setLoadingModel(false);
    }
  }, []);

  useEffect(() => {
    loadModel();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDrop = (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    setFile(acceptedFiles[0]);
    setResultUrl(null);
    setError(null);
  };

  const process = async () => {
    if (!file || !modelReady) return;
    setIsProcessing(true);
    setError(null);
    setProgressText('Starting background removal...');
    try {
      const cutoutBlob = await removeWithCDN(
        file,
        workingCdnRef.current,
        (key, current, total) => {
          const pct = total > 0 ? Math.round((current / total) * 100) : 0;
          setProgressText(`Processing: ${pct}%`);
        }
      );

      setProgressText('Compositing final image...');
      const cutoutUrl = URL.createObjectURL(cutoutBlob);
      const cutoutImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = cutoutUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = cutoutImg.width;
      canvas.height = cutoutImg.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context unavailable');

      if (format !== 'png') {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(cutoutImg, 0, 0);
      URL.revokeObjectURL(cutoutUrl);

      const mime =
        format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';

      const outBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, mime, quality);
      });
      if (!outBlob) throw new Error('Failed to export output image');

      setResultUrl(URL.createObjectURL(outBlob));
      setProgressText('Done ✓');
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Background removal failed. Please try again.');
      setProgressText('');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Remove Background"
      subtitle="AI-powered background removal — runs entirely in your browser."
      categoryLabel="Image Studio · On-Device Segmentation"
      icon={Eraser}
      microVariant="remove-bg"
      tone="rose"
    >
      <div className="flex flex-col items-center">
        {/* Model loading banner */}
        {!modelReady && (
          <div className="w-full max-w-xl mb-6">
            {loadingModel && (
              <motion.div
                initial={prefersReduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="pms-glass-panel bg-blue-50/80 dark:bg-blue-950/35 border border-blue-200/80 dark:border-blue-800/70 rounded-2xl p-5"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-blue-900 dark:text-blue-200">Loading AI Model…</p>
                  <span className="text-sm font-extrabold text-blue-700 dark:text-blue-300 font-mono">
                    <AnimatedNumber value={loadProgress} suffix="%" />
                  </span>
                </div>
                <div className="w-full bg-blue-100 dark:bg-blue-900/50 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-blue-600 dark:bg-blue-400 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${loadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-2 font-medium">{progressText}</p>
                <p className="text-xs text-blue-600/80 dark:text-blue-400/80 mt-1">
                  First time only (~25 MB). Cached in browser for instant future use.
                </p>
              </motion.div>
            )}
            {error && !loadingModel && (
              <motion.div
                initial={prefersReduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="pms-glass-panel bg-rose-50/85 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-800/70 rounded-2xl p-5 space-y-3"
              >
                <p className="text-sm font-bold text-rose-800 dark:text-rose-200">⚠ Model failed to load</p>
                <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p>
                <motion.button
                  whileTap={prefersReduced ? undefined : { scale: 0.97 }}
                  type="button"
                  onClick={loadModel}
                  className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white text-sm font-bold rounded-xl hover:bg-rose-700 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry
                </motion.button>
              </motion.div>
            )}
          </div>
        )}

      {!file ? (
        <FileDropzone
          onDrop={handleDrop}
          multiple={false}
          title="Select image file"
          subtitle="JPG, JPEG, PNG, WEBP, BMP, GIF"
          accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'] }}
        />
      ) : (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className="relative overflow-hidden min-h-[380px] w-full max-w-4xl pms-glass-panel rounded-3xl shadow-sm border border-[var(--pms-border)] p-6 sm:p-8"
        >
          <PearlScanOverlay active={isProcessing} label={progressText || 'Removing background with on-device AI...'} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <p className="font-bold text-sm text-[var(--pms-ink)] mb-3">Original</p>
              <div className="rounded-2xl border border-[var(--pms-border)] overflow-hidden bg-white p-2 shadow-inner">
                {filePreview && (
                  <img src={filePreview} alt="Original" className="w-full h-auto object-contain max-h-[420px] rounded-xl" />
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/65 dark:bg-slate-800/60 border border-[var(--pms-border)]">
                <div className="w-11 h-11 bg-rose-50 dark:bg-rose-950/45 border border-rose-200/70 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 rounded-xl flex items-center justify-center shrink-0">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm text-[var(--pms-ink)] truncate">{file.name}</p>
                  <p className="text-xs text-[var(--pms-muted)] font-mono">
                    <AnimatedNumber value={Number((file.size / 1024 / 1024).toFixed(2))} decimals={2} suffix=" MB" />
                  </p>
                </div>
              </div>

              {format !== 'png' && (
                <>
                  <label className="block text-sm font-semibold text-[var(--pms-ink)]">
                    Background Color
                    <input
                      type="color"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="mt-2 w-full h-11 p-1 border border-[var(--pms-border)] bg-white/85 dark:bg-slate-800/85 rounded-xl cursor-pointer"
                    />
                  </label>
                  <div className="flex gap-2">
                    <motion.button
                      whileTap={prefersReduced ? undefined : { scale: 0.96 }}
                      type="button"
                      onClick={() => setBgColor('#ffffff')}
                      className="px-3 py-2 bg-white/85 dark:bg-slate-800/85 border border-[var(--pms-border)] text-[var(--pms-ink)] hover:border-rose-400 rounded-xl text-xs font-bold transition-colors"
                    >
                      Passport White
                    </motion.button>
                    <motion.button
                      whileTap={prefersReduced ? undefined : { scale: 0.96 }}
                      type="button"
                      onClick={() => setBgColor('#d6e7ff')}
                      className="px-3 py-2 bg-white/85 dark:bg-slate-800/85 border border-[var(--pms-border)] text-[var(--pms-ink)] hover:border-rose-400 rounded-xl text-xs font-bold transition-colors"
                    >
                      Light Blue
                    </motion.button>
                  </div>
                </>
              )}

              <label className="block text-sm font-semibold text-[var(--pms-ink)]">
                <div className="flex items-center justify-between">
                  <span>Quality</span>
                  <span className="font-mono text-xs text-[var(--pms-muted)]">
                    <AnimatedNumber value={Math.round(quality * 100)} suffix="%" />
                  </span>
                </div>
                <input
                  type="range"
                  min={0.6}
                  max={1}
                  step={0.01}
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="mt-2 w-full accent-rose-600"
                />
              </label>

              <label className="block text-sm font-semibold text-[var(--pms-ink)]">
                Output Format
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as any)}
                  className="mt-2 w-full px-3 py-2.5 border border-[var(--pms-border)] bg-white/85 dark:bg-slate-800/85 text-[var(--pms-ink)] rounded-xl text-sm font-medium focus:outline-none focus:border-rose-500"
                >
                  <option value="png">PNG (transparent background)</option>
                  <option value="jpg">JPG</option>
                  <option value="jpeg">JPEG</option>
                  <option value="webp">WEBP</option>
                </select>
              </label>

              {error && (
                <div className="p-3 bg-rose-50/90 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-sm rounded-xl border border-rose-200 dark:border-rose-900/50 space-y-2">
                  <p>{error}</p>
                  {!modelReady && (
                    <button
                      type="button"
                      onClick={loadModel}
                      className="flex items-center gap-2 px-3 py-1.5 bg-rose-600 text-white text-xs font-semibold rounded-lg hover:bg-rose-700"
                    >
                      <RefreshCw className="w-3 h-3" /> Retry
                    </button>
                  )}
                </div>
              )}
              {progressText && (
                <div className="p-3 bg-blue-50/85 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-sm font-medium rounded-xl border border-blue-200/80 dark:border-blue-900/50">
                  {progressText}
                </div>
              )}
              {!modelReady && !error && loadingModel && (
                <div className="p-3 bg-amber-50/85 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-sm font-medium rounded-xl border border-amber-200/80 dark:border-amber-900/50">
                  ⏳ Waiting for AI model to finish loading…
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <motion.button
                  whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                  type="button"
                  onClick={process}
                  disabled={isProcessing || !modelReady}
                  className="pms-btn-primary flex-1 py-3 font-bold rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2 transition"
                >
                  <Eraser className="w-5 h-5" />
                  {isProcessing ? 'Removing...' : 'Remove Background'}
                </motion.button>
                <motion.button
                  whileTap={prefersReduced ? undefined : { scale: 0.97 }}
                  type="button"
                  onClick={() => { setFile(null); setResultUrl(null); setError(null); setProgressText(''); }}
                  className="px-5 py-3 bg-white/85 dark:bg-slate-800/85 border border-[var(--pms-border)] text-[var(--pms-ink)] font-semibold rounded-2xl hover:border-slate-400 transition-colors"
                >
                  Reset
                </motion.button>
              </div>

              {resultUrl && (
                <motion.div
                  initial={prefersReduced ? false : { opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="mt-2 p-4 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/35 border border-emerald-200/80 dark:border-emerald-800/70 space-y-3"
                >
                  <div className="flex items-center gap-2 text-sm font-bold text-emerald-800 dark:text-emerald-200">
                    <motion.div
                      initial={prefersReduced ? false : { scale: 0.6 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                      className="w-6 h-6 rounded-lg bg-emerald-500/15 flex items-center justify-center"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </motion.div>
                    <span>Cutout Ready</span>
                  </div>
                  <div
                    className={`rounded-xl border border-[var(--pms-border)] overflow-hidden shadow-inner ${
                      format === 'png' ? 'bg-white pms-checkerboard' : ''
                    }`}
                    style={format === 'png' ? undefined : { backgroundColor: bgColor }}
                  >
                    <img src={resultUrl} alt="Result" className="w-full h-auto object-contain max-h-[280px]" />
                  </div>
                  <motion.a
                    whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                    href={resultUrl}
                    download={`${file.name.replace(/\.[^/.]+$/, '')}_no_bg.${format}`}
                    className="w-full inline-flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-sm transition-colors"
                  >
                    <Download className="w-5 h-5" />
                    Download Result
                  </motion.a>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      )}
      </div>
    </ToolWorkspaceShell>
  );
}
