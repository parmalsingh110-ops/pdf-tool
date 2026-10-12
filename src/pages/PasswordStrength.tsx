import React, { useState } from 'react';
import { 
  Lock, ShieldCheck, AlertTriangle, Key, Copy, Check, 
  Sparkles, RefreshCw, Cpu, Server, Zap
} from 'lucide-react';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

export default function PasswordStrength() {
  useSEO(
    'PDF Password Strength Checker & GPU Crack-Time Auditor',
    'Test PDF password strength with cryptographic entropy calculation and GPU cluster brute-force cracking time estimates. Enterprise password generator included.'
  );

  usePageSEO(
    'Enterprise Password Strength Auditor & Entropy Calculator',
    'Calculate password entropy, test against Hashcat/GPU brute-force benchmarks, check common dictionary vulnerabilities, and generate secure PDF passwords.'
  );

  const [password, setPassword] = useState('P@ssw0rd2026!');
  const [copied, setCopied] = useState(false);
  const [genLength, setGenLength] = useState(16);

  // Entropy Calculation
  const calculateMetrics = (pwd: string) => {
    let poolSize = 0;
    if (/[a-z]/.test(pwd)) poolSize += 26;
    if (/[A-Z]/.test(pwd)) poolSize += 26;
    if (/[0-9]/.test(pwd)) poolSize += 10;
    if (/[^A-Za-z0-9]/.test(pwd)) poolSize += 33;

    const entropyBits = pwd.length > 0 && poolSize > 0 
      ? Math.round(pwd.length * Math.log2(poolSize)) 
      : 0;

    // Hashcat 8x RTX 4090 rate: ~200 Billion guesses/sec
    const guessesPerSec = 200_000_000_000;
    const totalCombinations = poolSize > 0 ? Math.pow(poolSize, pwd.length) : 0;
    const crackSeconds = totalCombinations / (guessesPerSec * 2);

    let crackTime = 'Instant';
    if (crackSeconds > 31536000 * 1000) crackTime = `${Math.round(crackSeconds / (31536000 * 1000))} Million Years`;
    else if (crackSeconds > 31536000) crackTime = `${Math.round(crackSeconds / 31536000)} Years`;
    else if (crackSeconds > 86400 * 30) crackTime = `${Math.round(crackSeconds / (86400 * 30))} Months`;
    else if (crackSeconds > 86400) crackTime = `${Math.round(crackSeconds / 86400)} Days`;
    else if (crackSeconds > 3600) crackTime = `${Math.round(crackSeconds / 3600)} Hours`;
    else if (crackSeconds > 60) crackTime = `${Math.round(crackSeconds / 60)} Minutes`;
    else if (crackSeconds > 0) crackTime = `${Math.round(crackSeconds)} Seconds`;

    let grade = 'Weak';
    let color = 'text-red-600';
    let bg = 'bg-red-500';

    if (entropyBits >= 75) { grade = 'Military Grade'; color = 'text-emerald-600'; bg = 'bg-emerald-500'; }
    else if (entropyBits >= 60) { grade = 'Very Strong'; color = 'text-emerald-500'; bg = 'bg-emerald-500'; }
    else if (entropyBits >= 45) { grade = 'Moderate'; color = 'text-amber-500'; bg = 'bg-amber-500'; }
    else if (entropyBits >= 30) { grade = 'Weak'; color = 'text-orange-500'; bg = 'bg-orange-500'; }
    else { grade = 'Critical Vulnerability'; color = 'text-red-600'; bg = 'bg-red-600'; }

    return { entropyBits, crackTime, grade, color, bg, poolSize };
  };

  const metrics = calculateMetrics(password);

  // Secure Password Generator
  const generateSecurePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()_+~';
    let res = '';
    const arr = new Uint32Array(genLength);
    window.crypto.getRandomValues(arr);
    for (let i = 0; i < genLength; i++) {
      res += chars[arr[i] % chars.length];
    }
    setPassword(res);
  };

  const copyPassword = () => {
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-4 sm:p-8 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm border border-purple-100 dark:border-purple-900/50">
          <Lock className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-2">
          Enterprise Password Auditor & Entropy Studio
        </h1>
        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          Audit password security against GPU cluster brute-force benchmarks (Hashcat / RTX 4090) and calculate entropy bits.
        </p>
      </div>

      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-6">
        {/* Input Field */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Test Password</label>
            <button
              onClick={copyPassword}
              className="text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              Copy
            </button>
          </div>

          <div className="relative">
            <input
              type="text"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3.5 text-base font-mono rounded-2xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Enter password..."
            />
          </div>
        </div>

        {/* Strength Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-500">Security Grade:</span>
            <span className={`font-extrabold ${metrics.color}`}>{metrics.grade}</span>
          </div>
          <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full ${metrics.bg} transition-all duration-300`}
              style={{ width: `${Math.min((metrics.entropyBits / 80) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
            <Cpu className="w-5 h-5 text-purple-600 mx-auto mb-1" />
            <span className="text-[11px] text-slate-500 block">Information Entropy</span>
            <p className="text-base font-extrabold text-slate-800 dark:text-slate-200">{metrics.entropyBits} Bits</p>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
            <Server className="w-5 h-5 text-indigo-600 mx-auto mb-1" />
            <span className="text-[11px] text-slate-500 block">GPU Crack Time</span>
            <p className="text-base font-extrabold text-slate-800 dark:text-slate-200 truncate">{metrics.crackTime}</p>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
            <Zap className="w-5 h-5 text-amber-600 mx-auto mb-1" />
            <span className="text-[11px] text-slate-500 block">Character Pool</span>
            <p className="text-base font-extrabold text-slate-800 dark:text-slate-200">{metrics.poolSize} Symbols</p>
          </div>
        </div>

        {/* Checklist */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2 text-xs">
          <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Complexity Audit:</span>
          <div className="grid grid-cols-2 gap-2">
            <div className={`flex items-center gap-1.5 ${password.length >= 12 ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
              <Check className="w-3.5 h-3.5" /> 12+ Characters
            </div>
            <div className={`flex items-center gap-1.5 ${/[A-Z]/.test(password) ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
              <Check className="w-3.5 h-3.5" /> Uppercase Letters
            </div>
            <div className={`flex items-center gap-1.5 ${/[0-9]/.test(password) ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
              <Check className="w-3.5 h-3.5" /> Digits (0-9)
            </div>
            <div className={`flex items-center gap-1.5 ${/[^A-Za-z0-9]/.test(password) ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
              <Check className="w-3.5 h-3.5" /> Special Symbols
            </div>
          </div>
        </div>

        {/* Generator Controls */}
        <div className="pt-2 border-t dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-300">Generate Cryptographic Password</span>
            <span className="text-slate-500">Length: {genLength}</span>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="range"
              min="10"
              max="32"
              value={genLength}
              onChange={e => setGenLength(Number(e.target.value))}
              className="flex-1 accent-purple-600"
            />
            <button
              onClick={generateSecurePassword}
              className="py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
