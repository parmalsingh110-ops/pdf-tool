import { useState } from "react";
import { LayoutGrid, Download, Loader2, FileText, Hash, CheckCircle2, ShieldCheck, Sparkles, Sliders } from "lucide-react";
import { PDFDocument, rgb } from "pdf-lib";
import FileDropzone from "../components/FileDropzone";
import { usePageSEO } from "../lib/usePageSEO";
import { useSEO } from '../hooks/useSEO';
import ToolSEOSection from "../components/ToolSEOSection";

const PRESETS = [
  { n: 2, cols: 1, rows: 2, label: '2-Up' },
  { n: 4, cols: 2, rows: 2, label: '4-Up' },
  { n: 6, cols: 2, rows: 3, label: '6-Up' },
  { n: 9, cols: 3, rows: 3, label: '9-Up' },
];

function getBestGrid(n: number): { cols: number; rows: number } {
  const preset = PRESETS.find(p => p.n === n);
  if (preset) return { cols: preset.cols, rows: preset.rows };
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return { cols, rows };
}

export default function NUpLayout() {
  useSEO(
    'N-Up PDF Layout Online Free — Print Multiple Pages Per Sheet | PDF Media Suite',
    'Print 2, 4, 6, 9 or more PDF pages per sheet online free. Native vector PDF layout with razor-sharp text, custom margins, and paper size controls.'
  );

  usePageSEO(
    "N-Up PDF — Print Multiple Pages Per Sheet (Vector Crisp)",
    "Print 2, 4, 6, 9, or custom PDF pages per sheet. Save paper with native vector N-Up page layout — 100% crisp text, no blur, free browser tool."
  );

  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<number>(4);
  const [customN, setCustomN] = useState<string>("");
  const [useCustom, setUseCustom] = useState(false);
  const [drawBorders, setDrawBorders] = useState(true);
  const [paperOrientation, setPaperOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeN = useCustom ? (parseInt(customN) || 4) : mode;

  const process = async () => {
    if (!file) return;
    const n = activeN;
    if (n < 2 || n > 36) { setError("Pages per sheet must be between 2 and 36."); return; }
    setError(null);
    setBusy(true);

    try {
      const { cols, rows } = getBestGrid(n);
      const buf = await file.arrayBuffer();

      // Native PDF-Lib vector embedding: 100% sharp text, tiny file size, no rasterization!
      const srcDoc = await PDFDocument.load(buf);
      const outDoc = await PDFDocument.create();
      const totalPages = srcDoc.getPageCount();

      // Embed all source pages as vector XObjects
      const embeddedPages = await outDoc.embedPages(srcDoc.getPages());

      // Sheet Dimensions (A4 in points: 595 x 842)
      const pageW = paperOrientation === 'landscape' ? 842 : 595;
      const pageH = paperOrientation === 'landscape' ? 595 : 842;

      const cellW = pageW / cols;
      const cellH = pageH / rows;

      const groups: number[][] = [];
      for (let i = 0; i < totalPages; i += n) {
        groups.push(
          Array.from({ length: n }, (_, j) => i + j + 1).filter(p => p <= totalPages)
        );
      }

      for (const group of groups) {
        const outPage = outDoc.addPage([pageW, pageH]);

        for (let gi = 0; gi < group.length; gi++) {
          const pgNum = group[gi];
          const emb = embeddedPages[pgNum - 1];
          if (!emb) continue;

          const col = gi % cols;
          const row = Math.floor(gi / cols);

          const srcW = emb.width;
          const srcH = emb.height;

          // Padding inside cell (8% margin)
          const padW = cellW * 0.08;
          const padH = cellH * 0.08;
          const targetW = cellW - padW;
          const targetH = cellH - padH;

          const scale = Math.min(targetW / srcW, targetH / srcH);
          const renderW = srcW * scale;
          const renderH = srcH * scale;

          // Position inside sheet coordinates (PDF coordinate system: (0,0) is bottom-left)
          const cellLeft = col * cellW;
          const cellBottom = pageH - (row + 1) * cellH;

          const posX = cellLeft + (cellW - renderW) / 2;
          const posY = cellBottom + (cellH - renderH) / 2;

          // Optional cell cut border
          if (drawBorders) {
            outPage.drawRectangle({
              x: cellLeft + 2,
              y: cellBottom + 2,
              width: cellW - 4,
              height: cellH - 4,
              borderColor: rgb(0.82, 0.86, 0.90),
              borderWidth: 0.5,
            });
          }

          // Draw pure vector page
          outPage.drawPage(emb, {
            x: posX,
            y: posY,
            width: renderW,
            height: renderH,
          });
        }
      }

      const bytes = await outDoc.save();
      setResultUrl(URL.createObjectURL(new Blob([bytes as any], { type: "application/pdf" })));
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Processing failed. Please try a different PDF.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setFile(null); setResultUrl(null); setError(null); };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 transition-colors">
      <div className="max-w-4xl mx-auto flex flex-col items-center justify-center">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 text-sm font-semibold mb-3">
            <LayoutGrid className="w-4 h-4" /> Vector-Crisp Multi-Page Imposition
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
            N-Up Page Layout
          </h1>
          <p className="text-base md:text-lg text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
            Print 2, 4, 6, 9 or custom PDF pages per sheet. Save paper with native vector imposition — 100% crisp text, no blur.
          </p>
        </div>

        {!file ? (
          <div className="w-full max-w-lg">
            <FileDropzone
              onDrop={f => { if (f[0]) { setFile(f[0]); setResultUrl(null); setError(null); } }}
              accept={{ 'application/pdf': ['.pdf'] }}
              multiple={false}
              title="Upload PDF for N-Up Layout"
              subtitle="Drop PDF to print multiple pages per sheet"
            />
          </div>
        ) : !resultUrl ? (
          <div className="w-full max-w-lg space-y-4">
            {/* File info */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-5 flex items-center justify-between gap-4 shadow-xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 bg-teal-50 dark:bg-teal-950/40 rounded-xl flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white truncate">{file.name}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              <button
                onClick={reset}
                className="text-xs font-semibold text-slate-500 hover:text-red-600"
              >
                Change
              </button>
            </div>

            {/* Pages per sheet */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-5 shadow-xs">
              <p className="font-semibold text-gray-900 dark:text-white mb-3 text-sm">Pages per Sheet Preset</p>

              {/* Preset buttons */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {PRESETS.map(m => (
                  <button
                    key={m.n}
                    type="button"
                    onClick={() => { setMode(m.n); setUseCustom(false); setError(null); }}
                    className={`p-3 rounded-xl border-2 text-center transition-colors cursor-pointer ${
                      !useCustom && mode === m.n
                        ? "border-teal-500 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400"
                        : "border-gray-200 dark:border-slate-800 text-gray-700 dark:text-slate-300 hover:border-teal-300 dark:hover:border-teal-700"
                    }`}
                  >
                    <div className={`grid gap-0.5 mx-auto mb-1 w-10 h-10 p-1 bg-gray-100 dark:bg-slate-800 rounded ${
                      m.cols === 3 ? "grid-cols-3" : m.cols === 2 ? "grid-cols-2" : "grid-cols-1"
                    }`}>
                      {Array.from({ length: m.n }).map((_, i) => (
                        <div key={i} className="bg-teal-400 dark:bg-teal-500 rounded-sm" />
                      ))}
                    </div>
                    <span className="text-xs font-bold">{m.n}-Up</span>
                  </button>
                ))}
              </div>

              {/* Custom number input */}
              <div className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-colors cursor-pointer mb-4 ${
                useCustom
                  ? "border-teal-500 bg-teal-50 dark:bg-teal-950/40"
                  : "border-gray-200 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700"
              }`}
                onClick={() => setUseCustom(true)}
              >
                <div className="w-10 h-10 bg-gray-100 dark:bg-slate-800 rounded-lg flex items-center justify-center shrink-0">
                  <Hash className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">Custom Number</p>
                  <p className="text-xs text-gray-500 dark:text-slate-500">Enter any value from 2 to 36 pages</p>
                </div>
                <input
                  type="number"
                  min={2}
                  max={36}
                  value={customN}
                  onClick={e => e.stopPropagation()}
                  onChange={e => { setCustomN(e.target.value); setUseCustom(true); setError(null); }}
                  placeholder="e.g. 12"
                  className={`w-20 text-center py-2 px-2 rounded-lg border text-sm font-bold bg-white dark:bg-slate-800 text-gray-900 dark:text-white transition-colors ${
                    useCustom ? "border-teal-400 ring-2 ring-teal-200 dark:ring-teal-900" : "border-gray-200 dark:border-slate-700"
                  }`}
                />
              </div>

              {/* Extra Layout Controls */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                    Sheet Orientation
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPaperOrientation('landscape')}
                      className={`py-1.5 px-2 rounded-lg text-xs font-semibold border ${
                        paperOrientation === 'landscape'
                          ? 'border-teal-600 bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Landscape
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaperOrientation('portrait')}
                      className={`py-1.5 px-2 rounded-lg text-xs font-semibold border ${
                        paperOrientation === 'portrait'
                          ? 'border-teal-600 bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Portrait
                    </button>
                  </div>
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      checked={drawBorders}
                      onChange={(e) => setDrawBorders(e.target.checked)}
                      className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                    />
                    Draw Cutting Border Lines
                  </label>
                </div>
              </div>
            </div>

            {/* Active summary */}
            <div className="text-center text-xs text-gray-500 dark:text-slate-400">
              Vector N-Up Layout: <span className="font-bold text-teal-600 dark:text-teal-400">{activeN} pages</span> per {paperOrientation} sheet
              {(() => { const g = getBestGrid(activeN); return ` (${g.cols}×${g.rows} grid)`; })()}
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={process}
                disabled={busy || (useCustom && (!customN || parseInt(customN) < 2))}
                className="flex-1 py-3.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <LayoutGrid className="w-5 h-5" />}
                {busy ? "Rendering Vector N-Up…" : `Create ${activeN}-Up PDF`}
              </button>
              <button
                onClick={reset}
                className="px-6 py-3.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 rounded-2xl p-8 text-center space-y-4 max-w-lg w-full">
            <CheckCircle2 className="w-12 h-12 text-teal-600 dark:text-teal-400 mx-auto" />
            <h2 className="text-2xl font-bold text-teal-800 dark:text-teal-300">{activeN}-Up PDF Ready!</h2>
            <p className="text-sm text-teal-700 dark:text-teal-400">
              Pure vector PDF created — text remains completely selectable and razor sharp.
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <a
                href={resultUrl}
                download={file!.name.replace(/\.pdf$/i, "") + `_${activeN}up.pdf`}
                className="inline-flex items-center gap-2 px-8 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl transition-colors shadow-sm"
              >
                <Download className="w-5 h-5" /> Download N-Up PDF
              </a>
              <button
                onClick={reset}
                className="px-4 py-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-50 transition-colors"
              >
                Another File
              </button>
            </div>
          </div>
        )}

        <ToolSEOSection
          toolName="N-Up PDF Layout"
          headline="Print Multiple Pages Per Sheet (Vector Crisp)"
          description="Print 2, 4, 6, 9, or custom PDF pages per sheet. Save paper with native vector N-Up page layout — 100% crisp text, no blur, free browser tool."
          faqs={[
            {
              q: 'Why is vector N-Up better than image-based N-Up?',
              a: 'Image-based tools blur your text and balloon the file size to 30MB+. Our native vector engine embeds the original PDF objects directly, keeping text razor sharp at any zoom level with a tiny file size.',
            },
            {
              q: 'What is 4-Up layout best used for?',
              a: '4-Up (4 pages per sheet) is ideal for reviewing presentation slide decks, printing reading notes, and saving paper on draft documents.',
            },
          ]}
        />
      </div>
    </div>
  );
}
