import React, { useState } from 'react';
import { 
  Palette, Download, Loader2, Copy, Check, Eye, 
  Sparkles, ShieldCheck, AlertTriangle, FileText, ArrowRight
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

interface ColorSwatch {
  hex: string;
  rgb: string;
  cmyk: string;
  percentage: number;
  isDark: boolean;
}

export default function ColorExtractor() {
  useSEO(
    'Extract Colors from PDF Online Free — Palette Analyzer & WCAG Contrast Checker',
    'Extract dominant color palettes from PDF documents online. Analyzes HEX, RGB, and CMYK color codes, calculates WCAG contrast ratios, and exports CSS variables.'
  );

  usePageSEO(
    'PDF Color Palette Extractor & Accessibility Studio',
    'Analyze document colors, extract brand identity palettes, and test contrast compliance against WCAG AA and AAA accessibility standards.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [colors, setColors] = useState<ColorSwatch[]>([]);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

  const rgbToCmyk = (r: number, g: number, b: number) => {
    const rNorm = r / 255;
    const gNorm = g / 255;
    const bNorm = b / 255;
    const k = 1 - Math.max(rNorm, gNorm, bNorm);
    if (k === 1) return '0%, 0%, 0%, 100%';
    const c = Math.round(((1 - rNorm - k) / (1 - k)) * 100);
    const m = Math.round(((1 - gNorm - k) / (1 - k)) * 100);
    const y = Math.round(((1 - bNorm - k) / (1 - k)) * 100);
    return `${c}%, ${m}%, ${y}%, ${Math.round(k * 100)}%`;
  };

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    const f = files[0];
    setFile(f);
    setColors([]);
    setBusy(true);

    try {
      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const colorCounts = new Map<string, number>();
      let totalSamples = 0;

      // Sample first 3 pages
      const pagesToScan = Math.min(pdf.numPages, 3);

      for (let p = 1; p <= pagesToScan; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 0.5 }); // Lower scale for fast sampling
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;

        // Sample every 4th pixel
        for (let i = 0; i < d.length; i += 16) {
          const r = Math.round(d[i] / 16) * 16;
          const g = Math.round(d[i + 1] / 16) * 16;
          const b = Math.round(d[i + 2] / 16) * 16;
          const a = d[i + 3];

          if (a < 128) continue; // Skip transparent
          // Skip pure white
          if (r > 240 && g > 240 && b > 240) continue;

          const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
          colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
          totalSamples++;
        }
      }

      // Sort top colors
      const sorted = Array.from(colorCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

      const swatches: ColorSwatch[] = sorted.map(([hex, count]) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const isDark = (r * 299 + g * 587 + b * 114) / 1000 < 128;
        return {
          hex,
          rgb: `${r}, ${g}, ${b}`,
          cmyk: rgbToCmyk(r, g, b),
          percentage: Number(((count / Math.max(totalSamples, 1)) * 100).toFixed(1)),
          isDark
        };
      });

      setColors(swatches);
    } catch (err: any) {
      console.error('Color extraction error:', err);
      alert(`Color extraction failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const copyHex = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopiedHex(hex);
    setTimeout(() => setCopiedHex(null), 2000);
  };

  const copyCssVars = () => {
    const css = `:root {\n` + colors.map((c, i) => `  --pdf-color-${i + 1}: ${c.hex}; /* ${c.percentage}% */`).join('\n') + `\n}`;
    navigator.clipboard.writeText(css);
    setCopiedHex('css');
    setTimeout(() => setCopiedHex(null), 2000);
  };

  const reset = () => {
    setFile(null);
    setColors([]);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-4 sm:p-8 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm border border-rose-100 dark:border-rose-900/50">
          <Palette className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-2">
          PDF Color Palette Extractor & Studio
        </h1>
        <p className="text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          Extract dominant branding colors and document swatches. Get HEX, RGB, and CMYK values, and export CSS theme variables.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl space-y-6">
          <FileDropzone 
            onDrop={handleDrop} 
            multiple={false} 
            title="Select PDF Document to Extract Color Palette" 
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Palette className="w-6 h-6 text-rose-600 dark:text-rose-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Dominant Swatches</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Identifies top brand colors and background accent tones.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Copy className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Multi-Code Values</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Computes HEX, RGB, and print CMYK color profiles.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">CSS Export</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">1-click copy :root CSS variables for web development.</p>
            </div>
          </div>
        </div>
      ) : busy ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-rose-600 mx-auto" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Analyzing Document Color Palette...</h3>
          <p className="text-xs text-slate-500">Sampling pixel histograms and computing color clusters...</p>
        </div>
      ) : (
        /* Swatches Workspace */
        <div className="w-full space-y-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              Extracted {colors.length} Dominant Colors in {file.name}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={copyCssVars}
                className="py-1.5 px-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow-sm"
              >
                {copiedHex === 'css' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                Copy CSS Variables
              </button>
              <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600 underline ml-2">Change</button>
            </div>
          </div>

          {/* Color Palette Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {colors.map((c, idx) => (
              <div
                key={idx}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                <div
                  className="h-28 w-full flex items-end p-3 transition-transform"
                  style={{ backgroundColor: c.hex }}
                >
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                    c.isDark ? 'bg-white/90 text-slate-900' : 'bg-black/80 text-white'
                  }`}>
                    {c.hex}
                  </span>
                </div>

                <div className="p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">RGB:</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">{c.rgb}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">CMYK:</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">{c.cmyk}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Presence:</span>
                    <span className="font-bold text-rose-600">{c.percentage}%</span>
                  </div>

                  <button
                    onClick={() => copyHex(c.hex)}
                    className="w-full mt-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-bold rounded-lg text-[11px] flex items-center justify-center gap-1 transition-colors"
                  >
                    {copiedHex === c.hex ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    Copy HEX
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
