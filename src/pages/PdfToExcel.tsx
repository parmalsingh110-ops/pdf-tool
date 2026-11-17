import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Table2, Zap, CheckCircle2, Download, RotateCcw,
  AlertTriangle, Cpu, ChevronRight, BarChart3, Filter
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import { buildXlsxBlob } from '../lib/excelCodec';
import FileDropzone from '../components/FileDropzone';
import BackendLoader from '../components/BackendLoader';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { apiFetch } from '../lib/api';
import '../lib/pdfWorker';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlProcessCard, PearlStageSwitch } from '../components/pearl/PearlMotion';
import VisionLayerControls from '../components/VisionLayerControls';
import { appendVisionLayerParams } from '../lib/advancedVisionEngine';
import { getStoredOcrLang } from '../lib/ocrLanguages';
import {
  SCAN_CONVERTER_ACCEPT,
  detectIfPdfScannedOrOcr,
  isRasterImageFile,
  stripDocumentExt,
} from '../utils/scanDetector';

type Stage = 'idle' | 'analyzing' | 'converting' | 'backend' | 'done' | 'error';
type Method = 'auto' | 'frontend' | 'backend';
type FrontendMode = 'lattice' | 'stream';

interface ExtractedTable {
  pageNum: number;
  sheetName: string;
  rows: string[][];
}

interface ConversionStats {
  pages: number;
  tables: number;
  rows: number;
  method: 'frontend' | 'backend';
  timeMs: number;
}

// ─── Detect if PDF is scanned (raw image OR OCR-layered scan) ─────────────────
async function detectIfScanned(pdf: pdfjsLib.PDFDocumentProxy): Promise<boolean> {
  return detectIfPdfScannedOrOcr(pdf);
}

// ─── Extract text content with positioning info ──────────────────────────────
interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

async function getPageTextItems(page: pdfjsLib.PDFPageProxy): Promise<TextItem[]> {
  const tc = await page.getTextContent({ includeMarkedContent: false } as any);
  return (tc.items as any[])
    .filter((it: any) => it.str && it.str.trim())
    .map((it: any) => {
      const [, , , h, x, y] = it.transform || [1, 0, 0, 12, 0, 0];
      return { str: it.str, x, y, width: it.width || 50, height: Math.abs(h) || 12 };
    });
}

// ─── Cluster items into rows by Y coordinate, then columns by X ─────────────
function clusterIntoTable(items: TextItem[]): string[][] {
  if (!items.length) return [];

  // Sort by Y descending (top of page first in PDF coordinates)
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  // Group by Y with tolerance
  const rowGroups: TextItem[][] = [];
  let curRow: TextItem[] = [sorted[0]];
  const yTol = sorted[0].height * 0.6;

  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - curRow[0].y) <= yTol) {
      curRow.push(sorted[i]);
    } else {
      rowGroups.push(curRow);
      curRow = [sorted[i]];
    }
  }
  rowGroups.push(curRow);

  // Sort each row's items by X
  const rows: string[][] = rowGroups.map(row => {
    const byX = [...row].sort((a, b) => a.x - b.x);
    // Merge items that are very close in X (same "cell")
    const merged: string[] = [];
    let curCell = byX[0].str;
    for (let i = 1; i < byX.length; i++) {
      const gap = byX[i].x - (byX[i - 1].x + byX[i - 1].width);
      if (gap < 15) {
        curCell += ' ' + byX[i].str;
      } else {
        merged.push(curCell.trim());
        curCell = byX[i].str;
      }
    }
    merged.push(curCell.trim());
    return merged;
  });

  // Normalize all rows to same column count
  const maxCols = Math.max(...rows.map(r => r.length));
  return rows.map(r => [...r, ...Array(maxCols - r.length).fill('')]);
}

// ─── Frontend extraction ─────────────────────────────────────────────────────
async function extractFrontend(
  file: File,
  mode: FrontendMode,
  onProgress: (msg: string) => void
): Promise<{ tables: ExtractedTable[]; stats: ConversionStats }> {
  const t0 = Date.now();
  onProgress('Loading PDF...');
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const numPages = pdf.numPages;
  const tables: ExtractedTable[] = [];
  let totalRows = 0;

  for (let p = 1; p <= numPages; p++) {
    onProgress(`Scanning page ${p} of ${numPages}...`);
    const page = await pdf.getPage(p);
    const items = await getPageTextItems(page);
    if (!items.length) continue;

    if (mode === 'lattice') {
      // Lattice: try to find separate clusters (tables separated by whitespace)
      // Sort by Y then group clusters by large Y gaps
      const sorted = [...items].sort((a, b) => b.y - a.y);
      const clusters: TextItem[][] = [];
      let cur: TextItem[] = [sorted[0]];
      const gap_threshold = sorted[0].height * 3;

      for (let i = 1; i < sorted.length; i++) {
        if (Math.abs(sorted[i].y - sorted[i - 1].y) > gap_threshold) {
          clusters.push(cur);
          cur = [];
        }
        cur.push(sorted[i]);
      }
      clusters.push(cur);

      clusters.forEach((cluster, ci) => {
        if (cluster.length < 4) return; // skip tiny clusters
        const rows = clusterIntoTable(cluster);
        if (rows.length < 2) return;
        totalRows += rows.length;
        tables.push({
          pageNum: p,
          sheetName: `Page${p}_Table${ci + 1}`.substring(0, 31),
          rows,
        });
      });
    } else {
      // Stream: treat entire page content as one table
      const rows = clusterIntoTable(items);
      if (rows.length < 2) continue;
      totalRows += rows.length;
      tables.push({
        pageNum: p,
        sheetName: `Page_${p}`.substring(0, 31),
        rows,
      });
    }
  }

  return {
    tables,
    stats: { pages: numPages, tables: tables.length, rows: totalRows, method: 'frontend', timeMs: Date.now() - t0 }
  };
}

// ─── Build XLSX from extracted tables ────────────────────────────────────────
async function buildXlsx(tables: ExtractedTable[], fallbackText: string): Promise<Blob> {
  if (tables.length === 0) {
    return buildXlsxBlob([
      {
        name: 'Text Content',
        rows: fallbackText.split('\n').map((l) => [l]),
        colWidths: [60],
      },
    ]);
  }
  return buildXlsxBlob(
    tables.map((tbl) => {
      const maxCols = Math.max(1, ...tbl.rows.map((r) => r.length));
      return {
        name: tbl.sheetName,
        rows: tbl.rows,
        colWidths: Array(maxCols).fill(20),
      };
    })
  );
}

// ─── Backend conversion ───────────────────────────────────────────────────────
async function convertBackend(
  file: File,
  method: string,
  forceOcr: boolean,
  strictLocal: boolean,
  lang: string
): Promise<Blob> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('method', method);
  formData.append('force_ocr', forceOcr ? 'true' : 'false');
  appendVisionLayerParams(formData, { strictLocal, lang });
  const res = await apiFetch('/convert/pdf-to-excel', {
    method: 'POST',
    body: formData,
    timeoutMs: 180000,
    maxRetries: 1,
  });
  if (!res.ok) throw new Error(await res.text() || 'Backend conversion failed.');
  return res.blob();
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function PdfToExcel() {
  const prefersReduced = useReducedMotion();

  useSEO(
    'PDF to Excel Converter — Instant Online Free | PDF Media Suite',
    'Extract tables from PDF to Excel XLSX instantly in browser. Smart table detection with lattice and stream modes and high-precision OCR table reconstruction.'
  );
  usePageSEO(
    'PDF to Excel — Smart Hybrid Table Extractor',
    'Instantly extracts structured tables into editable spreadsheets, preserving complex merged cells and multilingual scans.',
  );

  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<ConversionStats | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [method, setMethod] = useState<Method>('auto');
  const [frontendMode, setFrontendMode] = useState<FrontendMode>('lattice');
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
      setProgress('Analyzing document & table structure...');

      const isImage = isRasterImageFile(f);
      let numPages = 1;
      let isScanned = isImage;
      let buf: ArrayBuffer | null = null;

      if (!isImage) {
        buf = await f.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        numPages = pdf.numPages;
        isScanned = await detectIfScanned(pdf);
      }

      const useBackend = isImage || method === 'backend' || (method === 'auto' && isScanned);

      if (useBackend) {
        setStage('backend');
        setProgress('Reconstructing merged tables & multilingual cells...');
        const blob = await convertBackend(f, frontendMode, isImage || isScanned, strictLocal, ocrLang);
        setResultUrl(URL.createObjectURL(blob));
        setStats({ pages: numPages, tables: 0, rows: 0, method: 'backend', timeMs: 0 });
      } else {
        setStage('converting');

        // Also get raw text as fallback
        let rawText = '';
        const { tables, stats: s } = await extractFrontend(f, frontendMode, (msg) => setProgress(msg));

        if (tables.length === 0 && buf) {
          setProgress('No tables detected, extracting all text...');
          const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
          for (let p = 1; p <= pdfDoc.numPages; p++) {
            const page = await pdfDoc.getPage(p);
            const tc = await page.getTextContent();
            rawText += tc.items.map((it: any) => it.str).join(' ') + '\n';
          }
        }

        setProgress('Building Excel file...');
        const blob = await buildXlsx(tables, rawText);
        setResultUrl(URL.createObjectURL(blob));
        setStats(s);
      }

      setStage('done');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Extraction failed.');
      setStage('error');
    }
  }, [method, frontendMode, strictLocal, ocrLang]);

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
      title="PDF to Excel"
      subtitle="Smart table extractor. Detects rows, merged headers, and columns instantly — handles both digital & scanned documents."
      categoryLabel="Spreadsheet Extraction · XLSX"
      icon={Table2}
      microVariant="convert"
      tone="emerald"
      trustNote="Instant spreadsheet extraction with precision table reconstruction"
    >
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex flex-wrap justify-center gap-2">
          {[
            { icon: Zap, t: 'Instant browser extraction', color: 'text-amber-500' },
            { icon: BarChart3, t: 'Multi-sheet output', color: 'text-emerald-500' },
            { icon: Filter, t: 'Lattice + Stream modes', color: 'text-blue-500' },
            { icon: Cpu, t: 'OCR backend fallback', color: 'text-purple-500' },
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
                {/* Method */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] mb-2.5">Conversion Mode</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {([
                      { id: 'auto', label: '⚡ Smart Auto', desc: 'Detects PDF type' },
                      { id: 'frontend', label: '🌐 Browser Only', desc: 'Instant, no upload' },
                      { id: 'backend', label: '🧠 AI Backend', desc: 'Best for scanned' },
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
                              layoutId="pdftoexcel-method-pill"
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

                {/* Table detection mode */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] mb-2.5">Table Detection</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {([
                      { id: 'lattice', label: '⬛ Lattice', desc: 'Bordered tables with lines' },
                      { id: 'stream', label: '📄 Stream', desc: 'Borderless / text tables' },
                    ] as { id: FrontendMode; label: string; desc: string }[]).map(m => {
                      const active = frontendMode === m.id;
                      return (
                        <motion.button
                          key={m.id}
                          type="button"
                          whileHover={prefersReduced ? undefined : { y: -1 }}
                          whileTap={prefersReduced ? undefined : { scale: 0.99 }}
                          onClick={() => setFrontendMode(m.id)}
                          style={{
                            borderColor: active ? 'var(--pms-violet)' : 'var(--pms-border)',
                          }}
                          className={`relative p-3.5 rounded-2xl border text-left transition-colors ${
                            active
                              ? 'shadow-sm text-[var(--pms-ink)]'
                              : 'bg-white/75 dark:bg-slate-900/75 text-[var(--pms-ink)] hover:bg-white dark:hover:bg-slate-900'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="pdftoexcel-mode-pill"
                              transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
                              className="absolute inset-0 rounded-[15px]"
                              style={{ backgroundColor: 'var(--pms-soft-lavender)' }}
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
              </div>

              <VisionLayerControls
                showLayerMode={false}
                strictLocal={strictLocal}
                onStrictLocalChange={setStrictLocal}
                lang={ocrLang}
                onLangChange={setOcrLang}
              />

              <FileDropzone
                onDrop={handleDrop}
                multiple={false}
                accept={SCAN_CONVERTER_ACCEPT}
                title="Drop PDF or Scan Image to extract tables to Excel"
                subtitle="Merged cells, multilingual scripts & complex marksheet/invoice grids supported"
              />

              <div className="pms-glass-panel rounded-2xl p-4">
                <p className="text-xs font-bold text-[var(--pms-ink)] mb-2">📊 Table Extraction Modes:</p>
                <div className="space-y-1.5">
                  {[
                    'Lattice: finds tables separated by whitespace — best for grid-style tables',
                    'Stream: extracts all page content as structured rows — best for text-heavy pages',
                  ].map(s => (
                    <div key={s} className="flex items-start gap-2">
                      <ChevronRight className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-[var(--pms-muted)]">{s}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {stage === 'analyzing' && (
            <PearlProcessCard
              title="Analyzing Document & Grid Topology"
              stageLabel="Detecting table structure"
              subtitle={progress || 'Locating rows, columns, and merged cells…'}
              accent="blue"
            />
          )}

          {stage === 'converting' && (
            <PearlProcessCard
              title="Extracting Structured Spreadsheets"
              stageLabel="On-Device Engine · Zero Upload"
              subtitle={progress || 'Formatting workbook sheets directly in your browser…'}
              accent="emerald"
              badge="100% Private Local Processing"
            />
          )}

          {stage === 'backend' && (
            <BackendLoader
              title="Reconstructing Structured Spreadsheets…"
              accentColor="emerald"
              steps={[
                { icon: '📤', label: 'Securing', detail: 'Preparing document geometry for extraction…' },
                { icon: '🔍', label: 'Grid Detection', detail: 'Detecting ruled & borderless table structures…' },
                { icon: '📊', label: 'Cell Extraction', detail: 'Parsing merged spans, numbers & multilingual text…' },
                { icon: '💾', label: 'Generating XLSX', detail: 'Building clean formatted Excel sheets…' },
              ]}
              tips={[
                'Complex scanned tables and borderless invoices are reconstructed seamlessly.',
                'Digital vector spreadsheets extract directly on your device.',
                'Files are processed privately and removed immediately after export.',
                'Each detected table is exported to its own clean worksheet.',
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
                  <h3 className="text-xl font-bold text-[var(--pms-ink)]">Extraction Complete!</h3>
                  <p className="text-sm text-[var(--pms-muted)]">Your Excel file is ready.</p>
                </div>
              </div>

              {stats && (
                <div className="px-6 pt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] rounded-xl p-3 text-center">
                    <p className="text-xs text-[var(--pms-muted)]">Pages</p>
                    <p className="text-sm font-bold text-[var(--pms-ink)] mt-0.5"><AnimatedNumber value={stats.pages} /></p>
                  </div>
                  <div className="bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] rounded-xl p-3 text-center">
                    <p className="text-xs text-[var(--pms-muted)]">Tables</p>
                    <p className="text-sm font-bold text-[var(--pms-ink)] mt-0.5">
                      {stats.tables ? <AnimatedNumber value={stats.tables} /> : '—'}
                    </p>
                  </div>
                  <div className="bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] rounded-xl p-3 text-center">
                    <p className="text-xs text-[var(--pms-muted)]">Method</p>
                    <p className="text-sm font-bold text-[var(--pms-ink)] mt-0.5">
                      {stats.method === 'frontend' ? '⚡ Browser' : '🧠 Backend'}
                    </p>
                  </div>
                  <div className="bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] rounded-xl p-3 text-center">
                    <p className="text-xs text-[var(--pms-muted)]">Rows</p>
                    <p className="text-sm font-bold text-[var(--pms-ink)] mt-0.5">
                      {stats.rows ? <AnimatedNumber value={stats.rows} /> : '—'}
                    </p>
                  </div>
                </div>
              )}

              <div className="p-6 space-y-3">
                <motion.a
                  whileHover={prefersReduced ? undefined : { scale: 1.01 }}
                  whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                  href={resultUrl}
                  download={stripDocumentExt(file.name) + '_tables.xlsx'}
                  className="pms-btn-primary flex items-center justify-center gap-2 w-full px-6 py-4 font-bold rounded-2xl"
                >
                  <Download className="w-5 h-5" /> Download Excel File (.xlsx)
                </motion.a>
                <button
                  type="button"
                  onClick={reset}
                  className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-white/75 dark:bg-slate-900/75 hover:bg-white dark:hover:bg-slate-900 text-[var(--pms-ink)] font-semibold rounded-2xl border border-[var(--pms-border)] transition-colors"
                >
                  <RotateCcw className="w-4 h-4" /> Extract Another File
                </button>
              </div>
            </div>
          )}

          {stage === 'error' && (
            <div className="pms-glass-panel rounded-3xl border-red-200 dark:border-red-800 p-6">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-red-700 dark:text-red-300">Extraction Failed</h3>
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
