import { useState } from 'react';
import { Layers, Download, Loader2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import '../lib/pdfWorker';
import { usePageSEO } from '../lib/usePageSEO';

export default function PdfOverlay() {
  usePageSEO('PDF Overlay Tool', 'Stack two PDFs on top of each other with adjustable transparency. Free online PDF overlay comparison tool.');
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [opacity, setOpacity] = useState(0.5);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const overlay = async () => {
    if (!fileA || !fileB) return;
    setBusy(true);
    try {
      const bufA = await fileA.arrayBuffer();
      const bufB = await fileB.arrayBuffer();
      const pdfA = await pdfjsLib.getDocument({ data: new Uint8Array(bufA) }).promise;
      const pdfB = await pdfjsLib.getDocument({ data: new Uint8Array(bufB) }).promise;
      const maxPages = Math.max(pdfA.numPages, pdfB.numPages);
      const newDoc = await PDFDocument.create();

      for (let p = 1; p <= maxPages; p++) {
        const scale = 2;
        const renderPage = async (pdf: pdfjsLib.PDFDocumentProxy, num: number) => {
          if (num > pdf.numPages) return null;
          const page = await pdf.getPage(num);
          const vp = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width; canvas.height = vp.height;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
          return canvas;
        };

        const canvasA = await renderPage(pdfA, p);
        const canvasB = await renderPage(pdfB, p);

        const w = Math.max(canvasA?.width || 0, canvasB?.width || 0);
        const h = Math.max(canvasA?.height || 0, canvasB?.height || 0);
        if (w === 0 || h === 0) continue;

        const result = document.createElement('canvas');
        result.width = w; result.height = h;
        const ctx = result.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);

        if (canvasA) { ctx.globalAlpha = 1; ctx.drawImage(canvasA, 0, 0); }
        if (canvasB) { ctx.globalAlpha = opacity; ctx.drawImage(canvasB, 0, 0); }
        ctx.globalAlpha = 1;

        const blob = await new Promise<Blob | null>(r => result.toBlob(b => r(b), 'image/jpeg', 0.92));
        if (blob) {
          const imgBytes = await blob.arrayBuffer();
          const pdfImg = await newDoc.embedJpg(imgBytes);
          const pageA = p <= pdfA.numPages ? await pdfA.getPage(p) : null;
          const origVp = pageA ? pageA.getViewport({ scale: 1 }) : { width: w / scale, height: h / scale };
          const page = newDoc.addPage([origVp.width, origVp.height]);
          page.drawImage(pdfImg, { x: 0, y: 0, width: origVp.width, height: origVp.height });
        }
        if (canvasA) canvasA.width = 0;
        if (canvasB) canvasB.width = 0;
        result.width = 0;
      }

      const bytes = await newDoc.save();
      setResultUrl(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
    } catch (e: any) { alert(e?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">PDF A/B Overlay</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400">Stack two PDFs on top of each other with adjustable transparency.</p>
      </div>
      {resultUrl ? (
        <div className="w-full max-w-2xl text-center space-y-6">
          <div className="p-8 bg-green-50 dark:bg-green-950/30 rounded-2xl border border-green-200 dark:border-green-800">
            <h3 className="text-2xl font-bold text-green-800 dark:text-green-300 mb-4">Overlay complete!</h3>
            <a href={resultUrl} download="overlay_result.pdf" className="inline-flex items-center gap-2 px-8 py-4 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700"><Download className="w-5 h-5" /> Download</a>
          </div>
          <button onClick={() => { setFileA(null); setFileB(null); setResultUrl(null); }} className="text-gray-500 dark:text-slate-400 font-medium">Overlay more</button>
        </div>
      ) : (
        <div className="w-full max-w-3xl space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-6 text-center">
              <p className="text-sm font-bold text-gray-700 dark:text-slate-300 mb-3">PDF A (Base Layer)</p>
              {fileA ? (
                <div className="flex items-center gap-2 bg-gray-50 dark:bg-slate-800 px-3 py-2 rounded-lg">
                  <span className="text-sm truncate flex-1 text-gray-900 dark:text-white">{fileA.name}</span>
                  <button onClick={() => setFileA(null)} className="text-red-500 text-xs font-bold">✕</button>
                </div>
              ) : (
                <label className="block cursor-pointer text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">Select PDF A <input type="file" accept=".pdf" className="hidden" onChange={e => { if (e.target.files?.[0]) setFileA(e.target.files[0]); }} /></label>
              )}
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-6 text-center">
              <p className="text-sm font-bold text-gray-700 dark:text-slate-300 mb-3">PDF B (Overlay Layer)</p>
              {fileB ? (
                <div className="flex items-center gap-2 bg-gray-50 dark:bg-slate-800 px-3 py-2 rounded-lg">
                  <span className="text-sm truncate flex-1 text-gray-900 dark:text-white">{fileB.name}</span>
                  <button onClick={() => setFileB(null)} className="text-red-500 text-xs font-bold">✕</button>
                </div>
              ) : (
                <label className="block cursor-pointer text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">Select PDF B <input type="file" accept=".pdf" className="hidden" onChange={e => { if (e.target.files?.[0]) setFileB(e.target.files[0]); }} /></label>
              )}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Overlay Opacity: {Math.round(opacity * 100)}%</label>
            <input type="range" min="0.1" max="0.9" step="0.05" value={opacity} onChange={e => setOpacity(+e.target.value)} className="w-full accent-indigo-600" />
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">100% = PDF B fully visible, 10% = ghostly overlay</p>
          </div>
          <button onClick={overlay} disabled={busy || !fileA || !fileB} className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Layers className="w-5 h-5" />} {busy ? 'Overlaying…' : 'Create Overlay'}
          </button>
        </div>
      )}
    </div>
  );
}
