import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Moon,
  Download,
  FileText,
  CheckCircle2,
  Sliders,
  ExternalLink,
  Eye,
  Loader2,
  SunMedium,
  Shield,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import FileDropzone from '../components/FileDropzone';
import BeforeAfterSlider from '../components/BeforeAfterSlider';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import { clampPdfScale, releaseCanvas } from '../lib/safeCanvas';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';
import {
  type DarkModeTheme,
  applyDarkModeToImageData,
  parsePageRange,
} from '../lib/documentCleanerEngine';

const DARK_THEMES: Array<{ id: DarkModeTheme; title: string; desc: string; badge: string }> = [
  {
    id: 'smart_oled',
    title: 'Smart Hue OLED ★',
    desc: 'Inverts paper to OLED black while keeping blue links, red notes & colored headings natural.',
    badge: 'Hue-Preserving',
  },
  {
    id: 'pure_oled',
    title: 'Pure OLED Monochrome',
    desc: 'Pitch-black background with crisp soft-white text. Maximum OLED battery savings.',
    badge: 'Zero Glare',
  },
  {
    id: 'sepia',
    title: 'Eye-Care Warm Sepia',
    desc: 'Deep warm charcoal with amber/cream text. Blocks blue light for late-night reading.',
    badge: 'Long Study',
  },
  {
    id: 'solarized',
    title: 'Solarized Navy Slate',
    desc: 'Oceanic midnight navy with soothing sky lettering. Beloved by coders & readers.',
    badge: 'Developer Dark',
  },
  {
    id: 'emerald_night',
    title: 'Emerald Kindle Night',
    desc: 'Soft forest-slate paper with mint-cream ink for ultra-low eye strain.',
    badge: 'E-Ink Comfort',
  },
  {
    id: 'high_contrast',
    title: 'Accessibility Yellow/Black',
    desc: 'Maximum visibility yellow lettering on pitch black for low-vision reading.',
    badge: 'High Contrast',
  },
  {
    id: 'classic',
    title: 'Classic RGB Negative',
    desc: 'Direct 255 - RGB mathematical color inversion.',
    badge: 'Raw Invert',
  },
];

export default function InvertColorsPDF() {
  const prefersReduced = useReducedMotion();

  useSEO(
    'Invert PDF Colors & Smart Hue Dark Mode Creator | PDF Media Suite',
    'Convert bright white PDFs into Hue-Preserving Smart OLED Dark Mode, Warm Sepia, Solarized Navy, or High-Contrast Yellow/Black with block-aware photo protection.'
  );

  usePageSEO(
    'Invert PDF Colors & Smart Dark Mode Converter',
    'Hue-preserving dark mode keeps blue links, syntax highlighting, and photos natural while turning bright white pages into eye-safe OLED black or warm sepia.',
    'invert pdf colors, dark mode pdf converter, hue preserving pdf dark mode, oled black pdf reader, sepia pdf eye care',
    '/invert-colors'
  );

  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [previewPageNum, setPreviewPageNum] = useState(1);
  const [isLoadingPage, setIsLoadingPage] = useState(false);

  const [theme, setTheme] = useState<DarkModeTheme>('smart_oled');
  const [preservePhotos, setPreservePhotos] = useState(true);
  const [contrast, setContrast] = useState(8);
  const [brightness, setBrightness] = useState(-4);
  const [pageRangeStr, setPageRangeStr] = useState('');
  const [exportScale, setExportScale] = useState(2.0);

  const [previewBeforeUrl, setPreviewBeforeUrl] = useState<string | null>(null);
  const [previewAfterUrl, setPreviewAfterUrl] = useState<string | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [invertedUrl, setInvertedUrl] = useState<string | null>(null);
  const [showResultPreview, setShowResultPreview] = useState(true);

  useAutoRevokeUrl(invertedUrl);

  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const originalImgDataRef = useRef<ImageData | null>(null);

  const renderPreviewPage = useCallback(async (pageNum: number) => {
    const pdf = pdfDocRef.current;
    if (!pdf) return;
    setIsLoadingPage(true);
    try {
      const page = await pdf.getPage(pageNum);
      const baseVp = page.getViewport({ scale: 1.0 });
      const safeScale = clampPdfScale(baseVp.width, baseVp.height, 1.2);
      const vp = page.getViewport({ scale: safeScale });
      const canvas = document.createElement('canvas');
      try {
        canvas.width = Math.max(1, Math.round(vp.width));
        canvas.height = Math.max(1, Math.round(vp.height));
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;

        originalImgDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setPreviewBeforeUrl(canvas.toDataURL('image/jpeg', 0.86));
      } finally {
        releaseCanvas(canvas);
        page.cleanup();
      }
    } catch (err) {
      console.error('[InvertColorsPDF] Preview error:', err);
    } finally {
      setIsLoadingPage(false);
    }
  }, []);

  useEffect(() => {
    const src = originalImgDataRef.current;
    if (!src) return;
    const t = setTimeout(() => {
      const out = applyDarkModeToImageData(src, { theme, preservePhotos, contrast, brightness });
      const c = document.createElement('canvas');
      try {
        c.width = out.width;
        c.height = out.height;
        c.getContext('2d')!.putImageData(out, 0, 0);
        setPreviewAfterUrl(c.toDataURL('image/jpeg', 0.9));
      } finally {
        releaseCanvas(c);
      }
    }, 45);
    return () => clearTimeout(t);
  }, [previewBeforeUrl, theme, preservePhotos, contrast, brightness]);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const selectedFile = acceptedFiles[0];
    setFile(selectedFile);
    setInvertedUrl(null);
    setPageRangeStr('');
    setIsLoadingPage(true);

    try {
      const ab = await selectedFile.arrayBuffer();
      const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
      pdfDocRef.current = pdfjsDoc;
      setPageCount(pdfjsDoc.numPages);
      setPreviewPageNum(1);
      await renderPreviewPage(1);
    } catch (err) {
      console.error('Error loading PDF:', err);
      alert('Could not open PDF. Please check that it is not encrypted.');
      setFile(null);
    } finally {
      setIsLoadingPage(false);
    }
  };

  const processInvertPdf = async () => {
    if (!file) return;
    setIsProcessing(true);
    setProgressPercent(10);
    setProgressText('Preparing Smart Dark Mode renderer...');

    try {
      const pdfjsDoc =
        pdfDocRef.current ||
        (await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise);
      const targetPages = parsePageRange(pageRangeStr, pdfjsDoc.numPages);
      const newPdfDoc = await PDFDocument.create();

      for (let i = 0; i < targetPages.length; i++) {
        const pNum = targetPages[i];
        setProgressText(`Converting page ${pNum} (${i + 1}/${targetPages.length})...`);
        setProgressPercent(Math.round(10 + ((i + 1) / targetPages.length) * 82));

        const page = await pdfjsDoc.getPage(pNum);
        const baseVp = page.getViewport({ scale: 1.0 });
        const safeScale = clampPdfScale(baseVp.width, baseVp.height, exportScale);
        const vp = page.getViewport({ scale: safeScale });
        const canvas = document.createElement('canvas');
        try {
          canvas.width = Math.max(1, Math.round(vp.width));
          canvas.height = Math.max(1, Math.round(vp.height));
          const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;

          const srcData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const outData = applyDarkModeToImageData(srcData, { theme, preservePhotos, contrast, brightness });
          ctx.putImageData(outData, 0, 0);

          const imgBytes = dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.9));
          const embeddedImg = await newPdfDoc.embedJpg(imgBytes);
          const origW = baseVp.width;
          const origH = baseVp.height;
          const newPage = newPdfDoc.addPage([origW, origH]);
          newPage.drawImage(embeddedImg, { x: 0, y: 0, width: origW, height: origH });
        } finally {
          releaseCanvas(canvas);
          page.cleanup();
        }
        if (i % 2 === 1) await new Promise((r) => setTimeout(r, 0));
      }

      setProgressPercent(96);
      setProgressText('Finalizing Dark Mode PDF...');
      const pdfBytes = await newPdfDoc.save();
      const blob = new Blob([toArrayBufferBytes(pdfBytes)], { type: 'application/pdf' });
      setInvertedUrl(URL.createObjectURL(blob));
      setProgressPercent(100);
      setProgressText('Done!');
    } catch (err) {
      console.error('Error creating dark mode PDF:', err);
      alert('An error occurred during inversion. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setInvertedUrl(null);
    setPageCount(0);
    setPreviewBeforeUrl(null);
    setPreviewAfterUrl(null);
    pdfDocRef.current = null;
    originalImgDataRef.current = null;
  };

  return (
    <ToolWorkspaceShell
      title="Invert PDF & Smart Dark Mode Pro"
      subtitle="Hue-preserving OLED Dark Mode keeps blue headings, red annotations, and photos looking natural while turning harsh white PDFs into soothing night-reading documents."
      categoryLabel="Eye Care & Night Reader"
      icon={Moon}
      microVariant="generic"
      tone="violet"
      trustNote="Hue-preserving HSL inversion · Block-aware photo protection · Browser-only"
    >
      <div className="flex flex-col items-center justify-center max-w-7xl mx-auto w-full">
        {!file ? (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-2xl"
          >
            <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF to Convert to Dark Mode" />
          </motion.div>
        ) : (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full pms-glass-panel rounded-3xl p-5 md:p-7 relative overflow-hidden"
          >
            <PearlScanOverlay
              active={isProcessing || isLoadingPage}
              label={isLoadingPage ? 'Rendering night preview...' : progressText || 'Generating dark mode PDF...'}
            />

            {!invertedUrl ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Split Preview (6 cols) */}
                <div className="lg:col-span-6 space-y-4">
                  <div className="p-3.5 bg-white/80 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: 'var(--pms-soft-lavender)', color: 'var(--pms-violet)' }}
                      >
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[var(--pms-ink)] truncate">{file.name}</p>
                        <p className="text-xs text-[var(--pms-muted)]">
                          {(file.size / 1024 / 1024).toFixed(2)} MB · <AnimatedNumber value={pageCount} /> page(s)
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
                            void renderPreviewPage(n);
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
                            void renderPreviewPage(n);
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
                      beforeLabel="Original White"
                      afterLabel="Dark Mode"
                      maxHeightClass="max-h-[520px]"
                      darkSurface
                    />
                  ) : (
                    <div className="h-80 rounded-2xl bg-slate-950 border border-[var(--pms-border)] flex items-center justify-center text-xs text-slate-400">
                      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Rendering preview...
                    </div>
                  )}
                </div>

                {/* Right Theme & Controls (6 cols) */}
                <div className="lg:col-span-6 space-y-5">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--pms-ink)] uppercase tracking-wider mb-2">
                      Choose Night Theme Profile
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {DARK_THEMES.map((item) => {
                        const active = theme === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setTheme(item.id)}
                            style={{
                              backgroundColor: active ? 'var(--pms-soft-lavender)' : undefined,
                              borderColor: active ? 'var(--pms-violet)' : 'var(--pms-border)',
                            }}
                            className={`text-left p-3 rounded-2xl border transition cursor-pointer ${
                              active ? 'shadow-xs ring-1 ring-[var(--pms-violet)]' : 'bg-white/75 dark:bg-slate-900/75'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <span className="font-bold text-xs text-[var(--pms-ink)]">{item.title}</span>
                              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-white/80 dark:bg-slate-800 border border-[var(--pms-border)]">
                                {item.badge}
                              </span>
                            </div>
                            <p className="text-[11px] text-[var(--pms-muted)] leading-snug">{item.desc}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Block-Aware Photo Protection */}
                  <label className="p-3.5 bg-white/80 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] flex items-center justify-between gap-3 cursor-pointer">
                    <div>
                      <h4 className="text-xs font-bold text-[var(--pms-ink)] flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-emerald-500" /> Block-Aware Photo &amp; Figure Protection
                      </h4>
                      <p className="text-[11px] text-[var(--pms-muted)] mt-0.5">
                        Detects photo blocks cleanly so diagrams &amp; faces stay natural without pixelated edge halos.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={preservePhotos}
                      onChange={(e) => setPreservePhotos(e.target.checked)}
                      className="w-4 h-4 accent-violet-600 shrink-0"
                    />
                  </label>

                  {/* Tone + Page Range + DPI */}
                  <div className="p-4 bg-white/80 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] space-y-3 text-xs">
                    <div className="font-bold uppercase tracking-wider text-[11px] text-[var(--pms-muted)] flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-violet-600" /> Clarity &amp; Output Options
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="flex justify-between mb-1 font-medium">
                          <span>Text Contrast</span>
                          <span className="font-mono font-bold text-violet-600">{contrast > 0 ? `+${contrast}` : contrast}</span>
                        </div>
                        <input type="range" min={-30} max={30} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} className="w-full accent-violet-600" />
                      </div>
                      <div>
                        <div className="flex justify-between mb-1 font-medium">
                          <span className="flex items-center gap-1"><SunMedium className="w-3 h-3" /> Dimming</span>
                          <span className="font-mono font-bold text-violet-600">{brightness > 0 ? `+${brightness}` : brightness}</span>
                        </div>
                        <input type="range" min={-30} max={30} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} className="w-full accent-violet-600" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-[var(--pms-border)]">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-[var(--pms-muted)] mb-1">Page Range</label>
                        <input
                          type="text"
                          value={pageRangeStr}
                          onChange={(e) => setPageRangeStr(e.target.value)}
                          placeholder={`All (1-${pageCount})`}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--pms-border)] bg-white dark:bg-slate-900 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-[var(--pms-muted)] mb-1">Sharpness</label>
                        <select
                          value={exportScale}
                          onChange={(e) => setExportScale(Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--pms-border)] bg-white dark:bg-slate-900 text-xs font-semibold"
                        >
                          <option value={1.5}>Compact Reader (110 DPI)</option>
                          <option value={2.0}>Crisp Retina (150 DPI)</option>
                          <option value={2.6}>Ultra Sharp (190 DPI)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {isProcessing && (
                    <div className="space-y-1.5 p-3.5 bg-white/80 dark:bg-slate-900/80 rounded-2xl border border-[var(--pms-border)]">
                      <div className="flex justify-between text-xs font-semibold">
                        <span>{progressText}</span>
                        <span className="font-mono font-bold">{progressPercent}%</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div className="h-2 rounded-full bg-violet-600 transition-all" style={{ width: `${progressPercent}%` }} />
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={processInvertPdf}
                      disabled={isProcessing || isLoadingPage}
                      className="pms-btn-primary flex-1 py-3.5 rounded-2xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 text-sm cursor-pointer"
                    >
                      {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Moon className="w-4 h-4" />}
                      Convert &amp; Download Dark Mode PDF
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
                <div
                  className="p-8 rounded-3xl border border-[var(--pms-border)]"
                  style={{ backgroundColor: 'var(--pms-soft-mint)' }}
                >
                  <div className="w-16 h-16 bg-white/85 dark:bg-slate-900 text-emerald-600 rounded-2xl border border-[var(--pms-border)] flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-extrabold text-[var(--pms-ink)] mb-2">
                    Dark Mode PDF Ready!
                  </h3>
                  <p className="text-[var(--pms-muted)] mb-6 text-sm max-w-md mx-auto">
                    Converted cleanly with <strong>{DARK_THEMES.find((t) => t.id === theme)?.title}</strong> profile.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <a
                      href={invertedUrl}
                      download={`darkmode_${file.name}`}
                      className="pms-btn-primary inline-flex items-center gap-2 px-7 py-3.5 font-bold rounded-2xl text-sm"
                    >
                      <Download className="w-4 h-4" /> Download Dark Mode PDF
                    </a>
                    <a
                      href={invertedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-3.5 bg-white dark:bg-slate-900 font-semibold rounded-2xl border border-[var(--pms-border)] text-sm"
                    >
                      <ExternalLink className="w-4 h-4" /> Open in Tab
                    </a>
                    <button
                      type="button"
                      onClick={() => setShowResultPreview(!showResultPreview)}
                      className="inline-flex items-center gap-2 px-5 py-3.5 bg-white dark:bg-slate-900 font-semibold rounded-2xl border border-[var(--pms-border)] text-sm cursor-pointer"
                    >
                      <Eye className="w-4 h-4" /> {showResultPreview ? 'Hide Preview' : 'Show Preview'}
                    </button>
                  </div>

                  {showResultPreview && (
                    <div className="mt-6 w-full h-[520px] rounded-2xl border border-[var(--pms-border)] overflow-hidden bg-slate-950 shadow-inner">
                      <iframe src={invertedUrl} title="Dark Mode PDF Preview" className="w-full h-full border-0" />
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={resetState}
                  className="text-sm text-[var(--pms-muted)] hover:text-[var(--pms-ink)] font-semibold cursor-pointer"
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
