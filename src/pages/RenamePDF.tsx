import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Loader2, Tag, Archive, Trash2, Download } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import JSZip from 'jszip';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { useToast } from '../components/Toast';
import { useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

interface FileItem {
  id: string;
  file: File;
  originalName: string;
  extractedText: string;
  newName: string;
  status: 'pending' | 'extracted' | 'error';
}

export default function RenamePDF() {
  useSEO(
    'Rename PDF by Content Online Free — Auto Rename Files from Text | PDF Media Suite',
    'Batch rename PDF files automatically based on text content, invoice numbers, or dates from page 1. Download organized, renamed files in seconds.'
  );

  usePageSEO(
    'Rename PDF by Text Content — Batch Auto-Renamer',
    'Automatically rename multiple PDF documents based on text found inside each file. Match invoice numbers, employee IDs, dates, or titles.'
  );

  const [files, setFiles] = useState<FileItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [namingPattern, setNamingPattern] = useState<string>('{text}_{orig}');
  const [customPrefix] = useState<string>('');
  const [matchMode, setMatchMode] = useState<'invoice' | 'date' | 'firstLine' | 'customRegex'>('firstLine');
  const [customRegex, setCustomRegex] = useState<string>('INV-[0-9]+');

  const [zipUrl, setZipUrl] = useState<string | null>(null);

  const toast = useToast();
  const prefersReduced = useReducedMotion();
  useAutoRevokeUrl(zipUrl);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    setZipUrl(null);

    const newItems: FileItem[] = acceptedFiles.map((f, i) => ({
      id: `${Date.now()}-${i}-${f.name}`,
      file: f,
      originalName: f.name,
      extractedText: '',
      newName: f.name,
      status: 'pending',
    }));

    setFiles((prev) => [...prev, ...newItems]);
  };

  // Run text extraction whenever files or match mode changes
  useEffect(() => {
    const extractAll = async () => {
      if (files.length === 0) return;
      const unextracted = files.filter((f) => f.status === 'pending');
      if (unextracted.length === 0) return;

      setBusy(true);
      try {
        const updated = [...files];

        for (let i = 0; i < updated.length; i++) {
          const item = updated[i];
          if (item.status !== 'pending') continue;

          try {
            const ab = await item.file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
            const page1 = await pdf.getPage(1);
            const tc = await page1.getTextContent();
            const fullText = tc.items.map((it: any) => it.str || '').join(' ').trim();

            let matched = '';

            if (matchMode === 'firstLine') {
              // Extract first meaningful text line (title)
              const lines = fullText.split(/\s{2,}|\n/).map((s) => s.trim()).filter((s) => s.length > 2);
              matched = lines[0] ? lines[0].slice(0, 35) : 'Document';
            } else if (matchMode === 'invoice') {
              // Match Invoice or Order pattern
              const re = /(?:inv|invoice|bill|order|receipt|ref|no|#)[.:\s#-]*([A-Z0-9_-]{3,20})/i;
              const m = fullText.match(re);
              matched = m ? m[1] || m[0] : 'NoInvoiceNumber';
            } else if (matchMode === 'date') {
              // Match Date format (YYYY-MM-DD or DD-MM-YYYY)
              const re = /(\b\d{1,2}[-./]\d{1,2}[-./]\d{2,4}\b|\b\d{4}[-./]\d{1,2}[-./]\d{1,2}\b)/;
              const m = fullText.match(re);
              matched = m ? m[0].replace(/[/:]/g, '-') : 'NoDate';
            } else if (matchMode === 'customRegex') {
              try {
                const re = new RegExp(customRegex, 'i');
                const m = fullText.match(re);
                matched = m ? m[0] : 'NoMatch';
              } catch {
                matched = 'InvalidRegex';
              }
            }

            // Clean filename characters
            matched = matched.replace(/[\\/:*?"<>|]/g, '_').trim();

            item.extractedText = matched;
            item.status = 'extracted';
          } catch {
            item.status = 'error';
            item.extractedText = 'ErrorReading';
          }
        }

        setFiles(updated);
      } finally {
        setBusy(false);
      }
    };

    extractAll();
  }, [files, matchMode, customRegex]);

  // Compute final new file name based on naming pattern
  const computeNewName = (item: FileItem) => {
    const baseOrig = item.originalName.replace(/\.pdf$/i, '');
    const text = item.extractedText || 'Untitled';
    let res = namingPattern
      .replace('{text}', text)
      .replace('{orig}', baseOrig)
      .replace('{prefix}', customPrefix);

    if (!res.toLowerCase().endsWith('.pdf')) {
      res += '.pdf';
    }
    return res;
  };

  const reextractAll = () => {
    setFiles((prev) =>
      prev.map((f) => ({ ...f, status: 'pending', extractedText: '' }))
    );
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const downloadSingle = (item: FileItem) => {
    const newName = computeNewName(item);
    const url = URL.createObjectURL(item.file);
    const a = document.createElement('a');
    a.href = url;
    a.download = newName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAllZip = async () => {
    if (!files.length) return;
    setBusy(true);

    try {
      const zip = new JSZip();
      for (const item of files) {
        const newName = computeNewName(item);
        zip.file(newName, item.file);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      setZipUrl(url);

      const a = document.createElement('a');
      a.href = url;
      a.download = `renamed_documents_${Date.now()}.zip`;
      a.click();
      toast.success(`Successfully downloaded ${files.length} renamed documents as ZIP!`);
    } catch {
      toast.error('Error creating ZIP bundle');
    } finally {
      setBusy(false);
    }
  };

  const matchModes = [
    { id: 'firstLine', label: 'Title / First Line' },
    { id: 'invoice', label: 'Invoice / Order Number' },
    { id: 'date', label: 'Date on Document' },
    { id: 'customRegex', label: 'Custom Pattern (Regex)' },
  ] as const;

  const templatePresets = [
    { pattern: '{text}_{orig}', label: '[Text]_[Original]' },
    { pattern: '{text}', label: '[Text Only]' },
    { pattern: 'Invoice_{text}', label: 'Invoice_[Text]' },
  ];

  return (
    <ToolWorkspaceShell
      title="Rename PDF by Text Content"
      subtitle="Batch rename PDFs using text found on page 1 — invoice numbers, receipt codes, customer names, or dates."
      categoryLabel="Batch Smart Auto-Renamer"
      icon={Tag}
      microVariant="edit"
      tone="violet"
      trustNote="100% browser-only Page 1 extraction · Instant ZIP export · Zero server uploads"
    >
      <PearlStageSwitch stageKey={files.length === 0 ? 'upload' : 'workspace'}>
        {files.length === 0 ? (
          <div className="max-w-2xl mx-auto">
            <FileDropzone
              onDrop={handleDrop}
              accept={{ 'application/pdf': ['.pdf'] }}
              multiple={true}
              title="Upload PDFs to Auto-Rename"
              subtitle="Drop 1 or multiple invoices, receipts, or documents"
            />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Renaming Settings Bar */}
            <div className="relative pms-glass-panel rounded-3xl p-6 overflow-hidden">
              <PearlScanOverlay active={busy} label="Scanning Page 1 & preparing ZIP archive…" />

              <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[var(--pms-border)]">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">
                    <AnimatedNumber value={files.length} /> Document{files.length > 1 ? 's' : ''} Loaded
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Configure extraction rule below to auto-generate filenames
                  </p>
                </div>

                <div className="flex gap-2">
                  <label className="px-3.5 py-1.5 text-xs font-semibold text-[var(--pms-violet)] bg-[var(--pms-soft-lavender)] border border-[var(--pms-border)] rounded-xl hover:brightness-95 cursor-pointer transition-all">
                    + Add More Files
                    <input
                      type="file"
                      accept=".pdf"
                      multiple
                      className="hidden"
                      onChange={(e) => e.target.files && handleDrop(Array.from(e.target.files))}
                    />
                  </label>

                  <button
                    onClick={() => setFiles([])}
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-rose-600 hover:bg-[var(--pms-soft-rose)] rounded-xl transition-colors cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Extraction Rules */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-5">
                {/* 1. Content Extraction Mode */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">
                    What text to extract from Page 1?
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {matchModes.map((m) => {
                      const active = matchMode === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setMatchMode(m.id);
                            reextractAll();
                          }}
                          className="relative p-2.5 rounded-xl border text-xs font-bold text-left transition-colors cursor-pointer overflow-hidden"
                          style={{
                            borderColor: active ? 'var(--pms-violet)' : 'var(--pms-border)',
                            backgroundColor: active ? 'var(--pms-soft-lavender)' : 'var(--pms-white)',
                            color: active ? 'var(--pms-violet)' : 'var(--pms-ink)',
                          }}
                        >
                          {active && (
                            <motion.span
                              layoutId="rename-match-mode"
                              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                              className="absolute inset-0 rounded-xl ring-2 ring-violet-500/30 pointer-events-none"
                            />
                          )}
                          <span className="relative z-10">{m.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {matchMode === 'customRegex' && (
                    <div className="mt-2.5">
                      <input
                        type="text"
                        value={customRegex}
                        onChange={(e) => setCustomRegex(e.target.value)}
                        placeholder="e.g. INV-[0-9]+ or [A-Z]{3}-\d{4}"
                        className="w-full px-3 py-2 text-xs font-mono border border-[var(--pms-border)] rounded-xl bg-white/90 dark:bg-slate-900/80 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-400"
                      />
                    </div>
                  )}
                </div>

                {/* 2. Naming Format Template */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">
                    New Filename Template
                  </label>
                  <div className="grid grid-cols-3 gap-2 mb-2.5">
                    {templatePresets.map((tp) => {
                      const active = namingPattern === tp.pattern;
                      return (
                        <button
                          key={tp.pattern}
                          type="button"
                          onClick={() => setNamingPattern(tp.pattern)}
                          className="relative p-2 rounded-xl border text-[11px] font-bold transition-colors cursor-pointer overflow-hidden"
                          style={{
                            borderColor: active ? 'var(--pms-blue)' : 'var(--pms-border)',
                            backgroundColor: active ? 'var(--pms-soft-blue)' : 'var(--pms-white)',
                            color: active ? 'var(--pms-blue)' : 'var(--pms-ink)',
                          }}
                        >
                          {active && (
                            <motion.span
                              layoutId="rename-template-pill"
                              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                              className="absolute inset-0 rounded-xl ring-2 ring-sky-500/30 pointer-events-none"
                            />
                          )}
                          <span className="relative z-10">{tp.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    value={namingPattern}
                    onChange={(e) => setNamingPattern(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-[var(--pms-border)] rounded-xl bg-white/90 dark:bg-slate-900/80 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-400"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Available variables: {'{text}'}, {'{orig}'}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 pt-5 border-t border-[var(--pms-border)] flex flex-wrap justify-between items-center gap-3">
                <button
                  type="button"
                  onClick={reextractAll}
                  className="text-xs text-[var(--pms-violet)] font-bold hover:underline cursor-pointer"
                >
                  ↻ Re-scan All Files
                </button>

                <motion.button
                  whileHover={prefersReduced || busy ? undefined : { scale: 1.015 }}
                  whileTap={prefersReduced || busy ? undefined : { scale: 0.985 }}
                  onClick={downloadAllZip}
                  disabled={busy}
                  className="pms-btn-primary inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-xs sm:text-sm disabled:opacity-50 cursor-pointer"
                >
                  {busy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Processing...
                    </>
                  ) : (
                    <>
                      <Archive className="w-4 h-4" /> Download All as Renamed ZIP
                    </>
                  )}
                </motion.button>
              </div>
            </div>

            {/* Live Table Preview */}
            <div className="pms-glass-panel rounded-3xl overflow-hidden">
              <div className="p-4 border-b border-[var(--pms-border)] bg-white/50 dark:bg-slate-800/40 flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Renaming Live Preview
                </h4>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300">
                  {files.filter((f) => f.status === 'extracted').length}/{files.length} scanned
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/80 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="py-3 px-4">Original Filename</th>
                      <th className="py-3 px-4">Extracted Text</th>
                      <th className="py-3 px-4">New Filename</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--pms-border)]">
                    {files.map((item) => {
                      const newName = computeNewName(item);
                      return (
                        <tr key={item.id} className="hover:bg-white/60 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400 max-w-xs truncate">
                            {item.originalName}
                          </td>
                          <td className="py-3 px-4">
                            {item.status === 'pending' ? (
                              <span className="text-slate-400 flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" /> Reading...
                              </span>
                            ) : (
                              <span className="font-bold text-[var(--pms-violet)] bg-[var(--pms-soft-lavender)] px-2.5 py-0.5 rounded-lg font-mono">
                                {item.extractedText || 'None'}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white max-w-xs truncate">
                            {newName}
                          </td>
                          <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                            <button
                              onClick={() => downloadSingle(item)}
                              title="Download this renamed file"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/80 dark:bg-slate-800 border border-[var(--pms-border)] hover:border-violet-400 hover:text-[var(--pms-violet)] text-slate-700 dark:text-slate-300 font-semibold cursor-pointer transition-colors"
                            >
                              <Download className="w-3 h-3" /> Download
                            </button>
                            <button
                              onClick={() => removeFile(item.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer transition-colors"
                              aria-label="Remove file"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </PearlStageSwitch>

      <ToolSEOSection
        toolName="Rename PDF by Text Content"
        headline="Batch Auto-Renamer"
        description="Batch rename PDF files automatically based on text found inside each file. Match invoice numbers, employee IDs, dates, or titles."
        faqs={[
          {
            q: 'Can I rename hundreds of invoices at once?',
            a: 'Yes, you can drop 50 or more PDF files and our batch engine reads Page 1 of each document in your browser to extract invoice IDs and rename them.',
          },
          {
            q: 'How does regex matching work?',
            a: 'Enter any valid JavaScript regular expression like "INV-[0-9]+" or "[A-Z]{3}-[0-9]{4}" to target specific text structures.',
          },
        ]}
      />
    </ToolWorkspaceShell>
  );
}
