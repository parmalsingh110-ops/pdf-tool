import React, { useState } from 'react';
import { 
  Sparkles, FileText, Download, Copy, Check, Clock,
  BookOpen, Loader2, MessageSquare, Send,
  CheckCircle2, Shield
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { toArrayBufferBytes, triggerBlobDownload } from '../lib/blobUrl';

interface PageText {
  pageNumber: number;
  text: string;
}

interface SummaryResult {
  executiveSummary: string;
  keyPoints: string[];
  stats: {
    totalPages: number;
    totalWords: number;
    readingTimeMin: number;
    sentenceCount: number;
  };
  keyTopics: { word: string; count: number }[];
}

// ─── Zero-API-Key Extractive Summarization Engine ─────────────────────
// Uses Unicode-aware frequency-weighted centroid scoring to identify the most salient sentences
function generateExtractiveSummary(fullText: string, pageCount: number): SummaryResult {
  // Normalize whitespace
  const cleaned = fullText.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return {
      executiveSummary: 'Document contains no extractable text.',
      keyPoints: ['No readable text found in document.'],
      stats: { totalPages: pageCount, totalWords: 0, readingTimeMin: 1, sentenceCount: 0 },
      keyTopics: [],
    };
  }

  // Split into sentences using Unicode punctuation (. ! ? । ॥ and linebreaks)
  const rawSentences = cleaned.split(/(?<=[.!?।॥\n])\s+/u).filter(Boolean);
  const sentences = rawSentences
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 400);

  // Unicode letter tokenization (\p{L} matches Latin, Devanagari, and all international scripts)
  const words = cleaned.toLowerCase().match(/\p{L}{2,}/gu) || [];
  const stopWords = new Set([
    // English Stop Words
    'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'were', 'which',
    'their', 'about', 'there', 'would', 'could', 'should', 'been', 'each', 'they',
    'these', 'those', 'when', 'where', 'will', 'more', 'also', 'such', 'other',
    'into', 'some', 'than', 'them', 'then', 'only', 'very', 'what', 'your', 'shall',
    // Hindi / Devanagari Stop Words
    'और', 'का', 'की', 'के', 'में', 'पर', 'से', 'को', 'ने', 'है', 'हैं', 'था', 'थी', 'थे',
    'यह', 'वह', 'इस', 'उस', 'भी', 'कि', 'हो', 'गया', 'गई', 'जाता', 'किया', 'दिया', 'एवं',
    'तथा', 'अथवा', 'या', 'तक', 'द्वारा', 'साथ', 'लिए', 'हुए', 'होने', 'सकते', 'सकता'
  ]);

  // Term Frequency
  const freqMap: Record<string, number> = {};
  for (const w of words) {
    if (!stopWords.has(w)) {
      freqMap[w] = (freqMap[w] || 0) + 1;
    }
  }

  // Top Key Topics
  const sortedTopics = Object.entries(freqMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));

  // Score Sentences
  const scoredSentences = sentences.map((sent, index) => {
    const sentWords = sent.toLowerCase().match(/\p{L}{2,}/gu) || [];
    let score = 0;
    for (const w of sentWords) {
      if (freqMap[w]) score += freqMap[w];
    }
    // Boost early sentences in paragraphs
    const positionBoost = index < 5 ? 1.4 : index > sentences.length - 5 ? 1.2 : 1.0;
    return {
      sentence: sent,
      score: (score / Math.max(sentWords.length, 1)) * positionBoost,
      index
    };
  });

  // Pick top sentences maintaining original document flow
  const topSentences = [...scoredSentences]
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(8, Math.max(3, Math.floor(sentences.length * 0.15))))
    .sort((a, b) => a.index - b.index);

  const keyPoints = topSentences.map(s => s.sentence);
  const executiveSummary = keyPoints.slice(0, 3).join(' ');

  const totalWords = words.length;
  const readingTimeMin = Math.max(1, Math.ceil(totalWords / 200));

  return {
    executiveSummary: executiveSummary || cleaned.substring(0, 250) + '...',
    keyPoints: keyPoints.length > 0 ? keyPoints : [cleaned.substring(0, 200) + '...'],
    stats: {
      totalPages: pageCount,
      totalWords,
      readingTimeMin,
      sentenceCount: sentences.length,
    },
    keyTopics: sortedTopics
  };
}

export default function AiPdfSummarizer() {
  useSEO(
    'AI PDF Summarizer Online Free — Instant Executive Summary & Key Points',
    'Summarize PDF files instantly with AI. Extracts executive summaries, key bullet points, reading time stats, and topic tags. 100% private, works in your browser.'
  );

  usePageSEO(
    'AI PDF Summarizer Studio — Key Insights & Document Q&A',
    'Summarize long PDF reports, research papers, and legal agreements in seconds. Zero API key required, fast offline sentence ranking, and export to PDF/Markdown.'
  );

  const prefersReduced = useReducedMotion();
  const [file, setFile] = useState<File | null>(null);
  const [pagesText, setPagesText] = useState<PageText[]>([]);
  const [fullText, setFullText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [summary, setSummary] = useState<SummaryResult | null>(null);

  // Q&A / Chat State
  const [chatQuery, setChatQuery] = useState('');
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; text: string; page?: number }[]>([]);
  const [copied, setCopied] = useState(false);

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    const f = files[0];
    setFile(f);
    setSummary(null);
    setChatMessages([]);
    setIsAnalyzing(true);

    try {
      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const extractedPages: PageText[] = [];
      let combined = '';

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        const pageStr = tc.items.map((it: any) => it.str || '').join(' ');
        extractedPages.push({ pageNumber: p, text: pageStr });
        combined += ' ' + pageStr;
      }

      setPagesText(extractedPages);
      setFullText(combined);

      const result = generateExtractiveSummary(combined, pdf.numPages);
      setSummary(result);
    } catch (err: any) {
      console.error('PDF Analysis error:', err);
      alert(`Failed to analyze PDF: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAskQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatQuery.trim() || !fullText) return;

    const query = chatQuery.trim();
    const queryLower = query.toLowerCase();
    const queryTokens = queryLower.split(/\s+/).filter(w => w.length > 2);

    // Search across extracted pages for the best answering paragraph
    let bestPage = 1;
    let bestScore = -1;
    let bestSnippet = '';

    for (const p of pagesText) {
      const pText = p.text;
      const sentences = pText.match(/[^.!?]+[.!?]+/g) || [pText];

      for (const sent of sentences) {
        const sentLower = sent.toLowerCase();
        let matchCount = 0;
        for (const token of queryTokens) {
          if (sentLower.includes(token)) matchCount++;
        }
        if (matchCount > bestScore) {
          bestScore = matchCount;
          bestPage = p.pageNumber;
          bestSnippet = sent.trim();
        }
      }
    }

    let answer = '';
    if (bestScore > 0 && bestSnippet) {
      answer = `Based on Page ${bestPage}: "${bestSnippet}"`;
    } else {
      answer = `I scanned all ${pagesText.length} pages of this document, but could not find a direct mention matching "${query}".`;
    }

    setChatMessages(prev => [
      ...prev,
      { role: 'user', text: query },
      { role: 'assistant', text: answer, page: bestScore > 0 ? bestPage : undefined }
    ]);
    setChatQuery('');
  };

  const copySummaryMarkdown = () => {
    if (!summary) return;
    const md = `# Summary: ${file?.name || 'Document'}\n\n## Executive Summary\n${summary.executiveSummary}\n\n## Key Highlights\n${summary.keyPoints.map(k => `- ${k}`).join('\n')}\n\n## Document Metrics\n- Total Pages: ${summary.stats.totalPages}\n- Total Words: ${summary.stats.totalWords}\n- Estimated Reading Time: ${summary.stats.readingTimeMin} min\n`;
    navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadSummaryPdf = async () => {
    if (!summary) return;
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Header banner
    page.drawRectangle({
      x: 0,
      y: 770,
      width: 595,
      height: 72,
      color: rgb(0.1, 0.15, 0.3),
    });

    page.drawText('AI PDF SUMMARY & EXECUTIVE REPORT', {
      x: 40,
      y: 805,
      size: 16,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });

    page.drawText(`Document: ${file?.name || 'Document'} | ${summary.stats.totalWords} words`, {
      x: 40,
      y: 785,
      size: 10,
      font: helvetica,
      color: rgb(0.8, 0.85, 0.95),
    });

    // Executive Summary
    page.drawText('EXECUTIVE SUMMARY', {
      x: 40,
      y: 740,
      size: 12,
      font: helveticaBold,
      color: rgb(0.1, 0.15, 0.3),
    });

    // Wrap summary text
    let curY = 720;
    const safeAscii = (str: string) => str.replace(/[^\x20-\x7E]/g, ' ');
    const safeSummary = safeAscii(summary.executiveSummary);
    const words = safeSummary.split(' ');
    let line = '';
    for (const w of words) {
      if ((line + w).length > 80) {
        page.drawText(line, { x: 40, y: curY, size: 9, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
        line = w + ' ';
        curY -= 14;
      } else {
        line += w + ' ';
      }
    }
    if (line) {
      page.drawText(line, { x: 40, y: curY, size: 9, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
      curY -= 25;
    }

    // Key Highlights
    page.drawText('KEY TAKEAWAYS & HIGHLIGHTS', {
      x: 40,
      y: curY,
      size: 12,
      font: helveticaBold,
      color: rgb(0.1, 0.15, 0.3),
    });
    curY -= 20;

    summary.keyPoints.slice(0, 6).forEach((kp) => {
      const kpText = `- ${safeAscii(kp).substring(0, 95)}...`;
      page.drawText(kpText, { x: 40, y: curY, size: 8.5, font: helvetica, color: rgb(0.2, 0.25, 0.3) });
      curY -= 16;
    });

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([toArrayBufferBytes(pdfBytes)], { type: 'application/pdf' });
    triggerBlobDownload(blob, `summary_${file?.name || 'document'}.pdf`);
  };

  const reset = () => {
    setFile(null);
    setSummary(null);
    setChatMessages([]);
  };

  const stageKey = !file ? 'upload' : isAnalyzing ? 'analyzing' : 'results';

  return (
    <ToolWorkspaceShell
      title="AI PDF Summarizer & Key Insights"
      subtitle="Condense lengthy reports, contracts, and research papers into instant executive summaries, key highlights, and interactive document Q&A."
      categoryLabel="Intelligence Suite"
      icon={Sparkles}
      microVariant="ocr"
      tone="violet"
      trustNote="Zero API keys • 100% offline centroid extraction in browser"
    >
      <PearlStageSwitch stageKey={stageKey} className="w-full flex flex-col items-center">
        {!file ? (
          <div className="w-full max-w-2xl mx-auto space-y-6">
            <FileDropzone 
              onDrop={handleDrop} 
              multiple={false} 
              title="Select PDF Document to Summarize" 
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="pms-glass-panel p-4 rounded-2xl text-center">
                <FileText className="w-6 h-6 text-violet-600 dark:text-violet-400 mx-auto mb-2" />
                <h3 className="font-bold text-sm text-[var(--pms-ink)]">Executive Summary</h3>
                <p className="text-xs text-[var(--pms-muted)] mt-1">Get core findings and main points in 3 sentences.</p>
              </div>
              <div className="pms-glass-panel p-4 rounded-2xl text-center">
                <Clock className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
                <h3 className="font-bold text-sm text-[var(--pms-ink)]">Reading Time Saved</h3>
                <p className="text-xs text-[var(--pms-muted)] mt-1">Saves up to 90% of reading time on long PDFs.</p>
              </div>
              <div className="pms-glass-panel p-4 rounded-2xl text-center">
                <Shield className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
                <h3 className="font-bold text-sm text-[var(--pms-ink)]">100% Private Offline</h3>
                <p className="text-xs text-[var(--pms-muted)] mt-1">No API keys required. Processed completely in browser.</p>
              </div>
            </div>
          </div>
        ) : isAnalyzing ? (
          <div className="w-full max-w-lg mx-auto pms-glass-panel rounded-3xl p-12 text-center space-y-4 relative overflow-hidden">
            <PearlScanOverlay active={isAnalyzing} label="Synthesizing document insights..." />
            <Loader2 className="w-10 h-10 animate-spin text-violet-600 dark:text-violet-400 mx-auto" />
            <p className="text-base font-semibold text-[var(--pms-ink)]">
              Synthesizing Document Insights...
            </p>
            <p className="text-xs text-[var(--pms-muted)]">
              Ranking salient sentences, frequency centroids, and reading metrics
            </p>
          </div>
        ) : summary ? (
          /* Summary Results View */
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.25 }}
            className="w-full space-y-6"
          >
            {/* Metrics Header Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="pms-glass-panel p-4 rounded-2xl text-center">
                <span className="text-[var(--pms-muted)] text-xs font-semibold block mb-0.5">Pages</span>
                <span className="text-xl font-extrabold text-[var(--pms-ink)]">
                  <AnimatedNumber value={summary.stats.totalPages} />
                </span>
              </div>
              <div className="pms-glass-panel p-4 rounded-2xl text-center">
                <span className="text-[var(--pms-muted)] text-xs font-semibold block mb-0.5">Word Count</span>
                <span className="text-xl font-extrabold text-[var(--pms-ink)]">
                  <AnimatedNumber value={summary.stats.totalWords} />
                </span>
              </div>
              <div className="pms-glass-panel p-4 rounded-2xl text-center">
                <span className="text-[var(--pms-muted)] text-xs font-semibold block mb-0.5">Reading Time</span>
                <span className="text-xl font-extrabold text-violet-600 dark:text-violet-400">
                  <AnimatedNumber value={summary.stats.readingTimeMin} prefix="~" suffix=" min" />
                </span>
              </div>
              <div className="pms-glass-panel p-4 rounded-2xl text-center">
                <span className="text-[var(--pms-muted)] text-xs font-semibold block mb-0.5">Time Saved</span>
                <span className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                  <AnimatedNumber value={Math.max(1, summary.stats.readingTimeMin - 1)} prefix="~" suffix=" min" />
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Executive Summary & Highlights (7 cols) */}
              <div className="lg:col-span-7 space-y-6">
                {/* Executive Summary Card */}
                <div className="pms-glass-panel p-6 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400 flex items-center gap-2">
                      <Sparkles className="w-4 h-4" /> Executive Summary
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={copySummaryMarkdown}
                        className="py-1.5 px-3 rounded-xl border border-[var(--pms-border)] bg-white/60 dark:bg-slate-900/60 text-xs font-semibold flex items-center gap-1.5 text-[var(--pms-ink)] hover:bg-[var(--pms-lavender-surface)] transition-colors"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        onClick={downloadSummaryPdf}
                        className="pms-btn-primary py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" /> PDF
                      </button>
                    </div>
                  </div>

                  <p className="text-sm leading-relaxed text-[var(--pms-ink)]">
                    {summary.executiveSummary}
                  </p>
                </div>

                {/* Key Highlights Card */}
                <div className="pms-glass-panel p-6 rounded-2xl space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--pms-ink)] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Key Takeaways & Crucial Points
                  </h3>

                  <div className="space-y-2.5">
                    {summary.keyPoints.map((point, idx) => (
                      <div 
                        key={idx}
                        className="p-3 bg-white/55 dark:bg-slate-900/55 rounded-xl border border-[var(--pms-border)] text-xs text-[var(--pms-ink)] flex items-start gap-2.5 leading-relaxed"
                      >
                        <span className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 font-bold flex items-center justify-center shrink-0 text-[10px]">
                          {idx + 1}
                        </span>
                        <span>{point}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Key Topic Chips */}
                {summary.keyTopics.length > 0 && (
                  <div className="pms-glass-panel p-5 rounded-2xl space-y-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)]">
                      Most Salient Keywords & Topics
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {summary.keyTopics.map((item, idx) => (
                        <span
                          key={idx}
                          className="py-1 px-2.5 bg-white/70 dark:bg-slate-800/80 border border-[var(--pms-border)] rounded-lg text-xs font-medium text-[var(--pms-ink)]"
                        >
                          #{item.word} ({item.count})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Interactive Document Q&A (5 cols) */}
              <div className="lg:col-span-5 space-y-5">
                <div className="pms-glass-panel p-5 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--pms-ink)] flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-violet-600 dark:text-violet-400" /> Ask This PDF (Instant Q&A)
                    </h3>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200/70 dark:border-emerald-800/50">
                      Offline AI
                    </span>
                  </div>

                  <div className="space-y-3 min-h-[220px] max-h-[360px] overflow-y-auto pr-1">
                    {chatMessages.length === 0 ? (
                      <div className="text-center py-8 text-xs text-[var(--pms-muted)] space-y-2">
                        <BookOpen className="w-8 h-8 text-[var(--pms-muted)] opacity-50 mx-auto" />
                        <p>Ask any question about this document.</p>
                        <div className="flex flex-col gap-1.5 pt-2 text-[11px] text-violet-600 dark:text-violet-400">
                          <button
                            type="button"
                            onClick={() => setChatQuery("What is the primary objective?")}
                            className="hover:underline text-left bg-violet-50/80 dark:bg-violet-950/40 border border-violet-200/60 dark:border-violet-800/50 p-2 rounded-lg"
                          >
                            &ldquo;What is the primary objective?&rdquo;
                          </button>
                          <button
                            type="button"
                            onClick={() => setChatQuery("What are the key deadlines or dates?")}
                            className="hover:underline text-left bg-violet-50/80 dark:bg-violet-950/40 border border-violet-200/60 dark:border-violet-800/50 p-2 rounded-lg"
                          >
                            &ldquo;What are the key deadlines or dates?&rdquo;
                          </button>
                        </div>
                      </div>
                    ) : (
                      chatMessages.map((msg, i) => (
                        <div
                          key={i}
                          className={`p-3 rounded-xl text-xs space-y-1 ${
                            msg.role === 'user'
                              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white ml-6 shadow-sm'
                              : 'bg-white/75 dark:bg-slate-800/80 border border-[var(--pms-border)] text-[var(--pms-ink)] mr-4'
                          }`}
                        >
                          <p className="leading-relaxed">{msg.text}</p>
                          {msg.page && (
                            <span className="text-[10px] opacity-75 font-semibold block">
                              Found on Page {msg.page}
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Question Input Form */}
                  <form onSubmit={handleAskQuestion} className="flex gap-2">
                    <input
                      type="text"
                      value={chatQuery}
                      onChange={(e) => setChatQuery(e.target.value)}
                      placeholder="Ask a question about this document..."
                      className="flex-1 py-2 px-3 text-xs border border-[var(--pms-border)] rounded-xl bg-white/75 dark:bg-slate-900/75 text-[var(--pms-ink)] outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <button
                      type="submit"
                      disabled={!chatQuery.trim()}
                      className="pms-btn-primary py-2 px-3.5 rounded-xl text-xs font-bold flex items-center justify-center disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>

                <button
                  onClick={reset}
                  className="w-full py-2.5 text-xs text-[var(--pms-muted)] hover:text-[var(--pms-ink)] font-semibold text-center transition-colors"
                >
                  ← Summarize Another PDF
                </button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
