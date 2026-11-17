import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertOctagon,
  Scale,
  Download,
  Sparkles,
  Flame,
  Check,
  Copy,
  Eye,
  FileText,
  ChevronLeft,
  ChevronRight,
  Cpu,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import FileDropzone from '../components/FileDropzone';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlProcessCard } from '../components/pearl/PearlMotion';
import ToolSEOSection from '../components/ToolSEOSection';
import { apiFetch } from '../lib/api';
import { toArrayBufferBytes } from '../lib/blobUrl';
import { downloadBlob } from '../lib/utils';

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

interface ContractTrap {
  id: string;
  category: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  clauseSnippet: string;
  matchedPhrase?: string;
  pageNumber: number;
  bbox?: [number, number, number, number] | null;
  whyDangerous: string;
  counterProposalTip: string;
  source?: 'rule_engine' | 'numeric_audit' | 'gemini_ai' | string;
}

const LOCAL_TRAP_PATTERNS = [
  {
    category: 'Unilateral Auto-Renewal & Lock-In',
    severity: 'CRITICAL' as const,
    regex: /(auto[- ]renew(?:al|s)?|automatically\s+renew|consecutive\s+terms\s+of|prior\s+written\s+notice\s+of\s+at\s+least\s+(?:30|60|90)\s+days)/gi,
    whyDangerous: 'Silently locks you in for another full term unless notice is mailed months early.',
    counterProposalTip: 'Propose: "Agreement converts to month-to-month after the Initial Term, cancelable with 30 days written notice."',
  },
  {
    category: 'Unlimited Indemnity & Personal Liability',
    severity: 'CRITICAL' as const,
    regex: /(indemnif(?:y|ies)\s+and\s+hold\s+harmless|defend,\s+indemnify|unlimited\s+liability|consequential\s+damages)/gi,
    whyDangerous: 'Exposes you to uncapped third-party damages far exceeding your compensation.',
    counterProposalTip: 'Add cap: "Aggregate liability shall be capped at total fees paid during the preceding 6 months."',
  },
  {
    category: 'Restraint of Trade & Non-Compete Bar',
    severity: 'HIGH' as const,
    regex: /(shall\s+not\s+(?:directly\s+or\s+indirectly\s+)?(?:compete|engage\s+in|provide\s+services)|non[- ]compete)/gi,
    whyDangerous: 'Restricts your ability to earn in your domain after exit (often void under Sec. 27 ICA, yet intimidating).',
    counterProposalTip: 'Delete post-termination non-compete entirely and limit only to confidentiality of trade secrets.',
  },
  {
    category: 'One-Sided Termination Without Cause',
    severity: 'HIGH' as const,
    regex: /(terminate\s+(?:this\s+agreement\s+)?at\s+any\s+time\s+without\s+cause|sole\s+(?:and\s+absolute\s+)?discretion\s+terminate)/gi,
    whyDangerous: 'Counter-party can cancel immediately with zero notice while holding you to long lock-ins.',
    counterProposalTip: 'Propose parity: "Either party may terminate without cause upon 30 days mutual written notice."',
  },
  {
    category: 'Training / Service Bond & Salary Clawback',
    severity: 'CRITICAL' as const,
    regex: /(minimum\s+service\s+period|employment\s+bond|training\s+(?:cost|bond)\s+of|forfeit\s+(?:all\s+)?salary)/gi,
    whyDangerous: 'Imposes punitive cash bond penalties or unpaid salary forfeiture on resignation.',
    counterProposalTip: 'Restrict recovery solely to documented third-party certifications amortized monthly.',
  },
  {
    category: 'Background IP & Moral Rights Grab',
    severity: 'CRITICAL' as const,
    regex: /(waives?\s+all\s+moral\s+rights|irrevocably\s+assigns\s+all\s+rights|work\s+made\s+for\s+hire.*inventions|prior\s+inventions)/gi,
    whyDangerous: 'Claims ownership over your pre-existing personal code, reusable libraries, or design templates.',
    counterProposalTip: 'Insert a Background IP carve-out preserving ownership of tools and code created before/outside this engagement.',
  },
  {
    category: 'Hostile / Distant Exclusive Jurisdiction',
    severity: 'MEDIUM' as const,
    regex: /(exclusive\s+jurisdiction\s+of\s+(?:the\s+)?courts|sole\s+arbitrator\s+nominated\s+by|exclusive\s+venue)/gi,
    whyDangerous: 'Forces litigation in distant courts or under a unilaterally picked arbitrator.',
    counterProposalTip: 'Propose neutral local courts or virtual arbitration by mutual agreement.',
  },
  {
    category: 'Salary Withholding & Unilateral Set-Off',
    severity: 'HIGH' as const,
    regex: /(right\s+to\s+(?:withhold|deduct|set[- ]off)|withhold\s+(?:full\s+and\s+final|salary|dues))/gi,
    whyDangerous: 'Allows pausing your salary or undisputed invoice payouts over subjective disputes.',
    counterProposalTip: 'State: "Undisputed salary or invoice sums cannot be withheld or unilaterally offset."',
  },
  {
    category: 'Extreme Penalties & Punitive Interest',
    severity: 'HIGH' as const,
    regex: /(liquidated\s+damages\s+of|penalty\s+of|interest\s+(?:at\s+the\s+rate\s+of|@)\s*(?:18|24|30|36)%)/gi,
    whyDangerous: 'Compounding 18%-36% penalties rapidly escalate liabilities.',
    counterProposalTip: 'Cap delayed interest at 1% monthly after a 10-day written cure period.',
  },
  {
    category: 'Unilateral Terms Modification',
    severity: 'MEDIUM' as const,
    regex: /(reserve\s+the\s+right\s+to\s+modify|terms\s+may\s+be\s+updated\s+from\s+time\s+to\s+time|without\s+prior\s+notice)/gi,
    whyDangerous: 'Allows changing terms, fees, or quotas silently without your signature.',
    counterProposalTip: 'Require mutual signed written addendum for any amendment.',
  },
];

async function sha256Short(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

export default function ContractRedline() {
  useSEO(
    'Contract Trap Redliner™ — AI Legal Agreement & Stamp Paper Auditor | PDF Media Suite',
    'Scan digital & scanned PDF contracts, stamp-paper rent agreements, and offer letters for auto-renewal lock-ins, non-competes, salary bonds, and fine-print traps. Exports coordinate-highlighted Redlined PDF.'
  );

  usePageSEO(
    'Contract Trap Redliner™ — Fine-Print Risk Shield & Legal Auditor',
    'Free online agreement trap detector with OCR support for scanned agreements, Gemini AI deep clause detection, exact clause highlights, and safe counter-clauses.',
    'contract risk scanner, scan agreement for traps, scanned rent agreement scanner, offer letter non compete detector, redline pdf export',
    '/contract-redline'
  );

  const [file, setFile] = useState<File | null>(null);
  const [useAiAudit, setUseAiAudit] = useState<boolean>(true);
  const [isAuditing, setIsAuditing] = useState(false);
  const [traps, setTraps] = useState<ContractTrap[]>([]);
  const [dangerScore, setDangerScore] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [rawPdfBytes, setRawPdfBytes] = useState<ArrayBuffer | null>(null);
  const [selectedTrap, setSelectedTrap] = useState<ContractTrap | null>(null);
  const [rightTab, setRightTab] = useState<'details' | 'visual'>('details');
  const [auditBadges, setAuditBadges] = useState<{ engine: string; ocrPages: number; aiEnhanced: boolean }>({
    engine: '14-Point Legal Engine + OCR',
    ocrPages: 0,
    aiEnhanced: false,
  });

  // Visual Page Preview State
  const prefersReduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfDocRef = useRef<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageViewport, setPageViewport] = useState({ width: 595, height: 842 });
  const [pageNativeSize, setPageNativeSize] = useState({ width: 595, height: 842 });

  const handleFileUpload = async (selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf' && !/\.pdf$/i.test(selectedFile.name)) {
      alert('Please upload a PDF contract or agreement.');
      return;
    }

    setFile(selectedFile);
    setIsAuditing(true);
    setTraps([]);
    setSelectedTrap(null);

    try {
      const buffer = await selectedFile.arrayBuffer();
      setRawPdfBytes(buffer);
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
      pdfDocRef.current = pdf;
      setTotalPages(pdf.numPages);
      setCurrentPage(1);

      let backendOk = false;
      try {
        const fd = new FormData();
        fd.append('file', selectedFile, selectedFile.name);
        fd.append('use_ai', String(useAiAudit));
        const res = await apiFetch('/analyze/contract-redline', {
          method: 'POST',
          body: fd,
          timeoutMs: 35000,
          suppressTelemetry: true,
        });
        if (res.ok) {
          const data = await res.json();
          const list: ContractTrap[] = data.traps || [];
          setTraps(list);
          setDangerScore(data.danger_score || 0);
          setAuditBadges({
            engine: data.ai_enhanced ? '14-Rule + Gemini Legal AI Audit' : 'Backend 14-Rule + Coordinate Locator',
            ocrPages: data.ocr_pages || 0,
            aiEnhanced: Boolean(data.ai_enhanced),
          });
          if (list.length > 0) {
            setSelectedTrap(list[0]);
            if (list[0].pageNumber > 0) setCurrentPage(list[0].pageNumber);
          }
          backendOk = true;
        }
      } catch (beErr) {
        console.warn('[ContractRedline] Backend unavailable, running local rule scanner:', beErr);
      }

      if (!backendOk) {
        const discoveredTraps: ContractTrap[] = [];
        let calculatedScore = 0;
        let fullTextAll = '';

        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const textContent = await page.getTextContent();
          const fullPageText = textContent.items.map((it: any) => it.str || '').join(' ').replace(/\s+/g, ' ');
          fullTextAll += ' ' + fullPageText;

          for (const pattern of LOCAL_TRAP_PATTERNS) {
            const re = new RegExp(pattern.regex.source, pattern.regex.flags);
            let m: RegExpExecArray | null;
            let guard = 0;
            while ((m = re.exec(fullPageText)) !== null && guard < 4) {
              guard++;
              const start = Math.max(0, m.index - 55);
              const end = Math.min(fullPageText.length, m.index + 155);
              const snippet = fullPageText.slice(start, end).trim();

              discoveredTraps.push({
                id: `trap_loc_${p}_${discoveredTraps.length}`,
                category: pattern.category,
                severity: pattern.severity,
                clauseSnippet: `"...${snippet}..."`,
                matchedPhrase: m[0],
                pageNumber: p,
                bbox: null,
                whyDangerous: pattern.whyDangerous,
                counterProposalTip: pattern.counterProposalTip,
                source: 'rule_engine',
              });
              calculatedScore += pattern.severity === 'CRITICAL' ? 22 : pattern.severity === 'HIGH' ? 14 : 8;
            }
          }
        }

        if (fullTextAll.trim().length < 80) {
          discoveredTraps.push({
            id: 'trap_scan_notice',
            category: 'Scanned Image PDF (OCR Requires Server)',
            severity: 'MEDIUM',
            clauseSnippet: '[This contract appears to be a scanned image without embedded digital text.]',
            pageNumber: 1,
            whyDangerous: 'Local browser mode cannot read image pixels directly without backend RapidOCR connectivity.',
            counterProposalTip: 'Ensure backend server is online or run Searchable OCR first before auditing.',
            source: 'rule_engine',
          });
        }

        setTraps(discoveredTraps);
        setDangerScore(Math.min(100, calculatedScore));
        setAuditBadges({ engine: 'Local Browser 10-Rule Scanner', ocrPages: 0, aiEnhanced: false });
        if (discoveredTraps.length > 0) setSelectedTrap(discoveredTraps[0]);
      }
    } catch (err: any) {
      console.error(err);
      alert('Failed to audit contract: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsAuditing(false);
    }
  };

  // Render PDF Page when switching to Visual Clause Location tab
  useEffect(() => {
    if (!pdfDocRef.current || rightTab !== 'visual' || !file || isAuditing) return;
    let cancelled = false;
    (async () => {
      try {
        const pg = await pdfDocRef.current.getPage(currentPage);
        if (cancelled) return;
        const baseVp = pg.getViewport({ scale: 1.0 });
        setPageNativeSize({ width: baseVp.width, height: baseVp.height });
        const vp = pg.getViewport({ scale: 1.35 });
        setPageViewport({ width: vp.width, height: vp.height });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = vp.width;
        canvas.height = vp.height;
        await pg.render({ canvasContext: canvas.getContext('2d')!, viewport: vp, canvas }).promise;
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [currentPage, rightTab, file, isAuditing]);

  const handleCopyProposal = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // ── Export Redlined PDF with Executive Summary Sheet + Exact Clause Highlighting ──
  const handleExportRedlinedPdf = async () => {
    if (!rawPdfBytes || !file) return;

    try {
      const doc = await PDFDocument.load(rawPdfBytes, { ignoreEncryption: true });
      const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
      const fontReg = await doc.embedFont(StandardFonts.Helvetica);
      const docSha = await sha256Short(rawPdfBytes);

      // Track non-overlapping callout badge Y positions per original page BEFORE prepending cover page
      const usedYPerPage = new Map<number, number[]>();

      for (let tIdx = 0; tIdx < traps.length; tIdx++) {
        const trap = traps[tIdx];
        if (trap.pageNumber >= 1 && trap.pageNumber <= doc.getPageCount()) {
          const page = doc.getPage(trap.pageNumber - 1);
          const { width, height } = page.getSize();
          const isCrit = trap.severity === 'CRITICAL';
          const badgeColor = isCrit ? rgb(0.84, 0.13, 0.16) : rgb(0.88, 0.48, 0.08);
          const hiColor = isCrit ? rgb(0.95, 0.25, 0.25) : rgb(0.96, 0.68, 0.14);

          let calloutY = height - 48;

          // If exact bounding box exists, highlight the clause inline & align callout beside it!
          if (trap.bbox && trap.bbox.length === 4) {
            const [x0, y0, x1, y1] = trap.bbox;
            const rectH = Math.max(12, y1 - y0 + 4);
            const rectW = Math.max(40, Math.min(width - x0 - 15, x1 - x0 + 6));
            const pdfY = Math.max(18, height - y1 - 2);

            page.drawRectangle({
              x: Math.max(10, x0 - 3),
              y: pdfY,
              width: rectW,
              height: rectH,
              color: hiColor,
              opacity: 0.22,
              borderColor: badgeColor,
              borderWidth: 1.1,
            });
            calloutY = Math.max(40, Math.min(height - 36, pdfY + rectH / 2 - 14));
          }

          // Collision avoidance for margin callout cards on same page
          const usedYs = usedYPerPage.get(trap.pageNumber) || [];
          while (usedYs.some((uy) => Math.abs(uy - calloutY) < 34) && calloutY > 46) {
            calloutY -= 36;
          }
          usedYs.push(calloutY);
          usedYPerPage.set(trap.pageNumber, usedYs);

          page.drawRectangle({
            x: width - 225,
            y: calloutY,
            width: 212,
            height: 28,
            color: badgeColor,
            opacity: 0.92,
          });
          page.drawText(cleanWinAnsi(`#${tIdx + 1} ${trap.category.slice(0, 29)}`), {
            x: width - 219,
            y: calloutY + 16,
            size: 7.2,
            font: fontBold,
            color: rgb(1, 1, 1),
          });
          page.drawText(cleanWinAnsi(`${trap.severity} - See Page 1 Counter-Clause`), {
            x: width - 219,
            y: calloutY + 6,
            size: 6.2,
            font: fontReg,
            color: rgb(1, 0.96, 0.92),
          });
        }
      }

      // Prepend Executive Legal Audit Summary Sheet at Index 0
      const cover = doc.insertPage(0, [595.28, 841.89]);
      const cw = 595.28;
      const ch = 841.89;
      cover.drawRectangle({ x: 0, y: ch - 82, width: cw, height: 82, color: rgb(0.11, 0.14, 0.23) });
      cover.drawText('CONTRACT TRAP REDLINER - EXECUTIVE AUDIT SHEET', {
        x: 34,
        y: ch - 38,
        size: 13.5,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
      cover.drawText(cleanWinAnsi(`Subject: ${file.name} | Risk Score: ${dangerScore}/100 | SHA-256: ${docSha}...`), {
        x: 34,
        y: ch - 60,
        size: 8.5,
        font: fontReg,
        color: rgb(0.76, 0.82, 0.92),
      });

      let cy = ch - 110;
      for (let i = 0; i < Math.min(traps.length, 9); i++) {
        const t = traps[i];
        if (cy < 75) break;
        cover.drawText(cleanWinAnsi(`[#${i + 1}] [Page ${t.pageNumber}] [${t.severity}] ${t.category}`).slice(0, 88), {
          x: 34,
          y: cy,
          size: 9.2,
          font: fontBold,
          color: t.severity === 'CRITICAL' ? rgb(0.8, 0.12, 0.15) : rgb(0.2, 0.22, 0.28),
        });
        cy -= 13;
        cover.drawText(cleanWinAnsi(`Risk: ${t.whyDangerous}`).slice(0, 102), {
          x: 42,
          y: cy,
          size: 7.8,
          font: fontReg,
          color: rgb(0.32, 0.35, 0.4),
        });
        cy -= 12;
        cover.drawText(cleanWinAnsi(`Counter: ${t.counterProposalTip}`).slice(0, 102), {
          x: 42,
          y: cy,
          size: 7.8,
          font: fontBold,
          color: rgb(0.05, 0.42, 0.56),
        });
        cy -= 20;
      }

      const outBytes = await doc.save();
      const blob = new Blob([toArrayBufferBytes(outBytes)], { type: 'application/pdf' });
      downloadBlob(blob, `Redlined_Audit_${file.name.replace(/\.pdf$/i, '')}.pdf`);
    } catch (e) {
      console.error(e);
      alert('Could not export annotated PDF.');
    }
  };

  const visualPageTraps = traps.filter(
    (t) => t.pageNumber === currentPage && t.bbox && Array.isArray(t.bbox) && t.bbox.length === 4
  );

  return (
    <ToolWorkspaceShell
      title="Contract Trap Redliner™"
      subtitle="Audit digital & scanned stamp-paper PDFs for hidden salary bonds, asymmetric notice periods, non-competes, and missing liability shields. Highlights exact clauses and generates counter-clauses."
      categoryLabel="Legal Clause & Stamp-Paper Agreement Auditor (OCR + AI)"
      icon={Scale}
      microVariant="compare"
      tone="amber"
      trustNote="14-Rule Legal Scanner • Scanned Stamp-Paper RapidOCR • Optional Gemini AI Audit"
    >
      <div className="w-full max-w-7xl mx-auto space-y-8">
        {traps.length > 0 && (
          <div className="pms-glass-panel p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 font-mono font-bold">
                {auditBadges.engine}
              </span>
              {auditBadges.ocrPages > 0 && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-700 dark:text-sky-300 font-mono font-bold">
                  RapidOCR Scanned ({auditBadges.ocrPages} pg)
                </span>
              )}
              <span className="text-xs font-bold text-[var(--pms-ink)]">
                {file?.name} • {traps.length} Risk Clauses Flagged
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setFile(null);
                  setTraps([]);
                }}
                className="px-3.5 py-2.5 rounded-xl border border-[var(--pms-border)] text-xs font-bold cursor-pointer"
                style={{ color: 'var(--pms-ink)' }}
              >
                New Audit
              </button>
              <button
                onClick={handleExportRedlinedPdf}
                className="pms-btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs cursor-pointer"
              >
                <Download className="w-4 h-4" /> Export Redlined PDF (Executive Sheet + Highlights)
              </button>
            </div>
          </div>
        )}

        {/* Upload State */}
        {!file && (
          <div className="w-full max-w-2xl mx-auto space-y-4">
            <div className="flex items-center justify-between p-3.5 rounded-2xl pms-glass-panel text-xs">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span style={{ color: 'var(--pms-ink)' }} className="font-bold">
                  Enable Gemini AI Deep Semantic Clause Detection (Server-Protected)
                </span>
              </div>
              <input
                type="checkbox"
                checked={useAiAudit}
                onChange={(e) => setUseAiAudit(e.target.checked)}
                className="accent-amber-500 w-4 h-4 rounded"
              />
            </div>

            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: prefersReduced ? 0 : 0.22 }}
            >
              <FileDropzone
                onDrop={(files) => files[0] && handleFileUpload(files[0])}
                multiple={false}
                accept={{ 'application/pdf': ['.pdf'] }}
                title="Upload Digital or Scanned Agreement, Offer Letter, or Rent Deed"
                subtitle="Supports both selectable text PDFs and scanned stamp-paper PDFs via automatic RapidOCR + 14-category legal risk inspection."
              />
            </motion.div>
          </div>
        )}

        {isAuditing && (
          <PearlProcessCard
            title="Auditing Contract Clauses & Page Coordinates..."
            stageLabel={useAiAudit ? 'OCR + 14-Rule Legal Engine + AI Shield' : 'OCR + 14-Rule Legal Engine'}
            subtitle="Checking auto-renewals, asymmetric notice periods, salary bonds, missing liability caps, and extracting exact highlight coordinates."
            accent="amber"
            className="max-w-xl mx-auto"
          />
        )}

        {!isAuditing && file && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.24 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
          >
            {/* Left 5 Cols */}
            <div className="lg:col-span-5 space-y-6">
              <div
                className={`p-6 rounded-3xl pms-glass-panel border ${
                  dangerScore >= 50
                    ? 'bg-rose-50/90 dark:bg-rose-950/35 border-rose-300 dark:border-rose-800/80'
                    : dangerScore >= 20
                    ? 'bg-amber-50/90 dark:bg-amber-950/35 border-amber-300 dark:border-amber-800/80'
                    : 'bg-emerald-50/90 dark:bg-emerald-950/35 border-emerald-300 dark:border-emerald-800/80'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-[var(--pms-muted)] block">
                      Contract Risk Score
                    </span>
                    <h3 className="text-3xl font-black text-[var(--pms-ink)] flex items-center gap-2 mt-0.5">
                      <AnimatedNumber value={dangerScore} suffix="/100" />
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase ${
                          dangerScore >= 50
                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/40'
                            : dangerScore >= 20
                            ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/40'
                            : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40'
                        }`}
                      >
                        {dangerScore >= 50 ? 'HIGH DANGER' : dangerScore >= 20 ? 'CAUTION' : 'CLEAN'}
                      </span>
                    </h3>
                  </div>
                  {dangerScore >= 50 ? (
                    <Flame className="w-10 h-10 text-rose-500 animate-bounce" />
                  ) : (
                    <ShieldCheck className="w-10 h-10 text-emerald-500 dark:text-emerald-400" />
                  )}
                </div>
                <p className="text-xs text-[var(--pms-ink)] opacity-90">
                  {traps.length > 0
                    ? `Detected ${traps.length} risky or missing legal clauses across ${totalPages} page(s). Click any item to inspect or view on the page.`
                    : 'No aggressive traps detected across the audited pages.'}
                </p>
              </div>

              <div className="p-5 rounded-3xl pms-glass-panel space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-[var(--pms-muted)] flex items-center gap-1.5">
                  <AlertOctagon className="w-4 h-4 text-amber-500" /> Flagged Clauses ({traps.length})
                </div>

                <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                  {traps.map((trap) => (
                    <div
                      key={trap.id}
                      onClick={() => {
                        setSelectedTrap(trap);
                        if (trap.pageNumber > 0) setCurrentPage(trap.pageNumber);
                      }}
                      className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                        selectedTrap?.id === trap.id
                          ? 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-500 shadow-sm'
                          : 'bg-white/60 dark:bg-slate-900/60 border-[var(--pms-border)] hover:border-amber-400/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-bold text-xs text-[var(--pms-ink)] truncate">{trap.category}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {trap.source === 'gemini_ai' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-700 dark:text-violet-300 font-bold">
                              AI
                            </span>
                          )}
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded-md font-mono font-bold ${
                              trap.severity === 'CRITICAL'
                                ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                                : 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            p.{trap.pageNumber}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs font-serif text-[var(--pms-muted)] italic line-clamp-2">{trap.clauseSnippet}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right 7 Cols */}
            <div className="lg:col-span-7 space-y-4">
              {/* View Switcher */}
              <div className="p-3 rounded-2xl pms-glass-panel flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1 bg-slate-200/60 dark:bg-slate-900/75 p-1 rounded-xl border border-[var(--pms-border)]">
                  <button
                    type="button"
                    onClick={() => setRightTab('details')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                      rightTab === 'details' ? 'bg-amber-600 text-white' : 'text-[var(--pms-muted)]'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" /> Clause Analysis &amp; Counter-Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightTab('visual')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                      rightTab === 'visual' ? 'bg-amber-600 text-white' : 'text-[var(--pms-muted)]'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" /> Highlighted Page View
                  </button>
                </div>

                {rightTab === 'visual' && (
                  <div className="flex items-center gap-2">
                    <button
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="p-1.5 rounded-lg bg-slate-200/80 dark:bg-slate-800 disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-mono font-bold" style={{ color: 'var(--pms-ink)' }}>
                      Page {currentPage} / {totalPages}
                    </span>
                    <button
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="p-1.5 rounded-lg bg-slate-200/80 dark:bg-slate-800 disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {rightTab === 'visual' ? (
                <div className="p-4 rounded-3xl pms-glass-panel flex items-center justify-center overflow-auto">
                  <div className="relative inline-block shadow-2xl rounded-lg overflow-hidden bg-white">
                    <canvas ref={canvasRef} className="block max-w-full h-auto" />
                    <svg
                      className="absolute inset-0 pointer-events-none w-full h-full"
                      viewBox={`0 0 ${pageViewport.width} ${pageViewport.height}`}
                    >
                      {visualPageTraps.map((t) => {
                        if (!t.bbox) return null;
                        const [x0, y0, x1, y1] = t.bbox;
                        const sx = pageNativeSize.width > 0 ? pageViewport.width / pageNativeSize.width : 1.35;
                        const sy = pageNativeSize.height > 0 ? pageViewport.height / pageNativeSize.height : 1.35;
                        const bx = x0 * sx - 3;
                        const by = y0 * sy - 3;
                        const bw = Math.max(30, (x1 - x0) * sx + 6);
                        const bh = Math.max(14, (y1 - y0) * sy + 6);
                        const isSel = selectedTrap?.id === t.id;
                        return (
                          <g key={t.id}>
                            <rect
                              x={bx}
                              y={by}
                              width={bw}
                              height={bh}
                              fill={isSel ? 'rgba(239, 68, 68, 0.35)' : 'rgba(245, 158, 11, 0.25)'}
                              stroke={isSel ? '#dc2626' : '#d97706'}
                              strokeWidth={isSel ? 3 : 2}
                              rx={4}
                            />
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>
              ) : selectedTrap ? (
                <div className="p-6 rounded-3xl pms-glass-panel space-y-6">
                  <div className="border-b border-[var(--pms-border)] pb-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs uppercase font-mono font-bold text-amber-600 dark:text-amber-400 tracking-wider">
                        Risk Category • Page {selectedTrap.pageNumber}
                      </span>
                      <span
                        className={`text-xs px-3 py-1 rounded-full font-bold uppercase ${
                          selectedTrap.severity === 'CRITICAL'
                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/40'
                            : 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        {selectedTrap.severity} LIABILITY
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-[var(--pms-ink)] mt-1">{selectedTrap.category}</h2>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--pms-muted)] block">
                      Exact Contract Clause Found:
                    </span>
                    <div className="p-4 rounded-2xl bg-white/75 dark:bg-slate-950/75 border border-[var(--pms-border)] font-serif text-sm text-amber-900 dark:text-amber-200 leading-relaxed italic border-l-4 border-l-amber-500">
                      {selectedTrap.clauseSnippet}
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-rose-50/90 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 space-y-1">
                    <div className="text-xs font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1.5 uppercase tracking-wide">
                      <ShieldAlert className="w-4 h-4" /> Why this clause is dangerous:
                    </div>
                    <p className="text-xs text-rose-900/90 dark:text-rose-200/80 leading-relaxed">{selectedTrap.whyDangerous}</p>
                  </div>

                  <div className="p-5 rounded-2xl bg-cyan-50/85 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800/60 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-xs font-bold text-cyan-800 dark:text-cyan-300 flex items-center gap-1.5 uppercase tracking-wide">
                        <Sparkles className="w-4 h-4" /> Counter-Proposal Language:
                      </div>
                      <button
                        onClick={() => handleCopyProposal(selectedTrap.counterProposalTip, selectedTrap.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-cyan-100 dark:bg-cyan-900/60 hover:bg-cyan-200 dark:hover:bg-cyan-800 text-cyan-900 dark:text-cyan-100 text-xs font-bold cursor-pointer transition-colors"
                      >
                        {copiedId === selectedTrap.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" /> Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" /> Copy Clause
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-xs font-mono text-cyan-950 dark:text-cyan-100 bg-white/80 dark:bg-slate-950/80 p-3.5 rounded-xl border border-cyan-200/80 dark:border-cyan-900/50">
                      {selectedTrap.counterProposalTip}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-16 rounded-3xl pms-glass-panel text-center text-xs text-[var(--pms-muted)]">
                  Select any flagged clause from the left panel to read the risk breakdown, view its location on the PDF, and copy the counter-proposal.
                </div>
              )}
            </div>
          </motion.div>
        )}

        <ToolSEOSection
          toolName="Contract Trap Redliner™"
          headline="Legal Risk, Stamp-Paper OCR & Exact Highlight Redlining"
          description="Audits employment letters, vendor MSAs, and scanned stamp-paper rent agreements across 14+ hidden trap categories, asymmetric notice period imbalances, and missing liability shields — highlighting exact risky paragraphs directly on PDF pages alongside an Executive Risk Summary cover sheet."
          features={[
            { title: 'Digital + Scanned Stamp Paper OCR', desc: 'Automatically detects image/scanned PDFs and runs RapidOCR before auditing clauses.' },
            { title: 'Exact Coordinate PDF Redlining', desc: 'Highlights risky clauses directly on their exact paragraph lines with non-overlapping margin alerts.' },
            { title: 'Notice Asymmetry & Missing Shields', desc: 'Catches unequal termination days (e.g. 90d vs 7d) and missing liability caps/cure periods.' },
            { title: 'Optional Gemini Legal AI Audit', desc: 'Detects disguised semantic traps phrased without obvious legal keywords.' },
          ]}
        />
      </div>
    </ToolWorkspaceShell>
  );
}
