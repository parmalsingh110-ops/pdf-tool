import { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Droplet, Download, FileText, CheckCircle2, Sliders, ExternalLink, Eye, Loader2, SunMedium, Contrast } from 'lucide-react';
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

export default function GrayscalePDF() {
  useSEO(
    'Convert PDF to Grayscale Online Free — Black & White Photocopy Mode | PDF Media Suite',
    'Free online tool to convert color PDFs into grayscale or high-contrast photocopy black & white. Live preview, contrast & brightness adjustment, ink saver mode.'
  );

  usePageSEO(
    'Convert PDF to Grayscale & Monochrome',
    'Convert color PDFs to clean grayscale or high-contrast black & white with real-time preview. Adjust brightness, contrast, and threshold for printing.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [isLoadingPage, setIsLoadingPage] = useState(false);

  // Filter Modes: 'smooth' (true grayscale) | 'photocopy' (pure B&W threshold) | 'inkSaver'
  const [filterMode, setFilterMode] = useState<'smooth' | 'photocopy' | 'inkSaver'>('smooth');
  const [contrast, setContrast] = useState(0); // -50 to 50
  const [brightness, setBrightness] = useState(0); // -50 to 50
  const [threshold, setThreshold] = useState(135); // 50 to 220 (for photocopy mode)

  const [previewTab, setPreviewTab] = useState<'filtered' | 'original'>('filtered');

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [grayscaleUrl, setGrayscaleUrl] = useState<string | null>(null);
  const [showResultPreview, setShowResultPreview] = useState(true);

  useAutoRevokeUrl(grayscaleUrl);

  // Preview canvases
  const origCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const filteredCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalImgDataRef = useRef<ImageData | null>(null);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const selectedFile = acceptedFiles[0];
    setFile(selectedFile);
    setGrayscaleUrl(null);
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

        // Apply initial filter
        applyFilterToPreview();
      }
    } catch (err) {
      console.error('Error loading page preview:', err);
    } finally {
      setIsLoadingPage(false);
    }
  };

  // Re-apply filter onto the preview canvas
  const applyFilterToPreview = () => {
    if (!originalImgDataRef.current || !filteredCanvasRef.current) return;

    const sourceData = originalImgDataRef.current;
    const canvas = filteredCanvasRef.current;
    canvas.width = sourceData.width;
    canvas.height = sourceData.height;
    const ctx = canvas.getContext('2d')!;

    // Create copy of original ImageData
    const imgData = ctx.createImageData(sourceData.width, sourceData.height);
    imgData.data.set(sourceData.data);
    const data = imgData.data;

    const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    for (let j = 0; j < data.length; j += 4) {
      let r = data[j];
      let g = data[j + 1];
      let b = data[j + 2];

      // 1. Brightness
      if (brightness !== 0) {
        r = Math.min(255, Math.max(0, r + brightness));
        g = Math.min(255, Math.max(0, g + brightness));
        b = Math.min(255, Math.max(0, b + brightness));
      }

      // 2. Standard Luminance
      let gray = 0.299 * r + 0.587 * g + 0.114 * b;

      // 3. Contrast adjustment
      if (contrast !== 0) {
        gray = Math.min(255, Math.max(0, contrastFactor * (gray - 128) + 128));
      }

      // 4. Mode specific transform
      if (filterMode === 'photocopy') {
        // Strict B&W threshold
        const finalVal = gray < threshold ? 0 : 255;
        data[j] = data[j + 1] = data[j + 2] = finalVal;
      } else if (filterMode === 'inkSaver') {
        // Lighten dark tones by 25% to save ink
        const lightened = gray < 200 ? Math.min(245, gray * 1.25 + 20) : gray;
        data[j] = data[j + 1] = data[j + 2] = lightened;
      } else {
        // Smooth Grayscale
        data[j] = data[j + 1] = data[j + 2] = gray;
      }
    }

    ctx.putImageData(imgData, 0, 0);
  };

  useEffect(() => {
    applyFilterToPreview();
  }, [filterMode, contrast, brightness, threshold]);

  const processGrayscalePdf = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProgressPercent(10);
    setProgressText('Reading document pages...');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const total = pdfjsDoc.numPages;
      const newPdfDoc = await PDFDocument.create();

      const scale = 1.8; // Crisp resolution for export
      const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

      for (let pageNum = 1; pageNum <= total; pageNum++) {
        setProgressText(`Converting page ${pageNum} of ${total} to monochrome...`);
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
          let r = data[j];
          let g = data[j + 1];
          let b = data[j + 2];

          if (brightness !== 0) {
            r = Math.min(255, Math.max(0, r + brightness));
            g = Math.min(255, Math.max(0, g + brightness));
            b = Math.min(255, Math.max(0, b + brightness));
          }

          let gray = 0.299 * r + 0.587 * g + 0.114 * b;

          if (contrast !== 0) {
            gray = Math.min(255, Math.max(0, contrastFactor * (gray - 128) + 128));
          }

          if (filterMode === 'photocopy') {
            const finalVal = gray < threshold ? 0 : 255;
            data[j] = data[j + 1] = data[j + 2] = finalVal;
          } else if (filterMode === 'inkSaver') {
            const lightened = gray < 200 ? Math.min(245, gray * 1.25 + 20) : gray;
            data[j] = data[j + 1] = data[j + 2] = lightened;
          } else {
            data[j] = data[j + 1] = data[j + 2] = gray;
          }
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
    setProgressText('');
    setProgressPercent(0);
    originalImgDataRef.current = null;
  };

  const prefersReduced = useReducedMotion();

  return (
    <ToolWorkspaceShell
      title="Convert PDF to Grayscale & B&W"
      subtitle="Transform color documents into smooth grayscale or high-contrast photocopy black & white with live preview and custom tone tuning."
      categoryLabel="Monochrome & Print Optimizer"
      icon={Droplet}
      microVariant="convert"
      tone="sky"
    >
      <div className="flex flex-col items-center justify-center max-w-6xl mx-auto w-full">

      {!file ? (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReduced ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-2xl"
        >
          <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF to Convert to Grayscale" />
        </motion.div>
      ) : (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReduced ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full pms-glass-panel rounded-3xl p-6 md:p-8 overflow-hidden"
        >
          <PearlScanOverlay
            active={isProcessing || isLoadingPage}
            label={isLoadingPage ? 'Rendering page preview…' : progressText || 'Converting pages to monochrome…'}
          />
          {!grayscaleUrl ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Live Canvas Preview */}
              <div className="lg:col-span-5 space-y-4">
                <div className="p-4 bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] flex items-center gap-4">
                  <div className="w-12 h-12 bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] rounded-xl flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{file.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {(file.size / 1024 / 1024).toFixed(2)} MB • {pageCount} page(s)
                    </p>
                  </div>
                </div>

                {/* Preview View Tabs */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Page 1 Real-Time Preview
                  </span>
                  <div className="inline-flex rounded-xl bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] p-1 text-xs font-semibold">
                    {([
                      { id: 'filtered', label: 'Grayscale View' },
                      { id: 'original', label: 'Original Color' },
                    ] as const).map((tab) => {
                      const active = previewTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setPreviewTab(tab.id)}
                          className={`relative px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                            active
                              ? 'text-slate-900 dark:text-white'
                              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="grayscale-preview-tab"
                              transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
                              className="absolute inset-0 rounded-lg border"
                              style={{ backgroundColor: 'var(--pms-soft-blue)', borderColor: 'var(--pms-blue)' }}
                            />
                          )}
                          <span className="relative z-10">{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Canvas Display Container */}
                <div className="rounded-2xl border border-[var(--pms-border)] overflow-hidden bg-white/75 dark:bg-slate-900/75 flex flex-col items-center justify-center min-h-[320px] p-4 relative shadow-inner">
                  {isLoadingPage ? (
                    <div className="flex flex-col items-center gap-2 text-slate-500 dark:text-slate-400">
                      <Loader2 className="w-6 h-6 animate-spin text-[var(--pms-blue)]" />
                      <span className="text-xs font-medium">Rendering preview...</span>
                    </div>
                  ) : null}

                  {/* Filtered Canvas */}
                  <canvas
                    ref={filteredCanvasRef}
                    className={`max-h-[360px] rounded-lg shadow-md border border-slate-200 bg-white object-contain mx-auto transition-opacity ${
                      previewTab === 'filtered' && !isLoadingPage ? 'block' : 'hidden'
                    }`}
                  />

                  {/* Original Canvas */}
                  <canvas
                    ref={origCanvasRef}
                    className={`max-h-[360px] rounded-lg shadow-md border border-slate-200 bg-white object-contain mx-auto transition-opacity ${
                      previewTab === 'original' && !isLoadingPage ? 'block' : 'hidden'
                    }`}
                  />
                </div>
              </div>

              {/* Right Column: Settings & Filter Profiles */}
              <div className="lg:col-span-7 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Select Monochrome Profile</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Choose the optimal rendering method for your document type.</p>
                </div>

                {/* Profile Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'smooth',
                      title: 'True Grayscale',
                      desc: 'Smooth photographic tones. Retains gradients & subtle shades.',
                      badge: 'Standard',
                    },
                    {
                      id: 'photocopy',
                      title: 'Photocopy B&W',
                      desc: 'Strict black & white threshold. Cleans background, darkens faint text.',
                      badge: 'Scanned Forms',
                    },
                    {
                      id: 'inkSaver',
                      title: 'Ink-Saver Draft',
                      desc: 'Lightens heavy shadows to save up to 35% printer toner/ink.',
                      badge: 'Eco Print',
                    },
                  ].map((p) => {
                    const isSelected = filterMode === p.id;
                    return (
                      <motion.button
                        key={p.id}
                        type="button"
                        whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                        onClick={() => setFilterMode(p.id as any)}
                        className={`relative text-left p-4 rounded-2xl border transition-colors flex flex-col justify-between cursor-pointer overflow-hidden ${
                          isSelected
                            ? ''
                            : 'bg-white/75 dark:bg-slate-900/75 hover:bg-white dark:hover:bg-slate-900'
                        }`}
                        style={{
                          borderColor: isSelected ? 'var(--pms-blue)' : 'var(--pms-border)',
                          backgroundColor: isSelected ? 'var(--pms-soft-blue)' : undefined,
                        }}
                      >
                        {isSelected && (
                          <motion.div
                            layoutId="grayscale-profile-pill"
                            transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
                            className="absolute inset-0 rounded-2xl ring-2 ring-sky-500/35 pointer-events-none"
                          />
                        )}
                        <div className="relative z-10">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border border-[var(--pms-border)] mb-2 inline-block">
                            {p.badge}
                          </span>
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white mb-1">{p.title}</h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">{p.desc}</p>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Fine-Tuning Sliders */}
                <div className="p-5 bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] space-y-4">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Sliders className="w-3.5 h-3.5 text-[var(--pms-blue)]" /> Tone & Contrast Adjustments
                  </h4>

                  {/* Contrast */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Contrast className="w-3.5 h-3.5 text-slate-500" /> Contrast
                      </span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {contrast > 0 ? `+${contrast}` : contrast}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-50}
                      max={50}
                      value={contrast}
                      onChange={(e) => setContrast(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg accent-sky-600 cursor-pointer"
                    />
                  </div>

                  {/* Brightness */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <SunMedium className="w-3.5 h-3.5 text-slate-500" /> Brightness
                      </span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {brightness > 0 ? `+${brightness}` : brightness}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-50}
                      max={50}
                      value={brightness}
                      onChange={(e) => setBrightness(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg accent-sky-600 cursor-pointer"
                    />
                  </div>

                  {/* Photocopy Threshold (only if Photocopy mode) */}
                  {filterMode === 'photocopy' && (
                    <div className="pt-2 border-t border-[var(--pms-border)]">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          B&W Cutoff Threshold
                        </span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                          {threshold}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={60}
                        max={210}
                        value={threshold}
                        onChange={(e) => setThreshold(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg accent-sky-600 cursor-pointer"
                      />
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        Lower = lighter document; Higher = darker lines & text
                      </p>
                    </div>
                  )}
                </div>

                {/* Progress Bar (when converting) */}
                {isProcessing && (
                  <div className="space-y-2 p-4 bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)]">
                    <div className="flex justify-between text-xs font-semibold text-slate-900 dark:text-slate-100">
                      <span>{progressText}</span>
                      <span><AnimatedNumber value={progressPercent} suffix="%" /></span>
                    </div>
                    <div className="w-full bg-slate-200/80 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                      <motion.div
                        initial={prefersReduced ? false : { width: '10%' }}
                        animate={{ width: `${progressPercent}%` }}
                        transition={prefersReduced ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        className="bg-gradient-to-r from-sky-500 via-violet-500 to-rose-500 h-2 rounded-full"
                      />
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <motion.button
                    type="button"
                    whileHover={prefersReduced || isProcessing || isLoadingPage ? undefined : { scale: 1.01 }}
                    whileTap={prefersReduced || isProcessing || isLoadingPage ? undefined : { scale: 0.985 }}
                    onClick={processGrayscalePdf}
                    disabled={isProcessing || isLoadingPage}
                    className="flex-1 pms-btn-primary py-4 px-6 font-bold rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2 text-base cursor-pointer"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Converting to Monochrome...
                      </>
                    ) : (
                      <>
                        <Droplet className="w-5 h-5" />
                        Convert & Download PDF
                      </>
                    )}
                  </motion.button>
                  <button
                    type="button"
                    onClick={resetState}
                    disabled={isProcessing}
                    className="px-6 py-4 bg-white/75 dark:bg-slate-900/75 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-2xl border border-[var(--pms-border)] transition-colors text-sm disabled:opacity-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Success Screen with Live Preview */
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={prefersReduced ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-6 text-center py-4"
            >
              <div className="p-8 bg-white/75 dark:bg-slate-900/75 rounded-3xl border border-emerald-200/80 dark:border-emerald-800/70">
                <motion.div
                  initial={prefersReduced ? false : { scale: 0.45, rotate: -10, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 360, damping: 18 }}
                  className="w-16 h-16 bg-[var(--pms-soft-mint)] text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner border border-[var(--pms-border)]"
                >
                  <CheckCircle2 className="w-8 h-8" />
                </motion.div>
                <h3 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white mb-2">
                  PDF Converted to Grayscale!
                </h3>
                <p className="text-slate-600 dark:text-slate-300 mb-6 text-sm max-w-md mx-auto">
                  All <strong className="font-bold text-emerald-700 dark:text-emerald-400"><AnimatedNumber value={pageCount} /></strong> page(s) have been transformed with your selected tone balance. Ready for printing or archiving.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <motion.a
                    whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                    whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                    href={grayscaleUrl}
                    download={`grayscale_${file.name}`}
                    className="pms-btn-primary inline-flex items-center justify-center gap-2 px-8 py-3.5 font-bold rounded-2xl text-base"
                  >
                    <Download className="w-5 h-5" />
                    Download Grayscale PDF
                  </motion.a>
                  <a
                    href={grayscaleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white/75 dark:bg-slate-900/75 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold rounded-2xl border border-[var(--pms-border)] transition-all text-sm"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open in New Tab
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowResultPreview(!showResultPreview)}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white/75 dark:bg-slate-900/75 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold rounded-2xl border border-[var(--pms-border)] transition-all text-sm cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                    {showResultPreview ? 'Hide Preview' : 'Show Live Preview'}
                  </button>
                </div>

                {showResultPreview && (
                  <div className="mt-6 text-left">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                      Monochrome Output Preview
                    </p>
                    <div className="w-full h-[550px] rounded-2xl border border-[var(--pms-border)] overflow-hidden bg-white shadow-inner">
                      <iframe
                        src={grayscaleUrl}
                        title="Grayscale PDF Preview"
                        className="w-full h-full border-0"
                      />
                    </div>
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
            </motion.div>
          )}
        </motion.div>
      )}
      </div>
    </ToolWorkspaceShell>
  );
}
