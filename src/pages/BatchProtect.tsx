import React, { useState, useEffect } from 'react';
import { Lock, Download, Loader2, Package } from 'lucide-react';
import { PDFDocument } from 'pdf-lib-plus-encrypt';
import JSZip from 'jszip';
import FileDropzone from '../components/FileDropzone';
import { useSEO } from '../hooks/useSEO';
import { useToast } from '../components/Toast';

export default function BatchProtect() {
  useSEO('Batch Protect Online Free | PDF Media Suite', 'Free online Batch Protect tool. No signup or installation required.');

  const [files, setFiles] = useState<File[]>([]);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const toast = useToast();

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  const handleDrop = (acceptedFiles: File[]) => {
    setFiles(acceptedFiles);
    setResultUrl(null);
  };

  const process = async () => {
    if (files.length === 0 || !password.trim()) return;
    setBusy(true);
    try {
      const zip = new JSZip();
      
      for (let i = 0; i < files.length; i++) {
        setProgress(`Protecting ${i + 1} of ${files.length}: ${files[i].name}`);
        const buf = await files[i].arrayBuffer();
        
        const pdfDoc = await PDFDocument.load(buf);
        await pdfDoc.encrypt({
          userPassword: password,
          ownerPassword: password,
        });
        const encrypted = await pdfDoc.save();
        zip.file(`protected_${files[i].name}`, encrypted);
      }
      
      setProgress('Creating ZIP archive…');
      const blob = await zip.generateAsync({ type: 'blob' });
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultUrl(URL.createObjectURL(blob));
      setProgress(`Done! ${files.length} file(s) protected.`);
      toast.success(`Successfully password-protected ${files.length} file(s)!`);
    } catch (e: any) {
      toast.error(e?.message || 'Batch protection failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Batch Protect</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400">Protect multiple PDF files at once with a single password.</p>
      </div>
      {files.length === 0 ? (
        <FileDropzone onDrop={handleDrop} multiple={true} title="Select PDF files" subtitle="Drop multiple PDFs at once" />
      ) : (
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8">
          <div className="mb-4">
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-2">{files.length} file(s) selected</p>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {files.map((f, i) => (
                <div key={i} className="text-xs text-gray-700 dark:text-slate-300 bg-gray-50 dark:bg-slate-800 rounded px-2 py-1 truncate">{f.name}</div>
              ))}
            </div>
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Enter password for all PDFs" className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-purple-500 outline-none" />
          </div>
          {progress && <p className="text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 rounded-lg px-4 py-2 mb-4">{progress}</p>}
          <div className="flex gap-3">
            <button onClick={process} disabled={busy || !password.trim()} className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
              {busy ? 'Protecting…' : 'Protect All PDFs'}
            </button>
            <button onClick={() => { setFiles([]); setResultUrl(null); }} className="px-5 py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700">Cancel</button>
          </div>
          {resultUrl && (
            <div className="mt-6 p-6 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 dark:border-green-800 text-center">
              <a href={resultUrl} download="protected_pdfs.zip" className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700">
                <Package className="w-5 h-5" /> Download Protected ZIP
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
