import { useState } from 'react';
import { Download, FileText, Eraser, AlertCircle } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

export default function RemoveWatermark() {
  useSEO('Remove Watermark Online Free | PDF Media Suite', 'Free online Remove Watermark tool. No signup or installation required.');

  usePageSEO(
    'Remove Watermark from PDF — Free Online Tool',
    'Remove bottom watermarks (e.g. Scanned with CamScanner) and background watermarks from your PDF files instantly. Free, private, no upload required.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [removeBottom, setRemoveBottom] = useState(true);
  const [bottomPercentage, setBottomPercentage] = useState(5.0);
  const [removeBackground, setRemoveBackground] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setProcessedUrl(null);
      setError(null);
    }
  };

  const processFile = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      // Send as "1"/"0" strings — FastAPI bool Form parses these correctly
      formData.append('remove_bottom', removeBottom ? '1' : '0');
      formData.append('bottom_percentage', bottomPercentage.toString());
      formData.append('remove_background', removeBackground ? '1' : '0');

      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_BASE}/remove-watermark`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errMsg = 'Failed to process PDF. Please try again.';
        try {
          const data = await response.json();
          if (data?.detail) errMsg = data.detail;
        } catch { /* ignore */ }
        throw new Error(errMsg);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setProcessedUrl(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(msg);
      console.error('Error removing watermark:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setFile(null);
    setProcessedUrl(null);
    setError(null);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 dark:bg-slate-950 min-h-screen">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 mb-4">
          <Eraser className="w-8 h-8" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">Remove Watermark</h1>
        <p className="text-lg text-gray-600 dark:text-slate-400 max-w-lg mx-auto">
          Clean up <strong>"Scanned with CamScanner"</strong>, <strong>"Oken Scanner"</strong> footer tags, and background watermarks from your PDFs.
        </p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" subtitle="or drop your PDF here" />
      ) : (
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8">

          {/* File Info */}
          <div className="flex items-center gap-4 p-5 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 mb-6">
            <div className="w-14 h-14 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-xl flex items-center justify-center shrink-0">
              <FileText className="w-7 h-7" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-gray-900 dark:text-white truncate">{file.name}</p>
              <p className="text-sm text-gray-500 dark:text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>

          {!processedUrl ? (
            <div className="space-y-5">
              {/* Error Alert */}
              {error && (
                <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400">
                  <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}

              {/* Option 1 — Bottom Watermark */}
              <div className="p-5 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 space-y-4">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    id="remove-bottom"
                    checked={removeBottom}
                    onChange={(e) => setRemoveBottom(e.target.checked)}
                    className="w-5 h-5 text-red-600 rounded focus:ring-red-500 accent-red-600"
                  />
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-white">Remove Bottom Footer Watermark</span>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                      Covers "Scanned with CamScanner", "Oken Scanner", etc. that appear at the bottom of every page.
                    </p>
                  </div>
                </label>

                {removeBottom && (
                  <div className="pl-8 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-slate-400">Bottom section to erase:</span>
                      <span className="font-bold text-red-600 dark:text-red-400">{bottomPercentage}%</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      step="0.5"
                      value={bottomPercentage}
                      onChange={(e) => setBottomPercentage(parseFloat(e.target.value))}
                      className="w-full h-2 bg-gray-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-red-600"
                    />
                    <div className="flex justify-between text-xs text-gray-400 dark:text-slate-500">
                      <span>1%</span>
                      <span className="text-gray-500 dark:text-slate-400 italic">
                        ≈ {Math.round(bottomPercentage / 100 * 842 * 0.352778)} mm for A4
                      </span>
                      <span>20%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Option 2 — Background Watermark */}
              <div className="p-5 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    id="remove-background"
                    checked={removeBackground}
                    onChange={(e) => setRemoveBackground(e.target.checked)}
                    className="w-5 h-5 text-red-600 rounded focus:ring-red-500 accent-red-600"
                  />
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-white">Remove Background / Middle Watermarks</span>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                      Attempts to detect and erase light-grey or centered background watermarks in digital PDFs.
                    </p>
                  </div>
                </label>
              </div>

              {/* Info note */}
              <p className="text-xs text-center text-gray-400 dark:text-slate-500 px-2">
                💡 <strong>Tip:</strong> For CamScanner PDFs, <em>Remove Bottom Footer Watermark</em> alone is usually enough. Start with 5%–7%.
              </p>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  id="remove-watermark-btn"
                  onClick={processFile}
                  disabled={isProcessing || (!removeBottom && !removeBackground)}
                  className="flex-1 py-4 bg-red-600 hover:bg-red-700 text-white text-base font-bold rounded-xl transition-colors disabled:opacity-50 shadow-md flex justify-center items-center gap-2"
                >
                  <Eraser className="w-5 h-5" />
                  {isProcessing ? 'Processing...' : 'Remove Watermark'}
                </button>
                <button
                  onClick={reset}
                  className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 text-base font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors border border-gray-200 dark:border-slate-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* Success state */
            <div className="space-y-6 text-center">
              <div className="p-8 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                <div className="text-4xl mb-3">✅</div>
                <h3 className="text-xl font-bold text-green-800 dark:text-green-300 mb-5">Watermark removed successfully!</h3>
                <a
                  href={processedUrl}
                  download={`clean_${file.name}`}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-green-600 hover:bg-green-700 text-white text-base font-bold rounded-xl transition-colors shadow-md"
                >
                  <Download className="w-5 h-5" />
                  Download Clean PDF
                </a>
              </div>
              <button
                onClick={reset}
                className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-white font-medium transition-colors"
              >
                ← Clean another PDF
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
