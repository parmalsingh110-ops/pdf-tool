import { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PDFDocument } from 'pdf-lib';
import { Download, Scissors, FileText, CheckSquare, Square, Layers, LayoutGrid, Archive, HardDrive, Search, Sparkles } from 'lucide-react';
import JSZip from 'jszip';
import FileDropzone from '../components/FileDropzone';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { useToast } from '../components/Toast';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';

type SplitMode = 'all' | 'ranges' | 'selection' | 'every' | 'size' | 'keyword';

interface PageThumb {
  num: number;
  thumb: string;
}

export default function SplitPDF() {
  useSEO('Split PDF Online Free | PDF Media Suite', 'Free online Split PDF tool. Visually select pages to extract. No signup or installation required.');
  usePageSEO('Split PDF Online Free', 'Split PDF into individual pages or extract specific page ranges visually. Free online PDF splitter — fast, private, browser-based.');

  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [thumbs, setThumbs] = useState<PageThumb[]>([]);
  const [loadingThumbs, setLoadingThumbs] = useState(false);
  const [thumbProgress, setThumbProgress] = useState(0);

  const [splitMode, setSplitMode] = useState<SplitMode>('all');
  const [ranges, setRanges] = useState('');
  const [everyN, setEveryN] = useState(1);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());

  // ── Smart Target Size & Keyword Split States ──
  const [targetSizeMB, setTargetSizeMB] = useState(2);
  const [splitKeyword, setSplitKeyword] = useState('Invoice');

  const [isProcessing, setIsProcessing] = useState(false);
  const [processStep, setProcessStep] = useState('');
  const [splitUrls, setSplitUrls] = useState<{ url: string; name: string; pages: string }[]>([]);

  const toast = useToast();

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      splitUrls.forEach(u => {
        try { URL.revokeObjectURL(u.url); } catch { }
      });
    };
  }, [splitUrls]);

  const generateThumbs = useCallback(async (pdfFile: File) => {
    setLoadingThumbs(true);
    setThumbProgress(0);
    try {
      const ab = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
      const total = pdf.numPages;
      const results: PageThumb[] = [];
      for (let i = 1; i <= total; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 0.35 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(vp.width);
        canvas.height = Math.round(vp.height);
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
        results.push({ num: i, thumb: canvas.toDataURL('image/jpeg', 0.7) });
        canvas.width = 0; canvas.height = 0;
        setThumbProgress(Math.round((i / total) * 100));
        page.cleanup();
      }
      setThumbs(results);
    } finally {
      setLoadingThumbs(false);
    }
  }, []);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    const f = acceptedFiles[0];

    // Revoke previous URLs
    splitUrls.forEach(u => {
      try { URL.revokeObjectURL(u.url); } catch { }
    });

    setFile(f);
    setSplitUrls([]);
    setSelectedPages(new Set());
    try {
      const ab = await f.arrayBuffer();
      const pdf = await PDFDocument.load(ab);
      const count = pdf.getPageCount();
      setPageCount(count);
      setRanges(`1-${count}`);
      generateThumbs(f);
    } catch (e: any) {
      console.error('Error loading PDF:', e);
      const errMsg = e?.message?.toLowerCase() || '';
      if (errMsg.includes('encrypt') || errMsg.includes('password')) {
        toast.error('This PDF is password-protected. Please unlock it using our Unlock PDF tool first.');
      } else {
        toast.error('Could not read this PDF. The file may be damaged.');
      }
      setFile(null);
      setPageCount(0);
      setThumbs([]);
    }
  };

  const togglePage = (n: number) => {
    setSelectedPages(prev => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    });
  };

  const selectAll = () => setSelectedPages(new Set(Array.from({ length: pageCount }, (_, i) => i + 1)));
  const clearAll = () => setSelectedPages(new Set());

  const splitPdf = async () => {
    if (!file) return;
    setIsProcessing(true);

    // Revoke previous URLs
    splitUrls.forEach(u => {
      try { URL.revokeObjectURL(u.url); } catch { }
    });
    setSplitUrls([]);

    try {
      const arrayBuffer = await file.arrayBuffer();
      let sourcePdf: PDFDocument;
      try {
        sourcePdf = await PDFDocument.load(arrayBuffer);
      } catch (loadErr: any) {
        const errMsg = loadErr?.message?.toLowerCase() || '';
        if (errMsg.includes('encrypt') || errMsg.includes('password')) {
          throw new Error('This PDF is password-protected. Please unlock it with our Unlock PDF tool first.');
        }
        throw new Error('Could not read the PDF file. It may be corrupted.');
      }
      const results: { url: string; name: string; pages: string }[] = [];

      if (splitMode === 'all') {
        for (let i = 0; i < pageCount; i++) {
          setProcessStep(`Extracting page ${i + 1} of ${pageCount}...`);
          const newPdf = await PDFDocument.create();
          const [copied] = await newPdf.copyPages(sourcePdf, [i]);
          newPdf.addPage(copied);
          const bytes = await newPdf.save();
          const blob = new Blob([bytes as any], { type: 'application/pdf' });
          results.push({ url: URL.createObjectURL(blob), name: `page_${i + 1}.pdf`, pages: `Page ${i + 1}` });
        }
      } else if (splitMode === 'selection') {
        const sorted = Array.from(selectedPages).sort((a, b) => a - b);
        if (!sorted.length) { toast.error('Please select at least one page.'); return; }
        setProcessStep('Extracting selected pages...');
        const newPdf = await PDFDocument.create();
        const copied = await newPdf.copyPages(sourcePdf, sorted.map(p => p - 1));
        copied.forEach(p => newPdf.addPage(p));
        const bytes = await newPdf.save();
        const blob = new Blob([bytes as any], { type: 'application/pdf' });
        const label = sorted.length === 1 ? `${sorted[0]}` : `${sorted[0]}-${sorted[sorted.length - 1]}`;
        results.push({ url: URL.createObjectURL(blob), name: `pages_${label}.pdf`, pages: `Pages: ${sorted.join(', ')}` });
      } else if (splitMode === 'ranges') {
        const parts = ranges.split(',').map(r => r.trim()).filter(Boolean);
        for (let ri = 0; ri < parts.length; ri++) {
          const part = parts[ri];
          let start = 1, end = 1;
          if (part.includes('-')) {
            const [a, b] = part.split('-');
            start = parseInt(a); end = parseInt(b);
          } else {
            start = end = parseInt(part);
          }
          if (isNaN(start) || isNaN(end) || start < 1 || end > pageCount || start > end) continue;
          setProcessStep(`Creating range ${part} (${ri + 1}/${parts.length})...`);
          const newPdf = await PDFDocument.create();
          const indices = Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i);
          const copied = await newPdf.copyPages(sourcePdf, indices);
          copied.forEach(p => newPdf.addPage(p));
          const bytes = await newPdf.save();
          const blob = new Blob([bytes as any], { type: 'application/pdf' });
          results.push({ url: URL.createObjectURL(blob), name: `split_${start}-${end}.pdf`, pages: `Pages ${start}–${end}` });
        }
      } else if (splitMode === 'every') {
        const n = Math.max(1, everyN);
        let chunk = 1;
        for (let i = 0; i < pageCount; i += n, chunk++) {
          const start = i;
          const end = Math.min(i + n - 1, pageCount - 1);
          setProcessStep(`Chunk ${chunk}: pages ${start + 1}–${end + 1}...`);
          const newPdf = await PDFDocument.create();
          const indices = Array.from({ length: end - start + 1 }, (_, k) => start + k);
          const copied = await newPdf.copyPages(sourcePdf, indices);
          copied.forEach(p => newPdf.addPage(p));
          const bytes = await newPdf.save();
          const blob = new Blob([bytes as any], { type: 'application/pdf' });
          results.push({ url: URL.createObjectURL(blob), name: `part_${chunk}.pdf`, pages: `Pages ${start + 1}–${end + 1}` });
        }
      } else if (splitMode === 'size') {
        const maxBytes = Math.max(0.2, targetSizeMB) * 1024 * 1024;
        let currentPages: number[] = [];
        let chunkIdx = 1;

        for (let i = 0; i < pageCount; i++) {
          setProcessStep(`Packaging page ${i + 1} of ${pageCount} into size-optimized chunks...`);
          const testPdf = await PDFDocument.create();
          const testIndices = [...currentPages, i];
          const copied = await testPdf.copyPages(sourcePdf, testIndices);
          copied.forEach(p => testPdf.addPage(p));
          const testBytes = await testPdf.save();

          if (testBytes.byteLength > maxBytes && currentPages.length > 0) {
            // Finalize previous chunk
            const finalPdf = await PDFDocument.create();
            const chunkCopied = await finalPdf.copyPages(sourcePdf, currentPages);
            chunkCopied.forEach(p => finalPdf.addPage(p));
            const finalBytes = await finalPdf.save();
            const blob = new Blob([finalBytes as any], { type: 'application/pdf' });
            const pStart = currentPages[0] + 1;
            const pEnd = currentPages[currentPages.length - 1] + 1;
            const sizeLabel = (finalBytes.byteLength / 1024 / 1024).toFixed(2);
            results.push({
              url: URL.createObjectURL(blob),
              name: `part_${chunkIdx}_(${sizeLabel}MB_limit_${targetSizeMB}MB).pdf`,
              pages: `Pages ${pStart}–${pEnd} · ${sizeLabel} MB (Under ${targetSizeMB} MB limit)`,
            });
            chunkIdx++;
            currentPages = [i];
          } else {
            currentPages.push(i);
          }
        }

        if (currentPages.length > 0) {
          const finalPdf = await PDFDocument.create();
          const chunkCopied = await finalPdf.copyPages(sourcePdf, currentPages);
          chunkCopied.forEach(p => finalPdf.addPage(p));
          const finalBytes = await finalPdf.save();
          const blob = new Blob([finalBytes as any], { type: 'application/pdf' });
          const pStart = currentPages[0] + 1;
          const pEnd = currentPages[currentPages.length - 1] + 1;
          const sizeLabel = (finalBytes.byteLength / 1024 / 1024).toFixed(2);
          results.push({
            url: URL.createObjectURL(blob),
            name: `part_${chunkIdx}_(${sizeLabel}MB_limit_${targetSizeMB}MB).pdf`,
            pages: `Pages ${pStart}–${pEnd} · ${sizeLabel} MB (Under ${targetSizeMB} MB limit)`,
          });
        }
      } else if (splitMode === 'keyword') {
        const kw = splitKeyword.trim().toLowerCase();
        if (!kw) {
          toast.error('Please enter a keyword to split by (e.g. "Invoice", "Salary", "Roll No").');
          return;
        }

        setProcessStep(`Scanning all ${pageCount} pages for keyword "${splitKeyword}"...`);
        const pdfJsDoc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
        const matchingPages: number[] = [];

        for (let i = 1; i <= pageCount; i++) {
          const page = await pdfJsDoc.getPage(i);
          const tc = await page.getTextContent();
          const text = tc.items.map((it: any) => it.str || '').join(' ').toLowerCase();
          if (text.includes(kw)) {
            matchingPages.push(i - 1);
          }
          page.cleanup();
        }
        pdfJsDoc.destroy();

        if (matchingPages.length === 0) {
          toast.error(`Keyword "${splitKeyword}" was not found on any page. Try a different phrase or check spelling.`);
          return;
        }

        // Create boundary segments
        const boundaries = [...matchingPages];
        if (boundaries[0] !== 0) {
          boundaries.unshift(0);
        }

        for (let b = 0; b < boundaries.length; b++) {
          const start = boundaries[b];
          const end = (b + 1 < boundaries.length) ? boundaries[b + 1] - 1 : pageCount - 1;
          setProcessStep(`Creating section ${b + 1}: pages ${start + 1}–${end + 1}...`);
          const newPdf = await PDFDocument.create();
          const indices = Array.from({ length: end - start + 1 }, (_, k) => start + k);
          const copied = await newPdf.copyPages(sourcePdf, indices);
          copied.forEach(p => newPdf.addPage(p));
          const bytes = await newPdf.save();
          const blob = new Blob([bytes as any], { type: 'application/pdf' });
          const safeKw = splitKeyword.replace(/[^a-zA-Z0-9_-]/g, '_');
          results.push({
            url: URL.createObjectURL(blob),
            name: `${safeKw}_part_${b + 1}_(p${start + 1}-p${end + 1}).pdf`,
            pages: `Pages ${start + 1}–${end + 1} (Matched "${splitKeyword}")`,
          });
        }
      }

      setSplitUrls(results);
      if (results.length > 0) {
        toast.success(`Generated ${results.length} split PDF file(s)!`);
      }
    } catch (e: any) {
      console.error('Split error:', e);
      toast.error(e?.message || 'An error occurred while splitting the PDF.');
    } finally {
      setIsProcessing(false);
      setProcessStep('');
    }
  };

  const [isZipping, setIsZipping] = useState(false);

  const downloadAll = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();
      for (const item of splitUrls) {
        const res = await fetch(item.url);
        const blob = await res.blob();
        zip.file(item.name, blob);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = zipUrl;
      const baseName = file?.name.replace(/\.pdf$/i, '') || 'split_document';
      a.download = `${baseName}_pages.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(zipUrl), 2000);
    } catch (e) {
      console.error('ZIP creation error, falling back:', e);
      splitUrls.forEach((item, i) => {
        setTimeout(() => {
          const a = document.createElement('a');
          a.href = item.url;
          a.download = item.name;
          a.click();
        }, i * 300);
      });
    } finally {
      setIsZipping(false);
    }
  };

  const modes: { id: SplitMode; icon: React.ElementType; label: string; desc: string; color: string }[] = [
    { id: 'all', icon: Layers, label: 'All Pages', desc: 'Each page becomes a separate PDF', color: 'orange' },
    { id: 'selection', icon: LayoutGrid, label: 'Select Pages', desc: 'Click thumbnails to pick specific pages', color: 'violet' },
    { id: 'ranges', icon: Scissors, label: 'Custom Ranges', desc: 'Enter ranges like 1-3, 5, 7-10', color: 'blue' },
    { id: 'every', icon: Layers, label: 'Every N Pages', desc: 'Split every N pages into chunks', color: 'emerald' },
    { id: 'size', icon: HardDrive, label: 'By File Size (MB)', desc: 'Split into parts under target limit (e.g. 2MB)', color: 'teal' },
    { id: 'keyword', icon: Search, label: 'By Keyword / Invoice', desc: 'Split whenever "Invoice", "Slip" appears', color: 'indigo' },
  ];

  const colorMap: Record<string, string> = {
    orange: 'border-orange-400 bg-orange-50 text-orange-700',
    violet: 'border-violet-400 bg-violet-50 text-violet-700',
    blue: 'border-blue-400 bg-blue-50 text-blue-700',
    emerald: 'border-emerald-400 bg-emerald-50 text-emerald-700',
    teal: 'border-teal-400 bg-teal-50 text-teal-700',
    indigo: 'border-indigo-400 bg-indigo-50 text-indigo-700',
  };

  return (
    <ToolWorkspaceShell
      title="Split PDF File"
      subtitle="Extract pages visually. Split by exact target file size, invoice keyword, or custom ranges."
      categoryLabel="PDF Extractor · Browser Engine"
      icon={Scissors}
      microVariant="split"
      tone="amber"
    >
      <div className="flex flex-col items-center">
        <div className="flex flex-wrap items-center justify-center gap-2 mb-7">
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-teal-100/80 text-teal-800 border border-teal-200/70">
            💾 Split by Target Size (&lt;2MB Govt / WhatsApp)
          </span>
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100/80 text-indigo-800 border border-indigo-200/70">
            🔍 Split by Keyword / Invoice Title
          </span>
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100/80 text-amber-800 border border-amber-200/70">
            ✂️ Visual Page Selector
          </span>
          <Link
            to="/split-in-half"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-100/80 text-rose-800 hover:bg-rose-200/80 transition-colors border border-rose-200/70"
          >
            ✂ Need to split 2-page book spreads? Split In Half →
          </Link>
        </div>

                {!file ? (
                  <div className="w-full max-w-5xl space-y-6">
                    <FileDropzone onDrop={handleDrop} multiple={false} title="Drop PDF here or click to select" />

                    {/* Supported Split Modes Showcase */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-orange-600" />
                          <h3 className="text-base font-bold text-gray-900">Supported Split Modes</h3>
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Choose & Drop</span>
                        </div>
                        <span className="text-xs text-gray-400">Click any mode to pre-select it</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {modes.map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setSplitMode(m.id)}
                            className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${splitMode === m.id
                              ? colorMap[m.color] + ' ring-2 ring-offset-1 ring-current shadow-xs'
                              : 'border-gray-100 bg-gray-50/60 hover:border-gray-200'
                              }`}
                          >
                            <m.icon className="w-5 h-5 mt-0.5 shrink-0" />
                            <div>
                              <div className="font-bold text-sm text-gray-900">{m.label}</div>
                              <div className="text-xs text-gray-500 mt-1 leading-relaxed">{m.desc}</div>
                            </div>
                          </button>
                        ))}
                      </div>

                      {/* Mode Specific Preview / Quick Info */}
                      <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                        <div className="text-xs text-slate-600">
                          {splitMode === 'size' && (
                            <span>⚡ <strong>Target Size Mode:</strong> Guarantees output files stay strictly under 2MB for Govt portals (SSC, UPSC) or 16MB for WhatsApp without trial and error.</span>
                          )}
                          {splitMode === 'keyword' && (
                            <span>🔍 <strong>Keyword / Invoice Mode:</strong> Uses OCR and PDF text extraction to cut new documents whenever terms like "Invoice", "Salary Slip", or "Roll No" appear.</span>
                          )}
                          {splitMode === 'all' && (
                            <span>📑 <strong>All Pages:</strong> Every single page of your document will be exported into an individual single-page PDF.</span>
                          )}
                          {splitMode === 'selection' && (
                            <span>🎯 <strong>Visual Selection:</strong> Interactive thumbnail grid lets you click specific pages to extract.</span>
                          )}
                          {splitMode === 'ranges' && (
                            <span>✂️ <strong>Custom Ranges:</strong> Specify custom page ranges like 1-5, 8, 12-15 to split into exact segments.</span>
                          )}
                          {splitMode === 'every' && (
                            <span>📚 <strong>Every N Pages:</strong> Automatically bundle every 2, 5, or 10 pages into equal chunks.</span>
                          )}
                        </div>
                        <span className="text-xs font-bold text-orange-600 shrink-0 ml-4">Active: {modes.find(m => m.id === splitMode)?.label}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full max-w-6xl space-y-6">

                    {/* File info bar */}
                    <div className="flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-100">
                      <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                        <FileText className="w-6 h-6 text-orange-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{file.name}</p>
                        <p className="text-sm text-gray-500">{pageCount} pages · {(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <button onClick={() => { setFile(null); setSplitUrls([]); setThumbs([]); }} className="text-sm text-gray-400 hover:text-red-500 transition-colors px-3 py-1 rounded-lg hover:bg-red-50">
                        Change file
                      </button>
                    </div>

                    {splitUrls.length > 0 ? (
                      /* Results */
                      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <div className="text-center mb-6">
                          <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-3">
                            <CheckSquare className="w-6 h-6 text-green-600" />
                          </div>
                          <h3 className="text-2xl font-bold text-gray-900">Split Complete!</h3>
                          <p className="text-gray-500 mt-1">{splitUrls.length} file{splitUrls.length > 1 ? 's' : ''} created</p>
                        </div>
                        {splitUrls.length > 1 && (
                          <button
                            onClick={downloadAll}
                            disabled={isZipping}
                            className="w-full mb-4 py-3 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2 shadow-sm"
                          >
                            {isZipping ? (
                              <>
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Creating ZIP Archive...
                              </>
                            ) : (
                              <>
                                <Archive className="w-5 h-5" /> Download All as ZIP ({splitUrls.length} files)
                              </>
                            )}
                          </button>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {splitUrls.map((item, i) => (
                            <a key={i} href={item.url} download={item.name}
                              className="flex items-center gap-3 p-4 border border-gray-200 rounded-xl hover:border-orange-300 hover:bg-orange-50 transition-all group">
                              <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center shrink-0">
                                <FileText className="w-5 h-5 text-red-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-900 text-sm truncate">{item.name}</p>
                                <p className="text-xs text-gray-400">{item.pages}</p>
                              </div>
                              <Download className="w-4 h-4 text-gray-400 group-hover:text-orange-600 shrink-0" />
                            </a>
                          ))}
                        </div>
                        <button onClick={() => { setSplitUrls([]); setSelectedPages(new Set()); }}
                          className="mt-6 w-full py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors">
                          Split Again
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Left: mode + options */}
                        <div className="lg:col-span-1 space-y-4">
                          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                            <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase tracking-wider">Split Mode</h3>
                            <div className="space-y-2">
                              {modes.map(m => (
                                <button key={m.id} onClick={() => setSplitMode(m.id)}
                                  className={`w-full flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${splitMode === m.id ? colorMap[m.color] + ' ring-2 ring-offset-1 ring-current' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}>
                                  <m.icon className="w-5 h-5 mt-0.5 shrink-0" />
                                  <div>
                                    <div className="font-semibold text-sm">{m.label}</div>
                                    <div className="text-xs opacity-70 mt-0.5">{m.desc}</div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Mode-specific options */}
                          {splitMode === 'ranges' && (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                              <label className="block text-sm font-semibold text-gray-700 mb-2">Page Ranges</label>
                              <input type="text" value={ranges} onChange={e => setRanges(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none text-sm"
                                placeholder="e.g. 1-3, 5, 7-10" />
                              <p className="text-xs text-gray-400 mt-2">Each range creates a separate PDF file.</p>
                            </div>
                          )}

                          {splitMode === 'every' && (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                              <label className="block text-sm font-semibold text-gray-700 mb-2">Split every <span className="text-orange-600">{everyN}</span> page{everyN > 1 ? 's' : ''}</label>
                              <input type="range" min={1} max={Math.max(1, Math.floor(pageCount / 2))} value={everyN}
                                onChange={e => setEveryN(Number(e.target.value))}
                                className="w-full accent-orange-500" />
                              <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>1</span><span>{Math.max(1, Math.floor(pageCount / 2))}</span>
                              </div>
                              <p className="text-xs text-gray-400 mt-2">Creates {Math.ceil(pageCount / everyN)} chunks of {everyN} page{everyN > 1 ? 's' : ''} each.</p>
                            </div>
                          )}

                          {splitMode === 'selection' && (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                              <div className="flex gap-2">
                                <button onClick={selectAll} className="flex-1 py-2 text-sm font-semibold bg-violet-50 text-violet-700 rounded-lg hover:bg-violet-100 transition-colors">Select All</button>
                                <button onClick={clearAll} className="flex-1 py-2 text-sm font-semibold bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">Clear</button>
                              </div>
                              {selectedPages.size > 0 && (
                                <p className="text-xs text-center text-violet-600 mt-2 font-medium">{selectedPages.size} page{selectedPages.size > 1 ? 's' : ''} selected</p>
                              )}
                            </div>
                          )}

                          {/* Split by File Size */}
                          {splitMode === 'size' && (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
                              <div className="flex items-center gap-1.5 text-teal-700 font-bold text-sm">
                                <HardDrive className="w-4 h-4" />
                                <span>Target Maximum File Size</span>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                {[
                                  { label: '2 MB', desc: 'Govt Portals / SSC', val: 2 },
                                  { label: '5 MB', desc: 'Standard Form', val: 5 },
                                  { label: '10 MB', desc: 'Email Attachment', val: 10 },
                                  { label: '16 MB', desc: 'WhatsApp Limit', val: 16 },
                                ].map(preset => (
                                  <button
                                    key={preset.val}
                                    type="button"
                                    onClick={() => setTargetSizeMB(preset.val)}
                                    className={`p-2 rounded-xl text-left border-2 transition-all ${targetSizeMB === preset.val
                                      ? 'border-teal-500 bg-teal-50 text-teal-900 font-bold'
                                      : 'border-gray-100 bg-gray-50 hover:border-gray-200 text-gray-700'
                                      }`}
                                  >
                                    <div className="text-xs font-bold">{preset.label}</div>
                                    <div className="text-[10px] text-gray-500">{preset.desc}</div>
                                  </button>
                                ))}
                              </div>
                              <div className="pt-2">
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Custom Limit (MB)</label>
                                <input
                                  type="number"
                                  min={0.2}
                                  max={100}
                                  step={0.5}
                                  value={targetSizeMB}
                                  onChange={e => setTargetSizeMB(Number(e.target.value))}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold focus:outline-none focus:border-teal-500"
                                />
                              </div>
                              <p className="text-[11px] text-gray-400 leading-tight">
                                Guarantees every output PDF chunk stays strictly below {targetSizeMB} MB without trial and error.
                              </p>
                            </div>
                          )}

                          {/* Split by Keyword / Invoice */}
                          {splitMode === 'keyword' && (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
                              <div className="flex items-center gap-1.5 text-indigo-700 font-bold text-sm">
                                <Search className="w-4 h-4" />
                                <span>Split Boundary Keyword</span>
                              </div>
                              <input
                                type="text"
                                value={splitKeyword}
                                onChange={e => setSplitKeyword(e.target.value)}
                                placeholder="e.g. Invoice, Salary, Roll No"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold focus:outline-none focus:border-indigo-500"
                              />
                              <div className="flex flex-wrap gap-1.5">
                                {['Invoice', 'Salary Slip', 'Roll No', 'Receipt', 'Form 16', 'Statement'].map(tag => (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={() => setSplitKeyword(tag)}
                                    className="px-2 py-0.5 text-[11px] rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium transition-colors"
                                  >
                                    {tag}
                                  </button>
                                ))}
                              </div>
                              <p className="text-[11px] text-gray-400 leading-tight">
                                Scans the text of all pages. Each page containing "{splitKeyword}" begins a new separate document.
                              </p>
                            </div>
                          )}

                          <button onClick={splitPdf} disabled={isProcessing || (splitMode === 'selection' && selectedPages.size === 0)}
                            className="w-full py-4 bg-orange-600 text-white text-base font-bold rounded-xl hover:bg-orange-700 transition-colors disabled:opacity-50 shadow-md flex items-center justify-center gap-2">
                            {isProcessing ? (
                              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{processStep || 'Splitting...'}</>
                            ) : (
                              <><Scissors className="w-5 h-5" />Split PDF</>
                            )}
                          </button>
                        </div>

                        {/* Right: Thumbnail grid */}
                        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider">Page Preview</h3>
                            {loadingThumbs && (
                              <span className="text-xs text-gray-400 flex items-center gap-1">
                                <div className="w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                                Loading {thumbProgress}%
                              </span>
                            )}
                          </div>
                          {thumbs.length === 0 && !loadingThumbs && (
                            <div className="flex items-center justify-center h-48 text-gray-300">
                              <p className="text-sm">Thumbnails loading...</p>
                            </div>
                          )}
                          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2 max-h-[480px] overflow-y-auto pr-1">
                            {thumbs.map(t => {
                              const isSelected = selectedPages.has(t.num);
                              return (
                                <button key={t.num} onClick={() => splitMode === 'selection' && togglePage(t.num)}
                                  className={`relative group flex flex-col items-center rounded-xl overflow-hidden border-2 transition-all ${splitMode === 'selection' ? 'cursor-pointer' : 'cursor-default'} ${isSelected ? 'border-violet-500 shadow-md shadow-violet-200' : 'border-gray-200 hover:border-orange-300'}`}>
                                  <img src={t.thumb} alt={`Page ${t.num}`} className="w-full object-cover" />
                                  {splitMode === 'selection' && (
                                    <div className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center transition-all ${isSelected ? 'bg-violet-500 text-white' : 'bg-white/80 text-gray-400 border border-gray-300 opacity-0 group-hover:opacity-100'}`}>
                                      {isSelected ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                                    </div>
                                  )}
                                  <div className={`w-full py-1 text-center text-[10px] font-semibold ${isSelected ? 'bg-violet-500 text-white' : 'bg-gray-50 text-gray-500'}`}>
                                    {t.num}
                                  </div>
                                </button>
                              );
                            })}
                            {loadingThumbs && Array.from({ length: Math.max(0, pageCount - thumbs.length) }).map((_, i) => (
                              <div key={i} className="aspect-[3/4] rounded-xl bg-gray-100 animate-pulse" />
                            ))}
                          </div>
                        </div>
                      </div>
            )}
          </div>
        )}
      </div>
    </ToolWorkspaceShell>
  );
}
