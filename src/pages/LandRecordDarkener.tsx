import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  Printer,
  Sparkles,
  Sliders,
  MapPin,
  CheckCircle2,
  RefreshCw,
  Eye,
  Layers,
  FileCheck2,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { dataUrlToBytes, downloadBlob } from '../lib/utils';

type DarkenPreset = 'map_lines' | 'jamabandi_text' | 'deep_xerox' | 'extreme';

export default function LandRecordDarkener() {
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
  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(null);
  const [processedDataUrl, setProcessedDataUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activePreset, setActivePreset] = useState<DarkenPreset>('map_lines');

  // Sliders
  const [contrastLevel, setContrastLevel] = useState<number>(180); // 100 - 300%
  const [blackThreshold, setBlackThreshold] = useState<number>(190); // 0 - 255
  const [removeBackgroundTint, setRemoveBackgroundTint] = useState<boolean>(true);
  const [lineThicknessBoost, setLineThicknessBoost] = useState<boolean>(true);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

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
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
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
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300 text-xs font-bold mb-2">
              <MapPin className="w-3.5 h-3.5 text-amber-600" /> Revenue &amp; E-Mitra Favorite
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">
              Faint Land Record &amp; Bhu-Naksha Darkener
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
              Darken faint blue/grey revenue maps (Bhu-Naksha), Jamabandi, Khasra-Khatauni, and land registries so survey numbers print jet black on any laser printer.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              disabled={!processedDataUrl}
              className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs shadow-md disabled:opacity-40 flex items-center gap-2 hover:opacity-90"
            >
              <Printer className="w-4 h-4" /> 1-Click Print
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={!processedDataUrl || isProcessing}
              className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md disabled:opacity-40 flex items-center gap-2 transition-all"
            >
              <Download className="w-4 h-4" /> Download Darkened PDF
            </button>
          </div>
        </div>

        {/* Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Controls (4 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-sm space-y-5">
              <label className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 text-center block cursor-pointer hover:border-amber-500 transition-colors">
                <Upload className="w-8 h-8 mx-auto text-amber-600 mb-2" />
                <span className="font-bold text-sm text-slate-700 dark:text-slate-200 block">
                  {file ? file.name : 'Upload Land Record / Bhu-Naksha'}
                </span>
                <span className="text-xs text-slate-400 mt-1 block">
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
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
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
                      className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all ${
                        activePreset === preset.id
                          ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-500 text-amber-800 dark:text-amber-200'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fine Tuning Sliders */}
              <div className="space-y-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    <span>Black Line Threshold</span>
                    <span>{blackThreshold}</span>
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
                  <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    <span>Contrast Intensity</span>
                    <span>{contrastLevel}%</span>
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

                <div className="space-y-2 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={removeBackgroundTint}
                      onChange={(e) => setRemoveBackgroundTint(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    Whiten Faint Yellow/Grey Background Paper
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={lineThicknessBoost}
                      onChange={(e) => setLineThicknessBoost(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    Thicken Thin Survey Lines (+1px Laser Boost)
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Real-Time Preview (7 Cols) */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                Enhanced Print Preview
              </h2>
              {processedDataUrl && (
                <span className="text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-3 py-1 rounded-full border border-amber-200">
                  Survey Numbers Sharpened
                </span>
              )}
            </div>

            <div className="w-full bg-slate-100 dark:bg-slate-950/80 rounded-2xl p-4 flex items-center justify-center min-h-[460px] border border-slate-200/70 dark:border-slate-800 overflow-auto">
              {processedDataUrl ? (
                <img
                  src={processedDataUrl}
                  alt="Enhanced Land Record Preview"
                  className="max-h-[580px] w-auto shadow-2xl rounded-sm border border-slate-300 dark:border-slate-700"
                />
              ) : (
                <div className="text-center space-y-3 text-slate-400">
                  <MapPin className="w-12 h-12 mx-auto opacity-30 text-amber-500" />
                  <p className="text-xs font-semibold">
                    Upload your Apna Khata / Bhulekh / Jamabandi PDF to preview high-contrast darkened print output.
                  </p>
                </div>
              )}
            </div>
          </div>
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
    </div>
  );
}
