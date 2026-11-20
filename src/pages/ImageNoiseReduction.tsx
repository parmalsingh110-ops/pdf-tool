import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Sparkles, Download, Loader2, CheckCircle2, Sliders } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import BeforeAfterSlider from '../components/BeforeAfterSlider';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import { useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';
import { type DenoiseMode, denoiseImageDataAsync } from '../lib/documentCleanerEngine';

const DENOISE_PRESETS: Array<{
  id: string;
  label: string;
  desc: string;
  mode: DenoiseMode;
  strength: number;
  detail: number;
}> = [
  { id: 'low_light', label: 'Phone Low-Light ISO', desc: 'Smooths night grain, keeps faces sharp', mode: 'bilateral', strength: 7, detail: 35 },
  { id: 'doc_scan', label: 'Scanned Doc Grain', desc: 'Cleans paper speckles & keeps text crisp', mode: 'bilateral', strength: 5, detail: 60 },
  { id: 'salt_pepper', label: 'Salt & Pepper Dust', desc: 'Erases black/white impulse dots', mode: 'median', strength: 4, detail: 30 },
  { id: 'soft_jpeg', label: 'JPEG Block Cleanup', desc: 'Softens WhatsApp/compressed artifacts', mode: 'bilateral', strength: 9, detail: 25 },
];

export default function ImageNoiseReduction() {
  useSEO(
    'Image Noise Reduction Pro — Fast Edge-Preserving Denoise Online | PDF Media Suite',
    'Remove camera ISO grain, scanned paper noise, and JPEG artifacts using LUT-accelerated edge-preserving bilateral & histogram median filters with detail recovery.'
  );

  usePageSEO(
    'Image Noise Reduction Pro — Edge-Preserving Photo & Scan Denoiser',
    'Fast non-blocking bilateral and median denoising with crisp detail recovery, one-click photo/scan presets, and interactive before/after split comparison.',
    'image noise reduction online, denoise photo browser, bilateral filter online, remove grain from scanned photo, fix grainy low light photo',
    '/image-noise-reduction'
  );

  const [file, setFile] = useState<File | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progressPct, setProgressPct] = useState(0);

  const [mode, setMode] = useState<DenoiseMode>('bilateral');
  const [strength, setStrength] = useState(6);
  const [detailRecovery, setDetailRecovery] = useState(35);
  const [outFormat, setOutFormat] = useState<'image/jpeg' | 'image/png' | 'image/webp'>('image/jpeg');
  const [activePreset, setActivePreset] = useState<string>('low_light');

  const prefersReduced = useReducedMotion();

  useAutoRevokeUrl(imgUrl);
  useAutoRevokeUrl(resultUrl);

  const loadFile = (f: File) => {
    setFile(f);
    setImgUrl(URL.createObjectURL(f));
    setResultUrl(null);
    setProgressPct(0);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    loadFile(f);
    e.target.value = '';
  };

  const applyPreset = (presetId: string) => {
    const p = DENOISE_PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    setActivePreset(p.id);
    setMode(p.mode);
    setStrength(p.strength);
    setDetailRecovery(p.detail);
  };

  const processImage = useCallback(async () => {
    if (!imgUrl) return;
    setBusy(true);
    setProgressPct(5);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imgUrl;
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('Image load failed'));
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const outData = await denoiseImageDataAsync(
        imageData,
        mode,
        strength,
        detailRecovery,
        (pct) => setProgressPct(pct)
      );
      ctx.putImageData(outData, 0, 0);

      const quality = outFormat === 'image/png' ? undefined : 0.94;
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), outFormat, quality));
      if (blob) {
        setResultUrl(URL.createObjectURL(blob));
      }
      canvas.width = 0;
      canvas.height = 0;
    } catch (e: any) {
      alert(e?.message || 'Processing failed.');
    } finally {
      setBusy(false);
    }
  }, [imgUrl, strength, mode, detailRecovery, outFormat]);

  const ext = outFormat === 'image/png' ? 'png' : outFormat === 'image/webp' ? 'webp' : 'jpg';

  return (
    <ToolWorkspaceShell
      title="Image Noise Reduction Pro"
      subtitle="Fast LUT-accelerated edge-preserving Bilateral & Histogram Median denoising with Detail Sharpen Recovery — cleans grainy low-light photos and noisy scans smoothly without freezing your browser."
      categoryLabel="Pixel Denoise Lab"
      icon={Sparkles}
      microVariant="remove-bg"
      tone="violet"
      trustNote="Separable LUT Bilateral + Histogram Median · Non-blocking · 100% browser-only"
    >
      {!file ? (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl mx-auto"
        >
          <FileDropzone
            onDrop={(files) => {
              if (files[0]) loadFile(files[0]);
            }}
            multiple={false}
            accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] }}
            title="Select a noisy photo or grainy scan"
            subtitle="Drop JPG, PNG, or WebP image here (even 12MP camera photos supported)"
          />
        </motion.div>
      ) : (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-5xl mx-auto space-y-6"
        >
          {/* Interactive Compare Viewport */}
          <div className="relative pms-glass-panel rounded-3xl p-4 sm:p-5 overflow-hidden">
            <PearlScanOverlay
              active={busy}
              label={`Running fast ${mode} denoise (${progressPct}%)…`}
            />

            {resultUrl ? (
              <BeforeAfterSlider
                beforeSrc={imgUrl!}
                afterSrc={resultUrl}
                beforeLabel="Original Grainy"
                afterLabel="Denoised Clean"
                maxHeightClass="max-h-[480px]"
                badgeText={`${mode.toUpperCase()} · Strength ${strength} · Detail +${detailRecovery}%`}
              />
            ) : (
              <div className="relative pms-checkerboard bg-white dark:bg-slate-950 rounded-2xl border border-[var(--pms-border)] overflow-hidden flex items-center justify-center min-h-[340px] p-3">
                <img src={imgUrl!} alt="Original" className="max-h-[450px] w-auto object-contain rounded-lg" />
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
                  <span className="text-slate-700 dark:text-slate-200 font-semibold text-xs bg-white/90 dark:bg-slate-900/90 px-4 py-2 rounded-full border border-[var(--pms-border)] shadow-sm backdrop-blur-xs">
                    Pick a preset below &amp; click &ldquo;Denoise Image&rdquo;
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="pms-glass-panel rounded-3xl p-5 sm:p-6 space-y-5">
            {/* One-Click Presets */}
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-2">
                <Sliders className="w-3.5 h-3.5 text-violet-600" /> Smart Denoise Presets
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {DENOISE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id)}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                      activePreset === p.id
                        ? 'border-violet-500 bg-[var(--pms-soft-lavender)] shadow-xs'
                        : 'border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75'
                    }`}
                  >
                    <div className="font-bold text-slate-900 dark:text-white">{p.label}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Algorithm
                </label>
                <select
                  value={mode}
                  onChange={(e) => {
                    setActivePreset('custom');
                    setMode(e.target.value as DenoiseMode);
                  }}
                  className="w-full px-3 py-2 border border-[var(--pms-border)] bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl text-xs font-semibold"
                >
                  <option value="bilateral">Separable Bilateral (Edge-Safe) ★</option>
                  <option value="median">Histogram Median (Dust/Dots)</option>
                  <option value="gaussian">Separable Gaussian (Smooth)</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Denoise Strength
                  </label>
                  <span className="text-xs font-extrabold font-mono text-[var(--pms-violet)]">
                    <AnimatedNumber value={strength} />
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={14}
                  value={strength}
                  onChange={(e) => {
                    setActivePreset('custom');
                    setStrength(Number(e.target.value));
                  }}
                  className="w-full accent-violet-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Edge Detail Recovery
                  </label>
                  <span className="text-xs font-extrabold font-mono text-[var(--pms-violet)]">
                    {detailRecovery}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={detailRecovery}
                  onChange={(e) => setDetailRecovery(Number(e.target.value))}
                  className="w-full accent-violet-600 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Export Format
                </label>
                <select
                  value={outFormat}
                  onChange={(e) => setOutFormat(e.target.value as any)}
                  className="w-full px-3 py-2 border border-[var(--pms-border)] bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl text-xs font-semibold"
                >
                  <option value="image/jpeg">JPEG (94% Crisp)</option>
                  <option value="image/png">PNG (Lossless)</option>
                  <option value="image/webp">WebP (Compact)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 items-center pt-1">
              <button
                type="button"
                onClick={processImage}
                disabled={busy}
                className="flex-1 min-w-[200px] pms-btn-primary py-3.5 rounded-2xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                {busy ? `Denoising (${progressPct}%)…` : 'Denoise Image'}
              </button>

              <AnimatePresence>
                {resultUrl && (
                  <motion.a
                    initial={prefersReduced ? false : { opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={prefersReduced ? undefined : { opacity: 0 }}
                    href={resultUrl}
                    download={`denoised_${file.name.replace(/\.[^.]+$/, '')}.${ext}`}
                    className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold flex items-center gap-2 shadow-lg transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <Download className="w-4 h-4" /> Save {ext.toUpperCase()}
                  </motion.a>
                )}
              </AnimatePresence>

              <label className="px-5 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl font-semibold text-sm cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center">
                New <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
              </label>
            </div>
          </div>
        </motion.div>
      )}
    </ToolWorkspaceShell>
  );
}
