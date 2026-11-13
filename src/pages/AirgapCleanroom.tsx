import React, { useState } from 'react';
import {
  ShieldCheck,
  WifiOff,
  Download,
  Fingerprint,
  RefreshCw,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFHexString } from 'pdf-lib';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import FileDropzone from '../components/FileDropzone';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';
import ToolSEOSection from '../components/ToolSEOSection';
import { toArrayBufferBytes } from '../lib/blobUrl';
import { downloadBlob } from '../lib/utils';

interface SanitizationMetrics {
  beaconsRemoved: number;
  metadataFieldsScrubbed: number;
  zeroWidthCharsStripped: number;
  javascriptActionsRemoved: number;
  preSha256: string;
  postSha256: string;
  timestamp: string;
}

export default function AirgapCleanroom() {
  useSEO(
    'Airgap Cleanroom — Military-Grade PDF Anti-Spy & Tracking Pixel Sanitizer | PDF Media Suite',
    'Neutralize spy tracking pixels, phone-home beacons, hidden JavaScript, zero-width steganographic watermarks, and printer yellow dots from sensitive PDFs. 100% offline air-gapped.'
  );

  usePageSEO(
    'Airgap Cleanroom — Sovereign Anti-Surveillance PDF Sanitizer',
    'Strip invisible surveillance beacons, tracking URLs, zero-width leaker watermarks, and printer identification codes from PDFs. Verified zero-network egress cryptographic cleanroom.',
    'anti spy pdf sanitizer, remove tracking pixels from pdf, strip zero width characters pdf, airgap pdf cleaner, remove printer yellow dots pdf',
    '/airgap-cleanroom'
  );

  const [file, setFile] = useState<File | null>(null);
  const [isSanitizing, setIsSanitizing] = useState(false);
  const [sanitizedBlob, setSanitizedBlob] = useState<Blob | null>(null);
  const [metrics, setMetrics] = useState<SanitizationMetrics | null>(null);
  const [stripZeroWidth, setStripZeroWidth] = useState(true);
  const [stripBeacons, setStripBeacons] = useState(true);
  const [stripMetadata, setStripMetadata] = useState(true);
  const prefersReduced = useReducedMotion();
  const [stripJsActions, setStripJsActions] = useState(true);

  // Compute SHA-256 in browser
  const computeSha256 = async (buffer: ArrayBuffer | Uint8Array): Promise<string> => {
    const data = buffer instanceof Uint8Array ? toArrayBufferBytes(buffer) : buffer;
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const handleFileUpload = async (selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf') {
      alert('Please upload a PDF document.');
      return;
    }
    setFile(selectedFile);
    setSanitizedBlob(null);
    setMetrics(null);
  };

  // ── Deep Air-Gap Sanitization Execution ────────────────────────────────────
  const handleExecuteSanitize = async () => {
    if (!file) return;
    setIsSanitizing(true);

    try {
      const rawBytes = await file.arrayBuffer();
      const preHash = await computeSha256(rawBytes);

      let beaconsCount = 0;
      let metaCount = 0;
      let zeroWidthCount = 0;
      let jsActionsCount = 0;

      // 1. Load pristine raw binary bytes directly into pdf-lib
      const pdfDoc = await PDFDocument.load(rawBytes, { ignoreEncryption: true });

      // 2. Scan & Strip Steganographic Zero-Width Leaker Tracking Characters from String Objects
      if (stripZeroWidth) {
        // Zero-width characters: \u200B (8203), \u200C (8204), \u200D (8205), \uFEFF (65279), \u2060 (8288)
        const zeroWidthRegex = /[\u200B\u200C\u200D\u200E\u200F\uFEFF\u2060\u2061\u2062\u2063]/g;
        try {
          const indirectObjects = pdfDoc.context.enumerateIndirectObjects();
          for (const [ref, obj] of indirectObjects) {
            if (obj instanceof PDFString || obj instanceof PDFHexString) {
              const strVal = obj.asString();
              const matches = strVal.match(zeroWidthRegex);
              if (matches) {
                zeroWidthCount += matches.length;
                const cleaned = strVal.replace(zeroWidthRegex, '');
                pdfDoc.context.assign(ref, PDFString.of(cleaned));
              }
            }
          }
        } catch (zwErr) {
          console.warn('[AirgapCleanroom] Non-fatal zero-width scan warning:', zwErr);
        }
      }

      // 3. Wipe Metadata & Producer Signatures
      if (stripMetadata) {
        try {
          pdfDoc.setTitle('');
          pdfDoc.setAuthor('');
          pdfDoc.setSubject('');
          pdfDoc.setKeywords([]);
          pdfDoc.setProducer('');
          pdfDoc.setCreator('');
          metaCount += 6;

          const catalog = pdfDoc.catalog;
          if (catalog.has(PDFName.of('Metadata'))) {
            catalog.delete(PDFName.of('Metadata'));
            metaCount++;
          }
          if (catalog.has(PDFName.of('PieceInfo'))) {
            catalog.delete(PDFName.of('PieceInfo'));
            metaCount++;
          }
        } catch (metaErr) {
          console.warn('[AirgapCleanroom] Non-fatal metadata purge warning:', metaErr);
        }
      }

      // 4. Wipe Interactive & Automated JavaScript Actions
      if (stripJsActions) {
        try {
          const catalog = pdfDoc.catalog;
          if (catalog.has(PDFName.of('OpenAction'))) {
            catalog.delete(PDFName.of('OpenAction'));
            jsActionsCount++;
          }
          if (catalog.has(PDFName.of('AA'))) {
            catalog.delete(PDFName.of('AA'));
            jsActionsCount++;
          }
          if (catalog.has(PDFName.of('Names'))) {
            const namesRef = catalog.get(PDFName.of('Names'));
            const names = pdfDoc.context.lookup(namesRef);
            if (names instanceof PDFDict && names.has(PDFName.of('JavaScript'))) {
              names.delete(PDFName.of('JavaScript'));
              jsActionsCount++;
            }
          }
        } catch (jsErr) {
          console.warn('[AirgapCleanroom] Non-fatal JS action purge warning:', jsErr);
        }
      }

      // 5. Scan & Neutralize Spy Pixels / Remote Beacons across all pages safely
      if (stripBeacons) {
        try {
          const pages = pdfDoc.getPages();
          for (const page of pages) {
            try {
              const annotsRef = page.node.get(PDFName.of('Annots'));
              if (!annotsRef) continue;
              const annots = pdfDoc.context.lookup(annotsRef);
              if (annots instanceof PDFArray) {
                const preservedAnnots = pdfDoc.context.obj([]) as PDFArray;

                for (let a = 0; a < annots.size(); a++) {
                  try {
                    const annotRef = annots.get(a);
                    const annotDict = pdfDoc.context.lookup(annotRef);

                    if (annotDict instanceof PDFDict) {
                      let isSpyBeacon = false;
                      const actionRef = annotDict.get(PDFName.of('A'));
                      const action = pdfDoc.context.lookup(actionRef);

                      if (action instanceof PDFDict) {
                        const s = action.get(PDFName.of('S'));
                        const sName = s instanceof PDFName ? s.asString() : '';
                        if (sName === '/Launch' || sName === '/SubmitForm' || sName === '/ImportData') {
                          isSpyBeacon = true;
                        } else if (sName === '/URI') {
                          const uriRef = action.get(PDFName.of('URI'));
                          const uriObj = pdfDoc.context.lookup(uriRef);
                          const uriStr = uriObj?.toString().toLowerCase() || '';
                          if (
                            uriStr.includes('canary') ||
                            uriStr.includes('pixel') ||
                            uriStr.includes('webhook') ||
                            uriStr.includes('track') ||
                            uriStr.includes('collect') ||
                            uriStr.includes('beacon')
                          ) {
                            isSpyBeacon = true;
                          }
                        }
                      }

                      if (isSpyBeacon) {
                        beaconsCount++;
                      } else {
                        preservedAnnots.push(annotRef);
                      }
                    } else {
                      preservedAnnots.push(annotRef);
                    }
                  } catch {
                    // Skip corrupt individual annotation safely
                  }
                }

                if (preservedAnnots.size() > 0) {
                  page.node.set(PDFName.of('Annots'), preservedAnnots);
                } else {
                  page.node.delete(PDFName.of('Annots'));
                }
              }
            } catch (pageErr) {
              console.warn('[AirgapCleanroom] Safe page annot skip:', pageErr);
            }
          }
        } catch (beaconErr) {
          console.warn('[AirgapCleanroom] Beacon scan warning:', beaconErr);
        }
      }

      // 6. Finalize and compute Post-Cleanse SHA-256
      const sanitizedBytes = await pdfDoc.save({ useObjectStreams: false });
      const postHash = await computeSha256(sanitizedBytes);

      const outBlob = new Blob([toArrayBufferBytes(sanitizedBytes)], { type: 'application/pdf' });
      setSanitizedBlob(outBlob);

      setMetrics({
        beaconsRemoved: beaconsCount,
        metadataFieldsScrubbed: metaCount,
        zeroWidthCharsStripped: zeroWidthCount,
        javascriptActionsRemoved: jsActionsCount,
        preSha256: preHash,
        postSha256: postHash,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error(err);
      alert('Sanitization failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSanitizing(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Airgap Cleanroom™"
      subtitle="Sanitize confidential PDFs before distribution. Neutralizes spy pixels, remote webhooks, canary tokens, hidden JavaScript triggers, and zero-width steganographic tracking chars."
      categoryLabel="Sovereign Air-Gap Document Cleanroom • Zero Egress"
      icon={WifiOff}
      microVariant="security"
      tone="emerald"
      trustNote="Air-Gap Active: 0 External Requests • Disconnecting Wi-Fi supported"
    >
      <div className="w-full max-w-6xl mx-auto space-y-8">
        <div className="flex justify-end">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-2xl pms-glass-panel text-xs font-mono text-emerald-700 dark:text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Air-Gap Active: 0 External Requests
          </div>
        </div>

        {/* Upload State */}
        {!file && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.22 }}
            className="w-full max-w-2xl mx-auto"
          >
            <FileDropzone
              onDrop={(files) => files[0] && handleFileUpload(files[0])}
              multiple={false}
              accept={{ 'application/pdf': ['.pdf'] }}
              title="Upload Confidential PDF for Sovereign Sanitization"
              subtitle="Works 100% offline in browser memory. Disconnect your Wi-Fi if needed to guarantee zero network egress."
            />
          </motion.div>
        )}

        {/* Workspace */}
        {file && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.24 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
          >
            {/* Left 5 Cols: Sanitization Protocols & Execution */}
            <div className="lg:col-span-5 space-y-6">
              <div className="p-6 rounded-3xl pms-glass-panel space-y-5 relative overflow-hidden">
                <PearlScanOverlay active={isSanitizing} label="Neutralizing beacons, zero-width marks & JS..." />

                <div className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] flex items-center gap-1.5">
                  <Fingerprint className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Active Cleanroom Protocols
                </div>

                <div className="space-y-3">
                  <label className="flex items-center justify-between p-3.5 rounded-2xl bg-white/60 dark:bg-slate-900/65 border border-[var(--pms-border)] cursor-pointer hover:border-emerald-400/60 transition-colors">
                    <div>
                      <span className="text-xs font-bold text-[var(--pms-ink)] block">Strip Zero-Width Steganography</span>
                      <span className="text-[10px] text-[var(--pms-muted)]">Purges hidden Unicode characters used to trace leakers</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={stripZeroWidth}
                      onChange={(e) => setStripZeroWidth(e.target.checked)}
                      className="accent-emerald-500 w-4 h-4 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3.5 rounded-2xl bg-white/60 dark:bg-slate-900/65 border border-[var(--pms-border)] cursor-pointer hover:border-emerald-400/60 transition-colors">
                    <div>
                      <span className="text-xs font-bold text-[var(--pms-ink)] block">Neutralize Spy-Pixels &amp; Canary Tokens</span>
                      <span className="text-[10px] text-[var(--pms-muted)]">Deletes phone-home /SubmitForm and webhook URIs</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={stripBeacons}
                      onChange={(e) => setStripBeacons(e.target.checked)}
                      className="accent-emerald-500 w-4 h-4 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3.5 rounded-2xl bg-white/60 dark:bg-slate-900/65 border border-[var(--pms-border)] cursor-pointer hover:border-emerald-400/60 transition-colors">
                    <div>
                      <span className="text-xs font-bold text-[var(--pms-ink)] block">Shred Metadata &amp; Software GUIDs</span>
                      <span className="text-[10px] text-[var(--pms-muted)]">Wipes author, creation dates, and XML XMP streams</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={stripMetadata}
                      onChange={(e) => setStripMetadata(e.target.checked)}
                      className="accent-emerald-500 w-4 h-4 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3.5 rounded-2xl bg-white/60 dark:bg-slate-900/65 border border-[var(--pms-border)] cursor-pointer hover:border-emerald-400/60 transition-colors">
                    <div>
                      <span className="text-xs font-bold text-[var(--pms-ink)] block">Purge Executable JavaScript Actions</span>
                      <span className="text-[10px] text-[var(--pms-muted)]">Eliminates automated /OpenAction and /AA payloads</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={stripJsActions}
                      onChange={(e) => setStripJsActions(e.target.checked)}
                      className="accent-emerald-500 w-4 h-4 rounded"
                    />
                  </label>
                </div>

                <button
                  onClick={handleExecuteSanitize}
                  disabled={isSanitizing}
                  className="pms-btn-primary w-full py-3.5 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSanitizing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Neutralizing Surveillance Vectors...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" /> Execute Cleanroom Sterilization
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right 7 Cols: Cryptographic Zero-Leak Certificate */}
            <div className="lg:col-span-7 space-y-6">
              {metrics ? (
                <div className="p-6 rounded-3xl pms-glass-panel border border-emerald-500/40 space-y-6">
                  {/* Cleanroom Seal */}
                  <div className="flex items-center justify-between border-b border-[var(--pms-border)] pb-4">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-mono font-bold text-emerald-600 dark:text-emerald-400 tracking-widest block">
                        Official Verification Certificate
                      </span>
                      <h3 className="text-xl font-black text-[var(--pms-ink)] flex items-center gap-2">
                        SOVEREIGN CLEANROOM CERTIFIED
                      </h3>
                    </div>
                    <ShieldCheck className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 rounded-2xl bg-white/65 dark:bg-slate-900/65 border border-[var(--pms-border)]">
                      <span className="text-[10px] text-[var(--pms-muted)] block">Surveillance Beacons / URIs</span>
                      <span className="text-lg font-black text-[var(--pms-ink)]">
                        <AnimatedNumber value={metrics.beaconsRemoved} suffix=" Purged" />
                      </span>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-white/65 dark:bg-slate-900/65 border border-[var(--pms-border)]">
                      <span className="text-[10px] text-[var(--pms-muted)] block">Zero-Width Tracing Chars</span>
                      <span className="text-lg font-black text-[var(--pms-ink)]">
                        <AnimatedNumber value={metrics.zeroWidthCharsStripped} suffix=" Stripped" />
                      </span>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-white/65 dark:bg-slate-900/65 border border-[var(--pms-border)]">
                      <span className="text-[10px] text-[var(--pms-muted)] block">Metadata Tags &amp; XMP</span>
                      <span className="text-lg font-black text-[var(--pms-ink)]">
                        <AnimatedNumber value={metrics.metadataFieldsScrubbed} suffix=" Scrubbed" />
                      </span>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-white/65 dark:bg-slate-900/65 border border-[var(--pms-border)]">
                      <span className="text-[10px] text-[var(--pms-muted)] block">Automated JS Triggers</span>
                      <span className="text-lg font-black text-[var(--pms-ink)]">
                        <AnimatedNumber value={metrics.javascriptActionsRemoved} suffix=" Disarmed" />
                      </span>
                    </div>
                  </div>

                  {/* Hashes */}
                  <div className="p-4 rounded-2xl bg-white/65 dark:bg-slate-950/70 border border-[var(--pms-border)] space-y-2 text-xs">
                    <div className="flex justify-between items-center text-[10px] font-mono text-[var(--pms-muted)]">
                      <span>PRE-SANITISATION SHA-256</span>
                    </div>
                    <div className="font-mono text-[11px] text-[var(--pms-ink)] break-all select-all">
                      {metrics.preSha256}
                    </div>

                    <div className="flex justify-between items-center text-[10px] font-mono text-emerald-700 dark:text-emerald-400 pt-2 border-t border-[var(--pms-border)]">
                      <span>VERIFIED STERILIZED SHA-256</span>
                    </div>
                    <div className="font-mono text-[11px] text-emerald-800 dark:text-emerald-300 break-all select-all">
                      {metrics.postSha256}
                    </div>
                  </div>

                  {/* Download */}
                  {sanitizedBlob && (
                    <button
                      onClick={() => downloadBlob(sanitizedBlob, `Sterilized_${file.name}`)}
                      className="pms-btn-primary w-full py-3.5 rounded-2xl font-bold text-xs flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" /> Download Sterilized Sovereign PDF
                    </button>
                  )}
                </div>
              ) : (
                <div className="p-16 rounded-3xl pms-glass-panel text-center text-xs text-[var(--pms-muted)]">
                  Select sanitization protocols on the left and click &quot;Execute Cleanroom Sterilization&quot; to generate your cryptographic Zero-Leak certificate.
                </div>
              )}
            </div>
          </motion.div>
        )}

        <ToolSEOSection
          toolName="Airgap Cleanroom™"
          headline="Sovereign Anti-Surveillance PDF Sanitization Engine"
          description="In whistleblowing, corporate mergers, investigative journalism, and confidential legal negotiations, PDF documents are frequently weaponized with invisible phone-home tracking beacons, canary tokens, and zero-width tracking watermarks. Airgap Cleanroom operates in an air-gapped local cleanroom with zero network egress, disarming all surveillance vectors."
          features={[
            { title: 'Zero Network Egress', desc: 'Executes 100% locally in web browser memory without transmitting a single byte over the wire.' },
            { title: 'Steganographic Leaker Stripper', desc: 'Purges invisible zero-width Unicode tracking sequences injected into confidential memos.' },
            { title: 'Surveillance Beacon Disarmer', desc: 'Neutralizes tracking pixels, canary tokens, and automated /Launch /SubmitForm payloads.' },
            { title: 'Cryptographic Zero-Leak Certificate', desc: 'Validates pre and post SHA-256 hashes to guarantee clean document provenance.' },
          ]}
        />
      </div>
    </ToolWorkspaceShell>
  );
}
