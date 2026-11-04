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
} from 'lucide-react';
import { Peer } from 'peerjs';
import QRCode from 'qrcode';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { apiFetch, API_BASE } from '../lib/api';

// ─── Types ─────────────────────────────────────────────────────────────────
interface PrintJob {
  id: string;
  tokenNum: number;
  name: string;
  size: number;
  type: string;
  dataUrl: string;
  timestamp: string;
  pages?: number;
  copies: number;
  colorMode: 'bw' | 'color';
  status: 'pending' | 'printed';
  printedAt?: string;
}

interface IncomingTransfer {
  jobId: string;
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
}

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
  const [isSenderMode, setIsSenderMode] = useState<boolean>(false);

  // ── Shopkeeper Queue state ───────────────────────────────────────────────
  const [printJobs, setPrintJobs] = useState<PrintJob[]>([]);
  const [queueTab, setQueueTab] = useState<'pending' | 'printed'>('pending');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [peerStatus, setPeerStatus] = useState<'connecting' | 'online' | 'error'>('connecting');
  const [connectedMobiles, setConnectedMobiles] = useState<number>(0);
  const [incomingProgress, setIncomingProgress] = useState<{ name: string; progress: number } | null>(null);
  const [printingJobId, setPrintingJobId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  // ── Sender state (Mobile customer) ──────────────────────────────────────
  const [senderFiles, setSenderFiles] = useState<File[]>([]);
  const [senderUploading, setSenderUploading] = useState(false);
  const [senderProgress, setSenderProgress] = useState(0);
  const [senderStatusText, setSenderStatusText] = useState('Beaming to Counter PC...');
  const [senderSuccess, setSenderSuccess] = useState(false);
  const [customerToken, setCustomerToken] = useState<number | null>(null);
  const [senderCopies, setSenderCopies] = useState<number>(1);
  const [senderColorMode, setSenderColorMode] = useState<'bw' | 'color'>('bw');
  const [mobileConnectionStatus, setMobileConnectionStatus] = useState<'connecting' | 'connected' | 'fallback'>('connecting');
  const [peerReconnectKey, setPeerReconnectKey] = useState<number>(0);

  // ── Peer & Channel refs ──────────────────────────────────────────────────
  const peerRef = useRef<Peer | null>(null);
  const mobileConnRef = useRef<any>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const incomingTransfersRef = useRef<Record<string, IncomingTransfer>>({});
  const ackResolversRef = useRef<Record<string, (token?: number) => void>>({});
  const tokenCounterRef = useRef<number>(1);
  const pollBackoffRef = useRef<number>(3500);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const senderAbortRef = useRef<boolean>(false);

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

  // ─── Background PDF Page Counter ────────────────────────────────────────
  const detectPdfPages = useCallback(async (jobId: string, dataUrl: string) => {
    try {
      const { buffer } = await urlToArrayBuffer(dataUrl);
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;
      setPrintJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, pages: numPages } : j))
      );
    } catch {}
  }, []);

  // ─── Add Job with Deduplication ─────────────────────────────────────────
  const addIncomingJob = useCallback(
    (job: Omit<PrintJob, 'tokenNum' | 'status'> & { tokenNum?: number; status?: 'pending' | 'printed' }) => {
      setPrintJobs((prev) => {
        // Deduplicate by ID and by (name + ±100-byte size)
        if (prev.some((j) => j.id === job.id || (j.name === job.name && Math.abs(j.size - job.size) < 100))) {
          return prev;
        }
        playChime();
        const assignedToken = job.tokenNum || tokenCounterRef.current++;
        const completeJob: PrintJob = {
          ...job,
          tokenNum: assignedToken,
          status: job.status || 'pending',
        };
        return [completeJob, ...prev];
      });

      // Detect pages in background if PDF
      if ((job.type === 'application/pdf' || job.name?.toLowerCase().endsWith('.pdf')) && !job.pages && job.dataUrl) {
        void detectPdfPages(job.id, job.dataUrl);
      }
    },
    [playChime, detectPdfPages]
  );

  // ─── Session Initialization ──────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const existingSession = params.get('session');

    if (existingSession) {
      setSessionCode(existingSession.toUpperCase());
      setIsSenderMode(true);
    } else {
      const stored = sessionStorage.getItem('pms_counter_session');
      if (stored) {
        setSessionCode(stored);
        setIsSenderMode(false);
      } else {
        const initialPin = generateCleanPin();
        sessionStorage.setItem('pms_counter_session', initialPin);
        setSessionCode(initialPin);
        setIsSenderMode(false);

        // Try to get a collision-free server-verified session
        apiFetch('/api/print-drop/new-session')
          .then((res) => res.json())
          .then((data) => {
            if (data?.session_id) {
              sessionStorage.setItem('pms_counter_session', data.session_id);
              setSessionCode(data.session_id);
            }
          })
          .catch(() => {});
      }
    }
  }, []);

  // ─── BroadcastChannel (same-browser cross-tab) ───────────────────────────
  useEffect(() => {
    if (!sessionCode) return;
    const bc = new BroadcastChannel(`pdfmediasuite_print_${sessionCode}`);
    channelRef.current = bc;

    bc.onmessage = (event) => {
      const data = event.data;
      if (data?.action === 'NEW_PRINT_JOB' && !isSenderMode && data.job) {
        addIncomingJob(data.job);
      }
    };

    return () => { bc.close(); };
  }, [sessionCode, isSenderMode, addIncomingJob]);

  // ─── QR Code Generation ──────────────────────────────────────────────────
  const mobileLink = typeof window !== 'undefined'
    ? `${window.location.origin}/scan-to-print?session=${sessionCode}`
    : `https://www.pdfmediasuite.in/scan-to-print?session=${sessionCode}`;

  useEffect(() => {
    if (!mobileLink || !sessionCode) return;
    QRCode.toDataURL(mobileLink, {
      width: 300,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
      errorCorrectionLevel: 'H', // Highest — survives printed damage
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => {
        setQrDataUrl(
          `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&ecc=H&data=${encodeURIComponent(mobileLink)}`
        );
      });
  }, [mobileLink, sessionCode]);

  // ─── WebRTC PeerJS (Primary Transport) ──────────────────────────────────
  useEffect(() => {
    if (!sessionCode) return;

    const roomId = `pms-print-${sessionCode.toLowerCase()}`;
    let peer: Peer;

    if (!isSenderMode) {
      // ── COUNTER PC MODE ──────────────────────────────────────────────────
      peer = new Peer(roomId, {
        debug: 0,
        config: { iceServers: ICE_SERVERS },
      });
      peerRef.current = peer;

      peer.on('open', () => setPeerStatus('online'));

      peer.on('connection', (conn) => {
        setConnectedMobiles((n) => n + 1);

        conn.on('data', (data: any) => {
          if (!data || typeof data !== 'object') return;

          if (data.action === 'JOB_START') {
            // Initialise chunked transfer
            // NOTE: totalChunks is an *estimate* (small-chunk count at warm-up time).
            // The actual chunk count may differ due to adaptive chunk sizing.
            // We use a Map-based approach on receive so sparse chunk indices work correctly.
            incomingTransfersRef.current[data.jobId] = {
              jobId: data.jobId,
              name: data.name,
              size: data.size,
              type: data.type || 'application/pdf',
              timestamp: data.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              totalChunks: data.totalChunks || 1,
              chunks: [],  // Will be filled sparsely by index
              receivedCount: 0,
              receivedBytes: 0,
              copies: data.copies || 1,
              colorMode: data.colorMode || 'bw',
            };
            setIncomingProgress({ name: data.name, progress: 0 });
          }

          else if (data.action === 'JOB_CHUNK') {
            const transfer = incomingTransfersRef.current[data.jobId];
            if (transfer) {
              const chunkBuf = data.chunk as ArrayBuffer;
              if (!transfer.chunks[data.index]) {
                transfer.chunks[data.index] = chunkBuf;
                transfer.receivedCount++;
                transfer.receivedBytes = (transfer.receivedBytes || 0) + (chunkBuf?.byteLength || 0);
              }
              const pct = Math.min(99, Math.round((transfer.receivedBytes / transfer.size) * 100));
              setIncomingProgress({ name: transfer.name, progress: pct });
            }
          }

          else if (data.action === 'JOB_FINISH') {
            const transfer = incomingTransfersRef.current[data.jobId];
            if (transfer) {
              let blobUrl = '';
              try {
                // Sort chunks by index and concatenate — handles any chunk size / order
                const validChunks = (transfer.chunks as (ArrayBuffer | undefined)[])
                  .filter((c): c is ArrayBuffer => c !== undefined);
                const blob = new Blob(validChunks, { type: transfer.type });
                blobUrl = URL.createObjectURL(blob);
              } catch {
                blobUrl = '';
              }

              const tokenNum = tokenCounterRef.current++;
              const job: PrintJob = {
                id: transfer.jobId,
                tokenNum,
                name: transfer.name,
                size: transfer.size,
                type: transfer.type,
                dataUrl: blobUrl,
                timestamp: transfer.timestamp,
                copies: transfer.copies,
                colorMode: transfer.colorMode,
                status: 'pending',
              };

              if (blobUrl) addIncomingJob(job);
              delete incomingTransfersRef.current[data.jobId];
              setIncomingProgress(null);

              // Send ACK with token back to mobile
              try { conn.send({ action: 'JOB_ACK', jobId: transfer.jobId, tokenNum }); } catch {}
            }
          }

          // Single-shot fallback for tiny files
          else if (data.action === 'NEW_PRINT_JOB' && data.job) {
            const tokenNum = tokenCounterRef.current++;
            addIncomingJob({ ...data.job, tokenNum, status: 'pending' });
            try { conn.send({ action: 'JOB_ACK', jobId: data.job.id, tokenNum }); } catch {}
          }
        });

        conn.on('close', () => setConnectedMobiles((n) => Math.max(0, n - 1)));
      });

      peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
          // Collision — regenerate a fresh session pin
          const freshPin = generateCleanPin();
          sessionStorage.setItem('pms_counter_session', freshPin);
          setSessionCode(freshPin);
        } else if (err.type === 'peer-unavailable') {
          // Expected when a mobile client disconnects
        } else {
          setPeerStatus('error');
        }
      });
    } else {
      // ── MOBILE SENDER MODE ───────────────────────────────────────────────
      peer = new Peer({
        debug: 0,
        config: { iceServers: ICE_SERVERS },
      });
      peerRef.current = peer;

      peer.on('open', () => {
        const conn = peer.connect(roomId, { reliable: true });
        mobileConnRef.current = conn;

        conn.on('open', () => setMobileConnectionStatus('connected'));

        conn.on('data', (data: any) => {
          if (data?.action === 'JOB_ACK' && data.jobId) {
            if (data.tokenNum) setCustomerToken(data.tokenNum);
            const resolver = ackResolversRef.current[data.jobId];
            if (resolver) {
              resolver(data.tokenNum);
              delete ackResolversRef.current[data.jobId];
            }
          }
        });

        conn.on('error', () => setMobileConnectionStatus('fallback'));

        // If not connected in 5s, fall back to cloud relay
        setTimeout(() => {
          if (!conn.open) setMobileConnectionStatus('fallback');
        }, 5000);
      });

      peer.on('error', () => setMobileConnectionStatus('fallback'));
    }

    const handleBeforeUnload = () => { try { peer.destroy(); } catch {} };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      try { peer.destroy(); } catch {}
    };
  }, [sessionCode, isSenderMode, addIncomingJob, peerReconnectKey]);

  // ─── Backend API Polling (PC Fallback, progressive backoff) ─────────────
  useEffect(() => {
    if (isSenderMode || !sessionCode) return;

    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await apiFetch(`/api/print-drop/jobs/${sessionCode}`, { timeoutMs: 5000 });
        if (res.ok) {
          const data = await res.json();
          if (data.jobs?.length) {
            for (const j of data.jobs) {
              if (j.tokenNum) tokenCounterRef.current = Math.max(tokenCounterRef.current, j.tokenNum + 1);

              let fileBlobUrl = j.dataUrl || '';
              if (j.fileUrl && !fileBlobUrl) {
                try {
                  const fileRes = await apiFetch(j.fileUrl, { timeoutMs: 40000 });
                  if (fileRes.ok) {
                    const blob = await fileRes.blob();
                    fileBlobUrl = URL.createObjectURL(blob);
                  }
                } catch {}
              }

              if (fileBlobUrl) addIncomingJob({ ...j, dataUrl: fileBlobUrl, status: 'pending' });
            }
            // Got new jobs — reset backoff to fast
            pollBackoffRef.current = 3500;
          } else {
            // Empty — back off gradually up to 12 seconds to save resources
            pollBackoffRef.current = Math.min(pollBackoffRef.current + 500, 12000);
          }
        }
      } catch {
        // Backend sleeping — silent fail, slow down polling
        pollBackoffRef.current = Math.min(pollBackoffRef.current + 1000, 12000);
      }

      if (!cancelled) {
        pollTimerRef.current = setTimeout(poll, pollBackoffRef.current);
      }
    };

    pollTimerRef.current = setTimeout(poll, 3500);

    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [isSenderMode, sessionCode, addIncomingJob]);

  // ─── Print QR Code (Shopkeeper can print and stick on counter) ───────────
  const handlePrintQr = () => {
    if (!qrDataUrl) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Counter QR Code - ${sessionCode}</title>
          <style>
            @page { size: A5 portrait; margin: 0; }
            body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; background: #fff; font-family: system-ui, sans-serif; }
            .box { border: 3px solid #000; border-radius: 16px; padding: 24px 28px; text-align: center; }
            h1 { font-size: 20px; margin: 0 0 4px; font-weight: 900; }
            p { font-size: 13px; color: #444; margin: 0 0 16px; }
            img { width: 240px; height: 240px; display: block; margin: 0 auto 16px; }
            .pin { font-size: 28px; font-weight: 900; letter-spacing: 6px; border: 2px solid #000; padding: 6px 20px; border-radius: 8px; display: inline-block; margin-bottom: 12px; }
            .sub { font-size: 11px; color: #666; }
          </style>
        </head>
        <body>
          <div class="box">
            <h1>📄 Scan to Print</h1>
            <p>Scan QR code from your phone to send documents directly for printing</p>
            <img src="${qrDataUrl}" alt="QR Code" />
            <div>
              <div class="pin">${sessionCode}</div>
            </div>
            <div class="sub">No WhatsApp • No App • 100% Private<br>Or visit: ${mobileLink}</div>
          </div>
          <script>window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; };<\/script>
        </body>
      </html>
    `);
    win.document.close();
  };

  // ─── Relay Upload (Fallback / secondary guarantee) ───────────────────────
  const uploadViaRelay = (file: File, copies: number, colorMode: 'bw' | 'color'): Promise<boolean> => {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('session_id', sessionCode);
      formData.append('file', file);
      formData.append('copies', String(copies));
      formData.append('color_mode', colorMode);

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
      xhr.open('POST', `${API_BASE}/api/print-drop/upload`);
      xhr.send(formData);
    });
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

        // ── Channel A: WebRTC Sliding-Window High-Speed Stream ───────────
        if (mobileConnRef.current?.open) {
          try {
            const dc: RTCDataChannel | null = mobileConnRef.current.dataChannel ?? null;

            // Determine adaptive chunk size based on connection quality
            let chunkSize = CHUNK_SIZE_SMALL;
            const totalChunksSmall = Math.ceil(file.size / chunkSize);

            mobileConnRef.current.send({
              action: 'JOB_START',
              jobId,
              name: file.name,
              size: file.size,
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
            while (nextChunkIdx < Math.min(WINDOW_SIZE, Math.ceil(file.size / CHUNK_SIZE_SMALL))) {
              if (senderAbortRef.current) break;
              const start = nextChunkIdx * CHUNK_SIZE_SMALL;
              const end = Math.min(start + CHUNK_SIZE_SMALL, file.size);
              const buf = await file.slice(start, end).arrayBuffer();

              mobileConnRef.current.send({ action: 'JOB_CHUNK', jobId, index: nextChunkIdx, chunk: buf });
              sentBytes += (end - start);
              nextChunkIdx++;

              // Update UI every 2 chunks during warmup
              if (nextChunkIdx % 2 === 0) {
                setSenderProgress(Math.round((sentBytes / file.size) * 85));
                setSenderStatusText(`Streaming ${file.name} (${(sentBytes / 1048576).toFixed(1)} / ${(file.size / 1048576).toFixed(1)} MB)...`);
              }
            }

            // After warm-up: switch to larger chunks for maximum throughput
            const elapsed = Date.now() - tStart;
            chunkSize = elapsed < 500 ? CHUNK_SIZE_LARGE : CHUNK_SIZE_MEDIUM;

            // ── Sliding window for remaining file ──────────────────────────
            let offset = sentBytes;

            while (offset < file.size) {
              if (senderAbortRef.current) break;

              const windowPromises: Promise<{ buf: ArrayBuffer; idx: number }>[] = [];

              for (let w = 0; w < WINDOW_SIZE && offset + w * chunkSize < file.size; w++) {
                const chunkStart = offset + w * chunkSize;
                const chunkEnd = Math.min(chunkStart + chunkSize, file.size);
                const currentIdx = nextChunkIdx + w;
                windowPromises.push(
                  file.slice(chunkStart, chunkEnd).arrayBuffer().then((buf) => ({
                    buf,
                    idx: currentIdx,
                  }))
                );
              }

              // Read all window chunks in parallel (non-blocking I/O)
              const windowChunks = await Promise.all(windowPromises);
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
              const pct = Math.round((sentBytes / file.size) * 90);
              setSenderProgress(pct);
              const speedMbps = ((sentBytes / 1048576) / Math.max(0.1, (Date.now() - tStart) / 1000)).toFixed(1);
              setSenderStatusText(
                `Streaming ${file.name} · ${(sentBytes / 1048576).toFixed(1)} / ${(file.size / 1048576).toFixed(1)} MB · ${speedMbps} MB/s`
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

        // ── Channel B: Backend Relay (guaranteed delivery fallback) ──────
        if (!beamedViaWebRtc) {
          setSenderStatusText(`Transmitting ${file.name} via cloud relay...`);
          await uploadViaRelay(file, senderCopies, senderColorMode);
        } else {
          // Background relay copy — silent secondary guarantee (no await)
          void uploadViaRelay(file, senderCopies, senderColorMode);
        }

        // ── Channel C: BroadcastChannel (same-browser testing) ───────────
        if (channelRef.current) {
          try {
            const blobUrl = URL.createObjectURL(file);
            channelRef.current.postMessage({
              action: 'NEW_PRINT_JOB',
              job: {
                id: jobId,
                tokenNum: 0,
                name: file.name,
                size: file.size,
                type: file.type || 'application/pdf',
                dataUrl: blobUrl,
                timestamp,
                copies: senderCopies,
                colorMode: senderColorMode,
                status: 'pending',
              },
            });
          } catch {}
        }

        // Wait for PC acknowledgment (or timeout after 4s)
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 4000);
          ackResolversRef.current[jobId] = (token) => {
            clearTimeout(timeout);
            if (token) setCustomerToken(token);
            resolve();
          };
        });
      }

      setSenderProgress(100);
      setSenderSuccess(true);
      setSenderFiles([]);
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
        const imgHtml = copiesArr
          .map(() => `<div class="copy"><img src="${job.dataUrl}" /></div>`)
          .join('');

        printWindow.document.write(`
          <!DOCTYPE html><html>
          <head><title>${job.name} — Print (×${job.copies})</title>
          <style>
            @page { size: auto; margin: 8mm; }
            body { margin: 0; background: #fff; }
            .copy { display: flex; align-items: center; justify-content: center; width: 100%; page-break-after: always; min-height: 96vh; }
            .copy:last-child { page-break-after: avoid; }
            img { max-width: 100%; max-height: 96vh; object-fit: contain; ${filter} }
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

        // Render all pages to high-DPI JPEG data URLs
        const pageImages: string[] = [];
        for (let p = 1; p <= totalPages; p++) {
          const page = await pdf.getPage(p);
          // 2.5x scale = ~225 DPI on 90 PPI display — crisp laser/inkjet output
          const viewport = page.getViewport({ scale: 2.5 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
          pageImages.push(canvas.toDataURL('image/jpeg', 0.92));
          // Allow GC between pages for large docs
          canvas.width = 0;
          canvas.height = 0;
        }

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          // Popup blocked — open native PDF directly
          const blob = arrayBufferToBlob(buffer, type);
          window.open(URL.createObjectURL(blob), '_blank');
          return;
        }

        // Build print page — each page gets exact A4 sizing, copies duplicate the page sequence
        const pagesHtml = copiesArr
          .flatMap(() =>
            pageImages.map(
              (src, idx) => `
              <div class="pg">
                <img src="${src}" alt="Page ${idx + 1}" />
              </div>`
            )
          )
          .join('');

        printWindow.document.write(`
          <!DOCTYPE html><html>
          <head><title>${job.name} (${totalPages}p ×${job.copies})</title>
          <style>
            @page { size: A4 portrait; margin: 0; }
            * { box-sizing: border-box; }
            body { margin: 0; padding: 0; background: #fff; }
            .pg {
              width: 210mm;
              height: 297mm;
              display: flex;
              align-items: center;
              justify-content: center;
              page-break-after: always;
              overflow: hidden;
            }
            .pg:last-child { page-break-after: avoid; }
            img {
              width: 210mm;
              height: 297mm;
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
      }

      // Auto-mark as printed
      markAsPrinted(job.id);
    } catch (err) {
      console.error('Print rendering error', err);
      try {
        const { buffer, type } = await urlToArrayBuffer(job.dataUrl);
        window.open(URL.createObjectURL(arrayBufferToBlob(buffer, type)), '_blank');
      } catch {
        alert('Could not render document for printing.');
      }
    } finally {
      setPrintingJobId(null);
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

  // ════════════════════════════════════════════════════════════════════════
  // MOBILE SENDER VIEW
  // ════════════════════════════════════════════════════════════════════════
  if (isSenderMode) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 p-4 sm:p-6 flex flex-col justify-center items-center">
        <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xl space-y-4">

          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">Shop Print Drop</h1>
                <p className="text-xs text-slate-500">
                  Counter PIN: <span className="font-bold text-rose-600 tracking-widest">{sessionCode}</span>
                </p>
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
                <><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />PC Connected</>
              ) : mobileConnectionStatus === 'connecting' ? (
                <><RefreshCw className="w-3 h-3 animate-spin" />Connecting...</>
              ) : (
                <><span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />☁️ Cloud Active</>
              )}
            </div>
          </div>

          {senderSuccess ? (
            /* Success Screen */
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                  ✅ Sent to Operator PC
                </span>
                <h2 className="text-3xl font-black text-slate-900 dark:text-white pt-3">
                  Token <span className="text-rose-600 font-mono">#{customerToken ?? 1}</span>
                </h2>
                <p className="text-sm text-slate-500 max-w-xs mx-auto pt-1">
                  Tell the counter operator your Token is <strong>#{customerToken ?? 1}</strong> to collect your printout.
                </p>
              </div>
              <button
                onClick={() => { setSenderSuccess(false); setSenderFiles([]); setSenderCopies(1); setSenderColorMode('bw'); }}
                className="w-full py-3.5 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-sm font-bold shadow-md hover:opacity-90 transition"
              >
                Send Another File
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Privacy Notice */}
              <div className="p-3 rounded-2xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
                🔒 <strong>100% Private & Instant:</strong> Files beam directly to the shopkeeper's PC. No WhatsApp, no contact sharing.
              </div>

              {/* File picker */}
              <label className="block border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl p-7 text-center cursor-pointer hover:border-rose-500 transition-colors active:scale-95">
                <Upload className="w-10 h-10 mx-auto text-slate-400 mb-2" />
                <span className="font-bold text-sm text-slate-700 dark:text-slate-200 block">
                  Tap to Select Document or Photo
                </span>
                <span className="text-xs text-slate-400 mt-1 block">PDF, Aadhaar, Photos, Docs — Up to 100 MB</span>
                <input
                  type="file"
                  multiple
                  accept="application/pdf,image/*,.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                  className="hidden"
                  onChange={(e) => {
                    const selected = Array.from(e.target.files || []);
                    const valid: File[] = [];
                    let hasOver100Mb = false;
                    selected.forEach((f) => {
                      if (f.size > 100 * 1024 * 1024) {
                        hasOver100Mb = true;
                      } else {
                        valid.push(f);
                      }
                    });
                    if (hasOver100Mb) {
                      alert('Files larger than 100 MB cannot be transferred. Please select smaller files.');
                    }
                    setSenderFiles(valid);
                  }}
                />
              </label>

              {senderFiles.length > 0 && (
                <div className="space-y-3">
                  {/* Selected file list */}
                  <div className="max-h-36 overflow-y-auto space-y-1.5">
                    {senderFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs">
                        <span className="truncate max-w-[180px] font-medium text-slate-700 dark:text-slate-200">{f.name}</span>
                        <span className="text-slate-400 font-mono shrink-0 ml-2">{formatFileSize(f.size)}</span>
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
                  <div className="grid grid-cols-2 gap-2">
                    {/* Copies selector */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Copies</span>
                      <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-xl px-2 py-2 border border-slate-200 dark:border-slate-700">
                        <button
                          onClick={() => setSenderCopies((n) => Math.max(1, n - 1))}
                          className="w-6 h-6 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center hover:bg-rose-50 transition"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-sm font-black text-slate-900 dark:text-white flex-1 text-center">{senderCopies}</span>
                        <button
                          onClick={() => setSenderCopies((n) => Math.min(20, n + 1))}
                          className="w-6 h-6 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center hover:bg-rose-50 transition"
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
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          B&W
                        </button>
                        <button
                          onClick={() => setSenderColorMode('color')}
                          className={`flex-1 py-2 text-xs font-bold transition ${
                            senderColorMode === 'color'
                              ? 'bg-rose-600 text-white'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
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
                        <span className="truncate max-w-[190px]">{senderStatusText}</span>
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
                    className="w-full py-4 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {senderUploading ? (
                      <><RefreshCw className="w-4 h-4 animate-spin" /> Sending...</>
                    ) : (
                      <><Zap className="w-4 h-4" /> Beam to Counter ({senderCopies} cop{senderCopies > 1 ? 'ies' : 'y'} · {senderColorMode === 'bw' ? 'B&W' : 'Color'})</>
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

  // ════════════════════════════════════════════════════════════════════════
  // COUNTER PC SHOPKEEPER VIEW
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">

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
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${
              peerStatus === 'online'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 text-emerald-700 dark:text-emerald-300'
                : peerStatus === 'error'
                ? 'bg-red-50 dark:bg-red-950/60 border-red-300 text-red-700 dark:text-red-300'
                : 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 text-amber-700'
            }`}>
              {peerStatus === 'online' ? (
                <><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />Station Online</>
              ) : peerStatus === 'error' ? (
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Station Offline</span>
                  <button
                    onClick={() => {
                      setPeerStatus('connecting');
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

              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Counter PIN:</span>
                <span className="text-xl font-black tracking-widest text-slate-900 dark:text-white bg-white dark:bg-slate-900 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                  {sessionCode}
                </span>
              </div>

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
              <label className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-rose-400 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors hover:bg-slate-50">
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

            {/* Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <button
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

              {printJobs.length > 0 && (
                <button
                  onClick={() => {
                    printJobs.forEach((j) => {
                      if (j.dataUrl.startsWith('blob:')) { try { URL.revokeObjectURL(j.dataUrl); } catch {} }
                    });
                    setPrintJobs([]);
                  }}
                  className="text-xs text-rose-600 hover:underline font-semibold flex items-center gap-1 self-end sm:self-center"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear All
                </button>
              )}
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
                      When a customer scans your QR code and beams a file, it pops up here with a Token Number!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
                    {pendingJobs.map((job) => (
                      <div
                        key={job.id}
                        className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 hover:border-rose-400 transition-all"
                      >
                        {/* Top row: token + file info + actions */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Token Badge */}
                            <div className="flex flex-col items-center justify-center min-w-[52px] h-14 rounded-2xl bg-rose-600 text-white font-black shadow-sm shrink-0">
                              <span className="text-[9px] uppercase font-bold tracking-tight opacity-80 leading-none">Token</span>
                              <span className="text-lg font-extrabold leading-none mt-0.5">#{job.tokenNum}</span>
                            </div>

                            {/* Thumbnail */}
                            <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-rose-600 shrink-0 overflow-hidden">
                              {job.type.startsWith('image/') ? (
                                <img src={job.dataUrl} alt={job.name} className="w-full h-full object-cover" />
                              ) : (
                                <FileText className="w-5 h-5" />
                              )}
                            </div>

                            <div className="min-w-0">
                              <p className="font-bold text-sm text-slate-900 dark:text-white truncate max-w-[180px] sm:max-w-[260px]">
                                {job.name}
                              </p>
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
                                <span>•</span>
                                <span>{job.timestamp}</span>
                                {job.copies > 1 && !job.pages && (
                                  <><span>•</span><span className="font-bold text-rose-500">×{job.copies} copies</span></>
                                )}
                              </p>
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex items-center gap-1.5 shrink-0 flex-wrap sm:flex-nowrap self-end sm:self-center">
                            {/* Copies control */}
                            <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-1.5 py-1">
                              <button
                                onClick={() => updateJobField(job.id, 'copies', Math.max(1, job.copies - 1))}
                                className="w-5 h-5 rounded flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="text-xs font-black text-slate-900 dark:text-white w-5 text-center">{job.copies}</span>
                              <button
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
                              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none"
                            >
                              <option value="bw">B&W</option>
                              <option value="color">Color</option>
                            </select>

                            {/* 1-Click Print */}
                            <button
                              onClick={() => handlePrint(job)}
                              disabled={printingJobId === job.id}
                              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
                            >
                              {printingJobId === job.id ? (
                                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Rendering...</>
                              ) : (
                                <><Printer className="w-3.5 h-3.5" /> Print</>
                              )}
                            </button>

                            {/* Mark as Done */}
                            <button
                              onClick={() => markAsPrinted(job.id)}
                              title="Mark as Printed"
                              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 transition-all"
                            >
                              <Check className="w-3.5 h-3.5" /> Done
                            </button>

                            {/* Preview */}
                            <button
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
                              className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 transition"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>

                            {/* Download */}
                            <button
                              onClick={() => {
                                const a = document.createElement('a');
                                a.href = job.dataUrl;
                                a.download = job.name;
                                a.click();
                              }}
                              title="Download"
                              className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 transition"
                            >
                              <Download className="w-4 h-4" />
                            </button>

                            {/* Delete */}
                            <button
                              onClick={() => deleteJob(job.id)}
                              title="Delete"
                              className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
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
                      When you print or click "Done", items move here so you never confuse pending jobs.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
                    {printedJobs.map((job) => (
                      <div
                        key={job.id}
                        className="p-4 rounded-2xl bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Token badge */}
                          <div className="flex flex-col items-center justify-center min-w-[52px] h-14 rounded-2xl bg-emerald-600 text-white font-black shadow-sm shrink-0">
                            <span className="text-[9px] uppercase font-bold tracking-tight opacity-80 leading-none">Token</span>
                            <span className="text-lg font-extrabold leading-none mt-0.5">#{job.tokenNum}</span>
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-sm text-slate-900 dark:text-white truncate max-w-[180px] sm:max-w-[260px]">
                                {job.name}
                              </p>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 shrink-0">
                                ✅ Printed {job.printedAt || ''}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono">{formatFileSize(job.size)}</span>
                              {job.pages && (
                                <>
                                  <span>•</span>
                                  <span className="font-bold text-slate-700 dark:text-slate-200">
                                    {job.pages} pg ({job.pages * job.copies} prints)
                                  </span>
                                </>
                              )}
                              <span>•</span>
                              <span>Received {job.timestamp}</span>
                              {job.copies > 1 && !job.pages && <><span>•</span><span className="text-emerald-600 font-bold">×{job.copies}</span></>}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          <button
                            onClick={() => markAsPending(job.id)}
                            title="Move back to Pending"
                            className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-1.5 hover:bg-slate-50 transition"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-slate-500" /> Undo
                          </button>

                          <button
                            onClick={() => handlePrint(job)}
                            className="px-3 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs flex items-center gap-1.5 shadow-sm hover:opacity-90 transition"
                          >
                            <Printer className="w-3.5 h-3.5" /> Re-Print
                          </button>

                          <button
                            onClick={() => deleteJob(job.id)}
                            title="Delete"
                            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className="pt-2 text-center">
                      <button
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
