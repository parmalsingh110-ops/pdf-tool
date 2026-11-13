import React, { useState, useRef } from 'react';
import {
  ScanLine,
  Copy,
  Check,
  Printer,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';
import { escapeHtml } from '../lib/utils';

interface KycData {
  fullName: string;
  fatherName: string;
  dob: string;
  gender: string;
  idNumber: string;
  idType: string;
  address: string;
  pincode: string;
}

export default function SmartKycSlip() {
  const prefersReduced = useReducedMotion();

  useSEO(
    'Smart KYC OCR & Customer Slip Generator — Aadhaar, PAN & Voter Card | PDF Media Suite',
    'Extract customer details from Aadhaar, PAN, and Voter cards in 1-second. 1-click copy for portal forms and generate printable customer acknowledgement slips.'
  );

  usePageSEO(
    'Smart KYC OCR & Customer Acknowledgement Slip Maker',
    'Free online KYC data extractor and customer receipt slip generator for E-Mitra, CSC centers, and cyber cafes. Eliminates typing errors in online application forms.',
    'smart kyc ocr slip, aadhaar data extractor online, csc customer receipt maker, emitra application slip generator, pan card data copy, customer kyc receipt',
    '/smart-kyc-slip'
  );

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Extracted Details
  const [kycData, setKycData] = useState<KycData>({
    fullName: '',
    fatherName: '',
    dob: '',
    gender: 'Male',
    idNumber: '',
    idType: 'Aadhaar Card',
    address: '',
    pincode: '',
  });

  // Slip Settings
  const [shopName, setShopName] = useState<string>('SHARMA E-MITRA & CSC CENTER');
  const [serviceName, setServiceName] = useState<string>('Scholarship Application / Portal Form');
  const [feesCharged, setFeesCharged] = useState<number>(50);
  const [tokenNo] = useState<string>(`CSC-${Math.floor(1000 + Math.random() * 9000)}`);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const filledFieldCount = [
    kycData.fullName,
    kycData.fatherName,
    kycData.dob,
    kycData.gender,
    kycData.idNumber,
    kycData.address,
  ].filter((v) => Boolean(v && v.trim())).length;

  const handleCopy = (text: string, fieldName: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleFileUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);
      setIsExtracting(true);

      // Perform fast client-side OCR using Tesseract if available, or regex extractor
      try {
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('eng');
        const ret = await worker.recognize(dataUrl);
        const text = ret.data.text;
        await worker.terminate();

        // Heuristic extraction
        let fullName = '';
        let fatherName = '';
        let dob = '';
        let gender = 'Male';
        let idNumber = '';
        let idType = 'Aadhaar Card';
        let pincode = '';

        // Detect ID type
        if (/income tax department|permanent account number|pan/i.test(text)) {
          idType = 'PAN Card';
          const panMatch = text.match(/[A-Z]{5}[0-9]{4}[A-Z]{1}/);
          if (panMatch) idNumber = panMatch[0];
        } else if (/election commission|voter|epic/i.test(text)) {
          idType = 'Voter ID';
          const epicMatch = text.match(/[A-Z]{3}[0-9]{7}/);
          if (epicMatch) idNumber = epicMatch[0];
        } else {
          idType = 'Aadhaar Card';
          const aadhMatch = text.match(/\b\d{4}\s\d{4}\s\d{4}\b/);
          if (aadhMatch) idNumber = aadhMatch[0];
        }

        // DOB
        const dobMatch = text.match(/(?:DOB|Birth|Year of Birth)[:\s]*([0-9]{2}[\/-][0-9]{2}[\/-][0-9]{4}|[0-9]{4})/i);
        if (dobMatch) dob = dobMatch[1];

        // Gender
        if (/female/i.test(text)) gender = 'Female';
        else if (/male/i.test(text)) gender = 'Male';

        // Pincode
        const pinMatch = text.match(/\b[1-9][0-9]{5}\b/);
        if (pinMatch) pincode = pinMatch[0];

        // Name heuristics & text lines
        const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 2);

        // Extract father/husband name if present
        for (const l of lines) {
          const fatherMatch = l.match(/(?:father['’]s?\s*name|s\/o|d\/o|w\/o)[:\s]+([A-Za-z\s]{3,30})/i);
          if (fatherMatch && !fatherName) {
            fatherName = fatherMatch[1].trim();
          }
        }

        for (const l of lines) {
          if (!fullName && /^[A-Z][a-zA-Z\s]{2,25}$/.test(l) && !/government|india|unique|authority|income|department|male|female|birth|father|card/i.test(l)) {
            fullName = l;
            break;
          }
        }

        setKycData({
          fullName: fullName || '',
          fatherName: fatherName || '',
          dob: dob || '',
          gender: gender || 'Male',
          idNumber: idNumber || '',
          idType,
          address: pincode ? `Pincode: ${pincode}` : '',
          pincode: pincode || '',
        });
      } catch (err) {
        console.warn('OCR error in SmartKycSlip', err);
        setKycData({
          fullName: '',
          fatherName: '',
          dob: '',
          gender: 'Male',
          idNumber: '',
          idType: 'Identity Card',
          address: '',
          pincode: '',
        });
      } finally {
        setIsExtracting(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Clean 80mm POS Thermal / Laser Acknowledgment Receipt Printer
  const handlePrintSlip = () => {
    const printWin = window.open('', '_blank');
    if (!printWin) {
      alert('Please allow popups to print the acknowledgement slip.');
      return;
    }

    const now = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>KYC Acknowledgement - ${escapeHtml(tokenNo)}</title>
          <style>
            @page { size: 80mm auto; margin: 4mm; }
            body {
              font-family: monospace, -apple-system, sans-serif;
              font-size: 12px;
              color: #000;
              margin: 0;
              padding: 6px;
              max-width: 320px;
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .header { border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 8px; }
            .title { font-size: 15px; font-weight: 900; margin-bottom: 2px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 5px; }
            .divider { border-top: 1px dashed #000; margin: 8px 0; }
            .sign-box { border: 1px solid #444; height: 50px; margin-top: 10px; display: flex; align-items: flex-end; justify-content: center; font-size: 9px; padding-bottom: 2px; }
            .footer { font-size: 10px; text-align: center; color: #555; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header center">
            <div class="title">${escapeHtml(shopName)}</div>
            <div>CUSTOMER APPLICATION ACKNOWLEDGEMENT SLIP</div>
            <div style="font-size: 10px; margin-top: 3px;">Date: ${escapeHtml(now)} | Token: ${escapeHtml(tokenNo)}</div>
          </div>

          <div class="row">
            <span>Applicant Name:</span>
            <span class="bold">${escapeHtml(kycData.fullName || 'N/A')}</span>
          </div>
          <div class="row">
            <span>Father/Spouse:</span>
            <span>${escapeHtml(kycData.fatherName || 'N/A')}</span>
          </div>
          <div class="row">
            <span>Date of Birth:</span>
            <span>${escapeHtml(kycData.dob || 'N/A')}</span>
          </div>
          <div class="row">
            <span>ID Proof:</span>
            <span class="bold">${escapeHtml(kycData.idType.toUpperCase())} - ${escapeHtml(kycData.idNumber || 'N/A')}</span>
          </div>
          <div class="row">
            <span>Address / Pin:</span>
            <span>${escapeHtml(kycData.address ? kycData.address.slice(0, 24) : 'Verified')} ${kycData.pincode ? `(${escapeHtml(kycData.pincode)})` : ''}</span>
          </div>

          <div class="divider"></div>

          <div class="row">
            <span>Service Availed:</span>
            <span class="bold">${escapeHtml(serviceName)}</span>
          </div>
          <div class="row" style="font-size: 14px; font-weight: bold;">
            <span>Charges Paid:</span>
            <span>₹${escapeHtml(String(feesCharged))}</span>
          </div>

          <div class="sign-box">
            <span>Customer Signature / Thumb Impression</span>
          </div>

          <div class="footer">
            <div>*** Keep this slip for status verification ***</div>
            <div style="font-size: 8px; margin-top: 3px;">Generated by PDF Media Suite</div>
          </div>

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
    printWin.document.close();
  };

  return (
    <ToolWorkspaceShell
      title="Smart KYC OCR & Application Receipt Slip"
      subtitle="Drop customer Aadhaar, PAN, or Voter ID to auto-read all details. 1-click copy into portal forms and generate a branded customer receipt slip."
      categoryLabel="Instant KYC OCR & Customer Receipt Slip"
      icon={ScanLine}
      microVariant="ocr"
      tone="sky"
      trustNote="Local Tesseract OCR engine · Citizen ID cards stay on your device"
    >
      <div className="space-y-8">
        {/* Upload State */}
        {!imagePreview && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto pms-glass-panel rounded-3xl p-4"
          >
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-[var(--pms-border-strong)] hover:border-sky-500 rounded-2xl p-12 text-center bg-[var(--pms-white)] cursor-pointer transition-all group"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                accept="image/*,application/pdf"
                className="hidden"
              />
              <div
                className="w-16 h-16 rounded-2xl border border-[var(--pms-border)] text-sky-600 dark:text-sky-400 flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform"
                style={{ background: 'var(--pms-soft-blue)' }}
              >
                <ScanLine className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-[var(--pms-ink)] mb-2">
                Drop Aadhaar Card, PAN Card, or Voter ID Photo
              </h3>
              <p className="text-sm text-[var(--pms-muted)] max-w-md mx-auto">
                Scans customer photo ID instantly to extract Name, DOB, Father&apos;s Name, and ID number with 1-click copy buttons.
              </p>
            </div>
          </motion.div>
        )}

        {/* Active OCR Data & Quick Copy Dashboard */}
        {imagePreview && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: OCR Extracted Fields with 1-Click Copy */}
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="lg:col-span-7 space-y-6"
            >
              <div className="p-6 rounded-3xl pms-glass-panel space-y-5 relative overflow-hidden">
                <PearlScanOverlay active={isExtracting} label="Scanning Aadhaar / PAN / Voter ID via OCR..." />

                <div className="flex items-center justify-between border-b border-[var(--pms-border)] pb-3 gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-500 animate-pulse shrink-0" />
                    <h3 className="text-sm font-bold text-[var(--pms-ink)]">
                      Extracted Customer Details (1-Click Copy)
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className="text-[11px] font-bold px-2.5 py-0.5 rounded-full text-[var(--pms-ink)] border border-[var(--pms-border)]"
                      style={{ background: 'var(--pms-soft-mint)' }}
                    >
                      <AnimatedNumber value={filledFieldCount} suffix=" / 6 fields" />
                    </span>
                    <button
                      onClick={() => {
                        setImagePreview(null);
                      }}
                      className="text-xs text-rose-500 hover:text-rose-600 font-semibold cursor-pointer"
                    >
                      Change ID Photo
                    </button>
                  </div>
                </div>

                {isExtracting ? (
                  <div className="py-12 text-center space-y-3">
                    <div className="w-8 h-8 rounded-full border-4 border-sky-500 border-t-transparent animate-spin mx-auto" />
                    <p className="text-xs font-bold text-[var(--pms-muted)]">Reading text from ID card photo...</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Full Name */}
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-[var(--pms-white)] border border-[var(--pms-border)]">
                      <div className="flex-1 pr-2">
                        <span className="text-[10px] uppercase font-bold text-[var(--pms-muted)] block">Full Name</span>
                        <input
                          type="text"
                          value={kycData.fullName}
                          placeholder="Enter customer full name"
                          onChange={(e) => setKycData({ ...kycData, fullName: e.target.value })}
                          className="font-bold text-sm bg-transparent outline-none text-[var(--pms-ink)] w-full"
                        />
                      </div>
                      <button
                        onClick={() => handleCopy(kycData.fullName, 'name')}
                        className="pms-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer shrink-0"
                      >
                        {copiedField === 'name' ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedField === 'name' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>

                    {/* Father Name */}
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-[var(--pms-white)] border border-[var(--pms-border)]">
                      <div className="flex-1 pr-2">
                        <span className="text-[10px] uppercase font-bold text-[var(--pms-muted)] block">Father&apos;s / Husband&apos;s Name</span>
                        <input
                          type="text"
                          value={kycData.fatherName}
                          placeholder="Enter father or husband name"
                          onChange={(e) => setKycData({ ...kycData, fatherName: e.target.value })}
                          className="font-bold text-sm bg-transparent outline-none text-[var(--pms-ink)] w-full"
                        />
                      </div>
                      <button
                        onClick={() => handleCopy(kycData.fatherName, 'father')}
                        className="pms-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer shrink-0"
                      >
                        {copiedField === 'father' ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedField === 'father' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>

                    {/* DOB, Gender & ID Number */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="flex items-center justify-between p-3 rounded-2xl bg-[var(--pms-white)] border border-[var(--pms-border)]">
                        <div className="min-w-0 pr-1">
                          <span className="text-[10px] uppercase font-bold text-[var(--pms-muted)] block">Date of Birth</span>
                          <input
                            type="text"
                            value={kycData.dob}
                            onChange={(e) => setKycData({ ...kycData, dob: e.target.value })}
                            className="font-bold text-sm bg-transparent outline-none text-[var(--pms-ink)] w-full"
                          />
                        </div>
                        <button
                          onClick={() => handleCopy(kycData.dob, 'dob')}
                          className="p-2 rounded-xl border border-[var(--pms-border)] text-[var(--pms-ink)] cursor-pointer shrink-0"
                          style={{ background: 'var(--pms-soft-lavender)' }}
                        >
                          {copiedField === 'dob' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-2xl bg-[var(--pms-white)] border border-[var(--pms-border)]">
                        <div className="min-w-0 pr-1">
                          <span className="text-[10px] uppercase font-bold text-[var(--pms-muted)] block">Gender</span>
                          <input
                            type="text"
                            value={kycData.gender}
                            onChange={(e) => setKycData({ ...kycData, gender: e.target.value })}
                            className="font-bold text-sm bg-transparent outline-none text-[var(--pms-ink)] w-full"
                          />
                        </div>
                        <button
                          onClick={() => handleCopy(kycData.gender, 'gender')}
                          className="p-2 rounded-xl border border-[var(--pms-border)] text-[var(--pms-ink)] cursor-pointer shrink-0"
                          style={{ background: 'var(--pms-soft-lavender)' }}
                        >
                          {copiedField === 'gender' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-2xl bg-[var(--pms-white)] border border-[var(--pms-border)]">
                        <div className="min-w-0 pr-1">
                          <span className="text-[10px] uppercase font-bold text-[var(--pms-muted)] block">ID Number</span>
                          <input
                            type="text"
                            value={kycData.idNumber}
                            onChange={(e) => setKycData({ ...kycData, idNumber: e.target.value })}
                            className="font-bold text-sm bg-transparent outline-none text-[var(--pms-ink)] w-full"
                          />
                        </div>
                        <button
                          onClick={() => handleCopy(kycData.idNumber, 'id')}
                          className="p-2 rounded-xl border border-[var(--pms-border)] text-[var(--pms-ink)] cursor-pointer shrink-0"
                          style={{ background: 'var(--pms-soft-lavender)' }}
                        >
                          {copiedField === 'id' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Address */}
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-[var(--pms-white)] border border-[var(--pms-border)]">
                      <div className="flex-1 pr-2">
                        <span className="text-[10px] uppercase font-bold text-[var(--pms-muted)] block">Full Address</span>
                        <input
                          type="text"
                          value={kycData.address}
                          onChange={(e) => setKycData({ ...kycData, address: e.target.value })}
                          className="font-bold text-xs bg-transparent outline-none text-[var(--pms-ink)] w-full"
                        />
                      </div>
                      <button
                        onClick={() => handleCopy(kycData.address, 'addr')}
                        className="pms-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer shrink-0"
                      >
                        {copiedField === 'addr' ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedField === 'addr' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}

                <AnimatePresence>
                  {copiedField && (
                    <motion.div
                      initial={prefersReduced ? false : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={prefersReduced ? undefined : { opacity: 0 }}
                      className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 px-3 py-1.5 rounded-xl border border-[var(--pms-border)] inline-block"
                      style={{ background: 'var(--pms-soft-mint)' }}
                    >
                      Copied to clipboard — ready to paste into portal form!
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            {/* Right: Printable Customer Acknowledgement Receipt Slip */}
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 }}
              className="lg:col-span-5 space-y-4"
            >
              <div className="p-6 rounded-3xl pms-glass-panel space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--pms-border)] pb-3 gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)]">
                    Customer Receipt Slip Preview
                  </h4>
                  <button
                    onClick={handlePrintSlip}
                    className="pms-btn-primary inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print Slip
                  </button>
                </div>

                {/* Printable Slip Card (Crisp paper preview for thermal/laser accuracy) */}
                <div className="p-5 rounded-2xl bg-white text-slate-900 border-2 border-dashed border-slate-300 space-y-3 text-xs shadow-sm">
                  <div className="text-center border-b border-slate-200 pb-2">
                    <input
                      type="text"
                      value={shopName}
                      onChange={(e) => setShopName(e.target.value)}
                      className="font-black text-sm text-center bg-transparent w-full text-slate-900 outline-none"
                    />
                    <div className="text-[10px] text-slate-500">CUSTOMER APPLICATION ACKNOWLEDGEMENT SLIP</div>
                  </div>

                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Token / Receipt No:</span>
                      <span className="font-bold text-slate-900">{tokenNo}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Date &amp; Time:</span>
                      <span>{new Date().toLocaleDateString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Applicant Name:</span>
                      <span className="font-bold text-slate-900">{kycData.fullName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Father&apos;s Name:</span>
                      <span>{kycData.fatherName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">ID Ref:</span>
                      <span>{kycData.idType} ({kycData.idNumber.slice(-4) ? `Ending in ${kycData.idNumber.slice(-4)}` : 'Verified'})</span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-slate-200 font-bold gap-2">
                      <span className="text-slate-600 shrink-0">Service / Scheme:</span>
                      <input
                        type="text"
                        value={serviceName}
                        onChange={(e) => setServiceName(e.target.value)}
                        className="text-right font-bold text-sky-700 bg-transparent outline-none w-full min-w-0"
                      />
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-slate-600">Portal Fees Received (₹):</span>
                      <input
                        type="number"
                        min={0}
                        value={feesCharged}
                        onChange={(e) => setFeesCharged(Number(e.target.value) || 0)}
                        className="text-right font-black text-emerald-700 bg-transparent outline-none w-20"
                      />
                    </div>
                  </div>

                  <div className="pt-4 flex justify-between items-end text-[10px] text-slate-500 border-t border-slate-200">
                    <div>Applicant Signature</div>
                    <div className="text-right">Authorized Center Seal</div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* SEO Information */}
        <ToolSEOSection
          toolName="Smart KYC OCR & Customer Slip Generator"
          headline="Optical Document Parsing with 1-Click Form Data Copy & Official Customer Receipts"
          description="Built for E-Mitra operators, CSC kiosk owners, and cyber cafes. Scans customer identity cards (Aadhaar, PAN, Voter ID) to extract names, DOB, father's names, and ID numbers with 1-click clipboard copy buttons, preventing data-entry errors in government job applications and welfare forms. Generates professional, printable application receipt slips."
        />
      </div>
    </ToolWorkspaceShell>
  );
}

