import React, { useState, useCallback } from 'react';
import {
  FileText, Scan, Zap, CheckCircle2, Download, RotateCcw,
  AlertTriangle, Cpu, Globe, ChevronRight, Eye
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle
} from 'docx';
import FileDropzone from '../components/FileDropzone';
import BackendLoader from '../components/BackendLoader';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import '../lib/pdfWorker';

type Stage = 'idle' | 'analyzing' | 'converting' | 'backend' | 'done' | 'error';
type Method = 'auto' | 'frontend' | 'backend';

interface ConversionStats {
  pages: number;
  paragraphs: number;
  tables: number;
  images: number;
  method: 'frontend' | 'backend';
  timeMs: number;
}

// ─── Detect if PDF is scanned (image-only, no real text) ────────────────────
async function detectIfScanned(pdf: pdfjsLib.PDFDocumentProxy): Promise<boolean> {
  let totalText = 0;
  const checkPages = Math.min(3, pdf.numPages);
  for (let i = 1; i <= checkPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    totalText += tc.items.reduce((s: number, it: any) => s + (it.str || '').trim().length, 0);
  }
  return totalText < 50; // Less than 50 chars across 3 pages → scanned
}

// ─── Extract rich text spans with font info from a page ─────────────────────
interface TextSpan {
  str: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  x: number;
  y: number;
  width: number;
}

async function extractPageSpans(page: pdfjsLib.PDFPageProxy): Promise<TextSpan[]> {
  const tc = await page.getTextContent({ includeMarkedContent: false } as any);
  const spans: TextSpan[] = [];
  for (const item of tc.items as any[]) {
    if (!item.str || !item.str.trim()) continue;
    const [, , , , x, y] = item.transform || [1, 0, 0, 1, 0, 0];
    const fontSize = Math.abs(item.transform?.[3] ?? item.height ?? 12);
    const fontName = (item.fontName || '').toLowerCase();
    spans.push({
      str: item.str,
      fontSize,
      bold: fontName.includes('bold'),
      italic: fontName.includes('italic') || fontName.includes('oblique'),
      x, y,
      width: item.width || 0
    });
  }
  return spans;
}

// ─── Group spans into paragraphs by Y proximity ─────────────────────────────
interface RichPara {
  spans: TextSpan[];
  avgFontSize: number;
  isBold: boolean;
}

function groupSpansIntoParagraphs(spans: TextSpan[]): RichPara[] {
  if (!spans.length) return [];
  const sorted = [...spans].sort((a, b) => b.y - a.y || a.x - b.x);
  const paras: TextSpan[][] = [];
  let cur: TextSpan[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const gap = Math.abs(prev.y - sorted[i].y);
    if (gap > (prev.fontSize * 0.6)) {
      paras.push(cur);
      cur = [];
    }
    cur.push(sorted[i]);
  }
  paras.push(cur);

  return paras.map(pSpans => {
    const avgFontSize = pSpans.reduce((s, sp) => s + sp.fontSize, 0) / pSpans.length;
    const boldCount = pSpans.filter(sp => sp.bold).length;
    return {
      spans: pSpans,
      avgFontSize,
      isBold: boldCount > pSpans.length * 0.5
    };
  });
}

// ─── Convert rich paras to docx Paragraphs ──────────────────────────────────
function richParaToDocxParagraph(rp: RichPara, globalAvgFontSize: number): Paragraph {
  const fontSize = rp.avgFontSize;
  const isHeading = fontSize > globalAvgFontSize * 1.3 || (rp.isBold && fontSize > globalAvgFontSize * 1.1);
  const text = rp.spans.map(s => s.str).join(' ').trim();

  const runs = rp.spans.map(sp => new TextRun({
    text: sp.str,
    bold: sp.bold || isHeading,
    italics: sp.italic,
    size: Math.round(Math.max(16, Math.min(fontSize * 1.5, 48))),
  }));

  if (isHeading && fontSize > globalAvgFontSize * 1.5) {
    return new Paragraph({ heading: HeadingLevel.HEADING_1, children: runs, spacing: { after: 160 } });
  }
  if (isHeading) {
    return new Paragraph({ heading: HeadingLevel.HEADING_2, children: runs, spacing: { after: 120 } });
  }
  return new Paragraph({ children: runs, spacing: { after: 100 } });
}

// ─── Frontend conversion engine ──────────────────────────────────────────────
async function convertFrontend(
  file: File,
  onProgress: (msg: string) => void
): Promise<{ blob: Blob; stats: ConversionStats }> {
  const t0 = Date.now();
  onProgress('Parsing PDF structure...');

  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const numPages = pdf.numPages;

  onProgress('Analyzing text layout and fonts...');

  // Collect all spans across pages
  const allPageSpans: TextSpan[][] = [];
  for (let p = 1; p <= numPages; p++) {
    onProgress(`Extracting page ${p} of ${numPages}...`);
    const page = await pdf.getPage(p);
    allPageSpans.push(await extractPageSpans(page));
  }

  // Global average font size for heading detection
  const allFontSizes = allPageSpans.flat().map(s => s.fontSize).filter(Boolean);
  const globalAvgFontSize = allFontSizes.length
    ? allFontSizes.reduce((a, b) => a + b, 0) / allFontSizes.length
    : 12;

  onProgress('Building Word document...');

  const docSections: Paragraph[] = [];
  let totalParas = 0;

  for (let pi = 0; pi < allPageSpans.length; pi++) {
    const spans = allPageSpans[pi];
    if (!spans.length) continue;

    const paras = groupSpansIntoParagraphs(spans);
    for (const rp of paras) {
      const text = rp.spans.map(s => s.str).join(' ').trim();
      if (!text) continue;
      docSections.push(richParaToDocxParagraph(rp, globalAvgFontSize));
      totalParas++;
    }

    // Page break between pages (except last)
    if (pi < allPageSpans.length - 1) {
      docSections.push(new Paragraph({ pageBreakBefore: true, children: [] }));
    }
  }

  onProgress('Packaging DOCX file...');

  const doc = new Document({
    title: file.name.replace(/\.pdf$/i, ''),
    description: 'Converted by PDF Media Suite',
    creator: 'PDF Media Suite',
    styles: {
      paragraphStyles: [
        {
          id: 'Normal',
          name: 'Normal',
          basedOn: 'Normal',
          run: { font: 'Calibri', size: 22 },
        },
      ]
    },
    sections: [{
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
      },
      children: docSections
    }]
  });

  const blob = await Packer.toBlob(doc);
  return {
    blob,
    stats: {
      pages: numPages,
      paragraphs: totalParas,
      tables: 0,
      images: 0,
      method: 'frontend',
      timeMs: Date.now() - t0
    }
  };
}

// ─── Backend conversion ───────────────────────────────────────────────────────
async function convertBackend(file: File, forceOcr: boolean): Promise<Blob> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('force_ocr', forceOcr ? 'true' : 'false');
  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const res = await fetch(`${API_BASE_URL}/convert/pdf-to-word`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error(await res.text() || 'Backend conversion failed.');
  return res.blob();
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function PdfToWord() {
  useSEO(
    'PDF to Word Converter — Instant Online Free | PDF Media Suite',
    'Convert PDF to editable Word DOCX instantly in your browser. No upload needed for text PDFs. Tables, headings, bold text preserved. OCR available for scanned PDFs.'
  );
  usePageSEO(
    'PDF to Word — Smart Frontend + Backend Hybrid Converter',
    'Instantly converts native PDFs in browser (zero wait). Falls back to powerful Python OCR backend only for scanned image PDFs.',
  );

  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<ConversionStats | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [method, setMethod] = useState<Method>('auto');
  const [forceOcr, setForceOcr] = useState(false);

  const handleDrop = useCallback(async (files: File[]) => {
    if (!files.length) return;
    const f = files[0];
    setFile(f);
    setResultUrl(null);
    setErrorMsg('');
    setStats(null);

    const t0 = Date.now();

    try {
      // Step 1: Analyze PDF
      setStage('analyzing');
      setProgress('Analyzing PDF type...');

      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const isScanned = await detectIfScanned(pdf);

      // Step 2: Choose method
      const useBackend = method === 'backend' || (method === 'auto' && (isScanned || forceOcr));

      if (useBackend) {
        setStage('backend');
        const blob = await convertBackend(f, forceOcr || isScanned);
        const url = URL.createObjectURL(blob);
        setResultUrl(url);
        setStats({ pages: pdf.numPages, paragraphs: 0, tables: 0, images: 0, method: 'backend', timeMs: Date.now() - t0 });
      } else {
        setStage('converting');
        const { blob, stats: s } = await convertFrontend(f, (msg) => setProgress(msg));
        const url = URL.createObjectURL(blob);
        setResultUrl(url);
        setStats(s);
      }

      setStage('done');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Conversion failed. Please try again.');
      setStage('error');
    }
  }, [method, forceOcr]);

  const reset = () => {
    setFile(null);
    setStage('idle');
    setResultUrl(null);
    setErrorMsg('');
    setStats(null);
    setProgress('');
  };

  return (
    <div className="flex-1 w-full bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">

        {/* Header */}
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 dark:shadow-blue-900/50 mx-auto mb-4">
            <FileText className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-2">PDF to Word</h1>
          <p className="text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
            Smart hybrid converter. Instant browser-side conversion for text PDFs — powerful OCR backend for scanned documents.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {[
              { icon: Zap, t: 'Instant for text PDFs', color: 'text-amber-500' },
              { icon: Cpu, t: 'OCR for scanned PDFs', color: 'text-blue-500' },
              { icon: Globe, t: 'Heading detection', color: 'text-emerald-500' },
              { icon: Eye, t: 'Bold/Italic preserved', color: 'text-purple-500' },
            ].map(({ icon: Icon, t, color }) => (
              <span key={t} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm">
                <Icon className={`w-3.5 h-3.5 ${color}`} />{t}
              </span>
            ))}
          </div>
        </div>

        {/* Options */}
        {stage === 'idle' && (
          <div className="space-y-4">
            {/* Method selector */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 space-y-4">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">Conversion Mode</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: 'auto', label: '⚡ Smart Auto', desc: 'Detects PDF type automatically' },
                    { id: 'frontend', label: '🌐 Browser Only', desc: 'Instant — no server upload' },
                    { id: 'backend', label: '🧠 AI Backend', desc: 'Best quality (slower)' },
                  ] as { id: Method; label: string; desc: string }[]).map(m => (
                    <button
                      key={m.id}
                      onClick={() => setMethod(m.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${method === m.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 hover:border-blue-300'}`}
                    >
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{m.label}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forceOcr}
                  onChange={e => setForceOcr(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  Force OCR (for scanned documents that look like images)
                </span>
              </label>
            </div>

            <FileDropzone
              onDrop={handleDrop}
              multiple={false}
              title="Drop PDF to convert to Word"
              subtitle="Text PDFs convert instantly in browser • Scanned PDFs use powerful OCR backend"
            />

            {/* How it works */}
            <div className="bg-blue-50 dark:bg-blue-950/20 rounded-2xl border border-blue-100 dark:border-blue-900 p-4">
              <p className="text-xs font-bold text-blue-800 dark:text-blue-300 mb-2">⚡ How Smart Auto works:</p>
              <div className="space-y-1.5">
                {[
                  '1. PDF is analyzed in-browser in milliseconds',
                  '2. If it has selectable text → converted instantly in browser (no upload)',
                  '3. If it\'s scanned/image-only → sent to OCR backend for precise extraction',
                ].map(s => (
                  <div key={s} className="flex items-start gap-2">
                    <ChevronRight className="w-3 h-3 text-blue-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-700 dark:text-blue-400">{s}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Analyzing stage */}
        {stage === 'analyzing' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-8 text-center">
            <div className="w-14 h-14 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin mx-auto mb-4" />
            <p className="font-bold text-slate-800 dark:text-slate-200">Analyzing PDF...</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{progress}</p>
          </div>
        )}

        {/* Frontend converting stage */}
        {stage === 'converting' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-200 dark:border-blue-800 shadow-lg p-8 text-center">
            <div className="w-16 h-16 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin mx-auto mb-4" />
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 rounded-full text-xs font-bold mb-3">
              <Zap className="w-3 h-3" /> Converting in browser — no upload needed
            </div>
            <p className="font-bold text-slate-800 dark:text-slate-200">{progress || 'Processing...'}</p>
            <p className="text-sm text-slate-500 mt-1">Your file stays on your device</p>
          </div>
        )}

        {/* Backend stage */}
        {stage === 'backend' && (
          <BackendLoader
            title="OCR Conversion in Progress…"
            accentColor="blue"
            steps={[
              { icon: '📤', label: 'Uploading', detail: 'Sending scanned PDF to OCR server...' },
              { icon: '🔍', label: 'Detecting', detail: 'Running Tesseract/PaddleOCR text recognition...' },
              { icon: '⚙️', label: 'Converting', detail: 'pdf2docx reconstructing layout...' },
              { icon: '📄', label: 'Packaging', detail: 'Finalizing your DOCX file...' },
            ]}
            tips={[
              '🔍 OCR backend only runs for scanned/image PDFs.',
              '⚡ Text PDFs are converted instantly in your browser.',
              '🔒 Your file is deleted from server immediately after.',
              '📊 Tables and multi-column layouts are preserved.',
            ]}
          />
        )}

        {/* Done */}
        {stage === 'done' && resultUrl && file && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-lg overflow-hidden">
            <div className="bg-emerald-50 dark:bg-emerald-950/40 px-6 py-5 border-b border-emerald-200 dark:border-emerald-800 flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              <div>
                <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-200">Conversion Complete!</h3>
                <p className="text-sm text-emerald-700 dark:text-emerald-400">Your Word document is ready to download.</p>
              </div>
            </div>

            {stats && (
              <div className="px-6 pt-4 grid grid-cols-4 gap-3">
                {[
                  { label: 'Pages', val: stats.pages },
                  { label: 'Paragraphs', val: stats.paragraphs || '—' },
                  { label: 'Method', val: stats.method === 'frontend' ? '⚡ Browser' : '🧠 OCR' },
                  { label: 'Time', val: `${(stats.timeMs / 1000).toFixed(1)}s` },
                ].map(s => (
                  <div key={s.label} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">{s.val}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="p-6 space-y-3">
              <a
                href={resultUrl}
                download={file.name.replace(/\.pdf$/i, '') + '_converted.docx'}
                className="flex items-center justify-center gap-2 w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-md transition-all hover:scale-[1.01]"
              >
                <Download className="w-5 h-5" /> Download Word File (.docx)
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

        {/* Error */}
        {stage === 'error' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-red-200 dark:border-red-800 p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-red-800 dark:text-red-200">Conversion Failed</h3>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">{errorMsg}</p>
              </div>
            </div>
            <button
              onClick={reset}
              className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium"
            >
              <RotateCcw className="w-4 h-4" /> Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
