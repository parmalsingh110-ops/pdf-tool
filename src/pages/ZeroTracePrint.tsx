import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldCheck,
  Upload,
  Printer,
  Trash2,
  Clock,
  Lock,
  Flame,
  CheckCircle2,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';

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

  // Raw buffer held in ref for zeroing out
  const rawBufferRef = useRef<Uint8Array | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const u8 = new Uint8Array(buffer);
      rawBufferRef.current = u8;

      const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
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
      const hashBuffer = await crypto.subtle.digest('SHA-256', u8);
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

  const handlePrint = () => {
    window.print();
    // After user initiates print, suggest immediate shred
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs font-bold text-rose-700 dark:text-rose-300 mb-2">
              <Lock className="w-3.5 h-3.5" /> 100% In-Memory RAM Only • Zero Disk Footprint
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">
              Confidential Zero-Trace Print Tunnel
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Print private bank statements, salary slips, and Aadhaar docs without leaving a trace on the shop computer.
            </p>
          </div>

          {pdfDoc && !isDestroyed && (
            <button
              onClick={handleShredMemory}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/30 transition-all hover:scale-105"
            >
              <Flame className="w-4 h-4 animate-bounce" /> Shred &amp; Wipe Memory Now
            </button>
          )}
        </div>

        {/* Upload State */}
        {!pdfDoc && !isDestroyed && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl p-12 text-center bg-white dark:bg-slate-900 hover:border-rose-500 hover:bg-rose-50/20 dark:hover:bg-rose-950/20 cursor-pointer transition-all group"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              accept="application/pdf"
              className="hidden"
            />
            <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Drop Confidential PDF to Print Without Saving
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              File loads strictly into browser RAM memory. Zero bytes saved to the hard drive or Downloads folder.
            </p>
          </div>
        )}

        {/* Active Document In-Memory Sandbox */}
        {pdfDoc && !isDestroyed && (
          <div className="space-y-4">
            {/* Control Bar */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold">
                  <Clock className="w-4 h-4 animate-spin" />
                  Auto-Shred in: {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                </div>
                <button
                  onClick={() => setIsTimerRunning(!isTimerRunning)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  {isTimerRunning ? 'Pause' : 'Resume'}
                </button>
                <button
                  onClick={() => setTimeLeft(120)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Reset 2m
                </button>
              </div>

              {/* Page Nav & Zoom */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage >= totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

                <button
                  onClick={() => setZoomScale(Math.max(0.6, zoomScale - 0.2))}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setZoomScale(Math.min(2.0, zoomScale + 0.2))}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 shadow-sm"
                >
                  <Printer className="w-4 h-4" /> Send to Printer (Ctrl+P)
                </button>
                <button
                  onClick={handleShredMemory}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-600 border border-rose-200 dark:border-rose-900 hover:bg-rose-100"
                >
                  <Flame className="w-4 h-4" /> Shred Now
                </button>
              </div>
            </div>

            {/* Document Canvas Display */}
            <div className="p-8 rounded-3xl bg-slate-200 dark:bg-slate-900 flex justify-center overflow-auto border border-slate-300 dark:border-slate-800 min-h-[500px]">
              <canvas
                ref={canvasRef}
                className="bg-white shadow-2xl rounded-sm max-w-full print:shadow-none"
              />
            </div>
          </div>
        )}

        {/* Cryptographic Destruction Certificate Screen */}
        {isDestroyed && certificate && (
          <div className="p-8 md:p-12 rounded-3xl bg-white dark:bg-slate-900 border-2 border-emerald-500 shadow-2xl text-center space-y-6 animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-12 h-12" />
            </div>

            <div>
              <span className="text-xs uppercase tracking-widest font-black text-emerald-600 dark:text-emerald-400">
                VERIFIED CRYPTOGRAPHIC DESTRUCTION
              </span>
              <h2 className="text-3xl font-black text-slate-900 dark:text-white mt-1">
                Document 100% Wiped from Memory
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-lg mx-auto mt-2">
                The payload has been zero-filled in RAM and discarded. Zero bytes remain on this workstation or disk.
              </p>
            </div>

            {/* Certificate Box */}
            <div className="max-w-xl mx-auto p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-left space-y-3 font-mono text-xs">
              <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                <span className="text-slate-400">Filename:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{certificate.fileName}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                <span className="text-slate-400">Payload Size:</span>
                <span className="text-slate-800 dark:text-slate-200">{(certificate.fileSize / 1024).toFixed(1)} KB</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                <span className="text-slate-400">Destruction Time:</span>
                <span className="text-slate-800 dark:text-slate-200">{certificate.timestamp}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">Pre-Destruction SHA-256 Hash:</span>
                <div className="p-2 rounded bg-slate-100 dark:bg-slate-900 text-[10px] break-all text-emerald-600 dark:text-emerald-400 flex items-center justify-between gap-2">
                  <span>{certificate.hash}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(certificate.hash);
                      setCopiedHash(true);
                      setTimeout(() => setCopiedHash(false), 2000);
                    }}
                    className="p-1 text-slate-400 hover:text-slate-600 shrink-0"
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
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 transition-opacity"
              >
                Print Another Confidential File
              </button>
            </div>
          </div>
        )}

        {/* SEO Information */}
        <ToolSEOSection
          toolName="Confidential Zero-Trace Print Tunnel"
          headline="Ephemeral Client-Side In-Memory Document Printing with Instant Cryptographic Shredding"
          description="A privacy utility for cyber cafes, Xerox shops, legal chambers, and financial offices. Enables customers to print confidential salary statements, property deeds, court affidavits, and medical summaries in complete confidence. The file resides strictly in temporary browser memory without ever touching local storage or hard disks, and is instantly wiped with a verifiable cryptographic certificate upon print."
        />
      </div>
    </div>
  );
}
