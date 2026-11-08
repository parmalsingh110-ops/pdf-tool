import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  Printer,
  Sparkles,
  Sliders,
  CheckCircle2,
  RefreshCw,
  Eye,
  FileText,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  SunMedium,
  Contrast,
  Zap,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import ShareQrModal from '../components/ShareQrModal';
import { downloadBlob } from '../lib/utils';

type CleanMode = 'crisp_xerox' | 'grayscale' | 'toner_saver' | 'magic_color';

interface PageItem {
  id: number;
  originalCanvas: HTMLCanvasElement;
  cleanedCanvas: HTMLCanvasElement | null;
  cleanedDataUrl: string | null;
}

export default function XeroxCleaner() {
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
  const [contrastBoost, setContrastBoost] = useState<number>(20); // 0-50
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
        const jpgBytes = await fetch(jpgDataUrl).then((r) => r.arrayBuffer());
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
      const blob = new Blob([outBytes as any], { type: 'application/pdf' });
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-10 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider">
            <Zap className="w-4 h-4" /> Eco-Print & Photo State Special
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Ultra Xerox Eco-Cleaner & Ink Saver
          </h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
            Transform dark, yellow, shadow-filled mobile photos into 100% pure white, sharp black photocopies.
            Saves up to 60% printer toner and delivers crystal-clear prints.
          </p>
        </div>

        {/* Upload State */}
        {pages.length === 0 ? (
          <div className="max-w-2xl mx-auto">
            <label className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 rounded-3xl cursor-pointer bg-white dark:bg-slate-900 transition-all shadow-sm group">
              <input
                type="file"
                multiple
                accept=".pdf,image/png,image/jpeg,image/webp"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Upload className="w-8 h-8" />
              </div>
              <span className="text-base font-bold text-slate-900 dark:text-white mb-1">
                Drop Mobile Photos or Scanned PDF
              </span>
              <span className="text-xs text-slate-400 text-center max-w-xs">
                Upload student notes, marksheets, receipts, book pages, or certificates. Supports batch files.
              </span>
            </label>
          </div>
        ) : (
          /* Editor Layout */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Controls */}
            <div className="lg:col-span-4 space-y-5 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <span className="text-sm font-bold flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-500" /> Cleaner Controls
                </span>
                <button
                  onClick={() => setPages([])}
                  className="text-xs text-rose-500 hover:text-rose-600 font-semibold"
                >
                  Clear Files
                </button>
              </div>

              {/* Cleaning Mode Presets */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
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
                      className={`p-2.5 rounded-xl border text-left font-medium transition ${
                        cleanMode === m.id
                          ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="font-bold">{m.label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{m.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Whiteness Threshold Slider */}
              <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs">
                <div>
                  <div className="flex justify-between items-center font-semibold mb-1">
                    <span className="text-slate-700 dark:text-slate-300">Background Bleach Level</span>
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
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                    <span>Keep light pencils</span>
                    <span>Aggressive Whiten</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center font-semibold mb-1">
                    <span className="text-slate-700 dark:text-slate-300">Text Darkness Boost</span>
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
              {pages.length > 1 && (
                <div className="flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold">
                  <button
                    onClick={() => setActivePageIndex(Math.max(0, activePageIndex - 1))}
                    disabled={activePageIndex === 0}
                    className="p-1 rounded hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span>Page {activePageIndex + 1} of {pages.length}</span>
                  <button
                    onClick={() => setActivePageIndex(Math.min(pages.length - 1, activePageIndex + 1))}
                    disabled={activePageIndex === pages.length - 1}
                    className="p-1 rounded hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <button
                  onClick={handleDownloadPdf}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-md transition disabled:opacity-50"
                >
                  <Download className="w-4 h-4" /> Download Cleaned A4 PDF ({pages.length} pages)
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleDownloadCurrentJpg}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-semibold text-xs transition"
                  >
                    <Download className="w-3.5 h-3.5" /> Page {activePageIndex + 1} JPG
                  </button>
                  <button
                    onClick={() => setShowQrModal(true)}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 rounded-xl font-semibold text-xs transition"
                  >
                    <Smartphone className="w-3.5 h-3.5" /> Send to Phone
                  </button>
                </div>
              </div>
            </div>

            {/* Right Live Preview */}
            <div className="lg:col-span-8 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center">
              <div className="w-full flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-emerald-500" /> Cleaned Photocopy Preview
                </span>
                <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 rounded-lg">
                  100% White Paper Bleached
                </span>
              </div>

              {activePage?.cleanedDataUrl ? (
                <div className="w-full max-h-[640px] overflow-auto flex items-center justify-center p-4 bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <img
                    src={activePage.cleanedDataUrl}
                    alt={`Cleaned Document Page ${activePageIndex + 1}`}
                    className="max-h-[580px] w-auto object-contain rounded shadow-lg border border-slate-300 dark:border-slate-700"
                  />
                </div>
              ) : (
                <div className="w-full h-96 flex items-center justify-center text-slate-400 text-xs">
                  Cleaning document background...
                </div>
              )}
            </div>
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
    </div>
  );
}
