import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Download, LucideIcon, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import FileDropzone from './FileDropzone';
import { useAutoRevokeUrl } from '../lib/blobUrl';
import ToolWorkspaceShell from './pearl/ToolWorkspaceShell';
import { PearlScanOverlay, PearlStageSwitch } from './pearl/PearlMotion';

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

  useAutoRevokeUrl(resultUrl);

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

  const prefersReduced = useReducedMotion();
  const stageKey = !file ? 'drop' : !resultUrl ? 'ready' : 'done';

  return (
    <ToolWorkspaceShell
      title={title}
      subtitle={description}
      categoryLabel="Privacy & Utility Workspace"
      icon={Icon}
      microVariant="security"
      tone="violet"
    >
      <div className="max-w-2xl mx-auto">
        <PearlStageSwitch stageKey={stageKey}>
          {!file ? (
            <FileDropzone onDrop={handleDrop} multiple={multiple} accept={accept} />
          ) : (
            <div className="relative pms-glass-panel rounded-3xl p-6 sm:p-8 overflow-hidden">
              <PearlScanOverlay active={isProcessing} label="Processing in browser…" />

              <div
                className="flex items-center gap-4 p-5 rounded-2xl border mb-7"
                style={{
                  backgroundColor: 'var(--pms-white)',
                  borderColor: 'var(--pms-border)',
                }}
              >
                <div className={`w-14 h-14 ${bgClass} ${colorClass} rounded-xl flex items-center justify-center shrink-0`}>
                  <Icon className="w-7 h-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate">{file.name}</p>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">
                    {file.size >= 1024 * 1024
                      ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
                      : `${(file.size / 1024).toFixed(1)} KB`}
                  </p>
                </div>
              </div>

              {!resultUrl ? (
                <div className="space-y-5">
                  {errorMsg && (
                    <motion.div
                      initial={prefersReduced ? false : { opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3 text-red-700 dark:text-red-300 text-left"
                    >
                      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold">Processing Failed</h4>
                        <p className="text-sm mt-1">{errorMsg}</p>
                      </div>
                    </motion.div>
                  )}
                  {requiresBackendAlert && (
                    <div className="p-4 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-center">
                      This complex operation is partially simulated in the browser. In a production environment, this would require a backend service.
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <motion.button
                      whileHover={prefersReduced || isProcessing ? undefined : { scale: 1.01 }}
                      whileTap={prefersReduced || isProcessing ? undefined : { scale: 0.985 }}
                      onClick={handleProcess}
                      disabled={isProcessing}
                      className="flex-1 pms-btn-primary flex items-center justify-center gap-2.5 py-4 px-6 text-base sm:text-lg font-bold rounded-2xl disabled:opacity-50 cursor-pointer"
                    >
                      {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}
                      {isProcessing ? 'Processing...' : actionText}
                    </motion.button>
                    <button
                      onClick={() => { setFile(null); setErrorMsg(null); }}
                      className="px-6 py-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 text-base font-semibold rounded-2xl hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 text-center">
                  <div className="p-7 sm:p-8 bg-emerald-50/85 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800/70">
                    <motion.div
                      initial={prefersReduced ? false : { scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 360, damping: 20 }}
                      className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner"
                    >
                      <CheckCircle2 className="w-8 h-8" />
                    </motion.div>
                    <h3 className="text-2xl font-extrabold text-emerald-900 dark:text-emerald-200 mb-4">
                      Task Completed!
                    </h3>
                    {resultUrl !== '#done' && (
                      <motion.a
                        whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                        whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                        href={resultUrl}
                        download={getDownloadFilename()}
                        className="inline-flex items-center justify-center gap-2.5 px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-base sm:text-lg font-bold rounded-2xl transition-colors shadow-lg shadow-emerald-600/20"
                      >
                        <Download className="w-5 h-5" />
                        Download File
                      </motion.a>
                    )}
                  </div>
                  <button
                    onClick={() => { setFile(null); setResultUrl(null); }}
                    className="text-sm font-semibold text-gray-600 dark:text-slate-400 hover:text-[var(--pms-ink)] transition-colors cursor-pointer"
                  >
                    Process another file
                  </button>
                </div>
              )}
            </div>
          )}
        </PearlStageSwitch>
      </div>
    </ToolWorkspaceShell>
  );
}

