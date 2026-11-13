import React, { useState, useRef, useEffect } from 'react';
import {
  Download,
  GraduationCap,
  CheckCircle2,
  Smartphone,
  Eye,
  Plus,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { PDFDocument } from 'pdf-lib';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import ShareQrModal from '../components/ShareQrModal';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';
import { toArrayBufferBytes } from '../lib/blobUrl';
import { dataUrlToBytes, downloadBlob } from '../lib/utils';

type TemplateStyle = 'modern_accent' | 'classic_academic' | 'tech_engineering' | 'medical_science' | 'formal_border';

export default function AssignmentCoverPage() {
  const prefersReduced = useReducedMotion();

  useSEO(
    'College Assignment Cover Page Maker Online — Free Front Page Generator',
    'Create formal college and school assignment cover pages online. Choose from classic university border, engineering lab, and modern templates. Merge directly with your assignment PDF.'
  );

  usePageSEO(
    'Assignment Front Page Maker — University Project Cover Sheet',
    'Free online assignment cover page generator for college, school and university students. Enter Roll No, Subject, Prof name, and merge as Page 1 with your assignment PDF.',
    'assignment cover page maker, front page of assignment, project cover page online, college practical front page format, ignou assignment front page, university assignment front page format',
    '/assignment-cover-page'
  );

  // Template & Theme
  const [template, setTemplate] = useState<TemplateStyle>('modern_accent');
  const [accentColor, setAccentColor] = useState<string>('#1e40af'); // Royal blue default

  // Form Fields
  const [universityName, setUniversityName] = useState('DELHI TECHNOLOGICAL UNIVERSITY');
  const [departmentName, setDepartmentName] = useState('Department of Computer Science & Engineering');
  const [projectTitle, setProjectTitle] = useState('ADVANCED ARTIFICIAL INTELLIGENCE & MACHINE LEARNING');
  const [projectSubtitle, setProjectSubtitle] = useState('Practical Lab Journal & Term Assignment');
  const [subjectName, setSubjectName] = useState('Artificial Intelligence (CS-302)');
  const [sessionYear, setSessionYear] = useState('Academic Session: 2026–2027');

  // Student Info
  const [studentName, setStudentName] = useState('Rahul Sharma');
  const [rollNumber, setRollNumber] = useState('2K26/CS/084');
  const [semesterYear, setSemesterYear] = useState('6th Semester, 3rd Year');
  const [branchSection, setBranchSection] = useState('CSE - Section B');

  // Faculty Info
  const [facultyName, setFacultyName] = useState('Dr. Amit Verma');
  const [facultyDesignation, setFacultyDesignation] = useState('Associate Professor, Dept. of CSE');

  // Submission Date
  const [submissionDate, setSubmissionDate] = useState(() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  });

  // Attached Assignment PDF (Optional)
  const [attachedPdf, setAttachedPdf] = useState<File | null>(null);

  // Preview & Processing
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Render Cover Page onto Canvas (A4 300 DPI: 2480 × 3508)
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1240; // High-res preview
    canvas.height = 1754;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Clean white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // Apply Templates
    if (template === 'modern_accent') {
      // Left vertical accent stripe
      ctx.fillStyle = accentColor;
      ctx.fillRect(0, 0, 36, h);
      ctx.fillRect(48, 0, 8, h);

      // Top Header
      ctx.fillStyle = accentColor;
      ctx.font = 'bold 32px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(universityName.toUpperCase(), w / 2 + 20, 160);

      ctx.fillStyle = '#64748b';
      ctx.font = '20px sans-serif';
      ctx.fillText(departmentName, w / 2 + 20, 205);

      // Decorative divider
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(120, 240);
      ctx.lineTo(w - 60, 240);
      ctx.stroke();

      // University Emblem Graphic (drawn programmatically)
      const cx = w / 2 + 20;
      const cy = 360;
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 60, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = accentColor;
      ctx.font = '36px sans-serif';
      ctx.fillText('🎓', cx, cy + 12);

      // Assignment Title Box
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 36px "Trebuchet MS", sans-serif';
      ctx.fillText(projectTitle.toUpperCase(), cx, 520);

      ctx.fillStyle = '#475569';
      ctx.font = '22px sans-serif';
      ctx.fillText(projectSubtitle, cx, 570);

      // Subject Badge
      ctx.fillStyle = `${accentColor}15`; // 10% opacity tint
      ctx.fillRect(cx - 240, 620, 480, 50);
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - 240, 620, 480, 50);

      ctx.fillStyle = accentColor;
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(`SUBJECT: ${subjectName.toUpperCase()}`, cx, 652);

      // Metadata Cards Grid (Submitted To & Submitted By)
      const boxY = 820;
      const boxH = 460;
      const halfW = (w - 240) / 2;

      // Left Box: Submitted To
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(120, boxY, halfW, boxH);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(120, boxY, halfW, boxH);

      ctx.fillStyle = accentColor;
      ctx.fillRect(120, boxY, halfW, 44);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SUBMITTED TO (FACULTY)', 120 + halfW / 2, boxY + 28);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(facultyName, 145, boxY + 110);
      ctx.fillStyle = '#475569';
      ctx.font = '16px sans-serif';
      ctx.fillText(facultyDesignation, 145, boxY + 150);
      ctx.fillText(departmentName, 145, boxY + 185);

      // Right Box: Submitted By
      const rX = 140 + halfW;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(rX, boxY, halfW, boxH);
      ctx.strokeStyle = '#cbd5e1';
      ctx.strokeRect(rX, boxY, halfW, boxH);

      ctx.fillStyle = accentColor;
      ctx.fillRect(rX, boxY, halfW, 44);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SUBMITTED BY (STUDENT)', rX + halfW / 2, boxY + 28);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(studentName, rX + 25, boxY + 100);

      ctx.fillStyle = '#475569';
      ctx.font = '16px sans-serif';
      ctx.fillText(`Roll No: ${rollNumber}`, rX + 25, boxY + 145);
      ctx.fillText(`Semester: ${semesterYear}`, rX + 25, boxY + 185);
      ctx.fillText(`Branch: ${branchSection}`, rX + 25, boxY + 225);

      // Footer
      ctx.textAlign = 'center';
      ctx.fillStyle = '#64748b';
      ctx.font = '16px sans-serif';
      ctx.fillText(sessionYear, cx, 1580);
      ctx.fillText(`Date of Submission: ${submissionDate}`, cx, 1615);
    } else if (template === 'classic_academic') {
      // Formal Ornate Double Frame
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 4;
      ctx.strokeRect(40, 40, w - 80, h - 80);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(48, 48, w - 96, h - 96);

      // Corner rosettes
      const drawCorner = (x: number, y: number) => {
        ctx.fillStyle = accentColor;
        ctx.fillRect(x - 8, y - 8, 16, 16);
      };
      drawCorner(44, 44);
      drawCorner(w - 44, 44);
      drawCorner(44, h - 44);
      drawCorner(w - 44, h - 44);

      // University Name in classic serif
      ctx.textAlign = 'center';
      ctx.fillStyle = accentColor;
      ctx.font = 'bold 34px "Times New Roman", Georgia, serif';
      ctx.fillText(universityName.toUpperCase(), w / 2, 170);

      ctx.fillStyle = '#475569';
      ctx.font = 'italic 20px "Times New Roman", serif';
      ctx.fillText(departmentName, w / 2, 215);

      // Classical Seal
      const cx = w / 2;
      const cy = 380;
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 75, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 65, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = accentColor;
      ctx.font = '48px serif';
      ctx.fillText('🏛️', cx, cy + 16);

      // Assignment Title
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 36px "Times New Roman", Georgia, serif';
      ctx.fillText(projectTitle.toUpperCase(), cx, 580);

      ctx.fillStyle = '#475569';
      ctx.font = 'italic 22px serif';
      ctx.fillText(projectSubtitle, cx, 630);

      ctx.fillStyle = accentColor;
      ctx.font = 'bold 22px serif';
      ctx.fillText(`Subject: ${subjectName}`, cx, 700);

      // Traditional 2-Column Info
      const startY = 880;
      ctx.textAlign = 'left';

      // Left Column
      ctx.fillStyle = accentColor;
      ctx.font = 'bold 20px "Times New Roman", serif';
      ctx.fillText('SUBMITTED TO:', 120, startY);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 22px serif';
      ctx.fillText(facultyName, 120, startY + 45);
      ctx.fillStyle = '#475569';
      ctx.font = '18px serif';
      ctx.fillText(facultyDesignation, 120, startY + 80);
      ctx.fillText(departmentName, 120, startY + 115);

      // Right Column
      ctx.fillStyle = accentColor;
      ctx.font = 'bold 20px "Times New Roman", serif';
      ctx.fillText('SUBMITTED BY:', w / 2 + 40, startY);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 22px serif';
      ctx.fillText(studentName, w / 2 + 40, startY + 45);
      ctx.fillStyle = '#475569';
      ctx.font = '18px serif';
      ctx.fillText(`Roll No: ${rollNumber}`, w / 2 + 40, startY + 80);
      ctx.fillText(`Semester: ${semesterYear}`, w / 2 + 40, startY + 115);
      ctx.fillText(`Branch: ${branchSection}`, w / 2 + 40, startY + 150);

      // Bottom
      ctx.textAlign = 'center';
      ctx.fillStyle = '#64748b';
      ctx.font = 'italic 18px serif';
      ctx.fillText(sessionYear, cx, 1560);
      ctx.fillText(`Date: ${submissionDate}`, cx, 1600);
    } else {
      // Tech & Engineering Style (Minimal clean grid)
      ctx.fillStyle = accentColor;
      ctx.fillRect(60, 60, w - 120, 12);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 32px "Courier New", monospace, sans-serif';
      ctx.fillText(universityName.toUpperCase(), w / 2, 160);

      ctx.fillStyle = '#64748b';
      ctx.font = '18px monospace';
      ctx.fillText(`[ ${departmentName} ]`, w / 2, 205);

      const cx = w / 2;
      ctx.fillStyle = accentColor;
      ctx.font = '54px sans-serif';
      ctx.fillText('⚙️', cx, 360);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 36px monospace';
      ctx.fillText(projectTitle.toUpperCase(), cx, 520);

      ctx.fillStyle = '#475569';
      ctx.font = '20px monospace';
      ctx.fillText(projectSubtitle, cx, 570);

      ctx.fillStyle = `${accentColor}20`;
      ctx.fillRect(160, 640, w - 320, 50);
      ctx.fillStyle = accentColor;
      ctx.font = 'bold 18px monospace';
      ctx.fillText(`COURSE / LAB CODE: ${subjectName}`, cx, 672);

      // Metadata table
      const tY = 820;
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.strokeRect(100, tY, w - 200, 480);

      ctx.beginPath();
      ctx.moveTo(w / 2, tY);
      ctx.lineTo(w / 2, tY + 480);
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.fillStyle = accentColor;
      ctx.font = 'bold 18px monospace';
      ctx.fillText('> SUPERVISOR / EVALUATOR:', 125, tY + 50);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 22px monospace';
      ctx.fillText(facultyName, 125, tY + 110);
      ctx.fillStyle = '#64748b';
      ctx.font = '16px monospace';
      ctx.fillText(facultyDesignation, 125, tY + 155);

      ctx.fillStyle = accentColor;
      ctx.font = 'bold 18px monospace';
      ctx.fillText('> CANDIDATE CREDENTIALS:', w / 2 + 25, tY + 50);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 22px monospace';
      ctx.fillText(studentName, w / 2 + 25, tY + 110);
      ctx.fillStyle = '#64748b';
      ctx.font = '16px monospace';
      ctx.fillText(`REG NO: ${rollNumber}`, w / 2 + 25, tY + 155);
      ctx.fillText(`TERM: ${semesterYear}`, w / 2 + 25, tY + 195);
      ctx.fillText(`CLASS: ${branchSection}`, w / 2 + 25, tY + 235);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#64748b';
      ctx.font = '16px monospace';
      ctx.fillText(sessionYear, cx, 1560);
      ctx.fillText(`SUBMISSION TIMESTAMP: ${submissionDate}`, cx, 1600);
    }

    setPreviewDataUrl(canvas.toDataURL('image/jpeg', 0.92));
    canvasRef.current = canvas;
  }, [
    template,
    accentColor,
    universityName,
    departmentName,
    projectTitle,
    projectSubtitle,
    subjectName,
    studentName,
    rollNumber,
    semesterYear,
    branchSection,
    facultyName,
    facultyDesignation,
    submissionDate,
    sessionYear,
  ]);

  // Generate & Download PDF (Standalone Cover Page or Merged with Assignment)
  const handleDownloadPdf = async () => {
    if (!canvasRef.current) return;
    setIsProcessing(true);

    try {
      const coverCanvas = canvasRef.current;
      const coverJpgData = coverCanvas.toDataURL('image/jpeg', 0.95);
      const coverJpgBytes = dataUrlToBytes(coverJpgData);

      let finalPdfDoc: PDFDocument;

      if (attachedPdf) {
        // Load attached assignment PDF and insert Cover Page as Page 1
        const attachedBuffer = await attachedPdf.arrayBuffer();
        const attachedDoc = await PDFDocument.load(new Uint8Array(attachedBuffer));
        finalPdfDoc = await PDFDocument.create();

        // Embed Cover Page
        const coverImg = await finalPdfDoc.embedJpg(coverJpgBytes);
        const coverPage = finalPdfDoc.addPage([595.28, 841.89]); // A4
        coverPage.drawImage(coverImg, { x: 0, y: 0, width: 595.28, height: 841.89 });

        // Copy all pages from attached document
        const copiedPages = await finalPdfDoc.copyPages(attachedDoc, attachedDoc.getPageIndices());
        copiedPages.forEach((p) => finalPdfDoc.addPage(p));
      } else {
        // Standalone cover page
        finalPdfDoc = await PDFDocument.create();
        const coverImg = await finalPdfDoc.embedJpg(coverJpgBytes);
        const coverPage = finalPdfDoc.addPage([595.28, 841.89]);
        coverPage.drawImage(coverImg, { x: 0, y: 0, width: 595.28, height: 841.89 });
      }

      const pdfBytes = await finalPdfDoc.save();
      const blob = new Blob([toArrayBufferBytes(pdfBytes)], { type: 'application/pdf' });
      downloadBlob(blob, `assignment-cover-page-${Date.now()}.pdf`);
    } catch (err) {
      console.error('Error generating cover page PDF:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Assignment Cover Page Generator & Dossier"
      subtitle="Create formal university assignment front pages with clean typography and academic borders. Optionally attach your assignment PDF to automatically merge as Page 1!"
      categoryLabel="College & School Special"
      icon={GraduationCap}
      microVariant="edit"
      tone="indigo"
      trustNote="300 DPI A4 cover sheet · Optional auto-merge with your PDF"
    >
      <div className="space-y-8">
        {/* Editor Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Form Column */}
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-6 space-y-5 pms-glass-panel p-6 rounded-3xl"
          >
            {/* Template Selector */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] mb-2">
                Choose Academic Style
              </label>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  { id: 'modern_accent', label: 'Modern Accent' },
                  { id: 'classic_academic', label: 'Classic Border' },
                  { id: 'tech_engineering', label: 'Tech & Engineering' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTemplate(t.id as TemplateStyle)}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition text-center cursor-pointer ${
                      template === t.id
                        ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm'
                        : 'border-[var(--pms-border)] bg-[var(--pms-white)] text-[var(--pms-ink)] hover:border-[var(--pms-border-strong)]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Accent Color Palette */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] mb-1.5">
                Accent Ink Color
              </label>
              <div className="flex gap-2.5">
                {[
                  { name: 'Royal Blue', hex: '#1e40af' },
                  { name: 'Navy', hex: '#0f172a' },
                  { name: 'Crimson', hex: '#991b1b' },
                  { name: 'Forest Green', hex: '#166534' },
                  { name: 'Purple', hex: '#6b21a8' },
                ].map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => setAccentColor(c.hex)}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                    className={`w-8 h-8 rounded-full border-2 transition-transform cursor-pointer ${
                      accentColor === c.hex ? 'scale-110 border-white ring-2 ring-indigo-500' : 'border-transparent'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Institute & Title */}
            <div className="space-y-3 pt-3 border-t border-[var(--pms-border)]">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)]">
                1. University &amp; Assignment Details
              </span>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--pms-muted)] mb-1">
                  University / College / School Name
                </label>
                <input
                  type="text"
                  value={universityName}
                  onChange={(e) => setUniversityName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--pms-border)] bg-[var(--pms-white)] text-[var(--pms-ink)] font-medium focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--pms-muted)] mb-1">
                  Department / Faculty
                </label>
                <input
                  type="text"
                  value={departmentName}
                  onChange={(e) => setDepartmentName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--pms-border)] bg-[var(--pms-white)] text-[var(--pms-ink)] focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--pms-muted)] mb-1">
                  Assignment / Project Title
                </label>
                <input
                  type="text"
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--pms-border)] bg-[var(--pms-white)] text-[var(--pms-ink)] font-bold focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--pms-muted)] mb-1">
                  Subtitle / Record Type
                </label>
                <input
                  type="text"
                  value={projectSubtitle}
                  onChange={(e) => setProjectSubtitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--pms-border)] bg-[var(--pms-white)] text-[var(--pms-ink)] focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--pms-muted)] mb-1">
                    Subject Name &amp; Code
                  </label>
                  <input
                    type="text"
                    value={subjectName}
                    onChange={(e) => setSubjectName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--pms-border)] bg-[var(--pms-white)] text-[var(--pms-ink)] focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--pms-muted)] mb-1">
                    Academic Session
                  </label>
                  <input
                    type="text"
                    value={sessionYear}
                    onChange={(e) => setSessionYear(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--pms-border)] bg-[var(--pms-white)] text-[var(--pms-ink)] focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Student & Faculty Columns */}
            <div className="space-y-3 pt-3 border-t border-[var(--pms-border)]">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)]">
                2. Student &amp; Teacher Credentials
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-[var(--pms-white)] border border-[var(--pms-border)] rounded-2xl space-y-2">
                  <span className="text-[11px] font-bold text-[var(--pms-violet)] uppercase">
                    Student Details
                  </span>
                  <input
                    type="text"
                    placeholder="Student Name"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[var(--pms-border)] bg-transparent text-[var(--pms-ink)] font-medium"
                  />
                  <input
                    type="text"
                    placeholder="Roll Number"
                    value={rollNumber}
                    onChange={(e) => setRollNumber(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[var(--pms-border)] bg-transparent text-[var(--pms-ink)]"
                  />
                  <input
                    type="text"
                    placeholder="Semester / Year"
                    value={semesterYear}
                    onChange={(e) => setSemesterYear(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[var(--pms-border)] bg-transparent text-[var(--pms-ink)]"
                  />
                  <input
                    type="text"
                    placeholder="Branch / Section"
                    value={branchSection}
                    onChange={(e) => setBranchSection(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[var(--pms-border)] bg-transparent text-[var(--pms-ink)]"
                  />
                </div>

                <div className="p-3 bg-[var(--pms-white)] border border-[var(--pms-border)] rounded-2xl space-y-2">
                  <span className="text-[11px] font-bold text-[var(--pms-violet)] uppercase">
                    Faculty Details
                  </span>
                  <input
                    type="text"
                    placeholder="Professor / Teacher Name"
                    value={facultyName}
                    onChange={(e) => setFacultyName(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[var(--pms-border)] bg-transparent text-[var(--pms-ink)] font-medium"
                  />
                  <input
                    type="text"
                    placeholder="Designation"
                    value={facultyDesignation}
                    onChange={(e) => setFacultyDesignation(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[var(--pms-border)] bg-transparent text-[var(--pms-ink)]"
                  />
                  <input
                    type="text"
                    placeholder="Submission Date"
                    value={submissionDate}
                    onChange={(e) => setSubmissionDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[var(--pms-border)] bg-transparent text-[var(--pms-ink)]"
                  />
                </div>
              </div>
            </div>

            {/* Optional: Attach Full Assignment PDF */}
            <div
              className="p-4 rounded-2xl border border-[var(--pms-border)] space-y-2"
              style={{ background: 'var(--pms-soft-lavender)' }}
            >
              <span className="text-xs font-bold text-[var(--pms-ink)] flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-[var(--pms-violet)]" /> Optional: Attach Assignment PDF to Auto-Merge
              </span>
              <p className="text-[11px] text-[var(--pms-muted)]">
                Attach your handwritten or typed PDF. This cover page will become Page 1 of your complete submission!
              </p>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setAttachedPdf(e.target.files?.[0] || null)}
                className="text-xs text-[var(--pms-muted)] file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer"
              />
              <AnimatePresence>
                {attachedPdf && (
                  <motion.div
                    initial={prefersReduced ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReduced ? undefined : { opacity: 0 }}
                    className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Attached: {attachedPdf.name}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Download Buttons */}
            <div className="pt-3 border-t border-[var(--pms-border)] space-y-2">
              <button
                onClick={handleDownloadPdf}
                disabled={isProcessing}
                className="pms-btn-primary w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-bold text-sm transition disabled:opacity-50 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                {attachedPdf ? 'Download Merged Assignment Dossier PDF' : 'Download Cover Page PDF'}
              </button>
              <button
                onClick={() => setShowQrModal(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 bg-[var(--pms-white)] border border-[var(--pms-border)] hover:border-[var(--pms-border-strong)] text-[var(--pms-ink)] rounded-xl font-semibold text-xs transition cursor-pointer"
              >
                <Smartphone className="w-3.5 h-3.5" /> Send to Mobile Phone
              </button>
            </div>
          </motion.div>

          {/* Right Live Preview */}
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 }}
            className="lg:col-span-6 pms-glass-panel p-6 rounded-3xl flex flex-col items-center relative overflow-hidden"
          >
            <PearlScanOverlay active={isProcessing} label="Building A4 assignment dossier PDF..." />

            <div className="w-full flex items-center justify-between mb-4 flex-wrap gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-[var(--pms-violet)]" /> A4 Cover Page Real-Time Preview
              </span>
              <span
                className="text-xs font-semibold px-3 py-1 text-[var(--pms-ink)] rounded-full border border-[var(--pms-border)]"
                style={{ background: 'var(--pms-soft-blue)' }}
              >
                Print Ready A4 (<AnimatedNumber value={300} suffix=" DPI" />)
              </span>
            </div>

            {previewDataUrl ? (
              <div className="w-full max-h-[640px] overflow-auto flex items-center justify-center p-4 pms-paper-grid rounded-2xl border border-[var(--pms-border)]">
                <img
                  src={previewDataUrl}
                  alt="Assignment Cover Page Preview"
                  className="max-h-[580px] w-auto object-contain rounded bg-white shadow-lg border border-[var(--pms-border-strong)]"
                />
              </div>
            ) : (
              <div className="w-full h-96 flex items-center justify-center text-[var(--pms-muted)] text-xs">
                Rendering live cover preview...
              </div>
            )}
          </motion.div>
        </div>

        {/* SEO Section */}
        <ToolSEOSection
          toolName="Assignment Cover Page Maker"
          headline="Professional College & University Assignment Front Page Generator"
          description="Every college and school submission requires an official front cover page containing the university name, student roll number, subject code, and faculty evaluator details. Instead of spending hours struggling with MS Word table borders or Canva alignment, create and download a print-ready A4 cover page in under 30 seconds."
          steps={[
            {
              step: '01',
              title: 'Choose Style Template',
              desc: 'Select from Modern Minimalist, Classic Academic Double Border, or Engineering Lab layout.',
            },
            {
              step: '02',
              title: 'Enter Credentials',
              desc: 'Fill in your name, roll number, semester, subject code, and teacher designation.',
            },
            {
              step: '03',
              title: 'Attach Assignment & Download',
              desc: 'Optionally upload your assignment PDF to merge the cover page as Page 1 automatically.',
            },
          ]}
          features={[
            {
              title: 'Auto-Merge Assignment Dossier',
              desc: 'Attach your written homework or lab PDF; the tool prepends the cover page seamlessly into a single file.',
            },
            {
              title: 'Official Academic Borders',
              desc: 'Includes traditional dual heraldic frames recognized by major state, private, and central universities.',
            },
            {
              title: 'Custom Accent Themes',
              desc: 'Match your institution colors with Royal Blue, Oxford Navy, Crimson, or Forest Green.',
            },
          ]}
          faqs={[
            {
              q: 'Can I print this on a normal home or college printer?',
              a: 'Yes, the cover page is formatted to exact A4 international dimensions (210 × 297 mm) and prints crisply on any standard laser or inkjet printer.',
            },
            {
              q: 'Can I use this for IGNOU or Delhi University assignments?',
              a: 'Yes! The information fields match standard university requirements across IGNOU, DU, Mumbai University, AKTU, RTU, and CBSE/ICSE schools.',
            },
          ]}
        />

        {/* Mobile Transfer Modal */}
        <ShareQrModal
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          title="Assignment Cover Page PDF"
          fileName="assignment-cover.pdf"
        />
      </div>
    </ToolWorkspaceShell>
  );
}

