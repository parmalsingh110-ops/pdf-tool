import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload,
  Download,
  Sparkles,
  Sun,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  RotateCw,
  Compass,
  Loader2,
  Printer,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { PDFDocument } from 'pdf-lib';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import BeforeAfterSlider from '../components/BeforeAfterSlider';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';
import { toArrayBufferBytes } from '../lib/blobUrl';
import { dataUrlToBytes, downloadBlob } from '../lib/utils';
import {
  type BoardCleanMode,
  type InkComparison,
  processBoardCanvas,
  detectCorrectiveSkewAngle,
  renderDeskewedCanvas,
} from '../lib/documentCleanerEngine';

interface BoardSlide {
  id: number;
  name: string;
  originalCanvas: HTMLCanvasElement;
  originalDataUrl: string;
  skewAngle: number;
  rotation90: number;
}

export default function BoardNotesCleaner() {
  const prefersReduced = useReducedMotion();

  useSEO(
    'Classroom Blackboard & Whiteboard De-Glare & Batch PDF Cleaner | PDF Media Suite',
    'Remove tube-light glare, invert blackboard chalk to black ink (save 90% toner), boost red/blue/green markers, auto-deskew, and merge batch lecture photos into a clean A4 PDF.'
  );

  usePageSEO(
    'Blackboard & Whiteboard Photo to Clean PDF Notes Pro',
    'Adaptive illumination de-glare for classroom whiteboards & green/black chalkboards. Batch upload multiple board photos, auto-deskew, and save as a single printable PDF.',
    'blackboard photo to pdf, whiteboard notes cleaner, chalkboard inverter toner saver, remove whiteboard glare, classroom photo scanner online',
    '/board-notes-cleaner'
  );

  const [slides, setSlides] = useState<BoardSlide[]>([]);
  const [activeIdx, setActiveIdx] = useState<number>(0);

  const [cleanMode, setCleanMode] = useState<BoardCleanMode>('whiteboard_deglare');
  const [glareRemoval, setGlareRemoval] = useState<number>(88);
  const [markerBoost, setMarkerBoost] = useState<number>(52);
  const [sharpen, setSharpen] = useState<number>(35);

  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [afterUrl, setAfterUrl] = useState<string | null>(null);
  const [inkStats, setInkStats] = useState<InkComparison | null>(null);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusLabel, setStatusLabel] = useState<string>('');
  const [deskewing, setDeskewing] = useState<boolean>(false);

  const nextIdRef = useRef<number>(1);
  const activeCleanCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeSlide = slides[activeIdx] || null;

  const buildCleanedSlide = useCallback(
    (slide: BoardSlide) => {
      const oriented =
        slide.skewAngle !== 0 || slide.rotation90 !== 0
          ? renderDeskewedCanvas(slide.originalCanvas, slide.skewAngle, slide.rotation90, true, false)
          : slide.originalCanvas;
      const res = processBoardCanvas(oriented, {
        mode: cleanMode,
        glareRemoval,
        markerBoost,
        sharpen,
      });
      return { oriented, cleaned: res.canvas, ink: res.ink };
    },
    [cleanMode, glareRemoval, markerBoost, sharpen]
  );

  // Live preview active slide
  useEffect(() => {
    if (!activeSlide) {
      setBeforeUrl(null);
      setAfterUrl(null);
      setInkStats(null);
      activeCleanCanvasRef.current = null;
      return;
    }

    const timer = setTimeout(() => {
      const { oriented, cleaned, ink } = buildCleanedSlide(activeSlide);
      activeCleanCanvasRef.current = cleaned;
      setBeforeUrl(
        activeSlide.skewAngle !== 0 || activeSlide.rotation90 !== 0
          ? oriented.toDataURL('image/jpeg', 0.88)
          : activeSlide.originalDataUrl
      );
      setAfterUrl(cleaned.toDataURL('image/jpeg', 0.91));
      setInkStats(ink);
    }, 55);

    return () => clearTimeout(timer);
  }, [activeSlide, buildCleanedSlide]);

  const loadBoardFiles = async (fileList: File[], append = false) => {
    if (fileList.length === 0) return;
    setIsProcessing(true);
    setStatusLabel('Loading lecture board photos...');
    const loaded: BoardSlide[] = [];

    try {
      for (const f of fileList) {
        await new Promise<void>((resolve) => {
          const url = URL.createObjectURL(f);
          const img = new Image();
          img.onload = () => {
            const maxDim = 2200;
            const sc = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.naturalWidth * sc);
            canvas.height = Math.round(img.naturalHeight * sc);
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              loaded.push({
                id: nextIdRef.current++,
                name: f.name,
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

      if (append) {
        setSlides((prev) => [...prev, ...loaded]);
      } else {
        setSlides(loaded);
        setActiveIdx(0);
      }
    } finally {
      setIsProcessing(false);
      setStatusLabel('');
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>, append = false) => {
    void loadBoardFiles(Array.from(e.target.files || []), append);
    e.target.value = '';
  };

  const handleDeskewCurrent = () => {
    if (!activeSlide) return;
    setDeskewing(true);
    setTimeout(() => {
      try {
        const angle = detectCorrectiveSkewAngle(activeSlide.originalCanvas);
        setSlides((prev) => prev.map((s, i) => (i === activeIdx ? { ...s, skewAngle: angle } : s)));
      } finally {
        setDeskewing(false);
      }
    }, 25);
  };

  const handleRotateCurrent = () => {
    if (!activeSlide) return;
    setSlides((prev) =>
      prev.map((s, i) => (i === activeIdx ? { ...s, rotation90: (s.rotation90 + 90) % 360 } : s))
    );
  };

  const handleDeleteCurrent = () => {
    if (slides.length <= 1) {
      setSlides([]);
      setActiveIdx(0);
      return;
    }
    setSlides((prev) => prev.filter((_, i) => i !== activeIdx));
    setActiveIdx((prev) => Math.max(0, Math.min(prev, slides.length - 2)));
  };

  const assemblePdfBlob = async (): Promise<Blob | null> => {
    if (slides.length === 0) return null;
    setIsProcessing(true);
    try {
      const pdfDoc = await PDFDocument.create();
      for (let i = 0; i < slides.length; i++) {
        setStatusLabel(`Cleaning & assembling board ${i + 1} of ${slides.length}...`);
        const { cleaned } = buildCleanedSlide(slides[i]);
        const isLandscape = cleaned.width > cleaned.height;
        const pageW = isLandscape ? 841.89 : 595.28;
        const pageH = isLandscape ? 595.28 : 841.89;
        const margin = 20;
        const scale = Math.min((pageW - margin * 2) / cleaned.width, (pageH - margin * 2) / cleaned.height);
        const drawW = cleaned.width * scale;
        const drawH = cleaned.height * scale;

        const imgBytes = dataUrlToBytes(cleaned.toDataURL('image/jpeg', 0.92));
        const embeddedImg = await pdfDoc.embedJpg(imgBytes);
        const page = pdfDoc.addPage([pageW, pageH]);
        page.drawImage(embeddedImg, {
          x: (pageW - drawW) / 2,
          y: (pageH - drawH) / 2,
          width: drawW,
          height: drawH,
        });
        if (i % 2 === 1) await new Promise((r) => setTimeout(r, 0));
      }
      const pdfBytes = await pdfDoc.save();
      return new Blob([toArrayBufferBytes(pdfBytes)], { type: 'application/pdf' });
    } catch (err) {
      console.error('[BoardNotesCleaner] PDF build failed:', err);
      alert('Error creating PDF.');
      return null;
    } finally {
      setIsProcessing(false);
      setStatusLabel('');
    }
  };

  const handleDownloadPdf = async () => {
    const blob = await assemblePdfBlob();
    if (blob) downloadBlob(blob, `clean_board_notes_${slides.length}p.pdf`);
  };

  const handleDirectPrint = async () => {
    const blob = await assemblePdfBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    w?.addEventListener('load', () => {
      try { w.print(); } catch {}
    });
  };

  const handleDownloadJpg = () => {
    const c = activeCleanCanvasRef.current;
    if (!c) return;
    c.toBlob(
      (b) => {
        if (b) downloadBlob(b, `board-note-${activeIdx + 1}.jpg`);
      },
      'image/jpeg',
      0.95
    );
  };

  return (
    <ToolWorkspaceShell
      title="Classroom Board Notes Cleaner Pro"
      subtitle="Adaptive tube-light de-glare & chalk-to-ink inverter. Batch upload multiple whiteboard or green/blackboard lecture photos and turn them into crisp, printable A4 notes PDFs."
      categoryLabel="Lecture Notes Enhancer"
      icon={Sparkles}
      microVariant="ocr"
      tone="sky"
      trustNote="Local illumination de-glare · Batch multi-photo PDF · 100% browser-private"
    >
      <div className="space-y-6">
        {/* Top Action Bar */}
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="pms-glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className="px-3 py-1 rounded-full font-bold text-[var(--pms-ink)] border border-[var(--pms-border)]"
              style={{ background: 'var(--pms-soft-blue)' }}
            >
              Adaptive De-Glare &amp; Chalk Inversion
            </span>
            {slides.length > 0 && (
              <span
                className="px-3 py-1 rounded-full font-bold text-[var(--pms-ink)] border border-[var(--pms-border)]"
                style={{ background: 'var(--pms-soft-mint)' }}
              >
                <AnimatedNumber value={slides.length} /> photo{slides.length === 1 ? '' : 's'} loaded
              </span>
            )}
            {inkStats && (
              <span className="px-3 py-1 rounded-full font-bold bg-emerald-600 text-white">
                {inkStats.savedPercent}% Toner Saved
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {slides.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadJpg}
                  className="px-3.5 py-2 rounded-xl border border-[var(--pms-border)] bg-[var(--pms-white)] text-xs font-bold cursor-pointer hover:border-sky-500"
                >
                  Save JPG
                </button>
                <button
                  type="button"
                  onClick={handleDirectPrint}
                  disabled={isProcessing}
                  className="px-3.5 py-2 rounded-xl border border-[var(--pms-border)] bg-[var(--pms-white)] text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:border-sky-500"
                >
                  <Printer className="w-3.5 h-3.5 text-sky-600" /> Print
                </button>
              </>
            )}
            <button
              onClick={handleDownloadPdf}
              disabled={slides.length === 0 || isProcessing}
              className="pms-btn-primary px-5 py-2.5 rounded-xl font-bold text-xs disabled:opacity-40 flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" /> Download Clean Notes PDF ({slides.length || 0})
            </button>
          </div>
        </motion.div>

        {/* Workspace Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Controls (5 cols) */}
          <div className="lg:col-span-5 space-y-5">
            <div className="pms-glass-panel rounded-3xl p-5 space-y-5">
              <div className="flex items-center gap-2">
                <label className="flex-1 border-2 border-dashed border-[var(--pms-border-strong)] hover:border-sky-500 rounded-2xl p-5 text-center block cursor-pointer bg-[var(--pms-white)] transition-colors">
                  <div
                    className="w-11 h-11 rounded-2xl mx-auto mb-2.5 flex items-center justify-center border border-[var(--pms-border)]"
                    style={{ background: 'var(--pms-soft-blue)' }}
                  >
                    <Upload className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                  </div>
                  <span className="font-bold text-sm text-[var(--pms-ink)] block truncate">
                    {slides.length > 0 ? `${slides.length} Board Photo(s) — Replace All` : 'Upload Whiteboard / Blackboard Photos'}
                  </span>
                  <span className="text-[11px] text-[var(--pms-muted)] mt-1 block">
                    Supports batch multi-photo upload (JPG, PNG, WebP)
                  </span>
                  <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleFileInput(e, false)} />
                </label>

                {slides.length > 0 && (
                  <label className="px-3.5 py-5 rounded-2xl border border-[var(--pms-border)] bg-[var(--pms-soft-blue)] text-[var(--pms-ink)] text-xs font-bold flex flex-col items-center justify-center gap-1 cursor-pointer hover:opacity-90">
                    <Plus className="w-5 h-5 text-sky-600" />
                    <span>Add More</span>
                    <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleFileInput(e, true)} />
                  </label>
                )}
              </div>

              {/* Cleaning Modes */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--pms-muted)] uppercase tracking-wider flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  Enhancement Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: 'whiteboard_deglare', label: 'Whiteboard De-Glare', desc: 'Erases tube-light glare & shadows' },
                    { id: 'blackboard_invert', label: 'Chalk → Black Ink', desc: 'Green/Black board → white paper' },
                    { id: 'color_markers', label: 'Color Marker Boost', desc: 'Vivid red, blue & green diagrams' },
                    { id: 'pure_bw', label: 'Pure B&W Print', desc: 'High-contrast Xerox ready' },
                  ] as const).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setCleanMode(m.id)}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        cleanMode === m.id
                          ? 'bg-[var(--pms-soft-blue)] border-sky-500 text-[var(--pms-ink)] shadow-xs'
                          : 'bg-[var(--pms-white)] border-[var(--pms-border)] text-[var(--pms-muted)] hover:text-[var(--pms-ink)]'
                      }`}
                    >
                      <p className="text-xs font-bold">{m.label}</p>
                      <p className="text-[10px] opacity-80 mt-0.5">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Calibrated Sliders (Zero division-by-zero!) */}
              <div className="space-y-3.5 pt-3 border-t border-[var(--pms-border)] text-xs">
                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span>Adaptive Glare &amp; Shadow Removal</span>
                    <span className="font-mono text-sky-600 dark:text-sky-400">{glareRemoval}%</span>
                  </div>
                  <input type="range" min="0" max="100" value={glareRemoval} onChange={(e) => setGlareRemoval(Number(e.target.value))} className="w-full accent-sky-600" />
                </div>

                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span>Marker / Chalk Ink Boost</span>
                    <span className="font-mono text-sky-600 dark:text-sky-400">{markerBoost}%</span>
                  </div>
                  <input type="range" min="0" max="100" value={markerBoost} onChange={(e) => setMarkerBoost(Number(e.target.value))} className="w-full accent-sky-600" />
                </div>

                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span>Equation &amp; Text Sharpen</span>
                    <span className="font-mono text-sky-600 dark:text-sky-400">{sharpen}%</span>
                  </div>
                  <input type="range" min="0" max="100" value={sharpen} onChange={(e) => setSharpen(Number(e.target.value))} className="w-full accent-sky-600" />
                </div>
              </div>

              {/* Per-Slide Geometry Controls */}
              {activeSlide && (
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[var(--pms-border)] text-xs">
                  <button
                    type="button"
                    onClick={handleDeskewCurrent}
                    disabled={deskewing}
                    className="py-2 rounded-xl border border-[var(--pms-border)] bg-[var(--pms-white)] font-semibold flex items-center justify-center gap-1 hover:border-sky-500 cursor-pointer"
                  >
                    {deskewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Compass className="w-3.5 h-3.5 text-sky-600" />}
                    Deskew
                  </button>
                  <button
                    type="button"
                    onClick={handleRotateCurrent}
                    className="py-2 rounded-xl border border-[var(--pms-border)] bg-[var(--pms-white)] font-semibold flex items-center justify-center gap-1 hover:border-sky-500 cursor-pointer"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-sky-600" /> Rotate
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteCurrent}
                    className="py-2 rounded-xl border border-[var(--pms-border)] bg-[var(--pms-white)] font-semibold text-rose-600 flex items-center justify-center gap-1 hover:border-rose-500 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right Live Split Preview (7 cols) */}
          <div className="lg:col-span-7 pms-glass-panel rounded-3xl p-5 sm:p-6 space-y-4 relative overflow-hidden">
            <PearlScanOverlay active={isProcessing} label={statusLabel || 'Building clean lecture notes PDF...'} />

            {slides.length > 1 && (
              <div className="flex items-center justify-between text-xs font-semibold pb-2 border-b border-[var(--pms-border)]">
                <span className="truncate max-w-[60%] text-[var(--pms-muted)]">{activeSlide?.name}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveIdx(Math.max(0, activeIdx - 1))}
                    disabled={activeIdx === 0}
                    className="p-1.5 rounded-lg border border-[var(--pms-border)] bg-[var(--pms-white)] disabled:opacity-35 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-2 font-mono">
                    Board {activeIdx + 1} / {slides.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveIdx(Math.min(slides.length - 1, activeIdx + 1))}
                    disabled={activeIdx >= slides.length - 1}
                    className="p-1.5 rounded-lg border border-[var(--pms-border)] bg-[var(--pms-white)] disabled:opacity-35 cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {beforeUrl && afterUrl ? (
              <BeforeAfterSlider
                beforeSrc={beforeUrl}
                afterSrc={afterUrl}
                beforeLabel="Raw Classroom Photo"
                afterLabel="Cleaned Board Note"
                maxHeightClass="max-h-[560px]"
                badgeText={
                  inkStats
                    ? `Ink: ${inkStats.before.totalCoveragePct}% → ${inkStats.after.totalCoveragePct}%`
                    : 'De-Glare Active'
                }
              />
            ) : (
              <div className="w-full pms-paper-grid rounded-2xl p-6 flex items-center justify-center min-h-[420px] border border-[var(--pms-border)]">
                <div className="text-center space-y-3 text-[var(--pms-muted)] max-w-sm">
                  <Sun className="w-12 h-12 mx-auto opacity-35 text-sky-500" />
                  <p className="text-xs font-semibold">
                    Upload one or multiple whiteboard/blackboard photos to remove tube-light glare, invert chalk, and export a clean multi-page PDF.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <ToolSEOSection
          toolName="Classroom Board Notes Cleaner Pro"
          headline="De-Glare Whiteboards & Invert Blackboard Chalk to Crisp Printable PDF Notes"
          description="Uses local illumination normalization to erase classroom tube-light glare spots and dark board corners, flips green/black chalkboards to pure white paper (saving 90% printer toner), boosts multi-color markers, and compiles batch photos into a single A4 PDF."
          features={[
            {
              title: 'True Local De-Glare (No Blown Equations)',
              desc: 'Divides out uneven classroom tube-light reflections instead of using harsh global cutoffs.',
            },
            {
              title: 'Batch Multi-Board Lecture PDF',
              desc: 'Upload 10+ photos from a full lecture, auto-deskew each board, and export 1 crisp study PDF.',
            },
            {
              title: 'Chalk-to-Ink 90% Toner Saver',
              desc: 'Turns dark green/black chalkboards into spotless white sheets with sharp black writing.',
            },
          ]}
        />
      </div>
    </ToolWorkspaceShell>
  );
}
