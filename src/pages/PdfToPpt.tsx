import React, { useState } from 'react';
import { PresentationIcon, Scan, Globe, Zap } from 'lucide-react';
import pptxgen from 'pptxgenjs';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  analysePDF, runOCRPipeline,
  LANGUAGE_OPTIONS, OCRLanguage, PageAnalysis, RichParagraph,
} from '../lib/advancedOCREngine';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { LangPicker, ScanDialog, Spinner, DoneCard, ErrorCard } from './PdfToWord';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ── PPTX builder ──────────────────────────────────────────────────────────────

async function buildPptx(
  file: File,
  pageAnalyses: PageAnalysis[],
  paragraphs: RichParagraph[],
  useOcr: boolean,
  onProgress?: (msg: string, pct: number) => void,
): Promise<Blob> {
  const ab = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
  const pres = new pptxgen();

  const byPage = new Map<number, RichParagraph[]>();
  for (const p of paragraphs) {
    if (!byPage.has(p.pageIndex)) byPage.set(p.pageIndex, []);
    byPage.get(p.pageIndex)!.push(p);
  }

  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.(`Rendering slide ${i} of ${pdf.numPages}…`, 90 + (i / pdf.numPages) * 8);
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });

    pres.layout = (vp.width / vp.height) > 1.3 ? 'LAYOUT_16x9' : 'LAYOUT_4x3';

    const slide = pres.addSlide();

    // High-quality background
    const scale = 2.5;
    const rv = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(rv.width);
    canvas.height = Math.round(rv.height);
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport: rv, canvas }).promise;
    slide.addImage({ data: canvas.toDataURL('image/jpeg', 0.92), x: 0, y: 0, w: '100%', h: '100%' });
    canvas.width = 0; canvas.height = 0;

    // Invisible OCR text overlay
    if (useOcr) {
      const slideW = pres.layout === 'LAYOUT_16x9' ? 10 : 10;
      const slideH = pres.layout === 'LAYOUT_16x9' ? 5.625 : 7.5;
      for (const para of byPage.get(i - 1) ?? []) {
        if (!para.text.trim()) continue;
        const xIn = (para.x / vp.width) * slideW;
        const yIn = (para.y / vp.height) * slideH;
        const wIn = Math.max(0.5, ((para.right - para.x) / vp.width) * slideW);
        const hIn = Math.max(0.2, (para.fontSize / vp.height) * slideH * 2.2);
        const align = para.alignment === 'center' ? 'center' : para.alignment === 'right' ? 'r' : 'left';
        try {
          slide.addText(para.text.replace(/\n/g, ' ').trim(), {
            x: xIn, y: yIn,
            w: Math.min(wIn, slideW - xIn), h: hIn,
            fontSize: Math.max(6, Math.round(para.fontSize * 0.8)),
            fontFace: 'Calibri',
            align: align as any,
            color: 'FFFFFF',
            transparency: 100,
            wrap: true,
          });
        } catch { /* skip out-of-bounds */ }
      }
    }
  }

  return (await pres.write({ outputType: 'blob' })) as Blob;
}

// ── Component ─────────────────────────────────────────────────────────────────

type Stage = 'idle' | 'analysing' | 'scan_detected' | 'processing' | 'done' | 'error';

export default function PdfToPpt() {
  usePageSEO('PDF to PowerPoint Converter — Advanced OCR', 'Convert any PDF to PowerPoint PPTX. Advanced OCR for 50+ languages with pixel-perfect slides.');

  const [file, setFile]               = useState<File | null>(null);
  const [stage, setStage]             = useState<Stage>('idle');
  const [progress, setProgress]       = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [pageAnalyses, setPageAnalyses] = useState<PageAnalysis[]>([]);
  const [lang, setLang]               = useState<OCRLanguage>('auto');
  const [langOpen, setLangOpen]       = useState(false);
  const [resultUrl, setResultUrl]     = useState<string | null>(null);
  const [errorMsg, setErrorMsg]       = useState('');
  const [stats, setStats]             = useState({ slides: 0, scanned: 0, text: 0 });

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
      const blob = await buildPptx(f, result.pageAnalyses, result.paragraphs, useOcr, onProgress);
      setResultUrl(URL.createObjectURL(blob));
      setStats({ slides: result.pdfPageCount, scanned: result.pageAnalyses.filter(p => p.isScanned).length, text: result.pageAnalyses.filter(p => p.hasText).length });
      setStage('done');
    } catch (e: any) { setErrorMsg(e?.message || 'Conversion failed.'); setStage('error'); }
  };

  const reset = () => { setFile(null); setStage('idle'); setProgress(0); setProgressMsg(''); setPageAnalyses([]); setResultUrl(null); setErrorMsg(''); };
  const selLabel = LANGUAGE_OPTIONS.find(l => l.value === lang)?.label ?? lang;

  return (
    <div className="flex-1 w-full bg-gradient-to-br from-slate-50 to-orange-50 dark:from-slate-950 dark:to-slate-900 min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="text-center mb-10">
          <div className="w-14 h-14 bg-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-200 dark:shadow-orange-900 mx-auto mb-4">
            <PresentationIcon className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-3">PDF to PowerPoint</h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
            Convert any PDF into pixel-perfect PowerPoint slides. OCR overlay lets you select and copy text in any language.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-5">
            {[{icon:Scan,t:'Auto OCR Detection'},{icon:Globe,t:'50+ Languages'},{icon:Zap,t:'Pixel-Perfect Slides'}].map(({icon:Icon,t})=>(
              <span key={t} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm">
                <Icon className="w-3.5 h-3.5 text-orange-500" />{t}
              </span>
            ))}
          </div>
        </div>

        {stage === 'idle' && (
          <div className="space-y-5">
            <LangPicker lang={lang} setLang={setLang} open={langOpen} setOpen={setLangOpen} label={selLabel} accent="orange" />
            <FileDropzone onDrop={handleDrop} multiple={false} title="Drop your PDF here" subtitle="Scanned, image-based, or digital PDFs — all supported" />
          </div>
        )}
        {stage === 'analysing'  && <Spinner title="Analysing PDF…"                    msg={progressMsg} pct={progress} color="orange" />}
        {stage === 'processing' && <Spinner title="Converting PDF to PowerPoint…"      msg={progressMsg} pct={progress} color="orange" />}
        {stage === 'scan_detected' && file && (
          <ScanDialog file={file} pageAnalyses={pageAnalyses} lang={lang} setLang={setLang} langOpen={langOpen} setLangOpen={setLangOpen} selLabel={selLabel} accent="orange"
            onOcr={()=>doConvert(file,pageAnalyses,true)} onSkip={()=>doConvert(file,pageAnalyses,false)} onReset={reset} />
        )}
        {stage === 'done' && resultUrl && file && (
          <DoneCard href={resultUrl} filename={file.name.replace(/\.pdf$/i,'')+'_converted.pptx'} label="Download PowerPoint (.pptx)"
            stats={`${stats.slides} slides · ${stats.scanned} OCR page(s) · ${stats.text} digital page(s)`} accent="orange" onReset={reset} />
        )}
        {stage === 'error' && <ErrorCard msg={errorMsg} onReset={reset} />}
      </div>
    </div>
  );
}
