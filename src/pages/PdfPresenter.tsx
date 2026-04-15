import { useState, useEffect, useCallback, useRef } from 'react';
import { Presentation, ChevronLeft, ChevronRight, Maximize, X } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';

export default function PdfPresenter() {
  usePageSEO('PDF Slide Presenter', 'Turn PDF pages into fullscreen slideshows. Free online PDF presentation tool — no PowerPoint needed.');
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    setFile(files[0]); setPages([]); setCurrentPage(0);
    setLoading(true);
    try {
      const buf = await files[0].arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const imgs: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 2.5 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
        imgs.push(canvas.toDataURL('image/jpeg', 0.9));
        canvas.width = 0; canvas.height = 0;
      }
      setPages(imgs);
    } catch (e: any) { alert(e?.message || 'Failed to load'); }
    finally { setLoading(false); }
  };

  const next = useCallback(() => setCurrentPage(p => Math.min(pages.length - 1, p + 1)), [pages.length]);
  const prev = useCallback(() => setCurrentPage(p => Math.max(0, p - 1)), []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pages.length === 0) return;
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
      else if (e.key === 'f' || e.key === 'F11') { e.preventDefault(); toggleFullscreen(); }
      else if (e.key === 'Escape' && isFullscreen) { document.exitFullscreen(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pages.length, next, prev, toggleFullscreen, isFullscreen]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      {pages.length === 0 && (
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">PDF Slide Presenter</h1>
          <p className="text-xl text-gray-600 dark:text-slate-400">Turn PDF pages into a full-screen slideshow. No PowerPoint needed.</p>
        </div>
      )}

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : loading ? (
        <div className="flex items-center gap-3 text-gray-600 dark:text-slate-400"><div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /> Rendering slides…</div>
      ) : (
        <div ref={containerRef} className={`w-full ${isFullscreen ? 'fixed inset-0 z-[9999] bg-black flex flex-col' : 'max-w-6xl'}`}>
          {/* Top bar */}
          <div className={`flex items-center justify-between gap-4 px-4 py-2 ${isFullscreen ? 'bg-black/80 text-white' : 'bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-t-2xl text-gray-700 dark:text-slate-300'}`}>
            <span className="text-sm font-bold">{currentPage + 1} / {pages.length}</span>
            <div className="flex items-center gap-1">
              <button onClick={prev} disabled={currentPage === 0} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-30"><ChevronLeft className="w-5 h-5" /></button>
              <button onClick={next} disabled={currentPage >= pages.length - 1} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-30"><ChevronRight className="w-5 h-5" /></button>
              <button onClick={toggleFullscreen} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ml-2">{isFullscreen ? <X className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}</button>
            </div>
          </div>
          {/* Slide */}
          <div className={`flex items-center justify-center ${isFullscreen ? 'flex-1' : 'bg-gray-900 rounded-b-2xl min-h-[60vh]'}`} onClick={next}>
            <img src={pages[currentPage]} alt={`Slide ${currentPage + 1}`} className={`${isFullscreen ? 'max-h-screen max-w-full' : 'max-h-[65vh]'} object-contain select-none`} draggable={false} />
          </div>
          {/* Thumbnail strip */}
          {!isFullscreen && (
            <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
              {pages.map((p, i) => (
                <button key={i} onClick={() => setCurrentPage(i)} className={`flex-shrink-0 w-20 aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all ${i === currentPage ? 'border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-800' : 'border-gray-200 dark:border-slate-700 opacity-60 hover:opacity-100'}`}>
                  <img src={p} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
          {!isFullscreen && (
            <div className="mt-4 text-center">
              <p className="text-xs text-gray-500 dark:text-slate-400">⌨️ Arrow keys / Space to navigate • F for fullscreen • Click slide to advance</p>
              <button onClick={() => { setFile(null); setPages([]); }} className="mt-3 text-sm text-gray-500 dark:text-slate-400 font-medium hover:text-gray-900 dark:hover:text-white">Open another PDF</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
