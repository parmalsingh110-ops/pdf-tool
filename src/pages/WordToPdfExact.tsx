import { useState, useEffect } from 'react';
import { FileText, CheckCircle2, Download, RotateCcw, AlertTriangle } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import FileDropzone from '../components/FileDropzone';
import BackendLoader from '../components/BackendLoader';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { PearlStageSwitch, PearlScanOverlay } from '../components/pearl/PearlMotion';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { apiFetch } from '../lib/api';

type Stage = 'idle' | 'processing' | 'done' | 'error';

export default function WordToPdfExact() {
  useSEO('Word To Pdf Exact Online Free | PDF Media Suite', 'Free online Word To Pdf Exact tool. No signup or installation required.');

  usePageSEO(
    'Office to PDF Converter — Exact Formatting',
    'Convert Word, Excel, and PowerPoint files to PDF with 100% perfect formatting using our powerful backend.',
  );

  const prefersReduced = useReducedMotion();

  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  const handleDrop = async (files: File[]) => {
    if (!files.length) return;
    const f = files[0];

    // Check if it's an office file
    const ext = f.name.split('.').pop()?.toLowerCase();
    const validExts = ['docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'odt', 'odp'];
    if (!ext || !validExts.includes(ext)) {
      setErrorMsg('Please upload a valid Office file (.docx, .pptx, .xlsx, etc.)');
      setStage('error');
      return;
    }

    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFile(f);
    setResultUrl(null);
    setErrorMsg('');
    setStage('processing');

    try {
      const formData = new FormData();
      formData.append('file', f);

      const res = await apiFetch('/convert/office-to-pdf', {
        method: 'POST',
        body: formData,
        timeoutMs: 90000,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Conversion failed on the server.');
      }

      const blob = await res.blob();
      setResultUrl(URL.createObjectURL(blob));
      setStage('done');
    } catch (e: any) {
      setErrorMsg(e?.message || 'Failed to connect to the backend server. Is it running?');
      setStage('error');
    }
  };

  const reset = () => {
    setFile(null);
    setStage('idle');
    setResultUrl(null);
    setErrorMsg('');
  };

  return (
    <ToolWorkspaceShell
      title="Office to PDF"
      subtitle="Convert Word, Excel, and PowerPoint files to PDF using LibreOffice for 100% exact formatting preservation."
      categoryLabel="Convert to PDF"
      icon={FileText}
      microVariant="convert"
      tone="indigo"
      trustNote="LibreOffice exact layout engine • Files deleted immediately after conversion"
    >
      <div className="max-w-3xl mx-auto">
        <PearlStageSwitch stageKey={stage}>
          {stage === 'idle' && (
            <div className="pms-glass-panel rounded-3xl p-4 sm:p-6">
              <FileDropzone
                onDrop={handleDrop}
                multiple={false}
                title="Drop your Office file here"
                subtitle="Supports .docx, .pptx, .xlsx, .doc, .ppt, .xls, .odt, .odp"
              />
            </div>
          )}

          {stage === 'processing' && (
            <div className="pms-glass-panel rounded-3xl p-4 sm:p-6 relative overflow-hidden">
              <PearlScanOverlay active label="Rendering pixel-perfect PDF via LibreOffice..." />
              <BackendLoader
                title="Converting to PDF…"
                accentColor="indigo"
                steps={[
                  { icon: '📤', label: 'Uploading', detail: 'Sending your Office file to server...' },
                  { icon: '📚', label: 'Loading', detail: 'LibreOffice engine initializing...' },
                  { icon: '🖨️', label: 'Rendering', detail: 'Rendering to pixel-perfect PDF...' },
                  { icon: '🎯', label: 'Done', detail: 'Packaging your PDF output...' },
                ]}
                tips={[
                  '📚 LibreOffice preserves 100% of your original formatting.',
                  '📄 Supports .docx .pptx .xlsx .doc .ppt .xls .odt and more.',
                  '⚡ Same engine used by enterprise PDF workflows globally.',
                  '🔒 File is deleted from server immediately after download.',
                  '🎨 Fonts, tables, images — everything rendered precisely.',
                ]}
              />
            </div>
          )}

          {stage === 'done' && resultUrl && file && (
            <div className="pms-glass-panel rounded-3xl overflow-hidden border border-emerald-200/80 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/25 shadow-lg">
              <div className="px-6 py-5 border-b border-emerald-200/70 dark:border-emerald-800/50 flex items-center gap-4">
                <motion.div
                  initial={prefersReduced ? false : { scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 24 }}
                  className="w-12 h-12 rounded-2xl bg-emerald-500/15 dark:bg-emerald-500/20 border border-emerald-300/60 dark:border-emerald-700/60 flex items-center justify-center shrink-0"
                >
                  <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                </motion.div>
                <div className="min-w-0">
                  <h3 className="text-xl font-bold text-emerald-950 dark:text-emerald-100">Conversion Complete!</h3>
                  <p className="text-sm text-emerald-700 dark:text-emerald-300 truncate">
                    {file.name.replace(/\.[^/.]+$/, '')}.pdf is ready for download.
                  </p>
                </div>
              </div>
              <div className="p-6 space-y-3 bg-white/60 dark:bg-slate-900/50">
                <a
                  href={resultUrl}
                  download={file.name.replace(/\.[^/.]+$/, '') + '.pdf'}
                  className="pms-btn-primary flex items-center justify-center gap-2 w-full px-6 py-4 rounded-xl font-bold"
                >
                  <Download className="w-5 h-5" /> Download PDF File
                </a>
                <button
                  type="button"
                  onClick={reset}
                  className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-white/80 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold rounded-xl border border-slate-200/80 dark:border-slate-700 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" /> Convert Another File
                </button>
              </div>
            </div>
          )}

          {stage === 'error' && (
            <div className="pms-glass-panel rounded-3xl border border-rose-200/80 dark:border-rose-800/60 bg-rose-50/60 dark:bg-rose-950/20 p-6 sm:p-8">
              <div className="flex items-start gap-3.5 mb-5">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                </div>
                <div>
                  <h3 className="font-bold text-rose-900 dark:text-rose-200 text-lg">Conversion Failed</h3>
                  <p className="text-sm text-rose-700 dark:text-rose-300 mt-1">{errorMsg}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/90 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <RotateCcw className="w-4 h-4" /> Try again
              </button>
            </div>
          )}
        </PearlStageSwitch>
      </div>
    </ToolWorkspaceShell>
  );
}
