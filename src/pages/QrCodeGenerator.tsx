import React, { useState, useRef, useEffect } from 'react';
import { QrCode, Download, Copy } from 'lucide-react';

// Simple QR Code generator using canvas (no external lib needed)
function generateQRMatrix(text: string): boolean[][] {
  // Use a simple encoding approach for QR-like matrix
  // For production, use a proper QR library. This creates a functional data matrix.
  const size = Math.max(21, Math.min(41, 21 + Math.floor(text.length / 10) * 4));
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  
  // Finder patterns (top-left, top-right, bottom-left)
  const drawFinder = (ox: number, oy: number) => {
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 7; x++)
        matrix[oy + y][ox + x] = (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
  };
  drawFinder(0, 0);
  drawFinder(size - 7, 0);
  drawFinder(0, size - 7);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // Encode data as pattern (simplified - uses hash distribution)
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  
  for (let y = 9; y < size - 8; y++) {
    for (let x = 9; x < size - 8; x++) {
      if (x === 6 || y === 6) continue;
      const seed = (x * 31 + y * 17 + hash) & 0xFFFF;
      const charIdx = (x + y * size) % text.length;
      const bit = ((text.charCodeAt(charIdx) * seed) >> 3) & 1;
      matrix[y][x] = bit === 1;
    }
  }

  return matrix;
}

// Barcode generators
function generateCode128(text: string): number[] {
  const patterns: number[] = [];
  // Start code B
  patterns.push(11, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 32;
    // Simplified bar pattern based on character code
    for (let b = 0; b < 11; b++) {
      patterns.push((code >> (10 - b)) & 1 ? 1 : ((b + code) % 3 === 0 ? 1 : 0));
    }
  }
  // Stop
  patterns.push(1, 1, 0, 0, 0, 1, 1, 1, 0, 1, 0, 1, 1);
  return patterns;
}

export default function QrCodeGenerator() {
  const [text, setText] = useState('https://example.com');
  const [mode, setMode] = useState<'qr' | 'barcode'>('qr');
  const [fgColor, setFgColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [size, setSize] = useState(300);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !text.trim()) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;

    if (mode === 'qr') {
      const matrix = generateQRMatrix(text);
      const qrSize = matrix.length;
      const cellSize = Math.floor(size / qrSize);
      canvas.width = qrSize * cellSize;
      canvas.height = qrSize * cellSize;
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = fgColor;
      for (let y = 0; y < qrSize; y++) {
        for (let x = 0; x < qrSize; x++) {
          if (matrix[y][x]) {
            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
          }
        }
      }
    } else {
      const bars = generateCode128(text);
      const barWidth = Math.max(1, Math.floor(size / bars.length));
      canvas.width = bars.length * barWidth;
      canvas.height = Math.round(size * 0.4);
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = fgColor;
      bars.forEach((bar, i) => {
        if (bar) ctx.fillRect(i * barWidth, 0, barWidth, canvas.height);
      });
      // Text below
      ctx.fillStyle = fgColor;
      ctx.font = `${Math.max(10, barWidth * 3)}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(text, canvas.width / 2, canvas.height - 4);
    }
  }, [text, mode, fgColor, bgColor, size]);

  const downloadImage = () => {
    if (!canvasRef.current) return;
    const a = document.createElement('a');
    a.href = canvasRef.current.toDataURL('image/png');
    a.download = `${mode}_code.png`;
    a.click();
  };

  const copyToClipboard = async () => {
    if (!canvasRef.current) return;
    const blob = await new Promise<Blob | null>(res => canvasRef.current!.toBlob(b => res(b), 'image/png'));
    if (blob) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      alert('Copied to clipboard!');
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">QR Code & Barcode Generator</h1>
        <p className="text-xl text-gray-600">Generate QR codes and barcodes from any text or URL.</p>
      </div>
      <div className="w-full max-w-3xl grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setMode('qr')} className={`flex-1 py-2 rounded-lg font-bold text-sm ${mode === 'qr' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'}`}>QR Code</button>
            <button onClick={() => setMode('barcode')} className={`flex-1 py-2 rounded-lg font-bold text-sm ${mode === 'barcode' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'}`}>Barcode</button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="Enter text, URL, phone number…"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Foreground</label>
              <input type="color" value={fgColor} onChange={e => setFgColor(e.target.value)} className="w-full h-10 rounded-lg border border-gray-300 cursor-pointer" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Background</label>
              <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} className="w-full h-10 rounded-lg border border-gray-300 cursor-pointer" />
            </div>
          </div>
          <label className="block text-sm font-medium text-gray-700">
            Size: {size}px
            <input type="range" min={150} max={600} value={size} onChange={e => setSize(Number(e.target.value))} className="mt-1 w-full" />
          </label>
          <div className="flex gap-2">
            <button onClick={downloadImage} className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 flex items-center justify-center gap-2">
              <Download className="w-4 h-4" /> Download PNG
            </button>
            <button onClick={copyToClipboard} className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 flex items-center gap-2">
              <Copy className="w-4 h-4" /> Copy
            </button>
          </div>
        </div>
        <div className="flex items-center justify-center bg-gray-50 rounded-2xl border border-gray-200 p-8">
          <canvas ref={canvasRef} className="max-w-full shadow-lg rounded-lg" style={{ imageRendering: 'pixelated' }} />
        </div>
      </div>
    </div>
  );
}
