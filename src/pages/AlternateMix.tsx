import { useState, useEffect } from 'react';
import { Download, FileText, CheckCircle2, Eye, Loader2, Trash2, ArrowRightLeft, Shuffle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { toArrayBufferBytes } from '../lib/blobUrl';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

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
  const prefersReduced = useReducedMotion();

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
      const blob = new Blob([toArrayBufferBytes(outBytes)], { type: 'application/pdf' });
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
    <ToolWorkspaceShell
      title="Alternate & Mix PDF"
      subtitle="Combine two PDF documents by alternating between their pages. Perfect for merging odd and even scanned pages from duplex feeder scans."
      categoryLabel="Duplex Scanner Interleave Merger"
      icon={Shuffle}
      microVariant="merge"
      tone="emerald"
    >

        {/* Upload Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Document 1 (Odd Pages) */}
          <div className="pms-glass-panel rounded-3xl p-6 flex flex-col justify-between relative overflow-hidden">
            <PearlScanOverlay active={loadingDoc === 'doc1'} label="Loading Document 1 pages..." />
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider">
                  Document 1 (e.g. Front / Odd Pages: 1, 3, 5...)
                </span>
                {doc1 && (
                  <button
                    type="button"
                    onClick={() => setDoc1(null)}
                    className="text-xs text-rose-500 hover:text-rose-600 flex items-center gap-1 font-semibold"
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
                <div className="p-4 rounded-2xl bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)]">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'var(--pms-soft-mint)', color: 'var(--pms-ink)' }}
                    >
                      <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="overflow-hidden">
                      <p className="font-bold text-[var(--pms-ink)] text-sm truncate">{doc1.file.name}</p>
                      <p className="text-xs text-[var(--pms-muted)]">
                        <AnimatedNumber value={doc1.pageCount} /> pages • {(doc1.file.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  {doc1.thumbs.length > 0 && (
                    <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                      {doc1.thumbs.slice(0, 5).map((t, i) => (
                        <div key={i} className="relative shrink-0 w-12 h-16 border border-[var(--pms-border)] rounded-lg bg-white overflow-hidden shadow-xs">
                          <img src={t} alt="" className="w-full h-full object-cover" />
                          <span className="absolute bottom-0 right-0 bg-black/75 text-[9px] text-white px-1 font-mono">
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
          <div className="pms-glass-panel rounded-3xl p-6 flex flex-col justify-between relative overflow-hidden">
            <PearlScanOverlay active={loadingDoc === 'doc2'} label="Loading Document 2 pages..." />
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--pms-blue)' }}>
                  Document 2 (e.g. Back / Even Pages: 2, 4, 6...)
                </span>
                {doc2 && (
                  <button
                    type="button"
                    onClick={() => setDoc2(null)}
                    className="text-xs text-rose-500 hover:text-rose-600 flex items-center gap-1 font-semibold"
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
                <div className="p-4 rounded-2xl bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)]">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'var(--pms-soft-blue)', color: 'var(--pms-blue)' }}
                    >
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="overflow-hidden">
                      <p className="font-bold text-[var(--pms-ink)] text-sm truncate">{doc2.file.name}</p>
                      <p className="text-xs text-[var(--pms-muted)]">
                        <AnimatedNumber value={doc2.pageCount} /> pages • {(doc2.file.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  {doc2.thumbs.length > 0 && (
                    <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                      {doc2.thumbs.slice(0, 5).map((t, i) => (
                        <div key={i} className="relative shrink-0 w-12 h-16 border border-[var(--pms-border)] rounded-lg bg-white overflow-hidden shadow-xs">
                          <img src={t} alt="" className="w-full h-full object-cover" />
                          <span className="absolute bottom-0 right-0 bg-black/75 text-[9px] text-white px-1 font-mono">
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
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.25 }}
            className="space-y-6"
          >
            <div className="pms-glass-panel rounded-3xl p-6 relative overflow-hidden">
              <PearlScanOverlay active={busy} label="Interleaving odd and even pages..." />

              <h3 className="text-base font-bold text-[var(--pms-ink)] mb-4 flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Interleave Settings
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* 1. Reverse Doc 2 */}
                <div className="flex items-start gap-3 p-4 rounded-2xl border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75">
                  <input
                    type="checkbox"
                    id="revDoc2"
                    checked={reverseDoc2}
                    onChange={(e) => setReverseDoc2(e.target.checked)}
                    className="w-5 h-5 rounded accent-[var(--pms-blue)] mt-0.5 cursor-pointer"
                  />
                  <div>
                    <label htmlFor="revDoc2" className="text-sm font-bold text-[var(--pms-ink)] cursor-pointer">
                      Reverse Document 2
                    </label>
                    <p className="text-xs text-[var(--pms-muted)] mt-0.5">
                      Recommended for ADF duplex scans where backside pages are scanned back-to-front (e.g. 8, 6, 4, 2).
                    </p>
                  </div>
                </div>

                {/* 2. Step Size */}
                <div className="p-4 rounded-2xl border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75">
                  <label className="text-xs font-bold text-[var(--pms-muted)] uppercase tracking-wider block mb-2">
                    Step Frequency
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { val: 1, label: '1 by 1 (Standard)' },
                      { val: 2, label: '2 by 2 Pages' },
                    ].map((opt) => {
                      const active = stepSize === opt.val;
                      return (
                        <button
                          key={opt.val}
                          type="button"
                          onClick={() => setStepSize(opt.val)}
                          style={{
                            borderColor: active ? 'var(--pms-blue)' : 'var(--pms-border)',
                          }}
                          className={`relative py-2 px-3 rounded-xl text-xs font-bold border transition-colors ${
                            active
                              ? 'text-[var(--pms-ink)]'
                              : 'bg-white/75 dark:bg-slate-900/75 text-[var(--pms-muted)] hover:text-[var(--pms-ink)]'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="altmix-step-pill"
                              transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
                              className="absolute inset-0 rounded-[11px]"
                              style={{ backgroundColor: 'var(--pms-soft-blue)' }}
                            />
                          )}
                          <span className="relative z-10">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-[var(--pms-muted)] mt-1.5">1 by 1 alternates single pages from each file</p>
                </div>

                {/* 3. First Document */}
                <div className="p-4 rounded-2xl border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75">
                  <label className="text-xs font-bold text-[var(--pms-muted)] uppercase tracking-wider block mb-2">
                    Start Merge With
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { val: 1, label: 'Document 1 First' },
                      { val: 2, label: 'Document 2 First' },
                    ] as const).map((opt) => {
                      const active = startWithDoc === opt.val;
                      return (
                        <button
                          key={opt.val}
                          type="button"
                          onClick={() => setStartWithDoc(opt.val)}
                          style={{
                            borderColor: active ? 'var(--pms-violet)' : 'var(--pms-border)',
                          }}
                          className={`relative py-2 px-3 rounded-xl text-xs font-bold border transition-colors ${
                            active
                              ? 'text-[var(--pms-ink)]'
                              : 'bg-white/75 dark:bg-slate-900/75 text-[var(--pms-muted)] hover:text-[var(--pms-ink)]'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="altmix-start-pill"
                              transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
                              className="absolute inset-0 rounded-[11px]"
                              style={{ backgroundColor: 'var(--pms-soft-lavender)' }}
                            />
                          )}
                          <span className="relative z-10">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-[var(--pms-muted)] mt-1.5">Page 1 will come from selected document</p>
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-6 pt-6 border-t border-[var(--pms-border)] flex justify-end">
                <motion.button
                  type="button"
                  whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                  whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                  onClick={processMix}
                  disabled={busy}
                  className="pms-btn-primary inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold disabled:opacity-50"
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
                </motion.button>
              </div>
            </div>

            {/* Visual Interleaved Sequence Preview */}
            <div className="pms-glass-panel rounded-3xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <h4 className="text-sm font-bold text-[var(--pms-ink)]">
                    Interleaved Sequence Order Preview (Total <AnimatedNumber value={doc1.pageCount + doc2.pageCount} /> Pages)
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
                    className={`relative rounded-xl border-2 p-1 text-center shadow-xs transition-all ${
                      item.docIndex === 1
                        ? 'border-teal-500 bg-teal-50/40 dark:bg-teal-950/20'
                        : 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20'
                    }`}
                  >
                    <div className="aspect-[3/4] bg-white rounded-lg overflow-hidden mb-1 border border-[var(--pms-border)]">
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
                    <p className="text-[9px] text-[var(--pms-muted)] truncate mt-0.5">
                      D{item.docIndex} p.{item.sourcePageNum}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Success Box */}
            <AnimatePresence>
              {resultUrl && (
                <motion.div
                  initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReduced ? undefined : { opacity: 0, y: -6 }}
                  transition={{ duration: prefersReduced ? 0 : 0.25 }}
                  className="p-6 rounded-3xl border border-[var(--pms-border)] text-center"
                  style={{ backgroundColor: 'var(--pms-soft-mint)' }}
                >
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
                  <h3 className="text-xl font-bold text-[var(--pms-ink)] mb-1">
                    Alternate & Mix Complete!
                  </h3>
                  <p className="text-sm text-[var(--pms-muted)] mb-4">
                    Successfully merged <AnimatedNumber value={doc1.pageCount + doc2.pageCount} /> pages into a perfectly interleaved document.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <motion.a
                      whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                      whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                      href={resultUrl}
                      download={resultName}
                      className="pms-btn-primary inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold"
                    >
                      <Download className="w-4 h-4" /> Download Merged PDF
                    </motion.a>
                    <a
                      href={resultUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-[var(--pms-ink)] bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] hover:bg-white dark:hover:bg-slate-900 transition-colors"
                    >
                      <Eye className="w-4 h-4" /> Preview in Browser
                    </a>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
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
    </ToolWorkspaceShell>
  );
}
