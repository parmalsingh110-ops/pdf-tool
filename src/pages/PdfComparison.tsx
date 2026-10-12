import React, { useState, useRef, useEffect } from 'react';
import { 
  GitCompare, Download, Loader2, SplitSquareVertical, SlidersHorizontal, 
  FileText, ArrowRight, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, Layers, Eye
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';

type ViewMode = 'slider' | 'side-by-side' | 'diff-overlay' | 'text-diff';

interface TextDiffLine {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
}

export default function PdfComparison() {
  useSEO(
    'Compare PDF Files Online Free — Visual & Text Diff Studio',
    'Compare two PDF documents side-by-side. Features interactive before-after swipe sliders, pixel heatmap difference overlays, and word-by-word semantic text diff.'
  );

  usePageSEO(
    'PDF Comparison Tool — Side-by-Side & Visual Difference',
    'Find differences between two revisions of a PDF. Interactive swipe slider, pixel difference heatmaps, synchronized scrolling, and change reports.'
  );

  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const [pagesA, setPagesA] = useState<string[]>([]);
  const [pagesB, setPagesB] = useState<string[]>([]);
  const [diffImages, setDiffImages] = useState<string[]>([]);
  const [diffStats, setDiffStats] = useState<{ page: number; diffPercent: number; diffPixels: number }[]>([]);
  const [textDiffs, setTextDiffs] = useState<TextDiffLine[][]>([]);

  const [currentPage, setCurrentPage] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('slider');
  const [sliderPos, setSliderPos] = useState(50); // percentage

  const sliderRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const handleDropA = (files: File[]) => { if (files[0]) setFileA(files[0]); };
  const handleDropB = (files: File[]) => { if (files[0]) setFileB(files[0]); };

  const compareDocuments = async () => {
    if (!fileA || !fileB) return;
    setBusy(true);

    try {
      const bufA = await fileA.arrayBuffer();
      const bufB = await fileB.arrayBuffer();
      const pdfA = await pdfjsLib.getDocument({ data: new Uint8Array(bufA) }).promise;
      const pdfB = await pdfjsLib.getDocument({ data: new Uint8Array(bufB) }).promise;
      const maxPages = Math.max(pdfA.numPages, pdfB.numPages);

      const imgsA: string[] = [];
      const imgsB: string[] = [];
      const diffImgs: string[] = [];
      const statsList: { page: number; diffPercent: number; diffPixels: number }[] = [];
      const allTextDiffs: TextDiffLine[][] = [];

      const scale = 1.5;

      for (let p = 1; p <= maxPages; p++) {
        // Render Page A
        let canvasA: HTMLCanvasElement | null = null;
        let textA = '';
        if (p <= pdfA.numPages) {
          const pageA = await pdfA.getPage(p);
          const vpA = pageA.getViewport({ scale });
          canvasA = document.createElement('canvas');
          canvasA.width = vpA.width;
          canvasA.height = vpA.height;
          const ctxA = canvasA.getContext('2d')!;
          ctxA.fillStyle = '#ffffff';
          ctxA.fillRect(0, 0, canvasA.width, canvasA.height);
          await pageA.render({ canvasContext: ctxA, viewport: vpA, canvas: canvasA }).promise;
          imgsA.push(canvasA.toDataURL('image/jpeg', 0.88));

          const tcA = await pageA.getTextContent();
          textA = tcA.items.map((i: any) => i.str || '').join(' ');
        } else {
          imgsA.push('');
        }

        // Render Page B
        let canvasB: HTMLCanvasElement | null = null;
        let textB = '';
        if (p <= pdfB.numPages) {
          const pageB = await pdfB.getPage(p);
          const vpB = pageB.getViewport({ scale });
          canvasB = document.createElement('canvas');
          canvasB.width = vpB.width;
          canvasB.height = vpB.height;
          const ctxB = canvasB.getContext('2d')!;
          ctxB.fillStyle = '#ffffff';
          ctxB.fillRect(0, 0, canvasB.width, canvasB.height);
          await pageB.render({ canvasContext: ctxB, viewport: vpB, canvas: canvasB }).promise;
          imgsB.push(canvasB.toDataURL('image/jpeg', 0.88));

          const tcB = await pageB.getTextContent();
          textB = tcB.items.map((i: any) => i.str || '').join(' ');
        } else {
          imgsB.push('');
        }

        // Compute Pixel Diff Overlay
        const w = Math.max(canvasA?.width || 0, canvasB?.width || 0);
        const h = Math.max(canvasA?.height || 0, canvasB?.height || 0);

        if (w > 0 && h > 0) {
          const diffCanvas = document.createElement('canvas');
          diffCanvas.width = w;
          diffCanvas.height = h;
          const diffCtx = diffCanvas.getContext('2d')!;
          diffCtx.fillStyle = '#ffffff';
          diffCtx.fillRect(0, 0, w, h);

          if (canvasA) diffCtx.drawImage(canvasA, 0, 0);

          let diffPixels = 0;
          if (canvasA && canvasB) {
            const dataA = canvasA.getContext('2d')!.getImageData(0, 0, canvasA.width, canvasA.height);
            const dataB = canvasB.getContext('2d')!.getImageData(0, 0, canvasB.width, canvasB.height);
            const diffData = diffCtx.getImageData(0, 0, w, h);
            const dd = diffData.data;

            const minW = Math.min(canvasA.width, canvasB.width);
            const minH = Math.min(canvasA.height, canvasB.height);

            for (let y = 0; y < minH; y++) {
              for (let x = 0; x < minW; x++) {
                const idxA = (y * canvasA.width + x) * 4;
                const idxB = (y * canvasB.width + x) * 4;
                const idxD = (y * w + x) * 4;

                const diffR = Math.abs(dataA.data[idxA] - dataB.data[idxB]);
                const diffG = Math.abs(dataA.data[idxA + 1] - dataB.data[idxB + 1]);
                const diffB = Math.abs(dataA.data[idxA + 2] - dataB.data[idxB + 2]);

                if (diffR + diffG + diffB > 35) {
                  // Bright neon red highlight for differences
                  dd[idxD] = 239;
                  dd[idxD + 1] = 68;
                  dd[idxD + 2] = 68;
                  dd[idxD + 3] = 220;
                  diffPixels++;
                } else {
                  // Desaturate matching background slightly
                  const gray = (dataA.data[idxA] + dataA.data[idxA + 1] + dataA.data[idxA + 2]) / 3;
                  dd[idxD] = Math.round(dataA.data[idxA] * 0.7 + gray * 0.3);
                  dd[idxD + 1] = Math.round(dataA.data[idxA + 1] * 0.7 + gray * 0.3);
                  dd[idxD + 2] = Math.round(dataA.data[idxA + 2] * 0.7 + gray * 0.3);
                  dd[idxD + 3] = 255;
                }
              }
            }
            diffCtx.putImageData(diffData, 0, 0);
          }

          diffImgs.push(diffCanvas.toDataURL('image/jpeg', 0.88));
          const totalPx = Math.max(w * h, 1);
          statsList.push({
            page: p,
            diffPixels,
            diffPercent: Number(((diffPixels / totalPx) * 100).toFixed(2))
          });
        }

        // Semantic word/line text diff
        const linesA = textA.split(/\.\s+/).filter(Boolean);
        const linesB = textB.split(/\.\s+/).filter(Boolean);
        const pageTextDiff: TextDiffLine[] = [];

        const setA = new Set(linesA);
        const setB = new Set(linesB);

        linesA.forEach(line => {
          if (!setB.has(line)) pageTextDiff.push({ type: 'removed', text: line });
        });
        linesB.forEach(line => {
          if (!setA.has(line)) pageTextDiff.push({ type: 'added', text: line });
        });

        allTextDiffs.push(pageTextDiff);
      }

      setPagesA(imgsA);
      setPagesB(imgsB);
      setDiffImages(diffImgs);
      setDiffStats(statsList);
      setTextDiffs(allTextDiffs);
      setCurrentPage(0);
    } catch (err: any) {
      console.error('Comparison error:', err);
      alert(`Comparison failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  // Slider Mouse Drag Handlers
  const handleSliderMove = (clientX: number) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(pct);
  };

  const onMouseDown = () => { isDraggingRef.current = true; };
  const onMouseUp = () => { isDraggingRef.current = false; };
  const onMouseMove = (e: React.MouseEvent) => {
    if (isDraggingRef.current) handleSliderMove(e.clientX);
  };

  const exportDiffPdf = async () => {
    if (diffImages.length === 0) return;
    try {
      const pdfDoc = await PDFDocument.create();
      for (const imgUrl of diffImages) {
        const bytes = dataUrlToBytes(imgUrl);
        const img = await pdfDoc.embedJpg(bytes);
        const page = pdfDoc.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      }
      const finalBytes = await pdfDoc.save();
      const blob = new Blob([finalBytes as any], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `PDF_Comparison_Report_${fileA?.name.replace(/\.pdf$/i, '')}_vs_${fileB?.name.replace(/\.pdf$/i, '')}.pdf`;
      a.click();
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const reset = () => {
    setFileA(null);
    setFileB(null);
    setDiffImages([]);
    setPagesA([]);
    setPagesB([]);
  };

  const currentStat = diffStats[currentPage];
  const currentTextDiff = textDiffs[currentPage] || [];

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-4 sm:p-8 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm border border-indigo-100 dark:border-indigo-900/50">
          <GitCompare className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-2">
          PDF Comparison & Diff Studio
        </h1>
        <p className="text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          Compare two PDF versions with interactive before/after swipe sliders, pixel difference overlays, and semantic text diffs.
        </p>
      </div>

      {!pagesA.length ? (
        <div className="w-full max-w-3xl space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                Original Version (Document A)
              </span>
              {fileA ? (
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-between">
                  <div className="truncate text-xs font-bold text-slate-800 dark:text-slate-200">{fileA.name}</div>
                  <button onClick={() => setFileA(null)} className="text-xs text-red-500 font-bold ml-2">Remove</button>
                </div>
              ) : (
                <FileDropzone onDrop={handleDropA} multiple={false} title="Select Original Document A" />
              )}
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                Revised Version (Document B)
              </span>
              {fileB ? (
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-between">
                  <div className="truncate text-xs font-bold text-slate-800 dark:text-slate-200">{fileB.name}</div>
                  <button onClick={() => setFileB(null)} className="text-xs text-red-500 font-bold ml-2">Remove</button>
                </div>
              ) : (
                <FileDropzone onDrop={handleDropB} multiple={false} title="Select Revised Document B" />
              )}
            </div>
          </div>

          <button
            onClick={compareDocuments}
            disabled={!fileA || !fileB || busy}
            className="w-full py-4 px-6 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold rounded-2xl shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 text-base transition-all disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Comparing Documents Pixel by Pixel...</span>
              </>
            ) : (
              <>
                <GitCompare className="w-5 h-5" />
                <span>Compare Both Documents</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      ) : (
        /* Active Comparison Workspace */
        <div className="w-full space-y-4">
          {/* Top Control Bar */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
            {/* View Mode Tabs */}
            <div className="flex items-center gap-2">
              {[
                { id: 'slider', label: 'Swipe Slider', icon: SlidersHorizontal },
                { id: 'side-by-side', label: 'Side by Side', icon: SplitSquareVertical },
                { id: 'diff-overlay', label: 'Heatmap Diff', icon: Layers },
                { id: 'text-diff', label: 'Text Changes', icon: FileText }
              ].map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setViewMode(tab.id as ViewMode)}
                    className={`py-2 px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                      viewMode === tab.id
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Metrics & Page Flipping */}
            <div className="flex items-center gap-3">
              {currentStat && (
                <span className="text-xs font-bold px-3 py-1 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-full border border-rose-200 dark:border-rose-900">
                  {currentStat.diffPercent}% Changed ({currentStat.diffPixels.toLocaleString()} px)
                </span>
              )}

              <div className="flex items-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-400">
                <button
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 0))}
                  disabled={currentPage === 0}
                  className="p-1.5 rounded-lg border hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span>Page {currentPage + 1} / {diffImages.length}</span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(p + 1, diffImages.length - 1))}
                  disabled={currentPage === diffImages.length - 1}
                  className="p-1.5 rounded-lg border hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={exportDiffPdf}
                className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                Export Diff PDF
              </button>
              <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600 underline">Change</button>
            </div>
          </div>

          {/* Interactive Workspace Viewport */}
          {viewMode === 'slider' ? (
            /* Mode 1: Swipe Slider */
            <div 
              ref={sliderRef}
              className="relative border shadow-xl bg-white select-none overflow-hidden rounded-2xl mx-auto cursor-ew-resize max-w-full"
              onMouseDown={onMouseDown}
              onMouseUp={onMouseUp}
              onMouseMove={onMouseMove}
            >
              {/* Document B (Underneath / Full) */}
              <img
                src={pagesB[currentPage]}
                alt="Document B"
                className="max-h-[75vh] object-contain pointer-events-none mx-auto block"
              />

              {/* Document A (Clipped by slider position) */}
              <div 
                className="absolute inset-0 overflow-hidden pointer-events-none border-r-2 border-indigo-600 shadow-2xl"
                style={{ width: `${sliderPos}%` }}
              >
                <img
                  src={pagesA[currentPage]}
                  alt="Document A"
                  className="max-h-[75vh] object-contain max-w-none pointer-events-none"
                />
              </div>

              {/* Slider Handle Knob */}
              <div 
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg pointer-events-none z-10 text-xs font-bold"
                style={{ left: `${sliderPos}%` }}
              >
                ⇄
              </div>

              {/* Labels */}
              <div className="absolute top-3 left-3 bg-blue-600 text-white px-2.5 py-1 rounded-lg text-[10px] font-bold shadow-md">
                Original (Doc A)
              </div>
              <div className="absolute top-3 right-3 bg-indigo-600 text-white px-2.5 py-1 rounded-lg text-[10px] font-bold shadow-md">
                Revised (Doc B)
              </div>
            </div>
          ) : viewMode === 'side-by-side' ? (
            /* Mode 2: Side by Side */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border shadow-md space-y-2">
                <span className="text-xs font-bold text-blue-600 block text-center">Document A (Original)</span>
                <img src={pagesA[currentPage]} alt="Doc A" className="max-h-[68vh] object-contain mx-auto border" />
              </div>
              <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border shadow-md space-y-2">
                <span className="text-xs font-bold text-indigo-600 block text-center">Document B (Revised)</span>
                <img src={pagesB[currentPage]} alt="Doc B" className="max-h-[68vh] object-contain mx-auto border" />
              </div>
            </div>
          ) : viewMode === 'diff-overlay' ? (
            /* Mode 3: Pixel Diff Heatmap */
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border shadow-lg text-center space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
                Red Pixels Indicate Changed or Replaced Content
              </div>
              <img
                src={diffImages[currentPage]}
                alt="Diff Heatmap"
                className="max-h-[75vh] object-contain mx-auto border shadow-md rounded"
              />
            </div>
          ) : (
            /* Mode 4: Semantic Text Diff */
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border shadow-sm space-y-4 text-left">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                Text Differences on Page {currentPage + 1}:
              </h3>

              {currentTextDiff.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No significant sentence additions or deletions detected on this page.</p>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                  {currentTextDiff.map((line, idx) => (
                    <div 
                      key={idx}
                      className={`p-3 rounded-xl text-xs font-mono flex items-start gap-2 border ${
                        line.type === 'added'
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200'
                          : 'bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200'
                      }`}
                    >
                      <span className="font-bold shrink-0">{line.type === 'added' ? '[+]' : '[-]'}</span>
                      <span>{line.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
