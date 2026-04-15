import { useState } from 'react';
import { RotateCw, Download, Loader2, Check } from 'lucide-react';
import { PDFDocument, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';

interface PageInfo { index: number; url: string; rotation: number; }

export default function RotatePages() {
  usePageSEO('Rotate PDF Pages Online', 'Rotate individual PDF pages by 90, 180, or 270 degrees. Free online PDF page rotation tool.');
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    setFile(files[0]); setResultUrl(null); setPages([]);
    setLoading(true);
    try {
      const buf = await files[0].arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const items: PageInfo[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 0.3 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
        items.push({ index: i, url: canvas.toDataURL('image/jpeg', 0.6), rotation: 0 });
        canvas.width = 0; canvas.height = 0;
      }
      setPages(items);
    } catch (e: any) { alert(e?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  const rotate = (idx: number) => {
    setPages(p => p.map((pg, i) => i === idx ? { ...pg, rotation: (pg.rotation + 90) % 360 } : pg));
  };

  const rotateAll = (deg: number) => {
    setPages(p => p.map(pg => ({ ...pg, rotation: (pg.rotation + deg) % 360 })));
  };

  const apply = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const doc = await PDFDocument.load(buf);
      const pdfPages = doc.getPages();
      pages.forEach((pg, i) => {
        if (pg.rotation !== 0) pdfPages[i].setRotation(degrees(pdfPages[i].getRotation().angle + pg.rotation));
      });
      const bytes = await doc.save();
      setResultUrl(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
    } catch (e: any) { alert(e?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  const changedCount = pages.filter(p => p.rotation !== 0).length;

  return (
    <div className="flex-1 flex flex-col items-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Rotate PDF Pages</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400">Click to rotate individual pages or apply rotation to all.</p>
      </div>
      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : loading ? (
        <div className="flex items-center gap-3 text-gray-600 dark:text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /> Loading pages…</div>
      ) : resultUrl ? (
        <div className="w-full max-w-2xl text-center space-y-6">
          <div className="p-8 bg-green-50 dark:bg-green-950/30 rounded-2xl border border-green-200 dark:border-green-800">
            <h3 className="text-2xl font-bold text-green-800 dark:text-green-300 mb-4">Rotated {changedCount} page(s)!</h3>
            <a href={resultUrl} download={`rotated_${file.name}`} className="inline-flex items-center gap-2 px-8 py-4 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700"><Download className="w-5 h-5" /> Download</a>
          </div>
          <button onClick={() => { setFile(null); setPages([]); setResultUrl(null); }} className="text-gray-500 dark:text-slate-400 font-medium">Process another</button>
        </div>
      ) : (
        <div className="w-full max-w-5xl space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => rotateAll(90)} className="px-4 py-2 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-bold rounded-lg text-sm">Rotate All 90°</button>
            <button onClick={() => rotateAll(180)} className="px-4 py-2 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-bold rounded-lg text-sm">Rotate All 180°</button>
            <span className="text-sm text-gray-500 dark:text-slate-400 ml-auto">{changedCount} page(s) modified</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {pages.map((pg, i) => (
              <button key={pg.index} onClick={() => rotate(i)} className={`relative rounded-xl overflow-hidden border-2 transition-all hover:scale-105 ${pg.rotation ? 'border-sky-400 ring-1 ring-sky-200 dark:ring-sky-800' : 'border-gray-200 dark:border-slate-700'}`}>
                <div className="w-full aspect-[3/4] overflow-hidden flex items-center justify-center bg-gray-100 dark:bg-slate-800">
                  <img src={pg.url} alt={`Page ${pg.index}`} className="max-w-full max-h-full object-contain transition-transform" style={{ transform: `rotate(${pg.rotation}deg)` }} />
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] font-bold py-1 text-center flex items-center justify-center gap-1">
                  <RotateCw className="w-3 h-3" /> {pg.index}{pg.rotation ? ` (${pg.rotation}°)` : ''}
                </div>
              </button>
            ))}
          </div>
          <div className="flex gap-4">
            <button onClick={apply} disabled={busy || changedCount === 0} className="flex-1 py-4 bg-sky-600 text-white font-bold rounded-xl hover:bg-sky-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />} Apply Rotation
            </button>
            <button onClick={() => { setFile(null); setPages([]); }} className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-semibold rounded-xl">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
