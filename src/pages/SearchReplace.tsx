import React, { useState } from 'react';
import { Search, Download, Loader2 } from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';

export default function SearchReplace() {
  const [file, setFile] = useState<File | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = (files: File[]) => {
    if (files[0]) {
      setFile(files[0]);
      setResultUrl(null);
      setMatchCount(null);
      setError(null);
    }
  };

  const processSearchReplace = async () => {
    if (!file || !searchTerm.trim()) return;
    setBusy(true);
    setError(null);
    setMatchCount(null);
    try {
      const buf = await file.arrayBuffer();
      const srcPdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const newPdf = await PDFDocument.create();
      const font = await newPdf.embedFont(StandardFonts.Helvetica);

      let totalMatches = 0;

      for (let p = 1; p <= srcPdf.numPages; p++) {
        const page = await srcPdf.getPage(p);
        const vp = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

        // Find text matches
        const textContent = await page.getTextContent();
        const searchLower = searchTerm.toLowerCase();
        
        for (const item of textContent.items as any[]) {
          if (item.str.toLowerCase().includes(searchLower)) {
            totalMatches++;
            const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
            const x = tx[4];
            const y = tx[5] - item.height * vp.scale;
            const w = item.width * vp.scale;
            const h = item.height * vp.scale;
            
            // Whiteout original text
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x - 1, y - 1, w + 2, h + 2);

            // Draw replacement
            const replaced = item.str.replace(new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), replaceTerm);
            const fontSize = Math.max(10, Math.round(h * 0.7));
            ctx.font = `${fontSize}px Helvetica, Arial, sans-serif`;
            ctx.fillStyle = '#000000';
            ctx.textBaseline = 'bottom';
            ctx.fillText(replaced, x, y + h);
          }
        }

        // Add page as image to new PDF
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
      setMatchCount(totalMatches);
    } catch (e: any) {
      setError(e?.message || 'Search & Replace failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Search & Replace</h1>
        <p className="text-xl text-gray-600">Find and replace text across your entire PDF.</p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search for</label>
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Text to find…"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Replace with</label>
              <input
                type="text"
                value={replaceTerm}
                onChange={e => setReplaceTerm(e.target.value)}
                placeholder="Replacement text…"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {error && <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg mb-4 text-sm">{error}</div>}
          {matchCount !== null && <p className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-2 mb-4">{matchCount} text block(s) replaced.</p>}

          <div className="flex gap-3">
            <button
              onClick={processSearchReplace}
              disabled={busy || !searchTerm.trim()}
              className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
              {busy ? 'Processing…' : 'Search and Replace'}
            </button>
            <button onClick={() => { setFile(null); setResultUrl(null); }} className="px-5 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200">Cancel</button>
          </div>

          {resultUrl && (
            <div className="mt-6 p-6 bg-green-50 rounded-xl border border-green-200 text-center">
              <h3 className="text-xl font-bold text-green-800 mb-3">Done!</h3>
              <a href={resultUrl} download={`replaced_${file.name}`} className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700">
                <Download className="w-5 h-5" />
                Download Result
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
