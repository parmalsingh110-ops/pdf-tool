import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Eraser, ImageIcon, RefreshCw } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';

// â”€â”€â”€ CDN fallback chain â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      setProgressText('Model ready âœ“');
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
      setProgressText('Done âœ“');
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Background removal failed. Please try again.');
      setProgressText('');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Remove Background</h1>
        <p className="text-xl text-gray-600">
          AI-powered background removal â€” runs entirely in your browser.
        </p>
      </div>

      {/* Model loading banner */}
      {!modelReady && (
        <div className="w-full max-w-xl mb-6">
          {loadingModel && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-blue-800">Loading AI Modelâ€¦</p>
                <span className="text-sm font-bold text-blue-700">{loadProgress}%</span>
              </div>
              <div className="w-full bg-blue-100 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${loadProgress}%` }}
                />
              </div>
              <p className="text-xs text-blue-600 mt-2">{progressText}</p>
              <p className="text-xs text-blue-500 mt-1">
                First time only (~25 MB). Cached in browser for instant future use.
              </p>
            </div>
          )}
          {error && !loadingModel && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-3">
              <p className="text-sm font-semibold text-red-700">âš  Model failed to load</p>
              <p className="text-xs text-red-600">{error}</p>
              <button
                type="button"
                onClick={loadModel}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
            </div>
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
        <div className="w-full max-w-4xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <p className="font-semibold text-gray-800 mb-3">Original</p>
              <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                {filePreview && (
                  <img src={filePreview} alt="Original" className="w-full h-auto object-contain max-h-[420px]" />
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-pink-50 text-pink-600 rounded-xl flex items-center justify-center">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 truncate max-w-[240px]">{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>

              {format !== 'png' && (
                <>
                  <label className="block text-sm font-medium text-gray-700">
                    Background Color
                    <input
                      type="color"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="mt-2 w-full h-11 p-1 border border-gray-300 rounded-lg"
                    />
                  </label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setBgColor('#ffffff')} className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-medium">Passport White</button>
                    <button type="button" onClick={() => setBgColor('#d6e7ff')} className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-medium">Light Blue</button>
                  </div>
                </>
              )}

              <label className="block text-sm font-medium text-gray-700">
                Quality ({Math.round(quality * 100)}%)
                <input type="range" min={0.6} max={1} step={0.01} value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="mt-2 w-full" />
              </label>

              <label className="block text-sm font-medium text-gray-700">
                Output Format
                <select value={format} onChange={(e) => setFormat(e.target.value as any)}
                  className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg">
                  <option value="png">PNG (transparent background)</option>
                  <option value="jpg">JPG</option>
                  <option value="jpeg">JPEG</option>
                  <option value="webp">WEBP</option>
                </select>
              </label>

              {error && (
                <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200 space-y-2">
                  <p>{error}</p>
                  {!modelReady && (
                    <button type="button" onClick={loadModel}
                      className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700">
                      <RefreshCw className="w-3 h-3" /> Retry
                    </button>
                  )}
                </div>
              )}
              {progressText && (
                <div className="p-3 bg-blue-50 text-blue-700 text-sm rounded-lg border border-blue-200">
                  {progressText}
                </div>
              )}
              {!modelReady && !error && loadingModel && (
                <div className="p-3 bg-amber-50 text-amber-800 text-sm rounded-lg border border-amber-200">
                  â³ Waiting for AI model to finish loadingâ€¦
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={process}
                  disabled={isProcessing || !modelReady}
                  className="flex-1 py-3 bg-pink-600 text-white font-bold rounded-xl hover:bg-pink-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                >
                  <Eraser className="w-5 h-5" />
                  {isProcessing ? 'Removing...' : 'Remove Background'}
                </button>
                <button
                  onClick={() => { setFile(null); setResultUrl(null); setError(null); setProgressText(''); }}
                  className="px-5 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Reset
                </button>
              </div>

              {resultUrl && (
                <div className="mt-2 space-y-3">
                  <p className="text-sm font-semibold text-gray-800">Result Preview</p>
                  <div
                    className="rounded-xl border border-gray-200 overflow-hidden"
                    style={{
                      background: format === 'png'
                        ? 'repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%) 0 0 / 16px 16px'
                        : bgColor,
                    }}
                  >
                    <img src={resultUrl} alt="Result" className="w-full h-auto object-contain max-h-[280px]" />
                  </div>
                  <a
                    href={resultUrl}
                    download={`${file.name.replace(/\.[^/.]+$/, '')}_no_bg.${format}`}
                    className="w-full inline-flex items-center justify-center gap-2 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-colors"
                  >
                    <Download className="w-5 h-5" />
                    Download Result
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
