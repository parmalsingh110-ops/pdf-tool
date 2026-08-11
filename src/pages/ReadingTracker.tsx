import { useState, useEffect, useRef, useCallback } from "react";
import { BookOpen, Bookmark, StickyNote, ChevronLeft, ChevronRight, Save, Download, Loader2, FileText, X } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import "../lib/pdfWorker";
import FileDropzone from "../components/FileDropzone";
import { usePageSEO } from "../lib/usePageSEO";

interface BookmarkItem { page: number; note: string; addedAt: string; }

const STORAGE_KEY = (name: string) => `pdf_tracker_${name}`;

export default function ReadingTracker() {
  usePageSEO("PDF Reading Progress Tracker", "Track your reading progress in any PDF. Add bookmarks and notes per page, resume where you left off. Free browser-based reader.");
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  const renderPage = useCallback(async (num: number) => {
    if (!pdfRef.current || !canvasRef.current) return;
    const page = await pdfRef.current.getPage(num + 1);
    const vp = page.getViewport({ scale: 1.2 });
    const canvas = canvasRef.current;
    canvas.width = vp.width; canvas.height = vp.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
  }, []);

  useEffect(() => { if (pages.length) renderPage(current); }, [current, pages.length, renderPage]);

  useEffect(() => {
    if (file) {
      const saved = localStorage.getItem(STORAGE_KEY(file.name));
      if (saved) { try { const d = JSON.parse(saved); setCurrent(d.page || 0); setBookmarks(d.bookmarks || []); } catch {} }
    }
  }, [file]);

  const save = useCallback(() => {
    if (!file) return;
    localStorage.setItem(STORAGE_KEY(file.name), JSON.stringify({ page: current, bookmarks }));
  }, [file, current, bookmarks]);

  useEffect(() => { if (pages.length) save(); }, [current, bookmarks, save, pages.length]);

  const load = async (f: File) => {
    setBusy(true);
    try {
      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      pdfRef.current = pdf;
      setPages(Array.from({ length: pdf.numPages }, (_, i) => String(i + 1)));
      setFile(f);
    } catch (e: any) { alert(e?.message || "Load failed."); }
    finally { setBusy(false); }
  };

  const addBookmark = () => {
    if (!note.trim()) return;
    setBookmarks(prev => [...prev, { page: current + 1, note: note.trim(), addedAt: new Date().toLocaleString() }]);
    setNote(""); setShowNote(false);
  };

  const removeBookmark = (i: number) => setBookmarks(prev => prev.filter((_, idx) => idx !== i));

  const exportNotes = () => {
    if (!bookmarks.length || !file) return;
    const txt = `PDF: ${file.name}\nReading Notes\n${"=".repeat(50)}\n\n` + bookmarks.map(b => `Page ${b.page} — ${b.addedAt}\n${b.note}`).join("\n\n---\n\n");
    const blob = new Blob([txt], { type: "text/plain" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = file.name.replace(/\.pdf$/i,"") + "_notes.txt"; a.click();
  };

  const progress = pages.length ? Math.round(((current + 1) / pages.length) * 100) : 0;

  if (!file) return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-orange-100 dark:bg-orange-950/40 rounded-2xl flex items-center justify-center mx-auto mb-4"><BookOpen className="w-8 h-8 text-orange-600 dark:text-orange-400" /></div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">Reading Progress Tracker</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400 max-w-xl mx-auto">Read any PDF with automatic progress saving, page bookmarks, and note-taking. Resumes where you left off.</p>
      </div>
      {busy ? <div className="flex items-center gap-3 text-gray-600 dark:text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /><span>Loading PDF…</span></div> : <FileDropzone onDrop={f => { if(f[0]) load(f[0]); }} multiple={false} />}
    </div>
  );

  return (
    <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full p-4">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-5 h-5 text-orange-600 shrink-0" />
          <span className="font-semibold text-gray-900 dark:text-white text-sm truncate max-w-xs">{file.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowNote(!showNote)} className="flex items-center gap-1 px-3 py-1.5 bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 rounded-lg text-sm font-medium hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors"><StickyNote className="w-4 h-4" />Note</button>
          <button onClick={() => setShowBookmarks(!showBookmarks)} className="flex items-center gap-1 px-3 py-1.5 bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 rounded-lg text-sm font-medium hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors"><Bookmark className="w-4 h-4" />{bookmarks.length}</button>
          {bookmarks.length > 0 && <button onClick={exportNotes} className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"><Download className="w-4 h-4" />Export</button>}
          <button onClick={() => { setFile(null); setPages([]); setCurrent(0); setBookmarks([]); pdfRef.current?.destroy(); }} className="p-1.5 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-500 hover:text-red-500 transition-colors"><X className="w-4 h-4" /></button>
        </div>
      </div>
      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 bg-gray-200 dark:bg-slate-700 rounded-full h-2.5"><div className="h-2.5 bg-orange-500 rounded-full transition-all" style={{ width: `${progress}%` }} /></div>
        <span className="text-xs font-bold text-orange-600 dark:text-orange-400 shrink-0">{progress}% — Pg {current + 1}/{pages.length}</span>
      </div>
      {/* Add note panel */}
      {showNote && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-3">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">Add note for page {current + 1}</p>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Your note…" className="w-full text-sm p-2 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-lg resize-none text-gray-900 dark:text-white" />
          <div className="flex gap-2 mt-2">
            <button onClick={addBookmark} disabled={!note.trim()} className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors flex items-center gap-1"><Save className="w-3.5 h-3.5" />Save Note</button>
            <button onClick={() => { setNote(""); setShowNote(false); }} className="px-4 py-1.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors">Cancel</button>
          </div>
        </div>
      )}
      {/* Bookmarks panel */}
      {showBookmarks && bookmarks.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-4 mb-3 max-h-40 overflow-y-auto space-y-2">
          {bookmarks.map((b, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <button onClick={() => setCurrent(b.page - 1)} className="font-bold text-orange-600 dark:text-orange-400 shrink-0 hover:underline">Pg {b.page}</button>
              <span className="flex-1 text-gray-700 dark:text-slate-300 truncate">{b.note}</span>
              <button onClick={() => removeBookmark(i)} className="text-gray-400 hover:text-red-500 shrink-0"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}
      {/* Canvas */}
      <div className="flex-1 flex items-center justify-center overflow-auto bg-gray-100 dark:bg-slate-800 rounded-2xl p-2">
        <canvas ref={canvasRef} className="max-w-full shadow-lg rounded" />
      </div>
      {/* Navigation */}
      <div className="flex items-center justify-center gap-4 mt-3">
        <button onClick={() => setCurrent(p => Math.max(0, p - 1))} disabled={current === 0} className="flex items-center gap-1 px-5 py-2.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"><ChevronLeft className="w-5 h-5" />Prev</button>
        <span className="text-sm text-gray-500 dark:text-slate-400">Page {current + 1} of {pages.length}</span>
        <button onClick={() => setCurrent(p => Math.min(pages.length - 1, p + 1))} disabled={current === pages.length - 1} className="flex items-center gap-1 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-semibold disabled:opacity-40 transition-colors">Next<ChevronRight className="w-5 h-5" /></button>
      </div>
    </div>
  );
}
