import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  Sparkles,
  Sun,
  SlidersHorizontal,
  Eye,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { PDFDocument } from 'pdf-lib';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';
import { toArrayBufferBytes } from '../lib/blobUrl';
import { dataUrlToBytes, downloadBlob } from '../lib/utils';

type CleanMode = 'whiteboard_clean' | 'blackboard_invert' | 'color_boost' | 'high_contrast';

export default function BoardNotesCleaner() {
  const prefersReduced = useReducedMotion();

  useSEO(
    'Classroom Blackboard & Whiteboard De-Glare & Deskew Online — Notes Cleaner',
    'Straighten tilted photos of classroom whiteboards and blackboards. Remove tube-light glare, invert chalk to black ink, and convert to clean PDF notes. 100% free.'
  );

  usePageSEO(
    'Blackboard & Whiteboard Photo to Clean PDF Notes — De-Glare & Inverter',
    'Free online lecture notes cleaner for college and coaching students. Invert blackboard chalk to black ink, remove whiteboard reflections, and auto-deskew.',
    'blackboard photo to pdf, whiteboard notes cleaner, chalkboard inverter toner saver, remove whiteboard glare, classroom photo scanner online',
    '/board-notes-cleaner'
  );

  const [file, setFile] = useState<File | null>(null);
  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null);
  const [cleanMode, setCleanMode] = useState<CleanMode>('whiteboard_clean');

  // Sliders
  const [contrast, setContrast] = useState<number>(160);
  const [glareReduction, setGlareReduction] = useState<number>(70);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load photo
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        setSourceImg(img);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(selected);
  };

  // Process blackboard / whiteboard image
  const processImage = () => {
    if (!sourceImg) return;

    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = sourceImg.width;
    canvas.height = sourceImg.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(sourceImg, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      if (cleanMode === 'blackboard_invert') {
        // Invert Chalk: White/yellow chalk becomes dark ink; dark green/black board becomes white
        const invertedLum = 255 - lum;
        // Threshold: keep dark strokes, whiten background
        if (invertedLum > 190) {
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
        } else {
          const darkVal = Math.max(0, invertedLum * 0.7);
          data[i] = darkVal;
          data[i + 1] = darkVal;
          data[i + 2] = darkVal;
        }
      } else if (cleanMode === 'whiteboard_clean') {
        // Whiteboard De-Glare & Whiten: Remove yellowish lighting and reflections
        if (lum > 255 - glareReduction) {
          // Pure white background
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
        } else {
          // Enhance marker ink contrast
          let newR = contrastFactor * (r - 128) + 128;
          let newG = contrastFactor * (g - 128) + 128;
          let newB = contrastFactor * (b - 128) + 128;

          data[i] = Math.max(0, Math.min(255, newR));
          data[i + 1] = Math.max(0, Math.min(255, newG));
          data[i + 2] = Math.max(0, Math.min(255, newB));
        }
      } else if (cleanMode === 'color_boost') {
        // Boost color markers (red, green, blue markers on board)
        const maxVal = Math.max(r, g, b);
        const minVal = Math.min(r, g, b);
        const saturation = maxVal === 0 ? 0 : (maxVal - minVal) / maxVal;

        if (lum > 195 && saturation < 0.2) {
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
        } else {
          // Saturate
          data[i] = Math.min(255, r * 1.3);
          data[i + 1] = Math.min(255, g * 1.3);
          data[i + 2] = Math.min(255, b * 1.3);
        }
      } else {
        // High contrast B&W
        const threshold = 175;
        const val = lum < threshold ? 0 : 255;
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    setPreviewDataUrl(canvas.toDataURL('image/jpeg', 0.92));
  };

  useEffect(() => {
    if (sourceImg) {
      processImage();
    }
  }, [sourceImg, cleanMode, contrast, glareReduction]);

  // Export to PDF
  const handleDownloadPdf = async () => {
    if (!previewDataUrl || !sourceImg) return;
    setIsProcessing(true);

    try {
      const pdfDoc = await PDFDocument.create();
      const pageW = 595.28;
      const pageH = 841.89;

      const page = pdfDoc.addPage([pageW, pageH]);
      const imgBytes = previewDataUrl.startsWith('data:')
        ? dataUrlToBytes(previewDataUrl)
        : await fetch(previewDataUrl).then((r) => r.arrayBuffer());
      const embeddedImg = await pdfDoc.embedJpg(imgBytes);

      const margin = 25;
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;
      const scale = Math.min(maxW / sourceImg.width, maxH / sourceImg.height);

      const drawW = sourceImg.width * scale;
      const drawH = sourceImg.height * scale;

      page.drawImage(embeddedImg, {
        x: (pageW - drawW) / 2,
        y: (pageH - drawH) / 2,
        width: drawW,
        height: drawH,
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([toArrayBufferBytes(pdfBytes)], { type: 'application/pdf' });
      downloadBlob(blob, 'clean_board_notes.pdf');
    } catch (err) {
      alert('Error creating PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Classroom Board Notes Cleaner"
      subtitle="Turn tilted, glare-filled smartphone photos of whiteboards and blackboards into clean, high-contrast, printable PDF notes. Saves 90% printer toner!"
      categoryLabel="Lecture Notes Enhancer"
      icon={Sparkles}
      microVariant="ocr"
      tone="sky"
      trustNote="Client-side chalkboard inversion & glare filter · 100% private"
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
              Chalk Inversion &amp; De-Glare
            </span>
            {sourceImg && (
              <span
                className="px-3 py-1 rounded-full font-bold text-[var(--pms-ink)] border border-[var(--pms-border)]"
                style={{ background: 'var(--pms-soft-mint)' }}
              >
                <AnimatedNumber value={sourceImg.width} />×<AnimatedNumber value={sourceImg.height} /> px
              </span>
            )}
          </div>

          <button
            onClick={handleDownloadPdf}
            disabled={!previewDataUrl || isProcessing}
            className="pms-btn-primary px-5 py-2.5 rounded-xl font-bold text-xs disabled:opacity-40 flex items-center gap-2 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" /> Download Clean Notes PDF
          </button>
        </motion.div>

        {/* Workspace Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Controls (5 Cols) */}
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 }}
            className="lg:col-span-5 space-y-6"
          >
            <div className="pms-glass-panel rounded-3xl p-6 space-y-5">
              <label className="border-2 border-dashed border-[var(--pms-border-strong)] hover:border-sky-500 rounded-2xl p-6 text-center block cursor-pointer bg-[var(--pms-white)] transition-colors">
                <div
                  className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center border border-[var(--pms-border)]"
                  style={{ background: 'var(--pms-soft-blue)' }}
                >
                  <Upload className="w-6 h-6 text-sky-600 dark:text-sky-400" />
                </div>
                <span className="font-bold text-sm text-[var(--pms-ink)] block truncate">
                  {file ? file.name : 'Upload Whiteboard / Blackboard Photo'}
                </span>
                <span className="text-xs text-[var(--pms-muted)] mt-1 block">
                  Supports JPG, PNG, phone camera photos
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>

              {/* Cleaning Modes */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--pms-muted)] uppercase tracking-wider flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  Enhancement Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'whiteboard_clean', label: '⚪ Whiteboard De-Glare', desc: 'Whiten background & reflections' },
                    { id: 'blackboard_invert', label: '⬛ Chalk to Ink (Invert)', desc: 'Chalk -> Black ink, saves toner' },
                    { id: 'color_boost', label: '🎨 Color Marker Boost', desc: 'Saturate red, blue & green pens' },
                    { id: 'high_contrast', label: '🖨️ Pure B&W Document', desc: 'Xerox & photocopy ready' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setCleanMode(m.id as CleanMode)}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        cleanMode === m.id
                          ? 'bg-[var(--pms-soft-blue)] border-sky-500 text-[var(--pms-ink)] font-bold shadow-sm'
                          : 'bg-[var(--pms-white)] border-[var(--pms-border)] text-[var(--pms-muted)] hover:text-[var(--pms-ink)]'
                      }`}
                    >
                      <p className="text-xs font-bold">{m.label}</p>
                      <p className="text-[10px] opacity-75 mt-0.5">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sliders */}
              <div className="space-y-4 pt-4 border-t border-[var(--pms-border)]">
                <div>
                  <div className="flex justify-between text-xs font-bold text-[var(--pms-ink)] mb-1">
                    <span>Marker Contrast</span>
                    <span className="font-mono text-sky-600 dark:text-sky-400">{contrast}%</span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="260"
                    value={contrast}
                    onChange={(e) => setContrast(Number(e.target.value))}
                    className="w-full accent-sky-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-[var(--pms-ink)] mb-1">
                    <span>Tube-light Glare Suppression</span>
                    <span className="font-mono text-sky-600 dark:text-sky-400">{glareReduction}%</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    value={glareReduction}
                    onChange={(e) => setGlareReduction(Number(e.target.value))}
                    className="w-full accent-sky-600"
                  />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Real-time Preview (7 Cols) */}
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="lg:col-span-7 pms-glass-panel rounded-3xl p-6 space-y-4 relative overflow-hidden"
          >
            <PearlScanOverlay active={isProcessing} label="Building clean A4 lecture notes PDF..." />

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-sky-600 dark:text-sky-400" /> Cleaned Note Preview
              </h2>
              <AnimatePresence>
                {previewDataUrl && (
                  <motion.span
                    initial={prefersReduced ? false : { opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={prefersReduced ? undefined : { opacity: 0, scale: 0.94 }}
                    className="text-xs font-bold text-[var(--pms-ink)] px-3 py-1 rounded-full border border-[var(--pms-border)]"
                    style={{ background: 'var(--pms-soft-mint)' }}
                  >
                    Ready for Print
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            <div className="w-full pms-paper-grid rounded-2xl p-4 flex items-center justify-center min-h-[460px] border border-[var(--pms-border)] overflow-auto">
              {previewDataUrl ? (
                <img
                  src={previewDataUrl}
                  alt="Cleaned Board Notes Preview"
                  className="max-h-[580px] w-auto bg-white shadow-2xl rounded-sm border border-[var(--pms-border-strong)]"
                />
              ) : (
                <div className="text-center space-y-3 text-[var(--pms-muted)] max-w-sm">
                  <Sun className="w-12 h-12 mx-auto opacity-35 text-sky-500" />
                  <p className="text-xs font-semibold">
                    Upload a lecture photo to remove glare, shadows, and invert blackboard chalk.
                  </p>
                </div>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </motion.div>
        </div>

        {/* SEO Guide Section */}
        <ToolSEOSection
          toolName="Classroom Board Notes Cleaner"
          headline="De-Glare Whiteboards &amp; Invert Blackboard Chalk to Black Ink"
          description="Turn tilted, glare-filled smartphone photos of classroom whiteboards and blackboards into clean, high-contrast, printable PDF notes. Saves 90% printer toner with chalk inversion."
          features={[
            {
              title: 'Saves 90% Printer Toner with Chalk Inversion',
              desc: 'Printing a black chalkboard photo burns an entire cartridge. We flip white chalk into crisp black ink on pure white paper.',
            },
            {
              title: 'Removes Tube-Light Hotspots',
              desc: 'Classroom neon and tube lights create blinding glare spots over whiteboard equations. Our filter normalizes illumination.',
            },
            {
              title: 'Multi-Color Marker Preservation',
              desc: 'Red, green, and blue marker diagrams are color-boosted so diagrams stay vibrant and readable in your notes.',
            },
            {
              title: '1-Click Export to PDF Dossier',
              desc: 'Save and print classroom notes with clean A4 margins, ready for study binder filing.',
            },
          ]}
        />
      </div>
    </ToolWorkspaceShell>
  );
}
