import { useState } from 'react';
import { Download, FileText, Tag, Trash2, CheckCircle2, RefreshCw } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import FileDropzone from '../components/FileDropzone';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';
import { PDFDocument } from 'pdf-lib';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { useToast } from '../components/Toast';

interface MetaState {
  title: string;
  author: string;
  subject: string;
  creator: string;
  producer: string;
  keywords: string;
  creationDate: string;
  modificationDate: string;
}

export default function EditMetadata() {
  useSEO(
    'Edit PDF Metadata Online Free — View, Edit & Anonymize | PDF Media Suite',
    'View and edit PDF metadata properties online free. Change Title, Author, Subject, Keywords, or 1-click Anonymize to wipe all tracking and personal info.'
  );

  usePageSEO(
    'Edit PDF Metadata',
    'Inspect and modify PDF document properties: Author, Title, Subject, Creator, and Keywords. Includes 1-click metadata wipe for privacy.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editedUrl, setEditedUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [updateModDate, setUpdateModDate] = useState(true);

  const prefersReduced = useReducedMotion();
  const toast = useToast();

  useAutoRevokeUrl(editedUrl);

  const [metadata, setMetadata] = useState<MetaState>({
    title: '',
    author: '',
    subject: '',
    creator: '',
    producer: '',
    keywords: '',
    creationDate: '',
    modificationDate: '',
  });

  const handleDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      setFile(selectedFile);
      setEditedUrl(null);

      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        setPageCount(pdfDoc.getPageCount());

        const cDate = pdfDoc.getCreationDate();
        const mDate = pdfDoc.getModificationDate();

        setMetadata({
          title: pdfDoc.getTitle() || '',
          author: pdfDoc.getAuthor() || '',
          subject: pdfDoc.getSubject() || '',
          creator: pdfDoc.getCreator() || '',
          producer: pdfDoc.getProducer() || '',
          keywords: (() => {
            const kw = pdfDoc.getKeywords();
            return Array.isArray(kw) ? kw.join(', ') : (kw || '');
          })(),
          creationDate: cDate ? cDate.toLocaleString() : 'Not specified',
          modificationDate: mDate ? mDate.toLocaleString() : 'Not specified',
        });
      } catch (error) {
        console.error('Error reading metadata:', error);
      }
    }
  };

  const wipeAllMetadata = () => {
    setMetadata({
      title: '',
      author: '',
      subject: '',
      creator: '',
      producer: '',
      keywords: '',
      creationDate: 'Removed',
      modificationDate: 'Removed',
    });
  };

  const saveMetadata = async () => {
    if (!file) return;

    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);

      pdfDoc.setTitle(metadata.title.trim());
      pdfDoc.setAuthor(metadata.author.trim());
      pdfDoc.setSubject(metadata.subject.trim());
      pdfDoc.setCreator(metadata.creator.trim());
      pdfDoc.setProducer(metadata.producer.trim());

      if (metadata.keywords.trim()) {
        pdfDoc.setKeywords(
          metadata.keywords
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean)
        );
      } else {
        pdfDoc.setKeywords([]);
      }

      if (updateModDate) {
        pdfDoc.setModificationDate(new Date());
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([toArrayBufferBytes(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setEditedUrl(url);
      toast.success('Metadata updated successfully!');
    } catch (error) {
      console.error('Error saving metadata:', error);
      toast.error('An error occurred while saving the PDF metadata.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Edit & Clean PDF Metadata"
      subtitle="Inspect, modify, or completely scrub document properties, author names, and tracking data from your PDF."
      categoryLabel="Document Properties & Privacy"
      icon={Tag}
      microVariant="security"
      tone="violet"
      trustNote="Metadata inspection & scrubbing run locally in your browser"
    >
      <PearlStageSwitch stageKey={!file ? 'upload' : editedUrl ? 'result' : 'edit'}>
        {!file ? (
          <div className="w-full max-w-2xl mx-auto">
            <FileDropzone
              onDrop={handleDrop}
              multiple={false}
              accept={{ 'application/pdf': ['.pdf'] }}
              title="Select PDF file"
              subtitle="or drop document here to inspect & edit metadata"
            />
          </div>
        ) : editedUrl ? (
          /* Results View */
          <div className="w-full max-w-2xl mx-auto pms-glass-panel rounded-3xl p-6 md:p-8 text-center space-y-6">
            <div className="p-8 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/35 border border-emerald-200/80 dark:border-emerald-800/70">
              <motion.div
                initial={prefersReduced ? false : { scale: 0.7 }}
                animate={{ scale: 1 }}
                transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 280, damping: 18 }}
                className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4"
              >
                <CheckCircle2 className="w-8 h-8" />
              </motion.div>
              <h3 className="text-2xl font-bold text-emerald-900 dark:text-emerald-100 mb-2">
                Metadata Successfully Updated!
              </h3>
              <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-6">
                Your PDF properties and tracking tags have been updated and saved cleanly.
              </p>
              <a
                href={editedUrl}
                download={`clean_${file.name}`}
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-base font-bold rounded-xl shadow-lg transition-all"
              >
                <Download className="w-5 h-5" /> Download Updated PDF
              </a>
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => setEditedUrl(null)}
                className="px-5 py-2.5 bg-white/80 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 font-semibold rounded-xl transition-all"
              >
                Back to Properties
              </button>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setEditedUrl(null);
                }}
                className="px-5 py-2.5 bg-white/80 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 font-semibold rounded-xl transition-all"
              >
                Inspect Another PDF
              </button>
            </div>
          </div>
        ) : (
          /* Workspace Form */
          <div className="w-full max-w-4xl mx-auto pms-glass-panel rounded-3xl p-6 md:p-8 space-y-6 relative overflow-hidden">
            <PearlScanOverlay active={isProcessing} label="Rebuilding PDF metadata dictionary..." />

            {/* Top File Summary Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/70 dark:border-slate-800/80">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[var(--pms-soft-lavender)] dark:bg-violet-950/60 text-[var(--pms-violet)] dark:text-violet-400 rounded-2xl flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white truncate max-w-md">{file.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                    <span><AnimatedNumber value={file.size / 1024 / 1024} decimals={2} suffix=" MB" /></span>
                    <span>•</span>
                    <span><AnimatedNumber value={pageCount} /> pages</span>
                    <span>•</span>
                    <span>Created: {metadata.creationDate}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={wipeAllMetadata}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-[var(--pms-soft-rose)] dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200/80 dark:border-rose-800/70 rounded-xl hover:brightness-95 transition-all"
                  title="Wipe author, creator, software trace, and keywords for privacy"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Wipe All Metadata (Anonymize)
                </button>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Change File
                </button>
              </div>
            </div>

            {/* Form Fields Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Document Title
                </label>
                <input
                  type="text"
                  value={metadata.title}
                  onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                  placeholder="e.g. Annual Financial Report 2026"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white/85 dark:bg-slate-900/80 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Author / Creator Name
                </label>
                <input
                  type="text"
                  value={metadata.author}
                  onChange={(e) => setMetadata({ ...metadata, author: e.target.value })}
                  placeholder="e.g. John Doe, Lead Analyst"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white/85 dark:bg-slate-900/80 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Subject / Description
                </label>
                <input
                  type="text"
                  value={metadata.subject}
                  onChange={(e) => setMetadata({ ...metadata, subject: e.target.value })}
                  placeholder="e.g. Confidential corporate overview"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white/85 dark:bg-slate-900/80 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Keywords (Comma Separated)
                </label>
                <input
                  type="text"
                  value={metadata.keywords}
                  onChange={(e) => setMetadata({ ...metadata, keywords: e.target.value })}
                  placeholder="e.g. report, 2026, finance, audit"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white/85 dark:bg-slate-900/80 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Application Creator (Software)
                </label>
                <input
                  type="text"
                  value={metadata.creator}
                  onChange={(e) => setMetadata({ ...metadata, creator: e.target.value })}
                  placeholder="e.g. Microsoft Word / Adobe InDesign"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white/85 dark:bg-slate-900/80 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  PDF Producer (Engine)
                </label>
                <input
                  type="text"
                  value={metadata.producer}
                  onChange={(e) => setMetadata({ ...metadata, producer: e.target.value })}
                  placeholder="e.g. PDF Media Suite / Quartz PDFContext"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white/85 dark:bg-slate-900/80 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500"
                />
              </div>
            </div>

            {/* Options & Action */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-5 border-t border-slate-200/70 dark:border-slate-800/80">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={updateModDate}
                  onChange={(e) => setUpdateModDate(e.target.checked)}
                  className="w-4 h-4 accent-violet-600 rounded"
                />
                Update Modification Date to current time
              </label>

              <motion.button
                type="button"
                whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                onClick={saveMetadata}
                disabled={isProcessing}
                className="pms-btn-primary w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Tag className="w-4 h-4" />}
                {isProcessing ? 'Saving Metadata...' : 'Save & Download PDF'}
              </motion.button>
            </div>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
