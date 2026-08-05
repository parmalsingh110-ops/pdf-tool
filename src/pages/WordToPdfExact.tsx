import React, { useState } from 'react';
import { FileText, CheckCircle2, Download, RotateCcw, AlertTriangle } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import BackendLoader from '../components/BackendLoader';
import { usePageSEO } from '../lib/usePageSEO';

type Stage = 'idle' | 'processing' | 'done' | 'error';

export default function WordToPdfExact() {
  usePageSEO(
    'Office to PDF Converter — Exact Formatting',
    'Convert Word, Excel, and PowerPoint files to PDF with 100% perfect formatting using our powerful backend.',
  );

  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

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

    setFile(f);
    setResultUrl(null);
    setErrorMsg('');
    setStage('processing');

    try {
      const formData = new FormData();
      formData.append('file', f);

      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const res = await fetch(`${API_BASE_URL}/convert/office-to-pdf`, {
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
    <div className="flex-1 w-full bg-gradient-to-br from-slate-50 to-indigo-50 dark:from-slate-950 dark:to-slate-900 min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="text-center mb-10">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-indigo-900 mx-auto mb-4">
            <FileText className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-3">Office to PDF</h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
            Convert Word, Excel, and PowerPoint files to PDF.
            Uses LibreOffice backend for 100% exact formatting preservation.
          </p>
        </div>

        {stage === 'idle' && (
          <FileDropzone onDrop={handleDrop} multiple={false} title="Drop your Office file here" subtitle="Supports .docx, .pptx, .xlsx, .doc, .ppt, .xls" />
        )}

        {stage === 'processing' && (
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
        )}

        {stage === 'done' && resultUrl && file && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-lg overflow-hidden">
            <div className="bg-emerald-50 dark:bg-emerald-950/40 px-6 py-5 border-b border-emerald-200 dark:border-emerald-800 flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              <div>
                <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-200">Conversion Complete!</h3>
                <p className="text-sm text-emerald-700 dark:text-emerald-400">Your perfectly formatted PDF is ready.</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <a href={resultUrl} download={file.name.replace(/\.[^/.]+$/, '') + '.pdf'}
                className="flex items-center justify-center gap-2 w-full px-6 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all hover:scale-[1.01]">
                <Download className="w-5 h-5" /> Download PDF File
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
