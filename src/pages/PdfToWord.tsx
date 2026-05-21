import React, { useState } from 'react';
import {
  FileText, Scan, Globe, ChevronDown, AlertTriangle,
  CheckCircle2, Download, RotateCcw, Zap, Info,
} from 'lucide-react';
import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  SectionType, PageBreak,
} from 'docx';
import {
  analysePDF, runOCRPipeline,
  LANGUAGE_OPTIONS, OCRLanguage, PageAnalysis, RichParagraph,
} from '../lib/advancedOCREngine';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';

// ── DOCX builder ──────────────────────────────────────────────────────────────

function alignToDocx(a: string): (typeof AlignmentType)[keyof typeof AlignmentType] {
  if (a === 'center')  return AlignmentType.CENTER;
  if (a === 'right')   return AlignmentType.RIGHT;
  if (a === 'justify') return AlignmentType.BOTH;
  return AlignmentType.LEFT;
}

/**
 * Convert PDF font-size (pts) to DOCX half-points.
 * PDF pts ≈ Word pts. Clamp to a sane range.
 */
function toHalfPt(ptSize: number): number {
  return Math.min(144, Math.max(14, Math.round(ptSize * 2)));
}

/**
 * Convert pts of indent to DOCX twips (1 pt = 20 twips)
 */
function toTwips(pts: number): number {
  return Math.round(pts * 20);
}

/**
 * Detect the best Word-compatible font for the given text and PDF font name.
 * Devanagari/Hindi → Mangal (renders conjuncts correctly in Word)
 * Latin text → Calibri (modern default)
 * Other scripts → use PDF font or fallback to Arial Unicode MS
 */
function pickDocxFont(text: string, pdfFontName: string): string {
  // Devanagari range: U+0900–U+097F
  if (/[\u0900-\u097F]/.test(text)) return 'Mangal';
  // Bengali
  if (/[\u0980-\u09FF]/.test(text)) return 'Vrinda';
  // Gujarati
  if (/[\u0A80-\u0AFF]/.test(text)) return 'Shruti';
  // Gurmukhi (Punjabi)
  if (/[\u0A00-\u0A7F]/.test(text)) return 'Raavi';
  // Tamil
  if (/[\u0B80-\u0BFF]/.test(text)) return 'Latha';
  // Telugu
  if (/[\u0C00-\u0C7F]/.test(text)) return 'Gautami';
  // Kannada
  if (/[\u0C80-\u0CFF]/.test(text)) return 'Tunga';
  // Malayalam
  if (/[\u0D00-\u0D7F]/.test(text)) return 'Kartika';
  // Arabic/Urdu
  if (/[\u0600-\u06FF\u0750-\u077F]/.test(text)) return 'Arial';
  // CJK
  if (/[\u4E00-\u9FFF\u3000-\u303F]/.test(text)) return 'SimSun';
  // If PDF has a readable font name (after subset prefix like ABCDEF+FontName)
  const cleaned = pdfFontName.replace(/^[A-Z]{6}\+/, '').replace(/[-_,].*$/, '');
  if (cleaned && !cleaned.toLowerCase().includes('identity') && cleaned.length > 2) {
    return cleaned;
  }
  return 'Calibri';
}

function buildDocxFromParagraphs(paras: RichParagraph[], pageCount: number): Document {
  const children: Paragraph[] = [];
  let currentPage = -1;

  for (const para of paras) {
    // Page break between pages
    if (para.pageIndex !== currentPage) {
      if (currentPage !== -1) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }
      currentPage = para.pageIndex;
    }

    // Paragraph spacing: exact vertical gap translated to Word spacing-before (uncapped)
    const spaceBefore = Math.round(para.paragraphSpaceBefore * 20);

    // Indentation: only apply if text is left-aligned or justified to prevent messing up centered/right-aligned text
    const indentProps: { left?: number; hanging?: number } | undefined =
      para.indent > 2 && (para.alignment === 'left' || para.alignment === 'justify')
        ? { left: toTwips(para.indent) }
        : undefined;

    // Split multi-line paragraph text back into sub-lines and create separate runs
    const lineTexts = para.text.split('\n').filter(t => t.trim());

    // Determine best font from paragraph runs
    const dominantFontName = para.runs.length > 0 ? para.runs[0].fontName : '';

    // Build one Paragraph per logical line of the PDF (preserving visual line breaks)
    for (let li = 0; li < lineTexts.length; li++) {
      const lineText = lineTexts[li];
      if (!lineText.trim()) continue;

      // Pick font based on actual text content
      const font = pickDocxFont(lineText, dominantFontName);

      // For the first line, use paragraph spacing; subsequent lines have no extra space
      const run = new TextRun({
        text: lineText,
        bold: para.bold,
        italics: para.italic,
        size: toHalfPt(para.fontSize),
        font,
      });

      children.push(new Paragraph({
        children: [run],
        alignment: alignToDocx(para.alignment),
        spacing: {
          before: li === 0 ? spaceBefore : 0,
          after: 0,
          line: 276,       // ~1.15× line spacing (240 = single)
          lineRule: 'auto' as any,
        },
        indent: indentProps,
        // List items get a bullet-style indent
        ...(para.isListItem && li === 0 ? {
          indent: { left: toTwips(Math.max(para.indent, 28)), hanging: toTwips(14) },
        } : {}),
      }));
    }
  }

  return new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Calibri',
            size: 24,    // 12pt default
          },
        },
      },
    },
    sections: [{
      properties: { type: SectionType.CONTINUOUS },
      children,
    }],
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

type Stage = 'idle' | 'analysing' | 'scan_detected' | 'processing' | 'done' | 'error';

export default function PdfToWord() {
  usePageSEO(
    'PDF to Word Converter — Advanced OCR',
    'Convert any PDF to Word DOCX with bold, alignment, indentation preserved. Advanced OCR for Hindi, Arabic, Chinese, and 50+ languages.',
  );

  const [file, setFile]               = useState<File | null>(null);
  const [stage, setStage]             = useState<Stage>('idle');
  const [progress, setProgress]       = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [pageAnalyses, setPageAnalyses] = useState<PageAnalysis[]>([]);
  const [lang, setLang]               = useState<OCRLanguage>('auto');
  const [langOpen, setLangOpen]       = useState(false);
  const [resultUrl, setResultUrl]     = useState<string | null>(null);
  const [errorMsg, setErrorMsg]       = useState('');
  const [stats, setStats]             = useState({ paras: 0, scanned: 0, text: 0 });

  const onProgress = (msg: string, pct: number) => {
    setProgressMsg(msg); setProgress(Math.round(pct));
  };

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
      const result = await runOCRPipeline(f, { lang, useOcr, onProgress });
      const doc  = buildDocxFromParagraphs(result.paragraphs, result.pdfPageCount);
      const blob = await Packer.toBlob(doc);
      setResultUrl(URL.createObjectURL(blob));
      setStats({ paras: result.paragraphs.length, scanned: result.pageAnalyses.filter(p => p.isScanned).length, text: result.pageAnalyses.filter(p => p.hasText).length });
      setStage('done');
    } catch (e: any) { setErrorMsg(e?.message || 'Conversion failed.'); setStage('error'); }
  };

  const reset = () => { setFile(null); setStage('idle'); setProgress(0); setProgressMsg(''); setPageAnalyses([]); setResultUrl(null); setErrorMsg(''); };

  const selLabel = LANGUAGE_OPTIONS.find(l => l.value === lang)?.label ?? lang;

  return (
    <div className="flex-1 w-full bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900 min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 dark:shadow-blue-900 mx-auto mb-4">
            <FileText className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-3">PDF to Word</h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
            Convert any PDF — scanned, image, or digital — into a perfectly formatted Word document.
            Bold, indentation, alignment, font sizes — all preserved.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-5">
            {[{icon:Scan,t:'Auto OCR Detection'},{icon:Globe,t:'50+ Languages'},{icon:Zap,t:'Format Preserved'}].map(({icon:Icon,t})=>(
              <span key={t} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm">
                <Icon className="w-3.5 h-3.5 text-blue-500" />{t}
              </span>
            ))}
          </div>
        </div>

        {stage === 'idle' && (
          <div className="space-y-5">
            <LangPicker lang={lang} setLang={setLang} open={langOpen} setOpen={setLangOpen} label={selLabel} accent="blue" />
            <FileDropzone onDrop={handleDrop} multiple={false} title="Drop your PDF here" subtitle="Scanned, image-based, or digital PDFs — all supported" />
          </div>
        )}

        {stage === 'analysing'  && <Spinner title="Analysing PDF…"              msg={progressMsg} pct={progress} color="blue" />}
        {stage === 'processing' && <Spinner title="Converting PDF to Word…"      msg={progressMsg} pct={progress} color="blue" />}

        {stage === 'scan_detected' && file && (
          <ScanDialog
            file={file} pageAnalyses={pageAnalyses}
            lang={lang} setLang={setLang} langOpen={langOpen} setLangOpen={setLangOpen} selLabel={selLabel}
            accent="blue"
            onOcr={()=>doConvert(file,pageAnalyses,true)}
            onSkip={()=>doConvert(file,pageAnalyses,false)}
            onReset={reset}
          />
        )}

        {stage === 'done' && resultUrl && file && (
          <DoneCard
            href={resultUrl}
            filename={file.name.replace(/\.pdf$/i,'')+'_converted.docx'}
            label="Download Word File (.docx)"
            stats={`${stats.paras} paragraphs · ${stats.scanned} OCR page(s) · ${stats.text} digital page(s)`}
            accent="blue" onReset={reset}
          />
        )}

        {stage === 'error' && <ErrorCard msg={errorMsg} onReset={reset} />}

      </div>
    </div>
  );
}

// ── Shared UI sub-components ──────────────────────────────────────────────────

export function LangPicker({ lang, setLang, open, setOpen, label, accent }: any) {
  return (
    <div className="relative">
      <button onClick={()=>setOpen((o:boolean)=>!o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm text-sm font-medium text-slate-800 dark:text-white hover:border-blue-400 transition-colors">
        <span className="flex items-center gap-2"><Globe className="w-4 h-4 text-blue-500"/>OCR Language: <span className="text-blue-600 dark:text-blue-400">{label}</span></span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open?'rotate-180':''}`}/>
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-64 overflow-y-auto">
          {LANGUAGE_OPTIONS.map(opt=>(
            <button key={opt.value} onClick={()=>{setLang(opt.value);setOpen(false);}}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-slate-700 flex items-center justify-between transition-colors
                ${lang===opt.value?'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold':'text-slate-700 dark:text-slate-300'}`}>
              <span>{opt.label}</span><span className="text-xs text-slate-400">{opt.script}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ScanDialog({ file, pageAnalyses, lang, setLang, langOpen, setLangOpen, selLabel, accent, onOcr, onSkip, onReset }: any) {
  const scanned = (pageAnalyses as PageAnalysis[]).filter(p=>p.isScanned).length;
  const textPgs = (pageAnalyses as PageAnalysis[]).filter(p=>p.hasText).length;
  const isDigital = scanned === 0;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden">
      {isDigital ? (
        <div className="bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-800 px-6 py-5 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/50 rounded-xl flex items-center justify-center">
            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400"/>
          </div>
          <div>
            <h3 className="font-bold text-blue-900 dark:text-blue-200">Digital PDF Detected</h3>
            <p className="text-sm text-blue-700 dark:text-blue-400">Select conversion mode</p>
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 px-6 py-5 flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/50 rounded-xl flex items-center justify-center">
            <Scan className="w-5 h-5 text-amber-600 dark:text-amber-400"/>
          </div>
          <div>
            <h3 className="font-bold text-amber-900 dark:text-amber-200">Scanned PDF Detected</h3>
            <p className="text-sm text-amber-700 dark:text-amber-400">{scanned} of {pageAnalyses.length} pages are image-only</p>
          </div>
        </div>
      )}
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
          <FileText className="w-8 h-8 text-slate-500"/>
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 dark:text-white truncate">{file.name}</p>
            <p className="text-xs text-slate-500">{(file.size/1024/1024).toFixed(2)} MB · {pageAnalyses.length} pages</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-orange-50 dark:bg-orange-950/30 rounded-xl border border-orange-200 dark:border-orange-800 text-center">
            <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{scanned}</p>
            <p className="text-xs text-orange-600 dark:text-orange-400">Scanned pages</p>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800 text-center">
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{textPgs}</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">Text pages</p>
          </div>
        </div>
        <LangPicker lang={lang} setLang={setLang} open={langOpen} setOpen={setLangOpen} label={selLabel} accent={accent}/>
        <div className="flex flex-col gap-3">
          {isDigital ? (
            <>
              <button onClick={onSkip}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all hover:scale-[1.01]">
                <Zap className="w-5 h-5"/> Standard Conversion (Fast)
              </button>
              <button onClick={onOcr}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl border border-slate-200 dark:border-slate-700 transition-all">
                <Scan className="w-5 h-5"/> Advanced OCR Mode <span className="ml-1 text-xs text-slate-400">(Fixes garbled Hindi/Regional fonts)</span>
              </button>
            </>
          ) : (
            <>
              <button onClick={onOcr}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all hover:scale-[1.01]">
                <Scan className="w-5 h-5"/> Apply with OCR (Recommended)
              </button>
              <button onClick={onSkip}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl border border-slate-200 dark:border-slate-700 transition-all">
                Continue without OCR
              </button>
            </>
          )}
          <button onClick={onReset} className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-center py-1">← Choose a different file</button>
        </div>
        <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-400"/>
          {isDigital ? "If the output document has unreadable or garbled characters, use Advanced OCR Mode to fix it while preserving exact formatting." : "OCR reads text from scanned images and preserves position, alignment, bold, and font size in the output."}
        </div>
      </div>
    </div>
  );
}

export function Spinner({ title, msg, pct, color }: { title:string; msg:string; pct:number; color:string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center shadow-sm">
      <div className={`w-16 h-16 rounded-full border-4 border-${color}-200 dark:border-${color}-900 border-t-${color}-600 animate-spin mx-auto mb-4`}/>
      <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 min-h-[20px]">{msg}</p>
      <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full bg-${color}-500 rounded-full transition-all duration-300`} style={{width:`${pct}%`}}/>
      </div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mt-3">{pct}%</p>
    </div>
  );
}

export function DoneCard({ href, filename, label, stats, accent, onReset }: any) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-lg overflow-hidden">
      <div className="bg-emerald-50 dark:bg-emerald-950/40 px-6 py-5 border-b border-emerald-200 dark:border-emerald-800 flex items-center gap-3">
        <CheckCircle2 className="w-8 h-8 text-emerald-500"/>
        <div>
          <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-200">Conversion Complete!</h3>
          <p className="text-sm text-emerald-700 dark:text-emerald-400">{stats}</p>
        </div>
      </div>
      <div className="p-6 space-y-4">
        <a href={href} download={filename}
          className="flex items-center justify-center gap-2 w-full px-6 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all hover:scale-[1.01]">
          <Download className="w-5 h-5"/>{label}
        </a>
        <button onClick={onReset}
          className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl border border-slate-200 dark:border-slate-700 transition-colors">
          <RotateCcw className="w-4 h-4"/>Convert Another File
        </button>
      </div>
    </div>
  );
}

export function ErrorCard({ msg, onReset }: { msg:string; onReset:()=>void }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-red-200 dark:border-red-800 p-6">
      <div className="flex items-start gap-3 mb-4">
        <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5"/>
        <div><h3 className="font-bold text-red-800 dark:text-red-200">Conversion Failed</h3><p className="text-sm text-red-700 dark:text-red-300 mt-1">{msg}</p></div>
      </div>
      <button onClick={onReset} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium">
        <RotateCcw className="w-4 h-4"/>Try again
      </button>
    </div>
  );
}
