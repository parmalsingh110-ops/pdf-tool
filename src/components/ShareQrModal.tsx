import React, { useRef, useEffect } from 'react';
import { X, QrCode, Smartphone, Share2, Check, Copy } from 'lucide-react';
import QRCode from 'qrcode';

interface ShareQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  fileBlobUrl?: string | null;
  fileName?: string;
}

export default function ShareQrModal({
  isOpen,
  onClose,
  title,
  fileBlobUrl,
  fileName = 'document.pdf',
}: ShareQrModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = React.useState(false);

  // Current page URL or website URL to share
  const currentUrl = typeof window !== 'undefined' ? window.location.href : 'https://www.pdfmediasuite.in';

  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    const canvas = canvasRef.current;

    // Render a 100% genuine, standard scannable QR code
    QRCode.toCanvas(
      canvas,
      currentUrl,
      {
        width: 200,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      },
      (err) => {
        if (err) console.error('Failed to render QR Code:', err);
      }
    );
  }, [isOpen, currentUrl]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(
      `Open and use ${title} on PDF Media Suite (Free, fast & private): ${currentUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  const handleNativeShare = async () => {
    if (fileBlobUrl && navigator.canShare) {
      try {
        const resp = await fetch(fileBlobUrl);
        const blob = await resp.blob();
        const shareFile = new File([blob], fileName, { type: blob.type || 'application/pdf' });
        if (navigator.canShare({ files: [shareFile] })) {
          await navigator.share({
            title,
            text: `Processed ${fileName} on PDF Media Suite`,
            files: [shareFile],
          });
          return;
        }
      } catch (e) {
        console.warn('Native file share failed:', e);
      }
    }
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: `Use ${title} on PDF Media Suite:`,
          url: currentUrl,
        });
        return;
      } catch {}
    }
    handleWhatsAppShare();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-center relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3">
          <Smartphone className="w-6 h-6" />
        </div>

        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
          Send to Mobile Phone
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Scan QR with any phone camera or transfer instantly via WhatsApp without cables.
        </p>

        {/* QR Canvas */}
        <div className="p-3 bg-white rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 inline-block shadow-inner mb-4">
          <canvas ref={canvasRef} className="w-44 h-44 rounded-lg block" />
        </div>

        <div className="text-[11px] font-semibold text-slate-400 mb-4 uppercase tracking-wider">
          {fileName}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={handleNativeShare}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition"
          >
            <Share2 className="w-3.5 h-3.5" />
            {fileBlobUrl && typeof navigator !== 'undefined' && 'canShare' in navigator ? 'Share File' : 'WhatsApp'}
          </button>
          <button
            onClick={handleCopyLink}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      </div>
    </div>
  );
}

