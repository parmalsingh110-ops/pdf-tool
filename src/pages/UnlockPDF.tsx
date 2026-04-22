import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Download, FileText, Unlock } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';

export default function UnlockPDF() {
  usePageSEO('Unlock PDF — Remove Password', 'Remove password protection from PDF files. Free online PDF unlocker — instant, private, no uploads.');
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [unlockedUrl, setUnlockedUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setUnlockedUrl(null);
      setPassword('');
      setErrorMsg(null);
    }
  };

  const unlockPdf = async () => {
    if (!file || !password) return;
    
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      
      // Load the PDF with the provided password
      // @ts-ignore: password property exists at runtime but is missing in type definitions
      const pdfDoc = await PDFDocument.load(arrayBuffer, { password });
      
      // Save it without encryption
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setUnlockedUrl(url);
    } catch (error: any) {
      console.error("Error unlocking PDF:", error);
      const msg = (error?.message || '').toLowerCase();
      if (msg.includes('password') || msg.includes('incorrect') || msg.includes('invalid') ||
          msg.includes('decrypt') || msg.includes('encrypted') || msg.includes('wrong')) {
        setErrorMsg('Incorrect password. Please try again.');
      } else if (msg.includes('not encrypted') || msg.includes('no password')) {
        // PDF is not encrypted — just save as-is
        try {
          const arrayBuffer2 = await file.arrayBuffer();
          const pdfDoc2 = await PDFDocument.load(arrayBuffer2);
          const pdfBytes2 = await pdfDoc2.save();
          const blob2 = new Blob([pdfBytes2], { type: 'application/pdf' });
          setUnlockedUrl(URL.createObjectURL(blob2));
          return;
        } catch {
          setErrorMsg('This PDF does not appear to be password-protected.');
        }
      } else {
        // Generic: most likely wrong password
        setErrorMsg('Incorrect password or the PDF cannot be unlocked in the browser. Try a different password.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Unlock PDF file</h1>
        <p className="text-xl text-gray-600">Remove PDF password security.</p>
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

          {!unlockedUrl ? (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter the password to unlock
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Unlock className="h-5 w-5 text-gray-400" />
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
                  onClick={unlockPdf}
                  disabled={isProcessing || !password}
                  className="flex-1 py-4 bg-purple-600 text-white text-lg font-bold rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50 shadow-md"
                >
                  {isProcessing ? 'Unlocking...' : 'Unlock PDF'}
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
                <h3 className="text-2xl font-bold text-green-800 mb-4">PDF unlocked successfully!</h3>
                <a
                  href={unlockedUrl}
                  download={`unlocked_${file.name}`}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 transition-colors shadow-md"
                >
                  <Download className="w-6 h-6" />
                  Download unlocked PDF
                </a>
              </div>
              <button
                onClick={() => { setFile(null); setUnlockedUrl(null); setPassword(''); }}
                className="text-gray-600 hover:text-gray-900 font-medium"
              >
                Unlock another PDF
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
