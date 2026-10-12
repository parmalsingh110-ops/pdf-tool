import React, { useState, useRef, useEffect } from 'react';
import { 
  FileText, Download, Loader2, Plus, Type, CheckSquare, PenTool, 
  Trash2, ChevronLeft, ChevronRight, Check, Sparkles, Layers, Sliders
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { PDFDocument, rgb, StandardFonts, PDFTextField, PDFCheckBox, PDFDropdown } from 'pdf-lib';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';

interface ExtractedAcroField {
  name: string;
  type: 'text' | 'checkbox' | 'dropdown' | 'other';
  value: string;
  checked?: boolean;
  options?: string[];
}

interface CustomFormField {
  id: string;
  type: 'text' | 'checkbox' | 'date';
  x: number;
  y: number;
  w: number;
  h: number;
  pageIndex: number;
  value: string;
  checked?: boolean;
}

export default function PdfFormFiller() {
  useSEO(
    'Fill PDF Forms Online Free — Interactive AcroForm & Custom Field Filler',
    'Fill out PDF forms in your browser. Auto-detects native interactive AcroForm fields, textboxes, and checkboxes, or click anywhere to add custom text.'
  );

  usePageSEO(
    'Interactive PDF Form Filler & AcroForm Editor',
    'Fill out government and official PDF forms. Auto-populates native AcroForm fields, supports custom text placement, signature stamping, and flattened export.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);

  // Native AcroForm fields
  const [acroFields, setAcroFields] = useState<ExtractedAcroField[]>([]);
  // Manual / overlay form fields
  const [customFields, setCustomFields] = useState<CustomFormField[]>([]);
  const [addMode, setAddMode] = useState<'text' | 'checkbox' | 'date' | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  const [flattenOnExport, setFlattenOnExport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFileName, setResultFileName] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    const f = files[0];
    setFile(f);
    setResultUrl(null);
    setCustomFields([]);
    setAcroFields([]);
    setCurrentPage(0);
    setBusy(true);

    try {
      const buf = await f.arrayBuffer();

      // Step 1: Detect native AcroForm fields using pdf-lib
      try {
        const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
        const form = pdfDoc.getForm();
        const fields = form.getFields();
        const extracted: ExtractedAcroField[] = [];

        for (const field of fields) {
          const name = field.getName();
          if (field instanceof PDFTextField) {
            extracted.push({ name, type: 'text', value: field.getText() || '' });
          } else if (field instanceof PDFCheckBox) {
            extracted.push({ name, type: 'checkbox', value: '', checked: field.isChecked() });
          } else if (field instanceof PDFDropdown) {
            extracted.push({ name, type: 'dropdown', value: field.getSelected()[0] || '', options: field.getOptions() });
          } else {
            extracted.push({ name, type: 'other', value: '' });
          }
        }
        setAcroFields(extracted);
      } catch (err) {
        console.warn('AcroForm inspection warning:', err);
      }

      // Step 2: Render pages for canvas viewport
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const imgs: string[] = [];

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
        imgs.push(canvas.toDataURL('image/jpeg', 0.88));
      }

      setPageImages(imgs);
    } catch (err: any) {
      alert(`Failed to load PDF: ${err?.message || 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!addMode || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xRel = ((e.clientX - rect.left) / rect.width) * 100;
    const yRel = ((e.clientY - rect.top) / rect.height) * 100;

    const newField: CustomFormField = {
      id: Date.now().toString(),
      type: addMode,
      x: xRel,
      y: yRel,
      w: addMode === 'text' ? 25 : addMode === 'date' ? 20 : 4,
      h: addMode === 'checkbox' ? 4 : 4,
      pageIndex: currentPage,
      value: addMode === 'date' ? new Date().toISOString().split('T')[0] : '',
      checked: false
    };

    setCustomFields(prev => [...prev, newField]);
    setSelectedFieldId(newField.id);
    setAddMode(null);
  };

  const updateCustomField = (id: string, updates: Partial<CustomFormField>) => {
    setCustomFields(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const removeCustomField = (id: string) => {
    setCustomFields(prev => prev.filter(f => f.id !== id));
    if (selectedFieldId === id) setSelectedFieldId(null);
  };

  const updateAcroField = (name: string, value: string, checked?: boolean) => {
    setAcroFields(prev => prev.map(f => f.name === name ? { ...f, value, checked: checked !== undefined ? checked : f.checked } : f));
  };

  const exportFilledPdf = async () => {
    if (!file) return;
    setBusy(true);

    try {
      const buf = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true });

      // 1. Populate native AcroForm fields
      try {
        const form = pdfDoc.getForm();
        for (const acro of acroFields) {
          try {
            if (acro.type === 'text') {
              const f = form.getTextField(acro.name);
              f.setText(acro.value);
            } else if (acro.type === 'checkbox') {
              const f = form.getCheckBox(acro.name);
              if (acro.checked) f.check();
              else f.uncheck();
            } else if (acro.type === 'dropdown') {
              const f = form.getDropdown(acro.name);
              if (acro.value) f.select(acro.value);
            }
          } catch {
            // Ignore single field failure
          }
        }
      } catch (err) {
        console.warn('Form fill warning:', err);
      }

      // 2. Draw manual / custom placed fields
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();

      for (const cf of customFields) {
        const page = pages[cf.pageIndex];
        if (!page) continue;
        const { width, height } = page.getSize();

        const x = (cf.x / 100) * width;
        const y = height - (cf.y / 100) * height;

        if (cf.type === 'text' || cf.type === 'date') {
          if (cf.value) {
            page.drawText(cf.value, {
              x,
              y: y - 10,
              size: 11,
              font: helvetica,
              color: rgb(0.1, 0.1, 0.1)
            });
          }
        } else if (cf.type === 'checkbox') {
          if (cf.checked) {
            page.drawText('✔', {
              x,
              y: y - 10,
              size: 14,
              font: helvetica,
              color: rgb(0.1, 0.3, 0.8)
            });
          }
        }
      }

      // 3. Flatten if requested
      if (flattenOnExport) {
        try {
          pdfDoc.getForm().flatten();
        } catch {}
      }

      const finalBytes = await pdfDoc.save();
      const blob = new Blob([finalBytes as any], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
      setResultFileName(`${file.name.replace(/\.pdf$/i, '')}_Filled.pdf`);
    } catch (err: any) {
      console.error('Export error:', err);
      alert(`Export failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResultUrl(null);
    setCustomFields([]);
    setAcroFields([]);
  };

  const currentPageCustomFields = customFields.filter(f => f.pageIndex === currentPage);

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-4 sm:p-8 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm border border-blue-100 dark:border-blue-900/50">
          <FileText className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-2">
          PDF Form Filler & AcroForm Studio
        </h1>
        <p className="text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          Fill official PDF forms effortlessly. Auto-detects interactive AcroForm text fields and checkboxes, or click to add custom text anywhere.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl space-y-6">
          <FileDropzone 
            onDrop={handleDrop} 
            multiple={false} 
            title="Select PDF Form to Fill" 
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Sparkles className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Native AcroForms</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Auto-detects real government form textboxes & checkboxes.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Type className="w-6 h-6 text-indigo-600 dark:text-indigo-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Click & Type</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Place text or date stamps on scanned non-interactive forms.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Download className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Flatten or Keep Editable</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Choose between permanent flattened print or editable form.</p>
            </div>
          </div>
        </div>
      ) : resultUrl ? (
        /* Result Screen */
        <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-xl text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <Check className="w-10 h-10" />
          </div>

          <div>
            <span className="inline-block px-3 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
              Form Completed
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              Filled PDF Ready!
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
              Your responses have been successfully compiled into the PDF.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <a
              href={resultUrl}
              download={resultFileName}
              className="flex-1 py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 text-base transition-all"
            >
              <Download className="w-5 h-5" />
              Download Filled PDF
            </a>
            <button
              onClick={reset}
              className="py-4 px-6 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-2xl transition-all text-sm"
            >
              Fill Another Form
            </button>
          </div>
        </div>
      ) : (
        /* Workspace */
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Canvas Area */}
          <div className="lg:col-span-8 space-y-4">
            {/* Top Canvas Toolbar */}
            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 mr-1">Add Field:</span>
                <button
                  onClick={() => setAddMode(addMode === 'text' ? null : 'text')}
                  className={`py-1.5 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    addMode === 'text' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Type className="w-3.5 h-3.5" />
                  Text Box
                </button>
                <button
                  onClick={() => setAddMode(addMode === 'checkbox' ? null : 'checkbox')}
                  className={`py-1.5 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    addMode === 'checkbox' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  Checkbox
                </button>
                <button
                  onClick={() => setAddMode(addMode === 'date' ? null : 'date')}
                  className={`py-1.5 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    addMode === 'date' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Date Stamp
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-700 dark:text-slate-300 mr-2">
                  <input
                    type="checkbox"
                    checked={flattenOnExport}
                    onChange={e => setFlattenOnExport(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  Flatten on Export
                </label>
                <button
                  onClick={exportFilledPdf}
                  disabled={busy}
                  className="py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Export PDF
                </button>
              </div>
            </div>

            {/* Document Canvas */}
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-400">
                <button
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 0))}
                  disabled={currentPage === 0}
                  className="p-1.5 rounded-lg border hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span>Page {currentPage + 1} of {pageImages.length}</span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(p + 1, pageImages.length - 1))}
                  disabled={currentPage === pageImages.length - 1}
                  className="p-1.5 rounded-lg border hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div
                ref={containerRef}
                onClick={handleCanvasClick}
                className={`relative border shadow-xl bg-white select-none overflow-hidden rounded-lg max-w-full ${
                  addMode ? 'cursor-crosshair ring-2 ring-blue-500' : ''
                }`}
              >
                <img
                  src={pageImages[currentPage]}
                  alt={`Page ${currentPage + 1}`}
                  className="max-h-[75vh] object-contain mx-auto block pointer-events-none"
                />

                {/* Custom Overlay Form Fields */}
                {currentPageCustomFields.map(cf => (
                  <div
                    key={cf.id}
                    onClick={e => { e.stopPropagation(); setSelectedFieldId(cf.id); }}
                    className={`absolute flex items-center bg-blue-50/80 border rounded p-1 shadow-sm ${
                      selectedFieldId === cf.id ? 'border-blue-600 ring-2 ring-blue-400' : 'border-blue-300'
                    }`}
                    style={{
                      left: `${cf.x}%`,
                      top: `${cf.y}%`,
                      width: `${cf.w}%`,
                      minHeight: '28px'
                    }}
                  >
                    {cf.type === 'checkbox' ? (
                      <input
                        type="checkbox"
                        checked={cf.checked}
                        onChange={e => updateCustomField(cf.id, { checked: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                      />
                    ) : (
                      <input
                        type="text"
                        value={cf.value}
                        placeholder={cf.type === 'date' ? 'YYYY-MM-DD' : 'Type here...'}
                        onChange={e => updateCustomField(cf.id, { value: e.target.value })}
                        className="w-full bg-transparent text-xs text-slate-900 outline-none px-1"
                      />
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); removeCustomField(cf.id); }}
                      className="text-red-500 hover:text-red-700 text-xs px-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Form Fields Sidebar */}
          <div className="lg:col-span-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 max-h-[85vh] overflow-y-auto">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              Detected Form Fields ({acroFields.length})
            </h3>

            {acroFields.length === 0 ? (
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 text-xs text-slate-500 space-y-2">
                <p>No native interactive AcroForm fields detected in this PDF.</p>
                <p className="text-[11px] text-blue-600 font-semibold">
                  Tip: Use the "Text Box" or "Checkbox" buttons on top and click anywhere on the page to place fields!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {acroFields.map((f, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-slate-200 truncate">{f.name}</span>
                      <span className="text-[10px] uppercase font-bold text-slate-400 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border">
                        {f.type}
                      </span>
                    </div>

                    {f.type === 'checkbox' ? (
                      <label className="flex items-center gap-2 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={f.checked}
                          onChange={e => updateAcroField(f.name, '', e.target.checked)}
                          className="rounded text-blue-600"
                        />
                        <span className="text-slate-600 dark:text-slate-400">Checked</span>
                      </label>
                    ) : f.type === 'dropdown' ? (
                      <select
                        value={f.value}
                        onChange={e => updateAcroField(f.name, e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
                      >
                        <option value="">Select option...</option>
                        {f.options?.map((opt, i) => (
                          <option key={i} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={f.value}
                        placeholder="Enter value..."
                        onChange={e => updateAcroField(f.name, e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
