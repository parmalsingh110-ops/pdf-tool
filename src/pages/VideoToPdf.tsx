import React, { useState, useRef } from 'react';
import { 
  Video, Download, Loader2, Sparkles, Sliders, Play, 
  Clock, Camera, Layers, Check, FileText, ArrowRight, Trash2
} from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';

interface CapturedFrame {
  id: string;
  timestampSec: number;
  dataUrl: string;
}

export default function VideoToPdf() {
  useSEO(
    'Video to PDF Storyboard Online Free — Frame Capture & Presentation Slides',
    'Convert MP4, WebM, and MOV videos to PDF storyboards online. Extract frames at custom time intervals, burn timestamps, and layout 1, 2, or 4 slides per page.'
  );

  usePageSEO(
    'Video to PDF Storyboard & Slides Generator Studio',
    'Capture video presentation slides and export to PDF. Features interval-based extraction, manual snapshot capture, and multi-frame storyboard layouts.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [frames, setFrames] = useState<CapturedFrame[]>([]);

  const [extractMode, setExtractMode] = useState<'interval' | 'count'>('interval');
  const [intervalSec, setIntervalSec] = useState<number>(5);
  const [frameCount, setFrameCount] = useState<number>(10);
  const [burnTimestamp, setBurnTimestamp] = useState<boolean>(true);
  const [layoutMode, setLayoutMode] = useState<'1-per-page' | '2-per-page' | '4-grid'>('1-per-page');

  const [isExtracting, setIsExtracting] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFileName, setResultFileName] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const f = acceptedFiles[0];
      setFile(f);
      setFrames([]);
      setResultUrl(null);
      const url = URL.createObjectURL(f);
      setVideoSrc(url);
    }
  };

  const onLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  // Manual snapshot capture from video player
  const captureCurrentFrame = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth || 1280;
    canvas.height = v.videoHeight || 720;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setFrames(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        timestampSec: v.currentTime,
        dataUrl
      }
    ]);
  };

  // Automated Batch Interval Capture
  const startBatchExtraction = async () => {
    if (!file || !videoSrc) return;
    setIsExtracting(true);
    setFrames([]);

    const video = document.createElement('video');
    video.src = videoSrc;
    video.muted = true;
    video.crossOrigin = 'anonymous';

    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = (e) => reject(e);
      });

      const totalDur = video.duration;
      const targetTimestamps: number[] = [];

      if (extractMode === 'interval') {
        for (let t = 0; t < totalDur; t += intervalSec) {
          targetTimestamps.push(t);
        }
      } else {
        const step = totalDur / Math.max(frameCount, 1);
        for (let i = 0; i < frameCount; i++) {
          targetTimestamps.push(i * step);
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d')!;

      const captured: CapturedFrame[] = [];

      for (let i = 0; i < targetTimestamps.length; i++) {
        const t = targetTimestamps[i];
        setProgressMsg(`Capturing frame ${i + 1} of ${targetTimestamps.length} (${Math.round(t)}s)...`);
        video.currentTime = t;

        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
        });

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);

        captured.push({
          id: `frame_${i}`,
          timestampSec: t,
          dataUrl
        });
      }

      setFrames(captured);
    } catch (err: any) {
      console.error('Frame extraction error:', err);
      alert(`Frame extraction failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsExtracting(false);
      setProgressMsg('');
    }
  };

  const removeFrame = (id: string) => {
    setFrames(prev => prev.filter(f => f.id !== id));
  };

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Compile PDF Storyboard
  const generatePdfStoryboard = async () => {
    if (frames.length === 0) return;
    setIsExtracting(true);
    setProgressMsg('Compiling PDF storyboard layout...');

    try {
      const pdfDoc = await PDFDocument.create();
      const helvetica = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      if (layoutMode === '1-per-page') {
        for (const f of frames) {
          const imgBytes = dataUrlToBytes(f.dataUrl);
          const pdfImg = await pdfDoc.embedJpg(imgBytes);

          const pageW = 841.89; // A4 Landscape
          const pageH = 595.28;
          const page = pdfDoc.addPage([pageW, pageH]);

          // Fit image preserving aspect ratio
          const scale = Math.min((pageW - 40) / pdfImg.width, (pageH - 60) / pdfImg.height);
          const dw = pdfImg.width * scale;
          const dh = pdfImg.height * scale;
          const dx = (pageW - dw) / 2;
          const dy = (pageH - dh) / 2;

          page.drawImage(pdfImg, { x: dx, y: dy, width: dw, height: dh });

          if (burnTimestamp) {
            page.drawRectangle({
              x: dx + 10,
              y: dy + 10,
              width: 70,
              height: 22,
              color: rgb(0, 0, 0),
              opacity: 0.75
            });
            page.drawText(formatTime(f.timestampSec), {
              x: dx + 18,
              y: dy + 16,
              size: 11,
              font: helvetica,
              color: rgb(1, 1, 1)
            });
          }
        }
      } else {
        // Multi-frame Grid Layout
        const framesPerPage = layoutMode === '2-per-page' ? 2 : 4;
        const pageW = 595.28; // A4 Portrait
        const pageH = 841.89;

        for (let i = 0; i < frames.length; i += framesPerPage) {
          const page = pdfDoc.addPage([pageW, pageH]);
          const slice = frames.slice(i, i + framesPerPage);

          if (layoutMode === '2-per-page') {
            for (let j = 0; j < slice.length; j++) {
              const f = slice[j];
              const imgBytes = dataUrlToBytes(f.dataUrl);
              const pdfImg = await pdfDoc.embedJpg(imgBytes);

              const dw = pageW - 60;
              const dh = (dw / pdfImg.width) * pdfImg.height;
              const dx = 30;
              const dy = j === 0 ? pageH - dh - 50 : 50;

              page.drawImage(pdfImg, { x: dx, y: dy, width: dw, height: dh });

              if (burnTimestamp) {
                page.drawText(`Timestamp: ${formatTime(f.timestampSec)}`, {
                  x: dx,
                  y: dy - 15,
                  size: 10,
                  font: helvetica,
                  color: rgb(0.2, 0.2, 0.2)
                });
              }
            }
          } else {
            // 4 Grid
            for (let j = 0; j < slice.length; j++) {
              const f = slice[j];
              const imgBytes = dataUrlToBytes(f.dataUrl);
              const pdfImg = await pdfDoc.embedJpg(imgBytes);

              const col = j % 2;
              const row = Math.floor(j / 2);
              const dw = (pageW - 60) / 2;
              const dh = (dw / pdfImg.width) * pdfImg.height;
              const dx = 20 + col * (dw + 20);
              const dy = pageH - (row + 1) * (dh + 60) - 20;

              page.drawImage(pdfImg, { x: dx, y: dy, width: dw, height: dh });

              if (burnTimestamp) {
                page.drawText(formatTime(f.timestampSec), {
                  x: dx,
                  y: dy - 14,
                  size: 9,
                  font: helvetica,
                  color: rgb(0.3, 0.3, 0.3)
                });
              }
            }
          }
        }
      }

      const finalBytes = await pdfDoc.save();
      const blob = new Blob([finalBytes as any], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
      setResultFileName(`${file?.name.replace(/\.[^/.]+$/, '')}_Storyboard.pdf`);
    } catch (err: any) {
      console.error('Storyboard compilation error:', err);
      alert(`Storyboard compilation failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsExtracting(false);
      setProgressMsg('');
    }
  };

  const reset = () => {
    setFile(null);
    setVideoSrc(null);
    setFrames([]);
    setResultUrl(null);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-4 sm:p-8 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm border border-violet-100 dark:border-violet-900/50">
          <Video className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-2">
          Video to PDF Storyboard Studio
        </h1>
        <p className="text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          Capture presentation slides, lecture frames, and video scenes into high-resolution PDF documents with timestamps.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl space-y-6">
          <FileDropzone 
            onDrop={handleDrop} 
            multiple={false} 
            title="Select Video File (MP4, WebM, MOV)" 
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Clock className="w-6 h-6 text-violet-600 dark:text-violet-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Custom Intervals</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Extract frames automatically every 2s, 5s, 10s, or 30s.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Camera className="w-6 h-6 text-indigo-600 dark:text-indigo-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Snap Any Moment</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Scrub video player and capture exact keyframes with 1 click.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Layers className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Multi-Slide Grids</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Export 1-slide landscape, 2-stacked, or 4-contact sheets.</p>
            </div>
          </div>
        </div>
      ) : resultUrl ? (
        /* Result Screen */
        <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-xl text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <Check className="w-10 h-10" />
          </div>

          <div>
            <span className="inline-block px-3 py-1 bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
              Storyboard Created
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              Video PDF Ready!
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
              Compiled {frames.length} video frame{frames.length === 1 ? '' : 's'} into a high-res PDF storyboard.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <a
              href={resultUrl}
              download={resultFileName}
              className="flex-1 py-4 px-6 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-2xl shadow-lg shadow-violet-600/20 flex items-center justify-center gap-2 text-base transition-all"
            >
              <Download className="w-5 h-5" />
              Download PDF Storyboard
            </a>
            <button
              onClick={reset}
              className="py-4 px-6 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-2xl transition-all text-sm"
            >
              Process Another Video
            </button>
          </div>
        </div>
      ) : (
        /* Workspace */
        <div className="w-full space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Video Player & Controls */}
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="rounded-xl overflow-hidden bg-black max-h-[380px] flex items-center justify-center">
                <video
                  ref={videoRef}
                  src={videoSrc || ''}
                  controls
                  onLoadedMetadata={onLoadedMetadata}
                  className="max-h-[360px] w-full"
                />
              </div>

              {/* Snap Current Frame Button */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Duration: {formatTime(duration)}</span>
                <button
                  onClick={captureCurrentFrame}
                  className="py-2 px-4 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Snap This Frame
                </button>
              </div>

              {/* Automated Extraction Config */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Automatic Frame Extraction
                </span>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Extraction Method</label>
                    <select
                      value={extractMode}
                      onChange={e => setExtractMode(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                    >
                      <option value="interval">Every N Seconds</option>
                      <option value="count">Fixed Frame Count</option>
                    </select>
                  </div>

                  {extractMode === 'interval' ? (
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Interval Seconds</label>
                      <input
                        type="number"
                        min="1"
                        max="120"
                        value={intervalSec}
                        onChange={e => setIntervalSec(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Target Total Frames</label>
                      <input
                        type="number"
                        min="2"
                        max="60"
                        value={frameCount}
                        onChange={e => setFrameCount(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                      />
                    </div>
                  )}
                </div>

                <button
                  onClick={startBatchExtraction}
                  disabled={isExtracting}
                  className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-violet-600" />
                      <span>{progressMsg || 'Extracting frames...'}</span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-4 h-4 text-violet-600" />
                      <span>Run Automatic Frame Extractor</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right: Layout & PDF Settings */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Storyboard Layout & Settings</h3>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Slides per Page</label>
                <div className="space-y-2">
                  {[
                    { id: '1-per-page', label: '1 Slide per Page (Full Screen A4 Landscape)' },
                    { id: '2-per-page', label: '2 Slides Stacked (A4 Portrait)' },
                    { id: '4-grid', label: '4 Slides Grid (Storyboard Sheet)' }
                  ].map(opt => (
                    <label key={opt.id} className="flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="layout"
                        checked={layoutMode === opt.id}
                        onChange={() => setLayoutMode(opt.id as any)}
                        className="text-violet-600"
                      />
                      <span className="font-medium text-slate-800 dark:text-slate-200">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t dark:border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={burnTimestamp}
                    onChange={e => setBurnTimestamp(e.target.checked)}
                    className="rounded text-violet-600"
                  />
                  Burn Video Timestamps onto Slides
                </label>
              </div>

              {/* Action Button */}
              <button
                onClick={generatePdfStoryboard}
                disabled={isExtracting || frames.length === 0}
                className="w-full py-4 px-6 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold rounded-2xl shadow-lg shadow-violet-600/20 flex items-center justify-center gap-2 text-sm transition-all disabled:opacity-40"
              >
                {isExtracting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Compiling PDF Storyboard...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    <span>Compile PDF ({frames.length} Frames)</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Bottom Captured Frames Strip */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Captured Frames ({frames.length})
              </span>
              {frames.length > 0 && (
                <button onClick={() => setFrames([])} className="text-xs text-red-500 font-bold hover:underline">
                  Clear All
                </button>
              )}
            </div>

            {frames.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No frames captured yet. Use the auto-extractor or "Snap This Frame" above.</p>
            ) : (
              <div className="flex items-center gap-3 overflow-x-auto pb-2">
                {frames.map((f, idx) => (
                  <div key={f.id} className="relative shrink-0 w-36 rounded-xl overflow-hidden border bg-black shadow-sm group">
                    <img src={f.dataUrl} alt={`Frame ${idx + 1}`} className="w-full h-20 object-cover" />
                    <span className="absolute bottom-1 left-1 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                      {formatTime(f.timestampSec)}
                    </span>
                    <button
                      onClick={() => removeFrame(f.id)}
                      className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
