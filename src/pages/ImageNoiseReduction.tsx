import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Download, Loader2 } from 'lucide-react';

export default function ImageNoiseReduction() {
  const [file, setFile] = useState<File | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [strength, setStrength] = useState(5);
  const [mode, setMode] = useState<'bilateral' | 'median' | 'gaussian'>('bilateral');
  const [compareView, setCompareView] = useState(true);
  const [splitPos, setSplitPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setImgUrl(URL.createObjectURL(f));
    setResultUrl(null);
  };

  const processImage = useCallback(async () => {
    if (!imgUrl) return;
    setBusy(true);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imgUrl;
      await new Promise<void>((res) => { img.onload = () => res(); });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data, width, height } = imageData;
      const output = new Uint8ClampedArray(data);
      const radius = Math.max(1, Math.round(strength / 2));

      if (mode === 'bilateral') {
        // Bilateral filter: edge-preserving smoothing
        const sigmaSpace = radius * 2;
        const sigmaColor = strength * 5;
        const sigmaColor2 = 2 * sigmaColor * sigmaColor;
        const sigmaSpace2 = 2 * sigmaSpace * sigmaSpace;

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            let sumR = 0, sumG = 0, sumB = 0, sumW = 0;

            for (let dy = -radius; dy <= radius; dy++) {
              for (let dx = -radius; dx <= radius; dx++) {
                const ny = y + dy, nx = x + dx;
                if (ny < 0 || ny >= height || nx < 0 || nx >= width) continue;
                const nIdx = (ny * width + nx) * 4;

                const dR = data[idx] - data[nIdx];
                const dG = data[idx + 1] - data[nIdx + 1];
                const dB = data[idx + 2] - data[nIdx + 2];
                const colorDist = dR * dR + dG * dG + dB * dB;
                const spaceDist = dx * dx + dy * dy;

                const weight = Math.exp(-colorDist / sigmaColor2 - spaceDist / sigmaSpace2);
                sumR += data[nIdx] * weight;
                sumG += data[nIdx + 1] * weight;
                sumB += data[nIdx + 2] * weight;
                sumW += weight;
              }
            }

            output[idx] = sumR / sumW;
            output[idx + 1] = sumG / sumW;
            output[idx + 2] = sumB / sumW;
            output[idx + 3] = data[idx + 3];
          }
        }
      } else if (mode === 'median') {
        // Median filter
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const rArr: number[] = [], gArr: number[] = [], bArr: number[] = [];

            for (let dy = -radius; dy <= radius; dy++) {
              for (let dx = -radius; dx <= radius; dx++) {
                const ny = Math.min(height - 1, Math.max(0, y + dy));
                const nx = Math.min(width - 1, Math.max(0, x + dx));
                const nIdx = (ny * width + nx) * 4;
                rArr.push(data[nIdx]);
                gArr.push(data[nIdx + 1]);
                bArr.push(data[nIdx + 2]);
              }
            }

            rArr.sort((a, b) => a - b);
            gArr.sort((a, b) => a - b);
            bArr.sort((a, b) => a - b);
            const mid = Math.floor(rArr.length / 2);
            output[idx] = rArr[mid];
            output[idx + 1] = gArr[mid];
            output[idx + 2] = bArr[mid];
            output[idx + 3] = data[idx + 3];
          }
        }
      } else {
        // Gaussian blur
        const kernel: number[] = [];
        let kernelSum = 0;
        for (let i = -radius; i <= radius; i++) {
          const val = Math.exp(-(i * i) / (2 * radius * radius));
          kernel.push(val);
          kernelSum += val;
        }
        kernel.forEach((_, i) => kernel[i] /= kernelSum);

        // Horizontal pass
        const temp = new Uint8ClampedArray(data);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            let r = 0, g = 0, b = 0;
            for (let k = -radius; k <= radius; k++) {
              const nx = Math.min(width - 1, Math.max(0, x + k));
              const nIdx = (y * width + nx) * 4;
              const w = kernel[k + radius];
              r += data[nIdx] * w;
              g += data[nIdx + 1] * w;
              b += data[nIdx + 2] * w;
            }
            const idx = (y * width + x) * 4;
            temp[idx] = r; temp[idx + 1] = g; temp[idx + 2] = b;
          }
        }

        // Vertical pass
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            let r = 0, g = 0, b = 0;
            for (let k = -radius; k <= radius; k++) {
              const ny = Math.min(height - 1, Math.max(0, y + k));
              const nIdx = (ny * width + x) * 4;
              const w = kernel[k + radius];
              r += temp[nIdx] * w;
              g += temp[nIdx + 1] * w;
              b += temp[nIdx + 2] * w;
            }
            const idx = (y * width + x) * 4;
            output[idx] = r; output[idx + 1] = g; output[idx + 2] = b;
            output[idx + 3] = data[idx + 3];
          }
        }
      }

      const outData = new ImageData(output, width, height);
      ctx.putImageData(outData, 0, 0);

      const blob = await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/jpeg', 0.95));
      if (blob) {
        if (resultUrl) URL.revokeObjectURL(resultUrl);
        setResultUrl(URL.createObjectURL(blob));
      }
    } catch (e: any) {
      alert(e?.message || 'Processing failed.');
    } finally {
      setBusy(false);
    }
  }, [imgUrl, strength, mode]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!compareView || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setSplitPos(((e.clientX - rect.left) / rect.width) * 100);
  };

  return (
    <div className="flex-1 flex flex-col items-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Image Noise Reduction</h1>
        <p className="text-xl text-gray-600">Remove noise from photos using advanced filtering algorithms.</p>
      </div>

      {!file ? (
        <label className="flex flex-col items-center justify-center w-full max-w-xl h-64 border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50 cursor-pointer hover:bg-gray-100">
          <Sparkles className="w-12 h-12 text-gray-400 mb-3" />
          <span className="text-gray-600 font-semibold">Select a noisy image</span>
          <span className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </label>
      ) : (
        <div className="w-full max-w-4xl space-y-6">
          {/* Compare view */}
          <div ref={containerRef} className="relative bg-gray-100 rounded-2xl border border-gray-200 overflow-hidden cursor-col-resize"
            style={{ minHeight: 350 }} onMouseMove={handleMouseMove}>
            {/* Original (full width) */}
            <img src={imgUrl!} alt="Original" className="w-full max-h-[450px] object-contain" />
            
            {/* Result overlay (clipped) */}
            {resultUrl && compareView && (
              <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}>
                <img src={resultUrl} alt="Denoised" className="w-full max-h-[450px] object-contain" />
              </div>
            )}

            {/* Split line */}
            {resultUrl && compareView && (
              <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none" style={{ left: `${splitPos}%` }}>
                <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap">
                  ← Original | Denoised →
                </div>
              </div>
            )}

            {!resultUrl && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-gray-400 font-semibold bg-white/80 px-4 py-2 rounded-xl">Adjust settings and click "Denoise"</span>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Algorithm</label>
                <select value={mode} onChange={e => setMode(e.target.value as any)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="bilateral">Bilateral (edge-preserving) ★</option>
                  <option value="median">Median (salt & pepper)</option>
                  <option value="gaussian">Gaussian (general smooth)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Strength: {strength}</label>
                <input type="range" min={1} max={15} value={strength} onChange={e => setStrength(Number(e.target.value))} className="w-full mt-1" />
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>Subtle</span><span>Strong</span>
                </div>
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={compareView} onChange={e => setCompareView(e.target.checked)} className="rounded" />
                  Split compare
                </label>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={processImage} disabled={busy}
                className="flex-1 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                {busy ? 'Processing…' : 'Denoise Image'}
              </button>
              {resultUrl && (
                <a href={resultUrl} download={`denoised_${file.name}`}
                  className="px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 flex items-center gap-2">
                  <Download className="w-5 h-5" /> Save
                </a>
              )}
              <label className="px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm cursor-pointer hover:bg-gray-200 flex items-center">
                New <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
