import React, { useState } from 'react';
import { 
  ImageIcon, Download, Loader2, Package, Eye, Check, 
  Sparkles, FileText, Filter, ArrowRight, ExternalLink
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import JSZip from 'jszip';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';

interface ExtractedImage {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  pageIndex: number;
  sizeBytes: number;
}

export default function ExtractAllImages() {
  useSEO(
    'Extract All Images from PDF Online Free — High-Resolution Gallery & ZIP',
    'Extract embedded photos, graphics, and figures from PDF files in full native resolution. Visual thumbnail gallery with 1-click single image or ZIP batch download.'
  );

  usePageSEO(
    'PDF Image Extractor & Gallery Studio',
    'Extract all images and graphics embedded inside any PDF. Browse thumbnails, inspect resolutions, and download in original quality or ZIP archive.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [images, setImages] = useState<ExtractedImage[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [downloadingZip, setDownloadingZip] = useState(false);

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    const f = files[0];
    setFile(f);
    setImages([]);
    setBusy(true);

    try {
      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const extractedList: ExtractedImage[] = [];

      for (let p = 1; p <= pdf.numPages; p++) {
        setProgressMsg(`Scanning page ${p} of ${pdf.numPages}...`);
        const page = await pdf.getPage(p);
        const opList = await page.getOperatorList();

        for (let i = 0; i < opList.fnArray.length; i++) {
          const fn = opList.fnArray[i];
          // OPS.paintImageXObject is 85 in pdfjs
          if (fn === pdfjsLib.OPS.paintImageXObject) {
            const imgName = opList.argsArray[i][0];
            try {
              // @ts-ignore
              const imgObj = await page.objs.get(imgName);
              if (imgObj && imgObj.data) {
                const canvas = document.createElement('canvas');
                canvas.width = imgObj.width;
                canvas.height = imgObj.height;
                const ctx = canvas.getContext('2d')!;

                // Draw RGBA / RGB image data
                const imgData = ctx.createImageData(imgObj.width, imgObj.height);
                const srcData = imgObj.data;

                if (imgObj.kind === 1 || imgObj.kind === 2 || imgObj.kind === 3) {
                  // Common RGB to RGBA conversion
                  let srcIdx = 0;
                  let dstIdx = 0;
                  const totalPixels = imgObj.width * imgObj.height;

                  if (srcData.length === totalPixels * 3) {
                    for (let px = 0; px < totalPixels; px++) {
                      imgData.data[dstIdx] = srcData[srcIdx];
                      imgData.data[dstIdx + 1] = srcData[srcIdx + 1];
                      imgData.data[dstIdx + 2] = srcData[srcIdx + 2];
                      imgData.data[dstIdx + 3] = 255;
                      srcIdx += 3;
                      dstIdx += 4;
                    }
                  } else if (srcData.length === totalPixels * 4) {
                    imgData.data.set(srcData);
                  } else {
                    // Grayscale
                    for (let px = 0; px < totalPixels; px++) {
                      const v = srcData[px];
                      imgData.data[dstIdx] = v;
                      imgData.data[dstIdx + 1] = v;
                      imgData.data[dstIdx + 2] = v;
                      imgData.data[dstIdx + 3] = 255;
                      dstIdx += 4;
                    }
                  }
                  ctx.putImageData(imgData, 0, 0);

                  const dataUrl = canvas.toDataURL(`image/${selectedFormat}`, 0.95);
                  extractedList.push({
                    id: `${imgName}_${p}`,
                    name: `image_p${p}_${imgName}.${selectedFormat}`,
                    dataUrl,
                    width: imgObj.width,
                    height: imgObj.height,
                    pageIndex: p,
                    sizeBytes: Math.round(dataUrl.length * 0.75)
                  });
                }
              }
            } catch (objErr) {
              // Skip single unrenderable stream
            }
          }
        }
      }

      // If no XObject image streams found, provide high-res page snapshots as images
      if (extractedList.length === 0) {
        setProgressMsg('No isolated XObjects found. Generating full-page photo cuts...');
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const vp = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width;
          canvas.height = vp.height;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

          const dataUrl = canvas.toDataURL(`image/${selectedFormat}`, 0.94);
          extractedList.push({
            id: `page_${p}`,
            name: `page_${p}_extract.${selectedFormat}`,
            dataUrl,
            width: vp.width,
            height: vp.height,
            pageIndex: p,
            sizeBytes: Math.round(dataUrl.length * 0.75)
          });
        }
      }

      setImages(extractedList);
    } catch (err: any) {
      console.error('Extraction error:', err);
      alert(`Image extraction failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setBusy(false);
      setProgressMsg('');
    }
  };

  const downloadAllAsZip = async () => {
    if (images.length === 0) return;
    setDownloadingZip(true);

    try {
      const zip = new JSZip();
      images.forEach((img, idx) => {
        const rawBase64 = img.dataUrl.split(',')[1];
        zip.file(`image_${idx + 1}_page_${img.pageIndex}.${selectedFormat}`, rawBase64, { base64: true });
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(zipBlob);
      a.download = `${file?.name.replace(/\.pdf$/i, '')}_All_Images.zip`;
      a.click();
    } catch (err) {
      console.error('ZIP compilation error:', err);
    } finally {
      setDownloadingZip(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const reset = () => {
    setFile(null);
    setImages([]);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-4 sm:p-8 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm border border-blue-100 dark:border-blue-900/50">
          <ImageIcon className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-2">
          PDF Image Extractor & Gallery Studio
        </h1>
        <p className="text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          Extract all embedded photos and graphics from PDF files in full native resolution. Inspect dimensions and download individually or as a ZIP.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl space-y-6">
          <FileDropzone 
            onDrop={handleDrop} 
            multiple={false} 
            title="Select PDF Document to Extract Images From" 
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Eye className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Gallery Preview</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Masonry gallery showing native dimensions and aspect ratio.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Package className="w-6 h-6 text-indigo-600 dark:text-indigo-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">1-Click ZIP Bundle</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Download all extracted pictures compressed in a single ZIP.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Sparkles className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Lossless Quality</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Pulls raw underlying bitmap streams without downscaling.</p>
            </div>
          </div>
        </div>
      ) : busy ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Extracting Embedded Bitmaps...</h3>
          <p className="text-xs text-slate-500">{progressMsg || 'Parsing PDF operator lists...'}</p>
        </div>
      ) : (
        /* Image Gallery Workspace */
        <div className="w-full space-y-4">
          {/* Top Control Bar */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                Found {images.length} Image{images.length === 1 ? '' : 's'}
              </span>
              <span className="text-xs text-slate-400">• in {file.name}</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={downloadAllAsZip}
                disabled={downloadingZip || images.length === 0}
                className="py-2.5 px-5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-all disabled:opacity-40"
              >
                {downloadingZip ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                Download All ({images.length}) as ZIP
              </button>
              <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600 underline">Change File</button>
            </div>
          </div>

          {/* Masonry Image Gallery Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map(img => (
              <div
                key={img.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-center min-h-[180px] max-h-[220px] overflow-hidden">
                  <img
                    src={img.dataUrl}
                    alt={img.name}
                    className="max-h-[180px] object-contain rounded"
                  />
                </div>

                <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {img.width} × {img.height} px
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      Page {img.pageIndex}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-500">{formatSize(img.sizeBytes)}</span>
                    <a
                      href={img.dataUrl}
                      download={img.name}
                      className="py-1 px-3 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 text-xs font-bold rounded-lg border transition-colors flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      Save
                    </a>
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
