import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, Replace, Download, Loader2, FileText, ChevronLeft, ChevronRight, 
  Check, ArrowRight, Eye, RefreshCw, Sparkles, Sliders
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';

interface SearchMatch {
  pageIndex: number;
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function SearchReplace() {
  useSEO(
    'Search & Replace in PDF Online Free — Live Visual Text Replacer',
    'Find and replace text in PDF files with live interactive preview. Case-sensitive, whole-word matching, and 100% private in-browser text replacement.'
  );

  usePageSEO(
    'PDF Search & Replace Studio — Live Match Navigator',
    'Find and replace any text or phrases in PDF files. Real-time visual match navigation, instant page preview, and clean typography replacement.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);

  const [pageImages, setPageImages] = useState<string[]>([]);
  const [pageDims, setPageDims] = useState<{ w: number; h: number }[]>([]);
  const [currentPage, setCurrentPage] = useState(0);

  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);

  const [isSearching, setIsSearching] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
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
      const dims: { w: number; h: number }[] = [];

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 1.5 });
        dims.push({ w: vp.width, h: vp.height });
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
      setPageDims(dims);
    } catch (err) {
      console.error('Failed to load PDF:', err);
    }
  };

  // Live match finder across document pages
  useEffect(() => {
    if (!file || !searchTerm.trim() || !pageImages.length) {
      setMatches([]);
      return;
    }

    let isCurrent = true;
    const findMatches = async () => {
      setIsSearching(true);
      try {
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        const found: SearchMatch[] = [];

        const term = matchCase ? searchTerm.trim() : searchTerm.trim().toLowerCase();

        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const vp = page.getViewport({ scale: 1.5 });
          const textContent = await page.getTextContent();

          for (const item of textContent.items as any[]) {
            const rawStr = item.str || '';
            const testStr = matchCase ? rawStr : rawStr.toLowerCase();

            let hasMatch = false;
            if (wholeWord) {
              const regex = new RegExp(`\\b${term}\\b`, matchCase ? '' : 'i');
              hasMatch = regex.test(rawStr);
            } else {
              hasMatch = testStr.includes(term);
            }

            if (hasMatch) {
              const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
              const xRel = (tx[4] / vp.width) * 100;
              const yRel = ((tx[5] - item.height * vp.scale) / vp.height) * 100;
              const wRel = ((item.width * vp.scale) / vp.width) * 100;
              const hRel = ((item.height * vp.scale * 1.3) / vp.height) * 100;

              found.push({
                pageIndex: p - 1,
                str: rawStr,
                x: Math.max(xRel, 0),
                y: Math.max(yRel, 0),
                w: Math.min(wRel, 100),
                h: Math.min(hRel, 100)
              });
            }
          }
        }

        if (isCurrent) {
          setMatches(found);
          if (found.length > 0) {
            setCurrentPage(found[0].pageIndex);
            setActiveMatchIndex(0);
          }
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        if (isCurrent) setIsSearching(false);
      }
    };

    const debounce = setTimeout(findMatches, 300);
    return () => {
      isCurrent = false;
      clearTimeout(debounce);
    };
  }, [file, searchTerm, matchCase, wholeWord, pageImages.length]);

  const jumpToMatch = (index: number) => {
    if (!matches[index]) return;
    setActiveMatchIndex(index);
    setCurrentPage(matches[index].pageIndex);
  };

  const nextMatch = () => {
    if (!matches.length) return;
    const nextIdx = (activeMatchIndex + 1) % matches.length;
    jumpToMatch(nextIdx);
  };

  const prevMatch = () => {
    if (!matches.length) return;
    const prevIdx = (activeMatchIndex - 1 + matches.length) % matches.length;
    jumpToMatch(prevIdx);
  };

  // Perform Autonomous Client-Side Text Replacement
  const executeReplace = async () => {
    if (!file || !searchTerm.trim() || matches.length === 0) return;
    setIsReplacing(true);

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

        // Find matches on this page
        const pageMatches = matches.filter(m => m.pageIndex === p - 1);

        for (const m of pageMatches) {
          const rx = (m.x / 100) * canvas.width;
          const ry = (m.y / 100) * canvas.height;
          const rw = (m.w / 100) * canvas.width;
          const rh = (m.h / 100) * canvas.height;

          // Whiteout original text
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(rx - 1, ry - 1, rw + 2, rh + 2);

          // Draw replacement text in clean matching typography
          if (replaceTerm) {
            ctx.fillStyle = '#0f172a';
            ctx.font = `${Math.max(rh * 0.75, 12)}px sans-serif`;
            ctx.textBaseline = 'top';
            ctx.fillText(replaceTerm, rx, ry + 1);
          }
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

      const bytes = await newDoc.save();
      setResultUrl(URL.createObjectURL(new Blob([bytes as any], { type: 'application/pdf' })));
      setResultFileName(`${file.name.replace(/\.pdf$/i, '')}_Replaced.pdf`);
    } catch (err: any) {
      console.error('Replace error:', err);
      alert(`Text replacement failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsReplacing(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResultUrl(null);
    setMatches([]);
    setSearchTerm('');
    setReplaceTerm('');
  };

  const currentPageMatches = matches.filter(m => m.pageIndex === currentPage);

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-4 sm:p-8 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm border border-blue-100 dark:border-blue-900/50">
          <Replace className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-2">
          Visual PDF Search & Replace Studio
        </h1>
        <p className="text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          Find any word or phrase with real-time visual highlight navigation, and replace across the entire PDF with clean typography.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl space-y-6">
          <FileDropzone 
            onDrop={handleDrop} 
            multiple={false} 
            title="Select PDF Document to Search & Replace" 
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Eye className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Live Highlighter</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Highlights search matches on the live canvas in real-time.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Sliders className="w-6 h-6 text-indigo-600 dark:text-indigo-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Match Filters</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Supports Case-Sensitive and Whole-Word regex matching.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Sparkles className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">100% In-Browser</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">No server dependency required. Replaces text directly in memory.</p>
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
            <span className="inline-block px-3 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
              Text Replaced Successfully
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              PDF Updated!
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
              Replaced {matches.length} occurrence{matches.length === 1 ? '' : 's'} of <strong className="text-slate-800 dark:text-slate-200">"{searchTerm}"</strong> with <strong className="text-blue-600 dark:text-blue-400">"{replaceTerm}"</strong>.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <a
              href={resultUrl}
              download={resultFileName}
              className="flex-1 py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 text-base transition-all"
            >
              <Download className="w-5 h-5" />
              Download Updated PDF
            </a>
            <button
              onClick={reset}
              className="py-4 px-6 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-2xl transition-all text-sm"
            >
              Search Another
            </button>
          </div>
        </div>
      ) : (
        /* Interactive Workspace */
        <div className="w-full space-y-4">
          {/* Search Controls Toolbar */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-[320px]">
              {/* Search Box */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Find text in document..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Replace Box */}
              <div className="relative flex-1">
                <Replace className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Replace with..."
                  value={replaceTerm}
                  onChange={e => setReplaceTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Toggles */}
              <button
                onClick={() => setMatchCase(!matchCase)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                  matchCase ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                }`}
                title="Match Case"
              >
                Aa
              </button>
              <button
                onClick={() => setWholeWord(!wholeWord)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                  wholeWord ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                }`}
                title="Whole Words Only"
              >
                [W]
              </button>
            </div>

            {/* Match Navigation & Execute Button */}
            <div className="flex items-center gap-3">
              {matches.length > 0 && (
                <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400">
                  <span className="px-2 py-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 rounded-lg">
                    {activeMatchIndex + 1} of {matches.length} matches
                  </span>
                  <button onClick={prevMatch} className="p-1 border rounded-lg hover:bg-slate-100">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={nextMatch} className="p-1 border rounded-lg hover:bg-slate-100">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <button
                onClick={executeReplace}
                disabled={isReplacing || matches.length === 0}
                className="py-2.5 px-5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md disabled:opacity-40 transition-all"
              >
                {isReplacing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Replace className="w-4 h-4" />}
                Replace All ({matches.length})
              </button>
              <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600 underline">Change</button>
            </div>
          </div>

          {/* Document Viewport with Glowing Yellow Match Highlights */}
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
              <span className="text-slate-400 ml-2">({currentPageMatches.length} match{currentPageMatches.length === 1 ? '' : 'es'} on this page)</span>
            </div>

            <div className="relative border shadow-xl bg-white select-none overflow-hidden rounded-lg max-w-full">
              <img
                src={pageImages[currentPage]}
                alt={`Page ${currentPage + 1}`}
                className="max-h-[75vh] object-contain mx-auto block"
              />

              {/* Match Highlight Boxes */}
              {currentPageMatches.map((m, idx) => {
                const isActive = matches[activeMatchIndex] === m;
                return (
                  <div
                    key={idx}
                    className={`absolute pointer-events-none rounded transition-all ${
                      isActive 
                        ? 'bg-amber-400/70 border-2 border-amber-600 ring-4 ring-amber-400/40' 
                        : 'bg-yellow-300/50 border border-yellow-500'
                    }`}
                    style={{
                      left: `${m.x}%`,
                      top: `${m.y}%`,
                      width: `${m.w}%`,
                      height: `${m.h}%`
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
