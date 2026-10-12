import React, { useState, useEffect, useRef } from 'react';
import { Moon, Download, FileText, CheckCircle2, Sliders, ExternalLink, Eye, Loader2, Sparkles, SunMedium, EyeOff, Shield } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';

export default function InvertColorsPDF() {
  useSEO(
    'Invert PDF Colors Online Free — Eye Care Dark Mode & OLED Reading | PDF Media Suite',
    'Free online tool to invert PDF colors into dark mode. Includes OLED Pure Dark, Eye-Care Warm Sepia, and Solarized Navy profiles with live preview.'
  );

  usePageSEO(
    'Invert PDF Colors & Dark Mode Converter',
    'Convert bright white PDFs into comfortable dark mode reading documents. Features OLED pitch black, warm sepia, photo preservation, and real-time preview.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [isLoadingPage, setIsLoadingPage] = useState(false);

  // Dark Mode Theme Profiles: 'oled' | 'sepia' | 'solarized' | 'classic'
  const [theme, setTheme] = useState<'oled' | 'sepia' | 'solarized' | 'classic'>('oled');
  const [preservePhotos, setPreservePhotos] = useState(true);
  const [contrast, setContrast] = useState(10); // -30 to +30
  const [brightness, setBrightness] = useState(-5); // -30 to +30

  const [previewTab, setPreviewTab] = useState<'dark' | 'original'>('dark');

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [invertedUrl, setInvertedUrl] = useState<string | null>(null);
  const [showResultPreview, setShowResultPreview] = useState(true);

  // Canvases for preview
  const origCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const filteredCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalImgDataRef = useRef<ImageData | null>(null);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const selectedFile = acceptedFiles[0];
    setFile(selectedFile);
    setInvertedUrl(null);
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

        applyDarkModeTransform();
      }
    } catch (err) {
      console.error('Error loading page preview:', err);
    } finally {
      setIsLoadingPage(false);
    }
  };

  // Pixel transformation function
  const transformPixel = (
    r: number,
    g: number,
    b: number,
    th: 'oled' | 'sepia' | 'solarized' | 'classic',
    preserve: boolean,
    cVal: number,
    bVal: number
  ): [number, number, number] => {
    // Check color saturation (is this a photo or colorful graphic vs text/background?)
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const isChromatic = delta > 30; // Color image pixel

    if (preserve && isChromatic) {
      // Keep colorful graphics natural with slightly muted brightness for night reading
      return [
        Math.min(255, Math.max(0, r * 0.9)),
        Math.min(255, Math.max(0, g * 0.9)),
        Math.min(255, Math.max(0, b * 0.9)),
      ];
    }

    // Invert lightness
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    let invLum = 255 - lum;

    // Apply brightness & contrast
    if (bVal !== 0) {
      invLum = Math.min(255, Math.max(0, invLum + bVal));
    }
    if (cVal !== 0) {
      const factor = (259 * (cVal + 255)) / (255 * (259 - cVal));
      invLum = Math.min(255, Math.max(0, factor * (invLum - 128) + 128));
    }

    const t = invLum / 255;

    if (th === 'sepia') {
      // Warm Charcoal (#1a1815 = [26, 24, 21]) to Soft Warm Amber (#f3e7ce = [243, 231, 206])
      const outR = Math.round(26 + t * (243 - 26));
      const outG = Math.round(24 + t * (231 - 24));
      const outB = Math.round(21 + t * (206 - 21));
      return [outR, outG, outB];
    } else if (th === 'solarized') {
      // Midnight Navy (#08182b = [8, 24, 43]) to Soft Cerulean (#a0cfff = [160, 207, 255])
      const outR = Math.round(8 + t * (160 - 8));
      const outG = Math.round(24 + t * (207 - 24));
      const outB = Math.round(43 + t * (255 - 43));
      return [outR, outG, outB];
    } else if (th === 'classic') {
      // Pure mathematical RGB inversion
      let outR = 255 - r;
      let outG = 255 - g;
      let outB = 255 - b;
      return [outR, outG, outB];
    } else {
      // OLED Pitch Black (#0a0a0a = [10, 10, 10]) to Clean Off-White (#f0f0f0 = [240, 240, 240])
      const val = Math.round(10 + t * (240 - 10));
      return [val, val, val];
    }
  };

  const applyDarkModeTransform = () => {
    if (!originalImgDataRef.current || !filteredCanvasRef.current) return;

    const sourceData = originalImgDataRef.current;
    const canvas = filteredCanvasRef.current;
    canvas.width = sourceData.width;
    canvas.height = sourceData.height;
    const ctx = canvas.getContext('2d')!;

    const imgData = ctx.createImageData(sourceData.width, sourceData.height);
    imgData.data.set(sourceData.data);
    const data = imgData.data;

    for (let j = 0; j < data.length; j += 4) {
      const [newR, newG, newB] = transformPixel(
        data[j],
        data[j + 1],
        data[j + 2],
        theme,
        preservePhotos,
        contrast,
        brightness
      );
      data[j] = newR;
      data[j + 1] = newG;
      data[j + 2] = newB;
    }

    ctx.putImageData(imgData, 0, 0);
  };

  useEffect(() => {
    applyDarkModeTransform();
  }, [theme, preservePhotos, contrast, brightness]);

  const processInvertPdf = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProgressPercent(10);
    setProgressText('Extracting document pages for Dark Mode rendering...');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const total = pdfjsDoc.numPages;
      const newPdfDoc = await PDFDocument.create();

      const scale = 1.8; // Sharp reader rendering

      for (let pageNum = 1; pageNum <= total; pageNum++) {
        setProgressText(`Converting page ${pageNum} of ${total} to night mode...`);
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
          const [newR, newG, newB] = transformPixel(
            data[j],
            data[j + 1],
            data[j + 2],
            theme,
            preservePhotos,
            contrast,
            brightness
          );
          data[j] = newR;
          data[j + 1] = newG;
          data[j + 2] = newB;
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
      setProgressText('Finalizing dark mode PDF...');
      const pdfBytes = await newPdfDoc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      setInvertedUrl(URL.createObjectURL(blob));
      setProgressPercent(100);
      setProgressText('Done!');
    } catch (err) {
      console.error('Error creating dark mode PDF:', err);
      alert('An error occurred during inversion. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setInvertedUrl(null);
    setPageCount(0);
    originalImgDataRef.current = null;
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 text-slate-100 text-xs font-bold tracking-widest uppercase mb-3 border border-slate-700">
          <Moon className="w-3.5 h-3.5 text-amber-400" /> Eye Care & Night Reader
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-3">
          Invert PDF & Dark Mode Creator
        </h1>
        <p className="text-base md:text-lg text-gray-600 dark:text-slate-400 max-w-2xl mx-auto">
          Convert harsh bright PDFs into soothing dark mode documents. Choose from OLED Pitch Dark, Warm Sepia, and Solarized Navy with real-time preview.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl">
          <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF to Convert to Dark Mode" />
        </div>
      ) : (
        <div className="w-full bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-gray-200 dark:border-slate-800 p-6 md:p-8">
          {!invertedUrl ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Live Preview Canvas */}
              <div className="lg:col-span-5 space-y-4">
                <div className="p-4 bg-gray-50 dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-800 text-amber-400 rounded-xl flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{file.name}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {(file.size / 1024 / 1024).toFixed(2)} MB • {pageCount} page(s)
                    </p>
                  </div>
                </div>

                {/* View Tabs */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Page 1 Live Preview
                  </span>
                  <div className="inline-flex rounded-lg bg-gray-100 dark:bg-slate-800 p-0.5 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setPreviewTab('dark')}
                      className={`px-2.5 py-1 rounded-md transition-all ${
                        previewTab === 'dark'
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'text-gray-500 hover:text-gray-900 dark:text-slate-400'
                      }`}
                    >
                      Dark Mode View
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewTab('original')}
                      className={`px-2.5 py-1 rounded-md transition-all ${
                        previewTab === 'original'
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'text-gray-500 hover:text-gray-900 dark:text-slate-400'
                      }`}
                    >
                      Original White
                    </button>
                  </div>
                </div>

                {/* Canvas Container */}
                <div className="rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden bg-slate-950 flex flex-col items-center justify-center min-h-[320px] p-4 relative shadow-inner">
                  {isLoadingPage ? (
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                      <span className="text-xs">Rendering night preview...</span>
                    </div>
                  ) : null}

                  <canvas
                    ref={filteredCanvasRef}
                    className={`max-h-[360px] rounded-lg shadow-lg border border-slate-800 object-contain mx-auto transition-opacity ${
                      previewTab === 'dark' && !isLoadingPage ? 'block' : 'hidden'
                    }`}
                  />

                  <canvas
                    ref={origCanvasRef}
                    className={`max-h-[360px] rounded-lg shadow-lg border border-slate-800 object-contain mx-auto transition-opacity ${
                      previewTab === 'original' && !isLoadingPage ? 'block' : 'hidden'
                    }`}
                  />
                </div>
              </div>

              {/* Right Column: Dark Mode Themes & Controls */}
              <div className="lg:col-span-7 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Choose Night Theme Profile</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Select the palette best suited for your reading conditions.</p>
                </div>

                {/* Theme Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      id: 'oled',
                      title: 'OLED Pitch Black',
                      desc: 'True #000 background with crisp off-white text. Perfect for OLED screens and dark rooms.',
                      accent: 'bg-black text-white border-slate-800',
                      badge: 'Maximum Battery Save',
                    },
                    {
                      id: 'sepia',
                      title: 'Eye-Care Warm Sepia',
                      desc: 'Deep warm charcoal with amber/cream text. Eliminates blue-light glare and eye fatigue.',
                      accent: 'bg-[#1e1c18] text-[#f4ecd8] border-amber-900/40',
                      badge: 'Best For Long Reading',
                    },
                    {
                      id: 'solarized',
                      title: 'Solarized Navy Slate',
                      desc: 'Deep oceanic navy with soft sky blue lettering. Popular among developers and nighttime readers.',
                      accent: 'bg-[#091b30] text-[#93c5fd] border-blue-900/40',
                      badge: 'Modern Slate',
                    },
                    {
                      id: 'classic',
                      title: 'High-Contrast Negative',
                      desc: 'Classic mathematical color invert. Direct 255 - RGB calculation.',
                      accent: 'bg-slate-900 text-slate-100 border-slate-700',
                      badge: 'Inverted Original',
                    },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTheme(item.id as any)}
                      className={`text-left p-4 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                        theme === item.id
                          ? 'border-amber-500 bg-amber-50/20 dark:bg-amber-950/20 shadow-sm ring-1 ring-amber-500/50'
                          : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/30'
                      }`}
                    >
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 mb-2 inline-block">
                          {item.badge}
                        </span>
                        <h4 className="font-bold text-sm text-gray-900 dark:text-white mb-1">{item.title}</h4>
                        <p className="text-xs text-gray-500 dark:text-slate-400 leading-snug">{item.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Smart Features / Photo Preservation Toggle */}
                <div className="p-4 bg-gray-50 dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="pr-4">
                    <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5 mb-0.5">
                      <Shield className="w-3.5 h-3.5 text-emerald-500" /> Preserve Colored Photos & Figures
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      Darkens backgrounds and text while keeping photos, figures, and charts in natural color.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={preservePhotos}
                      onChange={(e) => setPreservePhotos(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>

                {/* Tone Sliders */}
                <div className="p-5 bg-gray-50 dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 space-y-4">
                  <h4 className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Sliders className="w-3.5 h-3.5" /> Text Clarity & Background Depth
                  </h4>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium text-gray-700 dark:text-slate-300">Text Contrast</span>
                      <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                        {contrast > 0 ? `+${contrast}` : contrast}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-30}
                      max={30}
                      value={contrast}
                      onChange={(e) => setContrast(Number(e.target.value))}
                      className="w-full h-1.5 bg-gray-200 dark:bg-slate-700 rounded-lg accent-amber-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium text-gray-700 dark:text-slate-300 flex items-center gap-1.5">
                        <SunMedium className="w-3.5 h-3.5 text-zinc-500" /> Background Dimming
                      </span>
                      <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                        {brightness > 0 ? `+${brightness}` : brightness}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-30}
                      max={30}
                      value={brightness}
                      onChange={(e) => setBrightness(Number(e.target.value))}
                      className="w-full h-1.5 bg-gray-200 dark:bg-slate-700 rounded-lg accent-amber-500"
                    />
                  </div>
                </div>

                {/* Progress Bar */}
                {isProcessing && (
                  <div className="space-y-2 p-4 bg-slate-900 text-white rounded-2xl border border-slate-800">
                    <div className="flex justify-between text-xs font-semibold">
                      <span>{progressText}</span>
                      <span>{progressPercent}%</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-amber-400 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    onClick={processInvertPdf}
                    disabled={isProcessing || isLoadingPage}
                    className="flex-1 py-4 bg-slate-900 hover:bg-black dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-slate-950 font-bold rounded-2xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 text-base"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Generating Dark Mode PDF...
                      </>
                    ) : (
                      <>
                        <Moon className="w-5 h-5 text-amber-400 dark:text-slate-950" />
                        Convert & Download Dark PDF
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
                  Dark Mode PDF Created Successfully!
                </h3>
                <p className="text-green-700 dark:text-green-400 mb-6 text-sm max-w-md mx-auto">
                  All pages have been transformed with your selected night reading profile.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <a
                    href={invertedUrl}
                    download={`darkmode_${file.name}`}
                    className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-2xl transition-all shadow-md hover:shadow-lg text-base"
                  >
                    <Download className="w-5 h-5" />
                    Download Dark Mode PDF
                  </a>
                  <a
                    href={invertedUrl}
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
                      Dark Mode PDF Output Preview
                    </p>
                    <div className="w-full h-[550px] rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden bg-gray-100 dark:bg-slate-950 shadow-inner">
                      <iframe
                        src={invertedUrl}
                        title="Dark Mode PDF Preview"
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
