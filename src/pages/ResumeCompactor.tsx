import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Upload,
  Download,
  FileText,
  CheckCircle2,
  AlertCircle,
  Minimize2,
  Loader2,
} from 'lucide-react';
import { PDFDocument, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { downloadBlob } from '../lib/utils';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

type CompactionMode = 'smart_auto' | 'tight_margin' | 'extreme_single';

export default function ResumeCompactor() {
  useSEO(
    'Strict 1-Page Resume Compactor Online — Fit Resume to 1 Page Free',
    'Fit your 1.2 or 2-page resume strictly into exactly 1 page. Micro-adjust margins and scale without losing text. 100% ATS-friendly & private.'
  );

  usePageSEO(
    'Strict 1-Page Resume Compactor — Fit 2-Page CV into 1 Page',
    'Free online resume shrinking tool for college students and job seekers. Automatically scales and compresses overflowing resumes into a strict single page for campus placements.',
    'resume 1 page compactor, fit resume on 1 page, shrink cv to one page, resume page 2 overflow fix, campus placement 1 page resume converter',
    '/resume-compactor'
  );

  const [file, setFile] = useState<File | null>(null);
  const [origPageCount, setOrigPageCount] = useState<number>(0);
  const [compactionMode, setCompactionMode] = useState<CompactionMode>('smart_auto');
  const [marginScale, setMarginScale] = useState<number>(15); // pt
  const [contentScale, setContentScale] = useState<number>(90); // 75% - 100%
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processedPdfBlob, setProcessedPdfBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useAutoRevokeUrl(previewUrl);
  const prefersReduced = useReducedMotion();

  // Load PDF
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setIsProcessing(true);

    try {
      const arrayBuffer = await selected.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      const count = pdf.getPageCount();
      setOrigPageCount(count);

      // Auto-set optimal scaling based on page count
      if (count === 2) {
        setContentScale(88);
        setMarginScale(18);
      } else if (count >= 3) {
        setContentScale(76);
        setMarginScale(12);
      } else {
        setContentScale(95);
        setMarginScale(20);
      }

      setProcessedPdfBlob(null);
      setPreviewUrl(null);
    } catch {
      alert('Error reading PDF. Please ensure it is a valid document.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Perform 1-Page Compaction
  const handleCompact = async () => {
    if (!file) return;
    setIsProcessing(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const srcDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      const outDoc = await PDFDocument.create();

      const pageCount = srcDoc.getPageCount();
      // Standard A4: 595.28 × 841.89 pt
      const pageW = 595.28;
      const pageH = 841.89;

      const singlePage = outDoc.addPage([pageW, pageH]);

      if (pageCount === 1) {
        // Already 1 page: apply subtle margin optimization
        const [emb] = await outDoc.embedPdf(srcDoc, [0]);
        const scale = contentScale / 100;
        const drawW = Math.min(pageW - marginScale * 2, emb.width * scale);
        const drawH = Math.min(pageH - marginScale * 2, emb.height * scale);

        singlePage.drawPage(emb, {
          x: (pageW - drawW) / 2,
          y: (pageH - drawH) / 2,
          width: drawW,
          height: drawH,
        });
      } else {
        // Multi-page resume: Analyze text bounds to detect trailing lines on overflow pages
        let p2CropBottom = 0;
        let p2CropHeight = 0;
        let isP2Sparse = false;

        try {
          const srcPdfJs = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise;
          if (pageCount >= 2) {
            const p2Obj = await srcPdfJs.getPage(2);
            const tc2 = await p2Obj.getTextContent();
            const vp2 = p2Obj.getViewport({ scale: 1.0 });

            let p2MinY = vp2.height;
            let p2MaxY = 0;
            let p2HasText = false;

            for (const item of tc2.items as any[]) {
              if (item.str && item.str.trim().length > 0 && item.transform) {
                p2HasText = true;
                const ty = item.transform[5];
                if (ty < p2MinY) p2MinY = Math.max(0, ty);
                if (ty > p2MaxY) p2MaxY = Math.min(vp2.height, ty);
              }
            }

            if (p2HasText && p2MaxY > 0) {
              // The text on page 2 spans from p2MinY to p2MaxY
              // If p2MinY is high up (e.g. > 30% from bottom), the bottom portion is empty white space!
              const textSpanHeight = p2MaxY - p2MinY + 36;
              const emptyBottom = p2MinY - 18;
              if (emptyBottom > vp2.height * 0.25) {
                isP2Sparse = true;
                p2CropBottom = Math.max(0, emptyBottom);
                p2CropHeight = Math.min(vp2.height - p2CropBottom, textSpanHeight + 24);
              }
            }
          }
        } catch (scanErr) {
          console.warn('PDF.js text bounds detection fallback:', scanErr);
        }

        if (pageCount === 2 && (compactionMode === 'smart_auto' || compactionMode === 'tight_margin') && isP2Sparse && p2CropHeight > 0) {
          // Crop Page 2 to only its active content slice
          const p2 = srcDoc.getPage(1);
          p2.setCropBox(0, p2CropBottom, p2.getWidth(), p2CropHeight);

          // If smart_auto or tight_margin, also trim top/bottom empty margins of Page 1
          const p1 = srcDoc.getPage(0);
          const p1Trim = compactionMode === 'tight_margin' ? 24 : 16;
          const p1Height = Math.max(100, p1.getHeight() - p1Trim * 2);
          p1.setCropBox(0, p1Trim, p1.getWidth(), p1Height);

          const [emb1, emb2] = await outDoc.embedPdf(srcDoc, [0, 1]);

          const availH = pageH - marginScale * 2 - 12; // 12pt gap
          const totalContentH = emb1.height + emb2.height;
          const scale = Math.min(1.0, availH / totalContentH) * (contentScale / 100);

          const drawW1 = emb1.width * scale;
          const drawH1 = emb1.height * scale;
          const drawW2 = emb2.width * scale;
          const drawH2 = emb2.height * scale;

          const startY = pageH - marginScale;
          const y1 = startY - drawH1;
          const y2 = y1 - 12 - drawH2;

          singlePage.drawPage(emb1, {
            x: (pageW - drawW1) / 2,
            y: Math.max(marginScale, y1),
            width: drawW1,
            height: drawH1,
          });

          // Divider line between sections
          singlePage.drawLine({
            start: { x: marginScale + 30, y: y1 - 6 },
            end: { x: pageW - marginScale - 30, y: y1 - 6 },
            thickness: 0.5,
            color: rgb(0.85, 0.85, 0.88),
          });

          singlePage.drawPage(emb2, {
            x: (pageW - drawW2) / 2,
            y: Math.max(marginScale, y2),
            width: drawW2,
            height: drawH2,
          });
        } else {
          // Standard proportional multi-page compaction
          const embeddedPages = await outDoc.embedPdf(srcDoc, Array.from({ length: pageCount }, (_, i) => i));
          const slotH = (pageH - marginScale * 2) / pageCount;

          for (let i = 0; i < pageCount; i++) {
            const emb = embeddedPages[i];
            const fitScale = Math.min((pageW - marginScale * 2) / emb.width, slotH / emb.height) * (contentScale / 100);

            const drawW = emb.width * fitScale;
            const drawH = emb.height * fitScale;

            const yPos = pageH - marginScale - (i + 1) * slotH + (slotH - drawH) / 2;
            const xPos = (pageW - drawW) / 2;

            singlePage.drawPage(emb, {
              x: xPos,
              y: yPos,
              width: drawW,
              height: drawH,
            });

            if (i > 0) {
              singlePage.drawLine({
                start: { x: marginScale + 30, y: yPos + drawH + (slotH - drawH) / 2 },
                end: { x: pageW - marginScale - 30, y: yPos + drawH + (slotH - drawH) / 2 },
                thickness: 0.5,
                color: rgb(0.85, 0.85, 0.88),
              });
            }
          }
        }
      }

      const pdfBytes = toArrayBufferBytes(await outDoc.save());
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      setProcessedPdfBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      alert('Error compacting resume.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!processedPdfBlob) return;
    downloadBlob(processedPdfBlob, `1_Page_Resume_${file?.name || 'document.pdf'}`);
  };

  const modes: { id: CompactionMode; label: string }[] = [
    { id: 'smart_auto', label: 'Smart Auto' },
    { id: 'tight_margin', label: 'Tight Margin' },
    { id: 'extreme_single', label: 'Proportional' },
  ];

  return (
    <ToolWorkspaceShell
      title="Strict 1-Page Resume Compactor"
      subtitle="Don't let 3 trailing lines spill onto Page 2 and get rejected by HR. Automatically compact and micro-scale your resume into exactly 1 clean page!"
      categoryLabel="Campus Placements Essential"
      icon={Minimize2}
      microVariant="compress"
      tone="blue"
      trustNote="100% vector text & ATS readable · Local browser processing"
    >
      <div className="space-y-8">
        {/* Top Action Bar */}
        <div className="flex justify-end">
          <motion.button
            whileHover={prefersReduced || !processedPdfBlob ? undefined : { scale: 1.02 }}
            whileTap={prefersReduced || !processedPdfBlob ? undefined : { scale: 0.98 }}
            onClick={handleDownload}
            disabled={!processedPdfBlob}
            className="pms-btn-primary px-6 py-3 rounded-2xl font-bold text-xs sm:text-sm disabled:opacity-40 flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" /> Download 1-Page Resume
          </motion.button>
        </div>

        {/* Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Controls (5 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="relative pms-glass-panel rounded-3xl p-6 space-y-5 overflow-hidden">
              <PearlScanOverlay active={isProcessing} label="Analyzing text bounds & compacting to 1 page…" />

              <label
                className="border-2 border-dashed rounded-2xl p-6 text-center block cursor-pointer hover:border-sky-400 transition-colors"
                style={{
                  borderColor: 'var(--pms-border-strong)',
                  backgroundColor: 'var(--pms-white)',
                }}
              >
                <div className="w-12 h-12 rounded-2xl bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] flex items-center justify-center mx-auto mb-2.5">
                  <Upload className="w-6 h-6" />
                </div>
                <span className="font-bold text-sm text-slate-800 dark:text-slate-100 block truncate">
                  {file ? file.name : 'Upload Multi-Page Resume PDF'}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
                  {origPageCount > 0 ? (
                    <>
                      Detected <AnimatedNumber value={origPageCount} /> Page{origPageCount === 1 ? '' : 's'}
                    </>
                  ) : (
                    'Upload your 1.2 or 2-page resume'
                  )}
                </span>
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>

              {/* Status Alert */}
              {origPageCount > 1 && (
                <motion.div
                  initial={prefersReduced ? false : { opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 flex items-center gap-3 text-xs text-amber-800 dark:text-amber-200"
                >
                  <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
                  <span>
                    Your resume is currently <strong>{origPageCount} pages long</strong>. HR recruiters strongly recommend a single page for candidates with &lt;5 years experience.
                  </span>
                </motion.div>
              )}

              {/* Compaction Mode */}
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">
                  Compaction Strategy
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {modes.map((m) => {
                    const active = compactionMode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setCompactionMode(m.id)}
                        className="relative py-2 px-2 rounded-xl border text-[11px] font-bold transition-colors cursor-pointer overflow-hidden"
                        style={{
                          borderColor: active ? 'var(--pms-blue)' : 'var(--pms-border)',
                          backgroundColor: active ? 'var(--pms-soft-blue)' : 'var(--pms-white)',
                          color: active ? 'var(--pms-blue)' : 'var(--pms-ink)',
                        }}
                      >
                        {active && (
                          <motion.span
                            layoutId="resume-compaction-mode"
                            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                            className="absolute inset-0 rounded-xl ring-2 ring-sky-500/30 pointer-events-none"
                          />
                        )}
                        <span className="relative z-10">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Compaction Sliders */}
              <div className="space-y-4 pt-2 border-t border-[var(--pms-border)]">
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    <span>Content Scale Factor</span>
                    <span className="text-[var(--pms-blue)]">{contentScale}%</span>
                  </div>
                  <input
                    type="range"
                    min="70"
                    max="100"
                    value={contentScale}
                    onChange={(e) => setContentScale(Number(e.target.value))}
                    className="w-full accent-sky-600"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Scales vector text &amp; layout proportionally</p>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    <span>Outer Margin Padding</span>
                    <span className="text-[var(--pms-blue)]">{marginScale} pt</span>
                  </div>
                  <input
                    type="range"
                    min="8"
                    max="35"
                    value={marginScale}
                    onChange={(e) => setMarginScale(Number(e.target.value))}
                    className="w-full accent-sky-600"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Tightens side margins to reclaim 20% vertical space</p>
                </div>
              </div>

              {/* Action Button */}
              <motion.button
                whileHover={prefersReduced || !file || isProcessing ? undefined : { scale: 1.01 }}
                whileTap={prefersReduced || !file || isProcessing ? undefined : { scale: 0.985 }}
                onClick={handleCompact}
                disabled={!file || isProcessing}
                className="w-full pms-btn-primary py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
              >
                {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
                {isProcessing ? 'Compacting Resume...' : 'Compact to Exactly 1 Page'}
              </motion.button>
            </div>
          </div>

          {/* Real-Time Preview (7 Cols) */}
          <div className="lg:col-span-7 pms-glass-panel rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                1-Page Strict Output Preview
              </h2>
              {processedPdfBlob && (
                <motion.span
                  initial={prefersReduced ? false : { scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 20 }}
                  className="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-[var(--pms-soft-mint)] px-3 py-1 rounded-full border border-emerald-200/80 dark:border-emerald-800/60 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> 100% Guaranteed 1-Page
                </motion.span>
              )}
            </div>

            <div className="w-full bg-white dark:bg-slate-950/80 rounded-2xl p-4 flex items-center justify-center min-h-[460px] border border-[var(--pms-border)]">
              {previewUrl ? (
                <iframe
                  src={previewUrl}
                  title="1 Page Resume Preview"
                  className="w-full h-[580px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white"
                />
              ) : (
                <div className="text-center space-y-3 text-slate-400">
                  <FileText className="w-12 h-12 mx-auto opacity-30 text-sky-500" />
                  <p className="text-xs font-semibold">
                    Upload your resume and click &quot;Compact to Exactly 1 Page&quot; to preview the result.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <ToolSEOSection
          toolName="Strict 1-Page Resume Compactor"
          headline="Fit 2-Page CV Strictly into 1 Page for Campus Placements &amp; ATS"
          description="Don't let 3 trailing lines spill onto Page 2 and get rejected by corporate HR recruiters. Automatically compact margins and scale your resume proportionally into exactly 1 clean page."
          features={[
            {
              title: 'Eliminates Accidental 2nd Pages',
              desc: 'Never submit a resume where page 2 has only 3 lonely bullet points. Everything fits into 1 cohesive layout.',
            },
            {
              title: 'Preserves 100% Vector Text & ATS Readability',
              desc: 'Does not rasterize your text into a blurry image. All words, links, and headings remain selectable and ATS-compliant.',
            },
            {
              title: 'Micro-Margin Reclaiming',
              desc: 'Gains up to 2 inches of vertical real estate by reducing excessive whitespace around header and footer borders.',
            },
            {
              title: 'Private & Local Processing',
              desc: 'Your confidential contact details, phone number, and address are processed locally in your browser memory.',
            },
          ]}
        />
      </div>
    </ToolWorkspaceShell>
  );
}
