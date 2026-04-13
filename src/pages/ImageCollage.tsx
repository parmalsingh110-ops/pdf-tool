import React, { useState, useRef, useCallback } from 'react';
import { LayoutGrid, Download, Plus, X, Move } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';

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
  const [images, setImages] = useState<CollageImage[]>([]);
  const [cols, setCols] = useState(2);
  const [rows, setRows] = useState(2);
  const [gap, setGap] = useState(8);
  const [borderRadius, setBorderRadius] = useState(8);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [outputSize, setOutputSize] = useState(2000);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleDrop = (files: File[]) => {
    const newImages = files.map(f => ({
      id: Date.now().toString() + Math.random(),
      file: f,
      url: URL.createObjectURL(f),
    }));
    setImages(prev => [...prev, ...newImages]);
  };

  const removeImage = (id: string) => {
    setImages(prev => {
      const img = prev.find(i => i.id === id);
      if (img) URL.revokeObjectURL(img.url);
      return prev.filter(i => i.id !== id);
    });
  };

  const exportCollage = async () => {
    if (images.length === 0) return;
    const totalCells = cols * rows;
    const canvas = document.createElement('canvas');
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
      await new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); });

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
      let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
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

    canvas.toBlob(blob => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'collage.png';
      a.click();
      URL.revokeObjectURL(a.href);
    }, 'image/png');
  };

  const totalCells = cols * rows;

  return (
    <div className="flex-1 flex flex-col items-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Image Collage Maker</h1>
        <p className="text-xl text-gray-600">Create beautiful photo collages from multiple images.</p>
      </div>

      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
        {/* Preview */}
        <div className="space-y-4">
          {images.length === 0 ? (
            <FileDropzone onDrop={handleDrop} multiple={true} title="Drop photos for collage" accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] }} />
          ) : (
            <>
              <div className="bg-gray-100 rounded-2xl p-4 flex items-center justify-center min-h-[400px]">
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
                    <div key={i} className="relative aspect-[4/5] bg-gray-200 overflow-hidden group" style={{ borderRadius }}>
                      {images[i] ? (
                        <>
                          <img src={images[i].url} alt="" className="w-full h-full object-cover" />
                          <button onClick={() => removeImage(images[i].id)}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <X className="w-3 h-3" />
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center justify-center h-full text-gray-400 text-xs">Empty</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 justify-center flex-wrap">
                <label className="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold text-sm cursor-pointer hover:bg-blue-700 inline-flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Add more
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) handleDrop(Array.from(e.target.files)); e.target.value = ''; }} />
                </label>
                <button onClick={exportCollage} className="px-6 py-2 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 flex items-center gap-2">
                  <Download className="w-4 h-4" /> Download Collage (PNG)
                </button>
                <button onClick={() => { images.forEach(i => URL.revokeObjectURL(i.url)); setImages([]); }} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200">Clear all</button>
              </div>
            </>
          )}
        </div>

        {/* Settings */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5 h-fit">
          <h3 className="font-bold text-gray-900">Layout Template</h3>
          <div className="grid grid-cols-3 gap-2">
            {TEMPLATES.filter(t => !t.custom).map(t => (
              <button key={t.name} onClick={() => { setCols(t.cols); setRows(t.rows); }}
                className={`px-3 py-2 rounded-lg text-sm font-bold border ${cols === t.cols && rows === t.rows ? 'bg-blue-50 border-blue-500 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {t.name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Columns</label>
              <input type="number" min={1} max={6} value={cols} onChange={e => setCols(Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Rows</label>
              <input type="number" min={1} max={6} value={rows} onChange={e => setRows(Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>
          <label className="block text-sm font-medium text-gray-700">
            Gap: {gap}px
            <input type="range" min={0} max={30} value={gap} onChange={e => setGap(Number(e.target.value))} className="mt-1 w-full" />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Corner Radius: {borderRadius}px
            <input type="range" min={0} max={30} value={borderRadius} onChange={e => setBorderRadius(Number(e.target.value))} className="mt-1 w-full" />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Background
            <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} className="mt-1 w-full h-10 rounded-lg border border-gray-300" />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Output Width
            <select value={outputSize} onChange={e => setOutputSize(Number(e.target.value))} className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm">
              <option value={1000}>1000px (web)</option>
              <option value={2000}>2000px (print)</option>
              <option value={3000}>3000px (high-res)</option>
              <option value={4000}>4000px (ultra)</option>
            </select>
          </label>
          <p className="text-xs text-gray-400">{images.length} image(s) loaded, {totalCells} slots</p>
        </div>
      </div>
    </div>
  );
}
