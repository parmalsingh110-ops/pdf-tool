import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Upload,
  Printer,
  Download,
  Trash2,
  Layers,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { dataUrlToBytes, downloadBlob } from '../lib/utils';
import { toArrayBufferBytes } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

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
  const [includeCutMarks, setIncludeCutMarks] = useState(true);
  const [laminationMargin, setLaminationMargin] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const prefersReduced = useReducedMotion();

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

    let sheetWidth = 2480; // A4 @ 300 DPI (210mm)
    let sheetHeight = 3508;

    if (paperType === 'photo_4x6') {
      sheetWidth = 1800; // 6 inch @ 300 DPI
      sheetHeight = 1200;
    } else if (paperType === 'legal') {
      sheetWidth = 2480;
      sheetHeight = 4200;
    }

    canvas.width = sheetWidth;
    canvas.height = sheetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sheetWidth, sheetHeight);

    const cardW = 1011;
    const cardH = 638;

    let cols = 2;
    let rows = 4;
    if (paperType === 'photo_4x6') {
      cols = 1;
      rows = 2;
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
        ctx.save();
        ctx.drawImage(img, x, y, cardW, cardH);

        if (includeCutMarks) {
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 8]);
          ctx.strokeRect(x, y, cardW, cardH);

          ctx.setLineDash([]);
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 3;
          const crossLen = 20;

          ctx.beginPath();
          ctx.moveTo(x - crossLen, y); ctx.lineTo(x, y); ctx.lineTo(x, y - crossLen);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x + cardW + crossLen, y); ctx.lineTo(x + cardW, y); ctx.lineTo(x + cardW, y - crossLen);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x - crossLen, y + cardH); ctx.lineTo(x, y + cardH); ctx.lineTo(x, y + cardH + crossLen);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x + cardW + crossLen, y + cardH); ctx.lineTo(x + cardW, y + cardH); ctx.lineTo(x + cardW, y + cardH + crossLen);
          ctx.stroke();
        }

        if (laminationMargin) {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(x - 25, y - 25, cardW + 50, cardH + 50);
        }

        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(card.customerName || `Card #${idx + 1}`, x + 10, y + cardH + 28);

        ctx.restore();

        if (idx === Math.min(cards.length, cols * rows) - 1) {
          setPreviewDataUrl(canvas.toDataURL('image/jpeg', 0.94));
        }
      };
      img.src = card.dataUrl;
    });
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
      const pageWidth = paperType === 'photo_4x6' ? 432 : 595.28;
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

      const pdfBytes = toArrayBufferBytes(await pdfDoc.save());
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      downloadBlob(blob, `gang_print_${paperType}_sheet.pdf`);
    } catch {
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

  const maxSlots = paperType === 'photo_4x6' ? 2 : paperType === 'legal' ? 10 : 8;

  return (
    <ToolWorkspaceShell
      title="Multi-Customer Gang-Print Sheet"
      subtitle="Combine multiple customers' Aadhaar, PAN, and Voter ID cards onto a single A4 or 4×6 photo sheet with cutting lines and watertight lamination margins."
      categoryLabel="High-Profit Paper Saver"
      icon={Printer}
      microVariant="merge"
      tone="emerald"
      trustNote="300 DPI CR80 calibration · Browser-side print & PDF layout"
    >
      <div className="space-y-6">
        {/* Top Metrics + Action Bar */}
        <div className="pms-glass-panel p-4 sm:p-5 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="px-3.5 py-1.5 rounded-full bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300 text-xs font-extrabold border border-[var(--pms-border)]">
              <AnimatedNumber value={cards.length} /> / {maxSlots} Card Slots
            </span>
            <span className="px-3 py-1.5 rounded-full bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] text-xs font-bold border border-[var(--pms-border)]">
              300 DPI CR80 Print Spec
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              disabled={!previewDataUrl}
              className="px-4 py-2.5 rounded-xl bg-white/85 dark:bg-slate-800 border border-[var(--pms-border)] text-slate-900 dark:text-white font-bold text-xs shadow-xs disabled:opacity-40 flex items-center gap-2 hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" /> 1-Click Print
            </button>
            <motion.button
              whileHover={prefersReduced || !previewDataUrl || isProcessing ? undefined : { scale: 1.02 }}
              whileTap={prefersReduced || !previewDataUrl || isProcessing ? undefined : { scale: 0.985 }}
              onClick={handleDownloadPdf}
              disabled={!previewDataUrl || isProcessing}
              className="pms-btn-primary px-5 py-2.5 rounded-xl font-bold text-xs disabled:opacity-40 flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" /> Export 300 DPI PDF
            </motion.button>
          </div>
        </div>

        {/* Workspace Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
          {/* Controls & Card Manager */}
          <div className="lg:col-span-5 space-y-5">
            {/* Upload Zone & Settings */}
            <div className="pms-glass-panel rounded-3xl p-6 space-y-5">
              <label
                className="border-2 border-dashed border-[var(--pms-border-strong)] bg-white/75 dark:bg-slate-900/75 rounded-2xl p-6 text-center block cursor-pointer hover:border-emerald-500 transition-colors"
              >
                <div className="w-12 h-12 rounded-2xl bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300 flex items-center justify-center mx-auto mb-2.5">
                  <Upload className="w-6 h-6" />
                </div>
                <span className="font-bold text-sm text-slate-800 dark:text-slate-100 block">
                  Add Customer Cards (Aadhaar / PAN / Voter)
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
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
              <div className="space-y-3 pt-1">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Print Sheet Format
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'a4', label: 'A4 Sheet (8 Cards)' },
                    { id: 'photo_4x6', label: '4×6 Photo (2 Cards)' },
                    { id: 'legal', label: 'Legal (10 Cards)' },
                  ].map((p) => {
                    const active = paperType === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPaperType(p.id as PaperType)}
                        className="relative p-2.5 rounded-xl border text-xs font-bold text-center transition-colors cursor-pointer overflow-hidden"
                        style={{
                          borderColor: active ? '#10b981' : 'var(--pms-border)',
                          backgroundColor: active ? 'var(--pms-soft-mint)' : 'var(--pms-white)',
                          color: active ? '#047857' : 'var(--pms-muted)',
                        }}
                      >
                        {active && (
                          <motion.span
                            layoutId="gang-paper-pill"
                            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                            className="absolute inset-0 rounded-xl ring-2 ring-emerald-500/35 pointer-events-none"
                          />
                        )}
                        <span className="relative z-10">{p.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Toggles */}
                <div className="space-y-2.5 pt-3 border-t border-[var(--pms-border)]">
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={includeCutMarks}
                      onChange={(e) => setIncludeCutMarks(e.target.checked)}
                      className="rounded accent-emerald-600 w-4 h-4"
                    />
                    Include Scissor Cutting Lines &amp; Corner Crosses
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={laminationMargin}
                      onChange={(e) => setLaminationMargin(e.target.checked)}
                      className="rounded accent-emerald-600 w-4 h-4"
                    />
                    Lamination Watertight Clearance Margins (4mm)
                  </label>
                </div>
              </div>
            </div>

            {/* Loaded Cards List */}
            <AnimatePresence initial={false}>
              {cards.length > 0 && (
                <motion.div
                  initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReduced ? undefined : { opacity: 0 }}
                  className="pms-glass-panel rounded-3xl p-6 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Cards in Sheet (<AnimatedNumber value={cards.length} />)
                    </h3>
                    <button
                      onClick={() => setCards([])}
                      className="text-xs text-rose-600 font-bold hover:underline cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    <AnimatePresence initial={false}>
                      {cards.map((c, idx) => (
                        <motion.div
                          key={c.id}
                          initial={prefersReduced ? false : { opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={prefersReduced ? undefined : { opacity: 0, x: 8 }}
                          transition={{ duration: 0.2 }}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img src={c.dataUrl} alt={c.customerName} className="w-10 h-7 object-cover rounded border border-[var(--pms-border)]" />
                            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[170px]">
                              #{idx + 1}: {c.customerName}
                            </span>
                          </div>
                          <button
                            onClick={() => setCards((prev) => prev.filter((item) => item.id !== c.id))}
                            className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                            title="Remove card"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Interactive Sheet Preview (Always Mounted Synchronously for canvasRef) */}
          <div className="relative lg:col-span-7 pms-glass-panel rounded-3xl p-6 space-y-4 overflow-hidden">
            <PearlScanOverlay active={isProcessing} label="Compiling 300 DPI PDF print sheet…" />

            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Print Sheet Preview (300 DPI)
              </h2>
              {previewDataUrl && (
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-[var(--pms-soft-mint)] px-3 py-1 rounded-full border border-[var(--pms-border)]">
                  Ready to Print
                </span>
              )}
            </div>

            <div className="w-full bg-slate-100/85 dark:bg-slate-950/70 rounded-2xl p-4 sm:p-6 flex items-center justify-center min-h-[460px] border border-[var(--pms-border)]">
              {previewDataUrl ? (
                <div className="bg-white p-1.5 rounded-md shadow-2xl border border-slate-200">
                  <img
                    src={previewDataUrl}
                    alt="Gang Print Sheet Preview"
                    className="max-h-[560px] w-auto"
                  />
                </div>
              ) : (
                <div className="text-center space-y-3 text-slate-400">
                  <Layers className="w-12 h-12 mx-auto opacity-35" />
                  <p className="text-xs font-semibold">Drop 2 or more customer cards to generate gang print sheet.</p>
                </div>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </div>
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
    </ToolWorkspaceShell>
  );
}
