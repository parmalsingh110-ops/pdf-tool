import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  Printer,
  FileCheck2,
  Sliders,
  Scale,
  ShieldCheck,
  ChevronRight,
  Eye,
  Smartphone,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import ShareQrModal from '../components/ShareQrModal';
import { downloadBlob } from '../lib/utils';

// State Presets for Indian E-Stamp Papers (offset in inches from top)
const STATE_PRESETS = [
  { id: 'rajasthan', name: 'Rajasthan E-Stamp', offsetInches: 5.5, desc: '5.5" top margin for Treasury Barcode' },
  { id: 'delhi_up', name: 'Delhi / UP / Haryana', offsetInches: 5.25, desc: '5.25" top margin' },
  { id: 'maha_guj', name: 'Maharashtra / Gujarat', offsetInches: 4.75, desc: '4.75" top margin' },
  { id: 'mp_bihar', name: 'Madhya Pradesh / Bihar', offsetInches: 5.0, desc: '5.0" top margin' },
  { id: 'south', name: 'Karnataka / Tamil Nadu', offsetInches: 4.5, desc: '4.5" top margin' },
  { id: 'custom', name: 'Custom Offset', offsetInches: 5.5, desc: 'Manual slider control' },
];

export default function StampPaperAligner() {
  useSEO(
    'E-Stamp Paper Margin & Print Aligner Online — Rajasthan, Delhi, UP Legal Deed',
    'Align rent agreements, affidavits and legal deeds for printing on ₹50, ₹100, ₹500 E-Stamp paper. Automatically shifts Page 1 text below the government header.'
  );

  usePageSEO(
    'E-Stamp Paper Margin Aligner — Print Agreement on Stamp Paper',
    'Free online legal tool for advocates, deed writers, E-Mitra and notaries to set exact top margin for printing agreements on e-Stamp paper. Fits text below the barcode cleanly.',
    'stamp paper print margin, estamp paper print format, rent agreement print on stamp paper, affidavit margin aligner, rajasthan e stamp print margin, notary deed margin',
    '/stamp-paper-aligner'
  );

  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [selectedPreset, setSelectedPreset] = useState<string>('rajasthan');
  const [topOffsetInches, setTopOffsetInches] = useState<number>(5.5);
  const [leftGutterInches, setLeftGutterInches] = useState<number>(0.75); // Filing space
  const [applyOnlyToPageOne, setApplyOnlyToPageOne] = useState<boolean>(true);
  const [fitMode, setFitMode] = useState<'scale_fit' | 'shift_down'>('scale_fit');
  const [showStampWatermark, setShowStampWatermark] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);

  // Handle PDF upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setIsProcessing(true);

    try {
      const buffer = await selected.arrayBuffer();
      const u8 = new Uint8Array(buffer);
      setPdfBytes(u8);

      const loadingTask = pdfjsLib.getDocument({ data: u8.slice(0) });
      const pdf = await loadingTask.promise;
      setPageCount(pdf.numPages);
    } catch (err) {
      console.error('Error reading PDF:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Generate preview of Page 1 with adjusted margin & e-stamp guide
  useEffect(() => {
    if (!pdfBytes) return;

    let isMounted = true;
    const renderPreview = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice(0) });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        const scale = 1.5;
        const viewport = page.getViewport({ scale });

        // Source page canvas
        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = viewport.width;
        srcCanvas.height = viewport.height;
        const srcCtx = srcCanvas.getContext('2d');
        if (!srcCtx) return;

        await page.render({ canvasContext: srcCtx, viewport, canvas: srcCanvas } as any).promise;

        // Target Canvas (Standard A4)
        const targetCanvas = document.createElement('canvas');
        targetCanvas.width = viewport.width;
        targetCanvas.height = viewport.height;
        const tCtx = targetCanvas.getContext('2d');
        if (!tCtx) return;

        // White paper background
        tCtx.fillStyle = '#ffffff';
        tCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);

        // Calculate offset in pixels based on viewport height (A4 is 11.69 inches)
        const pxPerInch = viewport.height / 11.69;
        const topPx = topOffsetInches * pxPerInch;
        const leftPx = leftGutterInches * pxPerInch;

        if (fitMode === 'scale_fit') {
          // Scale content to fit in remaining height
          const availHeight = viewport.height - topPx - (0.5 * pxPerInch); // 0.5" bottom margin
          const availWidth = viewport.width - leftPx - (0.5 * pxPerInch);  // 0.5" right margin
          const scaleFactor = Math.min(availWidth / viewport.width, availHeight / viewport.height, 1.0);

          const drawW = viewport.width * scaleFactor;
          const drawH = viewport.height * scaleFactor;
          tCtx.drawImage(srcCanvas, leftPx, topPx, drawW, drawH);
        } else {
          // Simple shift down
          tCtx.drawImage(srcCanvas, leftPx, topPx);
        }

        // Draw translucent Simulated E-Stamp Paper Header
        if (showStampWatermark) {
          tCtx.fillStyle = 'rgba(239, 246, 255, 0.75)'; // Soft blue tint
          tCtx.fillRect(0, 0, targetCanvas.width, topPx);

          // Government Seal Placeholder Banner
          tCtx.strokeStyle = '#3b82f6';
          tCtx.setLineDash([6, 6]);
          tCtx.lineWidth = 2;
          tCtx.strokeRect(20, 20, targetCanvas.width - 40, topPx - 30);
          tCtx.setLineDash([]);

          // Safe Printing Line
          tCtx.strokeStyle = '#ef4444';
          tCtx.lineWidth = 2;
          tCtx.beginPath();
          tCtx.moveTo(0, topPx);
          tCtx.lineTo(targetCanvas.width, topPx);
          tCtx.stroke();

          // Labels
          tCtx.fillStyle = '#1e40af';
          tCtx.font = 'bold 16px sans-serif';
          tCtx.fillText('🏛️ GOVERNMENT E-STAMP CERTIFICATE & BARCODE REGION', 35, 55);

          tCtx.fillStyle = '#64748b';
          tCtx.font = '13px sans-serif';
          tCtx.fillText(`Reserved Top Space: ${topOffsetInches} inches (${Math.round(topOffsetInches * 25.4)} mm)`, 35, 80);

          tCtx.fillStyle = '#dc2626';
          tCtx.font = 'bold 13px sans-serif';
          tCtx.fillText('⬇ SAFE PRINTING LINE (Agreement text starts below this line)', 35, topPx - 10);
        }

        // Left Gutter guide line
        if (leftGutterInches > 0) {
          tCtx.strokeStyle = '#cbd5e1';
          tCtx.setLineDash([4, 4]);
          tCtx.beginPath();
          tCtx.moveTo(leftPx, 0);
          tCtx.lineTo(leftPx, targetCanvas.height);
          tCtx.stroke();
          tCtx.setLineDash([]);
        }

        if (isMounted) {
          setPreviewImageUrl(targetCanvas.toDataURL('image/jpeg', 0.92));
        }
      } catch (err) {
        console.error('Error rendering preview:', err);
      }
    };

    renderPreview();
    return () => {
      isMounted = false;
    };
  }, [pdfBytes, topOffsetInches, leftGutterInches, fitMode, showStampWatermark]);

  // Export processed PDF with exact page modifications
  const handleDownloadPdf = async () => {
    if (!pdfBytes) return;
    setIsProcessing(true);

    try {
      const srcPdf = await PDFDocument.load(pdfBytes);
      const outPdf = await PDFDocument.create();

      const numPages = srcPdf.getPageCount();
      // 72 points per inch
      const topOffsetPt = topOffsetInches * 72;
      const leftGutterPt = leftGutterInches * 72;

      for (let i = 0; i < numPages; i++) {
        const [embeddedPage] = await outPdf.embedPdf(srcPdf, [i]);
        const origW = embeddedPage.width;
        const origH = embeddedPage.height;

        const newPage = outPdf.addPage([origW, origH]);

        const shouldShift = !applyOnlyToPageOne || i === 0;

        if (shouldShift) {
          if (fitMode === 'scale_fit') {
            const availW = origW - leftGutterPt - 36; // 0.5" right margin
            const availH = origH - topOffsetPt - 36;  // 0.5" bottom margin
            const scale = Math.min(availW / origW, availH / origH, 1.0);

            const scaledW = origW * scale;
            const scaledH = origH * scale;

            // In PDF coords, origin (0,0) is bottom-left
            const drawX = leftGutterPt;
            const drawY = origH - topOffsetPt - scaledH;

            newPage.drawPage(embeddedPage, {
              x: drawX,
              y: Math.max(20, drawY),
              width: scaledW,
              height: scaledH,
            });
          } else {
            // Shift down
            const drawX = leftGutterPt;
            const drawY = -topOffsetPt;
            newPage.drawPage(embeddedPage, {
              x: drawX,
              y: drawY,
              width: origW,
              height: origH,
            });
          }
        } else {
          // Standard page (Page 2, 3...)
          newPage.drawPage(embeddedPage, {
            x: 0,
            y: 0,
            width: origW,
            height: origH,
          });
        }
      }

      const outBytes = await outPdf.save();
      const blob = new Blob([outBytes as any], { type: 'application/pdf' });
      downloadBlob(blob, `stamp-paper-aligned-${Date.now()}.pdf`);
    } catch (err) {
      console.error('Error processing PDF:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-10 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold uppercase tracking-wider">
            <FileCheck2 className="w-4 h-4" /> Legal & Notary Aligner
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            E-Stamp Paper Margin & Print Aligner
          </h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
            Perfect printing for Rent Agreements, Affidavits, Deeds, and Undertakings on ₹50, ₹100, ₹500 e-Stamp paper. 
            Automatically adjusts Page 1 text below the government barcode line.
          </p>
        </div>

        {/* Upload State */}
        {!pdfBytes ? (
          <div className="max-w-2xl mx-auto">
            <label className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-amber-500 rounded-3xl cursor-pointer bg-white dark:bg-slate-900 transition-all shadow-sm group">
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Upload className="w-8 h-8" />
              </div>
              <span className="text-base font-bold text-slate-900 dark:text-white mb-1">
                Drop Agreement or Deed PDF Here
              </span>
              <span className="text-xs text-slate-400 text-center max-w-xs">
                Supports any Rent Agreement, Affidavit, Notary, Partnership Deed, or General Power of Attorney PDF.
              </span>
            </label>
          </div>
        ) : (
          /* Editor Layout */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Controls */}
            <div className="lg:col-span-5 space-y-5 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <span className="text-sm font-bold flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-500" /> Margin Settings
                </span>
                <button
                  onClick={() => {
                    setFile(null);
                    setPdfBytes(null);
                  }}
                  className="text-xs text-rose-500 hover:text-rose-600 font-semibold"
                >
                  Change PDF
                </button>
              </div>

              {/* State Presets */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Select State E-Stamp Format
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {STATE_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedPreset(p.id);
                        setTopOffsetInches(p.offsetInches);
                      }}
                      className={`p-2.5 rounded-xl border text-left font-medium transition ${
                        selectedPreset === p.id
                          ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="font-bold">{p.name}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{p.offsetInches}" top space</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Fine Offset Slider */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="text-slate-700 dark:text-slate-300">Top Space for Stamp Barcode</span>
                  <span className="px-2 py-0.5 bg-amber-500 text-white rounded font-mono text-[11px]">
                    {topOffsetInches.toFixed(2)}" ({Math.round(topOffsetInches * 25.4)} mm)
                  </span>
                </div>
                <input
                  type="range"
                  min="3.0"
                  max="8.0"
                  step="0.1"
                  value={topOffsetInches}
                  onChange={(e) => {
                    setSelectedPreset('custom');
                    setTopOffsetInches(parseFloat(e.target.value));
                  }}
                  className="w-full accent-amber-600"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>3.0" (Compact)</span>
                  <span>5.5" (Standard E-Stamp)</span>
                  <span>8.0" (Half Page)</span>
                </div>
              </div>

              {/* Left Gutter Margin for Advocate File Binding */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Left Gutter Margin (Advocate Tag / Binding Space)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'None (0")', val: 0 },
                    { label: 'Normal (0.75")', val: 0.75 },
                    { label: 'Wide (1.0")', val: 1.0 },
                  ].map((g) => (
                    <button
                      key={g.label}
                      onClick={() => setLeftGutterInches(g.val)}
                      className={`py-2 px-2 rounded-xl border text-xs font-bold text-center transition ${
                        leftGutterInches === g.val
                          ? 'border-amber-500 bg-amber-500 text-white shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fitting Mode */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Page 1 Content Fitting Mode
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    onClick={() => setFitMode('scale_fit')}
                    className={`p-2.5 rounded-xl border text-left font-medium transition ${
                      fitMode === 'scale_fit'
                        ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1">
                      <Scale className="w-3.5 h-3.5 text-amber-500" /> Scale to Fit
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Fits all text into bottom area without spilling to Page 2
                    </div>
                  </button>

                  <button
                    onClick={() => setFitMode('shift_down')}
                    className={`p-2.5 rounded-xl border text-left font-medium transition ${
                      fitMode === 'shift_down'
                        ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="font-bold">Natural Push Down</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Shifts content down at 100% original font size
                    </div>
                  </button>
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyOnlyToPageOne}
                    onChange={(e) => setApplyOnlyToPageOne(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-600 accent-amber-600"
                  />
                  <span>Apply margin only to Page 1 (Subsequent pages start at top)</span>
                </label>
                <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showStampWatermark}
                    onChange={(e) => setShowStampWatermark(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-600 accent-amber-600"
                  />
                  <span>Show simulated E-Stamp header guide on preview</span>
                </label>
              </div>

              {/* Export Buttons */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <button
                  onClick={handleDownloadPdf}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-sm shadow-md transition disabled:opacity-50"
                >
                  <Download className="w-4 h-4" /> Download Aligned PDF for Printing
                </button>
                <button
                  onClick={() => setShowQrModal(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-semibold text-xs transition"
                >
                  <Smartphone className="w-3.5 h-3.5" /> Send PDF to Mobile (WhatsApp / QR)
                </button>
              </div>
            </div>

            {/* Right Live Preview */}
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center">
              <div className="w-full flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-amber-500" /> Page 1 Stamp Paper Alignment Preview
                </span>
                <span className="text-xs font-semibold px-2.5 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 rounded-lg">
                  Total Pages: {pageCount}
                </span>
              </div>

              {previewImageUrl ? (
                <div className="w-full max-h-[640px] overflow-auto flex items-center justify-center p-4 bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <img
                    src={previewImageUrl}
                    alt="Stamp Paper Aligned Preview"
                    className="max-h-[580px] w-auto object-contain rounded shadow-lg border border-slate-300 dark:border-slate-700"
                  />
                </div>
              ) : (
                <div className="w-full h-96 flex items-center justify-center text-slate-400 text-xs">
                  Generating alignment preview...
                </div>
              )}
            </div>
          </div>
        )}

        {/* SEO Section */}
        <ToolSEOSection
          toolName="E-Stamp Paper Margin Aligner"
          headline="Print Rent Agreements and Affidavits Cleanly on E-Stamp Paper"
          description="Legal agreements printed on Indian ₹50, ₹100, or ₹500 e-Stamp paper require the top 5 to 6 inches to remain completely blank for government barcodes. This tool automatically aligns your document so Page 1 text starts cleanly below the safe line, while keeping Page 2 and subsequent pages full-length."
          steps={[
            {
              step: '01',
              title: 'Upload Legal Agreement PDF',
              desc: 'Select your draft rent agreement, affidavit, power of attorney, or deed PDF.',
            },
            {
              step: '02',
              title: 'Select State Format or Custom Offset',
              desc: 'Choose your state preset (Rajasthan 5.5", Delhi/UP 5.25", Maharashtra 4.75") or adjust the fine slider.',
            },
            {
              step: '03',
              title: 'Download & Insert Stamp Paper in Printer',
              desc: 'Download the aligned PDF and print directly. Page 1 prints cleanly below the treasury banner with zero overlapping.',
            },
          ]}
          features={[
            {
              title: 'Pre-Configured State Offsets',
              desc: 'Accurate offsets for Rajasthan, Delhi, UP, Maharashtra, Gujarat, Bihar, MP, and Karnataka e-stamp formats.',
            },
            {
              title: 'Scale to Fit Protection',
              desc: 'Proportionally shrinks Page 1 content so that legal clauses do not spill awkwardly onto the next page.',
            },
            {
              title: 'Advocate Left Gutter Space',
              desc: 'Adds 0.75" or 1.0" left margin for court filing tags, lace binding, and notary seals without obscuring text.',
            },
          ]}
          faqs={[
            {
              q: 'How much top margin is required for Rajasthan e-Stamp paper?',
              a: 'Rajasthan e-stamp papers require approximately 5.5 inches (140 mm) of blank space from the top for the e-Stamp certificate header and QR code.',
            },
            {
              q: 'Will this affect Page 2 and Page 3 of my agreement?',
              a: 'By default, the "Apply only to Page 1" option is enabled. Page 2, 3, etc. will print with standard full-page margins starting from the very top.',
            },
          ]}
        />

        {/* Mobile Transfer Modal */}
        <ShareQrModal
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          title="E-Stamp Paper Aligned PDF"
          fileName="stamp-paper-aligned.pdf"
        />
      </div>
    </div>
  );
}
