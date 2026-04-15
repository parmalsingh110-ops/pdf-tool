import { useState } from 'react';
import { BarChart3, FileText, Clock, Type, Hash, Loader2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';

interface PdfStatsResult {
  pages: number;
  words: number;
  characters: number;
  charactersNoSpaces: number;
  avgWordsPerPage: number;
  readingTimeMin: number;
  fileSizeMB: string;
  pageSizes: string[];
}

export default function PdfStats() {
  usePageSEO('PDF Word Counter & Stats', 'Analyze PDF document stats — page count, word count, character count, reading time. Free online PDF analyzer.');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<PdfStatsResult | null>(null);

  const handleDrop = (files: File[]) => {
    if (files[0]) { setFile(files[0]); setStats(null); }
  };

  const analyze = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      let totalWords = 0;
      let totalChars = 0;
      let totalCharsNoSpaces = 0;
      const pageSizes: string[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        const wInch = (vp.width / 72).toFixed(1);
        const hInch = (vp.height / 72).toFixed(1);
        pageSizes.push(`${wInch}" × ${hInch}"`);
        const content = await page.getTextContent();
        const text = content.items.map((item: any) => item.str).join(' ');
        const words = text.split(/\s+/).filter(Boolean);
        totalWords += words.length;
        totalChars += text.length;
        totalCharsNoSpaces += text.replace(/\s/g, '').length;
      }

      setStats({
        pages: pdf.numPages,
        words: totalWords,
        characters: totalChars,
        charactersNoSpaces: totalCharsNoSpaces,
        avgWordsPerPage: Math.round(totalWords / pdf.numPages),
        readingTimeMin: Math.ceil(totalWords / 250),
        fileSizeMB: (file.size / 1024 / 1024).toFixed(2),
        pageSizes: [...new Set(pageSizes)],
      });
    } catch (e: any) {
      alert(e?.message || 'Analysis failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">PDF Word Counter & Stats</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400">Instantly analyze your PDF — word count, reading time, page sizes, and more.</p>
      </div>
      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : !stats ? (
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 text-center space-y-6">
          <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-slate-800 rounded-xl">
            <FileText className="w-8 h-8 text-indigo-500" />
            <div className="text-left flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white truncate">{file.name}</p>
              <p className="text-sm text-gray-500 dark:text-slate-400">{(file.size/1024/1024).toFixed(2)} MB</p>
            </div>
          </div>
          <button onClick={analyze} disabled={busy} className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <BarChart3 className="w-5 h-5" />}
            {busy ? 'Analyzing…' : 'Analyze PDF'}
          </button>
          <button onClick={() => { setFile(null); setStats(null); }} className="text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white text-sm font-medium">Cancel</button>
        </div>
      ) : (
        <div className="w-full max-w-3xl space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Pages', value: stats.pages, icon: FileText, color: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400' },
              { label: 'Words', value: stats.words.toLocaleString(), icon: Type, color: 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400' },
              { label: 'Characters', value: stats.characters.toLocaleString(), icon: Hash, color: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' },
              { label: 'Reading time', value: `~${stats.readingTimeMin} min`, icon: Clock, color: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400' },
            ].map(s => (
              <div key={s.label} className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 text-center">
                <div className={`w-10 h-10 mx-auto mb-3 rounded-xl ${s.color} flex items-center justify-center`}><s.icon className="w-5 h-5" /></div>
                <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{s.value}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-6 space-y-3">
            <h3 className="font-bold text-gray-900 dark:text-white">Details</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="text-gray-500 dark:text-slate-400">Chars (no spaces)</div><div className="font-semibold text-gray-900 dark:text-white">{stats.charactersNoSpaces.toLocaleString()}</div>
              <div className="text-gray-500 dark:text-slate-400">Avg words/page</div><div className="font-semibold text-gray-900 dark:text-white">{stats.avgWordsPerPage}</div>
              <div className="text-gray-500 dark:text-slate-400">File size</div><div className="font-semibold text-gray-900 dark:text-white">{stats.fileSizeMB} MB</div>
              <div className="text-gray-500 dark:text-slate-400">Page sizes</div><div className="font-semibold text-gray-900 dark:text-white">{stats.pageSizes.join(', ')}</div>
            </div>
          </div>
          <button onClick={() => { setFile(null); setStats(null); }} className="w-full py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700">Analyze another PDF</button>
        </div>
      )}
    </div>
  );
}
