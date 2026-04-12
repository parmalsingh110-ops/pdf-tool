import { useEffect, useMemo, useState } from 'react';
import { Download, Eraser, ImageIcon } from 'lucide-react';
import { preload, removeBackground } from '@imgly/background-removal';
import FileDropzone from '../components/FileDropzone';

export default function RemoveBackground() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [quality, setQuality] = useState(0.95);
  const [format, setFormat] = useState<'png' | 'jpg' | 'jpeg' | 'webp'>('png');
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(false);

  const removerConfig = useMemo(
    () => ({
      model: 'isnet_quint8' as const,
      device: 'cpu' as const,
      proxyToWorker: true,
      rescale: true,
      fetchArgs: { cache: 'force-cache' as RequestCache },
      output: { format: 'image/png' as const, quality: 1 },
    }),
    []
  );

  const filePreview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setProgressText('Preparing AI model (first time only)...');
        await preload({
          ...removerConfig,
          progress: (key: string, current: number, total: number) => {
            if (!mounted) return;
            const pct = total > 0 ? Math.round((current / total) * 100) : 0;
            setProgressText(`${key} ${pct}%`);
          },
        });
        if (mounted) {
          setModelReady(true);
          setProgressText('Model ready');
        }
      } catch (e: any) {
        if (mounted) {
          setError(e?.message || 'Failed to preload model');
          setProgressText('');
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [removerConfig]);

  const handleDrop = (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    setFile(acceptedFiles[0]);
    setResultUrl(null);
    setError(null);
  };

  const process = async () => {
    if (!file) return;
    setIsProcessing(true);
    setError(null);
    setProgressText('Initializing background remover...');
    try {
      const cutoutBlob = await removeBackground(file, {
        ...removerConfig,
        progress: (key: string, current: number, total: number) => {
          const pct = total > 0 ? Math.round((current / total) * 100) : 0;
          setProgressText(`${key} ${pct}%`);
        },
      });

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

      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(cutoutImg, 0, 0);

      const mime = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';
      const outBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, mime, quality);
      });
      if (!outBlob) throw new Error('Failed to export output image');

      setResultUrl(URL.createObjectURL(outBlob));
      setProgressText('Done');
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Background removal failed.');
      setProgressText('');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Passport-Style Background Remover</h1>
        <p className="text-xl text-gray-600">Keep person, replace everything else with your chosen background color.</p>
      </div>

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
                {filePreview && <img src={filePreview} alt="Original" className="w-full h-auto object-contain max-h-[420px]" />}
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

              <label className="block text-sm font-medium text-gray-700">
                Background Color
                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="mt-2 w-full h-11 p-1 border border-gray-300 rounded-lg" />
              </label>

              <label className="block text-sm font-medium text-gray-700">
                Quality ({Math.round(quality * 100)}%)
                <input type="range" min={0.6} max={1} step={0.01} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="mt-2 w-full" />
              </label>

              <div className="flex gap-2">
                <button type="button" onClick={() => setBgColor('#ffffff')} className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-medium">Passport White</button>
                <button type="button" onClick={() => setBgColor('#d6e7ff')} className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-medium">Light Blue</button>
              </div>

              <label className="block text-sm font-medium text-gray-700">
                Output Format
                <select value={format} onChange={(e) => setFormat(e.target.value as any)} className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg">
                  <option value="png">PNG</option>
                  <option value="jpg">JPG</option>
                  <option value="jpeg">JPEG</option>
                  <option value="webp">WEBP</option>
                </select>
              </label>

              {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">{error}</div>}
              {progressText && <div className="p-3 bg-blue-50 text-blue-700 text-sm rounded-lg border border-blue-200">{progressText}</div>}
              {!modelReady && !error && (
                <div className="p-3 bg-amber-50 text-amber-800 text-sm rounded-lg border border-amber-200">
                  First run may take time while model downloads. Next runs are much faster.
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={process}
                  disabled={isProcessing || !modelReady}
                  className="flex-1 py-3 bg-pink-600 text-white font-bold rounded-xl hover:bg-pink-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Eraser className="w-5 h-5" />
                  {isProcessing ? 'Removing...' : 'Remove Background'}
                </button>
                <button
                  onClick={() => { setFile(null); setResultUrl(null); setError(null); }}
                  className="px-5 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200"
                >
                  Reset
                </button>
              </div>

              {resultUrl && (
                <div className="mt-2 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800 mb-2">Preview (Before Download)</p>
                    <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                      <img src={resultUrl} alt="Processed preview" className="w-full h-auto object-contain max-h-[280px]" />
                    </div>
                  </div>
                  <a
                    href={resultUrl}
                    download={`${file.name.replace(/\.[^/.]+$/, '')}_passport_bg.${format}`}
                    className="w-full inline-flex items-center justify-center gap-2 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700"
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
