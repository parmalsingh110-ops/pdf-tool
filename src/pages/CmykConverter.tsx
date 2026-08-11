import { useState } from "react";
import { Palette, Download, AlertTriangle, Loader2, FileText, CheckCircle } from "lucide-react";
import FileDropzone from "../components/FileDropzone";
import { usePageSEO } from "../lib/usePageSEO";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function CmykConverter() {
  usePageSEO("RGB to CMYK PDF Converter", "Convert your RGB PDF to CMYK color space for professional offset printing. Free online tool — no sign-up required.");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleDrop = (files: File[]) => {
    if (files[0]) { setFile(files[0]); setResultUrl(null); setError(null); }
  };

  const convert = async () => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE}/convert/cmyk`, { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Conversion failed." }));
        throw new Error(err.detail || "Conversion failed.");
      }
      const blob = await res.blob();
      const name = file.name.replace(/\.pdf$/i, "") + "_CMYK.pdf";
      setResultName(name);
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) { setError(e.message || "Conversion failed."); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-violet-100 dark:bg-violet-950/40 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Palette className="w-8 h-8 text-violet-600 dark:text-violet-400" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">RGB to CMYK Converter</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400 max-w-xl mx-auto">Convert your RGB PDF to CMYK color space — ready for professional offset printing presses.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3 text-sm">
          {["ISO Coated v2 Compatible", "Ghostscript Powered", "Print-Ready Output", "No Color Loss"].map(t => (
            <span key={t} className="px-3 py-1 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 rounded-full border border-violet-200 dark:border-violet-800">{t}</span>
          ))}
        </div>
      </div>
      <div className="w-full max-w-lg space-y-4">
        {!file ? (
          <FileDropzone onDrop={handleDrop} multiple={false} />
        ) : !resultUrl ? (
          <>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 flex items-center gap-4">
              <div className="w-10 h-10 bg-violet-50 dark:bg-violet-950/40 rounded-xl flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-violet-600" /></div>
              <div className="flex-1 min-w-0"><p className="font-semibold text-gray-900 dark:text-white truncate">{file.name}</p><p className="text-sm text-gray-500 dark:text-slate-400">{(file.size/1024/1024).toFixed(2)} MB</p></div>
            </div>
            {error && <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3 text-red-700 dark:text-red-300 text-sm"><AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /><p>{error}</p></div>}
            <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-300 text-sm">
              <p className="font-semibold mb-1">ℹ️ What this tool does</p>
              <p>Converts all RGB colors to CMYK using Ghostscript. Some colors may appear slightly different as RGB has a wider gamut than CMYK. This is expected behavior for print preparation.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={convert} disabled={busy} className="flex-1 py-4 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Palette className="w-5 h-5" />}{busy ? "Converting…" : "Convert to CMYK"}
              </button>
              <button onClick={() => { setFile(null); setError(null); }} className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">Cancel</button>
            </div>
          </>
        ) : (
          <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-2xl p-8 text-center space-y-4">
            <CheckCircle className="w-12 h-12 text-violet-600 dark:text-violet-400 mx-auto" />
            <h2 className="text-2xl font-bold text-violet-800 dark:text-violet-300">CMYK PDF Ready!</h2>
            <p className="text-violet-700 dark:text-violet-400 text-sm">Your PDF has been converted to CMYK color space and is ready for professional printing.</p>
            <a href={resultUrl} download={resultName} className="inline-flex items-center gap-2 px-8 py-3 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl transition-colors">
              <Download className="w-5 h-5" />Download CMYK PDF
            </a>
            <button onClick={() => { setFile(null); setResultUrl(null); }} className="block w-full text-center text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white text-sm font-medium mt-2">Convert another file</button>
          </div>
        )}
      </div>
    </div>
  );
}
