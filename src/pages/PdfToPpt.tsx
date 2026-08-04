import React, { useState } from 'react';
import { Presentation, Scan, Globe, Zap, CheckCircle2, Download, RotateCcw, AlertTriangle } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';

type Stage = 'idle' | 'processing' | 'done' | 'error';

export default function PdfToPpt() {
  usePageSEO(
    'PDF to PPT Converter — Powerful Backend API',
    'Convert PDF to PowerPoint slides accurately using our Python AI backend.',
  );

  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleDrop = async (files: File[]) => {
    if (!files.length) return;
    const f = files[0];
    setFile(f);
    setResultUrl(null);
    setErrorMsg('');
    setStage('processing');

    try {
      const formData = new FormData();
      formData.append('file', f);
      // Optional: you can expose a dpi parameter, setting default to 150
      formData.append('dpi', '150');

      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const res = await fetch(`${API_BASE_URL}/convert/pdf-to-ppt`, {
        method: 'POST',
        body: formData,
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
    <div className="flex-1 w-full bg-gradient-to-br from-slate-50 to-orange-50 dark:from-slate-950 dark:to-slate-900 min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="text-center mb-10">
          <div className="w-14 h-14 bg-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-200 dark:shadow-orange-900 mx-auto mb-4">
            <Presentation className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-3">PDF to PowerPoint</h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
            Convert any PDF into a PowerPoint (.pptx) presentation. Each page becomes a slide with searchable text overlays.
          </p>
        </div>

        {stage === 'idle' && (
          <FileDropzone onDrop={handleDrop} multiple={false} title="Drop your PDF here" subtitle="Creates a high-quality PPTX" />
        )}

        {stage === 'processing' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center shadow-sm">
            <div className="w-16 h-16 rounded-full border-4 border-orange-200 dark:border-orange-900 border-t-orange-600 animate-spin mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Converting PDF to PPT…</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Rendering slides and extracting text overlays...</p>
          </div>
        )}

        {stage === 'done' && resultUrl && file && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-lg overflow-hidden">
            <div className="bg-emerald-50 dark:bg-emerald-950/40 px-6 py-5 border-b border-emerald-200 dark:border-emerald-800 flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              <div>
                <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-200">Conversion Complete!</h3>
                <p className="text-sm text-emerald-700 dark:text-emerald-400">Your slides are ready.</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <a href={resultUrl} download={file.name.replace(/\.pdf$/i, '') + '_converted.pptx'}
                className="flex items-center justify-center gap-2 w-full px-6 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all hover:scale-[1.01]">
                <Download className="w-5 h-5" /> Download PPTX File
              </a>
              <button onClick={reset}
                className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl border border-slate-200 dark:border-slate-700 transition-colors">
                <RotateCcw className="w-4 h-4" /> Convert Another File
              </button>
            </div>
          </div>
        )}

        {stage === 'error' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-red-200 dark:border-red-800 p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-red-800 dark:text-red-200">Conversion Failed</h3>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">{errorMsg}</p>
              </div>
            </div>
            <button onClick={reset} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium">
              <RotateCcw className="w-4 h-4" /> Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
