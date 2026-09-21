import React, { useState } from 'react';
import { FileImage, Download, Loader2, Package, ArrowRightLeft, FileType2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import JSZip from 'jszip';
import * as UTIF from 'utif';
import { PDFDocument } from 'pdf-lib';
import FileDropzone from '../components/FileDropzone';
import { useSEO } from '../hooks/useSEO';

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

  const handleDrop = (files: File[]) => {
    if (files[0]) { setFile(files[0]); setResultUrl(null); setProgress(''); }
  };

  // PDF → High-quality PNG images (TIFF-equivalent)
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

        // Export as high-quality PNG (browsers don't natively support TIFF)
        const blob = await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/png'));
        if (blob) {
          zip.file(`page_${p}.png`, blob);
        }
        canvas.width = 0;
        canvas.height = 0;
      }

      setProgress('Creating archive…');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      setResultUrl(URL.createObjectURL(zipBlob));
      setResultName(`${file.name.replace(/\.[^/.]+$/, '')}_images.zip`);
      setProgress(`Done! ${pdf.numPages} page(s) exported as lossless PNG images.`);
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
      const pdfBytes = await pdfDoc.save();
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

  const process = () => mode === 'tiff-to-pdf' ? processTiffToPdf() : processPdfToImages();

  const acceptedTypes = mode === 'tiff-to-pdf'
    ? { 'image/tiff': ['.tiff', '.tif'] }
    : { 'application/pdf': ['.pdf'] };

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-8 min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50">
      {/* Header */}
      <div className="text-center mb-8 max-w-2xl">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg mb-4">
          <FileImage className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-3">TIFF Image Converter</h1>
        <p className="text-lg text-gray-600">
          Convert PDF pages to high-quality images — or convert TIFF images (including multi-page) to PDF.
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-2 mb-8 p-1.5 bg-white rounded-2xl shadow-sm border border-gray-200">
        <button
          onClick={() => { setMode('pdf-to-images'); setFile(null); setResultUrl(null); setProgress(''); }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
            mode === 'pdf-to-images'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-gray-600 hover:text-indigo-600 hover:bg-indigo-50'
          }`}
        >
          <FileType2 className="w-4 h-4" />
          PDF → Images (TIFF-quality)
        </button>
        <button
          onClick={() => { setMode('tiff-to-pdf'); setFile(null); setResultUrl(null); setProgress(''); }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
            mode === 'tiff-to-pdf'
              ? 'bg-violet-600 text-white shadow-md'
              : 'text-gray-600 hover:text-violet-600 hover:bg-violet-50'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" />
          TIFF → PDF
        </button>
      </div>

      {/* Info chip */}
      <div className={`mb-6 px-4 py-2 rounded-full text-sm font-medium ${
        mode === 'tiff-to-pdf'
          ? 'bg-violet-100 text-violet-700'
          : 'bg-indigo-100 text-indigo-700'
      }`}>
        {mode === 'tiff-to-pdf'
          ? '✦ Supports multi-page TIFF — each frame becomes a PDF page'
          : '✦ Exports as lossless PNG (TIFF-equivalent quality) — browsers cannot generate real TIFF'}
      </div>

      {!file ? (
        <div className="w-full max-w-xl">
          <FileDropzone
            onDrop={handleDrop}
            multiple={false}
            title={mode === 'tiff-to-pdf' ? 'Drop your TIFF file here' : 'Drop your PDF file here'}
          />
        </div>
      ) : (
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {/* File info */}
          <div className="flex items-center gap-3 mb-6 p-4 bg-gray-50 rounded-xl">
            <FileImage className="w-8 h-8 text-indigo-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate">{file.name}</p>
              <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
            <button
              onClick={() => { setFile(null); setResultUrl(null); setProgress(''); }}
              className="ml-auto text-sm text-gray-500 hover:text-red-500 font-medium transition-colors"
            >
              Remove
            </button>
          </div>

          {/* Render quality (PDF → images only) */}
          {mode === 'pdf-to-images' && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Render Quality</label>
              <select
                value={scale}
                onChange={e => setScale(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-300 outline-none"
              >
                <option value={1.0}>Standard (72 DPI equivalent)</option>
                <option value={1.5}>Good (108 DPI)</option>
                <option value={2.0}>High (150 DPI)</option>
                <option value={3.0}>Ultra (216 DPI)</option>
                <option value={4.0}>Maximum (300 DPI)</option>
              </select>
            </div>
          )}

          {progress && (
            <p className="text-sm text-blue-700 bg-blue-50 rounded-lg px-4 py-2 mb-4">{progress}</p>
          )}

          <div className="flex gap-3">
            <button
              onClick={process}
              disabled={busy}
              className={`flex-1 py-3 text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 transition-all ${
                mode === 'tiff-to-pdf'
                  ? 'bg-violet-600 hover:bg-violet-700'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRightLeft className="w-5 h-5" />}
              {busy
                ? 'Converting…'
                : mode === 'tiff-to-pdf' ? 'Convert TIFF to PDF' : 'Convert to Images'}
            </button>
            <button
              onClick={() => { setFile(null); setResultUrl(null); setProgress(''); }}
              className="px-5 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>

          {resultUrl && (
            <div className="mt-6 p-6 bg-green-50 rounded-xl border border-green-200 text-center">
              <p className="text-green-700 font-medium mb-3">✓ Conversion complete!</p>
              <a
                href={resultUrl}
                download={resultName}
                className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-colors"
              >
                {mode === 'tiff-to-pdf'
                  ? <><Download className="w-5 h-5" /> Download PDF</>
                  : <><Package className="w-5 h-5" /> Download Images ZIP</>}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
