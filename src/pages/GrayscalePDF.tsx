import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Droplet,
  Download,
  FileText,
  CheckCircle2,
  Sliders,
  ExternalLink,
  Eye,
  Loader2,
  SunMedium,
  Contrast,
  ChevronLeft,
  ChevronRight,
  Zap,
  Printer,
} from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import BeforeAfterSlider from '../components/BeforeAfterSlider';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { apiFetch } from '../lib/api';
import { dataUrlToBytes } from '../lib/utils';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';
import {
  type GrayscaleProMode,
  type GrayChannelMix,
  type InkComparison,
  applyGrayscaleProToImageData,
  parsePageRange,
} from '../lib/documentCleanerEngine';

type ConversionEngine = 'vector_gray' | 'studio_raster';

export default function GrayscalePDF() {
  useSEO(
    'Convert PDF to Grayscale Pro — True Vector DeviceGray & Halftone B&W | PDF Media Suite',
    'Convert color PDFs into genuine 1-channel DeviceGray vector PDFs (keeps selectable text & guarantees B&W print billing) OR adaptive shadow-free photocopy & halftone dither B&W.'
  );

  usePageSEO(
    'Convert PDF to Grayscale & Monochrome Pro',
    'True Vector DeviceGray PDF conversion + client-side Sauvola Photocopy, Floyd-Steinberg Halftone Dither, and RGB Channel Mixer (drop red stamps or boost blue ink).',
    'convert pdf to grayscale vector, devicegray pdf online, black and white photocopy pdf, floyd steinberg halftone pdf, drop red stamp grayscale',
    '/grayscale-pdf'
  );

  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [previewPageNum, setPreviewPageNum] = useState(1);
  const [isLoadingPage, setIsLoadingPage] = useState(false);

  // Dual Engine: True Vector DeviceGray vs Local Studio Filters
  const [engine, setEngine] = useState<ConversionEngine>('vector_gray');
  const [vectorEcoPct, setVectorEcoPct] = useState<number>(0);

  // Studio Filter Controls
  const [filterMode, setFilterMode] = useState<GrayscaleProMode>('smooth');
  const [channelMix, setChannelMix] = useState<GrayChannelMix>('rec709');
  const [contrast, setContrast] = useState(0);
  const [brightness, setBrightness] = useState(0);
  const [threshold, setThreshold] = useState(145);
  const [shadowRemoval, setShadowRemoval] = useState(0);
  const [pageRangeStr, setPageRangeStr] = useState('');
  const [exportScale, setExportScale] = useState(2.0);

  // Preview Data URLs
  const [previewBeforeUrl, setPreviewBeforeUrl] = useState<string | null>(null);
  const [previewAfterUrl, setPreviewAfterUrl] = useState<string | null>(null);
  const [inkStats, setInkStats] = useState<InkComparison | null>(null);

  // Processing & Result
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [grayscaleUrl, setGrayscaleUrl] = useState<string | null>(null);
  const [usedVectorOutput, setUsedVectorOutput] = useState(false);
  const [showResultPreview, setShowResultPreview] = useState(true);

  useAutoRevokeUrl(grayscaleUrl);

  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const originalImgDataRef = useRef<ImageData | null>(null);
  const prefersReduced = useReducedMotion();

  const renderPageForPreview = useCallback(async (pageNum: number) => {
    const pdf = pdfDocRef.current;
    if (!pdf) return;
    setIsLoadingPage(true);
    try {
      const page = await pdf.getPage(pageNum);
      const vp = page.getViewport({ scale: 1.25 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;
      page.cleanup();

      originalImgDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setPreviewBeforeUrl(canvas.toDataURL('image/jpeg', 0.88));
      canvas.width = 0;
      canvas.height = 0;
    } catch (err) {
      console.error('[GrayscalePDF] Preview render error:', err);
    } finally {
      setIsLoadingPage(false);
    }
  }, []);

  // Live preview filter update (runs in ~15-35ms)
  useEffect(() => {
    const src = originalImgDataRef.current;
    if (!src) return;

    const timer = setTimeout(() => {
      const effectiveMode: GrayscaleProMode =
        engine === 'vector_gray'
          ? vectorEcoPct > 0
            ? 'eco_draft'
            : 'smooth'
          : filterMode;

      const { output, ink } = applyGrayscaleProToImageData(src, {
        mode: effectiveMode,
        channelMix: engine === 'vector_gray' ? 'rec709' : channelMix,
        contrast: engine === 'vector_gray' ? 0 : contrast,
        brightness: engine === 'vector_gray' ? Math.round(vectorEcoPct * 0.7) : brightness,
        threshold,
        shadowRemoval: engine === 'vector_gray' ? 0 : shadowRemoval,
      });

      const outCanvas = document.createElement('canvas');
      outCanvas.width = output.width;
      outCanvas.height = output.height;
      outCanvas.getContext('2d')!.putImageData(output, 0, 0);
      setPreviewAfterUrl(outCanvas.toDataURL('image/jpeg', 0.9));
      setInkStats(ink);
      outCanvas.width = 0;
      outCanvas.height = 0;
    }, 50);

    return () => clearTimeout(timer);
  }, [
    previewBeforeUrl,
    engine,
    vectorEcoPct,
    filterMode,
    channelMix,
    contrast,
    brightness,
    threshold,
    shadowRemoval,
  ]);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const selectedFile = acceptedFiles[0];
    setFile(selectedFile);
    setGrayscaleUrl(null);
    setPageRangeStr('');
    setIsLoadingPage(true);

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      pdfDocRef.current = pdfjsDoc;
      setPageCount(pdfjsDoc.numPages);
      setPreviewPageNum(1);
      await renderPageForPreview(1);
    } catch (err) {
      console.error('Error loading PDF:', err);
      alert('Could not open PDF. Make sure it is not password-protected.');
      setFile(null);
    } finally {
      setIsLoadingPage(false);
    }
  };

  const processGrayscalePdf = async () => {
    if (!file) return;
    setIsProcessing(true);
    setProgressPercent(10);
    setUsedVectorOutput(false);

    try {
      // Path 1: True Vector DeviceGray via Ghostscript backend (keeps 100% vector selectable text & 0% CMY ink!)
      if (engine === 'vector_gray' && !pageRangeStr.trim()) {
        setProgressText('Converting to 100% True Vector DeviceGray PDF...');
        setProgressPercent(45);
        try {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('eco_lighten_pct', String(vectorEcoPct));
          const res = await apiFetch('/convert/grayscale', { method: 'POST', body: fd, timeoutMs: 75000 });
          if (res.ok) {
            const blob = await res.blob();
            setGrayscaleUrl(URL.createObjectURL(blob));
            setUsedVectorOutput(true);
            setProgressPercent(100);
            setProgressText('True Vector DeviceGray Ready!');
            return;
          }
        } catch (err) {
          console.warn('[GrayscalePDF] Vector backend unavailable, falling back to high-DPI browser engine:', err);
        }
      }

      // Path 2: High-DPI Browser Studio (Adaptive Photocopy / Halftone Dither / Channel Mixer / Fallback)
      setProgressText('Rendering high-DPI monochrome pages in browser...');
      const pdfjsDoc =
        pdfDocRef.current ||
        (await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise);
      const targetPages = parsePageRange(pageRangeStr, pdfjsDoc.numPages);
      const newPdfDoc = await PDFDocument.create();

      const effectiveMode: GrayscaleProMode =
        engine === 'vector_gray' ? (vectorEcoPct > 0 ? 'eco_draft' : 'smooth') : filterMode;

      for (let i = 0; i < targetPages.length; i++) {
        const pNum = targetPages[i];
        setProgressText(`Processing page ${pNum} (${i + 1}/${targetPages.length})...`);
        setProgressPercent(Math.round(12 + ((i + 1) / targetPages.length) * 80));

        const page = await pdfjsDoc.getPage(pNum);
        const vp = page.getViewport({ scale: exportScale });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;

        const srcData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const { output } = applyGrayscaleProToImageData(srcData, {
          mode: effectiveMode,
          channelMix: engine === 'vector_gray' ? 'rec709' : channelMix,
          contrast: engine === 'vector_gray' ? 0 : contrast,
          brightness: engine === 'vector_gray' ? Math.round(vectorEcoPct * 0.7) : brightness,
          threshold,
          shadowRemoval: engine === 'vector_gray' ? 0 : shadowRemoval,
        });
        ctx.putImageData(output, 0, 0);

        const imgBytes = dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.9));
        const embeddedImg = await newPdfDoc.embedJpg(imgBytes);
        const origW = vp.width / exportScale;
        const origH = vp.height / exportScale;
        const newPage = newPdfDoc.addPage([origW, origH]);
        newPage.drawImage(embeddedImg, { x: 0, y: 0, width: origW, height: origH });

        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
        if (i % 2 === 1) await new Promise((r) => setTimeout(r, 0));
      }

      setProgressPercent(96);
      setProgressText('Finalizing monochrome PDF...');
      const pdfBytes = toArrayBufferBytes(await newPdfDoc.save());
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      setGrayscaleUrl(URL.createObjectURL(blob));
      setProgressPercent(100);
      setProgressText('Completed!');
    } catch (err) {
      console.error('Error generating grayscale PDF:', err);
      alert('An error occurred during grayscale conversion. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setGrayscaleUrl(null);
    setPageCount(0);
    setPreviewBeforeUrl(null);
    setPreviewAfterUrl(null);
    setInkStats(null);
    pdfDocRef.current = null;
    originalImgDataRef.current = null;
  };

  return (
    <ToolWorkspaceShell
      title="Grayscale & Monochrome PDF Pro"
      subtitle="Create genuine 1-channel DeviceGray vector PDFs (100% selectable text, guaranteed B&W print billing) OR use Adaptive Sauvola Photocopy, Floyd-Steinberg Halftone Dither, and RGB Channel Filters."
      categoryLabel="Monochrome & Print Optimizer"
      icon={Droplet}
      microVariant="convert"
      tone="sky"
      trustNote="True Vector DeviceGray Engine · Adaptive Sauvola B&W · Halftone Dither"
    >
      <div className="flex flex-col items-center justify-center max-w-7xl mx-auto w-full">
        {!file ? (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-2xl"
          >
            <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF to Convert to Grayscale / B&W" />
          </motion.div>
        ) : (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative w-full pms-glass-panel rounded-3xl p-5 md:p-7 overflow-hidden"
          >
            <PearlScanOverlay
              active={isProcessing || isLoadingPage}
              label={isLoadingPage ? 'Rendering page preview…' : progressText || 'Converting to monochrome…'}
            />

            {!grayscaleUrl ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Live Split Preview (6 cols) */}
                <div className="lg:col-span-6 space-y-4">
                  <div className="p-3.5 bg-white/80 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] rounded-xl flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{file.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {(file.size / 1024 / 1024).toFixed(2)} MB · {pageCount} page(s)
                        </p>
                      </div>
                    </div>
                    {pageCount > 1 && (
                      <div className="flex items-center gap-1 text-xs font-mono shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const n = Math.max(1, previewPageNum - 1);
                            setPreviewPageNum(n);
                            void renderPageForPreview(n);
                          }}
                          disabled={previewPageNum <= 1}
                          className="p-1.5 rounded-lg border border-[var(--pms-border)] bg-white dark:bg-slate-900 disabled:opacity-35 cursor-pointer"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-1.5">
                          {previewPageNum}/{pageCount}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const n = Math.min(pageCount, previewPageNum + 1);
                            setPreviewPageNum(n);
                            void renderPageForPreview(n);
                          }}
                          disabled={previewPageNum >= pageCount}
                          className="p-1.5 rounded-lg border border-[var(--pms-border)] bg-white dark:bg-slate-900 disabled:opacity-35 cursor-pointer"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {previewBeforeUrl && previewAfterUrl ? (
                    <BeforeAfterSlider
                      beforeSrc={previewBeforeUrl}
                      afterSrc={previewAfterUrl}
                      beforeLabel="Original Color"
                      afterLabel={engine === 'vector_gray' ? 'Vector DeviceGray' : 'Monochrome'}
                      maxHeightClass="max-h-[520px]"
                      badgeText={
                        inkStats
                          ? `Color Ink: ${inkStats.before.cyanPct + inkStats.before.magentaPct + inkStats.before.yellowPct > 0 ? '→ 0%' : '0%'} · Saved ${inkStats.savedPercent}%`
                          : undefined
                      }
                    />
                  ) : (
                    <div className="h-80 rounded-2xl border border-[var(--pms-border)] flex items-center justify-center text-xs text-slate-500">
                      <Loader2 className="w-5 h-5 animate-spin mr-2 text-sky-600" /> Loading preview...
                    </div>
                  )}
                </div>

                {/* Right Controls (6 cols) */}
                <div className="lg:col-span-6 space-y-5">
                  {/* Engine Selector: True Vector vs Local Studio */}
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
                      1. Choose Conversion Engine
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setEngine('vector_gray')}
                        className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                          engine === 'vector_gray'
                            ? 'border-sky-500 bg-[var(--pms-soft-blue)] shadow-xs'
                            : 'border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-xs flex items-center gap-1.5 text-slate-900 dark:text-white">
                            <Zap className="w-3.5 h-3.5 text-sky-600" /> True Vector DeviceGray ★
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                            Crisp Text
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                          Keeps text 100% vector &amp; searchable, tiny file size, guaranteed 0% CMY color printer billing.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEngine('studio_raster')}
                        className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                          engine === 'studio_raster'
                            ? 'border-sky-500 bg-[var(--pms-soft-blue)] shadow-xs'
                            : 'border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-xs text-slate-900 dark:text-white">
                            Pro Monochrome Studio
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-white">
                            Browser-Only
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                          Shadow-free Sauvola B&amp;W, Halftone Dither, &amp; RGB Channel Mixer (drop red stamps!).
                        </p>
                      </button>
                    </div>
                  </div>

                  {engine === 'vector_gray' ? (
                    <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/75 border border-[var(--pms-border)] space-y-3 text-xs">
                      <div className="flex justify-between font-bold">
                        <span>Optional Vector Eco-Toner Lighten</span>
                        <span className="font-mono text-sky-600 dark:text-sky-400">
                          {vectorEcoPct === 0 ? 'Off (Faithful Gray)' : `${vectorEcoPct}% Lighter`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={40}
                        step={5}
                        value={vectorEcoPct}
                        onChange={(e) => setVectorEcoPct(Number(e.target.value))}
                        className="w-full accent-sky-600"
                      />
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Converts all RGB &amp; CMYK objects directly to 1-channel <code>DeviceGray</code> using Ghostscript without rasterizing fonts.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* 4 Studio Profiles */}
                      <div className="grid grid-cols-2 gap-2.5 text-xs">
                        {([
                          { id: 'smooth', title: 'True Photographic Gray', desc: 'Smooth tonal gradients' },
                          { id: 'adaptive_photocopy', title: 'Adaptive Photocopy B&W', desc: 'Sauvola shadow-proof crisp ink' },
                          { id: 'halftone_dither', title: 'Halftone Dither (1-Bit)', desc: 'Best for photos on B&W laser' },
                          { id: 'eco_draft', title: 'Eco Toner Draft', desc: 'Saves ~35% black toner' },
                        ] as const).map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setFilterMode(p.id)}
                            className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                              filterMode === p.id
                                ? 'border-sky-500 bg-[var(--pms-soft-blue)] shadow-xs'
                                : 'border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75'
                            }`}
                          >
                            <div className="font-bold text-slate-900 dark:text-white">{p.title}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{p.desc}</div>
                          </button>
                        ))}
                      </div>

                      {/* RGB Channel Filter + Fine-Tune Sliders */}
                      <div className="p-4 bg-white/80 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] space-y-3.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <Sliders className="w-3.5 h-3.5 text-sky-600" /> Color Channel Filter
                          </span>
                          <select
                            value={channelMix}
                            onChange={(e) => setChannelMix(e.target.value as GrayChannelMix)}
                            className="px-2.5 py-1 rounded-lg border border-[var(--pms-border)] bg-white dark:bg-slate-900 font-semibold text-xs"
                          >
                            <option value="rec709">Standard Luminance (Rec.709)</option>
                            <option value="drop_red">Drop Red Stamps / Grid Lines</option>
                            <option value="boost_blue">Darken Blue Pen Writing</option>
                            <option value="high_green">High-Clarity Green Channel</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="flex justify-between mb-1 font-medium">
                              <span className="flex items-center gap-1"><Contrast className="w-3 h-3" /> Contrast</span>
                              <span className="font-mono font-bold">{contrast > 0 ? `+${contrast}` : contrast}</span>
                            </div>
                            <input type="range" min={-50} max={50} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} className="w-full accent-sky-600" />
                          </div>
                          <div>
                            <div className="flex justify-between mb-1 font-medium">
                              <span className="flex items-center gap-1"><SunMedium className="w-3 h-3" /> Brightness</span>
                              <span className="font-mono font-bold">{brightness > 0 ? `+${brightness}` : brightness}</span>
                            </div>
                            <input type="range" min={-50} max={50} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} className="w-full accent-sky-600" />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between mb-1 font-medium">
                            <span>Shadow Normalization (For Scans)</span>
                            <span className="font-mono font-bold">{shadowRemoval}%</span>
                          </div>
                          <input type="range" min={0} max={100} value={shadowRemoval} onChange={(e) => setShadowRemoval(Number(e.target.value))} className="w-full accent-sky-600" />
                        </div>

                        {(filterMode === 'adaptive_photocopy' || filterMode === 'halftone_dither') && (
                          <div>
                            <div className="flex justify-between mb-1 font-medium">
                              <span>B&amp;W Threshold</span>
                              <span className="font-mono font-bold">{threshold}</span>
                            </div>
                            <input type="range" min={60} max={220} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full accent-sky-600" />
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-[var(--pms-border)]">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Page Range</label>
                            <input
                              type="text"
                              value={pageRangeStr}
                              onChange={(e) => setPageRangeStr(e.target.value)}
                              placeholder={`All (1-${pageCount})`}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--pms-border)] bg-white dark:bg-slate-900 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Export DPI</label>
                            <select
                              value={exportScale}
                              onChange={(e) => setExportScale(Number(e.target.value))}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--pms-border)] bg-white dark:bg-slate-900 text-xs font-semibold"
                            >
                              <option value={1.5}>Fast (110 DPI)</option>
                              <option value={2.0}>Crisp (150 DPI)</option>
                              <option value={2.8}>Ultra Sharp (200 DPI)</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {isProcessing && (
                    <div className="space-y-1.5 p-3.5 bg-white/80 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)]">
                      <div className="flex justify-between text-xs font-semibold">
                        <span>{progressText}</span>
                        <span><AnimatedNumber value={progressPercent} suffix="%" /></span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div className="bg-sky-600 h-2 rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={processGrayscalePdf}
                      disabled={isProcessing || isLoadingPage}
                      className="flex-1 pms-btn-primary py-3.5 px-6 font-bold rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2 text-sm cursor-pointer"
                    >
                      {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Droplet className="w-4 h-4" />}
                      {engine === 'vector_gray' ? 'Generate True Vector Grayscale PDF' : 'Convert & Download Monochrome PDF'}
                    </button>
                    <button
                      type="button"
                      onClick={resetState}
                      disabled={isProcessing}
                      className="px-5 py-3.5 bg-white/80 dark:bg-slate-900 border border-[var(--pms-border)] font-semibold rounded-2xl text-sm cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6 text-center py-4">
                <div className="p-8 bg-white/80 dark:bg-slate-900/75 rounded-3xl border border-emerald-200/80 dark:border-emerald-800/70">
                  <div className="w-16 h-16 bg-[var(--pms-soft-mint)] text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-[var(--pms-border)]">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-2">
                    {usedVectorOutput ? 'True Vector DeviceGray PDF Ready!' : 'Monochrome PDF Created!'}
                  </h3>
                  <p className="text-slate-600 dark:text-slate-300 mb-6 text-sm max-w-md mx-auto">
                    {usedVectorOutput
                      ? '100% vector selectable text preserved in genuine 1-channel DeviceGray (0% color ink).'
                      : `All selected pages transformed with ${filterMode.replace('_', ' ')} profile.`}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <a
                      href={grayscaleUrl}
                      download={`grayscale_${file.name}`}
                      className="pms-btn-primary inline-flex items-center gap-2 px-7 py-3.5 font-bold rounded-2xl text-sm"
                    >
                      <Download className="w-4 h-4" /> Download Grayscale PDF
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        const w = window.open(grayscaleUrl, '_blank');
                        w?.addEventListener('load', () => {
                          try { w.print(); } catch {}
                        });
                      }}
                      className="inline-flex items-center gap-2 px-5 py-3.5 bg-white dark:bg-slate-900 border border-[var(--pms-border)] font-bold rounded-2xl text-sm cursor-pointer"
                    >
                      <Printer className="w-4 h-4 text-sky-600" /> Print
                    </button>
                    <a
                      href={grayscaleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-3.5 bg-white dark:bg-slate-900 border border-[var(--pms-border)] font-semibold rounded-2xl text-sm"
                    >
                      <ExternalLink className="w-4 h-4" /> Open Tab
                    </a>
                    <button
                      type="button"
                      onClick={() => setShowResultPreview(!showResultPreview)}
                      className="inline-flex items-center gap-2 px-5 py-3.5 bg-white dark:bg-slate-900 border border-[var(--pms-border)] font-semibold rounded-2xl text-sm cursor-pointer"
                    >
                      <Eye className="w-4 h-4" /> {showResultPreview ? 'Hide' : 'Preview'}
                    </button>
                  </div>

                  {showResultPreview && (
                    <div className="mt-6 w-full h-[520px] rounded-2xl border border-[var(--pms-border)] overflow-hidden bg-white shadow-inner">
                      <iframe src={grayscaleUrl} title="Grayscale PDF Preview" className="w-full h-full border-0" />
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={resetState}
                  className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold cursor-pointer"
                >
                  ← Convert another document
                </button>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </ToolWorkspaceShell>
  );
}
