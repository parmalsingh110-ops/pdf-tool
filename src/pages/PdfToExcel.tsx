import React, { useState } from 'react';
import { Table2, Scan, Globe, Zap } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  analysePDF, runOCRPipeline,
  LANGUAGE_OPTIONS, OCRLanguage, PageAnalysis, RichRun,
} from '../lib/advancedOCREngine';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { LangPicker, ScanDialog, Spinner, DoneCard, ErrorCard } from './PdfToWord';

// ── Visual line grouping ───────────────────────────────────────────────────────

interface VisualLine {
  runs: RichRun[];
  baseline: number;
  yTop: number;
  yBottom: number;
}

function groupRunsIntoLines(runs: RichRun[]): VisualLine[] {
  if (!runs.length) return [];
  const sorted = [...runs].sort((a, b) => {
    const aB = a.baseline ?? (a.y + a.h);
    const bB = b.baseline ?? (b.y + b.h);
    return aB !== bB ? aB - bB : a.x - b.x;
  });

  const lines: VisualLine[] = [];
  for (const run of sorted) {
    const rb = run.baseline ?? (run.y + run.h);
    const rh = run.h || run.fontSize;
    const tol = Math.max(4, rh * 0.6);
    let found = false;
    for (const ln of lines) {
      if (Math.abs(ln.baseline - rb) <= tol) {
        ln.runs.push(run);
        ln.baseline = (ln.baseline * (ln.runs.length - 1) + rb) / ln.runs.length;
        ln.yTop = Math.min(ln.yTop, run.y);
        ln.yBottom = Math.max(ln.yBottom, run.y + rh);
        found = true;
        break;
      }
    }
    if (!found) lines.push({ runs: [run], baseline: rb, yTop: run.y, yBottom: run.y + rh });
  }

  lines.sort((a, b) => a.baseline - b.baseline);
  for (const ln of lines) ln.runs.sort((a, b) => a.x - b.x);
  return lines;
}

/** Split a visual line's runs into column segments using gap analysis */
function splitLineIntoColumns(runs: RichRun[]): string[] {
  if (!runs.length) return [];
  const segments: RichRun[][] = [];
  let cur: RichRun[] = [runs[0]];

  for (let i = 1; i < runs.length; i++) {
    const prev = runs[i - 1];
    const curr = runs[i];
    const gap = curr.x - (prev.x + prev.w);
    const avgFS = (prev.fontSize + curr.fontSize) / 2;
    // Column gap threshold: 1.5× avg char width or 10 pts minimum
    if (gap > Math.max(avgFS * 1.5, 10)) {
      segments.push(cur);
      cur = [curr];
    } else {
      cur.push(curr);
    }
  }
  segments.push(cur);

  return segments.map(seg => {
    let text = '';
    for (let i = 0; i < seg.length; i++) {
      if (i > 0) {
        const gap = seg[i].x - (seg[i - 1].x + seg[i - 1].w);
        if (gap > seg[i - 1].fontSize * 0.3) text += ' ';
      }
      text += seg[i].text;
    }
    return text.trim();
  }).filter(Boolean);
}

// ── XLSX builder ──────────────────────────────────────────────────────────────

/**
 * Build XLSX from RichRun[]:
 * - Groups runs into visual lines
 * - Splits each line into columns using spatial gap analysis
 * - Each PDF page becomes a separate sheet
 * - Bold/all-caps first row treated as column headers
 */
function buildXlsxFromRuns(runs: RichRun[], pageCount: number): Blob {
  const workbook = XLSX.utils.book_new();

  for (let pi = 0; pi < pageCount; pi++) {
    const pageRuns = runs.filter(r => r.pageIndex === pi);
    if (!pageRuns.length) continue;

    const lines = groupRunsIntoLines(pageRuns);
    if (!lines.length) continue;

    // Split each line into columns
    const rawRows = lines.map(ln => {
      const cols = splitLineIntoColumns(ln.runs);
      const hasBold = ln.runs.some(r => r.bold);
      const isAllCaps = cols.length > 0 && cols.every(c => c === c.toUpperCase() && /[A-Z]/.test(c));
      return { cols, isHeader: hasBold || isAllCaps };
    });

    const nonEmpty = rawRows.filter(r => r.cols.some(c => c.trim()));
    if (!nonEmpty.length) continue;

    const maxCols = Math.max(...nonEmpty.map(r => r.cols.length));
    const aoaData: string[][] = nonEmpty.map(row =>
      Array.from({ length: maxCols }, (_, ci) => row.cols[ci] ?? '')
    );

    const ws = XLSX.utils.aoa_to_sheet(aoaData);

    // Column widths
    const colWidths = aoaData.reduce<number[]>((acc, row) => {
      row.forEach((c, ci) => { acc[ci] = Math.max(acc[ci] ?? 8, c.length + 2); });
      return acc;
    }, []);
    ws['!cols'] = colWidths.map(w => ({ wch: Math.min(w, 50) }));

    const sheetName = `Page ${pi + 1}`.slice(0, 31);
    XLSX.utils.book_append_sheet(workbook, ws, sheetName);
  }

  if (!workbook.SheetNames.length) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['No data extracted']]), 'Sheet1');
  }

  const out = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ── Component ─────────────────────────────────────────────────────────────────

type Stage = 'idle' | 'analysing' | 'scan_detected' | 'processing' | 'done' | 'error';

export default function PdfToExcel() {
  usePageSEO('PDF to Excel Converter — Advanced OCR', 'Convert scanned or digital PDF tables to Excel XLSX. Advanced OCR for 50+ languages.');

  const [file, setFile]               = useState<File | null>(null);
  const [stage, setStage]             = useState<Stage>('idle');
  const [progress, setProgress]       = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [pageAnalyses, setPageAnalyses] = useState<PageAnalysis[]>([]);
  const [lang, setLang]               = useState<OCRLanguage>('auto');
  const [langOpen, setLangOpen]       = useState(false);
  const [resultUrl, setResultUrl]     = useState<string | null>(null);
  const [errorMsg, setErrorMsg]       = useState('');
  const [stats, setStats]             = useState({ rows: 0, scanned: 0, text: 0 });

  const onProgress = (msg: string, pct: number) => { setProgressMsg(msg); setProgress(Math.round(pct)); };

  const handleDrop = async (files: File[]) => {
    if (!files.length) return;
    const f = files[0];
    setFile(f); setResultUrl(null); setErrorMsg(''); setStage('analysing'); setProgress(0);
    try {
      const analyses = await analysePDF(f, onProgress);
      setPageAnalyses(analyses);
      setStage('scan_detected');
    } catch (e: any) { setErrorMsg(e?.message || 'Failed to analyse PDF.'); setStage('error'); }
  };

  const doConvert = async (f: File, analyses: PageAnalysis[], useOcr: boolean) => {
    setStage('processing'); setProgress(0);
    try {
      onProgress('Extracting text and detecting table structure...', 10);
      const result = await runOCRPipeline(f, { lang, useOcr, onProgress });

      onProgress('Building Excel spreadsheet...', 85);
      // Use RichRun[] directly for proper column detection
      const blob = buildXlsxFromRuns(result.runs, result.pdfPageCount);
      setResultUrl(URL.createObjectURL(blob));
      setStats({
        rows: result.runs.length,
        scanned: result.pageAnalyses.filter(p => p.isScanned).length,
        text: result.pageAnalyses.filter(p => p.hasText).length,
      });
      setStage('done');
    } catch (e: any) { setErrorMsg(e?.message || 'Conversion failed.'); setStage('error'); }
  };

  const reset = () => { setFile(null); setStage('idle'); setProgress(0); setProgressMsg(''); setPageAnalyses([]); setResultUrl(null); setErrorMsg(''); };
  const selLabel = LANGUAGE_OPTIONS.find(l => l.value === lang)?.label ?? lang;

  return (
    <div className="flex-1 w-full bg-gradient-to-br from-slate-50 to-emerald-50 dark:from-slate-950 dark:to-slate-900 min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="text-center mb-10">
          <div className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200 dark:shadow-emerald-900 mx-auto mb-4">
            <Table2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-3">PDF to Excel</h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
            Extract tables and data from any PDF — scanned or digital — into a structured Excel spreadsheet.
            Columns, headers, and data structure are all preserved.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-5">
            {[{icon:Scan,t:'Auto OCR Detection'},{icon:Globe,t:'50+ Languages'},{icon:Zap,t:'Table Structure Preserved'}].map(({icon:Icon,t})=>(
              <span key={t} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm">
                <Icon className="w-3.5 h-3.5 text-emerald-500" />{t}
              </span>
            ))}
          </div>
        </div>

        {stage === 'idle' && (
          <div className="space-y-5">
            <LangPicker lang={lang} setLang={setLang} open={langOpen} setOpen={setLangOpen} label={selLabel} accent="emerald" />
            <FileDropzone onDrop={handleDrop} multiple={false} title="Drop your PDF here" subtitle="Scanned, image-based, or digital PDFs — all supported" />
          </div>
        )}
        {stage === 'analysing'  && <Spinner title="Analysing PDF…"              msg={progressMsg} pct={progress} color="emerald" />}
        {stage === 'processing' && <Spinner title="Converting PDF to Excel…"    msg={progressMsg} pct={progress} color="emerald" />}
        {stage === 'scan_detected' && file && (
          <ScanDialog file={file} pageAnalyses={pageAnalyses} lang={lang} setLang={setLang} langOpen={langOpen} setLangOpen={setLangOpen} selLabel={selLabel} accent="emerald"
            onOcr={()=>doConvert(file,pageAnalyses,true)} onSkip={()=>doConvert(file,pageAnalyses,false)} onReset={reset} />
        )}
        {stage === 'done' && resultUrl && file && (
          <DoneCard href={resultUrl} filename={file.name.replace(/\.pdf$/i,'')+'_converted.xlsx'} label="Download Excel File (.xlsx)"
            stats={`${stats.rows} text runs · ${stats.scanned} OCR page(s) · ${stats.text} digital page(s)`} accent="emerald" onReset={reset} />
        )}
        {stage === 'error' && <ErrorCard msg={errorMsg} onReset={reset} />}
      </div>
    </div>
  );
}
