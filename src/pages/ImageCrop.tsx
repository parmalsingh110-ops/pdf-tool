import { useState, useRef, useCallback, useEffect } from 'react';
import { Crop, Download, RotateCw } from 'lucide-react';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

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
  const containerRef = useRef<HTMLDivElement>(null);

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
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Image Cropper</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400">Interactive crop with preset ratios — 1:1, 16:9, A4, Passport, and more.</p>
      </div>
      {!file ? (
        <label className="w-full max-w-3xl flex flex-col items-center justify-center h-72 border-4 border-dashed border-gray-300 dark:border-slate-700 rounded-2xl cursor-pointer bg-white dark:bg-slate-900 hover:border-emerald-400 transition-colors">
          <Crop className="w-16 h-16 text-gray-400 dark:text-slate-500 mb-4" />
          <span className="text-xl font-bold text-gray-900 dark:text-white">Select Image</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </label>
      ) : resultUrl ? (
        <div className="w-full max-w-3xl text-center space-y-6">
          <div className="bg-gray-100 dark:bg-slate-800 rounded-2xl p-4"><img src={resultUrl} className="max-h-[50vh] mx-auto rounded-lg shadow-lg" /></div>
          <div className="flex gap-3 justify-center">
            <a href={resultUrl} download={`cropped_${file.name}`} className="px-6 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 flex items-center gap-2"><Download className="w-5 h-5" /> Download</a>
            <button onClick={() => setResultUrl(null)} className="px-6 py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold">Re-crop</button>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-4xl space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => { setRatio(p.ratio); if(p.ratio>0){ setCrop(c=>({...c,h:c.w/p.ratio})); } }} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${ratio === p.ratio ? 'bg-emerald-600 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400'}`}>{p.label}</button>
            ))}
          </div>
          <div ref={containerRef} className="relative bg-gray-100 dark:bg-slate-800 rounded-2xl overflow-hidden flex items-center justify-center" style={{cursor: dragging ? 'grabbing' : 'default'}}>
            <img src={imgUrl!} className="max-h-[60vh] w-auto" draggable={false} />
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
                  className="absolute w-5 h-5 bg-white border-2 border-emerald-500 rounded-full z-10 select-none touch-none"
                  style={{...(c.includes('n')?{top:'-10px'}:{bottom:'-10px'}),...(c.includes('w')?{left:'-10px'}:{right:'-10px'}),cursor:`${c}-resize`}}
                />
              ))}
              {/* Grid lines */}
              <div className="absolute inset-0 pointer-events-none"><div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/40"/><div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/40"/><div className="absolute top-1/3 left-0 right-0 h-px bg-white/40"/><div className="absolute top-2/3 left-0 right-0 h-px bg-white/40"/></div>
            </div>
          </div>
          <div className="flex gap-4">
            <button onClick={applyCrop} className="flex-1 py-4 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 flex items-center justify-center gap-2"><Crop className="w-5 h-5" /> Crop Image</button>
            <button onClick={() => { setFile(null); setImgUrl(null); }} className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-semibold rounded-xl">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
