import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  BookOpen,
  Bookmark,
  StickyNote,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Clock,
  Sun,
  Trash2,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { hashStorageId } from '../lib/privacy';
import { triggerBlobDownload } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

type ReadingTheme = 'light' | 'dark' | 'sepia' | 'oled';

interface BookmarkItem {
  page: number;
  note: string;
  addedAt: string;
}

const LEGACY_STORAGE_KEY = (name: string) => `pdf_study_tracker_${name}`;

export default function ReadingTracker() {
  useSEO(
    'PDF Reading Progress Tracker & E-Reader Hub Online Free',
    'Track PDF reading progress with reading speed (WPM), time-remaining estimates, night/sepia reading themes, page bookmarks, and exportable study notes.'
  );

  usePageSEO(
    'PDF Reading Tracker & Study Hub Studio',
    'Comfortable browser-based PDF reader with progress tracking, reading speed analytics, bookmark notes, and dark/sepia eye-care themes.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [current, setCurrent] = useState<number>(0);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [noteText, setNoteText] = useState('');
  const [theme, setTheme] = useState<ReadingTheme>('light');
  const [wordCount, setWordCount] = useState<number>(0);
  const [wpm, setWpm] = useState<number>(200);

  const [busy, setBusy] = useState(false);
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const prefersReduced = useReducedMotion();

  const renderPage = useCallback(async (num: number) => {
    if (!pdfRef.current || !canvasRef.current) return;
    const page = await pdfRef.current.getPage(num + 1);
    const vp = page.getViewport({ scale: 1.4 });
    const canvas = canvasRef.current;
    canvas.width = vp.width;
    canvas.height = vp.height;
    const ctx = canvas.getContext('2d')!;

    // Background fill
    ctx.fillStyle = theme === 'dark' ? '#1e293b' : theme === 'sepia' ? '#fbf0d9' : theme === 'oled' ? '#000000' : '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

    // Apply color theme filter if needed
    if (theme === 'dark' || theme === 'oled') {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 255 - d[i];
        d[i + 1] = 255 - d[i + 1];
        d[i + 2] = 255 - d[i + 2];
      }
      ctx.putImageData(imgData, 0, 0);
    } else if (theme === 'sepia') {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        d[i] = Math.min(255, (r * 0.393) + (g * 0.769) + (b * 0.189) + 20);
        d[i + 1] = Math.min(255, (r * 0.349) + (g * 0.686) + (b * 0.168) + 15);
        d[i + 2] = Math.min(255, (r * 0.272) + (g * 0.534) + (b * 0.131));
      }
      ctx.putImageData(imgData, 0, 0);
    }

    // Estimate word count for speed analytics
    const textContent = await page.getTextContent();
    const words = textContent.items.map((i: any) => i.str || '').join(' ').split(/\s+/).filter(Boolean).length;
    setWordCount(words);
  }, [theme]);

  useEffect(() => {
    if (totalPages > 0) renderPage(current);
  }, [current, totalPages, renderPage]);

  // Load saved progress from localStorage (hashed key to avoid storing plaintext filenames)
  useEffect(() => {
    if (!file) {
      setStorageKey(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const digest = await hashStorageId(`${file.name}:${file.size}`);
      const nextKey = `pdf_study_tracker_${digest}`;
      const legacyKey = LEGACY_STORAGE_KEY(file.name);
      if (cancelled) return;

      let saved = localStorage.getItem(nextKey);
      if (!saved) {
        const legacySaved = localStorage.getItem(legacyKey);
        if (legacySaved) {
          saved = legacySaved;
          try {
            localStorage.setItem(nextKey, legacySaved);
            localStorage.removeItem(legacyKey);
          } catch {}
        }
      }
      setStorageKey(nextKey);
      if (saved) {
        try {
          const d = JSON.parse(saved);
          setCurrent(d.page || 0);
          setBookmarks(d.bookmarks || []);
        } catch {}
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Save progress automatically
  const saveProgress = useCallback(() => {
    if (!file || !storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify({ page: current, bookmarks }));
  }, [file, storageKey, current, bookmarks]);

  useEffect(() => {
    if (totalPages > 0) saveProgress();
  }, [current, bookmarks, saveProgress, totalPages]);

  const loadPdf = async (f: File) => {
    setFile(f);
    setBusy(true);
    try {
      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      pdfRef.current = pdf;
      setTotalPages(pdf.numPages);
      setCurrent(0);
    } catch (err: any) {
      alert(`Failed to load PDF: ${err?.message || 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const addBookmark = () => {
    const item: BookmarkItem = {
      page: current + 1,
      note: noteText.trim() || `Bookmark on Page ${current + 1}`,
      addedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setBookmarks(prev => [item, ...prev]);
    setNoteText('');
  };

  const removeBookmark = (idx: number) => {
    setBookmarks(prev => prev.filter((_, i) => i !== idx));
  };

  const exportStudyNotes = () => {
    const md = `# Study Notes & Bookmarks: ${file?.name}\n\n` +
      bookmarks.map(b => `### Page ${b.page} (${b.addedAt})\n${b.note}\n`).join('\n');
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    triggerBlobDownload(blob, `${file?.name.replace(/\.pdf$/i, '')}_Study_Notes.md`);
  };

  const percentRead = totalPages > 0 ? Math.round(((current + 1) / totalPages) * 100) : 0;
  const estimatedMinPerPage = wordCount > 0 ? Number((wordCount / wpm).toFixed(1)) : 1;
  const pagesRemaining = Math.max(0, totalPages - (current + 1));
  const estimatedTimeRemainingMin = Math.round(pagesRemaining * estimatedMinPerPage);

  const reset = () => {
    setFile(null);
    setStorageKey(null);
    setTotalPages(0);
    setCurrent(0);
    setBookmarks([]);
  };

  const readingThemes: { id: ReadingTheme; label: string }[] = [
    { id: 'light', label: 'Day' },
    { id: 'sepia', label: 'Sepia' },
    { id: 'dark', label: 'Dark' },
    { id: 'oled', label: 'OLED' },
  ];

  return (
    <ToolWorkspaceShell
      title="PDF Reading Tracker & Study Hub Studio"
      subtitle="Track your reading progress, calculate time remaining with reading speed (WPM), switch eye-care themes, and save study notes."
      categoryLabel="E-Reader & Study Hub"
      icon={BookOpen}
      microVariant="generic"
      tone="blue"
      trustNote="100% client-side reader · Private hashed bookmark storage · Zero uploads"
    >
      {!file ? (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className="w-full max-w-2xl mx-auto space-y-6"
        >
          <FileDropzone
            onDrop={files => files[0] && loadPdf(files[0])}
            multiple={false}
            title="Select PDF Document to Read & Track"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {[
              {
                icon: Clock,
                iconCls: 'text-[var(--pms-blue)] bg-[var(--pms-soft-blue)]',
                title: 'Time Estimator',
                desc: 'Calculates reading time left based on your personal reading WPM.',
              },
              {
                icon: Sun,
                iconCls: 'text-amber-600 dark:text-amber-400 bg-[var(--pms-soft-rose)]',
                title: 'Eye-Care Themes',
                desc: 'Includes Kindle-style Sepia, Dark Night, and OLED black modes.',
              },
              {
                icon: StickyNote,
                iconCls: 'text-emerald-600 dark:text-emerald-400 bg-[var(--pms-soft-mint)]',
                title: 'Study Notes Export',
                desc: 'Export page bookmarks and study notes to Markdown summaries.',
              },
            ].map((card, idx) => (
              <motion.div
                key={card.title}
                initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.26, delay: idx * 0.05 }}
                whileHover={prefersReduced ? undefined : { y: -3 }}
                className="pms-glass-panel p-5 rounded-2xl text-center"
              >
                <div className={`w-10 h-10 rounded-xl ${card.iconCls} flex items-center justify-center mx-auto mb-2.5`}>
                  <card.icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">{card.title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{card.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      ) : busy ? (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          className="relative max-w-xl mx-auto p-12 text-center pms-glass-panel rounded-3xl space-y-4 overflow-hidden"
        >
          <PearlScanOverlay active={true} label="Opening PDF reading stream…" />
          <Loader2 className="w-10 h-10 animate-spin text-[var(--pms-blue)] mx-auto" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Opening PDF Reading Stream...</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Restoring bookmarks and saved progress...</p>
        </motion.div>
      ) : (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className="w-full space-y-5"
        >
          {/* Top Control Bar with Analytics */}
          <div className="pms-glass-panel p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4">
            {/* Reading Stats */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold text-[var(--pms-blue)] bg-[var(--pms-soft-blue)] px-3 py-1.5 rounded-full border border-[var(--pms-border)]">
                <AnimatedNumber value={percentRead} suffix="%" /> Completed
              </span>
              <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                ~<AnimatedNumber value={estimatedTimeRemainingMin} /> min remaining ({pagesRemaining} pages left)
              </span>
              <select
                value={wpm}
                onChange={e => setWpm(Number(e.target.value))}
                className="px-2.5 py-1 rounded-xl text-xs font-semibold border border-[var(--pms-border)] bg-white/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 outline-none"
                aria-label="Reading speed (WPM)"
              >
                <option value={150}>150 WPM (Careful)</option>
                <option value={200}>200 WPM (Normal)</option>
                <option value={250}>250 WPM (Fast)</option>
                <option value={300}>300 WPM (Skim)</option>
              </select>
            </div>

            {/* Eye-Care Themes */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mr-1">Theme:</span>
              {readingThemes.map(t => {
                const active = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className="relative py-1.5 px-3 rounded-xl border text-xs font-bold transition-colors cursor-pointer overflow-hidden"
                    style={{
                      borderColor: active ? 'var(--pms-blue)' : 'var(--pms-border)',
                      backgroundColor: active ? 'var(--pms-soft-blue)' : 'var(--pms-white)',
                      color: active ? 'var(--pms-blue)' : 'var(--pms-ink)',
                    }}
                  >
                    {active && (
                      <motion.span
                        layoutId="reading-theme-pill"
                        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                        className="absolute inset-0 rounded-xl ring-2 ring-sky-500/30 pointer-events-none"
                      />
                    )}
                    <span className="relative z-10">{t.label}</span>
                  </button>
                );
              })}
              <button
                onClick={reset}
                className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 ml-2 cursor-pointer transition-colors"
              >
                Change
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Main Reader Canvas */}
            <div className="lg:col-span-8 pms-glass-panel rounded-3xl p-4 sm:p-5 flex flex-col items-center gap-3">
              {/* Page Navigator */}
              <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-300">
                <button
                  onClick={() => setCurrent(p => Math.max(p - 1, 0))}
                  disabled={current === 0}
                  className="p-2 rounded-xl border border-[var(--pms-border)] bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span>Page {current + 1} of {totalPages}</span>
                <button
                  onClick={() => setCurrent(p => Math.min(p + 1, totalPages - 1))}
                  disabled={current === totalPages - 1}
                  className="p-2 rounded-xl border border-[var(--pms-border)] bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="px-2.5 py-1 rounded-full bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] text-[11px] font-bold">
                  <AnimatedNumber value={wordCount} /> words on this page
                </span>
              </div>

              {/* Document Canvas (Crisp bg-white for Day theme) */}
              <div
                className={`p-4 rounded-2xl border shadow-xl flex items-center justify-center overflow-hidden max-w-full ${
                  theme === 'dark'
                    ? 'bg-slate-900 border-slate-800'
                    : theme === 'sepia'
                    ? 'bg-[#fbf0d9] border-[#e8d5b5]'
                    : theme === 'oled'
                    ? 'bg-black border-slate-900'
                    : 'bg-white border-slate-200'
                }`}
              >
                <canvas ref={canvasRef} className="shadow-lg max-h-[75vh] object-contain rounded" />
              </div>
            </div>

            {/* Study Notes & Bookmarks Sidebar */}
            <div className="lg:col-span-4 pms-glass-panel p-5 rounded-3xl space-y-4 max-h-[85vh] overflow-y-auto">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-[var(--pms-blue)]" />
                Study Notes &amp; Bookmarks (<AnimatedNumber value={bookmarks.length} />)
              </h3>

              {/* Add Note Input */}
              <div className="space-y-2.5 border-b border-[var(--pms-border)] pb-4">
                <textarea
                  rows={2}
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder={`Add a note for Page ${current + 1}...`}
                  className="w-full p-3 text-xs rounded-xl border border-[var(--pms-border)] bg-white/90 dark:bg-slate-800/80 text-slate-900 dark:text-white outline-none resize-none focus:ring-2 focus:ring-sky-400"
                />
                <motion.button
                  whileHover={prefersReduced ? undefined : { scale: 1.01 }}
                  whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                  onClick={addBookmark}
                  className="w-full pms-btn-primary py-2.5 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <StickyNote className="w-3.5 h-3.5" />
                  Save Note for Page {current + 1}
                </motion.button>
              </div>

              {/* Bookmark List */}
              {bookmarks.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No bookmarks yet. Add study notes above!</p>
              ) : (
                <div className="space-y-2.5">
                  {bookmarks.map((b, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-white/75 dark:bg-slate-800/60 rounded-xl border border-[var(--pms-border)] text-xs space-y-1 group"
                    >
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => setCurrent(b.page - 1)}
                          className="font-bold text-[var(--pms-blue)] hover:underline cursor-pointer"
                        >
                          Page {b.page}
                        </button>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400">{b.addedAt}</span>
                          <button
                            onClick={() => removeBookmark(idx)}
                            className="text-rose-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            aria-label="Delete bookmark"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{b.note}</p>
                    </div>
                  ))}

                  <button
                    onClick={exportStudyNotes}
                    className="w-full mt-2 py-2.5 bg-[var(--pms-soft-blue)] hover:brightness-95 text-[var(--pms-blue)] border border-[var(--pms-border)] font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export Study Notes (.md)
                  </button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </ToolWorkspaceShell>
  );
}
