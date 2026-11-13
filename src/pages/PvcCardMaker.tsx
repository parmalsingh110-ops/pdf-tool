import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Upload,
  Download,
  CreditCard,
  Sliders,
  Eye,
  Smartphone,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import ShareQrModal from '../components/ShareQrModal';
import { dataUrlToBytes, downloadBlob } from '../lib/utils';
import { toArrayBufferBytes } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

// Standard CR80 Card Dimensions: 85.6mm × 53.98mm (Aspect ratio ≈ 1.5858)
const CARD_ASPECT = 85.6 / 53.98;

type PaperLayout = 'pvc_single' | 'a4_side_by_side' | 'a4_stacked' | 'photo_4x6';
type FilterMode = 'magic' | 'bw' | 'original';

export default function PvcCardMaker() {
  useSEO(
    'e-Aadhaar & Voter ID to PVC Card Maker Online — Print Ready Sheet',
    'Convert e-Aadhaar PDF or Voter ID slip to standard CR80 PVC Card size (85.6mm × 54mm). Print on A4, 4×6 photo paper with cutting guidelines. 100% free & private.'
  );

  usePageSEO(
    'e-Aadhaar to PVC Card Print Maker — A4 & 4×6 Sheet Format',
    'Free online tool for E-Mitra, CSC centers and cyber cafes to convert e-Aadhaar PDF, Voter ID, and college ID cards into standard PVC card format with lamination marks.',
    'eaadhaar to pvc card, aadhar card print size, voter id card to pvc, pvc card print layout, aadhar front back a4 sheet, e-mitra pvc card maker, 85.6x54mm id card',
    '/pvc-card-maker'
  );

  const [file, setFile] = useState<File | null>(null);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paperLayout, setPaperLayout] = useState<PaperLayout>('a4_side_by_side');
  const [filterMode, setFilterMode] = useState<FilterMode>('magic');
  const [maskAadhaar, setMaskAadhaar] = useState(false);
  const [includeCutMarks, setIncludeCutMarks] = useState(true);
  const [includeLaminationGuide, setIncludeLaminationGuide] = useState(true);

  // Crop Coordinates in percentages of source image [0..100]
  // Default values target the bottom card portion of standard UIDAI e-Aadhaar
  const [frontCrop, setFrontCrop] = useState({ x: 5, y: 68, w: 42, h: 28 });
  const [backCrop, setBackCrop] = useState({ x: 53, y: 68, w: 42, h: 28 });
  const [activeCropSide, setActiveCropSide] = useState<'front' | 'back'>('front');

  // Preview / Export
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load file (PDF or Image)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setIsProcessing(true);

    try {
      if (selected.type === 'application/pdf' || selected.name.toLowerCase().endsWith('.pdf')) {
        const arrayBuffer = await selected.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        const viewport = page.getViewport({ scale: 2.0 }); // High-res render
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
          const img = new Image();
          img.onload = () => {
            setSourceImage(img);
            setIsProcessing(false);
          };
          img.src = canvas.toDataURL('image/png');
        }
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            setSourceImage(img);
            setIsProcessing(false);
          };
          img.src = ev.target?.result as string;
        };
        reader.readAsDataURL(selected);
      }
    } catch (err) {
      console.error('Error loading card file:', err);
      setIsProcessing(false);
    }
  };

  // Re-generate preview canvas whenever crops, layout, or filters change
  useEffect(() => {
    if (!sourceImage) return;

    // Helper: extract and filter card side
    const extractCardSide = (crop: { x: number; y: number; w: number; h: number }) => {
      const cardW = 1011; // 85.6mm at 300 DPI
      const cardH = 638;  // 53.98mm at 300 DPI
      const sideCanvas = document.createElement('canvas');
      sideCanvas.width = cardW;
      sideCanvas.height = cardH;
      const sCtx = sideCanvas.getContext('2d');
      if (!sCtx) return sideCanvas;

      const sx = (crop.x / 100) * sourceImage.naturalWidth;
      const sy = (crop.y / 100) * sourceImage.naturalWidth * (sourceImage.naturalHeight / sourceImage.naturalWidth);
      const sw = (crop.w / 100) * sourceImage.naturalWidth;
      const sh = (crop.h / 100) * sourceImage.naturalHeight;

      sCtx.fillStyle = '#ffffff';
      sCtx.fillRect(0, 0, cardW, cardH);
      sCtx.drawImage(sourceImage, sx, sy, sw, sh, 0, 0, cardW, cardH);

      // Apply Filters
      if (filterMode === 'magic') {
        const imgData = sCtx.getImageData(0, 0, cardW, cardH);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          let r = data[i];
          let g = data[i + 1];
          let b = data[i + 2];
          // Background whiten & contrast boost
          const avg = (r + g + b) / 3;
          if (avg > 200) {
            r = Math.min(255, r + 40);
            g = Math.min(255, g + 40);
            b = Math.min(255, b + 40);
          } else {
            r = Math.max(0, r - 20);
            g = Math.max(0, g - 20);
            b = Math.max(0, b - 20);
          }
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
        }
        sCtx.putImageData(imgData, 0, 0);
      } else if (filterMode === 'bw') {
        const imgData = sCtx.getImageData(0, 0, cardW, cardH);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          const v = gray > 165 ? 255 : Math.max(0, gray - 30);
          data[i] = v;
          data[i + 1] = v;
          data[i + 2] = v;
        }
        sCtx.putImageData(imgData, 0, 0);
      }

      // Mask first 8 digits of Aadhaar if requested
      if (maskAadhaar) {
        sCtx.fillStyle = '#ffffff';
        sCtx.fillRect(cardW * 0.32, cardH * 0.74, cardW * 0.28, cardH * 0.08);
        sCtx.fillStyle = '#1e293b';
        sCtx.font = 'bold 22px sans-serif';
        sCtx.fillText('XXXX XXXX', cardW * 0.33, cardH * 0.80);
      }

      return sideCanvas;
    };

    const frontCanvas = extractCardSide(frontCrop);
    const backCanvas = extractCardSide(backCrop);

    // Render Target Sheet Layout
    let outW = 2480; // A4 300 DPI
    let outH = 3508;

    if (paperLayout === 'pvc_single') {
      outW = 1011;
      outH = 638;
    } else if (paperLayout === 'photo_4x6') {
      outW = 1800; // 4x6 inch at 300 DPI
      outH = 1200;
    }

    const outCanvas = document.createElement('canvas');
    outCanvas.width = outW;
    outCanvas.height = outH;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);

    const cardW = 1011;
    const cardH = 638;

    const drawCardWithGuides = (card: HTMLCanvasElement, x: number, y: number) => {
      // Draw card
      ctx.drawImage(card, x, y, cardW, cardH);

      // Draw thin border around card
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, cardW, cardH);

      // Draw Lamination Pouch Guide (65mm x 95mm outer bounding)
      if (includeLaminationGuide && paperLayout !== 'pvc_single') {
        const lamiW = 1122; // 95mm
        const lamiH = 768;  // 65mm
        const lx = x - (lamiW - cardW) / 2;
        const ly = y - (lamiH - cardH) / 2;
        ctx.strokeStyle = '#94a3b8';
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(lx, ly, lamiW, lamiH);
        ctx.setLineDash([]);
      }

      // Draw Cut Marks (Corner marks)
      if (includeCutMarks && paperLayout !== 'pvc_single') {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        const markLen = 25;
        // Top Left
        ctx.beginPath();
        ctx.moveTo(x - markLen, y); ctx.lineTo(x, y);
        ctx.moveTo(x, y - markLen); ctx.lineTo(x, y);
        // Top Right
        ctx.moveTo(x + cardW, y); ctx.lineTo(x + cardW + markLen, y);
        ctx.moveTo(x + cardW, y - markLen); ctx.lineTo(x + cardW, y);
        // Bottom Left
        ctx.moveTo(x - markLen, y + cardH); ctx.lineTo(x, y + cardH);
        ctx.moveTo(x, y + cardH); ctx.lineTo(x, y + cardH + markLen);
        // Bottom Right
        ctx.moveTo(x + cardW, y + cardH); ctx.lineTo(x + cardW + markLen, y + cardH);
        ctx.moveTo(x + cardW, y + cardH); ctx.lineTo(x + cardW, y + cardH + markLen);
        ctx.stroke();
      }
    };

    if (paperLayout === 'pvc_single') {
      ctx.drawImage(frontCanvas, 0, 0, cardW, cardH);
    } else if (paperLayout === 'a4_side_by_side') {
      const startY = 600;
      const gap = 120;
      const totalCardsW = cardW * 2 + gap;
      const startX = (outW - totalCardsW) / 2;

      drawCardWithGuides(frontCanvas, startX, startY);
      drawCardWithGuides(backCanvas, startX + cardW + gap, startY);

      // Fold Guide Line in Center
      ctx.strokeStyle = '#64748b';
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(startX + cardW + gap / 2, startY - 40);
      ctx.lineTo(startX + cardW + gap / 2, startY + cardH + 40);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#64748b';
      ctx.font = '24px sans-serif';
      ctx.fillText('FOLD HERE', startX + cardW + gap / 2 - 60, startY - 55);
    } else if (paperLayout === 'a4_stacked') {
      const startX = (outW - cardW) / 2;
      const startY = 500;
      const gap = 150;

      drawCardWithGuides(frontCanvas, startX, startY);
      drawCardWithGuides(backCanvas, startX, startY + cardH + gap);
    } else if (paperLayout === 'photo_4x6') {
      const gap = 80;
      const startX = (outW - (cardW * 1.4)) / 2;
      // Fit both cards on 4x6 scaled
      const sCardW = 750;
      const sCardH = Math.round(sCardW / CARD_ASPECT);
      const sX1 = (outW - (sCardW * 2 + 60)) / 2;
      const sY = (outH - sCardH) / 2;

      ctx.drawImage(frontCanvas, sX1, sY, sCardW, sCardH);
      ctx.drawImage(backCanvas, sX1 + sCardW + 60, sY, sCardW, sCardH);
      ctx.strokeStyle = '#0f172a';
      ctx.strokeRect(sX1, sY, sCardW, sCardH);
      ctx.strokeRect(sX1 + sCardW + 60, sY, sCardW, sCardH);
    }

    setPreviewDataUrl(outCanvas.toDataURL('image/jpeg', 0.92));
    previewCanvasRef.current = outCanvas;
  }, [sourceImage, frontCrop, backCrop, paperLayout, filterMode, maskAadhaar, includeCutMarks, includeLaminationGuide]);

  // Export to PDF
  const handleDownloadPdf = async () => {
    if (!previewCanvasRef.current) return;
    setIsProcessing(true);
    try {
      const pdfDoc = await PDFDocument.create();
      const canvas = previewCanvasRef.current;
      const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.95);
      const jpgBytes = dataUrlToBytes(jpgDataUrl);
      const jpgImage = await pdfDoc.embedJpg(jpgBytes);

      // Point dimensions (72 pt per inch)
      let pageW = 595.28; // A4 pt
      let pageH = 841.89;
      if (paperLayout === 'pvc_single') {
        pageW = 242.65; // 85.6mm in points
        pageH = 153.01; // 53.98mm in points
      } else if (paperLayout === 'photo_4x6') {
        pageW = 432; // 6 inches pt
        pageH = 288; // 4 inches pt
      }

      const page = pdfDoc.addPage([pageW, pageH]);
      page.drawImage(jpgImage, {
        x: 0,
        y: 0,
        width: pageW,
        height: pageH,
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([toArrayBufferBytes(pdfBytes)], { type: 'application/pdf' });
      downloadBlob(blob, `pvc-id-card-${Date.now()}.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Export to high-res JPG
  const handleDownloadJpg = () => {
    if (!previewCanvasRef.current) return;
    previewCanvasRef.current.toBlob((blob) => {
      if (blob) downloadBlob(blob, `pvc-id-card-${Date.now()}.jpg`);
    }, 'image/jpeg', 0.95);
  };

  const prefersReduced = useReducedMotion();

  return (
    <ToolWorkspaceShell
      title="e-Aadhaar & Voter ID to PVC Card Maker"
      subtitle="Convert downloaded e-Aadhaar PDF or Voter slip to standard CR80 PVC Card size (85.6 × 54 mm). Generate print-ready A4 or 4×6 photo sheets with cut lines and fold marks."
      categoryLabel="E-Mitra & CSC Special · CR80 Standard"
      icon={CreditCard}
      microVariant="crop"
      tone="blue"
      trustNote="ISO CR80 85.6×53.98 mm · 300 DPI print sheets · Optional 8-digit Aadhaar masking"
    >
      <div className="space-y-8">
        {/* Upload State */}
        {!sourceImage ? (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="max-w-2xl mx-auto"
          >
            <label
              className="relative flex flex-col items-center justify-center p-12 border-2 border-dashed border-[var(--pms-border-strong)] hover:border-[var(--pms-blue)] rounded-[1.75rem] cursor-pointer pms-glass-panel transition-all group overflow-hidden"
            >
              <PearlScanOverlay active={isProcessing} label="Rendering PDF / image to high-res canvas…" />
              <input
                type="file"
                accept=".pdf,image/png,image/jpeg,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"
                style={{ backgroundColor: 'var(--pms-soft-blue)', color: 'var(--pms-blue)' }}
              >
                <Upload className="w-8 h-8" />
              </div>
              <span className="text-base font-bold mb-1" style={{ color: 'var(--pms-ink)' }}>
                Drop e-Aadhaar PDF or ID Card Image
              </span>
              <span className="text-xs text-center max-w-xs" style={{ color: 'var(--pms-muted)' }}>
                Supports official UIDAI e-Aadhaar PDFs, Voter slips, Jan Aadhaar, Driving License, or College ID cards.
              </span>
              <span className="mt-5 px-6 py-2.5 rounded-full pms-btn-primary text-xs font-bold">
                Select File
              </span>
            </label>
          </motion.div>
        ) : (
          /* Editor Workspace */
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
          >
            {/* Left Controls Column */}
            <div className="lg:col-span-4 space-y-5 pms-glass-panel p-6 rounded-3xl">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--pms-border)]">
                <span className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--pms-ink)' }}>
                  <Sliders className="w-4 h-4 text-[var(--pms-blue)]" /> Print Settings
                </span>
                <button
                  onClick={() => {
                    setFile(null);
                    setSourceImage(null);
                  }}
                  className="text-xs text-[var(--pms-rose)] hover:underline font-semibold cursor-pointer"
                >
                  Change File
                </button>
              </div>

              {/* Paper Layout Selection */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--pms-muted)' }}>
                  Sheet &amp; Print Format
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { id: 'a4_side_by_side', label: 'A4 Side-by-Side (Foldable)' },
                    { id: 'a4_stacked', label: 'A4 Stacked (Vertical)' },
                    { id: 'photo_4x6', label: '4×6 Photo Paper' },
                    { id: 'pvc_single', label: 'Single PVC Card (85.6×54)' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setPaperLayout(opt.id as PaperLayout)}
                      className={`p-2.5 rounded-xl border text-left font-medium transition cursor-pointer ${
                        paperLayout === opt.id
                          ? 'border-[var(--pms-blue)] bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] font-bold'
                          : 'border-[var(--pms-border)] hover:border-sky-300 dark:hover:border-sky-700'
                      }`}
                      style={paperLayout === opt.id ? undefined : { backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filter Mode */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--pms-muted)' }}>
                  Scanner Filter
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'magic', label: 'Magic Scan' },
                    { id: 'bw', label: 'B&W Xerox' },
                    { id: 'original', label: 'Original' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setFilterMode(m.id as FilterMode)}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition text-center cursor-pointer ${
                        filterMode === m.id
                          ? 'pms-btn-primary border-transparent shadow-sm'
                          : 'border-[var(--pms-border)] hover:border-sky-300 dark:hover:border-sky-700'
                      }`}
                      style={filterMode === m.id ? undefined : { backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Crop Adjustments Tabs */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--pms-muted)' }}>
                    Target Crop Coordinates
                  </label>
                  <div className="flex gap-1 p-1 rounded-xl border border-[var(--pms-border)]" style={{ backgroundColor: 'var(--pms-pearl)' }}>
                    <button
                      onClick={() => setActiveCropSide('front')}
                      className={`px-2.5 py-1 text-xs rounded-lg font-bold transition cursor-pointer ${
                        activeCropSide === 'front' ? 'bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] shadow-xs' : 'text-[var(--pms-muted)]'
                      }`}
                    >
                      Front Card
                    </button>
                    <button
                      onClick={() => setActiveCropSide('back')}
                      className={`px-2.5 py-1 text-xs rounded-lg font-bold transition cursor-pointer ${
                        activeCropSide === 'back' ? 'bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] shadow-xs' : 'text-[var(--pms-muted)]'
                      }`}
                    >
                      Back Card
                    </button>
                  </div>
                </div>

                {/* Crop Slider Controls */}
                <div className="space-y-3 p-3.5 rounded-2xl border border-[var(--pms-border)] text-xs" style={{ backgroundColor: 'var(--pms-pearl)' }}>
                  <div>
                    <div className="flex justify-between text-[11px] font-semibold mb-1" style={{ color: 'var(--pms-ink)' }}>
                      <span>Horizontal Position (X)</span>
                      <span className="font-mono text-[var(--pms-blue)]">{activeCropSide === 'front' ? frontCrop.x : backCrop.x}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="70"
                      value={activeCropSide === 'front' ? frontCrop.x : backCrop.x}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (activeCropSide === 'front') setFrontCrop({ ...frontCrop, x: val });
                        else setBackCrop({ ...backCrop, x: val });
                      }}
                      className="w-full accent-sky-600 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-semibold mb-1" style={{ color: 'var(--pms-ink)' }}>
                      <span>Vertical Position (Y)</span>
                      <span className="font-mono text-[var(--pms-blue)]">{activeCropSide === 'front' ? frontCrop.y : backCrop.y}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="80"
                      value={activeCropSide === 'front' ? frontCrop.y : backCrop.y}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (activeCropSide === 'front') setFrontCrop({ ...frontCrop, y: val });
                        else setBackCrop({ ...backCrop, y: val });
                      }}
                      className="w-full accent-sky-600 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-2.5 pt-2">
                <label className="flex items-center gap-2.5 text-xs cursor-pointer" style={{ color: 'var(--pms-ink)' }}>
                  <input
                    type="checkbox"
                    checked={maskAadhaar}
                    onChange={(e) => setMaskAadhaar(e.target.checked)}
                    className="w-4 h-4 rounded accent-sky-600"
                  />
                  <span>Mask first 8 digits of Aadhaar (XXXX-XXXX-1234)</span>
                </label>
                <label className="flex items-center gap-2.5 text-xs cursor-pointer" style={{ color: 'var(--pms-ink)' }}>
                  <input
                    type="checkbox"
                    checked={includeCutMarks}
                    onChange={(e) => setIncludeCutMarks(e.target.checked)}
                    className="w-4 h-4 rounded accent-sky-600"
                  />
                  <span>Include scissors cutting guide marks</span>
                </label>
                <label className="flex items-center gap-2.5 text-xs cursor-pointer" style={{ color: 'var(--pms-ink)' }}>
                  <input
                    type="checkbox"
                    checked={includeLaminationGuide}
                    onChange={(e) => setIncludeLaminationGuide(e.target.checked)}
                    className="w-4 h-4 rounded accent-sky-600"
                  />
                  <span>Include 65×95mm lamination pouch border</span>
                </label>
              </div>

              {/* Export Buttons */}
              <div className="pt-3 border-t border-[var(--pms-border)] space-y-2.5">
                <motion.button
                  whileHover={prefersReduced || isProcessing ? undefined : { scale: 1.01 }}
                  whileTap={prefersReduced || isProcessing ? undefined : { scale: 0.985 }}
                  onClick={handleDownloadPdf}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-4 pms-btn-primary rounded-2xl font-bold text-sm disabled:opacity-50 cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Download Print-Ready PDF
                </motion.button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleDownloadJpg}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 border border-[var(--pms-border)] rounded-xl font-semibold text-xs transition cursor-pointer hover:border-sky-300 dark:hover:border-sky-700"
                    style={{ backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
                  >
                    <Download className="w-3.5 h-3.5" /> High-Res JPG
                  </button>
                  <button
                    onClick={() => setShowQrModal(true)}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300 border border-[var(--pms-border)] hover:opacity-90 rounded-xl font-semibold text-xs transition cursor-pointer"
                  >
                    <Smartphone className="w-3.5 h-3.5" /> Send to Phone
                  </button>
                </div>
              </div>
            </div>

            {/* Right Live Preview Column */}
            <div className="relative lg:col-span-8 pms-glass-panel p-6 rounded-3xl flex flex-col items-center overflow-hidden">
              <PearlScanOverlay active={isProcessing} label="Generating 300 DPI PVC print sheet…" />
              <div className="w-full flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--pms-muted)' }}>
                  <Eye className="w-4 h-4 text-[var(--pms-blue)]" /> Live Print Sheet Preview (<AnimatedNumber value={300} suffix=" DPI" />)
                </span>
                <span
                  className="text-xs font-bold px-3 py-1 rounded-full border border-[var(--pms-border)]"
                  style={{ backgroundColor: 'var(--pms-soft-blue)', color: 'var(--pms-blue)' }}
                >
                  CR80: 85.6 × 53.98 mm
                </span>
              </div>

              <AnimatePresence mode="wait">
                {previewDataUrl ? (
                  <motion.div
                    key={paperLayout + filterMode + String(maskAadhaar)}
                    initial={prefersReduced ? false : { opacity: 0.7 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                    className="w-full max-h-[650px] overflow-auto flex items-center justify-center p-4 bg-slate-100 dark:bg-slate-950 rounded-2xl border border-[var(--pms-border)]"
                  >
                    <img
                      src={previewDataUrl}
                      alt="PVC Card Print Sheet Preview"
                      className="max-h-[580px] w-auto object-contain rounded shadow-lg border border-slate-300 dark:border-slate-700 bg-white"
                    />
                  </motion.div>
                ) : (
                  <div className="w-full h-96 flex items-center justify-center text-xs" style={{ color: 'var(--pms-muted)' }}>
                    Generating high-resolution card preview...
                  </div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {/* SEO Section */}
        <ToolSEOSection
          toolName="e-Aadhaar to PVC Card Maker"
          headline="Instant Print-Ready PVC ID Cards for E-Mitra & CSC Centers"
          description="Convert official UIDAI e-Aadhaar PDFs, Voter ID slips, and student cards into standard 85.6mm × 54mm CR80 format. Automatically formats front and back sides onto A4 or 4×6 photo sheets with cut lines and lamination guidelines."
          steps={[
            {
              step: '01',
              title: 'Upload e-Aadhaar or ID Slip',
              desc: 'Select or drop your official e-Aadhaar PDF, Voter ID, or ID card image.',
            },
            {
              step: '02',
              title: 'Select Layout & Filter',
              desc: 'Choose A4 side-by-side, 4×6 photo paper, or single PVC layout. Enable Magic Scan for enhanced clarity.',
            },
            {
              step: '03',
              title: 'Print or Download',
              desc: 'Download 300 DPI print-ready PDF with lamination borders or scan QR to send directly to your smartphone.',
            },
          ]}
          features={[
            {
              title: 'ISO CR80 Standard Size',
              desc: 'Precision 85.6mm × 53.98mm dimensions match ATM cards, driving licenses, and PVC card printer trays perfectly.',
            },
            {
              title: 'A4 & 4×6 Photo Paper Layouts',
              desc: 'Supports both standard A4 bond paper and glossy 4×6 photo paper with foldable alignment guides.',
            },
            {
              title: 'Privacy Aadhaar Masking',
              desc: 'Optionally mask the first 8 digits of your Aadhaar number (XXXX-XXXX-1234) for safe general KYC.',
            },
          ]}
          faqs={[
            {
              q: 'What is the exact print size for PVC Aadhaar cards?',
              a: 'The standard PVC card size is ISO/IEC 7810 ID-1 (CR80), which measures 85.60 mm × 53.98 mm (3.370 in × 2.125 in). Our tool automatically sets exact dimensions.',
            },
            {
              q: 'Can I print this on a normal inkjet or laser printer?',
              a: 'Yes! Select the "A4 Side-by-Side" format. Print on 200+ GSM glossy paper or photo paper, cut along the guidelines, fold along the center dotted line, and laminate inside a standard 65×95mm pouch.',
            },
          ]}
        />

        {/* Mobile Transfer Modal */}
        <ShareQrModal
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          title="PVC Card Print Sheet"
          fileName="pvc-card-sheet.pdf"
        />
      </div>
    </ToolWorkspaceShell>
  );
}
