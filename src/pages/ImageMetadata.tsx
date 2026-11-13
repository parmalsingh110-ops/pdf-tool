import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Camera, Copy, Check } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { safeRevokeUrl, useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

interface ExifData {
  [key: string]: string;
}

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
      if (view.getUint16(0) === 0xffd8) {
        let offset = 2;
        while (offset < view.byteLength - 2) {
          const marker = view.getUint16(offset);
          if (marker === 0xffe1) {
            // Check for "Exif\0\0"
            const exifStr = String.fromCharCode(
              view.getUint8(offset + 4),
              view.getUint8(offset + 5),
              view.getUint8(offset + 6),
              view.getUint8(offset + 7),
            );
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
                0x010f: 'Camera Make',
                0x0110: 'Camera Model',
                0x0112: 'Orientation',
                0x011a: 'X Resolution',
                0x011b: 'Y Resolution',
                0x0132: 'Date/Time',
                0x8769: 'ExifIFD',
                0xa002: 'Image Width',
                0xa003: 'Image Height',
                0x9003: 'Date Taken',
                0x920a: 'Focal Length',
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
                if (type === 2 && count > 4) {
                  meta[name] = readString(tiffOffset + valueOffset, count);
                } else if (type === 3) {
                  meta[name] = view.getUint16(entryOffset + 8, littleEndian).toString();
                } else if (type === 4) {
                  meta[name] = valueOffset.toString();
                } else if (type === 5 && count === 1) {
                  const num = view.getUint32(tiffOffset + valueOffset, littleEndian);
                  const den = view.getUint32(tiffOffset + valueOffset + 4, littleEndian);
                  meta[name] = den ? `${(num / den).toFixed(1)}` : num.toString();
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
      const imgObjUrl = URL.createObjectURL(file);
      img.onload = () => {
        safeRevokeUrl(imgObjUrl);
        meta['Image Width'] = meta['Image Width'] || `${img.naturalWidth}`;
        meta['Image Height'] = meta['Image Height'] || `${img.naturalHeight}`;
        meta['Aspect Ratio'] = `${(img.naturalWidth / img.naturalHeight).toFixed(2)}`;
        resolve(meta);
      };
      img.onerror = () => {
        safeRevokeUrl(imgObjUrl);
        resolve(meta);
      };
      img.src = imgObjUrl;
    };
    reader.readAsArrayBuffer(file);
  });
}

export default function ImageMetadata() {
  useSEO('Image Metadata Online Free | PDF Media Suite', 'Free online Image Metadata tool. No signup or installation required.');

  usePageSEO('Image EXIF Metadata Viewer', 'Read EXIF data from photos — camera make, model, date taken, dimensions. Free online EXIF viewer.');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ExifData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  const prefersReduced = useReducedMotion();
  useAutoRevokeUrl(preview);

  const handleDrop = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setLoading(true);
    try {
      const meta = await readExif(f);
      setMetadata(meta);
    } finally {
      setLoading(false);
    }
  };

  const copyJson = async () => {
    if (!metadata) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(metadata, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const entries = metadata ? Object.entries(metadata) : [];

  return (
    <ToolWorkspaceShell
      title="Image Metadata Viewer"
      subtitle="Read EXIF data — camera make, model, focal length, capture date, and pixel dimensions."
      categoryLabel="EXIF Binary Inspector"
      icon={Camera}
      microVariant="compare"
      tone="amber"
      trustNote="Client-side binary DataView EXIF parser · Zero uploads"
    >
      <PearlStageSwitch stageKey={!file ? 'drop' : 'inspect'}>
        {!file ? (
          <div className="max-w-2xl mx-auto">
            <FileDropzone
              onDrop={handleDrop}
              multiple={false}
              accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.tiff'] }}
              title="Select Image to inspect"
              subtitle="Drop JPG, PNG, WebP, or TIFF photo here"
            />
          </div>
        ) : (
          <div className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
            <div className="relative pms-glass-panel rounded-3xl p-4 sm:p-5 overflow-hidden">
              <PearlScanOverlay active={loading} label="Reading binary EXIF headers…" />
              <div className="pms-checkerboard bg-white dark:bg-slate-950 rounded-2xl border border-[var(--pms-border)] p-4 flex items-center justify-center min-h-[340px]">
                {preview && <img src={preview} alt={file.name} className="max-h-[52vh] rounded-lg shadow-sm object-contain" />}
              </div>
            </div>

            <div className="pms-glass-panel rounded-3xl p-6 space-y-4 max-h-[72vh] overflow-y-auto">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                  <Camera className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  EXIF &amp; File Tags
                </h3>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[var(--pms-soft-rose)] text-amber-700 dark:text-amber-300">
                    <AnimatedNumber value={entries.length} suffix=" tags" />
                  </span>
                  {metadata && (
                    <button
                      type="button"
                      onClick={copyJson}
                      className="p-1.5 rounded-xl bg-white/80 dark:bg-slate-800 border border-[var(--pms-border)] text-gray-600 dark:text-slate-300 hover:text-amber-600 transition-colors cursor-pointer"
                      title="Copy metadata as JSON"
                    >
                      {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {entries.map(([key, value], idx) => (
                  <motion.div
                    key={key}
                    initial={prefersReduced ? false : { opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: idx * 0.025 }}
                    className="flex justify-between items-start gap-3 py-2 px-3 rounded-xl bg-white/65 dark:bg-slate-800/50 border border-[var(--pms-border)]"
                  >
                    <span className="text-xs text-gray-500 dark:text-slate-400 font-semibold">{key}</span>
                    <span className="text-xs font-bold text-gray-900 dark:text-white text-right max-w-[60%] break-words">
                      {value}
                    </span>
                  </motion.div>
                ))}
              </div>

              <button
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                  setMetadata(null);
                }}
                className="w-full py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-2xl font-semibold text-sm hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Check another image
              </button>
            </div>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
