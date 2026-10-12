import { useState, useRef, useEffect } from 'react';
import { Stamp, Download, Loader2, Sparkles, CheckCircle2, RotateCw, Calendar, Eye, Layers } from 'lucide-react';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

// Initialize pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface Preset {
  text: string;
  color: string;
}

const PRESETS: Preset[] = [
  { text: 'APPROVED', color: '#16a34a' },
  { text: 'CONFIDENTIAL', color: '#dc2626' },
  { text: 'DRAFT', color: '#2563eb' },
  { text: 'VOID', color: '#991b1b' },
  { text: 'PAID', color: '#059669' },
  { text: 'COPY', color: '#475569' },
  { text: 'URGENT', color: '#d97706' },
  { text: 'FINAL', color: '#7c3aed' },
];

type StampStyle = 'rubber_box' | 'clean_banner' | 'simple';
type StampPosition = 'center' | 'top_right' | 'top_left' | 'bottom_right' | 'bottom_left';
type PageTarget = 'all' | 'first' | 'last';

export default function PdfStamp() {
  useSEO(
    'PDF Stamp Tool Online Free — Approved, Draft, Confidential | PDF Media Suite',
    'Add official rubber stamps, approved seals, and draft watermarks to PDF pages online free. Live document preview, custom text, colors, and positioning.'
  );

  usePageSEO(
    'Add Stamp to PDF',
    'Add CONFIDENTIAL, DRAFT, APPROVED rubber stamps to PDF documents with live interactive preview, customizable borders, opacity, and date stamps.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [stampText, setStampText] = useState('APPROVED');
  const [stampColor, setStampColor] = useState('#16a34a');
  const [stampOpacity, setStampOpacity] = useState(0.65);
  const [stampSize, setStampSize] = useState(38);
  const [stampRotation, setStampRotation] = useState(-20);
  const [stampStyle, setStampStyle] = useState<StampStyle>('rubber_box');
  const [position, setPosition] = useState<StampPosition>('center');
  const [pageTarget, setPageTarget] = useState<PageTarget>('all');
  const [addDate, setAddDate] = useState(true);

  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  // Live Canvas Preview
  const [pageThumbUrl, setPageThumbUrl] = useState<string | null>(null);
  const [previewW, setPreviewW] = useState(400);
  const [previewH, setPreviewH] = useState(550);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleDrop = async (files: File[]) => {
    if (files[0]) {
      const selected = files[0];
      setFile(selected);
      setResultUrl(null);
      await loadFirstPage(selected);
    }
  };

  const loadFirstPage = async (pdfFile: File) => {
    setLoadingPreview(true);
    try {
      const buf = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const page = await pdf.getPage(1);
      const vp = page.getViewport({ scale: 1.0 });

      const maxDim = 500;
      const scale = Math.min(maxDim / vp.width, maxDim / vp.height);
      const scaledVp = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = scaledVp.width;
      canvas.height = scaledVp.height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, scaledVp.width, scaledVp.height);

      await page.render({ canvasContext: ctx, viewport: scaledVp, canvas }).promise;
      setPageThumbUrl(canvas.toDataURL('image/jpeg', 0.85));
      setPreviewW(scaledVp.width);
      setPreviewH(scaledVp.height);
      canvas.width = 0;
      canvas.height = 0;
    } catch (e) {
      console.error('Error rendering preview:', e);
    } finally {
      setLoadingPreview(false);
    }
  };

  // Redraw stamp over page preview in real time
  useEffect(() => {
    if (!pageThumbUrl || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bgImg = new Image();
    bgImg.onload = () => {
      canvas.width = previewW;
      canvas.height = previewH;
      ctx.drawImage(bgImg, 0, 0);

      // Draw stamp overlay
      drawStampOnContext(ctx, previewW, previewH, true);
    };
    bgImg.src = pageThumbUrl;
  }, [pageThumbUrl, stampText, stampColor, stampOpacity, stampSize, stampRotation, stampStyle, position, addDate, previewW, previewH]);

  const drawStampOnContext = (
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    canvasH: number,
    isCanvasPreview = true
  ) => {
    ctx.save();
    ctx.globalAlpha = stampOpacity;

    let posX = canvasW / 2;
    let posY = canvasH / 2;

    if (position === 'top_left') {
      posX = canvasW * 0.25;
      posY = canvasH * 0.2;
    } else if (position === 'top_right') {
      posX = canvasW * 0.75;
      posY = canvasH * 0.2;
    } else if (position === 'bottom_left') {
      posX = canvasW * 0.25;
      posY = canvasH * 0.8;
    } else if (position === 'bottom_right') {
      posX = canvasW * 0.75;
      posY = canvasH * 0.8;
    }

    ctx.translate(posX, posY);
    ctx.rotate((stampRotation * Math.PI) / 180);

    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const text = stampText.toUpperCase();

    ctx.font = `bold ${stampSize}px Arial, sans-serif`;
    const metrics = ctx.measureText(text);
    const tw = metrics.width;
    const th = stampSize;

    if (stampStyle === 'rubber_box') {
      const padX = stampSize * 0.6;
      const padY = stampSize * (addDate ? 0.6 : 0.4);
      const boxW = tw + padX * 2;
      const boxH = th + padY * 2 + (addDate ? stampSize * 0.4 : 0);

      // Outer heavy border
      ctx.strokeStyle = stampColor;
      ctx.lineWidth = Math.max(3, stampSize * 0.08);
      ctx.strokeRect(-boxW / 2, -boxH / 2, boxW, boxH);

      // Inner thin border
      const innerGap = Math.max(3, stampSize * 0.07);
      ctx.lineWidth = Math.max(1, stampSize * 0.03);
      ctx.strokeRect(
        -boxW / 2 + innerGap,
        -boxH / 2 + innerGap,
        boxW - innerGap * 2,
        boxH - innerGap * 2
      );

      // Text
      ctx.fillStyle = stampColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const textOffsetY = addDate ? -stampSize * 0.15 : 0;
      ctx.fillText(text, 0, textOffsetY);

      // Optional Date
      if (addDate) {
        ctx.font = `bold ${Math.max(10, stampSize * 0.32)}px Arial, sans-serif`;
        ctx.fillText(dateStr, 0, textOffsetY + stampSize * 0.75);
      }
    } else if (stampStyle === 'clean_banner') {
      const bannerW = tw + stampSize * 1.5;
      const bannerH = th + stampSize * 0.8;

      ctx.fillStyle = stampColor;
      ctx.fillRect(-bannerW / 2, -bannerH / 2, bannerW, bannerH);

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, addDate ? -stampSize * 0.15 : 0);

      if (addDate) {
        ctx.font = `bold ${Math.max(10, stampSize * 0.3)}px Arial, sans-serif`;
        ctx.fillText(dateStr, 0, stampSize * 0.6);
      }
    } else {
      // Simple text
      ctx.fillStyle = stampColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, 0);

      if (addDate) {
        ctx.font = `bold ${Math.max(10, stampSize * 0.35)}px Arial, sans-serif`;
        ctx.fillText(dateStr, 0, stampSize * 0.85);
      }
    }

    ctx.restore();
  };

  const hexToRgb = (hex: string) => {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r
      ? { r: parseInt(r[1], 16) / 255, g: parseInt(r[2], 16) / 255, b: parseInt(r[3], 16) / 255 }
      : { r: 0.1, g: 0.65, b: 0.3 };
  };

  const applyStampToPdf = async () => {
    if (!file || !stampText.trim()) return;
    setBusy(true);

    try {
      const buf = await file.arrayBuffer();
      const doc = await PDFDocument.load(buf);
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      const regularFont = await doc.embedFont(StandardFonts.Helvetica);
      const { r, g, b } = hexToRgb(stampColor);
      const pages = doc.getPages();
      const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

      const targetIndices: number[] = [];
      if (pageTarget === 'first') {
        targetIndices.push(0);
      } else if (pageTarget === 'last') {
        targetIndices.push(pages.length - 1);
      } else {
        pages.forEach((_, i) => targetIndices.push(i));
      }

      for (const idx of targetIndices) {
        const page = pages[idx];
        const { width, height } = page.getSize();

        let posX = width / 2;
        let posY = height / 2;

        if (position === 'top_left') {
          posX = width * 0.25;
          posY = height * 0.8;
        } else if (position === 'top_right') {
          posX = width * 0.75;
          posY = height * 0.8;
        } else if (position === 'bottom_left') {
          posX = width * 0.25;
          posY = height * 0.2;
        } else if (position === 'bottom_right') {
          posX = width * 0.75;
          posY = height * 0.2;
        }

        const text = stampText.toUpperCase();
        const textW = font.widthOfTextAtSize(text, stampSize);
        const textH = stampSize;

        // Render stamp via in-memory high-res canvas stamp image for pristine quality & exact borders
        const stampCanvas = document.createElement('canvas');
        const cScale = 3;
        const boxPadX = stampSize * 0.6;
        const boxPadY = stampSize * 0.5;
        const padW = (textW + boxPadX * 2 + 50) * cScale;
        const padH = (textH * 3 + 50) * cScale;

        stampCanvas.width = padW;
        stampCanvas.height = padH;
        const sCtx = stampCanvas.getContext('2d')!;

        // Draw stamp centered inside stampCanvas
        sCtx.translate(padW / 2, padH / 2);
        sCtx.scale(cScale, cScale);

        // Rubber box borders
        if (stampStyle === 'rubber_box') {
          const bw = textW + boxPadX * 2;
          const bh = textH + boxPadY * 2 + (addDate ? stampSize * 0.4 : 0);
          sCtx.strokeStyle = stampColor;
          sCtx.lineWidth = Math.max(3, stampSize * 0.08);
          sCtx.strokeRect(-bw / 2, -bh / 2, bw, bh);

          const innerGap = Math.max(3, stampSize * 0.07);
          sCtx.lineWidth = Math.max(1, stampSize * 0.03);
          sCtx.strokeRect(-bw / 2 + innerGap, -bh / 2 + innerGap, bw - innerGap * 2, bh - innerGap * 2);

          sCtx.fillStyle = stampColor;
          sCtx.font = `bold ${stampSize}px Arial, sans-serif`;
          sCtx.textAlign = 'center';
          sCtx.textBaseline = 'middle';
          sCtx.fillText(text, 0, addDate ? -stampSize * 0.15 : 0);

          if (addDate) {
            sCtx.font = `bold ${Math.max(10, stampSize * 0.32)}px Arial, sans-serif`;
            sCtx.fillText(dateStr, 0, stampSize * 0.65);
          }
        } else if (stampStyle === 'clean_banner') {
          const bw = textW + stampSize * 1.5;
          const bh = textH + stampSize * 0.8;
          sCtx.fillStyle = stampColor;
          sCtx.fillRect(-bw / 2, -bh / 2, bw, bh);

          sCtx.fillStyle = '#ffffff';
          sCtx.font = `bold ${stampSize}px Arial, sans-serif`;
          sCtx.textAlign = 'center';
          sCtx.textBaseline = 'middle';
          sCtx.fillText(text, 0, addDate ? -stampSize * 0.15 : 0);

          if (addDate) {
            sCtx.font = `bold ${Math.max(10, stampSize * 0.3)}px Arial, sans-serif`;
            sCtx.fillText(dateStr, 0, stampSize * 0.6);
          }
        } else {
          sCtx.fillStyle = stampColor;
          sCtx.font = `bold ${stampSize}px Arial, sans-serif`;
          sCtx.textAlign = 'center';
          sCtx.textBaseline = 'middle';
          sCtx.fillText(text, 0, 0);

          if (addDate) {
            sCtx.font = `bold ${Math.max(10, stampSize * 0.35)}px Arial, sans-serif`;
            sCtx.fillText(dateStr, 0, stampSize * 0.85);
          }
        }

        const pngUrl = stampCanvas.toDataURL('image/png');
        const { dataUrlToBytes } = await import('../lib/utils');
        const stampBytes = dataUrlToBytes(pngUrl);
        const embeddedStamp = await doc.embedPng(stampBytes);

        const drawW = padW / cScale;
        const drawH = padH / cScale;

        page.drawImage(embeddedStamp, {
          x: posX - drawW / 2,
          y: posY - drawH / 2,
          width: drawW,
          height: drawH,
          opacity: stampOpacity,
          rotate: degrees(stampRotation),
        });

        stampCanvas.width = 0;
        stampCanvas.height = 0;
      }

      const pdfBytes = await doc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      console.error(e);
      alert('Failed to stamp document: ' + (e?.message || 'Unknown error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-xs font-bold tracking-widest uppercase mb-3 border border-emerald-200 dark:border-emerald-800">
          <Sparkles className="w-3.5 h-3.5" /> Professional Rubber Stamp Generator
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-3">
          Add Stamp to PDF Document
        </h1>
        <p className="text-lg text-gray-600 dark:text-slate-400 max-w-2xl mx-auto">
          Stamp documents with APPROVED, CONFIDENTIAL, or custom text. Inspect real-time live preview before saving.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-4xl">
          <FileDropzone
            onDrop={handleDrop}
            multiple={false}
            accept={{ 'application/pdf': ['.pdf'] }}
            title="Select PDF file to stamp"
            subtitle="or drop document here"
          />
        </div>
      ) : resultUrl ? (
        /* Results View */
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-8 text-center space-y-6">
          <div className="p-8 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-emerald-900 dark:text-emerald-200 mb-2">
              Stamp Applied Successfully!
            </h3>
            <p className="text-sm text-emerald-700 dark:text-emerald-400 mb-6">
              Applied &quot;{stampText}&quot; to {pageTarget === 'all' ? 'all pages' : pageTarget === 'first' ? 'first page' : 'last page'}.
            </p>
            <a
              href={resultUrl}
              download={`stamped_${file.name}`}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-bold rounded-xl shadow-lg transition-all"
            >
              <Download className="w-5 h-5" /> Download Stamped PDF
            </a>
          </div>

          <div className="flex justify-center gap-4">
            <button
              onClick={() => setResultUrl(null)}
              className="px-6 py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-xl transition-all"
            >
              Adjust Stamp
            </button>
            <button
              onClick={() => {
                setFile(null);
                setResultUrl(null);
              }}
              className="px-6 py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-xl transition-all"
            >
              Stamp Another PDF
            </button>
          </div>
        </div>
      ) : (
        /* Workspace with Live Canvas Preview */
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Controls Panel (7 Cols) */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
                  <Stamp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white truncate max-w-xs">{file.name}</h3>
                  <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              <button
                onClick={() => setFile(null)}
                className="text-xs font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-slate-300"
              >
                Change File
              </button>
            </div>

            {/* Quick Presets */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2">
                Quick Presets
              </label>
              <div className="grid grid-cols-4 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.text}
                    onClick={() => {
                      setStampText(p.text);
                      setStampColor(p.color);
                    }}
                    className={`py-2 px-1 text-xs font-bold rounded-xl border transition-all ${
                      stampText === p.text
                        ? 'text-white shadow-sm'
                        : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:border-gray-400'
                    }`}
                    style={stampText === p.text ? { backgroundColor: p.color, borderColor: p.color } : {}}
                  >
                    {p.text}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Text & Color */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2">
                  Stamp Text
                </label>
                <input
                  type="text"
                  value={stampText}
                  onChange={(e) => setStampText(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white font-bold tracking-wide focus:outline-none focus:border-emerald-500"
                  placeholder="e.g. APPROVED"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2">
                  Color
                </label>
                <div className="flex items-center gap-2 p-1.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
                  <input
                    type="color"
                    value={stampColor}
                    onChange={(e) => setStampColor(e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border-0 p-0 bg-transparent"
                  />
                  <span className="text-xs font-mono font-bold text-gray-700 dark:text-slate-300 uppercase">
                    {stampColor}
                  </span>
                </div>
              </div>
            </div>

            {/* Stamp Style & Position */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2">
                  Stamp Border Style
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['rubber_box', 'clean_banner', 'simple'] as StampStyle[]).map((st) => (
                    <button
                      key={st}
                      onClick={() => setStampStyle(st)}
                      className={`py-2 text-[11px] font-bold rounded-xl capitalize border transition-all ${
                        stampStyle === st
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300'
                      }`}
                    >
                      {st === 'rubber_box' ? 'Box Seal' : st === 'clean_banner' ? 'Solid Banner' : 'Simple'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2">
                  Position
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['center', 'top_right', 'bottom_right'] as StampPosition[]).map((pos) => (
                    <button
                      key={pos}
                      onClick={() => setPosition(pos)}
                      className={`py-2 text-[11px] font-bold rounded-xl capitalize border transition-all ${
                        position === pos
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300'
                      }`}
                    >
                      {pos === 'center' ? 'Center' : pos === 'top_right' ? 'Top Right' : 'Bottom Right'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Sliders: Size, Opacity, Rotation */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5 text-gray-600 dark:text-slate-400">
                  <span>Size</span>
                  <span>{stampSize}px</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="72"
                  value={stampSize}
                  onChange={(e) => setStampSize(parseInt(e.target.value, 10))}
                  className="w-full accent-emerald-600"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5 text-gray-600 dark:text-slate-400">
                  <span>Opacity</span>
                  <span>{Math.round(stampOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={stampOpacity}
                  onChange={(e) => setStampOpacity(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5 text-gray-600 dark:text-slate-400">
                  <span>Rotation</span>
                  <span>{stampRotation}°</span>
                </div>
                <input
                  type="range"
                  min="-90"
                  max="90"
                  value={stampRotation}
                  onChange={(e) => setStampRotation(parseInt(e.target.value, 10))}
                  className="w-full accent-emerald-600"
                />
              </div>
            </div>

            {/* Page Target & Date Checkbox */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-gray-100 dark:border-slate-800">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={addDate}
                  onChange={(e) => setAddDate(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600 rounded"
                />
                <Calendar className="w-3.5 h-3.5" /> Include Current Date Stamp
              </label>

              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-gray-500">Apply to:</span>
                {(['all', 'first', 'last'] as PageTarget[]).map((tgt) => (
                  <button
                    key={tgt}
                    onClick={() => setPageTarget(tgt)}
                    className={`px-2.5 py-1 rounded-lg font-bold capitalize transition-all ${
                      pageTarget === tgt
                        ? 'bg-emerald-600 text-white'
                        : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400'
                    }`}
                  >
                    {tgt === 'all' ? 'All Pages' : tgt === 'first' ? '1st Page' : 'Last Page'}
                  </button>
                ))}
              </div>
            </div>

            {/* Apply Button */}
            <button
              onClick={applyStampToPdf}
              disabled={busy || !stampText.trim()}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Stamp className="w-5 h-5" />}
              {busy ? 'Applying Stamp...' : 'Apply Stamp & Download PDF'}
            </button>
          </div>

          {/* Live Document Preview Panel (5 Cols) */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm flex flex-col items-center">
            <div className="flex items-center justify-between w-full mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 flex items-center gap-1.5">
                <Eye className="w-4 h-4" /> Live Document Preview (Page 1)
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                Interactive
              </span>
            </div>

            <div className="relative bg-gray-100 dark:bg-slate-950 p-2 rounded-xl shadow-inner border border-gray-200 dark:border-slate-800 flex items-center justify-center overflow-hidden min-h-[350px] w-full">
              {loadingPreview ? (
                <div className="flex flex-col items-center gap-2 text-gray-500">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <span className="text-xs">Generating preview...</span>
                </div>
              ) : (
                <canvas
                  ref={previewCanvasRef}
                  className="max-w-full max-h-[500px] object-contain shadow-lg rounded"
                />
              )}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-3 text-center">
              The stamp appears on document pages exactly as displayed in this preview.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
