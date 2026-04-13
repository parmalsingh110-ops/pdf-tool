import React, { useState } from 'react';
import { FileImage, Download, Loader2, Package } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import JSZip from 'jszip';
import FileDropzone from '../components/FileDropzone';

export default function ConvertToTiff() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [scale, setScale] = useState(2.0);

  const handleDrop = (files: File[]) => {
    if (files[0]) { setFile(files[0]); setResultUrl(null); }
  };

  const process = async () => {
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
        // We use PNG as the highest quality lossless format available in browsers
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
      setProgress(`Done! ${pdf.numPages} page(s) exported as lossless PNG images.`);
    } catch (e: any) {
      alert(e?.message || 'Conversion failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Convert to High-Quality Images</h1>
        <p className="text-xl text-gray-600">Export PDF pages as high-quality lossless PNG images (TIFF-equivalent quality).</p>
        <p className="text-sm text-gray-500 mt-2">Browser engines export as PNG (lossless, same quality as TIFF). For actual TIFF container format, a server-side tool is needed.</p>
      </div>
      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Render Quality</label>
            <select value={scale} onChange={e => setScale(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
              <option value={1.0}>Standard (72 DPI equivalent)</option>
              <option value={1.5}>Good (108 DPI)</option>
              <option value={2.0}>High (150 DPI)</option>
              <option value={3.0}>Ultra (216 DPI)</option>
              <option value={4.0}>Maximum (300 DPI)</option>
            </select>
          </div>
          {progress && <p className="text-sm text-blue-700 bg-blue-50 rounded-lg px-4 py-2 mb-4">{progress}</p>}
          <div className="flex gap-3">
            <button onClick={process} disabled={busy} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileImage className="w-5 h-5" />}
              {busy ? 'Converting…' : 'Convert to Images'}
            </button>
            <button onClick={() => { setFile(null); setResultUrl(null); }} className="px-5 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200">Cancel</button>
          </div>
          {resultUrl && (
            <div className="mt-6 p-6 bg-green-50 rounded-xl border border-green-200 text-center">
              <a href={resultUrl} download={`${file.name.replace(/\.[^/.]+$/, '')}_images.zip`} className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700">
                <Package className="w-5 h-5" /> Download Images ZIP
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
