import { useState } from 'react';
import { PDFDocument } from 'pdf-lib-plus-encrypt';
import { Download, FileText, Lock } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';

export default function ProtectPDF() {
  usePageSEO('Protect PDF with Password', 'Add password protection and encryption to PDF files. Free online PDF locker — 256-bit AES encryption.');
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [protectedUrl, setProtectedUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setProtectedUrl(null);
      setPassword('');
      setErrorMsg(null);
    }
  };

  const protectPdf = async () => {
    if (!file || !password) return;
    
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      await pdfDoc.encrypt({
        userPassword: password,
        ownerPassword: password,
        permissions: { printing: 'highResolution', modifying: false, copying: false },
      });

      const finalBytes = await pdfDoc.save();
      const blob = new Blob([finalBytes], { type: 'application/pdf' });
      setProtectedUrl(URL.createObjectURL(blob));
    } catch (error) {
      console.error("Error protecting PDF:", error);
      const message = error instanceof Error ? error.message : 'Failed to protect PDF.';
      setErrorMsg(message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Protect PDF file</h1>
        <p className="text-xl text-gray-600">Encrypt your PDF with a password to keep sensitive data confidential.</p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-4 p-6 bg-gray-50 rounded-xl border border-gray-200 mb-8">
            <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center shrink-0">
              <FileText className="w-8 h-8" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-semibold text-gray-900 truncate">{file.name}</p>
              <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>

          {!protectedUrl ? (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type a password to protect your PDF
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-shadow"
                    placeholder="Enter password"
                  />
                </div>
                {errorMsg && <p className="mt-2 text-sm text-red-600">{errorMsg}</p>}
              </div>

              <div className="flex gap-4">
                <button
                  onClick={protectPdf}
                  disabled={isProcessing || !password}
                  className="flex-1 py-4 bg-purple-600 text-white text-lg font-bold rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50 shadow-md"
                >
                  {isProcessing ? 'Protecting...' : 'Protect PDF'}
                </button>
                <button
                  onClick={() => { setFile(null); setPassword(''); setErrorMsg(null); }}
                  className="px-6 py-4 bg-gray-100 text-gray-700 text-lg font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 text-center">
              <div className="p-8 bg-green-50 rounded-xl border border-green-200">
                <h3 className="text-2xl font-bold text-green-800 mb-4">PDF protected successfully!</h3>
                <a
                  href={protectedUrl}
                  download={`protected_${file.name}`}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 transition-colors shadow-md"
                >
                  <Download className="w-6 h-6" />
                  Download protected PDF
                </a>
              </div>
              <button
                onClick={() => { setFile(null); setProtectedUrl(null); setPassword(''); }}
                className="text-gray-600 hover:text-gray-900 font-medium"
              >
                Protect another PDF
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
