import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileText, Maximize2, Check, Target } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';

export default function IncreasePdfSize() {
  usePageSEO('Increase PDF Size', 'Artificially increase the file size of your PDF document without changing its visual content or quality. Perfect for meeting minimum upload requirements.');
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [targetSizeMB, setTargetSizeMB] = useState<number>(5);
  const [compressedUrl, setCompressedUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<{original: number, newSize: number} | null>(null);

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      if (compressedUrl) URL.revokeObjectURL(compressedUrl);
      setFile(acceptedFiles[0]);
      setCompressedUrl(null);
      setStats(null);
      // Pre-fill target size to be slightly larger than current file
      const currentMB = acceptedFiles[0].size / (1024 * 1024);
      setTargetSizeMB(Math.ceil(currentMB) + 1);
    }
  };

  const increasePdfSize = async () => {
    if (!file) return;
    
    setIsProcessing(true);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const origBytes = new Uint8Array(arrayBuffer);
      const targetBytesLength = Math.round(targetSizeMB * 1024 * 1024);
      
      if (origBytes.length >= targetBytesLength) {
        alert(`File is already ${ (origBytes.length / (1024 * 1024)).toFixed(2) } MB, which is larger than your target size of ${targetSizeMB} MB. Please enter a larger target size.`);
        setIsProcessing(false);
        return;
      }

      // Create a new array of the target size
      const finalBytes = new Uint8Array(targetBytesLength);
      
      // Copy original PDF data
      finalBytes.set(origBytes, 0);
      
      // Fill the rest with random data to prevent high compression algorithms from shrinking it back down
      // We chunk it to avoid blocking the main thread for too long if the padding is massive
      const chunkSize = 1024 * 1024; // 1MB chunks
      for (let i = origBytes.length; i < targetBytesLength; i += chunkSize) {
        const end = Math.min(i + chunkSize, targetBytesLength);
        // Using crypto.getRandomValues is too slow for big files, so we use a fast pseudo-random fill
        for (let j = i; j < end; j++) {
           // simple fast random pattern so it's not compressible as all zeros
           finalBytes[j] = Math.floor(Math.random() * 256);
        }
        // Yield to UI
        if (i % (5 * 1024 * 1024) === 0) {
            await new Promise(r => setTimeout(r, 0));
        }
      }

      // Appending data after the %%EOF marker of a PDF is a standard, safe way to artificially inflate 
      // file size. All standard PDF readers ignore trailing garbage data.
      
      const blob = new Blob([finalBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      setStats({
        original: file.size,
        newSize: blob.size
      });
      setCompressedUrl(url);

    } catch (error: any) {
      console.error('Processing error:', error?.message || error);
      alert(`Processing failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-12 max-w-3xl mx-auto px-4">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Increase PDF Size</h1>
        <p className="text-xl text-gray-600">Artificially inflate your PDF file size without changing the document quality or content. Perfect for meeting minimum file size requirements on government portals.</p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-8">
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <div className="flex items-center gap-4 p-6 bg-gray-50 rounded-xl border border-gray-200 mb-8">
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-8 h-8" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold text-gray-900 truncate">{file.name}</p>
                <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>

            {!compressedUrl ? (
              <div className="space-y-6">
                
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      Target File Size (MB)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Target className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        type="number"
                        min={(file.size / (1024 * 1024)) + 0.1}
                        step="0.1"
                        value={targetSizeMB}
                        onChange={(e) => setTargetSizeMB(Number(e.target.value))}
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-lg"
                      />
                    </div>
                    <p className="mt-3 text-sm text-gray-500 leading-relaxed">
                      Enter the exact size you want your new PDF to be. We will safely append invisible padding to the file to reach this size. The document's visual quality will remain 100% untouched.
                    </p>
                  </div>
                </div>

                <div className="pt-4 flex gap-4">
                  <button
                    onClick={increasePdfSize}
                    disabled={isProcessing}
                    className="flex-1 py-4 bg-blue-600 text-white text-lg font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <Maximize2 className="w-5 h-5" />
                    )}
                    {isProcessing ? 'Increasing Size...' : 'Increase Size'}
                  </button>
                  <button
                    onClick={() => { setFile(null); }}
                    className="px-6 py-4 bg-gray-100 text-gray-700 text-lg font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6 text-center">
                <div className="p-8 bg-blue-50 rounded-xl border border-blue-200">
                  <div className="w-16 h-16 bg-blue-500 text-white rounded-full flex items-center justify-center mx-auto mb-4">
                     <Check className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-bold text-blue-900 mb-4">Size Increased Successfully!</h3>
                  {stats && (
                    <div className="flex justify-center gap-8 mb-8 text-sm bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                      <div>
                        <p className="text-gray-500 mb-1">Original Size</p>
                        <p className="font-semibold text-gray-900 text-lg">{(stats.original / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <div className="w-px bg-gray-200"></div>
                      <div>
                        <p className="text-gray-500 mb-1">New Size</p>
                        <p className="font-bold text-blue-700 text-lg">{(stats.newSize / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    </div>
                  )}
                  
                  <a
                    href={compressedUrl}
                    download={`resized_${file.name}`}
                    className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-blue-600 text-white text-lg font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-md w-full sm:w-auto"
                  >
                    <Download className="w-6 h-6" />
                    Download New PDF
                  </a>
                </div>
                <button
                  onClick={() => { 
                    if (compressedUrl) URL.revokeObjectURL(compressedUrl);
                    setFile(null); setCompressedUrl(null); setStats(null); 
                  }}
                  className="text-gray-600 hover:text-gray-900 font-medium"
                >
                  Process another PDF
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
