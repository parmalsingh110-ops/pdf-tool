import React, { useState } from 'react';
import { FileText, Scan, Globe, Zap, CheckCircle2, Download, RotateCcw, AlertTriangle } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import BackendLoader from '../components/BackendLoader';
import { usePageSEO } from '../lib/usePageSEO';

type Stage = 'idle' | 'processing' | 'done' | 'error';

export default function PdfToWord() {
  usePageSEO(
    'PDF to Word Converter — Powerful Backend API',
    'Convert any PDF to Word DOCX with perfect layout, tables, and images preserved using our powerful Python AI backend.',
  );

  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [forceOcr, setForceOcr] = useState(true);

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
      formData.append('force_ocr', forceOcr ? 'true' : 'false');

      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const res = await fetch(`${API_BASE_URL}/convert/pdf-to-word`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Conversion failed on the server.');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setStage('done');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'An unexpected error occurred.');
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
    <div className="flex-1 w-full bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900 min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 dark:shadow-blue-900 mx-auto mb-4">
            <FileText className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-3">PDF to Word</h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
            Convert any PDF into a perfectly formatted Word document.
            Auto-Detects scanned PDFs and applies OCR magically.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-5">
            {[{ icon: Scan, t: 'Auto OCR' }, { icon: Globe, t: 'Tables Preserved' }, { icon: Zap, t: 'Images Retained' }].map(({ icon: Icon, t }) => (
              <span key={t} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm">
                <Icon className="w-3.5 h-3.5 text-blue-500" />{t}
              </span>
            ))}
          </div>
        </div>

        {stage === 'idle' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-3">
              <input type="checkbox" id="forceOcr" checked={forceOcr} onChange={e => setForceOcr(e.target.checked)} className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500" />
              <label htmlFor="forceOcr" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Force OCR (Check this if your PDF is a scanned document but still outputs as an image)
              </label>
            </div>
            <FileDropzone onDrop={handleDrop} multiple={false} title="Drop your PDF here" subtitle="Uses powerful Python backend for perfect formatting" />
          </div>
        )}

        {stage === 'processing' && (
          <BackendLoader
            title="Converting PDF to Word…"
            accentColor="blue"
            steps={[
              { icon: '📤', label: 'Uploading', detail: 'Sending your PDF securely...' },
              { icon: '🔍', label: 'Analyzing', detail: 'Detecting tables, fonts & layouts...' },
              { icon: '⚙️', label: 'Converting', detail: 'pdf2docx engine extracting content...' },
              { icon: '📄', label: 'Packaging', detail: 'Finalizing your .docx file...' },
            ]}
            tips={[
              '💡 Native PDFs preserve tables & images perfectly.',
              '🔍 Scanned PDFs are auto-detected and OCR is applied.',
              '⚡ Powered by pdf2docx — the most accurate Python library.',
              '🔒 Your file is never stored — deleted right after download.',
              '📊 Multi-column layouts and headers are preserved.',
            ]}
          />
        )}

        {stage === 'done' && resultUrl && file && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-lg overflow-hidden">
            <div className="bg-emerald-50 dark:bg-emerald-950/40 px-6 py-5 border-b border-emerald-200 dark:border-emerald-800 flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              <div>
                <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-200">Conversion Complete!</h3>
                <p className="text-sm text-emerald-700 dark:text-emerald-400">Your perfect DOCX is ready.</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <a href={resultUrl} download={file.name.replace(/\.pdf$/i, '') + '_converted.docx'}
                className="flex items-center justify-center gap-2 w-full px-6 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all hover:scale-[1.01]">
                <Download className="w-5 h-5" /> Download Word File (.docx)
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
