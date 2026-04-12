import { useState } from 'react';
import { Download, FileText, Maximize } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { PDFDocument } from 'pdf-lib';

export default function AddMargins() {
  const [file, setFile] = useState<File | null>(null);
  const [marginSize, setMarginSize] = useState<number>(36); // 36 points = 0.5 inch
  const [isProcessing, setIsProcessing] = useState(false);
  const [marginedUrl, setMarginedUrl] = useState<string | null>(null);

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setMarginedUrl(null);
    }
  };

  const addMargins = async () => {
    if (!file) return;
    
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      
      const pages = pdfDoc.getPages();
      
      for (const page of pages) {
        const { width, height } = page.getSize();
        
        // Increase page size
        page.setSize(width + marginSize * 2, height + marginSize * 2);
        
        // Translate content to be centered in the new size
        page.translateContent(marginSize, marginSize);
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      setMarginedUrl(url);
    } catch (error) {
      console.error("Error adding margins:", error);
      alert("An error occurred while adding margins.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Add Margins</h1>
        <p className="text-xl text-gray-600">Increase white space around the edges of your PDF pages.</p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-4 p-6 bg-gray-50 rounded-xl border border-gray-200 mb-8">
            <div className="w-16 h-16 bg-teal-100 text-teal-600 rounded-xl flex items-center justify-center shrink-0">
              <FileText className="w-8 h-8" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-semibold text-gray-900 truncate">{file.name}</p>
              <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>

          {!marginedUrl ? (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Margin Size (points)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Maximize className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="number"
                    value={marginSize}
                    onChange={(e) => setMarginSize(Number(e.target.value))}
                    className="w-full pl-11 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-shadow"
                    placeholder="36"
                    min="0"
                  />
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  72 points = 1 inch. 36 points = 0.5 inches.
                </p>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={addMargins}
                  disabled={isProcessing || marginSize < 0}
                  className="flex-1 py-4 bg-teal-600 text-white text-lg font-bold rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
                >
                  {isProcessing ? 'Processing...' : 'Add Margins'}
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
              <div className="p-8 bg-green-50 rounded-xl border border-green-200">
                <h3 className="text-2xl font-bold text-green-800 mb-4">Margins Added!</h3>
                <a
                  href={marginedUrl}
                  download={`margined_${file.name}`}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 transition-colors shadow-md"
                >
                  <Download className="w-6 h-6" />
                  Download PDF
                </a>
              </div>
              <button
                onClick={() => { setFile(null); setMarginedUrl(null); }}
                className="text-gray-600 hover:text-gray-900 font-medium"
              >
                Process another PDF
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
