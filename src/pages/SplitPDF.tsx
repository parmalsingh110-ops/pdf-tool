import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Download, FileText } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';

export default function SplitPDF() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [ranges, setRanges] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [splitUrls, setSplitUrls] = useState<{url: string, name: string}[]>([]);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      setFile(selectedFile);
      setSplitUrls([]);
      
      // Get page count
      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        setPageCount(pdf.getPageCount());
        setRanges(`1-${pdf.getPageCount()}`);
      } catch (error) {
        console.error("Error loading PDF:", error);
      }
    }
  };

  const splitPdf = async () => {
    if (!file || !ranges) return;
    
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const sourcePdf = await PDFDocument.load(arrayBuffer);
      
      const rangeParts = ranges.split(',').map(r => r.trim());
      const newUrls: {url: string, name: string}[] = [];

      for (let i = 0; i < rangeParts.length; i++) {
        const part = rangeParts[i];
        let startPage = 1;
        let endPage = 1;

        if (part.includes('-')) {
          const [start, end] = part.split('-');
          startPage = parseInt(start, 10);
          endPage = parseInt(end, 10);
        } else {
          startPage = parseInt(part, 10);
          endPage = startPage;
        }

        if (isNaN(startPage) || isNaN(endPage) || startPage < 1 || endPage > pageCount || startPage > endPage) {
          continue; // Skip invalid ranges
        }

        const newPdf = await PDFDocument.create();
        const pageIndices = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage - 1 + i);
        const copiedPages = await newPdf.copyPages(sourcePdf, pageIndices);
        copiedPages.forEach((page) => newPdf.addPage(page));

        const pdfBytes = await newPdf.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        newUrls.push({ url, name: `split_${startPage}-${endPage}.pdf` });
      }

      setSplitUrls(newUrls);
    } catch (error) {
      console.error("Error splitting PDF:", error);
      alert("An error occurred while splitting the PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Split PDF file</h1>
        <p className="text-xl text-gray-600">Separate one page or a whole set for easy conversion into independent PDF files.</p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className="w-full max-w-4xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8 flex flex-col md:flex-row gap-8">
          <div className="flex-1">
            <div className="flex items-center gap-4 p-6 bg-gray-50 rounded-xl border border-gray-200 mb-6">
              <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-8 h-8" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold text-gray-900 truncate">{file.name}</p>
                <p className="text-sm text-gray-500">{pageCount} pages • {(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>

            {!splitUrls.length ? (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Custom ranges (e.g., 1-3, 5, 7-10)
                  </label>
                  <input
                    type="text"
                    value={ranges}
                    onChange={(e) => setRanges(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-shadow"
                    placeholder="1-5, 8, 11-13"
                  />
                  <p className="mt-2 text-sm text-gray-500">
                    A separate PDF will be created for each range.
                  </p>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={splitPdf}
                    disabled={isProcessing || !ranges}
                    className="flex-1 py-4 bg-orange-600 text-white text-lg font-bold rounded-xl hover:bg-orange-700 transition-colors disabled:opacity-50 shadow-md"
                  >
                    {isProcessing ? 'Splitting...' : 'Split PDF'}
                  </button>
                  <button
                    onClick={() => { setFile(null); setSplitUrls([]); }}
                    className="px-6 py-4 bg-gray-100 text-gray-700 text-lg font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="p-6 bg-green-50 rounded-xl border border-green-200 text-center">
                  <h3 className="text-xl font-bold text-green-800 mb-2">PDF split successfully!</h3>
                  <p className="text-green-600 mb-6">Created {splitUrls.length} file(s).</p>
                  <div className="flex flex-col gap-3">
                    {splitUrls.map((item, i) => (
                      <a
                        key={i}
                        href={item.url}
                        download={item.name}
                        className="flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <Download className="w-5 h-5" />
                        Download {item.name}
                      </a>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => { setFile(null); setSplitUrls([]); }}
                  className="w-full py-4 bg-gray-100 text-gray-700 text-lg font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Split another PDF
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
