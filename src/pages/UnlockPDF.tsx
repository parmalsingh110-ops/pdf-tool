import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Download, FileText, Unlock, AlertTriangle } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';

export default function UnlockPDF() {
  usePageSEO('Unlock PDF — Remove Password', 'Remove password protection from PDF files. Free online PDF unlocker — instant, private, no uploads.');
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [unlockedUrl, setUnlockedUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setUnlockedUrl(null);
      setPassword('');
      setErrorMsg(null);
      setProgress('');
    }
  };

  const unlockPdf = async () => {
    if (!file || !password) return;

    setIsProcessing(true);
    setErrorMsg(null);
    setProgress('Loading PDF engine...');

    try {
      const arrayBuffer = await file.arrayBuffer();

      // --- Step 1: Open with pdfjs-dist using the password ---
      // pdfjs-dist is the only reliable way to open ANY encrypted PDF in the browser
      // It handles RC4-40, RC4-128, AES-128, AES-256 — all standard encryption types
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url
      ).toString();

      setProgress('Opening encrypted PDF...');

      let pdfjsDoc: any;
      try {
        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(arrayBuffer),
          password: password,
        });
        pdfjsDoc = await loadingTask.promise;
      } catch (err: any) {
        // pdfjs throws PasswordException for wrong password
        const errName = err?.name || '';
        const errMsg = (err?.message || '').toLowerCase();
        if (errName === 'PasswordException' || errMsg.includes('password') || errMsg.includes('incorrect')) {
          setErrorMsg('❌ Incorrect password. Please try again.');
        } else {
          setErrorMsg('Could not open PDF. It may be corrupted or use an unsupported format.');
        }
        return;
      }

      const numPages = pdfjsDoc.numPages;
      setProgress(`PDF opened. Rendering ${numPages} page(s)...`);

      // --- Step 2: Render each page to canvas and extract as image ---
      // We rebuild a new PDF from rendered pages — this completely removes encryption
      const newPdfDoc = await PDFDocument.create();
      const scale = 2.0; // High resolution

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        setProgress(`Processing page ${pageNum} of ${numPages}...`);
        const page = await pdfjsDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        // Create an off-screen canvas
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;

        // Render the page
        await page.render({ canvasContext: ctx, viewport }).promise;

        // Convert canvas to PNG bytes
        const pngDataUrl = canvas.toDataURL('image/png');
        const pngBase64 = pngDataUrl.split(',')[1];
        const pngBytes = Uint8Array.from(atob(pngBase64), c => c.charCodeAt(0));

        // Embed as image in the new PDF
        const pngImage = await newPdfDoc.embedPng(pngBytes);
        const pdfPage = newPdfDoc.addPage([viewport.width / scale, viewport.height / scale]);
        pdfPage.drawImage(pngImage, {
          x: 0,
          y: 0,
          width: viewport.width / scale,
          height: viewport.height / scale,
        });
      }

      setProgress('Saving unlocked PDF...');
      const pdfBytes = await newPdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setUnlockedUrl(url);
      setProgress('');
    } catch (error: any) {
      console.error('Error unlocking PDF:', error);
      setErrorMsg('An unexpected error occurred. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Unlock PDF file</h1>
        <p className="text-xl text-gray-600">Remove PDF password security, instantly in your browser.</p>
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
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex gap-3 text-amber-800 text-sm">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <p>By unlocking this PDF, you confirm you have the right to access and remove its protection.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter the PDF password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Unlock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && password && !isProcessing && unlockPdf()}
                    className="w-full pl-11 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-shadow"
                    placeholder="Enter password"
                    autoFocus
                  />
                </div>
                {errorMsg && (
                  <p className="mt-2 text-sm text-red-600 font-medium">{errorMsg}</p>
                )}
              </div>

              {isProcessing && progress && (
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600 shrink-0"></div>
                    <p className="text-sm text-purple-700 font-medium">{progress}</p>
                  </div>
                </div>
              )}

              <div className="flex gap-4">
                <button
                  onClick={unlockPdf}
                  disabled={isProcessing || !password}
                  className="flex-1 py-4 bg-purple-600 text-white text-lg font-bold rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Unlocking...
                    </>
                  ) : (
                    <>
                      <Unlock className="w-5 h-5" />
                      Unlock PDF
                    </>
                  )}
                </button>
                <button
                  onClick={() => { setFile(null); setPassword(''); setErrorMsg(null); setProgress(''); }}
                  className="px-6 py-4 bg-gray-100 text-gray-700 text-lg font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 text-center">
              <div className="p-8 bg-green-50 rounded-xl border border-green-200">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Unlock className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold text-green-800 mb-2">PDF Unlocked!</h3>
                <p className="text-green-700 mb-6 text-sm">Password protection has been removed successfully.</p>
                <a
                  href={unlockedUrl}
                  download={`unlocked_${file.name}`}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 transition-colors shadow-md"
                >
                  <Download className="w-6 h-6" />
                  Download Unlocked PDF
                </a>
              </div>
              <button
                onClick={() => { setFile(null); setUnlockedUrl(null); setPassword(''); setProgress(''); }}
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
