import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { FileText, Download, Loader2, Check, ExternalLink, Eye, CheckCircle2, Filter, Archive, Layers } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { useToast } from '../components/Toast';
import { toArrayBufferBytes } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

interface PageThumb {
  index: number; // 1-based
  url: string;
  selected: boolean;
}

export default function ExtractPages() {
  useSEO(
    'Extract Pages from PDF Online Free — Single PDF or Separate Files | PDF Media Suite',
    'Free online tool to visually extract specific pages from PDF documents. Extract to a combined PDF or download separate pages as ZIP. Range selection & odd/even filters.'
  );

  usePageSEO(
    'Extract Pages from PDF — Smart Visual Selector',
    'Select and extract PDF pages using visual thumbnails, range parser (e.g. 1-4, 7), and odd/even filters. Download as a single combined PDF or separate ZIP.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageThumb[]>([]);
  const [rangeInput, setRangeInput] = useState('');
  const [exportMode, setExportMode] = useState<'single' | 'zip'>('single');

  const [loadingThumbs, setLoadingThumbs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');

  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultIsZip, setResultIsZip] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  const toast = useToast();
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    const selectedFile = files[0];
    setFile(selectedFile);
    setResultUrl(null);
    setLoadingThumbs(true);
    setPages([]);
    setRangeInput('');

    try {
      const buf = await selectedFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const thumbs: PageThumb[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 0.35 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, vp.width, vp.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;
        thumbs.push({ index: i, url: canvas.toDataURL('image/jpeg', 0.8), selected: false });
        canvas.width = 0;
        canvas.height = 0;
      }
      setPages(thumbs);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load PDF thumbnails.');
    } finally {
      setLoadingThumbs(false);
    }
  };

  const togglePage = (idx: number) => {
    setPages((prev) =>
      prev.map((pg, i) => (i === idx ? { ...pg, selected: !pg.selected } : pg))
    );
  };

  const selectAll = () => setPages((p) => p.map((pg) => ({ ...pg, selected: true })));
  const deselectAll = () => setPages((p) => p.map((pg) => ({ ...pg, selected: false })));

  const selectOdd = () =>
    setPages((p) => p.map((pg) => ({ ...pg, selected: pg.index % 2 !== 0 })));

  const selectEven = () =>
    setPages((p) => p.map((pg) => ({ ...pg, selected: pg.index % 2 === 0 })));

  const invertSelection = () =>
    setPages((p) => p.map((pg) => ({ ...pg, selected: !pg.selected })));

  // Parse string like "1-3, 5, 8-10" and select those pages
  const applyRangeString = () => {
    if (!rangeInput.trim()) return;
    const total = pages.length;
    const selectedIndices = new Set<number>();

    const parts = rangeInput.split(',').map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          const min = Math.max(1, Math.min(start, end));
          const max = Math.min(total, Math.max(start, end));
          for (let i = min; i <= max; i++) {
            selectedIndices.add(i);
          }
        }
      } else {
        const num = parseInt(part, 10);
        if (!isNaN(num) && num >= 1 && num <= total) {
          selectedIndices.add(num);
        }
      }
    }

    if (selectedIndices.size > 0) {
      setPages((p) => p.map((pg) => ({ ...pg, selected: selectedIndices.has(pg.index) })));
    } else {
      toast.error(`No valid pages found in range "${rangeInput}". Document has ${total} pages.`);
    }
  };

  const extract = async () => {
    if (!file) return;
    const selectedPages = pages.filter((p) => p.selected);
    if (selectedPages.length === 0) {
      toast.error('Please select at least one page to extract.');
      return;
    }

    setBusy(true);
    setProgressMsg('Extracting selected pages...');

    try {
      const buf = await file.arrayBuffer();
      const srcDoc = await PDFDocument.load(buf, { ignoreEncryption: true });

      if (exportMode === 'single') {
        // Mode A: Single combined PDF
        const newDoc = await PDFDocument.create();
        const selectedIndices = selectedPages.map((p) => p.index - 1);
        const copied = await newDoc.copyPages(srcDoc, selectedIndices);
        copied.forEach((p) => newDoc.addPage(p));
        const bytes = await newDoc.save();
        const blob = new Blob([toArrayBufferBytes(bytes)], { type: 'application/pdf' });
        setResultUrl(URL.createObjectURL(blob));
        setResultIsZip(false);
      } else {
        // Mode B: Export each page as individual PDF in a ZIP archive
        setProgressMsg('Generating separate PDF files for ZIP...');
        const zip = new JSZip();
        const baseName = file.name.replace(/\.[^/.]+$/, '');

        for (let i = 0; i < selectedPages.length; i++) {
          const pg = selectedPages[i];
          setProgressMsg(`Packaging page ${pg.index} (${i + 1}/${selectedPages.length})...`);

          const singleDoc = await PDFDocument.create();
          const [copiedPage] = await singleDoc.copyPages(srcDoc, [pg.index - 1]);
          singleDoc.addPage(copiedPage);

          const bytes = await singleDoc.save();
          zip.file(`${baseName}_page_${pg.index}.pdf`, bytes);
        }

        setProgressMsg('Compressing ZIP archive...');
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        setResultUrl(URL.createObjectURL(zipBlob));
        setResultIsZip(true);
      }
      toast.success(`Successfully extracted ${selectedPages.length} page(s)!`);
    } catch (e: any) {
      console.error('Extraction failed:', e);
      toast.error(e?.message || 'Extraction failed. Please try again.');
    } finally {
      setBusy(false);
      setProgressMsg('');
    }
  };

  const resetAll = () => {
    setFile(null);
    setPages([]);
    setResultUrl(null);
    setRangeInput('');
    setResultIsZip(false);
  };

  const selectedCount = pages.filter((p) => p.selected).length;

  return (
    <ToolWorkspaceShell
      title="Extract Pages from PDF"
      subtitle="Visually select pages, enter page ranges, or filter odd/even pages. Export as a single combined PDF or separate individual files."
      categoryLabel="Visual Page Extraction"
      icon={Layers}
      microVariant="split"
      tone="violet"
    >
      <div className="flex flex-col items-center w-full">

      <PearlStageSwitch
        stageKey={!file ? 'upload' : loadingThumbs ? 'loading' : !resultUrl ? 'configure' : 'result'}
        className="w-full max-w-6xl"
      >
      {!file ? (
        <div className="w-full max-w-2xl mx-auto">
          <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF to Extract Pages" />
        </div>
      ) : loadingThumbs ? (
        <div className="relative overflow-hidden w-full max-w-2xl mx-auto pms-glass-panel rounded-3xl p-12 text-center space-y-4">
          <PearlScanOverlay active label="Generating interactive page thumbnails..." />
          <Loader2 className="w-10 h-10 animate-spin text-[var(--pms-violet)] mx-auto" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Generating Page Thumbnails...</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400">Loading document structure for visual selection</p>
        </div>
      ) : !resultUrl ? (
        <div className="relative overflow-hidden w-full pms-glass-panel rounded-3xl p-6 md:p-8 space-y-6">
          <PearlScanOverlay active={busy} label={progressMsg || 'Extracting selected pages...'} />
          {/* Top Bar: File Details & Export Mode */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)]">
            <div className="flex items-center gap-3 min-w-0 w-full md:w-auto">
              <div className="w-10 h-10 bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] border border-[var(--pms-border)] rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{file.name}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 tabular-nums">
                  {pages.length} total pages • <span className="text-[var(--pms-violet)] font-bold">{selectedCount} selected</span>
                </p>
              </div>
            </div>

            {/* Export Mode Toggle */}
            <div className="flex items-center gap-1 p-1 bg-white/80 dark:bg-slate-800/80 border border-[var(--pms-border)] rounded-xl text-xs font-bold w-full md:w-auto justify-center">
              <button
                type="button"
                onClick={() => setExportMode('single')}
                className={`relative overflow-hidden px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                  exportMode === 'single'
                    ? 'text-purple-900 dark:text-purple-100'
                    : 'text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {exportMode === 'single' && (
                  <motion.span
                    layoutId="extract-export-pill"
                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    className="absolute inset-0 bg-[var(--pms-soft-lavender)] rounded-lg pointer-events-none"
                  />
                )}
                <Layers className="relative z-10 w-3.5 h-3.5" />
                <span className="relative z-10">Single Combined PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setExportMode('zip')}
                className={`relative overflow-hidden px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                  exportMode === 'zip'
                    ? 'text-purple-900 dark:text-purple-100'
                    : 'text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {exportMode === 'zip' && (
                  <motion.span
                    layoutId="extract-export-pill"
                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    className="absolute inset-0 bg-[var(--pms-soft-lavender)] rounded-lg pointer-events-none"
                  />
                )}
                <Archive className="relative z-10 w-3.5 h-3.5" />
                <span className="relative z-10">Separate Files (ZIP)</span>
              </button>
            </div>
          </div>

          {/* Quick Selection Toolbar */}
          <div className="p-4 bg-[var(--pms-soft-lavender)] rounded-2xl border border-[var(--pms-border)] flex flex-wrap items-center justify-between gap-4">
            {/* Quick Action Chips */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-gray-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1 mr-1">
                <Filter className="w-3 h-3 text-[var(--pms-violet)]" /> Filter:
              </span>
              <button
                type="button"
                onClick={selectAll}
                className="px-2.5 py-1 text-xs font-semibold bg-white/85 dark:bg-slate-800/85 text-gray-700 dark:text-slate-200 border border-[var(--pms-border)] rounded-lg hover:border-[var(--pms-violet)] transition-colors"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={deselectAll}
                className="px-2.5 py-1 text-xs font-semibold bg-white/85 dark:bg-slate-800/85 text-gray-700 dark:text-slate-200 border border-[var(--pms-border)] rounded-lg hover:border-[var(--pms-violet)] transition-colors"
              >
                Deselect All
              </button>
              <button
                type="button"
                onClick={selectOdd}
                className="px-2.5 py-1 text-xs font-semibold bg-white/85 dark:bg-slate-800/85 text-gray-700 dark:text-slate-200 border border-[var(--pms-border)] rounded-lg hover:border-[var(--pms-violet)] transition-colors"
              >
                Odd Pages
              </button>
              <button
                type="button"
                onClick={selectEven}
                className="px-2.5 py-1 text-xs font-semibold bg-white/85 dark:bg-slate-800/85 text-gray-700 dark:text-slate-200 border border-[var(--pms-border)] rounded-lg hover:border-[var(--pms-violet)] transition-colors"
              >
                Even Pages
              </button>
              <button
                type="button"
                onClick={invertSelection}
                className="px-2.5 py-1 text-xs font-semibold bg-white/85 dark:bg-slate-800/85 text-gray-700 dark:text-slate-200 border border-[var(--pms-border)] rounded-lg hover:border-[var(--pms-violet)] transition-colors"
              >
                Invert
              </button>
            </div>

            {/* Smart Range Input */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="e.g. 1-3, 5, 8-10"
                value={rangeInput}
                onChange={(e) => setRangeInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyRangeString(); }}
                className="px-3 py-1.5 text-xs bg-white/90 dark:bg-slate-800/90 border border-[var(--pms-border)] rounded-lg w-36 font-mono focus:outline-hidden focus:border-[var(--pms-violet)]"
              />
              <button
                type="button"
                onClick={applyRangeString}
                className="px-3 py-1.5 text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors shrink-0 shadow-xs"
              >
                Apply Range
              </button>
            </div>
          </div>

          {/* Visual Thumbnails Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 max-h-[440px] overflow-y-auto p-4 bg-white/55 dark:bg-slate-950/60 rounded-2xl border border-[var(--pms-border)] shadow-inner">
            {pages.map((pg, i) => (
              <button
                key={pg.index}
                type="button"
                onClick={() => togglePage(i)}
                className={`group relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer flex flex-col p-1.5 bg-white/85 dark:bg-slate-900/85 text-left ${
                  pg.selected
                    ? 'border-[var(--pms-violet)] ring-2 ring-purple-200/70 dark:ring-purple-900 shadow-md scale-[1.02]'
                    : 'border-[var(--pms-border)] hover:border-[var(--pms-border-strong)] opacity-75 hover:opacity-100'
                }`}
              >
                <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-white border border-gray-200 flex items-center justify-center">
                  <img
                    src={pg.url}
                    alt={`Page ${pg.index}`}
                    className="w-full h-full object-contain"
                  />

                  {/* Checkbox indicator */}
                  <div
                    className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                      pg.selected
                        ? 'bg-violet-600 text-white shadow-xs'
                        : 'bg-white/90 dark:bg-slate-800/80 border border-gray-300 dark:border-slate-600 text-transparent'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                </div>

                <div className="mt-1.5 flex items-center justify-between text-[11px] px-1">
                  <span className="font-bold text-gray-700 dark:text-slate-300">Page {pg.index}</span>
                  {pg.selected && (
                    <span className="text-[10px] font-bold text-[var(--pms-violet)] uppercase">
                      Selected
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Action Footer */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <motion.button
              whileHover={prefersReduced || busy || selectedCount === 0 ? undefined : { scale: 1.01 }}
              whileTap={prefersReduced || busy || selectedCount === 0 ? undefined : { scale: 0.99 }}
              onClick={extract}
              disabled={busy || selectedCount === 0}
              className="pms-btn-primary relative overflow-hidden flex-1 py-4 font-bold rounded-2xl shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 text-base"
            >
              <span className="pms-shimmer pointer-events-none" />
              {busy ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {progressMsg || 'Processing...'}
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  {exportMode === 'single'
                    ? `Extract ${selectedCount} Page(s) as Single PDF`
                    : `Extract ${selectedCount} Page(s) as ZIP Archive`}
                </>
              )}
            </motion.button>
            <button
              onClick={resetAll}
              disabled={busy}
              className="px-6 py-4 bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 border border-[var(--pms-border)] text-gray-700 dark:text-slate-200 font-semibold rounded-2xl transition-all text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* Success Screen */
        <div className="w-full max-w-4xl mx-auto pms-glass-panel rounded-3xl p-8 text-center space-y-6">
          <div className="p-8 rounded-3xl bg-gradient-to-br from-emerald-500/12 via-white/75 to-teal-500/12 dark:from-emerald-950/50 dark:via-slate-900/80 dark:to-teal-950/40 border border-emerald-200/80 dark:border-emerald-800/60">
            <motion.div
              initial={prefersReduced ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 24 }}
              className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/25"
            >
              <CheckCircle2 className="w-8 h-8" />
            </motion.div>
            <h3 className="text-2xl md:text-3xl font-extrabold text-gray-900 dark:text-white mb-2 tabular-nums">
              Extracted <AnimatedNumber value={selectedCount} /> Page(s) Successfully!
            </h3>
            <p className="text-gray-600 dark:text-slate-300 mb-6 text-sm max-w-md mx-auto">
              {resultIsZip
                ? 'Your selected pages have been packaged into individual PDF files inside a compressed ZIP archive.'
                : 'Your selected pages have been combined into a new clean PDF document.'}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <motion.a
                whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                href={resultUrl}
                download={
                  resultIsZip
                    ? `extracted_${file.name.replace(/\.[^/.]+$/, '')}_pages.zip`
                    : `extracted_${file.name}`
                }
                className="pms-btn-primary relative overflow-hidden inline-flex items-center justify-center gap-2 px-8 py-3.5 font-bold rounded-2xl shadow-md hover:shadow-lg text-base"
              >
                <span className="pms-shimmer pointer-events-none" />
                <Download className="w-5 h-5" />
                {resultIsZip ? 'Download Pages (ZIP)' : 'Download Extracted PDF'}
              </motion.a>

              {!resultIsZip && (
                <>
                  <a
                    href={resultUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white/85 dark:bg-slate-800/85 hover:bg-white dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 font-semibold rounded-2xl border border-[var(--pms-border)] transition-all text-sm shadow-xs"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open in New Tab
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowPreview(!showPreview)}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white/85 dark:bg-slate-800/85 hover:bg-white dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 font-semibold rounded-2xl border border-[var(--pms-border)] transition-all text-sm shadow-xs"
                  >
                    <Eye className="w-4 h-4" />
                    {showPreview ? 'Hide Preview' : 'Show Live Preview'}
                  </button>
                </>
              )}
            </div>

            {!resultIsZip && showPreview && (
              <div className="mt-6 text-left">
                <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Extracted PDF Document Preview
                </p>
                <div className="w-full h-[550px] rounded-2xl border border-[var(--pms-border)] overflow-hidden bg-white dark:bg-slate-950 shadow-inner">
                  <iframe
                    src={resultUrl}
                    title="Extracted PDF Preview"
                    className="w-full h-full border-0"
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={resetAll}
            className="text-sm text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white font-semibold"
          >
            ← Extract from another document
          </button>
        </div>
      )}
      </PearlStageSwitch>
      </div>
    </ToolWorkspaceShell>
  );
}
