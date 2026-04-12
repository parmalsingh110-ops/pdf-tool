import { useState } from 'react';
import { Download, FileText, ArrowUpDown } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { PDFDocument } from 'pdf-lib';

export default function ReversePDF() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [reversedUrl, setReversedUrl] = useState<string | null>(null);

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setReversedUrl(null);
    }
  };

  const reversePdf = async () => {
    if (!file) return;
    
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const sourcePdf = await PDFDocument.load(arrayBuffer);
      const newPdf = await PDFDocument.create();
      
      const pageCount = sourcePdf.getPageCount();
      const reversedIndices = Array.from({ length: pageCount }, (_, i) => pageCount - 1 - i);
      
      const copiedPages = await newPdf.copyPages(sourcePdf, reversedIndices);
      copiedPages.forEach((page) => newPdf.addPage(page));

      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      setReversedUrl(url);
    } catch (error) {
      console.error("Error reversing PDF:", error);
      alert("An error occurred while reversing the PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Reverse PDF</h1>
        <p className="text-xl text-gray-600">Flip the page order of your PDF document back-to-front.</p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-4 p-6 bg-gray-50 rounded-xl border border-gray-200 mb-8">
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
              <FileText className="w-8 h-8" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-semibold text-gray-900 truncate">{file.name}</p>
              <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>

          {!reversedUrl ? (
            <div className="flex gap-4">
              <button
                onClick={reversePdf}
                disabled={isProcessing}
                className="flex-1 py-4 bg-indigo-600 text-white text-lg font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
              >
                <ArrowUpDown className="w-6 h-6" />
                {isProcessing ? 'Reversing...' : 'Reverse Page Order'}
              </button>
              <button
                onClick={() => { setFile(null); }}
                className="px-6 py-4 bg-gray-100 text-gray-700 text-lg font-semibold rounded-xl hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="space-y-6 text-center">
              <div className="p-8 bg-green-50 rounded-xl border border-green-200">
                <h3 className="text-2xl font-bold text-green-800 mb-4">PDF Reversed!</h3>
                <a
                  href={reversedUrl}
                  download={`reversed_${file.name}`}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 transition-colors shadow-md"
                >
                  <Download className="w-6 h-6" />
                  Download PDF
                </a>
              </div>
              <button
                onClick={() => { setFile(null); setReversedUrl(null); }}
                className="text-gray-600 hover:text-gray-900 font-medium"
              >
                Reverse another PDF
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
