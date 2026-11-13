import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Lock, Loader2, Package, CheckCircle2, FileText } from 'lucide-react';
import { PDFDocument } from 'pdf-lib-plus-encrypt';
import JSZip from 'jszip';
import FileDropzone from '../components/FileDropzone';
import { useSEO } from '../hooks/useSEO';
import { useToast } from '../components/Toast';
import { useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

export default function BatchProtect() {
  useSEO('Batch Protect Online Free | PDF Media Suite', 'Free online Batch Protect tool. No signup or installation required.');

  const [files, setFiles] = useState<File[]>([]);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const toast = useToast();
  useAutoRevokeUrl(resultUrl);
  const prefersReduced = useReducedMotion();

  const handleDrop = (acceptedFiles: File[]) => {
    setFiles(acceptedFiles);
    setResultUrl(null);
  };

  const process = async () => {
    if (files.length === 0 || !password.trim()) return;
    setBusy(true);
    try {
      const zip = new JSZip();

      for (let i = 0; i < files.length; i++) {
        setProgress(`Protecting ${i + 1} of ${files.length}: ${files[i].name}`);
        const buf = await files[i].arrayBuffer();

        const pdfDoc = await PDFDocument.load(buf);
        await pdfDoc.encrypt({
          userPassword: password,
          ownerPassword: password,
        });
        const encrypted = await pdfDoc.save();
        zip.file(`protected_${files[i].name}`, encrypted);
      }

      setProgress('Creating ZIP archive…');
      const blob = await zip.generateAsync({ type: 'blob' });
      setResultUrl(URL.createObjectURL(blob));
      setProgress(`Done! ${files.length} file(s) protected.`);
      toast.success(`Successfully password-protected ${files.length} file(s)!`);
    } catch (e: any) {
      toast.error(e?.message || 'Batch protection failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Batch Protect"
      subtitle="Protect multiple PDF files at once with a single AES encryption password."
      categoryLabel="Batch Security Vault"
      icon={Lock}
      microVariant="security"
      tone="violet"
      trustNote="100% browser-side AES encryption · Instant ZIP packaging"
    >
      <PearlStageSwitch stageKey={files.length === 0 ? 'upload' : 'workspace'}>
        {files.length === 0 ? (
          <div className="max-w-2xl mx-auto">
            <FileDropzone onDrop={handleDrop} multiple={true} title="Select PDF files" subtitle="Drop multiple PDFs at once" />
          </div>
        ) : (
          <div className="relative w-full max-w-2xl mx-auto pms-glass-panel rounded-3xl p-6 sm:p-8 space-y-6 overflow-hidden">
            <PearlScanOverlay active={busy} label={progress || 'Encrypting PDF files…'} />

            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] border border-[var(--pms-border)]">
                  <AnimatedNumber value={files.length} suffix={files.length === 1 ? ' file selected' : ' files selected'} />
                </span>
                <button
                  onClick={() => { setFiles([]); setResultUrl(null); setProgress(''); }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Clear queue
                </button>
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {files.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-slate-800/70 border border-[var(--pms-border)] rounded-xl px-3 py-2"
                  >
                    <FileText className="w-3.5 h-3.5 text-[var(--pms-violet)] shrink-0" />
                    <span className="truncate font-medium">{f.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password for all PDFs"
                className="w-full px-4 py-3 border border-[var(--pms-border)] bg-white/80 dark:bg-slate-800/80 text-slate-900 dark:text-white rounded-2xl focus:ring-2 focus:ring-violet-500 outline-none"
              />
            </div>

            {progress && (
              <p className="text-xs font-semibold text-[var(--pms-blue)] bg-[var(--pms-soft-blue)] border border-[var(--pms-border)] rounded-xl px-4 py-2.5">
                {progress}
              </p>
            )}

            <div className="flex gap-3">
              <motion.button
                whileHover={prefersReduced || busy || !password.trim() ? undefined : { scale: 1.01 }}
                whileTap={prefersReduced || busy || !password.trim() ? undefined : { scale: 0.985 }}
                onClick={process}
                disabled={busy || !password.trim()}
                className="flex-1 pms-btn-primary py-3.5 font-bold rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
                {busy ? 'Protecting…' : 'Protect All PDFs'}
              </motion.button>
              <button
                onClick={() => { setFiles([]); setResultUrl(null); setProgress(''); }}
                disabled={busy}
                className="px-5 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </div>

            <AnimatePresence>
              {resultUrl && (
                <motion.div
                  initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReduced ? undefined : { opacity: 0, y: -8 }}
                  className="p-6 bg-emerald-50/75 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200/80 dark:border-emerald-800/70 text-center space-y-4"
                >
                  <motion.div
                    initial={prefersReduced ? false : { scale: 0.5, rotate: -10, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 360, damping: 18 }}
                    className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto"
                  >
                    <CheckCircle2 className="w-6 h-6" />
                  </motion.div>
                  <div>
                    <p className="font-extrabold text-emerald-900 dark:text-emerald-200">
                      <AnimatedNumber value={files.length} suffix=" Protected PDFs Bundled!" />
                    </p>
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                      Download your AES-encrypted archive below.
                    </p>
                  </div>
                  <motion.a
                    whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                    whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                    href={resultUrl}
                    download="protected_pdfs.zip"
                    className="inline-flex items-center gap-2 px-7 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-colors"
                  >
                    <Package className="w-5 h-5" /> Download Protected ZIP
                  </motion.a>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
