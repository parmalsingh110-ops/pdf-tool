import React, { useState, useRef, useEffect } from 'react';
import { FileText, Download, Loader2, Plus, Type, CheckSquare } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import FileDropzone from '../components/FileDropzone';

interface FormField {
  id: string;
  type: 'text' | 'checkbox';
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  value: string;
  checked: boolean;
  fontSize: number;
}

export default function PdfFormFiller() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [fields, setFields] = useState<FormField[]>([]);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<'text' | 'checkbox' | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageScale, setPageScale] = useState(1);
  const [pageDims, setPageDims] = useState<{ w: number; h: number }[]>([]);

  const handleDrop = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setFields([]);
    setResultUrl(null);
    setBusy(true);

    try {
      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const imgs: string[] = [];
      const dims: { w: number; h: number }[] = [];
      const scale = 1.5;
      setPageScale(scale);

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale });
        dims.push({ w: vp.width, h: vp.height });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
        imgs.push(canvas.toDataURL('image/jpeg', 0.85));
        canvas.width = 0;
        canvas.height = 0;
      }

      setPageImages(imgs);
      setPageDims(dims);
      setCurrentPage(0);
    } catch (e: any) {
      alert(e?.message || 'Failed to load PDF.');
    } finally {
      setBusy(false);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!addMode || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newField: FormField = {
      id: Date.now().toString(),
      type: addMode,
      x, y,
      width: addMode === 'text' ? 200 : 20,
      height: addMode === 'text' ? 24 : 20,
      page: currentPage,
      value: '',
      checked: false,
      fontSize: 12,
    };
    setFields(prev => [...prev, newField]);
    setSelectedField(newField.id);
    setAddMode(null);
  };

  const updateField = (id: string, updates: Partial<FormField>) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const deleteField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
    if (selectedField === id) setSelectedField(null);
  };

  const exportPdf = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(buf);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();

      for (const field of fields) {
        if (field.page >= pages.length) continue;
        const page = pages[field.page];
        const { height } = page.getSize();

        // Convert from scaled canvas coords to PDF points
        const pdfX = field.x / pageScale;
        const pdfY = height - (field.y / pageScale);

        if (field.type === 'text' && field.value.trim()) {
          page.drawText(field.value, {
            x: pdfX,
            y: pdfY - field.fontSize,
            size: field.fontSize,
            font,
            color: rgb(0, 0, 0),
          });
        } else if (field.type === 'checkbox' && field.checked) {
          const s = 14 / pageScale;
          page.drawRectangle({ x: pdfX, y: pdfY - s, width: s, height: s, borderColor: rgb(0, 0, 0), borderWidth: 1 });
          page.drawText('✓', { x: pdfX + 2, y: pdfY - s + 2, size: s - 2, font, color: rgb(0, 0, 0) });
        }
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      alert(e?.message || 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  const currentFields = fields.filter(f => f.page === currentPage);
  const selected = fields.find(f => f.id === selectedField);

  return (
    <div className="flex-1 flex flex-col items-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">PDF Form Filler</h1>
        <p className="text-xl text-gray-600">Add text fields and checkboxes to fill any PDF form interactively.</p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF form" />
      ) : (
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-2 flex-wrap bg-gray-50 rounded-xl p-3 border border-gray-200">
              <button onClick={() => setAddMode(addMode === 'text' ? null : 'text')}
                className={`px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 ${addMode === 'text' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                <Type className="w-4 h-4" /> Add Text
              </button>
              <button onClick={() => setAddMode(addMode === 'checkbox' ? null : 'checkbox')}
                className={`px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 ${addMode === 'checkbox' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                <CheckSquare className="w-4 h-4" /> Add Checkbox
              </button>
              <div className="flex-1" />
              <span className="text-xs text-gray-500">Page {currentPage + 1} / {pageImages.length}</span>
              <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0} className="px-2 py-1 bg-gray-200 rounded text-xs font-bold disabled:opacity-30">←</button>
              <button onClick={() => setCurrentPage(p => Math.min(pageImages.length - 1, p + 1))} disabled={currentPage >= pageImages.length - 1} className="px-2 py-1 bg-gray-200 rounded text-xs font-bold disabled:opacity-30">→</button>
            </div>
            {addMode && <p className="text-sm text-blue-600 font-semibold text-center animate-pulse">Click on the PDF to place a {addMode} field</p>}

            {/* PDF page with overlay fields */}
            <div ref={containerRef} className="relative bg-gray-100 rounded-xl overflow-auto border border-gray-200 cursor-crosshair" style={{ maxHeight: 600 }}
              onClick={handleCanvasClick}>
              {pageImages[currentPage] && <img src={pageImages[currentPage]} alt={`Page ${currentPage + 1}`} className="block" draggable={false} />}
              {currentFields.map(field => (
                <div key={field.id} className={`absolute border-2 ${selectedField === field.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-blue-300'} rounded cursor-pointer`}
                  style={{ left: field.x, top: field.y, width: field.width, height: field.height }}
                  onClick={e => { e.stopPropagation(); setSelectedField(field.id); }}>
                  {field.type === 'text' ? (
                    <input type="text" value={field.value} onChange={e => { e.stopPropagation(); updateField(field.id, { value: e.target.value }); }}
                      className="w-full h-full px-1 bg-yellow-50/80 border-none outline-none text-xs" placeholder="Type here…"
                      style={{ fontSize: field.fontSize * 0.8 }}
                      onClick={e => e.stopPropagation()} />
                  ) : (
                    <label className="w-full h-full flex items-center justify-center bg-yellow-50/80 cursor-pointer" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={field.checked} onChange={e => updateField(field.id, { checked: e.target.checked })} />
                    </label>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Properties panel */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4 h-fit">
            <h3 className="font-bold text-gray-900 text-sm">Properties</h3>
            {selected ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Type: {selected.type}</p>
                {selected.type === 'text' && (
                  <>
                    <label className="block text-xs font-medium text-gray-700">
                      Font Size
                      <input type="number" value={selected.fontSize} min={6} max={36} onChange={e => updateField(selected.id, { fontSize: Number(e.target.value) })} className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                    </label>
                    <label className="block text-xs font-medium text-gray-700">
                      Width
                      <input type="number" value={selected.width} min={40} max={500} onChange={e => updateField(selected.id, { width: Number(e.target.value) })} className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                    </label>
                  </>
                )}
                <button onClick={() => deleteField(selected.id)} className="w-full py-2 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100">Delete field</button>
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">Select a field to edit its properties</p>
            )}
            <hr className="border-gray-200" />
            <p className="text-xs text-gray-500">{fields.length} field(s) total</p>
            <div className="flex flex-col gap-2 pt-2">
              <button onClick={exportPdf} disabled={busy || fields.length === 0}
                className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {busy ? 'Exporting…' : 'Export Filled PDF'}
              </button>
              {resultUrl && (
                <a href={resultUrl} download={`filled_${file.name}`} className="w-full py-2.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 flex items-center justify-center gap-2 text-sm">
                  <Download className="w-4 h-4" /> Download
                </a>
              )}
              <button onClick={() => { setFile(null); setPageImages([]); setFields([]); if (resultUrl) URL.revokeObjectURL(resultUrl); setResultUrl(null); }}
                className="w-full py-2 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200">New PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
