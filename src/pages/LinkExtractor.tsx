import { useState } from "react";
import { Link, ExternalLink, Loader2, FileText, Copy, Check, AlertTriangle, Download } from "lucide-react";
import FileDropzone from "../components/FileDropzone";
import { usePageSEO } from "../lib/usePageSEO";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface LinkItem { page: number; url: string; rect: number[]; }

export default function LinkExtractor() {
  usePageSEO("PDF Link Extractor", "Extract all hyperlinks from a PDF file. View, copy, and export all URLs found in your PDF document. Free online tool.");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<LinkItem[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extract = async () => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch(`${API_BASE}/analyze/links`, { method: "POST", body: fd });
      if (!res.ok) { const e = await res.json().catch(() => ({ detail: "Failed." })); throw new Error(e.detail); }
      const data = await res.json();
      setLinks(data.links || []);
    } catch (e: any) { setError(e.message || "Extraction failed."); }
    finally { setBusy(false); }
  };

  const copyAll = async () => {
    if (!links) return;
    await navigator.clipboard.writeText(links.map(l => l.url).join("\n"));
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const downloadCsv = () => {
    if (!links) return;
    const csv = "Page,URL\n" + links.map(l => `${l.page},"${l.url}"`).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = (file?.name.replace(/\.pdf$/i,"") || "document") + "_links.csv"; a.click();
  };

  const domains = links ? [...new Set(links.map(l => { try { return new URL(l.url).hostname; } catch { return l.url; } }))] : [];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-cyan-100 dark:bg-cyan-950/40 rounded-2xl flex items-center justify-center mx-auto mb-4"><Link className="w-8 h-8 text-cyan-600 dark:text-cyan-400" /></div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">PDF Link Extractor</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400 max-w-xl mx-auto">Extract all hyperlinks from your PDF. See which page each link is on, copy all URLs, or export as CSV.</p>
      </div>
      {!file ? (
        <FileDropzone onDrop={f => { if(f[0]){setFile(f[0]);setLinks(null);setError(null);} }} multiple={false} />
      ) : links === null ? (
        <div className="w-full max-w-lg space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 flex items-center gap-4">
            <div className="w-10 h-10 bg-cyan-50 dark:bg-cyan-950/40 rounded-xl flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-cyan-600" /></div>
            <div className="flex-1 min-w-0"><p className="font-semibold text-gray-900 dark:text-white truncate">{file.name}</p><p className="text-sm text-gray-500 dark:text-slate-400">{(file.size/1024/1024).toFixed(2)} MB</p></div>
          </div>
          {error && <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3 text-red-700 dark:text-red-300 text-sm"><AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /><p>{error}</p></div>}
          <div className="flex gap-3">
            <button onClick={extract} disabled={busy} className="flex-1 py-4 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Link className="w-5 h-5" />}{busy ? "Extracting links…" : "Extract Links"}
            </button>
            <button onClick={() => { setFile(null); setError(null); }} className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-2xl space-y-4">
          <div className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
            <div>
              <p className="text-2xl font-black text-gray-900 dark:text-white">{links.length}</p>
              <p className="text-sm text-gray-500 dark:text-slate-400">{links.length === 0 ? "No links found" : `links across ${[...new Set(links.map(l=>l.page))].length} pages — ${domains.length} unique domains`}</p>
            </div>
            {links.length > 0 && (
              <div className="flex gap-2">
                <button onClick={copyAll} className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}{copied ? "Copied!" : "Copy All"}
                </button>
                <button onClick={downloadCsv} className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-medium transition-colors"><Download className="w-4 h-4" />CSV</button>
              </div>
            )}
          </div>
          {links.length === 0 ? (
            <div className="bg-gray-50 dark:bg-slate-800 rounded-2xl p-8 text-center text-gray-500 dark:text-slate-400">No hyperlinks found in this PDF.</div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 divide-y divide-gray-200 dark:divide-slate-700 max-h-96 overflow-y-auto">
              {links.map((l, i) => (
                <div key={i} className="flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                  <span className="text-xs font-bold text-gray-400 dark:text-slate-500 w-12 shrink-0">Pg {l.page}</span>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm text-cyan-600 dark:text-cyan-400 hover:underline truncate">{l.url}</a>
                  <ExternalLink className="w-4 h-4 text-gray-400 dark:text-slate-500 shrink-0" />
                </div>
              ))}
            </div>
          )}
          <button onClick={() => { setFile(null); setLinks(null); }} className="w-full py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">Extract from another PDF</button>
        </div>
      )}
    </div>
  );
}
