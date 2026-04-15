import { useState } from 'react';
import { BookOpen, Download, Loader2 } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';

export default function Booklet() {
  usePageSEO('PDF to Booklet Converter', 'Convert PDF to booklet layout for saddle-stitch printing. Free online PDF booklet maker.');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    setFile(files[0]); setResultUrl(null);
    try {
      const buf = await files[0].arrayBuffer();
      const pdf = await PDFDocument.load(buf);
      setPageCount(pdf.getPageCount());
    } catch { /* ignore */ }
  };

  const createBooklet = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const src = await PDFDocument.load(buf);
      const total = src.getPageCount();

      // Pad to multiple of 4
      const padded = Math.ceil(total / 4) * 4;
      const pageIndices: number[] = [];
      for (let i = 0; i < padded; i++) {
        pageIndices.push(i < total ? i : -1);
      }

      // Booklet imposition order
      const sheets: [number, number, number, number][] = [];
      let lo = 0, hi = padded - 1;
      while (lo < hi) {
        sheets.push([hi, lo, lo + 1, hi - 1]);
        lo += 2; hi -= 2;
      }

      const booklet = await PDFDocument.create();
      const firstPage = src.getPages()[0];
      const { width: pw, height: ph } = firstPage.getSize();
      const sheetW = pw * 2;
      const sheetH = ph;

      for (const [frontL, frontR, backL, backR] of sheets) {
        // Front side (two-up)
        const fPage = booklet.addPage([sheetW, sheetH]);
        for (const [slot, idx] of [[0, frontL], [1, frontR]] as [number, number][]) {
          if (idx >= 0 && idx < total) {
            const [copied] = await booklet.copyPages(src, [idx]);
            const embed = await booklet.embedPage(copied);
            fPage.drawPage(embed, { x: slot * pw, y: 0, width: pw, height: ph });
          }
        }

        // Back side
        const bPage = booklet.addPage([sheetW, sheetH]);
        for (const [slot, idx] of [[0, backL], [1, backR]] as [number, number][]) {
          if (idx >= 0 && idx < total) {
            const [copied] = await booklet.copyPages(src, [idx]);
            const embed = await booklet.embedPage(copied);
            bPage.drawPage(embed, { x: slot * pw, y: 0, width: pw, height: ph });
          }
        }
      }

      const bytes = await booklet.save();
      setResultUrl(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
    } catch (e: any) { alert(e?.message || 'Booklet creation failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">PDF to Booklet</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400">Rearrange pages for saddle-stitch booklet printing (2-up imposition).</p>
      </div>
      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : resultUrl ? (
        <div className="w-full max-w-2xl text-center space-y-6">
          <div className="p-8 bg-green-50 dark:bg-green-950/30 rounded-2xl border border-green-200 dark:border-green-800">
            <h3 className="text-2xl font-bold text-green-800 dark:text-green-300 mb-4">Booklet ready!</h3>
            <p className="text-sm text-green-700 dark:text-green-400 mb-4">Print double-sided, flip on short edge, then fold and staple.</p>
            <a href={resultUrl} download={`booklet_${file.name}`} className="inline-flex items-center gap-2 px-8 py-4 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700"><Download className="w-5 h-5" /> Download Booklet</a>
          </div>
          <button onClick={() => { setFile(null); setResultUrl(null); }} className="text-gray-500 dark:text-slate-400 font-medium">Make another booklet</button>
        </div>
      ) : (
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 space-y-6">
          <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-slate-800 rounded-xl">
            <BookOpen className="w-8 h-8 text-violet-500" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white truncate">{file.name}</p>
              <p className="text-sm text-gray-500 dark:text-slate-400">{pageCount} pages → {Math.ceil(pageCount / 4) * 2} sheets (double-sided)</p>
            </div>
          </div>
          <div className="p-4 bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-xl text-sm text-violet-800 dark:text-violet-300">
            <strong>How it works:</strong> Pages are rearranged so when you print double-sided and fold in half, they appear in the correct reading order. Perfect for zines, pamphlets, and booklets.
          </div>
          <div className="flex gap-4">
            <button onClick={createBooklet} disabled={busy} className="flex-1 py-4 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <BookOpen className="w-5 h-5" />}
              {busy ? 'Creating…' : 'Create Booklet'}
            </button>
            <button onClick={() => setFile(null)} className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
