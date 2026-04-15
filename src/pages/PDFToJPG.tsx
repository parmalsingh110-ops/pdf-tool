import { useState } from 'react';
import { Download, FileText, Image as ImageIcon } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { usePageSEO } from '../lib/usePageSEO';

// Initialize pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export default function PDFToJPG() {
  usePageSEO('PDF to JPG Converter', 'Convert PDF pages to high-quality JPG images. Free online PDF to JPEG converter — fast, private, no uploads required.');
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageUrls, setImageUrls] = useState<{url: string, name: string}[]>([]);

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setImageUrls([]);
    }
  };

  const convertToJpg = async () => {
    if (!file) return;
    
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      const newUrls: {url: string, name: string}[] = [];

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        // Use a higher scale for better quality
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        if (context) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          await page.render({
            canvasContext: context,
            viewport: viewport,
            canvas: canvas
          }).promise;
          
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          newUrls.push({
            url: dataUrl,
            name: `page_${i}.jpg`
          });
        }
      }
      setImageUrls(newUrls);
    } catch (error) {
      console.error("Error converting PDF to JPG:", error);
      alert("An error occurred while converting the PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">PDF to JPG</h1>
        <p className="text-xl text-gray-600">Convert each PDF page into a JPG image.</p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className="w-full max-w-4xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-4 p-6 bg-gray-50 rounded-xl border border-gray-200 mb-8">
            <div className="w-16 h-16 bg-yellow-100 text-yellow-600 rounded-xl flex items-center justify-center shrink-0">
              <FileText className="w-8 h-8" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-semibold text-gray-900 truncate">{file.name}</p>
              <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>

          {!imageUrls.length ? (
            <div className="flex gap-4">
              <button
                onClick={convertToJpg}
                disabled={isProcessing}
                className="flex-1 py-4 bg-yellow-500 text-white text-lg font-bold rounded-xl hover:bg-yellow-600 transition-colors disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
              >
                <ImageIcon className="w-6 h-6" />
                {isProcessing ? 'Converting...' : 'Convert to JPG'}
              </button>
              <button
                onClick={() => { setFile(null); }}
                className="px-6 py-4 bg-gray-100 text-gray-700 text-lg font-semibold rounded-xl hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="p-6 bg-green-50 rounded-xl border border-green-200 text-center mb-6">
                <h3 className="text-2xl font-bold text-green-800 mb-2">Conversion complete!</h3>
                <p className="text-green-600">Created {imageUrls.length} image(s).</p>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[50vh] overflow-y-auto p-2">
                {imageUrls.map((item, i) => (
                  <div key={i} className="flex flex-col items-center gap-2">
                    <div className="aspect-[1/1.4] w-full bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                      <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                    <a
                      href={item.url}
                      download={item.name}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-yellow-500 text-white text-sm font-semibold rounded-lg hover:bg-yellow-600 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </a>
                  </div>
                ))}
              </div>

              <div className="flex justify-center mt-6">
                <button
                  onClick={() => { setFile(null); setImageUrls([]); }}
                  className="px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Convert another PDF
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
