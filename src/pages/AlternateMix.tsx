import React, { useState, useEffect } from 'react';
import { Download, FileText, ArrowUpDown, CheckCircle2, Eye, Loader2, Sparkles, Plus, Trash2, ArrowRightLeft, Layers, Shuffle } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolSEOSection from '../components/ToolSEOSection';

interface DocItem {
  file: File;
  pageCount: number;
  thumbs: string[];
}

interface MixedPageItem {
  docIndex: number;
  sourcePageNum: number;
  thumb: string;
}

export default function AlternateMix() {
  useSEO(
    'Alternate & Mix PDF Online Free — Duplex Scan Interleaver | PDF Media Suite',
    'Mix and interleave pages from two or more PDF documents online free. Perfect for merging odd and even scanned pages from duplex scanner feeds.'
  );

  usePageSEO(
    'Alternate & Mix PDF — Duplex Scan Interleave Merger',
    'Combine two separate PDF files by alternating their pages. Automatically reverse the second document for single-sided duplex scanner batches.'
  );

  const [doc1, setDoc1] = useState<DocItem | null>(null);
  const [doc2, setDoc2] = useState<DocItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState<'doc1' | 'doc2' | null>(null);

  // Settings
  const [reverseDoc2, setReverseDoc2] = useState(true); // default true for scanners!
  const [stepSize, setStepSize] = useState<number>(1); // 1 by 1, or 2 by 2
  const [startWithDoc, setStartWithDoc] = useState<1 | 2>(1);

  const [mixedSequence, setMixedSequence] = useState<MixedPageItem[]>([]);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState('');

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  const loadDoc = async (file: File, which: 'doc1' | 'doc2') => {
    setLoadingDoc(which);
    try {
      const ab = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
      const total = pdf.numPages;
      const thumbs: string[] = [];

      const thumbLimit = Math.min(total, 16);
      for (let i = 1; i <= thumbLimit; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 0.3 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(vp.width);
        canvas.height = Math.round(vp.height);
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
        thumbs.push(canvas.toDataURL('image/jpeg', 0.7));
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }

      const item: DocItem = { file, pageCount: total, thumbs };
      if (which === 'doc1') setDoc1(item);
      else setDoc2(item);
      setResultUrl(null);
    } catch (e: any) {
      alert('Could not load PDF: ' + (e?.message || 'Invalid PDF'));
    } finally {
      setLoadingDoc(null);
    }
  };

  // Recompute visual mixed order preview whenever docs or options change
  useEffect(() => {
    if (!doc1 || !doc2) {
      setMixedSequence([]);
      return;
    }

    const p1List = Array.from({ length: doc1.pageCount }, (_, i) => ({
      docIndex: 1,
      sourcePageNum: i + 1,
      thumb: doc1.thumbs[i] || '',
    }));

    let p2List = Array.from({ length: doc2.pageCount }, (_, i) => ({
      docIndex: 2,
      sourcePageNum: i + 1,
      thumb: doc2.thumbs[i] || '',
    }));

    if (reverseDoc2) {
      p2List = p2List.reverse();
    }

    const first = startWithDoc === 1 ? p1List : p2List;
    const second = startWithDoc === 1 ? p2List : p1List;

    const result: MixedPageItem[] = [];
    let i1 = 0;
    let i2 = 0;

    while (i1 < first.length || i2 < second.length) {
      for (let s = 0; s < stepSize && i1 < first.length; s++) {
        result.push(first[i1++]);
      }
      for (let s = 0; s < stepSize && i2 < second.length; s++) {
        result.push(second[i2++]);
      }
    }

    setMixedSequence(result.slice(0, 36)); // preview first 36
  }, [doc1, doc2, reverseDoc2, stepSize, startWithDoc]);

  const processMix = async () => {
    if (!doc1 || !doc2) return;
    setBusy(true);

    try {
      const [ab1, ab2] = await Promise.all([
        doc1.file.arrayBuffer(),
        doc2.file.arrayBuffer(),
      ]);

      const [pdf1, pdf2] = await Promise.all([
        PDFDocument.load(ab1),
        PDFDocument.load(ab2),
      ]);

      const outDoc = await PDFDocument.create();

      let p1Indices = Array.from({ length: pdf1.getPageCount() }, (_, i) => ({ doc: 1, idx: i }));
      let p2Indices = Array.from({ length: pdf2.getPageCount() }, (_, i) => ({ doc: 2, idx: i }));

      if (reverseDoc2) {
        p2Indices = p2Indices.reverse();
      }

      const first = startWithDoc === 1 ? p1Indices : p2Indices;
      const second = startWithDoc === 1 ? p2Indices : p1Indices;

      const fullOrder: { doc: number; idx: number }[] = [];
      let i1 = 0;
      let i2 = 0;

      while (i1 < first.length || i2 < second.length) {
        for (let s = 0; s < stepSize && i1 < first.length; s++) {
          fullOrder.push(first[i1++]);
        }
        for (let s = 0; s < stepSize && i2 < second.length; s++) {
          fullOrder.push(second[i2++]);
        }
      }

      // Copy pages in the calculated order
      for (const item of fullOrder) {
        const sourceDoc = item.doc === 1 ? pdf1 : pdf2;
        const [copiedPage] = await outDoc.copyPages(sourceDoc, [item.idx]);
        outDoc.addPage(copiedPage);
      }

      const outBytes = await outDoc.save();
      const blob = new Blob([outBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultName(`${doc1.file.name.replace(/\.pdf$/i, '')}_mixed_duplex.pdf`);
    } catch (e: any) {
      console.error('Mix error:', e);
      alert('Error mixing PDFs: ' + (e?.message || 'Unknown error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 transition-colors">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 text-sm font-semibold mb-3">
            <Shuffle className="w-4 h-4" /> Duplex Scanner Interleave Merger
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
            Alternate & Mix PDF
          </h1>
          <p className="text-base md:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Combine two PDF documents by alternating between their pages. Perfect for merging odd and even scanned pages from duplex feeder scans.
          </p>
        </div>

        {/* Upload Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Document 1 (Odd Pages) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider">
                  Document 1 (e.g. Front / Odd Pages: 1, 3, 5...)
                </span>
                {doc1 && (
                  <button
                    onClick={() => setDoc1(null)}
                    className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                )}
              </div>

              {!doc1 ? (
                <FileDropzone
                  onDrop={(files) => files[0] && loadDoc(files[0], 'doc1')}
                  accept={{ 'application/pdf': ['.pdf'] }}
                  multiple={false}
                  title="Upload Document 1"
                  subtitle="Drop odd-numbered pages PDF"
                />
              ) : (
                <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800">
                  <div className="flex items-center gap-3">
                    <FileText className="w-8 h-8 text-teal-600 dark:text-teal-400 shrink-0" />
                    <div className="overflow-hidden">
                      <p className="font-bold text-slate-800 dark:text-slate-200 text-sm truncate">{doc1.file.name}</p>
                      <p className="text-xs text-slate-500">{doc1.pageCount} pages • {(doc1.file.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                  </div>
                  {doc1.thumbs.length > 0 && (
                    <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                      {doc1.thumbs.slice(0, 5).map((t, i) => (
                        <div key={i} className="relative shrink-0 w-12 h-16 border rounded bg-white overflow-hidden shadow-xs">
                          <img src={t} alt="" className="w-full h-full object-cover" />
                          <span className="absolute bottom-0 right-0 bg-black/70 text-[9px] text-white px-1 font-mono">
                            p.{i + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Document 2 (Even Pages) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                  Document 2 (e.g. Back / Even Pages: 2, 4, 6...)
                </span>
                {doc2 && (
                  <button
                    onClick={() => setDoc2(null)}
                    className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                )}
              </div>

              {!doc2 ? (
                <FileDropzone
                  onDrop={(files) => files[0] && loadDoc(files[0], 'doc2')}
                  accept={{ 'application/pdf': ['.pdf'] }}
                  multiple={false}
                  title="Upload Document 2"
                  subtitle="Drop even-numbered pages PDF"
                />
              ) : (
                <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-3">
                    <FileText className="w-8 h-8 text-blue-600 dark:text-blue-400 shrink-0" />
                    <div className="overflow-hidden">
                      <p className="font-bold text-slate-800 dark:text-slate-200 text-sm truncate">{doc2.file.name}</p>
                      <p className="text-xs text-slate-500">{doc2.pageCount} pages • {(doc2.file.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                  </div>
                  {doc2.thumbs.length > 0 && (
                    <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                      {doc2.thumbs.slice(0, 5).map((t, i) => (
                        <div key={i} className="relative shrink-0 w-12 h-16 border rounded bg-white overflow-hidden shadow-xs">
                          <img src={t} alt="" className="w-full h-full object-cover" />
                          <span className="absolute bottom-0 right-0 bg-black/70 text-[9px] text-white px-1 font-mono">
                            p.{i + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Options & Mixing Settings */}
        {doc1 && doc2 && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-teal-600" /> Interleave Settings
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* 1. Reverse Doc 2 */}
                <div className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                  <input
                    type="checkbox"
                    id="revDoc2"
                    checked={reverseDoc2}
                    onChange={(e) => setReverseDoc2(e.target.checked)}
                    className="w-5 h-5 rounded text-teal-600 focus:ring-teal-500 mt-0.5 cursor-pointer"
                  />
                  <div>
                    <label htmlFor="revDoc2" className="text-sm font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                      Reverse Document 2
                    </label>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Recommended for ADF duplex scans where backside pages are scanned back-to-front (e.g. 8, 6, 4, 2).
                    </p>
                  </div>
                </div>

                {/* 2. Step Size */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                    Step Frequency
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setStepSize(1)}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors ${
                        stepSize === 1
                          ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400'
                          : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      1 by 1 (Standard)
                    </button>
                    <button
                      type="button"
                      onClick={() => setStepSize(2)}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors ${
                        stepSize === 2
                          ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400'
                          : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      2 by 2 Pages
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">1 by 1 alternates single pages from each file</p>
                </div>

                {/* 3. First Document */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                    Start Merge With
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setStartWithDoc(1)}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors ${
                        startWithDoc === 1
                          ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400'
                          : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      Document 1 First
                    </button>
                    <button
                      type="button"
                      onClick={() => setStartWithDoc(2)}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors ${
                        startWithDoc === 2
                          ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400'
                          : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      Document 2 First
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Page 1 will come from selected document</p>
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  onClick={processMix}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {busy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Mixing Pages...
                    </>
                  ) : (
                    <>
                      <Shuffle className="w-4 h-4" /> Mix & Combine PDFs
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Visual Interleaved Sequence Preview */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-teal-600" />
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Interleaved Sequence Order Preview (Total {doc1.pageCount + doc2.pageCount} Pages)
                  </h4>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1.5 text-teal-700 dark:text-teal-400 font-semibold">
                    <span className="w-3 h-3 rounded-full bg-teal-500 inline-block" /> Doc 1
                  </span>
                  <span className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400 font-semibold">
                    <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Doc 2 {reverseDoc2 ? '(Reversed)' : ''}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2.5 max-h-80 overflow-y-auto p-1">
                {mixedSequence.map((item, idx) => (
                  <div
                    key={idx}
                    className={`relative rounded-lg border-2 p-1 text-center shadow-xs transition-all ${
                      item.docIndex === 1
                        ? 'border-teal-500 bg-teal-50/40 dark:bg-teal-950/20'
                        : 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20'
                    }`}
                  >
                    <div className="aspect-[3/4] bg-white rounded overflow-hidden mb-1 border border-slate-200">
                      {item.thumb ? (
                        <img src={item.thumb} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400">
                          p.{item.sourcePageNum}
                        </div>
                      )}
                    </div>
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                        item.docIndex === 1
                          ? 'bg-teal-600 text-white'
                          : 'bg-blue-600 text-white'
                      }`}
                    >
                      #{idx + 1}
                    </span>
                    <p className="text-[9px] text-slate-500 truncate mt-0.5">
                      D{item.docIndex} p.{item.sourcePageNum}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Success Box */}
            {resultUrl && (
              <div className="p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center animate-fade-in">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
                <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-100 mb-1">
                  Alternate & Mix Complete!
                </h3>
                <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-4">
                  Successfully merged {doc1.pageCount + doc2.pageCount} pages into a perfectly interleaved document.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <a
                    href={resultUrl}
                    download={resultName}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition-colors"
                  >
                    <Download className="w-4 h-4" /> Download Merged PDF
                  </a>
                  <a
                    href={resultUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-emerald-800 dark:text-emerald-200 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100/50 transition-colors"
                  >
                    <Eye className="w-4 h-4" /> Preview in Browser
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        <ToolSEOSection
          toolName="Alternate & Mix PDF"
          headline="Duplex Scan Interleave Merger"
          description="Mix pages from two separate PDF documents by alternating between them. The ultimate tool for assembling double-sided scans from single-pass scanners."
          faqs={[
            {
              q: 'Why does my scanner produce reverse pages for the back side?',
              a: 'When you take a stack of papers from an automatic document feeder and flip it over to scan the back, the last page is scanned first. Checking "Reverse Document 2" automatically restores the correct chronological order.',
            },
            {
              q: 'What if Document 1 has more pages than Document 2?',
              a: 'Our interleaver automatically appends any remaining trailing pages to the end so nothing is cut off.',
            },
          ]}
        />
      </div>
    </div>
  );
}
