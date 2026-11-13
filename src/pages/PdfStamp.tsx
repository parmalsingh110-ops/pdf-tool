import { useState, useRef, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Stamp, Download, Loader2, CheckCircle2, Calendar, Eye } from 'lucide-react';
import { PDFDocument, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

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

  useAutoRevokeUrl(resultUrl);

  // Live Canvas Preview
  const [pageThumbUrl, setPageThumbUrl] = useState<string | null>(null);
  const [previewW, setPreviewW] = useState(400);
  const [previewH, setPreviewH] = useState(550);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prefersReduced = useReducedMotion();

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
    if (!pageThumbUrl || !previewCanvasRef.current || resultUrl) return;
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bgImg = new Image();
    bgImg.onload = () => {
      canvas.width = previewW;
      canvas.height = previewH;
      ctx.drawImage(bgImg, 0, 0);

      // Draw stamp overlay
      drawStampOnContext(ctx, previewW, previewH);
    };
    bgImg.src = pageThumbUrl;
  }, [pageThumbUrl, stampText, stampColor, stampOpacity, stampSize, stampRotation, stampStyle, position, addDate, previewW, previewH, resultUrl]);

  const drawStampOnContext = (
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    canvasH: number
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

  const applyStampToPdf = async () => {
    if (!file || !stampText.trim()) return;
    setBusy(true);

    try {
      const buf = await file.arrayBuffer();
      const doc = await PDFDocument.load(buf);
      const { StandardFonts } = await import('pdf-lib');
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
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

      const pdfBytes = toArrayBufferBytes(await doc.save());
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      console.error(e);
      alert('Failed to stamp document: ' + (e?.message || 'Unknown error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Add Stamp to PDF Document"
      subtitle="Stamp documents with APPROVED, CONFIDENTIAL, or custom text. Inspect real-time live preview before saving."
      categoryLabel="Professional Rubber Stamp Studio"
      icon={Stamp}
      microVariant="sign"
      tone="emerald"
      trustNote="100% browser-side stamping · Live interactive canvas preview"
    >
      {!file ? (
        <motion.div
          key="stamp-upload"
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.26 }}
          className="w-full max-w-3xl mx-auto"
        >
          <FileDropzone
            onDrop={handleDrop}
            multiple={false}
            accept={{ 'application/pdf': ['.pdf'] }}
            title="Select PDF file to stamp"
            subtitle="or drop document here"
          />
        </motion.div>
      ) : resultUrl ? (
        /* Results View */
        <motion.div
          key="stamp-result"
          initial={prefersReduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className="w-full max-w-2xl mx-auto pms-glass-panel rounded-3xl border border-emerald-200/80 dark:border-emerald-800/70 p-8 text-center space-y-6"
        >
          <motion.div
            initial={prefersReduced ? false : { scale: 0.45, rotate: -10, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 360, damping: 18 }}
            className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner"
          >
            <CheckCircle2 className="w-10 h-10" />
          </motion.div>

          <div>
            <span className="inline-block px-3.5 py-1 bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-bold uppercase tracking-wider mb-2 border border-[var(--pms-border)]">
              Stamp Sealed
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mb-1">
              Stamp Applied Successfully!
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Applied &quot;{stampText}&quot; to {pageTarget === 'all' ? 'all pages' : pageTarget === 'first' ? 'first page' : 'last page'}.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <motion.a
              whileHover={prefersReduced ? undefined : { scale: 1.015 }}
              whileTap={prefersReduced ? undefined : { scale: 0.985 }}
              href={resultUrl}
              download={`stamped_${file.name}`}
              className="flex-1 pms-btn-primary py-4 px-6 font-bold rounded-2xl flex items-center justify-center gap-2 text-base"
            >
              <Download className="w-5 h-5" /> Download Stamped PDF
            </motion.a>
          </div>

          <div className="flex justify-center gap-3 pt-1">
            <button
              onClick={() => setResultUrl(null)}
              className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl transition-colors text-sm cursor-pointer"
            >
              Adjust Stamp
            </button>
            <button
              onClick={() => {
                setFile(null);
                setResultUrl(null);
              }}
              className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl transition-colors text-sm cursor-pointer"
            >
              Stamp Another PDF
            </button>
          </div>
        </motion.div>
      ) : (
        /* Workspace with Live Canvas Preview (synchronous motion.div so previewCanvasRef is always mounted) */
        <motion.div
          key="stamp-workspace"
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.26 }}
          className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
        >
          {/* Controls Panel (7 Cols) */}
          <div className="relative lg:col-span-7 pms-glass-panel rounded-3xl p-6 space-y-6 overflow-hidden">
            <PearlScanOverlay active={busy} label="Rendering high-DPI stamp onto PDF pages…" />

            <div className="flex items-center justify-between pb-4 border-b border-[var(--pms-border)]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 bg-[var(--pms-soft-mint)] text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
                  <Stamp className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 dark:text-white truncate max-w-xs">{file.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    <AnimatedNumber value={file.size / 1024 / 1024} decimals={2} suffix=" MB" />
                  </p>
                </div>
              </div>
              <button
                onClick={() => setFile(null)}
                disabled={busy}
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white px-3 py-1.5 rounded-xl border border-[var(--pms-border)] bg-white/70 dark:bg-slate-800/70 transition-colors cursor-pointer disabled:opacity-50"
              >
                Change File
              </button>
            </div>

            {/* Quick Presets */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Quick Presets
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PRESETS.map((p) => (
                  <motion.button
                    key={p.text}
                    type="button"
                    whileTap={prefersReduced ? undefined : { scale: 0.97 }}
                    onClick={() => {
                      setStampText(p.text);
                      setStampColor(p.color);
                    }}
                    className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                      stampText === p.text
                        ? 'text-white shadow-sm'
                        : 'border-[var(--pms-border)] bg-white/75 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-600'
                    }`}
                    style={stampText === p.text ? { backgroundColor: p.color, borderColor: p.color } : {}}
                  >
                    {p.text}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Custom Text & Color */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Stamp Text
                </label>
                <input
                  type="text"
                  value={stampText}
                  onChange={(e) => setStampText(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--pms-border)] bg-white/80 dark:bg-slate-800/80 text-slate-900 dark:text-white font-bold tracking-wide focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="e.g. APPROVED"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Color
                </label>
                <div className="flex items-center gap-2 p-1.5 rounded-xl border border-[var(--pms-border)] bg-white/80 dark:bg-slate-800/80">
                  <input
                    type="color"
                    value={stampColor}
                    onChange={(e) => setStampColor(e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border-0 p-0 bg-transparent"
                  />
                  <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 uppercase">
                    {stampColor}
                  </span>
                </div>
              </div>
            </div>

            {/* Stamp Style & Position */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Stamp Border Style
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['rubber_box', 'clean_banner', 'simple'] as StampStyle[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStampStyle(st)}
                      className={`py-2 text-[11px] font-bold rounded-xl capitalize border transition-all cursor-pointer ${
                        stampStyle === st
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                          : 'border-[var(--pms-border)] bg-white/75 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {st === 'rubber_box' ? 'Box Seal' : st === 'clean_banner' ? 'Solid Banner' : 'Simple'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Position
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['center', 'top_right', 'bottom_right'] as StampPosition[]).map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => setPosition(pos)}
                      className={`py-2 text-[11px] font-bold rounded-xl capitalize border transition-all cursor-pointer ${
                        position === pos
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                          : 'border-[var(--pms-border)] bg-white/75 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300'
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
              <div className="p-3 rounded-2xl bg-white/60 dark:bg-slate-800/50 border border-[var(--pms-border)]">
                <div className="flex justify-between text-xs font-bold mb-1.5 text-slate-600 dark:text-slate-300">
                  <span>Size</span>
                  <span className="px-1.5 py-0.5 rounded bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300">
                    {stampSize}px
                  </span>
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

              <div className="p-3 rounded-2xl bg-white/60 dark:bg-slate-800/50 border border-[var(--pms-border)]">
                <div className="flex justify-between text-xs font-bold mb-1.5 text-slate-600 dark:text-slate-300">
                  <span>Opacity</span>
                  <span className="px-1.5 py-0.5 rounded bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300">
                    {Math.round(stampOpacity * 100)}%
                  </span>
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

              <div className="p-3 rounded-2xl bg-white/60 dark:bg-slate-800/50 border border-[var(--pms-border)]">
                <div className="flex justify-between text-xs font-bold mb-1.5 text-slate-600 dark:text-slate-300">
                  <span>Rotation</span>
                  <span className="px-1.5 py-0.5 rounded bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300">
                    {stampRotation}°
                  </span>
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
            <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-[var(--pms-border)]">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={addDate}
                  onChange={(e) => setAddDate(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600 rounded"
                />
                <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Include Current Date Stamp
              </label>

              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-slate-500 dark:text-slate-400">Apply to:</span>
                {(['all', 'first', 'last'] as PageTarget[]).map((tgt) => (
                  <button
                    key={tgt}
                    type="button"
                    onClick={() => setPageTarget(tgt)}
                    className={`px-2.5 py-1 rounded-lg font-bold capitalize transition-all cursor-pointer ${
                      pageTarget === tgt
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-white/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-[var(--pms-border)]'
                    }`}
                  >
                    {tgt === 'all' ? 'All Pages' : tgt === 'first' ? '1st Page' : 'Last Page'}
                  </button>
                ))}
              </div>
            </div>

            {/* Apply Button */}
            <motion.button
              whileHover={prefersReduced || busy || !stampText.trim() ? undefined : { scale: 1.01 }}
              whileTap={prefersReduced || busy || !stampText.trim() ? undefined : { scale: 0.985 }}
              onClick={applyStampToPdf}
              disabled={busy || !stampText.trim()}
              className="w-full pms-btn-primary py-4 font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Stamp className="w-5 h-5" />}
              {busy ? 'Applying Stamp...' : 'Apply Stamp & Download PDF'}
            </motion.button>
          </div>

          {/* Live Document Preview Panel (5 Cols) */}
          <div className="lg:col-span-5 pms-glass-panel rounded-3xl p-6 flex flex-col items-center">
            <div className="flex items-center justify-between w-full mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Live Document Preview (Page 1)
              </span>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold px-2.5 py-0.5 rounded-full bg-[var(--pms-soft-mint)] border border-[var(--pms-border)]">
                Interactive
              </span>
            </div>

            <div className="relative bg-slate-100/80 dark:bg-slate-950/70 p-3 rounded-2xl shadow-inner border border-[var(--pms-border)] flex items-center justify-center overflow-hidden min-h-[350px] w-full">
              {loadingPreview ? (
                <div className="flex flex-col items-center gap-2 text-slate-500 dark:text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs">Generating preview...</span>
                </div>
              ) : (
                <canvas
                  ref={previewCanvasRef}
                  className="max-w-full max-h-[500px] object-contain shadow-lg rounded bg-white"
                />
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3 text-center">
              The stamp appears on document pages exactly as displayed in this preview.
            </p>
          </div>
        </motion.div>
      )}
    </ToolWorkspaceShell>
  );
}
