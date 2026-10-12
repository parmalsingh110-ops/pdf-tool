import React, { useState } from 'react';
import { Images, Download, Loader2, Copy, Check, Eye, Maximize2, Archive, Sliders, Sparkles, FileText, X } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

interface RenderedImage {
  pageNumber: number;
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
}

export default function PdfToImages() {
  useSEO(
    'PDF to Images Converter Online Free — High-Res Gallery & ZIP Export | PDF Media Suite',
    'Free online tool to convert PDF pages into JPG or PNG images. Interactive visual gallery, individual image download, clipboard copy, and bulk ZIP export.'
  );

  usePageSEO(
    'PDF to Images Gallery & Batch Converter',
    'Convert PDF pages into high-resolution JPG or PNG images. View extracted images in an interactive gallery, copy to clipboard, or download as a ZIP file.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<'jpeg' | 'png' | 'webp'>('jpeg');
  const [scaleFactor, setScaleFactor] = useState<number>(2.0); // 1.0 = web, 2.0 = high res, 3.0 = print
  const [quality, setQuality] = useState(0.92);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);

  const [images, setImages] = useState<RenderedImage[]>([]);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [activeLightbox, setActiveLightbox] = useState<RenderedImage | null>(null);

  const handleDrop = (files: File[]) => {
    if (files[0]) {
      setFile(files[0]);
      setImages([]);
      setZipUrl(null);
    }
  };

  const convertPdfToImages = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProgressPercent(5);
    setProgressMsg('Loading PDF document...');
    setImages([]);
    setZipUrl(null);

    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const total = pdf.numPages;

      const renderedList: RenderedImage[] = [];
      const zip = new JSZip();

      const ext = format === 'jpeg' ? 'jpg' : format;
      const mime = `image/${format}`;

      for (let i = 1; i <= total; i++) {
        setProgressMsg(`Rendering page ${i} of ${total} (${format.toUpperCase()})...`);
        setProgressPercent(Math.round(5 + (i / total) * 85));

        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: scaleFactor });

        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;

        if (format === 'jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;

        const blob = await new Promise<Blob | null>((res) =>
          canvas.toBlob((b) => res(b), mime, quality)
        );

        if (blob) {
          const dataUrl = canvas.toDataURL(mime, quality);
          renderedList.push({
            pageNumber: i,
            dataUrl,
            blob,
            width: vp.width,
            height: vp.height,
          });

          const arrBuf = await blob.arrayBuffer();
          zip.file(`page_${String(i).padStart(3, '0')}.${ext}`, arrBuf);
        }

        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }

      setProgressMsg('Packing ZIP archive for batch download...');
      setProgressPercent(95);
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      setZipUrl(URL.createObjectURL(zipBlob));

      setImages(renderedList);
      setProgressPercent(100);
      setProgressMsg('Done!');
    } catch (err: any) {
      console.error('Image extraction failed:', err);
      alert(err?.message || 'Failed to extract images from PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = async (img: RenderedImage, idx: number) => {
    try {
      if (format === 'png') {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': img.blob }),
        ]);
      } else {
        // Convert to PNG for clipboard API compatibility
        const imgEl = new Image();
        imgEl.src = img.dataUrl;
        await new Promise((r) => { imgEl.onload = r; });
        const c = document.createElement('canvas');
        c.width = imgEl.width;
        c.height = imgEl.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(imgEl, 0, 0);
        c.toBlob(async (b) => {
          if (b) {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': b }),
            ]);
          }
        }, 'image/png');
      }

      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch (e) {
      console.warn('Clipboard write failed, downloading instead:', e);
      downloadSingleImage(img);
    }
  };

  const downloadSingleImage = (img: RenderedImage) => {
    if (!file) return;
    const ext = format === 'jpeg' ? 'jpg' : format;
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const a = document.createElement('a');
    a.href = img.dataUrl;
    a.download = `${baseName}_page_${img.pageNumber}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const resetAll = () => {
    setFile(null);
    setImages([]);
    setZipUrl(null);
    setActiveLightbox(null);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-xs font-bold tracking-widest uppercase mb-3 border border-emerald-200 dark:border-emerald-800">
          <Images className="w-3.5 h-3.5" /> High-Resolution Page Image Extraction
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-3">
          PDF to Images Converter & Gallery
        </h1>
        <p className="text-base md:text-lg text-gray-600 dark:text-slate-400 max-w-2xl mx-auto">
          Convert every PDF page into crisp JPG, PNG, or WebP images. View in an interactive gallery, copy directly to your clipboard, or download everything as a ZIP.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl">
          <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF to Convert to Images" />
        </div>
      ) : images.length === 0 ? (
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-gray-200 dark:border-slate-800 p-8 space-y-6">
          <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700">
            <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{file.name}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>

          {/* Export Settings */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5" /> Output Image Settings
            </h3>

            {/* Format Selector */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'jpeg', name: 'JPG (Balanced)' },
                { id: 'png', name: 'PNG (Lossless)' },
                { id: 'webp', name: 'WebP (Compact)' },
              ].map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => setFormat(fmt.id as any)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all ${
                    format === fmt.id
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:border-gray-300'
                  }`}
                >
                  {fmt.name}
                </button>
              ))}
            </div>

            {/* DPI / Scale Selector */}
            <div className="p-4 bg-gray-50 dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 space-y-3">
              <label className="text-xs font-semibold text-gray-700 dark:text-slate-300 flex justify-between">
                <span>Resolution / Sharpness</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {scaleFactor === 1.0 ? 'Standard Web (1x)' : scaleFactor === 2.0 ? 'High-Res 200 DPI (2x)' : 'Ultra Print 300 DPI (3x)'}
                </span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { scale: 1.0, label: '1x Web' },
                  { scale: 2.0, label: '2x High-Res' },
                  { scale: 3.0, label: '3x Print (300 DPI)' },
                ].map((item) => (
                  <button
                    key={item.scale}
                    type="button"
                    onClick={() => setScaleFactor(item.scale)}
                    className={`py-2 px-2.5 rounded-lg text-xs font-bold border transition-all ${
                      scaleFactor === item.scale
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-500'
                        : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          {isProcessing && (
            <div className="space-y-2 p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-200 dark:border-emerald-900/50">
              <div className="flex justify-between text-xs font-semibold text-emerald-900 dark:text-emerald-300">
                <span>{progressMsg}</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full bg-emerald-200 dark:bg-emerald-900/40 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={convertPdfToImages}
              disabled={isProcessing}
              className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 text-base"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Extracting Pages to Images...
                </>
              ) : (
                <>
                  <Images className="w-5 h-5" />
                  Convert PDF to Images Now
                </>
              )}
            </button>
            <button
              onClick={resetAll}
              disabled={isProcessing}
              className="px-6 py-4 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-2xl transition-all text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* Interactive Gallery of Rendered Images */
        <div className="w-full space-y-6">
          {/* Top Actions Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
                <Images className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-gray-900 dark:text-white truncate max-w-sm">{file.name}</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  {images.length} Image(s) Rendered in {format.toUpperCase()}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {zipUrl && (
                <a
                  href={zipUrl}
                  download={`${file.name.replace(/\.[^/.]+$/, '')}_all_images.zip`}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-colors shadow-xs"
                >
                  <Archive className="w-4 h-4" />
                  Download All ({images.length}) as ZIP
                </a>
              )}
              <button
                type="button"
                onClick={resetAll}
                className="px-3.5 py-2.5 text-xs text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white font-semibold"
              >
                Convert Another
              </button>
            </div>
          </div>

          {/* Images Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((img, idx) => (
              <div
                key={img.pageNumber}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col group hover:shadow-md transition-all"
              >
                {/* Image Container with Hover Actions */}
                <div className="relative aspect-[3/4] bg-gray-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center">
                  <img
                    src={img.dataUrl}
                    alt={`Page ${img.pageNumber}`}
                    className="w-full h-full object-contain"
                  />

                  {/* Lightbox Trigger Overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveLightbox(img)}
                      title="Zoom Lightbox"
                      className="w-9 h-9 rounded-full bg-white/90 text-gray-900 flex items-center justify-center hover:scale-110 transition-transform shadow-md"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="p-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-gray-800 dark:text-slate-200">Page {img.pageNumber}</span>
                    <span className="text-[10px] text-gray-400 block">{img.width} × {img.height}px</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(img, idx)}
                      title="Copy to Clipboard"
                      className="p-1.5 rounded-lg text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      {copiedIdx === idx ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadSingleImage(img)}
                      title="Download Image"
                      className="p-1.5 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors font-bold"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Full Screen Lightbox Modal */}
          {activeLightbox && (
            <div
              onClick={() => setActiveLightbox(null)}
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-3xl p-4 flex flex-col items-center"
              >
                <div className="w-full flex items-center justify-between mb-2 px-2 text-white text-xs">
                  <span className="font-bold">Page {activeLightbox.pageNumber} ({activeLightbox.width} × {activeLightbox.height} px)</span>
                  <button
                    type="button"
                    onClick={() => setActiveLightbox(null)}
                    className="p-1 rounded-full hover:bg-slate-800 text-gray-300"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <img
                  src={activeLightbox.dataUrl}
                  alt={`Page ${activeLightbox.pageNumber} Preview`}
                  className="max-h-[75vh] object-contain rounded-xl"
                />
                <div className="mt-3 flex gap-3">
                  <button
                    type="button"
                    onClick={() => downloadSingleImage(activeLightbox)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4" /> Download Image
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
