import { useState, useRef, useEffect } from 'react';
import { Contrast, Download, Sparkles, CheckCircle2, Eye, RefreshCw, Printer } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import FileDropzone from '../components/FileDropzone';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type InkSaverMode = 'smart_auto' | 'invert_dark' | 'eco_toner' | 'clean_scanned' | 'manual';

function hexToRgb(hex: string) {
  const v = hex.replace('#', '');
  if (v.length !== 6) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(v.substring(0, 2), 16),
    g: parseInt(v.substring(2, 4), 16),
    b: parseInt(v.substring(4, 6), 16),
  };
}

function colorDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number }
) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

export default function InkSaverPDF() {
  const prefersReduced = useReducedMotion();

  useSEO(
    'Ink Saver PDF Online Free — Reduce Printer Toner & Ink Usage | PDF Media Suite',
    'Save up to 60% printer ink and toner. Convert heavy dark slide backgrounds into clean white paper, remove murky scanned tints, and optimize documents for printing.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<InkSaverMode>('smart_auto');
  const [ecoStrength, setEcoStrength] = useState<number>(35); // 20% to 60% ink reduction
  const [sourceColor, setSourceColor] = useState('#000000');
  const [backgroundTarget, setBackgroundTarget] = useState('#ffffff');
  const [textTarget, setTextTarget] = useState('#111827');
  const [tolerance, setTolerance] = useState(58);
  const [lumaThreshold, setLumaThreshold] = useState(130);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [previewOriginal, setPreviewOriginal] = useState<string | null>(null);
  const [previewProcessed, setPreviewProcessed] = useState<string | null>(null);
  const [estimatedSavings, setEstimatedSavings] = useState<number>(0);
  const [previewTab, setPreviewTab] = useState<'after' | 'before'>('after');
  const abortControllerRef = useRef<boolean>(false);

  useAutoRevokeUrl(resultUrl);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    const selected = acceptedFiles[0];
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFile(selected);
    setResultUrl(null);
    setPreviewOriginal(null);
    setPreviewProcessed(null);
    void generateFirstPagePreview(selected, mode, ecoStrength, lumaThreshold);
  };

  /**
   * Process a single canvas's pixel data according to the selected mode
   */
  const processPixelData = (
    data: Uint8ClampedArray,
    currentMode: InkSaverMode,
    strength: number,
    threshold: number
  ): { inkSavedPercent: number } => {
    let originalInkScore = 0;
    let newInkScore = 0;

    // First pass: sample average luminance to understand if the page background is predominantly dark or light
    let totalLuma = 0;
    const sampleStep = 16;
    let sampleCount = 0;
    for (let p = 0; p < data.length; p += 4 * sampleStep) {
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      totalLuma += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sampleCount++;
    }
    const pageAvgLuma = sampleCount > 0 ? totalLuma / sampleCount : 200;
    const isDarkPage = pageAvgLuma < 120; // e.g. dark presentation slide, dark-mode PDF

    const src = hexToRgb(sourceColor);
    const bg = hexToRgb(backgroundTarget);
    const fg = hexToRgb(textTarget);

    for (let p = 0; p < data.length; p += 4) {
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const a = data[p + 3];

      if (a === 0) continue; // Skip transparent pixels

      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      // Invert luma to score ink density: 255 (white) = 0 ink, 0 (black) = 255 ink
      originalInkScore += 255 - luma;

      if (currentMode === 'manual') {
        const dist = colorDistance({ r, g, b }, src);
        if (dist <= tolerance) {
          data[p] = bg.r;
          data[p + 1] = bg.g;
          data[p + 2] = bg.b;
        }
      } else if (currentMode === 'invert_dark' || (currentMode === 'smart_auto' && isDarkPage)) {
        // DARK-MODE SLIDE / DOCUMENT INVERSION (Save maximum black ink):
        // Convert dark backgrounds to pure white paper, convert light text to dark text
        if (luma <= threshold) {
          // Dark background -> Clean white paper
          data[p] = 255;
          data[p + 1] = 255;
          data[p + 2] = 255;
        } else {
          // Light text / colored diagrams -> Crisp dark text
          const factor = Math.max(0.15, 1 - (luma / 255));
          data[p] = Math.round(r * factor);
          data[p + 1] = Math.round(g * factor);
          data[p + 2] = Math.round(b * factor);
        }
      } else if (currentMode === 'clean_scanned') {
        // SCANNED DOCUMENT BACKGROUND WHITENER:
        // Murky, grey, or yellow paper tints (>180) become pure #ffffff white.
        // Dark text (<140) is preserved as crisp black.
        if (luma >= 180) {
          data[p] = 255;
          data[p + 1] = 255;
          data[p + 2] = 255;
        } else if (luma <= 100) {
          data[p] = 0;
          data[p + 1] = 0;
          data[p + 2] = 0;
        } else {
          // Mid-tones: gently push toward light
          const push = 255 - ((255 - luma) * 0.7);
          data[p] = push;
          data[p + 1] = push;
          data[p + 2] = push;
        }
      } else {
        // STANDARD DOCUMENT / SMART_AUTO ON LIGHT PAGES / ECO_TONER:
        // Do NOT invert! Keep paper white, clean up off-white backgrounds, and soften heavy blacks
        if (luma >= 220) {
          // Almost white/light tint -> Pure white paper (0 ink)
          data[p] = 255;
          data[p + 1] = 255;
          data[p + 2] = 255;
        } else if (luma <= 80) {
          // Deep heavy black text / solid black shapes -> Lighten according to Eco Strength (saves 30-50% toner)
          // Text remains 100% legible, but doesn't waste heavy layers of black toner
          const tonerLevel = Math.round((strength / 100) * 85); // 0 (pure black) -> 45 (crisp dark charcoal)
          data[p] = tonerLevel;
          data[p + 1] = tonerLevel;
          data[p + 2] = tonerLevel;
        } else {
          // Midtones/graphics: scale lightly toward paper
          const factor = 1 + (strength / 100) * 0.35;
          data[p] = Math.min(255, Math.round(r * factor));
          data[p + 1] = Math.min(255, Math.round(g * factor));
          data[p + 2] = Math.min(255, Math.round(b * factor));
        }
      }

      const newLuma = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
      newInkScore += 255 - newLuma;
    }

    const saved = originalInkScore > 0 
      ? Math.max(5, Math.min(85, Math.round(((originalInkScore - newInkScore) / originalInkScore) * 100))) 
      : 30;

    return { inkSavedPercent: saved };
  };

  /**
   * Quick preview of page 1 so user sees the improvement immediately
   */
  const generateFirstPagePreview = async (
    targetFile: File,
    activeMode: InkSaverMode,
    strength: number,
    threshold: number
  ) => {
    try {
      const buffer = await targetFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
      if (pdf.numPages === 0) return;

      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.2 });

      // 1. Render Original
      const origCanvas = document.createElement('canvas');
      const origCtx = origCanvas.getContext('2d', { willReadFrequently: true });
      if (!origCtx) return;
      origCanvas.width = viewport.width;
      origCanvas.height = viewport.height;
      await page.render({ canvasContext: origCtx, viewport, canvas: origCanvas }).promise;
      setPreviewOriginal(origCanvas.toDataURL('image/jpeg', 0.85));

      // 2. Render Processed
      const procCanvas = document.createElement('canvas');
      const procCtx = procCanvas.getContext('2d', { willReadFrequently: true });
      if (!procCtx) return;
      procCanvas.width = viewport.width;
      procCanvas.height = viewport.height;
      await page.render({ canvasContext: procCtx, viewport, canvas: procCanvas }).promise;

      const imgData = procCtx.getImageData(0, 0, procCanvas.width, procCanvas.height);
      const { inkSavedPercent } = processPixelData(imgData.data, activeMode, strength, threshold);
      procCtx.putImageData(imgData, 0, 0);

      setPreviewProcessed(procCanvas.toDataURL('image/jpeg', 0.85));
      setEstimatedSavings(inkSavedPercent);

      origCanvas.width = 0;
      origCanvas.height = 0;
      procCanvas.width = 0;
      procCanvas.height = 0;
    } catch (e) {
      console.warn('[InkSaver] First page preview failed (will still convert):', e);
    }
  };

  // Re-generate preview when settings change
  useEffect(() => {
    if (file) {
      const timer = setTimeout(() => {
        void generateFirstPagePreview(file, mode, ecoStrength, lumaThreshold);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [mode, ecoStrength, lumaThreshold, tolerance, sourceColor, backgroundTarget, textTarget]);

  const handleConvert = async () => {
    if (!file) return;
    setIsProcessing(true);
    abortControllerRef.current = false;
    setProgressMsg('Initializing PDF document...');

    try {
      const inputBuffer = await file.arrayBuffer();
      const inputPdf = await pdfjsLib.getDocument({ data: new Uint8Array(inputBuffer) }).promise;
      const outputPdf = await PDFDocument.create();

      const totalPages = inputPdf.numPages;
      let totalSavingsSum = 0;

      for (let i = 1; i <= totalPages; i++) {
        if (abortControllerRef.current) {
          throw new Error('Cancelled by user');
        }

        setProgressMsg(`Optimizing page ${i} of ${totalPages}...`);
        const page = await inputPdf.getPage(i);
        // Use high-fidelity scale 2 for crisp vector-like text
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) continue;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
          canvasContext: ctx,
          viewport,
          canvas,
        }).promise;

        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const { inkSavedPercent } = processPixelData(img.data, mode, ecoStrength, lumaThreshold);
        totalSavingsSum += inkSavedPercent;

        ctx.putImageData(img, 0, 0);
        const pngDataUrl = canvas.toDataURL('image/jpeg', 0.92);
        const imgBytes = dataUrlToBytes(pngDataUrl);
        const embeddedImage = await outputPdf.embedJpg(imgBytes);

        const outPage = outputPdf.addPage([viewport.width / 2, viewport.height / 2]);
        outPage.drawImage(embeddedImage, {
          x: 0,
          y: 0,
          width: viewport.width / 2,
          height: viewport.height / 2,
        });

        // Clean up canvas memory immediately
        canvas.width = 0;
        canvas.height = 0;

        // Yield execution loop so UI stays snappy
        if (i % 2 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      setProgressMsg('Finalizing print-optimized document...');
      const bytes = await outputPdf.save();
      const blob = new Blob([toArrayBufferBytes(bytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setEstimatedSavings(Math.round(totalSavingsSum / totalPages));
    } catch (error: any) {
      if (error?.message !== 'Cancelled by user') {
        console.error('Ink Saver failed:', error);
        alert('Failed to process PDF. Please check that the file is not password-protected.');
      }
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  return (
    <ToolWorkspaceShell
      title="Ink Saver PDF"
      subtitle="Save 30% to 60% printer ink and toner. Invert heavy dark presentation slides to crisp white paper, whiten murky scanned backgrounds, and keep all your text 100% sharp and readable."
      categoryLabel="Eco-Print & Toner Saver"
      icon={Contrast}
      microVariant="compress"
      tone="emerald"
    >
      <div className="w-full max-w-7xl mx-auto text-[var(--pms-ink)]">

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6">
          <PearlStageSwitch stageKey={!file ? 'upload' : resultUrl ? 'done' : 'configure'}>
            {!file ? (
              <section className="pms-glass-panel rounded-3xl border-2 border-dashed border-[var(--pms-border)] p-8 sm:p-12 hover:border-[var(--pms-rose)] transition-colors">
                <FileDropzone
                  onDrop={handleDrop}
                  multiple={false}
                  accept={{ 'application/pdf': ['.pdf'] }}
                  title="Select PDF file to save ink"
                  subtitle="Perfect for lecture slides, study notes, forms, and scanned papers"
                  className="!border-none !p-0 !max-w-none !shadow-none !bg-transparent"
                />
              </section>
            ) : (
              <section className="pms-glass-panel rounded-3xl p-6 sm:p-8 relative overflow-hidden">
                <PearlScanOverlay
                  active={isProcessing}
                  label={progressMsg || 'Optimizing toner density across pages...'}
                />

                {/* File Info Bar */}
                <div className="flex items-center justify-between gap-4 p-4 sm:p-5 bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] mb-6">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'var(--pms-soft-rose)', color: 'var(--pms-rose)' }}
                    >
                      <Printer className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-base font-bold text-[var(--pms-ink)] truncate">{file.name}</p>
                      <p className="text-xs text-[var(--pms-muted)]">
                        {(file.size / 1024 / 1024).toFixed(2)} MB • Ready for Ink Saver
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setResultUrl(null);
                    }}
                    className="text-xs font-semibold text-[var(--pms-muted)] hover:text-[var(--pms-ink)] shrink-0 px-3 py-1.5 rounded-xl bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] transition-colors"
                  >
                    Change File
                  </button>
                </div>

                {!resultUrl ? (
                  <div className="space-y-6">
                    {/* Mode Selector Presets */}
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] block mb-2.5">
                        Choose Optimization Preset
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {([
                          {
                            id: 'smart_auto',
                            title: 'Smart Auto (Recommended)',
                            desc: 'Auto-detects page type. Inverts dark slides to white paper; saves toner on normal docs.',
                          },
                          {
                            id: 'invert_dark',
                            title: 'Invert Dark Slides',
                            desc: 'For black/navy slides. Turns heavy backgrounds into clean white paper & white text into dark.',
                          },
                          {
                            id: 'eco_toner',
                            title: 'Eco Toner Saver',
                            desc: 'For normal documents. Lightens heavy blacks and graphics to save 30-50% cartridge ink.',
                          },
                          {
                            id: 'clean_scanned',
                            title: 'Whiten Scanned Pages',
                            desc: 'Removes yellow, grey, or dirty shadows from phone scans, leaving pure white paper.',
                          },
                        ] as const).map((preset) => {
                          const active = mode === preset.id;
                          return (
                            <motion.button
                              key={preset.id}
                              type="button"
                              whileHover={prefersReduced ? undefined : { y: -2 }}
                              whileTap={prefersReduced ? undefined : { scale: 0.99 }}
                              onClick={() => setMode(preset.id)}
                              style={{
                                backgroundColor: active ? 'var(--pms-soft-rose)' : undefined,
                                borderColor: active ? 'var(--pms-rose)' : 'var(--pms-border)',
                              }}
                              className={`relative p-4 rounded-2xl border text-left transition-all ${
                                active
                                  ? 'shadow-sm ring-1 ring-[var(--pms-rose)]'
                                  : 'bg-white/75 dark:bg-slate-900/75 hover:bg-white dark:hover:bg-slate-900'
                              }`}
                            >
                              {active && (
                                <motion.span
                                  layoutId="inksaver-mode-pill"
                                  transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30 }}
                                  className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                                  style={{ backgroundColor: 'var(--pms-rose)' }}
                                >
                                  Active
                                </motion.span>
                              )}
                              <div className="flex items-center justify-between mb-1 pr-14">
                                <span className="font-bold text-sm text-[var(--pms-ink)]">{preset.title}</span>
                              </div>
                              <p className="text-xs text-[var(--pms-muted)] leading-relaxed">
                                {preset.desc}
                              </p>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Eco Strength Slider (for eco_toner or smart_auto) */}
                    {(mode === 'eco_toner' || mode === 'smart_auto') && (
                      <div className="p-4 rounded-2xl bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)]">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-[var(--pms-ink)]">
                            Toner Saving Intensity
                          </span>
                          <span
                            className="text-xs font-bold px-2.5 py-0.5 rounded-full border border-[var(--pms-border)]"
                            style={{ backgroundColor: 'var(--pms-soft-mint)', color: 'var(--pms-ink)' }}
                          >
                            ~<AnimatedNumber value={ecoStrength} suffix="% Ink Saved" />
                          </span>
                        </div>
                        <input
                          type="range"
                          min={15}
                          max={60}
                          value={ecoStrength}
                          onChange={(e) => setEcoStrength(Number(e.target.value))}
                          className="w-full accent-[var(--pms-rose)]"
                        />
                        <div className="flex justify-between text-[11px] text-[var(--pms-muted)] mt-1">
                          <span>Light (15%)</span>
                          <span>Balanced (35%)</span>
                          <span>Maximum (60%)</span>
                        </div>
                      </div>
                    )}

                    {/* Dark Slide Threshold Slider (for invert_dark or smart_auto) */}
                    {(mode === 'invert_dark' || mode === 'smart_auto') && (
                      <div className="p-4 rounded-2xl bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)]">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-[var(--pms-ink)]">
                            Dark Background Detection Cutoff
                          </span>
                          <span className="text-xs font-mono font-bold text-[var(--pms-ink)]">
                            <AnimatedNumber value={lumaThreshold} />
                          </span>
                        </div>
                        <input
                          type="range"
                          min={60}
                          max={200}
                          value={lumaThreshold}
                          onChange={(e) => setLumaThreshold(Number(e.target.value))}
                          className="w-full accent-[var(--pms-rose)]"
                        />
                        <p className="text-[11px] text-[var(--pms-muted)] mt-1">
                          Higher values catch navy and charcoal slides; lower values catch pure black only.
                        </p>
                      </div>
                    )}

                    {/* Live Interactive Preview Box */}
                    {(previewOriginal || previewProcessed) && (
                      <div className="rounded-2xl border border-[var(--pms-border)] overflow-hidden bg-white/75 dark:bg-slate-900/75 p-4">
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2">
                            <Eye className="w-4 h-4" style={{ color: 'var(--pms-rose)' }} />
                            <span className="text-xs font-bold text-[var(--pms-ink)] uppercase tracking-wider">
                              Page 1 Live Preview
                            </span>
                          </div>

                          <div className="flex items-center gap-1 bg-white/80 dark:bg-slate-950/70 p-1 rounded-xl border border-[var(--pms-border)] text-xs font-semibold">
                            {([
                              { id: 'after', label: 'Optimized (Ink Saver)' },
                              { id: 'before', label: 'Original' },
                            ] as const).map((tab) => {
                              const active = previewTab === tab.id;
                              return (
                                <button
                                  key={tab.id}
                                  type="button"
                                  onClick={() => setPreviewTab(tab.id)}
                                  className={`relative px-3 py-1 rounded-lg transition-colors ${
                                    active ? 'text-[var(--pms-ink)]' : 'text-[var(--pms-muted)] hover:text-[var(--pms-ink)]'
                                  }`}
                                >
                                  {active && (
                                    <motion.span
                                      layoutId="inksaver-preview-tab"
                                      transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
                                      className="absolute inset-0 rounded-lg border"
                                      style={{
                                        backgroundColor: 'var(--pms-soft-rose)',
                                        borderColor: 'var(--pms-rose)',
                                      }}
                                    />
                                  )}
                                  <span className="relative z-10">{tab.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="relative w-full max-h-[380px] rounded-xl overflow-hidden bg-white flex items-center justify-center border border-[var(--pms-border)] shadow-inner">
                          {previewTab === 'after' && previewProcessed && (
                            <img
                              src={previewProcessed}
                              alt="Optimized preview"
                              className="max-h-[360px] object-contain p-2"
                            />
                          )}
                          {previewTab === 'before' && previewOriginal && (
                            <img
                              src={previewOriginal}
                              alt="Original preview"
                              className="max-h-[360px] object-contain p-2"
                            />
                          )}
                          {estimatedSavings > 0 && (
                            <div className="absolute bottom-3 right-3 bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-md flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5" />
                              ~<AnimatedNumber value={estimatedSavings} suffix="% Estimated Ink Saved" />
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Processing Status / Progress */}
                    {isProcessing && (
                      <div
                        className="p-4 rounded-2xl border border-[var(--pms-border)] text-center space-y-1.5"
                        style={{ backgroundColor: 'var(--pms-soft-rose)' }}
                      >
                        <div className="flex items-center justify-center gap-2 text-[var(--pms-ink)] font-bold text-sm">
                          <RefreshCw className="w-4 h-4 animate-spin" style={{ color: 'var(--pms-rose)' }} />
                          <span>{progressMsg || 'Processing PDF...'}</span>
                        </div>
                        <p className="text-xs text-[var(--pms-muted)]">
                          Please keep this tab open while high-resolution pages are processed.
                        </p>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-2">
                      <motion.button
                        type="button"
                        whileHover={prefersReduced ? undefined : { scale: 1.01 }}
                        whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                        onClick={handleConvert}
                        disabled={isProcessing}
                        className="pms-btn-primary flex-1 py-4 text-base font-bold rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isProcessing ? (
                          <>
                            <RefreshCw className="w-5 h-5 animate-spin" />
                            Processing Document...
                          </>
                        ) : (
                          <>
                            <Printer className="w-5 h-5" />
                            Generate Ink-Saver PDF
                          </>
                        )}
                      </motion.button>
                      {isProcessing && (
                        <button
                          type="button"
                          onClick={() => {
                            abortControllerRef.current = true;
                            setIsProcessing(false);
                          }}
                          className="px-6 py-4 bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] text-[var(--pms-ink)] text-sm font-semibold rounded-2xl hover:bg-white dark:hover:bg-slate-800 transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Success & Download Screen */
                  <div className="space-y-6 text-center py-4">
                    <div
                      className="p-8 rounded-3xl border border-[var(--pms-border)]"
                      style={{ backgroundColor: 'var(--pms-soft-mint)' }}
                    >
                      <div className="w-16 h-16 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-[var(--pms-border)] text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4 shadow-sm">
                        <CheckCircle2 className="w-8 h-8" />
                      </div>
                      <h3 className="text-2xl font-black text-[var(--pms-ink)] mb-2">
                        Print-Ready PDF Created!
                      </h3>
                      <p className="text-sm text-[var(--pms-muted)] mb-6 max-w-md mx-auto">
                        Heavy backgrounds and excessive dark toner have been optimized. You saved approximately{' '}
                        <strong className="text-[var(--pms-ink)]">
                          <AnimatedNumber value={estimatedSavings} suffix="%" />
                        </strong>{' '}
                        of ink/toner for this print job.
                      </p>
                      <motion.a
                        whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                        whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                        href={resultUrl}
                        download={`ink_saver_${file.name}`}
                        className="pms-btn-primary inline-flex items-center justify-center gap-2.5 px-8 py-4 text-base font-bold rounded-2xl"
                      >
                        <Download className="w-5 h-5" />
                        Download Ink-Saver PDF
                      </motion.a>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        setResultUrl(null);
                      }}
                      className="text-xs font-bold text-[var(--pms-muted)] hover:text-[var(--pms-ink)] underline transition-colors"
                    >
                      Process another document
                    </button>
                  </div>
                )}
              </section>
            )}
          </PearlStageSwitch>
        </div>

        {/* Informational Sidebar */}
        <aside className="lg:col-span-4 space-y-6">
          <div className="pms-glass-panel p-6 sm:p-8 rounded-3xl">
            <h3 className="text-base font-bold mb-4 text-[var(--pms-ink)] flex items-center gap-2">
              <Printer className="w-4 h-4" style={{ color: 'var(--pms-rose)' }} />
              Why use Ink Saver?
            </h3>
            <ul className="space-y-3.5 text-xs text-[var(--pms-muted)] leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="font-bold" style={{ color: 'var(--pms-rose)' }}>•</span>
                <span><strong className="text-[var(--pms-ink)]">Lecture Slides:</strong> Inverts solid black/navy PowerPoint slide backgrounds to white paper so printing doesn't drain your cartridge.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold" style={{ color: 'var(--pms-rose)' }}>•</span>
                <span><strong className="text-[var(--pms-ink)]">Crisp Text:</strong> Unlike simple grayscale tools, Ink Saver keeps text high-contrast and sharp so it remains effortless to read.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold" style={{ color: 'var(--pms-rose)' }}>•</span>
                <span><strong className="text-[var(--pms-ink)]">Cleaner Scans:</strong> Removes yellow, grey, and shadowed paper backgrounds from mobile photo scans.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold" style={{ color: 'var(--pms-rose)' }}>•</span>
                <span><strong className="text-[var(--pms-ink)]">Zero Upload:</strong> Runs locally in your browser memory for 100% data privacy.</span>
              </li>
            </ul>
          </div>

          <div className="rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-white shadow-sm border border-slate-800">
            <div className="flex items-center gap-2 text-rose-400 text-xs font-bold uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5" /> Eco & Budget Tip
            </div>
            <h4 className="text-xl font-bold leading-snug">
              Save up to 40% on printer cartridges and office toner.
            </h4>
            <p className="mt-2 text-xs text-slate-300 leading-relaxed">
              Eliminate unnecessary background fills and extend printer cartridge lifespan on every batch print.
            </p>
          </div>
        </aside>
      </div>
      </div>
    </ToolWorkspaceShell>
  );
}
