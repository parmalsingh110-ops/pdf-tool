import { useState, useRef, useEffect } from 'react';
import { Download, Maximize, Image as ImageIcon } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { encodeCanvasUnderByteBudget } from '../lib/imageByteBudget';

export default function PixelResizer() {
  const [file, setFile] = useState<File | null>(null);
  const [width, setWidth] = useState<number | ''>('');
  const [height, setHeight] = useState<number | ''>('');
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true);
  const [originalDimensions, setOriginalDimensions] = useState<{w: number, h: number} | null>(null);
  const [maxTargetKb, setMaxTargetKb] = useState<string>('');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [resizedUrl, setResizedUrl] = useState<string | null>(null);
  const [resizedFile, setResizedFile] = useState<File | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      setFile(selectedFile);
      setResizedUrl(null);
      setResizedFile(null);
      
      // Get original dimensions
      const img = new Image();
      img.onload = () => {
        setOriginalDimensions({ w: img.width, h: img.height });
        setWidth(img.width);
        setHeight(img.height);
      };
      img.src = URL.createObjectURL(selectedFile);
    }
  };

  const handleWidthChange = (val: string) => {
    const newWidth = parseInt(val, 10);
    setWidth(isNaN(newWidth) ? '' : newWidth);
    
    if (maintainAspectRatio && originalDimensions && !isNaN(newWidth)) {
      const ratio = originalDimensions.h / originalDimensions.w;
      setHeight(Math.round(newWidth * ratio));
    }
  };

  const handleHeightChange = (val: string) => {
    const newHeight = parseInt(val, 10);
    setHeight(isNaN(newHeight) ? '' : newHeight);
    
    if (maintainAspectRatio && originalDimensions && !isNaN(newHeight)) {
      const ratio = originalDimensions.w / originalDimensions.h;
      setWidth(Math.round(newHeight * ratio));
    }
  };

  const resizeImage = async () => {
    if (!file || !width || !height || !canvasRef.current) return;

    setIsProcessing(true);
    try {
      const img = new Image();
      img.src = URL.createObjectURL(file);

      await new Promise((resolve) => {
        img.onload = resolve;
      });

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        setIsProcessing(false);
        return;
      }

      canvas.width = width as number;
      canvas.height = height as number;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.drawImage(img, 0, 0, width as number, height as number);

      const maxKb = parseFloat(maxTargetKb.replace(',', '.'));
      const maxBytes =
        Number.isFinite(maxKb) && maxKb > 0 ? Math.round(maxKb * 1024) : null;

      try {
        let blob: Blob | null = null;
        let outType = file.type;
        let outName = `resized_${file.name}`;

        if (maxBytes) {
          const enc = await encodeCanvasUnderByteBudget(canvas, 'image/jpeg', maxBytes);
          blob = enc.blob;
          outType = 'image/jpeg';
          outName = outName.replace(/\.[^.]+$/, '') + '.jpg';
        } else {
          blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob((b) => resolve(b), file.type, 0.95);
          });
        }

        if (blob) {
          const url = URL.createObjectURL(blob);
          setResizedUrl(url);
          setResizedFile(new File([blob], outName, { type: outType }));
        }
      } finally {
        setIsProcessing(false);
      }
    } catch (error) {
      console.error("Error resizing image:", error);
      alert("An error occurred while resizing the image.");
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Pixel Resizer</h1>
        <p className="text-xl text-gray-600">Resize image height and width to exact pixel dimensions.</p>
      </div>

      {/* Hidden canvas for processing */}
      <canvas ref={canvasRef} className="hidden" />

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
              <div className="w-16 h-16 bg-sky-100 text-sky-600 rounded-xl flex items-center justify-center shrink-0">
                <ImageIcon className="w-8 h-8" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold text-gray-900 truncate">{file.name}</p>
                {originalDimensions && (
                  <p className="text-sm text-gray-500">
                    Original: {originalDimensions.w} x {originalDimensions.h} px
                  </p>
                )}
              </div>
            </div>

            {!resizedUrl ? (
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Width (px)
                    </label>
                    <input
                      type="number"
                      value={width}
                      onChange={(e) => handleWidthChange(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-shadow"
                      placeholder="e.g. 1920"
                      min="1"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Height (px)
                    </label>
                    <input
                      type="number"
                      value={height}
                      onChange={(e) => handleHeightChange(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-shadow"
                      placeholder="e.g. 1080"
                      min="1"
                    />
                  </div>
                </div>

                <div className="flex items-center">
                  <input
                    id="aspect-ratio"
                    type="checkbox"
                    checked={maintainAspectRatio}
                    onChange={(e) => setMaintainAspectRatio(e.target.checked)}
                    className="w-4 h-4 text-sky-600 bg-gray-100 border-gray-300 rounded focus:ring-sky-500"
                  />
                  <label htmlFor="aspect-ratio" className="ml-2 text-sm font-medium text-gray-700">
                    Maintain aspect ratio
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max output size (optional, KB)
                  </label>
                  <input
                    type="number"
                    min={1}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 outline-none"
                    placeholder="e.g. 200 — uses JPEG tuning"
                    value={maxTargetKb}
                    onChange={(e) => setMaxTargetKb(e.target.value)}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    When set, export uses the same byte-budget encoder as the form resizer (JPEG).
                  </p>
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    onClick={resizeImage}
                    disabled={isProcessing || !width || !height}
                    className="flex-1 py-4 bg-sky-600 text-white text-lg font-bold rounded-xl hover:bg-sky-700 transition-colors disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
                  >
                    <Maximize className="w-5 h-5" />
                    {isProcessing ? 'Resizing...' : 'Resize Image'}
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
                  <h3 className="text-2xl font-bold text-green-800 mb-4">Image resized!</h3>
                  <div className="flex justify-center gap-8 mb-6 text-sm">
                    <div>
                      <p className="text-gray-500">New Dimensions</p>
                      <p className="font-semibold text-gray-900">{width} x {height} px</p>
                    </div>
                    {resizedFile && (
                      <div>
                        <p className="text-gray-500">New Size</p>
                        <p className="font-semibold text-gray-900">{(resizedFile.size / 1024).toFixed(2)} KB</p>
                      </div>
                    )}
                  </div>
                  <a
                    href={resizedUrl}
                    download={resizedFile?.name || `resized_${file.name}`}
                    className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 transition-colors shadow-md"
                  >
                    <Download className="w-6 h-6" />
                    Download Image
                  </a>
                </div>
                <button
                  onClick={() => { setFile(null); setResizedUrl(null); }}
                  className="text-gray-600 hover:text-gray-900 font-medium"
                >
                  Resize another Image
                </button>
              </div>
            )}
          </div>
          
          {/* Preview */}
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-100 rounded-xl border border-gray-200 p-4 overflow-hidden">
            {resizedUrl ? (
              <img src={resizedUrl} alt="Resized preview" className="max-w-full max-h-[400px] object-contain" />
            ) : (
              <img src={URL.createObjectURL(file)} alt="Original preview" className="max-w-full max-h-[400px] object-contain opacity-50" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
