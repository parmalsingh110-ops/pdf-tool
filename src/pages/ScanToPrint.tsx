import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  ShieldCheck,
  Zap,
  RefreshCw,
  Clock,
  Layers,
  RotateCcw,
  Check,
  Plus,
  Minus,
  Wifi,
  WifiOff,
  AlertCircle,
  Radio,
  Send,
  Laptop,
  Monitor,
  Edit3,
  Users,
  List,
  LayoutGrid,
  X,
  Store,
  Camera,
  Share2,
} from 'lucide-react';
import { Peer } from 'peerjs';
import QRCode from 'qrcode';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { apiFetch, API_BASE } from '../lib/api';
import { escapeHtml } from '../lib/utils';
import {
  generateSecretToken,
  encryptBytesWithKey,
  decryptBytesWithKey,
} from '../lib/privacy';
import {
  getSharedFilesFromCache,
  clearSharedFilesCache,
  promptPWAInstall,
  subscribePWAInstall,
  subscribeSharedFilesReady,
  isPWARunningStandalone,
} from '../lib/shareTarget';

// ─── Types ─────────────────────────────────────────────────────────────────
interface PrintJob {
  id: string;
  tokenNum: number;
  senderDeviceId?: string;
  deviceLabel?: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string;
  timestamp: string;
  pages?: number;
  copies: number;
  colorMode: 'bw' | 'color';
  orientation?: 'auto' | 'portrait' | 'landscape';
  detectedOrientation?: 'portrait' | 'landscape';
  status: 'pending' | 'printed';
  printedAt?: string;
}

interface IncomingTransfer {
  jobId: string;
  senderDeviceId?: string;
  deviceLabel?: string;
  name: string;
  size: number;
  type: string;
  timestamp: string;
  totalChunks: number;
  chunks: (ArrayBuffer | undefined)[];  // Sparse array indexed by chunk number
  receivedCount: number;
  receivedBytes: number;                // Incremental byte count for O(1) progress tracking
  copies: number;
  colorMode: 'bw' | 'color';
  lastUpdated: number;                  // Watchdog timestamp to prevent stuck transfers
}

interface CustomerGroup {
  customerToken: number;
  senderDeviceId: string;
  deviceLabel: string;
  firstTimestamp: string;
  jobs: PrintJob[];
  pendingJobs: PrintJob[];
  printedJobs: PrintJob[];
  totalPrints: number;
  totalFiles: number;
  isComplete: boolean;
}

// ─── Storage Keys ──────────────────────────────────────────────────────────
const PMS_PERMANENT_PIN_KEY = 'pms_permanent_counter_pin';
const PMS_ROOM_SECRET_KEY = 'pms_permanent_room_secret';
const PMS_ROOM_E2EE_KEY = 'pms_permanent_room_e2ee_key';
const PMS_SHOP_NAME_KEY = 'pms_shop_name';
const PMS_SENDER_DEVICE_ID_KEY = 'pms_sender_device_id';

const parseE2eeKeyFromHash = (hashStr: string): string => {
  try {
    const clean = hashStr.startsWith('#') ? hashStr.slice(1) : hashStr;
    const p = new URLSearchParams(clean);
    return (p.get('k') || '').trim();
  } catch {
    return '';
  }
};

const getSenderDeviceId = (): string => {
  if (typeof window === 'undefined') return 'dev_' + Date.now().toString(36);
  try {
    let id = localStorage.getItem(PMS_SENDER_DEVICE_ID_KEY);
    if (!id) {
      id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
      localStorage.setItem(PMS_SENDER_DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'dev_' + Date.now().toString(36);
  }
};

const getDeviceLabel = (): string => {
  if (typeof window === 'undefined') return 'Mobile';
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'Mobile Phone' : 'PC / Laptop';
};

// ─── Constants ─────────────────────────────────────────────────────────────
// Adaptive chunk sizes — browsers support up to 256 KB on modern WebRTC SCTP
// Start at 64 KB, can grow to 256 KB depending on network speed
const CHUNK_SIZE_SMALL  = 64  * 1024;  // 64 KB  — for first few chunks (safe warm-up)
const CHUNK_SIZE_MEDIUM = 128 * 1024;  // 128 KB — after stable connection detected
const CHUNK_SIZE_LARGE  = 256 * 1024;  // 256 KB — for fast WiFi / high-throughput links
const BUFFER_THRESHOLD  = 1   * 1024 * 1024; // 1 MB — pause sending if buffer exceeds 1 MB
const BUFFER_LOW_MARK   = 256 * 1024;  // 256 KB — resume sending once buffer drains here
const WINDOW_SIZE       = 8;           // Send 8 chunks ahead without waiting for each ACK

// STUN + Free TURN for NAT traversal (most enterprise / CGNAT networks need TURN)
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  // Free TURN relay (open.relay.metered.ca) — required for symmetric NAT / 4G
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turns:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

const PIN_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const generateCleanPin = (): string => {
  let pin = '';
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const arr = new Uint8Array(6);
    window.crypto.getRandomValues(arr);
    for (let i = 0; i < 6; i++) {
      pin += PIN_CHARS[arr[i] % PIN_CHARS.length];
    }
    return pin;
  }
  for (let i = 0; i < 6; i++) {
    pin += PIN_CHARS[Math.floor(Math.random() * PIN_CHARS.length)];
  }
  return pin;
};

// ─── Helpers ────────────────────────────────────────────────────────────────
const formatFileSize = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
};

/** Build an ArrayBuffer from a dataURL, blob URL, or http URL */
const urlToArrayBuffer = async (url: string): Promise<{ buffer: ArrayBuffer; type: string }> => {
  if (url.startsWith('blob:') || url.startsWith('http')) {
    const res = await fetch(url);
    const blob = await res.blob();
    return { buffer: await blob.arrayBuffer(), type: blob.type || 'application/pdf' };
  }
  const [header, b64] = url.split(';base64,');
  const type = header?.split(':')[1] || 'application/pdf';
  const raw = atob(b64 || '');
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return { buffer: buf.buffer as ArrayBuffer, type };
};

const arrayBufferToBlob = (buf: ArrayBuffer, type: string) =>
  new Blob([buf], { type });

// ─── Audio Singleton (avoid browser context limit crash) ───────────────────
let sharedAudioCtx: AudioContext | null = null;
const getAudioContext = (): AudioContext | null => {
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
};

// ─── Component ──────────────────────────────────────────────────────────────
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

  // ── URL / mode detection ─────────────────────────────────────────────────
  const [sessionCode, setSessionCode] = useState<string>('');
  const [roomReadToken, setRoomReadToken] = useState<string>('');
  const [counterE2eeKey, setCounterE2eeKey] = useState<string>('');
  const [senderE2eeKey, setSenderE2eeKey] = useState<string>('');
  const [isSenderMode, setIsSenderMode] = useState<boolean>(false);
  const [targetCounterPin, setTargetCounterPin] = useState<string>('');
  const [pinDigits, setPinDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [recentPins, setRecentPins] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const pinInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── Permanent PIN & Shop Identity State ──────────────────────────────────
  const [shopName, setShopName] = useState<string>('Cyber Cafe & E-Mitra Print Station');
  const [showPinModal, setShowPinModal] = useState<boolean>(false);
  const [customPinInput, setCustomPinInput] = useState<string>('');
  const [customShopNameInput, setCustomShopNameInput] = useState<string>('');
  const [pinNotice, setPinNotice] = useState<string | null>(null);

  // ── Shopkeeper Queue state ───────────────────────────────────────────────
  const [printJobs, setPrintJobs] = useState<PrintJob[]>([]);
  const [queueTab, setQueueTab] = useState<'pending' | 'printed'>('pending');
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
  const [isPrintingCustomerToken, setIsPrintingCustomerToken] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [peerStatus, setPeerStatus] = useState<'connecting' | 'online' | 'cloud' | 'error'>('connecting');
  const peerRetryCountRef = useRef<number>(0);
  const [connectedMobiles, setConnectedMobiles] = useState<number>(0);
  const [incomingProgress, setIncomingProgress] = useState<{ name: string; progress: number } | null>(null);
  const [printingJobId, setPrintingJobId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  // ── Sender state (Mobile & PC/Laptop) ────────────────────────────────────
  const [senderFiles, setSenderFiles] = useState<File[]>([]);
  const [senderUploading, setSenderUploading] = useState(false);
  const [senderProgress, setSenderProgress] = useState(0);
  const [senderStatusText, setSenderStatusText] = useState('Beaming to Counter PC...');
  const [senderSuccess, setSenderSuccess] = useState(false);
  const [customerToken, setCustomerToken] = useState<number | null>(null);
  const [deliveredBatch, setDeliveredBatch] = useState<{ name: string; size: number; copies: number; colorMode: 'bw' | 'color' }[]>([]);
  const [senderCopies, setSenderCopies] = useState<number>(1);
  const [senderColorMode, setSenderColorMode] = useState<'bw' | 'color'>('bw');
  const [mobileConnectionStatus, setMobileConnectionStatus] = useState<'connecting' | 'connected' | 'fallback'>('connecting');
  const [peerReconnectKey, setPeerReconnectKey] = useState<number>(0);

  // ── Web Share Target (WhatsApp / File Share), QR Scanner & PWA state ────
  const [canInstallPWA, setCanInstallPWA] = useState<boolean>(false);
  const [isSharedFromExternal, setIsSharedFromExternal] = useState<boolean>(false);
  const [sharedSourceTitle, setSharedSourceTitle] = useState<string>('');
  const [showQrScanner, setShowQrScanner] = useState<boolean>(false);
  const [qrScanError, setQrScanError] = useState<string | null>(null);
  const qrVideoRef = useRef<HTMLVideoElement | null>(null);

  // ── Peer & Channel refs ──────────────────────────────────────────────────
  const peerRef = useRef<Peer | null>(null);
  const mobileConnRef = useRef<any>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const incomingTransfersRef = useRef<Record<string, IncomingTransfer>>({});
  const ackResolversRef = useRef<Record<string, (token?: number) => void>>({});
  const tokenCounterRef = useRef<number>(1);
  const deviceTokenMapRef = useRef<Record<string, number>>({});
  const pollBackoffRef = useRef<number>(3500);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const senderAbortRef = useRef<boolean>(false);

  // ── PIN Entry & File Selection Helpers ────────────────────────────────────
  const handleConnectWithPin = useCallback((pinToConnect: string) => {
    const cleanPin = pinToConnect.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleanPin.length < 3 || cleanPin.length > 10) return;
    setTargetCounterPin(cleanPin);
    setMobileConnectionStatus('connecting');

    try {
      const storedRecent = localStorage.getItem('pms_recent_counter_pins');
      const list: string[] = storedRecent ? JSON.parse(storedRecent) : [];
      const updated = [cleanPin, ...list.filter((p) => p !== cleanPin)].slice(0, 5);
      localStorage.setItem('pms_recent_counter_pins', JSON.stringify(updated));
      setRecentPins(updated);
    } catch {}

    setPeerReconnectKey((k) => k + 1);
  }, []);

  const handlePinDigitChange = (index: number, val: string) => {
    const char = val.slice(-1).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const newDigits = [...pinDigits];
    newDigits[index] = char;
    setPinDigits(newDigits);

    if (char && index < 5) {
      pinInputRefs.current[index + 1]?.focus();
    }

    const full = newDigits.join('');
    if (full.length === 6) {
      handleConnectWithPin(full);
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      pinInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'Enter') {
      const full = pinDigits.join('').trim();
      if (full.length >= 3) {
        handleConnectWithPin(full);
      }
    }
  };

  const handlePinPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (text.length >= 3) {
      const clipped = text.slice(0, 10);
      const chars = clipped.slice(0, 6).split('');
      while (chars.length < 6) chars.push('');
      setPinDigits(chars);
      handleConnectWithPin(clipped);
    }
  };

  const handleFilesSelected = useCallback((files: File[], isFromCamera = false) => {
    const valid: File[] = [];
    let hasOver100Mb = false;
    const timeTag = new Date().toTimeString().slice(0, 8).replace(/:/g, '');

    files.forEach((f, idx) => {
      if (f.size > 100 * 1024 * 1024) {
        hasOver100Mb = true;
      } else {
        // Rename generic mobile camera captures (image.jpg / photo.jpg) so multiple scans never collide
        let fileToQueue = f;
        if (isFromCamera || /^image\.\w+$|^photo\.\w+$/i.test(f.name)) {
          const ext = f.name.split('.').pop() || 'jpg';
          fileToQueue = new File([f], `Camera_Scan_${timeTag}_${idx + 1}.${ext}`, {
            type: f.type || 'image/jpeg',
            lastModified: Date.now(),
          });
        }
        valid.push(fileToQueue);
      }
    });

    if (hasOver100Mb) {
      alert('Files larger than 100 MB cannot be transferred. Please select smaller files.');
    }

    if (valid.length > 0) {
      setSenderSuccess(false);
      setSenderFiles((prev) => {
        const merged = [...prev];
        for (const nf of valid) {
          if (!merged.some((ef) => ef.name === nf.name && ef.size === nf.size)) {
            merged.push(nf);
          }
        }
        return merged;
      });
    }
  }, []);

  const removeSenderFile = useCallback((indexToRemove: number) => {
    setSenderFiles((prev) => {
      const next = prev.filter((_, idx) => idx !== indexToRemove);
      if (next.length === 0) {
        void clearSharedFilesCache();
        setIsSharedFromExternal(false);
      }
      return next;
    });
  }, []);

  // ─── Notification Chime (Singleton Context) ─────────────────────────────
  const playChime = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch {}
  }, [soundEnabled]);

  // ─── Background PDF Page & Orientation Detector ─────────────────────────
  const detectPdfPages = useCallback(async (jobId: string, dataUrl: string, cancelledRef: { current: boolean }) => {
    try {
      const { buffer } = await urlToArrayBuffer(dataUrl);
      if (cancelledRef.current) return;
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
      const pdf = await loadingTask.promise;
      if (cancelledRef.current) { loadingTask.destroy?.(); return; }
      const numPages = pdf.numPages;
      let detectedOrientation: 'portrait' | 'landscape' = 'portrait';
      if (numPages > 0) {
        try {
          const firstPage = await pdf.getPage(1);
          const vp = firstPage.getViewport({ scale: 1.0 });
          if (vp.width > vp.height) {
            detectedOrientation = 'landscape';
          }
        } catch {}
      }
      if (cancelledRef.current) return;
      setPrintJobs((prev) => {
        // Only update if job still exists in queue (race condition guard)
        if (!prev.some((j) => j.id === jobId)) return prev;
        return prev.map((j) => (j.id === jobId ? { ...j, pages: numPages, detectedOrientation } : j));
      });
    } catch {}
  }, []);

  // ─── Add Job with Deduplication & Device Bundling ────────────────────────
  const addIncomingJob = useCallback(
    (job: Omit<PrintJob, 'tokenNum' | 'status'> & { tokenNum?: number; status?: 'pending' | 'printed'; senderDeviceId?: string; deviceLabel?: string }) => {
      let isDuplicate = false;
      setPrintJobs((prev) => {
        // Deterministic deduplication by job ID or identical pending file from same device
        if (
          prev.some(
            (j) =>
              j.id === job.id ||
              (j.status === 'pending' &&
                j.senderDeviceId &&
                job.senderDeviceId &&
                j.senderDeviceId === job.senderDeviceId &&
                j.name === job.name &&
                j.size === job.size)
          )
        ) {
          isDuplicate = true;
          return prev;
        }
        playChime();

        // Customer Token resolution (group by sender device)
        let assignedToken = job.tokenNum;
        const devId = job.senderDeviceId;

        if (!assignedToken) {
          if (devId && deviceTokenMapRef.current[devId]) {
            assignedToken = deviceTokenMapRef.current[devId];
          } else {
            assignedToken = tokenCounterRef.current++;
            if (devId) deviceTokenMapRef.current[devId] = assignedToken;
          }
        } else {
          if (devId) deviceTokenMapRef.current[devId] = assignedToken;
          tokenCounterRef.current = Math.max(tokenCounterRef.current, assignedToken + 1);
        }

        const completeJob: PrintJob = {
          ...job,
          tokenNum: assignedToken,
          senderDeviceId: devId,
          deviceLabel: job.deviceLabel || (job.id.startsWith('local_') ? 'Counter PC' : 'Mobile Phone'),
          orientation: job.orientation || 'auto',
          status: job.status || 'pending',
        };
        return [completeJob, ...prev];
      });

      if (isDuplicate) return;

      // Detect pages & orientation in background if PDF
      if ((job.type === 'application/pdf' || job.name?.toLowerCase().endsWith('.pdf')) && !job.pages && job.dataUrl) {
        const cancelledRef = { current: false };
        void detectPdfPages(job.id, job.dataUrl, cancelledRef);
      }

      // Detect orientation if Image
      if (job.type.startsWith('image/') && job.dataUrl) {
        const img = new Image();
        img.onload = () => {
          const detectedOrientation = img.width > img.height ? 'landscape' : 'portrait';
          setPrintJobs((prev) => {
            if (!prev.some((j) => j.id === job.id)) return prev;
            return prev.map((j) => (j.id === job.id ? { ...j, detectedOrientation } : j));
          });
        };
        img.onerror = () => {};
        img.src = job.dataUrl;
      }
    },
    [playChime, detectPdfPages]
  );

  // ─── Session Initialization (Permanent Counter PIN) ─────────────────────
  useEffect(() => {
    // Load custom shop name if set
    try {
      const storedShop = localStorage.getItem(PMS_SHOP_NAME_KEY);
      if (storedShop) setShopName(storedShop);
    } catch {}

    try {
      const storedRecent = localStorage.getItem('pms_recent_counter_pins');
      if (storedRecent) setRecentPins(JSON.parse(storedRecent));
    } catch {}

    const params = new URLSearchParams(window.location.search);
    const existingSession = params.get('session');
    const isFromShare = params.get('from_share') === 'true' || params.get('mode') === 'send';

    // Always generate or load the Counter PIN, Room Read Secret, and E2EE Key
    let permanentPin = '';
    let roomSecret = '';
    let roomE2ee = '';
    try {
      permanentPin = localStorage.getItem(PMS_PERMANENT_PIN_KEY) || '';
      roomSecret = localStorage.getItem(PMS_ROOM_SECRET_KEY) || '';
      roomE2ee = localStorage.getItem(PMS_ROOM_E2EE_KEY) || '';
    } catch {}
    if (!permanentPin) {
      try {
        permanentPin = sessionStorage.getItem('pms_counter_session') || '';
      } catch {}
    }
    if (!permanentPin) {
      permanentPin = generateCleanPin();
    }
    if (!roomSecret || roomSecret.length < 16) {
      roomSecret = generateSecretToken(24);
    }
    if (!roomE2ee || roomE2ee.length < 32) {
      roomE2ee = generateSecretToken(32);
    }
    try {
      localStorage.setItem(PMS_PERMANENT_PIN_KEY, permanentPin);
      localStorage.setItem(PMS_ROOM_SECRET_KEY, roomSecret);
      localStorage.setItem(PMS_ROOM_E2EE_KEY, roomE2ee);
    } catch {}
    setRoomReadToken(roomSecret);
    setCounterE2eeKey(roomE2ee);

    const hashKey = parseE2eeKeyFromHash(window.location.hash || '');
    if (hashKey) {
      setSenderE2eeKey(hashKey);
    }

    if (existingSession) {
      const pin = existingSession.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      setSessionCode(pin);
      setTargetCounterPin(pin);
      setIsSenderMode(true);
      const chars = pin.slice(0, 6).split('');
      while (chars.length < 6) chars.push('');
      setPinDigits(chars);

      try {
        const storedRecent = localStorage.getItem('pms_recent_counter_pins');
        const list: string[] = storedRecent ? JSON.parse(storedRecent) : [];
        const updated = [pin, ...list.filter((p) => p !== pin)].slice(0, 5);
        localStorage.setItem('pms_recent_counter_pins', JSON.stringify(updated));
        setRecentPins(updated);
      } catch {}
    } else if (isFromShare) {
      // Opened via WhatsApp / System Share Target: start directly in Sender Mode!
      setSessionCode(permanentPin);
      setIsSenderMode(true);
    } else {
      // COUNTER PC default mode
      setSessionCode(permanentPin);
      setIsSenderMode(false);
    }
  }, []);

  // ─── PWA Install Prompt Listener ─────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribePWAInstall((canInstall) => {
      setCanInstallPWA(canInstall);
    });
    return () => unsub();
  }, []);

  // ─── Web Share Target / WhatsApp Direct Share Consumer ───────────────────
  const consumePendingSharedFiles = useCallback(async (forceSenderSwitch = false): Promise<boolean> => {
    try {
      const search = typeof window !== 'undefined' ? window.location.search : '';
      const hasShareUrlParam = search.includes('from_share=true') || search.includes('mode=send');
      // Never hijack a normal Counter Station tab into Sender Mode unless opened from Share/Open-With or already in Sender Mode
      if (!hasShareUrlParam && !isSenderMode && !forceSenderSwitch) {
        return false;
      }

      const bundle = await getSharedFilesFromCache();
      if (bundle && bundle.files.length > 0) {
        setIsSenderMode(true);
        setIsSharedFromExternal(true);
        if (bundle.title) setSharedSourceTitle(bundle.title);
        handleFilesSelected(bundle.files, false);
        // Clean the from_share / share_ts params from URL cleanly without reloading
        try {
          const cleanUrl = new URL(window.location.href);
          if (cleanUrl.searchParams.has('from_share') || cleanUrl.searchParams.has('share_ts')) {
            cleanUrl.searchParams.delete('from_share');
            cleanUrl.searchParams.delete('share_ts');
            window.history.replaceState({}, '', cleanUrl.toString());
          }
        } catch {}
        return true;
      }
    } catch (e) {
      console.warn('[ScanToPrint] Share target check error:', e);
    }
    return false;
  }, [handleFilesSelected, isSenderMode]);

  useEffect(() => {
    let cancelled = false;
    const retryTimers: ReturnType<typeof setTimeout>[] = [];
    const isShareEntry =
      typeof window !== 'undefined' &&
      (window.location.search.includes('from_share=true') || window.location.search.includes('mode=send'));

    if (isShareEntry || isSenderMode) {
      (async () => {
        const foundImmediately = await consumePendingSharedFiles(isShareEntry);
        if (!foundImmediately && !cancelled && isShareEntry) {
          // Multi-stage retries in case Android flash storage / Service Worker CacheStorage is still flushing
          for (const delay of [150, 450, 1000, 2200]) {
            const t = setTimeout(async () => {
              if (!cancelled) {
                await consumePendingSharedFiles(true);
              }
            }, delay);
            retryTimers.push(t);
          }
        }
      })();
    }

    const unsubShareReady = subscribeSharedFilesReady(() => {
      void consumePendingSharedFiles(true);
    });
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible' && isSenderMode) {
        void consumePendingSharedFiles(false);
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    return () => {
      cancelled = true;
      retryTimers.forEach((t) => clearTimeout(t));
      unsubShareReady();
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [consumePendingSharedFiles, targetCounterPin, isSenderMode]);

  // ─── Built-In Live Camera QR Code Scanner (for WhatsApp Share / Sender) ──
  useEffect(() => {
    if (!showQrScanner) return;
    let activeStream: MediaStream | null = null;
    let scanInterval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    setQrScanError(null);

    (async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setQrScanError('Camera access is not available in this browser. Please enter the 6-digit PIN manually.');
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        activeStream = stream;
        if (qrVideoRef.current) {
          qrVideoRef.current.srcObject = stream;
          await qrVideoRef.current.play().catch(() => {});
        }

        const BarcodeDetectorClass = (window as any).BarcodeDetector;
        if (!BarcodeDetectorClass) {
          setQrScanError('Live QR auto-detection is not supported on this browser version. Please type the Counter PIN shown below the QR.');
          return;
        }

        const detector = new BarcodeDetectorClass({ formats: ['qr_code'] });
        scanInterval = setInterval(async () => {
          if (cancelled || !qrVideoRef.current || qrVideoRef.current.readyState < 2) return;
          try {
            const barcodes = await detector.detect(qrVideoRef.current);
            if (barcodes && barcodes.length > 0) {
              const raw = String(barcodes[0].rawValue || '').trim();
              if (!raw) return;

              let extractedPin = '';
              let extractedHashKey = '';
              try {
                const parsedUrl = new URL(raw);
                extractedPin = (parsedUrl.searchParams.get('session') || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                extractedHashKey = parseE2eeKeyFromHash(parsedUrl.hash || '');
              } catch {
                extractedPin = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
              }

              if (extractedPin.length >= 3 && extractedPin.length <= 10) {
                if (scanInterval) clearInterval(scanInterval);
                stream.getTracks().forEach((t) => t.stop());
                playChime();
                if (extractedHashKey) {
                  setSenderE2eeKey(extractedHashKey);
                }
                const chars = extractedPin.slice(0, 6).split('');
                while (chars.length < 6) chars.push('');
                setPinDigits(chars);
                setShowQrScanner(false);
                handleConnectWithPin(extractedPin);
              }
            }
          } catch {}
        }, 160);
      } catch {
        setQrScanError('Camera permission denied or unavailable. Please type the Counter PIN manually.');
      }
    })();

    return () => {
      cancelled = true;
      if (scanInterval) clearInterval(scanInterval);
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [showQrScanner, handleConnectWithPin, playChime]);

  // ─── BroadcastChannel (Cross-Tab & PWA-to-Counter Leader/Follower Sync) ──
  useEffect(() => {
    const activeCode = isSenderMode ? (targetCounterPin || sessionCode) : sessionCode;
    if (!activeCode) return;
    const bc = new BroadcastChannel(`pdfmediasuite_print_${activeCode.toUpperCase()}`);
    channelRef.current = bc;

    bc.onmessage = (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      // 1. Direct Job Beamed from another tab / PWA window on the same PC
      if ((data.action === 'NEW_PRINT_JOB' || data.action === 'SYNC_JOB_TO_SIBLINGS') && !isSenderMode && data.job) {
        let localBlobUrl = data.job.dataUrl || '';
        if (data.fileBlob instanceof Blob) {
          try {
            localBlobUrl = URL.createObjectURL(data.fileBlob);
          } catch {}
        }
        let tokenNum = data.job.tokenNum || 0;
        const devId = data.job.senderDeviceId;
        if (!tokenNum) {
          if (devId && deviceTokenMapRef.current[devId]) {
            tokenNum = deviceTokenMapRef.current[devId];
          } else {
            tokenNum = tokenCounterRef.current++;
            if (devId) deviceTokenMapRef.current[devId] = tokenNum;
          }
        }
        addIncomingJob({ ...data.job, tokenNum, dataUrl: localBlobUrl, status: 'pending' });

        if (data.action === 'NEW_PRINT_JOB') {
          try {
            bc.postMessage({
              action: 'BC_JOB_ACK',
              jobId: data.job.id,
              tokenNum,
              customerToken: tokenNum,
            });
          } catch {}
        }
      }

      // 2. Sender tab receiving instant ACK from Counter tab on same PC
      else if (data.action === 'BC_JOB_ACK' && isSenderMode && data.jobId) {
        const assignedTok = data.customerToken || data.tokenNum;
        if (assignedTok) setCustomerToken(assignedTok);
        const resolver = ackResolversRef.current[data.jobId];
        if (resolver) {
          resolver(assignedTok);
          delete ackResolversRef.current[data.jobId];
        }
      }

      // 3. Multi-Tab Leader/Follower Online Status Synchronization
      else if (data.action === 'PING_LEADER' && !isSenderMode) {
        if (peerRef.current && !peerRef.current.destroyed && !peerRef.current.disconnected) {
          try {
            bc.postMessage({ action: 'LEADER_ONLINE' });
          } catch {}
        }
      } else if (data.action === 'LEADER_ONLINE') {
        if (!isSenderMode) {
          setPeerStatus('online');
          setPinNotice(null);
        } else {
          setMobileConnectionStatus('connected');
        }
      }
    };

    // Announce presence or check if a sibling Counter tab is already online on this PC
    try {
      bc.postMessage({ action: 'PING_LEADER' });
    } catch {}

    return () => {
      try {
        bc.close();
      } catch {}
    };
  }, [sessionCode, targetCounterPin, isSenderMode, addIncomingJob]);

  // ─── QR Code Generation ──────────────────────────────────────────────────
  // On localhost, a phone cannot resolve http://localhost:3000.
  // Use the live production URL so phones scanning the screen QR work instantly!
  const isLocalHostEnv = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const e2eeHashFragment = counterE2eeKey ? `#k=${counterE2eeKey}` : '';
  const mobileLink = typeof window !== 'undefined'
    ? isLocalHostEnv
      ? `https://www.pdfmediasuite.in/scan-to-print?session=${sessionCode}${e2eeHashFragment}`
      : `${window.location.origin}/scan-to-print?session=${sessionCode}${e2eeHashFragment}`
    : `https://www.pdfmediasuite.in/scan-to-print?session=${sessionCode}${e2eeHashFragment}`;

  useEffect(() => {
    if (!mobileLink || !sessionCode) return;
    QRCode.toDataURL(mobileLink, {
      width: 300,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => {
        setQrDataUrl('');
      });
  }, [mobileLink, sessionCode]);

  // ─── WebRTC PeerJS (Primary Transport, StrictMode-Safe with Auto-Heal) ───
  useEffect(() => {
    // In sender mode, wait until a valid 3 to 10-char target PIN is entered
    if (isSenderMode && (!targetCounterPin || targetCounterPin.length < 3)) {
      return;
    }

    const activeSession = isSenderMode ? targetCounterPin : sessionCode;
    if (!activeSession) return;

    const roomId = `pms-print-${activeSession.toLowerCase()}`;
    let peer: Peer | null = null;
    let watchdogTimer: ReturnType<typeof setInterval> | null = null;
    let connectTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    if (!isSenderMode) {
      setPeerStatus('connecting');
    }

    // 80ms debounce prevents React 19 <StrictMode> on localhost:3000 from creating & destroying
    // a duplicate Peer(roomId) within 1ms and locking the ID on 0.peerjs.com!
    const initTimer = setTimeout(() => {
      if (cancelled) return;

      if (!isSenderMode) {
        // ── COUNTER PC MODE ──────────────────────────────────────────────────
        peer = new Peer(roomId, {
          debug: 0,
          config: { iceServers: ICE_SERVERS },
        });
        peerRef.current = peer;

        // If signaling handshake stalls in 'connecting' for >5s, do NOT destroy peer in an infinite loop!
        // Keep peer listening in background and mark station ready via cloud relay
        connectTimeoutTimer = setTimeout(() => {
          if (!cancelled && peer && !peer.open) {
            try {
              channelRef.current?.postMessage({ action: 'PING_LEADER' });
            } catch {}
            setPeerStatus((current) => (current === 'online' ? 'online' : 'cloud'));
          }
        }, 5000);

        peer.on('open', () => {
          if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer);
          setPeerStatus('online');
          setPinNotice(null);
          try {
            channelRef.current?.postMessage({ action: 'LEADER_ONLINE' });
          } catch {}
        });

        // Auto-recover if signaling WebSocket temporarily drops during a long workday
        peer.on('disconnected', () => {
          setPeerStatus('connecting');
          setTimeout(() => {
            try {
              if (peer && !peer.destroyed && peer.disconnected) {
                peer.reconnect();
              }
            } catch {}
          }, 1500);
        });

        // Stale Transfer Watchdog: free RAM and clear stuck progress bars if a client drops mid-stream
        watchdogTimer = setInterval(() => {
          const now = Date.now();
          let removedAny = false;
          for (const [jId, tr] of Object.entries(incomingTransfersRef.current)) {
            if (now - (tr.lastUpdated || 0) > 15000) {
              delete incomingTransfersRef.current[jId];
              removedAny = true;
            }
          }
          if (removedAny && Object.keys(incomingTransfersRef.current).length === 0) {
            setIncomingProgress(null);
          }
        }, 5000);

        peer.on('connection', (conn) => {
          setConnectedMobiles((n) => n + 1);
          const activeConnJobIds = new Set<string>();

          conn.on('data', async (data: any) => {
            if (!data || typeof data !== 'object') return;

            if (data.action === 'JOB_START') {
              activeConnJobIds.add(data.jobId);
              incomingTransfersRef.current[data.jobId] = {
                jobId: data.jobId,
                senderDeviceId: data.senderDeviceId,
                deviceLabel: data.deviceLabel || 'Mobile Phone',
                name: data.name,
                size: data.size,
                type: data.type || 'application/pdf',
                timestamp: data.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                totalChunks: data.totalChunks || 1,
                chunks: [],
                receivedCount: 0,
                receivedBytes: 0,
                copies: data.copies || 1,
                colorMode: data.colorMode || 'bw',
                lastUpdated: Date.now(),
              };
              setIncomingProgress({ name: data.name, progress: 0 });
            }

            else if (data.action === 'JOB_CHUNK') {
              const transfer = incomingTransfersRef.current[data.jobId];
              if (transfer) {
                transfer.lastUpdated = Date.now();
                const rawChunk = data.chunk;
                const chunkLen =
                  rawChunk?.byteLength ??
                  rawChunk?.size ??
                  rawChunk?.buffer?.byteLength ??
                  0;
                if (!transfer.chunks[data.index]) {
                  transfer.chunks[data.index] = rawChunk;
                  transfer.receivedCount++;
                  transfer.receivedBytes = (transfer.receivedBytes || 0) + chunkLen;
                }
                const pct = Math.min(99, Math.round((transfer.receivedBytes / Math.max(1, transfer.size)) * 100));
                setIncomingProgress((prev) => {
                  if (prev && prev.name === transfer.name && prev.progress === pct) return prev;
                  return { name: transfer.name, progress: pct };
                });
              }
            }

            else if (data.action === 'JOB_FINISH') {
              activeConnJobIds.delete(data.jobId);
              const transfer = incomingTransfersRef.current[data.jobId];
              if (transfer) {
                let blobUrl = '';
                let assembledBlob: Blob | null = null;
                try {
                  const validChunks = (transfer.chunks as any[]).filter((c) => c !== undefined && c !== null);
                  if (
                    validChunks.length > 0 &&
                    validChunks.length >= (transfer.totalChunks || 1) &&
                    (!transfer.size || transfer.receivedBytes >= transfer.size * 0.95)
                  ) {
                    const rawBlob = new Blob(validChunks, { type: transfer.type });
                    const rawBuf = await rawBlob.arrayBuffer();
                    const { buffer: plainBuf } = await decryptBytesWithKey(rawBuf, counterE2eeKey);
                    assembledBlob = new Blob([plainBuf], { type: transfer.type });
                    blobUrl = URL.createObjectURL(assembledBlob);
                  } else {
                    console.warn(
                      `[ScanToPrint] Incomplete WebRTC transfer for ${transfer.name}: chunks=${validChunks.length}/${transfer.totalChunks}, bytes=${transfer.receivedBytes}/${transfer.size}`
                    );
                  }
                } catch {
                  blobUrl = '';
                }

                // Determine or reuse Customer Token for this device
                let tokenNum = 1;
                const devId = transfer.senderDeviceId;
                if (devId && deviceTokenMapRef.current[devId]) {
                  tokenNum = deviceTokenMapRef.current[devId];
                } else {
                  tokenNum = tokenCounterRef.current++;
                  if (devId) deviceTokenMapRef.current[devId] = tokenNum;
                }

                const job: PrintJob = {
                  id: transfer.jobId,
                  tokenNum,
                  senderDeviceId: transfer.senderDeviceId,
                  deviceLabel: transfer.deviceLabel,
                  name: transfer.name,
                  size: transfer.size,
                  type: transfer.type,
                  dataUrl: blobUrl,
                  timestamp: transfer.timestamp,
                  copies: transfer.copies,
                  colorMode: transfer.colorMode,
                  status: 'pending',
                };

                if (blobUrl) {
                  addIncomingJob(job);
                  // Sync received WebRTC job to any other open Counter Station tabs on this PC!
                  if (assembledBlob) {
                    try {
                      channelRef.current?.postMessage({
                        action: 'SYNC_JOB_TO_SIBLINGS',
                        job,
                        fileBlob: assembledBlob,
                      });
                    } catch {}
                  }
                }
                delete incomingTransfersRef.current[data.jobId];
                setIncomingProgress(null);

                // Send ACK with token back to mobile
                try { conn.send({ action: 'JOB_ACK', jobId: transfer.jobId, tokenNum, customerToken: tokenNum }); } catch {}
              }
            }

            // Single-shot fallback for tiny files
            else if (data.action === 'NEW_PRINT_JOB' && data.job) {
              let tokenNum = 1;
              const devId = data.job.senderDeviceId;
              if (devId && deviceTokenMapRef.current[devId]) {
                tokenNum = deviceTokenMapRef.current[devId];
              } else {
                tokenNum = tokenCounterRef.current++;
                if (devId) deviceTokenMapRef.current[devId] = tokenNum;
              }
              addIncomingJob({ ...data.job, tokenNum, status: 'pending' });
              try { conn.send({ action: 'JOB_ACK', jobId: data.job.id, tokenNum, customerToken: tokenNum }); } catch {}
            }
          });

          conn.on('close', () => {
            setConnectedMobiles((n) => Math.max(0, n - 1));
            for (const jId of activeConnJobIds) {
              delete incomingTransfersRef.current[jId];
            }
            if (Object.keys(incomingTransfersRef.current).length === 0) {
              setIncomingProgress(null);
            }
          });
        });

        peer.on('error', (err) => {
          if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer);
          if (err.type === 'unavailable-id') {
            // Check if a sibling Counter tab on this same browser is already online as Leader
            try {
              channelRef.current?.postMessage({ action: 'PING_LEADER' });
            } catch {}
            // Keep station ready via Cloud Relay so user is never stuck on amber spinner
            setPeerStatus((current) => (current === 'online' ? 'online' : 'cloud'));
            if (peerRetryCountRef.current < 2) {
              peerRetryCountRef.current++;
              const delay = peerRetryCountRef.current * 4000;
              retryTimer = setTimeout(() => {
                if (!cancelled) {
                  setPeerReconnectKey((k) => k + 1);
                }
              }, delay);
            }
          } else if (err.type === 'peer-unavailable') {
            // Expected when a mobile client disconnects
          } else {
            setPeerStatus((current) => (current === 'online' ? 'online' : 'cloud'));
            if (peerRetryCountRef.current < 2) {
              peerRetryCountRef.current++;
              retryTimer = setTimeout(() => {
                if (!cancelled) {
                  setPeerReconnectKey((k) => k + 1);
                }
              }, 5000);
            }
          }
        });
      } else {
        // ── MOBILE / PC SENDER MODE ──────────────────────────────────────────
        peer = new Peer({
          debug: 0,
          config: { iceServers: ICE_SERVERS },
        });
        peerRef.current = peer;

        peer.on('open', () => {
          if (cancelled || !peer) return;
          const conn = peer.connect(roomId, { reliable: true });
          mobileConnRef.current = conn;

          conn.on('open', () => setMobileConnectionStatus('connected'));

          conn.on('data', async (data: any) => {
            if (data?.action === 'JOB_ACK' && data.jobId) {
              const assignedTok = data.customerToken || data.tokenNum;
              if (assignedTok) setCustomerToken(assignedTok);
              const resolver = ackResolversRef.current[data.jobId];
              if (resolver) {
                resolver(assignedTok);
                delete ackResolversRef.current[data.jobId];
              }
            }
          });

          conn.on('error', () => setMobileConnectionStatus('fallback'));

          const fallbackTimer = setTimeout(() => {
            if (!conn.open) setMobileConnectionStatus('fallback');
          }, 5000);

          (conn as any)._fallbackTimer = fallbackTimer;
        });

        peer.on('error', () => setMobileConnectionStatus('fallback'));
      }
    }, 80);

    const handleBeforeUnload = () => {
      try {
        peer?.destroy();
      } catch {}
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      cancelled = true;
      clearTimeout(initTimer);
      if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer);
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (watchdogTimer) clearInterval(watchdogTimer);
      try {
        if (mobileConnRef.current) {
          clearTimeout((mobileConnRef.current as any)._fallbackTimer);
          mobileConnRef.current.close?.();
          mobileConnRef.current = null;
        }
      } catch {}
      try {
        peer?.destroy();
      } catch {}
    };
  }, [sessionCode, targetCounterPin, isSenderMode, addIncomingJob, peerReconnectKey, counterE2eeKey]);

  // ─── Backend API Polling (Local + Cloud Relay Fallback) ─────────────────
  useEffect(() => {
    if (isSenderMode || !sessionCode || !roomReadToken) return;

    let cancelled = false;
    const registeredBases = new Set<string>();

    const registerRoomWithBase = async (baseUrl: string): Promise<boolean> => {
      try {
        const fd = new FormData();
        fd.append('session_id', sessionCode);
        fd.append('read_token', roomReadToken);
        const res = await fetch(`${baseUrl}/api/print-drop/register`, {
          method: 'POST',
          body: fd,
        });
        if (res.ok) {
          registeredBases.add(baseUrl);
          return true;
        }
        if (res.status === 409) {
          setPinNotice(`Counter PIN "${sessionCode}" is already claimed by another station. Please tap Reset / Change PIN.`);
        }
        return false;
      } catch {
        return false;
      }
    };

    const fetchRelayJobsFromBase = async (baseUrl: string): Promise<boolean> => {
      try {
        if (!registeredBases.has(baseUrl)) {
          await registerRoomWithBase(baseUrl);
        }
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 4500);
        let res = await fetch(`${baseUrl}/api/print-drop/jobs/${sessionCode}`, {
          headers: { 'X-Room-Token': roomReadToken },
          signal: ctrl.signal,
        });
        clearTimeout(tid);
        if (res.status === 412) {
          const okReg = await registerRoomWithBase(baseUrl);
          if (!okReg) return false;
          res = await fetch(`${baseUrl}/api/print-drop/jobs/${sessionCode}`, {
            headers: { 'X-Room-Token': roomReadToken },
          });
        }
        if (!res.ok) return false;
        // Mark station online via cloud relay as soon as any relay endpoint responds
        setPeerStatus((curr) => (curr === 'online' ? 'online' : 'cloud'));
        const data = await res.json();
        if (data.jobs?.length) {
          for (const j of data.jobs) {
            if (j.tokenNum) tokenCounterRef.current = Math.max(tokenCounterRef.current, j.tokenNum + 1);

            let fileBlobUrl = j.dataUrl || '';
            let downloadedBlob: Blob | null = null;
            if (j.fileUrl && !fileBlobUrl) {
              try {
                const fileUrlFull = j.fileUrl.startsWith('http') ? j.fileUrl : `${baseUrl}${j.fileUrl}`;
                const fileRes = await fetch(fileUrlFull, {
                  headers: { 'X-Room-Token': roomReadToken },
                });
                if (fileRes.ok) {
                  const rawArrayBuf = await fileRes.arrayBuffer();
                  const { buffer: plainBuf } = await decryptBytesWithKey(rawArrayBuf, counterE2eeKey);
                  downloadedBlob = new Blob([plainBuf], { type: j.type || 'application/pdf' });
                  fileBlobUrl = URL.createObjectURL(downloadedBlob);
                }
              } catch {}
            }

            if (fileBlobUrl) {
              const incoming = { ...j, dataUrl: fileBlobUrl, status: 'pending' as const };
              addIncomingJob(incoming);
              if (downloadedBlob) {
                try {
                  channelRef.current?.postMessage({
                    action: 'SYNC_JOB_TO_SIBLINGS',
                    job: incoming,
                    fileBlob: downloadedBlob,
                  });
                } catch {}
              }
            }
          }
          return true;
        }
        return false;
      } catch {
        return false;
      }
    };

    const poll = async () => {
      if (cancelled) return;
      try {
        // 1. Poll configured API_BASE (or same-origin Vite dev/preview server if localhost:8000 is not running)
        const gotPrimary = await fetchRelayJobsFromBase(API_BASE);
        let gotSecondary = false;

        if (typeof window !== 'undefined') {
          const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
          if (isLocal) {
            // Check same-origin Vite relay
            gotSecondary = await fetchRelayJobsFromBase('');
          }
        }
        if (gotPrimary || gotSecondary) {
          pollBackoffRef.current = 2500;
        } else {
          pollBackoffRef.current = Math.min(pollBackoffRef.current + 500, 8000);
        }
      } catch {
        pollBackoffRef.current = Math.min(pollBackoffRef.current + 1000, 8000);
      }

      if (!cancelled) {
        pollTimerRef.current = setTimeout(poll, pollBackoffRef.current);
      }
    };

    pollTimerRef.current = setTimeout(poll, 200);

    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [isSenderMode, sessionCode, roomReadToken, counterE2eeKey, addIncomingJob]);

  // ─── Print QR Code (Shopkeeper can print and stick on counter) ───────────
  const handlePrintQr = () => {
    if (!qrDataUrl) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Counter QR Standee - ${sessionCode}</title>
          <style>
            @page { size: A5 portrait; margin: 8mm; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 0;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 98vh;
              background: #fff;
              font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              color: #0f172a;
            }
            .standee-card {
              border: 4px solid #e11d48;
              border-radius: 24px;
              padding: 24px 26px;
              text-align: center;
              max-width: 440px;
              width: 100%;
              background: #ffffff;
            }
            .shop-badge {
              font-size: 11px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 2px;
              background: #fff1f2;
              color: #e11d48;
              border: 1px solid #fecdd3;
              padding: 4px 14px;
              border-radius: 999px;
              display: inline-block;
              margin-bottom: 8px;
            }
            h1 { font-size: 21px; font-weight: 900; margin: 0 0 4px; color: #0f172a; line-height: 1.2; }
            .tagline { font-size: 12.5px; color: #475569; margin: 0 0 14px; font-weight: 600; }
            .qr-box {
              background: #fff;
              border: 2px solid #e2e8f0;
              border-radius: 18px;
              padding: 12px;
              display: inline-block;
              margin-bottom: 12px;
            }
            .qr-box img { width: 220px; height: 220px; display: block; margin: 0 auto; }
            .pin-container { margin-bottom: 12px; }
            .pin-label { font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #64748b; margin-bottom: 4px; }
            .pin-code {
              font-size: 30px;
              font-weight: 900;
              letter-spacing: 6px;
              background: #f8fafc;
              border: 2px solid #0f172a;
              color: #0f172a;
              padding: 6px 22px;
              border-radius: 12px;
              display: inline-block;
              font-family: monospace;
            }
            .steps {
              text-align: left;
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 14px;
              padding: 10px 16px;
              margin-bottom: 12px;
              font-size: 11px;
              color: #334155;
              line-height: 1.6;
            }
            .steps ol { margin: 0; padding-left: 18px; }
            .steps li { margin-bottom: 2px; font-weight: 600; }
            .footer-badge {
              font-size: 10px;
              font-weight: 800;
              color: #10b981;
              letter-spacing: 0.5px;
            }
            .link-text { font-size: 9px; color: #94a3b8; margin-top: 4px; font-family: monospace; }
          </style>
        </head>
        <body>
          <div class="standee-card">
            <div class="shop-badge">${shopName || 'DIRECT PRINT STATION'}</div>
            <h1>📄 Mobile se Direct Print Bhejein</h1>
            <p class="tagline">WhatsApp par number save karne ki koi zaroorat nahi!</p>
            <div class="qr-box">
              <img src="${qrDataUrl}" alt="Counter QR Standee" />
            </div>
            <div class="pin-container">
              <div class="pin-label">Permanent Counter PIN</div>
              <div class="pin-code">${sessionCode}</div>
            </div>
            <div class="steps">
              <ol>
                <li>Phone camera ya Paytm / GPay / Scanner se QR scan karein</li>
                <li>Apna Document ya Photo select karke <strong>Send</strong> karein</li>
                <li>Screen par mila <strong>Customer Token</strong> counter par batayein</li>
              </ol>
              <div style="margin-top: 6px; padding: 5px 8px; background: #fff1f2; border: 1px dashed #f43f5e; border-radius: 8px; font-size: 10px; color: #be123c; font-weight: bold;">
                💡 WhatsApp Direct Share: WhatsApp me PDF par 'Share' daba kar 'PDF Media Suite' chunein — bina file dhoonde direct print!
              </div>
            </div>
            <div class="footer-badge">🔒 100% Private • Direct Beam • Zero Data Stored</div>
            <div class="link-text">${mobileLink}</div>
          </div>
          <script>
            window.onload = function() {
              window.focus();
              setTimeout(function() { window.print(); }, 200);
              window.onafterprint = function() { window.close(); };
            };
          <\/script>
        </body>
      </html>
    `);
    win.document.close();
  };

  // ─── Relay Upload (Fallback / secondary guarantee with E2EE & localhost auto-fallback) ───
  const uploadViaRelay = async (file: File, copies: number, colorMode: 'bw' | 'color', jobId: string): Promise<boolean> => {
    let payloadFile: File | Blob = file;
    if (senderE2eeKey) {
      try {
        const plainBuf = await file.arrayBuffer();
        const encBuf = await encryptBytesWithKey(plainBuf, senderE2eeKey);
        payloadFile = new Blob([encBuf], { type: 'application/octet-stream' });
      } catch {}
    }

    const attemptUploadToBase = (baseUrl: string): Promise<boolean> =>
      new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        const activeSession = isSenderMode ? (targetCounterPin || sessionCode) : sessionCode;
        formData.append('session_id', activeSession);
        formData.append('file', payloadFile, file.name);
        formData.append('copies', String(copies));
        formData.append('color_mode', colorMode);
        formData.append('sender_device_id', getSenderDeviceId());
        formData.append('job_id', jobId);
        formData.append('device_label', getDeviceLabel());

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 95);
            setSenderProgress(pct);
            setSenderStatusText(
              `Uploading ${file.name} (${(e.loaded / 1048576).toFixed(1)} / ${(e.total / 1048576).toFixed(1)} MB)...`
            );
          }
        };

        xhr.onload = () => {
          if (xhr.status === 200) {
            try {
              const data = JSON.parse(xhr.responseText);
              if (data.token_num) setCustomerToken(data.token_num);
            } catch {}
            resolve(true);
          } else {
            resolve(false);
          }
        };
        xhr.onerror = () => resolve(false);
        xhr.open('POST', `${baseUrl}/api/print-drop/upload`);
        xhr.send(formData);
      });

    return (async () => {
      const okPrimary = await attemptUploadToBase(API_BASE);
      if (okPrimary) return true;
      // If localhost:8000 is not running during npm run dev, fall back to same-origin Vite relay (/api/print-drop/upload)
      if (API_BASE.includes('localhost:8000')) {
        const okSecondary = await attemptUploadToBase('');
        if (okSecondary) return true;
      }
      return false;
    })();
  };

  // ─── Customer Mobile Upload (Multi-channel, Sliding Window) ─────────────
  //
  // HOW THE SPEED UPGRADE WORKS:
  //  Old:  Send chunk 0 → wait → send chunk 1 → wait → ...  (sequential)
  //  New:  Send chunks 0-7 together (window=8) → as buffer drains, fill ahead
  //        → 4-8x throughput on same network link
  //
  // Additionally uses ADAPTIVE chunk sizes:
  //   First 10 chunks: 64 KB (safe warm-up for SCTP negotiation)
  //   After stable:    256 KB (maximum WebRTC SCTP payload on modern browsers)
  //   Throttles via:   bufferedamountlow event (zero busy-polling)
  //
  const handleCustomerUpload = async () => {
    if (!senderFiles.length) return;
    senderAbortRef.current = false;
    setSenderUploading(true);
    setSenderProgress(2);
    setSenderStatusText('Reading document...');

    // ── Helper: wait for DC buffer to drain below BUFFER_LOW_MARK with timeout & safety
    const waitForDrain = (dc: RTCDataChannel): Promise<void> =>
      new Promise((resolve) => {
        if (dc.readyState !== 'open' || dc.bufferedAmount <= BUFFER_LOW_MARK) {
          resolve();
          return;
        }
        let timer: any = null;
        const cleanup = () => {
          if (timer) clearTimeout(timer);
          dc.removeEventListener('bufferedamountlow', onDrain);
          dc.removeEventListener('close', cleanup);
          dc.removeEventListener('error', cleanup);
        };
        const onDrain = () => {
          if (dc.bufferedAmount <= BUFFER_LOW_MARK) {
            cleanup();
            resolve();
          }
        };
        timer = setTimeout(() => {
          cleanup();
          resolve();
        }, 8000);
        dc.bufferedAmountLowThreshold = BUFFER_LOW_MARK;
        dc.addEventListener('bufferedamountlow', onDrain);
        dc.addEventListener('close', cleanup);
        dc.addEventListener('error', cleanup);
      });

    try {
      for (let i = 0; i < senderFiles.length; i++) {
        if (senderAbortRef.current) break;
        const file = senderFiles[i];
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        let beamedViaWebRtc = false;

        // ── Channel A: WebRTC Sliding-Window High-Speed Stream (with E2EE when QR key active) ──
        if (mobileConnRef.current?.open) {
          try {
            const dc: RTCDataChannel | null = mobileConnRef.current.dataChannel ?? null;
            const plainBuf = await file.arrayBuffer();
            const wireBuf = senderE2eeKey ? await encryptBytesWithKey(plainBuf, senderE2eeKey) : plainBuf;
            const wireSize = wireBuf.byteLength;

            // Determine adaptive chunk size based on connection quality
            let chunkSize = CHUNK_SIZE_SMALL;
            const totalChunksSmall = Math.ceil(wireSize / chunkSize);

            mobileConnRef.current.send({
              action: 'JOB_START',
              jobId,
              senderDeviceId: getSenderDeviceId(),
              deviceLabel: getDeviceLabel(),
              name: file.name,
              size: wireSize,
              type: file.type || 'application/pdf',
              timestamp,
              totalChunks: totalChunksSmall,
              copies: senderCopies,
              colorMode: senderColorMode,
            });

            let nextChunkIdx = 0;
            let sentBytes = 0;
            const tStart = Date.now();

            // Phase 1: Warm-up with small chunks (first WINDOW_SIZE chunks)
            while (nextChunkIdx < Math.min(WINDOW_SIZE, Math.ceil(wireSize / CHUNK_SIZE_SMALL))) {
              if (senderAbortRef.current) break;
              const start = nextChunkIdx * CHUNK_SIZE_SMALL;
              const end = Math.min(start + CHUNK_SIZE_SMALL, wireSize);
              const buf = wireBuf.slice(start, end);

              mobileConnRef.current.send({ action: 'JOB_CHUNK', jobId, index: nextChunkIdx, chunk: buf });
              sentBytes += (end - start);
              nextChunkIdx++;

              // Update UI every 2 chunks during warmup
              if (nextChunkIdx % 2 === 0) {
                setSenderProgress(Math.round((sentBytes / wireSize) * 85));
                setSenderStatusText(`Streaming ${file.name} (${(sentBytes / 1048576).toFixed(1)} / ${(wireSize / 1048576).toFixed(1)} MB)...`);
              }
            }

            // After warm-up: switch to larger chunks for maximum throughput
            const elapsed = Date.now() - tStart;
            chunkSize = elapsed < 500 ? CHUNK_SIZE_LARGE : CHUNK_SIZE_MEDIUM;

            // ── Sliding window for remaining file ──────────────────────────
            let offset = sentBytes;

            while (offset < wireSize) {
              if (senderAbortRef.current) break;

              const windowChunks: { buf: ArrayBuffer; idx: number }[] = [];

              for (let w = 0; w < WINDOW_SIZE && offset + w * chunkSize < wireSize; w++) {
                const chunkStart = offset + w * chunkSize;
                const chunkEnd = Math.min(chunkStart + chunkSize, wireSize);
                const currentIdx = nextChunkIdx + w;
                windowChunks.push({
                  buf: wireBuf.slice(chunkStart, chunkEnd),
                  idx: currentIdx,
                });
              }

              if (senderAbortRef.current) break;

              // Send all window chunks back-to-back
              for (const { buf, idx } of windowChunks) {
                if (dc && dc.bufferedAmount > BUFFER_THRESHOLD) {
                  await waitForDrain(dc);
                }
                if (senderAbortRef.current) break;

                mobileConnRef.current.send({ action: 'JOB_CHUNK', jobId, index: idx, chunk: buf });
                sentBytes += buf.byteLength;
              }

              nextChunkIdx += windowChunks.length;

              // Update progress once per window
              const pct = Math.round((sentBytes / wireSize) * 90);
              setSenderProgress(pct);
              const speedMbps = ((sentBytes / 1048576) / Math.max(0.1, (Date.now() - tStart) / 1000)).toFixed(1);
              setSenderStatusText(
                `Streaming ${file.name} · ${(sentBytes / 1048576).toFixed(1)} / ${(wireSize / 1048576).toFixed(1)} MB · ${speedMbps} MB/s`
              );

              // Advance offset by window
              offset += windowChunks.length * chunkSize;

              // Yield once per window to keep UI thread responsive
              await new Promise((r) => setTimeout(r, 0));
            }

            if (senderAbortRef.current) {
              setSenderStatusText('Transfer cancelled.');
              break;
            }

            // Send finish signal — receiver will assemble and ACK
            mobileConnRef.current.send({ action: 'JOB_FINISH', jobId });
            beamedViaWebRtc = true;
          } catch (e) {
            console.warn('WebRTC stream notice, using relay fallback', e);
          }
        }

        // Wait for Counter PC acknowledgment if beamed via WebRTC (timeout after 4s)
        let ackReceived = false;
        if (beamedViaWebRtc) {
          ackReceived = await new Promise<boolean>((resolve) => {
            const timeout = setTimeout(() => resolve(false), 4000);
            ackResolversRef.current[jobId] = (token) => {
              clearTimeout(timeout);
              if (token) setCustomerToken(token);
              resolve(true);
            };
          });
        }

        // ── Channel B: Instant Same-Browser / PWA-to-Counter BroadcastChannel ──
        if (channelRef.current && !ackReceived) {
          try {
            const bcAckPromise = new Promise<boolean>((resolve) => {
              const timeout = setTimeout(() => resolve(false), 400);
              ackResolversRef.current[jobId] = (token) => {
                clearTimeout(timeout);
                if (token) setCustomerToken(token);
                resolve(true);
              };
            });

            channelRef.current.postMessage({
              action: 'NEW_PRINT_JOB',
              fileBlob: file,
              job: {
                id: jobId,
                tokenNum: 0,
                senderDeviceId: getSenderDeviceId(),
                deviceLabel: getDeviceLabel(),
                name: file.name,
                size: file.size,
                type: file.type || 'application/pdf',
                dataUrl: '',
                timestamp,
                copies: senderCopies,
                colorMode: senderColorMode,
                status: 'pending',
              },
            });

            ackReceived = await bcAckPromise;
          } catch {}
        }

        // ── Channel C: Backend Relay (smart fallback ONLY if WebRTC & BroadcastChannel unacknowledged) ──
        if (!ackReceived) {
          setSenderStatusText(`Transmitting ${file.name} via cloud relay...`);
          const relayOk = await uploadViaRelay(file, senderCopies, senderColorMode, jobId);
          if (!relayOk && !beamedViaWebRtc) {
            throw new Error(`Failed to transmit ${file.name}`);
          }
        }
      }

      setDeliveredBatch(
        senderFiles.map((f) => ({
          name: f.name,
          size: f.size,
          copies: senderCopies,
          colorMode: senderColorMode,
        }))
      );
      setSenderProgress(100);
      setSenderSuccess(true);
      setSenderFiles([]);
      setIsSharedFromExternal(false);
      void clearSharedFilesCache();
    } catch (err) {
      console.error(err);
      alert('Error transferring file. Please try again.');
    } finally {
      setSenderUploading(false);
      setSenderProgress(0);
    }
  };

  // ─── Shopkeeper direct PC drop ───────────────────────────────────────────
  const handleShopkeeperFileDrop = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    // Allocate / reuse token for local shopkeeper drops
    const devId = 'local_counter_pc';
    let tokenNum = deviceTokenMapRef.current[devId];
    if (!tokenNum) {
      tokenNum = tokenCounterRef.current++;
      deviceTokenMapRef.current[devId] = tokenNum;
    }

    files.forEach((file) => {
      const blobUrl = URL.createObjectURL(file);
      const job: PrintJob = {
        id: `local_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tokenNum,
        senderDeviceId: devId,
        deviceLabel: 'Counter PC',
        name: file.name,
        size: file.size,
        type: file.type || 'application/pdf',
        dataUrl: blobUrl,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        copies: 1,
        colorMode: 'bw',
        status: 'pending',
      };
      addIncomingJob(job);
    });
    e.target.value = '';
  };

  // ─── Job Actions ─────────────────────────────────────────────────────────
  const markAsPrinted = (id: string) => {
    setPrintJobs((prev) => {
      const updated = prev.map((j) =>
        j.id === id
          ? { ...j, status: 'printed' as const, printedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
          : j
      );
      // Auto-prune oldest printed beyond 50
      const printed = updated.filter((j) => j.status === 'printed');
      if (printed.length > 50) {
        const oldest = printed[printed.length - 1];
        if (oldest.dataUrl.startsWith('blob:')) { try { URL.revokeObjectURL(oldest.dataUrl); } catch {} }
        return updated.filter((j) => j.id !== oldest.id);
      }
      return updated;
    });
  };

  const markAsPending = (id: string) => {
    setPrintJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, status: 'pending' as const, printedAt: undefined } : j))
    );
  };

  const deleteJob = (id: string) => {
    setPrintJobs((prev) => {
      const target = prev.find((j) => j.id === id);
      if (target?.dataUrl.startsWith('blob:')) { try { URL.revokeObjectURL(target.dataUrl); } catch {} }
      return prev.filter((j) => j.id !== id);
    });
  };

  const clearPrintedHistory = () => {
    setPrintJobs((prev) => {
      prev.filter((j) => j.status === 'printed').forEach((j) => {
        if (j.dataUrl.startsWith('blob:')) { try { URL.revokeObjectURL(j.dataUrl); } catch {} }
      });
      return prev.filter((j) => j.status !== 'printed');
    });
  };

  const updateJobField = <K extends keyof PrintJob>(id: string, key: K, value: PrintJob[K]) => {
    setPrintJobs((prev) => prev.map((j) => (j.id === id ? { ...j, [key]: value } : j)));
  };

  // ─── 1-Click Print (PDF → multi-page canvas, Image → native) ────────────
  const handlePrint = async (job: PrintJob) => {
    if (printingJobId) return;
    setPrintingJobId(job.id);

    try {
      const copiesArr = Array.from({ length: job.copies });

      if (job.type.startsWith('image/')) {
        // ── Image Print ──────────────────────────────────────────────────
        const printWindow = window.open('', '_blank');
        if (!printWindow) { alert('Please allow popups to print.'); return; }

        const filter = job.colorMode === 'bw' ? 'filter: grayscale(100%) contrast(125%);' : '';

        // Determine orientation
        let isImgLandscape = job.orientation === 'landscape';
        if (job.orientation !== 'landscape' && job.orientation !== 'portrait') {
          if (job.detectedOrientation) {
            isImgLandscape = job.detectedOrientation === 'landscape';
          } else {
            const imgObj = new Image();
            imgObj.src = job.dataUrl;
            await new Promise((res) => { imgObj.onload = res; imgObj.onerror = res; });
            isImgLandscape = imgObj.width > imgObj.height;
          }
        }

        const pageSize = isImgLandscape ? 'A4 landscape' : 'A4 portrait';

        const imgHtml = copiesArr
          .map(() => `
            <div class="copy ${isImgLandscape ? 'copy-landscape' : 'copy-portrait'}">
              <img src="${job.dataUrl}" />
            </div>
          `)
          .join('');

        printWindow.document.write(`
          <!DOCTYPE html><html>
          <head><title>${escapeHtml(job.name)} — Print (×${job.copies}${isImgLandscape ? ' · Landscape' : ''})</title>
          <style>
            @page { size: ${pageSize}; margin: 6mm; }
            * { box-sizing: border-box; }
            body { margin: 0; background: #fff; }
            .copy {
              display: flex;
              align-items: center;
              justify-content: center;
              width: 100%;
              page-break-after: always;
              break-after: page;
              min-height: 96vh;
            }
            .copy:last-child { page-break-after: avoid; break-after: avoid; }
            img {
              max-width: 100%;
              max-height: 96vh;
              object-fit: contain;
              ${filter}
            }
          </style></head>
          <body>${imgHtml}
          <script>window.onload = function() { window.focus(); window.print(); window.onafterprint = function() { window.close(); }; };<\/script>
          </body></html>
        `);
        printWindow.document.close();
      } else {
        // ── PDF Print via pdfjs → canvas → print window ──────────────────
        const { buffer, type } = await urlToArrayBuffer(job.dataUrl);
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
        const pdf = await loadingTask.promise;
        const totalPages = pdf.numPages;
        const filter = job.colorMode === 'bw' ? 'filter: grayscale(100%) contrast(1.2);' : '';

        // Render all pages to high-DPI JPEG blob/data URLs + detect orientation per page
        interface RenderedPage {
          src: string;
          isLandscape: boolean;
        }
        const renderedPages: RenderedPage[] = [];
        const tempBlobUrls: string[] = [];
        let landscapeCount = 0;
        // Adaptive render scale: high DPI for small docs, memory-safe for 15+ page docs
        const renderScale = totalPages > 15 ? 1.8 : 2.2;
        const renderQuality = totalPages > 15 ? 0.88 : 0.92;

        for (let p = 1; p <= totalPages; p++) {
          const page = await pdf.getPage(p);
          const baseViewport = page.getViewport({ scale: 1.0 });

          // Determine page orientation
          let pageIsLandscape = baseViewport.width > baseViewport.height;
          if (job.orientation === 'landscape') pageIsLandscape = true;
          if (job.orientation === 'portrait') pageIsLandscape = false;

          if (pageIsLandscape) landscapeCount++;

          const viewport = page.getViewport({ scale: renderScale });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;

          // Convert to binary Blob URL (avoids massive base64 memory overhead)
          const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', renderQuality));
          const pageSrc = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/jpeg', renderQuality);
          if (pageSrc.startsWith('blob:')) tempBlobUrls.push(pageSrc);

          renderedPages.push({
            src: pageSrc,
            isLandscape: pageIsLandscape,
          });
          // Allow GC between pages for large docs
          canvas.width = 0;
          canvas.height = 0;
        }

        const isDocLandscape = landscapeCount >= renderedPages.length / 2;
        const defaultPageSize = isDocLandscape ? 'A4 landscape' : 'A4 portrait';

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          // Popup blocked — open native PDF directly
          const blob = arrayBufferToBlob(buffer, type);
          const tempUrl = URL.createObjectURL(blob);
          window.open(tempUrl, '_blank');
          setTimeout(() => { try { URL.revokeObjectURL(tempUrl); } catch {} }, 30000);
          tempBlobUrls.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
          return;
        }

        // Build print page — each page gets exact A4 sizing according to its orientation
        const pagesHtml = copiesArr
          .flatMap(() =>
            renderedPages.map(
              (p, idx) => `
              <div class="pg ${p.isLandscape ? 'pg-landscape' : 'pg-portrait'}">
                <img src="${p.src}" alt="Page ${idx + 1}" />
              </div>`
            )
          )
          .join('');

        printWindow.document.write(`
          <!DOCTYPE html><html>
          <head><title>${escapeHtml(job.name)} (${totalPages}p ×${job.copies}${isDocLandscape ? ' · Landscape' : ''})</title>
          <style>
            @page {
              size: ${defaultPageSize};
              margin: 0;
            }
            @page sheet-portrait {
              size: A4 portrait;
              margin: 0;
            }
            @page sheet-landscape {
              size: A4 landscape;
              margin: 0;
            }
            * { box-sizing: border-box; }
            html, body {
              margin: 0;
              padding: 0;
              background: #fff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .pg {
              display: flex;
              align-items: center;
              justify-content: center;
              page-break-after: always;
              break-after: page;
              overflow: hidden;
            }
            .pg:last-child {
              page-break-after: avoid;
              break-after: avoid;
            }
            .pg-portrait {
              page: sheet-portrait;
              width: 210mm;
              height: 297mm;
            }
            .pg-portrait img {
              width: 210mm;
              height: 297mm;
              object-fit: contain;
              display: block;
              ${filter}
            }
            .pg-landscape {
              page: sheet-landscape;
              width: 297mm;
              height: 210mm;
            }
            .pg-landscape img {
              width: 297mm;
              height: 210mm;
              object-fit: contain;
              display: block;
              ${filter}
            }
          </style></head>
          <body>
            ${pagesHtml}
            <script>
              window.onload = function() {
                window.focus();
                setTimeout(function() { window.print(); }, 150);
                window.onafterprint = function() { window.close(); };
              };
            <\/script>
          </body></html>
        `);
        printWindow.document.close();
        if (tempBlobUrls.length > 0) {
          setTimeout(() => {
            tempBlobUrls.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
          }, 60000);
        }
      }

      // Auto-mark as printed
      markAsPrinted(job.id);
    } catch (err) {
      console.error('Print rendering error', err);
      try {
        const { buffer, type } = await urlToArrayBuffer(job.dataUrl);
        const tempUrl = URL.createObjectURL(arrayBufferToBlob(buffer, type));
        window.open(tempUrl, '_blank');
        setTimeout(() => { try { URL.revokeObjectURL(tempUrl); } catch {} }, 30000);
      } catch {
        alert('Could not render document for printing.');
      }
    } finally {
      setPrintingJobId(null);
    }
  };

  // ─── Customer Bundle Printing ───────────────────────────────────────────
  const handlePrintCustomerBundle = async (group: CustomerGroup) => {
    if (isPrintingCustomerToken !== null || printingJobId !== null) return;
    const toPrint = group.pendingJobs;
    if (!toPrint.length) return;

    setIsPrintingCustomerToken(group.customerToken);

    try {
      for (let i = 0; i < toPrint.length; i++) {
        const job = toPrint[i];
        await handlePrint(job);
        if (i < toPrint.length - 1) {
          // Safe gap between consecutive print dialogs
          await new Promise((r) => setTimeout(r, 1600));
        }
      }
    } catch (e) {
      console.error('Customer bundle print notice', e);
    } finally {
      setIsPrintingCustomerToken(null);
    }
  };

  const markCustomerBundlePrinted = (customerToken: number) => {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setPrintJobs((prev) =>
      prev.map((j) => (j.tokenNum === customerToken ? { ...j, status: 'printed' as const, printedAt: now } : j))
    );
  };

  const markCustomerBundlePending = (customerToken: number) => {
    setPrintJobs((prev) =>
      prev.map((j) => (j.tokenNum === customerToken ? { ...j, status: 'pending' as const, printedAt: undefined } : j))
    );
  };

  const deleteCustomerBundle = (customerToken: number) => {
    setPrintJobs((prev) => {
      prev.filter((j) => j.tokenNum === customerToken).forEach((j) => {
        if (j.dataUrl.startsWith('blob:')) {
          try { URL.revokeObjectURL(j.dataUrl); } catch {}
        }
      });
      return prev.filter((j) => j.tokenNum !== customerToken);
    });
  };

  // ─── Custom PIN & Shop Settings ─────────────────────────────────────────
  const handleSaveCustomPin = (newPinRaw: string, newShopNameRaw?: string) => {
    const cleanPin = newPinRaw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleanPin.length < 3 || cleanPin.length > 10) {
      alert('PIN must be 3 to 10 characters (letters and numbers only, e.g. SHARMA or K9X2M7).');
      return;
    }

    const pinChanged = cleanPin !== sessionCode;
    const nextSecret = pinChanged || !roomReadToken ? generateSecretToken(24) : roomReadToken;
    const nextE2ee = pinChanged || !counterE2eeKey ? generateSecretToken(32) : counterE2eeKey;

    try {
      localStorage.setItem(PMS_PERMANENT_PIN_KEY, cleanPin);
      localStorage.setItem(PMS_ROOM_SECRET_KEY, nextSecret);
      localStorage.setItem(PMS_ROOM_E2EE_KEY, nextE2ee);
      if (newShopNameRaw !== undefined) {
        const trimmedShop = newShopNameRaw.trim() || 'Cyber Cafe & E-Mitra Print Station';
        localStorage.setItem(PMS_SHOP_NAME_KEY, trimmedShop);
        setShopName(trimmedShop);
      }
    } catch {}

    setRoomReadToken(nextSecret);
    setCounterE2eeKey(nextE2ee);

    try {
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
    } catch {}

    setConnectedMobiles(0);
    setSessionCode(cleanPin);
    setPinNotice(null);
    setShowPinModal(false);
    setPeerReconnectKey((k) => k + 1);
  };

  const handleResetPin = () => {
    const confirmMsg =
      'Kya aap waqai new Counter PIN generate karna chahte hain?\n\nAgar aapne puraana QR Standee print karke counter par lagaya hua hai, to aapko naya QR print karke lagana hoga.';
    if (window.confirm(confirmMsg)) {
      const newPin = generateCleanPin();
      handleSaveCustomPin(newPin);
    }
  };

  // ─── Print All ──────────────────────────────────────────────────────────
  const handlePrintAll = async () => {
    const pending = printJobs.filter((j) => j.status === 'pending');
    if (!pending.length) return;
    // Sequential with 2s gap between each print dialog
    for (const job of pending) {
      await handlePrint(job);
      await new Promise((r) => setTimeout(r, 2000));
    }
  };

  // ─── Copy link ──────────────────────────────────────────────────────────
  const copyLink = () => {
    navigator.clipboard.writeText(mobileLink).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // ─── Derived ────────────────────────────────────────────────────────────
  const pendingJobs = useMemo(() => printJobs.filter((j) => j.status === 'pending'), [printJobs]);
  const printedJobs = useMemo(() => printJobs.filter((j) => j.status === 'printed'), [printJobs]);

  // ─── Customer Grouping (Memoized) ────────────────────────────────────────
  const customerGroups = useMemo(() => {
    const map = new Map<number, CustomerGroup>();

    for (const job of printJobs) {
      const token = job.tokenNum || 1;
      if (!map.has(token)) {
        map.set(token, {
          customerToken: token,
          senderDeviceId: job.senderDeviceId || `device_${token}`,
          deviceLabel: job.deviceLabel || (job.id.startsWith('local_') ? 'Counter PC' : 'Mobile Phone'),
          firstTimestamp: job.timestamp,
          jobs: [],
          pendingJobs: [],
          printedJobs: [],
          totalPrints: 0,
          totalFiles: 0,
          isComplete: true,
        });
      }

      const group = map.get(token)!;
      group.jobs.push(job);
      group.totalFiles += 1;
      const pages = job.pages || 1;
      group.totalPrints += job.copies * pages;

      if (job.status === 'pending') {
        group.pendingJobs.push(job);
        group.isComplete = false;
      } else {
        group.printedJobs.push(job);
      }
    }

    return Array.from(map.values());
  }, [printJobs]);

  const pendingCustomerGroups = useMemo(
    () => customerGroups.filter((g) => g.pendingJobs.length > 0),
    [customerGroups]
  );

  const printedCustomerGroups = useMemo(
    () => customerGroups.filter((g) => g.pendingJobs.length === 0 && g.printedJobs.length > 0),
    [customerGroups]
  );

  // ════════════════════════════════════════════════════════════════════════
  // UNIVERSAL SENDER VIEW (PC, Laptop, Mobile)
  // ════════════════════════════════════════════════════════════════════════
  if (isSenderMode) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 p-4 sm:p-6 flex flex-col items-center justify-center">
        {/* Top Mode Switcher Bar */}
        <div className="flex items-center justify-center mb-6 w-full max-w-lg">
          <div className="inline-flex p-1.5 rounded-2xl bg-slate-200/80 dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700 shadow-sm max-w-full overflow-x-auto">
            <button
              onClick={() => {
                setIsSenderMode(false);
                setPeerReconnectKey((k) => k + 1);
              }}
              className="flex items-center gap-2 px-4 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition"
            >
              <Printer className="w-4 h-4 text-rose-600" />
              <span>📥 Counter Station (Print Queue)</span>
            </button>
            <button
              onClick={() => {
                setIsSenderMode(true);
                setPeerReconnectKey((k) => k + 1);
              }}
              className="flex items-center gap-2 px-4 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-extrabold bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm transition"
            >
              <Zap className="w-4 h-4 text-rose-600" />
              <span>📤 Beam Files</span>
            </button>
          </div>
        </div>

        <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xl space-y-5">
          {!targetCounterPin || targetCounterPin.length < 3 ? (
            /* ── STEP 1: ENTER COUNTER PIN OR SCAN SHOP QR ──────────────── */
            <div className="space-y-5 text-center py-1">
              <div className="w-16 h-16 rounded-3xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 mx-auto flex items-center justify-center shadow-inner">
                <Radio className="w-8 h-8 animate-pulse" />
              </div>

              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">
                  Beam Files to Counter PC
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                  Scan the shop QR code or type the Counter PIN shown on the shop screen (e.g. <span className="font-mono font-black text-rose-600">K9X2M7</span>).
                </p>
              </div>

              {/* Shared / Pre-selected Document Banner */}
              {senderFiles.length > 0 && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/60 dark:to-teal-950/40 border border-emerald-200 dark:border-emerald-800 text-left space-y-2 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-extrabold text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{isSharedFromExternal ? '📥 Document Shared from WhatsApp / Device' : '📄 Document Ready to Beam'}</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/80 text-emerald-800 dark:text-emerald-200">
                      {senderFiles.length} file{senderFiles.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="space-y-1 max-h-28 overflow-y-auto pl-6 pr-1">
                    {senderFiles.map((f, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs bg-white/70 dark:bg-slate-900/60 px-2.5 py-1.5 rounded-xl border border-emerald-200/60 dark:border-emerald-800/60">
                        <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">{f.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-mono text-slate-500">{formatFileSize(f.size)}</span>
                          <button
                            type="button"
                            onClick={() => removeSenderFile(idx)}
                            className="text-slate-400 hover:text-rose-600 p-0.5 rounded"
                            title="Remove file"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {recentPins.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        const lastPin = recentPins[0];
                        const chars = lastPin.slice(0, 6).split('');
                        while (chars.length < 6) chars.push('');
                        setPinDigits(chars);
                        handleConnectWithPin(lastPin);
                      }}
                      className="w-full mt-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5" /> 1-Tap Connect to Recent Shop (#{recentPins[0]})
                    </button>
                  ) : (
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium pl-6">
                      Shopkeeper ka QR scan karein ya niche Counter PIN dalein.
                    </p>
                  )}
                </div>
              )}

              {/* Built-In Live Camera QR Scanner Modal / Viewfinder */}
              {showQrScanner ? (
                <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-3 border-2 border-rose-500 shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold flex items-center gap-1.5 text-rose-400">
                      <QrCode className="w-4 h-4" /> Point Camera at Counter QR Standee
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowQrScanner(false)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" /> Close
                    </button>
                  </div>
                  <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-slate-700">
                    <video
                      ref={qrVideoRef}
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-rose-500/70 m-6 rounded-xl" />
                  </div>
                  {qrScanError && (
                    <p className="text-[11px] text-amber-300 font-medium">{qrScanError}</p>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowQrScanner(true)}
                  className="w-full py-3.5 px-4 rounded-2xl bg-slate-900 dark:bg-white hover:opacity-95 active:scale-98 text-white dark:text-slate-900 font-extrabold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <QrCode className="w-4 h-4 text-rose-500" />
                  <span>📷 Scan Shop Counter QR Code</span>
                </button>
              )}

              <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                <span>OR ENTER COUNTER PIN</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
              </div>

              {/* 6-Digit PIN input boxes */}
              <div className="flex items-center justify-center gap-1.5 sm:gap-3">
                {[0, 1, 2, 3, 4, 5].map((idx) => (
                  <input
                    key={idx}
                    ref={(el) => { pinInputRefs.current[idx] = el; }}
                    type="text"
                    maxLength={1}
                    value={pinDigits[idx] || ''}
                    onChange={(e) => handlePinDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handlePinKeyDown(idx, e)}
                    onPaste={idx === 0 ? handlePinPaste : undefined}
                    className="w-11 h-14 sm:w-14 sm:h-16 text-center text-xl sm:text-2xl font-black uppercase rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white focus:border-rose-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-rose-500/10 outline-none transition-all shadow-sm"
                  />
                ))}
              </div>

              {/* Connect Button (Supports 3 to 10 char custom shop codes too) */}
              <button
                onClick={() => {
                  const fullPin = pinDigits.join('').trim().toUpperCase();
                  if (fullPin.length >= 3) handleConnectWithPin(fullPin);
                }}
                disabled={pinDigits.join('').trim().length < 3}
                className="w-full py-4 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
              >
                <Zap className="w-4 h-4" /> Connect to Counter PIN
              </button>

              {/* Recent Counters */}
              {recentPins.length > 0 && (
                <div className="pt-1 space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Recently Connected Counters
                  </span>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    {recentPins.slice(0, 4).map((pin) => (
                      <button
                        key={pin}
                        type="button"
                        onClick={() => {
                          const chars = pin.slice(0, 6).split('');
                          while (chars.length < 6) chars.push('');
                          setPinDigits(chars);
                          handleConnectWithPin(pin);
                        }}
                        className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-rose-400 bg-white dark:bg-slate-800 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition active:scale-95 shadow-sm"
                      >
                        <Clock className="w-3.5 h-3.5 text-slate-400" /> #{pin}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* PWA 1-Tap WhatsApp Share Banner */}
              {canInstallPWA && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={promptPWAInstall}
                    className="w-full p-3 rounded-2xl bg-gradient-to-r from-rose-500/10 via-purple-500/10 to-indigo-500/10 border border-rose-200 dark:border-rose-900/60 hover:border-rose-400 flex items-center justify-between gap-3 text-left transition active:scale-98 shadow-sm cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow">
                        <Share2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>Enable 1-Tap WhatsApp Share</span>
                          <span className="text-[9px] bg-rose-600 text-white px-1.5 py-0.2 rounded-full font-bold">New</span>
                        </div>
                        <div className="text-[10.5px] text-slate-500 dark:text-slate-400">
                          Add to phone to share PDFs directly from WhatsApp share menu!
                        </div>
                      </div>
                    </div>
                    <span className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shrink-0 shadow">
                      Add
                    </span>
                  </button>
                </div>
              )}

              {/* Supported devices badge */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center gap-3 text-xs text-slate-400 flex-wrap">
                <span className="flex items-center gap-1"><Monitor className="w-3.5 h-3.5" /> PC to PC</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Smartphone className="w-3.5 h-3.5" /> Phone to PC</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Laptop className="w-3.5 h-3.5" /> Laptop to PC</span>
              </div>
            </div>
          ) : (
            /* ── STEP 2: CONNECTED FILE DROP & BEAM ───────────────────────── */
            <>
              {/* Connected Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div>
                    <h1 className="text-base font-extrabold text-slate-900 dark:text-white">Target Counter PC</h1>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono font-black text-rose-600 tracking-widest text-sm">#{targetCounterPin}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setTargetCounterPin('');
                          setPinDigits(['', '', '', '', '', '']);
                          setMobileConnectionStatus('connecting');
                          try { peerRef.current?.destroy(); } catch {}
                        }}
                        className="text-[11px] font-bold text-slate-400 hover:text-rose-600 underline"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                </div>

                {/* Connection Badge */}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                  mobileConnectionStatus === 'connected'
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : mobileConnectionStatus === 'connecting'
                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200'
                    : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200'
                }`}>
                  {mobileConnectionStatus === 'connected' ? (
                    <><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />Connected</>
                  ) : mobileConnectionStatus === 'connecting' ? (
                    <><RefreshCw className="w-3 h-3 animate-spin" />Connecting...</>
                  ) : (
                    <><span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />☁️ Cloud Active</>
                  )}
                </div>
              </div>

              {senderSuccess ? (
                /* Success Screen with Customer Token & Bundle Info */
                <div className="py-6 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 mx-auto flex items-center justify-center">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                      ✅ Delivered to Counter PC
                    </span>
                    <h2 className="text-3xl font-black text-slate-900 dark:text-white pt-3">
                      Token <span className="text-rose-600 font-mono">#{customerToken ?? 1}</span>
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-xs mx-auto pt-1 font-medium">
                      Counter operator ko apna Token <strong className="text-rose-600 font-black">#{customerToken ?? 1}</strong> batayein apna printout lene ke liye.
                    </p>
                  </div>

                  {/* Delivered documents list */}
                  {deliveredBatch.length > 0 && (
                    <div className="text-left bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-3 border border-slate-200 dark:border-slate-700 space-y-1.5 max-h-40 overflow-y-auto">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
                        Delivered in Token #{customerToken ?? 1} ({deliveredBatch.length} file{deliveredBatch.length > 1 ? 's' : ''}):
                      </span>
                      {deliveredBatch.map((f, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                          <span className="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[200px]">{f.name}</span>
                          <span className="font-mono text-[11px] text-rose-600 font-bold shrink-0 ml-2">
                            {f.copies} {f.copies > 1 ? 'copies' : 'copy'} · {f.colorMode === 'bw' ? 'B&W' : 'Color'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2 pt-2">
                    <button
                      onClick={() => {
                        setSenderSuccess(false);
                        setSenderFiles([]);
                        setSenderCopies(1);
                        setSenderColorMode('bw');
                      }}
                      className="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-sm font-bold shadow-md transition"
                    >
                      ➕ Send More Files (Same Token #{customerToken ?? 1})
                    </button>

                    <button
                      onClick={() => {
                        // Allocate fresh device ID so user can send for another person
                        try {
                          const newDevId = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
                          localStorage.setItem(PMS_SENDER_DEVICE_ID_KEY, newDevId);
                        } catch {}
                        setCustomerToken(null);
                        setDeliveredBatch([]);
                        setSenderSuccess(false);
                        setSenderFiles([]);
                        setSenderCopies(1);
                        setSenderColorMode('bw');
                      }}
                      className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-slate-400 text-xs font-semibold text-slate-600 dark:text-slate-300 transition"
                    >
                      🔄 New Customer (Get Fresh Token)
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Shared from WhatsApp Banner */}
                  {isSharedFromExternal && (
                    <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/60 dark:to-teal-950/40 border border-emerald-300 dark:border-emerald-800 flex items-center justify-between text-xs text-emerald-900 dark:text-emerald-200 shadow-sm animate-in fade-in">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="font-bold">Loaded directly from WhatsApp / System Share!</span>
                      </div>
                      <span className="text-[10px] font-mono font-bold bg-emerald-200 dark:bg-emerald-900/80 text-emerald-900 dark:text-emerald-100 px-2 py-0.5 rounded-full">
                        Ready to Send
                      </span>
                    </div>
                  )}

                  {/* Privacy Notice */}
                  <div className="p-3 rounded-2xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
                    🔒 <strong>100% Private &amp; Direct:</strong> Files beam straight to counter #{targetCounterPin}. No WhatsApp, no contact sharing.
                  </div>

                  {/* If files are already loaded (e.g. from Mobile/PC Share), show Selected Files & Beam Button FIRST at the top! */}
                  {senderFiles.length > 0 && (
                    <div className="space-y-3 p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-rose-600" />
                          <span>Ready to Print ({senderFiles.length} {senderFiles.length > 1 ? 'files' : 'file'})</span>
                        </span>
                        {senderFiles.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setSenderFiles([]);
                              setIsSharedFromExternal(false);
                              void clearSharedFilesCache();
                            }}
                            className="text-[11px] font-bold text-rose-600 hover:underline"
                          >
                            Clear all
                          </button>
                        )}
                      </div>

                      {/* Selected file list */}
                      <div className="max-h-36 overflow-y-auto space-y-1.5">
                        {senderFiles.map((f, i) => (
                          <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 text-xs shadow-xs">
                            <span className="truncate max-w-[200px] font-bold text-slate-800 dark:text-slate-200">{f.name}</span>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <span className="text-slate-400 font-mono text-[11px]">{formatFileSize(f.size)}</span>
                              <button
                                type="button"
                                onClick={() => removeSenderFile(i)}
                                className="p-1 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950 text-slate-400 hover:text-rose-600 transition"
                                title="Remove file"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Large File notice badge */}
                      {senderFiles.some((f) => f.size > 25 * 1024 * 1024) && (
                        <div className="flex items-center gap-1.5 p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300 text-[11px] font-semibold">
                          <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Large file detected — Multi-stream fast transfer enabled</span>
                        </div>
                      )}

                      {/* Print options */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {/* Copies selector */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Copies</span>
                          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-xl px-2 py-2 border border-slate-200 dark:border-slate-700">
                            <button
                              onClick={() => setSenderCopies((n) => Math.max(1, n - 1))}
                              className="w-6 h-6 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 flex items-center justify-center hover:bg-rose-50 transition"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-sm font-black text-slate-900 dark:text-white flex-1 text-center">{senderCopies}</span>
                            <button
                              onClick={() => setSenderCopies((n) => Math.min(20, n + 1))}
                              className="w-6 h-6 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 flex items-center justify-center hover:bg-rose-50 transition"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Color mode selector */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Print Mode</span>
                          <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                            <button
                              onClick={() => setSenderColorMode('bw')}
                              className={`flex-1 py-2 text-xs font-bold transition ${
                                senderColorMode === 'bw'
                                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              B&amp;W
                            </button>
                            <button
                              onClick={() => setSenderColorMode('color')}
                              className={`flex-1 py-2 text-xs font-bold transition ${
                                senderColorMode === 'color'
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              Color
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Upload progress */}
                      {senderUploading && (
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-xs font-bold text-rose-600">
                            <span className="truncate max-w-[220px]">{senderStatusText}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono">{senderProgress}%</span>
                              <button
                                type="button"
                                onClick={() => {
                                  senderAbortRef.current = true;
                                  setSenderUploading(false);
                                  setSenderStatusText('Cancelled');
                                  setSenderProgress(0);
                                }}
                                className="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-[10px] font-bold hover:bg-rose-200 transition"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                          {/* Animated gradient progress bar */}
                          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                            <div
                              className="h-3 rounded-full transition-all duration-100"
                              style={{
                                width: `${senderProgress}%`,
                                background: 'linear-gradient(90deg, #e11d48, #f97316, #e11d48)',
                                backgroundSize: '200% 100%',
                                animation: 'gradientMove 1.2s linear infinite',
                              }}
                            />
                          </div>
                          <style>{`
                            @keyframes gradientMove {
                              0% { background-position: 0% 50%; }
                              100% { background-position: 200% 50%; }
                            }
                          `}</style>
                        </div>
                      )}

                      {/* Send button */}
                      <button
                        onClick={handleCustomerUpload}
                        disabled={senderUploading}
                        className="w-full py-4 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                      >
                        {senderUploading ? (
                          <><RefreshCw className="w-4 h-4 animate-spin" /> Beaming Document...</>
                        ) : (
                          <><Zap className="w-4 h-4" /> Beam to Counter #{targetCounterPin} ({senderCopies} cop{senderCopies > 1 ? 'ies' : 'y'} · {senderColorMode === 'bw' ? 'B&W' : 'Color'})</>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Drag & Drop File picker (Compact if files already loaded, Large if empty) */}
                  <label
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDragEnd={() => setIsDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      const dropped = Array.from(e.dataTransfer.files || []);
                      if (dropped.length) handleFilesSelected(dropped, false);
                    }}
                    className={`block border-2 border-dashed rounded-3xl text-center cursor-pointer transition-all active:scale-95 ${
                      senderFiles.length > 0 ? 'p-3.5' : 'p-7'
                    } ${
                      isDragOver
                        ? 'border-rose-600 bg-rose-50 dark:bg-rose-950/40'
                        : 'border-slate-300 dark:border-slate-700 hover:border-rose-500 bg-slate-50/40 dark:bg-slate-800/40'
                    }`}
                  >
                    {senderFiles.length === 0 && <Upload className="w-10 h-10 mx-auto text-slate-400 mb-2" />}
                    <span className="font-extrabold text-xs sm:text-sm text-slate-800 dark:text-slate-200 block">
                      {isDragOver ? 'Drop files here!' : senderFiles.length > 0 ? '➕ Tap to Add More Documents' : 'Tap or Drag & Drop Documents here'}
                    </span>
                    {senderFiles.length === 0 && (
                      <span className="text-xs text-slate-400 mt-1 block">PDF, Aadhaar, Photos, Docs — Up to 100 MB</span>
                    )}
                    <input
                      type="file"
                      multiple
                      accept="application/pdf,image/*,.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                      className="hidden"
                      onChange={(e) => {
                        handleFilesSelected(Array.from(e.target.files || []), false);
                        e.target.value = '';
                      }}
                    />
                  </label>

                  {/* Quick Action Helpers: Camera Scan & WhatsApp PWA Installer */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-rose-500 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer transition active:scale-95 shadow-sm">
                      <Camera className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>Take Photo / Camera Scan</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          if (files.length) handleFilesSelected(files, true);
                          e.target.value = '';
                        }}
                      />
                    </label>

                    {canInstallPWA && (
                      <button
                        type="button"
                        onClick={promptPWAInstall}
                        className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl bg-gradient-to-r from-rose-500/10 to-indigo-500/10 border border-rose-200 dark:border-rose-900/60 hover:border-rose-400 text-xs font-bold text-rose-700 dark:text-rose-300 transition active:scale-95 shadow-sm cursor-pointer"
                      >
                        <Share2 className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>Enable WhatsApp Share (1-Tap)</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── Render Single Document Row (Used in both Grouped and Flat views) ────
  const renderJobRow = (job: PrintJob, isInsideBundle = false) => (
    <div
      key={job.id}
      className={`p-3 sm:p-3.5 rounded-2xl border transition-all ${
        job.status === 'printed'
          ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/70 dark:border-emerald-800/60'
          : isInsideBundle
          ? 'bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-700 shadow-xs'
          : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200/70 dark:border-slate-700 hover:border-rose-400'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Token Badge if not inside bundle card */}
          {!isInsideBundle && (
            <div className={`flex flex-col items-center justify-center min-w-[50px] h-12 rounded-xl text-white font-black shadow-sm shrink-0 ${
              job.status === 'printed' ? 'bg-emerald-600' : 'bg-rose-600'
            }`}>
              <span className="text-[8px] uppercase font-bold tracking-tight opacity-80 leading-none">Token</span>
              <span className="text-base font-extrabold leading-none mt-0.5">#{job.tokenNum}</span>
            </div>
          )}

          {/* Thumbnail */}
          <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-rose-600 shrink-0 overflow-hidden">
            {job.type.startsWith('image/') ? (
              <img src={job.dataUrl} alt={job.name} className="w-full h-full object-cover" />
            ) : (
              <FileText className="w-5 h-5" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-sm text-slate-900 dark:text-white truncate max-w-[180px] sm:max-w-[240px]">
                {job.name}
              </p>
              {job.status === 'printed' && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 shrink-0">
                  ✅ Printed {job.printedAt || ''}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="font-mono">{formatFileSize(job.size)}</span>
              {job.pages && (
                <>
                  <span>•</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-[10px]">
                    {job.pages} page{job.pages > 1 ? 's' : ''}
                  </span>
                  <span>•</span>
                  <span className="font-extrabold text-rose-600">
                    Total: {job.pages * job.copies} prints
                  </span>
                </>
              )}
              {job.detectedOrientation === 'landscape' && (
                <>
                  <span>•</span>
                  <span className="font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 rounded text-[10px]">
                    🔄 Landscape
                  </span>
                </>
              )}
              <span>•</span>
              <span>{job.timestamp}</span>
              {job.copies > 1 && !job.pages && (
                <><span>•</span><span className="font-bold text-rose-500">×{job.copies} copies</span></>
              )}
            </p>
          </div>
        </div>

        {/* Action controls */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap sm:flex-nowrap self-end sm:self-center">
          {job.status === 'pending' ? (
            <>
              {/* Copies control */}
              <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-1.5 py-1">
                <button
                  type="button"
                  onClick={() => updateJobField(job.id, 'copies', Math.max(1, job.copies - 1))}
                  className="w-5 h-5 rounded flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="text-xs font-black text-slate-900 dark:text-white w-5 text-center">{job.copies}</span>
                <button
                  type="button"
                  onClick={() => updateJobField(job.id, 'copies', Math.min(20, job.copies + 1))}
                  className="w-5 h-5 rounded flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>

              {/* B&W / Color toggle */}
              <select
                value={job.colorMode}
                onChange={(e) => updateJobField(job.id, 'colorMode', e.target.value as 'bw' | 'color')}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none"
              >
                <option value="bw">B&W</option>
                <option value="color">Color</option>
              </select>

              {/* Orientation toggle */}
              <select
                value={job.orientation || 'auto'}
                onChange={(e) => updateJobField(job.id, 'orientation', e.target.value as 'auto' | 'portrait' | 'landscape')}
                title="Page Orientation (Auto detects Landscape)"
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none"
              >
                <option value="auto">
                  Auto {job.detectedOrientation ? `(${job.detectedOrientation === 'landscape' ? 'Land' : 'Port'})` : ''}
                </option>
                <option value="portrait">📄 Port</option>
                <option value="landscape">🔄 Land</option>
              </select>

              {/* 1-Click Print */}
              <button
                type="button"
                onClick={() => handlePrint(job)}
                disabled={printingJobId === job.id}
                className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                {printingJobId === job.id ? (
                  <><RefreshCw className="w-3 h-3 animate-spin" /> Rendering...</>
                ) : (
                  <><Printer className="w-3.5 h-3.5" /> Print</>
                )}
              </button>

              {/* Mark as Done */}
              <button
                type="button"
                onClick={() => markAsPrinted(job.id)}
                title="Mark as Printed"
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 transition-all"
              >
                <Check className="w-3.5 h-3.5" /> Done
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => markAsPending(job.id)}
                title="Move back to Pending"
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-1 hover:bg-slate-50 transition"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" /> Undo
              </button>
              <button
                type="button"
                onClick={() => handlePrint(job)}
                className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs flex items-center gap-1 shadow-sm hover:opacity-90 transition"
              >
                <Printer className="w-3.5 h-3.5" /> Re-Print
              </button>
            </>
          )}

          {/* Preview */}
          <button
            type="button"
            onClick={async () => {
              try {
                if (job.dataUrl.startsWith('blob:')) { window.open(job.dataUrl, '_blank'); return; }
                const { buffer, type } = await urlToArrayBuffer(job.dataUrl);
                window.open(URL.createObjectURL(arrayBufferToBlob(buffer, type)), '_blank');
              } catch {
                window.open(job.dataUrl, '_blank');
              }
            }}
            title="Preview"
            className="p-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>

          {/* Download */}
          <button
            type="button"
            onClick={() => {
              const a = document.createElement('a');
              a.href = job.dataUrl;
              a.download = job.name;
              a.click();
            }}
            title="Download"
            className="p-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 transition"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Delete */}
          <button
            type="button"
            onClick={() => deleteJob(job.id)}
            title="Delete"
            className="p-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════
  // COUNTER PC SHOPKEEPER VIEW
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Top Mode Switcher Bar */}
        <div className="flex items-center justify-center">
          <div className="inline-flex p-1.5 rounded-2xl bg-slate-200/80 dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700 shadow-sm max-w-full overflow-x-auto">
            <button
              onClick={() => {
                setIsSenderMode(false);
                setPeerReconnectKey((k) => k + 1);
              }}
              className="flex items-center gap-2 px-4 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-extrabold bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm transition"
            >
              <Printer className="w-4 h-4 text-rose-600" />
              <span>📥 Counter Station (Print Queue)</span>
            </button>
            <button
              onClick={() => {
                setIsSenderMode(true);
                setPeerReconnectKey((k) => k + 1);
              }}
              className="flex items-center gap-2 px-4 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition"
            >
              <Zap className="w-4 h-4 text-rose-600" />
              <span>📤 Beam Files (Send to another PC)</span>
            </button>
          </div>
        </div>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-600 text-xs font-bold mb-2">
              <Sparkles className="w-3.5 h-3.5" /> E-Mitra &amp; Cyber Cafe Super Tool
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">
              Scan to Print QR Web-Drop
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
              Keep this screen open on your counter PC. Customers scan the QR with their phone and beam documents
              directly to your queue for 1-click printing — no WhatsApp, no app needed.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Connection status pill */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
              peerStatus === 'online' || peerStatus === 'cloud'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 text-emerald-700 dark:text-emerald-300'
                : peerStatus === 'error'
                ? 'bg-red-50 dark:bg-red-950/60 border-red-300 text-red-700 dark:text-red-300'
                : 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 text-amber-700'
            }`}>
              {peerStatus === 'online' ? (
                <><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />Station Online (P2P + Cloud)</>
              ) : peerStatus === 'cloud' ? (
                <><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />Station Online (Cloud Active)</>
              ) : peerStatus === 'error' ? (
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Station Offline</span>
                  <button
                    onClick={() => {
                      setPeerStatus('connecting');
                      peerRetryCountRef.current = 0;
                      setPeerReconnectKey((k) => k + 1);
                    }}
                    className="ml-1 underline font-bold cursor-pointer hover:text-red-900 dark:hover:text-red-200"
                  >
                    Reconnect
                  </button>
                </div>
              ) : (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Connecting...</>
              )}
            </div>

            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                soundEnabled
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 text-emerald-700 dark:text-emerald-300'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-300 text-slate-400'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              {soundEnabled ? 'Chime ON' : 'Muted'}
            </button>

            <button
              onClick={handlePrintAll}
              disabled={!pendingJobs.length}
              className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs shadow-md disabled:opacity-40 flex items-center gap-2 hover:opacity-90 transition"
            >
              <Printer className="w-4 h-4" /> Print All ({pendingJobs.length})
            </button>
          </div>
        </div>

        {/* ── Main Grid ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* ── LEFT: QR Station ─────────────────────────────────────────── */}
          <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-sm space-y-5 sticky top-20">
            <div className="text-center space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 dark:bg-rose-950/60 px-3 py-1 rounded-full">
                Customer Mobile Scan
              </span>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Scan with Phone Camera</h2>
              <p className="text-xs text-slate-500">No app or mobile number required. Instant direct transfer.</p>
            </div>

            {/* QR Card */}
            <div className="p-5 rounded-3xl bg-slate-50 dark:bg-slate-800/60 border-2 border-dashed border-rose-200 dark:border-rose-900 flex flex-col items-center">
              <div className="p-3 bg-white rounded-2xl shadow-md border border-slate-100">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Scan to Print QR"
                    className="w-52 h-52 object-contain"
                  />
                ) : (
                  <div className="w-52 h-52 flex flex-col items-center justify-center text-slate-400 gap-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-rose-600" />
                    <span className="text-xs">Generating QR...</span>
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-col items-center gap-1.5 w-full">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">Counter PIN:</span>
                  <span className="text-xl font-black tracking-widest text-slate-900 dark:text-white bg-white dark:bg-slate-900 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 font-mono">
                    {sessionCode}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Permanent QR (Standee Safe)</span>
                </div>

                <div className="w-full mt-1 p-2 rounded-xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-[11px] text-rose-700 dark:text-rose-300 text-center font-medium">
                  💡 <strong>WhatsApp Share Ready:</strong> Customers can share PDFs directly from WhatsApp share menu to print!
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomPinInput(sessionCode);
                      setCustomShopNameInput(shopName);
                      setShowPinModal(true);
                    }}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-rose-400 bg-white dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 transition"
                    title="Customize Shop Name & PIN"
                  >
                    <Edit3 className="w-3 h-3 text-rose-600" /> Custom PIN / Shop
                  </button>
                  <button
                    type="button"
                    onClick={handleResetPin}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-rose-400 bg-white dark:bg-slate-800 text-[11px] font-bold text-slate-500 hover:text-rose-600 flex items-center gap-1 transition"
                    title="Generate fresh random PIN"
                  >
                    <RefreshCw className="w-3 h-3" /> Reset
                  </button>
                </div>
              </div>

              {pinNotice && (
                <div className="mt-2.5 w-full p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-100 flex flex-col gap-1.5">
                  <div className="flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>{pinNotice}</span>
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setPinNotice(null);
                        setPeerStatus('connecting');
                        setPeerReconnectKey((k) => k + 1);
                      }}
                      className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px]"
                    >
                      Reconnect
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomPinInput(sessionCode);
                        setCustomShopNameInput(shopName);
                        setShowPinModal(true);
                      }}
                      className="px-2 py-0.5 rounded border border-amber-400 text-amber-900 dark:text-amber-100 font-bold text-[10px]"
                    >
                      Change PIN
                    </button>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 text-center px-2">
                Scan QR or enter PIN <strong className="text-rose-600 font-mono">#{sessionCode}</strong> to beam files wirelessly from any phone, laptop, or PC!
              </p>

              <div className="mt-2 flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                {connectedMobiles > 0
                  ? `📱 ${connectedMobiles} Phone(s) Connected`
                  : '🟢 Waiting for Customer Scan'}
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2.5">
              {/* Copy link */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={mobileLink}
                  className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-600 dark:text-slate-300 outline-none truncate"
                />
                <button
                  onClick={copyLink}
                  className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-600 text-xs font-bold border border-rose-200 dark:border-rose-900 hover:bg-rose-100 flex items-center gap-1 shrink-0 transition"
                >
                  <Copy className="w-3.5 h-3.5" /> {copiedLink ? 'Copied!' : 'Copy'}
                </button>
              </div>

              {/* Print QR for counter display */}
              <button
                onClick={handlePrintQr}
                className="w-full py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-rose-400 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors hover:bg-rose-50 dark:hover:bg-rose-950/30"
              >
                <Printer className="w-3.5 h-3.5" /> Print QR for Counter Display
              </button>

              {/* Drop from PC */}
              <label
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const files = Array.from(e.dataTransfer.files || []);
                  if (!files.length) return;
                  files.forEach((file) => {
                    const blobUrl = URL.createObjectURL(file);
                    const job: PrintJob = {
                      id: `local_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                      tokenNum: tokenCounterRef.current++,
                      name: file.name,
                      size: file.size,
                      type: file.type || 'application/pdf',
                      dataUrl: blobUrl,
                      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                      copies: 1,
                      colorMode: 'bw',
                      status: 'pending',
                    };
                    addIncomingJob(job);
                  });
                }}
                className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-rose-400 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors hover:bg-slate-50"
              >
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

          {/* ── RIGHT: Print Queue ───────────────────────────────────────── */}
          <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-sm space-y-5">

            {/* Tabs & View Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setQueueTab('pending')}
                  className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all ${
                    queueTab === 'pending'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-current opacity-80 animate-pulse" />
                  Waiting to Print ({pendingJobs.length})
                </button>

                <button
                  type="button"
                  onClick={() => setQueueTab('printed')}
                  className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all ${
                    queueTab === 'printed'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Printed Today ({printedJobs.length})
                </button>
              </div>

              <div className="flex items-center gap-2.5 self-end sm:self-center flex-wrap">
                {/* View Switcher: Customer Bundles vs Flat Files */}
                <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-xs">
                  <button
                    type="button"
                    onClick={() => setViewMode('grouped')}
                    className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 transition ${
                      viewMode === 'grouped'
                        ? 'bg-white dark:bg-slate-900 text-rose-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title="Customer-wise Bundles"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Customer Bundles</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('flat')}
                    className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 transition ${
                      viewMode === 'flat'
                        ? 'bg-white dark:bg-slate-900 text-rose-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title="All Files Flat List"
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>All Files</span>
                  </button>
                </div>

                {printJobs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      printJobs.forEach((j) => {
                        if (j.dataUrl.startsWith('blob:')) { try { URL.revokeObjectURL(j.dataUrl); } catch {} }
                      });
                      setPrintJobs([]);
                    }}
                    className="text-xs text-rose-600 hover:underline font-semibold flex items-center gap-1 ml-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Clear All
                  </button>
                )}
              </div>
            </div>

            {/* Incoming progress bar */}
            {incomingProgress && (
              <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <RefreshCw className="w-4 h-4 text-rose-600 animate-spin shrink-0" />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                    Receiving &ldquo;{incomingProgress.name}&rdquo;...
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-24 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-rose-600 h-1.5 rounded-full transition-all duration-100"
                      style={{ width: `${incomingProgress.progress}%` }}
                    />
                  </div>
                  <span className="text-xs font-black text-rose-600 font-mono w-8 text-right">{incomingProgress.progress}%</span>
                </div>
              </div>
            )}

            {/* ── Tab 1: Pending ──────────────────────────────────────────── */}
            {queueTab === 'pending' && (
              <>
                {pendingJobs.length === 0 ? (
                  <div className="py-14 text-center space-y-3">
                    <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 mx-auto flex items-center justify-center">
                      <Printer className="w-8 h-8" />
                    </div>
                    <h3 className="font-bold text-slate-700 dark:text-slate-200 text-sm">Queue is Empty</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      When a customer scans your QR code and beams files, their documents arrive neatly bundled under a Customer Token!
                    </p>
                  </div>
                ) : viewMode === 'grouped' ? (
                  /* ── Grouped by Customer Bundles ── */
                  <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                    {pendingCustomerGroups.map((group) => (
                      <div
                        key={group.customerToken}
                        className="rounded-3xl border-2 border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 shadow-sm overflow-hidden hover:border-rose-400 dark:hover:border-rose-600 transition-all"
                      >
                        {/* Bundle Header */}
                        <div className="bg-gradient-to-r from-slate-50 via-rose-50/25 to-slate-50 dark:from-slate-800/80 dark:via-rose-950/20 dark:to-slate-800/80 p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            {/* Big Customer Token Badge */}
                            <div className="flex flex-col items-center justify-center min-w-[56px] h-14 rounded-2xl bg-rose-600 text-white font-black shadow-sm shrink-0">
                              <span className="text-[9px] uppercase font-bold tracking-tight opacity-90 leading-none">Customer</span>
                              <span className="text-xl font-extrabold leading-none mt-0.5">#{group.customerToken}</span>
                            </div>

                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-black text-slate-900 dark:text-white text-base">
                                  Customer Bundle #{group.customerToken}
                                </h3>
                                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300">
                                  {group.pendingJobs.length} doc{group.pendingJobs.length > 1 ? 's' : ''} · {group.totalPrints} print{group.totalPrints > 1 ? 's' : ''}
                                </span>
                                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  {group.deviceLabel.includes('Mobile') ? '📱' : '💻'} {group.deviceLabel}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                Arrived: {group.firstTimestamp} • {group.totalFiles} file{group.totalFiles > 1 ? 's' : ''} in total
                              </p>
                            </div>
                          </div>

                          {/* Bundle Action Buttons */}
                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center flex-wrap">
                            <button
                              type="button"
                              onClick={() => handlePrintCustomerBundle(group)}
                              disabled={isPrintingCustomerToken === group.customerToken}
                              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-extrabold text-xs shadow-sm flex items-center gap-1.5 transition disabled:opacity-50"
                            >
                              {isPrintingCustomerToken === group.customerToken ? (
                                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Printing Bundle...</>
                              ) : (
                                <><Printer className="w-3.5 h-3.5" /> Print Customer Bundle ({group.totalPrints})</>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => markCustomerBundlePrinted(group.customerToken)}
                              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 transition shadow-sm"
                              title="Mark All Documents in this Bundle as Printed"
                            >
                              <Check className="w-3.5 h-3.5" /> All Done
                            </button>

                            <button
                              type="button"
                              onClick={() => deleteCustomerBundle(group.customerToken)}
                              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                              title="Delete Customer Bundle"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Documents inside this Customer Bundle */}
                        <div className="p-3 sm:p-4 space-y-2 bg-slate-50/40 dark:bg-slate-900/40">
                          {group.jobs.map((job) => renderJobRow(job, true))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* ── Flat File List ── */
                  <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
                    {pendingJobs.map((job) => renderJobRow(job, false))}
                  </div>
                )}
              </>
            )}

            {/* ── Tab 2: Printed History ──────────────────────────────────── */}
            {queueTab === 'printed' && (
              <>
                {printedJobs.length === 0 ? (
                  <div className="py-14 text-center space-y-3">
                    <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 mx-auto flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <h3 className="font-bold text-slate-700 dark:text-slate-200 text-sm">No Documents Printed Yet</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      When you print or click &ldquo;Done&rdquo;, items move here so you never confuse pending jobs.
                    </p>
                  </div>
                ) : viewMode === 'grouped' ? (
                  /* ── Grouped Printed Customer Bundles ── */
                  <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                    {printedCustomerGroups.map((group) => (
                      <div
                        key={group.customerToken}
                        className="rounded-3xl border border-emerald-200/80 dark:border-emerald-800/60 bg-emerald-50/20 dark:bg-emerald-950/10 shadow-xs overflow-hidden"
                      >
                        <div className="p-3.5 sm:p-4 bg-emerald-50/50 dark:bg-emerald-950/30 border-b border-emerald-200/60 dark:border-emerald-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col items-center justify-center min-w-[52px] h-13 rounded-2xl bg-emerald-600 text-white font-black shadow-xs shrink-0">
                              <span className="text-[8px] uppercase font-bold tracking-tight opacity-90 leading-none">Customer</span>
                              <span className="text-lg font-extrabold leading-none mt-0.5">#{group.customerToken}</span>
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                                  Customer #{group.customerToken} Completed
                                </h4>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                                  ✅ {group.totalFiles} doc{group.totalFiles > 1 ? 's' : ''} ({group.totalPrints} prints)
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                Arrived: {group.firstTimestamp}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() => markCustomerBundlePending(group.customerToken)}
                              className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-1.5 hover:bg-slate-50 transition"
                            >
                              <RotateCcw className="w-3.5 h-3.5 text-slate-500" /> Undo All
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePrintCustomerBundle(group)}
                              className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs flex items-center gap-1.5 shadow-sm hover:opacity-90 transition"
                            >
                              <Printer className="w-3.5 h-3.5" /> Re-Print
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteCustomerBundle(group.customerToken)}
                              className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="p-3 sm:p-4 space-y-2">
                          {group.jobs.map((job) => renderJobRow(job, true))}
                        </div>
                      </div>
                    ))}

                    <div className="pt-2 text-center">
                      <button
                        type="button"
                        onClick={clearPrintedHistory}
                        className="text-xs text-slate-400 hover:text-rose-600 font-semibold inline-flex items-center gap-1.5 transition-colors py-1 px-3 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Clear Printed History ({printedJobs.length})
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Flat Printed List ── */
                  <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
                    {printedJobs.map((job) => renderJobRow(job, false))}

                    <div className="pt-2 text-center">
                      <button
                        type="button"
                        onClick={clearPrintedHistory}
                        className="text-xs text-slate-400 hover:text-rose-600 font-semibold inline-flex items-center gap-1.5 transition-colors py-1 px-3 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Clear Printed History ({printedJobs.length})
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Shop Identity & Custom PIN Modal ────────────────────────────── */}
        {showPinModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center">
                    <Store className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Shop &amp; Permanent PIN Settings</h3>
                    <p className="text-xs text-slate-500">Fixed forever on your counter QR Standee</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPinModal(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Shop / Counter Name (Printed on QR Standee)
                  </label>
                  <input
                    type="text"
                    value={customShopNameInput}
                    onChange={(e) => setCustomShopNameInput(e.target.value)}
                    placeholder="e.g. Sharma Cyber Cafe & E-Mitra"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-rose-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Custom Counter PIN / Shop Code
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    value={customPinInput}
                    onChange={(e) => setCustomPinInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    placeholder="e.g. SHARMA or 6-CHAR PIN"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-black font-mono tracking-widest text-slate-900 dark:text-white focus:outline-none focus:border-rose-500 uppercase"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    3 to 10 letters/numbers (e.g. <span className="font-mono font-bold text-rose-600">SHARMA</span>, <span className="font-mono font-bold text-rose-600">CYBER1</span>, or <span className="font-mono font-bold text-rose-600">{sessionCode}</span>).
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200 text-xs">
                  ⚠️ <strong>Note:</strong> Agar aap PIN change karenge to aapka puraana printed QR standee update ho jayega aur aapko naya QR print karna hoga.
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPinModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveCustomPin(customPinInput || sessionCode, customShopNameInput)}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md transition"
                >
                  Save &amp; Update QR
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SEO Section */}
        <ToolSEOSection
          toolName="Scan to Print QR Web-Drop"
          headline="Instant Mobile-to-PC Print Queue Without Saving WhatsApp Numbers"
          description="Free web-based print drop station for E-Mitra, CSC centers, and xerox shops. Customers scan a counter QR code on their phone to beam documents directly to your PC for instant 1-click printing."
        />
      </div>
    </div>
  );
}
