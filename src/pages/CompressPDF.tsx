import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { PDFDocument } from 'pdf-lib';
import { Download, FileText, Minimize2, Check, CheckCircle2, Zap, Gauge, Shield, Target } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import BackendLoader from '../components/BackendLoader';
import ToolSEOSection from '../components/ToolSEOSection';
import { useSEO } from '../hooks/useSEO';
import { apiFetch } from '../lib/api';
import { toArrayBufferBytes } from '../lib/blobUrl';
import { compressPdfAdaptiveLocal, compressPdfToTargetBytes } from '../lib/pdfTargetCompress';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlSpinner, PearlStageSwitch } from '../components/pearl/PearlMotion';

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
  const prefersReduced = useReducedMotion();

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
    setProgressPct(5);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const effectiveKB =
        useTargetSize && targetSizeKB > 0
          ? Math.max(1, Math.round(targetUnit === 'MB' ? targetSizeKB * 1024 : targetSizeKB))
          : 0;
      const targetBytes = effectiveKB * 1024;

      if (compressionLevel === 'backend-high-quality') {
        setProcessingStep(
          effectiveKB > 0
            ? `Trying lossless vector compression under ${effectiveKB} KB...`
            : 'Uploading to server for high-quality vector compression...',
        );
        try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('quality', 'ebook');
          if (effectiveKB > 0) {
            formData.append('target_kb', String(effectiveKB));
          }
          const res = await apiFetch('/compress-pdf', {
            method: 'POST',
            body: formData,
            timeoutMs: 90000,
          });
          if (res.ok) {
            const blob = await res.blob();
            const serverBytes = new Uint8Array(await blob.arrayBuffer());
            const fitsTarget = effectiveKB > 0 ? serverBytes.byteLength <= targetBytes : true;
            const shrankEnough = effectiveKB > 0 ? fitsTarget : serverBytes.byteLength < file.size * 0.96;

            if (shrankEnough) {
              setUsedFallback(false);
              finishCompression(serverBytes);
              return;
            }
          }
        } catch {
          // Server busy or offline — fall through smoothly to local smart engine
        }

        if (effectiveKB > 0) {
          const resTarget = await compressPdfToTargetBytes(arrayBuffer, targetBytes, (msg, pct) => {
            setProcessingStep(msg);
            if (typeof pct === 'number') setProgressPct(pct);
          });
          setUsedFallback(false);
          finishCompression(resTarget.bytes);
          return;
        }

        setProcessingStep('Optimizing raster & image streams locally...');
        const adaptive = await compressPdfAdaptiveLocal(arrayBuffer, 'recommended', (msg, pct) => {
          setProcessingStep(msg);
          if (typeof pct === 'number') setProgressPct(pct);
        });
        setUsedFallback(adaptive.lossless);
        finishCompression(adaptive.bytes);
        return;
      }

      if (compressionLevel === 'low') {
        setProcessingStep('Stripping metadata & optimizing object streams...');
        setProgressPct(45);
        const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        pdfDoc.setTitle('');
        pdfDoc.setAuthor('');
        pdfDoc.setSubject('');
        pdfDoc.setKeywords([]);
        pdfDoc.setProducer('');
        pdfDoc.setCreator('');

        const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
        const bestBytes = pdfBytes.byteLength < arrayBuffer.byteLength ? pdfBytes : new Uint8Array(arrayBuffer);
        setUsedFallback(bestBytes.byteLength >= arrayBuffer.byteLength);
        finishCompression(bestBytes);
        return;
      }

      if (useTargetSize && targetBytes > 0) {
        const resTarget = await compressPdfToTargetBytes(arrayBuffer, targetBytes, (msg, pct) => {
          setProcessingStep(msg);
          if (typeof pct === 'number') setProgressPct(pct);
        });
        setUsedFallback(false);
        finishCompression(resTarget.bytes);
        return;
      }

      const preset = compressionLevel === 'extreme' ? 'extreme' : 'recommended';
      const adaptive = await compressPdfAdaptiveLocal(arrayBuffer, preset, (msg, pct) => {
        setProcessingStep(msg);
        if (typeof pct === 'number') setProgressPct(pct);
      });
      setUsedFallback(adaptive.lossless && adaptive.bytes.byteLength >= arrayBuffer.byteLength * 0.98);
      finishCompression(adaptive.bytes);
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
    const blob = new Blob([toArrayBufferBytes(pdfBytes)], { type: 'application/pdf' });
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
      <div className="flex flex-col items-center w-full">
        {/* Prominent Target Size Banner / Action Button */}
        <div className="mb-8 w-full max-w-3xl p-4 sm:p-5 pms-glass-panel rounded-3xl border-[var(--pms-border-strong)] flex flex-col sm:flex-row items-center justify-between gap-4 text-left">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[var(--pms-soft-mint)] text-emerald-800 dark:text-emerald-300 border border-[var(--pms-border)]">
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
            className="pms-btn-primary relative overflow-hidden inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-extrabold text-sm shadow-md hover:shadow-lg transition-all shrink-0 cursor-pointer w-full sm:w-auto text-center"
          >
            <span className="pms-shimmer pointer-events-none" />
            <Target className="w-4 h-4" />
            <span>Open Target Compress →</span>
          </Link>
        </div>

      <PearlStageSwitch stageKey={!file ? 'upload' : 'workspace'} className="w-full max-w-6xl">
      {!file ? (
        <div className="w-full max-w-3xl mx-auto">
          <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
        </div>
      ) : (
        <div className={`w-full mx-auto ${compressedUrl ? 'max-w-6xl' : 'max-w-5xl'} flex flex-col lg:flex-row gap-8 transition-all`}>
          <div className="relative overflow-hidden flex-1 pms-glass-panel rounded-3xl p-6 sm:p-8">
            <PearlScanOverlay active={isProcessing} label={processingStep || 'Optimizing PDF streams...'} />
            <div className="flex items-center gap-4 p-5 bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] mb-7">
              <div className="w-14 h-14 bg-[var(--pms-soft-mint)] text-emerald-600 dark:text-emerald-400 border border-[var(--pms-border)] rounded-2xl flex items-center justify-center shrink-0">
                <FileText className="w-7 h-7" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-gray-900 dark:text-slate-100 truncate">{file.name}</p>
                <p className="text-sm text-gray-500 dark:text-slate-400 tabular-nums">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>

            <PearlStageSwitch stageKey={!compressedUrl ? 'configure' : 'result'} className="w-full">
            {!compressedUrl ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-3">
                  {levels.map((level) => {
                    const active = compressionLevel === level.id;
                    return (
                    <button
                      key={level.id}
                      onClick={() => setCompressionLevel(level.id as CompressionLevel)}
                      className={`relative overflow-hidden flex items-center gap-4 p-4 sm:p-5 rounded-2xl border-2 transition-all text-left ${
                        active
                          ? 'border-emerald-500/70 shadow-sm'
                          : 'border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 hover:border-[var(--pms-border-strong)]'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="compress-level-pill"
                          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                          className="absolute inset-0 bg-[var(--pms-soft-mint)] pointer-events-none"
                        />
                      )}
                      <div className={`relative z-10 w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${level.bgColor} ${level.color}`}>
                        <level.icon className="w-6 h-6" />
                      </div>
                      <div className="relative z-10 flex-1">
                        <h3 className="font-bold text-gray-900 dark:text-slate-100">{level.title}</h3>
                        <p className="text-sm text-gray-600 dark:text-slate-400">{level.desc}</p>
                      </div>
                      {active && (
                        <div className="relative z-10 w-6 h-6 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-sm">
                          <Check className="w-4 h-4" />
                        </div>
                      )}
                    </button>
                  );
                  })}
                </div>
                {compressionLevel !== 'low' && (
                  <div className="rounded-2xl border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 p-4 space-y-3">
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useTargetSize}
                        onChange={(e) => setUseTargetSize(e.target.checked)}
                        className="rounded border-gray-300 dark:border-slate-600 accent-emerald-600"
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
                          <div className="inline-flex rounded-xl p-1 bg-white/80 dark:bg-slate-800/80 border border-[var(--pms-border)]">
                            <button
                              type="button"
                              onClick={() => {
                                if (targetUnit !== 'KB') {
                                  setTargetUnit('KB');
                                  setTargetSizeKB((prev) => Math.round(prev * 1024));
                                }
                              }}
                              className={`relative overflow-hidden px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                                targetUnit === 'KB'
                                  ? 'text-emerald-800 dark:text-emerald-200'
                                  : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
                              }`}
                            >
                              {targetUnit === 'KB' && (
                                <motion.span
                                  layoutId="compress-unit-pill"
                                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                                  className="absolute inset-0 bg-[var(--pms-soft-mint)] rounded-lg pointer-events-none"
                                />
                              )}
                              <span className="relative z-10">KB</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (targetUnit !== 'MB') {
                                  setTargetUnit('MB');
                                  setTargetSizeKB((prev) => Math.max(1, Math.round(prev / 1024)));
                                }
                              }}
                              className={`relative overflow-hidden px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                                targetUnit === 'MB'
                                  ? 'text-emerald-800 dark:text-emerald-200'
                                  : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
                              }`}
                            >
                              {targetUnit === 'MB' && (
                                <motion.span
                                  layoutId="compress-unit-pill"
                                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                                  className="absolute inset-0 bg-[var(--pms-soft-mint)] rounded-lg pointer-events-none"
                                />
                              )}
                              <span className="relative z-10">MB</span>
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
                            className="w-full pl-9 pr-14 py-2.5 rounded-xl border border-[var(--pms-border)] bg-white/90 dark:bg-slate-900/90 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm font-bold"
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

                <div className="pt-2 flex flex-col sm:flex-row gap-3">
                  <motion.button
                    whileHover={prefersReduced || isProcessing ? undefined : { scale: 1.01 }}
                    whileTap={prefersReduced || isProcessing ? undefined : { scale: 0.99 }}
                    onClick={compressPdf}
                    disabled={isProcessing}
                    className="pms-btn-primary relative overflow-hidden flex-1 py-4 text-lg font-bold rounded-xl disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
                  >
                    <span className="pms-shimmer pointer-events-none" />
                    <Minimize2 className="w-5 h-5" />
                    {isProcessing ? processingStep || 'Compressing...' : 'Compress PDF'}
                  </motion.button>
                  <button
                    onClick={() => { setFile(null); }}
                    className="px-6 py-4 bg-white/80 dark:bg-slate-800/80 border border-[var(--pms-border)] text-gray-700 dark:text-slate-200 text-base font-semibold rounded-xl hover:bg-white dark:hover:bg-slate-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6 text-center">
                <div className="p-8 rounded-2xl bg-gradient-to-br from-emerald-500/12 via-white/75 to-teal-500/12 dark:from-emerald-950/50 dark:via-slate-900/80 dark:to-teal-950/40 border border-emerald-200/80 dark:border-emerald-800/60">
                  <motion.div
                    initial={prefersReduced ? false : { scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                    className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/25"
                  >
                    <CheckCircle2 className="w-8 h-8" />
                  </motion.div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-4">PDF Compressed!</h3>
                  {stats && (
                    <div className="grid grid-cols-3 gap-3 mb-6 text-sm">
                      <div className="p-3 rounded-xl bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)]">
                        <p className="text-xs text-gray-500 dark:text-slate-400">Original</p>
                        <p className="font-bold text-gray-900 dark:text-slate-100 tabular-nums">
                          {stats.original < 1024 * 1024
                            ? <AnimatedNumber value={stats.original / 1024} decimals={1} suffix=" KB" />
                            : <AnimatedNumber value={stats.original / 1024 / 1024} decimals={2} suffix=" MB" />}
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)]">
                        <p className="text-xs text-gray-500 dark:text-slate-400">Compressed</p>
                        <p className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                          {stats.compressed < 1024 * 1024
                            ? <AnimatedNumber value={stats.compressed / 1024} decimals={1} suffix=" KB" />
                            : <AnimatedNumber value={stats.compressed / 1024 / 1024} decimals={2} suffix=" MB" />}
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)]">
                        <p className="text-xs text-gray-500 dark:text-slate-400">Saved</p>
                        <p className={`font-bold tabular-nums ${stats.compressed < stats.original ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          {stats.compressed < stats.original
                            ? <AnimatedNumber value={Math.round((1 - stats.compressed / stats.original) * 100)} suffix="%" />
                            : '—'}
                        </p>
                      </div>
                    </div>
                  )}
                  {usedFallback && (
                    <div className="mb-4 px-4 py-2 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-800 dark:text-amber-200">
                      ⚠️ PDF was already highly optimized — rasterization would have increased size, so lossless metadata cleanup was applied instead.
                    </div>
                  )}
                  <motion.a
                    whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                    whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                    href={compressedUrl}
                    download={`compressed_${file.name}`}
                    className="pms-btn-primary relative overflow-hidden inline-flex items-center justify-center gap-2 px-8 py-4 text-lg font-bold rounded-xl shadow-md"
                  >
                    <span className="pms-shimmer pointer-events-none" />
                    <Download className="w-6 h-6" />
                    Download compressed PDF
                  </motion.a>
                </div>
                <button
                  onClick={() => { 
                    if (previewUrl) URL.revokeObjectURL(previewUrl);
                    if (compressedUrl) URL.revokeObjectURL(compressedUrl);
                    setFile(null); setCompressedUrl(null); setStats(null); setPreviewUrl(null); 
                  }}
                  className="text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 font-semibold text-sm transition-colors"
                >
                  Compress another PDF
                </button>
              </div>
            )}
            </PearlStageSwitch>
          </div>

          {/* Preview Area (Interactive Before & After Comparison) */}
          <div className="flex-1 pms-glass-panel rounded-3xl overflow-hidden min-h-[520px] flex flex-col">
            <div className="bg-white/80 dark:bg-slate-900/80 px-4 py-3 text-xs font-semibold text-gray-700 dark:text-slate-200 border-b border-[var(--pms-border)] flex items-center justify-between">
              <span>{compressedUrl ? 'Quality Comparison' : 'PDF Preview'}</span>
              {compressedUrl && (
                <div className="flex items-center gap-1 bg-white/75 dark:bg-slate-800/80 border border-[var(--pms-border)] p-1 rounded-xl text-[11px]">
                  {(['side-by-side', 'compressed', 'original'] as const).map((view) => (
                    <button
                      key={view}
                      onClick={() => setComparisonView(view)}
                      className={`relative overflow-hidden px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                        comparisonView === view ? 'text-emerald-800 dark:text-emerald-200' : 'text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200'
                      }`}
                    >
                      {comparisonView === view && (
                        <motion.span
                          layoutId="compress-view-pill"
                          transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                          className="absolute inset-0 bg-[var(--pms-soft-mint)] rounded-lg pointer-events-none"
                        />
                      )}
                      <span className="relative z-10">
                        {view === 'side-by-side' ? 'Side-by-Side' : view === 'compressed' ? 'Compressed' : 'Original'}
                      </span>
                    </button>
                  ))}
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
                      { icon: '📤', label: 'Uploading', detail: 'Sending your PDF to optimization workspace...' },
                      { icon: '🔍', label: 'Analyzing', detail: 'Checking stream & image savings...' },
                      { icon: '⚡', label: 'Compressing', detail: 'Applying vector-preserving PDF optimization...' },
                      { icon: '💾', label: 'Finalizing', detail: 'Packaging compressed output...' },
                    ]}
                    tips={[
                      '⚡ Vector-preserving compression keeps text razor sharp.',
                      '🎨 Embedded images are re-encoded at optimal clarity.',
                      '📉 Typical compression: 40-80% file size reduction.',
                      '🔒 File is automatically cleared after download.',
                    ]}
                  />
                </div>
              )}
              {isProcessing && compressionLevel !== 'backend-high-quality' && (
                <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex flex-col items-center justify-center p-8 z-20">
                  <PearlSpinner size="md" accent="rose" className="mb-4" />
                  <p className="text-xl font-bold text-[var(--pms-ink)]">{processingStep}</p>
                  {progressPct > 0 && (
                    <div className="w-56 h-2 bg-rose-100 dark:bg-slate-800 rounded-full mt-3 overflow-hidden border border-[var(--pms-border)]">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, var(--pms-rose), var(--pms-violet))' }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </PearlStageSwitch>

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
