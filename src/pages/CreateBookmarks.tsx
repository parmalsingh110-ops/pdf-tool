import { useState } from 'react';
import { Download, FileText, CheckCircle2, Eye, Loader2, Bookmark, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { PDFDocument, PDFName, PDFDict, PDFRef, PDFNumber, PDFHexString } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { useToast } from '../components/Toast';

interface BookmarkEntry {
  id: string;
  title: string;
  page: number; // 1-based
}

export default function CreateBookmarks() {
  useSEO(
    'Create PDF Bookmarks Online Free — Add Table of Contents Outline | PDF Media Suite',
    'Add and edit PDF bookmarks and Table of Contents outlines online free. Create clickable navigation bookmarks for PDF readers with live page preview.'
  );

  usePageSEO(
    'Create PDF Bookmarks — Add & Edit Table of Contents Outline',
    'Build native PDF outline bookmarks. Create clickable chapter links, rename sections, and organize document navigation trees.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageCount, setPageCount] = useState(0);

  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newPage, setNewPage] = useState(1);

  // Live Canvas Preview of selected bookmark's target page
  const [previewPage, setPreviewPage] = useState<number>(1);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState('');

  const prefersReduced = useReducedMotion();
  const toast = useToast();

  useAutoRevokeUrl(resultUrl);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    const f = acceptedFiles[0];
    setFile(f);
    setResultUrl(null);
    setBusy(true);

    try {
      const ab = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
      setPageCount(pdf.numPages);
      setNewPage(1);

      // Check if document already has bookmarks outline
      const existingOutline = await pdf.getOutline();
      if (existingOutline && existingOutline.length > 0) {
        const parsed: BookmarkEntry[] = [];
        for (const item of existingOutline) {
          let destPage = 1;
          if (item.dest) {
            try {
              let destRef: any = item.dest;
              if (typeof destRef === 'string') {
                destRef = await pdf.getDestination(destRef);
              }
              if (Array.isArray(destRef)) {
                const pageIndex = await pdf.getPageIndex(destRef[0]);
                destPage = pageIndex + 1;
              }
            } catch {}
          }
          parsed.push({
            id: `bm-${Date.now()}-${Math.random()}`,
            title: item.title || 'Untitled Bookmark',
            page: destPage,
          });
        }
        setBookmarks(parsed);
      } else {
        // Initial suggestion
        setBookmarks([
          { id: '1', title: 'Cover Page', page: 1 },
          { id: '2', title: 'Chapter 1', page: Math.min(2, pdf.numPages) },
        ]);
      }

      await renderPageThumb(pdf, 1);
    } catch (err: any) {
      toast.error('Could not load PDF: ' + (err?.message || 'Invalid file'));
      setFile(null);
    } finally {
      setBusy(false);
    }
  };

  const renderPageThumb = async (pdfDoc: pdfjsLib.PDFDocumentProxy, pageNum: number) => {
    setLoadingPreview(true);
    try {
      const page = await pdfDoc.getPage(pageNum);
      const vp = page.getViewport({ scale: 1 });
      const maxW = 400;
      const scale = Math.min(1.5, maxW / vp.width);
      const scaledVp = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = scaledVp.width;
      canvas.height = scaledVp.height;
      const ctx = canvas.getContext('2d')!;

      await page.render({ canvasContext: ctx, viewport: scaledVp, canvas }).promise;
      setPreviewDataUrl(canvas.toDataURL('image/jpeg', 0.85));
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handlePreviewPageChange = async (p: number) => {
    setPreviewPage(p);
    if (!file) return;
    const ab = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
    await renderPageThumb(pdf, p);
  };

  const addBookmark = () => {
    if (!newTitle.trim()) return;
    const item: BookmarkEntry = {
      id: `bm-${Date.now()}-${Math.random()}`,
      title: newTitle.trim(),
      page: Math.max(1, Math.min(pageCount, newPage)),
    };
    setBookmarks((prev) => [...prev, item]);
    setNewTitle('');
    setNewPage((p) => Math.min(pageCount, p + 1));
  };

  const removeBookmark = (id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  };

  const moveBookmark = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= bookmarks.length) return;
    const copy = [...bookmarks];
    const temp = copy[index];
    copy[index] = copy[target];
    copy[target] = temp;
    setBookmarks(copy);
  };

  const updateBookmark = (id: string, patch: Partial<BookmarkEntry>) => {
    setBookmarks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b))
    );
  };

  const generatePageByPage = () => {
    const list: BookmarkEntry[] = Array.from({ length: pageCount }, (_, i) => ({
      id: `bm-${i + 1}`,
      title: `Page ${i + 1}`,
      page: i + 1,
    }));
    setBookmarks(list);
    toast.success(`Generated bookmarks for all ${pageCount} pages!`);
  };

  const sortByPage = () => {
    setBookmarks((prev) => [...prev].sort((a, b) => a.page - b.page));
    toast.info('Bookmarks sorted by page number.');
  };

  const clearAll = () => {
    setBookmarks([]);
    toast.info('Cleared all bookmarks.');
  };

  const processSaveBookmarks = async () => {
    if (!file || bookmarks.length === 0) return;
    setBusy(true);

    try {
      const ab = await file.arrayBuffer();
      const doc = await PDFDocument.load(ab, { ignoreEncryption: true });
      const catalog = doc.catalog;
      const context = doc.context;

      // Create native /Outlines dictionary
      const outlineDict = context.obj({
        Type: 'Outlines',
      });
      const outlineRef = context.register(outlineDict);

      const itemRefs: PDFRef[] = [];
      const totalPages = doc.getPageCount();

      for (let i = 0; i < bookmarks.length; i++) {
        const b = bookmarks[i];
        const pageIdx = Math.max(0, Math.min(totalPages - 1, b.page - 1));
        const targetPage = doc.getPage(pageIdx);
        const targetPageRef = targetPage.ref;

        const itemDict = context.obj({
          Title: PDFHexString.fromText(b.title),
          Parent: outlineRef,
          Dest: [targetPageRef, 'Fit'],
        });
        const itemRef = context.register(itemDict);
        itemRefs.push(itemRef);
      }

      // Link Prev and Next
      for (let i = 0; i < itemRefs.length; i++) {
        const itemDict = context.lookup(itemRefs[i]) as PDFDict;
        if (i > 0) itemDict.set(PDFName.of('Prev'), itemRefs[i - 1]);
        if (i < itemRefs.length - 1) itemDict.set(PDFName.of('Next'), itemRefs[i + 1]);
      }

      if (itemRefs.length > 0) {
        outlineDict.set(PDFName.of('First'), itemRefs[0]);
        outlineDict.set(PDFName.of('Last'), itemRefs[itemRefs.length - 1]);
        outlineDict.set(PDFName.of('Count'), PDFNumber.of(itemRefs.length));
      }

      catalog.set(PDFName.of('Outlines'), outlineRef);

      const outBytes = await doc.save();
      const blob = new Blob([toArrayBufferBytes(outBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultName(`${file.name.replace(/\.pdf$/i, '')}_with_bookmarks.pdf`);
      toast.success(`Saved ${bookmarks.length} bookmark(s) into PDF!`);
    } catch (e: any) {
      console.error(e);
      toast.error('Error saving bookmarks: ' + (e?.message || 'Unknown error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Create PDF Bookmarks"
      subtitle="Add, edit, and organize native PDF Table of Contents bookmarks so users can easily navigate chapters in Adobe Acrobat, Chrome, and any PDF viewer."
      categoryLabel="Native PDF Outline & Table of Contents Editor"
      icon={Bookmark}
      microVariant="edit"
      tone="sky"
      trustNote="Outline editing runs 100% locally in your browser"
    >
      <div className="space-y-10">
        <PearlStageSwitch stageKey={!file ? 'upload' : 'editor'}>
          {!file ? (
            <div className="max-w-2xl mx-auto">
              <FileDropzone
                onDrop={handleDrop}
                accept={{ 'application/pdf': ['.pdf'] }}
                multiple={false}
                title="Upload PDF to Add Bookmarks"
                subtitle="Drop document to create or edit Table of Contents outline"
              />
            </div>
          ) : (
            <div className="max-w-5xl mx-auto space-y-8">
              {/* Editor Container */}
              <div className="pms-glass-panel rounded-3xl p-6 md:p-7 relative overflow-hidden">
                <PearlScanOverlay active={busy} label="Writing native PDF outline tree..." />

                <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-200/70 dark:border-slate-800/80">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-[var(--pms-soft-blue)] dark:bg-sky-950/50 text-[var(--pms-blue)] dark:text-sky-400">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-slate-100">{file.name}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                        <span><AnimatedNumber value={pageCount} /> pages</span>
                        <span>•</span>
                        <span><AnimatedNumber value={bookmarks.length} /> bookmarks configured</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={generatePageByPage}
                      className="px-3.5 py-2 text-xs font-semibold text-sky-700 dark:text-sky-300 bg-[var(--pms-soft-blue)] dark:bg-sky-950/50 border border-sky-200/70 dark:border-sky-800/60 rounded-xl hover:brightness-95 transition-all"
                    >
                      Auto-Generate Bookmark per Page
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        setResultUrl(null);
                      }}
                      className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors"
                    >
                      Change File
                    </button>
                  </div>
                </div>

                {/* Add Bookmark Row */}
                <div className="pt-6 pb-5 flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                      Bookmark Title
                    </label>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addBookmark()}
                      placeholder="e.g. Chapter 1: Introduction"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200/90 dark:border-slate-700 rounded-xl bg-white/85 dark:bg-slate-900/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500"
                    />
                  </div>

                  <div className="w-28">
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                      Target Page
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={pageCount}
                      value={newPage}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setNewPage(v);
                        handlePreviewPageChange(v);
                      }}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200/90 dark:border-slate-700 rounded-xl bg-white/85 dark:bg-slate-900/80 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500"
                    />
                  </div>

                  <motion.button
                    type="button"
                    whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                    onClick={addBookmark}
                    className="px-4 py-2.5 rounded-xl font-bold text-white bg-sky-600 hover:bg-sky-700 inline-flex items-center gap-1.5 text-sm shadow-sm transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Add Bookmark
                  </motion.button>
                </div>

                {/* Two Column Layout: Bookmark List + Live Target Page Preview */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-5 border-t border-slate-200/70 dark:border-slate-800/80">
                  {/* Bookmarks List */}
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Bookmark Tree (<AnimatedNumber value={bookmarks.length} />)
                      </h4>
                      <div className="flex items-center gap-1.5 text-xs">
                        <button
                          type="button"
                          onClick={generatePageByPage}
                          className="px-2.5 py-1 rounded-lg bg-slate-100/90 dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-sky-900/30 text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 text-[11px] font-semibold transition-colors"
                          title="Generate a bookmark for each page"
                        >
                          Auto 1..{pageCount}
                        </button>
                        <button
                          type="button"
                          onClick={sortByPage}
                          className="px-2.5 py-1 rounded-lg bg-slate-100/90 dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-sky-900/30 text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 text-[11px] font-semibold transition-colors"
                          title="Sort bookmarks in ascending page order"
                        >
                          Sort
                        </button>
                        {bookmarks.length > 0 && (
                          <button
                            type="button"
                            onClick={clearAll}
                            className="px-2.5 py-1 rounded-lg bg-slate-100/90 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-900/30 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 text-[11px] font-semibold transition-colors"
                            title="Clear all bookmarks"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    {bookmarks.length === 0 ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500 py-8 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                        No bookmarks added yet. Use the inputs above to add chapters!
                      </p>
                    ) : (
                      bookmarks.map((bm, idx) => (
                        <motion.div
                          key={bm.id}
                          layout={!prefersReduced}
                          initial={prefersReduced ? false : { opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          onClick={() => handlePreviewPageChange(bm.page)}
                          className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer ${
                            previewPage === bm.page
                              ? 'border-sky-400 bg-[var(--pms-soft-blue)]/80 dark:bg-sky-950/40 text-sky-900 dark:text-sky-200 shadow-xs'
                              : 'border-slate-200/80 dark:border-slate-800 bg-white/60 dark:bg-slate-900/50 hover:border-sky-300/80 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
                            <Bookmark className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                            <input
                              type="text"
                              value={bm.title}
                              onChange={(e) => updateBookmark(bm.id, { title: e.target.value })}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs font-bold bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-sky-500 focus:outline-none w-full truncate"
                            />
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[11px] font-mono font-bold bg-white/90 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 px-2 py-0.5 rounded-lg">
                              p.{bm.page}
                            </span>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                moveBookmark(idx, 'up');
                              }}
                              disabled={idx === 0}
                              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                moveBookmark(idx, 'down');
                              }}
                              disabled={idx === bookmarks.length - 1}
                              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeBookmark(bm.id);
                              }}
                              className="p-1 text-slate-400 hover:text-rose-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>

                  {/* Target Page Preview */}
                  <div className="text-center bg-white/60 dark:bg-slate-900/50 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800">
                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                      Target Page <AnimatedNumber value={previewPage} /> Preview
                    </h4>
                    {previewDataUrl ? (
                      <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm inline-block max-h-72 bg-white">
                        <img src={previewDataUrl} alt="Page preview" className="max-h-72 object-contain" />
                      </div>
                    ) : (
                      <div className="py-20 text-slate-400 text-xs">
                        {loadingPreview ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Click a bookmark to preview'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Save Button */}
                <div className="mt-6 pt-6 border-t border-slate-200/70 dark:border-slate-800/80 flex justify-end">
                  <motion.button
                    type="button"
                    whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                    onClick={processSaveBookmarks}
                    disabled={busy || bookmarks.length === 0}
                    className="pms-btn-primary inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold disabled:opacity-50"
                  >
                    {busy ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Saving Outline...
                      </>
                    ) : (
                      <>
                        <Bookmark className="w-4 h-4" /> Save Bookmarks to PDF
                      </>
                    )}
                  </motion.button>
                </div>
              </div>

              {/* Success Box */}
              <AnimatePresence>
                {resultUrl && (
                  <motion.div
                    initial={prefersReduced ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReduced ? undefined : { opacity: 0, y: -8 }}
                    transition={{ duration: prefersReduced ? 0 : 0.25 }}
                    className="pms-glass-panel p-6 md:p-8 rounded-3xl border border-emerald-200/80 dark:border-emerald-800/70 bg-emerald-50/75 dark:bg-emerald-950/35 text-center"
                  >
                    <motion.div
                      initial={prefersReduced ? false : { scale: 0.7 }}
                      animate={{ scale: 1 }}
                      transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 280, damping: 18 }}
                      className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center"
                    >
                      <CheckCircle2 className="w-8 h-8" />
                    </motion.div>
                    <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-100 mb-1">
                      Bookmarks Added Successfully!
                    </h3>
                    <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-5">
                      Your PDF now contains <AnimatedNumber value={bookmarks.length} className="font-bold" /> native clickable Table of Contents outline entries.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <a
                        href={resultUrl}
                        download={resultName}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition-colors"
                      >
                        <Download className="w-4 h-4" /> Download Bookmarked PDF
                      </a>
                      <a
                        href={resultUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-emerald-800 dark:text-emerald-200 bg-white/90 dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100/50 transition-colors"
                      >
                        <Eye className="w-4 h-4" /> Preview in Browser
                      </a>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </PearlStageSwitch>

        <div className="max-w-5xl mx-auto">
          <ToolSEOSection
            toolName="Create PDF Bookmarks"
            headline="Add & Edit Table of Contents Outline"
            description="Free online tool to create and edit native PDF bookmarks and Table of Contents outlines. Build clickable navigation trees compatible with Adobe Acrobat, Chrome, and all PDF viewers."
            faqs={[
              {
                q: 'Where will these bookmarks appear in my PDF reader?',
                a: 'In Adobe Acrobat, Chrome, Firefox, or Edge, click the Bookmarks / Table of Contents icon in the left sidebar to see and jump between your created chapters.',
              },
              {
                q: 'Does adding bookmarks alter the visible text on the pages?',
                a: 'No, bookmarks are metadata outline structures embedded in the PDF document catalog; they do not alter or obscure any page contents.',
              },
            ]}
          />
        </div>
      </div>
    </ToolWorkspaceShell>
  );
}
