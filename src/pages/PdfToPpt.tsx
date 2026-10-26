import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Presentation, Zap, CheckCircle2, Download, RotateCcw,
  AlertTriangle, Cpu, Image, ChevronRight, Layers
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pptxgen from 'pptxgenjs';
import FileDropzone from '../components/FileDropzone';
import BackendLoader from '../components/BackendLoader';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { apiFetch } from '../lib/api';
import '../lib/pdfWorker';

type Stage = 'idle' | 'analyzing' | 'converting' | 'backend' | 'done' | 'error';
type Method = 'auto' | 'frontend' | 'backend';
type SlideMode = 'image' | 'text' | 'hybrid';

interface ConversionStats {
  pages: number;
  slides: number;
  method: 'frontend' | 'backend';
  timeMs: number;
  dpi: number;
}

// ─── Detect if scanned ────────────────────────────────────────────────────────
async function detectIfScanned(pdf: pdfjsLib.PDFDocumentProxy): Promise<boolean> {
  let total = 0;
  const check = Math.min(3, pdf.numPages);
  for (let i = 1; i <= check; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    total += tc.items.reduce((s: number, it: any) => s + (it.str || '').trim().length, 0);
  }
  return total < 50;
}

// ─── Render a PDF page to a base64 PNG at given DPI ─────────────────────────
async function renderPageToBase64(page: pdfjsLib.PDFPageProxy, dpi: number): Promise<string> {
  const scale = dpi / 72;
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
  return canvas.toDataURL('image/png');
}

// ─── Extract text spans from a page ─────────────────────────────────────────
interface TextBlock {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  bold: boolean;
}

async function extractTextBlocks(page: pdfjsLib.PDFPageProxy): Promise<TextBlock[]> {
  const tc = await page.getTextContent({ includeMarkedContent: false } as any);
  const vp = page.getViewport({ scale: 1 });
  const pageH = vp.height;

  return (tc.items as any[])
    .filter((it: any) => it.str && it.str.trim())
    .map((it: any) => {
      const [, , , h, x, y] = it.transform || [1, 0, 0, 12, 0, 0];
      const fontSize = Math.abs(h) || 12;
      return {
        str: it.str,
        x: x / vp.width,
        y: (pageH - y - fontSize) / pageH,
        w: Math.max((it.width || fontSize * 5) / vp.width, 0.05),
        h: Math.max(fontSize * 1.3 / pageH, 0.02),
        fontSize,
        bold: (it.fontName || '').toLowerCase().includes('bold'),
      };
    });
}

// ─── Frontend PPT conversion ─────────────────────────────────────────────────
async function convertFrontend(
  file: File,
  dpi: number,
  slideMode: SlideMode,
  onProgress: (msg: string) => void
): Promise<{ blob: Blob; stats: ConversionStats }> {
  const t0 = Date.now();
  onProgress('Loading PDF...');
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const numPages = pdf.numPages;

  const prs = new pptxgen();
  prs.defineLayout({ name: 'PDF', width: 10, height: 7.5 });
  prs.layout = 'PDF';

  for (let p = 1; p <= numPages; p++) {
    onProgress(`Rendering slide ${p} of ${numPages}...`);
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });

    // Set slide dimensions to match PDF page aspect ratio
    const aspectRatio = vp.height / vp.width;
    const slideW = 10;
    const slideH = Math.min(slideW * aspectRatio, 7.5);
    prs.defineLayout({ name: `SLIDE_${p}`, width: slideW, height: slideH });

    const slide = prs.addSlide();

    if (slideMode === 'image' || slideMode === 'hybrid') {
      // Render page as high-DPI image
      const imgData = await renderPageToBase64(page, dpi);
      slide.addImage({ data: imgData, x: 0, y: 0, w: '100%', h: '100%' });
    }

    if (slideMode === 'text' || slideMode === 'hybrid') {
      // Add text elements
      const blocks = await extractTextBlocks(page);

      if (slideMode === 'text') {
        // Text-only: add white background first
        slide.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: 'FFFFFF' } });
      }

      for (const blk of blocks) {
        const textColor = slideMode === 'hybrid' ? 'FFFFFF' : '1e293b';
        const fontSize = Math.max(8, Math.min(Math.round(blk.fontSize * 0.9), 36));
        try {
          slide.addText(blk.str, {
            x: blk.x * slideW,
            y: blk.y * slideH,
            w: blk.w * slideW,
            h: blk.h * slideH,
            fontSize,
            bold: blk.bold,
            color: slideMode === 'hybrid' ? '00000000' : textColor, // invisible in hybrid
            fontFace: 'Calibri',
            wrap: false,
            isTextBox: true,
          });
        } catch {
          // skip problematic blocks
        }
      }
    }
  }

  onProgress('Packaging PPTX...');
  const arrayBuf = await prs.write({ outputType: 'arraybuffer' }) as ArrayBuffer;
  const blob = new Blob([arrayBuf], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  });

  return {
    blob,
    stats: { pages: numPages, slides: numPages, method: 'frontend', timeMs: Date.now() - t0, dpi }
  };
}

// ─── Backend conversion ───────────────────────────────────────────────────────
async function convertBackend(file: File, dpi: number): Promise<Blob> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('dpi', String(dpi));
  const res = await apiFetch('/convert/pdf-to-ppt', { method: 'POST', body: formData });
  if (!res.ok) throw new Error(await res.text() || 'Backend conversion failed.');
  return res.blob();
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function PdfToPpt() {
  useSEO(
    'PDF to PowerPoint Converter — Instant Online Free | PDF Media Suite',
    'Convert PDF to PowerPoint PPTX instantly in browser. Each page becomes a slide with perfect image quality. No upload needed for standard PDFs. Choose quality DPI.'
  );
  usePageSEO(
    'PDF to PowerPoint — Instant Browser Converter with DPI Control',
    'Renders PDF pages to high-quality PPTX slides using pdfjs-dist and pptxgenjs. Backend only for scanned/complex PDFs.',
  );

  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<ConversionStats | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [method, setMethod] = useState<Method>('auto');
  const [dpi, setDpi] = useState(150);
  const [slideMode, setSlideMode] = useState<SlideMode>('hybrid');

  const resultUrlRef = useRef<string | null>(null);
  useEffect(() => {
    resultUrlRef.current = resultUrl;
  }, [resultUrl]);

  useEffect(() => {
    return () => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, []);

  const handleDrop = useCallback(async (files: File[]) => {
    if (!files.length) return;
    const f = files[0];
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      setResultUrl(null);
    }
    setFile(f);
    setErrorMsg('');
    setStats(null);

    try {
      setStage('analyzing');
      setProgress('Analyzing PDF...');
      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const isScanned = await detectIfScanned(pdf);

      const useBackend = method === 'backend' || (method === 'auto' && isScanned && slideMode !== 'image');

      if (useBackend) {
        setStage('backend');
        const blob = await convertBackend(f, dpi);
        setResultUrl(URL.createObjectURL(blob));
        setStats({ pages: pdf.numPages, slides: pdf.numPages, method: 'backend', timeMs: 0, dpi });
      } else {
        setStage('converting');
        const { blob, stats: s } = await convertFrontend(f, dpi, slideMode, (msg) => setProgress(msg));
        setResultUrl(URL.createObjectURL(blob));
        setStats(s);
      }
      setStage('done');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Conversion failed.');
      setStage('error');
    }
  }, [method, dpi, slideMode]);

  const reset = () => {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    setFile(null);
    setStage('idle');
    setResultUrl(null);
    setErrorMsg('');
    setStats(null);
    setProgress('');
  };

  return (
    <div className="flex-1 w-full bg-gradient-to-br from-slate-50 via-orange-50/30 to-rose-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">

        {/* Header */}
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-rose-600 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-200 dark:shadow-orange-900/50 mx-auto mb-4">
            <Presentation className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-2">PDF to PowerPoint</h1>
          <p className="text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
            Instant browser-side conversion. Each page becomes a crisp high-DPI slide. Choose image quality and slide style.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {[
              { icon: Zap, t: 'Instant in browser', color: 'text-amber-500' },
              { icon: Image, t: 'HD slide images', color: 'text-orange-500' },
              { icon: Layers, t: 'Image + text layer', color: 'text-blue-500' },
              { icon: Cpu, t: 'OCR backend option', color: 'text-purple-500' },
            ].map(({ icon: Icon, t, color }) => (
              <span key={t} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm">
                <Icon className={`w-3.5 h-3.5 ${color}`} />{t}
              </span>
            ))}
          </div>
        </div>

        {stage === 'idle' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 space-y-5">
              {/* Conversion Mode */}
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">Conversion Mode</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: 'auto', label: '⚡ Smart Auto', desc: 'Detects type automatically' },
                    { id: 'frontend', label: '🌐 Browser Only', desc: 'Instant — any PDF' },
                    { id: 'backend', label: '🧠 AI Backend', desc: 'Accurate OCR backend' },
                  ] as { id: Method; label: string; desc: string }[]).map(m => (
                    <button
                      key={m.id}
                      onClick={() => setMethod(m.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${method === m.id
                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 hover:border-orange-300'}`}
                    >
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{m.label}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Slide Mode */}
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">Slide Style</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: 'hybrid', label: '🖼️ Image + Text', desc: 'Best quality + searchable' },
                    { id: 'image', label: '📸 Image Only', desc: 'Fastest, pixel-perfect' },
                    { id: 'text', label: '📝 Text Only', desc: 'Editable text slides' },
                  ] as { id: SlideMode; label: string; desc: string }[]).map(m => (
                    <button
                      key={m.id}
                      onClick={() => setSlideMode(m.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${slideMode === m.id
                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 hover:border-orange-300'}`}
                    >
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{m.label}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* DPI */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Slide Quality</p>
                  <span className="text-sm font-bold text-orange-600 dark:text-orange-400">{dpi} DPI</span>
                </div>
                <input
                  type="range"
                  min={72}
                  max={300}
                  step={12}
                  value={dpi}
                  onChange={e => setDpi(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-orange-500"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>72 (Fast)</span>
                  <span>150 (Recommended)</span>
                  <span>300 (HD)</span>
                </div>
              </div>
            </div>

            <FileDropzone
              onDrop={handleDrop}
              multiple={false}
              title="Drop PDF to convert to PowerPoint"
              subtitle="Converts instantly in browser • Each page = one crisp slide"
            />

            <div className="bg-orange-50 dark:bg-orange-950/20 rounded-2xl border border-orange-100 dark:border-orange-900 p-4">
              <p className="text-xs font-bold text-orange-800 dark:text-orange-300 mb-2">🎨 Slide Styles Explained:</p>
              <div className="space-y-1">
                {[
                  'Image+Text (Hybrid): Pixel-perfect slide image + invisible searchable text layer',
                  'Image Only: Fastest conversion — pure visual slides like screenshots',
                  'Text Only: Editable text on white background — fonts & sizes preserved',
                ].map(s => (
                  <div key={s} className="flex items-start gap-2">
                    <ChevronRight className="w-3 h-3 text-orange-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-orange-700 dark:text-orange-400">{s}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {stage === 'analyzing' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-8 text-center">
            <div className="w-14 h-14 rounded-full border-4 border-orange-200 border-t-orange-600 animate-spin mx-auto mb-4" />
            <p className="font-bold text-slate-800 dark:text-slate-200">Analyzing PDF...</p>
            <p className="text-sm text-slate-500 mt-1">{progress}</p>
          </div>
        )}

        {stage === 'converting' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-orange-200 dark:border-orange-800 shadow-lg p-8 text-center">
            <div className="w-16 h-16 rounded-full border-4 border-orange-100 border-t-orange-600 animate-spin mx-auto mb-4" />
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 rounded-full text-xs font-bold mb-3">
              <Zap className="w-3 h-3" /> Rendering slides in browser — no upload
            </div>
            <p className="font-bold text-slate-800 dark:text-slate-200">{progress || 'Processing...'}</p>
            <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">Quality: {dpi} DPI</p>
          </div>
        )}

        {stage === 'backend' && (
          <BackendLoader
            title="Backend PPT Conversion…"
            accentColor="orange"
            steps={[
              { icon: '📤', label: 'Uploading', detail: 'Sending PDF to conversion server...' },
              { icon: '🎨', label: 'Rendering', detail: 'Rendering pages at high DPI via PyMuPDF...' },
              { icon: '🖼️', label: 'Building Slides', detail: 'Creating PPTX slides...' },
              { icon: '📝', label: 'Text Layer', detail: 'Adding searchable text overlays...' },
            ]}
            tips={[
              '🎨 Backend only runs for complex scanned PDFs.',
              '⚡ Standard PDFs convert instantly in your browser.',
              '🔒 File auto-deleted from server after download.',
            ]}
          />
        )}

        {stage === 'done' && resultUrl && file && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-lg overflow-hidden">
            <div className="bg-emerald-50 dark:bg-emerald-950/40 px-6 py-5 border-b border-emerald-200 dark:border-emerald-800 flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              <div>
                <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-200">Conversion Complete!</h3>
                <p className="text-sm text-emerald-700 dark:text-emerald-400">Your PowerPoint presentation is ready.</p>
              </div>
            </div>

            {stats && (
              <div className="px-6 pt-4 grid grid-cols-4 gap-3">
                {[
                  { label: 'Slides', val: stats.slides },
                  { label: 'Quality', val: `${stats.dpi} DPI` },
                  { label: 'Style', val: slideMode },
                  { label: 'Method', val: stats.method === 'frontend' ? '⚡ Browser' : '🧠 Backend' },
                ].map(s => (
                  <div key={s.label} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5 capitalize">{s.val}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="p-6 space-y-3">
              <a
                href={resultUrl}
                download={file.name.replace(/\.pdf$/i, '') + '_slides.pptx'}
                className="flex items-center justify-center gap-2 w-full px-6 py-4 bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700 text-white font-bold rounded-xl shadow-md transition-all hover:scale-[1.01]"
              >
                <Download className="w-5 h-5" /> Download PowerPoint (.pptx)
              </a>
              <button
                onClick={reset}
                className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl border border-slate-200 dark:border-slate-700 transition-colors"
              >
                <RotateCcw className="w-4 h-4" /> Convert Another File
              </button>
            </div>
          </div>
        )}

        {stage === 'error' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-red-200 dark:border-red-800 p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-red-800 dark:text-red-200">Conversion Failed</h3>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">{errorMsg}</p>
              </div>
            </div>
            <button onClick={reset} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium">
              <RotateCcw className="w-4 h-4" /> Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
