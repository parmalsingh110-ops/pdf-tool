import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { LayoutGrid, Download, Loader2, FileText, Hash, CheckCircle2 } from "lucide-react";
import { PDFDocument, rgb } from "pdf-lib";
import FileDropzone from "../components/FileDropzone";
import { usePageSEO } from "../lib/usePageSEO";
import { useSEO } from '../hooks/useSEO';
import ToolSEOSection from "../components/ToolSEOSection";
import { toArrayBufferBytes, useAutoRevokeUrl } from "../lib/blobUrl";
import ToolWorkspaceShell from "../components/pearl/ToolWorkspaceShell";
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from "../components/pearl/PearlMotion";

const PRESETS = [
  { n: 2, cols: 1, rows: 2, label: '2-Up' },
  { n: 4, cols: 2, rows: 2, label: '4-Up' },
  { n: 6, cols: 2, rows: 3, label: '6-Up' },
  { n: 9, cols: 3, rows: 3, label: '9-Up' },
];

function getBestGrid(n: number): { cols: number; rows: number } {
  const preset = PRESETS.find(p => p.n === n);
  if (preset) return { cols: preset.cols, rows: preset.rows };
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return { cols, rows };
}

export default function NUpLayout() {
  useSEO(
    'N-Up PDF Layout Online Free — Print Multiple Pages Per Sheet | PDF Media Suite',
    'Print 2, 4, 6, 9 or more PDF pages per sheet online free. Native vector PDF layout with razor-sharp text, custom margins, and paper size controls.'
  );

  usePageSEO(
    "N-Up PDF — Print Multiple Pages Per Sheet (Vector Crisp)",
    "Print 2, 4, 6, 9, or custom PDF pages per sheet. Save paper with native vector N-Up page layout — 100% crisp text, no blur, free browser tool."
  );

  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<number>(4);
  const [customN, setCustomN] = useState<string>("");
  const [useCustom, setUseCustom] = useState(false);
  const [drawBorders, setDrawBorders] = useState(true);
  const [paperOrientation, setPaperOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useAutoRevokeUrl(resultUrl);
  const prefersReduced = useReducedMotion();

  const activeN = useCustom ? (parseInt(customN) || 4) : mode;

  const process = async () => {
    if (!file) return;
    const n = activeN;
    if (n < 2 || n > 36) { setError("Pages per sheet must be between 2 and 36."); return; }
    setError(null);
    setBusy(true);

    try {
      const { cols, rows } = getBestGrid(n);
      const buf = await file.arrayBuffer();

      // Native PDF-Lib vector embedding: 100% sharp text, tiny file size, no rasterization!
      const srcDoc = await PDFDocument.load(buf);
      const outDoc = await PDFDocument.create();
      const totalPages = srcDoc.getPageCount();

      // Embed all source pages as vector XObjects
      const embeddedPages = await outDoc.embedPages(srcDoc.getPages());

      // Sheet Dimensions (A4 in points: 595 x 842)
      const pageW = paperOrientation === 'landscape' ? 842 : 595;
      const pageH = paperOrientation === 'landscape' ? 595 : 842;

      const cellW = pageW / cols;
      const cellH = pageH / rows;

      const groups: number[][] = [];
      for (let i = 0; i < totalPages; i += n) {
        groups.push(
          Array.from({ length: n }, (_, j) => i + j + 1).filter(p => p <= totalPages)
        );
      }

      for (const group of groups) {
        const outPage = outDoc.addPage([pageW, pageH]);

        for (let gi = 0; gi < group.length; gi++) {
          const pgNum = group[gi];
          const emb = embeddedPages[pgNum - 1];
          if (!emb) continue;

          const col = gi % cols;
          const row = Math.floor(gi / cols);

          const srcW = emb.width;
          const srcH = emb.height;

          // Padding inside cell (8% margin)
          const padW = cellW * 0.08;
          const padH = cellH * 0.08;
          const targetW = cellW - padW;
          const targetH = cellH - padH;

          const scale = Math.min(targetW / srcW, targetH / srcH);
          const renderW = srcW * scale;
          const renderH = srcH * scale;

          // Position inside sheet coordinates (PDF coordinate system: (0,0) is bottom-left)
          const cellLeft = col * cellW;
          const cellBottom = pageH - (row + 1) * cellH;

          const posX = cellLeft + (cellW - renderW) / 2;
          const posY = cellBottom + (cellH - renderH) / 2;

          // Optional cell cut border
          if (drawBorders) {
            outPage.drawRectangle({
              x: cellLeft + 2,
              y: cellBottom + 2,
              width: cellW - 4,
              height: cellH - 4,
              borderColor: rgb(0.82, 0.86, 0.90),
              borderWidth: 0.5,
            });
          }

          // Draw pure vector page
          outPage.drawPage(emb, {
            x: posX,
            y: posY,
            width: renderW,
            height: renderH,
          });
        }
      }

      const bytes = toArrayBufferBytes(await outDoc.save());
      setResultUrl(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })));
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Processing failed. Please try a different PDF.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setFile(null); setResultUrl(null); setError(null); };

  const stageKey = !file ? "upload" : !resultUrl ? "configure" : "result";

  return (
    <ToolWorkspaceShell
      title="N-Up Page Layout"
      subtitle="Print 2, 4, 6, 9 or custom PDF pages per sheet. Save paper with native vector imposition — 100% crisp text, no blur."
      categoryLabel="Vector-Crisp Multi-Page Imposition"
      icon={LayoutGrid}
      microVariant="split"
      tone="emerald"
      trustNote="100% vector PDF XObject imposition · Razor-sharp text · Browser-only"
    >
      <PearlStageSwitch stageKey={stageKey}>
        {!file ? (
          <div className="w-full max-w-lg mx-auto">
            <FileDropzone
              onDrop={f => { if (f[0]) { setFile(f[0]); setResultUrl(null); setError(null); } }}
              accept={{ 'application/pdf': ['.pdf'] }}
              multiple={false}
              title="Upload PDF for N-Up Layout"
              subtitle="Drop PDF to print multiple pages per sheet"
            />
          </div>
        ) : !resultUrl ? (
          <div className="w-full max-w-lg mx-auto space-y-4">
            {/* File info */}
            <div className="pms-glass-panel rounded-2xl p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 bg-[var(--pms-soft-mint)] rounded-xl flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 dark:text-white truncate">{file.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              <button
                onClick={reset}
                className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-rose-600 cursor-pointer transition-colors"
              >
                Change
              </button>
            </div>

            {/* Pages per sheet */}
            <div className="relative pms-glass-panel rounded-3xl p-6 space-y-5 overflow-hidden">
              <PearlScanOverlay active={busy} label={`Composing ${activeN}-Up vector sheets…`} />

              <div>
                <p className="font-bold text-slate-900 dark:text-white mb-3 text-sm">Pages per Sheet Preset</p>

                {/* Preset buttons */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {PRESETS.map(m => {
                    const active = !useCustom && mode === m.n;
                    return (
                      <button
                        key={m.n}
                        type="button"
                        onClick={() => { setMode(m.n); setUseCustom(false); setError(null); }}
                        className="relative p-3 rounded-2xl border text-center transition-colors cursor-pointer overflow-hidden"
                        style={{
                          borderColor: active ? '#10b981' : 'var(--pms-border)',
                          backgroundColor: active ? 'var(--pms-soft-mint)' : 'var(--pms-white)',
                          color: active ? '#047857' : 'var(--pms-ink)',
                        }}
                      >
                        {active && (
                          <motion.span
                            layoutId="nup-preset-pill"
                            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                            className="absolute inset-0 rounded-2xl ring-2 ring-emerald-500/35 pointer-events-none"
                          />
                        )}
                        <div className="relative z-10">
                          <div className={`grid gap-0.5 mx-auto mb-1.5 w-10 h-10 p-1 bg-slate-100 dark:bg-slate-800 rounded ${
                            m.cols === 3 ? "grid-cols-3" : m.cols === 2 ? "grid-cols-2" : "grid-cols-1"
                          }`}>
                            {Array.from({ length: m.n }).map((_, i) => (
                              <div key={i} className="bg-emerald-500/80 dark:bg-emerald-400/80 rounded-sm" />
                            ))}
                          </div>
                          <span className="text-xs font-bold">{m.n}-Up</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Custom number input */}
                <div
                  className="flex items-center gap-3 p-3 rounded-2xl border transition-colors cursor-pointer mb-4"
                  style={{
                    borderColor: useCustom ? '#10b981' : 'var(--pms-border)',
                    backgroundColor: useCustom ? 'var(--pms-soft-mint)' : 'var(--pms-white)',
                  }}
                  onClick={() => setUseCustom(true)}
                >
                  <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center shrink-0">
                    <Hash className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Custom Number</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Enter any value from 2 to 36 pages</p>
                  </div>
                  <input
                    type="number"
                    min={2}
                    max={36}
                    value={customN}
                    onClick={e => e.stopPropagation()}
                    onChange={e => { setCustomN(e.target.value); setUseCustom(true); setError(null); }}
                    placeholder="e.g. 12"
                    className={`w-20 text-center py-2 px-2 rounded-xl border text-sm font-bold bg-white dark:bg-slate-800 text-slate-900 dark:text-white transition-colors outline-none ${
                      useCustom ? "border-emerald-400 ring-2 ring-emerald-200 dark:ring-emerald-900" : "border-[var(--pms-border)]"
                    }`}
                  />
                </div>
              </div>

              {/* Extra Layout Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[var(--pms-border)]">
                <div>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    Sheet Orientation
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['landscape', 'portrait'] as const).map(orient => {
                      const active = paperOrientation === orient;
                      return (
                        <button
                          key={orient}
                          type="button"
                          onClick={() => setPaperOrientation(orient)}
                          className="relative py-2 px-2 rounded-xl text-xs font-bold border capitalize cursor-pointer overflow-hidden"
                          style={{
                            borderColor: active ? '#10b981' : 'var(--pms-border)',
                            backgroundColor: active ? 'var(--pms-soft-mint)' : 'var(--pms-white)',
                            color: active ? '#047857' : 'var(--pms-ink)',
                          }}
                        >
                          {active && (
                            <motion.span
                              layoutId="nup-orient-pill"
                              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                              className="absolute inset-0 rounded-xl ring-2 ring-emerald-500/30 pointer-events-none"
                            />
                          )}
                          <span className="relative z-10">{orient}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      checked={drawBorders}
                      onChange={(e) => setDrawBorders(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
                    />
                    Draw Cutting Border Lines
                  </label>
                </div>
              </div>

              {/* Active summary */}
              <div className="text-center text-xs text-slate-600 dark:text-slate-400 pt-1">
                Vector N-Up Layout:{' '}
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{activeN} pages</span>{' '}
                per {paperOrientation} sheet
                {(() => { const g = getBestGrid(activeN); return ` (${g.cols}×${g.rows} grid)`; })()}
              </div>

              {error && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 text-sm">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <motion.button
                  whileHover={prefersReduced || busy ? undefined : { scale: 1.01 }}
                  whileTap={prefersReduced || busy ? undefined : { scale: 0.985 }}
                  onClick={process}
                  disabled={busy || (useCustom && (!customN || parseInt(customN) < 2))}
                  className="flex-1 pms-btn-primary py-3.5 font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <LayoutGrid className="w-5 h-5" />}
                  {busy ? "Rendering Vector N-Up…" : `Create ${activeN}-Up PDF`}
                </motion.button>
                <button
                  onClick={reset}
                  className="px-6 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="pms-glass-panel border border-emerald-200/80 dark:border-emerald-800/70 rounded-3xl p-8 text-center space-y-5 max-w-lg mx-auto">
            <motion.div
              initial={prefersReduced ? false : { scale: 0.45, rotate: -10, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 360, damping: 18 }}
              className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 rounded-full flex items-center justify-center mx-auto shadow-inner"
            >
              <CheckCircle2 className="w-9 h-9 text-emerald-600 dark:text-emerald-400" />
            </motion.div>
            <div>
              <h2 className="text-2xl font-extrabold text-emerald-900 dark:text-emerald-200">
                <AnimatedNumber value={activeN} />-Up PDF Ready!
              </h2>
              <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-1">
                Pure vector PDF created — text remains completely selectable and razor sharp.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
              <motion.a
                whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                href={resultUrl}
                download={file!.name.replace(/\.pdf$/i, "") + `_${activeN}up.pdf`}
                className="pms-btn-primary inline-flex items-center justify-center gap-2 px-7 py-3.5 font-bold rounded-2xl"
              >
                <Download className="w-5 h-5" /> Download N-Up PDF
              </motion.a>
              <button
                onClick={reset}
                className="px-5 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Another File
              </button>
            </div>
          </div>
        )}
      </PearlStageSwitch>

      <ToolSEOSection
        toolName="N-Up PDF Layout"
        headline="Print Multiple Pages Per Sheet (Vector Crisp)"
        description="Print 2, 4, 6, 9, or custom PDF pages per sheet. Save paper with native vector N-Up page layout — 100% crisp text, no blur, free browser tool."
        faqs={[
          {
            q: 'Why is vector N-Up better than image-based N-Up?',
            a: 'Image-based tools blur your text and balloon the file size to 30MB+. Our native vector engine embeds the original PDF objects directly, keeping text razor sharp at any zoom level with a tiny file size.',
          },
          {
            q: 'What is 4-Up layout best used for?',
            a: '4-Up (4 pages per sheet) is ideal for reviewing presentation slide decks, printing reading notes, and saving paper on draft documents.',
          },
        ]}
      />
    </ToolWorkspaceShell>
  );
}
