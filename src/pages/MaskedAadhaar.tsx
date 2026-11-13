import { useState, useRef, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Download, Shield, EyeOff, Sparkles, CheckCircle2, Plus, Trash2, Move, Lock } from 'lucide-react';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { PDFDocument } from 'pdf-lib';
import { dataUrlToBytes } from '../lib/utils';
import { toArrayBufferBytes } from '../lib/blobUrl';
import { useToast } from '../components/Toast';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';

interface MaskBox {
  id: string;
  xPercent: number;
  yPercent: number;
  wPercent: number;
  hPercent: number;
  style: 'uidai_xxxx' | 'black_bar' | 'white_bar' | 'qr_mask';
}

export default function MaskedAadhaar() {
  useSEO(
    'Masked Aadhaar Card Maker Online — Mask First 8 Digits (XXXX-XXXX-1234) | PDF Media Suite',
    'Create official Masked Aadhaar card online according to UIDAI and RBI guidelines. Mask first 8 digits of Aadhaar number and redact QR code for safe KYC submission.'
  );

  usePageSEO(
    'Masked Aadhaar Maker — Hide First 8 Digits Online',
    'Free online tool to mask first 8 digits of Aadhaar card (XXXX-XXXX-1234) and redact QR code. 100% private, client-side Aadhaar masking for hotel, SIM and exam KYC.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [renderedImageUrl, setRenderedImageUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);

  const toast = useToast();
  const [pdfPageCount, setPdfPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);

  // Mask boxes (draggable and resizable percentage coordinates)
  const [masks, setMasks] = useState<MaskBox[]>([
    {
      id: 'default_num_mask',
      xPercent: 32,
      yPercent: 78,
      wPercent: 36,
      hPercent: 5,
      style: 'uidai_xxxx',
    },
  ]);

  const [selectedMaskId, setSelectedMaskId] = useState<string>('default_num_mask');
  const [includeKycWatermark, setIncludeKycWatermark] = useState(true);
  const [kycPurposeText, setKycPurposeText] = useState('FOR KYC PURPOSE ONLY');

  const prefersReduced = useReducedMotion();

  const [isProcessing, setIsProcessing] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [lastExportFormat, setLastExportFormat] = useState<'pdf' | 'jpg' | null>(null);

  // Auto-cleanup blob URL on unmount or URL change
  useEffect(() => {
    return () => {
      if (renderedImageUrl && renderedImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(renderedImageUrl);
      }
    };
  }, [renderedImageUrl]);

  const imageContainerRef = useRef<HTMLDivElement | null>(null);
  const draggingMaskId = useRef<string | null>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  // Load Image or PDF page
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setExportUrl(null);

    if (uploadedFile.type === 'application/pdf' || uploadedFile.name.endsWith('.pdf')) {
      setIsPdf(true);
      try {
        const arrayBuffer = await uploadedFile.arrayBuffer();
        const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        setPdfPageCount(pdfDoc.numPages);
        setCurrentPage(1);

        const page = await pdfDoc.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
        setRenderedImageUrl(canvas.toDataURL('image/jpeg', 0.95));
      } catch (err) {
        toast.error('Could not render PDF. If it is password protected, please unlock it first using our Unlock PDF tool.');
      }
    } else {
      setIsPdf(false);
      setRenderedImageUrl(URL.createObjectURL(uploadedFile));
    }
  };

  const addQrMask = () => {
    const newMask: MaskBox = {
      id: `mask_${Date.now()}`,
      xPercent: 70,
      yPercent: 50,
      wPercent: 24,
      hPercent: 24,
      style: 'qr_mask',
    };
    setMasks((prev) => [...prev, newMask]);
    setSelectedMaskId(newMask.id);
  };

  const addExtraMask = () => {
    const newMask: MaskBox = {
      id: `mask_${Date.now()}`,
      xPercent: 30,
      yPercent: 40,
      wPercent: 30,
      hPercent: 5,
      style: 'uidai_xxxx',
    };
    setMasks((prev) => [...prev, newMask]);
    setSelectedMaskId(newMask.id);
  };

  const removeMask = (id: string) => {
    setMasks((prev) => prev.filter((m) => m.id !== id));
  };

  // Pointer / Touch dragging handlers for mask boxes (works on desktop & mobile)
  const handlePointerDown = (e: React.PointerEvent, maskId: string) => {
    e.preventDefault();
    setSelectedMaskId(maskId);
    draggingMaskId.current = maskId;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingMaskId.current || !dragStartPos.current || !imageContainerRef.current) return;

    const rect = imageContainerRef.current.getBoundingClientRect();
    const deltaXPercent = ((e.clientX - dragStartPos.current.x) / rect.width) * 100;
    const deltaYPercent = ((e.clientY - dragStartPos.current.y) / rect.height) * 100;

    setMasks((prev) =>
      prev.map((m) => {
        if (m.id === draggingMaskId.current) {
          return {
            ...m,
            xPercent: Math.max(0, Math.min(100 - m.wPercent, m.xPercent + deltaXPercent)),
            yPercent: Math.max(0, Math.min(100 - m.hPercent, m.yPercent + deltaYPercent)),
          };
        }
        return m;
      })
    );

    dragStartPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    draggingMaskId.current = null;
    dragStartPos.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  // Generate Masked Canvas & Export
  const generateMaskedOutput = async (format: 'pdf' | 'jpg') => {
    if (!renderedImageUrl) return;

    setIsProcessing(true);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Failed to load image for masking'));
        img.src = renderedImageUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;

      // 1. Draw original base image
      ctx.drawImage(img, 0, 0);

      // 2. Render Masks
      masks.forEach((mask) => {
        const rx = (mask.xPercent / 100) * canvas.width;
        const ry = (mask.yPercent / 100) * canvas.height;
        const rw = (mask.wPercent / 100) * canvas.width;
        const rh = (mask.hPercent / 100) * canvas.height;

        if (mask.style === 'uidai_xxxx') {
          // UIDAI official masked overlay
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 1;
          ctx.strokeRect(rx, ry, rw, rh);

          // Draw "XXXX XXXX " text centered
          ctx.fillStyle = '#0f172a';
          ctx.font = `bold ${Math.round(rh * 0.7)}px Arial, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('XXXX  XXXX', rx + rw / 2, ry + rh / 2);
        } else if (mask.style === 'black_bar') {
          ctx.fillStyle = '#000000';
          ctx.fillRect(rx, ry, rw, rh);
        } else if (mask.style === 'white_bar') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(rx, ry, rw, rh);
        } else if (mask.style === 'qr_mask') {
          // QR Code redaction
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(rx, ry, rw, rh);
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${Math.round(rh * 0.12)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('QR CODE REDACTED', rx + rw / 2, ry + rh / 2 - 10);
          ctx.fillText('(UIDAI COMPLIANT)', rx + rw / 2, ry + rh / 2 + 10);
        }
      });

      // 3. Optional KYC Protection Watermark
      if (includeKycWatermark && kycPurposeText) {
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((-25 * Math.PI) / 180);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.28)'; // translucent red
        ctx.font = `bold ${Math.round(canvas.width * 0.045)}px sans-serif`;
        ctx.textAlign = 'center';
        const dateStr = new Date().toLocaleDateString('en-IN');
        ctx.fillText(`${kycPurposeText} - ${dateStr}`, 0, 0);
        ctx.restore();
      }

      if (format === 'jpg') {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `masked_aadhaar_${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setLastExportFormat('jpg');
        toast.success('Masked Aadhaar JPG exported successfully!');
      } else {
        const pdfDoc = await PDFDocument.create();
        const page1 = pdfDoc.addPage([canvas.width * 0.5, canvas.height * 0.5]);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        const imgBytes = dataUrlToBytes(dataUrl);
        const jpgImg = await pdfDoc.embedJpg(imgBytes);

        page1.drawImage(jpgImg, {
          x: 0,
          y: 0,
          width: canvas.width * 0.5,
          height: canvas.height * 0.5,
        });

        // If source was a multi-page PDF, preserve pages 2..N (e.g. Aadhaar Back side with address)
        if (file && (file.type === 'application/pdf' || file.name.endsWith('.pdf')) && pdfPageCount > 1) {
          try {
            const srcBytes = await file.arrayBuffer();
            const srcDoc = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
            const extraIndices = Array.from({ length: srcDoc.getPageCount() - 1 }, (_, i) => i + 1);
            const copiedPages = await pdfDoc.copyPages(srcDoc, extraIndices);
            for (const cp of copiedPages) {
              pdfDoc.addPage(cp);
            }
          } catch (e) {
            console.warn('[MaskedAadhaar] Could not copy remaining pages:', e);
          }
        }

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([toArrayBufferBytes(pdfBytes)], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `masked_aadhaar_${Date.now()}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setLastExportFormat('pdf');
        toast.success('Masked Aadhaar exported successfully!');
        setTimeout(() => {
          try {
            URL.revokeObjectURL(url);
          } catch {}
        }, 15000);
      }
    } catch (err: any) {
      console.error('[MaskedAadhaar] Export failed:', err);
      toast.error('Could not export masked Aadhaar: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedMask = masks.find((m) => m.id === selectedMaskId);

  return (
    <ToolWorkspaceShell
      title="Masked Aadhaar Card Maker (Mask First 8 Digits)"
      subtitle="Hide first 8 digits (XXXX-XXXX-1234) and QR code on Aadhaar image or PDF. Safe for hotels, SIM verification, and exam KYC without exposing full Aadhaar number."
      categoryLabel="UIDAI & RBI Compliant Masking"
      icon={Shield}
      microVariant="security"
      tone="emerald"
    >

      {!renderedImageUrl ? (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className="max-w-xl mx-auto p-6 sm:p-8 pms-glass-panel border border-[var(--pms-border)] rounded-3xl shadow-sm text-center"
        >
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-emerald-400/70 dark:border-emerald-700/80 hover:border-emerald-500 rounded-2xl p-10 cursor-pointer transition-colors bg-white/60 dark:bg-slate-900/50 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/30">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-800/70 flex items-center justify-center mb-3">
              <Lock className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-base font-extrabold text-[var(--pms-ink)]">
              Upload Aadhaar Card (Image or PDF)
            </span>
            <span className="text-xs text-[var(--pms-muted)] mt-1">
              Supports JPG, PNG, PDF • 100% Client-Side Privacy Guarantee
            </span>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => {
                setLastExportFormat(null);
                handleFileUpload(e);
              }}
              className="hidden"
            />
          </label>

          <div className="mt-6 p-4 bg-emerald-50/80 dark:bg-emerald-950/35 border border-emerald-200/80 dark:border-emerald-800/70 rounded-2xl text-left text-xs text-emerald-950 dark:text-emerald-100 flex items-start gap-2.5">
            <Shield className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
            <div>
              <p className="font-bold mb-0.5">UIDAI & RBI Advisory:</p>
              <p className="text-emerald-800 dark:text-emerald-300 leading-relaxed">
                As per UIDAI guidelines, organizations cannot demand unmasked Aadhaar. You have the legal right to submit Masked Aadhaar where only the last 4 digits are visible.
              </p>
            </div>
          </div>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Visual Masking Canvas (7 cols) */}
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
            className="lg:col-span-7 relative overflow-hidden min-h-[360px] pms-glass-panel rounded-3xl border border-[var(--pms-border)] p-4 sm:p-5 space-y-4"
          >
            <PearlScanOverlay active={isProcessing} label="Flattening & masking Aadhaar..." />

            {/* Quick Layout Presets */}
            <div className="p-3.5 bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-200/80 dark:border-emerald-800/60 rounded-2xl space-y-2">
              <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> 1-Click Document Presets
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  {
                    label: 'Full e-Aadhaar Letter',
                    masks: [
                      { id: 'm_num', xPercent: 30, yPercent: 78, wPercent: 38, hPercent: 4.5, style: 'uidai_xxxx' as const },
                      { id: 'm_qr', xPercent: 70, yPercent: 62, wPercent: 24, hPercent: 20, style: 'qr_mask' as const },
                    ],
                  },
                  {
                    label: 'Wallet Card (Front)',
                    masks: [
                      { id: 'm_num', xPercent: 26, yPercent: 79, wPercent: 48, hPercent: 7.5, style: 'uidai_xxxx' as const },
                    ],
                  },
                  {
                    label: 'Wallet Card (Back)',
                    masks: [
                      { id: 'm_qr', xPercent: 64, yPercent: 22, wPercent: 30, hPercent: 45, style: 'qr_mask' as const },
                    ],
                  },
                  {
                    label: 'PAN Card Mask',
                    masks: [
                      { id: 'm_pan', xPercent: 38, yPercent: 54, wPercent: 24, hPercent: 6, style: 'black_bar' as const },
                    ],
                  },
                ].map((preset, idx) => (
                  <motion.button
                    key={idx}
                    whileTap={prefersReduced ? undefined : { scale: 0.96 }}
                    type="button"
                    onClick={() => {
                      setMasks(preset.masks);
                      setSelectedMaskId(preset.masks[0].id);
                    }}
                    className="py-1 px-2.5 bg-white/85 dark:bg-slate-800/85 hover:bg-emerald-50 dark:hover:bg-slate-700 text-[var(--pms-ink)] border border-[var(--pms-border)] text-xs font-semibold rounded-lg shadow-2xs transition-colors"
                  >
                    {preset.label}
                  </motion.button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-[var(--pms-muted)]">
              <span className="font-semibold flex items-center gap-1.5 text-[var(--pms-ink)]">
                <Move className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Drag mask box over the 8 digits
              </span>
              <span className="text-[11px] text-[var(--pms-muted)]">Click mask box to select &amp; resize</span>
            </div>

            {/* Document Workspace with Draggable Overlays */}
            <div
              ref={imageContainerRef}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="relative border-2 border-dashed border-[var(--pms-border-strong)] rounded-2xl overflow-hidden bg-white select-none shadow-inner touch-none"
            >
              <img
                src={renderedImageUrl}
                alt="Aadhaar Document Preview"
                className="w-full h-auto block pointer-events-none"
              />

              {/* Draggable Mask Overlays */}
              {masks.map((mask) => (
                <div
                  key={mask.id}
                  onPointerDown={(e) => handlePointerDown(e, mask.id)}
                  style={{
                    left: `${mask.xPercent}%`,
                    top: `${mask.yPercent}%`,
                    width: `${mask.wPercent}%`,
                    height: `${mask.hPercent}%`,
                    touchAction: 'none',
                  }}
                  className={`absolute cursor-move flex items-center justify-center font-bold text-xs select-none transition-shadow ${
                    selectedMaskId === mask.id
                      ? 'ring-2 ring-emerald-500 shadow-lg'
                      : 'border border-gray-400'
                  } ${
                    mask.style === 'uidai_xxxx'
                      ? 'bg-white text-gray-900 font-mono tracking-wider'
                      : mask.style === 'black_bar'
                      ? 'bg-black text-white'
                      : mask.style === 'white_bar'
                      ? 'bg-white text-gray-700'
                      : 'bg-slate-900 text-white text-[10px]'
                  }`}
                >
                  {mask.style === 'uidai_xxxx' && 'XXXX  XXXX'}
                  {mask.style === 'black_bar' && 'REDACTED'}
                  {mask.style === 'white_bar' && ''}
                  {mask.style === 'qr_mask' && 'QR REDACTED'}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <motion.button
                whileTap={prefersReduced ? undefined : { scale: 0.97 }}
                type="button"
                onClick={addExtraMask}
                className="px-3 py-2 bg-white/85 dark:bg-slate-800/85 border border-[var(--pms-border)] hover:border-emerald-400 rounded-xl text-xs font-semibold text-[var(--pms-ink)] flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Another Mask Box
              </motion.button>
              <motion.button
                whileTap={prefersReduced ? undefined : { scale: 0.97 }}
                type="button"
                onClick={addQrMask}
                className="px-3 py-2 bg-white/85 dark:bg-slate-800/85 border border-[var(--pms-border)] hover:border-rose-400 rounded-xl text-xs font-semibold text-[var(--pms-ink)] flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <EyeOff className="w-3.5 h-3.5 text-red-500 dark:text-red-400" /> Redact QR Code
              </motion.button>
            </div>
          </motion.div>

          {/* Mask Controls & Download (5 cols) */}
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: prefersReduced ? 0 : 0.05 }}
            className="lg:col-span-5 space-y-6 lg:sticky lg:top-8"
          >
            <div className="p-5 sm:p-6 pms-glass-panel border border-[var(--pms-border)] rounded-3xl shadow-sm space-y-5">
              <h2 className="text-sm font-extrabold text-[var(--pms-ink)] flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Mask Box Customization
              </h2>

              {selectedMask ? (
                <div className="space-y-4 p-4 bg-white/65 dark:bg-slate-800/60 rounded-2xl border border-[var(--pms-border)]">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--pms-ink)] mb-1.5">
                      Mask Appearance Style:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'uidai_xxxx', label: 'UIDAI "XXXX XXXX"' },
                        { id: 'black_bar', label: 'Black Redaction Bar' },
                        { id: 'white_bar', label: 'White Box' },
                        { id: 'qr_mask', label: 'QR Redact Block' },
                      ].map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() =>
                            setMasks((prev) =>
                              prev.map((m) =>
                                m.id === selectedMask.id ? { ...m, style: st.id as any } : m
                              )
                            )
                          }
                          className={`p-2 text-xs font-medium rounded-xl border text-left transition-colors ${
                            selectedMask.style === st.id
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                              : 'bg-white/85 dark:bg-slate-800/85 text-[var(--pms-ink)] border-[var(--pms-border)] hover:border-emerald-400'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Width & Height Sliders */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex justify-between text-xs font-semibold text-[var(--pms-ink)] mb-1">
                        <span>Width</span>
                        <span className="font-mono text-[var(--pms-muted)]">
                          <AnimatedNumber value={Math.round(selectedMask.wPercent)} suffix="%" />
                        </span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="80"
                        value={selectedMask.wPercent}
                        onChange={(e) =>
                          setMasks((prev) =>
                            prev.map((m) =>
                              m.id === selectedMask.id ? { ...m, wPercent: Number(e.target.value) } : m
                            )
                          )
                        }
                        className="w-full accent-emerald-600 cursor-pointer"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs font-semibold text-[var(--pms-ink)] mb-1">
                        <span>Height</span>
                        <span className="font-mono text-[var(--pms-muted)]">
                          <AnimatedNumber value={Math.round(selectedMask.hPercent)} suffix="%" />
                        </span>
                      </div>
                      <input
                        type="range"
                        min="2"
                        max="40"
                        value={selectedMask.hPercent}
                        onChange={(e) =>
                          setMasks((prev) =>
                            prev.map((m) =>
                              m.id === selectedMask.id ? { ...m, hPercent: Number(e.target.value) } : m
                            )
                          )
                        }
                        className="w-full accent-emerald-600 cursor-pointer"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeMask(selectedMask.id)}
                    className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-semibold flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove this mask
                  </button>
                </div>
              ) : (
                <p className="text-xs text-[var(--pms-muted)]">Select a mask on the preview to adjust.</p>
              )}

              {/* KYC Purpose Watermark */}
              <div className="p-4 bg-white/65 dark:bg-slate-800/60 rounded-2xl border border-[var(--pms-border)] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--pms-ink)] flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> Anti-Fraud KYC Watermark
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeKycWatermark}
                      onChange={(e) => setIncludeKycWatermark(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                {includeKycWatermark && (
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--pms-muted)] mb-1">
                      Custom Purpose Text:
                    </label>
                    <input
                      type="text"
                      value={kycPurposeText}
                      onChange={(e) => setKycPurposeText(e.target.value)}
                      placeholder="e.g. FOR HOTEL CHECK-IN ONLY"
                      className="w-full px-3 py-1.5 bg-white/90 dark:bg-slate-900/90 text-[var(--pms-ink)] border border-[var(--pms-border)] rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none uppercase"
                    />
                    <div className="flex flex-wrap gap-1 pt-1.5">
                      {[
                        'FOR SIM VERIFICATION',
                        'FOR HOTEL CHECK-IN',
                        'FOR EXAM ADMIT CARD',
                        'FOR BANK KYC ONLY',
                      ].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => setKycPurposeText(chip)}
                          className="text-[10px] py-0.5 px-2 bg-white/85 dark:bg-slate-800/85 border border-[var(--pms-border)] hover:border-emerald-500 rounded-md text-[var(--pms-muted)] hover:text-[var(--pms-ink)] font-medium transition-colors"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {lastExportFormat && (
                <motion.div
                  initial={prefersReduced ? false : { opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="p-3.5 rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/70 flex items-center gap-2.5 text-xs text-emerald-800 dark:text-emerald-200 font-semibold"
                >
                  <motion.div
                    initial={prefersReduced ? false : { scale: 0.6 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                    className="w-7 h-7 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </motion.div>
                  <span>
                    Flattened Masked Aadhaar {lastExportFormat.toUpperCase()} downloaded safely!
                  </span>
                </motion.div>
              )}

              {/* Export Buttons */}
              <div className="space-y-2.5 pt-1">
                <motion.button
                  whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                  type="button"
                  onClick={() => generateMaskedOutput('pdf')}
                  disabled={isProcessing}
                  className="pms-btn-primary w-full py-3.5 font-bold rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4" /> Download Masked Aadhaar PDF
                </motion.button>
                <motion.button
                  whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                  type="button"
                  onClick={() => generateMaskedOutput('jpg')}
                  disabled={isProcessing}
                  className="w-full py-2.5 bg-white/85 dark:bg-slate-800/85 hover:border-emerald-400 text-[var(--pms-ink)] text-xs font-bold rounded-xl border border-[var(--pms-border)] transition-colors disabled:opacity-50"
                >
                  Download as Masked JPG
                </motion.button>
              </div>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setRenderedImageUrl(null);
                    setLastExportFormat(null);
                  }}
                  className="text-xs text-[var(--pms-muted)] hover:text-rose-600 dark:hover:text-rose-400 font-medium transition-colors"
                >
                  ← Upload another document
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Compliance Information */}
      <div className="mt-16 border-t border-[var(--pms-border)] pt-10 text-[var(--pms-ink)]">
        <h2 className="text-2xl font-bold mb-6 text-center text-[var(--pms-ink)]">
          Why Should You Always Use Masked Aadhaar?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div className="p-5 pms-glass-panel border border-[var(--pms-border)] rounded-2xl shadow-xs">
            <h3 className="font-bold text-[var(--pms-ink)] mb-2">1. Prevents Identity Fraud</h3>
            <p className="text-[var(--pms-muted)] text-xs leading-relaxed">
              Sharing your full 12-digit Aadhaar number with unknown vendors, hotels, or rental agencies increases identity theft risk. Masked Aadhaar conceals the first 8 digits.
            </p>
          </div>
          <div className="p-5 pms-glass-panel border border-[var(--pms-border)] rounded-2xl shadow-xs">
            <h3 className="font-bold text-[var(--pms-ink)] mb-2">2. Legally Valid Everywhere</h3>
            <p className="text-[var(--pms-muted)] text-xs leading-relaxed">
              Under RBI and UIDAI directives, all non-banking entities are mandated to accept Masked Aadhaar with the last 4 digits visible as valid photo ID proof.
            </p>
          </div>
          <div className="p-5 pms-glass-panel border border-[var(--pms-border)] rounded-2xl shadow-xs">
            <h3 className="font-bold text-[var(--pms-ink)] mb-2">3. Zero Data Storage</h3>
            <p className="text-[var(--pms-muted)] text-xs leading-relaxed">
              Our masking engine runs 100% locally in your web browser. Neither your Aadhaar image nor your demographic details ever leave your device.
            </p>
          </div>
        </div>
      </div>

      {/* SEO Guide & UIDAI Masking FAQs */}
      <ToolSEOSection
        toolName="Masked Aadhaar Card Maker"
        headline="Free Online Masked Aadhaar Card Maker — UIDAI & RBI Compliant"
        description="Hide the first 8 digits of your 12-digit Aadhaar card (e.g. XXXX-XXXX-1234) and mask the QR code for safe KYC verification. Protect against identity theft at hotels, airport gates, SIM card kiosks, and exam centers. 100% private in browser."
        steps={[
          {
            step: '01',
            title: 'Upload e-Aadhaar PDF or Image',
            desc: 'Select your official e-Aadhaar PDF or a scanned Aadhaar image from your device.',
          },
          {
            step: '02',
            title: 'Apply 1-Click Masking Preset',
            desc: 'Choose Full e-Aadhaar Sheet, Wallet Card, or PAN preset to automatically overlay the official UIDAI XXXX-XXXX pattern.',
          },
          {
            step: '03',
            title: 'Download Masked Aadhaar',
            desc: 'Save your privacy-protected Aadhaar as a crisp PDF or high-resolution JPG image immediately.',
          },
        ]}
        faqs={[
          {
            q: 'Is Masked Aadhaar legally valid for hotel check-ins and job verification?',
            a: 'Yes! According to official circulars from UIDAI, RBI, and TRAI, Masked Aadhaar showing only the last 4 digits is legally valid across all non-banking verification processes.',
          },
          {
            q: 'Why should I mask the QR code on my Aadhaar card?',
            a: 'The QR code on an unmasked Aadhaar card contains your full 12-digit Aadhaar number, name, address, and date of birth in encoded format. Masking the QR code prevents rogue scanners from extracting your private data.',
          },
          {
            q: 'Can I unmask the card later?',
            a: 'The output file is permanently redacted and flattened so that unauthorized third parties cannot remove the mask or peek behind it.',
          },
          {
            q: 'Does PDF Media Suite save a copy of my Aadhaar card?',
            a: 'Never. The redaction and masking algorithms run 100% client-side inside your browser memory. No data is transmitted across the internet.',
          },
        ]}
        relatedTools={[
          { name: 'Sarkari Photo & Sign', path: '/sarkari-photo-signature', desc: 'Format passport photo with name and date (DOP) for exam forms' },
          { name: 'Clean Signature', path: '/clean-signature', desc: 'Convert phone photo of paper signature to transparent PNG' },
          { name: 'Exam Bundle Merger', path: '/exam-document-merger', desc: 'Merge all educational documents into a single PDF under 1 MB' },
          { name: 'PDF Redact', path: '/redact', desc: 'Permanently black out sensitive text, account numbers, and phone numbers' },
        ]}
      />
    </ToolWorkspaceShell>
  );
}
