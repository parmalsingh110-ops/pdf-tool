import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  Printer,
  BookMarked,
  Sliders,
  CheckCircle2,
  Smartphone,
  Eye,
  FileText,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Scale,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import ShareQrModal from '../components/ShareQrModal';
import { downloadBlob } from '../lib/utils';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';

type BindingMode = 'single_sided' | 'double_sided' | 'top_binding';

export default function BindingMargin() {
  useSEO(
    'Thesis & Book Binding Gutter Margin Adder — Add Spiral & Mirrored Margins Online',
    'Add left gutter margins or alternating mirrored margins for spiral binding, thesis hard-binding, and court filing. Scale content so text is never cut off by binding rings.'
  );

  usePageSEO(
    'Thesis Binding Gutter Margin Adder — Spiral & Book Mirrored Margins',
    'Free online tool for university students, authors, and legal offices to add left gutter binding margins or mirrored double-sided margins to PDF documents before printing.',
    'gutter margin pdf, add binding margin to pdf, spiral binding margin online, thesis binding margin format, mirrored margins pdf online, book binding gutter space',
    '/binding-margin'
  );

  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [bindingMode, setBindingMode] = useState<BindingMode>('single_sided');
  const [gutterInches, setGutterInches] = useState<number>(1.0); // 1.0 inch default for thesis
  const [scaleContent, setScaleContent] = useState<boolean>(true);
  const [showSpiralGuide, setShowSpiralGuide] = useState<boolean>(true);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);

  // Load uploaded PDF
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
      setActivePageIndex(0);
    } catch (err) {
      console.error('Error reading PDF for binding margin:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Render preview of current page with gutter margin and spiral guide
  useEffect(() => {
    if (!pdfBytes) return;

    let isMounted = true;
    const renderPagePreview = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice(0) });
        const pdf = await loadingTask.promise;
        const pageNum = Math.min(activePageIndex + 1, pdf.numPages);
        const page = await pdf.getPage(pageNum);

        const scale = 1.4;
        const viewport = page.getViewport({ scale });

        // Source Page Canvas
        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = viewport.width;
        srcCanvas.height = viewport.height;
        const srcCtx = srcCanvas.getContext('2d');
        if (!srcCtx) return;

        await page.render({ canvasContext: srcCtx, viewport, canvas: srcCanvas } as any).promise;

        // Target A4 Canvas
        const targetCanvas = document.createElement('canvas');
        targetCanvas.width = viewport.width;
        targetCanvas.height = viewport.height;
        const tCtx = targetCanvas.getContext('2d');
        if (!tCtx) return;

        // White paper background
        tCtx.fillStyle = '#ffffff';
        tCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);

        // Calculate gutter in pixels based on 8.27" width (A4)
        const pxPerInch = viewport.width / 8.27;
        const gutterPx = gutterInches * pxPerInch;

        // Determine margin side:
        // In double-sided mode: Odd pages (1, 3, 5) get Left margin, Even pages (2, 4, 6) get Right margin
        let isLeftGutter = true;
        let isTopGutter = false;

        if (bindingMode === 'top_binding') {
          isTopGutter = true;
        } else if (bindingMode === 'double_sided') {
          isLeftGutter = pageNum % 2 !== 0; // Odd = Left, Even = Right
        }

        let drawX = 0;
        let drawY = 0;
        let drawW = viewport.width;
        let drawH = viewport.height;

        if (scaleContent) {
          if (isTopGutter) {
            const availH = viewport.height - gutterPx;
            const sFactor = availH / viewport.height;
            drawW = viewport.width * sFactor;
            drawH = availH;
            drawX = (viewport.width - drawW) / 2;
            drawY = gutterPx;
          } else {
            const availW = viewport.width - gutterPx;
            const sFactor = availW / viewport.width;
            drawW = availW;
            drawH = viewport.height * sFactor;
            drawX = isLeftGutter ? gutterPx : 0;
            drawY = (viewport.height - drawH) / 2;
          }
          tCtx.drawImage(srcCanvas, drawX, drawY, drawW, drawH);
        } else {
          // Direct shift
          drawX = isTopGutter ? 0 : isLeftGutter ? gutterPx : -gutterPx;
          drawY = isTopGutter ? gutterPx : 0;
          tCtx.drawImage(srcCanvas, drawX, drawY);
        }

        // Visual Binding Guides (Spiral Rings or Punch Holes)
        if (showSpiralGuide) {
          if (isTopGutter) {
            // Draw top punch holes
            tCtx.fillStyle = 'rgba(239, 68, 68, 0.08)';
            tCtx.fillRect(0, 0, targetCanvas.width, gutterPx);

            tCtx.strokeStyle = '#ef4444';
            tCtx.lineWidth = 1.5;
            tCtx.setLineDash([6, 6]);
            tCtx.beginPath();
            tCtx.moveTo(0, gutterPx);
            tCtx.lineTo(targetCanvas.width, gutterPx);
            tCtx.stroke();
            tCtx.setLineDash([]);

            // Draw holes
            const numHoles = 14;
            const holeStep = targetCanvas.width / (numHoles + 1);
            for (let i = 1; i <= numHoles; i++) {
              tCtx.fillStyle = '#64748b';
              tCtx.beginPath();
              tCtx.arc(i * holeStep, gutterPx / 2, 7, 0, Math.PI * 2);
              tCtx.fill();
            }
          } else {
            // Left or Right Gutter
            const gutterX = isLeftGutter ? 0 : targetCanvas.width - gutterPx;
            tCtx.fillStyle = 'rgba(239, 68, 68, 0.08)';
            tCtx.fillRect(gutterX, 0, gutterPx, targetCanvas.height);

            // Dividing guideline
            tCtx.strokeStyle = '#ef4444';
            tCtx.lineWidth = 1.5;
            tCtx.setLineDash([6, 6]);
            tCtx.beginPath();
            const lineX = isLeftGutter ? gutterPx : targetCanvas.width - gutterPx;
            tCtx.moveTo(lineX, 0);
            tCtx.lineTo(lineX, targetCanvas.height);
            tCtx.stroke();
            tCtx.setLineDash([]);

            // Draw spiral binding rings
            const numRings = 24;
            const ringStep = targetCanvas.height / (numRings + 1);
            const ringX = isLeftGutter ? gutterPx / 2 : targetCanvas.width - gutterPx / 2;

            for (let i = 1; i <= numRings; i++) {
              const rY = i * ringStep;
              // Hole
              tCtx.fillStyle = '#475569';
              tCtx.beginPath();
              tCtx.arc(ringX, rY, 6, 0, Math.PI * 2);
              tCtx.fill();

              // Metal ring wire
              tCtx.strokeStyle = '#94a3b8';
              tCtx.lineWidth = 3;
              tCtx.beginPath();
              tCtx.ellipse(ringX + (isLeftGutter ? -10 : 10), rY, 14, 5, 0, 0, Math.PI * 2);
              tCtx.stroke();
            }

            // Gutter Label
            tCtx.save();
            tCtx.translate(isLeftGutter ? 24 : targetCanvas.width - 10, targetCanvas.height / 2);
            tCtx.rotate(-Math.PI / 2);
            tCtx.fillStyle = '#dc2626';
            tCtx.font = 'bold 13px sans-serif';
            tCtx.textAlign = 'center';
            tCtx.fillText(`BINDING GUTTER SPACE: ${gutterInches}" (${Math.round(gutterInches * 25.4)} mm)`, 0, 0);
            tCtx.restore();
          }
        }

        if (isMounted) {
          setPreviewDataUrl(targetCanvas.toDataURL('image/jpeg', 0.92));
        }
      } catch (err) {
        console.error('Error rendering binding preview:', err);
      }
    };

    renderPagePreview();
    return () => {
      isMounted = false;
    };
  }, [pdfBytes, activePageIndex, bindingMode, gutterInches, scaleContent, showSpiralGuide]);

  // Export processed PDF with exact binding margins applied to all pages
  const handleDownloadPdf = async () => {
    if (!pdfBytes) return;
    setIsProcessing(true);

    try {
      const srcPdf = await PDFDocument.load(pdfBytes);
      const outPdf = await PDFDocument.create();
      const numPages = srcPdf.getPageCount();

      const gutterPt = gutterInches * 72; // 72 pt per inch

      for (let i = 0; i < numPages; i++) {
        const [embeddedPage] = await outPdf.embedPdf(srcPdf, [i]);
        const origW = embeddedPage.width;
        const origH = embeddedPage.height;

        const newPage = outPdf.addPage([origW, origH]);
        const pageNum = i + 1;

        let isLeft = true;
        let isTop = false;

        if (bindingMode === 'top_binding') {
          isTop = true;
        } else if (bindingMode === 'double_sided') {
          isLeft = pageNum % 2 !== 0; // Odd = Left, Even = Right
        }

        if (scaleContent) {
          if (isTop) {
            const availH = origH - gutterPt;
            const s = availH / origH;
            const drawW = origW * s;
            const drawH = availH;
            const drawX = (origW - drawW) / 2;
            const drawY = 0; // Origin is bottom-left, top gutter leaves space at top
            newPage.drawPage(embeddedPage, { x: drawX, y: drawY, width: drawW, height: drawH });
          } else {
            const availW = origW - gutterPt;
            const s = availW / origW;
            const drawW = availW;
            const drawH = origH * s;
            const drawX = isLeft ? gutterPt : 0;
            const drawY = (origH - drawH) / 2;
            newPage.drawPage(embeddedPage, { x: drawX, y: drawY, width: drawW, height: drawH });
          }
        } else {
          // Direct shift
          const drawX = isTop ? 0 : isLeft ? gutterPt : 0;
          const drawY = isTop ? -gutterPt : 0;
          newPage.drawPage(embeddedPage, { x: drawX, y: drawY, width: origW, height: origH });
        }
      }

      const outBytes = await outPdf.save();
      const blob = new Blob([outBytes as any], { type: 'application/pdf' });
      downloadBlob(blob, `binding-margin-${Date.now()}.pdf`);
    } catch (err) {
      console.error('Error generating bound PDF:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Thesis & Book Binding Gutter Margin Adder"
      subtitle="Add extra margin for spiral binding, comb binding, or hard-book binding. Supports single-sided and double-sided (mirrored) margins so text is never hidden in the binding."
      categoryLabel="Thesis & Book Binding Special"
      icon={BookMarked}
      microVariant="crop"
      tone="sky"
    >
      <div className="max-w-6xl mx-auto space-y-8 text-slate-900 dark:text-slate-100">

        {/* Upload State */}
        {!pdfBytes ? (
          <div className="max-w-2xl mx-auto">
            <label className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-cyan-500 rounded-3xl cursor-pointer bg-white dark:bg-slate-900 transition-all shadow-sm group">
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="w-16 h-16 rounded-2xl bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Upload className="w-8 h-8" />
              </div>
              <span className="text-base font-bold text-slate-900 dark:text-white mb-1">
                Drop Thesis, Project Report, or Book PDF Here
              </span>
              <span className="text-xs text-slate-400 text-center max-w-xs">
                Supports university project reports, PhD dissertations, court briefs, or novel drafts.
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
                  <Sliders className="w-4 h-4 text-cyan-500" /> Binding Gutter Options
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

              {/* Binding Modes */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Print & Binding Method
                </label>
                <div className="grid grid-cols-1 gap-2 text-xs">
                  {[
                    {
                      id: 'single_sided',
                      title: 'Single-Sided Print (Left Gutter)',
                      desc: 'Standard spiral & comb binding. Adds margin to the left of every page.',
                    },
                    {
                      id: 'double_sided',
                      title: 'Double-Sided / Book Binding (Mirrored Margins)',
                      desc: 'Odd pages get Left margin, Even pages get Right margin (Inner spine space).',
                    },
                    {
                      id: 'top_binding',
                      title: 'Top Binding (Legal Pad / Notary)',
                      desc: 'Adds margin to the top of all pages for vertical clipboard or pad filing.',
                    },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setBindingMode(m.id as BindingMode)}
                      className={`p-3 rounded-2xl border text-left transition ${
                        bindingMode === m.id
                          ? 'border-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/40 text-cyan-900 dark:text-cyan-300'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="font-bold">{m.title}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{m.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Gutter Margin Width Presets & Slider */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="text-slate-700 dark:text-slate-300">Gutter Margin Width</span>
                  <span className="px-2 py-0.5 bg-cyan-600 text-white rounded font-mono text-[11px]">
                    {gutterInches.toFixed(2)}" ({Math.round(gutterInches * 25.4)} mm)
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { label: '0.5"', val: 0.5 },
                    { label: '0.75"', val: 0.75 },
                    { label: '1.0" (Thesis)', val: 1.0 },
                    { label: '1.5"', val: 1.5 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      onClick={() => setGutterInches(p.val)}
                      className={`py-1.5 px-1 rounded-lg border text-[11px] font-bold text-center transition ${
                        gutterInches === p.val
                          ? 'border-cyan-500 bg-cyan-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  min="0.25"
                  max="2.0"
                  step="0.05"
                  value={gutterInches}
                  onChange={(e) => setGutterInches(parseFloat(e.target.value))}
                  className="w-full accent-cyan-600"
                />
              </div>

              {/* Toggles */}
              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scaleContent}
                    onChange={(e) => setScaleContent(e.target.checked)}
                    className="w-4 h-4 rounded text-cyan-600 accent-cyan-600"
                  />
                  <span>Proportionally scale content (Guarantees no text is cut off)</span>
                </label>
                <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSpiralGuide}
                    onChange={(e) => setShowSpiralGuide(e.target.checked)}
                    className="w-4 h-4 rounded text-cyan-600 accent-cyan-600"
                  />
                  <span>Show simulated spiral binding rings on preview</span>
                </label>
              </div>

              {/* Page Navigator */}
              {pageCount > 1 && (
                <div className="flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold">
                  <button
                    onClick={() => setActivePageIndex(Math.max(0, activePageIndex - 1))}
                    disabled={activePageIndex === 0}
                    className="p-1 rounded hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span>
                    Viewing Page {activePageIndex + 1} of {pageCount} (
                    {bindingMode === 'double_sided'
                      ? (activePageIndex + 1) % 2 !== 0
                        ? 'Front / Odd Page'
                        : 'Back / Even Page'
                      : 'Single Page'}
                    )
                  </span>
                  <button
                    onClick={() => setActivePageIndex(Math.min(pageCount - 1, activePageIndex + 1))}
                    disabled={activePageIndex === pageCount - 1}
                    className="p-1 rounded hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Export Buttons */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <button
                  onClick={handleDownloadPdf}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-bold text-sm shadow-md transition disabled:opacity-50"
                >
                  <Download className="w-4 h-4" /> Download Print-Ready Bound PDF ({pageCount} Pages)
                </button>
                <button
                  onClick={() => setShowQrModal(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-semibold text-xs transition"
                >
                  <Smartphone className="w-3.5 h-3.5" /> Send to Mobile Phone
                </button>
              </div>
            </div>

            {/* Right Live Preview */}
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center">
              <div className="w-full flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-cyan-500" /> Binding Gutter Live Simulation
                </span>
                <span className="text-xs font-semibold px-2.5 py-1 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400 rounded-lg">
                  {bindingMode === 'double_sided' ? 'Mirrored Margin' : 'Standard Gutter'}
                </span>
              </div>

              {previewDataUrl ? (
                <div className="w-full max-h-[640px] overflow-auto flex items-center justify-center p-4 bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <img
                    src={previewDataUrl}
                    alt="Binding Margin Preview"
                    className="max-h-[580px] w-auto object-contain rounded shadow-lg border border-slate-300 dark:border-slate-700"
                  />
                </div>
              ) : (
                <div className="w-full h-96 flex items-center justify-center text-slate-400 text-xs">
                  Generating binding preview...
                </div>
              )}
            </div>
          </div>
        )}

        {/* SEO Section */}
        <ToolSEOSection
          toolName="Thesis & Book Binding Gutter Margin Adder"
          headline="Add Safe Margins for Spiral, Comb, and Hard Book Binding"
          description="When documents are bound into spiral notebooks, college thesis books, or court files, the binding rings or glue consume approximately 0.75 to 1.25 inches of the page margin. Without a proper gutter margin, text and diagrams get trapped inside the binding and become illegible. This tool automatically shifts or scales your content to create a dedicated gutter space."
          steps={[
            {
              step: '01',
              title: 'Upload Thesis or Book PDF',
              desc: 'Select your college project report, research paper, dissertation, or novel PDF.',
            },
            {
              step: '02',
              title: 'Select Binding Mode & Gutter Width',
              desc: 'Choose Single-Sided (standard spiral) or Double-Sided (mirrored inner spine margins) and set margin width (1.0" recommended).',
            },
            {
              step: '03',
              title: 'Download Print-Ready PDF',
              desc: 'Download your document ready to hand over directly to the print shop for binding.',
            },
          ]}
          features={[
            {
              title: 'Mirrored Double-Sided Margins',
              desc: 'Alternates margins automatically across odd and even pages for proper two-sided book printing.',
            },
            {
              title: 'Content Scaling Protection',
              desc: 'Ensures opposite-side text is never pushed off the sheet by scaling content proportionally.',
            },
            {
              title: 'Visual Binding Simulation',
              desc: 'Interactive spiral rings and punch holes preview shows exactly how the final bound document will look.',
            },
          ]}
          faqs={[
            {
              q: 'What is the standard gutter margin for a college thesis or dissertation?',
              a: 'Most Indian and international universities require a minimum 1.0 inch to 1.5 inch (25 mm to 38 mm) left gutter margin to accommodate hard cover binding and gold embossing.',
            },
            {
              q: 'How do mirrored margins work for double-sided printing?',
              a: 'In a printed book, the binding is on the left side of page 1, but on the right side of page 2 (when flipped). Mirrored margins ensure the extra gutter space is always placed along the inner spine.',
            },
          ]}
        />

        {/* Mobile Transfer Modal */}
        <ShareQrModal
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          title="Bound Document PDF"
          fileName="binding-margin.pdf"
        />
      </div>
    </ToolWorkspaceShell>
  );
}
