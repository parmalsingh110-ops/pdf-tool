import { useState, useRef } from 'react';
import { RefreshCw, Download, Loader2, Trash2 } from 'lucide-react';
import { usePageSEO } from '../lib/usePageSEO';

type OutputFormat = 'image/jpeg' | 'image/png' | 'image/webp';
const FORMATS: { label: string; value: OutputFormat; ext: string }[] = [
  { label: 'JPEG', value: 'image/jpeg', ext: '.jpg' },
  { label: 'PNG', value: 'image/png', ext: '.png' },
  { label: 'WebP', value: 'image/webp', ext: '.webp' },
];

export default function ImageConverter() {
  usePageSEO('Image Format Converter', 'Convert images between JPG, PNG, and WebP formats. Free online batch image converter with quality control.');
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<OutputFormat>('image/png');
  const [quality, setQuality] = useState(0.9);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ name: string; url: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setResults([]);
    }
  };

  const convert = async () => {
    if (files.length === 0) return;
    setBusy(true);
    try {
      const output: { name: string; url: string }[] = [];
      const ext = FORMATS.find(f => f.value === format)!.ext;
      for (const file of files) {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(img.src);
        const blob = await new Promise<Blob | null>(r => canvas.toBlob(b => r(b), format, quality));
        if (blob) {
          const baseName = file.name.replace(/\.[^/.]+$/, '');
          output.push({ name: `${baseName}${ext}`, url: URL.createObjectURL(blob) });
        }
        canvas.width = 0; canvas.height = 0;
      }
      setResults(output);
    } catch (e: any) { alert(e?.message || 'Conversion failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Image Format Converter</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400">Convert images between JPG, PNG, and WebP with quality control.</p>
      </div>
      {files.length === 0 ? (
        <div className="w-full max-w-3xl">
          <label className="flex flex-col items-center justify-center w-full h-72 border-4 border-dashed border-gray-300 dark:border-slate-700 rounded-2xl cursor-pointer bg-white dark:bg-slate-900 hover:border-rose-400 dark:hover:border-rose-600 transition-colors">
            <RefreshCw className="w-16 h-16 text-gray-400 dark:text-slate-500 mb-4" />
            <span className="text-xl font-bold text-gray-900 dark:text-white">Select Images</span>
            <span className="text-sm text-gray-500 dark:text-slate-400 mt-2">JPG, PNG, WebP, BMP — batch supported</span>
            <input ref={inputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleFiles} />
          </label>
        </div>
      ) : results.length > 0 ? (
        <div className="w-full max-w-3xl space-y-4">
          <div className="p-6 bg-green-50 dark:bg-green-950/30 rounded-2xl border border-green-200 dark:border-green-800 text-center">
            <h3 className="text-xl font-bold text-green-800 dark:text-green-300 mb-4">Converted {results.length} image(s)!</h3>
            <div className="space-y-2">
              {results.map((r, i) => (
                <a key={i} href={r.url} download={r.name} className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 text-sm">
                  <Download className="w-4 h-4" /> {r.name}
                </a>
              ))}
            </div>
          </div>
          <button onClick={() => { setFiles([]); setResults([]); }} className="w-full py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold">Convert more images</button>
        </div>
      ) : (
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 space-y-6">
          <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">{files.length} image(s) selected</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Output Format</label>
            <div className="flex gap-3">
              {FORMATS.map(f => (
                <button key={f.value} onClick={() => setFormat(f.value)} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${format === f.value ? 'bg-rose-600 text-white shadow' : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {format !== 'image/png' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Quality: {Math.round(quality * 100)}%</label>
              <input type="range" min="0.1" max="1" step="0.05" value={quality} onChange={e => setQuality(parseFloat(e.target.value))} className="w-full accent-rose-600" />
            </div>
          )}
          <div className="flex gap-4">
            <button onClick={convert} disabled={busy} className="flex-1 py-4 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />} {busy ? 'Converting…' : 'Convert All'}
            </button>
            <button onClick={() => setFiles([])} className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-semibold rounded-xl">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
