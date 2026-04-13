import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Camera, RefreshCw, User, FileImage, Loader2, RotateCcw, Eye } from 'lucide-react';
import { preload, removeBackground } from '@imgly/background-removal';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import { createSegmenter, SupportedModels } from '@tensorflow-models/body-segmentation';
import type { BodySegmenter } from '@tensorflow-models/body-segmentation';
import FileDropzone from '../components/FileDropzone';
import {
  PASSPORT_ASPECT,
  clampCropRect,
  maskToPersonBBox,
  suggestCropFromPerson,
  centerAspectCrop,
  buildPassportGridPdf,
  type SheetPageSize,
} from '../lib/passportPhotoSheet';
import {
  type PhotoAdjustments,
  DEFAULT_ADJUSTMENTS,
  isDefault,
  applyAdjustments,
  ADJUSTMENT_GROUPS,
  ADJUSTMENT_RANGES,
} from '../lib/photoAdjustments';

const PHOTO_W_MM = 35;
const PHOTO_H_MM = 45;
const DPI_OPTIONS = [300, 600] as const;
type DpiChoice = (typeof DPI_OPTIONS)[number];

const bgRemoverConfig = {
  model: 'isnet_quint8' as const,
  device: 'cpu' as const,
  proxyToWorker: true,
  rescale: true,
  fetchArgs: { cache: 'force-cache' as RequestCache },
  output: { format: 'image/png' as const, quality: 1 },
};

const applyRemoveBg = async (blob: Blob) => {
  const result = await removeBackground(blob, bgRemoverConfig);
  return result as Blob;
};

async function canvasToBlob(c: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), type, quality));
}

function compositeOnColor(img: HTMLImageElement, hexColor: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d');
  ctx.fillStyle = hexColor;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

async function cropToCanvas(img: HTMLImageElement, crop: { x: number; y: number; w: number; h: number }): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas');
  c.width = Math.round(crop.w);
  c.height = Math.round(crop.h);
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d');
  ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height);
  return c;
}

function unsharpMask(canvas: HTMLCanvasElement, amount = 0.5, radius = 1): HTMLCanvasElement {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const blurred = document.createElement('canvas');
  blurred.width = w; blurred.height = h;
  const bctx = blurred.getContext('2d');
  if (!bctx) return canvas;
  bctx.filter = `blur(${radius}px)`;
  bctx.drawImage(canvas, 0, 0);
  bctx.filter = 'none';
  const origData = ctx.getImageData(0, 0, w, h);
  const blurData = bctx.getImageData(0, 0, w, h);
  const od = origData.data, bd = blurData.data;
  for (let i = 0; i < od.length; i += 4) {
    od[i]     = Math.min(255, Math.max(0, od[i]     + amount * (od[i]     - bd[i])));
    od[i + 1] = Math.min(255, Math.max(0, od[i + 1] + amount * (od[i + 1] - bd[i + 1])));
    od[i + 2] = Math.min(255, Math.max(0, od[i + 2] + amount * (od[i + 2] - bd[i + 2])));
  }
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d');
  if (!octx) return canvas;
  octx.putImageData(origData, 0, 0);
  return out;
}

function drawBorder(canvas: HTMLCanvasElement, borderPx: number): HTMLCanvasElement {
  if (borderPx <= 0) return canvas;
  const out = document.createElement('canvas');
  out.width = canvas.width; out.height = canvas.height;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0);
  ctx.strokeStyle = '#d4d4d8';
  ctx.lineWidth = borderPx;
  const inset = borderPx / 2;
  ctx.strokeRect(inset, inset, canvas.width - borderPx, canvas.height - borderPx);
  return out;
}

function resizeHighQuality(src: HTMLCanvasElement, tw: number, th: number): HTMLCanvasElement {
  let current = src, cw = src.width, ch = src.height;
  while (cw / 2 > tw && ch / 2 > th) {
    const half = document.createElement('canvas');
    half.width = Math.round(cw / 2); half.height = Math.round(ch / 2);
    const hctx = half.getContext('2d');
    if (!hctx) break;
    hctx.imageSmoothingEnabled = true; hctx.imageSmoothingQuality = 'high';
    hctx.drawImage(current, 0, 0, half.width, half.height);
    current = half; cw = half.width; ch = half.height;
  }
  const out = document.createElement('canvas');
  out.width = tw; out.height = th;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(current, 0, 0, tw, th);
  return out;
}

/* ─── sidebar tab type ─── */
type SidebarTab = 'edit' | 'layout' | 'export';

/* ─── page dimensions (pts) for sheet preview ─── */
const PAGE_PT: Record<SheetPageSize, [number, number]> = {
  a4: [595.28, 841.89], letter: [612, 792], '4x6': [288, 432],
};

let _segmenter: BodySegmenter | null = null;

export default function PassportPhotoSheet() {
  const [file, setFile] = useState<File | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [imgObjectUrl, setImgObjectUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [removeBg, setRemoveBg] = useState(true);
  const [borderPx, setBorderPx] = useState(2);
  const [qty, setQty] = useState(8);
  const [columns] = useState(4);
  const [gapMm, setGapMm] = useState(3);
  const [marginMm, setMarginMm] = useState(10);
  const [exportDpi, setExportDpi] = useState<DpiChoice>(300);
  const [showFaceGuide, setShowFaceGuide] = useState(true);
  const [sharpenAmount, setSharpenAmount] = useState(0.45);
  const [pageSize, setPageSize] = useState<SheetPageSize>('a4');
  const [bgModelReady, setBgModelReady] = useState(false);
  const [bgPreloadMsg, setBgPreloadMsg] = useState('');
  const [segLoading, setSegLoading] = useState(false);
  const [detectMsg, setDetectMsg] = useState('');
  const [displayScale, setDisplayScale] = useState(1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  // === NEW: Photo adjustments ===
  const [adjustments, setAdjustments] = useState<PhotoAdjustments>({ ...DEFAULT_ADJUSTMENTS });
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('edit');
  const [openGroup, setOpenGroup] = useState<string | null>('💡 Light');

  // === NEW: Sheet preview ===
  const sheetCanvasRef = useRef<HTMLCanvasElement>(null);

  // === LIVE EFFECT PREVIEW ===
  const [livePreviewUrl, setLivePreviewUrl] = useState<string | null>(null);
  const liveDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ px: number; py: number; start: { x: number; y: number } } | null>(null);

  const ensureSegmenter = useCallback(async () => {
    if (_segmenter) return _segmenter;
    setSegLoading(true);
    await tf.ready();
    _segmenter = await createSegmenter(SupportedModels.MediaPipeSelfieSegmentation, {
      runtime: 'tfjs',
      modelType: 'general',
    });
    setSegLoading(false);
    return _segmenter;
  }, []);

  useEffect(() => {
    setBgPreloadMsg('Loading background removal model…');
    preload(bgRemoverConfig)
      .then(() => { setBgModelReady(true); setBgPreloadMsg(''); })
      .catch(() => setBgPreloadMsg('BG model load failed (will retry on use).'));
  }, []);

  const onFile = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setError(null);
    setPreviewUrl(null);
    setPdfUrl(null);
    setAdjustments({ ...DEFAULT_ADJUSTMENTS });
    try {
      const url = URL.createObjectURL(f);
      setImgObjectUrl(url);
      const loaded = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = url;
      });
      setImg(loaded);
      const nw = loaded.naturalWidth;
      const nh = loaded.naturalHeight;
      setCrop(centerAspectCrop(nw, nh, PASSPORT_ASPECT));
    } catch (e: unknown) {
      setError((e as Error).message);
      setImg(null); setFile(null); setCrop(null);
    }
  }, []);

  const nw = img?.naturalWidth ?? 0;
  const nh = img?.naturalHeight ?? 0;

  useEffect(() => {
    if (!nw || !nh || !wrapRef.current) return;
    const el = wrapRef.current;
    const update = () => {
      const maxW = Math.min(640, el.clientWidth || 640);
      const maxH = window.innerHeight * 0.45;
      setDisplayScale(Math.min(maxW / nw, maxH / nh, 1));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [nw, nh, img]);

  const runAutoDetect = useCallback(async () => {
    if (!img || !nw || !nh) return;
    setError(null);
    setDetectMsg('Detecting person…');
    try {
      const seg = await ensureSegmenter();
      const maxSeg = 640;
      const sc = Math.min(1, maxSeg / Math.max(nw, nh));
      const sw = Math.round(nw * sc), sh = Math.round(nh * sc);
      const scCanvas = document.createElement('canvas');
      scCanvas.width = sw; scCanvas.height = sh;
      const sctx = scCanvas.getContext('2d')!;
      sctx.drawImage(img, 0, 0, sw, sh);
      const [person] = await seg.segmentPeople(scCanvas);
      const idata = await person.mask.toImageData();
      const bboxSmall = maskToPersonBBox(idata, sw, sh);
      const bbox = bboxSmall && {
        x0: (bboxSmall.x0 / sw) * nw, y0: (bboxSmall.y0 / sh) * nh,
        x1: (bboxSmall.x1 / sw) * nw, y1: (bboxSmall.y1 / sh) * nh,
      };
      const next = suggestCropFromPerson(nw, nh, bbox, PASSPORT_ASPECT);
      setCrop(clampCropRect(next, nw, nh, PASSPORT_ASPECT));
      setDetectMsg(bbox ? 'Crop updated from person outline.' : 'No clear person mask — centered crop.');
    } catch (e: unknown) {
      setError((e as Error).message || 'Detection failed');
      setDetectMsg('');
    } finally {
      setTimeout(() => setDetectMsg(''), 4000);
    }
  }, [img, nw, nh, ensureSegmenter]);

  const onPointerDownCrop = useCallback((e: React.PointerEvent) => {
    if (!crop) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, start: { x: crop.x, y: crop.y } };
  }, [crop]);

  const onPointerMoveCrop = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !crop || !nw || !nh) return;
    const dx = (e.clientX - dragRef.current.px) / displayScale;
    const dy = (e.clientY - dragRef.current.py) / displayScale;
    setCrop(clampCropRect({ ...crop, x: dragRef.current.start.x + dx, y: dragRef.current.start.y + dy }, nw, nh, PASSPORT_ASPECT));
  }, [crop, nw, nh, displayScale]);

  const onPointerUpCrop = useCallback((e: React.PointerEvent) => {
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /**/ }
    dragRef.current = null;
  }, []);

  const onResizeCrop = useCallback((delta: number) => {
    if (!crop || !nw || !nh) return;
    const factor = 1 + delta * 0.04;
    const nhNew = clamp(crop.h * factor, 48, nh * 1.2);
    const nwNew = nhNew * PASSPORT_ASPECT;
    const cx = crop.x + crop.w / 2, cy = crop.y + crop.h / 2;
    setCrop(clampCropRect({ x: cx - nwNew / 2, y: cy - nhNew / 2, w: nwNew, h: nhNew }, nw, nh, PASSPORT_ASPECT));
  }, [crop, nw, nh]);

  const EXPORT_W = useMemo(() => Math.round((PHOTO_W_MM / 25.4) * exportDpi), [exportDpi]);
  const EXPORT_H = useMemo(() => Math.round((PHOTO_H_MM / 25.4) * exportDpi), [exportDpi]);

  const buildTilePng = useCallback(async (): Promise<Uint8Array> => {
    if (!img || !crop) throw new Error('No image');
    setBusyLabel(removeBg ? 'Removing background…' : 'Processing…');
    let working = await cropToCanvas(img, crop);

    // === Apply photo adjustments ===
    if (!isDefault(adjustments)) {
      setBusyLabel('Applying photo adjustments…');
      working = applyAdjustments(working, adjustments);
    }

    let blob = await canvasToBlob(working, 'image/jpeg', 0.95);

    if (removeBg) {
      if (!bgModelReady) throw new Error('Background model not ready yet');
      const cutBlob = await applyRemoveBg(blob);
      const cutUrl = URL.createObjectURL(cutBlob);
      const cutImg = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = cutUrl;
      });
      URL.revokeObjectURL(cutUrl);
      working = compositeOnColor(cutImg, bgColor);
    } else {
      const c2 = document.createElement('canvas');
      c2.width = working.width; c2.height = working.height;
      const c2x = c2.getContext('2d')!;
      c2x.fillStyle = bgColor;
      c2x.fillRect(0, 0, c2.width, c2.height);
      c2x.drawImage(working, 0, 0);
      working = c2;
    }

    setBusyLabel('Enhancing & sharpening…');
    const sized = resizeHighQuality(working, EXPORT_W, EXPORT_H);
    const sharpened = unsharpMask(sized, sharpenAmount, 1);
    const bordered = drawBorder(sharpened, borderPx);
    const outBlob = await canvasToBlob(bordered, 'image/png');
    return new Uint8Array(await outBlob.arrayBuffer());
  }, [img, crop, removeBg, bgColor, borderPx, bgModelReady, EXPORT_W, EXPORT_H, sharpenAmount, adjustments]);

  const runPreview = useCallback(async () => {
    if (!img || !crop) return;
    setBusy(true); setError(null);
    try {
      const bytes = await buildTilePng();
      const blob = new Blob([bytes], { type: 'image/png' });
      setPreviewUrl((u) => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(blob); });
    } catch (e: unknown) { setError((e as Error).message || 'Preview failed'); }
    finally { setBusy(false); setBusyLabel(''); }
  }, [img, crop, buildTilePng]);

  const runPdf = useCallback(async () => {
    if (!img || !crop) return;
    setBusy(true); setError(null);
    try {
      const tilePng = await buildTilePng();
      setBusyLabel('Building PDF…');
      const pdfBytes = await buildPassportGridPdf({ tilePng, totalCount: qty, columns, photoWidthMm: PHOTO_W_MM, photoHeightMm: PHOTO_H_MM, gapMm, marginMm, pageSize });
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const pdfObjectUrl = URL.createObjectURL(blob);
      setPdfUrl((u) => { if (u) URL.revokeObjectURL(u); return pdfObjectUrl; });
      const tileBlob = new Blob([tilePng], { type: 'image/png' });
      setPreviewUrl((u) => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(tileBlob); });
      const a = document.createElement('a');
      a.href = pdfObjectUrl; a.download = 'passport-photos-sheet.pdf'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e: unknown) { setError((e as Error).message || 'PDF failed'); }
    finally { setBusy(false); setBusyLabel(''); }
  }, [img, crop, buildTilePng, qty, columns, gapMm, marginMm, pageSize]);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
  }, [previewUrl, pdfUrl]);

  useEffect(() => {
    return () => { if (imgObjectUrl) URL.revokeObjectURL(imgObjectUrl); };
  }, [imgObjectUrl]);

  // === LIVE EFFECT PREVIEW: auto-update when adjustments or crop changes ===
  useEffect(() => {
    if (!img || !crop || isDefault(adjustments)) {
      if (livePreviewUrl) { URL.revokeObjectURL(livePreviewUrl); setLivePreviewUrl(null); }
      return;
    }
    if (liveDebounceRef.current) clearTimeout(liveDebounceRef.current);
    liveDebounceRef.current = setTimeout(async () => {
      try {
        // Small preview for speed (max 300px)
        const tempCanvas = document.createElement('canvas');
        const maxPrev = 300;
        const scale = Math.min(1, maxPrev / Math.max(crop.w, crop.h));
        tempCanvas.width = Math.round(crop.w * scale);
        tempCanvas.height = Math.round(crop.h * scale);
        const tctx = tempCanvas.getContext('2d');
        if (!tctx) return;
        tctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, tempCanvas.width, tempCanvas.height);

        const adjusted = applyAdjustments(tempCanvas, adjustments);
        const blob = await new Promise<Blob | null>(res => adjusted.toBlob(b => res(b), 'image/jpeg', 0.85));
        if (blob) {
          setLivePreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
        }
        tempCanvas.width = 0; tempCanvas.height = 0;
      } catch { /* silent */ }
    }, 200);
    return () => { if (liveDebounceRef.current) clearTimeout(liveDebounceRef.current); };
  }, [img, crop, adjustments]);

  // === SHEET PREVIEW: draw grid layout in real-time ===
  useEffect(() => {
    const canvas = sheetCanvasRef.current;
    if (!canvas || !previewUrl) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tileImg = new Image();
    tileImg.onload = () => {
      const [pageW, pageH] = PAGE_PT[pageSize];
      const previewScale = 200 / pageW; // fit preview ~200px wide
      const cw = Math.round(pageW * previewScale);
      const ch = Math.round(pageH * previewScale);
      canvas.width = cw; canvas.height = ch;

      // White page background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, cw, ch);

      const mmToPt = 72 / 25.4;
      const margin = marginMm * mmToPt * previewScale;
      const gap = gapMm * mmToPt * previewScale;
      const photoW = PHOTO_W_MM * mmToPt * previewScale;
      const photoH = PHOTO_H_MM * mmToPt * previewScale;

      const cols = columns;
      const rows = Math.ceil(qty / cols);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          if (idx >= qty) break;
          const x = margin + c * (photoW + gap);
          const y = margin + r * (photoH + gap);
          ctx.drawImage(tileImg, x, y, photoW, photoH);
          ctx.strokeStyle = '#d4d4d8';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, photoW, photoH);
        }
      }

      // Draw cut guides (dashed lines)
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 0.3;
      for (let c = 1; c < cols; c++) {
        const x = margin + c * (photoW + gap) - gap / 2;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke();
      }
      for (let r = 1; r <= rows; r++) {
        const y = margin + r * (photoH + gap) - gap / 2;
        if (y < ch) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke(); }
      }
      ctx.setLineDash([]);
    };
    tileImg.src = previewUrl;
  }, [previewUrl, qty, columns, gapMm, marginMm, pageSize]);

  const dispW = useMemo(() => (nw ? Math.round(nw * displayScale) : 0), [nw, displayScale]);
  const dispH = useMemo(() => (nh ? Math.round(nh * displayScale) : 0), [nh, displayScale]);

  const adjSlider = (key: keyof PhotoAdjustments) => {
    const range = ADJUSTMENT_RANGES[key];
    const val = adjustments[key];
    return (
      <div key={key} className="flex items-center gap-2 text-xs">
        <span className="w-24 text-slate-600 dark:text-slate-400 capitalize font-medium">{key}</span>
        <input
          type="range"
          min={range.min}
          max={range.max}
          step={1}
          value={val}
          onChange={(e) => setAdjustments(prev => ({ ...prev, [key]: Number(e.target.value) }))}
          className="flex-1 h-1.5 accent-rose-500"
        />
        <span className={`w-8 text-right font-mono ${val === 0 ? 'text-slate-400' : val > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
          {val > 0 ? `+${val}` : val}
        </span>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col items-center p-6 md:p-10 pb-24">
      <div className="text-center max-w-2xl mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">Passport Photo Studio</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400 text-sm md:text-base">
          Upload a portrait, adjust crop & photo editing, then export a ready-to-print PDF sheet. 
          Photo size <strong>35×45 mm</strong> (India standard).
        </p>
      </div>

      {!file || !img || !crop ? (
        <div className="w-full max-w-xl space-y-4">
          <FileDropzone
            onDrop={onFile} multiple={false} title="Upload portrait photo"
            subtitle="JPG, PNG, WEBP — or use camera on phone"
            accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.bmp'] }}
            variant="dark" className="dark:bg-slate-900/60"
          />
          <label className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700">
            <Camera className="w-5 h-5" />
            Take photo
            <input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile([f]); }} />
          </label>
        </div>
      ) : (
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
          {/* LEFT: Image + Crop + Actions */}
          <div className="space-y-4">
            <div ref={wrapRef} className="relative mx-auto w-full max-w-[640px] flex justify-center">
              <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900" style={{ width: dispW, height: dispH }}>
                {imgObjectUrl && <img src={imgObjectUrl} alt="Source" width={dispW} height={dispH} className="block pointer-events-none" draggable={false} />}
                {crop && (
                  <div className="absolute left-0 top-0 cursor-move touch-none" style={{ width: dispW, height: dispH }}
                    onPointerDown={onPointerDownCrop} onPointerMove={onPointerMoveCrop} onPointerUp={onPointerUpCrop} onPointerCancel={onPointerUpCrop}>
                    <div className="absolute border-2 border-white shadow-lg rounded-sm pointer-events-none"
                      style={{ left: crop.x * displayScale, top: crop.y * displayScale, width: crop.w * displayScale, height: crop.h * displayScale, boxShadow: '0 0 0 4096px rgba(0,0,0,0.5)' }}>
                      {showFaceGuide && (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <ellipse cx="50" cy="40" rx="22" ry="30" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.7" strokeDasharray="3 2" />
                          <line x1="50" y1="2" x2="50" y2="12" stroke="rgba(255,255,255,0.3)" strokeWidth="0.4" />
                          <line x1="50" y1="88" x2="50" y2="98" stroke="rgba(255,255,255,0.3)" strokeWidth="0.4" />
                        </svg>
                      )}
                      <span className="absolute -top-6 left-0 text-[10px] font-bold text-white whitespace-nowrap drop-shadow-md">35×45mm — drag to adjust</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              <button type="button" onClick={runAutoDetect} disabled={segLoading || busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 text-white font-semibold text-sm hover:bg-rose-700 disabled:opacity-50">
                {segLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <User className="w-4 h-4" />} Auto-detect
              </button>
              <button type="button" onClick={() => onResizeCrop(1)} className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-sm font-semibold">Larger</button>
              <button type="button" onClick={() => onResizeCrop(-1)} className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-sm font-semibold">Smaller</button>
              <button type="button" onClick={() => { setImgObjectUrl(u => { if (u) URL.revokeObjectURL(u); return null; }); setFile(null); setImg(null); setCrop(null); setPreviewUrl(null); setPdfUrl(null); }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold">
                <RefreshCw className="w-4 h-4" /> New photo
              </button>
            </div>
            {detectMsg && <p className="text-center text-sm text-emerald-600 dark:text-emerald-400">{detectMsg}</p>}

            {/* === LIVE EFFECT PREVIEW === */}
            {livePreviewUrl && (
              <div className="flex flex-col items-center gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 text-xs font-bold text-rose-600 dark:text-rose-400">
                  <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
                  Live Effect Preview
                </div>
                <div className="relative rounded-xl overflow-hidden border-2 border-rose-200 dark:border-rose-800 shadow-lg bg-slate-100 dark:bg-slate-800">
                  <img src={livePreviewUrl} alt="Live preview" className="max-w-[240px] max-h-[300px] object-contain" />
                </div>
                <p className="text-[10px] text-slate-400 italic">Effects update in real-time as you adjust sliders</p>
              </div>
            )}
            {!livePreviewUrl && !isDefault(adjustments) && (
              <p className="text-center text-xs text-slate-400 animate-pulse">Generating preview…</p>
            )}

            {/* Sheet preview (visible when tile preview exists) */}
            {previewUrl && (
              <div className="flex flex-col items-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                  <Eye className="w-4 h-4" />
                  Sheet Layout Preview ({qty} photos on {pageSize.toUpperCase()}, gap {gapMm}mm)
                </div>
                <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-4 inline-block shadow-inner">
                  <canvas ref={sheetCanvasRef} className="rounded border border-slate-300 dark:border-slate-600" style={{ maxHeight: 300 }} />
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Sidebar with Tabs */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[calc(100vh-200px)]">
            {/* Tab buttons */}
            <div className="flex border-b border-slate-200 dark:border-slate-700 shrink-0">
              {(['edit', 'layout', 'export'] as const).map(tab => (
                <button key={tab} onClick={() => setSidebarTab(tab)}
                  className={`flex-1 py-3 text-sm font-bold capitalize transition-colors ${sidebarTab === tab ? 'text-rose-600 border-b-2 border-rose-600 bg-rose-50 dark:bg-rose-950/30' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                  {tab === 'edit' ? '🎨 Edit' : tab === 'layout' ? '📐 Layout' : '📥 Export'}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* ══════ EDIT TAB ══════ */}
              {sidebarTab === 'edit' && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Photo Adjustments</span>
                    {!isDefault(adjustments) && (
                      <button onClick={() => setAdjustments({ ...DEFAULT_ADJUSTMENTS })}
                        className="inline-flex items-center gap-1 text-xs text-rose-500 hover:text-rose-700 font-semibold">
                        <RotateCcw className="w-3 h-3" /> Reset all
                      </button>
                    )}
                  </div>

                  {ADJUSTMENT_GROUPS.map(group => (
                    <div key={group.label} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                      <button onClick={() => setOpenGroup(openGroup === group.label ? null : group.label)}
                        className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-750">
                        <span>{group.label}</span>
                        <span className="text-xs text-slate-400">{openGroup === group.label ? '▼' : '▶'}</span>
                      </button>
                      {openGroup === group.label && (
                        <div className="px-3 py-3 space-y-2.5 bg-white dark:bg-slate-900">
                          {group.keys.map(key => adjSlider(key))}
                        </div>
                      )}
                    </div>
                  ))}

                  <p className="text-[10px] text-slate-400 text-center italic pt-2">
                    Adjustments are applied to the cropped image before background removal and sharpening.
                  </p>
                </>
              )}

              {/* ══════ LAYOUT TAB ══════ */}
              {sidebarTab === 'layout' && (
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Copies on sheet: {qty}
                    <input type="range" min={1} max={32} value={qty} onChange={(e) => setQty(Number(e.target.value))} className="mt-1 w-full" />
                  </label>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Gap between photos (mm): {gapMm}
                    <input type="range" min={1} max={12} value={gapMm} onChange={(e) => setGapMm(Number(e.target.value))} className="mt-1 w-full" />
                  </label>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Page margin (mm): {marginMm}
                    <input type="range" min={4} max={20} value={marginMm} onChange={(e) => setMarginMm(Number(e.target.value))} className="mt-1 w-full" />
                  </label>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Paper
                    <select value={pageSize} onChange={(e) => setPageSize(e.target.value as SheetPageSize)} className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-3 py-2">
                      <option value="a4">A4</option>
                      <option value="letter">US Letter</option>
                      <option value="4x6">4×6 inch photo paper</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Export DPI: {exportDpi}
                    <select value={exportDpi} onChange={(e) => setExportDpi(Number(e.target.value) as DpiChoice)} className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-3 py-2">
                      {DPI_OPTIONS.map(d => <option key={d} value={d}>{d} DPI{d === 600 ? ' (Ultra HD)' : ''}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Sharpness: {Math.round(sharpenAmount * 100)}%
                    <input type="range" min={0} max={100} value={Math.round(sharpenAmount * 100)} onChange={(e) => setSharpenAmount(Number(e.target.value) / 100)} className="mt-1 w-full" />
                  </label>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Border (px): {borderPx}
                    <input type="range" min={0} max={8} value={borderPx} onChange={(e) => setBorderPx(Number(e.target.value))} className="mt-1 w-full" />
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    <input type="checkbox" checked={showFaceGuide} onChange={(e) => setShowFaceGuide(e.target.checked)} className="rounded" />
                    Show face alignment guide
                  </label>
                </div>
              )}

              {/* ══════ EXPORT TAB ══════ */}
              {sidebarTab === 'export' && (
                <div className="space-y-4">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    <input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} className="rounded" />
                    Remove background (AI)
                  </label>
                  {!bgModelReady && <p className="text-xs text-amber-600">{bgPreloadMsg || 'Preparing model…'}</p>}

                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Background
                    <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="mt-1 w-full h-10 rounded-lg border border-slate-300" />
                  </label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setBgColor('#ffffff')} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800">White</button>
                    <button type="button" onClick={() => setBgColor('#e8f0fe')} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800">Light blue</button>
                    <button type="button" onClick={() => setBgColor('#f5f5f4')} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800">Off-white</button>
                  </div>

                  {error && <div className="p-3 text-sm rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200">{error}</div>}

                  <div className="flex flex-col gap-3 pt-2">
                    <button type="button" onClick={runPreview} disabled={busy || (removeBg && !bgModelReady)}
                      className="w-full py-3 rounded-xl border border-slate-300 dark:border-slate-600 font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2">
                      <Eye className="w-4 h-4" />
                      {busy ? busyLabel || '…' : 'Preview tile + sheet'}
                    </button>
                    <button type="button" onClick={runPdf} disabled={busy || (removeBg && !bgModelReady)}
                      className="w-full py-3 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-700 disabled:opacity-50 inline-flex items-center justify-center gap-2">
                      <FileImage className="w-5 h-5" />
                      {busy ? busyLabel || '…' : 'Download PDF sheet'}
                    </button>
                  </div>

                  {previewUrl && (
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                      <p className="text-xs font-semibold text-slate-500 mb-2">Single tile preview ({EXPORT_W}×{EXPORT_H}px @ {exportDpi} DPI)</p>
                      <img src={previewUrl} alt="Tile" className="max-w-[180px] rounded border border-slate-200 dark:border-slate-600" />
                    </div>
                  )}
                  {pdfUrl && (
                    <a href={pdfUrl} download="passport-photos-sheet.pdf" className="inline-flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-sm hover:underline">
                      <Download className="w-4 h-4" /> Save PDF again
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
