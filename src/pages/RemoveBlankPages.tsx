import { useState, useRef, useEffect, useMemo } from 'react';
import { FileX, Download, Loader2, CheckCircle2, AlertCircle, Sparkles, RefreshCw, Trash2, Check, SlidersHorizontal, ShieldCheck } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useToast } from '../components/Toast';
import { useSEO } from '../hooks/useSEO';

interface PageAnalysis {
  pageNum: number;
  thumbUrl: string;
  whitePct: number;
  textCount: number;
}

export default function RemoveBlankPages() {
  useSEO(
    'Remove Blank Pages from PDF Online Free — Visual Detection | PDF Media Suite',
    'Detect and remove blank or near-blank pages from scanned PDFs online free. Review detected pages with visual thumbnails and custom sensitivity controls.'
  );

  usePageSEO(
    'Remove Blank Pages from PDF',
    'Auto-detect and remove blank pages from scanned PDFs. Review thumbnails, adjust sensitivity threshold, and manually protect pages before removal.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState<PageAnalysis[]>([]);
  const [threshold, setThreshold] = useState(99.0);
  const [manualOverrides, setManualOverrides] = useState<Record<number, boolean>>({}); // pageNum -> isMarkedForDeletion
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [removedCount, setRemovedCount] = useState(0);

  const toast = useToast();

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    const selected = files[0];
    setFile(selected);
    setResultUrl(null);
    setManualOverrides({});
    await analyzePdf(selected);
  };

  const analyzePdf = async (pdfFile: File) => {
    setAnalyzing(true);
    try {
      const pdfBuf = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuf) }).promise;
      const analyzed: PageAnalysis[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 0.4 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

        // Also check if text content exists
        const textContent = await page.getTextContent();
        const textCount = textContent.items.length;

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        let whitePixels = 0;
        const totalPixels = canvas.width * canvas.height;
        for (let j = 0; j < d.length; j += 4) {
          // Check for pure white or near-white background pixels
          if (d[j] >= 245 && d[j + 1] >= 245 && d[j + 2] >= 245) {
            whitePixels++;
          }
        }

        const whitePct = (whitePixels / totalPixels) * 100;
        const thumbUrl = canvas.toDataURL('image/jpeg', 0.8);

        analyzed.push({
          pageNum: i,
          thumbUrl,
          whitePct: parseFloat(whitePct.toFixed(2)),
          textCount,
        });

        canvas.width = 0;
        canvas.height = 0;
      }

      setPages(analyzed);
    } catch (e: any) {
      console.error('Failed to analyze PDF:', e);
      toast.error(e?.message || 'Failed to scan PDF');
    } finally {
      setAnalyzing(false);
    }
  };

  // Determine if a page is considered blank based on threshold & manual override
  const isPageMarkedForDeletion = (p: PageAnalysis): boolean => {
    if (manualOverrides[p.pageNum] !== undefined) {
      return manualOverrides[p.pageNum];
    }
    // Auto detection: high white % and little to no text
    return p.whitePct >= threshold && p.textCount < 5;
  };

  const togglePageStatus = (pageNum: number) => {
    const p = pages.find((pg) => pg.pageNum === pageNum);
    if (!p) return;
    const currentStatus = isPageMarkedForDeletion(p);
    setManualOverrides((prev) => ({
      ...prev,
      [pageNum]: !currentStatus,
    }));
  };

  const markAllDetectedAsDelete = () => {
    setManualOverrides({});
  };

  const keepAllPages = () => {
    const overrides: Record<number, boolean> = {};
    pages.forEach((p) => {
      overrides[p.pageNum] = false;
    });
    setManualOverrides(overrides);
  };

  const pagesToDelete = useMemo(() => {
    return pages.filter(isPageMarkedForDeletion);
  }, [pages, threshold, manualOverrides]);

  const pagesToKeep = useMemo(() => {
    return pages.filter((p) => !isPageMarkedForDeletion(p));
  }, [pages, threshold, manualOverrides]);

  const removeBlankPages = async () => {
    if (!file || pages.length === 0) return;

    if (pagesToKeep.length === 0) {
      toast.error('All pages are marked as blank. Please keep at least one page.');
      return;
    }

    if (pagesToDelete.length === 0) {
      toast.info('No pages are marked for removal.');
      return;
    }

    setBusy(true);
    try {
      const srcDoc = await PDFDocument.load(await file.arrayBuffer());
      const newDoc = await PDFDocument.create();

      const keepIndices = pagesToKeep.map((p) => p.pageNum - 1);
      const copied = await newDoc.copyPages(srcDoc, keepIndices);
      copied.forEach((p) => newDoc.addPage(p));

      const bytes = await newDoc.save();
      const blob = new Blob([bytes as any], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
      setRemovedCount(pagesToDelete.length);
      toast.success(`Removed ${pagesToDelete.length} blank page(s) successfully!`);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to remove blank pages.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-bold tracking-widest uppercase mb-3 border border-rose-200 dark:border-rose-800">
          <Sparkles className="w-3.5 h-3.5" /> Intelligent Blank Page Filter
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-3">
          Remove Blank Pages from PDF
        </h1>
        <p className="text-lg text-gray-600 dark:text-slate-400 max-w-2xl mx-auto">
          Scans and detects empty or near-white pages from documents. Review thumbnails before deleting to ensure zero accidental page loss.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-4xl">
          <FileDropzone
            onDrop={handleDrop}
            multiple={false}
            accept={{ 'application/pdf': ['.pdf'] }}
            title="Select PDF file to scan"
            subtitle="or drop PDF document here"
          />
        </div>
      ) : analyzing ? (
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-12 text-center">
          <div className="w-14 h-14 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Analyzing Document Density...</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400">Inspecting each page for blank pixels, margin artifacts, and text</p>
        </div>
      ) : resultUrl ? (
        /* Results View */
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-8 text-center space-y-6">
          <div className="p-8 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-emerald-900 dark:text-emerald-200 mb-2">
              Cleaned PDF Ready!
            </h3>
            <p className="text-sm text-emerald-700 dark:text-emerald-400 mb-6">
              Removed {removedCount} blank page{removedCount !== 1 ? 's' : ''} • Remaining pages: {pages.length - removedCount}
            </p>
            <a
              href={resultUrl}
              download={`cleaned_${file.name}`}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-bold rounded-xl shadow-lg transition-all"
            >
              <Download className="w-5 h-5" /> Download Cleaned PDF
            </a>
          </div>

          <div className="flex justify-center gap-4">
            <button
              onClick={() => setResultUrl(null)}
              className="px-6 py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-xl transition-all"
            >
              Adjust Selection
            </button>
            <button
              onClick={() => {
                setFile(null);
                setPages([]);
                setResultUrl(null);
              }}
              className="px-6 py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-xl transition-all"
            >
              Process Another PDF
            </button>
          </div>
        </div>
      ) : (
        /* Workspace & Detection Review */
        <div className="w-full max-w-6xl space-y-6">
          {/* Top Control Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-xl flex items-center justify-center shrink-0">
                  <FileX className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate max-w-md">
                    {file.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    {pages.length} total pages • <span className="text-rose-600 dark:text-rose-400 font-semibold">{pagesToDelete.length} blank detected</span> • {pagesToKeep.length} will be kept
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full lg:w-auto">
                <button
                  onClick={() => {
                    setFile(null);
                    setPages([]);
                  }}
                  className="px-4 py-2.5 text-sm font-semibold text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={removeBlankPages}
                  disabled={busy || pagesToDelete.length === 0}
                  className="flex-1 lg:flex-initial inline-flex items-center justify-center gap-2 px-8 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
                >
                  {busy ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" /> Removing...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-5 h-5" /> Remove {pagesToDelete.length} Blank Page{pagesToDelete.length !== 1 ? 's' : ''}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Threshold Slider & Quick Toggles */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 items-center">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 flex items-center gap-2">
                    <SlidersHorizontal className="w-3.5 h-3.5" /> Sensitivity Threshold: <span className="text-rose-600 dark:text-rose-400">{threshold}% White</span>
                  </label>
                  <span className="text-xs text-gray-400">
                    {threshold >= 99.5 ? 'Very Strict (Only pure blank)' : threshold <= 96 ? 'Aggressive (Includes light marks)' : 'Balanced Standard'}
                  </span>
                </div>
                <input
                  type="range"
                  min="90"
                  max="99.9"
                  step="0.1"
                  value={threshold}
                  onChange={(e) => {
                    setThreshold(parseFloat(e.target.value));
                    setManualOverrides({});
                  }}
                  className="w-full h-2 bg-gray-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-rose-600"
                />
                <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">
                  Adjusting the slider automatically re-evaluates all pages in real-time.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={markAllDetectedAsDelete}
                  className="px-4 py-2 text-xs font-bold bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-xl transition-colors"
                >
                  Auto-Select Detected
                </button>
                <button
                  onClick={keepAllPages}
                  className="px-4 py-2 text-xs font-bold bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-xl transition-colors"
                >
                  Keep All Pages
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Review Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {pages.map((p) => {
              const isDeleting = isPageMarkedForDeletion(p);
              return (
                <div
                  key={p.pageNum}
                  onClick={() => togglePageStatus(p.pageNum)}
                  className={`relative group bg-white dark:bg-slate-900 rounded-2xl border-2 transition-all cursor-pointer p-2 flex flex-col select-none shadow-sm ${
                    isDeleting
                      ? 'border-rose-500 bg-rose-50/20 dark:bg-rose-950/20'
                      : 'border-emerald-500/50 hover:border-emerald-500'
                  }`}
                >
                  {/* Status Indicator */}
                  <div
                    className={`absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold z-10 shadow-sm ${
                      isDeleting
                        ? 'bg-rose-600 text-white'
                        : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {isDeleting ? 'Delete' : 'Keep'}
                  </div>

                  {/* Page Number */}
                  <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-0.5 rounded z-10">
                    #{p.pageNum}
                  </div>

                  {/* Page Thumbnail */}
                  <div className="aspect-[1/1.35] bg-gray-100 dark:bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center p-2 mb-2 border border-gray-100 dark:border-slate-800">
                    <img
                      src={p.thumbUrl}
                      alt={`Page ${p.pageNum}`}
                      className={`max-w-full max-h-full object-contain transition-opacity ${
                        isDeleting ? 'opacity-40 grayscale' : 'opacity-100'
                      }`}
                    />
                  </div>

                  {/* White Percentage Label */}
                  <div className="flex items-center justify-between px-1 text-[11px]">
                    <span className="text-gray-500 dark:text-slate-400 font-medium">
                      {p.whitePct}% white
                    </span>
                    <span className="text-[10px] text-gray-400">
                      Click to toggle
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
