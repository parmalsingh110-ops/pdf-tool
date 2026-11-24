import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Search,
  Layers,
  Download,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Clock,
  Eye,
  ScanLine,
  FileKey2,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import FileDropzone from '../components/FileDropzone';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';
import ToolSEOSection from '../components/ToolSEOSection';
import { apiFetch } from '../lib/api';
import { toArrayBufferBytes } from '../lib/blobUrl';
import { downloadBlob } from '../lib/utils';
import { sha256Hex } from '../lib/safeCrypto';
import { isImageFile, isPdfFile } from '../lib/fileAccept';
import { releaseCanvas } from '../lib/safeCanvas';

function cleanWinAnsi(str: string): string {
  if (!str) return '';
  return str
    .replace(/[✓✔]/g, '[OK]')
    .replace(/[✗✘❌]/g, '[X]')
    .replace(/[⚠️🚨]/g, '[!]')
    .replace(/₹/g, 'Rs.')
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[•·]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E\n\r\t]/g, ' ');
}

interface Anomaly {
  id: string;
  page: number;
  type: string;
  title: string;
  description: string;
  recovered_text?: string;
  bbox: [number, number, number, number] | null; // x0, y0, x1, y1 (null for doc-level)
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

interface MetadataAudit {
  producer: string;
  creator: string;
  creation_date: string;
  mod_date: string;
  is_encrypted: boolean;
  is_repaired: boolean;
  page_count: number;
  file_sha256?: string;
  software_warning: string | null;
  revision_warning: string | null;
  signature_warning?: string | null;
  recovered_hidden_count?: number;
}

function isSupportedImageFile(file: File): boolean {
  return isImageFile(file);
}

async function computeSha256Hex(buffer: ArrayBuffer): Promise<string> {
  return sha256Hex(buffer);
}

/** Browser-native JPEG Error Level Analysis heatmap fallback when backend is unreachable. */
async function generateLocalElaPreview(sourceImg: HTMLImageElement | HTMLCanvasElement): Promise<string> {
  const srcW = sourceImg instanceof HTMLImageElement ? sourceImg.naturalWidth : sourceImg.width;
  const srcH = sourceImg instanceof HTMLImageElement ? sourceImg.naturalHeight : sourceImg.height;
  const scale = Math.min(1, 900 / Math.max(srcW, srcH, 1));
  const w = Math.max(16, Math.round(srcW * scale));
  const h = Math.max(16, Math.round(srcH * scale));

  const c1 = document.createElement('canvas');
  c1.width = w;
  c1.height = h;
  const ctx1 = c1.getContext('2d', { willReadFrequently: true })!;
  ctx1.drawImage(sourceImg, 0, 0, w, h);
  const origPx = ctx1.getImageData(0, 0, w, h).data;

  const jpgUrl = c1.toDataURL('image/jpeg', 0.9);
  const recompImg = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = jpgUrl;
  });

  const c2 = document.createElement('canvas');
  c2.width = w;
  c2.height = h;
  const ctx2 = c2.getContext('2d', { willReadFrequently: true })!;
  ctx2.drawImage(recompImg, 0, 0, w, h);
  const recompData = ctx2.getImageData(0, 0, w, h);
  const rp = recompData.data;

  for (let i = 0; i < rp.length; i += 4) {
    const dR = Math.abs(origPx[i] - rp[i]);
    const dG = Math.abs(origPx[i + 1] - rp[i + 1]);
    const dB = Math.abs(origPx[i + 2] - rp[i + 2]);
    const mag = Math.min(255, ((dR + dG + dB) / 3) * 14);
    // Inferno-like thermal ramp
    rp[i] = Math.min(255, mag * 1.9);
    rp[i + 1] = Math.max(0, Math.min(255, (mag - 85) * 1.8));
    rp[i + 2] = Math.max(0, Math.min(255, mag < 120 ? mag * 1.3 : 255 - (mag - 120) * 1.4));
    rp[i + 3] = 255;
  }
  ctx2.putImageData(recompData, 0, 0);
  const out = c2.toDataURL('image/png');
  releaseCanvas(c1);
  releaseCanvas(c2);
  return out;
}

export default function DocForensics() {
  useSEO(
    'DocForensics™ AI PDF & Image Forgery Inspector | PDF Media Suite',
    'Deep forensic inspection for PDFs and scanned slips. Detect manipulated salary slips, forged bank statements, concealed whiteout text, JPEG ELA splices, and post-signature tampering.'
  );

  usePageSEO(
    'DocForensics™ — AI PDF & Scan Forgery Inspector',
    'Free digital forensics analyzer. Uncovers original text hidden under whiteout boxes, measures font/baseline jitter, checks AcroForm signature ByteRanges, and generates JPEG ELA X-Ray heatmaps.',
    'pdf forensics online, fake salary slip detector, error level analysis online, detect tampered pdf, reveal whiteout text pdf',
    '/doc-forensics'
  );

  const [file, setFile] = useState<File | null>(null);
  const [inputKind, setInputKind] = useState<'pdf' | 'image'>('pdf');
  const [isScanning, setIsScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [inspectorView, setInspectorView] = useState<'document' | 'ela'>('document');

  // Forensic Analysis Results
  const [tamperScore, setTamperScore] = useState(0);
  const [riskLevel, setRiskLevel] = useState<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'>('LOW');
  const [verdict, setVerdict] = useState('');
  const [metadataAudit, setMetadataAudit] = useState<MetadataAudit | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [selectedAnomaly, setSelectedAnomaly] = useState<Anomaly | null>(null);
  const [elaPreviews, setElaPreviews] = useState<Record<string, string>>({});
  const [uploadedImagePreviewUrl, setUploadedImagePreviewUrl] = useState<string>('');
  const [analysisEngineNote, setAnalysisEngineNote] = useState<string>('Deep Stream + ELA Multimodal Engine');

  // Canvas Viewport
  const prefersReduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfDocRef = useRef<any>(null);
  const [pageViewport, setPageViewport] = useState<{ width: number; height: number }>({ width: 595, height: 842 });
  const [pageNativeSize, setPageNativeSize] = useState<{ width: number; height: number }>({ width: 595, height: 842 });

  const handleFileUpload = async (selectedFile: File) => {
    const isPdf = isPdfFile(selectedFile);
    const isImg = isSupportedImageFile(selectedFile);
    if (!isPdf && !isImg) {
      alert('Please upload a PDF document or JPG/PNG/WebP/HEIC/AVIF image scan.');
      return;
    }

    setFile(selectedFile);
    setInputKind(isImg ? 'image' : 'pdf');
    setIsScanning(true);
    setScanComplete(false);
    setSelectedAnomaly(null);
    setElaPreviews({});
    setUploadedImagePreviewUrl('');
    setInspectorView('document');

    try {
      const buffer = await selectedFile.arrayBuffer();
      const localSha = await computeSha256Hex(buffer);

      if (isPdf) {
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        setCurrentPage(1);
      } else {
        pdfDocRef.current = null;
        setTotalPages(1);
        setCurrentPage(1);
      }

      // ── Step 1: Query Deep Backend Multimodal Forensics Engine ───────────
      let backendSuccess = false;
      try {
        const fd = new FormData();
        fd.append('file', selectedFile, selectedFile.name);
        const res = await apiFetch('/analyze/forensics', {
          method: 'POST',
          body: fd,
          timeoutMs: 18000,
          suppressTelemetry: true,
        });

        if (res.ok) {
          const data = await res.json();
          setTamperScore(data.tamper_score || 0);
          setRiskLevel(data.risk_level || 'LOW');
          setVerdict(data.verdict || '');
          setMetadataAudit({
            ...(data.metadata_audit || {}),
            file_sha256: data.metadata_audit?.file_sha256 || localSha,
          });
          setAnomalies(data.anomalies || []);
          setElaPreviews(data.ela_previews || {});
          if (data.image_preview) {
            setUploadedImagePreviewUrl(data.image_preview);
          }
          if (isImg && data.image_width && data.image_height) {
            setPageNativeSize({ width: data.image_width, height: data.image_height });
            setPageViewport({ width: data.image_width, height: data.image_height });
          }
          setAnalysisEngineNote('Server Deep Stream + Whiteout X-Ray + OpenCV ELA');
          backendSuccess = true;
        }
      } catch (beErr) {
        console.warn('[DocForensics] Backend deep scan offline, running browser forensic fallback:', beErr);
      }

      // ── Step 2: Comprehensive Client-Side Fallback ───────────────────────
      if (!backendSuccess) {
        setAnalysisEngineNote('Local Browser Forensic + Canvas ELA Engine');
        const localAnomalies: Anomaly[] = [];
        let score = 0;

        if (isImg) {
          const objUrl = URL.createObjectURL(selectedFile);
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = reject;
            im.src = objUrl;
          });
          setUploadedImagePreviewUrl(objUrl);
          setPageNativeSize({ width: img.naturalWidth, height: img.naturalHeight });
          setPageViewport({ width: img.naturalWidth, height: img.naturalHeight });

          const elaUrl = await generateLocalElaPreview(img);
          setElaPreviews({ '1': elaUrl });

          // Scan raw image bytes for editing tool XMP/EXIF traces
          const ascii = new TextDecoder('latin1').decode(new Uint8Array(buffer).subarray(0, 65536));
          for (const tool of ['Photoshop', 'Canva', 'GIMP', 'PicsArt', 'Snapseed', 'Photopea']) {
            if (ascii.includes(tool)) {
              score += 35;
              localAnomalies.push({
                id: `anom_local_img_${tool}`,
                page: 0,
                type: 'GRAPHIC_EDITOR_EXIF',
                title: `Editing Trace Found: ${tool}`,
                description: `Embedded EXIF/XMP metadata mentions ${tool}.`,
                bbox: null,
                severity: 'HIGH',
              });
              break;
            }
          }

          setMetadataAudit({
            producer: 'Local Image Inspector',
            creator: `${img.naturalWidth}x${img.naturalHeight}px Raster`,
            creation_date: 'Local Audit',
            mod_date: 'Local Audit',
            is_encrypted: false,
            is_repaired: false,
            page_count: 1,
            file_sha256: localSha,
            software_warning: localAnomalies.length > 0 ? localAnomalies[0].description : null,
            revision_warning: null,
          });
        } else {
          const pdf = pdfDocRef.current;
          const localDoc = await PDFDocument.load(buffer.slice(0), { ignoreEncryption: true });
          const rawLatin = new TextDecoder('latin1').decode(new Uint8Array(buffer));
          const xrefCount = (rawLatin.match(/startxref/g) || []).length;

          const localMeta: MetadataAudit = {
            producer: localDoc.getProducer() || 'Not specified',
            creator: localDoc.getCreator() || 'Not specified',
            creation_date: localDoc.getCreationDate() ? localDoc.getCreationDate()!.toISOString() : 'Unknown',
            mod_date: localDoc.getModificationDate() ? localDoc.getModificationDate()!.toISOString() : 'Unknown',
            is_encrypted: false,
            is_repaired: false,
            page_count: pdf.numPages,
            file_sha256: localSha,
            software_warning: null,
            revision_warning: null,
            signature_warning: null,
          };

          const prod = (localMeta.producer + ' ' + localMeta.creator).toLowerCase();
          for (const sp of ['canva', 'photoshop', 'illustrator', 'sejda', 'ilovepdf', 'smallpdf', 'foxit', 'gimp', 'nitro', 'wondershare']) {
            if (prod.includes(sp)) {
              score += 25;
              localMeta.software_warning = `Graphics/PDF Manipulation signature detected (${localMeta.producer}).`;
              localAnomalies.push({
                id: 'anom_local_meta',
                page: 0,
                type: 'GRAPHIC_EDITOR_METADATA',
                title: `Editing Software Trace (${sp.toUpperCase()})`,
                description: localMeta.software_warning,
                bbox: null,
                severity: 'HIGH',
              });
              break;
            }
          }

          if (xrefCount > 1) {
            score += 15;
            localMeta.revision_warning = `Document has ${xrefCount} incremental XRef save revisions.`;
            localAnomalies.push({
              id: 'anom_local_xref',
              page: 0,
              type: 'INCREMENTAL_REVISION',
              title: `Multiple Incremental Revisions (${xrefCount})`,
              description: localMeta.revision_warning,
              bbox: null,
              severity: 'HIGH',
            });
          }

          // Check AcroForm ByteRange truncation locally too
          const byteRangeRe = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
          let brMatch: RegExpExecArray | null;
          while ((brMatch = byteRangeRe.exec(rawLatin)) !== null) {
            const signedEnd = Number(brMatch[3]) + Number(brMatch[4]);
            if (signedEnd + 32 < buffer.byteLength) {
              score += 40;
              localMeta.signature_warning = `${buffer.byteLength - signedEnd} bytes appended after cryptographic signature ByteRange.`;
              localAnomalies.push({
                id: 'anom_local_sig',
                page: 0,
                type: 'POST_SIGNATURE_TAMPER',
                title: 'Post-Signature ByteRange Append',
                description: localMeta.signature_warning,
                bbox: null,
                severity: 'CRITICAL',
              });
            }
          }

          // Annotations + Page-1 ELA preview locally
          for (let p = 1; p <= pdf.numPages; p++) {
            try {
              const pObj = await pdf.getPage(p);
              const baseVp = pObj.getViewport({ scale: 1.0 });
              const annots = await pObj.getAnnotations();
              for (const a of annots) {
                const subtype = a.subtype || '';
                if (['FreeText', 'Square', 'Stamp', 'Ink', 'Redact', 'Text'].includes(subtype)) {
                  score += 30;
                  const r = a.rect || [0, 0, 50, 50];
                  const x0 = Math.min(r[0], r[2]);
                  const x1 = Math.max(r[0], r[2]);
                  const y0 = Math.max(0, baseVp.height - Math.max(r[1], r[3]));
                  const y1 = Math.max(0, baseVp.height - Math.min(r[1], r[3]));
                  localAnomalies.push({
                    id: `anom_local_annot_p${p}_${localAnomalies.length}`,
                    page: p,
                    type: `ANNOTATION_${subtype.toUpperCase()}`,
                    title: `Injected ${subtype} Layer (p.${p})`,
                    description: `External ${subtype} annotation added post-generation: '${(a.contents || '').slice(0, 45)}'`,
                    bbox: [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)],
                    severity: 'CRITICAL',
                  });
                }
              }

              if (p === 1) {
                const elaVp = pObj.getViewport({ scale: 1.2 });
                const tmpC = document.createElement('canvas');
                try {
                  tmpC.width = Math.round(elaVp.width);
                  tmpC.height = Math.round(elaVp.height);
                  await pObj.render({ canvasContext: tmpC.getContext('2d')!, viewport: elaVp, canvas: tmpC }).promise;
                  const localEla = await generateLocalElaPreview(tmpC);
                  setElaPreviews({ '1': localEla });
                } finally {
                  releaseCanvas(tmpC);
                }
              }
            } catch {}
          }

          setMetadataAudit(localMeta);
        }

        const finalScore = Math.min(100, score);
        setTamperScore(finalScore);
        setRiskLevel(finalScore >= 60 ? 'CRITICAL' : finalScore >= 35 ? 'HIGH' : finalScore >= 15 ? 'MEDIUM' : 'LOW');
        setVerdict(
          finalScore >= 35
            ? 'Document shows external modification, compression, or structural anomalies.'
            : 'No critical browser-level anomalies found. Switch to ELA X-Ray to inspect visual textures.'
        );
        setAnomalies(localAnomalies);
      }

      setScanComplete(true);
    } catch (err: any) {
      console.error('[DocForensics] Scan error:', err);
      alert('Failed to analyze document forensics: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsScanning(false);
    }
  };

  // Render Page to Canvas (for PDF inputs when in Document mode)
  useEffect(() => {
    if (!pdfDocRef.current || !scanComplete || inputKind !== 'pdf' || inspectorView !== 'document') return;

    let isCancelled = false;
    const renderPage = async () => {
      try {
        const page = await pdfDocRef.current.getPage(currentPage);
        if (isCancelled) return;

        const baseVp = page.getViewport({ scale: 1.0 });
        setPageNativeSize({ width: baseVp.width, height: baseVp.height });

        const viewport = page.getViewport({ scale: 1.4 });
        setPageViewport({ width: viewport.width, height: viewport.height });

        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      } catch (err) {
        console.warn('Canvas render interrupted', err);
      }
    };

    renderPage();
    return () => {
      isCancelled = true;
    };
  }, [currentPage, scanComplete, inputKind, inspectorView]);

  // Generate Formal Multi-Page PDF Forensic Audit Certificate (with SHA-256)
  const handleDownloadReport = async () => {
    if (!file) return;

    try {
      const doc = await PDFDocument.create();
      const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
      const fontReg = await doc.embedFont(StandardFonts.Helvetica);

      let page = doc.addPage([595.28, 841.89]);
      const { width, height } = page.getSize();

      page.drawRectangle({ x: 0, y: height - 86, width, height: 86, color: rgb(0.08, 0.12, 0.22) });
      page.drawText('FORENSIC DOCUMENT INTEGRITY & ELA AUDIT REPORT', {
        x: 35,
        y: height - 40,
        size: 14,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
      page.drawText(`PDF Media Suite DocForensics Engine | Timestamp: ${new Date().toISOString()}`, {
        x: 35,
        y: height - 62,
        size: 8.5,
        font: fontReg,
        color: rgb(0.72, 0.78, 0.88),
      });

      let currY = height - 115;
      page.drawText(cleanWinAnsi(`Subject File: ${file.name}`), { x: 35, y: currY, size: 11, font: fontBold });
      currY -= 16;
      page.drawText(
        cleanWinAnsi(`Size: ${(file.size / 1024).toFixed(1)} KB | Pages: ${totalPages} | SHA-256: ${(metadataAudit?.file_sha256 || 'N/A').slice(0, 64)}`),
        { x: 35, y: currY, size: 8, font: fontReg, color: rgb(0.28, 0.3, 0.35) }
      );

      currY -= 24;
      const scoreColor =
        tamperScore >= 50 ? rgb(0.85, 0.15, 0.15) : tamperScore >= 25 ? rgb(0.9, 0.55, 0.1) : rgb(0.1, 0.65, 0.3);
      page.drawRectangle({
        x: 35,
        y: currY - 46,
        width: width - 70,
        height: 54,
        color: rgb(0.96, 0.97, 0.98),
        borderColor: scoreColor,
        borderWidth: 2,
      });
      page.drawText(cleanWinAnsi(`TAMPER RISK LEVEL: ${riskLevel} (${tamperScore}% Score)`), {
        x: 48,
        y: currY - 19,
        size: 11.5,
        font: fontBold,
        color: scoreColor,
      });
      page.drawText(cleanWinAnsi(verdict).slice(0, 96), {
        x: 48,
        y: currY - 36,
        size: 8.5,
        font: fontReg,
        color: rgb(0.2, 0.2, 0.2),
      });

      currY -= 72;
      page.drawText('METADATA & CRYPTOGRAPHIC PROVENANCE', { x: 35, y: currY, size: 10, font: fontBold });
      currY -= 15;
      page.drawText(cleanWinAnsi(`Producer: ${metadataAudit?.producer || 'N/A'} | Creator: ${metadataAudit?.creator || 'N/A'}`), {
        x: 35,
        y: currY,
        size: 8.5,
        font: fontReg,
      });
      currY -= 13;
      page.drawText(cleanWinAnsi(`Created: ${metadataAudit?.creation_date || 'N/A'} | Modified: ${metadataAudit?.mod_date || 'N/A'}`), {
        x: 35,
        y: currY,
        size: 8.5,
        font: fontReg,
      });
      if (metadataAudit?.signature_warning) {
        currY -= 13;
        page.drawText(cleanWinAnsi(`Signature Warning: ${metadataAudit.signature_warning}`).slice(0, 98), {
          x: 35,
          y: currY,
          size: 8.5,
          font: fontBold,
          color: rgb(0.8, 0.12, 0.12),
        });
      }

      currY -= 26;
      page.drawText(`FORENSIC FINDINGS LOG (${anomalies.length} Detected)`, { x: 35, y: currY, size: 10, font: fontBold });
      currY -= 18;

      if (anomalies.length === 0) {
        page.drawText('[OK] No vector whiteouts, concealed text layers, font splicing, or ELA hotspots detected.', {
          x: 35,
          y: currY,
          size: 9,
          font: fontReg,
          color: rgb(0.1, 0.55, 0.25),
        });
      } else {
        for (const anom of anomalies.slice(0, 22)) {
          if (currY < 65) {
            page = doc.addPage([595.28, 841.89]);
            currY = height - 55;
          }
          page.drawText(
            cleanWinAnsi(`- [${anom.page > 0 ? `Page ${anom.page}` : 'Document'}] [${anom.severity}] ${anom.title}`).slice(0, 92),
            {
              x: 35,
              y: currY,
              size: 9,
              font: fontBold,
              color: anom.severity === 'CRITICAL' ? rgb(0.8, 0.1, 0.1) : rgb(0.15, 0.18, 0.24),
            }
          );
          currY -= 13;
          page.drawText(cleanWinAnsi(`  ${anom.description}`).slice(0, 102), {
            x: 35,
            y: currY,
            size: 8,
            font: fontReg,
            color: rgb(0.38, 0.4, 0.45),
          });
          currY -= 17;
        }
      }

      page.drawText('CONFIDENTIAL FORENSIC AUDIT REPORT - VERIFICATION USE ONLY', {
        x: 135,
        y: 25,
        size: 7.5,
        font: fontBold,
        color: rgb(0.55, 0.58, 0.62),
      });

      const reportBytes = await doc.save();
      const blob = new Blob([toArrayBufferBytes(reportBytes)], { type: 'application/pdf' });
      downloadBlob(blob, `Forensic_Report_${file.name.replace(/\.[^.]+$/, '')}.pdf`);
    } catch (e) {
      console.error(e);
      alert('Could not generate PDF report.');
    }
  };

  const currentPageAnomalies = anomalies.filter(
    (a) => a.page === currentPage && a.bbox && Array.isArray(a.bbox) && a.bbox.length === 4
  );
  const activeElaUrl = elaPreviews[String(currentPage)] || '';

  return (
    <ToolWorkspaceShell
      title="DocForensics™"
      subtitle="Multimodal forgery detector for PDFs and scanned images. Runs Whiteout X-Ray concealed-text recovery, JPEG ELA re-compression analysis, font/baseline jitter checks, and AcroForm ByteRange validation."
      categoryLabel="Digital Forensics & Forgery Inspector (PDF + Image ELA)"
      icon={ShieldAlert}
      microVariant="compare"
      tone="rose"
      trustNote="SHA-256 integrity audit • Whiteout concealed text X-Ray • JPEG ELA splice detector"
    >
      <div className="space-y-8">
        {!file && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
          >
            <FileDropzone
              onDrop={(files) => files[0] && handleFileUpload(files[0])}
              multiple={false}
              accept={{
                'application/pdf': ['.pdf'],
                'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.avif'],
              }}
              title="Drop Salary Slip, Bank Statement, Marksheet, or WhatsApp Scan (PDF / JPG / PNG)"
              subtitle="Audits vector whiteout masks, concealed underlying text, JPEG ELA splice regions, EXIF tags, font jitter, and signature ByteRanges"
            />
          </motion.div>
        )}

        {isScanning && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative overflow-hidden p-14 rounded-3xl pms-glass-panel text-center space-y-4"
          >
            <PearlScanOverlay active={isScanning} label="Running Multimodal Forensics & ELA X-Ray..." />
            <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <Search className="w-7 h-7 animate-pulse" />
            </div>
            <h3 className="text-lg font-extrabold" style={{ color: 'var(--pms-ink)' }}>
              Running Deep Forensic Stream &amp; ELA Analysis...
            </h3>
            <p className="text-xs max-w-md mx-auto" style={{ color: 'var(--pms-muted)' }}>
              Inspecting concealed text under whiteout rectangles, font/baseline jitter, AcroForm ByteRange coverage, and Q90 JPEG Error Level residuals.
            </p>
          </motion.div>
        )}

        {scanComplete && file && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            {/* Action Bar */}
            <div className="p-4 rounded-3xl pms-glass-panel flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                <span className="text-xs px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 font-mono font-bold shrink-0">
                  {analysisEngineNote}
                </span>
                <span className="text-sm font-bold truncate" style={{ color: 'var(--pms-ink)' }}>
                  {file.name}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => {
                    setFile(null);
                    setScanComplete(false);
                  }}
                  className="px-4 py-2.5 rounded-2xl border border-[var(--pms-border)] text-xs font-bold hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                  style={{ color: 'var(--pms-ink)' }}
                >
                  Scan Another File
                </button>
                <button
                  onClick={handleDownloadReport}
                  className="pms-btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-xs shadow-lg cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Export Forensic PDF Certificate
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left 5 Cols */}
              <div className="lg:col-span-5 space-y-6">
                {/* Scorecard */}
                <div
                  className={`p-6 rounded-3xl pms-glass-panel border ${
                    riskLevel === 'CRITICAL'
                      ? 'border-rose-500/50 bg-rose-500/5 dark:bg-rose-950/30'
                      : riskLevel === 'HIGH'
                      ? 'border-amber-500/50 bg-amber-500/5 dark:bg-amber-950/30'
                      : 'border-emerald-500/50 bg-emerald-500/5 dark:bg-emerald-950/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-widest block" style={{ color: 'var(--pms-muted)' }}>
                        Tamper Probability
                      </span>
                      <h3 className="text-3xl font-black tracking-tight flex items-center gap-2 mt-1" style={{ color: 'var(--pms-ink)' }}>
                        <AnimatedNumber value={tamperScore} suffix="%" />
                        <span
                          className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase ${
                            riskLevel === 'CRITICAL'
                              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/40'
                              : riskLevel === 'HIGH'
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/40'
                              : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40'
                          }`}
                        >
                          {riskLevel} RISK
                        </span>
                      </h3>
                    </div>
                    {riskLevel === 'LOW' ? (
                      <ShieldCheck className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <ShieldAlert className="w-10 h-10 text-rose-600 dark:text-rose-400 animate-pulse" />
                    )}
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--pms-muted)' }}>
                    {verdict}
                  </p>
                  {Boolean(metadataAudit?.recovered_hidden_count) && (
                    <div className="mt-3 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/35 text-xs font-bold text-rose-700 dark:text-rose-300">
                      X-Ray Alert: {metadataAudit?.recovered_hidden_count} whiteout box(es) actually concealed underlying text!
                    </div>
                  )}
                </div>

                {/* Metadata & SHA-256 Card */}
                <div className="p-5 rounded-3xl pms-glass-panel space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--pms-muted)' }}>
                    <Cpu className="w-4 h-4 text-cyan-600 dark:text-cyan-400" /> Metadata &amp; Cryptographic Fingerprint
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-3 rounded-2xl bg-slate-100/80 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800">
                      <span className="text-[10px] block" style={{ color: 'var(--pms-muted)' }}>
                        Producer / Software
                      </span>
                      <span className="font-mono font-semibold truncate block" style={{ color: 'var(--pms-ink)' }}>
                        {metadataAudit?.producer || 'Unknown'}
                      </span>
                    </div>
                    <div className="p-3 rounded-2xl bg-slate-100/80 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800">
                      <span className="text-[10px] block" style={{ color: 'var(--pms-muted)' }}>
                        Creator / Source
                      </span>
                      <span className="font-mono font-semibold truncate block" style={{ color: 'var(--pms-ink)' }}>
                        {metadataAudit?.creator || 'Unknown'}
                      </span>
                    </div>
                  </div>

                  {metadataAudit?.file_sha256 && (
                    <div className="p-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800 flex items-center gap-2 text-[10px] font-mono">
                      <FileKey2 className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                      <span className="truncate select-all" style={{ color: 'var(--pms-muted)' }}>
                        SHA-256: {metadataAudit.file_sha256}
                      </span>
                    </div>
                  )}

                  {metadataAudit?.signature_warning && (
                    <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span>{metadataAudit.signature_warning}</span>
                    </div>
                  )}
                  {metadataAudit?.software_warning && (
                    <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span>{metadataAudit.software_warning}</span>
                    </div>
                  )}
                  {metadataAudit?.revision_warning && (
                    <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                      <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>{metadataAudit.revision_warning}</span>
                    </div>
                  )}
                </div>

                {/* Detected Anomalies Feed */}
                <div className="p-5 rounded-3xl pms-glass-panel space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--pms-muted)' }}>
                      <Layers className="w-4 h-4 text-rose-600 dark:text-rose-400" /> Forensic Findings ({anomalies.length})
                    </div>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--pms-muted)' }}>
                      Page {currentPage} of {totalPages}
                    </span>
                  </div>

                  {anomalies.length === 0 ? (
                    <div className="p-4 rounded-2xl bg-slate-100/70 dark:bg-slate-950/60 text-center text-xs" style={{ color: 'var(--pms-muted)' }}>
                      No whiteout patches, concealed underlying text, font mismatches, or ELA splice anomalies detected.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                      {anomalies.map((anom) => (
                        <div
                          key={anom.id}
                          onClick={() => {
                            if (anom.page > 0) setCurrentPage(anom.page);
                            setSelectedAnomaly(anom);
                          }}
                          className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                            selectedAnomaly?.id === anom.id
                              ? 'bg-rose-50/90 dark:bg-rose-950/50 border-rose-500 shadow-md shadow-rose-500/10'
                              : 'bg-white/75 dark:bg-slate-950/80 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-bold text-xs truncate" style={{ color: 'var(--pms-ink)' }}>
                              {anom.title}
                            </span>
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded-md font-mono font-bold shrink-0 ${
                                anom.severity === 'CRITICAL'
                                  ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                              }`}
                            >
                              {anom.page > 0 ? `p.${anom.page}` : 'Doc Level'}
                            </span>
                          </div>
                          <p className="text-[11px] leading-snug" style={{ color: 'var(--pms-muted)' }}>
                            {anom.description}
                          </p>
                          {anom.recovered_text && (
                            <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/35 text-[11px] font-mono font-bold text-rose-800 dark:text-rose-200">
                              Recovered Beneath Whiteout: &ldquo;{anom.recovered_text}&rdquo;
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right 7 Cols */}
              <div className="lg:col-span-7 space-y-4">
                <div className="p-3.5 rounded-3xl pms-glass-panel flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="p-2 rounded-xl bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
                      style={{ color: 'var(--pms-ink)' }}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-bold" style={{ color: 'var(--pms-ink)' }}>
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="p-2 rounded-xl bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
                      style={{ color: 'var(--pms-ink)' }}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Inspector Mode Toggle */}
                  <div className="flex items-center gap-1 bg-slate-200/60 dark:bg-slate-900/75 p-1 rounded-2xl border border-[var(--pms-border)]">
                    <button
                      type="button"
                      onClick={() => setInspectorView('document')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
                        inspectorView === 'document'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'text-[var(--pms-muted)] hover:text-[var(--pms-ink)]'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" /> Forgery Heatmap
                    </button>
                    {activeElaUrl && (
                      <button
                        type="button"
                        onClick={() => setInspectorView('ela')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
                          inspectorView === 'ela'
                            ? 'bg-violet-600 text-white shadow-xs'
                            : 'text-[var(--pms-muted)] hover:text-[var(--pms-ink)]'
                        }`}
                      >
                        <ScanLine className="w-3.5 h-3.5" /> ELA Compression X-Ray
                      </button>
                    )}
                  </div>
                </div>

                {/* Canvas Container */}
                <div className="relative rounded-3xl overflow-hidden pms-glass-panel flex items-center justify-center p-4">
                  {inspectorView === 'ela' && activeElaUrl ? (
                    <div className="w-full space-y-2 text-center">
                      <img
                        src={activeElaUrl}
                        alt="Error Level Analysis X-Ray"
                        className="mx-auto rounded-xl shadow-2xl max-w-full max-h-[75vh] object-contain border border-violet-500/40"
                      />
                      <p className="text-[11px] font-mono" style={{ color: 'var(--pms-muted)' }}>
                        JPEG Q90 Error Level Residual Map — Bright yellow/orange spots reveal pasted numbers, altered text patches, or uneven re-compression.
                      </p>
                    </div>
                  ) : (
                    <div className="relative inline-block shadow-2xl rounded-lg overflow-hidden bg-white">
                      {inputKind === 'image' && uploadedImagePreviewUrl ? (
                        <img
                          src={uploadedImagePreviewUrl}
                          alt="Scanned Document Preview"
                          className="block rounded-lg max-w-full h-auto"
                        />
                      ) : (
                        <canvas ref={canvasRef} className="block rounded-lg max-w-full h-auto bg-white" />
                      )}

                      {/* Forensic Tamper Bounding Boxes */}
                      <svg
                        className="absolute inset-0 pointer-events-none w-full h-full"
                        viewBox={`0 0 ${pageViewport.width} ${pageViewport.height}`}
                      >
                        {currentPageAnomalies.map((anom) => {
                          if (!anom.bbox || !Array.isArray(anom.bbox) || anom.bbox.length !== 4) return null;
                          const [x0, y0, x1, y1] = anom.bbox;
                          const scaleX = pageNativeSize.width > 0 ? pageViewport.width / pageNativeSize.width : 1.0;
                          const scaleY = pageNativeSize.height > 0 ? pageViewport.height / pageNativeSize.height : 1.0;
                          const bx = Math.max(0, x0 * scaleX - 3);
                          const by = Math.max(0, y0 * scaleY - 3);
                          const bw = Math.max(16, (x1 - x0) * scaleX + 6);
                          const bh = Math.max(12, (y1 - y0) * scaleY + 6);
                          const isSelected = selectedAnomaly?.id === anom.id;

                          return (
                            <g key={anom.id}>
                              <rect
                                x={bx}
                                y={by}
                                width={bw}
                                height={bh}
                                fill={isSelected ? 'rgba(239, 68, 68, 0.45)' : 'rgba(239, 68, 68, 0.22)'}
                                stroke={isSelected ? '#ff0000' : 'rgba(239, 68, 68, 0.95)'}
                                strokeWidth={isSelected ? '3.5' : '2.2'}
                                strokeDasharray={isSelected ? 'none' : '4 2'}
                                rx="4"
                              />
                              <text
                                x={bx + 4}
                                y={Math.max(12, by - 4)}
                                fill="#dc2626"
                                fontSize="10"
                                fontWeight="bold"
                                fontFamily="monospace"
                              >
                                [{anom.type}]
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        <ToolSEOSection
          toolName="DocForensics™"
          headline="Multimodal PDF & Image Forgery Detection Engine"
          description="Detect manipulated salary slips, forged bank balances, and altered screenshots. DocForensics inspects PDF vector streams, extracts concealed underlying text buried beneath whiteout patches, measures baseline alignment drift and inline font splicing, checks AcroForm digital signature ByteRanges, and computes Q90 JPEG Error Level Analysis (ELA) X-Ray heatmaps."
          features={[
            { title: 'Whiteout Concealment X-Ray', desc: 'Recovers actual original text hidden beneath opaque white patch boxes.' },
            { title: 'JPEG ELA Compression X-Ray', desc: 'Visualizes re-compression error variance to expose Photoshop/Canva pixel splices.' },
            { title: 'Font & Baseline Jitter Audit', desc: 'Detects foreign font families and vertical baseline shifts on numeric fields.' },
            { title: 'ByteRange & SHA-256 Certificate', desc: 'Flags bytes appended after digital signatures and exports formal SHA-256 audit PDFs.' },
          ]}
        />
      </div>
    </ToolWorkspaceShell>
  );
}
