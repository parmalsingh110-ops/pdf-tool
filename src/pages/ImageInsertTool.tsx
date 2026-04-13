import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ImagePlus, Download, Loader2, Move, RotateCw, Trash2, ZoomIn, ZoomOut, Lock, LockOpen } from 'lucide-react';

interface InsertedImage {
  id: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  naturalW: number;
  naturalH: number;
}

export default function ImageInsertTool() {
  const [baseFile, setBaseFile] = useState<File | null>(null);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [baseDim, setBaseDim] = useState({ w: 0, h: 0 });
  const [inserts, setInserts] = useState<InsertedImage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [displayScale, setDisplayScale] = useState(1);
  const [busy, setBusy] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; imgX: number; imgY: number } | null>(null);
  const resizeRef = useRef<{ id: string; startX: number; startY: number; startW: number; startH: number; startImgX: number; startImgY: number; handle: string } | null>(null);
  const [lockAspect, setLockAspect] = useState(false);

  const handleBaseUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBaseFile(f);
    if (baseUrl) URL.revokeObjectURL(baseUrl);
    const url = URL.createObjectURL(f);
    setBaseUrl(url);
    setInserts([]);
    setSelectedId(null);
    const img = new Image();
    img.onload = () => {
      setBaseDim({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = url;
  };

  // Calculate display scale
  useEffect(() => {
    if (!baseDim.w || !baseDim.h) return;
    const maxW = 700, maxH = 500;
    setDisplayScale(Math.min(maxW / baseDim.w, maxH / baseDim.h, 1));
  }, [baseDim]);

  const addInsertImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = '';
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      // Default size: 30% of base image width
      const w = baseDim.w * 0.3;
      const h = (w / img.naturalWidth) * img.naturalHeight;
      setInserts(prev => [...prev, {
        id: Date.now().toString() + Math.random(),
        url,
        x: baseDim.w * 0.1,
        y: baseDim.h * 0.1,
        width: w,
        height: h,
        rotation: 0,
        opacity: 1,
        naturalW: img.naturalWidth,
        naturalH: img.naturalHeight,
      }]);
    };
    img.src = url;
  };

  const updateInsert = (id: string, updates: Partial<InsertedImage>) => {
    setInserts(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };

  const deleteInsert = (id: string) => {
    setInserts(prev => {
      const item = prev.find(i => i.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return prev.filter(i => i.id !== id);
    });
    if (selectedId === id) setSelectedId(null);
  };

  // Drag to move inserted images
  const onPointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const item = inserts.find(i => i.id === id);
    if (!item) return;
    setSelectedId(id);
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, imgX: item.x, imgY: item.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragRef.current) {
      const dx = (e.clientX - dragRef.current.startX) / displayScale;
      const dy = (e.clientY - dragRef.current.startY) / displayScale;
      updateInsert(dragRef.current.id, {
        x: Math.max(0, Math.min(baseDim.w, dragRef.current.imgX + dx)),
        y: Math.max(0, Math.min(baseDim.h, dragRef.current.imgY + dy)),
      });
    }
    if (resizeRef.current) {
      const dx = (e.clientX - resizeRef.current.startX) / displayScale;
      const dy = (e.clientY - resizeRef.current.startY) / displayScale;
      const r = resizeRef.current;
      const item = inserts.find(i => i.id === r.id);
      if (!item) return;
      const aspect = r.startW / r.startH;

      let newW = r.startW, newH = r.startH;
      let newX = r.startImgX, newY = r.startImgY;

      const h = r.handle;
      // Bottom-right
      if (h === 'br') { newW = r.startW + dx; newH = r.startH + dy; }
      // Bottom-left
      else if (h === 'bl') { newW = r.startW - dx; newH = r.startH + dy; newX = r.startImgX + dx; }
      // Top-right
      else if (h === 'tr') { newW = r.startW + dx; newH = r.startH - dy; newY = r.startImgY + dy; }
      // Top-left
      else if (h === 'tl') { newW = r.startW - dx; newH = r.startH - dy; newX = r.startImgX + dx; newY = r.startImgY + dy; }
      // Right edge
      else if (h === 'r') { newW = r.startW + dx; }
      // Left edge
      else if (h === 'l') { newW = r.startW - dx; newX = r.startImgX + dx; }
      // Bottom edge
      else if (h === 'b') { newH = r.startH + dy; }
      // Top edge
      else if (h === 't') { newH = r.startH - dy; newY = r.startImgY + dy; }

      newW = Math.max(15, newW);
      newH = Math.max(15, newH);

      if (lockAspect) {
        if (h === 'r' || h === 'l' || h === 'b' || h === 't') {
          // Edge: constrain the other dimension
          if (h === 'r' || h === 'l') newH = newW / aspect;
          else newW = newH * aspect;
        } else {
          // Corner: use the larger delta
          if (Math.abs(dx) > Math.abs(dy)) newH = newW / aspect;
          else newW = newH * aspect;
        }
      }

      updateInsert(r.id, { width: newW, height: newH, x: newX, y: newY });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* */ }
    dragRef.current = null;
    resizeRef.current = null;
  };

  const onResizeHandle = (e: React.PointerEvent, id: string, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const item = inserts.find(i => i.id === id);
    if (!item) return;
    setSelectedId(id);
    resizeRef.current = { id, startX: e.clientX, startY: e.clientY, startW: item.width, startH: item.height, startImgX: item.x, startImgY: item.y, handle };
  };

  // Click on empty area to deselect
  const onContainerClick = (e: React.MouseEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).tagName === 'IMG') {
      setSelectedId(null);
    }
  };

  const exportImage = async () => {
    if (!baseUrl) return;
    setBusy(true);
    try {
      const baseImg = new Image();
      baseImg.crossOrigin = 'anonymous';
      baseImg.src = baseUrl;
      await new Promise<void>((res) => { baseImg.onload = () => res(); });

      const canvas = document.createElement('canvas');
      canvas.width = baseDim.w;
      canvas.height = baseDim.h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(baseImg, 0, 0);

      // Draw each insert
      for (const ins of inserts) {
        const insertImg = new Image();
        insertImg.crossOrigin = 'anonymous';
        insertImg.src = ins.url;
        await new Promise<void>((res) => { insertImg.onload = () => res(); insertImg.onerror = () => res(); });

        ctx.save();
        ctx.globalAlpha = ins.opacity;
        if (ins.rotation !== 0) {
          const cx = ins.x + ins.width / 2;
          const cy = ins.y + ins.height / 2;
          ctx.translate(cx, cy);
          ctx.rotate((ins.rotation * Math.PI) / 180);
          ctx.drawImage(insertImg, -ins.width / 2, -ins.height / 2, ins.width, ins.height);
        } else {
          ctx.drawImage(insertImg, ins.x, ins.y, ins.width, ins.height);
        }
        ctx.restore();
      }

      canvas.toBlob(blob => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `composite_${baseFile?.name || 'image.png'}`;
        a.click();
        URL.revokeObjectURL(a.href);
      }, 'image/png');
    } catch (e: any) {
      alert(e?.message || 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  const selected = inserts.find(i => i.id === selectedId);
  const dW = Math.round(baseDim.w * displayScale);
  const dH = Math.round(baseDim.h * displayScale);

  return (
    <div className="flex-1 flex flex-col items-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Image Insert & Overlay</h1>
        <p className="text-xl text-gray-600 dark:text-gray-400">Place images inside another image — resize, position, and blend seamlessly.</p>
      </div>

      {!baseFile ? (
        <label className="flex flex-col items-center justify-center w-full max-w-xl h-64 border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50 dark:bg-slate-900 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800">
          <ImagePlus className="w-12 h-12 text-gray-400 mb-3" />
          <span className="text-gray-600 dark:text-gray-300 font-semibold">Upload base image</span>
          <span className="text-xs text-gray-400 mt-1">The image where you'll insert others</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleBaseUpload} />
        </label>
      ) : (
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
          {/* Canvas area */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <label className="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold text-sm cursor-pointer hover:bg-blue-700 inline-flex items-center gap-2">
                <ImagePlus className="w-4 h-4" /> Insert Image
                <input type="file" accept="image/*" className="hidden" onChange={addInsertImage} />
              </label>
              <button onClick={exportImage} disabled={busy} className="px-4 py-2 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-2">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {busy ? 'Exporting…' : 'Save Image'}
              </button>
              <label className="px-4 py-2 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 rounded-xl font-semibold text-sm cursor-pointer hover:bg-gray-200">
                Change Base <input type="file" accept="image/*" className="hidden" onChange={handleBaseUpload} />
              </label>
            </div>

            <div ref={containerRef}
              className="relative bg-gray-100 dark:bg-slate-800 rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700 inline-block cursor-default"
              style={{ width: dW, height: dH }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onClick={onContainerClick}
            >
              {/* Base image */}
              <img src={baseUrl!} alt="Base" style={{ width: dW, height: dH }} className="block pointer-events-none select-none" draggable={false} />

              {/* Inserted images */}
              {inserts.map(ins => {
                const isSel = ins.id === selectedId;
                return (
                  <div key={ins.id}
                    className={`absolute touch-none ${isSel ? 'ring-2 ring-blue-500' : 'hover:ring-1 hover:ring-blue-300'}`}
                    style={{
                      left: ins.x * displayScale,
                      top: ins.y * displayScale,
                      width: ins.width * displayScale,
                      height: ins.height * displayScale,
                      opacity: ins.opacity,
                      transform: ins.rotation ? `rotate(${ins.rotation}deg)` : undefined,
                      cursor: 'move',
                    }}
                    onPointerDown={e => onPointerDown(e, ins.id)}
                  >
                    <img src={ins.url} alt="Insert" className="w-full h-full object-fill pointer-events-none select-none" draggable={false} />
                    
                    {/* 8 Resize handles: 4 corners + 4 edges */}
                    {isSel && (
                      <>
                        {/* Corner handles */}
                        <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-blue-500 border border-white rounded-sm cursor-nwse-resize z-10"
                          onPointerDown={e => onResizeHandle(e, ins.id, 'tl')} />
                        <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-blue-500 border border-white rounded-sm cursor-nesw-resize z-10"
                          onPointerDown={e => onResizeHandle(e, ins.id, 'tr')} />
                        <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-blue-500 border border-white rounded-sm cursor-nesw-resize z-10"
                          onPointerDown={e => onResizeHandle(e, ins.id, 'bl')} />
                        <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-blue-500 border border-white rounded-sm cursor-nwse-resize z-10"
                          onPointerDown={e => onResizeHandle(e, ins.id, 'br')} />
                        {/* Edge handles */}
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-6 h-2 bg-blue-400 border border-white rounded-sm cursor-ns-resize z-10"
                          onPointerDown={e => onResizeHandle(e, ins.id, 't')} />
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-2 bg-blue-400 border border-white rounded-sm cursor-ns-resize z-10"
                          onPointerDown={e => onResizeHandle(e, ins.id, 'b')} />
                        <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-6 bg-blue-400 border border-white rounded-sm cursor-ew-resize z-10"
                          onPointerDown={e => onResizeHandle(e, ins.id, 'l')} />
                        <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-6 bg-blue-400 border border-white rounded-sm cursor-ew-resize z-10"
                          onPointerDown={e => onResizeHandle(e, ins.id, 'r')} />
                      </>
                    )}
                    {isSel && (
                      <div className="absolute -top-5 left-0 text-[10px] font-bold text-blue-600 bg-white/80 px-1 rounded whitespace-nowrap">
                        {Math.round(ins.width)}×{Math.round(ins.height)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-400">Click "Insert Image" to add photos. Drag to move, use corner handle to resize.</p>
          </div>

          {/* Properties panel */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4 h-fit">
            <h3 className="font-bold text-gray-900 dark:text-white text-sm">Properties</h3>
            {selected ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Selected image ({Math.round(selected.width)}×{Math.round(selected.height)})</p>
                
                {/* Lock/Unlock aspect ratio toggle */}
                <button onClick={() => setLockAspect(!lockAspect)}
                  className={`w-full py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${lockAspect ? 'bg-blue-100 dark:bg-blue-950 text-blue-700' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400'}`}>
                  {lockAspect ? <Lock className="w-3 h-3" /> : <LockOpen className="w-3 h-3" />}
                  {lockAspect ? 'Aspect Locked' : 'Free Resize (unlock)'}
                </button>

                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Width
                  <input type="number" value={Math.round(selected.width)} min={10} onChange={e => {
                    const w = Number(e.target.value);
                    if (lockAspect) {
                      const h = w / (selected.naturalW / selected.naturalH);
                      updateInsert(selected.id, { width: w, height: h });
                    } else {
                      updateInsert(selected.id, { width: w });
                    }
                  }} className="mt-1 w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-950" />
                </label>

                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Height
                  <input type="number" value={Math.round(selected.height)} min={10} onChange={e => {
                    const h = Number(e.target.value);
                    if (lockAspect) {
                      const w = h * (selected.naturalW / selected.naturalH);
                      updateInsert(selected.id, { width: w, height: h });
                    } else {
                      updateInsert(selected.id, { height: h });
                    }
                  }} className="mt-1 w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-950" />
                </label>

                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Opacity: {Math.round(selected.opacity * 100)}%
                  <input type="range" min={10} max={100} value={Math.round(selected.opacity * 100)} onChange={e => updateInsert(selected.id, { opacity: Number(e.target.value) / 100 })} className="mt-1 w-full" />
                </label>

                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Rotation: {selected.rotation}°
                  <input type="range" min={0} max={360} value={selected.rotation} onChange={e => updateInsert(selected.id, { rotation: Number(e.target.value) })} className="mt-1 w-full" />
                </label>

                <div className="flex gap-2">
                  <button onClick={() => updateInsert(selected.id, { width: selected.width * 1.1, height: selected.height * 1.1 })}
                    className="flex-1 px-2 py-1.5 bg-gray-100 dark:bg-slate-800 rounded-lg text-xs font-bold flex items-center justify-center gap-1 hover:bg-gray-200">
                    <ZoomIn className="w-3 h-3" /> Larger
                  </button>
                  <button onClick={() => updateInsert(selected.id, { width: selected.width * 0.9, height: selected.height * 0.9 })}
                    className="flex-1 px-2 py-1.5 bg-gray-100 dark:bg-slate-800 rounded-lg text-xs font-bold flex items-center justify-center gap-1 hover:bg-gray-200">
                    <ZoomOut className="w-3 h-3" /> Smaller
                  </button>
                </div>

                <button onClick={() => {
                  // Fit to base image dimensions
                  updateInsert(selected.id, { x: 0, y: 0, width: baseDim.w, height: baseDim.h });
                }} className="w-full py-1.5 bg-blue-50 dark:bg-blue-950 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100">Fit to canvas</button>

                <button onClick={() => {
                  // Center
                  updateInsert(selected.id, { x: (baseDim.w - selected.width) / 2, y: (baseDim.h - selected.height) / 2 });
                }} className="w-full py-1.5 bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-bold hover:bg-gray-100">Center</button>

                <button onClick={() => deleteInsert(selected.id)}
                  className="w-full py-2 bg-red-50 dark:bg-red-950 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 flex items-center justify-center gap-1">
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">Select an inserted image to adjust its properties</p>
            )}

            <hr className="border-gray-200 dark:border-slate-700" />
            <p className="text-xs text-gray-500">{inserts.length} image(s) inserted</p>
            <p className="text-[10px] text-gray-400 leading-relaxed">
              💡 <strong>Tip:</strong> Insert a photo into a frame, ID card, or document. Position and resize it to fit perfectly, then save — the result looks seamless.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
