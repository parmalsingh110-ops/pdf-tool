import React, { useState, useMemo } from 'react';
import { FileImage, Download, Loader2 } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';

export default function ConvertToWebP() {
  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState(80);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const previewUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  const handleDrop = (files: File[]) => {
    if (files[0]) {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
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
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Image load failed')); });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get context');
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(b => resolve(b), 'image/webp', quality / 100));
      if (!blob) throw new Error('Conversion failed');

      if (resultUrl) URL.revokeObjectURL(resultUrl);
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultSize(blob.size);
    } catch (e: any) {
      alert(e?.message || 'Conversion failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Convert to WebP</h1>
        <p className="text-xl text-gray-600">Convert JPG or PNG images to next-gen WebP format for smaller file sizes.</p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select image file" accept={{ "image/*": [".png", ".jpg", ".jpeg"] }} />
      ) : (
        <div className="w-full max-w-3xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Original */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Original ({(file.size / 1024).toFixed(1)} KB)</p>
              <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                {previewUrl && <img src={previewUrl} alt="Original" className="w-full h-48 object-contain" />}
              </div>
            </div>
            {/* Result */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">
                WebP {resultSize ? `(${(resultSize / 1024).toFixed(1)} KB — ${Math.round((1 - resultSize / file.size) * 100)}% smaller)` : ''}
              </p>
              <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center h-48">
                {resultUrl ? (
                  <img src={resultUrl} alt="WebP" className="w-full h-48 object-contain" />
                ) : (
                  <span className="text-gray-400 text-sm">Convert to see preview</span>
                )}
              </div>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Quality: {quality}%</label>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={quality}
              onChange={e => setQuality(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>10% (smallest)</span>
              <span>100% (best quality)</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleProcess}
              disabled={busy}
              className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileImage className="w-5 h-5" />}
              {busy ? 'Converting…' : 'Convert to WebP'}
            </button>
            {resultUrl && (
              <a
                href={resultUrl}
                download={`${file.name.replace(/\.[^/.]+$/, '')}.webp`}
                className="px-6 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 flex items-center gap-2"
              >
                <Download className="w-5 h-5" />
                Download
              </a>
            )}
            <button onClick={() => { setFile(null); if (resultUrl) URL.revokeObjectURL(resultUrl); setResultUrl(null); }} className="px-5 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200">Reset</button>
          </div>
        </div>
      )}
    </div>
  );
}
