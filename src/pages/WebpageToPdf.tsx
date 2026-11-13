import { useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Globe, Download, AlertTriangle, Loader2, Settings, CheckCircle } from "lucide-react";
import { usePageSEO } from "../lib/usePageSEO";
import { useSEO } from '../hooks/useSEO';
import { apiFetch } from "../lib/api";
import ToolWorkspaceShell from "../components/pearl/ToolWorkspaceShell";
import { PearlScanOverlay, PearlStageSwitch } from "../components/pearl/PearlMotion";

export default function WebpageToPdf() {
  useSEO('Webpage To Pdf Online Free | PDF Media Suite', 'Free online Webpage To Pdf tool. No signup or installation required.');

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

  const prefersReduced = useReducedMotion();

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  const convert = async () => {
    if (!url.trim()) return;
    let fullUrl = url.trim();
    if (!fullUrl.startsWith("http://") && !fullUrl.startsWith("https://")) fullUrl = "https://" + fullUrl;
    setBusy(true); setError(null);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    try {
      const fd = new FormData();
      fd.append("url", fullUrl); fd.append("paper_format", format);
      fd.append("landscape", String(landscape)); fd.append("margin", margin);
      fd.append("background", String(printBg));
      const res = await apiFetch('/convert/webpage-to-pdf', { method: "POST", body: fd, timeoutMs: 90000 });
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
    <ToolWorkspaceShell
      title="Webpage to PDF"
      subtitle="Enter any public URL — we convert the full webpage to a paginated, print-ready PDF."
      categoryLabel="Headless Print Engine"
      icon={Globe}
      microVariant="convert"
      tone="blue"
      trustNote="Paginated A4/Letter output · Full CSS background rendering · Ephemeral server conversion"
    >
      <div className="w-full max-w-xl mx-auto">
        <PearlStageSwitch stageKey={!resultUrl ? "configure" : "result"}>
          {!resultUrl ? (
            <div className="relative pms-glass-panel rounded-3xl p-6 sm:p-7 space-y-5 overflow-hidden">
              <PearlScanOverlay active={busy} label="Launching headless browser & rendering PDF (30–60s)…" />

              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">Website URL</label>
                <div className="flex items-center gap-2 border border-[var(--pms-border)] bg-white/90 dark:bg-slate-900/80 rounded-2xl overflow-hidden focus-within:ring-2 focus-within:ring-sky-500">
                  <span className="px-3.5 text-[var(--pms-blue)] select-none"><Globe className="w-4 h-4" /></span>
                  <input
                    type="url"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && convert()}
                    placeholder="https://example.com"
                    className="flex-1 py-3.5 pr-3 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none text-sm"
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Enter a public webpage URL. Private pages requiring login (e.g. Google Search Console, Gmail, private dashboards) cannot be rendered by the server.
                </p>
              </div>

              <button
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-[var(--pms-blue)] transition-colors cursor-pointer"
              >
                <Settings className="w-4 h-4" />{showSettings ? "Hide" : "Show"} options
              </button>

              <AnimatePresence initial={false}>
                {showSettings && (
                  <motion.div
                    initial={prefersReduced ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={prefersReduced ? undefined : { opacity: 0, height: 0 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[var(--pms-border)]">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Paper Size</label>
                        <select
                          value={format}
                          onChange={e => setFormat(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-[var(--pms-border)] bg-white/90 dark:bg-slate-800 text-sm text-slate-900 dark:text-white outline-none"
                        >
                          {["A4", "A3", "Letter", "Legal", "Tabloid"].map(f => <option key={f}>{f}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Margin</label>
                        <select
                          value={margin}
                          onChange={e => setMargin(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-[var(--pms-border)] bg-white/90 dark:bg-slate-800 text-sm text-slate-900 dark:text-white outline-none"
                        >
                          {["0.5cm", "1cm", "1.5cm", "2cm"].map(m => <option key={m}>{m}</option>)}
                        </select>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
                        <input type="checkbox" checked={landscape} onChange={e => setLandscape(e.target.checked)} className="rounded accent-sky-600" />
                        Landscape
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
                        <input type="checkbox" checked={printBg} onChange={e => setPrintBg(e.target.checked)} className="rounded accent-sky-600" />
                        Print Background
                      </label>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {error && (
                <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-2xl flex items-start gap-3 text-rose-700 dark:text-rose-300 text-sm">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /><p>{error}</p>
                </div>
              )}

              <motion.button
                whileHover={prefersReduced || busy || !url.trim() ? undefined : { scale: 1.01 }}
                whileTap={prefersReduced || busy || !url.trim() ? undefined : { scale: 0.985 }}
                onClick={convert}
                disabled={busy || !url.trim()}
                className="w-full pms-btn-primary py-4 font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {busy ? <><Loader2 className="w-5 h-5 animate-spin" />Converting webpage… (30-60s)</> : <><Globe className="w-5 h-5" />Convert to PDF</>}
              </motion.button>
              {busy && (
                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  Launching headless browser and rendering the page. Please wait…
                </p>
              )}
            </div>
          ) : (
            <div className="pms-glass-panel border border-emerald-200/80 dark:border-emerald-800/70 rounded-3xl p-8 text-center space-y-5">
              <motion.div
                initial={prefersReduced ? false : { scale: 0.45, rotate: -10, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 360, damping: 18 }}
                className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 rounded-full flex items-center justify-center mx-auto shadow-inner"
              >
                <CheckCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </motion.div>
              <div>
                <h2 className="text-2xl font-extrabold text-emerald-900 dark:text-emerald-200">PDF Ready!</h2>
                <p className="text-emerald-700 dark:text-emerald-400 text-sm mt-1 break-all">{url}</p>
              </div>
              <motion.a
                whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                href={resultUrl}
                download={resultName}
                className="pms-btn-primary inline-flex items-center gap-2 px-8 py-3.5 font-bold rounded-2xl"
              >
                <Download className="w-5 h-5" />Download PDF
              </motion.a>
              <button
                onClick={() => { setResultUrl(null); setUrl(""); }}
                className="block w-full text-center text-slate-600 dark:text-slate-300 hover:text-[var(--pms-rose)] text-sm font-semibold cursor-pointer transition-colors"
              >
                Convert another URL
              </button>
            </div>
          )}
        </PearlStageSwitch>
      </div>
    </ToolWorkspaceShell>
  );
}
