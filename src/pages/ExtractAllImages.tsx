import React, { useState } from 'react';
import { ImageIcon, Download, Loader2, Package } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import BackendLoader from '../components/BackendLoader';

export default function ExtractAllImages() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = (files: File[]) => {
    if (files[0]) {
      setFile(files[0]);
      setResultUrl(null);
      setError(null);
    }
  };

  const extractImages = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const res = await fetch(`${API_BASE_URL}/extract-images`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to extract images from server.');
      }

      const blob = await res.blob();
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      setError(e?.message || 'Extraction failed.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResultUrl(null);
    setError(null);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 min-h-screen">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <ImageIcon className="w-8 h-8" />
        </div>
        <h1 className="text-4xl font-bold text-slate-800 mb-2">Extract All Images</h1>
        <p className="text-slate-600 max-w-xl mx-auto">Extracts every single embedded image from your PDF in its original, untouched resolution.</p>
      </div>

      {!file && !busy && (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Drop your PDF here" subtitle="Extract original quality images into a ZIP file" />
      )}

      {file && !resultUrl && !busy && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-lg w-full text-center">
          <p className="text-slate-600 font-medium mb-6">Ready to extract images from: {file.name}</p>
          <button onClick={extractImages} className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 w-full flex justify-center items-center gap-2">
            <ImageIcon className="w-5 h-5" /> Extract Images
          </button>
        </div>
      )}

      {busy && (
        <BackendLoader
          title="Extracting Images…"
          accentColor="indigo"
          steps={[
            { icon: '📤', label: 'Uploading', detail: 'Sending your PDF to server...' },
            { icon: '🔍', label: 'Scanning', detail: 'Identifying all embedded image objects...' },
            { icon: '🖼️', label: 'Extracting', detail: 'Pulling images at original quality...' },
            { icon: '📦', label: 'Zipping', detail: 'Bundling images into a ZIP archive...' },
          ]}
          tips={[
            '🖼️ Images are extracted at their original embedded resolution.',
            '📎 All formats supported: PNG, JPEG, TIFF, BMP and more.',
            '📄 Each image is named by page and order for easy sorting.',
            '🔒 ZIP file is deleted from server after download.',
            '⚡ Powered by PyMuPDF for precise image object extraction.',
          ]}
        />
      )}

      {error && (
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center max-w-md mt-6">
            <p className="text-red-700 font-semibold mb-4">{error}</p>
            <button onClick={reset} className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">Try another file</button>
        </div>
      )}

      {resultUrl && (
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center animate-in fade-in">
            <h2 className="text-2xl font-bold text-slate-800 mb-4">Extraction Complete!</h2>
            <p className="text-slate-600 mb-8">All embedded images have been perfectly extracted and bundled into a ZIP file.</p>
            <div className="flex justify-center gap-4">
                <a href={resultUrl} download={`images_${file?.name.replace('.pdf', '')}.zip`} className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 flex items-center gap-2">
                    <Package className="w-5 h-5" /> Download ZIP
                </a>
                <button onClick={reset} className="px-8 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 border border-slate-300">Convert Another</button>
            </div>
        </div>
      )}
    </div>
  );
}
