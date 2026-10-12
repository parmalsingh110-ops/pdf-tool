import { useState, useEffect, useCallback } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Download, Trash2, GripVertical, FileText, ListRestart, ChevronUp, ChevronDown, Plus, Layers } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

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

export default function MergePDF() {
  useSEO('Merge PDF Online Free | PDF Media Suite', 'Combine multiple PDF files into one. See page previews before merging. Free, browser-based, no upload required.');
  usePageSEO('Merge PDF Online Free', 'Combine multiple PDF files into one document with page previews. Free online PDF merger — fast, private, no uploads. Drag & drop to merge PDFs instantly.');

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mergedPdfUrl, setMergedPdfUrl] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [orderHint, setOrderHint] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

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

  const mergePdfs = async () => {
    if (entries.length < 2) return;
    setIsProcessing(true);
    try {
      const mergedPdf = await PDFDocument.create();
      for (const entry of entries) {
        const ab = await entry.file.arrayBuffer();
        const pdf = await PDFDocument.load(ab);
        const copied = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copied.forEach(p => mergedPdf.addPage(p));
      }
      const bytes = await mergedPdf.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      setMergedPdfUrl(URL.createObjectURL(blob));
    } catch (e) {
      console.error('Merge error:', e);
      alert('An error occurred while merging. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-6 md:p-8 min-h-screen bg-gradient-to-br from-red-50/40 via-white to-slate-50">
      <div className="text-center mb-10 max-w-2xl">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-red-100 rounded-2xl mb-4">
          <Layers className="w-7 h-7 text-red-600" />
        </div>
        <h1 className="text-4xl font-extrabold text-gray-900 mb-3">Merge PDF Files</h1>
        <p className="text-lg text-gray-500">Combine multiple PDFs into one. See thumbnail previews, drag to reorder.</p>
      </div>

      {entries.length === 0 ? (
        <FileDropzone onDrop={handleDrop} multiple title="Drop PDFs here or click to select multiple" />
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

          {/* Merge button */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            {entries.length < 2 && (
              <p className="text-center text-sm text-amber-600 bg-amber-50 rounded-xl py-2 mb-4">Add at least 2 PDF files to merge.</p>
            )}
            <button onClick={mergePdfs} disabled={entries.length < 2 || isProcessing}
              className="w-full py-4 bg-red-600 text-white text-base font-bold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 shadow-md flex items-center justify-center gap-2">
              {isProcessing ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Merging {entries.length} files...</>
              ) : (
                <><Layers className="w-5 h-5" />Merge {entries.length} PDF{entries.length !== 1 ? 's' : ''} into One</>
              )}
            </button>
            <p className="text-center text-xs text-gray-400 mt-3">Files are merged in the order shown above. Drag to reorder.</p>
          </div>
        </div>
      )}
    </div>
  );
}
