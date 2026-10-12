import { useState, useRef, useEffect, useCallback } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Download, FileText, Hash, Check, Eye, Layers, Sparkles, RefreshCw } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

type NumberPosition = 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left';
type NumberFormat = 'page-n-of-total' | 'n-of-total' | 'page-n' | 'just-n' | 'dash-n-dash';
type FontFamily = 'Helvetica' | 'TimesRoman' | 'Courier';

const POSITIONS: { id: NumberPosition; label: string; xAlign: 'left' | 'center' | 'right'; yAlign: 'top' | 'bottom' }[] = [
  { id: 'top-left', label: 'Top Left', xAlign: 'left', yAlign: 'top' },
  { id: 'top-center', label: 'Top Center', xAlign: 'center', yAlign: 'top' },
  { id: 'top-right', label: 'Top Right', xAlign: 'right', yAlign: 'top' },
  { id: 'bottom-left', label: 'Bottom Left', xAlign: 'left', yAlign: 'bottom' },
  { id: 'bottom-center', label: 'Bottom Center', xAlign: 'center', yAlign: 'bottom' },
  { id: 'bottom-right', label: 'Bottom Right', xAlign: 'right', yAlign: 'bottom' },
];

const FORMATS: { id: NumberFormat; label: string; preview: string }[] = [
  { id: 'page-n-of-total', label: 'Page X of Y', preview: 'Page 1 of 10' },
  { id: 'n-of-total', label: 'X of Y', preview: '1 of 10' },
  { id: 'page-n', label: 'Page X', preview: 'Page 1' },
  { id: 'just-n', label: 'Numbers only', preview: '1' },
  { id: 'dash-n-dash', label: 'Hyphenated', preview: '- 1 -' },
];

const COLOR_SWATCHES = [
  { name: 'Black', hex: '#000000', rgb: [0, 0, 0] as [number, number, number] },
  { name: 'Dark Gray', hex: '#4b5563', rgb: [0.29, 0.33, 0.39] as [number, number, number] },
  { name: 'Navy Blue', hex: '#1e3a8a', rgb: [0.12, 0.23, 0.54] as [number, number, number] },
  { name: 'Crimson', hex: '#991b1b', rgb: [0.60, 0.11, 0.11] as [number, number, number] },
];

export default function PageNumbersPDF() {
  useSEO('Add Page Numbers to PDF Online Free | PDF Media Suite', 'Number PDF pages online with live visual preview. 6 positions, custom numbering formats, cover page skip, font styling. Free & secure in browser.');
  usePageSEO('Add Page Numbers to PDF Online', 'Add page numbers into PDF documents with live interactive preview. Choose position, format (Page 1 of N, 1 of N), font size, color, and skip cover pages.');

  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);

  // Numbering settings
  const [position, setPosition] = useState<NumberPosition>('bottom-center');
  const [format, setFormat] = useState<NumberFormat>('page-n-of-total');
  const [startNumber, setStartNumber] = useState(1);
  const [skipFirstPage, setSkipFirstPage] = useState(false);
  const [fontSize, setFontSize] = useState(11);
  const [margin, setMargin] = useState(25);
  const [colorHex, setColorHex] = useState('#000000');
  const [fontFamily, setFontFamily] = useState<FontFamily>('Helvetica');

  // Preview & Processing state
  const [previewThumb, setPreviewThumb] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [numberedUrl, setNumberedUrl] = useState<string | null>(null);

  const getFormattedText = (pageIdx: number, total: number) => {
    const num = pageIdx + startNumber;
    switch (format) {
      case 'page-n-of-total': return `Page ${num} of ${total}`;
      case 'n-of-total': return `${num} of ${total}`;
      case 'page-n': return `Page ${num}`;
      case 'just-n': return `${num}`;
      case 'dash-n-dash': return `- ${num} -`;
      default: return `${num}`;
    }
  };

  // Render live preview on Page 1 (or Page 2 if skipping cover)
  const renderPreview = useCallback(async (pdfFile: File) => {
    setLoadingPreview(true);
    try {
      const ab = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
      const previewPageNum = skipFirstPage && pdf.numPages > 1 ? 2 : 1;
      const page = await pdf.getPage(previewPageNum);
      const vp = page.getViewport({ scale: 0.7 });

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

      // Overlay the page number
      const displayPageNum = skipFirstPage && previewPageNum === 2 ? 1 : 0;
      const text = getFormattedText(displayPageNum, pdf.numPages);

      ctx.save();
      const scaledFontSize = (fontSize / 72) * vp.scale * 96;
      ctx.font = `${scaledFontSize}px ${fontFamily === 'Courier' ? 'Courier New' : fontFamily === 'TimesRoman' ? 'Times New Roman' : 'Arial'}`;
      ctx.fillStyle = colorHex;

      const padX = (margin / 72) * vp.scale * 96;
      const padY = (margin / 72) * vp.scale * 96;

      let tx = canvas.width / 2;
      let ty = canvas.height - padY;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (position.includes('left')) {
        tx = padX;
        ctx.textAlign = 'left';
      } else if (position.includes('right')) {
        tx = canvas.width - padX;
        ctx.textAlign = 'right';
      }

      if (position.includes('top')) {
        ty = padY;
      }

      // Draw subtle highlight box for preview visibility
      const textMetrics = ctx.measureText(text);
      const tw = textMetrics.width;
      const th = scaledFontSize;

      ctx.fillStyle = 'rgba(236, 72, 153, 0.15)'; // light pink indicator
      let boxX = tx - tw / 2 - 4;
      if (ctx.textAlign === 'left') boxX = tx - 4;
      if (ctx.textAlign === 'right') boxX = tx - tw - 4;
      ctx.fillRect(boxX, ty - th / 2 - 2, tw + 8, th + 4);

      // Draw actual text
      ctx.fillStyle = colorHex;
      ctx.fillText(text, tx, ty);
      ctx.restore();

      setPreviewThumb(canvas.toDataURL('image/jpeg', 0.85));
      canvas.width = 0; canvas.height = 0;
      page.cleanup();
    } catch (e) {
      console.error('Preview error:', e);
    } finally {
      setLoadingPreview(false);
    }
  }, [position, format, startNumber, skipFirstPage, fontSize, margin, colorHex, fontFamily]);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    const f = acceptedFiles[0];
    setFile(f);
    setNumberedUrl(null);
    try {
      const ab = await f.arrayBuffer();
      const pdf = await PDFDocument.load(ab);
      setPageCount(pdf.getPageCount());
    } catch { /* ignore */ }
    renderPreview(f);
  };

  useEffect(() => {
    if (file) {
      renderPreview(file);
    }
  }, [file, renderPreview]);

  const addPageNumbers = async () => {
    if (!file) return;
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);

      let standardFont = StandardFonts.Helvetica;
      if (fontFamily === 'TimesRoman') standardFont = StandardFonts.TimesRoman;
      if (fontFamily === 'Courier') standardFont = StandardFonts.Courier;
      const font = await pdfDoc.embedFont(standardFont);

      // Parse color hex
      const cleanHex = colorHex.replace('#', '');
      const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
      const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
      const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

      const pages = pdfDoc.getPages();
      const totalPages = pages.length;

      pages.forEach((page, idx) => {
        if (skipFirstPage && idx === 0) return; // skip cover page

        const effectiveIdx = skipFirstPage ? idx - 1 : idx;
        const text = getFormattedText(effectiveIdx, skipFirstPage ? totalPages - 1 : totalPages);
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const textHeight = font.heightAtSize(fontSize);

        let x = width / 2 - textWidth / 2;
        let y = margin;

        if (position.includes('left')) {
          x = margin;
        } else if (position.includes('right')) {
          x = width - margin - textWidth;
        }

        if (position.includes('top')) {
          y = height - margin - textHeight;
        }

        page.drawText(text, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(r, g, b),
        });
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      setNumberedUrl(URL.createObjectURL(blob));
    } catch (error) {
      console.error('Error adding page numbers:', error);
      alert('An error occurred while adding page numbers.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-6 md:p-8 min-h-screen bg-gradient-to-br from-pink-50/40 via-white to-slate-50">
      <div className="text-center mb-10 max-w-2xl">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-pink-100 rounded-2xl mb-4">
          <Hash className="w-7 h-7 text-pink-600" />
        </div>
        <h1 className="text-4xl font-extrabold text-gray-900 mb-3">Add Page Numbers to PDF</h1>
        <p className="text-lg text-gray-500">Number PDF pages with live visual preview. Choose positions, formats, and skip cover pages.</p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Drop PDF here or click to select" />
      ) : numberedUrl ? (
        /* Success Screen */
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="w-16 h-16 bg-pink-100 text-pink-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-1">Page Numbers Added!</h3>
          <p className="text-gray-500 mb-6">{pageCount} pages numbered successfully.</p>
          <a
            href={numberedUrl}
            download={`numbered_${file.name}`}
            className="inline-flex items-center justify-center gap-2 w-full py-4 bg-pink-600 text-white font-bold rounded-xl hover:bg-pink-700 transition-colors shadow-md mb-4"
          >
            <Download className="w-5 h-5" /> Download Numbered PDF
          </a>
          <br />
          <button
            onClick={() => { setFile(null); setNumberedUrl(null); }}
            className="text-gray-500 hover:text-gray-800 font-medium text-sm mt-2"
          >
            Number another PDF
          </button>
        </div>
      ) : (
        /* Interactive Workspace */
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Left: Controls (7 cols) */}
          <div className="lg:col-span-7 space-y-6">

            {/* File info bar */}
            <div className="flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-100">
              <div className="w-12 h-12 bg-pink-100 text-pink-600 rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{file.name}</p>
                <p className="text-xs text-gray-500">{pageCount} total pages · {(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <button
                onClick={() => { setFile(null); setPreviewThumb(null); }}
                className="text-xs text-gray-400 hover:text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"
              >
                Change
              </button>
            </div>

            {/* 1. Position Picker (6 positions) */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-3">
              <label className="block text-sm font-bold text-gray-800">
                Placement Position on Page
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {POSITIONS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setPosition(p.id)}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      position === p.id
                        ? 'border-pink-600 bg-pink-50 text-pink-900 font-bold shadow-xs'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-xs">{p.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Format selector */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-3">
              <label className="block text-sm font-bold text-gray-800">
                Numbering Format
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {FORMATS.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setFormat(f.id)}
                    className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                      format === f.id
                        ? 'border-pink-600 bg-pink-50 text-pink-900 font-semibold shadow-xs'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold">{f.label}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5 font-mono">{f.preview}</div>
                    </div>
                    {format === f.id && <Check className="w-4 h-4 text-pink-600 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Page range & Cover page options */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
              <label className="block text-sm font-bold text-gray-800">
                Page Range & Cover Options
              </label>
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100/80 transition-colors">
                  <input
                    type="checkbox"
                    checked={skipFirstPage}
                    onChange={e => setSkipFirstPage(e.target.checked)}
                    className="rounded text-pink-600 focus:ring-pink-500 w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-semibold text-gray-800">Skip First Page (Cover Page)</span>
                    <p className="text-[11px] text-gray-500">Do not print number on the title/cover page</p>
                  </div>
                </label>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-medium text-gray-700">Start counting from number:</span>
                  <input
                    type="number"
                    min={1}
                    value={startNumber}
                    onChange={e => setStartNumber(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-mono text-center focus:ring-2 focus:ring-pink-500 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* 4. Font, Size, Color & Margin */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
              <label className="block text-sm font-bold text-gray-800">
                Styling & Typography
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Font Size */}
                <div>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Font Size</span>
                    <span className="font-semibold">{fontSize} pt</span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={20}
                    value={fontSize}
                    onChange={e => setFontSize(Number(e.target.value))}
                    className="w-full accent-pink-600"
                  />
                </div>

                {/* Margin from edge */}
                <div>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Margin from Edge</span>
                    <span className="font-semibold">{margin} pt</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={60}
                    value={margin}
                    onChange={e => setMargin(Number(e.target.value))}
                    className="w-full accent-pink-600"
                  />
                </div>
              </div>

              {/* Font Family & Color */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Font Style</label>
                  <select
                    value={fontFamily}
                    onChange={e => setFontFamily(e.target.value as FontFamily)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white text-gray-800 focus:ring-2 focus:ring-pink-500 outline-none"
                  >
                    <option value="Helvetica">Helvetica (Standard Clean)</option>
                    <option value="TimesRoman">Times New Roman (Formal)</option>
                    <option value="Courier">Courier (Monospace / Code)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Color</label>
                  <div className="flex items-center gap-2">
                    {COLOR_SWATCHES.map(c => (
                      <button
                        key={c.hex}
                        onClick={() => setColorHex(c.hex)}
                        title={c.name}
                        className={`w-7 h-7 rounded-full border-2 transition-transform ${
                          colorHex === c.hex ? 'scale-110 border-pink-500 ring-2 ring-pink-200' : 'border-gray-200'
                        }`}
                        style={{ backgroundColor: c.hex }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <button
              onClick={addPageNumbers}
              disabled={isProcessing}
              className="w-full py-4 bg-pink-600 text-white text-base font-bold rounded-xl hover:bg-pink-700 transition-colors disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" /> Numbering Pages...
                </>
              ) : (
                <>
                  <Hash className="w-5 h-5" /> Add Page Numbers to PDF
                </>
              )}
            </button>
          </div>

          {/* Right: Live Interactive Canvas Preview (5 cols) */}
          <div className="lg:col-span-5 flex flex-col">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col sticky top-24">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5 uppercase tracking-wider">
                  <Eye className="w-4 h-4 text-pink-600" /> Live Page Preview
                </span>
                <span className="text-[11px] text-pink-600 font-semibold bg-pink-50 px-2 py-0.5 rounded-full">
                  {skipFirstPage ? 'Previewing Page 2' : 'Previewing Page 1'}
                </span>
              </div>

              {/* Canvas Preview Container */}
              <div className="bg-slate-100 rounded-xl border border-gray-200 p-3 min-h-[460px] flex items-center justify-center relative overflow-hidden">
                {loadingPreview ? (
                  <div className="flex flex-col items-center gap-2 text-gray-500">
                    <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs">Updating preview...</span>
                  </div>
                ) : previewThumb ? (
                  <div className="relative shadow-md rounded overflow-hidden max-h-[500px]">
                    <img
                      src={previewThumb}
                      alt="Live Page Preview"
                      className="max-h-[480px] w-auto object-contain mx-auto"
                    />
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">Loading page preview...</div>
                )}
              </div>

              <p className="text-[11px] text-gray-400 text-center mt-3">
                Preview reflects live placement, font size, margin, and format.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
