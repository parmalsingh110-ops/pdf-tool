import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Highlighter,
  Download,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Check,
  Sliders,
  Palette,
  Eye,
  FileText,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

interface HighlightMatch {
  pageIndex: number;
  word: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function HighlightText() {
  useSEO(
    'Highlight Text in PDF Online Free — Neon Multi-Color Highlighter',
    'Highlight words, phrases, or search terms in PDF documents online. Real-time visual page preview, multiple neon colors, and instant high-res compilation.'
  );

  usePageSEO(
    'PDF Text Highlighter Studio — Multi-Color Neon Highlighter',
    'Highlight keywords in your PDF with live interactive page preview. Choose neon yellow, green, pink, cyan, or orange with custom opacity.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [keywords, setKeywords] = useState('');
  const [colorHex, setColorHex] = useState('#fef08a'); // Neon Yellow
  const [opacity, setOpacity] = useState(0.5);

  const [pageImages, setPageImages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [matches, setMatches] = useState<HighlightMatch[]>([]);

  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFileName, setResultFileName] = useState('');

  useAutoRevokeUrl(resultUrl);
  const prefersReduced = useReducedMotion();

  const colors = [
    { hex: '#fef08a', label: 'Neon Yellow', border: '#eab308' },
    { hex: '#bbf7d0', label: 'Mint Green', border: '#22c55e' },
    { hex: '#fbcfe8', label: 'Pastel Pink', border: '#ec4899' },
    { hex: '#bae6fd', label: 'Cyan Sky', border: '#0ea5e9' },
    { hex: '#fed7aa', label: 'Peach Orange', border: '#f97316' },
  ];

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    const f = files[0];
    setFile(f);
    setResultUrl(null);
    setMatches([]);
    setCurrentPage(0);

    try {
      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const imgs: string[] = [];

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
        imgs.push(canvas.toDataURL('image/jpeg', 0.88));
      }

      setPageImages(imgs);
    } catch (err) {
      console.error('Failed to load PDF:', err);
    }
  };

  // Find matches across document
  useEffect(() => {
    if (!file || !keywords.trim() || !pageImages.length) {
      setMatches([]);
      return;
    }

    const findMatches = async () => {
      try {
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        const terms = keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
        const found: HighlightMatch[] = [];

        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const vp = page.getViewport({ scale: 1.5 });
          const textContent = await page.getTextContent();

          for (const item of textContent.items as any[]) {
            const rawStr = (item.str || '').toLowerCase();
            const matchedTerm = terms.find(t => rawStr.includes(t));

            if (matchedTerm) {
              const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
              const xRel = (tx[4] / vp.width) * 100;
              const yRel = ((tx[5] - item.height * vp.scale) / vp.height) * 100;
              const wRel = ((item.width * vp.scale) / vp.width) * 100;
              const hRel = ((item.height * vp.scale * 1.25) / vp.height) * 100;

              found.push({
                pageIndex: p - 1,
                word: matchedTerm,
                x: Math.max(xRel - 0.2, 0),
                y: Math.max(yRel - 0.2, 0),
                w: Math.min(wRel + 0.4, 100),
                h: Math.min(hRel + 0.4, 100),
              });
            }
          }
        }

        setMatches(found);
      } catch (err) {
        console.error('Highlight error:', err);
      }
    };

    const debounce = setTimeout(findMatches, 250);
    return () => clearTimeout(debounce);
  }, [file, keywords, pageImages.length]);

  const compileHighlightedPdf = async () => {
    if (!file || matches.length === 0) return;
    setBusy(true);

    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const newDoc = await PDFDocument.create();

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 2.0 }); // High-res 2x
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

        // Draw neon highlights
        const pageMatches = matches.filter(m => m.pageIndex === p - 1);
        ctx.fillStyle = colorHex;
        ctx.globalAlpha = opacity;

        for (const m of pageMatches) {
          const rx = (m.x / 100) * canvas.width;
          const ry = (m.y / 100) * canvas.height;
          const rw = (m.w / 100) * canvas.width;
          const rh = (m.h / 100) * canvas.height;
          ctx.fillRect(rx, ry, rw, rh);
        }

        ctx.globalAlpha = 1.0;

        const imgData = canvas.toDataURL('image/jpeg', 0.94);
        const imgBytes = dataUrlToBytes(imgData);
        const pdfImg = await newDoc.embedJpg(imgBytes);
        const origVp = page.getViewport({ scale: 1.0 });
        const newPage = newDoc.addPage([origVp.width, origVp.height]);
        newPage.drawImage(pdfImg, {
          x: 0,
          y: 0,
          width: origVp.width,
          height: origVp.height,
        });
        canvas.width = 0;
        canvas.height = 0;
      }

      const finalBytes = toArrayBufferBytes(await newDoc.save());
      const blob = new Blob([finalBytes], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
      setResultFileName(`${file.name.replace(/\.pdf$/i, '')}_Highlighted.pdf`);
    } catch (err: any) {
      console.error('Highlight compilation error:', err);
      alert(`Compilation failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResultUrl(null);
    setMatches([]);
    setPageImages([]);
    setKeywords('');
  };

  const currentPageMatches = matches.filter(m => m.pageIndex === currentPage);

  return (
    <ToolWorkspaceShell
      title="PDF Text Highlighter Studio"
      subtitle="Highlight terms, keywords, and phrases across entire PDF documents with vibrant neon highlighter colors and live preview."
      categoryLabel="Neon Multi-Color Highlighter"
      icon={Highlighter}
      microVariant="edit"
      tone="amber"
      trustNote="100% browser-only highlighting · Live match overlays · High-res export"
    >
      {!file ? (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className="w-full max-w-2xl mx-auto space-y-6"
        >
          <FileDropzone
            onDrop={handleDrop}
            multiple={false}
            title="Select PDF Document to Highlight"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {[
              {
                icon: Palette,
                iconCls: 'text-amber-600 dark:text-amber-400 bg-[var(--pms-soft-rose)]',
                title: '5 Neon Palettes',
                desc: 'Neon Yellow, Mint Green, Pink, Cyan Sky, and Peach.',
              },
              {
                icon: Sliders,
                iconCls: 'text-[var(--pms-blue)] bg-[var(--pms-soft-blue)]',
                title: 'Comma Separation',
                desc: 'Highlight multiple keywords at once (e.g. "invoice, total, date").',
              },
              {
                icon: Eye,
                iconCls: 'text-emerald-600 dark:text-emerald-400 bg-[var(--pms-soft-mint)]',
                title: 'Instant Preview',
                desc: 'Real-time glowing preview before exporting.',
              },
            ].map((card, idx) => (
              <motion.div
                key={card.title}
                initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.26, delay: idx * 0.05 }}
                whileHover={prefersReduced ? undefined : { y: -3 }}
                className="pms-glass-panel p-5 rounded-2xl text-center"
              >
                <div className={`w-10 h-10 rounded-xl ${card.iconCls} flex items-center justify-center mx-auto mb-2.5`}>
                  <card.icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">{card.title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{card.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      ) : resultUrl ? (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.28 }}
          className="w-full max-w-xl mx-auto pms-glass-panel rounded-3xl p-8 text-center space-y-6 border border-emerald-200/80 dark:border-emerald-800/70"
        >
          <motion.div
            initial={prefersReduced ? false : { scale: 0.45, rotate: -12, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 360, damping: 18 }}
            className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner"
          >
            <Check className="w-10 h-10" />
          </motion.div>

          <div>
            <span className="inline-block px-3.5 py-1 bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-bold uppercase tracking-wider mb-2 border border-[var(--pms-border)]">
              Highlighter Applied
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              Highlighted PDF Ready!
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
              Successfully applied{' '}
              <strong className="font-extrabold text-emerald-700 dark:text-emerald-400">
                <AnimatedNumber value={matches.length} />
              </strong>{' '}
              highlight marker{matches.length === 1 ? '' : 's'} across the document.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <motion.a
              whileHover={prefersReduced ? undefined : { scale: 1.015 }}
              whileTap={prefersReduced ? undefined : { scale: 0.985 }}
              href={resultUrl}
              download={resultFileName}
              className="flex-1 pms-btn-primary py-4 px-6 font-bold rounded-2xl flex items-center justify-center gap-2 text-base"
            >
              <Download className="w-5 h-5" />
              Download Highlighted PDF
            </motion.a>
            <button
              onClick={reset}
              className="py-4 px-6 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-2xl transition-all text-sm cursor-pointer"
            >
              Highlight Another
            </button>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className="w-full space-y-4"
        >
          {/* Top Control Bar */}
          <div className="relative pms-glass-panel p-4 rounded-3xl flex flex-wrap items-center justify-between gap-4 overflow-hidden">
            <PearlScanOverlay active={busy} label="Compiling high-res highlighted PDF…" />

            <div className="flex items-center gap-3 flex-1 min-w-[260px]">
              <div className="w-9 h-9 rounded-xl bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="Keywords to highlight (comma separated e.g. total, approved, name)..."
                value={keywords}
                onChange={e => setKeywords(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[var(--pms-border)] bg-white/90 dark:bg-slate-900/80 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-400"
              />
            </div>

            {/* Color Palette Selector */}
            <div className="flex items-center gap-1.5">
              {colors.map(c => {
                const active = colorHex === c.hex;
                return (
                  <motion.button
                    key={c.hex}
                    type="button"
                    whileTap={prefersReduced ? undefined : { scale: 0.92 }}
                    onClick={() => setColorHex(c.hex)}
                    className={`relative w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                      active ? 'scale-110 shadow-md ring-2 ring-rose-400/70' : 'opacity-75 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c.hex, borderColor: c.border }}
                    title={c.label}
                  />
                );
              })}
            </div>

            {/* Opacity */}
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300">
                Opacity: {Math.round(opacity * 100)}%
              </span>
              <input
                type="range"
                min="0.2"
                max="0.8"
                step="0.05"
                value={opacity}
                onChange={e => setOpacity(Number(e.target.value))}
                className="w-20 accent-rose-600"
              />
            </div>

            {/* Action Button */}
            <div className="flex items-center gap-3">
              <motion.button
                whileHover={prefersReduced || busy || matches.length === 0 ? undefined : { scale: 1.02 }}
                whileTap={prefersReduced || busy || matches.length === 0 ? undefined : { scale: 0.98 }}
                onClick={compileHighlightedPdf}
                disabled={busy || matches.length === 0}
                className="pms-btn-primary py-2.5 px-5 font-bold rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Highlighter className="w-4 h-4" />}
                Save Highlights (<AnimatedNumber value={matches.length} />)
              </motion.button>
              <button
                onClick={reset}
                className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
              >
                Change
              </button>
            </div>
          </div>

          {/* Viewport with Glowing Highlights */}
          <div className="pms-glass-panel rounded-3xl p-4 sm:p-6 flex flex-col items-center gap-4">
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-300">
              <button
                onClick={() => setCurrentPage(p => Math.max(p - 1, 0))}
                disabled={currentPage === 0}
                className="p-2 rounded-xl border border-[var(--pms-border)] bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>
                Page {pageImages.length ? currentPage + 1 : 0} of {pageImages.length}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(p + 1, pageImages.length - 1))}
                disabled={currentPage >= pageImages.length - 1}
                className="p-2 rounded-xl border border-[var(--pms-border)] bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <AnimatePresence mode="wait">
                <motion.span
                  key={currentPageMatches.length}
                  initial={prefersReduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="px-2.5 py-1 rounded-full bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] text-[11px] font-bold"
                >
                  {currentPageMatches.length} highlight{currentPageMatches.length === 1 ? '' : 's'} on this page
                </motion.span>
              </AnimatePresence>
            </div>

            <div className="relative border border-[var(--pms-border)] shadow-xl bg-white select-none overflow-hidden rounded-xl max-w-full">
              {pageImages[currentPage] && (
                <img
                  src={pageImages[currentPage]}
                  alt={`Page ${currentPage + 1}`}
                  className="max-h-[75vh] object-contain mx-auto block pointer-events-none"
                />
              )}

              {/* Glowing Highlight Overlays */}
              {currentPageMatches.map((m, idx) => (
                <div
                  key={idx}
                  className="absolute pointer-events-none rounded transition-all mix-blend-multiply"
                  style={{
                    left: `${m.x}%`,
                    top: `${m.y}%`,
                    width: `${m.w}%`,
                    height: `${m.h}%`,
                    backgroundColor: colorHex,
                    opacity: opacity * 1.5,
                  }}
                />
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </ToolWorkspaceShell>
  );
}
