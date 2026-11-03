import React, { useState, useRef } from 'react';
import {
  GraduationCap,
  Upload,
  Download,
  MapPin,
  QrCode,
  CheckCircle2,
  Image as ImageIcon,
  FileText,
  Sparkles,
  Scissors,
  Check,
  Navigation,
} from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { downloadBlob } from '../lib/utils';

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

  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const blob = new Blob([outBytes as any], { type: 'application/pdf' });
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
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-xs font-bold text-blue-700 dark:text-blue-300 mb-2">
            <GraduationCap className="w-3.5 h-3.5" /> Exam Day Buddy • Save ₹20+ Print Costs
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">
            Smart Admit Card 1-Page Optimizer + Exam Center GPS QR
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Extracts vital hall ticket onto 1 clean page, adds Google Maps navigation QR for your exam center, and stamps official photo/thumb guideline boxes.
          </p>
        </div>

        {/* Upload State */}
        {!pdfBytes && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl p-12 text-center bg-white dark:bg-slate-900 hover:border-blue-500 hover:bg-blue-50/20 dark:hover:bg-blue-950/20 cursor-pointer transition-all group"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              accept="application/pdf"
              className="hidden"
            />
            <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <Upload className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Drop 4-5 Page Admit Card PDF Here
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Works for NTA, UPSC, SSC, NEET, JEE, CUET, Police, and Railway hall tickets. Discards irrelevant terms &amp; conditions automatically.
            </p>
          </div>
        )}

        {/* Form & Settings */}
        {pdfBytes && (
          <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">{fileName}</h4>
                  <p className="text-xs text-slate-400">
                    Original: {totalPages} Pages • Compressing to exactly 1 Page
                  </p>
                </div>
              </div>

              <button
                onClick={() => setPdfBytes(null)}
                className="text-xs font-semibold text-slate-500 hover:underline"
              >
                Upload Different File
              </button>
            </div>

            {/* Exam Center GPS QR Setup */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-600" /> Exam Center GPS QR Code
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-8">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Exam Center Name / Address (for Google Maps Navigation)
                  </label>
                  <input
                    type="text"
                    value={examCenterAddress}
                    onChange={(e) => setExamCenterAddress(e.target.value)}
                    placeholder="e.g. Modern Public School, Sector 4, Rohini, New Delhi"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Students can scan this QR code on the physical printout on exam day to open live turn-by-turn Google Maps navigation.
                  </p>
                </div>

                <div className="md:col-span-4 flex items-center">
                  <div className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                    <label className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeGpsQr}
                        onChange={(e) => setIncludeGpsQr(e.target.checked)}
                        className="rounded text-blue-600"
                      />
                      Embed GPS Map QR Code
                    </label>

                    <label className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includePhotoBox}
                        onChange={(e) => setIncludePhotoBox(e.target.checked)}
                        className="rounded text-blue-600"
                      />
                      Add Photo Paste Box
                    </label>

                    <label className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
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

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={handleProcessAdmitCard}
                disabled={isProcessing}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 disabled:opacity-50 transition-all"
              >
                <Download className="w-4 h-4" />
                {isProcessing ? 'Generating 1-Page Admit Card...' : 'Generate 1-Page Exam-Day PDF'}
              </button>
            </div>
          </div>
        )}

        {/* SEO Information */}
        <ToolSEOSection
          toolName="Smart Admit Card 1-Page Optimizer"
          headline="Compact Hall Ticket Generator with Live Google Maps Center QR & Stamp Guidelines"
          description="A vital utility for government exam aspirants (UPSC, SSC, Railway, NEET, JEE, CUET). Automatically prunes irrelevant multi-page exam guidelines to compact the admit card onto a single crisp A4 page. Generates a live Google Maps navigation QR code so students and parents can reach the center without confusion on exam day."
        />
      </div>
    </div>
  );
}

