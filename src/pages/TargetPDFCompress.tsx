import { useState, useEffect, useMemo } from 'react';
import { Download, Target, FileText, AlertTriangle } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useSEO } from '../hooks/useSEO';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { useAutoRevokeUrl } from '../lib/blobUrl';

// Initialize pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export default function TargetPDFCompress() {
  useSEO('Target PDF Compress in KB & MB Online Free | PDF Media Suite', 'Free online Target PDF Compress tool. Compress PDF to exact file size in KB or MB. No signup required.');

  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [targetUnit, setTargetUnit] = useState<'KB' | 'MB'>('KB');
  const [targetInputVal, setTargetInputVal] = useState<string>('100');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [compressedUrl, setCompressedUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<{original: number, compressed: number} | null>(null);
  const [numPages, setNumPages] = useState(1);
  const [pageFrom, setPageFrom] = useState(1);
  const [pageTo, setPageTo] = useState(1);

  useAutoRevokeUrl(originalUrl);
  useAutoRevokeUrl(compressedUrl);

  useEffect(() => {
    if (!file) {
      setOriginalUrl(null);
      return;
    }
    setOriginalUrl(URL.createObjectURL(file));
  }, [file]);

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
            (blob) => {
              if (!blob) reject(new Error('jpeg'));
              else blob.arrayBuffer().then(resolve, reject);
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
          canvas.width = 0;
          canvas.height = 0;
        }
        return new Uint8Array(await newPdfDoc.save());
      };

      // Fast calibration on a single representative page to avoid 50+ full-PDF canvas re-renders
      const samplePageNum = Math.floor((from + to) / 2);
      const samplePage = await pdf.getPage(samplePageNum);

      const calibrateOnSamplePage = async (scale: number): Promise<{ bestQ: number; estTotalBytes: number }> => {
        const viewport = samplePage.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return { bestQ: 0.5, estTotalBytes: targetBytes };
        await samplePage.render({ canvasContext: ctx, viewport, canvas }).promise;

        let lo = 0.08;
        let hi = 0.92;
        let bestQ = 0.5;
        let bestPageBytes = (await canvasToJpegBytes(canvas, 0.5)).byteLength;
        const targetPerPage = Math.max(4000, (targetBytes - 1500) / pageCount);

        for (let k = 0; k < 8 && hi - lo > 0.02; k++) {
          const mid = (lo + hi) / 2;
          const bLen = (await canvasToJpegBytes(canvas, mid)).byteLength + 600;
          if (bLen <= targetPerPage) {
            bestQ = mid;
            bestPageBytes = bLen;
            lo = mid;
          } else {
            hi = mid;
          }
        }
        canvas.width = 0;
        canvas.height = 0;
        return { bestQ, estTotalBytes: bestPageBytes * pageCount + 1200 };
      };

      let scale = 1.65;
      if (perPageBudget < 55_000) scale = 1.05;
      if (perPageBudget < 25_000) scale = 0.78;
      if (perPageBudget < 12_000) scale = 0.58;

      setProcessingStep('Calibrating optimal scale & quality…');
      let { bestQ, estTotalBytes } = await calibrateOnSamplePage(scale);

      let guard = 0;
      while (estTotalBytes > targetBytes && scale > 0.38 && guard < 6) {
        scale *= 0.85;
        const cal = await calibrateOnSamplePage(scale);
        bestQ = cal.bestQ;
        estTotalBytes = cal.estTotalBytes;
        guard++;
      }

      setProcessingStep('Rendering compressed pages…');
      let bestPdfBytes = await rasterize(scale, bestQ);

      // Single corrective pass if multi-page variance caused total bytes to exceed targetBytes
      if (bestPdfBytes.length > targetBytes) {
        setProcessingStep('Fine-tuning to exact target size…');
        const ratio = (targetBytes * 0.94) / bestPdfBytes.length;
        const adjustedQ = Math.max(0.08, bestQ * ratio);
        const adjustedScale = ratio < 0.65 ? Math.max(0.38, scale * Math.sqrt(ratio)) : scale;
        bestPdfBytes = await rasterize(adjustedScale, adjustedQ);
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
    <ToolWorkspaceShell
      title="Target Size PDF Compress"
      subtitle="Compress PDF to an exact target file size in KB or MB (e.g. 100 KB, 500 KB, 1 MB, 2 MB)."
      categoryLabel="Exact KB Optimizer"
      icon={Target}
      microVariant="compress"
      tone="emerald"
    >
      <div className="flex flex-col items-center w-full">

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className="w-full max-w-5xl bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-8 flex flex-col lg:flex-row gap-8">
          <div className="flex-1">
            <div className="flex items-center gap-4 p-6 bg-gray-50 dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700 mb-8">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-8 h-8" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold text-gray-900 dark:text-white truncate">{file.name}</p>
                <p className="text-sm text-gray-500 dark:text-slate-400 font-mono">
                  {(file.size / 1024).toFixed(1)} KB ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                </p>
              </div>
            </div>

            {!compressedUrl ? (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-bold text-gray-700 dark:text-slate-300">
                      Target File Size ({targetUnit})
                    </label>

                    {/* Unit Selector: KB vs MB */}
                    <div className="inline-flex rounded-xl p-1 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700">
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
                            : 'text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white'
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
                            : 'text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white'
                        }`}
                      >
                        MB
                      </button>
                    </div>
                  </div>

                  {/* Input with embedded unit */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Target className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <input
                      type="number"
                      step={targetUnit === 'MB' ? '0.1' : '1'}
                      min={targetUnit === 'MB' ? '0.05' : '10'}
                      value={targetInputVal}
                      onChange={(e) => setTargetInputVal(e.target.value)}
                      className="w-full pl-11 pr-16 py-3.5 rounded-xl border-2 border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-base font-black text-gray-900 dark:text-white transition-all"
                      placeholder={targetUnit === 'MB' ? '1.5' : '100'}
                    />
                    <span className="absolute inset-y-0 right-0 pr-4 flex items-center text-sm font-extrabold text-emerald-600 dark:text-emerald-400 pointer-events-none">
                      {targetUnit}
                    </span>
                  </div>

                  {/* Quick Preset Chips */}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Quick Presets:</span>
                    {targetUnit === 'KB' ? (
                      [50, 100, 200, 500].map((kb) => (
                        <button
                          key={kb}
                          type="button"
                          onClick={() => setTargetInputVal(String(kb))}
                          className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                            targetInputVal === String(kb)
                              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-xs'
                              : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
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
                              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-xs'
                              : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                          }`}
                        >
                          {mb} MB
                        </button>
                      ))
                    )}
                  </div>

                  {/* Dynamic equivalent display */}
                  <div className="mt-2.5 text-xs text-gray-500 dark:text-slate-400 flex items-center gap-1.5 bg-gray-50 dark:bg-slate-800/60 px-3 py-2 rounded-lg border border-gray-100 dark:border-slate-700">
                    <span>Target limit:</span>
                    <strong className="text-emerald-700 dark:text-emerald-400 font-mono">
                      {targetUnit === 'MB'
                        ? `${targetInputVal || '1'} MB ≈ ${(effectiveTargetKB).toLocaleString()} KB`
                        : `${targetInputVal || '100'} KB ≈ ${(effectiveTargetKB / 1024).toFixed(2)} MB`}
                    </strong>
                  </div>

                  <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-lg flex gap-3 text-amber-800 dark:text-amber-300 text-sm">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <p>
                      <strong>Advanced Compression:</strong> To hit strict size limits, this tool will convert PDF pages into compressed images. This means text will no longer be selectable.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Page from</label>
                    <input
                      type="number"
                      min={1}
                      max={numPages}
                      value={pageFrom}
                      onChange={(e) => setPageFrom(Math.max(1, Math.min(numPages, parseInt(e.target.value, 10) || 1)))}
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">PDF has {numPages} page(s).</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Page to</label>
                    <input
                      type="number"
                      min={1}
                      max={numPages}
                      value={pageTo}
                      onChange={(e) => setPageTo(Math.max(1, Math.min(numPages, parseInt(e.target.value, 10) || 1)))}
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Only this range is rasterized into the output.</p>
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
                    className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 text-lg font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6 text-center">
                <div className="p-8 bg-green-50 dark:bg-emerald-950/40 rounded-xl border border-green-200 dark:border-emerald-900/50">
                  <h3 className="text-2xl font-bold text-green-800 dark:text-emerald-300 mb-4">PDF compressed!</h3>
                  {stats && (
                    <div className="flex justify-center gap-6 sm:gap-8 mb-6 text-sm flex-wrap">
                      <div>
                        <p className="text-gray-500 dark:text-slate-400 text-xs">Original</p>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {(stats.original / 1024).toFixed(1)} KB
                          <span className="text-xs text-gray-400 block font-normal">({(stats.original / (1024 * 1024)).toFixed(2)} MB)</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-slate-400 text-xs">Compressed</p>
                        <p className="font-bold text-green-700 dark:text-emerald-400">
                          {(stats.compressed / 1024).toFixed(1)} KB
                          <span className="text-xs text-green-600/80 dark:text-emerald-400/80 block font-normal">({(stats.compressed / (1024 * 1024)).toFixed(2)} MB)</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-slate-400 text-xs">Target</p>
                        <p className="font-bold text-emerald-700 dark:text-emerald-300">
                          {targetUnit === 'MB' ? `${targetInputVal} MB` : `${targetInputVal} KB`}
                          <span className="text-xs text-emerald-600/80 dark:text-emerald-400/80 block font-normal font-mono">
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
                  className="text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white font-medium"
                >
                  Compress another PDF
                </button>
              </div>
            )}
          </div>
          
          {/* PDF Preview Area */}
          <div className="flex-1 bg-gray-100 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden min-h-[500px] flex flex-col">
            <div className="bg-gray-200 dark:bg-slate-800/90 px-4 py-2 text-sm font-medium text-gray-600 dark:text-slate-300 border-b border-gray-300 dark:border-slate-700">
              Preview
            </div>
            <div className="flex-1 relative">
              {compressedUrl ? (
                <iframe 
                  src={`${compressedUrl}#toolbar=0`} 
                  className="absolute inset-0 w-full h-full"
                  title="Compressed PDF Preview"
                />
              ) : originalUrl ? (
                <iframe 
                  src={`${originalUrl}#toolbar=0`} 
                  className="absolute inset-0 w-full h-full opacity-50"
                  title="Original PDF Preview"
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
      </div>
    </ToolWorkspaceShell>
  );
}
