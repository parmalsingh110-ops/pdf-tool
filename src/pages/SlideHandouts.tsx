import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  Printer,
  Presentation,
  FileText,
  Sliders,
  CheckCircle2,
  Smartphone,
  Eye,
  Layers,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import ShareQrModal from '../components/ShareQrModal';
import { downloadBlob } from '../lib/utils';

type HandoutLayout = '3_slides_notes' | '2_slides' | '4_slides' | '6_slides' | '9_slides';

export default function SlideHandouts() {
  useSEO(
    'PPT & Slides Handout Maker Online — 3 Slides with Note Lines (Save 75% Paper)',
    'Convert presentation slides into compact print-ready handouts. Choose 3 slides per page with ruled lecture note lines, 4 slides (2×2), or 6 slides grid to save printing costs.'
  );

  usePageSEO(
    'Lecture Slides Handout Maker — Multi-Slide Print with Notes',
    'Free online tool for college students and teachers to format PPT and slide PDFs into compact print handouts. 3 slides with ruled lines for notes, 4 slides, or 6 slides per page.',
    'ppt slides handouts online, 3 slides per page with notes lines, print slides 4 per page, save paper slide printing, lecture notes handout format, convert ppt to handout pdf',
    '/slide-handouts'
  );

  const [file, setFile] = useState<File | null>(null);
  const [slideCanvases, setSlideCanvases] = useState<HTMLCanvasElement[]>([]);
  const [layout, setLayout] = useState<HandoutLayout>('3_slides_notes');
  const [headerTitle, setHeaderTitle] = useState('Lecture Handouts & Study Notes');
  const [showSlideNumbers, setShowSlideNumbers] = useState(true);
  const [slideBorder, setSlideBorder] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewPageIdx, setPreviewPageIdx] = useState(0);
  const [totalPagesGenerated, setTotalPagesGenerated] = useState(0);
  const [showQrModal, setShowQrModal] = useState(false);

  // Render all slide pages from PDF
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setIsProcessing(true);

    try {
      const arrayBuffer = await selected.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
      const pdf = await loadingTask.promise;

      const loadedSlides: HTMLCanvasElement[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
          loadedSlides.push(canvas);
        }
      }

      setSlideCanvases(loadedSlides);
      setPreviewPageIdx(0);
    } catch (err) {
      console.error('Error rendering slide PDF:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper to render one handout A4 page
  const renderHandoutSheet = (pageIndex: number): HTMLCanvasElement | null => {
    if (slideCanvases.length === 0) return null;

    // A4 dimensions at 200 DPI
    const sheetW = 1654;
    const sheetH = 2338;
    const canvas = document.createElement('canvas');
    canvas.width = sheetW;
    canvas.height = sheetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // White paper
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sheetW, sheetH);

    // Header
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(headerTitle, 70, 70);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(70, 95);
    ctx.lineTo(sheetW - 70, 95);
    ctx.stroke();

    // Determine slides per sheet
    let countPerSheet = 3;
    if (layout === '2_slides') countPerSheet = 2;
    if (layout === '4_slides') countPerSheet = 4;
    if (layout === '6_slides') countPerSheet = 6;
    if (layout === '9_slides') countPerSheet = 9;

    const startIdx = pageIndex * countPerSheet;
    const slidesForThisPage = slideCanvases.slice(startIdx, startIdx + countPerSheet);

    const drawSlideThumb = (sCanvas: HTMLCanvasElement, x: number, y: number, w: number, h: number, sNum: number) => {
      ctx.drawImage(sCanvas, x, y, w, h);
      if (slideBorder) {
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
      }
      if (showSlideNumbers) {
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(`Slide ${sNum}`, x, y - 8);
      }
    };

    if (layout === '3_slides_notes') {
      // 3 slides stacked on the left, lined ruled notes on the right
      const slideW = 760;
      const slideH = 570; // 4:3 or 16:9 thumb
      const startY = 140;
      const spacing = 720;

      slidesForThisPage.forEach((sCanvas, idx) => {
        const curY = startY + idx * spacing;
        drawSlideThumb(sCanvas, 70, curY + 25, slideW, 460, startIdx + idx + 1);

        // Right side: Ruled Note Taking Lines
        const notesX = 880;
        const notesW = sheetW - notesX - 70;
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('NOTES / LECTURE KEY POINTS:', notesX, curY + 20);

        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);

        for (let line = 0; line < 8; line++) {
          const lineY = curY + 65 + line * 50;
          ctx.beginPath();
          ctx.moveTo(notesX, lineY);
          ctx.lineTo(notesX + notesW, lineY);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      });
    } else if (layout === '2_slides') {
      const sW = 1200;
      const sH = 800;
      const startX = (sheetW - sW) / 2;
      slidesForThisPage.forEach((sCanvas, idx) => {
        const sY = 160 + idx * 1050;
        drawSlideThumb(sCanvas, startX, sY, sW, sH, startIdx + idx + 1);
      });
    } else if (layout === '4_slides') {
      const sW = 700;
      const sH = 480;
      const gapX = 114;
      const gapY = 160;
      slidesForThisPage.forEach((sCanvas, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const sX = 70 + col * (sW + gapX);
        const sY = 160 + row * (sH + gapY);
        drawSlideThumb(sCanvas, sX, sY, sW, sH, startIdx + idx + 1);
      });
    } else if (layout === '6_slides') {
      const sW = 700;
      const sH = 440;
      const gapX = 114;
      const gapY = 80;
      slidesForThisPage.forEach((sCanvas, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const sX = 70 + col * (sW + gapX);
        const sY = 140 + row * (sH + gapY);
        drawSlideThumb(sCanvas, sX, sY, sW, sH, startIdx + idx + 1);
      });
    } else if (layout === '9_slides') {
      const sW = 460;
      const sH = 300;
      const gapX = 67;
      const gapY = 80;
      slidesForThisPage.forEach((sCanvas, idx) => {
        const col = idx % 3;
        const row = Math.floor(idx / 3);
        const sX = 70 + col * (sW + gapX);
        const sY = 140 + row * (sH + gapY);
        drawSlideThumb(sCanvas, sX, sY, sW, sH, startIdx + idx + 1);
      });
    }

    // Footer
    const totalSheets = Math.ceil(slideCanvases.length / countPerSheet);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px sans-serif';
    ctx.fillText(`Handout Page ${pageIndex + 1} of ${totalSheets} • PDF Media Suite`, 70, sheetH - 40);

    return canvas;
  };

  // Re-generate active page preview
  useEffect(() => {
    if (slideCanvases.length === 0) return;

    let countPerSheet = 3;
    if (layout === '2_slides') countPerSheet = 2;
    if (layout === '4_slides') countPerSheet = 4;
    if (layout === '6_slides') countPerSheet = 6;
    if (layout === '9_slides') countPerSheet = 9;

    const total = Math.ceil(slideCanvases.length / countPerSheet);
    setTotalPagesGenerated(total);

    const canvas = renderHandoutSheet(previewPageIdx);
    if (canvas) {
      setPreviewDataUrl(canvas.toDataURL('image/jpeg', 0.88));
    }
  }, [slideCanvases, layout, headerTitle, showSlideNumbers, slideBorder, previewPageIdx]);

  // Download all handout sheets as single A4 PDF
  const handleDownloadPdf = async () => {
    if (slideCanvases.length === 0) return;
    setIsProcessing(true);

    try {
      const pdfDoc = await PDFDocument.create();

      for (let p = 0; p < totalPagesGenerated; p++) {
        const sheetCanvas = renderHandoutSheet(p);
        if (!sheetCanvas) continue;

        const jpgData = sheetCanvas.toDataURL('image/jpeg', 0.92);
        const jpgBytes = await fetch(jpgData).then((r) => r.arrayBuffer());
        const jpgImg = await pdfDoc.embedJpg(jpgBytes);

        // A4 595.28 x 841.89 points
        const page = pdfDoc.addPage([595.28, 841.89]);
        page.drawImage(jpgImg, { x: 0, y: 0, width: 595.28, height: 841.89 });
      }

      const outBytes = await pdfDoc.save();
      const blob = new Blob([outBytes as any], { type: 'application/pdf' });
      downloadBlob(blob, `slides-handout-${Date.now()}.pdf`);
    } catch (err) {
      console.error('Error exporting handout PDF:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-10 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 text-xs font-bold uppercase tracking-wider">
            <Presentation className="w-4 h-4" /> Student Paper Saver Special
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Lecture Slides Handout Maker
          </h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
            Convert PPT and slide PDFs into compact print-ready handouts.
            Print 3 slides per page with ruled lecture note lines, or 4 to 6 slides to save 75% paper!
          </p>
        </div>

        {/* Upload State */}
        {slideCanvases.length === 0 ? (
          <div className="max-w-2xl mx-auto">
            <label className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-violet-500 rounded-3xl cursor-pointer bg-white dark:bg-slate-900 transition-all shadow-sm group">
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="w-16 h-16 rounded-2xl bg-violet-50 dark:bg-violet-950/50 text-violet-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Upload className="w-8 h-8" />
              </div>
              <span className="text-base font-bold text-slate-900 dark:text-white mb-1">
                Drop Slide Deck or PPT PDF Here
              </span>
              <span className="text-xs text-slate-400 text-center max-w-xs">
                Supports presentation PDFs exported from PowerPoint, Google Slides, Canva, Keynote, or PDF slides.
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
                  <Sliders className="w-4 h-4 text-violet-500" /> Handout Layout
                </span>
                <button
                  onClick={() => {
                    setFile(null);
                    setSlideCanvases([]);
                  }}
                  className="text-xs text-rose-500 hover:text-rose-600 font-semibold"
                >
                  Change Slides
                </button>
              </div>

              {/* Layout Choices */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Handout Format & Grid
                </label>
                <div className="grid grid-cols-1 gap-2 text-xs">
                  {[
                    {
                      id: '3_slides_notes',
                      title: '3 Slides with Note Lines (Recommended)',
                      desc: 'Slide on left + ruled writing lines on right (Classic Harvard lecture format)',
                    },
                    {
                      id: '4_slides',
                      title: '4 Slides per Page (2×2 Grid)',
                      desc: 'Optimal readability while saving 75% paper costs',
                    },
                    {
                      id: '6_slides',
                      title: '6 Slides per Page (3×2 Grid)',
                      desc: 'Maximum paper efficiency for quick exam revision',
                    },
                    {
                      id: '2_slides',
                      title: '2 Slides per Page (Large)',
                      desc: 'Extra large diagrams and detailed code slides',
                    },
                    {
                      id: '9_slides',
                      title: '9 Slides per Page (3×3 Ultra Grid)',
                      desc: 'Compact thumbnail overview for slide decks and quick indexing',
                    },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setLayout(opt.id as HandoutLayout);
                        setPreviewPageIdx(0);
                      }}
                      className={`p-3 rounded-2xl border text-left transition ${
                        layout === opt.id
                          ? 'border-violet-500 bg-violet-50/50 dark:bg-violet-950/40 text-violet-900 dark:text-violet-300'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="font-bold">{opt.title}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Header Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Header Subject / Course Title
                </label>
                <input
                  type="text"
                  value={headerTitle}
                  onChange={(e) => setHeaderTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              {/* Toggles */}
              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSlideNumbers}
                    onChange={(e) => setShowSlideNumbers(e.target.checked)}
                    className="w-4 h-4 rounded text-violet-600 accent-violet-600"
                  />
                  <span>Show slide numbering ("Slide 1, Slide 2...")</span>
                </label>
                <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={slideBorder}
                    onChange={(e) => setSlideBorder(e.target.checked)}
                    className="w-4 h-4 rounded text-violet-600 accent-violet-600"
                  />
                  <span>Draw neat outline border around slide thumbnails</span>
                </label>
              </div>

              {/* Page Navigator */}
              {totalPagesGenerated > 1 && (
                <div className="flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold">
                  <button
                    onClick={() => setPreviewPageIdx(Math.max(0, previewPageIdx - 1))}
                    disabled={previewPageIdx === 0}
                    className="p-1 rounded hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span>Handout Page {previewPageIdx + 1} of {totalPagesGenerated}</span>
                  <button
                    onClick={() => setPreviewPageIdx(Math.min(totalPagesGenerated - 1, previewPageIdx + 1))}
                    disabled={previewPageIdx === totalPagesGenerated - 1}
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
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold text-sm shadow-md transition disabled:opacity-50"
                >
                  <Download className="w-4 h-4" /> Download Complete Handouts PDF ({totalPagesGenerated} A4 Pages)
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
                  <Eye className="w-4 h-4 text-violet-500" /> A4 Handout Sheet Preview
                </span>
                <span className="text-xs font-semibold px-2.5 py-1 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 rounded-lg">
                  {slideCanvases.length} Total Slides
                </span>
              </div>

              {previewDataUrl ? (
                <div className="w-full max-h-[640px] overflow-auto flex items-center justify-center p-4 bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <img
                    src={previewDataUrl}
                    alt="Handout Sheet Preview"
                    className="max-h-[580px] w-auto object-contain rounded shadow-lg border border-slate-300 dark:border-slate-700"
                  />
                </div>
              ) : (
                <div className="w-full h-96 flex items-center justify-center text-slate-400 text-xs">
                  Generating handout preview...
                </div>
              )}
            </div>
          </div>
        )}

        {/* SEO Section */}
        <ToolSEOSection
          toolName="Lecture Slides Handout Maker"
          headline="Format PPT & Slide Decks into Compact Print Handouts with Notes"
          description="Printing 1 slide per page wastes reams of paper and hundreds of rupees. Our Lecture Slides Handout Maker transforms your slides into classic academic lecture handouts featuring 3 slides on the left and lined note-taking space on the right, or 4 to 6 slides per A4 page to reduce printout volume by up to 80%."
          steps={[
            {
              step: '01',
              title: 'Upload Presentation PDF',
              desc: 'Select your exported PowerPoint, Canva, or Google Slides presentation PDF.',
            },
            {
              step: '02',
              title: 'Choose Handout Layout',
              desc: 'Select 3 slides with ruled notes lines, 4 slides (2×2), or 6 slides for compact revision.',
            },
            {
              step: '03',
              title: 'Download & Print',
              desc: 'Download a clean, numbered A4 PDF with slide borders and custom course header.',
            },
          ]}
          features={[
            {
              title: '3-Slides with Ruled Note Lines',
              desc: 'The gold standard format for university lectures — slide thumbnail on left with lined space for handwritten notes on the right.',
            },
            {
              title: 'Save 75%–85% Paper & Ink',
              desc: 'Condense a 100-slide lecture into only 17 to 25 sheets of paper.',
            },
            {
              title: 'Custom Lecture Header',
              desc: 'Includes course code, subject name, and auto-generated page numbers on every handout sheet.',
            },
          ]}
          faqs={[
            {
              q: 'Can I print these handouts on double-sided (duplex) printers?',
              a: 'Yes, the A4 output is formatted with uniform margins and standard headers, making it ideal for double-sided duplex printing to save even more paper.',
            },
            {
              q: 'How do I convert my PPTX file to use this tool?',
              a: 'Simply save your PowerPoint presentation as a PDF in PowerPoint or Google Slides, then drop it into this tool.',
            },
          ]}
        />

        {/* Mobile Transfer Modal */}
        <ShareQrModal
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          title="Lecture Slides Handout PDF"
          fileName="slides-handout.pdf"
        />
      </div>
    </div>
  );
}
