import { useState, useEffect, useRef } from 'react';
import { Moon, Download, FileText, CheckCircle2, Sliders, ExternalLink, Eye, Loader2, Sparkles, SunMedium, Shield } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import FileDropzone from '../components/FileDropzone';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

export default function InvertColorsPDF() {
  const prefersReduced = useReducedMotion();

  useSEO(
    'Invert PDF Colors Online Free — Eye Care Dark Mode & OLED Reading | PDF Media Suite',
    'Free online tool to invert PDF colors into dark mode. Includes OLED Pure Dark, Eye-Care Warm Sepia, and Solarized Navy profiles with live preview.'
  );

  usePageSEO(
    'Invert PDF Colors & Dark Mode Converter',
    'Convert bright white PDFs into comfortable dark mode reading documents. Features OLED pitch black, warm sepia, photo preservation, and real-time preview.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [isLoadingPage, setIsLoadingPage] = useState(false);

  // Dark Mode Theme Profiles: 'oled' | 'sepia' | 'solarized' | 'classic'
  const [theme, setTheme] = useState<'oled' | 'sepia' | 'solarized' | 'classic'>('oled');
  const [preservePhotos, setPreservePhotos] = useState(true);
  const [contrast, setContrast] = useState(10); // -30 to +30
  const [brightness, setBrightness] = useState(-5); // -30 to +30

  const [previewTab, setPreviewTab] = useState<'dark' | 'original'>('dark');

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [invertedUrl, setInvertedUrl] = useState<string | null>(null);
  const [showResultPreview, setShowResultPreview] = useState(true);

  useAutoRevokeUrl(invertedUrl);

  // Canvases for preview
  const origCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const filteredCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalImgDataRef = useRef<ImageData | null>(null);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const selectedFile = acceptedFiles[0];
    setFile(selectedFile);
    setInvertedUrl(null);
    setIsLoadingPage(true);

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      setPageCount(pdfjsDoc.numPages);

      // Render page 1 on original canvas
      const page1 = await pdfjsDoc.getPage(1);
      const viewport = page1.getViewport({ scale: 0.55 });

      if (origCanvasRef.current && filteredCanvasRef.current) {
        const origCanvas = origCanvasRef.current;
        origCanvas.width = viewport.width;
        origCanvas.height = viewport.height;
        const ctx = origCanvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, viewport.width, viewport.height);

        await page1.render({ canvasContext: ctx, viewport, canvas: origCanvas } as any).promise;
        originalImgDataRef.current = ctx.getImageData(0, 0, origCanvas.width, origCanvas.height);

        applyDarkModeTransform();
      }
    } catch (err) {
      console.error('Error loading page preview:', err);
    } finally {
      setIsLoadingPage(false);
    }
  };

  // Pixel transformation function
  const transformPixel = (
    r: number,
    g: number,
    b: number,
    th: 'oled' | 'sepia' | 'solarized' | 'classic',
    preserve: boolean,
    cVal: number,
    bVal: number
  ): [number, number, number] => {
    // Check color saturation (is this a photo or colorful graphic vs text/background?)
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const isChromatic = delta > 30; // Color image pixel

    if (preserve && isChromatic) {
      // Keep colorful graphics natural with slightly muted brightness for night reading
      return [
        Math.min(255, Math.max(0, r * 0.9)),
        Math.min(255, Math.max(0, g * 0.9)),
        Math.min(255, Math.max(0, b * 0.9)),
      ];
    }

    // Invert lightness
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    let invLum = 255 - lum;

    // Apply brightness & contrast
    if (bVal !== 0) {
      invLum = Math.min(255, Math.max(0, invLum + bVal));
    }
    if (cVal !== 0) {
      const factor = (259 * (cVal + 255)) / (255 * (259 - cVal));
      invLum = Math.min(255, Math.max(0, factor * (invLum - 128) + 128));
    }

    const t = invLum / 255;

    if (th === 'sepia') {
      // Warm Charcoal (#1a1815 = [26, 24, 21]) to Soft Warm Amber (#f3e7ce = [243, 231, 206])
      const outR = Math.round(26 + t * (243 - 26));
      const outG = Math.round(24 + t * (231 - 24));
      const outB = Math.round(21 + t * (206 - 21));
      return [outR, outG, outB];
    } else if (th === 'solarized') {
      // Midnight Navy (#08182b = [8, 24, 43]) to Soft Cerulean (#a0cfff = [160, 207, 255])
      const outR = Math.round(8 + t * (160 - 8));
      const outG = Math.round(24 + t * (207 - 24));
      const outB = Math.round(43 + t * (255 - 43));
      return [outR, outG, outB];
    } else if (th === 'classic') {
      // Pure mathematical RGB inversion
      let outR = 255 - r;
      let outG = 255 - g;
      let outB = 255 - b;
      return [outR, outG, outB];
    } else {
      // OLED Pitch Black (#0a0a0a = [10, 10, 10]) to Clean Off-White (#f0f0f0 = [240, 240, 240])
      const val = Math.round(10 + t * (240 - 10));
      return [val, val, val];
    }
  };

  const applyDarkModeTransform = () => {
    if (!originalImgDataRef.current || !filteredCanvasRef.current) return;

    const sourceData = originalImgDataRef.current;
    const canvas = filteredCanvasRef.current;
    canvas.width = sourceData.width;
    canvas.height = sourceData.height;
    const ctx = canvas.getContext('2d')!;

    const imgData = ctx.createImageData(sourceData.width, sourceData.height);
    imgData.data.set(sourceData.data);
    const data = imgData.data;

    for (let j = 0; j < data.length; j += 4) {
      const [newR, newG, newB] = transformPixel(
        data[j],
        data[j + 1],
        data[j + 2],
        theme,
        preservePhotos,
        contrast,
        brightness
      );
      data[j] = newR;
      data[j + 1] = newG;
      data[j + 2] = newB;
    }

    ctx.putImageData(imgData, 0, 0);
  };

  useEffect(() => {
    applyDarkModeTransform();
  }, [theme, preservePhotos, contrast, brightness]);

  const processInvertPdf = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProgressPercent(10);
    setProgressText('Extracting document pages for Dark Mode rendering...');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const total = pdfjsDoc.numPages;
      const newPdfDoc = await PDFDocument.create();

      const scale = 1.8; // Sharp reader rendering

      for (let pageNum = 1; pageNum <= total; pageNum++) {
        setProgressText(`Converting page ${pageNum} of ${total} to night mode...`);
        setProgressPercent(Math.round(10 + (pageNum / total) * 80));

        const page = await pdfjsDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        for (let j = 0; j < data.length; j += 4) {
          const [newR, newG, newB] = transformPixel(
            data[j],
            data[j + 1],
            data[j + 2],
            theme,
            preservePhotos,
            contrast,
            brightness
          );
          data[j] = newR;
          data[j + 1] = newG;
          data[j + 2] = newB;
        }

        ctx.putImageData(imgData, 0, 0);

        const imgDataUrl = canvas.toDataURL('image/jpeg', 0.88);
        const imgBytes = dataUrlToBytes(imgDataUrl);
        const embeddedImg = await newPdfDoc.embedJpg(imgBytes);

        const origW = viewport.width / scale;
        const origH = viewport.height / scale;
        const newPage = newPdfDoc.addPage([origW, origH]);
        newPage.drawImage(embeddedImg, {
          x: 0,
          y: 0,
          width: origW,
          height: origH,
        });

        canvas.width = 0;
        canvas.height = 0;
      }

      setProgressPercent(95);
      setProgressText('Finalizing dark mode PDF...');
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
    originalImgDataRef.current = null;
  };

  return (
    <ToolWorkspaceShell
      title="Invert PDF & Dark Mode Creator"
      subtitle="Convert harsh bright PDFs into soothing dark mode documents. Choose from OLED Pitch Dark, Warm Sepia, and Solarized Navy with real-time preview."
      categoryLabel="Eye Care & Night Reader"
      icon={Moon}
      microVariant="generic"
      tone="violet"
    >
      <div className="flex flex-col items-center justify-center max-w-6xl mx-auto w-full">

      {!file ? (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReduced ? 0 : 0.25 }}
          className="w-full max-w-2xl"
        >
          <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF to Convert to Dark Mode" />
        </motion.div>
      ) : (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReduced ? 0 : 0.25 }}
          className="w-full pms-glass-panel rounded-3xl p-6 md:p-8 relative overflow-hidden"
        >
          <PearlScanOverlay
            active={isProcessing}
            label={progressText || 'Generating night reading PDF...'}
          />

          {!invertedUrl ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Live Preview Canvas */}
              <div className="lg:col-span-5 space-y-4">
                <div className="p-4 bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'var(--pms-soft-lavender)', color: 'var(--pms-violet)' }}
                  >
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--pms-ink)] truncate">{file.name}</p>
                    <p className="text-xs text-[var(--pms-muted)]">
                      {(file.size / 1024 / 1024).toFixed(2)} MB • <AnimatedNumber value={pageCount} /> page(s)
                    </p>
                  </div>
                </div>

                {/* View Tabs */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[var(--pms-ink)] uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--pms-violet)' }} /> Page 1 Live Preview
                  </span>
                  <div className="inline-flex rounded-xl bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] p-1 text-xs font-semibold">
                    {([
                      { id: 'dark', label: 'Dark Mode View' },
                      { id: 'original', label: 'Original White' },
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
                              layoutId="invert-preview-tab"
                              transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
                              className="absolute inset-0 rounded-lg border"
                              style={{
                                backgroundColor: 'var(--pms-soft-lavender)',
                                borderColor: 'var(--pms-violet)',
                              }}
                            />
                          )}
                          <span className="relative z-10">{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Canvas Container */}
                <div
                  className={`rounded-2xl border border-[var(--pms-border)] overflow-hidden flex flex-col items-center justify-center min-h-[320px] p-4 relative shadow-inner transition-colors ${
                    previewTab === 'original' ? 'bg-white' : 'bg-slate-950'
                  }`}
                >
                  {isLoadingPage ? (
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--pms-violet)' }} />
                      <span className="text-xs">Rendering night preview...</span>
                    </div>
                  ) : null}

                  <canvas
                    ref={filteredCanvasRef}
                    className={`max-h-[360px] rounded-lg shadow-lg border border-slate-800 object-contain mx-auto transition-opacity ${
                      previewTab === 'dark' && !isLoadingPage ? 'block' : 'hidden'
                    }`}
                  />

                  <canvas
                    ref={origCanvasRef}
                    className={`max-h-[360px] rounded-lg shadow-md border border-slate-200 object-contain mx-auto bg-white transition-opacity ${
                      previewTab === 'original' && !isLoadingPage ? 'block' : 'hidden'
                    }`}
                  />
                </div>
              </div>

              {/* Right Column: Dark Mode Themes & Controls */}
              <div className="lg:col-span-7 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-[var(--pms-ink)] mb-1">Choose Night Theme Profile</h3>
                  <p className="text-xs text-[var(--pms-muted)]">Select the palette best suited for your reading conditions.</p>
                </div>

                {/* Theme Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      id: 'oled',
                      title: 'OLED Pitch Black',
                      desc: 'True #000 background with crisp off-white text. Perfect for OLED screens and dark rooms.',
                      badge: 'Maximum Battery Save',
                    },
                    {
                      id: 'sepia',
                      title: 'Eye-Care Warm Sepia',
                      desc: 'Deep warm charcoal with amber/cream text. Eliminates blue-light glare and eye fatigue.',
                      badge: 'Best For Long Reading',
                    },
                    {
                      id: 'solarized',
                      title: 'Solarized Navy Slate',
                      desc: 'Deep oceanic navy with soft sky blue lettering. Popular among developers and nighttime readers.',
                      badge: 'Modern Slate',
                    },
                    {
                      id: 'classic',
                      title: 'High-Contrast Negative',
                      desc: 'Classic mathematical color invert. Direct 255 - RGB calculation.',
                      badge: 'Inverted Original',
                    },
                  ].map((item) => {
                    const active = theme === item.id;
                    return (
                      <motion.button
                        key={item.id}
                        type="button"
                        whileHover={prefersReduced ? undefined : { y: -2 }}
                        whileTap={prefersReduced ? undefined : { scale: 0.99 }}
                        onClick={() => setTheme(item.id as 'oled' | 'sepia' | 'solarized' | 'classic')}
                        style={{
                          backgroundColor: active ? 'var(--pms-soft-lavender)' : undefined,
                          borderColor: active ? 'var(--pms-violet)' : 'var(--pms-border)',
                        }}
                        className={`relative text-left p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                          active
                            ? 'shadow-sm ring-1 ring-[var(--pms-violet)]'
                            : 'bg-white/75 dark:bg-slate-900/75 hover:bg-white dark:hover:bg-slate-900'
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="invert-theme-pill"
                            transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30 }}
                            className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                            style={{ backgroundColor: 'var(--pms-violet)' }}
                          >
                            Active
                          </motion.span>
                        )}
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-800/80 border border-[var(--pms-border)] text-[var(--pms-ink)] mb-2 inline-block">
                            {item.badge}
                          </span>
                          <h4 className="font-bold text-sm text-[var(--pms-ink)] mb-1">{item.title}</h4>
                          <p className="text-xs text-[var(--pms-muted)] leading-snug">{item.desc}</p>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Smart Features / Photo Preservation Toggle */}
                <div className="p-4 bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] flex items-center justify-between">
                  <div className="pr-4">
                    <h4 className="text-xs font-bold text-[var(--pms-ink)] uppercase tracking-wider flex items-center gap-1.5 mb-0.5">
                      <Shield className="w-3.5 h-3.5 text-emerald-500" /> Preserve Colored Photos & Figures
                    </h4>
                    <p className="text-xs text-[var(--pms-muted)]">
                      Darkens backgrounds and text while keeping photos, figures, and charts in natural color.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={preservePhotos}
                      onChange={(e) => setPreservePhotos(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--pms-violet)]"></div>
                  </label>
                </div>

                {/* Tone Sliders */}
                <div className="p-5 bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] space-y-4">
                  <h4 className="text-xs font-bold text-[var(--pms-ink)] uppercase tracking-wider flex items-center gap-2">
                    <Sliders className="w-3.5 h-3.5" style={{ color: 'var(--pms-violet)' }} /> Text Clarity & Background Depth
                  </h4>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium text-[var(--pms-ink)]">Text Contrast</span>
                      <span className="font-mono font-bold" style={{ color: 'var(--pms-violet)' }}>
                        {contrast > 0 ? `+${contrast}` : contrast}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-30}
                      max={30}
                      value={contrast}
                      onChange={(e) => setContrast(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg accent-[var(--pms-violet)]"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium text-[var(--pms-ink)] flex items-center gap-1.5">
                        <SunMedium className="w-3.5 h-3.5 text-[var(--pms-muted)]" /> Background Dimming
                      </span>
                      <span className="font-mono font-bold" style={{ color: 'var(--pms-violet)' }}>
                        {brightness > 0 ? `+${brightness}` : brightness}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-30}
                      max={30}
                      value={brightness}
                      onChange={(e) => setBrightness(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg accent-[var(--pms-violet)]"
                    />
                  </div>
                </div>

                {/* Progress Bar */}
                {isProcessing && (
                  <div className="space-y-2 p-4 bg-white/80 dark:bg-slate-900/85 text-[var(--pms-ink)] rounded-2xl border border-[var(--pms-border)]">
                    <div className="flex justify-between text-xs font-semibold">
                      <span>{progressText}</span>
                      <AnimatedNumber value={progressPercent} suffix="%" className="font-mono font-bold" />
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                      <motion.div
                        className="h-2 rounded-full"
                        style={{ backgroundColor: 'var(--pms-violet)' }}
                        initial={false}
                        animate={{ width: `${progressPercent}%` }}
                        transition={prefersReduced ? { duration: 0 } : { duration: 0.25 }}
                      />
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <motion.button
                    type="button"
                    whileHover={prefersReduced ? undefined : { scale: 1.01 }}
                    whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                    onClick={processInvertPdf}
                    disabled={isProcessing || isLoadingPage}
                    className="pms-btn-primary flex-1 py-4 rounded-2xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 text-base"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Generating Dark Mode PDF...
                      </>
                    ) : (
                      <>
                        <Moon className="w-5 h-5" />
                        Convert & Download Dark PDF
                      </>
                    )}
                  </motion.button>
                  <button
                    type="button"
                    onClick={resetState}
                    disabled={isProcessing}
                    className="px-6 py-4 bg-white/75 dark:bg-slate-900/75 hover:bg-white dark:hover:bg-slate-800 text-[var(--pms-ink)] border border-[var(--pms-border)] font-semibold rounded-2xl transition-all text-sm disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Success Screen with Live Preview */
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: prefersReduced ? 0 : 0.25 }}
              className="space-y-6 text-center py-4"
            >
              <div
                className="p-8 rounded-3xl border"
                style={{
                  backgroundColor: 'var(--pms-soft-mint)',
                  borderColor: 'var(--pms-border)',
                }}
              >
                <div className="w-16 h-16 bg-white/80 dark:bg-slate-900/80 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-[var(--pms-border)] flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-2xl md:text-3xl font-extrabold text-[var(--pms-ink)] mb-2">
                  Dark Mode PDF Created Successfully!
                </h3>
                <p className="text-[var(--pms-muted)] mb-6 text-sm max-w-md mx-auto">
                  All <AnimatedNumber value={pageCount} /> page(s) have been transformed with your selected night reading profile.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <motion.a
                    whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                    whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                    href={invertedUrl}
                    download={`darkmode_${file.name}`}
                    className="pms-btn-primary inline-flex items-center justify-center gap-2 px-8 py-3.5 font-bold rounded-2xl text-base"
                  >
                    <Download className="w-5 h-5" />
                    Download Dark Mode PDF
                  </motion.a>
                  <a
                    href={invertedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white/75 dark:bg-slate-900/75 hover:bg-white dark:hover:bg-slate-900 text-[var(--pms-ink)] font-semibold rounded-2xl border border-[var(--pms-border)] transition-all text-sm shadow-xs"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open in New Tab
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowResultPreview(!showResultPreview)}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white/75 dark:bg-slate-900/75 hover:bg-white dark:hover:bg-slate-900 text-[var(--pms-ink)] font-semibold rounded-2xl border border-[var(--pms-border)] transition-all text-sm shadow-xs"
                  >
                    <Eye className="w-4 h-4" />
                    {showResultPreview ? 'Hide Preview' : 'Show Live Preview'}
                  </button>
                </div>

                {showResultPreview && (
                  <div className="mt-6 text-left">
                    <p className="text-xs font-semibold text-[var(--pms-muted)] uppercase tracking-wider mb-2">
                      Dark Mode PDF Output Preview
                    </p>
                    <div className="w-full h-[550px] rounded-2xl border border-[var(--pms-border)] overflow-hidden bg-white dark:bg-slate-950 shadow-inner">
                      <iframe
                        src={invertedUrl}
                        title="Dark Mode PDF Preview"
                        className="w-full h-full border-0"
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={resetState}
                className="text-sm text-[var(--pms-muted)] hover:text-[var(--pms-ink)] font-semibold transition-colors"
              >
                ← Convert another document
              </button>
            </motion.div>
          )}
        </motion.div>
      )}
      </div>
    </ToolWorkspaceShell>
  );
}
