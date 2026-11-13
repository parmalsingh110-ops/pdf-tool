import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  FileType,
  Loader2,
  Copy,
  Check,
  Eye,
  Code,
  Layers,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

interface FontItem {
  id: string;
  name: string;
  cleanName: string;
  type: string;
  encoding: string;
  pages: number[];
  isEmbedded: boolean;
}

export default function FontExtractor() {
  useSEO(
    'Extract Fonts from PDF Online Free — Typography & Font Inspector',
    'Extract and identify embedded fonts in PDF files online. View font specimens, PostScript names, font subtypes, and copy @font-face CSS snippets.'
  );

  usePageSEO(
    'PDF Font Extractor & Typography Studio',
    'Inspect all typography used in your PDF document. Extracts font names, TrueType/Type1 structures, page references, and provides CSS font-face declarations.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [fonts, setFonts] = useState<FontItem[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const prefersReduced = useReducedMotion();

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    const f = files[0];
    setFile(f);
    setFonts([]);
    setBusy(true);

    try {
      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const fontMap = new Map<string, FontItem>();

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const styles = await page.getTextContent();

        if (styles.styles) {
          for (const [key, style] of Object.entries(styles.styles) as any[]) {
            const rawName = style.fontFamily || key;
            const cleanName = rawName.replace(/^[A-Z]{6}\+/, '').replace(/-/g, ' ');

            const existing = fontMap.get(rawName);
            if (existing) {
              if (!existing.pages.includes(p)) existing.pages.push(p);
            } else {
              fontMap.set(rawName, {
                id: key,
                name: rawName,
                cleanName,
                type: style.ascent ? 'TrueType / OpenType' : 'PostScript Type 1',
                encoding: rawName.includes('Identity-H') ? 'Unicode (Identity-H)' : 'Standard / WinAnsi',
                pages: [p],
                isEmbedded: rawName.includes('+') || !!style.ascent,
              });
            }
          }
        }
      }

      setFonts(Array.from(fontMap.values()));
    } catch (err: any) {
      console.error('Font inspection error:', err);
      alert(`Font inspection failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const copyCssDeclaration = (font: FontItem) => {
    const css = `@font-face {
  font-family: '${font.cleanName}';
  /* Extracted from ${file?.name} */
  font-weight: normal;
  font-style: normal;
}`;
    navigator.clipboard.writeText(css);
    setCopiedId(font.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const reset = () => {
    setFile(null);
    setFonts([]);
  };

  const embeddedCount = fonts.filter(f => f.isEmbedded).length;
  const systemCount = fonts.filter(f => !f.isEmbedded).length;
  const stageKey = !file ? 'upload' : busy ? 'scanning' : 'results';

  return (
    <ToolWorkspaceShell
      title="PDF Font Extractor & Typography Studio"
      subtitle="Identify and inspect all embedded fonts in your PDF. Examine PostScript names, character encoding, and generate @font-face CSS."
      categoryLabel="Typography Inspector"
      icon={FileType}
      microVariant="edit"
      tone="violet"
      trustNote="100% in-browser font dictionary inspection · Instant @font-face CSS"
    >
      <PearlStageSwitch stageKey={stageKey}>
        {!file ? (
          <div className="w-full max-w-2xl mx-auto space-y-6">
            <FileDropzone
              onDrop={handleDrop}
              multiple={false}
              title="Select PDF Document to Inspect Fonts"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              {[
                {
                  icon: Eye,
                  tint: 'bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)]',
                  title: 'Typography Cards',
                  desc: 'Live font specimen preview with sample alphabet pangrams.',
                },
                {
                  icon: Layers,
                  tint: 'bg-[var(--pms-soft-blue)] text-[var(--pms-blue)]',
                  title: 'Font Classification',
                  desc: 'Identifies TrueType, OpenType, Type1, and Unicode encodings.',
                },
                {
                  icon: Code,
                  tint: 'bg-[var(--pms-soft-rose)] text-[var(--pms-rose)]',
                  title: 'CSS Snippets',
                  desc: '1-click copy @font-face declarations for your website.',
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
            <PearlScanOverlay active={busy} label="Parsing font dictionaries & embedded glyphs…" />
            <div className="w-14 h-14 rounded-2xl bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] flex items-center justify-center mx-auto">
              <Loader2 className="w-7 h-7 animate-spin" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
              Parsing Font Dictionaries & Glyphs…
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Scanning page styles and embedded CFF/TrueType streams in <span className="font-semibold">{file.name}</span>.
            </p>
          </div>
        ) : (
          <div className="w-full max-w-4xl mx-auto space-y-5">
            {/* Summary Metrics */}
            <div className="grid grid-cols-3 gap-3.5">
              {[
                { label: 'Font Families', val: fonts.length, tint: 'bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)]' },
                { label: 'Subset Embedded', val: embeddedCount, tint: 'bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300' },
                { label: 'System / Standard', val: systemCount, tint: 'bg-[var(--pms-soft-blue)] text-[var(--pms-blue)]' },
              ].map((m, idx) => (
                <motion.div
                  key={m.label}
                  initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: idx * 0.04 }}
                  className="pms-glass-panel rounded-2xl p-4"
                >
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${m.tint} mb-1`}>
                    {m.label}
                  </span>
                  <p className="text-2xl font-extrabold text-slate-900 dark:text-white">
                    <AnimatedNumber value={m.val} />
                  </p>
                </motion.div>
              ))}
            </div>

            {/* Header Bar */}
            <div className="pms-glass-panel p-4 rounded-2xl flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Detected <AnimatedNumber value={fonts.length} /> Font Famil{fonts.length === 1 ? 'y' : 'ies'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">in {file.name}</p>
              </div>
              <button
                onClick={reset}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer shrink-0"
              >
                Change File
              </button>
            </div>

            <AnimatePresence initial={false}>
              {fonts.length === 0 ? (
                <motion.div
                  key="no-fonts"
                  initial={prefersReduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="pms-glass-panel rounded-3xl p-10 text-center space-y-2"
                >
                  <p className="font-bold text-slate-800 dark:text-slate-100">No text font dictionaries detected</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    This PDF may consist solely of scanned raster images or outlined vector paths.
                  </p>
                </motion.div>
              ) : (
                <div className="space-y-4">
                  {fonts.map((font, idx) => (
                    <motion.div
                      key={font.id}
                      initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.24, delay: Math.min(idx * 0.04, 0.35) }}
                      className="pms-glass-panel rounded-3xl p-5 space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--pms-border)] pb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] rounded-xl flex items-center justify-center font-serif text-lg font-bold shrink-0">
                            Aa
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-extrabold text-base text-slate-900 dark:text-white truncate">{font.cleanName}</h3>
                            <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">{font.name}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] text-slate-600 dark:text-slate-300">
                            {font.type}
                          </span>
                          <motion.button
                            whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                            whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                            onClick={() => copyCssDeclaration(font)}
                            className="pms-btn-primary py-1.5 px-3.5 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            {copiedId === font.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiedId === font.id ? 'Copied CSS' : 'Copy CSS'}
                          </motion.button>
                        </div>
                      </div>

                      {/* Font Specimen Preview */}
                      <div className="p-4 bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] space-y-2">
                        <p className="text-base text-slate-800 dark:text-slate-100 font-medium">
                          The quick brown fox jumps over the lazy dog 1234567890
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          ABCDEFGHIJKLMNOPQRSTUVWXYZ • abcdefghijklmnopqrstuvwxyz • !@#$%^&amp;*()_+
                        </p>
                      </div>

                      {/* Metadata Line */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300 pt-0.5">
                        <span>Encoding: <strong>{font.encoding}</strong></span>
                        <span>
                          Used on Page{font.pages.length === 1 ? '' : 's'}: <strong>{font.pages.join(', ')}</strong>
                        </span>
                        <span>
                          Embedded Stream:{' '}
                          <strong className={font.isEmbedded ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}>
                            {font.isEmbedded ? 'Yes (Subset Embedded)' : 'Standard System Font'}
                          </strong>
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </AnimatePresence>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
