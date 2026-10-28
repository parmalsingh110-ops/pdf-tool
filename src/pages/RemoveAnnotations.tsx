import React, { useState, useEffect } from 'react';
import { Download, FileText, CheckCircle2, Eye, Loader2, Sparkles, Trash2, Highlighter, MessageSquare, PenTool, Square, Stamp, Link as LinkIcon, ShieldAlert } from 'lucide-react';
import { PDFDocument, PDFName, PDFDict, PDFArray } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolSEOSection from '../components/ToolSEOSection';

interface AnnotationStats {
  highlights: number;
  comments: number;
  drawings: number;
  shapes: number;
  stamps: number;
  freetext: number;
  links: number;
  total: number;
}

export default function RemoveAnnotations() {
  useSEO(
    'Remove Annotations from PDF Online Free — Clean Highlights & Comments | PDF Media Suite',
    'Batch remove highlights, comments, strikeouts, stamps, and markup annotations from PDF documents online free. Restore clean original PDFs without affecting base text.'
  );

  usePageSEO(
    'Remove Annotations from PDF — Strip Highlights, Notes & Stamps',
    'Batch delete unwanted highlights, comments, sticky notes, freehand ink, and markup annotations from PDF pages with live detection counts.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [pageCount, setPageCount] = useState(0);

  const [stats, setStats] = useState<AnnotationStats>({
    highlights: 0,
    comments: 0,
    drawings: 0,
    shapes: 0,
    stamps: 0,
    freetext: 0,
    links: 0,
    total: 0,
  });

  // Checkboxes for what to remove
  const [removeHighlights, setRemoveHighlights] = useState(true);
  const [removeComments, setRemoveComments] = useState(true);
  const [removeDrawings, setRemoveDrawings] = useState(true);
  const [removeShapes, setRemoveShapes] = useState(true);
  const [removeStamps, setRemoveStamps] = useState(false); // default false to preserve official stamps unless checked
  const [removeFreeText, setRemoveFreeText] = useState(true);
  const [removeLinks, setRemoveLinks] = useState(false); // default false to keep clickable URLs

  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState('');
  const [removedCount, setRemovedCount] = useState(0);

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
    setAnalyzing(true);

    try {
      const ab = await f.arrayBuffer();
      const doc = await PDFDocument.load(ab, { ignoreEncryption: true });
      const pages = doc.getPages();
      setPageCount(pages.length);

      const counts: AnnotationStats = {
        highlights: 0,
        comments: 0,
        drawings: 0,
        shapes: 0,
        stamps: 0,
        freetext: 0,
        links: 0,
        total: 0,
      };

      for (const page of pages) {
        const annotsRef = page.node.get(PDFName.of('Annots'));
        if (!annotsRef) continue;
        const annots = doc.context.lookup(annotsRef);
        if (annots instanceof PDFArray) {
          for (let a = 0; a < annots.size(); a++) {
            const annotDict = doc.context.lookup(annots.get(a));
            if (annotDict instanceof PDFDict) {
              const subtype = annotDict.get(PDFName.of('Subtype'))?.toString();
              counts.total++;
              if (subtype === '/Highlight' || subtype === '/Underline' || subtype === '/StrikeOut' || subtype === '/Squiggly') {
                counts.highlights++;
              } else if (subtype === '/Text') {
                counts.comments++;
              } else if (subtype === '/Ink') {
                counts.drawings++;
              } else if (subtype === '/Square' || subtype === '/Circle' || subtype === '/Line' || subtype === '/PolyLine' || subtype === '/Polygon') {
                counts.shapes++;
              } else if (subtype === '/Stamp') {
                counts.stamps++;
              } else if (subtype === '/FreeText') {
                counts.freetext++;
              } else if (subtype === '/Link') {
                counts.links++;
              }
            }
          }
        }
      }

      setStats(counts);
    } catch (err: any) {
      console.error(err);
      alert('Could not parse PDF annotations: ' + (err?.message || 'Unknown error'));
      setFile(null);
    } finally {
      setAnalyzing(false);
    }
  };

  const processRemoval = async () => {
    if (!file) return;
    setBusy(true);

    try {
      const ab = await file.arrayBuffer();
      const doc = await PDFDocument.load(ab, { ignoreEncryption: true });
      const pages = doc.getPages();
      let totalRemoved = 0;

      for (const page of pages) {
        const annotsRef = page.node.get(PDFName.of('Annots'));
        if (!annotsRef) continue;
        const annots = doc.context.lookup(annotsRef);
        if (annots instanceof PDFArray) {
          const preservedAnnots = doc.context.obj([]) as PDFArray;

          for (let a = 0; a < annots.size(); a++) {
            const annotRef = annots.get(a);
            const annotDict = doc.context.lookup(annotRef);

            if (annotDict instanceof PDFDict) {
              const subtype = annotDict.get(PDFName.of('Subtype'))?.toString();
              let shouldDelete = false;

              if (
                removeHighlights &&
                (subtype === '/Highlight' || subtype === '/Underline' || subtype === '/StrikeOut' || subtype === '/Squiggly')
              ) {
                shouldDelete = true;
              } else if (removeComments && subtype === '/Text') {
                shouldDelete = true;
              } else if (removeDrawings && subtype === '/Ink') {
                shouldDelete = true;
              } else if (
                removeShapes &&
                (subtype === '/Square' || subtype === '/Circle' || subtype === '/Line' || subtype === '/PolyLine' || subtype === '/Polygon')
              ) {
                shouldDelete = true;
              } else if (removeStamps && subtype === '/Stamp') {
                shouldDelete = true;
              } else if (removeFreeText && subtype === '/FreeText') {
                shouldDelete = true;
              } else if (removeLinks && subtype === '/Link') {
                shouldDelete = true;
              }

              if (shouldDelete) {
                totalRemoved++;
              } else {
                preservedAnnots.push(annotRef);
              }
            } else {
              preservedAnnots.push(annotRef);
            }
          }

          if (preservedAnnots.size() > 0) {
            page.node.set(PDFName.of('Annots'), preservedAnnots);
          } else {
            page.node.delete(PDFName.of('Annots'));
          }
        }
      }

      const outBytes = await doc.save();
      const blob = new Blob([outBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultName(`${file.name.replace(/\.pdf$/i, '')}_cleaned.pdf`);
      setRemovedCount(totalRemoved);
    } catch (e: any) {
      console.error(e);
      alert('Error stripping annotations: ' + (e?.message || 'Unknown error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 transition-colors">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 text-sm font-semibold mb-3">
            <Trash2 className="w-4 h-4" /> Batch Annotation Cleaner
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
            Remove Annotations from PDF
          </h1>
          <p className="text-base md:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Batch remove highlights, comments, strikeouts, drawings, and stamps from your PDF document without affecting the underlying text.
          </p>
        </div>

        {!file ? (
          <div className="max-w-2xl mx-auto">
            <FileDropzone
              onDrop={handleDrop}
              accept={{ 'application/pdf': ['.pdf'] }}
              multiple={false}
              title="Upload PDF with Annotations"
              subtitle="Drop PDF to inspect and strip highlights, notes, or stamps"
            />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Control Box */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-slate-200">{file.name}</h3>
                    <p className="text-xs text-slate-500">
                      {pageCount} page{pageCount > 1 ? 's' : ''} • {stats.total} total annotations found
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setFile(null);
                    setResultUrl(null);
                  }}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                >
                  Change File
                </button>
              </div>

              {/* Detected Annotation Categories */}
              <div className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Select Annotation Types to Remove
                  </h4>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRemoveHighlights(true);
                        setRemoveComments(true);
                        setRemoveDrawings(true);
                        setRemoveShapes(true);
                        setRemoveStamps(true);
                        setRemoveFreeText(true);
                      }}
                      className="text-xs text-rose-600 hover:underline font-semibold"
                    >
                      Select All Markups
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Highlights */}
                  <label
                    className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                      removeHighlights
                        ? 'border-rose-400 bg-rose-50/50 dark:bg-rose-950/30 text-rose-950 dark:text-rose-200'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={removeHighlights}
                        onChange={(e) => setRemoveHighlights(e.target.checked)}
                        className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                      />
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Highlighter className="w-4 h-4 text-yellow-500" /> Highlights & Underlines
                      </div>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {stats.highlights}
                    </span>
                  </label>

                  {/* Comments / Sticky Notes */}
                  <label
                    className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                      removeComments
                        ? 'border-rose-400 bg-rose-50/50 dark:bg-rose-950/30 text-rose-950 dark:text-rose-200'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={removeComments}
                        onChange={(e) => setRemoveComments(e.target.checked)}
                        className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                      />
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <MessageSquare className="w-4 h-4 text-blue-500" /> Comments & Sticky Notes
                      </div>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {stats.comments}
                    </span>
                  </label>

                  {/* Freehand Drawings */}
                  <label
                    className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                      removeDrawings
                        ? 'border-rose-400 bg-rose-50/50 dark:bg-rose-950/30 text-rose-950 dark:text-rose-200'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={removeDrawings}
                        onChange={(e) => setRemoveDrawings(e.target.checked)}
                        className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                      />
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <PenTool className="w-4 h-4 text-purple-500" /> Freehand Inks & Drawings
                      </div>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {stats.drawings}
                    </span>
                  </label>

                  {/* Shapes & Boxes */}
                  <label
                    className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                      removeShapes
                        ? 'border-rose-400 bg-rose-50/50 dark:bg-rose-950/30 text-rose-950 dark:text-rose-200'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={removeShapes}
                        onChange={(e) => setRemoveShapes(e.target.checked)}
                        className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                      />
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Square className="w-4 h-4 text-emerald-500" /> Shapes, Rectangles & Lines
                      </div>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {stats.shapes}
                    </span>
                  </label>

                  {/* Rubber Stamps */}
                  <label
                    className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                      removeStamps
                        ? 'border-rose-400 bg-rose-50/50 dark:bg-rose-950/30 text-rose-950 dark:text-rose-200'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={removeStamps}
                        onChange={(e) => setRemoveStamps(e.target.checked)}
                        className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                      />
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Stamp className="w-4 h-4 text-rose-500" /> Rubber Stamps & Approvals
                      </div>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {stats.stamps}
                    </span>
                  </label>

                  {/* FreeText Callouts */}
                  <label
                    className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                      removeFreeText
                        ? 'border-rose-400 bg-rose-50/50 dark:bg-rose-950/30 text-rose-950 dark:text-rose-200'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={removeFreeText}
                        onChange={(e) => setRemoveFreeText(e.target.checked)}
                        className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                      />
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <FileText className="w-4 h-4 text-cyan-500" /> Added FreeText Callouts
                      </div>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {stats.freetext}
                    </span>
                  </label>
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  onClick={processRemoval}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {busy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Removing Annotations...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" /> Remove Selected Annotations
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
                  Annotations Removed Successfully!
                </h3>
                <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-4">
                  Stripped {removedCount} annotations while keeping the document vector text and structure 100% intact.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <a
                    href={resultUrl}
                    download={resultName}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition-colors"
                  >
                    <Download className="w-4 h-4" /> Download Clean PDF
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
          toolName="Remove Annotations from PDF"
          headline="Strip Highlights, Notes & Stamps"
          description="Free online tool to batch remove highlights, underlines, comments, stamps, and markup annotations from PDF documents without damaging original vector text."
          faqs={[
            {
              q: 'Will removing annotations delete the text underneath the highlight?',
              a: 'No! PDF highlights are separate overlay layers. Removing them reveals the original, pristine text underneath without altering a single character.',
            },
            {
              q: 'Can I keep stamps and links while removing student highlights?',
              a: 'Yes, our selective checkboxes let you choose exactly which annotation types to remove and which to preserve.',
            },
          ]}
        />
      </div>
    </div>
  );
}
