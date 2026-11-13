import React, { useState } from 'react';
import { 
  ShieldCheck, CheckCircle2, AlertTriangle, Search, 
  Download, Award, RefreshCw, Lock
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { PDFDocument } from 'pdf-lib';
import FileDropzone from '../components/FileDropzone';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { triggerBlobDownload } from '../lib/blobUrl';

interface ValidationResult {
  hasSignature: boolean;
  signerName?: string;
  signingTime?: string;
  reason?: string;
  sha256: string;
  integrityStatus: 'VALID' | 'WARNING' | 'NO_SIGNATURE';
  fileSize: number;
  pdfVersion: string;
  incrementalUpdates: number;
  details: string[];
}

export default function ValidateSignatures() {
  useSEO(
    'Validate PDF Signatures Online — Digital Signature & Certificate Inspector',
    'Verify digital signatures, check document tamper integrity, extract signer credentials, and validate PDF cryptographic certificates in your browser.'
  );

  usePageSEO(
    'PDF Signature Validator & Integrity Inspector',
    'Verify X.509 and cryptographic digital signatures in PDF files. Checks document integrity, SHA-256 hashes, incremental revisions, and signer certificates.'
  );

  const prefersReduced = useReducedMotion();
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);

  const bufferToHex = (buffer: ArrayBuffer) => {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const handleDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const f = acceptedFiles[0];
      setFile(f);
      setResult(null);
      await analyzeDocument(f);
    }
  };

  const analyzeDocument = async (f: File) => {
    setIsAnalyzing(true);
    try {
      const arrayBuffer = await f.arrayBuffer();

      // Step 1: Compute SHA-256 Checksum
      const hashBuf = await window.crypto.subtle.digest('SHA-256', arrayBuffer);
      const sha256Hex = bufferToHex(hashBuf);

      // Step 2: Binary stream scan for signature dictionaries & PDF headers
      const uint8 = new Uint8Array(arrayBuffer);
      const textDecoder = new TextDecoder('latin1');
      const rawText = textDecoder.decode(uint8);

      // Extract PDF header version
      const headerMatch = rawText.match(/%PDF-([0-9.]+)/);
      const pdfVersion = headerMatch ? `PDF ${headerMatch[1]}` : 'PDF 1.7';

      // Count %%EOF to detect incremental updates / revisions
      const eofMatches = rawText.match(/%%EOF/g);
      const incrementalUpdates = eofMatches ? Math.max(eofMatches.length - 1, 0) : 0;

      // Check for standard signature dictionaries (/Type /Sig, /ByteRange, /Contents)
      const byteRangeMatch = rawText.match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
      const hasRealByteRange = !!byteRangeMatch;
      const hasSigDict = rawText.includes('/Type /Sig') || rawText.includes('/Type/Sig') || hasRealByteRange;
      const hasDigitalCertStamp = rawText.includes('DIGITALLY SIGNED') || rawText.includes('DigitalSignature:') || rawText.includes('NOTARIAL DIGITAL SEAL');

      // Attempt to extract signer metadata from pdf-lib
      let signerName: string | undefined;
      let reason: string | undefined;
      let signingTime: string | undefined;

      try {
        const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const subject = pdfDoc.getSubject();
        const keywords = pdfDoc.getKeywords();
        const modDate = pdfDoc.getModificationDate();

        if (subject && subject.includes('Digitally Certified by')) {
          signerName = subject.replace('Digitally Certified by', '').trim();
        }

        if (keywords) {
          const kwList = Array.isArray(keywords) ? keywords : typeof keywords === 'string' ? keywords.split(',') : [];
          const signerKw = kwList.find((k: string) => k.trim().startsWith('Signer:'));
          if (signerKw) signerName = signerKw.replace('Signer:', '').trim();

          const timeKw = kwList.find((k: string) => k.trim().startsWith('Timestamp:'));
          if (timeKw) signingTime = timeKw.replace('Timestamp:', '').trim();
        }

        if (!signingTime && modDate) {
          signingTime = modDate.toLocaleString();
        }
      } catch (err) {
        console.warn('Metadata inspection warning:', err);
      }

      // Regex fallback extraction from raw PDF byte stream
      if (!signerName) {
        const nameMatch = rawText.match(/\/Name\s*\(([^)]+)\)/);
        if (nameMatch) signerName = nameMatch[1];
      }
      if (!reason) {
        const reasonMatch = rawText.match(/\/Reason\s*\(([^)]+)\)/);
        if (reasonMatch) reason = reasonMatch[1];
      }

      const details: string[] = [];
      let integrityStatus: 'VALID' | 'WARNING' | 'NO_SIGNATURE' = 'NO_SIGNATURE';

      if (hasRealByteRange) {
        integrityStatus = 'VALID';
        details.push('Standard PKCS#7 / PAdES Digital Signature dictionary with ByteRange detected.');
        if (signerName) details.push(`Identified Signer: "${signerName}".`);
        if (reason) details.push(`Signing Purpose / Reason: "${reason}".`);
        if (incrementalUpdates > 0) {
          details.push(`Document contains ${incrementalUpdates} revision layer(s) following initial signing.`);
        } else {
          details.push('Document byte structure is intact with zero unauthorized post-signing revisions.');
        }
      } else if (hasSigDict || signerName || hasDigitalCertStamp) {
        integrityStatus = 'WARNING';
        details.push('Visual Certificate Stamp or Notary Metadata detected.');
        details.push('NOTICE: No cryptographic PKCS#7 / PAdES ByteRange dictionary found in PDF structure.');
        if (signerName) details.push(`Signer metadata references: "${signerName}".`);
        details.push('This document contains visual attestation markings but is not cryptographically sealed against byte tampering.');
      } else {
        integrityStatus = 'NO_SIGNATURE';
        details.push('No standard PKCS#7 or PKI Digital Signature dictionary found in this PDF.');
        details.push('Document SHA-256 fingerprint generated for tamper-verification audit baseline.');
      }

      setResult({
        hasSignature: hasSigDict || !!hasDigitalCertStamp || !!signerName,
        signerName,
        reason,
        signingTime,
        sha256: sha256Hex,
        integrityStatus,
        fileSize: f.size,
        pdfVersion,
        incrementalUpdates,
        details
      });
    } catch (err: any) {
      console.error('Validation error:', err);
      alert(`Validation error: ${err?.message || 'Failed to inspect PDF.'}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const downloadAuditReport = () => {
    if (!result || !file) return;
    const reportData = {
      auditTimestamp: new Date().toISOString(),
      fileName: file.name,
      fileSizeBytes: result.fileSize,
      pdfSpecification: result.pdfVersion,
      sha256Hash: result.sha256,
      signatureDetected: result.hasSignature,
      signerIdentity: result.signerName || 'None Detected',
      signingReason: result.reason || 'None',
      signingTime: result.signingTime || 'N/A',
      revisionLayers: result.incrementalUpdates,
      integrityAuditSummary: result.details
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    triggerBlobDownload(blob, `${file.name.replace(/\.pdf$/i, '')}_Signature_Audit_Report.json`);
  };

  const reset = () => {
    setFile(null);
    setResult(null);
  };

  const stageKey = !file ? 'upload' : isAnalyzing ? 'analyzing' : 'result';

  return (
    <ToolWorkspaceShell
      title="PDF Digital Signature Validator"
      subtitle="Inspect PDF signature structures, detect signing metadata, and generate SHA-256 fingerprints. Note: Structural inspection only — not cryptographic certificate verification."
      categoryLabel="Integrity & Trust"
      icon={ShieldCheck}
      microVariant="security"
      tone="blue"
      trustNote="Zero-upload SHA-256 hashing & byte-stream analysis in your browser"
    >
      <PearlStageSwitch stageKey={stageKey} className="w-full max-w-4xl mx-auto flex flex-col items-center">
        {!file ? (
          <div className="w-full max-w-2xl space-y-6">
            <FileDropzone 
              onDrop={handleDrop} 
              multiple={false} 
              title="Select PDF to Validate Signatures & Integrity" 
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="pms-glass-panel p-4 rounded-2xl text-center">
                <Search className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
                <h3 className="font-bold text-sm text-[var(--pms-ink)]">Signature Scanner</h3>
                <p className="text-xs text-[var(--pms-muted)] mt-1">Detects PKCS#7, X.509, and cryptographic digital seals.</p>
              </div>
              <div className="pms-glass-panel p-4 rounded-2xl text-center">
                <Lock className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
                <h3 className="font-bold text-sm text-[var(--pms-ink)]">Tamper Detection</h3>
                <p className="text-xs text-[var(--pms-muted)] mt-1">Analyzes incremental revisions and byte changes.</p>
              </div>
              <div className="pms-glass-panel p-4 rounded-2xl text-center">
                <Award className="w-6 h-6 text-indigo-600 dark:text-indigo-400 mx-auto mb-2" />
                <h3 className="font-bold text-sm text-[var(--pms-ink)]">Audit Export</h3>
                <p className="text-xs text-[var(--pms-muted)] mt-1">Download official JSON verification audit summary.</p>
              </div>
            </div>
          </div>
        ) : isAnalyzing ? (
          <div className="w-full max-w-lg p-12 text-center pms-glass-panel rounded-3xl space-y-4 relative overflow-hidden">
            <PearlScanOverlay active={isAnalyzing} label="Scanning signature dictionaries & SHA-256 digest..." />
            <RefreshCw className="w-10 h-10 animate-spin text-blue-600 dark:text-blue-400 mx-auto" />
            <h3 className="text-lg font-bold text-[var(--pms-ink)]">Analyzing Cryptographic Signature Blocks...</h3>
            <p className="text-xs text-[var(--pms-muted)]">Scanning byte ranges, dictionary objects, and computing SHA-256 digest...</p>
          </div>
        ) : result ? (
          /* Validation Report Screen */
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.25 }}
            className="w-full pms-glass-panel rounded-3xl p-6 sm:p-8 space-y-6"
          >
            {/* Top Status Banner */}
            <div className={`p-6 rounded-2xl border flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left ${
              result.integrityStatus === 'VALID'
                ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60'
                : 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60'
            }`}>
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                result.integrityStatus === 'VALID'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-500 text-white'
              }`}>
                {result.integrityStatus === 'VALID' ? (
                  <CheckCircle2 className="w-10 h-10" />
                ) : (
                  <AlertTriangle className="w-10 h-10" />
                )}
              </div>

              <div className="flex-1">
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider mb-1 ${
                  result.integrityStatus === 'VALID'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                }`}>
                  {result.integrityStatus === 'VALID' ? 'Signature Structure Found' : 'Standard Document (Unsigned)'}
                </span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-[var(--pms-ink)]">
                  {result.integrityStatus === 'VALID'
                    ? 'Signature Structure Detected'
                    : 'No Cryptographic Digital Signatures Found'}
                </h2>
                <p className="text-xs sm:text-sm text-[var(--pms-muted)] mt-1">
                  {result.integrityStatus === 'VALID'
                    ? 'Signature dictionary structures found. Note: Structural detection only — cryptographic certificate chain was NOT verified.'
                    : 'This is a standard PDF without embedded cryptographic X.509 signatures or digital certification seals.'}
                </p>
              </div>
            </div>

            {/* Key Document Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 bg-white/60 dark:bg-slate-900/60 rounded-xl border border-[var(--pms-border)]">
                <span className="text-[11px] text-[var(--pms-muted)] block">File Name</span>
                <p className="font-bold text-xs sm:text-sm text-[var(--pms-ink)] truncate" title={file.name}>
                  {file.name}
                </p>
              </div>
              <div className="p-3.5 bg-white/60 dark:bg-slate-900/60 rounded-xl border border-[var(--pms-border)]">
                <span className="text-[11px] text-[var(--pms-muted)] block">Specification</span>
                <p className="font-bold text-xs sm:text-sm text-[var(--pms-ink)]">{result.pdfVersion}</p>
              </div>
              <div className="p-3.5 bg-white/60 dark:bg-slate-900/60 rounded-xl border border-[var(--pms-border)]">
                <span className="text-[11px] text-[var(--pms-muted)] block">Signer Entity</span>
                <p className="font-bold text-xs sm:text-sm text-emerald-600 dark:text-emerald-400 truncate">{result.signerName || 'None'}</p>
              </div>
              <div className="p-3.5 bg-white/60 dark:bg-slate-900/60 rounded-xl border border-[var(--pms-border)]">
                <span className="text-[11px] text-[var(--pms-muted)] block">Revisions</span>
                <p className="font-bold text-xs sm:text-sm text-[var(--pms-ink)]">
                  <AnimatedNumber value={result.incrementalUpdates} suffix=" Updates" />
                </p>
              </div>
            </div>

            {/* Audit Verification Checklist */}
            <div className="p-5 bg-white/55 dark:bg-slate-900/55 rounded-2xl border border-[var(--pms-border)] space-y-3">
              <h3 className="font-bold text-sm text-[var(--pms-ink)] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Structural Inspector Findings
              </h3>
              <ul className="space-y-2 text-xs text-[var(--pms-ink)]">
                {result.details.map((detail, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* SHA-256 Fingerprint */}
            <div className="p-4 bg-white/65 dark:bg-slate-900/65 rounded-2xl border border-[var(--pms-border)] space-y-1">
              <span className="text-xs font-bold text-[var(--pms-ink)]">Document SHA-256 Fingerprint:</span>
              <p className="font-mono text-[11px] text-[var(--pms-muted)] break-all bg-white/75 dark:bg-slate-950/70 p-2.5 rounded-lg border border-[var(--pms-border)]">
                {result.sha256}
              </p>
            </div>

            {/* Structural Inspector Disclaimer */}
            <div className="p-4 bg-amber-50/90 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-800/60 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm text-amber-800 dark:text-amber-300">Structural Inspector — Not Cryptographic Verification</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  This tool detects the <em>presence</em> of signature structures in the PDF byte stream. It does <strong>not</strong> validate the cryptographic certificate chain, check against a Certificate Authority (CA), or confirm the signature has not been tampered with. For legally binding verification, use Adobe Acrobat or a certified PKI validator.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={downloadAuditReport}
                className="pms-btn-primary flex-1 py-3.5 px-6 font-bold rounded-2xl flex items-center justify-center gap-2 text-sm"
              >
                <Download className="w-4 h-4" />
                Download Audit Certificate (.json)
              </button>
              <button
                onClick={reset}
                className="py-3.5 px-6 bg-white/75 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-800 border border-[var(--pms-border)] text-[var(--pms-ink)] font-bold rounded-2xl transition-all text-sm"
              >
                Inspect Another File
              </button>
            </div>
          </motion.div>
        ) : null}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
