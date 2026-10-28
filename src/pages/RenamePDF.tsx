import React, { useState, useEffect } from 'react';
import { Download, FileText, CheckCircle2, Eye, Loader2, Sparkles, Tag, Archive, Search, FileEdit, Trash2, ArrowRight } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import JSZip from 'jszip';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolSEOSection from '../components/ToolSEOSection';

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
  const [customPrefix, setCustomPrefix] = useState<string>('');
  const [matchMode, setMatchMode] = useState<'invoice' | 'date' | 'firstLine' | 'customRegex'>('firstLine');
  const [customRegex, setCustomRegex] = useState<string>('INV-[0-9]+');

  const [zipUrl, setZipUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (zipUrl) URL.revokeObjectURL(zipUrl);
    };
  }, [zipUrl]);

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
          } catch (e) {
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
    } catch (e) {
      alert('Error creating ZIP bundle');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 transition-colors">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-sm font-semibold mb-3">
            <Tag className="w-4 h-4" /> Batch Smart Auto-Renamer
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
            Rename PDF by Text Content
          </h1>
          <p className="text-base md:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Batch rename PDFs using text found on page 1 — invoice numbers, receipt codes, customer names, or dates.
          </p>
        </div>

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
          <div className="space-y-8">
            {/* Renaming Settings Bar */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-200">
                    {files.length} Document{files.length > 1 ? 's' : ''} Loaded
                  </h3>
                  <p className="text-xs text-slate-500">
                    Configure extraction rule below to auto-generate filenames
                  </p>
                </div>

                <div className="flex gap-2">
                  <label className="px-3.5 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg hover:bg-indigo-100 cursor-pointer">
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
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Extraction Rules */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
                {/* 1. Content Extraction Mode */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                    What text to extract from Page 1?
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMatchMode('firstLine');
                        reextractAll();
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-left ${
                        matchMode === 'firstLine'
                          ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400'
                          : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      Title / First Line
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMatchMode('invoice');
                        reextractAll();
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-left ${
                        matchMode === 'invoice'
                          ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400'
                          : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      Invoice / Order Number
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMatchMode('date');
                        reextractAll();
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-left ${
                        matchMode === 'date'
                          ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400'
                          : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      Date on Document
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMatchMode('customRegex');
                        reextractAll();
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-left ${
                        matchMode === 'customRegex'
                          ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400'
                          : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      Custom Pattern (Regex)
                    </button>
                  </div>

                  {matchMode === 'customRegex' && (
                    <div className="mt-2">
                      <input
                        type="text"
                        value={customRegex}
                        onChange={(e) => setCustomRegex(e.target.value)}
                        placeholder="e.g. INV-[0-9]+ or [A-Z]{3}-\d{4}"
                        className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                  )}
                </div>

                {/* 2. Naming Format Template */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                    New Filename Template
                  </label>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setNamingPattern('{text}_{orig}')}
                      className={`p-2 rounded-lg border text-[11px] font-bold ${
                        namingPattern === '{text}_{orig}'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 text-slate-700'
                      }`}
                    >
                      [Text]_[Original]
                    </button>
                    <button
                      type="button"
                      onClick={() => setNamingPattern('{text}')}
                      className={`p-2 rounded-lg border text-[11px] font-bold ${
                        namingPattern === '{text}'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 text-slate-700'
                      }`}
                    >
                      [Text Only]
                    </button>
                    <button
                      type="button"
                      onClick={() => setNamingPattern('Invoice_{text}')}
                      className={`p-2 rounded-lg border text-[11px] font-bold ${
                        namingPattern === 'Invoice_{text}'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 text-slate-700'
                      }`}
                    >
                      Invoice_[Text]
                    </button>
                  </div>
                  <input
                    type="text"
                    value={namingPattern}
                    onChange={(e) => setNamingPattern(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Available variables: {'{text}'}, {'{orig}'}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <button
                  type="button"
                  onClick={reextractAll}
                  className="text-xs text-indigo-600 font-semibold hover:underline"
                >
                  ↻ Re-scan All Files
                </button>

                <button
                  onClick={downloadAllZip}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
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
                </button>
              </div>
            </div>

            {/* Live Table Preview */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Renaming Live Preview
                </h4>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="py-3 px-4">Original Filename</th>
                      <th className="py-3 px-4">Extracted Text</th>
                      <th className="py-3 px-4">New Filename</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {files.map((item) => {
                      const newName = computeNewName(item);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400 max-w-xs truncate">
                            {item.originalName}
                          </td>
                          <td className="py-3 px-4">
                            {item.status === 'pending' ? (
                              <span className="text-slate-400 flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" /> Reading...
                              </span>
                            ) : (
                              <span className="font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded font-mono">
                                {item.extractedText || 'None'}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white max-w-xs truncate">
                            {newName}
                          </td>
                          <td className="py-3 px-4 text-right space-x-2">
                            <button
                              onClick={() => downloadSingle(item)}
                              title="Download this renamed file"
                              className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 dark:text-slate-300 font-semibold"
                            >
                              Download
                            </button>
                            <button
                              onClick={() => removeFile(item.id)}
                              className="p-1 rounded text-slate-400 hover:text-red-500"
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
      </div>
    </div>
  );
}
