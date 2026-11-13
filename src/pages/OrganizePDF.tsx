import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { PDFDocument, degrees } from 'pdf-lib';
import { Download, FileText, RotateCw, Trash2, Copy, Plus, ArrowLeftRight, CheckCircle2, RefreshCw, Undo2 } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';
import { useAutoRevokeUrl, toArrayBufferBytes } from '../lib/blobUrl';

// Initialize pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PageData {
  id: string;
  originalIndex: number; // -1 if newly inserted blank page
  rotation: number;
  thumbnailUrl: string;
}

export default function OrganizePDF() {
  useSEO(
    'Organize PDF Pages Online Free — Reorder, Rotate & Delete | PDF Media Suite',
    'Organize and rearrange PDF pages with drag-and-drop online free. Rotate, duplicate, delete, and insert blank pages effortlessly with live thumbnail preview.'
  );

  usePageSEO(
    'Organize PDF Pages',
    'Reorder, duplicate, delete, and rearrange PDF pages with drag & drop. Free online PDF organizer with bulk rotation and reverse tools.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [initialPages, setInitialPages] = useState<PageData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [organizedUrl, setOrganizedUrl] = useState<string | null>(null);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const prefersReduced = useReducedMotion();

  useAutoRevokeUrl(organizedUrl);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      setFile(selectedFile);
      setOrganizedUrl(null);
      await loadPdfPages(selectedFile);
    }
  };

  const loadPdfPages = async (pdfFile: File) => {
    setIsLoadingPages(true);
    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const numPages = pdf.numPages;
      const loaded: PageData[] = [];

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.45 });
        const canvas = document.createElement('canvas');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        const context = canvas.getContext('2d');

        if (context) {
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, viewport.width, viewport.height);
          await page.render({ canvasContext: context, viewport: viewport, canvas: canvas }).promise;

          loaded.push({
            id: `page-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            originalIndex: i - 1,
            rotation: 0,
            thumbnailUrl: canvas.toDataURL('image/jpeg', 0.8),
          });
        }
        canvas.width = 0;
        canvas.height = 0;
      }
      setPages(loaded);
      setInitialPages(loaded);
    } catch (error) {
      console.error('Error loading PDF pages:', error);
      alert('Failed to load PDF pages. The document might be encrypted or corrupted.');
    } finally {
      setIsLoadingPages(false);
    }
  };

  const rotatePage = (index: number, direction: 'cw' | 'ccw' = 'cw') => {
    setPages((prev) => {
      const next = [...prev];
      const delta = direction === 'cw' ? 90 : -90;
      next[index] = {
        ...next[index],
        rotation: (next[index].rotation + delta + 360) % 360,
      };
      return next;
    });
  };

  const rotateAllPages = (delta: number) => {
    setPages((prev) =>
      prev.map((p) => ({
        ...p,
        rotation: (p.rotation + delta + 360) % 360,
      }))
    );
  };

  const deletePage = (index: number) => {
    if (pages.length <= 1) {
      alert('Cannot delete the only remaining page in the PDF.');
      return;
    }
    setPages((prev) => prev.filter((_, i) => i !== index));
  };

  const duplicatePage = (index: number) => {
    setPages((prev) => {
      const target = prev[index];
      const copy: PageData = {
        ...target,
        id: `dup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  };

  const insertBlankPage = (afterIndex: number) => {
    // Generate a white blank canvas thumbnail
    const canvas = document.createElement('canvas');
    canvas.width = 150;
    canvas.height = 212;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 150, 212);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.strokeRect(4, 4, 142, 204);
    }
    const blankThumb = canvas.toDataURL('image/jpeg', 0.8);

    const blankPage: PageData = {
      id: `blank-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      originalIndex: -1,
      rotation: 0,
      thumbnailUrl: blankThumb,
    };

    setPages((prev) => {
      const next = [...prev];
      next.splice(afterIndex + 1, 0, blankPage);
      return next;
    });
  };

  const movePage = (index: number, direction: 'left' | 'right') => {
    if (
      (direction === 'left' && index === 0) ||
      (direction === 'right' && index === pages.length - 1)
    )
      return;

    const next = [...pages];
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setPages(next);
  };

  const reversePages = () => {
    setPages((prev) => [...prev].reverse());
  };

  const resetPages = () => {
    setPages(initialPages);
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropItem = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === targetIndex) return;

    setPages((prev) => {
      const next = [...prev];
      const [draggedItem] = next.splice(draggedIdx, 1);
      next.splice(targetIndex, 0, draggedItem);
      return next;
    });
    setDraggedIdx(null);
  };

  const saveOrganizedPdf = async () => {
    if (!file || pages.length === 0) return;

    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const sourcePdf = await PDFDocument.load(arrayBuffer);
      const newPdf = await PDFDocument.create();

      for (const pageData of pages) {
        if (pageData.originalIndex === -1) {
          // Add blank page (A4 standard: 595.28 x 841.89)
          newPdf.addPage([595.28, 841.89]);
        } else {
          const [copiedPage] = await newPdf.copyPages(sourcePdf, [pageData.originalIndex]);
          if (pageData.rotation !== 0) {
            const currentRotation = copiedPage.getRotation().angle;
            copiedPage.setRotation(degrees(currentRotation + pageData.rotation));
          }
          newPdf.addPage(copiedPage);
        }
      }

      const pdfBytes = await newPdf.save();
      const blob = new Blob([toArrayBufferBytes(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setOrganizedUrl(url);
    } catch (error) {
      console.error('Error organizing PDF:', error);
      alert('An error occurred while saving the organized PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Organize & Rearrange PDF Pages"
      subtitle="Drag and drop pages into your desired order, rotate, duplicate, or delete them in seconds. 100% private in-browser."
      categoryLabel="PDF Organizer · Interactive Reorder"
      icon={ArrowLeftRight}
      microVariant="edit"
      tone="blue"
    >
      <div className="flex flex-col items-center w-full">
        <PearlStageSwitch
          stageKey={!file ? 'upload' : isLoadingPages ? 'loading' : organizedUrl ? 'result' : 'configure'}
          className="w-full max-w-6xl"
        >
        {!file ? (
          <div className="w-full max-w-4xl mx-auto">
            <FileDropzone
              onDrop={handleDrop}
              multiple={false}
              accept={{ 'application/pdf': ['.pdf'] }}
              title="Select PDF file to organize"
              subtitle="or drop PDF document here"
            />
          </div>
        ) : isLoadingPages ? (
          <div className="relative overflow-hidden w-full max-w-2xl mx-auto pms-glass-panel rounded-3xl p-12 text-center">
            <PearlScanOverlay active label="Rendering interactive page thumbnails..." />
            <div className="w-14 h-14 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Extracting Pages...</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400">Loading interactive page thumbnails</p>
          </div>
        ) : organizedUrl ? (
          /* Results View */
          <div className="w-full max-w-2xl mx-auto pms-glass-panel rounded-3xl p-8 text-center space-y-6">
            <div className="p-8 rounded-2xl bg-gradient-to-br from-emerald-500/12 via-white/75 to-teal-500/12 dark:from-emerald-950/50 dark:via-slate-900/80 dark:to-teal-950/40 border border-emerald-200/80 dark:border-emerald-800/60">
              <motion.div
                initial={prefersReduced ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/25"
              >
                <CheckCircle2 className="w-8 h-8" />
              </motion.div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                PDF Organized Successfully!
              </h3>
              <p className="text-sm text-gray-600 dark:text-slate-400 mb-6 tabular-nums">
                Total <AnimatedNumber value={pages.length} /> page{pages.length !== 1 ? 's' : ''} organized and compiled.
              </p>
              <motion.a
                whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                href={organizedUrl}
                download={`organized_${file.name}`}
                className="pms-btn-primary relative overflow-hidden inline-flex items-center justify-center gap-2 px-8 py-4 text-lg font-bold rounded-xl shadow-lg"
              >
                <span className="pms-shimmer pointer-events-none" />
                <Download className="w-5 h-5" /> Download Organized PDF
              </motion.a>
            </div>

            <div className="flex flex-wrap justify-center gap-4">
              <motion.button
                whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                onClick={() => setOrganizedUrl(null)}
                className="px-6 py-3 bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 border border-[var(--pms-border)] text-gray-700 dark:text-slate-200 font-semibold rounded-xl transition-all"
              >
                Back to Editor
              </motion.button>
              <motion.button
                whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                onClick={() => {
                  setFile(null);
                  setPages([]);
                  setOrganizedUrl(null);
                }}
                className="px-6 py-3 bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 border border-[var(--pms-border)] text-gray-700 dark:text-slate-200 font-semibold rounded-xl transition-all"
              >
                Organize Another PDF
              </motion.button>
            </div>
          </div>
        ) : (
          /* Workspace */
          <div className="w-full space-y-6">
            {/* Top Control Bar */}
            <div className="relative overflow-hidden pms-glass-panel rounded-3xl p-6">
              <PearlScanOverlay active={isProcessing} label={`Compiling ${pages.length} organized pages...`} />
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-[var(--pms-border)]">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] border border-[var(--pms-border)] rounded-xl flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate max-w-md">
                      {file.name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-slate-400 tabular-nums">
                      <AnimatedNumber value={pages.length} /> pages total • Drag cards to rearrange
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                  <button
                    onClick={() => {
                      setFile(null);
                      setPages([]);
                    }}
                    className="px-4 py-2.5 text-sm font-semibold text-gray-600 dark:text-slate-300 bg-white/75 dark:bg-slate-800/75 hover:bg-white dark:hover:bg-slate-700 border border-[var(--pms-border)] rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileHover={prefersReduced || isProcessing || pages.length === 0 ? undefined : { scale: 1.02 }}
                    whileTap={prefersReduced || isProcessing || pages.length === 0 ? undefined : { scale: 0.98 }}
                    onClick={saveOrganizedPdf}
                    disabled={isProcessing || pages.length === 0}
                    className="pms-btn-primary relative overflow-hidden flex-1 lg:flex-initial inline-flex items-center justify-center gap-2 px-8 py-3 font-bold rounded-xl shadow-md disabled:opacity-50"
                  >
                    <span className="pms-shimmer pointer-events-none" />
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" /> Saving PDF...
                      </>
                    ) : (
                      <>
                        <Download className="w-5 h-5" /> Save Changes ({pages.length} Pages)
                      </>
                    )}
                  </motion.button>
                </div>
              </div>

              {/* Quick Bulk Tools */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => rotateAllPages(90)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white/80 dark:bg-slate-800/80 hover:bg-[var(--pms-soft-blue)] text-gray-700 dark:text-slate-200 border border-[var(--pms-border)] rounded-xl transition-colors"
                  >
                    <RotateCw className="w-3.5 h-3.5" /> Rotate All 90°
                  </button>
                  <button
                    onClick={reversePages}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white/80 dark:bg-slate-800/80 hover:bg-[var(--pms-soft-lavender)] text-gray-700 dark:text-slate-200 border border-[var(--pms-border)] rounded-xl transition-colors"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" /> Reverse Order
                  </button>
                  <button
                    onClick={() => insertBlankPage(pages.length - 1)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white/80 dark:bg-slate-800/80 hover:bg-[var(--pms-soft-mint)] text-gray-700 dark:text-slate-200 border border-[var(--pms-border)] rounded-xl transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Append Blank Page
                  </button>
                </div>

                <button
                  onClick={resetPages}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
                >
                  <Undo2 className="w-3.5 h-3.5" /> Reset to Original Order
                </button>
              </div>
            </div>

            {/* Interactive Reordering Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {pages.map((page, index) => (
                <div
                  key={page.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDropItem(e, index)}
                  className={`relative group pms-glass-panel rounded-2xl border-2 transition-all cursor-grab active:cursor-grabbing flex flex-col p-2.5 select-none hover:shadow-md ${
                    draggedIdx === index
                      ? 'border-[var(--pms-blue)] opacity-40 scale-95'
                      : 'border-[var(--pms-border)] hover:border-[var(--pms-border-strong)]'
                  }`}
                >
                  {/* Page Number Badge */}
                  <div className="absolute top-3.5 left-3.5 bg-slate-900/80 backdrop-blur-sm text-white text-xs font-bold px-2 py-0.5 rounded-md z-10">
                    #{index + 1}
                    {page.originalIndex === -1 && <span className="ml-1 text-[10px] text-amber-300">Blank</span>}
                  </div>

                  {/* Top Action Buttons */}
                  <div className="absolute top-3.5 right-3.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        rotatePage(index, 'cw');
                      }}
                      className="p-1.5 bg-slate-900/80 hover:bg-blue-600 backdrop-blur-sm text-white rounded-lg transition-colors"
                      title="Rotate 90° CW"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicatePage(index);
                      }}
                      className="p-1.5 bg-slate-900/80 hover:bg-emerald-600 backdrop-blur-sm text-white rounded-lg transition-colors"
                      title="Duplicate page"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePage(index);
                      }}
                      className="p-1.5 bg-slate-900/80 hover:bg-rose-600 backdrop-blur-sm text-white rounded-lg transition-colors"
                      title="Delete page"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Page Thumbnail - White paper frame */}
                  <div className="aspect-[1/1.35] bg-white rounded-xl overflow-hidden flex items-center justify-center p-2 mb-2 border border-gray-200 dark:border-slate-700 shadow-inner">
                    <img
                      src={page.thumbnailUrl}
                      alt={`Page ${index + 1}`}
                      className="max-w-full max-h-full object-contain transition-transform duration-200"
                      style={{ transform: `rotate(${page.rotation}deg)` }}
                    />
                  </div>

                  {/* Bottom Order Navigation Arrows */}
                  <div className="flex items-center justify-between px-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        movePage(index, 'left');
                      }}
                      disabled={index === 0}
                      className="px-2 py-1 text-xs font-bold text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white hover:bg-white/80 dark:hover:bg-slate-800 rounded disabled:opacity-20"
                      title="Move earlier"
                    >
                      &larr; Left
                    </button>
                    <span className="text-[10px] text-gray-500 dark:text-slate-400">
                      Orig #{page.originalIndex !== -1 ? page.originalIndex + 1 : 'New'}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        movePage(index, 'right');
                      }}
                      disabled={index === pages.length - 1}
                      className="px-2 py-1 text-xs font-bold text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white hover:bg-white/80 dark:hover:bg-slate-800 rounded disabled:opacity-20"
                      title="Move later"
                    >
                      Right &rarr;
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </PearlStageSwitch>
      </div>
    </ToolWorkspaceShell>
  );
}
