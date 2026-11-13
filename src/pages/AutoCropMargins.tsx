import { useState, useEffect } from 'react';
import {
  Crop, Download, Loader2, Sparkles, Sliders, ChevronLeft, ChevronRight,
  Check, Eye
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { apiFetch } from '../lib/api';
import { toArrayBufferBytes } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

export default function AutoCropMargins() {
  useSEO(
    'Auto-Crop PDF Margins Online Free — Non-Destructive Vector Margin Cropper',
    'Automatically crop white margins and borders from PDF files online. Preserves 100% vector text quality, detects content bounding boxes, with customizable padding slider.'
  );

  usePageSEO(
    'Smart PDF Margin Auto-Cropper Studio — Lossless Vector Cropping',
    'Remove excessive white margins from scanned documents, lecture slides, and books. Features lossless CropBox vector trimming and automatic content boundary detection.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [paddingPt, setPaddingPt] = useState(15);
  const [uniformCrop, setUniformCrop] = useState(true);

  const [pageImages, setPageImages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);

  const [busy, setBusy] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFileName, setResultFileName] = useState('');
  const [engineUsed, setEngineUsed] = useState<'backend' | 'client-vector'>('backend');
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    const f = files[0];
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFile(f);
    setResultUrl(null);
    setCurrentPage(0);
    setBusy(true);

    try {
      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const imgs: string[] = [];

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
        imgs.push(canvas.toDataURL('image/jpeg', 0.88));
      }

      setPageImages(imgs);
    } catch (err) {
      console.error('Failed to load PDF:', err);
    } finally {
      setBusy(false);
    }
  };

  const executeAutoCrop = async () => {
    if (!file) return;
    setBusy(true);
    setProgressMsg('Detecting content bounding boxes...');

    try {
      // ── Strategy A: Backend PyMuPDF Vector Engine ────────────────
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('padding_pt', paddingPt.toString());

        const res = await apiFetch('/convert/auto-crop', {
          method: 'POST',
          body: fd,
          timeoutMs: 60000,
        });

        if (res.ok) {
          const blob = await res.blob();
          setResultUrl(URL.createObjectURL(blob));
          setResultFileName(`autocropped_${file.name}`);
          setEngineUsed('backend');
          setBusy(false);
          return;
        }
      } catch (backendErr) {
        console.warn('Backend auto-crop failed, falling back to client-side vector CropBox:', backendErr);
      }

      // ── Strategy B: Non-Destructive Vector CropBox Trimming ─────────
      // Instead of turning the PDF into raster images, we calculate the content
      // bounding box and adjust the CropBox on the original vector document!
      // This preserves 100% of the vector text, links, bookmarks, and keeps the file tiny.
      const buf = await file.arrayBuffer();
      const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
      const pages = pdfDoc.getPages();

      for (let p = 1; p <= pdfjsDoc.numPages; p++) {
        setProgressMsg(`Calculating bounding box for page ${p} of ${pdfjsDoc.numPages}...`);
        const page = await pdfjsDoc.getPage(p);
        const vp = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;

        let minX = canvas.width;
        let minY = canvas.height;
        let maxX = 0;
        let maxY = 0;

        for (let y = 0; y < canvas.height; y += 2) {
          for (let x = 0; x < canvas.width; x += 2) {
            const idx = (y * canvas.width + x) * 4;
            // Detect non-white pixel (threshold 245)
            if (d[idx] < 245 || d[idx + 1] < 245 || d[idx + 2] < 245) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        // If page is not completely blank
        if (maxX > minX && maxY > minY) {
          const docPage = pages[p - 1];
          const { width, height } = docPage.getSize();

          // Convert canvas pixels to PDF points
          const scaleX = width / canvas.width;
          const scaleY = height / canvas.height;

          const padPt = paddingPt;
          const pdfMinX = Math.max(0, minX * scaleX - padPt);
          const pdfMaxX = Math.min(width, maxX * scaleX + padPt);
          // In PDF, Y is measured from bottom-up
          const pdfMinY = Math.max(0, height - (maxY * scaleY) - padPt);
          const pdfMaxY = Math.min(height, height - (minY * scaleY) + padPt);

          const cropWidth = Math.max(pdfMaxX - pdfMinX, 50);
          const cropHeight = Math.max(pdfMaxY - pdfMinY, 50);

          docPage.setCropBox(pdfMinX, pdfMinY, cropWidth, cropHeight);
        }

        canvas.width = 0;
        canvas.height = 0;
      }

      const cleanBytes = await pdfDoc.save();
      const blob = new Blob([toArrayBufferBytes(cleanBytes)], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
      setResultFileName(`autocropped_${file.name}`);
      setEngineUsed('client-vector');
    } catch (err: any) {
      console.error('Auto crop error:', err);
      alert(`Auto-crop failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setBusy(false);
      setProgressMsg('');
    }
  };

  const reset = () => {
    setFile(null);
    setResultUrl(null);
  };

  return (
    <ToolWorkspaceShell
      title="Smart PDF Margin Auto-Cropper"
      subtitle="Automatically trim excessive white margins from documents, scanned books, and slides without losing vector sharpness or selectable text."
      categoryLabel="Lossless Vector Margin Trimmer"
      icon={Crop}
      microVariant="crop"
      tone="rose"
    >
      <div className="flex flex-col items-center justify-start max-w-6xl mx-auto w-full">
        <PearlStageSwitch
          stageKey={!file ? 'upload' : resultUrl ? 'result' : 'workspace'}
          className="w-full"
        >
          {!file ? (
            <div className="w-full max-w-2xl mx-auto space-y-6">
              <FileDropzone
                onDrop={handleDrop}
                multiple={false}
                title="Select PDF Document to Auto-Crop Margins"
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="pms-glass-panel p-4 rounded-2xl text-center">
                  <Sparkles className="w-6 h-6 text-[var(--pms-rose)] mx-auto mb-2" />
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Lossless Vector Crop</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Sets CropBox metadata so vector text and hyperlinks stay crisp.</p>
                </div>
                <div className="pms-glass-panel p-4 rounded-2xl text-center">
                  <Sliders className="w-6 h-6 text-[var(--pms-blue)] mx-auto mb-2" />
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Adjustable Padding</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Leave breathing room around your content with custom point padding.</p>
                </div>
                <div className="pms-glass-panel p-4 rounded-2xl text-center">
                  <Eye className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Compact File Size</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Zero re-encoding means file size never blows up.</p>
                </div>
              </div>
            </div>
          ) : resultUrl ? (
            /* Result Screen */
            <div className="w-full max-w-xl mx-auto p-8 rounded-3xl bg-gradient-to-br from-emerald-50/90 via-white/85 to-teal-50/80 dark:from-emerald-950/45 dark:via-slate-900/85 dark:to-teal-950/35 border border-emerald-200/80 dark:border-emerald-800/70 backdrop-blur-md shadow-xl text-center space-y-6">
              <motion.div
                initial={prefersReduced ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 18 }}
                className="w-20 h-20 bg-emerald-100/90 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner"
              >
                <Check className="w-10 h-10" />
              </motion.div>

              <div>
                <span className="inline-block px-3 py-1 bg-emerald-100/90 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
                  Auto-Crop Complete
                </span>
                <h2 className="text-2xl font-extrabold text-emerald-950 dark:text-white">
                  Cropped PDF Ready!
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
                  White margins have been trimmed cleanly.
                  <br />
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-xs mt-1 inline-block">
                    {engineUsed === 'backend'
                      ? 'Processed with PyMuPDF High-Precision Vector Engine.'
                      : 'Processed with Non-Destructive Vector CropBox Engine.'}
                  </span>
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <motion.a
                  whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                  whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                  href={resultUrl}
                  download={resultFileName}
                  className="pms-btn-primary relative overflow-hidden flex-1 py-3.5 px-6 text-white font-bold rounded-2xl flex items-center justify-center gap-2"
                >
                  <span className="pms-shimmer" aria-hidden="true" />
                  <Download className="w-4 h-4 relative z-10" />
                  <span className="relative z-10">Download Cropped PDF</span>
                </motion.a>
                <button
                  onClick={reset}
                  className="py-3.5 px-6 bg-white/85 hover:bg-white dark:bg-slate-800/85 dark:hover:bg-slate-800 border border-[var(--pms-border)] text-slate-700 dark:text-slate-200 font-semibold rounded-2xl transition-colors"
                >
                  Crop Another PDF
                </button>
              </div>
            </div>
          ) : (
            /* Adjust Settings & Preview */
            <div className="w-full pms-glass-panel rounded-3xl p-5 md:p-7 relative overflow-hidden">
              <PearlScanOverlay
                active={busy}
                label={progressMsg || 'Detecting content bounds & cropping margins...'}
              />

              <div className="w-full flex flex-col lg:flex-row gap-6">
                {/* Controls */}
                <div className="w-full lg:w-80 shrink-0 space-y-5">
                  <div className="bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] p-5 shadow-xs space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Crop Settings
                    </h3>

                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          <span>Content Padding</span>
                          <span className="text-[var(--pms-rose)] font-bold">{paddingPt} pt</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="50"
                          value={paddingPt}
                          onChange={(e) => setPaddingPt(parseInt(e.target.value))}
                          className="w-full accent-rose-600"
                        />
                        <p className="text-[11px] text-slate-400 mt-1">
                          Adds safety margin around text so letters never touch the page edge.
                        </p>
                      </div>

                      <div className="pt-3 border-t border-[var(--pms-border)]">
                        <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <Sparkles className="w-4 h-4" /> Non-Destructive Vector Mode Active
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                          Your PDF vector text, searchable words, and crisp fonts will be 100% preserved.
                        </p>
                      </div>
                    </div>

                    <motion.button
                      whileHover={prefersReduced ? undefined : { scale: 1.01 }}
                      whileTap={prefersReduced ? undefined : { scale: 0.99 }}
                      onClick={executeAutoCrop}
                      disabled={busy}
                      className="pms-btn-primary relative overflow-hidden w-full py-3.5 px-4 text-white font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
                    >
                      <span className="pms-shimmer" aria-hidden="true" />
                      {busy ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin relative z-10" />
                          <span className="relative z-10">{progressMsg || 'Cropping Margins...'}</span>
                        </>
                      ) : (
                        <>
                          <Crop className="w-4 h-4 relative z-10" />
                          <span className="relative z-10">Auto-Crop Margins</span>
                        </>
                      )}
                    </motion.button>
                  </div>
                </div>

                {/* Document Preview */}
                <div className="flex-1 flex flex-col items-center">
                  <div className="flex items-center gap-3 mb-3 text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(p - 1, 0))}
                      disabled={currentPage === 0}
                      className="p-1.5 rounded-xl border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span>Page {currentPage + 1} of {pageImages.length}</span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(p + 1, pageImages.length - 1))}
                      disabled={currentPage === pageImages.length - 1}
                      className="p-1.5 rounded-xl border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="relative border border-slate-200 dark:border-slate-700 shadow-xl bg-white select-none overflow-hidden rounded-xl max-w-full">
                    <img
                      src={pageImages[currentPage]}
                      alt={`Page ${currentPage + 1}`}
                      className="max-h-[75vh] object-contain mx-auto block pointer-events-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </PearlStageSwitch>
      </div>
    </ToolWorkspaceShell>
  );
}
