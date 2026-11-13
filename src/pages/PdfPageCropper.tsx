import React, { useState, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Crop, Download, Loader2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { PDFDocument } from 'pdf-lib';
import FileDropzone from '../components/FileDropzone';
import { useSEO } from '../hooks/useSEO';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

export default function PdfPageCropper() {
  useSEO('Pdf Page Cropper Online Free | PDF Media Suite', 'Free online Pdf Page Cropper tool. No signup or installation required.');

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageImage, setPageImage] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageDim, setPageDim] = useState({ w: 0, h: 0 });
  const [renderScale, setRenderScale] = useState(1);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  useAutoRevokeUrl(resultUrl);
  const [applyToAll, setApplyToAll] = useState(true);

  // Crop rect in percentages (0-100)
  const [cropTop, setCropTop] = useState(0);
  const [cropBottom, setCropBottom] = useState(0);
  const [cropLeft, setCropLeft] = useState(0);
  const [cropRight, setCropRight] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);

  const handleDrop = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setResultUrl(null);
    setCropTop(0); setCropBottom(0); setCropLeft(0); setCropRight(0);
    setBusy(true);
    try {
      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      setPageCount(pdf.numPages);
      await renderPage(pdf, 1);
    } catch (e: any) {
      alert(e?.message || 'Load failed.');
    } finally {
      setBusy(false);
    }
  };

  const renderPage = async (pdf: pdfjsLib.PDFDocumentProxy | null, pageNum: number) => {
    if (!pdf && file) {
      const buf = await file.arrayBuffer();
      pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    }
    if (!pdf) return;
    const page = await pdf.getPage(pageNum);
    const vp1 = page.getViewport({ scale: 1 });
    setPageDim({ w: vp1.width, h: vp1.height });
    const maxW = 500;
    const scale = Math.min(1.5, maxW / vp1.width);
    setRenderScale(scale);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
    setPageImage(canvas.toDataURL('image/jpeg', 0.85));
    setCurrentPage(pageNum);
    canvas.width = 0; canvas.height = 0;
  };

  const navigatePage = async (dir: number) => {
    const target = currentPage + dir;
    if (target < 1 || target > pageCount) return;
    setBusy(true);
    await renderPage(null, target);
    setBusy(false);
  };

  const applyCrop = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(buf);
      const pages = pdfDoc.getPages();

      const pagesToCrop = applyToAll ? pages : [pages[currentPage - 1]];

      for (const page of pagesToCrop) {
        const { width, height } = page.getSize();
        const newX = (cropLeft / 100) * width;
        const newY = (cropBottom / 100) * height;
        const newW = width - ((cropLeft + cropRight) / 100) * width;
        const newH = height - ((cropTop + cropBottom) / 100) * height;

        page.setCropBox(newX, newY, newW, newH);
        page.setMediaBox(newX, newY, newW, newH);
      }

      const pdfBytes = toArrayBufferBytes(await pdfDoc.save());
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      alert(e?.message || 'Crop failed.');
    } finally {
      setBusy(false);
    }
  };

  const displayW = pageDim.w * renderScale;
  const displayH = pageDim.h * renderScale;
  const prefersReduced = useReducedMotion();

  return (
    <ToolWorkspaceShell
      title="PDF Page Cropper"
      subtitle="Visually crop PDF pages — remove margins, trim whitespace."
      categoryLabel="Precision Viewport Crop"
      icon={Crop}
      microVariant="crop"
      tone="amber"
      trustNote="Non-destructive CropBox & MediaBox framing · Runs 100% locally"
    >
      <PearlStageSwitch stageKey={!file ? 'drop' : 'studio'}>
        {!file ? (
          <div className="max-w-2xl mx-auto">
            <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF to crop" />
          </div>
        ) : (
          <div className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
            {/* Preview with crop overlay */}
            <div className="pms-glass-panel rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-3 justify-center text-sm text-gray-700 dark:text-slate-300">
                <button
                  onClick={() => navigatePage(-1)}
                  disabled={currentPage <= 1 || busy}
                  className="px-3.5 py-1.5 bg-white/80 dark:bg-slate-800 border border-[var(--pms-border)] rounded-xl font-bold disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  ←
                </button>
                <span className="font-bold px-2">
                  Page {currentPage} of {pageCount}
                </span>
                <button
                  onClick={() => navigatePage(1)}
                  disabled={currentPage >= pageCount || busy}
                  className="px-3.5 py-1.5 bg-white/80 dark:bg-slate-800 border border-[var(--pms-border)] rounded-xl font-bold disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  →
                </button>
              </div>

              <div
                ref={containerRef}
                className="relative mx-auto bg-gray-100 dark:bg-slate-800 rounded-2xl overflow-hidden border border-[var(--pms-border)] shadow-inner flex items-center justify-center"
                style={{
                  width: displayW > 0 ? displayW + 2 : 360,
                  height: displayH > 0 ? displayH + 2 : 280,
                }}
              >
                <PearlScanOverlay active={busy} label={pageImage ? 'Applying precision crop…' : 'Rendering PDF preview…'} />
                {pageImage && <img src={pageImage} alt="Page" className="block" style={{ width: displayW, height: displayH }} draggable={false} />}

                {/* Crop overlays */}
                <div
                  className="absolute left-0 right-0 top-0 bg-rose-500/20 border-b-2 border-rose-500 border-dashed pointer-events-none transition-[height] duration-75"
                  style={{ height: `${cropTop}%` }}
                />
                <div
                  className="absolute left-0 right-0 bottom-0 bg-rose-500/20 border-t-2 border-rose-500 border-dashed pointer-events-none transition-[height] duration-75"
                  style={{ height: `${cropBottom}%` }}
                />
                <div
                  className="absolute left-0 top-0 bottom-0 bg-rose-500/20 border-r-2 border-rose-500 border-dashed pointer-events-none transition-[width] duration-75"
                  style={{ width: `${cropLeft}%` }}
                />
                <div
                  className="absolute right-0 top-0 bottom-0 bg-rose-500/20 border-l-2 border-rose-500 border-dashed pointer-events-none transition-[width] duration-75"
                  style={{ width: `${cropRight}%` }}
                />
              </div>
            </div>

            {/* Controls */}
            <div className="pms-glass-panel rounded-3xl p-5 sm:p-6 space-y-4 h-fit">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-gray-900 dark:text-white">Crop Margins</h3>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[var(--pms-soft-rose)] text-[var(--pms-rose)]">
                  % Trim
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400">Adjust how much to trim from each edge (in %).</p>

              {([['Top', cropTop, setCropTop], ['Bottom', cropBottom, setCropBottom], ['Left', cropLeft, setCropLeft], ['Right', cropRight, setCropRight]] as const).map(([label, val, setter]) => (
                <label key={label} className="block text-xs font-bold text-gray-700 dark:text-slate-300">
                  <div className="flex items-center justify-between mb-1">
                    <span>{label}</span>
                    <span className="font-mono text-[var(--pms-rose)]">{val}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={45}
                    value={val}
                    onChange={e => setter(Number(e.target.value))}
                    className="w-full accent-rose-600 cursor-pointer"
                  />
                </label>
              ))}

              <div className="flex gap-2">
                <button
                  onClick={() => { setCropTop(5); setCropBottom(5); setCropLeft(5); setCropRight(5); }}
                  className="flex-1 px-2 py-2 text-xs font-bold bg-white/80 dark:bg-slate-800 border border-[var(--pms-border)] text-gray-700 dark:text-slate-300 rounded-xl hover:border-rose-300 dark:hover:border-rose-700 transition-colors cursor-pointer"
                >
                  5% all
                </button>
                <button
                  onClick={() => { setCropTop(10); setCropBottom(10); setCropLeft(10); setCropRight(10); }}
                  className="flex-1 px-2 py-2 text-xs font-bold bg-white/80 dark:bg-slate-800 border border-[var(--pms-border)] text-gray-700 dark:text-slate-300 rounded-xl hover:border-rose-300 dark:hover:border-rose-700 transition-colors cursor-pointer"
                >
                  10% all
                </button>
                <button
                  onClick={() => { setCropTop(0); setCropBottom(0); setCropLeft(0); setCropRight(0); }}
                  className="flex-1 px-2 py-2 text-xs font-bold bg-white/80 dark:bg-slate-800 border border-[var(--pms-border)] text-gray-700 dark:text-slate-300 rounded-xl hover:border-rose-300 dark:hover:border-rose-700 transition-colors cursor-pointer"
                >
                  Reset
                </button>
              </div>

              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-slate-300 cursor-pointer pt-1">
                <input type="checkbox" checked={applyToAll} onChange={e => setApplyToAll(e.target.checked)} className="rounded accent-rose-600" />
                Apply to all pages
              </label>

              <motion.button
                whileHover={prefersReduced || busy ? undefined : { scale: 1.01 }}
                whileTap={prefersReduced || busy ? undefined : { scale: 0.985 }}
                onClick={applyCrop}
                disabled={busy || (cropTop === 0 && cropBottom === 0 && cropLeft === 0 && cropRight === 0)}
                className="w-full pms-btn-primary py-3 rounded-2xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Crop className="w-5 h-5" />}
                {busy ? 'Cropping…' : 'Apply Crop'}
              </motion.button>

              <AnimatePresence>
                {resultUrl && (
                  <motion.a
                    initial={prefersReduced ? false : { opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={prefersReduced ? undefined : { opacity: 0, y: -6 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 24 }}
                    href={resultUrl}
                    download={`cropped_${file.name}`}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 text-sm transition-colors"
                  >
                    <Download className="w-4 h-4" /> Download Cropped PDF
                  </motion.a>
                )}
              </AnimatePresence>

              <button
                onClick={() => { setFile(null); setPageImage(null); setResultUrl(null); }}
                className="w-full py-2.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold text-sm hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                New PDF
              </button>
            </div>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
