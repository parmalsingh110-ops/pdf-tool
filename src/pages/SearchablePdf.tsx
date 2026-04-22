import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Loader2, ScanSearch } from 'lucide-react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type OCRLang = 'eng' | 'hin' | 'eng+hin';

export default function SearchablePdf() {
  usePageSEO(
    'Searchable PDF (OCR)',
    'Convert scanned or image-only PDFs into searchable PDFs by adding an OCR text layer.',
  );
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lang, setLang] = useState<OCRLang>('eng');
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Awaited<ReturnType<typeof createWorker>> | null>(null);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate().catch(() => undefined);
      workerRef.current = null;
    };
  }, []);

  const onDrop = (accepted: File[]) => {
    if (accepted.length === 0) return;
    setFile(accepted[0]);
    setError(null);
  };

  const runOcrAndDownload = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setProgress(0);

    try {
      const srcBytes = await file.arrayBuffer();
      const srcPdf = await pdfjsLib.getDocument({ data: srcBytes }).promise;
      const outPdf = await PDFDocument.create();
      const invisibleFont = await outPdf.embedFont(StandardFonts.Helvetica);
      const totalPages = srcPdf.numPages;

      await workerRef.current?.terminate().catch(() => undefined);
      workerRef.current = await createWorker(lang, 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            const pageProgress = Math.max(0, Math.min(1, m.progress || 0));
            setProgress(Math.round(pageProgress * 100));
          }
        },
      });
      const worker = workerRef.current;

      for (let i = 1; i <= totalPages; i++) {
        const page = await srcPdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        const renderScale = 2;
        const renderViewport = page.getViewport({ scale: renderScale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(renderViewport.width);
        canvas.height = Math.round(renderViewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas unavailable');

        await page.render({ canvasContext: ctx, viewport: renderViewport, canvas }).promise;

        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
        if (!blob) throw new Error('Failed to render page image');
        const imgBytes = await blob.arrayBuffer();

        const embedded = await outPdf.embedPng(imgBytes);
        const outPage = outPdf.addPage([viewport.width, viewport.height]);
        outPage.drawImage(embedded, { x: 0, y: 0, width: viewport.width, height: viewport.height });

        const { data } = await worker.recognize(canvas, {}, { blocks: true });
        const recognized = data as any;
        const words =
          recognized.words ||
          (recognized.lines || []).flatMap((line: any) => line.words || []);
        const ratioX = viewport.width / canvas.width;
        const ratioY = viewport.height / canvas.height;

        for (const w of words) {
          const text = (w.text || '').trim();
          const box = w.bbox;
          if (!text || !box) continue;
          const wordWidth = Math.max(1, (box.x1 - box.x0) * ratioX);
          const wordHeight = Math.max(6, (box.y1 - box.y0) * ratioY);
          const x = box.x0 * ratioX;
          const y = viewport.height - box.y1 * ratioY;

          outPage.drawText(text, {
            x,
            y,
            size: wordHeight,
            font: invisibleFont,
            color: rgb(0, 0, 0),
            opacity: 0,
            maxWidth: wordWidth,
            lineHeight: wordHeight,
          });
        }

        setProgress(Math.round((i / totalPages) * 100));
      }

      const outBytes = await outPdf.save();
      const outBlob = new Blob([outBytes], { type: 'application/pdf' });
      const outUrl = URL.createObjectURL(outBlob);
      const a = document.createElement('a');
      a.href = outUrl;
      a.download = `${file.name.replace(/\.pdf$/i, '') || 'document'}_searchable.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(outUrl);
    } catch (e) {
      console.error(e);
      const detail = e instanceof Error ? e.message : String(e);
      setError(
        `OCR conversion failed. ${detail ? `Details: ${detail}. ` : ''}Try again with "English" first for maximum compatibility.`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 w-full bg-slate-50 dark:bg-slate-950">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white">
            Searchable PDF (OCR)
          </h1>
          <p className="mt-3 text-slate-600 dark:text-slate-400">
            Image-only or scanned PDF ko searchable text PDF me convert karein. Original page design same rehta hai,
            bas hidden OCR text layer add hoti hai.
          </p>
        </div>

        {!file ? (
          <FileDropzone
            onDrop={onDrop}
            multiple={false}
            title="Select scanned PDF"
            subtitle="Drop image-based PDF to make it searchable"
          />
        ) : (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 space-y-5">
            <div className="flex items-start gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
              <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 dark:text-white truncate">{file.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-[1fr_auto] gap-4 items-end">
              <label className="text-sm text-slate-600 dark:text-slate-300">
                OCR Language
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  value={lang}
                  onChange={(e) => setLang(e.target.value as OCRLang)}
                  disabled={busy}
                >
                  <option value="eng">English</option>
                  <option value="hin">Hindi</option>
                  <option value="eng+hin">Hindi + English</option>
                </select>
              </label>
              <button
                type="button"
                onClick={runOcrAndDownload}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold px-5 py-2.5"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanSearch className="w-4 h-4" />}
                {busy ? `Processing ${progress}%` : 'Convert to Searchable PDF'}
              </button>
            </div>

            {busy && (
              <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}

            {error && (
              <p className="text-sm rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setFile(null)}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                Choose another file
              </button>
              <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                <Download className="w-3.5 h-3.5" />
                Output will auto-download after conversion
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
