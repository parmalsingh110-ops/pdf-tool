import React, { useState } from 'react';
import { Hash, Download, Loader2 } from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import FileDropzone from '../components/FileDropzone';

type Position = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'bottom-center' | 'top-center';

export default function BatesNumbering() {
  const [file, setFile] = useState<File | null>(null);
  const [prefix, setPrefix] = useState('DOC-');
  const [startNumber, setStartNumber] = useState(1);
  const [padding, setPadding] = useState(5);
  const [fontSize, setFontSize] = useState(12);
  const [position, setPosition] = useState<Position>('bottom-right');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleDrop = (files: File[]) => {
    if (files[0]) { setFile(files[0]); setResultUrl(null); }
  };

  const handleProcess = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const pages = pdfDoc.getPages();
      
      pages.forEach((page, idx) => {
        const { width, height } = page.getSize();
        const num = startNumber + idx;
        const text = `${prefix}${String(num).padStart(padding, '0')}`;
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        
        let x = 0, y = 0;
        switch (position) {
          case 'bottom-right': x = width - textWidth - 30; y = 25; break;
          case 'bottom-left': x = 30; y = 25; break;
          case 'bottom-center': x = (width - textWidth) / 2; y = 25; break;
          case 'top-right': x = width - textWidth - 30; y = height - 30; break;
          case 'top-left': x = 30; y = height - 30; break;
          case 'top-center': x = (width - textWidth) / 2; y = height - 30; break;
        }
        
        page.drawText(text, {
          x, y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      alert(e?.message || 'Bates numbering failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Add Bates Numbering</h1>
        <p className="text-xl text-gray-600">Apply standard Bates numbering to your legal or business PDFs.</p>
      </div>
      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prefix</label>
              <input type="text" value={prefix} onChange={e => setPrefix(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="DOC-" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Number</label>
              <input type="number" value={startNumber} min={0} onChange={e => setStartNumber(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zero Padding</label>
              <input type="number" value={padding} min={1} max={10} onChange={e => setPadding(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Font Size</label>
              <input type="number" value={fontSize} min={6} max={24} onChange={e => setFontSize(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Position</label>
            <div className="grid grid-cols-3 gap-2">
              {([['top-left','↖ Top Left'],['top-center','↑ Top Center'],['top-right','↗ Top Right'],['bottom-left','↙ Bottom Left'],['bottom-center','↓ Bottom Center'],['bottom-right','↘ Bottom Right']] as const).map(([pos, label]) => (
                <button key={pos} onClick={() => setPosition(pos as Position)} className={`px-3 py-2 rounded-lg text-xs font-bold border ${position === pos ? 'bg-red-50 border-red-500 text-red-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{label}</button>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-4">Preview: {prefix}{String(startNumber).padStart(padding, '0')}</p>
          <div className="flex gap-3">
            <button onClick={handleProcess} disabled={busy} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Hash className="w-5 h-5" />}
              {busy ? 'Applying…' : 'Apply Bates Numbers'}
            </button>
            <button onClick={() => { setFile(null); setResultUrl(null); }} className="px-5 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200">Cancel</button>
          </div>
          {resultUrl && (
            <div className="mt-6 p-6 bg-green-50 rounded-xl border border-green-200 text-center">
              <a href={resultUrl} download={`bates_${file.name}`} className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700">
                <Download className="w-5 h-5" /> Download
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
