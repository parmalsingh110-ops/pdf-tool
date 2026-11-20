import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Palette, Download, RotateCcw, ChevronDown, Loader2, Wand2 } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import BeforeAfterSlider from '../components/BeforeAfterSlider';
import { useSEO } from '../hooks/useSEO';
import { triggerBlobDownload, useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';
import {
  type PhotoAdjustments,
  DEFAULT_ADJUSTMENTS,
  isDefault,
  applyAdjustments,
  ADJUSTMENT_GROUPS,
  ADJUSTMENT_RANGES,
  PRESETS,
} from '../lib/photoAdjustments';

export default function ImageColorCorrection() {
  useSEO('Image Color Correction Online Free | PDF Media Suite', 'Free online Image Color Correction tool. No signup or installation required.');

  const [file, setFile] = useState<File | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [adjustments, setAdjustments] = useState<PhotoAdjustments>({ ...DEFAULT_ADJUSTMENTS });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [outFormat, setOutFormat] = useState<'image/jpeg' | 'image/png' | 'image/webp'>('image/jpeg');
  const [openGroup, setOpenGroup] = useState<string | null>('💡 Light');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const imgRef = useRef<HTMLImageElement>(null);

  // Real Gray-World Auto White Balance + Exposure estimation from current image
  const handleAutoBalance = useCallback(async () => {
    if (!imgUrl) return;
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imgUrl;
      await new Promise<void>((res) => { img.onload = () => res(); });
      const c = document.createElement('canvas');
      c.width = 160;
      c.height = Math.max(40, Math.round((img.naturalHeight / Math.max(1, img.naturalWidth)) * 160));
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let sR = 0, sG = 0, sB = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        sR += d[i]; sG += d[i + 1]; sB += d[i + 2]; n++;
      }
      if (n === 0) return;
      const mR = sR / n, mG = sG / n, mB = sB / n;
      const avgL = 0.299 * mR + 0.587 * mG + 0.114 * mB;
      // Compute real temperature (R vs B cast), tint (G cast), and exposure lift
      const tempFix = Math.max(-45, Math.min(45, Math.round(((mB - mR) / 255) * 95)));
      const tintFix = Math.max(-30, Math.min(30, Math.round((((mR + mB) * 0.5 - mG) / 255) * 75)));
      const expFix = Math.max(-25, Math.min(35, Math.round(((132 - avgL) / 132) * 32)));
      setAdjustments({
        ...DEFAULT_ADJUSTMENTS,
        exposure: expFix,
        contrast: 12,
        temperature: tempFix,
        tint: tintFix,
        clarity: 10,
        vibrance: 10,
      });
      c.width = 0;
      c.height = 0;
    } catch {
      /* silent */
    }
  }, [imgUrl]);

  const prefersReduced = useReducedMotion();

  useAutoRevokeUrl(imgUrl);
  useAutoRevokeUrl(previewUrl);

  const loadFile = (f: File) => {
    setFile(f);
    const url = URL.createObjectURL(f);
    setImgUrl(url);
    setPreviewUrl(null);
    setAdjustments({ ...DEFAULT_ADJUSTMENTS });
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    loadFile(f);
    e.target.value = '';
  };

  // Auto-preview with debounce
  const generatePreview = useCallback(async () => {
    if (!imgUrl) return;
    setProcessing(true);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imgUrl;
      await new Promise<void>((res) => {
        img.onload = () => res();
      });

      // Downscale for preview performance
      const maxDim = 800;
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const result = applyAdjustments(canvas, adjustments);
      const blob = await new Promise<Blob | null>((res) => result.toBlob((b) => res(b), 'image/jpeg', 0.9));
      if (blob) {
        setPreviewUrl(URL.createObjectURL(blob));
      }
    } catch {
      /* silent */
    } finally {
      setProcessing(false);
    }
  }, [imgUrl, adjustments]);

  useEffect(() => {
    if (!imgUrl) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(generatePreview, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [generatePreview, imgUrl]);

  const exportFull = async () => {
    if (!imgUrl) return;
    setProcessing(true);
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

      const result = applyAdjustments(canvas, adjustments);
      const q = outFormat === 'image/png' ? undefined : 0.95;
      const blob = await new Promise<Blob | null>((res) => result.toBlob((b) => res(b), outFormat, q));
      if (blob) {
        const ext = outFormat === 'image/png' ? 'png' : outFormat === 'image/webp' ? 'webp' : 'jpg';
        const stem = (file?.name || 'image').replace(/\.[^.]+$/, '');
        triggerBlobDownload(blob, `color_corrected_${stem}.${ext}`);
      }
    } catch (e: any) {
      alert(e?.message || 'Export failed.');
    } finally {
      setProcessing(false);
    }
  };

  const applyPreset = (presetName: string) => {
    setAdjustments({ ...DEFAULT_ADJUSTMENTS, ...PRESETS[presetName] });
  };

  const modifiedCount = (Object.keys(adjustments) as Array<keyof PhotoAdjustments>).filter(
    (k) => adjustments[k] !== DEFAULT_ADJUSTMENTS[k],
  ).length;

  return (
    <ToolWorkspaceShell
      title="Image Color Correction"
      subtitle="Professional color grading with curated film presets, tone balance, and manual adjustments."
      categoryLabel="Color Grading Studio"
      icon={Palette}
      microVariant="edit"
      tone="amber"
      trustNote="Live preview grading & full-resolution JPEG export · 100% browser-only"
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
            title="Select image to color correct"
            subtitle="Drop JPG, PNG, or WebP here"
          />
        </motion.div>
      ) : (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.26 }}
          className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start"
        >
          {/* Preview Column */}
          <div className="space-y-4">
            <div className="relative pms-glass-panel rounded-3xl p-4 sm:p-5 overflow-hidden">
              <PearlScanOverlay active={processing} label="Applying color grade…" />
              {previewUrl && imgUrl ? (
                <BeforeAfterSlider
                  beforeSrc={imgUrl}
                  afterSrc={previewUrl}
                  beforeLabel="Original"
                  afterLabel="Color Corrected"
                  maxHeightClass="max-h-[500px]"
                />
              ) : (
                <div
                  className="pms-checkerboard bg-white dark:bg-slate-950 rounded-2xl border border-[var(--pms-border)] overflow-hidden flex items-center justify-center p-3"
                  style={{ minHeight: 400 }}
                >
                  <img
                    src={imgUrl!}
                    alt="Preview"
                    ref={imgRef}
                    className="max-w-full max-h-[500px] object-contain rounded-lg shadow-sm"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2.5 justify-center items-center flex-wrap">
              <button
                type="button"
                onClick={() => void handleAutoBalance()}
                className="px-4 py-3 rounded-2xl border border-amber-400/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 font-bold text-xs flex items-center gap-1.5 hover:opacity-90 cursor-pointer"
              >
                <Wand2 className="w-4 h-4" /> Auto White Balance
              </button>
              <select
                value={outFormat}
                onChange={(e) => setOutFormat(e.target.value as any)}
                className="px-3 py-3 rounded-2xl border border-[var(--pms-border)] bg-white/85 dark:bg-slate-900 text-xs font-bold"
              >
                <option value="image/jpeg">JPG (95%)</option>
                <option value="image/png">PNG (Lossless)</option>
                <option value="image/webp">WebP</option>
              </select>
              <motion.button
                whileHover={prefersReduced || processing ? undefined : { scale: 1.01 }}
                whileTap={prefersReduced || processing ? undefined : { scale: 0.985 }}
                onClick={exportFull}
                disabled={processing}
                className="pms-btn-primary px-6 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span>Export Full Quality</span>
              </motion.button>
              <label className="px-5 py-3 bg-white/85 dark:bg-slate-800 border border-[var(--pms-border)] text-gray-700 dark:text-slate-200 rounded-2xl font-semibold text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                New Image
                <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
              </label>
            </div>
          </div>

          {/* Controls Panel */}
          <div className="pms-glass-panel rounded-3xl overflow-hidden flex flex-col max-h-[calc(100vh-190px)]">
            <div className="p-4 border-b border-[var(--pms-border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-gray-900 dark:text-white">Adjustments</span>
                {modifiedCount > 0 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--pms-soft-rose)] text-[var(--pms-rose)]">
                    <AnimatedNumber value={modifiedCount} suffix=" active" />
                  </span>
                )}
              </div>
              {!isDefault(adjustments) && (
                <button
                  onClick={() => setAdjustments({ ...DEFAULT_ADJUSTMENTS })}
                  className="text-xs text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Presets */}
              <div className="space-y-2">
                <p className="text-[11px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Presets</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.keys(PRESETS)
                    .filter((n) => n !== 'None')
                    .map((name) => (
                      <button
                        key={name}
                        onClick={() => applyPreset(name)}
                        className="px-2.5 py-2 text-xs font-semibold rounded-xl bg-white/75 dark:bg-slate-800/75 hover:bg-[var(--pms-soft-rose)] hover:text-[var(--pms-rose)] border border-[var(--pms-border)] text-gray-700 dark:text-slate-300 truncate transition-colors cursor-pointer"
                      >
                        {name}
                      </button>
                    ))}
                </div>
              </div>

              {/* Manual sliders */}
              {ADJUSTMENT_GROUPS.map((group) => {
                const isOpen = openGroup === group.label;
                return (
                  <div key={group.label} className="border border-[var(--pms-border)] rounded-2xl overflow-hidden bg-white/50 dark:bg-slate-900/40">
                    <button
                      onClick={() => setOpenGroup(isOpen ? null : group.label)}
                      className="w-full flex items-center justify-between px-3.5 py-2.5 bg-white/70 dark:bg-slate-800/70 text-sm font-bold text-gray-800 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <span>{group.label}</span>
                      <ChevronDown
                        className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={prefersReduced ? false : { opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={prefersReduced ? undefined : { opacity: 0, height: 0 }}
                          transition={{ duration: 0.18 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3.5 py-3 space-y-2.5">
                            {group.keys.map((key) => {
                              const range = ADJUSTMENT_RANGES[key];
                              const val = adjustments[key];
                              return (
                                <div key={key} className="flex items-center gap-2 text-xs">
                                  <span className="w-24 text-gray-600 dark:text-slate-300 capitalize font-medium">{key}</span>
                                  <input
                                    type="range"
                                    min={range.min}
                                    max={range.max}
                                    step={1}
                                    value={val}
                                    onChange={(e) =>
                                      setAdjustments((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                                    }
                                    className="flex-1 h-1.5 accent-rose-600 cursor-pointer"
                                  />
                                  <span
                                    className={`w-9 text-right font-mono font-semibold ${
                                      val === 0
                                        ? 'text-gray-400 dark:text-slate-500'
                                        : val > 0
                                          ? 'text-emerald-600 dark:text-emerald-400'
                                          : 'text-rose-500 dark:text-rose-400'
                                    }`}
                                  >
                                    {val > 0 ? `+${val}` : val}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </ToolWorkspaceShell>
  );
}
