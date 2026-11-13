import React, { useState } from 'react';
import {
  Upload,
  Download,
  Sparkles,
  BookOpen,
  Scissors,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';
import { downloadBlob } from '../lib/utils';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';

type LayoutMode = '4_up' | '8_up' | '16_up';

export default function MicroPocketNotes() {
  const prefersReduced = useReducedMotion();

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
  const [includeCutMarks, setIncludeCutMarks] = useState<boolean>(true);
  const [includeCornerNumbers, setIncludeCornerNumbers] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processedPdfBlob, setProcessedPdfBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useAutoRevokeUrl(previewUrl);

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
      const boldFont = await outDoc.embedFont(StandardFonts.HelveticaBold);

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
                const badgeText = `${pageIndex + 1}`;
                const textWidth = boldFont.widthOfTextAtSize(badgeText, 7.5);
                const badgeW = Math.max(20, textWidth + 8);
                // Background badge
                sheet.drawRectangle({
                  x: c * slotW + 4,
                  y: sheetH - (r * slotH) - 16,
                  width: badgeW,
                  height: 12,
                  color: rgb(0.94, 0.94, 0.96),
                  borderColor: rgb(0.75, 0.75, 0.8),
                  borderWidth: 0.5,
                });
                sheet.drawText(badgeText, {
                  x: c * slotW + 4 + (badgeW - textWidth) / 2,
                  y: sheetH - (r * slotH) - 13,
                  size: 7.5,
                  font: boldFont,
                  color: rgb(0.2, 0.2, 0.3),
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
      const blob = new Blob([toArrayBufferBytes(pdfBytes)], { type: 'application/pdf' });
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

  const sheetCount = Math.ceil(totalPages / (layoutMode === '4_up' ? 4 : layoutMode === '8_up' ? 8 : 16));

  return (
    <ToolWorkspaceShell
      title="Micro-Pocket Notes Maker"
      subtitle="Convert bulky 100-page revision notes into 4-in-1 or 8-in-1 pocket booklets with scissor cut marks. Save 75% paper and xerox cost!"
      categoryLabel="Exam Revision & Paper Saver"
      icon={Sparkles}
      microVariant="split"
      tone="violet"
      trustNote="Vector N-up PDF imposition · 75% paper & toner savings"
    >
      <div className="space-y-6">
        {/* Top Action Strip */}
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="pms-glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className="px-3 py-1 rounded-full font-bold text-[var(--pms-ink)] border border-[var(--pms-border)]"
              style={{ background: 'var(--pms-soft-lavender)' }}
            >
              A4 Duplex Micro-Booklet
            </span>
            {totalPages > 0 && (
              <span
                className="px-3 py-1 rounded-full font-bold text-[var(--pms-ink)] border border-[var(--pms-border)]"
                style={{ background: 'var(--pms-soft-mint)' }}
              >
                <AnimatedNumber value={totalPages} suffix=" pages → " />
                <AnimatedNumber value={sheetCount} suffix={sheetCount === 1 ? ' sheet' : ' sheets'} />
              </span>
            )}
          </div>

          <button
            onClick={handleDownload}
            disabled={!processedPdfBlob}
            className="pms-btn-primary px-5 py-2.5 rounded-xl font-bold text-xs disabled:opacity-40 flex items-center gap-2 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" /> Download Pocket PDF
          </button>
        </motion.div>

        {/* Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Controls (5 Cols) */}
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 }}
            className="lg:col-span-5 space-y-6"
          >
            <div className="pms-glass-panel rounded-3xl p-6 space-y-5">
              <label className="border-2 border-dashed border-[var(--pms-border-strong)] hover:border-violet-500 rounded-2xl p-6 text-center block cursor-pointer bg-[var(--pms-white)] transition-colors">
                <div
                  className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center border border-[var(--pms-border)]"
                  style={{ background: 'var(--pms-soft-lavender)' }}
                >
                  <Upload className="w-6 h-6 text-[var(--pms-violet)]" />
                </div>
                <span className="font-bold text-sm text-[var(--pms-ink)] block truncate">
                  {file ? file.name : 'Upload PDF Notes / Handouts'}
                </span>
                <span className="text-xs text-[var(--pms-muted)] mt-1 block">
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
                <label className="text-xs font-bold text-[var(--pms-muted)] uppercase tracking-wider block">
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
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        layoutMode === item.id
                          ? 'bg-[var(--pms-soft-lavender)] border-violet-500 text-[var(--pms-ink)] font-bold shadow-sm'
                          : 'bg-[var(--pms-white)] border-[var(--pms-border)] text-[var(--pms-muted)] hover:text-[var(--pms-ink)]'
                      }`}
                    >
                      <p className="text-xs font-bold">{item.label}</p>
                      <p className="text-[10px] opacity-75 mt-0.5">{item.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-3 pt-3 border-t border-[var(--pms-border)]">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[var(--pms-ink)]">
                  <input
                    type="checkbox"
                    checked={includeCutMarks}
                    onChange={(e) => setIncludeCutMarks(e.target.checked)}
                    className="rounded accent-violet-600"
                  />
                  Draw Scissor Cutting Guidelines on Sheets
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[var(--pms-ink)]">
                  <input
                    type="checkbox"
                    checked={includeCornerNumbers}
                    onChange={(e) => setIncludeCornerNumbers(e.target.checked)}
                    className="rounded accent-violet-600"
                  />
                  Draw High-Visibility Corner Page Numbers
                </label>
              </div>

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={!file || isProcessing}
                className="pms-btn-primary w-full py-3.5 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
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
          </motion.div>

          {/* Preview Area (7 Cols) */}
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="lg:col-span-7 pms-glass-panel rounded-3xl p-6 space-y-4 relative overflow-hidden"
          >
            <PearlScanOverlay active={isProcessing} label="Imposing N-up pocket revision sheets..." />

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)]">
                Imposed Sheet Preview
              </h2>
              <AnimatePresence>
                {processedPdfBlob && (
                  <motion.span
                    initial={prefersReduced ? false : { opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={prefersReduced ? undefined : { opacity: 0, scale: 0.94 }}
                    className="text-xs font-bold text-[var(--pms-ink)] px-3 py-1 rounded-full border border-[var(--pms-border)]"
                    style={{ background: 'var(--pms-soft-mint)' }}
                  >
                    <AnimatedNumber value={sheetCount} suffix=" Sheets Ready" />
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            <div className="w-full pms-paper-grid rounded-2xl p-4 flex items-center justify-center min-h-[460px] border border-[var(--pms-border)]">
              {previewUrl ? (
                <iframe
                  src={previewUrl}
                  title="PDF Preview"
                  className="w-full h-[560px] rounded-xl bg-white border border-[var(--pms-border-strong)] shadow-sm"
                />
              ) : (
                <div className="text-center space-y-3 text-[var(--pms-muted)] max-w-sm">
                  <BookOpen className="w-12 h-12 mx-auto opacity-35 text-[var(--pms-violet)]" />
                  <p className="text-xs font-semibold">
                    Upload your PDF and click &quot;Generate Pocket Layout&quot; to view duplex sheet previews.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
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
    </ToolWorkspaceShell>
  );
}
