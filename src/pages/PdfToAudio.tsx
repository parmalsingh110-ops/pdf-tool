import { useState, useRef, useEffect } from 'react';
import { Volume2, Play, Pause, Square, SkipBack, SkipForward, Loader2, FileText, RotateCcw } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { PearlStageSwitch, PearlScanOverlay, AnimatedNumber } from '../components/pearl/PearlMotion';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

export default function PdfToAudio() {
  useSEO('Pdf To Audio Online Free | PDF Media Suite', 'Free online Pdf To Audio tool. No signup or installation required.');

  usePageSEO(
    'PDF to Audio — Read Aloud',
    'Listen to your PDF — converts PDF text to speech right in your browser. Adjustable speed and voice. Free, no upload needed.',
  );

  const prefersReduced = useReducedMotion();

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voice, setVoice] = useState<string>('');
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const load = () => {
      const v = window.speechSynthesis.getVoices();
      setVoices(v);
      if (v.length && !voice) setVoice(v[0].name);
    };
    window.speechSynthesis.onvoiceschanged = load;
    load();
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
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
        texts.push(c.items.map((x: any) => x.str).join(' ').trim());
      }
      setPages(texts);
      setCurrentPage(0);
    } catch (e: any) {
      alert(e?.message || 'Extraction failed.');
    } finally {
      setBusy(false);
    }
  };

  const speak = (pageIdx: number) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      alert('Text-to-speech is not supported on this device/browser.');
      return;
    }
    window.speechSynthesis.cancel();
    const text = pages[pageIdx];
    if (!text || !text.trim()) {
      if (pageIdx < pages.length - 1) {
        setCurrentPage(pageIdx + 1);
        speak(pageIdx + 1);
      } else {
        setPlaying(false);
      }
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    const v = voices.find((item) => item.name === voice);
    if (v) u.voice = v;
    u.onend = () => {
      if (pageIdx < pages.length - 1) {
        setCurrentPage(pageIdx + 1);
        speak(pageIdx + 1);
      } else {
        setPlaying(false);
      }
    };
    u.onerror = () => setPlaying(false);
    utterRef.current = u;
    window.speechSynthesis.speak(u);
    setPlaying(true);
    setCurrentPage(pageIdx);
  };

  const pause = () => {
    if (speechSynthesis.speaking) {
      speechSynthesis.pause();
      setPlaying(false);
    }
  };
  const resume = () => {
    speechSynthesis.resume();
    setPlaying(true);
  };
  const stop = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
    setPlaying(false);
  };

  const stageKey = !file ? 'upload' : pages.length === 0 ? 'prepare' : 'player';

  return (
    <ToolWorkspaceShell
      title="PDF Read Aloud"
      subtitle="Listen to your PDF with browser-native text-to-speech, adjustable reading speed, and system voice selection."
      categoryLabel="Audio & Accessibility"
      icon={Volume2}
      microVariant="generic"
      tone="violet"
      trustNote="100% browser-based speech synthesis • Zero server upload"
    >
      <div className="max-w-2xl mx-auto">
        <PearlStageSwitch stageKey={stageKey}>
          {!file ? (
            <div className="pms-glass-panel rounded-3xl p-4 sm:p-6">
              <FileDropzone
                onDrop={(f) => {
                  if (f[0]) {
                    setFile(f[0]);
                    setPages([]);
                    stop();
                  }
                }}
                multiple={false}
              />
            </div>
          ) : pages.length === 0 ? (
            <div className="pms-glass-panel rounded-3xl p-6 sm:p-8 space-y-5 relative overflow-hidden">
              <PearlScanOverlay active={busy} label="Extracting text layers from PDF..." />
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/75 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-700/70">
                <div className="w-11 h-11 rounded-xl bg-violet-500/10 dark:bg-violet-500/20 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">{file.name}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={extract}
                  disabled={busy}
                  className="pms-btn-primary flex-1 py-4 px-6 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 notranslate"
                  translate="no"
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Volume2 className="w-5 h-5" />}
                  <span>{busy ? 'Extracting text…' : 'Load & Prepare'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    stop();
                  }}
                  className="px-6 py-4 bg-white/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 rounded-xl font-semibold border border-slate-200/80 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="pms-glass-panel rounded-3xl p-6 sm:p-7 space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Page <AnimatedNumber value={currentPage + 1} /> of <AnimatedNumber value={pages.length} />
                  </span>
                  <div className="flex flex-wrap justify-end gap-1 max-w-[260px]">
                    {pages.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => speak(i)}
                        aria-label={`Jump to page ${i + 1}`}
                        className={`w-2.5 h-2.5 rounded-full transition-colors ${
                          i === currentPage
                            ? 'bg-violet-600 dark:bg-violet-400 scale-110'
                            : i < currentPage
                              ? 'bg-violet-300 dark:bg-violet-700'
                              : 'bg-slate-200 dark:bg-slate-700'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Readable Document Snippet */}
                <div className="h-36 overflow-y-auto text-sm text-slate-700 dark:text-slate-200 leading-relaxed bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-4 shadow-inner">
                  {pages[currentPage] || 'No text on this page'}
                </div>

                {/* Transport Controls */}
                <div className="flex items-center justify-center gap-4 py-1">
                  <motion.button
                    type="button"
                    whileTap={prefersReduced ? undefined : { scale: 0.94 }}
                    onClick={() => {
                      const p = Math.max(0, currentPage - 1);
                      speak(p);
                    }}
                    disabled={currentPage === 0}
                    aria-label="Previous page"
                    className="p-3 rounded-full bg-white/85 dark:bg-slate-800/85 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
                  >
                    <SkipBack className="w-5 h-5" />
                  </motion.button>

                  {!playing ? (
                    <motion.button
                      type="button"
                      whileTap={prefersReduced ? undefined : { scale: 0.95 }}
                      onClick={() => (speechSynthesis.paused ? resume() : speak(currentPage))}
                      aria-label="Play audio"
                      className="pms-btn-primary w-16 h-16 rounded-full flex items-center justify-center shadow-lg"
                    >
                      <Play className="w-7 h-7 ml-0.5" />
                    </motion.button>
                  ) : (
                    <motion.button
                      type="button"
                      whileTap={prefersReduced ? undefined : { scale: 0.95 }}
                      onClick={pause}
                      aria-label="Pause audio"
                      className="pms-btn-primary w-16 h-16 rounded-full flex items-center justify-center shadow-lg"
                    >
                      <Pause className="w-7 h-7" />
                    </motion.button>
                  )}

                  <motion.button
                    type="button"
                    whileTap={prefersReduced ? undefined : { scale: 0.94 }}
                    onClick={() => {
                      const p = Math.min(pages.length - 1, currentPage + 1);
                      speak(p);
                    }}
                    disabled={currentPage === pages.length - 1}
                    aria-label="Next page"
                    className="p-3 rounded-full bg-white/85 dark:bg-slate-800/85 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
                  >
                    <SkipForward className="w-5 h-5" />
                  </motion.button>

                  <motion.button
                    type="button"
                    whileTap={prefersReduced ? undefined : { scale: 0.94 }}
                    onClick={stop}
                    aria-label="Stop audio"
                    className="p-3 rounded-full bg-rose-50 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors"
                  >
                    <Square className="w-5 h-5" />
                  </motion.button>
                </div>

                {/* Speed & Voice */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-200/70 dark:border-slate-700/70 pt-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5 block">
                      Speed: {rate}x
                    </label>
                    <input
                      type="range"
                      min={0.5}
                      max={2}
                      step={0.1}
                      value={rate}
                      onChange={(e) => {
                        setRate(Number(e.target.value));
                        if (playing) {
                          stop();
                          setTimeout(() => speak(currentPage), 100);
                        }
                      }}
                      className="w-full accent-violet-600"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5 block">
                      Voice
                    </label>
                    <select
                      value={voice}
                      onChange={(e) => setVoice(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-500/40"
                    >
                      {voices.map((v) => (
                        <option key={v.name} value={v.name}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setPages([]);
                  stop();
                }}
                className="w-full py-3.5 bg-white/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 rounded-xl font-semibold border border-slate-200/80 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors inline-flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" /> Load another PDF
              </button>
            </div>
          )}
        </PearlStageSwitch>
      </div>
    </ToolWorkspaceShell>
  );
}
