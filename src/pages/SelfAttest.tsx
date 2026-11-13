import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  PenTool,
  RotateCcw,
  Smartphone,
  Eye,
  FileCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import ShareQrModal from '../components/ShareQrModal';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';
import { toArrayBufferBytes } from '../lib/blobUrl';
import { dataUrlToBytes, downloadBlob } from '../lib/utils';

type AttestPhrase = 'Self Attested' | 'Self Attested with Date' | 'True Copy' | 'Verified from Original' | 'custom';
type StampPosition = 'bottom_right' | 'bottom_left' | 'bottom_center' | 'custom';

export default function SelfAttest() {
  const prefersReduced = useReducedMotion();

  useSEO(
    'Batch Self-Attested & Signature Stamper Online — Sarkari & College KYC Documents',
    'Sign and self-attest all pages of your documents in 1-click. Draw signature or upload image, add date and "Self Attested" stamp across marksheets, certificates and KYC PDFs.'
  );

  usePageSEO(
    'Self-Attested Signature Stamper — Batch Sign All Pages',
    'Free online tool to batch stamp digital signature, "Self Attested" text, and date on multi-page PDF documents for government jobs, college admissions, and bank KYC.',
    'self attested online pdf, batch sign pdf pages, add signature to all pages pdf, self attested stamp online, sarkari form self attest tool, true copy stamp maker',
    '/self-attest'
  );

  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);

  // Attestation details
  const [phrase, setPhrase] = useState<AttestPhrase>('Self Attested with Date');
  const [customPhrase, setCustomPhrase] = useState('Certified True Copy');
  const [signDate, setSignDate] = useState(() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  });
  const [inkColor, setInkColor] = useState<'blue' | 'black'>('blue');
  const [position, setPosition] = useState<StampPosition>('bottom_right');
  const [applyTo, setApplyTo] = useState<'all' | 'first' | 'custom'>('all');

  // Fine coordinate sliders (% from page top-left)
  const [customX] = useState(72);
  const [customY] = useState(88);

  // Signature Pad State
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [sigPngDataUrl, setSigPngDataUrl] = useState<string | null>(null);

  // Preview & Processing
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  const hasPdfLoaded = Boolean(pdfBytes);

  // Initialize signature drawing pad
  useEffect(() => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = inkColor === 'blue' ? '#1e40af' : '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [inkColor, hasPdfLoaded]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = sigCanvasRef.current;
    if (canvas) {
      setSigPngDataUrl(canvas.toDataURL('image/png'));
    }
  };

  const clearSignature = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    setSigPngDataUrl(null);
  };

  // Upload signature image instead of drawing
  const handleUploadSigImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);

        // Auto remove white background for transparency
        const imgData = ctx.getImageData(0, 0, c.width, c.height);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
          if (avg > 200) data[i + 3] = 0; // Transparent white
        }
        ctx.putImageData(imgData, 0, 0);
        setSigPngDataUrl(c.toDataURL('image/png'));
        setHasSignature(true);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Upload PDF document
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setIsProcessing(true);

    try {
      const buffer = await selected.arrayBuffer();
      const u8 = new Uint8Array(buffer);
      setPdfBytes(u8);

      const loadingTask = pdfjsLib.getDocument({ data: u8.slice(0) });
      const pdf = await loadingTask.promise;
      setPageCount(pdf.numPages);
      setActivePageIndex(0);
    } catch (err) {
      console.error('Error reading PDF:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper to get coordinates
  const getStampCoords = (pageW: number, pageH: number, blockW: number, blockH: number) => {
    if (position === 'bottom_right') {
      return { x: pageW - blockW - 40, y: pageH - blockH - 40 };
    }
    if (position === 'bottom_left') {
      return { x: 40, y: pageH - blockH - 40 };
    }
    if (position === 'bottom_center') {
      return { x: (pageW - blockW) / 2, y: pageH - blockH - 40 };
    }
    // Custom slider coordinates
    return {
      x: (customX / 100) * pageW - blockW / 2,
      y: (customY / 100) * pageH - blockH / 2,
    };
  };

  // Render preview of active page with self-attestation stamp
  useEffect(() => {
    if (!pdfBytes) return;

    let isMounted = true;
    const renderPreview = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice(0) });
        const pdf = await loadingTask.promise;
        const pageNum = Math.min(activePageIndex + 1, pdf.numPages);
        const page = await pdf.getPage(pageNum);

        const viewport = page.getViewport({ scale: 1.4 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;

        // Render Self-Attestation Stamp Block
        const blockW = 180;
        const blockH = 90;
        const { x, y } = getStampCoords(canvas.width, canvas.height, blockW, blockH);

        // Semitransparent white background pill
        ctx.fillStyle = 'rgba(255, 255, 255, 0.90)';
        ctx.strokeStyle = inkColor === 'blue' ? '#3b82f6' : '#64748b';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.roundRect(x, y, blockW, blockH, 8);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);

        // Attestation text
        const textToDraw =
          phrase === 'custom'
            ? customPhrase
            : phrase === 'Self Attested with Date'
            ? 'Self Attested'
            : phrase;

        ctx.fillStyle = inkColor === 'blue' ? '#1e40af' : '#0f172a';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(textToDraw, x + blockW / 2, y + 20);

        // Draw Signature if available
        if (sigPngDataUrl) {
          const sigImg = new Image();
          await new Promise<void>((res) => {
            sigImg.onload = () => {
              const sigW = 130;
              const sigH = (sigImg.naturalHeight / sigImg.naturalWidth) * sigW;
              ctx.drawImage(sigImg, x + (blockW - sigW) / 2, y + 25, sigW, Math.min(40, sigH));
              res();
            };
            sigImg.src = sigPngDataUrl;
          });
        } else {
          // Placeholder signature line
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + 20, y + 48);
          ctx.lineTo(x + blockW - 20, y + 48);
          ctx.stroke();
          ctx.fillStyle = '#94a3b8';
          ctx.font = 'italic 11px sans-serif';
          ctx.fillText('(Draw Signature on Left)', x + blockW / 2, y + 45);
        }

        // Date
        ctx.fillStyle = '#475569';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(`Date: ${signDate}`, x + blockW / 2, y + 76);

        if (isMounted) {
          setPreviewDataUrl(canvas.toDataURL('image/jpeg', 0.90));
        }
      } catch (err) {
        console.error('Error rendering self-attest preview:', err);
      }
    };

    renderPreview();
    return () => {
      isMounted = false;
    };
  }, [
    pdfBytes,
    activePageIndex,
    phrase,
    customPhrase,
    signDate,
    inkColor,
    position,
    customX,
    customY,
    sigPngDataUrl,
  ]);

  // Download batch signed PDF
  const handleDownloadPdf = async () => {
    if (!pdfBytes) return;
    setIsProcessing(true);

    try {
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const numPages = pdfDoc.getPageCount();

      // Create a stamp block image from canvas
      const stampCanvas = document.createElement('canvas');
      stampCanvas.width = 400;
      stampCanvas.height = 200;
      const sCtx = stampCanvas.getContext('2d');
      if (!sCtx) return;

      // Draw stamp on temp canvas
      sCtx.fillStyle = 'rgba(255, 255, 255, 0.94)';
      sCtx.strokeStyle = inkColor === 'blue' ? '#3b82f6' : '#64748b';
      sCtx.lineWidth = 3;
      sCtx.setLineDash([8, 6]);
      sCtx.beginPath();
      sCtx.roundRect(10, 10, 380, 180, 16);
      sCtx.fill();
      sCtx.stroke();
      sCtx.setLineDash([]);

      const textToDraw =
        phrase === 'custom'
          ? customPhrase
          : phrase === 'Self Attested with Date'
          ? 'Self Attested'
          : phrase;

      sCtx.fillStyle = inkColor === 'blue' ? '#1e40af' : '#0f172a';
      sCtx.font = 'bold 26px sans-serif';
      sCtx.textAlign = 'center';
      sCtx.fillText(textToDraw, 200, 50);

      if (sigPngDataUrl) {
        const sigImg = new Image();
        await new Promise<void>((res) => {
          sigImg.onload = () => {
            const sigW = 260;
            const sigH = (sigImg.naturalHeight / sigImg.naturalWidth) * sigW;
            sCtx.drawImage(sigImg, 200 - sigW / 2, 60, sigW, Math.min(80, sigH));
            res();
          };
          sigImg.src = sigPngDataUrl;
        });
      }

      sCtx.fillStyle = '#475569';
      sCtx.font = 'bold 22px sans-serif';
      sCtx.fillText(`Date: ${signDate}`, 200, 165);

      const stampPngBytes = dataUrlToBytes(stampCanvas.toDataURL('image/png'));
      const stampPdfImg = await pdfDoc.embedPng(stampPngBytes);

      // Embed stamp on designated pages
      for (let i = 0; i < numPages; i++) {
        const page = pdfDoc.getPage(i);
        const pW = page.getWidth();
        const pH = page.getHeight();

        const sW = 140;
        const sH = 70;

        let posX = pW - sW - 30;
        let posY = 30; // PDF origin is bottom-left

        if (position === 'bottom_left') {
          posX = 30;
          posY = 30;
        } else if (position === 'bottom_center') {
          posX = (pW - sW) / 2;
          posY = 30;
        } else if (position === 'custom') {
          posX = (customX / 100) * pW - sW / 2;
          posY = pH - (customY / 100) * pH - sH / 2;
        }

        // Check if page should be stamped
        const shouldStamp =
          applyTo === 'all' ||
          (applyTo === 'first' && i === 0);

        if (shouldStamp) {
          page.drawImage(stampPdfImg, {
            x: posX,
            y: posY,
            width: sW,
            height: sH,
          });
        }
      }

      const outBytes = await pdfDoc.save();
      const blob = new Blob([toArrayBufferBytes(outBytes)], { type: 'application/pdf' });
      downloadBlob(blob, `self-attested-${Date.now()}.pdf`);
    } catch (err) {
      console.error('Error batch self-attesting PDF:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Batch Self-Attested & Signature Stamper"
      subtitle='Draw your signature once, and automatically stamp "Self Attested" + Date on all pages of your documents. Perfect for government recruitment dossiers, university admissions, and bank KYC.'
      categoryLabel="Sarkari & KYC Batch Stamper"
      icon={FileCheck}
      microVariant="sign"
      tone="blue"
      trustNote="Browser-only digital signature pad · Signatures never leave your device"
    >
      <div className="space-y-8">
        {/* Upload State */}
        {!pdfBytes ? (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto pms-glass-panel rounded-3xl p-4 relative overflow-hidden"
          >
            <PearlScanOverlay active={isProcessing} label="Loading document pages..." />
            <label className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-[var(--pms-border-strong)] hover:border-blue-500 rounded-2xl cursor-pointer bg-[var(--pms-white)] transition-all group">
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div
                className="w-16 h-16 rounded-2xl text-[var(--pms-blue)] border border-[var(--pms-border)] flex items-center justify-center mb-4 group-hover:scale-105 transition-transform"
                style={{ background: 'var(--pms-soft-blue)' }}
              >
                <Upload className="w-8 h-8" />
              </div>
              <span className="text-base font-bold text-[var(--pms-ink)] mb-1">
                Drop Document PDF to Self-Attest
              </span>
              <span className="text-xs text-[var(--pms-muted)] text-center max-w-xs">
                Upload your combined marksheet, caste certificate, Aadhaar, PAN, or admission form PDF.
              </span>
            </label>
          </motion.div>
        ) : (
          /* Editor Layout */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Controls & Signature Pad */}
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="lg:col-span-5 space-y-5 pms-glass-panel p-6 rounded-3xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[var(--pms-border)]">
                <div className="min-w-0">
                  <span className="text-sm font-bold text-[var(--pms-ink)] flex items-center gap-2">
                    <PenTool className="w-4 h-4 text-[var(--pms-blue)] shrink-0" /> Signature &amp; Text
                  </span>
                  {file && (
                    <span className="text-[11px] text-[var(--pms-muted)] block truncate mt-0.5">
                      {file.name}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    setFile(null);
                    setPdfBytes(null);
                    setPreviewDataUrl(null);
                    setPageCount(0);
                  }}
                  className="text-xs text-rose-500 hover:text-rose-600 font-semibold shrink-0 cursor-pointer"
                >
                  Change PDF
                </button>
              </div>

              {/* Draw Signature Pad */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] flex items-center gap-2">
                    1. Draw Signature on Pad
                    {hasSignature && (
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold normal-case text-[var(--pms-ink)] border border-[var(--pms-border)]"
                        style={{ background: 'var(--pms-soft-mint)' }}
                      >
                        Ready
                      </span>
                    )}
                  </label>
                  <button
                    onClick={clearSignature}
                    className="text-xs text-[var(--pms-muted)] hover:text-rose-500 flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" /> Clear
                  </button>
                </div>
                <div className="border-2 border-[var(--pms-border-strong)] rounded-2xl overflow-hidden bg-white shadow-inner">
                  <canvas
                    ref={sigCanvasRef}
                    width={360}
                    height={130}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    className="w-full h-28 cursor-crosshair block touch-none"
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[11px] text-[var(--pms-muted)]">
                  <span>Sign with mouse or touchscreen</span>
                  <label className="text-[var(--pms-blue)] hover:underline cursor-pointer font-semibold">
                    Upload Sig Image
                    <input type="file" accept="image/*" onChange={handleUploadSigImage} className="hidden" />
                  </label>
                </div>
              </div>

              {/* Ink Color & Phrase */}
              <div className="space-y-3 pt-3 border-t border-[var(--pms-border)]">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)]">
                    Ink Color
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setInkColor('blue')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        inkColor === 'blue'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-[var(--pms-white)] border border-[var(--pms-border)] text-[var(--pms-muted)]'
                      }`}
                    >
                      Blue Ink
                    </button>
                    <button
                      onClick={() => setInkColor('black')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        inkColor === 'black'
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'bg-[var(--pms-white)] border border-[var(--pms-border)] text-[var(--pms-muted)]'
                      }`}
                    >
                      Black Ink
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--pms-muted)] mb-1">
                    Attestation Header Text
                  </label>
                  <select
                    value={phrase}
                    onChange={(e) => setPhrase(e.target.value as AttestPhrase)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--pms-border)] bg-[var(--pms-white)] text-[var(--pms-ink)] font-semibold focus:outline-none focus:border-blue-500"
                  >
                    <option value="Self Attested with Date">Self Attested (with Date)</option>
                    <option value="Self Attested">Self Attested (Only)</option>
                    <option value="True Copy">True Copy</option>
                    <option value="Verified from Original">Verified from Original</option>
                    <option value="custom">Custom Text...</option>
                  </select>
                </div>

                {phrase === 'custom' && (
                  <input
                    type="text"
                    value={customPhrase}
                    onChange={(e) => setCustomPhrase(e.target.value)}
                    placeholder="Enter custom text..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--pms-border)] bg-[var(--pms-white)] text-[var(--pms-ink)]"
                  />
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--pms-muted)] mb-1">
                    Attestation Date
                  </label>
                  <input
                    type="text"
                    value={signDate}
                    onChange={(e) => setSignDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--pms-border)] bg-[var(--pms-white)] text-[var(--pms-ink)] font-mono"
                  />
                </div>
              </div>

              {/* Placement & Page Range */}
              <div className="space-y-3 pt-3 border-t border-[var(--pms-border)]">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] mb-1.5">
                    Stamp Position on Page
                  </label>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {[
                      { id: 'bottom_right', label: 'Bottom Right' },
                      { id: 'bottom_left', label: 'Bottom Left' },
                      { id: 'bottom_center', label: 'Bottom Center' },
                    ].map((pos) => (
                      <button
                        key={pos.id}
                        onClick={() => setPosition(pos.id as StampPosition)}
                        className={`py-2 px-1 rounded-xl border text-center font-bold transition cursor-pointer ${
                          position === pos.id
                            ? 'border-blue-500 bg-blue-600 text-white shadow-sm'
                            : 'border-[var(--pms-border)] bg-[var(--pms-white)] text-[var(--pms-ink)] hover:border-[var(--pms-border-strong)]'
                        }`}
                      >
                        {pos.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] mb-1.5">
                    Apply To Pages
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      onClick={() => setApplyTo('all')}
                      className={`py-2 px-2 rounded-xl border text-center font-bold transition cursor-pointer ${
                        applyTo === 'all'
                          ? 'border-blue-500 bg-[var(--pms-soft-blue)] text-[var(--pms-ink)] shadow-sm'
                          : 'border-[var(--pms-border)] bg-[var(--pms-white)] text-[var(--pms-muted)]'
                      }`}
                    >
                      All Pages ({pageCount})
                    </button>
                    <button
                      onClick={() => setApplyTo('first')}
                      className={`py-2 px-2 rounded-xl border text-center font-bold transition cursor-pointer ${
                        applyTo === 'first'
                          ? 'border-blue-500 bg-[var(--pms-soft-blue)] text-[var(--pms-ink)] shadow-sm'
                          : 'border-[var(--pms-border)] bg-[var(--pms-white)] text-[var(--pms-muted)]'
                      }`}
                    >
                      Page 1 Only
                    </button>
                  </div>
                </div>
              </div>

              {/* Page Navigator */}
              <AnimatePresence>
                {pageCount > 1 && (
                  <motion.div
                    initial={prefersReduced ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={prefersReduced ? undefined : { opacity: 0, height: 0 }}
                    className="flex items-center justify-between p-3 bg-[var(--pms-white)] border border-[var(--pms-border)] rounded-xl text-xs font-semibold text-[var(--pms-ink)]"
                  >
                    <button
                      onClick={() => setActivePageIndex(Math.max(0, activePageIndex - 1))}
                      disabled={activePageIndex === 0}
                      className="p-1.5 rounded-lg hover:bg-[var(--pms-soft-lavender)] disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span>
                      Viewing Page {activePageIndex + 1} of <AnimatedNumber value={pageCount} />
                    </span>
                    <button
                      onClick={() => setActivePageIndex(Math.min(pageCount - 1, activePageIndex + 1))}
                      disabled={activePageIndex === pageCount - 1}
                      className="p-1.5 rounded-lg hover:bg-[var(--pms-soft-lavender)] disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-[var(--pms-border)] space-y-2">
                <button
                  onClick={handleDownloadPdf}
                  disabled={isProcessing}
                  className="pms-btn-primary w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-bold text-sm transition disabled:opacity-50 cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Download Self-Attested PDF (<AnimatedNumber value={pageCount} /> Pages)
                </button>
                <button
                  onClick={() => setShowQrModal(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 border border-[var(--pms-border)] text-[var(--pms-ink)] rounded-xl font-semibold text-xs transition cursor-pointer hover:opacity-90"
                  style={{ background: 'var(--pms-soft-blue)' }}
                >
                  <Smartphone className="w-3.5 h-3.5 text-[var(--pms-blue)]" /> Send to Mobile Phone
                </button>
              </div>
            </motion.div>

            {/* Right Live Preview */}
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 }}
              className="lg:col-span-7 pms-glass-panel p-6 rounded-3xl flex flex-col items-center relative overflow-hidden"
            >
              <PearlScanOverlay active={isProcessing} label="Applying self-attestation stamp across pages..." />

              <div className="w-full flex items-center justify-between mb-4 flex-wrap gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-[var(--pms-blue)]" /> Page {activePageIndex + 1} Self-Attestation Preview
                </span>
                <span
                  className="text-xs font-semibold px-3 py-1 text-[var(--pms-ink)] rounded-full border border-[var(--pms-border)]"
                  style={{ background: 'var(--pms-soft-mint)' }}
                >
                  {applyTo === 'all' ? `All ${pageCount} Pages Stamped` : 'Page 1 Stamped'}
                </span>
              </div>

              {previewDataUrl ? (
                <div className="w-full max-h-[640px] overflow-auto flex items-center justify-center p-4 pms-paper-grid rounded-2xl border border-[var(--pms-border)]">
                  <img
                    src={previewDataUrl}
                    alt="Self Attested Document Preview"
                    className="max-h-[580px] w-auto object-contain rounded bg-white shadow-lg border border-[var(--pms-border-strong)]"
                  />
                </div>
              ) : (
                <div className="w-full h-96 flex items-center justify-center text-[var(--pms-muted)] text-xs">
                  Rendering self-attested preview...
                </div>
              )}
            </motion.div>
          </div>
        )}

        {/* SEO Section */}
        <ToolSEOSection
          toolName="Batch Self-Attested & Signature Stamper"
          headline="Digitally Self-Attest and Sign All Pages of Official Documents in Seconds"
          description="Government recruitment portals (SSC, UPSC, State PSC, Police, Banking) and university admissions require candidates to submit self-attested photocopies of all educational marksheets, caste certificates, and identity cards. Signing and dating 15 to 20 pages manually is exhausting. Our tool allows you to draw your signature once and stamps a compliant 'Self Attested' seal with date across all document pages automatically."
          steps={[
            {
              step: '01',
              title: 'Upload Combined Document PDF',
              desc: 'Select your educational certificates, Aadhaar, PAN, or admission form PDF.',
            },
            {
              step: '02',
              title: 'Draw Signature & Pick Stamp Text',
              desc: 'Draw your digital signature on the touchpad, pick Blue or Black ink, and set the date.',
            },
            {
              step: '03',
              title: 'Download Stamped PDF',
              desc: 'Instantly download your fully attested document ready for Sarkari form submission.',
            },
          ]}
          features={[
            {
              title: '1-Click All Pages Batch Stamping',
              desc: 'Stamps every page of your 20-page document dossier in under one second.',
            },
            {
              title: 'Official Attestation Formats',
              desc: 'Includes verified text formats: "Self Attested with Date", "Certified True Copy", and "Verified from Original".',
            },
            {
              title: 'Flexible Corner Positioning',
              desc: 'Place stamp neatly in Bottom-Right, Bottom-Left, or custom coordinates to avoid covering vital marksheet text.',
            },
          ]}
          faqs={[
            {
              q: 'Is digital self-attestation valid for Indian online job forms?',
              a: 'Yes, online job portals require self-attested scanned PDFs to verify that the uploaded copy is certified by the applicant. This tool produces a high-resolution, compliant digital attestation block.',
            },
            {
              q: 'Will my signature remain private?',
              a: 'Yes, 100%! All processing happens client-side directly inside your web browser. No signatures or documents are ever uploaded or saved to any external server.',
            },
          ]}
        />

        {/* Mobile Transfer Modal */}
        <ShareQrModal
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          title="Self-Attested Document PDF"
          fileName="self-attested.pdf"
        />
      </div>
    </ToolWorkspaceShell>
  );
}
