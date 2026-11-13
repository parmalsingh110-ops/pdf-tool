import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  BarChart3,
  FileText,
  Type,
  Hash,
  Loader2,
  Download,
  Copy,
  Check,
  Mic,
  BookOpen,
  Layers,
  Sparkles,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { triggerBlobDownload } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

interface PageStat {
  pageNumber: number;
  words: number;
  characters: number;
  readingSecs: number;
  dimension: string;
}

interface PdfStatsResult {
  pages: number;
  words: number;
  characters: number;
  charactersNoSpaces: number;
  sentences: number;
  avgWordsPerPage: number;
  avgWordsPerSentence: number;
  readingTimeMin: number;
  speakingTimeMin: number;
  fleschScore: number;
  readabilityLevel: string;
  fileSizeMB: string;
  pageSizes: string[];
  perPageStats: PageStat[];
}

export default function PdfStats() {
  useSEO(
    'PDF Word Counter & Deep Statistics Online Free | PDF Media Suite',
    'Free online PDF document stats analyzer. Instant word count, character count, per-page breakdown table, readability index, and reading time calculation.'
  );

  usePageSEO(
    'PDF Word Counter, Readability & Page-by-Page Stats',
    'Comprehensive PDF document analysis — exact word and character counts, per-page statistical breakdown, Flesch reading score, speaking time, and CSV export.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<PdfStatsResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [searchPage, setSearchPage] = useState('');

  const prefersReduced = useReducedMotion();

  const handleDrop = (files: File[]) => {
    if (files[0]) {
      setFile(files[0]);
      setStats(null);
      setSearchPage('');
    }
  };

  const calculateFleschScore = (words: number, sentences: number, syllables: number): number => {
    if (words === 0 || sentences === 0) return 0;
    const score = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
    return Math.max(0, Math.min(100, Math.round(score)));
  };

  const getReadabilityLabel = (score: number): string => {
    if (score >= 80) return 'Easy (Conversational / 6th Grade)';
    if (score >= 60) return 'Standard (Plain English / 8th-9th Grade)';
    if (score >= 45) return 'Moderate (High School / Professional)';
    if (score >= 30) return 'Difficult (College / Academic)';
    return 'Very Difficult (Legal / Technical / Scientific)';
  };

  // Rough syllable counter for English words
  const countSyllables = (text: string): number => {
    const words = text.toLowerCase().match(/[a-z]{2,}/g) || [];
    let count = 0;
    for (const w of words) {
      const syls = w.replace(/(?:[^laeiouy]|ed|es|e)$/, '')
        .replace(/^y/, '')
        .match(/[aeiouy]{1,2}/g);
      count += syls ? syls.length : 1;
    }
    return count;
  };

  const analyze = async () => {
    if (!file) return;
    setBusy(true);

    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;

      let totalWords = 0;
      let totalChars = 0;
      let totalCharsNoSpaces = 0;
      let totalSentences = 0;
      let totalSyllables = 0;

      const pageSizesSet = new Set<string>();
      const perPageList: PageStat[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        const wInch = (vp.width / 72).toFixed(1);
        const hInch = (vp.height / 72).toFixed(1);
        const dimStr = `${wInch}" × ${hInch}"`;
        pageSizesSet.add(dimStr);

        const content = await page.getTextContent();
        const text = content.items.map((item: any) => item.str).join(' ');

        const wordsArr = text.trim().split(/\s+/).filter(Boolean);
        const wordsOnPage = wordsArr.length;
        const charsOnPage = text.length;

        const sents = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length || 1;

        totalWords += wordsOnPage;
        totalChars += charsOnPage;
        totalCharsNoSpaces += text.replace(/\s/g, '').length;
        totalSentences += sents;
        totalSyllables += countSyllables(text);

        perPageList.push({
          pageNumber: i,
          words: wordsOnPage,
          characters: charsOnPage,
          readingSecs: Math.round((wordsOnPage / 230) * 60),
          dimension: dimStr,
        });
      }

      const safeSentences = Math.max(1, totalSentences);
      const flesch = calculateFleschScore(totalWords, safeSentences, totalSyllables);

      setStats({
        pages: pdf.numPages,
        words: totalWords,
        characters: totalChars,
        charactersNoSpaces: totalCharsNoSpaces,
        sentences: totalSentences,
        avgWordsPerPage: Math.round(totalWords / pdf.numPages),
        avgWordsPerSentence: Math.round(totalWords / safeSentences),
        readingTimeMin: Math.max(1, Math.ceil(totalWords / 230)),
        speakingTimeMin: Math.max(1, Math.ceil(totalWords / 130)),
        fleschScore: flesch,
        readabilityLevel: getReadabilityLabel(flesch),
        fileSizeMB: (file.size / 1024 / 1024).toFixed(2),
        pageSizes: Array.from(pageSizesSet),
        perPageStats: perPageList,
      });
    } catch (e: any) {
      console.error('Analysis failed:', e);
      alert(e?.message || 'Failed to analyze document statistics.');
    } finally {
      setBusy(false);
    }
  };

  const copySummary = () => {
    if (!stats || !file) return;
    const summary = `PDF Statistics Report: ${file.name}
Total Pages: ${stats.pages}
Total Words: ${stats.words.toLocaleString()}
Total Characters: ${stats.characters.toLocaleString()} (Without spaces: ${stats.charactersNoSpaces.toLocaleString()})
Silent Reading Time: ~${stats.readingTimeMin} min
Presentation/Speaking Time: ~${stats.speakingTimeMin} min
Readability Level: ${stats.readabilityLevel} (Flesch Score: ${stats.fleschScore}/100)
Average Words Per Page: ${stats.avgWordsPerPage}
File Size: ${stats.fileSizeMB} MB`;

    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportCsv = () => {
    if (!stats || !file) return;
    let csv = 'Page,Words,Characters,Reading Time (seconds),Dimensions\n';
    stats.perPageStats.forEach((p) => {
      csv += `${p.pageNumber},${p.words},${p.characters},${p.readingSecs},"${p.dimension}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    triggerBlobDownload(blob, `${file.name}_page_stats.csv`);
  };

  const filteredPages = stats
    ? stats.perPageStats.filter((p) =>
        searchPage ? String(p.pageNumber).includes(searchPage) : true
      )
    : [];

  const stageKey = !file ? 'upload' : !stats ? 'ready' : 'results';

  return (
    <ToolWorkspaceShell
      title="PDF Word Counter & Deep Statistics"
      subtitle="Accurate word and character counters, readability score, speaking duration estimate, and a complete page-by-page breakdown table."
      categoryLabel="Document Analytics & Metrics"
      icon={BarChart3}
      microVariant="ocr"
      tone="blue"
      trustNote="100% browser-only statistical parsing · Export breakdown to CSV"
    >
      <PearlStageSwitch stageKey={stageKey}>
        {!file ? (
          <div className="w-full max-w-2xl mx-auto">
            <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF to Analyze Stats" />
          </div>
        ) : !stats ? (
          <div className="relative w-full max-w-2xl mx-auto pms-glass-panel rounded-3xl p-8 text-center space-y-6 overflow-hidden">
            <PearlScanOverlay active={busy} label="Counting words, syllables, readability & dimensions…" />

            <div className="flex items-center gap-4 p-4 bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)]">
              <div className="w-12 h-12 bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div className="text-left flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{file.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <AnimatedNumber value={file.size / 1024 / 1024} decimals={2} suffix=" MB" />
                </p>
              </div>
            </div>

            <motion.button
              whileHover={prefersReduced || busy ? undefined : { scale: 1.01 }}
              whileTap={prefersReduced || busy ? undefined : { scale: 0.985 }}
              onClick={analyze}
              disabled={busy}
              className="w-full pms-btn-primary py-4 font-bold rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2 text-base cursor-pointer"
            >
              {busy ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Analyzing Document Structure & Words…
                </>
              ) : (
                <>
                  <BarChart3 className="w-5 h-5" />
                  Analyze Document Stats Now
                </>
              )}
            </motion.button>

            <button
              onClick={() => { setFile(null); setStats(null); }}
              disabled={busy}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold cursor-pointer disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="w-full space-y-6">
            {/* Top Action Bar */}
            <div className="pms-glass-panel flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-3xl">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] rounded-xl flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate max-w-sm">{file.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {stats.fileSizeMB} MB • <AnimatedNumber value={stats.pages} /> Total Pages
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={copySummary}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white/80 dark:bg-slate-900/80 hover:bg-white dark:hover:bg-slate-800 border border-[var(--pms-border)] text-slate-700 dark:text-slate-200 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied!' : 'Copy Summary'}
                </button>
                <motion.button
                  type="button"
                  whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                  whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                  onClick={exportCsv}
                  className="pms-btn-primary inline-flex items-center gap-1.5 px-4 py-2 font-bold rounded-xl text-xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV Table
                </motion.button>
                <button
                  type="button"
                  onClick={() => { setFile(null); setStats(null); }}
                  className="px-3.5 py-2 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white font-semibold cursor-pointer"
                >
                  Analyze Another
                </button>
              </div>
            </div>

            {/* 4 Core Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  label: 'Total Words',
                  num: stats.words,
                  prefix: '',
                  suffix: '',
                  sub: `Avg ${stats.avgWordsPerPage} words/page`,
                  icon: Type,
                  tint: 'bg-[var(--pms-soft-blue)] text-[var(--pms-blue)]',
                },
                {
                  label: 'Total Characters',
                  num: stats.characters,
                  prefix: '',
                  suffix: '',
                  sub: `${stats.charactersNoSpaces.toLocaleString()} without spaces`,
                  icon: Hash,
                  tint: 'bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300',
                },
                {
                  label: 'Silent Reading Time',
                  num: stats.readingTimeMin,
                  prefix: '~',
                  suffix: ' min',
                  sub: 'Based on 230 WPM reading',
                  icon: BookOpen,
                  tint: 'bg-[var(--pms-soft-rose)] text-[var(--pms-rose)]',
                },
                {
                  label: 'Speaking Time',
                  num: stats.speakingTimeMin,
                  prefix: '~',
                  suffix: ' min',
                  sub: 'Based on 130 WPM speech pace',
                  icon: Mic,
                  tint: 'bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)]',
                },
              ].map((s, idx) => (
                <motion.div
                  key={s.label}
                  initial={prefersReduced ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: idx * 0.05 }}
                  className="pms-glass-panel p-5 rounded-3xl flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {s.label}
                    </span>
                    <div className={`w-9 h-9 rounded-xl ${s.tint} flex items-center justify-center`}>
                      <s.icon className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <p className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                      <AnimatedNumber value={s.num} prefix={s.prefix} suffix={s.suffix} />
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{s.sub}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Readability & Layout Insights */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="pms-glass-panel p-6 rounded-3xl space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--pms-violet)]" /> Readability &amp; Complexity
                </h3>
                <div className="space-y-3">
                  <div className="p-4 bg-[var(--pms-soft-lavender)] rounded-2xl border border-[var(--pms-border)]">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Flesch Reading Ease</span>
                      <span className="text-base font-extrabold text-[var(--pms-violet)]">
                        <AnimatedNumber value={stats.fleschScore} suffix=" / 100" />
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/70 dark:bg-slate-900/60 overflow-hidden mb-2">
                      <motion.div
                        initial={prefersReduced ? false : { width: 0 }}
                        animate={{ width: `${stats.fleschScore}%` }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        className="h-full rounded-full bg-gradient-to-r from-rose-500 via-violet-500 to-sky-500"
                      />
                    </div>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{stats.readabilityLevel}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div className="p-3.5 bg-white/75 dark:bg-slate-900/75 rounded-xl border border-[var(--pms-border)]">
                      <span className="text-slate-500 dark:text-slate-400 block">Sentences</span>
                      <span className="font-bold text-slate-900 dark:text-white text-sm">
                        <AnimatedNumber value={stats.sentences} />
                      </span>
                    </div>
                    <div className="p-3.5 bg-white/75 dark:bg-slate-900/75 rounded-xl border border-[var(--pms-border)]">
                      <span className="text-slate-500 dark:text-slate-400 block">Avg Sentence Length</span>
                      <span className="font-bold text-slate-900 dark:text-white text-sm">
                        <AnimatedNumber value={stats.avgWordsPerSentence} suffix=" words" />
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pms-glass-panel p-6 rounded-3xl space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[var(--pms-blue)]" /> Document Dimensions
                </h3>
                <div className="space-y-3">
                  <div className="p-4 bg-[var(--pms-soft-blue)] rounded-2xl border border-[var(--pms-border)]">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-2">
                      Detected Page Dimensions
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {stats.pageSizes.map((size, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 bg-white/90 dark:bg-slate-900/90 rounded-lg text-xs font-mono font-bold text-[var(--pms-blue)] border border-[var(--pms-border)]"
                        >
                          {size}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div className="p-3.5 bg-white/75 dark:bg-slate-900/75 rounded-xl border border-[var(--pms-border)]">
                      <span className="text-slate-500 dark:text-slate-400 block">Total Sheets</span>
                      <span className="font-bold text-slate-900 dark:text-white text-sm">
                        <AnimatedNumber value={stats.pages} suffix=" pages" />
                      </span>
                    </div>
                    <div className="p-3.5 bg-white/75 dark:bg-slate-900/75 rounded-xl border border-[var(--pms-border)]">
                      <span className="text-slate-500 dark:text-slate-400 block">File Weight</span>
                      <span className="font-bold text-slate-900 dark:text-white text-sm">
                        <AnimatedNumber value={Number(stats.fileSizeMB)} decimals={2} suffix=" MB" />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Page-by-Page Breakdown Table */}
            <div className="pms-glass-panel rounded-3xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">Page-by-Page Breakdown</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Detailed text volume for every single sheet</p>
                </div>
                <input
                  type="text"
                  placeholder="Jump to page #..."
                  value={searchPage}
                  onChange={(e) => setSearchPage(e.target.value)}
                  className="w-full sm:w-48 px-3.5 py-2 text-xs bg-white/80 dark:bg-slate-900/80 border border-[var(--pms-border)] rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-sky-400/50 text-slate-900 dark:text-white"
                />
              </div>

              <div className="bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] overflow-hidden">
                <div className="max-h-[380px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100/90 dark:bg-slate-800/90 sticky top-0 text-slate-500 dark:text-slate-300 uppercase font-bold text-[10px] tracking-wider border-b border-[var(--pms-border)]">
                      <tr>
                        <th className="py-3 px-4">Page</th>
                        <th className="py-3 px-4">Word Count</th>
                        <th className="py-3 px-4">Characters</th>
                        <th className="py-3 px-4">Reading Time</th>
                        <th className="py-3 px-4">Dimensions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--pms-border)] text-slate-700 dark:text-slate-300 font-medium">
                      <AnimatePresence initial={false}>
                        {filteredPages.map((pg) => (
                          <motion.tr
                            key={pg.pageNumber}
                            initial={prefersReduced ? false : { opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={prefersReduced ? undefined : { opacity: 0 }}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            <td className="py-2.5 px-4 font-mono font-bold text-[var(--pms-blue)]">
                              Page {pg.pageNumber}
                            </td>
                            <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-white">
                              {pg.words.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-4 font-mono">{pg.characters.toLocaleString()}</td>
                            <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400">~{pg.readingSecs}s</td>
                            <td className="py-2.5 px-4 font-mono text-slate-500 dark:text-slate-400 text-[11px]">{pg.dimension}</td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
