import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Sparkles, Download, Loader2, CheckCircle2 } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { useSEO } from '../hooks/useSEO';
import { useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

export default function ImageNoiseReduction() {
  useSEO('Image Noise Reduction Online Free | PDF Media Suite', 'Free online Image Noise Reduction tool. No signup or installation required.');

  const [file, setFile] = useState<File | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [strength, setStrength] = useState(5);
  const [mode, setMode] = useState<'bilateral' | 'median' | 'gaussian'>('bilateral');
  const [compareView, setCompareView] = useState(true);
  const [splitPos, setSplitPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  const prefersReduced = useReducedMotion();

  useAutoRevokeUrl(imgUrl);
  useAutoRevokeUrl(resultUrl);

  const loadFile = (f: File) => {
    setFile(f);
    setImgUrl(URL.createObjectURL(f));
    setResultUrl(null);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    loadFile(f);
    e.target.value = '';
  };

  const processImage = useCallback(async () => {
    if (!imgUrl) return;
    setBusy(true);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imgUrl;
      await new Promise<void>((res) => {
        img.onload = () => res();
      });

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
            let sumR = 0,
              sumG = 0,
              sumB = 0,
              sumW = 0;

            for (let dy = -radius; dy <= radius; dy++) {
              for (let dx = -radius; dx <= radius; dx++) {
                const ny = y + dy,
                  nx = x + dx;
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
            const rArr: number[] = [],
              gArr: number[] = [],
              bArr: number[] = [];

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
        kernel.forEach((_, i) => (kernel[i] /= kernelSum));

        // Horizontal pass
        const temp = new Uint8ClampedArray(data);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            let r = 0,
              g = 0,
              b = 0;
            for (let k = -radius; k <= radius; k++) {
              const nx = Math.min(width - 1, Math.max(0, x + k));
              const nIdx = (y * width + nx) * 4;
              const w = kernel[k + radius];
              r += data[nIdx] * w;
              g += data[nIdx + 1] * w;
              b += data[nIdx + 2] * w;
            }
            const idx = (y * width + x) * 4;
            temp[idx] = r;
            temp[idx + 1] = g;
            temp[idx + 2] = b;
          }
        }

        // Vertical pass
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            let r = 0,
              g = 0,
              b = 0;
            for (let k = -radius; k <= radius; k++) {
              const ny = Math.min(height - 1, Math.max(0, y + k));
              const nIdx = (ny * width + x) * 4;
              const w = kernel[k + radius];
              r += temp[nIdx] * w;
              g += temp[nIdx + 1] * w;
              b += temp[nIdx + 2] * w;
            }
            const idx = (y * width + x) * 4;
            output[idx] = r;
            output[idx + 1] = g;
            output[idx + 2] = b;
            output[idx + 3] = data[idx + 3];
          }
        }
      }

      const outData = new ImageData(output, width, height);
      ctx.putImageData(outData, 0, 0);

      const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.95));
      if (blob) {
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
    <ToolWorkspaceShell
      title="Image Noise Reduction"
      subtitle="Remove grain and sensor noise from photos using Bilateral, Median, and Gaussian filters."
      categoryLabel="Pixel Denoise Lab"
      icon={Sparkles}
      microVariant="remove-bg"
      tone="violet"
      trustNote="Edge-preserving bilateral smoothing · 100% browser-only"
    >
      {!file ? (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="max-w-2xl mx-auto"
        >
          <FileDropzone
            onDrop={(files) => {
              if (files[0]) loadFile(files[0]);
            }}
            multiple={false}
            accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] }}
            title="Select a noisy image"
            subtitle="Drop JPG, PNG, or WebP photo here"
          />
        </motion.div>
      ) : (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.26 }}
          className="w-full max-w-4xl mx-auto space-y-6"
        >
          {/* Compare Viewport */}
          <div className="relative pms-glass-panel rounded-3xl p-4 sm:p-5 overflow-hidden">
            <PearlScanOverlay active={busy} label={`Running ${mode} filter (strength ${strength})…`} />
            <div
              ref={containerRef}
              className="relative pms-checkerboard bg-white dark:bg-slate-950 rounded-2xl border border-[var(--pms-border)] overflow-hidden cursor-col-resize"
              style={{ minHeight: 350 }}
              onMouseMove={handleMouseMove}
            >
              {/* Original */}
              <img src={imgUrl!} alt="Original" className="w-full max-h-[450px] object-contain" />

              {/* Result overlay (clipped) */}
              {resultUrl && compareView && (
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}
                >
                  <img src={resultUrl} alt="Denoised" className="w-full max-h-[450px] object-contain" />
                </div>
              )}

              {/* Split line */}
              {resultUrl && compareView && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none"
                  style={{ left: `${splitPos}%` }}
                >
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/75 text-white text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap shadow">
                    ← Original | Denoised →
                  </div>
                </div>
              )}

              {!resultUrl && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-gray-600 dark:text-slate-200 font-semibold text-sm bg-white/90 dark:bg-slate-900/90 px-4 py-2 rounded-xl border border-[var(--pms-border)] shadow-sm backdrop-blur-sm">
                    Adjust settings below and click &ldquo;Denoise Image&rdquo;
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="pms-glass-panel rounded-3xl p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-slate-400 mb-1.5">
                  Algorithm
                </label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 border border-[var(--pms-border)] bg-white/85 dark:bg-slate-900/70 text-gray-900 dark:text-white rounded-xl text-sm font-semibold"
                >
                  <option value="bilateral">Bilateral (edge-preserving) ★</option>
                  <option value="median">Median (salt &amp; pepper)</option>
                  <option value="gaussian">Gaussian (general smooth)</option>
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-slate-400">
                    Strength
                  </label>
                  <span className="text-xs font-extrabold text-[var(--pms-violet)]">
                    <AnimatedNumber value={strength} />
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={15}
                  value={strength}
                  onChange={(e) => setStrength(Number(e.target.value))}
                  className="w-full mt-1 accent-violet-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-gray-400 dark:text-slate-500 font-medium">
                  <span>Subtle</span>
                  <span>Strong</span>
                </div>
              </div>
              <div className="flex items-center md:justify-end">
                <label className="flex items-center gap-2.5 text-sm font-semibold text-gray-700 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={compareView}
                    onChange={(e) => setCompareView(e.target.checked)}
                    className="w-4 h-4 accent-violet-600 rounded"
                  />
                  Split compare
                </label>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 items-center">
              <motion.button
                whileHover={prefersReduced || busy ? undefined : { scale: 1.01 }}
                whileTap={prefersReduced || busy ? undefined : { scale: 0.985 }}
                onClick={processImage}
                disabled={busy}
                className="flex-1 min-w-[200px] pms-btn-primary py-3.5 rounded-2xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                {busy ? 'Processing…' : 'Denoise Image'}
              </motion.button>

              <AnimatePresence>
                {resultUrl && (
                  <motion.a
                    initial={prefersReduced ? false : { opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={prefersReduced ? undefined : { opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 360, damping: 20 }}
                    href={resultUrl}
                    download={`denoised_${file.name}`}
                    className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <Download className="w-4 h-4" />
                    Save
                  </motion.a>
                )}
              </AnimatePresence>

              <label className="px-5 py-3.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-2xl font-semibold text-sm cursor-pointer hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors flex items-center">
                New <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
              </label>
            </div>
          </div>
        </motion.div>
      )}
    </ToolWorkspaceShell>
  );
}
