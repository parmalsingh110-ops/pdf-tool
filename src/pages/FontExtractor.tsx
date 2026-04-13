import React, { useState } from 'react';
import { FileType, Loader2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';

interface FontInfo {
  name: string;
  type: string;
  encoding: string;
  pages: number[];
}

export default function FontExtractor() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [fonts, setFonts] = useState<FontInfo[]>([]);

  const handleDrop = (files: File[]) => {
    if (files[0]) { setFile(files[0]); setFonts([]); }
  };

  const process = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const fontMap = new Map<string, FontInfo>();

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        // @ts-ignore — internal API to list fonts
        const opList = await page.getOperatorList();
        const styles = await page.getTextContent();
        
        // Extract font names from style entries
        if (styles.styles) {
          for (const [key, style] of Object.entries(styles.styles) as any[]) {
            const name = style.fontFamily || key;
            const existing = fontMap.get(name);
            if (existing) {
              if (!existing.pages.includes(p)) existing.pages.push(p);
            } else {
              fontMap.set(name, {
                name: name,
                type: style.ascent ? 'TrueType/OpenType' : 'Type1',
                encoding: 'Standard',
                pages: [p],
              });
            }
          }
        }
      }

      setFonts(Array.from(fontMap.values()));
    } catch (e: any) {
      alert(e?.message || 'Font extraction failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Font Extractor</h1>
        <p className="text-xl text-gray-600">List all fonts used in your PDF document.</p>
      </div>
      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className="w-full max-w-3xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="flex gap-3 mb-6">
            <button onClick={process} disabled={busy} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileType className="w-5 h-5" />}
              {busy ? 'Scanning…' : 'Extract Fonts'}
            </button>
            <button onClick={() => { setFile(null); setFonts([]); }} className="px-5 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200">Cancel</button>
          </div>
          {fonts.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-bold text-gray-700">Font Name</th>
                    <th className="text-left px-4 py-3 font-bold text-gray-700">Type</th>
                    <th className="text-left px-4 py-3 font-bold text-gray-700">Pages</th>
                  </tr>
                </thead>
                <tbody>
                  {fonts.map((f, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-2 font-medium text-gray-900">{f.name}</td>
                      <td className="px-4 py-2 text-gray-600">{f.type}</td>
                      <td className="px-4 py-2 text-gray-600">{f.pages.length > 5 ? `${f.pages.slice(0, 5).join(', ')}… (${f.pages.length} total)` : f.pages.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500">
                Found {fonts.length} unique font(s) in this PDF.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
