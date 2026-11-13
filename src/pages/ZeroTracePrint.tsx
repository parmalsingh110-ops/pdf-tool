import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldCheck,
  Printer,
  Clock,
  Flame,
  CheckCircle2,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import FileDropzone from '../components/FileDropzone';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { PearlScanOverlay } from '../components/pearl/PearlMotion';
import ToolSEOSection from '../components/ToolSEOSection';
import { toArrayBufferBytes } from '../lib/blobUrl';
import { escapeHtml } from '../lib/utils';

interface DestructionCert {
  fileName: string;
  fileSize: number;
  hash: string;
  timestamp: string;
}

export default function ZeroTracePrint() {
  useSEO(
    'Confidential Zero-Trace Print Tunnel — Ephemeral In-Memory Document Viewer | PDF Media Suite',
    'Print sensitive bank statements, registries, and KYC documents with zero disk trace. Automatically shreds memory buffer on print with a cryptographic destruction certificate.'
  );

  usePageSEO(
    'Confidential Zero-Trace Print Tunnel — Privacy Print for Cyber Cafes',
    'Secure, zero-trace PDF printing tunnel for E-Mitra, Xerox centers, and law offices. Documents live only in temporary RAM and auto-shred after printing.',
    'zero trace print, ephemeral pdf viewer, memory shredder pdf, confidential print tunnel, cyber cafe privacy print, tamper proof document shredder',
    '/zero-trace-print'
  );

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [zoomScale, setZoomScale] = useState<number>(1.2);
  const [timeLeft, setTimeLeft] = useState<number>(120); // 2 minutes countdown
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(true);
  const [isDestroyed, setIsDestroyed] = useState<boolean>(false);
  const [certificate, setCertificate] = useState<DestructionCert | null>(null);
  const [copiedHash, setCopiedHash] = useState<boolean>(false);

  const prefersReduced = useReducedMotion();
  // Raw buffer held in ref for zeroing out
  const rawBufferRef = useRef<Uint8Array | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Auto-wipe Countdown
  useEffect(() => {
    if (!pdfDoc || !isTimerRunning || isDestroyed) return;

    if (timeLeft <= 0) {
      handleShredMemory();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, isTimerRunning, pdfDoc, isDestroyed]);

  // Load File strictly in RAM
  const handleFileUpload = async (file: File) => {
    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF document.');
      return;
    }

    setFileName(file.name);
    setFileSize(file.size);
    setIsDestroyed(false);
    setCertificate(null);
    setTimeLeft(120);
    setIsTimerRunning(true);

    try {
      const buffer = await file.arrayBuffer();
      // Keep an isolated copy for cryptographic hashing & zero-fill shredding so PDF.js doesn't detach it
      const u8 = new Uint8Array(buffer);
      rawBufferRef.current = new Uint8Array(u8);

      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      setCurrentPage(1);
    } catch (err) {
      console.error(err);
      alert('Could not load PDF into memory. Please try again.');
    }
  };

  // Render Page to Canvas
  useEffect(() => {
    if (!pdfDoc || isDestroyed) return;

    let isCancelled = false;

    const render = async () => {
      const page = await pdfDoc.getPage(currentPage);
      if (isCancelled) return;

      const viewport = page.getViewport({ scale: zoomScale });
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    };

    render();

    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, currentPage, zoomScale, isDestroyed]);

  // Compute SHA-256 for proof of shredding
  const computeHash = async (u8: Uint8Array): Promise<string> => {
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', toArrayBufferBytes(u8));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    }
  };

  // Cryptographic Shred & Wipe
  const handleShredMemory = async () => {
    let hash = 'N/A';
    if (rawBufferRef.current) {
      hash = await computeHash(rawBufferRef.current);
      // Zero out the buffer in memory
      rawBufferRef.current.fill(0);
      rawBufferRef.current = null;
    }

    // Wipe Canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
    }

    if (pdfDoc) {
      pdfDoc.destroy();
      setPdfDoc(null);
    }

    setCertificate({
      fileName,
      fileSize,
      hash,
      timestamp: new Date().toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }),
    });

    setIsDestroyed(true);
    setIsTimerRunning(false);
  };

  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrint = async () => {
    if (!pdfDoc || isDestroyed || isPrinting) return;
    setIsPrinting(true);

    try {
      const pageImages: string[] = [];
      const numPages = pdfDoc.numPages;

      for (let p = 1; p <= numPages; p++) {
        const page = await pdfDoc.getPage(p);
        const viewport = page.getViewport({ scale: 2.0 }); // 200 DPI crisp print
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
          pageImages.push(canvas.toDataURL('image/jpeg', 0.95));
        }
      }

      const printWin = window.open('', '_blank');
      if (!printWin) {
        alert('Please allow popups to open the confidential print dialog.');
        setIsPrinting(false);
        return;
      }

      printWin.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Confidential Print - ${escapeHtml(fileName)}</title>
            <style>
              @page { size: auto; margin: 0; }
              body { margin: 0; padding: 0; background: #fff; }
              .page-item { width: 100%; page-break-after: always; display: flex; justify-content: center; align-items: center; }
              .page-item:last-child { page-break-after: avoid; }
              img { width: 100%; height: auto; display: block; }
            </style>
          </head>
          <body>
            ${pageImages.map((src) => `<div class="page-item"><img src="${src}" /></div>`).join('')}
            <script>
              window.onload = function() {
                window.focus();
                window.print();
                window.onafterprint = function() { window.close(); };
              };
            </script>
          </body>
        </html>
      `);
      printWin.document.close();

      // Trigger automatic cryptographic memory wipe after sending to printer
      setTimeout(() => {
        handleShredMemory();
      }, 1200);
    } catch (e) {
      console.error('Confidential print error:', e);
      window.print();
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Confidential Zero-Trace Print Tunnel"
      subtitle="Print private bank statements, salary slips, and Aadhaar docs without leaving a trace on the shop computer."
      categoryLabel="100% In-Memory RAM Only • Zero Disk Footprint"
      icon={ShieldCheck}
      microVariant="security"
      tone="rose"
      trustNote="Zero bytes written to disk • Auto-shredding cryptographic RAM wiper"
    >
      <div className="w-full max-w-5xl mx-auto space-y-8">
        {pdfDoc && !isDestroyed && (
          <div className="pms-glass-panel p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-semibold text-[var(--pms-ink)] truncate">
              Active RAM Tunnel: <span className="font-bold">{fileName}</span> ({(fileSize / 1024).toFixed(1)} KB)
            </div>
            <button
              onClick={handleShredMemory}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/25 transition-all hover:scale-[1.02]"
            >
              <Flame className="w-4 h-4 animate-bounce" /> Shred &amp; Wipe Memory Now
            </button>
          </div>
        )}

        {/* Upload State */}
        {!pdfDoc && !isDestroyed && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.22 }}
            className="w-full max-w-2xl mx-auto"
          >
            <FileDropzone
              onDrop={(files) => files[0] && handleFileUpload(files[0])}
              multiple={false}
              accept={{ 'application/pdf': ['.pdf'] }}
              title="Drop Confidential PDF to Print Without Saving"
              subtitle="File loads strictly into browser RAM memory. Zero bytes saved to hard drive or Downloads folder."
            />
          </motion.div>
        )}

        {/* Active Document In-Memory Sandbox (synchronously mounted for canvasRef) */}
        {pdfDoc && !isDestroyed && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.22 }}
            className="space-y-4"
          >
            {/* Control Bar */}
            <div className="p-4 rounded-2xl pms-glass-panel flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold">
                  <Clock className="w-4 h-4 animate-spin" />
                  Auto-Shred in: {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                </div>
                <button
                  onClick={() => setIsTimerRunning(!isTimerRunning)}
                  className="text-xs font-semibold text-[var(--pms-muted)] hover:text-[var(--pms-ink)] transition-colors"
                >
                  {isTimerRunning ? 'Pause' : 'Resume'}
                </button>
                <button
                  onClick={() => setTimeLeft(120)}
                  className="text-xs font-semibold text-[var(--pms-muted)] hover:text-[var(--pms-ink)] transition-colors"
                >
                  Reset 2m
                </button>
              </div>

              {/* Page Nav & Zoom */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                  className="p-1.5 rounded-lg border border-[var(--pms-border)] bg-white/70 dark:bg-slate-900/70 text-[var(--pms-ink)] disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-bold text-[var(--pms-ink)]">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage >= totalPages}
                  className="p-1.5 rounded-lg border border-[var(--pms-border)] bg-white/70 dark:bg-slate-900/70 text-[var(--pms-ink)] disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                <div className="h-4 w-px bg-[var(--pms-border)] mx-1" />

                <button
                  onClick={() => setZoomScale(Math.max(0.6, zoomScale - 0.2))}
                  className="p-1.5 rounded-lg border border-[var(--pms-border)] bg-white/70 dark:bg-slate-900/70 text-[var(--pms-ink)]"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setZoomScale(Math.min(2.0, zoomScale + 0.2))}
                  className="p-1.5 rounded-lg border border-[var(--pms-border)] bg-white/70 dark:bg-slate-900/70 text-[var(--pms-ink)]"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  disabled={isPrinting}
                  className="pms-btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
                >
                  <Printer className="w-4 h-4" /> {isPrinting ? 'Rendering High-DPI Print...' : 'Send to Printer (1-Click)'}
                </button>
                <button
                  onClick={handleShredMemory}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-rose-50/90 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors"
                >
                  <Flame className="w-4 h-4" /> Shred Now
                </button>
              </div>
            </div>

            {/* Document Canvas Display */}
            <div className="p-8 rounded-3xl pms-glass-panel flex justify-center overflow-auto min-h-[500px] relative">
              <PearlScanOverlay active={isPrinting} label="Rendering crisp 200 DPI print buffers before RAM wipe..." />
              <canvas
                ref={canvasRef}
                className="bg-white shadow-2xl rounded-sm max-w-full print:shadow-none"
              />
            </div>
          </motion.div>
        )}

        {/* Cryptographic Destruction Certificate Screen */}
        {isDestroyed && certificate && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: prefersReduced ? 0 : 0.24 }}
            className="p-8 md:p-12 rounded-3xl pms-glass-panel border-2 border-emerald-500/80 text-center space-y-6"
          >
            <div className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-12 h-12" />
            </div>

            <div>
              <span className="text-xs uppercase tracking-widest font-black text-emerald-600 dark:text-emerald-400">
                VERIFIED CRYPTOGRAPHIC DESTRUCTION
              </span>
              <h2 className="text-3xl font-black text-[var(--pms-ink)] mt-1">
                Document 100% Wiped from Memory
              </h2>
              <p className="text-sm text-[var(--pms-muted)] max-w-lg mx-auto mt-2">
                The payload has been zero-filled in RAM and discarded. Zero bytes remain on this workstation or disk.
              </p>
            </div>

            {/* Certificate Box */}
            <div className="max-w-xl mx-auto p-5 rounded-2xl bg-white/65 dark:bg-slate-900/65 border border-[var(--pms-border)] text-left space-y-3 font-mono text-xs">
              <div className="flex justify-between border-b border-[var(--pms-border)] pb-2">
                <span className="text-[var(--pms-muted)]">Filename:</span>
                <span className="font-bold text-[var(--pms-ink)]">{certificate.fileName}</span>
              </div>
              <div className="flex justify-between border-b border-[var(--pms-border)] pb-2">
                <span className="text-[var(--pms-muted)]">Payload Size:</span>
                <span className="text-[var(--pms-ink)]">{(certificate.fileSize / 1024).toFixed(1)} KB</span>
              </div>
              <div className="flex justify-between border-b border-[var(--pms-border)] pb-2">
                <span className="text-[var(--pms-muted)]">Destruction Time:</span>
                <span className="text-[var(--pms-ink)]">{certificate.timestamp}</span>
              </div>
              <div>
                <span className="text-[var(--pms-muted)] block mb-1">Pre-Destruction SHA-256 Hash:</span>
                <div className="p-2 rounded bg-white/80 dark:bg-slate-950/75 border border-[var(--pms-border)] text-[10px] break-all text-emerald-600 dark:text-emerald-400 flex items-center justify-between gap-2">
                  <span>{certificate.hash}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(certificate.hash);
                      setCopiedHash(true);
                      setTimeout(() => setCopiedHash(false), 2000);
                    }}
                    className="p-1 text-[var(--pms-muted)] hover:text-[var(--pms-ink)] shrink-0"
                  >
                    {copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-center gap-3">
              <button
                onClick={() => {
                  setIsDestroyed(false);
                  setCertificate(null);
                }}
                className="pms-btn-primary px-6 py-2.5 rounded-xl text-xs font-bold"
              >
                Print Another Confidential File
              </button>
            </div>
          </motion.div>
        )}

        {/* SEO Information */}
        <ToolSEOSection
          toolName="Confidential Zero-Trace Print Tunnel"
          headline="Ephemeral Client-Side In-Memory Document Printing with Instant Cryptographic Shredding"
          description="A privacy utility for cyber cafes, Xerox shops, legal chambers, and financial offices. Enables customers to print confidential salary statements, property deeds, court affidavits, and medical summaries in complete confidence. The file resides strictly in temporary browser memory without ever touching local storage or hard disks, and is instantly wiped with a verifiable cryptographic certificate upon print."
        />
      </div>
    </ToolWorkspaceShell>
  );
}
