import { useState } from 'react';
import { FileText, Download, Loader2, Check } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';

interface PageThumb {
  index: number;
  url: string;
  selected: boolean;
}

export default function ExtractPages() {
  usePageSEO('Extract Pages from PDF', 'Select and extract specific pages from PDF with visual thumbnails. Free online PDF page extractor.');
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageThumb[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    setFile(files[0]);
    setResultUrl(null);
    setLoading(true);
    try {
      const buf = await files[0].arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const thumbs: PageThumb[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 0.3 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
        thumbs.push({ index: i, url: canvas.toDataURL('image/jpeg', 0.6), selected: false });
        canvas.width = 0; canvas.height = 0;
      }
      setPages(thumbs);
    } catch (e: any) { alert(e?.message || 'Failed to load PDF'); }
    finally { setLoading(false); }
  };

  const togglePage = (idx: number) => {
    setPages(p => p.map((pg, i) => i === idx ? { ...pg, selected: !pg.selected } : pg));
  };

  const selectAll = () => setPages(p => p.map(pg => ({ ...pg, selected: true })));
  const deselectAll = () => setPages(p => p.map(pg => ({ ...pg, selected: false })));

  const extract = async () => {
    if (!file) return;
    const selectedIndices = pages.filter(p => p.selected).map(p => p.index - 1);
    if (selectedIndices.length === 0) return alert('Select at least one page.');
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const src = await PDFDocument.load(buf);
      const newDoc = await PDFDocument.create();
      const copied = await newDoc.copyPages(src, selectedIndices);
      copied.forEach(p => newDoc.addPage(p));
      const bytes = await newDoc.save();
      setResultUrl(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
    } catch (e: any) { alert(e?.message || 'Extraction failed'); }
    finally { setBusy(false); }
  };

  const selectedCount = pages.filter(p => p.selected).length;

  return (
    <div className="flex-1 flex flex-col items-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Extract Pages</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400">Visually select pages and extract them into a new PDF.</p>
      </div>
      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : loading ? (
        <div className="flex items-center gap-3 text-gray-600 dark:text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /> Generating thumbnails…</div>
      ) : resultUrl ? (
        <div className="w-full max-w-2xl text-center space-y-6">
          <div className="p-8 bg-green-50 dark:bg-green-950/30 rounded-2xl border border-green-200 dark:border-green-800">
            <h3 className="text-2xl font-bold text-green-800 dark:text-green-300 mb-4">Extracted {selectedCount} page(s)!</h3>
            <a href={resultUrl} download={`extracted_${file.name}`} className="inline-flex items-center gap-2 px-8 py-4 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700">
              <Download className="w-5 h-5" /> Download
            </a>
          </div>
          <button onClick={() => { setFile(null); setPages([]); setResultUrl(null); }} className="text-gray-500 dark:text-slate-400 font-medium">Extract from another PDF</button>
        </div>
      ) : (
        <div className="w-full max-w-5xl space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold text-gray-700 dark:text-slate-300">{selectedCount} of {pages.length} selected</span>
            <button onClick={selectAll} className="px-3 py-1.5 text-xs font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 rounded-lg">Select All</button>
            <button onClick={deselectAll} className="px-3 py-1.5 text-xs font-bold bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 rounded-lg">Deselect All</button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {pages.map((pg, i) => (
              <button key={pg.index} onClick={() => togglePage(i)} className={`relative rounded-xl overflow-hidden border-2 transition-all hover:scale-105 ${pg.selected ? 'border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-800' : 'border-gray-200 dark:border-slate-700'}`}>
                <img src={pg.url} alt={`Page ${pg.index}`} className="w-full aspect-[3/4] object-cover" />
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] font-bold py-1 text-center">{pg.index}</div>
                {pg.selected && <div className="absolute top-1 right-1 w-5 h-5 bg-indigo-500 text-white rounded-full flex items-center justify-center"><Check className="w-3 h-3" /></div>}
              </button>
            ))}
          </div>
          <div className="flex gap-4">
            <button onClick={extract} disabled={busy || selectedCount === 0} className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
              {busy ? 'Extracting…' : `Extract ${selectedCount} Page(s)`}
            </button>
            <button onClick={() => { setFile(null); setPages([]); }} className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
