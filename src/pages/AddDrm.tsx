import React, { useState } from 'react';
import { 
  ShieldCheck, Lock, EyeOff, Printer, Copy, FileText, Download, 
  UserCheck, AlertTriangle, CheckCircle2, RefreshCw, KeyRound, Sparkles, ArrowRight
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib-plus-encrypt';
import { rgb, StandardFonts } from 'pdf-lib';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

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
  const [requireOpenPassword, setRequireOpenPassword] = useState(false);
  const [openPassword, setOpenPassword] = useState('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFileName, setResultFileName] = useState('');

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

      const finalBytes = await pdfDoc.save();
      const blob = new Blob([finalBytes as any], { type: 'application/pdf' });
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

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-4 sm:p-8 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm border border-red-100 dark:border-red-900/50">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-2">
          PDF DRM & Access Rights Management
        </h1>
        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          Restrict copying, block unauthorized printing, and embed dynamic recipient forensic watermarks to prevent leaks.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl space-y-6">
          <FileDropzone 
            onDrop={handleDrop} 
            multiple={false} 
            title="Select PDF Document to Apply DRM Protection" 
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Copy className="w-6 h-6 text-red-600 dark:text-red-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Copy Lock</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Disables clipboard text copying and content extraction.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Printer className="w-6 h-6 text-amber-600 dark:text-amber-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Print Restriction</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Stops hardcopy printing and virtual PDF exporting.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <UserCheck className="w-6 h-6 text-purple-600 dark:text-purple-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Forensic Tracking</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Burns recipient identification watermarks on all pages.</p>
            </div>
          </div>
        </div>
      ) : !resultUrl ? (
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          {/* File Card */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="w-8 h-8 text-red-600 shrink-0" />
              <div className="min-w-0">
                <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{file.name}</p>
                <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB • Ready for DRM lockdown</p>
              </div>
            </div>
            <button onClick={reset} className="text-xs text-slate-500 hover:text-slate-800 underline">Change</button>
          </div>

          {/* Granular Permissions */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Granular Security Restrictions</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                <input 
                  type="checkbox"
                  checked={!allowCopying}
                  onChange={e => setAllowCopying(!e.target.checked)}
                  className="rounded text-red-600 focus:ring-red-500 w-4 h-4"
                />
                <div>
                  <span className="font-bold text-xs text-slate-900 dark:text-white block">Disable Text Copying</span>
                  <span className="text-[11px] text-slate-500">Block clipboard extraction</span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                <input 
                  type="checkbox"
                  checked={!allowPrinting}
                  onChange={e => setAllowPrinting(!e.target.checked)}
                  className="rounded text-red-600 focus:ring-red-500 w-4 h-4"
                />
                <div>
                  <span className="font-bold text-xs text-slate-900 dark:text-white block">Disable Printing</span>
                  <span className="text-[11px] text-slate-500">Block physical printouts</span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                <input 
                  type="checkbox"
                  checked={!allowModifying}
                  onChange={e => setAllowModifying(!e.target.checked)}
                  className="rounded text-red-600 focus:ring-red-500 w-4 h-4"
                />
                <div>
                  <span className="font-bold text-xs text-slate-900 dark:text-white block">Disable Document Editing</span>
                  <span className="text-[11px] text-slate-500">Block content modifications</span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                <input 
                  type="checkbox"
                  checked={enableForensicWatermark}
                  onChange={e => setEnableForensicWatermark(e.target.checked)}
                  className="rounded text-red-600 focus:ring-red-500 w-4 h-4"
                />
                <div>
                  <span className="font-bold text-xs text-slate-900 dark:text-white block">Forensic Recipient Watermark</span>
                  <span className="text-[11px] text-slate-500">Stamp recipient ID on pages</span>
                </div>
              </label>
            </div>
          </div>

          {/* Forensic Recipient Information */}
          {enableForensicWatermark && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Recipient Tracking Details</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Authorized Recipient Email</label>
                  <input
                    type="text"
                    value={recipientEmail}
                    onChange={e => setRecipientEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Recipient Name / EMP ID</label>
                  <input
                    type="text"
                    value={recipientName}
                    onChange={e => setRecipientName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Owner Master Key */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Master Owner Key (To Override Restrictions)</label>
            <input 
              type="text" 
              value={ownerPassword} 
              onChange={e => setOwnerPassword(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono outline-none"
            />
            <p className="text-[10px] text-slate-500 mt-1">Save this key. Only entering this master key will unlock full permissions in Adobe Acrobat.</p>
          </div>

          {/* Action Button */}
          <button
            onClick={applyDrmProtection}
            disabled={isProcessing}
            className="w-full py-4 px-6 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-bold rounded-2xl shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 text-base transition-all disabled:opacity-50"
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
          </button>
        </div>
      ) : (
        /* Result Screen */
        <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-xl text-center space-y-6">
          <div className="w-20 h-20 bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div>
            <span className="inline-block px-3 py-1 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
              DRM Lockdown Active
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              DRM Protection Successfully Applied!
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
              Document is encrypted with AES permissions. Copying and printing are restricted, and recipient forensic tracking is embedded.
            </p>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 text-left text-xs space-y-1.5">
            <p className="font-bold text-slate-900 dark:text-white mb-2">Active DRM Summary:</p>
            <p>• Printing: <span className="font-semibold text-red-600">{allowPrinting ? 'Permitted' : 'Blocked'}</span></p>
            <p>• Text Copying: <span className="font-semibold text-red-600">{allowCopying ? 'Permitted' : 'Blocked'}</span></p>
            <p>• Forensic Recipient: <span className="font-semibold text-slate-700 dark:text-slate-300">{recipientEmail}</span></p>
            <p>• Master Owner Key: <span className="font-mono text-emerald-600">{ownerPassword}</span></p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <a
              href={resultUrl}
              download={resultFileName}
              className="flex-1 py-4 px-6 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 text-base transition-all"
            >
              <Download className="w-5 h-5" />
              Download DRM Protected PDF
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
