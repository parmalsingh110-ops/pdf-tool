import { useState } from "react";
import { LayoutGrid, Download, Loader2, FileText, Hash } from "lucide-react";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import "../lib/pdfWorker";
import FileDropzone from "../components/FileDropzone";
import { usePageSEO } from "../lib/usePageSEO";

const PRESETS = [
  { n: 2, cols: 1, rows: 2 },
  { n: 4, cols: 2, rows: 2 },
  { n: 6, cols: 2, rows: 3 },
  { n: 9, cols: 3, rows: 3 },
];

function getBestGrid(n: number): { cols: number; rows: number } {
  // Find the most square-ish grid for n pages
  const preset = PRESETS.find(p => p.n === n);
  if (preset) return { cols: preset.cols, rows: preset.rows };
  // For custom values: try to find closest rectangle
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return { cols, rows };
}

export default function NUpLayout() {
  usePageSEO("N-Up PDF — Print Multiple Pages Per Sheet", "Print 2, 4, 6, 9, or any number of PDF pages on a single sheet. Save paper with N-Up page layout — free browser tool.");
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<number>(4);
  const [customN, setCustomN] = useState<string>("");
  const [useCustom, setUseCustom] = useState(false);
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
      const pdfJs = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const outDoc = await PDFDocument.create();
      const pageW = 842, pageH = 595; // A4 landscape — more room per cell
      const cellW = pageW / cols;
      const cellH = pageH / rows;
      const SCALE = 2; // retina

      const groups: number[][] = [];
      for (let i = 0; i < pdfJs.numPages; i += n) {
        groups.push(
          Array.from({ length: n }, (_, j) => i + j + 1).filter(p => p <= pdfJs.numPages)
        );
      }

      for (const group of groups) {
        const sheetCanvas = document.createElement("canvas");
        sheetCanvas.width = Math.round(pageW * SCALE);
        sheetCanvas.height = Math.round(pageH * SCALE);
        const ctx = sheetCanvas.getContext("2d")!;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);

        for (let gi = 0; gi < group.length; gi++) {
          const pgNum = group[gi];
          const col = gi % cols;
          const row = Math.floor(gi / cols);
          const pdfPage = await pdfJs.getPage(pgNum);
          const baseVp = pdfPage.getViewport({ scale: 1 });
          const scaleX = (cellW * SCALE) / baseVp.width;
          const scaleY = (cellH * SCALE) / baseVp.height;
          const scale = Math.min(scaleX, scaleY) * 0.95; // 5% padding
          const vp = pdfPage.getViewport({ scale });

          const cellCanvas = document.createElement("canvas");
          cellCanvas.width = Math.round(cellW * SCALE);
          cellCanvas.height = Math.round(cellH * SCALE);
          const cellCtx = cellCanvas.getContext("2d")!;
          cellCtx.fillStyle = "white";
          cellCtx.fillRect(0, 0, cellCanvas.width, cellCanvas.height);

          // Center the page within the cell
          const offsetX = Math.round((cellCanvas.width - vp.width) / 2);
          const offsetY = Math.round((cellCanvas.height - vp.height) / 2);
          cellCtx.save();
          cellCtx.translate(offsetX, offsetY);
          await pdfPage.render({ canvasContext: cellCtx, viewport: vp, canvas: cellCanvas }).promise;
          cellCtx.restore();

          // Draw cell border
          cellCtx.strokeStyle = "#cbd5e1";
          cellCtx.lineWidth = 1;
          cellCtx.strokeRect(0, 0, cellCanvas.width, cellCanvas.height);

          // Draw page number label
          cellCtx.fillStyle = "rgba(100,116,139,0.7)";
          cellCtx.font = `bold ${Math.round(10 * SCALE)}px sans-serif`;
          cellCtx.textAlign = "right";
          cellCtx.fillText(`${pgNum}`, cellCanvas.width - 6, cellCanvas.height - 6);

          const cx = col * cellW * SCALE;
          const cy = row * cellH * SCALE;
          ctx.drawImage(cellCanvas, cx, cy);
        }

        // Convert canvas → PNG bytes via fetch (robust, no manual base64)
        const blob: Blob = await new Promise(res => sheetCanvas.toBlob(b => res(b!), "image/png"));
        const pngBytes = new Uint8Array(await blob.arrayBuffer());
        const pngImg = await outDoc.embedPng(pngBytes);
        const outPage = outDoc.addPage([pageW, pageH]);
        outPage.drawImage(pngImg, { x: 0, y: 0, width: pageW, height: pageH });
      }

      const bytes = await outDoc.save();
      setResultUrl(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })));
    } catch (e: any) {
      setError(e?.message || "Processing failed. Please try a different PDF.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setFile(null); setResultUrl(null); setError(null); };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-teal-100 dark:bg-teal-950/40 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <LayoutGrid className="w-8 h-8 text-teal-600 dark:text-teal-400" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">N-Up Page Layout</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400 max-w-xl mx-auto">
          Print multiple PDF pages on a single sheet. Choose a preset or enter any custom number.
        </p>
      </div>

      {!file ? (
        <FileDropzone onDrop={f => { if (f[0]) { setFile(f[0]); setResultUrl(null); setError(null); } }} multiple={false} />
      ) : !resultUrl ? (
        <div className="w-full max-w-lg space-y-4">
          {/* File info */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 flex items-center gap-4">
            <div className="w-10 h-10 bg-teal-50 dark:bg-teal-950/40 rounded-xl flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-teal-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white truncate">{file.name}</p>
              <p className="text-sm text-gray-500 dark:text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>

          {/* Pages per sheet */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
            <p className="font-semibold text-gray-900 dark:text-white mb-3">Pages per sheet</p>

            {/* Preset buttons */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {PRESETS.map(m => (
                <button
                  key={m.n}
                  onClick={() => { setMode(m.n); setUseCustom(false); setError(null); }}
                  className={`p-3 rounded-xl border-2 text-center transition-colors ${
                    !useCustom && mode === m.n
                      ? "border-teal-500 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400"
                      : "border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:border-teal-300 dark:hover:border-teal-700"
                  }`}
                >
                  <div className={`grid gap-0.5 mx-auto mb-1 w-10 h-10 p-1 bg-gray-100 dark:bg-slate-700 rounded ${
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
            <div className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-colors cursor-pointer ${
              useCustom
                ? "border-teal-500 bg-teal-50 dark:bg-teal-950/40"
                : "border-gray-200 dark:border-slate-700 hover:border-teal-300 dark:hover:border-teal-700"
            }`}
              onClick={() => setUseCustom(true)}
            >
              <div className="w-10 h-10 bg-gray-100 dark:bg-slate-700 rounded-lg flex items-center justify-center shrink-0">
                <Hash className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">Custom number</p>
                <p className="text-xs text-gray-500 dark:text-slate-500">Enter any value from 2 to 36</p>
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
                  useCustom ? "border-teal-400 ring-2 ring-teal-200 dark:ring-teal-900" : "border-gray-200 dark:border-slate-600"
                }`}
              />
            </div>
          </div>

          {/* Active summary */}
          <div className="text-center text-sm text-gray-500 dark:text-slate-400">
            Will create a PDF with <span className="font-bold text-teal-600 dark:text-teal-400">{activeN} pages</span> per A4 sheet
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
              className="flex-1 py-4 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <LayoutGrid className="w-5 h-5" />}
              {busy ? "Processing…" : `Create ${activeN}-Up PDF`}
            </button>
            <button
              onClick={reset}
              className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 rounded-2xl p-8 text-center space-y-4 max-w-lg w-full">
          <LayoutGrid className="w-12 h-12 text-teal-600 dark:text-teal-400 mx-auto" />
          <h2 className="text-2xl font-bold text-teal-800 dark:text-teal-300">{activeN}-Up PDF Ready!</h2>
          <p className="text-sm text-teal-700 dark:text-teal-400">
            {Math.ceil((file ? 1 : 0) / activeN)} sheet(s) created — multiple pages per sheet
          </p>
          <a
            href={resultUrl}
            download={file!.name.replace(/\.pdf$/i, "") + `_${activeN}up.pdf`}
            className="inline-flex items-center gap-2 px-8 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl transition-colors"
          >
            <Download className="w-5 h-5" />Download
          </a>
          <button onClick={reset} className="block w-full text-center text-gray-500 dark:text-slate-400 text-sm font-medium hover:text-gray-700 dark:hover:text-slate-300 transition-colors">
            Process another PDF
          </button>
        </div>
      )}
    </div>
  );
}
