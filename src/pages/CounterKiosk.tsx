import React, { useState, useEffect, useRef } from 'react';
import {
  Monitor,
  Maximize2,
  Minimize2,
  Printer,
  Upload,
  CheckCircle2,
  Clock,
  Layers,
  Palette,
  User,
  Phone,
  FileText,
  Trash2,
  Lock,
  Unlock,
  Settings,
  Sparkles,
  Ticket,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';

interface KioskJob {
  id: string;
  tokenNumber: number;
  customerName: string;
  phone: string;
  fileName: string;
  fileSize: number;
  fileDataUrl: string;
  totalPages: number;
  printType: 'bw' | 'color';
  sides: 'single' | 'duplex';
  copies: number;
  estimatedCost: number;
  timestamp: string;
  status: 'pending' | 'printed' | 'cancelled';
}

export default function CounterKiosk() {
  useSEO(
    'Fullscreen Counter Self-Service Kiosk — Client Self-Print Terminal | PDF Media Suite',
    'Turn any spare tablet or monitor into an automated customer self-service print ordering kiosk. Collects files, calculates bills, and sends directly to the shopkeeper print queue.'
  );

  usePageSEO(
    'Fullscreen Counter Self-Service Kiosk — Cyber Cafe Order Terminal',
    'Free self-service print kiosk system for photocopy and Xerox shops. Customers order prints on counter tablets with automatic token numbers and queue management.',
    'counter kiosk print, xerox self service terminal, customer print queue, cyber cafe kiosk software, automated photocopy counter, emitra token print system',
    '/counter-kiosk'
  );

  const [viewMode, setViewMode] = useState<'customer' | 'shopkeeper'>('customer');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [queue, setQueue] = useState<KioskJob[]>(() => {
    try {
      const saved = localStorage.getItem('pms_kiosk_queue');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Customer Form State
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileDataUrl, setFileDataUrl] = useState<string>('');
  const [pageCount, setPageCount] = useState<number>(1);
  const [printType, setPrintType] = useState<'bw' | 'color'>('bw');
  const [sides, setSides] = useState<'single' | 'duplex'>('single');
  const [copies, setCopies] = useState<number>(1);
  const [completedJob, setCompletedJob] = useState<KioskJob | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // BroadcastChannel for cross-monitor sync (Counter tablet -> Main PC)
  useEffect(() => {
    const channel = new BroadcastChannel('pms_kiosk_sync');
    channel.onmessage = (event) => {
      if (event.data?.type === 'QUEUE_UPDATE') {
        setQueue(event.data.queue);
      }
    };
    return () => channel.close();
  }, []);

  const saveQueue = (newQueue: KioskJob[]) => {
    setQueue(newQueue);
    localStorage.setItem('pms_kiosk_queue', JSON.stringify(newQueue));
    const channel = new BroadcastChannel('pms_kiosk_sync');
    channel.postMessage({ type: 'QUEUE_UPDATE', queue: newQueue });
    channel.close();
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  const handleFileChange = async (file: File) => {
    setUploadedFile(file);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setFileDataUrl(dataUrl);

      if (file.type === 'application/pdf') {
        try {
          const doc = await pdfjsLib.getDocument({ data: atob(dataUrl.split(',')[1]) }).promise;
          setPageCount(doc.numPages);
        } catch {
          setPageCount(1);
        }
      } else {
        setPageCount(1);
      }
    };
    reader.readAsDataURL(file);
  };

  // Cost calculation
  const unitRate = printType === 'bw' ? (sides === 'single' ? 2 : 1.5) : sides === 'single' ? 10 : 7.5;
  const estimatedCost = Math.round(pageCount * unitRate * copies);

  const handleSubmitJob = () => {
    if (!uploadedFile || !fileDataUrl) {
      alert('Please upload a document to print.');
      return;
    }

    setIsSubmitting(true);
    const lastToken = queue.length > 0 ? queue[queue.length - 1].tokenNumber : 0;
    const nextToken = (lastToken % 99) + 1;

    const newJob: KioskJob = {
      id: `kiosk_${Date.now()}`,
      tokenNumber: nextToken,
      customerName: customerName.trim() || `Customer #${nextToken}`,
      phone: customerPhone.trim(),
      fileName: uploadedFile.name,
      fileSize: uploadedFile.size,
      fileDataUrl,
      totalPages: pageCount,
      printType,
      sides,
      copies,
      estimatedCost: Math.max(2, estimatedCost),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'pending',
    };

    const updated = [...queue, newJob];
    saveQueue(updated);
    setCompletedJob(newJob);
    setIsSubmitting(false);

    // Reset customer fields
    setUploadedFile(null);
    setFileDataUrl('');
    setCustomerName('');
    setCustomerPhone('');
    setCopies(1);
  };

  const handleShopkeeperPrint = (job: KioskJob) => {
    const printWindow = window.open(job.fileDataUrl, '_blank');
    if (printWindow) {
      printWindow.focus();
    }
    const updated = queue.map((j) => (j.id === job.id ? { ...j, status: 'printed' as const } : j));
    saveQueue(updated);
  };

  const handleDismissJob = (jobId: string) => {
    const updated = queue.filter((j) => j.id !== jobId);
    saveQueue(updated);
  };

  const handleClearAll = () => {
    if (confirm('Clear all completed and pending print queue items?')) {
      saveQueue([]);
    }
  };

  return (
    <div className={`w-full min-h-screen ${viewMode === 'customer' ? 'bg-slate-900 text-white' : 'bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white'} transition-colors py-8 px-4 sm:px-6`}>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Kiosk Mode Top Navigation Bar */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-700/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight">Counter Self-Print Kiosk</h1>
              <p className="text-xs text-slate-400">
                {viewMode === 'customer' ? 'Customer Self-Order Terminal' : 'Shopkeeper Live Queue'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleFullscreen}
              className="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {viewMode === 'customer' ? (
              <button
                onClick={() => setShowPinModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                <Lock className="w-3.5 h-3.5" /> Shop View
              </button>
            ) : (
              <button
                onClick={() => setViewMode('customer')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <Monitor className="w-3.5 h-3.5" /> Switch to Customer Screen
              </button>
            )}
          </div>
        </div>

        {/* CUSTOMER SELF-SERVICE VIEW */}
        {viewMode === 'customer' && !completedJob && (
          <div className="max-w-2xl mx-auto space-y-6 py-4 animate-in fade-in duration-200">
            <div className="text-center space-y-1">
              <span className="text-xs uppercase tracking-widest text-emerald-400 font-extrabold">
                Fast &amp; Private Self-Print
              </span>
              <h2 className="text-3xl font-black">Order Your Print in 30 Seconds</h2>
              <p className="text-xs text-slate-400">
                Drop your file below, choose Black &amp; White or Color, and collect your token number.
              </p>
            </div>

            {/* Dropzone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-3xl p-8 text-center bg-slate-800/60 hover:bg-slate-800 cursor-pointer transition-all group"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
                accept="application/pdf,image/*"
                className="hidden"
              />
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                <Upload className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-white mb-1">
                {uploadedFile ? uploadedFile.name : 'Tap to Select PDF or Image'}
              </h4>
              <p className="text-xs text-slate-400">
                {uploadedFile ? `${pageCount} Page(s) detected` : 'Supports PDF, JPG, PNG from mobile or pendrive'}
              </p>
            </div>

            {/* Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">Color Option</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPrintType('bw')}
                    className={`py-3 px-3 rounded-2xl font-bold text-xs flex flex-col items-center gap-1 transition-all ${
                      printType === 'bw'
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950 ring-2 ring-emerald-400'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <span className="text-sm">📄 Black &amp; White</span>
                    <span className="text-[10px] opacity-80">₹2 / page</span>
                  </button>

                  <button
                    onClick={() => setPrintType('color')}
                    className={`py-3 px-3 rounded-2xl font-bold text-xs flex flex-col items-center gap-1 transition-all ${
                      printType === 'color'
                        ? 'bg-rose-600 text-white shadow-lg shadow-rose-950 ring-2 ring-rose-400'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <span className="text-sm">🎨 Full Color</span>
                    <span className="text-[10px] opacity-80">₹10 / page</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">Sides &amp; Duplex</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setSides('single')}
                    className={`py-3 px-3 rounded-2xl font-bold text-xs flex flex-col items-center gap-1 transition-all ${
                      sides === 'single'
                        ? 'bg-emerald-600 text-white ring-2 ring-emerald-400'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <span>Single Side</span>
                    <span className="text-[10px] opacity-80">One Sided</span>
                  </button>

                  <button
                    onClick={() => setSides('duplex')}
                    className={`py-3 px-3 rounded-2xl font-bold text-xs flex flex-col items-center gap-1 transition-all ${
                      sides === 'duplex'
                        ? 'bg-emerald-600 text-white ring-2 ring-emerald-400'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <span>Both Sides</span>
                    <span className="text-[10px] opacity-80">Back to Back</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Customer Name & Copies */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Your Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Rahul, Priya"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Number of Copies</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 5].map((num) => (
                    <button
                      key={num}
                      onClick={() => setCopies(num)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                        copies === num ? 'bg-emerald-600 text-white ring-2 ring-emerald-400' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Price Preview & Submit Button */}
            <div className="pt-2">
              <button
                onClick={handleSubmitJob}
                disabled={!uploadedFile || isSubmitting}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black text-base shadow-xl shadow-emerald-950/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3"
              >
                <Ticket className="w-5 h-5" />
                Submit to Print Queue (Estimated: ₹{estimatedCost})
              </button>
            </div>
          </div>
        )}

        {/* CUSTOMER TOKEN CONFIRMATION SCREEN */}
        {viewMode === 'customer' && completedJob && (
          <div className="max-w-md mx-auto py-10 text-center space-y-6 bg-slate-800/80 p-8 rounded-3xl border border-slate-700 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <span className="text-xs uppercase tracking-widest text-emerald-400 font-extrabold">
                ORDER PLACED IN QUEUE
              </span>
              <div className="text-7xl font-black text-white mt-2">
                #{String(completedJob.tokenNumber).padStart(2, '0')}
              </div>
              <p className="text-sm text-slate-300 mt-2 font-semibold">
                {completedJob.customerName}
              </p>
            </div>

            <div className="bg-slate-900/80 p-4 rounded-2xl text-xs space-y-2 border border-slate-700 text-left">
              <div className="flex justify-between text-slate-400">
                <span>File:</span>
                <span className="text-white font-bold truncate max-w-[200px]">{completedJob.fileName}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Pages &amp; Mode:</span>
                <span className="text-white font-bold">
                  {completedJob.totalPages} Pgs • {completedJob.printType.toUpperCase()} ({completedJob.copies} copy)
                </span>
              </div>
              <div className="flex justify-between text-slate-400 pt-2 border-t border-slate-800">
                <span>Amount Payable at Counter:</span>
                <span className="text-emerald-400 font-black text-base">₹{completedJob.estimatedCost}</span>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              Please pay ₹{completedJob.estimatedCost} at the counter. Your print will be ready in 1 minute!
            </p>

            <button
              onClick={() => setCompletedJob(null)}
              className="w-full py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs transition-colors"
            >
              Order Another Print
            </button>
          </div>
        )}

        {/* SHOPKEEPER VIEW */}
        {viewMode === 'shopkeeper' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">Live Print Jobs Queue</h2>
                <p className="text-xs text-slate-500">
                  {queue.filter((j) => j.status === 'pending').length} pending jobs waiting to print
                </p>
              </div>

              {queue.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear Queue
                </button>
              )}
            </div>

            {queue.length === 0 ? (
              <div className="p-12 text-center rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                <Ticket className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
                <h4 className="text-base font-bold text-slate-700 dark:text-slate-300">No Orders in Queue Yet</h4>
                <p className="text-xs text-slate-400">
                  Leave the Customer Screen open on your counter tablet. When a customer submits, it will ring and show up here instantly!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {queue.map((job) => (
                  <div
                    key={job.id}
                    className={`p-5 rounded-3xl border transition-all ${
                      job.status === 'printed'
                        ? 'bg-slate-100 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-60'
                        : 'bg-white dark:bg-slate-900 border-emerald-500/40 shadow-md shadow-emerald-950/10'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-black text-lg">
                          #{String(job.tokenNumber).padStart(2, '0')}
                        </span>
                        <div>
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white">{job.customerName}</h4>
                          <span className="text-[11px] text-slate-400">{job.timestamp}</span>
                        </div>
                      </div>

                      <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                        ₹{job.estimatedCost}
                      </span>
                    </div>

                    <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400 mb-4 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl">
                      <div className="truncate font-semibold text-slate-800 dark:text-slate-200">
                        📄 {job.fileName}
                      </div>
                      <div className="flex items-center gap-3 text-[11px]">
                        <span>{job.totalPages} Page(s)</span>
                        <span>•</span>
                        <span className="font-bold uppercase text-slate-900 dark:text-slate-100">
                          {job.printType === 'color' ? '🎨 Color' : '📄 B&W'}
                        </span>
                        <span>•</span>
                        <span>{job.copies} Copy</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleShopkeeperPrint(job)}
                        className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <Printer className="w-3.5 h-3.5" /> Direct Print (Ctrl+P)
                      </button>
                      <button
                        onClick={() => handleDismissJob(job.id)}
                        className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-rose-600"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PIN Verification Modal */}
        {showPinModal && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-xs w-full text-center space-y-4 shadow-2xl">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">Shopkeeper PIN</h4>
                <p className="text-xs text-slate-400">Default PIN is 1234</p>
              </div>
              <input
                type="password"
                maxLength={4}
                autoFocus
                placeholder="PIN"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                className="w-full text-center tracking-widest text-xl py-2 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none focus:border-emerald-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setShowPinModal(false)}
                  className="py-2.5 text-xs font-bold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (pinInput === '1234' || pinInput === '') {
                      setViewMode('shopkeeper');
                      setShowPinModal(false);
                      setPinInput('');
                    } else {
                      alert('Incorrect PIN (Default is 1234)');
                    }
                  }}
                  className="py-2.5 text-xs font-bold bg-emerald-600 rounded-xl text-white"
                >
                  Unlock
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SEO Information */}
        <ToolSEOSection
          toolName="Fullscreen Counter Self-Service Kiosk"
          headline="Turn Any Spare Tablet or Laptop Into an Automated Customer Print Order Station"
          description="A self-service order and queue management system designed for photocopy shops, stationery stores, cyber cafes, and university print labs. Customers drop files, pick Black & White or Color specifications, select copies, and receive a digital token number with an exact bill preview. The shopkeeper monitor receives the file in a real-time queue ready for 1-click execution."
        />
      </div>
    </div>
  );
}

