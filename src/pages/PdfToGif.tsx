import React, { useState } from 'react';
import { ImageIcon, Download, Loader2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { encode } from 'modern-gif';
import FileDropzone from '../components/FileDropzone';

export default function PdfToGif() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [delay, setDelay] = useState(1000);
  const [scale, setScale] = useState(1.0);

  const handleDrop = (files: File[]) => {
    if (files[0]) { setFile(files[0]); setResultUrl(null); }
  };

  const process = async () => {
    if (!file) return;
    setBusy(true);
    setProgress('Loading PDF…');
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const frames: { data: Uint8ClampedArray; width: number; height: number }[] = [];

      // Determine uniform size from first page
      const firstPage = await pdf.getPage(1);
      const firstVp = firstPage.getViewport({ scale });
      const targetW = Math.round(firstVp.width);
      const targetH = Math.round(firstVp.height);

      for (let p = 1; p <= pdf.numPages; p++) {
        setProgress(`Rendering page ${p} of ${pdf.numPages}…`);
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
        const imageData = ctx.getImageData(0, 0, targetW, targetH);
        frames.push({ data: imageData.data, width: targetW, height: targetH });
        canvas.width = 0;
        canvas.height = 0;
      }

      setProgress('Encoding GIF…');
      const gifFrames = frames.map(f => ({
        data: f.data,
        delay: delay,
      }));

      const output = await encode({
        width: targetW,
        height: targetH,
        frames: gifFrames,
      });

      const blob = new Blob([output], { type: 'image/gif' });
      setResultUrl(URL.createObjectURL(blob));
      setProgress('Done!');
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'GIF creation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">PDF to GIF</h1>
        <p className="text-xl text-gray-600">Create an animated GIF from your PDF pages.</p>
      </div>
      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delay per page (ms)</label>
              <input type="number" value={delay} min={200} max={5000} step={100} onChange={e => setDelay(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scale</label>
              <select value={scale} onChange={e => setScale(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option value={0.5}>50% (fast)</option>
                <option value={0.75}>75%</option>
                <option value={1.0}>100%</option>
                <option value={1.5}>150% (HD)</option>
              </select>
            </div>
          </div>
          {progress && <p className="text-sm text-blue-700 bg-blue-50 rounded-lg px-4 py-2 mb-4">{progress}</p>}
          <div className="flex gap-3">
            <button onClick={process} disabled={busy} className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
              {busy ? 'Creating GIF…' : 'Convert to GIF'}
            </button>
            <button onClick={() => { setFile(null); setResultUrl(null); }} className="px-5 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200">Cancel</button>
          </div>
          {resultUrl && (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50 max-h-[400px] flex items-center justify-center">
                <img src={resultUrl} alt="Generated GIF" className="max-w-full max-h-[400px] object-contain" />
              </div>
              <a href={resultUrl} download={`${file.name.replace(/\.[^/.]+$/, '')}.gif`} className="w-full inline-flex items-center justify-center gap-2 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700">
                <Download className="w-5 h-5" /> Download GIF
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
