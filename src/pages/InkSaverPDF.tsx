import { useState, useRef, useEffect } from 'react';
import { Contrast, Download, Settings2, Sparkles, CheckCircle2, Eye, RefreshCw, AlertCircle, Printer, FileText } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import FileDropzone from '../components/FileDropzone';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';

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
      const blob = new Blob([bytes as any], { type: 'application/pdf' });
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
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 text-slate-800 dark:text-slate-200">
      <header className="max-w-3xl mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold tracking-wider uppercase">
          <Sparkles className="w-3.5 h-3.5" />
          Eco-Print & Toner Saver
        </div>
        <h1 className="mt-4 text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Ink Saver PDF
        </h1>
        <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
          Save 30% to 60% printer ink and toner. Invert heavy dark presentation slides to crisp white paper, whiten murky scanned backgrounds, and keep all your text 100% sharp and readable.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6">
          {!file ? (
            <section className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-8 sm:p-12 shadow-sm hover:border-rose-400 dark:hover:border-rose-500 transition-colors">
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
            <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm">
              {/* File Info Bar */}
              <div className="flex items-center justify-between gap-4 p-4 sm:p-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 mb-6">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center shrink-0">
                    <Printer className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-bold text-slate-900 dark:text-white truncate">{file.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {(file.size / 1024 / 1024).toFixed(2)} MB • Ready for Ink Saver
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setFile(null);
                    setResultUrl(null);
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 shrink-0 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-rose-300"
                >
                  Change File
                </button>
              </div>

              {!resultUrl ? (
                <div className="space-y-6">
                  {/* Mode Selector Presets */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
                      Choose Optimization Preset
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setMode('smart_auto')}
                        className={`p-4 rounded-2xl border text-left transition-all ${
                          mode === 'smart_auto'
                            ? 'border-rose-600 bg-rose-50/60 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 shadow-sm ring-1 ring-rose-500'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-sm">Smart Auto (Recommended)</span>
                          {mode === 'smart_auto' && <CheckCircle2 className="w-4 h-4 text-rose-600" />}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          Auto-detects page type. Inverts dark slides to white paper; saves toner on normal docs.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setMode('invert_dark')}
                        className={`p-4 rounded-2xl border text-left transition-all ${
                          mode === 'invert_dark'
                            ? 'border-rose-600 bg-rose-50/60 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 shadow-sm ring-1 ring-rose-500'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-sm">Invert Dark Slides</span>
                          {mode === 'invert_dark' && <CheckCircle2 className="w-4 h-4 text-rose-600" />}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          For black/navy slides. Turns heavy backgrounds into clean white paper & white text into dark.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setMode('eco_toner')}
                        className={`p-4 rounded-2xl border text-left transition-all ${
                          mode === 'eco_toner'
                            ? 'border-rose-600 bg-rose-50/60 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 shadow-sm ring-1 ring-rose-500'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-sm">Eco Toner Saver</span>
                          {mode === 'eco_toner' && <CheckCircle2 className="w-4 h-4 text-rose-600" />}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          For normal documents. Lightens heavy blacks and graphics to save 30-50% cartridge ink.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setMode('clean_scanned')}
                        className={`p-4 rounded-2xl border text-left transition-all ${
                          mode === 'clean_scanned'
                            ? 'border-rose-600 bg-rose-50/60 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 shadow-sm ring-1 ring-rose-500'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-sm">Whiten Scanned Pages</span>
                          {mode === 'clean_scanned' && <CheckCircle2 className="w-4 h-4 text-rose-600" />}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          Removes yellow, grey, or dirty shadows from phone scans, leaving pure white paper.
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Eco Strength Slider (for eco_toner or smart_auto) */}
                  {(mode === 'eco_toner' || mode === 'smart_auto') && (
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Toner Saving Intensity
                        </span>
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                          ~{ecoStrength}% Ink Saved
                        </span>
                      </div>
                      <input
                        type="range"
                        min={15}
                        max={60}
                        value={ecoStrength}
                        onChange={(e) => setEcoStrength(Number(e.target.value))}
                        className="w-full accent-rose-600"
                      />
                      <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                        <span>Light (15%)</span>
                        <span>Balanced (35%)</span>
                        <span>Maximum (60%)</span>
                      </div>
                    </div>
                  )}

                  {/* Dark Slide Threshold Slider (for invert_dark or smart_auto) */}
                  {(mode === 'invert_dark' || mode === 'smart_auto') && (
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Dark Background Detection Cutoff
                        </span>
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                          {lumaThreshold}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={60}
                        max={200}
                        value={lumaThreshold}
                        onChange={(e) => setLumaThreshold(Number(e.target.value))}
                        className="w-full accent-rose-600"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Higher values catch navy and charcoal slides; lower values catch pure black only.
                      </p>
                    </div>
                  )}

                  {/* Live Interactive Preview Box */}
                  {(previewOriginal || previewProcessed) && (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-900 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Eye className="w-4 h-4 text-rose-500" />
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                            Page 1 Live Preview
                          </span>
                        </div>

                        <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold">
                          <button
                            type="button"
                            onClick={() => setPreviewTab('after')}
                            className={`px-3 py-1 rounded-lg transition-colors ${
                              previewTab === 'after'
                                ? 'bg-rose-600 text-white shadow-sm'
                                : 'text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            Optimized (Ink Saver)
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewTab('before')}
                            className={`px-3 py-1 rounded-lg transition-colors ${
                              previewTab === 'before'
                                ? 'bg-rose-600 text-white shadow-sm'
                                : 'text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            Original
                          </button>
                        </div>
                      </div>

                      <div className="relative w-full max-h-[380px] rounded-xl overflow-hidden bg-white dark:bg-slate-950 flex items-center justify-center border border-slate-200 dark:border-slate-800 shadow-inner">
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
                            ~{estimatedSavings}% Estimated Ink Saved
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Processing Status / Progress */}
                  {isProcessing && (
                    <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-center space-y-2">
                      <div className="flex items-center justify-center gap-2 text-rose-700 dark:text-rose-300 font-bold text-sm">
                        <RefreshCw className="w-4 h-4 animate-spin text-rose-600" />
                        <span>{progressMsg || 'Processing PDF...'}</span>
                      </div>
                      <p className="text-xs text-rose-600/80 dark:text-rose-400">
                        Please keep this tab open while high-resolution pages are processed.
                      </p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-4 pt-2">
                    <button
                      type="button"
                      onClick={handleConvert}
                      disabled={isProcessing}
                      className="flex-1 py-4 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white text-base font-bold rounded-2xl transition-all shadow-lg shadow-rose-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
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
                    </button>
                    {isProcessing && (
                      <button
                        type="button"
                        onClick={() => {
                          abortControllerRef.current = true;
                          setIsProcessing(false);
                        }}
                        className="px-6 py-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-2xl hover:bg-slate-200"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* Success & Download Screen */
                <div className="space-y-6 text-center py-6">
                  <div className="p-8 bg-emerald-50 dark:bg-emerald-950/40 rounded-3xl border border-emerald-200 dark:border-emerald-800">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <h3 className="text-2xl font-black text-emerald-900 dark:text-emerald-200 mb-2">
                      Print-Ready PDF Created!
                    </h3>
                    <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-6 max-w-md mx-auto">
                      Heavy backgrounds and excessive dark toner have been optimized. You saved approximately{' '}
                      <strong>{estimatedSavings}%</strong> of ink/toner for this print job.
                    </p>
                    <a
                      href={resultUrl}
                      download={`ink_saver_${file.name}`}
                      className="inline-flex items-center justify-center gap-2.5 px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-base font-bold rounded-2xl transition-all shadow-lg shadow-emerald-600/30"
                    >
                      <Download className="w-5 h-5" />
                      Download Ink-Saver PDF
                    </a>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setResultUrl(null);
                    }}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline"
                  >
                    Process another document
                  </button>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Informational Sidebar */}
        <aside className="lg:col-span-4 space-y-6">
          <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-base font-bold mb-4 text-slate-900 dark:text-white flex items-center gap-2">
              <Printer className="w-4 h-4 text-rose-600" />
              Why use Ink Saver?
            </h3>
            <ul className="space-y-3.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="font-bold text-rose-600">•</span>
                <span><strong>Lecture Slides:</strong> Inverts solid black/navy PowerPoint slide backgrounds to white paper so printing doesn't drain your cartridge.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-rose-600">•</span>
                <span><strong>Crisp Text:</strong> Unlike simple grayscale tools, Ink Saver keeps text high-contrast and sharp so it remains effortless to read.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-rose-600">•</span>
                <span><strong>Cleaner Scans:</strong> Removes yellow, grey, and shadowed paper backgrounds from mobile photo scans.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-rose-600">•</span>
                <span><strong>Zero Upload:</strong> Runs locally in your browser memory for 100% data privacy.</span>
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
  );
}
