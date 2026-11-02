import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Check,
  RotateCw,
  Sparkles,
  Maximize2,
  CreditCard,
  ZoomIn,
  Compass,
} from 'lucide-react';
import {
  type Point,
  type TwelvePointMesh,
  generate12PointsFrom4Corners,
  extract4CornersFrom12Points,
  detectIdCard12Points,
  CARD_ASPECT_RATIO,
} from '../lib/idCardDetector';

interface TwelvePointCropModalProps {
  isOpen: boolean;
  side: 'front' | 'back';
  rawUrl: string;
  initialMesh: TwelvePointMesh;
  rotation: number;
  onApply: (mesh: TwelvePointMesh, newRotation: number) => void;
  onClose: () => void;
}

const CORNER_INDICES = [0, 3, 6, 9];
const CORNER_LABELS: Record<number, string> = {
  0: 'TL',
  3: 'TR',
  6: 'BR',
  9: 'BL',
};

export default function TwelvePointCropModal({
  isOpen,
  side,
  rawUrl,
  initialMesh,
  rotation,
  onApply,
  onClose,
}: TwelvePointCropModalProps) {
  const [mesh, setMesh] = useState<TwelvePointMesh>(initialMesh);
  const [rot, setRot] = useState<number>(rotation);
  const [activePt, setActivePt] = useState<number | null>(null);
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);
  const [containerRect, setContainerRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);
  const [loupePos, setLoupePos] = useState<{ x: number; y: number } | null>(null);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setMesh(initialMesh);
      setRot(rotation);
      setActivePt(null);
    }
  }, [isOpen, initialMesh, rotation]);

  // Load image element
  useEffect(() => {
    if (!rawUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImgElement(img);
    img.src = rawUrl;
  }, [rawUrl]);

  // Calculate rendered image bounding box inside the container
  const updateContainerRect = useCallback(() => {
    if (!containerRef.current || !imgElement) return;
    const cont = containerRef.current.getBoundingClientRect();
    const isRot = rot % 180 !== 0;
    const naturalW = isRot ? imgElement.naturalHeight : imgElement.naturalWidth;
    const naturalH = isRot ? imgElement.naturalWidth : imgElement.naturalHeight;

    const contAspect = cont.width / cont.height;
    const imgAspect = naturalW / naturalH;

    let w = cont.width;
    let h = cont.height;
    let x = 0;
    let y = 0;

    if (imgAspect > contAspect) {
      h = cont.width / imgAspect;
      y = (cont.height - h) / 2;
    } else {
      w = cont.height * imgAspect;
      x = (cont.width - w) / 2;
    }

    setContainerRect({ x, y, w, h });
  }, [imgElement, rot]);

  useEffect(() => {
    updateContainerRect();
    window.addEventListener('resize', updateContainerRect);
    return () => window.removeEventListener('resize', updateContainerRect);
  }, [updateContainerRect]);

  // ─── POINTER EVENTS FOR DRAGGING ─────────────────────────────────────────
  const handlePointerDown = (index: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setActivePt(index);
    updateLoupe(index, e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activePt === null || !containerRect || !containerRef.current) return;
    const cont = containerRef.current.getBoundingClientRect();

    const relX = e.clientX - cont.left - containerRect.x;
    const relY = e.clientY - cont.top - containerRect.y;

    let pctX = (relX / containerRect.w) * 100;
    let pctY = (relY / containerRect.h) * 100;

    pctX = Math.max(0, Math.min(100, pctX));
    pctY = Math.max(0, Math.min(100, pctY));

    const newMesh = [...mesh] as TwelvePointMesh;
    const prevPt = { ...newMesh[activePt] };
    const dx = pctX - prevPt.x;
    const dy = pctY - prevPt.y;

    newMesh[activePt] = {
      x: Math.round(pctX * 10) / 10,
      y: Math.round(pctY * 10) / 10,
    };

    // If a corner was moved, move the 2 adjacent edge handles smoothly with it
    if (CORNER_INDICES.includes(activePt)) {
      if (activePt === 0) {
        newMesh[1] = {
          x: Math.round((newMesh[1].x + dx * 0.6) * 10) / 10,
          y: Math.round((newMesh[1].y + dy * 0.6) * 10) / 10,
        };
        newMesh[11] = {
          x: Math.round((newMesh[11].x + dx * 0.6) * 10) / 10,
          y: Math.round((newMesh[11].y + dy * 0.6) * 10) / 10,
        };
      } else if (activePt === 3) {
        newMesh[2] = {
          x: Math.round((newMesh[2].x + dx * 0.6) * 10) / 10,
          y: Math.round((newMesh[2].y + dy * 0.6) * 10) / 10,
        };
        newMesh[4] = {
          x: Math.round((newMesh[4].x + dx * 0.6) * 10) / 10,
          y: Math.round((newMesh[4].y + dy * 0.6) * 10) / 10,
        };
      } else if (activePt === 6) {
        newMesh[5] = {
          x: Math.round((newMesh[5].x + dx * 0.6) * 10) / 10,
          y: Math.round((newMesh[5].y + dy * 0.6) * 10) / 10,
        };
        newMesh[7] = {
          x: Math.round((newMesh[7].x + dx * 0.6) * 10) / 10,
          y: Math.round((newMesh[7].y + dy * 0.6) * 10) / 10,
        };
      } else if (activePt === 9) {
        newMesh[8] = {
          x: Math.round((newMesh[8].x + dx * 0.6) * 10) / 10,
          y: Math.round((newMesh[8].y + dy * 0.6) * 10) / 10,
        };
        newMesh[10] = {
          x: Math.round((newMesh[10].x + dx * 0.6) * 10) / 10,
          y: Math.round((newMesh[10].y + dy * 0.6) * 10) / 10,
        };
      }
    }

    setMesh(newMesh);
    updateLoupe(activePt, e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activePt !== null) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      setActivePt(null);
      setLoupePos(null);
    }
  };

  // ─── LOUPE / MAGNIFYING GLASS ───────────────────────────────────────────
  const updateLoupe = (ptIdx: number, clientX: number, clientY: number) => {
    if (!imgElement || !containerRef.current) return;
    const cont = containerRef.current.getBoundingClientRect();

    setLoupePos({
      x: Math.max(70, Math.min(cont.width - 70, clientX - cont.left)),
      y: Math.max(70, clientY - cont.top - 85),
    });

    const pt = mesh[ptIdx];
    const canvas = loupeCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);

    const sx = (pt.x / 100) * imgElement.naturalWidth;
    const sy = (pt.y / 100) * imgElement.naturalHeight;

    const zoom = 2.5;
    const cropSize = size / zoom;

    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.drawImage(
      imgElement,
      sx - cropSize / 2,
      sy - cropSize / 2,
      cropSize,
      cropSize,
      0,
      0,
      size,
      size
    );

    // Crosshair reticle
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 6, 0, Math.PI * 2);
    ctx.moveTo(size / 2 - 18, size / 2);
    ctx.lineTo(size / 2 + 18, size / 2);
    ctx.moveTo(size / 2, size / 2 - 18);
    ctx.lineTo(size / 2 + 18, size / 2);
    ctx.stroke();

    ctx.restore();
  };

  // ─── TOOLBAR ACTIONS ────────────────────────────────────────────────────
  const handleAutoDetect = () => {
    if (!imgElement) return;
    const detected = detectIdCard12Points(imgElement);
    setMesh(detected);
  };

  // Snaps to exact standard 85.6 × 53.98 mm ratio (1.5858)
  const handleCardRatio = () => {
    if (!imgElement) return;
    const isRot = rot % 180 !== 0;
    const imgW = isRot ? imgElement.naturalHeight : imgElement.naturalWidth;
    const imgH = isRot ? imgElement.naturalWidth : imgElement.naturalHeight;
    const imgAspect = imgW / imgH;

    let targetPctW = 82;
    let targetPctH = (targetPctW * imgAspect) / CARD_ASPECT_RATIO;

    if (targetPctH > 86) {
      targetPctH = 80;
      targetPctW = (targetPctH * CARD_ASPECT_RATIO) / imgAspect;
    }

    const xLeft = Math.max(1, Math.round((100 - targetPctW) / 2));
    const yTop = Math.max(1, Math.round((100 - targetPctH) / 2));
    const xRight = Math.min(99, Math.round(xLeft + targetPctW));
    const yBot = Math.min(99, Math.round(yTop + targetPctH));

    const corners: [Point, Point, Point, Point] = [
      { x: xLeft, y: yTop },
      { x: xRight, y: yTop },
      { x: xRight, y: yBot },
      { x: xLeft, y: yBot },
    ];
    setMesh(generate12PointsFrom4Corners(corners));
  };

  // Auto Straighten / Level: Averages horizontal lines to ensure 100% flat edges
  const handleStraighten = () => {
    const cur = extract4CornersFrom12Points(mesh);
    const avgTopY = Math.round(((cur[0].y + cur[1].y) / 2) * 10) / 10;
    const avgBotY = Math.round(((cur[2].y + cur[3].y) / 2) * 10) / 10;
    const avgLeftX = Math.round(((cur[0].x + cur[3].x) / 2) * 10) / 10;
    const avgRightX = Math.round(((cur[1].x + cur[2].x) / 2) * 10) / 10;

    const leveled: [Point, Point, Point, Point] = [
      { x: avgLeftX, y: avgTopY },
      { x: avgRightX, y: avgTopY },
      { x: avgRightX, y: avgBotY },
      { x: avgLeftX, y: avgBotY },
    ];
    setMesh(generate12PointsFrom4Corners(leveled));
  };

  const handleFullImage = () => {
    const corners: [Point, Point, Point, Point] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    setMesh(generate12PointsFrom4Corners(corners));
  };

  const handleRotate = () => {
    const nextRot = (rot + 90) % 360;
    setRot(nextRot);
    const rotated = mesh.map((p) => ({
      x: Math.round((100 - p.y) * 10) / 10,
      y: Math.round(p.x * 10) / 10,
    })) as TwelvePointMesh;
    setMesh(rotated);
  };

  const handleApply = () => {
    onApply(mesh, rot);
  };

  if (!isOpen) return null;

  const polygonPoints = containerRect
    ? mesh
        .map((p) => {
          const px = containerRect.x + (p.x / 100) * containerRect.w;
          const py = containerRect.y + (p.y / 100) * containerRect.h;
          return `${px},${py}`;
        })
        .join(' ')
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl h-[92vh] max-h-[820px] rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-slate-800 text-white flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
            <h3 className="font-bold text-sm sm:text-base text-slate-100">
              ✂️ 12-Point Precision Edge Crop —{' '}
              <span className="text-orange-400 capitalize">
                {side === 'front' ? 'Front Side' : 'Back Side'}
              </span>
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Action Toolbar */}
        <div className="flex items-center justify-between flex-wrap gap-1.5 px-3 py-2 bg-slate-800/80 border-b border-slate-700/80 text-xs text-slate-200 flex-shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={handleAutoDetect}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 font-semibold border border-orange-500/40 transition-colors"
              title="Auto detect 12 card boundary points"
            >
              <Sparkles className="w-3.5 h-3.5" /> Auto Detect
            </button>
            <button
              onClick={handleStraighten}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 font-medium transition-colors text-emerald-300"
              title="Auto-straighten card edges to be 100% horizontal & vertical"
            >
              <Compass className="w-3.5 h-3.5" /> Straighten
            </button>
            <button
              onClick={handleCardRatio}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 font-medium transition-colors"
              title="Snap to standard 85.6 × 54 mm ID card ratio"
            >
              <CreditCard className="w-3.5 h-3.5" /> Card Ratio
            </button>
            <button
              onClick={handleFullImage}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 font-medium transition-colors"
              title="Reset corners to full image"
            >
              <Maximize2 className="w-3.5 h-3.5" /> Full Image
            </button>
            <button
              onClick={handleRotate}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 font-medium transition-colors"
              title="Rotate image 90 degrees"
            >
              <RotateCw className="w-3.5 h-3.5" /> Rotate 90°
            </button>
          </div>
          <span className="hidden sm:inline-block text-[11px] text-slate-400">
            💡 Drag corners or cyan edge dots to fit the physical card
          </span>
        </div>

        {/* Interactive Workspace */}
        <div
          ref={containerRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative flex-1 bg-slate-950 flex items-center justify-center overflow-hidden select-none touch-none cursor-crosshair"
        >
          {imgElement && containerRect && (
            <div
              style={{
                position: 'absolute',
                left: `${containerRect.x}px`,
                top: `${containerRect.y}px`,
                width: `${containerRect.w}px`,
                height: `${containerRect.h}px`,
              }}
            >
              <img
                src={rawUrl}
                alt="Source preview"
                className="w-full h-full object-contain pointer-events-none"
                style={{
                  transform: `rotate(${rot}deg)`,
                  transition: 'transform 0.15s ease',
                }}
              />
            </div>
          )}

          {/* SVG Overlay for 12-point boundary & guidelines */}
          {containerRect && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none z-10"
              style={{ overflow: 'visible' }}
            >
              {polygonPoints && (
                <polygon
                  points={polygonPoints}
                  fill="rgba(249, 115, 22, 0.14)"
                  stroke="#f97316"
                  strokeWidth="2.5"
                  strokeDasharray="4 2"
                />
              )}

              {mesh.map((p, idx) => {
                const nextPt = mesh[(idx + 1) % 12];
                const x1 = containerRect.x + (p.x / 100) * containerRect.w;
                const y1 = containerRect.y + (p.y / 100) * containerRect.h;
                const x2 = containerRect.x + (nextPt.x / 100) * containerRect.w;
                const y2 = containerRect.y + (nextPt.y / 100) * containerRect.h;
                return (
                  <line
                    key={`line-${idx}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="#f97316"
                    strokeWidth="1.8"
                    strokeOpacity="0.9"
                  />
                );
              })}
            </svg>
          )}

          {/* Draggable Point Handles (12 Points) */}
          {containerRect &&
            mesh.map((p, idx) => {
              const isCorner = CORNER_INDICES.includes(idx);
              const px = containerRect.x + (p.x / 100) * containerRect.w;
              const py = containerRect.y + (p.y / 100) * containerRect.h;
              const isActive = activePt === idx;

              return (
                <div
                  key={`pt-${idx}`}
                  onPointerDown={(e) => handlePointerDown(idx, e)}
                  style={{
                    position: 'absolute',
                    left: `${px}px`,
                    top: `${py}px`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: isCorner ? 30 : 25,
                  }}
                  className={`cursor-grab active:cursor-grabbing transition-transform ${
                    isActive ? 'scale-125' : 'hover:scale-115'
                  }`}
                >
                  {isCorner ? (
                    <div className="relative group">
                      <div className="w-7 h-7 rounded-full bg-orange-500 border-2 border-white shadow-lg flex items-center justify-center text-[10px] font-extrabold text-white ring-2 ring-orange-500/40">
                        {CORNER_LABELS[idx]}
                      </div>
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black/80 text-orange-300 text-[9px] font-mono px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
                        {CORNER_LABELS[idx]} ({Math.round(p.x)}%, {Math.round(p.y)}%)
                      </div>
                    </div>
                  ) : (
                    <div className="relative group">
                      <div className="w-5 h-5 rounded-full bg-cyan-400 border-2 border-white shadow-md flex items-center justify-center ring-1 ring-cyan-500/40">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-900" />
                      </div>
                      <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-black/80 text-cyan-300 text-[8px] font-mono px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
                        Pt {idx}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

          {/* Magnifier Loupe Floating Display */}
          {activePt !== null && loupePos && (
            <div
              style={{
                position: 'absolute',
                left: `${loupePos.x}px`,
                top: `${loupePos.y}px`,
                transform: 'translate(-50%, -50%)',
                zIndex: 40,
              }}
              className="w-28 h-28 rounded-full border-3 border-orange-500 bg-black/90 shadow-2xl overflow-hidden pointer-events-none ring-4 ring-orange-500/30 flex items-center justify-center"
            >
              <canvas
                ref={loupeCanvasRef}
                width={112}
                height={112}
                className="w-full h-full"
              />
              <span className="absolute bottom-1 bg-black/70 text-[9px] text-orange-400 font-mono px-1 rounded">
                2.5× Loupe
              </span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-t border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ZoomIn className="w-4 h-4 text-orange-400" />
            <span>2.5× Loupe active while dragging points</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 text-white text-xs font-bold shadow-md hover:from-orange-600 hover:to-rose-600 transition-all"
            >
              <Check className="w-4 h-4" /> Apply &amp; Deskew
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
