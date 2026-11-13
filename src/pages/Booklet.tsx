import { useState } from 'react';
import { BookOpen, Download, Loader2, CheckCircle2, ExternalLink, Eye, FileText, Sparkles, Scissors, Info } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { motion, useReducedMotion } from 'motion/react';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';

interface SheetPlan {
  sheetNumber: number;
  frontLeft: number; // 1-based, or -1 for blank
  frontRight: number;
  backLeft: number;
  backRight: number;
}

export default function Booklet() {
  useSEO(
    'PDF to Booklet Converter Online Free — Saddle Stitch Imposition | PDF Media Suite',
    'Free online tool to convert PDF documents into printable 2-up booklet spreads for duplex saddle-stitch printing. Visual sheet layout preview & fold line guide.'
  );

  usePageSEO(
    'PDF to Booklet Converter & Imposition Maker',
    'Convert PDF pages into foldable booklet spreads for two-sided duplex printing. Visual sheet preview with front/back pairings and fold guideline.'
  );

  const [file, setFile] = useState<File | null>(null);
  const prefersReduced = useReducedMotion();
  const [pageCount, setPageCount] = useState(0);
  const [bindingMode, setBindingMode] = useState<'saddle' | 'readerSpreads'>('saddle');
  const [addFoldGuide, setAddFoldGuide] = useState(true);

  const [busy, setBusy] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  useAutoRevokeUrl(resultUrl);

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    const selected = files[0];
    setFile(selected);
    setResultUrl(null);
    try {
      const buf = await selected.arrayBuffer();
      const pdf = await PDFDocument.load(buf, { ignoreEncryption: true });
      setPageCount(pdf.getPageCount());
    } catch {
      setPageCount(0);
    }
  };

  // Generate the sheet plans for Saddle-Stitch
  const getSheetPlans = (): SheetPlan[] => {
    if (pageCount === 0) return [];

    const padded = Math.ceil(pageCount / 4) * 4;
    const sheets: SheetPlan[] = [];

    let lo = 1;
    let hi = padded;
    let sheetNum = 1;

    while (lo < hi) {
      sheets.push({
        sheetNumber: sheetNum,
        frontLeft: hi <= pageCount ? hi : -1,
        frontRight: lo <= pageCount ? lo : -1,
        backLeft: lo + 1 <= pageCount ? lo + 1 : -1,
        backRight: hi - 1 <= pageCount ? hi - 1 : -1,
      });
      lo += 2;
      hi -= 2;
      sheetNum++;
    }

    return sheets;
  };

  const createBooklet = async () => {
    if (!file) return;
    setBusy(true);
    setProgressMsg('Calculating imposition spreads...');

    try {
      const buf = await file.arrayBuffer();
      const src = await PDFDocument.load(buf, { ignoreEncryption: true });
      const total = src.getPageCount();

      const booklet = await PDFDocument.create();
      const firstPage = src.getPages()[0];
      const { width: pw, height: ph } = firstPage.getSize();
      const sheetW = pw * 2;
      const sheetH = ph;

      if (bindingMode === 'saddle') {
        const padded = Math.ceil(total / 4) * 4;
        const sheets: [number, number, number, number][] = [];
        let lo = 0, hi = padded - 1;
        while (lo < hi) {
          sheets.push([hi, lo, lo + 1, hi - 1]);
          lo += 2; hi -= 2;
        }

        for (let i = 0; i < sheets.length; i++) {
          setProgressMsg(`Assembling sheet ${i + 1} of ${sheets.length}...`);
          const [frontL, frontR, backL, backR] = sheets[i];

          // Front side
          const fPage = booklet.addPage([sheetW, sheetH]);
          for (const [slot, idx] of [[0, frontL], [1, frontR]] as [number, number][]) {
            if (idx >= 0 && idx < total) {
              const [copied] = await booklet.copyPages(src, [idx]);
              const embed = await booklet.embedPage(copied);
              fPage.drawPage(embed, { x: slot * pw, y: 0, width: pw, height: ph });
            }
          }

          // Back side
          const bPage = booklet.addPage([sheetW, sheetH]);
          for (const [slot, idx] of [[0, backL], [1, backR]] as [number, number][]) {
            if (idx >= 0 && idx < total) {
              const [copied] = await booklet.copyPages(src, [idx]);
              const embed = await booklet.embedPage(copied);
              bPage.drawPage(embed, { x: slot * pw, y: 0, width: pw, height: ph });
            }
          }
        }
      } else {
        // Reader Spreads (Two-up sequential)
        const totalSheets = Math.ceil(total / 2);
        for (let s = 0; s < totalSheets; s++) {
          setProgressMsg(`Arranging spread ${s + 1} of ${totalSheets}...`);
          const idxL = s * 2;
          const idxR = s * 2 + 1;

          const spreadPage = booklet.addPage([sheetW, sheetH]);
          if (idxL < total) {
            const [copied] = await booklet.copyPages(src, [idxL]);
            const embed = await booklet.embedPage(copied);
            spreadPage.drawPage(embed, { x: 0, y: 0, width: pw, height: ph });
          }
          if (idxR < total) {
            const [copied] = await booklet.copyPages(src, [idxR]);
            const embed = await booklet.embedPage(copied);
            spreadPage.drawPage(embed, { x: pw, y: 0, width: pw, height: ph });
          }
        }
      }

      setProgressMsg('Finalizing booklet file...');
      const bytes = await booklet.save();
      const blob = new Blob([toArrayBufferBytes(bytes)], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      console.error('Booklet generation failed:', e);
      alert(e?.message || 'Failed to create booklet.');
    } finally {
      setBusy(false);
      setProgressMsg('');
    }
  };

  const resetAll = () => {
    setFile(null);
    setResultUrl(null);
    setPageCount(0);
  };

  const sheetPlans = getSheetPlans();
  const sheetsNeeded = Math.ceil(pageCount / 4);
  const blankPaddingCount = (Math.ceil(pageCount / 4) * 4) - pageCount;

  return (
    <ToolWorkspaceShell
      title="Convert PDF to Booklet Spreads"
      subtitle="Automatically re-order and pair pages into 2-up spreads so you can fold and staple a real booklet directly from standard double-sided home/office printers."
      categoryLabel="Print Imposition & Booklet Creator"
      icon={BookOpen}
      microVariant="split"
      tone="emerald"
    >
      <div className="flex flex-col items-center justify-center max-w-6xl mx-auto w-full">

      <PearlStageSwitch stageKey={!file ? 'upload' : !resultUrl ? 'configure' : 'done'} className="w-full flex flex-col items-center">
        {!file ? (
          <div className="w-full max-w-2xl pms-glass-panel rounded-3xl p-4 sm:p-6">
            <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF to Convert to Booklet" />
          </div>
        ) : !resultUrl ? (
          <div className="w-full relative overflow-hidden pms-glass-panel rounded-3xl p-6 md:p-8 space-y-8">
            <PearlScanOverlay active={busy} label={progressMsg || 'Imposing booklet spreads…'} />

            {/* Top Document Summary */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)]">
              <div className="flex items-center gap-4 min-w-0 w-full sm:w-auto">
                <div
                  className="w-12 h-12 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center shrink-0 shadow-xs"
                  style={{ backgroundColor: 'var(--pms-soft-mint)' }}
                >
                  <FileText className="w-6 h-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{file.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    <AnimatedNumber value={pageCount} /> original pages • Prints on{' '}
                    <strong>
                      <AnimatedNumber value={sheetsNeeded} /> physical sheets
                    </strong>{' '}
                    (Duplex)
                  </p>
                </div>
              </div>

              {/* Imposition Mode Tabs */}
              <div className="flex items-center gap-1.5 p-1 bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] rounded-xl text-xs font-bold w-full sm:w-auto justify-center">
                {[
                  { id: 'saddle' as const, label: 'Saddle Stitch (Fold in Center)' },
                  { id: 'readerSpreads' as const, label: '2-Up Sequential Spread' },
                ].map((tab) => {
                  const active = bindingMode === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setBindingMode(tab.id)}
                      className={`relative px-3.5 py-2 rounded-lg transition-colors ${
                        active
                          ? 'text-emerald-900 dark:text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="booklet-mode-pill"
                          transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
                          className="absolute inset-0 rounded-lg border border-emerald-500/40 -z-0"
                          style={{ backgroundColor: 'var(--pms-soft-mint)' }}
                        />
                      )}
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Padding explanation */}
            {bindingMode === 'saddle' && blankPaddingCount > 0 && (
              <div
                className="p-4 border border-emerald-300/60 dark:border-emerald-800/60 rounded-2xl flex items-start gap-3 text-xs text-emerald-950 dark:text-emerald-200"
                style={{ backgroundColor: 'var(--pms-soft-mint)' }}
              >
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <strong>Automatic 4-Page Multiple Adjustment:</strong> A folded booklet requires total pages to be a multiple of 4. We will automatically add {blankPaddingCount} clean blank page(s) at the back cover to ensure perfect folding symmetry.
                </div>
              </div>
            )}

            {/* Visual Sheet Imposition Layout Preview */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                  <span>
                    Physical Sheet Layout Schedule (<AnimatedNumber value={sheetsNeeded} /> Physical Sheets)
                  </span>
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Front & Back printing spread pairing
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[380px] overflow-y-auto p-4 bg-white/60 dark:bg-slate-950/60 rounded-2xl border border-[var(--pms-border)]">
                {sheetPlans.map((plan) => (
                  <div
                    key={plan.sheetNumber}
                    className="bg-white/75 dark:bg-slate-900/75 rounded-2xl p-4 border border-[var(--pms-border)] shadow-xs space-y-3"
                  >
                    <div className="flex items-center justify-between text-xs border-b border-[var(--pms-border)] pb-2">
                      <span className="font-bold text-emerald-700 dark:text-emerald-400">Sheet #{plan.sheetNumber}</span>
                      <span className="text-slate-400 text-[11px]">Duplex Paper</span>
                    </div>

                    {/* Front Spread */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Front Side (Outside)
                      </span>
                      <div className="flex items-center rounded-xl border border-dashed border-emerald-300 dark:border-emerald-800 bg-white p-2 text-center text-xs font-mono">
                        <div className="flex-1 font-bold text-slate-800">
                          {plan.frontLeft !== -1 ? `Page ${plan.frontLeft}` : '[Blank]'}
                        </div>
                        <div className="w-px h-6 bg-emerald-300 mx-2 relative">
                          <Scissors className="w-2.5 h-2.5 text-emerald-600 absolute -top-1 -left-1 opacity-80" />
                        </div>
                        <div className="flex-1 font-bold text-slate-800">
                          {plan.frontRight !== -1 ? `Page ${plan.frontRight}` : '[Blank]'}
                        </div>
                      </div>
                    </div>

                    {/* Back Spread */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Back Side (Inside)
                      </span>
                      <div className="flex items-center rounded-xl border border-dashed border-slate-300 bg-white p-2 text-center text-xs font-mono">
                        <div className="flex-1 font-bold text-slate-800">
                          {plan.backLeft !== -1 ? `Page ${plan.backLeft}` : '[Blank]'}
                        </div>
                        <div className="w-px h-6 bg-slate-300 mx-2" />
                        <div className="flex-1 font-bold text-slate-800">
                          {plan.backRight !== -1 ? `Page ${plan.backRight}` : '[Blank]'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Footer */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <motion.button
                type="button"
                whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                onClick={createBooklet}
                disabled={busy}
                className="pms-btn-primary flex-1 py-4 font-bold rounded-2xl shadow-md disabled:opacity-50 flex items-center justify-center gap-2 text-base"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {progressMsg || 'Imposing booklet...'}
                  </>
                ) : (
                  <>
                    <BookOpen className="w-5 h-5" />
                    Generate Printable Booklet PDF
                  </>
                )}
              </motion.button>
              <button
                type="button"
                onClick={resetAll}
                disabled={busy}
                className="px-6 py-4 bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-2xl transition-all text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          /* Success Screen with Live Preview */
          <div className="w-full max-w-4xl pms-glass-panel rounded-3xl p-6 sm:p-8 text-center space-y-6">
            <div
              className="p-6 sm:p-8 rounded-2xl border border-emerald-300/60 dark:border-emerald-800/60"
              style={{ backgroundColor: 'var(--pms-soft-mint)' }}
            >
              <div className="w-16 h-16 bg-white/90 dark:bg-slate-900/90 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 shadow-xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white mb-2">
                Booklet Created Successfully!
              </h3>
              <p className="text-slate-700 dark:text-slate-300 mb-6 text-sm max-w-md mx-auto">
                Your document pages have been mapped into printable 2-up spreads. Simply print double-sided (flip on short edge), fold in half down the center, and staple!
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <motion.a
                  whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                  href={resultUrl}
                  download={`booklet_${file.name}`}
                  className="pms-btn-primary inline-flex items-center justify-center gap-2 px-8 py-3.5 font-bold rounded-2xl shadow-md text-base"
                >
                  <Download className="w-5 h-5" />
                  Download Booklet PDF
                </motion.a>
                <a
                  href={resultUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white/80 dark:bg-slate-900/80 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold rounded-2xl border border-[var(--pms-border)] transition-all text-sm shadow-xs"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open in New Tab
                </a>
                <button
                  type="button"
                  onClick={() => setShowPreview(!showPreview)}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white/80 dark:bg-slate-900/80 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold rounded-2xl border border-[var(--pms-border)] transition-all text-sm shadow-xs"
                >
                  <Eye className="w-4 h-4" />
                  {showPreview ? 'Hide Preview' : 'Show Live Preview'}
                </button>
              </div>

              {showPreview && (
                <div className="mt-6 text-left">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
                    Imposed Booklet PDF Output Preview
                  </p>
                  <div className="w-full h-[550px] rounded-2xl border border-[var(--pms-border)] overflow-hidden bg-white shadow-inner">
                    <iframe
                      src={resultUrl}
                      title="Booklet PDF Preview"
                      className="w-full h-full border-0"
                    />
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={resetAll}
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold"
            >
              ← Convert another document
            </button>
          </div>
        )}
      </PearlStageSwitch>
      </div>
    </ToolWorkspaceShell>
  );
}
