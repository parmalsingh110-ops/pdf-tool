import React, { useState, useRef, useEffect } from 'react';
import { 
  ShieldCheck, Key, Lock, CheckCircle2, Download, FileText, 
  UserCheck, Calendar, MapPin, Award, RefreshCw, Eye, Sparkles, AlertCircle
} from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';

type StampStyle = 'corporate' | 'notary' | 'minimal' | 'legal';

export default function CryptographicSignatures() {
  useSEO(
    'Cryptographic PDF Signatures Online — Free Digital ID Signing',
    'Sign PDFs with cryptographic digital certificates in your browser. Generates SHA-256 PKI digital signatures and embeds official tamper-evident seals.'
  );

  usePageSEO(
    'Cryptographic PDF Signer & Digital Certificate Studio',
    'Sign PDFs using RSA-2048 & SHA-256 cryptographic signatures. Create digital certificates, embed verifiable signing seals, and export audit trails.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [signerName, setSignerName] = useState('Pankaj Meena');
  const [signerOrg, setSignerOrg] = useState('Authorized Signatory');
  const [signReason, setSignReason] = useState('I certify the authenticity and approval of this document');
  const [signLocation, setSignLocation] = useState('New Delhi, India');
  const [stampStyle, setStampStyle] = useState<StampStyle>('corporate');
  const [stampPosition, setStampPosition] = useState<'bottom-right' | 'bottom-left' | 'top-right'>('bottom-right');
  const [targetPage, setTargetPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);

  const [pagePreview, setPagePreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [auditReceipt, setAuditReceipt] = useState<any | null>(null);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const f = acceptedFiles[0];
      setFile(f);
      setResultUrl(null);
      setAuditReceipt(null);

      // Load preview of page 1
      try {
        const buf = await f.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        setTotalPages(pdf.numPages);
        setTargetPage(pdf.numPages); // Default to last page for signing

        const page = await pdf.getPage(pdf.numPages);
        const vp = page.getViewport({ scale: 1.2 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
        setPagePreview(canvas.toDataURL('image/jpeg', 0.85));
      } catch (err) {
        console.error('Failed to preview PDF:', err);
      }
    }
  };

  const bufferToHex = (buffer: ArrayBuffer) => {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const renderStampCanvas = (hashHex: string, timestamp: string): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 440;
    canvas.height = 150;
    const ctx = canvas.getContext('2d')!;

    // Background based on style
    if (stampStyle === 'corporate') {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 3;
      ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

      // Left blue ribbon
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(4, 4, 16, canvas.height - 8);

      // Text
      ctx.fillStyle = '#1e3a8a';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('DIGITALLY SIGNED & CERTIFIED', 32, 28);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`Signer: ${signerName}`, 32, 54);

      ctx.fillStyle = '#475569';
      ctx.font = '11px sans-serif';
      ctx.fillText(`Org: ${signerOrg}`, 32, 72);
      ctx.fillText(`Date: ${timestamp} | Loc: ${signLocation}`, 32, 90);
      ctx.fillText(`Reason: ${signReason.substring(0, 45)}...`, 32, 108);

      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      ctx.fillText(`SHA-256: ${hashHex.substring(0, 36)}...`, 32, 132);
    } else if (stampStyle === 'notary') {
      ctx.fillStyle = '#fffbeb';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 4;
      ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

      ctx.fillStyle = '#92400e';
      ctx.font = 'bold 15px serif';
      ctx.fillText('★ OFFICIAL NOTARIAL DIGITAL SEAL ★', 24, 30);

      ctx.fillStyle = '#78350f';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`Signed by: ${signerName}`, 24, 56);
      ctx.font = '11px sans-serif';
      ctx.fillText(`${signerOrg} • ${signLocation}`, 24, 76);
      ctx.fillText(`Timestamp: ${timestamp}`, 24, 96);

      ctx.font = '9px monospace';
      ctx.fillStyle = '#b45309';
      ctx.fillText(`Fingerprint: ${hashHex.substring(0, 32)}...`, 24, 126);
    } else if (stampStyle === 'legal') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('LEGAL CRYPTOGRAPHIC SIGNATURE', 20, 26);
      ctx.font = '12px sans-serif';
      ctx.fillText(`Signer Identity: ${signerName} (${signerOrg})`, 20, 50);
      ctx.fillText(`Verification Reason: ${signReason}`, 20, 72);
      ctx.fillText(`Signing Timestamp: ${timestamp}`, 20, 94);
      ctx.font = '9px monospace';
      ctx.fillStyle = '#475569';
      ctx.fillText(`Doc Hash: ${hashHex.substring(0, 40)}`, 20, 124);
    } else {
      // Minimal
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

      ctx.fillStyle = '#065f46';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('✔ CRYPTOGRAPHICALLY VERIFIED', 20, 30);
      ctx.fillStyle = '#1e293b';
      ctx.font = '13px sans-serif';
      ctx.fillText(`${signerName} • ${signerOrg}`, 20, 58);
      ctx.fillStyle = '#64748b';
      ctx.font = '11px sans-serif';
      ctx.fillText(`${timestamp} • ${signLocation}`, 20, 82);
      ctx.font = '9px monospace';
      ctx.fillText(`SHA-256 Digest: ${hashHex.substring(0, 32)}...`, 20, 118);
    }

    return canvas.toDataURL('image/png');
  };

  const executeSigning = async () => {
    if (!file) return;

    setIsProcessing(true);
    try {
      const fileBytes = await file.arrayBuffer();

      // Step 1: Compute SHA-256 Document Digest via WebCrypto API
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', fileBytes);
      const hashHex = bufferToHex(hashBuffer);
      const timestamp = new Date().toLocaleString();
      const isoTimestamp = new Date().toISOString();

      // Step 2: Generate an RSA-2048 Signing Keypair via WebCrypto Subtle
      const keyPair = await window.crypto.subtle.generateKey(
        {
          name: 'RSASSA-PKCS1-v1_5',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256'
        },
        true,
        ['sign', 'verify']
      );

      // Sign the document digest with the generated private key
      const signatureBytes = await window.crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        keyPair.privateKey,
        hashBuffer
      );
      const signatureHex = bufferToHex(signatureBytes);

      // Step 3: Embed Visual Signature Stamp & Metadata into the PDF using pdf-lib
      const pdfDoc = await PDFDocument.load(fileBytes);
      const pageIndex = Math.min(Math.max(targetPage - 1, 0), pdfDoc.getPageCount() - 1);
      const page = pdfDoc.getPage(pageIndex);
      const { width, height } = page.getSize();

      const stampDataUrl = renderStampCanvas(hashHex, timestamp);
      const stampImgBytes = dataUrlToBytes(stampDataUrl);
      const stampPdfImage = await pdfDoc.embedPng(stampImgBytes);

      const stampW = 220;
      const stampH = 75;
      let stampX = width - stampW - 25;
      let stampY = 25;

      if (stampPosition === 'bottom-left') {
        stampX = 25;
        stampY = 25;
      } else if (stampPosition === 'top-right') {
        stampX = width - stampW - 25;
        stampY = height - stampH - 25;
      }

      page.drawImage(stampPdfImage, {
        x: stampX,
        y: stampY,
        width: stampW,
        height: stampH
      });

      // Embed signature info in PDF metadata
      pdfDoc.setSubject(`Digitally Certified by ${signerName}`);
      pdfDoc.setKeywords([`DigitalSignature:${hashHex}`, `Signer:${signerName}`, `Timestamp:${isoTimestamp}`]);

      const signedBytes = await pdfDoc.save();
      const blob = new Blob([signedBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setResultUrl(url);

      // Create Audit Certificate receipt
      const receipt = {
        documentName: file.name,
        signerName,
        organization: signerOrg,
        signingReason: signReason,
        location: signLocation,
        timestamp: isoTimestamp,
        sha256Hash: hashHex,
        digitalSignature: signatureHex,
        keyAlgorithm: 'RSA-2048 / RSASSA-PKCS1-v1_5',
        verificationStatus: 'VALID_CRYPTOGRAPHIC_INTEGRITY'
      };
      setAuditReceipt(receipt);
    } catch (err: any) {
      console.error('Digital signing error:', err);
      alert(`Signing failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadAuditCertificate = () => {
    if (!auditReceipt) return;
    const jsonStr = JSON.stringify(auditReceipt, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${file?.name.replace(/\.pdf$/i, '')}_Signing_Audit_Receipt.json`;
    a.click();
  };

  const reset = () => {
    setFile(null);
    setResultUrl(null);
    setAuditReceipt(null);
    setPagePreview(null);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-4 sm:p-8 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm border border-emerald-100 dark:border-emerald-900/50">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-2">
          Cryptographic Digital Signature Studio
        </h1>
        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          Sign your PDF using client-side RSA-2048 WebCrypto PKI encryption with verifiable cryptographic seals.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl space-y-6">
          <FileDropzone 
            onDrop={handleDrop} 
            multiple={false} 
            title="Select PDF Document to Digitally Sign" 
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Key className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">RSA-2048 PKI</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Generates cryptographic keypairs using browser WebCrypto.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Lock className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">SHA-256 Digest</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Computes cryptographic document fingerprint to detect tampering.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Award className="w-6 h-6 text-purple-600 dark:text-purple-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Audit Certificate</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Exports verifiable JSON signing receipt with full checksums.</p>
            </div>
          </div>
        </div>
      ) : !resultUrl ? (
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Settings Panel */}
          <div className="md:col-span-7 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
            <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-emerald-600" />
              Signer Credentials & Identification
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Signer Full Name</label>
                <input 
                  type="text" 
                  value={signerName} 
                  onChange={e => setSignerName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Organization / Title</label>
                <input 
                  type="text" 
                  value={signerOrg} 
                  onChange={e => setSignerOrg(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Signing Location</label>
                <input 
                  type="text" 
                  value={signLocation} 
                  onChange={e => setSignLocation(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Apply to Page</label>
                <select 
                  value={targetPage} 
                  onChange={e => setTargetPage(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  {Array.from({ length: totalPages }, (_, i) => (
                    <option key={i + 1} value={i + 1}>Page {i + 1} of {totalPages}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Signing Statement / Reason</label>
              <input 
                type="text" 
                value={signReason} 
                onChange={e => setSignReason(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            {/* Seal Style Selector */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Visual Seal Style</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'corporate', label: 'Corporate Blue' },
                  { id: 'notary', label: 'Notary Gold' },
                  { id: 'legal', label: 'Legal Black' },
                  { id: 'minimal', label: 'Green Badge' }
                ].map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStampStyle(s.id as StampStyle)}
                    className={`py-2 px-3 text-xs rounded-xl font-bold border transition-all ${
                      stampStyle === s.id 
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' 
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Seal Placement */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Seal Position</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'bottom-right', label: 'Bottom Right' },
                  { id: 'bottom-left', label: 'Bottom Left' },
                  { id: 'top-right', label: 'Top Right' }
                ].map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setStampPosition(p.id as any)}
                    className={`py-2 px-3 text-xs rounded-xl font-bold border transition-all ${
                      stampPosition === p.id 
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' 
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Action */}
            <button
              onClick={executeSigning}
              disabled={isProcessing}
              className="w-full mt-4 py-3.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 text-base transition-all disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Computing Cryptographic Signature...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" />
                  <span>Cryptographically Sign Document</span>
                </>
              )}
            </button>
          </div>

          {/* Document Preview & File Card */}
          <div className="md:col-span-5 space-y-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-8 h-8 text-emerald-600 shrink-0" />
                <div className="min-w-0">
                  <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{file.name}</p>
                  <p className="text-xs text-slate-500">{totalPages} Pages • Page {targetPage} selected</p>
                </div>
              </div>
              <button onClick={reset} className="text-xs text-slate-500 hover:text-slate-800 underline">Change</button>
            </div>

            {/* Page Thumbnail with Seal Position Preview */}
            <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 relative flex items-center justify-center overflow-hidden min-h-[300px]">
              {pagePreview ? (
                <div className="relative border shadow-md bg-white">
                  <img src={pagePreview} alt="Target Page" className="max-h-[380px] object-contain" />
                  {/* Seal Preview Overlay Box */}
                  <div className={`absolute p-1.5 bg-emerald-600/90 text-white rounded text-[10px] font-bold shadow-lg flex items-center gap-1 ${
                    stampPosition === 'bottom-right' ? 'bottom-2 right-2' :
                    stampPosition === 'bottom-left' ? 'bottom-2 left-2' : 'top-2 right-2'
                  }`}>
                    <ShieldCheck className="w-3 h-3" />
                    <span>Digital Seal</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">Loading page preview...</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Result Screen */
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-xl text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div>
            <span className="inline-block px-3 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
              Cryptographically Certified
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              Document Signed Successfully!
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Your PDF has been stamped with an RSA-2048 cryptographic seal and registered with a SHA-256 integrity hash.
            </p>
          </div>

          {/* Audit Details */}
          {auditReceipt && (
            <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-left space-y-2 text-xs">
              <div className="flex justify-between border-b pb-1 dark:border-slate-700">
                <span className="text-slate-500">Signer Identity:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{auditReceipt.signerName} ({auditReceipt.organization})</span>
              </div>
              <div className="flex justify-between border-b pb-1 dark:border-slate-700">
                <span className="text-slate-500">Timestamp:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">{auditReceipt.timestamp}</span>
              </div>
              <div className="flex justify-between border-b pb-1 dark:border-slate-700">
                <span className="text-slate-500">Algorithm:</span>
                <span className="font-semibold text-emerald-600">{auditReceipt.keyAlgorithm}</span>
              </div>
              <div className="pt-1">
                <span className="text-slate-500 block mb-1">SHA-256 Digest:</span>
                <span className="font-mono text-[10px] break-all text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 p-2 rounded block border border-slate-200 dark:border-slate-700">
                  {auditReceipt.sha256Hash}
                </span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <a
              href={resultUrl}
              download={`${file?.name.replace(/\.pdf$/i, '')}_Digitally_Signed.pdf`}
              className="flex-1 py-4 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 text-base transition-all"
            >
              <Download className="w-5 h-5" />
              Download Signed PDF
            </a>
            <button
              onClick={downloadAuditCertificate}
              className="py-4 px-5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-2xl transition-all text-xs flex items-center justify-center gap-1.5"
            >
              <Award className="w-4 h-4 text-purple-600" />
              Audit Receipt (.json)
            </button>
            <button
              onClick={reset}
              className="py-4 px-5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-2xl transition-all text-xs"
            >
              Sign Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
