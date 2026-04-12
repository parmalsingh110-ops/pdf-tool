import { useMemo, useState } from 'react';
import { FileCog, Download } from 'lucide-react';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import JSZip from 'jszip';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import * as XLSX from 'xlsx';
import PptxGenJS from 'pptxgenjs';
import FileDropzone from '../components/FileDropzone';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Target = 'pdf' | 'png' | 'jpg' | 'jpeg' | 'webp' | 'txt' | 'docx' | 'xlsx' | 'pptx' | 'zip';
type Kind = 'pdf' | 'image' | 'text' | 'unknown';

function detectKind(file: File): Kind {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) return 'pdf';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('text/') || file.name.toLowerCase().endsWith('.txt')) return 'text';
  return 'unknown';
}

function baseName(name: string) {
  return name.replace(/\.[^/.]+$/, '');
}

function extensionFor(target: Target) {
  if (target === 'jpeg') return '.jpeg';
  if (target === 'xlsx') return '.xlsx';
  if (target === 'pptx') return '.pptx';
  return target === 'zip' ? '.zip' : `.${target}`;
}

export default function UniversalConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState<Target>('pdf');
  const [quality, setQuality] = useState(0.9);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultExt, setResultExt] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const kind = file ? detectKind(file) : 'unknown';

  const targets = useMemo(() => {
    if (kind === 'pdf') return ['txt', 'docx', 'xlsx', 'pptx', 'zip', 'png', 'jpg', 'jpeg'] as Target[];
    if (kind === 'image') return ['pdf', 'png', 'jpg', 'jpeg', 'webp'] as Target[];
    if (kind === 'text') return ['pdf'] as Target[];
    return [] as Target[];
  }, [kind]);

  const handleDrop = (accepted: File[]) => {
    if (!accepted.length) return;
    setFile(accepted[0]);
    setResultUrl(null);
    setError(null);
  };

  const convertImage = async (f: File, outType: Target): Promise<Blob> => {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const m = new Image();
      m.onload = () => resolve(m);
      m.onerror = reject;
      m.src = URL.createObjectURL(f);
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');
    ctx.drawImage(img, 0, 0);

    if (outType === 'pdf') {
      const pdf = await PDFDocument.create();
      const jpgBytes = await fetch(canvas.toDataURL('image/jpeg', quality)).then((r) => r.arrayBuffer());
      const embedded = await pdf.embedJpg(jpgBytes);
      const p = pdf.addPage([embedded.width, embedded.height]);
      p.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
      return new Blob([await pdf.save()], { type: 'application/pdf' });
    }

    const mime = outType === 'png' ? 'image/png' : outType === 'webp' ? 'image/webp' : 'image/jpeg';
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
    if (!out) throw new Error('Failed to convert image');
    return out;
  };

  const convertPdf = async (f: File, outType: Target): Promise<Blob> => {
    const arrayBuffer = await f.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

    if (outType === 'txt') {
      let textOut = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        textOut += `\n\n--- Page ${i} ---\n` + content.items.map((x: any) => x.str).join(' ');
      }
      return new Blob([textOut], { type: 'text/plain;charset=utf-8' });
    }

    if (outType === 'docx' || outType === 'xlsx' || outType === 'pptx') {
      const pageTexts: string[] = [];
      const paragraphs: Paragraph[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const line = content.items.map((x: any) => x.str).join(' ');
        pageTexts.push(line);
        paragraphs.push(new Paragraph({ children: [new TextRun(line)] }));
      }
      if (outType === 'docx') {
        const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
        return await Packer.toBlob(doc);
      }
      if (outType === 'xlsx') {
        const rows = pageTexts.map((text, idx) => ({ Page: idx + 1, Text: text }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'PDF Text');
        const arr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        return new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      }
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_STANDARD';
      pageTexts.forEach((text, idx) => {
        const slide = pptx.addSlide();
        slide.addText(`Page ${idx + 1}`, { x: 0.5, y: 0.2, w: 9, h: 0.5, bold: true, fontSize: 20 });
        slide.addText(text || '(No extracted text)', { x: 0.5, y: 0.9, w: 9, h: 5.8, fontSize: 14 });
      });
      const blob = await pptx.write({ outputType: 'blob' });
      return blob as Blob;
    }

    const imageMime = outType === 'png' ? 'image/png' : 'image/jpeg';
    const imageExt = outType === 'png' ? 'png' : outType === 'jpeg' ? 'jpeg' : 'jpg';
    const zip = new JSZip();

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      const dataUrl = canvas.toDataURL(imageMime, quality);
      const binary = await fetch(dataUrl).then((r) => r.arrayBuffer());
      zip.file(`page_${i}.${outType === 'zip' ? 'png' : imageExt}`, binary);
    }

    return await zip.generateAsync({ type: 'blob' });
  };

  const convertText = async (f: File): Promise<Blob> => {
    const text = await f.text();
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const lines = text.split(/\r?\n/);
    let page = pdf.addPage([595, 842]);
    let y = 800;
    for (const line of lines) {
      if (y < 40) {
        y = 800;
        page = pdf.addPage([595, 842]);
      }
      page.drawText(line.slice(0, 120), { x: 36, y, size: 11, font });
      y -= 14;
    }
    return new Blob([await pdf.save()], { type: 'application/pdf' });
  };

  const handleConvert = async () => {
    if (!file) return;
    if (!targets.includes(target)) {
      setError('Selected conversion is not supported for this file type.');
      return;
    }
    setIsProcessing(true);
    setError(null);
    try {
      let blob: Blob;
      if (kind === 'image') blob = await convertImage(file, target);
      else if (kind === 'pdf') blob = await convertPdf(file, target);
      else if (kind === 'text' && target === 'pdf') blob = await convertText(file);
      else throw new Error('Unsupported conversion path');

      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      const ext = kind === 'pdf' && (target === 'png' || target === 'jpg' || target === 'jpeg') ? '.zip' : extensionFor(target);
      setResultExt(ext);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Conversion failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Universal Converter</h1>
        <p className="text-xl text-gray-600">Upload once, detect file type automatically, choose output format, convert and download.</p>
      </div>

      {!file ? (
        <FileDropzone
          onDrop={handleDrop}
          multiple={false}
          title="Select any supported file"
          subtitle="PDF, JPG, JPEG, PNG, WEBP, TXT"
          accept={{
            'application/pdf': ['.pdf'],
            'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'],
            'text/plain': ['.txt'],
          }}
        />
      ) : (
        <div className="w-full max-w-3xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-4 p-6 bg-gray-50 rounded-xl border border-gray-200 mb-8">
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
              <FileCog className="w-8 h-8" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-semibold text-gray-900 truncate">{file.name}</p>
                  <p className="text-sm text-gray-500">Detected: {kind.toUpperCase()} | Available targets depend on file type.</p>
            </div>
          </div>

          {!resultUrl ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm font-medium text-gray-700">
                  Convert to
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value as Target)}
                    className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    {targets.map((t) => (
                      <option key={t} value={t}>{t.toUpperCase()}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Quality ({Math.round(quality * 100)}%)
                  <input
                    type="range"
                    min={0.4}
                    max={1}
                    step={0.05}
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                    className="mt-2 w-full"
                  />
                </label>
              </div>

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
              )}

              <div className="flex gap-4">
                <button
                  onClick={handleConvert}
                  disabled={isProcessing || !targets.length}
                  className="flex-1 py-4 bg-indigo-600 text-white text-lg font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {isProcessing ? 'Converting...' : 'Convert File'}
                </button>
                <button
                  onClick={() => { setFile(null); setError(null); }}
                  className="px-6 py-4 bg-gray-100 text-gray-700 text-lg font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 text-center">
              <div className="p-8 bg-green-50 rounded-xl border border-green-200">
                <h3 className="text-2xl font-bold text-green-800 mb-4">Conversion complete!</h3>
                <a
                  href={resultUrl}
                  download={`${baseName(file.name)}${resultExt || extensionFor(target)}`}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 transition-colors shadow-md"
                >
                  <Download className="w-6 h-6" />
                  Download File
                </a>
              </div>
              <button
                onClick={() => { setFile(null); setResultUrl(null); setError(null); }}
                className="text-gray-600 hover:text-gray-900 font-medium"
              >
                Convert another file
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

