import React, { useState, useEffect } from 'react';
import { Download, FileText, CheckCircle2, Eye, Loader2, Sparkles, Bookmark, Plus, Trash2, ArrowUp, ArrowDown, BookOpen, Edit3, Layers } from 'lucide-react';
import { PDFDocument, PDFName, PDFDict, PDFRef, PDFNumber, PDFHexString } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolSEOSection from '../components/ToolSEOSection';

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

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

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
              let destRef = item.dest;
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
      alert('Could not load PDF: ' + (err?.message || 'Invalid file'));
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
      const blob = new Blob([outBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultName(`${file.name.replace(/\.pdf$/i, '')}_with_bookmarks.pdf`);
    } catch (e: any) {
      console.error(e);
      alert('Error saving bookmarks: ' + (e?.message || 'Unknown error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 transition-colors">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 text-sm font-semibold mb-3">
            <Bookmark className="w-4 h-4" /> Native PDF Outline & Table of Contents Editor
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
            Create PDF Bookmarks
          </h1>
          <p className="text-base md:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Add, edit, and organize native PDF Table of Contents bookmarks so users can easily navigate chapters in Adobe Acrobat, Chrome, and any PDF viewer.
          </p>
        </div>

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
          <div className="space-y-8">
            {/* Editor Container */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 dark:text-cyan-400">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-slate-200">{file.name}</h3>
                    <p className="text-xs text-slate-500">{pageCount} pages • {bookmarks.length} bookmarks configured</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={generatePageByPage}
                    className="px-3 py-1.5 text-xs font-semibold text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/40 rounded-lg hover:bg-cyan-100"
                  >
                    Auto-Generate Bookmark per Page
                  </button>

                  <button
                    onClick={() => {
                      setFile(null);
                      setResultUrl(null);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    Change File
                  </button>
                </div>
              </div>

              {/* Add Bookmark Row */}
              <div className="pt-6 pb-4 flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Bookmark Title
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addBookmark()}
                    placeholder="e.g. Chapter 1: Introduction"
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="w-28">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
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
                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <button
                  type="button"
                  onClick={addBookmark}
                  className="px-4 py-2.5 rounded-xl font-bold text-white bg-cyan-600 hover:bg-cyan-700 inline-flex items-center gap-1.5 text-sm shadow-xs"
                >
                  <Plus className="w-4 h-4" /> Add Bookmark
                </button>
              </div>

              {/* Two Column Layout: Bookmark List + Live Target Page Preview */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                {/* Bookmarks List */}
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Bookmark Tree ({bookmarks.length})
                  </h4>

                  {bookmarks.length === 0 ? (
                    <p className="text-xs text-slate-400 py-6 text-center">
                      No bookmarks added yet. Use the inputs above to add chapters!
                    </p>
                  ) : (
                    bookmarks.map((bm, idx) => (
                      <div
                        key={bm.id}
                        onClick={() => handlePreviewPageChange(bm.page)}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                          previewPage === bm.page
                            ? 'border-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/40 text-cyan-900 dark:text-cyan-200'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
                          <Bookmark className="w-4 h-4 text-cyan-600 shrink-0" />
                          <input
                            type="text"
                            value={bm.title}
                            onChange={(e) => updateBookmark(bm.id, { title: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs font-bold bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none w-full truncate"
                          />
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-mono font-bold bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded">
                            p.{bm.page}
                          </span>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveBookmark(idx, 'up');
                            }}
                            disabled={idx === 0}
                            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
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
                            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeBookmark(bm.id);
                            }}
                            className="p-1 text-slate-400 hover:text-red-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Target Page Preview */}
                <div className="text-center bg-slate-50/50 dark:bg-slate-800/40 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Target Page {previewPage} Preview
                  </h4>
                  {previewDataUrl ? (
                    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden shadow-xs inline-block max-h-72 bg-white">
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
              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  onClick={processSaveBookmarks}
                  disabled={busy || bookmarks.length === 0}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 transition-colors shadow-sm"
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
                </button>
              </div>
            </div>

            {/* Success Box */}
            {resultUrl && (
              <div className="p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center animate-fade-in">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
                <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-100 mb-1">
                  Bookmarks Added Successfully!
                </h3>
                <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-4">
                  Your PDF now contains {bookmarks.length} native clickable Table of Contents outline entries.
                </p>
                <div className="flex items-center justify-center gap-3">
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
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-emerald-800 dark:text-emerald-200 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100/50 transition-colors"
                  >
                    <Eye className="w-4 h-4" /> Preview in Browser
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

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
  );
}
