import React, { useState, useRef, useCallback } from 'react';
import { Columns2, Eye } from 'lucide-react';

interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  maxHeightClass?: string;
  darkSurface?: boolean;
  badgeText?: string;
}

export default function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = 'Original',
  afterLabel = 'Cleaned',
  maxHeightClass = 'max-h-[540px]',
  darkSurface = false,
  badgeText,
}: BeforeAfterSliderProps) {
  const [viewMode, setViewMode] = useState<'split' | 'after' | 'before'>('split');
  const [splitPct, setSplitPct] = useState<number>(52);
  const draggingRef = useRef<boolean>(false);
  const frameRef = useRef<HTMLDivElement | null>(null);

  const updateFromClientX = useCallback((clientX: number) => {
    const el = frameRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSplitPct(Math.max(2, Math.min(98, pct)));
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (viewMode !== 'split') return;
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromClientX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || viewMode !== 'split') return;
    updateFromClientX(e.clientX);
  };

  const handlePointerUp = () => {
    draggingRef.current = false;
  };

  return (
    <div className="w-full space-y-2.5">
      {/* Mode bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--pms-white)] border border-[var(--pms-border)] text-[11px] font-bold">
          {([
            { id: 'split', label: 'Split Compare', icon: Columns2 },
            { id: 'after', label: afterLabel, icon: Eye },
            { id: 'before', label: beforeLabel, icon: Eye },
          ] as const).map((tab) => {
            const Icon = tab.icon;
            const active = viewMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setViewMode(tab.id)}
                className={`px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                  active
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-[var(--pms-muted)] hover:text-[var(--pms-ink)]'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {badgeText && (
          <span
            className="text-[11px] font-bold px-2.5 py-1 rounded-full border border-[var(--pms-border)] text-[var(--pms-ink)]"
            style={{ background: 'var(--pms-soft-mint)' }}
          >
            {badgeText}
          </span>
        )}
      </div>

      {/* Viewport */}
      <div
        className={`w-full rounded-2xl border border-[var(--pms-border)] p-3 flex items-center justify-center overflow-hidden ${
          darkSurface ? 'bg-slate-950' : 'pms-paper-grid'
        }`}
      >
        <div
          ref={frameRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`relative inline-block select-none rounded-lg overflow-hidden shadow-xl border border-[var(--pms-border-strong)] ${
            viewMode === 'split' ? 'cursor-ew-resize touch-none' : ''
          }`}
        >
          {/* Base Layer: After (or Before if before-only) */}
          <img
            src={viewMode === 'before' ? beforeSrc : afterSrc}
            alt={viewMode === 'before' ? beforeLabel : afterLabel}
            draggable={false}
            className={`${maxHeightClass} w-auto max-w-full object-contain block ${
              darkSurface ? 'bg-slate-950' : 'bg-white'
            }`}
          />

          {/* Overlay Clipped Layer: Original on left of divider */}
          {viewMode === 'split' && (
            <>
              <div
                className="absolute inset-0 overflow-hidden pointer-events-none"
                style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
              >
                <img
                  src={beforeSrc}
                  alt={beforeLabel}
                  draggable={false}
                  className="w-full h-full object-contain block"
                />
              </div>

              {/* Corner Labels */}
              <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-slate-900/75 text-white text-[10px] font-bold backdrop-blur-xs pointer-events-none">
                {beforeLabel}
              </span>
              <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-emerald-600/90 text-white text-[10px] font-bold backdrop-blur-xs pointer-events-none">
                {afterLabel}
              </span>

              {/* Vertical Divider + Handle */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.6)] pointer-events-none"
                style={{ left: `${splitPct}%` }}
              >
                <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white text-slate-800 shadow-lg border-2 border-emerald-500 flex items-center justify-center text-xs font-black">
                  ↔
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {viewMode === 'split' && (
        <p className="text-[11px] text-center text-[var(--pms-muted)]">
          Drag the handle left or right to inspect {beforeLabel.toLowerCase()} vs {afterLabel.toLowerCase()} quality.
        </p>
      )}
    </div>
  );
}
