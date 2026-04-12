import { useState } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Download, FileText, Hash } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';

export default function PageNumbersPDF() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [numberedUrl, setNumberedUrl] = useState<string | null>(null);

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setNumberedUrl(null);
    }
  };

  const addPageNumbers = async () => {
    if (!file) return;
    
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      
      const pages = pdfDoc.getPages();
      
      pages.forEach((page, idx) => {
        const { width } = page.getSize();
        const text = `Page ${idx + 1} of ${pages.length}`;
        const textWidth = helveticaFont.widthOfTextAtSize(text, 12);
        
        page.drawText(text, {
          x: width / 2 - textWidth / 2,
          y: 20, // 20 points from the bottom
          size: 12,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setNumberedUrl(url);
    } catch (error) {
      console.error("Error adding page numbers:", error);
      alert("An error occurred while adding page numbers.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Add Page Numbers</h1>
        <p className="text-xl text-gray-600">Add page numbers into PDFs with ease.</p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-4 p-6 bg-gray-50 rounded-xl border border-gray-200 mb-8">
            <div className="w-16 h-16 bg-pink-100 text-pink-600 rounded-xl flex items-center justify-center shrink-0">
              <FileText className="w-8 h-8" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-semibold text-gray-900 truncate">{file.name}</p>
              <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>

          {!numberedUrl ? (
            <div className="space-y-6">
              <div className="flex gap-4">
                <button
                  onClick={addPageNumbers}
                  disabled={isProcessing}
                  className="flex-1 py-4 bg-pink-600 text-white text-lg font-bold rounded-xl hover:bg-pink-700 transition-colors disabled:opacity-50 shadow-md"
                >
                  {isProcessing ? 'Adding Numbers...' : 'Add Page Numbers'}
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
                <h3 className="text-2xl font-bold text-green-800 mb-4">Page numbers added!</h3>
                <a
                  href={numberedUrl}
                  download={`numbered_${file.name}`}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 transition-colors shadow-md"
                >
                  <Download className="w-6 h-6" />
                  Download PDF
                </a>
              </div>
              <button
                onClick={() => { setFile(null); setNumberedUrl(null); }}
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
