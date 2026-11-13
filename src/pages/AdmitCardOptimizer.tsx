import React, { useState } from 'react';
import {
  GraduationCap,
  Download,
  MapPin,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import FileDropzone from '../components/FileDropzone';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';
import ToolSEOSection from '../components/ToolSEOSection';
import { downloadBlob } from '../lib/utils';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';

export default function AdmitCardOptimizer() {
  useSEO(
    'Admit Card 1-Page Optimizer — Exam Center GPS QR & Guidelines | PDF Media Suite',
    'Compress multi-page admit cards to a single page. Auto-adds Google Maps navigation QR code, passport photo paste box, and thumb impression guidelines.'
  );

  usePageSEO(
    'Smart Admit Card 1-Page Optimizer — Exam Day GPS Buddy',
    'Free online admit card converter for UPSC, SSC, NEET, JEE, and Railway exams. Strips terms and conditions to save print costs and embeds an exam center GPS QR code.',
    'admit card optimizer, 1 page admit card print, exam center gps qr code, ssc admit card compactor, neet admit card photo box, emitra admit card helper',
    '/admit-card-optimizer'
  );

  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [totalPages, setTotalPages] = useState<number>(0);
  const [examCenterAddress, setExamCenterAddress] = useState<string>('Govt High School, Civil Lines');
  const [includeGpsQr, setIncludeGpsQr] = useState<boolean>(true);
  const [includePhotoBox, setIncludePhotoBox] = useState<boolean>(true);
  const [includeThumbBox, setIncludeThumbBox] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const prefersReduced = useReducedMotion();
  useAutoRevokeUrl(previewUrl);

  const handleFileUpload = async (file: File) => {
    if (file.type !== 'application/pdf') {
      alert('Please upload an Admit Card in PDF format.');
      return;
    }

    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const u8 = new Uint8Array(buffer);
      setPdfBytes(u8);

      const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
      setTotalPages(doc.numPages);

      // Try reading text from Page 1 to auto-detect center address keywords
      const page1 = await doc.getPage(1);
      const textContent = await page1.getTextContent();
      const text = textContent.items.map((i: any) => i.str).join(' ');

      // Simple heuristic for center address extraction
      const match = text.match(/(?:Center|Venue|Exam Centre|Examination Venue)[:\s]+([^,\n\r]+(?:,[^,\n\r]+){1,3})/i);
      if (match && match[1]) {
        setExamCenterAddress(match[1].trim());
      }
    } catch (err) {
      console.error(err);
      alert('Failed to read admit card PDF.');
    }
  };

  const handleProcessAdmitCard = async () => {
    if (!pdfBytes) return;

    setIsProcessing(true);

    try {
      const srcDoc = await PDFDocument.load(pdfBytes);
      const outDoc = await PDFDocument.create();

      // Copy only Page 1 (The core hall ticket / admit card)
      const [copiedPage] = await outDoc.copyPages(srcDoc, [0]);
      outDoc.addPage(copiedPage);

      const page = outDoc.getPage(0);
      const { width, height } = page.getSize();
      const font = await outDoc.embedFont(StandardFonts.HelveticaBold);
      const fontReg = await outDoc.embedFont(StandardFonts.Helvetica);

      // 1. Embed 100% Offline Google Maps GPS QR Code in top right if selected
      if (includeGpsQr && examCenterAddress.trim()) {
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(examCenterAddress.trim())}`;

        try {
          // Instant 100% Local In-Browser QR Generation
          const qrDataUrl = await QRCode.toDataURL(mapsUrl, { width: 180, margin: 1 });
          const base64Data = qrDataUrl.split(',')[1];
          const rawBinary = atob(base64Data);
          const qrBytes = new Uint8Array(rawBinary.length);
          for (let i = 0; i < rawBinary.length; i++) {
            qrBytes[i] = rawBinary.charCodeAt(i);
          }
          const qrImg = await outDoc.embedPng(qrBytes);

          const qrSize = 55;
          const qrX = width - qrSize - 20;
          const qrY = height - qrSize - 35;

          // White background card
          page.drawRectangle({
            x: qrX - 5,
            y: qrY - 14,
            width: qrSize + 10,
            height: qrSize + 22,
            color: rgb(1, 1, 1),
            borderColor: rgb(0.1, 0.6, 0.3),
            borderWidth: 1.5,
          });

          page.drawImage(qrImg, {
            x: qrX,
            y: qrY,
            width: qrSize,
            height: qrSize,
          });

          page.drawText('📍 SCAN FOR GPS MAP', {
            x: qrX - 3,
            y: qrY - 9,
            size: 5,
            font,
            color: rgb(0.1, 0.5, 0.2),
          });
        } catch (e) {
          console.warn('Could not generate GPS QR', e);
        }
      }

      // 2. Embed Passport Photo Box (Right side or bottom)
      if (includePhotoBox) {
        const boxW = 85;
        const boxH = 105;
        const boxX = width - boxW - 20;
        const boxY = height - 190;

        page.drawRectangle({
          x: boxX,
          y: boxY,
          width: boxW,
          height: boxH,
          color: rgb(1, 1, 1),
          borderColor: rgb(0.3, 0.3, 0.3),
          borderWidth: 1,
        });

        page.drawText('PASTE SAME PHOTO', {
          x: boxX + 6,
          y: boxY + boxH - 20,
          size: 6,
          font,
          color: rgb(0.2, 0.2, 0.2),
        });

        page.drawText('AS UPLOADED (3.5x4.5cm)', {
          x: boxX + 5,
          y: boxY + boxH - 30,
          size: 5,
          font: fontReg,
          color: rgb(0.5, 0.5, 0.5),
        });
      }

      // 3. Embed Thumb Impression & Invigilator Signature at bottom
      if (includeThumbBox) {
        const barH = 50;
        const barW = width - 40;
        const barX = 20;
        const barY = 15;

        page.drawRectangle({
          x: barX,
          y: barY,
          width: barW,
          height: barH,
          color: rgb(1, 1, 1),
          borderColor: rgb(0.3, 0.3, 0.3),
          borderWidth: 1,
        });

        // Split in 3 columns: Left Thumb, Candidate Signature, Invigilator Signature
        const colW = barW / 3;

        // Col 1: Left Thumb
        page.drawText('Left Thumb Impression (LTI)', {
          x: barX + 10,
          y: barY + barH - 12,
          size: 6.5,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
        page.drawText('(In presence of invigilator)', {
          x: barX + 10,
          y: barY + 6,
          size: 5,
          font: fontReg,
          color: rgb(0.5, 0.5, 0.5),
        });

        // Col 2: Candidate Sign
        page.drawLine({
          start: { x: barX + colW, y: barY },
          end: { x: barX + colW, y: barY + barH },
          color: rgb(0.7, 0.7, 0.7),
          thickness: 1,
        });

        page.drawText("Candidate's Signature", {
          x: barX + colW + 15,
          y: barY + barH - 12,
          size: 6.5,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
        page.drawText('(To be signed in exam hall)', {
          x: barX + colW + 15,
          y: barY + 6,
          size: 5,
          font: fontReg,
          color: rgb(0.5, 0.5, 0.5),
        });

        // Col 3: Invigilator Sign
        page.drawLine({
          start: { x: barX + colW * 2, y: barY },
          end: { x: barX + colW * 2, y: barY + barH },
          color: rgb(0.7, 0.7, 0.7),
          thickness: 1,
        });

        page.drawText("Invigilator's Signature & Stamp", {
          x: barX + colW * 2 + 10,
          y: barY + barH - 12,
          size: 6.5,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
      }

      const outBytes = await outDoc.save();
      const blob = new Blob([toArrayBufferBytes(outBytes)], { type: 'application/pdf' });
      downloadBlob(blob, `1Page_AdmitCard_${fileName}`);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      alert('Error creating 1-Page Admit Card.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Smart Admit Card 1-Page Optimizer + Exam Center GPS QR"
      subtitle="Extracts vital hall ticket onto 1 clean page, adds Google Maps navigation QR for your exam center, and stamps official photo/thumb guideline boxes."
      categoryLabel="Exam Day Buddy • Save ₹20+ Print Costs"
      icon={GraduationCap}
      microVariant="compress"
      tone="blue"
      trustNote="100% offline in your browser • Your admit card details stay private"
    >
      <div className="w-full max-w-4xl mx-auto space-y-8">
        {/* Upload State */}
        {!pdfBytes && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.22 }}
            className="w-full max-w-2xl mx-auto"
          >
            <FileDropzone
              onDrop={(files) => files[0] && handleFileUpload(files[0])}
              multiple={false}
              accept={{ 'application/pdf': ['.pdf'] }}
              title="Drop 4-5 Page Admit Card PDF Here"
              subtitle="Works for NTA, UPSC, SSC, NEET, JEE, CUET, Police & Railway hall tickets. Strips T&C pages automatically."
            />
          </motion.div>
        )}

        {/* Form & Settings */}
        {pdfBytes && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.24 }}
            className="p-6 sm:p-8 rounded-3xl pms-glass-panel space-y-6 relative overflow-hidden"
          >
            <PearlScanOverlay active={isProcessing} label="Compiling 1-page exam-day hall ticket & GPS QR..." />

            <div className="flex items-center justify-between pb-4 border-b border-[var(--pms-border)]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/70 dark:border-blue-800/50 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-[var(--pms-ink)] truncate">{fileName}</h4>
                  <p className="text-xs text-[var(--pms-muted)]">
                    Original: <AnimatedNumber value={totalPages} suffix=" Pages" /> • Compressing to exactly 1 Page
                  </p>
                </div>
              </div>

              <button
                onClick={() => setPdfBytes(null)}
                className="text-xs font-semibold text-[var(--pms-muted)] hover:text-[var(--pms-ink)] underline shrink-0"
              >
                Upload Different File
              </button>
            </div>

            {/* Exam Center GPS QR Setup */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-[var(--pms-ink)] flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Exam Center GPS QR Code
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-8">
                  <label className="block text-xs font-bold text-[var(--pms-ink)] mb-1">
                    Exam Center Name / Address (for Google Maps Navigation)
                  </label>
                  <input
                    type="text"
                    value={examCenterAddress}
                    onChange={(e) => setExamCenterAddress(e.target.value)}
                    placeholder="e.g. Modern Public School, Sector 4, Rohini, New Delhi"
                    className="w-full px-4 py-2.5 rounded-xl border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 text-sm text-[var(--pms-ink)] outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1.5 text-[11px] text-[var(--pms-muted)]">
                    Students can scan this QR code on the physical printout on exam day to open live turn-by-turn Google Maps navigation.
                  </p>
                </div>

                <div className="md:col-span-4 flex items-center">
                  <div className="w-full p-4 rounded-2xl bg-white/60 dark:bg-slate-900/60 border border-[var(--pms-border)] space-y-2.5 text-xs">
                    <label className="flex items-center gap-2 font-bold text-[var(--pms-ink)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeGpsQr}
                        onChange={(e) => setIncludeGpsQr(e.target.checked)}
                        className="rounded text-blue-600"
                      />
                      Embed GPS Map QR Code
                    </label>

                    <label className="flex items-center gap-2 font-bold text-[var(--pms-ink)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includePhotoBox}
                        onChange={(e) => setIncludePhotoBox(e.target.checked)}
                        className="rounded text-blue-600"
                      />
                      Add Photo Paste Box
                    </label>

                    <label className="flex items-center gap-2 font-bold text-[var(--pms-ink)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeThumbBox}
                        onChange={(e) => setIncludeThumbBox(e.target.checked)}
                        className="rounded text-blue-600"
                      />
                      Add Thumb &amp; Sign Guidelines
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {previewUrl && (
              <div className="p-3 rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  1-Page Admit Card ready and downloaded!
                </span>
                <a
                  href={previewUrl}
                  download={`1Page_AdmitCard_${fileName}`}
                  className="font-bold text-emerald-700 dark:text-emerald-300 underline shrink-0"
                >
                  Download Again
                </a>
              </div>
            )}

            <div className="pt-4 border-t border-[var(--pms-border)] flex justify-end">
              <button
                onClick={handleProcessAdmitCard}
                disabled={isProcessing}
                className="pms-btn-primary inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {isProcessing ? 'Generating 1-Page Admit Card...' : 'Generate 1-Page Exam-Day PDF'}
              </button>
            </div>
          </motion.div>
        )}

        {/* SEO Information */}
        <ToolSEOSection
          toolName="Smart Admit Card 1-Page Optimizer"
          headline="Compact Hall Ticket Generator with Live Google Maps Center QR & Stamp Guidelines"
          description="A vital utility for government exam aspirants (UPSC, SSC, Railway, NEET, JEE, CUET). Automatically prunes irrelevant multi-page exam guidelines to compact the admit card onto a single crisp A4 page. Generates a live Google Maps navigation QR code so students and parents can reach the center without confusion on exam day."
        />
      </div>
    </ToolWorkspaceShell>
  );
}

