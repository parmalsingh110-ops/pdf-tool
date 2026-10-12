import React, { useState } from 'react';
import { 
  Link as LinkIcon, ExternalLink, Loader2, FileText, Copy, Check, 
  Download, Globe, Mail, Bookmark, ArrowRight, Sparkles
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

interface LinkItem {
  id: string;
  pageIndex: number;
  url: string;
  type: 'external' | 'email' | 'internal';
  domain: string;
}

export default function LinkExtractor() {
  useSEO(
    'Extract Links from PDF Online Free — Hyperlink Auditor & Exporter',
    'Extract all hyperlinks, URLs, email addresses, and internal anchor jumps from PDF documents online. Group by domain, copy all links, or export to CSV and JSON.'
  );

  usePageSEO(
    'PDF Link Extractor & Hyperlink Auditor Studio',
    'Audit and extract all URLs in your PDF. Detects web hyperlinks, mailto links, and internal document bookmarks. 100% private in-browser extraction.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'external' | 'email' | 'internal'>('all');

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    const f = files[0];
    setFile(f);
    setLinks([]);
    setBusy(true);

    try {
      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const found: LinkItem[] = [];
      const seenUrls = new Set<string>();

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);

        // 1. Get annotation links
        const annotations = await page.getAnnotations();
        for (const annot of annotations) {
          if (annot.subtype === 'Link') {
            const url = annot.url || (annot.dest ? `Page Destination (${annot.dest})` : '');
            if (url && !seenUrls.has(`${p}_${url}`)) {
              seenUrls.add(`${p}_${url}`);

              let type: LinkItem['type'] = 'external';
              let domain = 'Internal Anchor';

              if (url.startsWith('mailto:')) {
                type = 'email';
                domain = url.replace('mailto:', '');
              } else if (url.startsWith('http://') || url.startsWith('https://')) {
                type = 'external';
                try { domain = new URL(url).hostname; } catch { domain = url; }
              } else {
                type = 'internal';
              }

              found.push({
                id: `annot_${p}_${found.length}`,
                pageIndex: p,
                url,
                type,
                domain
              });
            }
          }
        }

        // 2. Scan text content for raw unlinked URLs
        const textContent = await page.getTextContent();
        const fullText = textContent.items.map((i: any) => i.str || '').join(' ');
        const urlRegex = /\bhttps?:\/\/[^\s<>"'{}|\\^`[\]]+/gi;
        const rawUrls = fullText.match(urlRegex) || [];

        for (const url of rawUrls) {
          if (!seenUrls.has(`${p}_${url}`)) {
            seenUrls.add(`${p}_${url}`);
            let domain = url;
            try { domain = new URL(url).hostname; } catch {}

            found.push({
              id: `raw_${p}_${found.length}`,
              pageIndex: p,
              url,
              type: 'external',
              domain
            });
          }
        }
      }

      setLinks(found);
    } catch (err: any) {
      console.error('Link extraction error:', err);
      alert(`Link extraction failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const copyAll = async () => {
    if (!links.length) return;
    const text = links.map(l => l.url).join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadCsv = () => {
    if (!links.length) return;
    const csv = 'Page,Type,Domain,URL\n' + links.map(l => `${l.pageIndex},${l.type},"${l.domain}","${l.url}"`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${file?.name.replace(/\.pdf$/i, '')}_Links.csv`;
    a.click();
  };

  const downloadJson = () => {
    if (!links.length) return;
    const blob = new Blob([JSON.stringify(links, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${file?.name.replace(/\.pdf$/i, '')}_Links.json`;
    a.click();
  };

  const reset = () => {
    setFile(null);
    setLinks([]);
  };

  const filteredLinks = filterType === 'all' 
    ? links 
    : links.filter(l => l.type === filterType);

  const domainCounts = links.reduce((acc, curr) => {
    if (curr.type === 'external') {
      acc[curr.domain] = (acc[curr.domain] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-4 sm:p-8 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm border border-cyan-100 dark:border-cyan-900/50">
          <LinkIcon className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-2">
          PDF Link Extractor & Auditor Studio
        </h1>
        <p className="text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          Audit and extract all external URLs, email addresses, and internal document anchors. Group by domain and export to CSV or JSON.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl space-y-6">
          <FileDropzone 
            onDrop={handleDrop} 
            multiple={false} 
            title="Select PDF Document to Audit Links" 
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Globe className="w-6 h-6 text-cyan-600 dark:text-cyan-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Web Links</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Extracts active http/https hyperlinks & unlinked URLs.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Bookmark className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Internal Anchors</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Identifies table-of-contents jumps and page targets.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Download className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">CSV & JSON Export</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Export structured link audit spreadsheets in 1 click.</p>
            </div>
          </div>
        </div>
      ) : busy ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-cyan-600 mx-auto" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Auditing PDF Annotations & Text Streams...</h3>
          <p className="text-xs text-slate-500">Scanning for hyperlinks, mailto triggers, and internal targets...</p>
        </div>
      ) : (
        /* Links Studio Workspace */
        <div className="w-full space-y-4">
          {/* Top Control Bar */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {[
                { id: 'all', label: `All (${links.length})` },
                { id: 'external', label: `Web (${links.filter(l => l.type === 'external').length})` },
                { id: 'email', label: `Emails (${links.filter(l => l.type === 'email').length})` },
                { id: 'internal', label: `Anchors (${links.filter(l => l.type === 'internal').length})` }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setFilterType(tab.id as any)}
                  className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all ${
                    filterType === tab.id
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={copyAll}
                className="py-2 px-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs flex items-center gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                Copy URLs
              </button>
              <button
                onClick={downloadCsv}
                className="py-2 px-3.5 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                CSV
              </button>
              <button
                onClick={downloadJson}
                className="py-2 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm"
              >
                JSON
              </button>
              <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600 underline ml-2">Change</button>
            </div>
          </div>

          {/* Domain Breakdown Pills */}
          {Object.keys(domainCounts).length > 0 && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center gap-2 overflow-x-auto text-xs">
              <span className="font-bold text-slate-500 shrink-0">Top Domains:</span>
              {Object.entries(domainCounts).slice(0, 6).map(([dom, count]) => (
                <span key={dom} className="px-2.5 py-0.5 rounded-full bg-white dark:bg-slate-900 border text-slate-700 dark:text-slate-300 shrink-0 font-medium text-[11px]">
                  {dom} <strong className="text-cyan-600">({count})</strong>
                </span>
              ))}
            </div>
          )}

          {/* Links Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800 max-h-[70vh] overflow-y-auto">
            {filteredLinks.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-400">No links found matching this filter.</p>
            ) : (
              filteredLinks.map(link => (
                <div key={link.id} className="p-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-500 shrink-0">
                      Page {link.pageIndex}
                    </span>
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-slate-800 dark:text-slate-200 truncate">{link.url}</p>
                      <p className="text-[11px] text-slate-400 truncate">{link.domain}</p>
                    </div>
                  </div>

                  {link.type === 'external' && (
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg border text-slate-400 hover:text-cyan-600 hover:border-cyan-300 transition-colors shrink-0"
                      title="Open link in new tab"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
