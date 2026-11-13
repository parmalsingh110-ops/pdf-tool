import React, { useState, useRef, useCallback, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Upload,
  Download,
  Printer,
  Layers,
  ChevronRight,
  Crop,
  RotateCw,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { Link } from 'react-router-dom';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { toArrayBufferBytes } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';
import {
  type TwelvePointMesh,
  type FilterMode,
  type FilterOptions,
  detectIdCard12Points,
  warpAndCropCard,
  applyScannerFilter,
} from '../lib/idCardDetector';
import TwelvePointCropModal from '../components/TwelvePointCropModal';

type Layout = 'vertical' | 'horizontal';

interface CardSideState {
  file: File | null;
  rawUrl: string | null;
  rotation: number;
  mesh: TwelvePointMesh | null;
  croppedCanvas: HTMLCanvasElement | null;
  croppedUrl: string | null;
  filteredUrl: string | null;
  width: number;
  height: number;
}

const INITIAL_CARD: CardSideState = {
  file: null,
  rawUrl: null,
  rotation: 0,
  mesh: null,
  croppedCanvas: null,
  croppedUrl: null,
  filteredUrl: null,
  width: 0,
  height: 0,
};

export default function IdCardJoiner() {
  useSEO(
    'ID Card Front & Back Joiner Online — Aadhaar, PAN & Voter ID Single Page',
    'Join front and back of Aadhaar, PAN card, Driving License or Voter ID onto a single A4 PDF or JPG sheet. 12-point auto-crop and real document scanner filters.'
  );

  usePageSEO(
    'ID Card Front & Back Joiner — Aadhaar, PAN, Voter ID Print',
    'Upload front and back of Aadhaar card, PAN card or any ID card. 12-point edge auto crop removes table clutter. Magic Color filter whitens background & sharpens text like CamScanner. Download print-ready A4 PDF or JPG for government portals. Free, browser-based, no signup.',
    'aadhaar card front back pdf, pan card joiner, id card to pdf, aadhar front back print, voter id pdf, id proof photocopy online, aadhaar front back single page pdf, 12 point auto crop id card',
    '/id-card-joiner'
  );

  const [front, setFront] = useState<CardSideState>(INITIAL_CARD);
  const [back, setBack] = useState<CardSideState>(INITIAL_CARD);
  const [filterMode, setFilterMode] = useState<FilterMode>('magic');
  const [brightness, setBrightness] = useState<number>(0);
  const [contrast, setContrast] = useState<number>(0);
  const [shadowRemoval, setShadowRemoval] = useState<number>(85);
  const [showSliders, setShowSliders] = useState<boolean>(false);
  const [layout, setLayout] = useState<Layout>('vertical');
  const [processing, setProcessing] = useState<boolean>(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultJpgUrl, setResultJpgUrl] = useState<string | null>(null);
  const [step, setStep] = useState<'upload' | 'done'>('upload');

  // Modal State
  const [modalSide, setModalSide] = useState<'front' | 'back' | null>(null);

  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      [
        front.rawUrl,
        front.croppedUrl,
        front.filteredUrl,
        back.rawUrl,
        back.croppedUrl,
        back.filteredUrl,
        resultUrl,
        resultJpgUrl,
      ].forEach((u) => {
        if (u) URL.revokeObjectURL(u);
      });
    };
  }, []);

  // Filter options bundle
  const filterOptions: FilterOptions = {
    mode: filterMode,
    brightness,
    contrast,
    shadowRemoval,
  };

  // Update filtered previews when filter options change
  useEffect(() => {
    if (front.croppedCanvas) {
      const fu = applyScannerFilter(front.croppedCanvas, filterOptions);
      setFront((p) => {
        if (p.filteredUrl && p.filteredUrl !== fu) URL.revokeObjectURL(p.filteredUrl);
        return { ...p, filteredUrl: fu };
      });
    }
    if (back.croppedCanvas) {
      const bu = applyScannerFilter(back.croppedCanvas, filterOptions);
      setBack((p) => {
        if (p.filteredUrl && p.filteredUrl !== bu) URL.revokeObjectURL(p.filteredUrl);
        return { ...p, filteredUrl: bu };
      });
    }
    setResultUrl(null);
    setResultJpgUrl(null);
    setStep('upload');
  }, [filterMode, brightness, contrast, shadowRemoval]);

  // ─── PROCESS UPLOADED IMAGE (AUTO CROP 12-PT + FILTER) ───────────────────
  const processNewImage = async (
    file: File,
    side: 'front' | 'back'
  ) => {
    if (file.size > 30 * 1024 * 1024) {
      alert('Image file is too large. Maximum allowed size is 30 MB.');
      return;
    }

    const rawUrl = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      // 1. Auto-detect 12-point boundary
      const mesh = detectIdCard12Points(img);

      // 2. Warp and Crop
      const croppedCanvas = warpAndCropCard(img, mesh);
      const croppedBlobUrl = croppedCanvas.toDataURL('image/jpeg', 0.95);

      // 3. Apply scanner filter
      const filteredUrl = applyScannerFilter(croppedCanvas, filterOptions);

      const updatedState: CardSideState = {
        file,
        rawUrl,
        rotation: 0,
        mesh,
        croppedCanvas,
        croppedUrl: croppedBlobUrl,
        filteredUrl,
        width: croppedCanvas.width,
        height: croppedCanvas.height,
      };

      if (side === 'front') {
        if (front.rawUrl) URL.revokeObjectURL(front.rawUrl);
        if (front.croppedUrl) URL.revokeObjectURL(front.croppedUrl);
        if (front.filteredUrl) URL.revokeObjectURL(front.filteredUrl);
        setFront(updatedState);
      } else {
        if (back.rawUrl) URL.revokeObjectURL(back.rawUrl);
        if (back.croppedUrl) URL.revokeObjectURL(back.croppedUrl);
        if (back.filteredUrl) URL.revokeObjectURL(back.filteredUrl);
        setBack(updatedState);
      }

      setResultUrl(null);
      setResultJpgUrl(null);
      setStep('upload');
    };

    img.src = rawUrl;
  };

  const handleFileInput = (
    e: React.ChangeEvent<HTMLInputElement>,
    side: 'front' | 'back'
  ) => {
    const f = e.target.files?.[0];
    if (f) processNewImage(f, side);
  };

  // ─── APPLY MANUAL 12-POINT CROP MODAL ────────────────────────────────────
  const handleModalApply = (
    newMesh: TwelvePointMesh,
    newRotation: number
  ) => {
    const target = modalSide === 'front' ? front : back;
    if (!target.rawUrl) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // If rotated, rotate source on canvas first
      let sourceImage: HTMLImageElement | HTMLCanvasElement = img;
      if (newRotation % 360 !== 0) {
        const rotCv = document.createElement('canvas');
        const isRot = newRotation % 180 !== 0;
        rotCv.width = isRot ? img.naturalHeight : img.naturalWidth;
        rotCv.height = isRot ? img.naturalWidth : img.naturalHeight;
        const rCtx = rotCv.getContext('2d')!;
        rCtx.translate(rotCv.width / 2, rotCv.height / 2);
        rCtx.rotate((newRotation * Math.PI) / 180);
        rCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        sourceImage = rotCv;
      }

      const croppedCanvas = warpAndCropCard(sourceImage, newMesh);
      const croppedUrl = croppedCanvas.toDataURL('image/jpeg', 0.95);
      const filteredUrl = applyScannerFilter(croppedCanvas, filterOptions);

      if (modalSide === 'front') {
        if (front.croppedUrl) URL.revokeObjectURL(front.croppedUrl);
        if (front.filteredUrl) URL.revokeObjectURL(front.filteredUrl);
        setFront((p) => ({
          ...p,
          rotation: newRotation,
          mesh: newMesh,
          croppedCanvas,
          croppedUrl,
          filteredUrl,
          width: croppedCanvas.width,
          height: croppedCanvas.height,
        }));
      } else {
        if (back.croppedUrl) URL.revokeObjectURL(back.croppedUrl);
        if (back.filteredUrl) URL.revokeObjectURL(back.filteredUrl);
        setBack((p) => ({
          ...p,
          rotation: newRotation,
          mesh: newMesh,
          croppedCanvas,
          croppedUrl,
          filteredUrl,
          width: croppedCanvas.width,
          height: croppedCanvas.height,
        }));
      }

      setModalSide(null);
      setResultUrl(null);
      setResultJpgUrl(null);
      setStep('upload');
    };
    img.src = target.rawUrl;
  };

  // Quick 90-degree rotate button on card
  const handleQuickRotate = (side: 'front' | 'back') => {
    const target = side === 'front' ? front : back;
    if (!target.croppedCanvas) return;

    const oldCanvas = target.croppedCanvas;
    const rotCv = document.createElement('canvas');
    rotCv.width = oldCanvas.height;
    rotCv.height = oldCanvas.width;
    const ctx = rotCv.getContext('2d')!;
    ctx.translate(rotCv.width / 2, rotCv.height / 2);
    ctx.rotate((90 * Math.PI) / 180);
    ctx.drawImage(oldCanvas, -oldCanvas.width / 2, -oldCanvas.height / 2);

    const croppedUrl = rotCv.toDataURL('image/jpeg', 0.95);
    const filteredUrl = applyScannerFilter(rotCv, filterOptions);

    const setter = side === 'front' ? setFront : setBack;
    setter((p) => {
      if (p.croppedUrl) URL.revokeObjectURL(p.croppedUrl);
      if (p.filteredUrl) URL.revokeObjectURL(p.filteredUrl);
      return {
        ...p,
        croppedCanvas: rotCv,
        croppedUrl,
        filteredUrl,
        width: rotCv.width,
        height: rotCv.height,
      };
    });

    setResultUrl(null);
    setResultJpgUrl(null);
    setStep('upload');
  };

  // ─── BUILD PRINT-READY A4 PDF & JPG ──────────────────────────────────────
  const buildPdf = useCallback(async () => {
    if (!front.filteredUrl || !back.filteredUrl) {
      alert('Please upload both Front and Back sides first.');
      return;
    }
    setProcessing(true);
    try {
      // Standard A4 dimensions at 150 DPI: 1240 x 1754
      // Standard ISO ID-1 card: 85.60 mm × 53.98 mm (Ratio 1.586)
      const A4_W = 1240;
      const A4_H = 1754;
      const CARD_W = 882;
      const CARD_H = 556;
      const MARGIN = 80;

      const compositeCanvas = document.createElement('canvas');
      compositeCanvas.width = A4_W;
      compositeCanvas.height = A4_H;
      const ctx = compositeCanvas.getContext('2d')!;

      // Crisp clean white paper background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, A4_W, A4_H);

      const loadImg = (src: string) =>
        new Promise<HTMLImageElement>((res, rej) => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = rej;
          i.src = src;
        });

      const frontImg = await loadImg(front.filteredUrl!);
      const backImg = await loadImg(back.filteredUrl!);

      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;

      if (layout === 'vertical') {
        // Vertical Stack: Front on top, Back on bottom
        const x = (A4_W - CARD_W) / 2;
        const yFront = MARGIN + 40;
        const yBack = yFront + CARD_H + MARGIN + 30;

        // Front Card
        ctx.strokeRect(x - 1, yFront - 1, CARD_W + 2, CARD_H + 2);
        ctx.drawImage(frontImg, x, yFront, CARD_W, CARD_H);

        // Back Card
        ctx.strokeRect(x - 1, yBack - 1, CARD_W + 2, CARD_H + 2);
        ctx.drawImage(backImg, x, yBack, CARD_W, CARD_H);

        // Professional Labels
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 24px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('— FRONT SIDE —', A4_W / 2, yFront + CARD_H + 34);
        ctx.fillText('— BACK SIDE —', A4_W / 2, yBack + CARD_H + 34);

        // Header watermark / stamp
        ctx.fillStyle = '#94a3b8';
        ctx.font = '16px Arial, sans-serif';
        ctx.fillText('OFFICIAL IDENTITY DOCUMENT PHOTOCOPY (SINGLE PAGE A4)', A4_W / 2, MARGIN - 10);
      } else {
        // Side by Side
        const cw = (A4_W - MARGIN * 3) / 2;
        const ch = Math.round(cw * (CARD_H / CARD_W));
        const yC = (A4_H - ch) / 2;

        ctx.strokeRect(MARGIN - 1, yC - 1, cw + 2, ch + 2);
        ctx.drawImage(frontImg, MARGIN, yC, cw, ch);

        ctx.strokeRect(MARGIN * 2 + cw - 1, yC - 1, cw + 2, ch + 2);
        ctx.drawImage(backImg, MARGIN * 2 + cw, yC, cw, ch);

        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 22px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Front Side', MARGIN + cw / 2, yC + ch + 32);
        ctx.fillText('Back Side', MARGIN * 2 + cw + cw / 2, yC + ch + 32);
      }

      // Generate JPG Blob
      const jpgBlob = await new Promise<Blob | null>((r) =>
        compositeCanvas.toBlob((b) => r(b), 'image/jpeg', 0.9)
      );
      if (jpgBlob) {
        if (resultJpgUrl) URL.revokeObjectURL(resultJpgUrl);
        setResultJpgUrl(URL.createObjectURL(jpgBlob));
      }

      // Generate A4 PDF using pdf-lib
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([595.28, 841.89]); // A4 in PDF points (72 DPI)
      const compositeBytes = await new Promise<Uint8Array>((res, rej) => {
        compositeCanvas.toBlob((blob) => {
          if (!blob) {
            rej(new Error('Canvas toBlob failed'));
            return;
          }
          blob.arrayBuffer().then((buf) => res(new Uint8Array(buf)), rej);
        }, 'image/jpeg', 0.92);
      });

      const pdfImg = await pdfDoc.embedJpg(compositeBytes);
      page.drawImage(pdfImg, { x: 0, y: 0, width: 595.28, height: 841.89 });

      const pdfBytes = await pdfDoc.save();
      const pdfBlob = new Blob([toArrayBufferBytes(pdfBytes)], { type: 'application/pdf' });
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultUrl(URL.createObjectURL(pdfBlob));
      setStep('done');
    } catch (err: any) {
      alert('Failed to generate sheet: ' + (err?.message || err));
    } finally {
      setProcessing(false);
    }
  }, [front.filteredUrl, back.filteredUrl, layout, resultUrl, resultJpgUrl]);

  const resetAll = () => {
    [
      front.rawUrl,
      front.croppedUrl,
      front.filteredUrl,
      back.rawUrl,
      back.croppedUrl,
      back.filteredUrl,
      resultUrl,
      resultJpgUrl,
    ].forEach((u) => {
      if (u) URL.revokeObjectURL(u);
    });
    setFront(INITIAL_CARD);
    setBack(INITIAL_CARD);
    setResultUrl(null);
    setResultJpgUrl(null);
    setStep('upload');
  };

  // ─── FILTER DEFINITIONS ──────────────────────────────────────────────────
  const FILTERS: {
    mode: FilterMode;
    label: string;
    icon: string;
    desc: string;
    badge?: string;
  }[] = [
    {
      mode: 'magic',
      label: 'Magic Scan',
      icon: '✨',
      desc: 'CamScanner Pro: white paper + crisp text + vivid photo',
      badge: 'Best',
    },
    {
      mode: 'bw',
      label: 'B&W Xerox',
      icon: '🖨️',
      desc: 'High-contrast photocopy shop look (pure black & white)',
      badge: 'Govt Form',
    },
    {
      mode: 'grayscale',
      label: 'Bank KYC Gray',
      icon: '⚪',
      desc: 'Official bank photocopy with continuous tonal range',
    },
    {
      mode: 'color_doc',
      label: 'Vivid Color',
      icon: '🌟',
      desc: 'Rich vibrant colors with shadow & haze removal',
    },
    {
      mode: 'original',
      label: 'Original Crop',
      icon: '🔆',
      desc: 'Unaltered camera colors with 12-point clean cut',
    },
  ];

  const FAQS = [
    {
      q: 'Random photo upload karne par auto-crop kaise hota hai?',
      a: 'Aap jaise hi Aadhaar, PAN ya kisi bhi card ki photo select karte hain, humara AI edge-detection algorithm card ke charo corners aur 12 boundary points ko automatically identify karta hai. Table, bistar ya haath ka background turant trim hokar perspective seedhi ho jaati hai.',
    },
    {
      q: '12-Point Edge Crop kya hai aur ise kaise use karein?',
      a: 'Card ke preview ke niche "✂️ Adjust 12-Pt Edge" button par click karein. Ek interactive editor khulega jisme card ke 4 corners (TL, TR, BR, BL) aur 8 edge points honge. Aap kisi bhi point ko drag karke 2.5× Loupe (magnifying glass) se pixel-perfect align kar sakte hain.',
    },
    {
      q: 'Magic Scan aur B&W Xerox filter me kya difference hai?',
      a: 'Magic Scan filter paper ki parchhai aur peelapan hatakar pure white background banata hai, text ko sharp karta hai, aur photo/emblem ke asli rang banaye rakhta hai. B&W Xerox filter official photocopy machine ki tarah 100% black ink aur white paper output deta hai.',
    },
    {
      q: 'Kya mera Aadhaar / PAN card data safe hai?',
      a: 'Haan — 100% safe aur private. Sabhi image processing aapke device ke browser me hi hoti hai. Photos kisi bhi server par upload nahi hoti.',
    },
    {
      q: 'Government recruitment portal ke liye kaun sa format download karein?',
      a: 'Agar portal par PDF maanga gaya hai toh "Download A4 PDF" karein. Agar JPG/Image maangi gayi hai toh "Download JPG" karein. File size limit ke liye humare "Target Compress" tool ka use karein.',
    },
  ];

  const prefersReduced = useReducedMotion();

  return (
    <ToolWorkspaceShell
      title="ID Card Front & Back Joiner"
      subtitle="Upload Aadhaar, PAN or Voter ID. 12-Point AI Auto-Crop trims background table clutter, and Magic Scan transforms phone photos into crystal-clear flatbed scans on a single print-ready A4 sheet."
      categoryLabel="12-Point AI Auto-Crop · Real Scanner Enhancer"
      icon={Layers}
      microVariant="crop"
      tone="rose"
      trustNote="100% browser-only · Zero server uploads · Print-ready 150 DPI A4 PDF & JPG"
    >
      {/* 12-Point Crop Modal */}
      {modalSide && (
        <TwelvePointCropModal
          isOpen={true}
          side={modalSide}
          rawUrl={(modalSide === 'front' ? front.rawUrl : back.rawUrl) || ''}
          initialMesh={
            (modalSide === 'front' ? front.mesh : back.mesh) ||
            detectIdCard12Points(document.createElement('canvas'))
          }
          rotation={modalSide === 'front' ? front.rotation : back.rotation}
          onApply={handleModalApply}
          onClose={() => setModalSide(null)}
        />
      )}

      <motion.div
        initial={prefersReduced ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="w-full max-w-5xl mx-auto space-y-5"
      >
        {/* Filter Selection Panel */}
        <div className="pms-glass-panel rounded-3xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--pms-ink)' }}>
              <span>🎨 Real Scanner Filters</span>
              <span className="text-[11px] font-normal" style={{ color: 'var(--pms-muted)' }}>
                (Click to switch style)
              </span>
            </h2>
            <button
              onClick={() => setShowSliders(!showSliders)}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] border border-[var(--pms-border)] cursor-pointer hover:opacity-90 transition-opacity"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{showSliders ? 'Hide Sliders' : 'Fine-Tune Sliders'}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {FILTERS.map((f) => (
              <button
                key={f.mode}
                onClick={() => setFilterMode(f.mode)}
                className={`relative rounded-2xl border p-3 text-left transition-all cursor-pointer ${
                  filterMode === f.mode
                    ? 'border-[var(--pms-rose)] bg-[var(--pms-soft-rose)] shadow-sm'
                    : 'border-[var(--pms-border)] hover:border-rose-300 dark:hover:border-rose-700'
                }`}
                style={filterMode === f.mode ? undefined : { backgroundColor: 'var(--pms-white)' }}
              >
                {f.badge && (
                  <span
                    className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase"
                    style={{
                      backgroundColor: filterMode === f.mode ? 'var(--pms-rose)' : 'var(--pms-soft-lavender)',
                      color: filterMode === f.mode ? '#fff' : 'var(--pms-violet)',
                    }}
                  >
                    {f.badge}
                  </span>
                )}
                <div className="text-lg mb-0.5">{f.icon}</div>
                <div
                  className="text-xs font-bold"
                  style={{ color: filterMode === f.mode ? 'var(--pms-rose)' : 'var(--pms-ink)' }}
                >
                  {f.label}
                </div>
                <div className="text-[10px] mt-0.5 line-clamp-2 leading-tight" style={{ color: 'var(--pms-muted)' }}>
                  {f.desc}
                </div>
              </button>
            ))}
          </div>

          {/* Expandable Fine-Tune Sliders */}
          <AnimatePresence>
            {showSliders && (
              <motion.div
                initial={prefersReduced ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={prefersReduced ? undefined : { opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 pt-4 border-t border-[var(--pms-border)] grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <div className="flex justify-between mb-1 font-semibold" style={{ color: 'var(--pms-ink)' }}>
                      <span>Brightness</span>
                      <span className="font-mono text-[var(--pms-rose)]">{brightness > 0 ? `+${brightness}` : brightness}</span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={brightness}
                      onChange={(e) => setBrightness(Number(e.target.value))}
                      className="w-full accent-rose-600 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1 font-semibold" style={{ color: 'var(--pms-ink)' }}>
                      <span>Contrast</span>
                      <span className="font-mono text-[var(--pms-rose)]">{contrast > 0 ? `+${contrast}` : contrast}</span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={contrast}
                      onChange={(e) => setContrast(Number(e.target.value))}
                      className="w-full accent-rose-600 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1 font-semibold" style={{ color: 'var(--pms-ink)' }}>
                      <span>Paper Whitening</span>
                      <span className="font-mono text-[var(--pms-rose)]">{shadowRemoval}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={shadowRemoval}
                      onChange={(e) => setShadowRemoval(Number(e.target.value))}
                      className="w-full accent-rose-600 cursor-pointer"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Upload Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            {
              label: 'Front Side (Aage ka Photo)',
              side: 'front' as const,
              ref: frontRef,
              card: front,
            },
            {
              label: 'Back Side (Peeche ka Photo)',
              side: 'back' as const,
              ref: backRef,
              card: back,
            },
          ].map(({ label, side, ref, card }) => (
            <div
              key={side}
              className="pms-glass-panel rounded-3xl border border-[var(--pms-border)] hover:border-rose-300 dark:hover:border-rose-700 transition-all overflow-hidden flex flex-col"
            >
              <input
                ref={ref}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileInput(e, side)}
              />

              {card.filteredUrl ? (
                <div className="p-4 flex flex-col flex-1">
                  {/* Card Title & Auto-Crop Badge */}
                  <div className="flex items-center justify-between mb-2.5 px-1">
                    <span className="text-xs font-bold" style={{ color: 'var(--pms-ink)' }}>
                      {label}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-[var(--pms-soft-mint)] px-2.5 py-0.5 rounded-full border border-[var(--pms-border)]">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      12-Pt Auto-Cropped
                    </span>
                  </div>

                  {/* Cropped & Filtered Image Preview — crisp bg-white for ID card contrast */}
                  <div className="relative rounded-2xl overflow-hidden bg-slate-100/90 dark:bg-slate-900/60 border border-[var(--pms-border)] flex items-center justify-center p-3 min-h-[200px] max-h-[250px]">
                    <img
                      src={card.filteredUrl}
                      alt={label}
                      className="max-w-full max-h-[220px] object-contain rounded-lg shadow-md border border-slate-200/90 bg-white"
                    />
                  </div>

                  {/* Actions Toolbar */}
                  <div className="flex items-center justify-between gap-1.5 mt-3 pt-2.5 border-t border-[var(--pms-border)]">
                    <button
                      onClick={() => setModalSide(side)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] hover:opacity-90 text-xs font-bold border border-[var(--pms-border)] transition-opacity cursor-pointer"
                      title="Adjust 12 boundary points with 2.5x Loupe"
                    >
                      <Crop className="w-3.5 h-3.5" /> Adjust 12-Pt Edge
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleQuickRotate(side)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[var(--pms-border)] text-xs font-semibold transition-colors cursor-pointer hover:border-rose-300 dark:hover:border-rose-700"
                        style={{ backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
                        title="Rotate 90 degrees"
                      >
                        <RotateCw className="w-3.5 h-3.5" /> 90°
                      </button>
                      <button
                        onClick={() => ref.current?.click()}
                        className="px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer hover:underline"
                        style={{ color: 'var(--pms-muted)' }}
                      >
                        Re-upload
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => ref.current?.click()}
                  className="w-full p-8 flex flex-col items-center justify-center gap-3 group flex-1 cursor-pointer"
                >
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl group-hover:scale-110 transition-transform shadow-inner border border-[var(--pms-border)]"
                    style={{ backgroundColor: 'var(--pms-soft-rose)' }}
                  >
                    🪪
                  </div>
                  <div className="text-center">
                    <p className="font-extrabold text-sm" style={{ color: 'var(--pms-ink)' }}>
                      {label}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--pms-muted)' }}>
                      Select any photo — camera or file
                    </p>
                    <span className="inline-block mt-2 text-[10px] text-[var(--pms-rose)] font-semibold bg-[var(--pms-soft-rose)] px-2.5 py-0.5 rounded-full border border-[var(--pms-border)]">
                      ✨ Auto-crops background automatically
                    </span>
                  </div>
                  <div className="mt-2 px-5 py-2.5 rounded-full pms-btn-primary text-xs font-bold flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" /> Upload Photo
                  </div>
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Layout + Generate Sheet */}
        <AnimatePresence>
          {(front.filteredUrl || back.filteredUrl) && (
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReduced ? undefined : { opacity: 0, y: -6 }}
              className="relative pms-glass-panel rounded-3xl p-5 sm:p-6 overflow-hidden"
            >
              <PearlScanOverlay active={processing} label="Composing 150 DPI A4 ID sheet…" />
              <h2 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--pms-ink)' }}>
                <Layers className="w-4 h-4 text-[var(--pms-rose)]" /> A4 Page Layout
              </h2>
              <div className="flex flex-col sm:flex-row gap-3 mb-5">
                {[
                  {
                    val: 'vertical' as Layout,
                    label: '📄 Vertical Stack (Standard Photocopy)',
                    desc: 'Front on top, Back on bottom — exactly as official photocopy shops print',
                  },
                  {
                    val: 'horizontal' as Layout,
                    label: '📋 Side by Side (Landscape Format)',
                    desc: 'Both cards aligned side-by-side in center',
                  },
                ].map((l) => (
                  <button
                    key={l.val}
                    onClick={() => setLayout(l.val)}
                    className={`flex-1 rounded-2xl border p-3.5 text-left transition-all cursor-pointer ${
                      layout === l.val
                        ? 'border-[var(--pms-rose)] bg-[var(--pms-soft-rose)] shadow-sm'
                        : 'border-[var(--pms-border)] hover:border-rose-300 dark:hover:border-rose-700'
                    }`}
                    style={layout === l.val ? undefined : { backgroundColor: 'var(--pms-white)' }}
                  >
                    <p
                      className="text-xs font-bold"
                      style={{ color: layout === l.val ? 'var(--pms-rose)' : 'var(--pms-ink)' }}
                    >
                      {l.label}
                    </p>
                    <p className="text-[10px] mt-1 hidden sm:block" style={{ color: 'var(--pms-muted)' }}>
                      {l.desc}
                    </p>
                  </button>
                ))}
              </div>

              <motion.button
                whileHover={prefersReduced || !front.filteredUrl || !back.filteredUrl || processing ? undefined : { scale: 1.01 }}
                whileTap={prefersReduced || !front.filteredUrl || !back.filteredUrl || processing ? undefined : { scale: 0.985 }}
                onClick={buildPdf}
                disabled={!front.filteredUrl || !back.filteredUrl || processing}
                className="w-full py-4 rounded-2xl pms-btn-primary font-extrabold text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
              >
                {processing ? (
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                    <span>Processing &amp; Generating A4 Sheet…</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Printer className="w-5 h-5" />
                    <span>Generate Print-Ready A4 PDF &amp; JPG Sheet</span>
                  </span>
                )}
              </motion.button>

              {(!front.filteredUrl || !back.filteredUrl) && (
                <p className="text-center text-xs mt-2.5" style={{ color: 'var(--pms-subtle-text)' }}>
                  ⚠️ Upload both Front &amp; Back photos to generate the sheet
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result Panel */}
        <AnimatePresence>
          {step === 'done' && resultUrl && (
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={prefersReduced ? undefined : { opacity: 0, y: -6 }}
              className="pms-glass-panel rounded-3xl border border-emerald-200/80 dark:border-emerald-800/70 p-6"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-full bg-emerald-600 text-white flex items-center justify-center text-2xl font-bold shadow-md">
                  ✓
                </div>
                <div>
                  <h3 className="font-extrabold text-emerald-900 dark:text-emerald-200 text-lg">
                    Your ID Card Single-Page Sheet is Ready!
                  </h3>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    12-point auto-crop applied &amp; enhanced with{' '}
                    <strong className="capitalize">
                      {FILTERS.find((f) => f.mode === filterMode)?.label}
                    </strong>{' '}
                    · <AnimatedNumber value={150} suffix=" DPI A4" />
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <a
                  href={resultUrl}
                  download="id-card-a4-photocopy.pdf"
                  className="flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20"
                >
                  <Download className="w-4 h-4" /> Download A4 PDF (for Printing)
                </a>
                {resultJpgUrl && (
                  <a
                    href={resultJpgUrl}
                    download="id-card-sheet.jpg"
                    className="flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-[var(--pms-blue)] text-white font-bold text-sm hover:opacity-90 transition-opacity shadow-md"
                  >
                    <Download className="w-4 h-4" /> Download JPG (for Portal Upload)
                  </a>
                )}
              </div>

              <button
                onClick={resetAll}
                className="mt-4 text-xs font-medium mx-auto block transition-colors cursor-pointer hover:underline"
                style={{ color: 'var(--pms-muted)' }}
              >
                ↩ Process Another ID Card
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* FAQs */}
        <div className="pms-glass-panel rounded-3xl p-6">
          <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--pms-ink)' }}>
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {FAQS.map((item, i) => (
              <details
                key={i}
                className="group border-b border-[var(--pms-border)] pb-4 last:border-0 last:pb-0"
              >
                <summary
                  className="cursor-pointer list-none flex items-center justify-between text-sm font-semibold hover:text-[var(--pms-rose)] transition-colors"
                  style={{ color: 'var(--pms-ink)' }}
                >
                  {item.q}
                  <ChevronRight className="w-4 h-4 shrink-0 ml-2 group-open:rotate-90 transition-transform" />
                </summary>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--pms-muted)' }}>
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>

        {/* Related Tools */}
        <div className="pms-glass-panel rounded-3xl p-5 sm:p-6">
          <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--pms-ink)' }}>
            🎓 Also useful for Govt Recruitment &amp; KYC:
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { to: '/target-compress', label: '🎯 Target Compress', desc: 'Exact KB PDF' },
              { to: '/passport-photo-sheet', label: '🖼️ Passport Photo Sheet', desc: '8 photos on 4×6' },
              { to: '/masked-aadhaar', label: '🛡️ Masked Aadhaar', desc: 'RBI & UIDAI KYC' },
              { to: '/exact-image-size', label: '⚖️ Exact Image Size', desc: 'Photo 20KB–50KB' },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-2xl p-3 border border-[var(--pms-border)] hover:border-[var(--pms-rose)] hover:shadow-sm transition-all group"
                style={{ backgroundColor: 'var(--pms-white)' }}
              >
                <p className="text-xs font-bold group-hover:text-[var(--pms-rose)] transition-colors" style={{ color: 'var(--pms-ink)' }}>
                  {item.label}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--pms-muted)' }}>
                  {item.desc}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </motion.div>
    </ToolWorkspaceShell>
  );
}
