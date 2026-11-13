import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Upload, Download, Sparkles, Shield, User, Sliders } from 'lucide-react';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { PDFDocument } from 'pdf-lib';
import { dataUrlToBytes } from '../lib/utils';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { toArrayBufferBytes, triggerBlobDownload, useAutoRevokeUrl } from '../lib/blobUrl';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

type LayoutMode = 'ssc_combo' | 'side_by_side' | 'photo_only' | 'sign_only';

export default function SarkariPhotoSignature() {
  useSEO(
    'Sarkari Photo & Signature Joiner with Name & Date (DOP) Online | PDF Media Suite',
    'Free online tool to join passport photo and signature with candidate name and Date of Photo (DOP). Perfect for SSC CGL, CHSL, MTS, GD, UPSC, Railway, State PSC exam forms.'
  );

  usePageSEO(
    'Sarkari Photo & Signature Joiner — With Name & DOP',
    'Add Name and Date of Photo (DOP) to passport size photograph and join with signature. Set exact file size (20KB - 50KB) for SSC, UPSC, and government recruitment forms.'
  );

  // Images
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [signFile, setSignFile] = useState<File | null>(null);
  const [signUrl, setSignUrl] = useState<string | null>(null);

  useAutoRevokeUrl(photoUrl);
  useAutoRevokeUrl(signUrl);

  // Text inputs
  const [candidateName, setCandidateName] = useState('ANURAG SHARMA');
  const [photoDate, setPhotoDate] = useState(() => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  });
  const [dopPrefix, setDopPrefix] = useState('DOP : ');
  const [showBorder, setShowBorder] = useState(true);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('ssc_combo');

  // Target size in KB (0 = max quality)
  const [targetSizeKb, setTargetSizeKb] = useState<number>(45); // default 45 KB for SSC
  const [resultSizeKb, setResultSizeKb] = useState<number | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const lastRenderedCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const prefersReduced = useReducedMotion();

  // File Handlers
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setPhotoUrl(URL.createObjectURL(file));
    }
  };

  const handleSignUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSignFile(file);
      setSignUrl(URL.createObjectURL(file));
    }
  };

  // Canvas Rendering Pipeline
  const renderCombinedCanvas = useCallback(async () => {
    if (!photoUrl && !signUrl) {
      setPreviewDataUrl(null);
      setResultSizeKb(null);
      return;
    }

    setIsProcessing(true);
    try {
      const canvas = canvasRef.current || document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Load photo image
      let photoImg: HTMLImageElement | null = null;
      if (photoUrl) {
        photoImg = await new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = photoUrl;
        });
      }

      // Load sign image
      let signImg: HTMLImageElement | null = null;
      if (signUrl) {
        signImg = await new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = signUrl;
        });
      }

      // Dimensions depending on layout mode
      if (layoutMode === 'ssc_combo') {
        // Standard SSC / Govt Combined Sheet: 350px wide x 520px high (Photo 350x420 + Sign 350x120)
        const w = 400;
        const photoH = 460;
        const signH = 160;
        const totalH = photoH + signH;

        canvas.width = w;
        canvas.height = totalH;

        // Fill background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, totalH);

        // 1. Draw Photo
        if (photoImg) {
          ctx.drawImage(photoImg, 0, 0, w, photoH);
        } else {
          ctx.fillStyle = '#f1f5f9';
          ctx.fillRect(0, 0, w, photoH);
          ctx.fillStyle = '#94a3b8';
          ctx.font = '16px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Candidate Photograph', w / 2, photoH / 2);
        }

        // Draw Name & Date Bar at bottom of photo
        if (candidateName || photoDate) {
          const barH = 72;
          const barY = photoH - barH;

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, barY, w, barH);

          // Thin divider line above bar
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, barY);
          ctx.lineTo(w, barY);
          ctx.stroke();

          ctx.fillStyle = '#000000';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          // Name
          if (candidateName) {
            ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
            ctx.fillText(candidateName.toUpperCase(), w / 2, barY + 24);
          }

          // Date of Photo (DOP)
          if (photoDate) {
            ctx.font = 'bold 17px "Segoe UI", Arial, sans-serif';
            ctx.fillText(`${dopPrefix}${photoDate}`, w / 2, barY + 50);
          }
        }

        // Divider between Photo and Signature
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, photoH);
        ctx.lineTo(w, photoH);
        ctx.stroke();

        // 2. Draw Signature
        if (signImg) {
          // Draw centered and nicely padded
          const padX = 20;
          const padY = 15;
          ctx.drawImage(signImg, padX, photoH + padY, w - padX * 2, signH - padY * 2);
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, photoH, w, signH);
          ctx.fillStyle = '#94a3b8';
          ctx.font = '15px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Candidate Signature Box', w / 2, photoH + signH / 2);
        }

        // Outer border if enabled
        if (showBorder) {
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 4;
          ctx.strokeRect(2, 2, w - 4, totalH - 4);
        }
      } else if (layoutMode === 'side_by_side') {
        // Photo on Left (350x450), Sign on Right (350x450)
        const w = 700;
        const h = 450;
        canvas.width = w;
        canvas.height = h;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);

        // Photo on Left half (0 to 350)
        if (photoImg) {
          ctx.drawImage(photoImg, 0, 0, 350, h);
        }
        if (candidateName || photoDate) {
          const barH = 70;
          const barY = h - barH;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, barY, 350, barH);
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.strokeRect(0, barY, 350, barH);

          ctx.fillStyle = '#000000';
          ctx.textAlign = 'center';
          if (candidateName) {
            ctx.font = 'bold 18px Arial, sans-serif';
            ctx.fillText(candidateName.toUpperCase(), 175, barY + 24);
          }
          if (photoDate) {
            ctx.font = 'bold 16px Arial, sans-serif';
            ctx.fillText(`${dopPrefix}${photoDate}`, 175, barY + 48);
          }
        }

        // Middle Divider
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(350, 0);
        ctx.lineTo(350, h);
        ctx.stroke();

        // Signature on Right half (350 to 700)
        if (signImg) {
          ctx.drawImage(signImg, 370, 100, 310, 220);
        }

        if (showBorder) {
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 3;
          ctx.strokeRect(1, 1, w - 2, h - 2);
        }
      } else if (layoutMode === 'photo_only') {
        const w = 400;
        const h = 500;
        canvas.width = w;
        canvas.height = h;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);

        if (photoImg) {
          ctx.drawImage(photoImg, 0, 0, w, h);
        }
        if (candidateName || photoDate) {
          const barH = 75;
          const barY = h - barH;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, barY, w, barH);
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, barY);
          ctx.lineTo(w, barY);
          ctx.stroke();

          ctx.fillStyle = '#000000';
          ctx.textAlign = 'center';
          if (candidateName) {
            ctx.font = 'bold 20px Arial, sans-serif';
            ctx.fillText(candidateName.toUpperCase(), w / 2, barY + 26);
          }
          if (photoDate) {
            ctx.font = 'bold 17px Arial, sans-serif';
            ctx.fillText(`${dopPrefix}${photoDate}`, w / 2, barY + 52);
          }
        }
        if (showBorder) {
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 3;
          ctx.strokeRect(1, 1, w - 2, h - 2);
        }
      } else if (layoutMode === 'sign_only') {
        const w = 500;
        const h = 200;
        canvas.width = w;
        canvas.height = h;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);

        if (signImg) {
          ctx.drawImage(signImg, 20, 20, w - 40, h - 40);
        }
        if (showBorder) {
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.strokeRect(1, 1, w - 2, h - 2);
        }
      }

      // Binary search for exact JPEG quality to hit target size (e.g. 45 KB)
      let quality = 0.92;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);

      if (targetSizeKb > 0) {
        const targetBytes = targetSizeKb * 1024;
        let low = 0.05;
        let high = 0.98;

        for (let i = 0; i < 7; i++) {
          quality = (low + high) / 2;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
          const approxBytes = Math.round((dataUrl.length - 22) * 0.75);
          if (approxBytes > targetBytes) {
            high = quality;
          } else {
            low = quality;
          }
        }
      }

      const finalBytes = Math.round((dataUrl.length - 22) * 0.75);
      setResultSizeKb(Math.round(finalBytes / 1024));
      lastRenderedCanvasRef.current = canvas;
      setPreviewDataUrl(dataUrl);
    } finally {
      setIsProcessing(false);
    }
  }, [photoUrl, signUrl, candidateName, photoDate, dopPrefix, showBorder, layoutMode, targetSizeKb]);

  useEffect(() => {
    renderCombinedCanvas();
  }, [renderCombinedCanvas]);

  // Download Handler
  const downloadResult = async (format: 'jpg' | 'png' | 'pdf') => {
    if (!previewDataUrl) return;

    if (format === 'jpg') {
      const a = document.createElement('a');
      a.href = previewDataUrl;
      a.download = `sarkari_photo_signature_${candidateName.replace(/\s+/g, '_') || 'exam'}.jpg`;
      a.click();
    } else if (format === 'png') {
      let pngDataUrl = lastRenderedCanvasRef.current?.toDataURL('image/png');
      if (!pngDataUrl) {
        const img = new Image();
        img.src = previewDataUrl;
        await new Promise((res) => { img.onload = res; });
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d')?.drawImage(img, 0, 0);
        pngDataUrl = c.toDataURL('image/png');
      }
      const a = document.createElement('a');
      a.href = pngDataUrl;
      a.download = `sarkari_photo_signature_${candidateName.replace(/\s+/g, '_') || 'exam'}.png`;
      a.click();
    } else if (format === 'pdf') {
      setIsProcessing(true);
      try {
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([400, 600]);
        const imgBytes = dataUrlToBytes(previewDataUrl);
        const isPng = previewDataUrl.includes('image/png');
        const img = isPng ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes);
        const dims = img.scale(0.8);

        page.drawImage(img, {
          x: (400 - dims.width) / 2,
          y: (600 - dims.height) / 2,
          width: dims.width,
          height: dims.height,
        });

        const pdfBytes = toArrayBufferBytes(await pdfDoc.save());
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        triggerBlobDownload(blob, `sarkari_document_${candidateName.replace(/\s+/g, '_') || 'exam'}.pdf`);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  return (
    <ToolWorkspaceShell
      title="Sarkari Photo & Signature Joiner (With Name & DOP)"
      subtitle="Add Candidate Name & Date of Photo (DOP) at bottom of passport photo, join signature, and compress strictly within required file size (20 KB – 50 KB)."
      categoryLabel="SSC · UPSC · IBPS · Railway Exam Format"
      icon={User}
      microVariant="crop"
      tone="amber"
    >

      <motion.div
        initial={prefersReduced ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
      >
        {/* Left Column: Controls & Inputs (7 Cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Upload Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Photo Card */}
            <div className="p-4 pms-glass-panel rounded-2xl">
              <label className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center justify-between" style={{ color: 'var(--pms-ink)' }}>
                <span>1. Passport Photo</span>
                {photoFile && (
                  <span className="text-emerald-700 dark:text-emerald-300 bg-[var(--pms-soft-mint)] px-2 py-0.5 rounded-full text-[10px] font-bold">
                    selected
                  </span>
                )}
              </label>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-[var(--pms-border-strong)] hover:border-rose-400 dark:hover:border-rose-500 rounded-xl p-4 cursor-pointer transition-colors bg-[var(--pms-white)] hover:bg-[var(--pms-soft-rose)]/30">
                <Upload className="w-6 h-6 text-[var(--pms-violet)] mb-1.5" />
                <span className="text-xs font-semibold text-center truncate max-w-full" style={{ color: 'var(--pms-ink)' }}>
                  {photoFile ? photoFile.name : 'Upload Candidate Photo'}
                </span>
                <span className="text-[10px] mt-0.5" style={{ color: 'var(--pms-subtle-text)' }}>JPG / PNG</span>
                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </label>
            </div>

            {/* Signature Card */}
            <div className="p-4 pms-glass-panel rounded-2xl">
              <label className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center justify-between" style={{ color: 'var(--pms-ink)' }}>
                <span>2. Signature</span>
                {signFile && (
                  <span className="text-emerald-700 dark:text-emerald-300 bg-[var(--pms-soft-mint)] px-2 py-0.5 rounded-full text-[10px] font-bold">
                    selected
                  </span>
                )}
              </label>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-[var(--pms-border-strong)] hover:border-rose-400 dark:hover:border-rose-500 rounded-xl p-4 cursor-pointer transition-colors bg-[var(--pms-white)] hover:bg-[var(--pms-soft-rose)]/30">
                <Upload className="w-6 h-6 text-[var(--pms-rose)] mb-1.5" />
                <span className="text-xs font-semibold text-center truncate max-w-full" style={{ color: 'var(--pms-ink)' }}>
                  {signFile ? signFile.name : 'Upload Candidate Sign'}
                </span>
                <span className="text-[10px] mt-0.5" style={{ color: 'var(--pms-subtle-text)' }}>JPG / PNG</span>
                <input type="file" accept="image/*" onChange={handleSignUpload} className="hidden" />
              </label>
            </div>
          </div>

          {/* Exam Presets Selector Box */}
          <div className="p-5 pms-glass-panel rounded-3xl space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" /> 1-Click Official Exam Portal Presets
              </span>
              <span className="text-[11px] font-medium" style={{ color: 'var(--pms-muted)' }}>Auto-configures size & layout</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { id: 'ssc', label: 'SSC CGL / CHSL / GD', layout: 'ssc_combo', size: 45, prefix: 'DOP : ' },
                { id: 'upsc', label: 'UPSC Civil Services', layout: 'photo_only', size: 90, prefix: '' },
                { id: 'nta', label: 'NTA NEET / JEE', layout: 'photo_only', size: 80, prefix: 'DATE : ' },
                { id: 'rrb', label: 'Railway RRB Exams', layout: 'ssc_combo', size: 40, prefix: 'DOP : ' },
                { id: 'ibps', label: 'IBPS Bank PO / Clerk', layout: 'side_by_side', size: 45, prefix: '' },
                { id: 'custom', label: 'Custom Manual', layout: 'ssc_combo', size: 45, prefix: 'DOP : ' },
              ].map((preset) => {
                const active = layoutMode === preset.layout && targetSizeKb === preset.size;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setLayoutMode(preset.layout as LayoutMode);
                      setTargetSizeKb(preset.size);
                      setDopPrefix(preset.prefix);
                    }}
                    className={`py-2 px-3 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                      active
                        ? 'bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] border-rose-300 dark:border-rose-700 shadow-xs'
                        : 'bg-[var(--pms-white)] border-[var(--pms-border)] hover:border-[var(--pms-border-strong)]'
                    }`}
                    style={!active ? { color: 'var(--pms-ink)' } : undefined}
                  >
                    <div className="truncate font-bold">{preset.label}</div>
                    <div className="text-[10px] opacity-75 mt-0.5">{preset.size} KB limit</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Details Config Box */}
          <div className="p-5 sm:p-6 pms-glass-panel rounded-3xl space-y-4">
            <h2 className="text-sm font-extrabold flex items-center gap-2" style={{ color: 'var(--pms-ink)' }}>
              <User className="w-4 h-4 text-[var(--pms-blue)]" /> Candidate Details on Photo
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--pms-ink)' }}>
                  Candidate Full Name (in CAPITAL)
                </label>
                <input
                  type="text"
                  placeholder="e.g. ANURAG SHARMA"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 bg-[var(--pms-white)] border border-[var(--pms-border-strong)] rounded-xl text-sm font-semibold focus:ring-2 focus:ring-rose-500 outline-none uppercase"
                  style={{ color: 'var(--pms-ink)' }}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold" style={{ color: 'var(--pms-ink)' }}>
                    Date of Photo (DOP)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      const dd = String(today.getDate()).padStart(2, '0');
                      const mm = String(today.getMonth() + 1).padStart(2, '0');
                      const yyyy = today.getFullYear();
                      setPhotoDate(`${dd}/${mm}/${yyyy}`);
                    }}
                    className="text-[10px] font-bold text-[var(--pms-rose)] hover:underline cursor-pointer"
                  >
                    Set Today
                  </button>
                </div>
                <div className="flex gap-2">
                  <select
                    value={dopPrefix}
                    onChange={(e) => setDopPrefix(e.target.value)}
                    className="px-2 py-2.5 bg-[var(--pms-white)] border border-[var(--pms-border-strong)] rounded-xl text-xs font-medium focus:ring-2 focus:ring-rose-500 outline-none"
                    style={{ color: 'var(--pms-ink)' }}
                  >
                    <option value="DOP : ">DOP :</option>
                    <option value="DATE : ">DATE :</option>
                    <option value="DOB : ">DOB :</option>
                    <option value="">No Prefix</option>
                  </select>
                  <input
                    type="text"
                    placeholder="DD/MM/YYYY"
                    value={photoDate}
                    onChange={(e) => setPhotoDate(e.target.value)}
                    className="flex-1 px-3 py-2.5 bg-[var(--pms-white)] border border-[var(--pms-border-strong)] rounded-xl text-sm font-semibold focus:ring-2 focus:ring-rose-500 outline-none"
                    style={{ color: 'var(--pms-ink)' }}
                  />
                </div>
              </div>
            </div>

            {/* Layout Mode Selector */}
            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--pms-ink)' }}>
                Output Layout Style:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'ssc_combo', label: 'SSC Combined (Photo + Sign)' },
                  { id: 'side_by_side', label: 'Side by Side' },
                  { id: 'photo_only', label: 'Photo with Name & DOP' },
                  { id: 'sign_only', label: 'Signature Only' },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setLayoutMode(mode.id as LayoutMode)}
                    className={`py-2 px-2.5 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                      layoutMode === mode.id
                        ? 'bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] border-violet-300 dark:border-violet-700 font-bold shadow-xs'
                        : 'bg-[var(--pms-white)] border-[var(--pms-border)] hover:border-[var(--pms-border-strong)]'
                    }`}
                    style={layoutMode !== mode.id ? { color: 'var(--pms-muted)' } : undefined}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Border Toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-[var(--pms-border)]">
              <span className="text-xs font-medium" style={{ color: 'var(--pms-ink)' }}>Official Black Border Outline</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={showBorder}
                  onChange={(e) => setShowBorder(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-600"></div>
              </label>
            </div>
          </div>

          {/* Target File Size Slider */}
          <div className="p-5 sm:p-6 pms-glass-panel rounded-3xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold flex items-center gap-2" style={{ color: 'var(--pms-ink)' }}>
                <Sliders className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Target File Size Controller
              </h2>
              <span className="text-xs font-bold px-2.5 py-1 bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300 rounded-full border border-emerald-200 dark:border-emerald-800 font-mono">
                {targetSizeKb > 0 ? `Target: ~${targetSizeKb} KB` : 'Original Quality'}
              </span>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap gap-2">
              {[
                { label: '20 KB – 50 KB (SSC Format)', kb: 40 },
                { label: '50 KB – 100 KB (UPSC Format)', kb: 80 },
                { label: '10 KB – 20 KB (Sign Only)', kb: 18 },
                { label: 'Under 100 KB', kb: 95 },
                { label: 'Max Quality (No limit)', kb: 0 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setTargetSizeKb(preset.kb)}
                  className={`text-xs px-3 py-1.5 rounded-xl border font-semibold transition-all cursor-pointer ${
                    targetSizeKb === preset.kb
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-[var(--pms-white)] border-[var(--pms-border)] hover:border-emerald-400'
                  }`}
                  style={targetSizeKb !== preset.kb ? { color: 'var(--pms-muted)' } : undefined}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Slider */}
            <div>
              <input
                type="range"
                min="10"
                max="200"
                step="5"
                value={targetSizeKb || 150}
                onChange={(e) => setTargetSizeKb(Number(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <div className="flex justify-between text-[11px] mt-1" style={{ color: 'var(--pms-subtle-text)' }}>
                <span>10 KB (Super Compressed)</span>
                <span>50 KB (SSC)</span>
                <span>100 KB (UPSC)</span>
                <span>200 KB</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Preview & Download (5 Cols) */}
        <div className="lg:col-span-5 space-y-5 lg:sticky lg:top-8">
          <div className="relative p-5 sm:p-6 pms-glass-panel rounded-3xl text-center overflow-hidden min-h-[460px]">
            <PearlScanOverlay active={isProcessing} label="Formatting exam sheet & tuning KB size…" />

            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--pms-ink)' }}>
                Live Document Preview
              </span>
              {resultSizeKb !== null && (
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300 rounded-full border border-emerald-200 dark:border-emerald-800">
                  Size: ~<AnimatedNumber value={resultSizeKb} suffix=" KB" />
                </span>
              )}
            </div>

            {/* Canvas / Preview Container (crisp white surface for true photo look) */}
            <div className="bg-white p-4 rounded-2xl flex items-center justify-center min-h-[360px] border border-[var(--pms-border)] overflow-hidden shadow-inner">
              {previewDataUrl ? (
                <img
                  src={previewDataUrl}
                  alt="Candidate Photo with Name and DOP"
                  className="max-h-[380px] max-w-full object-contain shadow-md rounded-sm"
                />
              ) : (
                <div className="text-center p-6">
                  <User className="w-12 h-12 mx-auto mb-2 opacity-40 text-slate-400" />
                  <p className="text-sm font-semibold text-slate-600">No Photo Selected</p>
                  <p className="text-xs text-slate-400 mt-1">Upload candidate photo and signature to see live joined preview</p>
                </div>
              )}
            </div>

            {/* Download Action Buttons */}
            <div className="mt-5 space-y-2.5">
              <motion.button
                whileHover={prefersReduced || !previewDataUrl ? undefined : { scale: 1.01 }}
                whileTap={prefersReduced || !previewDataUrl ? undefined : { scale: 0.985 }}
                type="button"
                onClick={() => downloadResult('jpg')}
                disabled={!previewDataUrl}
                className="w-full py-3.5 pms-btn-primary font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
              >
                <Download className="w-4 h-4" /> Download JPG (Exam Format)
              </motion.button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => downloadResult('png')}
                  disabled={!previewDataUrl}
                  className="py-2.5 bg-[var(--pms-white)] border border-[var(--pms-border)] hover:border-rose-300 dark:hover:border-rose-700 text-xs font-semibold rounded-xl transition-colors disabled:opacity-40 cursor-pointer"
                  style={{ color: 'var(--pms-ink)' }}
                >
                  Download PNG
                </button>
                <button
                  type="button"
                  onClick={() => downloadResult('pdf')}
                  disabled={!previewDataUrl}
                  className="py-2.5 bg-[var(--pms-white)] border border-[var(--pms-border)] hover:border-rose-300 dark:hover:border-rose-700 text-xs font-semibold rounded-xl transition-colors disabled:opacity-40 cursor-pointer"
                  style={{ color: 'var(--pms-ink)' }}
                >
                  Download PDF
                </button>
              </div>
            </div>

            {/* Trust badge */}
            <div className="mt-4 pt-3 border-t border-[var(--pms-border)] flex items-center justify-center gap-1.5 text-[11px]" style={{ color: 'var(--pms-muted)' }}>
              <Shield className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>100% Private: Processed entirely in browser</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Competitive Exam Guidelines Guide */}
      <div className="mt-16 border-t border-[var(--pms-border)] pt-10">
        <h2 className="text-2xl font-bold mb-6 text-center" style={{ color: 'var(--pms-ink)' }}>
          Official Photo & Signature Rules for Sarkari Exams (SSC, UPSC, Railway)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div className="p-5 pms-glass-panel rounded-2xl">
            <h3 className="font-bold mb-2" style={{ color: 'var(--pms-ink)' }}>SSC CGL / CHSL / MTS / GD</h3>
            <ul className="text-xs space-y-1.5 list-disc pl-4" style={{ color: 'var(--pms-muted)' }}>
              <li>Photo size must be between <strong>20 KB to 50 KB</strong>.</li>
              <li>Photograph must not be more than 3 months old from notice date.</li>
              <li>Candidate name and Date of Photograph (DOP) printed clearly at the bottom.</li>
              <li>Signature must be <strong>10 KB to 20 KB</strong> in clear black ink.</li>
            </ul>
          </div>
          <div className="p-5 pms-glass-panel rounded-2xl">
            <h3 className="font-bold mb-2" style={{ color: 'var(--pms-ink)' }}>UPSC (Civil Services / NDA / CDS)</h3>
            <ul className="text-xs space-y-1.5 list-disc pl-4" style={{ color: 'var(--pms-muted)' }}>
              <li>Photo file size between <strong>50 KB to 100 KB</strong>.</li>
              <li>Must clearly display Candidate Name and Date of Taking Photograph.</li>
              <li>Background must be plain white or light colored.</li>
              <li>Spectacles or cap are strictly not allowed.</li>
            </ul>
          </div>
          <div className="p-5 pms-glass-panel rounded-2xl">
            <h3 className="font-bold mb-2" style={{ color: 'var(--pms-ink)' }}>Railway RRB & State PSCs</h3>
            <ul className="text-xs space-y-1.5 list-disc pl-4" style={{ color: 'var(--pms-muted)' }}>
              <li>Rajasthan RSSB/RPSC, UPSSSC, BSSC accept both single combo or separate photo + sign.</li>
              <li>Signature must be on unlined plain white paper with dark ink.</li>
              <li>Final merged file must not exceed specified portal size limit.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* SEO Guide & Sarkari Exam FAQs */}
      <ToolSEOSection
        toolName="Sarkari Photo & Signature Joiner"
        headline="Free Sarkari Photo & Signature Maker with Name & Date (DOP)"
        description="Format passport photograph with printed Candidate Name and Date of Taking Photograph (DOP). Merge photo and signature into single combo cards or exact portal dimension presets for SSC CGL, CHSL, MTS, GD, UPSC, IBPS, RRB, and Police recruitment."
        steps={[
          {
            step: '01',
            title: 'Upload Photo & Signature',
            desc: 'Select your passport size photo and your clean signature image from your gallery or computer.',
          },
          {
            step: '02',
            title: 'Enter Name & Date (DOP)',
            desc: 'Type your candidate name and the exact photo capture date to overlay the white name banner.',
          },
          {
            step: '03',
            title: 'Choose Exam Preset & Download',
            desc: 'Select 1-click presets for SSC, UPSC, NTA, or IBPS, adjust target KB (20KB - 50KB), and download.',
          },
        ]}
        faqs={[
          {
            q: 'Is Name and Date of Photo (DOP) mandatory for SSC applications?',
            a: 'Yes. Most SSC notifications (CGL, CHSL, MTS, GD, Stenographer) explicitly require photographs taken within the last 3 months with clearly printed candidate name and date of photo.',
          },
          {
            q: 'How do I compress the photo to between 20 KB and 50 KB?',
            a: 'Use the built-in Target File Size slider! Move the slider to 35 KB or 45 KB, and the tool will automatically output the exact file size required by government upload portals.',
          },
          {
            q: 'Can I download the result as JPG, PNG, or PDF?',
            a: 'Yes! The tool supports 1-click downloads for high-resolution JPG (the official standard for online forms), transparent PNG, and print-ready PDF.',
          },
          {
            q: 'Are my personal exam documents secure on this site?',
            a: '100% secure. Everything runs client-side directly on your phone or PC. Your photo and signature are never sent to any server.',
          },
        ]}
        relatedTools={[
          { name: 'Clean Signature', path: '/clean-signature', desc: 'Turn mobile photos of signatures into transparent PNG or pure white background' },
          { name: 'Masked Aadhaar', path: '/masked-aadhaar', desc: 'Mask first 8 digits of Aadhaar card for KYC safety (XXXX-XXXX-1234)' },
          { name: 'Exam Bundle Merger', path: '/exam-document-merger', desc: 'Merge 10th, 12th, Degree, Caste & Domicile certificates under 1 MB' },
          { name: 'Exact Image Size (KB)', path: '/exact-image-size', desc: 'Strict KB sizing (20KB, 50KB, 100KB) for government portals' },
        ]}
      />
    </ToolWorkspaceShell>
  );
}
