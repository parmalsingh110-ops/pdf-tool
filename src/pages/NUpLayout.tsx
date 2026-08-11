import { useState } from "react";
import { LayoutGrid, Download, Loader2, FileText } from "lucide-react";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import "../lib/pdfWorker";
import FileDropzone from "../components/FileDropzone";
import { usePageSEO } from "../lib/usePageSEO";

type NUpMode = 2 | 4 | 6 | 9;

export default function NUpLayout() {
  usePageSEO("N-Up PDF — Print Multiple Pages Per Sheet", "Print 2, 4, 6, or 9 PDF pages on a single sheet. Save paper with N-Up page layout — free browser tool.");
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<NUpMode>(4);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const MODES: { n: NUpMode; cols: number; rows: number; label: string }[] = [
    { n: 2, cols: 1, rows: 2, label: "2-Up (1×2)" },
    { n: 4, cols: 2, rows: 2, label: "4-Up (2×2)" },
    { n: 6, cols: 2, rows: 3, label: "6-Up (2×3)" },
    { n: 9, cols: 3, rows: 3, label: "9-Up (3×3)" },
  ];

  const process = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const cfg = MODES.find(m => m.n === mode)!;
      const buf = await file.arrayBuffer();
      const pdfJs = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const outDoc = await PDFDocument.create();
      const pageW = 595, pageH = 842; // A4 in pts
      const cellW = pageW / cfg.cols, cellH = pageH / cfg.rows;
      let cellIdx = 0, currentPage: any = null, currentCtx: any = null, currentCanvas: any = null;

      const groups: number[][] = [];
      for (let i = 0; i < pdfJs.numPages; i += mode) {
        groups.push(Array.from({ length: mode }, (_, j) => i + j + 1).filter(n => n <= pdfJs.numPages));
      }

      for (const group of groups) {
        const sheetCanvas = document.createElement("canvas");
        sheetCanvas.width = Math.round(pageW * 2); sheetCanvas.height = Math.round(pageH * 2);
        const ctx = sheetCanvas.getContext("2d")!;
        ctx.fillStyle = "white"; ctx.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);

        for (let gi = 0; gi < group.length; gi++) {
          const pgNum = group[gi];
          const col = gi % cfg.cols, row = Math.floor(gi / cfg.cols);
          const pg = await pdfJs.getPage(pgNum);
          const cellCanvas = document.createElement("canvas");
          const scale = Math.min((cellW * 2) / pg.getViewport({ scale: 1 }).width, (cellH * 2) / pg.getViewport({ scale: 1 }).height);
          const vp = pg.getViewport({ scale });
          cellCanvas.width = vp.width; cellCanvas.height = vp.height;
          await pg.render({ canvasContext: cellCanvas.getContext("2d")!, viewport: vp, canvas: cellCanvas }).promise;
          const cx = col * cellW * 2, cy = row * cellH * 2;
          ctx.drawImage(cellCanvas, cx, cy, cellW * 2, cellH * 2);
          // Draw border
          ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 1;
          ctx.strokeRect(cx, cy, cellW * 2, cellH * 2);
        }

        const imgData = sheetCanvas.toDataURL("image/png");
        const img = await outDoc.embedPng(imgData.split(",")[1].replace(/=/g, "")
          .replace(/-/g, "+").replace(/_/g, "/")
          .split("").reduce((acc: Uint8Array, _, i, arr) => {
            // manual base64 decode not needed — use fetch trick
            return acc;
          }, new Uint8Array(0)));

        // Use fetch blob approach for clean embed
        const resp = await fetch(imgData);
        const imgBlob = await resp.arrayBuffer();
        const pngImg = await outDoc.embedPng(new Uint8Array(imgBlob));
        const pg = outDoc.addPage([pageW, pageH]);
        pg.drawImage(pngImg, { x: 0, y: 0, width: pageW, height: pageH });
      }

      const bytes = await outDoc.save();
      setResultUrl(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })));
    } catch (e: any) { alert(e?.message || "Processing failed."); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-teal-100 dark:bg-teal-950/40 rounded-2xl flex items-center justify-center mx-auto mb-4"><LayoutGrid className="w-8 h-8 text-teal-600 dark:text-teal-400" /></div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">N-Up Page Layout</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400 max-w-xl mx-auto">Print 2, 4, 6, or 9 PDF pages on a single A4 sheet. Save paper, reduce print costs.</p>
      </div>
      {!file ? (
        <FileDropzone onDrop={f => { if(f[0]){setFile(f[0]);setResultUrl(null);} }} multiple={false} />
      ) : !resultUrl ? (
        <div className="w-full max-w-lg space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 flex items-center gap-4">
            <div className="w-10 h-10 bg-teal-50 dark:bg-teal-950/40 rounded-xl flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-teal-600" /></div>
            <div className="flex-1 min-w-0"><p className="font-semibold text-gray-900 dark:text-white truncate">{file.name}</p><p className="text-sm text-gray-500 dark:text-slate-400">{(file.size/1024/1024).toFixed(2)} MB</p></div>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
            <p className="font-medium text-gray-900 dark:text-white mb-3">Pages per sheet</p>
            <div className="grid grid-cols-4 gap-2">
              {MODES.map(m => (
                <button key={m.n} onClick={() => setMode(m.n)}
                  className={`p-3 rounded-xl border-2 text-center transition-colors ${mode === m.n ? "border-teal-500 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400" : "border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-600"}`}>
                  <div className={`grid gap-0.5 mx-auto mb-1 w-10 h-10 p-1 bg-gray-100 dark:bg-slate-700 rounded ${m.cols === 3 ? "grid-cols-3" : m.cols === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                    {Array.from({ length: m.n }).map((_, i) => <div key={i} className="bg-teal-400 dark:bg-teal-500 rounded-sm" />)}
                  </div>
                  <span className="text-xs font-bold">{m.n}-Up</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={process} disabled={busy} className="flex-1 py-4 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <LayoutGrid className="w-5 h-5" />}{busy ? "Processing…" : `Create ${mode}-Up PDF`}
            </button>
            <button onClick={() => setFile(null)} className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 rounded-2xl p-8 text-center space-y-4 max-w-lg w-full">
          <LayoutGrid className="w-12 h-12 text-teal-600 dark:text-teal-400 mx-auto" />
          <h2 className="text-2xl font-bold text-teal-800 dark:text-teal-300">{mode}-Up PDF Ready!</h2>
          <a href={resultUrl} download={file.name.replace(/\.pdf$/i,"") + `_${mode}up.pdf`} className="inline-flex items-center gap-2 px-8 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl transition-colors"><Download className="w-5 h-5" />Download</a>
          <button onClick={() => { setFile(null); setResultUrl(null); }} className="block w-full text-center text-gray-500 dark:text-slate-400 text-sm font-medium">Process another</button>
        </div>
      )}
    </div>
  );
}
