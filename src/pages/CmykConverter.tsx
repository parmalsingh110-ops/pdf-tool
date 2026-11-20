import { useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Palette,
  Download,
  AlertTriangle,
  Loader2,
  FileText,
  CheckCircle2,
  Layers,
  ShieldCheck,
  Scissors,
  ChevronLeft,
  ChevronRight,
  Flame,
  RefreshCw,
} from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { apiFetch } from '../lib/api';
import { useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

interface PreflightReport {
  total_pages: number;
  preview_page: number;
  color_spaces: string[];
  is_already_cmyk: boolean;
  average_ink: {
    cyan: number;
    magenta: number;
    yellow: number;
    black: number;
    total_ink_pct: number;
  };
  peak_pixel_tac_pct: number;
  over_ink_area_pct: number;
  pages: Array<{
    page: number;
    cyan: number;
    magenta: number;
    yellow: number;
    black: number;
    total_ink_pct: number;
  }>;
  page_sizes_mm: Array<{ page: number; width_mm: number; height_mm: number }>;
  low_dpi_warnings: Array<{ page: number; effective_dpi: number; pixels: string }>;
  unembedded_fonts: string[];
  plates: {
    soft_proof: string;
    cyan: string;
    magenta: string;
    yellow: string;
    black: string;
    tac_heatmap: string;
  };
}

type PlateView = 'soft_proof' | 'cyan' | 'magenta' | 'yellow' | 'black' | 'tac_heatmap';

export default function CmykConverter() {
  useSEO(
    'Pro RGB to CMYK PDF Converter & 4-Plate Separation Inspector | PDF Media Suite',
    'Convert RGB PDFs and images to press-ready CMYK with Pure K-Only Black text preservation, real Ghostscript C/M/Y/K ink coverage audit, 4-plate separation preview, and 3mm offset crop marks.'
  );

  usePageSEO(
    'RGB to CMYK Converter & Offset Pre-Press Studio',
    'Professional offset printing preparation: convert RGB PDFs & images to DeviceCMYK, preserve 100% K-only black text, inspect Cyan/Magenta/Yellow/Black plates, detect >280% over-ink TAC, and add 3mm bleed crop marks.',
    'rgb to cmyk pdf converter, cmyk separation preview online, pdf ink coverage calculator, pure k black pdf, offset print crop marks bleed pdf, iso coated v2 cmyk converter',
    '/cmyk-converter'
  );

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [preflighting, setPreflighting] = useState(false);
  const [preflight, setPreflight] = useState<PreflightReport | null>(null);
  const [plateView, setPlateView] = useState<PlateView>('soft_proof');
  const [previewPage, setPreviewPage] = useState(1);

  // Real Press Options
  const [profile, setProfile] = useState<'iso_coated' | 'swop' | 'uncoated'>('iso_coated');
  const [preserveBlack, setPreserveBlack] = useState(true);
  const [pdfxCompat, setPdfxCompat] = useState<'pdf14' | 'pdfx1a'>('pdf14');
  const [addCropMarks, setAddCropMarks] = useState(false);
  const [bleedMm, setBleedMm] = useState<number>(3);
  const [dpi, setDpi] = useState<number>(300);

  // Result + Verification
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultName, setResultName] = useState('');
  const [resultMeta, setResultMeta] = useState<{
    profile: string;
    pureK: boolean;
    avgTac: string;
    maxTac: string;
    cropMarks: boolean;
  } | null>(null);
  const [postPreflight, setPostPreflight] = useState<PreflightReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useAutoRevokeUrl(resultUrl);
  const prefersReduced = useReducedMotion();

  const runPreflight = useCallback(async (targetBlob: Blob | File, name: string, pageNum: number, isPost = false) => {
    setPreflighting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', targetBlob, name);
      fd.append('preview_page', String(pageNum));
      const res = await apiFetch('/analyze/cmyk-preflight', { method: 'POST', body: fd, timeoutMs: 45000 });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Preflight inspection unavailable.' }));
        throw new Error(err.detail || 'Preflight failed.');
      }
      const report: PreflightReport = await res.json();
      if (isPost) setPostPreflight(report);
      else setPreflight(report);
    } catch (e: any) {
      if (!isPost) {
        setError(e?.message || 'Could not run live CMYK preflight. You can still convert directly.');
      }
    } finally {
      setPreflighting(false);
    }
  }, []);

  const handleDrop = (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setResultUrl(null);
    setResultBlob(null);
    setResultMeta(null);
    setPreflight(null);
    setPostPreflight(null);
    setError(null);
    setPreviewPage(1);
    setPlateView('soft_proof');
    void runPreflight(f, f.name, 1, false);
  };

  const handleChangePreviewPage = (nextP: number) => {
    if (!file || !preflight) return;
    const clamped = Math.max(1, Math.min(preflight.total_pages, nextP));
    setPreviewPage(clamped);
    void runPreflight(file, file.name, clamped, false);
  };

  const convert = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResultUrl(null);
    setPostPreflight(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('profile', profile);
      fd.append('preserve_black', String(preserveBlack));
      fd.append('pdfx_compat', pdfxCompat);
      fd.append('add_crop_marks', String(addCropMarks));
      fd.append('bleed_mm', String(bleedMm));
      fd.append('dpi', String(dpi));

      const res = await apiFetch('/convert/cmyk', { method: 'POST', body: fd, timeoutMs: 90000 });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'CMYK conversion failed.' }));
        throw new Error(err.detail || 'CMYK conversion failed.');
      }
      const blob = await res.blob();
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const name = `${baseName}_CMYK_${profile.toUpperCase()}.pdf`;
      setResultName(name);
      setResultBlob(blob);
      setResultUrl(URL.createObjectURL(blob));
      setResultMeta({
        profile: res.headers.get('X-CMYK-Profile') || profile,
        pureK: res.headers.get('X-CMYK-Pure-K') === 'true',
        avgTac: res.headers.get('X-CMYK-Avg-TAC') || '0',
        maxTac: res.headers.get('X-CMYK-Max-TAC') || '0',
        cropMarks: res.headers.get('X-CMYK-Crop-Marks') === 'true',
      });
    } catch (e: any) {
      setError(e.message || 'Conversion failed.');
    } finally {
      setBusy(false);
    }
  };

  const activeReport = postPreflight || preflight;
  const stageKey = !file ? 'upload' : !resultUrl ? 'configure' : 'result';

  const resetAll = () => {
    setFile(null);
    setResultUrl(null);
    setResultBlob(null);
    setPreflight(null);
    setPostPreflight(null);
    setResultMeta(null);
    setError(null);
  };

  return (
    <ToolWorkspaceShell
      title="Pro RGB to CMYK Converter & Pre-Press Studio"
      subtitle="Convert RGB PDFs & high-res images into genuine DeviceCMYK offset press files — with 100% Pure K-Only Black text preservation, real C/M/Y/K plate separation preview, over-ink TAC detection, and 3mm crop marks."
      categoryLabel="Pre-Press Color Separation"
      icon={Palette}
      microVariant="convert"
      tone="violet"
      trustNote="Ghostscript Prepress ICC · Real ink_cov Audit · 100% Pure-K Black Text"
    >
      <div className="flex flex-wrap justify-center gap-2 mb-6">
        {[
          'Real 4-Plate C/M/Y/K Inspector',
          '100% Pure K-Only Black Text',
          'Over-Ink TAC (>280%) Alert',
          '3mm Bleed & Offset Crop Marks',
          'PDF + JPG/PNG/TIFF Input',
        ].map((tag, idx) => (
          <motion.span
            key={tag}
            initial={prefersReduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: idx * 0.03 }}
            className="px-3 py-1 bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] text-xs font-semibold rounded-full border border-[var(--pms-border)]"
          >
            ✓ {tag}
          </motion.span>
        ))}
      </div>

      <PearlStageSwitch stageKey={stageKey}>
        {!file ? (
          <div className="max-w-2xl mx-auto">
            <FileDropzone
              onDrop={handleDrop}
              multiple={false}
              accept={{
                'application/pdf': ['.pdf'],
                'image/jpeg': ['.jpg', '.jpeg'],
                'image/png': ['.png'],
                'image/webp': ['.webp'],
                'image/tiff': ['.tif', '.tiff'],
              }}
              title="Drop RGB PDF or Design Image (JPG / PNG / TIFF)"
              subtitle="Instant Ghostscript C/M/Y/K ink preflight & 4-plate separation proof"
            />
          </div>
        ) : !resultUrl ? (
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Press Configuration (5 cols) */}
            <div className="lg:col-span-5 relative pms-glass-panel rounded-3xl p-5 sm:p-6 space-y-5 overflow-hidden">
              <PearlScanOverlay active={busy} label="Separating RGB channels to DeviceCMYK press profile…" />

              <div className="bg-white/80 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] p-4 flex items-center gap-3.5">
                <div className="w-11 h-11 bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] rounded-xl flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{file.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    <AnimatedNumber value={file.size / 1024 / 1024} decimals={2} suffix=" MB" />
                    {preflight?.page_sizes_mm?.[0]
                      ? ` · ${preflight.page_sizes_mm[0].width_mm} × ${preflight.page_sizes_mm[0].height_mm} mm`
                      : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetAll}
                  className="text-xs font-semibold text-slate-500 hover:text-rose-600 px-2.5 py-1 rounded-lg border border-[var(--pms-border)] cursor-pointer"
                >
                  Change
                </button>
              </div>

              <AnimatePresence initial={false}>
                {error && (
                  <motion.div
                    initial={prefersReduced ? false : { opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReduced ? undefined : { opacity: 0, y: -6 }}
                    className="p-3.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-2xl flex items-start gap-2.5 text-rose-700 dark:text-rose-300 text-xs"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Press ICC Profile */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--pms-muted)] block">
                  Offset Press Color Profile
                </label>
                <div className="grid grid-cols-1 gap-2 text-xs">
                  {([
                    {
                      id: 'iso_coated',
                      title: 'ISO Coated v2 (FOGRA39 — India/EU Standard)',
                      desc: 'Best for glossy pamphlets, visiting cards, wedding cards & brochures.',
                    },
                    {
                      id: 'swop',
                      title: 'US Web Coated (SWOP Press)',
                      desc: 'Standard magazine, catalog & web-offset commercial presses.',
                    },
                    {
                      id: 'uncoated',
                      title: 'Uncoated Paper Offset',
                      desc: 'Optimized for matte letterheads, bill books & uncoated stock.',
                    },
                  ] as const).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setProfile(p.id)}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        profile === p.id
                          ? 'border-[var(--pms-violet)] bg-[var(--pms-soft-lavender)] shadow-xs'
                          : 'border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 hover:bg-white dark:hover:bg-slate-900'
                      }`}
                    >
                      <div className="font-bold text-[var(--pms-ink)]">{p.title}</div>
                      <div className="text-[11px] text-[var(--pms-muted)] mt-0.5">{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Pro Pre-Press Switches */}
              <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/75 border border-[var(--pms-border)] space-y-3 text-xs">
                <label className="flex items-start justify-between gap-3 cursor-pointer">
                  <div>
                    <div className="font-bold text-[var(--pms-ink)] flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      100% Pure K-Only Black Text (0,0,0,100)
                    </div>
                    <p className="text-[11px] text-[var(--pms-muted)] mt-0.5">
                      Prevents black text from printing on all 4 plates (eliminates blurry color fringes & cuts ink waste).
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={preserveBlack}
                    onChange={(e) => setPreserveBlack(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-violet-600 shrink-0"
                  />
                </label>

                <div className="pt-2.5 border-t border-[var(--pms-border)] space-y-2.5">
                  <label className="flex items-start justify-between gap-3 cursor-pointer">
                    <div>
                      <div className="font-bold text-[var(--pms-ink)] flex items-center gap-1.5">
                        <Scissors className="w-3.5 h-3.5 text-violet-600" />
                        Add Offset Crop Marks, Bleed &amp; Color Bar
                      </div>
                      <p className="text-[11px] text-[var(--pms-muted)] mt-0.5">
                        Sets PDF TrimBox/BleedBox + hairline corner trim marks &amp; registration bullseyes.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={addCropMarks}
                      onChange={(e) => setAddCropMarks(e.target.checked)}
                      className="w-4 h-4 mt-0.5 accent-violet-600 shrink-0"
                    />
                  </label>

                  {addCropMarks && (
                    <div className="flex items-center justify-between gap-2 pl-5">
                      <span className="text-[11px] font-semibold text-[var(--pms-muted)]">Bleed Margin</span>
                      <div className="flex gap-1.5">
                        {[0, 3, 5].map((mm) => (
                          <button
                            key={mm}
                            type="button"
                            onClick={() => setBleedMm(mm)}
                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${
                              bleedMm === mm
                                ? 'border-violet-600 bg-violet-600 text-white'
                                : 'border-[var(--pms-border)] bg-white dark:bg-slate-800'
                            }`}
                          >
                            {mm} mm
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-2.5 border-t border-[var(--pms-border)]">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-[var(--pms-muted)] mb-1">
                      PDF Compatibility
                    </label>
                    <select
                      value={pdfxCompat}
                      onChange={(e) => setPdfxCompat(e.target.value as 'pdf14' | 'pdfx1a')}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--pms-border)] bg-white dark:bg-slate-900 font-semibold text-xs"
                    >
                      <option value="pdf14">Press PDF 1.4 (Recommended)</option>
                      <option value="pdfx1a">PDF/X-1a Flattened (1.3)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-[var(--pms-muted)] mb-1">
                      Press Resolution
                    </label>
                    <select
                      value={dpi}
                      onChange={(e) => setDpi(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--pms-border)] bg-white dark:bg-slate-900 font-semibold text-xs"
                    >
                      <option value={300}>300 DPI (Offset Press)</option>
                      <option value={600}>600 DPI (Fine Print)</option>
                      <option value={150}>150 DPI (Large Banner)</option>
                    </select>
                  </div>
                </div>
              </div>

              <motion.button
                whileHover={prefersReduced || busy ? undefined : { scale: 1.01 }}
                whileTap={prefersReduced || busy ? undefined : { scale: 0.985 }}
                onClick={convert}
                disabled={busy}
                className="w-full pms-btn-primary py-4 font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Palette className="w-5 h-5" />}
                <span>{busy ? 'Separating to CMYK Press PDF…' : 'Convert to Press-Ready CMYK PDF'}</span>
              </motion.button>
            </div>

            {/* Right Real Preflight Audit & 4-Plate Separation Inspector (7 cols) */}
            <div className="lg:col-span-7 space-y-5">
              {/* Preflight Ink & Color Space Card */}
              <div className="pms-glass-panel rounded-3xl p-5 space-y-4 relative overflow-hidden">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-[var(--pms-violet)]" /> Real Ghostscript Pre-Press Audit
                  </span>
                  {preflighting ? (
                    <span className="text-xs font-semibold text-violet-600 flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Running ink_cov analysis…
                    </span>
                  ) : preflight ? (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {preflight.color_spaces.map((cs) => (
                        <span
                          key={cs}
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                            cs === 'DeviceRGB'
                              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300'
                              : cs === 'DeviceCMYK'
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-[var(--pms-border)]'
                          }`}
                        >
                          {cs}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                {preflight ? (
                  <>
                    {/* C/M/Y/K Plate Coverage Bars */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                      {[
                        { name: 'Cyan (C)', val: preflight.average_ink.cyan, color: 'bg-cyan-500' },
                        { name: 'Magenta (M)', val: preflight.average_ink.magenta, color: 'bg-fuchsia-500' },
                        { name: 'Yellow (Y)', val: preflight.average_ink.yellow, color: 'bg-amber-400' },
                        { name: 'Black (K)', val: preflight.average_ink.black, color: 'bg-slate-800 dark:bg-slate-200' },
                      ].map((ch) => (
                        <div
                          key={ch.name}
                          className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/75 border border-[var(--pms-border)] space-y-1.5"
                        >
                          <div className="flex justify-between font-bold text-[11px]">
                            <span>{ch.name}</span>
                            <span className="font-mono">{ch.val}%</span>
                          </div>
                          <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${ch.color}`}
                              style={{ width: `${Math.min(100, ch.val)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* TAC & Preflight Warnings */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                      <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/75 border border-[var(--pms-border)]">
                        <div className="text-[10px] uppercase font-bold text-[var(--pms-muted)]">Avg Page Ink</div>
                        <div className="text-base font-black font-mono mt-0.5">
                          {preflight.average_ink.total_ink_pct}%
                        </div>
                      </div>
                      <div
                        className={`p-3 rounded-xl border ${
                          preflight.peak_pixel_tac_pct > 290
                            ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                            : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                        }`}
                      >
                        <div className="text-[10px] uppercase font-bold flex items-center gap-1">
                          <Flame className="w-3 h-3" /> Peak Pixel TAC
                        </div>
                        <div className="text-base font-black font-mono mt-0.5">
                          {preflight.peak_pixel_tac_pct}%
                          <span className="text-[10px] font-semibold ml-1">
                            {preflight.peak_pixel_tac_pct > 290 ? '(Over-Ink!)' : '(Press Safe)'}
                          </span>
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/75 border border-[var(--pms-border)]">
                        <div className="text-[10px] uppercase font-bold text-[var(--pms-muted)]">Low-DPI Check</div>
                        <div className="text-base font-black mt-0.5">
                          {preflight.low_dpi_warnings.length === 0 ? (
                            <span className="text-emerald-600 dark:text-emerald-400 text-xs">All Images Sharp ✓</span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400 text-xs">
                              {preflight.low_dpi_warnings.length} image(s) &lt;200 DPI
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 4-Plate Separation Viewer */}
                    <div className="space-y-3 pt-2 border-t border-[var(--pms-border)]">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                          {([
                            { id: 'soft_proof', label: 'CMYK Soft-Proof' },
                            { id: 'cyan', label: 'Cyan Plate' },
                            { id: 'magenta', label: 'Magenta Plate' },
                            { id: 'yellow', label: 'Yellow Plate' },
                            { id: 'black', label: 'Black (K) Plate' },
                            { id: 'tac_heatmap', label: 'Over-Ink (>280%)' },
                          ] as const).map((tab) => (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => setPlateView(tab.id)}
                              className={`px-2.5 py-1.5 rounded-lg border transition cursor-pointer ${
                                plateView === tab.id
                                  ? 'bg-violet-600 text-white border-violet-600 shadow-xs'
                                  : 'bg-white/80 dark:bg-slate-900 border-[var(--pms-border)] text-[var(--pms-ink)] hover:border-violet-400'
                              }`}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>

                        {preflight.total_pages > 1 && (
                          <div className="flex items-center gap-1 text-xs font-mono">
                            <button
                              type="button"
                              onClick={() => handleChangePreviewPage(previewPage - 1)}
                              disabled={previewPage <= 1 || preflighting}
                              className="p-1 rounded-lg border border-[var(--pms-border)] bg-white dark:bg-slate-900 disabled:opacity-35 cursor-pointer"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <span className="px-1.5">
                              P{previewPage}/{preflight.total_pages}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleChangePreviewPage(previewPage + 1)}
                              disabled={previewPage >= preflight.total_pages || preflighting}
                              className="p-1 rounded-lg border border-[var(--pms-border)] bg-white dark:bg-slate-900 disabled:opacity-35 cursor-pointer"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="w-full pms-paper-grid rounded-2xl border border-[var(--pms-border)] p-4 flex items-center justify-center min-h-[340px]">
                        <img
                          src={preflight.plates[plateView]}
                          alt={`${plateView} separation preview`}
                          className="max-h-[480px] w-auto object-contain rounded-lg shadow-lg bg-white border border-[var(--pms-border-strong)]"
                        />
                      </div>
                      {plateView === 'tac_heatmap' && (
                        <p className="text-[11px] text-center text-[var(--pms-muted)]">
                          Red areas exceed 280% total ink (wet-smudge risk on offset presses); Amber is 240–280%. Enabling Pure K-Only Black removes 4-plate ink buildup from black text.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="h-72 flex flex-col items-center justify-center text-xs text-[var(--pms-muted)] gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
                    <span>Inspecting color spaces &amp; rendering 4-plate CMYK separations…</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Result + Verified CMYK Inspector */
          <div className="max-w-3xl mx-auto pms-glass-panel rounded-3xl p-6 sm:p-8 space-y-6 border border-[var(--pms-border)]">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
                Press-Ready CMYK PDF Verified!
              </h2>
              <p className="text-slate-600 dark:text-slate-400 text-sm max-w-lg mx-auto">
                Converted cleanly to <strong>DeviceCMYK</strong> ({resultMeta?.profile.toUpperCase()})
                {resultMeta?.pureK ? ' with 100% Pure K-Only Black text' : ''}
                {resultMeta?.cropMarks ? ' + offset crop marks & TrimBox' : ''}.
              </p>

              {resultMeta && (
                <div className="flex flex-wrap justify-center gap-2 pt-1 text-xs">
                  <span className="px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800">
                    ✓ DeviceCMYK Confirmed
                  </span>
                  <span className="px-3 py-1 rounded-full bg-white/85 dark:bg-slate-900 font-mono font-bold border border-[var(--pms-border)]">
                    Avg Ink: {resultMeta.avgTac}%
                  </span>
                  {resultMeta.pureK && (
                    <span className="px-3 py-1 rounded-full bg-slate-900 text-white font-bold">
                      Pure-K Black (0,0,0,100)
                    </span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
                <a
                  href={resultUrl}
                  download={resultName}
                  className="pms-btn-primary inline-flex items-center gap-2 px-8 py-3.5 font-bold rounded-2xl"
                >
                  <Download className="w-5 h-5" /> Download CMYK PDF
                </a>
                {resultBlob && !postPreflight && (
                  <button
                    type="button"
                    disabled={preflighting}
                    onClick={() => void runPreflight(resultBlob, resultName, 1, true)}
                    className="inline-flex items-center gap-2 px-5 py-3.5 rounded-2xl border border-[var(--pms-border)] bg-white/85 dark:bg-slate-900 font-bold text-sm hover:border-violet-500 cursor-pointer"
                  >
                    {preflighting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-violet-600" />}
                    Verify Converted Plates
                  </button>
                )}
              </div>
            </div>

            {/* Optional Post-Conversion Verified Separation Proof */}
            {postPreflight && activeReport && (
              <div className="pt-5 border-t border-[var(--pms-border)] space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    Post-Conversion Verified CMYK Plates ({postPreflight.color_spaces.join(', ')})
                  </span>
                  <span className="text-xs font-mono font-bold">
                    C:{postPreflight.average_ink.cyan}% · M:{postPreflight.average_ink.magenta}% · Y:{postPreflight.average_ink.yellow}% · K:{postPreflight.average_ink.black}%
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                  {(['soft_proof', 'cyan', 'magenta', 'yellow', 'black', 'tac_heatmap'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setPlateView(k)}
                      className={`px-2.5 py-1 rounded-lg border cursor-pointer ${
                        plateView === k ? 'bg-violet-600 text-white border-violet-600' : 'bg-white dark:bg-slate-900 border-[var(--pms-border)]'
                      }`}
                    >
                      {k.replace('_', ' ').toUpperCase()}
                    </button>
                  ))}
                </div>
                <div className="pms-paper-grid rounded-2xl border border-[var(--pms-border)] p-4 flex justify-center">
                  <img
                    src={postPreflight.plates[plateView]}
                    alt="Verified CMYK separation"
                    className="max-h-[420px] w-auto object-contain rounded-lg shadow bg-white"
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={resetAll}
              className="block w-full text-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm font-semibold pt-1 cursor-pointer"
            >
              Convert another PDF or Image
            </button>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
