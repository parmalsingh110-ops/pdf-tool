import { useState } from 'react';
import { Download, FileText, Tag, ShieldCheck, Trash2, Calendar, User, Info, CheckCircle2, Sparkles, RefreshCw, Layers } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { PDFDocument } from 'pdf-lib';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

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
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setEditedUrl(url);
    } catch (error) {
      console.error('Error saving metadata:', error);
      alert('An error occurred while saving the PDF metadata.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 text-xs font-bold tracking-widest uppercase mb-3 border border-purple-200 dark:border-purple-800">
          <Tag className="w-3.5 h-3.5" /> Document Properties & Privacy
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-3">
          Edit & Clean PDF Metadata
        </h1>
        <p className="text-lg text-gray-600 dark:text-slate-400 max-w-2xl mx-auto">
          Inspect, modify, or completely scrub document properties, author names, and tracking data from your PDF.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-4xl">
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
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-8 text-center space-y-6">
          <div className="p-8 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-emerald-900 dark:text-emerald-200 mb-2">
              Metadata Successfully Updated!
            </h3>
            <p className="text-sm text-emerald-700 dark:text-emerald-400 mb-6">
              Your PDF properties and tracking tags have been updated and saved cleanly.
            </p>
            <a
              href={editedUrl}
              download={`clean_${file.name}`}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-bold rounded-xl shadow-lg transition-all"
            >
              <Download className="w-5 h-5" /> Download Updated PDF
            </a>
          </div>

          <div className="flex justify-center gap-4">
            <button
              onClick={() => setEditedUrl(null)}
              className="px-6 py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-xl transition-all"
            >
              Back to Properties
            </button>
            <button
              onClick={() => {
                setFile(null);
                setEditedUrl(null);
              }}
              className="px-6 py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-xl transition-all"
            >
              Inspect Another PDF
            </button>
          </div>
        </div>
      ) : (
        /* Workspace Form */
        <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-6 md:p-8 shadow-sm space-y-6">
          {/* Top File Summary Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-gray-100 dark:border-slate-800">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white truncate max-w-md">{file.name}</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  {(file.size / 1024 / 1024).toFixed(2)} MB • {pageCount} pages • Created: {metadata.creationDate}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={wipeAllMetadata}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors"
                title="Wipe author, creator, software trace, and keywords for privacy"
              >
                <Trash2 className="w-3.5 h-3.5" /> Wipe All Metadata (Anonymize)
              </button>
              <button
                onClick={() => setFile(null)}
                className="px-3 py-2 text-xs font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-slate-300"
              >
                Change File
              </button>
            </div>
          </div>

          {/* Form Fields Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-1.5">
                Document Title
              </label>
              <input
                type="text"
                value={metadata.title}
                onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                placeholder="e.g. Annual Financial Report 2026"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-1.5">
                Author / Creator Name
              </label>
              <input
                type="text"
                value={metadata.author}
                onChange={(e) => setMetadata({ ...metadata, author: e.target.value })}
                placeholder="e.g. John Doe, Lead Analyst"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-1.5">
                Subject / Description
              </label>
              <input
                type="text"
                value={metadata.subject}
                onChange={(e) => setMetadata({ ...metadata, subject: e.target.value })}
                placeholder="e.g. Confidential corporate overview"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-1.5">
                Keywords (Comma Separated)
              </label>
              <input
                type="text"
                value={metadata.keywords}
                onChange={(e) => setMetadata({ ...metadata, keywords: e.target.value })}
                placeholder="e.g. report, 2026, finance, audit"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-1.5">
                Application Creator (Software)
              </label>
              <input
                type="text"
                value={metadata.creator}
                onChange={(e) => setMetadata({ ...metadata, creator: e.target.value })}
                placeholder="e.g. Microsoft Word / Adobe InDesign"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-1.5">
                PDF Producer (Engine)
              </label>
              <input
                type="text"
                value={metadata.producer}
                onChange={(e) => setMetadata({ ...metadata, producer: e.target.value })}
                placeholder="e.g. PDF Media Suite / Quartz PDFContext"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Options & Action */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-gray-100 dark:border-slate-800">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={updateModDate}
                onChange={(e) => setUpdateModDate(e.target.checked)}
                className="w-4 h-4 accent-purple-600 rounded"
              />
              Update Modification Date to current time
            </label>

            <button
              onClick={saveMetadata}
              disabled={isProcessing}
              className="w-full sm:w-auto px-8 py-3.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Tag className="w-4 h-4" />}
              {isProcessing ? 'Saving Metadata...' : 'Save & Download PDF'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
