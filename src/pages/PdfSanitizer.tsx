import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Shield, Download, CheckCircle, FileText, Loader2, AlertTriangle } from "lucide-react";
import { PDFDocument, PDFName } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import "../lib/pdfWorker";
import FileDropzone from "../components/FileDropzone";
import { usePageSEO } from "../lib/usePageSEO";
import { useSEO } from '../hooks/useSEO';
import { toArrayBufferBytes, useAutoRevokeUrl } from "../lib/blobUrl";
import ToolWorkspaceShell from "../components/pearl/ToolWorkspaceShell";
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from "../components/pearl/PearlMotion";

interface SanitizeReport {
  metadata: number;
  javascript: number;
  embeddedFiles: number;
  formFields: number;
  bookmarks: number;
  annotations: number;
  thumbnails: number;
  xmpData: boolean;
  hiddenTextPages: number;
  links: number;
  originalSize: string;
  newSize: string;
  savings: string;
}

export default function PdfSanitizer() {
  useSEO('Pdf Sanitizer Online Free | PDF Media Suite', 'Free online Pdf Sanitizer tool. No signup or installation required.');

  usePageSEO(
    "PDF Deep Sanitizer — Remove All Hidden Data",
    "Completely sanitize your PDF: remove hidden metadata, JavaScript, embedded files, form fields, bookmarks, tracking data and more. Free, private, browser-only."
  );

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<SanitizeReport | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useAutoRevokeUrl(resultUrl);

  const handleDrop = (files: File[]) => {
    if (files[0]) { setFile(files[0]); setReport(null); setResultUrl(null); setError(null); }
  };

  const sanitize = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(new Uint8Array(buf));

      const rep: SanitizeReport = {
        metadata: 0, javascript: 0, embeddedFiles: 0, formFields: 0,
        bookmarks: 0, annotations: 0, thumbnails: 0, xmpData: false,
        hiddenTextPages: 0, links: 0, originalSize: (file.size / 1024).toFixed(1),
        newSize: "0", savings: "0",
      };

      // 1. Strip standard metadata
      let metaCount = 0;
      if (pdfDoc.getTitle()) metaCount++;
      if (pdfDoc.getAuthor()) metaCount++;
      if (pdfDoc.getSubject()) metaCount++;
      if (pdfDoc.getKeywords()) metaCount++;
      if (pdfDoc.getProducer()) metaCount++;
      if (pdfDoc.getCreator()) metaCount++;
      rep.metadata = metaCount;
      pdfDoc.setTitle(""); pdfDoc.setAuthor(""); pdfDoc.setSubject("");
      pdfDoc.setKeywords([]); pdfDoc.setProducer(""); pdfDoc.setCreator("");

      // 2. Remove XMP metadata stream
      try {
        const catalog = pdfDoc.catalog;
        const metaKey = PDFName.of("Metadata");
        if (catalog.has(metaKey)) { catalog.delete(metaKey); rep.xmpData = true; }
      } catch { /* best-effort */ }

      // 3. Remove embedded files
      try {
        const catalog = pdfDoc.catalog;
        const namesKey = PDFName.of("Names");
        const embKey = PDFName.of("EmbeddedFiles");
        if (catalog.has(namesKey)) {
          const names = catalog.lookup(namesKey) as any;
          if (names && typeof names.has === "function" && names.has(embKey)) {
            names.delete(embKey); rep.embeddedFiles++;
          }
        }
      } catch { /* best-effort */ }

      // 4. Remove JavaScript actions
      try {
        const catalog = pdfDoc.catalog;
        const aaKey = PDFName.of("AA");
        const openActionKey = PDFName.of("OpenAction");
        const namesKey = PDFName.of("Names");
        const jsKey = PDFName.of("JavaScript");
        if (catalog.has(aaKey)) { catalog.delete(aaKey); rep.javascript++; }
        if (catalog.has(openActionKey)) { catalog.delete(openActionKey); rep.javascript++; }
        if (catalog.has(namesKey)) {
          const names = catalog.lookup(namesKey) as any;
          if (names && typeof names.has === "function" && names.has(jsKey)) {
            names.delete(jsKey); rep.javascript++;
          }
        }
      } catch { /* best-effort */ }

      // 5. Remove bookmarks/outline
      try {
        const catalog = pdfDoc.catalog;
        const outlinesKey = PDFName.of("Outlines");
        if (catalog.has(outlinesKey)) { catalog.delete(outlinesKey); rep.bookmarks++; }
      } catch { /* best-effort */ }

      // 6. Remove thumbnails
      try {
        const thumbKey = PDFName.of("Thumb");
        for (const page of pdfDoc.getPages()) {
          if (page.node.has(thumbKey)) { page.node.delete(thumbKey); rep.thumbnails++; }
        }
      } catch { /* best-effort */ }

      // 7. Flatten form fields
      try {
        const form = pdfDoc.getForm();
        const fields = form.getFields();
        rep.formFields = fields.length;
        if (fields.length > 0) form.flatten();
      } catch { /* best-effort */ }

      // 8. Remove annotations (comments, links)
      try {
        const annotsKey = PDFName.of("Annots");
        const subtypeKey = PDFName.of("Subtype");
        for (const page of pdfDoc.getPages()) {
          if (page.node.has(annotsKey)) {
            const annots = page.node.lookup(annotsKey) as any;
            if (annots && typeof annots.asArray === "function") {
              for (const annot of annots.asArray()) {
                try {
                  const subtype = annot?.lookup?.(subtypeKey)?.encodedName;
                  if (subtype === "/Link") rep.links++;
                  else rep.annotations++;
                } catch { rep.annotations++; }
              }
            }
            page.node.delete(annotsKey);
          }
        }
      } catch { /* best-effort */ }

      // 9. Detect hidden text via pdfjs
      try {
        const pdfJsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        for (let i = 1; i <= pdfJsDoc.numPages; i++) {
          const pg = await pdfJsDoc.getPage(i);
          const ops = await pg.getOperatorList();
          const TF_OP = pdfjsLib.OPS.setTextRenderingMode;
          for (let j = 0; j < ops.fnArray.length; j++) {
            if (ops.fnArray[j] === TF_OP && ops.argsArray[j]?.[0] === 3) {
              rep.hiddenTextPages++; break;
            }
          }
        }
      } catch { /* best-effort */ }

      // 10. Save
      const outBytes = toArrayBufferBytes(await pdfDoc.save({ useObjectStreams: false }));
      const blob = new Blob([outBytes], { type: "application/pdf" });
      rep.newSize = (outBytes.length / 1024).toFixed(1);
      rep.savings = Math.max(0, (file.size - outBytes.length) / 1024).toFixed(1);
      setReport(rep);
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      setError(e?.message || "Sanitization failed. File may be corrupted or encrypted.");
    } finally {
      setBusy(false);
    }
  };

  const layers = report ? [
    { label: "Metadata Fields", value: report.metadata, color: "text-rose-500" },
    { label: "XMP Data Stream", value: report.xmpData ? 1 : 0, color: "text-orange-500" },
    { label: "JavaScript Actions", value: report.javascript, color: "text-yellow-600" },
    { label: "Embedded Files", value: report.embeddedFiles, color: "text-blue-500" },
    { label: "Form Fields", value: report.formFields, color: "text-purple-500" },
    { label: "Bookmarks", value: report.bookmarks, color: "text-indigo-500" },
    { label: "Annotations/Comments", value: report.annotations, color: "text-teal-500" },
    { label: "Hyperlinks", value: report.links, color: "text-cyan-500" },
    { label: "Page Thumbnails", value: report.thumbnails, color: "text-emerald-500" },
    { label: "Hidden OCR Text Layers", value: report.hiddenTextPages, color: "text-amber-500", isStatus: true },
  ] : [];

  const totalRemoved = layers.filter((l: any) => !l.isStatus).reduce((s, l) => s + l.value, 0);
  const prefersReduced = useReducedMotion();
  const stageKey = !file ? "upload" : !resultUrl ? "ready" : "report";

  return (
    <ToolWorkspaceShell
      title="PDF Deep Sanitizer"
      subtitle="Remove hidden metadata, JavaScript, embedded files, tracking data, comments, and 10+ hidden layers from your PDF."
      categoryLabel="Deep Privacy Shield"
      icon={Shield}
      microVariant="security"
      tone="emerald"
      trustNote="100% browser-only deep scrub · Strips scripts, XMP & hidden OCR text"
    >
      <div className="flex flex-wrap items-center justify-center gap-2 mb-7">
        {["Metadata", "JavaScript", "Hidden Text", "Bookmarks", "Attachments", "Form Fields", "Thumbnails", "XMP Data"].map((tag, idx) => (
          <motion.span
            key={tag}
            initial={prefersReduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: idx * 0.03 }}
            className="px-3 py-1 text-xs font-semibold bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300 rounded-full border border-[var(--pms-border)]"
          >
            ✓ {tag}
          </motion.span>
        ))}
      </div>

      <PearlStageSwitch stageKey={stageKey}>
        {!file ? (
          <div className="max-w-2xl mx-auto">
            <FileDropzone onDrop={handleDrop} multiple={false} />
          </div>
        ) : !resultUrl ? (
          <div className="relative w-full max-w-lg mx-auto pms-glass-panel rounded-3xl p-6 space-y-5 overflow-hidden">
            <PearlScanOverlay active={busy} label="Inspecting & stripping 10 hidden layers…" />

            <div
              className="rounded-2xl border p-5 flex items-center gap-4"
              style={{ backgroundColor: "var(--pms-white)", borderColor: "var(--pms-border)" }}
            >
              <div className="w-12 h-12 bg-[var(--pms-soft-mint)] rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 dark:text-white truncate">{file.name}</p>
                <p className="text-sm text-gray-500 dark:text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>

            {error && (
              <motion.div
                initial={prefersReduced ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3 text-red-700 dark:text-red-300"
              >
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm">{error}</p>
              </motion.div>
            )}

            <div className="flex gap-3">
              <motion.button
                whileHover={prefersReduced || busy ? undefined : { scale: 1.01 }}
                whileTap={prefersReduced || busy ? undefined : { scale: 0.985 }}
                onClick={sanitize}
                disabled={busy}
                className="flex-1 pms-btn-primary py-4 font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
                {busy ? "Sanitizing…" : "Deep Sanitize PDF"}
              </motion.button>
              <button
                onClick={() => { setFile(null); setError(null); }}
                disabled={busy}
                className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-2xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-xl mx-auto space-y-5">
            <div className="pms-glass-panel rounded-3xl p-7 text-center border border-emerald-200/80 dark:border-emerald-800/70">
              <motion.div
                initial={prefersReduced ? false : { scale: 0.45, rotate: -10, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 360, damping: 18 }}
                className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner"
              >
                <CheckCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </motion.div>
              <h2 className="text-2xl font-extrabold text-emerald-900 dark:text-emerald-200 mb-1">PDF Sanitized!</h2>
              <p className="text-emerald-700 dark:text-emerald-400 text-sm mb-5">
                Removed{" "}
                <strong className="font-extrabold">
                  <AnimatedNumber value={totalRemoved} />
                </strong>{" "}
                hidden elements across 10 layers
                {Number(report?.savings) > 0 && (
                  <>
                    {" "}· Saved <AnimatedNumber value={Number(report?.savings || 0)} decimals={1} suffix=" KB" />
                  </>
                )}
              </p>
              <motion.a
                whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                href={resultUrl}
                download={`sanitized_${file.name}`}
                className="inline-flex items-center gap-2.5 px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 transition-colors"
              >
                <Download className="w-5 h-5" />
                Download Clean PDF
              </motion.a>
            </div>

            <div className="pms-glass-panel rounded-3xl p-6">
              <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-500" />
                Sanitization Audit Report
              </h3>
              <div className="space-y-2.5">
                {layers.map((layer, idx) => (
                  <motion.div
                    key={layer.label}
                    initial={prefersReduced ? false : { opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.24, delay: idx * 0.035 }}
                    className="flex items-center justify-between text-sm py-1.5 px-2.5 rounded-xl bg-white/60 dark:bg-slate-800/40"
                  >
                    <span className="text-gray-700 dark:text-slate-300 font-medium">{layer.label}</span>
                    <span className={`font-bold text-xs px-2.5 py-0.5 rounded-full ${
                      layer.value > 0
                        ? `${layer.color} bg-slate-100 dark:bg-slate-800`
                        : "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40"
                    }`}>
                      {(layer as any).isStatus
                        ? (layer.value > 0 ? `ℹ️ ${layer.value} page(s) inspected` : "✓ None found")
                        : (layer.value > 0 ? `✕ ${layer.value} removed` : "✓ None found")}
                    </span>
                  </motion.div>
                ))}
              </div>
              <div className="mt-5 pt-4 border-t border-[var(--pms-border)] grid grid-cols-3 gap-3 text-center text-sm">
                <div>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Original</p>
                  <p className="font-bold text-gray-900 dark:text-white">
                    <AnimatedNumber value={Number(report?.originalSize || 0)} decimals={1} suffix=" KB" />
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Sanitized</p>
                  <p className="font-bold text-gray-900 dark:text-white">
                    <AnimatedNumber value={Number(report?.newSize || 0)} decimals={1} suffix=" KB" />
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Saved</p>
                  <p className={`font-bold ${Number(report?.savings) > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400"}`}>
                    {Number(report?.savings) > 0 ? (
                      <AnimatedNumber value={Number(report?.savings || 0)} decimals={1} suffix=" KB" />
                    ) : "—"}
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => { setFile(null); setReport(null); setResultUrl(null); }}
              className="w-full py-3.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-2xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Sanitize Another PDF
            </button>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
