import { useState } from 'react';
import { Images, Download, Loader2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';

export default function PdfToImages() {
  usePageSEO('PDF to Images Batch Export', 'Export all PDF pages as JPG or PNG images in a ZIP file. Free online PDF to images converter.');
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<'jpeg' | 'png'>('jpeg');
  const [scale, setScale] = useState(2);
  const [quality, setQuality] = useState(0.92);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [imageCount, setImageCount] = useState(0);

  const handleDrop = (files: File[]) => {
    if (files[0]) { setFile(files[0]); setResultUrl(null); }
  };

  const convert = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const zip = new JSZip();
      const ext = format === 'jpeg' ? 'jpg' : 'png';
      const mime = `image/${format}`;

      for (let i = 1; i <= pdf.numPages; i++) {
        setProgress(`Rendering page ${i} of ${pdf.numPages}…`);
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        if (format === 'jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
        const blob = await new Promise<Blob | null>(r => canvas.toBlob(b => r(b), mime, quality));
        if (blob) {
          const arrBuf = await blob.arrayBuffer();
          zip.file(`page_${String(i).padStart(3, '0')}.${ext}`, arrBuf);
        }
        canvas.width = 0; canvas.height = 0;
        page.cleanup();
        await new Promise(r => setTimeout(r, 10));
      }

      setProgress('Creating ZIP…');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      setResultUrl(URL.createObjectURL(zipBlob));
      setImageCount(pdf.numPages);
    } catch (e: any) { alert(e?.message || 'Failed'); }
    finally { setBusy(false); setProgress(''); }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">PDF to Images (Batch ZIP)</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400">Export all pages as individual JPG/PNG images in a downloadable ZIP.</p>
      </div>
      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : resultUrl ? (
        <div className="w-full max-w-2xl text-center space-y-6">
          <div className="p-8 bg-green-50 dark:bg-green-950/30 rounded-2xl border border-green-200 dark:border-green-800">
            <h3 className="text-2xl font-bold text-green-800 dark:text-green-300 mb-2">{imageCount} images exported!</h3>
            <a href={resultUrl} download={`${file.name.replace('.pdf','')}_images.zip`} className="inline-flex items-center gap-2 px-8 py-4 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 mt-3"><Download className="w-5 h-5" /> Download ZIP</a>
          </div>
          <button onClick={() => { setFile(null); setResultUrl(null); }} className="text-gray-500 dark:text-slate-400 font-medium">Convert another</button>
        </div>
      ) : (
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 space-y-6">
          <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-slate-800 rounded-xl">
            <Images className="w-8 h-8 text-blue-500" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white truncate">{file.name}</p>
              <p className="text-sm text-gray-500 dark:text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Format</label>
            <div className="flex gap-3">
              {(['jpeg', 'png'] as const).map(f => (
                <button key={f} onClick={() => setFormat(f)} className={`flex-1 py-3 rounded-xl font-bold text-sm ${format === f ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300'}`}>{f.toUpperCase()}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Resolution: {scale}x</label><input type="range" min="1" max="4" step="0.5" value={scale} onChange={e => setScale(+e.target.value)} className="w-full accent-blue-600" /></div>
            {format === 'jpeg' && <div><label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Quality: {Math.round(quality*100)}%</label><input type="range" min="0.3" max="1" step="0.05" value={quality} onChange={e => setQuality(+e.target.value)} className="w-full accent-blue-600" /></div>}
          </div>
          <div className="flex gap-4">
            <button onClick={convert} disabled={busy} className="flex-1 py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Images className="w-5 h-5" />} {busy ? progress || 'Converting…' : 'Export All Pages'}
            </button>
            <button onClick={() => setFile(null)} className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-semibold rounded-xl">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
