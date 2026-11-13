import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Code, Copy, Check } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlStageSwitch } from '../components/pearl/PearlMotion';

export default function ImageToBase64() {
  useSEO('Image To Base64 Online Free | PDF Media Suite', 'Free online Image To Base64 tool. No signup or installation required.');

  usePageSEO('Image to Base64 Converter', 'Convert images to Base64 strings. Get Data URI, raw Base64, HTML img tag, and CSS background code.');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [base64, setBase64] = useState('');
  const [dataUri, setDataUri] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const prefersReduced = useReducedMotion();
  useAutoRevokeUrl(preview);

  const handleDrop = (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setDataUri(result);
      setBase64(result.split(',')[1] || '');
    };
    reader.readAsDataURL(f);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      alert('Copy failed');
    }
  };

  const htmlTag = file ? `<img src="${dataUri}" alt="${file.name}" />` : '';
  const cssUrl = `background-image: url(${dataUri});`;

  return (
    <ToolWorkspaceShell
      title="Image to Base64"
      subtitle="Convert images to Base64 strings, Data URIs, HTML <img> tags, and CSS background snippets."
      categoryLabel="Developer Encoding Studio"
      icon={Code}
      microVariant="convert"
      tone="violet"
      trustNote="Instant local FileReader encoding · Zero server upload"
    >
      <PearlStageSwitch stageKey={!file ? 'drop' : 'encoded'}>
        {!file ? (
          <div className="max-w-2xl mx-auto">
            <FileDropzone
              onDrop={handleDrop}
              multiple={false}
              accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'] }}
              title="Select Image to encode"
              subtitle="Drop PNG, JPG, WebP, GIF, or SVG here"
            />
          </div>
        ) : (
          <div className="w-full max-w-4xl mx-auto space-y-6">
            <div className="pms-glass-panel rounded-3xl p-5 sm:p-6 flex flex-col lg:flex-row gap-6 items-center">
              <div className="flex-shrink-0 pms-checkerboard bg-white dark:bg-slate-950 rounded-2xl border border-[var(--pms-border)] p-3 flex items-center justify-center">
                <img src={preview!} alt={file.name} className="max-h-44 rounded-lg object-contain" />
              </div>
              <div className="flex-1 w-full space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div className="p-3.5 bg-white/75 dark:bg-slate-800/60 border border-[var(--pms-border)] rounded-2xl">
                    <span className="text-gray-500 dark:text-slate-400 block text-[11px] font-bold uppercase tracking-wider">
                      Name
                    </span>
                    <span className="font-bold text-gray-900 dark:text-white truncate block">{file.name}</span>
                  </div>
                  <div className="p-3.5 bg-white/75 dark:bg-slate-800/60 border border-[var(--pms-border)] rounded-2xl">
                    <span className="text-gray-500 dark:text-slate-400 block text-[11px] font-bold uppercase tracking-wider">
                      Type
                    </span>
                    <span className="font-bold text-gray-900 dark:text-white">{file.type || 'image'}</span>
                  </div>
                  <div className="p-3.5 bg-white/75 dark:bg-slate-800/60 border border-[var(--pms-border)] rounded-2xl">
                    <span className="text-gray-500 dark:text-slate-400 block text-[11px] font-bold uppercase tracking-wider">
                      Size
                    </span>
                    <span className="font-bold text-gray-900 dark:text-white">
                      <AnimatedNumber value={file.size / 1024} decimals={1} suffix=" KB" />
                    </span>
                  </div>
                </div>
                <div className="p-3.5 bg-[var(--pms-soft-lavender)]/60 border border-[var(--pms-border)] rounded-2xl flex items-center justify-between">
                  <span className="text-gray-600 dark:text-slate-300 text-xs font-bold uppercase tracking-wider">
                    Base64 Length
                  </span>
                  <span className="font-extrabold text-[var(--pms-violet)] text-sm">
                    <AnimatedNumber value={base64.length} suffix=" chars" />
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {[
                { label: 'Data URI', value: dataUri, id: 'uri' },
                { label: 'Raw Base64', value: base64, id: 'raw' },
                { label: 'HTML <img> Tag', value: htmlTag, id: 'html' },
                { label: 'CSS Background', value: cssUrl, id: 'css' },
              ].map((item, idx) => (
                <motion.div
                  key={item.id}
                  initial={prefersReduced ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: idx * 0.04 }}
                  className="pms-glass-panel rounded-2xl p-4 sm:p-5"
                >
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-sm font-extrabold text-gray-800 dark:text-slate-200">{item.label}</span>
                    <button
                      onClick={() => copyToClipboard(item.value, item.id)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                        copied === item.id
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                          : 'bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] hover:opacity-90'
                      }`}
                    >
                      {copied === item.id ? (
                        <>
                          <Check className="w-3.5 h-3.5" /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copy
                        </>
                      )}
                    </button>
                  </div>
                  <div className="bg-white/80 dark:bg-slate-900/75 border border-[var(--pms-border)] rounded-xl p-3 text-xs font-mono text-gray-700 dark:text-slate-300 max-h-24 overflow-y-auto break-all select-all">
                    {item.value.length > 500 ? item.value.slice(0, 500) + '…' : item.value}
                  </div>
                </motion.div>
              ))}
            </div>

            <button
              onClick={() => {
                setFile(null);
                setPreview(null);
                setBase64('');
                setDataUri('');
              }}
              className="w-full py-3.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-2xl font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Convert another image
            </button>
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
