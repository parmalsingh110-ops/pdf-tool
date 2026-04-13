import React, { useState, useRef } from 'react';
import { Crop, Download, Loader2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { PDFDocument } from 'pdf-lib';
import FileDropzone from '../components/FileDropzone';

export default function PdfPageCropper() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageImage, setPageImage] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageDim, setPageDim] = useState({ w: 0, h: 0 });
  const [renderScale, setRenderScale] = useState(1);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [applyToAll, setApplyToAll] = useState(true);

  // Crop rect in percentages (0-100)
  const [cropTop, setCropTop] = useState(0);
  const [cropBottom, setCropBottom] = useState(0);
  const [cropLeft, setCropLeft] = useState(0);
  const [cropRight, setCropRight] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);

  const handleDrop = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setResultUrl(null);
    setCropTop(0); setCropBottom(0); setCropLeft(0); setCropRight(0);
    setBusy(true);
    try {
      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      setPageCount(pdf.numPages);
      await renderPage(pdf, 1);
    } catch (e: any) {
      alert(e?.message || 'Load failed.');
    } finally {
      setBusy(false);
    }
  };

  const renderPage = async (pdf: pdfjsLib.PDFDocumentProxy | null, pageNum: number) => {
    if (!pdf && file) {
      const buf = await file.arrayBuffer();
      pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    }
    if (!pdf) return;
    const page = await pdf.getPage(pageNum);
    const vp1 = page.getViewport({ scale: 1 });
    setPageDim({ w: vp1.width, h: vp1.height });
    const maxW = 500;
    const scale = Math.min(1.5, maxW / vp1.width);
    setRenderScale(scale);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
    setPageImage(canvas.toDataURL('image/jpeg', 0.85));
    setCurrentPage(pageNum);
    canvas.width = 0; canvas.height = 0;
  };

  const navigatePage = async (dir: number) => {
    const target = currentPage + dir;
    if (target < 1 || target > pageCount) return;
    setBusy(true);
    await renderPage(null, target);
    setBusy(false);
  };

  const applyCrop = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(buf);
      const pages = pdfDoc.getPages();

      const pagesToCrop = applyToAll ? pages : [pages[currentPage - 1]];

      for (const page of pagesToCrop) {
        const { width, height } = page.getSize();
        const newX = (cropLeft / 100) * width;
        const newY = (cropBottom / 100) * height;
        const newW = width - ((cropLeft + cropRight) / 100) * width;
        const newH = height - ((cropTop + cropBottom) / 100) * height;

        page.setCropBox(newX, newY, newW, newH);
        page.setMediaBox(newX, newY, newW, newH);
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      alert(e?.message || 'Crop failed.');
    } finally {
      setBusy(false);
    }
  };

  const displayW = pageDim.w * renderScale;
  const displayH = pageDim.h * renderScale;

  return (
    <div className="flex-1 flex flex-col items-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">PDF Page Cropper</h1>
        <p className="text-xl text-gray-600">Visually crop PDF pages — remove margins, trim whitespace.</p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF to crop" />
      ) : (
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
          {/* Preview with crop overlay */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 justify-center text-sm">
              <button onClick={() => navigatePage(-1)} disabled={currentPage <= 1 || busy} className="px-3 py-1.5 bg-gray-100 rounded-lg font-bold disabled:opacity-30">←</button>
              <span className="font-semibold">Page {currentPage} of {pageCount}</span>
              <button onClick={() => navigatePage(1)} disabled={currentPage >= pageCount || busy} className="px-3 py-1.5 bg-gray-100 rounded-lg font-bold disabled:opacity-30">→</button>
            </div>

            <div ref={containerRef} className="relative mx-auto bg-gray-100 rounded-xl overflow-hidden border border-gray-200 flex items-center justify-center" 
              style={{ width: displayW + 2, height: displayH + 2 }}>
              {pageImage && <img src={pageImage} alt="Page" className="block" style={{ width: displayW, height: displayH }} draggable={false} />}
              
              {/* Crop overlay */}
              {/* Top shadow */}
              <div className="absolute left-0 right-0 top-0 bg-red-500/20 border-b-2 border-red-500 border-dashed pointer-events-none"
                style={{ height: `${cropTop}%` }} />
              {/* Bottom shadow */}
              <div className="absolute left-0 right-0 bottom-0 bg-red-500/20 border-t-2 border-red-500 border-dashed pointer-events-none"
                style={{ height: `${cropBottom}%` }} />
              {/* Left shadow */}
              <div className="absolute left-0 top-0 bottom-0 bg-red-500/20 border-r-2 border-red-500 border-dashed pointer-events-none"
                style={{ width: `${cropLeft}%` }} />
              {/* Right shadow */}
              <div className="absolute right-0 top-0 bottom-0 bg-red-500/20 border-l-2 border-red-500 border-dashed pointer-events-none"
                style={{ width: `${cropRight}%` }} />
            </div>
          </div>

          {/* Controls */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4 h-fit">
            <h3 className="font-bold text-gray-900">Crop Margins</h3>
            <p className="text-xs text-gray-500">Adjust how much to trim from each edge (in %).</p>

            {([['Top', cropTop, setCropTop], ['Bottom', cropBottom, setCropBottom], ['Left', cropLeft, setCropLeft], ['Right', cropRight, setCropRight]] as const).map(([label, val, setter]) => (
              <label key={label} className="block text-sm font-medium text-gray-700">
                {label}: {val}%
                <input type="range" min={0} max={45} value={val} onChange={e => setter(Number(e.target.value))} className="mt-1 w-full" />
              </label>
            ))}

            <div className="flex gap-2">
              <button onClick={() => { setCropTop(5); setCropBottom(5); setCropLeft(5); setCropRight(5); }}
                className="flex-1 px-2 py-1.5 text-xs font-bold bg-gray-100 rounded-lg hover:bg-gray-200">5% all sides</button>
              <button onClick={() => { setCropTop(10); setCropBottom(10); setCropLeft(10); setCropRight(10); }}
                className="flex-1 px-2 py-1.5 text-xs font-bold bg-gray-100 rounded-lg hover:bg-gray-200">10% all sides</button>
              <button onClick={() => { setCropTop(0); setCropBottom(0); setCropLeft(0); setCropRight(0); }}
                className="flex-1 px-2 py-1.5 text-xs font-bold bg-gray-100 rounded-lg hover:bg-gray-200">Reset</button>
            </div>

            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input type="checkbox" checked={applyToAll} onChange={e => setApplyToAll(e.target.checked)} className="rounded" />
              Apply to all pages
            </label>

            <button onClick={applyCrop} disabled={busy || (cropTop === 0 && cropBottom === 0 && cropLeft === 0 && cropRight === 0)}
              className="w-full py-3 bg-orange-600 text-white rounded-xl font-bold hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Crop className="w-5 h-5" />}
              {busy ? 'Cropping…' : 'Apply Crop'}
            </button>

            {resultUrl && (
              <a href={resultUrl} download={`cropped_${file.name}`}
                className="w-full py-2.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 flex items-center justify-center gap-2 text-sm">
                <Download className="w-4 h-4" /> Download Cropped PDF
              </a>
            )}

            <button onClick={() => { setFile(null); setPageImage(null); if (resultUrl) URL.revokeObjectURL(resultUrl); setResultUrl(null); }}
              className="w-full py-2 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200">New PDF</button>
          </div>
        </div>
      )}
    </div>
  );
}
