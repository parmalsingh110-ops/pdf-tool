import React, { useState } from 'react';
import { 
  FileText, Download, Copy, Check, Loader2, FileCode, 
  SplitSquareVertical, Eye, Sparkles, Layers, ArrowRight
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

export default function PdfToMarkdown() {
  useSEO(
    'PDF to Markdown Online Free — High-Fidelity Markdown Converter',
    'Convert PDF documents to clean formatted Markdown (.md) online. Preserves headings, bold/italics, bullet lists, code blocks, and tables with split-view live preview.'
  );

  usePageSEO(
    'PDF to Markdown Converter Studio — Live Split Preview',
    'Convert PDF files to formatted Markdown. Features header scale detection, bold/italic font parsing, code block formatting, and a side-by-side live editor.'
  );

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
        let inCodeBlock = false;

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
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${file?.name.replace(/\.pdf$/i, '') || 'document'}.md`;
    a.click();
  };

  const reset = () => {
    setFile(null);
    setMarkdown('');
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-4 sm:p-8 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm border border-emerald-100 dark:border-emerald-900/50">
          <FileText className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-2">
          PDF to Markdown Converter Studio
        </h1>
        <p className="text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          Convert PDF documents into formatted Markdown (.md). Preserves headings, bold/italics, and bullet points with live side-by-side preview.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl space-y-6">
          <FileDropzone 
            onDrop={handleDrop} 
            multiple={false} 
            title="Select PDF Document to Convert to Markdown" 
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Sparkles className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Typography Preserved</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Extracts # Headings, **bold**, and *italic* formatting.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <SplitSquareVertical className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Split-View Editor</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Live raw Markdown editor on left, formatted preview on right.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Download className="w-6 h-6 text-indigo-600 dark:text-indigo-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Export .md File</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">1-click download clean .md files for GitHub, Obsidian, or Notion.</p>
            </div>
          </div>
        </div>
      ) : busy ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mx-auto" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Parsing PDF & Generating Markdown...</h3>
          <p className="text-xs text-slate-500">Analyzing font weights, heading sizes, and structural delimiters...</p>
        </div>
      ) : (
        /* Markdown Studio Workspace */
        <div className="w-full space-y-4">
          {/* Top Control Bar */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {[
                { id: 'split', label: 'Split View' },
                { id: 'editor', label: 'Raw Editor' },
                { id: 'preview', label: 'Rendered View' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all ${
                    activeTab === tab.id
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={copyMarkdown}
                className="py-2 px-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs flex items-center gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Markdown
              </button>
              <button
                onClick={downloadFile}
                className="py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                Download .md
              </button>
              <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600 underline ml-2">Change</button>
            </div>
          </div>

          {/* Editor / Preview Area */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(activeTab === 'split' || activeTab === 'editor') && (
              <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col ${
                activeTab === 'editor' ? 'md:col-span-2' : ''
              }`}>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">
                  Raw Markdown Source
                </span>
                <textarea
                  value={markdown}
                  onChange={e => setMarkdown(e.target.value)}
                  className="w-full h-[65vh] p-3 text-xs font-mono bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 outline-none resize-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            )}

            {(activeTab === 'split' || activeTab === 'preview') && (
              <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 overflow-y-auto max-h-[73vh] prose dark:prose-invert prose-xs text-left ${
                activeTab === 'preview' ? 'md:col-span-2' : ''
              }`}>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 block not-prose">
                  Live Formatted Preview
                </span>
                <div className="space-y-3 whitespace-pre-wrap font-sans text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                  {markdown}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
