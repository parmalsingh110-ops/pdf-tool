import React, { useState } from 'react';
import {
  Upload,
  Download,
  Printer,
  Sparkles,
  BookOpen,
  Grid,
  FileText,
  CheckCircle2,
  Sliders,
  PenTool,
} from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { downloadBlob } from '../lib/utils';
import { embedSmartFont } from '../lib/pdfFontHelper';

type LeftPageType = 'green_graph' | 'blue_graph' | 'grey_grid' | 'blank_diagram';
type RuledStyle = 'single_line' | 'engineering_ruled' | 'plain';

export default function LabJournalFormatter() {
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
  const [experimentNo, setExperimentNo] = useState('Experiment No. 01');
  const [aimTitle, setAimTitle] = useState('To determine the coefficient of viscosity / Study verification of Ohm’s Law');
  const [numExperiments, setNumExperiments] = useState<number>(4);

  // Styles
  const [leftPageType, setLeftPageType] = useState<LeftPageType>('green_graph');
  const [ruledStyle, setRuledStyle] = useState<RuledStyle>('single_line');
  const [includeSignBox, setIncludeSignBox] = useState<boolean>(true);
  const [includeBindingMargin, setIncludeBindingMargin] = useState<boolean>(true);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generatedPdfBlob, setGeneratedPdfBlob] = useState<Blob | null>(null);

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
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
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
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-bold mb-2">
              <Sparkles className="w-3.5 h-3.5" /> University Academic Standard
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">
              Lab Journal &amp; Practical Record Formatter
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
              Automatic alternating Left Page (1cm Graph Paper / Diagram) &amp; Right Page (Ruled Line Notes) with official university header, teacher sign box, and binding margins.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDownload}
              disabled={!generatedPdfBlob}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md disabled:opacity-40 flex items-center gap-2 transition-all"
            >
              <Download className="w-4 h-4" /> Download Lab Journal PDF
            </button>
          </div>
        </div>

        {/* Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Controls (5 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-sm space-y-4">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                1. University Header Details
              </h2>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                    College / University Name
                  </label>
                  <input
                    type="text"
                    value={collegeName}
                    onChange={(e) => setCollegeName(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-semibold text-slate-900 dark:text-white outline-none"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                    Department &amp; Subject
                  </label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white outline-none mb-2"
                  />
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white outline-none"
                    placeholder="Subject Name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                      Student Name
                    </label>
                    <input
                      type="text"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-semibold text-slate-900 dark:text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                      Roll Number
                    </label>
                    <input
                      type="text"
                      value={rollNo}
                      onChange={(e) => setRollNo(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-semibold text-slate-900 dark:text-white outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Left Page Style */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
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
                      className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all ${
                        leftPageType === item.id
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-800 dark:text-indigo-200'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Number of Experiments & Toggles */}
              <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    Number of Experiments (Pages)
                  </label>
                  <select
                    value={numExperiments}
                    onChange={(e) => setNumExperiments(Number(e.target.value))}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none"
                  >
                    {[2, 4, 6, 8, 10, 15, 20].map((n) => (
                      <option key={n} value={n}>
                        {n} Experiments ({n * 2} Pages)
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={includeBindingMargin}
                    onChange={(e) => setIncludeBindingMargin(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  Spiral / Hard Binding Margin Gutter (No text punched)
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={includeSignBox}
                    onChange={(e) => setIncludeSignBox(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  Faculty Evaluation &amp; Marks Stamp Box on Every Page
                </label>
              </div>

              <button
                onClick={handleGeneratePdf}
                disabled={isProcessing}
                className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {isProcessing ? 'Generating Journal PDF...' : 'Format Academic Lab Journal PDF'}
              </button>
            </div>
          </div>

          {/* Interactive Preview (7 Cols) */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                Live Journal Book Preview
              </h2>
              {generatedPdfBlob && (
                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-3 py-1 rounded-full border border-indigo-200">
                  {numExperiments * 2} Pages Ready
                </span>
              )}
            </div>

            <div className="w-full bg-slate-100 dark:bg-slate-950/80 rounded-2xl p-4 flex items-center justify-center min-h-[460px] border border-slate-200/70 dark:border-slate-800">
              {previewUrl ? (
                <iframe
                  src={previewUrl}
                  title="Lab Journal Preview"
                  className="w-full h-[580px] rounded-xl border border-slate-300 dark:border-slate-700"
                />
              ) : (
                <div className="text-center space-y-3 text-slate-400">
                  <BookOpen className="w-12 h-12 mx-auto opacity-30 text-indigo-500" />
                  <p className="text-xs font-semibold">
                    Fill in your university details and click "Format Academic Lab Journal PDF" to preview the document.
                  </p>
                </div>
              )}
            </div>
          </div>
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
    </div>
  );
}
