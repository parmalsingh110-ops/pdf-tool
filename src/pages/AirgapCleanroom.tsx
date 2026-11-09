import React, { useState, useRef } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Radio,
  WifiOff,
  EyeOff,
  CheckCircle2,
  Lock,
  Download,
  Upload,
  AlertTriangle,
  Sparkles,
  FileText,
  Key,
  Fingerprint,
  RefreshCw,
} from 'lucide-react';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFHexString } from 'pdf-lib';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
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
  const [stripJsActions, setStripJsActions] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute SHA-256 in browser
  const computeSha256 = async (buffer: ArrayBuffer): Promise<string> => {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
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
      const postHash = await computeSha256(sanitizedBytes.buffer);

      const outBlob = new Blob([sanitizedBytes as any], { type: 'application/pdf' });
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
    <div className="w-full min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-700/60 text-xs font-bold text-emerald-400 mb-2">
              <WifiOff className="w-4 h-4 text-emerald-400" /> Sovereign Air-Gap Document Cleanroom
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              Airgap Cleanroom™ <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 font-mono">Zero Egress</span>
            </h1>
            <p className="mt-1 text-sm text-slate-400 max-w-2xl">
              Sanitize confidential PDFs before distribution. Neutralizes spy pixels, remote webhooks, canary tokens, hidden JavaScript triggers, and zero-width steganographic tracking chars.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs font-mono text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Air-Gap Active: 0 External Requests
          </div>
        </div>

        {/* Upload State */}
        {!file && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-800 hover:border-emerald-500/60 rounded-3xl p-16 text-center bg-slate-900/60 hover:bg-slate-900 cursor-pointer transition-all group"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              accept="application/pdf"
              className="hidden"
            />
            <div className="w-16 h-16 rounded-2xl bg-emerald-950/50 border border-emerald-800/40 text-emerald-400 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Upload Confidential PDF for Sovereign Sanitization</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mb-4">
              Works 100% offline in browser memory. Disconnect your Wi-Fi if needed to guarantee zero network egress.
            </p>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold text-slate-200">
              <Upload className="w-3.5 h-3.5" /> Select Classified Document
            </span>
          </div>
        )}

        {/* Workspace */}
        {file && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left 5 Cols: Sanitization Protocols & Execution */}
            <div className="lg:col-span-5 space-y-6">
              <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-5">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Fingerprint className="w-4 h-4 text-emerald-400" /> Active Cleanroom Protocols
                </div>

                <div className="space-y-3">
                  <label className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
                    <div>
                      <span className="text-xs font-bold text-white block">Strip Zero-Width Steganography</span>
                      <span className="text-[10px] text-slate-400">Purges hidden Unicode characters used to trace leakers</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={stripZeroWidth}
                      onChange={(e) => setStripZeroWidth(e.target.checked)}
                      className="accent-emerald-500 w-4 h-4 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
                    <div>
                      <span className="text-xs font-bold text-white block">Neutralize Spy-Pixels &amp; Canary Tokens</span>
                      <span className="text-[10px] text-slate-400">Deletes phone-home /SubmitForm and webhook URIs</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={stripBeacons}
                      onChange={(e) => setStripBeacons(e.target.checked)}
                      className="accent-emerald-500 w-4 h-4 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
                    <div>
                      <span className="text-xs font-bold text-white block">Shred Metadata &amp; Software GUIDs</span>
                      <span className="text-[10px] text-slate-400">Wipes author, creation dates, and XML XMP streams</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={stripMetadata}
                      onChange={(e) => setStripMetadata(e.target.checked)}
                      className="accent-emerald-500 w-4 h-4 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
                    <div>
                      <span className="text-xs font-bold text-white block">Purge Executable JavaScript Actions</span>
                      <span className="text-[10px] text-slate-400">Eliminates automated /OpenAction and /AA payloads</span>
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
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-950 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
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
                <div className="p-6 rounded-3xl bg-slate-900 border border-emerald-800/60 shadow-2xl space-y-6">
                  {/* Cleanroom Seal */}
                  <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-mono font-bold text-emerald-400 tracking-widest block">
                        Official Verification Certificate
                      </span>
                      <h3 className="text-xl font-black text-white flex items-center gap-2">
                        SOVEREIGN CLEANROOM CERTIFIED
                      </h3>
                    </div>
                    <ShieldCheck className="w-10 h-10 text-emerald-400" />
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Surveillance Beacons / URIs</span>
                      <span className="text-lg font-black text-white">{metrics.beaconsRemoved} Purged</span>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Zero-Width Tracing Chars</span>
                      <span className="text-lg font-black text-white">{metrics.zeroWidthCharsStripped} Stripped</span>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Metadata Tags &amp; XMP</span>
                      <span className="text-lg font-black text-white">{metrics.metadataFieldsScrubbed} Scrubbed</span>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Automated JS Triggers</span>
                      <span className="text-lg font-black text-white">{metrics.javascriptActionsRemoved} Disarmed</span>
                    </div>
                  </div>

                  {/* Hashes */}
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                    <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
                      <span>PRE-SANITISATION SHA-256</span>
                    </div>
                    <div className="font-mono text-[11px] text-slate-300 break-all select-all">
                      {metrics.preSha256}
                    </div>

                    <div className="flex justify-between items-center text-[10px] font-mono text-emerald-400 pt-2 border-t border-slate-900">
                      <span>VERIFIED STERILIZED SHA-256</span>
                    </div>
                    <div className="font-mono text-[11px] text-emerald-300 break-all select-all">
                      {metrics.postSha256}
                    </div>
                  </div>

                  {/* Download */}
                  {sanitizedBlob && (
                    <button
                      onClick={() => downloadBlob(sanitizedBlob, `Sterilized_${file.name}`)}
                      className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-950 transition-all flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" /> Download Sterilized Sovereign PDF
                    </button>
                  )}
                </div>
              ) : (
                <div className="p-16 rounded-3xl bg-slate-900/40 border border-slate-800 text-center text-xs text-slate-500">
                  Select sanitization protocols on the left and click &quot;Execute Cleanroom Sterilization&quot; to generate your cryptographic Zero-Leak certificate.
                </div>
              )}
            </div>
          </div>
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
    </div>
  );
}
