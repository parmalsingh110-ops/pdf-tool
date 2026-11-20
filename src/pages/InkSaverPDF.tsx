import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Contrast,
  Download,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  Printer,
  ChevronLeft,
  ChevronRight,
  Pipette,
  Shield,
  Sliders,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import BeforeAfterSlider from '../components/BeforeAfterSlider';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import { dataUrlToBytes } from '../lib/utils';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';
import {
  type InkSaverMode,
  type InkComparison,
  processInkSaverCanvas,
  parsePageRange,
} from '../lib/documentCleanerEngine';

const COLOR_SWATCHES = [
  { label: 'Black Slide', hex: '#000000' },
  { label: 'Navy Slide', hex: '#0f172a' },
  { label: 'Yellow Paper', hex: '#fef3c7' },
  { label: 'Light Blue Form', hex: '#dbeafe' },
  { label: 'Gray Scan', hex: '#d1d5db' },
  { label: 'Cream Tint', hex: '#f5f0e1' },
];

export default function InkSaverPDF() {
  const prefersReduced = useReducedMotion();

  useSEO(
    'Ink Saver PDF Pro Online Free — Cut Printer Toner & Ink by 40–70% | PDF Media Suite',
    'Enterprise-grade Ink Saver for PDFs & images. Edge-preserving solid-fill hollowing, hue-preserving dark slide inversion, shadow-free scan bleach, and real CMYK ink coverage meter.'
  );

  usePageSEO(
    'Ink Saver PDF Pro — Eco-Print & Dark Slide Converter',
    'Save up to 70% printer ink and toner. Converts dark slides while preserving diagram hues, hollows thick fills while keeping text crisp, and strips colored form backgrounds.',
    'ink saver pdf, save printer toner pdf, dark slide to white pdf converter, eco print pdf online, reduce pdf ink usage, strip pdf background color',
    '/ink-saver'
  );

  const [file, setFile] = useState<File | null>(null);
  const [isImageInput, setIsImageInput] = useState(false);
  const [totalPages, setTotalPages] = useState(0);
  const [previewPageNum, setPreviewPageNum] = useState(1);

  // Pro Controls
  const [mode, setMode] = useState<InkSaverMode>('smart_auto');
  const [ecoStrength, setEcoStrength] = useState<number>(42);
  const [lumaThreshold, setLumaThreshold] = useState<number>(130);
  const [preservePhotos, setPreservePhotos] = useState<boolean>(true);
  const [forceMonochrome, setForceMonochrome] = useState<boolean>(false);
  const [stripShadedBoxes, setStripShadedBoxes] = useState<boolean>(true);
  const [hollowThickFills, setHollowThickFills] = useState<boolean>(true);
  const [sourceColorHex, setSourceColorHex] = useState<string>('#dbeafe');
  const [targetBgHex, setTargetBgHex] = useState<string>('#ffffff');
  const [colorTolerance, setColorTolerance] = useState<number>(68);
  const [pageRangeStr, setPageRangeStr] = useState<string>('');
  const [exportDpiScale, setExportDpiScale] = useState<number>(2.0); // 1.5=108dpi draft, 2.0=144dpi crisp, 2.8=200dpi high

  // Preview & Output State
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [previewBeforeUrl, setPreviewBeforeUrl] = useState<string | null>(null);
  const [previewAfterUrl, setPreviewAfterUrl] = useState<string | null>(null);
  const [inkStats, setInkStats] = useState<InkComparison | null>(null);
  const [finalAvgSaved, setFinalAvgSaved] = useState<number>(0);

  // Cached source document & preview canvas (never re-reads file on slider moves!)
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const cachedPageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const abortControllerRef = useRef<boolean>(false);

  useAutoRevokeUrl(resultUrl);

  const runPreviewFilter = useCallback(() => {
    const srcCanvas = cachedPageCanvasRef.current;
    if (!srcCanvas) return;

    const procCanvas = document.createElement('canvas');
    procCanvas.width = srcCanvas.width;
    procCanvas.height = srcCanvas.height;
    const ctx = procCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(srcCanvas, 0, 0);

    const comparison = processInkSaverCanvas(procCanvas, {
      mode,
      ecoStrength,
      lumaThreshold,
      preservePhotos,
      forceMonochrome,
      stripShadedBoxes,
      hollowThickFills,
      sourceColorHex,
      targetBgHex,
      colorTolerance,
    });

    setPreviewAfterUrl(procCanvas.toDataURL('image/jpeg', 0.88));
    setInkStats(comparison);
    procCanvas.width = 0;
    procCanvas.height = 0;
  }, [
    mode,
    ecoStrength,
    lumaThreshold,
    preservePhotos,
    forceMonochrome,
    stripShadedBoxes,
    hollowThickFills,
    sourceColorHex,
    targetBgHex,
    colorTolerance,
  ]);

  const loadPreviewPage = useCallback(async (pageNum: number) => {
    const pdf = pdfDocRef.current;
    if (!pdf) return;
    try {
      const page = await pdf.getPage(pageNum);
      const vp = page.getViewport({ scale: 1.35 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;
      page.cleanup();

      cachedPageCanvasRef.current = canvas;
      setPreviewBeforeUrl(canvas.toDataURL('image/jpeg', 0.86));
    } catch (e) {
      console.warn('[InkSaver] Preview render error:', e);
    }
  }, []);

  // Re-run filter immediately when preview page or controls change (debounced 50ms)
  useEffect(() => {
    if (!previewBeforeUrl) return;
    const t = setTimeout(() => runPreviewFilter(), 50);
    return () => clearTimeout(t);
  }, [previewBeforeUrl, runPreviewFilter]);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    const selected = acceptedFiles[0];
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFile(selected);
    setResultUrl(null);
    setPreviewBeforeUrl(null);
    setPreviewAfterUrl(null);
    setInkStats(null);
    setPageRangeStr('');
    pdfDocRef.current = null;
    sourceImageRef.current = null;
    cachedPageCanvasRef.current = null;

    const isImg =
      selected.type.startsWith('image/') ||
      /\.(jpe?g|png|webp)$/i.test(selected.name);
    setIsImageInput(isImg);

    try {
      if (isImg) {
        setTotalPages(1);
        setPreviewPageNum(1);
        const url = URL.createObjectURL(selected);
        const img = new Image();
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej(new Error('Image load failed'));
          img.src = url;
        });
        sourceImageRef.current = img;
        const maxPrev = 1200;
        const sc = Math.min(1, maxPrev / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * sc);
        c.height = Math.round(img.naturalHeight * sc);
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        cachedPageCanvasRef.current = c;
        setPreviewBeforeUrl(c.toDataURL('image/jpeg', 0.88));
        URL.revokeObjectURL(url);
      } else {
        const buffer = await selected.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        setPreviewPageNum(1);
        await loadPreviewPage(1);
      }
    } catch (e) {
      console.error('[InkSaver] File load failed:', e);
      alert('Failed to open file. Please check that the PDF is not password-protected.');
      setFile(null);
    }
  };

  const handleSwitchPreviewPage = async (nextPage: number) => {
    const clamped = Math.max(1, Math.min(totalPages, nextPage));
    setPreviewPageNum(clamped);
    await loadPreviewPage(clamped);
  };

  const handleConvert = async () => {
    if (!file) return;
    setIsProcessing(true);
    abortControllerRef.current = false;
    setProgressMsg('Preparing Eco-Print engine...');

    try {
      const outputPdf = await PDFDocument.create();
      let totalSavingsSum = 0;
      let processedCount = 0;

      if (isImageInput && sourceImageRef.current) {
        setProgressMsg('Optimizing full-resolution image...');
        const img = sourceImageRef.current;
        const maxDim = 2400;
        const sc = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * sc);
        canvas.height = Math.round(img.naturalHeight * sc);
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const stats = processInkSaverCanvas(canvas, {
          mode,
          ecoStrength,
          lumaThreshold,
          preservePhotos,
          forceMonochrome,
          stripShadedBoxes,
          hollowThickFills,
          sourceColorHex,
          targetBgHex,
          colorTolerance,
        });
        totalSavingsSum += stats.savedPercent;
        processedCount = 1;

        const jpgBytes = dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.92));
        const embedded = await outputPdf.embedJpg(jpgBytes);
        const a4W = canvas.width > canvas.height ? 841.89 : 595.28;
        const a4H = canvas.width > canvas.height ? 595.28 : 841.89;
        const fit = Math.min(a4W / canvas.width, a4H / canvas.height);
        const pg = outputPdf.addPage([a4W, a4H]);
        pg.drawImage(embedded, {
          x: (a4W - canvas.width * fit) / 2,
          y: (a4H - canvas.height * fit) / 2,
          width: canvas.width * fit,
          height: canvas.height * fit,
        });
        canvas.width = 0;
        canvas.height = 0;
      } else {
        const pdf =
          pdfDocRef.current ||
          (await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise);
        const pagesToProcess = parsePageRange(pageRangeStr, pdf.numPages);

        for (let idx = 0; idx < pagesToProcess.length; idx++) {
          if (abortControllerRef.current) throw new Error('Cancelled by user');
          const pNum = pagesToProcess[idx];
          setProgressMsg(`Optimizing page ${pNum} (${idx + 1}/${pagesToProcess.length})...`);

          const page = await pdf.getPage(pNum);
          const viewport = page.getViewport({ scale: exportDpiScale });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) continue;

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;

          const stats = processInkSaverCanvas(canvas, {
            mode,
            ecoStrength,
            lumaThreshold,
            preservePhotos,
            forceMonochrome,
            stripShadedBoxes,
            hollowThickFills,
            sourceColorHex,
            targetBgHex,
            colorTolerance,
          });
          totalSavingsSum += stats.savedPercent;
          processedCount++;

          const imgBytes = dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.91));
          const embeddedImage = await outputPdf.embedJpg(imgBytes);
          const outW = viewport.width / exportDpiScale;
          const outH = viewport.height / exportDpiScale;
          const outPage = outputPdf.addPage([outW, outH]);
          outPage.drawImage(embeddedImage, { x: 0, y: 0, width: outW, height: outH });

          canvas.width = 0;
          canvas.height = 0;
          page.cleanup();
          if (idx % 2 === 1) await new Promise((r) => setTimeout(r, 0));
        }
      }

      setProgressMsg('Finalizing print-optimized PDF...');
      const bytes = await outputPdf.save();
      const blob = new Blob([toArrayBufferBytes(bytes)], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
      setFinalAvgSaved(processedCount > 0 ? Math.round(totalSavingsSum / processedCount) : 0);
    } catch (error: any) {
      if (error?.message !== 'Cancelled by user') {
        console.error('[InkSaver] Conversion failed:', error);
        alert('Failed to process document. Please ensure the file is not encrypted.');
      }
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  const resetAll = () => {
    setFile(null);
    setResultUrl(null);
    setPreviewBeforeUrl(null);
    setPreviewAfterUrl(null);
    setInkStats(null);
    pdfDocRef.current = null;
    sourceImageRef.current = null;
    cachedPageCanvasRef.current = null;
  };

  return (
    <ToolWorkspaceShell
      title="Ink Saver PDF Pro"
      subtitle="Save 40% to 75% printer ink and toner without making text blurry. Edge-preserving solid-fill hollowing, hue-preserving dark slide inversion, shadow-free scan bleach, and live CMYK ink meter."
      categoryLabel="Eco-Print & Toner Optimizer"
      icon={Contrast}
      microVariant="compress"
      tone="emerald"
      trustNote="Real C/M/Y/K ink meter · Edge-preserving text crispness · 100% browser-private"
    >
      <div className="w-full max-w-7xl mx-auto text-[var(--pms-ink)]">
        <PearlStageSwitch stageKey={!file ? 'upload' : resultUrl ? 'done' : 'configure'}>
          {!file ? (
            <section className="max-w-2xl mx-auto pms-glass-panel rounded-3xl border-2 border-dashed border-[var(--pms-border)] p-8 sm:p-12 hover:border-emerald-500 transition-colors">
              <FileDropzone
                onDrop={handleDrop}
                multiple={false}
                accept={{
                  'application/pdf': ['.pdf'],
                  'image/jpeg': ['.jpg', '.jpeg'],
                  'image/png': ['.png'],
                  'image/webp': ['.webp'],
                }}
                title="Select PDF or Image to Save Ink"
                subtitle="Supports dark lecture slides, study notes, bank/exam forms, and scanned papers"
                className="!border-none !p-0 !max-w-none !shadow-none !bg-transparent"
              />
            </section>
          ) : !resultUrl ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Controls (5 cols) */}
              <section className="lg:col-span-5 pms-glass-panel rounded-3xl p-5 sm:p-6 space-y-5 relative overflow-hidden">
                <PearlScanOverlay
                  active={isProcessing}
                  label={progressMsg || 'Optimizing ink coverage...'}
                />

                {/* File Header */}
                <div className="flex items-center justify-between gap-3 p-3.5 bg-white/80 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)]">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'var(--pms-soft-mint)', color: '#059669' }}
                    >
                      <Printer className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{file.name}</p>
                      <p className="text-[11px] text-[var(--pms-muted)]">
                        {(file.size / 1024 / 1024).toFixed(2)} MB · {totalPages} page{totalPages === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={resetAll}
                    className="text-xs font-semibold text-[var(--pms-muted)] hover:text-rose-600 px-2.5 py-1 rounded-lg border border-[var(--pms-border)] cursor-pointer"
                  >
                    Change
                  </button>
                </div>

                {/* 5 Real Optimization Modes */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--pms-muted)] block mb-2">
                    Optimization Engine
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {([
                      {
                        id: 'smart_auto',
                        title: 'Smart Auto (Recommended)',
                        desc: 'Detects dark slides, shadowed scans, or digital PDFs per page automatically.',
                      },
                      {
                        id: 'invert_dark',
                        title: 'Dark Slides → White Print (Hue-Safe)',
                        desc: 'Inverts black/navy slides to white paper while preserving chart & link colors.',
                      },
                      {
                        id: 'eco_toner',
                        title: 'Eco Toner (Edge-Preserving Hollow)',
                        desc: 'Lightens heavy solid fills & shaded headers while keeping text crisp.',
                      },
                      {
                        id: 'clean_scanned',
                        title: 'Shadow-Free Scan Bleach',
                        desc: 'Adaptive background normalization erases uneven gray/yellow scan tints.',
                      },
                      {
                        id: 'replace_color',
                        title: 'Strip Specific Background Color',
                        desc: 'Pick any colored tint (blue forms, yellow paper, colored slides) → pure white.',
                      },
                    ] as const).map((preset) => {
                      const active = mode === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setMode(preset.id)}
                          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                            active
                              ? 'border-emerald-500 bg-[var(--pms-soft-mint)] shadow-xs'
                              : 'border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 hover:bg-white dark:hover:bg-slate-900'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs">{preset.title}</span>
                            {active && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[var(--pms-muted)] mt-0.5 leading-snug">
                            {preset.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Mode-Specific Controls */}
                <div className="p-4 rounded-2xl bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] space-y-3.5 text-xs">
                  <div className="font-bold uppercase tracking-wider text-[11px] text-[var(--pms-muted)] flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-emerald-600" /> Fine-Tune Ink Controls
                  </div>

                  {mode !== 'replace_color' && (
                    <div>
                      <div className="flex justify-between font-semibold mb-1">
                        <span>Ink Reduction Intensity</span>
                        <span className="font-mono text-emerald-600 dark:text-emerald-400">{ecoStrength}%</span>
                      </div>
                      <input
                        type="range"
                        min={15}
                        max={75}
                        value={ecoStrength}
                        onChange={(e) => setEcoStrength(Number(e.target.value))}
                        className="w-full accent-emerald-600"
                      />
                    </div>
                  )}

                  {(mode === 'invert_dark' || mode === 'smart_auto') && (
                    <div>
                      <div className="flex justify-between font-semibold mb-1">
                        <span>Dark Slide Detection Cutoff</span>
                        <span className="font-mono">{lumaThreshold}</span>
                      </div>
                      <input
                        type="range"
                        min={60}
                        max={200}
                        value={lumaThreshold}
                        onChange={(e) => setLumaThreshold(Number(e.target.value))}
                        className="w-full accent-emerald-600"
                      />
                    </div>
                  )}

                  {mode === 'replace_color' && (
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-semibold flex items-center gap-1">
                            <Pipette className="w-3.5 h-3.5 text-emerald-600" /> Color to Erase
                          </span>
                          <input
                            type="color"
                            value={sourceColorHex}
                            onChange={(e) => setSourceColorHex(e.target.value)}
                            className="w-8 h-6 rounded border cursor-pointer"
                          />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {COLOR_SWATCHES.map((sw) => (
                            <button
                              key={sw.hex}
                              type="button"
                              onClick={() => setSourceColorHex(sw.hex)}
                              className={`px-2 py-1 rounded-lg border text-[10px] font-semibold flex items-center gap-1 cursor-pointer ${
                                sourceColorHex.toLowerCase() === sw.hex
                                  ? 'border-emerald-500 bg-[var(--pms-soft-mint)]'
                                  : 'border-[var(--pms-border)] bg-white/80 dark:bg-slate-800'
                              }`}
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-full border border-slate-400"
                                style={{ backgroundColor: sw.hex }}
                              />
                              {sw.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between font-semibold mb-1">
                          <span>Color Match Tolerance</span>
                          <span className="font-mono">{colorTolerance}</span>
                        </div>
                        <input
                          type="range"
                          min={15}
                          max={150}
                          value={colorTolerance}
                          onChange={(e) => setColorTolerance(Number(e.target.value))}
                          className="w-full accent-emerald-600"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">Replace With</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={targetBgHex}
                            onChange={(e) => setTargetBgHex(e.target.value)}
                            className="w-8 h-6 rounded border cursor-pointer"
                          />
                          <span className="font-mono text-[11px]">{targetBgHex}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Pro Print Switches */}
                  <div className="space-y-2 pt-2 border-t border-[var(--pms-border)]">
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="font-semibold flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-emerald-600" /> Protect Embedded Photos
                      </span>
                      <input
                        type="checkbox"
                        checked={preservePhotos}
                        onChange={(e) => setPreservePhotos(e.target.checked)}
                        className="w-4 h-4 accent-emerald-600"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="font-semibold">Force Monochrome (0% Color Ink)</span>
                      <input
                        type="checkbox"
                        checked={forceMonochrome}
                        onChange={(e) => setForceMonochrome(e.target.checked)}
                        className="w-4 h-4 accent-emerald-600"
                      />
                    </label>
                    {(mode === 'eco_toner' || mode === 'smart_auto') && (
                      <>
                        <label className="flex items-center justify-between cursor-pointer">
                          <span className="font-semibold">Hollow Thick Solid Fills</span>
                          <input
                            type="checkbox"
                            checked={hollowThickFills}
                            onChange={(e) => setHollowThickFills(e.target.checked)}
                            className="w-4 h-4 accent-emerald-600"
                          />
                        </label>
                        <label className="flex items-center justify-between cursor-pointer">
                          <span className="font-semibold">Strip Pastel Shaded Boxes</span>
                          <input
                            type="checkbox"
                            checked={stripShadedBoxes}
                            onChange={(e) => setStripShadedBoxes(e.target.checked)}
                            className="w-4 h-4 accent-emerald-600"
                          />
                        </label>
                      </>
                    )}
                  </div>

                  {/* Page Range & Export DPI */}
                  {!isImageInput && (
                    <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-[var(--pms-border)]">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-[var(--pms-muted)] mb-1">
                          Page Range (Optional)
                        </label>
                        <input
                          type="text"
                          value={pageRangeStr}
                          onChange={(e) => setPageRangeStr(e.target.value)}
                          placeholder={`All (1-${totalPages})`}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--pms-border)] bg-white dark:bg-slate-900 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-[var(--pms-muted)] mb-1">
                          Output Sharpness
                        </label>
                        <select
                          value={exportDpiScale}
                          onChange={(e) => setExportDpiScale(Number(e.target.value))}
                          className="w-full px-2 py-1.5 rounded-lg border border-[var(--pms-border)] bg-white dark:bg-slate-900 text-xs font-semibold"
                        >
                          <option value={1.5}>Fast Draft (110 DPI)</option>
                          <option value={2.0}>Standard Crisp (150 DPI)</option>
                          <option value={2.8}>Ultra Sharp (200 DPI)</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2.5">
                  <motion.button
                    type="button"
                    whileHover={prefersReduced ? undefined : { scale: 1.01 }}
                    whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                    onClick={handleConvert}
                    disabled={isProcessing}
                    className="pms-btn-primary flex-1 py-3.5 text-sm font-bold rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Optimizing...
                      </>
                    ) : (
                      <>
                        <Printer className="w-4 h-4" />
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
                      className="px-4 py-3.5 bg-white/80 dark:bg-slate-900 border border-[var(--pms-border)] text-xs font-bold rounded-2xl cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </section>

              {/* Right Live Preview + Real CMYK Meter (7 cols) */}
              <section className="lg:col-span-7 space-y-5">
                {/* Real CMYK Ink Savings Dashboard */}
                {inkStats && (
                  <div className="pms-glass-panel rounded-3xl p-5 space-y-3.5">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-emerald-600" /> Live Page {previewPageNum} CMYK Ink Audit
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-600 text-white">
                          <AnimatedNumber value={inkStats.savedPercent} suffix="% Ink Saved" />
                        </span>
                        <span
                          className="px-3 py-1 rounded-full text-xs font-bold border border-[var(--pms-border)]"
                          style={{ background: 'var(--pms-soft-mint)' }}
                        >
                          ~₹{inkStats.rupeesSavedPer100Pages} saved / 100 prints
                        </span>
                      </div>
                    </div>

                    {/* C / M / Y / K Channel Comparison Bars */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                      {[
                        { label: 'Cyan (C)', before: inkStats.before.cyanPct, after: inkStats.after.cyanPct, bar: 'bg-cyan-500' },
                        { label: 'Magenta (M)', before: inkStats.before.magentaPct, after: inkStats.after.magentaPct, bar: 'bg-fuchsia-500' },
                        { label: 'Yellow (Y)', before: inkStats.before.yellowPct, after: inkStats.after.yellowPct, bar: 'bg-amber-400' },
                        { label: 'Black (K)', before: inkStats.before.blackPct, after: inkStats.after.blackPct, bar: 'bg-slate-800 dark:bg-slate-200' },
                      ].map((ch) => (
                        <div
                          key={ch.label}
                          className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/75 border border-[var(--pms-border)] space-y-1"
                        >
                          <div className="flex justify-between items-center text-[11px] font-bold">
                            <span>{ch.label}</span>
                            <span className="font-mono text-emerald-600 dark:text-emerald-400">{ch.after}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${ch.bar}`}
                              style={{ width: `${Math.min(100, ch.after)}%` }}
                            />
                          </div>
                          <div className="text-[10px] text-[var(--pms-muted)]">
                            Was <span className="line-through">{ch.before}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Interactive Split Comparison */}
                <div className="pms-glass-panel rounded-3xl p-5 space-y-3">
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between text-xs font-semibold pb-2 border-b border-[var(--pms-border)]">
                      <span className="text-[var(--pms-muted)]">Inspect Any Page Before Exporting</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleSwitchPreviewPage(previewPageNum - 1)}
                          disabled={previewPageNum <= 1}
                          className="p-1.5 rounded-lg border border-[var(--pms-border)] bg-white/80 dark:bg-slate-900 disabled:opacity-35 cursor-pointer"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-2 font-mono">
                          Page {previewPageNum} / {totalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleSwitchPreviewPage(previewPageNum + 1)}
                          disabled={previewPageNum >= totalPages}
                          className="p-1.5 rounded-lg border border-[var(--pms-border)] bg-white/80 dark:bg-slate-900 disabled:opacity-35 cursor-pointer"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {previewBeforeUrl && previewAfterUrl ? (
                    <BeforeAfterSlider
                      beforeSrc={previewBeforeUrl}
                      afterSrc={previewAfterUrl}
                      beforeLabel="Original"
                      afterLabel="Ink-Saver Optimized"
                      maxHeightClass="max-h-[540px]"
                      badgeText={
                        inkStats
                          ? `Total Ink: ${inkStats.before.totalCoveragePct}% → ${inkStats.after.totalCoveragePct}%`
                          : undefined
                      }
                    />
                  ) : (
                    <div className="h-80 flex items-center justify-center text-xs text-[var(--pms-muted)]">
                      Rendering live page comparison...
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : (
            /* Success Screen */
            <div className="max-w-2xl mx-auto pms-glass-panel rounded-3xl p-8 text-center space-y-6">
              <div
                className="p-8 rounded-3xl border border-[var(--pms-border)]"
                style={{ backgroundColor: 'var(--pms-soft-mint)' }}
              >
                <div className="w-16 h-16 rounded-2xl bg-white/85 dark:bg-slate-900/80 border border-[var(--pms-border)] text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-black mb-2">Print-Ready Eco PDF Created!</h3>
                <p className="text-sm text-[var(--pms-muted)] mb-6 max-w-md mx-auto">
                  Measured average ink reduction across your pages:{' '}
                  <strong className="text-emerald-700 dark:text-emerald-300">
                    <AnimatedNumber value={finalAvgSaved} suffix="%" />
                  </strong>{' '}
                  less toner/ink while preserving text sharpness.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <a
                    href={resultUrl}
                    download={`ink_saver_${file.name.replace(/\.[^.]+$/, '')}.pdf`}
                    className="pms-btn-primary inline-flex items-center justify-center gap-2 px-7 py-3.5 text-sm font-bold rounded-2xl"
                  >
                    <Download className="w-4 h-4" /> Download Ink-Saver PDF
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      const w = window.open(resultUrl, '_blank');
                      w?.addEventListener('load', () => {
                        try { w.print(); } catch {}
                      });
                    }}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white/85 dark:bg-slate-900 border border-[var(--pms-border)] rounded-2xl text-sm font-bold cursor-pointer hover:border-emerald-500"
                  >
                    <Printer className="w-4 h-4 text-emerald-600" /> Print Now
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={resetAll}
                className="text-xs font-bold text-[var(--pms-muted)] hover:text-[var(--pms-ink)] underline cursor-pointer"
              >
                Process another document
              </button>
            </div>
          )}
        </PearlStageSwitch>
      </div>
    </ToolWorkspaceShell>
  );
}
