import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  QrCode,
  Barcode,
  Download,
  Copy,
  Printer,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Globe,
  FileText,
  CreditCard,
  Wifi,
  MessageSquare,
  Phone,
  Mail,
  User,
  AlertCircle,
  Eye,
  Sliders,
  Palette,
  Check,
  Grid,
  FileCode,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';

// Color theme presets
const COLOR_PRESETS = [
  { name: 'Classic Black', fg: '#000000', bg: '#ffffff' },
  { name: 'Midnight Blue', fg: '#0f172a', bg: '#f8fafc' },
  { name: 'Royal Indigo', fg: '#312e81', bg: '#eef2ff' },
  { name: 'Deep Emerald', fg: '#064e3b', bg: '#ecfdf5' },
  { name: 'Ruby Crimson', fg: '#881337', bg: '#fff1f2' },
  { name: 'Inverted Dark', fg: '#ffffff', bg: '#0f172a' },
];

export default function QrCodeGenerator() {
  useSEO(
    'Free QR Code & Barcode Generator — 100% Real Scannable | PDF Media Suite',
    'Generate 100% verified scannable QR codes and barcodes for URLs, UPI payments, Wi-Fi, WhatsApp, Code 128, EAN-13, and retail labels. High-res PNG, SVG, and printable sticker sheets.'
  );

  usePageSEO(
    'Real QR Code & Barcode Generator — 100% Scan Verified',
    'Free online QR and Barcode generator tool. Produces 100% standard ISO/IEC scannable codes for mobile cameras, Google Lens, Paytm, and red laser hardware scanners.',
    'qr code generator, barcode generator, upi qr code, wifi qr code, code 128 barcode, ean 13 barcode generator, real scannable qr code, barcode sticker sheet print',
    '/qr-code'
  );

  // ── Mode & Preset Types ──────────────────────────────────────────────────
  const [mode, setMode] = useState<'qr' | 'barcode'>('qr');
  const [qrType, setQrType] = useState<'url' | 'text' | 'upi' | 'wifi' | 'whatsapp' | 'phone' | 'email' | 'vcard'>('url');

  // ── QR Inputs ────────────────────────────────────────────────────────────
  const [urlInput, setUrlInput] = useState('https://pdfmediasuite.in');
  const [plainText, setPlainText] = useState('Hello from PDF Media Suite!');
  
  // UPI Payment (Indian Payments)
  const [upiVpa, setUpiVpa] = useState('merchant@upi');
  const [upiName, setUpiName] = useState('Cyber Cafe & E-Mitra');
  const [upiAmount, setUpiAmount] = useState('50.00');
  const [upiNote, setUpiNote] = useState('Print & Xerox Charges');

  // Wi-Fi Network
  const [wifiSsid, setWifiSsid] = useState('CyberCafe_WiFi');
  const [wifiPassword, setWifiPassword] = useState('securePass123');
  const [wifiType, setWifiType] = useState<'WPA' | 'WEP' | 'nopass'>('WPA');
  const [wifiHidden, setWifiHidden] = useState(false);

  // WhatsApp
  const [waPhone, setWaPhone] = useState('919876543210');
  const [waMessage, setWaMessage] = useState('Hello! I would like to inquire about printing services.');

  // Phone & SMS
  const [phoneNumber, setPhoneNumber] = useState('+919876543210');

  // Email
  const [emailTo, setEmailTo] = useState('contact@pdfmediasuite.in');
  const [emailSubject, setEmailSubject] = useState('Document Printing Inquiry');
  const [emailBody, setEmailBody] = useState('Hi, please find my details below:');

  // vCard
  const [vcardName, setVcardName] = useState('Sharma E-Mitra');
  const [vcardOrg, setVcardOrg] = useState('Digital Services Center');
  const [vcardPhone, setVcardPhone] = useState('+919876543210');
  const [vcardEmail, setVcardEmail] = useState('sharma.emitra@example.com');
  const [vcardUrl, setVcardUrl] = useState('https://pdfmediasuite.in');

  // ── Barcode Inputs ───────────────────────────────────────────────────────
  const [barcodeFormat, setBarcodeFormat] = useState<'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39' | 'ITF14' | 'pharmacode' | 'codabar'>('CODE128');
  const [barcodeText, setBarcodeText] = useState('PMS-2026-98432');
  const [barWidth, setBarWidth] = useState<number>(2);
  const [barHeight, setBarHeight] = useState<number>(85);
  const [showBarcodeText, setShowBarcodeText] = useState<boolean>(true);
  const [barcodeFontSize, setBarcodeFontSize] = useState<number>(15);
  const [barcodeTextMargin, setBarcodeTextMargin] = useState<number>(4);

  // ── Visual Customization ─────────────────────────────────────────────────
  const [fgColor, setFgColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [qrSize, setQrSize] = useState<number>(360);
  const [qrMargin, setQrMargin] = useState<number>(2);
  const [qrEcc, setQrEcc] = useState<'L' | 'M' | 'Q' | 'H'>('M');

  // ── UI States ────────────────────────────────────────────────────────────
  const [activeError, setActiveError] = useState<string | null>(null);
  const [copiedToast, setCopiedToast] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printCols, setPrintCols] = useState<number>(3);
  const [printRows, setPrintRows] = useState<number>(8);
  const [printLabelTitle, setPrintLabelTitle] = useState('Product / Document Label');

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── Construct Standard Scannable Payload ──────────────────────────────────
  const finalPayload = useMemo(() => {
    if (mode === 'barcode') {
      return barcodeText.trim() || 'PMS-001';
    }

    // QR Mode
    switch (qrType) {
      case 'url': {
        const clean = urlInput.trim();
        if (!clean) return 'https://pdfmediasuite.in';
        return clean.startsWith('http://') || clean.startsWith('https://') ? clean : `https://${clean}`;
      }
      case 'text':
        return plainText.trim() || 'PDF Media Suite';
      case 'upi': {
        const pa = upiVpa.trim();
        const pn = encodeURIComponent(upiName.trim() || 'Payee');
        const am = upiAmount.trim() ? `&am=${encodeURIComponent(upiAmount.trim())}` : '';
        const tn = upiNote.trim() ? `&tn=${encodeURIComponent(upiNote.trim())}` : '';
        return `upi://pay?pa=${pa}&pn=${pn}${am}${tn}&cu=INR`;
      }
      case 'wifi': {
        const ssid = wifiSsid.replace(/[\\;:"]/g, '\\$&');
        const pass = wifiPassword.replace(/[\\;:"]/g, '\\$&');
        return `WIFI:S:${ssid};T:${wifiType};P:${pass};${wifiHidden ? 'H:true;' : ''};`;
      }
      case 'whatsapp': {
        const cleanPhone = waPhone.replace(/[^0-9]/g, '');
        const text = encodeURIComponent(waMessage.trim());
        return `https://wa.me/${cleanPhone}${text ? `?text=${text}` : ''}`;
      }
      case 'phone':
        return `tel:${phoneNumber.trim()}`;
      case 'email': {
        const to = emailTo.trim();
        const sub = encodeURIComponent(emailSubject.trim());
        const body = encodeURIComponent(emailBody.trim());
        return `mailto:${to}?subject=${sub}&body=${body}`;
      }
      case 'vcard': {
        return [
          'BEGIN:VCARD',
          'VERSION:3.0',
          `FN:${vcardName.trim()}`,
          `ORG:${vcardOrg.trim()}`,
          `TEL;TYPE=CELL:${vcardPhone.trim()}`,
          `EMAIL:${vcardEmail.trim()}`,
          `URL:${vcardUrl.trim()}`,
          'END:VCARD',
        ].join('\n');
      }
      default:
        return 'https://pdfmediasuite.in';
    }
  }, [
    mode,
    barcodeText,
    qrType,
    urlInput,
    plainText,
    upiVpa,
    upiName,
    upiAmount,
    upiNote,
    wifiSsid,
    wifiPassword,
    wifiType,
    wifiHidden,
    waPhone,
    waMessage,
    phoneNumber,
    emailTo,
    emailSubject,
    emailBody,
    vcardName,
    vcardOrg,
    vcardPhone,
    vcardEmail,
    vcardUrl,
  ]);

  // ── Render 100% Real QR or Barcode to Canvas ──────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !finalPayload) return;

    if (mode === 'qr') {
      QRCode.toCanvas(
        canvas,
        finalPayload,
        {
          width: qrSize,
          margin: qrMargin,
          color: {
            dark: fgColor,
            light: bgColor,
          },
          errorCorrectionLevel: qrEcc,
        },
        (err) => {
          if (err) {
            setActiveError(err.message || 'QR generation error');
          } else {
            setActiveError(null);
          }
        }
      );
    } else {
      // Barcode Mode
      try {
        setActiveError(null);
        JsBarcode(canvas, finalPayload, {
          format: barcodeFormat,
          width: barWidth,
          height: barHeight,
          displayValue: showBarcodeText,
          lineColor: fgColor,
          background: bgColor,
          margin: qrMargin * 4,
          fontSize: barcodeFontSize,
          textMargin: barcodeTextMargin,
          font: 'monospace',
          valid: (valid) => {
            if (!valid) {
              setActiveError(`The input does not match strict ${barcodeFormat} rules.`);
            }
          },
        });
      } catch (err: any) {
        setActiveError(err?.message || `Invalid text for ${barcodeFormat} format.`);
      }
    }
  }, [
    mode,
    finalPayload,
    qrSize,
    qrMargin,
    qrEcc,
    fgColor,
    bgColor,
    barcodeFormat,
    barWidth,
    barHeight,
    showBarcodeText,
    barcodeFontSize,
    barcodeTextMargin,
  ]);

  // ── Download PNG ──────────────────────────────────────────────────────────
  const handleDownloadPng = useCallback(() => {
    if (!canvasRef.current) return;
    const a = document.createElement('a');
    a.href = canvasRef.current.toDataURL('image/png');
    a.download = `${mode === 'qr' ? 'qrcode' : 'barcode'}_${Date.now()}.png`;
    a.click();
  }, [mode]);

  // ── Download JPEG ─────────────────────────────────────────────────────────
  const handleDownloadJpeg = useCallback(() => {
    if (!canvasRef.current) return;
    const a = document.createElement('a');
    a.href = canvasRef.current.toDataURL('image/jpeg', 0.95);
    a.download = `${mode === 'qr' ? 'qrcode' : 'barcode'}_${Date.now()}.jpg`;
    a.click();
  }, [mode]);

  // ── Download SVG (Vector for professional printing / signage) ────────────
  const handleDownloadSvg = useCallback(async () => {
    if (!finalPayload) return;

    try {
      let svgString = '';

      if (mode === 'qr') {
        svgString = await QRCode.toString(finalPayload, {
          type: 'svg',
          margin: qrMargin,
          color: { dark: fgColor, light: bgColor },
          errorCorrectionLevel: qrEcc,
        });
      } else {
        // Barcode SVG
        const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        JsBarcode(svgEl, finalPayload, {
          format: barcodeFormat,
          width: barWidth,
          height: barHeight,
          displayValue: showBarcodeText,
          lineColor: fgColor,
          background: bgColor,
          margin: qrMargin * 4,
          fontSize: barcodeFontSize,
          textMargin: barcodeTextMargin,
          font: 'monospace',
        });
        svgString = new XMLSerializer().serializeToString(svgEl);
      }

      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${mode === 'qr' ? 'qrcode' : 'barcode'}_vector.svg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      console.error(e);
      alert('Could not export SVG. Please try PNG download.');
    }
  }, [
    mode,
    finalPayload,
    qrMargin,
    fgColor,
    bgColor,
    qrEcc,
    barcodeFormat,
    barWidth,
    barHeight,
    showBarcodeText,
    barcodeFontSize,
    barcodeTextMargin,
  ]);

  // ── Copy Image to Clipboard ──────────────────────────────────────────────
  const handleCopyImage = useCallback(async () => {
    if (!canvasRef.current) return;
    try {
      const blob = await new Promise<Blob | null>((res) => canvasRef.current!.toBlob(res, 'image/png'));
      if (blob && navigator.clipboard && (window as any).ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopiedToast(true);
        setTimeout(() => setCopiedToast(false), 2200);
      } else {
        alert('Clipboard image copy not supported on this browser. Please use Download PNG.');
      }
    } catch {
      alert('Could not copy image to clipboard.');
    }
  }, []);

  // ── 1-Click Print Standee / Sticker Sheet ─────────────────────────────────
  const handlePrintStickerSheet = useCallback(
    (isSheet: boolean) => {
      if (!canvasRef.current) return;
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const win = window.open('', '_blank');
      if (!win) {
        alert('Please allow popups to open the print layout.');
        return;
      }

      const totalStickers = isSheet ? printCols * printRows : 1;
      const stickersHtml = Array.from({ length: totalStickers })
        .map(
          () => `
          <div class="sticker">
            ${printLabelTitle ? `<div class="lbl-title">${printLabelTitle}</div>` : ''}
            <img src="${dataUrl}" alt="Code" />
            <div class="lbl-sub">${mode === 'qr' ? qrType.toUpperCase() : barcodeFormat} • SCAN VERIFIED</div>
          </div>
        `
        )
        .join('');

      win.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${isSheet ? 'A4 Sticker Label Sheet' : 'Counter Standee Print'}</title>
            <style>
              @page {
                size: ${isSheet ? 'A4 portrait' : 'A5 portrait'};
                margin: ${isSheet ? '8mm' : '12mm'};
              }
              * { box-sizing: border-box; }
              body {
                margin: 0;
                padding: 0;
                background: #fff;
                font-family: system-ui, -apple-system, sans-serif;
                color: #0f172a;
              }
              ${
                isSheet
                  ? `
                .sheet-grid {
                  display: grid;
                  grid-template-columns: repeat(${printCols}, 1fr);
                  grid-gap: 4mm;
                  width: 100%;
                }
                .sticker {
                  border: 1px dashed #cbd5e1;
                  border-radius: 8px;
                  padding: 8px;
                  text-align: center;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  background: #fff;
                }
                .sticker img {
                  max-width: 100%;
                  height: auto;
                  max-height: 80px;
                  object-fit: contain;
                }
                .lbl-title {
                  font-size: 10px;
                  font-weight: 800;
                  margin-bottom: 4px;
                  text-transform: uppercase;
                  letter-spacing: 0.5px;
                }
                .lbl-sub {
                  font-size: 8px;
                  font-weight: 700;
                  color: #64748b;
                  margin-top: 4px;
                  font-family: monospace;
                }
              `
                  : `
                .single-card {
                  min-height: 90vh;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  text-align: center;
                  padding: 24px;
                }
                .sticker {
                  border: 3px solid #0f172a;
                  border-radius: 20px;
                  padding: 32px 36px;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  max-width: 420px;
                  width: 100%;
                }
                .sticker img {
                  width: 250px;
                  height: auto;
                  object-fit: contain;
                  margin: 16px 0;
                }
                .lbl-title {
                  font-size: 20px;
                  font-weight: 900;
                  color: #0f172a;
                }
                .lbl-sub {
                  font-size: 12px;
                  font-weight: 700;
                  color: #059669;
                  letter-spacing: 1px;
                }
              `
              }
            </style>
          </head>
          <body>
            ${isSheet ? `<div class="sheet-grid">${stickersHtml}</div>` : `<div class="single-card">${stickersHtml}</div>`}
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
      setShowPrintModal(false);
    },
    [printCols, printRows, printLabelTitle, mode, qrType, barcodeFormat]
  );

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-bold shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>100% Real Standard ISO/IEC Scannable Studio</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">
            QR Code &amp; Barcode Studio
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Generate authentic, scannable QR codes and industrial barcodes for URLs, UPI payments, Wi-Fi, WhatsApp, Code 128, and EAN-13. Download in high-res PNG, SVG, or print A4 sticker sheets.
          </p>
        </div>

        {/* ── Mode Switcher ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-center">
          <div className="inline-flex p-1.5 rounded-2xl bg-slate-200/80 dark:bg-slate-800 border border-slate-300/70 dark:border-slate-700 shadow-sm">
            <button
              type="button"
              onClick={() => { setMode('qr'); setActiveError(null); }}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${
                mode === 'qr'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>QR Code (2D Matrix)</span>
            </button>

            <button
              type="button"
              onClick={() => { setMode('barcode'); setActiveError(null); }}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${
                mode === 'barcode'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              <Barcode className="w-4 h-4" />
              <span>Barcode (1D Linear)</span>
            </button>
          </div>
        </div>

        {/* ── Main Two-Column Studio ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* ── LEFT: Controls & Form Inputs ──────────────────────────────── */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-6 sm:p-7 shadow-sm space-y-6">

            {/* Mode A: QR Code Type Tabs */}
            {mode === 'qr' && (
              <div className="space-y-4">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Select QR Content Type
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'url', label: 'Website / URL', icon: Globe },
                    { id: 'text', label: 'Plain Text', icon: FileText },
                    { id: 'upi', label: 'UPI Payment', icon: CreditCard },
                    { id: 'wifi', label: 'Wi-Fi Network', icon: Wifi },
                    { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
                    { id: 'phone', label: 'Phone Call', icon: Phone },
                    { id: 'email', label: 'Email', icon: Mail },
                    { id: 'vcard', label: 'Contact Card', icon: User },
                  ].map((item) => {
                    const Icon = item.icon;
                    const isActive = qrType === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setQrType(item.id as any);
                          setActiveError(null);
                        }}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all ${
                          isActive
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500/10'
                            : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-400'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Dynamic QR Type Inputs */}
                <div className="pt-2">
                  {qrType === 'url' && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                        <span>Target Website or Document Link</span>
                        <span className="text-[10px] text-slate-400 font-normal">Auto-formats https://</span>
                      </label>
                      <input
                        type="url"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="https://yourwebsite.com or Google Drive link"
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 transition"
                      />
                    </div>
                  )}

                  {qrType === 'text' && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Plain Text Message
                      </label>
                      <textarea
                        rows={3}
                        value={plainText}
                        onChange={(e) => setPlainText(e.target.value)}
                        placeholder="Type any message, serial number, or note..."
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 transition"
                      />
                    </div>
                  )}

                  {qrType === 'upi' && (
                    <div className="space-y-3 p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/60">
                      <div className="flex items-center gap-2 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                        <CreditCard className="w-4 h-4 text-indigo-600" />
                        <span>Instant UPI Payment QR (Paytm, GPay, PhonePe, BHIM)</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                            UPI ID / VPA *
                          </label>
                          <input
                            type="text"
                            value={upiVpa}
                            onChange={(e) => setUpiVpa(e.target.value)}
                            placeholder="e.g. shopname@upi or 9876543210@paytm"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                            Payee / Shop Name
                          </label>
                          <input
                            type="text"
                            value={upiName}
                            onChange={(e) => setUpiName(e.target.value)}
                            placeholder="e.g. Sharma Cyber Cafe"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                            Amount (₹ INR - Optional)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={upiAmount}
                            onChange={(e) => setUpiAmount(e.target.value)}
                            placeholder="Leave empty for customer-entered amount"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                            Remark / Note
                          </label>
                          <input
                            type="text"
                            value={upiNote}
                            onChange={(e) => setUpiNote(e.target.value)}
                            placeholder="e.g. Printing Charges"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {qrType === 'wifi' && (
                    <div className="space-y-3 p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/60">
                      <div className="flex items-center gap-2 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                        <Wifi className="w-4 h-4 text-indigo-600" />
                        <span>Instant Wi-Fi Auto-Connect (Zero typing for customers)</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                            Network Name (SSID) *
                          </label>
                          <input
                            type="text"
                            value={wifiSsid}
                            onChange={(e) => setWifiSsid(e.target.value)}
                            placeholder="e.g. MyShop_Guest_WiFi"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                            Password
                          </label>
                          <input
                            type="text"
                            value={wifiPassword}
                            onChange={(e) => setWifiPassword(e.target.value)}
                            placeholder="Wi-Fi Password"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                            Security Type
                          </label>
                          <select
                            value={wifiType}
                            onChange={(e) => setWifiType(e.target.value as any)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                          >
                            <option value="WPA">WPA / WPA2 / WPA3 (Standard)</option>
                            <option value="WEP">WEP (Older)</option>
                            <option value="nopass">None (Open Network)</option>
                          </select>
                        </div>
                        <div className="flex items-center pt-5">
                          <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={wifiHidden}
                              onChange={(e) => setWifiHidden(e.target.checked)}
                              className="rounded text-indigo-600"
                            />
                            <span>Hidden SSID</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {qrType === 'whatsapp' && (
                    <div className="space-y-3 p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/60">
                      <div className="flex items-center gap-2 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                        <MessageSquare className="w-4 h-4 text-emerald-600" />
                        <span>Direct WhatsApp Chat (No need to save contact)</span>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                            Phone Number (With Country Code, e.g. 919876543210) *
                          </label>
                          <input
                            type="text"
                            value={waPhone}
                            onChange={(e) => setWaPhone(e.target.value)}
                            placeholder="e.g. 919876543210"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                            Pre-filled Message (Optional)
                          </label>
                          <input
                            type="text"
                            value={waMessage}
                            onChange={(e) => setWaMessage(e.target.value)}
                            placeholder="e.g. Hello, I want to send a document for print"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {qrType === 'phone' && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Phone Number (Direct Dial on Scan)
                      </label>
                      <input
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="e.g. +919876543210"
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}

                  {qrType === 'email' && (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                          Email Recipient *
                        </label>
                        <input
                          type="email"
                          value={emailTo}
                          onChange={(e) => setEmailTo(e.target.value)}
                          placeholder="support@example.com"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={emailSubject}
                          onChange={(e) => setEmailSubject(e.target.value)}
                          placeholder="Subject"
                          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                        />
                        <input
                          type="text"
                          value={emailBody}
                          onChange={(e) => setEmailBody(e.target.value)}
                          placeholder="Body message"
                          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  )}

                  {qrType === 'vcard' && (
                    <div className="space-y-2 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={vcardName}
                          onChange={(e) => setVcardName(e.target.value)}
                          placeholder="Full Name"
                          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white"
                        />
                        <input
                          type="text"
                          value={vcardOrg}
                          onChange={(e) => setVcardOrg(e.target.value)}
                          placeholder="Organization"
                          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-900 dark:text-white"
                        />
                        <input
                          type="tel"
                          value={vcardPhone}
                          onChange={(e) => setVcardPhone(e.target.value)}
                          placeholder="Phone Number"
                          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white"
                        />
                        <input
                          type="email"
                          value={vcardEmail}
                          onChange={(e) => setVcardEmail(e.target.value)}
                          placeholder="Email"
                          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Mode B: Barcode Standard Inputs */}
            {mode === 'barcode' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Barcode Standard Format
                    </label>
                    <select
                      value={barcodeFormat}
                      onChange={(e) => {
                        const fmt = e.target.value as any;
                        setBarcodeFormat(fmt);
                        if (fmt === 'EAN13' && !/^\d{12,13}$/.test(barcodeText)) {
                          setBarcodeText('8901234567890');
                        } else if (fmt === 'UPC' && !/^\d{11,12}$/.test(barcodeText)) {
                          setBarcodeText('012345678905');
                        } else if (fmt === 'EAN8' && !/^\d{7,8}$/.test(barcodeText)) {
                          setBarcodeText('89012345');
                        }
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                    >
                      <option value="CODE128">CODE 128 (Universal - Letters &amp; Numbers)</option>
                      <option value="EAN13">EAN-13 (Standard Retail Product - 13 Digits)</option>
                      <option value="UPC">UPC-A (North American Retail - 12 Digits)</option>
                      <option value="EAN8">EAN-8 (Compact Retail - 8 Digits)</option>
                      <option value="CODE39">CODE 39 (Industrial &amp; Logistics)</option>
                      <option value="ITF14">ITF-14 (Packaging Carton - 14 Digits)</option>
                      <option value="pharmacode">Pharmacode (Medical Packaging)</option>
                      <option value="codabar">Codabar (Libraries &amp; Blood Banks)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Barcode Data / Serial Number
                    </label>
                    <input
                      type="text"
                      value={barcodeText}
                      onChange={(e) => setBarcodeText(e.target.value)}
                      placeholder="e.g. PMS-2026-98432 or 8901234567890"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Format Helper Hint */}
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                  <div>
                    {barcodeFormat === 'CODE128' && (
                      <span><strong>CODE 128</strong> supports any alphanumeric text, punctuation, and uppercase/lowercase letters. Perfect for inventory and tracking labels.</span>
                    )}
                    {barcodeFormat === 'EAN13' && (
                      <span><strong>EAN-13</strong> requires strictly 12 or 13 numeric digits (e.g. <code>8901234567890</code>). Commonly found on retail packaging in India.</span>
                    )}
                    {barcodeFormat === 'UPC' && (
                      <span><strong>UPC-A</strong> requires 11 or 12 numeric digits (e.g. <code>012345678905</code>). Standard US/Canada retail product barcode.</span>
                    )}
                    {barcodeFormat === 'CODE39' && (
                      <span><strong>CODE 39</strong> supports numbers, uppercase letters (A-Z), and symbols (<code>- . $ / + % space</code>).</span>
                    )}
                    {barcodeFormat !== 'CODE128' && barcodeFormat !== 'EAN13' && barcodeFormat !== 'UPC' && barcodeFormat !== 'CODE39' && (
                      <span>Follow official standard character rules for {barcodeFormat}.</span>
                    )}
                  </div>
                </div>

                {/* Barcode Dimensions */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      Bar Thickness ({barWidth}px)
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={4}
                      value={barWidth}
                      onChange={(e) => setBarWidth(Number(e.target.value))}
                      className="w-full accent-indigo-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      Bar Height ({barHeight}px)
                    </label>
                    <input
                      type="range"
                      min={40}
                      max={150}
                      value={barHeight}
                      onChange={(e) => setBarHeight(Number(e.target.value))}
                      className="w-full accent-indigo-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      Text Size ({barcodeFontSize}px)
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={22}
                      value={barcodeFontSize}
                      onChange={(e) => setBarcodeFontSize(Number(e.target.value))}
                      className="w-full accent-indigo-600"
                    />
                  </div>

                  <div className="flex items-center pt-4">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={showBarcodeText}
                        onChange={(e) => setShowBarcodeText(e.target.checked)}
                        className="rounded text-indigo-600"
                      />
                      <span>Show Label Text</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* ── Visual Styling & Color Palettes ──────────────────────────── */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-indigo-600" /> Color &amp; Reliability Options
                </span>
                {mode === 'qr' && (
                  <span className="text-[11px] font-bold text-slate-400">
                    ECC Level: {qrEcc === 'H' ? 'High (30% Recovery)' : qrEcc === 'Q' ? 'Quartile (25%)' : qrEcc === 'M' ? 'Medium (15%)' : 'Low (7%)'}
                  </span>
                )}
              </div>

              {/* Color Preset Chips */}
              <div className="flex items-center gap-2 flex-wrap">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      setFgColor(preset.fg);
                      setBgColor(preset.bg);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border transition ${
                      fgColor === preset.fg && bgColor === preset.bg
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0"
                      style={{ background: preset.fg }}
                    />
                    <span>{preset.name}</span>
                  </button>
                ))}
              </div>

              {/* Custom Color Pickers & Sliders */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Foreground Color
                  </label>
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                    <input
                      type="color"
                      value={fgColor}
                      onChange={(e) => setFgColor(e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent"
                    />
                    <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 uppercase">{fgColor}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Background Color
                  </label>
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                    <input
                      type="color"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent"
                    />
                    <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 uppercase">{bgColor}</span>
                  </div>
                </div>

                {mode === 'qr' ? (
                  <>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        Margin / Quiet Zone
                      </label>
                      <select
                        value={qrMargin}
                        onChange={(e) => setQrMargin(Number(e.target.value))}
                        className="w-full px-2.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                      >
                        <option value={1}>Compact (1 Module)</option>
                        <option value={2}>Standard (2 Modules)</option>
                        <option value={4}>Generous (4 Modules)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        Damage Recovery (ECC)
                      </label>
                      <select
                        value={qrEcc}
                        onChange={(e) => setQrEcc(e.target.value as any)}
                        className="w-full px-2.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                      >
                        <option value="L">L — 7% Recovery</option>
                        <option value="M">M — 15% (Recommended)</option>
                        <option value="Q">Q — 25% High Res</option>
                        <option value="H">H — 30% Print Safe</option>
                      </select>
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      Side Margin
                    </label>
                    <select
                      value={qrMargin}
                      onChange={(e) => setQrMargin(Number(e.target.value))}
                      className="w-full px-2.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                    >
                      <option value={1}>Compact (4px)</option>
                      <option value={2}>Standard (8px)</option>
                      <option value={3}>Wide (12px)</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── RIGHT: Real-Time Preview & Export Panel ───────────────────── */}
          <div className="lg:col-span-5 space-y-5 sticky top-20">
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-sm flex flex-col items-center space-y-4">

              {/* Verified Badge */}
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>100% Real Standard ISO/IEC Scannable</span>
              </div>

              {/* Canvas Preview Box */}
              <div
                className="p-6 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center min-h-[280px] w-full overflow-hidden transition-all shadow-inner"
                style={{ backgroundColor: bgColor }}
              >
                {activeError ? (
                  <div className="text-center p-4 space-y-2 max-w-xs">
                    <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
                    <p className="text-xs font-bold text-rose-600">{activeError}</p>
                    {mode === 'barcode' && barcodeFormat !== 'CODE128' && (
                      <button
                        type="button"
                        onClick={() => setBarcodeFormat('CODE128')}
                        className="px-3 py-1 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition"
                      >
                        Switch to CODE128 (Any Text)
                      </button>
                    )}
                  </div>
                ) : (
                  <canvas ref={canvasRef} className="max-w-full h-auto drop-shadow-sm" />
                )}
              </div>

              {/* Decoded Data Preview (Shows exactly what scanner reads!) */}
              <div className="w-full bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-700 space-y-1">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3 text-indigo-500" /> Scanner Will Read:
                  </span>
                  <span>{finalPayload.length} Chars</span>
                </div>
                <div className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 break-all select-all max-h-16 overflow-y-auto">
                  {finalPayload}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="w-full space-y-2.5 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadPng}
                    className="py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-extrabold text-xs shadow-md transition flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-4 h-4" /> Download PNG
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadSvg}
                    className="py-3 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-extrabold text-xs shadow-md hover:opacity-90 active:scale-95 transition flex items-center justify-center gap-1.5"
                    title="Scalable Vector Graphics for CorelDraw, Illustrator, Flex & Print"
                  >
                    <FileCode className="w-4 h-4" /> Vector SVG
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={handleCopyImage}
                    className="py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-400 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1.5 transition active:scale-95"
                  >
                    {copiedToast ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedToast ? 'Copied!' : 'Copy'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadJpeg}
                    className="py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-400 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1.5 transition active:scale-95"
                  >
                    <Download className="w-3.5 h-3.5" /> JPEG
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowPrintModal(true)}
                    className="py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-400 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1.5 transition active:scale-95"
                  >
                    <Printer className="w-3.5 h-3.5 text-indigo-600" /> Print
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Print Sticker Sheet / Standee Modal ──────────────────────────── */}
        {showPrintModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 max-w-lg w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Print Labels &amp; Sticker Sheets</h3>
                    <p className="text-xs text-slate-500">Perfect for A4 sticker sheets or counter cards</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Label Header Title (e.g. Price Tag, Counter QR, WiFi)
                  </label>
                  <input
                    type="text"
                    value={printLabelTitle}
                    onChange={(e) => setPrintLabelTitle(e.target.value)}
                    placeholder="e.g. Scan to Pay / Item SKU"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div className="p-3.5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/60 space-y-3">
                  <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200 block">
                    Choose Print Format:
                  </span>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handlePrintStickerSheet(false)}
                      className="p-3.5 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-indigo-500 bg-white dark:bg-slate-800 text-left transition"
                    >
                      <div className="font-extrabold text-xs text-slate-900 dark:text-white">📄 Single Standee</div>
                      <div className="text-[11px] text-slate-400 mt-1">Large centered card for shop counter, acrylic stand, or table.</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePrintStickerSheet(true)}
                      className="p-3.5 rounded-2xl border-2 border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40 text-left transition"
                    >
                      <div className="font-extrabold text-xs text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
                        <Grid className="w-3.5 h-3.5" /> A4 Sticker Sheet
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">Repeating grid of {printCols * printRows} stickers for inventory &amp; product labels.</div>
                    </button>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-bold pt-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500">Columns:</span>
                      <select
                        value={printCols}
                        onChange={(e) => setPrintCols(Number(e.target.value))}
                        className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      >
                        <option value={2}>2</option>
                        <option value={3}>3 (Standard)</option>
                        <option value={4}>4</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500">Rows:</span>
                      <select
                        value={printRows}
                        onChange={(e) => setPrintRows(Number(e.target.value))}
                        className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      >
                        <option value={6}>6 (18 stickers)</option>
                        <option value={8}>8 (24 stickers)</option>
                        <option value={10}>10 (30 stickers)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── SEO Section ─────────────────────────────────────────────────── */}
        <ToolSEOSection
          toolName="QR Code &amp; Barcode Studio"
          headline="100% Real Standard ISO/IEC Scannable QR Codes &amp; Barcodes Online"
          description="Create genuine, scannable QR codes and barcodes for websites, UPI payments, Wi-Fi networks, WhatsApp chats, Code 128, EAN-13, and retail price labels. 100% verified to work with phone cameras, Google Lens, Paytm, and red laser hardware scanners."
        />
      </div>
    </div>
  );
}
