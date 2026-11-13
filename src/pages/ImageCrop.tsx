import { useState, useRef, useCallback, useEffect } from 'react';
import { CheckCircle2, Crop, Download, Loader2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { PearlScanOverlay } from '../components/pearl/PearlMotion';

const PRESETS = [
  { label: 'Free', ratio: 0 },
  { label: '1:1', ratio: 1 },
  { label: '16:9', ratio: 16/9 },
  { label: '4:3', ratio: 4/3 },
  { label: '3:2', ratio: 3/2 },
  { label: '9:16', ratio: 9/16 },
  { label: 'A4', ratio: 210/297 },
  { label: 'Passport', ratio: 35/45 },
];

export default function ImageCrop() {
  useSEO('Image Crop Online Free | PDF Media Suite', 'Free online Image Crop tool. No signup or installation required.');

  usePageSEO('Crop Image Online', 'Crop images with preset aspect ratios — 1:1, 16:9, 4:3, A4, Passport. Free online image cropper.');
  const [file, setFile] = useState<File|null>(null);
  const [imgUrl, setImgUrl] = useState<string|null>(null);
  const [ratio, setRatio] = useState(0);
  const [crop, setCrop] = useState({ x: 10, y: 10, w: 80, h: 80 });
  const [dragging, setDragging] = useState<string|null>(null);
  const [startMouse, setStartMouse] = useState({x:0,y:0});
  const [startCrop, setStartCrop] = useState({x:0,y:0,w:0,h:0});
  const [resultUrl, setResultUrl] = useState<string|null>(null);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    return () => {
      if (imgUrl) URL.revokeObjectURL(imgUrl);
    };
  }, [imgUrl]);

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (imgUrl) URL.revokeObjectURL(imgUrl);
      setFile(f);
      setImgUrl(URL.createObjectURL(f));
      setResultUrl(null);
      setCrop({x:10,y:10,w:80,h:80});
    }
  };

  const getRelCoords = (clientX: number, clientY: number) => {
    if (!containerRef.current) return {x:0,y:0};
    const r = containerRef.current.getBoundingClientRect();
    return { x: ((clientX - r.left)/r.width)*100, y: ((clientY - r.top)/r.height)*100 };
  };

  const onStartDrag = (clientX: number, clientY: number, type: string) => {
    setDragging(type);
    setStartMouse(getRelCoords(clientX, clientY));
    setStartCrop({...crop});
  };

  const onDragMove = useCallback((clientX: number, clientY: number) => {
    if (!dragging || !containerRef.current) return;
    const cur = getRelCoords(clientX, clientY);
    const dx = cur.x - startMouse.x;
    const dy = cur.y - startMouse.y;
    let {x,y,w,h} = startCrop;
    if (dragging === 'move') { x += dx; y += dy; }
    else if (dragging === 'se') { w += dx; h += dy; }
    else if (dragging === 'sw') { x += dx; w -= dx; h += dy; }
    else if (dragging === 'ne') { w += dx; y += dy; h -= dy; }
    else if (dragging === 'nw') { x += dx; y += dy; w -= dx; h -= dy; }
    x = Math.max(0, Math.min(100-w, x)); y = Math.max(0, Math.min(100-h, y));
    w = Math.max(5, Math.min(100-x, w)); h = Math.max(5, Math.min(100-y, h));
    if (ratio > 0) { h = w / ratio; if (y + h > 100) h = 100 - y; w = h * ratio; }
    setCrop({x,y,w,h});
  }, [dragging, startMouse, startCrop, ratio]);

  const onEndDrag = useCallback(() => setDragging(null), []);

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => onDragMove(e.clientX, e.clientY);
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) onDragMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const handleUp = () => onEndDrag();

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [dragging, onDragMove, onEndDrag]);

  const applyCrop = async () => {
    if (!imgUrl) return;
    setBusy(true);
    try {
      const img = new Image(); img.src = imgUrl;
      await new Promise<void>(r => { img.onload = () => r(); });
      const sx = (crop.x/100)*img.naturalWidth, sy=(crop.y/100)*img.naturalHeight;
      const sw = (crop.w/100)*img.naturalWidth, sh=(crop.h/100)*img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = sw; canvas.height = sh;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const blob = await new Promise<Blob|null>(r => canvas.toBlob(b=>r(b),'image/jpeg',0.92));
      if (blob) setResultUrl(URL.createObjectURL(blob));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Image Cropper"
      subtitle="Interactive crop with preset ratios — 1:1, 16:9, A4, Passport, and more."
      categoryLabel="Image Studio · Client-Side Crop"
      icon={Crop}
      microVariant="crop"
      tone="emerald"
    >
      <div className="flex flex-col items-center">
      {!file ? (
        <motion.label
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-3xl pms-glass-panel flex flex-col items-center justify-center h-72 border-2 border-dashed border-[var(--pms-border-strong)] rounded-3xl cursor-pointer hover:border-emerald-500/70 transition-all group p-6 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-[var(--pms-soft-mint)] text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 border border-emerald-200/70 dark:border-emerald-800/60 group-hover:scale-105 transition-transform">
            <Crop className="w-8 h-8" />
          </div>
          <span className="text-xl font-bold text-[var(--pms-ink)]">Select Image to Crop</span>
          <span className="text-xs text-[var(--pms-muted)] mt-1">Supports PNG, JPG, WebP — cropped 100% locally</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </motion.label>
      ) : resultUrl ? (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, scale: 0.98, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-3xl pms-glass-panel rounded-3xl border border-emerald-200/80 dark:border-emerald-800/70 p-6 sm:p-8 text-center space-y-6"
        >
          <div className="flex items-center justify-center gap-2.5">
            <motion.div
              initial={prefersReduced ? false : { scale: 0.45, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 20 }}
              className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center border border-emerald-200 dark:border-emerald-800"
            >
              <CheckCircle2 className="w-5 h-5" />
            </motion.div>
            <h3 className="text-xl font-extrabold text-[var(--pms-ink)]">Cropped Image Ready!</h3>
          </div>

          <div className="bg-[var(--pms-pearl)]/80 dark:bg-slate-950/75 border border-[var(--pms-border)] rounded-2xl p-4">
            <img src={resultUrl} alt="Cropped preview" className="max-h-[50vh] mx-auto rounded-xl shadow-lg bg-white" />
          </div>

          <div className="flex flex-wrap gap-3 justify-center">
            <motion.a
              whileHover={prefersReduced ? undefined : { scale: 1.015 }}
              whileTap={prefersReduced ? undefined : { scale: 0.985 }}
              href={resultUrl}
              download={`cropped_${file.name}`}
              className="pms-btn-primary px-7 py-3.5 font-bold rounded-2xl flex items-center gap-2"
            >
              <Download className="w-5 h-5" /> Download Cropped Image
            </motion.a>
            <motion.button
              whileHover={prefersReduced ? undefined : { scale: 1.015 }}
              whileTap={prefersReduced ? undefined : { scale: 0.985 }}
              onClick={() => setResultUrl(null)}
              className="px-6 py-3.5 bg-[var(--pms-pearl)] dark:bg-slate-800/90 hover:bg-[var(--pms-soft-lavender)] dark:hover:bg-slate-700 text-[var(--pms-ink)] border border-[var(--pms-border)] rounded-2xl font-semibold transition-colors"
            >
              Re-crop
            </motion.button>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-4xl space-y-4"
        >
          <div className="pms-glass-panel rounded-2xl p-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--pms-subtle-text)] px-2">Aspect Ratio:</span>
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => { setRatio(p.ratio); if(p.ratio>0){ setCrop(c=>({...c,h:c.w/p.ratio})); } }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  ratio === p.ratio
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-[var(--pms-pearl)] dark:bg-slate-800/80 text-[var(--pms-muted)] hover:text-[var(--pms-ink)] border border-[var(--pms-border)]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="relative pms-glass-panel rounded-3xl p-4 sm:p-5 overflow-hidden min-h-[360px] flex items-center justify-center">
            <PearlScanOverlay active={busy} label="Cropping image…" />

            <div ref={containerRef} className="relative bg-white rounded-2xl overflow-hidden flex items-center justify-center shadow-lg border border-[var(--pms-border)]" style={{cursor: dragging ? 'grabbing' : 'default'}}>
              <img src={imgUrl!} alt="Crop source" className="max-h-[60vh] w-auto" draggable={false} />
              {/* Overlay masks */}
              <div className="absolute inset-0 pointer-events-none" style={{background: `linear-gradient(to right, rgba(0,0,0,0.5) ${crop.x}%, transparent ${crop.x}%, transparent ${crop.x+crop.w}%, rgba(0,0,0,0.5) ${crop.x+crop.w}%)`}} />
              <div className="absolute pointer-events-none" style={{left:`${crop.x}%`,top:0,width:`${crop.w}%`,height:`${crop.y}%`,background:'rgba(0,0,0,0.5)'}} />
              <div className="absolute pointer-events-none" style={{left:`${crop.x}%`,top:`${crop.y+crop.h}%`,width:`${crop.w}%`,bottom:0,background:'rgba(0,0,0,0.5)'}} />
              {/* Crop area */}
              <div
                className="absolute border-2 border-white select-none touch-none"
                style={{left:`${crop.x}%`,top:`${crop.y}%`,width:`${crop.w}%`,height:`${crop.h}%`}}
                onMouseDown={e => { e.preventDefault(); onStartDrag(e.clientX, e.clientY, 'move'); }}
                onTouchStart={e => { e.stopPropagation(); if (e.touches.length > 0) onStartDrag(e.touches[0].clientX, e.touches[0].clientY, 'move'); }}
              >
                {/* Corner handles */}
                {['nw','ne','sw','se'].map(c => (
                  <div
                    key={c}
                    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onStartDrag(e.clientX, e.clientY, c); }}
                    onTouchStart={e => { e.stopPropagation(); if (e.touches.length > 0) onStartDrag(e.touches[0].clientX, e.touches[0].clientY, c); }}
                    className="absolute w-5 h-5 bg-white border-2 border-emerald-500 rounded-full z-10 select-none touch-none shadow-sm"
                    style={{...(c.includes('n')?{top:'-10px'}:{bottom:'-10px'}),...(c.includes('w')?{left:'-10px'}:{right:'-10px'}),cursor:`${c}-resize`}}
                  />
                ))}
                {/* Grid lines */}
                <div className="absolute inset-0 pointer-events-none"><div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/40"/><div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/40"/><div className="absolute top-1/3 left-0 right-0 h-px bg-white/40"/><div className="absolute top-2/3 left-0 right-0 h-px bg-white/40"/></div>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <motion.button
              whileHover={prefersReduced ? undefined : { scale: 1.01 }}
              whileTap={prefersReduced ? undefined : { scale: 0.99 }}
              onClick={applyCrop}
              disabled={busy}
              className="pms-btn-primary flex-1 py-4 font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Crop className="w-5 h-5" />}
              {busy ? 'Cropping…' : 'Crop Image'}
            </motion.button>
            <motion.button
              whileHover={prefersReduced ? undefined : { scale: 1.01 }}
              whileTap={prefersReduced ? undefined : { scale: 0.99 }}
              onClick={() => { setFile(null); setImgUrl(null); }}
              className="px-6 py-4 bg-[var(--pms-pearl)] dark:bg-slate-800/90 hover:bg-[var(--pms-soft-lavender)] dark:hover:bg-slate-700 text-[var(--pms-ink)] border border-[var(--pms-border)] font-semibold rounded-2xl transition-colors"
            >
              Cancel
            </motion.button>
          </div>
        </motion.div>
      )}
      </div>
    </ToolWorkspaceShell>
  );
}
