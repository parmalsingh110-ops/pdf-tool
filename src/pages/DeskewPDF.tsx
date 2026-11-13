import { useState, useEffect } from 'react';
import { Download, FileText, CheckCircle2, Eye, Loader2, Compass, RotateCw, Grid, Wand2 } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { toArrayBufferBytes } from '../lib/blobUrl';
import ToolSEOSection from '../components/ToolSEOSection';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

interface PageItem {
  num: number;
  angle: number; // in degrees (-15 to 15)
  rotation90: number; // 0, 90, 180, 270
}

export default function DeskewPDF() {
  useSEO(
    'Deskew PDF Online Free — Automatically Straighten Scanned PDF Pages | PDF Media Suite',
    'Automatically straighten tilted, crooked scanned PDF pages online free. Fine-tune deskew angles with live alignment grid and instant download.'
  );

  usePageSEO(
    'Deskew PDF — Straighten Crooked Scanned Documents',
    'Automatically detect and correct tilt angles on scanned documents. Interactive alignment grid, manual angle slider, and batch deskewing.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [pageCount, setPageCount] = useState(0);

  const [pages, setPages] = useState<PageItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [showGrid, setShowGrid] = useState(true);

  // Live Canvas Preview
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState('');
  const prefersReduced = useReducedMotion();

  const currentAngle = pages[currentPage - 1]?.angle || 0;
  const currentRot90 = pages[currentPage - 1]?.rotation90 || 0;

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    const f = acceptedFiles[0];
    setFile(f);
    setResultUrl(null);
    setBusy(true);

    try {
      const ab = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
      const count = pdf.numPages;
      setPageCount(count);

      const initialPages: PageItem[] = Array.from({ length: count }, (_, i) => ({
        num: i + 1,
        angle: 0,
        rotation90: 0,
      }));
      setPages(initialPages);
      setCurrentPage(1);

      await renderPreview(pdf, 1);
    } catch (err: any) {
      alert('Could not load PDF: ' + (err?.message || 'Invalid file'));
      setFile(null);
    } finally {
      setBusy(false);
    }
  };

  const renderPreview = async (pdfDoc: pdfjsLib.PDFDocumentProxy, pageNum: number) => {
    setLoadingPreview(true);
    try {
      const page = await pdfDoc.getPage(pageNum);
      const vp = page.getViewport({ scale: 1 });
      const maxDim = 800;
      const scale = Math.min(2.0, maxDim / Math.max(vp.width, vp.height));
      const scaledVp = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = scaledVp.width;
      canvas.height = scaledVp.height;
      const ctx = canvas.getContext('2d')!;

      await page.render({ canvasContext: ctx, viewport: scaledVp, canvas }).promise;
      setPreviewDataUrl(canvas.toDataURL('image/jpeg', 0.85));
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPreview(false);
    }
  };

  // Auto-detect tilt angle on a rendered canvas using horizontal projection variance
  const detectAngle = async () => {
    if (!previewDataUrl) return;
    setAnalyzing(true);

    try {
      const img = new Image();
      img.src = previewDataUrl;
      await new Promise((res) => (img.onload = res));

      // Draw downscaled grayscale for fast projection analysis
      const sw = 300;
      const sh = Math.round((img.height / img.width) * sw);
      const testCanvas = document.createElement('canvas');
      testCanvas.width = sw;
      testCanvas.height = sh;
      const tctx = testCanvas.getContext('2d', { willReadFrequently: true })!;

      let bestAngle = 0;
      let maxVariance = -1;

      // Sample angles from -5 to +5 with 0.5 step
      for (let testAngle = -5; testAngle <= 5; testAngle += 0.5) {
        tctx.save();
        tctx.fillStyle = 'white';
        tctx.fillRect(0, 0, sw, sh);
        tctx.translate(sw / 2, sh / 2);
        tctx.rotate((testAngle * Math.PI) / 180);
        tctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
        tctx.restore();

        const imgData = tctx.getImageData(0, 0, sw, sh).data;
        // Calculate row brightness sum
        const rowSums = new Float64Array(sh);
        for (let y = 0; y < sh; y++) {
          let sum = 0;
          for (let x = 0; x < sw; x++) {
            const idx = (y * sw + x) * 4;
            // Luminance
            sum += (imgData[idx] * 299 + imgData[idx + 1] * 587 + imgData[idx + 2] * 114) / 1000;
          }
          rowSums[y] = sum;
        }

        // Calculate variance across rows (straight text lines produce maximum variance between black text rows and white gaps!)
        let mean = 0;
        for (let y = 0; y < sh; y++) mean += rowSums[y];
        mean /= sh;

        let variance = 0;
        for (let y = 0; y < sh; y++) {
          const diff = rowSums[y] - mean;
          variance += diff * diff;
        }

        if (variance > maxVariance) {
          maxVariance = variance;
          bestAngle = testAngle;
        }
      }

      // Best corrective angle is negative of skew
      const correctiveAngle = Math.round(-bestAngle * 10) / 10;
      updateCurrentPage({ angle: correctiveAngle });
    } catch (e) {
      console.error('Deskew detection error:', e);
    } finally {
      setAnalyzing(false);
    }
  };

  const updateCurrentPage = (patch: Partial<PageItem>) => {
    setPages((prev) =>
      prev.map((p) => (p.num === currentPage ? { ...p, ...patch } : p))
    );
  };

  const applyCurrentToAll = () => {
    setPages((prev) =>
      prev.map((p) => ({ ...p, angle: currentAngle, rotation90: currentRot90 }))
    );
    alert(`Applied ${currentAngle}° deskew angle to all ${pageCount} pages!`);
  };

  const processDeskew = async () => {
    if (!file) return;
    setBusy(true);

    try {
      const ab = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
      const outDoc = await PDFDocument.create();

      for (let i = 1; i <= pdf.numPages; i++) {
        const pageItem = pages[i - 1] || { num: i, angle: 0, rotation90: 0 };
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 2.0 }); // crisp 2x render

        // Canvas for page
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;

        // Fill background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Apply deskew rotation
        if (pageItem.angle !== 0 || pageItem.rotation90 !== 0) {
          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          const totalRad = ((pageItem.angle + pageItem.rotation90) * Math.PI) / 180;
          ctx.rotate(totalRad);
          ctx.translate(-canvas.width / 2, -canvas.height / 2);
        }

        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

        if (pageItem.angle !== 0 || pageItem.rotation90 !== 0) {
          ctx.restore();
        }

        const imgBytes = canvas.toDataURL('image/jpeg', 0.92);
        const embeddedImg = await outDoc.embedJpg(imgBytes);

        // Standard 72 DPI page dimensions
        const pageW = vp.width / 2;
        const pageH = vp.height / 2;
        const newPage = outDoc.addPage([pageW, pageH]);
        newPage.drawImage(embeddedImg, {
          x: 0,
          y: 0,
          width: pageW,
          height: pageH,
        });

        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }

      const outBytes = await outDoc.save();
      const blob = new Blob([toArrayBufferBytes(outBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultName(`${file.name.replace(/\.pdf$/i, '')}_deskewed.pdf`);
    } catch (e: any) {
      console.error(e);
      alert('Error deskewing PDF: ' + (e?.message || 'Unknown error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Deskew PDF Pages"
      subtitle="Automatically straighten crooked or tilted scanned PDF pages with live alignment grid and precise angle controls."
      categoryLabel="Scanned Document Straightener"
      icon={Compass}
      microVariant="edit"
      tone="amber"
    >

      <PearlStageSwitch stageKey={!file ? 'upload' : 'workspace'}>
        {!file ? (
          <div className="max-w-2xl mx-auto">
            <FileDropzone
              onDrop={handleDrop}
              accept={{ 'application/pdf': ['.pdf'] }}
              multiple={false}
              title="Upload Crooked or Tilted PDF"
              subtitle="Drop scanned document to auto-straighten"
            />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Control Panel */}
            <div className="pms-glass-panel rounded-3xl p-6 relative overflow-hidden">
              <PearlScanOverlay
                active={busy || analyzing}
                label={analyzing ? 'Analyzing text line orientation...' : 'Straightening PDF pages...'}
              />

              <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-[var(--pms-border)]">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] border border-[var(--pms-border)]">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-slate-200">{file.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{pageCount} page{pageCount > 1 ? 's' : ''}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowGrid(!showGrid)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                      showGrid
                        ? 'border-[var(--pms-blue)] bg-[var(--pms-soft-blue)] text-sky-700 dark:text-sky-300'
                        : 'border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Grid className="w-3.5 h-3.5" /> Alignment Grid {showGrid ? 'ON' : 'OFF'}
                  </button>

                  <button
                    onClick={() => {
                      setFile(null);
                      setResultUrl(null);
                    }}
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors"
                  >
                    Change File
                  </button>
                </div>
              </div>

              {/* Angle Control Tools */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
                {/* 1. Auto-Detect */}
                <div className="p-4 rounded-2xl border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">
                      Auto-Straighten
                    </span>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                      Analyzes text line orientations to automatically detect skew angle.
                    </p>
                  </div>
                  <motion.button
                    whileHover={prefersReduced ? undefined : { scale: 1.01 }}
                    whileTap={prefersReduced ? undefined : { scale: 0.99 }}
                    type="button"
                    onClick={detectAngle}
                    disabled={analyzing}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold bg-[var(--pms-soft-lavender)] hover:bg-[var(--pms-soft-rose)] text-slate-900 dark:text-slate-100 border border-[var(--pms-border-strong)] shadow-xs transition-colors disabled:opacity-50"
                  >
                    {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 text-[var(--pms-violet)]" />}
                    Auto-Detect Angle
                  </motion.button>
                </div>

                {/* 2. Manual Fine-Tuning Slider */}
                <div className="p-4 rounded-2xl border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Fine-Tune Tilt Angle
                    </span>
                    <span className="text-xs font-bold text-[var(--pms-rose)] bg-[var(--pms-soft-rose)] px-2 py-0.5 rounded-md font-mono border border-[var(--pms-border)]">
                      {currentAngle > 0 ? `+${currentAngle}` : currentAngle}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-10}
                    max={10}
                    step={0.1}
                    value={currentAngle}
                    onChange={(e) => updateCurrentPage({ angle: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-rose-600"
                  />
                  <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                    <span>-10° Counter-Clockwise</span>
                    <button
                      onClick={() => updateCurrentPage({ angle: 0 })}
                      className="text-[var(--pms-rose)] hover:underline font-semibold"
                    >
                      Reset 0°
                    </button>
                    <span>+10° Clockwise</span>
                  </div>
                </div>

                {/* 3. 90-Degree Rotation & Batch */}
                <div className="p-4 rounded-2xl border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">
                      Page Rotation & Batch
                    </span>
                    <div className="flex gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => updateCurrentPage({ rotation90: (currentRot90 + 90) % 360 })}
                        className="flex-1 py-1.5 px-2 rounded-xl border border-[var(--pms-border)] bg-white/80 dark:bg-slate-800/80 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:border-[var(--pms-border-strong)] flex items-center justify-center gap-1 transition-colors"
                      >
                        <RotateCw className="w-3.5 h-3.5" /> Rotate 90°
                      </button>
                    </div>
                  </div>
                  {pageCount > 1 && (
                    <button
                      type="button"
                      onClick={applyCurrentToAll}
                      className="text-xs text-[var(--pms-rose)] hover:underline font-semibold text-left"
                    >
                      Apply this {currentAngle}° angle to all {pageCount} pages
                    </button>
                  )}
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-6 pt-6 border-t border-[var(--pms-border)] flex justify-end">
                <motion.button
                  whileHover={prefersReduced ? undefined : { scale: 1.01 }}
                  whileTap={prefersReduced ? undefined : { scale: 0.99 }}
                  onClick={processDeskew}
                  disabled={busy}
                  className="pms-btn-primary relative overflow-hidden inline-flex items-center gap-2 px-7 py-3 rounded-2xl font-bold text-white disabled:opacity-50"
                >
                  <span className="pms-shimmer" aria-hidden="true" />
                  {busy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin relative z-10" />
                      <span className="relative z-10">Straightening PDF...</span>
                    </>
                  ) : (
                    <>
                      <Compass className="w-4 h-4 relative z-10" />
                      <span className="relative z-10">Save Deskewed PDF</span>
                    </>
                  )}
                </motion.button>
              </div>
            </div>

            {/* Live Interactive Page Visualizer */}
            <div className="pms-glass-panel rounded-3xl p-6 text-center relative overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[var(--pms-rose)]" />
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Live Straightening View (Page {currentPage} of {pageCount})
                  </h4>
                </div>
                {pageCount > 1 && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500">Jump to page:</span>
                    <select
                      value={currentPage}
                      onChange={async (e) => {
                        const num = Number(e.target.value);
                        setCurrentPage(num);
                        try {
                          const ab = await file.arrayBuffer();
                          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
                          await renderPreview(pdf, num);
                        } catch (err) {
                          console.error('Failed to switch deskew preview page:', err);
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg border border-[var(--pms-border)] bg-white/85 dark:bg-slate-800/85 text-slate-800 dark:text-slate-200 text-xs"
                    >
                      {Array.from({ length: Math.min(pageCount, 50) }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          Page {n}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {previewDataUrl ? (
                <div className="relative inline-block border-2 border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden shadow-lg bg-white">
                  <div
                    className="transition-transform duration-150 origin-center"
                    style={{
                      transform: `rotate(${currentAngle + currentRot90}deg)`,
                    }}
                  >
                    <img
                      src={previewDataUrl}
                      alt="Deskew Preview"
                      className="max-h-[500px] w-auto object-contain block mx-auto"
                    />
                  </div>

                  {/* Horizontal Alignment Grid Lines */}
                  {showGrid && (
                    <div className="absolute inset-0 pointer-events-none grid grid-rows-12 border border-blue-400/30">
                      {Array.from({ length: 11 }).map((_, i) => (
                        <div key={i} className="border-b border-dashed border-blue-400/40" />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading preview...
                </div>
              )}
            </div>

            {/* Success Box */}
            <AnimatePresence>
              {resultUrl && (
                <motion.div
                  initial={prefersReduced ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReduced ? undefined : { opacity: 0, y: -8 }}
                  transition={prefersReduced ? { duration: 0 } : { duration: 0.25 }}
                  className="p-6 md:p-8 rounded-3xl bg-gradient-to-br from-emerald-50/90 via-white/85 to-teal-50/80 dark:from-emerald-950/45 dark:via-slate-900/85 dark:to-teal-950/35 border border-emerald-200/80 dark:border-emerald-800/70 backdrop-blur-md shadow-lg text-center"
                >
                  <motion.div
                    initial={prefersReduced ? false : { scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 18 }}
                    className="w-14 h-14 bg-emerald-100/90 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm"
                  >
                    <CheckCircle2 className="w-8 h-8" />
                  </motion.div>
                  <h3 className="text-xl font-bold text-emerald-950 dark:text-emerald-100 mb-1">
                    Deskewing Complete!
                  </h3>
                  <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-5">
                    All crooked pages have been rotated into perfect horizontal alignment.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <motion.a
                      whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                      whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                      href={resultUrl}
                      download={resultName}
                      className="pms-btn-primary relative overflow-hidden inline-flex items-center gap-2 px-7 py-3 rounded-2xl font-bold text-white"
                    >
                      <span className="pms-shimmer" aria-hidden="true" />
                      <Download className="w-4 h-4 relative z-10" />
                      <span className="relative z-10">Download Straightened PDF</span>
                    </motion.a>
                    <a
                      href={resultUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-semibold text-emerald-800 dark:text-emerald-200 bg-white/85 dark:bg-slate-800/85 border border-[var(--pms-border)] hover:bg-white dark:hover:bg-slate-800 transition-colors shadow-xs"
                    >
                      <Eye className="w-4 h-4" /> Preview in Browser
                    </a>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </PearlStageSwitch>

        <ToolSEOSection
          toolName="Deskew PDF"
          headline="Straighten Crooked Scanned Documents"
          description="Automatically straighten tilted, crooked scanned PDF pages online free. Fine-tune deskew angles with live alignment grid and instant download."
          faqs={[
            {
              q: 'Why do scanned PDFs become crooked?',
              a: 'Paper feeders and flatbed scanner lids often pull or hold pages at a slight angle during the scan pass. Deskewing rotates the document back to 0° alignment.',
            },
            {
              q: 'How does the alignment grid help?',
              a: 'The grid provides reference horizontal lines so you can align text rows directly against the line to verify 100% straightness.',
            },
          ]}
        />
    </ToolWorkspaceShell>
  );
}
