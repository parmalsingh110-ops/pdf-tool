import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  ShieldOff, Download, Loader2, Plus, Undo2, Trash2, Search, 
  Sparkles, Check, ChevronLeft, ChevronRight, Eye, ShieldAlert, AlertCircle, FileText
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';
import { useToast } from '../components/Toast';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';

type RedactStyle = 'blackout' | 'whiteout' | 'confidential' | 'pixelate';

interface RedactRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  pageIndex: number;
  style: RedactStyle;
  label?: string;
}

interface DetectedPii {
  id: string;
  type: string;
  text: string;
  pageIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
  selected?: boolean;
}

export default function RedactPdf() {
  useSEO(
    'Redact PDF Online Free — Smart PII Auto-Detection & Blackout',
    'Permanently redact sensitive info from PDFs. Auto-detect Aadhaar, PAN, emails, phone numbers, and credit cards with permanent, irreversible redaction.'
  );

  usePageSEO(
    'Smart PDF Redaction Studio — Auto PII & Keyword Redactor',
    'Permanently blackout or whiteout sensitive PDF information. Features auto-detection for emails, phone numbers, Aadhaar, PAN, SSN, and custom keyword search.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [pageSizes, setPageSizes] = useState<{ w: number; h: number }[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [rects, setRects] = useState<RedactRect[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [startPt, setStartPt] = useState<{ x: number; y: number } | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<RedactStyle>('blackout');
  const [customSearchTerm, setCustomSearchTerm] = useState('');

  const [isScanningPii, setIsScanningPii] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [detectedPiiList, setDetectedPiiList] = useState<DetectedPii[]>([]);
  const [showPiiModal, setShowPiiModal] = useState(false);
  const [selectedPiiFilter, setSelectedPiiFilter] = useState<string>('all');

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const toast = useToast();

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    const f = files[0];
    setFile(f);
    setResultUrl(null);
    setRects([]);
    setCurrentPage(0);
    setDetectedPiiList([]);
    setLoading(true);

    try {
      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const imgs: string[] = [];
      const sizes: { w: number; h: number }[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 1.5 });
        sizes.push({ w: vp.width, h: vp.height });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
        imgs.push(canvas.toDataURL('image/jpeg', 0.88));
        canvas.width = 0;
        canvas.height = 0;
      }

      setPageImages(imgs);
      setPageSizes(sizes);
    } catch (e: any) {
      toast.error(`Failed to load PDF: ${e?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const getRelCoords = useCallback((e: React.MouseEvent) => {
    if (!imgRef.current) return { x: 0, y: 0 };
    const r = imgRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100
    };
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if (!pageImages.length) return;
    const pt = getRelCoords(e);
    setStartPt(pt);
    setDrawing(true);
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (!drawing || !startPt) return;
    const end = getRelCoords(e);
    const x = Math.min(startPt.x, end.x);
    const y = Math.min(startPt.y, end.y);
    const w = Math.abs(end.x - startPt.x);
    const h = Math.abs(end.y - startPt.y);

    if (w > 1 && h > 1) {
      setRects(prev => [
        ...prev,
        {
          id: Date.now().toString() + Math.random(),
          x, y, w, h,
          pageIndex: currentPage,
          style: selectedStyle,
          label: selectedStyle === 'confidential' ? 'CONFIDENTIAL' : undefined
        }
      ]);
    }
    setDrawing(false);
    setStartPt(null);
  };

  const PII_PATTERNS = [
    { type: 'Aadhaar Card', regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g },
    { type: 'PAN Number', regex: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/gi },
    { type: 'Phone Number', regex: /\b(?:\+91[-\s]?)?[6-9]\d{9}\b|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g },
    { type: 'Email Address', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi },
    { type: 'Voter ID (EPIC)', regex: /\b[A-Z]{3}[0-9]{7}\b/gi },
    { type: 'Credit Card', regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g },
    { type: 'US SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/g }
  ];

  // Scan for Sensitive PII & Patterns (Aadhaar, PAN, Emails, Phones, Credit Cards)
  const scanForPii = async () => {
    if (!file) return;
    setIsScanningPii(true);
    setOcrStatus(null);
    const detected: DetectedPii[] = [];

    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 1.5 });
        const textContent = await page.getTextContent();
        const items = textContent.items as any[];

        // 1. Single span item check
        for (const item of items) {
          const str = item.str || '';
          if (!str.trim()) continue;

          for (const { type, regex } of PII_PATTERNS) {
            regex.lastIndex = 0;
            if (regex.test(str)) {
              const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
              const xRel = (tx[4] / vp.width) * 100;
              const yRel = ((tx[5] - item.height * vp.scale) / vp.height) * 100;
              const wRel = ((item.width * vp.scale) / vp.width) * 100;
              const hRel = ((item.height * vp.scale * 1.3) / vp.height) * 100;

              detected.push({
                id: `${p}_${type}_${Math.random()}`,
                type,
                text: str.trim(),
                pageIndex: p - 1,
                x: Math.max(xRel - 0.5, 0),
                y: Math.max(yRel - 0.5, 0),
                w: Math.min(wRel + 1, 100),
                h: Math.min(hRel + 1, 100),
                selected: true
              });
            }
          }
        }

        // 2. Line grouping for split spans (e.g., Aadhaar split into 3 spans)
        const lineGroups: { [yKey: number]: { str: string; x: number; y: number; w: number; h: number }[] } = {};
        for (const item of items) {
          const str = item.str || '';
          if (!str) continue;
          const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
          const yApprox = Math.round(tx[5] / 8) * 8;
          if (!lineGroups[yApprox]) lineGroups[yApprox] = [];
          lineGroups[yApprox].push({
            str,
            x: tx[4],
            y: tx[5] - item.height * vp.scale,
            w: item.width * vp.scale,
            h: item.height * vp.scale
          });
        }

        for (const yKey of Object.keys(lineGroups)) {
          const spans = lineGroups[Number(yKey)].sort((a, b) => a.x - b.x);
          const fullLine = spans.map(s => s.str).join('');
          
          for (const { type, regex } of PII_PATTERNS) {
            regex.lastIndex = 0;
            let m;
            while ((m = regex.exec(fullLine)) !== null) {
              const matchStr = m[0];
              const alreadyFound = detected.some(d => d.pageIndex === p - 1 && d.text.includes(matchStr));
              if (alreadyFound) continue;

              const minX = Math.min(...spans.map(s => s.x));
              const maxX = Math.max(...spans.map(s => s.x + s.w));
              const minY = Math.min(...spans.map(s => s.y));
              const maxY = Math.max(...spans.map(s => s.y + s.h));

              const xRel = (minX / vp.width) * 100;
              const yRel = (minY / vp.height) * 100;
              const wRel = ((maxX - minX) / vp.width) * 100;
              const hRel = ((maxY - minY) / vp.height) * 100;

              detected.push({
                id: `${p}_${type}_${Math.random()}`,
                type,
                text: matchStr,
                pageIndex: p - 1,
                x: Math.max(xRel - 0.5, 0),
                y: Math.max(yRel - 0.5, 0),
                w: Math.min(wRel + 1, 100),
                h: Math.min(hRel + 1, 100),
                selected: true
              });
            }
          }
        }
      }

      setDetectedPiiList(detected);
      setShowPiiModal(true);
    } catch (err) {
      console.error('PII scan error:', err);
      toast.error('Error scanning text content.');
    } finally {
      setIsScanningPii(false);
    }
  };

  // OCR Deep Scan for Scanned / Image PDFs
  const scanWithOcr = async () => {
    if (!pageImages.length) return;
    setIsScanningPii(true);
    setOcrStatus('Initializing OCR engine...');
    const detected: DetectedPii[] = [];

    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');

      for (let p = 0; p < pageImages.length; p++) {
        setOcrStatus(`OCR scanning page ${p + 1} of ${pageImages.length}...`);
        const res = await worker.recognize(pageImages[p], {}, { blocks: true });
        const dAny = res.data as any;
        const lines = Array.isArray(dAny.blocks)
          ? dAny.blocks.flatMap((b: any) => (b.paragraphs || []).flatMap((pr: any) => pr.lines || []))
          : (dAny.lines || []);
        const imgSize = pageSizes[p] || { w: 1000, h: 1400 };

        for (const line of lines) {
          const text = line.text || '';
          for (const { type, regex } of PII_PATTERNS) {
            regex.lastIndex = 0;
            let m;
            while ((m = regex.exec(text)) !== null) {
              const bbox = line.bbox;
              const xRel = (bbox.x0 / imgSize.w) * 100;
              const yRel = (bbox.y0 / imgSize.h) * 100;
              const wRel = ((bbox.x1 - bbox.x0) / imgSize.w) * 100;
              const hRel = ((bbox.y1 - bbox.y0) / imgSize.h) * 100;

              detected.push({
                id: `ocr_${p}_${Math.random()}`,
                type: `OCR: ${type}`,
                text: m[0],
                pageIndex: p,
                x: Math.max(0, xRel - 0.5),
                y: Math.max(yRel - 0.5),
                w: Math.min(100, wRel + 1),
                h: Math.min(100, hRel + 1),
                selected: true
              });
            }
          }
        }
      }
      await worker.terminate();

      if (detected.length === 0) {
        toast.info('OCR Scan Complete: No sensitive patterns found in scanned images.');
      } else {
        setDetectedPiiList(prev => [...prev, ...detected]);
        setShowPiiModal(true);
      }
    } catch (err: any) {
      console.error('OCR scan failed:', err);
      toast.error('OCR error: ' + (err?.message || 'Failed to scan'));
    } finally {
      setIsScanningPii(false);
      setOcrStatus(null);
    }
  };

  const togglePiiItem = (id: string) => {
    setDetectedPiiList(prev => prev.map(item => item.id === id ? { ...item, selected: !item.selected } : item));
  };

  const toggleAllPii = (select: boolean) => {
    setDetectedPiiList(prev => prev.map(item => ({ ...item, selected: select })));
  };

  const applyDetectedPii = () => {
    const toApply = detectedPiiList.filter(item => item.selected !== false);
    const newRects: RedactRect[] = toApply.map(item => ({
      id: Date.now().toString() + Math.random(),
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      pageIndex: item.pageIndex,
      style: selectedStyle,
      label: selectedStyle === 'confidential' ? 'CONFIDENTIAL' : undefined
    }));

    setRects(prev => [...prev, ...newRects]);
    setShowPiiModal(false);
  };

  // Keyword Search Redactor
  const redactByKeyword = async () => {
    if (!file || !customSearchTerm.trim()) return;
    setLoading(true);

    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const term = customSearchTerm.toLowerCase().trim();
      const newRects: RedactRect[] = [];

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 1.5 });
        const textContent = await page.getTextContent();

        for (const item of textContent.items as any[]) {
          const str = (item.str || '').toLowerCase();
          if (str.includes(term)) {
            const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
            const xRel = (tx[4] / vp.width) * 100;
            const yRel = ((tx[5] - item.height * vp.scale) / vp.height) * 100;
            const wRel = ((item.width * vp.scale) / vp.width) * 100;
            const hRel = ((item.height * vp.scale * 1.3) / vp.height) * 100;

            newRects.push({
              id: Date.now().toString() + Math.random(),
              x: Math.max(xRel - 0.5, 0),
              y: Math.max(yRel - 0.5, 0),
              w: Math.min(wRel + 1, 100),
              h: Math.min(hRel + 1, 100),
              pageIndex: p - 1,
              style: selectedStyle,
              label: selectedStyle === 'confidential' ? 'CONFIDENTIAL' : undefined
            });
          }
        }
      }

      if (newRects.length === 0) {
        toast.info(`No occurrences of "${customSearchTerm}" found.`);
      } else {
        setRects(prev => [...prev, ...newRects]);
        setCustomSearchTerm('');
        toast.success(`Found and marked ${newRects.length} occurrence(s) for redaction.`);
      }
    } catch (err) {
      console.error('Keyword redaction error:', err);
    } finally {
      setLoading(false);
    }
  };

  const undoLast = () => {
    setRects(prev => prev.filter((_, i) => i !== prev.length - 1));
  };

  const clearCurrentPage = () => {
    setRects(prev => prev.filter(r => r.pageIndex !== currentPage));
  };

  // Compile Permanently Redacted PDF
  const applyRedaction = async () => {
    if (!file || rects.length === 0) return;
    setBusy(true);

    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const newDoc = await PDFDocument.create();

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 2.0 }); // High-res 2x
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

        // Draw redactions
        const pageRects = rects.filter(r => r.pageIndex === i - 1);

        for (const r of pageRects) {
          const rx = (r.x / 100) * canvas.width;
          const ry = (r.y / 100) * canvas.height;
          const rw = (r.w / 100) * canvas.width;
          const rh = (r.h / 100) * canvas.height;

          if (r.style === 'whiteout') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(rx, ry, rw, rh);
          } else if (r.style === 'pixelate') {
            // Mosaic pixelation
            const pixelSize = Math.max(Math.floor(rw / 10), 8);
            ctx.fillStyle = '#475569';
            for (let px = rx; px < rx + rw; px += pixelSize) {
              for (let py = ry; py < ry + rh; py += pixelSize) {
                const shade = 100 + ((px * py) % 100);
                ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
                ctx.fillRect(px, py, pixelSize, pixelSize);
              }
            }
          } else if (r.style === 'confidential') {
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(rx, ry, rw, rh);
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.max(Math.min(rh * 0.55, 14), 8)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('CONFIDENTIAL', rx + rw / 2, ry + rh / 2);
          } else {
            // Solid blackout
            ctx.fillStyle = '#000000';
            ctx.fillRect(rx, ry, rw, rh);
          }
        }

        const imgData = canvas.toDataURL('image/jpeg', 0.94);
        const imgBytes = dataUrlToBytes(imgData);
        const pdfImg = await newDoc.embedJpg(imgBytes);
        const origVp = page.getViewport({ scale: 1.0 });
        const newPage = newDoc.addPage([origVp.width, origVp.height]);
        newPage.drawImage(pdfImg, {
          x: 0,
          y: 0,
          width: origVp.width,
          height: origVp.height
        });
        canvas.width = 0;
        canvas.height = 0;
      }

      const bytes = await newDoc.save();
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultUrl(URL.createObjectURL(new Blob([bytes as any], { type: 'application/pdf' })));
      toast.success(`Successfully redacted ${rects.length} region(s)!`);
    } catch (e: any) {
      toast.error(`Redaction failed: ${e?.message || 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const currentRects = rects.filter(r => r.pageIndex === currentPage);

  return (
    <ToolWorkspaceShell
      title="Smart PDF Redaction Studio"
      subtitle="Permanently redact sensitive PII, blackout confidential numbers, or search and scrub text with 100% irreversible pixel burn."
      categoryLabel="Privacy & PII Sanitization"
      icon={ShieldOff}
      microVariant="security"
      tone="rose"
    >
      <div className="flex flex-col items-center w-full">

      {!file ? (
        <div className="w-full max-w-2xl space-y-6">
          <FileDropzone 
            onDrop={handleDrop} 
            multiple={false} 
            title="Select PDF Document to Redact" 
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Sparkles className="w-6 h-6 text-red-600 dark:text-red-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Auto PII Detection</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Detects Aadhaar, PAN, SSN, Credit Cards & Phone numbers.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <Search className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Search & Redact</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Find any keyword or name and redact across all pages.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <ShieldAlert className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Zero Leakage</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Underlying text is wiped clean. Copy-paste proof.</p>
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-red-600 mx-auto" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Rendering Pages for Redaction...</h3>
          <p className="text-xs text-slate-500">Preparing high-resolution inspection viewport...</p>
        </div>
      ) : resultUrl ? (
        /* Result Screen */
        <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-xl text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <Check className="w-10 h-10" />
          </div>

          <div>
            <span className="inline-block px-3 py-1 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
              Permanently Redacted
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              Document Redacted Successfully!
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
              Applied {rects.length} permanent redaction box{rects.length === 1 ? '' : 'es'}. The sensitive content has been permanently obliterated.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <a
              href={resultUrl}
              download={`${file.name.replace(/\.pdf$/i, '')}_Redacted.pdf`}
              className="flex-1 py-4 px-6 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 text-base transition-all"
            >
              <Download className="w-5 h-5" />
              Download Redacted PDF
            </a>
            <button
              onClick={() => { setFile(null); setResultUrl(null); }}
              className="py-4 px-6 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-2xl transition-all text-sm"
            >
              Redact Another
            </button>
          </div>
        </div>
      ) : (
        /* Interactive Redaction Canvas Workspace */
        <div className="w-full space-y-4">
          {/* Top Control Bar */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
            {/* Style Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 mr-1">Style:</span>
              {[
                { id: 'blackout', label: 'Blackout' },
                { id: 'confidential', label: '[CONFIDENTIAL]' },
                { id: 'whiteout', label: 'Whiteout' },
                { id: 'pixelate', label: 'Mosaic Blur' }
              ].map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedStyle(s.id as RedactStyle)}
                  className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all ${
                    selectedStyle === s.id
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Smart Tools: Auto PII & Search */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={scanForPii}
                disabled={isScanningPii}
                className="py-2 px-3.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
              >
                {isScanningPii && !ocrStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Auto PII Scanner
              </button>

              <button
                onClick={scanWithOcr}
                disabled={isScanningPii}
                className="py-2 px-3 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                title="Scan document images via Tesseract OCR for scanned/paper PDFs"
              >
                {ocrStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                OCR Deep Scan
              </button>

              <div className="flex items-center gap-1">
                <input
                  type="text"
                  placeholder="Keyword search..."
                  value={customSearchTerm}
                  onChange={e => setCustomSearchTerm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && redactByKeyword()}
                  className="px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none w-36"
                />
                <button
                  onClick={redactByKeyword}
                  disabled={!customSearchTerm.trim()}
                  className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold disabled:opacity-50"
                  title="Redact All Matches"
                >
                  <Search className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Actions: Undo, Clear, Apply */}
            <div className="flex items-center gap-2">
              <button
                onClick={undoLast}
                disabled={rects.length === 0}
                className="p-2 text-slate-600 hover:text-slate-900 border rounded-xl disabled:opacity-30"
                title="Undo Last Box"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                onClick={clearCurrentPage}
                disabled={currentRects.length === 0}
                className="p-2 text-red-600 hover:bg-red-50 border border-red-200 rounded-xl disabled:opacity-30"
                title="Clear Page Boxes"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={applyRedaction}
                disabled={busy || rects.length === 0}
                className="py-2 px-5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-1.5 transition-all disabled:opacity-40"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
                Apply {rects.length} Redactions
              </button>
            </div>
          </div>

          {/* Page Navigation & Canvas Area */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-400">
              <button
                onClick={() => setCurrentPage(p => Math.max(p - 1, 0))}
                disabled={currentPage === 0}
                className="p-1.5 rounded-lg border hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>Page {currentPage + 1} of {pageImages.length}</span>
              <button
                onClick={() => setCurrentPage(p => Math.min(p + 1, pageImages.length - 1))}
                disabled={currentPage === pageImages.length - 1}
                className="p-1.5 rounded-lg border hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-slate-400 ml-2">({currentRects.length} redaction boxes on this page)</span>
            </div>

            {/* Document Page Viewport with Redaction Overlay */}
            <div
              className="relative border shadow-xl bg-white select-none cursor-crosshair overflow-hidden rounded-lg max-w-full"
              onMouseDown={onMouseDown}
              onMouseUp={onMouseUp}
            >
              <img
                ref={imgRef}
                src={pageImages[currentPage]}
                alt={`Page ${currentPage + 1}`}
                className="max-h-[75vh] object-contain pointer-events-none"
              />

              {/* Render Existing Redactions on this page */}
              {currentRects.map(r => (
                <div
                  key={r.id}
                  className={`absolute pointer-events-none flex items-center justify-center text-[10px] font-bold ${
                    r.style === 'whiteout'
                      ? 'bg-white border border-slate-300'
                      : r.style === 'pixelate'
                      ? 'bg-slate-600/90 border border-slate-400'
                      : 'bg-black text-white'
                  }`}
                  style={{
                    left: `${r.x}%`,
                    top: `${r.y}%`,
                    width: `${r.w}%`,
                    height: `${r.h}%`
                  }}
                >
                  {r.style === 'confidential' && 'CONFIDENTIAL'}
                </div>
              ))}
            </div>
          </div>

          {/* Detected PII Modal */}
          {showPiiModal && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b pb-3 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-red-600" />
                    <h3 className="font-bold text-base text-slate-900 dark:text-white">Smart PII Auto-Detection</h3>
                  </div>
                  <button onClick={() => setShowPiiModal(false)} className="text-xs text-slate-400 hover:text-slate-600">✕</button>
                </div>

                {detectedPiiList.length === 0 ? (
                  <div className="text-center py-6 space-y-3">
                    <p className="text-sm text-slate-500">No common PII patterns (Aadhaar, PAN, SSN, Credit Cards) detected in text layers.</p>
                    <p className="text-xs text-slate-400">If this is a scanned document photo, try using <strong>OCR Deep Scan</strong> on the toolbar.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Found <strong className="text-red-600">{detectedPiiList.length}</strong> items across document:
                      </p>
                      <div className="flex items-center gap-2 text-xs">
                        <button onClick={() => toggleAllPii(true)} className="text-indigo-600 hover:underline font-semibold">Select All</button>
                        <span>•</span>
                        <button onClick={() => toggleAllPii(false)} className="text-slate-500 hover:underline">Unselect All</button>
                      </div>
                    </div>

                    {/* Filter Pills */}
                    <div className="flex flex-wrap gap-1.5 pb-1">
                      <button
                        onClick={() => setSelectedPiiFilter('all')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${selectedPiiFilter === 'all' ? 'bg-red-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                      >
                        All ({detectedPiiList.length})
                      </button>
                      {Array.from(new Set(detectedPiiList.map(d => d.type))).map(cat => {
                        const count = detectedPiiList.filter(d => d.type === cat).length;
                        return (
                          <button
                            key={cat}
                            onClick={() => setSelectedPiiFilter(cat)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${selectedPiiFilter === cat ? 'bg-red-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                          >
                            {cat} ({count})
                          </button>
                        );
                      })}
                    </div>

                    <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                      {detectedPiiList
                        .filter(item => selectedPiiFilter === 'all' || item.type === selectedPiiFilter)
                        .map((item) => {
                          const maskText = (type: string, text: string) => {
                            if (type.includes('Aadhaar')) return `•••• •••• ${text.slice(-4)}`;
                            if (type.includes('PAN')) return `${text.slice(0, 3)}•••••${text.slice(-1)}`;
                            if (type.includes('Phone')) return `+91 ••••• ${text.slice(-4)}`;
                            if (type.includes('Email')) {
                              const parts = text.split('@');
                              return `${parts[0].slice(0, 2)}••••@${parts[1] || ''}`;
                            }
                            if (text.length > 8) return `${text.slice(0, 3)}••••${text.slice(-3)}`;
                            return '••••••••';
                          };

                          return (
                            <label
                              key={item.id}
                              className={`p-2.5 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition-colors ${
                                item.selected !== false
                                  ? 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50'
                                  : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-60'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={item.selected !== false}
                                  onChange={() => togglePiiItem(item.id)}
                                  className="w-4 h-4 rounded text-red-600 accent-red-600 cursor-pointer"
                                />
                                <div>
                                  <span className="font-bold text-slate-800 dark:text-slate-200">{item.type}</span>
                                  <p className="font-mono text-[11px] text-slate-500">{maskText(item.type, item.text)}</p>
                                </div>
                              </div>
                              <span className="text-[10px] bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full font-bold">
                                Page {item.pageIndex + 1}
                              </span>
                            </label>
                          );
                        })}
                    </div>
                  </>
                )}

                <div className="flex items-center justify-between pt-2 border-t dark:border-slate-800">
                  <span className="text-xs text-slate-500">
                    Selected: <strong>{detectedPiiList.filter(d => d.selected !== false).length}</strong> / {detectedPiiList.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowPiiModal(false)}
                      className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                    >
                      Cancel
                    </button>
                    {detectedPiiList.length > 0 && (
                      <button
                        onClick={applyDetectedPii}
                        disabled={detectedPiiList.filter(d => d.selected !== false).length === 0}
                        className="px-5 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-md disabled:opacity-40"
                      >
                        Redact Selected ({detectedPiiList.filter(d => d.selected !== false).length}) Items
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </ToolWorkspaceShell>
  );
}
