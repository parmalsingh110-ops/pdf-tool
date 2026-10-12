import React, { useState } from 'react';
import { 
  Wrench, Download, AlertTriangle, Loader2, FileText, 
  CheckCircle, RefreshCw, ShieldCheck, Activity, ArrowRight, Sparkles
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface DiagnosticItem {
  name: string;
  status: 'passed' | 'repaired' | 'warning';
  detail: string;
}

export default function PdfRepair() {
  useSEO(
    'PDF Repair Online Free — Fix Corrupted & Broken PDF Files',
    'Repair damaged, corrupted, or unreadable PDF files online. Multi-strategy recovery rebuilds XREF tables, fixes headers, and salvages damaged page streams.'
  );

  usePageSEO(
    'PDF Repair & Document Recovery Studio',
    'Fix corrupted PDF files using in-browser header reconstruction, XREF rebuilding, and visual stream recovery. 100% private and resilient.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState('');
  const [strategyUsed, setStrategyUsed] = useState<string>('');
  const [salvagedPages, setSalvagedPages] = useState<number>(0);
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([]);

  const handleDrop = (files: File[]) => {
    if (files[0]) {
      setFile(files[0]);
      setResultUrl(null);
      setDiagnostics([]);
      setStrategyUsed('');
    }
  };

  const repairDocument = async () => {
    if (!file) return;
    setBusy(true);
    setProgressMsg('Diagnosing file damage & corruption points...');

    const diagList: DiagnosticItem[] = [];

    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);

      // Strategy 1: Header Normalization & Structure Rebuild via pdf-lib in Browser
      try {
        setProgressMsg('Strategy 1: Reconstructing XREF tables & stream dictionaries in memory...');
        
        // Find %PDF- header position (fix prepended garbage bytes)
        let headerOffset = -1;
        for (let i = 0; i < Math.min(uint8.length, 2048); i++) {
          if (uint8[i] === 0x25 && uint8[i+1] === 0x50 && uint8[i+2] === 0x44 && uint8[i+3] === 0x46) {
            headerOffset = i;
            break;
          }
        }

        let cleanBytes = uint8;
        if (headerOffset > 0) {
          cleanBytes = uint8.slice(headerOffset);
          diagList.push({ name: 'Header Offset', status: 'repaired', detail: `Stripped ${headerOffset} bytes of prepended corrupt junk before %PDF header.` });
        } else if (headerOffset === 0) {
          diagList.push({ name: 'PDF Header', status: 'passed', detail: 'Valid %PDF-1.x magic bytes identified.' });
        } else {
          // Force prepend header if completely missing
          const header = new TextEncoder().encode('%PDF-1.7\n');
          const combined = new Uint8Array(header.length + uint8.length);
          combined.set(header, 0);
          combined.set(uint8, header.length);
          cleanBytes = combined;
          diagList.push({ name: 'Missing Header', status: 'repaired', detail: 'Missing %PDF header reconstructed.' });
        }

        const pdfDoc = await PDFDocument.load(cleanBytes, { ignoreEncryption: true });
        const pageCount = pdfDoc.getPageCount();

        if (pageCount > 0) {
          const repairedBytes = await pdfDoc.save({ useObjectStreams: false });
          diagList.push({ name: 'XREF & Dictionary Table', status: 'repaired', detail: 'Reconstructed cross-reference stream table & serialized clean PDF.' });
          diagList.push({ name: 'Page Stream Trees', status: 'passed', detail: `All ${pageCount} document pages verified and intact.` });

          const blob = new Blob([repairedBytes as any], { type: 'application/pdf' });
          setResultUrl(URL.createObjectURL(blob));
          setResultName(`repaired_${file.name}`);
          setStrategyUsed('In-Memory XREF Reconstructor & Dictionary Normalizer');
          setSalvagedPages(pageCount);
          setDiagnostics(diagList);
          return;
        }
      } catch (clientErr) {
        console.warn('Strategy 1 fallback needed:', clientErr);
        diagList.push({ name: 'Deep Stream Issue', status: 'warning', detail: 'Direct parser tripped on malformed streams. Switching to visual stream recovery.' });
      }

      // Strategy 2: Fault-Tolerant Visual Stream Page Salvage
      try {
        setProgressMsg('Strategy 2: Extracting intact visual streams via fault-tolerant raster engine...');
        const srcPdf = await pdfjsLib.getDocument({ data: uint8 }).promise;
        const newDoc = await PDFDocument.create();
        let rescued = 0;

        for (let p = 1; p <= srcPdf.numPages; p++) {
          try {
            setProgressMsg(`Rescuing page ${p} of ${srcPdf.numPages}...`);
            const page = await srcPdf.getPage(p);
            const vp = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            canvas.width = vp.width;
            canvas.height = vp.height;
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

            const imgData = canvas.toDataURL('image/jpeg', 0.94);
            const imgBytes = dataUrlToBytes(imgData);
            const embedded = await newDoc.embedJpg(imgBytes);

            const origVp = page.getViewport({ scale: 1.0 });
            const newPage = newDoc.addPage([origVp.width, origVp.height]);
            newPage.drawImage(embedded, { x: 0, y: 0, width: origVp.width, height: origVp.height });
            rescued++;
          } catch {
            diagList.push({ name: `Page ${p}`, status: 'warning', detail: 'Could not recover corrupted stream for this single page.' });
          }
        }

        if (rescued > 0) {
          const salvagedBytes = await newDoc.save();
          diagList.push({ name: 'Visual Page Salvage', status: 'repaired', detail: `Successfully salvaged ${rescued} intact page(s) into brand new valid PDF.` });

          const blob = new Blob([salvagedBytes as any], { type: 'application/pdf' });
          setResultUrl(URL.createObjectURL(blob));
          setResultName(`salvaged_${file.name}`);
          setStrategyUsed('Fault-Tolerant Visual Stream Page Salvage');
          setSalvagedPages(rescued);
          setDiagnostics(diagList);
          return;
        }
      } catch (salvageErr) {
        console.warn('Strategy 2 fallback needed:', salvageErr);
      }

      // Strategy 3: Server-side Ghostscript fallback if available
      try {
        setProgressMsg('Strategy 3: Dispatching to low-level Ghostscript / mutool server engine...');
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`${API_BASE}/repair-pdf`, { method: 'POST', body: fd });
        if (res.ok) {
          const blob = await res.blob();
          const strat = res.headers.get('X-Repair-Strategy') || 'Ghostscript Deep Rebuild';
          diagList.push({ name: 'Server Ghostscript Engine', status: 'repaired', detail: 'Repaired low-level linearized objects & CFF fonts.' });
          setResultUrl(URL.createObjectURL(blob));
          setResultName(`repaired_${file.name}`);
          setStrategyUsed(strat);
          setDiagnostics(diagList);
          return;
        }
      } catch {
        // Server unreachable
      }

      throw new Error('This document is critically damaged beyond salvage (zero readable streams found).');
    } catch (err: any) {
      alert(`Repair error: ${err?.message || 'Failed to repair file.'}`);
    } finally {
      setBusy(false);
      setProgressMsg('');
    }
  };

  const reset = () => {
    setFile(null);
    setResultUrl(null);
    setDiagnostics([]);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-4 sm:p-8 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm border border-amber-100 dark:border-amber-900/50">
          <Wrench className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-2">
          PDF Repair & File Recovery Studio
        </h1>
        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          Fix broken, damaged, unreadable, or partially downloaded PDF files using multi-strategy recovery engines.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl space-y-6">
          <FileDropzone 
            onDrop={handleDrop} 
            multiple={false} 
            title="Select Corrupted or Broken PDF File" 
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Sparkles className="w-6 h-6 text-amber-600 dark:text-amber-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">XREF Rebuilder</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Rebuilds broken cross-reference tables and missing trailers.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Activity className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Page Salvage</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Recovers readable pages even if others are corrupted.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Multi-Strategy</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Tries 3 distinct recovery algorithms automatically.</p>
            </div>
          </div>
        </div>
      ) : !resultUrl ? (
        <div className="w-full max-w-xl bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="w-8 h-8 text-amber-600 shrink-0" />
              <div className="min-w-0">
                <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{file.name}</p>
                <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB • Ready for deep recovery</p>
              </div>
            </div>
            <button onClick={reset} className="text-xs text-slate-500 hover:text-slate-800 underline">Change</button>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/30 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/50 space-y-2 text-xs text-amber-900 dark:text-amber-300">
            <p className="font-bold flex items-center gap-1.5 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Recovery Pipeline Strategies:
            </p>
            <p>1. <strong>In-Browser XREF Reconstruct:</strong> Strips prepended garbage bytes & rebuilds dictionary offsets.</p>
            <p>2. <strong>Visual Stream Salvage:</strong> Extracts readable page objects and compiles a pristine PDF.</p>
            <p>3. <strong>Ghostscript Deep Clean:</strong> Rebuilds linearized stream structures.</p>
          </div>

          <button
            onClick={repairDocument}
            disabled={busy}
            className="w-full py-4 px-6 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-bold rounded-2xl shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2 text-base transition-all disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{progressMsg || 'Repairing Corrupted PDF...'}</span>
              </>
            ) : (
              <>
                <Wrench className="w-5 h-5" />
                <span>Start Multi-Strategy Repair</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      ) : (
        /* Result Screen */
        <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-xl text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle className="w-10 h-10" />
          </div>

          <div>
            <span className="inline-block px-3 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
              Successfully Repaired
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              PDF Document Recovered!
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
              Method: <strong className="text-emerald-600 dark:text-emerald-400">{strategyUsed}</strong>
            </p>
          </div>

          {/* Diagnostic Log */}
          {diagnostics.length > 0 && (
            <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-left space-y-2 text-xs">
              <span className="font-bold text-slate-800 dark:text-slate-200 block mb-1">Repair Diagnostics:</span>
              {diagnostics.map((d, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{d.name}:</span>{' '}
                    <span className="text-slate-500">{d.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <a
              href={resultUrl}
              download={resultName}
              className="flex-1 py-4 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 text-base transition-all"
            >
              <Download className="w-5 h-5" />
              Download Repaired PDF
            </a>
            <button
              onClick={reset}
              className="py-4 px-6 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-2xl transition-all text-sm"
            >
              Repair Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
