import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload,
  Download,
  Sliders,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  Zap,
  RotateCw,
  Compass,
  Printer,
  Trash2,
  Plus,
  Sparkles,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import ShareQrModal from '../components/ShareQrModal';
import BeforeAfterSlider from '../components/BeforeAfterSlider';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';
import { toArrayBufferBytes, triggerBlobDownload, useAutoRevokeUrl } from '../lib/blobUrl';
import { ACCEPT_PDF_AND_IMAGES, isPdfFile } from '../lib/fileAccept';
import { printPdfBlob } from '../lib/printHelper';
import { clampCanvasDimensions, clampPdfScale, releaseCanvas } from '../lib/safeCanvas';
import { dataUrlToBytes } from '../lib/utils';
import {
  type XeroxCleanMode,
  type InkComparison,
  processXeroxCanvas,
  detectCorrectiveSkewAngle,
  renderDeskewedCanvas,
} from '../lib/documentCleanerEngine';

type ExportPaperSize = 'auto_a4' | 'original' | 'a4_portrait' | 'legal';

interface PageItem {
  id: number;
  label: string;
  originalCanvas: HTMLCanvasElement;
  originalDataUrl: string;
  skewAngle: number;
  rotation90: number;
}

const MODE_PRESETS: Array<{
  id: XeroxCleanMode;
  label: string;
  desc: string;
  defaults: { shadowRemoval: number; bleachThreshold: number; textDarkness: number; sharpen: number; despeckle: boolean };
}> = [
  {
    id: 'pro_xerox',
    label: 'Auto-Shadow Xerox (B&W)',
    desc: 'Adaptive shadow removal + crisp black text',
    defaults: { shadowRemoval: 92, bleachThreshold: 192, textDarkness: 48, sharpen: 35, despeckle: true },
  },
  {
    id: 'magic_color',
    label: 'Magic Color + Stamps',
    desc: 'Pure white paper; keeps blue pens & red seals',
    defaults: { shadowRemoval: 88, bleachThreshold: 186, textDarkness: 32, sharpen: 30, despeckle: false },
  },
  {
    id: 'toner_saver',
    label: 'Toner Saver (60% Eco)',
    desc: 'Hollows solid black fills; sharp readable text',
    defaults: { shadowRemoval: 90, bleachThreshold: 184, textDarkness: 35, sharpen: 25, despeckle: true },
  },
  {
    id: 'photo_gray',
    label: 'Smooth Photo Gray',
    desc: 'Preserves Aadhaar & marksheet photos cleanly',
    defaults: { shadowRemoval: 78, bleachThreshold: 200, textDarkness: 22, sharpen: 20, despeckle: false },
  },
  {
    id: 'faded_rescue',
    label: 'Faded Stamp Rescue',
    desc: 'Restores old, yellowed & faint carbon scans',
    defaults: { shadowRemoval: 100, bleachThreshold: 175, textDarkness: 70, sharpen: 55, despeckle: true },
  },
];

export default function XeroxCleaner() {
  const prefersReduced = useReducedMotion();

  useSEO(
    'Ultra Xerox Eco-Cleaner Pro — Remove Shadows & Whiten Document Photos Online',
    'Remove phone hand shadows, yellow lighting, and gray backgrounds using adaptive illumination normalization. Keep blue pens & red stamps vibrant or save up to 60% toner. Free & private.'
  );

  usePageSEO(
    'Ultra Xerox Eco-Cleaner Pro — Mobile Photo to Pure White Photocopy PDF',
    'Pro document cleaner for Xerox shops, E-Mitra, students, and offices. Adaptive shadow removal, Sauvola photocopy B&W, stamp preservation, auto-deskew, and instant toner savings.',
    'whiten document background online, photocopy cleaner, remove shadow from document photo, mobile photo to xerox pdf, save printer toner pdf, camscanner clean effect online, stamp paper cleaner',
    '/xerox-cleaner'
  );

  const [pages, setPages] = useState<PageItem[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);

  // Cleaner parameters
  const [cleanMode, setCleanMode] = useState<XeroxCleanMode>('pro_xerox');
  const [shadowRemoval, setShadowRemoval] = useState<number>(92);
  const [bleachThreshold, setBleachThreshold] = useState<number>(192);
  const [textDarkness, setTextDarkness] = useState<number>(48);
  const [sharpen, setSharpen] = useState<number>(35);
  const [despeckle, setDespeckle] = useState<boolean>(true);
  const [paperSize, setPaperSize] = useState<ExportPaperSize>('auto_a4');

  // Live preview state (only active page is rendered in real time -> 60fps smooth!)
  const [activeBeforeUrl, setActiveBeforeUrl] = useState<string | null>(null);
  const [activeAfterUrl, setActiveAfterUrl] = useState<string | null>(null);
  const [activeInk, setActiveInk] = useState<InkComparison | null>(null);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusLabel, setStatusLabel] = useState<string>('');
  const [deskewing, setDeskewing] = useState<boolean>(false);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [shareBlobUrl, setShareBlobUrl] = useState<string | null>(null);
  const nextIdRef = useRef<number>(1);
  const activeCleanedCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useAutoRevokeUrl(shareBlobUrl);

  const activePage = pages[activePageIndex] || null;

  const selectMode = (modeId: XeroxCleanMode) => {
    setCleanMode(modeId);
    const preset = MODE_PRESETS.find((m) => m.id === modeId);
    if (preset) {
      setShadowRemoval(preset.defaults.shadowRemoval);
      setBleachThreshold(preset.defaults.bleachThreshold);
      setTextDarkness(preset.defaults.textDarkness);
      setSharpen(preset.defaults.sharpen);
      setDespeckle(preset.defaults.despeckle);
    }
  };

  // Build oriented + cleaned canvas for a single PageItem
  const buildCleanedPage = useCallback(
    (item: PageItem) => {
      const oriented =
        item.skewAngle !== 0 || item.rotation90 !== 0
          ? renderDeskewedCanvas(item.originalCanvas, item.skewAngle, item.rotation90, true, false)
          : item.originalCanvas;
      const result = processXeroxCanvas(oriented, {
        mode: cleanMode,
        shadowRemoval,
        bleachThreshold,
        textDarkness,
        sharpen,
        despeckle,
      });
      return { oriented, cleaned: result.canvas, ink: result.ink };
    },
    [cleanMode, shadowRemoval, bleachThreshold, textDarkness, sharpen, despeckle]
  );

  // Live preview of ONLY the active page (fast ~25ms, never lags on multi-page PDFs!)
  useEffect(() => {
    if (!activePage) {
      setActiveBeforeUrl(null);
      setActiveAfterUrl(null);
      setActiveInk(null);
      activeCleanedCanvasRef.current = null;
      return;
    }

    const timer = setTimeout(() => {
      const { oriented, cleaned, ink } = buildCleanedPage(activePage);
      activeCleanedCanvasRef.current = cleaned;
      setActiveBeforeUrl(
        activePage.skewAngle !== 0 || activePage.rotation90 !== 0
          ? oriented.toDataURL('image/jpeg', 0.88)
          : activePage.originalDataUrl
      );
      setActiveAfterUrl(cleaned.toDataURL('image/jpeg', 0.9));
      setActiveInk(ink);
    }, 60);

    return () => clearTimeout(timer);
  }, [activePage, buildCleanedPage]);

  // Load uploaded files (append mode supported so users can add more photos!)
  const loadFiles = async (selectedFiles: File[], append = false) => {
    if (selectedFiles.length === 0) return;
    setIsProcessing(true);
    setStatusLabel('Loading pages for adaptive shadow removal...');

    const loaded: PageItem[] = [];
    try {
      for (const f of selectedFiles) {
        if (isPdfFile(f)) {
          const ab = await f.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
          for (let p = 1; p <= pdf.numPages; p++) {
            setStatusLabel(`Reading ${f.name} (Page ${p}/${pdf.numPages})...`);
            const page = await pdf.getPage(p);
            const baseVp = page.getViewport({ scale: 1.0 });
            const safeScale = clampPdfScale(baseVp.width, baseVp.height, 2.0);
            const vp = page.getViewport({ scale: safeScale });
            const canvas = document.createElement('canvas');
            canvas.width = vp.width;
            canvas.height = vp.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;
              loaded.push({
                id: nextIdRef.current++,
                label: `${f.name} · P${p}`,
                originalCanvas: canvas,
                originalDataUrl: canvas.toDataURL('image/jpeg', 0.88),
                skewAngle: 0,
                rotation90: 0,
              });
            }
            page.cleanup();
          }
        } else {
          await new Promise<void>((resolve) => {
            const url = URL.createObjectURL(f);
            const img = new Image();
            img.onload = () => {
              // Cap ultra-huge 20MP camera photos at 2400px long side (300 DPI A4) to keep browser fast & sharp
              const maxDim = 2400;
              const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
              const clamped = clampCanvasDimensions(
                Math.round(img.naturalWidth * scale),
                Math.round(img.naturalHeight * scale)
              );
              const canvas = document.createElement('canvas');
              canvas.width = clamped.width;
              canvas.height = clamped.height;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                loaded.push({
                  id: nextIdRef.current++,
                  label: f.name,
                  originalCanvas: canvas,
                  originalDataUrl: canvas.toDataURL('image/jpeg', 0.88),
                  skewAngle: 0,
                  rotation90: 0,
                });
              }
              URL.revokeObjectURL(url);
              resolve();
            };
            img.onerror = () => {
              URL.revokeObjectURL(url);
              resolve();
            };
            img.src = url;
          });
        }
      }

      if (append) {
        setPages((prev) => [...prev, ...loaded]);
      } else {
        setPages(loaded);
        setActivePageIndex(0);
      }
    } catch (err) {
      console.error('[XeroxCleaner] Error loading files:', err);
      alert('Failed to load one or more files. Please ensure PDFs are not password-protected.');
    } finally {
      setIsProcessing(false);
      setStatusLabel('');
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>, append = false) => {
    const list = Array.from(e.target.files || []);
    void loadFiles(list, append);
    e.target.value = '';
  };

  const handleRotateCurrent = () => {
    if (!activePage) return;
    setPages((prev) =>
      prev.map((p, i) => (i === activePageIndex ? { ...p, rotation90: (p.rotation90 + 90) % 360 } : p))
    );
  };

  const handleAutoDeskewCurrent = () => {
    if (!activePage) return;
    setDeskewing(true);
    setTimeout(() => {
      try {
        const angle = detectCorrectiveSkewAngle(activePage.originalCanvas);
        setPages((prev) =>
          prev.map((p, i) => (i === activePageIndex ? { ...p, skewAngle: angle } : p))
        );
      } finally {
        setDeskewing(false);
      }
    }, 30);
  };

  const handleDeleteCurrent = () => {
    if (pages.length <= 1) {
      setPages([]);
      setActivePageIndex(0);
      return;
    }
    setPages((prev) => prev.filter((_, i) => i !== activePageIndex));
    setActivePageIndex((prev) => Math.max(0, Math.min(prev, pages.length - 2)));
  };

  // Assemble full cleaned PDF Blob (reused for Download, Print, and Send to Phone QR!)
  const assembleCleanPdfBlob = async (): Promise<Blob | null> => {
    if (pages.length === 0) return null;
    setIsProcessing(true);
    try {
      const pdfDoc = await PDFDocument.create();
      for (let i = 0; i < pages.length; i++) {
        setStatusLabel(`Cleaning & assembling page ${i + 1} of ${pages.length}...`);
        const { oriented, cleaned } = buildCleanedPage(pages[i]);
        try {
          const jpgDataUrl = cleaned.toDataURL('image/jpeg', 0.92);
          const jpgBytes = dataUrlToBytes(jpgDataUrl);
          const jpgImage = await pdfDoc.embedJpg(jpgBytes);

          let pageW = 595.28;
          let pageH = 841.89;
          if (paperSize === 'auto_a4') {
            if (cleaned.width > cleaned.height) {
              pageW = 841.89;
              pageH = 595.28;
            }
          } else if (paperSize === 'legal') {
            pageW = 612;
            pageH = 1008;
          } else if (paperSize === 'original') {
            // Match exact aspect ratio scaled to A4-equivalent width
            pageW = 595.28;
            pageH = Math.max(200, (cleaned.height / Math.max(1, cleaned.width)) * pageW);
          }

          const scale = Math.min(pageW / cleaned.width, pageH / cleaned.height);
          const drawW = cleaned.width * scale;
          const drawH = cleaned.height * scale;
          const page = pdfDoc.addPage([pageW, pageH]);
          page.drawImage(jpgImage, {
            x: (pageW - drawW) / 2,
            y: (pageH - drawH) / 2,
            width: drawW,
            height: drawH,
          });
        } finally {
          releaseCanvas(cleaned);
          if (oriented !== pages[i].originalCanvas) releaseCanvas(oriented);
        }

        // Yield between pages to keep UI responsive
        if (i % 2 === 1) await new Promise((r) => setTimeout(r, 0));
      }

      const outBytes = await pdfDoc.save();
      return new Blob([toArrayBufferBytes(outBytes)], { type: 'application/pdf' });
    } catch (err) {
      console.error('[XeroxCleaner] PDF assembly error:', err);
      alert('Failed to generate cleaned PDF. Please try again.');
      return null;
    } finally {
      setIsProcessing(false);
      setStatusLabel('');
    }
  };

  const handleDownloadPdf = async () => {
    const blob = await assembleCleanPdfBlob();
    if (blob) triggerBlobDownload(blob, `clean-xerox-pro-${Date.now()}.pdf`);
  };

  const handleDirectPrint = async () => {
    const blob = await assembleCleanPdfBlob();
    if (!blob) return;
    await printPdfBlob(blob, `clean-xerox-pro-${Date.now()}.pdf`);
  };

  const handleOpenShareQr = async () => {
    const blob = await assembleCleanPdfBlob();
    if (!blob) return;
    setShareBlobUrl(URL.createObjectURL(blob));
    setShowQrModal(true);
  };

  const handleDownloadCurrentJpg = () => {
    const c = activeCleanedCanvasRef.current;
    if (!c) return;
    c.toBlob(
      (blob) => {
        if (blob) triggerBlobDownload(blob, `clean-page-${activePageIndex + 1}.jpg`);
      },
      'image/jpeg',
      0.95
    );
  };

  return (
    <ToolWorkspaceShell
      title="Ultra Xerox Eco-Cleaner Pro"
      subtitle="Adaptive illumination shadow-removal engine. Turn dark, yellow, shadow-covered phone photos into spotless white photocopies — keep blue pens & red stamps crisp, auto-deskew, and cut toner usage by up to 65%."
      categoryLabel="Eco-Print & Photo State Pro"
      icon={Zap}
      microVariant="ocr"
      tone="emerald"
      trustNote="Integral-image shadow normalizer · Sauvola B&W · 100% browser-only privacy"
    >
      <div className="space-y-8">
        {pages.length === 0 ? (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto pms-glass-panel rounded-3xl p-4 relative overflow-hidden"
          >
            <PearlScanOverlay active={isProcessing} label={statusLabel || 'Loading uploaded pages...'} />
            <label className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-[var(--pms-border-strong)] hover:border-emerald-500 rounded-2xl cursor-pointer bg-[var(--pms-white)] transition-all group">
              <input
                type="file"
                multiple
                accept={ACCEPT_PDF_AND_IMAGES}
                onChange={(e) => handleFileInput(e, false)}
                className="sr-only"
              />
              <div
                className="w-16 h-16 rounded-2xl text-emerald-600 dark:text-emerald-400 border border-[var(--pms-border)] flex items-center justify-center mb-4 group-hover:scale-105 transition-transform"
                style={{ background: 'var(--pms-soft-mint)' }}
              >
                <Upload className="w-8 h-8" />
              </div>
              <span className="text-base font-bold text-[var(--pms-ink)] mb-1">
                Drop Mobile Photos or Scanned PDF
              </span>
              <span className="text-xs text-[var(--pms-muted)] text-center max-w-sm">
                Upload shadowed notes, Aadhaar/marksheets, old stamp papers, receipts, or multi-page scanned PDFs.
              </span>
            </label>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Controls */}
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="lg:col-span-4 space-y-4 pms-glass-panel p-5 rounded-3xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[var(--pms-border)]">
                <span className="text-sm font-bold text-[var(--pms-ink)] flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-500" /> Pro Cleaner Controls
                </span>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[var(--pms-soft-blue)] text-[var(--pms-ink)] border border-[var(--pms-border)] cursor-pointer hover:opacity-90 flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add
                    <input
                      type="file"
                      multiple
                      accept={ACCEPT_PDF_AND_IMAGES}
                      onChange={(e) => handleFileInput(e, true)}
                      className="sr-only"
                    />
                  </label>
                  <button
                    onClick={() => setPages([])}
                    className="text-xs text-rose-500 hover:text-rose-600 font-semibold cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Real Measured Toner Savings Meter */}
              {activeInk && (
                <div
                  className="p-3.5 rounded-2xl border border-[var(--pms-border)] space-y-2"
                  style={{ background: 'var(--pms-soft-mint)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> Real Toner Coverage
                    </span>
                    <span className="text-xs font-black px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                      {activeInk.savedPercent}% Saved
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                    <div className="bg-white/80 dark:bg-slate-900/70 rounded-xl p-1.5 border border-[var(--pms-border)]">
                      <div className="text-[10px] text-[var(--pms-muted)]">Before</div>
                      <div className="font-mono font-bold text-rose-600 dark:text-rose-400">
                        {activeInk.before.totalCoveragePct}%
                      </div>
                    </div>
                    <div className="bg-white/80 dark:bg-slate-900/70 rounded-xl p-1.5 border border-[var(--pms-border)]">
                      <div className="text-[10px] text-[var(--pms-muted)]">After</div>
                      <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {activeInk.after.totalCoveragePct}%
                      </div>
                    </div>
                    <div className="bg-white/80 dark:bg-slate-900/70 rounded-xl p-1.5 border border-[var(--pms-border)]">
                      <div className="text-[10px] text-[var(--pms-muted)]">Est. / 100p</div>
                      <div className="font-mono font-bold text-[var(--pms-ink)]">
                        ₹{activeInk.rupeesSavedPer100Pages}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 5 Cleaning Mode Presets */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--pms-muted)] mb-2">
                  Cleaning Engine Mode
                </label>
                <div className="grid grid-cols-1 gap-1.5 text-xs">
                  {MODE_PRESETS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => selectMode(m.id)}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        cleanMode === m.id
                          ? 'border-emerald-500 bg-[var(--pms-soft-mint)] text-[var(--pms-ink)] shadow-xs'
                          : 'border-[var(--pms-border)] bg-[var(--pms-white)] text-[var(--pms-muted)] hover:text-[var(--pms-ink)]'
                      }`}
                    >
                      <div className="font-bold flex items-center justify-between">
                        <span>{m.label}</span>
                        {cleanMode === m.id && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                      </div>
                      <div className="text-[10px] opacity-80 mt-0.5">{m.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Fine-Tune Sliders */}
              <div className="space-y-3 p-3.5 bg-[var(--pms-white)] rounded-2xl border border-[var(--pms-border)] text-xs">
                <div>
                  <div className="flex justify-between items-center font-semibold mb-1">
                    <span className="text-[var(--pms-ink)]">Adaptive Shadow Removal</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono">{shadowRemoval}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={shadowRemoval}
                    onChange={(e) => setShadowRemoval(Number(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                  <div className="flex justify-between text-[10px] text-[var(--pms-muted)]">
                    <span>Off (Flat)</span>
                    <span>Erase Hand/Lamp Shadows</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center font-semibold mb-1">
                    <span className="text-[var(--pms-ink)]">Paper Whiteness Cutoff</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono">{bleachThreshold}</span>
                  </div>
                  <input
                    type="range"
                    min="130"
                    max="235"
                    value={bleachThreshold}
                    onChange={(e) => setBleachThreshold(Number(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center font-semibold mb-1">
                    <span className="text-[var(--pms-ink)]">Text Ink Darkness</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono">{textDarkness}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="90"
                    value={textDarkness}
                    onChange={(e) => setTextDarkness(Number(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center font-semibold mb-1">
                    <span className="text-[var(--pms-ink)]">Text Crispness (Sharpen)</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono">{sharpen}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={sharpen}
                    onChange={(e) => setSharpen(Number(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>

                <label className="flex items-center justify-between pt-2 border-t border-[var(--pms-border)] cursor-pointer select-none">
                  <span className="font-semibold text-[var(--pms-ink)]">Despeckle Scanner Dust</span>
                  <input
                    type="checkbox"
                    checked={despeckle}
                    onChange={(e) => setDespeckle(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 rounded"
                  />
                </label>
              </div>

              {/* Page Geometry & Output Size */}
              <div className="p-3.5 bg-[var(--pms-white)] rounded-2xl border border-[var(--pms-border)] space-y-2.5 text-xs">
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={handleAutoDeskewCurrent}
                    disabled={deskewing}
                    className="py-2 px-2 rounded-xl border border-[var(--pms-border)] hover:border-emerald-500 font-semibold text-[var(--pms-ink)] flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    {deskewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Compass className="w-3.5 h-3.5 text-emerald-600" />}
                    <span>Deskew</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRotateCurrent}
                    className="py-2 px-2 rounded-xl border border-[var(--pms-border)] hover:border-emerald-500 font-semibold text-[var(--pms-ink)] flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-sky-600" />
                    <span>Rotate</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteCurrent}
                    className="py-2 px-2 rounded-xl border border-[var(--pms-border)] hover:border-rose-500 font-semibold text-rose-600 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="font-semibold text-[var(--pms-muted)]">PDF Page Size</span>
                  <select
                    value={paperSize}
                    onChange={(e) => setPaperSize(e.target.value as ExportPaperSize)}
                    className="px-2.5 py-1.5 rounded-lg border border-[var(--pms-border)] bg-[var(--pms-white)] text-[var(--pms-ink)] font-semibold text-xs"
                  >
                    <option value="auto_a4">A4 (Auto-Orientation)</option>
                    <option value="a4_portrait">A4 Portrait</option>
                    <option value="legal">Legal Sheet</option>
                    <option value="original">Exact Aspect Ratio</option>
                  </select>
                </div>
              </div>

              {/* Page Navigator */}
              <AnimatePresence>
                {pages.length > 1 && (
                  <motion.div
                    initial={prefersReduced ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={prefersReduced ? undefined : { opacity: 0, height: 0 }}
                    className="flex items-center justify-between p-2.5 bg-[var(--pms-white)] border border-[var(--pms-border)] rounded-xl text-xs font-semibold text-[var(--pms-ink)]"
                  >
                    <button
                      onClick={() => setActivePageIndex(Math.max(0, activePageIndex - 1))}
                      disabled={activePageIndex === 0}
                      className="p-1.5 rounded-lg hover:bg-[var(--pms-soft-lavender)] disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="truncate px-2">
                      Page {activePageIndex + 1} / <AnimatedNumber value={pages.length} />
                      {activePage?.skewAngle ? ` (${activePage.skewAngle > 0 ? '+' : ''}${activePage.skewAngle}°)` : ''}
                    </span>
                    <button
                      onClick={() => setActivePageIndex(Math.min(pages.length - 1, activePageIndex + 1))}
                      disabled={activePageIndex === pages.length - 1}
                      className="p-1.5 rounded-lg hover:bg-[var(--pms-soft-lavender)] disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Export & Print Buttons */}
              <div className="pt-2 border-t border-[var(--pms-border)] space-y-2">
                <button
                  onClick={handleDownloadPdf}
                  disabled={isProcessing}
                  className="pms-btn-primary w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-bold text-sm transition disabled:opacity-50 cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Download Cleaned PDF (<AnimatedNumber value={pages.length} />p)
                </button>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={handleDirectPrint}
                    disabled={isProcessing}
                    className="flex items-center justify-center gap-1 py-2.5 px-2 bg-[var(--pms-white)] border border-[var(--pms-border)] hover:border-emerald-500 text-[var(--pms-ink)] rounded-xl font-semibold text-[11px] transition cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-emerald-600" /> Print
                  </button>
                  <button
                    onClick={handleDownloadCurrentJpg}
                    className="flex items-center justify-center gap-1 py-2.5 px-2 bg-[var(--pms-white)] border border-[var(--pms-border)] hover:border-[var(--pms-border-strong)] text-[var(--pms-ink)] rounded-xl font-semibold text-[11px] transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> P{activePageIndex + 1} JPG
                  </button>
                  <button
                    onClick={handleOpenShareQr}
                    disabled={isProcessing}
                    className="flex items-center justify-center gap-1 py-2.5 px-2 border border-[var(--pms-border)] text-[var(--pms-ink)] rounded-xl font-semibold text-[11px] transition cursor-pointer hover:opacity-90"
                    style={{ background: 'var(--pms-soft-blue)' }}
                  >
                    <Smartphone className="w-3.5 h-3.5 text-[var(--pms-blue)]" /> Share
                  </button>
                </div>
              </div>
            </motion.div>

            {/* Right Interactive Split Preview */}
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="lg:col-span-8 pms-glass-panel p-5 sm:p-6 rounded-3xl flex flex-col items-center relative overflow-hidden"
            >
              <PearlScanOverlay active={isProcessing} label={statusLabel || 'Bleaching paper & assembling PDF...'} />

              {activeBeforeUrl && activeAfterUrl ? (
                <BeforeAfterSlider
                  beforeSrc={activeBeforeUrl}
                  afterSrc={activeAfterUrl}
                  beforeLabel="Original Photo"
                  afterLabel="Cleaned Xerox"
                  maxHeightClass="max-h-[600px]"
                  badgeText={
                    activeInk
                      ? `Toner: ${activeInk.before.totalCoveragePct}% → ${activeInk.after.totalCoveragePct}% (${activeInk.savedPercent}% saved)`
                      : 'Adaptive Shadow Removal Active'
                  }
                />
              ) : (
                <div className="w-full h-96 flex items-center justify-center text-[var(--pms-muted)] text-xs gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                  Normalizing page illumination...
                </div>
              )}
            </motion.div>
          </div>
        )}

        <ToolSEOSection
          toolName="Ultra Xerox Eco-Cleaner Pro"
          headline="Remove Uneven Phone Shadows & Turn Document Photos into Crisp Photocopies"
          description="Unlike basic threshold filters that turn shadowed corners black, our Integral-Image Illumination Normalizer estimates the local lighting surface across your page, removes yellow bulb tints and hand shadows completely, preserves blue pen signatures and official red stamps, and measures real CMYK toner savings."
          steps={[
            {
              step: '01',
              title: 'Upload Mobile Photos or Scanned PDFs',
              desc: 'Drop one or many phone photos (notes, certificates, stamp papers, Aadhaar) or multi-page scanned PDFs.',
            },
            {
              step: '02',
              title: 'Choose Pro Cleaning Engine & Compare Live',
              desc: 'Drag the Before/After split slider to verify shadows are gone. Use Auto-Shadow Xerox, Magic Color (keeps stamps), or Toner Saver (hollows thick black fills).',
            },
            {
              step: '03',
              title: 'Auto-Deskew & Print or Download PDF',
              desc: 'Straighten tilted photos in 1 click, pick A4/Legal/Original size, and print directly or download a crisp multi-page PDF.',
            },
          ]}
          features={[
            {
              title: 'Local Shadow & Glare Removal',
              desc: 'Divisive background illumination estimation erases dark hand shadows and yellow tungsten room light evenly across the entire sheet.',
            },
            {
              title: 'Edge-Preserving Toner Saver',
              desc: 'Hollows out thick black boxes and dark headers while keeping thin Hindi/English text strokes razor-sharp — saving up to 65% toner.',
            },
            {
              title: 'Magic Color Stamp & Pen Retention',
              desc: 'Whitens dirty paper to #FFFFFF while boosting blue ballpoint signatures, red government seals, and purple ink stamps.',
            },
          ]}
          faqs={[
            {
              q: 'Why does this work on shadowed phone photos when other cleaners turn them black?',
              a: 'Basic cleaners compare every pixel to a single fixed brightness cutoff, which fails whenever one side of the page is darker. Our engine estimates the local lighting surface across the page first, neutralizing shadows before sharpening the text.',
            },
            {
              q: 'Are my Aadhaar, marksheets, or legal stamp papers uploaded to any server?',
              a: 'No. 100% of the shadow removal, deskewing, and PDF assembly runs locally inside your browser memory.',
            },
          ]}
        />

        <ShareQrModal
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          title="Cleaned Photocopy PDF"
          fileBlobUrl={shareBlobUrl}
          fileName="clean-xerox-pro.pdf"
        />
      </div>
    </ToolWorkspaceShell>
  );
}
