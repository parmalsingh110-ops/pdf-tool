import React, { useState } from 'react';
import {
  Upload,
  Download,
  Printer,
  Sparkles,
  BookOpen,
  Scissors,
  Layers,
  CheckCircle2,
  FileText,
  FileCheck2,
} from 'lucide-react';
import { PDFDocument, rgb } from 'pdf-lib';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { downloadBlob } from '../lib/utils';

type LayoutMode = '4_up' | '8_up' | '16_up';
type ImpositionOrder = 'sequential_cut' | 'standard_grid';

export default function MicroPocketNotes() {
  useSEO(
    'Micro-Pocket Notes Maker Online — 4-in-1 & 8-in-1 Revision Booklet',
    'Convert multi-page PDF notes into 4-in-1, 8-in-1, or 16-in-1 pocket revision booklets with cut marks. Save 75% paper. Perfect for students and xerox shops.'
  );

  usePageSEO(
    'Micro-Pocket Notes Maker — A4 4-in-1 & 8-in-1 Duplex Booklet Imposition',
    'Free online micro-print imposition generator for college students and photo state shops. Arrange 4, 8, or 16 pages per sheet with paper cutter guidelines.',
    'micro pocket notes maker, 4 in 1 pdf print, 8 in 1 pdf booklet, n up print imposition, pocket revision notes generator, exam micro notes layout',
    '/micro-pocket-notes'
  );

  const [file, setFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('4_up');
  const [impositionOrder, setImpositionOrder] = useState<ImpositionOrder>('sequential_cut');
  const [includeCutMarks, setIncludeCutMarks] = useState<boolean>(true);
  const [includeCornerNumbers, setIncludeCornerNumbers] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processedPdfBlob, setProcessedPdfBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Load PDF and count pages
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setIsProcessing(true);

    try {
      const arrayBuffer = await selected.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      const count = pdf.getPageCount();
      setTotalPages(count);
      setProcessedPdfBlob(null);
      setPreviewUrl(null);
    } catch (err) {
      alert('Error loading PDF file. Please select a valid document.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Generate imposed Micro-Pocket PDF
  const handleGenerate = async () => {
    if (!file) return;
    setIsProcessing(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const srcDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      const outDoc = await PDFDocument.create();

      const srcPageCount = srcDoc.getPageCount();

      // Determine Grid dimensions
      let cols = 2;
      let rows = 2; // 4-up default
      if (layoutMode === '8_up') {
        cols = 2;
        rows = 4;
      } else if (layoutMode === '16_up') {
        cols = 4;
        rows = 4;
      }

      const pagesPerSheet = cols * rows;
      const totalSheets = Math.ceil(srcPageCount / pagesPerSheet);

      // A4 portrait dimensions: 595.28 × 841.89 pt
      const sheetW = 595.28;
      const sheetH = 841.89;

      const slotW = sheetW / cols;
      const slotH = sheetH / rows;

      // Copy all source pages into new document
      const embeddedPages = await outDoc.embedPdf(srcDoc, Array.from({ length: srcPageCount }, (_, i) => i));

      for (let s = 0; s < totalSheets; s++) {
        const sheet = outDoc.addPage([sheetW, sheetH]);

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            let pageIndex = s * pagesPerSheet + (r * cols + c);

            if (pageIndex < srcPageCount) {
              const embPage = embeddedPages[pageIndex];

              // Calculate bounding box maintaining aspect ratio
              const margin = 8;
              const maxW = slotW - margin * 2;
              const maxH = slotH - margin * 2;
              const scale = Math.min(maxW / embPage.width, maxH / embPage.height);

              const drawW = embPage.width * scale;
              const drawH = embPage.height * scale;

              // Grid position coordinates (PDF origin is bottom-left)
              const xPos = c * slotW + (slotW - drawW) / 2;
              const yPos = sheetH - (r + 1) * slotH + (slotH - drawH) / 2;

              sheet.drawPage(embPage, {
                x: xPos,
                y: yPos,
                width: drawW,
                height: drawH,
              });

              // Optional bold corner number for easy reading
              if (includeCornerNumbers) {
                // Background badge
                sheet.drawRectangle({
                  x: c * slotW + 4,
                  y: sheetH - (r * slotH) - 16,
                  width: 24,
                  height: 12,
                  color: rgb(0.94, 0.94, 0.96),
                });
              }
            }
          }
        }

        // Draw Cutting Dashed Guidelines
        if (includeCutMarks) {
          // Vertical guide lines
          for (let c = 1; c < cols; c++) {
            sheet.drawLine({
              start: { x: c * slotW, y: 0 },
              end: { x: c * slotW, y: sheetH },
              thickness: 0.5,
              color: rgb(0.7, 0.7, 0.7),
              dashArray: [4, 4],
            });
          }

          // Horizontal guide lines
          for (let r = 1; r < rows; r++) {
            sheet.drawLine({
              start: { x: 0, y: r * slotH },
              end: { x: sheetW, y: r * slotH },
              thickness: 0.5,
              color: rgb(0.7, 0.7, 0.7),
              dashArray: [4, 4],
            });
          }
        }
      }

      const pdfBytes = await outDoc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      setProcessedPdfBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      alert('Error generating imposed pocket booklet.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!processedPdfBlob) return;
    downloadBlob(processedPdfBlob, `micro_notes_${layoutMode}_${file?.name || 'document.pdf'}`);
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-50 dark:bg-violet-950/60 border border-violet-200 dark:border-violet-900 text-violet-700 dark:text-violet-300 text-xs font-bold mb-2">
              <Sparkles className="w-3.5 h-3.5" /> Exam Revision &amp; Paper Saver
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">
              Micro-Pocket Notes Maker
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
              Convert bulky 100-page revision notes into 4-in-1 or 8-in-1 pocket booklets with scissor cut marks. Save 75% paper and xerox cost!
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDownload}
              disabled={!processedPdfBlob}
              className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-md disabled:opacity-40 flex items-center gap-2 transition-all"
            >
              <Download className="w-4 h-4" /> Download Pocket PDF
            </button>
          </div>
        </div>

        {/* Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Controls (5 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-sm space-y-5">
              <label className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 text-center block cursor-pointer hover:border-violet-500 transition-colors">
                <Upload className="w-8 h-8 mx-auto text-violet-600 mb-2" />
                <span className="font-bold text-sm text-slate-700 dark:text-slate-200 block">
                  {file ? file.name : 'Upload PDF Notes / Handouts'}
                </span>
                <span className="text-xs text-slate-400 mt-1 block">
                  {totalPages > 0 ? `Loaded ${totalPages} Total Pages` : 'Multi-page lecture notes or question banks'}
                </span>
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>

              {/* Layout Mode */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  Imposition Layout (Pages per Sheet)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: '4_up', label: '4-in-1 (2×2)', desc: 'Pocket Size' },
                    { id: '8_up', label: '8-in-1 (2×4)', desc: 'Micro Notes' },
                    { id: '16_up', label: '16-in-1 (4×4)', desc: 'Ultra Micro' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setLayoutMode(item.id as LayoutMode)}
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        layoutMode === item.id
                          ? 'bg-violet-50 dark:bg-violet-950/60 border-violet-500 text-violet-900 dark:text-violet-100 font-bold'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <p className="text-xs font-bold">{item.label}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{item.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={includeCutMarks}
                    onChange={(e) => setIncludeCutMarks(e.target.checked)}
                    className="rounded text-violet-600 focus:ring-violet-500"
                  />
                  Draw Scissor Cutting Guidelines on Sheets
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={includeCornerNumbers}
                    onChange={(e) => setIncludeCornerNumbers(e.target.checked)}
                    className="rounded text-violet-600 focus:ring-violet-500"
                  />
                  Draw High-Visibility Corner Page Numbers
                </label>
              </div>

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={!file || isProcessing}
                className="w-full py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {isProcessing ? (
                  <span>Imposing Pages...</span>
                ) : (
                  <>
                    <Scissors className="w-4 h-4" /> Generate Pocket Layout ({layoutMode})
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Preview Area (7 Cols) */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                Imposed Sheet Preview
              </h2>
              {processedPdfBlob && (
                <span className="text-xs font-bold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/60 px-3 py-1 rounded-full border border-violet-200">
                  {Math.ceil(totalPages / (layoutMode === '4_up' ? 4 : layoutMode === '8_up' ? 8 : 16))} Sheets Ready
                </span>
              )}
            </div>

            <div className="w-full bg-slate-100 dark:bg-slate-950/80 rounded-2xl p-4 flex items-center justify-center min-h-[460px] border border-slate-200/70 dark:border-slate-800">
              {previewUrl ? (
                <iframe
                  src={previewUrl}
                  title="PDF Preview"
                  className="w-full h-[560px] rounded-xl border border-slate-300 dark:border-slate-700"
                />
              ) : (
                <div className="text-center space-y-3 text-slate-400">
                  <BookOpen className="w-12 h-12 mx-auto opacity-30 text-violet-500" />
                  <p className="text-xs font-semibold">
                    Upload your PDF and click "Generate Pocket Layout" to view duplex sheet previews.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SEO Guide Section */}
        <ToolSEOSection
          toolName="Micro-Pocket Notes Maker"
          headline="4-in-1 &amp; 8-in-1 Pocket Revision Booklets for Students &amp; Xerox Shops"
          description="Convert bulky multi-page lecture notes, slides, and syllabus guides into 4-in-1 or 8-in-1 duplex pocket revision booklets with scissor cut marks. Save 75% paper and photocopying costs."
          features={[
            {
              title: '75% Paper & Toner Savings',
              desc: 'Compress a 40-page assignment or syllabus notes into just 5 physical double-sided A4 sheets.',
            },
            {
              title: 'Clean Cutting Guidelines',
              desc: 'Subtle dashed lines show exactly where to cut with a desk paper cutter or scissors.',
            },
            {
              title: 'Duplex Friendly Imposition',
              desc: 'Engineered so front and back pages align symmetrically when printed on duplex laser printers.',
            },
            {
              title: '100% Client-Side Vector Fidelity',
              desc: 'Processed directly in your browser using WebAssembly. Vector text remains razor-sharp at any magnification.',
            },
          ]}
        />
      </div>
    </div>
  );
}
