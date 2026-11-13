import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Palette, Loader2, Copy, Check, ShieldCheck } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

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

  const prefersReduced = useReducedMotion();

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

      const pagesToScan = Math.min(pdf.numPages, 3);

      for (let p = 1; p <= pagesToScan; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 0.5 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;

        for (let i = 0; i < d.length; i += 16) {
          const r = Math.round(d[i] / 16) * 16;
          const g = Math.round(d[i + 1] / 16) * 16;
          const b = Math.round(d[i + 2] / 16) * 16;
          const a = d[i + 3];

          if (a < 128) continue;
          if (r > 240 && g > 240 && b > 240) continue;

          const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
          colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
          totalSamples++;
        }
      }

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
          isDark,
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
    <ToolWorkspaceShell
      title="PDF Color Palette Extractor & Studio"
      subtitle="Extract dominant branding colors and document swatches. Get HEX, RGB, and CMYK values, and export CSS theme variables."
      categoryLabel="Brand Palette & Color Science"
      icon={Palette}
      microVariant="edit"
      tone="rose"
      trustNote="100% browser-only pixel histogram sampling · Instant CSS tokens"
    >
      {!file ? (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-2xl mx-auto space-y-6"
        >
          <FileDropzone
            onDrop={handleDrop}
            multiple={false}
            title="Select PDF Document to Extract Color Palette"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {[
              {
                icon: Palette,
                tint: 'bg-[var(--pms-soft-rose)] text-[var(--pms-rose)]',
                title: 'Dominant Swatches',
                desc: 'Identifies top brand colors and background accent tones.',
              },
              {
                icon: Copy,
                tint: 'bg-[var(--pms-soft-blue)] text-[var(--pms-blue)]',
                title: 'Multi-Code Values',
                desc: 'Computes HEX, RGB, and print CMYK color profiles.',
              },
              {
                icon: ShieldCheck,
                tint: 'bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300',
                title: 'CSS Export',
                desc: '1-click copy :root CSS variables for web development.',
              },
            ].map((card, idx) => (
              <motion.div
                key={card.title}
                initial={prefersReduced ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: idx * 0.06 }}
                whileHover={prefersReduced ? undefined : { y: -3 }}
                className="pms-glass-panel p-5 rounded-2xl text-center"
              >
                <div className={`w-10 h-10 rounded-xl ${card.tint} flex items-center justify-center mx-auto mb-2.5`}>
                  <card.icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">{card.title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{card.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      ) : busy ? (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="relative max-w-lg mx-auto pms-glass-panel rounded-3xl p-12 text-center space-y-4 overflow-hidden"
        >
          <PearlScanOverlay active={busy} label="Sampling pixel histograms & computing color clusters…" />
          <div className="w-14 h-14 rounded-2xl bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] flex items-center justify-center mx-auto">
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
          <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">Analyzing Document Color Palette…</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Sampling pixel histograms and computing color clusters for <span className="font-semibold">{file.name}</span>.
          </p>
        </motion.div>
      ) : (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="w-full space-y-5"
        >
          <div className="pms-glass-panel p-4 sm:p-5 rounded-2xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="px-3 py-1 rounded-full bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] text-xs font-extrabold border border-[var(--pms-border)]">
                <AnimatedNumber value={colors.length} /> Dominant Colors
              </span>
              <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                {file.name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <motion.button
                whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                onClick={copyCssVars}
                disabled={colors.length === 0}
                className="pms-btn-primary py-2 px-4 font-bold rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
              >
                {copiedHex === 'css' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedHex === 'css' ? 'Copied CSS Variables' : 'Copy CSS Variables'}
              </motion.button>
              <button
                onClick={reset}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                Change File
              </button>
            </div>
          </div>

          <AnimatePresence initial={false}>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {colors.map((c, idx) => (
                <motion.div
                  key={c.hex}
                  initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, delay: idx * 0.04 }}
                  whileHover={prefersReduced ? undefined : { y: -3 }}
                  className="pms-glass-panel rounded-3xl overflow-hidden"
                >
                  <div
                    className="h-28 w-full flex items-end p-3"
                    style={{ backgroundColor: c.hex }}
                  >
                    <span
                      className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-lg shadow-xs ${
                        c.isDark ? 'bg-white/95 text-slate-900' : 'bg-slate-950/85 text-white'
                      }`}
                    >
                      {c.hex}
                    </span>
                  </div>

                  <div className="p-4 bg-white/75 dark:bg-slate-900/75 border-t border-[var(--pms-border)] space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 dark:text-slate-400">RGB</span>
                      <span className="font-mono text-slate-800 dark:text-slate-100">{c.rgb}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 dark:text-slate-400">CMYK</span>
                      <span className="font-mono text-slate-800 dark:text-slate-100 text-[11px]">{c.cmyk}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 dark:text-slate-400">Presence</span>
                      <span className="font-extrabold text-[var(--pms-rose)]">
                        <AnimatedNumber value={c.percentage} decimals={1} suffix="%" />
                      </span>
                    </div>

                    <button
                      onClick={() => copyHex(c.hex)}
                      className="w-full mt-1.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-[var(--pms-border)] text-slate-700 dark:text-slate-200 font-bold rounded-xl text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {copiedHex === c.hex ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedHex === c.hex ? 'Copied!' : 'Copy HEX'}
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        </motion.div>
      )}
    </ToolWorkspaceShell>
  );
}
