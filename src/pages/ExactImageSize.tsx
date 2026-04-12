import { useState } from 'react';
import { Download, ImageMinus, Image as ImageIcon } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import imageCompression from 'browser-image-compression';
import { encodeCanvasUnderByteBudget } from '../lib/imageByteBudget';

export default function ExactImageSize() {
  const [file, setFile] = useState<File | null>(null);
  const [targetSizeKB, setTargetSizeKB] = useState<number>(50);
  const [isProcessing, setIsProcessing] = useState(false);
  const [compressedUrl, setCompressedUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<{original: number, compressed: number} | null>(null);
  const [compressedFile, setCompressedFile] = useState<File | null>(null);

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setCompressedUrl(null);
      setStats(null);
      setCompressedFile(null);
    }
  };

  const compressImage = async () => {
    if (!file || !targetSizeKB) return;
    
    setIsProcessing(true);
    try {
      const options = {
        maxSizeMB: targetSizeKB / 1024,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        initialQuality: 0.8,
      };

      let compressedBlob: Blob = await imageCompression(file, options);
      const targetBytes = targetSizeKB * 1024;

      if (compressedBlob.size > targetBytes) {
        const bmp = await createImageBitmap(compressedBlob);
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        const x = canvas.getContext('2d');
        if (x) {
          x.drawImage(bmp, 0, 0);
          const mime =
            compressedBlob.type === 'image/webp' || file.type === 'image/webp'
              ? 'image/webp'
              : 'image/jpeg';
          const enc = await encodeCanvasUnderByteBudget(canvas, mime, targetBytes);
          compressedBlob = enc.blob;
        }
        bmp.close?.();
      }

      const url = URL.createObjectURL(compressedBlob);

      setStats({
        original: file.size,
        compressed: compressedBlob.size,
      });
      setCompressedUrl(url);
      const outName =
        compressedBlob.type === 'image/jpeg' && !file.name.toLowerCase().endsWith('.jpg')
          ? file.name.replace(/\.[^.]+$/, '') + '.jpg'
          : file.name;
      setCompressedFile(new File([compressedBlob], outName, { type: compressedBlob.type }));
    } catch (error) {
      console.error("Error compressing image:", error);
      alert("An error occurred while compressing the image.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Exact Image Size</h1>
        <p className="text-xl text-gray-600">Compress images to a strict size limit (e.g., under 50KB).</p>
      </div>

      {!file ? (
        <FileDropzone 
          onDrop={handleDrop} 
          multiple={false} 
          accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] }}
          title="Select Image file" 
        />
      ) : (
        <div className="w-full max-w-4xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8 flex flex-col md:flex-row gap-8">
          <div className="flex-1">
            <div className="flex items-center gap-4 p-6 bg-gray-50 rounded-xl border border-gray-200 mb-8">
              <div className="w-16 h-16 bg-teal-100 text-teal-600 rounded-xl flex items-center justify-center shrink-0">
                <ImageIcon className="w-8 h-8" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold text-gray-900 truncate">{file.name}</p>
                <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(2)} KB</p>
              </div>
            </div>

            {!compressedUrl ? (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Target Size (KB)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <ImageMinus className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="number"
                      value={targetSizeKB}
                      onChange={(e) => setTargetSizeKB(Number(e.target.value))}
                      className="w-full pl-11 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-shadow"
                      placeholder="50"
                      min="1"
                    />
                  </div>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={compressImage}
                    disabled={isProcessing || !targetSizeKB}
                    className="flex-1 py-4 bg-teal-600 text-white text-lg font-bold rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50 shadow-md"
                  >
                    {isProcessing ? 'Compressing...' : 'Compress Image'}
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
                  <h3 className="text-2xl font-bold text-green-800 mb-4">Image compressed!</h3>
                  {stats && (
                    <div className="flex justify-center gap-8 mb-6 text-sm">
                      <div>
                        <p className="text-gray-500">Original</p>
                        <p className="font-semibold text-gray-900">{(stats.original / 1024).toFixed(2)} KB</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Compressed</p>
                        <p className="font-semibold text-green-700">{(stats.compressed / 1024).toFixed(2)} KB</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Target Max</p>
                        <p className="font-semibold text-teal-700">{targetSizeKB} KB</p>
                      </div>
                    </div>
                  )}
                  <a
                    href={compressedUrl}
                    download={`compressed_${compressedFile?.name || file.name}`}
                    className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 transition-colors shadow-md"
                  >
                    <Download className="w-6 h-6" />
                    Download Image
                  </a>
                </div>
                <button
                  onClick={() => { setFile(null); setCompressedUrl(null); setStats(null); }}
                  className="text-gray-600 hover:text-gray-900 font-medium"
                >
                  Compress another Image
                </button>
              </div>
            )}
          </div>
          
          {/* Preview */}
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-100 rounded-xl border border-gray-200 p-4 overflow-hidden">
            {compressedUrl ? (
              <img src={compressedUrl} alt="Compressed preview" className="max-w-full max-h-[400px] object-contain" />
            ) : (
              <img src={URL.createObjectURL(file)} alt="Original preview" className="max-w-full max-h-[400px] object-contain opacity-50" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
