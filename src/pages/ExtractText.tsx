import { useState, useMemo } from 'react';
import { Download, FileText, FileType, Copy, Check, Search, FileJson, FileCode2, Clock, AlignLeft, RefreshCw, X, ChevronLeft, ChevronRight } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { useToast } from '../components/Toast';

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
    <div className="flex-1 flex flex-col items-center justify-start p-6 md:p-8 min-h-screen bg-gradient-to-br from-violet-50/40 via-white to-slate-50">
      <div className="text-center mb-10 max-w-2xl">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-violet-100 rounded-2xl mb-4">
          <FileType className="w-7 h-7 text-violet-600" />
        </div>
        <h1 className="text-4xl font-extrabold text-gray-900 mb-3">Extract Text from PDF</h1>
        <p className="text-lg text-gray-500">Extract clean text content with per-page browsing, instant search, and export to TXT, Markdown, or JSON.</p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Drop PDF here or click to select" />
      ) : pages.length === 0 ? (
        /* Uploaded & Ready to Extract */
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="flex items-center gap-4 p-5 bg-violet-50/50 rounded-2xl border border-violet-100 mb-8">
            <div className="w-14 h-14 bg-violet-100 text-violet-600 rounded-xl flex items-center justify-center shrink-0">
              <FileText className="w-7 h-7" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate">{file.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">{(file.size / 1024 / 1024).toFixed(2)} MB · Ready for extraction</p>
            </div>
            <button
              onClick={() => setFile(null)}
              className="text-xs text-gray-400 hover:text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
            >
              Change
            </button>
          </div>

          <div className="space-y-4">
            <button
              onClick={extractTextFromPdf}
              disabled={isProcessing}
              className="w-full py-4 bg-violet-600 text-white text-base font-bold rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" /> {progressStep || 'Extracting Text...'}
                </>
              ) : (
                <>
                  <FileType className="w-5 h-5" /> Extract Text from All Pages
                </>
              )}
            </button>
            <p className="text-center text-xs text-gray-400">
              100% private. Text extraction runs entirely locally in your browser.
            </p>
          </div>
        </div>
      ) : (
        /* Extracted Workspace */
        <div className="w-full max-w-6xl space-y-6">

          {/* Stats Header Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
            <div className="p-3 bg-violet-50/50 rounded-xl border border-violet-100/60 text-center">
              <div className="text-xs font-semibold text-gray-500">Pages</div>
              <div className="text-xl font-bold text-violet-700 mt-0.5">{stats.totalPages}</div>
            </div>
            <div className="p-3 bg-violet-50/50 rounded-xl border border-violet-100/60 text-center">
              <div className="text-xs font-semibold text-gray-500">Total Words</div>
              <div className="text-xl font-bold text-violet-700 mt-0.5">{stats.totalWords.toLocaleString()}</div>
            </div>
            <div className="p-3 bg-violet-50/50 rounded-xl border border-violet-100/60 text-center">
              <div className="text-xs font-semibold text-gray-500">Characters</div>
              <div className="text-xl font-bold text-violet-700 mt-0.5">{stats.totalChars.toLocaleString()}</div>
            </div>
            <div className="p-3 bg-violet-50/50 rounded-xl border border-violet-100/60 text-center">
              <div className="text-xs font-semibold text-gray-500">Reading Time</div>
              <div className="text-xl font-bold text-violet-700 mt-0.5">~{stats.readingTimeMin} min</div>
            </div>
          </div>

          {/* Controls Bar: Search, Page Tabs, Font Size */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-3">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Search Bar */}
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search in extracted text..."
                  className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-violet-500 outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Search results badge */}
              {searchQuery && (
                <span className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1.5 rounded-lg font-medium shrink-0">
                  {searchMatchCount} match{searchMatchCount !== 1 ? 'es' : ''} found
                </span>
              )}

              {/* Font Size controls */}
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-xs text-gray-400 mr-1">Size:</span>
                {(['sm', 'base', 'lg'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setFontSize(s)}
                    className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition-colors ${
                      fontSize === s
                        ? 'bg-violet-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {s === 'sm' ? 'S' : s === 'base' ? 'M' : 'L'}
                  </button>
                ))}
              </div>
            </div>

            {/* Page Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 border-t border-gray-100">
              <button
                onClick={() => setSelectedTab('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedTab === 'all'
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
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
                      ? 'bg-violet-600 text-white shadow-xs'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Page {p.pageNumber} <span className="text-[10px] opacity-70">({p.wordCount}w)</span>
                </button>
              ))}
            </div>
          </div>

          {/* Text Content Box */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Box Header */}
            <div className="flex items-center justify-between p-3.5 bg-slate-50 border-b border-gray-100 text-xs">
              <span className="font-bold text-gray-700">
                {selectedTab === 'all' ? 'Complete Extracted Text' : `Page ${selectedTab} Content`}
              </span>
              <div className="flex items-center gap-2">
                {selectedTab !== 'all' ? (
                  <button
                    onClick={() => copyText(currentText, false)}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 font-semibold"
                  >
                    {copiedPage ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedPage ? 'Copied Page!' : 'Copy This Page'}
                  </button>
                ) : (
                  <button
                    onClick={() => copyText(currentText, true)}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 font-semibold"
                  >
                    {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedAll ? 'Copied All!' : 'Copy All Text'}
                  </button>
                )}
              </div>
            </div>

            {/* Main Pre Box */}
            <div className="p-6 max-h-[500px] overflow-y-auto bg-white font-mono text-gray-800">
              {currentText ? (
                <div className={`whitespace-pre-wrap ${fontSizeClasses[fontSize]}`}>
                  {renderHighlightedText(currentText)}
                </div>
              ) : (
                <p className="text-gray-400 italic text-sm">No text detected on this page (page may contain scanned images).</p>
              )}
            </div>
          </div>

          {/* Export Action Bar */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={downloadAsTxt}
                className="inline-flex items-center gap-2 px-5 py-3 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 transition-colors shadow-xs text-sm"
              >
                <Download className="w-4 h-4" /> Download .TXT
              </button>
              <button
                onClick={downloadAsMarkdown}
                className="inline-flex items-center gap-2 px-4 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors text-sm"
              >
                <FileCode2 className="w-4 h-4 text-violet-600" /> Export as Markdown
              </button>
              <button
                onClick={downloadAsJson}
                className="inline-flex items-center gap-2 px-4 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors text-sm"
              >
                <FileJson className="w-4 h-4 text-violet-600" /> Export as JSON
              </button>
            </div>

            <button
              onClick={() => { setFile(null); setPages([]); }}
              className="text-xs text-gray-500 hover:text-gray-800 font-medium px-4 py-2"
            >
              Extract another PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
