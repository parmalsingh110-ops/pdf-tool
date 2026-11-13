import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { FileImage, Download, Loader2, GripVertical, RotateCw, Trash2, CheckCircle2, Plus } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import FileDropzone from '../components/FileDropzone';
import { useSEO } from '../hooks/useSEO';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

interface ImageItem {
  id: string;
  file: File;
  url: string;
  rotation: number;
}

export default function SmartImageToPdf() {
  useSEO('Smart Image To Pdf Online Free | PDF Media Suite', 'Free online Smart Image To Pdf tool. No signup or installation required.');

  const [images, setImages] = useState<ImageItem[]>([]);
  const [pageSize, setPageSize] = useState<'fit' | 'a4' | 'letter'>('a4');
  const [margin, setMargin] = useState(20);
  const [quality, setQuality] = useState(85);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const prefersReduced = useReducedMotion();
  useAutoRevokeUrl(resultUrl);

  const addImageFiles = (files: File[]) => {
    const newItems = files.map((f) => ({
      id: Date.now().toString() + Math.random(),
      file: f,
      url: URL.createObjectURL(f),
      rotation: 0,
    }));
    setImages((prev) => [...prev, ...newItems]);
    setResultUrl(null);
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    addImageFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return prev.filter((i) => i.id !== id);
    });
  };

  const rotateImage = (id: string) => {
    setImages((prev) => prev.map((i) => (i.id === id ? { ...i, rotation: (i.rotation + 90) % 360 } : i)));
  };

  const moveImage = (fromIdx: number, toIdx: number) => {
    setImages((prev) => {
      const arr = [...prev];
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      return arr;
    });
  };

  const createPdf = async () => {
    if (images.length === 0) return;
    setBusy(true);
    try {
      const pdfDoc = await PDFDocument.create();
      const pageSizes: Record<string, [number, number]> = {
        a4: [595.28, 841.89],
        letter: [612, 792],
        fit: [0, 0],
      };

      for (const item of images) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = item.url;
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej();
        });

        // Render with rotation
        const isRotated = item.rotation % 180 !== 0;
        const w = isRotated ? img.naturalHeight : img.naturalWidth;
        const h = isRotated ? img.naturalWidth : img.naturalHeight;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.translate(w / 2, h / 2);
        ctx.rotate((item.rotation * Math.PI) / 180);
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

        const imgBlob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/jpeg', quality / 100));
        if (!imgBlob) continue;
        const imgBytes = new Uint8Array(await imgBlob.arrayBuffer());
        const pdfImage = await pdfDoc.embedJpg(imgBytes);

        let pageW: number, pageH: number;
        if (pageSize === 'fit') {
          pageW = w + margin * 2;
          pageH = h + margin * 2;
        } else {
          [pageW, pageH] = pageSizes[pageSize];
        }

        const page = pdfDoc.addPage([pageW, pageH]);
        const availW = pageW - margin * 2;
        const availH = pageH - margin * 2;
        const scale = Math.min(availW / w, availH / h, 1);
        const drawW = w * scale;
        const drawH = h * scale;
        const x = margin + (availW - drawW) / 2;
        const y = margin + (availH - drawH) / 2;
        page.drawImage(pdfImage, { x, y, width: drawW, height: drawH });

        canvas.width = 0;
        canvas.height = 0;
      }

      const pdfBytes = toArrayBufferBytes(await pdfDoc.save());
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      alert(e?.message || 'PDF creation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Smart Image to PDF"
      subtitle="Convert multiple images to a single PDF with per-page rotation, reordering, margins, and quality control."
      categoryLabel="Smart PDF Assembler"
      icon={FileImage}
      microVariant="merge"
      tone="emerald"
      trustNote="A4, US Letter & native fit sizing · 100% browser-only"
    >
      <PearlStageSwitch stageKey={images.length === 0 ? 'drop' : 'studio'}>
        {images.length === 0 ? (
          <div className="max-w-2xl mx-auto">
            <FileDropzone
              onDrop={addImageFiles}
              multiple={true}
              accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] }}
              title="Select images"
              subtitle="JPG, PNG, WebP — multiple allowed"
            />
          </div>
        ) : (
          <div className="relative w-full max-w-5xl mx-auto pms-glass-panel rounded-3xl p-6 sm:p-8 space-y-6 overflow-hidden">
            <PearlScanOverlay active={busy} label={`Assembling ${images.length}-page PDF…`} />

            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-gray-900 dark:text-white text-base">Image Pages</h3>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300">
                  <AnimatedNumber value={images.length} suffix=" page(s)" />
                </span>
              </div>

              <div className="flex gap-2 flex-wrap">
                <label className="px-4 py-2 bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] border border-sky-200 dark:border-sky-800 rounded-xl font-bold text-xs cursor-pointer hover:opacity-90 transition-opacity inline-flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Add more
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
                </label>
                <button
                  onClick={() => {
                    images.forEach((i) => URL.revokeObjectURL(i.url));
                    setImages([]);
                    setResultUrl(null);
                  }}
                  className="px-4 py-2 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold text-xs hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Clear all
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {images.map((item, idx) => (
                <div
                  key={item.id}
                  className="relative bg-white dark:bg-slate-900 rounded-2xl border border-[var(--pms-border)] overflow-hidden group shadow-sm"
                >
                  <div className="pms-checkerboard bg-white dark:bg-slate-950 p-2">
                    <img
                      src={item.url}
                      alt=""
                      className="w-full h-32 object-contain"
                      style={{ transform: `rotate(${item.rotation}deg)` }}
                    />
                  </div>
                  <div className="p-2.5 flex items-center gap-1.5 bg-white/80 dark:bg-slate-800/80 border-t border-[var(--pms-border)]">
                    <GripVertical className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="text-[11px] font-semibold text-gray-600 dark:text-slate-300 truncate flex-1">
                      {idx + 1}. {item.file.name}
                    </span>
                  </div>
                  <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => rotateImage(item.id)}
                      className="p-1.5 bg-white/95 dark:bg-slate-800/95 rounded-full shadow text-gray-700 dark:text-slate-200 hover:text-sky-600 dark:hover:text-sky-400 cursor-pointer"
                      title="Rotate 90°"
                    >
                      <RotateCw className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => removeImage(item.id)}
                      className="p-1.5 bg-white/95 dark:bg-slate-800/95 rounded-full shadow text-gray-700 dark:text-slate-200 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                      title="Remove"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  {idx > 0 && (
                    <button
                      onClick={() => moveImage(idx, idx - 1)}
                      className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-white/95 dark:bg-slate-800/95 rounded-full shadow opacity-0 group-hover:opacity-100 text-gray-700 dark:text-slate-200 hover:text-sky-600 text-xs font-bold cursor-pointer"
                      title="Move earlier"
                    >
                      ↑
                    </button>
                  )}
                  {idx < images.length - 1 && (
                    <button
                      onClick={() => moveImage(idx, idx + 1)}
                      className="absolute bottom-10 left-1.5 px-1.5 py-0.5 bg-white/95 dark:bg-slate-800/95 rounded-full shadow opacity-0 group-hover:opacity-100 text-gray-700 dark:text-slate-200 hover:text-sky-600 text-xs font-bold cursor-pointer"
                      title="Move later"
                    >
                      ↓
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white/75 dark:bg-slate-900/60 rounded-2xl border border-[var(--pms-border)] p-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-slate-400 mb-1.5">
                  Page Size
                </label>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value as any)}
                  className="w-full px-3 py-2 border border-[var(--pms-border)] bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl text-sm font-semibold"
                >
                  <option value="a4">A4</option>
                  <option value="letter">US Letter</option>
                  <option value="fit">Fit to image</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-slate-400 mb-1.5">
                  Margin (pt)
                </label>
                <input
                  type="number"
                  value={margin}
                  min={0}
                  max={100}
                  onChange={(e) => setMargin(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-[var(--pms-border)] bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl text-sm font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-slate-400 mb-1.5">
                  Quality (%)
                </label>
                <input
                  type="number"
                  value={quality}
                  min={30}
                  max={100}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-[var(--pms-border)] bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl text-sm font-semibold"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              <motion.button
                whileHover={prefersReduced || busy ? undefined : { scale: 1.01 }}
                whileTap={prefersReduced || busy ? undefined : { scale: 0.985 }}
                onClick={createPdf}
                disabled={busy}
                className="flex-1 pms-btn-primary py-4 font-bold rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileImage className="w-5 h-5" />}
                {busy ? 'Creating PDF…' : `Create PDF (${images.length} images)`}
              </motion.button>

              <AnimatePresence>
                {resultUrl && (
                  <motion.a
                    initial={prefersReduced ? false : { opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={prefersReduced ? undefined : { opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 360, damping: 20 }}
                    href={resultUrl}
                    download="images_to_pdf.pdf"
                    className="px-7 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-colors"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <Download className="w-5 h-5" />
                    Download PDF
                  </motion.a>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
