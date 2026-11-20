import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Download,
  FileText,
  CheckCircle2,
  Eye,
  Loader2,
  Compass,
  RotateCw,
  Grid,
  Wand2,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Crop,
  Maximize2,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import { dataUrlToBytes } from '../lib/utils';
import ToolSEOSection from '../components/ToolSEOSection';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';
import {
  detectCorrectiveSkewAngle,
  renderDeskewedCanvas,
} from '../lib/documentCleanerEngine';

interface PageItem {
  num: number;
  angle: number; // -15 to +15 degrees (0.1° precision)
  rotation90: number; // 0, 90, 180, 270
}

export default function DeskewPDF() {
  useSEO(
    'Deskew PDF & Scanned Images Pro — Auto-Straighten All Pages | PDF Media Suite',
    'Automatically detect and straighten crooked scanned PDF pages & photos with 0.1° coarse-to-fine precision. Batch auto-deskew all pages, trim dark scanner borders, and keep corners unclipped.'
  );

  usePageSEO(
    'Deskew PDF Pro — Auto-Straighten Crooked Scanned Documents',
    'Coarse-to-fine ±15° skew angle auto-detection with 0.1° accuracy, batch auto-deskew for multi-page PDFs, dark scanner border trimming, and live alignment grid.',
    'deskew pdf online free, straighten crooked scanned pdf, auto deskew all pdf pages, fix tilted scan online, trim black scanner borders pdf',
    '/deskew'
  );

  const [file, setFile] = useState<File | null>(null);
  const [isImageInput, setIsImageInput] = useState(false);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [pageCount, setPageCount] = useState(0);

  const [pages, setPages] = useState<PageItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [scaleToFit, setScaleToFit] = useState(true);
  const [trimDarkBorders, setTrimDarkBorders] = useState(false);

  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState('');

  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useAutoRevokeUrl(resultUrl);
  const prefersReduced = useReducedMotion();

  const currentAngle = pages[currentPage - 1]?.angle ?? 0;
  const currentRot90 = pages[currentPage - 1]?.rotation90 ?? 0;

  const renderPagePreview = useCallback(async (pageNum: number) => {
    setLoadingPreview(true);
    try {
      const pdf = pdfDocRef.current;
      if (!pdf) return;
      const page = await pdf.getPage(pageNum);
      const vp = page.getViewport({ scale: 1 });
      const scale = Math.min(2.0, 900 / Math.max(vp.width, vp.height));
      const scaledVp = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = scaledVp.width;
      canvas.height = scaledVp.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: scaledVp, canvas } as any).promise;
      page.cleanup();

      previewCanvasRef.current = canvas;
      setPreviewDataUrl(canvas.toDataURL('image/jpeg', 0.88));
    } catch (e) {
      console.error('[DeskewPDF] Preview render error:', e);
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    const f = acceptedFiles[0];
    setFile(f);
    setResultUrl(null);
    setBusy(true);
    setStatusMsg('Loading document...');
    pdfDocRef.current = null;
    sourceImageRef.current = null;
    previewCanvasRef.current = null;

    const isImg = f.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(f.name);
    setIsImageInput(isImg);

    try {
      if (isImg) {
        const url = URL.createObjectURL(f);
        const img = new Image();
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej(new Error('Image load failed'));
          img.src = url;
        });
        sourceImageRef.current = img;
        const sc = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * sc);
        c.height = Math.round(img.naturalHeight * sc);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        previewCanvasRef.current = c;
        setPreviewDataUrl(c.toDataURL('image/jpeg', 0.88));
        URL.revokeObjectURL(url);

        setPageCount(1);
        setPages([{ num: 1, angle: 0, rotation90: 0 }]);
        setCurrentPage(1);
      } else {
        const ab = await f.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
        pdfDocRef.current = pdf;
        const count = pdf.numPages;
        setPageCount(count);
        setPages(Array.from({ length: count }, (_, i) => ({ num: i + 1, angle: 0, rotation90: 0 })));
        setCurrentPage(1);
        await renderPagePreview(1);
      }
    } catch (err: any) {
      alert('Could not load file: ' + (err?.message || 'Invalid file'));
      setFile(null);
    } finally {
      setBusy(false);
      setStatusMsg('');
    }
  };

  const updateCurrentPage = (patch: Partial<PageItem>) => {
    setPages((prev) => prev.map((p) => (p.num === currentPage ? { ...p, ...patch } : p)));
  };

  // Coarse-to-fine 0.1° skew detection on current page (FIXED sign!)
  const detectCurrentAngle = () => {
    const src = previewCanvasRef.current;
    if (!src) return;
    setAnalyzing(true);
    setStatusMsg(`Measuring exact text baseline tilt on page ${currentPage}...`);
    setTimeout(() => {
      try {
        const angle = detectCorrectiveSkewAngle(src);
        updateCurrentPage({ angle });
      } finally {
        setAnalyzing(false);
        setStatusMsg('');
      }
    }, 20);
  };

  // Batch Auto-Detect EVERY page in the PDF!
  const detectAllPages = async () => {
    if (isImageInput) {
      detectCurrentAngle();
      return;
    }
    const pdf = pdfDocRef.current;
    if (!pdf) return;
    setAnalyzing(true);
    try {
      const updated = [...pages];
      for (let i = 1; i <= pdf.numPages; i++) {
        setStatusMsg(`Auto-detecting skew on page ${i} of ${pdf.numPages}...`);
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        const sc = Math.min(1.5, 650 / Math.max(vp.width, vp.height));
        const svp = page.getViewport({ scale: sc });
        const c = document.createElement('canvas');
        c.width = svp.width;
        c.height = svp.height;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: svp, canvas: c } as any).promise;

        const angle = detectCorrectiveSkewAngle(c);
        updated[i - 1] = { ...updated[i - 1], angle };

        c.width = 0;
        c.height = 0;
        page.cleanup();
        await new Promise((r) => setTimeout(r, 0));
      }
      setPages(updated);
    } catch (err) {
      console.error('[DeskewPDF] Batch auto-detect error:', err);
    } finally {
      setAnalyzing(false);
      setStatusMsg('');
    }
  };

  const applyCurrentToAll = () => {
    setPages((prev) => prev.map((p) => ({ ...p, angle: currentAngle, rotation90: currentRot90 })));
  };

  const handlePageChange = async (num: number) => {
    const clamped = Math.max(1, Math.min(pageCount, num));
    setCurrentPage(clamped);
    if (!isImageInput) {
      await renderPagePreview(clamped);
    }
  };

  const processDeskew = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const outDoc = await PDFDocument.create();

      if (isImageInput && sourceImageRef.current) {
        setStatusMsg('Straightening full-resolution image...');
        const img = sourceImageRef.current;
        const sc = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
        const srcC = document.createElement('canvas');
        srcC.width = Math.round(img.naturalWidth * sc);
        srcC.height = Math.round(img.naturalHeight * sc);
        srcC.getContext('2d')!.drawImage(img, 0, 0, srcC.width, srcC.height);

        const pi = pages[0] || { num: 1, angle: 0, rotation90: 0 };
        const fixed = renderDeskewedCanvas(srcC, pi.angle, pi.rotation90, scaleToFit, trimDarkBorders);
        const jpgBytes = dataUrlToBytes(fixed.toDataURL('image/jpeg', 0.93));
        const emb = await outDoc.embedJpg(jpgBytes);
        const a4W = fixed.width > fixed.height ? 841.89 : 595.28;
        const a4H = fixed.width > fixed.height ? 595.28 : 841.89;
        const fit = Math.min(a4W / fixed.width, a4H / fixed.height);
        const pg = outDoc.addPage([a4W, a4H]);
        pg.drawImage(emb, {
          x: (a4W - fixed.width * fit) / 2,
          y: (a4H - fixed.height * fit) / 2,
          width: fixed.width * fit,
          height: fixed.height * fit,
        });
        srcC.width = 0;
        srcC.height = 0;
        fixed.width = 0;
        fixed.height = 0;
      } else {
        const pdf =
          pdfDocRef.current ||
          (await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise);
        const renderScale = 2.0;

        for (let i = 1; i <= pdf.numPages; i++) {
          setStatusMsg(`Straightening page ${i} of ${pdf.numPages}...`);
          const pageItem = pages[i - 1] || { num: i, angle: 0, rotation90: 0 };
          const page = await pdf.getPage(i);
          const vp = page.getViewport({ scale: renderScale });

          const rawCanvas = document.createElement('canvas');
          rawCanvas.width = vp.width;
          rawCanvas.height = vp.height;
          const rctx = rawCanvas.getContext('2d', { willReadFrequently: true })!;
          rctx.fillStyle = '#ffffff';
          rctx.fillRect(0, 0, rawCanvas.width, rawCanvas.height);
          await page.render({ canvasContext: rctx, viewport: vp, canvas: rawCanvas } as any).promise;

          const deskewed = renderDeskewedCanvas(
            rawCanvas,
            pageItem.angle,
            pageItem.rotation90,
            scaleToFit,
            trimDarkBorders
          );

          const jpgBytes = dataUrlToBytes(deskewed.toDataURL('image/jpeg', 0.92));
          const embeddedImg = await outDoc.embedJpg(jpgBytes);
          const pageW = deskewed.width / renderScale;
          const pageH = deskewed.height / renderScale;
          const newPage = outDoc.addPage([pageW, pageH]);
          newPage.drawImage(embeddedImg, { x: 0, y: 0, width: pageW, height: pageH });

          rawCanvas.width = 0;
          rawCanvas.height = 0;
          deskewed.width = 0;
          deskewed.height = 0;
          page.cleanup();
          if (i % 2 === 0) await new Promise((r) => setTimeout(r, 0));
        }
      }

      const outBytes = await outDoc.save();
      const blob = new Blob([toArrayBufferBytes(outBytes)], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
      setResultName(`${file.name.replace(/\.[^.]+$/, '')}_deskewed.pdf`);
    } catch (e: any) {
      console.error('[DeskewPDF] Processing failed:', e);
      alert('Error deskewing document: ' + (e?.message || 'Unknown error'));
    } finally {
      setBusy(false);
      setStatusMsg('');
    }
  };

  useEffect(() => {
    return () => {
      pdfDocRef.current = null;
    };
  }, []);

  const correctedCount = pages.filter((p) => p.angle !== 0 || p.rotation90 !== 0).length;

  return (
    <ToolWorkspaceShell
      title="Deskew PDF & Scan Straightener Pro"
      subtitle="Coarse-to-fine ±15° auto-straightening with 0.1° precision. Batch auto-deskew every page in 1 click, prevent corner clipping, and trim dark scanner-lid borders."
      categoryLabel="Scanned Document Straightener"
      icon={Compass}
      microVariant="edit"
      tone="amber"
      trustNote="0.1° gradient baseline detection · Batch all-pages auto-deskew · Browser-only"
    >
      <PearlStageSwitch stageKey={!file ? 'upload' : 'workspace'}>
        {!file ? (
          <div className="max-w-2xl mx-auto">
            <FileDropzone
              onDrop={handleDrop}
              accept={{
                'application/pdf': ['.pdf'],
                'image/jpeg': ['.jpg', '.jpeg'],
                'image/png': ['.png'],
                'image/webp': ['.webp'],
              }}
              multiple={false}
              title="Upload Crooked PDF or Tilted Scan Photo"
              subtitle="Supports multi-page PDFs and JPG / PNG / WebP camera scans"
            />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Control Panel */}
            <div className="pms-glass-panel rounded-3xl p-5 sm:p-6 relative overflow-hidden">
              <PearlScanOverlay
                active={busy || analyzing}
                label={statusMsg || (analyzing ? 'Analyzing text line baselines...' : 'Straightening pages...')}
              />

              <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[var(--pms-border)]">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] border border-[var(--pms-border)]">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">{file.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {pageCount} page{pageCount > 1 ? 's' : ''} · {correctedCount} adjusted
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowGrid(!showGrid)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      showGrid
                        ? 'border-[var(--pms-blue)] bg-[var(--pms-soft-blue)] text-sky-700 dark:text-sky-300'
                        : 'border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Grid className="w-3.5 h-3.5" /> Grid {showGrid ? 'ON' : 'OFF'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setResultUrl(null);
                    }}
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 border border-[var(--pms-border)] rounded-xl transition cursor-pointer"
                  >
                    Change File
                  </button>
                </div>
              </div>

              {/* 3-Column Angle & Batch Controls */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-5">
                {/* 1. Auto-Detect (Single + Batch All) */}
                <div className="p-4 rounded-2xl border border-[var(--pms-border)] bg-white/80 dark:bg-slate-900/75 flex flex-col justify-between gap-2.5">
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                      Auto-Straighten (±15° · 0.1°)
                    </span>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Gradient row-projection detects exact baseline tilt cleanly.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={detectCurrentAngle}
                      disabled={analyzing}
                      className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold bg-[var(--pms-soft-lavender)] hover:opacity-90 text-slate-900 dark:text-slate-100 border border-[var(--pms-border-strong)] cursor-pointer disabled:opacity-50"
                    >
                      {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 text-[var(--pms-violet)]" />}
                      Auto-Deskew Page {currentPage}
                    </button>
                    {pageCount > 1 && (
                      <button
                        type="button"
                        onClick={() => void detectAllPages()}
                        disabled={analyzing}
                        className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white cursor-pointer disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> Auto-Deskew ALL {pageCount} Pages
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Fine-Tuning Slider + Nudges */}
                <div className="p-4 rounded-2xl border border-[var(--pms-border)] bg-white/80 dark:bg-slate-900/75 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Fine-Tune Angle
                      </span>
                      <span className="text-xs font-bold text-[var(--pms-rose)] bg-[var(--pms-soft-rose)] px-2 py-0.5 rounded-md font-mono border border-[var(--pms-border)]">
                        {currentAngle > 0 ? `+${currentAngle.toFixed(1)}` : currentAngle.toFixed(1)}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-15}
                      max={15}
                      step={0.1}
                      value={currentAngle}
                      onChange={(e) => updateCurrentPage({ angle: parseFloat(e.target.value) })}
                      className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg accent-amber-600 cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-1.5 pt-3 text-[11px]">
                    <button
                      type="button"
                      onClick={() => updateCurrentPage({ angle: Math.max(-15, Math.round((currentAngle - 0.5) * 10) / 10) })}
                      className="px-2 py-1 rounded-lg border border-[var(--pms-border)] font-mono font-bold hover:border-amber-500 cursor-pointer"
                    >
                      -0.5°
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCurrentPage({ angle: 0 })}
                      className="text-amber-600 dark:text-amber-400 font-bold hover:underline cursor-pointer"
                    >
                      Reset 0°
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCurrentPage({ angle: Math.min(15, Math.round((currentAngle + 0.5) * 10) / 10) })}
                      className="px-2 py-1 rounded-lg border border-[var(--pms-border)] font-mono font-bold hover:border-amber-500 cursor-pointer"
                    >
                      +0.5°
                    </button>
                  </div>
                </div>

                {/* 3. Rotation, Corner-Safe Fit & Dark Border Trim */}
                <div className="p-4 rounded-2xl border border-[var(--pms-border)] bg-white/80 dark:bg-slate-900/75 space-y-2.5 text-xs">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => updateCurrentPage({ rotation90: (currentRot90 + 90) % 360 })}
                      className="flex-1 py-2 px-2.5 rounded-xl border border-[var(--pms-border)] bg-white dark:bg-slate-800 font-semibold hover:border-amber-500 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <RotateCw className="w-3.5 h-3.5" /> Rotate 90° ({currentRot90}°)
                    </button>
                    {pageCount > 1 && (
                      <button
                        type="button"
                        onClick={applyCurrentToAll}
                        className="px-2.5 py-2 rounded-xl border border-[var(--pms-border)] bg-white dark:bg-slate-800 font-semibold text-amber-700 dark:text-amber-400 hover:border-amber-500 cursor-pointer"
                      >
                        Apply All
                      </button>
                    )}
                  </div>

                  <label className="flex items-center justify-between cursor-pointer pt-1">
                    <span className="font-medium flex items-center gap-1.5">
                      <Maximize2 className="w-3.5 h-3.5 text-sky-600" /> Scale-to-Fit (No Clipping)
                    </span>
                    <input
                      type="checkbox"
                      checked={scaleToFit}
                      onChange={(e) => setScaleToFit(e.target.checked)}
                      className="w-4 h-4 accent-amber-600"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="font-medium flex items-center gap-1.5">
                      <Crop className="w-3.5 h-3.5 text-amber-600" /> Trim Black Scanner Borders
                    </span>
                    <input
                      type="checkbox"
                      checked={trimDarkBorders}
                      onChange={(e) => setTrimDarkBorders(e.target.checked)}
                      className="w-4 h-4 accent-amber-600"
                    />
                  </label>
                </div>
              </div>

              <div className="mt-5 pt-5 border-t border-[var(--pms-border)] flex justify-end">
                <motion.button
                  whileHover={prefersReduced ? undefined : { scale: 1.01 }}
                  whileTap={prefersReduced ? undefined : { scale: 0.99 }}
                  onClick={processDeskew}
                  disabled={busy}
                  className="pms-btn-primary inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl font-bold text-white disabled:opacity-50 cursor-pointer"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Compass className="w-4 h-4" />}
                  <span>{busy ? 'Straightening Document...' : 'Save Straightened PDF'}</span>
                </motion.button>
              </div>
            </div>

            {/* Live Straightening Visualizer */}
            <div className="pms-glass-panel rounded-3xl p-5 text-center relative overflow-hidden">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[var(--pms-rose)]" />
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Live Alignment View (Page {currentPage} of {pageCount})
                  </h4>
                </div>
                {pageCount > 1 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => void handlePageChange(currentPage - 1)}
                      disabled={currentPage <= 1 || loadingPreview}
                      className="p-1.5 rounded-lg border border-[var(--pms-border)] bg-white dark:bg-slate-900 disabled:opacity-35 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <select
                      value={currentPage}
                      onChange={(e) => void handlePageChange(Number(e.target.value))}
                      className="px-2.5 py-1 rounded-lg border border-[var(--pms-border)] bg-white dark:bg-slate-800 text-xs font-mono"
                    >
                      {pages.map((p) => (
                        <option key={p.num} value={p.num}>
                          Page {p.num} {p.angle !== 0 ? `(${p.angle > 0 ? '+' : ''}${p.angle}°)` : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void handlePageChange(currentPage + 1)}
                      disabled={currentPage >= pageCount || loadingPreview}
                      className="p-1.5 rounded-lg border border-[var(--pms-border)] bg-white dark:bg-slate-900 disabled:opacity-35 cursor-pointer"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {previewDataUrl ? (
                <div className="relative inline-block border-2 border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden shadow-lg bg-white">
                  <div
                    className="transition-transform duration-150 origin-center"
                    style={{ transform: `rotate(${currentAngle + currentRot90}deg)` }}
                  >
                    <img
                      src={previewDataUrl}
                      alt="Deskew Preview"
                      className="max-h-[520px] w-auto object-contain block mx-auto"
                    />
                  </div>
                  {showGrid && (
                    <div className="absolute inset-0 pointer-events-none grid grid-rows-12 border border-sky-400/40">
                      {Array.from({ length: 11 }).map((_, i) => (
                        <div key={i} className="border-b border-dashed border-sky-500/45" />
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

            {/* Success Card */}
            <AnimatePresence>
              {resultUrl && (
                <motion.div
                  initial={prefersReduced ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReduced ? undefined : { opacity: 0, y: -8 }}
                  className="p-6 md:p-8 rounded-3xl bg-gradient-to-br from-emerald-50/90 via-white/85 to-teal-50/80 dark:from-emerald-950/45 dark:via-slate-900/85 dark:to-teal-950/35 border border-emerald-200/80 dark:border-emerald-800/70 shadow-lg text-center"
                >
                  <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-emerald-950 dark:text-emerald-100 mb-1">
                    Deskewing Complete!
                  </h3>
                  <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-5">
                    All pages straightened cleanly with {scaleToFit ? 'corner-safe fit' : 'exact scale'}
                    {trimDarkBorders ? ' & dark borders trimmed' : ''}.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <a
                      href={resultUrl}
                      download={resultName}
                      className="pms-btn-primary inline-flex items-center gap-2 px-7 py-3 rounded-2xl font-bold text-white"
                    >
                      <Download className="w-4 h-4" /> Download Straightened PDF
                    </a>
                    <a
                      href={resultUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-semibold text-emerald-800 dark:text-emerald-200 bg-white dark:bg-slate-800 border border-[var(--pms-border)]"
                    >
                      <Eye className="w-4 h-4" /> Preview PDF
                    </a>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </PearlStageSwitch>

      <ToolSEOSection
        toolName="Deskew PDF Pro"
        headline="Automatically Straighten Crooked Scanned PDFs & Camera Photos"
        description="Coarse-to-fine gradient row-projection automatically finds exact text-line tilt up to ±15° with 0.1° precision. Batch auto-deskew multi-page PDFs in one click and trim ugly black scanner-lid borders."
        faqs={[
          {
            q: 'Can it auto-straighten every page with a different tilt angle?',
            a: 'Yes! Click "Auto-Deskew ALL Pages" to automatically analyze and straighten each page independently.',
          },
          {
            q: 'Will rotating cut off text near the corners?',
            a: 'Keep "Scale-to-Fit (No Clipping)" enabled to fit the full rotated page neatly without clipping edge margins.',
          },
        ]}
      />
    </ToolWorkspaceShell>
  );
}
