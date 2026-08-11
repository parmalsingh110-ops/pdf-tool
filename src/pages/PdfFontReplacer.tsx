import { useState } from "react";
import { Type, Download, AlertTriangle, Loader2, FileText, CheckCircle } from "lucide-react";
import FileDropzone from "../components/FileDropzone";
import { usePageSEO } from "../lib/usePageSEO";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const FONTS = [
  { key: "helv", name: "Helvetica", desc: "Clean sans-serif — modern, widely used" },
  { key: "tiro", name: "Times Roman", desc: "Classic serif — formal documents" },
  { key: "cour", name: "Courier", desc: "Monospace — code, terminal output" },
];

export default function PdfFontReplacer() {
  usePageSEO("PDF Font Replacer", "Replace all fonts in a PDF with Helvetica, Times Roman, or Courier. Global font replacement for branding consistency. Free tool.");
  const [file, setFile] = useState<File | null>(null);
  const [font, setFont] = useState("helv");
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const process = async () => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("font_name", font);
      const res = await fetch(`${API_BASE}/convert/replace-font`, { method: "POST", body: fd });
      if (!res.ok) { const e = await res.json().catch(() => ({ detail: "Failed." })); throw new Error(e.detail); }
      const blob = await res.blob();
      const fn = FONTS.find(f => f.key === font)!;
      setResultName(`${file.name.replace(/\.pdf$/i,"")}_${fn.name.replace(" ","_")}.pdf`);
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) { setError(e.message || "Processing failed."); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-fuchsia-100 dark:bg-fuchsia-950/40 rounded-2xl flex items-center justify-center mx-auto mb-4"><Type className="w-8 h-8 text-fuchsia-600 dark:text-fuchsia-400" /></div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">PDF Font Replacer</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400 max-w-xl mx-auto">Replace all fonts in your PDF with a clean, standard font. Ideal for corporate branding consistency.</p>
      </div>
      {!file ? (
        <FileDropzone onDrop={f => { if(f[0]){setFile(f[0]);setResultUrl(null);setError(null);} }} multiple={false} />
      ) : !resultUrl ? (
        <div className="w-full max-w-lg space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 flex items-center gap-4">
            <div className="w-10 h-10 bg-fuchsia-50 dark:bg-fuchsia-950/40 rounded-xl flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-fuchsia-600" /></div>
            <div className="flex-1 min-w-0"><p className="font-semibold text-gray-900 dark:text-white truncate">{file.name}</p><p className="text-sm text-gray-500 dark:text-slate-400">{(file.size/1024/1024).toFixed(2)} MB</p></div>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-3">
            <p className="font-medium text-gray-900 dark:text-white">Replace all fonts with</p>
            {FONTS.map(f => (
              <label key={f.key} className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-colors ${font === f.key ? "border-fuchsia-500 bg-fuchsia-50 dark:bg-fuchsia-950/30" : "border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600"}`}>
                <input type="radio" name="font" value={f.key} checked={font === f.key} onChange={() => setFont(f.key)} className="accent-fuchsia-600" />
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white" style={{ fontFamily: f.key === "helv" ? "Helvetica,Arial,sans-serif" : f.key === "tiro" ? "Times New Roman,serif" : "Courier New,monospace" }}>{f.name}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400">{f.desc}</p>
                </div>
              </label>
            ))}
          </div>
          {error && <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3 text-red-700 dark:text-red-300 text-sm"><AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /><p>{error}</p></div>}
          <div className="flex gap-3">
            <button onClick={process} disabled={busy} className="flex-1 py-4 bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Type className="w-5 h-5" />}{busy ? "Replacing fonts…" : "Replace Fonts"}
            </button>
            <button onClick={() => { setFile(null); setError(null); }} className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="bg-fuchsia-50 dark:bg-fuchsia-950/30 border border-fuchsia-200 dark:border-fuchsia-800 rounded-2xl p-8 text-center space-y-4 max-w-lg w-full">
          <CheckCircle className="w-12 h-12 text-fuchsia-600 dark:text-fuchsia-400 mx-auto" />
          <h2 className="text-2xl font-bold text-fuchsia-800 dark:text-fuchsia-300">Fonts Replaced!</h2>
          <a href={resultUrl} download={resultName} className="inline-flex items-center gap-2 px-8 py-3 bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-bold rounded-xl transition-colors"><Download className="w-5 h-5" />Download PDF</a>
          <button onClick={() => { setFile(null); setResultUrl(null); }} className="block w-full text-center text-gray-500 dark:text-slate-400 text-sm font-medium">Process another</button>
        </div>
      )}
    </div>
  );
}
