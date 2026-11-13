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
  Copy,
  Check,
  ShieldCheck,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { apiFetch } from '../lib/api';
import {
  generateSecretToken,
  encryptBytesWithKey,
  decryptBytesWithKey,
} from '../lib/privacy';

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

const KIOSK_STATION_ID_KEY = 'pms_kiosk_station_id';
const KIOSK_STATION_SECRET_KEY = 'pms_kiosk_station_secret';
const KIOSK_E2EE_KEY = 'pms_kiosk_e2ee_key';
const KIOSK_SHOP_PIN_KEY = 'pms_kiosk_shop_pin';

const makeKioskStationId = (): string => {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let suffix = '';
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const arr = new Uint8Array(6);
    window.crypto.getRandomValues(arr);
    for (let i = 0; i < 6; i++) suffix += chars[arr[i] % chars.length];
  } else {
    for (let i = 0; i < 6; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `KS${suffix}`;
};

const parseKioskHashKey = (hashStr: string): string => {
  try {
    const clean = hashStr.startsWith('#') ? hashStr.slice(1) : hashStr;
    return (new URLSearchParams(clean).get('k') || '').trim();
  } catch {
    return '';
  }
};

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

  const [stationId] = useState<string>(() => {
    if (typeof window === 'undefined') return 'KSDEFAULT';
    const urlStation = (new URLSearchParams(window.location.search).get('station') || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (urlStation.length >= 4 && urlStation !== 'KIOSKSTATION') return urlStation;
    try {
      const saved = localStorage.getItem(KIOSK_STATION_ID_KEY);
      if (saved && saved !== 'KIOSKSTATION') return saved;
      const fresh = makeKioskStationId();
      localStorage.setItem(KIOSK_STATION_ID_KEY, fresh);
      return fresh;
    } catch {
      return makeKioskStationId();
    }
  });

  const [isPairedTablet] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'kiosk' && Boolean(params.get('station'));
  });

  const [stationReadToken] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    // Paired customer tablets do NOT receive read permission for other customers' jobs
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'kiosk' && params.get('station')) return '';
    try {
      let tok = localStorage.getItem(KIOSK_STATION_SECRET_KEY) || '';
      if (!tok || tok.length < 16) {
        tok = generateSecretToken(24);
        localStorage.setItem(KIOSK_STATION_SECRET_KEY, tok);
      }
      return tok;
    } catch {
      return generateSecretToken(24);
    }
  });

  const [stationE2eeKey] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const hashKey = parseKioskHashKey(window.location.hash || '');
    if (hashKey) return hashKey;
    try {
      let k = localStorage.getItem(KIOSK_E2EE_KEY) || '';
      if (!k || k.length < 32) {
        k = generateSecretToken(32);
        localStorage.setItem(KIOSK_E2EE_KEY, k);
      }
      return k;
    } catch {
      return generateSecretToken(32);
    }
  });

  const [copiedTabletLink, setCopiedTabletLink] = useState(false);
  const [viewMode, setViewMode] = useState<'customer' | 'shopkeeper'>('customer');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [newShopPin, setNewShopPin] = useState('');
  const [pinSavedMsg, setPinSavedMsg] = useState('');
  const [queue, setQueue] = useState<KioskJob[]>(() => {
    try {
      // Wipe legacy unencrypted localStorage key if present
      localStorage.removeItem('pms_kiosk_queue');
      const saved = sessionStorage.getItem('pms_kiosk_session_queue');
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
  const queueUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const urls = queueUrlsRef.current;
    return () => {
      urls.forEach((u) => {
        try { URL.revokeObjectURL(u); } catch {}
      });
      urls.clear();
    };
  }, []);

  // BroadcastChannel + Authenticated Cloud Relay Polling (Isolated per-shop room)
  useEffect(() => {
    const channel = new BroadcastChannel(`pms_kiosk_sync_${stationId}`);
    channel.onmessage = (event) => {
      if (event.data?.type === 'QUEUE_UPDATE') {
        setQueue(event.data.queue);
      }
    };

    if (!stationReadToken || isPairedTablet) {
      return () => channel.close();
    }

    let isRegistered = false;
    const registerStation = async () => {
      try {
        const fd = new FormData();
        fd.append('session_id', stationId);
        fd.append('read_token', stationReadToken);
        const res = await apiFetch('/api/print-drop/register', { method: 'POST', body: fd });
        if (res.ok) isRegistered = true;
      } catch {}
    };

    // Register immediately on mount so paired tablets or direct uploads never hit an inactive room window
    void registerStation();

    const pollInterval = setInterval(async () => {
      try {
        if (!isRegistered) await registerStation();
        let res = await apiFetch(`/api/print-drop/jobs/${stationId}`, {
          headers: { 'X-Room-Token': stationReadToken },
        });
        if (res.status === 412) {
          await registerStation();
          res = await apiFetch(`/api/print-drop/jobs/${stationId}`, {
            headers: { 'X-Room-Token': stationReadToken },
          });
        }
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data?.jobs) && data.jobs.length > 0) {
          const incomingJobs: KioskJob[] = [];
          for (const j of data.jobs) {
            let blobUrl = '';
            try {
              const fileRes = await apiFetch(
                `/api/print-drop/file/${stationId}/${encodeURIComponent(j.id)}`,
                { headers: { 'X-Room-Token': stationReadToken } }
              );
              if (fileRes.ok) {
                const rawBuf = await fileRes.arrayBuffer();
                const { buffer: plainBuf } = await decryptBytesWithKey(rawBuf, stationE2eeKey);
                blobUrl = URL.createObjectURL(new Blob([plainBuf], { type: j.type || 'application/pdf' }));
                queueUrlsRef.current.add(blobUrl);
              }
            } catch {}
            incomingJobs.push({
              id: j.id || `kiosk_${Date.now()}`,
              tokenNumber: j.tokenNum || j.token_num || 1,
              customerName: j.deviceLabel || j.device_label || `Customer #${j.tokenNum || j.token_num || 1}`,
              phone: j.senderDeviceId && j.senderDeviceId !== 'kiosk_tablet' ? j.senderDeviceId : '',
              fileName: j.name || 'Document.pdf',
              fileSize: j.size || 0,
              fileDataUrl: blobUrl,
              totalPages: 1,
              printType: (j.colorMode || j.color_mode) === 'color' ? 'color' : 'bw',
              sides: 'single',
              copies: j.copies || 1,
              estimatedCost: Math.max(2, (j.copies || 1) * ((j.colorMode || j.color_mode) === 'color' ? 10 : 2)),
              timestamp: j.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              status: 'pending',
            });
          }
          setQueue((prev) => {
            const existingIds = new Set(prev.map((item) => item.id));
            const uniqueNew = incomingJobs.filter((item) => !existingIds.has(item.id));
            return uniqueNew.length > 0 ? [...prev, ...uniqueNew] : prev;
          });
        }
      } catch {}
    }, 3500);

    return () => {
      channel.close();
      clearInterval(pollInterval);
    };
  }, [stationId, stationReadToken, stationE2eeKey, isPairedTablet]);

  const saveQueue = (newQueue: KioskJob[]) => {
    setQueue(newQueue);
    try {
      // Ephemeral sessionStorage only (never lingers permanently on shared PCs after tab closes)
      const safeQueue = newQueue.slice(0, 50).map(({ fileDataUrl, ...meta }) => ({
        ...meta,
        fileDataUrl: fileDataUrl.startsWith('blob:') ? fileDataUrl : '',
      }));
      sessionStorage.setItem('pms_kiosk_session_queue', JSON.stringify(safeQueue));
    } catch {}
    try {
      const channel = new BroadcastChannel(`pms_kiosk_sync_${stationId}`);
      channel.postMessage({ type: 'QUEUE_UPDATE', queue: newQueue });
      channel.close();
    } catch {}
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
    const nextBlobUrl = URL.createObjectURL(file);
    queueUrlsRef.current.add(nextBlobUrl);
    setFileDataUrl(nextBlobUrl);

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      try {
        const buf = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        setPageCount(Math.max(1, doc.numPages));
        try { await doc.destroy(); } catch {}
      } catch {
        setPageCount(1);
      }
    } else {
      setPageCount(1);
    }
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

    // Encrypt & push to isolated shop station relay when a separate Operator PC is paired
    if (uploadedFile) {
      void (async () => {
        try {
          let payloadBlob: Blob = uploadedFile;
          if (stationE2eeKey) {
            const plainBuf = await uploadedFile.arrayBuffer();
            const encBuf = await encryptBytesWithKey(plainBuf, stationE2eeKey);
            payloadBlob = new Blob([encBuf], { type: 'application/octet-stream' });
          }
          const fd = new FormData();
          fd.append('session_id', stationId);
          fd.append('job_id', newJob.id);
          fd.append('sender_device_id', customerPhone.trim() || 'kiosk_tablet');
          fd.append('device_label', newJob.customerName);
          fd.append('copies', String(copies));
          fd.append('color_mode', printType);
          fd.append('orientation', 'auto');
          fd.append('file', payloadBlob, uploadedFile.name);
          await apiFetch('/api/print-drop/upload', {
            method: 'POST',
            body: fd,
          });
        } catch {}
      })();
    }
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
    try {
      if (job.fileDataUrl.startsWith('data:') || job.fileDataUrl.startsWith('blob:')) {
        let blobUrl = job.fileDataUrl;
        let transient = false;
        if (job.fileDataUrl.startsWith('data:')) {
          const parts = job.fileDataUrl.split(';base64,');
          const mime = parts[0]?.split(':')[1] || 'application/pdf';
          const raw = atob(parts[1] || '');
          const arr = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
          blobUrl = URL.createObjectURL(new Blob([arr], { type: mime }));
          transient = true;
        }
        window.open(blobUrl, '_blank');
        if (transient) {
          setTimeout(() => { try { URL.revokeObjectURL(blobUrl); } catch {} }, 60000);
        }
      } else {
        window.open(job.fileDataUrl, '_blank');
      }
    } catch {
      window.open(job.fileDataUrl, '_blank');
    }
    const updated = queue.map((j) => (j.id === job.id ? { ...j, status: 'printed' as const } : j));
    saveQueue(updated);
  };

  const handleDismissJob = (jobId: string) => {
    const target = queue.find((j) => j.id === jobId);
    if (target?.fileDataUrl?.startsWith('blob:')) {
      try { URL.revokeObjectURL(target.fileDataUrl); } catch {}
      queueUrlsRef.current.delete(target.fileDataUrl);
    }
    const updated = queue.filter((j) => j.id !== jobId);
    saveQueue(updated);
  };

  const handleClearAll = () => {
    if (confirm('Clear all completed and pending print queue items?')) {
      queue.forEach((j) => {
        if (j.fileDataUrl?.startsWith('blob:')) {
          try { URL.revokeObjectURL(j.fileDataUrl); } catch {}
          queueUrlsRef.current.delete(j.fileDataUrl);
        }
      });
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">Live Print Jobs Queue</h2>
                <p className="text-xs text-slate-500 flex items-center gap-2">
                  <span>{queue.filter((j) => j.status === 'pending').length} pending jobs waiting to print</span>
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                    <ShieldCheck className="w-3.5 h-3.5" /> Station: {stationId} (E2EE Isolated)
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1.5 bg-slate-200/80 dark:bg-slate-800 px-2.5 py-1.5 rounded-xl">
                  <input
                    type="password"
                    maxLength={4}
                    inputMode="numeric"
                    placeholder="New 4-digit PIN"
                    value={newShopPin}
                    onChange={(e) => setNewShopPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-24 bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    disabled={newShopPin.length !== 4}
                    onClick={() => {
                      try {
                        localStorage.setItem(KIOSK_SHOP_PIN_KEY, newShopPin);
                        setNewShopPin('');
                        setPinSavedMsg('PIN updated');
                        setTimeout(() => setPinSavedMsg(''), 2000);
                      } catch {}
                    }}
                    className="px-2 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 text-white disabled:opacity-40"
                  >
                    {pinSavedMsg || 'Set PIN'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const pairUrl = `${window.location.origin}/counter-kiosk?station=${stationId}&mode=kiosk${stationE2eeKey ? `#k=${stationE2eeKey}` : ''}`;
                    navigator.clipboard.writeText(pairUrl).catch(() => {});
                    setCopiedTabletLink(true);
                    setTimeout(() => setCopiedTabletLink(false), 2000);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-200/80 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors"
                >
                  {copiedTabletLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedTabletLink ? 'Tablet Link Copied!' : 'Copy Paired Tablet Link'}
                </button>
                {queue.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Clear Queue
                  </button>
                )}
              </div>
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
                <p className="text-xs text-slate-400">Enter your 4-digit shopkeeper counter PIN</p>
              </div>
              <input
                type="password"
                maxLength={4}
                autoFocus
                placeholder="PIN"
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  if (pinError) setPinError('');
                }}
                className="w-full text-center tracking-widest text-xl py-2 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none focus:border-emerald-500"
              />
              {pinError && <p className="text-xs font-semibold text-rose-400">{pinError}</p>}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setShowPinModal(false);
                    setPinError('');
                  }}
                  className="py-2.5 text-xs font-bold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const expectedPin = (() => {
                      try {
                        return localStorage.getItem(KIOSK_SHOP_PIN_KEY) || '1234';
                      } catch {
                        return '1234';
                      }
                    })();
                    if (pinInput.trim() === expectedPin) {
                      setViewMode('shopkeeper');
                      setShowPinModal(false);
                      setPinInput('');
                      setPinError('');
                    } else {
                      setPinError('Incorrect PIN. Please enter your shopkeeper PIN.');
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

