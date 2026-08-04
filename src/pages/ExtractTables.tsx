import React, { useState } from 'react';
import { FileCode, Download, Loader2 } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';

export default function ExtractTables() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleDrop = async (files: File[]) => {
    if (files[0]) { 
      setFile(files[0]); 
      setResultUrl(null); 
      setErrorMsg('');
      setBusy(true);

      try {
        const formData = new FormData();
        formData.append('file', files[0]);
        const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const res = await fetch(`${API_BASE_URL}/extract-tables`, {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(err || 'Failed to extract tables');
        }

        const blob = await res.blob();
        setResultUrl(URL.createObjectURL(blob));
      } catch (e: any) {
        setErrorMsg(e?.message || 'Failed to extract tables. The PDF might not contain any valid tabular structures.');
      } finally {
        setBusy(false);
      }
    }
  };

  const reset = () => {
    setFile(null);
    setResultUrl(null);
    setErrorMsg('');
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 min-h-screen">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <FileCode className="w-8 h-8" />
        </div>
        <h1 className="text-4xl font-bold text-slate-800 mb-2">Extract Tables to Excel</h1>
        <p className="text-slate-600">Uses powerful Python Backend (Camelot) to perfectly extract tables with exact borders into an .xlsx file.</p>
      </div>

      {!file && !busy && (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Drop your PDF here" subtitle="We'll extract all tables into an Excel file" />
      )}

      {busy && (
        <div className="flex flex-col items-center p-12">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">Analyzing PDF Structure...</h2>
          <p className="text-slate-500">Detecting table lines and extracting data perfectly</p>
        </div>
      )}

      {errorMsg && (
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center max-w-md">
            <p className="text-red-700 font-semibold mb-4">{errorMsg}</p>
            <button onClick={reset} className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">Try another file</button>
        </div>
      )}

      {resultUrl && (
        <div className="w-full max-w-3xl bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
            <h2 className="text-2xl font-bold text-slate-800 mb-4">Extraction Complete!</h2>
            <p className="text-slate-600 mb-8">We found tables in your document. They have been saved into a perfectly formatted Excel spreadsheet.</p>
            <div className="flex justify-center gap-4">
                <a href={resultUrl} download={`tables_${file?.name.replace('.pdf', '')}.xlsx`} className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 flex items-center gap-2">
                    <Download className="w-5 h-5" /> Download Excel (.xlsx)
                </a>
                <button onClick={reset} className="px-8 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 border border-slate-300">Convert Another</button>
            </div>
        </div>
      )}
    </div>
  );
}
