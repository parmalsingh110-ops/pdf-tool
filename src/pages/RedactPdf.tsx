import { useState, useRef, useCallback } from 'react';
import { ShieldOff, Download, Loader2, Plus, Undo2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';

interface RedactRect { x: number; y: number; w: number; h: number; pageIndex: number; }

export default function RedactPdf() {
  usePageSEO('PDF Redaction Tool', 'Permanently redact sensitive information from PDFs. Draw boxes to black out text — free online PDF redactor.');
  const [file, setFile] = useState<File | null>(null);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [rects, setRects] = useState<RedactRect[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [startPt, setStartPt] = useState<{x:number,y:number}|null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [pageSizes, setPageSizes] = useState<{w:number,h:number}[]>([]);

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    setFile(files[0]); setResultUrl(null); setRects([]); setCurrentPage(0);
    setLoading(true);
    try {
      const buf = await files[0].arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const imgs: string[] = [];
      const sizes: {w:number,h:number}[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 1.5 });
        sizes.push({ w: vp.width, h: vp.height });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
        imgs.push(canvas.toDataURL('image/jpeg', 0.85));
        canvas.width = 0; canvas.height = 0;
      }
      setPageImages(imgs);
      setPageSizes(sizes);
    } catch (e: any) { alert(e?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  const getRelCoords = useCallback((e: React.MouseEvent) => {
    if (!imgRef.current) return { x: 0, y: 0 };
    const r = imgRef.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    const pt = getRelCoords(e);
    setStartPt(pt);
    setDrawing(true);
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (!drawing || !startPt) return;
    const end = getRelCoords(e);
    const x = Math.min(startPt.x, end.x);
    const y = Math.min(startPt.y, end.y);
    const w = Math.abs(end.x - startPt.x);
    const h = Math.abs(end.y - startPt.y);
    if (w > 1 && h > 1) {
      setRects(prev => [...prev, { x, y, w, h, pageIndex: currentPage }]);
    }
    setDrawing(false);
    setStartPt(null);
  };

  const undo = () => {
    setRects(prev => prev.filter((_, i) => i !== prev.length - 1));
  };

  const applyRedaction = async () => {
    if (!file || rects.length === 0) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const newDoc = await PDFDocument.create();

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

        // Draw redaction rectangles
        const pageRects = rects.filter(r => r.pageIndex === i - 1);
        ctx.fillStyle = '#000000';
        for (const r of pageRects) {
          const rx = (r.x / 100) * canvas.width;
          const ry = (r.y / 100) * canvas.height;
          const rw = (r.w / 100) * canvas.width;
          const rh = (r.h / 100) * canvas.height;
          ctx.fillRect(rx, ry, rw, rh);
        }

        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        const imgBytes = await fetch(imgData).then(r => r.arrayBuffer());
        const pdfImg = await newDoc.embedJpg(imgBytes);
        const origVp = page.getViewport({ scale: 1 });
        const newPage = newDoc.addPage([origVp.width, origVp.height]);
        newPage.drawImage(pdfImg, { x: 0, y: 0, width: origVp.width, height: origVp.height });
        canvas.width = 0; canvas.height = 0;
      }

      const bytes = await newDoc.save();
      setResultUrl(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
    } catch (e: any) { alert(e?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  const currentRects = rects.filter(r => r.pageIndex === currentPage);

  return (
    <div className="flex-1 flex flex-col items-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">PDF Redaction Tool</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400">Draw black boxes over sensitive areas. Permanently irrecoverable.</p>
      </div>
      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : loading ? (
        <div className="flex items-center gap-3 text-gray-600 dark:text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /> Loading pages…</div>
      ) : resultUrl ? (
        <div className="w-full max-w-2xl text-center space-y-6">
          <div className="p-8 bg-green-50 dark:bg-green-950/30 rounded-2xl border border-green-200 dark:border-green-800">
            <h3 className="text-2xl font-bold text-green-800 dark:text-green-300 mb-4">Redaction applied!</h3>
            <p className="text-sm text-green-600 dark:text-green-400 mb-4">All marked areas are permanently blacked out at the pixel level.</p>
            <a href={resultUrl} download={`redacted_${file.name}`} className="inline-flex items-center gap-2 px-8 py-4 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700"><Download className="w-5 h-5" /> Download</a>
          </div>
          <button onClick={() => { setFile(null); setPageImages([]); setRects([]); setResultUrl(null); }} className="text-gray-500 dark:text-slate-400 font-medium">Redact another</button>
        </div>
      ) : (
        <div className="w-full max-w-5xl space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0} className="px-3 py-1.5 bg-gray-100 dark:bg-slate-800 rounded-lg text-sm font-bold disabled:opacity-30">← Prev</button>
              <span className="text-sm font-bold text-gray-700 dark:text-slate-300">Page {currentPage + 1} / {pageImages.length}</span>
              <button onClick={() => setCurrentPage(p => Math.min(pageImages.length - 1, p + 1))} disabled={currentPage >= pageImages.length - 1} className="px-3 py-1.5 bg-gray-100 dark:bg-slate-800 rounded-lg text-sm font-bold disabled:opacity-30">Next →</button>
            </div>
            <div className="ml-auto flex gap-2">
              <button onClick={undo} disabled={rects.length === 0} className="px-3 py-1.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-lg text-sm font-bold disabled:opacity-30 flex items-center gap-1"><Undo2 className="w-3 h-3" /> Undo</button>
              <span className="text-sm text-gray-500 dark:text-slate-400 self-center">{rects.length} redaction(s)</span>
            </div>
          </div>
          <div className="bg-gray-100 dark:bg-slate-800 rounded-2xl p-4 flex justify-center">
            <div className="relative inline-block cursor-crosshair select-none" onMouseDown={onMouseDown} onMouseUp={onMouseUp}>
              <img ref={imgRef} src={pageImages[currentPage]} alt={`Page ${currentPage+1}`} className="max-h-[65vh] rounded-lg shadow-lg" draggable={false} />
              {currentRects.map((r, i) => (
                <div key={i} className="absolute bg-black pointer-events-none" style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }} />
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400 text-center">🖱️ Click and drag on the page to draw a redaction box</p>
          <div className="flex gap-4">
            <button onClick={applyRedaction} disabled={busy || rects.length === 0} className="flex-1 py-4 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldOff className="w-5 h-5" />} {busy ? 'Applying…' : `Redact (${rects.length} areas)`}
            </button>
            <button onClick={() => { setFile(null); setPageImages([]); setRects([]); }} className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-semibold rounded-xl">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
