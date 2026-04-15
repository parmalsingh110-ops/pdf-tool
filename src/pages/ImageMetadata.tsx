import { useState } from 'react';
import { Info, Camera, MapPin, Calendar, Aperture } from 'lucide-react';
import { usePageSEO } from '../lib/usePageSEO';

interface ExifData { [key: string]: string; }

function readExif(file: File): Promise<ExifData> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buf = e.target?.result as ArrayBuffer;
      const view = new DataView(buf);
      const meta: ExifData = {};
      meta['File Name'] = file.name;
      meta['File Size'] = `${(file.size / 1024).toFixed(1)} KB`;
      meta['File Type'] = file.type;
      meta['Last Modified'] = new Date(file.lastModified).toLocaleString();

      // Parse JPEG EXIF
      if (view.getUint16(0) === 0xFFD8) {
        let offset = 2;
        while (offset < view.byteLength - 2) {
          const marker = view.getUint16(offset);
          if (marker === 0xFFE1) { // APP1 = EXIF
            const length = view.getUint16(offset + 2);
            // Check for "Exif\0\0"
            const exifStr = String.fromCharCode(view.getUint8(offset+4), view.getUint8(offset+5), view.getUint8(offset+6), view.getUint8(offset+7));
            if (exifStr === 'Exif') {
              const tiffOffset = offset + 10;
              const littleEndian = view.getUint16(tiffOffset) === 0x4949;
              const ifdOffset = view.getUint32(tiffOffset + 4, littleEndian);
              const numEntries = view.getUint16(tiffOffset + ifdOffset, littleEndian);

              const readString = (off: number, len: number) => {
                let s = '';
                for (let i = 0; i < len; i++) {
                  const c = view.getUint8(off + i);
                  if (c === 0) break;
                  s += String.fromCharCode(c);
                }
                return s;
              };

              const TAGS: Record<number, string> = {
                0x010F: 'Camera Make', 0x0110: 'Camera Model', 0x0112: 'Orientation',
                0x011A: 'X Resolution', 0x011B: 'Y Resolution',
                0x0132: 'Date/Time', 0x8769: 'ExifIFD',
                0xA002: 'Image Width', 0xA003: 'Image Height',
                0x9003: 'Date Taken', 0x920A: 'Focal Length',
              };

              for (let i = 0; i < Math.min(numEntries, 50); i++) {
                const entryOffset = tiffOffset + ifdOffset + 2 + i * 12;
                if (entryOffset + 12 > view.byteLength) break;
                const tag = view.getUint16(entryOffset, littleEndian);
                const type = view.getUint16(entryOffset + 2, littleEndian);
                const count = view.getUint32(entryOffset + 4, littleEndian);
                const valueOffset = view.getUint32(entryOffset + 8, littleEndian);
                const name = TAGS[tag];
                if (!name) continue;
                if (type === 2 && count > 4) { // ASCII string
                  meta[name] = readString(tiffOffset + valueOffset, count);
                } else if (type === 3) { // SHORT
                  meta[name] = view.getUint16(entryOffset + 8, littleEndian).toString();
                } else if (type === 4) { // LONG
                  meta[name] = valueOffset.toString();
                } else if (type === 5 && count === 1) { // RATIONAL
                  const num = view.getUint32(tiffOffset + valueOffset, littleEndian);
                  const den = view.getUint32(tiffOffset + valueOffset + 4, littleEndian);
                  meta[name] = den ? `${(num/den).toFixed(1)}` : num.toString();
                }
              }
            }
            break;
          } else {
            const segLen = view.getUint16(offset + 2);
            offset += 2 + segLen;
          }
        }
      }

      // Get image dimensions via bitmap
      const img = new Image();
      img.onload = () => {
        meta['Image Width'] = meta['Image Width'] || `${img.naturalWidth}`;
        meta['Image Height'] = meta['Image Height'] || `${img.naturalHeight}`;
        meta['Aspect Ratio'] = `${(img.naturalWidth/img.naturalHeight).toFixed(2)}`;
        resolve(meta);
      };
      img.onerror = () => resolve(meta);
      img.src = URL.createObjectURL(file);
    };
    reader.readAsArrayBuffer(file);
  });
}

export default function ImageMetadata() {
  usePageSEO('Image EXIF Metadata Viewer', 'Read EXIF data from photos — camera make, model, date taken, dimensions. Free online EXIF viewer.');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ExifData | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    const meta = await readExif(f);
    setMetadata(meta);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Image Metadata Viewer</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400">Read EXIF data — camera, date, dimensions, and more from your photos.</p>
      </div>
      {!file ? (
        <label className="w-full max-w-3xl flex flex-col items-center justify-center h-72 border-4 border-dashed border-gray-300 dark:border-slate-700 rounded-2xl cursor-pointer bg-white dark:bg-slate-900 hover:border-amber-400 transition-colors">
          <Info className="w-16 h-16 text-gray-400 dark:text-slate-500 mb-4" />
          <span className="text-xl font-bold text-gray-900 dark:text-white">Select Image</span>
          <span className="text-sm text-gray-500 dark:text-slate-400 mt-2">JPG, PNG, WebP</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </label>
      ) : (
        <div className="w-full max-w-4xl flex flex-col lg:flex-row gap-6">
          <div className="flex-1 bg-gray-100 dark:bg-slate-800 rounded-2xl p-4 flex items-center justify-center min-h-[300px]">
            <img src={preview!} className="max-h-[50vh] rounded-lg shadow-lg" />
          </div>
          <div className="w-full lg:w-96 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><Camera className="w-4 h-4" /> Metadata</h3>
            {metadata && Object.entries(metadata).map(([key, value]) => (
              <div key={key} className="flex justify-between items-start py-2 border-b border-gray-100 dark:border-slate-800 last:border-0">
                <span className="text-sm text-gray-500 dark:text-slate-400 font-medium">{key}</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white text-right max-w-[60%] break-words">{value}</span>
              </div>
            ))}
            <button onClick={() => { setFile(null); setPreview(null); setMetadata(null); }} className="w-full py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold mt-4">Check another image</button>
          </div>
        </div>
      )}
    </div>
  );
}
