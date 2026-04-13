import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Pen, Download, Type, Image as ImageIcon, Trash2 } from 'lucide-react';

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
  const [mode, setMode] = useState<Mode>('draw');
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [typedText, setTypedText] = useState('');
  const [selectedFont, setSelectedFont] = useState(CURSIVE_FONTS[0]);
  const [penColor, setPenColor] = useState('#000000');
  const [penWidth, setPenWidth] = useState(3);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

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
    const img = new Image();
    img.onload = () => {
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, c.width, c.height);
      const scale = Math.min(c.width / img.width, c.height / img.height) * 0.9;
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
    };
    img.src = URL.createObjectURL(file);
  };

  const exportSignature = (format: 'png' | 'svg') => {
    const c = canvasRef.current;
    if (!c) return;
    if (format === 'png') {
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
      const cropW = maxX - minX + pad * 2;
      const cropH = maxY - minY + pad * 2;
      const out = document.createElement('canvas');
      out.width = cropW; out.height = cropH;
      const octx = out.getContext('2d')!;
      octx.drawImage(tempCanvas, minX - pad, minY - pad, cropW, cropH, 0, 0, cropW, cropH);

      out.toBlob(blob => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'signature.png';
        a.click();
        URL.revokeObjectURL(a.href);
      }, 'image/png');
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Digital Signature Pad</h1>
        <p className="text-xl text-gray-600">Create professional digital signatures — draw, type, or upload.</p>
      </div>

      <div className="w-full max-w-2xl space-y-6">
        {/* Mode selector */}
        <div className="flex gap-2">
          {([['draw', Pen, 'Draw'], ['type', Type, 'Type'], ['upload', ImageIcon, 'Upload']] as const).map(([m, Icon, label]) => (
            <button key={m} onClick={() => { setMode(m as Mode); if (m !== 'type') clearCanvas(); }}
              className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 ${mode === m ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* Canvas */}
        <div className="bg-white border-2 border-dashed border-gray-300 rounded-2xl overflow-hidden relative">
          <canvas ref={canvasRef} className="w-full cursor-crosshair" style={{ height: 200, touchAction: 'none' }}
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-gray-400">
            {mode === 'draw' ? 'Draw your signature above' : mode === 'type' ? 'Type below to preview' : 'Upload an image'}
          </div>
        </div>

        {/* Controls per mode */}
        {mode === 'draw' && (
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Color</label>
              <input type="color" value={penColor} onChange={e => setPenColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer" />
            </div>
            <div className="flex items-center gap-2 flex-1">
              <label className="text-sm font-medium text-gray-700">Width</label>
              <input type="range" min={1} max={8} value={penWidth} onChange={e => setPenWidth(Number(e.target.value))} className="flex-1" />
            </div>
            <button onClick={clearCanvas} className="px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          </div>
        )}

        {mode === 'type' && (
          <div className="space-y-3">
            <input type="text" value={typedText} onChange={e => setTypedText(e.target.value)} placeholder="Your Name"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-lg" />
            <div className="grid grid-cols-2 gap-2">
              {CURSIVE_FONTS.map(f => (
                <button key={f.name} onClick={() => setSelectedFont(f)}
                  className={`px-3 py-2 rounded-lg text-sm border ${selectedFont.name === f.name ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'border-gray-200 hover:bg-gray-50'}`}
                  style={{ fontFamily: f.css }}>
                  {f.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'upload' && (
          <label className="flex items-center justify-center gap-2 w-full py-3 bg-gray-100 rounded-xl font-semibold text-sm cursor-pointer hover:bg-gray-200">
            <ImageIcon className="w-4 h-4" /> Upload signature image
            <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          </label>
        )}

        {/* Export */}
        <div className="flex gap-3">
          <button onClick={() => exportSignature('png')} className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 flex items-center justify-center gap-2">
            <Download className="w-5 h-5" /> Download Transparent PNG
          </button>
        </div>
      </div>
    </div>
  );
}
