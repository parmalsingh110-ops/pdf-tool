import { useState } from 'react';
import { FileX, Download, Loader2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';

export default function RemoveBlankPages() {
  usePageSEO('Remove Blank Pages from PDF', 'Auto-detect and remove blank pages from scanned PDFs. Free online blank page remover.');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<{ total: number; blank: number } | null>(null);
  const [threshold, setThreshold] = useState(99);

  const handleDrop = (files: File[]) => {
    if (files[0]) { setFile(files[0]); setResultUrl(null); setStats(null); }
  };

  const process = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const keepIndices: number[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 0.5 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        let whitePixels = 0;
        const totalPixels = canvas.width * canvas.height;
        for (let j = 0; j < d.length; j += 4) {
          if (d[j] > 250 && d[j + 1] > 250 && d[j + 2] > 250) whitePixels++;
        }
        const whitePct = (whitePixels / totalPixels) * 100;
        if (whitePct < threshold) keepIndices.push(i - 1);
        canvas.width = 0; canvas.height = 0;
      }

      const blankCount = pdf.numPages - keepIndices.length;
      if (keepIndices.length === 0) {
        setStats({ total: pdf.numPages, blank: blankCount });
        alert('All pages appear blank! No output generated.');
        setBusy(false);
        return;
      }

      const srcDoc = await PDFDocument.load(buf);
      const newDoc = await PDFDocument.create();
      const copied = await newDoc.copyPages(srcDoc, keepIndices);
      copied.forEach(p => newDoc.addPage(p));
      const bytes = await newDoc.save();
      setResultUrl(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
      setStats({ total: pdf.numPages, blank: blankCount });
    } catch (e: any) { alert(e?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Blank Page Remover</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400">Auto-detect and remove blank or near-blank pages from scanned documents.</p>
      </div>
      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : resultUrl && stats ? (
        <div className="w-full max-w-2xl text-center space-y-6">
          <div className="p-8 bg-green-50 dark:bg-green-950/30 rounded-2xl border border-green-200 dark:border-green-800">
            <h3 className="text-2xl font-bold text-green-800 dark:text-green-300 mb-2">Removed {stats.blank} blank page(s)!</h3>
            <p className="text-sm text-green-600 dark:text-green-400 mb-4">{stats.total} → {stats.total - stats.blank} pages</p>
            <a href={resultUrl} download={`cleaned_${file.name}`} className="inline-flex items-center gap-2 px-8 py-4 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700"><Download className="w-5 h-5" /> Download</a>
          </div>
          <button onClick={() => { setFile(null); setResultUrl(null); setStats(null); }} className="text-gray-500 dark:text-slate-400 font-medium">Process another</button>
        </div>
      ) : (
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 space-y-6">
          <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-slate-800 rounded-xl">
            <FileX className="w-8 h-8 text-orange-500" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white truncate">{file.name}</p>
              <p className="text-sm text-gray-500 dark:text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Blank threshold: {threshold}% white</label>
            <input type="range" min="90" max="100" step="0.5" value={threshold} onChange={e => setThreshold(+e.target.value)} className="w-full accent-orange-600" />
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Pages with more than {threshold}% white pixels will be removed.</p>
          </div>
          <div className="flex gap-4">
            <button onClick={process} disabled={busy} className="flex-1 py-4 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileX className="w-5 h-5" />} {busy ? 'Scanning…' : 'Remove Blank Pages'}
            </button>
            <button onClick={() => setFile(null)} className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-semibold rounded-xl">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
