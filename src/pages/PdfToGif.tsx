import { useState } from 'react';
import { ImageIcon, Download, Loader2, CheckCircle2, FileText, RotateCcw } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { encode } from 'modern-gif';
import FileDropzone from '../components/FileDropzone';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { PearlStageSwitch, PearlScanOverlay } from '../components/pearl/PearlMotion';
import { useSEO } from '../hooks/useSEO';
import { useAutoRevokeUrl } from '../lib/blobUrl';

const SCALE_OPTIONS = [
  { value: 0.5, label: '50% (Fast)' },
  { value: 0.75, label: '75%' },
  { value: 1.0, label: '100%' },
  { value: 1.5, label: '150% (HD)' },
];

export default function PdfToGif() {
  useSEO('Pdf To Gif Online Free | PDF Media Suite', 'Free online Pdf To Gif tool. No signup or installation required.');

  const prefersReduced = useReducedMotion();

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [delay, setDelay] = useState(1000);
  const [scale, setScale] = useState(1.0);

  useAutoRevokeUrl(resultUrl);

  const handleDrop = (files: File[]) => {
    if (files[0]) {
      setFile(files[0]);
      setResultUrl(null);
      setProgress('');
    }
  };

  const process = async () => {
    if (!file) return;
    setBusy(true);
    setProgress('Loading PDF…');
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const frames: { data: Uint8ClampedArray; width: number; height: number }[] = [];

      // Determine uniform size from first page
      const firstPage = await pdf.getPage(1);
      const firstVp = firstPage.getViewport({ scale });
      const targetW = Math.round(firstVp.width);
      const targetH = Math.round(firstVp.height);

      for (let p = 1; p <= pdf.numPages; p++) {
        setProgress(`Rendering page ${p} of ${pdf.numPages}…`);
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
        const imageData = ctx.getImageData(0, 0, targetW, targetH);
        frames.push({ data: imageData.data, width: targetW, height: targetH });
        canvas.width = 0;
        canvas.height = 0;
      }

      setProgress('Encoding GIF…');
      const gifFrames = frames.map((f) => ({
        data: f.data,
        delay: delay,
      }));

      const output = await encode({
        width: targetW,
        height: targetH,
        frames: gifFrames,
      });

      const blob = new Blob([output], { type: 'image/gif' });
      setResultUrl(URL.createObjectURL(blob));
      setProgress('Done!');
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'GIF creation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="PDF to GIF"
      subtitle="Create a smooth animated GIF from your PDF pages with custom frame timing and export resolution."
      categoryLabel="Convert from PDF"
      icon={ImageIcon}
      microVariant="convert"
      tone="violet"
      trustNote="100% browser-based Canvas + GIF encoding • Nothing leaves your device"
    >
      <div className="max-w-2xl mx-auto">
        <PearlStageSwitch stageKey={!file ? 'upload' : 'workspace'}>
          {!file ? (
            <div className="pms-glass-panel rounded-3xl p-4 sm:p-6">
              <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
            </div>
          ) : (
            <div className="pms-glass-panel rounded-3xl p-6 sm:p-8 space-y-6 relative overflow-hidden">
              <PearlScanOverlay active={busy} label={progress || 'Encoding animated GIF...'} />

              {/* Selected File Row */}
              <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-white/75 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-700/70">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/10 dark:bg-violet-500/20 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{file.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setResultUrl(null);
                    setProgress('');
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Change
                </button>
              </div>

              {/* Options */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                    Delay per page (ms)
                  </label>
                  <input
                    type="number"
                    value={delay}
                    min={200}
                    max={5000}
                    step={100}
                    onChange={(e) => setDelay(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-violet-500/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    Render Scale
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {SCALE_OPTIONS.map((opt) => {
                      const active = scale === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setScale(opt.value)}
                          className={`relative px-3 py-2.5 rounded-xl text-xs font-bold transition-colors border ${
                            active
                              ? 'text-violet-900 dark:text-violet-100 border-violet-300 dark:border-violet-700'
                              : 'bg-white/70 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="gif-scale-pill"
                              transition={
                                prefersReduced
                                  ? { duration: 0 }
                                  : { type: 'spring', stiffness: 420, damping: 32 }
                              }
                              className="absolute inset-0 rounded-xl bg-violet-50 dark:bg-violet-950/50 -z-0"
                            />
                          )}
                          <span className="relative z-10">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {progress && (
                <p className="text-sm font-medium text-violet-700 dark:text-violet-300 bg-violet-50/90 dark:bg-violet-950/40 border border-violet-200/70 dark:border-violet-800/60 rounded-xl px-4 py-2.5">
                  {progress}
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={process}
                  disabled={busy}
                  className="pms-btn-primary flex-1 py-3.5 px-6 font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
                  {busy ? 'Creating GIF…' : 'Convert to GIF'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setResultUrl(null);
                    setProgress('');
                  }}
                  className="px-5 py-3.5 bg-white/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 font-semibold rounded-xl border border-slate-200/80 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors inline-flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" /> Cancel
                </button>
              </div>

              {resultUrl && (
                <div className="rounded-2xl border border-emerald-200/80 dark:border-emerald-800/60 bg-emerald-50/75 dark:bg-emerald-950/25 p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <motion.div
                      initial={prefersReduced ? false : { scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 360, damping: 24 }}
                      className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-300/60 dark:border-emerald-700/60 flex items-center justify-center shrink-0"
                    >
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                    </motion.div>
                    <div>
                      <h3 className="text-base font-bold text-emerald-950 dark:text-emerald-100">GIF Ready!</h3>
                      <p className="text-xs text-emerald-700 dark:text-emerald-300">
                        Preview your animated PDF frames below.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900 max-h-[400px] flex items-center justify-center p-2">
                    <img src={resultUrl} alt="Generated GIF" className="max-w-full max-h-[380px] object-contain" />
                  </div>
                  <a
                    href={resultUrl}
                    download={`${file.name.replace(/\.[^/.]+$/, '')}.gif`}
                    className="pms-btn-primary w-full inline-flex items-center justify-center gap-2 py-3.5 px-6 font-bold rounded-xl"
                  >
                    <Download className="w-5 h-5" /> Download GIF
                  </a>
                </div>
              )}
            </div>
          )}
        </PearlStageSwitch>
      </div>
    </ToolWorkspaceShell>
  );
}
