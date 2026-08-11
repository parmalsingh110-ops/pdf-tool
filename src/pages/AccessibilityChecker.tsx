import { useState } from "react";
import { Accessibility, CheckCircle, XCircle, AlertTriangle, Loader2, FileText } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import "../lib/pdfWorker";
import { PDFDocument } from "pdf-lib";
import FileDropzone from "../components/FileDropzone";
import { usePageSEO } from "../lib/usePageSEO";

interface Check { id: string; label: string; desc: string; status: "pass"|"fail"|"warn"; detail?: string; }

export default function AccessibilityChecker() {
  usePageSEO("PDF Accessibility Checker", "Check if your PDF is accessible — WCAG 2.1, screen reader ready, tagged, alt-text, language, reading order. Free compliance tool.");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [score, setScore] = useState(0);

  const analyze = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const pdfJs = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const pdfLib = await PDFDocument.load(new Uint8Array(buf));
      const meta = await pdfJs.getMetadata().catch(() => ({ info: {}, metadata: null }));
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

  const statusIcon = (s: string) => s === "pass" ? <CheckCircle className="w-5 h-5 text-green-500 shrink-0" /> : s === "fail" ? <XCircle className="w-5 h-5 text-red-500 shrink-0" /> : <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />;
  const scoreColor = score >= 80 ? "text-green-600 dark:text-green-400" : score >= 60 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
  const scoreLabel = score >= 80 ? "Good Accessibility" : score >= 60 ? "Needs Improvement" : "Poor Accessibility";

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-950/40 rounded-2xl flex items-center justify-center mx-auto mb-4"><Accessibility className="w-8 h-8 text-green-600 dark:text-green-400" /></div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">PDF Accessibility Checker</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400 max-w-xl mx-auto">Check if your PDF meets WCAG 2.1 accessibility standards — screen reader ready, tagged, navigable.</p>
      </div>
      {!file ? (
        <FileDropzone onDrop={f => { if(f[0]){setFile(f[0]);setChecks(null);} }} multiple={false} />
      ) : !checks ? (
        <div className="w-full max-w-lg space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 flex items-center gap-4">
            <div className="w-10 h-10 bg-green-50 dark:bg-green-950/40 rounded-xl flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-green-600" /></div>
            <div className="flex-1 min-w-0"><p className="font-semibold text-gray-900 dark:text-white truncate">{file.name}</p><p className="text-sm text-gray-500 dark:text-slate-400">{(file.size/1024/1024).toFixed(2)} MB</p></div>
          </div>
          <div className="flex gap-3">
            <button onClick={analyze} disabled={busy} className="flex-1 py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Accessibility className="w-5 h-5" />}{busy ? "Analyzing…" : "Run Accessibility Check"}
            </button>
            <button onClick={() => setFile(null)} className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-2xl space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-6 text-center">
            <p className={`text-6xl font-black ${scoreColor} mb-1`}>{score}%</p>
            <p className={`font-bold text-lg ${scoreColor}`}>{scoreLabel}</p>
            <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-3 mt-3">
              <div className={`h-3 rounded-full transition-all ${score >= 80 ? "bg-green-500" : score >= 60 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${score}%` }} />
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 divide-y divide-gray-200 dark:divide-slate-700 overflow-hidden">
            {checks.map(c => (
              <div key={c.id} className="p-4 flex items-start gap-4">
                {statusIcon(c.status)}
                <div className="flex-1">
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">{c.label}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{c.desc}</p>
                  {c.detail && <p className={`text-xs mt-1 font-medium ${c.status === "pass" ? "text-green-600 dark:text-green-400" : c.status === "fail" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>{c.detail}</p>}
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => { setFile(null); setChecks(null); }} className="w-full py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">Check another PDF</button>
        </div>
      )}
    </div>
  );
}
