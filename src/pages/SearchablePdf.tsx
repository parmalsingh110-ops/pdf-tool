import { useState, useEffect, useRef } from 'react';
import { Search, Zap, CheckCircle2, Download, RotateCcw, AlertTriangle, Cpu, Cloud, ShieldCheck, Sparkles } from 'lucide-react';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import 'regenerator-runtime/runtime';
import fontkit from '@pdf-lib/fontkit';
import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import BackendLoader from '../components/BackendLoader';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { apiFetch } from '../lib/api';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import {
  preprocessCanvasForOcr,
  extractTesseractWords,
  mergeRecoveredBrowserOcrWords,
  embedOcrWordsPixelLocked,
} from '../lib/ocrLayerRenderer';

type Stage = 'idle' | 'processing' | 'done' | 'error';
type Lang = 'eng' | 'hin' | 'hin+eng';
type OcrEngine = 'browser' | 'cloud';

export default function SearchablePdf() {
  useSEO(
    'Make PDF Searchable Online Free — OCR Hidden Text Layer | PDF Media Suite',
    'Convert scanned PDFs into searchable and selectable PDFs online free. Dual-engine OCR runs in-browser or server Pro AI without altering original document appearance.'
  );

  usePageSEO(
    'Make PDF Searchable (OCR) — Pixel-Locked Multi-Layer Engine',
    'Convert scanned PDFs into text-searchable PDFs without changing their appearance. Sub-point 3-Tr text matrix alignment, watermark cleaner, and local RapidOCR AI.',
  );

  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [lang, setLang] = useState<Lang>('eng');

  // Engine: default to browser for 0 server bandwidth & instant execution
  const [engine, setEngine] = useState<OcrEngine>('browser');
  const [deskew, setDeskew] = useState(true);
  const [forceOcr, setForceOcr] = useState(true);
  const [cleanWatermarks, setCleanWatermarks] = useState(true);
  const [strictLocal, setStrictLocal] = useState(true);
  const [indexedWordCount, setIndexedWordCount] = useState<number | null>(null);

  // In-browser OCR progress
  const [browserProgress, setBrowserProgress] = useState<{
    currentPage: number;
    totalPages: number;
    percent: number;
    status: string;
  }>({
    currentPage: 0,
    totalPages: 0,
    percent: 0,
    status: 'Initializing OCR...',
  });

  const resultUrlRef = useRef<string | null>(null);
  useEffect(() => {
    resultUrlRef.current = resultUrl;
  }, [resultUrl]);

  useEffect(() => {
    return () => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, []);

  // ── IN-BROWSER OCR (Zero server bandwidth, 100% private) ───────────────────
  const processBrowserOcr = async (inputFile: File) => {
    setStage('processing');
    setErrorMsg('');

    try {
      setBrowserProgress({
        currentPage: 0,
        totalPages: 0,
        percent: 5,
        status: 'Loading PDF document...',
      });

      const ab = await inputFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(ab, { ignoreEncryption: true });
      const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
      const total = pdfDoc.getPageCount();
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

      let devanagariFont: any = null;
      if (lang === 'hin' || lang === 'hin+eng') {
        try {
          const fontRes = await fetch('/fonts/NotoSansDevanagari-Regular.ttf');
          if (fontRes.ok) {
            const fontBytes = await fontRes.arrayBuffer();
            pdfDoc.registerFontkit(fontkit);
            devanagariFont = await pdfDoc.embedFont(fontBytes);
          }
        } catch (fErr) {
          console.warn('Devanagari font load fallback:', fErr);
        }
      }

      setBrowserProgress({
        currentPage: 0,
        totalPages: total,
        percent: 10,
        status: 'Starting local Tesseract OCR engine...',
      });

      const tesseractLang = lang === 'hin' ? 'hin' : lang === 'hin+eng' ? 'hin+eng' : 'eng';
      const worker = await createWorker(tesseractLang, 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            const pct = Math.round((m.progress || 0) * 100);
            setBrowserProgress((prev) => ({
              ...prev,
              percent: pct,
              status: `Recognizing text (${pct}%)...`,
            }));
          }
        },
      });

      let totalWordsDrawn = 0;
      try {
        for (let i = 0; i < total; i++) {
          const pageNum = i + 1;
          setBrowserProgress({
            currentPage: pageNum,
            totalPages: total,
            percent: 0,
            status: `Rendering page ${pageNum} of ${total}...`,
          });

          const page = await pdfjsDoc.getPage(pageNum);
          const pdfLibPage = pdfDoc.getPage(i);

          // Adaptive ~300-DPI target OCR scale (2500px target width, capped cleanly for RAM)
          const baseVp = page.getViewport({ scale: 1.0 });
          const maxBaseDim = Math.max(baseVp.width, baseVp.height, 1);
          const ocrScale = Math.min(
            3.6,
            Math.max(2.2, 2500 / Math.max(400, baseVp.width)),
            3800 / maxBaseDim
          );
          const vp = page.getViewport({ scale: ocrScale });

          const canvas = document.createElement('canvas');
          canvas.width = Math.round(vp.width);
          canvas.height = Math.round(vp.height);
          const ctx = canvas.getContext('2d')!;

          // Flatten all PDF layers onto clean white composite canvas
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

          setBrowserProgress({
            currentPage: pageNum,
            totalPages: total,
            percent: 15,
            status: cleanWatermarks
              ? `Cleaning watermarks & running Pass 1 OCR on page ${pageNum} of ${total}...`
              : `Running OCR on page ${pageNum} of ${total}...`,
          });

          let ocrSourceCanvas: HTMLCanvasElement = canvas;
          let cleanedCanvas: HTMLCanvasElement | null = null;
          if (cleanWatermarks) {
            cleanedCanvas = preprocessCanvasForOcr(canvas);
            ocrSourceCanvas = cleanedCanvas;
          }

          // CRITICAL: In Tesseract.js v7+, blocks: true is required to populate words & bounding boxes!
          const ret = await worker.recognize(ocrSourceCanvas, {}, { blocks: true });
          let words = extractTesseractWords(ret.data);

          // Pass 2 Dual-Recovery: recover any faint ink-saver / thin words missed by watermark pass
          if (cleanWatermarks) {
            setBrowserProgress({
              currentPage: pageNum,
              totalPages: total,
              percent: 65,
              status: `Running Pass 2 ink-recovery check on page ${pageNum} of ${total}...`,
            });
            const rawRet = await worker.recognize(canvas, {}, { blocks: true });
            const rawWords = extractTesseractWords(rawRet.data);
            words = mergeRecoveredBrowserOcrWords(words, rawWords, canvas);
          }

          totalWordsDrawn += embedOcrWordsPixelLocked(
            pdfLibPage,
            vp,
            words,
            helvetica,
            devanagariFont
          );

          if (cleanedCanvas) {
            cleanedCanvas.width = 0;
            cleanedCanvas.height = 0;
          }
          canvas.width = 0;
          canvas.height = 0;
          page.cleanup();
        }
      } finally {
        await worker.terminate();
      }

      setIndexedWordCount(totalWordsDrawn);

      setBrowserProgress({
        currentPage: total,
        totalPages: total,
        percent: 100,
        status: 'Finalizing searchable PDF...',
      });

      const outBytes = await pdfDoc.save();
      const blob = new Blob([outBytes as any], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
      setStage('done');
    } catch (err: any) {
      console.error('Browser OCR failed:', err);
      setErrorMsg(err?.message || 'Browser OCR encountered an error. Please try again.');
      setStage('error');
    }
  };

  // ── SERVER PRO OCR (RapidOCR ONNX + OpenCV Watermark Cleaner + 3-Tr Pixel-Lock) ──
  const processCloudOcr = async (inputFile: File) => {
    setStage('processing');
    setErrorMsg('');
    setIndexedWordCount(null);

    try {
      const formData = new FormData();
      formData.append('file', inputFile);
      formData.append('lang', lang);
      formData.append('deskew', deskew ? 'true' : 'false');
      formData.append('rotate', 'true');
      formData.append('force_ocr', forceOcr ? 'true' : 'false');
      formData.append('strict_local', strictLocal ? 'true' : 'false');
      formData.append('engine_mode', strictLocal ? 'pro_local' : 'hybrid');
      formData.append('clean_watermarks', cleanWatermarks ? 'true' : 'false');

      const res = await apiFetch('/convert/make-searchable', {
        method: 'POST',
        body: formData,
        timeoutMs: 120000, // 2 minutes timeout for cold start / heavy OCR
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Server-side OCR failed.');
      }

      const blob = await res.blob();
      setResultUrl(URL.createObjectURL(blob));
      setStage('done');
    } catch (e: any) {
      console.error('Cloud OCR failed:', e);
      setErrorMsg(e?.message || 'Could not connect to the cloud server.');
      setStage('error');
    }
  };

  const handleDrop = async (files: File[]) => {
    if (!files.length) return;
    const f = files[0];
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
    }
    setFile(f);

    if (engine === 'browser') {
      await processBrowserOcr(f);
    } else {
      await processCloudOcr(f);
    }
  };

  const retryWithBrowserOcr = async () => {
    if (!file) return;
    setEngine('browser');
    await processBrowserOcr(file);
  };

  const reset = () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFile(null);
    setStage('idle');
    setResultUrl(null);
    setErrorMsg('');
  };

  return (
    <ToolWorkspaceShell
      title="Make PDF Searchable"
      subtitle="Add a hidden text layer to your scanned PDFs so you can search, select, and copy text freely."
      categoryLabel="OCR Engine · Dual Browser & Pro AI"
      icon={Search}
      microVariant="ocr"
      tone="blue"
    >
      <div className="max-w-3xl mx-auto">

        {stage === 'idle' && (
          <div className="space-y-6">
            {/* Engine Selector */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
                  Select OCR Engine
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Browser Engine */}
                  <button
                    type="button"
                    onClick={() => setEngine('browser')}
                    className={`p-3.5 rounded-xl border-2 text-left transition-all ${engine === 'browser'
                        ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 text-blue-950 dark:text-blue-100 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                      }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-sm mb-1 text-blue-600 dark:text-blue-400">
                      <Cpu className="w-4 h-4" /> ⚡ Instant Browser OCR (Pixel-Lock 3-Tr)
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      100% private in-device OCR with watermark cleaner, CropBox/Rotate sync &amp; exact 3-Tr text matrix alignment.
                    </p>
                  </button>

                  {/* Server Pro AI Engine */}
                  <button
                    type="button"
                    onClick={() => setEngine('cloud')}
                    className={`p-3.5 rounded-xl border-2 text-left transition-all ${engine === 'cloud'
                        ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 text-blue-950 dark:text-blue-100 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                      }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-sm mb-1 text-indigo-600 dark:text-indigo-400">
                      <Cloud className="w-4 h-4" /> 🚀 Server Pro AI (RapidOCR + Denoise)
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Uses RapidOCR PP-OCRv4 ONNX + OpenCV watermark filter + PyMuPDF 3-Tr sub-point alignment (zero external leaks).
                    </p>
                  </button>
                </div>
              </div>

              {/* Language Selection */}
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                <span className="font-semibold text-slate-700 dark:text-slate-200 text-sm">
                  Recognition Language:
                </span>
                <div className="flex gap-2 w-full sm:w-auto">
                  {(['eng', 'hin', 'hin+eng'] as Lang[]).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLang(l)}
                      className={`px-4 py-1.5 text-xs font-bold rounded-lg capitalize transition-colors ${lang === l
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                        }`}
                    >
                      {l === 'eng' ? 'English' : l === 'hin' ? 'Hindi' : 'Hindi + English'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Shared Multi-Layer & Watermark Filter Option */}
              <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="cleanWatermarks"
                    checked={cleanWatermarks}
                    onChange={(e) => setCleanWatermarks(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="cleanWatermarks" className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>
                      <strong>Multi-Layer &amp; Watermark Cleaner:</strong> Strips yellow/colored stamps &amp; shadows for sharper OCR (original PDF visuals stay 100% untouched)
                    </span>
                  </label>
                </div>

                {engine === 'cloud' && (
                  <>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="deskew"
                        checked={deskew}
                        onChange={(e) => setDeskew(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="deskew" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Auto-deskew (Straighten crooked fallback scans)
                      </label>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="forceOcr"
                        checked={forceOcr}
                        onChange={(e) => setForceOcr(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="forceOcr" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Force OCR (Re-process multi-layer pages that already have partial/broken text)
                      </label>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="strictLocalOcr"
                        checked={strictLocal}
                        onChange={(e) => setStrictLocal(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <label htmlFor="strictLocalOcr" className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        Privacy Lock: Strictly use local Pro AI OCR (RapidOCR + Tesseract) — never upload to iLovePDF API
                      </label>
                    </div>
                  </>
                )}
              </div>
            </div>

            <FileDropzone
              onDrop={handleDrop}
              accept={{ 'application/pdf': ['.pdf'] }}
              multiple={false}
              title="Drop your Scanned PDF here"
              subtitle={
                engine === 'browser'
                  ? '⚡ Pixel-Locked Browser OCR (0 MB server data • CropBox + Watermark Filter)'
                  : '🚀 Server Pro AI (RapidOCR ONNX + OpenCV Denoise + 3-Tr Sub-Point Overlay)'
              }
            />
          </div>
        )}

        {/* Processing View */}
        {stage === 'processing' && (
          <div>
            {engine === 'browser' ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm text-center max-w-lg mx-auto space-y-5">
                <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950/50 rounded-2xl flex items-center justify-center mx-auto text-blue-600 dark:text-blue-400">
                  <Cpu className="w-8 h-8 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-1">
                    Running Browser OCR Engine…
                  </h3>
                  <p className="text-sm text-slate-500">{browserProgress.status}</p>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-400">
                    <span>
                      {browserProgress.totalPages > 0
                        ? `Page ${browserProgress.currentPage} of ${browserProgress.totalPages}`
                        : 'Preparing...'}
                    </span>
                    <span>{browserProgress.percent}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(5, browserProgress.percent)}%` }}
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-left text-xs text-slate-500 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" /> 100% In-Browser Privacy
                  </div>
                  <p>
                    Your document is processed locally using WebAssembly. No data is sent to external servers.
                  </p>
                </div>
              </div>
            ) : (
              <BackendLoader
                title="Running Cloud OCR Engine…"
                accentColor="blue"
                steps={[
                  { icon: '📤', label: 'Uploading', detail: 'Sending scanned PDF to cloud server...' },
                  { icon: '🧠', label: 'OCR Init', detail: 'Loading OCRmyPDF + Ghostscript...' },
                  { icon: '🔍', label: 'Reading', detail: 'Recognizing text character by character...' },
                  { icon: '💾', label: 'Embedding', detail: 'Generating searchable text layer...' },
                ]}
                tips={[
                  '🧠 OCRmyPDF supports high-accuracy Indian language scripts.',
                  '🔍 Auto-deskew straightens pages photographed at an angle.',
                  '⚡ The resulting PDF looks identical but is fully searchable.',
                  '🔒 File is deleted from server immediately after download.',
                ]}
              />
            )}
          </div>
        )}

        {/* Done View */}
        {stage === 'done' && resultUrl && file && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-lg overflow-hidden animate-fade-in">
            <div className="bg-emerald-50 dark:bg-emerald-950/40 px-6 py-5 border-b border-emerald-200 dark:border-emerald-800 flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 shrink-0" />
              <div>
                <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-200">Searchable PDF Ready!</h3>
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  {engine === 'browser'
                    ? `Generated 100% in your browser — ${indexedWordCount ?? 0} searchable words indexed.`
                    : 'Generated via server OCR engine.'}
                </p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <a
                href={resultUrl}
                download={file.name.replace(/\.pdf$/i, '') + '_searchable.pdf'}
                className="flex items-center justify-center gap-2 w-full px-6 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all hover:scale-[1.01]"
              >
                <Download className="w-5 h-5" /> Download Searchable PDF
              </a>
              <button
                onClick={reset}
                className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl border border-slate-200 dark:border-slate-700 transition-colors"
              >
                <RotateCcw className="w-4 h-4" /> Process Another File
              </button>
            </div>
          </div>
        )}

        {/* Error View with Automatic Browser OCR Fallback */}
        {stage === 'error' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-red-200 dark:border-red-800 p-6 shadow-sm space-y-4 animate-fade-in">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-bold text-red-800 dark:text-red-200 text-base">Cloud Server Unavailable</h3>
                <p className="text-xs text-red-700 dark:text-red-300 mt-1">{errorMsg}</p>
              </div>
            </div>

            {/* Smart Recovery Offer */}
            {file && (
              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 space-y-3">
                <div className="flex items-center gap-2 font-bold text-sm text-blue-900 dark:text-blue-200">
                  <Zap className="w-4 h-4 text-blue-600" />
                  Instant Solution: Use Browser OCR Instead!
                </div>
                <p className="text-xs text-blue-800 dark:text-blue-300">
                  The cloud server may be waking up or currently reaching hosting bandwidth limits. You can run OCR directly on your device right now with zero wait time and zero data sent to the server.
                </p>
                <button
                  type="button"
                  onClick={retryWithBrowserOcr}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors text-xs cursor-pointer"
                >
                  <Cpu className="w-4 h-4" /> Run Instant Browser OCR Now (100% Free)
                </button>
              </div>
            )}

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={reset}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white font-semibold"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Start Over with Different File
              </button>
            </div>
          </div>
        )}
      </div>
    </ToolWorkspaceShell>
  );
}
