import React, { useState, useRef, useCallback } from 'react';
import { ScanLine, Download, Loader2, RotateCw, Crop } from 'lucide-react';

export default function DocumentScanner() {
  const [file, setFile] = useState<File | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [enhanceMode, setEnhanceMode] = useState<'document' | 'photo' | 'bw'>('document');
  const [rotation, setRotation] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [useCamera, setUseCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    setImgUrl(URL.createObjectURL(f));
    setResultUrl(null);
    setRotation(0);
  };

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } });
      setStream(s);
      setUseCamera(true);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = s; }, 100);
    } catch {
      alert('Camera access denied. Please allow camera permission.');
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(v, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      const f = new File([blob], 'captured.jpg', { type: 'image/jpeg' });
      setFile(f);
      setImgUrl(URL.createObjectURL(f));
      setResultUrl(null);
      setRotation(0);
      // Stop camera
      stream?.getTracks().forEach(t => t.stop());
      setStream(null);
      setUseCamera(false);
    }, 'image/jpeg', 0.95);
  };

  const processImage = async () => {
    if (!imgUrl) return;
    setBusy(true);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imgUrl;
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); });

      const canvas = document.createElement('canvas');
      // Handle rotation
      const isRotated = rotation % 180 !== 0;
      canvas.width = isRotated ? img.naturalHeight : img.naturalWidth;
      canvas.height = isRotated ? img.naturalWidth : img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

      // Enhancement
      const w = canvas.width, h = canvas.height;
      const imageData = ctx.getImageData(0, 0, w, h);
      const d = imageData.data;

      if (enhanceMode === 'document') {
        // Auto-levels + contrast boost for documents
        let minL = 255, maxL = 0;
        for (let i = 0; i < d.length; i += 16) {
          const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          if (l < minL) minL = l;
          if (l > maxL) maxL = l;
        }
        const range = Math.max(1, maxL - minL);
        const scale = 255 / range;
        for (let i = 0; i < d.length; i += 4) {
          d[i]     = Math.min(255, Math.max(0, (d[i] - minL) * scale * 1.1));
          d[i + 1] = Math.min(255, Math.max(0, (d[i + 1] - minL) * scale * 1.1));
          d[i + 2] = Math.min(255, Math.max(0, (d[i + 2] - minL) * scale * 1.1));
        }
      } else if (enhanceMode === 'bw') {
        // Otsu-like thresholding
        let sum = 0, count = 0;
        for (let i = 0; i < d.length; i += 4) {
          sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          count++;
        }
        const threshold = sum / count;
        for (let i = 0; i < d.length; i += 4) {
          const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const v = l > threshold ? 255 : 0;
          d[i] = d[i + 1] = d[i + 2] = v;
        }
      }
      // 'photo' mode: no enhancement

      // Reset transform and put back
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.putImageData(imageData, 0, 0);

      const blob = await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/jpeg', 0.92));
      if (blob) {
        if (resultUrl) URL.revokeObjectURL(resultUrl);
        setResultUrl(URL.createObjectURL(blob));
      }
    } catch (e: any) {
      alert(e?.message || 'Processing failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Document Scanner</h1>
        <p className="text-xl text-gray-600">Capture or upload documents, auto-enhance for clean digital copies.</p>
      </div>

      <div className="w-full max-w-3xl space-y-6">
        {useCamera ? (
          <div className="space-y-4">
            <div className="relative rounded-2xl overflow-hidden bg-black">
              <video ref={videoRef} autoPlay playsInline className="w-full max-h-[400px]" />
              <div className="absolute inset-0 border-4 border-dashed border-white/30 m-4 rounded-xl pointer-events-none" />
            </div>
            <div className="flex gap-3">
              <button onClick={capturePhoto} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700">📸 Capture</button>
              <button onClick={() => { stream?.getTracks().forEach(t => t.stop()); setUseCamera(false); }}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200">Cancel</button>
            </div>
          </div>
        ) : !imgUrl ? (
          <div className="space-y-4">
            <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50 cursor-pointer hover:bg-gray-100">
              <ScanLine className="w-12 h-12 text-gray-400 mb-3" />
              <span className="text-gray-600 font-semibold">Upload document image</span>
              <span className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
            </label>
            <button onClick={startCamera} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 flex items-center justify-center gap-2">
              📷 Use Camera
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Original</p>
                <img src={imgUrl} alt="Original" className="w-full rounded-xl border border-gray-200 object-contain max-h-[350px]"
                  style={{ transform: `rotate(${rotation}deg)` }} />
              </div>
              {resultUrl && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Enhanced</p>
                  <img src={resultUrl} alt="Enhanced" className="w-full rounded-xl border border-gray-200 object-contain max-h-[350px]" />
                </div>
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setRotation(r => (r + 90) % 360)} className="px-4 py-2 bg-gray-100 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-gray-200">
                <RotateCw className="w-4 h-4" /> Rotate 90°
              </button>
              {(['document', 'bw', 'photo'] as const).map(m => (
                <button key={m} onClick={() => setEnhanceMode(m)}
                  className={`px-4 py-2 rounded-xl font-semibold text-sm ${enhanceMode === m ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                  {m === 'document' ? '📄 Document' : m === 'bw' ? '⬛ B&W' : '📷 Photo'}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={processImage} disabled={busy}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ScanLine className="w-5 h-5" />}
                {busy ? 'Processing…' : 'Enhance Document'}
              </button>
              {resultUrl && (
                <a href={resultUrl} download="scanned_document.jpg" className="px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 flex items-center gap-2">
                  <Download className="w-5 h-5" /> Save
                </a>
              )}
              <button onClick={() => { setFile(null); setImgUrl(null); setResultUrl(null); }}
                className="px-5 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200">New</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
