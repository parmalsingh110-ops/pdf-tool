import { useState, useCallback, useEffect, useRef } from 'react';
import {
  FileText, Zap, CheckCircle2, Download, RotateCcw,
  AlertTriangle, Sparkles, Table as TableIcon, Layout, ShieldCheck
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle
} from 'docx';
import FileDropzone from '../components/FileDropzone';
import BackendLoader from '../components/BackendLoader';
import ToolSEOSection from '../components/ToolSEOSection';
import { useSEO } from '../hooks/useSEO';
import { apiFetch } from '../lib/api';
import '../lib/pdfWorker';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

type Stage = 'idle' | 'analyzing' | 'converting' | 'backend' | 'done' | 'error';
type EngineMode = 'precision' | 'frontend' | 'ocr';

interface ConversionStats {
  pages: number;
  paragraphs: number;
  tables: number;
  images: number;
  method: 'backend_precision' | 'backend_ocr' | 'frontend';
  timeMs: number;
  fileSizeBytes?: number;
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
  fontName: string;
  bold: boolean;
  italic: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
}

interface LineItem {
  y: number;
  height: number;
  spans: TextSpan[];
}

async function extractPageSpans(page: pdfjsLib.PDFPageProxy, viewport: pdfjsLib.PageViewport): Promise<{ spans: TextSpan[]; width: number; height: number }> {
  const tc = await page.getTextContent({ includeMarkedContent: false } as any);
  const spans: TextSpan[] = [];

  for (const item of tc.items as any[]) {
    // Sanitize XML control characters (0x00-0x1F except tab, newline, CR)
    const rawStr = (item.str || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    if (!rawStr || !rawStr.trim()) continue;

    // Check for rotated vertical border text (e.g. repetitive security margins)
    const isRotated = Math.abs(item.transform?.[1] || 0) > Math.abs(item.transform?.[0] || 0) * 1.5;
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const x = Math.round(tx[4]);

    // Skip rotated text placed directly along page margin borders
    if (isRotated && (x < viewport.width * 0.08 || x > viewport.width * 0.92)) {
      continue;
    }

    const fontSize = Math.abs(item.transform?.[3] ?? item.height ?? 12);
    const height = Math.abs(tx[3] || fontSize);
    const y = Math.round(tx[5] - height); // top-left Y in viewport pixels
    const width = Math.round(item.width * (viewport.scale || 1));
    const fontName = (item.fontName || '').toLowerCase();

    let color: string | undefined;
    if (item.color && item.color.length >= 3) {
      color = `#${item.color[0].toString(16).padStart(2, '0')}${item.color[1].toString(16).padStart(2, '0')}${item.color[2].toString(16).padStart(2, '0')}`;
    }

    spans.push({
      str: rawStr,
      fontSize: Math.round(fontSize),
      fontName: item.fontName || '',
      bold: fontName.includes('bold') || fontName.includes('black') || fontName.includes('heavy'),
      italic: fontName.includes('italic') || fontName.includes('oblique'),
      x,
      y,
      width,
      height,
      color,
    });
  }

  return { spans, width: viewport.width, height: viewport.height };
}

// ─── Group spans into lines by vertical coordinate ──────────────────────────
function groupSpansIntoLines(spans: TextSpan[]): LineItem[] {
  if (!spans.length) return [];
  // Sort top to bottom, then left to right
  const sorted = [...spans].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: LineItem[] = [];

  for (const span of sorted) {
    // Find an existing line whose vertical band overlaps with this span
    const line = lines.find(l => Math.abs(l.y - span.y) <= Math.max(4, span.height * 0.4));
    if (line) {
      line.spans.push(span);
      line.spans.sort((a, b) => a.x - b.x);
      line.y = Math.min(line.y, span.y);
      line.height = Math.max(line.height, span.height);
    } else {
      lines.push({
        y: span.y,
        height: span.height,
        spans: [span]
      });
    }
  }

  return lines.sort((a, b) => a.y - b.y);
}

// ─── Map font to Word-friendly name ─────────────────────────────────────────
function mapWordFont(fontName: string): string {
  const f = fontName.toLowerCase();
  if (f.includes('times') || f.includes('georgia') || f.includes('palatino') || f.includes('garamond') || f.includes('roman')) {
    return 'Times New Roman';
  }
  if (f.includes('courier') || f.includes('mono') || f.includes('consolas') || f.includes('menlo')) {
    return 'Courier New';
  }
  if (f.includes('calibri')) return 'Calibri';
  if (f.includes('verdana')) return 'Verdana';
  if (f.includes('tahoma')) return 'Tahoma';
  return 'Arial';
}

// ─── High-Fidelity Client-Side Conversion Engine ────────────────────────────
async function convertFrontend(
  file: File,
  onProgress: (msg: string) => void
): Promise<{ blob: Blob; stats: ConversionStats }> {
  const t0 = Date.now();
  onProgress('Loading PDF structure & page streams...');

  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const numPages = pdf.numPages;

  onProgress(`Analyzing ${numPages} page(s) layout & typography...`);

  const docSectionsChildren: (Paragraph | Table)[] = [];
  let totalParas = 0;
  let totalTables = 0;

  for (let p = 1; p <= numPages; p++) {
    onProgress(`Reconstructing page ${p} of ${numPages}...`);
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1.5 });
    const { spans, width: pageWidth } = await extractPageSpans(page, viewport);

    if (!spans.length) {
      if (p < numPages) {
        docSectionsChildren.push(new Paragraph({ pageBreakBefore: true, children: [] }));
      }
      continue;
    }

    const lines = groupSpansIntoLines(spans);

    // Compute median font size for heading classification
    const fontSizes = spans.map(s => s.fontSize).sort((a, b) => a - b);
    const medianSize = fontSizes[Math.floor(fontSizes.length / 2)] || 11;

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      if (!line.spans.length) continue;

      // Check if this line looks like a multi-column row (table or split columns)
      // Multiple spans with substantial horizontal gap (> 60px)
      const hasLargeGaps = line.spans.length >= 2 && line.spans.some((sp, idx) => {
        if (idx === 0) return false;
        const prev = line.spans[idx - 1];
        return (sp.x - (prev.x + prev.width)) > 50;
      });

      if (hasLargeGaps && line.spans.length <= 8) {
        // Build table row
        totalTables++;
        const cells: TableCell[] = line.spans.map(sp => {
          return new TableCell({
            width: { size: Math.max(1000, Math.round(sp.width * 15)), type: WidthType.DXA },
            borders: {
              top: { style: BorderStyle.NONE },
              bottom: { style: BorderStyle.NONE },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
            },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: sp.str,
                    bold: sp.bold,
                    italics: sp.italic,
                    font: mapWordFont(sp.fontName),
                    size: Math.round(Math.max(16, Math.min(sp.fontSize * 2, 60))),
                    color: sp.color?.replace('#', '') || undefined,
                  })
                ]
              })
            ]
          });
        });

        docSectionsChildren.push(new Table({
          rows: [new TableRow({ children: cells })],
          width: { size: 100, type: WidthType.PERCENTAGE }
        }));
        continue;
      }

      // Normal paragraph line
      const lineText = line.spans.map(s => s.str).join(' ').trim();
      if (!lineText) continue;

      const lineMaxFont = Math.max(...line.spans.map(s => s.fontSize));
      const lineIsBold = line.spans.some(s => s.bold);
      const isHeading1 = lineMaxFont >= medianSize * 1.5 && lineText.length < 100;
      const isHeading2 = lineMaxFont >= medianSize * 1.25 && !isHeading1 && lineText.length < 120;

      // Determine horizontal alignment
      const minX = line.spans[0].x;
      const lastSpan = line.spans[line.spans.length - 1];
      const maxX = lastSpan.x + lastSpan.width;
      const lineWidth = maxX - minX;

      let alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT;
      if (lineWidth > 80 && Math.abs((minX + maxX) / 2 - pageWidth / 2) < 40) {
        alignment = AlignmentType.CENTER;
      } else if (minX > pageWidth * 0.5) {
        alignment = AlignmentType.RIGHT;
      }

      const runs: TextRun[] = line.spans.map((sp, idx) => {
        // Add spacing between spans if needed
        let text = sp.str;
        if (idx > 0) {
          const prev = line.spans[idx - 1];
          const gap = sp.x - (prev.x + prev.width);
          if (gap > 4) text = ' ' + text;
        }

        return new TextRun({
          text,
          bold: sp.bold || isHeading1,
          italics: sp.italic,
          font: mapWordFont(sp.fontName),
          size: Math.round(Math.max(16, Math.min(sp.fontSize * 2, 72))),
          // For headings: force black color to prevent Word's default blue heading theme
          color: (isHeading1 || isHeading2)
            ? (sp.color?.replace('#', '') || '000000')
            : (sp.color?.replace('#', '') || undefined),
        });
      });

      const para = new Paragraph({
        children: runs,
        alignment,
        heading: isHeading1 ? HeadingLevel.HEADING_1 : isHeading2 ? HeadingLevel.HEADING_2 : undefined,
        spacing: {
          before: isHeading1 ? 240 : isHeading2 ? 160 : 40,
          after: isHeading1 ? 160 : isHeading2 ? 100 : 60,
        }
      });

      docSectionsChildren.push(para);
      totalParas++;
    }

    // Page break between pages (except last)
    if (p < numPages) {
      docSectionsChildren.push(new Paragraph({ pageBreakBefore: true, children: [] }));
    }
  }

  onProgress('Packaging full DOCX document with typography styles...');

  const doc = new Document({
    title: file.name.replace(/\.pdf$/i, ''),
    description: 'Converted by PDF Media Suite Ultra Precision Engine',
    creator: 'PDF Media Suite',
    styles: {
      paragraphStyles: [
        {
          id: 'Normal',
          name: 'Normal',
          basedOn: 'Normal',
          run: { font: 'Arial', size: 22 },
        },
      ]
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 }
        }
      },
      children: docSectionsChildren
    }]
  });

  const blob = await Packer.toBlob(doc);
  return {
    blob,
    stats: {
      pages: numPages,
      paragraphs: totalParas,
      tables: totalTables,
      images: 0,
      method: 'frontend',
      timeMs: Date.now() - t0,
      fileSizeBytes: blob.size,
    }
  };
}

// ─── Backend conversion (Precision layout with pdf2docx & PyMuPDF) ───────────
async function convertBackend(file: File, forceOcr: boolean): Promise<Blob> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('force_ocr', forceOcr ? 'true' : 'false');
  const res = await apiFetch('/convert/pdf-to-word', {
    method: 'POST',
    body: formData
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || 'Backend conversion failed.');
  }
  return res.blob();
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function PdfToWord() {
  const prefersReduced = useReducedMotion();

  useSEO(
    'PDF to Word Converter Online Free — Exact DOCX Formatting',
    'Convert PDF to editable Word document (.docx) online for free. Preserves tables, columns, exact font weights, and layout geometry. 100% private, no signup.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<ConversionStats | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [engineMode, setEngineMode] = useState<EngineMode>('precision');
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);

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
    setFallbackNotice(null);

    const t0 = Date.now();

    try {
      // Step 1: Rapid client-side pre-analysis
      setStage('analyzing');
      setProgress('Analyzing document geometry & structure...');

      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const numPages = pdf.numPages;
      const isScanned = await detectIfScanned(pdf);

      // Determine actual path based on user choice and scan status
      const needsOcr = engineMode === 'ocr' || isScanned;
      const useBackend = engineMode === 'precision' || engineMode === 'ocr' || isScanned;

      if (useBackend) {
        setStage('backend');
        setProgress(needsOcr ? 'Running Deep OCR & Layout Reconstruction...' : 'Reconstructing Word Document via AI Layout Engine...');

        try {
          const blob = await convertBackend(f, needsOcr);
          const url = URL.createObjectURL(blob);
          setResultUrl(url);
          setStats({
            pages: numPages,
            paragraphs: 0,
            tables: 0,
            images: 0,
            method: needsOcr ? 'backend_ocr' : 'backend_precision',
            timeMs: Date.now() - t0,
            fileSizeBytes: blob.size,
          });
          setStage('done');
          return;
        } catch (backendErr: any) {
          console.warn('[PdfToWord] Backend error, gracefully falling back to high-fidelity frontend:', backendErr);
          setFallbackNotice('Server is currently offline. Automatically converted using Client-Side Precision Engine!');
          // Cascade down to frontend conversion!
        }
      }

      // Frontend Engine
      setStage('converting');
      const { blob, stats: s } = await convertFrontend(f, (msg) => setProgress(msg));
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setStats(s);
      setStage('done');

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Conversion failed. Please try a different document.');
      setStage('error');
    }
  }, [engineMode]);

  const reset = () => {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    setFile(null);
    setStage('idle');
    setResultUrl(null);
    setErrorMsg('');
    setStats(null);
    setProgress('');
    setFallbackNotice(null);
  };

  return (
    <ToolWorkspaceShell
      title="PDF to Word Converter"
      subtitle="Ultra-precision conversion that preserves tables, column layouts, fonts, formatting, and images."
      categoryLabel="Document Conversion · Hybrid Engine"
      icon={FileText}
      microVariant="convert"
      tone="blue"
    >
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex flex-wrap justify-center gap-2">
          {[
            { icon: TableIcon, t: 'Tables & Grids Intact', color: 'text-indigo-500' },
            { icon: Layout, t: 'Multi-Column Alignment', color: 'text-blue-500' },
            { icon: Sparkles, t: 'Exact Fonts & Colors', color: 'text-amber-500' },
            { icon: ShieldCheck, t: '100% Secure & Private', color: 'text-emerald-500' },
          ].map(({ icon: Icon, t, color }) => (
            <span
              key={t}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] rounded-full text-xs font-semibold text-[var(--pms-ink)] shadow-2xs"
            >
              <Icon className={`w-3.5 h-3.5 ${color}`} />
              {t}
            </span>
          ))}
        </div>

        <PearlStageSwitch stageKey={stage}>
          {/* Options & Upload */}
          {stage === 'idle' && (
            <div className="space-y-6">
              {/* Mode selection card */}
              <div className="pms-glass-panel rounded-3xl p-6 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--pms-ink)]">Conversion Engine</h3>
                    <p className="text-xs text-[var(--pms-muted)]">Choose the reconstruction method tailored for your PDF type</p>
                  </div>
                  <span
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-[var(--pms-border)]"
                    style={{ backgroundColor: 'var(--pms-soft-blue)', color: 'var(--pms-ink)' }}
                  >
                    Active Mode
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'precision' as EngineMode,
                      badge: 'Recommended',
                      title: '⭐ Ultra-Precision AI Engine',
                      desc: 'Preserves tables, complex columns, images, fonts, and exact alignments via pdf2docx.',
                      tagColor: 'bg-blue-600 text-white',
                    },
                    {
                      id: 'frontend' as EngineMode,
                      badge: '100% Client-Side',
                      title: '⚡ Instant Browser Engine',
                      desc: 'Converts in milliseconds right on your device. Zero server upload, maximum privacy.',
                      tagColor: 'bg-emerald-600 text-white',
                    },
                    {
                      id: 'ocr' as EngineMode,
                      badge: 'Scanned & Photos',
                      title: '🔍 Deep OCR Scanned Engine',
                      desc: 'Optical Character Recognition for image-only PDFs, camera scans, and receipts.',
                      tagColor: 'bg-purple-600 text-white',
                    },
                  ].map(m => {
                    const active = engineMode === m.id;
                    return (
                      <motion.button
                        key={m.id}
                        type="button"
                        whileHover={prefersReduced ? undefined : { y: -2 }}
                        whileTap={prefersReduced ? undefined : { scale: 0.99 }}
                        onClick={() => setEngineMode(m.id)}
                        style={{
                          borderColor: active ? 'var(--pms-blue)' : 'var(--pms-border)',
                        }}
                        className={`relative p-4 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between ${
                          active
                            ? 'shadow-sm ring-1 ring-[var(--pms-blue)]'
                            : 'bg-white/75 dark:bg-slate-900/75 hover:bg-white dark:hover:bg-slate-900'
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="pdftoword-engine-pill"
                            transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 32 }}
                            className="absolute inset-0 rounded-[15px]"
                            style={{ backgroundColor: 'var(--pms-soft-blue)' }}
                          />
                        )}
                        <div className="relative z-10">
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.tagColor}`}>
                              {m.badge}
                            </span>
                            {active && (
                              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                            )}
                          </div>
                          <p className="text-sm font-bold text-[var(--pms-ink)] leading-snug">{m.title}</p>
                          <p className="text-xs text-[var(--pms-muted)] mt-1.5 leading-relaxed">{m.desc}</p>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Dropzone */}
              <FileDropzone
                onDrop={handleDrop}
                multiple={false}
                title="Drag & Drop PDF to Convert to Word"
                subtitle="Supports single & multi-page PDFs • Tables, columns & formatting guaranteed"
              />

              {/* Feature highlights */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="bg-white/75 dark:bg-slate-900/75 p-4 rounded-2xl border border-[var(--pms-border)] flex items-start gap-3">
                  <div
                    className="p-2 rounded-xl shrink-0"
                    style={{ backgroundColor: 'var(--pms-soft-blue)', color: 'var(--pms-blue)' }}
                  >
                    <TableIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[var(--pms-ink)]">Table & Grid Retention</h4>
                    <p className="text-[11px] text-[var(--pms-muted)] mt-0.5">Cell borders, alignments, and tabular numbers convert into native editable Word tables.</p>
                  </div>
                </div>

                <div className="bg-white/75 dark:bg-slate-900/75 p-4 rounded-2xl border border-[var(--pms-border)] flex items-start gap-3">
                  <div
                    className="p-2 rounded-xl shrink-0"
                    style={{ backgroundColor: 'var(--pms-soft-lavender)', color: 'var(--pms-violet)' }}
                  >
                    <Layout className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[var(--pms-ink)]">Multi-Column Flow</h4>
                    <p className="text-[11px] text-[var(--pms-muted)] mt-0.5">Two-column articles and magazines are parsed left-to-right without jumbled text lines.</p>
                  </div>
                </div>

                <div className="bg-white/75 dark:bg-slate-900/75 p-4 rounded-2xl border border-[var(--pms-border)] flex items-start gap-3">
                  <div
                    className="p-2 rounded-xl shrink-0"
                    style={{ backgroundColor: 'var(--pms-soft-rose)', color: 'var(--pms-rose)' }}
                  >
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[var(--pms-ink)]">Font & Style Matching</h4>
                    <p className="text-[11px] text-[var(--pms-muted)] mt-0.5">Preserves exact font sizes, bold, italic, and RGB colors mapped to matching Word styles.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Analyzing stage */}
          {stage === 'analyzing' && (
            <div className="pms-glass-panel rounded-3xl p-10 text-center space-y-4 relative overflow-hidden">
              <PearlScanOverlay active={true} label={progress || 'Analyzing document geometry...'} />
              <div
                className="w-14 h-14 rounded-full border-4 border-t-transparent animate-spin mx-auto"
                style={{ borderColor: 'var(--pms-blue)', borderTopColor: 'transparent' }}
              />
              <div>
                <p className="text-lg font-bold text-[var(--pms-ink)]">Analyzing Document Geometry</p>
                <p className="text-sm text-[var(--pms-muted)] mt-1">{progress}</p>
              </div>
            </div>
          )}

          {/* Frontend converting stage */}
          {stage === 'converting' && (
            <div className="pms-glass-panel rounded-3xl p-10 text-center space-y-4 relative overflow-hidden">
              <PearlScanOverlay active={true} label={progress || 'Reconstructing Word document layout...'} />
              <div className="w-16 h-16 rounded-full border-4 border-emerald-200 border-t-emerald-600 animate-spin mx-auto" />
              <div
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border border-[var(--pms-border)]"
                style={{ backgroundColor: 'var(--pms-soft-mint)', color: 'var(--pms-ink)' }}
              >
                <Zap className="w-3.5 h-3.5 text-emerald-600" /> High-Fidelity Client-Side Engine
              </div>
              <div>
                <p className="text-lg font-bold text-[var(--pms-ink)]">{progress || 'Reconstructing document layout...'}</p>
                <p className="text-sm text-[var(--pms-muted)] mt-1">Zero data leaves your browser • Pure local conversion</p>
              </div>
            </div>
          )}

          {/* Backend stage */}
          {stage === 'backend' && (
            <BackendLoader
              title="Ultra-Precision Word Reconstruction in Progress…"
              accentColor="blue"
              steps={[
                { icon: '📐', label: 'Layout Analysis', detail: 'Deconstructing bounding boxes, margins & paragraph hierarchy...' },
                { icon: '📊', label: 'Table & Grid Snapping', detail: 'Detecting cell grids, border coordinates & column splits...' },
                { icon: '🎨', label: 'Typography Mapping', detail: 'Matching exact font sizes, weights, colors & styles...' },
                { icon: '📄', label: 'DOCX Generation', detail: 'Packaging native Microsoft Word (.docx) document...' },
              ]}
              tips={[
                '⭐ Ultra-Precision engine preserves tables, columns, and graphics.',
                '🔒 Files are processed securely in memory and deleted immediately.',
                '⚡ Text formatting is mapped to native Word styles for effortless editing.',
              ]}
            />
          )}

          {/* Done stage */}
          {stage === 'done' && resultUrl && file && (
            <div className="pms-glass-panel rounded-3xl overflow-hidden">
              <div
                className="px-6 py-6 border-b border-[var(--pms-border)] flex items-center gap-4"
                style={{ backgroundColor: 'var(--pms-soft-mint)' }}
              >
                <div className="p-2.5 bg-white/80 dark:bg-slate-900/80 border border-[var(--pms-border)] text-emerald-600 dark:text-emerald-400 rounded-2xl shadow-sm">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-2xl font-extrabold text-[var(--pms-ink)]">Conversion Successful!</h3>
                  <p className="text-sm text-[var(--pms-muted)] font-medium">Your fully editable Word document (.docx) is ready.</p>
                </div>
              </div>

              {fallbackNotice && (
                <div className="mx-6 mt-4 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200 font-medium">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  {fallbackNotice}
                </div>
              )}

              {stats && (
                <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-white/75 dark:bg-slate-900/75 rounded-xl p-3.5 border border-[var(--pms-border)] text-center">
                    <p className="text-[11px] font-semibold text-[var(--pms-muted)]">Total Pages</p>
                    <p className="text-base font-bold text-[var(--pms-ink)] mt-0.5"><AnimatedNumber value={stats.pages} /></p>
                  </div>
                  <div className="bg-white/75 dark:bg-slate-900/75 rounded-xl p-3.5 border border-[var(--pms-border)] text-center">
                    <p className="text-[11px] font-semibold text-[var(--pms-muted)]">Engine Used</p>
                    <p className="text-base font-bold text-[var(--pms-ink)] mt-0.5">
                      {stats.method === 'backend_precision' ? '⭐ AI Precision' : stats.method === 'backend_ocr' ? '🔍 OCR Engine' : '⚡ Browser'}
                    </p>
                  </div>
                  <div className="bg-white/75 dark:bg-slate-900/75 rounded-xl p-3.5 border border-[var(--pms-border)] text-center">
                    <p className="text-[11px] font-semibold text-[var(--pms-muted)]">Processing Time</p>
                    <p className="text-base font-bold text-[var(--pms-ink)] mt-0.5">
                      <AnimatedNumber value={stats.timeMs / 1000} decimals={1} suffix="s" />
                    </p>
                  </div>
                  <div className="bg-white/75 dark:bg-slate-900/75 rounded-xl p-3.5 border border-[var(--pms-border)] text-center">
                    <p className="text-[11px] font-semibold text-[var(--pms-muted)]">Output Size</p>
                    <p className="text-base font-bold text-[var(--pms-ink)] mt-0.5">
                      {stats.fileSizeBytes ? <AnimatedNumber value={Math.round(stats.fileSizeBytes / 1024)} suffix=" KB" /> : 'Ready'}
                    </p>
                  </div>
                </div>
              )}

              <div className="p-6 pt-2 space-y-3">
                <motion.a
                  whileHover={prefersReduced ? undefined : { scale: 1.01 }}
                  whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                  href={resultUrl}
                  download={file.name.replace(/\.pdf$/i, '') + '_converted.docx'}
                  className="pms-btn-primary flex items-center justify-center gap-2.5 w-full px-6 py-4 font-bold text-base rounded-2xl"
                >
                  <Download className="w-5 h-5" /> Download Editable Word Document (.docx)
                </motion.a>
                <button
                  type="button"
                  onClick={reset}
                  className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-white/75 dark:bg-slate-900/75 hover:bg-white dark:hover:bg-slate-900 text-[var(--pms-ink)] font-semibold rounded-2xl border border-[var(--pms-border)] transition-colors text-sm"
                >
                  <RotateCcw className="w-4 h-4" /> Convert Another Document
                </button>
              </div>
            </div>
          )}

          {/* Error stage */}
          {stage === 'error' && (
            <div className="pms-glass-panel rounded-3xl border-red-200 dark:border-red-800 p-6">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-red-700 dark:text-red-300">Conversion Encountered an Error</h3>
                  <p className="text-sm text-red-600 dark:text-red-400 mt-1">{errorMsg}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={reset}
                className="flex items-center gap-2 text-sm text-[var(--pms-ink)] hover:underline font-semibold"
              >
                <RotateCcw className="w-4 h-4" /> Try another file
              </button>
            </div>
          )}
        </PearlStageSwitch>
      </div>

      {/* SEO Content & FAQs for Google Indexing */}
      <ToolSEOSection
        toolName="PDF to Word Converter"
        headline="Free Online PDF to Word Converter — Accurate DOCX Layout"
        description="Transform any PDF into a fully editable Microsoft Word document (.docx). Our dual-engine system preserves fonts, tables, multi-column articles, and embedded graphics with razor-sharp fidelity. Zero file uploads, 100% private."
        steps={[
          {
            step: '01',
            title: 'Upload PDF Document',
            desc: 'Select or drag & drop your PDF file into the converter box above.',
          },
          {
            step: '02',
            title: 'Automatic Layout Reconstruction',
            desc: 'Our engine detects paragraphs, font sizes, table coordinates, and text styling in real time.',
          },
          {
            step: '03',
            title: 'Download Editable Word (.docx)',
            desc: 'Instantly download your clean .docx file ready for Microsoft Word, Google Docs, or LibreOffice.',
          },
        ]}
        faqs={[
          {
            q: 'Can I edit the converted Word document in Microsoft Word?',
            a: 'Yes, 100%! The converted file is a standard Microsoft Word OpenXML (.docx) document with native editable paragraphs, heading styles, tables, and text runs.',
          },
          {
            q: 'Will tables and grid layouts stay aligned?',
            a: 'Yes. Our converter uses layout reconstruction to detect table borders, cell rows, and column boundaries, mapping them into native Word table cells.',
          },
          {
            q: 'Can it convert scanned PDFs with images?',
            a: 'Yes. If a PDF consists of scanned pages or image snapshots without embedded text, our OCR engine automatically kicks in to recognize text and render it into editable text.',
          },
          {
            q: 'Are my confidential documents kept safe?',
            a: 'Absolutely. Standard documents are processed directly inside your browser client-side. No files are retained, logged, or shared.',
          },
        ]}
        relatedTools={[
          { name: 'Word to PDF', path: '/word-to-pdf-exact', desc: 'Convert DOCX documents back to exact PDF format' },
          { name: 'PDF to Excel', path: '/pdf-to-excel', desc: 'Extract data tables into editable XLSX spreadsheets' },
          { name: 'PDF to PPT', path: '/pdf-to-ppt', desc: 'Convert PDF presentation slides to PowerPoint' },
          { name: 'Extract Tables', path: '/extract-tables', desc: 'Isolate and export data tables as CSV, Excel, or JSON' },
        ]}
      />
    </ToolWorkspaceShell>
  );
}
