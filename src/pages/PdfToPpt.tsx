import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Presentation, Zap, CheckCircle2, Download, RotateCcw,
  AlertTriangle, Cpu, Image, ChevronRight, Layers
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import pptxgen from 'pptxgenjs';
import FileDropzone from '../components/FileDropzone';
import BackendLoader from '../components/BackendLoader';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { apiFetch } from '../lib/api';
import '../lib/pdfWorker';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlProcessCard, PearlStageSwitch } from '../components/pearl/PearlMotion';
import VisionLayerControls from '../components/VisionLayerControls';
import { appendVisionLayerParams, type DocumentLayerMode } from '../lib/advancedVisionEngine';
import { getStoredOcrLang } from '../lib/ocrLanguages';
import {
  SCAN_CONVERTER_ACCEPT,
  detectIfPdfScannedOrOcr,
  isRasterImageFile,
  stripDocumentExt,
} from '../utils/scanDetector';

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

// ─── Detect if scanned (raw image OR OCR-layered scan) ────────────────────────
async function detectIfScanned(pdf: pdfjsLib.PDFDocumentProxy): Promise<boolean> {
  return detectIfPdfScannedOrOcr(pdf);
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
async function convertBackend(
  file: File,
  forceOcr: boolean,
  slideMode: SlideMode,
  layerMode: DocumentLayerMode,
  strictLocal: boolean,
  lang: string
): Promise<Blob> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('force_ocr', forceOcr ? 'true' : 'false');
  const effSlideMode = layerMode === 'layered_replica' ? 'hybrid' : (slideMode === 'text' ? 'structural' : 'structural');
  formData.append('slide_mode', effSlideMode);
  appendVisionLayerParams(formData, { layerMode, strictLocal, lang });
  const res = await apiFetch('/convert/pdf-to-ppt', {
    method: 'POST',
    body: formData,
    timeoutMs: 180000,
    maxRetries: 1,
  });
  if (!res.ok) throw new Error(await res.text() || 'Backend conversion failed.');
  return res.blob();
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function PdfToPpt() {
  const prefersReduced = useReducedMotion();

  useSEO(
    'PDF to PowerPoint Converter — Instant Online Free | PDF Media Suite',
    'Convert PDF to PowerPoint PPTX with editable textboxes, native tables, and crisp visual assets.'
  );
  usePageSEO(
    'PDF to PowerPoint — Precision Slide Reconstructor',
    'Converts digital and scanned PDFs into editable PowerPoint presentations while keeping layouts and visuals sharp.',
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
  const [layerMode, setLayerMode] = useState<DocumentLayerMode>('clean_real');
  const [strictLocal, setStrictLocal] = useState<boolean>(false);
  const [ocrLang, setOcrLang] = useState<string>(() => getStoredOcrLang());

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
      setProgress('Analyzing document & layout...');
      const isImage = isRasterImageFile(f);
      let numPages = 1;
      let isScanned = isImage;

      if (!isImage) {
        const buf = await f.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        numPages = pdf.numPages;
        isScanned = await detectIfScanned(pdf);
      }

      const useBackend = isImage || method === 'backend' || (method === 'auto' && isScanned && slideMode !== 'image');

      if (useBackend) {
        setStage('backend');
        setProgress('Reconstructing native editable slides, tables & graphics...');
        const blob = await convertBackend(f, isImage || isScanned, slideMode, layerMode, strictLocal, ocrLang);
        setResultUrl(URL.createObjectURL(blob));
        setStats({ pages: numPages, slides: numPages, method: 'backend', timeMs: 0, dpi });
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
  }, [method, dpi, slideMode, layerMode, strictLocal]);

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
    <ToolWorkspaceShell
      title="PDF to PowerPoint"
      subtitle="Instant browser-side conversion. Each page becomes a crisp high-DPI slide. Choose image quality and slide style."
      categoryLabel="Slide Deck Export · PPTX"
      icon={Presentation}
      microVariant="convert"
      tone="amber"
    >
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex flex-wrap justify-center gap-2">
          {[
            { icon: Zap, t: 'Instant in browser', color: 'text-amber-500' },
            { icon: Image, t: 'HD slide images', color: 'text-rose-500' },
            { icon: Layers, t: 'Image + text layer', color: 'text-blue-500' },
            { icon: Cpu, t: 'OCR backend option', color: 'text-purple-500' },
          ].map(({ icon: Icon, t, color }) => (
            <span
              key={t}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-full text-xs font-semibold bg-white/75 dark:bg-slate-900/75 border-[var(--pms-border)] text-[var(--pms-ink)] shadow-2xs"
            >
              <Icon className={`w-3.5 h-3.5 ${color}`} />{t}
            </span>
          ))}
        </div>

        <PearlStageSwitch stageKey={stage}>
          {stage === 'idle' && (
            <div className="space-y-4">
              <div className="pms-glass-panel rounded-3xl p-5 sm:p-6 space-y-5">
                {/* Conversion Mode */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] mb-2.5">Conversion Mode</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {([
                      { id: 'auto', label: '⚡ Smart Auto', desc: 'Detects type automatically' },
                      { id: 'frontend', label: '🌐 Browser Only', desc: 'Instant — any PDF' },
                      { id: 'backend', label: '🧠 AI Backend', desc: 'Accurate OCR backend' },
                    ] as { id: Method; label: string; desc: string }[]).map(m => {
                      const active = method === m.id;
                      return (
                        <motion.button
                          key={m.id}
                          type="button"
                          whileHover={prefersReduced ? undefined : { y: -1 }}
                          whileTap={prefersReduced ? undefined : { scale: 0.99 }}
                          onClick={() => setMethod(m.id)}
                          style={{
                            borderColor: active ? 'var(--pms-rose)' : 'var(--pms-border)',
                          }}
                          className={`relative p-3.5 rounded-2xl border text-left transition-colors ${
                            active
                              ? 'shadow-sm text-[var(--pms-ink)]'
                              : 'bg-white/75 dark:bg-slate-900/75 text-[var(--pms-ink)] hover:bg-white dark:hover:bg-slate-900'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="pdftoppt-method-pill"
                              transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
                              className="absolute inset-0 rounded-[15px]"
                              style={{ backgroundColor: 'var(--pms-soft-rose)' }}
                            />
                          )}
                          <div className="relative z-10">
                            <p className="text-sm font-bold text-[var(--pms-ink)]">{m.label}</p>
                            <p className="text-[11px] text-[var(--pms-muted)] mt-0.5">{m.desc}</p>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Slide Mode */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] mb-2.5">Slide Style</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {([
                      { id: 'hybrid', label: '🖼️ Image + Text', desc: 'Best quality + searchable' },
                      { id: 'image', label: '📸 Image Only', desc: 'Fastest, pixel-perfect' },
                      { id: 'text', label: '📝 Text Only', desc: 'Editable text slides' },
                    ] as { id: SlideMode; label: string; desc: string }[]).map(m => {
                      const active = slideMode === m.id;
                      return (
                        <motion.button
                          key={m.id}
                          type="button"
                          whileHover={prefersReduced ? undefined : { y: -1 }}
                          whileTap={prefersReduced ? undefined : { scale: 0.99 }}
                          onClick={() => setSlideMode(m.id)}
                          style={{
                            borderColor: active ? 'var(--pms-blue)' : 'var(--pms-border)',
                          }}
                          className={`relative p-3.5 rounded-2xl border text-left transition-colors ${
                            active
                              ? 'shadow-sm text-[var(--pms-ink)]'
                              : 'bg-white/75 dark:bg-slate-900/75 text-[var(--pms-ink)] hover:bg-white dark:hover:bg-slate-900'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="pdftoppt-style-pill"
                              transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
                              className="absolute inset-0 rounded-[15px]"
                              style={{ backgroundColor: 'var(--pms-soft-blue)' }}
                            />
                          )}
                          <div className="relative z-10">
                            <p className="text-sm font-bold text-[var(--pms-ink)]">{m.label}</p>
                            <p className="text-[11px] text-[var(--pms-muted)] mt-0.5">{m.desc}</p>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* DPI */}
                <div className="p-4 rounded-2xl bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-[var(--pms-ink)]">Slide Quality</p>
                    <span className="text-sm font-bold" style={{ color: 'var(--pms-rose)' }}>
                      <AnimatedNumber value={dpi} suffix=" DPI" />
                    </span>
                  </div>
                  <input
                    type="range"
                    min={72}
                    max={300}
                    step={12}
                    value={dpi}
                    onChange={e => setDpi(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-[var(--pms-rose)]"
                  />
                  <div className="flex justify-between text-[10px] text-[var(--pms-muted)] mt-1.5">
                    <span>72 (Fast)</span>
                    <span>150 (Recommended)</span>
                    <span>300 (HD)</span>
                  </div>
                </div>
              </div>

              <VisionLayerControls
                showLayerMode={true}
                layerMode={layerMode}
                onLayerModeChange={setLayerMode}
                strictLocal={strictLocal}
                onStrictLocalChange={setStrictLocal}
                lang={ocrLang}
                onLangChange={setOcrLang}
              />

              <FileDropzone
                onDrop={handleDrop}
                multiple={false}
                accept={SCAN_CONVERTER_ACCEPT}
                title="Drop PDF or Scan Image to convert to PowerPoint"
                subtitle="Reconstructs editable tables, cropped logos/photos & global multilingual text per slide"
              />

              <div className="pms-glass-panel rounded-2xl p-4">
                <p className="text-xs font-bold text-[var(--pms-ink)] mb-2">🎨 Slide Styles Explained:</p>
                <div className="space-y-1.5">
                  {[
                    'Image+Text (Hybrid): Pixel-perfect slide image + invisible searchable text layer',
                    'Image Only: Fastest conversion — pure visual slides like screenshots',
                    'Text Only: Editable text on white background — fonts & sizes preserved',
                  ].map(s => (
                    <div key={s} className="flex items-start gap-2">
                      <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--pms-rose)' }} />
                      <p className="text-xs text-[var(--pms-muted)]">{s}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {stage === 'analyzing' && (
            <PearlProcessCard
              title="Analyzing Slide Geometry"
              stageLabel="Mapping textboxes, tables & graphics"
              subtitle={progress || 'Inspecting page composition and visual layers…'}
              accent="rose"
            />
          )}

          {stage === 'converting' && (
            <PearlProcessCard
              title="Generating Editable PowerPoint Deck"
              stageLabel={`On-Device Engine · ${dpi} DPI`}
              subtitle={progress || `Rendering PowerPoint slides at ${dpi} DPI locally…`}
              accent="rose"
              badge="Zero Server Upload"
            />
          )}

          {stage === 'backend' && (
            <BackendLoader
              title="Reconstructing Editable PowerPoint Slides…"
              accentColor="orange"
              steps={[
                { icon: '📤', label: 'Preparing', detail: 'Analyzing document geometry and visuals…' },
                { icon: '🎨', label: 'Layering', detail: 'Isolating logos, photos, stamps & backgrounds…' },
                { icon: '🖼️', label: 'Tables & Text', detail: 'Mapping native PowerPoint grids and styled frames…' },
                { icon: '📝', label: 'Finalizing', detail: 'Packaging editable .pptx deck…' },
              ]}
              tips={[
                'Complex scanned pages are transformed into editable slides & tables.',
                'Digital vector documents build instantaneously inside your browser.',
                'Documents are processed securely and cleared right after export.',
              ]}
            />
          )}

          {stage === 'done' && resultUrl && file && (
            <div className="pms-glass-panel rounded-3xl overflow-hidden">
              <div
                className="px-6 py-5 border-b border-[var(--pms-border)] flex items-center gap-3"
                style={{ backgroundColor: 'var(--pms-soft-mint)' }}
              >
                <div className="w-11 h-11 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-[var(--pms-border)] flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[var(--pms-ink)]">Conversion Complete!</h3>
                  <p className="text-sm text-[var(--pms-muted)]">Your PowerPoint presentation is ready.</p>
                </div>
              </div>

              {stats && (
                <div className="px-6 pt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] rounded-xl p-3 text-center">
                    <p className="text-xs text-[var(--pms-muted)]">Slides</p>
                    <p className="text-sm font-bold text-[var(--pms-ink)] mt-0.5"><AnimatedNumber value={stats.slides} /></p>
                  </div>
                  <div className="bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] rounded-xl p-3 text-center">
                    <p className="text-xs text-[var(--pms-muted)]">Quality</p>
                    <p className="text-sm font-bold text-[var(--pms-ink)] mt-0.5"><AnimatedNumber value={stats.dpi} suffix=" DPI" /></p>
                  </div>
                  <div className="bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] rounded-xl p-3 text-center">
                    <p className="text-xs text-[var(--pms-muted)]">Style</p>
                    <p className="text-sm font-bold text-[var(--pms-ink)] mt-0.5 capitalize">{slideMode}</p>
                  </div>
                  <div className="bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] rounded-xl p-3 text-center">
                    <p className="text-xs text-[var(--pms-muted)]">Method</p>
                    <p className="text-sm font-bold text-[var(--pms-ink)] mt-0.5">
                      {stats.method === 'frontend' ? '⚡ Browser' : '🧠 Backend'}
                    </p>
                  </div>
                </div>
              )}

              <div className="p-6 space-y-3">
                <motion.a
                  whileHover={prefersReduced ? undefined : { scale: 1.01 }}
                  whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                  href={resultUrl}
                  download={stripDocumentExt(file.name) + '_slides.pptx'}
                  className="pms-btn-primary flex items-center justify-center gap-2 w-full px-6 py-4 font-bold rounded-2xl"
                >
                  <Download className="w-5 h-5" /> Download PowerPoint (.pptx)
                </motion.a>
                <button
                  type="button"
                  onClick={reset}
                  className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-white/75 dark:bg-slate-900/75 hover:bg-white dark:hover:bg-slate-900 text-[var(--pms-ink)] font-semibold rounded-2xl border border-[var(--pms-border)] transition-colors"
                >
                  <RotateCcw className="w-4 h-4" /> Convert Another File
                </button>
              </div>
            </div>
          )}

          {stage === 'error' && (
            <div className="pms-glass-panel rounded-3xl border-red-200 dark:border-red-800 p-6">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-red-700 dark:text-red-300">Conversion Failed</h3>
                  <p className="text-sm text-red-600 dark:text-red-400 mt-1">{errorMsg}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={reset}
                className="flex items-center gap-2 text-sm text-[var(--pms-ink)] hover:underline font-medium"
              >
                <RotateCcw className="w-4 h-4" /> Try again
              </button>
            </div>
          )}
        </PearlStageSwitch>
      </div>
    </ToolWorkspaceShell>
  );
}
