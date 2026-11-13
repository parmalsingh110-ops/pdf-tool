import { useState, useEffect } from 'react';
import { Download, FileText, ArrowUpDown, CheckCircle2, ExternalLink, Eye, Loader2, Sparkles } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import FileDropzone from '../components/FileDropzone';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { toArrayBufferBytes } from '../lib/blobUrl';
import { useToast } from '../components/Toast';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

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
  const [pageCount, setPageCount] = useState<number>(0);
  const [reversedUrl, setReversedUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  const toast = useToast();
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    return () => {
      if (reversedUrl) URL.revokeObjectURL(reversedUrl);
    };
  }, [reversedUrl]);

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
      setPageCount(count);

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
      toast.error('Could not render document thumbnails. You can still proceed with reversing.');
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
      const blob = new Blob([toArrayBufferBytes(pdfBytes)], { type: 'application/pdf' });
      if (reversedUrl) URL.revokeObjectURL(reversedUrl);
      setReversedUrl(URL.createObjectURL(blob));
      toast.success('PDF page order reversed successfully!');
    } catch (error) {
      console.error('Error reversing PDF:', error);
      toast.error('An error occurred while reversing the PDF. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setReversedUrl(null);
    setThumbnails([]);
    setPageCount(0);
  };

  const totalPages = pageCount || thumbnails.length;
  const simulatedSequence = totalPages > 0 ? getReversedIndices(totalPages) : [];

  return (
    <ToolWorkspaceShell
      title="Reverse PDF Page Order"
      subtitle="Flip the page order of your PDF document back-to-front with visual thumbnail validation. Perfect for duplex scans and reversed prints."
      categoryLabel="Document Flow & Ordering"
      icon={ArrowUpDown}
      microVariant="split"
      tone="indigo"
    >
      <div className="flex flex-col items-center justify-center max-w-6xl mx-auto w-full">
        <PearlStageSwitch stageKey={!file ? 'upload' : 'workspace'} className="w-full">
          {!file ? (
            <div className="w-full max-w-2xl mx-auto">
              <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF to Reverse" />
            </div>
          ) : (
            <div className="w-full pms-glass-panel rounded-3xl p-6 md:p-8 relative overflow-hidden">
              <PearlScanOverlay
                active={isProcessing || isLoadingPages}
                label={isLoadingPages ? 'Rendering page thumbnails...' : 'Reversing document page order...'}
              />

              <PearlStageSwitch stageKey={!reversedUrl ? 'configure' : 'result'}>
                {!reversedUrl ? (
                  <div className="space-y-8">
                    {/* Top Info Bar */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)]">
                      <div className="flex items-center gap-4 min-w-0 w-full sm:w-auto">
                        <div className="w-12 h-12 bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] border border-[var(--pms-border)] rounded-xl flex items-center justify-center shrink-0">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{file.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {(file.size / 1024 / 1024).toFixed(2)} MB •{' '}
                            {totalPages > 0 ? (
                              <>
                                <AnimatedNumber value={totalPages} /> page(s) loaded
                              </>
                            ) : (
                              'Loading pages...'
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Mode Selector Tabs */}
                      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-white/70 dark:bg-slate-950/60 border border-[var(--pms-border)] rounded-2xl text-xs font-bold">
                        {[
                          { id: 'all' as const, label: 'Reverse All Pages' },
                          { id: 'keepCover' as const, label: 'Keep Cover Page (1)' },
                          { id: 'range' as const, label: 'Custom Range' },
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setReverseMode(tab.id)}
                            className={`relative px-3.5 py-2 rounded-xl transition-colors ${
                              reverseMode === tab.id
                                ? 'text-white'
                                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            {reverseMode === tab.id && (
                              <motion.span
                                layoutId="reverse-mode-pill"
                                transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30 }}
                                className="pms-btn-primary absolute inset-0 rounded-xl"
                              />
                            )}
                            <span className="relative z-10">{tab.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Range Controls (if active) */}
                    {reverseMode === 'range' && (
                      <div className="p-4 bg-[var(--pms-soft-lavender)] rounded-2xl border border-[var(--pms-border-strong)] flex flex-wrap items-center gap-4 text-xs">
                        <span className="font-bold text-slate-900 dark:text-indigo-200">Reverse page range:</span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-600 dark:text-slate-400">From page:</span>
                          <input
                            type="number"
                            min={1}
                            max={totalPages || 999}
                            value={rangeStart}
                            onChange={(e) => setRangeStart(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-16 px-2 py-1 bg-white/85 dark:bg-slate-800/85 border border-[var(--pms-border)] rounded-lg text-center font-bold"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-600 dark:text-slate-400">To page:</span>
                          <input
                            type="number"
                            min={1}
                            max={totalPages || 999}
                            value={rangeEnd}
                            onChange={(e) => setRangeEnd(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-16 px-2 py-1 bg-white/85 dark:bg-slate-800/85 border border-[var(--pms-border)] rounded-lg text-center font-bold"
                          />
                        </div>
                        <span className="text-slate-500 dark:text-slate-400 italic">(Other pages will retain their original sequence)</span>
                      </div>
                    )}

                    {/* Visual Thumbnail Grid */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-[var(--pms-violet)]" />
                          New Page Sequence Preview
                        </h3>
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          Badges indicate new position in resulting PDF
                        </span>
                      </div>

                      {isLoadingPages ? (
                        <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400 border border-dashed border-[var(--pms-border)] bg-white/50 dark:bg-slate-900/40 rounded-2xl">
                          <Loader2 className="w-8 h-8 animate-spin text-[var(--pms-violet)]" />
                          <p className="text-sm font-medium">Rendering page thumbnails...</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 max-h-[360px] overflow-y-auto p-3 bg-white/60 dark:bg-slate-950/60 rounded-2xl border border-[var(--pms-border)]">
                          {simulatedSequence.map((origIdx, slotIdx) => {
                            const thumb = thumbnails[origIdx];
                            return (
                              <div
                                key={slotIdx}
                                className="relative group rounded-xl overflow-hidden border border-[var(--pms-border)] bg-white/85 dark:bg-slate-900/85 shadow-2xs hover:shadow-md hover:border-[var(--pms-border-strong)] transition-all flex flex-col items-center p-2"
                              >
                                <div className="w-full h-24 bg-white rounded-lg border border-slate-200/80 flex items-center justify-center overflow-hidden">
                                  {thumb ? (
                                    <img
                                      src={thumb.dataUrl}
                                      alt={`Page ${origIdx + 1}`}
                                      className="w-full h-full object-contain"
                                    />
                                  ) : (
                                    <span className="text-xs text-slate-400 font-medium">P.{origIdx + 1}</span>
                                  )}
                                </div>

                                <div className="mt-2 w-full flex items-center justify-between px-1 text-[11px]">
                                  <span className="text-slate-400 font-mono">#{slotIdx + 1}</span>
                                  <span className="font-bold text-[var(--pms-violet)] bg-[var(--pms-soft-lavender)] px-1.5 py-0.5 rounded text-[10px]">
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
                      <motion.button
                        whileHover={prefersReduced ? undefined : { scale: 1.01 }}
                        whileTap={prefersReduced ? undefined : { scale: 0.99 }}
                        onClick={reversePdf}
                        disabled={isProcessing || isLoadingPages}
                        className="pms-btn-primary relative overflow-hidden flex-1 py-4 text-white font-bold rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2 text-base"
                      >
                        <span className="pms-shimmer" aria-hidden="true" />
                        {isProcessing ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin relative z-10" />
                            <span className="relative z-10">Reversing Document...</span>
                          </>
                        ) : (
                          <>
                            <ArrowUpDown className="w-5 h-5 relative z-10" />
                            <span className="relative z-10">Apply Reversal & Download</span>
                          </>
                        )}
                      </motion.button>
                      <button
                        onClick={resetState}
                        disabled={isProcessing}
                        className="px-6 py-4 bg-white/80 hover:bg-white dark:bg-slate-900/80 dark:hover:bg-slate-800 border border-[var(--pms-border)] text-slate-700 dark:text-slate-300 font-semibold rounded-2xl transition-all text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Success Screen with Live Preview */
                  <div className="space-y-6 text-center py-4">
                    <div className="p-8 bg-gradient-to-br from-emerald-50/90 via-white/85 to-teal-50/80 dark:from-emerald-950/45 dark:via-slate-900/85 dark:to-teal-950/35 rounded-3xl border border-emerald-200/80 dark:border-emerald-800/70 backdrop-blur-md shadow-lg">
                      <motion.div
                        initial={prefersReduced ? false : { scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 18 }}
                        className="w-16 h-16 bg-emerald-100/90 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm"
                      >
                        <CheckCircle2 className="w-8 h-8" />
                      </motion.div>
                      <h3 className="text-2xl md:text-3xl font-extrabold text-emerald-950 dark:text-emerald-100 mb-2">
                        PDF Pages Reversed Successfully!
                      </h3>
                      <p className="text-emerald-700 dark:text-emerald-300 mb-6 text-sm max-w-md mx-auto">
                        All <AnimatedNumber value={totalPages} /> pages have been rearranged according to your chosen flow.
                      </p>

                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <motion.a
                          whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                          whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                          href={reversedUrl}
                          download={`reversed_${file.name}`}
                          className="pms-btn-primary relative overflow-hidden inline-flex items-center justify-center gap-2 px-8 py-3.5 text-white font-bold rounded-2xl text-base"
                        >
                          <span className="pms-shimmer" aria-hidden="true" />
                          <Download className="w-5 h-5 relative z-10" />
                          <span className="relative z-10">Download Reversed PDF</span>
                        </motion.a>
                        <a
                          href={reversedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white/85 dark:bg-slate-800/85 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold rounded-2xl border border-[var(--pms-border)] transition-all text-sm shadow-xs"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Open in New Tab
                        </a>
                        <button
                          type="button"
                          onClick={() => setShowPreview(!showPreview)}
                          className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white/85 dark:bg-slate-800/85 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold rounded-2xl border border-[var(--pms-border)] transition-all text-sm shadow-xs"
                        >
                          <Eye className="w-4 h-4" />
                          {showPreview ? 'Hide Preview' : 'Show Live Preview'}
                        </button>
                      </div>

                      {showPreview && (
                        <div className="mt-6 text-left">
                          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                            Reversed Document Preview
                          </p>
                          <div className="w-full h-[550px] rounded-2xl border border-[var(--pms-border)] overflow-hidden bg-white dark:bg-slate-950 shadow-inner">
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
                      className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold"
                    >
                      ← Reverse another document
                    </button>
                  </div>
                )}
              </PearlStageSwitch>
            </div>
          )}
        </PearlStageSwitch>
      </div>
    </ToolWorkspaceShell>
  );
}
