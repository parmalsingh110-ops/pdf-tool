import React, { useState } from 'react';
import { FileImage, Download, Loader2, GripVertical, RotateCw, Trash2 } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';

interface ImageItem {
  id: string;
  file: File;
  url: string;
  rotation: number;
}

export default function SmartImageToPdf() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [pageSize, setPageSize] = useState<'fit' | 'a4' | 'letter'>('a4');
  const [margin, setMargin] = useState(20);
  const [quality, setQuality] = useState(85);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newItems = Array.from(e.target.files).map(f => ({
      id: Date.now().toString() + Math.random(),
      file: f,
      url: URL.createObjectURL(f),
      rotation: 0,
    }));
    setImages(prev => [...prev, ...newItems]);
    setResultUrl(null);
  };

  const removeImage = (id: string) => {
    setImages(prev => {
      const item = prev.find(i => i.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return prev.filter(i => i.id !== id);
    });
  };

  const rotateImage = (id: string) => {
    setImages(prev => prev.map(i => i.id === id ? { ...i, rotation: (i.rotation + 90) % 360 } : i));
  };

  const moveImage = (fromIdx: number, toIdx: number) => {
    setImages(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      return arr;
    });
  };

  const createPdf = async () => {
    if (images.length === 0) return;
    setBusy(true);
    try {
      const pdfDoc = await PDFDocument.create();
      const pageSizes: Record<string, [number, number]> = {
        a4: [595.28, 841.89],
        letter: [612, 792],
        fit: [0, 0],
      };

      for (const item of images) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = item.url;
        await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); });

        // Render with rotation
        const isRotated = item.rotation % 180 !== 0;
        const w = isRotated ? img.naturalHeight : img.naturalWidth;
        const h = isRotated ? img.naturalWidth : img.naturalHeight;
        
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.translate(w / 2, h / 2);
        ctx.rotate((item.rotation * Math.PI) / 180);
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

        const imgBlob = await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/jpeg', quality / 100));
        if (!imgBlob) continue;
        const imgBytes = new Uint8Array(await imgBlob.arrayBuffer());
        const pdfImage = await pdfDoc.embedJpg(imgBytes);

        let pageW: number, pageH: number;
        if (pageSize === 'fit') {
          pageW = w + margin * 2;
          pageH = h + margin * 2;
        } else {
          [pageW, pageH] = pageSizes[pageSize];
        }

        const page = pdfDoc.addPage([pageW, pageH]);
        const availW = pageW - margin * 2;
        const availH = pageH - margin * 2;
        const scale = Math.min(availW / w, availH / h, 1);
        const drawW = w * scale;
        const drawH = h * scale;
        const x = margin + (availW - drawW) / 2;
        const y = margin + (availH - drawH) / 2;
        page.drawImage(pdfImage, { x, y, width: drawW, height: drawH });

        canvas.width = 0;
        canvas.height = 0;
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      alert(e?.message || 'PDF creation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Smart Image to PDF</h1>
        <p className="text-xl text-gray-600">Convert multiple images to a single PDF with auto-rotation, reordering, and sizing.</p>
      </div>

      <div className="w-full max-w-4xl space-y-6">
        {images.length === 0 ? (
          <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50 cursor-pointer hover:bg-gray-100">
            <FileImage className="w-12 h-12 text-gray-400 mb-3" />
            <span className="text-gray-600 font-semibold">Select images</span>
            <span className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP — multiple allowed</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
          </label>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {images.map((item, idx) => (
                <div key={item.id} className="relative bg-white rounded-xl border border-gray-200 overflow-hidden group shadow-sm">
                  <img src={item.url} alt="" className="w-full h-32 object-contain bg-gray-50 p-2"
                    style={{ transform: `rotate(${item.rotation}deg)` }} />
                  <div className="p-2 flex items-center justify-between bg-gray-50">
                    <span className="text-[10px] text-gray-500 truncate flex-1">{idx + 1}. {item.file.name}</span>
                  </div>
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => rotateImage(item.id)} className="p-1 bg-white rounded-full shadow text-gray-600 hover:text-blue-600"><RotateCw className="w-3 h-3" /></button>
                    <button onClick={() => removeImage(item.id)} className="p-1 bg-white rounded-full shadow text-gray-600 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                  </div>
                  {idx > 0 && (
                    <button onClick={() => moveImage(idx, idx - 1)} className="absolute top-1 left-1 p-1 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 text-gray-600 hover:text-blue-600 text-xs font-bold">↑</button>
                  )}
                  {idx < images.length - 1 && (
                    <button onClick={() => moveImage(idx, idx + 1)} className="absolute bottom-8 left-1 p-1 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 text-gray-600 hover:text-blue-600 text-xs font-bold">↓</button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2 flex-wrap">
              <label className="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold text-sm cursor-pointer hover:bg-blue-700">
                + Add more <input type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
              </label>
              <button onClick={() => { images.forEach(i => URL.revokeObjectURL(i.url)); setImages([]); }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200">Clear all</button>
            </div>

            <div className="grid grid-cols-3 gap-4 bg-gray-50 rounded-2xl border border-gray-200 p-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Page Size</label>
                <select value={pageSize} onChange={e => setPageSize(e.target.value as any)} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm">
                  <option value="a4">A4</option>
                  <option value="letter">US Letter</option>
                  <option value="fit">Fit to image</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Margin (pt)</label>
                <input type="number" value={margin} min={0} max={100} onChange={e => setMargin(Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Quality</label>
                <input type="number" value={quality} min={30} max={100} onChange={e => setQuality(Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={createPdf} disabled={busy} className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileImage className="w-5 h-5" />}
                {busy ? 'Creating PDF…' : `Create PDF (${images.length} images)`}
              </button>
              {resultUrl && (
                <a href={resultUrl} download="images_to_pdf.pdf" className="px-6 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 flex items-center gap-2">
                  <Download className="w-5 h-5" /> Download
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
