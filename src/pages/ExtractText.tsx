import { useState } from 'react';
import { Download, FileText, FileType } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { usePageSEO } from '../lib/usePageSEO';

// Initialize pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export default function ExtractText() {
  usePageSEO('Extract Text from PDF', 'Extract all text content from PDF documents. Free online PDF text extractor — instant copy/paste.');
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedText, setExtractedText] = useState<string>('');

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setExtractedText('');
    }
  };

  const extractTextFromPdf = async () => {
    if (!file) return;
    
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      let fullText = '';

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += `--- Page ${i} ---\n${pageText}\n\n`;
      }

      setExtractedText(fullText);
    } catch (error) {
      console.error("Error extracting text:", error);
      alert("An error occurred while extracting text from the PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadText = () => {
    const blob = new Blob([extractedText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file?.name.replace('.pdf', '')}_extracted.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Extract Text</h1>
        <p className="text-xl text-gray-600">Extract all readable text from your PDF document.</p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className="w-full max-w-4xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-4 p-6 bg-gray-50 rounded-xl border border-gray-200 mb-8">
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
              <FileText className="w-8 h-8" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-semibold text-gray-900 truncate">{file.name}</p>
              <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>

          {!extractedText ? (
            <div className="flex gap-4">
              <button
                onClick={extractTextFromPdf}
                disabled={isProcessing}
                className="flex-1 py-4 bg-blue-600 text-white text-lg font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
              >
                <FileType className="w-6 h-6" />
                {isProcessing ? 'Extracting Text...' : 'Extract Text'}
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
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 h-96 overflow-y-auto">
                <pre className="whitespace-pre-wrap font-sans text-gray-800 text-sm">
                  {extractedText}
                </pre>
              </div>
              
              <div className="flex gap-4">
                <button
                  onClick={downloadText}
                  className="flex-1 py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 transition-colors shadow-md flex items-center justify-center gap-2"
                >
                  <Download className="w-6 h-6" />
                  Download as .txt
                </button>
                <button
                  onClick={() => { setFile(null); setExtractedText(''); }}
                  className="px-6 py-4 bg-gray-100 text-gray-700 text-lg font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Extract Another
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
