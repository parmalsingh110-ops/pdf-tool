import { useState } from "react";
import { FileText, Download, Copy, Check, Loader2, FileCode } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import "../lib/pdfWorker";
import FileDropzone from "../components/FileDropzone";
import { usePageSEO } from "../lib/usePageSEO";

export default function PdfToMarkdown() {
  usePageSEO("PDF to Markdown Converter", "Convert PDF documents to clean Markdown format. Perfect for developers, bloggers, and content writers. Free browser-based tool.");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [md, setMd] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const convert = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const lines: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        if (i > 1) lines.push("---");
        let prevY = -1;
        for (const item of content.items as any[]) {
          const str = item.str?.trim();
          if (!str) continue;
          const fontSize = item.height || 0;
          const y = Math.round(item.transform?.[5] || 0);
          // New line if y changes significantly
          if (prevY >= 0 && Math.abs(y - prevY) > 2) lines.push("");
          // Heuristic heading detection by font size relative to page
          if (fontSize > vp.height * 0.04) lines.push(`# ${str}`);
          else if (fontSize > vp.height * 0.03) lines.push(`## ${str}`);
          else if (fontSize > vp.height * 0.025) lines.push(`### ${str}`);
          else if (str.startsWith("\u2022") || str.startsWith("-") || str.startsWith("*")) lines.push(`- ${str.replace(/^[\u2022\-\*]\s*/, "")}`);
          else lines.push(str);
          prevY = y;
        }
      }
      setMd(lines.join("\n"));
    } catch (e: any) { alert(e?.message || "Conversion failed."); }
    finally { setBusy(false); }
  };

  const download = () => {
    if (!md) return;
    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (file?.name.replace(/\.pdf$/i, "") || "document") + ".md";
    a.click();
  };

  const copy = async () => {
    if (!md) return;
    await navigator.clipboard.writeText(md);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-950/40 rounded-2xl flex items-center justify-center mx-auto mb-4"><FileCode className="w-8 h-8 text-indigo-600 dark:text-indigo-400" /></div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">PDF to Markdown</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400 max-w-xl mx-auto">Convert PDF content to clean Markdown syntax — headings, lists, and paragraphs auto-detected.</p>
      </div>
      {!file ? (
        <FileDropzone onDrop={f => { if(f[0]){setFile(f[0]);setMd(null);} }} multiple={false} />
      ) : !md ? (
        <div className="w-full max-w-lg space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-indigo-600" /></div>
            <div className="flex-1 min-w-0"><p className="font-semibold text-gray-900 dark:text-white truncate">{file.name}</p><p className="text-sm text-gray-500 dark:text-slate-400">{(file.size/1024/1024).toFixed(2)} MB</p></div>
          </div>
          <div className="flex gap-3">
            <button onClick={convert} disabled={busy} className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileCode className="w-5 h-5" />}{busy ? "Converting…" : "Convert to Markdown"}
            </button>
            <button onClick={() => setFile(null)} className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-3xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-900 dark:text-white">Markdown Output</h2>
            <div className="flex gap-2">
              <button onClick={copy} className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}{copied ? "Copied!" : "Copy"}
              </button>
              <button onClick={download} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors">
                <Download className="w-4 h-4" />Download .md
              </button>
            </div>
          </div>
          <textarea readOnly value={md} className="w-full h-96 p-4 font-mono text-sm bg-gray-900 dark:bg-slate-950 text-green-400 rounded-2xl border border-gray-200 dark:border-slate-700 resize-none" />
          <button onClick={() => { setFile(null); setMd(null); }} className="w-full py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">Convert another PDF</button>
        </div>
      )}
    </div>
  );
}
