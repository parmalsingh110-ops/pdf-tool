import React, { useState } from 'react';
import { Table2, Scan, Globe, Zap } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  analysePDF, runOCRPipeline,
  LANGUAGE_OPTIONS, OCRLanguage, PageAnalysis, RichParagraph,
} from '../lib/advancedOCREngine';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { LangPicker, ScanDialog, Spinner, DoneCard, ErrorCard } from './PdfToWord';

// ── XLSX builder ──────────────────────────────────────────────────────────────

function buildXlsx(paras: RichParagraph[], pageCount: number): Blob {
  const workbook = XLSX.utils.book_new();
  const byPage = new Map<number, RichParagraph[]>();
  for (const p of paras) {
    if (!byPage.has(p.pageIndex)) byPage.set(p.pageIndex, []);
    byPage.get(p.pageIndex)!.push(p);
  }

  for (let pi = 0; pi < pageCount; pi++) {
    const pageParas = (byPage.get(pi) ?? []).sort((a, b) => a.y - b.y);
    const aoaData: string[][] = [];
    for (const para of pageParas) {
      const lineTexts = para.text.split('\n').filter(t => t.trim());
      for (const lt of lineTexts) {
        const cols = lt.split(/\s{3,}/).map(s => s.trim()).filter(Boolean);
        aoaData.push(cols.length > 1 ? cols : [lt.trim()]);
      }
    }
    if (!aoaData.length) continue;
    const ws = XLSX.utils.aoa_to_sheet(aoaData);
    const colWidths = aoaData.reduce<number[]>((acc, row) => {
      row.forEach((c, ci) => { acc[ci] = Math.max(acc[ci] ?? 8, c.length + 2); });
      return acc;
    }, []);
    ws['!cols'] = colWidths.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(workbook, ws, `Page ${pi + 1}`);
  }
  if (!workbook.SheetNames.length)
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['No data']]), 'Sheet1');

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
      analyses.some(p => p.isScanned) ? setStage('scan_detected') : await doConvert(f, analyses, false);
    } catch (e: any) { setErrorMsg(e?.message || 'Failed to analyse PDF.'); setStage('error'); }
  };

  const doConvert = async (f: File, analyses: PageAnalysis[], useOcr: boolean) => {
    setStage('processing'); setProgress(0);
    try {
      const result = await runOCRPipeline(f, { lang, useOcr, onProgress });
      const blob = buildXlsx(result.paragraphs, result.pdfPageCount);
      setResultUrl(URL.createObjectURL(blob));
      setStats({ rows: result.paragraphs.length, scanned: result.pageAnalyses.filter(p => p.isScanned).length, text: result.pageAnalyses.filter(p => p.hasText).length });
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
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-5">
            {[{icon:Scan,t:'Auto OCR Detection'},{icon:Globe,t:'50+ Languages'},{icon:Zap,t:'Column Preserved'}].map(({icon:Icon,t})=>(
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
        {stage === 'analysing'  && <Spinner title="Analysing PDF…"               msg={progressMsg} pct={progress} color="emerald" />}
        {stage === 'processing' && <Spinner title="Converting PDF to Excel…"      msg={progressMsg} pct={progress} color="emerald" />}
        {stage === 'scan_detected' && file && (
          <ScanDialog file={file} pageAnalyses={pageAnalyses} lang={lang} setLang={setLang} langOpen={langOpen} setLangOpen={setLangOpen} selLabel={selLabel} accent="emerald"
            onOcr={()=>doConvert(file,pageAnalyses,true)} onSkip={()=>doConvert(file,pageAnalyses,false)} onReset={reset} />
        )}
        {stage === 'done' && resultUrl && file && (
          <DoneCard href={resultUrl} filename={file.name.replace(/\.pdf$/i,'')+'_converted.xlsx'} label="Download Excel File (.xlsx)"
            stats={`${stats.rows} rows · ${stats.scanned} OCR page(s) · ${stats.text} digital page(s)`} accent="emerald" onReset={reset} />
        )}
        {stage === 'error' && <ErrorCard msg={errorMsg} onReset={reset} />}
      </div>
    </div>
  );
}
