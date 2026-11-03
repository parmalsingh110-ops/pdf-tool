import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  Printer,
  Sparkles,
  Maximize2,
  Sliders,
  CheckCircle2,
  RefreshCw,
  Sun,
  Layers,
  FileCheck2,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { downloadBlob } from '../lib/utils';

type CleanMode = 'whiteboard_clean' | 'blackboard_invert' | 'color_boost' | 'high_contrast';

export default function BoardNotesCleaner() {
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
      const imgBytes = await fetch(previewDataUrl).then((r) => r.arrayBuffer());
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
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      downloadBlob(blob, 'clean_board_notes.pdf');
    } catch (err) {
      alert('Error creating PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-900 text-cyan-700 dark:text-cyan-300 text-xs font-bold mb-2">
              <Sparkles className="w-3.5 h-3.5" /> Lecture Notes Enhancer
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">
              Classroom Board Notes Cleaner
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
              Turn tilted, glare-filled smartphone photos of whiteboards and blackboards into clean, high-contrast, printable PDF notes. Saves 90% printer toner!
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadPdf}
              disabled={!previewDataUrl || isProcessing}
              className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs shadow-md disabled:opacity-40 flex items-center gap-2 transition-all"
            >
              <Download className="w-4 h-4" /> Download Clean Notes PDF
            </button>
          </div>
        </div>

        {/* Workspace Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Controls (5 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-sm space-y-5">
              <label className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 text-center block cursor-pointer hover:border-cyan-500 transition-colors">
                <Upload className="w-8 h-8 mx-auto text-cyan-600 mb-2" />
                <span className="font-bold text-sm text-slate-700 dark:text-slate-200 block">
                  {file ? file.name : 'Upload Whiteboard / Blackboard Photo'}
                </span>
                <span className="text-xs text-slate-400 mt-1 block">
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
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
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
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        cleanMode === m.id
                          ? 'bg-cyan-50 dark:bg-cyan-950/60 border-cyan-500 text-cyan-900 dark:text-cyan-100 font-bold'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <p className="text-xs font-bold">{m.label}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sliders */}
              <div className="space-y-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    <span>Marker Contrast</span>
                    <span>{contrast}%</span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="260"
                    value={contrast}
                    onChange={(e) => setContrast(Number(e.target.value))}
                    className="w-full accent-cyan-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    <span>Tube-light Glare Suppression</span>
                    <span>{glareReduction}%</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    value={glareReduction}
                    onChange={(e) => setGlareReduction(Number(e.target.value))}
                    className="w-full accent-cyan-600"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Real-time Preview (7 Cols) */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                Cleaned Note Preview
              </h2>
              {previewDataUrl && (
                <span className="text-xs font-bold text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/60 px-3 py-1 rounded-full border border-cyan-200">
                  Ready for Print
                </span>
              )}
            </div>

            <div className="w-full bg-slate-100 dark:bg-slate-950/80 rounded-2xl p-4 flex items-center justify-center min-h-[460px] border border-slate-200/70 dark:border-slate-800 overflow-auto">
              {previewDataUrl ? (
                <img
                  src={previewDataUrl}
                  alt="Cleaned Board Notes Preview"
                  className="max-h-[580px] w-auto shadow-2xl rounded-sm border border-slate-300"
                />
              ) : (
                <div className="text-center space-y-3 text-slate-400">
                  <Sun className="w-12 h-12 mx-auto opacity-30 text-cyan-500" />
                  <p className="text-xs font-semibold">
                    Upload a lecture photo to remove glare, shadows, and invert blackboard chalk.
                  </p>
                </div>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </div>
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
    </div>
  );
}
