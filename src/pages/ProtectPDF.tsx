import { useState, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib-plus-encrypt';
import { Download, FileText, Lock, Eye, EyeOff, ShieldCheck, CheckCircle2, AlertCircle, Settings2, Printer, Copy, Edit3, Shield, KeyRound, RefreshCw } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

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
    if (confirmPassword && userPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please verify your password.');
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

      const finalOwnerPassword = useOwnerPassword && ownerPassword.trim() ? ownerPassword : userPassword;

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
      const blob = new Blob([finalBytes], { type: 'application/pdf' });
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
    <div className="flex-1 flex flex-col items-center justify-start p-6 md:p-8 min-h-screen bg-gradient-to-br from-purple-50/40 via-white to-slate-50">
      <div className="text-center mb-10 max-w-2xl">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-purple-100 rounded-2xl mb-4">
          <ShieldCheck className="w-7 h-7 text-purple-600" />
        </div>
        <h1 className="text-4xl font-extrabold text-gray-900 mb-3">Protect PDF with Password</h1>
        <p className="text-lg text-gray-500">Encrypt your PDF with standard AES encryption. Restrict printing, text copying, and editing.</p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Drop PDF here or click to select" />
      ) : protectedUrl ? (
        /* Success Screen */
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-1">PDF Successfully Protected!</h3>
          <p className="text-gray-500 mb-6">Your file is encrypted with standard AES security.</p>

          <div className="p-4 bg-purple-50 rounded-xl border border-purple-100 mb-6 text-left space-y-1.5 text-xs text-purple-900">
            <div className="font-semibold text-sm text-purple-950 mb-1">Security Summary:</div>
            <div>• Open Password: <span className="font-mono bg-purple-100 px-1.5 py-0.5 rounded text-purple-800">Protected</span></div>
            <div>• Printing: <span className="font-semibold capitalize">{printPerm === 'none' ? 'Disallowed' : `${printPerm} Resolution`}</span></div>
            <div>• Text Copying: <span className="font-semibold">{allowCopying ? 'Allowed' : 'Disabled'}</span></div>
            <div>• Modifying: <span className="font-semibold">{allowModifying ? 'Allowed' : 'Disabled'}</span></div>
          </div>

          <a
            href={protectedUrl}
            download={`protected_${file.name}`}
            className="inline-flex items-center justify-center gap-2 w-full py-4 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors shadow-md mb-4"
          >
            <Download className="w-5 h-5" /> Download Protected PDF
          </a>
          <br />
          <button
            onClick={() => { setFile(null); setProtectedUrl(null); setUserPassword(''); setConfirmPassword(''); }}
            className="text-gray-500 hover:text-gray-800 font-medium text-sm mt-2"
          >
            Protect another file
          </button>
        </div>
      ) : (
        /* Protection Configuration */
        <div className="w-full max-w-3xl space-y-6">

          {/* File Card */}
          <div className="flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="w-16 h-20 bg-gray-100 rounded-xl overflow-hidden shrink-0 border border-gray-200 shadow-sm flex items-center justify-center">
              {thumb ? (
                <img src={thumb} alt={file.name} className="w-full h-full object-cover" />
              ) : (
                <FileText className="w-7 h-7 text-purple-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate">{file.name}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                {pageCount > 0 && <span>• {pageCount} pages</span>}
                <span className="text-emerald-600 font-medium">• Unprotected</span>
              </div>
            </div>
            <button
              onClick={() => { setFile(null); setThumb(null); }}
              className="text-xs text-gray-400 hover:text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"
            >
              Change file
            </button>
          </div>

          {/* Password Setup Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
              <KeyRound className="w-5 h-5 text-purple-600" />
              <h2 className="text-lg font-bold text-gray-900">Document Password</h2>
            </div>

            {/* Password input */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Set Document Open Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={userPassword}
                  onChange={e => setUserPassword(e.target.value)}
                  placeholder="Enter a secure password"
                  className="w-full pl-4 pr-11 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-gray-900 font-mono text-sm placeholder:font-sans"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Password strength meter */}
              {userPassword.length > 0 && (
                <div className="mt-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Strength: <span className="font-semibold text-gray-800">{pwdStrength.label}</span></span>
                    <span className="text-gray-400">{pwdStrength.feedback}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 h-1.5">
                    {[1, 2, 3, 4].map(step => (
                      <div
                        key={step}
                        className={`rounded-full transition-all duration-300 ${step <= pwdStrength.score ? pwdStrength.color : 'bg-gray-100'}`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-type your password"
                  className={`w-full pl-4 pr-11 py-3 border rounded-xl focus:ring-2 outline-none text-gray-900 font-mono text-sm placeholder:font-sans ${
                    passwordsMatch
                      ? 'border-emerald-300 focus:ring-emerald-500'
                      : passwordsMismatch
                      ? 'border-red-300 focus:ring-red-500 bg-red-50/20'
                      : 'border-gray-200 focus:ring-purple-500 focus:border-transparent'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordsMatch && (
                <p className="mt-1.5 text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Passwords match
                </p>
              )}
              {passwordsMismatch && (
                <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> Passwords do not match
                </p>
              )}
            </div>

            {/* Advanced permissions toggle */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="inline-flex items-center gap-2 text-sm font-semibold text-purple-700 hover:text-purple-800 transition-colors"
              >
                <Settings2 className="w-4 h-4" />
                {showAdvanced ? 'Hide Advanced Security & Permissions' : 'Configure Advanced Permissions (Printing, Copying, Owner Password)'}
              </button>
            </div>

            {/* Advanced Section */}
            {showAdvanced && (
              <div className="p-5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-5 mt-3">
                {/* Printing permission */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Printer className="w-4 h-4 text-purple-600" /> Printing Permission
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'high', label: 'High Resolution', sub: 'Allowed (Default)' },
                      { id: 'low', label: 'Low Resolution', sub: '150 DPI Draft' },
                      { id: 'none', label: 'Disallowed', sub: 'No Printing' },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setPrintPerm(opt.id as PrintPermission)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          printPerm === opt.id
                            ? 'border-purple-600 bg-purple-50 text-purple-900 font-semibold shadow-sm'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <div className="text-xs font-bold">{opt.label}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{opt.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Checkboxes for permissions */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-purple-600" /> Reader Restrictions
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl cursor-pointer hover:border-purple-300 transition-colors">
                      <input
                        type="checkbox"
                        checked={allowCopying}
                        onChange={e => setAllowCopying(e.target.checked)}
                        className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
                      />
                      <div>
                        <div className="text-xs font-semibold text-gray-800">Allow Content Copying</div>
                        <div className="text-[10px] text-gray-400">Extract text and graphics</div>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl cursor-pointer hover:border-purple-300 transition-colors">
                      <input
                        type="checkbox"
                        checked={allowModifying}
                        onChange={e => setAllowModifying(e.target.checked)}
                        className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
                      />
                      <div>
                        <div className="text-xs font-semibold text-gray-800">Allow Modifying Document</div>
                        <div className="text-[10px] text-gray-400">Page rotation, deletion, insertion</div>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl cursor-pointer hover:border-purple-300 transition-colors">
                      <input
                        type="checkbox"
                        checked={allowFillingForms}
                        onChange={e => setAllowFillingForms(e.target.checked)}
                        className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
                      />
                      <div>
                        <div className="text-xs font-semibold text-gray-800">Allow Form Filling</div>
                        <div className="text-[10px] text-gray-400">Fill in existing form fields</div>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl cursor-pointer hover:border-purple-300 transition-colors">
                      <input
                        type="checkbox"
                        checked={allowAnnotating}
                        onChange={e => setAllowAnnotating(e.target.checked)}
                        className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
                      />
                      <div>
                        <div className="text-xs font-semibold text-gray-800">Allow Comments & Annotations</div>
                        <div className="text-[10px] text-gray-400">Add notes and highlights</div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Optional Owner Password */}
                <div className="pt-2 border-t border-slate-200">
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={useOwnerPassword}
                      onChange={e => setUseOwnerPassword(e.target.checked)}
                      className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
                    />
                    <span className="text-xs font-bold text-gray-800">Set Separate Master / Owner Password</span>
                  </label>
                  {useOwnerPassword && (
                    <div className="relative mt-2">
                      <input
                        type={showOwnerPassword ? 'text' : 'password'}
                        value={ownerPassword}
                        onChange={e => setOwnerPassword(e.target.value)}
                        placeholder="Owner password (for full master control)"
                        className="w-full pl-4 pr-11 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowOwnerPassword(!showOwnerPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                      >
                        {showOwnerPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Protect Button */}
            <button
              onClick={protectPdf}
              disabled={isProcessing || !userPassword || (confirmPassword.length > 0 && userPassword !== confirmPassword)}
              className="w-full py-4 bg-purple-600 text-white text-base font-bold rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50 shadow-md flex items-center justify-center gap-2 mt-2"
            >
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
            </button>
            <p className="text-center text-xs text-gray-400">
              Files are processed entirely inside your browser. No files or passwords are ever uploaded to a server.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
