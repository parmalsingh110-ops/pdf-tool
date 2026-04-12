import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PDFDocument } from 'pdf-lib';
import { Download, FileText, Minimize2, Check, Zap, Gauge, Shield } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';

type CompressionLevel = 'extreme' | 'recommended' | 'low';

export default function CompressPDF() {
  const [file, setFile] = useState<File | null>(null);
  const [compressionLevel, setCompressionLevel] = useState<CompressionLevel>('recommended');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [compressedUrl, setCompressedUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<{original: number, compressed: number} | null>(null);

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setCompressedUrl(null);
      setStats(null);
    }
  };

  const compressPdf = async () => {
    if (!file) return;
    
    setIsProcessing(true);
    setProcessingStep('Starting compression...');
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      
      if (compressionLevel === 'low') {
        setProcessingStep('Stripping metadata (Lossless)...');
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        pdfDoc.setTitle('');
        pdfDoc.setAuthor('');
        pdfDoc.setSubject('');
        pdfDoc.setKeywords([]);
        pdfDoc.setProducer('');
        pdfDoc.setCreator('');
        
        const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
        finishCompression(pdfBytes);
      } else {
        // Advanced compression via rasterization
        setProcessingStep('Analyzing PDF structure...');
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        const numPages = pdf.numPages;
        const newPdfDoc = await PDFDocument.create();
        
        // Settings based on level
        const scale = compressionLevel === 'extreme' ? 1.0 : 1.5;
        const quality = compressionLevel === 'extreme' ? 0.4 : 0.7;
        
        for (let i = 1; i <= numPages; i++) {
          setProcessingStep(`Processing page ${i} of ${numPages}...`);
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale });
          
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
          await page.render({ 
            canvasContext: ctx, 
            viewport,
            canvas: canvas
          }).promise;
          
          const imgDataUrl = canvas.toDataURL('image/jpeg', quality);
          const imgBytes = await fetch(imgDataUrl).then(res => res.arrayBuffer());
          
          const pdfImage = await newPdfDoc.embedJpg(imgBytes);
          const newPage = newPdfDoc.addPage([viewport.width, viewport.height]);
          newPage.drawImage(pdfImage, {
            x: 0,
            y: 0,
            width: viewport.width,
            height: viewport.height,
          });
          
          // Clean up canvas to save memory
          canvas.width = 0;
          canvas.height = 0;
        }
        
        setProcessingStep('Generating final PDF...');
        const pdfBytes = await newPdfDoc.save();
        finishCompression(pdfBytes);
      }
    } catch (error) {
      console.error("Error compressing PDF:", error);
      alert("An error occurred while compressing the PDF.");
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  const finishCompression = (pdfBytes: Uint8Array) => {
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    
    setStats({
      original: file!.size,
      compressed: blob.size
    });
    setCompressedUrl(url);
  };

  const levels = [
    { 
      id: 'extreme', 
      title: 'Extreme Compression', 
      desc: 'Less quality, high compression', 
      icon: Zap,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200'
    },
    { 
      id: 'recommended', 
      title: 'Recommended Compression', 
      desc: 'Good quality, good compression', 
      icon: Gauge,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200'
    },
    { 
      id: 'low', 
      title: 'Less Compression', 
      desc: 'High quality, less compression', 
      icon: Shield,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200'
    }
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-12 max-w-3xl mx-auto px-4">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Compress PDF file</h1>
        <p className="text-xl text-gray-600">Reduce file size while optimizing for maximal PDF quality.</p>
        <p className="mt-4 text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-left">
          <strong>Need a specific file size?</strong> The &quot;Less compression&quot; path only strips metadata (near-lossless).
          For a hard cap in kilobytes (with rasterized pages), use{' '}
          <Link to="/target-compress" className="text-blue-700 font-semibold underline">
            Target size PDF compress
          </Link>
          .
        </p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-8">
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <div className="flex items-center gap-4 p-6 bg-gray-50 rounded-xl border border-gray-200 mb-8">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-8 h-8" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold text-gray-900 truncate">{file.name}</p>
                <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>

            {!compressedUrl ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4">
                  {levels.map((level) => (
                    <button
                      key={level.id}
                      onClick={() => setCompressionLevel(level.id as CompressionLevel)}
                      className={`relative flex items-center gap-4 p-5 rounded-xl border-2 transition-all text-left ${
                        compressionLevel === level.id 
                          ? `${level.borderColor} ${level.bgColor} ring-2 ring-green-500 ring-offset-2` 
                          : 'border-gray-100 bg-gray-50 hover:border-gray-300'
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${level.bgColor} ${level.color}`}>
                        <level.icon className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-900">{level.title}</h3>
                        <p className="text-sm text-gray-500">{level.desc}</p>
                      </div>
                      {compressionLevel === level.id && (
                        <div className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center">
                          <Check className="w-4 h-4" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                <div className="pt-4 flex gap-4">
                  <button
                    onClick={compressPdf}
                    disabled={isProcessing}
                    className="flex-1 py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
                  >
                    <Minimize2 className="w-5 h-5" />
                    {isProcessing ? processingStep || 'Compressing...' : 'Compress PDF'}
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
                  <h3 className="text-2xl font-bold text-green-800 mb-4">PDF compressed!</h3>
                  {stats && (
                    <div className="flex justify-center gap-8 mb-6 text-sm">
                      <div>
                        <p className="text-gray-500">Original</p>
                        <p className="font-semibold text-gray-900">{(stats.original / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Compressed</p>
                        <p className="font-semibold text-green-700">{(stats.compressed / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Saved</p>
                        <p className="font-semibold text-green-700">
                          {Math.round((1 - stats.compressed / stats.original) * 100)}%
                        </p>
                      </div>
                    </div>
                  )}
                  <a
                    href={compressedUrl}
                    download={`compressed_${file.name}`}
                    className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 transition-colors shadow-md"
                  >
                    <Download className="w-6 h-6" />
                    Download compressed PDF
                  </a>
                </div>
                <button
                  onClick={() => { setFile(null); setCompressedUrl(null); setStats(null); }}
                  className="text-gray-600 hover:text-gray-900 font-medium"
                >
                  Compress another PDF
                </button>
              </div>
            )}
          </div>

          {/* Preview Area (Optional but nice) */}
          <div className="flex-1 bg-gray-100 rounded-2xl border border-gray-200 overflow-hidden min-h-[500px] flex flex-col">
            <div className="bg-white px-4 py-3 text-sm font-semibold text-gray-700 border-b border-gray-200">
              PDF Preview
            </div>
            <div className="flex-1 relative bg-gray-200">
               {file && (
                 <iframe 
                   src={`${URL.createObjectURL(file)}#toolbar=0`} 
                   className="absolute inset-0 w-full h-full"
                   title="PDF Preview"
                 />
               )}
               {isProcessing && (
                 <div className="absolute inset-0 bg-black/20 backdrop-blur-sm flex flex-col items-center justify-center text-white p-8">
                    <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-xl font-bold">{processingStep}</p>
                 </div>
               )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
