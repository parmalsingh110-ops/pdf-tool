import { useState, useEffect, useRef } from 'react';
import { Search, Zap, CheckCircle2, Download, RotateCcw, AlertTriangle, Cpu, Cloud, ShieldCheck } from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import BackendLoader from '../components/BackendLoader';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { apiFetch } from '../lib/api';

type Stage = 'idle' | 'processing' | 'done' | 'error';
type Lang = 'eng' | 'hin' | 'hin+eng';
type OcrEngine = 'browser' | 'cloud';

export default function SearchablePdf() {
  useSEO(
    'Make PDF Searchable Online Free — OCR Hidden Text Layer | PDF Media Suite',
    'Convert scanned PDFs into searchable and selectable PDFs online free. Dual-engine OCR runs in-browser or cloud without altering original document appearance.'
  );

  usePageSEO(
    'Make PDF Searchable (OCR) — Browser & Cloud Engine',
    'Convert scanned PDFs into text-searchable PDFs without changing their appearance. Instant browser OCR with zero server upload, or cloud engine with auto-deskew.',
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
        const { width: pdfW, height: pdfH } = pdfLibPage.getSize();

        // Render at 2x resolution for high accuracy OCR
        const vp = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;

        // Fill background white
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, vp.width, vp.height);

        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

        setBrowserProgress({
          currentPage: pageNum,
          totalPages: total,
          percent: 15,
          status: `Running OCR on page ${pageNum} of ${total}...`,
        });

        const ret = await worker.recognize(canvas);
        const dataAny = ret.data as any;
        const words: any[] = dataAny.words || dataAny.lines?.flatMap((l: any) => l.words || []) || [];

        const scaleX = pdfW / vp.width;
        const scaleY = pdfH / vp.height;

        for (const w of words) {
          const text = (w.text || '').trim();
          if (!text) continue;

          const x0 = w.bbox.x0 * scaleX;
          const y0 = w.bbox.y0 * scaleY;
          const y1 = w.bbox.y1 * scaleY;

          const wordH = y1 - y0;
          // PDF coordinate system (0,0 is bottom-left)
          const pdfY = pdfH - y1;

          try {
            // Draw invisible searchable text exactly over the scanned word image
            pdfLibPage.drawText(text, {
              x: x0,
              y: pdfY,
              size: Math.max(6, Math.min(36, wordH * 0.85)),
              font: helvetica,
              color: rgb(0, 0, 0),
              opacity: 0, // 100% invisible so scan looks pristine, but text is selectable & searchable!
            });
          } catch {
            // Ignore glyph encoding errors on non-standard symbols
          }
        }

        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }

      await worker.terminate();

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

  // ── CLOUD OCR (Server-side with OCRmyPDF & Ghostscript) ─────────────────────
  const processCloudOcr = async (inputFile: File) => {
    setStage('processing');
    setErrorMsg('');

    try {
      const formData = new FormData();
      formData.append('file', inputFile);
      formData.append('lang', lang);
      formData.append('deskew', deskew ? 'true' : 'false');
      formData.append('rotate', 'true');
      formData.append('force_ocr', forceOcr ? 'true' : 'false');

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
    <div className="flex-1 w-full bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900 min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 dark:shadow-blue-900 mx-auto mb-4">
            <Search className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
            Make PDF Searchable
          </h1>
          <p className="text-base md:text-lg text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
            Add a hidden text layer to your scanned PDFs so you can search, select, and copy text freely.
          </p>
        </div>

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
                    className={`p-3.5 rounded-xl border-2 text-left transition-all ${
                      engine === 'browser'
                        ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 text-blue-950 dark:text-blue-100 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-sm mb-1 text-blue-600 dark:text-blue-400">
                      <Cpu className="w-4 h-4" /> ⚡ Instant Browser OCR
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Recommended: 100% private, zero server bandwidth, runs directly on your device with no limits.
                    </p>
                  </button>

                  {/* Cloud Engine */}
                  <button
                    type="button"
                    onClick={() => setEngine('cloud')}
                    className={`p-3.5 rounded-xl border-2 text-left transition-all ${
                      engine === 'cloud'
                        ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 text-blue-950 dark:text-blue-100 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-sm mb-1 text-indigo-600 dark:text-indigo-400">
                      <Cloud className="w-4 h-4" /> ☁ Cloud Server OCR
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      OCRmyPDF + Ghostscript backend. Includes automatic deskew and page rotation.
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
                      className={`px-4 py-1.5 text-xs font-bold rounded-lg capitalize transition-colors ${
                        lang === l
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      {l === 'eng' ? 'English' : l === 'hin' ? 'Hindi' : 'Hindi + English'}
                    </button>
                  ))}
                </div>
              </div>

              {engine === 'cloud' && (
                <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="deskew"
                      checked={deskew}
                      onChange={(e) => setDeskew(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="deskew" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Auto-deskew (Straighten crooked pages)
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
                      Force OCR (Re-process pages that already have broken text)
                    </label>
                  </div>
                </div>
              )}
            </div>

            <FileDropzone
              onDrop={handleDrop}
              accept={{ 'application/pdf': ['.pdf'] }}
              multiple={false}
              title="Drop your Scanned PDF here"
              subtitle={
                engine === 'browser'
                  ? '⚡ Fast in-browser OCR (0 MB server data • 100% Private)'
                  : '☁ Cloud OCRmyPDF Archival Engine'
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
                    ? 'Generated 100% in your browser without consuming server bandwidth.'
                    : 'Generated via cloud OCR engine.'}
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
    </div>
  );
}
