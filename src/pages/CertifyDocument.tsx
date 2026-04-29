import React, { useState } from 'react';
import { Shield, Lock, FileText, CheckCircle, Download, Upload, AlertCircle } from 'lucide-react';
import { usePageSEO } from '../lib/usePageSEO';
import FileDropzone from '../components/FileDropzone';
// @ts-ignore
import * as Zga from 'zgapdfsigner';

export default function CertifyDocument() {
  usePageSEO('Certify PDF Document', 'Digitally sign and certify your PDF document using a .p12 or .pfx certificate. Free online PDF certification tool that works entirely in your browser.');
  
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [certifiedUrl, setCertifiedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePdfDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setPdfFile(acceptedFiles[0]);
      setCertifiedUrl(null);
      setError(null);
    }
  };

  const handleCertDrop = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setCertFile(e.target.files[0]);
      setError(null);
    }
  };

  const certifyPdf = async () => {
    if (!pdfFile || !certFile) {
      setError('Please provide both a PDF file and a Certificate file.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const pdfBuffer = await pdfFile.arrayBuffer();
      const certBuffer = await certFile.arrayBuffer();

      const options = {
        p12cert: certBuffer,
        pwd: password,
        permission: 1, // 1 = No changes allowed
        reason: 'Digitally Certified',
      };

      const signer = new Zga.PdfSigner(options);
      const signedPdfBytes = await signer.sign(pdfBuffer);
      
      const blob = new Blob([signedPdfBytes], { type: 'application/pdf' });
      setCertifiedUrl(URL.createObjectURL(blob));

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to certify the document. Please check if your certificate password is correct.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (certifiedUrl) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-green-200 p-8 text-center">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Document Certified!</h2>
          <p className="text-gray-600 mb-8">
            Your PDF has been successfully signed and certified. 
            When opened in Adobe Acrobat, it will display a valid digital signature.
          </p>
          <div className="flex flex-col gap-4">
            <a
              href={certifiedUrl}
              download={`certified_${pdfFile?.name}`}
              className="flex items-center justify-center gap-2 w-full py-4 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors"
            >
              <Download className="w-5 h-5" />
              Download Certified PDF
            </a>
            <button
              onClick={() => {
                setCertifiedUrl(null);
                setPdfFile(null);
                setCertFile(null);
                setPassword('');
              }}
              className="py-4 text-gray-600 font-medium hover:text-gray-900"
            >
              Certify another document
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8 max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Certify Document (Digital Signature)</h1>
        <p className="text-xl text-gray-600">Digitally sign and lock your PDF document using your .pfx or .p12 certificate.</p>
        <p className="mt-2 text-sm text-green-700 bg-green-50 px-4 py-2 rounded-lg inline-block border border-green-200">
          <Shield className="w-4 h-4 inline mr-2 relative -top-0.5" />
          Processed locally in your browser. Your private certificate never leaves your device.
        </p>
      </div>

      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="flex flex-col h-full">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span> 
            Select PDF Document
          </h3>
          <div className="flex-1">
            {!pdfFile ? (
              <FileDropzone onDrop={handlePdfDrop} multiple={false} title="Drop PDF here" />
            ) : (
              <div className="h-full bg-white rounded-2xl border border-blue-200 p-6 flex flex-col items-center justify-center text-center">
                <FileText className="w-12 h-12 text-blue-500 mb-3" />
                <p className="font-medium text-gray-900 truncate max-w-[200px]">{pdfFile.name}</p>
                <p className="text-sm text-gray-500 mb-4">{(pdfFile.size / 1024 / 1024).toFixed(2)} MB</p>
                <button onClick={() => setPdfFile(null)} className="text-sm text-red-600 hover:text-red-800 font-medium">Remove</button>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col h-full">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <span className="bg-amber-100 text-amber-700 w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span> 
            Digital Certificate Details
          </h3>
          <div className="flex-1 bg-white rounded-2xl border border-gray-200 p-6 flex flex-col gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Certificate File (.pfx / .p12)</label>
              <div className="relative">
                <input
                  type="file"
                  accept=".pfx,.p12,application/x-pkcs12"
                  onChange={handleCertDrop}
                  className="hidden"
                  id="cert-upload"
                />
                <label 
                  htmlFor="cert-upload"
                  className={`flex items-center justify-center w-full px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${certFile ? 'border-amber-400 bg-amber-50' : 'border-gray-300 hover:border-amber-400 hover:bg-gray-50'}`}
                >
                  {certFile ? (
                    <span className="text-amber-800 font-medium flex items-center gap-2"><CheckCircle className="w-4 h-4"/> {certFile.name}</span>
                  ) : (
                    <span className="text-gray-500 flex items-center gap-2"><Upload className="w-4 h-4"/> Browse Certificate</span>
                  )}
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Certificate Password</label>
              <div className="relative">
                <Lock className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter passphrase"
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                />
              </div>
            </div>
            
            {error && (
              <div className="p-3 bg-red-50 text-red-700 rounded-xl text-sm flex items-start gap-2 border border-red-100">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 w-full max-w-4xl">
        <button
          onClick={certifyPdf}
          disabled={!pdfFile || !certFile || isProcessing}
          className="w-full py-4 bg-teal-600 text-white text-lg font-bold rounded-xl hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all flex justify-center items-center gap-2"
        >
          {isProcessing ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Certifying Document...
            </>
          ) : (
            <>
              <Shield className="w-5 h-5" />
              Certify PDF Document
            </>
          )}
        </button>
      </div>
    </div>
  );
}
