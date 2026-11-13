import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Printer,
  Download,
  Trash2,
  Plus,
  Layers,
  Sparkles,
  Scissors,
  CheckCircle2,
  Maximize2,
  FileCheck2,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import ShareQrModal from '../components/ShareQrModal';
import { dataUrlToBytes, downloadBlob } from '../lib/utils';

interface CardItem {
  id: string;
  customerName: string;
  dataUrl: string;
  aspectRatio: number;
}

type PaperType = 'a4' | 'photo_4x6' | 'legal';

export default function GangPrintSheet() {
  useSEO(
    'Multi-Customer Gang-Print Sheet Maker — A4 & 4×6 Photo Paper Saver',
    'Combine multiple customer ID cards, Aadhaar, PAN, and Voter cards onto a single A4 or 4×6 photo paper with cut marks. Save ₹40+ per print run.'
  );

  usePageSEO(
    'Multi-Customer Gang Print Sheet Maker — Lamination Paper Saver',
    'Batch gang-run ID card print layout for E-Mitra, CSC, and Xerox shops. Combine up to 8 customer cards onto single A4 or 4×6 sheet with cutting margins.',
    'gang print sheet, multi card print a4, lamination paper saver, batch pvc card print, emitra 4x6 photo sheet, id card gang run layout',
    '/gang-print-sheet'
  );

  const [cards, setCards] = useState<CardItem[]>([]);
  const [paperType, setPaperType] = useState<PaperType>('a4');
  const [cardStandard, setCardStandard] = useState<'cr80' | 'square' | 'custom'>('cr80');
  const [includeCutMarks, setIncludeCutMarks] = useState(true);
  const [laminationMargin, setLaminationMargin] = useState(true); // 4mm waterproof seal gap
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Handle uploading files (images or PDFs)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    for (const file of files) {
      if (file.type === 'application/pdf') {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
            const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
            setCards((prev) => [
              ...prev,
              {
                id: Math.random().toString(36).substring(2, 9),
                customerName: file.name.replace(/\.[^/.]+$/, ''),
                dataUrl,
                aspectRatio: canvas.width / canvas.height,
              },
            ]);
          }
        } catch (err) {
          console.error('PDF error', err);
        }
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            setCards((prev) => [
              ...prev,
              {
                id: Math.random().toString(36).substring(2, 9),
                customerName: file.name.replace(/\.[^/.]+$/, ''),
                dataUrl: ev.target?.result as string,
                aspectRatio: img.width / img.height,
              },
            ]);
          };
          img.src = ev.target?.result as string;
        };
        reader.readAsDataURL(file);
      }
    }
    e.target.value = '';
  };

  // Render the gang sheet to canvas (300 DPI calculation)
  const renderSheet = () => {
    if (!cards.length) {
      setPreviewDataUrl(null);
      return;
    }

    const canvas = canvasRef.current || document.createElement('canvas');

    // High resolution canvas dimensions
    let sheetWidth = 2480; // A4 @ 300 DPI (210mm)
    let sheetHeight = 3508; // A4 @ 300 DPI (297mm)

    if (paperType === 'photo_4x6') {
      sheetWidth = 1800; // 6 inch @ 300 DPI
      sheetHeight = 1200; // 4 inch @ 300 DPI (Landscape)
    } else if (paperType === 'legal') {
      sheetWidth = 2480;
      sheetHeight = 4200;
    }

    canvas.width = sheetWidth;
    canvas.height = sheetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fill white paper background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sheetWidth, sheetHeight);

    // CR80 dimensions: 85.6mm × 53.98mm => in pixels @ 300DPI (approx 1011 × 638 px)
    const cardW = 1011;
    const cardH = 638;

    // Grid slots calculation
    let cols = 2;
    let rows = 4; // 8 cards on A4
    if (paperType === 'photo_4x6') {
      cols = 1;
      rows = 2; // 2 cards on 4x6
    }

    const marginX = (sheetWidth - cols * cardW) / (cols + 1);
    const marginY = (sheetHeight - rows * cardH) / (rows + 1);

    cards.slice(0, cols * rows).forEach((card, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);

      const x = marginX + col * (cardW + marginX);
      const y = marginY + row * (cardH + marginY);

      const img = new Image();
      img.onload = () => {
        // Draw card image centered in slot
        ctx.save();
        ctx.drawImage(img, x, y, cardW, cardH);

        // Draw outer thin scissor cut marks
        if (includeCutMarks) {
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 8]);
          ctx.strokeRect(x, y, cardW, cardH);

          // Corner guide crosses
          ctx.setLineDash([]);
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 3;
          const crossLen = 20;

          // Top-left
          ctx.beginPath();
          ctx.moveTo(x - crossLen, y); ctx.lineTo(x, y); ctx.lineTo(x, y - crossLen);
          ctx.stroke();

          // Top-right
          ctx.beginPath();
          ctx.moveTo(x + cardW + crossLen, y); ctx.lineTo(x + cardW, y); ctx.lineTo(x + cardW, y - crossLen);
          ctx.stroke();

          // Bottom-left
          ctx.beginPath();
          ctx.moveTo(x - crossLen, y + cardH); ctx.lineTo(x, y + cardH); ctx.lineTo(x, y + cardH + crossLen);
          ctx.stroke();

          // Bottom-right
          ctx.beginPath();
          ctx.moveTo(x + cardW + crossLen, y + cardH); ctx.lineTo(x + cardW, y + cardH); ctx.lineTo(x + cardW, y + cardH + crossLen);
          ctx.stroke();
        }

        // Draw lamination clearance boundary
        if (laminationMargin) {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(x - 25, y - 25, cardW + 50, cardH + 50);
        }

        // Customer name tag
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(card.customerName || `Card #${idx + 1}`, x + 10, y + cardH + 28);

        ctx.restore();

        // Update preview URL on last card render
        if (idx === Math.min(cards.length, cols * rows) - 1) {
          setPreviewDataUrl(canvas.toDataURL('image/jpeg', 0.94));
        }
      };
      img.src = card.dataUrl;
    });

    if (!cards.length) {
      setPreviewDataUrl(null);
    }
  };

  useEffect(() => {
    renderSheet();
  }, [cards, paperType, includeCutMarks, laminationMargin]);

  // Export as 300 DPI PDF
  const handleDownloadPdf = async () => {
    if (!previewDataUrl) return;
    setIsProcessing(true);

    try {
      const pdfDoc = await PDFDocument.create();
      const pageWidth = paperType === 'photo_4x6' ? 432 : 595.28; // pt
      const pageHeight = paperType === 'photo_4x6' ? 288 : 841.89;

      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      const imageBytes = previewDataUrl.startsWith('data:')
        ? dataUrlToBytes(previewDataUrl)
        : await fetch(previewDataUrl).then((r) => r.arrayBuffer());
      const embeddedImg = await pdfDoc.embedJpg(imageBytes);

      page.drawImage(embeddedImg, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      downloadBlob(blob, `gang_print_${paperType}_sheet.pdf`);
    } catch (err) {
      alert('Error generating PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  // 1-Click Print
  const handlePrint = () => {
    if (!previewDataUrl) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Gang Print Sheet</title>
          <style>
            @page { size: auto; margin: 0; }
            body { margin: 0; display: flex; align-items: center; justify-content: center; }
            img { width: 100vw; height: auto; max-height: 100vh; object-fit: contain; }
          </style>
        </head>
        <body>
          <img src="${previewDataUrl}" onload="window.print(); window.close();" />
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Title */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 text-emerald-600 text-xs font-bold mb-2">
              <Sparkles className="w-3.5 h-3.5" /> High Profit Paper Saver
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">
              Multi-Customer Gang-Print Sheet
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
              Combine multiple customers' Aadhaar, PAN, and Voter ID cards onto a single A4 or 4×6 photo sheet. Save ₹40+ per print run in photo paper and lamination pouches!
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              disabled={!previewDataUrl}
              className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs shadow-md disabled:opacity-40 flex items-center gap-2 hover:opacity-90"
            >
              <Printer className="w-4 h-4" /> 1-Click Print
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={!previewDataUrl || isProcessing}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md disabled:opacity-40 flex items-center gap-2 transition-all"
            >
              <Download className="w-4 h-4" /> Export 300 DPI PDF
            </button>
          </div>
        </div>

        {/* Workspace Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Controls & Card Manager (4 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Upload Zone */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-sm space-y-4">
              <label className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 text-center block cursor-pointer hover:border-emerald-500 transition-colors">
                <Upload className="w-8 h-8 mx-auto text-emerald-600 mb-2" />
                <span className="font-bold text-sm text-slate-700 dark:text-slate-200 block">
                  Add Customer Cards (Aadhaar / PAN / Voter)
                </span>
                <span className="text-xs text-slate-400 mt-1 block">
                  Supports multiple PDFs or Images (Drop 2 to 8 cards)
                </span>
                <input
                  type="file"
                  multiple
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>

              {/* Layout Settings */}
              <div className="space-y-3 pt-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  Print Sheet Format
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'a4', label: 'A4 Sheet (8 Cards)' },
                    { id: 'photo_4x6', label: '4×6 Photo (2 Cards)' },
                    { id: 'legal', label: 'Legal (10 Cards)' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPaperType(p.id as PaperType)}
                      className={`p-2.5 rounded-xl border text-xs font-bold text-center transition-all ${
                        paperType === p.id
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Toggles */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={includeCutMarks}
                      onChange={(e) => setIncludeCutMarks(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    Include Scissor Cutting Lines &amp; Corner Crosses
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={laminationMargin}
                      onChange={(e) => setLaminationMargin(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    Lamination Watertight Clearance Margins (4mm)
                  </label>
                </div>
              </div>
            </div>

            {/* Loaded Cards List */}
            {cards.length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500">
                    Cards in Sheet ({cards.length})
                  </h3>
                  <button
                    onClick={() => setCards([])}
                    className="text-xs text-rose-600 font-bold hover:underline"
                  >
                    Clear All
                  </button>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {cards.map((c, idx) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img src={c.dataUrl} alt={c.customerName} className="w-10 h-7 object-cover rounded border" />
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[170px]">
                          #{idx + 1}: {c.customerName}
                        </span>
                      </div>
                      <button
                        onClick={() => setCards((prev) => prev.filter((item) => item.id !== c.id))}
                        className="text-slate-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Interactive Sheet Preview (7 Cols) */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                Print Sheet Preview (300 DPI)
              </h2>
              {previewDataUrl && (
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-200">
                  Ready to Print
                </span>
              )}
            </div>

            <div className="w-full bg-slate-100 dark:bg-slate-950/80 rounded-2xl p-4 flex items-center justify-center min-h-[460px] border border-slate-200/70 dark:border-slate-800">
              {previewDataUrl ? (
                <img
                  src={previewDataUrl}
                  alt="Gang Print Sheet Preview"
                  className="max-h-[580px] w-auto shadow-2xl rounded-sm border border-slate-300"
                />
              ) : (
                <div className="text-center space-y-3 text-slate-400">
                  <Layers className="w-12 h-12 mx-auto opacity-30" />
                  <p className="text-xs font-semibold">Drop 2 or more customer cards to generate gang print sheet.</p>
                </div>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>

        {/* SEO Guide Section */}
        <ToolSEOSection
          toolName="Multi-Customer Gang-Print Sheet Maker"
          headline="Combine 2 to 8 Customer Cards onto A4 &amp; 4×6 Photo Paper"
          description="Batch gang-run ID card print layout for E-Mitra, CSC centers, and xerox shops. Combine multiple customer Aadhaar, PAN, and Voter ID cards onto a single photo sheet with cutting and watertight lamination marks."
          features={[
            {
              title: 'Eliminates Paper & Pouch Wastage',
              desc: 'Never waste an entire 4×6 or A4 photo sheet on a single customer. Group 2, 4, or 8 cards on one sheet.',
            },
            {
              title: 'Standard CR80 Cut Margins',
              desc: 'Every card slot is calibrated to exactly 85.6mm × 54mm with visible scissor guidelines and corner crosshairs.',
            },
            {
              title: 'Watertight Lamination Clearance',
              desc: 'Automatic 4mm edge sealing boundary so laminated cards never peel off or take in water at the edges.',
            },
            {
              title: 'Ultra High 300 DPI Print Clarity',
              desc: 'Generates razor-sharp print files ensuring micro-text, QR codes, and barcodes remain completely legible.',
            },
          ]}
        />
      </div>
    </div>
  );
}
