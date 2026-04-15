import { useState } from 'react';
import { Copy, Loader2, Trash2, Check } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';

interface PageInfo { index: number; url: string; hash: string; isDuplicate: boolean; duplicateOf: number | null; }

function hashCanvas(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d')!;
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let h = 0;
  for (let i = 0; i < d.length; i += 64) { h = ((h << 5) - h + d[i]) | 0; }
  return h.toString(36);
}

export default function DuplicatePages() {
  usePageSEO('Find Duplicate PDF Pages', 'Detect and remove duplicate pages from PDF documents. Free online duplicate page finder.');
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    setFile(files[0]); setResultUrl(null); setPages([]);
    setLoading(true);
    try {
      const buf = await files[0].arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const items: PageInfo[] = [];
      const hashMap = new Map<string, number>();

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 0.4 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
        const h = hashCanvas(canvas);
        const url = canvas.toDataURL('image/jpeg', 0.5);
        const existing = hashMap.get(h);
        items.push({ index: i, url, hash: h, isDuplicate: existing !== undefined, duplicateOf: existing ?? null });
        if (!hashMap.has(h)) hashMap.set(h, i);
        canvas.width = 0; canvas.height = 0;
      }
      setPages(items);
    } catch (e: any) { alert(e?.message || 'Failed to load'); }
    finally { setLoading(false); }
  };

  const removeDuplicates = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const keep = pages.filter(p => !p.isDuplicate).map(p => p.index - 1);
      const buf = await file.arrayBuffer();
      const src = await PDFDocument.load(buf);
      const doc = await PDFDocument.create();
      const copied = await doc.copyPages(src, keep);
      copied.forEach(p => doc.addPage(p));
      const bytes = await doc.save();
      setResultUrl(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
    } catch (e: any) { alert(e?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  const dupCount = pages.filter(p => p.isDuplicate).length;

  return (
    <div className="flex-1 flex flex-col items-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Duplicate Page Finder</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400">Detect and remove duplicate pages from your PDF.</p>
      </div>
      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : loading ? (
        <div className="flex items-center gap-3 text-gray-600 dark:text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /> Scanning pages…</div>
      ) : resultUrl ? (
        <div className="w-full max-w-2xl text-center space-y-6">
          <div className="p-8 bg-green-50 dark:bg-green-950/30 rounded-2xl border border-green-200 dark:border-green-800">
            <h3 className="text-2xl font-bold text-green-800 dark:text-green-300 mb-2">Removed {dupCount} duplicate(s)!</h3>
            <a href={resultUrl} download={`deduped_${file.name}`} className="inline-flex items-center gap-2 px-8 py-4 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 mt-3"><Check className="w-5 h-5" /> Download</a>
          </div>
          <button onClick={() => { setFile(null); setPages([]); setResultUrl(null); }} className="text-gray-500 dark:text-slate-400 font-medium">Process another</button>
        </div>
      ) : (
        <div className="w-full max-w-5xl space-y-6">
          <div className="flex items-center gap-4">
            <span className="text-sm font-bold text-gray-700 dark:text-slate-300">{pages.length} pages • <span className="text-red-600 dark:text-red-400">{dupCount} duplicates</span></span>
            {dupCount > 0 && (
              <button onClick={removeDuplicates} disabled={busy} className="px-5 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Remove {dupCount} Duplicate(s)
              </button>
            )}
            {dupCount === 0 && <span className="text-sm text-green-600 dark:text-green-400 font-semibold">✓ No duplicates found!</span>}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {pages.map(pg => (
              <div key={pg.index} className={`relative rounded-xl overflow-hidden border-2 ${pg.isDuplicate ? 'border-red-400 bg-red-50 dark:bg-red-950/30 opacity-70' : 'border-gray-200 dark:border-slate-700'}`}>
                <img src={pg.url} alt={`Page ${pg.index}`} className="w-full aspect-[3/4] object-cover" />
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] font-bold py-1 text-center">
                  {pg.index}{pg.isDuplicate && <span className="text-red-300"> (dup of {pg.duplicateOf})</span>}
                </div>
                {pg.isDuplicate && <div className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"><Copy className="w-3 h-3" /></div>}
              </div>
            ))}
          </div>
          <button onClick={() => { setFile(null); setPages([]); }} className="w-full py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-semibold rounded-xl">Cancel</button>
        </div>
      )}
    </div>
  );
}
