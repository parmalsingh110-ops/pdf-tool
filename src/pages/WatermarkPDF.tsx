import { useState } from 'react';
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import { Download, FileText, Type } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';

export default function WatermarkPDF() {
  const [file, setFile] = useState<File | null>(null);
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [isProcessing, setIsProcessing] = useState(false);
  const [watermarkedUrl, setWatermarkedUrl] = useState<string | null>(null);

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setWatermarkedUrl(null);
    }
  };

  const addWatermark = async () => {
    if (!file || !watermarkText) return;
    
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      const pages = pdfDoc.getPages();
      
      for (const page of pages) {
        const { width, height } = page.getSize();
        const textWidth = helveticaFont.widthOfTextAtSize(watermarkText, 60);
        const textHeight = helveticaFont.heightAtSize(60);
        
        page.drawText(watermarkText, {
          x: width / 2 - textWidth / 2,
          y: height / 2 - textHeight / 2,
          size: 60,
          font: helveticaFont,
          color: rgb(0.9, 0.2, 0.2),
          opacity: 0.3,
          rotate: degrees(45),
        });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setWatermarkedUrl(url);
    } catch (error) {
      console.error("Error adding watermark:", error);
      alert("An error occurred while adding the watermark.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Add Watermark to PDF</h1>
        <p className="text-xl text-gray-600">Stamp text over your PDF in seconds.</p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-4 p-6 bg-gray-50 rounded-xl border border-gray-200 mb-8">
            <div className="w-16 h-16 bg-cyan-100 text-cyan-600 rounded-xl flex items-center justify-center shrink-0">
              <FileText className="w-8 h-8" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-semibold text-gray-900 truncate">{file.name}</p>
              <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>

          {!watermarkedUrl ? (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Watermark Text
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Type className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-shadow"
                    placeholder="CONFIDENTIAL"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={addWatermark}
                  disabled={isProcessing || !watermarkText}
                  className="flex-1 py-4 bg-cyan-600 text-white text-lg font-bold rounded-xl hover:bg-cyan-700 transition-colors disabled:opacity-50 shadow-md"
                >
                  {isProcessing ? 'Adding Watermark...' : 'Add Watermark'}
                </button>
                <button
                  onClick={() => { setFile(null); setWatermarkText('CONFIDENTIAL'); }}
                  className="px-6 py-4 bg-gray-100 text-gray-700 text-lg font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 text-center">
              <div className="p-8 bg-green-50 rounded-xl border border-green-200">
                <h3 className="text-2xl font-bold text-green-800 mb-4">Watermark added successfully!</h3>
                <a
                  href={watermarkedUrl}
                  download={`watermarked_${file.name}`}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 transition-colors shadow-md"
                >
                  <Download className="w-6 h-6" />
                  Download PDF
                </a>
              </div>
              <button
                onClick={() => { setFile(null); setWatermarkedUrl(null); }}
                className="text-gray-600 hover:text-gray-900 font-medium"
              >
                Watermark another PDF
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
