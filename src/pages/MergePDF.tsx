import { useState, useEffect, useCallback } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Download, Trash2, GripVertical, FileText, ListRestart } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';

const ORDER_KEY = 'mergePdfOrderV1';

type OrderEntry = { name: string; size: number; lastModified: number };

function saveOrderToSession(files: File[]) {
  try {
    const payload: OrderEntry[] = files.map((f) => ({
      name: f.name,
      size: f.size,
      lastModified: f.lastModified,
    }));
    sessionStorage.setItem(ORDER_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function loadOrderFromSession(): OrderEntry[] | null {
  try {
    const raw = sessionStorage.getItem(ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OrderEntry[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sortFilesBySavedOrder(files: File[], order: OrderEntry[]): File[] {
  const score = (f: File) => {
    const i = order.findIndex(
      (e) => e.name === f.name && e.size === f.size && e.lastModified === f.lastModified,
    );
    return i === -1 ? 1_000_000 + f.lastModified : i;
  };
  return [...files].sort((a, b) => score(a) - score(b));
}

export default function MergePDF() {
  usePageSEO('Merge PDF Online Free', 'Combine multiple PDF files into one document. Free online PDF merger — fast, private, no uploads. Drag & drop to merge PDFs instantly.');
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mergedPdfUrl, setMergedPdfUrl] = useState<string | null>(null);
  const [orderHint, setOrderHint] = useState<string | null>(null);

  useEffect(() => {
    if (files.length === 0) return;
    saveOrderToSession(files);
  }, [files]);

  const restoreSavedOrder = useCallback(() => {
    const order = loadOrderFromSession();
    if (!order || order.length === 0) {
      setOrderHint('No saved order in this tab yet — reorder once, then try again.');
      return;
    }
    setFiles((prev) => sortFilesBySavedOrder(prev, order));
    setOrderHint('Applied last saved order for matching files (name + size + date).');
  }, []);

  const handleDrop = (acceptedFiles: File[]) => {
    setFiles((prev) => [...prev, ...acceptedFiles]);
    setMergedPdfUrl(null);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const moveFile = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) || 
      (direction === 'down' && index === files.length - 1)
    ) return;

    const newFiles = [...files];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newFiles[index], newFiles[targetIndex]] = [newFiles[targetIndex], newFiles[index]];
    setFiles(newFiles);
  };

  const mergePdfs = async () => {
    if (files.length < 2) return;
    
    setIsProcessing(true);
    try {
      const mergedPdf = await PDFDocument.create();

      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const pdfBytes = await mergedPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setMergedPdfUrl(url);
    } catch (error) {
      console.error("Error merging PDFs:", error);
      alert("An error occurred while merging the PDFs.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Merge PDF files</h1>
        <p className="text-xl text-gray-600">Combine PDFs in the order you want with the easiest PDF merger available.</p>
      </div>

      {files.length === 0 ? (
        <FileDropzone onDrop={handleDrop} multiple={true} />
      ) : (
        <div className="w-full max-w-4xl bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
            <h2 className="text-xl font-semibold text-gray-800">Selected Files ({files.length})</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={restoreSavedOrder}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-800 rounded-lg hover:bg-indigo-100 font-medium transition-colors border border-indigo-200"
              >
                <ListRestart className="w-4 h-4" />
                Restore saved order
              </button>
            <label className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 cursor-pointer font-medium transition-colors">
              Add more files
              <input 
                type="file" 
                accept=".pdf" 
                multiple 
                className="hidden" 
                onChange={(e) => {
                  if (e.target.files) {
                    handleDrop(Array.from(e.target.files));
                  }
                }} 
              />
            </label>
            </div>
          </div>
          {orderHint && (
            <p className="text-sm text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mb-4">
              {orderHint}
            </p>
          )}

          <div className="space-y-3 mb-8 max-h-[50vh] overflow-y-auto pr-2">
            {files.map((file, index) => (
              <div key={`${file.name}-${index}`} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200 group">
                <div className="flex flex-col gap-1 text-gray-400">
                  <button onClick={() => moveFile(index, 'up')} disabled={index === 0} className="hover:text-gray-700 disabled:opacity-30">
                    <GripVertical className="w-5 h-5" />
                  </button>
                </div>
                <div className="w-10 h-10 bg-red-100 text-red-600 rounded-lg flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <button 
                  onClick={() => removeFile(index)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>

          {!mergedPdfUrl ? (
            <div className="flex justify-center">
              <button
                onClick={mergePdfs}
                disabled={files.length < 2 || isProcessing}
                className="px-8 py-4 bg-red-600 text-white text-lg font-bold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center gap-2"
              >
                {isProcessing ? 'Merging...' : 'Merge PDF'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 p-8 bg-green-50 rounded-xl border border-green-200">
              <h3 className="text-2xl font-bold text-green-800">PDFs merged successfully!</h3>
              <a
                href={mergedPdfUrl}
                download="merged.pdf"
                className="px-8 py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 transition-colors shadow-md flex items-center gap-2"
              >
                <Download className="w-6 h-6" />
                Download merged PDF
              </a>
              <button 
                onClick={() => { setFiles([]); setMergedPdfUrl(null); }}
                className="text-gray-600 hover:text-gray-900 font-medium mt-2"
              >
                Merge more PDFs
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
