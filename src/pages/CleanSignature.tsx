import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Download, Sparkles, Sliders, Shield, Crop, Contrast, CheckCircle2, RotateCw } from 'lucide-react';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { PDFDocument } from 'pdf-lib';

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

  // Target size
  const [targetKb, setTargetKb] = useState<number>(20); // 20 KB default for exam portals
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileSizeKb, setFileSizeKb] = useState<number | null>(null);

  const sourceImgRef = useRef<HTMLImageElement | null>(null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const url = URL.createObjectURL(file);
      setImageUrl(url);
    }
  };

  // Image Processing Pipeline
  const processSignature = useCallback(() => {
    if (!imageUrl) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
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

        // If luminance > threshold, it's paper background
        if (lum > threshold) {
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
      const mime = makeTransparent ? 'image/png' : 'image/jpeg';
      let dataUrl = finalCanvas.toDataURL(mime, 0.92);

      // Target file size compression if JPEG
      if (!makeTransparent && targetKb > 0) {
        const targetBytes = targetKb * 1024;
        let low = 0.1;
        let high = 0.98;
        for (let k = 0; k < 6; k++) {
          const q = (low + high) / 2;
          dataUrl = finalCanvas.toDataURL('image/jpeg', q);
          const bytes = Math.round((dataUrl.length - 22) * 0.75);
          if (bytes > targetBytes) high = q;
          else low = q;
        }
      }

      const approxBytes = Math.round((dataUrl.length - 22) * 0.75);
      setFileSizeKb(Math.round(approxBytes / 1024));
      setPreviewUrl(dataUrl);
    };
    img.src = imageUrl;
  }, [imageUrl, threshold, contrastBoost, makeTransparent, inkColor, autoCrop, rotation, targetKb]);

  useEffect(() => {
    processSignature();
  }, [processSignature]);

  const downloadSignature = async (format: 'png' | 'jpg' | 'pdf') => {
    if (!previewUrl) return;

    if (format === 'png' || format === 'jpg') {
      const a = document.createElement('a');
      a.href = previewUrl;
      a.download = `clean_signature_${makeTransparent ? 'transparent' : 'white_bg'}.${format}`;
      a.click();
    } else if (format === 'pdf') {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([500, 300]);
      const imgBytes = await fetch(previewUrl).then((r) => r.arrayBuffer());

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

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'clean_signature.pdf';
      a.click();
    }
  };

  return (
    <div className="flex-1 max-w-6xl mx-auto px-4 py-8 w-full">
      {/* Title */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold mb-3 border border-indigo-200">
          <Sparkles className="w-3.5 h-3.5" /> Paper Photo to Clean Digital Signature
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3 tracking-tight">
          Clean Paper Signature (White / Transparent Sign)
        </h1>
        <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto">
          Apne phone se kagaz par ki gayi signature ki photo upload karein — shadows, wrinkles aur yellow background hatakar pure white ya transparent digital sign banayein.
        </p>
      </div>

      {!imageUrl ? (
        <div className="max-w-xl mx-auto p-8 bg-white border border-gray-200 rounded-2xl shadow-xs text-center">
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-indigo-300 hover:border-indigo-500 rounded-2xl p-10 cursor-pointer transition-colors bg-indigo-50/20 hover:bg-indigo-50/40">
            <Upload className="w-12 h-12 text-indigo-500 mb-3" />
            <span className="text-base font-bold text-gray-800">
              Upload Phone Photo of Signature
            </span>
            <span className="text-xs text-gray-500 mt-1">
              Supports JPG, PNG, WEBP (Photo taken on paper / notebook)
            </span>
            <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
          </label>

          <div className="mt-6 grid grid-cols-2 gap-3 text-left text-xs text-gray-600">
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
              <span className="font-bold text-gray-800 block mb-1">✅ Transparent PNG:</span>
              Use directly on official letters, invoices, and PDF documents.
            </div>
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
              <span className="font-bold text-gray-800 block mb-1">✅ Pure White Background:</span>
              Perfect for SSC, UPSC, and Bank exam upload portals (10KB - 20KB).
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Controls Column (6 cols) */}
          <div className="lg:col-span-6 space-y-6">
            <div className="p-5 bg-white border border-gray-200 rounded-2xl shadow-xs space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-600" /> Signature Enhancement Controls
                </h2>
                <button
                  type="button"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <RotateCw className="w-3.5 h-3.5" /> Rotate 90°
                </button>
              </div>

              {/* Background Format Toggle */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  Output Background Mode:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMakeTransparent(true)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all border ${
                      makeTransparent
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    Transparent PNG (No Background)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMakeTransparent(false)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all border ${
                      !makeTransparent
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    Pure White Background (#FFFFFF)
                  </button>
                </div>
              </div>

              {/* Ink Color Selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
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
                      className={`p-2 rounded-xl text-xs font-semibold border flex flex-col items-center gap-1.5 transition-all ${
                        inkColor === c.id
                          ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900'
                          : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full ${c.color} shadow-xs`}></span>
                      <span className="text-[11px]">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Clean Paper Threshold Slider */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                    <Contrast className="w-3.5 h-3.5 text-indigo-600" /> Shadow & Background Eraser
                  </label>
                  <span className="text-xs font-mono text-gray-500">{threshold}</span>
                </div>
                <input
                  type="range"
                  min="120"
                  max="240"
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                  <span>Keep more ink strokes</span>
                  <span>Erase heavy paper shadows</span>
                </div>
              </div>

              {/* Ink Darkening / Sharpness */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-gray-700">
                    Ink Sharpness & Darkness
                  </label>
                  <span className="text-xs font-mono text-gray-500">+{contrastBoost}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="80"
                  value={contrastBoost}
                  onChange={(e) => setContrastBoost(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              {/* Auto Crop Whitespace */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <span className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                  <Crop className="w-4 h-4 text-gray-500" /> Auto-Crop Margins (Focus on Signature)
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoCrop}
                    onChange={(e) => setAutoCrop(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Target File Size (For White BG mode) */}
              {!makeTransparent && (
                <div className="pt-3 border-t border-gray-100 space-y-2">
                  <label className="block text-xs font-semibold text-gray-700">
                    Target File Size (for Exam Uploads):
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[10, 20, 30, 50].map((kb) => (
                      <button
                        key={kb}
                        type="button"
                        onClick={() => setTargetKb(kb)}
                        className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${
                          targetKb === kb
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-gray-50 text-gray-700 border-gray-200'
                        }`}
                      >
                        {kb} KB
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setImageFile(null);
                setImageUrl(null);
                setPreviewUrl(null);
              }}
              className="text-xs text-gray-500 hover:text-red-600 font-semibold px-2"
            >
              ← Upload a different signature photo
            </button>
          </div>

          {/* Preview & Download Column (6 cols) */}
          <div className="lg:col-span-6 space-y-5 lg:sticky lg:top-8">
            <div className="p-5 bg-white border border-gray-200 rounded-2xl shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Live Clean Signature Preview
                </span>
                {fileSizeKb !== null && (
                  <span className="text-xs font-mono font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200">
                    ~{fileSizeKb} KB
                  </span>
                )}
              </div>

              {/* Preview Container */}
              <div
                className={`p-6 rounded-xl flex items-center justify-center min-h-[260px] border border-gray-200 overflow-hidden ${
                  makeTransparent
                    ? 'bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:12px_12px] bg-slate-50'
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
                <button
                  type="button"
                  onClick={() => downloadSignature(makeTransparent ? 'png' : 'jpg')}
                  disabled={!previewUrl}
                  className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  {makeTransparent ? 'Download Transparent PNG Signature' : 'Download Clean White JPG (10-20KB)'}
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => downloadSignature('jpg')}
                    disabled={!previewUrl}
                    className="py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold rounded-xl border border-gray-200 transition-colors"
                  >
                    Download as JPG
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadSignature('pdf')}
                    disabled={!previewUrl}
                    className="py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold rounded-xl border border-gray-200 transition-colors"
                  >
                    Download as PDF
                  </button>
                </div>
              </div>

              {/* Trust badge */}
              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-center gap-1.5 text-[11px] text-gray-500">
                <Shield className="w-3.5 h-3.5 text-emerald-600" />
                <span>100% Private: Processed entirely on your phone/computer</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Guide Section */}
      <div className="mt-16 border-t border-gray-200 pt-10 text-gray-800">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-900">
          How to Get the Best Clean Signature from Your Phone
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-xs">
            <h3 className="font-bold text-gray-900 mb-2">1. Use Plain White Paper</h3>
            <p className="text-gray-600 text-xs leading-relaxed">
              Sign on unlined blank white paper using dark black or blue ballpoint/gel pen. Avoid ruled notebook lines for the sharpest scan.
            </p>
          </div>
          <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-xs">
            <h3 className="font-bold text-gray-900 mb-2">2. Avoid Hand Shadows</h3>
            <p className="text-gray-600 text-xs leading-relaxed">
              Keep the paper near a window or well-lit desk. Hold phone directly parallel over the signature without casting your body’s shadow.
            </p>
          </div>
          <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-xs">
            <h3 className="font-bold text-gray-900 mb-2">3. Auto Background Removal</h3>
            <p className="text-gray-600 text-xs leading-relaxed">
              Our intelligent canvas engine automatically detects background pixels, erases shadows, and crops exactly around your ink strokes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
