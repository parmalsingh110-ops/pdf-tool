import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Download, Shield, EyeOff, Sparkles, CheckCircle2, AlertTriangle, Plus, Trash2, Move, FileText, Lock } from 'lucide-react';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { PDFDocument } from 'pdf-lib';
import { dataUrlToBytes } from '../lib/utils';

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

  const [isProcessing, setIsProcessing] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

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
      const arrayBuffer = await uploadedFile.arrayBuffer();
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url
      ).toString();

      try {
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        const pdfDoc = await loadingTask.promise;
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
        alert('Could not render PDF. If it is password protected, please unlock it first using our Unlock PDF tool.');
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

  // Pointer dragging handlers for mask boxes
  const handleMouseDown = (e: React.MouseEvent, maskId: string) => {
    e.preventDefault();
    setSelectedMaskId(maskId);
    draggingMaskId.current = maskId;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
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

  const handleMouseUp = () => {
    draggingMaskId.current = null;
    dragStartPos.current = null;
  };

  // Generate Masked Canvas & Export
  const generateMaskedOutput = async (format: 'pdf' | 'jpg') => {
    if (!renderedImageUrl) return;

    setIsProcessing(true);
    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise((resolve) => {
      img.onload = resolve;
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
      a.click();
    } else {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([canvas.width * 0.5, canvas.height * 0.5]);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const imgBytes = dataUrlToBytes(dataUrl);
      const jpgImg = await pdfDoc.embedJpg(imgBytes);

      page.drawImage(jpgImg, {
        x: 0,
        y: 0,
        width: canvas.width * 0.5,
        height: canvas.height * 0.5,
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `masked_aadhaar_${Date.now()}.pdf`;
      a.click();
    }

    setIsProcessing(false);
  };

  const selectedMask = masks.find((m) => m.id === selectedMaskId);

  return (
    <div className="flex-1 max-w-6xl mx-auto px-4 py-8 w-full">
      {/* Title */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-800 rounded-full text-xs font-semibold mb-3 border border-emerald-200">
          <Shield className="w-3.5 h-3.5 text-emerald-600" /> UIDAI & RBI Compliant Masking
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3 tracking-tight">
          Masked Aadhaar Card Maker (Mask First 8 Digits)
        </h1>
        <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto">
          Hide first 8 digits (XXXX-XXXX-1234) and QR code on Aadhaar image or PDF. Safe for hotels, SIM verification, and exam KYC without exposing full Aadhaar number.
        </p>
      </div>

      {!renderedImageUrl ? (
        <div className="max-w-xl mx-auto p-8 bg-white border border-gray-200 rounded-2xl shadow-xs text-center">
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-2xl p-10 cursor-pointer transition-colors bg-emerald-50/20 hover:bg-emerald-50/40">
            <Lock className="w-12 h-12 text-emerald-600 mb-3" />
            <span className="text-base font-bold text-gray-800">
              Upload Aadhaar Card (Image or PDF)
            </span>
            <span className="text-xs text-gray-500 mt-1">
              Supports JPG, PNG, PDF • 100% Client-Side Privacy Guarantee
            </span>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          <div className="mt-6 p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl text-left text-xs text-emerald-950 flex items-start gap-2.5">
            <Shield className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
            <div>
              <p className="font-bold mb-0.5">UIDAI & RBI Advisory:</p>
              <p className="text-emerald-800 leading-relaxed">
                As per UIDAI guidelines, organizations cannot demand unmasked Aadhaar. You have the legal right to submit Masked Aadhaar where only the last 4 digits are visible.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Visual Masking Canvas (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span className="font-semibold flex items-center gap-1.5">
                <Move className="w-4 h-4 text-emerald-600" /> Drag mask box over the 8 digits
              </span>
              <span className="text-[11px] text-gray-400">Click mask box to select & resize</span>
            </div>

            {/* Document Workspace with Draggable Overlays */}
            <div
              ref={imageContainerRef}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              className="relative border-2 border-dashed border-gray-300 rounded-2xl overflow-hidden bg-gray-100 select-none shadow-inner"
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
                  onMouseDown={(e) => handleMouseDown(e, mask.id)}
                  style={{
                    left: `${mask.xPercent}%`,
                    top: `${mask.yPercent}%`,
                    width: `${mask.wPercent}%`,
                    height: `${mask.hPercent}%`,
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

            <div className="flex gap-2">
              <button
                type="button"
                onClick={addExtraMask}
                className="px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 rounded-xl text-xs font-semibold text-gray-700 flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" /> Add Another Mask Box
              </button>
              <button
                type="button"
                onClick={addQrMask}
                className="px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 rounded-xl text-xs font-semibold text-gray-700 flex items-center gap-1.5 shadow-xs"
              >
                <EyeOff className="w-3.5 h-3.5 text-red-500" /> Redact QR Code
              </button>
            </div>
          </div>

          {/* Mask Controls & Download (5 cols) */}
          <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-8">
            <div className="p-5 bg-white border border-gray-200 rounded-2xl shadow-xs space-y-5">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-600" /> Mask Box Customization
              </h2>

              {selectedMask ? (
                <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
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
                          className={`p-2 text-xs font-medium rounded-lg border text-left ${
                            selectedMask.style === st.id
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
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
                      <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                        <span>Width</span>
                        <span className="font-mono text-gray-500">{Math.round(selectedMask.wPercent)}%</span>
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
                      <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                        <span>Height</span>
                        <span className="font-mono text-gray-500">{Math.round(selectedMask.hPercent)}%</span>
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
                    className="text-xs text-red-600 hover:text-red-700 font-semibold flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove this mask
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-500">Select a mask on the preview to adjust.</p>
              )}

              {/* KYC Purpose Watermark */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-600" /> Anti-Fraud KYC Watermark
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeKycWatermark}
                      onChange={(e) => setIncludeKycWatermark(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                {includeKycWatermark && (
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1">
                      Custom Purpose Text:
                    </label>
                    <input
                      type="text"
                      value={kycPurposeText}
                      onChange={(e) => setKycPurposeText(e.target.value)}
                      placeholder="e.g. FOR HOTEL CHECK-IN ONLY"
                      className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none uppercase"
                    />
                  </div>
                )}
              </div>

              {/* Export Buttons */}
              <div className="space-y-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => generateMaskedOutput('pdf')}
                  disabled={isProcessing}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4" /> Download Masked Aadhaar PDF
                </button>
                <button
                  type="button"
                  onClick={() => generateMaskedOutput('jpg')}
                  disabled={isProcessing}
                  className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold rounded-xl border border-gray-200 transition-colors"
                >
                  Download as Masked JPG
                </button>
              </div>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setRenderedImageUrl(null);
                  }}
                  className="text-xs text-gray-500 hover:text-red-600 font-medium"
                >
                  ← Upload another document
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compliance Information */}
      <div className="mt-16 border-t border-gray-200 pt-10 text-gray-800">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-900">
          Why Should You Always Use Masked Aadhaar?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-xs">
            <h3 className="font-bold text-gray-900 mb-2">1. Prevents Identity Fraud</h3>
            <p className="text-gray-600 text-xs leading-relaxed">
              Sharing your full 12-digit Aadhaar number with unknown vendors, hotels, or rental agencies increases identity theft risk. Masked Aadhaar conceals the first 8 digits.
            </p>
          </div>
          <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-xs">
            <h3 className="font-bold text-gray-900 mb-2">2. Legally Valid Everywhere</h3>
            <p className="text-gray-600 text-xs leading-relaxed">
              Under RBI and UIDAI directives, all non-banking entities are mandated to accept Masked Aadhaar with the last 4 digits visible as valid photo ID proof.
            </p>
          </div>
          <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-xs">
            <h3 className="font-bold text-gray-900 mb-2">3. Zero Data Storage</h3>
            <p className="text-gray-600 text-xs leading-relaxed">
              Our masking engine runs 100% locally in your web browser. Neither your Aadhaar image nor your demographic details ever leave your device.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
