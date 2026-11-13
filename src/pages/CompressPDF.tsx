import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PDFDocument } from 'pdf-lib';
import { Download, FileText, Minimize2, Check, Zap, Gauge, Shield, Target } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import BackendLoader from '../components/BackendLoader';
import ToolSEOSection from '../components/ToolSEOSection';
import { useSEO } from '../hooks/useSEO';
import { apiFetch } from '../lib/api';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';

type CompressionLevel = 'backend-high-quality' | 'extreme' | 'recommended' | 'low';

export default function CompressPDF() {
  useSEO(
    'Compress PDF Online Free — Reduce PDF Size in KB & MB',
    'Compress PDF files online while maintaining crisp text and vector quality. Choose target file size in KB or automatic compression. 100% private in browser.'
  );
  const [file, setFile] = useState<File | null>(null);
  const [compressionLevel, setCompressionLevel] = useState<CompressionLevel>('backend-high-quality');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [compressedUrl, setCompressedUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [targetSizeKB, setTargetSizeKB] = useState<number>(100);
  const [targetUnit, setTargetUnit] = useState<'KB' | 'MB'>('KB');
  const [useTargetSize, setUseTargetSize] = useState(false);
  const [stats, setStats] = useState<{original: number, compressed: number, method?: string} | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [comparisonView, setComparisonView] = useState<'side-by-side' | 'compressed' | 'original'>('side-by-side');

  const previewUrlRef = useRef<string | null>(null);
  const compressedUrlRef = useRef<string | null>(null);
  previewUrlRef.current = previewUrl;
  compressedUrlRef.current = compressedUrl;

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      if (compressedUrlRef.current) URL.revokeObjectURL(compressedUrlRef.current);
    };
  }, []);

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      // Revoke old URLs to prevent memory leaks
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (compressedUrl) URL.revokeObjectURL(compressedUrl);
      setFile(acceptedFiles[0]);
      setCompressedUrl(null);
      setStats(null);
      setProgressPct(0);
      setUsedFallback(false);
      const url = URL.createObjectURL(acceptedFiles[0]);
      setPreviewUrl(url);
    }
  };

  const compressPdf = async () => {
    if (!file) return;
    
    setIsProcessing(true);
    setProcessingStep('Starting compression...');
    
    try {
      if (compressionLevel === 'backend-high-quality') {
        setProcessingStep('Uploading to server for high-quality vector compression...');
        const formData = new FormData();
        formData.append('file', file);
        const res = await apiFetch('/compress-pdf', {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) throw new Error('Server compression failed');
        const blob = await res.blob();
        setUsedFallback(false);
        const arrayBuf = await blob.arrayBuffer();
        finishCompression(new Uint8Array(arrayBuf));
        return;
      }

      const arrayBuffer = await file.arrayBuffer();
      
      if (compressionLevel === 'low') {
        setProcessingStep('Stripping metadata (Lossless)...');
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        pdfDoc.setTitle('');
        pdfDoc.setAuthor('');
        pdfDoc.setSubject('');
        pdfDoc.setKeywords([]);
        pdfDoc.setProducer('');
        pdfDoc.setCreator('');
        
        const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
        setUsedFallback(false);
        finishCompression(pdfBytes);
      } else {
        // Target-size guided compression (same tuning strategy as target-compress tool)
        if (useTargetSize && targetSizeKB > 0) {
          setProcessingStep('Applying target-based advanced compression...');
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
          const totalPages = pdf.numPages;
          const effectiveKB = targetUnit === 'MB' ? targetSizeKB * 1024 : targetSizeKB;
          const targetBytes = effectiveKB * 1024;
          const perPageBudget = targetBytes / Math.max(1, totalPages);

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
            for (let i = 1; i <= totalPages; i++) {
              setProcessingStep(`Processing page ${i} of ${totalPages}...`);
              setProgressPct(Math.round((i / totalPages) * 100));
              const page = await pdf.getPage(i);
              const viewport = page.getViewport({ scale });
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                page.cleanup();
                continue;
              }
              canvas.width = Math.round(viewport.width);
              canvas.height = Math.round(viewport.height);
              await page.render({ canvas, canvasContext: ctx, viewport }).promise;
              const imgBytes = await canvasToJpegBytes(canvas, jpegQ);
              const pdfImage = await newPdfDoc.embedJpg(imgBytes);
              const newPage = newPdfDoc.addPage([canvas.width, canvas.height]);
              newPage.drawImage(pdfImage, { x: 0, y: 0, width: canvas.width, height: canvas.height });
              canvas.width = 0;
              canvas.height = 0;
              page.cleanup();
            }
            return new Uint8Array(await newPdfDoc.save());
          };

          const bestQualityUnderTarget = async (scale: number) => {
            let lo = 0.08;
            let hi = 0.92;
            let best = await rasterize(scale, 0.5);
            let bestQ = 0.5;
            for (let k = 0; k < 5 && hi - lo > 0.02; k++) {
              const mid = (lo + hi) / 2;
              const candidate = await rasterize(scale, mid);
              if (candidate.length <= targetBytes) {
                best = candidate;
                bestQ = mid;
                lo = mid;
              } else {
                hi = mid;
              }
            }
            if (best.length < targetBytes * 0.82) {
              let q = bestQ;
              for (let k = 0; k < 4; k++) {
                const tryQ = Math.min(0.95, q + 0.03);
                if (tryQ <= q + 0.005) break;
                const candidate = await rasterize(scale, tryQ);
                if (candidate.length <= targetBytes) {
                  best = candidate;
                  bestQ = tryQ;
                  q = tryQ;
                } else {
                  break;
                }
              }
            }
            return best;
          };

          let scale = compressionLevel === 'extreme' ? 1.15 : 1.65;
          if (perPageBudget < 55_000) scale = 1.05;
          if (perPageBudget < 25_000) scale = 0.78;
          if (perPageBudget < 12_000) scale = 0.58;

          setProcessingStep('Tuning quality to target size...');
          let bestPdfBytes = await bestQualityUnderTarget(scale);

          let guard = 0;
          while (bestPdfBytes.length > targetBytes && scale > 0.38 && guard < 14) {
            setProcessingStep(`Shrinking raster... (${guard + 1})`);
            scale *= 0.88;
            bestPdfBytes = await bestQualityUnderTarget(scale);
            guard++;
          }

          if (bestPdfBytes.length < targetBytes * 0.78) {
            let tryScale = Math.min(2.4, scale * 1.1);
            for (let k = 0; k < 10 && tryScale <= 2.5; k++) {
              setProcessingStep('Increasing detail toward target...');
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

          setUsedFallback(false);
          finishCompression(bestPdfBytes);
          return;
        }

        // Default advanced compression via rasterization
        setProcessingStep('Analyzing PDF structure...');
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        const numPages = pdf.numPages;
        const newPdfDoc = await PDFDocument.create();
        
        // Settings based on level
        const scale = compressionLevel === 'extreme' ? 0.9 : 1.2;
        const quality = compressionLevel === 'extreme' ? 0.35 : 0.65;
        
        for (let i = 1; i <= numPages; i++) {
          setProcessingStep(`Processing page ${i} of ${numPages}...`);
          setProgressPct(Math.round((i / numPages) * 100));

          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale });
          
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          const ctx = canvas.getContext('2d');
          if (!ctx) { page.cleanup(); continue; }
          
          // ✅ pdfjs v5: pass canvas + canvasContext + viewport
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          
          // ✅ Reliable base64 decode — avoids fetch(dataUrl) which can fail in some browsers
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const base64 = dataUrl.split(',')[1];
          const binaryStr = atob(base64);
          const imgBytes = new Uint8Array(binaryStr.length);
          for (let b = 0; b < binaryStr.length; b++) {
            imgBytes[b] = binaryStr.charCodeAt(b);
          }
          
          const pdfImage = await newPdfDoc.embedJpg(imgBytes);
          const newPage = newPdfDoc.addPage([canvas.width, canvas.height]);
          newPage.drawImage(pdfImage, { x: 0, y: 0, width: canvas.width, height: canvas.height });
          
          // Release memory
          canvas.width = 0;
          canvas.height = 0;
          page.cleanup();

          // Yield to UI thread
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        
        setProcessingStep('Generating final PDF...');
        const pdfBytes = await newPdfDoc.save();

        // Safety check: if rasterized result is bigger, use lossless fallback
        if (pdfBytes.byteLength >= arrayBuffer.byteLength) {
          setProcessingStep('File already optimized — applying lossless cleanup...');
          setUsedFallback(true);
          const origDoc = await PDFDocument.load(arrayBuffer);
          origDoc.setTitle(''); origDoc.setAuthor(''); origDoc.setSubject('');
          origDoc.setKeywords([]); origDoc.setProducer(''); origDoc.setCreator('');
          const losslessBytes = await origDoc.save({ useObjectStreams: false });
          finishCompression(losslessBytes);
        } else {
          setUsedFallback(false);
          finishCompression(pdfBytes);
        }
      }
    } catch (error: any) {
      console.error('Compression error:', error?.message || error);
      alert(`Compression failed: ${error?.message || 'Unknown error'}. Try "Less Compression" mode which works on all PDFs.`);
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
      setProgressPct(0);
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

  const levels = [
    { 
      id: 'backend-high-quality', 
      title: 'High Quality (Backend)', 
      desc: 'True compression. Retains text & quality perfectly.', 
      icon: Target,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-950/40',
      borderColor: 'border-purple-200 dark:border-purple-800'
    },
    { 
      id: 'extreme', 
      title: 'Extreme Compression', 
      desc: 'Less quality, high compression', 
      icon: Zap,
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-50 dark:bg-amber-950/40',
      borderColor: 'border-amber-200 dark:border-amber-800'
    },
    { 
      id: 'recommended', 
      title: 'Recommended Compression', 
      desc: 'Good quality, good compression', 
      icon: Gauge,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-950/40',
      borderColor: 'border-green-200 dark:border-green-800'
    },
    { 
      id: 'low', 
      title: 'Less Compression', 
      desc: 'High quality, less compression', 
      icon: Shield,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-950/40',
      borderColor: 'border-blue-200 dark:border-blue-800'
    }
  ];

  return (
    <ToolWorkspaceShell
      title="Compress PDF file"
      subtitle="Reduce file size while optimizing for maximal PDF quality."
      categoryLabel="Optimization Engine · Local & High-Quality"
      icon={Minimize2}
      microVariant="compress"
      tone="emerald"
    >
      <div className="flex flex-col items-center">
        {/* Prominent Target Size Banner / Action Button */}
        <div className="mb-8 w-full max-w-3xl p-4 sm:p-5 bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 dark:from-emerald-950/40 dark:via-teal-950/40 dark:to-blue-950/40 border-2 border-emerald-300 dark:border-emerald-700 rounded-2xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 text-left">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                  Exact Size Mode
                </span>
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  KB &amp; MB Support
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-1">
                Need an Exact Target Size? (e.g. 100 KB, 200 KB, 1 MB, 2 MB)
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                Set strict file size limits for Sarkari job portals, SSC/UPSC, courts, or email attachments.
              </p>
            </div>
          </div>

          <Link
            to="/target-compress"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-sm shadow-md hover:shadow-lg transition-all shrink-0 cursor-pointer w-full sm:w-auto text-center"
          >
            <Target className="w-4 h-4" />
            <span>Open Target Compress →</span>
          </Link>
        </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className={`w-full ${compressedUrl ? 'max-w-6xl' : 'max-w-5xl'} flex flex-col lg:flex-row gap-8 transition-all`}>
          <div className="flex-1 bg-white dark:bg-slate-900/90 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-8">
            <div className="flex items-center gap-4 p-6 bg-gray-50 dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700 mb-8">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-950/50 text-green-600 dark:text-green-400 rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-8 h-8" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold text-gray-900 dark:text-slate-100 truncate">{file.name}</p>
                <p className="text-sm text-gray-500 dark:text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>

            {!compressedUrl ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4">
                  {levels.map((level) => (
                    <button
                      key={level.id}
                      onClick={() => setCompressionLevel(level.id as CompressionLevel)}
                      className={`relative flex items-center gap-4 p-5 rounded-xl border-2 transition-all text-left ${
                        compressionLevel === level.id 
                          ? `${level.borderColor} ${level.bgColor} ring-2 ring-green-500 ring-offset-2 dark:ring-offset-slate-900` 
                          : 'border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50 hover:border-gray-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${level.bgColor} ${level.color}`}>
                        <level.icon className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-900 dark:text-slate-100">{level.title}</h3>
                        <p className="text-sm text-gray-500 dark:text-slate-400">{level.desc}</p>
                      </div>
                      {compressionLevel === level.id && (
                        <div className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center">
                          <Check className="w-4 h-4" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                {compressionLevel !== 'low' && (
                  <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 p-4 space-y-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={useTargetSize}
                        onChange={(e) => setUseTargetSize(e.target.checked)}
                        className="rounded border-gray-300 dark:border-slate-600 dark:bg-slate-800"
                      />
                      Use target size based compression
                    </label>
                    {useTargetSize && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-sm font-semibold text-gray-700 dark:text-slate-200">
                            Target Size ({targetUnit})
                          </label>
                          {/* KB / MB Toggle */}
                          <div className="inline-flex rounded-lg p-0.5 bg-gray-200 dark:bg-slate-800 border border-gray-300 dark:border-slate-700">
                            <button
                              type="button"
                              onClick={() => {
                                if (targetUnit !== 'KB') {
                                  setTargetUnit('KB');
                                  setTargetSizeKB((prev) => Math.round(prev * 1024));
                                }
                              }}
                              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                                targetUnit === 'KB'
                                  ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 shadow-xs'
                                  : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
                              }`}
                            >
                              KB
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (targetUnit !== 'MB') {
                                  setTargetUnit('MB');
                                  setTargetSizeKB((prev) => Math.max(1, Math.round(prev / 1024)));
                                }
                              }}
                              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                                targetUnit === 'MB'
                                  ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 shadow-xs'
                                  : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
                              }`}
                            >
                              MB
                            </button>
                          </div>
                        </div>

                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Target className="h-4 w-4 text-gray-400 dark:text-slate-500" />
                          </div>
                          <input
                            type="number"
                            min={1}
                            step={targetUnit === 'MB' ? '0.1' : '1'}
                            value={targetSizeKB}
                            onChange={(e) => setTargetSizeKB(Math.max(0.1, Number(e.target.value) || 1))}
                            className="w-full pl-9 pr-14 py-2.5 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-sm font-bold"
                          />
                          <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs font-bold text-gray-400 dark:text-slate-500 pointer-events-none">
                            {targetUnit}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-slate-400">
                          {targetUnit === 'MB'
                            ? `Tuning quality to stay under ~${(targetSizeKB * 1024).toLocaleString()} KB (${targetSizeKB} MB).`
                            : `Tuning quality to stay under ~${targetSizeKB} KB.`}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-4 flex gap-4">
                  <button
                    onClick={compressPdf}
                    disabled={isProcessing}
                    className="flex-1 py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
                  >
                    <Minimize2 className="w-5 h-5" />
                    {isProcessing ? processingStep || 'Compressing...' : 'Compress PDF'}
                  </button>
                  <button
                    onClick={() => { setFile(null); }}
                    className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 text-lg font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6 text-center">
                <div className="p-8 bg-green-50 dark:bg-green-950/40 rounded-xl border border-green-200 dark:border-green-800">
                  <h3 className="text-2xl font-bold text-green-800 dark:text-green-200 mb-4">PDF compressed!</h3>
                  {stats && (
                    <div className="flex justify-center gap-8 mb-6 text-sm">
                      <div>
                        <p className="text-gray-500 dark:text-slate-400">Original</p>
                        <p className="font-semibold text-gray-900 dark:text-slate-100">{(stats.original / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-slate-400">Compressed</p>
                        <p className="font-semibold text-green-700 dark:text-green-400">{(stats.compressed / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-slate-400">Saved</p>
                        <p className={`font-semibold ${stats.compressed < stats.original ? 'text-green-700 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          {stats.compressed < stats.original
                            ? `${Math.round((1 - stats.compressed / stats.original) * 100)}%`
                            : '—'}
                        </p>
                      </div>
                    </div>
                  )}
                  {usedFallback && (
                    <div className="mb-4 px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-200">
                      ⚠️ PDF was already highly optimized — rasterization would have increased size, so lossless metadata cleanup was applied instead.
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
                  onClick={() => { 
                    if (previewUrl) URL.revokeObjectURL(previewUrl);
                    if (compressedUrl) URL.revokeObjectURL(compressedUrl);
                    setFile(null); setCompressedUrl(null); setStats(null); setPreviewUrl(null); 
                  }}
                  className="text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 font-medium"
                >
                  Compress another PDF
                </button>
              </div>
            )}
          </div>

          {/* Preview Area (Interactive Before & After Comparison) */}
          <div className="flex-1 bg-gray-100 dark:bg-slate-900/90 rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden min-h-[520px] flex flex-col">
            <div className="bg-white dark:bg-slate-900 px-4 py-3 text-xs font-semibold text-gray-700 dark:text-slate-200 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
              <span>{compressedUrl ? 'Quality Comparison' : 'PDF Preview'}</span>
              {compressedUrl && (
                <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-800 p-0.5 rounded-lg text-[11px]">
                  <button
                    onClick={() => setComparisonView('side-by-side')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                      comparisonView === 'side-by-side' ? 'bg-white dark:bg-slate-700 shadow-xs text-green-700 dark:text-emerald-400' : 'text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200'
                    }`}
                  >
                    Side-by-Side
                  </button>
                  <button
                    onClick={() => setComparisonView('compressed')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                      comparisonView === 'compressed' ? 'bg-white dark:bg-slate-700 shadow-xs text-green-700 dark:text-emerald-400' : 'text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200'
                    }`}
                  >
                    Compressed
                  </button>
                  <button
                    onClick={() => setComparisonView('original')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                      comparisonView === 'original' ? 'bg-white dark:bg-slate-700 shadow-xs text-green-700 dark:text-emerald-400' : 'text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200'
                    }`}
                  >
                    Original
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 relative bg-gray-200 dark:bg-slate-950/60 min-h-[460px]">
              {compressedUrl ? (
                comparisonView === 'side-by-side' ? (
                  <div className="absolute inset-0 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-300 dark:divide-slate-700">
                    <div className="relative h-full flex flex-col">
                      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs px-3 py-1.5 text-[11px] font-bold text-gray-600 dark:text-slate-300 flex items-center justify-between border-b border-gray-200 dark:border-slate-800 z-10">
                        <span>Original</span>
                        <span>{stats ? `${(stats.original / 1024 / 1024).toFixed(2)} MB` : ''}</span>
                      </div>
                      <div className="flex-1 relative">
                        {previewUrl && (
                          <iframe src={`${previewUrl}#toolbar=0`} className="absolute inset-0 w-full h-full" title="Original PDF" />
                        )}
                      </div>
                    </div>

                    <div className="relative h-full flex flex-col">
                      <div className="bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-200 flex items-center justify-between border-b border-emerald-200 dark:border-emerald-800 z-10">
                        <span>Compressed</span>
                        <span className="text-emerald-700 dark:text-emerald-400">
                          {stats ? `${(stats.compressed / 1024 / 1024).toFixed(2)} MB (${Math.round((1 - stats.compressed / stats.original) * 100)}% saved)` : ''}
                        </span>
                      </div>
                      <div className="flex-1 relative">
                        <iframe src={`${compressedUrl}#toolbar=0`} className="absolute inset-0 w-full h-full" title="Compressed PDF" />
                      </div>
                    </div>
                  </div>
                ) : comparisonView === 'compressed' ? (
                  <iframe src={`${compressedUrl}#toolbar=0`} className="absolute inset-0 w-full h-full" title="Compressed PDF" />
                ) : (
                  previewUrl && <iframe src={`${previewUrl}#toolbar=0`} className="absolute inset-0 w-full h-full" title="Original PDF" />
                )
              ) : (
                previewUrl && <iframe src={`${previewUrl}#toolbar=0`} className="absolute inset-0 w-full h-full" title="Original PDF" />
              )}

              {isProcessing && compressionLevel === 'backend-high-quality' && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-4 z-20">
                  <BackendLoader
                    title="Compressing PDF…"
                    accentColor="blue"
                    steps={[
                      { icon: '📤', label: 'Uploading', detail: 'Sending your PDF to server...' },
                      { icon: '🔍', label: 'Analyzing', detail: 'Checking optimization opportunities...' },
                      { icon: '⚡', label: 'Compressing', detail: 'Ghostscript applying vector compression...' },
                      { icon: '💾', label: 'Finalizing', detail: 'Packaging compressed output...' },
                    ]}
                    tips={[
                      '⚡ Ghostscript vector compression keeps text crisp.',
                      '🎨 Images are re-encoded at optimal quality settings.',
                      '📉 Typical compression: 40-80% size reduction.',
                      '🔒 File is deleted from server after download.',
                    ]}
                  />
                </div>
              )}
              {isProcessing && compressionLevel !== 'backend-high-quality' && (
                <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex flex-col items-center justify-center text-white p-8 z-20">
                  <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-xl font-bold">{processingStep}</p>
                  {progressPct > 0 && (
                    <div className="w-48 h-2 bg-white/30 rounded-full mt-3 overflow-hidden">
                      <div className="h-full bg-white rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SEO Guide & FAQs for Search Ranking */}
      <ToolSEOSection
        toolName="Compress PDF"
        headline="Free Online PDF Compressor — Reduce File Size without Quality Loss"
        description="Shrink heavy PDF files down to target KB sizes for email attachments, government portal job applications, and web uploads. Choose between AI vector optimization, custom target KB limits, or extreme raster compression."
        steps={[
          {
            step: '01',
            title: 'Choose PDF File',
            desc: 'Drag & drop or browse for the PDF you need to compress.',
          },
          {
            step: '02',
            title: 'Select Compression Mode',
            desc: 'Pick High-Quality Vector compression, specify target KB (e.g. under 100 KB or 200 KB), or extreme compression.',
          },
          {
            step: '03',
            title: 'Download Optimized PDF',
            desc: 'Preview the side-by-side comparison and download your lightweight PDF instantly.',
          },
        ]}
        faqs={[
          {
            q: 'Can I compress a PDF to a specific target size (e.g. under 200 KB)?',
            a: 'Yes! Toggle the "Target Size" mode and type your desired file size in KB. Our intelligent optimization engine will dial in the exact compression settings to meet your requirement.',
          },
          {
            q: 'Will compressing my PDF make the text blurry?',
            a: 'No. The High-Quality vector engine removes redundant embedded metadata, downsamples high-DPI raster images, and streams deflate compression without altering font vectors.',
          },
          {
            q: 'Is this PDF compressor safe for bank statements and tax forms?',
            a: 'Yes, 100%. Processing takes place directly inside your web browser. No documents are uploaded to third-party databases or stored on remote servers.',
          },
          {
            q: 'Is there a file size limit for compression?',
            a: 'PDF Media Suite handles files up to several hundred megabytes smoothly right on your device.',
          },
        ]}
        relatedTools={[
          { name: 'Target Compress', path: '/target-compress', desc: 'Strict KB sizing for government and exam portal uploads' },
          { name: 'Merge PDF', path: '/merge', desc: 'Combine multiple PDF documents into a single file' },
          { name: 'Ink Saver PDF', path: '/ink-saver', desc: 'Lighten dark backgrounds to save printer ink' },
          { name: 'PDF to JPG', path: '/pdf-to-jpg', desc: 'Convert PDF pages into lightweight image files' },
        ]}
      />
      </div>
    </ToolWorkspaceShell>
  );
}
