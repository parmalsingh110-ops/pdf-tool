import { useState, useRef, useEffect } from "react";
import { Volume2, Play, Pause, Square, SkipBack, SkipForward, Loader2, FileText } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import "../lib/pdfWorker";
import FileDropzone from "../components/FileDropzone";
import { usePageSEO } from "../lib/usePageSEO";

export default function PdfToAudio() {
  usePageSEO("PDF to Audio — Read Aloud", "Listen to your PDF — converts PDF text to speech right in your browser. Adjustable speed and voice. Free, no upload needed.");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voice, setVoice] = useState<string>("");
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    const load = () => { const v = speechSynthesis.getVoices(); setVoices(v); if (v.length && !voice) setVoice(v[0].name); };
    speechSynthesis.onvoiceschanged = load; load();
    return () => { speechSynthesis.cancel(); };
  }, []);

  const extract = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const texts: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const pg = await pdf.getPage(i);
        const c = await pg.getTextContent();
        texts.push(c.items.map((x: any) => x.str).join(" ").trim());
      }
      setPages(texts); setCurrentPage(0);
    } catch (e: any) { alert(e?.message || "Extraction failed."); }
    finally { setBusy(false); }
  };

  const speak = (pageIdx: number) => {
    speechSynthesis.cancel();
    const text = pages[pageIdx];
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    const v = voices.find(v => v.name === voice);
    if (v) u.voice = v;
    u.onend = () => { if (pageIdx < pages.length - 1) { setCurrentPage(pageIdx + 1); speak(pageIdx + 1); } else { setPlaying(false); } };
    u.onerror = () => setPlaying(false);
    utterRef.current = u;
    speechSynthesis.speak(u);
    setPlaying(true); setCurrentPage(pageIdx);
  };

  const pause = () => { if (speechSynthesis.speaking) { speechSynthesis.pause(); setPlaying(false); } };
  const resume = () => { speechSynthesis.resume(); setPlaying(true); };
  const stop = () => { speechSynthesis.cancel(); setPlaying(false); };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-purple-100 dark:bg-purple-950/40 rounded-2xl flex items-center justify-center mx-auto mb-4"><Volume2 className="w-8 h-8 text-purple-600 dark:text-purple-400" /></div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">PDF Read Aloud</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400 max-w-xl mx-auto">Listen to your PDF — browser-native text-to-speech, no data sent to any server. Fully private.</p>
        <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 rounded-full text-sm border border-green-200 dark:border-green-800">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />100% Browser-Based — No Upload
        </div>
      </div>
      {!file ? (
        <FileDropzone onDrop={f => { if(f[0]){setFile(f[0]);setPages([]);stop();} }} multiple={false} />
      ) : pages.length === 0 ? (
        <div className="w-full max-w-lg space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 flex items-center gap-4">
            <div className="w-10 h-10 bg-purple-50 dark:bg-purple-950/40 rounded-xl flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-purple-600" /></div>
            <div className="flex-1 min-w-0"><p className="font-semibold text-gray-900 dark:text-white truncate">{file.name}</p><p className="text-sm text-gray-500 dark:text-slate-400">{(file.size/1024/1024).toFixed(2)} MB</p></div>
          </div>
          <div className="flex gap-3">
            <button onClick={extract} disabled={busy} className="flex-1 py-4 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Volume2 className="w-5 h-5" />}{busy ? "Extracting text…" : "Load & Prepare"}
            </button>
            <button onClick={() => { setFile(null); stop(); }} className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-xl space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-500 dark:text-slate-400">Page {currentPage + 1} of {pages.length}</span>
              <div className="flex gap-1">
                {pages.map((_, i) => <div key={i} className={`w-2 h-2 rounded-full ${i === currentPage ? "bg-purple-600" : i < currentPage ? "bg-purple-300 dark:bg-purple-700" : "bg-gray-200 dark:bg-slate-700"}`} />)}
              </div>
            </div>
            <div className="h-28 overflow-y-auto text-sm text-gray-600 dark:text-slate-300 leading-relaxed bg-gray-50 dark:bg-slate-800 rounded-xl p-3 mb-4">
              {pages[currentPage] || "No text on this page"}
            </div>
            {/* Controls */}
            <div className="flex items-center justify-center gap-4 mb-4">
              <button onClick={() => { const p = Math.max(0, currentPage - 1); speak(p); }} disabled={currentPage === 0} className="p-3 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"><SkipBack className="w-5 h-5" /></button>
              {!playing ? (
                <button onClick={() => speechSynthesis.paused ? resume() : speak(currentPage)} className="w-16 h-16 rounded-full bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center transition-colors shadow-lg"><Play className="w-7 h-7 ml-1" /></button>
              ) : (
                <button onClick={pause} className="w-16 h-16 rounded-full bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center transition-colors shadow-lg"><Pause className="w-7 h-7" /></button>
              )}
              <button onClick={() => { const p = Math.min(pages.length - 1, currentPage + 1); speak(p); }} disabled={currentPage === pages.length - 1} className="p-3 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"><SkipForward className="w-5 h-5" /></button>
              <button onClick={stop} className="p-3 rounded-full bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"><Square className="w-5 h-5" /></button>
            </div>
            {/* Speed & Voice */}
            <div className="grid grid-cols-2 gap-3 border-t border-gray-200 dark:border-slate-700 pt-4">
              <div>
                <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block">Speed: {rate}x</label>
                <input type="range" min={0.5} max={2} step={0.1} value={rate} onChange={e => { setRate(Number(e.target.value)); if (playing) { stop(); setTimeout(() => speak(currentPage), 100); } }} className="w-full accent-purple-600" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block">Voice</label>
                <select value={voice} onChange={e => setVoice(e.target.value)} className="w-full px-2 py-1 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs text-gray-900 dark:text-white">
                  {voices.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>
            </div>
          </div>
          <button onClick={() => { setFile(null); setPages([]); stop(); }} className="w-full py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">Load another PDF</button>
        </div>
      )}
    </div>
  );
}
