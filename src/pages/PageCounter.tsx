import { useState } from 'react';
import { FileText, Hash, Loader2 } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { usePageSEO } from '../lib/usePageSEO';

interface PageInfo { name: string; pages: number; size: string; }

export default function PageCounter() {
  usePageSEO('PDF Page Counter', 'Count total pages across multiple PDF files instantly. Free online batch PDF page counter.');
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<PageInfo[]>([]);
  const [busy, setBusy] = useState(false);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) { setFiles(Array.from(e.target.files)); setResults([]); }
  };

  const count = async () => {
    if (files.length === 0) return;
    setBusy(true);
    try {
      const infos: PageInfo[] = [];
      for (const f of files) {
        try {
          const buf = await f.arrayBuffer();
          const pdf = await PDFDocument.load(buf, { ignoreEncryption: true });
          infos.push({ name: f.name, pages: pdf.getPageCount(), size: (f.size / 1024 / 1024).toFixed(2) + ' MB' });
        } catch {
          infos.push({ name: f.name, pages: -1, size: (f.size / 1024 / 1024).toFixed(2) + ' MB' });
        }
      }
      setResults(infos);
    } finally { setBusy(false); }
  };

  const totalPages = results.reduce((s, r) => s + (r.pages > 0 ? r.pages : 0), 0);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Multi-PDF Page Counter</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400">Batch upload PDFs to get total page count instantly.</p>
      </div>
      {files.length === 0 ? (
        <label className="w-full max-w-3xl flex flex-col items-center justify-center h-72 border-4 border-dashed border-gray-300 dark:border-slate-700 rounded-2xl cursor-pointer bg-white dark:bg-slate-900 hover:border-purple-400 transition-colors">
          <Hash className="w-16 h-16 text-gray-400 dark:text-slate-500 mb-4" />
          <span className="text-xl font-bold text-gray-900 dark:text-white">Select PDF Files</span>
          <span className="text-sm text-gray-500 dark:text-slate-400 mt-2">Multiple PDFs supported</span>
          <input type="file" multiple accept=".pdf" className="hidden" onChange={handleFiles} />
        </label>
      ) : results.length > 0 ? (
        <div className="w-full max-w-3xl space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-6 bg-purple-50 dark:bg-purple-950/30 rounded-2xl border border-purple-200 dark:border-purple-800 text-center">
              <p className="text-4xl font-extrabold text-purple-700 dark:text-purple-300">{totalPages}</p>
              <p className="text-sm text-purple-600 dark:text-purple-400 mt-1">Total Pages</p>
            </div>
            <div className="p-6 bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl border border-indigo-200 dark:border-indigo-800 text-center">
              <p className="text-4xl font-extrabold text-indigo-700 dark:text-indigo-300">{results.length}</p>
              <p className="text-sm text-indigo-600 dark:text-indigo-400 mt-1">Files</p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 dark:bg-slate-800 text-left"><th className="px-4 py-3 font-bold text-gray-700 dark:text-slate-300">File</th><th className="px-4 py-3 font-bold text-gray-700 dark:text-slate-300 text-right">Pages</th><th className="px-4 py-3 font-bold text-gray-700 dark:text-slate-300 text-right">Size</th></tr></thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-slate-800">
                    <td className="px-4 py-3 text-gray-900 dark:text-white truncate max-w-[300px]">{r.name}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white">{r.pages > 0 ? r.pages : <span className="text-red-500">Error</span>}</td>
                    <td className="px-4 py-3 text-right text-gray-500 dark:text-slate-400">{r.size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => { setFiles([]); setResults([]); }} className="w-full py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold">Count more files</button>
        </div>
      ) : (
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 space-y-6 text-center">
          <p className="text-gray-700 dark:text-slate-300 font-semibold">{files.length} PDF(s) selected</p>
          <button onClick={count} disabled={busy} className="w-full py-4 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Hash className="w-5 h-5" />} {busy ? 'Counting…' : 'Count Pages'}
          </button>
          <button onClick={() => setFiles([])} className="text-gray-500 dark:text-slate-400 font-medium text-sm">Cancel</button>
        </div>
      )}
    </div>
  );
}
