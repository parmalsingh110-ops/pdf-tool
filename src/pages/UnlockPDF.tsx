import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Download, FileText, Unlock, AlertTriangle, Key, Search, CheckCircle2, Shield, HelpCircle, ChevronDown, Sparkles, Eye, ExternalLink } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';

interface DocPreset {
  id: string;
  name: string;
  category: 'Govt ID' | 'Bank Statement' | 'Tax & Salary' | 'Utility & Bills';
  formulaDesc: string;
  example: string;
  fields: Array<{
    key: string;
    label: string;
    placeholder: string;
    type?: 'text' | 'date' | 'number';
    maxLength?: number;
    helpText?: string;
  }>;
  generate: (values: Record<string, string>) => { primary: string; variations: string[] };
}

const DOCUMENT_PRESETS: DocPreset[] = [
  // ── Govt IDs ────────────────────────────────────────────────────────────
  {
    id: 'eaadhaar',
    name: 'e-Aadhaar PDF (UIDAI)',
    category: 'Govt ID',
    formulaDesc: 'First 4 letters of Name (CAPITAL) + Birth Year (YYYY)',
    example: 'Name: SURESH, Year: 1995 → SURE1995',
    fields: [
      { key: 'name', label: 'Full Name (as on Aadhaar)', placeholder: 'e.g. Suresh Kumar' },
      { key: 'year', label: 'Birth Year (YYYY)', placeholder: 'e.g. 1995', maxLength: 4, type: 'number' },
    ],
    generate: (val) => {
      const cleanName = (val.name || '').replace(/[^a-zA-Z]/g, '').slice(0, 4);
      const year = (val.year || '').trim();
      const primary = `${cleanName.toUpperCase()}${year}`;
      return {
        primary,
        variations: [
          primary,
          `${cleanName.toLowerCase()}${year}`,
          `${cleanName.toUpperCase()} ${year}`,
        ],
      };
    },
  },
  {
    id: 'jan_aadhaar',
    name: 'Rajasthan Jan Aadhaar e-Card',
    category: 'Govt ID',
    formulaDesc: 'First 4 letters of Head of Family Name (CAPITAL) + Birth Date (DDMM)',
    example: 'Name: ANITA, DOB: 14/02/1985 → ANIT1402',
    fields: [
      { key: 'name', label: 'Head of Family Name (Mukhiya Ka Naam)', placeholder: 'e.g. Anita Devi' },
      { key: 'dob', label: 'Date of Birth (DDMM)', placeholder: 'e.g. 1402 or 14/02/1985' },
    ],
    generate: (val) => {
      const cleanName = (val.name || '').replace(/[^a-zA-Z]/g, '').slice(0, 4);
      let digits = (val.dob || '').replace(/\D/g, '');
      const ddmm = digits.length >= 4 ? digits.slice(0, 4) : digits;
      const primary = `${cleanName.toUpperCase()}${ddmm}`;
      return {
        primary,
        variations: [
          primary,
          `${cleanName.toLowerCase()}${ddmm}`,
          `${cleanName.toUpperCase()}${digits}`, // in case full DDMMYYYY
        ],
      };
    },
  },
  {
    id: 'epan',
    name: 'e-PAN Card (NSDL / UTIITSL)',
    category: 'Govt ID',
    formulaDesc: 'Date of Birth in DDMMYYYY format (no spaces or slashes)',
    example: 'DOB: 05/08/1998 → 05081998',
    fields: [
      { key: 'dob', label: 'Date of Birth (DD/MM/YYYY)', placeholder: 'e.g. 05/08/1998 or 05081998' },
    ],
    generate: (val) => {
      const digits = (val.dob || '').replace(/\D/g, '');
      return {
        primary: digits,
        variations: [digits, val.dob || ''],
      };
    },
  },
  {
    id: 'digilocker_dl_rc',
    name: 'Driving Licence / Vehicle RC / DigiLocker',
    category: 'Govt ID',
    formulaDesc: 'Date of Birth in DDMMYYYY format',
    example: 'DOB: 15/01/1990 → 15011990',
    fields: [
      { key: 'dob', label: 'Date of Birth (DDMMYYYY)', placeholder: 'e.g. 15011990' },
    ],
    generate: (val) => {
      const digits = (val.dob || '').replace(/\D/g, '');
      return { primary: digits, variations: [digits] };
    },
  },
  {
    id: 'epfo_uan',
    name: 'EPFO UAN Passbook / Card',
    category: 'Govt ID',
    formulaDesc: 'Date of Birth (DDMMYYYY) or UAN Number',
    example: 'DOB: 12051992 or 12-digit UAN',
    fields: [
      { key: 'dob', label: 'Date of Birth (DDMMYYYY)', placeholder: 'e.g. 12051992' },
      { key: 'uan', label: 'Or 12-Digit UAN (if asked)', placeholder: 'e.g. 100987654321' },
    ],
    generate: (val) => {
      const dobDigits = (val.dob || '').replace(/\D/g, '');
      const uan = (val.uan || '').trim();
      const primary = dobDigits || uan;
      return {
        primary,
        variations: [dobDigits, uan].filter(Boolean),
      };
    },
  },

  // ── Bank Statements ──────────────────────────────────────────────────────
  {
    id: 'sbi_yono',
    name: 'State Bank of India (SBI YONO Statement)',
    category: 'Bank Statement',
    formulaDesc: 'Last 5 digits of Mobile No + DOB in DDMMYY (11 chars total)',
    example: 'Mobile: 9876543210, DOB: 05/08/1995 → 43210050895',
    fields: [
      { key: 'mobile', label: 'Registered Mobile Number (Last 5 digits)', placeholder: 'e.g. 43210' },
      { key: 'dob', label: 'Date of Birth (DD/MM/YYYY)', placeholder: 'e.g. 05/08/1995' },
    ],
    generate: (val) => {
      const mobDigits = (val.mobile || '').replace(/\D/g, '');
      const last5Mob = mobDigits.slice(-5);
      const dobDigits = (val.dob || '').replace(/\D/g, '');
      let ddmmyy = '';
      if (dobDigits.length >= 8) {
        ddmmyy = dobDigits.slice(0, 4) + dobDigits.slice(-2);
      } else {
        ddmmyy = dobDigits;
      }
      const primary = `${last5Mob}${ddmmyy}`;
      return {
        primary,
        variations: [
          primary,
          `${last5Mob}${dobDigits}`, // in case full DDMMYYYY
          `${dobDigits.slice(0, 4)}${last5Mob}`,
        ],
      };
    },
  },
  {
    id: 'hdfc_bank',
    name: 'HDFC Bank Account Statement',
    category: 'Bank Statement',
    formulaDesc: '8 or 9 digit NetBanking Customer ID',
    example: 'Customer ID: 12345678 → 12345678',
    fields: [
      { key: 'custId', label: 'Customer ID (Check cheque book / Passbook)', placeholder: 'e.g. 12345678' },
    ],
    generate: (val) => {
      const primary = (val.custId || '').trim();
      return { primary, variations: [primary] };
    },
  },
  {
    id: 'icici_bank',
    name: 'ICICI Bank / Credit Card Statement',
    category: 'Bank Statement',
    formulaDesc: 'First 4 letters of Name (lowercase) + DOB in DDMM format',
    example: 'Name: Suresh, DOB: 05/08/1992 → sure0508',
    fields: [
      { key: 'name', label: 'Cardholder / Account Holder Name', placeholder: 'e.g. Suresh Kumar' },
      { key: 'dob', label: 'Date of Birth (DDMM)', placeholder: 'e.g. 0508' },
    ],
    generate: (val) => {
      const cleanName = (val.name || '').replace(/[^a-zA-Z]/g, '').slice(0, 4);
      const digits = (val.dob || '').replace(/\D/g, '').slice(0, 4);
      const primary = `${cleanName.toLowerCase()}${digits}`;
      return {
        primary,
        variations: [
          primary,
          `${cleanName.toUpperCase()}${digits}`,
          `${cleanName.toLowerCase()}${(val.dob || '').replace(/\D/g, '')}`, // full DDMMYYYY
        ],
      };
    },
  },
  {
    id: 'axis_bank',
    name: 'Axis Bank Statement',
    category: 'Bank Statement',
    formulaDesc: 'First 4 letters of Name (UPPERCASE) + DOB in DDMMYYYY format',
    example: 'Name: RAHUL, DOB: 15/04/1990 → RAHU15041990',
    fields: [
      { key: 'name', label: 'Account Holder Name', placeholder: 'e.g. Rahul Sharma' },
      { key: 'dob', label: 'Date of Birth (DDMMYYYY)', placeholder: 'e.g. 15041990' },
    ],
    generate: (val) => {
      const cleanName = (val.name || '').replace(/[^a-zA-Z]/g, '').slice(0, 4);
      const digits = (val.dob || '').replace(/\D/g, '');
      const primary = `${cleanName.toUpperCase()}${digits}`;
      return {
        primary,
        variations: [
          primary,
          `${cleanName.toLowerCase()}${digits}`,
          `${cleanName.toUpperCase()}${digits.slice(0, 4)}`, // DDMM only
        ],
      };
    },
  },
  {
    id: 'pnb_bank',
    name: 'Punjab National Bank (PNB Statement)',
    category: 'Bank Statement',
    formulaDesc: 'Account Number or Customer ID (all digits)',
    example: 'Account Number: 1234000100123456',
    fields: [
      { key: 'accNo', label: '16-Digit PNB Account Number', placeholder: 'e.g. 1234000100123456' },
    ],
    generate: (val) => {
      const primary = (val.accNo || '').replace(/\s+/g, '');
      return { primary, variations: [primary] };
    },
  },
  {
    id: 'bob_bank',
    name: 'Bank of Baroda (BOB Statement)',
    category: 'Bank Statement',
    formulaDesc: 'First 4 letters of Name (UPPERCASE) + Last 4 digits of Mobile No',
    example: 'Name: AMIT, Mobile: 9876543210 → AMIT3210',
    fields: [
      { key: 'name', label: 'Account Holder Name', placeholder: 'e.g. Amit Kumar' },
      { key: 'mobile', label: 'Registered Mobile Number', placeholder: 'e.g. 9876543210' },
    ],
    generate: (val) => {
      const cleanName = (val.name || '').replace(/[^a-zA-Z]/g, '').slice(0, 4);
      const mob = (val.mobile || '').replace(/\D/g, '').slice(-4);
      const primary = `${cleanName.toUpperCase()}${mob}`;
      return {
        primary,
        variations: [
          primary,
          `${cleanName.toLowerCase()}${mob}`,
        ],
      };
    },
  },
  {
    id: 'kotak_bank',
    name: 'Kotak Mahindra Bank Statement',
    category: 'Bank Statement',
    formulaDesc: 'CRN Number (Customer Relationship Number)',
    example: 'CRN: 98765432',
    fields: [
      { key: 'crn', label: 'CRN Number (Check Debit Card / App)', placeholder: 'e.g. 98765432' },
    ],
    generate: (val) => {
      const primary = (val.crn || '').trim();
      return { primary, variations: [primary] };
    },
  },
  {
    id: 'canara_union',
    name: 'Canara / Union Bank Statement',
    category: 'Bank Statement',
    formulaDesc: 'First 4 letters of Name (UPPERCASE) + Last 4 digits of Mobile No',
    example: 'Name: VIKAS, Mobile: 9876543210 → VIKA3210',
    fields: [
      { key: 'name', label: 'Account Holder Name', placeholder: 'e.g. Vikas Singh' },
      { key: 'mobile', label: 'Registered Mobile Number', placeholder: 'e.g. 9876543210' },
    ],
    generate: (val) => {
      const cleanName = (val.name || '').replace(/[^a-zA-Z]/g, '').slice(0, 4);
      const mob = (val.mobile || '').replace(/\D/g, '').slice(-4);
      const primary = `${cleanName.toUpperCase()}${mob}`;
      return { primary, variations: [primary, `${cleanName.toLowerCase()}${mob}`] };
    },
  },

  // ── Tax & Salary ────────────────────────────────────────────────────────
  {
    id: 'income_tax_ais',
    name: 'Income Tax AIS / 26AS PDF',
    category: 'Tax & Salary',
    formulaDesc: 'PAN Number in lowercase + Date of Birth in DDMMYYYY format',
    example: 'PAN: ABCDE1234F, DOB: 15/08/1990 → abcde1234f15081990',
    fields: [
      { key: 'pan', label: 'PAN Card Number', placeholder: 'e.g. ABCDE1234F', maxLength: 10 },
      { key: 'dob', label: 'Date of Birth (DDMMYYYY)', placeholder: 'e.g. 15081990' },
    ],
    generate: (val) => {
      const pan = (val.pan || '').trim();
      const dob = (val.dob || '').replace(/\D/g, '');
      const primary = `${pan.toLowerCase()}${dob}`;
      return {
        primary,
        variations: [
          primary,
          `${pan.toUpperCase()}${dob}`,
        ],
      };
    },
  },
  {
    id: 'form_16',
    name: 'Form 16 / Govt Salary Slip',
    category: 'Tax & Salary',
    formulaDesc: 'PAN (UPPERCASE) + DOB (DDMMYYYY) or PAN alone',
    example: 'PAN: ABCDE1234F + 15081990 → ABCDE1234F15081990',
    fields: [
      { key: 'pan', label: 'Employee PAN Number', placeholder: 'e.g. ABCDE1234F' },
      { key: 'dob', label: 'Date of Birth (DDMMYYYY)', placeholder: 'e.g. 15081990' },
    ],
    generate: (val) => {
      const pan = (val.pan || '').trim();
      const dob = (val.dob || '').replace(/\D/g, '');
      const primary = `${pan.toUpperCase()}${dob}`;
      return {
        primary,
        variations: [
          primary,
          `${pan.toUpperCase()}`,
          `${pan.toLowerCase()}${dob}`,
          dob,
        ],
      };
    },
  },

  // ── Utility ─────────────────────────────────────────────────────────────
  {
    id: 'telecom_bill',
    name: 'Airtel / Jio / Vi Postpaid Bill',
    category: 'Utility & Bills',
    formulaDesc: 'Registered 10-digit Mobile Number or Account Number',
    example: 'Mobile: 9876543210',
    fields: [
      { key: 'mobile', label: '10-Digit Mobile / Account Number', placeholder: 'e.g. 9876543210' },
    ],
    generate: (val) => {
      const primary = (val.mobile || '').replace(/\D/g, '');
      return { primary, variations: [primary] };
    },
  },
];

export default function UnlockPDF() {
  useSEO(
    'Unlock PDF Online Free — Smart Document Password Helper | PDF Media Suite',
    'Free online PDF password remover with Smart Document Password Helper for Aadhaar, SBI, HDFC, ICICI, Jan Aadhaar, Form 16, AIS tax statements and more.'
  );

  usePageSEO(
    'Unlock PDF — Remove Password & Smart Document Helper',
    'Remove password protection from PDF files. Auto-calculate passwords for e-Aadhaar, Bank Statements, Jan Aadhaar, and Tax reports directly in your browser.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [unlockMode, setUnlockMode] = useState<'direct' | 'smart'>('smart');
  const [directPassword, setDirectPassword] = useState('');

  // Smart Helper State
  const [selectedPresetId, setSelectedPresetId] = useState<string>('eaadhaar');
  const [docSearch, setDocSearch] = useState('');
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [unlockedUrl, setUnlockedUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [triedPasswords, setTriedPasswords] = useState<string[]>([]);

  const selectedPreset = DOCUMENT_PRESETS.find((p) => p.id === selectedPresetId) || DOCUMENT_PRESETS[0];

  const filteredPresets = DOCUMENT_PRESETS.filter((p) =>
    p.name.toLowerCase().includes(docSearch.toLowerCase()) ||
    p.category.toLowerCase().includes(docSearch.toLowerCase()) ||
    p.formulaDesc.toLowerCase().includes(docSearch.toLowerCase())
  );

  const handleDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setUnlockedUrl(null);
      setErrorMsg(null);
      setProgress('');
      setTriedPasswords([]);
    }
  };

  const handleFieldChange = (key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
    setErrorMsg(null);
  };

  // Compute live preview of smart password
  const computedPasswordInfo = selectedPreset.generate(formValues);

  const executeUnlockWithPasswords = async (passwordsToTry: string[]) => {
    if (!file || passwordsToTry.length === 0) return;

    setIsProcessing(true);
    setErrorMsg(null);
    setProgress('Loading PDF decryption engine...');
    setTriedPasswords([]);

    try {
      const arrayBuffer = await file.arrayBuffer();

      // Dynamic import pdfjs-dist
      const pdfjsLib = await import('pdfjs-dist');
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
      }

      let pdfjsDoc: any = null;
      let successfulPassword = '';
      const triedList: string[] = [];

      for (let i = 0; i < passwordsToTry.length; i++) {
        const pass = passwordsToTry[i];
        if (!pass) continue;
        triedList.push(pass);
        setProgress(`Trying candidate password (${i + 1}/${passwordsToTry.length})...`);

        try {
          const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(arrayBuffer),
            password: pass,
          });
          pdfjsDoc = await loadingTask.promise;
          successfulPassword = pass;
          break; // Successfully unlocked!
        } catch (err: any) {
          // If wrong password, continue to try variations
          continue;
        }
      }

      setTriedPasswords(triedList);

      if (!pdfjsDoc) {
        if (unlockMode === 'direct') {
          setErrorMsg('❌ Incorrect password. Please check your password and try again.');
        } else {
          setErrorMsg(
            `❌ Could not unlock using the provided details. Attempted variations: [${triedList.join(', ')}]. Please double-check spelling, Date of Birth or switch to "Direct Password" mode.`
          );
        }
        setIsProcessing(false);
        return;
      }

      const numPages = pdfjsDoc.numPages;
      setProgress(`Verified password "${successfulPassword}"! Rebuilding clean ${numPages} page(s)...`);

      // Render each page into a brand new clean unencrypted PDF
      const newPdfDoc = await PDFDocument.create();
      const scale = 2.0; // Crystal sharp high-res

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        setProgress(`Rendering clean page ${pageNum} of ${numPages}...`);
        const page = await pdfjsDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;

        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;

        const pngDataUrl = canvas.toDataURL('image/png');
        const pngBytes = dataUrlToBytes(pngDataUrl);

        const pngImage = await newPdfDoc.embedPng(pngBytes);
        const pdfPage = newPdfDoc.addPage([viewport.width / scale, viewport.height / scale]);
        pdfPage.drawImage(pngImage, {
          x: 0,
          y: 0,
          width: viewport.width / scale,
          height: viewport.height / scale,
        });
      }

      setProgress('Finalizing unencrypted PDF...');
      const pdfBytes = await newPdfDoc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setUnlockedUrl(url);
      setProgress('');
    } catch (error: any) {
      console.error('Error unlocking PDF:', error);
      setErrorMsg('An unexpected error occurred while processing the PDF. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnlockClick = () => {
    if (unlockMode === 'direct') {
      if (!directPassword) {
        setErrorMsg('Please enter a password.');
        return;
      }
      executeUnlockWithPasswords([directPassword]);
    } else {
      const { primary, variations } = selectedPreset.generate(formValues);
      if (!primary || primary.trim().length === 0) {
        setErrorMsg('Please fill in the required document details above.');
        return;
      }
      const uniquePasses = Array.from(new Set([primary, ...variations])).filter(Boolean);
      executeUnlockWithPasswords(uniquePasses);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 max-w-5xl mx-auto w-full">
      {/* Page Title & Intro */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 rounded-full text-xs font-semibold mb-3 border border-purple-200 dark:border-purple-800">
          <Sparkles className="w-3.5 h-3.5" /> Smart Document Password Helper Included
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white mb-3 tracking-tight">
          Unlock PDF & Remove Password
        </h1>
        <p className="text-base sm:text-lg text-gray-600 dark:text-slate-300 max-w-2xl mx-auto">
          Direct password pata hai ya nahi? Select your document (Aadhaar, SBI, HDFC, Jan Aadhaar, Form 16) aur hamara smart helper khud password banakar unlock karega!
        </p>
      </div>

      {!file ? (
        <div className="w-full max-w-2xl">
          <FileDropzone onDrop={handleDrop} multiple={false} title="Select Password-Protected PDF File" />

          {/* Quick Info Grid for Common Formats */}
          <div className="mt-8 bg-white border border-gray-200 rounded-2xl p-6 shadow-xs">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Key className="w-4 h-4 text-purple-600" /> Supported Indian Document Password Formats
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-100">
                <p className="font-semibold text-purple-900">e-Aadhaar PDF</p>
                <p className="text-gray-600 text-xs mt-1">Name ke first 4 letters (CAPITAL) + Birth Year (YYYY) e.g. <span className="font-mono font-medium text-purple-800">SURE1995</span></p>
              </div>
              <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                <p className="font-semibold text-blue-900">Rajasthan Jan Aadhaar</p>
                <p className="text-gray-600 text-xs mt-1">Mukhiya Name (4 letters CAPITAL) + DDMM e.g. <span className="font-mono font-medium text-blue-800">ANIT1402</span></p>
              </div>
              <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
                <p className="font-semibold text-emerald-900">Income Tax AIS / 26AS</p>
                <p className="text-gray-600 text-xs mt-1">PAN Card (lowercase) + DOB (DDMMYYYY) e.g. <span className="font-mono font-medium text-emerald-800">abcde1234f05081995</span></p>
              </div>
              <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-100">
                <p className="font-semibold text-amber-900">SBI YONO Statement</p>
                <p className="text-gray-600 text-xs mt-1">Mobile ke last 5 digits + DOB (DDMMYY) e.g. <span className="font-mono font-medium text-amber-800">43210050895</span></p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-3xl bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
          {/* File Card */}
          <div className="flex items-center gap-4 p-4 sm:p-5 bg-gray-50 rounded-xl border border-gray-200 mb-6">
            <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-gray-900 truncate">{file.name}</p>
              <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB • Encrypted PDF</p>
            </div>
            <button
              onClick={() => {
                setFile(null);
                setUnlockedUrl(null);
                setErrorMsg(null);
              }}
              className="text-xs font-semibold text-gray-500 hover:text-red-600 px-3 py-1.5 rounded-lg border border-gray-200 bg-white"
            >
              Change File
            </button>
          </div>

          {!unlockedUrl ? (
            <div className="space-y-6">
              {/* Mode Toggle Bar */}
              <div className="grid grid-cols-2 p-1 bg-gray-100 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => setUnlockMode('smart')}
                  className={`py-2.5 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                    unlockMode === 'smart'
                      ? 'bg-white text-purple-700 shadow-xs border border-purple-200'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  Smart Document Helper
                  <span className="hidden sm:inline text-xs font-normal bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
                    Auto
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setUnlockMode('direct')}
                  className={`py-2.5 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                    unlockMode === 'direct'
                      ? 'bg-white text-gray-900 shadow-xs border border-gray-200'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Key className="w-4 h-4 text-gray-500" />
                  Direct Password
                </button>
              </div>

              {/* Mode A: Smart Document Helper */}
              {unlockMode === 'smart' && (
                <div className="space-y-5 p-5 bg-purple-50/40 rounded-2xl border border-purple-100">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">
                      Choose Your Document Type:
                    </label>
                    <div className="relative mb-3">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
                      <input
                        type="text"
                        placeholder="Search document (e.g. Aadhaar, SBI, AIS, Jan Aadhaar)..."
                        value={docSearch}
                        onChange={(e) => setDocSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto p-1 bg-white border border-gray-200 rounded-xl">
                      {filteredPresets.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setSelectedPresetId(preset.id);
                            setFormValues({});
                            setErrorMsg(null);
                          }}
                          className={`text-left p-3 rounded-lg text-xs transition-all flex flex-col justify-between ${
                            selectedPresetId === preset.id
                              ? 'bg-purple-600 text-white shadow-xs font-semibold'
                              : 'bg-gray-50 text-gray-800 hover:bg-gray-100 border border-transparent'
                          }`}
                        >
                          <span className="font-bold text-sm mb-1">{preset.name}</span>
                          <span className={`text-[11px] ${selectedPresetId === preset.id ? 'text-purple-100' : 'text-gray-500'}`}>
                            {preset.category}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Preset Guidance Alert */}
                  <div className="p-3.5 bg-white rounded-xl border border-purple-200 text-xs text-gray-700 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 font-bold text-purple-900">
                      <HelpCircle className="w-4 h-4 text-purple-600" />
                      Password Rule: {selectedPreset.formulaDesc}
                    </div>
                    <div className="text-gray-500 font-mono text-[11px]">
                      Example: {selectedPreset.example}
                    </div>
                  </div>

                  {/* Dynamic Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {selectedPreset.fields.map((f) => (
                      <div key={f.key}>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          {f.label}
                        </label>
                        <input
                          type={f.type || 'text'}
                          maxLength={f.maxLength}
                          placeholder={f.placeholder}
                          value={formValues[f.key] || ''}
                          onChange={(e) => handleFieldChange(f.key, e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Live Password Generator Preview */}
                  {computedPasswordInfo.primary && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900">
                      <span className="font-medium flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Expected Password:
                      </span>
                      <span className="font-mono font-bold text-sm bg-white px-3 py-1 rounded-md border border-emerald-300 text-emerald-700">
                        {computedPasswordInfo.primary}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Mode B: Direct Password */}
              {unlockMode === 'direct' && (
                <div className="space-y-3">
                  <label className="block text-sm font-bold text-gray-700">
                    Enter Known PDF Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Key className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="password"
                      value={directPassword}
                      onChange={(e) => setDirectPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && directPassword && !isProcessing && handleUnlockClick()}
                      className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-shadow text-base"
                      placeholder="Enter the password..."
                      autoFocus
                    />
                  </div>
                </div>
              )}

              {/* Error Message */}
              {errorMsg && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
                  <div className="leading-relaxed">{errorMsg}</div>
                </div>
              )}

              {/* Processing Progress */}
              {isProcessing && progress && (
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600 shrink-0"></div>
                    <p className="text-sm text-purple-700 font-medium">{progress}</p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleUnlockClick}
                  disabled={isProcessing}
                  className="flex-1 py-4 bg-purple-600 hover:bg-purple-700 text-white text-base font-bold rounded-xl transition-all disabled:opacity-50 shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isProcessing ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Decrypting & Rebuilding PDF...
                    </>
                  ) : (
                    <>
                      <Unlock className="w-5 h-5" />
                      {unlockMode === 'smart' ? 'Auto-Generate Password & Unlock PDF' : 'Unlock PDF File'}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setDirectPassword('');
                    setFormValues({});
                    setErrorMsg(null);
                    setProgress('');
                  }}
                  className="px-6 py-4 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>

              {/* Trust Badge */}
              <div className="flex items-center justify-center gap-2 text-xs text-gray-500 pt-2 border-t border-gray-100">
                <Shield className="w-4 h-4 text-emerald-600" />
                <span><strong>100% Client-Side Privacy:</strong> No document, password, or name ever uploads to our servers. Processing occurs entirely in your browser.</span>
              </div>
            </div>
          ) : (
            /* Success Screen */
            <div className="space-y-6 text-center py-6">
              <div className="p-8 bg-green-50 rounded-2xl border border-green-200">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-extrabold text-green-900 mb-2">PDF Unlocked Successfully!</h3>
                <p className="text-green-700 mb-6 text-sm max-w-md mx-auto">
                  All passwords and restrictions have been permanently removed. Your new PDF is completely clean and ready to view, print, or share.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <a
                    href={unlockedUrl}
                    download={`unlocked_${file.name}`}
                    className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-green-600 hover:bg-green-700 text-white text-base font-bold rounded-xl transition-all shadow-md hover:shadow-lg"
                  >
                    <Download className="w-5 h-5" />
                    Download Unlocked PDF
                  </a>
                  <a
                    href={unlockedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-xl border border-gray-300 transition-all shadow-xs"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open in New Tab
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowPreview(!showPreview)}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-xl border border-gray-300 transition-all shadow-xs"
                  >
                    <Eye className="w-4 h-4" />
                    {showPreview ? 'Hide Preview' : 'Show Live Preview'}
                  </button>
                </div>

                {showPreview && (
                  <div className="mt-6 text-left">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Live Document Preview</p>
                    <div className="w-full h-[550px] rounded-xl border border-gray-200 overflow-hidden bg-gray-100 shadow-inner">
                      <iframe
                        src={unlockedUrl}
                        title="Unlocked PDF Document Preview"
                        className="w-full h-full border-0"
                      />
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setUnlockedUrl(null);
                  setDirectPassword('');
                  setFormValues({});
                  setProgress('');
                }}
                className="text-sm text-gray-600 hover:text-gray-900 font-semibold"
              >
                ← Unlock another document
              </button>
            </div>
          )}
        </div>
      )}

      {/* SEO / FAQs Section */}
      <div className="mt-16 w-full max-w-4xl border-t border-gray-200 pt-10 text-gray-800">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-900">
          Frequently Asked Questions About PDF Passwords
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-xs">
            <h3 className="font-bold text-gray-900 mb-2">What is the e-Aadhaar PDF password format?</h3>
            <p className="text-gray-600 leading-relaxed">
              UIDAI e-Aadhaar PDF password consists of the <strong>first 4 letters of your name in CAPITAL</strong> followed by your <strong>4-digit birth year (YYYY)</strong>. For example, if your name is ANITA KUMARI born in 1993, the password is <code className="bg-gray-100 px-1 py-0.5 rounded font-mono">ANIT1993</code>.
            </p>
          </div>
          <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-xs">
            <h3 className="font-bold text-gray-900 mb-2">What is the Rajasthan Jan Aadhaar password format?</h3>
            <p className="text-gray-600 leading-relaxed">
              Jan Aadhaar e-Cards are protected using the <strong>first 4 letters of the Head of the Family (Mukhiya)</strong> in capital letters followed by the date and month of birth (DDMM). Example: <code className="bg-gray-100 px-1 py-0.5 rounded font-mono">ANIT1402</code>.
            </p>
          </div>
          <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-xs">
            <h3 className="font-bold text-gray-900 mb-2">How to open Income Tax AIS / 26AS PDF?</h3>
            <p className="text-gray-600 leading-relaxed">
              Income tax Annual Information Statement (AIS) and 26AS files use your <strong>10-character PAN in lowercase</strong> followed by your date of birth in <strong>DDMMYYYY</strong>. Example: <code className="bg-gray-100 px-1 py-0.5 rounded font-mono">abcde1234f15081990</code>.
            </p>
          </div>
          <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-xs">
            <h3 className="font-bold text-gray-900 mb-2">Is it safe to unlock confidential PDFs here?</h3>
            <p className="text-gray-600 leading-relaxed">
              Yes, 100%! All decryption and re-rendering is executed strictly inside your device’s browser via WebAssembly and HTML5 Canvas. Your confidential identity numbers and financial statements are never transmitted to any external server.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
