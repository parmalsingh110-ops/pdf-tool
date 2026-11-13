import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { PDFDocument } from 'pdf-lib-plus-encrypt';
import { Download, FileText, Lock, Eye, EyeOff, ShieldCheck, CheckCircle2, AlertCircle, Settings2, Printer, Shield, KeyRound, RefreshCw } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';
import { useAutoRevokeUrl, toArrayBufferBytes } from '../lib/blobUrl';

type PrintPermission = 'none' | 'low' | 'high';

function evaluateStrength(pwd: string): { score: number; label: string; color: string; feedback: string } {
  if (!pwd) return { score: 0, label: '', color: 'bg-gray-200', feedback: '' };
  let score = 0;
  if (pwd.length >= 8) score += 1;
  if (pwd.length >= 12) score += 1;
  if (/[0-9]/.test(pwd)) score += 1;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;
  if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

  if (score <= 2) return { score: 1, label: 'Weak', color: 'bg-red-500', feedback: 'Use at least 8 characters with numbers' };
  if (score <= 3) return { score: 2, label: 'Fair', color: 'bg-amber-500', feedback: 'Add symbols and uppercase letters' };
  if (score <= 4) return { score: 3, label: 'Good', color: 'bg-blue-500', feedback: 'Strong password' };
  return { score: 4, label: 'Excellent', color: 'bg-emerald-500', feedback: 'Very secure enterprise password' };
}

export default function ProtectPDF() {
  useSEO('Protect PDF with Password Online Free | PDF Media Suite', 'Encrypt PDF documents with 128/256-bit AES encryption. Set custom open password, printing, copying, and editing permissions. 100% free & client-side.');
  usePageSEO('Protect PDF with Password Online', 'Add password protection and granular security permissions to PDF files. Restrict printing, text copying, and editing. Private, browser-based encryption.');

  const [file, setFile] = useState<File | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);

  // Passwords
  const [userPassword, setUserPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Advanced options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [useOwnerPassword, setUseOwnerPassword] = useState(false);
  const prefersReduced = useReducedMotion();
  const [ownerPassword, setOwnerPassword] = useState('');
  const [showOwnerPassword, setShowOwnerPassword] = useState(false);

  // Granular permissions
  const [printPerm, setPrintPerm] = useState<PrintPermission>('high');
  const [allowCopying, setAllowCopying] = useState(false);
  const [allowModifying, setAllowModifying] = useState(false);
  const [allowAnnotating, setAllowAnnotating] = useState(true);
  const [allowFillingForms, setAllowFillingForms] = useState(true);

  // State
  const [isProcessing, setIsProcessing] = useState(false);
  const [protectedUrl, setProtectedUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useAutoRevokeUrl(protectedUrl);

  const pwdStrength = evaluateStrength(userPassword);
  const passwordsMatch = userPassword.length > 0 && confirmPassword.length > 0 && userPassword === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && userPassword !== confirmPassword;

  const handleDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    const f = acceptedFiles[0];
    setFile(f);
    setProtectedUrl(null);
    setUserPassword('');
    setConfirmPassword('');
    setErrorMsg(null);
    setThumb(null);

    try {
      const ab = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
      setPageCount(pdf.numPages);
      const page = await pdf.getPage(1);
      const vp = page.getViewport({ scale: 0.35 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
      setThumb(canvas.toDataURL('image/jpeg', 0.7));
      canvas.width = 0; canvas.height = 0;
      page.cleanup();
    } catch {
      // ignore preview error
    }
  };

  const protectPdf = async () => {
    if (!file || !userPassword) return;
    if (userPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please verify your password in both fields.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);

      let printingVal: boolean | 'lowResolution' | 'highResolution' = false;
      if (printPerm === 'high') printingVal = 'highResolution';
      else if (printPerm === 'low') printingVal = 'lowResolution';
      else printingVal = false;

      // Ensure that if restrictions (e.g. copying/printing disabled) are set without a custom owner password,
      // a distinct owner password is generated so opening as User actually enforces the restrictions!
      const finalOwnerPassword = useOwnerPassword && ownerPassword.trim()
        ? ownerPassword
        : (allowCopying && allowModifying && printingVal === 'highResolution')
          ? userPassword
          : crypto.randomUUID();

      await pdfDoc.encrypt({
        userPassword,
        ownerPassword: finalOwnerPassword,
        permissions: {
          printing: printingVal,
          copying: allowCopying,
          modifying: allowModifying,
          annotating: allowAnnotating,
          fillingForms: allowFillingForms,
          contentAccessibility: true,
        },
      });

      const finalBytes = await pdfDoc.save();
      const blob = new Blob([toArrayBufferBytes(finalBytes)], { type: 'application/pdf' });
      setProtectedUrl(URL.createObjectURL(blob));
    } catch (error) {
      console.error('Error protecting PDF:', error);
      const message = error instanceof Error ? error.message : 'Failed to protect PDF.';
      setErrorMsg(message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceShell
      title="Protect PDF with Password"
      subtitle="Encrypt your PDF with standard AES encryption. Restrict printing, text copying, and editing."
      categoryLabel="Security Vault · Client-Side Encryption"
      icon={ShieldCheck}
      microVariant="security"
      tone="violet"
    >
      <div className="flex flex-col items-center w-full">

      <PearlStageSwitch
        stageKey={!file ? 'upload' : protectedUrl ? 'result' : 'configure'}
        className="w-full max-w-3xl"
      >
      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Drop PDF here or click to select" />
      ) : protectedUrl ? (
        /* Success Screen */
        <div className="w-full max-w-lg mx-auto pms-glass-panel rounded-3xl p-8 text-center">
          <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-500/12 via-white/75 to-teal-500/12 dark:from-emerald-950/50 dark:via-slate-900/80 dark:to-teal-950/40 border border-emerald-200/80 dark:border-emerald-800/60 mb-6">
            <motion.div
              initial={prefersReduced ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 24 }}
              className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/25"
            >
              <Lock className="w-8 h-8" />
            </motion.div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">PDF Successfully Protected!</h3>
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-5">Your file is encrypted with standard AES security.</p>

            <div className="p-4 bg-white/80 dark:bg-slate-900/80 rounded-2xl border border-[var(--pms-border)] mb-6 text-left space-y-1.5 text-xs text-purple-950 dark:text-purple-200">
              <div className="font-bold text-sm text-gray-900 dark:text-white mb-1">Security Summary:</div>
              <div>• Open Password: <span className="font-mono bg-[var(--pms-soft-lavender)] px-2 py-0.5 rounded text-purple-800 dark:text-purple-200">Protected</span></div>
              <div>• Printing: <span className="font-semibold capitalize">{printPerm === 'none' ? 'Disallowed' : `${printPerm} Resolution`}</span></div>
              <div>• Text Copying: <span className="font-semibold">{allowCopying ? 'Allowed' : 'Disabled'}</span></div>
              <div>• Modifying: <span className="font-semibold">{allowModifying ? 'Allowed' : 'Disabled'}</span></div>
            </div>

            <motion.a
              whileHover={prefersReduced ? undefined : { scale: 1.02 }}
              whileTap={prefersReduced ? undefined : { scale: 0.98 }}
              href={protectedUrl}
              download={`protected_${file.name}`}
              className="pms-btn-primary relative overflow-hidden inline-flex items-center justify-center gap-2 w-full py-4 font-bold rounded-xl shadow-md"
            >
              <span className="pms-shimmer pointer-events-none" />
              <Download className="w-5 h-5" /> Download Protected PDF
            </motion.a>
          </div>
          <button
            onClick={() => { setFile(null); setProtectedUrl(null); setUserPassword(''); setConfirmPassword(''); }}
            className="text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white font-semibold text-sm transition-colors"
          >
            Protect another file
          </button>
        </div>
      ) : (
        /* Protection Configuration */
        <div className="w-full space-y-6">

          {/* File Card */}
          <div className="flex items-center gap-4 p-4 pms-glass-panel rounded-2xl">
            <div className="w-16 h-20 bg-white rounded-xl overflow-hidden shrink-0 border border-gray-200 dark:border-slate-700 shadow-sm flex items-center justify-center">
              {thumb ? (
                <img src={thumb} alt={file.name} className="w-full h-full object-contain" />
              ) : (
                <FileText className="w-7 h-7 text-[var(--pms-violet)]" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white truncate">{file.name}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-slate-400">
                <span className="tabular-nums">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                {pageCount > 0 && <span>• {pageCount} pages</span>}
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">• Unprotected</span>
              </div>
            </div>
            <button
              onClick={() => { setFile(null); setThumb(null); }}
              className="text-xs font-semibold text-gray-600 dark:text-slate-300 hover:text-rose-600 px-3 py-1.5 rounded-xl border border-[var(--pms-border)] bg-white/80 dark:bg-slate-800/80 hover:bg-[var(--pms-soft-rose)] transition-colors shrink-0"
            >
              Change file
            </button>
          </div>

          {/* Password Setup Card */}
          <div className="relative overflow-hidden pms-glass-panel rounded-3xl p-6 space-y-5">
            <PearlScanOverlay active={isProcessing} label="Encrypting PDF with AES cipher..." />
            <div className="flex items-center gap-2 border-b border-[var(--pms-border)] pb-3">
              <KeyRound className="w-5 h-5 text-[var(--pms-violet)]" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Document Password</h2>
            </div>

            {/* Password input */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
                Set Document Open Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={userPassword}
                  onChange={e => setUserPassword(e.target.value)}
                  placeholder="Enter a secure password"
                  className="w-full pl-4 pr-11 py-3 border border-[var(--pms-border)] bg-white/85 dark:bg-slate-800/85 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-gray-900 dark:text-white font-mono text-sm placeholder:font-sans"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Password strength meter */}
              {userPassword.length > 0 && (
                <div className="mt-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-slate-400">Strength: <span className="font-semibold text-gray-800 dark:text-slate-200">{pwdStrength.label}</span></span>
                    <span className="text-gray-400">{pwdStrength.feedback}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 h-1.5">
                    {[1, 2, 3, 4].map(step => (
                      <div
                        key={step}
                        className={`rounded-full transition-all duration-300 ${step <= pwdStrength.score ? pwdStrength.color : 'bg-gray-200 dark:bg-slate-800'}`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-type your password"
                  className={`w-full pl-4 pr-11 py-3 border bg-white/85 dark:bg-slate-800/85 rounded-xl focus:ring-2 outline-none text-gray-900 dark:text-white font-mono text-sm placeholder:font-sans ${
                    passwordsMatch
                      ? 'border-emerald-400 dark:border-emerald-700 focus:ring-emerald-500'
                      : passwordsMismatch
                      ? 'border-red-400 dark:border-red-700 focus:ring-red-500 bg-red-50/30 dark:bg-red-950/20'
                      : 'border-[var(--pms-border)] focus:ring-purple-500 focus:border-transparent'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 p-1"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordsMatch && (
                <p className="mt-1.5 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Passwords match
                </p>
              )}
              {passwordsMismatch && (
                <p className="mt-1.5 text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> Passwords do not match
                </p>
              )}
            </div>

            {/* Advanced permissions toggle */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--pms-violet)] hover:brightness-110 transition-all"
              >
                <Settings2 className="w-4 h-4" />
                {showAdvanced ? 'Hide Advanced Security & Permissions' : 'Configure Advanced Permissions (Printing, Copying, Owner Password)'}
              </button>
            </div>

            {/* Advanced Section */}
            {showAdvanced && (
              <div className="p-5 bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] space-y-5 mt-3">
                {/* Printing permission */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Printer className="w-4 h-4 text-[var(--pms-violet)]" /> Printing Permission
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'high', label: 'High Resolution', sub: 'Allowed (Default)' },
                      { id: 'low', label: 'Low Resolution', sub: '150 DPI Draft' },
                      { id: 'none', label: 'Disallowed', sub: 'No Printing' },
                    ].map(opt => {
                      const active = printPerm === opt.id;
                      return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setPrintPerm(opt.id as PrintPermission)}
                        className={`relative overflow-hidden p-3 rounded-xl border text-left transition-all ${
                          active
                            ? 'border-[var(--pms-violet)] text-purple-950 dark:text-purple-100 font-semibold shadow-sm'
                            : 'border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 text-gray-600 dark:text-slate-300 hover:border-[var(--pms-border-strong)]'
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="protect-print-pill"
                            transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                            className="absolute inset-0 bg-[var(--pms-soft-lavender)] pointer-events-none"
                          />
                        )}
                        <div className="relative z-10 text-xs font-bold">{opt.label}</div>
                        <div className="relative z-10 text-[10px] text-gray-500 dark:text-slate-400 mt-0.5">{opt.sub}</div>
                      </button>
                    );
                    })}
                  </div>
                </div>

                {/* Checkboxes for permissions */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-[var(--pms-violet)]" /> Reader Restrictions
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex items-center gap-3 p-3 bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] rounded-xl cursor-pointer hover:border-[var(--pms-border-strong)] transition-colors">
                      <input
                        type="checkbox"
                        checked={allowCopying}
                        onChange={e => setAllowCopying(e.target.checked)}
                        className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
                      />
                      <div>
                        <div className="text-xs font-semibold text-gray-800 dark:text-slate-200">Allow Content Copying</div>
                        <div className="text-[10px] text-gray-400">Extract text and graphics</div>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] rounded-xl cursor-pointer hover:border-[var(--pms-border-strong)] transition-colors">
                      <input
                        type="checkbox"
                        checked={allowModifying}
                        onChange={e => setAllowModifying(e.target.checked)}
                        className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
                      />
                      <div>
                        <div className="text-xs font-semibold text-gray-800 dark:text-slate-200">Allow Modifying Document</div>
                        <div className="text-[10px] text-gray-400">Page rotation, deletion, insertion</div>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] rounded-xl cursor-pointer hover:border-[var(--pms-border-strong)] transition-colors">
                      <input
                        type="checkbox"
                        checked={allowFillingForms}
                        onChange={e => setAllowFillingForms(e.target.checked)}
                        className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
                      />
                      <div>
                        <div className="text-xs font-semibold text-gray-800 dark:text-slate-200">Allow Form Filling</div>
                        <div className="text-[10px] text-gray-400">Fill in existing form fields</div>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] rounded-xl cursor-pointer hover:border-[var(--pms-border-strong)] transition-colors">
                      <input
                        type="checkbox"
                        checked={allowAnnotating}
                        onChange={e => setAllowAnnotating(e.target.checked)}
                        className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
                      />
                      <div>
                        <div className="text-xs font-semibold text-gray-800 dark:text-slate-200">Allow Comments & Annotations</div>
                        <div className="text-[10px] text-gray-400">Add notes and highlights</div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Optional Owner Password */}
                <div className="pt-2 border-t border-[var(--pms-border)]">
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={useOwnerPassword}
                      onChange={e => setUseOwnerPassword(e.target.checked)}
                      className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
                    />
                    <span className="text-xs font-bold text-gray-800 dark:text-slate-200">Set Separate Master / Owner Password</span>
                  </label>
                  {useOwnerPassword && (
                    <div className="relative mt-2">
                      <input
                        type={showOwnerPassword ? 'text' : 'password'}
                        value={ownerPassword}
                        onChange={e => setOwnerPassword(e.target.value)}
                        placeholder="Owner password (for full master control)"
                        className="w-full pl-4 pr-11 py-2.5 bg-white/90 dark:bg-slate-800/80 border border-[var(--pms-border)] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowOwnerPassword(!showOwnerPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 p-1"
                      >
                        {showOwnerPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 bg-red-50/90 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs rounded-xl border border-red-200 dark:border-red-800/60 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Protect Button */}
            <motion.button
              whileHover={prefersReduced || isProcessing || !userPassword || (confirmPassword.length > 0 && userPassword !== confirmPassword) ? undefined : { scale: 1.01 }}
              whileTap={prefersReduced || isProcessing || !userPassword || (confirmPassword.length > 0 && userPassword !== confirmPassword) ? undefined : { scale: 0.99 }}
              onClick={protectPdf}
              disabled={isProcessing || !userPassword || (confirmPassword.length > 0 && userPassword !== confirmPassword)}
              className="pms-btn-primary relative overflow-hidden w-full py-4 text-base font-bold rounded-xl disabled:opacity-50 shadow-md flex items-center justify-center gap-2 mt-2"
            >
              <span className="pms-shimmer pointer-events-none" />
              {isProcessing ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Encrypting Document...
                </>
              ) : (
                <>
                  <Lock className="w-5 h-5" />
                  Encrypt & Protect PDF
                </>
              )}
            </motion.button>
            <p className="text-center text-xs text-gray-500 dark:text-slate-400">
              Files are processed entirely inside your browser. No files or passwords are ever uploaded to a server.
            </p>
          </div>
        </div>
      )}
      </PearlStageSwitch>
      </div>
    </ToolWorkspaceShell>
  );
}
