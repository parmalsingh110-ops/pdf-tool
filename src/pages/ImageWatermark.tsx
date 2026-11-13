import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Droplet, Download, Loader2, CheckCircle2 } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

type WatermarkPos = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'tile';

export default function ImageWatermark() {
  useSEO('Image Watermark Online Free | PDF Media Suite', 'Free online Image Watermark tool. No signup or installation required.');

  usePageSEO('Add Watermark to Image', 'Add text watermarks to images with position, opacity, tiling, and rotation controls. Free online image watermark tool.');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState('CONFIDENTIAL');
  const [fontSize, setFontSize] = useState(48);
  const [opacity, setOpacity] = useState(0.25);
  const [color, setColor] = useState('#000000');
  const [position, setPosition] = useState<WatermarkPos>('center');
  const [rotation, setRotation] = useState(-30);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const prefersReduced = useReducedMotion();
  useAutoRevokeUrl(preview);
  useAutoRevokeUrl(resultUrl);

  const handleDrop = (files: File[]) => {
    const f = files[0];
    if (f) {
      setFile(f);
      setPreview(URL.createObjectURL(f));
      setResultUrl(null);
    }
  };

  const apply = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const img = new Image();
      img.src = preview!;
      await new Promise<void>((res) => {
        img.onload = () => res();
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      ctx.globalAlpha = opacity;
      ctx.fillStyle = color;
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (position === 'tile') {
        const stepX = fontSize * 8;
        const stepY = fontSize * 4;
        for (let x = -canvas.width; x < canvas.width * 2; x += stepX) {
          for (let y = -canvas.height; y < canvas.height * 2; y += stepY) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate((rotation * Math.PI) / 180);
            ctx.fillText(text, 0, 0);
            ctx.restore();
          }
        }
      } else {
        let x = canvas.width / 2,
          y = canvas.height / 2;
        if (position === 'top-left') {
          x = fontSize * 3;
          y = fontSize * 2;
        } else if (position === 'top-right') {
          x = canvas.width - fontSize * 3;
          y = fontSize * 2;
        } else if (position === 'bottom-left') {
          x = fontSize * 3;
          y = canvas.height - fontSize * 2;
        } else if (position === 'bottom-right') {
          x = canvas.width - fontSize * 3;
          y = canvas.height - fontSize * 2;
        }
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }

      ctx.globalAlpha = 1;
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), 'image/jpeg', 0.92));
      if (blob) setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      alert(e?.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const positions: { label: string; value: WatermarkPos }[] = [
    { label: 'Center', value: 'center' },
    { label: 'Tile', value: 'tile' },
    { label: '↖ Top Left', value: 'top-left' },
    { label: '↗ Top Right', value: 'top-right' },
    { label: '↙ Bottom Left', value: 'bottom-left' },
    { label: '↘ Bottom Right', value: 'bottom-right' },
  ];

  const stageKey = !file ? 'drop' : resultUrl ? 'done' : 'configure';

  return (
    <ToolWorkspaceShell
      title="Image Watermark"
      subtitle="Add text watermarks with exact position, opacity, color, angle, and seamless tiling."
      categoryLabel="Brand Protection Studio"
      icon={Droplet}
      microVariant="edit"
      tone="sky"
      trustNote="Single-point & tiled canvas stamping · 100% browser-only"
    >
      <PearlStageSwitch stageKey={stageKey}>
        {!file ? (
          <div className="max-w-2xl mx-auto">
            <FileDropzone
              onDrop={handleDrop}
              multiple={false}
              accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] }}
              title="Select Image to watermark"
              subtitle="Drop JPG, PNG, or WebP here"
            />
          </div>
        ) : resultUrl ? (
          <div className="w-full max-w-3xl mx-auto space-y-5">
            <div className="pms-glass-panel rounded-3xl p-6 sm:p-8 text-center border border-emerald-200/80 dark:border-emerald-800/70 space-y-5">
              <div className="flex flex-col items-center">
                <motion.div
                  initial={prefersReduced ? false : { scale: 0.45, rotate: -10, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 18 }}
                  className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/50 rounded-full flex items-center justify-center mb-3 shadow-inner"
                >
                  <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                </motion.div>
                <h3 className="text-2xl font-extrabold text-emerald-900 dark:text-emerald-200">
                  Watermark Applied!
                </h3>
              </div>

              <div className="pms-checkerboard bg-white dark:bg-slate-950 rounded-2xl border border-[var(--pms-border)] p-4 flex items-center justify-center">
                <img src={resultUrl} alt="Watermarked result" className="max-h-[48vh] mx-auto rounded-lg shadow-sm object-contain" />
              </div>

              <div className="flex flex-wrap gap-3 justify-center">
                <motion.a
                  whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                  whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                  href={resultUrl}
                  download={`watermarked_${file.name}`}
                  className="px-7 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-colors"
                >
                  <Download className="w-5 h-5" /> Download Image
                </motion.a>
                <button
                  onClick={() => setResultUrl(null)}
                  className="px-6 py-3.5 bg-white/80 dark:bg-slate-800 border border-[var(--pms-border)] text-gray-700 dark:text-slate-200 rounded-2xl font-semibold hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Edit again
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                setFile(null);
                setPreview(null);
                setResultUrl(null);
              }}
              className="w-full py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-2xl font-semibold text-sm hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Watermark another image
            </button>
          </div>
        ) : (
          <div className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
            <div className="relative pms-glass-panel rounded-3xl p-4 sm:p-5 overflow-hidden">
              <PearlScanOverlay active={busy} label="Stamping watermark across pixels…" />
              <div className="pms-checkerboard bg-white dark:bg-slate-950 rounded-2xl border border-[var(--pms-border)] p-4 flex items-center justify-center min-h-[400px]">
                <img src={preview!} alt="Source preview" className="max-h-[52vh] rounded-lg shadow-sm object-contain" />
              </div>
            </div>

            <div className="pms-glass-panel rounded-3xl p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-slate-400 mb-1.5">
                  Watermark Text
                </label>
                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--pms-border)] bg-white/85 dark:bg-slate-900/75 text-gray-900 dark:text-white font-semibold"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                  <span>Font Size</span>
                  <span className="font-mono text-[var(--pms-blue)]">
                    <AnimatedNumber value={fontSize} suffix="px" />
                  </span>
                </div>
                <input
                  type="range"
                  min="16"
                  max="120"
                  value={fontSize}
                  onChange={(e) => setFontSize(+e.target.value)}
                  className="w-full accent-sky-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                  <span>Opacity</span>
                  <span className="font-mono text-[var(--pms-blue)]">
                    <AnimatedNumber value={Math.round(opacity * 100)} suffix="%" />
                  </span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="1"
                  step="0.05"
                  value={opacity}
                  onChange={(e) => setOpacity(+e.target.value)}
                  className="w-full accent-sky-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                  <span>Rotation</span>
                  <span className="font-mono text-[var(--pms-blue)]">{rotation}°</span>
                </div>
                <input
                  type="range"
                  min="-90"
                  max="90"
                  value={rotation}
                  onChange={(e) => setRotation(+e.target.value)}
                  className="w-full accent-sky-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-slate-400">
                  Color
                </label>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-12 h-9 rounded-xl border border-[var(--pms-border)] cursor-pointer bg-white dark:bg-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-slate-400 mb-2">
                  Position
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {positions.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setPosition(p.value)}
                      className={`py-2 px-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        position === p.value
                          ? 'bg-[var(--pms-soft-blue)] border-sky-500 text-[var(--pms-blue)] shadow-xs'
                          : 'bg-white/70 dark:bg-slate-800/70 border-[var(--pms-border)] text-gray-600 dark:text-slate-300 hover:border-sky-300'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <motion.button
                whileHover={prefersReduced || busy || !text ? undefined : { scale: 1.01 }}
                whileTap={prefersReduced || busy || !text ? undefined : { scale: 0.985 }}
                onClick={apply}
                disabled={busy || !text}
                className="w-full pms-btn-primary py-3.5 font-bold rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Droplet className="w-5 h-5" />}
                {busy ? 'Applying…' : 'Apply Watermark'}
              </motion.button>

              <button
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                  setResultUrl(null);
                }}
                className="w-full py-2.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold text-xs hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Change image
              </button>
            </div>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
