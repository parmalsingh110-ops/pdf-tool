import { useState } from 'react';
import { Download, FileText, CheckCircle2, Eye, Loader2, Trash2, Highlighter, MessageSquare, PenTool, Square, Stamp, Link as LinkIcon } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { PDFDocument, PDFName, PDFDict, PDFArray } from 'pdf-lib';
import FileDropzone from '../components/FileDropzone';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { useToast } from '../components/Toast';

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

  const prefersReduced = useReducedMotion();
  const toast = useToast();

  useAutoRevokeUrl(resultUrl);

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
      toast.error('Could not parse PDF annotations: ' + (err?.message || 'Unknown error'));
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
      const blob = new Blob([toArrayBufferBytes(outBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultName(`${file.name.replace(/\.pdf$/i, '')}_cleaned.pdf`);
      setRemovedCount(totalRemoved);
      toast.success(`Removed ${totalRemoved} annotation(s) successfully!`);
    } catch (e: any) {
      console.error(e);
      toast.error('Error stripping annotations: ' + (e?.message || 'Unknown error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Remove Annotations from PDF"
      subtitle="Batch remove highlights, comments, strikeouts, drawings, and stamps from your PDF document without affecting the underlying text."
      categoryLabel="Batch Annotation Cleaner"
      icon={Trash2}
      microVariant="edit"
      tone="rose"
      trustNote="Selective annotation stripping runs locally in your browser"
    >
      <div className="space-y-10">
        <PearlStageSwitch stageKey={!file ? 'upload' : 'workspace'}>
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
            <div className="max-w-4xl mx-auto space-y-8">
              {/* Control Box */}
              <div className="pms-glass-panel rounded-3xl p-6 md:p-7 relative overflow-hidden">
                <PearlScanOverlay
                  active={busy || analyzing}
                  label={analyzing ? 'Scanning PDF annotation layers...' : 'Stripping selected annotations...'}
                />

                <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-200/70 dark:border-slate-800/80">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-[var(--pms-soft-rose)] dark:bg-rose-950/50 text-[var(--pms-rose)] dark:text-rose-400">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-slate-100">{file.name}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                        <span><AnimatedNumber value={pageCount} /> page{pageCount > 1 ? 's' : ''}</span>
                        <span>•</span>
                        <span><AnimatedNumber value={stats.total} /> total annotations found</span>
                      </p>
                    </div>
                  </div>

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
                        className="text-xs text-rose-600 dark:text-rose-400 hover:underline font-semibold"
                      >
                        Select All Markups
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Highlights */}
                    <label
                      className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        removeHighlights
                          ? 'border-rose-400/80 bg-[var(--pms-soft-rose)]/70 dark:bg-rose-950/30 text-rose-950 dark:text-rose-200 shadow-xs'
                          : 'border-slate-200/80 dark:border-slate-800 bg-white/60 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={removeHighlights}
                          onChange={(e) => setRemoveHighlights(e.target.checked)}
                          className="w-4 h-4 rounded accent-rose-600 cursor-pointer"
                        />
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <Highlighter className="w-4 h-4 text-amber-500" /> Highlights & Underlines
                        </div>
                      </div>
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/90 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                        <AnimatedNumber value={stats.highlights} />
                      </span>
                    </label>

                    {/* Comments / Sticky Notes */}
                    <label
                      className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        removeComments
                          ? 'border-rose-400/80 bg-[var(--pms-soft-rose)]/70 dark:bg-rose-950/30 text-rose-950 dark:text-rose-200 shadow-xs'
                          : 'border-slate-200/80 dark:border-slate-800 bg-white/60 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={removeComments}
                          onChange={(e) => setRemoveComments(e.target.checked)}
                          className="w-4 h-4 rounded accent-rose-600 cursor-pointer"
                        />
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <MessageSquare className="w-4 h-4 text-blue-500" /> Comments & Sticky Notes
                        </div>
                      </div>
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/90 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                        <AnimatedNumber value={stats.comments} />
                      </span>
                    </label>

                    {/* Freehand Drawings */}
                    <label
                      className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        removeDrawings
                          ? 'border-rose-400/80 bg-[var(--pms-soft-rose)]/70 dark:bg-rose-950/30 text-rose-950 dark:text-rose-200 shadow-xs'
                          : 'border-slate-200/80 dark:border-slate-800 bg-white/60 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={removeDrawings}
                          onChange={(e) => setRemoveDrawings(e.target.checked)}
                          className="w-4 h-4 rounded accent-rose-600 cursor-pointer"
                        />
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <PenTool className="w-4 h-4 text-purple-500" /> Freehand Inks & Drawings
                        </div>
                      </div>
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/90 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                        <AnimatedNumber value={stats.drawings} />
                      </span>
                    </label>

                    {/* Shapes & Boxes */}
                    <label
                      className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        removeShapes
                          ? 'border-rose-400/80 bg-[var(--pms-soft-rose)]/70 dark:bg-rose-950/30 text-rose-950 dark:text-rose-200 shadow-xs'
                          : 'border-slate-200/80 dark:border-slate-800 bg-white/60 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={removeShapes}
                          onChange={(e) => setRemoveShapes(e.target.checked)}
                          className="w-4 h-4 rounded accent-rose-600 cursor-pointer"
                        />
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <Square className="w-4 h-4 text-emerald-500" /> Shapes, Rectangles & Lines
                        </div>
                      </div>
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/90 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                        <AnimatedNumber value={stats.shapes} />
                      </span>
                    </label>

                    {/* Rubber Stamps */}
                    <label
                      className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        removeStamps
                          ? 'border-rose-400/80 bg-[var(--pms-soft-rose)]/70 dark:bg-rose-950/30 text-rose-950 dark:text-rose-200 shadow-xs'
                          : 'border-slate-200/80 dark:border-slate-800 bg-white/60 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={removeStamps}
                          onChange={(e) => setRemoveStamps(e.target.checked)}
                          className="w-4 h-4 rounded accent-rose-600 cursor-pointer"
                        />
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <Stamp className="w-4 h-4 text-rose-500" /> Rubber Stamps & Approvals
                        </div>
                      </div>
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/90 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                        <AnimatedNumber value={stats.stamps} />
                      </span>
                    </label>

                    {/* FreeText Callouts */}
                    <label
                      className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        removeFreeText
                          ? 'border-rose-400/80 bg-[var(--pms-soft-rose)]/70 dark:bg-rose-950/30 text-rose-950 dark:text-rose-200 shadow-xs'
                          : 'border-slate-200/80 dark:border-slate-800 bg-white/60 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={removeFreeText}
                          onChange={(e) => setRemoveFreeText(e.target.checked)}
                          className="w-4 h-4 rounded accent-rose-600 cursor-pointer"
                        />
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <FileText className="w-4 h-4 text-cyan-500" /> Added FreeText Callouts
                        </div>
                      </div>
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/90 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                        <AnimatedNumber value={stats.freetext} />
                      </span>
                    </label>

                    {/* Web & Document Links */}
                    <label
                      className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        removeLinks
                          ? 'border-rose-400/80 bg-[var(--pms-soft-rose)]/70 dark:bg-rose-950/30 text-rose-950 dark:text-rose-200 shadow-xs'
                          : 'border-slate-200/80 dark:border-slate-800 bg-white/60 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={removeLinks}
                          onChange={(e) => setRemoveLinks(e.target.checked)}
                          className="w-4 h-4 rounded accent-rose-600 cursor-pointer"
                        />
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <LinkIcon className="w-4 h-4 text-indigo-500" /> Web Links & URL Annotations
                        </div>
                      </div>
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/90 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                        <AnimatedNumber value={stats.links} />
                      </span>
                    </label>
                  </div>
                </div>

                {/* Action Button */}
                <div className="mt-6 pt-6 border-t border-slate-200/70 dark:border-slate-800/80 flex justify-end">
                  <motion.button
                    type="button"
                    whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                    onClick={processRemoval}
                    disabled={busy}
                    className="pms-btn-primary inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold disabled:opacity-50"
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
                      Annotations Removed Successfully!
                    </h3>
                    <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-5">
                      Stripped <AnimatedNumber value={removedCount} className="font-bold" /> annotations while keeping the document vector text and structure 100% intact.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
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

        <div className="max-w-4xl mx-auto">
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
    </ToolWorkspaceShell>
  );
}
