import React, { useState } from 'react';
import {
  Download,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';
import { downloadBlob } from '../lib/utils';
import { embedSmartFont } from '../lib/pdfFontHelper';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';

type LeftPageType = 'green_graph' | 'blue_graph' | 'grey_grid' | 'blank_diagram';

export default function LabJournalFormatter() {
  const prefersReduced = useReducedMotion();

  useSEO(
    'College Lab Journal & Practical Record Formatter — Graph Left, Line Right',
    'Generate standard university practical records with alternating Left Graph Paper and Right Ruled Pages with college header and teacher sign box. 100% free.'
  );

  usePageSEO(
    'Lab Journal & Practical File Formatter — University Standard Record Sheet',
    'Free online academic practical record generator for B.Tech, B.Sc, Pharmacy, and school students. Automatically pairs left-side graph sheets with right-side ruled pages.',
    'lab journal formatter, practical file graph paper left, university lab record pdf, college practical sheet generator, engineering lab manual print layout',
    '/lab-journal-formatter'
  );

  // Form Fields
  const [collegeName, setCollegeName] = useState('ABC INSTITUTE OF ENGINEERING & TECHNOLOGY');
  const [department, setDepartment] = useState('Department of Computer Science & Engineering');
  const [subject, setSubject] = useState('Physics / Chemistry / Data Structures Lab');
  const [studentName, setStudentName] = useState('Rahul Sharma');
  const [rollNo, setRollNo] = useState('22BCS104');
  const [experimentNo] = useState('Experiment No. 01');
  const [aimTitle, setAimTitle] = useState('To determine the coefficient of viscosity / Study verification of Ohm’s Law');
  const [numExperiments, setNumExperiments] = useState<number>(4);

  // Styles
  const [leftPageType, setLeftPageType] = useState<LeftPageType>('green_graph');
  const [includeSignBox, setIncludeSignBox] = useState<boolean>(true);
  const [includeBindingMargin, setIncludeBindingMargin] = useState<boolean>(true);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generatedPdfBlob, setGeneratedPdfBlob] = useState<Blob | null>(null);

  useAutoRevokeUrl(previewUrl);

  // Generate the complete Lab Journal PDF
  const handleGeneratePdf = async () => {
    setIsProcessing(true);

    try {
      const pdfDoc = await PDFDocument.create();
      const allLabSample = `${collegeName}${department}${subject}${studentName}${rollNo}${experimentNo}${aimTitle}`;
      const helvetica = await embedSmartFont(pdfDoc, allLabSample, { fallback: StandardFonts.Helvetica });
      const helveticaBold = await embedSmartFont(pdfDoc, allLabSample, { bold: true, fallback: StandardFonts.HelveticaBold });

      // A4 portrait: 595.28 × 841.89 pt
      const pageW = 595.28;
      const pageH = 841.89;

      // Colors
      const greenColor = rgb(0.15, 0.65, 0.25);
      const greenLight = rgb(0.75, 0.92, 0.8);
      const blueColor = rgb(0.15, 0.45, 0.85);
      const blueLight = rgb(0.78, 0.88, 0.98);
      const ruledLineColor = rgb(0.72, 0.82, 0.95);
      const redMarginColor = rgb(0.9, 0.25, 0.25);
      const textDark = rgb(0.1, 0.12, 0.15);

      for (let exp = 1; exp <= numExperiments; exp++) {
        // ========== 1. LEFT PAGE (Graph / Observation Sheet) ==========
        const leftPage = pdfDoc.addPage([pageW, pageH]);
        const leftBinding = includeBindingMargin ? 25 : 0; // extra gutter on right edge for left page

        // Graph Header
        leftPage.drawText(`Observation / Graph — Exp #${exp}`, {
          x: 40,
          y: pageH - 40,
          size: 11,
          font: helveticaBold,
          color: textDark,
        });

        leftPage.drawText(`Date: ______________`, {
          x: pageW - 160 - leftBinding,
          y: pageH - 40,
          size: 10,
          font: helvetica,
          color: textDark,
        });

        // Draw Graph Grid
        if (leftPageType === 'green_graph' || leftPageType === 'blue_graph' || leftPageType === 'grey_grid') {
          const gridColor = leftPageType === 'green_graph' ? greenColor : leftPageType === 'blue_graph' ? blueColor : rgb(0.6, 0.6, 0.6);
          const gridLight = leftPageType === 'green_graph' ? greenLight : leftPageType === 'blue_graph' ? blueLight : rgb(0.85, 0.85, 0.85);

          const startX = 40;
          const endX = pageW - 40 - leftBinding;
          const startY = 60;
          const endY = pageH - 60;

          const step10mm = 28.35; // 1 cm in points
          const step2mm = step10mm / 5; // 2 mm millimeter lines

          // Millimeter lines
          for (let x = startX; x <= endX; x += step2mm) {
            leftPage.drawLine({ start: { x, y: startY }, end: { x, y: endY }, thickness: 0.3, color: gridLight });
          }
          for (let y = startY; y <= endY; y += step2mm) {
            leftPage.drawLine({ start: { x: startX, y }, end: { x: endX, y }, thickness: 0.3, color: gridLight });
          }

          // Centimeter lines (bolder)
          for (let x = startX; x <= endX; x += step10mm) {
            leftPage.drawLine({ start: { x, y: startY }, end: { x, y: endY }, thickness: 0.8, color: gridColor });
          }
          for (let y = startY; y <= endY; y += step10mm) {
            leftPage.drawLine({ start: { x: startX, y }, end: { x: endX, y }, thickness: 0.8, color: gridColor });
          }

          // Outer border
          leftPage.drawRectangle({
            x: startX,
            y: startY,
            width: endX - startX,
            height: endY - startY,
            borderColor: gridColor,
            borderWidth: 1.5,
          });
        } else {
          // Blank Diagram Box
          leftPage.drawRectangle({
            x: 40,
            y: 80,
            width: pageW - 80 - leftBinding,
            height: pageH - 140,
            borderColor: rgb(0.4, 0.4, 0.4),
            borderWidth: 1,
          });
          leftPage.drawText('( Space for Circuit Diagram / Apparatus Sketch / Observation Table )', {
            x: 140,
            y: pageH / 2,
            size: 10,
            font: helvetica,
            color: rgb(0.6, 0.6, 0.6),
          });
        }

        // ========== 2. RIGHT PAGE (Ruled Single-Line Theory Sheet) ==========
        const rightPage = pdfDoc.addPage([pageW, pageH]);
        const rightBinding = includeBindingMargin ? 30 : 0; // extra gutter on left edge for right page

        // Academic Header Box
        rightPage.drawRectangle({
          x: 35 + rightBinding,
          y: pageH - 85,
          width: pageW - 70 - rightBinding,
          height: 60,
          borderColor: rgb(0.3, 0.3, 0.3),
          borderWidth: 1,
        });

        // College Name
        rightPage.drawText(collegeName.toUpperCase(), {
          x: 45 + rightBinding,
          y: pageH - 42,
          size: 11,
          font: helveticaBold,
          color: textDark,
        });

        // Department & Subject
        rightPage.drawText(`${department} | ${subject}`, {
          x: 45 + rightBinding,
          y: pageH - 58,
          size: 8.5,
          font: helvetica,
          color: rgb(0.3, 0.3, 0.3),
        });

        // Student Info & Exp info
        rightPage.drawText(`Name: ${studentName}    Roll No: ${rollNo}    Exp No: ${exp}    Date: ____________`, {
          x: 45 + rightBinding,
          y: pageH - 74,
          size: 8.5,
          font: helveticaBold,
          color: textDark,
        });

        // Red Left Margin Line
        const marginX = 85 + rightBinding;
        rightPage.drawLine({
          start: { x: marginX, y: 50 },
          end: { x: marginX, y: pageH - 95 },
          thickness: 1,
          color: redMarginColor,
        });

        // Ruled Notebook Lines
        const lineSpacing = 24; // standard 8mm notebook rule
        for (let y = pageH - 120; y >= 90; y -= lineSpacing) {
          rightPage.drawLine({
            start: { x: 35 + rightBinding, y },
            end: { x: pageW - 35, y },
            thickness: 0.5,
            color: ruledLineColor,
          });
        }

        // Sample Experiment Prompts on First Page
        rightPage.drawText('AIM:', {
          x: 42 + rightBinding,
          y: pageH - 116,
          size: 9,
          font: helveticaBold,
          color: textDark,
        });
        rightPage.drawText(exp === 1 ? aimTitle : `Experiment #${exp} Title...`, {
          x: marginX + 12,
          y: pageH - 116,
          size: 8.5,
          font: helvetica,
          color: textDark,
        });

        rightPage.drawText('APPARATUS REQUIRED:', {
          x: 42 + rightBinding,
          y: pageH - 116 - lineSpacing,
          size: 7.5,
          font: helveticaBold,
          color: textDark,
        });

        rightPage.drawText('THEORY / FORMULA:', {
          x: 42 + rightBinding,
          y: pageH - 116 - lineSpacing * 2,
          size: 8,
          font: helveticaBold,
          color: textDark,
        });

        // Teacher's Sign & Evaluation Stamp Box at Bottom
        if (includeSignBox) {
          rightPage.drawRectangle({
            x: pageW - 200,
            y: 45,
            width: 165,
            height: 38,
            borderColor: rgb(0.2, 0.4, 0.7),
            borderWidth: 1,
          });

          rightPage.drawText('FACULTY EVALUATION', {
            x: pageW - 190,
            y: 72,
            size: 7.5,
            font: helveticaBold,
            color: rgb(0.2, 0.4, 0.7),
          });

          rightPage.drawText('Marks: ______ / 10      Signature: _________', {
            x: pageW - 192,
            y: 53,
            size: 7.5,
            font: helvetica,
            color: textDark,
          });
        }
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([toArrayBufferBytes(pdfBytes)], { type: 'application/pdf' });
      setGeneratedPdfBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      alert('Error formatting lab journal PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!generatedPdfBlob) return;
    downloadBlob(generatedPdfBlob, `${studentName.replace(/\s+/g, '_')}_Lab_Journal.pdf`);
  };

  return (
    <ToolWorkspaceShell
      title="Lab Journal & Practical Record Formatter"
      subtitle="Automatic alternating Left Page (1cm Graph Paper / Diagram) & Right Page (Ruled Line Notes) with official university header, teacher sign box, and binding margins."
      categoryLabel="University Academic Standard"
      icon={Sparkles}
      microVariant="edit"
      tone="indigo"
      trustNote="Calibrated 1cm vector graph paper · Duplex-ready A4 PDF"
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
              Left Graph · Right Ruled
            </span>
            <span
              className="px-3 py-1 rounded-full font-bold text-[var(--pms-ink)] border border-[var(--pms-border)]"
              style={{ background: 'var(--pms-soft-blue)' }}
            >
              <AnimatedNumber value={numExperiments * 2} suffix=" Pages Configured" />
            </span>
          </div>

          <button
            onClick={handleDownload}
            disabled={!generatedPdfBlob}
            className="pms-btn-primary px-5 py-2.5 rounded-xl font-bold text-xs disabled:opacity-40 flex items-center gap-2 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" /> Download Lab Journal PDF
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
            <div className="pms-glass-panel rounded-3xl p-6 space-y-4">
              <h2 className="text-xs font-bold text-[var(--pms-muted)] uppercase tracking-wider">
                1. University Header Details
              </h2>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-[var(--pms-muted)] block mb-1">
                    College / University Name
                  </label>
                  <input
                    type="text"
                    value={collegeName}
                    onChange={(e) => setCollegeName(e.target.value)}
                    className="w-full bg-[var(--pms-white)] border border-[var(--pms-border)] rounded-xl px-3 py-2 font-semibold text-[var(--pms-ink)] outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="font-semibold text-[var(--pms-muted)] block mb-1">
                    Department &amp; Subject
                  </label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full bg-[var(--pms-white)] border border-[var(--pms-border)] rounded-xl px-3 py-2 text-[var(--pms-ink)] outline-none mb-2 focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full bg-[var(--pms-white)] border border-[var(--pms-border)] rounded-xl px-3 py-2 text-[var(--pms-ink)] outline-none focus:border-indigo-500"
                    placeholder="Subject Name"
                  />
                </div>

                <div>
                  <label className="font-semibold text-[var(--pms-muted)] block mb-1">
                    Experiment #1 Aim Title
                  </label>
                  <input
                    type="text"
                    value={aimTitle}
                    onChange={(e) => setAimTitle(e.target.value)}
                    className="w-full bg-[var(--pms-white)] border border-[var(--pms-border)] rounded-xl px-3 py-2 text-[var(--pms-ink)] outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-[var(--pms-muted)] block mb-1">
                      Student Name
                    </label>
                    <input
                      type="text"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      className="w-full bg-[var(--pms-white)] border border-[var(--pms-border)] rounded-xl px-3 py-2 font-semibold text-[var(--pms-ink)] outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-[var(--pms-muted)] block mb-1">
                      Roll Number
                    </label>
                    <input
                      type="text"
                      value={rollNo}
                      onChange={(e) => setRollNo(e.target.value)}
                      className="w-full bg-[var(--pms-white)] border border-[var(--pms-border)] rounded-xl px-3 py-2 font-semibold text-[var(--pms-ink)] outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Left Page Style */}
              <div className="pt-3 border-t border-[var(--pms-border)] space-y-2">
                <label className="text-xs font-bold text-[var(--pms-muted)] uppercase tracking-wider block">
                  2. Left Page Type (Facing Page)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'green_graph', label: '🟢 1cm Green Graph' },
                    { id: 'blue_graph', label: '🔵 1cm Blue Graph' },
                    { id: 'grey_grid', label: '⚪ Grey Grid Sheet' },
                    { id: 'blank_diagram', label: '◻️ Blank Diagram Frame' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setLeftPageType(item.id as LeftPageType)}
                      className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all cursor-pointer ${
                        leftPageType === item.id
                          ? 'bg-[var(--pms-soft-lavender)] border-indigo-500 text-[var(--pms-ink)] shadow-sm'
                          : 'bg-[var(--pms-white)] border-[var(--pms-border)] text-[var(--pms-muted)] hover:text-[var(--pms-ink)]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Number of Experiments & Toggles */}
              <div className="space-y-3 pt-3 border-t border-[var(--pms-border)]">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-bold text-[var(--pms-ink)]">
                    Number of Experiments (Pages)
                  </label>
                  <select
                    value={numExperiments}
                    onChange={(e) => setNumExperiments(Number(e.target.value))}
                    className="bg-[var(--pms-white)] border border-[var(--pms-border)] rounded-xl px-3 py-1.5 text-xs font-bold text-[var(--pms-ink)] outline-none"
                  >
                    {[2, 4, 6, 8, 10, 15, 20].map((n) => (
                      <option key={n} value={n}>
                        {n} Experiments ({n * 2} Pages)
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[var(--pms-ink)]">
                  <input
                    type="checkbox"
                    checked={includeBindingMargin}
                    onChange={(e) => setIncludeBindingMargin(e.target.checked)}
                    className="rounded accent-indigo-600"
                  />
                  Spiral / Hard Binding Margin Gutter (No text punched)
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[var(--pms-ink)]">
                  <input
                    type="checkbox"
                    checked={includeSignBox}
                    onChange={(e) => setIncludeSignBox(e.target.checked)}
                    className="rounded accent-indigo-600"
                  />
                  Faculty Evaluation &amp; Marks Stamp Box on Every Page
                </label>
              </div>

              <button
                onClick={handleGeneratePdf}
                disabled={isProcessing}
                className="pms-btn-primary w-full py-3.5 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
              >
                {isProcessing ? 'Generating Journal PDF...' : 'Format Academic Lab Journal PDF'}
              </button>
            </div>
          </motion.div>

          {/* Interactive Preview (7 Cols) */}
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="lg:col-span-7 pms-glass-panel rounded-3xl p-6 space-y-4 relative overflow-hidden"
          >
            <PearlScanOverlay active={isProcessing} label="Drawing 1cm millimeter graphs & ruled pages..." />

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)]">
                Live Journal Book Preview
              </h2>
              <AnimatePresence>
                {generatedPdfBlob && (
                  <motion.span
                    initial={prefersReduced ? false : { opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={prefersReduced ? undefined : { opacity: 0, scale: 0.94 }}
                    className="text-xs font-bold text-[var(--pms-ink)] px-3 py-1 rounded-full border border-[var(--pms-border)]"
                    style={{ background: 'var(--pms-soft-mint)' }}
                  >
                    <AnimatedNumber value={numExperiments * 2} suffix=" Pages Ready" />
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            <div className="w-full pms-paper-grid rounded-2xl p-4 flex items-center justify-center min-h-[460px] border border-[var(--pms-border)]">
              {previewUrl ? (
                <iframe
                  src={previewUrl}
                  title="Lab Journal Preview"
                  className="w-full h-[580px] rounded-xl bg-white border border-[var(--pms-border-strong)] shadow-sm"
                />
              ) : (
                <div className="text-center space-y-3 text-[var(--pms-muted)] max-w-sm">
                  <BookOpen className="w-12 h-12 mx-auto opacity-35 text-indigo-500" />
                  <p className="text-xs font-semibold">
                    Fill in your university details and click &quot;Format Academic Lab Journal PDF&quot; to preview the document.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* SEO Guide Section */}
        <ToolSEOSection
          toolName="Lab Journal &amp; Practical Record Formatter"
          headline="Left Graph Paper &amp; Right Ruled Line Sheets for University Records"
          description="Generate academic practical journals with alternating left-side 1cm millimeter graph paper and right-side ruled notebook lines, complete with university header and teacher evaluation marks stamp."
          features={[
            {
              title: 'Precise 1cm & 2mm Graph Sheets',
              desc: 'Vector centimeter grid calibrated to exact physical scale (1cm = 28.35pt) for high-accuracy physics and chemistry plots.',
            },
            {
              title: 'Alternating Left-Right Imposition',
              desc: 'Odd pages strictly contain ruled lines; even pages strictly contain graphs. Print double-sided without manual sorting.',
            },
            {
              title: 'Gutter Margins for Spiral Binding',
              desc: 'Extra binding clearance on the inner seam ensures paper punches and spiral coils never slice through your lab notes.',
            },
            {
              title: 'Official Faculty Signature Stamps',
              desc: 'Pre-formatted faculty evaluation boxes with marks fields (Marks / 10 and Signature) compliant with university standards.',
            },
          ]}
        />
      </div>
    </ToolWorkspaceShell>
  );
}
