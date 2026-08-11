import { useState } from "react";
import { Image, Download, Loader2, CheckCircle, SlidersHorizontal } from "lucide-react";
import { PDFDocument, rgb } from "pdf-lib";
import FileDropzone from "../components/FileDropzone";
import { usePageSEO } from "../lib/usePageSEO";

const PAGE_W = 595, PAGE_H = 842; // A4 pts at 72dpi
const PAGE_W_PX = PAGE_W * 2, PAGE_H_PX = PAGE_H * 2; // 144dpi render

export default function LongImageToPdf() {
  usePageSEO("Long Screenshot to PDF", "Convert tall/long screenshots and WhatsApp-style images to a multi-page A4 PDF. Auto-sliced cleanly — free browser tool.");
  const [file, setFile] = useState<File | null>(null);
  const [overlap, setOverlap] = useState(20);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);

  const process = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const imgUrl = URL.createObjectURL(file);
      const img = new window.Image();
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = imgUrl; });

      const srcW = img.naturalWidth, srcH = img.naturalHeight;
      const scale = PAGE_W_PX / srcW;
      const scaledH = Math.round(srcH * scale);
      const sliceH = PAGE_H_PX - overlap * 2;
      const slices: number[] = [];
      for (let y = 0; y < scaledH; y += sliceH) slices.push(y);

      const outDoc = await PDFDocument.create();
      for (const sliceY of slices) {
        const canvas = document.createElement("canvas");
        canvas.width = PAGE_W_PX; canvas.height = PAGE_H_PX;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "white"; ctx.fillRect(0, 0, PAGE_W_PX, PAGE_H_PX);
        const srcSliceY = sliceY / scale;
        const srcSliceH = PAGE_H_PX / scale;
        ctx.drawImage(img, 0, srcSliceY, srcW, srcSliceH, 0, 0, PAGE_W_PX, PAGE_H_PX);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        const b64 = dataUrl.split(",")[1];
        const binStr = atob(b64);
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
        const jpgImg = await outDoc.embedJpg(bytes);
        const page = outDoc.addPage([PAGE_W, PAGE_H]);
        page.drawImage(jpgImg, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
      }

      const pdfBytes = await outDoc.save();
      setPageCount(slices.length);
      setResultUrl(URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" })));
    } catch (e: any) { alert(e?.message || "Processing failed."); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-sky-100 dark:bg-sky-950/40 rounded-2xl flex items-center justify-center mx-auto mb-4"><Image className="w-8 h-8 text-sky-600 dark:text-sky-400" /></div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">Long Image to PDF</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400 max-w-xl mx-auto">Convert tall screenshots, WhatsApp chats, and long infographics into a properly paginated A4 PDF.</p>
      </div>
      {!file ? (
        <FileDropzone onDrop={f => { if(f[0]){setFile(f[0]);setResultUrl(null);} }} multiple={false} accept={{"image/*":[".jpg",".jpeg",".png",".webp"]}} />
      ) : !resultUrl ? (
        <div className="w-full max-w-lg space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 flex items-center gap-4">
            <div className="w-10 h-10 bg-sky-50 dark:bg-sky-950/40 rounded-xl flex items-center justify-center shrink-0"><Image className="w-5 h-5 text-sky-600" /></div>
            <div className="flex-1 min-w-0"><p className="font-semibold text-gray-900 dark:text-white truncate">{file.name}</p><p className="text-sm text-gray-500 dark:text-slate-400">{(file.size/1024).toFixed(0)} KB</p></div>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
            <label className="flex items-center justify-between mb-3">
              <span className="font-medium text-gray-900 dark:text-white flex items-center gap-2"><SlidersHorizontal className="w-4 h-4" />Page Overlap</span>
              <span className="text-sky-600 font-bold">{overlap}px</span>
            </label>
            <input type="range" min={0} max={80} value={overlap} onChange={e => setOverlap(Number(e.target.value))} className="w-full h-2 bg-gray-200 dark:bg-slate-700 rounded-full accent-sky-600" />
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">Overlap between pages prevents content from being cut off at page boundaries</p>
          </div>
          <div className="flex gap-3">
            <button onClick={process} disabled={busy} className="flex-1 py-4 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Image className="w-5 h-5" />}{busy ? "Slicing into pages…" : "Convert to PDF"}
            </button>
            <button onClick={() => setFile(null)} className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-2xl p-8 text-center space-y-4 max-w-lg w-full">
          <CheckCircle className="w-12 h-12 text-sky-600 dark:text-sky-400 mx-auto" />
          <h2 className="text-2xl font-bold text-sky-800 dark:text-sky-300">PDF Created!</h2>
          <p className="text-sky-700 dark:text-sky-400 text-sm">Your long image was split into <strong>{pageCount} A4 pages</strong></p>
          <a href={resultUrl} download={file.name.replace(/\.[^.]+$/,"") + ".pdf"} className="inline-flex items-center gap-2 px-8 py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl transition-colors"><Download className="w-5 h-5" />Download PDF</a>
          <button onClick={() => { setFile(null); setResultUrl(null); }} className="block w-full text-center text-gray-500 dark:text-slate-400 text-sm font-medium">Convert another</button>
        </div>
      )}
    </div>
  );
}
