import React, { useState, useRef, useEffect } from 'react';
import {
  Download,
  Stamp,
  Sliders,
  Sparkles,
  Upload,
  CheckCircle2,
  Smartphone,
  Eye,
  RotateCw,
  FileText,
  Palette,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import ShareQrModal from '../components/ShareQrModal';
import { downloadBlob } from '../lib/utils';

type StampShape = 'round_seal' | 'rectangle_box' | 'oval_seal';

export default function RubberStampMaker() {
  useSEO(
    'Digital Rubber Stamp & Round Seal Maker Online — Free Transparent PNG & PDF Stamping',
    'Design custom official circular rubber stamps (Gol Mohar) and rectangular verified stamps online. Choose blue, red or green ink with realistic grunge texture. Download transparent PNG or stamp on PDF.'
  );

  usePageSEO(
    'Digital Rubber Stamp Maker — Custom Round Seal & PDF Stamper',
    'Free online tool to create official round seals, shop stamps, and verified stamps with curved text. Download transparent PNG or stamp directly onto PDF documents.',
    'digital rubber stamp maker, round seal maker online, gol mohar online, custom stamp transparent png, verified stamp online, pdf stamp maker, shop rubber stamp online',
    '/rubber-stamp'
  );

  // Stamp Shape & Settings
  const [shape, setShape] = useState<StampShape>('round_seal');
  const [topText, setTopText] = useState('SHARMA E-MITRA & CSC CENTER');
  const [bottomText, setBottomText] = useState('JAIPUR • RAJASTHAN');
  const [centerText, setCenterText] = useState('AUTHORIZED SIGNATORY');
  const [stampDate, setStampDate] = useState(() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  });

  // Ink & Realism
  const [inkColor, setInkColor] = useState('#1e40af'); // Classic Blue
  const [distressLevel, setDistressLevel] = useState(35); // 0-100 grunge
  const [stampAngle, setStampAngle] = useState(-3); // -15 to +15 deg tilt
  const [inkOpacity, setInkOpacity] = useState(90); // 50-100%

  // Stamp on PDF Mode
  const [attachedPdf, setAttachedPdf] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [stampPosX, setStampPosX] = useState(70); // % from left
  const [stampPosY, setStampPosY] = useState(75); // % from top
  const [stampSize, setStampSize] = useState(140); // px size on PDF
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<'stamp' | 'document'>('stamp');

  const [stampPngUrl, setStampPngUrl] = useState<string | null>(null);
  const [stampCanvas, setStampCanvas] = useState<HTMLCanvasElement | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  // Render Rubber Stamp on Canvas (500 × 500 px high-res)
  useEffect(() => {
    const size = 500;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cx = size / 2;
    const cy = size / 2;

    ctx.clearRect(0, 0, size, size);

    // Apply slight tilt angle
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((stampAngle * Math.PI) / 180);
    ctx.translate(-cx, -cy);

    ctx.strokeStyle = inkColor;
    ctx.fillStyle = inkColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (shape === 'round_seal') {
      const outerR = 210;
      const innerR = 145;

      // Outer Thick Ring
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.stroke();

      // Middle Thin Ring
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR - 10, 0, Math.PI * 2);
      ctx.stroke();

      // Inner Ring
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
      ctx.stroke();

      // Draw Curved Top Text (along upper arc)
      const drawCurvedText = (text: string, radius: number, startAngle: number, endAngle: number, inward: boolean) => {
        ctx.font = 'bold 24px "Arial Black", Impact, sans-serif';
        const chars = text.split('');
        const angleStep = (endAngle - startAngle) / Math.max(1, chars.length - 1);

        chars.forEach((ch, i) => {
          const angle = startAngle + i * angleStep;
          ctx.save();
          ctx.translate(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
          ctx.rotate(angle + (inward ? Math.PI / 2 : -Math.PI / 2));
          ctx.fillText(ch, 0, 0);
          ctx.restore();
        });
      };

      // Top arc (from -150 deg to -30 deg)
      drawCurvedText(topText.toUpperCase(), 175, (-155 * Math.PI) / 180, (-25 * Math.PI) / 180, true);

      // Bottom arc (from 150 deg to 30 deg)
      drawCurvedText(bottomText.toUpperCase(), 175, (155 * Math.PI) / 180, (25 * Math.PI) / 180, false);

      // Center decorative stars
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('★', cx - 180, cy);
      ctx.fillText('★', cx + 180, cy);

      // Center Text & Date
      ctx.font = 'bold 22px "Arial Black", sans-serif';
      ctx.fillText(centerText.toUpperCase(), cx, cy - 25);

      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 100, cy);
      ctx.lineTo(cx + 100, cy);
      ctx.stroke();

      ctx.font = 'bold 20px "Courier New", monospace';
      ctx.fillText(`DATE: ${stampDate}`, cx, cy + 25);
    } else if (shape === 'rectangle_box') {
      // Rectangle Box Stamp
      const boxW = 420;
      const boxH = 220;
      const bX = (size - boxW) / 2;
      const bY = (size - boxH) / 2;

      // Outer border
      ctx.lineWidth = 7;
      ctx.strokeRect(bX, bY, boxW, boxH);

      // Inner border
      ctx.lineWidth = 2;
      ctx.strokeRect(bX + 8, bY + 8, boxW - 16, boxH - 16);

      // Top Header text
      ctx.font = 'bold 26px "Arial Black", Impact, sans-serif';
      ctx.fillText(topText.toUpperCase(), cx, bY + 45);

      // Dividing line
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bX + 20, bY + 80);
      ctx.lineTo(bX + boxW - 20, bY + 80);
      ctx.stroke();

      // Main Center Text
      ctx.font = 'bold 32px "Arial Black", Impact, sans-serif';
      ctx.fillText(centerText.toUpperCase(), cx, bY + 125);

      // Date / Signatory bottom line
      ctx.font = 'bold 18px "Courier New", monospace';
      ctx.fillText(`${bottomText.toUpperCase()} • ${stampDate}`, cx, bY + 175);
    } else {
      // Oval Stamp
      const rx = 210;
      const ry = 140;

      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx - 10, ry - 10, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = 'bold 24px "Arial Black", sans-serif';
      ctx.fillText(topText.toUpperCase(), cx, cy - 50);

      ctx.font = 'bold 28px "Arial Black", Impact, sans-serif';
      ctx.fillText(centerText.toUpperCase(), cx, cy);

      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(bottomText.toUpperCase(), cx, cy + 45);
      ctx.fillText(`DATE: ${stampDate}`, cx, cy + 75);
    }

    ctx.restore();

    // Realistic Distress & Rubber Grunge Texture
    if (distressLevel > 0) {
      const imgData = ctx.getImageData(0, 0, size, size);
      const data = imgData.data;
      const noiseChance = (distressLevel / 100) * 0.28;

      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0) {
          // Semi-random ink dropouts & erosion
          const rand = Math.random();
          if (rand < noiseChance) {
            data[i + 3] = Math.floor(data[i + 3] * (0.2 + Math.random() * 0.4));
          } else {
            // Apply global opacity
            data[i + 3] = Math.floor(data[i + 3] * (inkOpacity / 100));
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }

    setStampCanvas(canvas);
    setStampPngUrl(canvas.toDataURL('image/png'));
  }, [shape, topText, bottomText, centerText, stampDate, inkColor, distressLevel, stampAngle, inkOpacity]);

  // Load PDF if user wants to stamp directly on a document
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setAttachedPdf(selected);

    try {
      const buffer = await selected.arrayBuffer();
      const u8 = new Uint8Array(buffer);
      setPdfBytes(u8);

      const loadingTask = pdfjsLib.getDocument({ data: u8.slice(0) });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
        setPdfPreviewUrl(canvas.toDataURL('image/jpeg'));
        setPreviewTab('document');
      }
    } catch (err) {
      console.error('Error rendering PDF:', err);
    }
  };

  // Download Transparent PNG Stamp
  const handleDownloadPng = () => {
    if (!stampCanvas) return;
    stampCanvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `rubber-stamp-${Date.now()}.png`);
    }, 'image/png');
  };

  // Stamp directly onto attached PDF and download
  const handleDownloadStampedPdf = async () => {
    if (!pdfBytes || !stampCanvas) return;
    setIsProcessing(true);

    try {
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pngBytes = await fetch(stampCanvas.toDataURL('image/png')).then((r) => r.arrayBuffer());
      const pngImage = await pdfDoc.embedPng(pngBytes);

      const page = pdfDoc.getPage(0); // Page 1
      const pW = page.getWidth();
      const pH = page.getHeight();

      const stampW = (stampSize / 500) * 160;
      const stampH = stampW;

      const posX = (stampPosX / 100) * pW - stampW / 2;
      const posY = pH - (stampPosY / 100) * pH - stampH / 2;

      page.drawImage(pngImage, {
        x: posX,
        y: posY,
        width: stampW,
        height: stampH,
      });

      const outBytes = await pdfDoc.save();
      const blob = new Blob([outBytes as any], { type: 'application/pdf' });
      downloadBlob(blob, `stamped-document-${Date.now()}.pdf`);
    } catch (err) {
      console.error('Error stamping PDF:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-10 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-wider">
            <Stamp className="w-4 h-4" /> E-Mitra & Office Special
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Digital Rubber Stamp & Round Seal Maker
          </h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
            Design official circular rubber stamps (Gol Mohar) and rectangular verified seals.
            Download as transparent 300 DPI PNG or stamp directly onto your PDF documents.
          </p>
        </div>

        {/* Editor Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Controls */}
          <div className="lg:col-span-6 space-y-5 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
            {/* Stamp Shape */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Stamp Shape & Format
              </label>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  { id: 'round_seal', label: 'Round Seal (गोल मोहर)' },
                  { id: 'rectangle_box', label: 'Rectangle Box' },
                  { id: 'oval_seal', label: 'Oval Notary Seal' },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setShape(s.id as StampShape)}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition text-center ${
                      shape === s.id
                        ? 'border-blue-500 bg-blue-600 text-white shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Ink Color Picker */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Rubber Stamp Ink Color
              </label>
              <div className="flex gap-2">
                {[
                  { name: 'Classic Blue', hex: '#1e40af' },
                  { name: 'Royal Violet', hex: '#581c87' },
                  { name: 'Official Red', hex: '#b91c1c' },
                  { name: 'Forest Green', hex: '#15803d' },
                  { name: 'Black', hex: '#0f172a' },
                ].map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => setInkColor(c.hex)}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                    className={`w-8 h-8 rounded-full border-2 transition-transform ${
                      inkColor === c.hex ? 'scale-110 border-white ring-2 ring-blue-500' : 'border-transparent'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Stamp Text Customization */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Top Curved / Header Text (Shop Name / Authority)
                </label>
                <input
                  type="text"
                  value={topText}
                  onChange={(e) => setTopText(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Center Main Text (Status / Signatory)
                </label>
                <input
                  type="text"
                  value={centerText}
                  onChange={(e) => setCenterText(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-extrabold text-blue-600 dark:text-blue-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Bottom Text (City / State)
                  </label>
                  <input
                    type="text"
                    value={bottomText}
                    onChange={(e) => setBottomText(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Stamp Date
                  </label>
                  <input
                    type="text"
                    value={stampDate}
                    onChange={(e) => setStampDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Realism Sliders */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3 text-xs">
              <div>
                <div className="flex justify-between font-semibold mb-1 text-slate-700 dark:text-slate-300">
                  <span>Realistic Rubber Grunge Texture</span>
                  <span>{distressLevel}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="70"
                  value={distressLevel}
                  onChange={(e) => setDistressLevel(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>

              <div>
                <div className="flex justify-between font-semibold mb-1 text-slate-700 dark:text-slate-300">
                  <span>Natural Hand Tilt Angle</span>
                  <span>{stampAngle}°</span>
                </div>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  value={stampAngle}
                  onChange={(e) => setStampAngle(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>
            </div>

            {/* Optional: Stamp on PDF */}
            <div className="p-4 bg-blue-50/60 dark:bg-blue-950/30 rounded-2xl border border-blue-200 dark:border-blue-800 space-y-2">
              <span className="text-xs font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-600" /> Optional: Upload PDF to Stamp Directly
              </span>
              <input
                type="file"
                accept=".pdf"
                onChange={handlePdfUpload}
                className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
              />
              {attachedPdf && (
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                    <span>Horizontal Position: {stampPosX}%</span>
                    <span>Vertical Position: {stampPosY}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="90"
                    value={stampPosX}
                    onChange={(e) => setStampPosX(Number(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                  <input
                    type="range"
                    min="10"
                    max="90"
                    value={stampPosY}
                    onChange={(e) => setStampPosY(Number(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                </div>
              )}
            </div>

            {/* Export Buttons */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <button
                onClick={handleDownloadPng}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-md transition"
              >
                <Download className="w-4 h-4" /> Download Transparent PNG Stamp (300 DPI)
              </button>
              {attachedPdf && (
                <button
                  onClick={handleDownloadStampedPdf}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-md transition disabled:opacity-50"
                >
                  <Download className="w-4 h-4" /> Download Stamped PDF Document
                </button>
              )}
              <button
                onClick={() => setShowQrModal(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-semibold text-xs transition"
              >
                <Smartphone className="w-3.5 h-3.5" /> Send Stamp to Mobile Phone
              </button>
            </div>
          </div>

          {/* Right Live Preview */}
          <div className="lg:col-span-6 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-blue-500" /> Live Stamp & Document Preview
              </span>
              {attachedPdf && pdfPreviewUrl && (
                <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                  <button
                    type="button"
                    onClick={() => setPreviewTab('stamp')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition ${
                      previewTab === 'stamp'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Stamp Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab('document')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition ${
                      previewTab === 'document'
                        ? 'bg-white dark:bg-slate-900 text-emerald-600 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Stamped Document
                  </button>
                </div>
              )}
            </div>

            {previewTab === 'document' && pdfPreviewUrl ? (
              /* Live Stamped Document Overlay Preview */
              <div className="w-full relative rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-2 shadow-inner">
                <div className="relative inline-block max-w-full">
                  <img
                    src={pdfPreviewUrl}
                    alt="Document Background"
                    className="max-h-[520px] w-auto block rounded shadow border border-slate-300 dark:border-slate-700 select-none pointer-events-none"
                  />
                  {stampPngUrl && (
                    <img
                      src={stampPngUrl}
                      alt="Rubber Stamp Overlay"
                      style={{
                        position: 'absolute',
                        left: `${stampPosX}%`,
                        top: `${stampPosY}%`,
                        width: `${Math.round(stampSize * 0.75)}px`,
                        height: 'auto',
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none',
                      }}
                      className="drop-shadow-sm select-none"
                    />
                  )}
                </div>
              </div>
            ) : (
              /* Checkered pattern background to show stamp transparency */
              <div
                className="w-full h-[460px] flex items-center justify-center p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner"
                style={{
                  backgroundImage:
                    'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)',
                  backgroundSize: '20px 20px',
                  backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                }}
              >
                {stampPngUrl && (
                  <img
                    src={stampPngUrl}
                    alt="Rubber Stamp Preview"
                    className="max-h-[380px] max-w-[380px] object-contain drop-shadow-md"
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* SEO Section */}
        <ToolSEOSection
          toolName="Digital Rubber Stamp & Round Seal Maker"
          headline="Create Custom Official Round Seals & Verified Rubber Stamps Online"
          description="E-Mitra kiosks, CSC centers, law firms, and small businesses frequently require custom official stamps such as 'VERIFIED & APPROVED', 'PAID', 'ORIGINAL SEEN', or circular shop seals. This tool generates authentic digital rubber stamps with curved typography, realistic distressed ink textures, and subtle hand-tilt angles."
          steps={[
            {
              step: '01',
              title: 'Choose Stamp Shape & Ink',
              desc: 'Select Round Seal (Gol Mohar), Rectangle Box, or Oval Notary seal and pick your ink color.',
            },
            {
              step: '02',
              title: 'Customize Shop Name & Text',
              desc: 'Enter your business name, authority, status, city, and automatic timestamp.',
            },
            {
              step: '03',
              title: 'Download Transparent PNG or Stamp PDF',
              desc: 'Download a clean transparent PNG or stamp directly onto any uploaded PDF document in 1 click.',
            },
          ]}
          features={[
            {
              title: 'Curved Text Round Seals',
              desc: 'Precision mathematical arc text rendering for upper and lower circular margins.',
            },
            {
              title: 'Realistic Grunge & Distress Texture',
              desc: 'Simulates genuine rubber stamp ink imperfections, paper texture, and natural tilt.',
            },
            {
              title: 'Transparent 300 DPI Export',
              desc: 'Download transparent PNGs ready to drop into Word documents, Photoshop, or billing invoices.',
            },
          ]}
          faqs={[
            {
              q: 'Can I use this transparent stamp PNG in Microsoft Word or Excel?',
              a: 'Yes, simply click "Download Transparent PNG Stamp", then insert the image into your Word, Excel, or billing software. Because the background is transparent, it overlays smoothly over text.',
            },
            {
              q: 'Can I stamp directly on my PDF document?',
              a: 'Yes! Upload your PDF in the "Upload PDF to Stamp Directly" box, adjust position sliders, and click "Download Stamped PDF Document".',
            },
          ]}
        />

        {/* Mobile Transfer Modal */}
        <ShareQrModal
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          title="Digital Rubber Stamp PNG"
          fileName="rubber-stamp.png"
        />
      </div>
    </div>
  );
}
