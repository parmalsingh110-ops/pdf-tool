import React, { useState, useRef } from 'react';
import {
  FileWarning,
  ShieldAlert,
  ShieldCheck,
  AlertOctagon,
  Scale,
  Download,
  Upload,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  Info,
  Flame,
  Check,
  Copy,
  BookOpen,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
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
  pageNumber: number;
  whyDangerous: string;
  counterProposalTip: string;
}

const TRAP_PATTERNS = [
  {
    category: 'Unilateral Auto-Renewal & Lock-In',
    severity: 'CRITICAL' as const,
    regex: /(auto[- ]renew|automatically renew|consecutive terms of|prior written notice of at least (30|60|90) days)/i,
    whyDangerous: 'Contract silently locks you in for another full year unless you send notice months in advance.',
    counterProposalTip: 'Propose: "Agreement will transition to month-to-month after initial term, cancelable with 30 days notice."',
  },
  {
    category: 'Unlimited Indemnity & Personal Liability',
    severity: 'CRITICAL' as const,
    regex: /(indemnify|hold harmless|defend, indemnify|unlimited liability|consequential damages)/i,
    whyDangerous: 'You may be personally sued for infinite third-party losses far exceeding your total contract fee.',
    counterProposalTip: 'Add an aggregate liability cap: "Total liability under this agreement shall be strictly capped at fees paid in past 6 months."',
  },
  {
    category: 'Restraint of Trade & Non-Compete Bar',
    severity: 'HIGH' as const,
    regex: /(shall not directly or indirectly (compete|engage|provide services)|competitor for a period of (12|24|36) months|non[- ]compete)/i,
    whyDangerous: 'Bans you from working in your domain or taking similar clients for 1 to 3 years (often void under Section 27 ICA, but weaponized in threats).',
    counterProposalTip: 'Delete non-compete entirely or restrict strictly to direct misuse of proprietary confidential trade secrets.',
  },
  {
    category: 'One-Sided Termination for Convenience',
    severity: 'HIGH' as const,
    regex: /(terminate (at any time|without cause|immediately)|sole discretion terminate)/i,
    whyDangerous: 'The other party can fire or cancel you overnight with zero notice while holding you to strict notice periods.',
    counterProposalTip: 'Make termination rights reciprocal: "Either party may terminate without cause upon 30 days mutual written notice."',
  },
  {
    category: 'Hostile / Distant Exclusive Jurisdiction',
    severity: 'MEDIUM' as const,
    regex: /(exclusive jurisdiction of the courts of (delhi|mumbai|bengaluru|singapore|london|new york|california)|exclusive venue)/i,
    whyDangerous: 'If a dispute arises over ₹20,000, you will be forced to hire lawyers and travel to a court 1,500 km away.',
    counterProposalTip: 'Propose mutual arbitration or jurisdiction in your local district/city courts.',
  },
  {
    category: 'Extreme Penalties & Liquidated Damages',
    severity: 'HIGH' as const,
    regex: /(liquidated damages of|penalty of|interest of (18|24|36)% per annum)/i,
    whyDangerous: 'Imposes punitive delay charges or instant forfeiture of invoices.',
    counterProposalTip: 'Cap late interest to standard commercial rates (e.g. 1% per month) with a 7-day cure grace period.',
  },
  {
    category: 'Comprehensive IP Grab & Moral Rights Waiver',
    severity: 'CRITICAL' as const,
    regex: /(waives all moral rights|irrevocably assigns all rights|work made for hire.*all inventions|prior inventions)/i,
    whyDangerous: 'Claims ownership over your pre-existing tools, templates, and background libraries created before this gig.',
    counterProposalTip: 'Insert a Background IP carve-out protecting your reusable scripts, tools, and past knowledge base.',
  },
  {
    category: 'Unilateral Modification & Silent Terms Change',
    severity: 'MEDIUM' as const,
    regex: /(reserve the right to modify|terms may be updated from time to time|without prior notice)/i,
    whyDangerous: 'Allows the company to change fee structures, SLAs, or responsibilities without your signed consent.',
    counterProposalTip: 'Require: "No modification shall be valid unless executed in writing and signed by both parties."',
  },
];

export default function ContractRedline() {
  useSEO(
    'Contract Trap & Silent Risk Redliner — AI Legal Agreement Analyzer | PDF Media Suite',
    'Scan 50-page employment contracts, rent agreements, and vendor MSAs for hidden penalty clauses, auto-renewals, non-competes, and fine-print traps. Export redline annotated PDFs.'
  );

  usePageSEO(
    'Contract Trap & Silent Risk Redliner — Instant Legal Agreement Auditor',
    'Free online contract risk scanner. Identifies hidden auto-renewal lock-ins, unlimited indemnity traps, unfair non-compete clauses, and distant court jurisdictions before you sign.',
    'contract risk scanner, scan agreement for traps, find hidden clauses in contract, rent agreement trap checker, job offer letter non compete detector',
    '/contract-redline'
  );

  const [file, setFile] = useState<File | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [traps, setTraps] = useState<ContractTrap[]>([]);
  const [dangerScore, setDangerScore] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [rawPdfBytes, setRawPdfBytes] = useState<ArrayBuffer | null>(null);
  const [selectedTrap, setSelectedTrap] = useState<ContractTrap | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf') {
      alert('Please upload a PDF contract or agreement.');
      return;
    }

    setFile(selectedFile);
    setIsAuditing(true);
    setTraps([]);

    try {
      const buffer = await selectedFile.arrayBuffer();
      setRawPdfBytes(buffer);
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
      const discoveredTraps: ContractTrap[] = [];
      let calculatedScore = 0;

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const textContent = await page.getTextContent();
        const fullPageText = textContent.items.map((it: any) => it.str || '').join(' ');

        // Match against 8 high-risk legal clauses
        for (const pattern of TRAP_PATTERNS) {
          const match = fullPageText.match(pattern.regex);
          if (match) {
            const matchIndex = match.index || 0;
            const start = Math.max(0, matchIndex - 60);
            const end = Math.min(fullPageText.length, matchIndex + 160);
            const snippet = fullPageText.slice(start, end).trim();

            discoveredTraps.push({
              id: `trap_${p}_${discoveredTraps.length}`,
              category: pattern.category,
              severity: pattern.severity,
              clauseSnippet: `"...${snippet}..."`,
              pageNumber: p,
              whyDangerous: pattern.whyDangerous,
              counterProposalTip: pattern.counterProposalTip,
            });

            calculatedScore += pattern.severity === 'CRITICAL' ? 25 : pattern.severity === 'HIGH' ? 15 : 10;
          }
        }
      }

      setTraps(discoveredTraps);
      setDangerScore(Math.min(100, calculatedScore));
      if (discoveredTraps.length > 0) {
        setSelectedTrap(discoveredTraps[0]);
      }
    } catch (err: any) {
      console.error(err);
      alert('Failed to audit contract: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsAuditing(false);
    }
  };

  const handleCopyProposal = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // ── Export Redline Annotated PDF ───────────────────────────────────────────
  const handleExportRedlinedPdf = async () => {
    if (!rawPdfBytes || !file) return;

    try {
      const doc = await PDFDocument.load(rawPdfBytes, { ignoreEncryption: true });
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      const fontReg = await doc.embedFont(StandardFonts.Helvetica);

      for (const trap of traps) {
        if (trap.pageNumber <= doc.getPageCount()) {
          const page = doc.getPage(trap.pageNumber - 1);
          const { width, height } = page.getSize();

          // Draw Red Margin Risk Banner on top-right of page
          page.drawRectangle({
            x: width - 260,
            y: height - 42,
            width: 245,
            height: 32,
            color: trap.severity === 'CRITICAL' ? rgb(0.85, 0.15, 0.15) : rgb(0.9, 0.55, 0.1),
            borderWidth: 0,
          });

          page.drawText(cleanWinAnsi(`RISK ALERT: ${trap.category.toUpperCase().slice(0, 24)}`), {
            x: width - 252,
            y: height - 26,
            size: 7.5,
            font,
            color: rgb(1, 1, 1),
          });

          page.drawText('Review Redline Renegotiation Terms Before Signing', {
            x: width - 252,
            y: height - 37,
            size: 6.5,
            font: fontReg,
            color: rgb(1, 1, 1),
          });
        }
      }

      const outBytes = await doc.save();
      const blob = new Blob([outBytes as any], { type: 'application/pdf' });
      downloadBlob(blob, `Redlined_Audit_${file.name.replace(/\.pdf$/i, '')}.pdf`);
    } catch (e) {
      console.error(e);
      alert('Could not export annotated PDF.');
    }
  };

  return (
    <div className="w-full min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-950/80 border border-amber-700/60 text-xs font-bold text-amber-400 mb-2">
              <Scale className="w-4 h-4 text-amber-400" /> Contract &amp; NDA Trap Redliner
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              Contract Trap Redliner™ <span className="text-xs px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 font-mono">Fine-Print Shield</span>
            </h1>
            <p className="mt-1 text-sm text-slate-400 max-w-2xl">
              Audit employment offers, lease agreements, and vendor contracts for hidden auto-renewals, non-compete traps, unlimited indemnity, and one-sided cancellation clauses.
            </p>
          </div>

          {traps.length > 0 && (
            <button
              onClick={handleExportRedlinedPdf}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-bold text-xs shadow-lg shadow-amber-950 transition-all"
            >
              <Download className="w-4 h-4" /> Export Redlined PDF (With Margin Alerts)
            </button>
          )}
        </div>

        {/* Upload State */}
        {!file && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-800 hover:border-amber-500/60 rounded-3xl p-16 text-center bg-slate-900/60 hover:bg-slate-900 cursor-pointer transition-all group"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              accept="application/pdf"
              className="hidden"
            />
            <div className="w-16 h-16 rounded-2xl bg-amber-950/50 border border-amber-800/40 text-amber-400 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <FileWarning className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Upload Agreement, Offer Letter, or Vendor Contract</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mb-4">
              Scans 100% locally in your browser. Confidential contracts are never stored or transmitted to external clouds.
            </p>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold text-slate-200">
              <Upload className="w-3.5 h-3.5" /> Select Legal PDF
            </span>
          </div>
        )}

        {/* Auditing State */}
        {isAuditing && (
          <div className="p-16 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-4">
            <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <h3 className="text-lg font-bold text-white">Scanning Contract for Fine-Print Traps...</h3>
            <p className="text-xs text-slate-400">
              Evaluating indemnity clauses, auto-renewal locks, jurisdiction venues, and non-compete bars.
            </p>
          </div>
        )}

        {/* Risk Results Workspace */}
        {!isAuditing && file && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left 4 Cols: Danger Meter & Traps Feed */}
            <div className="lg:col-span-5 space-y-6">
              {/* Danger Meter */}
              <div
                className={`p-6 rounded-3xl border ${
                  dangerScore >= 50
                    ? 'bg-rose-950/30 border-rose-800/80'
                    : dangerScore >= 20
                    ? 'bg-amber-950/30 border-amber-800/80'
                    : 'bg-emerald-950/30 border-emerald-800/80'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block">
                      Contract Risk Score
                    </span>
                    <h3 className="text-3xl font-black text-white flex items-center gap-2">
                      {dangerScore}/100
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase ${
                          dangerScore >= 50
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                            : dangerScore >= 20
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                            : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        }`}
                      >
                        {dangerScore >= 50 ? 'HIGH DANGER' : dangerScore >= 20 ? 'CAUTION' : 'CLEAN'}
                      </span>
                    </h3>
                  </div>
                  {dangerScore >= 50 ? (
                    <Flame className="w-10 h-10 text-rose-500 animate-bounce" />
                  ) : (
                    <ShieldCheck className="w-10 h-10 text-emerald-400" />
                  )}
                </div>
                <p className="text-xs text-slate-300">
                  {traps.length > 0
                    ? `Detected ${traps.length} high-liability clauses that shift extreme legal or financial burden onto you.`
                    : 'No aggressive auto-renewals, unlimited indemnity, or non-competes detected in this agreement.'}
                </p>
              </div>

              {/* Traps List */}
              <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <AlertOctagon className="w-4 h-4 text-amber-400" /> Redlined Trap Clauses ({traps.length})
                </div>

                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {traps.map((trap) => (
                    <div
                      key={trap.id}
                      onClick={() => setSelectedTrap(trap)}
                      className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                        selectedTrap?.id === trap.id
                          ? 'bg-amber-950/40 border-amber-500 shadow-md shadow-amber-950'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-bold text-xs text-white">{trap.category}</span>
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded-md font-mono font-bold ${
                            trap.severity === 'CRITICAL'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          Page {trap.pageNumber}
                        </span>
                      </div>
                      <p className="text-xs font-serif text-slate-300 italic line-clamp-2">{trap.clauseSnippet}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right 7 Cols: Detailed Trap Deep-Dive & Counter-Proposal Tip */}
            <div className="lg:col-span-7 space-y-4">
              {selectedTrap ? (
                <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-6 shadow-xl">
                  {/* Category Header */}
                  <div className="border-b border-slate-800 pb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase font-mono font-bold text-amber-400 tracking-wider">
                        Risk Category • Page {selectedTrap.pageNumber}
                      </span>
                      <span
                        className={`text-xs px-3 py-1 rounded-full font-bold uppercase ${
                          selectedTrap.severity === 'CRITICAL'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                        }`}
                      >
                        {selectedTrap.severity} LIABILITY
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-white mt-1">{selectedTrap.category}</h2>
                  </div>

                  {/* Flagged Clause Snippet */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                      Exact Contract Clause Found:
                    </span>
                    <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 font-serif text-sm text-amber-200/90 leading-relaxed italic border-l-4 border-l-amber-500">
                      {selectedTrap.clauseSnippet}
                    </div>
                  </div>

                  {/* Why it is dangerous */}
                  <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-800/50 space-y-1">
                    <div className="text-xs font-bold text-rose-400 flex items-center gap-1.5 uppercase tracking-wide">
                      <ShieldAlert className="w-4 h-4" /> Why this clause is dangerous for you:
                    </div>
                    <p className="text-xs text-rose-200/80 leading-relaxed">{selectedTrap.whyDangerous}</p>
                  </div>

                  {/* Recommended Counter-Proposal Language */}
                  <div className="p-5 rounded-2xl bg-cyan-950/30 border border-cyan-800/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-cyan-400 flex items-center gap-1.5 uppercase tracking-wide">
                        <Sparkles className="w-4 h-4" /> Recommended Counter-Proposal Language:
                      </div>
                      <button
                        onClick={() => handleCopyProposal(selectedTrap.counterProposalTip, selectedTrap.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200 text-xs font-bold transition-colors"
                      >
                        {copiedId === selectedTrap.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" /> Copy Clause
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-xs font-mono text-cyan-100 bg-slate-950/80 p-3.5 rounded-xl border border-cyan-900/50">
                      {selectedTrap.counterProposalTip}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      💡 Tip: Email this counter-clause to the employer or vendor before signing to neutralize your legal risk.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-16 rounded-3xl bg-slate-900/40 border border-slate-800 text-center text-xs text-slate-500">
                  Select any detected trap clause from the left list to see why it is dangerous and copy the safe counter-proposal.
                </div>
              )}
            </div>
          </div>
        )}

        <ToolSEOSection
          toolName="Contract Trap Redliner™"
          headline="AI Legal Agreement & Fine-Print Auditor"
          description="Legal contracts and employment offer letters are often drafted with one-sided legal protections favoring the issuer. Contract Trap Redliner scans your PDF agreements in real time for auto-renewal traps, unilateral termination, unlimited indemnity liabilities, and non-compete restraints, offering counter-proposal negotiation clauses to protect your rights before you sign."
          features={[
            { title: '8-Point Fine-Print Scanner', desc: 'Spots auto-renewal lock-ins, unlimited liability, non-compete bars, and distant court venues.' },
            { title: 'Plain-English Risk Explanations', desc: 'Understand exactly how a clause can be weaponized against you without hiring a lawyer.' },
            { title: 'Instant Safe Counter-Clauses', desc: '1-click copy pre-drafted legal counter-proposals to email to your employer or vendor.' },
            { title: 'Export Redlined PDF', desc: 'Stamps high-visibility warning callouts directly onto PDF margins next to the dangerous paragraphs.' },
          ]}
        />
      </div>
    </div>
  );
}
