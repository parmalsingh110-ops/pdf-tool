import React, { useState, useEffect } from 'react';
import { 
  Scissors, Download, Loader2, FileText, ChevronLeft, ChevronRight, 
  Check, Trash2, Sliders, Eye, Sparkles, ArrowRight
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';

type RemovalScope = 'keywords' | 'headers-footers' | 'all-text';

interface TextMatch {
  pageIndex: number;
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function RemoveText() {
  useSEO(
    'Remove Text from PDF Online Free — Selective Keyword & Margin Cleaner',
    'Remove unwanted text from PDF files online. Selectively delete specific keywords, remove header/footer margins, or blank out entire pages with live preview.'
  );

  usePageSEO(
    'Selective PDF Text Remover Studio',
    'Delete specific text phrases, unwanted margins, or wipe text content from PDF pages. 100% private in-browser text removal.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [scope, setScope] = useState<RemovalScope>('keywords');
  const [targetKeywords, setTargetKeywords] = useState('');
  const [eraseColor, setEraseColor] = useState('#ffffff');

  const [pageImages, setPageImages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [matches, setMatches] = useState<TextMatch[]>([]);

  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFileName, setResultFileName] = useState('');

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

  // Find target text lines to remove
  useEffect(() => {
    if (!file || !pageImages.length) {
      setMatches([]);
      return;
    }

    const scanText = async () => {
      try {
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        const found: TextMatch[] = [];
        const terms = targetKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);

        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const vp = page.getViewport({ scale: 1.5 });
          const textContent = await page.getTextContent();

          for (const item of textContent.items as any[]) {
            const rawStr = (item.str || '').trim();
            if (!rawStr) continue;

            let shouldRemove = false;

            if (scope === 'keywords') {
              if (terms.length > 0 && terms.some(t => rawStr.toLowerCase().includes(t))) {
                shouldRemove = true;
              }
            } else if (scope === 'headers-footers') {
              const yRel = item.transform[5] / (vp.height / vp.scale);
              // Top 8% or Bottom 8%
              if (yRel > 0.92 || yRel < 0.08) {
                shouldRemove = true;
              }
            } else if (scope === 'all-text') {
              shouldRemove = true;
            }

            if (shouldRemove) {
              const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
              const xRel = (tx[4] / vp.width) * 100;
              const yRel = ((tx[5] - item.height * vp.scale) / vp.height) * 100;
              const wRel = ((item.width * vp.scale) / vp.width) * 100;
              const hRel = ((item.height * vp.scale * 1.25) / vp.height) * 100;

              found.push({
                pageIndex: p - 1,
                str: rawStr,
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
        console.error('Scan error:', err);
      }
    };

    const debounce = setTimeout(scanText, 250);
    return () => clearTimeout(debounce);
  }, [file, scope, targetKeywords, pageImages.length]);

  const executeRemove = async () => {
    if (!file || (scope === 'keywords' && !targetKeywords.trim())) return;
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

        const pageMatches = matches.filter(m => m.pageIndex === p - 1);
        ctx.fillStyle = eraseColor;

        for (const m of pageMatches) {
          const rx = (m.x / 100) * canvas.width;
          const ry = (m.y / 100) * canvas.height;
          const rw = (m.w / 100) * canvas.width;
          const rh = (m.h / 100) * canvas.height;
          ctx.fillRect(rx - 1, ry - 1, rw + 2, rh + 2);
        }

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
      setResultFileName(`${file.name.replace(/\.pdf$/i, '')}_Text_Removed.pdf`);
    } catch (err: any) {
      console.error('Text removal error:', err);
      alert(`Removal failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResultUrl(null);
    setMatches([]);
    setTargetKeywords('');
  };

  const currentPageMatches = matches.filter(m => m.pageIndex === currentPage);

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-4 sm:p-8 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm border border-red-100 dark:border-red-900/50">
          <Scissors className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-2">
          Selective PDF Text Remover Studio
        </h1>
        <p className="text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          Delete targeted keywords, clean header/footer page margins, or blank out filled text with clean background matching.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl space-y-6">
          <FileDropzone 
            onDrop={handleDrop} 
            multiple={false} 
            title="Select PDF Document to Remove Text From" 
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Sparkles className="w-6 h-6 text-red-600 dark:text-red-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Target Keywords</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Delete only specific names or clauses across all pages.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Sliders className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Header & Footer Margins</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Strips top titles and bottom page numbering automatically.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Eye className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Live Preview</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Visual red indicators show exact words marked for removal.</p>
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
            <span className="inline-block px-3 py-1 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
              Text Erased
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              Clean PDF Ready!
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
              Successfully removed {matches.length} text block{matches.length === 1 ? '' : 's'} from the document.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <a
              href={resultUrl}
              download={resultFileName}
              className="flex-1 py-4 px-6 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 text-base transition-all"
            >
              <Download className="w-5 h-5" />
              Download Clean PDF
            </a>
            <button
              onClick={reset}
              className="py-4 px-6 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-2xl transition-all text-sm"
            >
              Clean Another
            </button>
          </div>
        </div>
      ) : (
        /* Workspace */
        <div className="w-full space-y-4">
          {/* Top Control Bar */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
            {/* Scope Selector */}
            <div className="flex items-center gap-2">
              {[
                { id: 'keywords', label: 'By Keywords' },
                { id: 'headers-footers', label: 'Header & Footer Only' },
                { id: 'all-text', label: 'All Text (Blank Form)' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setScope(tab.id as RemovalScope)}
                  className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all ${
                    scope === tab.id
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Keyword Input */}
            {scope === 'keywords' && (
              <div className="flex-1 min-w-[240px]">
                <input
                  type="text"
                  placeholder="Words to delete (comma separated e.g. draft, John Doe)..."
                  value={targetKeywords}
                  onChange={e => setTargetKeywords(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            )}

            {/* Action Button */}
            <div className="flex items-center gap-3">
              <button
                onClick={executeRemove}
                disabled={busy || matches.length === 0}
                className="py-2.5 px-6 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-all disabled:opacity-40"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />}
                Delete Selected Text ({matches.length})
              </button>
              <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600 underline">Change</button>
            </div>
          </div>

          {/* Viewport with Red Strikethrough Markers */}
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
              <span className="text-slate-400 ml-2">({currentPageMatches.length} text items targeted on this page)</span>
            </div>

            <div className="relative border shadow-xl bg-white select-none overflow-hidden rounded-lg max-w-full">
              <img
                src={pageImages[currentPage]}
                alt={`Page ${currentPage + 1}`}
                className="max-h-[75vh] object-contain mx-auto block pointer-events-none"
              />

              {/* Red Targeted Text Boxes */}
              {currentPageMatches.map((m, idx) => (
                <div
                  key={idx}
                  className="absolute pointer-events-none rounded bg-red-500/30 border border-red-500"
                  style={{
                    left: `${m.x}%`,
                    top: `${m.y}%`,
                    width: `${m.w}%`,
                    height: `${m.h}%`
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
