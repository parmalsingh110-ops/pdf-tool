import { useState, useEffect } from 'react';
import { PDFDocument, PageSizes, degrees } from 'pdf-lib';
import { Download, Image as ImageIcon, Trash2, RotateCw, ArrowLeft, ArrowRight, Sparkles, CheckCircle2, FileText, Settings, Layers, Archive, Plus } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import JSZip from 'jszip';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';

type PageSizeOption = 'fit' | 'a4' | 'letter';
type OrientationOption = 'auto' | 'portrait' | 'landscape';
type MarginOption = 'none' | 'small' | 'big';

interface ImageItem {
  id: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  rotation: number;
}

export default function JPGToPDF() {
  useSEO(
    'JPG to PDF Converter Online Free — Custom A4, Letter & Margins | PDF Media Suite',
    'Convert JPG, PNG, and WebP images to PDF online free. Customize page orientation, A4/Letter size, and margin spacing. Fast, private in-browser conversion.'
  );

  usePageSEO(
    'JPG to PDF Converter',
    'Convert JPG, PNG, and WebP images to PDF documents. Rearrange images, adjust page orientation, margins, and paper sizes with live thumbnail previews.'
  );

  const [items, setItems] = useState<ImageItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfSizeBytes, setPdfSizeBytes] = useState<number>(0);

  // Layout settings
  const [pageSize, setPageSize] = useState<PageSizeOption>('a4');
  const [orientation, setOrientation] = useState<OrientationOption>('auto');
  const [margin, setMargin] = useState<MarginOption>('small');
  const [splitIntoSeparatePdfs, setSplitIntoSeparatePdfs] = useState(false);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, []);

  const handleDrop = (acceptedFiles: File[]) => {
    const newItems: ImageItem[] = [];
    acceptedFiles.forEach((f) => {
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => {
        setItems((prev) => [
          ...prev,
          {
            id: `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            file: f,
            previewUrl: url,
            width: img.naturalWidth || 800,
            height: img.naturalHeight || 600,
            rotation: 0,
          },
        ]);
      };
      img.src = url;
    });
    setPdfUrl(null);
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const toRemove = prev.find((item) => item.id === id);
      if (toRemove) URL.revokeObjectURL(toRemove.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  const rotateItem = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, rotation: (item.rotation + 90) % 360 } : item
      )
    );
  };

  const moveItem = (index: number, direction: 'left' | 'right') => {
    if (
      (direction === 'left' && index === 0) ||
      (direction === 'right' && index === items.length - 1)
    )
      return;

    const newItems = [...items];
    const target = direction === 'left' ? index - 1 : index + 1;
    [newItems[index], newItems[target]] = [newItems[target], newItems[index]];
    setItems(newItems);
  };

  // Convert an ImageItem to an embeddable JPEG ArrayBuffer/Uint8Array
  const prepareImageBytes = async (item: ImageItem): Promise<{ bytes: Uint8Array; width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const rot = item.rotation % 360;
        const isSwapped = rot === 90 || rot === 270;
        const w = isSwapped ? img.naturalHeight : img.naturalWidth;
        const h = isSwapped ? img.naturalWidth : img.naturalHeight;

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context failed'));

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate((rot * Math.PI) / 180);
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        ctx.restore();

        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        const bytes = dataUrlToBytes(dataUrl);
        canvas.width = 0;
        canvas.height = 0;
        resolve({ bytes, width: w, height: h });
      };
      img.onerror = () => reject(new Error('Failed to load image: ' + item.file.name));
      img.src = item.previewUrl;
    });
  };

  const getPageDimensions = (imgW: number, imgH: number): { pageW: number; pageH: number } => {
    if (pageSize === 'fit') {
      return { pageW: imgW, pageH: imgH };
    }

    const baseSize = pageSize === 'letter' ? PageSizes.Letter : PageSizes.A4; // [595.28, 841.89]
    let isLandscape = false;
    if (orientation === 'landscape') isLandscape = true;
    else if (orientation === 'portrait') isLandscape = false;
    else isLandscape = imgW > imgH; // auto

    const pageW = isLandscape ? Math.max(baseSize[0], baseSize[1]) : Math.min(baseSize[0], baseSize[1]);
    const pageH = isLandscape ? Math.min(baseSize[0], baseSize[1]) : Math.max(baseSize[0], baseSize[1]);
    return { pageW, pageH };
  };

  const getMarginPoints = (): number => {
    if (margin === 'none') return 0;
    if (margin === 'big') return 36; // 0.5 inch
    return 18; // 0.25 inch
  };

  const convertToPdf = async () => {
    if (items.length === 0) return;
    setIsProcessing(true);

    try {
      if (splitIntoSeparatePdfs) {
        // Create a ZIP with individual PDFs
        const zip = new JSZip();
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const pdfDoc = await PDFDocument.create();
          const { bytes, width, height } = await prepareImageBytes(item);
          const embedded = await pdfDoc.embedJpg(bytes);

          const { pageW, pageH } = getPageDimensions(width, height);
          const m = pageSize === 'fit' ? 0 : getMarginPoints();

          const availW = pageW - m * 2;
          const availH = pageH - m * 2;
          const scale = Math.min(availW / width, availH / height, pageSize === 'fit' ? 1 : 999);
          const drawW = width * scale;
          const drawH = height * scale;
          const drawX = (pageW - drawW) / 2;
          const drawY = (pageH - drawH) / 2;

          const page = pdfDoc.addPage([pageW, pageH]);
          page.drawImage(embedded, { x: drawX, y: drawY, width: drawW, height: drawH });

          const pdfBytes = await pdfDoc.save();
          const safeName = item.file.name.replace(/\.[^/.]+$/, '');
          zip.file(`${safeName}.pdf`, pdfBytes);
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `converted_images_pdf_${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Combined single PDF
        const pdfDoc = await PDFDocument.create();

        for (const item of items) {
          const { bytes, width, height } = await prepareImageBytes(item);
          const embedded = await pdfDoc.embedJpg(bytes);

          const { pageW, pageH } = getPageDimensions(width, height);
          const m = pageSize === 'fit' ? 0 : getMarginPoints();

          const availW = pageW - m * 2;
          const availH = pageH - m * 2;
          const scale = Math.min(availW / width, availH / height, pageSize === 'fit' ? 1 : 999);
          const drawW = width * scale;
          const drawH = height * scale;
          const drawX = (pageW - drawW) / 2;
          const drawY = (pageH - drawH) / 2;

          const page = pdfDoc.addPage([pageW, pageH]);
          page.drawImage(embedded, { x: drawX, y: drawY, width: drawW, height: drawH });
        }

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
        setPdfSizeBytes(blob.size);
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
      }
    } catch (e: any) {
      console.error('Error converting images to PDF:', e);
      alert('Failed to generate PDF: ' + (e?.message || 'Unknown error'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-xs font-bold tracking-widest uppercase mb-3 border border-blue-200 dark:border-blue-800">
          <Sparkles className="w-3.5 h-3.5" /> High-Performance Image to PDF
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-3">
          JPG & Image to PDF Converter
        </h1>
        <p className="text-lg text-gray-600 dark:text-slate-400 max-w-2xl mx-auto">
          Convert JPG, PNG, and WebP images into a single professional PDF document. Reorder, rotate, and choose paper sizes.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="w-full max-w-4xl">
          <FileDropzone
            onDrop={handleDrop}
            multiple={true}
            accept={{
              'image/jpeg': ['.jpg', '.jpeg'],
              'image/png': ['.png'],
              'image/webp': ['.webp'],
              'image/gif': ['.gif'],
              'image/bmp': ['.bmp'],
            }}
            title="Select images to convert"
            subtitle="or drag & drop JPG, PNG, WebP images here"
          />
        </div>
      ) : pdfUrl && !splitIntoSeparatePdfs ? (
        /* Results View */
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-8 text-center space-y-6">
          <div className="p-8 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-emerald-900 dark:text-emerald-200 mb-2">
              PDF Generated Successfully!
            </h3>
            <p className="text-sm text-emerald-700 dark:text-emerald-400 mb-6">
              Combined {items.length} image{items.length !== 1 ? 's' : ''} • Size: {(pdfSizeBytes / 1024 / 1024).toFixed(2)} MB
            </p>
            <a
              href={pdfUrl}
              download={`images_${Date.now()}.pdf`}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-bold rounded-xl shadow-lg transition-all"
            >
              <Download className="w-5 h-5" /> Download PDF Document
            </a>
          </div>

          <div className="flex justify-center gap-4">
            <button
              onClick={() => setPdfUrl(null)}
              className="px-6 py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-xl transition-all"
            >
              Adjust Settings & Layout
            </button>
            <button
              onClick={() => setItems([])}
              className="px-6 py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-xl transition-all"
            >
              Convert New Images
            </button>
          </div>
        </div>
      ) : (
        /* Workspace & Settings */
        <div className="w-full max-w-6xl space-y-6">
          {/* Top Control Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center shrink-0">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {items.length} Image{items.length !== 1 ? 's' : ''} Loaded
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    Reorder images using arrows or rotate before converting
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                <label className="px-4 py-2.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-xl cursor-pointer font-semibold transition-all inline-flex items-center gap-2 text-sm">
                  <Plus className="w-4 h-4" /> Add More
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.gif,.bmp"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) handleDrop(Array.from(e.target.files));
                    }}
                  />
                </label>
                <button
                  onClick={() => setItems([])}
                  className="px-4 py-2.5 text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-all"
                >
                  Clear All
                </button>
                <button
                  onClick={convertToPdf}
                  disabled={isProcessing || items.length === 0}
                  className="flex-1 lg:flex-initial inline-flex items-center justify-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
                >
                  {isProcessing ? (
                    'Generating PDF...'
                  ) : splitIntoSeparatePdfs ? (
                    <>
                      <Archive className="w-5 h-5" /> Export All as Individual PDFs (ZIP)
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" /> Convert to PDF ({items.length} Pages)
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Layout Customization Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-6">
              {/* Page Size */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2">
                  Page Size
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['a4', 'letter', 'fit'] as PageSizeOption[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setPageSize(s)}
                      className={`py-2 text-xs font-bold rounded-xl uppercase border transition-all ${
                        pageSize === s
                          ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                          : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:border-blue-400'
                      }`}
                    >
                      {s === 'fit' ? 'Original' : s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Orientation */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2">
                  Orientation
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['auto', 'portrait', 'landscape'] as OrientationOption[]).map((o) => (
                    <button
                      key={o}
                      onClick={() => setOrientation(o)}
                      disabled={pageSize === 'fit'}
                      className={`py-2 text-xs font-bold rounded-xl uppercase border transition-all disabled:opacity-40 ${
                        orientation === o
                          ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                          : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:border-blue-400'
                      }`}
                    >
                      {o === 'auto' ? 'Auto' : o === 'portrait' ? 'Port' : 'Land'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Margins */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2">
                  Margin Spacing
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['none', 'small', 'big'] as MarginOption[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMargin(m)}
                      disabled={pageSize === 'fit'}
                      className={`py-2 text-xs font-bold rounded-xl capitalize border transition-all disabled:opacity-40 ${
                        margin === m
                          ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                          : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:border-blue-400'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Output Mode */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2">
                  Merge Option
                </label>
                <label className="flex items-center gap-2 p-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 cursor-pointer text-xs font-semibold text-gray-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={splitIntoSeparatePdfs}
                    onChange={(e) => setSplitIntoSeparatePdfs(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                  <span>Create individual PDFs (ZIP)</span>
                </label>
              </div>
            </div>
          </div>

          {/* Image Thumbnail Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {items.map((item, index) => (
              <div
                key={item.id}
                className="group relative bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col"
              >
                {/* Number & Top Controls */}
                <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[11px] font-bold px-2 py-0.5 rounded-md z-10">
                  #{index + 1}
                </div>

                <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                  <button
                    onClick={() => rotateItem(item.id)}
                    className="p-1.5 bg-black/60 hover:bg-blue-600 backdrop-blur-sm text-white rounded-lg transition-colors"
                    title="Rotate 90 degrees"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-1.5 bg-black/60 hover:bg-rose-600 backdrop-blur-sm text-white rounded-lg transition-colors"
                    title="Remove image"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Thumbnail Display */}
                <div className="aspect-[1/1.2] bg-gray-50 dark:bg-slate-950 p-2 flex items-center justify-center overflow-hidden border-b border-gray-100 dark:border-slate-800">
                  <img
                    src={item.previewUrl}
                    alt={item.file.name}
                    className="max-w-full max-h-full object-contain transition-transform duration-200"
                    style={{ transform: `rotate(${item.rotation}deg)` }}
                  />
                </div>

                {/* Info & Bottom Order Navigation */}
                <div className="p-2.5 flex items-center justify-between gap-1 text-xs">
                  <span className="truncate text-gray-700 dark:text-slate-300 font-medium" title={item.file.name}>
                    {item.file.name}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => moveItem(index, 'left')}
                      disabled={index === 0}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded text-gray-600 dark:text-slate-400 disabled:opacity-20"
                      title="Move backward"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => moveItem(index, 'right')}
                      disabled={index === items.length - 1}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded text-gray-600 dark:text-slate-400 disabled:opacity-20"
                      title="Move forward"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
