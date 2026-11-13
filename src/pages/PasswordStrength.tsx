import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { 
  Lock, AlertTriangle, Copy, Check, 
  Sparkles, Cpu, Server, Zap
} from 'lucide-react';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber } from '../components/pearl/PearlMotion';

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
  const prefersReduced = useReducedMotion();

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
    let color = 'text-rose-600 dark:text-rose-400';
    let bg = 'bg-rose-500';

    if (matchedWord) {
      grade = 'Critical (Dictionary Vulnerability)';
      color = 'text-rose-600 dark:text-rose-400';
      bg = 'bg-rose-600';
    } else if (entropyBits >= 75) {
      grade = 'Military Grade';
      color = 'text-emerald-600 dark:text-emerald-400';
      bg = 'bg-emerald-500';
    } else if (entropyBits >= 60) {
      grade = 'Very Strong';
      color = 'text-emerald-500 dark:text-emerald-400';
      bg = 'bg-emerald-500';
    } else if (entropyBits >= 45) {
      grade = 'Moderate';
      color = 'text-amber-500 dark:text-amber-400';
      bg = 'bg-amber-500';
    } else if (entropyBits >= 30) {
      grade = 'Weak';
      color = 'text-orange-500 dark:text-orange-400';
      bg = 'bg-orange-500';
    } else {
      grade = 'Critical Vulnerability';
      color = 'text-rose-600 dark:text-rose-400';
      bg = 'bg-rose-600';
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
    <ToolWorkspaceShell
      title="Enterprise Password Auditor & Entropy Studio"
      subtitle="Audit password security against GPU cluster brute-force benchmarks (Hashcat / RTX 4090) and calculate entropy bits."
      categoryLabel="Cryptographic Entropy Lab"
      icon={Lock}
      microVariant="security"
      tone="violet"
      trustNote="Zero network calls · WebCrypto CSPRNG password generator"
    >
      <div className="w-full max-w-2xl mx-auto pms-glass-panel rounded-3xl p-6 sm:p-8 space-y-6">
        {/* Input Field */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Test Password
            </label>
            <motion.button
              whileTap={prefersReduced ? undefined : { scale: 0.94 }}
              onClick={copyPassword}
              className="text-xs font-bold text-[var(--pms-violet)] hover:opacity-80 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--pms-soft-lavender)] border border-[var(--pms-border)] cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </motion.button>
          </div>

          <div className="relative">
            <input
              type="text"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3.5 text-base font-mono rounded-2xl border border-[var(--pms-border)] bg-white/80 dark:bg-slate-800/80 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="Enter password..."
            />
          </div>
        </div>

        {/* Strength Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-500 dark:text-slate-400">Security Grade:</span>
            <span className={`font-extrabold px-2.5 py-0.5 rounded-full bg-white/80 dark:bg-slate-800 border border-[var(--pms-border)] ${metrics.color}`}>
              {metrics.grade}
            </span>
          </div>
          <div className="w-full h-3 bg-slate-200/80 dark:bg-slate-800 rounded-full overflow-hidden">
            <motion.div
              animate={{ width: `${Math.min((metrics.entropyBits / 80) * 100, 100)}%` }}
              transition={prefersReduced ? { duration: 0 } : { duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className={`h-full ${metrics.bg} rounded-full`}
            />
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 bg-white/75 dark:bg-slate-800/60 rounded-2xl border border-[var(--pms-border)] text-center">
            <div className="w-9 h-9 rounded-xl bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] flex items-center justify-center mx-auto mb-1.5">
              <Cpu className="w-4 h-4" />
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Information Entropy</span>
            <p className="text-base font-extrabold text-slate-800 dark:text-slate-100">
              <AnimatedNumber value={metrics.entropyBits} suffix=" Bits" />
            </p>
          </div>

          <div className="p-4 bg-white/75 dark:bg-slate-800/60 rounded-2xl border border-[var(--pms-border)] text-center">
            <div className="w-9 h-9 rounded-xl bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] flex items-center justify-center mx-auto mb-1.5">
              <Server className="w-4 h-4" />
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">GPU Crack Time</span>
            <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 truncate" title={metrics.crackTime}>
              {metrics.crackTime}
            </p>
          </div>

          <div className="p-4 bg-white/75 dark:bg-slate-800/60 rounded-2xl border border-[var(--pms-border)] text-center">
            <div className="w-9 h-9 rounded-xl bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] flex items-center justify-center mx-auto mb-1.5">
              <Zap className="w-4 h-4" />
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Character Pool</span>
            <p className="text-base font-extrabold text-slate-800 dark:text-slate-100">
              <AnimatedNumber value={metrics.poolSize} suffix=" Symbols" />
            </p>
          </div>
        </div>

        {/* Checklist */}
        <div className="p-4 bg-white/70 dark:bg-slate-800/40 rounded-2xl border border-[var(--pms-border)] space-y-2.5 text-xs">
          <span className="font-bold text-slate-700 dark:text-slate-300 block">Complexity Audit:</span>
          <div className="grid grid-cols-2 gap-2">
            {[
              { ok: password.length >= 12, label: '12+ Characters' },
              { ok: /[A-Z]/.test(password), label: 'Uppercase Letters' },
              { ok: /[0-9]/.test(password), label: 'Digits (0-9)' },
              { ok: /[^A-Za-z0-9]/.test(password), label: 'Special Symbols' },
            ].map((item) => (
              <div
                key={item.label}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-colors ${
                  item.ok
                    ? 'bg-[var(--pms-soft-mint)] border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 font-bold'
                    : 'bg-slate-50/70 dark:bg-slate-900/40 border-[var(--pms-border)] text-slate-400'
                }`}
              >
                <Check className="w-3.5 h-3.5 shrink-0" /> {item.label}
              </div>
            ))}
          </div>
        </div>

        {/* Vulnerabilities & Rule Warnings */}
        <AnimatePresence>
          {metrics.vulnerabilities.length > 0 && (
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReduced ? undefined : { opacity: 0, y: -6 }}
              className="p-4 bg-amber-50/90 dark:bg-amber-950/40 rounded-2xl border border-amber-200 dark:border-amber-800/60 space-y-2 text-xs"
            >
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
            </motion.div>
          )}
        </AnimatePresence>

        {/* Generator Controls */}
        <div className="pt-3 border-t border-[var(--pms-border)] space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-300">Generate Cryptographic Password</span>
            <span className="px-2.5 py-0.5 rounded-full font-bold bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] border border-[var(--pms-border)]">
              Length: <AnimatedNumber value={genLength} />
            </span>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="range"
              min="10"
              max="32"
              value={genLength}
              onChange={e => setGenLength(Number(e.target.value))}
              className="flex-1 accent-violet-600"
            />
            <motion.button
              whileHover={prefersReduced ? undefined : { scale: 1.02 }}
              whileTap={prefersReduced ? undefined : { scale: 0.97 }}
              onClick={generateSecurePassword}
              className="pms-btn-primary py-2.5 px-5 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generate
            </motion.button>
          </div>
        </div>
      </div>
    </ToolWorkspaceShell>
  );
}
