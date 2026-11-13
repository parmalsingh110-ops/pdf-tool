import { useState, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { LayoutGrid, Download, Plus, X, Loader2, CheckCircle2 } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { useSEO } from '../hooks/useSEO';
import { triggerBlobDownload } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

const TEMPLATES = [
  { name: '2×1', cols: 2, rows: 1 },
  { name: '2×2', cols: 2, rows: 2 },
  { name: '3×2', cols: 3, rows: 2 },
  { name: '3×3', cols: 3, rows: 3 },
  { name: '4×3', cols: 4, rows: 3 },
  { name: '1+2', cols: 0, rows: 0, custom: 'featured' },
];

interface CollageImage {
  id: string;
  file: File;
  url: string;
}

export default function ImageCollage() {
  useSEO('Image Collage Online Free | PDF Media Suite', 'Free online Image Collage tool. No signup or installation required.');

  const [images, setImages] = useState<CollageImage[]>([]);
  const [cols, setCols] = useState(2);
  const [rows, setRows] = useState(2);
  const [gap, setGap] = useState(8);
  const [borderRadius, setBorderRadius] = useState(8);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [outputSize, setOutputSize] = useState(2000);
  const [busy, setBusy] = useState(false);
  const [exportedOnce, setExportedOnce] = useState(false);

  const prefersReduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleDrop = (files: File[]) => {
    const newImages = files.map((f) => ({
      id: Date.now().toString() + Math.random(),
      file: f,
      url: URL.createObjectURL(f),
    }));
    setImages((prev) => [...prev, ...newImages]);
    setExportedOnce(false);
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.url);
      return prev.filter((i) => i.id !== id);
    });
    setExportedOnce(false);
  };

  const exportCollage = async () => {
    if (images.length === 0) return;
    setBusy(true);
    try {
      const totalCells = cols * rows;
      const canvas = canvasRef.current || document.createElement('canvas');
      const cellW = Math.floor((outputSize - (cols + 1) * gap) / cols);
      const cellH = Math.floor(cellW * 1.2);
      canvas.width = outputSize;
      canvas.height = rows * cellH + (rows + 1) * gap;
      const ctx = canvas.getContext('2d')!;

      // Background
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw images
      for (let i = 0; i < Math.min(images.length, totalCells); i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const x = gap + col * (cellW + gap);
        const y = gap + row * (cellH + gap);

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = images[i].url;
        await new Promise<void>((res) => {
          img.onload = () => res();
          img.onerror = () => res();
        });

        // Rounded clip
        if (borderRadius > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(x, y, cellW, cellH, borderRadius * (outputSize / 600));
          ctx.clip();
        }

        // Cover fit
        const imgAspect = img.naturalWidth / img.naturalHeight;
        const cellAspect = cellW / cellH;
        let sx = 0,
          sy = 0,
          sw = img.naturalWidth,
          sh = img.naturalHeight;
        if (imgAspect > cellAspect) {
          sw = img.naturalHeight * cellAspect;
          sx = (img.naturalWidth - sw) / 2;
        } else {
          sh = img.naturalWidth / cellAspect;
          sy = (img.naturalHeight - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, x, y, cellW, cellH);

        if (borderRadius > 0) ctx.restore();
      }

      const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/png'));
      if (blob) {
        triggerBlobDownload(blob, 'collage.png');
        setExportedOnce(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const totalCells = cols * rows;

  return (
    <ToolWorkspaceShell
      title="Image Collage Maker"
      subtitle="Create crisp multi-photo grid collages with custom spacing, rounded corners, and 4K export."
      categoryLabel="Grid Collage Studio"
      icon={LayoutGrid}
      microVariant="merge"
      tone="violet"
      trustNote="Up to 4000px PNG export · Runs 100% locally"
    >
      {/* Hidden export canvas mounted synchronously */}
      <canvas ref={canvasRef} className="hidden" />

      <motion.div
        initial={prefersReduced ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start"
      >
        {/* Preview Column */}
        <div className="space-y-4">
          {images.length === 0 ? (
            <FileDropzone
              onDrop={handleDrop}
              multiple={true}
              title="Drop photos for collage"
              subtitle="Select multiple JPG, PNG, or WebP images"
              accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] }}
            />
          ) : (
            <>
              <div className="relative pms-glass-panel rounded-3xl p-5 flex items-center justify-center min-h-[420px] overflow-hidden">
                <PearlScanOverlay active={busy} label={`Composing ${outputSize}px PNG collage…`} />
                <div className="pms-checkerboard bg-white dark:bg-slate-950 p-3 rounded-2xl border border-[var(--pms-border)]">
                  <div
                    className="grid shadow-xl rounded-xl overflow-hidden"
                    style={{
                      gridTemplateColumns: `repeat(${cols}, 1fr)`,
                      gridTemplateRows: `repeat(${rows}, 1fr)`,
                      gap: `${gap}px`,
                      background: bgColor,
                      padding: `${gap}px`,
                      maxWidth: '100%',
                      width: 500,
                    }}
                  >
                    {Array.from({ length: totalCells }).map((_, i) => (
                      <div
                        key={i}
                        className="relative aspect-[4/5] bg-gray-200 dark:bg-slate-800 overflow-hidden group"
                        style={{ borderRadius }}
                      >
                        {images[i] ? (
                          <>
                            <img src={images[i].url} alt="" className="w-full h-full object-cover" />
                            <button
                              onClick={() => removeImage(images[i].id)}
                              className="absolute top-1.5 right-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow cursor-pointer"
                              aria-label="Remove image"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <div className="flex items-center justify-center h-full text-gray-400 dark:text-slate-500 text-xs font-medium">
                            Empty
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-2.5 justify-center flex-wrap items-center">
                <label className="px-4 py-2.5 bg-white/85 dark:bg-slate-800 border border-[var(--pms-border)] text-gray-800 dark:text-slate-200 rounded-2xl font-bold text-sm cursor-pointer hover:border-violet-400 transition-colors inline-flex items-center gap-2 shadow-sm">
                  <Plus className="w-4 h-4 text-[var(--pms-violet)]" /> Add more
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) handleDrop(Array.from(e.target.files));
                      e.target.value = '';
                    }}
                  />
                </label>

                <motion.button
                  whileHover={prefersReduced || busy ? undefined : { scale: 1.01 }}
                  whileTap={prefersReduced || busy ? undefined : { scale: 0.985 }}
                  onClick={exportCollage}
                  disabled={busy}
                  className="pms-btn-primary px-6 py-2.5 rounded-2xl font-bold text-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {busy ? 'Exporting…' : 'Download Collage (PNG)'}
                </motion.button>

                <button
                  onClick={() => {
                    images.forEach((i) => URL.revokeObjectURL(i.url));
                    setImages([]);
                    setExportedOnce(false);
                  }}
                  className="px-4 py-2.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-2xl font-semibold text-sm hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Clear all
                </button>
              </div>

              <AnimatePresence>
                {exportedOnce && (
                  <motion.div
                    initial={prefersReduced ? false : { opacity: 0, y: 6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={prefersReduced ? undefined : { opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 360, damping: 22 }}
                    className="max-w-md mx-auto p-3.5 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800/70 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>High-resolution collage exported ({outputSize}px PNG)!</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>

        {/* Settings Sidebar */}
        <div className="pms-glass-panel rounded-3xl p-6 space-y-5 h-fit">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-gray-900 dark:text-white">Layout Template</h3>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)]">
              <AnimatedNumber value={images.length} /> / <AnimatedNumber value={totalCells} />
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {TEMPLATES.filter((t) => !t.custom).map((t) => {
              const active = cols === t.cols && rows === t.rows;
              return (
                <button
                  key={t.name}
                  onClick={() => {
                    setCols(t.cols);
                    setRows(t.rows);
                  }}
                  className={`px-3 py-2 rounded-xl text-sm font-bold border transition-all cursor-pointer ${
                    active
                      ? 'bg-[var(--pms-soft-lavender)] border-violet-500 text-[var(--pms-violet)] shadow-xs'
                      : 'bg-white/60 dark:bg-slate-800/60 border-[var(--pms-border)] text-gray-600 dark:text-slate-300 hover:border-violet-300'
                  }`}
                >
                  {t.name}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Columns</label>
              <input
                type="number"
                min={1}
                max={6}
                value={cols}
                onChange={(e) => setCols(Number(e.target.value))}
                className="w-full px-3 py-2 border border-[var(--pms-border)] bg-white/85 dark:bg-slate-900/70 text-gray-900 dark:text-white rounded-xl text-sm font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Rows</label>
              <input
                type="number"
                min={1}
                max={6}
                value={rows}
                onChange={(e) => setRows(Number(e.target.value))}
                className="w-full px-3 py-2 border border-[var(--pms-border)] bg-white/85 dark:bg-slate-900/70 text-gray-900 dark:text-white rounded-xl text-sm font-semibold"
              />
            </div>
          </div>

          <label className="block text-xs font-bold text-gray-700 dark:text-slate-300">
            <div className="flex justify-between mb-1">
              <span>Gap</span>
              <span className="font-mono text-[var(--pms-violet)]">{gap}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={30}
              value={gap}
              onChange={(e) => setGap(Number(e.target.value))}
              className="w-full accent-violet-600 cursor-pointer"
            />
          </label>

          <label className="block text-xs font-bold text-gray-700 dark:text-slate-300">
            <div className="flex justify-between mb-1">
              <span>Corner Radius</span>
              <span className="font-mono text-[var(--pms-violet)]">{borderRadius}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={30}
              value={borderRadius}
              onChange={(e) => setBorderRadius(Number(e.target.value))}
              className="w-full accent-violet-600 cursor-pointer"
            />
          </label>

          <label className="block text-xs font-bold text-gray-700 dark:text-slate-300">
            <span className="block mb-1.5">Canvas Background</span>
            <input
              type="color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="w-full h-10 rounded-xl border border-[var(--pms-border)] cursor-pointer bg-white dark:bg-slate-800"
            />
          </label>

          <label className="block text-xs font-bold text-gray-700 dark:text-slate-300">
            <span className="block mb-1.5">Output Width</span>
            <select
              value={outputSize}
              onChange={(e) => setOutputSize(Number(e.target.value))}
              className="w-full px-3 py-2 border border-[var(--pms-border)] bg-white/85 dark:bg-slate-900/70 text-gray-900 dark:text-white rounded-xl text-sm font-semibold"
            >
              <option value={1000}>1000px (web)</option>
              <option value={2000}>2000px (print)</option>
              <option value={3000}>3000px (high-res)</option>
              <option value={4000}>4000px (ultra)</option>
            </select>
          </label>

          <p className="text-xs text-gray-500 dark:text-slate-400">
            <AnimatedNumber value={images.length} /> image(s) loaded · <AnimatedNumber value={totalCells} /> grid slots
          </p>
        </div>
      </motion.div>
    </ToolWorkspaceShell>
  );
}
