import { useState } from 'react';
import { Contrast, Download, Settings2, Sparkles } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import FileDropzone from '../components/FileDropzone';

type Mode = 'auto' | 'manual';

function hexToRgb(hex: string) {
  const v = hex.replace('#', '');
  if (v.length !== 6) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(v.substring(0, 2), 16),
    g: parseInt(v.substring(2, 4), 16),
    b: parseInt(v.substring(4, 6), 16),
  };
}

function colorDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number }
) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

export default function InkSaverPDF() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>('auto');
  const [sourceColor, setSourceColor] = useState('#000000');
  const [backgroundTarget, setBackgroundTarget] = useState('#ffffff');
  const [textTarget, setTextTarget] = useState('#000000');
  const [tolerance, setTolerance] = useState(58);
  const [lumaThreshold, setLumaThreshold] = useState(125);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const handleDrop = (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    setFile(acceptedFiles[0]);
    setResultUrl(null);
  };

  const handleConvert = async () => {
    if (!file) return;
    setIsProcessing(true);
    try {
      const inputBuffer = await file.arrayBuffer();
      const inputPdf = await pdfjsLib.getDocument({ data: new Uint8Array(inputBuffer) }).promise;
      const outputPdf = await PDFDocument.create();

      const src = hexToRgb(sourceColor);
      const bg = hexToRgb(backgroundTarget);
      const fg = hexToRgb(textTarget);

      for (let i = 1; i <= inputPdf.numPages; i++) {
        const page = await inputPdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) continue;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
          canvasContext: ctx,
          viewport,
          canvas,
        }).promise;

        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = img.data;

        for (let p = 0; p < data.length; p += 4) {
          const r = data[p];
          const g = data[p + 1];
          const b = data[p + 2];

          if (mode === 'manual') {
            const dist = colorDistance({ r, g, b }, src);
            if (dist <= tolerance) {
              data[p] = bg.r;
              data[p + 1] = bg.g;
              data[p + 2] = bg.b;
            }
          } else {
            const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            if (luma <= lumaThreshold) {
              data[p] = bg.r;
              data[p + 1] = bg.g;
              data[p + 2] = bg.b;
            } else if (luma >= 255 - lumaThreshold / 3) {
              data[p] = fg.r;
              data[p + 1] = fg.g;
              data[p + 2] = fg.b;
            }
          }
        }

        ctx.putImageData(img, 0, 0);
        const pngDataUrl = canvas.toDataURL('image/png');
        const pngBytes = await fetch(pngDataUrl).then((res) => res.arrayBuffer());
        const image = await outputPdf.embedPng(pngBytes);

        const outPage = outputPdf.addPage([viewport.width, viewport.height]);
        outPage.drawImage(image, { x: 0, y: 0, width: viewport.width, height: viewport.height });

        canvas.width = 0;
        canvas.height = 0;
      }

      const bytes = await outputPdf.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
    } catch (error) {
      console.error('Ink Saver failed:', error);
      alert('Failed to process PDF. Please try a valid file or adjust options.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-6 py-12">
      <header className="max-w-3xl mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-bold tracking-widest uppercase">
          <Sparkles className="w-3.5 h-3.5" />
          Premium Optimization
        </div>
        <h1 className="mt-4 text-5xl font-extrabold tracking-tight text-slate-900">Ink Saver PDF</h1>
        <p className="mt-4 text-lg text-slate-600 leading-relaxed">
          Intelligently reduce ink usage by converting heavy dark backgrounds into print-friendly tones.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          {!file ? (
            <section className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-rose-700/20 to-rose-400/20 rounded-3xl blur opacity-40 group-hover:opacity-70 transition" />
              <div className="relative bg-white rounded-3xl border-2 border-dashed border-slate-300 p-12">
                <FileDropzone
                  onDrop={handleDrop}
                  multiple={false}
                  accept={{ 'application/pdf': ['.pdf'] }}
                  title="Drop your PDF here"
                  subtitle="or click to browse from your device"
                  className="!border-none !p-0 !max-w-none !shadow-none !bg-transparent"
                />
              </div>
            </section>
          ) : (
            <section className="bg-white rounded-3xl border border-slate-200 p-8 shadow-[0px_20px_40px_rgba(0,0,0,0.04)]">
              <div className="flex items-center gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-200 mb-8">
                <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center shrink-0">
                  <Contrast className="w-7 h-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-semibold text-slate-900 truncate">{file.name}</p>
                  <p className="text-sm text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>

              {!resultUrl ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Tool Configuration</h2>
                      <p className="text-sm text-slate-500">Fine-tune optimization parameters</p>
                    </div>
                    <Settings2 className="w-5 h-5 text-slate-300" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <label className="text-sm font-semibold text-slate-700">
                      Mode
                      <select
                        value={mode}
                        onChange={(e) => setMode(e.target.value as Mode)}
                        className="mt-2 w-full px-3 py-2 border border-slate-300 rounded-xl"
                      >
                        <option value="auto">Auto (dark bg to light, light text to dark)</option>
                        <option value="manual">Manual (source to target)</option>
                      </select>
                    </label>
                    <label className="text-sm font-semibold text-slate-700">
                      Tolerance
                      <input
                        type="number"
                        value={tolerance}
                        min={0}
                        max={255}
                        onChange={(e) => setTolerance(Number(e.target.value))}
                        className="mt-2 w-full px-3 py-2 border border-slate-300 rounded-xl"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <label className="text-sm font-semibold text-slate-700">
                      Source Color (manual)
                      <input
                        type="color"
                        value={sourceColor}
                        onChange={(e) => setSourceColor(e.target.value)}
                        className="mt-2 w-full h-11 p-1 border border-slate-300 rounded-xl"
                      />
                    </label>
                    <label className="text-sm font-semibold text-slate-700">
                      Background Target
                      <input
                        type="color"
                        value={backgroundTarget}
                        onChange={(e) => setBackgroundTarget(e.target.value)}
                        className="mt-2 w-full h-11 p-1 border border-slate-300 rounded-xl"
                      />
                    </label>
                    <label className="text-sm font-semibold text-slate-700">
                      Text Target
                      <input
                        type="color"
                        value={textTarget}
                        onChange={(e) => setTextTarget(e.target.value)}
                        className="mt-2 w-full h-11 p-1 border border-slate-300 rounded-xl"
                      />
                    </label>
                  </div>

                  <label className="text-sm font-semibold text-slate-700 block">
                    Luma Threshold (auto mode)
                    <input
                      type="range"
                      min={30}
                      max={220}
                      value={lumaThreshold}
                      onChange={(e) => setLumaThreshold(Number(e.target.value))}
                      className="mt-2 w-full"
                    />
                    <span className="text-xs text-slate-500">Current: {lumaThreshold}</span>
                  </label>

                  <div className="flex gap-4">
                    <button
                      onClick={handleConvert}
                      disabled={isProcessing}
                      className="flex-1 py-4 bg-gradient-to-br from-rose-700 to-rose-500 text-white text-lg font-bold rounded-full hover:opacity-95 transition-colors disabled:opacity-50"
                    >
                      {isProcessing ? 'Converting...' : 'Convert Ink Saver PDF'}
                    </button>
                    <button
                      onClick={() => setFile(null)}
                      className="px-6 py-4 bg-slate-100 text-slate-700 text-lg font-semibold rounded-full hover:bg-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 text-center">
                  <div className="p-8 bg-emerald-50 rounded-2xl border border-emerald-200">
                    <h3 className="text-2xl font-bold text-emerald-800 mb-3">Optimization complete</h3>
                    <p className="text-emerald-700 text-sm mb-6">Your printer-friendly PDF is ready for download.</p>
                    <a
                      href={resultUrl}
                      download={`ink_saver_${file.name}`}
                      className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-emerald-600 text-white text-lg font-bold rounded-full hover:bg-emerald-700 transition-colors shadow-md"
                    >
                      <Download className="w-6 h-6" />
                      Download PDF
                    </a>
                  </div>
                  <button
                    onClick={() => {
                      setFile(null);
                      setResultUrl(null);
                    }}
                    className="text-slate-600 hover:text-slate-900 font-medium"
                  >
                    Process another file
                  </button>
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="lg:col-span-4 space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-[0px_20px_40px_rgba(0,0,0,0.04)]">
            <h3 className="text-lg font-bold mb-5 text-slate-900">How it works</h3>
            <ol className="space-y-5 text-sm text-slate-600">
              <li><strong className="text-slate-900">1. Upload:</strong> Select the heavy-ink PDF.</li>
              <li><strong className="text-slate-900">2. Analyze:</strong> Tool scans dark/light density.</li>
              <li><strong className="text-slate-900">3. Optimize:</strong> Export a print-friendly version.</li>
            </ol>
          </div>

          <div className="rounded-3xl p-8 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 text-white">
            <p className="text-xs uppercase tracking-widest opacity-80">Eco Tip</p>
            <h4 className="mt-2 text-2xl font-extrabold leading-tight">Save up to 30% cartridge life per page.</h4>
          </div>
        </aside>
      </div>
    </div>
  );
}

