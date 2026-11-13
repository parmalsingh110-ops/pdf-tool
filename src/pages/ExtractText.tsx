import { useState, useMemo } from 'react';
import { Download, FileText, FileType, Copy, Check, Search, FileJson, FileCode2, RefreshCw, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import FileDropzone from '../components/FileDropzone';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { useToast } from '../components/Toast';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

interface PageTextItem {
  pageNumber: number;
  text: string;
  wordCount: number;
  charCount: number;
}

export default function ExtractText() {
  useSEO('Extract Text from PDF Online Free | PDF Media Suite', 'Extract clean text from PDF documents with per-page navigation, instant search, word count statistics, and export to TXT, Markdown, or JSON. Free & private.');
  usePageSEO('Extract Text from PDF', 'Extract text from PDF pages with per-page tabs, in-text search, and multi-format exports (.txt, .md, .json). Free online PDF text extractor — fast & browser-based.');

  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStep, setProgressStep] = useState('');
  const [pages, setPages] = useState<PageTextItem[]>([]);
  const [selectedTab, setSelectedTab] = useState<'all' | number>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base');
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedPage, setCopiedPage] = useState(false);
  const toast = useToast();
  const prefersReduced = useReducedMotion();

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setPages([]);
      setSelectedTab('all');
      setSearchQuery('');
    }
  };

  const extractTextFromPdf = async () => {
    if (!file) return;
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      const results: PageTextItem[] = [];

      for (let i = 1; i <= numPages; i++) {
        setProgressStep(`Extracting text from page ${i} of ${numPages}...`);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Group text items by line roughly based on Y transform
        const items = textContent.items as any[];
        let lastY: number | null = null;
        let pageStr = '';

        for (const item of items) {
          if (!item.str) continue;
          const currentY = item.transform ? Math.round(item.transform[5]) : null;
          if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 5) {
            pageStr += '\n';
          } else if (pageStr.length > 0 && !pageStr.endsWith('\n') && !pageStr.endsWith(' ')) {
            pageStr += ' ';
          }
          pageStr += item.str;
          lastY = currentY;
        }

        const trimmed = pageStr.trim();
        const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
        results.push({
          pageNumber: i,
          text: trimmed,
          wordCount: words,
          charCount: trimmed.length,
        });
        page.cleanup();
      }

      setPages(results);
      toast.success(`Successfully extracted text from ${numPages} pages!`);
    } catch (error) {
      console.error('Error extracting text:', error);
      toast.error('An error occurred while extracting text from the PDF.');
    } finally {
      setIsProcessing(false);
      setProgressStep('');
    }
  };

  // Aggregated Stats
  const stats = useMemo(() => {
    const totalWords = pages.reduce((acc, p) => acc + p.wordCount, 0);
    const totalChars = pages.reduce((acc, p) => acc + p.charCount, 0);
    const readingTimeMin = Math.max(1, Math.round(totalWords / 200));
    return { totalWords, totalChars, totalPages: pages.length, readingTimeMin };
  }, [pages]);

  // Active text to display
  const currentText = useMemo(() => {
    if (selectedTab === 'all') {
      return pages.map(p => `--- Page ${p.pageNumber} ---\n${p.text}`).join('\n\n');
    }
    const target = pages.find(p => p.pageNumber === selectedTab);
    return target ? target.text : '';
  }, [pages, selectedTab]);

  // Search match count
  const searchMatchCount = useMemo(() => {
    if (!searchQuery.trim() || !currentText) return 0;
    const re = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return (currentText.match(re) || []).length;
  }, [currentText, searchQuery]);

  // Text render with search highlights
  const renderHighlightedText = (text: string) => {
    if (!searchQuery.trim()) return text;
    const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-200 text-yellow-900 font-bold px-0.5 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  // Downloads
  const downloadAsTxt = () => {
    const full = pages.map(p => `=== Page ${p.pageNumber} ===\n\n${p.text}`).join('\n\n\n');
    const blob = new Blob([full], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file?.name.replace(/\.pdf$/i, '') || 'document'}_extracted.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAsMarkdown = () => {
    const md = pages.map(p => `## Page ${p.pageNumber}\n\n${p.text}`).join('\n\n---\n\n');
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file?.name.replace(/\.pdf$/i, '') || 'document'}_extracted.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAsJson = () => {
    const jsonStr = JSON.stringify(pages, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file?.name.replace(/\.pdf$/i, '') || 'document'}_extracted.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyText = async (textToCopy: string, isAll: boolean) => {
    await navigator.clipboard.writeText(textToCopy);
    if (isAll) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } else {
      setCopiedPage(true);
      setTimeout(() => setCopiedPage(false), 2000);
    }
    toast.success('Copied to clipboard!');
  };

  const fontSizeClasses = {
    sm: 'text-xs leading-relaxed',
    base: 'text-sm leading-relaxed',
    lg: 'text-base leading-loose',
  };

  return (
    <ToolWorkspaceShell
      title="Extract Text from PDF"
      subtitle="Extract clean text content with per-page browsing, instant search, and export to TXT, Markdown, or JSON."
      categoryLabel="Text Extraction & Export"
      icon={FileType}
      microVariant="ocr"
      tone="violet"
    >
      <div className="flex flex-col items-center justify-start">

      {!file ? (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-2xl pms-glass-panel rounded-3xl p-4 sm:p-5"
        >
          <FileDropzone onDrop={handleDrop} multiple={false} title="Drop PDF here or click to select" />
        </motion.div>
      ) : pages.length === 0 ? (
        /* Uploaded & Ready to Extract */
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-2xl pms-glass-panel rounded-3xl p-7 sm:p-8 overflow-hidden min-h-[260px]"
        >
          <PearlScanOverlay active={isProcessing} label={progressStep || 'Extracting text from PDF…'} />

          <div className="flex items-center gap-4 p-5 bg-[var(--pms-soft-lavender)]/70 rounded-2xl border border-[var(--pms-border)] mb-7">
            <div className="w-14 h-14 bg-[var(--pms-white)] dark:bg-slate-900 text-[var(--pms-violet)] rounded-2xl border border-[var(--pms-border)] flex items-center justify-center shrink-0">
              <FileText className="w-7 h-7" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[var(--pms-ink)] truncate">{file.name}</p>
              <p className="text-xs text-[var(--pms-muted)] mt-0.5">{(file.size / 1024 / 1024).toFixed(2)} MB · Ready for extraction</p>
            </div>
            <button
              onClick={() => setFile(null)}
              className="text-xs font-semibold text-[var(--pms-muted)] hover:text-[var(--pms-rose)] px-3 py-1.5 rounded-xl hover:bg-[var(--pms-soft-rose)] transition-colors"
            >
              Change
            </button>
          </div>

          <div className="space-y-4">
            <motion.button
              whileHover={prefersReduced ? undefined : { scale: 1.01 }}
              whileTap={prefersReduced ? undefined : { scale: 0.99 }}
              onClick={extractTextFromPdf}
              disabled={isProcessing}
              className="pms-btn-primary w-full py-4 text-base font-bold rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" /> {progressStep || 'Extracting Text…'}
                </>
              ) : (
                <>
                  <FileType className="w-5 h-5" /> Extract Text from All Pages
                </>
              )}
            </motion.button>
            <p className="text-center text-xs text-[var(--pms-subtle-text)]">
              100% private. Text extraction runs entirely locally in your browser.
            </p>
          </div>
        </motion.div>
      ) : (
        /* Extracted Workspace */
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-6xl space-y-6"
        >

          {/* Stats Header Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pms-glass-panel p-4 rounded-3xl">
            <div className="p-3 bg-[var(--pms-soft-lavender)]/60 rounded-2xl border border-[var(--pms-border)] text-center">
              <div className="text-xs font-semibold text-[var(--pms-muted)]">Pages</div>
              <div className="text-xl font-bold text-[var(--pms-violet)] mt-0.5 tabular-nums">
                <AnimatedNumber value={stats.totalPages} />
              </div>
            </div>
            <div className="p-3 bg-[var(--pms-soft-lavender)]/60 rounded-2xl border border-[var(--pms-border)] text-center">
              <div className="text-xs font-semibold text-[var(--pms-muted)]">Total Words</div>
              <div className="text-xl font-bold text-[var(--pms-violet)] mt-0.5 tabular-nums">
                <AnimatedNumber value={stats.totalWords} />
              </div>
            </div>
            <div className="p-3 bg-[var(--pms-soft-lavender)]/60 rounded-2xl border border-[var(--pms-border)] text-center">
              <div className="text-xs font-semibold text-[var(--pms-muted)]">Characters</div>
              <div className="text-xl font-bold text-[var(--pms-violet)] mt-0.5 tabular-nums">
                <AnimatedNumber value={stats.totalChars} />
              </div>
            </div>
            <div className="p-3 bg-[var(--pms-soft-lavender)]/60 rounded-2xl border border-[var(--pms-border)] text-center">
              <div className="text-xs font-semibold text-[var(--pms-muted)]">Reading Time</div>
              <div className="text-xl font-bold text-[var(--pms-violet)] mt-0.5 tabular-nums">
                ~<AnimatedNumber value={stats.readingTimeMin} suffix=" min" />
              </div>
            </div>
          </div>

          {/* Controls Bar: Search, Page Tabs, Font Size */}
          <div className="pms-glass-panel p-4 sm:p-5 rounded-3xl space-y-3">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Search Bar */}
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-[var(--pms-subtle-text)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search in extracted text..."
                  className="w-full pl-9 pr-8 py-2 bg-[var(--pms-white)] dark:bg-slate-900 border border-[var(--pms-border-strong)] text-[var(--pms-ink)] placeholder:text-[var(--pms-subtle-text)] rounded-xl text-xs focus:ring-2 focus:ring-[var(--pms-violet)]/30 outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--pms-subtle-text)] hover:text-[var(--pms-ink)]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Search results badge */}
              {searchQuery && (
                <span className="text-xs bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 px-3 py-1.5 rounded-xl font-medium shrink-0 tabular-nums">
                  {searchMatchCount} match{searchMatchCount !== 1 ? 'es' : ''} found
                </span>
              )}

              {/* Font Size controls */}
              <div className="flex items-center gap-1 bg-[var(--pms-pearl)]/80 dark:bg-slate-900/70 p-1 rounded-xl border border-[var(--pms-border)] ml-auto">
                <span className="text-xs text-[var(--pms-muted)] px-2">Size:</span>
                {(['sm', 'base', 'lg'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setFontSize(s)}
                    className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition-colors ${
                      fontSize === s
                        ? 'bg-[var(--pms-violet)] text-white shadow-sm'
                        : 'text-[var(--pms-muted)] hover:text-[var(--pms-ink)]'
                    }`}
                  >
                    {s === 'sm' ? 'S' : s === 'base' ? 'M' : 'L'}
                  </button>
                ))}
              </div>
            </div>

            {/* Page Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-2 border-t border-[var(--pms-border)]">
              <button
                onClick={() => setSelectedTab('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedTab === 'all'
                    ? 'bg-[var(--pms-violet)] text-white shadow-sm'
                    : 'bg-[var(--pms-pearl)]/80 dark:bg-slate-800/80 text-[var(--pms-muted)] hover:text-[var(--pms-ink)]'
                }`}
              >
                All Pages ({pages.length})
              </button>
              {pages.map(p => (
                <button
                  key={p.pageNumber}
                  onClick={() => setSelectedTab(p.pageNumber)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                    selectedTab === p.pageNumber
                      ? 'bg-[var(--pms-violet)] text-white shadow-sm'
                      : 'bg-[var(--pms-pearl)]/80 dark:bg-slate-800/80 text-[var(--pms-muted)] hover:text-[var(--pms-ink)]'
                  }`}
                >
                  Page {p.pageNumber} <span className="text-[10px] opacity-70">({p.wordCount}w)</span>
                </button>
              ))}
            </div>
          </div>

          {/* Text Content Box */}
          <div className="pms-glass-panel rounded-3xl overflow-hidden">
            {/* Box Header */}
            <div className="pms-glass-header flex items-center justify-between px-4 py-3 text-xs">
              <span className="font-bold text-[var(--pms-ink)]">
                {selectedTab === 'all' ? 'Complete Extracted Text' : `Page ${selectedTab} Content`}
              </span>
              <div className="flex items-center gap-2">
                {selectedTab !== 'all' ? (
                  <button
                    onClick={() => copyText(currentText, false)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--pms-white)] dark:bg-slate-800 text-[var(--pms-ink)] border border-[var(--pms-border)] rounded-xl hover:bg-[var(--pms-soft-lavender)] font-semibold transition-colors"
                  >
                    {copiedPage ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedPage ? 'Copied Page!' : 'Copy This Page'}
                  </button>
                ) : (
                  <button
                    onClick={() => copyText(currentText, true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--pms-white)] dark:bg-slate-800 text-[var(--pms-ink)] border border-[var(--pms-border)] rounded-xl hover:bg-[var(--pms-soft-lavender)] font-semibold transition-colors"
                  >
                    {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedAll ? 'Copied All!' : 'Copy All Text'}
                  </button>
                )}
              </div>
            </div>

            {/* Main Pre Box */}
            <div className="p-6 max-h-[500px] overflow-y-auto bg-white/95 dark:bg-slate-950/75 font-mono text-slate-800 dark:text-slate-200">
              {currentText ? (
                <div className={`whitespace-pre-wrap ${fontSizeClasses[fontSize]}`}>
                  {renderHighlightedText(currentText)}
                </div>
              ) : (
                <p className="text-[var(--pms-subtle-text)] italic text-sm">No text detected on this page (page may contain scanned images).</p>
              )}
            </div>
          </div>

          {/* Export Action Bar */}
          <div className="pms-glass-panel p-5 rounded-3xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <motion.button
                whileHover={prefersReduced ? undefined : { scale: 1.015 }}
                whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                onClick={downloadAsTxt}
                className="pms-btn-primary inline-flex items-center gap-2 px-5 py-3 font-bold rounded-2xl text-sm"
              >
                <Download className="w-4 h-4" /> Download .TXT
              </motion.button>
              <button
                onClick={downloadAsMarkdown}
                className="inline-flex items-center gap-2 px-4 py-3 bg-[var(--pms-pearl)] dark:bg-slate-800/90 text-[var(--pms-ink)] font-semibold rounded-2xl border border-[var(--pms-border)] hover:bg-[var(--pms-soft-lavender)] transition-colors text-sm"
              >
                <FileCode2 className="w-4 h-4 text-[var(--pms-violet)]" /> Export as Markdown
              </button>
              <button
                onClick={downloadAsJson}
                className="inline-flex items-center gap-2 px-4 py-3 bg-[var(--pms-pearl)] dark:bg-slate-800/90 text-[var(--pms-ink)] font-semibold rounded-2xl border border-[var(--pms-border)] hover:bg-[var(--pms-soft-lavender)] transition-colors text-sm"
              >
                <FileJson className="w-4 h-4 text-[var(--pms-violet)]" /> Export as JSON
              </button>
            </div>

            <button
              onClick={() => { setFile(null); setPages([]); }}
              className="text-xs text-[var(--pms-muted)] hover:text-[var(--pms-ink)] font-semibold px-4 py-2 transition-colors"
            >
              Extract another PDF
            </button>
          </div>
        </motion.div>
      )}
      </div>
    </ToolWorkspaceShell>
  );
}
