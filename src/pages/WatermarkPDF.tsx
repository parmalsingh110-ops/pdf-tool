import { useState, useRef, useEffect } from 'react';
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import { Download, FileText, Droplets, AlignCenter, Type, Image as ImageIcon, Eye } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

type WatermarkType = 'text' | 'image';
type Position = 'center' | 'diagonal' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';

const POSITIONS: { id: Position; label: string }[] = [
  { id: 'diagonal', label: 'Diagonal' },
  { id: 'center', label: 'Center' },
  { id: 'top-left', label: 'Top Left' },
  { id: 'top-center', label: 'Top Center' },
  { id: 'top-right', label: 'Top Right' },
  { id: 'bottom-left', label: 'Bottom Left' },
  { id: 'bottom-center', label: 'Bottom Center' },
  { id: 'bottom-right', label: 'Bottom Right' },
];

export default function WatermarkPDF() {
  useSEO('Add Watermark to PDF Online Free | PDF Media Suite', 'Add text or image watermarks to PDF with opacity, position, color and size controls. Free, browser-based, no upload.');
  usePageSEO('Add Watermark to PDF', 'Add custom text or image watermarks to PDF pages. Control opacity, position, font size, color, and rotation. Free online PDF watermark tool.');

  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<WatermarkType>('text');

  // Text options
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [fontSize, setFontSize] = useState(60);
  const [opacity, setOpacity] = useState(0.3);
  const [color, setColor] = useState('#e53e3e');
  const [position, setPosition] = useState<Position>('diagonal');
  const [tileAll, setTileAll] = useState(false);

  // Image options
  const [wmImage, setWmImage] = useState<string | null>(null);
  const [wmImageName, setWmImageName] = useState('');
  const [imgScale, setImgScale] = useState(0.3);

  // State
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [previewThumb, setPreviewThumb] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);

  // Generate preview thumbnail on first page
  const generatePreview = async () => {
    if (!file) return;
    setLoadingPreview(true);
    try {
      const ab = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
      const page = await pdf.getPage(1);
      const vp = page.getViewport({ scale: 0.8 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

      // Overlay watermark on preview
      if (type === 'text' && watermarkText) {
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.fillStyle = `rgba(${r * 255},${g * 255},${b * 255},1)`;
        const scaled = (fontSize / 72) * vp.scale * 96;
        ctx.font = `bold ${scaled}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (position === 'diagonal') {
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate(-Math.PI / 4);
          ctx.fillText(watermarkText, 0, 0);
        } else {
          const [cx, cy] = getCanvasPos(position, canvas.width, canvas.height);
          ctx.fillText(watermarkText, cx, cy);
        }
        ctx.restore();
      }

      setPreviewThumb(canvas.toDataURL('image/jpeg', 0.85));
      canvas.width = 0; canvas.height = 0;
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    if (file) generatePreview();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, watermarkText, fontSize, opacity, color, position, type]);

  const getCanvasPos = (pos: Position, w: number, h: number): [number, number] => {
    const pad = 40;
    switch (pos) {
      case 'top-left': return [pad, pad];
      case 'top-center': return [w / 2, pad];
      case 'top-right': return [w - pad, pad];
      case 'bottom-left': return [pad, h - pad];
      case 'bottom-center': return [w / 2, h - pad];
      case 'bottom-right': return [w - pad, h - pad];
      default: return [w / 2, h / 2];
    }
  };

  const handleDrop = (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    setFile(acceptedFiles[0]);
    setResultUrl(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setWmImageName(f.name);
    const reader = new FileReader();
    reader.onload = ev => setWmImage(ev.target?.result as string);
    reader.readAsDataURL(f);
  };

  const hexToRgb01 = (hex: string) => {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16) / 255,
      g: parseInt(h.substring(2, 4), 16) / 255,
      b: parseInt(h.substring(4, 6), 16) / 255,
    };
  };

  const calcXY = (pos: Position, pw: number, ph: number, tw: number, th: number): { x: number; y: number } => {
    const pad = 30;
    switch (pos) {
      case 'top-left': return { x: pad, y: ph - th - pad };
      case 'top-center': return { x: pw / 2 - tw / 2, y: ph - th - pad };
      case 'top-right': return { x: pw - tw - pad, y: ph - th - pad };
      case 'bottom-left': return { x: pad, y: pad };
      case 'bottom-center': return { x: pw / 2 - tw / 2, y: pad };
      case 'bottom-right': return { x: pw - tw - pad, y: pad };
      default: return { x: pw / 2 - tw / 2, y: ph / 2 - th / 2 };
    }
  };

  const addWatermark = async () => {
    if (!file) return;
    setIsProcessing(true);
    try {
      const ab = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(ab);
      const pages = pdfDoc.getPages();

      if (type === 'text') {
        const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const { r, g, b } = hexToRgb01(color);

        for (const page of pages) {
          const { width, height } = page.getSize();
          const tw = font.widthOfTextAtSize(watermarkText, fontSize);
          const th = font.heightAtSize(fontSize);

          const drawSingle = (x: number, y: number, rot = 0) => {
            page.drawText(watermarkText, {
              x, y, size: fontSize, font,
              color: rgb(r, g, b), opacity,
              rotate: degrees(rot),
            });
          };

          if (tileAll) {
            const stepX = tw * 1.4;
            const stepY = th * 4;
            for (let ty = -height * 0.2; ty < height * 1.2; ty += stepY) {
              for (let tx = -width * 0.2; tx < width * 1.2; tx += stepX) {
                drawSingle(tx, ty, 30);
              }
            }
          } else if (position === 'diagonal') {
            const rad = (45 * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const x = width / 2 - ((tw / 2) * cos - (th / 2) * sin);
            const y = height / 2 - ((tw / 2) * sin + (th / 2) * cos);
            drawSingle(x, y, 45);
          } else {
            const { x, y } = calcXY(position, width, height, tw, th);
            drawSingle(x, y, 0);
          }
        }
      } else if (type === 'image' && wmImage) {
        let pdfImage;
        if (wmImage.includes('image/png')) {
          const bytes = await fetch(wmImage).then(r => r.arrayBuffer());
          pdfImage = await pdfDoc.embedPng(bytes);
        } else {
          const bytes = await fetch(wmImage).then(r => r.arrayBuffer());
          pdfImage = await pdfDoc.embedJpg(bytes);
        }
        for (const page of pages) {
          const { width, height } = page.getSize();
          const iw = pdfImage.width * imgScale;
          const ih = pdfImage.height * imgScale;
          const { x, y } = calcXY(position === 'diagonal' ? 'center' : position, width, height, iw, ih);
          page.drawImage(pdfImage, { x, y, width: iw, height: ih, opacity });
        }
      }

      const bytes = await pdfDoc.save();
      const blob = new Blob([bytes as any], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
    } catch (e) {
      console.error('Watermark error:', e);
      alert('Failed to add watermark. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-6 md:p-8 min-h-screen bg-gradient-to-br from-cyan-50/40 via-white to-slate-50">
      <div className="text-center mb-10 max-w-2xl">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-cyan-100 rounded-2xl mb-4">
          <Droplets className="w-7 h-7 text-cyan-600" />
        </div>
        <h1 className="text-4xl font-extrabold text-gray-900 mb-3">Add Watermark to PDF</h1>
        <p className="text-lg text-gray-500">Text or image watermark with full opacity, position and color control.</p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Drop PDF here or click to select" />
      ) : resultUrl ? (
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Droplets className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">Watermark Added!</h3>
          <p className="text-gray-500 mb-6">Your PDF is ready to download.</p>
          <a href={resultUrl} download={`watermarked_${file.name}`}
            className="inline-flex items-center gap-2 px-8 py-4 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 transition-colors shadow-md mb-4">
            <Download className="w-5 h-5" /> Download Watermarked PDF
          </a>
          <br />
          <button onClick={() => { setResultUrl(null); setFile(null); }}
            className="text-gray-500 hover:text-gray-800 font-medium text-sm mt-2">
            Watermark another PDF
          </button>
        </div>
      ) : (
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls */}
          <div className="lg:col-span-2 space-y-5">
            {/* File info */}
            <div className="flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-100">
              <div className="w-11 h-11 bg-cyan-50 rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-cyan-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{file.name}</p>
                <p className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <button onClick={() => { setFile(null); setResultUrl(null); }} className="text-sm text-gray-400 hover:text-red-500">Change</button>
            </div>

            {/* Type toggle */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider mb-4">Watermark Type</h3>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setType('text')}
                  className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${type === 'text' ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-gray-200 hover:border-gray-300'}`}>
                  <Type className="w-5 h-5" /><span className="font-semibold">Text</span>
                </button>
                <button onClick={() => setType('image')}
                  className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${type === 'image' ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-gray-200 hover:border-gray-300'}`}>
                  <ImageIcon className="w-5 h-5" /><span className="font-semibold">Image / Logo</span>
                </button>
              </div>
            </div>

            {/* Text options */}
            {type === 'text' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-5">
                <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider">Text Options</h3>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Watermark Text</label>
                  <input type="text" value={watermarkText} onChange={e => setWatermarkText(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-cyan-400 outline-none text-lg font-bold tracking-wider"
                    placeholder="CONFIDENTIAL" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Font Size: <span className="text-cyan-600">{fontSize}pt</span></label>
                    <input type="range" min={12} max={160} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} className="w-full accent-cyan-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Opacity: <span className="text-cyan-600">{Math.round(opacity * 100)}%</span></label>
                    <input type="range" min={5} max={100} value={Math.round(opacity * 100)} onChange={e => setOpacity(Number(e.target.value) / 100)} className="w-full accent-cyan-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Color</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-12 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5" />
                    {['#e53e3e','#dd6b20','#d69e2e','#38a169','#3182ce','#805ad5','#667eea','#000000'].map(c => (
                      <button key={c} onClick={() => setColor(c)} style={{ backgroundColor: c }}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${color === c ? 'border-gray-800 scale-110' : 'border-white shadow-sm hover:scale-105'}`} />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={tileAll} onChange={e => setTileAll(e.target.checked)} className="rounded accent-cyan-500" />
                    Tile watermark across entire page
                  </label>
                </div>
              </div>
            )}

            {/* Image options */}
            {type === 'image' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-5">
                <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider">Image Options</h3>
                <div>
                  <button onClick={() => imgInputRef.current?.click()}
                    className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-cyan-400 hover:text-cyan-600 transition-colors flex items-center justify-center gap-2">
                    <ImageIcon className="w-5 h-5" />
                    {wmImageName || 'Click to upload watermark image (PNG/JPG)'}
                  </button>
                  <input ref={imgInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleImageUpload} />
                </div>
                {wmImage && (
                  <div className="flex items-center gap-4">
                    <img src={wmImage} alt="Watermark preview" className="w-24 h-24 object-contain border border-gray-200 rounded-xl bg-checkerboard" style={{ background: 'repeating-conic-gradient(#f0f0f0 0% 25%, white 0% 50%) 0 0 / 16px 16px' }} />
                    <div className="flex-1">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Scale: <span className="text-cyan-600">{Math.round(imgScale * 100)}%</span></label>
                      <input type="range" min={5} max={100} value={Math.round(imgScale * 100)} onChange={e => setImgScale(Number(e.target.value) / 100)} className="w-full accent-cyan-500" />
                      <label className="block text-sm font-semibold text-gray-700 mb-2 mt-3">Opacity: <span className="text-cyan-600">{Math.round(opacity * 100)}%</span></label>
                      <input type="range" min={5} max={100} value={Math.round(opacity * 100)} onChange={e => setOpacity(Number(e.target.value) / 100)} className="w-full accent-cyan-500" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Position grid */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
                <AlignCenter className="w-4 h-4" /> Position
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {POSITIONS.map(p => (
                  <button key={p.id} onClick={() => setPosition(p.id)}
                    className={`py-2 px-2 rounded-xl text-xs font-semibold border-2 transition-all ${position === p.id ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-gray-200 text-gray-600 hover:border-cyan-300'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={addWatermark} disabled={isProcessing || (type === 'image' && !wmImage) || (type === 'text' && !watermarkText)}
              className="w-full py-4 bg-cyan-600 text-white text-base font-bold rounded-xl hover:bg-cyan-700 transition-colors disabled:opacity-50 shadow-md flex items-center justify-center gap-2">
              {isProcessing ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Adding Watermark...</>
              ) : (
                <><Droplets className="w-5 h-5" />Add Watermark to All Pages</>
              )}
            </button>
          </div>

          {/* Live preview */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
              <Eye className="w-4 h-4" /> Live Preview <span className="text-xs font-normal text-gray-400">(Page 1)</span>
            </h3>
            {loadingPreview ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3">
                <div className="w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-gray-400">Rendering preview...</p>
              </div>
            ) : previewThumb ? (
              <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                <img src={previewThumb} alt="Watermark preview" className="w-full" />
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-300 text-sm">Preview loading…</div>
            )}
            <p className="text-xs text-gray-400 text-center mt-3">Preview updates with your settings</p>
          </div>
        </div>
      )}
    </div>
  );
}
