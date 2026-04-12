import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Camera, RefreshCw, User, FileImage, Loader2 } from 'lucide-react';
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

const PHOTO_W_MM = 35;
const PHOTO_H_MM = 45;
const EXPORT_DPI = 300;
const EXPORT_W = Math.round((PHOTO_W_MM / 25.4) * EXPORT_DPI);
const EXPORT_H = Math.round((PHOTO_H_MM / 25.4) * EXPORT_DPI);

const bgRemoverConfig = {
  model: 'isnet_quint8' as const,
  device: 'cpu' as const,
  proxyToWorker: true,
  rescale: true,
  fetchArgs: { cache: 'force-cache' as RequestCache },
  output: { format: 'image/png' as const, quality: 1 },
};

function loadImageFromFile(file: File): Promise<{ img: HTMLImageElement; objectUrl: string }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, objectUrl });
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image load failed'));
    };
    img.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality);
  });
}

async function cropToCanvas(img: HTMLImageElement, crop: { x: number; y: number; w: number; h: number }): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(crop.w));
  c.height = Math.max(1, Math.round(crop.h));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context');
  ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height);
  return c;
}

async function applyRemoveBg(blob: Blob): Promise<Blob> {
  return removeBackground(blob, {
    ...bgRemoverConfig,
    progress: () => {},
  });
}

function compositeOnColor(cutout: HTMLImageElement, bg: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = cutout.width;
  c.height = cutout.height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(cutout, 0, 0);
  return c;
}

function enhanceToCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('2d');
  ctx.filter = 'brightness(1.07) contrast(1.09) saturate(1.05)';
  ctx.drawImage(src, 0, 0);
  ctx.filter = 'none';
  return out;
}

function drawBorder(canvas: HTMLCanvasElement, borderPx: number): HTMLCanvasElement {
  if (borderPx <= 0) return canvas;
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('2d');
  ctx.drawImage(canvas, 0, 0);
  ctx.strokeStyle = '#d4d4d8';
  ctx.lineWidth = borderPx;
  const inset = borderPx / 2;
  ctx.strokeRect(inset, inset, canvas.width - borderPx, canvas.height - borderPx);
  return out;
}

function resizeHighQuality(src: HTMLCanvasElement, tw: number, th: number): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = tw;
  out.height = th;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, tw, th);
  return out;
}

export default function PassportPhotoSheet() {
  const [file, setFile] = useState<File | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [imgObjectUrl, setImgObjectUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [displayScale, setDisplayScale] = useState(1);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [removeBg, setRemoveBg] = useState(true);
  const [borderPx, setBorderPx] = useState(2);
  const [qty, setQty] = useState(8);
  const [columns] = useState(4);
  const [gapMm, setGapMm] = useState(3);
  const [marginMm, setMarginMm] = useState(10);
  const [pageSize, setPageSize] = useState<SheetPageSize>('a4');
  const [bgModelReady, setBgModelReady] = useState(false);
  const [bgPreloadMsg, setBgPreloadMsg] = useState('');
  const [segmenter, setSegmenter] = useState<BodySegmenter | null>(null);
  const [segLoading, setSegLoading] = useState(false);
  const [detectMsg, setDetectMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ px: number; py: number; start: { x: number; y: number } } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setBgPreloadMsg('Loading background AI…');
        await preload({
          ...bgRemoverConfig,
          progress: (key: string, cur: number, tot: number) => {
            if (!alive) return;
            const pct = tot > 0 ? Math.round((cur / tot) * 100) : 0;
            setBgPreloadMsg(`${key} ${pct}%`);
          },
        });
        if (alive) {
          setBgModelReady(true);
          setBgPreloadMsg('');
        }
      } catch (e: unknown) {
        if (alive) {
          setBgPreloadMsg((e as Error)?.message || 'Background model failed');
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      segmenter?.dispose();
    };
  }, [segmenter]);

  const ensureSegmenter = useCallback(async () => {
    if (segmenter) return segmenter;
    setSegLoading(true);
    try {
      await tf.setBackend('webgl');
      await tf.ready();
      const seg = await createSegmenter(SupportedModels.MediaPipeSelfieSegmentation, {
        runtime: 'tfjs',
        modelType: 'general',
      });
      setSegmenter(seg);
      return seg;
    } finally {
      setSegLoading(false);
    }
  }, [segmenter]);

  const onFile = useCallback(async (files: File[]) => {
    if (!files[0]) return;
    setError(null);
    setPdfUrl(null);
    setPreviewUrl(null);
    setImgObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setFile(files[0]);
    try {
      const { img: loaded, objectUrl } = await loadImageFromFile(files[0]);
      setImg(loaded);
      setImgObjectUrl(objectUrl);
      const nw = loaded.naturalWidth;
      const nh = loaded.naturalHeight;
      setCrop(centerAspectCrop(nw, nh, PASSPORT_ASPECT));
    } catch (e: unknown) {
      setError((e as Error).message);
      setImg(null);
      setFile(null);
      setCrop(null);
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
      const sw = Math.round(nw * sc);
      const sh = Math.round(nh * sc);
      const scCanvas = document.createElement('canvas');
      scCanvas.width = sw;
      scCanvas.height = sh;
      const sctx = scCanvas.getContext('2d');
      if (!sctx) throw new Error('canvas');
      sctx.drawImage(img, 0, 0, sw, sh);
      const [person] = await seg.segmentPeople(scCanvas);
      const idata = await person.mask.toImageData();
      const bboxSmall = maskToPersonBBox(idata, sw, sh);
      const bbox =
        bboxSmall &&
        ({
          x0: (bboxSmall.x0 / sw) * nw,
          y0: (bboxSmall.y0 / sh) * nh,
          x1: (bboxSmall.x1 / sw) * nw,
          y1: (bboxSmall.y1 / sh) * nh,
        } as const);
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

  const onPointerDownCrop = useCallback(
    (e: React.PointerEvent) => {
      if (!crop) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { px: e.clientX, py: e.clientY, start: { x: crop.x, y: crop.y } };
    },
    [crop],
  );

  const onPointerMoveCrop = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current || !crop || !nw || !nh) return;
      const dx = (e.clientX - dragRef.current.px) / displayScale;
      const dy = (e.clientY - dragRef.current.py) / displayScale;
      const nx = dragRef.current.start.x + dx;
      const ny = dragRef.current.start.y + dy;
      setCrop(clampCropRect({ ...crop, x: nx, y: ny }, nw, nh, PASSPORT_ASPECT));
    },
    [crop, nw, nh, displayScale],
  );

  const onPointerUpCrop = useCallback((e: React.PointerEvent) => {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }
    dragRef.current = null;
  }, []);

  const onResizeCrop = useCallback(
    (delta: number) => {
      if (!crop || !nw || !nh) return;
      const factor = 1 + delta * 0.04;
      const nhNew = clamp(crop.h * factor, 48, nh * 1.2);
      const nwNew = nhNew * PASSPORT_ASPECT;
      const cx = crop.x + crop.w / 2;
      const cy = crop.y + crop.h / 2;
      let x = cx - nwNew / 2;
      let y = cy - nhNew / 2;
      setCrop(clampCropRect({ x, y, w: nwNew, h: nhNew }, nw, nh, PASSPORT_ASPECT));
    },
    [crop, nw, nh],
  );

  const buildTilePng = useCallback(async (): Promise<Uint8Array> => {
    if (!img || !crop) throw new Error('No image');
    setBusyLabel(removeBg ? 'Removing background…' : 'Processing…');
    let working = await cropToCanvas(img, crop);
    let blob = await canvasToBlob(working, 'image/jpeg', 0.92);

    if (removeBg) {
      if (!bgModelReady) throw new Error('Background model not ready yet');
      const cutBlob = await applyRemoveBg(blob);
      const cutUrl = URL.createObjectURL(cutBlob);
      const cutImg = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = cutUrl;
      });
      URL.revokeObjectURL(cutUrl);
      working = compositeOnColor(cutImg, bgColor);
    } else {
      const c2 = document.createElement('canvas');
      c2.width = working.width;
      c2.height = working.height;
      const c2x = c2.getContext('2d');
      if (!c2x) throw new Error('2d');
      c2x.fillStyle = bgColor;
      c2x.fillRect(0, 0, c2.width, c2.height);
      c2x.drawImage(working, 0, 0);
      working = c2;
    }

    setBusyLabel('Enhancing & resizing…');
    let enhanced = enhanceToCanvas(working);
    enhanced = drawBorder(enhanced, borderPx);
    const sized = resizeHighQuality(enhanced, EXPORT_W, EXPORT_H);
    const outBlob = await canvasToBlob(sized, 'image/png');
    return new Uint8Array(await outBlob.arrayBuffer());
  }, [img, crop, removeBg, bgColor, borderPx, bgModelReady]);

  const runPreview = useCallback(async () => {
    if (!img || !crop) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = await buildTilePng();
      const blob = new Blob([bytes], { type: 'image/png' });
      setPreviewUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return URL.createObjectURL(blob);
      });
    } catch (e: unknown) {
      setError((e as Error).message || 'Preview failed');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }, [img, crop, buildTilePng]);

  const runPdf = useCallback(async () => {
    if (!img || !crop) return;
    setBusy(true);
    setError(null);
    try {
      const tilePng = await buildTilePng();
      setBusyLabel('Building PDF…');
      const pdfBytes = await buildPassportGridPdf({
        tilePng,
        totalCount: qty,
        columns,
        photoWidthMm: PHOTO_W_MM,
        photoHeightMm: PHOTO_H_MM,
        gapMm,
        marginMm,
        pageSize,
      });
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const pdfObjectUrl = URL.createObjectURL(blob);
      setPdfUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return pdfObjectUrl;
      });
      const tileBlob = new Blob([tilePng], { type: 'image/png' });
      setPreviewUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return URL.createObjectURL(tileBlob);
      });
      const a = document.createElement('a');
      a.href = pdfObjectUrl;
      a.download = 'passport-photos-sheet.pdf';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e: unknown) {
      setError((e as Error).message || 'PDF failed');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }, [img, crop, buildTilePng, qty, columns, gapMm, marginMm, pageSize]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [previewUrl, pdfUrl]);

  useEffect(() => {
    return () => {
      if (imgObjectUrl) URL.revokeObjectURL(imgObjectUrl);
    };
  }, [imgObjectUrl]);

  const dispW = useMemo(() => (nw ? Math.round(nw * displayScale) : 0), [nw, displayScale]);
  const dispH = useMemo(() => (nh ? Math.round(nh * displayScale) : 0), [nh, displayScale]);

  return (
    <div className="flex-1 flex flex-col items-center p-6 md:p-10 pb-24">
      <div className="text-center max-w-2xl mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">Passport photo sheet</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400 text-sm md:text-base">
          Upload a portrait, auto-detect the person (optional), adjust the crop box, then export a print-ready PDF with{' '}
          {columns} photos per row and cut gaps. Default photo size <strong>35×45 mm</strong> (common India form). Not an official compliance guarantee — always verify with your authority.
        </p>
      </div>

      {!file || !img || !crop ? (
        <div className="w-full max-w-xl space-y-4">
          <FileDropzone
            onDrop={onFile}
            multiple={false}
            title="Upload portrait photo"
            subtitle="JPG, PNG, WEBP — or use camera on phone"
            accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.bmp'] }}
            variant="dark"
            className="dark:bg-slate-900/60"
          />
          <label className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700">
            <Camera className="w-5 h-5" />
            Take photo
            <input
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) onFile([f]);
              }}
            />
          </label>
        </div>
      ) : (
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div ref={wrapRef} className="relative mx-auto w-full max-w-[640px] flex justify-center">
              <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900" style={{ width: dispW, height: dispH }}>
                {imgObjectUrl && (
                  <img src={imgObjectUrl} alt="Source" width={dispW} height={dispH} className="block pointer-events-none" draggable={false} />
                )}
                {crop && (
                  <div
                    className="absolute left-0 top-0 cursor-move touch-none"
                    style={{ width: dispW, height: dispH }}
                    onPointerDown={onPointerDownCrop}
                    onPointerMove={onPointerMoveCrop}
                    onPointerUp={onPointerUpCrop}
                    onPointerCancel={onPointerUpCrop}
                  >
                    <div
                      className="absolute border-2 border-white shadow-lg rounded-sm pointer-events-none"
                      style={{
                        left: crop.x * displayScale,
                        top: crop.y * displayScale,
                        width: crop.w * displayScale,
                        height: crop.h * displayScale,
                        boxShadow: '0 0 0 4096px rgba(0,0,0,0.5)',
                      }}
                    >
                      <span className="absolute -top-6 left-0 text-[10px] font-bold text-white whitespace-nowrap drop-shadow-md">
                        35:45 — drag to adjust
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                type="button"
                onClick={runAutoDetect}
                disabled={segLoading || busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 text-white font-semibold text-sm hover:bg-rose-700 disabled:opacity-50"
              >
                {segLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <User className="w-4 h-4" />}
                Auto-detect person
              </button>
              <button type="button" onClick={() => onResizeCrop(1)} className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-sm font-semibold">
                Crop larger
              </button>
              <button type="button" onClick={() => onResizeCrop(-1)} className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-sm font-semibold">
                Crop smaller
              </button>
              <button
                type="button"
                onClick={() => {
                  setImgObjectUrl((u) => {
                    if (u) URL.revokeObjectURL(u);
                    return null;
                  });
                  setFile(null);
                  setImg(null);
                  setCrop(null);
                  setPreviewUrl(null);
                  setPdfUrl(null);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold"
              >
                <RefreshCw className="w-4 h-4" />
                New photo
              </button>
            </div>
            {detectMsg && <p className="text-center text-sm text-emerald-600 dark:text-emerald-400">{detectMsg}</p>}
          </div>

          <div className="space-y-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} className="rounded" />
              Remove background (on-device AI)
            </label>
            {!bgModelReady && <p className="text-xs text-amber-600">{bgPreloadMsg || 'Preparing model…'}</p>}

            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Background
              <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="mt-1 w-full h-10 rounded-lg border border-slate-300" />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setBgColor('#ffffff')} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800">
                White
              </button>
              <button type="button" onClick={() => setBgColor('#e8f0fe')} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800">
                Light blue
              </button>
              <button type="button" onClick={() => setBgColor('#f5f5f4')} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800">
                Off-white
              </button>
            </div>

            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Border (px): {borderPx}
              <input type="range" min={0} max={8} value={borderPx} onChange={(e) => setBorderPx(Number(e.target.value))} className="mt-1 w-full" />
            </label>

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
              </select>
            </label>

            {error && <div className="p-3 text-sm rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200">{error}</div>}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={runPreview}
                disabled={busy || (removeBg && !bgModelReady)}
                className="flex-1 py-3 rounded-xl border border-slate-300 dark:border-slate-600 font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                {busy ? busyLabel || '…' : 'Preview tile'}
              </button>
              <button
                type="button"
                onClick={runPdf}
                disabled={busy || (removeBg && !bgModelReady)}
                className="flex-1 py-3 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                <FileImage className="w-5 h-5" />
                {busy ? busyLabel || '…' : 'Download PDF sheet'}
              </button>
            </div>

            {previewUrl && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                <p className="text-xs font-semibold text-slate-500 mb-2">Single tile preview ({EXPORT_W}×{EXPORT_H}px @ ~300 DPI)</p>
                <img src={previewUrl} alt="Tile" className="max-w-[180px] rounded border border-slate-200 dark:border-slate-600" />
              </div>
            )}
            {pdfUrl && (
              <a
                href={pdfUrl}
                download="passport-photos-sheet.pdf"
                className="inline-flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-sm hover:underline"
              >
                <Download className="w-4 h-4" />
                Save PDF again
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
