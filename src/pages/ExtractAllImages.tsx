import React, { useState } from 'react';
import { ImageIcon, Download, Loader2, Package } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import JSZip from 'jszip';
import FileDropzone from '../components/FileDropzone';

export default function ExtractAllImages() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [images, setImages] = useState<{ name: string; blob: Blob; url: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = (files: File[]) => {
    if (files[0]) {
      setFile(files[0]);
      setImages([]);
      setError(null);
    }
  };

  const extractImages = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setImages([]);
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const result: { name: string; blob: Blob; url: string }[] = [];
      
      for (let p = 1; p <= pdf.numPages; p++) {
        setProgress(`Scanning page ${p} of ${pdf.numPages}…`);
        const page = await pdf.getPage(p);
        const ops = await page.getOperatorList();
        
        // Look for paintImageXObject operations
        for (let i = 0; i < ops.fnArray.length; i++) {
          if (
            ops.fnArray[i] === pdfjsLib.OPS.paintImageXObject ||
            ops.fnArray[i] === pdfjsLib.OPS.paintJpegXObject
          ) {
            const imgName = ops.argsArray[i][0];
            try {
              // @ts-ignore — objs.get returns image data
              const imgData = await new Promise<any>((resolve, reject) => {
                page.objs.get(imgName, (data: any) => {
                  if (data) resolve(data);
                  else reject(new Error('no data'));
                });
                setTimeout(() => reject(new Error('timeout')), 3000);
              });
              
              if (imgData && (imgData.width > 10 && imgData.height > 10)) {
                const canvas = document.createElement('canvas');
                canvas.width = imgData.width;
                canvas.height = imgData.height;
                const ctx = canvas.getContext('2d')!;
                
                if (imgData.data && imgData.data instanceof Uint8ClampedArray) {
                  const idata = new ImageData(imgData.data, imgData.width, imgData.height);
                  ctx.putImageData(idata, 0, 0);
                } else if (imgData.src) {
                  // JPEG data URL
                  const img = new Image();
                  img.src = imgData.src;
                  await new Promise<void>(res => { img.onload = () => res(); });
                  ctx.drawImage(img, 0, 0);
                } else if (imgData instanceof HTMLCanvasElement) {
                  ctx.drawImage(imgData, 0, 0);
                } else {
                  continue;
                }
                
                const blob = await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/png'));
                if (blob && blob.size > 500) {
                  const name = `page${p}_img${result.length + 1}.png`;
                  result.push({ name, blob, url: URL.createObjectURL(blob) });
                }
              }
            } catch {
              // skip individual image errors
            }
          }
        }
      }
      
      if (result.length === 0) {
        // Fallback: render each page as an image
        setProgress('No embedded images found. Rendering pages as images…');
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const vp = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width;
          canvas.height = vp.height;
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
          const blob = await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/png'));
          if (blob) {
            result.push({
              name: `page_${p}.png`,
              blob,
              url: URL.createObjectURL(blob),
            });
          }
        }
      }
      
      setImages(result);
      setProgress(`Found ${result.length} image(s).`);
    } catch (e: any) {
      setError(e?.message || 'Extraction failed.');
    } finally {
      setBusy(false);
    }
  };

  const downloadAll = async () => {
    if (images.length === 0) return;
    const zip = new JSZip();
    for (const img of images) {
      zip.file(img.name, img.blob);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `extracted_images_${file?.name || 'pdf'}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Extract All Images</h1>
        <p className="text-xl text-gray-600">Extract every image embedded inside a PDF document.</p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className="w-full max-w-4xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200 mb-6">
            <ImageIcon className="w-8 h-8 text-yellow-600" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate">{file.name}</p>
              <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>

          {error && <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg mb-4 text-sm">{error}</div>}
          {progress && <p className="text-sm text-gray-600 mb-4">{progress}</p>}

          <div className="flex gap-3 mb-6">
            <button
              onClick={extractImages}
              disabled={busy}
              className="flex-1 py-3 bg-yellow-600 text-white font-bold rounded-xl hover:bg-yellow-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
              {busy ? 'Extracting…' : 'Extract Images'}
            </button>
            {images.length > 0 && (
              <button
                onClick={downloadAll}
                className="px-6 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 flex items-center gap-2"
              >
                <Package className="w-5 h-5" />
                Download ZIP
              </button>
            )}
            <button onClick={() => { setFile(null); setImages([]); }} className="px-5 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200">Reset</button>
          </div>

          {images.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {images.map((img, i) => (
                <div key={i} className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                  <img src={img.url} alt={img.name} className="w-full h-32 object-contain bg-white" />
                  <div className="p-2 flex items-center justify-between">
                    <span className="text-xs text-gray-500 truncate">{img.name}</span>
                    <a href={img.url} download={img.name} className="text-xs text-blue-600 font-semibold">
                      <Download className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
