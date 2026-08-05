import React, { useState } from 'react';
import { Search, Download, Loader2 } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import BackendLoader from '../components/BackendLoader';

export default function SearchReplace() {
  usePageSEO(
    'PDF Search & Replace — Find and Replace Text in PDF',
    'Find and replace any text in your PDF files natively. Uses Python backend for perfect redaction and insertion.',
  );
  const [file, setFile] = useState<File | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = (files: File[]) => {
    if (files[0]) {
      setFile(files[0]);
      setResultUrl(null);
      setMatchCount(null);
      setError(null);
    }
  };

  const processSearchReplace = async () => {
    if (!file || !searchTerm.trim()) return;
    setBusy(true);
    setError(null);
    setMatchCount(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('search_term', searchTerm);
      formData.append('replace_term', replaceTerm);

      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const res = await fetch(`${API_BASE_URL}/search-replace`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Search and Replace failed on the server.');
      }

      const countHeader = res.headers.get('X-Match-Count');
      if (countHeader) setMatchCount(parseInt(countHeader, 10));

      const blob = await res.blob();
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      setError(e?.message || 'Search & Replace failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 min-h-screen">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <Search className="w-8 h-8" />
        </div>
        <h1 className="text-4xl font-bold text-slate-800 mb-4">Search & Replace</h1>
        <p className="text-xl text-slate-600 max-w-xl mx-auto">Find and replace text natively across your entire PDF. Uses Python backend for perfect redaction and insertion.</p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Search for</label>
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Text to find…"
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Replace with</label>
              <input
                type="text"
                value={replaceTerm}
                onChange={e => setReplaceTerm(e.target.value)}
                placeholder="Replacement text…"
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {error && <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg mb-4 text-sm">{error}</div>}
          {matchCount !== null && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4 font-medium">{matchCount} instances replaced.</p>}

          {busy && (
            <div className="mb-6">
              <BackendLoader
                title="Searching & Replacing…"
                accentColor="blue"
                steps={[
                  { icon: '📤', label: 'Uploading', detail: 'Sending your PDF to server...' },
                  { icon: '🔍', label: 'Searching', detail: 'Scanning every page for matches...' },
                  { icon: '✏️', label: 'Replacing', detail: 'Redacting old text and inserting new...' },
                  { icon: '💾', label: 'Saving', detail: 'Rebuilding the final PDF file...' },
                ]}
                tips={[
                  '🔍 Search is case-insensitive across all pages.',
                  '✏️ Replacement matches original font size perfectly.',
                  '📦 All matches across every page are replaced at once.',
                  '🔒 File is auto-deleted from server after download.',
                ]}
              />
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={processSearchReplace}
              disabled={busy || !searchTerm.trim()}
              className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
              {busy ? 'Processing…' : 'Search and Replace'}
            </button>
            <button onClick={() => { setFile(null); setResultUrl(null); setMatchCount(null); }} className="px-5 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200">Cancel</button>
          </div>

          {resultUrl && (
            <div className="mt-6 p-6 bg-green-50 rounded-xl border border-green-200 text-center animate-in fade-in">
              <h3 className="text-xl font-bold text-green-800 mb-3">Replacement Complete!</h3>
              <a href={resultUrl} download={`replaced_${file.name}`} className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 shadow-sm">
                <Download className="w-5 h-5" />
                Download Result PDF
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
