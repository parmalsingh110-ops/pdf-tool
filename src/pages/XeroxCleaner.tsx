import React, { useState, useEffect } from 'react';
import {
  Upload,
  Download,
  Sliders,
  Eye,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import ShareQrModal from '../components/ShareQrModal';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';
import { toArrayBufferBytes } from '../lib/blobUrl';
import { dataUrlToBytes, downloadBlob } from '../lib/utils';

type CleanMode = 'crisp_xerox' | 'grayscale' | 'toner_saver' | 'magic_color';

interface PageItem {
  id: number;
  originalCanvas: HTMLCanvasElement;
  cleanedCanvas: HTMLCanvasElement | null;
  cleanedDataUrl: string | null;
}

export default function XeroxCleaner() {
  const prefersReduced = useReducedMotion();

  useSEO(
    'Ultra Xerox Eco-Cleaner & Ink Saver — Whiten Document Background Online',
    'Remove yellow shadows, dark backgrounds, and phone lighting from mobile photos of documents. Turn phone photos into pure white, sharp black photocopy prints. Free & private.'
  );

  usePageSEO(
    'Xerox Eco-Cleaner — Mobile Document Photo to Clean Photocopy',
    'Free online tool for photo state shops, students and offices to turn muddy mobile scans and document photos into pure white crisp photocopies. Saves up to 60% printer toner.',
    'whiten document background online, photocopy cleaner, mobile photo to xerox pdf, remove yellow background from document photo, save printer toner pdf, camscanner clean effect online',
    '/xerox-cleaner'
  );

  const [files, setFiles] = useState<File[]>([]);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [cleanMode, setCleanMode] = useState<CleanMode>('crisp_xerox');
  const [whitenessThreshold, setWhitenessThreshold] = useState<number>(180); // 100-240
  const [textDarkness, setTextDarkness] = useState<number>(35); // 0-100
  const [contrastBoost] = useState<number>(20); // 0-50
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);

  // Pure processing function for a single page canvas
  const processCleanCanvas = (
    orig: HTMLCanvasElement,
    mode: CleanMode,
    thresh: number,
    darknessPct: number,
    _contrast: number
  ) => {
    const w = orig.width;
    const h = orig.height;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    if (!ctx) return { canvas: orig, dataUrl: orig.toDataURL('image/jpeg', 0.90) };

    ctx.drawImage(orig, 0, 0);
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const darkness = darknessPct / 100;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;

      if (mode === 'crisp_xerox') {
        if (gray >= thresh) {
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
        } else {
          const darkVal = Math.max(0, Math.floor(gray * (1 - darkness)));
          data[i] = darkVal;
          data[i + 1] = darkVal;
          data[i + 2] = darkVal;
        }
      } else if (mode === 'grayscale') {
        if (gray >= thresh) {
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
        } else {
          const remapped = (gray / thresh) * 220;
          data[i] = remapped;
          data[i + 1] = remapped;
          data[i + 2] = remapped;
        }
      } else if (mode === 'toner_saver') {
        if (gray >= thresh - 20) {
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
        } else {
          const lightened = Math.min(180, Math.max(80, gray));
          data[i] = lightened;
          data[i + 1] = lightened;
          data[i + 2] = lightened;
        }
      } else if (mode === 'magic_color') {
        const maxChannel = Math.max(r, g, b);
        const minChannel = Math.min(r, g, b);
        const saturation = maxChannel > 0 ? (maxChannel - minChannel) / maxChannel : 0;

        if (saturation < 0.18 && gray >= thresh - 15) {
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
        } else if (saturation >= 0.18) {
          data[i] = Math.min(255, r + 15);
          data[i + 1] = Math.min(255, g + 15);
          data[i + 2] = Math.min(255, b + 15);
        } else {
          data[i] = Math.max(0, r - 30);
          data[i + 1] = Math.max(0, g - 30);
          data[i + 2] = Math.max(0, b - 30);
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return {
      canvas: out,
      dataUrl: out.toDataURL('image/jpeg', 0.90),
    };
  };

  // Load uploaded files (multiple images or multi-page PDF)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;
    setFiles(selectedFiles);
    setIsProcessing(true);

    const loadedPages: PageItem[] = [];
    let pId = 1;

    try {
      for (const f of selectedFiles) {
        if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
          const arrayBuffer = await f.arrayBuffer();
          const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
          const pdf = await loadingTask.promise;

          for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const viewport = page.getViewport({ scale: 1.8 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
              const res = processCleanCanvas(canvas, cleanMode, whitenessThreshold, textDarkness, contrastBoost);
              loadedPages.push({
                id: pId++,
                originalCanvas: canvas,
                cleanedCanvas: res.canvas,
                cleanedDataUrl: res.dataUrl,
              });
            }
          }
        } else {
          // Image file
          await new Promise<void>((resolve) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(img, 0, 0);
                  const res = processCleanCanvas(canvas, cleanMode, whitenessThreshold, textDarkness, contrastBoost);
                  loadedPages.push({
                    id: pId++,
                    originalCanvas: canvas,
                    cleanedCanvas: res.canvas,
                    cleanedDataUrl: res.dataUrl,
                  });
                }
                resolve();
              };
              img.src = ev.target?.result as string;
            };
            reader.readAsDataURL(f);
          });
        }
      }

      setPages(loadedPages);
      setActivePageIndex(0);
    } catch (err) {
      console.error('Error loading documents:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Re-process pages when filter settings or loaded pages change (debounced for smooth 60fps sliders)
  useEffect(() => {
    if (pages.length === 0) return;

    const timer = setTimeout(() => {
      setPages((prevPages) =>
        prevPages.map((page) => {
          const res = processCleanCanvas(
            page.originalCanvas,
            cleanMode,
            whitenessThreshold,
            textDarkness,
            contrastBoost
          );
          return {
            ...page,
            cleanedCanvas: res.canvas,
            cleanedDataUrl: res.dataUrl,
          };
        })
      );
    }, 80);

    return () => clearTimeout(timer);
  }, [cleanMode, whitenessThreshold, textDarkness, contrastBoost, pages.length]);

  // Export all cleaned pages to single PDF
  const handleDownloadPdf = async () => {
    if (pages.length === 0) return;
    setIsProcessing(true);

    try {
      const pdfDoc = await PDFDocument.create();

      for (const p of pages) {
        const canvas = p.cleanedCanvas || p.originalCanvas;
        const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.92);
        const jpgBytes = dataUrlToBytes(jpgDataUrl);
        const jpgImage = await pdfDoc.embedJpg(jpgBytes);

        // Standard A4 point dimensions (595.28 x 841.89)
        const a4W = 595.28;
        const a4H = 841.89;

        // Scale image into A4 page
        const scale = Math.min(a4W / canvas.width, a4H / canvas.height);
        const drawW = canvas.width * scale;
        const drawH = canvas.height * scale;
        const x = (a4W - drawW) / 2;
        const y = (a4H - drawH) / 2;

        const page = pdfDoc.addPage([a4W, a4H]);
        page.drawImage(jpgImage, { x, y, width: drawW, height: drawH });
      }

      const outBytes = await pdfDoc.save();
      const blob = new Blob([toArrayBufferBytes(outBytes)], { type: 'application/pdf' });
      downloadBlob(blob, `clean-xerox-${Date.now()}.pdf`);
    } catch (err) {
      console.error('Error creating clean PDF:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Export current page as JPG
  const handleDownloadCurrentJpg = () => {
    const cur = pages[activePageIndex];
    if (!cur?.cleanedCanvas) return;
    cur.cleanedCanvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `clean-page-${activePageIndex + 1}.jpg`);
    }, 'image/jpeg', 0.95);
  };

  const activePage = pages[activePageIndex];

  return (
    <ToolWorkspaceShell
      title="Ultra Xerox Eco-Cleaner & Ink Saver"
      subtitle="Transform dark, yellow, shadow-filled mobile photos into 100% pure white, sharp black photocopies. Saves up to 60% printer toner and delivers crystal-clear prints."
      categoryLabel="Eco-Print & Photo State Special"
      icon={Zap}
      microVariant="ocr"
      tone="emerald"
      trustNote="100% pure-white background bleach · Browser-only image engine"
    >
      <div className="space-y-8">
        {/* Upload State */}
        {pages.length === 0 ? (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto pms-glass-panel rounded-3xl p-4 relative overflow-hidden"
          >
            <PearlScanOverlay active={isProcessing} label="Loading & bleaching uploaded pages..." />
            <label className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-[var(--pms-border-strong)] hover:border-emerald-500 rounded-2xl cursor-pointer bg-[var(--pms-white)] transition-all group">
              <input
                type="file"
                multiple
                accept=".pdf,image/png,image/jpeg,image/webp"
                onChange={handleFileUpload}
                className="hidden"
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
              <span className="text-xs text-[var(--pms-muted)] text-center max-w-xs">
                Upload student notes, marksheets, receipts, book pages, or certificates. Supports batch files.
              </span>
            </label>
          </motion.div>
        ) : (
          /* Editor Layout */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Controls */}
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="lg:col-span-4 space-y-5 pms-glass-panel p-6 rounded-3xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[var(--pms-border)]">
                <span className="text-sm font-bold text-[var(--pms-ink)] flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-500" /> Cleaner Controls
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded-full text-[var(--pms-ink)] border border-[var(--pms-border)]"
                    style={{ background: 'var(--pms-soft-blue)' }}
                  >
                    {files.length} file{files.length === 1 ? '' : 's'}
                  </span>
                  <button
                    onClick={() => setPages([])}
                    className="text-xs text-rose-500 hover:text-rose-600 font-semibold cursor-pointer"
                  >
                    Clear Files
                  </button>
                </div>
              </div>

              {/* Cleaning Mode Presets */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] mb-2">
                  Cleaning Mode
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { id: 'crisp_xerox', label: 'Crisp Xerox (B&W)', desc: '100% white + black ink' },
                    { id: 'grayscale', label: 'Smooth Grayscale', desc: 'Photos & diagrams' },
                    { id: 'toner_saver', label: 'Toner Saver (Eco)', desc: 'Saves 50% printer ink' },
                    { id: 'magic_color', label: 'Magic Color Scan', desc: 'Keeps blue pens & stamps' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setCleanMode(m.id as CleanMode)}
                      className={`p-2.5 rounded-xl border text-left font-medium transition cursor-pointer ${
                        cleanMode === m.id
                          ? 'border-emerald-500 bg-[var(--pms-soft-mint)] text-[var(--pms-ink)] shadow-sm'
                          : 'border-[var(--pms-border)] bg-[var(--pms-white)] text-[var(--pms-muted)] hover:text-[var(--pms-ink)]'
                      }`}
                    >
                      <div className="font-bold">{m.label}</div>
                      <div className="text-[10px] opacity-75 mt-0.5">{m.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Whiteness Threshold Slider */}
              <div className="space-y-3 p-4 bg-[var(--pms-white)] rounded-2xl border border-[var(--pms-border)] text-xs">
                <div>
                  <div className="flex justify-between items-center font-semibold mb-1">
                    <span className="text-[var(--pms-ink)]">Background Bleach Level</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono">{whitenessThreshold}</span>
                  </div>
                  <input
                    type="range"
                    min="120"
                    max="230"
                    value={whitenessThreshold}
                    onChange={(e) => setWhitenessThreshold(Number(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                  <div className="flex justify-between text-[10px] text-[var(--pms-muted)] mt-1">
                    <span>Keep light pencils</span>
                    <span>Aggressive Whiten</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center font-semibold mb-1">
                    <span className="text-[var(--pms-ink)]">Text Darkness Boost</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono">{textDarkness}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="80"
                    value={textDarkness}
                    onChange={(e) => setTextDarkness(Number(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>
              </div>

              {/* Page Navigator */}
              <AnimatePresence>
                {pages.length > 1 && (
                  <motion.div
                    initial={prefersReduced ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={prefersReduced ? undefined : { opacity: 0, height: 0 }}
                    className="flex items-center justify-between p-3 bg-[var(--pms-white)] border border-[var(--pms-border)] rounded-xl text-xs font-semibold text-[var(--pms-ink)]"
                  >
                    <button
                      onClick={() => setActivePageIndex(Math.max(0, activePageIndex - 1))}
                      disabled={activePageIndex === 0}
                      className="p-1.5 rounded-lg hover:bg-[var(--pms-soft-lavender)] disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span>
                      Page {activePageIndex + 1} of <AnimatedNumber value={pages.length} />
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

              {/* Action Buttons */}
              <div className="pt-3 border-t border-[var(--pms-border)] space-y-2">
                <button
                  onClick={handleDownloadPdf}
                  disabled={isProcessing}
                  className="pms-btn-primary w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-bold text-sm transition disabled:opacity-50 cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Download Cleaned A4 PDF (<AnimatedNumber value={pages.length} /> pages)
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleDownloadCurrentJpg}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-[var(--pms-white)] border border-[var(--pms-border)] hover:border-[var(--pms-border-strong)] text-[var(--pms-ink)] rounded-xl font-semibold text-xs transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Page {activePageIndex + 1} JPG
                  </button>
                  <button
                    onClick={() => setShowQrModal(true)}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 border border-[var(--pms-border)] text-[var(--pms-ink)] rounded-xl font-semibold text-xs transition cursor-pointer hover:opacity-90"
                    style={{ background: 'var(--pms-soft-blue)' }}
                  >
                    <Smartphone className="w-3.5 h-3.5 text-[var(--pms-blue)]" /> Send to Phone
                  </button>
                </div>
              </div>
            </motion.div>

            {/* Right Live Preview */}
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 }}
              className="lg:col-span-8 pms-glass-panel p-6 rounded-3xl flex flex-col items-center relative overflow-hidden"
            >
              <PearlScanOverlay active={isProcessing} label="Bleaching paper & assembling A4 PDF..." />

              <div className="w-full flex items-center justify-between mb-4 flex-wrap gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-emerald-500" /> Cleaned Photocopy Preview
                </span>
                <span
                  className="text-xs font-semibold px-2.5 py-1 text-[var(--pms-ink)] rounded-full border border-[var(--pms-border)]"
                  style={{ background: 'var(--pms-soft-mint)' }}
                >
                  100% White Paper Bleached
                </span>
              </div>

              {activePage?.cleanedDataUrl ? (
                <div className="w-full max-h-[640px] overflow-auto flex items-center justify-center p-4 pms-paper-grid rounded-2xl border border-[var(--pms-border)]">
                  <img
                    src={activePage.cleanedDataUrl}
                    alt={`Cleaned Document Page ${activePageIndex + 1}`}
                    className="max-h-[580px] w-auto object-contain rounded bg-white shadow-lg border border-[var(--pms-border-strong)]"
                  />
                </div>
              ) : (
                <div className="w-full h-96 flex items-center justify-center text-[var(--pms-muted)] text-xs">
                  Cleaning document background...
                </div>
              )}
            </motion.div>
          </div>
        )}

        {/* SEO Section */}
        <ToolSEOSection
          toolName="Ultra Xerox Eco-Cleaner"
          headline="Convert Muddy Phone Photos of Documents into Crisp Clean Photocopies"
          description="Taking photos of documents with a smartphone often results in yellow room lighting, gray table shadows, and wrinkled paper backgrounds. If printed directly, photocopy machines waste excessive black toner resulting in muddy prints. Our Ultra Xerox Eco-Cleaner automatically normalizes paper luminance to 100% pure white (#FFFFFF) while sharpening handwritten or printed text."
          steps={[
            {
              step: '01',
              title: 'Upload Mobile Photos or PDF',
              desc: 'Select one or more phone photos of your notes, certificates, bills, or a multi-page PDF.',
            },
            {
              step: '02',
              title: 'Choose Cleaning Preset',
              desc: 'Select Crisp Xerox for classic photocopy, Toner Saver to reduce printer ink usage, or Magic Color to retain colored stamps and signatures.',
            },
            {
              step: '03',
              title: 'Download Clean A4 PDF',
              desc: 'Get an ultra-sharp, professional PDF ready for printing or instant submission.',
            },
          ]}
          features={[
            {
              title: '100% White Paper Clamp',
              desc: 'Eliminates gray backgrounds and yellow tungsten lighting shadows completely.',
            },
            {
              title: 'Toner Saver Eco-Mode',
              desc: 'Specially engineered for students printing 50+ page syllabus notes without running out of ink.',
            },
            {
              title: 'Magic Color Signature Retention',
              desc: 'Bleaches dirty paper background while keeping blue ink ballpoint signatures and official red seals vibrant.',
            },
          ]}
          faqs={[
            {
              q: 'How does this tool save printer toner?',
              a: 'A standard photocopy machine attempts to print all gray paper shadows as dots of black toner. By converting the entire paper area to pure white (RGB 255, 255, 255), the printer dispenses toner ONLY on the actual text characters, saving up to 60% toner.',
            },
            {
              q: 'Can I upload multiple photos at once?',
              a: 'Yes, you can upload multiple images simultaneously. The tool will process all of them and compile them into a single, clean multi-page A4 PDF.',
            },
          ]}
        />

        {/* Mobile Transfer Modal */}
        <ShareQrModal
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          title="Cleaned Photocopy PDF"
          fileName="clean-xerox.pdf"
        />
      </div>
    </ToolWorkspaceShell>
  );
}
