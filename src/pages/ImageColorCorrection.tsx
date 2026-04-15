import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Palette, Download, RotateCcw } from 'lucide-react';
import {
  type PhotoAdjustments,
  DEFAULT_ADJUSTMENTS,
  isDefault,
  applyAdjustments,
  ADJUSTMENT_GROUPS,
  ADJUSTMENT_RANGES,
  PRESETS,
} from '../lib/photoAdjustments';

export default function ImageColorCorrection() {
  const [file, setFile] = useState<File | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [adjustments, setAdjustments] = useState<PhotoAdjustments>({ ...DEFAULT_ADJUSTMENTS });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>('💡 Light');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const imgRef = useRef<HTMLImageElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(f);
    setImgUrl(url);
    setPreviewUrl(null);
    setAdjustments({ ...DEFAULT_ADJUSTMENTS });
  };

  // Auto-preview with debounce
  const generatePreview = useCallback(async () => {
    if (!imgUrl) return;
    setProcessing(true);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imgUrl;
      await new Promise<void>((res) => { img.onload = () => res(); });

      // Downscale for preview performance
      const maxDim = 800;
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const result = applyAdjustments(canvas, adjustments);
      const blob = await new Promise<Blob | null>(res => result.toBlob(b => res(b), 'image/jpeg', 0.9));
      if (blob) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(blob));
      }
    } catch { /* silent */ }
    finally { setProcessing(false); }
  }, [imgUrl, adjustments]);

  useEffect(() => {
    if (!imgUrl) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(generatePreview, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [generatePreview]);

  const exportFull = async () => {
    if (!imgUrl) return;
    setProcessing(true);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imgUrl;
      await new Promise<void>((res) => { img.onload = () => res(); });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const result = applyAdjustments(canvas, adjustments);
      const blob = await new Promise<Blob | null>(res => result.toBlob(b => res(b), 'image/jpeg', 0.95));
      if (blob) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `edited_${file?.name || 'image.jpg'}`;
        a.click();
        URL.revokeObjectURL(a.href);
      }
    } catch (e: any) {
      alert(e?.message || 'Export failed.');
    } finally {
      setProcessing(false);
    }
  };

  const applyPreset = (presetName: string) => {
    setAdjustments({ ...DEFAULT_ADJUSTMENTS, ...PRESETS[presetName] });
  };

  return (
    <div className="flex-1 flex flex-col items-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Image Color Correction</h1>
        <p className="text-xl text-gray-600">Professional color grading with presets and manual adjustments.</p>
      </div>

      {!file ? (
        <label className="flex flex-col items-center justify-center w-full max-w-xl h-64 border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50 cursor-pointer hover:bg-gray-100">
          <Palette className="w-12 h-12 text-gray-400 mb-3" />
          <span className="text-gray-600 font-semibold">Select image to color correct</span>
          <span className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </label>
      ) : (
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Preview */}
          <div className="space-y-4">
            <div className="bg-gray-100 rounded-2xl border border-gray-200 overflow-hidden flex items-center justify-center" style={{ minHeight: 400 }}>
              <div className="relative">
                <img src={previewUrl || imgUrl!} alt="Preview" ref={imgRef} className="max-w-full max-h-[500px] object-contain rounded-lg" />
                {processing && (
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center rounded-lg">
                    <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-center flex-wrap">
              <button onClick={exportFull} disabled={processing} className="px-6 py-2.5 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 flex items-center gap-2 disabled:opacity-50">
                <Download className="w-4 h-4" /> Export Full Quality
              </button>
              <label className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm cursor-pointer hover:bg-gray-200">
                New Image <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
              </label>
            </div>
          </div>

          {/* Controls */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[calc(100vh-200px)]">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-900">Adjustments</span>
              {!isDefault(adjustments) && (
                <button onClick={() => setAdjustments({ ...DEFAULT_ADJUSTMENTS })} className="text-xs text-rose-500 font-semibold flex items-center gap-1 hover:text-rose-700">
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Presets */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Presets</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.keys(PRESETS).filter(n => n !== 'None').map(name => (
                    <button key={name} onClick={() => applyPreset(name)}
                      className="px-2 py-1.5 text-xs font-semibold rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 truncate">
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Manual sliders */}
              {ADJUSTMENT_GROUPS.map(group => (
                <div key={group.label} className="border border-gray-200 rounded-xl overflow-hidden">
                  <button onClick={() => setOpenGroup(openGroup === group.label ? null : group.label)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 text-sm font-bold text-gray-700 hover:bg-gray-100">
                    <span>{group.label}</span>
                    <span className="text-xs text-gray-400">{openGroup === group.label ? '▼' : '▶'}</span>
                  </button>
                  {openGroup === group.label && (
                    <div className="px-3 py-3 space-y-2">
                      {group.keys.map(key => {
                        const range = ADJUSTMENT_RANGES[key];
                        const val = adjustments[key];
                        return (
                          <div key={key} className="flex items-center gap-2 text-xs">
                            <span className="w-24 text-gray-600 capitalize font-medium">{key}</span>
                            <input type="range" min={range.min} max={range.max} step={1} value={val}
                              onChange={e => setAdjustments(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                              className="flex-1 h-1.5 accent-indigo-500" />
                            <span className={`w-8 text-right font-mono ${val === 0 ? 'text-gray-400' : val > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                              {val > 0 ? `+${val}` : val}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
