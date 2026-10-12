import React, { useState, useEffect, useRef } from 'react';
import { Droplet, Download, FileText, CheckCircle2, Sliders, ExternalLink, Eye, Loader2, Sparkles, SunMedium, Contrast } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';

export default function GrayscalePDF() {
  useSEO(
    'Convert PDF to Grayscale Online Free — Black & White Photocopy Mode | PDF Media Suite',
    'Free online tool to convert color PDFs into grayscale or high-contrast photocopy black & white. Live preview, contrast & brightness adjustment, ink saver mode.'
  );

  usePageSEO(
    'Convert PDF to Grayscale & Monochrome',
    'Convert color PDFs to clean grayscale or high-contrast black & white with real-time preview. Adjust brightness, contrast, and threshold for printing.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [isLoadingPage, setIsLoadingPage] = useState(false);

  // Filter Modes: 'smooth' (true grayscale) | 'photocopy' (pure B&W threshold) | 'inkSaver'
  const [filterMode, setFilterMode] = useState<'smooth' | 'photocopy' | 'inkSaver'>('smooth');
  const [contrast, setContrast] = useState(0); // -50 to 50
  const [brightness, setBrightness] = useState(0); // -50 to 50
  const [threshold, setThreshold] = useState(135); // 50 to 220 (for photocopy mode)

  const [previewTab, setPreviewTab] = useState<'filtered' | 'original'>('filtered');

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [grayscaleUrl, setGrayscaleUrl] = useState<string | null>(null);
  const [showResultPreview, setShowResultPreview] = useState(true);

  // Preview canvases
  const origCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const filteredCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalImgDataRef = useRef<ImageData | null>(null);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const selectedFile = acceptedFiles[0];
    setFile(selectedFile);
    setGrayscaleUrl(null);
    setIsLoadingPage(true);

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      setPageCount(pdfjsDoc.numPages);

      // Render page 1 on original canvas
      const page1 = await pdfjsDoc.getPage(1);
      const viewport = page1.getViewport({ scale: 0.55 });

      if (origCanvasRef.current && filteredCanvasRef.current) {
        const origCanvas = origCanvasRef.current;
        origCanvas.width = viewport.width;
        origCanvas.height = viewport.height;
        const ctx = origCanvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, viewport.width, viewport.height);

        await page1.render({ canvasContext: ctx, viewport, canvas: origCanvas } as any).promise;
        originalImgDataRef.current = ctx.getImageData(0, 0, origCanvas.width, origCanvas.height);

        // Apply initial filter
        applyFilterToPreview();
      }
    } catch (err) {
      console.error('Error loading page preview:', err);
    } finally {
      setIsLoadingPage(false);
    }
  };

  // Re-apply filter onto the preview canvas
  const applyFilterToPreview = () => {
    if (!originalImgDataRef.current || !filteredCanvasRef.current) return;

    const sourceData = originalImgDataRef.current;
    const canvas = filteredCanvasRef.current;
    canvas.width = sourceData.width;
    canvas.height = sourceData.height;
    const ctx = canvas.getContext('2d')!;

    // Create copy of original ImageData
    const imgData = ctx.createImageData(sourceData.width, sourceData.height);
    imgData.data.set(sourceData.data);
    const data = imgData.data;

    const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    for (let j = 0; j < data.length; j += 4) {
      let r = data[j];
      let g = data[j + 1];
      let b = data[j + 2];

      // 1. Brightness
      if (brightness !== 0) {
        r = Math.min(255, Math.max(0, r + brightness));
        g = Math.min(255, Math.max(0, g + brightness));
        b = Math.min(255, Math.max(0, b + brightness));
      }

      // 2. Standard Luminance
      let gray = 0.299 * r + 0.587 * g + 0.114 * b;

      // 3. Contrast adjustment
      if (contrast !== 0) {
        gray = Math.min(255, Math.max(0, contrastFactor * (gray - 128) + 128));
      }

      // 4. Mode specific transform
      if (filterMode === 'photocopy') {
        // Strict B&W threshold
        const finalVal = gray < threshold ? 0 : 255;
        data[j] = data[j + 1] = data[j + 2] = finalVal;
      } else if (filterMode === 'inkSaver') {
        // Lighten dark tones by 25% to save ink
        const lightened = gray < 200 ? Math.min(245, gray * 1.25 + 20) : gray;
        data[j] = data[j + 1] = data[j + 2] = lightened;
      } else {
        // Smooth Grayscale
        data[j] = data[j + 1] = data[j + 2] = gray;
      }
    }

    ctx.putImageData(imgData, 0, 0);
  };

  useEffect(() => {
    applyFilterToPreview();
  }, [filterMode, contrast, brightness, threshold]);

  const processGrayscalePdf = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProgressPercent(10);
    setProgressText('Reading document pages...');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const total = pdfjsDoc.numPages;
      const newPdfDoc = await PDFDocument.create();

      const scale = 1.8; // Crisp resolution for export
      const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

      for (let pageNum = 1; pageNum <= total; pageNum++) {
        setProgressText(`Converting page ${pageNum} of ${total} to monochrome...`);
        setProgressPercent(Math.round(10 + (pageNum / total) * 80));

        const page = await pdfjsDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        for (let j = 0; j < data.length; j += 4) {
          let r = data[j];
          let g = data[j + 1];
          let b = data[j + 2];

          if (brightness !== 0) {
            r = Math.min(255, Math.max(0, r + brightness));
            g = Math.min(255, Math.max(0, g + brightness));
            b = Math.min(255, Math.max(0, b + brightness));
          }

          let gray = 0.299 * r + 0.587 * g + 0.114 * b;

          if (contrast !== 0) {
            gray = Math.min(255, Math.max(0, contrastFactor * (gray - 128) + 128));
          }

          if (filterMode === 'photocopy') {
            const finalVal = gray < threshold ? 0 : 255;
            data[j] = data[j + 1] = data[j + 2] = finalVal;
          } else if (filterMode === 'inkSaver') {
            const lightened = gray < 200 ? Math.min(245, gray * 1.25 + 20) : gray;
            data[j] = data[j + 1] = data[j + 2] = lightened;
          } else {
            data[j] = data[j + 1] = data[j + 2] = gray;
          }
        }

        ctx.putImageData(imgData, 0, 0);

        const imgDataUrl = canvas.toDataURL('image/jpeg', 0.88);
        const imgBytes = dataUrlToBytes(imgDataUrl);
        const embeddedImg = await newPdfDoc.embedJpg(imgBytes);

        const origW = viewport.width / scale;
        const origH = viewport.height / scale;
        const newPage = newPdfDoc.addPage([origW, origH]);
        newPage.drawImage(embeddedImg, {
          x: 0,
          y: 0,
          width: origW,
          height: origH,
        });

        canvas.width = 0;
        canvas.height = 0;
      }

      setProgressPercent(95);
      setProgressText('Finalizing monochrome PDF...');
      const pdfBytes = await newPdfDoc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      setGrayscaleUrl(URL.createObjectURL(blob));
      setProgressPercent(100);
      setProgressText('Completed!');
    } catch (err) {
      console.error('Error generating grayscale PDF:', err);
      alert('An error occurred during grayscale conversion. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setGrayscaleUrl(null);
    setPageCount(0);
    setProgressText('');
    setProgressPercent(0);
    originalImgDataRef.current = null;
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-bold tracking-widest uppercase mb-3 border border-zinc-200 dark:border-zinc-700">
          <Droplet className="w-3.5 h-3.5" /> Monochrome & Print Optimizer
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-3">
          Convert PDF to Grayscale & B&W
        </h1>
        <p className="text-base md:text-lg text-gray-600 dark:text-slate-400 max-w-2xl mx-auto">
          Transform color documents into smooth grayscale or high-contrast photocopy black & white with live preview and custom tone tuning.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl">
          <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF to Convert to Grayscale" />
        </div>
      ) : (
        <div className="w-full bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-gray-200 dark:border-slate-800 p-6 md:p-8">
          {!grayscaleUrl ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Live Canvas Preview */}
              <div className="lg:col-span-5 space-y-4">
                <div className="p-4 bg-gray-50 dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 flex items-center gap-4">
                  <div className="w-12 h-12 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{file.name}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {(file.size / 1024 / 1024).toFixed(2)} MB • {pageCount} page(s)
                    </p>
                  </div>
                </div>

                {/* Preview View Tabs */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider">
                    Page 1 Real-Time Preview
                  </span>
                  <div className="inline-flex rounded-lg bg-gray-100 dark:bg-slate-800 p-0.5 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setPreviewTab('filtered')}
                      className={`px-2.5 py-1 rounded-md transition-all ${
                        previewTab === 'filtered'
                          ? 'bg-white dark:bg-slate-900 text-zinc-900 dark:text-white shadow-2xs'
                          : 'text-gray-500 hover:text-gray-900 dark:text-slate-400'
                      }`}
                    >
                      Grayscale View
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewTab('original')}
                      className={`px-2.5 py-1 rounded-md transition-all ${
                        previewTab === 'original'
                          ? 'bg-white dark:bg-slate-900 text-zinc-900 dark:text-white shadow-2xs'
                          : 'text-gray-500 hover:text-gray-900 dark:text-slate-400'
                      }`}
                    >
                      Original Color
                    </button>
                  </div>
                </div>

                {/* Canvas Display Container */}
                <div className="rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden bg-gray-100 dark:bg-slate-950 flex flex-col items-center justify-center min-h-[320px] p-4 relative shadow-inner">
                  {isLoadingPage ? (
                    <div className="flex flex-col items-center gap-2 text-gray-500">
                      <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
                      <span className="text-xs">Rendering preview...</span>
                    </div>
                  ) : null}

                  {/* Filtered Canvas */}
                  <canvas
                    ref={filteredCanvasRef}
                    className={`max-h-[360px] rounded-lg shadow-md border border-gray-300 dark:border-slate-700 object-contain mx-auto transition-opacity ${
                      previewTab === 'filtered' && !isLoadingPage ? 'block' : 'hidden'
                    }`}
                  />

                  {/* Original Canvas */}
                  <canvas
                    ref={origCanvasRef}
                    className={`max-h-[360px] rounded-lg shadow-md border border-gray-300 dark:border-slate-700 object-contain mx-auto transition-opacity ${
                      previewTab === 'original' && !isLoadingPage ? 'block' : 'hidden'
                    }`}
                  />
                </div>
              </div>

              {/* Right Column: Settings & Filter Profiles */}
              <div className="lg:col-span-7 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Select Monochrome Profile</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Choose the optimal rendering method for your document type.</p>
                </div>

                {/* Profile Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'smooth',
                      title: 'True Grayscale',
                      desc: 'Smooth photographic tones. Retains gradients & subtle shades.',
                      badge: 'Standard',
                    },
                    {
                      id: 'photocopy',
                      title: 'Photocopy B&W',
                      desc: 'Strict black & white threshold. Cleans background, darkens faint text.',
                      badge: 'Scanned Forms',
                    },
                    {
                      id: 'inkSaver',
                      title: 'Ink-Saver Draft',
                      desc: 'Lightens heavy shadows to save up to 35% printer toner/ink.',
                      badge: 'Eco Print',
                    },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setFilterMode(p.id as any)}
                      className={`text-left p-4 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                        filterMode === p.id
                          ? 'border-zinc-800 dark:border-zinc-200 bg-zinc-50 dark:bg-zinc-800/40 shadow-sm'
                          : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/20'
                      }`}
                    >
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 mb-2 inline-block">
                          {p.badge}
                        </span>
                        <h4 className="font-bold text-sm text-gray-900 dark:text-white mb-1">{p.title}</h4>
                        <p className="text-xs text-gray-500 dark:text-slate-400 leading-snug">{p.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Fine-Tuning Sliders */}
                <div className="p-5 bg-gray-50 dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 space-y-4">
                  <h4 className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Sliders className="w-3.5 h-3.5" /> Tone & Contrast Adjustments
                  </h4>

                  {/* Contrast */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium text-gray-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Contrast className="w-3.5 h-3.5 text-zinc-500" /> Contrast
                      </span>
                      <span className="font-mono font-bold text-zinc-700 dark:text-zinc-300">
                        {contrast > 0 ? `+${contrast}` : contrast}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-50}
                      max={50}
                      value={contrast}
                      onChange={(e) => setContrast(Number(e.target.value))}
                      className="w-full h-1.5 bg-gray-200 dark:bg-slate-700 rounded-lg accent-zinc-700 dark:accent-zinc-300"
                    />
                  </div>

                  {/* Brightness */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium text-gray-700 dark:text-slate-300 flex items-center gap-1.5">
                        <SunMedium className="w-3.5 h-3.5 text-zinc-500" /> Brightness
                      </span>
                      <span className="font-mono font-bold text-zinc-700 dark:text-zinc-300">
                        {brightness > 0 ? `+${brightness}` : brightness}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-50}
                      max={50}
                      value={brightness}
                      onChange={(e) => setBrightness(Number(e.target.value))}
                      className="w-full h-1.5 bg-gray-200 dark:bg-slate-700 rounded-lg accent-zinc-700 dark:accent-zinc-300"
                    />
                  </div>

                  {/* Photocopy Threshold (only if Photocopy mode) */}
                  {filterMode === 'photocopy' && (
                    <div className="pt-2 border-t border-gray-200 dark:border-slate-700">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">
                          B&W Cutoff Threshold
                        </span>
                        <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                          {threshold}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={60}
                        max={210}
                        value={threshold}
                        onChange={(e) => setThreshold(Number(e.target.value))}
                        className="w-full h-1.5 bg-gray-200 dark:bg-slate-700 rounded-lg accent-zinc-900 dark:accent-white"
                      />
                      <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
                        Lower = lighter document; Higher = darker lines & text
                      </p>
                    </div>
                  )}
                </div>

                {/* Progress Bar (when converting) */}
                {isProcessing && (
                  <div className="space-y-2 p-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700">
                    <div className="flex justify-between text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      <span>{progressText}</span>
                      <span>{progressPercent}%</span>
                    </div>
                    <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-zinc-800 dark:bg-white h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    onClick={processGrayscalePdf}
                    disabled={isProcessing || isLoadingPage}
                    className="flex-1 py-4 bg-zinc-900 hover:bg-black dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 font-bold rounded-2xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 text-base"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Converting to Monochrome...
                      </>
                    ) : (
                      <>
                        <Droplet className="w-5 h-5" />
                        Convert & Download PDF
                      </>
                    )}
                  </button>
                  <button
                    onClick={resetState}
                    disabled={isProcessing}
                    className="px-6 py-4 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-2xl transition-all text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Success Screen with Live Preview */
            <div className="space-y-6 text-center py-4">
              <div className="p-8 bg-green-50 dark:bg-green-950/30 rounded-3xl border border-green-200 dark:border-green-800">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-2xl md:text-3xl font-extrabold text-green-900 dark:text-green-200 mb-2">
                  PDF Converted to Grayscale!
                </h3>
                <p className="text-green-700 dark:text-green-400 mb-6 text-sm max-w-md mx-auto">
                  All pages have been transformed with your selected tone balance. Your file is ready for high-speed printing or archiving.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <a
                    href={grayscaleUrl}
                    download={`grayscale_${file.name}`}
                    className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-2xl transition-all shadow-md hover:shadow-lg text-base"
                  >
                    <Download className="w-5 h-5" />
                    Download Grayscale PDF
                  </a>
                  <a
                    href={grayscaleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 font-semibold rounded-2xl border border-gray-300 dark:border-slate-700 transition-all text-sm shadow-xs"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open in New Tab
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowResultPreview(!showResultPreview)}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 font-semibold rounded-2xl border border-gray-300 dark:border-slate-700 transition-all text-sm shadow-xs"
                  >
                    <Eye className="w-4 h-4" />
                    {showResultPreview ? 'Hide Preview' : 'Show Live Preview'}
                  </button>
                </div>

                {showResultPreview && (
                  <div className="mt-6 text-left">
                    <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                      Monochrome Output Preview
                    </p>
                    <div className="w-full h-[550px] rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden bg-gray-100 dark:bg-slate-950 shadow-inner">
                      <iframe
                        src={grayscaleUrl}
                        title="Grayscale PDF Preview"
                        className="w-full h-full border-0"
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={resetState}
                className="text-sm text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white font-semibold"
              >
                ← Convert another document
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
