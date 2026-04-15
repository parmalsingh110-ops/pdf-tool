import { useState } from 'react';
import { Palette, Copy, Check } from 'lucide-react';
import { usePageSEO } from '../lib/usePageSEO';

interface ColorInfo { hex: string; rgb: string; hsl: string; count: number; pct: string; }

function rgbToHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return `hsl(${Math.round(h*360)}, ${Math.round(s*100)}%, ${Math.round(l*100)}%)`;
}

export default function ColorExtractor() {
  usePageSEO('Color Palette Extractor', 'Extract dominant colors from images as HEX, RGB, and HSL values. Free online color palette generator from photos.');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [colors, setColors] = useState<ColorInfo[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);

    const img = new Image();
    img.src = url;
    await new Promise<void>(r => { img.onload = () => r(); });

    const canvas = document.createElement('canvas');
    const size = 100;
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;

    // Quantize colors
    const buckets = new Map<string, number>();
    for (let i = 0; i < data.length; i += 4) {
      const r = Math.round(data[i] / 16) * 16;
      const g = Math.round(data[i + 1] / 16) * 16;
      const b = Math.round(data[i + 2] / 16) * 16;
      const key = `${Math.min(r,255)},${Math.min(g,255)},${Math.min(b,255)}`;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }

    const totalPixels = size * size;
    const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    const result: ColorInfo[] = sorted.map(([key, count]) => {
      const [r, g, b] = key.split(',').map(Number);
      return {
        hex: rgbToHex(r, g, b),
        rgb: `rgb(${r}, ${g}, ${b})`,
        hsl: rgbToHsl(r, g, b),
        count,
        pct: ((count / totalPixels) * 100).toFixed(1),
      };
    });
    setColors(result);
    canvas.width = 0;
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Color Palette Extractor</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400">Extract dominant colors from images as HEX, RGB, and HSL.</p>
      </div>
      {!file ? (
        <label className="w-full max-w-3xl flex flex-col items-center justify-center h-72 border-4 border-dashed border-gray-300 dark:border-slate-700 rounded-2xl cursor-pointer bg-white dark:bg-slate-900 hover:border-pink-400 transition-colors">
          <Palette className="w-16 h-16 text-gray-400 dark:text-slate-500 mb-4" />
          <span className="text-xl font-bold text-gray-900 dark:text-white">Select Image</span>
          <span className="text-sm text-gray-500 dark:text-slate-400 mt-2">Extract dominant colors</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </label>
      ) : (
        <div className="w-full max-w-4xl space-y-6">
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-shrink-0 bg-gray-100 dark:bg-slate-800 rounded-2xl p-4 flex items-center justify-center">
              <img src={preview!} className="max-h-64 rounded-lg shadow-lg" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900 dark:text-white mb-3">Palette Preview</h3>
              <div className="flex rounded-xl overflow-hidden h-16 shadow-lg">
                {colors.map((c, i) => (
                  <div key={i} className="flex-1 cursor-pointer hover:scale-y-110 transition-transform" style={{ backgroundColor: c.hex }} title={`${c.hex} (${c.pct}%)`} onClick={() => copy(c.hex)} />
                ))}
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 dark:bg-slate-800 text-left"><th className="px-4 py-3 font-bold text-gray-700 dark:text-slate-300 w-16">Color</th><th className="px-4 py-3 font-bold text-gray-700 dark:text-slate-300">HEX</th><th className="px-4 py-3 font-bold text-gray-700 dark:text-slate-300">RGB</th><th className="px-4 py-3 font-bold text-gray-700 dark:text-slate-300">HSL</th><th className="px-4 py-3 font-bold text-gray-700 dark:text-slate-300 text-right">%</th></tr></thead>
              <tbody>
                {colors.map((c, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3"><div className="w-8 h-8 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700" style={{ backgroundColor: c.hex }} /></td>
                    <td className="px-4 py-3"><button onClick={() => copy(c.hex)} className="font-mono font-bold text-gray-900 dark:text-white hover:text-pink-600 flex items-center gap-1">{c.hex} {copied === c.hex ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-gray-400" />}</button></td>
                    <td className="px-4 py-3 font-mono text-gray-600 dark:text-slate-400 text-xs">{c.rgb}</td>
                    <td className="px-4 py-3 font-mono text-gray-600 dark:text-slate-400 text-xs">{c.hsl}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-500 dark:text-slate-400">{c.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => { setFile(null); setPreview(null); setColors([]); }} className="w-full py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold">Extract from another image</button>
        </div>
      )}
    </div>
  );
}
