import React, { useState, useEffect } from 'react';
import {
  Upload,
  Download,
  Receipt,
  Trash2,
  Sliders,
  Smartphone,
  Eye,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import ShareQrModal from '../components/ShareQrModal';
import { dataUrlToBytes, downloadBlob } from '../lib/utils';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { motion, useReducedMotion } from 'motion/react';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';
import { toArrayBufferBytes } from '../lib/blobUrl';

interface BillItem {
  id: string;
  file: File;
  canvas: HTMLCanvasElement;
  desc: string;
  date: string;
  amount: number;
}

type GridLayout = '4_per_page' | '6_per_page' | '2_per_page';

export default function BillConsolidator() {
  useSEO(
    'Expense Bills & Fuel Slips 4-in-1 Consolidator — Merge Receipts into A4 PDF',
    'Tile 4 or 6 fuel bills, toll receipts, and taxi slips onto single A4 sheets for reimbursement claims. Auto-calculates total expense summary table. Free & private.'
  );

  usePageSEO(
    'Expense Bills Consolidator — Combine Receipts onto A4 Sheet',
    'Free online tool for employees, accounts teams and CAs to combine multiple petrol slips, taxi receipts and GST bills into an audited A4 reimbursement claim PDF.',
    'expense bills consolidator, petrol slip merger, merge receipts into one page pdf, 4 bills in one page, travel reimbursement sheet maker, combine tax receipts pdf',
    '/bill-consolidator'
  );

  const [bills, setBills] = useState<BillItem[]>([]);
  const prefersReduced = useReducedMotion();
  const [layout, setLayout] = useState<GridLayout>('4_per_page');
  const [employeeName, setEmployeeName] = useState('Pankaj Meena');
  const [claimTitle, setClaimTitle] = useState('Monthly Travel & Fuel Expense Claim');
  const [companyName, setCompanyName] = useState('Finance & Accounts Dept.');
  const [includeSummaryTable, setIncludeSummaryTable] = useState(true);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  // Upload multiple bill images or PDFs
  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;
    setIsProcessing(true);

    const newBills: BillItem[] = [];

    try {
      for (const f of selectedFiles) {
        if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
          const buffer = await f.arrayBuffer();
          const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
          const pdf = await loadingTask.promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
            newBills.push({
              id: Math.random().toString(36).substring(2, 9),
              file: f,
              canvas,
              desc: f.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
              date: new Date().toLocaleDateString('en-GB'),
              amount: 0,
            });
          }
        } else {
          // Image file
          await new Promise<void>((resolve) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(img, 0, 0);
                  newBills.push({
                    id: Math.random().toString(36).substring(2, 9),
                    file: f,
                    canvas,
                    desc: f.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
                    date: new Date().toLocaleDateString('en-GB'),
                    amount: 0,
                  });
                }
                resolve();
              };
              img.src = ev.target?.result as string;
            };
            reader.readAsDataURL(f);
          });
        }
      }

      setBills((prev) => [...prev, ...newBills]);
    } catch (err) {
      console.error('Error loading bills:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Calculate total expense sum
  const totalExpense = bills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

  // Render an A4 sheet for given batch of bills
  const renderSheetCanvas = (batch: BillItem[], pageNum: number, totalPages: number): HTMLCanvasElement | null => {
    const sheetW = 1654; // A4 200 DPI
    const sheetH = 2338;
    const canvas = document.createElement('canvas');
    canvas.width = sheetW;
    canvas.height = sheetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // White paper
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sheetW, sheetH);

    // Top Header Banner
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(claimTitle.toUpperCase(), 60, 65);

    ctx.fillStyle = '#64748b';
    ctx.font = '16px sans-serif';
    ctx.fillText(`Employee: ${employeeName} | ${companyName} | Total Claim: ₹${totalExpense.toLocaleString('en-IN')}`, 60, 95);

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(60, 115);
    ctx.lineTo(sheetW - 60, 115);
    ctx.stroke();

    // Summary Table Box if on Page 1
    let startY = 135;
    if (includeSummaryTable && pageNum === 1) {
      const sumH = 110;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(60, startY, sheetW - 120, sumH);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(60, startY, sheetW - 120, sumH);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('AUDIT EXPENSE BREAKDOWN SUMMARY', 80, startY + 28);

      let xOffset = 80;
      batch.slice(0, 6).forEach((b, idx) => {
        ctx.fillStyle = '#475569';
        ctx.font = '13px sans-serif';
        const label = `#${idx + 1} ${b.desc.slice(0, 16)}: ₹${b.amount}`;
        ctx.fillText(label, xOffset, startY + 58);
        xOffset += 240;
        if (xOffset > sheetW - 200) xOffset = 80;
      });

      ctx.fillStyle = '#047857';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(`TOTAL VERIFIED CLAIM AMOUNT: ₹${totalExpense.toLocaleString('en-IN')}`, 80, startY + 92);

      startY += sumH + 20;
    }

    // Grid layout for bills
    const availH = sheetH - startY - 70;
    let cols = 2;
    let rows = 2;

    if (layout === '6_per_page') {
      cols = 2;
      rows = 3;
    } else if (layout === '2_per_page') {
      cols = 1;
      rows = 2;
    }

    const boxW = Math.floor((sheetW - 120 - (cols - 1) * 30) / cols);
    const boxH = Math.floor((availH - (rows - 1) * 30) / rows);

    batch.forEach((bill, idx) => {
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      const bX = 60 + c * (boxW + 30);
      const bY = startY + r * (boxH + 30);

      // Card container
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bX, bY, boxW, boxH);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bX, bY, boxW, boxH);

      // Top title bar of receipt box
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(bX, bY, boxW, 36);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`ITEM #${idx + 1}: ${bill.desc.toUpperCase()}`, bX + 12, bY + 23);

      ctx.fillStyle = '#047857';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`₹${bill.amount || '0'}`, bX + boxW - 12, bY + 23);
      ctx.textAlign = 'left';

      // Draw receipt image fitted inside remaining box area
      const imgAvailH = boxH - 40;
      const s = Math.min((boxW - 16) / bill.canvas.width, (imgAvailH - 16) / bill.canvas.height);
      const dW = bill.canvas.width * s;
      const dH = bill.canvas.height * s;
      const dX = bX + (boxW - dW) / 2;
      const dY = bY + 40 + (imgAvailH - dH) / 2;

      ctx.drawImage(bill.canvas, dX, dY, dW, dH);
    });

    // Sheet Footer
    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px sans-serif';
    ctx.fillText(`Page ${pageNum} of ${totalPages} • Verified Expense Claim Voucher`, 60, sheetH - 30);

    return canvas;
  };

  // Re-generate preview when bills, layout or metadata change
  useEffect(() => {
    if (bills.length === 0) return;

    let countPerSheet = 4;
    if (layout === '6_per_page') countPerSheet = 6;
    if (layout === '2_per_page') countPerSheet = 2;

    const totalSheets = Math.ceil(bills.length / countPerSheet);
    const firstBatch = bills.slice(0, countPerSheet);
    const canvas = renderSheetCanvas(firstBatch, 1, totalSheets);
    if (canvas) {
      setPreviewDataUrl(canvas.toDataURL('image/jpeg', 0.88));
    }
  }, [bills, layout, employeeName, claimTitle, companyName, includeSummaryTable]);

  // Export all sheets to single PDF
  const handleDownloadPdf = async () => {
    if (bills.length === 0) return;
    setIsProcessing(true);

    try {
      const pdfDoc = await PDFDocument.create();

      let countPerSheet = 4;
      if (layout === '6_per_page') countPerSheet = 6;
      if (layout === '2_per_page') countPerSheet = 2;

      const totalSheets = Math.ceil(bills.length / countPerSheet);

      for (let p = 0; p < totalSheets; p++) {
        const batch = bills.slice(p * countPerSheet, (p + 1) * countPerSheet);
        const canvas = renderSheetCanvas(batch, p + 1, totalSheets);
        if (!canvas) continue;

        const jpgData = canvas.toDataURL('image/jpeg', 0.92);
        const jpgBytes = dataUrlToBytes(jpgData);
        const jpgImg = await pdfDoc.embedJpg(jpgBytes);

        // A4 page 595.28 x 841.89 points
        const page = pdfDoc.addPage([595.28, 841.89]);
        page.drawImage(jpgImg, { x: 0, y: 0, width: 595.28, height: 841.89 });
      }

      const outBytes = await pdfDoc.save();
      const blob = new Blob([toArrayBufferBytes(outBytes)], { type: 'application/pdf' });
      downloadBlob(blob, `expense-claim-${Date.now()}.pdf`);
    } catch (err) {
      console.error('Error generating bill voucher PDF:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Expense Bills & Fuel Slips 4-in-1 Consolidator"
      subtitle="Consolidate 4 or 6 fuel bills, toll receipts, and taxi slips onto single A4 sheets. Automatically calculates total claim amount and prints an audited expense voucher."
      categoryLabel="Office & Reimbursement Special"
      icon={Receipt}
      microVariant="merge"
      tone="emerald"
    >
      <div className="max-w-6xl mx-auto space-y-8 text-slate-900 dark:text-slate-100">

        <PearlStageSwitch stageKey={bills.length === 0 ? 'upload' : 'editor'}>
          {bills.length === 0 ? (
            <div className="max-w-2xl mx-auto">
              <div className="pms-glass-panel rounded-3xl p-4 sm:p-6">
                <label className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-[var(--pms-border)] hover:border-emerald-500 rounded-2xl cursor-pointer bg-white/75 dark:bg-slate-900/75 transition-all group">
                  <input
                    type="file"
                    multiple
                    accept=".pdf,image/png,image/jpeg,image/webp"
                    onChange={handleUploadFiles}
                    className="hidden"
                  />
                  <div
                    className="w-16 h-16 rounded-2xl text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform shadow-xs"
                    style={{ backgroundColor: 'var(--pms-soft-mint)' }}
                  >
                    <Upload className="w-8 h-8" />
                  </div>
                  <span className="text-base font-bold text-slate-900 dark:text-white mb-1">
                    Drop Receipt Photos or PDF Invoices Here
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 text-center max-w-xs">
                    Upload petrol slips, toll plaza receipts, hotel bills, taxi slips, or GST invoices.
                  </span>
                </label>
              </div>
            </div>
          ) : (
            /* Editor Layout */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Controls & Bill List */}
              <div className="lg:col-span-6 relative overflow-hidden pms-glass-panel space-y-5 p-6 rounded-3xl">
                <PearlScanOverlay active={isProcessing} label="Generating A4 expense voucher PDF…" />

                <div className="flex items-center justify-between pb-3 border-b border-[var(--pms-border)]">
                  <span className="text-sm font-bold flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-emerald-500" />
                    <span>
                      Voucher Details (<AnimatedNumber value={bills.length} /> Bills)
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setBills([])}
                    className="text-xs text-rose-500 hover:text-rose-600 font-semibold"
                  >
                    Clear All
                  </button>
                </div>

                {/* Grid Layout Picker */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    Sheet Layout
                  </label>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {[
                      { id: '4_per_page', label: '4 Bills (2×2 Grid)' },
                      { id: '6_per_page', label: '6 Bills (3×2 Grid)' },
                      { id: '2_per_page', label: '2 Bills (Large)' },
                    ].map((opt) => {
                      const active = layout === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setLayout(opt.id as GridLayout)}
                          className={`relative p-2.5 rounded-xl border text-center font-bold transition-colors ${
                            active
                              ? 'border-emerald-500 text-emerald-950 dark:text-white shadow-xs'
                              : 'bg-white/75 dark:bg-slate-900/75 border-[var(--pms-border)] text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="bill-layout-pill"
                              transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
                              className="absolute inset-0 rounded-xl -z-0"
                              style={{ backgroundColor: 'var(--pms-soft-mint)' }}
                            />
                          )}
                          <span className="relative z-10">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Claim Metadata Inputs */}
                <div className="space-y-2.5 p-3.5 bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      Claim Title / Month
                    </label>
                    <input
                      type="text"
                      value={claimTitle}
                      onChange={(e) => setClaimTitle(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--pms-border)] bg-white/90 dark:bg-slate-950/70 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Employee / Claimant
                      </label>
                      <input
                        type="text"
                        value={employeeName}
                        onChange={(e) => setEmployeeName(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--pms-border)] bg-white/90 dark:bg-slate-950/70 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Department / Company
                      </label>
                      <input
                        type="text"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--pms-border)] bg-white/90 dark:bg-slate-950/70 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Bill Items Editable List */}
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Receipt Breakdown & Amounts (₹)
                  </span>
                  {bills.map((bill, index) => (
                    <div
                      key={bill.id}
                      className="flex items-center gap-2 p-2.5 bg-white/75 dark:bg-slate-900/75 rounded-xl border border-[var(--pms-border)] text-xs"
                    >
                      <span className="font-bold text-slate-400 w-5 text-center">#{index + 1}</span>
                      <input
                        type="text"
                        value={bill.desc}
                        onChange={(e) => {
                          const updated = [...bills];
                          updated[index].desc = e.target.value;
                          setBills(updated);
                        }}
                        className="flex-1 px-2 py-1 rounded border border-[var(--pms-border)] bg-white/90 dark:bg-slate-950/70 font-medium"
                        placeholder="Receipt Description"
                      />
                      <div className="flex items-center w-24">
                        <span className="text-slate-400 font-bold px-1.5">₹</span>
                        <input
                          type="number"
                          value={bill.amount || ''}
                          onChange={(e) => {
                            const updated = [...bills];
                            updated[index].amount = parseFloat(e.target.value) || 0;
                            setBills(updated);
                          }}
                          className="w-full px-1.5 py-1 rounded border border-[var(--pms-border)] bg-white/90 dark:bg-slate-950/70 font-bold text-emerald-600 dark:text-emerald-400"
                          placeholder="0"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setBills(bills.filter((_, i) => i !== index))}
                        className="text-slate-400 hover:text-rose-500 p-1"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Total Claim Banner */}
                <div
                  className="p-3.5 rounded-2xl border border-emerald-300/70 dark:border-emerald-800/70 flex items-center justify-between"
                  style={{ backgroundColor: 'var(--pms-soft-mint)' }}
                >
                  <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                    Total Claim Summary (<AnimatedNumber value={bills.length} /> Receipts)
                  </span>
                  <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums">
                    <AnimatedNumber
                      value={totalExpense}
                      decimals={totalExpense % 1 === 0 ? 0 : 2}
                      prefix="₹"
                    />
                  </span>
                </div>

                {/* Export Buttons */}
                <div className="pt-2 border-t border-[var(--pms-border)] space-y-2">
                  <motion.button
                    type="button"
                    whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                    onClick={handleDownloadPdf}
                    disabled={isProcessing}
                    className="pms-btn-primary w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-bold text-sm shadow-md disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" /> Download Expense Voucher PDF
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                    onClick={() => setShowQrModal(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl font-semibold text-xs transition"
                  >
                    <Smartphone className="w-3.5 h-3.5" /> Send to Mobile Phone
                  </motion.button>
                </div>
              </div>

              {/* Right Live Preview */}
              <div className="lg:col-span-6 relative overflow-hidden pms-glass-panel p-6 rounded-3xl flex flex-col items-center">
                <PearlScanOverlay active={isProcessing} label="Rendering claim sheets…" />

                <div className="w-full flex items-center justify-between mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Eye className="w-4 h-4 text-emerald-500" /> A4 Expense Claim Sheet Preview
                  </span>
                  <span
                    className="text-xs font-semibold px-2.5 py-1 text-emerald-800 dark:text-emerald-200 rounded-lg border border-emerald-300/60 dark:border-emerald-800/60"
                    style={{ backgroundColor: 'var(--pms-soft-mint)' }}
                  >
                    Audited Format
                  </span>
                </div>

                {previewDataUrl ? (
                  <div className="w-full max-h-[640px] overflow-auto flex items-center justify-center p-4 bg-slate-100/70 dark:bg-slate-950/60 rounded-2xl border border-[var(--pms-border)]">
                    <div className="p-2 bg-white rounded-xl shadow-lg border border-slate-200">
                      <img
                        src={previewDataUrl}
                        alt="Expense Claim Sheet Preview"
                        className="max-h-[560px] w-auto object-contain rounded"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-96 flex items-center justify-center text-slate-400 text-xs">
                    Generating expense voucher preview...
                  </div>
                )}
              </div>
            </div>
          )}
        </PearlStageSwitch>

        {/* SEO Section */}
        <ToolSEOSection
          toolName="Expense Bills & Fuel Slips Consolidator"
          headline="Combine Multiple Receipts and Bills into a Single Audited A4 PDF"
          description="Filing travel claims, fuel reimbursements, and GST expense sheets often requires pasting dozens of small paper receipts onto sheets of paper. This tool automatically tiles 4 or 6 fuel bills, taxi slips, and invoices onto standard A4 sheets with itemized descriptions and auto-calculated total expense amounts."
          steps={[
            {
              step: '01',
              title: 'Upload Receipt Photos or Invoices',
              desc: 'Select up to 20 fuel receipts, toll tickets, meal bills, or GST invoices.',
            },
            {
              step: '02',
              title: 'Enter Amounts & Descriptions',
              desc: 'Optionally add descriptions and amounts in ₹; the tool auto-computes the grand total.',
            },
            {
              step: '03',
              title: 'Download Claim Voucher',
              desc: 'Download an organized, clean A4 PDF ready for finance and accounts department approval.',
            },
          ]}
          features={[
            {
              title: 'Auto-Summed Claim Summary',
              desc: 'Automatically tallies all bill amounts into an audit-ready summary box on Page 1.',
            },
            {
              title: 'Multi-Grid Options (4-in-1 / 6-in-1)',
              desc: 'Fit 4 bills or 6 bills per A4 page to meet strict corporate travel policy guidelines.',
            },
            {
              title: 'Tidy Borders & Labels',
              desc: 'Neatly encloses every receipt with item numbers and dates to prevent lost reimbursement claims.',
            },
          ]}
          faqs={[
            {
              q: 'Can I upload both PDF invoices and camera photos together?',
              a: 'Yes, the tool supports mixed batches of JPEG, PNG, and PDF files simultaneously.',
            },
            {
              q: 'Is this format accepted by corporate HR and finance departments?',
              a: 'Yes, the clean A4 grid format with clear receipt borders and an audited summary table adheres to standard corporate reimbursement guidelines.',
            },
          ]}
        />

        {/* Mobile Transfer Modal */}
        <ShareQrModal
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          title="Expense Claim PDF"
          fileName="expense-claim.pdf"
        />
      </div>
    </ToolWorkspaceShell>
  );
}
