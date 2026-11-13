import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Calculator,
  Printer,
  QrCode,
  CheckCircle2,
  FileText,
  Palette,
  Settings,
  Maximize2,
  Save,
  Check,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import FileDropzone from '../components/FileDropzone';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';
import ToolSEOSection from '../components/ToolSEOSection';
import { escapeHtml } from '../lib/utils';

interface PageBreakdown {
  pageNum: number;
  isColor: boolean;
  colorScore: number;
}

export default function PrintCostCalculator() {
  useSEO(
    'Print Cost & Dynamic UPI QR Generator — Auto Page & Color Count | PDF Media Suite',
    'Calculate exact photocopy & print costs instantly. Auto-detects B&W vs Color pages and generates a live dynamic UPI QR code for exact customer payment.'
  );

  usePageSEO(
    'Print Cost & Dynamic UPI QR Generator — Cyber Cafe Billing Tool',
    'Free online print cost estimator and dynamic UPI payment QR generator for Xerox shops, E-Mitra, and Cyber Cafes. Auto counts color and black & white pages.',
    'print cost calculator, xerox bill calculator, dynamic upi qr print, color page counter pdf, photocopy billing online, emitra print rate estimator',
    '/print-cost-calculator'
  );

  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [pageDetails, setPageDetails] = useState<PageBreakdown[]>([]);
  const [totalPages, setTotalPages] = useState(0);

  // Shop Rates Configuration (Stored in localStorage)
  const [rateBwSingle, setRateBwSingle] = useState<number>(() => Number(localStorage.getItem('pms_rate_bw_single') || 2));
  const [rateBwDuplex, setRateBwDuplex] = useState<number>(() => Number(localStorage.getItem('pms_rate_bw_duplex') || 3));
  const [rateColorSingle, setRateColorSingle] = useState<number>(() => Number(localStorage.getItem('pms_rate_color_single') || 10));
  const [rateColorDuplex, setRateColorDuplex] = useState<number>(() => Number(localStorage.getItem('pms_rate_color_duplex') || 15));
  const [upiId, setUpiId] = useState<string>(() => localStorage.getItem('pms_shop_upi') || 'example@upi');
  const [shopName, setShopName] = useState<string>(() => localStorage.getItem('pms_shop_name') || 'Xerox & Print Center');

  // Job Options
  const [printMode, setPrintMode] = useState<'single' | 'duplex'>('single');
  const [colorOverride, setColorOverride] = useState<'auto' | 'all_bw' | 'all_color'>('auto');
  const [copies, setCopies] = useState<number>(1);
  const [paperType, setPaperType] = useState<'a4' | 'legal'>('a4');
  const [addSpiral, setAddSpiral] = useState<boolean>(false);
  const [addLamination, setAddLamination] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [savedSettingsSuccess, setSavedSettingsSuccess] = useState<boolean>(false);
  const prefersReduced = useReducedMotion();
  const [showKioskModal, setShowKioskModal] = useState<boolean>(false);

  // Clear saved shop preferences on shared PCs
  const handleClearSettings = () => {
    ['pms_rate_bw_single', 'pms_rate_bw_duplex', 'pms_rate_color_single', 'pms_rate_color_duplex', 'pms_shop_upi', 'pms_shop_name'].forEach((k) => {
      try { localStorage.removeItem(k); } catch {}
    });
    setRateBwSingle(2);
    setRateBwDuplex(3);
    setRateColorSingle(10);
    setRateColorDuplex(15);
    setUpiId('example@upi');
    setShopName('Xerox & Print Center');
    setSavedSettingsSuccess(false);
  };

  // Save Shopkeeper Preferences
  const handleSaveSettings = () => {
    localStorage.setItem('pms_rate_bw_single', String(rateBwSingle));
    localStorage.setItem('pms_rate_bw_duplex', String(rateBwDuplex));
    localStorage.setItem('pms_rate_color_single', String(rateColorSingle));
    localStorage.setItem('pms_rate_color_duplex', String(rateColorDuplex));
    localStorage.setItem('pms_shop_upi', upiId.trim());
    localStorage.setItem('pms_shop_name', shopName.trim());
    setSavedSettingsSuccess(true);
    setTimeout(() => setSavedSettingsSuccess(false), 2500);
  };

  const handleFileUpload = async (uploadedFile: File) => {
    if (uploadedFile.type !== 'application/pdf') {
      alert('Please upload a PDF document.');
      return;
    }

    setFile(uploadedFile);
    setIsAnalyzing(true);
    setAnalysisProgress(0);

    try {
      const buffer = await uploadedFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      const total = pdf.numPages;
      setTotalPages(total);

      const breakdown: PageBreakdown[] = [];

      for (let i = 1; i <= total; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.3 }); // Small scale for fast color detection
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          
          let colorPixelCount = 0;
          let totalChecked = 0;

          // Sample pixels across page to detect color
          for (let p = 0; p < imgData.length; p += 16) {
            const r = imgData[p];
            const g = imgData[p + 1];
            const b = imgData[p + 2];
            
            // Check chromatic variation (|R-G| or |G-B|)
            const diffRG = Math.abs(r - g);
            const diffGB = Math.abs(g - b);
            const diffRB = Math.abs(r - b);

            if ((diffRG > 18 || diffGB > 18 || diffRB > 18) && (r < 240 || g < 240 || b < 240)) {
              colorPixelCount++;
            }
            totalChecked++;
          }

          const ratio = (colorPixelCount / Math.max(1, totalChecked)) * 100;
          const isColor = ratio > 1.2; // >1.2% chromatic pixels = Color Page
          breakdown.push({
            pageNum: i,
            isColor,
            colorScore: Math.round(ratio),
          });
        }

        setAnalysisProgress(Math.round((i / total) * 100));
      }

      setPageDetails(breakdown);
    } catch (err) {
      console.error(err);
      alert('Could not analyze PDF. Please try another file.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Calculations
  const calculatedCounts = React.useMemo(() => {
    let colorCount = 0;
    let bwCount = 0;

    pageDetails.forEach((p) => {
      if (colorOverride === 'all_color') {
        colorCount++;
      } else if (colorOverride === 'all_bw') {
        bwCount++;
      } else {
        if (p.isColor) colorCount++;
        else bwCount++;
      }
    });

    return { colorCount, bwCount };
  }, [pageDetails, colorOverride]);

  const pricingSummary = React.useMemo(() => {
    const { colorCount, bwCount } = calculatedCounts;
    const isLegal = paperType === 'legal';
    const paperMultiplier = isLegal ? 1.25 : 1;

    let bwUnitCost = printMode === 'single' ? rateBwSingle : rateBwDuplex / 2;
    let colorUnitCost = printMode === 'single' ? rateColorSingle : rateColorDuplex / 2;

    const bwTotal = Math.round(bwCount * bwUnitCost * paperMultiplier);
    const colorTotal = Math.round(colorCount * colorUnitCost * paperMultiplier);
    
    let subtotalPerCopy = bwTotal + colorTotal;
    let addOns = 0;
    if (addSpiral) addOns += 30;
    if (addLamination) addOns += 20;

    const grandTotal = (subtotalPerCopy + addOns) * copies;

    return {
      bwCount,
      colorCount,
      bwTotal: bwTotal * copies,
      colorTotal: colorTotal * copies,
      addOns: addOns * copies,
      grandTotal: Math.max(1, grandTotal),
    };
  }, [calculatedCounts, printMode, rateBwSingle, rateBwDuplex, rateColorSingle, rateColorDuplex, paperType, addSpiral, addLamination, copies]);

  // Dynamic UPI Payment Link & QR (100% local in-browser — UPI ID & amount never touch external QR servers)
  const upiPayString = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(shopName)}&am=${pricingSummary.grandTotal}&cu=INR&tn=${encodeURIComponent(`Print ${totalPages}p (${copies} copy)`)}`;

  // Instant 100% Local In-Browser QR Code Generation (0ms Network Latency, Zero External Leaks)
  const [upiQrDataUrl, setUpiQrDataUrl] = useState<string>('');
  useEffect(() => {
    if (!upiPayString) return;
    QRCode.toDataURL(upiPayString, {
      width: 280,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => setUpiQrDataUrl(url))
      .catch(() => setUpiQrDataUrl(''));
  }, [upiPayString]);

  // Clean 80mm POS Thermal / Laser Bill Receipt Printer
  const handlePrintBillSlip = () => {
    const printWin = window.open('', '_blank');
    if (!printWin) {
      alert('Please allow popups to print the bill receipt.');
      return;
    }

    const receiptNo = `INV-${Date.now().toString(36).toUpperCase().slice(-5)}`;
    const now = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

    const safeShopName = escapeHtml(shopName);
    const safeReceiptNo = escapeHtml(receiptNo);
    const safeNow = escapeHtml(now);
    const safeFileName = file ? escapeHtml(file.name.slice(0, 18)) : 'Direct Print';
    const safeMode = escapeHtml(printMode.toUpperCase());
    const safePaper = escapeHtml(paperType);
    const safeUpiId = escapeHtml(upiId);

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Bill Receipt - ${safeShopName}</title>
          <style>
            @page { size: 80mm auto; margin: 4mm; }
            body {
              font-family: monospace, -apple-system, sans-serif;
              font-size: 12px;
              color: #000;
              margin: 0;
              padding: 6px;
              max-width: 300px;
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .header { border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 8px; }
            .title { font-size: 16px; font-weight: 900; margin-bottom: 2px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
            .divider { border-top: 1px dashed #000; margin: 8px 0; }
            .total-row { font-size: 15px; font-weight: 900; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 6px 0; margin: 8px 0; }
            .qr-box { text-align: center; margin: 10px 0; }
            .qr-box img { width: 140px; height: 140px; }
            .footer { font-size: 10px; text-align: center; color: #444; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header center">
            <div class="title">${safeShopName}</div>
            <div>Photo State, Print &amp; E-Mitra Services</div>
            <div style="font-size: 10px; margin-top: 3px;">Date: ${safeNow} | ${safeReceiptNo}</div>
          </div>

          <div class="row">
            <span>Doc / File:</span>
            <span class="bold">${safeFileName}</span>
          </div>
          <div class="row">
            <span>Pages &amp; Copies:</span>
            <span>${totalPages} Pages x ${copies} Copy</span>
          </div>
          <div class="row">
            <span>Mode / Paper:</span>
            <span>${safeMode} (${safePaper})</span>
          </div>

          <div class="divider"></div>

          ${pricingSummary.bwCount > 0 ? `
          <div class="row">
            <span>B&amp;W Pages (${pricingSummary.bwCount}p):</span>
            <span>₹${pricingSummary.bwTotal}</span>
          </div>` : ''}

          ${pricingSummary.colorCount > 0 ? `
          <div class="row">
            <span>Color Pages (${pricingSummary.colorCount}p):</span>
            <span>₹${pricingSummary.colorTotal}</span>
          </div>` : ''}

          ${pricingSummary.addOns > 0 ? `
          <div class="row">
            <span>Add-ons (Lamination/Spiral):</span>
            <span>₹${pricingSummary.addOns}</span>
          </div>` : ''}

          <div class="row total-row">
            <span>GRAND TOTAL:</span>
            <span>₹${pricingSummary.grandTotal}</span>
          </div>

          ${upiQrDataUrl ? `
          <div class="qr-box">
            <img src="${upiQrDataUrl}" />
            <div style="font-size: 10px; font-weight: bold; margin-top: 2px;">SCAN TO PAY VIA UPI</div>
            <div style="font-size: 9px; color: #555;">${safeUpiId}</div>
          </div>` : ''}

          <div class="footer">
            <div>*** Thank You! Visit Again ***</div>
            <div style="font-size: 8px; margin-top: 4px; color: #888;">Powered by PDF Media Suite</div>
          </div>

          <script>
            window.onload = function() {
              window.focus();
              window.print();
              window.onafterprint = function() { window.close(); };
            };
          </script>
        </body>
      </html>
    `);
    printWin.document.close();
  };

  return (
    <ToolWorkspaceShell
      title="Print Cost & Dynamic UPI QR Generator"
      subtitle="Auto-counts color vs black & white pages in 1-click and generates a live UPI QR for the exact amount."
      categoryLabel="Auto Color Detection & Instant UPI QR"
      icon={Calculator}
      microVariant="compress"
      tone="emerald"
      trustNote="100% browser pixel inspection • Rate cards stored only in local browser"
    >
      <div className="w-full max-w-6xl mx-auto space-y-8">
        {/* Top Action Strip */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold pms-glass-panel text-[var(--pms-ink)] hover:border-emerald-400/60 transition-colors"
          >
            <Settings className="w-4 h-4 text-[var(--pms-muted)]" />
            {showSettings ? 'Hide Rates' : 'Configure Shop Rates'}
          </button>
          {file && (
            <button
              onClick={() => setShowKioskModal(true)}
              className="pms-btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold"
            >
              <QrCode className="w-4 h-4" /> Customer Pay QR
            </button>
          )}
        </div>

        {/* Shop Rates & UPI Configuration Card */}
        {showSettings && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.2 }}
            className="p-6 rounded-3xl pms-glass-panel space-y-5"
          >
            <div className="flex items-center justify-between border-b border-[var(--pms-border)] pb-3">
              <h2 className="text-base font-bold text-[var(--pms-ink)] flex items-center gap-2">
                <Settings className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Shopkeeper Rate Card &amp; UPI Setup
              </h2>
              <span className="text-xs text-[var(--pms-muted)]">Saved in this browser permanently</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-[var(--pms-ink)] mb-1">
                  B&amp;W Single Side (₹)
                </label>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={rateBwSingle}
                  onChange={(e) => setRateBwSingle(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 text-sm font-bold text-[var(--pms-ink)] outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--pms-ink)] mb-1">
                  B&amp;W Duplex Sheet (₹)
                </label>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={rateBwDuplex}
                  onChange={(e) => setRateBwDuplex(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 text-sm font-bold text-[var(--pms-ink)] outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--pms-ink)] mb-1">
                  Color Single Side (₹)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={rateColorSingle}
                  onChange={(e) => setRateColorSingle(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 text-sm font-bold text-[var(--pms-ink)] outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--pms-ink)] mb-1">
                  Color Duplex Sheet (₹)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={rateColorDuplex}
                  onChange={(e) => setRateColorDuplex(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 text-sm font-bold text-[var(--pms-ink)] outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-[var(--pms-ink)] mb-1">
                  Shop UPI ID (GPay / PhonePe / Paytm)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 9876543210@paytm or shop@okhdfcbank"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 text-sm text-[var(--pms-ink)] outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--pms-ink)] mb-1">
                  Shop / Business Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sharma Xerox & Online Services"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 text-sm text-[var(--pms-ink)] outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleClearSettings}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold border border-[var(--pms-border)] bg-white/60 dark:bg-slate-900/60 text-[var(--pms-muted)] hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 transition-all"
              >
                Clear Saved Shop Info
              </button>
              <button
                onClick={handleSaveSettings}
                className="pms-btn-primary inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold"
              >
                {savedSettingsSuccess ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Save className="w-3.5 h-3.5" />}
                {savedSettingsSuccess ? 'Saved Successfully!' : 'Save Shop Settings'}
              </button>
            </div>
          </motion.div>
        )}

        {/* Upload State */}
        {!file && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.22 }}
            className="w-full max-w-2xl mx-auto"
          >
            <FileDropzone
              onDrop={(files) => files[0] && handleFileUpload(files[0])}
              multiple={false}
              accept={{ 'application/pdf': ['.pdf'] }}
              title="Drop Customer PDF Here to Calculate Cost"
              subtitle="Scans all pages in 1 second, checks color vs B&W distribution, and displays the exact bill & UPI QR."
            />
          </motion.div>
        )}

        {/* Analyzing Progress */}
        {isAnalyzing && (
          <div className="p-10 rounded-3xl pms-glass-panel text-center space-y-4 relative overflow-hidden max-w-xl mx-auto">
            <PearlScanOverlay active={isAnalyzing} label="Inspecting chromatic pixels across pages..." />
            <div className="w-12 h-12 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin mx-auto" />
            <h4 className="text-base font-bold text-[var(--pms-ink)]">
              Analyzing Pages &amp; Color Inks... <AnimatedNumber value={analysisProgress} suffix="%" />
            </h4>
            <div className="w-full max-w-md mx-auto bg-white/70 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden border border-[var(--pms-border)]">
              <div
                className="bg-emerald-500 h-2.5 rounded-full transition-all duration-200"
                style={{ width: `${analysisProgress}%` }}
              />
            </div>
            <p className="text-xs text-[var(--pms-muted)]">Inspecting chromatic pixels to distinguish B&amp;W from Color sheets...</p>
          </div>
        )}

        {/* Main Cost & QR Dashboard */}
        {file && !isAnalyzing && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.24 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8"
          >
            {/* Left Column: Job Configuration & Breakdown */}
            <div className="lg:col-span-7 space-y-6">
              {/* Document Info Card */}
              <div className="p-5 rounded-2xl pms-glass-panel flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/70 dark:border-emerald-800/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-[var(--pms-ink)] truncate">{file.name}</h3>
                    <p className="text-xs text-[var(--pms-muted)]">
                      {totalPages} Pages total • {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setFile(null);
                    setPageDetails([]);
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-[var(--pms-border)] bg-white/60 dark:bg-slate-900/60 text-[var(--pms-muted)] hover:text-[var(--pms-ink)] transition-colors shrink-0"
                >
                  Change File
                </button>
              </div>

              {/* Job Options */}
              <div className="p-6 rounded-3xl pms-glass-panel space-y-5">
                <h4 className="text-sm font-bold uppercase tracking-wider text-[var(--pms-muted)]">Print Specifications</h4>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {/* Print Mode */}
                  <div>
                    <label className="block text-xs font-bold text-[var(--pms-ink)] mb-1.5">Sides</label>
                    <div className="grid grid-cols-2 gap-1 bg-white/60 dark:bg-slate-800/80 border border-[var(--pms-border)] p-1 rounded-xl">
                      <button
                        onClick={() => setPrintMode('single')}
                        className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                          printMode === 'single'
                            ? 'bg-white dark:bg-slate-900 text-[var(--pms-ink)] shadow-sm'
                            : 'text-[var(--pms-muted)]'
                        }`}
                      >
                        Single
                      </button>
                      <button
                        onClick={() => setPrintMode('duplex')}
                        className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                          printMode === 'duplex'
                            ? 'bg-white dark:bg-slate-900 text-[var(--pms-ink)] shadow-sm'
                            : 'text-[var(--pms-muted)]'
                        }`}
                      >
                        Both Sides
                      </button>
                    </div>
                  </div>

                  {/* Color Override */}
                  <div>
                    <label className="block text-xs font-bold text-[var(--pms-ink)] mb-1.5">Color Option</label>
                    <select
                      value={colorOverride}
                      onChange={(e) => setColorOverride(e.target.value as any)}
                      className="w-full py-2 px-2.5 rounded-xl bg-white/75 dark:bg-slate-800/80 border border-[var(--pms-border)] text-xs font-bold text-[var(--pms-ink)] outline-none"
                    >
                      <option value="auto">Auto-Detect Inks</option>
                      <option value="all_bw">Force All B&amp;W (Black)</option>
                      <option value="all_color">Force All Color</option>
                    </select>
                  </div>

                  {/* Copies */}
                  <div>
                    <label className="block text-xs font-bold text-[var(--pms-ink)] mb-1.5">No. of Copies</label>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCopies(Math.max(1, copies - 1))}
                        className="w-8 h-8 rounded-lg bg-white/75 dark:bg-slate-800/80 border border-[var(--pms-border)] font-bold text-sm text-[var(--pms-ink)]"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={copies}
                        onChange={(e) => setCopies(Math.max(1, Number(e.target.value)))}
                        className="w-12 text-center py-1.5 bg-white/75 dark:bg-slate-800/80 border border-[var(--pms-border)] text-[var(--pms-ink)] font-bold text-sm rounded-lg outline-none"
                      />
                      <button
                        onClick={() => setCopies(copies + 1)}
                        className="w-8 h-8 rounded-lg bg-white/75 dark:bg-slate-800/80 border border-[var(--pms-border)] font-bold text-sm text-[var(--pms-ink)]"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Paper Size & Addons */}
                <div className="pt-2 border-t border-[var(--pms-border)] flex flex-wrap items-center gap-4 text-xs font-medium text-[var(--pms-ink)]">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[var(--pms-muted)]">Paper:</span>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        checked={paperType === 'a4'}
                        onChange={() => setPaperType('a4')}
                        className="text-emerald-600"
                      />
                      A4 Normal
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        checked={paperType === 'legal'}
                        onChange={() => setPaperType('legal')}
                        className="text-emerald-600"
                      />
                      Legal (+25%)
                    </label>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-bold text-[var(--pms-muted)]">Add-ons:</span>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={addSpiral}
                        onChange={(e) => setAddSpiral(e.target.checked)}
                        className="rounded text-emerald-600"
                      />
                      Spiral Binding (+₹30)
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={addLamination}
                        onChange={(e) => setAddLamination(e.target.checked)}
                        className="rounded text-emerald-600"
                      />
                      Lamination (+₹20)
                    </label>
                  </div>
                </div>
              </div>

              {/* Page-by-Page Color Breakdown Table */}
              <div className="p-6 rounded-3xl pms-glass-panel space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-sm font-bold text-[var(--pms-ink)] flex items-center gap-2">
                    <Palette className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Page-by-Page Ink Distribution
                  </h4>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 font-bold text-[var(--pms-ink)]">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-900 dark:bg-slate-300" />
                      {pricingSummary.bwCount} B&amp;W
                    </span>
                    <span className="flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                      {pricingSummary.colorCount} Color
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 max-h-48 overflow-y-auto p-1">
                  {pageDetails.map((p) => {
                    const isColorPage =
                      colorOverride === 'all_color'
                        ? true
                        : colorOverride === 'all_bw'
                        ? false
                        : p.isColor;

                    return (
                      <div
                        key={p.pageNum}
                        className={`p-2 rounded-xl text-center border text-xs font-bold transition-all ${
                          isColorPage
                            ? 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400'
                            : 'bg-white/60 dark:bg-slate-800/60 border-[var(--pms-border)] text-[var(--pms-ink)]'
                        }`}
                      >
                        <div className="text-[10px] opacity-60">P.{p.pageNum}</div>
                        <div className="text-xs">{isColorPage ? '🎨 Color' : '📄 B&W'}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Column: Billing Total & Live Dynamic UPI QR */}
            <div className="lg:col-span-5 space-y-6">
              <div className="p-7 rounded-3xl pms-glass-panel border border-emerald-500/30 space-y-6">
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-bold text-emerald-600 dark:text-emerald-400">
                    Total Print Bill
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-5xl font-black text-[var(--pms-ink)]">
                      <AnimatedNumber value={pricingSummary.grandTotal} decimals={0} prefix="₹" />
                    </span>
                    <span className="text-xs text-[var(--pms-muted)] font-medium">({copies} Copy)</span>
                  </div>
                </div>

                {/* Itemized Receipt breakdown */}
                <div className="space-y-2 py-3 border-y border-[var(--pms-border)] text-xs">
                  <div className="flex justify-between text-[var(--pms-ink)]">
                    <span>
                      Black &amp; White ({pricingSummary.bwCount} pages × {copies})
                    </span>
                    <span className="font-bold">₹{pricingSummary.bwTotal}</span>
                  </div>
                  <div className="flex justify-between text-[var(--pms-ink)]">
                    <span>
                      Color ({pricingSummary.colorCount} pages × {copies})
                    </span>
                    <span className="font-bold">₹{pricingSummary.colorTotal}</span>
                  </div>
                  {pricingSummary.addOns > 0 && (
                    <div className="flex justify-between text-[var(--pms-ink)]">
                      <span>Binding / Lamination</span>
                      <span className="font-bold">₹{pricingSummary.addOns}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold pt-1.5 border-t border-[var(--pms-border)]">
                    <span>Payable to {shopName}</span>
                    <span>₹{pricingSummary.grandTotal}</span>
                  </div>
                </div>

                {/* Scannable Dynamic UPI QR Code (always crisp white pad for reliable phone scanning) */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col items-center text-center shadow-inner">
                  {upiQrDataUrl ? (
                    <img
                      src={upiQrDataUrl}
                      alt="Scan UPI QR"
                      className="w-48 h-48 object-contain rounded-xl"
                    />
                  ) : (
                    <div className="w-48 h-48 rounded-xl bg-slate-100 flex items-center justify-center text-xs text-slate-500">
                      Generating local UPI QR...
                    </div>
                  )}
                  <div className="mt-3">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Scan to Pay ₹{pricingSummary.grandTotal}
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-500 font-semibold">
                      GPay • PhonePe • Paytm • BHIM UPI
                    </p>
                    <p className="text-[10px] text-slate-400">UPI ID: {upiId}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={handlePrintBillSlip}
                    className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] text-[var(--pms-ink)] hover:bg-white dark:hover:bg-slate-800 transition-colors"
                  >
                    <Printer className="w-4 h-4" /> Print Bill Slip
                  </button>
                  <button
                    onClick={() => setShowKioskModal(true)}
                    className="pms-btn-primary flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold"
                  >
                    <Maximize2 className="w-4 h-4" /> Show Customer
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Fullscreen Customer Facing QR Modal */}
        {showKioskModal && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: prefersReduced ? 0 : 0.2 }}
              className="pms-glass-panel rounded-3xl p-8 max-w-sm w-full text-center space-y-6 shadow-2xl"
            >
              <div>
                <span className="text-xs uppercase tracking-wider font-extrabold text-emerald-600 dark:text-emerald-400">
                  {shopName}
                </span>
                <h3 className="text-4xl font-black text-[var(--pms-ink)] mt-1">
                  ₹{pricingSummary.grandTotal}
                </h3>
                <p className="text-xs text-[var(--pms-muted)] mt-1">
                  {totalPages} Pages ({pricingSummary.bwCount} B&amp;W, {pricingSummary.colorCount} Color)
                </p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 flex justify-center shadow-inner">
                {upiQrDataUrl ? (
                  <img
                    src={upiQrDataUrl}
                    alt="Dynamic UPI QR"
                    className="w-60 h-60 object-contain rounded-xl"
                  />
                ) : (
                  <div className="w-60 h-60 rounded-xl bg-slate-100 flex items-center justify-center text-xs text-slate-500">
                    Generating local UPI QR...
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold text-[var(--pms-ink)]">
                  Scan with any UPI App to Pay Exact ₹{pricingSummary.grandTotal}
                </div>
                <div className="text-[11px] text-[var(--pms-muted)]">
                  Google Pay • PhonePe • Paytm • Any Bank App
                </div>
              </div>

              <button
                onClick={() => setShowKioskModal(false)}
                className="pms-btn-primary w-full py-3 rounded-xl font-bold text-xs"
              >
                Close Display
              </button>
            </motion.div>
          </div>
        )}

        {/* SEO Information */}
        <ToolSEOSection
          toolName="Print Cost & Dynamic UPI QR Generator"
          headline="Instant Photocopy Bill Calculator with Color Page Recognition & UPI Scan-to-Pay"
          description="A specialized counter utility for Xerox shops, E-Mitra centers, and Cyber Cafes. Drop any customer PDF to automatically calculate the exact cost based on B&W and color page counts, single-sided or duplex print options, and custom shop rate cards. Instantly presents a dynamic UPI QR code for seamless cashless payments."
        />
      </div>
    </ToolWorkspaceShell>
  );
}
