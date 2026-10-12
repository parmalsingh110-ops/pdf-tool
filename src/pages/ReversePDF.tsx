import React, { useState } from 'react';
import { Download, FileText, ArrowUpDown, CheckCircle2, RotateCw, ExternalLink, Eye, Loader2, Sparkles } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

interface PageThumbnail {
  originalIndex: number; // 1-based
  dataUrl: string;
}

export default function ReversePDF() {
  useSEO(
    'Reverse PDF Page Order Online Free | PDF Media Suite',
    'Free online tool to reverse PDF page order with visual thumbnail previews. Flip the entire document or reverse while preserving cover pages.'
  );

  usePageSEO(
    'Reverse PDF — Flip Page Order with Visual Preview',
    'Reverse PDF pages from back-to-front or customize range reversal. View thumbnails of the before & after sequence before downloading.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [thumbnails, setThumbnails] = useState<PageThumbnail[]>([]);
  const [isLoadingPages, setIsLoadingPages] = useState(false);

  // Reversal Modes: 'all' | 'keepCover' | 'range'
  const [reverseMode, setReverseMode] = useState<'all' | 'keepCover' | 'range'>('all');
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(1);

  const [isProcessing, setIsProcessing] = useState(false);
  const [reversedUrl, setReversedUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const selectedFile = acceptedFiles[0];
    setFile(selectedFile);
    setReversedUrl(null);
    setIsLoadingPages(true);
    setThumbnails([]);

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const count = pdfjsDoc.numPages;

      setRangeStart(1);
      setRangeEnd(count);

      const loadedThumbs: PageThumbnail[] = [];
      // Render up to 24 page thumbnails for fast UI rendering
      const maxThumbLimit = Math.min(count, 32);

      for (let i = 1; i <= maxThumbLimit; i++) {
        const page = await pdfjsDoc.getPage(i);
        const viewport = page.getViewport({ scale: 0.35 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
        loadedThumbs.push({
          originalIndex: i,
          dataUrl: canvas.toDataURL('image/jpeg', 0.8),
        });
        canvas.width = 0;
        canvas.height = 0;
      }

      setThumbnails(loadedThumbs);
    } catch (err) {
      console.error('Error loading PDF pages:', err);
      alert('Could not render document thumbnails. You can still proceed with reversing.');
    } finally {
      setIsLoadingPages(false);
    }
  };

  // Calculate new sequence of 0-based page indices
  const getReversedIndices = (total: number): number[] => {
    const indices = Array.from({ length: total }, (_, i) => i);

    if (reverseMode === 'all') {
      return [...indices].reverse();
    } else if (reverseMode === 'keepCover') {
      // Keep index 0 intact, reverse remaining [1 ... total-1]
      if (total <= 1) return indices;
      const rest = indices.slice(1).reverse();
      return [0, ...rest];
    } else {
      // Range mode
      const startIdx = Math.max(0, Math.min(total - 1, rangeStart - 1));
      const endIdx = Math.max(0, Math.min(total - 1, rangeEnd - 1));
      const actualStart = Math.min(startIdx, endIdx);
      const actualEnd = Math.max(startIdx, endIdx);

      const before = indices.slice(0, actualStart);
      const reversedSection = indices.slice(actualStart, actualEnd + 1).reverse();
      const after = indices.slice(actualEnd + 1);

      return [...before, ...reversedSection, ...after];
    }
  };

  const reversePdf = async () => {
    if (!file) return;

    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const sourcePdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      const newPdf = await PDFDocument.create();

      const pageCount = sourcePdf.getPageCount();
      const targetIndices = getReversedIndices(pageCount);

      const copiedPages = await newPdf.copyPages(sourcePdf, targetIndices);
      copiedPages.forEach((page) => newPdf.addPage(page));

      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      setReversedUrl(URL.createObjectURL(blob));
    } catch (error) {
      console.error('Error reversing PDF:', error);
      alert('An error occurred while reversing the PDF. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setReversedUrl(null);
    setThumbnails([]);
  };

  const totalPages = thumbnails.length;
  const simulatedSequence = totalPages > 0 ? getReversedIndices(totalPages) : [];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold tracking-widest uppercase mb-3 border border-indigo-200 dark:border-indigo-800">
          <ArrowUpDown className="w-3.5 h-3.5" /> Document Flow & Ordering
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-3">
          Reverse PDF Page Order
        </h1>
        <p className="text-base md:text-lg text-gray-600 dark:text-slate-400 max-w-2xl mx-auto">
          Flip the page order of your PDF document back-to-front with visual thumbnail validation. Perfect for duplex scans and reversed prints.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl">
          <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF to Reverse" />
        </div>
      ) : (
        <div className="w-full bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-gray-200 dark:border-slate-800 p-6 md:p-8">
          {!reversedUrl ? (
            <div className="space-y-8">
              {/* Top Info Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-gray-50 dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700">
                <div className="flex items-center gap-4 min-w-0 w-full sm:w-auto">
                  <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{file.name}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {(file.size / 1024 / 1024).toFixed(2)} MB • {totalPages > 0 ? `${totalPages} page(s) loaded` : 'Loading pages...'}
                    </p>
                  </div>
                </div>

                {/* Mode Selector Tabs */}
                <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-gray-200/80 dark:bg-slate-700/80 rounded-xl text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setReverseMode('all')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      reverseMode === 'all'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-gray-600 dark:text-slate-300 hover:text-gray-900'
                    }`}
                  >
                    Reverse All Pages
                  </button>
                  <button
                    type="button"
                    onClick={() => setReverseMode('keepCover')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      reverseMode === 'keepCover'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-gray-600 dark:text-slate-300 hover:text-gray-900'
                    }`}
                  >
                    Keep Cover Page (1)
                  </button>
                  <button
                    type="button"
                    onClick={() => setReverseMode('range')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      reverseMode === 'range'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-gray-600 dark:text-slate-300 hover:text-gray-900'
                    }`}
                  >
                    Custom Range
                  </button>
                </div>
              </div>

              {/* Range Controls (if active) */}
              {reverseMode === 'range' && (
                <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-2xl border border-indigo-200 dark:border-indigo-900/50 flex flex-wrap items-center gap-4 text-xs">
                  <span className="font-bold text-indigo-900 dark:text-indigo-300">Reverse page range:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600 dark:text-slate-400">From page:</span>
                    <input
                      type="number"
                      min={1}
                      max={totalPages || 999}
                      value={rangeStart}
                      onChange={(e) => setRangeStart(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 px-2 py-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg text-center font-bold"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600 dark:text-slate-400">To page:</span>
                    <input
                      type="number"
                      min={1}
                      max={totalPages || 999}
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 px-2 py-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg text-center font-bold"
                    />
                  </div>
                  <span className="text-gray-500 italic">(Other pages will retain their original sequence)</span>
                </div>
              )}

              {/* Visual Thumbnail Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    New Page Sequence Preview
                  </h3>
                  <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">
                    Badges indicate new position in resulting PDF
                  </span>
                </div>

                {isLoadingPages ? (
                  <div className="py-16 flex flex-col items-center justify-center gap-3 text-gray-500 dark:text-slate-400 border border-dashed border-gray-200 dark:border-slate-800 rounded-2xl">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                    <p className="text-sm font-medium">Rendering page thumbnails...</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 max-h-[360px] overflow-y-auto p-3 bg-gray-50 dark:bg-slate-950 rounded-2xl border border-gray-200 dark:border-slate-800">
                    {simulatedSequence.map((origIdx, slotIdx) => {
                      const thumb = thumbnails[origIdx];
                      return (
                        <div
                          key={slotIdx}
                          className="relative group rounded-xl overflow-hidden border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs hover:shadow-md transition-all flex flex-col items-center p-2"
                        >
                          {thumb ? (
                            <img
                              src={thumb.dataUrl}
                              alt={`Page ${origIdx + 1}`}
                              className="w-full h-24 object-contain rounded"
                            />
                          ) : (
                            <div className="w-full h-24 flex items-center justify-center bg-gray-100 dark:bg-slate-800 text-xs text-gray-400">
                              P.{origIdx + 1}
                            </div>
                          )}

                          <div className="mt-2 w-full flex items-center justify-between px-1 text-[11px]">
                            <span className="text-gray-400 font-mono">#{slotIdx + 1}</span>
                            <span className="font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.2 rounded text-[10px]">
                              Was P.{origIdx + 1}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={reversePdf}
                  disabled={isProcessing || isLoadingPages}
                  className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 text-base"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Reversing Document...
                    </>
                  ) : (
                    <>
                      <ArrowUpDown className="w-5 h-5" />
                      Apply Reversal & Download
                    </>
                  )}
                </button>
                <button
                  onClick={resetState}
                  disabled={isProcessing}
                  className="px-6 py-4 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-2xl transition-all text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* Success Screen with Live Preview */
            <div className="space-y-6 text-center py-4">
              <div className="p-8 bg-green-50 dark:bg-green-950/30 rounded-3xl border border-green-200 dark:border-green-800">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-2xl md:text-3xl font-extrabold text-green-900 dark:text-green-200 mb-2">
                  PDF Pages Reversed Successfully!
                </h3>
                <p className="text-green-700 dark:text-green-400 mb-6 text-sm max-w-md mx-auto">
                  Your document sequence has been successfully rearranged according to your chosen flow.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <a
                    href={reversedUrl}
                    download={`reversed_${file.name}`}
                    className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-2xl transition-all shadow-md hover:shadow-lg text-base"
                  >
                    <Download className="w-5 h-5" />
                    Download Reversed PDF
                  </a>
                  <a
                    href={reversedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 font-semibold rounded-2xl border border-gray-300 dark:border-slate-700 transition-all text-sm shadow-xs"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open in New Tab
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowPreview(!showPreview)}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 font-semibold rounded-2xl border border-gray-300 dark:border-slate-700 transition-all text-sm shadow-xs"
                  >
                    <Eye className="w-4 h-4" />
                    {showPreview ? 'Hide Preview' : 'Show Live Preview'}
                  </button>
                </div>

                {showPreview && (
                  <div className="mt-6 text-left">
                    <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                      Reversed Document Preview
                    </p>
                    <div className="w-full h-[550px] rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden bg-gray-100 dark:bg-slate-950 shadow-inner">
                      <iframe
                        src={reversedUrl}
                        title="Reversed PDF Preview"
                        className="w-full h-full border-0"
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={resetState}
                className="text-sm text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white font-semibold"
              >
                ← Reverse another document
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
