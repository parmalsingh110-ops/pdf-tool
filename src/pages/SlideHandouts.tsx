import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Download,
  Presentation,
  Sliders,
  Smartphone,
  Eye,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import FileDropzone from '../components/FileDropzone';
import ToolSEOSection from '../components/ToolSEOSection';
import ShareQrModal from '../components/ShareQrModal';
import { dataUrlToBytes, downloadBlob } from '../lib/utils';
import { toArrayBufferBytes } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

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

  const prefersReduced = useReducedMotion();

  // Render all slide pages from PDF
  const loadSlidePdf = async (selected: File) => {
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
        const jpgBytes = dataUrlToBytes(jpgData);
        const jpgImg = await pdfDoc.embedJpg(jpgBytes);

        // A4 595.28 x 841.89 points
        const page = pdfDoc.addPage([595.28, 841.89]);
        page.drawImage(jpgImg, { x: 0, y: 0, width: 595.28, height: 841.89 });
      }

      const outBytes = toArrayBufferBytes(await pdfDoc.save());
      const blob = new Blob([outBytes], { type: 'application/pdf' });
      downloadBlob(blob, `slides-handout-${Date.now()}.pdf`);
    } catch (err) {
      console.error('Error exporting handout PDF:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handoutOptions: { id: HandoutLayout; title: string; desc: string }[] = [
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
  ];

  return (
    <ToolWorkspaceShell
      title="Lecture Slides Handout Maker"
      subtitle="Convert PPT and slide PDFs into compact print-ready handouts. Print 3 slides per page with ruled lecture note lines, or 4 to 6 slides to save 75% paper!"
      categoryLabel="Student Paper Saver Special"
      icon={Presentation}
      microVariant="split"
      tone="violet"
      trustNote="100% browser-side A4 handout builder · Save up to 80% paper"
    >
      <div className="space-y-8">
        {/* Upload State */}
        {slideCanvases.length === 0 ? (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
            className="relative max-w-2xl mx-auto rounded-[1.75rem] overflow-hidden"
          >
            <PearlScanOverlay active={isProcessing} label={file ? `Rendering ${file.name}…` : 'Rendering slide deck…'} />
            <FileDropzone
              onDrop={(files) => files[0] && loadSlidePdf(files[0])}
              accept={{ 'application/pdf': ['.pdf'] }}
              multiple={false}
              title="Drop Slide Deck or PPT PDF Here"
              subtitle="Supports presentation PDFs exported from PowerPoint, Google Slides, Canva, Keynote, or PDF slides."
            />
          </motion.div>
        ) : (
          /* Editor Layout */
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
          >
            {/* Left Controls */}
            <div className="relative lg:col-span-5 space-y-5 pms-glass-panel p-6 rounded-3xl overflow-hidden">
              <PearlScanOverlay active={isProcessing} label="Building A4 handout PDF…" />

              <div className="flex items-center justify-between pb-3 border-b border-[var(--pms-border)]">
                <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[var(--pms-violet)]" /> Handout Layout
                </span>
                <button
                  onClick={() => {
                    setFile(null);
                    setSlideCanvases([]);
                    setPreviewDataUrl(null);
                  }}
                  className="text-xs text-[var(--pms-rose)] hover:underline font-semibold cursor-pointer"
                >
                  Change Slides
                </button>
              </div>

              {/* Layout Choices */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Handout Format &amp; Grid
                </label>
                <div className="grid grid-cols-1 gap-2 text-xs">
                  {handoutOptions.map((opt) => {
                    const active = layout === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => {
                          setLayout(opt.id);
                          setPreviewPageIdx(0);
                        }}
                        className="relative p-3 rounded-2xl border text-left transition-colors cursor-pointer overflow-hidden"
                        style={{
                          borderColor: active ? 'var(--pms-violet)' : 'var(--pms-border)',
                          backgroundColor: active ? 'var(--pms-soft-lavender)' : 'var(--pms-white)',
                        }}
                      >
                        {active && (
                          <motion.span
                            layoutId="handout-layout-pill"
                            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                            className="absolute inset-0 rounded-2xl ring-2 ring-violet-500/30 pointer-events-none"
                          />
                        )}
                        <div className="relative z-10">
                          <div className="font-bold text-slate-900 dark:text-white">{opt.title}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{opt.desc}</div>
                        </div>
                      </button>
                    );
                  })}
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
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--pms-border)] bg-white/90 dark:bg-slate-800/80 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-400"
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
                  <span>Show slide numbering (&quot;Slide 1, Slide 2...&quot;)</span>
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
                <div className="flex items-center justify-between p-3 bg-white/80 dark:bg-slate-800/70 border border-[var(--pms-border)] rounded-2xl text-xs font-semibold">
                  <button
                    onClick={() => setPreviewPageIdx(Math.max(0, previewPageIdx - 1))}
                    disabled={previewPageIdx === 0}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span>
                    Handout Page {previewPageIdx + 1} of {totalPagesGenerated}
                  </span>
                  <button
                    onClick={() => setPreviewPageIdx(Math.min(totalPagesGenerated - 1, previewPageIdx + 1))}
                    disabled={previewPageIdx === totalPagesGenerated - 1}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Export Buttons */}
              <div className="pt-3 border-t border-[var(--pms-border)] space-y-2.5">
                <motion.button
                  whileHover={prefersReduced || isProcessing ? undefined : { scale: 1.01 }}
                  whileTap={prefersReduced || isProcessing ? undefined : { scale: 0.985 }}
                  onClick={handleDownloadPdf}
                  disabled={isProcessing}
                  className="w-full pms-btn-primary flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl font-bold text-sm disabled:opacity-50 cursor-pointer"
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Download Complete Handouts PDF ({totalPagesGenerated} A4 Pages)
                </motion.button>
                <button
                  onClick={() => setShowQrModal(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 bg-[var(--pms-soft-lavender)] hover:brightness-95 text-[var(--pms-violet)] border border-[var(--pms-border)] rounded-xl font-semibold text-xs transition cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5" /> Send to Mobile Phone
                </button>
              </div>
            </div>

            {/* Right Live Preview */}
            <div className="lg:col-span-7 pms-glass-panel p-6 rounded-3xl flex flex-col items-center">
              <div className="w-full flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-[var(--pms-violet)]" /> A4 Handout Sheet Preview
                </span>
                <span className="text-xs font-bold px-3 py-1 bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] border border-[var(--pms-border)] rounded-full">
                  <AnimatedNumber value={slideCanvases.length} /> Total Slides
                </span>
              </div>

              {previewDataUrl ? (
                <div className="w-full max-h-[640px] overflow-auto flex items-center justify-center p-4 bg-white dark:bg-slate-950 rounded-2xl border border-[var(--pms-border)]">
                  <img
                    src={previewDataUrl}
                    alt="Handout Sheet Preview"
                    className="max-h-[580px] w-auto object-contain rounded shadow-lg border border-slate-200 bg-white"
                  />
                </div>
              ) : (
                <div className="w-full h-96 flex items-center justify-center text-slate-400 text-xs">
                  Generating handout preview...
                </div>
              )}
            </div>
          </motion.div>
        )}

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

        <ShareQrModal
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          title="Lecture Slides Handout PDF"
          fileName="slides-handout.pdf"
        />
      </div>
    </ToolWorkspaceShell>
  );
}
