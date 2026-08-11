import { useState } from "react";
import { Globe, Download, AlertTriangle, Loader2, Settings, CheckCircle } from "lucide-react";
import { usePageSEO } from "../lib/usePageSEO";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function WebpageToPdf() {
  usePageSEO("Webpage to PDF Converter", "Convert any website URL to a PDF file. Save web pages as PDF online for free — full-page, paginated, print-ready.");
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState("A4");
  const [landscape, setLandscape] = useState(false);
  const [printBg, setPrintBg] = useState(true);
  const [margin, setMargin] = useState("1cm");
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const convert = async () => {
    if (!url.trim()) return;
    let fullUrl = url.trim();
    if (!fullUrl.startsWith("http://") && !fullUrl.startsWith("https://")) fullUrl = "https://" + fullUrl;
    setBusy(true); setError(null); setResultUrl(null);
    try {
      const fd = new FormData();
      fd.append("url", fullUrl); fd.append("paper_format", format);
      fd.append("landscape", String(landscape)); fd.append("margin", margin);
      fd.append("background", String(printBg));
      const res = await fetch(`${API_BASE}/convert/webpage-to-pdf`, { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Conversion failed." }));
        throw new Error(err.detail || "Conversion failed.");
      }
      const blob = await res.blob();
      try { const domain = new URL(fullUrl).hostname; setResultName(`${domain}.pdf`); } catch { setResultName("webpage.pdf"); }
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) { setError(e.message || "Conversion failed."); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-blue-100 dark:bg-blue-950/40 rounded-2xl flex items-center justify-center mx-auto mb-4"><Globe className="w-8 h-8 text-blue-600 dark:text-blue-400" /></div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">Webpage to PDF</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400 max-w-xl mx-auto">Enter any public URL — we convert the full webpage to a paginated, print-ready PDF.</p>
      </div>
      <div className="w-full max-w-xl space-y-4">
        {!resultUrl ? (
          <>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Website URL</label>
                <div className="flex items-center gap-2 border border-gray-300 dark:border-slate-600 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                  <span className="px-3 text-gray-400 select-none"><Globe className="w-4 h-4" /></span>
                  <input type="url" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && convert()}
                    placeholder="https://example.com" className="flex-1 py-3 pr-3 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 outline-none text-sm" />
                </div>
              </div>
              <button onClick={() => setShowSettings(!showSettings)} className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                <Settings className="w-4 h-4" />{showSettings ? "Hide" : "Show"} options
              </button>
              {showSettings && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200 dark:border-slate-700">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Paper Size</label>
                    <select value={format} onChange={e => setFormat(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white">
                      {["A4","A3","Letter","Legal","Tabloid"].map(f => <option key={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Margin</label>
                    <select value={margin} onChange={e => setMargin(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white">
                      {["0.5cm","1cm","1.5cm","2cm"].map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={landscape} onChange={e => setLandscape(e.target.checked)} className="rounded" />Landscape
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={printBg} onChange={e => setPrintBg(e.target.checked)} className="rounded" />Print Background
                  </label>
                </div>
              )}
              {error && <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3 text-red-700 dark:text-red-300 text-sm"><AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /><p>{error}</p></div>}
              <button onClick={convert} disabled={busy || !url.trim()} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                {busy ? <><Loader2 className="w-5 h-5 animate-spin" />Converting webpage… (30-60s)</> : <><Globe className="w-5 h-5" />Convert to PDF</>}
              </button>
              {busy && <p className="text-center text-xs text-gray-500 dark:text-slate-400">Launching headless browser and rendering the page. Please wait…</p>}
            </div>
          </>
        ) : (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-8 text-center space-y-4">
            <CheckCircle className="w-12 h-12 text-blue-600 dark:text-blue-400 mx-auto" />
            <h2 className="text-2xl font-bold text-blue-800 dark:text-blue-300">PDF Ready!</h2>
            <p className="text-blue-700 dark:text-blue-400 text-sm">{url}</p>
            <a href={resultUrl} download={resultName} className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors">
              <Download className="w-5 h-5" />Download PDF
            </a>
            <button onClick={() => { setResultUrl(null); setUrl(""); }} className="block w-full text-center text-gray-500 dark:text-slate-400 text-sm font-medium">Convert another URL</button>
          </div>
        )}
      </div>
    </div>
  );
}
