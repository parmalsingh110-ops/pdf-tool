import React, { useState, useEffect } from 'react';
import { Download, FileText, CheckCircle2, Eye, Loader2, Sparkles, FlipHorizontal, FlipVertical, RefreshCw, Layers } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolSEOSection from '../components/ToolSEOSection';

interface PagePreview {
  pageNum: number;
  dataUrl: string;
}

export default function FlipPDF() {
  useSEO(
    'Flip PDF Online Free — Mirror Pages Horizontally or Vertically | PDF Media Suite',
    'Mirror PDF pages horizontally or vertically online free. Ideal for iron-on T-shirt heat transfers, transparencies, blueprints, and inverted scans.'
  );

  usePageSEO(
    'Flip PDF — Mirror Pages Horizontally or Vertically',
    'Reflect and mirror PDF documents across the horizontal or vertical axis. Vector-perfect page flipping for transfer paper, printing transparencies, and mirrored documents.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [pageCount, setPageCount] = useState(0);

  // Settings
  const [flipMode, setFlipMode] = useState<'horizontal' | 'vertical' | 'both'>('horizontal');
  const [pageSelection, setPageSelection] = useState<'all' | 'custom'>('all');
  const [customRange, setCustomRange] = useState('');

  // Live preview
  const [previewPageNum, setPreviewPageNum] = useState<number>(1);
  const [previewOriginal, setPreviewOriginal] = useState<string | null>(null);

  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState('');

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
    } catch (e: any) {
      alert('Could not open PDF: ' + (e?.message || 'Invalid file'));
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
      const maxW = 400;
      const scale = Math.min(1.5, maxW / vp.width);
      const scaledVp = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = scaledVp.width;
      canvas.height = scaledVp.height;
      const ctx = canvas.getContext('2d')!;

      await page.render({ canvasContext: ctx, viewport: scaledVp, canvas }).promise;
      setPreviewOriginal(canvas.toDataURL('image/jpeg', 0.85));
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    } catch (err) {
      console.error('Preview error:', err);
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

  const processFlip = async () => {
    if (!file) return;
    setBusy(true);

    try {
      const ab = await file.arrayBuffer();
      const srcDoc = await PDFDocument.load(ab);
      const outDoc = await PDFDocument.create();
      const total = srcDoc.getPageCount();

      const pagesToFlip = new Set<number>(
        pageSelection === 'all'
          ? Array.from({ length: total }, (_, i) => i + 1)
          : parseRanges(customRange, total)
      );

      for (let i = 0; i < total; i++) {
        const pageNum = i + 1;
        const [embedded] = await outDoc.embedPages([srcDoc.getPage(i)]);
        const srcPage = srcDoc.getPage(i);
        const { width, height } = srcPage.getSize();

        const newPage = outDoc.addPage([width, height]);

        if (!pagesToFlip.has(pageNum)) {
          newPage.drawPage(embedded, { x: 0, y: 0, width, height });
          continue;
        }

        // Apply mirror matrix via drawPage
        if (flipMode === 'horizontal') {
          // Flip horizontally: x goes from width to 0, xScale = -1
          newPage.drawPage(embedded, {
            x: width,
            y: 0,
            xScale: -1,
            yScale: 1,
          });
        } else if (flipMode === 'vertical') {
          // Flip vertically: y goes from height to 0, yScale = -1
          newPage.drawPage(embedded, {
            x: 0,
            y: height,
            xScale: 1,
            yScale: -1,
          });
        } else {
          // Both (horizontal and vertical)
          newPage.drawPage(embedded, {
            x: width,
            y: height,
            xScale: -1,
            yScale: -1,
          });
        }
      }

      const outBytes = await outDoc.save();
      const blob = new Blob([outBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultName(`${file.name.replace(/\.pdf$/i, '')}_flipped_${flipMode}.pdf`);
    } catch (e: any) {
      console.error('Flip error:', e);
      alert('Error flipping PDF: ' + (e?.message || 'Unknown error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 transition-colors">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-sm font-semibold mb-3">
            <FlipHorizontal className="w-4 h-4" /> Mirror & Transfer Preparation Tool
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
            Flip PDF (Mirror Pages)
          </h1>
          <p className="text-base md:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Mirror PDF pages horizontally or vertically. Perfect for iron-on transfer paper, T-shirt printing, transparencies, and mirrored scans.
          </p>
        </div>

        {!file ? (
          <div className="max-w-2xl mx-auto">
            <FileDropzone
              onDrop={handleDrop}
              accept={{ 'application/pdf': ['.pdf'] }}
              multiple={false}
              title="Upload PDF to Flip / Mirror"
              subtitle="Drop PDF to mirror horizontally or vertically"
            />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Control Panel */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-violet-50 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-slate-200">{file.name}</h3>
                    <p className="text-xs text-slate-500">{pageCount} page{pageCount > 1 ? 's' : ''} • {(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setFile(null);
                    setResultUrl(null);
                    setPreviewOriginal(null);
                  }}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                >
                  Change File
                </button>
              </div>

              {/* Settings Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
                {/* 1. Mirror Mode */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                    Mirror Axis Mode
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setFlipMode('horizontal')}
                      className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-bold transition-all ${
                        flipMode === 'horizontal'
                          ? 'border-violet-600 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <FlipHorizontal className="w-5 h-5" /> Horizontal (Left/Right)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlipMode('vertical')}
                      className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-bold transition-all ${
                        flipMode === 'vertical'
                          ? 'border-violet-600 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <FlipVertical className="w-5 h-5" /> Vertical (Upside-Down)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlipMode('both')}
                      className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-bold transition-all ${
                        flipMode === 'both'
                          ? 'border-violet-600 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <RefreshCw className="w-5 h-5" /> Both (Inverted)
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">
                    {flipMode === 'horizontal'
                      ? 'Horizontal mirror: Perfect for T-shirt transfer printing and transparent overlays.'
                      : flipMode === 'vertical'
                      ? 'Vertical mirror: Flips pages top-to-bottom across horizontal axis.'
                      : 'Dual mirror: Reverses both horizontal and vertical axes.'}
                  </p>
                </div>

                {/* 2. Page Range */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                    Pages to Flip
                  </label>
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <label className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="radio"
                          checked={pageSelection === 'all'}
                          onChange={() => setPageSelection('all')}
                          className="text-violet-600 focus:ring-violet-500"
                        />
                        All Pages ({pageCount})
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="radio"
                          checked={pageSelection === 'custom'}
                          onChange={() => setPageSelection('custom')}
                          className="text-violet-600 focus:ring-violet-500"
                        />
                        Custom Range
                      </label>
                    </div>
                    {pageSelection === 'custom' && (
                      <input
                        type="text"
                        value={customRange}
                        onChange={(e) => setCustomRange(e.target.value)}
                        placeholder="e.g. 1-3, 5, 8-10"
                        className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  onClick={processFlip}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {busy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Mirroring PDF...
                    </>
                  ) : (
                    <>
                      <FlipHorizontal className="w-4 h-4" /> Flip & Save PDF
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Live Visual Before / After Preview */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-violet-600" />
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Before & After Mirror Comparison (Page {previewPageNum})
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

              {previewOriginal ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  {/* Original */}
                  <div className="text-center">
                    <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 mb-2">
                      Original Orientation
                    </span>
                    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-xs max-h-72 flex items-center justify-center bg-white">
                      <img src={previewOriginal} alt="Original" className="max-h-72 object-contain" />
                    </div>
                  </div>

                  {/* Mirrored */}
                  <div className="text-center">
                    <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 mb-2">
                      Flipped Result ({flipMode})
                    </span>
                    <div className="border-2 border-violet-400 dark:border-violet-600 rounded-xl overflow-hidden shadow-xs max-h-72 flex items-center justify-center bg-white">
                      <img
                        src={previewOriginal}
                        alt="Mirrored"
                        className="max-h-72 object-contain transition-transform duration-300"
                        style={{
                          transform:
                            flipMode === 'horizontal'
                              ? 'scaleX(-1)'
                              : flipMode === 'vertical'
                              ? 'scaleY(-1)'
                              : 'scale(-1, -1)',
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Rendering comparison...
                </div>
              )}
            </div>

            {/* Success Box */}
            {resultUrl && (
              <div className="p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center animate-fade-in">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
                <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-100 mb-1">
                  PDF Flipped Successfully!
                </h3>
                <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-4">
                  Your PDF pages have been mirrored with 100% vector text preservation.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <a
                    href={resultUrl}
                    download={resultName}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition-colors"
                  >
                    <Download className="w-4 h-4" /> Download Mirrored PDF
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
          toolName="Flip PDF (Mirror Pages)"
          headline="Mirror Pages Horizontally or Vertically"
          description="Free online tool to reflect PDF pages across the horizontal or vertical axis. Vector-perfect page flipping for transfer paper, printing transparencies, and mirrored documents."
          faqs={[
            {
              q: 'What is the difference between Rotate and Flip?',
              a: 'Rotate turns a page around its center by 90°, 180°, or 270°. Flip creates a mirror reflection (like looking in a mirror or printing on backwards transfer paper) so text appears backwards.',
            },
            {
              q: 'Will text remain selectable after flipping?',
              a: 'Yes! Unlike raster tools that convert pages to blurry images, our tool flips the underlying vector transformation matrix, preserving full PDF text structure.',
            },
          ]}
        />
      </div>
    </div>
  );
}
