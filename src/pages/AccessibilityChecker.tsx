import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Accessibility, CheckCircle, XCircle, AlertTriangle, Loader2, FileText } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import "../lib/pdfWorker";
import { PDFDocument } from "pdf-lib";
import FileDropzone from "../components/FileDropzone";
import { usePageSEO } from "../lib/usePageSEO";
import { useSEO } from '../hooks/useSEO';
import ToolWorkspaceShell from "../components/pearl/ToolWorkspaceShell";
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from "../components/pearl/PearlMotion";

interface Check { id: string; label: string; desc: string; status: "pass"|"fail"|"warn"; detail?: string; }

export default function AccessibilityChecker() {
  useSEO('Accessibility Checker Online Free | PDF Media Suite', 'Free online Accessibility Checker tool. No signup or installation required.');

  usePageSEO("PDF Accessibility Checker", "Check if your PDF is accessible — WCAG 2.1, screen reader ready, tagged, alt-text, language, reading order. Free compliance tool.");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [score, setScore] = useState(0);
  const prefersReduced = useReducedMotion();

  const analyze = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const pdfJs = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const pdfLib = await PDFDocument.load(new Uint8Array(buf));
      await pdfJs.getMetadata().catch(() => ({ info: {}, metadata: null }));
      const results: Check[] = [];

      // 1. Has Title
      const title = pdfLib.getTitle() || "";
      results.push({ id:"title", label:"Document Title", desc:"PDF has a descriptive title set in metadata", status: title.trim() ? "pass" : "fail", detail: title || "No title found" });

      // 2. Language specified
      const catalog = pdfLib.catalog as any;
      let hasLang = false;
      try { hasLang = catalog.has("Lang"); } catch {}
      results.push({ id:"lang", label:"Language Specified", desc:"Document language is declared (required for screen readers)", status: hasLang ? "pass" : "warn", detail: hasLang ? "Language tag present" : "No /Lang entry in catalog" });

      // 3. Tagged PDF (structure tree)
      let isTagged = false;
      try { isTagged = catalog.has("MarkInfo") || catalog.has("StructTreeRoot"); } catch {}
      results.push({ id:"tagged", label:"Tagged PDF (Structure Tree)", desc:"Tagged PDFs have semantic structure — screen readers need this", status: isTagged ? "pass" : "fail", detail: isTagged ? "Document is tagged" : "No structure tree found — not screen-reader accessible" });

      // 4. Text extractable
      const firstPage = await pdfJs.getPage(1);
      const textContent = await firstPage.getTextContent();
      const hasText = textContent.items.length > 5;
      results.push({ id:"text", label:"Text is Selectable/Extractable", desc:"Text must be extractable, not just images of text", status: hasText ? "pass" : "fail", detail: hasText ? `${textContent.items.length} text spans found on page 1` : "No selectable text found — may be a scanned image" });

      // 5. No password protection
      let encrypted = false;
      try { encrypted = (pdfLib as any)._encryption !== null && (pdfLib as any)._encryption !== undefined; } catch {}
      results.push({ id:"encrypt", label:"Not Encrypted", desc:"Encrypted PDFs can restrict screen reader access", status: encrypted ? "warn" : "pass", detail: encrypted ? "Document is encrypted" : "No encryption detected" });

      // 6. Has images — check for alt text (can only warn since pdf-lib doesn't expose alt text easily)
      let imgCount = 0;
      try {
        for (let i = 1; i <= Math.min(pdfJs.numPages, 5); i++) {
          const pg = await pdfJs.getPage(i);
          const ops = await pg.getOperatorList();
          for (const fn of ops.fnArray) {
            if (fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintInlineImageXObject) imgCount++;
          }
        }
      } catch {}
      if (imgCount > 0) {
        results.push({ id:"alttext", label:"Image Alt Text", desc:"Images should have alternative text descriptions", status: isTagged ? "warn" : "fail", detail: `${imgCount} images found (first 5 pages). ${isTagged ? "Tagged PDF may have alt text — verify manually." : "No structure tree — alt text likely missing."}` });
      } else {
        results.push({ id:"alttext", label:"Image Alt Text", desc:"Images should have alternative text descriptions", status: "pass", detail: "No images detected in first 5 pages" });
      }

      // 7. Form fields have labels
      const form = pdfLib.getForm();
      const fields = form.getFields();
      if (fields.length > 0) {
        const unnamedFields = fields.filter(f => !f.getName() || f.getName().trim() === "").length;
        results.push({ id:"formfields", label:"Form Field Labels", desc:"Interactive form fields must have accessible names", status: unnamedFields === 0 ? "pass" : "warn", detail: `${fields.length} fields — ${unnamedFields} unnamed` });
      } else {
        results.push({ id:"formfields", label:"Form Field Labels", desc:"Interactive form fields must have accessible names", status: "pass", detail: "No interactive form fields found" });
      }

      // 8. Bookmarks/Navigation
      let hasBookmarks = false;
      try { hasBookmarks = catalog.has("Outlines"); } catch {}
      const pageCount = pdfLib.getPageCount();
      results.push({ id:"nav", label:"Document Navigation (Bookmarks)", desc:"Documents over 10 pages should have bookmarks for navigation", status: pageCount > 10 ? (hasBookmarks ? "pass" : "warn") : "pass", detail: hasBookmarks ? "Bookmarks/outline present" : pageCount > 10 ? `${pageCount} pages but no bookmarks — navigation may be difficult` : `${pageCount} pages — bookmarks optional` });

      // Score
      const passCount = results.filter(r => r.status === "pass").length;
      setScore(Math.round((passCount / results.length) * 100));
      setChecks(results);
    } catch (e: any) { alert(e?.message || "Analysis failed."); }
    finally { setBusy(false); }
  };

  const statusIcon = (s: string) => s === "pass" ? <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" /> : s === "fail" ? <XCircle className="w-5 h-5 text-rose-500 shrink-0" /> : <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />;
  const scoreColor = score >= 80 ? "text-emerald-600 dark:text-emerald-400" : score >= 60 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400";
  const scoreLabel = score >= 80 ? "Good Accessibility" : score >= 60 ? "Needs Improvement" : "Poor Accessibility";

  const passTotal = checks ? checks.filter(c => c.status === "pass").length : 0;
  const warnTotal = checks ? checks.filter(c => c.status === "warn").length : 0;
  const failTotal = checks ? checks.filter(c => c.status === "fail").length : 0;
  const stageKey = !file ? "upload" : !checks ? "ready" : "report";

  return (
    <ToolWorkspaceShell
      title="PDF Accessibility Checker"
      subtitle="Check if your PDF meets WCAG 2.1 accessibility standards — screen reader ready, tagged, navigable."
      categoryLabel="WCAG 2.1 Compliance Auditor"
      icon={Accessibility}
      microVariant="compare"
      tone="emerald"
      trustNote="8-point structural & screen-reader compliance check · 100% client-side"
    >
      <PearlStageSwitch stageKey={stageKey}>
        {!file ? (
          <div className="max-w-2xl mx-auto">
            <FileDropzone onDrop={f => { if(f[0]){setFile(f[0]);setChecks(null);} }} multiple={false} />
          </div>
        ) : !checks ? (
          <div className="relative w-full max-w-lg mx-auto pms-glass-panel rounded-3xl p-6 space-y-5 overflow-hidden">
            <PearlScanOverlay active={busy} label="Auditing PDF structure tree & WCAG 2.1 tags…" />

            <div
              className="rounded-2xl border p-5 flex items-center gap-4"
              style={{ backgroundColor: "var(--pms-white)", borderColor: "var(--pms-border)" }}
            >
              <div className="w-11 h-11 bg-[var(--pms-soft-mint)] rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 dark:text-white truncate">{file.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  <AnimatedNumber value={file.size / 1024 / 1024} decimals={2} suffix=" MB" />
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <motion.button
                whileHover={prefersReduced || busy ? undefined : { scale: 1.01 }}
                whileTap={prefersReduced || busy ? undefined : { scale: 0.985 }}
                onClick={analyze}
                disabled={busy}
                className="flex-1 pms-btn-primary py-4 font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer notranslate"
                translate="no"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Accessibility className="w-5 h-5" />}
                <span>{busy ? "Analyzing…" : "Run Accessibility Check"}</span>
              </motion.button>
              <button
                onClick={() => setFile(null)}
                disabled={busy}
                className="px-6 py-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-2xl mx-auto space-y-5">
            <div className="pms-glass-panel rounded-3xl p-7 text-center space-y-3">
              <p className={`text-6xl font-black ${scoreColor}`}>
                <AnimatedNumber value={score} suffix="%" />
              </p>
              <span
                className={`inline-block px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-[var(--pms-border)] ${
                  score >= 80
                    ? "bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300"
                    : score >= 60
                      ? "bg-amber-100/80 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300"
                      : "bg-[var(--pms-soft-rose)] text-[var(--pms-rose)]"
                }`}
              >
                {scoreLabel}
              </span>
              <div className="w-full bg-slate-200/80 dark:bg-slate-800 rounded-full h-3 mt-3 overflow-hidden">
                <motion.div
                  initial={prefersReduced ? false : { width: 0 }}
                  animate={{ width: `${score}%` }}
                  transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                  className={`h-3 rounded-full ${score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-rose-500"}`}
                />
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs font-bold">
                <span className="px-3 py-1 rounded-full bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300 border border-[var(--pms-border)]">
                  <AnimatedNumber value={passTotal} suffix=" Passed" />
                </span>
                <span className="px-3 py-1 rounded-full bg-amber-100/70 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-[var(--pms-border)]">
                  <AnimatedNumber value={warnTotal} suffix=" Warnings" />
                </span>
                <span className="px-3 py-1 rounded-full bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] border border-[var(--pms-border)]">
                  <AnimatedNumber value={failTotal} suffix=" Failed" />
                </span>
              </div>
            </div>

            <div className="pms-glass-panel rounded-3xl divide-y divide-[var(--pms-border)] overflow-hidden">
              {checks.map((c, idx) => (
                <motion.div
                  key={c.id}
                  initial={prefersReduced ? false : { opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.24, delay: idx * 0.04 }}
                  className="p-4 flex items-start gap-4"
                >
                  {statusIcon(c.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-slate-900 dark:text-white text-sm">{c.label}</p>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border border-[var(--pms-border)] ${
                          c.status === "pass"
                            ? "bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300"
                            : c.status === "fail"
                              ? "bg-[var(--pms-soft-rose)] text-[var(--pms-rose)]"
                              : "bg-amber-100/80 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{c.desc}</p>
                    {c.detail && (
                      <p className={`text-xs mt-1 font-medium ${c.status === "pass" ? "text-emerald-600 dark:text-emerald-400" : c.status === "fail" ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"}`}>
                        {c.detail}
                      </p>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>

            <button
              onClick={() => { setFile(null); setChecks(null); }}
              className="w-full py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-2xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Check another PDF
            </button>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
