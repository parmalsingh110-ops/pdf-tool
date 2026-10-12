import { useState, useRef } from 'react';
import { PDFDocument, degrees } from 'pdf-lib';
import { Download, FileText, RotateCw, RotateCcw, Trash2, Copy, Plus, ArrowLeftRight, Rotate3d, CheckCircle2, Sparkles, RefreshCw, Undo2 } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

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
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
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
    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-xs font-bold tracking-widest uppercase mb-3 border border-blue-200 dark:border-blue-800">
          <Sparkles className="w-3.5 h-3.5" /> Interactive Page Reorder
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-3">
          Organize & Rearrange PDF Pages
        </h1>
        <p className="text-lg text-gray-600 dark:text-slate-400 max-w-2xl mx-auto">
          Drag and drop pages into your desired order, rotate, duplicate, or delete them in seconds. 100% private in-browser.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-4xl">
          <FileDropzone
            onDrop={handleDrop}
            multiple={false}
            accept={{ 'application/pdf': ['.pdf'] }}
            title="Select PDF file to organize"
            subtitle="or drop PDF document here"
          />
        </div>
      ) : isLoadingPages ? (
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-12 text-center">
          <div className="w-14 h-14 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Extracting Pages...</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400">Loading interactive page thumbnails</p>
        </div>
      ) : organizedUrl ? (
        /* Results View */
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-8 text-center space-y-6">
          <div className="p-8 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-emerald-900 dark:text-emerald-200 mb-2">
              PDF Organized Successfully!
            </h3>
            <p className="text-sm text-emerald-700 dark:text-emerald-400 mb-6">
              Total {pages.length} page{pages.length !== 1 ? 's' : ''} organized and compiled.
            </p>
            <a
              href={organizedUrl}
              download={`organized_${file.name}`}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-bold rounded-xl shadow-lg transition-all"
            >
              <Download className="w-5 h-5" /> Download Organized PDF
            </a>
          </div>

          <div className="flex justify-center gap-4">
            <button
              onClick={() => setOrganizedUrl(null)}
              className="px-6 py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-xl transition-all"
            >
              Back to Editor
            </button>
            <button
              onClick={() => {
                setFile(null);
                setPages([]);
                setOrganizedUrl(null);
              }}
              className="px-6 py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-xl transition-all"
            >
              Organize Another PDF
            </button>
          </div>
        </div>
      ) : (
        /* Workspace */
        <div className="w-full max-w-6xl space-y-6">
          {/* Top Control Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate max-w-md">
                    {file.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    {pages.length} pages total • Drag cards to rearrange
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
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
                  onClick={saveOrganizedPdf}
                  disabled={isProcessing || pages.length === 0}
                  className="flex-1 lg:flex-initial inline-flex items-center justify-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" /> Saving PDF...
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" /> Save Changes ({pages.length} Pages)
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Bulk Tools */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => rotateAllPages(90)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-lg transition-colors"
                >
                  <RotateCw className="w-3.5 h-3.5" /> Rotate All 90°
                </button>
                <button
                  onClick={reversePages}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-lg transition-colors"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" /> Reverse Order
                </button>
                <button
                  onClick={() => insertBlankPage(pages.length - 1)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Append Blank Page
                </button>
              </div>

              <button
                onClick={resetPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
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
                className={`relative group bg-white dark:bg-slate-900 rounded-2xl border-2 transition-all cursor-grab active:cursor-grabbing flex flex-col p-2 select-none shadow-sm hover:shadow-md ${
                  draggedIdx === index
                    ? 'border-blue-500 opacity-40 scale-95'
                    : 'border-transparent hover:border-blue-400 dark:hover:border-blue-500'
                }`}
              >
                {/* Page Number Badge */}
                <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm text-white text-xs font-bold px-2 py-0.5 rounded-md z-10">
                  #{index + 1}
                  {page.originalIndex === -1 && <span className="ml-1 text-[10px] text-amber-300">Blank</span>}
                </div>

                {/* Top Action Buttons */}
                <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      rotatePage(index, 'cw');
                    }}
                    className="p-1.5 bg-black/70 hover:bg-blue-600 backdrop-blur-sm text-white rounded-lg transition-colors"
                    title="Rotate 90° CW"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicatePage(index);
                    }}
                    className="p-1.5 bg-black/70 hover:bg-emerald-600 backdrop-blur-sm text-white rounded-lg transition-colors"
                    title="Duplicate page"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePage(index);
                    }}
                    className="p-1.5 bg-black/70 hover:bg-rose-600 backdrop-blur-sm text-white rounded-lg transition-colors"
                    title="Delete page"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Page Thumbnail */}
                <div className="aspect-[1/1.35] bg-gray-50 dark:bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center p-2 mb-2 border border-gray-100 dark:border-slate-800">
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
                    className="px-2 py-1 text-xs font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 rounded disabled:opacity-20"
                    title="Move earlier"
                  >
                    &larr; Left
                  </button>
                  <span className="text-[10px] text-gray-400 dark:text-slate-500">
                    Orig #{page.originalIndex !== -1 ? page.originalIndex + 1 : 'New'}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      movePage(index, 'right');
                    }}
                    disabled={index === pages.length - 1}
                    className="px-2 py-1 text-xs font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 rounded disabled:opacity-20"
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
    </div>
  );
}
