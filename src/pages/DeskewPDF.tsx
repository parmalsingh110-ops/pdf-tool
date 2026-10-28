import React, { useState, useRef, useEffect } from 'react';
import { Download, FileText, CheckCircle2, Eye, Loader2, Sparkles, Compass, RotateCw, Grid, Sliders, Wand2, RefreshCw, Layers } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolSEOSection from '../components/ToolSEOSection';

interface PageItem {
  num: number;
  angle: number; // in degrees (-15 to 15)
  rotation90: number; // 0, 90, 180, 270
}

export default function DeskewPDF() {
  useSEO(
    'Deskew PDF Online Free — Automatically Straighten Scanned PDF Pages | PDF Media Suite',
    'Automatically straighten tilted, crooked scanned PDF pages online free. Fine-tune deskew angles with live alignment grid and instant download.'
  );

  usePageSEO(
    'Deskew PDF — Straighten Crooked Scanned Documents',
    'Automatically detect and correct tilt angles on scanned documents. Interactive alignment grid, manual angle slider, and batch deskewing.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [pageCount, setPageCount] = useState(0);

  const [pages, setPages] = useState<PageItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [showGrid, setShowGrid] = useState(true);

  // Live Canvas Preview
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState('');

  const currentAngle = pages[currentPage - 1]?.angle || 0;
  const currentRot90 = pages[currentPage - 1]?.rotation90 || 0;

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    const f = acceptedFiles[0];
    setFile(f);
    setResultUrl(null);
    setBusy(true);

    try {
      const ab = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
      const count = pdf.numPages;
      setPageCount(count);

      const initialPages: PageItem[] = Array.from({ length: count }, (_, i) => ({
        num: i + 1,
        angle: 0,
        rotation90: 0,
      }));
      setPages(initialPages);
      setCurrentPage(1);

      await renderPreview(pdf, 1);
    } catch (err: any) {
      alert('Could not load PDF: ' + (err?.message || 'Invalid file'));
      setFile(null);
    } finally {
      setBusy(false);
    }
  };

  const renderPreview = async (pdfDoc: pdfjsLib.PDFDocumentProxy, pageNum: number) => {
    setLoadingPreview(true);
    try {
      const page = await pdfDoc.getPage(pageNum);
      const vp = page.getViewport({ scale: 1 });
      const maxDim = 800;
      const scale = Math.min(2.0, maxDim / Math.max(vp.width, vp.height));
      const scaledVp = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = scaledVp.width;
      canvas.height = scaledVp.height;
      const ctx = canvas.getContext('2d')!;

      await page.render({ canvasContext: ctx, viewport: scaledVp, canvas }).promise;
      setPreviewDataUrl(canvas.toDataURL('image/jpeg', 0.85));
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPreview(false);
    }
  };

  // Auto-detect tilt angle on a rendered canvas using horizontal projection variance
  const detectAngle = async () => {
    if (!previewDataUrl) return;
    setAnalyzing(true);

    try {
      const img = new Image();
      img.src = previewDataUrl;
      await new Promise((res) => (img.onload = res));

      // Draw downscaled grayscale for fast projection analysis
      const sw = 300;
      const sh = Math.round((img.height / img.width) * sw);
      const testCanvas = document.createElement('canvas');
      testCanvas.width = sw;
      testCanvas.height = sh;
      const tctx = testCanvas.getContext('2d', { willReadFrequently: true })!;

      let bestAngle = 0;
      let maxVariance = -1;

      // Sample angles from -5 to +5 with 0.5 step
      for (let testAngle = -5; testAngle <= 5; testAngle += 0.5) {
        tctx.save();
        tctx.fillStyle = 'white';
        tctx.fillRect(0, 0, sw, sh);
        tctx.translate(sw / 2, sh / 2);
        tctx.rotate((testAngle * Math.PI) / 180);
        tctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
        tctx.restore();

        const imgData = tctx.getImageData(0, 0, sw, sh).data;
        // Calculate row brightness sum
        const rowSums = new Float64Array(sh);
        for (let y = 0; y < sh; y++) {
          let sum = 0;
          for (let x = 0; x < sw; x++) {
            const idx = (y * sw + x) * 4;
            // Luminance
            sum += (imgData[idx] * 299 + imgData[idx + 1] * 587 + imgData[idx + 2] * 114) / 1000;
          }
          rowSums[y] = sum;
        }

        // Calculate variance across rows (straight text lines produce maximum variance between black text rows and white gaps!)
        let mean = 0;
        for (let y = 0; y < sh; y++) mean += rowSums[y];
        mean /= sh;

        let variance = 0;
        for (let y = 0; y < sh; y++) {
          const diff = rowSums[y] - mean;
          variance += diff * diff;
        }

        if (variance > maxVariance) {
          maxVariance = variance;
          bestAngle = testAngle;
        }
      }

      // Best corrective angle is negative of skew
      const correctiveAngle = Math.round(-bestAngle * 10) / 10;
      updateCurrentPage({ angle: correctiveAngle });
    } catch (e) {
      console.error('Deskew detection error:', e);
    } finally {
      setAnalyzing(false);
    }
  };

  const updateCurrentPage = (patch: Partial<PageItem>) => {
    setPages((prev) =>
      prev.map((p) => (p.num === currentPage ? { ...p, ...patch } : p))
    );
  };

  const applyCurrentToAll = () => {
    setPages((prev) =>
      prev.map((p) => ({ ...p, angle: currentAngle, rotation90: currentRot90 }))
    );
    alert(`Applied ${currentAngle}° deskew angle to all ${pageCount} pages!`);
  };

  const processDeskew = async () => {
    if (!file) return;
    setBusy(true);

    try {
      const ab = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
      const outDoc = await PDFDocument.create();

      for (let i = 1; i <= pdf.numPages; i++) {
        const pageItem = pages[i - 1] || { num: i, angle: 0, rotation90: 0 };
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 2.0 }); // crisp 2x render

        // Canvas for page
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;

        // Fill background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Apply deskew rotation
        if (pageItem.angle !== 0 || pageItem.rotation90 !== 0) {
          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          const totalRad = ((pageItem.angle + pageItem.rotation90) * Math.PI) / 180;
          ctx.rotate(totalRad);
          ctx.translate(-canvas.width / 2, -canvas.height / 2);
        }

        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

        if (pageItem.angle !== 0 || pageItem.rotation90 !== 0) {
          ctx.restore();
        }

        const imgBytes = canvas.toDataURL('image/jpeg', 0.92);
        const embeddedImg = await outDoc.embedJpg(imgBytes);

        // Standard 72 DPI page dimensions
        const pageW = vp.width / 2;
        const pageH = vp.height / 2;
        const newPage = outDoc.addPage([pageW, pageH]);
        newPage.drawImage(embeddedImg, {
          x: 0,
          y: 0,
          width: pageW,
          height: pageH,
        });

        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }

      const outBytes = await outDoc.save();
      const blob = new Blob([outBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultName(`${file.name.replace(/\.pdf$/i, '')}_deskewed.pdf`);
    } catch (e: any) {
      console.error(e);
      alert('Error deskewing PDF: ' + (e?.message || 'Unknown error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 transition-colors">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-sm font-semibold mb-3">
            <Compass className="w-4 h-4" /> Scanned Document Straightener
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
            Deskew PDF Pages
          </h1>
          <p className="text-base md:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Automatically straighten crooked or tilted scanned PDF pages with live alignment grid and precise angle controls.
          </p>
        </div>

        {!file ? (
          <div className="max-w-2xl mx-auto">
            <FileDropzone
              onDrop={handleDrop}
              accept={{ 'application/pdf': ['.pdf'] }}
              multiple={false}
              title="Upload Crooked or Tilted PDF"
              subtitle="Drop scanned document to auto-straighten"
            />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Control Panel */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-slate-200">{file.name}</h3>
                    <p className="text-xs text-slate-500">{pageCount} page{pageCount > 1 ? 's' : ''}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowGrid(!showGrid)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      showGrid
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Grid className="w-3.5 h-3.5" /> Alignment Grid {showGrid ? 'ON' : 'OFF'}
                  </button>

                  <button
                    onClick={() => {
                      setFile(null);
                      setResultUrl(null);
                    }}
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    Change File
                  </button>
                </div>
              </div>

              {/* Angle Control Tools */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
                {/* 1. Auto-Detect */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                      Auto-Straighten
                    </span>
                    <p className="text-xs text-slate-500 mb-3">
                      Analyzes text line orientations to automatically detect skew angle.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={detectAngle}
                    disabled={analyzing}
                    className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors disabled:opacity-50"
                  >
                    {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                    Auto-Detect Angle
                  </button>
                </div>

                {/* 2. Manual Fine-Tuning Slider */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Fine-Tune Tilt Angle
                    </span>
                    <span className="text-xs font-bold text-amber-600 bg-amber-100 dark:bg-amber-950 px-2 py-0.5 rounded font-mono">
                      {currentAngle > 0 ? `+${currentAngle}` : currentAngle}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-10}
                    max={10}
                    step={0.1}
                    value={currentAngle}
                    onChange={(e) => updateCurrentPage({ angle: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-600"
                  />
                  <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                    <span>-10° Counter-Clockwise</span>
                    <button
                      onClick={() => updateCurrentPage({ angle: 0 })}
                      className="text-amber-600 hover:underline font-semibold"
                    >
                      Reset 0°
                    </button>
                    <span>+10° Clockwise</span>
                  </div>
                </div>

                {/* 3. 90-Degree Rotation & Batch */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                      Page Rotation & Batch
                    </span>
                    <div className="flex gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => updateCurrentPage({ rotation90: (currentRot90 + 90) % 360 })}
                        className="flex-1 py-1.5 px-2 rounded-lg border text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 flex items-center justify-center gap-1"
                      >
                        <RotateCw className="w-3.5 h-3.5" /> Rotate 90°
                      </button>
                    </div>
                  </div>
                  {pageCount > 1 && (
                    <button
                      type="button"
                      onClick={applyCurrentToAll}
                      className="text-xs text-amber-600 hover:underline font-semibold text-left"
                    >
                      Apply this {currentAngle}° angle to all {pageCount} pages
                    </button>
                  )}
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  onClick={processDeskew}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {busy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Straightening PDF...
                    </>
                  ) : (
                    <>
                      <Compass className="w-4 h-4" /> Save Deskewed PDF
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Live Interactive Page Visualizer */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 text-center">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-amber-600" />
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Live Straightening View (Page {currentPage} of {pageCount})
                  </h4>
                </div>
                {pageCount > 1 && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500">Jump to page:</span>
                    <select
                      value={currentPage}
                      onChange={async (e) => {
                        const num = Number(e.target.value);
                        setCurrentPage(num);
                        const ab = await file.arrayBuffer();
                        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
                        await renderPreview(pdf, num);
                      }}
                      className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs"
                    >
                      {Array.from({ length: Math.min(pageCount, 50) }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          Page {n}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {previewDataUrl ? (
                <div className="relative inline-block border-2 border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden shadow-lg bg-white">
                  <div
                    className="transition-transform duration-150 origin-center"
                    style={{
                      transform: `rotate(${currentAngle + currentRot90}deg)`,
                    }}
                  >
                    <img
                      src={previewDataUrl}
                      alt="Deskew Preview"
                      className="max-h-[500px] w-auto object-contain block mx-auto"
                    />
                  </div>

                  {/* Horizontal Alignment Grid Lines */}
                  {showGrid && (
                    <div className="absolute inset-0 pointer-events-none grid grid-rows-12 border border-blue-400/30">
                      {Array.from({ length: 11 }).map((_, i) => (
                        <div key={i} className="border-b border-dashed border-blue-400/40" />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading preview...
                </div>
              )}
            </div>

            {/* Success Box */}
            {resultUrl && (
              <div className="p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center animate-fade-in">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
                <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-100 mb-1">
                  Deskewing Complete!
                </h3>
                <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-4">
                  All crooked pages have been rotated into perfect horizontal alignment.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <a
                    href={resultUrl}
                    download={resultName}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition-colors"
                  >
                    <Download className="w-4 h-4" /> Download Straightened PDF
                  </a>
                  <a
                    href={resultUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-emerald-800 dark:text-emerald-200 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100/50 transition-colors"
                  >
                    <Eye className="w-4 h-4" /> Preview in Browser
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        <ToolSEOSection
          toolName="Deskew PDF"
          headline="Straighten Crooked Scanned Documents"
          description="Automatically straighten tilted, crooked scanned PDF pages online free. Fine-tune deskew angles with live alignment grid and instant download."
          faqs={[
            {
              q: 'Why do scanned PDFs become crooked?',
              a: 'Paper feeders and flatbed scanner lids often pull or hold pages at a slight angle during the scan pass. Deskewing rotates the document back to 0° alignment.',
            },
            {
              q: 'How does the alignment grid help?',
              a: 'The grid provides reference horizontal lines so you can align text rows directly against the line to verify 100% straightness.',
            },
          ]}
        />
      </div>
    </div>
  );
}
