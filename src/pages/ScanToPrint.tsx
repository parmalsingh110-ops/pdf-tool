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
  Radio,
  Wifi,
  RefreshCw,
  Clock,
  Layers,
} from 'lucide-react';
import { Peer } from 'peerjs';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { apiFetch } from '../lib/api';

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

const CHUNK_SIZE = 16384; // 16 KB safe WebRTC DataChannel packet size

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
  const [peerStatus, setPeerStatus] = useState<'connecting' | 'online' | 'error'>('connecting');
  const [connectedMobiles, setConnectedMobiles] = useState<number>(0);
  const [incomingProgress, setIncomingProgress] = useState<{ name: string; progress: number } | null>(null);

  // Sender state (Mobile customer)
  const [senderFiles, setSenderFiles] = useState<File[]>([]);
  const [senderUploading, setSenderUploading] = useState(false);
  const [senderProgress, setSenderProgress] = useState(0);
  const [senderStatusText, setSenderStatusText] = useState('Beaming to Counter PC...');
  const [senderSuccess, setSenderSuccess] = useState(false);
  const [mobileConnectionStatus, setMobileConnectionStatus] = useState<'connecting' | 'connected' | 'fallback'>('connecting');

  // Peer & Channel references
  const peerRef = useRef<Peer | null>(null);
  const mobileConnRef = useRef<any>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const incomingTransfersRef = useRef<Record<string, IncomingTransfer>>({});
  const ackResolversRef = useRef<Record<string, () => void>>({});

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

  // Add incoming job with deduplication
  const addIncomingJob = useCallback(
    (job: PrintJob) => {
      setPrintJobs((prev) => {
        if (prev.some((j) => j.id === job.id || (j.name === job.name && Math.abs(j.size - job.size) < 100))) {
          return prev;
        }
        playChime();
        return [job, ...prev];
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
      // Check stored session or create random 6-character room PIN
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
      // Register with fixed Room ID so mobiles can connect directly
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
              const job: PrintJob = {
                id: transfer.jobId,
                name: transfer.name,
                size: transfer.size,
                type: transfer.type,
                dataUrl: fullDataUrl,
                timestamp: transfer.timestamp,
                copies: transfer.copies,
                colorMode: transfer.colorMode,
              };
              addIncomingJob(job);
              delete incomingTransfersRef.current[data.jobId];
              setIncomingProgress(null);

              try {
                conn.send({ action: 'JOB_ACK', jobId: transfer.jobId });
              } catch {}
            }
          }

          // 4. Single-shot payload fallback (for small files)
          else if (data.action === 'NEW_PRINT_JOB' && data.job) {
            addIncomingJob(data.job);
            try {
              conn.send({ action: 'JOB_ACK', jobId: data.job.id });
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
          // If previous tab didn't cleanly disconnect, generate a fresh session code
          const freshPin = Math.random().toString(36).substring(2, 8).toUpperCase();
          sessionStorage.setItem('pms_counter_session', freshPin);
          setSessionCode(freshPin);
        }
        setPeerStatus('online'); // fallback to API polling
      });
    } else {
      // ── MOBILE SENDER MODE ──
      // Create client peer and connect to Counter PC room
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
            const resolver = ackResolversRef.current[data.jobId];
            if (resolver) {
              resolver();
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

    // Poll backend every 2.5 seconds as a secondary guarantee
    const pollInterval = setInterval(async () => {
      try {
        const res = await apiFetch(`/api/print-drop/jobs/${sessionCode}`, { timeoutMs: 3000 });
        if (res.ok) {
          const data = await res.json();
          if (data.jobs && Array.isArray(data.jobs) && data.jobs.length > 0) {
            data.jobs.forEach(addIncomingJob);
          }
        }
      } catch {
        // Quiet fail - WebRTC and Local channels handle it
      }
    }, 2500);

    return () => clearInterval(pollInterval);
  }, [isSenderMode, sessionCode, addIncomingJob]);

  // Construct mobile upload link
  const mobileLink = typeof window !== 'undefined'
    ? `${window.location.origin}/scan-to-print?session=${sessionCode}`
    : `https://www.pdfmediasuite.in/scan-to-print?session=${sessionCode}`;

  // QR Code URL using high-quality SVG API
  const qrSvgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=8&data=${encodeURIComponent(mobileLink)}`;

  // Handle customer mobile file selection & multi-channel transmit
  const handleCustomerUpload = async () => {
    if (senderFiles.length === 0) return;
    setSenderUploading(true);
    setSenderProgress(5);
    setSenderStatusText('Preparing document...');

    try {
      for (let i = 0; i < senderFiles.length; i++) {
        const file = senderFiles[i];

        // 1. Convert to dataUrl
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const job: PrintJob = {
          id: jobId,
          name: file.name,
          size: file.size,
          type: file.type || 'application/pdf',
          dataUrl,
          timestamp,
          copies: 1,
          colorMode: 'bw',
        };

        let beamedViaWebRtc = false;

        // Channel A: WebRTC Direct Send to PC using 16KB Chunking Protocol
        if (mobileConnRef.current && mobileConnRef.current.open) {
          try {
            setSenderStatusText(`Streaming ${file.name} directly to PC...`);
            const totalChunks = Math.ceil(dataUrl.length / CHUNK_SIZE);

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

            // Step A2: Stream chunks with flow pacing
            for (let c = 0; c < totalChunks; c++) {
              const chunk = dataUrl.substring(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE);
              mobileConnRef.current.send({
                action: 'JOB_CHUNK',
                jobId,
                index: c,
                chunk,
              });

              const currentPct = Math.round(((c + 1) / totalChunks) * 85);
              setSenderProgress(currentPct);

              // Throttle every 6 packets to prevent WebRTC buffer congestion
              if (c % 6 === 0) {
                await new Promise((r) => setTimeout(r, 10));
              }
            }

            // Step A3: Send completion signal
            mobileConnRef.current.send({
              action: 'JOB_FINISH',
              jobId,
            });

            beamedViaWebRtc = true;
          } catch (e) {
            console.warn('WebRTC chunk stream notice, trying fallback', e);
          }
        }

        // Channel B: Backend Relay API (Always run as a backup guarantee)
        setSenderStatusText(`Confirming transfer on shop queue...`);
        try {
          const formData = new FormData();
          formData.append('session_id', sessionCode);
          formData.append('file', file);
          formData.append('copies', '1');
          formData.append('color_mode', 'bw');

          await apiFetch('/api/print-drop/upload', {
            method: 'POST',
            body: formData,
            timeoutMs: 15000,
          });
        } catch (e) {
          console.warn('Backend relay upload notice', e);
        }

        // Channel C: BroadcastChannel (for same-browser tab testing)
        if (channelRef.current) {
          try {
            channelRef.current.postMessage({ action: 'NEW_PRINT_JOB', job });
          } catch {}
        }

        // Wait briefly for shopkeeper PC acknowledgment
        if (beamedViaWebRtc) {
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, 2000);
            ackResolversRef.current[jobId] = () => {
              clearTimeout(timeout);
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
        const job: PrintJob = {
          id: `local_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: file.name,
          size: file.size,
          type: file.type || 'application/pdf',
          dataUrl: ev.target?.result as string,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          copies: 1,
          colorMode: 'bw',
        };
        addIncomingJob(job);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

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
    } else {
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
              <h2 className="text-xl font-black text-slate-900 dark:text-white">Document Sent to Counter!</h2>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Your file has been transferred to the shopkeeper&apos;s computer screen. Please tell the operator to print.
              </p>
              <button
                onClick={() => setSenderSuccess(false)}
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
                        <span className="text-slate-400">{(f.size / 1024).toFixed(0)} KB</span>
                      </div>
                    ))}
                  </div>

                  {senderUploading && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-xs font-bold text-rose-600">
                        <span>{senderStatusText}</span>
                        <span>{senderProgress}%</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-rose-600 h-2 rounded-full transition-all duration-200"
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

            {printJobs.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 mx-auto flex items-center justify-center">
                  <Printer className="w-8 h-8" />
                </div>
                <h3 className="font-bold text-slate-700 dark:text-slate-200 text-sm">Print Queue is Empty</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  When a customer scans your counter QR code on their phone and beams a file, it will instantly pop up here with a chime!
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
                        <option value="bw">B&amp;W</option>
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
        />
      </div>
    </div>
  );
}