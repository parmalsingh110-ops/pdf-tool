import React, { useState } from 'react';
import { Scissors, Download, Loader2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';

export default function RemoveText() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [redactColor, setRedactColor] = useState('#ffffff');

  const handleDrop = (files: File[]) => {
    if (files[0]) { setFile(files[0]); setResultUrl(null); }
  };

  const process = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const srcPdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const newPdf = await PDFDocument.create();

      for (let p = 1; p <= srcPdf.numPages; p++) {
        const page = await srcPdf.getPage(p);
        const vp = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

        // Get all text positions and redact them
        const textContent = await page.getTextContent();
        for (const item of textContent.items as any[]) {
          if (!item.str.trim()) continue;
          const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
          const x = tx[4];
          const y = tx[5] - item.height * vp.scale;
          const w = item.width * vp.scale;
          const h = item.height * vp.scale;
          ctx.fillStyle = redactColor;
          ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
        }

        const imgDataUrl = canvas.toDataURL('image/jpeg', 0.92);
        const imgBytes = await fetch(imgDataUrl).then(r => r.arrayBuffer());
        const pdfImage = await newPdf.embedJpg(imgBytes);
        const origVp = page.getViewport({ scale: 1 });
        const newPage = newPdf.addPage([origVp.width, origVp.height]);
        newPage.drawImage(pdfImage, { x: 0, y: 0, width: origVp.width, height: origVp.height });
        canvas.width = 0;
        canvas.height = 0;
      }

      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      alert(e?.message || 'Text removal failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Remove Text</h1>
        <p className="text-xl text-gray-600">Permanently remove or redact all text from a PDF.</p>
      </div>
      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-3 mb-6">
            <label className="text-sm font-medium text-gray-700">Redact Color</label>
            <input type="color" value={redactColor} onChange={e => setRedactColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer" />
            <button onClick={() => setRedactColor('#ffffff')} className="px-2 py-1 bg-gray-100 rounded text-xs font-medium">White</button>
            <button onClick={() => setRedactColor('#000000')} className="px-2 py-1 bg-gray-100 rounded text-xs font-medium">Black</button>
          </div>
          <div className="flex gap-3">
            <button onClick={process} disabled={busy} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Scissors className="w-5 h-5" />}
              {busy ? 'Removing…' : 'Remove All Text'}
            </button>
            <button onClick={() => { setFile(null); setResultUrl(null); }} className="px-5 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200">Cancel</button>
          </div>
          {resultUrl && (
            <div className="mt-6 p-6 bg-green-50 rounded-xl border border-green-200 text-center">
              <a href={resultUrl} download={`redacted_${file.name}`} className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700">
                <Download className="w-5 h-5" /> Download
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
