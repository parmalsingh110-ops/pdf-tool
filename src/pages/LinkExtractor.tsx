import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Link as LinkIcon,
  ExternalLink,
  Copy,
  Check,
  Download,
  Globe,
  Mail,
  Bookmark,
  Loader2,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { triggerBlobDownload } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

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

  const prefersReduced = useReducedMotion();

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
                domain,
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
              domain,
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
    triggerBlobDownload(blob, `${file?.name.replace(/\.pdf$/i, '')}_Links.csv`);
  };

  const downloadJson = () => {
    if (!links.length) return;
    const blob = new Blob([JSON.stringify(links, null, 2)], { type: 'application/json' });
    triggerBlobDownload(blob, `${file?.name.replace(/\.pdf$/i, '')}_Links.json`);
  };

  const reset = () => {
    setFile(null);
    setLinks([]);
    setFilterType('all');
  };

  const webCount = links.filter(l => l.type === 'external').length;
  const emailCount = links.filter(l => l.type === 'email').length;
  const internalCount = links.filter(l => l.type === 'internal').length;

  const filteredLinks = filterType === 'all'
    ? links
    : links.filter(l => l.type === filterType);

  const domainCounts = links.reduce((acc, curr) => {
    if (curr.type === 'external') {
      acc[curr.domain] = (acc[curr.domain] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const stageKey = !file ? 'upload' : busy ? 'scanning' : 'workspace';

  return (
    <ToolWorkspaceShell
      title="PDF Link Extractor & Auditor"
      subtitle="Audit and extract all external URLs, email addresses, and internal document anchors. Group by domain and export to CSV or JSON."
      categoryLabel="Hyperlink Intelligence Studio"
      icon={LinkIcon}
      microVariant="generic"
      tone="blue"
      trustNote="100% browser-only link & annotation audit · Zero uploads"
    >
      <PearlStageSwitch stageKey={stageKey}>
        {!file ? (
          <div className="w-full max-w-2xl mx-auto space-y-6">
            <FileDropzone
              onDrop={handleDrop}
              multiple={false}
              title="Select PDF Document to Audit Links"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              {[
                {
                  icon: Globe,
                  tint: 'bg-[var(--pms-soft-blue)] text-[var(--pms-blue)]',
                  title: 'Web Links',
                  desc: 'Extracts active http/https hyperlinks & unlinked URLs.',
                },
                {
                  icon: Bookmark,
                  tint: 'bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)]',
                  title: 'Internal Anchors',
                  desc: 'Identifies table-of-contents jumps and page targets.',
                },
                {
                  icon: Download,
                  tint: 'bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300',
                  title: 'CSV & JSON Export',
                  desc: 'Export structured link audit spreadsheets in 1 click.',
                },
              ].map((card, idx) => (
                <motion.div
                  key={card.title}
                  initial={prefersReduced ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, delay: idx * 0.06 }}
                  whileHover={prefersReduced ? undefined : { y: -3 }}
                  className="pms-glass-panel p-5 rounded-2xl text-center"
                >
                  <div className={`w-10 h-10 rounded-xl ${card.tint} flex items-center justify-center mx-auto mb-2.5`}>
                    <card.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">{card.title}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{card.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        ) : busy ? (
          <div className="relative max-w-lg mx-auto pms-glass-panel rounded-3xl p-12 text-center space-y-4 overflow-hidden">
            <PearlScanOverlay active={busy} label="Auditing PDF annotations & URL text streams…" />
            <div className="w-14 h-14 rounded-2xl bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] flex items-center justify-center mx-auto">
              <Loader2 className="w-7 h-7 animate-spin" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
              Auditing Annotations & Text Streams…
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Scanning <span className="font-semibold text-slate-700 dark:text-slate-200">{file.name}</span> for hyperlinks, mailto triggers, and internal targets.
            </p>
          </div>
        ) : (
          <div className="w-full space-y-5">
            {/* Summary Metric Tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
              {[
                { label: 'Total Links', val: links.length, icon: LinkIcon, bg: 'bg-[var(--pms-soft-blue)] text-[var(--pms-blue)]' },
                { label: 'Web URLs', val: webCount, icon: Globe, bg: 'bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)]' },
                { label: 'Email Triggers', val: emailCount, icon: Mail, bg: 'bg-[var(--pms-soft-rose)] text-[var(--pms-rose)]' },
                { label: 'Internal Anchors', val: internalCount, icon: Bookmark, bg: 'bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300' },
              ].map((stat, idx) => (
                <motion.div
                  key={stat.label}
                  initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: idx * 0.04 }}
                  className="pms-glass-panel rounded-2xl p-4 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{stat.label}</p>
                    <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-0.5">
                      <AnimatedNumber value={stat.val} />
                    </p>
                  </div>
                  <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center shrink-0`}>
                    <stat.icon className="w-5 h-5" />
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Top Control Bar */}
            <div className="pms-glass-panel p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'all', label: `All (${links.length})` },
                  { id: 'external', label: `Web (${webCount})` },
                  { id: 'email', label: `Emails (${emailCount})` },
                  { id: 'internal', label: `Anchors (${internalCount})` },
                ].map(tab => {
                  const active = filterType === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setFilterType(tab.id as any)}
                      className={`relative py-1.5 px-3.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                        active
                          ? 'text-white'
                          : 'bg-white/75 dark:bg-slate-900/75 text-slate-600 dark:text-slate-300 border border-[var(--pms-border)] hover:bg-white dark:hover:bg-slate-800'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="link-filter-pill"
                          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                          className="absolute inset-0 rounded-xl bg-sky-600 shadow-sm"
                        />
                      )}
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <motion.button
                  whileTap={prefersReduced ? undefined : { scale: 0.97 }}
                  onClick={copyAll}
                  disabled={!links.length}
                  className="py-2 px-3.5 bg-white/80 dark:bg-slate-900/80 hover:bg-white dark:hover:bg-slate-800 border border-[var(--pms-border)] text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied!' : 'Copy URLs'}
                </motion.button>
                <motion.button
                  whileHover={prefersReduced || !links.length ? undefined : { scale: 1.02 }}
                  whileTap={prefersReduced || !links.length ? undefined : { scale: 0.98 }}
                  onClick={downloadCsv}
                  disabled={!links.length}
                  className="pms-btn-primary py-2 px-4 font-bold rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </motion.button>
                <motion.button
                  whileTap={prefersReduced || !links.length ? undefined : { scale: 0.98 }}
                  onClick={downloadJson}
                  disabled={!links.length}
                  className="py-2 px-3.5 bg-[var(--pms-soft-lavender)] hover:brightness-95 text-[var(--pms-violet)] border border-[var(--pms-border)] font-bold rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                >
                  JSON
                </motion.button>
                <button
                  onClick={reset}
                  className="py-2 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Change File
                </button>
              </div>
            </div>

            {/* Domain Breakdown Pills */}
            {Object.keys(domainCounts).length > 0 && (
              <div className="pms-glass-panel p-3.5 rounded-2xl flex items-center gap-2 overflow-x-auto text-xs">
                <span className="font-bold text-slate-600 dark:text-slate-300 shrink-0">Top Domains:</span>
                {Object.entries(domainCounts).slice(0, 8).map(([dom, count]) => (
                  <span
                    key={dom}
                    className="px-2.5 py-1 rounded-full bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] text-slate-700 dark:text-slate-300 shrink-0 font-medium text-[11px]"
                  >
                    {dom} <strong className="text-[var(--pms-blue)]">(<AnimatedNumber value={count} />)</strong>
                  </span>
                ))}
              </div>
            )}

            {/* Links Table */}
            <div className="pms-glass-panel rounded-3xl p-4 sm:p-5">
              <div className="bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] divide-y divide-[var(--pms-border)] max-h-[64vh] overflow-y-auto">
                <AnimatePresence mode="popLayout" initial={false}>
                  {filteredLinks.length === 0 ? (
                    <motion.p
                      key="empty"
                      initial={prefersReduced ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={prefersReduced ? undefined : { opacity: 0 }}
                      className="p-10 text-center text-xs text-slate-500 dark:text-slate-400"
                    >
                      No links found matching this filter.
                    </motion.p>
                  ) : (
                    filteredLinks.map((link, idx) => (
                      <motion.div
                        key={link.id}
                        initial={prefersReduced ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={prefersReduced ? undefined : { opacity: 0 }}
                        transition={{ duration: 0.18, delay: Math.min(idx * 0.015, 0.25) }}
                        className="p-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors text-xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] shrink-0">
                            Page {link.pageIndex}
                          </span>
                          <div className="min-w-0">
                            <p className="font-mono text-xs text-slate-800 dark:text-slate-100 truncate">{link.url}</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{link.domain}</p>
                          </div>
                        </div>

                        {link.type === 'external' && (
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-xl border border-[var(--pms-border)] bg-white/80 dark:bg-slate-800/80 text-slate-500 dark:text-slate-300 hover:text-[var(--pms-blue)] hover:border-sky-300 transition-colors shrink-0"
                            title="Open link in new tab"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
