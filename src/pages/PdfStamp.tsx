import { useState } from 'react';
import { Stamp, Download, Loader2 } from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';

const PRESETS = ['CONFIDENTIAL', 'DRAFT', 'APPROVED', 'COPY', 'FINAL', 'SAMPLE', 'VOID', 'URGENT'];

export default function PdfStamp() {
  usePageSEO('Add Stamp to PDF', 'Add CONFIDENTIAL, DRAFT, APPROVED stamps to PDF pages. Free online PDF stamp tool with date and color options.');
  const [file, setFile] = useState<File | null>(null);
  const [stampText, setStampText] = useState('DRAFT');
  const [stampColor, setStampColor] = useState('#dc2626');
  const [stampOpacity, setStampOpacity] = useState(0.2);
  const [stampSize, setStampSize] = useState(72);
  const [addDate, setAddDate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const handleDrop = (files: File[]) => {
    if (files[0]) { setFile(files[0]); setResultUrl(null); }
  };

  const hexToRgb = (hex: string) => {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r ? { r: parseInt(r[1], 16) / 255, g: parseInt(r[2], 16) / 255, b: parseInt(r[3], 16) / 255 } : { r: 0.86, g: 0.15, b: 0.15 };
  };

  const apply = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const doc = await PDFDocument.load(buf);
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      const { r, g, b } = hexToRgb(stampColor);
      const pages = doc.getPages();
      const dateStr = new Date().toLocaleDateString();

      for (const page of pages) {
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(stampText, stampSize);
        const x = (width - textWidth) / 2;
        const y = height / 2;
        page.drawText(stampText, {
          x, y, size: stampSize, font,
          color: rgb(r, g, b), opacity: stampOpacity,
          rotate: { type: 'degrees' as any, angle: -45 } as any,
        });
        if (addDate) {
          page.drawText(dateStr, {
            x: width - 150, y: 20, size: 10, font,
            color: rgb(r, g, b), opacity: stampOpacity * 1.5,
          });
        }
      }

      const bytes = await doc.save();
      setResultUrl(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
    } catch (e: any) { alert(e?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">PDF Stamp Tool</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400">Add CONFIDENTIAL, DRAFT, APPROVED stamps to every page.</p>
      </div>
      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : resultUrl ? (
        <div className="w-full max-w-2xl text-center space-y-6">
          <div className="p-8 bg-green-50 dark:bg-green-950/30 rounded-2xl border border-green-200 dark:border-green-800">
            <h3 className="text-2xl font-bold text-green-800 dark:text-green-300 mb-4">Stamp applied!</h3>
            <a href={resultUrl} download={`stamped_${file.name}`} className="inline-flex items-center gap-2 px-8 py-4 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700"><Download className="w-5 h-5" /> Download</a>
          </div>
          <button onClick={() => { setFile(null); setResultUrl(null); }} className="text-gray-500 dark:text-slate-400 font-medium">Stamp another</button>
        </div>
      ) : (
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Quick Presets</label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(p => (
                <button key={p} onClick={() => setStampText(p)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${stampText === p ? 'bg-red-600 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400'}`}>{p}</button>
              ))}
            </div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Custom Text</label><input type="text" value={stampText} onChange={e => setStampText(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Size: {stampSize}px</label><input type="range" min="24" max="144" value={stampSize} onChange={e => setStampSize(+e.target.value)} className="w-full accent-red-600" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Opacity: {Math.round(stampOpacity*100)}%</label><input type="range" min="0.05" max="0.8" step="0.05" value={stampOpacity} onChange={e => setStampOpacity(+e.target.value)} className="w-full accent-red-600" /></div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2"><label className="text-sm font-medium text-gray-700 dark:text-slate-300">Color</label><input type="color" value={stampColor} onChange={e => setStampColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer" /></div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-slate-300 cursor-pointer"><input type="checkbox" checked={addDate} onChange={e => setAddDate(e.target.checked)} className="accent-red-600 w-4 h-4" /> Add date stamp</label>
          </div>
          <div className="flex gap-4">
            <button onClick={apply} disabled={busy || !stampText} className="flex-1 py-4 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Stamp className="w-5 h-5" />} {busy ? 'Stamping…' : 'Apply Stamp'}
            </button>
            <button onClick={() => setFile(null)} className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-semibold rounded-xl">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
