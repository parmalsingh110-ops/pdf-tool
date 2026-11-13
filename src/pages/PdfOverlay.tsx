import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Layers, Download, CheckCircle2, Sliders, ExternalLink, Eye, Loader2, ArrowLeftRight, Sparkles, FileText } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import '../lib/pdfWorker';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

export default function PdfOverlay() {
  useSEO(
    'PDF Overlay Online Free — Stack & Compare Two PDFs with Live Preview | PDF Media Suite',
    'Free online PDF overlay tool. Stack two PDF documents with adjustable opacity and visual blend modes. Ideal for blueprint comparisons and revisions.'
  );

  usePageSEO(
    'PDF Overlay & Visual Diff Stacker',
    'Stack two PDFs with live canvas preview, adjustable transparency, and Difference/Multiply blend modes to spot revisions and blueprint edits.'
  );

  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);

  const [opacity, setOpacity] = useState(0.5); // 0.0 to 1.0
  const [blendMode, setBlendMode] = useState<GlobalCompositeOperation>('source-over');

  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);

  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [showResultPreview, setShowResultPreview] = useState(true);

  useAutoRevokeUrl(resultUrl);

  // Cached Page 1 canvases for fast slider updates
  const canvasARef = useRef<HTMLCanvasElement | null>(null);
  const canvasBRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prefersReduced = useReducedMotion();

  // When files change, render their Page 1 into memory
  useEffect(() => {
    let isCancelled = false;

    const renderPreviews = async () => {
      if (!fileA && !fileB) return;
      setIsLoadingPreview(true);

      try {
        const scale = 0.5;

        if (fileA) {
          const bufA = await fileA.arrayBuffer();
          const pdfA = await pdfjsLib.getDocument({ data: new Uint8Array(bufA) }).promise;
          const pageA = await pdfA.getPage(1);
          const vpA = pageA.getViewport({ scale });
          const cA = document.createElement('canvas');
          cA.width = vpA.width;
          cA.height = vpA.height;
          const ctxA = cA.getContext('2d')!;
          ctxA.fillStyle = '#ffffff';
          ctxA.fillRect(0, 0, vpA.width, vpA.height);
          await pageA.render({ canvasContext: ctxA, viewport: vpA, canvas: cA } as any).promise;
          if (!isCancelled) canvasARef.current = cA;
        } else {
          canvasARef.current = null;
        }

        if (fileB) {
          const bufB = await fileB.arrayBuffer();
          const pdfB = await pdfjsLib.getDocument({ data: new Uint8Array(bufB) }).promise;
          const pageB = await pdfB.getPage(1);
          const vpB = pageB.getViewport({ scale });
          const cB = document.createElement('canvas');
          cB.width = vpB.width;
          cB.height = vpB.height;
          const ctxB = cB.getContext('2d')!;
          ctxB.fillStyle = '#ffffff';
          ctxB.fillRect(0, 0, vpB.width, vpB.height);
          await pageB.render({ canvasContext: ctxB, viewport: vpB, canvas: cB } as any).promise;
          if (!isCancelled) canvasBRef.current = cB;
        } else {
          canvasBRef.current = null;
        }

        if (!isCancelled) {
          drawLiveOverlay();
        }
      } catch (err) {
        console.error('Error rendering overlay previews:', err);
      } finally {
        if (!isCancelled) setIsLoadingPreview(false);
      }
    };

    renderPreviews();

    return () => {
      isCancelled = true;
    };
  }, [fileA, fileB]);

  // Redraw preview whenever opacity or blendMode changes
  const drawLiveOverlay = () => {
    const outCanvas = previewCanvasRef.current;
    if (!outCanvas) return;

    const cA = canvasARef.current;
    const cB = canvasBRef.current;

    const w = Math.max(cA?.width || 0, cB?.width || 0) || 400;
    const h = Math.max(cA?.height || 0, cB?.height || 0) || 500;

    outCanvas.width = w;
    outCanvas.height = h;
    const ctx = outCanvas.getContext('2d')!;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // Draw Base (A)
    if (cA) {
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(cA, 0, 0);
    }

    // Draw Overlay (B)
    if (cB) {
      ctx.globalAlpha = opacity;
      ctx.globalCompositeOperation = blendMode;
      ctx.drawImage(cB, 0, 0);
    }

    // Reset composite mode
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  useEffect(() => {
    drawLiveOverlay();
  }, [opacity, blendMode]);

  const swapDocuments = () => {
    const temp = fileA;
    setFileA(fileB);
    setFileB(temp);
  };

  const overlayPdfs = async () => {
    if (!fileA || !fileB) return;

    setIsProcessing(true);
    setProgressPercent(10);
    setProgressText('Loading documents for overlay...');

    try {
      const bufA = await fileA.arrayBuffer();
      const bufB = await fileB.arrayBuffer();

      const pdfA = await pdfjsLib.getDocument({ data: new Uint8Array(bufA) }).promise;
      const pdfB = await pdfjsLib.getDocument({ data: new Uint8Array(bufB) }).promise;

      const maxPages = Math.max(pdfA.numPages, pdfB.numPages);
      const newDoc = await PDFDocument.create();

      const scale = 1.8; // Sharp print resolution

      for (let p = 1; p <= maxPages; p++) {
        setProgressText(`Stacking & blending page ${p} of ${maxPages}...`);
        setProgressPercent(Math.round(10 + (p / maxPages) * 80));

        const renderPage = async (pdf: pdfjsLib.PDFDocumentProxy, num: number) => {
          if (num > pdf.numPages) return null;
          const page = await pdf.getPage(num);
          const vp = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width;
          canvas.height = vp.height;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;
          return { canvas, vp };
        };

        const resA = await renderPage(pdfA, p);
        const resB = await renderPage(pdfB, p);

        const w = Math.max(resA?.canvas.width || 0, resB?.canvas.width || 0);
        const h = Math.max(resA?.canvas.height || 0, resB?.canvas.height || 0);
        if (w === 0 || h === 0) continue;

        const mergedCanvas = document.createElement('canvas');
        mergedCanvas.width = w;
        mergedCanvas.height = h;
        const ctx = mergedCanvas.getContext('2d')!;

        // Base white
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);

        // Draw Base A
        if (resA) {
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(resA.canvas, 0, 0);
        }

        // Draw Overlay B
        if (resB) {
          ctx.globalAlpha = opacity;
          ctx.globalCompositeOperation = blendMode;
          ctx.drawImage(resB.canvas, 0, 0);
        }

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        const imgDataUrl = mergedCanvas.toDataURL('image/jpeg', 0.9);
        const imgBytes = dataUrlToBytes(imgDataUrl);
        const pdfImg = await newDoc.embedJpg(imgBytes);

        const targetW = w / scale;
        const targetH = h / scale;
        const newPage = newDoc.addPage([targetW, targetH]);
        newPage.drawImage(pdfImg, { x: 0, y: 0, width: targetW, height: targetH });

        // Clean memory
        if (resA) { resA.canvas.width = 0; resA.canvas.height = 0; }
        if (resB) { resB.canvas.width = 0; resB.canvas.height = 0; }
        mergedCanvas.width = 0;
        mergedCanvas.height = 0;
      }

      setProgressPercent(95);
      setProgressText('Building merged PDF file...');
      const bytes = toArrayBufferBytes(await newDoc.save());
      const blob = new Blob([bytes], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
      setProgressPercent(100);
      setProgressText('Done!');
    } catch (e: any) {
      console.error('Failed to overlay PDFs:', e);
      alert(e?.message || 'Failed to overlay PDFs. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetAll = () => {
    setFileA(null);
    setFileB(null);
    setResultUrl(null);
    canvasARef.current = null;
    canvasBRef.current = null;
  };

  return (
    <ToolWorkspaceShell
      title="PDF Overlay & Stacker Tool"
      subtitle="Stack two PDF documents with real-time transparency and difference blend modes. Perfect for architectural drawings, blueprints, and document revisions."
      categoryLabel="Visual Diff & Layer Stacker"
      icon={Layers}
      microVariant="compare"
      tone="sky"
      trustNote="Live pixel blend preview · 100% private client-side compositing"
    >
      {!resultUrl ? (
        <motion.div
          key="overlay-workspace"
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.26 }}
          className="relative w-full pms-glass-panel rounded-3xl p-6 md:p-8 space-y-8 overflow-hidden"
        >
          <PearlScanOverlay active={isProcessing} label={progressText || 'Stacking & blending PDF layers…'} />

          {/* File Upload Grids */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
            {/* File A (Base) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-500" /> 1. Base Document (Bottom Layer)
                </span>
                {fileA && (
                  <button
                    onClick={() => setFileA(null)}
                    className="text-xs text-rose-500 hover:underline font-semibold cursor-pointer"
                  >
                    Change
                  </button>
                )}
              </div>
              {!fileA ? (
                <FileDropzone onDrop={(files) => setFileA(files[0] || null)} multiple={false} title="Drop Base PDF (File A)" />
              ) : (
                <div className="p-4 bg-[var(--pms-soft-blue)] border border-[var(--pms-border)] rounded-2xl flex items-center gap-3">
                  <FileText className="w-8 h-8 text-[var(--pms-blue)] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{fileA.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{(fileA.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
              )}
            </div>

            {/* Swap Button (Desktop Center) */}
            {fileA && fileB && (
              <div className="hidden md:flex absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                <motion.button
                  type="button"
                  whileHover={prefersReduced ? undefined : { scale: 1.1, rotate: 180 }}
                  whileTap={prefersReduced ? undefined : { scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 20 }}
                  onClick={swapDocuments}
                  title="Swap Base and Overlay"
                  className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 border border-[var(--pms-border-strong)] shadow-md flex items-center justify-center text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                </motion.button>
              </div>
            )}

            {/* File B (Overlay) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-violet-500" /> 2. Overlay Document (Top Layer)
                </span>
                {fileB && (
                  <button
                    onClick={() => setFileB(null)}
                    className="text-xs text-rose-500 hover:underline font-semibold cursor-pointer"
                  >
                    Change
                  </button>
                )}
              </div>
              {!fileB ? (
                <FileDropzone onDrop={(files) => setFileB(files[0] || null)} multiple={false} title="Drop Overlay PDF (File B)" />
              ) : (
                <div className="p-4 bg-[var(--pms-soft-lavender)] border border-[var(--pms-border)] rounded-2xl flex items-center gap-3">
                  <FileText className="w-8 h-8 text-[var(--pms-violet)] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{fileB.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{(fileB.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Interactive Live Preview & Controls Section (synchronous mount so previewCanvasRef stays bound) */}
          {(fileA || fileB) && (
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pt-6 border-t border-[var(--pms-border)]"
            >
              {/* Left Column: Live Canvas Preview */}
              <div className="lg:col-span-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-[var(--pms-blue)]" /> Live Page 1 Overlay
                  </span>
                  {fileA && fileB && (
                    <button
                      type="button"
                      onClick={swapDocuments}
                      className="text-xs text-[var(--pms-blue)] font-bold hover:underline flex items-center gap-1 md:hidden cursor-pointer"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" /> Swap layers
                    </button>
                  )}
                </div>

                <div className="rounded-2xl border border-[var(--pms-border)] overflow-hidden bg-slate-100/80 dark:bg-slate-950/70 flex flex-col items-center justify-center min-h-[320px] p-4 relative shadow-inner">
                  {isLoadingPreview ? (
                    <div className="flex flex-col items-center gap-2 text-slate-500 dark:text-slate-400">
                      <Loader2 className="w-6 h-6 animate-spin text-[var(--pms-blue)]" />
                      <span className="text-xs">Blending live preview...</span>
                    </div>
                  ) : null}

                  <canvas
                    ref={previewCanvasRef}
                    className={`max-h-[350px] rounded-lg shadow-md border border-[var(--pms-border)] bg-white object-contain mx-auto ${
                      isLoadingPreview ? 'hidden' : 'block'
                    }`}
                  />
                </div>
              </div>

              {/* Right Column: Overlay Controls */}
              <div className="lg:col-span-7 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Overlay Controls</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Adjust top layer transparency and blend mode to reveal differences.
                  </p>
                </div>

                {/* Opacity Slider */}
                <div className="p-5 bg-white/75 dark:bg-slate-800/60 rounded-2xl border border-[var(--pms-border)] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-[var(--pms-blue)]" /> Top Layer (File B) Opacity
                    </span>
                    <span className="font-mono font-bold px-2.5 py-0.5 rounded-full bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] border border-[var(--pms-border)]">
                      {Math.round(opacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={1.0}
                    step={0.05}
                    value={opacity}
                    onChange={(e) => setOpacity(parseFloat(e.target.value))}
                    className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg accent-sky-600"
                  />
                  <div className="flex justify-between text-[11px] text-slate-400 pt-1">
                    <span>10% (Transparent)</span>
                    <span>50% (Balanced Stack)</span>
                    <span>100% (Solid Top)</span>
                  </div>
                </div>

                {/* Blend Mode Options */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                    Blend Mode Profile
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      {
                        mode: 'source-over' as GlobalCompositeOperation,
                        name: 'Normal Stack',
                        desc: 'Classic transparency overlay.',
                      },
                      {
                        mode: 'difference' as GlobalCompositeOperation,
                        name: 'Visual Difference',
                        desc: 'Inverts matching pixels to highlight edits.',
                      },
                      {
                        mode: 'multiply' as GlobalCompositeOperation,
                        name: 'Multiply (Darken)',
                        desc: 'Transparent white, ink darkens together.',
                      },
                    ].map((item) => {
                      const active = blendMode === item.mode;
                      return (
                        <motion.button
                          key={item.mode}
                          type="button"
                          whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                          onClick={() => setBlendMode(item.mode)}
                          className="relative text-left p-3.5 rounded-2xl border transition-all flex flex-col justify-between cursor-pointer overflow-hidden"
                          style={{
                            borderColor: active ? 'var(--pms-blue)' : 'var(--pms-border)',
                            backgroundColor: active ? 'var(--pms-soft-blue)' : 'var(--pms-white)',
                          }}
                        >
                          <h4 className="font-bold text-xs text-slate-900 dark:text-white mb-0.5">{item.name}</h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{item.desc}</p>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Progress bar */}
                <AnimatePresence>
                  {isProcessing && (
                    <motion.div
                      initial={prefersReduced ? false : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={prefersReduced ? undefined : { opacity: 0, height: 0 }}
                      className="space-y-2 p-4 bg-[var(--pms-soft-blue)] rounded-2xl border border-[var(--pms-border)]"
                    >
                      <div className="flex justify-between text-xs font-semibold text-slate-800 dark:text-sky-200">
                        <span>{progressText}</span>
                        <span>
                          <AnimatedNumber value={progressPercent} suffix="%" />
                        </span>
                      </div>
                      <div className="w-full bg-white/70 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-sky-500 via-violet-500 to-rose-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <motion.button
                    whileHover={prefersReduced || !fileA || !fileB || isProcessing ? undefined : { scale: 1.01 }}
                    whileTap={prefersReduced || !fileA || !fileB || isProcessing ? undefined : { scale: 0.985 }}
                    onClick={overlayPdfs}
                    disabled={!fileA || !fileB || isProcessing}
                    className="flex-1 pms-btn-primary py-4 font-bold rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2 text-base cursor-pointer"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Stacking & Blending Documents...
                      </>
                    ) : (
                      <>
                        <Layers className="w-5 h-5" />
                        Generate & Download Overlay PDF
                      </>
                    )}
                  </motion.button>
                  <button
                    onClick={resetAll}
                    disabled={isProcessing}
                    className="px-6 py-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-2xl transition-colors text-sm cursor-pointer disabled:opacity-50"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      ) : (
        /* Success Screen */
        <motion.div
          key="overlay-result"
          initial={prefersReduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className="w-full max-w-4xl mx-auto pms-glass-panel rounded-3xl border border-emerald-200/80 dark:border-emerald-800/70 p-8 text-center space-y-6"
        >
          <motion.div
            initial={prefersReduced ? false : { scale: 0.45, rotate: -10, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 360, damping: 18 }}
            className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner"
          >
            <CheckCircle2 className="w-10 h-10" />
          </motion.div>

          <div>
            <span className="inline-block px-3.5 py-1 bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-bold uppercase tracking-wider mb-2 border border-[var(--pms-border)]">
              Overlay Compositing Complete
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white mb-2">
              PDF Overlay Created Successfully!
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm max-w-md mx-auto">
              Both documents have been blended across all pages with your selected transparency profile.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <motion.a
              whileHover={prefersReduced ? undefined : { scale: 1.015 }}
              whileTap={prefersReduced ? undefined : { scale: 0.985 }}
              href={resultUrl}
              download="overlay_document.pdf"
              className="pms-btn-primary inline-flex items-center justify-center gap-2 px-8 py-3.5 font-bold rounded-2xl text-base"
            >
              <Download className="w-5 h-5" />
              Download Overlaid PDF
            </motion.a>
            <a
              href={resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white/80 dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-2xl border border-[var(--pms-border)] transition-all text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              Open in New Tab
            </a>
            <button
              type="button"
              onClick={() => setShowResultPreview(!showResultPreview)}
              className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white/80 dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-2xl border border-[var(--pms-border)] transition-all text-sm cursor-pointer"
            >
              <Eye className="w-4 h-4" />
              {showResultPreview ? 'Hide Preview' : 'Show Live Preview'}
            </button>
          </div>

          <AnimatePresence>
            {showResultPreview && (
              <motion.div
                initial={prefersReduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReduced ? undefined : { opacity: 0, y: -8 }}
                className="pt-2 text-left"
              >
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Overlay Document Output Preview
                </p>
                <div className="w-full h-[550px] rounded-2xl border border-[var(--pms-border)] overflow-hidden bg-white shadow-inner">
                  <iframe
                    src={resultUrl}
                    title="Overlay PDF Preview"
                    className="w-full h-full border-0"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={resetAll}
            className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold cursor-pointer"
          >
            ← Stack another pair of PDFs
          </button>
        </motion.div>
      )}
    </ToolWorkspaceShell>
  );
}
