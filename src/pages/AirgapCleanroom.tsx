import React, { useState } from 'react';
import {
  ShieldCheck,
  WifiOff,
  Download,
  Fingerprint,
  RefreshCw,
  AlertTriangle,
  FileJson,
  Lock,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import FileDropzone from '../components/FileDropzone';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';
import ToolSEOSection from '../components/ToolSEOSection';
import { downloadBlob } from '../lib/utils';
import { executeCleanroomSanitization, type CleanroomResult } from '../lib/pdfCleanroom';

export default function AirgapCleanroom() {
  useSEO(
    'Airgap Cleanroom™ — Deep Anti-Surveillance PDF Sanitizer | PDF Media Suite',
    'Strip tracking pixels, hidden canary URLs, decompressed stream zero-width stego, embedded JPEG EXIF/GPS camera headers, JavaScript payloads, and incremental ghost revisions — 100% air-gapped in-browser.'
  );

  usePageSEO(
    'Airgap Cleanroom™ — Sovereign Anti-Surveillance PDF Sanitizer',
    'Removes invisible canary beacons, JPEG EXIF GPS tags, compressed stream zero-width leaker watermarks, JS payloads, and PDF ghost revisions with 0 bytes network egress.',
    'anti spy pdf sanitizer, remove exif from pdf images, remove canary token pdf, strip zero width steganography pdf, remove printer tracking dots pdf',
    '/airgap-cleanroom'
  );

  const [file, setFile] = useState<File | null>(null);
  const [isSanitizing, setIsSanitizing] = useState(false);
  const [result, setResult] = useState<CleanroomResult | null>(null);

  const [mode, setMode] = useState<'structural' | 'paranoid_raster'>('structural');
  const [stripZeroWidth, setStripZeroWidth] = useState(true);
  const [stripBeacons, setStripBeacons] = useState(true);
  const [stripAllUris, setStripAllUris] = useState(true);
  const [stripExifImages, setStripExifImages] = useState(true);
  const [stripMetadata, setStripMetadata] = useState(true);
  const [stripJsActions, setStripJsActions] = useState(true);
  const [stripAttachments, setStripAttachments] = useState(true);
  const [suppressPrinterDots, setSuppressPrinterDots] = useState(true);
  const prefersReduced = useReducedMotion();

  const handleFileUpload = (selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf' && !/\.pdf$/i.test(selectedFile.name)) {
      alert('Please upload a PDF document.');
      return;
    }
    setFile(selectedFile);
    setResult(null);
  };

  const handleExecuteSanitize = async () => {
    if (!file) return;
    setIsSanitizing(true);

    try {
      const rawBytes = await file.arrayBuffer();
      const res = await executeCleanroomSanitization(rawBytes, {
        mode,
        stripZeroWidth,
        stripBeacons,
        stripAllUris,
        stripExifImages,
        stripMetadata,
        stripJsActions,
        stripAttachments,
        suppressPrinterDots,
      });
      setResult(res);
    } catch (err: any) {
      console.error(err);
      alert('Sanitization failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSanitizing(false);
    }
  };

  const handleExportAuditJson = () => {
    if (!result || !file) return;
    const cert = {
      tool: 'PDF Media Suite - Airgap Cleanroom™',
      filename: file.name,
      mode,
      sanitizedAt: result.timestamp,
      networkRequestsDuringSanitization: result.networkRequestsDuringRun,
      preSha256: result.preSha256,
      postSha256: result.postSha256,
      counts: {
        beaconsRemoved: result.beaconsRemoved,
        zeroWidthCharsStripped: result.zeroWidthCharsStripped,
        exifSegmentsStripped: result.exifSegmentsStripped,
        metadataFieldsScrubbed: result.metadataFieldsScrubbed,
        javascriptActionsRemoved: result.javascriptActionsRemoved,
        attachmentsRemoved: result.attachmentsRemoved,
        ghostObjectsPurged: result.ghostObjectsPurged,
        printerDotsSuppressed: result.printerDotsSuppressed,
      },
      independentPostCleanVerification: result.verification,
      findings: result.auditFindings,
    };
    downloadBlob(
      new Blob([JSON.stringify(cert, null, 2)], { type: 'application/json' }),
      `Cleanroom_Certificate_${file.name.replace(/\.pdf$/i, '')}.json`
    );
  };

  return (
    <ToolWorkspaceShell
      title="Airgap Cleanroom™"
      subtitle="100% browser-airgapped sovereign sanitizer. Decompresses content streams to strip stego watermarks, strips lossless JPEG EXIF/GPS tags, disarms JS & canary URIs, burns incremental ghost history, and self-verifies the output."
      categoryLabel="Sovereign Air-Gap Cleanroom • Zero Network Egress"
      icon={WifiOff}
      microVariant="security"
      tone="emerald"
      trustNote="Zero bytes leave your device • Stream + JPEG EXIF Scrub • Independent Output Self-Audit"
    >
      <div className="w-full max-w-6xl mx-auto space-y-8">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-2xl pms-glass-panel text-xs font-mono text-emerald-700 dark:text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Air-Gap Engine: 100% In-Browser WebCrypto + Binary Streams
          </div>
          {file && (
            <button
              onClick={() => {
                setFile(null);
                setResult(null);
              }}
              className="px-3.5 py-1.5 rounded-xl border border-[var(--pms-border)] text-xs font-bold cursor-pointer"
              style={{ color: 'var(--pms-ink)' }}
            >
              Scrub Another File
            </button>
          )}
        </div>

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
              subtitle="Even with Wi-Fi disconnected, scrubs hidden stream Unicode, JPEG EXIF/GPS camera traces, canary links, JS payloads, and incremental history."
            />
          </motion.div>
        )}

        {file && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.24 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
          >
            {/* Left 5 Cols */}
            <div className="lg:col-span-5 space-y-6">
              <div className="p-6 rounded-3xl pms-glass-panel space-y-5 relative overflow-hidden">
                <PearlScanOverlay active={isSanitizing} label="Scrubbing streams, EXIF segments & rebuilding object graph..." />

                <div className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] flex items-center gap-1.5">
                  <Fingerprint className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Cleanroom Sterilization Mode
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMode('structural')}
                    className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
                      mode === 'structural'
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-900 dark:text-emerald-100'
                        : 'bg-white/50 dark:bg-slate-900/50 border-[var(--pms-border)] text-[var(--pms-muted)]'
                    }`}
                  >
                    <div className="text-xs font-extrabold">Structural Scrub</div>
                    <div className="text-[10px] mt-0.5 opacity-80">Lossless text + JPEG EXIF &amp; stream scrub</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('paranoid_raster')}
                    className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
                      mode === 'paranoid_raster'
                        ? 'bg-rose-500/15 border-rose-500 text-rose-900 dark:text-rose-100'
                        : 'bg-white/50 dark:bg-slate-900/50 border-[var(--pms-border)] text-[var(--pms-muted)]'
                    }`}
                  >
                    <div className="text-xs font-extrabold">Paranoid Flatten</div>
                    <div className="text-[10px] mt-0.5 opacity-80">Pixel rebuild + Printer Dot Neutralizer</div>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {mode === 'structural' ? (
                    <>
                      <label className="flex items-center justify-between p-3 rounded-2xl bg-white/60 dark:bg-slate-900/65 border border-[var(--pms-border)] cursor-pointer">
                        <div>
                          <span className="text-xs font-bold text-[var(--pms-ink)] block">Stream + Text Zero-Width Stego</span>
                          <span className="text-[10px] text-[var(--pms-muted)]">Decompresses FlateDecode streams &amp; strips U+200B/Tag chars</span>
                        </div>
                        <input type="checkbox" checked={stripZeroWidth} onChange={(e) => setStripZeroWidth(e.target.checked)} className="accent-emerald-500 w-4 h-4" />
                      </label>

                      <label className="flex items-center justify-between p-3 rounded-2xl bg-white/60 dark:bg-slate-900/65 border border-[var(--pms-border)] cursor-pointer">
                        <div>
                          <span className="text-xs font-bold text-[var(--pms-ink)] block">Lossless JPEG EXIF / GPS Scrub</span>
                          <span className="text-[10px] text-[var(--pms-muted)]">Strips APP1-APP15 camera serials, GPS &amp; Photoshop headers</span>
                        </div>
                        <input type="checkbox" checked={stripExifImages} onChange={(e) => setStripExifImages(e.target.checked)} className="accent-emerald-500 w-4 h-4" />
                      </label>

                      <label className="flex items-center justify-between p-3 rounded-2xl bg-white/60 dark:bg-slate-900/65 border border-[var(--pms-border)] cursor-pointer">
                        <div>
                          <span className="text-xs font-bold text-[var(--pms-ink)] block">Neutralize Remote URIs &amp; Beacons</span>
                          <span className="text-[10px] text-[var(--pms-muted)]">Strips /SubmitForm, /Launch, /GoToR &amp; canary URIs</span>
                        </div>
                        <input type="checkbox" checked={stripBeacons} onChange={(e) => setStripBeacons(e.target.checked)} className="accent-emerald-500 w-4 h-4" />
                      </label>

                      {stripBeacons && (
                        <label className="flex items-center justify-between pl-5 pr-3 py-2 rounded-xl bg-emerald-500/8 border border-emerald-500/20 cursor-pointer">
                          <span className="text-[11px] font-bold text-[var(--pms-ink)]">Block ALL external URLs (incl. non-canary links)</span>
                          <input type="checkbox" checked={stripAllUris} onChange={(e) => setStripAllUris(e.target.checked)} className="accent-emerald-500 w-3.5 h-3.5" />
                        </label>
                      )}

                      <label className="flex items-center justify-between p-3 rounded-2xl bg-white/60 dark:bg-slate-900/65 border border-[var(--pms-border)] cursor-pointer">
                        <div>
                          <span className="text-xs font-bold text-[var(--pms-ink)] block">Purge JS, XFA, Attachments &amp; Metadata</span>
                          <span className="text-[10px] text-[var(--pms-muted)]">Deletes /OpenAction, /AA, /EmbeddedFiles, XMP &amp; ghost revisions</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={stripJsActions && stripMetadata && stripAttachments}
                          onChange={(e) => {
                            const v = e.target.checked;
                            setStripJsActions(v);
                            setStripMetadata(v);
                            setStripAttachments(v);
                          }}
                          className="accent-emerald-500 w-4 h-4"
                        />
                      </label>
                    </>
                  ) : (
                    <label className="flex items-center justify-between p-3.5 rounded-2xl bg-white/60 dark:bg-slate-900/65 border border-[var(--pms-border)] cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-[var(--pms-ink)] block">Neutralize Printer MIC Yellow Dots &amp; LSB Noise</span>
                        <span className="text-[10px] text-[var(--pms-muted)]">Reconstructs pure pixel pages &amp; bleaches printer tracking micro-dots</span>
                      </div>
                      <input type="checkbox" checked={suppressPrinterDots} onChange={(e) => setSuppressPrinterDots(e.target.checked)} className="accent-rose-500 w-4 h-4" />
                    </label>
                  )}
                </div>

                <button
                  onClick={handleExecuteSanitize}
                  disabled={isSanitizing}
                  className="pms-btn-primary w-full py-3.5 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isSanitizing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Running Deep Cleanroom Sterilization...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" /> Execute Cleanroom Sterilization
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right 7 Cols */}
            <div className="lg:col-span-7 space-y-6">
              {result ? (
                <div className="p-6 rounded-3xl pms-glass-panel border border-emerald-500/40 space-y-5">
                  <div className="flex items-center justify-between border-b border-[var(--pms-border)] pb-4 flex-wrap gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-mono font-bold text-emerald-600 dark:text-emerald-400 tracking-widest block">
                        Zero-Egress Verification Certificate • {result.networkRequestsDuringRun} Network Requests During Scrub
                      </span>
                      <h3 className="text-xl font-black text-[var(--pms-ink)] flex items-center gap-2">
                        {result.verification.cleanVerified ? 'SOVEREIGN CLEANROOM VERIFIED' : 'SANITIZATION COMPLETE (REVIEW LOG)'}
                      </h3>
                    </div>
                    <span
                      className={`text-[11px] font-mono font-bold px-3 py-1 rounded-full flex items-center gap-1 ${
                        result.verification.cleanVerified
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/35'
                          : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/35'
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Re-Audit: JS={result.verification.remainingJs} · Beacons={result.verification.remainingBeacons} · Rev={result.verification.xrefRevisions}
                    </span>
                  </div>

                  {/* Expanded Telemetry Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-2xl bg-white/65 dark:bg-slate-900/65 border border-[var(--pms-border)]">
                      <span className="text-[10px] text-[var(--pms-muted)] block">Beacons / External URIs</span>
                      <span className="text-base font-black text-[var(--pms-ink)]">
                        <AnimatedNumber value={result.beaconsRemoved} suffix=" Purged" />
                      </span>
                    </div>
                    <div className="p-3 rounded-2xl bg-white/65 dark:bg-slate-900/65 border border-[var(--pms-border)]">
                      <span className="text-[10px] text-[var(--pms-muted)] block">Zero-Width Stego</span>
                      <span className="text-base font-black text-[var(--pms-ink)]">
                        <AnimatedNumber value={result.zeroWidthCharsStripped} suffix=" Stripped" />
                      </span>
                    </div>
                    <div className="p-3 rounded-2xl bg-white/65 dark:bg-slate-900/65 border border-[var(--pms-border)]">
                      <span className="text-[10px] text-[var(--pms-muted)] block">JPEG EXIF / GPS Segments</span>
                      <span className="text-base font-black text-[var(--pms-ink)]">
                        <AnimatedNumber value={result.exifSegmentsStripped} suffix=" Scrubbed" />
                      </span>
                    </div>
                    <div className="p-3 rounded-2xl bg-white/65 dark:bg-slate-900/65 border border-[var(--pms-border)]">
                      <span className="text-[10px] text-[var(--pms-muted)] block">JS Triggers Disarmed</span>
                      <span className="text-base font-black text-[var(--pms-ink)]">
                        <AnimatedNumber value={result.javascriptActionsRemoved} suffix=" Disarmed" />
                      </span>
                    </div>
                    <div className="p-3 rounded-2xl bg-white/65 dark:bg-slate-900/65 border border-[var(--pms-border)]">
                      <span className="text-[10px] text-[var(--pms-muted)] block">Ghost Revisions / Attach</span>
                      <span className="text-base font-black text-[var(--pms-ink)]">
                        <AnimatedNumber value={result.ghostObjectsPurged + result.attachmentsRemoved} suffix=" Burned" />
                      </span>
                    </div>
                    <div className="p-3 rounded-2xl bg-white/65 dark:bg-slate-900/65 border border-[var(--pms-border)]">
                      <span className="text-[10px] text-[var(--pms-muted)] block">Meta / Printer Dots</span>
                      <span className="text-base font-black text-[var(--pms-ink)]">
                        {mode === 'paranoid_raster'
                          ? `${result.printerDotsSuppressed.toLocaleString()} Dots`
                          : `${result.metadataFieldsScrubbed} Tags`}
                      </span>
                    </div>
                  </div>

                  {/* Audit Findings Feed */}
                  {result.auditFindings.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--pms-muted)] block">
                        Extracted Forensic Audit Ledger ({result.auditFindings.length})
                      </span>
                      <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                        {result.auditFindings.map((f, idx) => (
                          <div key={idx} className="p-2.5 rounded-xl bg-white/70 dark:bg-slate-950/75 border border-[var(--pms-border)] text-[11px] flex items-start gap-2">
                            <AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${f.severity === 'CRITICAL' ? 'text-rose-500' : 'text-amber-500'}`} />
                            <div className="min-w-0 break-all">
                              <span className="font-mono font-bold text-[10px] mr-1.5 text-emerald-700 dark:text-emerald-400">[{f.category}]</span>
                              <span style={{ color: 'var(--pms-ink)' }}>{f.detail}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* SHA-256 Digest Comparison */}
                  <div className="p-4 rounded-2xl bg-white/65 dark:bg-slate-950/70 border border-[var(--pms-border)] space-y-2 text-xs">
                    <div className="text-[10px] font-mono text-[var(--pms-muted)]">PRE-SANITIZATION SHA-256</div>
                    <div className="font-mono text-[11px] text-[var(--pms-ink)] break-all select-all">{result.preSha256}</div>
                    <div className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 pt-2 border-t border-[var(--pms-border)]">
                      VERIFIED STERILIZED SHA-256
                    </div>
                    <div className="font-mono text-[11px] text-emerald-800 dark:text-emerald-300 break-all select-all">{result.postSha256}</div>
                  </div>

                  {/* Download Actions */}
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => downloadBlob(result.blob, `Sterilized_${file.name}`)}
                      className="pms-btn-primary flex-1 py-3.5 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Download className="w-4 h-4" /> Download Sterilized PDF
                    </button>
                    <button
                      onClick={handleExportAuditJson}
                      className="px-4 py-3.5 rounded-2xl border border-[var(--pms-border)] font-bold text-xs flex items-center gap-1.5 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                      style={{ color: 'var(--pms-ink)' }}
                    >
                      <FileJson className="w-4 h-4 text-emerald-600" /> Audit Proof JSON
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-16 rounded-3xl pms-glass-panel text-center text-xs text-[var(--pms-muted)]">
                  Select Structural Scrub (lossless text + JPEG EXIF + FlateDecode stream stego removal) or Paranoid Flatten on the left, then click &quot;Execute Cleanroom Sterilization&quot;.
                </div>
              )}
            </div>
          </motion.div>
        )}

        <ToolSEOSection
          toolName="Airgap Cleanroom™"
          headline="Zero-Egress Deep Binary Cleanroom & EXIF/Stego Purger"
          description="Unlike shallow sanitizers that only clear Author tags, Airgap Cleanroom decompresses PDF content streams inside your browser to strip invisible Unicode steganographic watermarks, scrubs APP1-APP15 EXIF/GPS camera headers losslessly from embedded JPEGs, deletes JavaScript/XFA/attachments and external URIs, eliminates deleted PDF ghost objects via full graph rebuild, and verifies the clean output independently."
          features={[
            { title: 'Zero Network Egress Verified', desc: 'Monitors PerformanceResourceTiming and transmits 0 bytes over any network.' },
            { title: 'Decompressed Stream Stego Scrub', desc: 'Decompresses FlateDecode streams in-browser to strip zero-width & Unicode tag watermarks.' },
            { title: 'Lossless JPEG EXIF / GPS Scrubber', desc: 'Deletes camera serials, Photoshop XMP, and GPS segments without recompressing photos.' },
            { title: 'Paranoid Printer-Dot Neutralizer', desc: 'Optional canvas flattening neutralizes faint printer MIC yellow tracking micro-dots.' },
          ]}
        />
      </div>
    </ToolWorkspaceShell>
  );
}
