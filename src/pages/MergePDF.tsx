import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { PDFDocument, StandardFonts, rgb, PDFName } from 'pdf-lib';
import { Download, Trash2, GripVertical, FileText, ListRestart, ChevronUp, ChevronDown, Plus, Layers, BookOpen, Maximize2, Sparkles } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { useToast } from '../components/Toast';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';

const ORDER_KEY = 'mergePdfOrderV1';
type OrderEntry = { name: string; size: number; lastModified: number };

interface FileEntry {
  id: string;
  file: File;
  thumb: string | null;
  pageCount: number;
  loadingThumb: boolean;
}

function saveOrderToSession(entries: FileEntry[]) {
  try {
    const payload: OrderEntry[] = entries.map(e => ({
      name: e.file.name, size: e.file.size, lastModified: e.file.lastModified,
    }));
    sessionStorage.setItem(ORDER_KEY, JSON.stringify(payload));
  } catch { /* ignore */ }
}

function loadOrderFromSession(): OrderEntry[] | null {
  try {
    const raw = sessionStorage.getItem(ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OrderEntry[];
    return Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

async function generateThumb(file: File): Promise<{ thumb: string; pageCount: number }> {
  try {
    const ab = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
    const pageCount = pdf.numPages;
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 0.4 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
    const thumb = canvas.toDataURL('image/jpeg', 0.75);
    canvas.width = 0; canvas.height = 0;
    page.cleanup();
    return { thumb, pageCount };
  } catch {
    return { thumb: '', pageCount: 0 };
  }
}

async function isPageBlank(pdfJsDoc: any, pageNum: number): Promise<boolean> {
  try {
    const page = await pdfJsDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const hasText = textContent.items.some((item: any) => item.str && item.str.trim().length > 0);
    if (hasText) {
      page.cleanup();
      return false;
    }
    const vp = page.getViewport({ scale: 0.25 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(10, Math.round(vp.width));
    canvas.height = Math.max(10, Math.round(vp.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      page.cleanup();
      return false;
    }
    await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let darkPixelCount = 0;
    const totalPixels = canvas.width * canvas.height;
    for (let i = 0; i < imgData.length; i += 4) {
      const r = imgData[i];
      const g = imgData[i + 1];
      const b = imgData[i + 2];
      const a = imgData[i + 3];
      if (a > 50 && (r < 235 || g < 235 || b < 235)) {
        darkPixelCount++;
      }
    }
    canvas.width = 0; canvas.height = 0;
    page.cleanup();
    return darkPixelCount / totalPixels < 0.0025;
  } catch {
    return false;
  }
}

export default function MergePDF() {
  useSEO(
    'Merge PDF Online Free — Combine Multiple PDF Files in Seconds',
    'Merge multiple PDF files into one document with live page previews. Free online PDF combiner — fast, private, runs 100% in your browser without uploads.'
  );

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mergeProgress, setMergeProgress] = useState('');
  const [mergedPdfUrl, setMergedPdfUrl] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [orderHint, setOrderHint] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  // ── Smart Enterprise Merge Settings ──
  const [generateToc, setGenerateToc] = useState(false);
  const [pageSizeMode, setPageSizeMode] = useState<'original' | 'a4' | 'letter'>('original');
  const [removeBlankPages, setRemoveBlankPages] = useState(false);

  const toast = useToast();

  // Cleanup merged blob URL on unmount
  useEffect(() => {
    return () => { if (mergedPdfUrl) URL.revokeObjectURL(mergedPdfUrl); };
  }, [mergedPdfUrl]);

  useEffect(() => {
    if (entries.length > 0) saveOrderToSession(entries);
    setTotalPages(entries.reduce((s, e) => s + e.pageCount, 0));
  }, [entries]);

  const addFiles = useCallback(async (newFiles: File[]) => {
    setMergedPdfUrl(null);
    const initialEntries: FileEntry[] = newFiles.map(f => ({
      id: `${f.name}-${f.size}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      file: f, thumb: null, pageCount: 0, loadingThumb: true,
    }));
    setEntries(prev => [...prev, ...initialEntries]);

    // Generate thumbnails async for each new file
    for (const entry of initialEntries) {
      const { thumb, pageCount } = await generateThumb(entry.file);
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, thumb, pageCount, loadingThumb: false } : e));
    }
  }, []);

  const handleDrop = (acceptedFiles: File[]) => addFiles(acceptedFiles);

  const removeFile = (index: number) => setEntries(prev => prev.filter((_, i) => i !== index));

  const moveFile = (index: number, dir: 'up' | 'down') => {
    const target = dir === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= entries.length) return;
    setEntries(prev => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleDragStart = (i: number) => setDragIndex(i);
  const handleDragEnter = (i: number) => setDragOver(i);
  const handleDragEnd = () => {
    if (dragIndex !== null && dragOver !== null && dragIndex !== dragOver) {
      setEntries(prev => {
        const next = [...prev];
        const [removed] = next.splice(dragIndex, 1);
        next.splice(dragOver, 0, removed);
        return next;
      });
    }
    setDragIndex(null); setDragOver(null);
  };

  const restoreSavedOrder = useCallback(() => {
    const order = loadOrderFromSession();
    if (!order?.length) {
      setOrderHint('No saved order yet — reorder once, then try again.');
      return;
    }
    setEntries(prev => {
      const next = [...prev].sort((a, b) => {
        const ia = order.findIndex(e => e.name === a.file.name && e.size === a.file.size);
        const ib = order.findIndex(e => e.name === b.file.name && e.size === b.file.size);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      });
      return next;
    });
    setOrderHint('Restored last saved order!');
    setTimeout(() => setOrderHint(null), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (mergedPdfUrl) URL.revokeObjectURL(mergedPdfUrl);
    };
  }, [mergedPdfUrl]);

  const mergePdfs = async () => {
    if (entries.length < 2) return;
    setIsProcessing(true);
    setMergeProgress('Preparing documents...');
    if (mergedPdfUrl) URL.revokeObjectURL(mergedPdfUrl);
    setMergedPdfUrl(null);
    try {
      const mergedPdf = await PDFDocument.create();
      let skippedBlankCount = 0;
      const filePageMaps: { name: string; startPage: number; pageCount: number }[] = [];

      for (let fi = 0; fi < entries.length; fi++) {
        const entry = entries[fi];
        setMergeProgress(`Processing file ${fi + 1} of ${entries.length}: ${entry.file.name}...`);
        const ab = await entry.file.arrayBuffer();
        let pdf: PDFDocument;
        try {
          pdf = await PDFDocument.load(ab);
        } catch (loadErr: any) {
          const errMsg = loadErr?.message?.toLowerCase() || '';
          if (errMsg.includes('encrypt') || errMsg.includes('password')) {
            throw new Error(`"${entry.file.name}" is password-protected. Please unlock it with our Unlock PDF tool before merging.`);
          }
          throw new Error(`Could not read "${entry.file.name}". The file may be damaged.`);
        }

        let pdfJsDoc: any = null;
        if (removeBlankPages) {
          try {
            pdfJsDoc = await pdfjsLib.getDocument({ data: ab.slice(0) }).promise;
          } catch {}
        }

        const totalSourcePages = pdf.getPageCount();
        const pagesToInclude: number[] = [];
        for (let pIdx = 0; pIdx < totalSourcePages; pIdx++) {
          if (removeBlankPages && pdfJsDoc) {
            const isBlank = await isPageBlank(pdfJsDoc, pIdx + 1);
            if (isBlank) {
              skippedBlankCount++;
              continue;
            }
          }
          pagesToInclude.push(pIdx);
        }

        if (pdfJsDoc) {
          try { pdfJsDoc.destroy(); } catch {}
        }

        if (pagesToInclude.length === 0) continue;

        const currentMergedCount = mergedPdf.getPageCount();
        const startPageNumber = currentMergedCount + 1 + (generateToc ? 1 : 0);

        if (pageSizeMode === 'original') {
          const copied = await mergedPdf.copyPages(pdf, pagesToInclude);
          copied.forEach(p => mergedPdf.addPage(p));
        } else {
          // Normalize to A4 (595.28 x 841.89) or US Letter (612 x 792)
          const targetW = pageSizeMode === 'a4' ? 595.28 : 612;
          const targetH = pageSizeMode === 'a4' ? 841.89 : 792;
          const embedded = await mergedPdf.embedPdf(pdf, pagesToInclude);
          for (const embPage of embedded) {
            const newPage = mergedPdf.addPage([targetW, targetH]);
            const pad = 36;
            const scale = Math.min((targetW - pad * 2) / embPage.width, (targetH - pad * 2) / embPage.height);
            const sw = embPage.width * scale;
            const sh = embPage.height * scale;
            newPage.drawPage(embPage, {
              x: (targetW - sw) / 2,
              y: (targetH - sh) / 2,
              width: sw,
              height: sh,
            });
          }
        }

        filePageMaps.push({
          name: entry.file.name,
          startPage: startPageNumber,
          pageCount: pagesToInclude.length,
        });
      }

      // Generate Clickable Table of Contents if requested
      if (generateToc && filePageMaps.length > 0) {
        setMergeProgress('Generating Smart Table of Contents with Clickable Links...');
        const tocPage = mergedPdf.insertPage(0, [595.28, 841.89]);
        const helvBold = await mergedPdf.embedFont(StandardFonts.HelveticaBold);
        const helv = await mergedPdf.embedFont(StandardFonts.Helvetica);

        // Header Title
        tocPage.drawText('TABLE OF CONTENTS', {
          x: 48,
          y: 770,
          size: 22,
          font: helvBold,
          color: rgb(0.1, 0.12, 0.18),
        });

        tocPage.drawText('Click on any document below to jump directly to its first page.', {
          x: 48,
          y: 748,
          size: 10,
          font: helv,
          color: rgb(0.45, 0.5, 0.58),
        });

        // Decorative horizontal accent bar
        tocPage.drawRectangle({
          x: 48,
          y: 735,
          width: 500,
          height: 2,
          color: rgb(0.85, 0.2, 0.2),
        });

        let curY = 700;
        const linkAnnots: any[] = [];

        for (let i = 0; i < filePageMaps.length && curY > 60; i++) {
          const doc = filePageMaps[i];
          const rawName = doc.name.replace(/\.pdf$/i, '');
          const maxNameLen = 48;
          const displayName = rawName.length > maxNameLen ? rawName.slice(0, maxNameLen - 3) + '...' : rawName;
          const pageStr = `Page ${doc.startPage}`;

          // Draw document title
          tocPage.drawText(`${i + 1}.  ${displayName}`, {
            x: 48,
            y: curY,
            size: 11,
            font: helvBold,
            color: rgb(0.12, 0.15, 0.22),
          });

          // Draw dotted leader
          const titleWidth = helvBold.widthOfTextAtSize(`${i + 1}.  ${displayName}`, 11);
          const pageNumWidth = helv.widthOfTextAtSize(pageStr, 11);
          const dotsStart = 56 + titleWidth;
          const dotsEnd = 540 - pageNumWidth;
          if (dotsEnd > dotsStart + 20) {
            const dotStep = 6;
            for (let dotX = dotsStart; dotX < dotsEnd; dotX += dotStep) {
              tocPage.drawText('.', {
                x: dotX,
                y: curY,
                size: 9,
                font: helv,
                color: rgb(0.7, 0.72, 0.78),
              });
            }
          }

          // Draw Page Number
          tocPage.drawText(pageStr, {
            x: 548 - pageNumWidth,
            y: curY,
            size: 11,
            font: helv,
            color: rgb(0.85, 0.2, 0.2),
          });

          // Create Real Clickable Internal PDF Link Annotation
          const targetPageIndex = doc.startPage - 1;
          if (targetPageIndex >= 0 && targetPageIndex < mergedPdf.getPageCount()) {
            const targetPageRef = mergedPdf.getPage(targetPageIndex).ref;
            const dest = mergedPdf.context.obj([targetPageRef, PDFName.of('Fit')]);
            const linkAnnot = mergedPdf.context.obj({
              Type: PDFName.of('Annot'),
              Subtype: PDFName.of('Link'),
              Rect: [44, curY - 4, 552, curY + 14],
              Border: [0, 0, 0],
              Dest: dest,
            });
            const linkRef = mergedPdf.context.register(linkAnnot);
            linkAnnots.push(linkRef);
          }

          curY -= 26;
        }

        if (linkAnnots.length > 0) {
          tocPage.node.set(PDFName.of('Annots'), mergedPdf.context.obj(linkAnnots));
        }
      }

      setMergeProgress('Finalizing document...');
      const bytes = await mergedPdf.save();
      const blob = new Blob([bytes as any], { type: 'application/pdf' });
      if (mergedPdfUrl) URL.revokeObjectURL(mergedPdfUrl);
      setMergedPdfUrl(URL.createObjectURL(blob));

      const totalResultPages = mergedPdf.getPageCount();
      let successMsg = `Merged ${entries.length} files (${totalResultPages} pages) successfully!`;
      if (skippedBlankCount > 0) {
        successMsg += ` (Purged ${skippedBlankCount} blank page${skippedBlankCount !== 1 ? 's' : ''})`;
      }
      toast.success(successMsg);
    } catch (e: any) {
      console.error('Merge error:', e);
      toast.error(e?.message || 'An error occurred while merging. Please try again.');
    } finally {
      setIsProcessing(false);
      setMergeProgress('');
    }
  };

  const renderSmartOptions = () => (
    <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-red-600" />
          <h3 className="text-base font-bold text-gray-900">Smart Merge Enhancements</h3>
          <span className="text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Pro Features</span>
        </div>
        <span className="text-xs text-gray-400">Configure before or after uploading</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Option 1: Table of Contents */}
        <label className={`flex flex-col justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${generateToc ? 'border-red-500 bg-red-50/40 shadow-xs' : 'border-gray-100 bg-gray-50/50 hover:border-gray-200'}`}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <BookOpen className={`w-4 h-4 ${generateToc ? 'text-red-600' : 'text-gray-500'}`} />
              <span className="text-sm font-bold text-gray-900">Clickable Index (TOC)</span>
            </div>
            <input
              type="checkbox"
              checked={generateToc}
              onChange={e => setGenerateToc(e.target.checked)}
              className="w-4 h-4 accent-red-600 rounded cursor-pointer mt-0.5"
            />
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            Adds a Page 1 Index with <strong>clickable links</strong> jumping directly to each document.
          </p>
        </label>

        {/* Option 2: Page Size Normalizer */}
        <div className="flex flex-col justify-between p-4 rounded-xl border-2 border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2 mb-2">
            <Maximize2 className="w-4 h-4 text-gray-700" />
            <span className="text-sm font-bold text-gray-900">Page Dimensions</span>
          </div>
          <select
            value={pageSizeMode}
            onChange={e => setPageSizeMode(e.target.value as any)}
            className="w-full text-xs font-semibold bg-white border border-gray-200 rounded-lg p-2 text-gray-800 focus:outline-none focus:border-red-500 cursor-pointer"
          >
            <option value="original">Original Page Sizes (Keep as-is)</option>
            <option value="a4">Standardize to A4 (Proportional Center)</option>
            <option value="letter">Standardize to US Letter (Proportional)</option>
          </select>
          <p className="text-[11px] text-gray-400 mt-2">
            Fixes mismatched receipts & landscape scans.
          </p>
        </div>

        {/* Option 3: Auto-Purge Blank Pages */}
        <label className={`flex flex-col justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${removeBlankPages ? 'border-red-500 bg-red-50/40 shadow-xs' : 'border-gray-100 bg-gray-50/50 hover:border-gray-200'}`}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Trash2 className={`w-4 h-4 ${removeBlankPages ? 'text-red-600' : 'text-gray-500'}`} />
              <span className="text-sm font-bold text-gray-900">Purge Blank Pages</span>
            </div>
            <input
              type="checkbox"
              checked={removeBlankPages}
              onChange={e => setRemoveBlankPages(e.target.checked)}
              className="w-4 h-4 accent-red-600 rounded cursor-pointer mt-0.5"
            />
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            Scans & skips empty white scanner pages before merging.
          </p>
        </label>
      </div>
    </div>
  );

  return (
    <ToolWorkspaceShell
      title="Merge PDF Files"
      subtitle="Combine multiple PDFs into one. See thumbnail previews, drag to reorder."
      categoryLabel="PDF Assembly · Browser Engine"
      icon={Layers}
      microVariant="merge"
      tone="rose"
    >
      <div className="flex flex-col items-center">
        <div className="flex flex-wrap items-center justify-center gap-2 mb-7">
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-rose-100/80 text-rose-800 border border-rose-200/70">
            📑 Smart Clickable TOC Index
          </span>
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-sky-100/80 text-sky-800 border border-sky-200/70">
            📐 A4 / Letter Normalizer
          </span>
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100/80 text-emerald-800 border border-emerald-200/70">
            🧹 Auto-Purge Blank Pages
          </span>
          <Link
            to="/alternate-mix"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-violet-100/80 text-violet-800 hover:bg-violet-200/80 transition-colors border border-violet-200/70"
          >
            🔀 Alternate & Mix →
          </Link>
        </div>

      {entries.length === 0 ? (
        <div className="w-full max-w-5xl space-y-6">
          <FileDropzone onDrop={handleDrop} multiple title="Drop PDFs here or click to select multiple" />
          {renderSmartOptions()}
        </div>
      ) : mergedPdfUrl ? (
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Layers className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-1">Merged Successfully!</h3>
          <p className="text-gray-500 mb-6">{entries.length} files · {totalPages} total pages</p>
          <a href={mergedPdfUrl} download="merged.pdf"
            className="inline-flex items-center gap-2 px-8 py-4 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-md mb-4">
            <Download className="w-5 h-5" /> Download merged.pdf
          </a>
          <br />
          <button onClick={() => { setEntries([]); setMergedPdfUrl(null); }}
            className="text-gray-500 hover:text-gray-800 font-medium text-sm mt-2">
            Merge more PDFs
          </button>
        </div>
      ) : (
        <div className="w-full max-w-5xl space-y-5">
          {/* Stats bar */}
          <div className="flex items-center justify-between p-4 bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-4">
              <span className="text-sm font-semibold text-gray-700">{entries.length} file{entries.length !== 1 ? 's' : ''}</span>
              {totalPages > 0 && <span className="text-sm text-gray-400">· {totalPages} total pages</span>}
            </div>
            <div className="flex gap-2">
              <button onClick={restoreSavedOrder}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition-colors border border-indigo-100">
                <ListRestart className="w-3.5 h-3.5" /> Restore Order
              </button>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-100 transition-colors border border-gray-200 cursor-pointer">
                <Plus className="w-3.5 h-3.5" /> Add More
                <input type="file" accept=".pdf" multiple className="hidden" onChange={e => { if (e.target.files) addFiles(Array.from(e.target.files)); }} />
              </label>
            </div>
          </div>

          {orderHint && (
            <p className="text-sm text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2">{orderHint}</p>
          )}

          {/* File list with thumbnails */}
          <div className="grid grid-cols-1 gap-3">
            {entries.map((entry, index) => (
              <div
                key={entry.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragEnter={() => handleDragEnter(index)}
                onDragEnd={handleDragEnd}
                onDragOver={e => e.preventDefault()}
                className={`flex items-center gap-4 p-4 bg-white rounded-2xl border-2 transition-all shadow-sm cursor-grab active:cursor-grabbing ${dragOver === index && dragIndex !== index ? 'border-red-400 bg-red-50' : 'border-gray-100 hover:border-gray-200'}`}
              >
                {/* Drag handle */}
                <div className="text-gray-300 hover:text-gray-500 transition-colors shrink-0">
                  <GripVertical className="w-5 h-5" />
                </div>

                {/* Page 1 thumbnail */}
                <div className="w-16 h-20 bg-gray-100 rounded-lg overflow-hidden shrink-0 border border-gray-200 shadow-sm flex items-center justify-center">
                  {entry.loadingThumb ? (
                    <div className="w-5 h-5 border-2 border-gray-300 border-t-red-500 rounded-full animate-spin" />
                  ) : entry.thumb ? (
                    <img src={entry.thumb} alt={entry.file.name} className="w-full h-full object-cover" />
                  ) : (
                    <FileText className="w-6 h-6 text-gray-400" />
                  )}
                </div>

                {/* File info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{entry.file.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-gray-400">{(entry.file.size / 1024 / 1024).toFixed(2)} MB</span>
                    {entry.pageCount > 0 && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{entry.pageCount} page{entry.pageCount !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                  {/* Merge order label */}
                  <span className="text-xs text-red-500 font-semibold mt-1 inline-block"># {index + 1}</span>
                </div>

                {/* Up/Down + Delete */}
                <div className="flex flex-col gap-1 shrink-0">
                  <button onClick={() => moveFile(index, 'up')} disabled={index === 0}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 disabled:opacity-20 transition-colors">
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button onClick={() => moveFile(index, 'down')} disabled={index === entries.length - 1}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 disabled:opacity-20 transition-colors">
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
                <button onClick={() => removeFile(index)}
                  className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* ── Smart Merge Enterprise Options ── */}
          {renderSmartOptions()}

          {/* Merge button */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            {entries.length < 2 && (
              <p className="text-center text-sm text-amber-600 bg-amber-50 rounded-xl py-2 mb-4">Add at least 2 PDF files to merge.</p>
            )}
            <button onClick={mergePdfs} disabled={entries.length < 2 || isProcessing}
              className="w-full py-4 bg-red-600 text-white text-base font-bold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 shadow-md flex items-center justify-center gap-2">
              {isProcessing ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{mergeProgress || `Merging ${entries.length} files...`}</>
              ) : (
                <><Layers className="w-5 h-5" />Merge {entries.length} PDF{entries.length !== 1 ? 's' : ''} into One</>
              )}
            </button>
            <p className="text-center text-xs text-gray-400 mt-3">Files are merged in the order shown above. Drag to reorder.</p>
          </div>
        </div>
      )}
      {/* SEO Information & FAQs Section */}
      <ToolSEOSection
        toolName="Merge PDF"
        headline="Free Online PDF Merger — Combine PDF Documents Privately"
        description="Merge two or more PDF files into a single organized document in seconds. Reorder pages with visual drag-and-drop previews. No file size limits, zero uploads, 100% private in your browser."
        steps={[
          {
            step: '01',
            title: 'Upload PDF Files',
            desc: 'Select or drag and drop multiple PDF files from your computer or phone.',
          },
          {
            step: '02',
            title: 'Arrange Page Order',
            desc: 'View first-page thumbnails and drag to reorder files exactly as you want them merged.',
          },
          {
            step: '03',
            title: 'Download Merged PDF',
            desc: 'Click "Merge PDF" and instantly download your single combined PDF document.',
          },
        ]}
        faqs={[
          {
            q: 'Is it safe to merge confidential PDFs on PDF Media Suite?',
            a: 'Yes, 100% safe. All file processing happens locally in your web browser using WebAssembly. Your files are never sent to any external server or saved in the cloud.',
          },
          {
            q: 'Can I reorder the PDF files before merging?',
            a: 'Yes! Drag and drop the file cards or use the Up/Down arrow buttons to set the exact sequence you want before clicking merge.',
          },
          {
            q: 'Is there a limit on how many PDFs I can merge?',
            a: 'No, PDF Media Suite has no limits on file count or total page numbers. You can merge as many documents as needed completely free.',
          },
          {
            q: 'Does merging PDFs reduce the quality of text or images?',
            a: 'No. The merger performs lossless vector-level document assembly, preserving original vector fonts, crisp resolution, and document metadata.',
          },
        ]}
        relatedTools={[
          { name: 'Split PDF', path: '/split', desc: 'Separate PDF pages into individual files' },
          { name: 'Compress PDF', path: '/compress', desc: 'Reduce PDF file size without quality loss' },
          { name: 'Organize PDF', path: '/organize', desc: 'Rearrange, rotate, or delete specific pages' },
          { name: 'PDF to Word', path: '/pdf-to-word', desc: 'Convert PDF to editable DOCX format' },
        ]}
      />
      </div>
    </ToolWorkspaceShell>
  );
}
