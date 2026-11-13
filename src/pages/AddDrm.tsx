import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { 
  ShieldCheck, Lock, Printer, Copy, FileText, Download, 
  UserCheck, CheckCircle2, RefreshCw, ArrowRight
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib-plus-encrypt';
import { rgb, StandardFonts } from 'pdf-lib';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

export default function AddDrm() {
  useSEO(
    'Add DRM Protection to PDF Online Free — Document Rights Management',
    'Protect PDFs with enterprise DRM security. Block copying, restrict printing, prevent text extraction, and burn forensic recipient tracking watermarks.'
  );

  usePageSEO(
    'PDF DRM & Document Access Rights Studio',
    'Apply granular DRM restrictions to your PDF. Disable printing, block clipboard copying, add recipient watermarks, and encrypt with AES permissions.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [recipientEmail, setRecipientEmail] = useState('confidential@organization.com');
  const [recipientName, setRecipientName] = useState('Authorized Recipient');
  const [allowPrinting, setAllowPrinting] = useState(false);
  const [allowCopying, setAllowCopying] = useState(false);
  const [allowModifying, setAllowModifying] = useState(false);
  const [enableForensicWatermark, setEnableForensicWatermark] = useState(true);
  const [ownerPassword, setOwnerPassword] = useState('DRM_Master_Key_' + Math.floor(1000 + Math.random() * 9000));
  const [requireOpenPassword] = useState(false);
  const [openPassword] = useState('');

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

  const applyDrmProtection = async () => {
    if (!file) return;

    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);

      // Step 1: Burn Forensic Recipient Watermark on each page if enabled
      if (enableForensicWatermark) {
        const helvetica = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const pages = pdfDoc.getPages();
        const watermarkText = `CONFIDENTIAL // LICENSED TO: ${recipientEmail.toUpperCase()} (${recipientName}) // DO NOT DISTRIBUTE`;

        for (const page of pages) {
          const { width, height } = page.getSize();

          // Top Header Forensic Banner
          page.drawRectangle({
            x: 0,
            y: height - 18,
            width: width,
            height: 18,
            color: rgb(0.12, 0.15, 0.2)
          });

          page.drawText(watermarkText.substring(0, 85), {
            x: 10,
            y: height - 13,
            size: 7,
            font: helvetica,
            color: rgb(0.9, 0.9, 0.9)
          });

          // Diagonal subtle background watermark
          page.drawText(`LICENSED TO: ${recipientEmail}`, {
            x: width * 0.15,
            y: height * 0.45,
            size: 26,
            font: helvetica,
            color: rgb(0.7, 0.75, 0.8),
            opacity: 0.14,
            rotate: { type: 'degrees', angle: 35 } as any
          });
        }
      }

      // Step 2: Encrypt with Granular DRM Permissions using pdf-lib-plus-encrypt
      const finalUserPassword = requireOpenPassword && openPassword.trim() ? openPassword.trim() : '';

      await pdfDoc.encrypt({
        userPassword: finalUserPassword,
        ownerPassword: ownerPassword,
        permissions: {
          printing: allowPrinting ? 'highResolution' : false,
          copying: allowCopying,
          modifying: allowModifying,
          annotating: false,
          fillingForms: false,
          contentAccessibility: false,
          documentAssembly: false
        }
      });

      const finalBytes = toArrayBufferBytes(await pdfDoc.save());
      const blob = new Blob([finalBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultFileName(`${file.name.replace(/\.pdf$/i, '')}_DRM_Protected.pdf`);
    } catch (err: any) {
      console.error('DRM protection error:', err);
      alert(`Failed to apply DRM protection: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResultUrl(null);
  };

  const activeLocksCount = [!allowCopying, !allowPrinting, !allowModifying, enableForensicWatermark].filter(Boolean).length;
  const stageKey = !file ? 'upload' : !resultUrl ? 'configure' : 'result';

  return (
    <ToolWorkspaceShell
      title="PDF DRM & Access Rights Management"
      subtitle="Restrict copying, block unauthorized printing, and embed dynamic recipient forensic watermarks to prevent leaks."
      categoryLabel="Enterprise DRM Lockdown"
      icon={ShieldCheck}
      microVariant="security"
      tone="rose"
      trustNote="100% browser-side AES permissions & forensic watermarking"
    >
      <PearlStageSwitch stageKey={stageKey}>
        {!file ? (
          <div className="w-full max-w-2xl mx-auto space-y-6">
            <FileDropzone
              onDrop={handleDrop}
              multiple={false}
              title="Select PDF Document to Apply DRM Protection"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              {[
                {
                  icon: Copy,
                  iconCls: 'text-rose-600 dark:text-rose-400 bg-[var(--pms-soft-rose)]',
                  title: 'Copy Lock',
                  desc: 'Disables clipboard text copying and content extraction.',
                },
                {
                  icon: Printer,
                  iconCls: 'text-sky-600 dark:text-sky-400 bg-[var(--pms-soft-blue)]',
                  title: 'Print Restriction',
                  desc: 'Stops hardcopy printing and virtual PDF exporting.',
                },
                {
                  icon: UserCheck,
                  iconCls: 'text-violet-600 dark:text-violet-400 bg-[var(--pms-soft-lavender)]',
                  title: 'Forensic Tracking',
                  desc: 'Burns recipient identification watermarks on all pages.',
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
            <PearlScanOverlay active={isProcessing} label="Applying AES DRM permissions & forensic watermark…" />

            {/* File Card */}
            <div className="p-4 bg-white/80 dark:bg-slate-800/60 rounded-2xl border border-[var(--pms-border)] flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{file.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {(file.size / 1024 / 1024).toFixed(2)} MB · Ready for DRM lockdown
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] border border-[var(--pms-border)]">
                  <AnimatedNumber value={activeLocksCount} suffix="/4 Locks" />
                </span>
                <button onClick={reset} className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline cursor-pointer">
                  Change
                </button>
              </div>
            </div>

            {/* Granular Permissions */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2.5">
                Granular Security Restrictions
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-colors ${!allowCopying ? 'border-rose-400/70 bg-[var(--pms-soft-rose)]' : 'border-[var(--pms-border)] bg-white/70 dark:bg-slate-800/50'}`}>
                  <input
                    type="checkbox"
                    checked={!allowCopying}
                    onChange={e => setAllowCopying(!e.target.checked)}
                    className="rounded accent-rose-600 w-4 h-4"
                  />
                  <div>
                    <span className="font-bold text-xs text-slate-900 dark:text-white block">Disable Text Copying</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Block clipboard extraction</span>
                  </div>
                </label>

                <label className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-colors ${!allowPrinting ? 'border-rose-400/70 bg-[var(--pms-soft-rose)]' : 'border-[var(--pms-border)] bg-white/70 dark:bg-slate-800/50'}`}>
                  <input
                    type="checkbox"
                    checked={!allowPrinting}
                    onChange={e => setAllowPrinting(!e.target.checked)}
                    className="rounded accent-rose-600 w-4 h-4"
                  />
                  <div>
                    <span className="font-bold text-xs text-slate-900 dark:text-white block">Disable Printing</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Block physical printouts</span>
                  </div>
                </label>

                <label className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-colors ${!allowModifying ? 'border-rose-400/70 bg-[var(--pms-soft-rose)]' : 'border-[var(--pms-border)] bg-white/70 dark:bg-slate-800/50'}`}>
                  <input
                    type="checkbox"
                    checked={!allowModifying}
                    onChange={e => setAllowModifying(!e.target.checked)}
                    className="rounded accent-rose-600 w-4 h-4"
                  />
                  <div>
                    <span className="font-bold text-xs text-slate-900 dark:text-white block">Disable Document Editing</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Block content modifications</span>
                  </div>
                </label>

                <label className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-colors ${enableForensicWatermark ? 'border-rose-400/70 bg-[var(--pms-soft-rose)]' : 'border-[var(--pms-border)] bg-white/70 dark:bg-slate-800/50'}`}>
                  <input
                    type="checkbox"
                    checked={enableForensicWatermark}
                    onChange={e => setEnableForensicWatermark(e.target.checked)}
                    className="rounded accent-rose-600 w-4 h-4"
                  />
                  <div>
                    <span className="font-bold text-xs text-slate-900 dark:text-white block">Forensic Recipient Watermark</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Stamp recipient ID on pages</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Forensic Recipient Information */}
            <AnimatePresence>
              {enableForensicWatermark && (
                <motion.div
                  initial={prefersReduced ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={prefersReduced ? undefined : { opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-4 bg-white/75 dark:bg-slate-800/50 rounded-2xl border border-[var(--pms-border)] space-y-3">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Recipient Tracking Details</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Authorized Recipient Email</label>
                        <input
                          type="text"
                          value={recipientEmail}
                          onChange={e => setRecipientEmail(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--pms-border)] bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Recipient Name / EMP ID</label>
                        <input
                          type="text"
                          value={recipientName}
                          onChange={e => setRecipientName(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--pms-border)] bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500"
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Owner Master Key */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Master Owner Key (To Override Restrictions)
              </label>
              <input
                type="text"
                value={ownerPassword}
                onChange={e => setOwnerPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[var(--pms-border)] bg-white/80 dark:bg-slate-800 text-slate-900 dark:text-white font-mono outline-none focus:ring-2 focus:ring-rose-500"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Save this key. Only entering this master key will unlock full permissions in Adobe Acrobat.
              </p>
            </div>

            {/* Action Button */}
            <motion.button
              whileHover={prefersReduced || isProcessing ? undefined : { scale: 1.01 }}
              whileTap={prefersReduced || isProcessing ? undefined : { scale: 0.985 }}
              onClick={applyDrmProtection}
              disabled={isProcessing}
              className="w-full pms-btn-primary py-4 px-6 font-bold rounded-2xl flex items-center justify-center gap-2 text-base disabled:opacity-50 cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Applying DRM Restrictions & Encryption...</span>
                </>
              ) : (
                <>
                  <Lock className="w-5 h-5" />
                  <span>Enforce DRM Restrictions</span>
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
                DRM Lockdown Active
              </span>
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
                DRM Protection Successfully Applied!
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                Document is encrypted with AES permissions. Copying and printing are restricted, and recipient forensic tracking is embedded.
              </p>
            </div>

            <div className="p-4 bg-white/80 dark:bg-slate-800/60 rounded-2xl border border-[var(--pms-border)] text-left text-xs space-y-1.5">
              <p className="font-bold text-slate-900 dark:text-white mb-2">Active DRM Summary:</p>
              <p>• Printing: <span className="font-semibold text-rose-600 dark:text-rose-400">{allowPrinting ? 'Permitted' : 'Blocked'}</span></p>
              <p>• Text Copying: <span className="font-semibold text-rose-600 dark:text-rose-400">{allowCopying ? 'Permitted' : 'Blocked'}</span></p>
              <p>• Forensic Recipient: <span className="font-semibold text-slate-700 dark:text-slate-300">{recipientEmail}</span></p>
              <p>• Master Owner Key: <span className="font-mono text-emerald-600 dark:text-emerald-400">{ownerPassword}</span></p>
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
                Download DRM Protected PDF
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
