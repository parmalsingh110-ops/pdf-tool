import { useState } from 'react';
import { Code, Copy, Check } from 'lucide-react';
import { usePageSEO } from '../lib/usePageSEO';

export default function ImageToBase64() {
  usePageSEO('Image to Base64 Converter', 'Convert images to Base64 strings. Get Data URI, raw Base64, HTML img tag, and CSS background code.');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [base64, setBase64] = useState('');
  const [dataUri, setDataUri] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
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
    } catch { alert('Copy failed'); }
  };

  const htmlTag = file ? `<img src="${dataUri}" alt="${file.name}" />` : '';
  const cssUrl = `background-image: url(${dataUri});`;

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Image to Base64</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400">Convert images to Base64 strings for embedding in HTML, CSS, or JSON.</p>
      </div>
      {!file ? (
        <label className="w-full max-w-3xl flex flex-col items-center justify-center h-72 border-4 border-dashed border-gray-300 dark:border-slate-700 rounded-2xl cursor-pointer bg-white dark:bg-slate-900 hover:border-violet-400 transition-colors">
          <Code className="w-16 h-16 text-gray-400 dark:text-slate-500 mb-4" />
          <span className="text-xl font-bold text-gray-900 dark:text-white">Select Image</span>
          <span className="text-sm text-gray-500 dark:text-slate-400 mt-2">Any image file</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </label>
      ) : (
        <div className="w-full max-w-4xl space-y-6">
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-shrink-0 bg-gray-100 dark:bg-slate-800 rounded-2xl p-4 flex items-center justify-center">
              <img src={preview!} className="max-h-48 rounded-lg" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl"><span className="text-gray-500 dark:text-slate-400 block text-xs">Name</span><span className="font-bold text-gray-900 dark:text-white truncate">{file.name}</span></div>
                <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl"><span className="text-gray-500 dark:text-slate-400 block text-xs">Type</span><span className="font-bold text-gray-900 dark:text-white">{file.type}</span></div>
                <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl"><span className="text-gray-500 dark:text-slate-400 block text-xs">Size</span><span className="font-bold text-gray-900 dark:text-white">{(file.size/1024).toFixed(1)} KB</span></div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl"><span className="text-gray-500 dark:text-slate-400 block text-xs">Base64 Length</span><span className="font-bold text-gray-900 dark:text-white">{base64.length.toLocaleString()} chars</span></div>
            </div>
          </div>
          {[
            { label: 'Data URI', value: dataUri, id: 'uri' },
            { label: 'Raw Base64', value: base64, id: 'raw' },
            { label: 'HTML <img> Tag', value: htmlTag, id: 'html' },
            { label: 'CSS Background', value: cssUrl, id: 'css' },
          ].map(item => (
            <div key={item.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-gray-700 dark:text-slate-300">{item.label}</span>
                <button onClick={() => copyToClipboard(item.value, item.id)} className="px-3 py-1 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-violet-100 dark:hover:bg-violet-900">
                  {copied === item.id ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
              </div>
              <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 text-xs font-mono text-gray-600 dark:text-slate-400 max-h-24 overflow-y-auto break-all select-all">{item.value.length > 500 ? item.value.slice(0, 500) + '…' : item.value}</div>
            </div>
          ))}
          <button onClick={() => { setFile(null); setPreview(null); setBase64(''); setDataUri(''); }} className="w-full py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-semibold">Convert another image</button>
        </div>
      )}
    </div>
  );
}
