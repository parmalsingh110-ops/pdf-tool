import React, { useState, useRef } from 'react';
import {
  GitCompare, Download, Loader2, SplitSquareVertical, SlidersHorizontal,
  FileText, ArrowRight, ChevronLeft, ChevronRight, Layers,
  ZoomIn, ZoomOut
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { motion, useReducedMotion } from 'motion/react';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';
import { toArrayBufferBytes, triggerBlobDownload } from '../lib/blobUrl';

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
  const [zoomLevel, setZoomLevel] = useState<number>(100); // 50% - 250% zoom

  const prefersReduced = useReducedMotion();
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

                const lumA = 0.299 * dataA.data[idxA] + 0.587 * dataA.data[idxA + 1] + 0.114 * dataA.data[idxA + 2];
                const lumB = 0.299 * dataB.data[idxB] + 0.587 * dataB.data[idxB + 1] + 0.114 * dataB.data[idxB + 2];

                const diffR = Math.abs(dataA.data[idxA] - dataB.data[idxB]);
                const diffG = Math.abs(dataA.data[idxA + 1] - dataB.data[idxB + 1]);
                const diffB = Math.abs(dataA.data[idxA + 2] - dataB.data[idxB + 2]);

                if (diffR + diffG + diffB > 35) {
                  diffPixels++;
                  if (lumA < 200 && lumB > 220) {
                    // Deleted text (present in A, blank in B) -> RED
                    dd[idxD] = 239;
                    dd[idxD + 1] = 68;
                    dd[idxD + 2] = 68;
                    dd[idxD + 3] = 230;
                  } else if (lumB < 200 && lumA > 220) {
                    // Inserted text (present in B, blank in A) -> GREEN
                    dd[idxD] = 16;
                    dd[idxD + 1] = 185;
                    dd[idxD + 2] = 129;
                    dd[idxD + 3] = 230;
                  } else {
                    // Modified / shifted text -> AMBER
                    dd[idxD] = 245;
                    dd[idxD + 1] = 158;
                    dd[idxD + 2] = 11;
                    dd[idxD + 3] = 230;
                  }
                } else {
                  // Desaturate matching background slightly so colored diff pops
                  const gray = (dataA.data[idxA] + dataA.data[idxA + 1] + dataA.data[idxA + 2]) / 3;
                  dd[idxD] = Math.round(dataA.data[idxA] * 0.75 + gray * 0.25);
                  dd[idxD + 1] = Math.round(dataA.data[idxA + 1] * 0.75 + gray * 0.25);
                  dd[idxD + 2] = Math.round(dataA.data[idxA + 2] * 0.75 + gray * 0.25);
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
    if (diffImages.length === 0 || !fileA || !fileB) return;
    try {
      const pdfDoc = await PDFDocument.create();
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // 1. Audit Summary Cover Page
      const summaryPage = pdfDoc.addPage([595.28, 841.89]); // A4 in points
      const { width, height } = summaryPage.getSize();

      // Header Banner
      summaryPage.drawRectangle({
        x: 0,
        y: height - 80,
        width,
        height: 80,
        color: rgb(0.09, 0.13, 0.24)
      });

      summaryPage.drawText('PDF Comparison & Audit Report', {
        x: 40,
        y: height - 48,
        size: 20,
        font: helveticaBold,
        color: rgb(1, 1, 1)
      });

      summaryPage.drawText(`Generated on ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, {
        x: 40,
        y: height - 68,
        size: 10,
        font: helvetica,
        color: rgb(0.7, 0.75, 0.85)
      });

      // Comparison Metadata Box
      let curY = height - 120;
      summaryPage.drawText('Document Comparison Overview', {
        x: 40,
        y: curY,
        size: 14,
        font: helveticaBold,
        color: rgb(0.1, 0.1, 0.1)
      });

      curY -= 25;
      summaryPage.drawText(`Original (Document A): ${fileA.name.slice(0, 65)}`, {
        x: 40,
        y: curY,
        size: 10,
        font: helvetica,
        color: rgb(0.2, 0.3, 0.8)
      });

      curY -= 18;
      summaryPage.drawText(`Revised (Document B):  ${fileB.name.slice(0, 65)}`, {
        x: 40,
        y: curY,
        size: 10,
        font: helvetica,
        color: rgb(0.1, 0.5, 0.3)
      });

      curY -= 18;
      const totalDiffs = diffStats.reduce((acc, s) => acc + s.diffPixels, 0);
      const avgDiff = (diffStats.reduce((acc, s) => acc + s.diffPercent, 0) / Math.max(diffStats.length, 1)).toFixed(1);
      summaryPage.drawText(`Total Pages: ${diffImages.length} | Average Difference: ${avgDiff}% | Changed Pixels: ${totalDiffs.toLocaleString()}`, {
        x: 40,
        y: curY,
        size: 10,
        font: helveticaBold,
        color: rgb(0.3, 0.3, 0.3)
      });

      // Legend
      curY -= 35;
      summaryPage.drawRectangle({ x: 40, y: curY - 2, width: 12, height: 12, color: rgb(0.94, 0.27, 0.27) });
      summaryPage.drawText('Red: Removed Content', { x: 58, y: curY, size: 9, font: helvetica, color: rgb(0.2, 0.2, 0.2) });

      summaryPage.drawRectangle({ x: 180, y: curY - 2, width: 12, height: 12, color: rgb(0.06, 0.72, 0.51) });
      summaryPage.drawText('Green: Added Content', { x: 198, y: curY, size: 9, font: helvetica, color: rgb(0.2, 0.2, 0.2) });

      summaryPage.drawRectangle({ x: 310, y: curY - 2, width: 12, height: 12, color: rgb(0.96, 0.62, 0.04) });
      summaryPage.drawText('Amber: Modified / Shifted', { x: 328, y: curY, size: 9, font: helvetica, color: rgb(0.2, 0.2, 0.2) });

      // Page by Page Table
      curY -= 30;
      summaryPage.drawText('Page-by-Page Audit Breakdown', { x: 40, y: curY, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });

      curY -= 20;
      summaryPage.drawRectangle({ x: 40, y: curY - 6, width: width - 80, height: 22, color: rgb(0.94, 0.95, 0.98) });
      summaryPage.drawText('Page', { x: 50, y: curY, size: 9, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) });
      summaryPage.drawText('Difference %', { x: 140, y: curY, size: 9, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) });
      summaryPage.drawText('Changed Pixels', { x: 260, y: curY, size: 9, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) });
      summaryPage.drawText('Audit Status', { x: 400, y: curY, size: 9, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) });

      for (const stat of diffStats) {
        curY -= 20;
        if (curY < 60) break;
        summaryPage.drawText(`Page ${stat.page}`, { x: 50, y: curY, size: 9, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
        summaryPage.drawText(`${stat.diffPercent}%`, { x: 140, y: curY, size: 9, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
        summaryPage.drawText(`${stat.diffPixels.toLocaleString()} px`, { x: 260, y: curY, size: 9, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
        const statusText = stat.diffPercent > 0.05 ? 'MODIFIED' : 'IDENTICAL';
        summaryPage.drawText(statusText, {
          x: 400,
          y: curY,
          size: 9,
          font: helveticaBold,
          color: stat.diffPercent > 0.05 ? rgb(0.85, 0.2, 0.2) : rgb(0.1, 0.6, 0.2)
        });
      }

      // 2. High-res Visual Difference Pages
      for (const imgUrl of diffImages) {
        const bytes = dataUrlToBytes(imgUrl);
        const img = await pdfDoc.embedJpg(bytes);
        const page = pdfDoc.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      }

      const finalBytes = await pdfDoc.save();
      const blob = new Blob([toArrayBufferBytes(finalBytes)], { type: 'application/pdf' });
      triggerBlobDownload(blob, `PDF_Audit_Report_${fileA.name.replace(/\.pdf$/i, '')}_vs_${fileB.name.replace(/\.pdf$/i, '')}.pdf`);
    } catch (err) {
      console.error('Export report error:', err);
      alert('Failed to generate audit report.');
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
    <ToolWorkspaceShell
      title="PDF Comparison & Diff Studio"
      subtitle="Compare two PDF versions with interactive before/after swipe sliders, pixel difference overlays, and semantic text diffs."
      categoryLabel="Precision Diff Engine · Browser-First"
      icon={GitCompare}
      microVariant="compare"
      tone="indigo"
    >
      <div className="max-w-6xl mx-auto flex flex-col items-center">

      {!pagesA.length ? (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-3xl pms-glass-panel rounded-3xl p-5 sm:p-7 overflow-hidden min-h-[260px] space-y-6"
        >
          <PearlScanOverlay active={busy} label="Comparing documents pixel by pixel…" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="pms-glass-panel p-5 rounded-2xl space-y-3">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-[var(--pms-soft-blue)] text-[var(--pms-blue)]">
                Original Version (Document A)
              </span>
              {fileA ? (
                <div className="p-3 bg-[var(--pms-pearl)] dark:bg-slate-800/80 border border-[var(--pms-border)] rounded-xl flex items-center justify-between gap-2">
                  <div className="truncate text-xs font-bold text-[var(--pms-ink)]">{fileA.name}</div>
                  <button onClick={() => setFileA(null)} className="text-xs text-[var(--pms-rose)] font-bold shrink-0">Remove</button>
                </div>
              ) : (
                <FileDropzone onDrop={handleDropA} multiple={false} title="Select Original Document A" />
              )}
            </div>

            <div className="pms-glass-panel p-5 rounded-2xl space-y-3">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)]">
                Revised Version (Document B)
              </span>
              {fileB ? (
                <div className="p-3 bg-[var(--pms-pearl)] dark:bg-slate-800/80 border border-[var(--pms-border)] rounded-xl flex items-center justify-between gap-2">
                  <div className="truncate text-xs font-bold text-[var(--pms-ink)]">{fileB.name}</div>
                  <button onClick={() => setFileB(null)} className="text-xs text-[var(--pms-rose)] font-bold shrink-0">Remove</button>
                </div>
              ) : (
                <FileDropzone onDrop={handleDropB} multiple={false} title="Select Revised Document B" />
              )}
            </div>
          </div>

          <motion.button
            whileHover={prefersReduced ? undefined : { scale: 1.01 }}
            whileTap={prefersReduced ? undefined : { scale: 0.99 }}
            onClick={compareDocuments}
            disabled={!fileA || !fileB || busy}
            className="pms-btn-primary w-full py-4 px-6 font-bold rounded-2xl flex items-center justify-center gap-2 text-base disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Comparing Documents Pixel by Pixel…</span>
              </>
            ) : (
              <>
                <GitCompare className="w-5 h-5" />
                <span>Compare Both Documents</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </motion.button>
        </motion.div>
      ) : (
        /* Active Comparison Workspace */
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full space-y-4"
        >
          {/* Top Control Bar */}
          <div className="pms-glass-panel p-4 rounded-3xl flex flex-wrap items-center justify-between gap-4">
            {/* View Mode Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 bg-[var(--pms-pearl)]/80 dark:bg-slate-900/70 p-1.5 rounded-2xl border border-[var(--pms-border)]">
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
                        ? 'bg-[var(--pms-violet)] text-white shadow-sm'
                        : 'text-[var(--pms-muted)] hover:text-[var(--pms-ink)] hover:bg-[var(--pms-white)] dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Metrics, Zoom & Page Flipping */}
            <div className="flex flex-wrap items-center gap-3">
              {currentStat && (
                <span className="text-xs font-bold px-3 py-1 bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] rounded-full border border-rose-200/80 dark:border-rose-900/70 tabular-nums">
                  <AnimatedNumber value={currentStat.diffPercent} decimals={2} suffix="%" /> Changed ({currentStat.diffPixels.toLocaleString()} px)
                </span>
              )}

              {/* Synchronized Zoom Controls */}
              <div className="flex items-center gap-1 bg-[var(--pms-pearl)] dark:bg-slate-900/80 border border-[var(--pms-border)] p-1 rounded-xl text-xs">
                <button
                  onClick={() => setZoomLevel(z => Math.max(50, z - 25))}
                  className="p-1.5 hover:bg-[var(--pms-white)] dark:hover:bg-slate-800 rounded-lg text-[var(--pms-ink)] transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setZoomLevel(100)}
                  className="px-2 py-1 font-mono font-bold text-[11px] text-[var(--pms-ink)] hover:bg-[var(--pms-white)] dark:hover:bg-slate-800 rounded-lg transition-colors tabular-nums"
                  title="Reset Zoom to 100%"
                >
                  {zoomLevel}%
                </button>
                <button
                  onClick={() => setZoomLevel(z => Math.min(250, z + 25))}
                  className="p-1.5 hover:bg-[var(--pms-white)] dark:hover:bg-slate-800 rounded-lg text-[var(--pms-ink)] transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--pms-muted)]">
                <button
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 0))}
                  disabled={currentPage === 0}
                  className="p-1.5 rounded-xl border border-[var(--pms-border)] bg-[var(--pms-white)] dark:bg-slate-900 hover:bg-[var(--pms-soft-lavender)] disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-[var(--pms-ink)]" />
                </button>
                <span className="text-[var(--pms-ink)]">Page {currentPage + 1} / {diffImages.length}</span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(p + 1, diffImages.length - 1))}
                  disabled={currentPage === diffImages.length - 1}
                  className="p-1.5 rounded-xl border border-[var(--pms-border)] bg-[var(--pms-white)] dark:bg-slate-900 hover:bg-[var(--pms-soft-lavender)] disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-[var(--pms-ink)]" />
                </button>
              </div>

              <motion.button
                whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                onClick={exportDiffPdf}
                className="pms-btn-primary py-2 px-4 font-bold rounded-xl text-xs flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Export Audit Report PDF
              </motion.button>
              <button onClick={reset} className="text-xs font-semibold text-[var(--pms-muted)] hover:text-[var(--pms-ink)] underline">
                Change
              </button>
            </div>
          </div>

          {/* Interactive Workspace Viewport */}
          {viewMode === 'slider' ? (
            /* Mode 1: Swipe Slider (keep bg-white paper surface) */
            <div className="pms-glass-panel p-4 sm:p-5 rounded-3xl flex justify-center overflow-auto">
              <div
                ref={sliderRef}
                className="relative border border-[var(--pms-border-strong)] shadow-xl bg-white select-none overflow-hidden rounded-2xl mx-auto cursor-ew-resize max-w-full transition-transform"
                style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
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
            </div>
          ) : viewMode === 'side-by-side' ? (
            /* Mode 2: Side by Side with Synchronized Zoom */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="pms-glass-panel p-4 rounded-3xl space-y-2">
                <span className="text-xs font-bold text-[var(--pms-blue)] block text-center">Document A (Original)</span>
                <div className="overflow-auto max-h-[70vh] flex justify-center rounded-xl bg-white p-2 border border-[var(--pms-border)]">
                  <img
                    src={pagesA[currentPage]}
                    alt="Doc A"
                    className="max-h-[68vh] object-contain transition-transform"
                    style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
                  />
                </div>
              </div>
              <div className="pms-glass-panel p-4 rounded-3xl space-y-2">
                <span className="text-xs font-bold text-[var(--pms-violet)] block text-center">Document B (Revised)</span>
                <div className="overflow-auto max-h-[70vh] flex justify-center rounded-xl bg-white p-2 border border-[var(--pms-border)]">
                  <img
                    src={pagesB[currentPage]}
                    alt="Doc B"
                    className="max-h-[68vh] object-contain transition-transform"
                    style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
                  />
                </div>
              </div>
            </div>
          ) : viewMode === 'diff-overlay' ? (
            /* Mode 3: Pixel Diff Heatmap with 3-Color Legend */
            <div className="pms-glass-panel p-5 rounded-3xl text-center space-y-4">
              <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-bold">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-100/90 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 rounded-full border border-rose-200 dark:border-rose-900">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                  Red: Removed / Deleted
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100/90 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 rounded-full border border-emerald-200 dark:border-emerald-900">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  Green: Added / Inserted
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100/90 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 rounded-full border border-amber-200 dark:border-amber-900">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  Amber: Modified / Shifted
                </span>
              </div>
              <div className="overflow-auto max-h-[75vh] flex justify-center rounded-2xl bg-white p-3 border border-[var(--pms-border)]">
                <img
                  src={diffImages[currentPage]}
                  alt="Diff Heatmap"
                  className="max-h-[75vh] object-contain shadow-md rounded transition-transform"
                  style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
                />
              </div>
            </div>
          ) : (
            /* Mode 4: Semantic Text Diff */
            <div className="pms-glass-panel p-6 rounded-3xl space-y-4 text-left">
              <h3 className="font-bold text-sm text-[var(--pms-ink)]">
                Text Differences on Page {currentPage + 1}:
              </h3>

              {currentTextDiff.length === 0 ? (
                <p className="text-xs text-[var(--pms-muted)] italic">No significant sentence additions or deletions detected on this page.</p>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                  {currentTextDiff.map((line, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl text-xs font-mono flex items-start gap-2 border ${
                        line.type === 'added'
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-900/60'
                          : 'bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-900/60'
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
        </motion.div>
      )}
      </div>
    </ToolWorkspaceShell>
  );
}
