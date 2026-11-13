import { useState, useRef } from 'react';
import { Download, FileText, Image as ImageIcon, CheckCircle2, Archive, Check, RefreshCw } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import FileDropzone from '../components/FileDropzone';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import JSZip from 'jszip';
import * as UTIF from 'utif';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { toArrayBufferBytes } from '../lib/blobUrl';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

// Initialize pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type ImageFormat = 'jpg' | 'png' | 'webp' | 'tiff';
type DpiPreset = { label: string; scale: number; desc: string };

const DPI_PRESETS: Record<string, DpiPreset> = {
  standard: { label: '72 DPI', scale: 1.0, desc: 'Web & screen fast view' },
  high: { label: '150 DPI', scale: 2.0, desc: 'Recommended high quality' },
  ultra: { label: '300 DPI', scale: 3.0, desc: 'Ultra HD crisp print quality' },
};

interface PageThumb {
  pageNum: number;
  thumbUrl: string;
  selected: boolean;
  width: number;
  height: number;
}

interface ConvertedImage {
  pageNum: number;
  name: string;
  dataUrl: string;
  blob: Blob;
  sizeKb: number;
  width: number;
  height: number;
}

export default function PDFToJPG() {
  const prefersReduced = useReducedMotion();

  useSEO(
    'PDF to JPG Converter Online Free — High Quality 300 DPI | PDF Media Suite',
    'Convert PDF pages to JPG, PNG, or WebP images online free. Choose DPI resolution (72, 150, 300 DPI), select specific pages, and download single images or a ZIP bundle.'
  );

  usePageSEO(
    'PDF to JPG Converter',
    'Convert PDF pages to high-quality JPG, PNG, or WebP images. Select specific pages, adjust DPI quality, and download individual pages or a single ZIP file.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageThumb[]>([]);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState({ current: 0, total: 0 });
  const [convertedImages, setConvertedImages] = useState<ConvertedImage[]>([]);
  const [isZipping, setIsZipping] = useState(false);

  // Settings
  const [format, setFormat] = useState<ImageFormat>('jpg');
  const [dpiKey, setDpiKey] = useState<string>('high');
  const [quality, setQuality] = useState<number>(0.92);
  const [rangeInput, setRangeInput] = useState<string>('');

  const pdfDocRef = useRef<any>(null);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const selected = acceptedFiles[0];
    setFile(selected);
    setConvertedImages([]);
    setRangeInput('');
    await loadPdfThumbs(selected);
  };

  const loadPdfThumbs = async (pdfFile: File) => {
    setIsLoadingPages(true);
    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      pdfDocRef.current = pdf;

      const thumbs: PageThumb[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 0.35 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
          thumbs.push({
            pageNum: i,
            thumbUrl: canvas.toDataURL('image/jpeg', 0.8),
            selected: true,
            width: Math.round(vp.width / 0.35),
            height: Math.round(vp.height / 0.35),
          });
        }
      }
      setPages(thumbs);
    } catch (e) {
      console.error('Error loading PDF thumbnails:', e);
      alert('Failed to load PDF. Please ensure the file is not corrupted.');
    } finally {
      setIsLoadingPages(false);
    }
  };

  const togglePage = (pageNum: number) => {
    setPages((prev) =>
      prev.map((p) => (p.pageNum === pageNum ? { ...p, selected: !p.selected } : p))
    );
  };

  const selectAll = () => setPages((prev) => prev.map((p) => ({ ...p, selected: true })));
  const deselectAll = () => setPages((prev) => prev.map((p) => ({ ...p, selected: false })));
  const selectOdd = () => setPages((prev) => prev.map((p) => ({ ...p, selected: p.pageNum % 2 !== 0 })));
  const selectEven = () => setPages((prev) => prev.map((p) => ({ ...p, selected: p.pageNum % 2 === 0 })));

  const applyRange = () => {
    if (!rangeInput.trim()) return;
    const targets = new Set<number>();
    const parts = rangeInput.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.includes('-')) {
        const [startStr, endStr] = trimmed.split('-');
        const s = parseInt(startStr, 10);
        const e = parseInt(endStr, 10);
        if (!isNaN(s) && !isNaN(e)) {
          const from = Math.min(s, e);
          const to = Math.max(s, e);
          for (let i = from; i <= to; i++) targets.add(i);
        }
      } else {
        const num = parseInt(trimmed, 10);
        if (!isNaN(num)) targets.add(num);
      }
    }
    setPages((prev) =>
      prev.map((p) => ({ ...p, selected: targets.has(p.pageNum) }))
    );
  };

  const selectedPages = pages.filter((p) => p.selected);

  const convertToImages = async () => {
    if (!file || !pdfDocRef.current || selectedPages.length === 0) return;

    setIsProcessing(true);
    setProcessProgress({ current: 0, total: selectedPages.length });
    const outputList: ConvertedImage[] = [];

    const scale = DPI_PRESETS[dpiKey]?.scale || 2.0;
    const mime = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';
    const ext = format;
    const baseName = file.name.replace(/\.[^/.]+$/, '');

    try {
      for (let idx = 0; idx < selectedPages.length; idx++) {
        const item = selectedPages[idx];
        setProcessProgress({ current: idx + 1, total: selectedPages.length });

        const page = await pdfDocRef.current.getPage(item.pageNum);
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;

        // White background for transparent PDF layers
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, vp.width, vp.height);

        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

        let blob: Blob;
        let dataUrl: string;

        if (format === 'tiff') {
          const imgData = ctx.getImageData(0, 0, Math.round(vp.width), Math.round(vp.height));
          const tiffBuf = (UTIF as any).encodeImage(imgData.data, Math.round(vp.width), Math.round(vp.height));
          blob = new Blob([tiffBuf], { type: 'image/tiff' });
          dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        } else {
          dataUrl = canvas.toDataURL(mime, format === 'png' ? undefined : quality);
          const bytes = dataUrlToBytes(dataUrl);
          blob = new Blob([toArrayBufferBytes(bytes)], { type: mime });
        }

        outputList.push({
          pageNum: item.pageNum,
          name: `${baseName}_page_${item.pageNum}.${ext}`,
          dataUrl,
          blob,
          sizeKb: Math.round(blob.size / 1024),
          width: Math.round(vp.width),
          height: Math.round(vp.height),
        });

        canvas.width = 0;
        canvas.height = 0;
      }
      setConvertedImages(outputList);
    } catch (e: any) {
      console.error('Conversion failed:', e);
      alert('Error during conversion: ' + (e?.message || 'Unknown error'));
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadAllAsZip = async () => {
    if (convertedImages.length === 0 || !file) return;
    setIsZipping(true);
    try {
      const zip = new JSZip();
      for (const img of convertedImages) {
        zip.file(img.name, img.blob);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}_images_${format.toUpperCase()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('ZIP failed:', err);
      alert('Failed to generate ZIP archive.');
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="PDF to JPG & Image Converter"
      subtitle="Convert PDF pages to crystal-clear JPG, PNG, or WebP images. Select specific pages, adjust DPI, and download as single images or a ZIP."
      categoryLabel="High-Resolution Converter"
      icon={ImageIcon}
      microVariant="convert"
      tone="amber"
    >
      <div className="flex flex-col items-center w-full">
        <PearlStageSwitch
          stageKey={!file ? 'upload' : isLoadingPages ? 'loading' : convertedImages.length > 0 ? 'results' : 'configure'}
          className="w-full flex flex-col items-center"
        >
          {!file ? (
            <div className="w-full max-w-4xl">
              <FileDropzone
                onDrop={handleDrop}
                multiple={false}
                accept={{ 'application/pdf': ['.pdf'] }}
                title="Select PDF file"
                subtitle="or drop PDF document here"
              />
            </div>
          ) : isLoadingPages ? (
            <div className="w-full max-w-2xl pms-glass-panel rounded-3xl p-12 text-center relative overflow-hidden">
              <PearlScanOverlay
                active={true}
                label="Rendering visual thumbnails for interactive page selection..."
              />
              <div
                className="w-14 h-14 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4"
                style={{ borderColor: 'var(--pms-rose)', borderTopColor: 'transparent' }}
              />
              <h3 className="text-xl font-bold text-[var(--pms-ink)] mb-2">Analyzing PDF Pages...</h3>
              <p className="text-sm text-[var(--pms-muted)]">Rendering visual thumbnails for interactive page selection</p>
            </div>
          ) : convertedImages.length > 0 ? (
            /* Results View */
            <div className="w-full max-w-6xl space-y-6">
              <div className="pms-glass-panel p-6 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4 relative overflow-hidden">
                <PearlScanOverlay
                  active={isZipping}
                  label="Packaging converted images into ZIP..."
                />
                <div className="flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'var(--pms-soft-mint)', color: 'var(--pms-ink)' }}
                  >
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-[var(--pms-ink)]">
                      Successfully converted <AnimatedNumber value={convertedImages.length} /> page(s)
                    </h3>
                    <p className="text-sm text-[var(--pms-muted)]">
                      Format: {format.toUpperCase()} • Resolution: {DPI_PRESETS[dpiKey].label}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                  <motion.button
                    type="button"
                    whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                    whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                    onClick={downloadAllAsZip}
                    disabled={isZipping}
                    className="pms-btn-primary flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-6 py-3 font-bold rounded-xl disabled:opacity-50"
                  >
                    {isZipping ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Archive className="w-5 h-5" />}
                    Download All (ZIP)
                  </motion.button>
                  <button
                    type="button"
                    onClick={() => {
                      setConvertedImages([]);
                    }}
                    className="px-4 py-3 bg-white/75 dark:bg-slate-900/75 hover:bg-white dark:hover:bg-slate-900 border border-[var(--pms-border)] text-[var(--pms-ink)] font-semibold rounded-xl transition-all"
                  >
                    Adjust Options
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setPages([]);
                      setConvertedImages([]);
                    }}
                    className="px-4 py-3 bg-white/75 dark:bg-slate-900/75 hover:bg-white dark:hover:bg-slate-900 border border-[var(--pms-border)] text-[var(--pms-ink)] font-semibold rounded-xl transition-all"
                  >
                    New File
                  </button>
                </div>
              </div>

              {/* Grid of Converted Images */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {convertedImages.map((img, idx) => (
                  <motion.div
                    key={img.pageNum}
                    initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={prefersReduced ? { duration: 0 } : { duration: 0.22, delay: Math.min(idx * 0.03, 0.24) }}
                    className="pms-glass-panel rounded-2xl overflow-hidden flex flex-col group hover:shadow-md transition-shadow"
                  >
                    <div className="relative aspect-[1/1.3] bg-white p-2 flex items-center justify-center overflow-hidden border-b border-[var(--pms-border)]">
                      <img
                        src={img.dataUrl}
                        alt={img.name}
                        className="max-w-full max-h-full object-contain drop-shadow"
                      />
                      <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-white text-xs font-bold px-2 py-0.5 rounded-md">
                        Page {img.pageNum}
                      </div>
                      <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
                        {img.width}×{img.height} • {img.sizeKb} KB
                      </div>
                    </div>

                    <div className="p-3 flex items-center justify-between gap-2 bg-white/75 dark:bg-slate-900/75">
                      <span className="text-xs font-semibold text-[var(--pms-ink)] truncate" title={img.name}>
                        {img.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const dlUrl = URL.createObjectURL(img.blob);
                          const a = document.createElement('a');
                          a.href = dlUrl;
                          a.download = img.name;
                          a.click();
                          URL.revokeObjectURL(dlUrl);
                        }}
                        className="pms-btn-primary inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg shrink-0 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" /> Save
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ) : (
            /* Configuration & Selection View */
            <div className="w-full max-w-6xl space-y-6">
              {/* File Card & Settings Top Bar */}
              <div className="pms-glass-panel rounded-3xl p-6 relative overflow-hidden">
                <PearlScanOverlay
                  active={isProcessing}
                  label={`Converting page ${processProgress.current} of ${processProgress.total} to ${format.toUpperCase()}...`}
                />

                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-[var(--pms-border)]">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'var(--pms-soft-rose)', color: 'var(--pms-rose)' }}
                    >
                      <FileText className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-[var(--pms-ink)] truncate max-w-md">
                        {file.name}
                      </h3>
                      <p className="text-sm text-[var(--pms-muted)]">
                        {(file.size / 1024 / 1024).toFixed(2)} MB • <AnimatedNumber value={pages.length} /> total pages
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full lg:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        setPages([]);
                      }}
                      className="px-4 py-2.5 text-sm font-semibold text-[var(--pms-ink)] bg-white/75 dark:bg-slate-900/75 hover:bg-white dark:hover:bg-slate-900 border border-[var(--pms-border)] rounded-xl transition-all"
                    >
                      Change File
                    </button>
                    <motion.button
                      type="button"
                      whileHover={prefersReduced ? undefined : { scale: 1.01 }}
                      whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                      onClick={convertToImages}
                      disabled={isProcessing || selectedPages.length === 0}
                      className="pms-btn-primary flex-1 lg:flex-initial inline-flex items-center justify-center gap-2 px-8 py-3 font-bold rounded-xl disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <>
                          <RefreshCw className="w-5 h-5 animate-spin" />
                          Converting ({processProgress.current}/{processProgress.total})...
                        </>
                      ) : (
                        <>
                          <ImageIcon className="w-5 h-5" />
                          Convert {selectedPages.length} Page{selectedPages.length !== 1 ? 's' : ''} to {format.toUpperCase()}
                        </>
                      )}
                    </motion.button>
                  </div>
                </div>

                {/* Conversion Controls */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
                  {/* Output Format */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] mb-2">
                      Image Format
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {(['jpg', 'png', 'webp', 'tiff'] as ImageFormat[]).map((fmt) => {
                        const active = format === fmt;
                        return (
                          <button
                            key={fmt}
                            type="button"
                            onClick={() => setFormat(fmt)}
                            style={{
                              borderColor: active ? 'var(--pms-rose)' : 'var(--pms-border)',
                            }}
                            className={`relative py-2 text-xs font-bold rounded-xl uppercase border transition-colors ${
                              active
                                ? 'text-[var(--pms-ink)]'
                                : 'bg-white/75 dark:bg-slate-900/75 text-[var(--pms-muted)] hover:text-[var(--pms-ink)]'
                            }`}
                          >
                            {active && (
                              <motion.span
                                layoutId="pdftojpg-format-pill"
                                transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
                                className="absolute inset-0 rounded-[11px]"
                                style={{ backgroundColor: 'var(--pms-soft-rose)' }}
                              />
                            )}
                            <span className="relative z-10">{fmt}</span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-[var(--pms-muted)] mt-1.5">
                      {format === 'jpg'
                        ? 'Standard photo format, small file size'
                        : format === 'png'
                        ? 'Lossless quality, sharpest text'
                        : format === 'tiff'
                        ? 'Lossless high-depth print archival standard'
                        : 'Next-gen compact web format'}
                    </p>
                  </div>

                  {/* Resolution / DPI */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] mb-2">
                      Resolution / DPI
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {Object.entries(DPI_PRESETS).map(([key, item]) => {
                        const active = dpiKey === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setDpiKey(key)}
                            style={{
                              borderColor: active ? 'var(--pms-blue)' : 'var(--pms-border)',
                            }}
                            className={`relative py-2 px-1 text-xs font-bold rounded-xl border transition-colors ${
                              active
                                ? 'text-[var(--pms-ink)]'
                                : 'bg-white/75 dark:bg-slate-900/75 text-[var(--pms-muted)] hover:text-[var(--pms-ink)]'
                            }`}
                          >
                            {active && (
                              <motion.span
                                layoutId="pdftojpg-dpi-pill"
                                transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
                                className="absolute inset-0 rounded-[11px]"
                                style={{ backgroundColor: 'var(--pms-soft-blue)' }}
                              />
                            )}
                            <span className="relative z-10">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-[var(--pms-muted)] mt-1.5">
                      {DPI_PRESETS[dpiKey].desc}
                    </p>
                  </div>

                  {/* Quality Slider (JPG/WebP) */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)]">
                        Quality
                      </label>
                      <span className="text-xs font-bold" style={{ color: 'var(--pms-rose)' }}>
                        <AnimatedNumber value={Math.round(quality * 100)} suffix="%" />
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="1.0"
                      step="0.02"
                      value={quality}
                      onChange={(e) => setQuality(parseFloat(e.target.value))}
                      disabled={format === 'png'}
                      className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-[var(--pms-rose)] disabled:opacity-40"
                    />
                    <p className="text-[11px] text-[var(--pms-muted)] mt-1.5">
                      {format === 'png' ? 'PNG is lossless (quality fixed at 100%)' : 'Higher quality results in slightly larger file size'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Page Selection Bar */}
              <div className="pms-glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-[var(--pms-ink)]">
                    Selected: <span style={{ color: 'var(--pms-rose)' }}><AnimatedNumber value={selectedPages.length} /></span> of <AnimatedNumber value={pages.length} />
                  </span>
                  <div className="h-4 w-px bg-[var(--pms-border)] mx-2" />
                  {[
                    { label: 'All', action: selectAll },
                    { label: 'None', action: deselectAll },
                    { label: 'Odd', action: selectOdd },
                    { label: 'Even', action: selectEven },
                  ].map((btn) => (
                    <button
                      key={btn.label}
                      type="button"
                      onClick={btn.action}
                      className="px-2.5 py-1 text-xs font-semibold bg-white/75 dark:bg-slate-900/75 hover:bg-white dark:hover:bg-slate-900 border border-[var(--pms-border)] text-[var(--pms-ink)] rounded-lg transition-colors"
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 1-3, 5, 8"
                    value={rangeInput}
                    onChange={(e) => setRangeInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && applyRange()}
                    className="px-3 py-1.5 text-xs rounded-lg border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 text-[var(--pms-ink)] w-32 focus:outline-none focus:border-[var(--pms-rose)]"
                  />
                  <button
                    type="button"
                    onClick={applyRange}
                    className="pms-btn-primary px-3 py-1.5 text-xs font-bold rounded-lg transition-colors"
                  >
                    Apply Range
                  </button>
                </div>
              </div>

              {/* Thumbnail Selection Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {pages.map((item) => (
                  <motion.div
                    key={item.pageNum}
                    whileHover={prefersReduced ? undefined : { y: -2 }}
                    onClick={() => togglePage(item.pageNum)}
                    style={{
                      borderColor: item.selected ? 'var(--pms-rose)' : 'transparent',
                    }}
                    className={`relative group pms-glass-panel rounded-xl p-2 border-2 cursor-pointer transition-all select-none ${
                      item.selected
                        ? 'shadow-md'
                        : 'hover:border-[var(--pms-border)] opacity-60'
                    }`}
                  >
                    {/* Selection Checkmark */}
                    <div
                      className={`absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center transition-all z-10 ${
                        item.selected
                          ? 'text-white shadow-sm'
                          : 'bg-black/45 text-white group-hover:bg-black/65'
                      }`}
                      style={item.selected ? { backgroundColor: 'var(--pms-rose)' } : undefined}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>

                    {/* Page Number Badge */}
                    <div className="absolute top-3 left-3 bg-black/65 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-0.5 rounded z-10">
                      #{item.pageNum}
                    </div>

                    {/* Thumbnail Image */}
                    <div className="aspect-[1/1.35] bg-white rounded-lg overflow-hidden flex items-center justify-center p-1 border border-[var(--pms-border)]">
                      <img
                        src={item.thumbUrl}
                        alt={`Page ${item.pageNum}`}
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </PearlStageSwitch>
      </div>
    </ToolWorkspaceShell>
  );
}
