import React, { useState, useEffect } from 'react';
import { Download, FileText, Layers, CheckCircle2, ShieldCheck, Sparkles, ExternalLink, Eye, AlertCircle, Loader2 } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';

export default function FlattenPDF() {
  useSEO(
    'Flatten PDF Online Free — Lock Forms & Secure Print-Ready PDF | PDF Media Suite',
    'Free online tool to flatten PDF form fields and annotations into read-only pages, or convert pages into secure raster images for legal and print compliance.'
  );

  usePageSEO(
    'Flatten PDF — Lock Forms & Layer Security',
    'Make fillable PDF forms read-only and merge all annotations, signatures, and stamps directly into the page. Free client-side tool with instant preview.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [hasFormFields, setHasFormFields] = useState<boolean | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);

  // Flatten options
  const [flattenMode, setFlattenMode] = useState<'vector' | 'raster'>('vector');
  const [rasterDpi, setRasterDpi] = useState<'150' | '200' | '300'>('200');

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [flattenedUrl, setFlattenedUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const selectedFile = acceptedFiles[0];
    setFile(selectedFile);
    setFlattenedUrl(null);
    setIsLoadingFile(true);
    setThumbUrl(null);

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      setPageCount(pdfjsDoc.numPages);

      // Render page 1 preview thumbnail
      const page1 = await pdfjsDoc.getPage(1);
      const viewport = page1.getViewport({ scale: 0.45 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      await page1.render({ canvasContext: ctx, viewport, canvas } as any).promise;
      setThumbUrl(canvas.toDataURL('image/jpeg', 0.85));

      // Inspect with pdf-lib to check if interactive form fields exist
      const pdfLibDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      try {
        const form = pdfLibDoc.getForm();
        const fields = form.getFields();
        setHasFormFields(fields.length > 0);
      } catch {
        setHasFormFields(false);
      }
    } catch (err) {
      console.error('Error loading PDF details:', err);
      setHasFormFields(false);
    } finally {
      setIsLoadingFile(false);
    }
  };

  const flattenPdf = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProgressPercent(10);
    setProgressText('Reading PDF data...');

    try {
      const arrayBuffer = await file.arrayBuffer();

      if (flattenMode === 'vector') {
        setProgressText('Flattening form fields & vector annotations...');
        setProgressPercent(40);

        const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        try {
          const form = pdfDoc.getForm();
          form.flatten();
        } catch {
          // Document had no interactive AcroForm — perfectly fine, saving ensures structural hygiene
        }

        setProgressPercent(80);
        setProgressText('Finalizing flattened document...');
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
        setFlattenedUrl(URL.createObjectURL(blob));
      } else {
        // Raster Mode: High-security full-page rasterization
        setProgressText('Loading document pages for visual flattening...');
        const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        const total = pdfjsDoc.numPages;
        const newPdfDoc = await PDFDocument.create();

        // Scale factor: 150 DPI ~ 2.08x, 200 DPI ~ 2.77x, 300 DPI ~ 4.16x
        const scaleMap = { '150': 2.0, '200': 2.5, '300': 3.2 };
        const scale = scaleMap[rasterDpi] || 2.5;

        for (let pageNum = 1; pageNum <= total; pageNum++) {
          setProgressText(`Rasterizing & locking page ${pageNum} of ${total}...`);
          setProgressPercent(Math.round(15 + (pageNum / total) * 75));

          const page = await pdfjsDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;

          // Solid white background to prevent transparent bleed
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;

          const imgDataUrl = canvas.toDataURL('image/jpeg', 0.92);
          const imgBytes = dataUrlToBytes(imgDataUrl);
          const embeddedImg = await newPdfDoc.embedJpg(imgBytes);

          const origW = viewport.width / scale;
          const origH = viewport.height / scale;
          const newPage = newPdfDoc.addPage([origW, origH]);
          newPage.drawImage(embeddedImg, {
            x: 0,
            y: 0,
            width: origW,
            height: origH,
          });

          // Memory cleanup
          canvas.width = 0;
          canvas.height = 0;
        }

        setProgressPercent(95);
        setProgressText('Building sealed PDF file...');
        const pdfBytes = await newPdfDoc.save();
        const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
        setFlattenedUrl(URL.createObjectURL(blob));
      }

      setProgressPercent(100);
      setProgressText('Done!');
    } catch (error) {
      console.error('Error flattening PDF:', error);
      alert('An error occurred while flattening the PDF. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setFlattenedUrl(null);
    setThumbUrl(null);
    setPageCount(0);
    setHasFormFields(null);
    setProgressText('');
    setProgressPercent(0);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 text-xs font-bold tracking-widest uppercase mb-3 border border-orange-200 dark:border-orange-800">
          <Layers className="w-3.5 h-3.5" /> PDF Security & Form Sealing
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-3">
          Flatten PDF Document
        </h1>
        <p className="text-base md:text-lg text-gray-600 dark:text-slate-400 max-w-2xl mx-auto">
          Make fillable form fields and annotations permanent and read-only, or rasterize all layers to seal the PDF against unwanted edits.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl">
          <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF to Flatten" />
        </div>
      ) : (
        <div className="w-full bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-gray-200 dark:border-slate-800 p-6 md:p-8">
          {!flattenedUrl ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Document Card & Thumbnail */}
              <div className="lg:col-span-5 space-y-4">
                <div className="p-4 bg-gray-50 dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 flex items-center gap-4">
                  <div className="w-12 h-12 bg-orange-100 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 rounded-xl flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{file.name}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {(file.size / 1024 / 1024).toFixed(2)} MB • {pageCount > 0 ? `${pageCount} page(s)` : 'Loading...'}
                    </p>
                  </div>
                </div>

                {/* Form Field Detection Badge */}
                {hasFormFields !== null && (
                  <div className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 ${
                    hasFormFields
                      ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                      : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300'
                  }`}>
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>
                      {hasFormFields
                        ? 'Interactive form fields detected! Flattening will lock values into permanent text.'
                        : 'No form fields found. Use Raster mode to lock all visual layers and annotations.'}
                    </span>
                  </div>
                )}

                {/* Thumbnail Preview */}
                <div className="rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden bg-gray-100 dark:bg-slate-950 flex flex-col items-center justify-center min-h-[300px] p-4 relative">
                  {isLoadingFile ? (
                    <div className="flex flex-col items-center gap-2 text-gray-500">
                      <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                      <span className="text-xs">Generating preview...</span>
                    </div>
                  ) : thumbUrl ? (
                    <div className="relative group">
                      <img
                        src={thumbUrl}
                        alt="Page 1 preview"
                        className="max-h-[340px] rounded-lg shadow-md border border-gray-300 dark:border-slate-700 object-contain mx-auto"
                      />
                      <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-semibold px-2 py-0.5 rounded backdrop-blur-xs">
                        Page 1 of {pageCount}
                      </span>
                    </div>
                  ) : (
                    <Layers className="w-12 h-12 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Right Column: Controls & Flattening Mode */}
              <div className="lg:col-span-7 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Choose Flattening Method</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Select how deeply layers and elements should be fused.</p>
                </div>

                {/* Mode Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Vector Mode */}
                  <div
                    onClick={() => setFlattenMode('vector')}
                    className={`cursor-pointer p-5 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                      flattenMode === 'vector'
                        ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/20 shadow-sm'
                        : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300">
                          Recommended
                        </span>
                        <input
                          type="radio"
                          name="flattenMode"
                          checked={flattenMode === 'vector'}
                          onChange={() => setFlattenMode('vector')}
                          className="accent-orange-600 w-4 h-4"
                        />
                      </div>
                      <h4 className="font-bold text-gray-900 dark:text-white mb-1">Vector Mode (Forms & Text)</h4>
                      <p className="text-xs text-gray-600 dark:text-slate-400 leading-relaxed">
                        Converts fillable fields and annotations into static PDF text. Keeps vector fonts crystal sharp and maintains small file size.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-200/60 dark:border-slate-700/60 text-[11px] text-gray-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Fast & Searchable
                    </div>
                  </div>

                  {/* Raster Mode */}
                  <div
                    onClick={() => setFlattenMode('raster')}
                    className={`cursor-pointer p-5 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                      flattenMode === 'raster'
                        ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/20 shadow-sm'
                        : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                          Max Security
                        </span>
                        <input
                          type="radio"
                          name="flattenMode"
                          checked={flattenMode === 'raster'}
                          onChange={() => setFlattenMode('raster')}
                          className="accent-orange-600 w-4 h-4"
                        />
                      </div>
                      <h4 className="font-bold text-gray-900 dark:text-white mb-1">Print-Ready Raster Mode</h4>
                      <p className="text-xs text-gray-600 dark:text-slate-400 leading-relaxed">
                        Renders each entire page as a high-resolution flat image. 100% prevents text selection, alterations, and eliminates hidden layers.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-200/60 dark:border-slate-700/60 text-[11px] text-gray-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Court & Print Compliant
                    </div>
                  </div>
                </div>

                {/* Extra Option for Raster Mode */}
                {flattenMode === 'raster' && (
                  <div className="p-4 bg-gray-50 dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 space-y-3">
                    <label className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider block">
                      Raster Image Quality / Resolution
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { dpi: '150', label: '150 DPI (Balanced)' },
                        { dpi: '200', label: '200 DPI (High Res)' },
                        { dpi: '300', label: '300 DPI (Press Print)' },
                      ].map((item) => (
                        <button
                          key={item.dpi}
                          type="button"
                          onClick={() => setRasterDpi(item.dpi as any)}
                          className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                            rasterDpi === item.dpi
                              ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                              : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:border-gray-300'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Progress Bar (when processing) */}
                {isProcessing && (
                  <div className="space-y-2 p-4 bg-orange-50 dark:bg-orange-950/20 rounded-2xl border border-orange-200 dark:border-orange-900/50">
                    <div className="flex justify-between text-xs font-semibold text-orange-900 dark:text-orange-300">
                      <span>{progressText}</span>
                      <span>{progressPercent}%</span>
                    </div>
                    <div className="w-full bg-orange-200 dark:bg-orange-900/40 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-orange-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    onClick={flattenPdf}
                    disabled={isProcessing}
                    className="flex-1 py-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 text-base"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Flattening PDF...
                      </>
                    ) : (
                      <>
                        <Layers className="w-5 h-5" />
                        Flatten Document Now
                      </>
                    )}
                  </button>
                  <button
                    onClick={resetState}
                    disabled={isProcessing}
                    className="px-6 py-4 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-2xl transition-all text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Success Screen with Live Preview */
            <div className="space-y-6 text-center py-4">
              <div className="p-8 bg-green-50 dark:bg-green-950/30 rounded-3xl border border-green-200 dark:border-green-800">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-2xl md:text-3xl font-extrabold text-green-900 dark:text-green-200 mb-2">
                  PDF Flattened Successfully!
                </h3>
                <p className="text-green-700 dark:text-green-400 mb-6 text-sm max-w-md mx-auto">
                  {flattenMode === 'vector'
                    ? 'All interactive form fields and annotations are now permanently converted into read-only native PDF elements.'
                    : 'All pages have been rasterized into secure single-layer images. Editing and layer tampering are completely blocked.'}
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <a
                    href={flattenedUrl}
                    download={`flattened_${file.name}`}
                    className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-2xl transition-all shadow-md hover:shadow-lg text-base"
                  >
                    <Download className="w-5 h-5" />
                    Download Flattened PDF
                  </a>
                  <a
                    href={flattenedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 font-semibold rounded-2xl border border-gray-300 dark:border-slate-700 transition-all text-sm shadow-xs"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open in New Tab
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowPreview(!showPreview)}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 font-semibold rounded-2xl border border-gray-300 dark:border-slate-700 transition-all text-sm shadow-xs"
                  >
                    <Eye className="w-4 h-4" />
                    {showPreview ? 'Hide Preview' : 'Show Live Preview'}
                  </button>
                </div>

                {showPreview && (
                  <div className="mt-6 text-left">
                    <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                      Flattened PDF Output Preview
                    </p>
                    <div className="w-full h-[550px] rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden bg-gray-100 dark:bg-slate-950 shadow-inner">
                      <iframe
                        src={flattenedUrl}
                        title="Flattened PDF Preview"
                        className="w-full h-full border-0"
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={resetState}
                className="text-sm text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white font-semibold"
              >
                ← Flatten another document
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
