import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload,
  Download,
  Printer,
  Layers,
  ChevronRight,
  Crop,
  RotateCw,
  Sparkles,
  Sliders,
  CheckCircle2,
  RefreshCw,
  FileText,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { Link } from 'react-router-dom';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import {
  type Point,
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

  // Helper to re-render a card's filtered preview from its cropped canvas
  const updateFilteredPreview = useCallback(
    (canvas: HTMLCanvasElement | null, currentFilteredUrl: string | null) => {
      if (!canvas) return null;
      if (currentFilteredUrl) URL.revokeObjectURL(currentFilteredUrl);
      return applyScannerFilter(canvas, filterOptions);
    },
    [filterMode, brightness, contrast, shadowRemoval]
  );

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
        compositeCanvas.toBlob(async (blob) => {
          if (!blob) {
            rej(new Error('Canvas toBlob failed'));
            return;
          }
          res(new Uint8Array(await blob.arrayBuffer()));
        }, 'image/jpeg', 0.92);
      });

      const pdfImg = await pdfDoc.embedJpg(compositeBytes);
      page.drawImage(pdfImg, { x: 0, y: 0, width: 595.28, height: 841.89 });

      const pdfBytes = await pdfDoc.save();
      const pdfBlob = new Blob([pdfBytes as any], { type: 'application/pdf' });
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

  return (
    <div className="flex-1 flex flex-col items-center p-4 sm:p-8 bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 min-h-screen">
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

      {/* Header */}
      <div className="text-center mb-6 max-w-3xl mx-auto px-4">
        <div className="inline-flex items-center gap-2 bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 text-xs font-bold px-3 py-1 rounded-full mb-3 border border-orange-200 dark:border-orange-800">
          <ShieldCheck className="w-3.5 h-3.5" /> 12-POINT AI AUTO-CROP · REAL SCANNER ENHANCER
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-3 leading-tight">
          ID Card Front &amp; Back Joiner
        </h1>
        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
          Upload Aadhaar, PAN or Voter ID. <strong>12-Point AI Auto-Crop</strong> trims background table clutter, and <strong>Magic Scan</strong> transforms phone photos into crystal-clear flatbed scans on a single <strong>print-ready A4 sheet</strong>.
        </p>
      </div>

      <div className="w-full max-w-5xl space-y-5">
        {/* Filter Selection Panel */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>🎨 Real Scanner Filters</span>
              <span className="text-[11px] font-normal text-slate-500">
                (Click to switch style)
              </span>
            </h2>
            <button
              onClick={() => setShowSliders(!showSliders)}
              className="flex items-center gap-1 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{showSliders ? 'Hide Sliders' : 'Fine-Tune Sliders'}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.mode}
                onClick={() => setFilterMode(f.mode)}
                className={`relative rounded-xl border-2 p-2.5 text-left transition-all ${
                  filterMode === f.mode
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 hover:border-orange-300 hover:bg-orange-50/40 dark:hover:bg-orange-950/20'
                }`}
              >
                {f.badge && (
                  <span className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-500 text-white uppercase">
                    {f.badge}
                  </span>
                )}
                <div className="text-lg mb-0.5">{f.icon}</div>
                <div
                  className={`text-xs font-bold ${
                    filterMode === f.mode
                      ? 'text-orange-600 dark:text-orange-400'
                      : 'text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {f.label}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 leading-tight">
                  {f.desc}
                </div>
              </button>
            ))}
          </div>

          {/* Expandable Fine-Tune Sliders */}
          {showSliders && (
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/80 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs animate-in slide-in-from-top-2 duration-150">
              <div>
                <div className="flex justify-between mb-1 font-semibold text-slate-700 dark:text-slate-300">
                  <span>Brightness</span>
                  <span className="font-mono text-orange-600">{brightness > 0 ? `+${brightness}` : brightness}</span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                  className="w-full accent-orange-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1 font-semibold text-slate-700 dark:text-slate-300">
                  <span>Contrast</span>
                  <span className="font-mono text-orange-600">{contrast > 0 ? `+${contrast}` : contrast}</span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={contrast}
                  onChange={(e) => setContrast(Number(e.target.value))}
                  className="w-full accent-orange-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1 font-semibold text-slate-700 dark:text-slate-300">
                  <span>Paper Whitening</span>
                  <span className="font-mono text-orange-600">{shadowRemoval}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={shadowRemoval}
                  onChange={(e) => setShadowRemoval(Number(e.target.value))}
                  className="w-full accent-orange-500 cursor-pointer"
                />
              </div>
            </div>
          )}
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
              className="bg-white dark:bg-slate-800 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-orange-400 dark:hover:border-orange-500 transition-all overflow-hidden shadow-sm flex flex-col"
            >
              <input
                ref={ref}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileInput(e, side)}
              />

              {card.filteredUrl ? (
                <div className="p-3.5 flex flex-col flex-1">
                  {/* Card Title & Auto-Crop Badge */}
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {label}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/50 px-2 py-0.5 rounded-full border border-green-200 dark:border-green-800">
                      <CheckCircle2 className="w-3 h-3 text-green-600" />
                      12-Pt Auto-Cropped
                    </span>
                  </div>

                  {/* Cropped & Filtered Image Preview - Realistic Flatbed ID Card Look */}
                  <div className="relative rounded-xl overflow-hidden bg-slate-100/90 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 flex items-center justify-center p-3 min-h-[200px] max-h-[250px]">
                    <img
                      src={card.filteredUrl}
                      alt={label}
                      className="max-w-full max-h-[220px] object-contain rounded-lg shadow-md border border-slate-200/90 dark:border-slate-700/80 bg-white"
                    />
                  </div>

                  {/* Actions Toolbar */}
                  <div className="flex items-center justify-between gap-1.5 mt-3 pt-2 border-t border-slate-100 dark:border-slate-700">
                    <button
                      onClick={() => setModalSide(side)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 hover:bg-orange-100 text-xs font-bold border border-orange-200 dark:border-orange-800 transition-colors"
                      title="Adjust 12 boundary points with 2.5x Loupe"
                    >
                      <Crop className="w-3.5 h-3.5" /> Adjust 12-Pt Edge
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleQuickRotate(side)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                        title="Rotate 90 degrees"
                      >
                        <RotateCw className="w-3.5 h-3.5" /> 90°
                      </button>
                      <button
                        onClick={() => ref.current?.click()}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
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
                  <div className="w-16 h-16 rounded-2xl bg-orange-50 dark:bg-orange-950/40 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform shadow-inner">
                    🪪
                  </div>
                  <div className="text-center">
                    <p className="font-extrabold text-slate-800 dark:text-white text-sm">
                      {label}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Select any photo — camera or file
                    </p>
                    <span className="inline-block mt-2 text-[10px] text-orange-600 dark:text-orange-400 font-semibold bg-orange-50 dark:bg-orange-950/30 px-2.5 py-0.5 rounded-full border border-orange-200 dark:border-orange-800">
                      ✨ Auto-crops background automatically
                    </span>
                  </div>
                  <div className="mt-2 px-4 py-2 rounded-xl bg-orange-500 text-white text-xs font-bold flex items-center gap-1.5 group-hover:bg-orange-600 transition-colors shadow-md">
                    <Upload className="w-3.5 h-3.5" /> Upload Photo
                  </div>
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Layout + Generate Sheet */}
        {(front.filteredUrl || back.filteredUrl) && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-orange-500" /> A4 Page Layout
            </h2>
            <div className="flex gap-3 mb-5">
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
                  className={`flex-1 rounded-xl border-2 p-3 text-left transition-all ${
                    layout === l.val
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 hover:border-orange-300'
                  }`}
                >
                  <p
                    className={`text-xs font-bold ${
                      layout === l.val
                        ? 'text-orange-600 dark:text-orange-400'
                        : 'text-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {l.label}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1 hidden sm:block">
                    {l.desc}
                  </p>
                </button>
              ))}
            </div>

            <button
              onClick={buildPdf}
              disabled={!front.filteredUrl || !back.filteredUrl || processing}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 text-white font-extrabold text-base shadow-lg hover:from-orange-600 hover:to-rose-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
            </button>

            {(!front.filteredUrl || !back.filteredUrl) && (
              <p className="text-center text-xs text-slate-400 mt-2">
                ⚠️ Upload both Front &amp; Back photos to generate the sheet
              </p>
            )}
          </div>
        )}

        {/* Result Panel */}
        {step === 'done' && resultUrl && (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/30 rounded-2xl border border-green-200 dark:border-green-800 p-6 shadow-sm animate-in fade-in duration-200">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-full bg-green-500 text-white flex items-center justify-center text-2xl font-bold shadow-md">
                ✓
              </div>
              <div>
                <h3 className="font-extrabold text-green-900 dark:text-green-200 text-lg">
                  Your ID Card Single-Page Sheet is Ready!
                </h3>
                <p className="text-xs text-green-700 dark:text-green-300">
                  12-point auto-crop applied &amp; enhanced with{' '}
                  <strong className="capitalize">
                    {FILTERS.find((f) => f.mode === filterMode)?.label}
                  </strong>
                  .
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href={resultUrl}
                download="id-card-a4-photocopy.pdf"
                className="flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-green-600 text-white font-bold text-sm hover:bg-green-700 transition-colors shadow-md"
              >
                <Download className="w-4 h-4" /> Download A4 PDF (for Printing)
              </a>
              {resultJpgUrl && (
                <a
                  href={resultJpgUrl}
                  download="id-card-sheet.jpg"
                  className="flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors shadow-md"
                >
                  <Download className="w-4 h-4" /> Download JPG (for Portal Upload)
                </a>
              )}
            </div>

            <button
              onClick={resetAll}
              className="mt-4 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-medium mx-auto block transition-colors"
            >
              ↩ Process Another ID Card
            </button>
          </div>
        )}

        {/* FAQs */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {FAQS.map((item, i) => (
              <details
                key={i}
                className="group border-b border-slate-100 dark:border-slate-700 pb-4 last:border-0 last:pb-0"
              >
                <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-semibold text-slate-800 dark:text-slate-200 hover:text-orange-600 dark:hover:text-orange-400">
                  {item.q}
                  <ChevronRight className="w-4 h-4 shrink-0 ml-2 group-open:rotate-90 transition-transform" />
                </summary>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>

        {/* Related Tools */}
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/20 rounded-2xl border border-orange-100 dark:border-orange-900 p-5">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">
            🎓 Also useful for Govt Recruitment &amp; KYC:
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { to: '/target-compress', label: '🎯 Target Compress', desc: 'Exact KB PDF' },
              { to: '/passport-photo-sheet', label: '🖼️ Passport Photo Sheet', desc: '8 photos on 4×6' },
              { to: '/masked-aadhaar', label: '🛡️ Masked Aadhaar', desc: 'RBI & UIDAI KYC' },
              { to: '/exact-image-size', label: '⚖️ Exact Image Size', desc: 'Photo 20KB–50KB' },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-orange-100 dark:border-orange-900 hover:border-orange-400 hover:shadow-md transition-all group"
              >
                <p className="text-xs font-bold text-slate-800 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400">
                  {item.label}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {item.desc}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
