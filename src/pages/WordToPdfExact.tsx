import React, { useState, useRef } from 'react';
import { FileText, Download, Loader2, ArrowRight } from 'lucide-react';
import mammoth from 'mammoth';
import html2canvas from 'html2canvas';
import { PDFDocument } from 'pdf-lib';
import FileDropzone from '../components/FileDropzone';

export default function WordToPdfExact() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [htmlContent, setHtmlContent] = useState<string>('');

  const handleConvert = async () => {
    if (!file || !containerRef.current) return;
    setIsProcessing(true);
    setError(null);
    setResultUrl(null);

    try {
      setStatus('Reading Word file...');
      const arrayBuffer = await file.arrayBuffer();

      setStatus('Converting to exact HTML (via Mammoth)...');
      const result = await mammoth.convertToHtml(
        { arrayBuffer },
        { includeDefaultStyleMap: true }
      );
      
      const html = result.value;
      if (!html) throw new Error("No content found in document.");
      
      setHtmlContent(html);

      // Wait a moment for the DOM to render the new HTML content
      await new Promise(resolve => setTimeout(resolve, 500));

      const renderDiv = containerRef.current.querySelector('#render-target') as HTMLElement;
      if (!renderDiv) throw new Error("Render target not found");

      setStatus('Rendering HTML to Canvas Image...');
      
      // html2canvas capture
      const canvas = await html2canvas(renderDiv, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      } as any);

      setStatus('Building PDF...');
      const pdfDoc = await PDFDocument.create();
      
      // Calculate how many A4 pages we need
      const A4_WIDTH = 595.28;
      const A4_HEIGHT = 841.89;
      
      // Scale canvas to fit A4 width
      const scale = A4_WIDTH / canvas.width;
      const scaledHeight = canvas.height * scale;
      
      // Number of pages needed
      const numPages = Math.ceil(scaledHeight / A4_HEIGHT);
      
      const imgBytes = await new Promise<Uint8Array>((resolve) => {
        canvas.toBlob(async (blob) => {
          if (blob) {
            resolve(new Uint8Array(await blob.arrayBuffer()));
          }
        }, 'image/jpeg', 0.95);
      });

      const pdfImage = await pdfDoc.embedJpg(imgBytes);

      for (let i = 0; i < numPages; i++) {
        const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
        
        // Draw the image slice for this page
        // Note: y coordinate is from bottom-up in pdf-lib
        const yOffset = A4_HEIGHT * i;
        
        page.drawImage(pdfImage, {
          x: 0,
          y: A4_HEIGHT - scaledHeight + yOffset, // Shift image up for each page
          width: A4_WIDTH,
          height: scaledHeight,
        });
      }

      setStatus('Finalizing PDF...');
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setResultUrl(url);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during conversion.');
    } finally {
      setIsProcessing(false);
      setStatus('');
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-4 flex items-center justify-center gap-3">
          <FileText className="h-8 w-8 text-blue-600" />
          Word to PDF (Exact Image-based Layout)
        </h1>
        <p className="text-slate-600 max-w-2xl mx-auto">
          Experimental feature: Converts Word (DOCX) to an exact HTML replica, then takes a snapshot and converts it into an image-based PDF.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8">
        {!file ? (
          <FileDropzone
            onDrop={(files) => {
              const f = files[0];
              if (f && f.name.toLowerCase().endsWith('.docx')) {
                setFile(f);
                setError(null);
                setResultUrl(null);
                setHtmlContent('');
              } else {
                setError('Please upload a .docx file.');
              }
            }}
            accept={{
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
            }}
            title="Upload Word Document"
            subtitle="Drag and drop your .docx file here"
          />
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="font-medium text-slate-900">{file.name}</p>
                  <p className="text-sm text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setFile(null);
                  setResultUrl(null);
                  setHtmlContent('');
                }}
                className="text-sm text-red-600 hover:text-red-700 font-medium"
              >
                Change File
              </button>
            </div>

            {!resultUrl && !isProcessing && (
              <button
                onClick={handleConvert}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                Start Conversion <ArrowRight className="h-5 w-5" />
              </button>
            )}

            {isProcessing && (
              <div className="p-8 text-center bg-blue-50 rounded-xl border border-blue-100">
                <Loader2 className="h-8 w-8 text-blue-600 animate-spin mx-auto mb-4" />
                <p className="text-blue-900 font-medium">{status}</p>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200">
                {error}
              </div>
            )}

            {resultUrl && (
              <div className="p-6 bg-green-50 rounded-xl border border-green-200 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Download className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-green-900 mb-2">Conversion Complete!</h3>
                <p className="text-green-700 mb-6">Your exact layout PDF is ready.</p>
                <a
                  href={resultUrl}
                  download={file.name.replace(/\.docx$/i, '-exact.pdf')}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-colors"
                >
                  Download PDF
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hidden Render Container for HTML2Canvas */}
      <div 
        ref={containerRef} 
        style={{
          position: 'absolute',
          top: '-9999px',
          left: '-9999px',
          width: '794px', // A4 pixel width at 96 DPI approx
          visibility: 'hidden'
        }}
      >
        <div 
          id="render-target"
          style={{ 
            background: 'white', 
            padding: '40px',
            color: '#000',
            fontFamily: 'Arial, sans-serif',
            fontSize: '14px',
            lineHeight: '1.5'
          }}
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </div>
    </div>
  );
}
