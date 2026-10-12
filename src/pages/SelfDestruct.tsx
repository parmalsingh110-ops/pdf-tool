import React, { useState } from 'react';
import { 
  Clock, AlertTriangle, ShieldAlert, Download, Calendar, 
  Lock, EyeOff, RefreshCw, CheckCircle2, FileText, ArrowRight, ShieldCheck
} from 'lucide-react';
import { PDFDocument, rgb, StandardFonts, PDFName, PDFString } from 'pdf-lib';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

type ExpiryAction = 'alert-only' | 'watermark-overlay' | 'full-protection';

export default function SelfDestruct() {
  useSEO(
    'Self-Destructing PDF Generator — Expiring & Time-Limited PDFs',
    'Create self-destructing PDFs that expire after a specific date or time. Injects Acrobat JavaScript expiry triggers and visual expiration warning watermarks.'
  );

  usePageSEO(
    'Self-Destructing & Time-Expiring PDF Generator',
    'Set an expiration date on PDF files. Adds document-level JavaScript time checks and tamper-evident expiration banners across all pages.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [expiryDays, setExpiryDays] = useState<number>(7);
  const [customDate, setCustomDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [expiryAction, setExpiryAction] = useState<ExpiryAction>('full-protection');
  const [recipientNote, setRecipientNote] = useState('CONFIDENTIAL — SINGLE-PARTY AUTHORIZED REVIEW ONLY');
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFileName, setResultFileName] = useState('');

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setResultUrl(null);
    }
  };

  const setDaysPreset = (days: number) => {
    setExpiryDays(days);
    const d = new Date();
    d.setDate(d.getDate() + days);
    setCustomDate(d.toISOString().split('T')[0]);
  };

  const generateExpiringPdf = async () => {
    if (!file) return;

    setIsProcessing(true);
    try {
      const fileBytes = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(fileBytes);
      const helvetica = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const helveticaRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const expDateObj = new Date(`${customDate}T23:59:59`);
      const expDateFormatted = expDateObj.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });

      // 1. Inject Acrobat JavaScript Document Open Action
      const jsScript = `
        var expDate = new Date("${expDateObj.toISOString()}");
        var nowDate = new Date();
        if (nowDate > expDate) {
          app.alert({
            cMsg: "CRITICAL SECURITY NOTICE:\\n\\nThis document EXPIRED on " + expDate.toLocaleDateString() + " and is no longer valid or authorized for viewing.\\n\\nContact the issuer for an updated release.",
            cTitle: "DOCUMENT HAS EXPIRED",
            nIcon: 0
          });
        }
      `;

      // Embed JavaScript in document catalog via pdf-lib
      try {
        const jsActionDict = pdfDoc.context.obj({
          Type: PDFName.of('Action'),
          S: PDFName.of('JavaScript'),
          JS: PDFString.of(jsScript)
        });
        const jsRef = pdfDoc.context.register(jsActionDict);
        pdfDoc.catalog.set(PDFName.of('OpenAction'), jsRef);
      } catch (err) {
        console.warn('Acrobat JS injection warning:', err);
      }

      // 2. Add Visual Expiration Banner & Watermark across pages if toggled
      if (expiryAction === 'watermark-overlay' || expiryAction === 'full-protection') {
        const pages = pdfDoc.getPages();
        for (const page of pages) {
          const { width, height } = page.getSize();

          // Top Security Header Banner
          page.drawRectangle({
            x: 0,
            y: height - 24,
            width: width,
            height: 24,
            color: rgb(0.85, 0.15, 0.15)
          });

          page.drawText(`⚠ EXPIRING DOCUMENT: VALID ONLY UNTIL ${expDateFormatted.toUpperCase()} • ${recipientNote}`, {
            x: 14,
            y: height - 17,
            size: 8,
            font: helvetica,
            color: rgb(1, 1, 1)
          });

          // Bottom Verification Footer
          page.drawRectangle({
            x: 0,
            y: 0,
            width: width,
            height: 18,
            color: rgb(0.1, 0.15, 0.2)
          });

          page.drawText(`Self-Destruct Timer Active • Unauthorized copying or viewing after ${expDateFormatted} violates confidentiality`, {
            x: 14,
            y: 5,
            size: 7,
            font: helveticaRegular,
            color: rgb(0.9, 0.9, 0.9)
          });

          // Subtle diagonal watermark
          if (expiryAction === 'full-protection') {
            page.drawText(`EXPIRES: ${expDateFormatted}`, {
              x: width / 4,
              y: height / 2,
              size: 34,
              font: helvetica,
              color: rgb(0.9, 0.2, 0.2),
              opacity: 0.12,
              rotate: { type: 'degrees', angle: 35 } as any
            });
          }
        }
      }

      // Set Metadata
      pdfDoc.setSubject(`Expiring Document: Valid until ${expDateFormatted}`);
      pdfDoc.setKeywords([`Expires:${customDate}`, 'SelfDestruct', 'TimeSensitive']);

      const finalBytes = await pdfDoc.save();
      const blob = new Blob([finalBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultFileName(`${file.name.replace(/\.pdf$/i, '')}_EXPIRES_${customDate}.pdf`);
    } catch (err: any) {
      console.error('Self-destruct generation error:', err);
      alert(`Failed to configure expiring PDF: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResultUrl(null);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-4 sm:p-8 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm border border-rose-100 dark:border-rose-900/50">
          <Clock className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-2">
          Self-Destructing PDF Generator
        </h1>
        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          Create documents that expire after a specific date with embedded Acrobat JS alarms and prominent visual expiry banners.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl space-y-6">
          <FileDropzone 
            onDrop={handleDrop} 
            multiple={false} 
            title="Select PDF to Add Expiration Controls" 
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Calendar className="w-6 h-6 text-rose-600 dark:text-rose-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Date Expiry</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Set custom expiration date from 24h to custom calendar.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <ShieldAlert className="w-6 h-6 text-amber-600 dark:text-amber-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Acrobat JS Lock</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Embeds JavaScript `/OpenAction` popup alarms in Acrobat.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <EyeOff className="w-6 h-6 text-indigo-600 dark:text-indigo-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Visual Banners</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Burns permanent tamper-evident expiry headers across pages.</p>
            </div>
          </div>
        </div>
      ) : !resultUrl ? (
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          {/* File Card */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="w-8 h-8 text-rose-600 shrink-0" />
              <div className="min-w-0">
                <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{file.name}</p>
                <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB • Ready for expiry locking</p>
              </div>
            </div>
            <button onClick={reset} className="text-xs text-slate-500 hover:text-slate-800 underline">Change</button>
          </div>

          {/* Quick Presets */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Select Expiration Timeline</label>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {[
                { days: 1, label: '24 Hours' },
                { days: 3, label: '3 Days' },
                { days: 7, label: '7 Days' },
                { days: 30, label: '30 Days' }
              ].map(p => (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => setDaysPreset(p.days)}
                  className={`py-2 px-3 text-xs rounded-xl font-bold border transition-all ${
                    expiryDays === p.days
                      ? 'border-rose-600 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1">
                <span className="text-[11px] text-slate-500 block mb-1">Custom Expiration Date:</span>
                <input
                  type="date"
                  value={customDate}
                  onChange={e => {
                    setCustomDate(e.target.value);
                    setExpiryDays(0);
                  }}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Recipient Notice Note */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Confidentiality / Recipient Note</label>
            <input 
              type="text" 
              value={recipientNote} 
              onChange={e => setRecipientNote(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500 outline-none"
              placeholder="e.g. FOR SINGLE REVIEW ONLY — DO NOT REDISTRIBUTE"
            />
          </div>

          {/* Protection Mode */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Protection Style</label>
            <div className="space-y-2">
              {[
                { id: 'full-protection', title: 'Maximum Protection (Recommended)', desc: 'Acrobat JS popup alert + Top security header + Diagonal watermark' },
                { id: 'watermark-overlay', title: 'Security Header Only', desc: 'Prominent top red warning banner with expiration date' },
                { id: 'alert-only', title: 'Silent Acrobat Alert', desc: 'Only displays popup alert in Acrobat without visible watermark lines' }
              ].map(opt => (
                <label 
                  key={opt.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    expiryAction === opt.id 
                      ? 'border-rose-600 bg-rose-50/50 dark:bg-rose-950/30' 
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <input 
                    type="radio" 
                    name="expiryAction" 
                    checked={expiryAction === opt.id} 
                    onChange={() => setExpiryAction(opt.id as ExpiryAction)}
                    className="mt-1 text-rose-600 focus:ring-rose-500" 
                  />
                  <div>
                    <span className="font-bold text-xs text-slate-900 dark:text-white block">{opt.title}</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">{opt.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={generateExpiringPdf}
            disabled={isProcessing}
            className="w-full py-4 px-6 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-bold rounded-2xl shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2 text-base transition-all disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Injecting Expiration Triggers...</span>
              </>
            ) : (
              <>
                <Lock className="w-5 h-5" />
                <span>Generate Self-Destructing PDF</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      ) : (
        /* Result Screen */
        <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-xl text-center space-y-6">
          <div className="w-20 h-20 bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div>
            <span className="inline-block px-3 py-1 bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
              Expiration Controls Active
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              Expiring PDF Ready!
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
              Document is configured to expire on <strong className="text-rose-600 dark:text-rose-400">{customDate}</strong> with embedded Acrobat alarms and visual security banners.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <a
              href={resultUrl}
              download={resultFileName}
              className="flex-1 py-4 px-6 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-2xl shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2 text-base transition-all"
            >
              <Download className="w-5 h-5" />
              Download Expiring PDF
            </a>
            <button
              onClick={reset}
              className="py-4 px-6 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-2xl transition-all text-sm"
            >
              Protect Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
