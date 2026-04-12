import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Download, Image as ImageIcon, Trash2, GripVertical } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';

export default function JPGToPDF() {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const handleDrop = (acceptedFiles: File[]) => {
    setFiles(prev => [...prev, ...acceptedFiles]);
    setPdfUrl(null);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const moveFile = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) || 
      (direction === 'down' && index === files.length - 1)
    ) return;

    const newFiles = [...files];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newFiles[index], newFiles[targetIndex]] = [newFiles[targetIndex], newFiles[index]];
    setFiles(newFiles);
  };

  const convertToPdf = async () => {
    if (files.length === 0) return;
    
    setIsProcessing(true);
    try {
      const pdfDoc = await PDFDocument.create();

      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        let image;
        
        if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
          image = await pdfDoc.embedJpg(arrayBuffer);
        } else if (file.type === 'image/png') {
          image = await pdfDoc.embedPng(arrayBuffer);
        } else {
          continue; // Skip unsupported formats
        }

        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: image.width,
          height: image.height,
        });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (error) {
      console.error("Error converting images to PDF:", error);
      alert("An error occurred while converting the images.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">JPG to PDF</h1>
        <p className="text-xl text-gray-600">Convert JPG images to PDF in seconds.</p>
      </div>

      {files.length === 0 ? (
        <FileDropzone 
          onDrop={handleDrop} 
          multiple={true} 
          accept={{ 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] }}
          title="Select JPG images"
          subtitle="or drop images here"
        />
      ) : (
        <div className="w-full max-w-4xl bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-800">Selected Images ({files.length})</h2>
            <label className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 cursor-pointer font-medium transition-colors">
              Add more images
              <input 
                type="file" 
                accept=".jpg,.jpeg,.png" 
                multiple 
                className="hidden" 
                onChange={(e) => {
                  if (e.target.files) {
                    handleDrop(Array.from(e.target.files));
                  }
                }} 
              />
            </label>
          </div>

          <div className="space-y-3 mb-8 max-h-[50vh] overflow-y-auto pr-2">
            {files.map((file, index) => (
              <div key={`${file.name}-${index}`} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200 group">
                <div className="flex flex-col gap-1 text-gray-400">
                  <button onClick={() => moveFile(index, 'up')} disabled={index === 0} className="hover:text-gray-700 disabled:opacity-30">
                    <GripVertical className="w-5 h-5" />
                  </button>
                </div>
                <div className="w-12 h-12 bg-gray-200 rounded-lg overflow-hidden shrink-0">
                  <img src={URL.createObjectURL(file)} alt={file.name} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <button 
                  onClick={() => removeFile(index)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>

          {!pdfUrl ? (
            <div className="flex justify-center">
              <button
                onClick={convertToPdf}
                disabled={files.length === 0 || isProcessing}
                className="px-8 py-4 bg-yellow-500 text-white text-lg font-bold rounded-xl hover:bg-yellow-600 transition-colors disabled:opacity-50 shadow-md flex items-center gap-2"
              >
                {isProcessing ? 'Converting...' : 'Convert to PDF'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 p-8 bg-green-50 rounded-xl border border-green-200">
              <h3 className="text-2xl font-bold text-green-800">PDF created successfully!</h3>
              <a
                href={pdfUrl}
                download="images.pdf"
                className="px-8 py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 transition-colors shadow-md flex items-center gap-2"
              >
                <Download className="w-6 h-6" />
                Download PDF
              </a>
              <button 
                onClick={() => { setFiles([]); setPdfUrl(null); }}
                className="text-gray-600 hover:text-gray-900 font-medium mt-2"
              >
                Convert more images
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
