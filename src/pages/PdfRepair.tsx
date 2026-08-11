import { useState } from "react";
import { Wrench, Download, AlertTriangle, Loader2, FileText, CheckCircle, Info } from "lucide-react";
import FileDropzone from "../components/FileDropzone";
import { usePageSEO } from "../lib/usePageSEO";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function PdfRepair() {
  usePageSEO("Fix & Repair Corrupted PDF", "Repair broken, damaged or corrupted PDF files online. Multi-strategy recovery using Ghostscript and MuPDF. Free, no sign-up.");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState("");
  const [strategy, setStrategy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = (files: File[]) => {
    if (files[0]) { setFile(files[0]); setResultUrl(null); setError(null); setStrategy(null); }
  };

  const repair = async () => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE}/repair-pdf`, { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Repair failed." }));
        throw new Error(err.detail || "Repair failed.");
      }
      const strat = res.headers.get("X-Repair-Strategy") || "Unknown method";
      setStrategy(strat);
      const blob = await res.blob();
      const name = "repaired_" + file.name;
      setResultName(name);
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) { setError(e.message || "Repair failed."); }
    finally { setBusy(false); }
  };

  const strategies = [
    { name: "Ghostscript", desc: "Rebuilds XREF table and PDF streams — works on most corrupted files" },
    { name: "mutool clean", desc: "MuPDF-based cleanup — excellent for linearization & cross-reference errors" },
    { name: "PyMuPDF", desc: "In-memory garbage collection — last resort for partial/incomplete files" },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-amber-100 dark:bg-amber-950/40 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Wrench className="w-8 h-8 text-amber-600 dark:text-amber-400" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">PDF Repair Tool</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400 max-w-xl mx-auto">Fix corrupted, broken, or partially downloaded PDF files. We try 3 different recovery strategies automatically.</p>
      </div>

      {/* Strategy Info */}
      <div className="w-full max-w-2xl grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {strategies.map((s, i) => (
          <div key={s.name} className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center justify-center">{i+1}</span>
              <span className="font-semibold text-sm text-gray-900 dark:text-white">{s.name}</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400">{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="w-full max-w-lg space-y-4">
        {!file ? (
          <FileDropzone onDrop={handleDrop} multiple={false} />
        ) : !resultUrl ? (
          <>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 flex items-center gap-4">
              <div className="w-10 h-10 bg-amber-50 dark:bg-amber-950/40 rounded-xl flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-amber-600" /></div>
              <div className="flex-1 min-w-0"><p className="font-semibold text-gray-900 dark:text-white truncate">{file.name}</p><p className="text-sm text-gray-500 dark:text-slate-400">{(file.size/1024/1024).toFixed(2)} MB</p></div>
            </div>
            {error && <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3 text-red-700 dark:text-red-300 text-sm"><AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /><p>{error}</p></div>}
            <div className="flex gap-3">
              <button onClick={repair} disabled={busy} className="flex-1 py-4 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wrench className="w-5 h-5" />}{busy ? "Repairing… (may take 30-60s)" : "Repair PDF"}
              </button>
              <button onClick={() => { setFile(null); setError(null); }} className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">Cancel</button>
            </div>
          </>
        ) : (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-8 text-center space-y-4">
            <CheckCircle className="w-12 h-12 text-amber-600 dark:text-amber-400 mx-auto" />
            <h2 className="text-2xl font-bold text-amber-800 dark:text-amber-300">PDF Repaired!</h2>
            {strategy && (
              <div className="flex items-center justify-center gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 rounded-lg px-4 py-2">
                <Info className="w-4 h-4 shrink-0" />
                <span>Recovered using: <strong>{strategy}</strong></span>
              </div>
            )}
            <a href={resultUrl} download={resultName} className="inline-flex items-center gap-2 px-8 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition-colors">
              <Download className="w-5 h-5" />Download Repaired PDF
            </a>
            <button onClick={() => { setFile(null); setResultUrl(null); setStrategy(null); }} className="block w-full text-center text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white text-sm font-medium">Repair another file</button>
          </div>
        )}
      </div>
    </div>
  );
}
