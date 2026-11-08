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

  // Common dictionary blacklist and leetspeak patterns
  const COMMON_DICTIONARY_WORDS = [
    'password', 'admin', 'qwerty', 'welcome', 'letmein', 'monkey', 'dragon',
    'master', 'sunshine', 'princess', 'football', 'shadow', 'superman', 'trust',
    'iloveyou', 'testing', 'secret', 'passcode', 'security', 'system', 'root',
    'guest', 'operator', 'office', 'computer', 'student', 'school', 'india', 'delhi'
  ];

  const LEET_MAP: Record<string, string> = {
    '@': 'a', '4': 'a', '8': 'b', '(': 'c', '<': 'c', '3': 'e', '9': 'g',
    '#': 'h', '1': 'i', '!': 'i', '|': 'i', '0': 'o', '5': 's', '$': 's',
    '7': 't', '+': 't',
  };

  // Entropy Calculation with Dictionary & Pattern Penalties
  const calculateMetrics = (pwd: string) => {
    if (!pwd || pwd.length === 0) {
      return {
        entropyBits: 0,
        crackTime: 'Instant',
        grade: 'Empty',
        color: 'text-slate-400',
        bg: 'bg-slate-300',
        poolSize: 0,
        vulnerabilities: [] as string[],
      };
    }

    let poolSize = 0;
    if (/[a-z]/.test(pwd)) poolSize += 26;
    if (/[A-Z]/.test(pwd)) poolSize += 26;
    if (/[0-9]/.test(pwd)) poolSize += 10;
    if (/[^A-Za-z0-9]/.test(pwd)) poolSize += 33;

    let baseEntropy = pwd.length * Math.log2(Math.max(2, poolSize));
    const vulnerabilities: string[] = [];

    // 1. Normalize leet speak to standard lowercase
    const normalized = pwd
      .toLowerCase()
      .split('')
      .map(char => LEET_MAP[char] || char)
      .join('');

    // 2. Check for common dictionary words
    let matchedWord = '';
    for (const word of COMMON_DICTIONARY_WORDS) {
      if (normalized.includes(word)) {
        matchedWord = word;
        vulnerabilities.push(`Common dictionary root detected ("${word}")`);
        break;
      }
    }

    // 3. Check for year suffix (e.g. 1990 - 2030)
    if (/(?:19[7-9]\d|20[0-3]\d)/.test(pwd)) {
      vulnerabilities.push('Predictable 4-digit year suffix pattern');
    }

    // 4. Check for sequential keyboard patterns
    const sequences = ['123456', '234567', '345678', 'qwerty', 'asdfgh', 'zxcvbn', 'abcdef'];
    for (const seq of sequences) {
      if (normalized.includes(seq)) {
        vulnerabilities.push(`Sequential keyboard layout ("${seq}")`);
        break;
      }
    }

    // 5. Check for repeated characters
    if (/(.)\1{2,}/.test(pwd)) {
      vulnerabilities.push('Repeated consecutive character sequence');
    }

    // Apply severe entropy degradation for dictionary words / rule attacks
    if (matchedWord) {
      // Hashcat rules crack dictionary + year/symbols in seconds (~2^24 to 2^28 search space)
      baseEntropy = Math.min(baseEntropy, 26 + (vulnerabilities.length > 2 ? 0 : 6));
    } else if (vulnerabilities.length > 0) {
      baseEntropy = Math.max(15, baseEntropy * 0.65);
    }

    const entropyBits = Math.round(baseEntropy);

    // Crack time estimation based on realistic attack type:
    let crackTime = 'Instant';
    if (matchedWord) {
      crackTime = '< 2 Seconds (Dictionary Rule Attack)';
    } else if (entropyBits >= 85) {
      crackTime = 'Centuries (Immune to GPU Brute-Force)';
    } else if (entropyBits >= 72) {
      crackTime = '12,000+ Years';
    } else if (entropyBits >= 60) {
      crackTime = '450 Years';
    } else if (entropyBits >= 50) {
      crackTime = '8 Months';
    } else if (entropyBits >= 40) {
      crackTime = '18 Hours';
    } else if (entropyBits >= 30) {
      crackTime = '15 Minutes';
    } else {
      crackTime = '< 3 Seconds';
    }

    let grade = 'Weak';
    let color = 'text-red-600';
    let bg = 'bg-red-500';

    if (matchedWord) {
      grade = 'Critical (Dictionary Vulnerability)';
      color = 'text-red-600';
      bg = 'bg-red-600';
    } else if (entropyBits >= 75) {
      grade = 'Military Grade';
      color = 'text-emerald-600';
      bg = 'bg-emerald-500';
    } else if (entropyBits >= 60) {
      grade = 'Very Strong';
      color = 'text-emerald-500';
      bg = 'bg-emerald-500';
    } else if (entropyBits >= 45) {
      grade = 'Moderate';
      color = 'text-amber-500';
      bg = 'bg-amber-500';
    } else if (entropyBits >= 30) {
      grade = 'Weak';
      color = 'text-orange-500';
      bg = 'bg-orange-500';
    } else {
      grade = 'Critical Vulnerability';
      color = 'text-red-600';
      bg = 'bg-red-600';
    }

    return { entropyBits, crackTime, grade, color, bg, poolSize, vulnerabilities };
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

        {/* Vulnerabilities & Rule Warnings */}
        {metrics.vulnerabilities.length > 0 && (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-200 dark:border-amber-800/60 space-y-2 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Dictionary & Pattern Vulnerabilities Found:</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-amber-700 dark:text-amber-400/90 text-[11px]">
              {metrics.vulnerabilities.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>
            <p className="text-[10px] text-amber-600 dark:text-amber-500 pt-1">
              GPU attack tools like Hashcat apply rule-based permutation to test millions of dictionary substitutions per second.
            </p>
          </div>
        )}

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
