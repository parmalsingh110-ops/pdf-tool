import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  BookOpen, Bookmark, StickyNote, ChevronLeft, ChevronRight, Download, 
  Loader2, FileText, X, Clock, Sun, Moon, Sparkles, Maximize2, Trash2, Check, Copy
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

type ReadingTheme = 'light' | 'dark' | 'sepia' | 'oled';

interface BookmarkItem {
  page: number;
  note: string;
  addedAt: string;
}

const STORAGE_KEY = (name: string) => `pdf_study_tracker_${name}`;

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

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

  // Load saved progress from localStorage
  useEffect(() => {
    if (file) {
      const saved = localStorage.getItem(STORAGE_KEY(file.name));
      if (saved) {
        try {
          const d = JSON.parse(saved);
          setCurrent(d.page || 0);
          setBookmarks(d.bookmarks || []);
        } catch {}
      }
    }
  }, [file]);

  // Save progress automatically
  const saveProgress = useCallback(() => {
    if (!file) return;
    localStorage.setItem(STORAGE_KEY(file.name), JSON.stringify({ page: current, bookmarks }));
  }, [file, current, bookmarks]);

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
      addedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${file?.name.replace(/\.pdf$/i, '')}_Study_Notes.md`;
    a.click();
  };

  const percentRead = totalPages > 0 ? Math.round(((current + 1) / totalPages) * 100) : 0;
  const estimatedMinPerPage = wordCount > 0 ? Number((wordCount / wpm).toFixed(1)) : 1;
  const pagesRemaining = Math.max(0, totalPages - (current + 1));
  const estimatedTimeRemainingMin = Math.round(pagesRemaining * estimatedMinPerPage);

  const reset = () => {
    setFile(null);
    setTotalPages(0);
    setBookmarks([]);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-4 sm:p-8 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm border border-blue-100 dark:border-blue-900/50">
          <BookOpen className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-2">
          PDF Reading Tracker & Study Hub Studio
        </h1>
        <p className="text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          Track your reading progress, calculate time remaining with reading speed (WPM), switch eye-care themes, and save study notes.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl space-y-6">
          <FileDropzone 
            onDrop={files => files[0] && loadPdf(files[0])} 
            multiple={false} 
            title="Select PDF Document to Read & Track" 
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Clock className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Time Estimator</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Calculates reading time left based on your personal reading WPM.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Sun className="w-6 h-6 text-amber-600 dark:text-amber-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Eye-Care Themes</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Includes Kindle-style Sepia, Dark Night, and OLED black modes.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <StickyNote className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Study Notes Export</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Export page bookmarks and study notes to Markdown summaries.</p>
            </div>
          </div>
        </div>
      ) : busy ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Opening PDF Reading Stream...</h3>
          <p className="text-xs text-slate-500">Restoring bookmarks and saved progress...</p>
        </div>
      ) : (
        /* E-Reader Workspace */
        <div className="w-full space-y-4">
          {/* Top Control Bar with Analytics */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
            {/* Reading Stats */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-3 py-1 rounded-full">
                {percentRead}% Completed
              </span>
              <span className="text-xs text-slate-500">
                ~{estimatedTimeRemainingMin} min remaining ({pagesRemaining} pages left)
              </span>
            </div>

            {/* Eye-Care Themes */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 mr-1">Theme:</span>
              {[
                { id: 'light', label: 'Day' },
                { id: 'sepia', label: 'Sepia' },
                { id: 'dark', label: 'Dark' },
                { id: 'oled', label: 'OLED' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id as ReadingTheme)}
                  className={`py-1 px-3 rounded-lg text-xs font-bold transition-all ${
                    theme === t.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {t.label}
                </button>
              ))}
              <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600 underline ml-2">Change</button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Main Reader Canvas */}
            <div className="lg:col-span-8 flex flex-col items-center gap-3">
              {/* Page Navigator */}
              <div className="flex items-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-400">
                <button
                  onClick={() => setCurrent(p => Math.max(p - 1, 0))}
                  disabled={current === 0}
                  className="p-1.5 rounded-lg border hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span>Page {current + 1} of {totalPages}</span>
                <button
                  onClick={() => setCurrent(p => Math.min(p + 1, totalPages - 1))}
                  disabled={current === totalPages - 1}
                  className="p-1.5 rounded-lg border hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="text-slate-400 ml-2">({wordCount} words on this page)</span>
              </div>

              {/* Document Canvas */}
              <div className={`p-4 rounded-2xl border shadow-xl flex items-center justify-center overflow-hidden max-w-full ${
                theme === 'dark' ? 'bg-slate-900 border-slate-800' :
                theme === 'sepia' ? 'bg-[#fbf0d9] border-[#e8d5b5]' :
                theme === 'oled' ? 'bg-black border-slate-900' : 'bg-slate-50 border-slate-200'
              }`}>
                <canvas ref={canvasRef} className="shadow-lg max-h-[75vh] object-contain rounded" />
              </div>
            </div>

            {/* Study Notes & Bookmarks Sidebar */}
            <div className="lg:col-span-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 max-h-[85vh] overflow-y-auto">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-blue-600" />
                Study Notes & Bookmarks ({bookmarks.length})
              </h3>

              {/* Add Note Input */}
              <div className="space-y-2 border-b pb-4 dark:border-slate-800">
                <textarea
                  rows={2}
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder={`Add a note for Page ${current + 1}...`}
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none resize-none"
                />
                <button
                  onClick={addBookmark}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
                >
                  <StickyNote className="w-3.5 h-3.5" />
                  Save Note for Page {current + 1}
                </button>
              </div>

              {/* Bookmark List */}
              {bookmarks.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No bookmarks yet. Add study notes above!</p>
              ) : (
                <div className="space-y-2.5">
                  {bookmarks.map((b, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 text-xs space-y-1 group"
                    >
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => setCurrent(b.page - 1)}
                          className="font-bold text-blue-600 hover:underline"
                        >
                          Page {b.page}
                        </button>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400">{b.addedAt}</span>
                          <button
                            onClick={() => removeBookmark(idx)}
                            className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
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
                    className="w-full mt-2 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export Study Notes (.md)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
