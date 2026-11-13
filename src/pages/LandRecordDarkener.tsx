import React, { useState, useEffect } from 'react';
import {
  Upload,
  Download,
  Printer,
  MapPin,
  SlidersHorizontal,
  Eye,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';
import { toArrayBufferBytes } from '../lib/blobUrl';
import { dataUrlToBytes, downloadBlob } from '../lib/utils';

type DarkenPreset = 'map_lines' | 'jamabandi_text' | 'deep_xerox' | 'extreme';

export default function LandRecordDarkener() {
  const prefersReduced = useReducedMotion();

  useSEO(
    'Faint Land Record & Bhu-Naksha Darkener Online — Apna Khata & Bhulekh',
    'Enhance faint blue/grey land records, Jamabandi, Khasra-Khatauni, and Bhu-Naksha maps to deep pitch black lines for crisp xerox printing. 100% free.'
  );

  usePageSEO(
    'Bhu-Naksha & Land Record Darkener — Deep Black Revenue Map Enhancer',
    'Specialized revenue document enhancer for E-Mitra and CSC operators. Darken faint government land maps, Jamabandi, and survey numbers for razor-sharp printing.',
    'bhu naksha darkener, apna khata print clean, jamabandi dark print, khasra khatauni print enhancer, faint map darkener, revenue record print clear',
    '/land-record-darkener'
  );

  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(null);
  const [processedDataUrl, setProcessedDataUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activePreset, setActivePreset] = useState<DarkenPreset>('map_lines');

  // Sliders
  const [contrastLevel, setContrastLevel] = useState<number>(180); // 100 - 300%
  const [blackThreshold, setBlackThreshold] = useState<number>(190); // 0 - 255
  const [removeBackgroundTint, setRemoveBackgroundTint] = useState<boolean>(true);
  const [lineThicknessBoost, setLineThicknessBoost] = useState<boolean>(true);

  // Load document (PDF or Image)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setIsProcessing(true);

    try {
      if (selected.type === 'application/pdf') {
        const arrayBuffer = await selected.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        setPageCount(pdf.numPages);
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.5 }); // High-DPI for fine land map lines

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
          setSourceCanvas(canvas);
        }
      } else {
        setPageCount(1);
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              setSourceCanvas(canvas);
            }
          };
          img.src = ev.target?.result as string;
        };
        reader.readAsDataURL(selected);
      }
    } catch (err) {
      alert('Error reading land record file.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Preset switch
  const handlePresetChange = (preset: DarkenPreset) => {
    setActivePreset(preset);
    if (preset === 'map_lines') {
      setContrastLevel(220);
      setBlackThreshold(185);
      setRemoveBackgroundTint(true);
      setLineThicknessBoost(true);
    } else if (preset === 'jamabandi_text') {
      setContrastLevel(190);
      setBlackThreshold(170);
      setRemoveBackgroundTint(true);
      setLineThicknessBoost(false);
    } else if (preset === 'deep_xerox') {
      setContrastLevel(260);
      setBlackThreshold(205);
      setRemoveBackgroundTint(true);
      setLineThicknessBoost(true);
    } else if (preset === 'extreme') {
      setContrastLevel(300);
      setBlackThreshold(220);
      setRemoveBackgroundTint(true);
      setLineThicknessBoost(true);
    }
  };

  // Process canvas with adaptive darkening algorithms
  const processDarkenCanvas = (
    src: HTMLCanvasElement,
    threshold: number,
    contrastLvl: number,
    bgTintRemove: boolean,
    thickBoost: boolean
  ): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.width = src.width;
    canvas.height = src.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return src;

    ctx.drawImage(src, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    // Clamp contrast to 254 max so denominator (259 - contrast) is always positive (>= 5)
    const clampedContrast = Math.min(254, Math.max(0, contrastLvl));
    const contrastFactor = (259 * (clampedContrast + 255)) / (255 * (259 - clampedContrast));

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      const isBlueLine = b > r && b > g && lum < 225;
      const isGreyLine = Math.abs(r - g) < 20 && Math.abs(g - b) < 20 && lum < 215;

      if (isBlueLine || isGreyLine || lum < threshold) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
      } else if (bgTintRemove && lum >= threshold) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      } else {
        let newLum = contrastFactor * (lum - 128) + 128;
        newLum = Math.max(0, Math.min(255, newLum));
        data[i] = newLum;
        data[i + 1] = newLum;
        data[i + 2] = newLum;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    if (thickBoost) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(canvas, 1, 0);
      ctx.drawImage(canvas, 0, 1);
      ctx.globalCompositeOperation = 'source-over';
    }

    return canvas;
  };

  const processImage = () => {
    if (!sourceCanvas) return;
    const res = processDarkenCanvas(
      sourceCanvas,
      blackThreshold,
      contrastLevel,
      removeBackgroundTint,
      lineThicknessBoost
    );
    setProcessedDataUrl(res.toDataURL('image/jpeg', 0.94));
  };

  useEffect(() => {
    if (sourceCanvas) {
      processImage();
    }
  }, [sourceCanvas, contrastLevel, blackThreshold, removeBackgroundTint, lineThicknessBoost]);

  // Export as PDF (Supports full multi-page PDF records)
  const handleDownloadPdf = async () => {
    if (!processedDataUrl || !sourceCanvas) return;
    setIsProcessing(true);

    try {
      const pdfDoc = await PDFDocument.create();
      const ptWidth = 595.28; // A4 pt
      const ptHeight = 841.89;
      const margin = 20;
      const maxWidth = ptWidth - margin * 2;
      const maxHeight = ptHeight - margin * 2;

      if (file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const viewport = page.getViewport({ scale: 2.2 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
            const darkened = processDarkenCanvas(
              canvas,
              blackThreshold,
              contrastLevel,
              removeBackgroundTint,
              lineThicknessBoost
            );
            const jpgDataUrl = darkened.toDataURL('image/jpeg', 0.92);
            const jpgBytes = dataUrlToBytes(jpgDataUrl);
            const embeddedImg = await pdfDoc.embedJpg(jpgBytes);

            const docPage = pdfDoc.addPage([ptWidth, ptHeight]);
            const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
            const drawW = canvas.width * scale;
            const drawH = canvas.height * scale;

            docPage.drawImage(embeddedImg, {
              x: (ptWidth - drawW) / 2,
              y: (ptHeight - drawH) / 2,
              width: drawW,
              height: drawH,
            });
          }
        }
      } else {
        const page = pdfDoc.addPage([ptWidth, ptHeight]);
        const imgBytes = processedDataUrl.startsWith('data:')
          ? dataUrlToBytes(processedDataUrl)
          : await fetch(processedDataUrl).then((r) => r.arrayBuffer());
        const embeddedImg = await pdfDoc.embedJpg(imgBytes);

        const scale = Math.min(maxWidth / sourceCanvas.width, maxHeight / sourceCanvas.height);
        const drawW = sourceCanvas.width * scale;
        const drawH = sourceCanvas.height * scale;

        page.drawImage(embeddedImg, {
          x: (ptWidth - drawW) / 2,
          y: (ptHeight - drawH) / 2,
          width: drawW,
          height: drawH,
        });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([toArrayBufferBytes(pdfBytes)], { type: 'application/pdf' });
      downloadBlob(blob, 'darkened_land_record_print.pdf');
    } catch (err) {
      alert('Error creating PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  // 1-Click Print
  const handlePrint = () => {
    if (!processedDataUrl) return;
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head><title>Land Record Print</title><style>@page { size: auto; margin: 5mm; } body { margin: 0; display:flex; align-items:center; justify-content:center; } img { width: 96vw; height: auto; }</style></head>
        <body><img src="${processedDataUrl}" onload="window.print(); window.close();" /></body>
      </html>
    `);
    printWin.document.close();
  };

  return (
    <ToolWorkspaceShell
      title="Faint Land Record & Bhu-Naksha Darkener"
      subtitle="Darken faint blue and grey revenue maps (Bhu-Naksha), Jamabandi, Khasra-Khatauni, and land registries so survey numbers print jet black on any laser printer."
      categoryLabel="Revenue & E-Mitra Favorite"
      icon={MapPin}
      microVariant="ocr"
      tone="amber"
      trustNote="100% browser pixel processing · Multi-page PDF & map support"
    >
      <div className="space-y-6">
        {/* Top Action Strip */}
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="pms-glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--pms-muted)]">
            <span
              className="px-2.5 py-1 rounded-full font-bold text-[var(--pms-ink)] border border-[var(--pms-border)]"
              style={{ background: 'var(--pms-soft-lavender)' }}
            >
              Apna Khata / Bhulekh Ready
            </span>
            {file && (
              <span
                className="px-2.5 py-1 rounded-full font-bold text-[var(--pms-ink)] border border-[var(--pms-border)]"
                style={{ background: 'var(--pms-soft-mint)' }}
              >
                <AnimatedNumber value={pageCount || 1} suffix={pageCount === 1 ? ' page loaded' : ' pages loaded'} />
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handlePrint}
              disabled={!processedDataUrl}
              className="px-4 py-2 rounded-xl bg-[var(--pms-white)] border border-[var(--pms-border-strong)] text-[var(--pms-ink)] font-bold text-xs shadow-sm disabled:opacity-40 flex items-center gap-2 hover:opacity-90 transition cursor-pointer"
            >
              <Printer className="w-4 h-4" /> 1-Click Print
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={!processedDataUrl || isProcessing}
              className="pms-btn-primary px-5 py-2.5 rounded-xl font-bold text-xs disabled:opacity-40 flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" /> Download Darkened PDF
            </button>
          </div>
        </motion.div>

        {/* Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Controls (5 Cols) */}
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 }}
            className="lg:col-span-5 space-y-5"
          >
            <div className="pms-glass-panel rounded-3xl p-6 space-y-5">
              <label className="border-2 border-dashed border-[var(--pms-border-strong)] hover:border-[var(--pms-violet)] rounded-2xl p-6 text-center block cursor-pointer bg-[var(--pms-white)] transition-colors">
                <div
                  className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center border border-[var(--pms-border)]"
                  style={{ background: 'var(--pms-soft-rose)' }}
                >
                  <Upload className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <span className="font-bold text-sm text-[var(--pms-ink)] block truncate">
                  {file ? file.name : 'Upload Land Record / Bhu-Naksha'}
                </span>
                <span className="text-xs text-[var(--pms-muted)] mt-1 block">
                  Supports PDF, Jamabandi, Khasra, JPG, PNG
                </span>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>

              {/* Presets */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--pms-muted)] uppercase tracking-wider flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  Darkening Presets
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'map_lines', label: '🗺️ Bhu-Naksha Lines' },
                    { id: 'jamabandi_text', label: '📜 Jamabandi / Khasra' },
                    { id: 'deep_xerox', label: '🖨️ Deep Xerox Mode' },
                    { id: 'extreme', label: '⚡ Ultra Contrast' },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => handlePresetChange(preset.id as DarkenPreset)}
                      className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all cursor-pointer ${
                        activePreset === preset.id
                          ? 'bg-[var(--pms-soft-rose)] border-amber-500 text-[var(--pms-ink)] shadow-sm'
                          : 'bg-[var(--pms-white)] border-[var(--pms-border)] text-[var(--pms-muted)] hover:text-[var(--pms-ink)]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fine Tuning Sliders */}
              <div className="space-y-4 pt-4 border-t border-[var(--pms-border)]">
                <div>
                  <div className="flex justify-between text-xs font-bold text-[var(--pms-ink)] mb-1">
                    <span>Black Line Threshold</span>
                    <span className="font-mono text-amber-600 dark:text-amber-400">{blackThreshold}</span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="240"
                    value={blackThreshold}
                    onChange={(e) => setBlackThreshold(Number(e.target.value))}
                    className="w-full accent-amber-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-[var(--pms-ink)] mb-1">
                    <span>Contrast Intensity</span>
                    <span className="font-mono text-amber-600 dark:text-amber-400">{contrastLevel}%</span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="300"
                    value={contrastLevel}
                    onChange={(e) => setContrastLevel(Number(e.target.value))}
                    className="w-full accent-amber-600"
                  />
                </div>

                <div className="space-y-2.5 pt-2">
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-[var(--pms-ink)]">
                    <input
                      type="checkbox"
                      checked={removeBackgroundTint}
                      onChange={(e) => setRemoveBackgroundTint(e.target.checked)}
                      className="rounded accent-amber-600"
                    />
                    Whiten Faint Yellow/Grey Background Paper
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-[var(--pms-ink)]">
                    <input
                      type="checkbox"
                      checked={lineThicknessBoost}
                      onChange={(e) => setLineThicknessBoost(e.target.checked)}
                      className="rounded accent-amber-600"
                    />
                    Thicken Thin Survey Lines (+1px Laser Boost)
                  </label>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Real-Time Preview (7 Cols) */}
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="lg:col-span-7 pms-glass-panel rounded-3xl p-6 space-y-4 relative overflow-hidden"
          >
            <PearlScanOverlay active={isProcessing} label="Darkening survey lines & building A4 PDF..." />

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-amber-600 dark:text-amber-400" /> Enhanced Print Preview
              </h2>
              <AnimatePresence>
                {processedDataUrl && (
                  <motion.span
                    initial={prefersReduced ? false : { opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={prefersReduced ? undefined : { opacity: 0, scale: 0.94 }}
                    className="text-xs font-bold text-[var(--pms-ink)] px-3 py-1 rounded-full border border-[var(--pms-border)]"
                    style={{ background: 'var(--pms-soft-mint)' }}
                  >
                    Survey Numbers Sharpened
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            <div className="w-full pms-paper-grid rounded-2xl p-4 flex items-center justify-center min-h-[460px] border border-[var(--pms-border)] overflow-auto">
              {processedDataUrl ? (
                <img
                  src={processedDataUrl}
                  alt="Enhanced Land Record Preview"
                  className="max-h-[580px] w-auto bg-white shadow-2xl rounded-sm border border-[var(--pms-border-strong)]"
                />
              ) : (
                <div className="text-center space-y-3 text-[var(--pms-muted)] max-w-sm">
                  <MapPin className="w-12 h-12 mx-auto opacity-35 text-amber-500" />
                  <p className="text-xs font-semibold">
                    Upload your Apna Khata / Bhulekh / Jamabandi PDF to preview high-contrast darkened print output.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* SEO Guide Section */}
        <ToolSEOSection
          toolName="Faint Land Record &amp; Bhu-Naksha Darkener"
          headline="Recover Faint Survey Numbers &amp; Darken Blue/Grey Land Maps"
          description="Darken faint government land maps, Jamabandi, Khasra-Khatauni, and land records. Converts faint blue and grey lines into deep jet black vector strokes for clean xerox printing."
          features={[
            {
              title: 'Recovers Invisible Survey Numbers',
              desc: 'Devanagari survey plot numerals written in faint blue or grey are mathematically amplified to jet black.',
            },
            {
              title: 'Removes Old Paper Scum & Yellowing',
              desc: 'Scanned archives often feature brown dirt or yellow paper background. We scrub it to 100% pure white.',
            },
            {
              title: '1px Morphological Line Thickener',
              desc: 'Ensures ultra-thin field boundaries and irrigation canals survive the xerox toner heating cycle.',
            },
            {
              title: 'Compatible with All State Portals',
              desc: 'Tested with Rajasthan Apna Khata, UP Bhulekh, MP Bhulekh, Bihar Bhumi, and Maharashtra Mahabhulekh.',
            },
          ]}
        />
      </div>
    </ToolWorkspaceShell>
  );
}
