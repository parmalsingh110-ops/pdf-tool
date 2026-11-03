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
  ArrowRight,
  ShieldCheck,
  Zap,
  Radio,
  Wifi,
  RefreshCw,
  Clock,
  Layers,
  RotateCcw,
  Check,
} from 'lucide-react';
import { Peer } from 'peerjs';
import QRCode from 'qrcode';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { apiFetch, API_BASE } from '../lib/api';

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
  chunks: (string | undefined)[];
  receivedCount: number;
  copies: number;
  colorMode: 'bw' | 'color';
}

const CHUNK_SIZE = 64 * 1024; // 64 KB binary safe WebRTC SCTP packet size

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
  const [queueTab, setQueueTab] = useState<'pending' | 'printed'>('pending');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [peerStatus, setPeerStatus] = useState<'connecting' | 'online' | 'error'>('connecting');
  const [connectedMobiles, setConnectedMobiles] = useState<number>(0);
  const [incomingProgress, setIncomingProgress] = useState<{ name: string; progress: number } | null>(null);
  const [printingJobId, setPrintingJobId] = useState<string | null>(null);

  // Sender state (Mobile customer)
  const [senderFiles, setSenderFiles] = useState<File[]>([]);
  const [senderUploading, setSenderUploading] = useState(false);
  const [senderProgress, setSenderProgress] = useState(0);
  const [senderStatusText, setSenderStatusText] = useState('Beaming to Counter PC...');
  const [senderSuccess, setSenderSuccess] = useState(false);
  const [customerToken, setCustomerToken] = useState<number | null>(null);
  const [mobileConnectionStatus, setMobileConnectionStatus] = useState<'connecting' | 'connected' | 'fallback'>('connecting');

  // Peer & Channel references
  const peerRef = useRef<Peer | null>(null);
  const mobileConnRef = useRef<any>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const incomingTransfersRef = useRef<Record<string, IncomingTransfer>>({});
  const ackResolversRef = useRef<Record<string, (token?: number) => void>>({});
  const tokenCounterRef = useRef<number>(1);

  // Format file size nicely (KB / MB)
  const formatFileSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  // Convert base64 / dataUrl into binary Blob
  const dataUrlToBlob = (dataUrl: string): Blob => {
    try {
      if (dataUrl.startsWith('blob:')) {
        // Already a blob url
        return new Blob([], { type: 'application/pdf' });
      }
      const parts = dataUrl.split(';base64,');
      const contentType = parts[0]?.split(':')[1] || 'application/pdf';
      const raw = window.atob(parts[1] || '');
      const rawLength = raw.length;
      const uInt8Array = new Uint8Array(rawLength);
      for (let i = 0; i < rawLength; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
      }
      return new Blob([uInt8Array], { type: contentType });
    } catch {
      return new Blob([], { type: 'application/pdf' });
    }
  };

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

  // Add incoming job with deduplication and token assignment
  const addIncomingJob = useCallback(
    (job: Omit<PrintJob, 'tokenNum' | 'status'> & { tokenNum?: number; status?: 'pending' | 'printed' }) => {
      setPrintJobs((prev) => {
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
    },
    [playChime]
  );

  // Initialize session from URL or generate counter room PIN
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const existingSession = params.get('session');

    if (existingSession) {
      setSessionCode(existingSession.toUpperCase());
      setIsSenderMode(true);
    } else {
      const stored = sessionStorage.getItem('pms_counter_session');
      const newSession = stored || Math.random().toString(36).substring(2, 8).toUpperCase();
      sessionStorage.setItem('pms_counter_session', newSession);
      setSessionCode(newSession);
      setIsSenderMode(false);
    }
  }, []);

  // BroadcastChannel for local cross-tab testing
  useEffect(() => {
    if (!sessionCode) return;

    const channelName = `pdfmediasuite_print_${sessionCode}`;
    const bc = new BroadcastChannel(channelName);
    channelRef.current = bc;

    bc.onmessage = (event) => {
      const data = event.data;
      if (data && data.action === 'NEW_PRINT_JOB' && !isSenderMode && data.job) {
        addIncomingJob(data.job);
      }
    };

    return () => {
      bc.close();
    };
  }, [sessionCode, isSenderMode, addIncomingJob]);

  // ==================== REAL-TIME WEBRTC (PEERJS) SETUP ====================
  useEffect(() => {
    if (!sessionCode) return;

    const roomId = `pms-print-${sessionCode.toLowerCase()}`;
    let peer: Peer;

    if (!isSenderMode) {
      // ── COUNTER PC MODE ──
      peer = new Peer(roomId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      });

      peerRef.current = peer;

      peer.on('open', () => {
        setPeerStatus('online');
      });

      peer.on('connection', (conn) => {
        setConnectedMobiles((prev) => prev + 1);

        conn.on('data', (data: any) => {
          if (!data || typeof data !== 'object') return;

          // 1. Chunked transfer start
          if (data.action === 'JOB_START') {
            incomingTransfersRef.current[data.jobId] = {
              jobId: data.jobId,
              name: data.name,
              size: data.size,
              type: data.type || 'application/pdf',
              timestamp: data.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              totalChunks: data.totalChunks,
              chunks: new Array(data.totalChunks),
              receivedCount: 0,
              copies: data.copies || 1,
              colorMode: data.colorMode || 'bw',
            };
            setIncomingProgress({ name: data.name, progress: 0 });
          }

          // 2. Chunk arrival
          else if (data.action === 'JOB_CHUNK') {
            const transfer = incomingTransfersRef.current[data.jobId];
            if (transfer) {
              transfer.chunks[data.index] = data.chunk;
              transfer.receivedCount++;
              const pct = Math.round((transfer.receivedCount / transfer.totalChunks) * 100);
              setIncomingProgress({ name: transfer.name, progress: pct });
            }
          }

          // 3. Chunked transfer finish
          else if (data.action === 'JOB_FINISH') {
            const transfer = incomingTransfersRef.current[data.jobId];
            if (transfer) {
              const fullDataUrl = transfer.chunks.join('');
              const tokenNum = tokenCounterRef.current++;
              const job: PrintJob = {
                id: transfer.jobId,
                tokenNum,
                name: transfer.name,
                size: transfer.size,
                type: transfer.type,
                dataUrl: fullDataUrl,
                timestamp: transfer.timestamp,
                copies: transfer.copies,
                colorMode: transfer.colorMode,
                status: 'pending',
              };
              addIncomingJob(job);
              delete incomingTransfersRef.current[data.jobId];
              setIncomingProgress(null);

              try {
                conn.send({ action: 'JOB_ACK', jobId: transfer.jobId, tokenNum });
              } catch {}
            }
          }

          // 4. Single-shot payload fallback (for small files)
          else if (data.action === 'NEW_PRINT_JOB' && data.job) {
            const tokenNum = tokenCounterRef.current++;
            addIncomingJob({ ...data.job, tokenNum, status: 'pending' });
            try {
              conn.send({ action: 'JOB_ACK', jobId: data.job.id, tokenNum });
            } catch {}
          }
        });

        conn.on('close', () => {
          setConnectedMobiles((prev) => Math.max(0, prev - 1));
        });
      });

      peer.on('error', (err) => {
        console.warn('WebRTC peer notice on PC:', err.type);
        if (err.type === 'unavailable-id') {
          const freshPin = Math.random().toString(36).substring(2, 8).toUpperCase();
          sessionStorage.setItem('pms_counter_session', freshPin);
          setSessionCode(freshPin);
        }
        setPeerStatus('online');
      });
    } else {
      // ── MOBILE SENDER MODE ──
      peer = new Peer({
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      });

      peerRef.current = peer;

      peer.on('open', () => {
        const conn = peer.connect(roomId, { reliable: true });
        mobileConnRef.current = conn;

        conn.on('open', () => {
          setMobileConnectionStatus('connected');
        });

        conn.on('data', (data: any) => {
          if (data && data.action === 'JOB_ACK' && data.jobId) {
            if (data.tokenNum) {
              setCustomerToken(data.tokenNum);
            }
            const resolver = ackResolversRef.current[data.jobId];
            if (resolver) {
              resolver(data.tokenNum);
              delete ackResolversRef.current[data.jobId];
            }
          }
        });

        conn.on('error', () => {
          setMobileConnectionStatus('fallback');
        });

        setTimeout(() => {
          if (!conn.open) {
            setMobileConnectionStatus('fallback');
          }
        }, 4000);
      });

      peer.on('error', () => {
        setMobileConnectionStatus('fallback');
      });
    }

    const handleBeforeUnload = () => {
      try {
        peer.destroy();
      } catch {}
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      try {
        peer.destroy();
      } catch {}
    };
  }, [sessionCode, isSenderMode, addIncomingJob]);

  // ==================== BACKEND API RELAY POLLING (PC FALLBACK) ====================
  useEffect(() => {
    if (isSenderMode || !sessionCode) return;

    // Poll backend every 3.5 seconds
    const pollInterval = setInterval(async () => {
      try {
        const res = await apiFetch(`/api/print-drop/jobs/${sessionCode}`, { timeoutMs: 5000 });
        if (res.ok) {
          const data = await res.json();
          if (data.jobs && Array.isArray(data.jobs) && data.jobs.length > 0) {
            data.jobs.forEach((j: any) => {
              if (j.tokenNum) {
                tokenCounterRef.current = Math.max(tokenCounterRef.current, j.tokenNum + 1);
              }
              addIncomingJob({ ...j, status: 'pending' });
            });
          }
        }
      } catch {
        // Quiet fail - WebRTC and Local channels handle it
      }
    }, 3500);

    return () => clearInterval(pollInterval);
  }, [isSenderMode, sessionCode, addIncomingJob]);

  // Construct mobile upload link
  const mobileLink = typeof window !== 'undefined'
    ? `${window.location.origin}/scan-to-print?session=${sessionCode}`
    : `https://www.pdfmediasuite.in/scan-to-print?session=${sessionCode}`;

  // Instant 100% Local In-Browser QR Code Generation (Zero External Network Delay)
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  useEffect(() => {
    if (!mobileLink || !sessionCode) return;
    QRCode.toDataURL(mobileLink, {
      width: 280,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => {
        console.warn('Local QR generation error, using fallback', err);
        setQrDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=8&data=${encodeURIComponent(mobileLink)}`);
      });
  }, [mobileLink, sessionCode]);

  // High-Speed Relay Uploader with exact byte progress (Handles 20MB-50MB smoothly)
  const uploadViaRelay = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('session_id', sessionCode);
      formData.append('file', file);
      formData.append('copies', '1');
      formData.append('color_mode', 'bw');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 95);
          setSenderProgress(pct);
          const loadedMb = (e.loaded / (1024 * 1024)).toFixed(1);
          const totalMb = (e.total / (1024 * 1024)).toFixed(1);
          setSenderStatusText(`Beaming ${file.name} (${loadedMb} / ${totalMb} MB)...`);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.token_num) {
              setCustomerToken(data.token_num);
            }
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

  // Handle customer mobile file selection & multi-channel transmit
  const handleCustomerUpload = async () => {
    if (senderFiles.length === 0) return;
    setSenderUploading(true);
    setSenderProgress(2);
    setSenderStatusText('Reading document...');

    try {
      for (let i = 0; i < senderFiles.length; i++) {
        const file = senderFiles[i];
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        // 1. Convert to dataUrl
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const job: PrintJob = {
          id: jobId,
          tokenNum: 0,
          name: file.name,
          size: file.size,
          type: file.type || 'application/pdf',
          dataUrl,
          timestamp,
          copies: 1,
          colorMode: 'bw',
          status: 'pending',
        };

        let beamedViaWebRtc = false;

        // Channel A: WebRTC Direct Send to PC using 64KB High-Speed Chunking Protocol
        if (mobileConnRef.current && mobileConnRef.current.open) {
          try {
            const totalChunks = Math.ceil(dataUrl.length / CHUNK_SIZE);
            setSenderStatusText(`Streaming ${file.name} (0 / ${formatFileSize(file.size)})...`);

            // Step A1: Send metadata header
            mobileConnRef.current.send({
              action: 'JOB_START',
              jobId,
              name: file.name,
              size: file.size,
              type: file.type || 'application/pdf',
              timestamp,
              totalChunks,
              copies: 1,
              colorMode: 'bw',
            });

            const dc = mobileConnRef.current.dataChannel;

            // Step A2: Stream 64KB chunks with dynamic backpressure flow-control
            for (let c = 0; c < totalChunks; c++) {
              const chunk = dataUrl.substring(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE);
              mobileConnRef.current.send({
                action: 'JOB_CHUNK',
                jobId,
                index: c,
                chunk,
              });

              const currentPct = Math.round(((c + 1) / totalChunks) * 90);
              setSenderProgress(currentPct);
              const streamedMb = (((c + 1) * CHUNK_SIZE) / (1024 * 1024)).toFixed(1);
              const totalMb = (file.size / (1024 * 1024)).toFixed(1);
              setSenderStatusText(`Streaming ${file.name} (${streamedMb} / ${totalMb} MB)...`);

              // Real WebRTC flow-control: if buffer exceeds 256KB, wait for drain
              if (dc && dc.bufferedAmount > 256 * 1024) {
                while (dc.bufferedAmount > 64 * 1024) {
                  await new Promise((r) => setTimeout(r, 12));
                }
              } else if (c % 8 === 0) {
                await new Promise((r) => setTimeout(r, 2));
              }
            }

            // Step A3: Send completion signal
            mobileConnRef.current.send({
              action: 'JOB_FINISH',
              jobId,
            });

            beamedViaWebRtc = true;
          } catch (e) {
            console.warn('WebRTC chunk stream notice, using high-speed relay fallback', e);
          }
        }

        // Channel B: Backend Relay API (Guaranteed delivery for all networks)
        if (!beamedViaWebRtc) {
          setSenderStatusText(`Transmitting ${file.name} via cloud relay...`);
          await uploadViaRelay(file);
        } else {
          // Send background copy to relay as secondary guarantee without blocking
          void uploadViaRelay(file);
        }

        // Channel C: BroadcastChannel (for same-browser tab testing)
        if (channelRef.current) {
          try {
            channelRef.current.postMessage({ action: 'NEW_PRINT_JOB', job });
          } catch {}
        }

        // Wait for shopkeeper PC acknowledgment
        if (beamedViaWebRtc) {
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, 2500);
            ackResolversRef.current[jobId] = (token) => {
              clearTimeout(timeout);
              if (token) setCustomerToken(token);
              resolve();
            };
          });
        } else {
          await new Promise((r) => setTimeout(r, 800));
        }
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

  // Direct file drop on Shopkeeper PC
  const handleShopkeeperFileDrop = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const nextToken = tokenCounterRef.current++;
        const job: PrintJob = {
          id: `local_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tokenNum: nextToken,
          name: file.name,
          size: file.size,
          type: file.type || 'application/pdf',
          dataUrl: ev.target?.result as string,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          copies: 1,
          colorMode: 'bw',
          status: 'pending',
        };
        addIncomingJob(job);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  // Mark specific job as Printed (moves to history)
  const markAsPrinted = (id: string) => {
    setPrintJobs((prev) =>
      prev.map((j) =>
        j.id === id
          ? {
              ...j,
              status: 'printed',
              printedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }
          : j
      )
    );
  };

  // Move back to Pending (Undo)
  const markAsPending = (id: string) => {
    setPrintJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, status: 'pending', printedAt: undefined } : j))
    );
  };

  // 1-Click Print specific job with high-resolution canvas multi-page rendering (ZERO BLANK PAGES)
  const handlePrint = async (job: PrintJob) => {
    if (printingJobId) return;
    setPrintingJobId(job.id);

    try {
      if (job.type.includes('image')) {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          alert('Please allow popups to open the print dialog.');
          return;
        }

        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>${job.name} - Print</title>
              <style>
                @page { size: auto; margin: 0; }
                body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #fff; }
                img { max-width: 96vw; max-height: 96vh; object-fit: contain; ${job.colorMode === 'bw' ? 'filter: grayscale(100%) contrast(125%);' : ''} }
              </style>
            </head>
            <body>
              <img src="${job.dataUrl}" onload="window.focus(); window.print(); window.onafterprint = function() { window.close(); };" />
            </body>
          </html>
        `);
        printWindow.document.close();
      } else {
        // PDF PRINTING: Multi-page high-DPI rendering via pdfjsLib
        const blob = dataUrlToBlob(job.dataUrl);
        const arrayBuffer = await blob.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        const pdf = await loadingTask.promise;
        const totalPages = pdf.numPages;

        const pageImages: string[] = [];
        for (let p = 1; p <= totalPages; p++) {
          const page = await pdf.getPage(p);
          const viewport = page.getViewport({ scale: 2.0 }); // 200 DPI crisp print quality
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
            pageImages.push(canvas.toDataURL('image/jpeg', 0.95));
          }
        }

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          const blobUrl = URL.createObjectURL(blob);
          window.open(blobUrl, '_blank');
          return;
        }

        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>${job.name} - Print (${totalPages} pages)</title>
              <style>
                @page { size: A4 auto; margin: 0; }
                body { margin: 0; padding: 0; background: #fff; }
                .page-item { width: 100%; page-break-after: always; display: flex; justify-content: center; align-items: center; }
                .page-item:last-child { page-break-after: avoid; }
                img { width: 100%; height: auto; display: block; ${job.colorMode === 'bw' ? 'filter: grayscale(100%) contrast(125%);' : ''} }
              </style>
            </head>
            <body>
              ${pageImages.map((src) => `<div class="page-item"><img src="${src}" /></div>`).join('')}
              <script>
                window.onload = function() {
                  window.focus();
                  window.print();
                  window.onafterprint = function() { window.close(); };
                };
              </script>
            </body>
          </html>
        `);
        printWindow.document.close();
      }

      // Automatically mark as printed after sending to printer
      markAsPrinted(job.id);
    } catch (err) {
      console.error('Print rendering error, opening native PDF', err);
      try {
        const blob = dataUrlToBlob(job.dataUrl);
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
      } catch {
        alert('Could not render document for printing.');
      }
    } finally {
      setPrintingJobId(null);
    }
  };

  // 1-Click Print All in Queue
  const handlePrintAll = () => {
    const pending = printJobs.filter((j) => j.status === 'pending');
    if (!pending.length) return;
    pending.forEach((j, i) => {
      setTimeout(() => handlePrint(j), i * 1500);
    });
  };

  // Copy shareable link
  const copyLink = () => {
    navigator.clipboard.writeText(mobileLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Filtered jobs
  const pendingJobs = useMemo(() => printJobs.filter((j) => j.status === 'pending'), [printJobs]);
  const printedJobs = useMemo(() => printJobs.filter((j) => j.status === 'printed'), [printJobs]);

  // ==================== MOBILE SENDER VIEW ====================
  if (isSenderMode) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 flex flex-col justify-center items-center">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center font-bold">
                <Printer className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">Shop Print Drop</h1>
                <p className="text-xs text-slate-500">
                  Counter PIN: <span className="font-bold text-rose-600">{sessionCode}</span>
                </p>
              </div>
            </div>

            {/* Connection Status Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{mobileConnectionStatus === 'connected' ? '🟢 PC Connected' : '☁️ Cloud Active'}</span>
            </div>
          </div>

          {senderSuccess ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 mx-auto flex items-center justify-center animate-bounce">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                  Transferred to Operator PC
                </span>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white pt-2">
                  Your Token: <span className="text-rose-600 font-mono">#{customerToken || '1'}</span>
                </h2>
                <p className="text-xs text-slate-500 max-w-xs mx-auto pt-1">
                  Please tell the counter operator your Token is <strong>#{customerToken || '1'}</strong> to collect your printout!
                </p>
              </div>
              <button
                onClick={() => {
                  setSenderSuccess(false);
                  setSenderFiles([]);
                }}
                className="w-full py-3.5 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-sm font-bold shadow-md hover:opacity-90"
              >
                Send Another File
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-rose-50/50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
                🔒 <strong>100% Private &amp; Instant:</strong> Files beam directly to the shopkeeper&apos;s PC. No need to save WhatsApp numbers or share your phone contact.
              </div>

              <label className="block border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl p-8 text-center cursor-pointer hover:border-rose-500 transition-colors">
                <Upload className="w-10 h-10 mx-auto text-slate-400 mb-2" />
                <span className="font-bold text-sm text-slate-700 dark:text-slate-200 block">
                  Tap to Select Document or Photo
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
                <div className="space-y-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Selected Documents ({senderFiles.length})
                  </p>
                  <div className="max-h-40 overflow-y-auto space-y-1.5">
                    {senderFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs">
                        <span className="truncate max-w-[200px] font-medium text-slate-700 dark:text-slate-200">{f.name}</span>
                        <span className="text-slate-400 font-mono">{formatFileSize(f.size)}</span>
                      </div>
                    ))}
                  </div>

                  {senderUploading && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-xs font-bold text-rose-600">
                        <span className="truncate max-w-[280px]">{senderStatusText}</span>
                        <span>{senderProgress}%</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-rose-600 h-2 rounded-full transition-all duration-150"
                          style={{ width: `${senderProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleCustomerUpload}
                    disabled={senderUploading}
                    className="w-full py-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    {senderUploading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Zap className="w-4 h-4" /> Beam to Counter Now ({senderFiles.length})
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
              <Sparkles className="w-3.5 h-3.5" /> E-Mitra &amp; Cyber Cafe Super Tool
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
              disabled={!pendingJobs.length}
              className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs shadow-md disabled:opacity-40 flex items-center gap-2 hover:opacity-90"
            >
              <Printer className="w-4 h-4" /> Print All ({pendingJobs.length})
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
              <div className="p-3 bg-white rounded-2xl shadow-md border border-slate-100 flex items-center justify-center min-w-[200px] min-h-[200px]">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Scan to Print QR Code"
                    className="w-48 h-48 sm:w-56 sm:h-56 object-contain"
                  />
                ) : (
                  <div className="w-48 h-48 sm:w-56 sm:h-56 flex flex-col items-center justify-center text-slate-400 gap-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-rose-600" />
                    <span className="text-xs">Generating instant QR...</span>
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Counter PIN:</span>
                <span className="text-lg font-black tracking-widest text-slate-900 dark:text-white bg-white dark:bg-slate-900 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                  {sessionCode}
                </span>
              </div>

              {/* Real-time Connection Status */}
              <div className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>
                  {connectedMobiles > 0
                    ? `📱 ${connectedMobiles} Phone(s) Connected!`
                    : '🟢 Counter Station Online (Waiting for Scan)'}
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

          {/* RIGHT: Live Incoming Print Queue with Pending / Printed tabs */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-sm space-y-5">
            {/* Queue Navigation Tabs */}
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
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
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
                  onClick={() => setPrintJobs([])}
                  className="text-xs text-rose-600 hover:underline font-semibold flex items-center gap-1 self-end sm:self-center"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear All
                </button>
              )}
            </div>

            {/* Live Incoming Streaming Indicator */}
            {incomingProgress && (
              <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 animate-pulse flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-rose-600 animate-spin" />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    Receiving &ldquo;{incomingProgress.name}&rdquo; from mobile phone...
                  </span>
                </div>
                <span className="text-xs font-black text-rose-600 font-mono">{incomingProgress.progress}%</span>
              </div>
            )}

            {/* TAB 1: PENDING QUEUE */}
            {queueTab === 'pending' && (
              <>
                {pendingJobs.length === 0 ? (
                  <div className="py-16 text-center space-y-3">
                    <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 mx-auto flex items-center justify-center">
                      <Printer className="w-8 h-8" />
                    </div>
                    <h3 className="font-bold text-slate-700 dark:text-slate-200 text-sm">Print Queue is Empty</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      When a customer scans your counter QR code on their phone and beams a file, it will pop up here with an automatic Token Number!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                    {pendingJobs.map((job) => (
                      <div
                        key={job.id}
                        className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 hover:border-rose-400 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        {/* File Info + Token Badge */}
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Prominent Token Badge */}
                          <div className="flex flex-col items-center justify-center min-w-[48px] h-12 rounded-2xl bg-rose-600 text-white font-black text-sm shadow-sm shrink-0">
                            <span className="text-[9px] uppercase font-bold tracking-tight opacity-80 leading-none">Token</span>
                            <span className="text-base font-extrabold leading-none mt-0.5">#{job.tokenNum}</span>
                          </div>

                          <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-rose-600 shrink-0 overflow-hidden">
                            {job.type.includes('image') ? (
                              <img src={job.dataUrl} alt={job.name} className="w-full h-full object-cover" />
                            ) : (
                              <FileText className="w-5 h-5" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <p className="font-bold text-sm text-slate-900 dark:text-white truncate max-w-[200px] sm:max-w-[220px]">
                              {job.name}
                            </p>
                            <p className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                              <span className="font-mono">{formatFileSize(job.size)}</span>
                              <span>•</span>
                              <span>{job.timestamp}</span>
                            </p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center flex-wrap sm:flex-nowrap">
                          <select
                            value={job.colorMode}
                            onChange={(e) => {
                              const mode = e.target.value as 'bw' | 'color';
                              setPrintJobs((prev) =>
                                prev.map((j) => (j.id === job.id ? { ...j, colorMode: mode } : j))
                              );
                            }}
                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none"
                          >
                            <option value="bw">B&amp;W</option>
                            <option value="color">Color</option>
                          </select>

                          {/* 1-Click Print */}
                          <button
                            onClick={() => handlePrint(job)}
                            disabled={printingJobId === job.id}
                            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
                          >
                            {printingJobId === job.id ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Rendering...
                              </>
                            ) : (
                              <>
                                <Printer className="w-3.5 h-3.5" /> 1-Click Print
                              </>
                            )}
                          </button>

                          {/* Mark as Printed */}
                          <button
                            onClick={() => markAsPrinted(job.id)}
                            title="Mark as Printed and move out of pending queue"
                            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all"
                          >
                            <Check className="w-3.5 h-3.5" /> Done
                          </button>

                          {/* Preview in tab */}
                          <button
                            onClick={() => {
                              try {
                                const blob = dataUrlToBlob(job.dataUrl);
                                const blobUrl = URL.createObjectURL(blob);
                                window.open(blobUrl, '_blank');
                              } catch {
                                const w = window.open('', '_blank');
                                w?.document.write(`<iframe src="${job.dataUrl}" style="border:0;width:100vw;height:100vh;"></iframe>`);
                              }
                            }}
                            title="Preview in New Tab"
                            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 text-xs"
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
                            title="Download to PC"
                            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 text-xs"
                          >
                            <Download className="w-4 h-4" />
                          </button>

                          {/* Delete */}
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
              </>
            )}

            {/* TAB 2: PRINTED HISTORY */}
            {queueTab === 'printed' && (
              <>
                {printedJobs.length === 0 ? (
                  <div className="py-16 text-center space-y-3">
                    <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 mx-auto flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <h3 className="font-bold text-slate-700 dark:text-slate-200 text-sm">No Documents Printed Yet</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      When you print or click &ldquo;Done&rdquo; on an incoming document, it will move here so you never confuse pending jobs!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                    {printedJobs.map((job) => (
                      <div
                        key={job.id}
                        className="p-4 rounded-2xl bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        {/* File Info + Token Badge */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex flex-col items-center justify-center min-w-[48px] h-12 rounded-2xl bg-emerald-600 text-white font-black text-sm shadow-sm shrink-0">
                            <span className="text-[9px] uppercase font-bold tracking-tight opacity-80 leading-none">Token</span>
                            <span className="text-base font-extrabold leading-none mt-0.5">#{job.tokenNum}</span>
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-sm text-slate-900 dark:text-white truncate max-w-[200px] sm:max-w-[220px]">
                                {job.name}
                              </p>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                                ✅ Printed {job.printedAt || ''}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                              <span className="font-mono">{formatFileSize(job.size)}</span>
                              <span>•</span>
                              <span>Received at {job.timestamp}</span>
                            </p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          <button
                            onClick={() => markAsPending(job.id)}
                            title="Move back to Pending Queue"
                            className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-1.5 hover:bg-slate-50 transition-all"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-slate-500" /> Undo
                          </button>

                          <button
                            onClick={() => handlePrint(job)}
                            className="px-3 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs flex items-center gap-1.5 shadow-sm"
                          >
                            <Printer className="w-3.5 h-3.5" /> Re-Print
                          </button>

                          <button
                            onClick={() => setPrintJobs((prev) => prev.filter((j) => j.id !== job.id))}
                            title="Delete"
                            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 text-xs"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* SEO Guide Section */}
        <ToolSEOSection
          toolName="Scan to Print QR Web-Drop"
          headline="Instant Mobile-to-PC Print Queue Without Saving WhatsApp Numbers"
          description="Free web-based print drop station for E-Mitra, CSC centers, and xerox shops. Customers scan a counter QR code on their phone to beam documents directly to your PC for instant 1-click printing."
        />
      </div>
    </div>
  );
}
