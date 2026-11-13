import React, { useState, useRef, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ImagePlus, Download, Loader2, Trash2, ZoomIn, ZoomOut, Lock, LockOpen } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { useSEO } from '../hooks/useSEO';
import { triggerBlobDownload, useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

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
  useSEO('Image Insert Tool Online Free | PDF Media Suite', 'Free online Image Insert Tool tool. No signup or installation required.');

  const [baseFile, setBaseFile] = useState<File | null>(null);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [baseDim, setBaseDim] = useState({ w: 0, h: 0 });
  const [inserts, setInserts] = useState<InsertedImage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [displayScale, setDisplayScale] = useState(1);
  const [busy, setBusy] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; imgX: number; imgY: number } | null>(null);
  const resizeRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startImgX: number;
    startImgY: number;
    handle: string;
  } | null>(null);
  const [lockAspect, setLockAspect] = useState(false);

  const prefersReduced = useReducedMotion();
  useAutoRevokeUrl(baseUrl);

  const loadBaseFile = (f: File) => {
    setBaseFile(f);
    const url = URL.createObjectURL(f);
    setBaseUrl(url);
    setInserts((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.url));
      return [];
    });
    setSelectedId(null);
    const img = new Image();
    img.onload = () => {
      setBaseDim({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = url;
  };

  const handleBaseUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    loadBaseFile(f);
    e.target.value = '';
  };

  // Calculate display scale
  useEffect(() => {
    if (!baseDim.w || !baseDim.h) return;
    const maxW = 700,
      maxH = 500;
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
      setInserts((prev) => [
        ...prev,
        {
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
        },
      ]);
    };
    img.src = url;
  };

  const updateInsert = (id: string, updates: Partial<InsertedImage>) => {
    setInserts((prev) => prev.map((i) => (i.id === id ? { ...i, ...updates } : i)));
  };

  const deleteInsert = (id: string) => {
    setInserts((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return prev.filter((i) => i.id !== id);
    });
    if (selectedId === id) setSelectedId(null);
  };

  // Drag to move inserted images
  const onPointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const item = inserts.find((i) => i.id === id);
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
      const item = inserts.find((i) => i.id === r.id);
      if (!item) return;
      const aspect = r.startW / r.startH;

      let newW = r.startW,
        newH = r.startH;
      let newX = r.startImgX,
        newY = r.startImgY;

      const h = r.handle;
      // Bottom-right
      if (h === 'br') {
        newW = r.startW + dx;
        newH = r.startH + dy;
      }
      // Bottom-left
      else if (h === 'bl') {
        newW = r.startW - dx;
        newH = r.startH + dy;
        newX = r.startImgX + dx;
      }
      // Top-right
      else if (h === 'tr') {
        newW = r.startW + dx;
        newH = r.startH - dy;
        newY = r.startImgY + dy;
      }
      // Top-left
      else if (h === 'tl') {
        newW = r.startW - dx;
        newH = r.startH - dy;
        newX = r.startImgX + dx;
        newY = r.startImgY + dy;
      }
      // Right edge
      else if (h === 'r') {
        newW = r.startW + dx;
      }
      // Left edge
      else if (h === 'l') {
        newW = r.startW - dx;
        newX = r.startImgX + dx;
      }
      // Bottom edge
      else if (h === 'b') {
        newH = r.startH + dy;
      }
      // Top edge
      else if (h === 't') {
        newH = r.startH - dy;
        newY = r.startImgY + dy;
      }

      newW = Math.max(15, newW);
      newH = Math.max(15, newH);

      if (lockAspect) {
        if (h === 'r' || h === 'l' || h === 'b' || h === 't') {
          if (h === 'r' || h === 'l') newH = newW / aspect;
          else newW = newH * aspect;
        } else {
          if (Math.abs(dx) > Math.abs(dy)) newH = newW / aspect;
          else newW = newH * aspect;
        }
      }

      updateInsert(r.id, { width: newW, height: newH, x: newX, y: newY });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }
    dragRef.current = null;
    resizeRef.current = null;
  };

  const onResizeHandle = (e: React.PointerEvent, id: string, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const item = inserts.find((i) => i.id === id);
    if (!item) return;
    setSelectedId(id);
    resizeRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      startW: item.width,
      startH: item.height,
      startImgX: item.x,
      startImgY: item.y,
      handle,
    };
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
      await new Promise<void>((res) => {
        baseImg.onload = () => res();
      });

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
        await new Promise<void>((res) => {
          insertImg.onload = () => res();
          insertImg.onerror = () => res();
        });

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

      const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/png'));
      if (blob) {
        triggerBlobDownload(blob, `composite_${baseFile?.name || 'image.png'}`);
      }
    } catch (e: any) {
      alert(e?.message || 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  const selected = inserts.find((i) => i.id === selectedId);
  const dW = Math.round(baseDim.w * displayScale);
  const dH = Math.round(baseDim.h * displayScale);

  return (
    <ToolWorkspaceShell
      title="Image Insert & Overlay"
      subtitle="Place photos inside another image — drag, resize with 8 handles, rotate, and blend seamlessly."
      categoryLabel="Layer Composite Studio"
      icon={ImagePlus}
      microVariant="edit"
      tone="blue"
      trustNote="Full-resolution layer compositing · 100% browser-only"
    >
      {!baseFile ? (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="max-w-2xl mx-auto"
        >
          <FileDropzone
            onDrop={(files) => {
              if (files[0]) loadBaseFile(files[0]);
            }}
            multiple={false}
            accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] }}
            title="Upload base image"
            subtitle="The background canvas where you will insert and arrange overlays"
          />
        </motion.div>
      ) : (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.26 }}
          className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start"
        >
          {/* Canvas Area */}
          <div className="space-y-4">
            <div className="pms-glass-panel rounded-2xl p-3 flex items-center gap-2.5 flex-wrap">
              <label className="px-4 py-2 bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] border border-sky-200 dark:border-sky-800 rounded-xl font-bold text-sm cursor-pointer hover:opacity-90 transition-opacity inline-flex items-center gap-2">
                <ImagePlus className="w-4 h-4" /> Insert Image
                <input type="file" accept="image/*" className="hidden" onChange={addInsertImage} />
              </label>

              <motion.button
                whileHover={prefersReduced || busy ? undefined : { scale: 1.01 }}
                whileTap={prefersReduced || busy ? undefined : { scale: 0.985 }}
                onClick={exportImage}
                disabled={busy}
                className="pms-btn-primary px-5 py-2 rounded-xl font-bold text-sm disabled:opacity-50 inline-flex items-center gap-2 cursor-pointer"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {busy ? 'Exporting…' : 'Save Image'}
              </motion.button>

              <label className="px-4 py-2 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold text-sm cursor-pointer hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors ml-auto">
                Change Base <input type="file" accept="image/*" className="hidden" onChange={handleBaseUpload} />
              </label>
            </div>

            <div className="relative pms-glass-panel rounded-3xl p-4 sm:p-5 flex flex-col items-center overflow-hidden">
              <PearlScanOverlay active={busy} label="Compositing high-res overlay layers…" />
              <div
                ref={containerRef}
                className="relative pms-checkerboard bg-white rounded-xl overflow-hidden border border-[var(--pms-border)] inline-block cursor-default shadow-inner"
                style={{ width: dW, height: dH }}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onClick={onContainerClick}
              >
                {/* Base image */}
                <img
                  src={baseUrl!}
                  alt="Base"
                  style={{ width: dW, height: dH }}
                  className="block pointer-events-none select-none"
                  draggable={false}
                />

                {/* Inserted images */}
                {inserts.map((ins) => {
                  const isSel = ins.id === selectedId;
                  return (
                    <div
                      key={ins.id}
                      className={`absolute touch-none ${isSel ? 'ring-2 ring-sky-500' : 'hover:ring-1 hover:ring-sky-300'}`}
                      style={{
                        left: ins.x * displayScale,
                        top: ins.y * displayScale,
                        width: ins.width * displayScale,
                        height: ins.height * displayScale,
                        opacity: ins.opacity,
                        transform: ins.rotation ? `rotate(${ins.rotation}deg)` : undefined,
                        cursor: 'move',
                      }}
                      onPointerDown={(e) => onPointerDown(e, ins.id)}
                    >
                      <img
                        src={ins.url}
                        alt="Insert"
                        className="w-full h-full object-fill pointer-events-none select-none"
                        draggable={false}
                      />

                      {/* 8 Resize handles */}
                      {isSel && (
                        <>
                          <div
                            className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-sky-500 border border-white rounded-sm cursor-nwse-resize z-10"
                            onPointerDown={(e) => onResizeHandle(e, ins.id, 'tl')}
                          />
                          <div
                            className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-sky-500 border border-white rounded-sm cursor-nesw-resize z-10"
                            onPointerDown={(e) => onResizeHandle(e, ins.id, 'tr')}
                          />
                          <div
                            className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-sky-500 border border-white rounded-sm cursor-nesw-resize z-10"
                            onPointerDown={(e) => onResizeHandle(e, ins.id, 'bl')}
                          />
                          <div
                            className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-sky-500 border border-white rounded-sm cursor-nwse-resize z-10"
                            onPointerDown={(e) => onResizeHandle(e, ins.id, 'br')}
                          />
                          <div
                            className="absolute -top-1 left-1/2 -translate-x-1/2 w-6 h-2 bg-sky-400 border border-white rounded-sm cursor-ns-resize z-10"
                            onPointerDown={(e) => onResizeHandle(e, ins.id, 't')}
                          />
                          <div
                            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-2 bg-sky-400 border border-white rounded-sm cursor-ns-resize z-10"
                            onPointerDown={(e) => onResizeHandle(e, ins.id, 'b')}
                          />
                          <div
                            className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-6 bg-sky-400 border border-white rounded-sm cursor-ew-resize z-10"
                            onPointerDown={(e) => onResizeHandle(e, ins.id, 'l')}
                          />
                          <div
                            className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-6 bg-sky-400 border border-white rounded-sm cursor-ew-resize z-10"
                            onPointerDown={(e) => onResizeHandle(e, ins.id, 'r')}
                          />
                        </>
                      )}
                      {isSel && (
                        <div className="absolute -top-5 left-0 text-[10px] font-bold text-sky-700 bg-white/90 px-1.5 py-0.5 rounded shadow-xs whitespace-nowrap">
                          {Math.round(ins.width)}×{Math.round(ins.height)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-3 text-center">
                Click &ldquo;Insert Image&rdquo; to add layers. Drag to position, and use edge or corner handles to resize.
              </p>
            </div>
          </div>

          {/* Properties Panel */}
          <div className="pms-glass-panel rounded-3xl p-5 sm:p-6 space-y-4 h-fit">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-gray-900 dark:text-white text-sm">Layer Properties</h3>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[var(--pms-soft-blue)] text-[var(--pms-blue)]">
                <AnimatedNumber value={inserts.length} suffix=" layer(s)" />
              </span>
            </div>

            {selected ? (
              <div className="space-y-3">
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400">
                  Selected ({Math.round(selected.width)}×{Math.round(selected.height)} px)
                </p>

                <button
                  onClick={() => setLockAspect(!lockAspect)}
                  className={`w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors cursor-pointer ${
                    lockAspect
                      ? 'bg-[var(--pms-soft-blue)] border-sky-300 dark:border-sky-700 text-[var(--pms-blue)]'
                      : 'bg-white/70 dark:bg-slate-800/70 border-[var(--pms-border)] text-gray-600 dark:text-slate-300'
                  }`}
                >
                  {lockAspect ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                  {lockAspect ? 'Aspect Locked' : 'Free Resize (unlock)'}
                </button>

                <div className="grid grid-cols-2 gap-2.5">
                  <label className="block text-xs font-bold text-gray-700 dark:text-slate-300">
                    Width
                    <input
                      type="number"
                      value={Math.round(selected.width)}
                      min={10}
                      onChange={(e) => {
                        const w = Number(e.target.value);
                        if (lockAspect) {
                          const h = w / (selected.naturalW / selected.naturalH);
                          updateInsert(selected.id, { width: w, height: h });
                        } else {
                          updateInsert(selected.id, { width: w });
                        }
                      }}
                      className="mt-1 w-full px-2.5 py-1.5 border border-[var(--pms-border)] rounded-xl text-sm bg-white/85 dark:bg-slate-900/70 text-gray-900 dark:text-white"
                    />
                  </label>

                  <label className="block text-xs font-bold text-gray-700 dark:text-slate-300">
                    Height
                    <input
                      type="number"
                      value={Math.round(selected.height)}
                      min={10}
                      onChange={(e) => {
                        const h = Number(e.target.value);
                        if (lockAspect) {
                          const w = h * (selected.naturalW / selected.naturalH);
                          updateInsert(selected.id, { width: w, height: h });
                        } else {
                          updateInsert(selected.id, { height: h });
                        }
                      }}
                      className="mt-1 w-full px-2.5 py-1.5 border border-[var(--pms-border)] rounded-xl text-sm bg-white/85 dark:bg-slate-900/70 text-gray-900 dark:text-white"
                    />
                  </label>
                </div>

                <label className="block text-xs font-bold text-gray-700 dark:text-slate-300">
                  <div className="flex justify-between mb-1">
                    <span>Opacity</span>
                    <span className="font-mono text-[var(--pms-blue)]">{Math.round(selected.opacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={Math.round(selected.opacity * 100)}
                    onChange={(e) => updateInsert(selected.id, { opacity: Number(e.target.value) / 100 })}
                    className="w-full accent-sky-600 cursor-pointer"
                  />
                </label>

                <label className="block text-xs font-bold text-gray-700 dark:text-slate-300">
                  <div className="flex justify-between mb-1">
                    <span>Rotation</span>
                    <span className="font-mono text-[var(--pms-blue)]">{selected.rotation}°</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    value={selected.rotation}
                    onChange={(e) => updateInsert(selected.id, { rotation: Number(e.target.value) })}
                    className="w-full accent-sky-600 cursor-pointer"
                  />
                </label>

                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      updateInsert(selected.id, { width: selected.width * 1.1, height: selected.height * 1.1 })
                    }
                    className="flex-1 px-2 py-2 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    <ZoomIn className="w-3.5 h-3.5" /> Larger
                  </button>
                  <button
                    onClick={() =>
                      updateInsert(selected.id, { width: selected.width * 0.9, height: selected.height * 0.9 })
                    }
                    className="flex-1 px-2 py-2 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    <ZoomOut className="w-3.5 h-3.5" /> Smaller
                  </button>
                </div>

                <button
                  onClick={() => updateInsert(selected.id, { x: 0, y: 0, width: baseDim.w, height: baseDim.h })}
                  className="w-full py-2 bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] rounded-xl text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Fit to canvas
                </button>

                <button
                  onClick={() =>
                    updateInsert(selected.id, {
                      x: (baseDim.w - selected.width) / 2,
                      y: (baseDim.h - selected.height) / 2,
                    })
                  }
                  className="w-full py-2 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 rounded-xl text-xs font-bold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Center
                </button>

                <button
                  onClick={() => deleteInsert(selected.id)}
                  className="w-full py-2 bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200/70 dark:border-rose-800/60 rounded-xl text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-950/80 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Layer
                </button>
              </div>
            ) : (
              <p className="text-xs text-gray-500 dark:text-slate-400 italic">
                Select an inserted image on the canvas to adjust dimensions, opacity, or rotation.
              </p>
            )}

            <hr className="border-[var(--pms-border)]" />
            <p className="text-[11px] text-gray-500 dark:text-slate-400 leading-relaxed">
              💡 <strong>Tip:</strong> Insert a photo into a frame, ID card, or document. Position and resize it to fit cleanly, then save.
            </p>
          </div>
        </motion.div>
      )}
    </ToolWorkspaceShell>
  );
}
