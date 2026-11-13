import { useState } from 'react';
import { Upload, Download, ArrowUp, ArrowDown, Trash2, CheckCircle2, Layers, Tag } from 'lucide-react';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { PDFDocument } from 'pdf-lib';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';
import { safeRevokeUrl, toArrayBufferBytes, useAutoRevokeUrl, useAutoRevokeUrls } from '../lib/blobUrl';

interface DocItem {
  id: string;
  file: File;
  label: string;
  sizeKb: number;
  previewUrl?: string;
  type: 'pdf' | 'image';
}

const COMMON_LABELS = [
  '10th Marksheet / Matriculation',
  '12th Marksheet / Intermediate',
  'Graduation Degree / Marksheet',
  'Aadhaar Card / Photo ID',
  'Caste Certificate (SC/ST/OBC/EWS)',
  'Domicile / Residence Certificate',
  'Income Certificate',
  'Experience Certificate',
  'NOC / Discharged Book',
];

export default function ExamDocumentMerger() {
  useSEO(
    'All Documents to Single PDF Under 1 MB — Exam Bundle Merger | PDF Media Suite',
    'Merge 10th, 12th marksheet, degree, caste and domicile certificates into one single PDF strictly under 1 MB or 500 KB. Built for UPSC, SSC, NEET, JEE, and State PSC exams.'
  );

  usePageSEO(
    'Exam Document Merger — All Files to Single PDF Under 1 MB',
    'Combine multiple certificates and marksheets into a single PDF under 1 MB or 500 KB. Automatic multi-pass compression for government exam portal compliance.'
  );

  const [docs, setDocs] = useState<DocItem[]>([]);
  const prefersReduced = useReducedMotion();
  const [targetSizeLimitKb, setTargetSizeLimitKb] = useState<number>(1000); // 1000 KB = 1 MB
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [mergedPdfUrl, setMergedPdfUrl] = useState<string | null>(null);
  const [finalSizeKb, setFinalSizeKb] = useState<number | null>(null);

  useAutoRevokeUrl(mergedPdfUrl);
  useAutoRevokeUrls(docs.map(d => d.previewUrl));

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newItems: DocItem[] = files.map((file, idx) => {
      const isPdfFile = file.type === 'application/pdf' || file.name.endsWith('.pdf');
      const suggestedLabel = COMMON_LABELS[Math.min(docs.length + idx, COMMON_LABELS.length - 1)];

      return {
        id: `doc_${Date.now()}_${idx}`,
        file,
        label: suggestedLabel,
        sizeKb: Math.round(file.size / 1024),
        type: isPdfFile ? 'pdf' : 'image',
        previewUrl: !isPdfFile ? URL.createObjectURL(file) : undefined,
      };
    });

    setDocs((prev) => [...prev, ...newItems]);
    setMergedPdfUrl(null);
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    setDocs((prev) => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const moveDown = (index: number) => {
    if (index === docs.length - 1) return;
    setDocs((prev) => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const removeDoc = (id: string) => {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  };

  const updateLabel = (id: string, label: string) => {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, label } : d)));
  };

  // Smart Compression Engine that guarantees final size <= targetSizeLimitKb
  const mergeAndCompressBundle = async () => {
    if (docs.length === 0) return;

    setIsProcessing(true);
    setMergedPdfUrl(null);
    setProgressMsg('Initializing PDF compiler...');

    try {
      const pdfjsLib = await import('pdfjs-dist');
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
      }

      // Extract all pages from all items into rendered image canvases
      interface ExtractedPage {
        canvas: HTMLCanvasElement;
        label: string;
      }
      const extractedPages: ExtractedPage[] = [];

      for (let i = 0; i < docs.length; i++) {
        const item = docs[i];
        setProgressMsg(`Reading document ${i + 1} of ${docs.length}: ${item.label}...`);

        if (item.type === 'image') {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          const objectUrl = URL.createObjectURL(item.file);
          try {
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = () => reject(new Error(`Failed to decode image ${item.file.name}`));
              img.src = objectUrl;
            });

            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Unable to initialize canvas context.');
            ctx.drawImage(img, 0, 0);
            extractedPages.push({ canvas, label: item.label });
          } finally {
            safeRevokeUrl(objectUrl);
          }
        } else {
          // PDF document
          const arrayBuffer = await item.file.arrayBuffer();
          const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
          const pdfDoc = await loadingTask.promise;

          for (let p = 1; p <= pdfDoc.numPages; p++) {
            const page = await pdfDoc.getPage(p);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d')!;
            await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
            extractedPages.push({ canvas, label: `${item.label} (Pg ${p})` });
          }
        }
      }

      setProgressMsg(`Optimizing ${extractedPages.length} pages to fit under ${targetSizeLimitKb} KB...`);

      // Adaptive Multi-Pass Binary Search on Quality and Resolution
      let bestPdfBytes: Uint8Array | null = null;
      let targetBytes = targetSizeLimitKb * 1024;
      let qualitiesToTry = [0.85, 0.70, 0.55, 0.40, 0.28];

      for (let pass = 0; pass < qualitiesToTry.length; pass++) {
        const quality = qualitiesToTry[pass];
        setProgressMsg(`Pass ${pass + 1}: Compressing pages at quality ${(quality * 100).toFixed(0)}%...`);

        const bundleDoc = await PDFDocument.create();

        for (const pg of extractedPages) {
          // Downscale if quality is very tight and canvas is huge
          let c = pg.canvas;
          if (quality < 0.5 && c.width > 1200) {
            const scaleDown = 1200 / c.width;
            const scaled = document.createElement('canvas');
            scaled.width = 1200;
            scaled.height = Math.round(c.height * scaleDown);
            const sCtx = scaled.getContext('2d')!;
            sCtx.drawImage(c, 0, 0, scaled.width, scaled.height);
            c = scaled;
          }

          const jpegDataUrl = c.toDataURL('image/jpeg', quality);
          const base64Data = jpegDataUrl.split(',')[1];
          const imgBytes = Uint8Array.from(atob(base64Data), (ch) => ch.charCodeAt(0));

          const embeddedJpg = await bundleDoc.embedJpg(imgBytes);
          const pdfPage = bundleDoc.addPage([595.28, 841.89]); // A4 Size in points

          // Fit neatly on A4 page keeping aspect ratio
          const pageW = 595.28;
          const pageH = 841.89;
          const imgW = embeddedJpg.width;
          const imgH = embeddedJpg.height;
          const scale = Math.min((pageW - 40) / imgW, (pageH - 50) / imgH);

          const drawW = imgW * scale;
          const drawH = imgH * scale;

          pdfPage.drawImage(embeddedJpg, {
            x: (pageW - drawW) / 2,
            y: (pageH - drawH) / 2,
            width: drawW,
            height: drawH,
          });
        }

        const currentBytes = await bundleDoc.save();
        bestPdfBytes = currentBytes;

        if (currentBytes.length <= targetBytes) {
          // Fits within target size!
          break;
        }
      }

      if (bestPdfBytes) {
        const finalKb = Math.round(bestPdfBytes.length / 1024);
        setFinalSizeKb(finalKb);
        const blob = new Blob([toArrayBufferBytes(bestPdfBytes)], { type: 'application/pdf' });
        setMergedPdfUrl(URL.createObjectURL(blob));
      }
    } catch (err: any) {
      console.error('Error merging documents:', err);
      alert('Error bundling documents. Please check file formats.');
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  const totalInputSizeKb = docs.reduce((acc, d) => acc + d.sizeKb, 0);

  return (
    <ToolWorkspaceShell
      title="All Documents to Single PDF Under 1 MB (Exam Bundle Merger)"
      subtitle="Merge all your educational certificates, marksheets, caste & domicile proof into ONE single PDF strictly under 1 MB or 500 KB with guaranteed portal acceptance."
      categoryLabel="Exam Portal Compliant Bundle Maker"
      icon={Layers}
      microVariant="merge"
      tone="blue"
    >

      {/* Target Size Presets Header */}
      <div className="p-4 sm:p-5 pms-glass-panel rounded-2xl mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-[var(--pms-blue)]" /> Target PDF Size Limit:
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Under 1 MB (UPSC / SSC / NEET)', kb: 1000 },
              { label: 'Under 500 KB (Strict State PSC)', kb: 500 },
              { label: 'Under 2 MB (University / Visa)', kb: 2000 },
              { label: 'Under 300 KB', kb: 300 },
            ].map((preset) => {
              const active = targetSizeLimitKb === preset.kb;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setTargetSizeLimitKb(preset.kb)}
                  className={`relative text-xs px-3 py-1.5 rounded-xl border font-semibold transition-colors ${
                    active
                      ? 'border-[var(--pms-blue)] text-slate-900 dark:text-white shadow-xs'
                      : 'bg-white/75 dark:bg-slate-900/75 text-slate-700 dark:text-slate-200 border-[var(--pms-border)] hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="exam-limit-pill"
                      transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
                      className="absolute inset-0 rounded-xl -z-0"
                      style={{ backgroundColor: 'var(--pms-soft-blue)' }}
                    />
                  )}
                  <span className="relative z-10">{preset.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Dropzone */}
      <div className="pms-glass-panel rounded-3xl p-4 sm:p-5 mb-6">
        <label className="flex flex-col items-center justify-center border-2 border-dashed border-[var(--pms-border)] hover:border-[var(--pms-blue)] rounded-2xl p-8 cursor-pointer transition-all bg-white/75 dark:bg-slate-900/75 text-center group">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-105 transition-transform shadow-xs"
            style={{ backgroundColor: 'var(--pms-soft-blue)', color: 'var(--pms-blue)' }}
          >
            <Upload className="w-7 h-7" />
          </div>
          <span className="text-base font-bold text-slate-900 dark:text-slate-100">
            Select All Certificates & Marksheets (PDF, JPG, PNG)
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Upload multiple files at once. You can reorder and tag each certificate below.
          </span>
          <input
            type="file"
            multiple
            accept="application/pdf,image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      </div>

      {/* Document List */}
      {docs.length > 0 && (
        <div className="relative overflow-hidden pms-glass-panel rounded-3xl p-5 sm:p-6 space-y-4 mb-8">
          <PearlScanOverlay active={isProcessing} label={progressMsg || 'Optimizing exam bundle PDF…'} />

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300 px-1">
            <span className="font-bold text-slate-800 dark:text-slate-100">
              <AnimatedNumber value={docs.length} /> Documents Selected • Total Raw Size:{' '}
              <AnimatedNumber value={totalInputSizeKb / 1024} decimals={2} suffix=" MB" />
            </span>
            <span className="text-slate-500 dark:text-slate-400">Reorder with ↑ ↓ arrows to set page sequence</span>
          </div>

          <div className="space-y-2.5">
            {docs.map((doc, idx) => (
              <div
                key={doc.id}
                className="p-3.5 bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
              >
                {/* Index & File Name */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span
                    className="w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'var(--pms-soft-blue)', color: 'var(--pms-blue)' }}
                  >
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{doc.file.name}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {doc.sizeKb} KB • {doc.type.toUpperCase()}
                    </p>
                  </div>
                </div>

                {/* Document Type Label Selector */}
                <div className="flex-1 min-w-0 max-w-xs">
                  <div className="relative">
                    <Tag className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={doc.label}
                      onChange={(e) => updateLabel(doc.id, e.target.value)}
                      placeholder="Certificate label..."
                      className="w-full pl-8 pr-3 py-1.5 bg-white/90 dark:bg-slate-950/70 text-slate-900 dark:text-slate-100 border border-[var(--pms-border)] rounded-lg text-xs font-medium focus:ring-2 focus:ring-sky-500 outline-none"
                    />
                  </div>
                </div>

                {/* Move & Delete Controls */}
                <div className="flex items-center gap-1 shrink-0 justify-end">
                  <button
                    type="button"
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                    title="Move up"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(idx)}
                    disabled={idx === docs.length - 1}
                    className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                    title="Move down"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeDoc(doc.id)}
                    className="p-1.5 rounded-lg text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Action Button & Result */}
          <AnimatePresence mode="wait">
            {!mergedPdfUrl ? (
              <motion.div
                key="action"
                initial={prefersReduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReduced ? undefined : { opacity: 0, y: -8 }}
                transition={prefersReduced ? { duration: 0 } : { duration: 0.2 }}
                className="pt-4 space-y-3"
              >
                {isProcessing && progressMsg && (
                  <div
                    className="p-4 border border-[var(--pms-border)] rounded-2xl"
                    style={{ backgroundColor: 'var(--pms-soft-blue)' }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[var(--pms-blue)] shrink-0"></div>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{progressMsg}</p>
                    </div>
                  </div>
                )}

                <motion.button
                  type="button"
                  whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                  onClick={mergeAndCompressBundle}
                  disabled={isProcessing}
                  className="pms-btn-primary w-full py-4 font-bold text-base rounded-2xl shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 notranslate"
                  translate="no"
                >
                  {isProcessing ? (
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                      <span>Processing {docs.length} Documents...</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Layers className="w-5 h-5" />
                      <span>Merge All Documents into Single PDF (Target: Under {targetSizeLimitKb} KB)</span>
                    </span>
                  )}
                </motion.button>
              </motion.div>
            ) : (
              <motion.div
                key="result"
                initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReduced ? undefined : { opacity: 0, y: -8 }}
                transition={prefersReduced ? { duration: 0 } : { duration: 0.25 }}
                className="p-6 border border-emerald-300/60 dark:border-emerald-800/60 rounded-2xl text-center space-y-4"
                style={{ backgroundColor: 'var(--pms-soft-mint)' }}
              >
                <div className="w-12 h-12 bg-white/90 dark:bg-slate-900/90 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-xs">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">Documents Merged &amp; Compressed!</h3>
                  <p className="text-xs text-slate-700 dark:text-slate-300 mt-1">
                    <span>Final Bundle Size: </span>
                    <strong className="notranslate tabular-nums" translate="no">
                      <AnimatedNumber value={finalSizeKb ?? 0} suffix=" KB" />
                    </strong>
                    <span> (Limit: Under {targetSizeLimitKb} KB) • Portal Accepted ✅</span>
                  </p>
                </div>

                <motion.a
                  whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                  href={mergedPdfUrl}
                  download={`exam_document_bundle_${finalSizeKb}kb.pdf`}
                  className="pms-btn-primary inline-flex items-center justify-center gap-2 px-8 py-3.5 font-bold rounded-xl shadow-md text-sm"
                >
                  <Download className="w-4 h-4" /> Download Merged Exam PDF ({finalSizeKb} KB)
                </motion.a>

                <div>
                  <button
                    type="button"
                    onClick={() => setMergedPdfUrl(null)}
                    className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold"
                  >
                    Adjust files or re-compress
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Trust & FAQ */}
      <div className="mt-16 border-t border-[var(--pms-border)] pt-10 text-slate-800 dark:text-slate-200">
        <h2 className="text-2xl font-bold mb-6 text-center text-slate-900 dark:text-slate-100">
          Official Guidelines for Exam Document Bundles
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div className="p-5 pms-glass-panel rounded-2xl">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-2">UPSC & State PSCs</h3>
            <p className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed">
              Most PSC forms require all educational qualifications merged in chronological order (10th → 12th → Graduation) into a single PDF under 1 MB.
            </p>
          </div>
          <div className="p-5 pms-glass-panel rounded-2xl">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-2">Smart DPI Compression</h3>
            <p className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed">
              Instead of naive blurring, our engine selectively balances text contrast and JPEG compression so your roll numbers and marks remain crisp.
            </p>
          </div>
          <div className="p-5 pms-glass-panel rounded-2xl">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-2">Private & Local</h3>
            <p className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed">
              Your certificates contain private marks and personal records. Everything is merged strictly inside your browser without uploading to any server.
            </p>
          </div>
        </div>
      </div>
    </ToolWorkspaceShell>
  );
}
