import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { FileImage, Download, Loader2, Package, ArrowRightLeft, FileType2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import JSZip from 'jszip';
import * as UTIF from 'utif';
import { PDFDocument } from 'pdf-lib';
import FileDropzone from '../components/FileDropzone';
import { useSEO } from '../hooks/useSEO';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

type Mode = 'pdf-to-images' | 'tiff-to-pdf';

export default function ConvertToTiff() {
  useSEO('Convert To Tiff Online Free | PDF Media Suite', 'Free online Convert To Tiff tool. No signup or installation required.');

  const [mode, setMode] = useState<Mode>('pdf-to-images');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState('');
  const [scale, setScale] = useState(2.0);

  useAutoRevokeUrl(resultUrl);
  const prefersReduced = useReducedMotion();

  const handleDrop = (files: File[]) => {
    if (files[0]) {
      setFile(files[0]);
      setResultUrl(null);
      setProgress('');
    }
  };

  // PDF → Genuine TIFF images packed in ZIP
  const processPdfToImages = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const zip = new JSZip();

      for (let p = 1; p <= pdf.numPages; p++) {
        setProgress(`Rendering page ${p} of ${pdf.numPages} at ${Math.round(scale * 100)}%…`);
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

        const imgData = ctx.getImageData(0, 0, vp.width, vp.height);
        const tiffBytes = UTIF.encodeImage(imgData.data, vp.width, vp.height);
        zip.file(`page_${p}.tiff`, new Uint8Array(tiffBytes));
        canvas.width = 0;
        canvas.height = 0;
      }

      setProgress('Creating TIFF archive…');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      setResultUrl(URL.createObjectURL(zipBlob));
      setResultName(`${file.name.replace(/\.[^/.]+$/, '')}_tiff.zip`);
      setProgress(`Done! ${pdf.numPages} page(s) exported as genuine TIFF images.`);
    } catch (e: any) {
      alert(e?.message || 'Conversion failed.');
    } finally {
      setBusy(false);
    }
  };

  // TIFF → PDF (supports multi-page TIFF)
  const processTiffToPdf = async () => {
    if (!file) return;
    setBusy(true);
    try {
      setProgress('Reading TIFF file…');
      const buf = await file.arrayBuffer();
      const ifds = UTIF.decode(buf);

      if (!ifds || ifds.length === 0) throw new Error('Could not decode TIFF — file may be corrupted.');

      setProgress(`Found ${ifds.length} page(s) in TIFF. Converting to PDF…`);
      const pdfDoc = await PDFDocument.create();

      for (let i = 0; i < ifds.length; i++) {
        setProgress(`Converting TIFF page ${i + 1} of ${ifds.length}…`);
        UTIF.decodeImage(buf, ifds[i]);
        const rgba = UTIF.toRGBA8(ifds[i]);
        const w = ifds[i].width;
        const h = ifds[i].height;

        if (!w || !h) continue;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        const imageData = ctx.createImageData(w, h);
        imageData.data.set(rgba);
        ctx.putImageData(imageData, 0, 0);

        const pngBlob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
        if (!pngBlob) continue;

        const pngBytes = await pngBlob.arrayBuffer();
        const emb = await pdfDoc.embedPng(pngBytes);
        const page = pdfDoc.addPage([emb.width, emb.height]);
        page.drawImage(emb, { x: 0, y: 0, width: emb.width, height: emb.height });

        canvas.width = 0;
        canvas.height = 0;
      }

      setProgress('Finalizing PDF…');
      const pdfBytes = toArrayBufferBytes(await pdfDoc.save());
      const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(pdfBlob));
      setResultName(`${file.name.replace(/\.[^/.]+$/, '')}.pdf`);
      setProgress(`Done! ${ifds.length} TIFF page(s) converted to PDF.`);
    } catch (e: any) {
      alert(e?.message || 'TIFF conversion failed.');
    } finally {
      setBusy(false);
    }
  };

  const process = () => (mode === 'tiff-to-pdf' ? processTiffToPdf() : processPdfToImages());

  const acceptedTypes = mode === 'tiff-to-pdf'
    ? { 'image/tiff': ['.tiff', '.tif'] }
    : { 'application/pdf': ['.pdf'] };

  const stageKey = !file ? `upload-${mode}` : 'workspace';

  return (
    <ToolWorkspaceShell
      title="TIFF Image Converter"
      subtitle="Convert PDF pages to high-resolution TIFF image archives — or convert multi-page TIFF images directly into PDF."
      categoryLabel="Archival Raster & TIFF Studio"
      icon={FileImage}
      microVariant="convert"
      tone="indigo"
      trustNote="100% browser-only UTIF & PDF engine · Multi-page TIFF supported"
    >
      <div className="flex flex-col items-center gap-4 mb-7">
        {/* Mode Toggle */}
        <div className="pms-glass-panel flex gap-1.5 p-1.5 rounded-2xl">
          {[
            { id: 'pdf-to-images', label: 'PDF → TIFF Archive', icon: FileType2 },
            { id: 'tiff-to-pdf', label: 'TIFF → PDF', icon: ArrowRightLeft },
          ].map(opt => {
            const active = mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => { setMode(opt.id as Mode); setFile(null); setResultUrl(null); setProgress(''); }}
                className={`relative flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-colors cursor-pointer ${
                  active ? 'text-white' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="tiff-mode-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-0 rounded-xl bg-violet-600 shadow-sm"
                  />
                )}
                <opt.icon className="relative z-10 w-4 h-4" />
                <span className="relative z-10">{opt.label}</span>
              </button>
            );
          })}
        </div>

        <span className="px-4 py-1.5 rounded-full text-xs font-semibold bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] border border-[var(--pms-border)]">
          {mode === 'tiff-to-pdf'
            ? '✦ Supports multi-page TIFF — each frame becomes a PDF page'
            : '✦ Encodes lossless TIFF frames bundled cleanly into a single ZIP archive'}
        </span>
      </div>

      <PearlStageSwitch stageKey={stageKey}>
        {!file ? (
          <div className="w-full max-w-xl mx-auto">
            <FileDropzone
              onDrop={handleDrop}
              accept={acceptedTypes}
              multiple={false}
              title={mode === 'tiff-to-pdf' ? 'Drop your TIFF file here' : 'Drop your PDF file here'}
              subtitle={mode === 'tiff-to-pdf' ? 'or click to select .tif / .tiff' : 'or click to select a PDF'}
            />
          </div>
        ) : (
          <div className="relative w-full max-w-2xl mx-auto pms-glass-panel rounded-3xl p-6 sm:p-8 space-y-5 overflow-hidden">
            <PearlScanOverlay active={busy} label={progress || 'Converting document frames…'} />

            {/* File info */}
            <div className="flex items-center gap-3.5 p-4 bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)]">
              <div className="w-11 h-11 rounded-xl bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] flex items-center justify-center shrink-0">
                <FileImage className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-900 dark:text-white truncate">{file.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <AnimatedNumber value={file.size / 1024 / 1024} decimals={2} suffix=" MB" />
                </p>
              </div>
              <button
                onClick={() => { setFile(null); setResultUrl(null); setProgress(''); }}
                disabled={busy}
                className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer disabled:opacity-40"
              >
                Remove
              </button>
            </div>

            {/* Render quality (PDF → TIFF only) */}
            {mode === 'pdf-to-images' && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
                  Render Quality
                </label>
                <select
                  value={scale}
                  onChange={e => setScale(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 border border-[var(--pms-border)] bg-white/80 dark:bg-slate-900/80 text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-violet-400/50 outline-none text-sm font-medium"
                >
                  <option value={1.0}>Standard (72 DPI equivalent)</option>
                  <option value={1.5}>Good (108 DPI)</option>
                  <option value={2.0}>High (150 DPI)</option>
                  <option value={3.0}>Ultra (216 DPI)</option>
                  <option value={4.0}>Maximum (300 DPI)</option>
                </select>
              </div>
            )}

            <AnimatePresence initial={false}>
              {progress && (
                <motion.p
                  initial={prefersReduced ? false : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReduced ? undefined : { opacity: 0 }}
                  className="text-xs sm:text-sm font-medium text-[var(--pms-blue)] bg-[var(--pms-soft-blue)] border border-[var(--pms-border)] rounded-xl px-4 py-2.5"
                >
                  {progress}
                </motion.p>
              )}
            </AnimatePresence>

            <div className="flex gap-3">
              <motion.button
                whileHover={prefersReduced || busy ? undefined : { scale: 1.01 }}
                whileTap={prefersReduced || busy ? undefined : { scale: 0.985 }}
                onClick={process}
                disabled={busy}
                className="flex-1 pms-btn-primary py-3.5 font-bold rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRightLeft className="w-5 h-5" />}
                {busy
                  ? 'Converting…'
                  : mode === 'tiff-to-pdf' ? 'Convert TIFF to PDF' : 'Convert to TIFF Archive'}
              </motion.button>
              <button
                onClick={() => { setFile(null); setResultUrl(null); setProgress(''); }}
                disabled={busy}
                className="px-5 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
            </div>

            <AnimatePresence initial={false}>
              {resultUrl && (
                <motion.div
                  initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReduced ? undefined : { opacity: 0 }}
                  className="p-6 bg-[var(--pms-soft-mint)] rounded-2xl border border-emerald-300/70 dark:border-emerald-800/70 text-center space-y-3"
                >
                  <p className="text-emerald-800 dark:text-emerald-300 font-bold text-sm">✓ Conversion complete!</p>
                  <motion.a
                    whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                    whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                    href={resultUrl}
                    download={resultName}
                    className="inline-flex items-center gap-2 px-7 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-colors"
                  >
                    {mode === 'tiff-to-pdf'
                      ? <><Download className="w-5 h-5" /> Download PDF</>
                      : <><Package className="w-5 h-5" /> Download TIFF ZIP</>}
                  </motion.a>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
