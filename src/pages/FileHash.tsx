import { useState } from 'react';
import { ShieldCheck, Copy, Check, Loader2 } from 'lucide-react';
import { usePageSEO } from '../lib/usePageSEO';

interface HashResult { name: string; size: string; md5: string; sha1: string; sha256: string; }

async function computeHash(buffer: ArrayBuffer, algo: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(algo, buffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function FileHash() {
  usePageSEO('File Hash Calculator', 'Calculate SHA-1 and SHA-256 hashes for any file. Free online file integrity verification tool.');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<HashResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setBusy(true);
    try {
      const buf = await f.arrayBuffer();
      // Note: Web Crypto API doesn't support MD5. We'll use a simple implementation.
      const sha1 = await computeHash(buf, 'SHA-1');
      const sha256 = await computeHash(buf, 'SHA-256');
      // Simple MD5 via SHA-1 truncation notice
      const md5 = sha1.slice(0, 32); // Approximate — real MD5 would need a polyfill

      setResult({
        name: f.name,
        size: f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(1)} KB` : `${(f.size / 1024 / 1024).toFixed(2)} MB`,
        md5: '(Not available in Web Crypto)',
        sha1,
        sha256,
      });
    } catch (e: any) { alert(e?.message || 'Hashing failed'); }
    finally { setBusy(false); }
  };

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">File Hash Calculator</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400">Calculate SHA-1 and SHA-256 hashes to verify file integrity.</p>
      </div>
      {!file ? (
        <label className="w-full max-w-3xl flex flex-col items-center justify-center h-72 border-4 border-dashed border-gray-300 dark:border-slate-700 rounded-2xl cursor-pointer bg-white dark:bg-slate-900 hover:border-green-400 transition-colors">
          <ShieldCheck className="w-16 h-16 text-gray-400 dark:text-slate-500 mb-4" />
          <span className="text-xl font-bold text-gray-900 dark:text-white">Select Any File</span>
          <span className="text-sm text-gray-500 dark:text-slate-400 mt-2">PDF, images, documents, anything</span>
          <input type="file" className="hidden" onChange={handleFile} />
        </label>
      ) : busy ? (
        <div className="flex items-center gap-3 text-gray-600 dark:text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /> Computing hashes…</div>
      ) : result ? (
        <div className="w-full max-w-3xl space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-xl"><span className="text-gray-500 dark:text-slate-400 block text-xs font-medium">File Name</span><span className="font-bold text-gray-900 dark:text-white text-sm truncate block">{result.name}</span></div>
            <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-xl"><span className="text-gray-500 dark:text-slate-400 block text-xs font-medium">File Size</span><span className="font-bold text-gray-900 dark:text-white text-sm">{result.size}</span></div>
          </div>
          {[
            { label: 'SHA-1', value: result.sha1, color: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' },
            { label: 'SHA-256', value: result.sha256, color: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' },
          ].map(h => (
            <div key={h.label} className={`rounded-2xl border p-5 ${h.color}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-gray-700 dark:text-slate-300">{h.label}</span>
                <button onClick={() => copy(h.value, h.label)} className="px-3 py-1 bg-white dark:bg-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-gray-50 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200">
                  {copied === h.label ? <><Check className="w-3 h-3 text-green-500" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
              </div>
              <p className="font-mono text-xs text-gray-600 dark:text-slate-400 break-all select-all">{h.value}</p>
            </div>
          ))}
          <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl text-sm text-blue-800 dark:text-blue-300">
            <strong>Note:</strong> MD5 is not supported by the Web Crypto API. SHA-256 is recommended for security verification.
          </div>
          <button onClick={() => { setFile(null); setResult(null); }} className="w-full py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold">Hash another file</button>
        </div>
      ) : null}
    </div>
  );
}
