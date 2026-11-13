import React, { useState, useRef } from 'react';
import {
  FileText, Download, Loader2, Type, CheckSquare,
  ChevronLeft, ChevronRight, Check, Sparkles
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { motion, useReducedMotion } from 'motion/react';
import '../lib/pdfWorker';
import { PDFDocument, rgb, StandardFonts, PDFTextField, PDFCheckBox, PDFDropdown } from 'pdf-lib';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';

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

  useAutoRevokeUrl(resultUrl);

  const prefersReduced = useReducedMotion();
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
            // Crisp vector checkmark that never throws WinAnsi encoding errors
            const startX = x + 2;
            const startY = y - 5;
            page.drawLine({
              start: { x: startX, y: startY },
              end: { x: startX + 3.5, y: startY - 4 },
              thickness: 1.8,
              color: rgb(0.1, 0.3, 0.8),
            });
            page.drawLine({
              start: { x: startX + 3.5, y: startY - 4 },
              end: { x: startX + 10, y: startY + 5 },
              thickness: 1.8,
              color: rgb(0.1, 0.3, 0.8),
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
      const blob = new Blob([toArrayBufferBytes(finalBytes)], { type: 'application/pdf' });
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
    <ToolWorkspaceShell
      title="PDF Form Filler & AcroForm Studio"
      subtitle="Fill official PDF forms effortlessly. Auto-detects interactive AcroForm text fields and checkboxes, or click to add custom text anywhere."
      categoryLabel="AcroForm & Field Editor"
      icon={FileText}
      microVariant="edit"
      tone="blue"
    >
      <div className="flex flex-col items-center justify-start max-w-6xl mx-auto w-full">

      {!file ? (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-2xl space-y-6"
        >
          <div className="pms-glass-panel rounded-3xl p-4 sm:p-5">
            <FileDropzone
              onDrop={handleDrop}
              multiple={false}
              title="Select PDF Form to Fill"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="pms-glass-panel p-4 rounded-2xl text-center">
              <div className="w-10 h-10 rounded-xl bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] flex items-center justify-center mx-auto mb-2.5">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm text-[var(--pms-ink)]">Native AcroForms</h3>
              <p className="text-xs text-[var(--pms-muted)] mt-1">Auto-detects real government form textboxes &amp; checkboxes.</p>
            </div>
            <div className="pms-glass-panel p-4 rounded-2xl text-center">
              <div className="w-10 h-10 rounded-xl bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] flex items-center justify-center mx-auto mb-2.5">
                <Type className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm text-[var(--pms-ink)]">Click &amp; Type</h3>
              <p className="text-xs text-[var(--pms-muted)] mt-1">Place text or date stamps on scanned non-interactive forms.</p>
            </div>
            <div className="pms-glass-panel p-4 rounded-2xl text-center">
              <div className="w-10 h-10 rounded-xl bg-[var(--pms-soft-mint)] text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-2.5">
                <Download className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm text-[var(--pms-ink)]">Flatten or Keep Editable</h3>
              <p className="text-xs text-[var(--pms-muted)] mt-1">Choose between permanent flattened print or editable form.</p>
            </div>
          </div>
        </motion.div>
      ) : resultUrl ? (
        /* Result Screen */
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, scale: 0.98, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-xl pms-glass-panel rounded-3xl border border-emerald-200/80 dark:border-emerald-800/70 p-8 text-center space-y-6"
        >
          <motion.div
            initial={prefersReduced ? false : { scale: 0.45, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 20 }}
            className="w-20 h-20 bg-emerald-100/90 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner border border-emerald-200/70 dark:border-emerald-800/60"
          >
            <Check className="w-10 h-10" />
          </motion.div>

          <div>
            <span className="inline-block px-3 py-1 bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
              Form Completed
            </span>
            <h2 className="text-2xl font-extrabold text-[var(--pms-ink)]">
              Filled PDF Ready!
            </h2>
            <p className="text-xs sm:text-sm text-[var(--pms-muted)] mt-1.5">
              Compiled{' '}
              <span className="font-bold text-[var(--pms-ink)] tabular-nums">
                <AnimatedNumber value={acroFields.length + customFields.length} />
              </span>{' '}
              form field{(acroFields.length + customFields.length) === 1 ? '' : 's'} into your document.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <motion.a
              whileHover={prefersReduced ? undefined : { scale: 1.015 }}
              whileTap={prefersReduced ? undefined : { scale: 0.985 }}
              href={resultUrl}
              download={resultFileName}
              className="pms-btn-primary flex-1 py-4 px-6 rounded-2xl font-bold flex items-center justify-center gap-2 text-base"
            >
              <Download className="w-5 h-5" />
              Download Filled PDF
            </motion.a>
            <motion.button
              whileHover={prefersReduced ? undefined : { scale: 1.015 }}
              whileTap={prefersReduced ? undefined : { scale: 0.985 }}
              onClick={reset}
              className="py-4 px-6 bg-[var(--pms-pearl)] dark:bg-slate-800/90 hover:bg-[var(--pms-soft-lavender)] dark:hover:bg-slate-700 text-[var(--pms-ink)] font-bold rounded-2xl border border-[var(--pms-border)] transition-colors text-sm"
            >
              Fill Another Form
            </motion.button>
          </div>
        </motion.div>
      ) : (
        /* Workspace */
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6"
        >
          {/* Main Canvas Area */}
          <div className="lg:col-span-8 space-y-4">
            {/* Top Canvas Toolbar */}
            <div className="pms-glass-panel p-3.5 sm:p-4 rounded-3xl flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5 bg-[var(--pms-pearl)]/80 dark:bg-slate-900/70 p-1.5 rounded-2xl border border-[var(--pms-border)]">
                <span className="text-xs font-bold text-[var(--pms-muted)] px-2">Add Field:</span>
                <button
                  onClick={() => setAddMode(addMode === 'text' ? null : 'text')}
                  className={`py-1.5 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    addMode === 'text'
                      ? 'bg-[var(--pms-blue)] text-white shadow-sm'
                      : 'text-[var(--pms-muted)] hover:text-[var(--pms-ink)] hover:bg-[var(--pms-white)] dark:hover:bg-slate-800'
                  }`}
                >
                  <Type className="w-3.5 h-3.5" />
                  Text Box
                </button>
                <button
                  onClick={() => setAddMode(addMode === 'checkbox' ? null : 'checkbox')}
                  className={`py-1.5 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    addMode === 'checkbox'
                      ? 'bg-[var(--pms-blue)] text-white shadow-sm'
                      : 'text-[var(--pms-muted)] hover:text-[var(--pms-ink)] hover:bg-[var(--pms-white)] dark:hover:bg-slate-800'
                  }`}
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  Checkbox
                </button>
                <button
                  onClick={() => setAddMode(addMode === 'date' ? null : 'date')}
                  className={`py-1.5 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    addMode === 'date'
                      ? 'bg-[var(--pms-blue)] text-white shadow-sm'
                      : 'text-[var(--pms-muted)] hover:text-[var(--pms-ink)] hover:bg-[var(--pms-white)] dark:hover:bg-slate-800'
                  }`}
                >
                  Date Stamp
                </button>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer font-bold text-[var(--pms-ink)]">
                  <input
                    type="checkbox"
                    checked={flattenOnExport}
                    onChange={e => setFlattenOnExport(e.target.checked)}
                    className="rounded accent-blue-600"
                  />
                  Flatten on Export
                </label>
                <motion.button
                  whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                  whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                  onClick={exportFilledPdf}
                  disabled={busy}
                  className="pms-btn-primary py-2.5 px-4 font-bold rounded-xl flex items-center gap-1.5 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Export PDF
                </motion.button>
              </div>
            </div>

            {/* Document Canvas */}
            <div className="relative pms-glass-panel rounded-3xl p-4 sm:p-5 overflow-hidden min-h-[420px] flex flex-col items-center gap-3">
              <PearlScanOverlay
                active={busy}
                label={pageImages.length === 0 ? 'Detecting AcroForm fields & rendering pages…' : 'Compiling filled PDF…'}
              />

              <div className="flex items-center gap-3 text-xs font-bold text-[var(--pms-muted)]">
                <button
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 0))}
                  disabled={currentPage === 0}
                  className="p-1.5 rounded-xl border border-[var(--pms-border)] bg-[var(--pms-white)] dark:bg-slate-900 hover:bg-[var(--pms-soft-lavender)] disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-[var(--pms-ink)]" />
                </button>
                <span className="text-[var(--pms-ink)]">
                  Page {currentPage + 1} of {Math.max(1, pageImages.length)}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(p + 1, pageImages.length - 1))}
                  disabled={currentPage >= pageImages.length - 1}
                  className="p-1.5 rounded-xl border border-[var(--pms-border)] bg-[var(--pms-white)] dark:bg-slate-900 hover:bg-[var(--pms-soft-lavender)] disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-[var(--pms-ink)]" />
                </button>
              </div>

              <div
                ref={containerRef}
                onClick={handleCanvasClick}
                className={`relative border border-[var(--pms-border-strong)] shadow-xl bg-white select-none overflow-hidden rounded-xl max-w-full ${
                  addMode ? 'cursor-crosshair ring-2 ring-[var(--pms-blue)]' : ''
                }`}
              >
                {pageImages[currentPage] && (
                  <img
                    src={pageImages[currentPage]}
                    alt={`Page ${currentPage + 1}`}
                    className="max-h-[75vh] object-contain mx-auto block pointer-events-none"
                  />
                )}

                {/* Custom Overlay Form Fields */}
                {currentPageCustomFields.map(cf => (
                  <div
                    key={cf.id}
                    onClick={e => { e.stopPropagation(); setSelectedFieldId(cf.id); }}
                    className={`absolute flex items-center bg-blue-50/85 border rounded p-1 shadow-sm ${
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
                      className="text-rose-500 hover:text-rose-700 text-xs px-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Form Fields Sidebar */}
          <div className="lg:col-span-4 pms-glass-panel p-5 rounded-3xl space-y-4 max-h-[85vh] overflow-y-auto">
            <h3 className="font-bold text-sm text-[var(--pms-ink)] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--pms-blue)]" />
              Detected Form Fields (<AnimatedNumber value={acroFields.length} />)
            </h3>

            {acroFields.length === 0 ? (
              <div className="p-4 bg-[var(--pms-pearl)]/80 dark:bg-slate-900/60 rounded-2xl border border-[var(--pms-border)] text-xs text-[var(--pms-muted)] space-y-2">
                <p>No native interactive AcroForm fields detected in this PDF.</p>
                <p className="text-[11px] text-[var(--pms-blue)] font-semibold">
                  Tip: Use the &quot;Text Box&quot; or &quot;Checkbox&quot; buttons on top and click anywhere on the page to place fields!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {acroFields.map((f, idx) => (
                  <div key={idx} className="p-3 bg-[var(--pms-pearl)]/70 dark:bg-slate-900/60 rounded-2xl border border-[var(--pms-border)] text-xs space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[var(--pms-ink)] truncate">{f.name}</span>
                      <span className="text-[10px] uppercase font-bold text-[var(--pms-subtle-text)] bg-[var(--pms-white)] dark:bg-slate-900 px-1.5 py-0.5 rounded-lg border border-[var(--pms-border)] shrink-0">
                        {f.type}
                      </span>
                    </div>

                    {f.type === 'checkbox' ? (
                      <label className="flex items-center gap-2 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={f.checked}
                          onChange={e => updateAcroField(f.name, '', e.target.checked)}
                          className="rounded accent-blue-600"
                        />
                        <span className="text-[var(--pms-muted)]">Checked</span>
                      </label>
                    ) : f.type === 'dropdown' ? (
                      <select
                        value={f.value}
                        onChange={e => updateAcroField(f.name, e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-[var(--pms-border-strong)] text-xs bg-[var(--pms-white)] dark:bg-slate-900 text-[var(--pms-ink)] outline-none"
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
                        className="w-full px-2.5 py-1.5 rounded-xl border border-[var(--pms-border-strong)] text-xs bg-[var(--pms-white)] dark:bg-slate-900 text-[var(--pms-ink)] outline-none"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
      </div>
    </ToolWorkspaceShell>
  );
}
