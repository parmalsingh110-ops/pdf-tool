import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileText, Maximize2, Check, ChevronRight } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

// Quick preset sizes in bytes
const PRESETS = [
  { label: '100 KB', bytes: 100 * 1024 },
  { label: '200 KB', bytes: 200 * 1024 },
  { label: '500 KB', bytes: 500 * 1024 },
  { label: '1 MB',   bytes: 1 * 1024 * 1024 },
  { label: '2 MB',   bytes: 2 * 1024 * 1024 },
  { label: '5 MB',   bytes: 5 * 1024 * 1024 },
  { label: '10 MB',  bytes: 10 * 1024 * 1024 },
  { label: '20 MB',  bytes: 20 * 1024 * 1024 },
];

const FAQS = [
  { q: 'PDF size increase karna kyon zarori hai?', a: 'Bahut se government aur sarkari portals (SSC, UPSC, Railway, bank forms) minimum file size maangte hain jaise "PDF must be between 100 KB and 500 KB". Agar aapki PDF us limit se chhoti hai, toh ye tool use karein.' },
  { q: 'Increase karne se PDF ki quality kharab hoti hai kya?', a: 'Bilkul nahi. Ye tool PDF ke end mein invisible padding append karta hai jo koi bhi PDF reader ignore karta hai. Document ka content, text, images — sab kuch 100% same rehta hai.' },
  { q: 'Kitni badi PDF ban sakti hai?', a: 'Is tool se aap PDF ko 100 KB se lekar 100 MB tak badhaa sakte hain. Government portals ke liye 100 KB, 200 KB, 500 KB, 1 MB, 2 MB — sab presets available hain.' },
  { q: 'Kya mere document ka data safe hai?', a: 'Haan — 100% safe. Ye tool poori tarah aapke browser mein kaam karta hai. Aapki PDF kisi server par upload nahi hoti.' },
  { q: 'Size badhane ke baad PDF open hogi kya?', a: 'Haan, sab PDF readers (Adobe, Chrome, browser, mobile apps) is padded PDF ko perfectly open karenge. Trailing data ko PDF specification ke anusaar ignore kiya jaata hai.' },
];

export default function IncreasePdfSize() {
  useSEO(
    'Increase PDF File Size Online Free — Exact Target KB & MB',
    'Increase PDF file size to exact KB or MB online free. Set target to 100 KB, 200 KB, 500 KB, 1 MB, 2 MB, 5 MB, 10 MB or 20 MB. Perfect for government portals, SSC, UPSC, Railway forms. No quality loss, no signup.'
  );

  usePageSEO(
    'Increase PDF File Size Online Free — PDF Size Increaser',
    'Increase PDF file size to exact KB or MB online free. Set target to 100 KB, 200 KB, 500 KB, 1 MB, 2 MB, 5 MB, 10 MB or 20 MB. Perfect for government portals, SSC, UPSC, Railway forms. No quality loss, no signup.',
    'increase pdf size, pdf size increase online, pdf file size increase, increase pdf size in mb, pdf kb increase, pdf size increaser, pdf size increase to 200kb, pdf size increase up to 10mb',
    '/increase-size'
  );

  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [targetBytes, setTargetBytes] = useState<number>(1 * 1024 * 1024); // default 1 MB
  const [inputMode, setInputMode] = useState<'kb' | 'mb'>('kb');
  const [inputValue, setInputValue] = useState<string>('1024'); // KB value
  const [compressedUrl, setCompressedUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<{ original: number; newSize: number } | null>(null);

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      if (compressedUrl) URL.revokeObjectURL(compressedUrl);
      setFile(acceptedFiles[0]);
      setCompressedUrl(null);
      setStats(null);
      // Pre-fill to file size + 10%
      const suggestedKB = Math.ceil((acceptedFiles[0].size * 1.1) / 1024);
      setInputMode('kb');
      setInputValue(String(suggestedKB));
      setTargetBytes(suggestedKB * 1024);
    }
  };

  const handlePreset = (bytes: number) => {
    setTargetBytes(bytes);
    if (bytes < 1024 * 1024) {
      setInputMode('kb');
      setInputValue(String(Math.round(bytes / 1024)));
    } else {
      setInputMode('mb');
      setInputValue(String(bytes / (1024 * 1024)));
    }
    setCompressedUrl(null);
    setStats(null);
  };

  const handleInputChange = (val: string) => {
    setInputValue(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      setTargetBytes(inputMode === 'kb' ? Math.round(num * 1024) : Math.round(num * 1024 * 1024));
    }
  };

  const toggleMode = (mode: 'kb' | 'mb') => {
    if (mode === inputMode) return;
    const num = parseFloat(inputValue);
    if (!isNaN(num) && num > 0) {
      if (mode === 'mb') {
        setInputValue(String(Math.round(num / 1024 * 100) / 100));
      } else {
        setInputValue(String(Math.round(num * 1024)));
      }
    }
    setInputMode(mode);
  };

  const increasePdfSize = async () => {
    if (!file) return;
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const origBytes = new Uint8Array(arrayBuffer);
      const targetBytesLength = targetBytes;

      if (origBytes.length >= targetBytesLength) {
        const currentKB = Math.round(origBytes.length / 1024);
        alert(`File is already ${currentKB} KB, which is larger than your target. Please choose a larger target size.`);
        setIsProcessing(false);
        return;
      }

      if (targetBytesLength > 100 * 1024 * 1024) {
        alert('Maximum target size allowed is 100 MB to prevent browser memory crashes.');
        setIsProcessing(false);
        return;
      }

      const finalBytes = new Uint8Array(targetBytesLength);
      finalBytes.set(origBytes, 0);

      // Fill remainder with pseudo-random data (non-compressible)
      const chunkSize = 1024 * 1024;
      for (let i = origBytes.length; i < targetBytesLength; i += chunkSize) {
        const end = Math.min(i + chunkSize, targetBytesLength);
        for (let j = i; j < end; j++) {
          finalBytes[j] = Math.floor(Math.random() * 256);
        }
        if (i % (5 * 1024 * 1024) === 0) {
          await new Promise(r => setTimeout(r, 0));
        }
      }

      const blob = new Blob([finalBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setStats({ original: file.size, newSize: blob.size });
      setCompressedUrl(url);
    } catch (error: any) {
      alert(`Processing failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="flex-1 flex flex-col items-center p-4 sm:p-8 bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 min-h-screen">
      {/* Header */}
      <div className="text-center mb-8 max-w-3xl mx-auto px-4">
        <div className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-xs font-bold px-3 py-1 rounded-full mb-4 border border-blue-200 dark:border-blue-800">
          📄 GOVERNMENT PORTAL & EXAM FORM READY
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-3 leading-tight">
          Increase PDF File Size Online
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
          Set your PDF to <strong>exact 100 KB, 200 KB, 500 KB, 1 MB, 2 MB, 5 MB or 10 MB</strong> — perfect for SSC, UPSC, Railway, bank aur government portals. No quality loss.{' '}
          <span className="text-blue-600 font-semibold">Free, private, no signup needed.</span>
        </p>
      </div>

      <div className="w-full max-w-4xl space-y-5">
        {!file ? (
          <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file to increase size" />
        ) : (
          <>
            {/* File info */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 dark:text-white truncate">{file.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  <span>Current size: </span>
                  <strong className="notranslate" translate="no">{formatSize(file.size)}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setFile(null); setCompressedUrl(null); setStats(null); }}
                className="text-xs text-slate-500 hover:text-rose-500 dark:text-slate-400 font-medium shrink-0 notranslate"
                translate="no"
              >
                <span>✕ Change</span>
              </button>
            </div>

            {!compressedUrl ? (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-5">
                {/* Quick Presets */}
                <div>
                  <label className="block text-sm font-bold text-slate-900 dark:text-white mb-3">
                    ⚡ Quick Presets — One Click Select
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PRESETS.map(p => {
                      const isActive = targetBytes === p.bytes;
                      const tooSmall = file.size >= p.bytes;
                      return (
                        <button
                          key={p.label}
                          onClick={() => !tooSmall && handlePreset(p.bytes)}
                          disabled={tooSmall}
                          title={tooSmall ? `File already ≥ ${p.label}` : `Set target to ${p.label}`}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                            isActive
                              ? 'border-blue-500 bg-blue-500 text-white shadow-md scale-105'
                              : tooSmall
                              ? 'border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed line-through'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40'
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                    Greyed out = your file is already that size or larger.
                  </p>
                </div>

                {/* Custom size input with KB/MB toggle */}
                <div>
                  <label className="block text-sm font-bold text-slate-900 dark:text-white mb-2">
                    🎯 Or set Custom Target Size
                  </label>
                  <div className="flex items-stretch gap-2">
                    {/* KB/MB Toggle */}
                    <div className="flex rounded-xl border border-slate-300 dark:border-slate-600 overflow-hidden shrink-0">
                      <button
                        onClick={() => toggleMode('kb')}
                        className={`px-4 py-2.5 text-sm font-bold transition-colors ${inputMode === 'kb' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-blue-50'}`}
                      >
                        KB
                      </button>
                      <button
                        onClick={() => toggleMode('mb')}
                        className={`px-4 py-2.5 text-sm font-bold transition-colors ${inputMode === 'mb' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-blue-50'}`}
                      >
                        MB
                      </button>
                    </div>
                    <input
                      type="number"
                      min={0.1}
                      step={inputMode === 'kb' ? 1 : 0.1}
                      value={inputValue}
                      onChange={e => handleInputChange(e.target.value)}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base font-medium"
                      placeholder={inputMode === 'kb' ? 'e.g. 500' : 'e.g. 2'}
                    />
                    <div className="flex items-center px-3 bg-slate-100 dark:bg-slate-700 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-bold text-slate-600 dark:text-slate-300 shrink-0">
                      {inputMode.toUpperCase()}
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 notranslate" translate="no">
                    <span>Target: </span>
                    <strong className="text-blue-600 dark:text-blue-400">{formatSize(targetBytes)}</strong>
                    {file && (
                      <span>
                        <span> · Current file: </span>
                        <strong>{formatSize(file.size)}</strong>
                        <span> · Will add: </span>
                        <strong>{formatSize(Math.max(0, targetBytes - file.size))}</strong>
                      </span>
                    )}
                  </p>
                </div>

                {/* Increase button */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={increasePdfSize}
                    disabled={isProcessing || !file || file.size >= targetBytes}
                    className="flex-1 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-base font-extrabold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 shadow-md flex items-center justify-center gap-2 notranslate"
                    translate="no"
                  >
                    {isProcessing ? (
                      <span className="flex items-center gap-2">
                        <span className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin inline-block" />
                        <span>Increasing Size…</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Maximize2 className="w-5 h-5" />
                        <span>Increase PDF Size</span>
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="px-5 py-4 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors notranslate"
                    translate="no"
                  >
                    <span>Cancel</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Success state */
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/30 rounded-2xl border border-blue-200 dark:border-blue-800 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center"><Check className="w-5 h-5" /></div>
                  <div>
                    <h3 className="font-extrabold text-blue-800 dark:text-blue-300 text-lg">Size Increased Successfully!</h3>
                    <p className="text-xs text-blue-600 dark:text-blue-400">Document quality is 100% untouched — only invisible padding was added.</p>
                  </div>
                </div>
                {stats && (
                  <div className="flex justify-center gap-10 mb-5 p-4 bg-white dark:bg-slate-800 rounded-xl border border-blue-100 dark:border-blue-900 shadow-sm text-center notranslate" translate="no">
                    <div>
                      <p className="text-xs text-slate-500 mb-1"><span>Original</span></p>
                      <p className="font-bold text-slate-900 dark:text-white text-lg notranslate">{formatSize(stats.original)}</p>
                    </div>
                    <div className="text-2xl text-blue-400 flex items-center notranslate">→</div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1"><span>New Size</span></p>
                      <p className="font-bold text-blue-700 dark:text-blue-300 text-xl notranslate">{formatSize(stats.newSize)}</p>
                    </div>
                  </div>
                )}
                <a
                  href={compressedUrl!}
                  download={`increased_${file.name}`}
                  className="flex items-center justify-center gap-2 w-full py-3.5 bg-blue-600 text-white font-extrabold rounded-xl hover:bg-blue-700 transition-colors shadow-md notranslate"
                  translate="no"
                >
                  <Download className="w-5 h-5" />
                  <span>Download Increased PDF</span>
                </a>
                <button
                  type="button"
                  onClick={() => { if (compressedUrl) URL.revokeObjectURL(compressedUrl); setFile(null); setCompressedUrl(null); setStats(null); }}
                  className="mt-3 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-medium mx-auto block notranslate"
                  translate="no"
                >
                  <span>↩ Process another PDF</span>
                </button>

                {/* Cross-link after download */}
                <div className="mt-6 border-t border-blue-100 dark:border-blue-900 pt-4">
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-3">🎓 Need more for your exam form?</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { to: '/id-card-joiner', label: '🪪 ID Card Joiner', desc: 'Aadhaar/PAN front & back' },
                      { to: '/target-compress', label: '🎯 Compress to KB', desc: 'Set exact size limit' },
                      { to: '/passport-photo-sheet', label: '🖼️ Passport Photos', desc: '8 photos on 4×6 sheet' },
                      { to: '/exact-image-size', label: '⚖️ Photo to 20–50KB', desc: 'For exam form photos' },
                    ].map(item => (
                      <Link key={item.to} to={item.to} className="bg-white dark:bg-slate-800 rounded-xl p-2.5 border border-blue-100 dark:border-blue-900 hover:border-blue-400 hover:shadow-md transition-all group">
                        <p className="text-[11px] font-bold text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">{item.label}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{item.desc}</p>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Related Tools (shown on upload screen too) */}
        {!file && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20 rounded-2xl border border-blue-100 dark:border-blue-900 p-5">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">🎓 Govt Portal &amp; Exam Form Toolkit — All Free</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { to: '/id-card-joiner', label: '🪪 ID Card Joiner', desc: 'Aadhaar/PAN front & back on A4' },
                { to: '/target-compress', label: '🎯 Target Compress PDF', desc: 'Compress to exact KB' },
                { to: '/passport-photo-sheet', label: '🖼️ Passport Photo Sheet', desc: '8 photos on 4×6 print' },
                { to: '/exact-image-size', label: '⚖️ Exact Image Size', desc: 'Photo to 20KB–50KB' },
              ].map(item => (
                <Link key={item.to} to={item.to} className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-blue-100 dark:border-blue-900 hover:border-blue-400 hover:shadow-md transition-all group">
                  <p className="text-xs font-bold text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">{item.label}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{item.desc}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* FAQ */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {FAQS.map((item, i) => (
              <details key={i} className="group border-b border-slate-100 dark:border-slate-700 pb-3 last:border-0 last:pb-0">
                <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-semibold text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400">
                  {item.q}
                  <ChevronRight className="w-4 h-4 shrink-0 ml-2 group-open:rotate-90 transition-transform" />
                </summary>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
