import React, { useState } from 'react';
import { FileText, Download, Loader2, Check, ExternalLink, Eye, CheckCircle2, Sparkles, Filter, Archive, Layers } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

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
      alert(e?.message || 'Failed to load PDF thumbnails.');
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
      alert(`No valid pages found in range "${rangeInput}". Document has ${total} pages.`);
    }
  };

  const extract = async () => {
    if (!file) return;
    const selectedPages = pages.filter((p) => p.selected);
    if (selectedPages.length === 0) {
      alert('Please select at least one page to extract.');
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
        const blob = new Blob([bytes as any], { type: 'application/pdf' });
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
    } catch (e: any) {
      console.error('Extraction failed:', e);
      alert(e?.message || 'Extraction failed. Please try again.');
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
    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 text-xs font-bold tracking-widest uppercase mb-3 border border-violet-200 dark:border-violet-800">
          <Layers className="w-3.5 h-3.5" /> Visual Page Extraction
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-3">
          Extract Pages from PDF
        </h1>
        <p className="text-base md:text-lg text-gray-600 dark:text-slate-400 max-w-2xl mx-auto">
          Visually select pages, enter page ranges, or filter odd/even pages. Export as a single combined PDF or separate individual files.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl">
          <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF to Extract Pages" />
        </div>
      ) : loadingThumbs ? (
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl p-12 border border-gray-200 dark:border-slate-800 text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-violet-600 mx-auto" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Generating Page Thumbnails...</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400">Loading document structure for visual selection</p>
        </div>
      ) : !resultUrl ? (
        <div className="w-full bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-gray-200 dark:border-slate-800 p-6 md:p-8 space-y-6">
          {/* Top Bar: File Details & Export Mode */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700">
            <div className="flex items-center gap-3 min-w-0 w-full md:w-auto">
              <div className="w-10 h-10 bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{file.name}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  {pages.length} total pages • <span className="text-violet-600 dark:text-violet-400 font-bold">{selectedCount} selected</span>
                </p>
              </div>
            </div>

            {/* Export Mode Toggle */}
            <div className="flex items-center gap-1.5 p-1 bg-gray-200/80 dark:bg-slate-700/80 rounded-xl text-xs font-bold w-full md:w-auto justify-center">
              <button
                type="button"
                onClick={() => setExportMode('single')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  exportMode === 'single'
                    ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-xs'
                    : 'text-gray-600 dark:text-slate-300 hover:text-gray-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> Single Combined PDF
              </button>
              <button
                type="button"
                onClick={() => setExportMode('zip')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  exportMode === 'zip'
                    ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-xs'
                    : 'text-gray-600 dark:text-slate-300 hover:text-gray-900'
                }`}
              >
                <Archive className="w-3.5 h-3.5" /> Separate Files (ZIP)
              </button>
            </div>
          </div>

          {/* Quick Selection Toolbar */}
          <div className="p-4 bg-violet-50/50 dark:bg-violet-950/20 rounded-2xl border border-violet-100 dark:border-violet-900/40 flex flex-wrap items-center justify-between gap-4">
            {/* Quick Action Chips */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1 mr-1">
                <Filter className="w-3 h-3 text-violet-500" /> Filter:
              </span>
              <button
                type="button"
                onClick={selectAll}
                className="px-2.5 py-1 text-xs font-semibold bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border border-gray-200 dark:border-slate-700 rounded-lg hover:border-violet-400"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={deselectAll}
                className="px-2.5 py-1 text-xs font-semibold bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border border-gray-200 dark:border-slate-700 rounded-lg hover:border-violet-400"
              >
                Deselect All
              </button>
              <button
                type="button"
                onClick={selectOdd}
                className="px-2.5 py-1 text-xs font-semibold bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border border-gray-200 dark:border-slate-700 rounded-lg hover:border-violet-400"
              >
                Odd Pages
              </button>
              <button
                type="button"
                onClick={selectEven}
                className="px-2.5 py-1 text-xs font-semibold bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border border-gray-200 dark:border-slate-700 rounded-lg hover:border-violet-400"
              >
                Even Pages
              </button>
              <button
                type="button"
                onClick={invertSelection}
                className="px-2.5 py-1 text-xs font-semibold bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border border-gray-200 dark:border-slate-700 rounded-lg hover:border-violet-400"
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
                className="px-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg w-36 font-mono focus:outline-hidden focus:border-violet-500"
              />
              <button
                type="button"
                onClick={applyRangeString}
                className="px-3 py-1.5 text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors shrink-0"
              >
                Apply Range
              </button>
            </div>
          </div>

          {/* Visual Thumbnails Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 max-h-[440px] overflow-y-auto p-4 bg-gray-50 dark:bg-slate-950 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-inner">
            {pages.map((pg, i) => (
              <button
                key={pg.index}
                type="button"
                onClick={() => togglePage(i)}
                className={`group relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer flex flex-col p-1.5 bg-white dark:bg-slate-900 text-left ${
                  pg.selected
                    ? 'border-violet-600 ring-2 ring-violet-200 dark:ring-violet-900 shadow-md scale-[1.02]'
                    : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700 opacity-70 hover:opacity-100'
                }`}
              >
                <div className="relative aspect-[3/4] w-full overflow-hidden rounded bg-gray-100 dark:bg-slate-800 flex items-center justify-center">
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
                        : 'bg-white/80 dark:bg-slate-800/80 border border-gray-300 dark:border-slate-600 text-transparent'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                </div>

                <div className="mt-1.5 flex items-center justify-between text-[11px] px-1">
                  <span className="font-bold text-gray-700 dark:text-slate-300">Page {pg.index}</span>
                  {pg.selected && (
                    <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase">
                      Selected
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Action Footer */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={extract}
              disabled={busy || selectedCount === 0}
              className="flex-1 py-4 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-2xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 text-base"
            >
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
            </button>
            <button
              onClick={resetAll}
              disabled={busy}
              className="px-6 py-4 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-2xl transition-all text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* Success Screen */
        <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-gray-200 dark:border-slate-800 p-8 text-center space-y-6">
          <div className="p-8 bg-green-50 dark:bg-green-950/30 rounded-3xl border border-green-200 dark:border-green-800">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-2xl md:text-3xl font-extrabold text-green-900 dark:text-green-200 mb-2">
              Extracted {selectedCount} Page(s) Successfully!
            </h3>
            <p className="text-green-700 dark:text-green-400 mb-6 text-sm max-w-md mx-auto">
              {resultIsZip
                ? 'Your selected pages have been packaged into individual PDF files inside a compressed ZIP archive.'
                : 'Your selected pages have been combined into a new clean PDF document.'}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href={resultUrl}
                download={
                  resultIsZip
                    ? `extracted_${file.name.replace(/\.[^/.]+$/, '')}_pages.zip`
                    : `extracted_${file.name}`
                }
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-2xl transition-all shadow-md hover:shadow-lg text-base"
              >
                <Download className="w-5 h-5" />
                {resultIsZip ? 'Download Pages (ZIP)' : 'Download Extracted PDF'}
              </a>

              {!resultIsZip && (
                <>
                  <a
                    href={resultUrl}
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
                </>
              )}
            </div>

            {!resultIsZip && showPreview && (
              <div className="mt-6 text-left">
                <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Extracted PDF Document Preview
                </p>
                <div className="w-full h-[550px] rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden bg-gray-100 dark:bg-slate-950 shadow-inner">
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
    </div>
  );
}
