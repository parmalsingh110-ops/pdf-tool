import { useState, useRef, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import { Download, FileText, Droplets, AlignCenter, Type, Image as ImageIcon, Eye, CheckCircle2 } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';
import { useToast } from '../components/Toast';
import { embedSmartFont } from '../lib/pdfFontHelper';
import { toArrayBufferBytes } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

type WatermarkType = 'text' | 'image';
type Position = 'center' | 'diagonal' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';

const POSITIONS: { id: Position; label: string }[] = [
  { id: 'diagonal', label: 'Diagonal' },
  { id: 'center', label: 'Center' },
  { id: 'top-left', label: 'Top Left' },
  { id: 'top-center', label: 'Top Center' },
  { id: 'top-right', label: 'Top Right' },
  { id: 'bottom-left', label: 'Bottom Left' },
  { id: 'bottom-center', label: 'Bottom Center' },
  { id: 'bottom-right', label: 'Bottom Right' },
];

export default function WatermarkPDF() {
  useSEO('Add Watermark to PDF Online Free | PDF Media Suite', 'Add text or image watermarks to PDF with opacity, position, color and size controls. Free, browser-based, no upload.');
  usePageSEO('Add Watermark to PDF', 'Add custom text or image watermarks to PDF pages. Control opacity, position, font size, color, and rotation. Free online PDF watermark tool.');

  const toast = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<WatermarkType>('text');

  // Text options
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [fontSize, setFontSize] = useState(60);
  const [opacity, setOpacity] = useState(0.3);
  const [color, setColor] = useState('#e53e3e');
  const [position, setPosition] = useState<Position>('diagonal');
  const [tileAll, setTileAll] = useState(false);

  // Image options
  const [wmImage, setWmImage] = useState<string | null>(null);
  const [wmImageName, setWmImageName] = useState('');
  const [imgScale, setImgScale] = useState(0.3);

  // State
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [previewThumb, setPreviewThumb] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const prefersReduced = useReducedMotion();

  // Cleanup blob URL on unmount / result change
  useEffect(() => {
    return () => { if (resultUrl) URL.revokeObjectURL(resultUrl); };
  }, [resultUrl]);

  // Generate preview thumbnail on first page
  const generatePreview = async () => {
    if (!file) return;
    setLoadingPreview(true);
    try {
      const ab = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
      const page = await pdf.getPage(1);
      const vp = page.getViewport({ scale: 0.8 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

      // Overlay watermark on preview
      if (type === 'text' && watermarkText) {
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.fillStyle = `rgba(${r * 255},${g * 255},${b * 255},1)`;
        const scaled = (fontSize / 72) * vp.scale * 96;
        ctx.font = `bold ${scaled}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (position === 'diagonal') {
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate(-Math.PI / 4);
          ctx.fillText(watermarkText, 0, 0);
        } else {
          const [cx, cy] = getCanvasPos(position, canvas.width, canvas.height);
          ctx.fillText(watermarkText, cx, cy);
        }
        ctx.restore();
      }

      setPreviewThumb(canvas.toDataURL('image/jpeg', 0.85));
      canvas.width = 0; canvas.height = 0;
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    if (file) generatePreview();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, watermarkText, fontSize, opacity, color, position, type]);

  const getCanvasPos = (pos: Position, w: number, h: number): [number, number] => {
    const pad = 40;
    switch (pos) {
      case 'top-left': return [pad, pad];
      case 'top-center': return [w / 2, pad];
      case 'top-right': return [w - pad, pad];
      case 'bottom-left': return [pad, h - pad];
      case 'bottom-center': return [w / 2, h - pad];
      case 'bottom-right': return [w - pad, h - pad];
      default: return [w / 2, h / 2];
    }
  };

  const handleDrop = (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    setFile(acceptedFiles[0]);
    setResultUrl(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setWmImageName(f.name);
    const reader = new FileReader();
    reader.onload = ev => setWmImage(ev.target?.result as string);
    reader.readAsDataURL(f);
  };

  const hexToRgb01 = (hex: string) => {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16) / 255,
      g: parseInt(h.substring(2, 4), 16) / 255,
      b: parseInt(h.substring(4, 6), 16) / 255,
    };
  };

  const calcXY = (pos: Position, pw: number, ph: number, tw: number, th: number): { x: number; y: number } => {
    const pad = 30;
    switch (pos) {
      case 'top-left': return { x: pad, y: ph - th - pad };
      case 'top-center': return { x: pw / 2 - tw / 2, y: ph - th - pad };
      case 'top-right': return { x: pw - tw - pad, y: ph - th - pad };
      case 'bottom-left': return { x: pad, y: pad };
      case 'bottom-center': return { x: pw / 2 - tw / 2, y: pad };
      case 'bottom-right': return { x: pw - tw - pad, y: pad };
      default: return { x: pw / 2 - tw / 2, y: ph / 2 - th / 2 };
    }
  };

  const addWatermark = async () => {
    if (!file) return;
    setIsProcessing(true);
    try {
      const ab = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(ab);
      const pages = pdfDoc.getPages();

      if (type === 'text') {
        const font = await embedSmartFont(pdfDoc, watermarkText, { bold: true, fallback: StandardFonts.HelveticaBold });
        const { r, g, b } = hexToRgb01(color);

        for (const page of pages) {
          const { width, height } = page.getSize();
          const tw = font.widthOfTextAtSize(watermarkText, fontSize);
          const th = font.heightAtSize(fontSize);

          const drawSingle = (x: number, y: number, rot = 0) => {
            page.drawText(watermarkText, {
              x, y, size: fontSize, font,
              color: rgb(r, g, b), opacity,
              rotate: degrees(rot),
            });
          };

          if (tileAll) {
            const stepX = tw * 1.4;
            const stepY = th * 4;
            for (let ty = -height * 0.2; ty < height * 1.2; ty += stepY) {
              for (let tx = -width * 0.2; tx < width * 1.2; tx += stepX) {
                drawSingle(tx, ty, 30);
              }
            }
          } else if (position === 'diagonal') {
            const rad = (45 * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const x = width / 2 - ((tw / 2) * cos - (th / 2) * sin);
            const y = height / 2 - ((tw / 2) * sin + (th / 2) * cos);
            drawSingle(x, y, 45);
          } else {
            const { x, y } = calcXY(position, width, height, tw, th);
            drawSingle(x, y, 0);
          }
        }
      } else if (type === 'image' && wmImage) {
        const bytes = dataUrlToBytes(wmImage);
        let pdfImage;
        if (wmImage.includes('image/png')) {
          pdfImage = await pdfDoc.embedPng(bytes);
        } else {
          pdfImage = await pdfDoc.embedJpg(bytes);
        }
        for (const page of pages) {
          const { width, height } = page.getSize();
          const iw = pdfImage.width * imgScale;
          const ih = pdfImage.height * imgScale;
          const { x, y } = calcXY(position === 'diagonal' ? 'center' : position, width, height, iw, ih);
          page.drawImage(pdfImage, { x, y, width: iw, height: ih, opacity });
        }
      }

      const bytes = await pdfDoc.save();
      const blob = new Blob([toArrayBufferBytes(bytes)], { type: 'application/pdf' });
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultUrl(URL.createObjectURL(blob));
      toast.success('Watermark added successfully!');
    } catch (e) {
      console.error('Watermark error:', e);
      toast.error('Failed to add watermark. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Add Watermark to PDF"
      subtitle="Text or image watermark with full opacity, position and color control."
      categoryLabel="PDF Branding · Live Preview"
      icon={Droplets}
      microVariant="edit"
      tone="sky"
    >
      <div className="flex flex-col items-center w-full">

      <PearlStageSwitch
        stageKey={!file ? 'upload' : resultUrl ? 'result' : 'configure'}
        className="w-full max-w-6xl"
      >
      {!file ? (
        <div className="w-full max-w-3xl mx-auto">
          <FileDropzone onDrop={handleDrop} multiple={false} title="Drop PDF here or click to select" />
        </div>
      ) : resultUrl ? (
        <div className="w-full max-w-lg mx-auto pms-glass-panel rounded-3xl p-8 text-center">
          <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-500/12 via-white/75 to-teal-500/12 dark:from-emerald-950/50 dark:via-slate-900/80 dark:to-teal-950/40 border border-emerald-200/80 dark:border-emerald-800/60 mb-5">
            <motion.div
              initial={prefersReduced ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 24 }}
              className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/25"
            >
              <CheckCircle2 className="w-8 h-8" />
            </motion.div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-2">Watermark Added!</h3>
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-6">Your PDF is ready to download.</p>
            <motion.a
              whileHover={prefersReduced ? undefined : { scale: 1.02 }}
              whileTap={prefersReduced ? undefined : { scale: 0.98 }}
              href={resultUrl}
              download={`watermarked_${file.name}`}
              className="pms-btn-primary relative overflow-hidden inline-flex items-center justify-center gap-2 px-8 py-4 font-bold rounded-xl shadow-md"
            >
              <span className="pms-shimmer pointer-events-none" />
              <Download className="w-5 h-5" /> Download Watermarked PDF
            </motion.a>
          </div>
          <button onClick={() => { setResultUrl(null); setFile(null); }}
            className="text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 font-semibold text-sm mt-1 transition-colors">
            Watermark another PDF
          </button>
        </div>
      ) : (
        <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls */}
          <div className="relative overflow-hidden lg:col-span-2 pms-glass-panel rounded-3xl p-5 sm:p-6 space-y-5">
            <PearlScanOverlay active={isProcessing} label="Applying watermark across all PDF pages..." />
            {/* File info */}
            <div className="flex items-center gap-4 p-4 bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)]">
              <div className="w-11 h-11 bg-[var(--pms-soft-blue)] border border-[var(--pms-border)] rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-[var(--pms-blue)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-slate-100 truncate">{file.name}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 tabular-nums">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <button onClick={() => { setFile(null); setResultUrl(null); }} className="text-xs font-semibold text-gray-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 px-3 py-1.5 rounded-xl border border-[var(--pms-border)] bg-white/80 dark:bg-slate-800/80 transition-colors">Change</button>
            </div>

            {/* Type toggle */}
            <div className="bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] p-5">
              <h3 className="font-bold text-gray-800 dark:text-slate-200 text-sm uppercase tracking-wider mb-4">Watermark Type</h3>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setType('text')}
                  className={`relative overflow-hidden flex items-center gap-3 p-4 rounded-xl border-2 transition-colors ${type === 'text' ? 'border-[var(--pms-blue)] text-sky-900 dark:text-sky-100' : 'border-[var(--pms-border)] bg-white/60 dark:bg-slate-900/60 text-gray-700 dark:text-slate-300 hover:border-[var(--pms-border-strong)]'}`}>
                  {type === 'text' && (
                    <motion.span
                      layoutId="watermark-type-pill"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                      className="absolute inset-0 bg-[var(--pms-soft-blue)] pointer-events-none"
                    />
                  )}
                  <Type className="relative z-10 w-5 h-5" /><span className="relative z-10 font-semibold">Text</span>
                </button>
                <button onClick={() => setType('image')}
                  className={`relative overflow-hidden flex items-center gap-3 p-4 rounded-xl border-2 transition-colors ${type === 'image' ? 'border-[var(--pms-blue)] text-sky-900 dark:text-sky-100' : 'border-[var(--pms-border)] bg-white/60 dark:bg-slate-900/60 text-gray-700 dark:text-slate-300 hover:border-[var(--pms-border-strong)]'}`}>
                  {type === 'image' && (
                    <motion.span
                      layoutId="watermark-type-pill"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                      className="absolute inset-0 bg-[var(--pms-soft-blue)] pointer-events-none"
                    />
                  )}
                  <ImageIcon className="relative z-10 w-5 h-5" /><span className="relative z-10 font-semibold">Image / Logo</span>
                </button>
              </div>
            </div>

            {/* Text options */}
            {type === 'text' && (
              <div className="bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] p-5 space-y-5">
                <h3 className="font-bold text-gray-800 dark:text-slate-200 text-sm uppercase tracking-wider">Text Options</h3>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">Watermark Text</label>
                  <input type="text" value={watermarkText} onChange={e => setWatermarkText(e.target.value)}
                    className="w-full px-4 py-3 bg-white/90 dark:bg-slate-800/80 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 rounded-xl border border-[var(--pms-border)] focus:ring-2 focus:ring-sky-400 outline-none text-lg font-bold tracking-wider"
                    placeholder="CONFIDENTIAL" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">Font Size: <span className="text-[var(--pms-blue)]">{fontSize}pt</span></label>
                    <input type="range" min={12} max={160} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} className="w-full accent-sky-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">Opacity: <span className="text-[var(--pms-blue)]">{Math.round(opacity * 100)}%</span></label>
                    <input type="range" min={5} max={100} value={Math.round(opacity * 100)} onChange={e => setOpacity(Number(e.target.value) / 100)} className="w-full accent-sky-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">Color</label>
                  <div className="flex flex-wrap items-center gap-3">
                    <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-12 h-10 rounded-lg border border-[var(--pms-border)] bg-white dark:bg-slate-800 cursor-pointer p-0.5" />
                    {['#e53e3e','#dd6b20','#d69e2e','#38a169','#3182ce','#805ad5','#667eea','#000000'].map(c => (
                      <button key={c} onClick={() => setColor(c)} style={{ backgroundColor: c }}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${color === c ? 'border-gray-900 dark:border-white scale-110 shadow-sm' : 'border-white dark:border-slate-700 shadow-sm hover:scale-105'}`} />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={tileAll} onChange={e => setTileAll(e.target.checked)} className="rounded accent-sky-500" />
                    Tile watermark across entire page
                  </label>
                </div>
              </div>
            )}

            {/* Image options */}
            {type === 'image' && (
              <div className="bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] p-5 space-y-5">
                <h3 className="font-bold text-gray-800 dark:text-slate-200 text-sm uppercase tracking-wider">Image Options</h3>
                <div>
                  <button onClick={() => imgInputRef.current?.click()}
                    className="w-full py-3.5 border-2 border-dashed border-[var(--pms-border-strong)] rounded-xl text-gray-600 dark:text-slate-300 hover:border-[var(--pms-blue)] hover:text-[var(--pms-blue)] transition-colors flex items-center justify-center gap-2 bg-white/50 dark:bg-slate-900/50">
                    <ImageIcon className="w-5 h-5" />
                    {wmImageName || 'Click to upload watermark image (PNG/JPG)'}
                  </button>
                  <input ref={imgInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleImageUpload} />
                </div>
                {wmImage && (
                  <div className="flex items-center gap-4">
                    <img src={wmImage} alt="Watermark preview" className="w-24 h-24 object-contain border border-[var(--pms-border)] rounded-xl pms-checkerboard" />
                    <div className="flex-1">
                      <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">Scale: <span className="text-[var(--pms-blue)]">{Math.round(imgScale * 100)}%</span></label>
                      <input type="range" min={5} max={100} value={Math.round(imgScale * 100)} onChange={e => setImgScale(Number(e.target.value) / 100)} className="w-full accent-sky-500" />
                      <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2 mt-3">Opacity: <span className="text-[var(--pms-blue)]">{Math.round(opacity * 100)}%</span></label>
                      <input type="range" min={5} max={100} value={Math.round(opacity * 100)} onChange={e => setOpacity(Number(e.target.value) / 100)} className="w-full accent-sky-500" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Position grid */}
            <div className="bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] p-5">
              <h3 className="font-bold text-gray-800 dark:text-slate-200 text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
                <AlignCenter className="w-4 h-4 text-[var(--pms-blue)]" /> Position
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {POSITIONS.map(p => {
                  const active = position === p.id;
                  return (
                  <button key={p.id} onClick={() => setPosition(p.id)}
                    className={`relative overflow-hidden py-2.5 px-2 rounded-xl text-xs font-semibold border transition-colors ${active ? 'border-[var(--pms-blue)] text-sky-900 dark:text-sky-100' : 'border-[var(--pms-border)] bg-white/70 dark:bg-slate-900/70 text-gray-600 dark:text-slate-300 hover:border-[var(--pms-border-strong)]'}`}>
                    {active && (
                      <motion.span
                        layoutId="watermark-pos-pill"
                        transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                        className="absolute inset-0 bg-[var(--pms-soft-blue)] pointer-events-none"
                      />
                    )}
                    <span className="relative z-10">{p.label}</span>
                  </button>
                );
                })}
              </div>
            </div>

            <motion.button
              whileHover={prefersReduced || isProcessing || (type === 'image' && !wmImage) || (type === 'text' && !watermarkText) ? undefined : { scale: 1.01 }}
              whileTap={prefersReduced || isProcessing || (type === 'image' && !wmImage) || (type === 'text' && !watermarkText) ? undefined : { scale: 0.99 }}
              onClick={addWatermark}
              disabled={isProcessing || (type === 'image' && !wmImage) || (type === 'text' && !watermarkText)}
              className="pms-btn-primary relative overflow-hidden w-full py-4 text-base font-bold rounded-xl disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
            >
              <span className="pms-shimmer pointer-events-none" />
              {isProcessing ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Adding Watermark...</>
              ) : (
                <><Droplets className="w-5 h-5" />Add Watermark to All Pages</>
              )}
            </motion.button>
          </div>

          {/* Live preview */}
          <div className="pms-glass-panel rounded-3xl p-5 self-start">
            <h3 className="font-bold text-gray-800 dark:text-slate-200 text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
              <Eye className="w-4 h-4 text-[var(--pms-blue)]" /> Live Preview <span className="text-xs font-normal text-gray-400 dark:text-slate-500">(Page 1)</span>
            </h3>
            {loadingPreview ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3">
                <div className="w-8 h-8 border-3 border-sky-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-gray-500 dark:text-slate-400">Rendering preview...</p>
              </div>
            ) : previewThumb ? (
              <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-slate-700 bg-white shadow-sm p-1">
                <img src={previewThumb} alt="Watermark preview" className="w-full" />
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-400 dark:text-slate-500 text-sm">Preview loading…</div>
            )}
            <p className="text-xs text-gray-500 dark:text-slate-400 text-center mt-3">Preview updates with your settings</p>
          </div>
        </div>
      )}
      </PearlStageSwitch>
      </div>
    </ToolWorkspaceShell>
  );
}
