import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PDFDocument } from 'pdf-lib';
import { Download, FileText, Minimize2, Check, Zap, Gauge, Shield, Target } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { usePageSEO } from '../lib/usePageSEO';

type CompressionLevel = 'extreme' | 'recommended' | 'low';

export default function CompressPDF() {
  usePageSEO('Compress PDF Online Free', 'Reduce PDF file size while maintaining quality. Free online PDF compressor with multiple compression levels — fast and private.');
  const [file, setFile] = useState<File | null>(null);
  const [compressionLevel, setCompressionLevel] = useState<CompressionLevel>('recommended');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [compressedUrl, setCompressedUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [targetSizeKB, setTargetSizeKB] = useState<number>(100);
  const [useTargetSize, setUseTargetSize] = useState(false);
  const [stats, setStats] = useState<{original: number, compressed: number, method?: string} | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);

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
        
        const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
        setUsedFallback(false);
        finishCompression(pdfBytes);
      } else {
        // Target-size guided compression (same tuning strategy as target-compress tool)
        if (useTargetSize && targetSizeKB > 0) {
          setProcessingStep('Applying target-based advanced compression...');
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
          const totalPages = pdf.numPages;
          const targetBytes = targetSizeKB * 1024;
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
              await page.render({ canvasContext: ctx, viewport }).promise;
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
            for (let k = 0; k < 18 && hi - lo > 0.015; k++) {
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
              for (let k = 0; k < 12; k++) {
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
          
          // ✅ Correct: only pass canvasContext + viewport (no 'canvas' property)
          await page.render({ canvasContext: ctx, viewport }).promise;
          
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
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    
    setStats({
      original: file!.size,
      compressed: blob.size
    });
    setCompressedUrl(url);
  };

  const levels = [
    { 
      id: 'extreme', 
      title: 'Extreme Compression', 
      desc: 'Less quality, high compression', 
      icon: Zap,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200'
    },
    { 
      id: 'recommended', 
      title: 'Recommended Compression', 
      desc: 'Good quality, good compression', 
      icon: Gauge,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200'
    },
    { 
      id: 'low', 
      title: 'Less Compression', 
      desc: 'High quality, less compression', 
      icon: Shield,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200'
    }
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-12 max-w-3xl mx-auto px-4">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Compress PDF file</h1>
        <p className="text-xl text-gray-600">Reduce file size while optimizing for maximal PDF quality.</p>
        <p className="mt-4 text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-left">
          <strong>Need a specific file size?</strong> The &quot;Less compression&quot; path only strips metadata (near-lossless).
          For a hard cap in kilobytes (with rasterized pages), use{' '}
          <Link to="/target-compress" className="text-blue-700 font-semibold underline">
            Target size PDF compress
          </Link>
          .
        </p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-8">
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <div className="flex items-center gap-4 p-6 bg-gray-50 rounded-xl border border-gray-200 mb-8">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-8 h-8" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold text-gray-900 truncate">{file.name}</p>
                <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
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
                          ? `${level.borderColor} ${level.bgColor} ring-2 ring-green-500 ring-offset-2` 
                          : 'border-gray-100 bg-gray-50 hover:border-gray-300'
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${level.bgColor} ${level.color}`}>
                        <level.icon className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-900">{level.title}</h3>
                        <p className="text-sm text-gray-500">{level.desc}</p>
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
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                      <input
                        type="checkbox"
                        checked={useTargetSize}
                        onChange={(e) => setUseTargetSize(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      Use target size based compression
                    </label>
                    {useTargetSize && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Target Size (KB)
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Target className="h-4 w-4 text-gray-400" />
                          </div>
                          <input
                            type="number"
                            min={1}
                            value={targetSizeKB}
                            onChange={(e) => setTargetSizeKB(Math.max(1, Number(e.target.value) || 1))}
                            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                          />
                        </div>
                        <p className="mt-2 text-xs text-gray-500">
                          Advanced mode tries to keep output near this size by tuning raster quality.
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
                    className="px-6 py-4 bg-gray-100 text-gray-700 text-lg font-semibold rounded-xl hover:bg-gray-200 transition-colors"
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
                    <div className="flex justify-center gap-8 mb-6 text-sm">
                      <div>
                        <p className="text-gray-500">Original</p>
                        <p className="font-semibold text-gray-900">{(stats.original / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Compressed</p>
                        <p className="font-semibold text-green-700">{(stats.compressed / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Saved</p>
                        <p className={`font-semibold ${stats.compressed < stats.original ? 'text-green-700' : 'text-amber-600'}`}>
                          {stats.compressed < stats.original
                            ? `${Math.round((1 - stats.compressed / stats.original) * 100)}%`
                            : '—'}
                        </p>
                      </div>
                    </div>
                  )}
                  {usedFallback && (
                    <div className="mb-4 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
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
                  className="text-gray-600 hover:text-gray-900 font-medium"
                >
                  Compress another PDF
                </button>
              </div>
            )}
          </div>

          {/* Preview Area (Optional but nice) */}
          <div className="flex-1 bg-gray-100 rounded-2xl border border-gray-200 overflow-hidden min-h-[500px] flex flex-col">
            <div className="bg-white px-4 py-3 text-sm font-semibold text-gray-700 border-b border-gray-200">
              PDF Preview
            </div>
            <div className="flex-1 relative bg-gray-200">
               {previewUrl && (
                 <iframe 
                    src={`${previewUrl}#toolbar=0`} 
                    className="absolute inset-0 w-full h-full"
                    title="PDF Preview"
                  />
                )}
               {isProcessing && (
                 <div className="absolute inset-0 bg-black/20 backdrop-blur-sm flex flex-col items-center justify-center text-white p-8">
                     <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mb-4"></div>
                     <p className="text-xl font-bold">{processingStep}</p>
                     {progressPct > 0 && (
                       <div className="w-48 h-2 bg-white/30 rounded-full mt-3 overflow-hidden">
                         <div className="h-full bg-white rounded-full transition-all" style={{width: `${progressPct}%`}} />
                       </div>
                     )}
                  </div>
               )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
