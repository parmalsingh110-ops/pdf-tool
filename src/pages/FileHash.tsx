import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ShieldCheck, Copy, Check, Loader2, FileText } from 'lucide-react';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

interface HashResult {
  name: string;
  size: string;
  sizeBytes: number;
  md5: string;
  sha1: string;
  sha256: string;
}

async function computeHash(buffer: ArrayBuffer, algo: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(algo, buffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function FileHash() {
  useSEO('File Hash Online Free | PDF Media Suite', 'Free online File Hash tool. No signup or installation required.');

  usePageSEO('File Hash Calculator', 'Calculate SHA-1 and SHA-256 hashes for any file. Free online file integrity verification tool.');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<HashResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const prefersReduced = useReducedMotion();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setBusy(true);
    try {
      const buf = await f.arrayBuffer();
      const sha1 = await computeHash(buf, 'SHA-1');
      const sha256 = await computeHash(buf, 'SHA-256');
      const md5 = sha1.slice(0, 32);

      setResult({
        name: f.name,
        size: f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(1)} KB` : `${(f.size / 1024 / 1024).toFixed(2)} MB`,
        sizeBytes: f.size,
        md5: md5 ? '(Not available in Web Crypto)' : '(Not available in Web Crypto)',
        sha1,
        sha256,
      });
    } catch (e: any) {
      alert(e?.message || 'Hashing failed');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const stageKey = !file ? 'upload' : busy ? 'hashing' : 'result';

  return (
    <ToolWorkspaceShell
      title="File Hash Calculator"
      subtitle="Calculate cryptographic SHA-1 and SHA-256 digests in-browser to verify file integrity and authenticity."
      categoryLabel="Cryptographic Integrity"
      icon={ShieldCheck}
      microVariant="security"
      tone="emerald"
      trustNote="100% Web Crypto API · Zero bytes leave your device"
    >
      <PearlStageSwitch stageKey={stageKey}>
        {!file ? (
          <div className="max-w-3xl mx-auto">
            <label
              className="w-full p-10 border-2 border-dashed rounded-[1.75rem] cursor-pointer transition-all duration-200 flex flex-col items-center justify-center text-center hover:border-emerald-400/80"
              style={{
                backgroundColor: 'var(--pms-white)',
                borderColor: 'var(--pms-border-strong)',
                boxShadow: 'var(--pms-shadow-card)',
              }}
            >
              <motion.div
                animate={prefersReduced ? undefined : { y: [0, -3, 0] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center mb-4 bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300"
              >
                <ShieldCheck className="w-9 h-9" />
              </motion.div>
              <span className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Select Any File</span>
              <span className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                PDF, images, documents, archives — any file format
              </span>
              <span className="mt-6 inline-flex items-center justify-center px-7 py-3 text-sm font-bold rounded-full pms-btn-primary">
                Choose File to Hash
              </span>
              <input type="file" className="hidden" onChange={handleFile} />
            </label>
          </div>
        ) : busy ? (
          <div className="relative max-w-lg mx-auto pms-glass-panel rounded-3xl p-12 text-center space-y-4 overflow-hidden">
            <PearlScanOverlay active={busy} label="Computing SHA-1 & SHA-256 digests…" />
            <div className="w-14 h-14 rounded-2xl bg-[var(--pms-soft-mint)] text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <Loader2 className="w-7 h-7 animate-spin" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">Computing Cryptographic Digests…</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Hashing <span className="font-semibold">{file.name}</span> locally via SubtleCrypto.
            </p>
          </div>
        ) : result ? (
          <div className="w-full max-w-3xl mx-auto space-y-5">
            {/* File Metadata Tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="pms-glass-panel p-5 rounded-2xl flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-bold uppercase tracking-wider">
                    File Name
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white text-sm truncate block">
                    {result.name}
                  </span>
                </div>
              </div>
              <div className="pms-glass-panel p-5 rounded-2xl flex items-center justify-between gap-3.5">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-bold uppercase tracking-wider">
                    File Size
                  </span>
                  <span className="font-extrabold text-slate-900 dark:text-white text-lg">
                    {result.sizeBytes < 1024 * 1024 ? (
                      <AnimatedNumber value={result.sizeBytes / 1024} decimals={1} suffix=" KB" />
                    ) : (
                      <AnimatedNumber value={result.sizeBytes / 1024 / 1024} decimals={2} suffix=" MB" />
                    )}
                  </span>
                </div>
                <span className="px-3 py-1 rounded-full bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                  Verified Locally
                </span>
              </div>
            </div>

            {/* Hash Digest Cards */}
            <AnimatePresence initial={false}>
              {[
                {
                  label: 'SHA-256 (Recommended)',
                  copyKey: 'SHA-256',
                  value: result.sha256,
                  badgeBg: 'bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300',
                },
                {
                  label: 'SHA-1 (Legacy)',
                  copyKey: 'SHA-1',
                  value: result.sha1,
                  badgeBg: 'bg-[var(--pms-soft-rose)] text-amber-700 dark:text-amber-300',
                },
              ].map((h, idx) => (
                <motion.div
                  key={h.copyKey}
                  initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: idx * 0.07 }}
                  className="pms-glass-panel rounded-3xl p-5 space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-extrabold ${h.badgeBg}`}>
                      {h.label}
                    </span>
                    <motion.button
                      whileTap={prefersReduced ? undefined : { scale: 0.96 }}
                      onClick={() => copy(h.value, h.copyKey)}
                      className="px-3.5 py-1.5 bg-white/80 dark:bg-slate-900/80 hover:bg-white dark:hover:bg-slate-800 border border-[var(--pms-border)] rounded-xl text-xs font-bold flex items-center gap-1.5 text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      {copied === h.copyKey ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copy Digest
                        </>
                      )}
                    </motion.button>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)]">
                    <p className="font-mono text-xs text-slate-800 dark:text-slate-200 break-all select-all">
                      {h.value}
                    </p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            <div className="pms-glass-panel p-4 rounded-2xl text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              <strong className="text-slate-900 dark:text-white">Note:</strong> MD5 {result.md5.toLowerCase()}. SHA-256 is recommended for security and checksum verification.
            </div>

            <button
              onClick={() => { setFile(null); setResult(null); }}
              className="w-full py-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl font-bold text-sm transition-colors cursor-pointer"
            >
              Hash another file
            </button>
          </div>
        ) : null}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
