import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  ImageIcon,
  Download,
  Loader2,
  Package,
  Eye,
  Sparkles,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import JSZip from 'jszip';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { triggerBlobDownload } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

interface ExtractedImage {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  pageIndex: number;
  sizeBytes: number;
}

export default function ExtractAllImages() {
  useSEO(
    'Extract All Images from PDF Online Free — High-Resolution Gallery & ZIP',
    'Extract embedded photos, graphics, and figures from PDF files in full native resolution. Visual thumbnail gallery with 1-click single image or ZIP batch download.'
  );

  usePageSEO(
    'PDF Image Extractor & Gallery Studio',
    'Extract all images and graphics embedded inside any PDF. Browse thumbnails, inspect resolutions, and download in original quality or ZIP archive.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [images, setImages] = useState<ExtractedImage[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [downloadingZip, setDownloadingZip] = useState(false);

  const prefersReduced = useReducedMotion();

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    const f = files[0];
    setFile(f);
    setImages([]);
    setBusy(true);

    try {
      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const extractedList: ExtractedImage[] = [];

      for (let p = 1; p <= pdf.numPages; p++) {
        setProgressMsg(`Scanning page ${p} of ${pdf.numPages}...`);
        const page = await pdf.getPage(p);
        const opList = await page.getOperatorList();

        for (let i = 0; i < opList.fnArray.length; i++) {
          const fn = opList.fnArray[i];
          if (fn === pdfjsLib.OPS.paintImageXObject) {
            const imgName = opList.argsArray[i][0];
            try {
              // @ts-ignore
              const imgObj = await page.objs.get(imgName);
              if (imgObj && imgObj.data) {
                const canvas = document.createElement('canvas');
                canvas.width = imgObj.width;
                canvas.height = imgObj.height;
                const ctx = canvas.getContext('2d')!;

                const imgData = ctx.createImageData(imgObj.width, imgObj.height);
                const srcData = imgObj.data;

                if (imgObj.kind === 1 || imgObj.kind === 2 || imgObj.kind === 3) {
                  let srcIdx = 0;
                  let dstIdx = 0;
                  const totalPixels = imgObj.width * imgObj.height;

                  if (srcData.length === totalPixels * 3) {
                    for (let px = 0; px < totalPixels; px++) {
                      imgData.data[dstIdx] = srcData[srcIdx];
                      imgData.data[dstIdx + 1] = srcData[srcIdx + 1];
                      imgData.data[dstIdx + 2] = srcData[srcIdx + 2];
                      imgData.data[dstIdx + 3] = 255;
                      srcIdx += 3;
                      dstIdx += 4;
                    }
                  } else if (srcData.length === totalPixels * 4) {
                    imgData.data.set(srcData);
                  } else {
                    for (let px = 0; px < totalPixels; px++) {
                      const v = srcData[px];
                      imgData.data[dstIdx] = v;
                      imgData.data[dstIdx + 1] = v;
                      imgData.data[dstIdx + 2] = v;
                      imgData.data[dstIdx + 3] = 255;
                      dstIdx += 4;
                    }
                  }
                  ctx.putImageData(imgData, 0, 0);

                  const dataUrl = canvas.toDataURL(`image/${selectedFormat}`, 0.95);
                  extractedList.push({
                    id: `${imgName}_${p}_${extractedList.length}`,
                    name: `image_p${p}_${imgName}.${selectedFormat}`,
                    dataUrl,
                    width: imgObj.width,
                    height: imgObj.height,
                    pageIndex: p,
                    sizeBytes: Math.round(dataUrl.length * 0.75),
                  });
                }
              }
            } catch {
              // Skip single unrenderable stream
            }
          }
        }
      }

      // If no XObject image streams found, provide high-res page snapshots as images
      if (extractedList.length === 0) {
        setProgressMsg('No isolated XObjects found. Generating full-page photo cuts...');
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const vp = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width;
          canvas.height = vp.height;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

          const dataUrl = canvas.toDataURL(`image/${selectedFormat}`, 0.94);
          extractedList.push({
            id: `page_${p}`,
            name: `page_${p}_extract.${selectedFormat}`,
            dataUrl,
            width: vp.width,
            height: vp.height,
            pageIndex: p,
            sizeBytes: Math.round(dataUrl.length * 0.75),
          });
        }
      }

      setImages(extractedList);
    } catch (err: any) {
      console.error('Extraction error:', err);
      alert(`Image extraction failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setBusy(false);
      setProgressMsg('');
    }
  };

  const downloadAllAsZip = async () => {
    if (images.length === 0) return;
    setDownloadingZip(true);

    try {
      const zip = new JSZip();
      images.forEach((img, idx) => {
        const rawBase64 = img.dataUrl.split(',')[1];
        zip.file(`image_${idx + 1}_page_${img.pageIndex}.${selectedFormat}`, rawBase64, { base64: true });
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      triggerBlobDownload(zipBlob, `${file?.name.replace(/\.pdf$/i, '')}_All_Images.zip`);
    } catch (err) {
      console.error('ZIP compilation error:', err);
    } finally {
      setDownloadingZip(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const reset = () => {
    setFile(null);
    setImages([]);
  };

  const totalBytes = images.reduce((acc, im) => acc + im.sizeBytes, 0);
  const stageKey = !file ? 'upload' : busy ? 'scanning' : 'gallery';

  return (
    <ToolWorkspaceShell
      title="PDF Image Extractor & Gallery"
      subtitle="Extract all embedded photos and graphics from PDF files in full native resolution. Inspect dimensions and download individually or as a ZIP."
      categoryLabel="Bitmap & Asset Studio"
      icon={ImageIcon}
      microVariant="convert"
      tone="blue"
      trustNote="100% browser-only bitmap extraction · Lossless resolution"
    >
      <PearlStageSwitch stageKey={stageKey}>
        {!file ? (
          <div className="w-full max-w-2xl mx-auto space-y-6">
            {/* Output Format Selector */}
            <div className="pms-glass-panel p-1.5 rounded-2xl flex items-center justify-center gap-1.5 max-w-xs mx-auto">
              {(['png', 'jpeg', 'webp'] as const).map(fmt => {
                const active = selectedFormat === fmt;
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setSelectedFormat(fmt)}
                    className={`relative flex-1 py-2 px-3 rounded-xl text-xs font-bold uppercase transition-colors cursor-pointer ${
                      active ? 'text-white' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="extract-img-fmt"
                        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                        className="absolute inset-0 rounded-xl bg-sky-600 shadow-sm"
                      />
                    )}
                    <span className="relative z-10">{fmt}</span>
                  </button>
                );
              })}
            </div>

            <FileDropzone
              onDrop={handleDrop}
              multiple={false}
              title="Select PDF Document to Extract Images From"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              {[
                {
                  icon: Eye,
                  tint: 'bg-[var(--pms-soft-blue)] text-[var(--pms-blue)]',
                  title: 'Gallery Preview',
                  desc: 'Masonry gallery showing native dimensions and aspect ratio.',
                },
                {
                  icon: Package,
                  tint: 'bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)]',
                  title: '1-Click ZIP Bundle',
                  desc: 'Download all extracted pictures compressed in a single ZIP.',
                },
                {
                  icon: Sparkles,
                  tint: 'bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300',
                  title: 'Lossless Quality',
                  desc: 'Pulls raw underlying bitmap streams without downscaling.',
                },
              ].map((card, idx) => (
                <motion.div
                  key={card.title}
                  initial={prefersReduced ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, delay: idx * 0.06 }}
                  whileHover={prefersReduced ? undefined : { y: -3 }}
                  className="pms-glass-panel p-5 rounded-2xl text-center"
                >
                  <div className={`w-10 h-10 rounded-xl ${card.tint} flex items-center justify-center mx-auto mb-2.5`}>
                    <card.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">{card.title}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{card.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        ) : busy ? (
          <div className="relative max-w-lg mx-auto pms-glass-panel rounded-3xl p-12 text-center space-y-4 overflow-hidden">
            <PearlScanOverlay active={busy} label={progressMsg || 'Extracting embedded bitmaps…'} />
            <div className="w-14 h-14 rounded-2xl bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] flex items-center justify-center mx-auto">
              <Loader2 className="w-7 h-7 animate-spin" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">Extracting Embedded Bitmaps…</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{progressMsg || 'Parsing PDF operator lists…'}</p>
          </div>
        ) : (
          <div className="w-full space-y-5">
            {/* Top Control Bar */}
            <div className="relative pms-glass-panel p-4 sm:p-5 rounded-2xl flex flex-wrap items-center justify-between gap-4 overflow-hidden">
              <PearlScanOverlay active={downloadingZip} label="Compiling ZIP archive…" />
              <div className="flex flex-wrap items-center gap-3">
                <span className="px-3 py-1 rounded-full bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] text-xs font-extrabold border border-[var(--pms-border)]">
                  <AnimatedNumber value={images.length} /> Image{images.length === 1 ? '' : 's'}
                </span>
                <span className="px-3 py-1 rounded-full bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] text-xs font-bold border border-[var(--pms-border)]">
                  Total ~<AnimatedNumber value={totalBytes / 1024} decimals={1} suffix=" KB" />
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs">
                  {file.name} · {selectedFormat.toUpperCase()}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <motion.button
                  whileHover={prefersReduced || downloadingZip || images.length === 0 ? undefined : { scale: 1.02 }}
                  whileTap={prefersReduced || downloadingZip || images.length === 0 ? undefined : { scale: 0.98 }}
                  onClick={downloadAllAsZip}
                  disabled={downloadingZip || images.length === 0}
                  className="pms-btn-primary py-2.5 px-5 font-bold rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                >
                  {downloadingZip ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                  Download All (<AnimatedNumber value={images.length} />) as ZIP
                </motion.button>
                <button
                  onClick={reset}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Change File
                </button>
              </div>
            </div>

            {/* Image Gallery Grid */}
            <AnimatePresence initial={false}>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {images.map((img, idx) => (
                  <motion.div
                    key={img.id}
                    initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.24, delay: Math.min(idx * 0.03, 0.35) }}
                    whileHover={prefersReduced ? undefined : { y: -3 }}
                    className="pms-glass-panel rounded-2xl overflow-hidden flex flex-col justify-between"
                  >
                    <div className="p-3 pms-checkerboard dark:bg-slate-950/60 flex items-center justify-center min-h-[180px] max-h-[220px] overflow-hidden">
                      <img
                        src={img.dataUrl}
                        alt={img.name}
                        className="max-h-[180px] object-contain rounded shadow-xs"
                      />
                    </div>

                    <div className="p-3.5 bg-white/75 dark:bg-slate-900/75 border-t border-[var(--pms-border)] space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800 dark:text-slate-100">
                          {img.width} × {img.height} px
                        </span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] font-bold">
                          P{img.pageIndex}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">{formatSize(img.sizeBytes)}</span>
                        <a
                          href={img.dataUrl}
                          download={img.name}
                          className="py-1.5 px-3 bg-white dark:bg-slate-800 hover:bg-sky-600 dark:hover:bg-sky-600 text-slate-700 dark:text-slate-200 hover:text-white text-xs font-bold rounded-lg border border-[var(--pms-border)] transition-colors flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Save
                        </a>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </AnimatePresence>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
