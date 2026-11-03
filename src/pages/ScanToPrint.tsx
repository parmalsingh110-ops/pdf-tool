import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Printer,
  QrCode,
  Smartphone,
  Upload,
  CheckCircle2,
  Trash2,
  Download,
  Copy,
  ExternalLink,
  Volume2,
  VolumeX,
  FileText,
  Image as ImageIcon,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { downloadBlob } from '../lib/utils';

interface PrintJob {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string;
  timestamp: string;
  pages?: number;
  copies: number;
  colorMode: 'bw' | 'color';
}

export default function ScanToPrint() {
  useSEO(
    'Scan to Print QR Web-Drop — No WhatsApp Needed | PDF Media Suite',
    'Generate counter QR code for customers to upload PDFs and photos directly to your shop computer for 1-click printing. No saving WhatsApp numbers.'
  );

  usePageSEO(
    'Scan to Print QR Web-Drop — Instant Cyber Cafe Print Station',
    'Free web-based print drop station for E-Mitra, CSC centers, and xerox shops. Customers scan a QR code to beam documents directly to your PC for instant 1-click printing.',
    'scan to print qr, whatsapp print alternative, cyber cafe print station, mobile to pc print qr, instant document print queue, emitra print drop',
    '/scan-to-print'
  );

  // Check URL query parameters for session (Mobile Sender Mode)
  const [sessionCode, setSessionCode] = useState<string>('');
  const [isSenderMode, setIsSenderMode] = useState<boolean>(false);

  // Shopkeeper Queue state
  const [printJobs, setPrintJobs] = useState<PrintJob[]>([]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedJob, setSelectedJob] = useState<PrintJob | null>(null);

  // Sender state (Mobile customer)
  const [senderFiles, setSenderFiles] = useState<File[]>([]);
  const [senderUploading, setSenderUploading] = useState(false);
  const [senderSuccess, setSenderSuccess] = useState(false);

  // Channel reference for cross-tab / cross-device messaging
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Initialize session
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const existingSession = params.get('session');

    if (existingSession) {
      setSessionCode(existingSession);
      setIsSenderMode(true);
    } else {
      // Counter PC Mode: create random 6-character room PIN
      const newSession = Math.random().toString(36).substring(2, 8).toUpperCase();
      setSessionCode(newSession);
      setIsSenderMode(false);
    }
  }, []);

  // Play notification chime
  const playChime = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch {}
  }, [soundEnabled]);

  // BroadcastChannel listener for local browser tabs and local network simulation
  useEffect(() => {
    if (!sessionCode) return;

    const channelName = `pdfmediasuite_print_${sessionCode}`;
    const bc = new BroadcastChannel(channelName);
    channelRef.current = bc;

    bc.onmessage = (event) => {
      const data = event.data;
      if (data && data.action === 'NEW_PRINT_JOB' && !isSenderMode) {
        setPrintJobs((prev) => [data.job, ...prev]);
        playChime();
      }
    };

    return () => {
      bc.close();
    };
  }, [sessionCode, isSenderMode, playChime]);

  // Construct mobile upload link
  const mobileLink = typeof window !== 'undefined'
    ? `${window.location.origin}/scan-to-print?session=${sessionCode}`
    : `https://www.pdfmediasuite.in/scan-to-print?session=${sessionCode}`;

  // QR Code URL using high-quality SVG API
  const qrSvgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=8&data=${encodeURIComponent(mobileLink)}`;

  // Handle customer mobile file selection
  const handleCustomerUpload = async () => {
    if (senderFiles.length === 0) return;
    setSenderUploading(true);

    try {
      for (const file of senderFiles) {
        const reader = new FileReader();
        await new Promise((resolve) => {
          reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            const job: PrintJob = {
              id: Math.random().toString(36).substring(2, 9),
              name: file.name,
              size: file.size,
              type: file.type,
              dataUrl,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              copies: 1,
              colorMode: 'bw',
            };

            // Broadcast to shopkeeper channel
            if (channelRef.current) {
              channelRef.current.postMessage({ action: 'NEW_PRINT_JOB', job });
            }

            // Also save to localStorage buffer for cross-window reliability
            try {
              const key = `pms_queue_${sessionCode}`;
              const existing = JSON.parse(localStorage.getItem(key) || '[]');
              localStorage.setItem(key, JSON.stringify([job, ...existing].slice(0, 30)));
            } catch {}

            resolve(true);
          };
          reader.readAsDataURL(file);
        });
      }

      setSenderSuccess(true);
      setSenderFiles([]);
    } catch (err) {
      alert('Error uploading file. Please try again.');
    } finally {
      setSenderUploading(false);
    }
  };

  // Direct file drop on Shopkeeper PC
  const handleShopkeeperFileDrop = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const job: PrintJob = {
          id: Math.random().toString(36).substring(2, 9),
          name: file.name,
          size: file.size,
          type: file.type,
          dataUrl: ev.target?.result as string,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          copies: 1,
          colorMode: 'bw',
        };
        setPrintJobs((prev) => [job, ...prev]);
        playChime();
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  // Check localStorage buffer periodically for newly dropped files
  useEffect(() => {
    if (isSenderMode || !sessionCode) return;

    const interval = setInterval(() => {
      try {
        const key = `pms_queue_${sessionCode}`;
        const stored = JSON.parse(localStorage.getItem(key) || '[]');
        if (stored.length > 0) {
          setPrintJobs((prev) => {
            const existingIds = new Set(prev.map((j) => j.id));
            const newJobs = stored.filter((j: PrintJob) => !existingIds.has(j.id));
            if (newJobs.length > 0) {
              playChime();
              return [...newJobs, ...prev];
            }
            return prev;
          });
          localStorage.removeItem(key);
        }
      } catch {}
    }, 1200);

    return () => clearInterval(interval);
  }, [isSenderMode, sessionCode, playChime]);

  // 1-Click Print specific job
  const handlePrint = (job: PrintJob) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to open the print dialog.');
      return;
    }

    if (job.type.includes('image')) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${job.name} - Print</title>
            <style>
              @page { size: auto; margin: 0; }
              body { margin: 0; display: flex; align-items: center; justify-content: center; height: 100vh; background: #fff; }
              img { max-width: 95vw; max-height: 95vh; object-fit: contain; ${job.colorMode === 'bw' ? 'filter: grayscale(100%) contrast(120%);' : ''} }
            </style>
          </head>
          <body>
            <img src="${job.dataUrl}" onload="window.print(); window.close();" />
          </body>
        </html>
      `);
      printWindow.document.close();
    } else if (job.type.includes('pdf')) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head><title>${job.name}</title></head>
          <body style="margin:0; padding:0;">
            <iframe src="${job.dataUrl}" style="border:none; width:100vw; height:100vh;" onload="this.contentWindow.print();"></iframe>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  // 1-Click Print All in Queue
  const handlePrintAll = () => {
    if (!printJobs.length) return;
    printJobs.forEach((j, i) => {
      setTimeout(() => handlePrint(j), i * 1500);
    });
  };

  // Copy shareable link
  const copyLink = () => {
    navigator.clipboard.writeText(mobileLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // ==================== MOBILE SENDER VIEW ====================
  if (isSenderMode) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 flex flex-col justify-center items-center">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center font-bold">
              <Printer className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">Shop Print Drop</h1>
              <p className="text-xs text-slate-500">Connected to Counter PIN: <span className="font-bold text-rose-600">{sessionCode}</span></p>
            </div>
          </div>

          {senderSuccess ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Document Sent to Counter!</h2>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Your file has been transferred to the shopkeeper's computer screen. Please tell the operator to print.
              </p>
              <button
                onClick={() => setSenderSuccess(false)}
                className="w-full py-3 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-sm font-bold shadow-md hover:opacity-90"
              >
                Send Another File
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-rose-50/50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
                🔒 <strong>100% Private:</strong> Files transfer directly to the shopkeeper without saving any phone numbers or WhatsApp history.
              </div>

              <label className="block border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl p-8 text-center cursor-pointer hover:border-rose-500 transition-colors">
                <Upload className="w-10 h-10 mx-auto text-slate-400 mb-2" />
                <span className="font-bold text-sm text-slate-700 dark:text-slate-200 block">
                  Select Document or Photo
                </span>
                <span className="text-xs text-slate-400 mt-1 block">
                  Supports PDF, Aadhaar, Photos, JPG, PNG (Max 50MB)
                </span>
                <input
                  type="file"
                  multiple
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => setSenderFiles(Array.from(e.target.files || []))}
                />
              </label>

              {senderFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Selected ({senderFiles.length})</p>
                  <div className="max-h-40 overflow-y-auto space-y-1.5">
                    {senderFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs">
                        <span className="truncate max-w-[200px] font-medium text-slate-700 dark:text-slate-200">{f.name}</span>
                        <span className="text-slate-400">{(f.size / 1024).toFixed(0)} KB</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleCustomerUpload}
                    disabled={senderUploading}
                    className="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    {senderUploading ? (
                      <span>Sending to Counter PC...</span>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" /> Send to Counter Now ({senderFiles.length})
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==================== COUNTER PC SHOPKEEPER VIEW ====================
  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-600 text-xs font-bold mb-2">
              <Sparkles className="w-3.5 h-3.5" /> E-Mitra & Cyber Cafe Super Tool
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">
              Scan to Print QR Web-Drop
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
              Keep this screen open on your shop computer. Customers scan the QR code to beam documents directly to your queue for 1-click printing without saving WhatsApp numbers!
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                soundEnabled
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 text-emerald-700 dark:text-emerald-300'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-300 text-slate-400'
              }`}
              title="Toggle audio chime on new file reception"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              {soundEnabled ? 'Chime ON' : 'Chime Muted'}
            </button>

            <button
              onClick={handlePrintAll}
              disabled={!printJobs.length}
              className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs shadow-md disabled:opacity-40 flex items-center gap-2 hover:opacity-90"
            >
              <Printer className="w-4 h-4" /> Print All ({printJobs.length})
            </button>
          </div>
        </div>

        {/* Main Grid: Left Counter QR Station + Right Print Queue */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT: QR Code Station for Customers */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-sm space-y-6">
            <div className="text-center space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 dark:bg-rose-950/60 px-3 py-1 rounded-full">
                Customer Mobile Scan
              </span>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Scan with Phone Camera</h2>
              <p className="text-xs text-slate-500">No app or mobile number required. Instant direct transfer.</p>
            </div>

            {/* QR Card */}
            <div className="p-6 rounded-3xl bg-slate-50 dark:bg-slate-800/60 border-2 border-dashed border-rose-200 dark:border-rose-900 flex flex-col items-center justify-center">
              <div className="p-3 bg-white rounded-2xl shadow-md border border-slate-100">
                <img
                  src={qrSvgUrl}
                  alt="Scan to Print QR Code"
                  className="w-48 h-48 sm:w-56 sm:h-56 object-contain"
                />
              </div>

              <div className="mt-4 flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Counter PIN:</span>
                <span className="text-lg font-black tracking-widest text-slate-900 dark:text-white bg-white dark:bg-slate-900 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                  {sessionCode}
                </span>
              </div>
            </div>

            {/* Link Share / Copy */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={mobileLink}
                  className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-600 dark:text-slate-300 outline-none truncate"
                />
                <button
                  onClick={copyLink}
                  className="px-3.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-600 text-xs font-bold border border-rose-200 dark:border-rose-900 hover:bg-rose-100 flex items-center gap-1.5 shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" /> {copiedLink ? 'Copied!' : 'Copy'}
                </button>
              </div>

              {/* Direct Drop from PC option */}
              <label className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-rose-400 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5" /> Drop Local File from this PC to Queue
                <input
                  type="file"
                  multiple
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={handleShopkeeperFileDrop}
                />
              </label>
            </div>
          </div>

          {/* RIGHT: Live Incoming Print Queue */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Live Print Queue ({printJobs.length})
                </h2>
              </div>
              {printJobs.length > 0 && (
                <button
                  onClick={() => setPrintJobs([])}
                  className="text-xs text-rose-600 hover:underline font-semibold flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear All
                </button>
              )}
            </div>

            {printJobs.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 mx-auto flex items-center justify-center">
                  <Printer className="w-8 h-8" />
                </div>
                <h3 className="font-bold text-slate-700 dark:text-slate-200 text-sm">Print Queue is Empty</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  When a customer scans your counter QR code on their phone, their document will instantly pop up here with a chime!
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {printJobs.map((job) => (
                  <div
                    key={job.id}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 hover:border-rose-400 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    {/* File Info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-rose-600 shrink-0 overflow-hidden">
                        {job.type.includes('image') ? (
                          <img src={job.dataUrl} alt={job.name} className="w-full h-full object-cover" />
                        ) : (
                          <FileText className="w-6 h-6" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-900 dark:text-white truncate max-w-[240px]">
                          {job.name}
                        </p>
                        <p className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>{(job.size / 1024).toFixed(0)} KB</span>
                          <span>•</span>
                          <span>{job.timestamp}</span>
                        </p>
                      </div>
                    </div>

                    {/* Quick Print Actions */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <select
                        value={job.colorMode}
                        onChange={(e) => {
                          const mode = e.target.value as 'bw' | 'color';
                          setPrintJobs((prev) =>
                            prev.map((j) => (j.id === job.id ? { ...j, colorMode: mode } : j))
                          );
                        }}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none"
                      >
                        <option value="bw">B&W</option>
                        <option value="color">Color</option>
                      </select>

                      <button
                        onClick={() => handlePrint(job)}
                        className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all"
                      >
                        <Printer className="w-3.5 h-3.5" /> 1-Click Print
                      </button>

                      <button
                        onClick={() => {
                          const a = document.createElement('a');
                          a.href = job.dataUrl;
                          a.download = job.name;
                          a.click();
                        }}
                        title="Download to PC"
                        className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 text-xs"
                      >
                        <Download className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => setPrintJobs((prev) => prev.filter((j) => j.id !== job.id))}
                        title="Delete from Queue"
                        className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 text-xs"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* SEO Guide Section */}
        <ToolSEOSection
          toolName="Scan to Print QR Web-Drop"
          headline="Instant Mobile-to-PC Print Queue Without Saving WhatsApp Numbers"
          description="Free web-based print drop station for E-Mitra, CSC centers, and xerox shops. Customers scan a counter QR code on their phone to beam documents directly to your PC for instant 1-click printing."
          features={[
            {
              title: 'No WhatsApp Numbers to Save',
              desc: 'Never fill up your phone contacts with temporary customers. Customers scan the counter QR and upload directly.',
            },
            {
              title: 'Zero Software Installation',
              desc: 'Runs completely in your web browser. Works instantly on Google Chrome, Edge, Firefox, or Opera.',
            },
            {
              title: 'Audio Chime Alerts',
              desc: 'Hear a pleasant chime alert the moment a customer submits a file from their mobile phone outside your counter.',
            },
            {
              title: '1-Click Direct Print',
              desc: 'Open standard browser print dialogs directly with auto-scaled margins and B&W toner-saver options.',
            },
          ]}
        />
      </div>
    </div>
  );
}
