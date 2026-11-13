import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Upload, Download, Sparkles, Sliders, Shield, Crop, Contrast, RotateCw, Target, CheckCircle2 } from 'lucide-react';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { PDFDocument } from 'pdf-lib';
import { dataUrlToBytes } from '../lib/utils';
import { toArrayBufferBytes } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

type InkColorChoice = 'original' | 'black' | 'royal_blue' | 'navy_blue';

export default function CleanSignature() {
  useSEO(
    'Clean Paper Signature — Phone Photo to Pure White or Transparent Sign | PDF Media Suite',
    'Convert phone camera photo of handwritten signature on paper into clean digital signature with pure white or transparent background. Remove shadows and yellow tint online.'
  );

  usePageSEO(
    'Clean Paper Signature — Transparent PNG & White Background',
    'Remove shadows and paper background from handwritten signature photo. Create transparent digital signature PNG or clean white JPG for exam forms and PDF signing.'
  );

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // Filter Adjustments
  const [threshold, setThreshold] = useState<number>(180); // White background threshold
  const [contrastBoost, setContrastBoost] = useState<number>(30); // 0 to 100
  const [makeTransparent, setMakeTransparent] = useState<boolean>(true);
  const [inkColor, setInkColor] = useState<InkColorChoice>('black');
  const [autoCrop, setAutoCrop] = useState<boolean>(true);
  const [rotation, setRotation] = useState<number>(0);
  const [removeRuledLines, setRemoveRuledLines] = useState<boolean>(true);

  // Target size (0 = Original / No Limit)
  const [targetKb, setTargetKb] = useState<number>(20);
  const [isCustomKb, setIsCustomKb] = useState<boolean>(false);
  const [customKbValue, setCustomKbValue] = useState<string>('20');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileSizeKb, setFileSizeKb] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const sourceImgRef = useRef<HTMLImageElement | null>(null);
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setImageFile(file);
      const url = URL.createObjectURL(file);
      setImageUrl(url);
    }
  };

  // Image Processing Pipeline
  const processSignature = useCallback(() => {
    if (!imageUrl) return;
    setIsProcessing(true);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => setIsProcessing(false);
    img.onload = () => {
      try {
        sourceImgRef.current = img;

        // Handle rotation
        const isRotated = rotation % 180 !== 0;
        const srcW = isRotated ? img.height : img.width;
        const srcH = isRotated ? img.width : img.height;

        const canvas = document.createElement('canvas');
        canvas.width = srcW;
        canvas.height = srcH;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        // Draw with rotation
        ctx.save();
        ctx.translate(srcW / 2, srcH / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        ctx.restore();

        const imgData = ctx.getImageData(0, 0, srcW, srcH);
        const d = imgData.data;

        // Calculate Bounding Box of actual ink if auto-crop is requested
        let minX = srcW, minY = srcH, maxX = 0, maxY = 0;
        let hasInk = false;

        // RGB tints for Ink Color choices
        const targetColors: Record<InkColorChoice, [number, number, number] | null> = {
          original: null,
          black: [15, 23, 42],       // deep slate black
          royal_blue: [29, 78, 216], // royal blue ink
          navy_blue: [15, 23, 42],   // dark navy
        };
        if (inkColor === 'navy_blue') {
          targetColors.navy_blue = [30, 58, 138];
        }

        for (let i = 0; i < d.length; i += 4) {
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          const x = (i / 4) % srcW;
          const y = Math.floor((i / 4) / srcW);

          // Grayscale luminance
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;

          // Ruled line detection: notebook lines are faint blue/gray lines
          const isRuledLine = removeRuledLines && (
            (b - r > 14 && lum > 130) || // faint blue/cyan notebook ruled line
            (lum > threshold * 0.82 && Math.abs(r - g) < 14 && Math.abs(g - b) < 14) // faint ruled line
          );

          // If luminance > threshold or detected as notebook ruled line, it's paper background
          if (lum > threshold || isRuledLine) {
            if (makeTransparent) {
              d[i + 3] = 0; // Alpha 0 (Transparent)
            } else {
              d[i] = 255;
              d[i + 1] = 255;
              d[i + 2] = 255;
              d[i + 3] = 255;
            }
          } else {
            // Ink stroke!
            hasInk = true;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;

            // Contrast enhancement: darken ink
            const factor = 1 - (contrastBoost / 100) * 0.5;
            const inkLuminance = lum * factor;

            const chosenColor = targetColors[inkColor];
            if (chosenColor) {
              // Apply chosen ink tint while respecting intensity
              const intensity = 1 - inkLuminance / 255;
              d[i] = Math.round(chosenColor[0] * (1 - intensity * 0.2));
              d[i + 1] = Math.round(chosenColor[1] * (1 - intensity * 0.2));
              d[i + 2] = Math.round(chosenColor[2] * (1 - intensity * 0.2));
              d[i + 3] = 255;
            } else {
              // Darken original
              d[i] = Math.max(0, Math.round(r * factor));
              d[i + 1] = Math.max(0, Math.round(g * factor));
              d[i + 2] = Math.max(0, Math.round(b * factor));
              d[i + 3] = 255;
            }
          }
        }

        ctx.putImageData(imgData, 0, 0);

        // Auto-Crop bounding box with slight padding
        let finalCanvas = canvas;
        if (autoCrop && hasInk && maxX > minX && maxY > minY) {
          const pad = 20;
          const cropX = Math.max(0, minX - pad);
          const cropY = Math.max(0, minY - pad);
          const cropW = Math.min(srcW - cropX, maxX - minX + pad * 2);
          const cropH = Math.min(srcH - cropY, maxY - minY + pad * 2);

          const cropCanvas = document.createElement('canvas');
          cropCanvas.width = cropW;
          cropCanvas.height = cropH;
          const cropCtx = cropCanvas.getContext('2d');
          if (cropCtx) {
            if (!makeTransparent) {
              cropCtx.fillStyle = '#ffffff';
              cropCtx.fillRect(0, 0, cropW, cropH);
            }
            cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
            finalCanvas = cropCanvas;
          }
        }

        // Generate Data URL (PNG if transparent, else JPEG)
        const targetBytes = targetKb > 0 ? targetKb * 1024 : 0;
        let dataUrl = '';

        if (makeTransparent) {
          // PNG export
          dataUrl = finalCanvas.toDataURL('image/png');
          let bytes = Math.round((dataUrl.length - 22) * 0.75);

          // If target size is set and PNG exceeds it, downscale dimensions
          if (targetBytes > 0 && bytes > targetBytes) {
            let scale = 0.9;
            while (bytes > targetBytes && scale >= 0.35) {
              const scCanvas = document.createElement('canvas');
              scCanvas.width = Math.max(80, Math.round(finalCanvas.width * scale));
              scCanvas.height = Math.max(30, Math.round(finalCanvas.height * scale));
              const scCtx = scCanvas.getContext('2d');
              if (scCtx) {
                scCtx.drawImage(finalCanvas, 0, 0, scCanvas.width, scCanvas.height);
                dataUrl = scCanvas.toDataURL('image/png');
                bytes = Math.round((dataUrl.length - 22) * 0.75);
              }
              scale -= 0.08;
            }
          }
        } else {
          // Target file size compression if JPEG
          if (targetBytes > 0) {
            let low = 0.08;
            let high = 0.98;
            for (let k = 0; k < 8; k++) {
              const q = (low + high) / 2;
              dataUrl = finalCanvas.toDataURL('image/jpeg', q);
              const bytes = Math.round((dataUrl.length - 22) * 0.75);
              if (bytes > targetBytes) high = q;
              else low = q;
            }
            // If still larger at lowest quality, scale down slightly
            let bytes = Math.round((dataUrl.length - 22) * 0.75);
            if (bytes > targetBytes) {
              let scale = 0.85;
              while (bytes > targetBytes && scale >= 0.35) {
                const scCanvas = document.createElement('canvas');
                scCanvas.width = Math.max(80, Math.round(finalCanvas.width * scale));
                scCanvas.height = Math.max(30, Math.round(finalCanvas.height * scale));
                const scCtx = scCanvas.getContext('2d');
                if (scCtx) {
                  scCtx.fillStyle = '#ffffff';
                  scCtx.fillRect(0, 0, scCanvas.width, scCanvas.height);
                  scCtx.drawImage(finalCanvas, 0, 0, scCanvas.width, scCanvas.height);
                  dataUrl = scCanvas.toDataURL('image/jpeg', 0.75);
                  bytes = Math.round((dataUrl.length - 22) * 0.75);
                }
                scale -= 0.12;
              }
            }
          } else {
            dataUrl = finalCanvas.toDataURL('image/jpeg', 0.94);
          }
        }

        const approxBytes = Math.round((dataUrl.length - 22) * 0.75);
        setFileSizeKb(Math.round(approxBytes / 1024));
        setPreviewUrl(dataUrl);
      } finally {
        setIsProcessing(false);
      }
    };
    img.src = imageUrl;
  }, [imageUrl, threshold, contrastBoost, makeTransparent, inkColor, autoCrop, rotation, targetKb, removeRuledLines]);

  useEffect(() => {
    processSignature();
  }, [processSignature]);

  const downloadSignature = async (format: 'png' | 'jpg' | 'pdf' | 'svg') => {
    if (!previewUrl) return;

    if (format === 'png' || format === 'jpg') {
      const a = document.createElement('a');
      a.href = previewUrl;
      a.download = `clean_signature_${makeTransparent ? 'transparent' : 'white_bg'}.${format}`;
      a.click();
    } else if (format === 'svg') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 200" width="100%" height="100%"><image href="${previewUrl}" width="500" height="200" /></svg>`;
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'signature_vector.svg';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } else if (format === 'pdf') {
      setIsProcessing(true);
      try {
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([500, 300]);
        const imgBytes = dataUrlToBytes(previewUrl);

        let embeddedImg;
        if (makeTransparent) {
          embeddedImg = await pdfDoc.embedPng(imgBytes);
        } else {
          embeddedImg = await pdfDoc.embedJpg(imgBytes);
        }
        const dims = embeddedImg.scale(0.8);

        page.drawImage(embeddedImg, {
          x: (500 - dims.width) / 2,
          y: (300 - dims.height) / 2,
          width: dims.width,
          height: dims.height,
        });

        const pdfBytes = toArrayBufferBytes(await pdfDoc.save());
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'clean_signature.pdf';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  return (
    <ToolWorkspaceShell
      title="Clean Paper Signature (White / Transparent Sign)"
      subtitle="Apne phone se kagaz par ki gayi signature ki photo upload karein — shadows, wrinkles aur yellow background hatakar pure white ya transparent digital sign banayein."
      categoryLabel="Paper Photo to Clean Digital Signature"
      icon={Contrast}
      microVariant="sign"
      tone="indigo"
    >

      {!imageUrl ? (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-xl mx-auto p-6 sm:p-8 pms-glass-panel rounded-3xl text-center"
        >
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-[var(--pms-border-strong)] hover:border-rose-400 dark:hover:border-rose-500 rounded-2xl p-10 cursor-pointer transition-all bg-[var(--pms-white)] hover:bg-[var(--pms-soft-rose)]/40">
            <div className="w-16 h-16 rounded-2xl bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] flex items-center justify-center mb-4">
              <Upload className="w-8 h-8" />
            </div>
            <span className="text-base font-bold" style={{ color: 'var(--pms-ink)' }}>
              Upload Phone Photo of Signature
            </span>
            <span className="text-xs mt-1.5" style={{ color: 'var(--pms-muted)' }}>
              Supports JPG, PNG, WEBP (Photo taken on paper / notebook)
            </span>
            <span className="mt-5 px-6 py-2.5 rounded-full text-xs font-bold pms-btn-primary">
              Select Signature Photo
            </span>
            <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
          </label>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left text-xs">
            <div className="p-3.5 rounded-2xl border border-[var(--pms-border)] bg-[var(--pms-white)]">
              <span className="font-bold flex items-center gap-1.5 mb-1" style={{ color: 'var(--pms-ink)' }}>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Transparent PNG
              </span>
              <span style={{ color: 'var(--pms-muted)' }}>
                Use directly on official letters, invoices, and PDF documents.
              </span>
            </div>
            <div className="p-3.5 rounded-2xl border border-[var(--pms-border)] bg-[var(--pms-white)]">
              <span className="font-bold flex items-center gap-1.5 mb-1" style={{ color: 'var(--pms-ink)' }}>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Pure White Background
              </span>
              <span style={{ color: 'var(--pms-muted)' }}>
                Perfect for SSC, UPSC, and Bank exam upload portals (10KB - 20KB).
              </span>
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
        >
          {/* Controls Column (6 cols) */}
          <div className="lg:col-span-6 space-y-5">
            <div className="pms-glass-panel rounded-3xl p-5 sm:p-6 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--pms-border)]">
                <h2 className="text-sm font-extrabold flex items-center gap-2" style={{ color: 'var(--pms-ink)' }}>
                  <Sliders className="w-4 h-4 text-[var(--pms-violet)]" /> Signature Enhancement Controls
                </h2>
                <button
                  type="button"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[var(--pms-white)] border border-[var(--pms-border)] hover:border-rose-300 dark:hover:border-rose-700 rounded-xl transition-colors cursor-pointer"
                  style={{ color: 'var(--pms-ink)' }}
                >
                  <RotateCw className="w-3.5 h-3.5" /> Rotate 90°
                </button>
              </div>

              {imageFile && (
                <div className="text-xs px-3 py-2 rounded-xl border border-[var(--pms-border)] bg-[var(--pms-white)] flex items-center justify-between gap-2">
                  <span className="font-semibold truncate" style={{ color: 'var(--pms-ink)' }}>{imageFile.name}</span>
                  <span className="font-mono shrink-0" style={{ color: 'var(--pms-muted)' }}>
                    {(imageFile.size / 1024).toFixed(1)} KB
                  </span>
                </div>
              )}

              {/* Background Format Toggle */}
              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: 'var(--pms-ink)' }}>
                  Output Background Mode:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMakeTransparent(true)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                      makeTransparent
                        ? 'bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] border-rose-300 dark:border-rose-700 shadow-xs'
                        : 'bg-[var(--pms-white)] border-[var(--pms-border)] hover:border-[var(--pms-border-strong)]'
                    }`}
                    style={!makeTransparent ? { color: 'var(--pms-muted)' } : undefined}
                  >
                    Transparent PNG (No Background)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMakeTransparent(false)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                      !makeTransparent
                        ? 'bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] border-rose-300 dark:border-rose-700 shadow-xs'
                        : 'bg-[var(--pms-white)] border-[var(--pms-border)] hover:border-[var(--pms-border-strong)]'
                    }`}
                    style={makeTransparent ? { color: 'var(--pms-muted)' } : undefined}
                  >
                    Pure White Background (#FFFFFF)
                  </button>
                </div>
              </div>

              {/* Ink Color Selector */}
              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: 'var(--pms-ink)' }}>
                  Signature Ink Color:
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'black', label: 'Dark Black', color: 'bg-black' },
                    { id: 'royal_blue', label: 'Royal Blue', color: 'bg-blue-600' },
                    { id: 'navy_blue', label: 'Navy Blue', color: 'bg-blue-900' },
                    { id: 'original', label: 'Original Ink', color: 'bg-gray-500' },
                  ].map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setInkColor(c.id as InkColorChoice)}
                      className={`p-2.5 rounded-xl text-xs font-semibold border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                        inkColor === c.id
                          ? 'border-[var(--pms-violet)] bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)]'
                          : 'border-[var(--pms-border)] bg-[var(--pms-white)] hover:border-[var(--pms-border-strong)]'
                      }`}
                      style={inkColor !== c.id ? { color: 'var(--pms-muted)' } : undefined}
                    >
                      <span className={`w-4 h-4 rounded-full ${c.color} ring-2 ring-white dark:ring-slate-800 shadow-xs`}></span>
                      <span className="text-[11px]">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Clean Paper Threshold Slider */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold flex items-center gap-1.5" style={{ color: 'var(--pms-ink)' }}>
                    <Contrast className="w-3.5 h-3.5 text-[var(--pms-rose)]" /> Shadow & Background Eraser
                  </label>
                  <span className="text-xs font-mono font-bold text-[var(--pms-rose)]">{threshold}</span>
                </div>
                <input
                  type="range"
                  min="120"
                  max="240"
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full accent-rose-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] mt-0.5" style={{ color: 'var(--pms-subtle-text)' }}>
                  <span>Keep more ink strokes</span>
                  <span>Erase heavy paper shadows</span>
                </div>
              </div>

              {/* Ink Darkening / Sharpness */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold" style={{ color: 'var(--pms-ink)' }}>
                    Ink Sharpness & Darkness
                  </label>
                  <span className="text-xs font-mono font-bold text-[var(--pms-violet)]">+{contrastBoost}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="80"
                  value={contrastBoost}
                  onChange={(e) => setContrastBoost(Number(e.target.value))}
                  className="w-full accent-violet-600 cursor-pointer"
                />
              </div>

              {/* Auto Crop Whitespace */}
              <div className="flex items-center justify-between pt-2 border-t border-[var(--pms-border)]">
                <span className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--pms-ink)' }}>
                  <Crop className="w-4 h-4 text-[var(--pms-muted)]" /> Auto-Crop Margins (Focus on Signature)
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoCrop}
                    onChange={(e) => setAutoCrop(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-gray-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
                </label>
              </div>

              {/* Strip Notebook Ruled Lines */}
              <div className="flex items-center justify-between pt-2 border-t border-[var(--pms-border)]">
                <span className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--pms-ink)' }}>
                  <Sparkles className="w-4 h-4 text-[var(--pms-violet)]" /> Strip Notebook Lines (Copy Ruled Paper)
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={removeRuledLines}
                    onChange={(e) => setRemoveRuledLines(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-gray-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
                </label>
              </div>

              {/* Target File Size Controls */}
              <div className="pt-3 border-t border-[var(--pms-border)] space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold flex items-center gap-1.5" style={{ color: 'var(--pms-ink)' }}>
                    <Target className="w-3.5 h-3.5 text-[var(--pms-rose)]" /> Target File Size Limit:
                  </label>
                  <span className="text-xs font-mono font-bold text-[var(--pms-rose)]">
                    {targetKb === 0 ? 'Max Quality (No Limit)' : `≤ ${targetKb} KB`}
                  </span>
                </div>

                {/* Preset Chips */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setTargetKb(0);
                      setIsCustomKb(false);
                    }}
                    className={`text-xs px-2.5 py-1.5 rounded-xl border font-bold transition-all cursor-pointer ${
                      targetKb === 0
                        ? 'bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] border-rose-300 dark:border-rose-700'
                        : 'bg-[var(--pms-white)] border-[var(--pms-border)] hover:border-[var(--pms-border-strong)]'
                    }`}
                    style={targetKb !== 0 ? { color: 'var(--pms-muted)' } : undefined}
                  >
                    Original (No Limit)
                  </button>

                  {[10, 20, 30, 50].map((kb) => (
                    <button
                      key={kb}
                      type="button"
                      onClick={() => {
                        setTargetKb(kb);
                        setIsCustomKb(false);
                        setCustomKbValue(String(kb));
                      }}
                      className={`text-xs px-2.5 py-1.5 rounded-xl border font-bold transition-all cursor-pointer ${
                        targetKb === kb && !isCustomKb
                          ? 'bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] border-rose-300 dark:border-rose-700'
                          : 'bg-[var(--pms-white)] border-[var(--pms-border)] hover:border-[var(--pms-border-strong)]'
                      }`}
                      style={!(targetKb === kb && !isCustomKb) ? { color: 'var(--pms-muted)' } : undefined}
                    >
                      {kb} KB
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomKb(true);
                      setTargetKb(Number(customKbValue) || 20);
                    }}
                    className={`text-xs px-2.5 py-1.5 rounded-xl border font-bold transition-all cursor-pointer ${
                      isCustomKb
                        ? 'bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] border-rose-300 dark:border-rose-700'
                        : 'bg-[var(--pms-white)] border-[var(--pms-border)] hover:border-[var(--pms-border-strong)]'
                    }`}
                    style={!isCustomKb ? { color: 'var(--pms-muted)' } : undefined}
                  >
                    Custom KB ✏️
                  </button>
                </div>

                {/* Custom Input & Slider when Custom KB is active */}
                {isCustomKb && (
                  <div className="p-3 bg-[var(--pms-lavender-surface)] rounded-2xl border border-[var(--pms-border)] space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold" style={{ color: 'var(--pms-ink)' }}>Set Exact Size (KB):</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="5"
                          max="200"
                          value={customKbValue}
                          onChange={(e) => {
                            setCustomKbValue(e.target.value);
                            const n = Number(e.target.value);
                            if (n > 0) setTargetKb(n);
                          }}
                          className="w-20 px-2 py-1 text-xs font-black text-center bg-[var(--pms-white)] border border-[var(--pms-border-strong)] rounded-lg focus:border-rose-500 outline-none"
                          style={{ color: 'var(--pms-ink)' }}
                        />
                        <span className="text-xs font-bold" style={{ color: 'var(--pms-muted)' }}>KB</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="150"
                      value={targetKb || 20}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setTargetKb(val);
                        setCustomKbValue(String(val));
                      }}
                      className="w-full accent-rose-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px]" style={{ color: 'var(--pms-subtle-text)' }}>
                      <span>5 KB (Tiny)</span>
                      <span>50 KB</span>
                      <span>150 KB (High Res)</span>
                    </div>
                  </div>
                )}

                {/* Official Exam Portals Shortcuts */}
                <div className="pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--pms-subtle-text)' }}>
                    Official Exam Portal Shortcuts:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { name: '🏛️ SSC (10-20 KB)', kb: 18 },
                      { name: '🇮🇳 UPSC (20-50 KB)', kb: 40 },
                      { name: '🏦 Bank/IBPS (10-20 KB)', kb: 15 },
                      { name: '🎯 NTA/NEET (4-30 KB)', kb: 20 },
                    ].map((exam) => (
                      <button
                        key={exam.name}
                        type="button"
                        onClick={() => {
                          setTargetKb(exam.kb);
                          setIsCustomKb(false);
                          setCustomKbValue(String(exam.kb));
                        }}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                          targetKb === exam.kb && !isCustomKb
                            ? 'bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] border-violet-300 dark:border-violet-700 font-bold'
                            : 'bg-[var(--pms-white)] border-[var(--pms-border)] hover:border-violet-300 dark:hover:border-violet-700'
                        }`}
                        style={!(targetKb === exam.kb && !isCustomKb) ? { color: 'var(--pms-muted)' } : undefined}
                      >
                        {exam.name}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-[11px]" style={{ color: 'var(--pms-muted)' }}>
                  {makeTransparent
                    ? 'Transparent PNG dimensions will adapt smoothly to meet portal size limits.'
                    : 'White background JPG will dial in exact compression to fit portal guidelines.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setImageFile(null);
                setImageUrl(null);
                setPreviewUrl(null);
              }}
              className="text-xs hover:text-rose-600 dark:hover:text-rose-400 font-semibold px-2 cursor-pointer transition-colors"
              style={{ color: 'var(--pms-muted)' }}
            >
              ← Upload a different signature photo
            </button>
          </div>

          {/* Preview & Download Column (6 cols) */}
          <div className="lg:col-span-6 space-y-5 lg:sticky lg:top-8">
            <div className="relative pms-glass-panel rounded-3xl p-5 sm:p-6 overflow-hidden min-h-[420px]">
              <PearlScanOverlay active={isProcessing} label="Cleaning shadows & sharpening ink…" />

              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--pms-ink)' }}>
                  Live Clean Signature Preview
                </span>
                <div className="flex items-center gap-2">
                  {fileSizeKb !== null && (
                    <span className="text-xs font-mono font-bold px-2.5 py-0.5 bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300 rounded-full border border-emerald-200 dark:border-emerald-800">
                      ~<AnimatedNumber value={fileSizeKb} suffix=" KB" />
                    </span>
                  )}
                  {targetKb > 0 && fileSizeKb !== null && (
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                      fileSizeKb <= targetKb + 3
                        ? 'bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                    }`}>
                      {fileSizeKb <= targetKb + 3 ? '✓ Within' : '⚠ Target'} ≤ {targetKb} KB
                    </span>
                  )}
                </div>
              </div>

              {/* Preview Container (kept light so ink/paper preview remains true) */}
              <div
                className={`p-6 rounded-2xl flex items-center justify-center min-h-[260px] border border-[var(--pms-border)] overflow-hidden ${
                  makeTransparent
                    ? 'bg-white pms-checkerboard'
                    : 'bg-white'
                }`}
              >
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="Processed Clean Signature"
                    className="max-h-[220px] max-w-full object-contain filter drop-shadow-xs"
                  />
                )}
              </div>

              {/* Download Buttons */}
              <div className="mt-5 space-y-2.5">
                <motion.button
                  whileHover={prefersReduced || !previewUrl ? undefined : { scale: 1.01 }}
                  whileTap={prefersReduced || !previewUrl ? undefined : { scale: 0.985 }}
                  type="button"
                  onClick={() => downloadSignature(makeTransparent ? 'png' : 'jpg')}
                  disabled={!previewUrl}
                  className="w-full py-3.5 pms-btn-primary font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  {makeTransparent ? 'Download Transparent PNG Signature' : 'Download Clean White JPG (10-20KB)'}
                </motion.button>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => downloadSignature('jpg')}
                    disabled={!previewUrl}
                    className="py-2.5 bg-[var(--pms-white)] border border-[var(--pms-border)] hover:border-rose-300 dark:hover:border-rose-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                    style={{ color: 'var(--pms-ink)' }}
                  >
                    Download JPG
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadSignature('svg')}
                    disabled={!previewUrl}
                    className="py-2.5 bg-[var(--pms-soft-lavender)] border border-[var(--pms-border)] hover:border-violet-400 text-[var(--pms-violet)] text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Vector SVG
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadSignature('pdf')}
                    disabled={!previewUrl}
                    className="py-2.5 bg-[var(--pms-white)] border border-[var(--pms-border)] hover:border-rose-300 dark:hover:border-rose-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                    style={{ color: 'var(--pms-ink)' }}
                  >
                    Download PDF
                  </button>
                </div>
              </div>

              {/* Trust badge */}
              <div className="mt-4 pt-3 border-t border-[var(--pms-border)] flex items-center justify-center gap-1.5 text-[11px]" style={{ color: 'var(--pms-muted)' }}>
                <Shield className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>100% Private: Processed entirely on your phone/computer</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Guide Section */}
      <div className="mt-16 border-t border-[var(--pms-border)] pt-10">
        <h2 className="text-2xl font-bold mb-6 text-center" style={{ color: 'var(--pms-ink)' }}>
          How to Get the Best Clean Signature from Your Phone
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div className="p-5 pms-glass-panel rounded-2xl">
            <h3 className="font-bold mb-2" style={{ color: 'var(--pms-ink)' }}>1. Use Plain White Paper</h3>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--pms-muted)' }}>
              Sign on unlined blank white paper using dark black or blue ballpoint/gel pen. Avoid ruled notebook lines for the sharpest scan.
            </p>
          </div>
          <div className="p-5 pms-glass-panel rounded-2xl">
            <h3 className="font-bold mb-2" style={{ color: 'var(--pms-ink)' }}>2. Avoid Hand Shadows</h3>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--pms-muted)' }}>
              Keep the paper near a window or well-lit desk. Hold phone directly parallel over the signature without casting your body’s shadow.
            </p>
          </div>
          <div className="p-5 pms-glass-panel rounded-2xl">
            <h3 className="font-bold mb-2" style={{ color: 'var(--pms-ink)' }}>3. Auto Background Removal</h3>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--pms-muted)' }}>
              Our intelligent canvas engine automatically detects background pixels, erases shadows, and crops exactly around your ink strokes.
            </p>
          </div>
        </div>
      </div>

      {/* SEO Guide & Signature FAQs */}
      <ToolSEOSection
        toolName="Clean Signature"
        headline="Free Online Paper Signature Cleaner — Transparent PNG & White Background"
        description="Convert photos of handwritten ink signatures into clean digital assets. Remove yellow paper tints, camera shadows, and lined notebook marks. Export as transparent PNG, pure white JPG, scalable vector SVG, or PDF under 20 KB."
        steps={[
          {
            step: '01',
            title: 'Snap & Upload Paper Sign',
            desc: 'Take a photo of your handwritten signature with your phone and upload it here.',
          },
          {
            step: '02',
            title: 'Auto-Clean & Boost Contrast',
            desc: 'Our canvas filter eliminates dark shadows, whitens background paper, and sharpens ink strokes.',
          },
          {
            step: '03',
            title: 'Pick Ink Color & Download',
            desc: 'Select Black, Royal Blue, or Navy Blue ink, set target KB (10KB - 20KB for exams), and download.',
          },
        ]}
        faqs={[
          {
            q: 'How do I get a transparent background signature without Photoshop?',
            a: 'Simply check the "Make Background Transparent" option! The tool instantly replaces the white/gray paper with transparency, allowing you to paste your signature onto any contract or PDF.',
          },
          {
            q: 'Will government job portals accept this digital signature?',
            a: 'Yes! Portals like SSC, UPSC, NTA, IBPS, and State PSCs require clean signatures on a pure white background between 10 KB and 20 KB. This tool is built specifically to meet those official criteria.',
          },
          {
            q: 'Can I change my blue ballpen signature into dark black ink?',
            a: 'Yes. Use the Ink Color selector to switch between Original Ink, Dark Black, Royal Blue, or Navy Blue with 1-click.',
          },
          {
            q: 'Is my handwritten signature kept private?',
            a: 'Yes, 100%. All image thresholding, cropping, and background removal occurs directly inside your browser canvas. No signature data is uploaded to any server.',
          },
        ]}
        relatedTools={[
          { name: 'Sarkari Photo & Sign', path: '/sarkari-photo-signature', desc: 'Join photo and sign with candidate name and date of photo (DOP)' },
          { name: 'Signature Pad', path: '/signature-pad', desc: 'Draw a smooth handwritten signature directly with your finger or stylus' },
          { name: 'Crop Image', path: '/image-crop', desc: 'Crop images and signatures with custom bounding boxes' },
          { name: 'Exact Image Size (KB)', path: '/exact-image-size', desc: 'Compress signature to strict 10KB - 20KB portal limits' },
        ]}
      />
    </ToolWorkspaceShell>
  );
}
