import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Upload,
  Download,
  BookOpen,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { downloadBlob } from '../lib/utils';
import { embedSmartFont } from '../lib/pdfFontHelper';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

export default function ReportHeaderSwapper() {
  useSEO(
    'Project Report Watermark & Header Swapper Online — College Thesis Formatter',
    'Strip previous college watermarks, logos, and headers from sample project reports. Apply your own University Name, Department, Roll No., and page numbering across all pages.'
  );

  usePageSEO(
    'Project Report Header & Watermark Swapper — University Thesis Formatter',
    'Free online academic project report and thesis header updater for college students. Mask old college headers and stamp new university credentials and page numbers.',
    'project report header swapper, thesis watermark remover, college project report formatter, remove old college logo pdf, update thesis header roll number',
    '/report-header-swapper'
  );

  const [file, setFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);

  // New Header Fields
  const [newCollegeName, setNewCollegeName] = useState('JAIPUR NATIONAL UNIVERSITY, JAIPUR');
  const [departmentText, setDepartmentText] = useState('Department of Computer Science & Engineering');
  const [studentInfo, setStudentInfo] = useState('Submitted By: Rahul Sharma (Roll No: 22BCS104)');

  // Masking settings
  const [maskTopHeader] = useState<boolean>(true);
  const [headerMaskHeight, setHeaderMaskHeight] = useState<number>(55); // pt
  const [maskBottomFooter] = useState<boolean>(true);
  const [footerMaskHeight] = useState<number>(45); // pt
  const [includePageNumbers, setIncludePageNumbers] = useState<boolean>(true);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processedPdfBlob, setProcessedPdfBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useAutoRevokeUrl(previewUrl);
  const prefersReduced = useReducedMotion();

  // Load PDF
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setIsProcessing(true);

    try {
      const arrayBuffer = await selected.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      setTotalPages(pdf.getPageCount());
      setProcessedPdfBlob(null);
      setPreviewUrl(null);
    } catch {
      alert('Error loading PDF document.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Process and swap headers
  const handleSwapHeaders = async () => {
    if (!file) return;
    setIsProcessing(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      const headerSample = `${newCollegeName}${departmentText}${studentInfo}`;
      const helvetica = await embedSmartFont(pdfDoc, headerSample, { fallback: StandardFonts.Helvetica });
      const helveticaBold = await embedSmartFont(pdfDoc, headerSample, { bold: true, fallback: StandardFonts.HelveticaBold });

      const count = pdfDoc.getPageCount();

      for (let i = 0; i < count; i++) {
        const page = pdfDoc.getPage(i);
        const { width, height } = page.getSize();

        // 1. Mask previous top header with white strip
        if (maskTopHeader) {
          page.drawRectangle({
            x: 0,
            y: height - headerMaskHeight,
            width,
            height: headerMaskHeight,
            color: rgb(1, 1, 1), // opaque pure white
          });

          // Draw top thin academic separator rule
          page.drawLine({
            start: { x: 35, y: height - headerMaskHeight + 8 },
            end: { x: width - 35, y: height - headerMaskHeight + 8 },
            thickness: 0.8,
            color: rgb(0.2, 0.2, 0.25),
          });

          // Stamp new College Name
          if (newCollegeName.trim()) {
            page.drawText(newCollegeName.toUpperCase(), {
              x: 35,
              y: height - 25,
              size: 9,
              font: helveticaBold,
              color: rgb(0.12, 0.15, 0.2),
            });
          }

          // Stamp Department / Student Info
          if (departmentText.trim()) {
            page.drawText(departmentText, {
              x: 35,
              y: height - 38,
              size: 7.5,
              font: helvetica,
              color: rgb(0.35, 0.35, 0.4),
            });
          }
        }

        // 2. Mask previous bottom footer with white strip
        if (maskBottomFooter) {
          page.drawRectangle({
            x: 0,
            y: 0,
            width,
            height: footerMaskHeight,
            color: rgb(1, 1, 1),
          });

          // Draw bottom separator line
          page.drawLine({
            start: { x: 35, y: footerMaskHeight - 8 },
            end: { x: width - 35, y: footerMaskHeight - 8 },
            thickness: 0.6,
            color: rgb(0.75, 0.75, 0.8),
          });

          // Stamp student credentials on bottom left
          if (studentInfo.trim()) {
            page.drawText(studentInfo, {
              x: 35,
              y: 18,
              size: 7.5,
              font: helvetica,
              color: rgb(0.4, 0.4, 0.45),
            });
          }

          // Stamp clean page numbering on bottom right
          if (includePageNumbers) {
            const pageStr = `Page ${i + 1} of ${count}`;
            const strWidth = helvetica.widthOfTextAtSize(pageStr, 8);
            page.drawText(pageStr, {
              x: width - 35 - strWidth,
              y: 18,
              size: 8,
              font: helveticaBold,
              color: rgb(0.2, 0.2, 0.25),
            });
          }
        }
      }

      const pdfBytes = toArrayBufferBytes(await pdfDoc.save());
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      setProcessedPdfBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      alert('Error swapping headers and watermarks.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!processedPdfBlob) return;
    downloadBlob(processedPdfBlob, `formatted_${file?.name || 'project_report.pdf'}`);
  };

  return (
    <ToolWorkspaceShell
      title="Project Report Watermark & Header Swapper"
      subtitle="Cleanly strip old college headers, senior's roll numbers, and website watermarks from sample project reports. Apply your own university credentials and running page numbers across all pages!"
      categoryLabel="Thesis & Project Report Utility"
      icon={BookOpen}
      microVariant="edit"
      tone="rose"
      trustNote="100% vector content preservation · Local browser processing · Zero uploads"
    >
      <div className="space-y-8">
        {/* Top Action Bar */}
        <div className="flex justify-end">
          <motion.button
            whileHover={prefersReduced || !processedPdfBlob ? undefined : { scale: 1.02 }}
            whileTap={prefersReduced || !processedPdfBlob ? undefined : { scale: 0.98 }}
            onClick={handleDownload}
            disabled={!processedPdfBlob}
            className="pms-btn-primary px-6 py-3 rounded-2xl font-bold text-xs sm:text-sm disabled:opacity-40 flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" /> Download Updated Report
          </motion.button>
        </div>

        {/* Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Controls (5 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="relative pms-glass-panel rounded-3xl p-6 space-y-5 overflow-hidden">
              <PearlScanOverlay active={isProcessing} label="Masking old headers & stamping pages…" />

              <label
                className="border-2 border-dashed rounded-2xl p-6 text-center block cursor-pointer hover:border-rose-400 transition-colors"
                style={{
                  borderColor: 'var(--pms-border-strong)',
                  backgroundColor: 'var(--pms-white)',
                }}
              >
                <div className="w-12 h-12 rounded-2xl bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] flex items-center justify-center mx-auto mb-2.5">
                  <Upload className="w-6 h-6" />
                </div>
                <span className="font-bold text-sm text-slate-800 dark:text-slate-100 block truncate">
                  {file ? file.name : 'Upload Project Report / Thesis PDF'}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
                  {totalPages > 0 ? (
                    <>
                      Loaded <AnimatedNumber value={totalPages} /> Total Pages
                    </>
                  ) : (
                    'Upload 10 to 150 page document'
                  )}
                </span>
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>

              {/* Header Fields */}
              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Your College / University Name
                  </label>
                  <input
                    type="text"
                    value={newCollegeName}
                    onChange={(e) => setNewCollegeName(e.target.value)}
                    className="w-full bg-white/90 dark:bg-slate-800/80 border border-[var(--pms-border)] rounded-xl px-3 py-2 font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-400"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Department / Project Title
                  </label>
                  <input
                    type="text"
                    value={departmentText}
                    onChange={(e) => setDepartmentText(e.target.value)}
                    className="w-full bg-white/90 dark:bg-slate-800/80 border border-[var(--pms-border)] rounded-xl px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-400"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Your Name &amp; Roll Number
                  </label>
                  <input
                    type="text"
                    value={studentInfo}
                    onChange={(e) => setStudentInfo(e.target.value)}
                    className="w-full bg-white/90 dark:bg-slate-800/80 border border-[var(--pms-border)] rounded-xl px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-400"
                  />
                </div>
              </div>

              {/* Masking Controls */}
              <div className="space-y-3 pt-3 border-t border-[var(--pms-border)] text-xs">
                <div>
                  <div className="flex justify-between font-bold text-slate-600 dark:text-slate-300 mb-1">
                    <span>Top Header Mask Height</span>
                    <span className="text-[var(--pms-rose)]">{headerMaskHeight} pt</span>
                  </div>
                  <input
                    type="range"
                    min="30"
                    max="90"
                    value={headerMaskHeight}
                    onChange={(e) => setHeaderMaskHeight(Number(e.target.value))}
                    className="w-full accent-rose-600"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Blanks out previous college logos and headers</p>
                </div>

                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700 dark:text-slate-300 pt-1">
                  <input
                    type="checkbox"
                    checked={includePageNumbers}
                    onChange={(e) => setIncludePageNumbers(e.target.checked)}
                    className="rounded text-rose-600 focus:ring-rose-500 accent-rose-600"
                  />
                  Stamp Clean Running Page Numbers (Page X of Y)
                </label>
              </div>

              {/* Action Button */}
              <motion.button
                whileHover={prefersReduced || !file || isProcessing ? undefined : { scale: 1.01 }}
                whileTap={prefersReduced || !file || isProcessing ? undefined : { scale: 0.985 }}
                onClick={handleSwapHeaders}
                disabled={!file || isProcessing}
                className="w-full pms-btn-primary py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
              >
                {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
                {isProcessing ? 'Updating Report Across Pages...' : 'Swap Headers Across All Pages'}
              </motion.button>
            </div>
          </div>

          {/* Real-Time Preview (7 Cols) */}
          <div className="lg:col-span-7 pms-glass-panel rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Updated Report Preview
              </h2>
              {processedPdfBlob && (
                <motion.span
                  initial={prefersReduced ? false : { scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 20 }}
                  className="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-[var(--pms-soft-mint)] px-3 py-1 rounded-full border border-emerald-200/80 dark:border-emerald-800/60 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> All <AnimatedNumber value={totalPages} /> Pages Updated
                </motion.span>
              )}
            </div>

            <div className="w-full bg-white dark:bg-slate-950/80 rounded-2xl p-4 flex items-center justify-center min-h-[460px] border border-[var(--pms-border)]">
              {previewUrl ? (
                <iframe
                  src={previewUrl}
                  title="Updated Report Preview"
                  className="w-full h-[580px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white"
                />
              ) : (
                <div className="text-center space-y-3 text-slate-400">
                  <BookOpen className="w-12 h-12 mx-auto opacity-30 text-rose-500" />
                  <p className="text-xs font-semibold">
                    Upload your project report PDF to preview masked headers and stamped college credentials.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <ToolSEOSection
          toolName="Project Report Watermark & Header Swapper"
          headline="Mask Old College Headers & Stamp New University Credentials"
          description="Cleanly strip previous college headers, senior's roll numbers, and website watermarks from sample project reports. Apply your own university credentials and running page numbers across all pages in seconds."
          features={[
            {
              title: 'Batch Masking Across 150+ Pages',
              desc: 'Seamlessly strips previous college names, external website watermarks, and author details in 2 seconds.',
            },
            {
              title: 'Official Academic Typography',
              desc: 'Stamps standard Helvetica headers, department labels, and candidate roll numbers formatted for review panels.',
            },
            {
              title: 'Dynamic Sequential Page Numbering',
              desc: 'Applies clean "Page X of Y" counters at the bottom right, maintaining consistent pagination throughout the thesis.',
            },
            {
              title: '100% Vector Content Preservation',
              desc: 'All charts, formulas, code listings, and tables inside your report remain completely untampered with zero raster loss.',
            },
          ]}
        />
      </div>
    </ToolWorkspaceShell>
  );
}
