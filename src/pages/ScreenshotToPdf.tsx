import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { MonitorSmartphone, Download, Loader2, Trash2, Plus, CheckCircle2 } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

export default function ScreenshotToPdf() {
  useSEO('Screenshot To Pdf Online Free | PDF Media Suite', 'Free online Screenshot To Pdf tool. No signup or installation required.');

  usePageSEO('Screenshot to PDF Converter', 'Convert screenshots to clean PDF reports. Free online screenshot to PDF tool with background cleaning.');
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [cleanBg, setCleanBg] = useState(true);

  const prefersReduced = useReducedMotion();
  useAutoRevokeUrl(resultUrl);

  const handleDrop = (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    const newFiles = acceptedFiles.map((f) => ({ file: f, url: URL.createObjectURL(f) }));
    setFiles((prev) => [...prev, ...newFiles]);
    setResultUrl(null);
  };

  const addFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files).map((f) => ({ file: f, url: URL.createObjectURL(f) }));
    setFiles((prev) => [...prev, ...newFiles]);
    setResultUrl(null);
    e.target.value = '';
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => {
      URL.revokeObjectURL(prev[idx].url);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const clearAll = () => {
    files.forEach((f) => URL.revokeObjectURL(f.url));
    setFiles([]);
    setResultUrl(null);
  };

  const convert = async () => {
    if (files.length === 0) return;
    setBusy(true);
    try {
      const doc = await PDFDocument.create();
      for (const { file } of files) {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await new Promise<void>((res) => {
          img.onload = () => res();
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;

        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        if (cleanBg) {
          // Clean near-white pixels to pure white
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) {
              d[i] = d[i + 1] = d[i + 2] = 255;
            }
          }
          ctx.putImageData(imgData, 0, 0);
        }

        URL.revokeObjectURL(img.src);
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), 'image/jpeg', 0.92));
        if (!blob) continue;
        const imgBytes = await blob.arrayBuffer();
        const pdfImg = await doc.embedJpg(imgBytes);

        // A4 page proportions
        const pageW = 595.28;
        const pageH = 841.89;
        const page = doc.addPage([pageW, pageH]);
        const margin = 40;
        const maxW = pageW - margin * 2;
        const maxH = pageH - margin * 2;
        const scale = Math.min(maxW / pdfImg.width, maxH / pdfImg.height, 1);
        const drawW = pdfImg.width * scale;
        const drawH = pdfImg.height * scale;
        const x = (pageW - drawW) / 2;
        const y = pageH - margin - drawH;
        page.drawImage(pdfImg, { x, y, width: drawW, height: drawH });
        canvas.width = 0;
        canvas.height = 0;
      }
      const bytes = toArrayBufferBytes(await doc.save());
      setResultUrl(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
    } catch (e: any) {
      alert(e?.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const stageKey = files.length === 0 ? 'drop' : resultUrl ? 'done' : 'configure';

  return (
    <ToolWorkspaceShell
      title="Screenshot to Clean PDF"
      subtitle="Upload screenshots, auto-whiten near-white backgrounds, and combine into a crisp PDF report."
      categoryLabel="Clean Report Builder"
      icon={MonitorSmartphone}
      microVariant="convert"
      tone="emerald"
      trustNote="Near-white background cleaning · 100% browser-only"
    >
      <PearlStageSwitch stageKey={stageKey}>
        {files.length === 0 ? (
          <div className="max-w-2xl mx-auto">
            <FileDropzone
              onDrop={handleDrop}
              multiple={true}
              accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] }}
              title="Select Screenshots"
              subtitle="Drop multiple PNG, JPG, or WebP screenshots"
            />
          </div>
        ) : resultUrl ? (
          <div className="w-full max-w-xl mx-auto space-y-5">
            <div className="pms-glass-panel rounded-3xl p-8 text-center border border-emerald-200/80 dark:border-emerald-800/70 space-y-4">
              <motion.div
                initial={prefersReduced ? false : { scale: 0.45, rotate: -10, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 360, damping: 18 }}
                className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 rounded-full flex items-center justify-center mx-auto shadow-inner"
              >
                <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </motion.div>
              <h3 className="text-2xl font-extrabold text-emerald-900 dark:text-emerald-200">PDF Report Ready!</h3>
              <p className="text-sm text-emerald-700 dark:text-emerald-400">
                Combined <AnimatedNumber value={files.length} /> screenshot(s) into a crisp A4 PDF
              </p>
              <motion.a
                whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                href={resultUrl}
                download="screenshots_report.pdf"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 transition-colors"
              >
                <Download className="w-5 h-5" /> Download PDF
              </motion.a>
            </div>
            <button
              onClick={clearAll}
              className="w-full py-3.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-2xl font-semibold text-sm hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Convert more screenshots
            </button>
          </div>
        ) : (
          <div className="relative w-full max-w-4xl mx-auto pms-glass-panel rounded-3xl p-6 sm:p-8 space-y-6 overflow-hidden">
            <PearlScanOverlay active={busy} label="Cleaning backgrounds & assembling PDF…" />

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-gray-900 dark:text-white">
                Screenshot Queue
              </h3>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300">
                <AnimatedNumber value={files.length} suffix=" selected" />
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="relative rounded-2xl overflow-hidden border border-[var(--pms-border)] bg-white dark:bg-slate-950 group shadow-xs"
                >
                  <img src={f.url} alt="" className="w-full aspect-[4/3] object-cover" />
                  <button
                    onClick={() => removeFile(i)}
                    className="absolute top-1.5 right-1.5 bg-rose-600 hover:bg-rose-700 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow cursor-pointer"
                    aria-label="Remove screenshot"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <label className="flex flex-col items-center justify-center aspect-[4/3] border-2 border-dashed border-[var(--pms-border-strong)] rounded-2xl cursor-pointer bg-white/60 dark:bg-slate-800/40 hover:border-emerald-400 transition-colors">
                <Plus className="w-6 h-6 text-gray-500 dark:text-slate-400" />
                <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 mt-1">Add</span>
                <input type="file" multiple accept="image/*" className="hidden" onChange={addFiles} />
              </label>
            </div>

            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-2.5 text-sm font-semibold text-gray-700 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={cleanBg}
                  onChange={(e) => setCleanBg(e.target.checked)}
                  className="accent-emerald-600 w-4 h-4 rounded"
                />
                Clean near-white backgrounds
              </label>
            </div>

            <div className="flex gap-3">
              <motion.button
                whileHover={prefersReduced || busy ? undefined : { scale: 1.01 }}
                whileTap={prefersReduced || busy ? undefined : { scale: 0.985 }}
                onClick={convert}
                disabled={busy}
                className="flex-1 pms-btn-primary py-4 font-bold rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <MonitorSmartphone className="w-5 h-5" />}
                {busy ? 'Converting…' : `Convert ${files.length} to PDF`}
              </motion.button>
              <button
                onClick={clearAll}
                disabled={busy}
                className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-semibold rounded-2xl hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
