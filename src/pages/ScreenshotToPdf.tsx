import { useState } from 'react';
import { MonitorSmartphone, Download, Loader2, Trash2, Plus } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { usePageSEO } from '../lib/usePageSEO';

export default function ScreenshotToPdf() {
  usePageSEO('Screenshot to PDF Converter', 'Convert screenshots to clean PDF reports. Free online screenshot to PDF tool with background cleaning.');
  const [files, setFiles] = useState<{file: File; url: string}[]>([]);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [cleanBg, setCleanBg] = useState(true);

  const addFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files).map(f => ({ file: f, url: URL.createObjectURL(f) }));
    setFiles(prev => [...prev, ...newFiles]);
    setResultUrl(null);
  };

  const removeFile = (idx: number) => {
    setFiles(prev => { URL.revokeObjectURL(prev[idx].url); return prev.filter((_,i)=>i!==idx); });
  };

  const convert = async () => {
    if (files.length === 0) return;
    setBusy(true);
    try {
      const doc = await PDFDocument.create();
      for (const { file } of files) {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await new Promise<void>((res) => { img.onload = () => res(); });

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;

        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        if (cleanBg) {
          // Clean near-white pixels to pure white
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i] > 245 && d[i+1] > 245 && d[i+2] > 245) {
              d[i] = d[i+1] = d[i+2] = 255;
            }
          }
          ctx.putImageData(imgData, 0, 0);
        }

        URL.revokeObjectURL(img.src);
        const blob = await new Promise<Blob|null>(r => canvas.toBlob(b=>r(b),'image/jpeg',0.92));
        if (!blob) continue;
        const imgBytes = await blob.arrayBuffer();
        const pdfImg = await doc.embedJpg(imgBytes);

        // A4 page proportions
        const pageW = 595.28;
        const pageH = 841.89;
        const page = doc.addPage([pageW, pageH]);
        const margin = 40;
        const maxW = pageW - margin * 2;
        const maxH = pageH - margin * 2;
        const scale = Math.min(maxW / pdfImg.width, maxH / pdfImg.height, 1);
        const drawW = pdfImg.width * scale;
        const drawH = pdfImg.height * scale;
        const x = (pageW - drawW) / 2;
        const y = pageH - margin - drawH;
        page.drawImage(pdfImg, { x, y, width: drawW, height: drawH });
        canvas.width = 0; canvas.height = 0;
      }
      const bytes = await doc.save();
      setResultUrl(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
    } catch (e: any) { alert(e?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Screenshot to Clean PDF</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400">Upload screenshots, clean backgrounds, and combine into a polished PDF report.</p>
      </div>
      {files.length === 0 ? (
        <label className="w-full max-w-3xl flex flex-col items-center justify-center h-72 border-4 border-dashed border-gray-300 dark:border-slate-700 rounded-2xl cursor-pointer bg-white dark:bg-slate-900 hover:border-teal-400 transition-colors">
          <MonitorSmartphone className="w-16 h-16 text-gray-400 dark:text-slate-500 mb-4" />
          <span className="text-xl font-bold text-gray-900 dark:text-white">Select Screenshots</span>
          <span className="text-sm text-gray-500 dark:text-slate-400 mt-2">Multiple images supported</span>
          <input type="file" multiple accept="image/*" className="hidden" onChange={addFiles} />
        </label>
      ) : resultUrl ? (
        <div className="w-full max-w-2xl text-center space-y-6">
          <div className="p-8 bg-green-50 dark:bg-green-950/30 rounded-2xl border border-green-200 dark:border-green-800">
            <h3 className="text-2xl font-bold text-green-800 dark:text-green-300 mb-4">PDF Report Ready!</h3>
            <a href={resultUrl} download="screenshots_report.pdf" className="inline-flex items-center gap-2 px-8 py-4 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700"><Download className="w-5 h-5" /> Download PDF</a>
          </div>
          <button onClick={() => { setFiles([]); setResultUrl(null); }} className="text-gray-500 dark:text-slate-400 font-medium">Convert more</button>
        </div>
      ) : (
        <div className="w-full max-w-4xl space-y-6">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {files.map((f, i) => (
              <div key={i} className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700 group">
                <img src={f.url} className="w-full aspect-[4/3] object-cover" />
                <button onClick={() => removeFile(i)} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
            <label className="flex flex-col items-center justify-center aspect-[4/3] border-2 border-dashed border-gray-300 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800"><Plus className="w-6 h-6 text-gray-400" /><input type="file" multiple accept="image/*" className="hidden" onChange={addFiles} /></label>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-slate-300 cursor-pointer">
              <input type="checkbox" checked={cleanBg} onChange={e => setCleanBg(e.target.checked)} className="accent-teal-600 w-4 h-4" /> Clean near-white backgrounds
            </label>
          </div>
          <div className="flex gap-4">
            <button onClick={convert} disabled={busy} className="flex-1 py-4 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <MonitorSmartphone className="w-5 h-5" />} {busy ? 'Converting…' : `Convert ${files.length} to PDF`}
            </button>
            <button onClick={() => setFiles([])} className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-semibold rounded-xl">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
