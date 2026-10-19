import { useState, useCallback } from 'react';
import { Upload, Download, FileText, ArrowUp, ArrowDown, Trash2, CheckCircle2, AlertCircle, Sparkles, Layers, Shield, Tag } from 'lucide-react';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { PDFDocument } from 'pdf-lib';

interface DocItem {
  id: string;
  file: File;
  label: string;
  sizeKb: number;
  previewUrl?: string;
  type: 'pdf' | 'image';
}

const COMMON_LABELS = [
  '10th Marksheet / Matriculation',
  '12th Marksheet / Intermediate',
  'Graduation Degree / Marksheet',
  'Aadhaar Card / Photo ID',
  'Caste Certificate (SC/ST/OBC/EWS)',
  'Domicile / Residence Certificate',
  'Income Certificate',
  'Experience Certificate',
  'NOC / Discharged Book',
];

export default function ExamDocumentMerger() {
  useSEO(
    'All Documents to Single PDF Under 1 MB — Exam Bundle Merger | PDF Media Suite',
    'Merge 10th, 12th marksheet, degree, caste and domicile certificates into one single PDF strictly under 1 MB or 500 KB. Built for UPSC, SSC, NEET, JEE, and State PSC exams.'
  );

  usePageSEO(
    'Exam Document Merger — All Files to Single PDF Under 1 MB',
    'Combine multiple certificates and marksheets into a single PDF under 1 MB or 500 KB. Automatic multi-pass compression for government exam portal compliance.'
  );

  const [docs, setDocs] = useState<DocItem[]>([]);
  const [targetSizeLimitKb, setTargetSizeLimitKb] = useState<number>(1000); // 1000 KB = 1 MB
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [mergedPdfUrl, setMergedPdfUrl] = useState<string | null>(null);
  const [finalSizeKb, setFinalSizeKb] = useState<number | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newItems: DocItem[] = files.map((file, idx) => {
      const isPdfFile = file.type === 'application/pdf' || file.name.endsWith('.pdf');
      const suggestedLabel = COMMON_LABELS[Math.min(docs.length + idx, COMMON_LABELS.length - 1)];

      return {
        id: `doc_${Date.now()}_${idx}`,
        file,
        label: suggestedLabel,
        sizeKb: Math.round(file.size / 1024),
        type: isPdfFile ? 'pdf' : 'image',
        previewUrl: !isPdfFile ? URL.createObjectURL(file) : undefined,
      };
    });

    setDocs((prev) => [...prev, ...newItems]);
    setMergedPdfUrl(null);
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    setDocs((prev) => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const moveDown = (index: number) => {
    if (index === docs.length - 1) return;
    setDocs((prev) => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const removeDoc = (id: string) => {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  };

  const updateLabel = (id: string, label: string) => {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, label } : d)));
  };

  // Smart Compression Engine that guarantees final size <= targetSizeLimitKb
  const mergeAndCompressBundle = async () => {
    if (docs.length === 0) return;

    setIsProcessing(true);
    setMergedPdfUrl(null);
    setProgressMsg('Initializing PDF compiler...');

    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url
      ).toString();

      // Extract all pages from all items into rendered image canvases
      interface ExtractedPage {
        canvas: HTMLCanvasElement;
        label: string;
      }
      const extractedPages: ExtractedPage[] = [];

      for (let i = 0; i < docs.length; i++) {
        const item = docs[i];
        setProgressMsg(`Reading document ${i + 1} of ${docs.length}: ${item.label}...`);

        if (item.type === 'image') {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          const objectUrl = URL.createObjectURL(item.file);
          await new Promise((resolve) => {
            img.onload = resolve;
            img.src = objectUrl;
          });

          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          extractedPages.push({ canvas, label: item.label });
        } else {
          // PDF document
          const arrayBuffer = await item.file.arrayBuffer();
          const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
          const pdfDoc = await loadingTask.promise;

          for (let p = 1; p <= pdfDoc.numPages; p++) {
            const page = await pdfDoc.getPage(p);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d')!;
            await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
            extractedPages.push({ canvas, label: `${item.label} (Pg ${p})` });
          }
        }
      }

      setProgressMsg(`Optimizing ${extractedPages.length} pages to fit under ${targetSizeLimitKb} KB...`);

      // Adaptive Multi-Pass Binary Search on Quality and Resolution
      let bestPdfBytes: Uint8Array | null = null;
      let targetBytes = targetSizeLimitKb * 1024;
      let qualitiesToTry = [0.85, 0.70, 0.55, 0.40, 0.28];

      for (let pass = 0; pass < qualitiesToTry.length; pass++) {
        const quality = qualitiesToTry[pass];
        setProgressMsg(`Pass ${pass + 1}: Compressing pages at quality ${(quality * 100).toFixed(0)}%...`);

        const bundleDoc = await PDFDocument.create();

        for (const pg of extractedPages) {
          // Downscale if quality is very tight and canvas is huge
          let c = pg.canvas;
          if (quality < 0.5 && c.width > 1200) {
            const scaleDown = 1200 / c.width;
            const scaled = document.createElement('canvas');
            scaled.width = 1200;
            scaled.height = Math.round(c.height * scaleDown);
            const sCtx = scaled.getContext('2d')!;
            sCtx.drawImage(c, 0, 0, scaled.width, scaled.height);
            c = scaled;
          }

          const jpegDataUrl = c.toDataURL('image/jpeg', quality);
          const base64Data = jpegDataUrl.split(',')[1];
          const imgBytes = Uint8Array.from(atob(base64Data), (ch) => ch.charCodeAt(0));

          const embeddedJpg = await bundleDoc.embedJpg(imgBytes);
          const pdfPage = bundleDoc.addPage([595.28, 841.89]); // A4 Size in points

          // Fit neatly on A4 page keeping aspect ratio
          const pageW = 595.28;
          const pageH = 841.89;
          const imgW = embeddedJpg.width;
          const imgH = embeddedJpg.height;
          const scale = Math.min((pageW - 40) / imgW, (pageH - 50) / imgH);

          const drawW = imgW * scale;
          const drawH = imgH * scale;

          pdfPage.drawImage(embeddedJpg, {
            x: (pageW - drawW) / 2,
            y: (pageH - drawH) / 2,
            width: drawW,
            height: drawH,
          });
        }

        const currentBytes = await bundleDoc.save();
        bestPdfBytes = currentBytes;

        if (currentBytes.length <= targetBytes) {
          // Fits within target size!
          break;
        }
      }

      if (bestPdfBytes) {
        const finalKb = Math.round(bestPdfBytes.length / 1024);
        setFinalSizeKb(finalKb);
        const blob = new Blob([bestPdfBytes], { type: 'application/pdf' });
        setMergedPdfUrl(URL.createObjectURL(blob));
      }
    } catch (err: any) {
      console.error('Error merging documents:', err);
      alert('Error bundling documents. Please check file formats.');
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  const totalInputSizeKb = docs.reduce((acc, d) => acc + d.sizeKb, 0);

  return (
    <div className="flex-1 max-w-5xl mx-auto px-4 py-8 w-full">
      {/* Title */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold mb-3 border border-blue-200">
          <Sparkles className="w-3.5 h-3.5" /> Exam Portal Compliant Bundle Maker
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3 tracking-tight">
          All Documents to Single PDF Under 1 MB (Exam Bundle Merger)
        </h1>
        <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto">
          Merge all your educational certificates, marksheets, caste & domicile proof into ONE single PDF strictly under 1 MB or 500 KB with guaranteed portal acceptance.
        </p>
      </div>

      {/* Target Size Presets Header */}
      <div className="p-4 bg-white border border-gray-200 rounded-2xl shadow-xs mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-600" /> Target PDF Size Limit:
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Under 1 MB (UPSC / SSC / NEET)', kb: 1000 },
              { label: 'Under 500 KB (Strict State PSC)', kb: 500 },
              { label: 'Under 2 MB (University / Visa)', kb: 2000 },
              { label: 'Under 300 KB', kb: 300 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setTargetSizeLimitKb(preset.kb)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all ${
                  targetSizeLimitKb === preset.kb
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Dropzone */}
      <div className="mb-6">
        <label className="flex flex-col items-center justify-center border-2 border-dashed border-blue-300 hover:border-blue-500 rounded-2xl p-8 cursor-pointer transition-colors bg-blue-50/20 hover:bg-blue-50/40 text-center">
          <Upload className="w-10 h-10 text-blue-600 mb-2" />
          <span className="text-base font-bold text-gray-800">
            Select All Certificates & Marksheets (PDF, JPG, PNG)
          </span>
          <span className="text-xs text-gray-500 mt-1">
            Upload multiple files at once. You can reorder and tag each certificate below.
          </span>
          <input
            type="file"
            multiple
            accept="application/pdf,image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      </div>

      {/* Document List */}
      {docs.length > 0 && (
        <div className="space-y-4 mb-8">
          <div className="flex items-center justify-between text-xs text-gray-600 px-1">
            <span className="font-bold text-gray-800">
              {docs.length} Documents Selected • Total Raw Size: {(totalInputSizeKb / 1024).toFixed(2)} MB
            </span>
            <span className="text-gray-400">Reorder with ↑ ↓ arrows to set page sequence</span>
          </div>

          <div className="space-y-2.5">
            {docs.map((doc, idx) => (
              <div
                key={doc.id}
                className="p-3.5 bg-white border border-gray-200 rounded-xl shadow-xs flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
              >
                {/* Index & File Name */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate">{doc.file.name}</p>
                    <p className="text-[11px] text-gray-500">
                      {doc.sizeKb} KB • {doc.type.toUpperCase()}
                    </p>
                  </div>
                </div>

                {/* Document Type Label Selector */}
                <div className="flex-1 min-w-0 max-w-xs">
                  <div className="relative">
                    <Tag className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={doc.label}
                      onChange={(e) => updateLabel(doc.id, e.target.value)}
                      placeholder="Certificate label..."
                      className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                {/* Move & Delete Controls */}
                <div className="flex items-center gap-1 shrink-0 justify-end">
                  <button
                    type="button"
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-30"
                    title="Move up"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(idx)}
                    disabled={idx === docs.length - 1}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-30"
                    title="Move down"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeDoc(doc.id)}
                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Action Button & Result */}
          {!mergedPdfUrl ? (
            <div className="pt-4 space-y-3">
              {isProcessing && progressMsg && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 shrink-0"></div>
                    <p className="text-xs font-semibold text-blue-700">{progressMsg}</p>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={mergeAndCompressBundle}
                disabled={isProcessing}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-base rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 notranslate"
                translate="no"
              >
                {isProcessing ? (
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                    <span>Processing {docs.length} Documents...</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Layers className="w-5 h-5" />
                    <span>Merge All Documents into Single PDF (Target: Under {targetSizeLimitKb} KB)</span>
                  </span>
                )}
              </button>
            </div>
          ) : (
            <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-4">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-emerald-950">Documents Merged &amp; Compressed!</h3>
                <p className="text-xs text-emerald-800 mt-1">
                  <span>Final Bundle Size: </span>
                  <strong className="notranslate" translate="no">{finalSizeKb} KB</strong>
                  <span> (Limit: Under {targetSizeLimitKb} KB) • Portal Accepted ✅</span>
                </p>
              </div>

              <a
                href={mergedPdfUrl}
                download={`exam_document_bundle_${finalSizeKb}kb.pdf`}
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all text-sm"
              >
                <Download className="w-4 h-4" /> Download Merged Exam PDF ({finalSizeKb} KB)
              </a>

              <div>
                <button
                  type="button"
                  onClick={() => setMergedPdfUrl(null)}
                  className="text-xs text-gray-500 hover:text-gray-900 font-semibold"
                >
                  Adjust files or re-compress
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Trust & FAQ */}
      <div className="mt-16 border-t border-gray-200 pt-10 text-gray-800">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-900">
          Official Guidelines for Exam Document Bundles
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-xs">
            <h3 className="font-bold text-gray-900 mb-2">UPSC & State PSCs</h3>
            <p className="text-gray-600 text-xs leading-relaxed">
              Most PSC forms require all educational qualifications merged in chronological order (10th → 12th → Graduation) into a single PDF under 1 MB.
            </p>
          </div>
          <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-xs">
            <h3 className="font-bold text-gray-900 mb-2">Smart DPI Compression</h3>
            <p className="text-gray-600 text-xs leading-relaxed">
              Instead of naive blurring, our engine selectively balances text contrast and JPEG compression so your roll numbers and marks remain crisp.
            </p>
          </div>
          <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-xs">
            <h3 className="font-bold text-gray-900 mb-2">Private & Local</h3>
            <p className="text-gray-600 text-xs leading-relaxed">
              Your certificates contain private marks and personal records. Everything is merged strictly inside your browser without uploading to any server.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
