import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { FileText, Hash, Loader2, UploadCloud } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

interface PageInfo {
  name: string;
  pages: number;
  size: string;
  errorReason?: string;
}

export default function PageCounter() {
  useSEO('Page Counter Online Free | PDF Media Suite', 'Free online Page Counter tool. No signup or installation required.');

  usePageSEO('PDF Page Counter', 'Count total pages across multiple PDF files instantly. Free online batch PDF page counter.');
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<PageInfo[]>([]);
  const [busy, setBusy] = useState(false);

  const prefersReduced = useReducedMotion();

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setResults([]);
    }
  };

  const count = async () => {
    if (files.length === 0) return;
    setBusy(true);
    try {
      const infos: PageInfo[] = [];
      for (const f of files) {
        try {
          const buf = await f.arrayBuffer();
          const pdf = await PDFDocument.load(buf, { ignoreEncryption: true });
          infos.push({
            name: f.name,
            pages: pdf.getPageCount(),
            size: (f.size / 1024 / 1024).toFixed(2) + ' MB',
          });
        } catch (err: any) {
          const isEncrypted = err?.message?.toLowerCase().includes('encrypt') || err?.name === 'EncryptedPDFError';
          infos.push({
            name: f.name,
            pages: -1,
            size: (f.size / 1024 / 1024).toFixed(2) + ' MB',
            errorReason: isEncrypted ? 'Encrypted (Locked)' : 'Corrupt / Unsupported',
          });
        }
      }
      setResults(infos);
    } finally {
      setBusy(false);
    }
  };

  const totalPages = results.reduce((s, r) => s + (r.pages > 0 ? r.pages : 0), 0);
  const stageKey = files.length === 0 ? 'upload' : results.length > 0 ? 'results' : 'ready';

  return (
    <ToolWorkspaceShell
      title="Multi-PDF Page Counter"
      subtitle="Batch upload PDFs to calculate total page count and per-file page breakdown instantly."
      categoryLabel="Batch Document Metrics"
      icon={Hash}
      microVariant="generic"
      tone="violet"
      trustNote="100% browser-only batch inspection · Encrypted files safely flagged"
    >
      <PearlStageSwitch stageKey={stageKey}>
        {files.length === 0 ? (
          <div className="max-w-3xl mx-auto">
            <label
              className="w-full p-10 border-2 border-dashed rounded-[1.75rem] cursor-pointer transition-all duration-200 flex flex-col items-center justify-center text-center hover:border-violet-400/80"
              style={{
                backgroundColor: 'var(--pms-white)',
                borderColor: 'var(--pms-border-strong)',
                boxShadow: 'var(--pms-shadow-card)',
              }}
            >
              <motion.div
                animate={prefersReduced ? undefined : { y: [0, -3, 0] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center mb-4 bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)]"
              >
                <UploadCloud className="w-9 h-9" />
              </motion.div>
              <span className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Select PDF Files</span>
              <span className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                Multiple PDFs supported for instant batch counting
              </span>
              <span className="mt-6 inline-flex items-center justify-center px-7 py-3 text-sm font-bold rounded-full pms-btn-primary">
                Choose PDF Files
              </span>
              <input type="file" multiple accept=".pdf" className="hidden" onChange={handleFiles} />
            </label>
          </div>
        ) : results.length > 0 ? (
          <div className="w-full max-w-3xl mx-auto space-y-6">
            {/* Summary Metric Tiles */}
            <div className="grid grid-cols-2 gap-4">
              <div className="pms-glass-panel p-6 rounded-3xl text-center">
                <span className="inline-block px-3 py-0.5 rounded-full text-[11px] font-bold uppercase bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] mb-2">
                  Total Pages
                </span>
                <p className="text-4xl font-extrabold text-slate-900 dark:text-white">
                  <AnimatedNumber value={totalPages} />
                </p>
              </div>
              <div className="pms-glass-panel p-6 rounded-3xl text-center">
                <span className="inline-block px-3 py-0.5 rounded-full text-[11px] font-bold uppercase bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] mb-2">
                  Files Inspected
                </span>
                <p className="text-4xl font-extrabold text-slate-900 dark:text-white">
                  <AnimatedNumber value={results.length} />
                </p>
              </div>
            </div>

            {/* Results Table */}
            <div className="pms-glass-panel rounded-3xl p-4 sm:p-5">
              <div className="bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-100/90 dark:bg-slate-800/90 text-left border-b border-[var(--pms-border)]">
                      <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-300">File</th>
                      <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-300 text-right">Pages</th>
                      <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-300 text-right">Size</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--pms-border)]">
                    <AnimatePresence initial={false}>
                      {results.map((r, i) => (
                        <motion.tr
                          key={`${r.name}-${i}`}
                          initial={prefersReduced ? false : { opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
                          className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="px-4 py-3 text-slate-900 dark:text-white truncate max-w-[280px]">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <FileText className="w-4 h-4 text-[var(--pms-violet)] shrink-0" />
                              <span className="truncate font-medium">{r.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">
                            {r.pages >= 0 ? (
                              <span className="px-2.5 py-0.5 rounded-full bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] text-xs font-extrabold">
                                <AnimatedNumber value={r.pages} />
                              </span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400 font-semibold text-xs">
                                {r.errorReason || 'Error'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400 font-mono text-xs">{r.size}</td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>

            <button
              onClick={() => { setFiles([]); setResults([]); }}
              className="w-full py-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl font-bold text-sm transition-colors cursor-pointer"
            >
              Count more files
            </button>
          </div>
        ) : (
          <div className="relative w-full max-w-2xl mx-auto pms-glass-panel rounded-3xl p-8 space-y-6 text-center overflow-hidden">
            <PearlScanOverlay active={busy} label="Counting pages across selected PDFs…" />

            <div className="p-5 rounded-2xl bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] flex items-center justify-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <p className="text-slate-800 dark:text-slate-100 font-bold text-base">
                <AnimatedNumber value={files.length} /> PDF{files.length === 1 ? '' : 's'} selected
              </p>
            </div>

            <motion.button
              whileHover={prefersReduced || busy ? undefined : { scale: 1.01 }}
              whileTap={prefersReduced || busy ? undefined : { scale: 0.985 }}
              onClick={count}
              disabled={busy}
              className="w-full pms-btn-primary py-4 font-bold rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2 text-base cursor-pointer"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Hash className="w-5 h-5" />}
              {busy ? 'Counting…' : 'Count Pages'}
            </motion.button>

            <button
              onClick={() => setFiles([])}
              disabled={busy}
              className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold text-sm cursor-pointer disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
