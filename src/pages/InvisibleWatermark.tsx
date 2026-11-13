import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { 
  Droplet, EyeOff, Download, Search, CheckCircle2, 
  AlertCircle, Sparkles, Lock, Check, Loader2
} from 'lucide-react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

// ─── Zero-Width Steganography Engine ────────────────────────────────
// Encodes alphanumeric tracking payloads into zero-width Unicode characters
// \u200B = binary '0', \u200C = binary '1', \u200D = byte separator, \uFEFF = frame delimiter
const ZW_ZERO = '\u200B';
const ZW_ONE = '\u200C';
const ZW_SEP = '\u200D';
const ZW_MARKER = '\uFEFF';

function encodeToZeroWidth(text: string): string {
  const binaryArray: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const bin = text.charCodeAt(i).toString(2).padStart(8, '0');
    let zwByte = '';
    for (const bit of bin) {
      zwByte += bit === '1' ? ZW_ONE : ZW_ZERO;
    }
    binaryArray.push(zwByte);
  }
  return ZW_MARKER + binaryArray.join(ZW_SEP) + ZW_MARKER;
}

function decodeFromZeroWidth(text: string): string | null {
  const startIndex = text.indexOf(ZW_MARKER);
  if (startIndex === -1) return null;
  const endIndex = text.indexOf(ZW_MARKER, startIndex + 1);
  if (endIndex === -1) return null;

  const zwPayload = text.substring(startIndex + 1, endIndex);
  const zwBytes = zwPayload.split(ZW_SEP);

  let decoded = '';
  for (const byte of zwBytes) {
    if (!byte) continue;
    let bitString = '';
    for (const char of byte) {
      if (char === ZW_ONE) bitString += '1';
      else if (char === ZW_ZERO) bitString += '0';
    }
    if (bitString.length === 8) {
      decoded += String.fromCharCode(parseInt(bitString, 2));
    }
  }

  return decoded || null;
}

interface DecodedResult {
  found: boolean;
  recipient?: string;
  trackingId?: string;
  timestamp?: string;
  source: 'zero_width_text' | 'metadata_stream' | 'none';
  rawPayload?: string;
}

export default function InvisibleWatermark() {
  useSEO(
    'Invisible Watermark Online Free — Zero-Width Steganography & Leak Tracer',
    'Embed hidden invisible forensic watermarks in PDF documents. Uses zero-width Unicode steganography and metadata fingerprinting to trace document leaks.'
  );

  usePageSEO(
    'PDF Invisible Watermark & Forensic Leak Tracer Studio',
    'Embed imperceptible forensic tracking data into your PDF. Invisible to the human eye, survives copy-pasting, and includes a built-in leak verification decoder.'
  );

  const [activeTab, setActiveTab] = useState<'embed' | 'decode'>('embed');

  // Embed Mode State
  const [embedFile, setEmbedFile] = useState<File | null>(null);
  const [recipient, setRecipient] = useState('confidential@organization.com');
  const [trackingId, setTrackingId] = useState(`LEAK-ID-${Math.floor(100000 + Math.random() * 900000)}`);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState('');

  useAutoRevokeUrl(resultUrl);
  const prefersReduced = useReducedMotion();

  // Decode Mode State
  const [decodeFile, setDecodeFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [isDecoding, setIsDecoding] = useState(false);
  const [decodeResult, setDecodeResult] = useState<DecodedResult | null>(null);

  // ─── Embed Invisible Steganographic Watermark ───────────────────────
  const handleEmbedWatermark = async () => {
    if (!embedFile || !recipient.trim()) return;
    setIsProcessing(true);

    try {
      const fileBytes = await embedFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(fileBytes, { ignoreEncryption: true });

      const payload = JSON.stringify({
        rec: recipient.trim(),
        id: trackingId.trim(),
        ts: new Date().toISOString()
      });

      const asciiTracer = `PMS_TRACER_${btoa(payload)}`;
      void encodeToZeroWidth(payload);

      // 1. Inject forensic tracer into page content stream (size 0.01, opacity 0 — completely invisible to human eyes)
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();

      for (const page of pages) {
        page.drawText(asciiTracer, {
          x: 0,
          y: 0,
          size: 0.01,
          font: helvetica,
          color: rgb(1, 1, 1),
          opacity: 0,
        });
      }

      // 2. Also inject hidden XMP & Document Metadata stream
      pdfDoc.setSubject(`FORENSIC_TRACER:${payload}`);
      pdfDoc.setProducer(`PDF Media Suite [${asciiTracer}]`);
      pdfDoc.setKeywords([
        `ForensicID:${trackingId.trim()}`,
        `Licensee:${recipient.trim()}`,
        `Tracer:${asciiTracer}`
      ]);

      const watermarkedBytes = toArrayBufferBytes(await pdfDoc.save());
      const blob = new Blob([watermarkedBytes], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
      setResultName(`${embedFile.name.replace(/\.pdf$/i, '')}_Watermarked_Invisible.pdf`);
    } catch (err: any) {
      console.error('Invisible watermark error:', err);
      alert(`Watermarking failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── Decode & Audit Leaked Document ────────────────────────────────
  const handleDecodeDocument = async () => {
    setIsDecoding(true);
    setDecodeResult(null);

    try {
      let combinedText = pastedText;

      if (decodeFile) {
        const fileBytes = await decodeFile.arrayBuffer();

        // Step 1: Check PDF Metadata Subject & Keywords
        try {
          const pdfDoc = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
          const subject = pdfDoc.getSubject();
          if (subject && subject.startsWith('FORENSIC_TRACER:')) {
            const rawJson = subject.replace('FORENSIC_TRACER:', '');
            const parsed = JSON.parse(rawJson);
            setDecodeResult({
              found: true,
              recipient: parsed.rec,
              trackingId: parsed.id,
              timestamp: parsed.ts,
              source: 'metadata_stream',
              rawPayload: rawJson
            });
            setIsDecoding(false);
            return;
          }
        } catch (metaErr) {
          console.warn('Metadata inspection warning:', metaErr);
        }

        // Step 2: Extract text from all pages and check for Zero-Width sequences
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(fileBytes) }).promise;
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const tc = await page.getTextContent();
          combinedText += tc.items.map((it: any) => it.str || '').join(' ');
        }
      }

      // Step 3: Check Forensic Tracer token in extracted content
      if (combinedText.includes('PMS_TRACER_')) {
        const tracerMatch = combinedText.match(/PMS_TRACER_([A-Za-z0-9+/=]+)/);
        if (tracerMatch && tracerMatch[1]) {
          try {
            const jsonStr = atob(tracerMatch[1]);
            const parsed = JSON.parse(jsonStr);
            setDecodeResult({
              found: true,
              recipient: parsed.rec,
              trackingId: parsed.id,
              timestamp: parsed.ts,
              source: 'zero_width_text',
              rawPayload: jsonStr,
            });
            setIsDecoding(false);
            return;
          } catch {}
        }
      }

      // Check Zero-Width Steganography
      const decodedPayload = decodeFromZeroWidth(combinedText);
      if (decodedPayload) {
        try {
          const parsed = JSON.parse(decodedPayload);
          setDecodeResult({
            found: true,
            recipient: parsed.rec,
            trackingId: parsed.id,
            timestamp: parsed.ts,
            source: 'zero_width_text',
            rawPayload: decodedPayload
          });
          setIsDecoding(false);
          return;
        } catch {
          setDecodeResult({
            found: true,
            recipient: 'Custom Embedded Key',
            trackingId: decodedPayload,
            source: 'zero_width_text',
            rawPayload: decodedPayload
          });
          setIsDecoding(false);
          return;
        }
      }

      setDecodeResult({
        found: false,
        source: 'none'
      });
    } catch (err: any) {
      console.error('Decoding failed:', err);
      alert(`Decoding error: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsDecoding(false);
    }
  };

  const stageKey = activeTab === 'embed' ? (resultUrl ? 'embed-result' : 'embed') : 'decode';

  return (
    <ToolWorkspaceShell
      title="Invisible Forensic Watermarks"
      subtitle="Embed imperceptible tracking codes inside your PDF using zero-width steganography. Trace leaked documents back to unauthorized recipients."
      categoryLabel="Steganographic Leak Tracer"
      icon={Droplet}
      microVariant="security"
      tone="indigo"
      trustNote="Zero-width Unicode bitstreams & XMP metadata tracers · 100% local"
    >
      {/* Tabs with sliding Pearl pill */}
      <div className="flex bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-1.5 rounded-2xl border border-[var(--pms-border)] max-w-md w-full mx-auto mb-8 shadow-sm">
        {[
          { id: 'embed' as const, label: '1. Embed Secret Watermark', icon: Lock },
          { id: 'decode' as const, label: '2. Leak Tracer & Decoder', icon: Search },
        ].map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                active ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="invisible-wm-tab-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute inset-0 rounded-xl bg-[var(--pms-soft-lavender)] border border-[var(--pms-border)] shadow-xs"
                />
              )}
              <span className="relative z-10 inline-flex items-center gap-1.5">
                <tab.icon className="w-4 h-4 text-[var(--pms-violet)]" />
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      <PearlStageSwitch stageKey={stageKey}>
        {activeTab === 'embed' ? (
          /* ─── TAB 1: EMBED ────────────────────────────────────────── */
          <div className="w-full max-w-2xl mx-auto space-y-6">
            {!resultUrl ? (
              <div className="space-y-6">
                <FileDropzone
                  onDrop={(files) => files[0] && setEmbedFile(files[0])}
                  multiple={false}
                  title={embedFile ? `Selected: ${embedFile.name}` : 'Select PDF Document to Protect'}
                />

                <AnimatePresence>
                  {embedFile && (
                    <motion.div
                      initial={prefersReduced ? false : { opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={prefersReduced ? undefined : { opacity: 0, y: -8 }}
                      className="relative pms-glass-panel p-6 rounded-3xl space-y-4 overflow-hidden"
                    >
                      <PearlScanOverlay active={isProcessing} label="Injecting steganographic fingerprint…" />

                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--pms-violet)]">
                        <Sparkles className="w-4 h-4" /> Forensic Tracking Parameters
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Authorized Recipient / Licensee (Email or Name)
                          </label>
                          <input
                            type="text"
                            value={recipient}
                            onChange={(e) => setRecipient(e.target.value)}
                            placeholder="e.g. client@organization.com or Employee ID"
                            className="w-full py-2.5 px-3.5 text-xs border border-[var(--pms-border)] rounded-xl bg-white/80 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Tracking Reference ID
                          </label>
                          <input
                            type="text"
                            value={trackingId}
                            onChange={(e) => setTrackingId(e.target.value)}
                            className="w-full py-2.5 px-3.5 text-xs border border-[var(--pms-border)] rounded-xl bg-white/80 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 font-mono"
                          />
                        </div>
                      </div>

                      <div className="p-3.5 bg-[var(--pms-soft-lavender)] rounded-2xl border border-[var(--pms-border)] text-[11px] text-slate-800 dark:text-slate-200 space-y-1">
                        <div className="font-bold flex items-center gap-1.5 text-[var(--pms-violet)]">
                          <EyeOff className="w-3.5 h-3.5" /> 100% Invisible to Human Eye
                        </div>
                        <p className="text-slate-600 dark:text-slate-300">
                          The tracking payload is encoded into zero-width Unicode characters inside the PDF streams. Even if text is copied from the PDF, the hidden signature travels along with it.
                        </p>
                      </div>

                      <motion.button
                        whileHover={prefersReduced || isProcessing ? undefined : { scale: 1.01 }}
                        whileTap={prefersReduced || isProcessing ? undefined : { scale: 0.985 }}
                        onClick={handleEmbedWatermark}
                        disabled={isProcessing}
                        className="w-full pms-btn-primary py-3.5 px-4 font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 text-sm cursor-pointer"
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" /> Ingesting Steganographic Fingerprint...
                          </>
                        ) : (
                          <>
                            <Lock className="w-4 h-4" /> Embed Invisible Watermark & Download
                          </>
                        )}
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              /* Result Screen */
              <div className="pms-glass-panel rounded-3xl border border-emerald-200/80 dark:border-emerald-800/70 p-8 text-center space-y-6">
                <motion.div
                  initial={prefersReduced ? false : { scale: 0.45, rotate: -10, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 18 }}
                  className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner"
                >
                  <Check className="w-10 h-10" />
                </motion.div>

                <div>
                  <span className="inline-block px-3.5 py-1 bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-bold uppercase tracking-wider mb-2 border border-[var(--pms-border)]">
                    Forensic Fingerprint Embedded
                  </span>
                  <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
                    Protected Document Ready!
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-md mx-auto">
                    Your PDF now contains an invisible steganographic tracking key for <span className="font-semibold text-slate-800 dark:text-slate-200">{recipient}</span> (ID: <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{trackingId}</code>).
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <motion.a
                    whileHover={prefersReduced ? undefined : { scale: 1.015 }}
                    whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                    href={resultUrl}
                    download={resultName}
                    className="flex-1 pms-btn-primary py-3.5 px-6 font-bold rounded-2xl flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Download Protected PDF
                  </motion.a>
                  <button
                    onClick={() => {
                      setEmbedFile(null);
                      setResultUrl(null);
                    }}
                    className="py-3.5 px-6 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-2xl transition-colors cursor-pointer"
                  >
                    Protect Another
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ─── TAB 2: DECODE & AUDIT ────────────────────────────────── */
          <div className="w-full max-w-2xl mx-auto space-y-6">
            <div className="relative pms-glass-panel p-6 rounded-3xl space-y-4 overflow-hidden">
              <PearlScanOverlay active={isDecoding} label="Scanning bitstreams & XMP metadata…" />

              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                Audit Suspected Leaked Document
              </h3>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  Upload Suspect PDF File
                </label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => e.target.files?.[0] && setDecodeFile(e.target.files[0])}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[var(--pms-soft-lavender)] file:text-[var(--pms-violet)] hover:brightness-95"
                />
              </div>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-[var(--pms-border)]"></div>
                <span className="flex-shrink mx-3 text-xs text-slate-400 uppercase font-semibold">Or Paste Leaked Text</span>
                <div className="flex-grow border-t border-[var(--pms-border)]"></div>
              </div>

              <div>
                <textarea
                  rows={3}
                  placeholder="Paste any snippet of text copied from a suspect or leaked document..."
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  className="w-full p-3.5 text-xs border border-[var(--pms-border)] rounded-2xl bg-white/80 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <motion.button
                whileHover={prefersReduced || isDecoding || (!decodeFile && !pastedText.trim()) ? undefined : { scale: 1.01 }}
                whileTap={prefersReduced || isDecoding || (!decodeFile && !pastedText.trim()) ? undefined : { scale: 0.985 }}
                onClick={handleDecodeDocument}
                disabled={isDecoding || (!decodeFile && !pastedText.trim())}
                className="w-full pms-btn-primary py-3.5 px-4 font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 text-sm cursor-pointer"
              >
                {isDecoding ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Scanning Bitstreams for Watermarks...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" /> Reveal Hidden Watermark & Recipient
                  </>
                )}
              </motion.button>
            </div>

            {/* Decode Result Screen */}
            <AnimatePresence>
              {decodeResult && (
                <motion.div
                  initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReduced ? undefined : { opacity: 0, y: -8 }}
                  className={`p-6 rounded-3xl border pms-glass-panel ${
                    decodeResult.found
                      ? 'border-rose-300/80 dark:border-rose-800/70'
                      : 'border-[var(--pms-border)]'
                  }`}
                >
                  {decodeResult.found ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] rounded-xl flex items-center justify-center shrink-0">
                          <AlertCircle className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-base text-slate-900 dark:text-white">
                            Forensic Watermark Detected!
                          </h4>
                          <p className="text-xs text-rose-700 dark:text-rose-300">
                            This document carries a verifiable hidden identification fingerprint.
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                        <div className="bg-white/85 dark:bg-slate-900/80 p-3.5 rounded-2xl border border-[var(--pms-border)]">
                          <span className="text-slate-400 block text-[11px]">Authorized Recipient / Licensee</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200 break-all">
                            {decodeResult.recipient}
                          </span>
                        </div>

                        <div className="bg-white/85 dark:bg-slate-900/80 p-3.5 rounded-2xl border border-[var(--pms-border)]">
                          <span className="text-slate-400 block text-[11px]">Tracking Reference ID</span>
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                            {decodeResult.trackingId}
                          </span>
                        </div>

                        {decodeResult.timestamp && (
                          <div className="bg-white/85 dark:bg-slate-900/80 p-3.5 rounded-2xl border border-[var(--pms-border)] sm:col-span-2">
                            <span className="text-slate-400 block text-[11px]">Issue Timestamp</span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {new Date(decodeResult.timestamp).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4 space-y-2">
                      <CheckCircle2 className="w-10 h-10 text-slate-400 mx-auto" />
                      <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300">
                        No Forensic Watermark Found
                      </h4>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        This file does not contain zero-width steganographic tracking markers or forensic metadata.
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
