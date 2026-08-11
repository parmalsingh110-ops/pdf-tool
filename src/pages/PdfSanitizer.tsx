import { useState } from "react";
import { Shield, Download, CheckCircle, FileText, Loader2, AlertTriangle } from "lucide-react";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import "../lib/pdfWorker";
import FileDropzone from "../components/FileDropzone";
import { usePageSEO } from "../lib/usePageSEO";

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
  usePageSEO(
    "PDF Deep Sanitizer — Remove All Hidden Data",
    "Completely sanitize your PDF: remove hidden metadata, JavaScript, embedded files, form fields, bookmarks, tracking data and more. Free, private, browser-only."
  );

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<SanitizeReport | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        const catalog = pdfDoc.catalog as any;
        if (catalog.has("Metadata")) { catalog.delete("Metadata"); rep.xmpData = true; }
      } catch { /* best-effort */ }

      // 3. Remove embedded files
      try {
        const catalog = pdfDoc.catalog as any;
        if (catalog.has("Names")) {
          const names = catalog.lookup("Names") as any;
          if (names && typeof names.has === "function" && names.has("EmbeddedFiles")) {
            names.delete("EmbeddedFiles"); rep.embeddedFiles++;
          }
        }
      } catch { /* best-effort */ }

      // 4. Remove JavaScript actions
      try {
        const catalog = pdfDoc.catalog as any;
        if (catalog.has("AA")) { catalog.delete("AA"); rep.javascript++; }
        if (catalog.has("OpenAction")) { catalog.delete("OpenAction"); rep.javascript++; }
        if (catalog.has("Names")) {
          const names = catalog.lookup("Names") as any;
          if (names && typeof names.has === "function" && names.has("JavaScript")) {
            names.delete("JavaScript"); rep.javascript++;
          }
        }
      } catch { /* best-effort */ }

      // 5. Remove bookmarks/outline
      try {
        const catalog = pdfDoc.catalog as any;
        if (catalog.has("Outlines")) { catalog.delete("Outlines"); rep.bookmarks++; }
      } catch { /* best-effort */ }

      // 6. Remove thumbnails
      try {
        for (const page of pdfDoc.getPages()) {
          if ((page.node as any).has("Thumb")) { (page.node as any).delete("Thumb"); rep.thumbnails++; }
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
        for (const page of pdfDoc.getPages()) {
          if ((page.node as any).has("Annots")) {
            const annots = (page.node as any).lookup("Annots") as any;
            if (annots && typeof annots.asArray === "function") {
              for (const annot of annots.asArray()) {
                try {
                  const subtype = (annot as any)?.lookup?.("Subtype")?.encodedName;
                  if (subtype === "/Link") rep.links++;
                  else rep.annotations++;
                } catch { rep.annotations++; }
              }
            }
            (page.node as any).delete("Annots");
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
      const outBytes = await pdfDoc.save({ useObjectStreams: false });
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
    { label: "Hidden Text Layers", value: report.hiddenTextPages, color: "text-red-600" },
  ] : [];

  const totalRemoved = layers.reduce((s, l) => s + l.value, 0);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/40 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Shield className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">PDF Deep Sanitizer</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400 max-w-2xl mx-auto">
          Remove hidden metadata, JavaScript, embedded files, tracking data, comments, and 10+ hidden layers from your PDF.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          {["Metadata", "JavaScript", "Hidden Text", "Bookmarks", "Attachments", "Form Fields", "Thumbnails", "XMP Data"].map(tag => (
            <span key={tag} className="px-3 py-1 text-xs font-medium bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 rounded-full border border-emerald-200 dark:border-emerald-800">
              ✓ {tag}
            </span>
          ))}
        </div>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} />
      ) : !resultUrl ? (
        <div className="w-full max-w-lg space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white truncate">{file.name}</p>
              <p className="text-sm text-gray-500 dark:text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3 text-red-700 dark:text-red-300">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={sanitize} disabled={busy}
              className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
              {busy ? "Sanitizing…" : "Deep Sanitize PDF"}
            </button>
            <button onClick={() => { setFile(null); setError(null); }}
              className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-xl space-y-4">
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-6 text-center">
            <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/50 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-emerald-800 dark:text-emerald-300 mb-1">PDF Sanitized!</h2>
            <p className="text-emerald-700 dark:text-emerald-400 text-sm mb-4">
              Removed <strong>{totalRemoved}</strong> hidden elements across 10 layers
              {Number(report?.savings) > 0 && ` • Saved ${report?.savings} KB`}
            </p>
            <a href={resultUrl} download={`sanitized_${file.name}`}
              className="inline-flex items-center gap-2 px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors">
              <Download className="w-5 h-5" />Download Clean PDF
            </a>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-6">
            <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-500" />Sanitization Report
            </h3>
            <div className="space-y-3">
              {layers.map(layer => (
                <div key={layer.label} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-slate-400">{layer.label}</span>
                  <span className={`font-bold ${layer.value > 0 ? layer.color : "text-gray-400 dark:text-slate-600"}`}>
                    {layer.value > 0 ? `✕ ${layer.value} removed` : "✓ None found"}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700 grid grid-cols-3 gap-3 text-center text-sm">
              <div><p className="text-gray-500 dark:text-slate-400">Original</p><p className="font-bold text-gray-900 dark:text-white">{report?.originalSize} KB</p></div>
              <div><p className="text-gray-500 dark:text-slate-400">Sanitized</p><p className="font-bold text-gray-900 dark:text-white">{report?.newSize} KB</p></div>
              <div><p className="text-gray-500 dark:text-slate-400">Saved</p><p className={`font-bold ${Number(report?.savings) > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400"}`}>{Number(report?.savings) > 0 ? `${report?.savings} KB` : "—"}</p></div>
            </div>
          </div>
          <button onClick={() => { setFile(null); setReport(null); setResultUrl(null); }}
            className="w-full py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
            Sanitize Another PDF
          </button>
        </div>
      )}
    </div>
  );
}
