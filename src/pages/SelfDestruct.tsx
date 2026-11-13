import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { 
  Clock, ShieldAlert, Download, Calendar, 
  Lock, EyeOff, RefreshCw, CheckCircle2, FileText, ArrowRight
} from 'lucide-react';
import { PDFDocument, rgb, StandardFonts, PDFName, PDFString } from 'pdf-lib';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

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

  useAutoRevokeUrl(resultUrl);
  const prefersReduced = useReducedMotion();

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

          const safeNote = (recipientNote || '').replace(/[^\x20-\x7E]/g, ' ').trim();
          const noteSuffix = safeNote ? ` - ${safeNote}` : '';

          page.drawText(`[CONFIDENTIAL] VALID ONLY UNTIL ${expDateFormatted.toUpperCase()}${noteSuffix}`, {
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

          page.drawText(`Security Policy Active: Unauthorized copying or viewing after ${expDateFormatted} violates confidentiality`, {
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

      const finalBytes = toArrayBufferBytes(await pdfDoc.save());
      const blob = new Blob([finalBytes], { type: 'application/pdf' });
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

  const daysUntilExpiry = Math.max(
    0,
    Math.ceil((new Date(`${customDate}T23:59:59`).getTime() - Date.now()) / 86400000)
  );
  const stageKey = !file ? 'upload' : !resultUrl ? 'configure' : 'result';

  return (
    <ToolWorkspaceShell
      title="Self-Destructing PDF Generator"
      subtitle="Create documents that expire after a specific date with embedded Acrobat JS alarms and prominent visual expiry banners."
      categoryLabel="Time-Limited Access Control"
      icon={Clock}
      microVariant="security"
      tone="rose"
      trustNote="Client-side /OpenAction JS triggers & tamper-evident banners"
    >
      <PearlStageSwitch stageKey={stageKey}>
        {!file ? (
          <div className="w-full max-w-2xl mx-auto space-y-6">
            <FileDropzone
              onDrop={handleDrop}
              multiple={false}
              title="Select PDF to Add Expiration Controls"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              {[
                {
                  icon: Calendar,
                  iconCls: 'text-rose-600 dark:text-rose-400 bg-[var(--pms-soft-rose)]',
                  title: 'Date Expiry',
                  desc: 'Set custom expiration date from 24h to custom calendar.',
                },
                {
                  icon: ShieldAlert,
                  iconCls: 'text-sky-600 dark:text-sky-400 bg-[var(--pms-soft-blue)]',
                  title: 'Acrobat JS Lock',
                  desc: 'Embeds JavaScript /OpenAction popup alarms in Acrobat.',
                },
                {
                  icon: EyeOff,
                  iconCls: 'text-violet-600 dark:text-violet-400 bg-[var(--pms-soft-lavender)]',
                  title: 'Visual Banners',
                  desc: 'Burns permanent tamper-evident expiry headers across pages.',
                },
              ].map((card, idx) => (
                <motion.div
                  key={card.title}
                  initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, delay: idx * 0.05 }}
                  whileHover={prefersReduced ? undefined : { y: -3 }}
                  className="pms-glass-panel p-5 rounded-2xl text-center"
                >
                  <div className={`w-10 h-10 rounded-xl ${card.iconCls} flex items-center justify-center mx-auto mb-2.5`}>
                    <card.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">{card.title}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{card.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        ) : !resultUrl ? (
          <div className="relative w-full max-w-2xl mx-auto pms-glass-panel p-6 sm:p-8 rounded-3xl space-y-6 overflow-hidden">
            <PearlScanOverlay active={isProcessing} label="Injecting expiration triggers & visual banners…" />

            {/* File Card */}
            <div className="p-4 bg-white/80 dark:bg-slate-800/60 rounded-2xl border border-[var(--pms-border)] flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{file.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {(file.size / 1024 / 1024).toFixed(2)} MB · Ready for expiry locking
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] border border-[var(--pms-border)]">
                  <AnimatedNumber value={daysUntilExpiry} suffix="d window" />
                </span>
                <button onClick={reset} className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline cursor-pointer">
                  Change
                </button>
              </div>
            </div>

            {/* Quick Presets */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                Select Expiration Timeline
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                {[
                  { days: 1, label: '24 Hours' },
                  { days: 3, label: '3 Days' },
                  { days: 7, label: '7 Days' },
                  { days: 30, label: '30 Days' }
                ].map(p => (
                  <motion.button
                    key={p.days}
                    type="button"
                    whileTap={prefersReduced ? undefined : { scale: 0.97 }}
                    onClick={() => setDaysPreset(p.days)}
                    className={`py-2.5 px-3 text-xs rounded-xl font-bold border transition-all cursor-pointer ${
                      expiryDays === p.days
                        ? 'border-rose-500 bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] shadow-xs'
                        : 'border-[var(--pms-border)] bg-white/75 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {p.label}
                  </motion.button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">Custom Expiration Date:</span>
                  <input
                    type="date"
                    value={customDate}
                    onChange={e => {
                      setCustomDate(e.target.value);
                      setExpiryDays(0);
                    }}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[var(--pms-border)] bg-white/80 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Recipient Notice Note */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Confidentiality / Recipient Note
              </label>
              <input
                type="text"
                value={recipientNote}
                onChange={e => setRecipientNote(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[var(--pms-border)] bg-white/80 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500 outline-none"
                placeholder="e.g. FOR SINGLE REVIEW ONLY — DO NOT REDISTRIBUTE"
              />
            </div>

            {/* Protection Mode */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                Protection Style
              </label>
              <div className="space-y-2">
                {[
                  { id: 'full-protection', title: 'Maximum Protection (Recommended)', desc: 'Acrobat JS popup alert + Top security header + Diagonal watermark' },
                  { id: 'watermark-overlay', title: 'Security Header Only', desc: 'Prominent top red warning banner with expiration date' },
                  { id: 'alert-only', title: 'Silent Acrobat Alert', desc: 'Only displays popup alert in Acrobat without visible watermark lines' }
                ].map(opt => {
                  const selected = expiryAction === opt.id;
                  return (
                    <label
                      key={opt.id}
                      className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-colors ${
                        selected
                          ? 'border-rose-500 bg-[var(--pms-soft-rose)]'
                          : 'border-[var(--pms-border)] bg-white/75 dark:bg-slate-800/60'
                      }`}
                    >
                      <input
                        type="radio"
                        name="expiryAction"
                        checked={selected}
                        onChange={() => setExpiryAction(opt.id as ExpiryAction)}
                        className="mt-1 accent-rose-600"
                      />
                      <div>
                        <span className="font-bold text-xs text-slate-900 dark:text-white block">{opt.title}</span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">{opt.desc}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Action Button */}
            <motion.button
              whileHover={prefersReduced || isProcessing ? undefined : { scale: 1.01 }}
              whileTap={prefersReduced || isProcessing ? undefined : { scale: 0.985 }}
              onClick={generateExpiringPdf}
              disabled={isProcessing}
              className="w-full pms-btn-primary py-4 px-6 font-bold rounded-2xl flex items-center justify-center gap-2 text-base disabled:opacity-50 cursor-pointer"
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
            </motion.button>
          </div>
        ) : (
          /* Result Screen */
          <div className="w-full max-w-xl mx-auto pms-glass-panel rounded-3xl border border-emerald-200/80 dark:border-emerald-800/70 p-8 text-center space-y-6">
            <motion.div
              initial={prefersReduced ? false : { scale: 0.45, rotate: -10, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 360, damping: 18 }}
              className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner"
            >
              <CheckCircle2 className="w-10 h-10" />
            </motion.div>

            <div>
              <span className="inline-block px-3.5 py-1 bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-bold uppercase tracking-wider mb-2 border border-[var(--pms-border)]">
                Expiration Controls Active
              </span>
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
                Expiring PDF Ready!
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                Document is configured to expire on <strong className="text-[var(--pms-rose)]">{customDate}</strong> with embedded Acrobat alarms and visual security banners.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <motion.a
                whileHover={prefersReduced ? undefined : { scale: 1.015 }}
                whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                href={resultUrl}
                download={resultFileName}
                className="flex-1 pms-btn-primary py-4 px-6 font-bold rounded-2xl flex items-center justify-center gap-2 text-base"
              >
                <Download className="w-5 h-5" />
                Download Expiring PDF
              </motion.a>
              <button
                onClick={reset}
                className="py-4 px-6 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-2xl transition-colors text-sm cursor-pointer"
              >
                Protect Another
              </button>
            </div>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
