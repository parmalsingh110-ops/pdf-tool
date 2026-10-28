import { useState, useRef, useEffect } from 'react';
import { Download, FileText, Image as ImageIcon, CheckCircle2, Sliders, Archive, Check, Sparkles, RefreshCw, Layers } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import JSZip from 'jszip';
import * as UTIF from 'utif';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';

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
          blob = new Blob([bytes as any], { type: mime });
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
    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 text-xs font-bold tracking-widest uppercase mb-3 border border-amber-200 dark:border-amber-800">
          <Sparkles className="w-3.5 h-3.5" /> High-Resolution Converter
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-3">
          PDF to JPG & Image Converter
        </h1>
        <p className="text-lg text-gray-600 dark:text-slate-400 max-w-2xl mx-auto">
          Convert PDF pages to crystal-clear JPG, PNG, or WebP images. Select specific pages, adjust DPI, and download as single images or a ZIP.
        </p>
      </div>

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
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-12 text-center">
          <div className="w-14 h-14 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Analyzing PDF Pages...</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400">Rendering visual thumbnails for interactive page selection</p>
        </div>
      ) : convertedImages.length > 0 ? (
        /* Results View */
        <div className="w-full max-w-6xl space-y-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  Successfully converted {convertedImages.length} page(s)
                </h3>
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  Format: {format.toUpperCase()} • Resolution: {DPI_PRESETS[dpiKey].label}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                onClick={downloadAllAsZip}
                disabled={isZipping}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
              >
                {isZipping ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Archive className="w-5 h-5" />}
                Download All (ZIP)
              </button>
              <button
                onClick={() => {
                  setConvertedImages([]);
                }}
                className="px-4 py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-xl transition-all"
              >
                Adjust Options
              </button>
              <button
                onClick={() => {
                  setFile(null);
                  setPages([]);
                  setConvertedImages([]);
                }}
                className="px-4 py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-xl transition-all"
              >
                New File
              </button>
            </div>
          </div>

          {/* Grid of Converted Images */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {convertedImages.map((img) => (
              <div
                key={img.pageNum}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden shadow-sm flex flex-col group hover:shadow-md transition-all"
              >
                <div className="relative aspect-[1/1.3] bg-gray-50 dark:bg-slate-950 p-2 flex items-center justify-center overflow-hidden border-b border-gray-100 dark:border-slate-800">
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

                <div className="p-3 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-700 dark:text-slate-300 truncate" title={img.name}>
                    {img.name}
                  </span>
                  <button
                    onClick={() => {
                      const dlUrl = URL.createObjectURL(img.blob);
                      const a = document.createElement('a');
                      a.href = dlUrl;
                      a.download = img.name;
                      a.click();
                      URL.revokeObjectURL(dlUrl);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition-colors shrink-0 shadow-sm cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Save
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Configuration & Selection View */
        <div className="w-full max-w-6xl space-y-6">
          {/* File Card & Settings Top Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-xl flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate max-w-md">
                    {file.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    {(file.size / 1024 / 1024).toFixed(2)} MB • {pages.length} total pages
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full lg:w-auto">
                <button
                  onClick={() => {
                    setFile(null);
                    setPages([]);
                  }}
                  className="px-4 py-2.5 text-sm font-semibold text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-all"
                >
                  Change File
                </button>
                <button
                  onClick={convertToImages}
                  disabled={isProcessing || selectedPages.length === 0}
                  className="flex-1 lg:flex-initial inline-flex items-center justify-center gap-2 px-8 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
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
                </button>
              </div>
            </div>

            {/* Conversion Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
              {/* Output Format */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2">
                  Image Format
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['jpg', 'png', 'webp', 'tiff'] as ImageFormat[]).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => setFormat(fmt)}
                      className={`py-2 text-xs font-bold rounded-xl uppercase border transition-all ${
                        format === fmt
                          ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                          : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:border-amber-400'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1.5">
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
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2">
                  Resolution / DPI
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(DPI_PRESETS).map(([key, item]) => (
                    <button
                      key={key}
                      onClick={() => setDpiKey(key)}
                      className={`py-2 px-1 text-xs font-bold rounded-xl border transition-all ${
                        dpiKey === key
                          ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                          : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:border-amber-400'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1.5">
                  {DPI_PRESETS[dpiKey].desc}
                </p>
              </div>

              {/* Quality Slider (JPG/WebP) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                    Quality
                  </label>
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                    {Math.round(quality * 100)}%
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
                  className="w-full h-2 bg-gray-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500 disabled:opacity-40"
                />
                <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1.5">
                  {format === 'png' ? 'PNG is lossless (quality fixed at 100%)' : 'Higher quality results in slightly larger file size'}
                </p>
              </div>
            </div>
          </div>

          {/* Page Selection Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                Selected: <span className="text-amber-600 dark:text-amber-400">{selectedPages.length}</span> of {pages.length}
              </span>
              <div className="h-4 w-px bg-gray-200 dark:bg-slate-700 mx-2" />
              <button
                onClick={selectAll}
                className="px-2.5 py-1 text-xs font-semibold bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-lg transition-colors"
              >
                All
              </button>
              <button
                onClick={deselectAll}
                className="px-2.5 py-1 text-xs font-semibold bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-lg transition-colors"
              >
                None
              </button>
              <button
                onClick={selectOdd}
                className="px-2.5 py-1 text-xs font-semibold bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-lg transition-colors"
              >
                Odd
              </button>
              <button
                onClick={selectEven}
                className="px-2.5 py-1 text-xs font-semibold bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-lg transition-colors"
              >
                Even
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="e.g. 1-3, 5, 8"
                value={rangeInput}
                onChange={(e) => setRangeInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyRange()}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white w-32 focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={applyRange}
                className="px-3 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors"
              >
                Apply Range
              </button>
            </div>
          </div>

          {/* Thumbnail Selection Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {pages.map((item) => (
              <div
                key={item.pageNum}
                onClick={() => togglePage(item.pageNum)}
                className={`relative group bg-white dark:bg-slate-900 rounded-xl p-2 border-2 cursor-pointer transition-all select-none ${
                  item.selected
                    ? 'border-amber-500 shadow-md shadow-amber-500/10'
                    : 'border-transparent hover:border-gray-300 dark:hover:border-slate-700 opacity-60'
                }`}
              >
                {/* Selection Checkmark */}
                <div
                  className={`absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center transition-all z-10 ${
                    item.selected
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-black/40 text-white group-hover:bg-black/60'
                  }`}
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>

                {/* Page Number Badge */}
                <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-0.5 rounded z-10">
                  #{item.pageNum}
                </div>

                {/* Thumbnail Image */}
                <div className="aspect-[1/1.35] bg-gray-100 dark:bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center p-1">
                  <img
                    src={item.thumbUrl}
                    alt={`Page ${item.pageNum}`}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
