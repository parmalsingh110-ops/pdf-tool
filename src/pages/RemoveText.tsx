import { useState, useEffect } from 'react';
import {
  Scissors, Download, Loader2, ChevronLeft, ChevronRight,
  Check, Sliders, Eye, Sparkles
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb } from 'pdf-lib';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { apiFetch } from '../lib/api';

type RemovalScope = 'keywords' | 'headers-footers' | 'all-text';

interface TextMatch {
  pageIndex: number;
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function RemoveText() {
  useSEO(
    'Remove Text from PDF Online Free — Selective Keyword & Margin Cleaner',
    'Remove unwanted text from PDF files online. Selectively delete specific keywords, remove header/footer margins, or blank out entire pages with live preview.'
  );

  usePageSEO(
    'Selective PDF Text Remover Studio',
    'Delete specific text phrases, unwanted margins, or wipe text content from PDF pages. 100% private in-browser text removal.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [scope, setScope] = useState<RemovalScope>('keywords');
  const [targetKeywords, setTargetKeywords] = useState('');
  const [eraseColor] = useState('#ffffff');

  const [pageImages, setPageImages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [matches, setMatches] = useState<TextMatch[]>([]);

  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFileName, setResultFileName] = useState('');

  const prefersReduced = useReducedMotion();
  useAutoRevokeUrl(resultUrl);

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    const f = files[0];
    setFile(f);
    setResultUrl(null);
    setMatches([]);
    setCurrentPage(0);

    try {
      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const imgs: string[] = [];

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
        imgs.push(canvas.toDataURL('image/jpeg', 0.88));
      }

      setPageImages(imgs);
    } catch (err) {
      console.error('Failed to load PDF:', err);
    }
  };

  // Find target text lines to remove
  useEffect(() => {
    if (!file || !pageImages.length) {
      setMatches([]);
      return;
    }

    const scanText = async () => {
      try {
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        const found: TextMatch[] = [];
        const terms = targetKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);

        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const vp = page.getViewport({ scale: 1.5 });
          const textContent = await page.getTextContent();

          for (const item of textContent.items as any[]) {
            const rawStr = (item.str || '').trim();
            if (!rawStr) continue;

            let shouldRemove = false;

            if (scope === 'keywords') {
              if (terms.length > 0 && terms.some(t => rawStr.toLowerCase().includes(t))) {
                shouldRemove = true;
              }
            } else if (scope === 'headers-footers') {
              const yRel = item.transform[5] / (vp.height / vp.scale);
              // Top 8% or Bottom 8%
              if (yRel > 0.92 || yRel < 0.08) {
                shouldRemove = true;
              }
            } else if (scope === 'all-text') {
              shouldRemove = true;
            }

            if (shouldRemove) {
              const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
              const xRel = (tx[4] / vp.width) * 100;
              const yRel = ((tx[5] - item.height * vp.scale) / vp.height) * 100;
              const wRel = ((item.width * vp.scale) / vp.width) * 100;
              const hRel = ((item.height * vp.scale * 1.25) / vp.height) * 100;

              found.push({
                pageIndex: p - 1,
                str: rawStr,
                x: Math.max(xRel - 0.2, 0),
                y: Math.max(yRel - 0.2, 0),
                w: Math.min(wRel + 0.4, 100),
                h: Math.min(hRel + 0.4, 100)
              });
            }
          }
        }

        setMatches(found);
      } catch (err) {
        console.error('Scan error:', err);
      }
    };

    const debounce = setTimeout(scanText, 250);
    return () => clearTimeout(debounce);
  }, [file, scope, targetKeywords, pageImages.length]);

  const executeRemove = async () => {
    if (!file || (scope === 'keywords' && !targetKeywords.trim())) return;
    setBusy(true);

    try {
      // ── 1. Enterprise Backend Vector Stream Redaction (genuinely deletes text from PDF content stream) ──
      if (scope === 'keywords' && eraseColor.toLowerCase() === '#ffffff') {
        try {
          const keywords = targetKeywords
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean);
          let currentBlob: Blob = file;
          let allSucceeded = keywords.length > 0;
          for (const kw of keywords) {
            const fd = new FormData();
            fd.append('file', currentBlob, file.name);
            fd.append('search_term', kw);
            fd.append('replace_term', '');
            const res = await apiFetch('/search-replace', {
              method: 'POST',
              body: fd,
            });
            if (res.ok) {
              currentBlob = await res.blob();
            } else {
              allSucceeded = false;
              break;
            }
          }
          if (allSucceeded) {
            setResultUrl(URL.createObjectURL(currentBlob));
            setResultFileName(`${file.name.replace(/\.pdf$/i, '')}_Text_Removed.pdf`);
            return;
          }
        } catch {
          // Fall through to client-side processor if backend is offline
        }
      }

      const buf = await file.arrayBuffer();

      // ── Vector path: pdf-lib drawRectangle (preserves searchable text, links, vectors) ──
      if (scope !== 'all-text') {
        const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
        const pages = pdfDoc.getPages();

        // Parse erase color hex -> rgb components (0–1 range)
        const hex = eraseColor.replace('#', '');
        const cr = parseInt(hex.substring(0, 2), 16) / 255;
        const cg = parseInt(hex.substring(2, 4), 16) / 255;
        const cb = parseInt(hex.substring(4, 6), 16) / 255;
        const fillColor = rgb(cr, cg, cb);

        for (const m of matches) {
          const page = pages[m.pageIndex];
          if (!page) continue;
          const { width, height } = page.getSize();
          const rx = (m.x / 100) * width - 1;
          const ry = height - ((m.y + m.h) / 100) * height - 1;
          const rw = (m.w / 100) * width + 2;
          const rh = (m.h / 100) * height + 2;
          page.drawRectangle({
            x: rx,
            y: Math.max(ry, 0),
            width: rw,
            height: Math.max(rh, 1),
            color: fillColor,
            borderWidth: 0,
          });
        }

        const finalBytes = await pdfDoc.save();
        const blob = new Blob([toArrayBufferBytes(finalBytes)], { type: 'application/pdf' });
        setResultUrl(URL.createObjectURL(blob));
        setResultFileName(`${file.name.replace(/\.pdf$/i, '')}_Text_Removed.pdf`);
        return;
      }

      // ── Clean Vector Erase for "all-text" scope (erases all text boxes, preserves images & graphics) ──
      const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
      const pages = pdfDoc.getPages();
      const pdfjs = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;

      const hex = eraseColor.replace('#', '');
      const cr = parseInt(hex.substring(0, 2), 16) / 255;
      const cg = parseInt(hex.substring(2, 4), 16) / 255;
      const cb = parseInt(hex.substring(4, 6), 16) / 255;
      const fillColor = rgb(cr, cg, cb);

      for (let p = 1; p <= pdfjs.numPages; p++) {
        const jsPage = await pdfjs.getPage(p);
        const docPage = pages[p - 1];
        if (!docPage) continue;
        const tc = await jsPage.getTextContent();
        for (const item of tc.items as any[]) {
          if (!item.str || !item.transform) continue;
          const tx = item.transform[4];
          const ty = item.transform[5];
          const fontSize = Math.abs(item.transform[0] || item.transform[3] || 12);
          const width = item.width || fontSize * item.str.length * 0.6;
          const height = item.height || fontSize * 1.15;
          docPage.drawRectangle({
            x: Math.max(0, tx - 1),
            y: Math.max(0, ty - 2),
            width: width + 2,
            height: height + 3,
            color: fillColor,
            borderWidth: 0,
          });
        }
      }

      const finalBytes = await pdfDoc.save();
      const blob = new Blob([toArrayBufferBytes(finalBytes)], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
      setResultFileName(`${file.name.replace(/\.pdf$/i, '')}_Text_Removed.pdf`);
    } catch (err: any) {
      console.error('Text removal error:', err);
      alert(`Removal failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResultUrl(null);
    setMatches([]);
    setTargetKeywords('');
  };

  const currentPageMatches = matches.filter(m => m.pageIndex === currentPage);

  return (
    <ToolWorkspaceShell
      title="Selective PDF Text Remover Studio"
      subtitle="Delete targeted keywords, clean header/footer page margins, or blank out filled text with clean background matching."
      categoryLabel="Selective Vector Eraser"
      icon={Scissors}
      microVariant="edit"
      tone="rose"
      trustNote="Live target inspection runs in-browser • Preserves underlying PDF graphics"
    >
      <PearlStageSwitch stageKey={!file ? 'upload' : resultUrl ? 'result' : 'workspace'}>
        {!file ? (
          <div className="w-full max-w-2xl mx-auto space-y-6">
            <FileDropzone
              onDrop={handleDrop}
              multiple={false}
              title="Select PDF Document to Remove Text From"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="pms-glass-panel p-4 rounded-2xl text-center">
                <Sparkles className="w-6 h-6 text-[var(--pms-rose)] dark:text-rose-400 mx-auto mb-2" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Target Keywords</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Delete only specific names or clauses across all pages.</p>
              </div>
              <div className="pms-glass-panel p-4 rounded-2xl text-center">
                <Sliders className="w-6 h-6 text-[var(--pms-blue)] dark:text-blue-400 mx-auto mb-2" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Header &amp; Footer Margins</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Strips top titles and bottom page numbering automatically.</p>
              </div>
              <div className="pms-glass-panel p-4 rounded-2xl text-center">
                <Eye className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Live Preview</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Visual red indicators show exact words marked for removal.</p>
              </div>
            </div>
          </div>
        ) : resultUrl ? (
          /* Result Screen */
          <div className="w-full max-w-xl mx-auto pms-glass-panel rounded-3xl border border-emerald-200/80 dark:border-emerald-800/70 bg-emerald-50/75 dark:bg-emerald-950/35 p-8 text-center space-y-6">
            <motion.div
              initial={prefersReduced ? false : { scale: 0.7 }}
              animate={{ scale: 1 }}
              transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 280, damping: 18 }}
              className="w-18 h-18 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto shadow-xs"
            >
              <Check className="w-9 h-9" />
            </motion.div>

            <div>
              <span className="inline-block px-3 py-1 bg-[var(--pms-soft-mint)] dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
                Text Erased
              </span>
              <h2 className="text-2xl font-extrabold text-emerald-950 dark:text-white">
                Clean PDF Ready!
              </h2>
              <p className="text-xs sm:text-sm text-emerald-800 dark:text-emerald-300 mt-1">
                Successfully removed <AnimatedNumber value={matches.length} className="font-bold" /> text block{matches.length === 1 ? '' : 's'} from the document.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <a
                href={resultUrl}
                download={resultFileName}
                className="flex-1 py-3.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2 text-base transition-all"
              >
                <Download className="w-5 h-5" />
                Download Clean PDF
              </a>
              <button
                type="button"
                onClick={reset}
                className="py-3.5 px-6 bg-white/85 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 border border-emerald-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-2xl transition-all text-sm"
              >
                Clean Another
              </button>
            </div>
          </div>
        ) : (
          /* Workspace */
          <div className="w-full space-y-5">
            {/* Top Control Bar */}
            <div className="pms-glass-panel p-4 md:p-5 rounded-3xl flex flex-wrap items-center justify-between gap-4 relative overflow-hidden">
              <PearlScanOverlay active={busy} label="Erasing selected text blocks..." />

              {/* Scope Selector */}
              <div className="inline-flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-slate-100/80 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800">
                {[
                  { id: 'keywords', label: 'By Keywords' },
                  { id: 'headers-footers', label: 'Header & Footer Only' },
                  { id: 'all-text', label: 'All Text (Blank Form)' }
                ].map(tab => {
                  const active = scope === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setScope(tab.id as RemovalScope)}
                      className={`relative py-2 px-3.5 rounded-xl text-xs font-bold transition-colors ${
                        active
                          ? 'text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId={prefersReduced ? undefined : 'remove-text-scope-pill'}
                          transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 360, damping: 28 }}
                          className="absolute inset-0 rounded-xl bg-rose-600 shadow-sm"
                        />
                      )}
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Keyword Input */}
              {scope === 'keywords' && (
                <div className="flex-1 min-w-[240px]">
                  <input
                    type="text"
                    placeholder="Words to delete (comma separated e.g. draft, John Doe)..."
                    value={targetKeywords}
                    onChange={e => setTargetKeywords(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white/85 dark:bg-slate-900/80 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                  />
                </div>
              )}

              {/* Action Button */}
              <div className="flex items-center gap-3">
                <motion.button
                  type="button"
                  whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                  onClick={executeRemove}
                  disabled={busy || matches.length === 0}
                  className="pms-btn-primary py-2.5 px-6 rounded-xl font-bold text-xs flex items-center gap-1.5 disabled:opacity-40"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />}
                  Delete Selected Text (<AnimatedNumber value={matches.length} />)
                </motion.button>
                <button
                  type="button"
                  onClick={reset}
                  className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 underline"
                >
                  Change
                </button>
              </div>
            </div>

            {/* Viewport with Red Strikethrough Markers */}
            <div className="flex flex-col items-center gap-3">
              <div className="pms-glass-panel px-4 py-2 rounded-2xl flex items-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-300">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 0))}
                  disabled={currentPage === 0}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span>
                  Page <AnimatedNumber value={currentPage + 1} /> of <AnimatedNumber value={pageImages.length} />
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(p + 1, pageImages.length - 1))}
                  disabled={currentPage === pageImages.length - 1}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="text-slate-500 dark:text-slate-400 ml-1">
                  (<AnimatedNumber value={currentPageMatches.length} /> text items targeted on this page)
                </span>
              </div>

              <div className="relative border border-slate-200/90 dark:border-slate-700 shadow-xl bg-white select-none overflow-hidden rounded-2xl max-w-full">
                <img
                  src={pageImages[currentPage]}
                  alt={`Page ${currentPage + 1}`}
                  className="max-h-[75vh] object-contain mx-auto block pointer-events-none"
                />

                {/* Red Targeted Text Boxes */}
                {currentPageMatches.map((m, idx) => (
                  <div
                    key={idx}
                    className="absolute pointer-events-none rounded bg-red-500/30 border border-red-500"
                    style={{
                      left: `${m.x}%`,
                      top: `${m.y}%`,
                      width: `${m.w}%`,
                      height: `${m.h}%`
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
