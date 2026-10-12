import React, { useState, useEffect } from 'react';
import { 
  Highlighter, Download, Loader2, Sparkles, ChevronLeft, ChevronRight, 
  Check, FileText, Sliders, Palette, Eye, ArrowRight
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb } from 'pdf-lib';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';

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

  const colors = [
    { hex: '#fef08a', label: 'Neon Yellow', border: '#eab308' },
    { hex: '#bbf7d0', label: 'Mint Green', border: '#22c55e' },
    { hex: '#fbcfe8', label: 'Pastel Pink', border: '#ec4899' },
    { hex: '#bae6fd', label: 'Cyan Sky', border: '#0ea5e9' },
    { hex: '#fed7aa', label: 'Peach Orange', border: '#f97316' }
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
                h: Math.min(hRel + 0.4, 100)
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

      // Convert hex to rgb
      const r = parseInt(colorHex.slice(1, 3), 16) / 255;
      const g = parseInt(colorHex.slice(3, 5), 16) / 255;
      const b = parseInt(colorHex.slice(5, 7), 16) / 255;

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
          height: origVp.height
        });
        canvas.width = 0;
        canvas.height = 0;
      }

      const finalBytes = await newDoc.save();
      const blob = new Blob([finalBytes as any], { type: 'application/pdf' });
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
    setKeywords('');
  };

  const currentPageMatches = matches.filter(m => m.pageIndex === currentPage);

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-4 sm:p-8 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-yellow-50 dark:bg-yellow-950/40 text-yellow-600 dark:text-yellow-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm border border-yellow-100 dark:border-yellow-900/50">
          <Highlighter className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-2">
          PDF Text Highlighter Studio
        </h1>
        <p className="text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          Highlight terms, keywords, and phrases across entire PDF documents with vibrant neon highlighter colors and live preview.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl space-y-6">
          <FileDropzone 
            onDrop={handleDrop} 
            multiple={false} 
            title="Select PDF Document to Highlight" 
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Palette className="w-6 h-6 text-yellow-600 dark:text-yellow-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">5 Neon Palettes</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Neon Yellow, Mint Green, Pink, Cyan Sky, and Peach.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Sliders className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Comma Separation</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Highlight multiple keywords at once (e.g. "invoice, total, date").</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Eye className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Instant Preview</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Real-time glowing preview before exporting.</p>
            </div>
          </div>
        </div>
      ) : resultUrl ? (
        /* Result Screen */
        <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-xl text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <Check className="w-10 h-10" />
          </div>

          <div>
            <span className="inline-block px-3 py-1 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
              Highlighter Applied
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              Highlighted PDF Ready!
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
              Successfully applied {matches.length} highlight marker{matches.length === 1 ? '' : 's'} across the document.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <a
              href={resultUrl}
              download={resultFileName}
              className="flex-1 py-4 px-6 bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-bold rounded-2xl shadow-lg shadow-yellow-500/20 flex items-center justify-center gap-2 text-base transition-all"
            >
              <Download className="w-5 h-5" />
              Download Highlighted PDF
            </a>
            <button
              onClick={reset}
              className="py-4 px-6 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-2xl transition-all text-sm"
            >
              Highlight Another
            </button>
          </div>
        </div>
      ) : (
        /* Workspace */
        <div className="w-full space-y-4">
          {/* Top Control Bar */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-[280px]">
              <input
                type="text"
                placeholder="Keywords to highlight (comma separated e.g. total, approved, name)..."
                value={keywords}
                onChange={e => setKeywords(e.target.value)}
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>

            {/* Color Palette Selector */}
            <div className="flex items-center gap-1.5">
              {colors.map(c => (
                <button
                  key={c.hex}
                  onClick={() => setColorHex(c.hex)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${
                    colorHex === c.hex ? 'scale-110 shadow-md ring-2 ring-yellow-400' : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c.hex, borderColor: c.border }}
                  title={c.label}
                />
              ))}
            </div>

            {/* Opacity */}
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300">Opacity: {Math.round(opacity * 100)}%</span>
              <input
                type="range"
                min="0.2"
                max="0.8"
                step="0.05"
                value={opacity}
                onChange={e => setOpacity(Number(e.target.value))}
                className="w-20 accent-yellow-500"
              />
            </div>

            {/* Action Button */}
            <div className="flex items-center gap-3">
              <button
                onClick={compileHighlightedPdf}
                disabled={busy || matches.length === 0}
                className="py-2.5 px-6 bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-all disabled:opacity-40"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Highlighter className="w-4 h-4" />}
                Save Highlights ({matches.length})
              </button>
              <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600 underline">Change</button>
            </div>
          </div>

          {/* Viewport with Glowing Highlights */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-400">
              <button
                onClick={() => setCurrentPage(p => Math.max(p - 1, 0))}
                disabled={currentPage === 0}
                className="p-1.5 rounded-lg border hover:bg-slate-100 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>Page {currentPage + 1} of {pageImages.length}</span>
              <button
                onClick={() => setCurrentPage(p => Math.min(p + 1, pageImages.length - 1))}
                disabled={currentPage === pageImages.length - 1}
                className="p-1.5 rounded-lg border hover:bg-slate-100 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-slate-400 ml-2">({currentPageMatches.length} highlight{currentPageMatches.length === 1 ? '' : 's'} on this page)</span>
            </div>

            <div className="relative border shadow-xl bg-white select-none overflow-hidden rounded-lg max-w-full">
              <img
                src={pageImages[currentPage]}
                alt={`Page ${currentPage + 1}`}
                className="max-h-[75vh] object-contain mx-auto block pointer-events-none"
              />

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
                    opacity: opacity * 1.5
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
