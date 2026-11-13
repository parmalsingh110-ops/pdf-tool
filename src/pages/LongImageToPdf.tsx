import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Image, Download, Loader2, CheckCircle, SlidersHorizontal } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { safeRevokeUrl, toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

const PAGE_W = 595,
  PAGE_H = 842; // A4 pts at 72dpi
const PAGE_W_PX = PAGE_W * 2,
  PAGE_H_PX = PAGE_H * 2; // 144dpi render

export default function LongImageToPdf() {
  useSEO('Long Image To Pdf Online Free | PDF Media Suite', 'Free online Long Image To Pdf tool. No signup or installation required.');

  usePageSEO('Long Screenshot to PDF', 'Convert tall/long screenshots and WhatsApp-style images to a multi-page A4 PDF. Auto-sliced cleanly — free browser tool.');
  const [file, setFile] = useState<File | null>(null);
  const [overlap, setOverlap] = useState(20);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);

  const prefersReduced = useReducedMotion();
  useAutoRevokeUrl(resultUrl);

  const process = async () => {
    if (!file) return;
    setBusy(true);
    const imgUrl = URL.createObjectURL(file);
    try {
      const img = new window.Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = rej;
        img.src = imgUrl;
      });

      const srcW = img.naturalWidth,
        srcH = img.naturalHeight;
      const scale = PAGE_W_PX / srcW;
      const scaledH = Math.round(srcH * scale);
      const sliceH = PAGE_H_PX - overlap * 2;
      const slices: number[] = [];
      for (let y = 0; y < scaledH; y += sliceH) slices.push(y);

      const outDoc = await PDFDocument.create();
      for (const sliceY of slices) {
        const canvas = document.createElement('canvas');
        canvas.width = PAGE_W_PX;
        canvas.height = PAGE_H_PX;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, PAGE_W_PX, PAGE_H_PX);
        const srcSliceY = sliceY / scale;
        const srcSliceH = PAGE_H_PX / scale;
        ctx.drawImage(img, 0, srcSliceY, srcW, srcSliceH, 0, 0, PAGE_W_PX, PAGE_H_PX);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        const b64 = dataUrl.split(',')[1];
        const binStr = atob(b64);
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
        const jpgImg = await outDoc.embedJpg(bytes);
        const page = outDoc.addPage([PAGE_W, PAGE_H]);
        page.drawImage(jpgImg, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
        canvas.width = 0;
        canvas.height = 0;
      }

      const pdfBytes = toArrayBufferBytes(await outDoc.save());
      setPageCount(slices.length);
      setResultUrl(URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' })));
    } catch (e: any) {
      alert(e?.message || 'Processing failed.');
    } finally {
      safeRevokeUrl(imgUrl);
      setBusy(false);
    }
  };

  const stageKey = !file ? 'drop' : !resultUrl ? 'configure' : 'done';

  return (
    <ToolWorkspaceShell
      title="Long Image to PDF"
      subtitle="Convert tall screenshots, WhatsApp chats, and long infographics into a properly paginated A4 PDF."
      categoryLabel="Long-Scroll Pagination"
      icon={Image}
      microVariant="split"
      tone="sky"
      trustNote="144 DPI A4 slicing with seam overlap · 100% browser-only"
    >
      <PearlStageSwitch stageKey={stageKey}>
        {!file ? (
          <div className="max-w-2xl mx-auto">
            <FileDropzone
              onDrop={(f) => {
                if (f[0]) {
                  setFile(f[0]);
                  setResultUrl(null);
                }
              }}
              multiple={false}
              accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] }}
              title="Select long screenshot or image"
              subtitle="Drop tall JPG, PNG, or WebP here"
            />
          </div>
        ) : !resultUrl ? (
          <div className="relative w-full max-w-lg mx-auto pms-glass-panel rounded-3xl p-6 sm:p-7 space-y-5 overflow-hidden">
            <PearlScanOverlay active={busy} label="Slicing image into A4 pages…" />

            <div
              className="rounded-2xl border p-4 flex items-center gap-4"
              style={{ backgroundColor: 'var(--pms-white)', borderColor: 'var(--pms-border)' }}
            >
              <div className="w-12 h-12 bg-[var(--pms-soft-blue)] rounded-xl flex items-center justify-center shrink-0">
                <Image className="w-6 h-6 text-[var(--pms-blue)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 dark:text-white truncate">{file.name}</p>
                <p className="text-sm text-gray-500 dark:text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
            </div>

            <div
              className="rounded-2xl border p-5"
              style={{ backgroundColor: 'var(--pms-white)', borderColor: 'var(--pms-border)' }}
            >
              <label className="flex items-center justify-between mb-3">
                <span className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-[var(--pms-blue)]" /> Page Overlap
                </span>
                <span className="text-[var(--pms-blue)] font-extrabold text-sm">
                  <AnimatedNumber value={overlap} suffix="px" />
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={80}
                value={overlap}
                onChange={(e) => setOverlap(Number(e.target.value))}
                className="w-full accent-sky-600 cursor-pointer"
              />
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
                Overlap between pages prevents text lines from being cut off at page boundaries.
              </p>
            </div>

            <div className="flex gap-3">
              <motion.button
                whileHover={prefersReduced || busy ? undefined : { scale: 1.01 }}
                whileTap={prefersReduced || busy ? undefined : { scale: 0.985 }}
                onClick={process}
                disabled={busy}
                className="flex-1 pms-btn-primary py-4 font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 notranslate cursor-pointer"
                translate="no"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Image className="w-5 h-5" />}
                <span>{busy ? 'Slicing into pages…' : 'Convert to PDF'}</span>
              </motion.button>
              <button
                onClick={() => setFile(null)}
                disabled={busy}
                className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-2xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-lg mx-auto space-y-5">
            <div className="pms-glass-panel rounded-3xl p-8 text-center border border-emerald-200/80 dark:border-emerald-800/70 space-y-4">
              <motion.div
                initial={prefersReduced ? false : { scale: 0.45, rotate: -10, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 360, damping: 18 }}
                className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 rounded-full flex items-center justify-center mx-auto shadow-inner"
              >
                <CheckCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </motion.div>
              <h2 className="text-2xl font-extrabold text-emerald-900 dark:text-emerald-200">PDF Created!</h2>
              <p className="text-emerald-700 dark:text-emerald-400 text-sm">
                Your long image was split into{' '}
                <strong>
                  <AnimatedNumber value={pageCount} suffix=" A4 pages" />
                </strong>
              </p>
              <motion.a
                whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                href={resultUrl}
                download={file.name.replace(/\.[^.]+$/, '') + '.pdf'}
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 transition-colors"
              >
                <Download className="w-5 h-5" /> Download PDF
              </motion.a>
            </div>
            <button
              onClick={() => {
                setFile(null);
                setResultUrl(null);
              }}
              className="w-full py-3.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-2xl font-semibold text-sm hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Convert another
            </button>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
