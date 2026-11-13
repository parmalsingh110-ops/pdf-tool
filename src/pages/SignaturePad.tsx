import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Pen, Download, Type, Image as ImageIcon, Trash2 } from 'lucide-react';
import { useSEO } from '../hooks/useSEO';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { PearlScanOverlay } from '../components/pearl/PearlMotion';

const CURSIVE_FONTS = [
  { name: 'Dancing Script', css: "'Dancing Script', cursive" },
  { name: 'Great Vibes', css: "'Great Vibes', cursive" },
  { name: 'Pacifico', css: "'Pacifico', cursive" },
  { name: 'Sacramento', css: "'Sacramento', cursive" },
  { name: 'Allura', css: "'Allura', cursive" },
  { name: 'Alex Brush', css: "'Alex Brush', cursive" },
];

type Mode = 'draw' | 'type' | 'upload';

export default function SignaturePad() {
  useSEO('Signature Pad Online Free | PDF Media Suite', 'Free online Signature Pad tool. No signup or installation required.');

  const [mode, setMode] = useState<Mode>('draw');
  const [typedText, setTypedText] = useState('');
  const [selectedFont, setSelectedFont] = useState(CURSIVE_FONTS[0]);
  const [penColor, setPenColor] = useState('#000000');
  const [penWidth, setPenWidth] = useState(3);
  const [isBusy, setIsBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const prefersReduced = useReducedMotion();

  // Load Google Fonts
  useEffect(() => {
    const link = document.createElement('link');
    link.href = `https://fonts.googleapis.com/css2?family=${CURSIVE_FONTS.map(f => f.name.replace(/ /g, '+')).join('&family=')}&display=swap`;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  const initCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    c.width = 600;
    c.height = 200;
    ctx.fillStyle = 'transparent';
    ctx.clearRect(0, 0, c.width, c.height);
  }, []);

  useEffect(() => { initCanvas(); }, [initCanvas]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const scaleX = c.width / rect.width;
    const scaleY = c.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (mode !== 'draw') return;
    isDrawing.current = true;
    lastPoint.current = getPos(e);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current || !lastPoint.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPoint.current = pos;
  };

  const endDraw = () => {
    isDrawing.current = false;
    lastPoint.current = null;
  };

  const clearCanvas = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
  };

  const renderTypedSignature = useCallback(() => {
    const c = canvasRef.current;
    if (!c || !typedText.trim()) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = penColor;
    ctx.font = `48px ${selectedFont.css}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(typedText, c.width / 2, c.height / 2);
  }, [typedText, selectedFont, penColor]);

  useEffect(() => {
    if (mode === 'type') renderTypedSignature();
  }, [mode, renderTypedSignature]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsBusy(true);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setIsBusy(false);
    };
    img.onload = () => {
      const c = canvasRef.current;
      if (c) {
        const ctx = c.getContext('2d')!;
        ctx.clearRect(0, 0, c.width, c.height);
        const scale = Math.min(c.width / img.width, c.height / img.height) * 0.9;
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
      }
      URL.revokeObjectURL(url);
      setIsBusy(false);
    };
    img.src = url;
  };

  const exportSignature = (format: 'png' | 'svg') => {
    const c = canvasRef.current;
    if (!c) return;
    if (format === 'png') {
      setIsBusy(true);
      try {
        // Create transparent PNG
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = c.width;
        tempCanvas.height = c.height;
        const tctx = tempCanvas.getContext('2d')!;
        tctx.drawImage(c, 0, 0);

        // Auto-crop to content
        const id = tctx.getImageData(0, 0, c.width, c.height);
        let minX = c.width, minY = c.height, maxX = 0, maxY = 0;
        for (let y = 0; y < c.height; y++) {
          for (let x = 0; x < c.width; x++) {
            if (id.data[(y * c.width + x) * 4 + 3] > 10) {
              minX = Math.min(minX, x); minY = Math.min(minY, y);
              maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
            }
          }
        }
        const pad = 10;
        const cropW = Math.max(1, maxX - minX + pad * 2);
        const cropH = Math.max(1, maxY - minY + pad * 2);
        const out = document.createElement('canvas');
        out.width = cropW; out.height = cropH;
        const octx = out.getContext('2d')!;
        octx.drawImage(tempCanvas, minX - pad, minY - pad, cropW, cropH, 0, 0, cropW, cropH);

        out.toBlob(blob => {
          setIsBusy(false);
          if (!blob) return;
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'signature.png';
          a.click();
          URL.revokeObjectURL(a.href);
        }, 'image/png');
      } catch {
        setIsBusy(false);
      }
    }
  };

  return (
    <ToolWorkspaceShell
      title="Digital Signature Pad"
      subtitle="Create clean transparent signatures — draw freehand, style cursive typography, or upload a scan."
      categoryLabel="E-Sign Studio · Instant PNG"
      icon={Pen}
      microVariant="sign"
      tone="indigo"
    >
      <div className="flex flex-col items-center">
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-2xl pms-glass-panel rounded-3xl p-5 sm:p-7 space-y-6 overflow-hidden min-h-[380px]"
        >
          <PearlScanOverlay active={isBusy} label="Cropping & generating transparent PNG…" />

          {/* Mode selector */}
          <div className="flex gap-2 p-1.5 rounded-2xl bg-[var(--pms-lavender-surface)] border border-[var(--pms-border)]">
            {([['draw', Pen, 'Draw'], ['type', Type, 'Type'], ['upload', ImageIcon, 'Upload']] as const).map(([m, Icon, label]) => (
              <button
                key={m}
                onClick={() => { setMode(m as Mode); if (m !== 'type') clearCanvas(); }}
                className={`flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  mode === m
                    ? 'bg-[var(--pms-white)] text-[var(--pms-rose)] shadow-sm border border-[var(--pms-border)]'
                    : 'hover:opacity-80'
                }`}
                style={mode !== m ? { color: 'var(--pms-muted)' } : undefined}
              >
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>

          {/* Canvas (kept crisp white checkerboard so dark ink is always legible) */}
          <div className="bg-white pms-checkerboard border-2 border-dashed border-[var(--pms-border-strong)] rounded-2xl overflow-hidden relative shadow-inner">
            <canvas
              ref={canvasRef}
              className="w-full cursor-crosshair block"
              style={{ height: 200, touchAction: 'none' }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-white/85 border border-slate-200 text-[11px] font-medium text-slate-500 pointer-events-none">
              {mode === 'draw' ? 'Draw your signature above' : mode === 'type' ? 'Type below to preview' : 'Upload an image'}
            </div>
          </div>

          {/* Controls per mode */}
          {mode === 'draw' && (
            <div className="flex items-center gap-4 flex-wrap p-3.5 rounded-2xl border border-[var(--pms-border)] bg-[var(--pms-white)]">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold" style={{ color: 'var(--pms-ink)' }}>Ink Color</label>
                <input type="color" value={penColor} onChange={e => setPenColor(e.target.value)} className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border border-[var(--pms-border)]" />
              </div>
              <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                <label className="text-xs font-bold" style={{ color: 'var(--pms-ink)' }}>Stroke ({penWidth}px)</label>
                <input type="range" min={1} max={8} value={penWidth} onChange={e => setPenWidth(Number(e.target.value))} className="flex-1 accent-rose-600 cursor-pointer" />
              </div>
              <button
                onClick={clearCanvas}
                className="px-3.5 py-2 text-xs font-bold bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] rounded-xl hover:opacity-90 flex items-center gap-1.5 transition-opacity cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear
              </button>
            </div>
          )}

          {mode === 'type' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={typedText}
                  onChange={e => setTypedText(e.target.value)}
                  placeholder="Type Your Full Name"
                  className="flex-1 px-4 py-3 border border-[var(--pms-border-strong)] bg-[var(--pms-white)] rounded-2xl text-lg outline-none focus:border-rose-500"
                  style={{ color: 'var(--pms-ink)' }}
                />
                <input
                  type="color"
                  value={penColor}
                  onChange={e => setPenColor(e.target.value)}
                  className="w-11 h-11 rounded-xl cursor-pointer bg-transparent border border-[var(--pms-border)]"
                  title="Ink Color"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CURSIVE_FONTS.map(f => (
                  <button
                    key={f.name}
                    onClick={() => setSelectedFont(f)}
                    className={`px-3 py-2.5 rounded-xl text-base border transition-all cursor-pointer ${
                      selectedFont.name === f.name
                        ? 'bg-[var(--pms-soft-rose)] border-rose-400 dark:border-rose-700 text-[var(--pms-rose)] shadow-xs'
                        : 'bg-[var(--pms-white)] border-[var(--pms-border)] hover:border-[var(--pms-border-strong)]'
                    }`}
                    style={{
                      fontFamily: f.css,
                      color: selectedFont.name === f.name ? undefined : 'var(--pms-ink)',
                    }}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === 'upload' && (
            <label className="flex items-center justify-center gap-2 w-full py-3.5 bg-[var(--pms-white)] border-2 border-dashed border-[var(--pms-border-strong)] hover:border-rose-400 rounded-2xl font-bold text-sm cursor-pointer transition-colors" style={{ color: 'var(--pms-ink)' }}>
              <ImageIcon className="w-4 h-4 text-[var(--pms-violet)]" /> Upload signature image
              <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            </label>
          )}

          {/* Export */}
          <div className="flex gap-3">
            <motion.button
              whileHover={prefersReduced || isBusy ? undefined : { scale: 1.01 }}
              whileTap={prefersReduced || isBusy ? undefined : { scale: 0.985 }}
              onClick={() => exportSignature('png')}
              disabled={isBusy}
              className="flex-1 py-3.5 pms-btn-primary rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-5 h-5" /> Download Transparent PNG
            </motion.button>
          </div>
        </motion.div>
      </div>
    </ToolWorkspaceShell>
  );
}
