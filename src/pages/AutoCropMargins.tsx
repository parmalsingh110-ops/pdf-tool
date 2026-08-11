import { useState } from "react";
import { Crop, Download, AlertTriangle, Loader2, FileText, CheckCircle } from "lucide-react";
import FileDropzone from "../components/FileDropzone";
import { usePageSEO } from "../lib/usePageSEO";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function AutoCropMargins() {
  usePageSEO("Auto-Crop PDF White Margins", "Automatically detect and remove white margins from PDF pages. Perfect for e-book readers, Kindle, and tablets. Free online tool.");
  const [file, setFile] = useState<File | null>(null);
  const [padding, setPadding] = useState(10);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const process = async () => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("padding_pt", String(padding));
      const res = await fetch(`${API_BASE}/convert/auto-crop`, { method: "POST", body: fd });
      if (!res.ok) { const e = await res.json().catch(() => ({ detail: "Failed." })); throw new Error(e.detail); }
      const blob = await res.blob();
      setResultName("autocropped_" + file.name);
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) { setError(e.message || "Processing failed."); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/40 rounded-2xl flex items-center justify-center mx-auto mb-4"><Crop className="w-8 h-8 text-rose-600 dark:text-rose-400" /></div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">Auto-Crop White Margins</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400 max-w-xl mx-auto">Automatically detect and remove white margins from all PDF pages. Maximize reading area on tablets and e-readers.</p>
      </div>
      {!file ? (
        <FileDropzone onDrop={f => { if(f[0]){setFile(f[0]);setResultUrl(null);setError(null);} }} multiple={false} />
      ) : !resultUrl ? (
        <div className="w-full max-w-lg space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 flex items-center gap-4">
            <div className="w-10 h-10 bg-rose-50 dark:bg-rose-950/40 rounded-xl flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-rose-600" /></div>
            <div className="flex-1 min-w-0"><p className="font-semibold text-gray-900 dark:text-white truncate">{file.name}</p><p className="text-sm text-gray-500 dark:text-slate-400">{(file.size/1024/1024).toFixed(2)} MB</p></div>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
            <label className="flex items-center justify-between mb-3">
              <span className="font-medium text-gray-900 dark:text-white">Safety Padding</span>
              <span className="text-rose-600 font-bold">{padding} pt</span>
            </label>
            <input type="range" min={0} max={72} value={padding} onChange={e => setPadding(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 dark:bg-slate-700 rounded-full accent-rose-600" />
            <div className="flex justify-between text-xs text-gray-500 dark:text-slate-400 mt-1"><span>0pt (none)</span><span>72pt (1 inch)</span></div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">Extra space kept around detected content — prevents clipping edges</p>
          </div>
          {error && <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3 text-red-700 dark:text-red-300 text-sm"><AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /><p>{error}</p></div>}
          <div className="flex gap-3">
            <button onClick={process} disabled={busy} className="flex-1 py-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Crop className="w-5 h-5" />}{busy ? "Cropping…" : "Auto-Crop Margins"}
            </button>
            <button onClick={() => { setFile(null); setError(null); }} className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-2xl p-8 text-center space-y-4 max-w-lg w-full">
          <CheckCircle className="w-12 h-12 text-rose-600 dark:text-rose-400 mx-auto" />
          <h2 className="text-2xl font-bold text-rose-800 dark:text-rose-300">Margins Removed!</h2>
          <p className="text-rose-700 dark:text-rose-400 text-sm">All white margins have been automatically detected and cropped from every page.</p>
          <a href={resultUrl} download={resultName} className="inline-flex items-center gap-2 px-8 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-colors"><Download className="w-5 h-5" />Download</a>
          <button onClick={() => { setFile(null); setResultUrl(null); }} className="block w-full text-center text-gray-500 dark:text-slate-400 text-sm font-medium">Process another</button>
        </div>
      )}
    </div>
  );
}
