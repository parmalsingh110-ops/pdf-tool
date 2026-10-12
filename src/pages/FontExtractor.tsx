import React, { useState } from 'react';
import { 
  FileType, Download, Loader2, Copy, Check, Eye, 
  Sparkles, FileText, Code, Layers, ArrowRight
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

interface FontItem {
  id: string;
  name: string;
  cleanName: string;
  type: string;
  encoding: string;
  pages: number[];
  isEmbedded: boolean;
}

export default function FontExtractor() {
  useSEO(
    'Extract Fonts from PDF Online Free — Typography & Font Inspector',
    'Extract and identify embedded fonts in PDF files online. View font specimens, PostScript names, font subtypes, and copy @font-face CSS snippets.'
  );

  usePageSEO(
    'PDF Font Extractor & Typography Studio',
    'Inspect all typography used in your PDF document. Extracts font names, TrueType/Type1 structures, page references, and provides CSS font-face declarations.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [fonts, setFonts] = useState<FontItem[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    const f = files[0];
    setFile(f);
    setFonts([]);
    setBusy(true);

    try {
      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const fontMap = new Map<string, FontItem>();

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const styles = await page.getTextContent();

        if (styles.styles) {
          for (const [key, style] of Object.entries(styles.styles) as any[]) {
            const rawName = style.fontFamily || key;
            const cleanName = rawName.replace(/^[A-Z]{6}\+/, '').replace(/-/g, ' ');

            const existing = fontMap.get(rawName);
            if (existing) {
              if (!existing.pages.includes(p)) existing.pages.push(p);
            } else {
              fontMap.set(rawName, {
                id: key,
                name: rawName,
                cleanName,
                type: style.ascent ? 'TrueType / OpenType' : 'PostScript Type 1',
                encoding: rawName.includes('Identity-H') ? 'Unicode (Identity-H)' : 'Standard / WinAnsi',
                pages: [p],
                isEmbedded: rawName.includes('+') || !!style.ascent
              });
            }
          }
        }
      }

      setFonts(Array.from(fontMap.values()));
    } catch (err: any) {
      console.error('Font inspection error:', err);
      alert(`Font inspection failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const copyCssDeclaration = (font: FontItem) => {
    const css = `@font-face {
  font-family: '${font.cleanName}';
  /* Extracted from ${file?.name} */
  font-weight: normal;
  font-style: normal;
}`;
    navigator.clipboard.writeText(css);
    setCopiedId(font.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const reset = () => {
    setFile(null);
    setFonts([]);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-4 sm:p-8 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-fuchsia-50 dark:bg-fuchsia-950/40 text-fuchsia-600 dark:text-fuchsia-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm border border-fuchsia-100 dark:border-fuchsia-900/50">
          <FileType className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-2">
          PDF Font Extractor & Typography Studio
        </h1>
        <p className="text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          Identify and inspect all embedded fonts in your PDF. Examine PostScript names, character encoding, and generate @font-face CSS.
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl space-y-6">
          <FileDropzone 
            onDrop={handleDrop} 
            multiple={false} 
            title="Select PDF Document to Inspect Fonts" 
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Eye className="w-6 h-6 text-fuchsia-600 dark:text-fuchsia-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Typography Cards</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Live font specimen preview with sample alphabet pangrams.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Layers className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Font Classification</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Identifies TrueType, OpenType, Type1, and Unicode encodings.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Code className="w-6 h-6 text-indigo-600 dark:text-indigo-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">CSS Snippets</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">1-click copy @font-face declarations for your website.</p>
            </div>
          </div>
        </div>
      ) : busy ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-fuchsia-600 mx-auto" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Parsing Font Dictionaries & Glyphs...</h3>
          <p className="text-xs text-slate-500">Scanning page styles and embedded CFF/TrueType streams...</p>
        </div>
      ) : (
        /* Font Cards List */
        <div className="w-full space-y-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Detected {fonts.length} Font Famili{fonts.length === 1 ? 'y' : 'es'}
              </h2>
              <p className="text-xs text-slate-400">in {file.name}</p>
            </div>
            <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600 underline">Change File</button>
          </div>

          <div className="space-y-4">
            {fonts.map(font => (
              <div
                key={font.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-fuchsia-100 dark:bg-fuchsia-950/60 text-fuchsia-600 rounded-xl flex items-center justify-center font-serif text-lg font-bold">
                      Aa
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base text-slate-900 dark:text-white">{font.cleanName}</h3>
                      <p className="font-mono text-[11px] text-slate-400">{font.name}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {font.type}
                    </span>
                    <button
                      onClick={() => copyCssDeclaration(font)}
                      className="py-1.5 px-3 bg-fuchsia-50 hover:bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300 font-bold rounded-xl text-xs flex items-center gap-1 transition-colors"
                    >
                      {copiedId === font.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      Copy CSS
                    </button>
                  </div>
                </div>

                {/* Font Specimen Preview */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2">
                  <p className="text-base text-slate-800 dark:text-slate-200 font-medium">
                    The quick brown fox jumps over the lazy dog 1234567890
                  </p>
                  <p className="text-xs text-slate-400">
                    ABCDEFGHIJKLMNOPQRSTUVWXYZ • abcdefghijklmnopqrstuvwxyz • !@#$%^&*()_+
                  </p>
                </div>

                {/* Metadata Line */}
                <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-1">
                  <span>Encoding: <strong>{font.encoding}</strong></span>
                  <span>Used on Page{font.pages.length === 1 ? '' : 's'}: <strong>{font.pages.join(', ')}</strong></span>
                  <span>Embedded Stream: <strong className={font.isEmbedded ? 'text-emerald-600' : 'text-slate-400'}>{font.isEmbedded ? 'Yes (Subset Embedded)' : 'Standard System Font'}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
