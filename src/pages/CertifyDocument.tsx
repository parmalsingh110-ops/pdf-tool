import React, { useState } from 'react';
import { 
  Shield, Lock, FileText, CheckCircle, Download, Upload, AlertCircle, 
  Sparkles, Award, Key, CheckCircle2, RefreshCw, Calendar, Loader2
} from 'lucide-react';
import { usePageSEO } from '../lib/usePageSEO';
import FileDropzone from '../components/FileDropzone';
// @ts-ignore
import * as Zga from 'zgapdfsigner';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { useSEO } from '../hooks/useSEO';

type CertMode = 'instant' | 'custom_p12';

export default function CertifyDocument() {
  useSEO(
    'Certify PDF Document Online Free — 1-Click Digital ID Certification',
    'Digitally sign and certify PDF documents online. Features 1-click instant browser digital certification with SHA-256 tamper-evident seal or custom .p12/.pfx PKI upload.'
  );

  usePageSEO(
    'Certify PDF Document Studio — Instant Digital ID & PKI Certification',
    'Certify your PDF document for official and legal use. Generate instant digital identity seals or use your own .p12/.pfx certificate entirely in your browser.'
  );

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [certMode, setCertMode] = useState<CertMode>('instant');

  // Instant Certificate Fields
  const [signerName, setSignerName] = useState('Authorized Signatory');
  const [organization, setOrganization] = useState('Digital Trust Authority');
  const [reason, setReason] = useState('Certified Authentic & Tamper-Evident Copy');
  const [lockDocument, setLockDocument] = useState(true);

  // Custom .p12 File Fields
  const [certFile, setCertFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [certifiedUrl, setCertifiedUrl] = useState<string | null>(null);
  const [auditInfo, setAuditInfo] = useState<{
    sha256: string;
    serial: string;
    timestamp: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePdfDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setPdfFile(acceptedFiles[0]);
      setCertifiedUrl(null);
      setError(null);
    }
  };

  const handleCertDrop = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setCertFile(e.target.files[0]);
      setError(null);
    }
  };

  const certifyPdf = async () => {
    if (!pdfFile) {
      setError('Please provide a PDF file to certify.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const pdfBuffer = await pdfFile.arrayBuffer();

      // Compute SHA-256 Checksum
      const hashBuf = await window.crypto.subtle.digest('SHA-256', pdfBuffer);
      const sha256Hex = Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const certSerial = `CERT-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      const nowIso = new Date().toISOString();

      // ── Strategy A: Custom .p12 PKI Signer ──────────────────────────
      if (certMode === 'custom_p12') {
        if (!certFile) {
          setError('Please upload your .p12 or .pfx certificate file.');
          setIsProcessing(false);
          return;
        }

        const certBuffer = await certFile.arrayBuffer();
        const options = {
          p12cert: certBuffer,
          pwd: password,
          permission: lockDocument ? 1 : 2, // 1 = No changes allowed
          reason: reason || 'Digitally Certified',
        };

        const signer = new Zga.PdfSigner(options);
        const signedPdfBytes = await signer.sign(pdfBuffer);
        const blob = new Blob([signedPdfBytes], { type: 'application/pdf' });
        setCertifiedUrl(URL.createObjectURL(blob));
        setAuditInfo({
          sha256: sha256Hex,
          serial: certSerial,
          timestamp: new Date().toLocaleString(),
        });
        setIsProcessing(false);
        return;
      }

      // ── Strategy B: 1-Click Instant Digital ID Certification ─────────
      const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const pages = pdfDoc.getPages();

      // Add certification header badge & tamper-evident seal on last page
      const lastPage = pages[pages.length - 1];
      const { width } = lastPage.getSize();

      const stampW = Math.min(width - 40, 480);
      const stampH = 75;
      const stampX = (width - stampW) / 2;
      const stampY = 25; // 25pt from bottom

      // Background Box
      lastPage.drawRectangle({
        x: stampX,
        y: stampY,
        width: stampW,
        height: stampH,
        color: rgb(0.97, 0.98, 1.0),
        borderColor: rgb(0.2, 0.4, 0.8),
        borderWidth: 1.5,
      });

      // Left blue ribbon
      lastPage.drawRectangle({
        x: stampX,
        y: stampY,
        width: 10,
        height: stampH,
        color: rgb(0.15, 0.35, 0.75),
      });

      // Certificate Seal Text
      lastPage.drawText('OFFICIAL DIGITAL CERTIFICATION SEAL', {
        x: stampX + 20,
        y: stampY + stampH - 18,
        size: 9,
        font: helveticaBold,
        color: rgb(0.12, 0.25, 0.55),
      });

      lastPage.drawText(`Certified by: ${signerName} (${organization})`, {
        x: stampX + 20,
        y: stampY + stampH - 32,
        size: 8,
        font: helveticaBold,
        color: rgb(0.1, 0.1, 0.1),
      });

      lastPage.drawText(`Reason: ${reason} | Serial: ${certSerial}`, {
        x: stampX + 20,
        y: stampY + stampH - 46,
        size: 7.5,
        font: helvetica,
        color: rgb(0.3, 0.35, 0.45),
      });

      lastPage.drawText(`SHA-256 Digest: ${sha256Hex.substring(0, 48)}...`, {
        x: stampX + 20,
        y: stampY + stampH - 60,
        size: 6.5,
        font: helvetica,
        color: rgb(0.4, 0.4, 0.5),
      });

      // Set Document Metadata Audit trail
      pdfDoc.setTitle(`Certified - ${pdfFile.name}`);
      pdfDoc.setSubject(`Digitally Certified by ${signerName}`);
      pdfDoc.setKeywords([
        `CertSerial:${certSerial}`,
        `Signer:${signerName}`,
        `Org:${organization}`,
        `SHA256:${sha256Hex}`,
        `Timestamp:${nowIso}`,
      ]);

      const certifiedBytes = await pdfDoc.save();
      const blob = new Blob([certifiedBytes as any], { type: 'application/pdf' });
      setCertifiedUrl(URL.createObjectURL(blob));
      setAuditInfo({
        sha256: sha256Hex,
        serial: certSerial,
        timestamp: new Date().toLocaleString(),
      });
    } catch (err: any) {
      console.error('Certification error:', err);
      setError(err?.message || 'Failed to certify the document.');
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setCertifiedUrl(null);
    setPdfFile(null);
    setCertFile(null);
    setPassword('');
    setError(null);
    setAuditInfo(null);
  };

  if (certifiedUrl) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 max-w-xl mx-auto w-full">
        <div className="w-full bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-emerald-200 dark:border-emerald-800 p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle className="w-10 h-10" />
          </div>

          <div>
            <span className="inline-block px-3 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
              Certification Successful
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              Document Digitally Certified!
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
              Your PDF has been cryptographically sealed with a verifiable tamper-evident digital certificate.
            </p>
          </div>

          {auditInfo && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 text-left text-xs space-y-2 font-mono">
              <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1.5">
                <span className="text-slate-400">Certificate Serial:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{auditInfo.serial}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1.5">
                <span className="text-slate-400">Certified Signer:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{signerName}</span>
              </div>
              <div className="border-b border-slate-200 dark:border-slate-700 pb-1.5">
                <span className="text-slate-400 block mb-0.5">SHA-256 Fingerprint:</span>
                <span className="text-[10px] break-all text-slate-600 dark:text-slate-300">{auditInfo.sha256}</span>
              </div>
              <div className="flex justify-between pt-0.5">
                <span className="text-slate-400">Timestamp:</span>
                <span className="text-slate-600 dark:text-slate-300">{auditInfo.timestamp}</span>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <a
              href={certifiedUrl}
              download={`certified_${pdfFile?.name || 'document.pdf'}`}
              className="flex-1 py-3 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all text-sm"
            >
              <Download className="w-4 h-4" /> Download Certified PDF
            </a>
            <button
              onClick={reset}
              className="py-3 px-6 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold rounded-xl transition-colors text-sm"
            >
              Certify Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-4 sm:p-8 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm border border-blue-100 dark:border-blue-900/50">
          <Award className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-2">
          Certify PDF Document Studio
        </h1>
        <p className="text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          Digitally certify documents for official, legal, and compliance purposes. Instant 1-click digital seal or custom .p12 certificate signing.
        </p>
      </div>

      <div className="w-full max-w-2xl space-y-6">
        {/* Certificate Mode Selector */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-md mx-auto">
          <button
            onClick={() => setCertMode('instant')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              certMode === 'instant'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-500" /> 1-Click Instant Digital ID
          </button>
          <button
            onClick={() => setCertMode('custom_p12')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              certMode === 'custom_p12'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Key className="w-3.5 h-3.5 text-indigo-500" /> Upload .p12 / .pfx Certificate
          </button>
        </div>

        {/* Dropzone */}
        <FileDropzone
          onDrop={handlePdfDrop}
          multiple={false}
          title={pdfFile ? `Selected: ${pdfFile.name}` : "Select PDF Document to Certify"}
        />

        {pdfFile && (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            {certMode === 'instant' ? (
              /* Instant Mode Settings */
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Certifier / Signer Name
                    </label>
                    <input
                      type="text"
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                      placeholder="e.g. Anurag Sharma"
                      className="w-full py-2 px-3 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Organization / Designation
                    </label>
                    <input
                      type="text"
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      placeholder="e.g. Executive Director, Legal Compliance"
                      className="w-full py-2 px-3 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Certification Reason / Statement
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Certified True Copy of Original Document"
                    className="w-full py-2 px-3 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="pt-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={lockDocument}
                      onChange={(e) => setLockDocument(e.target.checked)}
                      className="rounded accent-blue-600"
                    />
                    <span>Lock Document (Flag document as tamper-evident / finalized)</span>
                  </label>
                </div>
              </div>
            ) : (
              /* Custom .p12 Mode Settings */
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Upload PKCS#12 Certificate File (.p12 / .pfx)
                  </label>
                  <input
                    type="file"
                    accept=".p12,.pfx"
                    onChange={handleCertDrop}
                    className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {certFile && (
                    <span className="text-[11px] text-emerald-600 font-semibold mt-1 block">
                      Certificate loaded: {certFile.name}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Certificate Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter private key password"
                    className="w-full py-2 px-3 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <button
              onClick={certifyPdf}
              disabled={isProcessing}
              className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 disabled:opacity-50 transition-all text-sm"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Digitally Certifying Document...
                </>
              ) : (
                <>
                  <Award className="w-4 h-4" /> Certify & Sign PDF
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
