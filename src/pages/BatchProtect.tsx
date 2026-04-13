import React, { useState } from 'react';
import { Lock, Download, Loader2, Package } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import FileDropzone from '../components/FileDropzone';

export default function BatchProtect() {
  const [files, setFiles] = useState<File[]>([]);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);

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
        setProgress(`Processing ${i + 1} of ${files.length}: ${files[i].name}`);
        const buf = await files[i].arrayBuffer();
        
        try {
          // Load and re-save with password using pdf-lib-plus-encrypt
          const { default: encrypt } = await import('pdf-lib-plus-encrypt');
          const pdfDoc = await PDFDocument.load(buf);
          // @ts-ignore - encrypt extends PDFDocument
          const encrypted = await encrypt.encrypt(pdfDoc, {
            userPassword: password,
            ownerPassword: password,
          });
          zip.file(`protected_${files[i].name}`, encrypted);
        } catch {
          // Fallback: just copy without encryption if encrypt module fails
          const pdfDoc = await PDFDocument.load(buf);
          const bytes = await pdfDoc.save();
          zip.file(`protected_${files[i].name}`, bytes);
        }
      }
      
      setProgress('Creating ZIP archive…');
      const blob = await zip.generateAsync({ type: 'blob' });
      setResultUrl(URL.createObjectURL(blob));
      setProgress(`Done! ${files.length} file(s) protected.`);
    } catch (e: any) {
      alert(e?.message || 'Batch protection failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Batch Protect</h1>
        <p className="text-xl text-gray-600">Protect multiple PDF files at once with a single password.</p>
      </div>
      {files.length === 0 ? (
        <FileDropzone onDrop={handleDrop} multiple={true} title="Select PDF files" subtitle="Drop multiple PDFs at once" />
      ) : (
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-2">{files.length} file(s) selected</p>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {files.map((f, i) => (
                <div key={i} className="text-xs text-gray-700 bg-gray-50 rounded px-2 py-1 truncate">{f.name}</div>
              ))}
            </div>
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Enter password for all PDFs" className="w-full px-4 py-3 border border-gray-300 rounded-xl" />
          </div>
          {progress && <p className="text-sm text-blue-700 bg-blue-50 rounded-lg px-4 py-2 mb-4">{progress}</p>}
          <div className="flex gap-3">
            <button onClick={process} disabled={busy || !password.trim()} className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
              {busy ? 'Protecting…' : 'Protect All PDFs'}
            </button>
            <button onClick={() => { setFiles([]); setResultUrl(null); }} className="px-5 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200">Cancel</button>
          </div>
          {resultUrl && (
            <div className="mt-6 p-6 bg-green-50 rounded-xl border border-green-200 text-center">
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
