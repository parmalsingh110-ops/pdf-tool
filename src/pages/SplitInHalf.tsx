import React, { useState, useRef, useEffect } from 'react';
import { Download, FileText, Scissors, CheckCircle2, Eye, Loader2, Sparkles, Sliders, Columns, Rows, ArrowRightLeft, RefreshCw } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolSEOSection from '../components/ToolSEOSection';

interface PreviewThumb {
  pageNum: number;
  dataUrl: string;
  width: number;
  height: number;
}

export default function SplitInHalf() {
  useSEO(
    'Split PDF in Half Online Free — Cut Two-Page Book Spreads | PDF Media Suite',
    'Split 2-page layout scans in half online free. Divide A3 to double A4 or A4 to double A5 vertically or horizontally with live cut preview and RTL support.'
  );

  usePageSEO(
    'Split PDF in Half — 2-Page Layout & Book Scan Splitter',
    'Divide scanned book spreads, double-page layouts, and broadsheet PDFs down the center. Convert side-by-side scans into individual, correctly ordered pages.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState('');
  const [pageCount, setPageCount] = useState(0);

  // Split settings
  const [direction, setDirection] = useState<'vertical' | 'horizontal'>('vertical');
  const [readingOrder, setReadingOrder] = useState<'ltr' | 'rtl'>('ltr'); // LTR (Left then Right) or RTL (Right then Left - Manga/Arabic)
  const [splitRatio, setSplitRatio] = useState<number>(50); // 50 = exact center
  const [pageSelection, setPageSelection] = useState<'all' | 'custom'>('all');
  const [customRange, setCustomRange] = useState('');

  // Live preview on first page
  const [previewThumb, setPreviewThumb] = useState<PreviewThumb | null>(null);
  const [previewPageNum, setPreviewPageNum] = useState<number>(1);

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    const f = acceptedFiles[0];
    setFile(f);
    setResultUrl(null);
    setBusy(true);

    try {
      const ab = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
      setPageCount(pdf.numPages);
      setCustomRange(`1-${pdf.numPages}`);
      await renderPreviewPage(pdf, 1);
    } catch (err: any) {
      console.error(err);
      alert('Failed to load PDF: ' + (err?.message || 'Unknown error'));
      setFile(null);
    } finally {
      setBusy(false);
    }
  };

  const renderPreviewPage = async (pdfDoc: pdfjsLib.PDFDocumentProxy, pageNum: number) => {
    setLoadingPreview(true);
    try {
      const page = await pdfDoc.getPage(pageNum);
      const vp = page.getViewport({ scale: 1 });
      const maxW = 550;
      const scale = Math.min(1.5, maxW / vp.width);
      const scaledVp = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = scaledVp.width;
      canvas.height = scaledVp.height;
      const ctx = canvas.getContext('2d')!;

      await page.render({ canvasContext: ctx, viewport: scaledVp, canvas }).promise;
      setPreviewThumb({
        pageNum,
        dataUrl: canvas.toDataURL('image/jpeg', 0.85),
        width: scaledVp.width,
        height: scaledVp.height,
      });
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    } catch (e) {
      console.error('Preview error:', e);
    } finally {
      setLoadingPreview(false);
    }
  };

  const parseRanges = (str: string, max: number): number[] => {
    const pages = new Set<number>();
    const parts = str.split(',').map(p => p.trim());
    for (const part of parts) {
      if (part.includes('-')) {
        const [s, e] = part.split('-').map(Number);
        if (!isNaN(s) && !isNaN(e)) {
          for (let i = Math.max(1, s); i <= Math.min(max, e); i++) pages.add(i);
        }
      } else {
        const n = parseInt(part, 10);
        if (!isNaN(n) && n >= 1 && n <= max) pages.add(n);
      }
    }
    return Array.from(pages).sort((a, b) => a - b);
  };

  const processSplit = async () => {
    if (!file) return;
    setBusy(true);

    try {
      const ab = await file.arrayBuffer();
      const srcDoc = await PDFDocument.load(ab);
      const outDoc = await PDFDocument.create();
      const total = srcDoc.getPageCount();

      const pagesToSplit = new Set<number>(
        pageSelection === 'all'
          ? Array.from({ length: total }, (_, i) => i + 1)
          : parseRanges(customRange, total)
      );

      const ratio = splitRatio / 100;

      for (let i = 0; i < total; i++) {
        const pageNum = i + 1;
        const [embedded] = await outDoc.embedPages([srcDoc.getPage(i)]);
        const srcPage = srcDoc.getPage(i);
        const { width, height } = srcPage.getSize();

        if (!pagesToSplit.has(pageNum)) {
          // Keep as is without split
          const p = outDoc.addPage([width, height]);
          p.drawPage(embedded, { x: 0, y: 0, width, height });
          continue;
        }

        if (direction === 'vertical') {
          const cutX = width * ratio;
          const leftW = cutX;
          const rightW = width - cutX;

          // Part A: Left side (x: 0 to cutX)
          const leftHalfPage = () => {
            const p = outDoc.addPage([leftW, height]);
            p.drawPage(embedded, { x: 0, y: 0, width, height });
          };

          // Part B: Right side (x: cutX to width)
          const rightHalfPage = () => {
            const p = outDoc.addPage([rightW, height]);
            p.drawPage(embedded, { x: -cutX, y: 0, width, height });
          };

          if (readingOrder === 'ltr') {
            leftHalfPage();
            rightHalfPage();
          } else {
            // RTL Manga / Right-to-Left
            rightHalfPage();
            leftHalfPage();
          }
        } else {
          // Horizontal split (Top and Bottom)
          const cutY = height * (1 - ratio); // PDF y:0 is bottom
          const topH = height * ratio;
          const bottomH = height - topH;

          // Top half (from cutY to height)
          const topHalfPage = () => {
            const p = outDoc.addPage([width, topH]);
            p.drawPage(embedded, { x: 0, y: -cutY, width, height });
          };

          // Bottom half (from 0 to cutY)
          const bottomHalfPage = () => {
            const p = outDoc.addPage([width, bottomH]);
            p.drawPage(embedded, { x: 0, y: 0, width, height });
          };

          // Top to bottom
          topHalfPage();
          bottomHalfPage();
        }
      }

      const outBytes = await outDoc.save();
      const blob = new Blob([outBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultName(`${file.name.replace(/\.pdf$/i, '')}_split_in_half.pdf`);
    } catch (e: any) {
      console.error('Split error:', e);
      alert('Error splitting PDF: ' + (e?.message || 'Unknown error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 transition-colors">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-sm font-semibold mb-3">
            <Scissors className="w-4 h-4" /> 2-Page Layout & Book Scan Splitter
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
            Split PDF in Half
          </h1>
          <p className="text-base md:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Split two-page layout scans, A3 to double A4, or A4 to double A5. Divide book spreads down the center into separate individual pages.
          </p>
        </div>

        {!file ? (
          <div className="max-w-2xl mx-auto">
            <FileDropzone
              onDrop={handleDrop}
              accept={{ 'application/pdf': ['.pdf'] }}
              multiple={false}
              title="Upload Scanned PDF or Book Spread"
              subtitle="Drop a 2-page spread PDF to split down the center"
            />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Control Bar */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-slate-200">{file.name}</h3>
                    <p className="text-xs text-slate-500">
                      {pageCount} page{pageCount > 1 ? 's' : ''} • {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setFile(null);
                    setResultUrl(null);
                    setPreviewThumb(null);
                  }}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                >
                  Change File
                </button>
              </div>

              {/* Split Settings Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
                {/* 1. Direction */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                    Split Direction
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDirection('vertical')}
                      className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold transition-all ${
                        direction === 'vertical'
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <Columns className="w-4 h-4" /> Vertical (Left / Right)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDirection('horizontal')}
                      className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold transition-all ${
                        direction === 'horizontal'
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <Rows className="w-4 h-4" /> Horizontal (Top / Bottom)
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    {direction === 'vertical' ? 'Standard for book spreads and side-by-side scans' : 'For landscape top-to-bottom calendars and folded plans'}
                  </p>
                </div>

                {/* 2. Reading Order */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                    Reading Order
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setReadingOrder('ltr')}
                      className={`flex items-center justify-center gap-1.5 p-3 rounded-xl border text-sm font-semibold transition-all ${
                        readingOrder === 'ltr'
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      LTR (Left ➔ Right)
                    </button>
                    <button
                      type="button"
                      onClick={() => setReadingOrder('rtl')}
                      className={`flex items-center justify-center gap-1.5 p-3 rounded-xl border text-sm font-semibold transition-all ${
                        readingOrder === 'rtl'
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      RTL (Manga / Right ➔ Left)
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    {readingOrder === 'ltr' ? 'Page 1 is on the left, Page 2 on the right' : 'Right page is read first (Japanese Manga, Urdu, Arabic)'}
                  </p>
                </div>

                {/* 3. Split Cut Position */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Cut Position
                    </label>
                    <span className="text-xs font-bold text-orange-600 bg-orange-100 dark:bg-orange-950/50 px-2 py-0.5 rounded">
                      {splitRatio}% : {100 - splitRatio}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={80}
                    value={splitRatio}
                    onChange={(e) => setSplitRatio(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-600"
                  />
                  <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                    <span>Left 20%</span>
                    <button
                      onClick={() => setSplitRatio(50)}
                      className="text-orange-600 dark:text-orange-400 hover:underline font-semibold"
                    >
                      Reset 50% Center
                    </button>
                    <span>Right 80%</span>
                  </div>
                </div>
              </div>

              {/* Pages to split option */}
              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pages to Split:</span>
                  <label className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      checked={pageSelection === 'all'}
                      onChange={() => setPageSelection('all')}
                      className="text-orange-600 focus:ring-orange-500"
                    />
                    All Pages ({pageCount})
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      checked={pageSelection === 'custom'}
                      onChange={() => setPageSelection('custom')}
                      className="text-orange-600 focus:ring-orange-500"
                    />
                    Custom Range
                  </label>
                  {pageSelection === 'custom' && (
                    <input
                      type="text"
                      value={customRange}
                      onChange={(e) => setCustomRange(e.target.value)}
                      placeholder="e.g. 1-5, 8, 11-14"
                      className="px-3 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white w-36"
                    />
                  )}
                </div>

                <button
                  onClick={processSplit}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {busy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Splitting...
                    </>
                  ) : (
                    <>
                      <Scissors className="w-4 h-4" /> Split PDF in Half
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Live Cut Preview */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 text-center">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-orange-600" />
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Live Cut Preview (Page {previewPageNum} of {pageCount})
                  </h4>
                </div>
                {pageCount > 1 && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500">Preview page:</span>
                    <select
                      value={previewPageNum}
                      onChange={async (e) => {
                        const num = Number(e.target.value);
                        setPreviewPageNum(num);
                        const ab = await file.arrayBuffer();
                        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
                        await renderPreviewPage(pdf, num);
                      }}
                      className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs"
                    >
                      {Array.from({ length: Math.min(pageCount, 30) }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          Page {n}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {previewThumb ? (
                <div className="relative inline-block border-2 border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden shadow-md bg-white">
                  <img
                    src={previewThumb.dataUrl}
                    alt="Preview"
                    className="max-h-[480px] w-auto object-contain block mx-auto"
                  />

                  {/* Cut Line Overlay */}
                  {direction === 'vertical' ? (
                    <div
                      className="absolute top-0 bottom-0 pointer-events-none border-l-2 border-dashed border-red-500 flex items-center justify-center"
                      style={{ left: `${splitRatio}%` }}
                    >
                      <span className="bg-red-500 text-white font-mono text-[10px] px-1 py-0.5 rounded shadow absolute top-2 transform -translate-x-1/2">
                        ✂ Cut Line
                      </span>
                      <span className="bg-blue-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded shadow absolute bottom-3 -left-12">
                        {readingOrder === 'ltr' ? 'Page 1' : 'Page 2'}
                      </span>
                      <span className="bg-emerald-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded shadow absolute bottom-3 left-4">
                        {readingOrder === 'ltr' ? 'Page 2' : 'Page 1'}
                      </span>
                    </div>
                  ) : (
                    <div
                      className="absolute left-0 right-0 pointer-events-none border-t-2 border-dashed border-red-500 flex items-center justify-center"
                      style={{ top: `${splitRatio}%` }}
                    >
                      <span className="bg-red-500 text-white font-mono text-[10px] px-1 py-0.5 rounded shadow absolute left-2 transform -translate-y-1/2">
                        ✂ Cut Line
                      </span>
                      <span className="bg-blue-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded shadow absolute top-3 left-1/2 -translate-x-1/2">
                        Page 1 (Top)
                      </span>
                      <span className="bg-emerald-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded shadow absolute -top-7 left-1/2 -translate-x-1/2">
                        Page 2 (Bottom)
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-12 text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Rendering page preview...
                </div>
              )}
            </div>

            {/* Result Box */}
            {resultUrl && (
              <div className="p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center animate-fade-in">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
                <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-100 mb-1">
                  Split In Half Complete!
                </h3>
                <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-4">
                  Your two-page layout document has been split down the center into individual, correctly ordered pages.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <a
                    href={resultUrl}
                    download={resultName}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition-colors"
                  >
                    <Download className="w-4 h-4" /> Download Split PDF
                  </a>
                  <a
                    href={resultUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-emerald-800 dark:text-emerald-200 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100/50 transition-colors"
                  >
                    <Eye className="w-4 h-4" /> Preview in Browser
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        <ToolSEOSection
          toolName="Split PDF in Half"
          headline="2-Page Layout & Book Scan Splitter"
          description="Free online tool to cut double-page scanned documents down the center into separate individual pages. Perfect for A3 double-spreads, scanned books, and magazines."
          faqs={[
            {
              q: 'How does Split in Half handle two-page book scans?',
              a: 'It duplicates the page geometry in pure vector format and clips the left half onto page 1 and the right half onto page 2, preserving all original resolution and searchability.',
            },
            {
              q: 'Can I split manga books that read right-to-left?',
              a: 'Yes! Simply select the "RTL (Manga / Right to Left)" reading order option and the right page will be placed first, followed by the left page.',
            },
            {
              q: 'Does it work for horizontal two-page scans?',
              a: 'Yes, select Horizontal Split to divide top-and-bottom spreads into separate pages.',
            },
          ]}
        />
      </div>
    </div>
  );
}
