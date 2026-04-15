import { useState, useRef } from 'react';
import { Droplet, Download, Loader2 } from 'lucide-react';
import { usePageSEO } from '../lib/usePageSEO';

type WatermarkPos = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'tile';

export default function ImageWatermark() {
  usePageSEO('Add Watermark to Image', 'Add text watermarks to images with position, opacity, tiling, and rotation controls. Free online image watermark tool.');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState('CONFIDENTIAL');
  const [fontSize, setFontSize] = useState(48);
  const [opacity, setOpacity] = useState(0.25);
  const [color, setColor] = useState('#000000');
  const [position, setPosition] = useState<WatermarkPos>('center');
  const [rotation, setRotation] = useState(-30);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setPreview(URL.createObjectURL(f)); setResultUrl(null); }
  };

  const apply = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const img = new Image();
      img.src = preview!;
      await new Promise<void>((res) => { img.onload = () => res(); });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      ctx.globalAlpha = opacity;
      ctx.fillStyle = color;
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (position === 'tile') {
        const stepX = fontSize * 8;
        const stepY = fontSize * 4;
        for (let x = -canvas.width; x < canvas.width * 2; x += stepX) {
          for (let y = -canvas.height; y < canvas.height * 2; y += stepY) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate((rotation * Math.PI) / 180);
            ctx.fillText(text, 0, 0);
            ctx.restore();
          }
        }
      } else {
        let x = canvas.width / 2, y = canvas.height / 2;
        if (position === 'top-left') { x = fontSize * 3; y = fontSize * 2; }
        else if (position === 'top-right') { x = canvas.width - fontSize * 3; y = fontSize * 2; }
        else if (position === 'bottom-left') { x = fontSize * 3; y = canvas.height - fontSize * 2; }
        else if (position === 'bottom-right') { x = canvas.width - fontSize * 3; y = canvas.height - fontSize * 2; }
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }

      ctx.globalAlpha = 1;
      const blob = await new Promise<Blob | null>(r => canvas.toBlob(b => r(b), 'image/jpeg', 0.92));
      if (blob) setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) { alert(e?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  const positions: { label: string; value: WatermarkPos }[] = [
    { label: 'Center', value: 'center' }, { label: 'Tile', value: 'tile' },
    { label: '↖ Top Left', value: 'top-left' }, { label: '↗ Top Right', value: 'top-right' },
    { label: '↙ Bottom Left', value: 'bottom-left' }, { label: '↘ Bottom Right', value: 'bottom-right' },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Image Watermark</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400">Add text watermarks with position, opacity, color, and tiling.</p>
      </div>
      {!file ? (
        <label className="w-full max-w-3xl flex flex-col items-center justify-center h-72 border-4 border-dashed border-gray-300 dark:border-slate-700 rounded-2xl cursor-pointer bg-white dark:bg-slate-900 hover:border-cyan-400 dark:hover:border-cyan-600 transition-colors">
          <Droplet className="w-16 h-16 text-gray-400 dark:text-slate-500 mb-4" />
          <span className="text-xl font-bold text-gray-900 dark:text-white">Select Image</span>
          <span className="text-sm text-gray-500 dark:text-slate-400 mt-2">JPG, PNG, WebP</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </label>
      ) : resultUrl ? (
        <div className="w-full max-w-3xl text-center space-y-6">
          <div className="bg-gray-100 dark:bg-slate-800 rounded-2xl p-4"><img src={resultUrl} className="max-h-[50vh] mx-auto rounded-lg shadow-lg" /></div>
          <div className="flex gap-3 justify-center">
            <a href={resultUrl} download={`watermarked_${file.name}`} className="px-6 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 flex items-center gap-2"><Download className="w-5 h-5" /> Download</a>
            <button onClick={() => setResultUrl(null)} className="px-6 py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold">Edit again</button>
          </div>
          <button onClick={() => { setFile(null); setPreview(null); setResultUrl(null); }} className="text-gray-500 dark:text-slate-400 font-medium text-sm">Watermark another image</button>
        </div>
      ) : (
        <div className="w-full max-w-4xl flex flex-col lg:flex-row gap-6">
          <div className="flex-1 bg-gray-100 dark:bg-slate-800 rounded-2xl p-4 flex items-center justify-center min-h-[400px]">
            <img src={preview!} className="max-h-[50vh] rounded-lg shadow-lg" />
          </div>
          <div className="w-full lg:w-80 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-6 space-y-5">
            <div><label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Watermark Text</label><input type="text" value={text} onChange={e => setText(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Font Size: {fontSize}px</label><input type="range" min="16" max="120" value={fontSize} onChange={e => setFontSize(+e.target.value)} className="w-full accent-cyan-600" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Opacity: {Math.round(opacity*100)}%</label><input type="range" min="0.05" max="1" step="0.05" value={opacity} onChange={e => setOpacity(+e.target.value)} className="w-full accent-cyan-600" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Rotation: {rotation}°</label><input type="range" min="-90" max="90" value={rotation} onChange={e => setRotation(+e.target.value)} className="w-full accent-cyan-600" /></div>
            <div className="flex items-center gap-3"><label className="text-sm font-medium text-gray-700 dark:text-slate-300">Color</label><input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Position</label>
              <div className="grid grid-cols-3 gap-2">{positions.map(p => (<button key={p.value} onClick={() => setPosition(p.value)} className={`py-2 rounded-lg text-xs font-bold transition-all ${position === p.value ? 'bg-cyan-600 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-200'}`}>{p.label}</button>))}</div>
            </div>
            <button onClick={apply} disabled={busy || !text} className="w-full py-3 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Droplet className="w-5 h-5" />} {busy ? 'Applying…' : 'Apply Watermark'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
