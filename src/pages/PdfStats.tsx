import React, { useState } from 'react';
import { BarChart3, FileText, Clock, Type, Hash, Loader2, Download, Copy, Check, Mic, BookOpen, Layers, Sparkles } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

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

  const handleDrop = (files: File[]) => {
    if (files[0]) {
      setFile(files[0]);
      setStats(null);
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

        // Sentences count based on punctuation
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
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${file.name}_page_stats.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredPages = stats
    ? stats.perPageStats.filter((p) =>
        searchPage ? String(p.pageNumber).includes(searchPage) : true
      )
    : [];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-xs font-bold tracking-widest uppercase mb-3 border border-blue-200 dark:border-blue-800">
          <BarChart3 className="w-3.5 h-3.5" /> Document Analytics & Metrics
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-3">
          PDF Word Counter & Deep Statistics
        </h1>
        <p className="text-base md:text-lg text-gray-600 dark:text-slate-400 max-w-2xl mx-auto">
          Accurate word and character counters, readability score, speaking duration estimate, and a complete page-by-page breakdown table.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl">
          <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF to Analyze Stats" />
        </div>
      ) : !stats ? (
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-gray-200 dark:border-slate-800 p-8 text-center space-y-6">
          <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div className="text-left flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{file.name}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>

          <button
            onClick={analyze}
            disabled={busy}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 text-base"
          >
            {busy ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Analyzing Document Structure & Words...
              </>
            ) : (
              <>
                <BarChart3 className="w-5 h-5" />
                Analyze Document Stats Now
              </>
            )}
          </button>

          <button
            onClick={() => { setFile(null); setStats(null); }}
            className="text-xs text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white font-medium"
          >
            Cancel
          </button>
        </div>
      ) : (
        /* Results View */
        <div className="w-full space-y-6">
          {/* Top Action Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-gray-900 dark:text-white truncate max-w-sm">{file.name}</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">{stats.fileSizeMB} MB • {stats.pages} Total Pages</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copySummary}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 font-semibold rounded-xl text-xs transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy Summary'}
              </button>
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs transition-colors shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV Table
              </button>
              <button
                type="button"
                onClick={() => { setFile(null); setStats(null); }}
                className="px-3.5 py-2 text-xs text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white font-semibold"
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
                value: stats.words.toLocaleString(),
                sub: `Avg ${stats.avgWordsPerPage} words/page`,
                icon: Type,
                color: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400',
              },
              {
                label: 'Total Characters',
                value: stats.characters.toLocaleString(),
                sub: `${stats.charactersNoSpaces.toLocaleString()} without spaces`,
                icon: Hash,
                color: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400',
              },
              {
                label: 'Silent Reading Time',
                value: `~${stats.readingTimeMin} min`,
                sub: 'Based on 230 WPM average reading',
                icon: BookOpen,
                color: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
              },
              {
                label: 'Speaking / Presentation',
                value: `~${stats.speakingTimeMin} min`,
                sub: 'Based on 130 WPM speech pace',
                icon: Mic,
                color: 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400',
              },
            ].map((s) => (
              <div
                key={s.label}
                className="p-5 bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-xs flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">{s.label}</span>
                  <div className={`w-8 h-8 rounded-lg ${s.color} flex items-center justify-center`}>
                    <s.icon className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <p className="text-2xl md:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">{s.value}</p>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">{s.sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Readability & Layout Insights */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-500" /> Readability & Complexity
              </h3>
              <div className="space-y-3">
                <div className="p-4 bg-purple-50/50 dark:bg-purple-950/20 rounded-2xl border border-purple-100 dark:border-purple-900/40">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-purple-900 dark:text-purple-300">Flesch Reading Ease</span>
                    <span className="text-base font-extrabold text-purple-700 dark:text-purple-400">{stats.fleschScore} / 100</span>
                  </div>
                  <p className="text-xs font-semibold text-purple-800 dark:text-purple-200">{stats.readabilityLevel}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-3 bg-gray-50 dark:bg-slate-800/60 rounded-xl border border-gray-100 dark:border-slate-800">
                    <span className="text-gray-500 dark:text-slate-400 block">Sentences:</span>
                    <span className="font-bold text-gray-900 dark:text-white text-sm">{stats.sentences.toLocaleString()}</span>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-slate-800/60 rounded-xl border border-gray-100 dark:border-slate-800">
                    <span className="text-gray-500 dark:text-slate-400 block">Avg Sentence Length:</span>
                    <span className="font-bold text-gray-900 dark:text-white text-sm">{stats.avgWordsPerSentence} words</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-500" /> Document Dimensions
              </h3>
              <div className="space-y-3">
                <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 rounded-2xl border border-blue-100 dark:border-blue-900/40">
                  <span className="text-xs font-bold text-blue-900 dark:text-blue-300 block mb-1">Detected Page Dimensions:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {stats.pageSizes.map((size, idx) => (
                      <span key={idx} className="px-2.5 py-1 bg-white dark:bg-slate-800 rounded-lg text-xs font-mono font-bold text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        {size}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-3 bg-gray-50 dark:bg-slate-800/60 rounded-xl border border-gray-100 dark:border-slate-800">
                    <span className="text-gray-500 dark:text-slate-400 block">Total Sheets:</span>
                    <span className="font-bold text-gray-900 dark:text-white text-sm">{stats.pages} pages</span>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-slate-800/60 rounded-xl border border-gray-100 dark:border-slate-800">
                    <span className="text-gray-500 dark:text-slate-400 block">File Weight:</span>
                    <span className="font-bold text-gray-900 dark:text-white text-sm">{stats.fileSizeMB} MB</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Page-by-Page Breakdown Table */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-gray-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-base text-gray-900 dark:text-white">Page-by-Page Breakdown</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">Detailed text volume for every single sheet</p>
              </div>
              <input
                type="text"
                placeholder="Jump to page #..."
                value={searchPage}
                onChange={(e) => setSearchPage(e.target.value)}
                className="w-full sm:w-44 px-3 py-1.5 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-xl font-mono focus:outline-hidden focus:border-blue-500"
              />
            </div>

            <div className="max-h-[380px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 dark:bg-slate-800/80 sticky top-0 text-gray-500 dark:text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-gray-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Page</th>
                    <th className="py-3 px-4">Word Count</th>
                    <th className="py-3 px-4">Characters</th>
                    <th className="py-3 px-4">Reading Time</th>
                    <th className="py-3 px-4">Dimensions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800 text-gray-700 dark:text-slate-300 font-medium">
                  {filteredPages.map((pg) => (
                    <tr key={pg.pageNumber} className="hover:bg-gray-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                        Page {pg.pageNumber}
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-gray-900 dark:text-white">
                        {pg.words.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 font-mono">{pg.characters.toLocaleString()}</td>
                      <td className="py-2.5 px-4 text-gray-500">~{pg.readingSecs}s</td>
                      <td className="py-2.5 px-4 font-mono text-gray-400 text-[11px]">{pg.dimension}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
