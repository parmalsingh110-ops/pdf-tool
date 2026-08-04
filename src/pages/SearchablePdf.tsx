import React, { useState } from 'react';
import { Search, Scan, Globe, Zap, CheckCircle2, Download, RotateCcw, AlertTriangle } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';

type Stage = 'idle' | 'processing' | 'done' | 'error';
type Lang = 'eng' | 'hin' | 'hin+eng';

export default function SearchablePdf() {
  usePageSEO(
    'Make PDF Searchable (OCR) — Powerful Backend API',
    'Convert scanned PDFs into text-searchable PDFs without changing their appearance.',
  );

  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [lang, setLang] = useState<Lang>('hin+eng');
  const [deskew, setDeskew] = useState(true);

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
      formData.append('lang', lang);
      formData.append('deskew', deskew ? 'true' : 'false');
      formData.append('rotate', 'true');

      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const res = await fetch(`${API_BASE_URL}/convert/make-searchable`, {
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
    <div className="flex-1 w-full bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900 min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="text-center mb-10">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 dark:shadow-blue-900 mx-auto mb-4">
            <Search className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-3">Make PDF Searchable</h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
            Run OCR to add a hidden text layer to your scanned PDFs, making them fully searchable and selectable.
          </p>
        </div>

        {stage === 'idle' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <span className="font-semibold text-slate-700 dark:text-slate-200 text-sm">Primary Language:</span>
                <div className="flex gap-2 w-full sm:w-auto">
                  {(['eng', 'hin', 'hin+eng'] as Lang[]).map(l => (
                    <button
                      key={l}
                      onClick={() => setLang(l)}
                      className={`px-4 py-2 text-sm font-medium rounded-lg flex-1 sm:flex-none capitalize transition-colors ${
                        lang === l ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 border' : 'bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-600'
                      }`}
                    >
                      {l === 'eng' ? 'English' : l === 'hin' ? 'Hindi' : 'Hindi + English'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="deskew" checked={deskew} onChange={e => setDeskew(e.target.checked)} className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500" />
                <label htmlFor="deskew" className="text-sm font-medium text-slate-700 dark:text-slate-300">Auto-deskew (Straighten crooked pages)</label>
              </div>
            </div>
            <FileDropzone onDrop={handleDrop} multiple={false} title="Drop your Scanned PDF here" subtitle="Uses OCRmyPDF for professional archiving quality" />
          </div>
        )}

        {stage === 'processing' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center shadow-sm">
            <div className="w-16 h-16 rounded-full border-4 border-blue-200 dark:border-blue-900 border-t-blue-600 animate-spin mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Running OCR Engine…</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Processing text and adding invisible searchable layer...</p>
          </div>
        )}

        {stage === 'done' && resultUrl && file && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-lg overflow-hidden">
            <div className="bg-emerald-50 dark:bg-emerald-950/40 px-6 py-5 border-b border-emerald-200 dark:border-emerald-800 flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              <div>
                <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-200">Searchable PDF Ready!</h3>
                <p className="text-sm text-emerald-700 dark:text-emerald-400">You can now select, copy, and search text in this PDF.</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <a href={resultUrl} download={file.name.replace(/\.pdf$/i, '') + '_searchable.pdf'}
                className="flex items-center justify-center gap-2 w-full px-6 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all hover:scale-[1.01]">
                <Download className="w-5 h-5" /> Download Searchable PDF
              </a>
              <button onClick={reset}
                className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl border border-slate-200 dark:border-slate-700 transition-colors">
                <RotateCcw className="w-4 h-4" /> Process Another File
              </button>
            </div>
          </div>
        )}

        {stage === 'error' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-red-200 dark:border-red-800 p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-red-800 dark:text-red-200">OCR Failed</h3>
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
