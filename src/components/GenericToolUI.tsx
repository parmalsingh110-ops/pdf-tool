import React, { useState } from 'react';
import { Download, LucideIcon, FileText, AlertTriangle } from 'lucide-react';
import FileDropzone from './FileDropzone';

interface GenericToolUIProps {
  title: string;
  description: string;
  icon: LucideIcon;
  colorClass: string;
  bgClass: string;
  actionText: string;
  onProcess: (file: File) => Promise<string | void>;
  accept?: Record<string, string[]>;
  multiple?: boolean;
  requiresBackendAlert?: boolean;
  outputExtension?: string;
}

export default function GenericToolUI({
  title,
  description,
  icon: Icon,
  colorClass,
  bgClass,
  actionText,
  onProcess,
  accept = { 'application/pdf': ['.pdf'] },
  multiple = false,
  requiresBackendAlert = false,
  outputExtension
}: GenericToolUIProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setResultUrl(null);
      setErrorMsg(null);
    }
  };

  const handleProcess = async () => {
    if (!file) return;
    
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const url = await onProcess(file);
      if (url) {
        setResultUrl(url);
      } else {
        // Fallback for tools that modify state internally or mock
        setResultUrl('#done');
      }
    } catch (error: any) {
      console.error(`Error processing ${title}:`, error);
      
      let msg = "An unexpected error occurred while processing the file.";
      const errMsg = error?.message || '';
      const errName = error?.name || '';
      
      if (errName === 'InvalidPDFException' || errMsg.includes('Invalid PDF structure') || errMsg.includes('No PDF header found')) {
        msg = "The uploaded file is deeply corrupted or is NOT a valid PDF document. Please ensure you are uploading a valid, non-corrupted PDF.";
      } else if (errMsg.includes('encrypted') || errMsg.includes('password')) {
        msg = "This PDF is encrypted or password-protected. Please unlock it first.";
      } else {
        msg = errMsg || msg;
      }
      
      setErrorMsg(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const getDownloadFilename = () => {
    if (!file) return 'processed_file';
    let baseName = `processed_${file.name}`;
    if (outputExtension) {
      // replace existing extension with the new one
      baseName = baseName.replace(/\.[^/.]+$/, "") + outputExtension;
    }
    return baseName;
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">{title}</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400">{description}</p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={multiple} accept={accept} />
      ) : (
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8">
          <div className="flex items-center gap-4 p-6 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 mb-8">
            <div className={`w-16 h-16 ${bgClass} ${colorClass} rounded-xl flex items-center justify-center shrink-0`}>
              <Icon className="w-8 h-8" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-semibold text-gray-900 dark:text-white truncate">{file.name}</p>
              <p className="text-sm text-gray-500 dark:text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>

          {!resultUrl ? (
            <div className="space-y-6">
              {errorMsg && (
                <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3 text-red-700 dark:text-red-300 text-left">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold">Processing Failed</h4>
                    <p className="text-sm mt-1">{errorMsg}</p>
                  </div>
                </div>
              )}
              {requiresBackendAlert && (
                 <div className="p-4 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-center">
                   This complex operation is partially simulated in the browser. In a production environment, this would require a backend service.
                 </div>
              )}
              <div className="flex gap-4">
                <button
                  onClick={handleProcess}
                  disabled={isProcessing}
                  className="flex-1 flex items-center justify-center gap-2 py-4 bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 border-none shadow-md text-lg font-bold rounded-xl hover:bg-slate-900 dark:hover:bg-white transition-colors disabled:opacity-50"
                >
                  {isProcessing ? (
                     <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : <Icon className="w-6 h-6" />}
                  {isProcessing ? 'Processing...' : actionText}
                </button>
                <button
                  onClick={() => { setFile(null); setErrorMsg(null); }}
                  className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 text-lg font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 text-center">
              <div className="p-8 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 dark:border-green-800">
                <h3 className="text-2xl font-bold text-green-800 dark:text-green-300 mb-4">Task Completed!</h3>
                {resultUrl !== '#done' && (
                  <a
                    href={resultUrl}
                    download={getDownloadFilename()}
                    className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 transition-colors shadow-md"
                  >
                    <Download className="w-6 h-6" />
                    Download File
                  </a>
                )}
              </div>
              <button
                onClick={() => { setFile(null); setResultUrl(null); }}
                className="text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white font-medium"
              >
                Process another file
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

