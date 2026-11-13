import { useState, useRef, useEffect } from 'react';
import { Hash, Download, Loader2, CheckCircle2, Eye } from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { motion, useReducedMotion } from 'motion/react';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { embedSmartFont } from '../lib/pdfFontHelper';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { PearlScanOverlay } from '../components/pearl/PearlMotion';
import { toArrayBufferBytes, useAutoRevokeUrl } from '../lib/blobUrl';

// Initialize pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Position = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

interface LegalPreset {
  label: string;
  prefix: string;
  padding: number;
  suffix?: string;
}

const LEGAL_PRESETS: LegalPreset[] = [
  { label: 'Litigation (CONF-000001)', prefix: 'CONF-', padding: 6 },
  { label: 'Court Exhibit (EXHIBIT-A-001)', prefix: 'EXHIBIT-A-', padding: 3 },
  { label: 'Plaintiff (PLTF-00001)', prefix: 'PLTF-', padding: 5 },
  { label: 'Defendant (DEFT-00001)', prefix: 'DEFT-', padding: 5 },
  { label: 'Audit Doc (DOC-00001)', prefix: 'DOC-', padding: 5 },
  { label: 'Simple (#0001)', prefix: '#', padding: 4 },
];

export default function BatesNumbering() {
  useSEO(
    'Bates Numbering Online Free — Legal Document Stamp | PDF Media Suite',
    'Apply standard Bates numbering to legal and corporate PDFs online free. Live document preview, customizable prefix/suffix, zero padding, and position controls.'
  );

  usePageSEO(
    'Add Bates Numbering',
    'Apply standard Bates numbering to litigation, legal exhibits, and business audit PDFs with live visual positioning preview and cover page exclusion.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [prefix, setPrefix] = useState('CONF-');
  const [suffix, setSuffix] = useState('');
  const [startNumber, setStartNumber] = useState(1);
  const [padding, setPadding] = useState(6);
  const [fontSize, setFontSize] = useState(10);
  const [fontColor, setFontColor] = useState('#0f172a');
  const [position, setPosition] = useState<Position>('bottom-right');
  const [skipFirstPage, setSkipFirstPage] = useState(false);
  const [marginOffset, setMarginOffset] = useState(25);
  const prefersReduced = useReducedMotion();

  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useAutoRevokeUrl(resultUrl);

  // Live Canvas Preview
  const [pageThumbUrl, setPageThumbUrl] = useState<string | null>(null);
  const [previewW, setPreviewW] = useState(400);
  const [previewH, setPreviewH] = useState(550);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleDrop = async (files: File[]) => {
    if (files[0]) {
      const selected = files[0];
      setFile(selected);
      setResultUrl(null);
      await loadPreviewPage(selected);
    }
  };

  const loadPreviewPage = async (pdfFile: File) => {
    setLoadingPreview(true);
    try {
      const buf = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const page = await pdf.getPage(1);
      const vp = page.getViewport({ scale: 1.0 });

      const maxDim = 500;
      const scale = Math.min(maxDim / vp.width, maxDim / vp.height);
      const scaledVp = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = scaledVp.width;
      canvas.height = scaledVp.height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, scaledVp.width, scaledVp.height);

      await page.render({ canvasContext: ctx, viewport: scaledVp, canvas }).promise;
      setPageThumbUrl(canvas.toDataURL('image/jpeg', 0.85));
      setPreviewW(scaledVp.width);
      setPreviewH(scaledVp.height);
      canvas.width = 0;
      canvas.height = 0;
    } catch (e) {
      console.error('Error rendering preview:', e);
    } finally {
      setLoadingPreview(false);
    }
  };

  const currentSampleText = `${prefix}${String(startNumber).padStart(padding, '0')}${suffix}`;

  // Draw live bates number on preview canvas
  useEffect(() => {
    if (!pageThumbUrl || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bgImg = new Image();
    bgImg.onload = () => {
      canvas.width = previewW;
      canvas.height = previewH;
      ctx.drawImage(bgImg, 0, 0);

      if (skipFirstPage) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('(Cover Page — Bates Number Excluded)', previewW / 2, 40);
        return;
      }

      ctx.fillStyle = fontColor;
      ctx.font = `bold ${fontSize}px Courier, monospace, Arial`;

      const scaleFactor = previewW / 595;
      const padX = marginOffset * scaleFactor;
      const topY = marginOffset * scaleFactor;
      const botY = previewH - marginOffset * scaleFactor;

      let drawX = previewW - padX;
      let drawY = botY;

      if (position === 'top-left') {
        ctx.textAlign = 'left';
        drawX = padX;
        drawY = topY;
      } else if (position === 'top-center') {
        ctx.textAlign = 'center';
        drawX = previewW / 2;
        drawY = topY;
      } else if (position === 'top-right') {
        ctx.textAlign = 'right';
        drawX = previewW - padX;
        drawY = topY;
      } else if (position === 'bottom-left') {
        ctx.textAlign = 'left';
        drawX = padX;
        drawY = botY;
      } else if (position === 'bottom-center') {
        ctx.textAlign = 'center';
        drawX = previewW / 2;
        drawY = botY;
      } else {
        // bottom-right
        ctx.textAlign = 'right';
        drawX = previewW - padX;
        drawY = botY;
      }

      ctx.fillText(currentSampleText, drawX, drawY);
    };
    bgImg.src = pageThumbUrl;
  }, [pageThumbUrl, currentSampleText, fontSize, fontColor, position, marginOffset, skipFirstPage, previewW, previewH]);

  const hexToRgb = (hex: string) => {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r
      ? { r: parseInt(r[1], 16) / 255, g: parseInt(r[2], 16) / 255, b: parseInt(r[3], 16) / 255 }
      : { r: 0.1, g: 0.1, b: 0.1 };
  };

  const handleProcess = async () => {
    if (!file) return;
    setBusy(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const font = await embedSmartFont(pdfDoc, `${prefix}${suffix}`, { bold: true, fallback: StandardFonts.CourierBold });
      const pages = pdfDoc.getPages();
      const { r, g, b } = hexToRgb(fontColor);

      let batesSeq = startNumber;

      pages.forEach((page, idx) => {
        if (skipFirstPage && idx === 0) return;

        const { width, height } = page.getSize();
        const text = `${prefix}${String(batesSeq).padStart(padding, '0')}${suffix}`;
        batesSeq++;

        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const padX = marginOffset;
        const topY = height - marginOffset;
        const botY = marginOffset;

        let x = width - textWidth - padX;
        let y = botY;

        switch (position) {
          case 'bottom-right':
            x = width - textWidth - padX;
            y = botY;
            break;
          case 'bottom-left':
            x = padX;
            y = botY;
            break;
          case 'bottom-center':
            x = (width - textWidth) / 2;
            y = botY;
            break;
          case 'top-right':
            x = width - textWidth - padX;
            y = topY;
            break;
          case 'top-left':
            x = padX;
            y = topY;
            break;
          case 'top-center':
            x = (width - textWidth) / 2;
            y = topY;
            break;
        }

        page.drawText(text, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(r, g, b),
        });
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([toArrayBufferBytes(pdfBytes)], { type: 'application/pdf' });
      setResultUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      console.error(e);
      alert('Bates numbering failed: ' + (e?.message || 'Unknown error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Bates Numbering for PDFs"
      subtitle="Number court exhibits, litigation discovery, and audit documents sequentially with live positioning preview."
      categoryLabel="Legal & Compliance Tool"
      icon={Hash}
      microVariant="edit"
      tone="indigo"
    >
      <div className="flex flex-col items-center justify-center max-w-7xl mx-auto w-full">

      {!file ? (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-4xl pms-glass-panel rounded-3xl p-4 sm:p-6"
        >
          <FileDropzone
            onDrop={handleDrop}
            multiple={false}
            accept={{ 'application/pdf': ['.pdf'] }}
            title="Select PDF file"
            subtitle="or drop legal document here for Bates numbering"
          />
        </motion.div>
      ) : resultUrl ? (
        /* Results View */
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, scale: 0.98, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-2xl pms-glass-panel rounded-3xl border border-emerald-200/80 dark:border-emerald-800/70 p-8 text-center space-y-6"
        >
          <div className="p-7 bg-[var(--pms-soft-mint)]/65 dark:bg-emerald-950/35 rounded-2xl border border-emerald-200/70 dark:border-emerald-800/60">
            <motion.div
              initial={prefersReduced ? false : { scale: 0.45, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 20 }}
              className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-200 dark:border-emerald-800"
            >
              <CheckCircle2 className="w-8 h-8" />
            </motion.div>
            <h3 className="text-2xl font-bold text-[var(--pms-ink)] mb-2">
              Bates Numbering Applied!
            </h3>
            <p className="text-sm text-emerald-700 dark:text-emerald-400 mb-6">
              Sequenced from <span className="font-mono font-bold">{currentSampleText}</span> onwards across document pages.
            </p>
            <motion.a
              whileHover={prefersReduced ? undefined : { scale: 1.015 }}
              whileTap={prefersReduced ? undefined : { scale: 0.985 }}
              href={resultUrl}
              download={`bates_${file.name}`}
              className="pms-btn-primary inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-bold rounded-2xl"
            >
              <Download className="w-5 h-5" /> Download Numbered PDF
            </motion.a>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <motion.button
              whileHover={prefersReduced ? undefined : { scale: 1.015 }}
              whileTap={prefersReduced ? undefined : { scale: 0.985 }}
              onClick={() => setResultUrl(null)}
              className="px-6 py-3 bg-[var(--pms-pearl)] dark:bg-slate-800/90 hover:bg-[var(--pms-soft-lavender)] dark:hover:bg-slate-700 text-[var(--pms-ink)] font-semibold rounded-2xl border border-[var(--pms-border)] transition-colors text-sm"
            >
              Adjust Sequence &amp; Position
            </motion.button>
            <motion.button
              whileHover={prefersReduced ? undefined : { scale: 1.015 }}
              whileTap={prefersReduced ? undefined : { scale: 0.985 }}
              onClick={() => {
                setFile(null);
                setResultUrl(null);
              }}
              className="px-6 py-3 bg-[var(--pms-pearl)] dark:bg-slate-800/90 hover:bg-[var(--pms-soft-lavender)] dark:hover:bg-slate-700 text-[var(--pms-ink)] font-semibold rounded-2xl border border-[var(--pms-border)] transition-colors text-sm"
            >
              Number Another PDF
            </motion.button>
          </div>
        </motion.div>
      ) : (
        /* Workspace */
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
        >
          {/* Controls Panel (7 Cols) */}
          <div className="lg:col-span-7 pms-glass-panel rounded-3xl p-6 sm:p-7 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-[var(--pms-border)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] rounded-xl flex items-center justify-center shrink-0">
                  <Hash className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-[var(--pms-ink)] truncate max-w-xs">{file.name}</h3>
                  <p className="text-xs text-[var(--pms-muted)]">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              <button
                onClick={() => setFile(null)}
                className="text-xs font-semibold text-[var(--pms-muted)] hover:text-[var(--pms-ink)] transition-colors"
              >
                Change File
              </button>
            </div>

            {/* Legal Presets */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--pms-subtle-text)] mb-2">
                Industry &amp; Legal Presets
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {LEGAL_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => {
                      setPrefix(p.prefix);
                      setPadding(p.padding);
                      setSuffix(p.suffix || '');
                    }}
                    className={`p-2.5 text-xs font-semibold rounded-xl border text-left transition-all ${
                      prefix === p.prefix
                        ? 'bg-[var(--pms-violet)] border-[var(--pms-violet)] text-white shadow-sm'
                        : 'border-[var(--pms-border)] bg-[var(--pms-pearl)]/60 dark:bg-slate-800/70 text-[var(--pms-ink)] hover:border-[var(--pms-border-strong)]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Prefix, Number, Padding, Suffix */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold text-[var(--pms-muted)] mb-1">Prefix</label>
                <input
                  type="text"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-[var(--pms-border-strong)] bg-[var(--pms-white)] dark:bg-slate-900 text-[var(--pms-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--pms-violet)]/30"
                  placeholder="e.g. DOC-"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--pms-muted)] mb-1">Start #</label>
                <input
                  type="number"
                  min="0"
                  value={startNumber}
                  onChange={(e) => setStartNumber(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-[var(--pms-border-strong)] bg-[var(--pms-white)] dark:bg-slate-900 text-[var(--pms-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--pms-violet)]/30"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--pms-muted)] mb-1">Zero Padding</label>
                <input
                  type="number"
                  min="2"
                  max="10"
                  value={padding}
                  onChange={(e) => setPadding(parseInt(e.target.value, 10) || 4)}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-[var(--pms-border-strong)] bg-[var(--pms-white)] dark:bg-slate-900 text-[var(--pms-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--pms-violet)]/30"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--pms-muted)] mb-1">Suffix (Optional)</label>
                <input
                  type="text"
                  value={suffix}
                  onChange={(e) => setSuffix(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-[var(--pms-border-strong)] bg-[var(--pms-white)] dark:bg-slate-900 text-[var(--pms-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--pms-violet)]/30"
                  placeholder="e.g. -EXH"
                />
              </div>
            </div>

            {/* Position Matrix */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--pms-subtle-text)] mb-2">
                Stamp Location
              </label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['top-left', '↖ Top Left'],
                  ['top-center', '↑ Top Center'],
                  ['top-right', '↗ Top Right'],
                  ['bottom-left', '↙ Bottom Left'],
                  ['bottom-center', '↓ Bottom Center'],
                  ['bottom-right', '↘ Bottom Right'],
                ] as const).map(([pos, label]) => (
                  <button
                    key={pos}
                    onClick={() => setPosition(pos as Position)}
                    className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all ${
                      position === pos
                        ? 'bg-[var(--pms-violet)] border-[var(--pms-violet)] text-white shadow-sm'
                        : 'border-[var(--pms-border)] bg-[var(--pms-pearl)]/60 dark:bg-slate-800/70 text-[var(--pms-ink)] hover:border-[var(--pms-violet)]/60'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size & Margin Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-[var(--pms-muted)] mb-1">
                  Font Size ({fontSize}pt)
                </label>
                <input
                  type="range"
                  min="8"
                  max="18"
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                  className="w-full accent-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--pms-muted)] mb-1">
                  Edge Margin ({marginOffset}pt)
                </label>
                <input
                  type="range"
                  min="15"
                  max="50"
                  value={marginOffset}
                  onChange={(e) => setMarginOffset(parseInt(e.target.value, 10))}
                  className="w-full accent-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--pms-muted)] mb-1">
                  Color
                </label>
                <div className="flex items-center gap-2 p-1 rounded-xl border border-[var(--pms-border-strong)] bg-[var(--pms-white)] dark:bg-slate-900">
                  <input
                    type="color"
                    value={fontColor}
                    onChange={(e) => setFontColor(e.target.value)}
                    className="w-7 h-7 rounded-lg cursor-pointer border-0 p-0 bg-transparent"
                  />
                  <span className="text-xs font-mono font-bold text-[var(--pms-ink)] uppercase">
                    {fontColor}
                  </span>
                </div>
              </div>
            </div>

            {/* Skip Cover Page Checkbox */}
            <div className="pt-3 border-t border-[var(--pms-border)]">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[var(--pms-ink)]">
                <input
                  type="checkbox"
                  checked={skipFirstPage}
                  onChange={(e) => setSkipFirstPage(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 rounded"
                />
                Exclude First Page (Cover / Title Page)
              </label>
            </div>

            {/* Action Button */}
            <motion.button
              whileHover={prefersReduced ? undefined : { scale: 1.01 }}
              whileTap={prefersReduced ? undefined : { scale: 0.99 }}
              onClick={handleProcess}
              disabled={busy}
              className="pms-btn-primary w-full py-4 font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Hash className="w-5 h-5" />}
              {busy ? 'Applying Bates Numbers…' : 'Apply Bates Numbers & Save PDF'}
            </motion.button>
          </div>

          {/* Live Document Canvas Preview (5 Cols) */}
          <div className="lg:col-span-5 pms-glass-panel rounded-3xl p-6 flex flex-col items-center">
            <div className="flex items-center justify-between w-full mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] flex items-center gap-1.5">
                <Eye className="w-4 h-4" /> Live Document Preview (Page 1)
              </span>
              <span className="text-[10px] text-[var(--pms-violet)] font-bold px-2.5 py-0.5 rounded-full bg-[var(--pms-soft-lavender)] border border-[var(--pms-border)] font-mono">
                {currentSampleText}
              </span>
            </div>

            <div className="relative bg-[var(--pms-pearl)]/80 dark:bg-slate-950/75 p-3 rounded-2xl shadow-inner border border-[var(--pms-border)] flex items-center justify-center overflow-hidden min-h-[350px] w-full">
              <PearlScanOverlay
                active={busy || loadingPreview}
                label={loadingPreview ? 'Rendering Page 1 preview…' : 'Applying Bates numbers…'}
              />

              {loadingPreview ? (
                <div className="flex flex-col items-center gap-2 text-[var(--pms-muted)]">
                  <Loader2 className="w-8 h-8 animate-spin text-[var(--pms-violet)]" />
                  <span className="text-xs font-medium">Generating preview…</span>
                </div>
              ) : (
                <canvas
                  ref={previewCanvasRef}
                  className="max-w-full max-h-[500px] object-contain shadow-lg rounded bg-white"
                />
              )}
            </div>
            <p className="text-[11px] text-[var(--pms-subtle-text)] mt-3 text-center">
              Sample stamp: <strong className="font-mono text-[var(--pms-ink)]">{currentSampleText}</strong>
            </p>
          </div>
        </motion.div>
      )}
      </div>
    </ToolWorkspaceShell>
  );
}
