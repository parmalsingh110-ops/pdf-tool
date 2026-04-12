import { useState, useRef, useEffect, useCallback } from 'react';
import { Download, Image as ImageIcon, Ruler, Package } from 'lucide-react';
import JSZip from 'jszip';
import FileDropzone from '../components/FileDropzone';
import { encodeCanvasUnderByteBudget, type RasterMime } from '../lib/imageByteBudget';

const RESIZER_IMAGE_ACCEPT: Record<string, string[]> = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
};

type Unit = 'px' | 'mm' | 'cm' | 'in';
type ExportFormat = 'image/jpeg' | 'image/png' | 'image/webp' | 'original';
type ResizeMode = 'size' | 'percent' | 'social';

const SOCIAL_PRESETS = [
  { id: 'ig_sq', label: 'Instagram square', w: 1080, h: 1080 },
  { id: 'ig_story', label: 'Story 9:16', w: 1080, h: 1920 },
  { id: 'fb_og', label: 'Link preview 1.91:1', w: 1200, h: 630 },
  { id: 'wa_sq', label: 'Square HD', w: 1080, h: 1080 },
  { id: 'form_sm', label: 'Form photo ~200×230', w: 200, h: 230 },
  { id: 'passport_300', label: '35×45 mm @300 DPI', w: 413, h: 531 },
  { id: 'passport_200', label: '35×45 mm @200 DPI', w: 276, h: 354 },
  { id: 'pan_india', label: 'PAN card scan ~ aspect', w: 1200, h: 756 },
  { id: 'aadhaar_front', label: 'ID card front ~ landscape', w: 1400, h: 900 },
  { id: 'linkedin_banner', label: 'LinkedIn banner 4:1', w: 1584, h: 396 },
  { id: 'yt_thumb', label: 'YouTube thumbnail', w: 1280, h: 720 },
  { id: 'twitter_header', label: 'Twitter/X header 3:1', w: 1500, h: 500 },
] as const;

const DPI_PRESETS = [72, 96, 120, 150, 200, 300] as const;

function valueToPx(value: number, unit: Unit, dpi: number): number {
  if (unit === 'px') return Math.round(value);
  if (unit === 'in') return Math.round(value * dpi);
  if (unit === 'cm') return Math.round((value / 2.54) * dpi);
  if (unit === 'mm') return Math.round((value / 25.4) * dpi);
  return Math.round(value);
}

function pxToDisplay(px: number, unit: Unit, dpi: number): number {
  if (unit === 'px') return px;
  if (unit === 'in') return px / dpi;
  if (unit === 'cm') return (px / dpi) * 2.54;
  if (unit === 'mm') return (px / dpi) * 25.4;
  return px;
}

export default function ImageResizer() {
  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  const [resizeMode, setResizeMode] = useState<ResizeMode>('size');
  const [unit, setUnit] = useState<Unit>('px');
  const [dpi, setDpi] = useState(96);
  const [widthIn, setWidthIn] = useState<string>('');
  const [heightIn, setHeightIn] = useState<string>('');
  const [lockAspect, setLockAspect] = useState(true);
  const [percentStr, setPercentStr] = useState<string>('100');
  const [socialId, setSocialId] = useState<string>(SOCIAL_PRESETS[0].id);

  const [targetKb, setTargetKb] = useState<string>('');
  const [targetUnit, setTargetUnit] = useState<'KB' | 'MB'>('KB');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('image/jpeg');

  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultMeta, setResultMeta] = useState<{ w: number; h: number; bytes: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [comparePct, setComparePct] = useState(50);
  const [dropHint, setDropHint] = useState<string | null>(null);
  const [batchQueue, setBatchQueue] = useState<File[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [objectUrl, resultUrl]);

  const syncInputsFromNatural = (w: number, h: number) => {
    setWidthIn(pxToDisplay(w, unit, dpi).toFixed(unit === 'px' ? 0 : 2));
    setHeightIn(pxToDisplay(h, unit, dpi).toFixed(unit === 'px' ? 0 : 2));
  };

  const handleImageFile = (f: File) => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    setResultMeta(null);
    setNote(null);
    setFile(f);
    const url = URL.createObjectURL(f);
    setObjectUrl(url);
    const img = new Image();
    img.onload = () => {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      syncInputsFromNatural(img.naturalWidth, img.naturalHeight);
      setPercentStr('100');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setFile(null);
      setObjectUrl(null);
      setNatural(null);
      alert('Could not read this file. Use JPG, PNG, WebP, or GIF.');
    };
    img.src = url;
  };

  const handleDrop = (accepted: File[]) => {
    const f = accepted[0];
    if (f) handleImageFile(f);
    else if (fileInputRef.current) {
      /* dropzone rejected — often wrong type */
    }
  };

  useEffect(() => {
    if (natural) {
      syncInputsFromNatural(natural.w, natural.h);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit, dpi]);

  const parseDim = (s: string) => {
    const n = parseFloat(String(s).replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  };

  const onWidthChange = (v: string) => {
    setWidthIn(v);
    if (!natural || !lockAspect) return;
    const wPx = valueToPx(parseDim(v), unit, dpi);
    if (!Number.isFinite(wPx) || wPx <= 0) return;
    const ratio = natural.h / natural.w;
    const hPx = Math.round(wPx * ratio);
    setHeightIn(pxToDisplay(hPx, unit, dpi).toFixed(unit === 'px' ? 0 : 2));
  };

  const onHeightChange = (v: string) => {
    setHeightIn(v);
    if (!natural || !lockAspect) return;
    const hPx = valueToPx(parseDim(v), unit, dpi);
    if (!Number.isFinite(hPx) || hPx <= 0) return;
    const ratio = natural.w / natural.h;
    const wPx = Math.round(hPx * ratio);
    setWidthIn(pxToDisplay(wPx, unit, dpi).toFixed(unit === 'px' ? 0 : 2));
  };

  const applySocialPreset = (id: string) => {
    setSocialId(id);
    setResizeMode('social');
    const p = SOCIAL_PRESETS.find((x) => x.id === id);
    if (!p || !natural) return;
    setUnit('px');
    setWidthIn(String(p.w));
    setHeightIn(String(p.h));
    setLockAspect(false);
  };

  const targetBytes = (): number | null => {
    const raw = parseFloat(targetKb.replace(',', '.'));
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return targetUnit === 'MB' ? Math.round(raw * 1024 * 1024) : Math.round(raw * 1024);
  };

  const computeOutputPxFor = useCallback(
    (nat: { w: number; h: number }): { wPx: number; hPx: number } | null => {
      if (resizeMode === 'percent') {
        const p = parseFloat(percentStr.replace(',', '.'));
        if (!Number.isFinite(p) || p <= 0) return null;
        return {
          wPx: Math.max(1, Math.round((nat.w * p) / 100)),
          hPx: Math.max(1, Math.round((nat.h * p) / 100)),
        };
      }
      if (resizeMode === 'social') {
        const p = SOCIAL_PRESETS.find((x) => x.id === socialId);
        if (!p) return null;
        return { wPx: p.w, hPx: p.h };
      }
      const wPx = valueToPx(parseDim(widthIn), unit, dpi);
      const hPx = valueToPx(parseDim(heightIn), unit, dpi);
      if (!Number.isFinite(wPx) || !Number.isFinite(hPx) || wPx < 1 || hPx < 1) return null;
      return { wPx, hPx };
    },
    [dpi, heightIn, percentStr, resizeMode, socialId, unit, widthIn],
  );

  const computeOutputPx = (): { wPx: number; hPx: number } | null => {
    if (!natural) return null;
    return computeOutputPxFor(natural);
  };

  const resolveMimeForFile = (f: File | null): ExportFormat => {
    if (exportFormat !== 'original') return exportFormat;
    if (!f) return 'image/jpeg';
    const t = f.type;
    if (t === 'image/png') return 'image/png';
    if (t === 'image/webp') return 'image/webp';
    return 'image/jpeg';
  };

  const resolveMime = (): ExportFormat => resolveMimeForFile(file);

  const renderUrlToBlob = async (
    srcUrl: string,
    wPx: number,
    hPx: number,
    sourceFile: File | null,
  ): Promise<{ blob: Blob; note: string | null }> => {
    if (!canvasRef.current) throw new Error('No canvas');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = srcUrl;
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('Image load failed'));
    });

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas context');

    canvas.width = wPx;
    canvas.height = hPx;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, wPx, hPx);

    const maxBytes = targetBytes();
    let mime = resolveMimeForFile(sourceFile);

    let userNote: string | null = null;
    if (mime === 'image/png' && maxBytes) {
      userNote =
        'Target file size applies to JPEG/WebP. PNG is lossless — export may exceed the limit.';
    }

    let blob: Blob | null = null;

    if (mime !== 'image/png' && maxBytes) {
      if (mime !== 'image/jpeg' && mime !== 'image/webp') {
        mime = 'image/jpeg';
      }
      const enc = await encodeCanvasUnderByteBudget(canvas, mime as RasterMime, maxBytes);
      blob = enc.blob;
      let msg = enc.note ?? null;
      if (blob.size > maxBytes) {
        msg = [
          msg,
          `Still above ${targetUnit === 'MB' ? targetKb + ' MB' : targetKb + ' KB'} — try a smaller pixel size or JPEG.`,
        ]
          .filter(Boolean)
          .join(' ');
      }
      userNote = [userNote, msg].filter(Boolean).join(' ');
    } else {
      blob = await new Promise<Blob | null>((resolve) => {
        if (mime === 'image/png') {
          canvas.toBlob((b) => resolve(b), mime);
        } else {
          canvas.toBlob((b) => resolve(b), mime, 0.92);
        }
      });
    }

    if (!blob) throw new Error('Export failed');
    return { blob, note: userNote };
  };

  const exportImage = async () => {
    if (!file || !objectUrl || !natural || !canvasRef.current) return;
    const dims = computeOutputPx();
    if (!dims) {
      alert('Please enter valid width and height (or choose a preset / percentage).');
      return;
    }
    const { wPx, hPx } = dims;

    setBusy(true);
    setNote(null);
    try {
      const { blob, note: n } = await renderUrlToBlob(objectUrl, wPx, hPx, file);
      setNote(n);

      if (resultUrl) URL.revokeObjectURL(resultUrl);
      const out = URL.createObjectURL(blob);
      setResultUrl(out);
      setResultMeta({ w: wPx, h: hPx, bytes: blob.size });
    } catch (e) {
      console.error(e);
      alert('Resize/export failed.');
    } finally {
      setBusy(false);
    }
  };

  const exportZipFromQueue = async () => {
    if (batchQueue.length === 0) {
      alert('Add at least one image to the batch queue.');
      return;
    }
    if (resizeMode === 'size' && lockAspect) {
      if (
        !confirm(
          'Batch export uses the same width/height fields for every file; with aspect lock they were tuned for the current preview image. Continue?',
        )
      ) {
        return;
      }
    }
    setBatchBusy(true);
    setNote(null);
    try {
      const zip = new JSZip();

      for (const f of batchQueue) {
        const url = URL.createObjectURL(f);
        try {
          const nat = await new Promise<{ w: number; h: number }>((res, rej) => {
            const im = new Image();
            im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
            im.onerror = () => rej(new Error('load'));
            im.src = url;
          });
          const dims = computeOutputPxFor(nat);
          if (!dims) continue;
          const { blob } = await renderUrlToBlob(url, dims.wPx, dims.hPx, f);
          const base = f.name.replace(/\.[^.]+$/, '') || 'image';
          const perMime = resolveMimeForFile(f);
          const ext =
            perMime === 'image/jpeg'
              ? 'jpg'
              : perMime === 'image/webp'
                ? 'webp'
                : perMime === 'image/png'
                  ? 'png'
                  : 'jpg';
          zip.file(`${base}.${ext}`, blob);
        } finally {
          URL.revokeObjectURL(url);
        }
      }

      const zipped = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(zipped);
      a.download = 'resized-batch.zip';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error(e);
      alert('Batch ZIP failed.');
    } finally {
      setBatchBusy(false);
    }
  };

  const mime = resolveMime();
  const ext =
    mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
  const dimsPreview = computeOutputPx();

  const tabBtn = (mode: ResizeMode, label: string) => (
    <button
      type="button"
      key={mode}
      onClick={() => setResizeMode(mode)}
      className={`flex-1 px-2 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors ${
        resizeMode === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex-1 flex flex-col bg-slate-100 min-h-[calc(100vh-4rem)]">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImageFile(f);
          e.target.value = '';
        }}
      />
      <div className="max-w-6xl mx-auto w-full px-4 py-8 flex flex-col gap-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-sky-100 text-sky-700">
            <Ruler className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900">Image resizer (forms)</h1>
            <p className="mt-2 text-slate-600 max-w-2xl">
              Resize for government and job portals: <strong>By size</strong> (width/height + pixel, inch, cm, mm),{' '}
              <strong>as %</strong>, or <strong>social presets</strong>. Optional max file size for JPEG/WebP. Set DPI
              when using physical units (96 screen, 300 print).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:items-start">
          <div className="lg:col-span-4 space-y-4 relative z-[5] min-w-0 [contain:layout]">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Resize settings</h2>

              <div className="flex rounded-xl bg-slate-100 p-1 gap-1">
                {tabBtn('size', 'By size')}
                {tabBtn('percent', 'As %')}
                {tabBtn('social', 'Social')}
              </div>

              {!file ? (
                <div className="space-y-3">
                  <FileDropzone
                    onDrop={handleDrop}
                    onDropRejected={(msg) => {
                      setDropHint(msg);
                      setTimeout(() => setDropHint(null), 6000);
                    }}
                    multiple={false}
                    maxFiles={1}
                    accept={RESIZER_IMAGE_ACCEPT}
                    title="Add image"
                    subtitle="Drag & drop or click — JPG, PNG, WebP, GIF"
                    buttonLabel="Choose image"
                  />
                  {dropHint && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">{dropHint}</p>}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2.5 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50"
                  >
                    Browse files…
                  </button>
                  <p className="text-xs text-slate-500">
                    Width/height unlock after you pick an image. Units apply to output size.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="truncate" title={file.name}>
                      {file.name}
                    </span>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        className="text-sky-600 font-semibold"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        className="text-rose-600 font-semibold"
                        onClick={() => {
                          if (objectUrl) URL.revokeObjectURL(objectUrl);
                          if (resultUrl) URL.revokeObjectURL(resultUrl);
                          setFile(null);
                          setObjectUrl(null);
                          setNatural(null);
                          setResultUrl(null);
                          setResultMeta(null);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  {resizeMode === 'size' && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-slate-600">Width</label>
                          <input
                            placeholder="Enter width"
                            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                            value={widthIn}
                            onChange={(e) => onWidthChange(e.target.value)}
                            disabled={!natural}
                          />
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1 min-w-0">
                            <label className="text-xs font-medium text-slate-600">Height</label>
                            <input
                              placeholder="Enter height"
                              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                              value={heightIn}
                              onChange={(e) => onHeightChange(e.target.value)}
                              disabled={!natural}
                            />
                          </div>
                          <div className="min-w-0 shrink-0 w-[6.5rem]">
                            <label className="text-xs font-medium text-slate-600">Unit</label>
                            <div className="mt-1 flex flex-wrap gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                              {(
                                [
                                  ['px', 'px'],
                                  ['in', 'in'],
                                  ['cm', 'cm'],
                                  ['mm', 'mm'],
                                ] as const
                              ).map(([u, lab]) => (
                                <button
                                  key={u}
                                  type="button"
                                  onClick={() => setUnit(u)}
                                  className={`flex-1 min-w-[1.75rem] rounded px-1 py-1.5 text-[10px] font-bold leading-none ${
                                    unit === u ? 'bg-white text-sky-700 shadow' : 'text-slate-600 hover:bg-white/80'
                                  }`}
                                >
                                  {lab}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                      {unit !== 'px' && (
                        <div>
                          <label className="text-xs font-medium text-slate-600">DPI (for cm/mm/in → px)</label>
                          <input
                            type="number"
                            min={36}
                            max={600}
                            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                            value={dpi}
                            onChange={(e) => setDpi(Math.max(1, parseInt(e.target.value, 10) || 96))}
                          />
                          <div className="mt-2 flex flex-wrap gap-1">
                            {DPI_PRESETS.map((d) => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => setDpi(d)}
                                className={`px-2 py-1 rounded-md text-[11px] font-bold border ${
                                  dpi === d
                                    ? 'bg-sky-600 text-white border-sky-600'
                                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                {d}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={lockAspect}
                          onChange={(e) => setLockAspect(e.target.checked)}
                        />
                        Lock aspect ratio
                      </label>
                    </>
                  )}

                  {resizeMode === 'percent' && natural && (
                    <div>
                      <label className="text-xs font-medium text-slate-600">Scale (% of original)</label>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        step={1}
                        className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                        value={percentStr}
                        onChange={(e) => setPercentStr(e.target.value)}
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        From {natural.w}×{natural.h}px →{' '}
                        {Math.max(1, Math.round((natural.w * parseFloat(percentStr || '0')) / 100))}×
                        {Math.max(1, Math.round((natural.h * parseFloat(percentStr || '0')) / 100))}px
                      </p>
                    </div>
                  )}

                  {resizeMode === 'social' && (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-500">Preset output (pixels)</p>
                      <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto">
                        {SOCIAL_PRESETS.map((p) => (
                          <button
                            type="button"
                            key={p.id}
                            onClick={() => applySocialPreset(p.id)}
                            className={`text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
                              socialId === p.id
                                ? 'border-sky-500 bg-sky-50 text-sky-900'
                                : 'border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <span className="font-medium">{p.label}</span>
                            <span className="text-slate-500 text-xs ml-2">
                              {p.w}×{p.h}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3">Export settings</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Save image as</label>
                  <select
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                  >
                    <option value="original">Original type</option>
                    <option value="image/jpeg">JPEG</option>
                    <option value="image/png">PNG</option>
                    <option value="image/webp">WebP</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Target file size (optional)</label>
                  <div className="flex gap-2 mt-1">
                    <input
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      placeholder="e.g. 50"
                      value={targetKb}
                      onChange={(e) => setTargetKb(e.target.value)}
                    />
                    <select
                      className="border border-slate-200 rounded-lg px-2 text-sm"
                      value={targetUnit}
                      onChange={(e) => setTargetUnit(e.target.value as 'KB' | 'MB')}
                    >
                      <option value="KB">KB</option>
                      <option value="MB">MB</option>
                    </select>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Best-effort for JPEG/WebP. Use JPEG for strict form limits.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!file || !natural || busy}
                  onClick={exportImage}
                  className="w-full py-3 rounded-xl bg-sky-600 text-white font-bold hover:bg-sky-700 disabled:opacity-50"
                >
                  {busy ? 'Processing…' : 'Export →'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Batch (ZIP)</h2>
              <p className="text-xs text-slate-500">
                Queue more images with the same resize rules (great for % or social presets). Export downloads a{' '}
                <code className="text-[10px] bg-slate-100 px-1 rounded">.zip</code>.
              </p>
              <input
                ref={batchInputRef}
                type="file"
                className="hidden"
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => {
                  const list = e.target.files ? Array.from(e.target.files) : [];
                  if (list.length) setBatchQueue((q) => [...q, ...list]);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => batchInputRef.current?.click()}
                className="w-full py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50"
              >
                Add images to queue…
              </button>
              {batchQueue.length > 0 && (
                <ul className="max-h-32 overflow-y-auto text-xs space-y-1 border border-slate-100 rounded-lg p-2">
                  {batchQueue.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex justify-between gap-2 truncate">
                      <span className="truncate">{f.name}</span>
                      <button
                        type="button"
                        className="text-rose-600 font-semibold shrink-0"
                        onClick={() => setBatchQueue((q) => q.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                disabled={batchBusy || batchQueue.length === 0}
                onClick={exportZipFromQueue}
                className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                <Package className="w-5 h-5" />
                {batchBusy ? 'Zipping…' : 'Export queue as ZIP'}
              </button>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-4 relative z-0 min-w-0 isolate">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm min-h-[320px] flex flex-col items-center justify-center overflow-hidden">
              {objectUrl && natural ? (
                <div className="w-full space-y-4">
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                    <ImageIcon className="w-4 h-4" />
                    <span className="font-mono bg-slate-100 px-2 py-1 rounded">
                      {natural.w} × {natural.h} px
                      {resultMeta
                        ? ` → ${resultMeta.w} × ${resultMeta.h} px`
                        : dimsPreview
                          ? ` → ${dimsPreview.wPx} × ${dimsPreview.hPx} px`
                          : ''}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">Showing your file as uploaded (not the sidebar).</p>
                  <div className="rounded-xl border border-slate-200 bg-slate-100 flex justify-center items-center max-h-[min(520px,65vh)] overflow-hidden">
                    {resultUrl ? (
                      <div className="w-full space-y-3 p-3">
                        <div className="relative inline-block max-w-full mx-auto select-none">
                          <img
                            src={objectUrl}
                            alt="Before"
                            className="max-h-[min(480px,60vh)] w-auto h-auto object-contain block mx-auto"
                            decoding="async"
                          />
                          <img
                            src={resultUrl}
                            alt="After"
                            className="absolute left-1/2 top-0 -translate-x-1/2 max-h-[min(480px,60vh)] w-auto h-auto object-contain pointer-events-none"
                            style={{ clipPath: `inset(0 ${100 - comparePct}% 0 0)` }}
                            decoding="async"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                            <span>Before</span>
                            <span>After</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={comparePct}
                            onChange={(e) => setComparePct(Number(e.target.value))}
                            className="w-full accent-sky-600"
                            aria-label="Before and after comparison"
                          />
                        </div>
                      </div>
                    ) : (
                      <img
                        src={objectUrl}
                        alt="Resize preview"
                        className="max-w-full max-h-[min(520px,65vh)] w-auto h-auto object-contain block"
                        decoding="async"
                      />
                    )}
                  </div>
                  {resultUrl && resultMeta && (
                    <div className="flex flex-wrap items-center gap-4">
                      <a
                        href={resultUrl}
                        download={`resized_${file?.name?.replace(/\.[^.]+$/, '') || 'image'}.${ext}`}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700"
                      >
                        <Download className="w-5 h-5" />
                        Download ({(resultMeta.bytes / 1024).toFixed(1)} KB)
                      </a>
                    </div>
                  )}
                  {note && (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">{note}</p>
                  )}
                </div>
              ) : (
                <div className="w-full max-w-md text-center space-y-3">
                  <p className="text-slate-500">Preview appears here after you add an image.</p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex px-6 py-3 rounded-xl bg-sky-600 text-white font-bold hover:bg-sky-700"
                  >
                    Select image
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />

      {resultUrl && resultMeta && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
          <span className="text-xs text-slate-600 truncate">
            {(resultMeta.bytes / 1024).toFixed(1)} KB · {resultMeta.w}×{resultMeta.h}
          </span>
          <a
            href={resultUrl}
            download={`resized_${file?.name?.replace(/\.[^.]+$/, '') || 'image'}.${ext}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold shrink-0"
          >
            <Download className="w-4 h-4" />
            Download
          </a>
        </div>
      )}
    </div>
  );
}
