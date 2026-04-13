import React, { useState } from 'react';
import { GitCompare, Download, Loader2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';

export default function PdfComparison() {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [diffImages, setDiffImages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);

  const compare = async () => {
    if (!fileA || !fileB) return;
    setBusy(true);
    try {
      const bufA = await fileA.arrayBuffer();
      const bufB = await fileB.arrayBuffer();
      const pdfA = await pdfjsLib.getDocument({ data: new Uint8Array(bufA) }).promise;
      const pdfB = await pdfjsLib.getDocument({ data: new Uint8Array(bufB) }).promise;
      const maxPages = Math.max(pdfA.numPages, pdfB.numPages);
      const results: string[] = [];

      for (let p = 1; p <= maxPages; p++) {
        const scale = 1.5;
        const renderPage = async (pdf: pdfjsLib.PDFDocumentProxy, pageNum: number): Promise<HTMLCanvasElement | null> => {
          if (pageNum > pdf.numPages) return null;
          const page = await pdf.getPage(pageNum);
          const vp = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width; canvas.height = vp.height;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
          return canvas;
        };

        const canvasA = await renderPage(pdfA, p);
        const canvasB = await renderPage(pdfB, p);

        const w = Math.max(canvasA?.width || 0, canvasB?.width || 0);
        const h = Math.max(canvasA?.height || 0, canvasB?.height || 0);
        if (w === 0 || h === 0) continue;

        const diffCanvas = document.createElement('canvas');
        diffCanvas.width = w; diffCanvas.height = h;
        const ctx = diffCanvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);

        // Draw page A as base
        if (canvasA) ctx.drawImage(canvasA, 0, 0);

        // Compare pixels
        if (canvasA && canvasB) {
          const dataA = canvasA.getContext('2d')!.getImageData(0, 0, canvasA.width, canvasA.height);
          const dataB = canvasB.getContext('2d')!.getImageData(0, 0, canvasB.width, canvasB.height);
          const minW = Math.min(canvasA.width, canvasB.width);
          const minH = Math.min(canvasA.height, canvasB.height);
          
          const diffData = ctx.getImageData(0, 0, w, h);
          const dd = diffData.data;
          let diffs = 0;

          for (let y = 0; y < minH; y++) {
            for (let x = 0; x < minW; x++) {
              const idxA = (y * canvasA.width + x) * 4;
              const idxB = (y * canvasB.width + x) * 4;
              const idxD = (y * w + x) * 4;
              
              const diffR = Math.abs(dataA.data[idxA] - dataB.data[idxB]);
              const diffG = Math.abs(dataA.data[idxA + 1] - dataB.data[idxB + 1]);
              const diffB = Math.abs(dataA.data[idxA + 2] - dataB.data[idxB + 2]);
              const totalDiff = diffR + diffG + diffB;

              if (totalDiff > 30) {
                // Highlight difference in red
                dd[idxD] = 255;
                dd[idxD + 1] = 60;
                dd[idxD + 2] = 60;
                dd[idxD + 3] = 180;
                diffs++;
              } else {
                // Keep original but slightly desaturate
                const gray = (dataA.data[idxA] + dataA.data[idxA + 1] + dataA.data[idxA + 2]) / 3;
                dd[idxD] = Math.round(dataA.data[idxA] * 0.7 + gray * 0.3);
                dd[idxD + 1] = Math.round(dataA.data[idxA + 1] * 0.7 + gray * 0.3);
                dd[idxD + 2] = Math.round(dataA.data[idxA + 2] * 0.7 + gray * 0.3);
                dd[idxD + 3] = 255;
              }
            }
          }
          ctx.putImageData(diffData, 0, 0);

          // Add label
          ctx.fillStyle = 'rgba(0,0,0,0.7)';
          ctx.fillRect(0, 0, w, 24);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText(`Page ${p} — ${diffs} pixels differ (${((diffs / (minW * minH)) * 100).toFixed(1)}%)`, 8, 16);
        }

        results.push(diffCanvas.toDataURL('image/png'));
      }

      setDiffImages(results);
      setCurrentPage(0);
    } catch (e: any) {
      alert(e?.message || 'Comparison failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">PDF Comparison (Diff)</h1>
        <p className="text-xl text-gray-600">Upload two PDFs and see exactly what changed — differences highlighted in red.</p>
      </div>

      <div className="w-full max-w-4xl space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-2xl border border-gray-200 p-6 text-center">
            <p className="text-sm font-bold text-gray-700 mb-3">PDF A (Original)</p>
            {fileA ? (
              <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border">
                <span className="text-sm truncate flex-1">{fileA.name}</span>
                <button onClick={() => setFileA(null)} className="text-red-500 text-xs font-bold">✕</button>
              </div>
            ) : (
              <label className="block cursor-pointer text-blue-600 font-semibold hover:underline">
                Select PDF A <input type="file" accept=".pdf" className="hidden" onChange={e => { if (e.target.files?.[0]) setFileA(e.target.files[0]); }} />
              </label>
            )}
          </div>
          <div className="bg-gray-50 rounded-2xl border border-gray-200 p-6 text-center">
            <p className="text-sm font-bold text-gray-700 mb-3">PDF B (Modified)</p>
            {fileB ? (
              <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border">
                <span className="text-sm truncate flex-1">{fileB.name}</span>
                <button onClick={() => setFileB(null)} className="text-red-500 text-xs font-bold">✕</button>
              </div>
            ) : (
              <label className="block cursor-pointer text-blue-600 font-semibold hover:underline">
                Select PDF B <input type="file" accept=".pdf" className="hidden" onChange={e => { if (e.target.files?.[0]) setFileB(e.target.files[0]); }} />
              </label>
            )}
          </div>
        </div>

        <button onClick={compare} disabled={busy || !fileA || !fileB}
          className="w-full py-3 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2">
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <GitCompare className="w-5 h-5" />}
          {busy ? 'Comparing…' : 'Compare PDFs'}
        </button>

        {diffImages.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0}
                className="px-4 py-2 bg-gray-100 rounded-lg font-semibold text-sm disabled:opacity-50">← Prev</button>
              <span className="text-sm font-bold">Page {currentPage + 1} of {diffImages.length}</span>
              <button onClick={() => setCurrentPage(p => Math.min(diffImages.length - 1, p + 1))} disabled={currentPage >= diffImages.length - 1}
                className="px-4 py-2 bg-gray-100 rounded-lg font-semibold text-sm disabled:opacity-50">Next →</button>
            </div>
            <div className="bg-gray-100 rounded-2xl p-4 flex justify-center">
              <img src={diffImages[currentPage]} alt={`Diff page ${currentPage + 1}`} className="max-w-full max-h-[600px] rounded-lg shadow-lg" />
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span className="inline-block w-4 h-4 bg-red-500/70 rounded" /> = Changed areas
              <span className="inline-block w-4 h-4 bg-gray-300 rounded" /> = Unchanged
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
