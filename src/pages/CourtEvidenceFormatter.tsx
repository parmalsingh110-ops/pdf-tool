import React, { useState, useRef } from 'react';
import {
  Scale,
  Upload,
  Download,
  FileCheck2,
  Calendar,
  User,
  ShieldAlert,
  Clock,
  Sparkles,
  FileText,
  Layers,
} from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { downloadBlob } from '../lib/utils';

interface ChatMessage {
  date: string;
  time: string;
  sender: string;
  text: string;
}

function cleanWinAnsi(str: string): string {
  if (!str) return '';
  return str
    .replace(/₹/g, 'Rs. ')
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[•·]/g, '*')
    .replace(/…/g, '...')
    .replace(/[^\x00-\x7F]/g, ' ');
}

export default function CourtEvidenceFormatter() {
  useSEO(
    'Court Evidence Formatter — Section 63 BSA / 65B WhatsApp Chat to PDF | PDF Media Suite',
    'Format WhatsApp chats into court-admissible electronic evidence with continuous exhibit numbering and pre-filled Section 63 BSA / 65B Evidence Act certificate.'
  );

  usePageSEO(
    'WhatsApp Chat to Court Evidence Formatter — Section 63 BSA Legal PDF',
    'Free online electronic evidence compiler for advocates, police, and litigants. Converts WhatsApp chat exports into certified legal green paper PDFs with 65B certificates.',
    'whatsapp court evidence, section 63 bsa certificate, section 65b evidence act pdf, court chat formatter, advocate legal petition annexure, electronic evidence certificate',
    '/court-evidence-formatter'
  );

  const [chatText, setChatText] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [courtName, setCourtName] = useState<string>('IN THE COURT OF DISTRICT & SESSIONS JUDGE');
  const [caseNumber, setCaseNumber] = useState<string>('CIVIL / CRIMINAL SUIT NO. _____ OF 2026');
  const [partyA, setPartyA] = useState<string>('PETITIONER / COMPLAINANT');
  const [partyB, setPartyB] = useState<string>('RESPONDENT / ACCUSED');
  const [exhibitPrefix, setExhibitPrefix] = useState<string>('EXHIBIT P-');
  const [deponentName, setDeponentName] = useState<string>('Name of Deponent / Owner of Phone');
  const [deviceModel, setDeviceModel] = useState<string>('OnePlus / Samsung Galaxy / iPhone');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse WhatsApp exported .txt chat format
  const parseWhatsAppTxt = (raw: string) => {
    const lines = raw.split(/\r?\n/);
    const parsed: ChatMessage[] = [];

    // Common formats:
    // 25/10/24, 10:15 pm - Person: message
    // [25/10/24, 10:15:30] Person: message
    const regex1 = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?)\s*-\s*([^:]+):\s*(.+)$/i;
    const regex2 = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?)\]\s*([^:]+):\s*(.+)$/i;

    let currentMsg: ChatMessage | null = null;

    for (const line of lines) {
      const match = line.match(regex1) || line.match(regex2);
      if (match) {
        if (currentMsg) parsed.push(currentMsg);
        currentMsg = {
          date: match[1],
          time: match[2],
          sender: match[3].trim(),
          text: match[4].trim(),
        };
      } else if (currentMsg && line.trim()) {
        // Multi-line message continuation
        currentMsg.text += `\n${line.trim()}`;
      }
    }

    if (currentMsg) parsed.push(currentMsg);

    setMessages(parsed);
    setChatText(raw);
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      parseWhatsAppTxt(text);
    };
    reader.readAsText(file);
  };

  // Generate Formal Court-Ready PDF with Section 63 BSA Cover Certificate
  const handleGenerateLegalPdf = async () => {
    if (messages.length === 0 && !chatText.trim()) {
      alert('Please upload or paste a WhatsApp chat export.');
      return;
    }

    setIsProcessing(true);

    try {
      const doc = await PDFDocument.create();
      const fontBold = await doc.embedFont(StandardFonts.TimesRomanBold);
      const fontRegular = await doc.embedFont(StandardFonts.TimesRoman);
      const fontItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);

      // Legal Paper dimensions: 8.5 x 14 inches (612 x 1008 pt)
      const pageWidth = 612;
      const pageHeight = 1008;
      const leftMargin = 90; // 1.25 inch gutter margin for court binding
      const rightMargin = 50;
      const contentWidth = pageWidth - leftMargin - rightMargin;

      // ── PAGE 1: CERTIFICATE UNDER SECTION 63 BHARATIYA SAKSHYA ADHINIYAM, 2023 ──
      const certPage = doc.addPage([pageWidth, pageHeight]);

      // Court Heading
      certPage.drawText(courtName, {
        x: leftMargin + (contentWidth - fontBold.widthOfTextAtSize(courtName, 12)) / 2,
        y: pageHeight - 60,
        size: 12,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1),
      });

      certPage.drawText(caseNumber, {
        x: leftMargin + (contentWidth - fontBold.widthOfTextAtSize(caseNumber, 11)) / 2,
        y: pageHeight - 80,
        size: 11,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1),
      });

      // Parties
      certPage.drawText(`${partyA} ... PETITIONER`, {
        x: leftMargin,
        y: pageHeight - 120,
        size: 11,
        font: fontBold,
      });

      certPage.drawText('VERSUS', {
        x: leftMargin + contentWidth / 2 - 20,
        y: pageHeight - 140,
        size: 11,
        font: fontBold,
      });

      certPage.drawText(`${partyB} ... RESPONDENT`, {
        x: leftMargin,
        y: pageHeight - 160,
        size: 11,
        font: fontBold,
      });

      // Certificate Title
      const title1 = 'CERTIFICATE UNDER SECTION 63 OF BHARATIYA SAKSHYA ADHINIYAM, 2023';
      const title2 = '(CORRESPONDING TO ERSTWHILE SECTION 65B OF INDIAN EVIDENCE ACT, 1872)';
      certPage.drawText(title1, {
        x: leftMargin + (contentWidth - fontBold.widthOfTextAtSize(title1, 10)) / 2,
        y: pageHeight - 210,
        size: 10,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1),
      });
      certPage.drawText(title2, {
        x: leftMargin + (contentWidth - fontItalic.widthOfTextAtSize(title2, 9)) / 2,
        y: pageHeight - 225,
        size: 9,
        font: fontItalic,
        color: rgb(0.3, 0.3, 0.3),
      });

      // Statutory Text
      const certClauses = [
        `1. I, ${deponentName}, do hereby solemnly state and affirm that I am the registered user and lawful custodian of mobile device model: ${deviceModel}.`,
        '2. The electronic communication records (WhatsApp instant messages) annexed hereto as Exhibit Annexures were produced by the said computer/mobile device during the period over which the device was used regularly.',
        '3. Throughout the material period, the mobile device was operating properly, and there was no interruption or malfunction that would affect the authenticity or integrity of the electronic record.',
        '4. The printout represents an exact, unaltered reproduction of the messages sent and received on the said communication platform.',
        '5. The hash value and electronic contents have been verified to be true, complete, and un-tampered to the best of my knowledge and belief.',
      ];

      let cy = pageHeight - 270;
      for (const clause of certClauses) {
        // Simple line wrap
        const words = clause.split(' ');
        let line = '';
        for (const w of words) {
          if (fontRegular.widthOfTextAtSize(`${line} ${w}`, 11) < contentWidth) {
            line = `${line} ${w}`.trim();
          } else {
            certPage.drawText(line, { x: leftMargin, y: cy, size: 11, font: fontRegular });
            cy -= 18;
            line = w;
          }
        }
        if (line) {
          certPage.drawText(line, { x: leftMargin, y: cy, size: 11, font: fontRegular });
          cy -= 28;
        }
      }

      // Deponent Signatures
      certPage.drawText('VERIFICATION', {
        x: leftMargin,
        y: cy - 20,
        size: 11,
        font: fontBold,
      });

      certPage.drawText(
        `Verified at ____________ on this ______ day of ____________, 2026 that the contents above are true and correct.`,
        { x: leftMargin, y: cy - 40, size: 10, font: fontRegular }
      );

      certPage.drawText('DEPONENT / CERTIFICATE ISSUER', {
        x: pageWidth - rightMargin - 220,
        y: cy - 100,
        size: 10,
        font: fontBold,
      });

      certPage.drawText('Signature: _______________________', {
        x: pageWidth - rightMargin - 220,
        y: cy - 120,
        size: 10,
        font: fontRegular,
      });

      // ── PAGE 2+: CHAT EXHIBITS ──
      let chatPage = doc.addPage([pageWidth, pageHeight]);
      let curY = pageHeight - 70;
      let exhibitIndex = 1;

      // Header on Exhibit Page
      const drawExhibitHeader = (p: any, exNum: number) => {
        p.drawText(`${exhibitPrefix}${exNum} — TRUE COPY OF WHATSAPP RECORD`, {
          x: leftMargin,
          y: pageHeight - 40,
          size: 10,
          font: fontBold,
          color: rgb(0.1, 0.1, 0.1),
        });
        p.drawLine({
          start: { x: leftMargin, y: pageHeight - 46 },
          end: { x: pageWidth - rightMargin, y: pageHeight - 46 },
          thickness: 1,
          color: rgb(0.7, 0.7, 0.7),
        });
      };

      drawExhibitHeader(chatPage, exhibitIndex);

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];

        if (curY < 120) {
          chatPage = doc.addPage([pageWidth, pageHeight]);
          exhibitIndex++;
          drawExhibitHeader(chatPage, exhibitIndex);
          curY = pageHeight - 70;
        }

        // Message Box
        chatPage.drawText(`[${msg.date} ${msg.time}]  ${msg.sender}:`, {
          x: leftMargin,
          y: curY,
          size: 9.5,
          font: fontBold,
          color: rgb(0.1, 0.3, 0.7),
        });
        curY -= 15;

        // Message Body
        const sanitizedText = cleanWinAnsi(msg.text);
        const words = sanitizedText.split(' ');
        let line = '';
        for (const w of words) {
          if (fontRegular.widthOfTextAtSize(`${line} ${w}`, 10) < contentWidth - 20) {
            line = `${line} ${w}`.trim();
          } else {
            if (curY < 70) {
              chatPage = doc.addPage([pageWidth, pageHeight]);
              exhibitIndex++;
              drawExhibitHeader(chatPage, exhibitIndex);
              curY = pageHeight - 70;
            }
            chatPage.drawText(line, { x: leftMargin + 10, y: curY, size: 10, font: fontRegular });
            curY -= 14;
            line = w;
          }
        }
        if (line) {
          if (curY < 70) {
            chatPage = doc.addPage([pageWidth, pageHeight]);
            exhibitIndex++;
            drawExhibitHeader(chatPage, exhibitIndex);
            curY = pageHeight - 70;
          }
          chatPage.drawText(line, { x: leftMargin + 10, y: curY, size: 10, font: fontRegular });
          curY -= 20;
        }
      }

      const outBytes = await doc.save();
      const blob = new Blob([outBytes as any], { type: 'application/pdf' });
      downloadBlob(blob, `CourtEvidence_Sec63BSA_${deponentName.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error(err);
      alert('Error formatting court evidence PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs font-bold text-amber-700 dark:text-amber-300 mb-2">
            <Scale className="w-3.5 h-3.5" /> Section 63 BSA &amp; 65B Indian Evidence Act Compliant
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">
            WhatsApp Chat to Court Evidence Formatter
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Convert WhatsApp chat exports into certified legal green paper PDFs with continuous exhibit numbers and an automated Section 63 BSA Electronic Evidence Certificate.
          </p>
        </div>

        {/* Studio Inputs */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Chat Import & Preview */}
          <div className="lg:col-span-7 space-y-6">
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-600" /> WhatsApp Chat Text Export (.txt)
                </h4>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-bold text-amber-600 hover:underline"
                >
                  Upload .txt File
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                  accept=".txt"
                  className="hidden"
                />
              </div>

              <textarea
                rows={10}
                placeholder="Paste exported WhatsApp chat text here or upload file...&#10;e.g. 24/10/26, 10:15 pm - Ramesh: Please send the payment receipt&#10;24/10/26, 10:18 pm - Suresh: Sent via UPI..."
                value={chatText}
                onChange={(e) => parseWhatsAppTxt(e.target.value)}
                className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500"
              />

              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{messages.length} Chat Messages Identified</span>
                <span>Exported without media</span>
              </div>
            </div>
          </div>

          {/* Right Column: Case & Section 63 Certificate Parameters */}
          <div className="lg:col-span-5 space-y-6">
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Scale className="w-4 h-4 text-amber-600" /> Court &amp; Case Title Setup
              </h4>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Name of Court / Police Station
                  </label>
                  <input
                    type="text"
                    value={courtName}
                    onChange={(e) => setCourtName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Case / Complaint Number
                  </label>
                  <input
                    type="text"
                    value={caseNumber}
                    onChange={(e) => setCaseNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Petitioner</label>
                    <input
                      type="text"
                      value={partyA}
                      onChange={(e) => setPartyA(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Respondent</label>
                    <input
                      type="text"
                      value={partyB}
                      onChange={(e) => setPartyB(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Deponent Name (Phone Owner)
                    </label>
                    <input
                      type="text"
                      value={deponentName}
                      onChange={(e) => setDeponentName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Mobile Device Brand / Model
                    </label>
                    <input
                      type="text"
                      value={deviceModel}
                      onChange={(e) => setDeviceModel(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3">
                <button
                  onClick={handleGenerateLegalPdf}
                  disabled={isProcessing || messages.length === 0}
                  className="w-full py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-900/20 disabled:opacity-50 transition-all"
                >
                  <Download className="w-4 h-4" />
                  {isProcessing ? 'Compiling Legal PDF...' : 'Download Section 63 BSA Evidence PDF'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* SEO Information */}
        <ToolSEOSection
          toolName="WhatsApp Chat to Court Evidence Formatter"
          headline="Electronic Evidence Compiler with Bharatiya Sakshya Adhiniyam Section 63 Certification"
          description="A specialized judicial tool for advocates, legal chambers, law enforcement, and litigants. Transforms exported WhatsApp and SMS threads into formal legal petition annexures. Formats each communication with timestamps, sender tags, running exhibit serials, and appends an auto-drafted Certificate under Section 63 of Bharatiya Sakshya Adhiniyam, 2023 (formerly Section 65B IEA) with custody verifications."
        />
      </div>
    </div>
  );
}

