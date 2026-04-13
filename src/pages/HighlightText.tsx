import React, { useState } from 'react';
import { Search, Download, Loader2 } from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';

export default function HighlightText() {
  const [file, setFile] = useState<File | null>(null);
  const [keywords, setKeywords] = useState('');
  const [highlightColor, setHighlightColor] = useState('#ffff00');
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [matchCount, setMatchCount] = useState<number | null>(null);

  const handleDrop = (files: File[]) => {
    if (files[0]) { setFile(files[0]); setResultUrl(null); setMatchCount(null); }
  };

  const hexToRgbNorm = (hex: string) => {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r ? { r: parseInt(r[1], 16) / 255, g: parseInt(r[2], 16) / 255, b: parseInt(r[3], 16) / 255 } : { r: 1, g: 1, b: 0 };
  };

  const process = async () => {
    if (!file || !keywords.trim()) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(buf);
      const srcPdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const pages = pdfDoc.getPages();
      const words = keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
      const { r, g, b } = hexToRgbNorm(highlightColor);
      let total = 0;

      for (let p = 0; p < pages.length; p++) {
        const page = pages[p];
        const { height } = page.getSize();
        const srcPage = await srcPdf.getPage(p + 1);
        const vp = srcPage.getViewport({ scale: 1 });
        const textContent = await srcPage.getTextContent();

        for (const item of textContent.items as any[]) {
          const txt = item.str.toLowerCase();
          if (words.some(w => txt.includes(w))) {
            total++;
            const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
            const x = tx[4];
            const y = height - tx[5];
            const w2 = item.width;
            const h2 = item.height;
            page.drawRectangle({
              x: x,
              y: y - h2 * 0.2,
              width: w2,
              height: h2 * 1.2,
              color: rgb(r, g, b),
              opacity: 0.35,
            });
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
      setMatchCount(total);
    } catch (e: any) {
      alert(e?.message || 'Highlight failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Highlight Search Terms</h1>
        <p className="text-xl text-gray-600">Automatically highlight specific keywords in your PDF.</p>
      </div>
      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Keywords (comma-separated)</label>
              <input type="text" value={keywords} onChange={e => setKeywords(e.target.value)}
                placeholder="invoice, total, amount" className="w-full px-4 py-3 border border-gray-300 rounded-xl" />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Highlight Color</label>
              <input type="color" value={highlightColor} onChange={e => setHighlightColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer" />
            </div>
          </div>
          {matchCount !== null && <p className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-2 mb-4">Highlighted {matchCount} text block(s).</p>}
          <div className="flex gap-3">
            <button onClick={process} disabled={busy || !keywords.trim()} className="flex-1 py-3 bg-yellow-600 text-white font-bold rounded-xl hover:bg-yellow-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
              {busy ? 'Highlighting…' : 'Highlight Terms'}
            </button>
            <button onClick={() => { setFile(null); setResultUrl(null); }} className="px-5 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200">Cancel</button>
          </div>
          {resultUrl && (
            <div className="mt-6 p-6 bg-green-50 rounded-xl border border-green-200 text-center">
              <a href={resultUrl} download={`highlighted_${file.name}`} className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700">
                <Download className="w-5 h-5" /> Download
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
