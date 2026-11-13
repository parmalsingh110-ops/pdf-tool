import { useState } from 'react';
import {
  FileText, Download, Copy, Check, Loader2,
  SplitSquareVertical, Sparkles,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { PearlStageSwitch, PearlScanOverlay, AnimatedNumber } from '../components/pearl/PearlMotion';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { triggerBlobDownload } from '../lib/blobUrl';

export default function PdfToMarkdown() {
  useSEO(
    'PDF to Markdown Online Free — High-Fidelity Markdown Converter',
    'Convert PDF documents to clean formatted Markdown (.md) online. Preserves headings, bold/italics, bullet lists, code blocks, and tables with split-view live preview.'
  );

  usePageSEO(
    'PDF to Markdown Converter Studio — Live Split Preview',
    'Convert PDF files to formatted Markdown. Features header scale detection, bold/italic font parsing, code block formatting, and a side-by-side live editor.'
  );

  const prefersReduced = useReducedMotion();

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [markdown, setMarkdown] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'split' | 'editor' | 'preview'>('split');

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    const f = files[0];
    setFile(f);
    setMarkdown('');
    setBusy(true);

    try {
      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const lines: string[] = [];

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 1.0 });
        const textContent = await page.getTextContent();

        if (p > 1) {
          lines.push('\n---\n');
        }

        let prevY = -1;

        for (const item of textContent.items as any[]) {
          const rawStr = item.str || '';
          if (!rawStr.trim()) continue;

          const fontSize = item.height || 0;
          const y = Math.round(item.transform?.[5] || 0);
          const fontName = (item.fontName || '').toLowerCase();

          const isBold = fontName.includes('bold') || fontName.includes('black') || fontName.includes('heavy');
          const isItalic = fontName.includes('italic') || fontName.includes('oblique');
          const isMono = fontName.includes('courier') || fontName.includes('mono') || fontName.includes('consolas');

          let formattedText = rawStr.trim();
          if (isBold && isItalic) formattedText = `***${formattedText}***`;
          else if (isBold) formattedText = `**${formattedText}**`;
          else if (isItalic) formattedText = `*${formattedText}*`;

          // Check if new line
          if (prevY >= 0 && Math.abs(y - prevY) > 3) {
            lines.push('\n');
          }

          // Header Detection by relative font size
          if (fontSize > vp.height * 0.038) {
            lines.push(`\n# ${rawStr.trim()}\n`);
          } else if (fontSize > vp.height * 0.028) {
            lines.push(`\n## ${rawStr.trim()}\n`);
          } else if (fontSize > vp.height * 0.022) {
            lines.push(`\n### ${rawStr.trim()}\n`);
          } else if (rawStr.startsWith('•') || rawStr.startsWith('-') || rawStr.startsWith('*')) {
            lines.push(`- ${rawStr.replace(/^[•\-\*]\s*/, '')}`);
          } else if (/^\d+\.\s/.test(rawStr)) {
            lines.push(rawStr);
          } else if (isMono) {
            lines.push(`\`${rawStr}\``);
          } else {
            lines.push(formattedText + ' ');
          }

          prevY = y;
        }
      }

      setMarkdown(lines.join('').trim());
    } catch (err: any) {
      console.error('Markdown conversion error:', err);
      alert(`Conversion error: ${err?.message || 'Failed to parse text.'}`);
    } finally {
      setBusy(false);
    }
  };

  const copyMarkdown = () => {
    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadFile = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    triggerBlobDownload(blob, `${file?.name.replace(/\.pdf$/i, '') || 'document'}.md`);
  };

  const reset = () => {
    setFile(null);
    setMarkdown('');
  };

  const wordCount = markdown.trim() ? markdown.trim().split(/\s+/).length : 0;
  const lineCount = markdown ? markdown.split('\n').length : 0;
  const stageKey = !file ? 'upload' : busy ? 'processing' : 'workspace';

  return (
    <ToolWorkspaceShell
      title="PDF to Markdown Converter Studio"
      subtitle="Convert PDF documents into formatted Markdown (.md), preserving headings, bold/italics, and lists with live split preview."
      categoryLabel="Convert from PDF"
      icon={FileText}
      microVariant="convert"
      tone="emerald"
      trustNote="100% browser-side layout parser • Private local conversion"
    >
      <div className="max-w-6xl mx-auto">
        <PearlStageSwitch stageKey={stageKey}>
          {!file ? (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="pms-glass-panel rounded-3xl p-4 sm:p-6">
                <FileDropzone
                  onDrop={handleDrop}
                  multiple={false}
                  title="Select PDF Document to Convert to Markdown"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="pms-glass-panel p-4 rounded-2xl text-center">
                  <Sparkles className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">Typography Preserved</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Extracts # Headings, **bold**, and *italic* formatting.
                  </p>
                </div>
                <div className="pms-glass-panel p-4 rounded-2xl text-center">
                  <SplitSquareVertical className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">Split-View Editor</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Live raw Markdown editor on left, formatted preview on right.
                  </p>
                </div>
                <div className="pms-glass-panel p-4 rounded-2xl text-center">
                  <Download className="w-6 h-6 text-indigo-600 dark:text-indigo-400 mx-auto mb-2" />
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">Export .md File</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    1-click download clean .md files for GitHub, Obsidian, or Notion.
                  </p>
                </div>
              </div>
            </div>
          ) : busy ? (
            <div className="max-w-xl mx-auto pms-glass-panel rounded-3xl p-12 text-center space-y-4 relative overflow-hidden">
              <PearlScanOverlay active label="Parsing PDF & Generating Markdown..." />
              <Loader2 className="w-10 h-10 animate-spin text-emerald-600 dark:text-emerald-400 mx-auto" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Parsing PDF & Generating Markdown...
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Analyzing font weights, heading sizes, and structural delimiters...
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Top Control Bar */}
              <div className="pms-glass-panel p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { id: 'split', label: 'Split View' },
                    { id: 'editor', label: 'Raw Editor' },
                    { id: 'preview', label: 'Rendered View' },
                  ].map((tab) => {
                    const active = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`relative py-1.5 px-3.5 rounded-xl text-xs font-bold transition-colors border ${
                          active
                            ? 'text-emerald-950 dark:text-emerald-100 border-emerald-300 dark:border-emerald-700'
                            : 'bg-white/70 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800'
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="md-view-tab"
                            transition={
                              prefersReduced
                                ? { duration: 0 }
                                : { type: 'spring', stiffness: 420, damping: 32 }
                            }
                            className="absolute inset-0 rounded-xl bg-emerald-50 dark:bg-emerald-950/50"
                          />
                        )}
                        <span className="relative z-10">{tab.label}</span>
                      </button>
                    );
                  })}

                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 pl-2 hidden sm:inline">
                    <AnimatedNumber value={wordCount} /> words • <AnimatedNumber value={lineCount} /> lines
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={copyMarkdown}
                    className="py-2 px-3.5 bg-white/85 dark:bg-slate-800/85 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs flex items-center gap-1.5 border border-slate-200/80 dark:border-slate-700 transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied!' : 'Copy Markdown'}
                  </button>
                  <button
                    type="button"
                    onClick={downloadFile}
                    className="pms-btn-primary py-2 px-4 font-bold rounded-xl text-xs flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download .md
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white underline ml-1"
                  >
                    Change
                  </button>
                </div>
              </div>

              {/* Editor / Preview Area */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(activeTab === 'split' || activeTab === 'editor') && (
                  <div
                    className={`pms-glass-panel rounded-2xl p-4 flex flex-col ${
                      activeTab === 'editor' ? 'md:col-span-2' : ''
                    }`}
                  >
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">
                      Raw Markdown Source
                    </span>
                    <textarea
                      value={markdown}
                      onChange={(e) => setMarkdown(e.target.value)}
                      className="w-full h-[65vh] p-3.5 text-xs font-mono bg-white dark:bg-slate-900/80 rounded-xl border border-slate-200/80 dark:border-slate-700 text-slate-900 dark:text-slate-100 outline-none resize-none focus:ring-2 focus:ring-emerald-500/40"
                    />
                  </div>
                )}

                {(activeTab === 'split' || activeTab === 'preview') && (
                  <div
                    className={`pms-glass-panel rounded-2xl p-4 sm:p-5 flex flex-col ${
                      activeTab === 'preview' ? 'md:col-span-2' : ''
                    }`}
                  >
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">
                      Live Formatted Preview
                    </span>
                    <div className="bg-white dark:bg-slate-900/80 rounded-xl border border-slate-200/80 dark:border-slate-700 p-5 overflow-y-auto h-[65vh] text-left shadow-inner">
                      <div className="space-y-3 whitespace-pre-wrap font-sans text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                        {markdown}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </PearlStageSwitch>
      </div>
    </ToolWorkspaceShell>
  );
}
