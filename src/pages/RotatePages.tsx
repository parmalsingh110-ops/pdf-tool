import { useState, useCallback } from 'react';
import { RotateCw, RotateCcw, Download, Check, RefreshCcw, Layers, Undo2, ZoomIn, X, CheckSquare, Square } from 'lucide-react';
import { PDFDocument, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

interface PageInfo {
  index: number;
  url: string;
  rotation: number; // 0, 90, 180, 270
  selected: boolean;
}

export default function RotatePages() {
  useSEO('Rotate PDF Pages Online Free | PDF Media Suite', 'Rotate individual or all PDF pages clockwise or counter-clockwise (90°, 180°, 270°). Free, instant, private in your browser.');
  usePageSEO('Rotate PDF Pages Online', 'Rotate specific PDF pages or all pages at once. 90-degree clockwise, counter-clockwise, and 180-degree flips. High quality, private, no uploads.');

  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 });
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [zoomPage, setZoomPage] = useState<PageInfo | null>(null);

  const handleDrop = useCallback(async (files: File[]) => {
    if (!files[0]) return;
    const f = files[0];
    setFile(f);
    setResultUrl(null);
    setPages([]);
    setLoading(true);

    try {
      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const total = pdf.numPages;
      setLoadingProgress({ current: 0, total });

      const items: PageInfo[] = [];
      for (let i = 1; i <= total; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 0.4 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(vp.width);
        canvas.height = Math.round(vp.height);
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
        items.push({
          index: i,
          url: canvas.toDataURL('image/jpeg', 0.75),
          rotation: 0,
          selected: false,
        });
        canvas.width = 0; canvas.height = 0;
        page.cleanup();
        setLoadingProgress({ current: i, total });
      }
      setPages(items);
    } catch (e: any) {
      console.error('Failed to load PDF pages:', e);
      alert(e?.message || 'Failed to load PDF.');
    } finally {
      setLoading(false);
    }
  }, []);

  const rotatePage = (idx: number, delta: number) => {
    setPages(prev => prev.map((p, i) => {
      if (i !== idx) return p;
      const nextRot = (p.rotation + delta + 360) % 360;
      return { ...p, rotation: nextRot };
    }));
  };

  const resetPage = (idx: number) => {
    setPages(prev => prev.map((p, i) => (i === idx ? { ...p, rotation: 0 } : p)));
  };

  const rotateAll = (delta: number) => {
    setPages(prev => prev.map(p => ({
      ...p,
      rotation: (p.rotation + delta + 360) % 360,
    })));
  };

  const rotateSelected = (delta: number) => {
    setPages(prev => prev.map(p => {
      if (!p.selected) return p;
      return { ...p, rotation: (p.rotation + delta + 360) % 360 };
    }));
  };

  const resetAll = () => {
    setPages(prev => prev.map(p => ({ ...p, rotation: 0 })));
  };

  const toggleSelect = (idx: number) => {
    setPages(prev => prev.map((p, i) => (i === idx ? { ...p, selected: !p.selected } : p)));
  };

  const selectAll = (val: boolean) => {
    setPages(prev => prev.map(p => ({ ...p, selected: val })));
  };

  const selectOdd = () => {
    setPages(prev => prev.map(p => ({ ...p, selected: p.index % 2 !== 0 })));
  };

  const selectEven = () => {
    setPages(prev => prev.map(p => ({ ...p, selected: p.index % 2 === 0 })));
  };

  const applyRotation = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const doc = await PDFDocument.load(buf);
      const pdfPages = doc.getPages();

      pages.forEach((pg, i) => {
        if (pg.rotation !== 0 && pdfPages[i]) {
          const currentAngle = pdfPages[i].getRotation().angle;
          pdfPages[i].setRotation(degrees((currentAngle + pg.rotation) % 360));
        }
      });

      const bytes = await doc.save();
      const blob = new Blob([bytes as any], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      console.error('Error saving rotated PDF:', e);
      alert(e?.message || 'Failed to rotate PDF.');
    } finally {
      setBusy(false);
    }
  };

  const changedCount = pages.filter(p => p.rotation !== 0).length;
  const selectedCount = pages.filter(p => p.selected).length;

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-6 md:p-8 min-h-screen bg-gradient-to-br from-sky-50/40 via-white to-slate-50">
      <div className="text-center mb-10 max-w-2xl">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-sky-100 rounded-2xl mb-4">
          <RotateCw className="w-7 h-7 text-sky-600" />
        </div>
        <h1 className="text-4xl font-extrabold text-gray-900 mb-3">Rotate PDF Pages</h1>
        <p className="text-lg text-gray-500">Rotate individual pages, selected ranges, or entire document 90° clockwise, counter-clockwise, or 180°.</p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Drop PDF here or click to select" />
      ) : loading ? (
        <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center space-y-4">
          <div className="w-12 h-12 border-3 border-sky-200 border-t-sky-600 rounded-full animate-spin mx-auto" />
          <h3 className="text-lg font-bold text-gray-900">Rendering Page Previews...</h3>
          <p className="text-sm text-gray-500">
            Page {loadingProgress.current} of {loadingProgress.total}
          </p>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-sky-600 h-full transition-all duration-200"
              style={{ width: `${loadingProgress.total ? (loadingProgress.current / loadingProgress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      ) : resultUrl ? (
        /* Success Screen */
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-1">Rotation Applied Successfully!</h3>
          <p className="text-gray-500 mb-6">
            {changedCount} page{changedCount !== 1 ? 's were' : ' was'} rotated.
          </p>
          <a
            href={resultUrl}
            download={`rotated_${file.name}`}
            className="inline-flex items-center justify-center gap-2 w-full py-4 bg-sky-600 text-white font-bold rounded-xl hover:bg-sky-700 transition-colors shadow-md mb-4"
          >
            <Download className="w-5 h-5" /> Download Rotated PDF
          </a>
          <br />
          <button
            onClick={() => { setFile(null); setPages([]); setResultUrl(null); }}
            className="text-gray-500 hover:text-gray-800 font-medium text-sm mt-2"
          >
            Rotate another PDF
          </button>
        </div>
      ) : (
        /* Workspace */
        <div className="w-full max-w-6xl space-y-5">

          {/* Action Toolbar */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Batch rotation buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-1">Rotate All:</span>
                <button
                  onClick={() => rotateAll(-90)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-sky-50 text-sky-700 font-semibold rounded-xl text-xs hover:bg-sky-100 transition-colors border border-sky-100"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Left 90°
                </button>
                <button
                  onClick={() => rotateAll(90)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-sky-50 text-sky-700 font-semibold rounded-xl text-xs hover:bg-sky-100 transition-colors border border-sky-100"
                >
                  <RotateCw className="w-3.5 h-3.5" /> Right 90°
                </button>
                <button
                  onClick={() => rotateAll(180)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-sky-50 text-sky-700 font-semibold rounded-xl text-xs hover:bg-sky-100 transition-colors border border-sky-100"
                >
                  <RefreshCcw className="w-3.5 h-3.5" /> 180° Flip
                </button>
                {changedCount > 0 && (
                  <button
                    onClick={resetAll}
                    className="inline-flex items-center gap-1 px-3 py-2 text-gray-500 hover:text-red-600 rounded-xl text-xs hover:bg-red-50 transition-colors"
                  >
                    <Undo2 className="w-3.5 h-3.5" /> Reset All
                  </button>
                )}
              </div>

              {/* Status pill */}
              <div className="text-xs font-semibold px-3 py-1.5 bg-gray-50 text-gray-600 rounded-lg border border-gray-100">
                {changedCount > 0 ? (
                  <span className="text-sky-600">{changedCount} of {pages.length} pages rotated</span>
                ) : (
                  <span>{pages.length} pages total</span>
                )}
              </div>
            </div>

            {/* Selection bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-100 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 font-medium">Select:</span>
                <button onClick={() => selectAll(true)} className="px-2.5 py-1 text-gray-700 hover:bg-gray-100 rounded-lg font-medium">All</button>
                <button onClick={selectOdd} className="px-2.5 py-1 text-gray-700 hover:bg-gray-100 rounded-lg font-medium">Odd</button>
                <button onClick={selectEven} className="px-2.5 py-1 text-gray-700 hover:bg-gray-100 rounded-lg font-medium">Even</button>
                <button onClick={() => selectAll(false)} className="px-2.5 py-1 text-gray-400 hover:bg-gray-100 rounded-lg">Clear</button>
              </div>

              {selectedCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-purple-700">{selectedCount} selected:</span>
                  <button
                    onClick={() => rotateSelected(-90)}
                    className="px-2.5 py-1 bg-purple-50 text-purple-700 font-semibold rounded-lg hover:bg-purple-100 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" /> Left
                  </button>
                  <button
                    onClick={() => rotateSelected(90)}
                    className="px-2.5 py-1 bg-purple-50 text-purple-700 font-semibold rounded-lg hover:bg-purple-100 flex items-center gap-1"
                  >
                    <RotateCw className="w-3 h-3" /> Right
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Grid of Pages */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {pages.map((pg, i) => (
              <div
                key={pg.index}
                className={`relative group bg-white rounded-2xl border-2 transition-all p-3 shadow-sm hover:shadow-md flex flex-col items-center ${
                  pg.rotation !== 0
                    ? 'border-sky-400 ring-2 ring-sky-100 bg-sky-50/20'
                    : pg.selected
                    ? 'border-purple-400 ring-2 ring-purple-100'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {/* Select checkbox & badge header */}
                <div className="w-full flex items-center justify-between mb-2">
                  <button
                    onClick={() => toggleSelect(i)}
                    className="text-gray-400 hover:text-purple-600 transition-colors p-0.5"
                    title="Select page"
                  >
                    {pg.selected ? (
                      <CheckSquare className="w-4 h-4 text-purple-600" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-300" />
                    )}
                  </button>

                  <span className="text-xs font-bold text-gray-700">#{pg.index}</span>

                  {pg.rotation !== 0 ? (
                    <span className="text-[10px] font-bold bg-sky-600 text-white px-1.5 py-0.5 rounded-full">
                      {pg.rotation}°
                    </span>
                  ) : (
                    <button
                      onClick={() => setZoomPage(pg)}
                      className="text-gray-300 hover:text-gray-600 p-0.5"
                      title="Enlarge preview"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Page preview */}
                <div
                  onClick={() => rotatePage(i, 90)}
                  className="w-full aspect-[3/4] bg-gray-50 rounded-xl overflow-hidden flex items-center justify-center cursor-pointer p-1 relative"
                  title="Click to rotate 90° clockwise"
                >
                  <img
                    src={pg.url}
                    alt={`Page ${pg.index}`}
                    className="max-w-full max-h-full object-contain transition-transform duration-300 rounded shadow-xs"
                    style={{ transform: `rotate(${pg.rotation}deg)` }}
                  />
                </div>

                {/* Action buttons on card */}
                <div className="w-full flex items-center justify-between gap-1 mt-2.5 pt-2 border-t border-gray-100">
                  <button
                    onClick={() => rotatePage(i, -90)}
                    className="p-1.5 text-gray-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                    title="Rotate left 90°"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  {pg.rotation !== 0 && (
                    <button
                      onClick={() => resetPage(i)}
                      className="text-[10px] font-semibold text-gray-400 hover:text-red-500 px-1"
                    >
                      Reset
                    </button>
                  )}
                  <button
                    onClick={() => rotatePage(i, 90)}
                    className="p-1.5 text-gray-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                    title="Rotate right 90°"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Save Bar */}
          <div className="sticky bottom-6 bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-gray-200/80 p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-gray-900">
                {changedCount === 0 ? 'Click any page or use toolbar to rotate' : `${changedCount} page${changedCount !== 1 ? 's' : ''} modified`}
              </p>
              <p className="text-xs text-gray-400">Preview reflects actual output orientation.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setFile(null); setPages([]); }}
                className="px-4 py-2.5 text-gray-500 hover:text-gray-800 text-sm font-semibold rounded-xl hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={applyRotation}
                disabled={busy || changedCount === 0}
                className="px-6 py-2.5 bg-sky-600 text-white text-sm font-bold rounded-xl hover:bg-sky-700 transition-colors disabled:opacity-40 shadow-sm flex items-center gap-2"
              >
                {busy ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Save Rotated PDF
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zoom Modal */}
      {zoomPage && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-6" onClick={() => setZoomPage(null)}>
          <div className="bg-white rounded-2xl p-4 max-w-lg w-full max-h-[90vh] flex flex-col items-center relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setZoomPage(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
            <h3 className="font-bold text-gray-900 mb-3">Page {zoomPage.index} Preview</h3>
            <div className="flex-1 flex items-center justify-center p-2 max-h-[70vh] overflow-hidden">
              <img
                src={zoomPage.url}
                alt={`Page ${zoomPage.index}`}
                className="max-h-[65vh] object-contain rounded-lg shadow-md transition-transform duration-300"
                style={{ transform: `rotate(${zoomPage.rotation}deg)` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
