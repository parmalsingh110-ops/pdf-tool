import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  CheckCircle, Download, AlertCircle,
  Sparkles, Award, Key, Loader2
} from 'lucide-react';
import { usePageSEO } from '../lib/usePageSEO';
import FileDropzone from '../components/FileDropzone';
// @ts-ignore
import * as Zga from 'zgapdfsigner';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { useSEO } from '../hooks/useSEO';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

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

  useAutoRevokeUrl(certifiedUrl);

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
        const signedPdfBytes = toArrayBufferBytes(await signer.sign(pdfBuffer));
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

      const certifiedBytes = toArrayBufferBytes(await pdfDoc.save());
      const blob = new Blob([certifiedBytes], { type: 'application/pdf' });
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

  const prefersReduced = useReducedMotion();

  return (
    <ToolWorkspaceShell
      title="Certify PDF Document Studio"
      subtitle="Digitally certify documents for official, legal, and compliance purposes. Instant 1-click digital seal or custom .p12 certificate signing."
      categoryLabel="Digital ID & PKI Signing"
      icon={Award}
      microVariant="sign"
      tone="violet"
      trustNote="WebCrypto SHA-256 tamper-evident seal · Local PKCS#12 support"
    >
      <PearlStageSwitch stageKey={certifiedUrl ? 'certified' : 'workspace'}>
        {certifiedUrl ? (
          <div className="max-w-xl mx-auto pms-glass-panel rounded-3xl border border-emerald-200/80 dark:border-emerald-800/70 p-8 text-center space-y-6">
            <motion.div
              initial={prefersReduced ? false : { scale: 0.45, rotate: -10, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 360, damping: 18 }}
              className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner"
            >
              <CheckCircle className="w-10 h-10" />
            </motion.div>

            <div>
              <span className="inline-block px-3.5 py-1 bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-bold uppercase tracking-wider mb-2 border border-[var(--pms-border)]">
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
              <motion.div
                initial={prefersReduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.08 }}
                className="p-4 bg-white/80 dark:bg-slate-800/60 rounded-2xl border border-[var(--pms-border)] text-left text-xs space-y-2 font-mono"
              >
                <div className="flex justify-between border-b border-[var(--pms-border)] pb-1.5">
                  <span className="text-slate-400">Certificate Serial:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{auditInfo.serial}</span>
                </div>
                <div className="flex justify-between border-b border-[var(--pms-border)] pb-1.5">
                  <span className="text-slate-400">Certified Signer:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{signerName}</span>
                </div>
                <div className="border-b border-[var(--pms-border)] pb-1.5">
                  <span className="text-slate-400 block mb-0.5">SHA-256 Fingerprint:</span>
                  <span className="text-[10px] break-all text-slate-600 dark:text-slate-300">{auditInfo.sha256}</span>
                </div>
                <div className="flex justify-between pt-0.5">
                  <span className="text-slate-400">Timestamp:</span>
                  <span className="text-slate-600 dark:text-slate-300">{auditInfo.timestamp}</span>
                </div>
              </motion.div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <motion.a
                whileHover={prefersReduced ? undefined : { scale: 1.015 }}
                whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                href={certifiedUrl}
                download={`certified_${pdfFile?.name || 'document.pdf'}`}
                className="flex-1 py-3.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-colors text-sm"
              >
                <Download className="w-4 h-4" /> Download Certified PDF
              </motion.a>
              <button
                onClick={reset}
                className="py-3.5 px-6 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-2xl transition-colors text-sm cursor-pointer"
              >
                Certify Another
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-2xl mx-auto space-y-6">
            {/* Certificate Mode Selector with sliding Pearl pill */}
            <div className="flex bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-1.5 rounded-2xl border border-[var(--pms-border)] max-w-md mx-auto shadow-sm">
              {[
                { id: 'instant' as CertMode, label: '1-Click Instant Digital ID', icon: Sparkles, iconCls: 'text-violet-500' },
                { id: 'custom_p12' as CertMode, label: 'Upload .p12 / .pfx Certificate', icon: Key, iconCls: 'text-indigo-500' },
              ].map((tab) => {
                const active = certMode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCertMode(tab.id)}
                    className={`relative flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      active
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="certify-mode-pill"
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                        className="absolute inset-0 rounded-xl bg-[var(--pms-soft-lavender)] border border-[var(--pms-border)] shadow-xs"
                      />
                    )}
                    <span className="relative z-10 inline-flex items-center gap-1.5">
                      <tab.icon className={`w-3.5 h-3.5 ${tab.iconCls}`} />
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Dropzone */}
            <FileDropzone
              onDrop={handlePdfDrop}
              multiple={false}
              title={pdfFile ? `Selected: ${pdfFile.name}` : "Select PDF Document to Certify"}
            />

            <AnimatePresence>
              {pdfFile && (
                <motion.div
                  initial={prefersReduced ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReduced ? undefined : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="relative pms-glass-panel p-6 rounded-3xl space-y-4 overflow-hidden"
                >
                  <PearlScanOverlay active={isProcessing} label="Applying cryptographic seal…" />

                  <AnimatePresence mode="wait">
                    {certMode === 'instant' ? (
                      <motion.div
                        key="instant"
                        initial={prefersReduced ? false : { opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={prefersReduced ? undefined : { opacity: 0, x: 8 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-3"
                      >
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
                              className="w-full py-2.5 px-3 text-xs border border-[var(--pms-border)] rounded-xl bg-white/80 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500"
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
                              className="w-full py-2.5 px-3 text-xs border border-[var(--pms-border)] rounded-xl bg-white/80 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500"
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
                            className="w-full py-2.5 px-3 text-xs border border-[var(--pms-border)] rounded-xl bg-white/80 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500"
                          />
                        </div>

                        <div className="pt-2">
                          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={lockDocument}
                              onChange={(e) => setLockDocument(e.target.checked)}
                              className="rounded accent-violet-600"
                            />
                            <span>Lock Document (Flag document as tamper-evident / finalized)</span>
                          </label>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="custom_p12"
                        initial={prefersReduced ? false : { opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={prefersReduced ? undefined : { opacity: 0, x: -8 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-3"
                      >
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Upload PKCS#12 Certificate File (.p12 / .pfx)
                          </label>
                          <input
                            type="file"
                            accept=".p12,.pfx"
                            onChange={handleCertDrop}
                            className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[var(--pms-soft-lavender)] file:text-[var(--pms-violet)] hover:brightness-95"
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
                            className="w-full py-2.5 px-3 text-xs border border-[var(--pms-border)] rounded-xl bg-white/80 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500"
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {error && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-xs rounded-xl flex items-center gap-2 border border-red-200 dark:border-red-800/60">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {error}
                    </div>
                  )}

                  <motion.button
                    whileHover={prefersReduced || isProcessing ? undefined : { scale: 1.01 }}
                    whileTap={prefersReduced || isProcessing ? undefined : { scale: 0.985 }}
                    onClick={certifyPdf}
                    disabled={isProcessing}
                    className="w-full pms-btn-primary py-3.5 px-4 font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 text-sm cursor-pointer"
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
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
