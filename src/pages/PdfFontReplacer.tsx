import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Type, Download, AlertTriangle, Loader2, FileText, CheckCircle, Check } from "lucide-react";
import FileDropzone from "../components/FileDropzone";
import { usePageSEO } from "../lib/usePageSEO";
import { useSEO } from '../hooks/useSEO';
import { apiFetch } from "../lib/api";
import { useAutoRevokeUrl } from "../lib/blobUrl";
import ToolWorkspaceShell from "../components/pearl/ToolWorkspaceShell";
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from "../components/pearl/PearlMotion";

const FONTS = [
  { key: "helv", name: "Helvetica", desc: "Clean sans-serif — modern, widely used" },
  { key: "tiro", name: "Times Roman", desc: "Classic serif — formal documents" },
  { key: "cour", name: "Courier", desc: "Monospace — code, terminal output" },
];

export default function PdfFontReplacer() {
  useSEO('Pdf Font Replacer Online Free | PDF Media Suite', 'Free online Pdf Font Replacer tool. No signup or installation required.');

  usePageSEO("PDF Font Replacer", "Replace all fonts in a PDF with Helvetica, Times Roman, or Courier. Global font replacement for branding consistency. Free tool.");
  const [file, setFile] = useState<File | null>(null);
  const [font, setFont] = useState("helv");
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useAutoRevokeUrl(resultUrl);
  const prefersReduced = useReducedMotion();

  const process = async () => {
    if (!file) return;
    setBusy(true); setError(null);
    setResultUrl(null);
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("font_name", font);
      const res = await apiFetch('/convert/replace-font', { method: "POST", body: fd, timeoutMs: 60000 });
      if (!res.ok) { const e = await res.json().catch(() => ({ detail: "Failed." })); throw new Error(e.detail || "Processing failed."); }
      const blob = await res.blob();
      const fn = FONTS.find(f => f.key === font)!;
      setResultName(`${file.name.replace(/\.pdf$/i,"")}_${fn.name.replace(" ","_")}.pdf`);
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) { setError(e.message || "Processing failed."); }
    finally { setBusy(false); }
  };

  const stageKey = !file ? "upload" : !resultUrl ? "configure" : "result";

  return (
    <ToolWorkspaceShell
      title="PDF Font Replacer"
      subtitle="Replace all fonts in your PDF with a clean, standard font. Ideal for corporate branding consistency."
      categoryLabel="Typography Standardization"
      icon={Type}
      microVariant="edit"
      tone="violet"
      trustNote="Server-assisted vector font normalization · Ephemeral zero-retention processing"
    >
      <PearlStageSwitch stageKey={stageKey}>
        {!file ? (
          <div className="max-w-2xl mx-auto">
            <FileDropzone onDrop={f => { if(f[0]){setFile(f[0]);setResultUrl(null);setError(null);} }} multiple={false} />
          </div>
        ) : !resultUrl ? (
          <div className="relative w-full max-w-lg mx-auto pms-glass-panel rounded-3xl p-6 space-y-5 overflow-hidden">
            <PearlScanOverlay active={busy} label="Normalizing PDF typography…" />

            <div
              className="rounded-2xl border p-4 flex items-center gap-4"
              style={{ backgroundColor: "var(--pms-white)", borderColor: "var(--pms-border)" }}
            >
              <div className="w-11 h-11 bg-[var(--pms-soft-lavender)] rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-[var(--pms-violet)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 dark:text-white truncate">{file.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <AnimatedNumber value={file.size / 1024 / 1024} decimals={2} suffix=" MB" />
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Replace all fonts with
              </p>
              {FONTS.map(f => {
                const selected = font === f.key;
                return (
                  <motion.label
                    key={f.key}
                    whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                    className="relative flex items-center justify-between gap-4 p-4 rounded-2xl border cursor-pointer transition-colors overflow-hidden"
                    style={{
                      borderColor: selected ? "var(--pms-violet)" : "var(--pms-border)",
                      backgroundColor: selected ? "var(--pms-soft-lavender)" : "var(--pms-white)",
                    }}
                  >
                    <div className="flex items-center gap-3.5">
                      <input type="radio" name="font" value={f.key} checked={selected} onChange={() => setFont(f.key)} className="accent-violet-600" />
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white" style={{ fontFamily: f.key === "helv" ? "Helvetica,Arial,sans-serif" : f.key === "tiro" ? "Times New Roman,serif" : "Courier New,monospace" }}>{f.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{f.desc}</p>
                      </div>
                    </div>
                    {selected && (
                      <span className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </motion.label>
                );
              })}
            </div>

            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl flex items-start gap-3 text-red-700 dark:text-red-300 text-sm">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <motion.button
                whileHover={prefersReduced || busy ? undefined : { scale: 1.01 }}
                whileTap={prefersReduced || busy ? undefined : { scale: 0.985 }}
                onClick={process}
                disabled={busy}
                className="flex-1 pms-btn-primary py-4 font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer notranslate"
                translate="no"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Type className="w-5 h-5" />}
                <span>{busy ? "Replacing fonts…" : "Replace Fonts"}</span>
              </motion.button>
              <button
                onClick={() => { setFile(null); setError(null); }}
                disabled={busy}
                className="px-6 py-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="pms-glass-panel rounded-3xl border border-emerald-200/80 dark:border-emerald-800/70 p-8 text-center space-y-5 max-w-lg mx-auto">
            <motion.div
              initial={prefersReduced ? false : { scale: 0.45, rotate: -10, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 360, damping: 18 }}
              className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner"
            >
              <CheckCircle className="w-10 h-10" />
            </motion.div>
            <div>
              <span className="inline-block px-3.5 py-1 bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-bold uppercase tracking-wider mb-2 border border-[var(--pms-border)]">
                Typography Updated
              </span>
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">Fonts Replaced!</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                All document spans have been standardized to {FONTS.find(f => f.key === font)?.name}.
              </p>
            </div>
            <motion.a
              whileHover={prefersReduced ? undefined : { scale: 1.015 }}
              whileTap={prefersReduced ? undefined : { scale: 0.985 }}
              href={resultUrl}
              download={resultName}
              className="pms-btn-primary inline-flex items-center justify-center gap-2 w-full py-3.5 px-8 font-bold rounded-2xl"
            >
              <Download className="w-5 h-5" />Download PDF
            </motion.a>
            <button
              onClick={() => { setFile(null); setResultUrl(null); }}
              className="block w-full text-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm font-semibold cursor-pointer"
            >
              Process another
            </button>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
