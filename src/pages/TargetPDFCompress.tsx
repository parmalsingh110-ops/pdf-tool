import { useState, useEffect, useMemo } from 'react';
import { Download, Target, FileText, AlertTriangle } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useSEO } from '../hooks/useSEO';

// Initialize pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export default function TargetPDFCompress() {
  useSEO('Target PDF Compress in KB & MB Online Free | PDF Media Suite', 'Free online Target PDF Compress tool. Compress PDF to exact file size in KB or MB. No signup required.');

  const [file, setFile] = useState<File | null>(null);
  const [targetUnit, setTargetUnit] = useState<'KB' | 'MB'>('KB');
  const [targetInputVal, setTargetInputVal] = useState<string>('100');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [compressedUrl, setCompressedUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<{original: number, compressed: number} | null>(null);
  const [numPages, setNumPages] = useState(1);
  const [pageFrom, setPageFrom] = useState(1);
  const [pageTo, setPageTo] = useState(1);

  // Compute effective target size in KB (handling decimals in MB e.g. 1.5 MB = 1536 KB)
  const effectiveTargetKB = useMemo(() => {
    const val = parseFloat(targetInputVal);
    if (isNaN(val) || val <= 0) return 100;
    return targetUnit === 'MB' ? Math.round(val * 1024) : Math.round(val);
  }, [targetInputVal, targetUnit]);

  useEffect(() => {
    if (!file) {
      setNumPages(1);
      setPageFrom(1);
      setPageTo(1);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const n = pdf.numPages || 1;
        if (!cancelled) {
          setNumPages(n);
          setPageFrom(1);
          setPageTo(n);
        }
      } catch {
        if (!cancelled) {
          setNumPages(1);
          setPageFrom(1);
          setPageTo(1);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setCompressedUrl(null);
      setStats(null);
    }
  };

  const finishCompression = (pdfBytes: Uint8Array) => {
    const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    
    setStats({
      original: file!.size,
      compressed: blob.size
    });
    setCompressedUrl(url);
  };

  const compressPdf = async () => {
    if (!file || effectiveTargetKB <= 0) return;
    
    setIsProcessing(true);
    setProcessingStep('Analyzing PDF...');
    try {
      const arrayBuffer = await file.arrayBuffer();
      const targetBytes = effectiveTargetKB * 1024;
      
      // Step 1: Try basic metadata stripping first
      let pdfDoc = await PDFDocument.load(arrayBuffer);
      pdfDoc.setTitle('');
      pdfDoc.setAuthor('');
      pdfDoc.setSubject('');
      pdfDoc.setKeywords([]);
      pdfDoc.setProducer('');
      pdfDoc.setCreator('');
      
      let pdfBytes = await pdfDoc.save({ useObjectStreams: false });
      
      // If basic compression is enough, we are done
      if (pdfBytes.length <= targetBytes) {
        finishCompression(pdfBytes);
        setIsProcessing(false);
        return;
      }

      // Step 2: Rasterize to JPEG pages — aim for size close to target (≤ cap), not far below.
      setProcessingStep('Applying advanced compression (converting pages to images)...');

      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;
      const from = Math.max(1, Math.min(pageFrom, totalPages));
      const to = Math.max(from, Math.min(pageTo, totalPages));
      const pageCount = to - from + 1;
      const perPageBudget = targetBytes / Math.max(1, pageCount);

      const canvasToJpegBytes = (canvas: HTMLCanvasElement, q: number) =>
        new Promise<ArrayBuffer>((resolve, reject) => {
          canvas.toBlob(
            async (blob) => {
              if (!blob) reject(new Error('jpeg'));
              else resolve(await blob.arrayBuffer());
            },
            'image/jpeg',
            q,
          );
        });

      const rasterize = async (scale: number, jpegQ: number) => {
        const newPdfDoc = await PDFDocument.create();
        for (let i = from; i <= to; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          const imgBytes = await canvasToJpegBytes(canvas, jpegQ);
          const pdfImage = await newPdfDoc.embedJpg(imgBytes);
          const newPage = newPdfDoc.addPage([viewport.width, viewport.height]);
          newPage.drawImage(pdfImage, {
            x: 0,
            y: 0,
            width: viewport.width,
            height: viewport.height,
          });
        }
        return new Uint8Array(await newPdfDoc.save());
      };

      const bestQualityUnderTarget = async (scale: number) => {
        let lo = 0.08;
        let hi = 0.92;
        let best = await rasterize(scale, 0.5);
        let bestQ = 0.5;
        for (let k = 0; k < 18 && hi - lo > 0.015; k++) {
          const mid = (lo + hi) / 2;
          const b = await rasterize(scale, mid);
          if (b.length <= targetBytes) {
            best = b;
            bestQ = mid;
            lo = mid;
          } else {
            hi = mid;
          }
        }
        if (best.length < targetBytes * 0.82) {
          let q = bestQ;
          for (let k = 0; k < 12; k++) {
            const tryQ = Math.min(0.95, q + 0.03);
            if (tryQ <= q + 0.005) break;
            const b = await rasterize(scale, tryQ);
            if (b.length <= targetBytes) {
              best = b;
              bestQ = tryQ;
              q = tryQ;
            } else break;
          }
        }
        return best;
      };

      let scale = 1.65;
      if (perPageBudget < 55_000) scale = 1.05;
      if (perPageBudget < 25_000) scale = 0.78;
      if (perPageBudget < 12_000) scale = 0.58;

      setProcessingStep('Tuning quality to your target size…');
      let bestPdfBytes = await bestQualityUnderTarget(scale);

      let guard = 0;
      while (bestPdfBytes.length > targetBytes && scale > 0.38 && guard < 14) {
        setProcessingStep(`Shrinking raster… (${guard + 1})`);
        scale *= 0.88;
        bestPdfBytes = await bestQualityUnderTarget(scale);
        guard++;
      }

      if (bestPdfBytes.length < targetBytes * 0.78) {
        let tryScale = Math.min(2.4, scale * 1.1);
        for (let k = 0; k < 10 && tryScale <= 2.5; k++) {
          setProcessingStep('Increasing detail toward target…');
          const candidate = await bestQualityUnderTarget(tryScale);
          if (candidate.length <= targetBytes && candidate.length > bestPdfBytes.length) {
            bestPdfBytes = candidate;
            scale = tryScale;
            tryScale *= 1.06;
          } else {
            break;
          }
        }
      }

      finishCompression(bestPdfBytes);

    } catch (error) {
      console.error("Error compressing PDF:", error);
      alert("An error occurred while compressing the PDF.");
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Target Size PDF Compress</h1>
        <p className="text-lg text-gray-600">Compress PDF to an exact target file size in KB or MB (e.g. 100 KB, 500 KB, 1 MB, 2 MB).</p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className="w-full max-w-5xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8 flex flex-col lg:flex-row gap-8">
          <div className="flex-1">
            <div className="flex items-center gap-4 p-6 bg-gray-50 rounded-xl border border-gray-200 mb-8">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-8 h-8" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold text-gray-900 truncate">{file.name}</p>
                <p className="text-sm text-gray-500 font-mono">
                  {(file.size / 1024).toFixed(1)} KB ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                </p>
              </div>
            </div>

            {!compressedUrl ? (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-bold text-gray-700">
                      Target File Size ({targetUnit})
                    </label>

                    {/* Unit Selector: KB vs MB */}
                    <div className="inline-flex rounded-xl p-1 bg-gray-100 border border-gray-200">
                      <button
                        type="button"
                        onClick={() => {
                          if (targetUnit !== 'KB') {
                            setTargetUnit('KB');
                            const num = parseFloat(targetInputVal);
                            if (!isNaN(num)) {
                              setTargetInputVal(String(Math.round(num * 1024)));
                            } else {
                              setTargetInputVal('100');
                            }
                          }
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                          targetUnit === 'KB'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        KB
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (targetUnit !== 'MB') {
                            setTargetUnit('MB');
                            const num = parseFloat(targetInputVal);
                            if (!isNaN(num)) {
                              const inMb = num / 1024;
                              setTargetInputVal(inMb >= 1 ? inMb.toFixed(1) : inMb.toFixed(2));
                            } else {
                              setTargetInputVal('1');
                            }
                          }
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                          targetUnit === 'MB'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        MB
                      </button>
                    </div>
                  </div>

                  {/* Input with embedded unit */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Target className="h-5 w-5 text-emerald-600" />
                    </div>
                    <input
                      type="number"
                      step={targetUnit === 'MB' ? '0.1' : '1'}
                      min={targetUnit === 'MB' ? '0.05' : '10'}
                      value={targetInputVal}
                      onChange={(e) => setTargetInputVal(e.target.value)}
                      className="w-full pl-11 pr-16 py-3.5 rounded-xl border-2 border-gray-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-base font-black text-gray-900 transition-all"
                      placeholder={targetUnit === 'MB' ? '1.5' : '100'}
                    />
                    <span className="absolute inset-y-0 right-0 pr-4 flex items-center text-sm font-extrabold text-emerald-600 pointer-events-none">
                      {targetUnit}
                    </span>
                  </div>

                  {/* Quick Preset Chips */}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Quick Presets:</span>
                    {targetUnit === 'KB' ? (
                      [50, 100, 200, 500].map((kb) => (
                        <button
                          key={kb}
                          type="button"
                          onClick={() => setTargetInputVal(String(kb))}
                          className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                            targetInputVal === String(kb)
                              ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-xs'
                              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {kb} KB
                        </button>
                      ))
                    ) : (
                      ['0.5', '1', '2', '5', '10'].map((mb) => (
                        <button
                          key={mb}
                          type="button"
                          onClick={() => setTargetInputVal(mb)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                            targetInputVal === mb
                              ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-xs'
                              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {mb} MB
                        </button>
                      ))
                    )}
                  </div>

                  {/* Dynamic equivalent display */}
                  <div className="mt-2.5 text-xs text-gray-500 flex items-center gap-1.5 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                    <span>Target limit:</span>
                    <strong className="text-emerald-700 font-mono">
                      {targetUnit === 'MB'
                        ? `${targetInputVal || '1'} MB ≈ ${(effectiveTargetKB).toLocaleString()} KB`
                        : `${targetInputVal || '100'} KB ≈ ${(effectiveTargetKB / 1024).toFixed(2)} MB`}
                    </strong>
                  </div>

                  <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg flex gap-3 text-amber-800 text-sm">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <p>
                      <strong>Advanced Compression:</strong> To hit strict size limits, this tool will convert PDF pages into compressed images. This means text will no longer be selectable.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Page from</label>
                    <input
                      type="number"
                      min={1}
                      max={numPages}
                      value={pageFrom}
                      onChange={(e) => setPageFrom(Math.max(1, Math.min(numPages, parseInt(e.target.value, 10) || 1)))}
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">PDF has {numPages} page(s).</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Page to</label>
                    <input
                      type="number"
                      min={1}
                      max={numPages}
                      value={pageTo}
                      onChange={(e) => setPageTo(Math.max(1, Math.min(numPages, parseInt(e.target.value, 10) || 1)))}
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">Only this range is rasterized into the output.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={compressPdf}
                    disabled={isProcessing || effectiveTargetKB <= 0}
                    className="flex-1 py-4 bg-emerald-600 text-white text-lg font-bold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 shadow-md flex flex-col items-center justify-center cursor-pointer"
                  >
                    {isProcessing ? processingStep || 'Compressing...' : `Compress PDF to ${targetUnit === 'MB' ? `${targetInputVal} MB` : `${targetInputVal} KB`}`}
                  </button>
                  <button
                    onClick={() => { setFile(null); }}
                    className="px-6 py-4 bg-gray-100 text-gray-700 text-lg font-semibold rounded-xl hover:bg-gray-200 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6 text-center">
                <div className="p-8 bg-green-50 rounded-xl border border-green-200">
                  <h3 className="text-2xl font-bold text-green-800 mb-4">PDF compressed!</h3>
                  {stats && (
                    <div className="flex justify-center gap-6 sm:gap-8 mb-6 text-sm flex-wrap">
                      <div>
                        <p className="text-gray-500 text-xs">Original</p>
                        <p className="font-semibold text-gray-900">
                          {(stats.original / 1024).toFixed(1)} KB
                          <span className="text-xs text-gray-400 block font-normal">({(stats.original / (1024 * 1024)).toFixed(2)} MB)</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">Compressed</p>
                        <p className="font-bold text-green-700">
                          {(stats.compressed / 1024).toFixed(1)} KB
                          <span className="text-xs text-green-600/80 block font-normal">({(stats.compressed / (1024 * 1024)).toFixed(2)} MB)</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">Target</p>
                        <p className="font-bold text-emerald-700">
                          {targetUnit === 'MB' ? `${targetInputVal} MB` : `${targetInputVal} KB`}
                          <span className="text-xs text-emerald-600/80 block font-normal font-mono">
                            (≤ {effectiveTargetKB.toLocaleString()} KB)
                          </span>
                        </p>
                      </div>
                    </div>
                  )}
                  <a
                    href={compressedUrl}
                    download={`compressed_${file.name}`}
                    className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 transition-colors shadow-md"
                  >
                    <Download className="w-6 h-6" />
                    Download compressed PDF
                  </a>
                </div>
                <button
                  onClick={() => { setFile(null); setCompressedUrl(null); setStats(null); }}
                  className="text-gray-600 hover:text-gray-900 font-medium"
                >
                  Compress another PDF
                </button>
              </div>
            )}
          </div>
          
          {/* PDF Preview Area */}
          <div className="flex-1 bg-gray-100 rounded-xl border border-gray-200 overflow-hidden min-h-[500px] flex flex-col">
            <div className="bg-gray-200 px-4 py-2 text-sm font-medium text-gray-600 border-b border-gray-300">
              Preview
            </div>
            <div className="flex-1 relative">
              {compressedUrl ? (
                <iframe 
                  src={`${compressedUrl}#toolbar=0`} 
                  className="absolute inset-0 w-full h-full"
                  title="Compressed PDF Preview"
                />
              ) : file ? (
                <iframe 
                  src={`${URL.createObjectURL(file)}#toolbar=0`} 
                  className="absolute inset-0 w-full h-full opacity-50"
                  title="Original PDF Preview"
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
