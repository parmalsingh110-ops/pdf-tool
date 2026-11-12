import React, { useState, useRef, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Calculator,
  Upload,
  Printer,
  QrCode,
  DollarSign,
  CheckCircle2,
  FileText,
  Palette,
  Layers,
  Settings,
  Sparkles,
  RotateCcw,
  Maximize2,
  ExternalLink,
  Save,
  Check,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
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
  const [showKioskModal, setShowKioskModal] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-2">
              <Calculator className="w-3.5 h-3.5" /> Auto Color Detection &amp; Instant UPI QR
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">
              Print Cost &amp; Dynamic UPI QR Generator
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Auto-counts color vs black &amp; white pages in 1-click and generates a live UPI QR for the exact amount.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-400 shadow-sm"
            >
              <Settings className="w-4 h-4 text-slate-500" />
              {showSettings ? 'Hide Rates' : 'Configure Shop Rates'}
            </button>
            {file && (
              <button
                onClick={() => setShowKioskModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-200 dark:shadow-none"
              >
                <QrCode className="w-4 h-4" /> Customer Pay QR
              </button>
            )}
          </div>
        </div>

        {/* Shop Rates & UPI Configuration Card */}
        {showSettings && (
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-emerald-600" /> Shopkeeper Rate Card &amp; UPI Setup
              </h2>
              <span className="text-xs text-slate-400">Saved in this browser permanently</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  B&amp;W Single Side (₹)
                </label>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={rateBwSingle}
                  onChange={(e) => setRateBwSingle(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  B&amp;W Duplex Sheet (₹)
                </label>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={rateBwDuplex}
                  onChange={(e) => setRateBwDuplex(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Color Single Side (₹)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={rateColorSingle}
                  onChange={(e) => setRateColorSingle(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Color Duplex Sheet (₹)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={rateColorDuplex}
                  onChange={(e) => setRateColorDuplex(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Shop UPI ID (GPay / PhonePe / Paytm)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 9876543210@paytm or shop@okhdfcbank"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Shop / Business Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sharma Xerox & Online Services"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={handleSaveSettings}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 transition-all"
              >
                {savedSettingsSuccess ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Save className="w-3.5 h-3.5" />}
                {savedSettingsSuccess ? 'Saved Successfully!' : 'Save Shop Settings'}
              </button>
            </div>
          </div>
        )}

        {/* Upload State */}
        {!file && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl p-12 text-center bg-white dark:bg-slate-900 hover:border-emerald-500 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/20 cursor-pointer transition-all group"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              accept="application/pdf"
              className="hidden"
            />
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <Upload className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Drop Customer PDF Here to Calculate Cost
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Scans all pages in 1 second, checks color vs B&amp;W distribution, and displays the exact bill &amp; QR.
            </p>
          </div>
        )}

        {/* Analyzing Progress */}
        {isAnalyzing && (
          <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-4">
            <div className="w-12 h-12 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin mx-auto" />
            <h4 className="text-base font-bold text-slate-900 dark:text-white">
              Analyzing Pages &amp; Color Inks... {analysisProgress}%
            </h4>
            <div className="w-full max-w-md mx-auto bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-2.5 rounded-full transition-all duration-200"
                style={{ width: `${analysisProgress}%` }}
              />
            </div>
            <p className="text-xs text-slate-400">Inspecting chromatic pixels to distinguish B&amp;W from Color sheets...</p>
          </div>
        )}

        {/* Main Cost & QR Dashboard */}
        {file && !isAnalyzing && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Job Configuration & Breakdown */}
            <div className="lg:col-span-7 space-y-6">
              {/* Document Info Card */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{file.name}</h3>
                    <p className="text-xs text-slate-500">
                      {totalPages} Pages total • {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setFile(null);
                    setPageDetails([]);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Change File
                </button>
              </div>

              {/* Job Options */}
              <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400">Print Specifications</h4>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {/* Print Mode */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Sides</label>
                    <div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                      <button
                        onClick={() => setPrintMode('single')}
                        className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                          printMode === 'single'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-500'
                        }`}
                      >
                        Single
                      </button>
                      <button
                        onClick={() => setPrintMode('duplex')}
                        className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                          printMode === 'duplex'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-500'
                        }`}
                      >
                        Both Sides
                      </button>
                    </div>
                  </div>

                  {/* Color Override */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Color Option</label>
                    <select
                      value={colorOverride}
                      onChange={(e) => setColorOverride(e.target.value as any)}
                      className="w-full py-2 px-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white border-0 outline-none"
                    >
                      <option value="auto">Auto-Detect Inks</option>
                      <option value="all_bw">Force All B&amp;W (Black)</option>
                      <option value="all_color">Force All Color</option>
                    </select>
                  </div>

                  {/* Copies */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">No. of Copies</label>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCopies(Math.max(1, copies - 1))}
                        className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold text-sm text-slate-700 dark:text-slate-300"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={copies}
                        onChange={(e) => setCopies(Math.max(1, Number(e.target.value)))}
                        className="w-12 text-center py-1.5 bg-slate-50 dark:bg-slate-800 font-bold text-sm rounded-lg"
                      />
                      <button
                        onClick={() => setCopies(copies + 1)}
                        className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold text-sm text-slate-700 dark:text-slate-300"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Paper Size & Addons */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-4 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-400">Paper:</span>
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
                    <span className="font-bold text-slate-400">Add-ons:</span>
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
              <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Palette className="w-4 h-4 text-emerald-600" /> Page-by-Page Ink Distribution
                  </h4>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 font-bold text-slate-900 dark:text-slate-100">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-900 dark:bg-slate-300" />
                      {pricingSummary.bwCount} B&amp;W
                    </span>
                    <span className="flex items-center gap-1 font-bold text-rose-600">
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
                            ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400'
                            : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
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
              <div className="p-7 rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 text-white shadow-xl space-y-6">
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-bold text-emerald-400">Total Print Bill</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-5xl font-black text-white">₹{pricingSummary.grandTotal}</span>
                    <span className="text-xs text-slate-400 font-medium">({copies} Copy)</span>
                  </div>
                </div>

                {/* Itemized Receipt breakdown */}
                <div className="space-y-2 py-3 border-y border-slate-800 text-xs">
                  <div className="flex justify-between text-slate-300">
                    <span>
                      Black &amp; White ({pricingSummary.bwCount} pages × {copies})
                    </span>
                    <span className="font-bold">₹{pricingSummary.bwTotal}</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>
                      Color ({pricingSummary.colorCount} pages × {copies})
                    </span>
                    <span className="font-bold">₹{pricingSummary.colorTotal}</span>
                  </div>
                  {pricingSummary.addOns > 0 && (
                    <div className="flex justify-between text-slate-300">
                      <span>Binding / Lamination</span>
                      <span className="font-bold">₹{pricingSummary.addOns}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-emerald-400 font-bold pt-1 border-t border-slate-800">
                    <span>Payable to {shopName}</span>
                    <span>₹{pricingSummary.grandTotal}</span>
                  </div>
                </div>

                {/* Scannable Dynamic UPI QR Code */}
                <div className="bg-white p-4 rounded-2xl flex flex-col items-center text-center shadow-inner">
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
                    className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition-colors"
                  >
                    <Printer className="w-4 h-4" /> Print Bill Slip
                  </button>
                  <button
                    onClick={() => setShowKioskModal(true)}
                    className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-950 transition-colors"
                  >
                    <Maximize2 className="w-4 h-4" /> Show Customer
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Fullscreen Customer Facing QR Modal */}
        {showKioskModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-sm w-full text-center space-y-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
              <div>
                <span className="text-xs uppercase tracking-wider font-extrabold text-emerald-600">
                  {shopName}
                </span>
                <h3 className="text-4xl font-black text-slate-900 dark:text-white mt-1">
                  ₹{pricingSummary.grandTotal}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {totalPages} Pages ({pricingSummary.bwCount} B&amp;W, {pricingSummary.colorCount} Color)
                </p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 flex justify-center">
                {upiQrDataUrl ? (
                  <img
                    src={upiQrDataUrl}
                    alt="Dynamic UPI QR"
                    className="w-60 h-60 object-contain rounded-xl"
                  />
                ) : (
                  <div className="w-60 h-60 rounded-xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-xs text-slate-500">
                    Generating local UPI QR...
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Scan with any UPI App to Pay Exact ₹{pricingSummary.grandTotal}
                </div>
                <div className="text-[11px] text-slate-400">
                  Google Pay • PhonePe • Paytm • Any Bank App
                </div>
              </div>

              <button
                onClick={() => setShowKioskModal(false)}
                className="w-full py-3 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs hover:opacity-90 transition-opacity"
              >
                Close Display
              </button>
            </div>
          </div>
        )}

        {/* SEO Information */}
        <ToolSEOSection
          toolName="Print Cost & Dynamic UPI QR Generator"
          headline="Instant Photocopy Bill Calculator with Color Page Recognition & UPI Scan-to-Pay"
          description="A specialized counter utility for Xerox shops, E-Mitra centers, and Cyber Cafes. Drop any customer PDF to automatically calculate the exact cost based on B&W and color page counts, single-sided or duplex print options, and custom shop rate cards. Instantly presents a dynamic UPI QR code for seamless cashless payments."
        />
      </div>
    </div>
  );
}
