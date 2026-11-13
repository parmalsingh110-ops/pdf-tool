import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Combine, Scissors, Minimize2, Edit3, ArrowRight, Sparkles, FileText,
  Shield, Wand2, Ruler, ScanText, Target, Image as ImageIcon,
  ContactRound, Zap, BarChart3, ShieldOff, RotateCw, Crop, Palette,
  Presentation, BookOpen, Stamp, Layers2, Lock, Unlock, Droplet, Hash,
  Layers, RefreshCw, Code, ShieldCheck, FileX, MonitorSmartphone,
  Images, Copy, Info, Download, ScanSearch, Clock3, Maximize, Pen,
  ChevronDown, ChevronUp, CheckCircle2,
  Shuffle, FlipHorizontal, Compass, Trash2, Tag, Bookmark,
  ScanLine, FileCheck, Receipt, BookMarked, Printer, Grid,
  Calculator, Monitor, Scale, GraduationCap, Megaphone,
  ShieldAlert, Maximize2, FileWarning, WifiOff, Cpu, GlobeLock,
} from 'lucide-react';
import { readRecentTools, type RecentEntry } from '../lib/recentFiles';
import { useSEO } from '../hooks/useSEO';
import { VERIFIED_TOOL_COUNT } from '../components/GlobalSearch';
import PearlAuroraBackground from '../components/pearl/PearlAuroraBackground';
import HeroDocumentStage from '../components/pearl/HeroDocumentStage';
import HeroQuickSearch from '../components/pearl/HeroQuickSearch';
import PearlToolCard, { type PearlAccentTone } from '../components/pearl/PearlToolCard';
import WorkflowShowcase from '../components/pearl/WorkflowShowcase';

/* =============================================
   TOOL CATEGORIES — ordered by user usefulness
   ============================================= */

interface ToolDef {
  title: string;
  desc: string;
  path: string;
  icon: typeof FileText;
  badge?: string;
}

interface ToolGroup {
  id: string;
  title: string;
  desc: string;
  color: PearlAccentTone;
  tools: ToolDef[];
}

const TOOL_GROUPS: ToolGroup[] = [
  {
    id: 'deep-tech',
    title: 'Deep-Tech & Forensics',
    desc: 'AI PDF forgery inspector, infinite vector blueprint restorer, fine-print contract redliner, and zero-egress airgap cleaner.',
    color: 'indigo',
    tools: [
      { title: 'DocForensics™', desc: 'AI PDF forgery, whiteout layer & tamper inspector.', path: '/doc-forensics', icon: ShieldAlert },
      { title: 'TrueVector 4K™', desc: 'Reconstruct 72 DPI scans into infinite Bezier vector curves.', path: '/true-vector-4k', icon: Maximize2 },
      { title: 'Contract Trap Redliner™', desc: 'Detect fine-print traps with safe counter-clauses.', path: '/contract-redline', icon: FileWarning },
      { title: 'Airgap Cleanroom™', desc: 'Strip tracking beacons, canary tokens & zero-width leakers.', path: '/airgap-cleanroom', icon: WifiOff },
    ],
  },
  {
    id: 'pdf-tools',
    title: 'Most Popular PDF Tools',
    desc: 'The essentials — merge, compress, edit, scan to print, and passport photo sheets.',
    color: 'rose',
    tools: [
      { title: 'Scan to Print QR', desc: 'Beam mobile files to PC queue without WhatsApp.', path: '/scan-to-print', icon: Printer },
      { title: 'Passport Photo Sheet', desc: 'Print-ready photo grid on A4 & 4x6.', path: '/passport-photo-sheet', icon: ContactRound },
      { title: 'Merge PDF', desc: 'Combine PDFs with Clickable TOC Index & A4 Normalizer.', path: '/merge', icon: Combine, badge: 'Smart TOC' },
      { title: 'Compress PDF', desc: 'Reduce file size instantly.', path: '/compress', icon: Minimize2 },
      { title: 'Edit PDF', desc: 'Annotate, edit text & layout.', path: '/edit', icon: Edit3 },
      { title: 'Alternate & Mix', desc: 'Mix odd & even duplex scanned pages.', path: '/alternate-mix', icon: Shuffle },
      { title: 'Split PDF', desc: 'Split by size (<2MB Govt), invoice keyword, or ranges.', path: '/split', icon: Scissors, badge: 'By Size & Word' },
      { title: 'Split in Half', desc: 'Cut 2-page book scans down the center.', path: '/split-in-half', icon: Scissors },
      { title: 'Flip PDF', desc: 'Mirror pages for T-shirt transfers & scans.', path: '/flip', icon: FlipHorizontal },
      { title: 'Remove Annotations', desc: 'Batch strip highlights, comments & stamps.', path: '/remove-annotations', icon: Trash2 },
      { title: 'Deskew PDF', desc: 'Auto-straighten crooked scanned pages.', path: '/deskew', icon: Compass },
      { title: 'Rename by Content', desc: 'Auto-rename PDFs from invoice/page text.', path: '/rename-pdf', icon: Tag },
      { title: 'Create Bookmarks', desc: 'Add Table of Contents outline bookmarks.', path: '/create-bookmarks', icon: Bookmark },
      { title: 'Protect PDF', desc: 'Add password encryption.', path: '/protect', icon: Lock },
      { title: 'Unlock PDF', desc: 'Auto password helper for Aadhaar, Bank & Tax.', path: '/unlock', icon: Unlock },
      { title: 'Watermark', desc: 'Add text watermarks to PDF.', path: '/watermark', icon: Droplet },
      { title: 'Page Numbers', desc: 'Add page numbers to PDF.', path: '/page-numbers', icon: Hash },
      { title: 'Organize PDF', desc: 'Reorder & delete pages.', path: '/organize', icon: Layers },
      { title: 'Rotate Pages', desc: 'Rotate individual pages.', path: '/rotate-pages', icon: RotateCw },
    ],
  },
  {
    id: 'convert',
    title: 'Convert PDF',
    desc: 'Convert PDFs to Word, Excel, PowerPoint, JPG, and more — or the other way around.',
    color: 'blue',
    tools: [
      { title: 'PDF to Word', desc: 'Convert PDF to editable DOCX.', path: '/pdf-to-word', icon: FileText },
      { title: 'PDF to Excel', desc: 'Extract tables to XLSX.', path: '/pdf-to-excel', icon: FileText },
      { title: 'PDF to PowerPoint', desc: 'PDF slides to PPTX.', path: '/pdf-to-ppt', icon: FileText },
      { title: 'PDF to JPG', desc: 'Each page as an image.', path: '/pdf-to-jpg', icon: ImageIcon },
      { title: 'JPG to PDF', desc: 'Images into a PDF.', path: '/jpg-to-pdf', icon: ImageIcon },
      { title: 'PDF to Images (ZIP)', desc: 'All pages in a ZIP file.', path: '/pdf-to-images', icon: Images },
      { title: 'Screenshot to PDF', desc: 'Screenshots into clean PDF.', path: '/screenshot-to-pdf', icon: MonitorSmartphone },
      { title: 'Searchable PDF (OCR)', desc: 'Make scanned PDFs selectable & searchable.', path: '/searchable-pdf', icon: ScanSearch },
      { title: 'Universal Converter', desc: 'Auto-detect & convert.', path: '/universal-converter', icon: Wand2 },
    ],
  },
  {
    id: 'image-tools',
    title: 'Image Tools',
    desc: 'Resize, crop, convert, edit, and optimize images — right in your browser.',
    color: 'sky',
    tools: [
      { title: 'Image Resizer', desc: 'Resize in px, cm, mm, %.', path: '/image-resizer', icon: Ruler },
      { title: 'Image Cropper', desc: 'Crop with preset ratios.', path: '/image-crop', icon: Crop },
      { title: 'Pixel Resizer', desc: 'Exact width × height.', path: '/pixel-resizer', icon: ImageIcon },
      { title: 'Format Converter', desc: 'JPG ↔ PNG ↔ WebP.', path: '/image-converter', icon: RefreshCw },
      { title: 'Remove Background', desc: 'AI-powered transparent cutout.', path: '/remove-background', icon: Sparkles },
      { title: 'Image Watermark', desc: 'Add text watermarks.', path: '/image-watermark', icon: Droplet },
      { title: 'Image Text (OCR)', desc: 'Edit text in images.', path: '/image-text-editor', icon: ScanText },
      { title: 'Passport Photo', desc: 'Print-ready photo grid.', path: '/passport-photo-sheet', icon: ContactRound },
      { title: 'Sarkari Photo & Sign', desc: 'Name & DOP photo joiner for exams.', path: '/sarkari-photo-signature', icon: ContactRound },
      { title: 'Clean Signature', desc: 'Phone photo to transparent or pure white sign.', path: '/clean-signature', icon: Sparkles },
      { title: 'Exact Image Size', desc: 'Strict KB file size.', path: '/exact-image-size', icon: Target },
      { title: 'Color Extractor', desc: 'Get HEX/RGB palette.', path: '/color-extractor', icon: Palette },
    ],
  },
  {
    id: 'pro-tools',
    title: 'Pro & Advanced',
    desc: 'Power tools for professionals — redaction, stamps, booklets, presenters, and print workflows.',
    color: 'violet',
    tools: [
      { title: 'PDF Redaction', desc: 'Permanently black out text.', path: '/redact', icon: ShieldOff },
      { title: 'PDF Stamp', desc: 'DRAFT / CONFIDENTIAL marks.', path: '/stamp', icon: Stamp },
      { title: 'PDF Stats', desc: 'Word count, reading time.', path: '/pdf-stats', icon: BarChart3 },
      { title: 'PDF Booklet', desc: 'Fold & print layout.', path: '/booklet', icon: BookOpen },
      { title: 'Slide Presenter', desc: 'Fullscreen PDF slides.', path: '/present', icon: Presentation },
      { title: 'Extract Pages', desc: 'Pick pages visually.', path: '/extract-pages', icon: FileText },
      { title: 'Blank Remover', desc: 'Remove empty pages.', path: '/remove-blank-pages', icon: FileX },
      { title: 'Duplicate Finder', desc: 'Find & remove duplicates.', path: '/duplicate-pages', icon: Copy },
      { title: 'PDF Overlay', desc: 'Layer two PDFs.', path: '/pdf-overlay', icon: Layers2 },
      { title: 'Masked Aadhaar', desc: 'Hide first 8 digits (XXXX-XXXX-1234).', path: '/masked-aadhaar', icon: ShieldCheck },
      { title: 'e-Aadhaar to PVC Card', desc: 'CR80 standard A4 & 4x6 print sheet.', path: '/pvc-card-maker', icon: ScanLine },
      { title: 'E-Stamp Margin Aligner', desc: 'Rajasthan, UP, Delhi legal agreement margin.', path: '/stamp-paper-aligner', icon: FileCheck },
      { title: 'Ultra Xerox Cleaner', desc: 'Turn mobile photos to pure white photocopy.', path: '/xerox-cleaner', icon: Sparkles },
      { title: 'Assignment Cover Page', desc: 'University front page with auto-merge.', path: '/assignment-cover-page', icon: BookOpen },
      { title: 'Lecture Slides Handouts', desc: '3 slides with note lines, save 75% paper.', path: '/slide-handouts', icon: Presentation },
      { title: 'Thesis Binding Margin', desc: 'Gutter margin for spiral & book binding.', path: '/binding-margin', icon: BookMarked },
      { title: 'Expense Bills 4-in-1', desc: 'Combine petrol slips with summary table.', path: '/bill-consolidator', icon: Receipt },
      { title: 'Digital Rubber Stamp', desc: 'Custom round seal (Gol Mohar) & transparent PNG.', path: '/rubber-stamp', icon: Stamp },
      { title: 'Batch Self-Attest', desc: 'Sign & self-attest all pages in 1-click.', path: '/self-attest', icon: Pen },
      { title: 'Scan to Print QR', desc: 'Beam mobile files to PC queue without WhatsApp.', path: '/scan-to-print', icon: Printer },
      { title: 'Gang-Print Sheet', desc: 'Combine 2-8 customer ID cards onto A4/4x6.', path: '/gang-print-sheet', icon: Layers },
      { title: 'Land Record Darkener', desc: 'Darken faint Bhu-Naksha & Jamabandi lines.', path: '/land-record-darkener', icon: FileCheck },
      { title: 'Micro-Pocket Notes', desc: '4-in-1, 8-in-1 pocket booklets with cut marks.', path: '/micro-pocket-notes', icon: BookOpen },
      { title: 'Lab Journal Formatter', desc: 'Left graph paper, right ruled line sheet.', path: '/lab-journal-formatter', icon: Grid },
      { title: 'Board Notes Cleaner', desc: 'De-glare whiteboard & invert chalk to black ink.', path: '/board-notes-cleaner', icon: Sparkles },
      { title: 'Resume 1-Page Compactor', desc: 'Fit 2-page CV strictly into 1 page.', path: '/resume-compactor', icon: FileText },
      { title: 'Project Report Header Swapper', desc: 'Mask senior headers, stamp your college info.', path: '/report-header-swapper', icon: BookMarked },
      { title: 'Print Cost & UPI QR', desc: 'Auto count B&W/Color pages & create exact UPI QR bill.', path: '/print-cost-calculator', icon: Calculator },
      { title: 'Zero-Trace Print Tunnel', desc: 'Print confidential salary/bank slips in RAM with zero disk trace.', path: '/zero-trace-print', icon: ShieldCheck },
      { title: 'Counter Print Kiosk', desc: 'Customer self-order terminal with digital token queue.', path: '/counter-kiosk', icon: Monitor },
      { title: 'Talking Notes Audio QR', desc: 'Embed teacher voice explanation QR codes directly on notes.', path: '/talking-notes', icon: Zap },
      { title: 'Admit Card 1-Page + GPS QR', desc: '1-page hall ticket with Google Maps exam center GPS QR.', path: '/admit-card-optimizer', icon: GraduationCap },
      { title: 'Court Evidence Formatter', desc: 'WhatsApp chat to legal petition annexure with 65B certificate.', path: '/court-evidence-formatter', icon: Scale },
      { title: 'Smart KYC OCR Slip', desc: '1-click copy Aadhaar/PAN details & print receipt slip.', path: '/smart-kyc-slip', icon: ScanLine },
      { title: 'Pamphlet & Flyer Maker', desc: '4-in-1 mass photocopy flyer layout on single A4 sheet.', path: '/pamphlet-maker', icon: Megaphone },
      { title: 'Exam Bundle PDF', desc: 'All documents in single PDF under 1 MB.', path: '/exam-document-merger', icon: Layers2 },
      { title: 'Handwriting PDF', desc: 'Convert text to real handwritten notes.', path: '/handwriting-pdf', icon: Pen },
      { title: 'File Hash', desc: 'SHA-256 verify integrity.', path: '/file-hash', icon: ShieldCheck },
    ],
  },
  {
    id: 'optimize',
    title: 'Compress & Optimize',
    desc: 'Reduce or target exact KB/MB file sizes for portals, email, and print.',
    color: 'emerald',
    tools: [
      { title: 'Compress PDF', desc: 'Smart compression.', path: '/compress', icon: Minimize2 },
      { title: 'Increase PDF Size', desc: 'Inflate file size.', path: '/increase-size', icon: Maximize },
      { title: 'Target Size PDF', desc: 'Aim for exact KB.', path: '/target-compress', icon: Target },
      { title: 'Ink Saver PDF', desc: 'Optimize for printing.', path: '/ink-saver', icon: Sparkles },
      { title: 'Grayscale PDF', desc: 'Convert to B&W.', path: '/grayscale-pdf', icon: Droplet },
      { title: 'Image to Base64', desc: 'Embed in HTML/CSS.', path: '/image-to-base64', icon: Code },
      { title: 'Image Metadata', desc: 'Read EXIF data.', path: '/image-metadata', icon: Info },
    ],
  },
  {
    id: 'security',
    title: 'Security & Compliance',
    desc: 'Protect, encrypt, redact, and verify your documents.',
    color: 'amber',
    tools: [
      { title: 'Protect PDF', desc: 'Password protection.', path: '/protect', icon: Lock },
      { title: 'Unlock PDF', desc: 'Remove passwords.', path: '/unlock', icon: Unlock },
      { title: 'Remove Watermark', desc: 'Clean background and CamScanner tags.', path: '/remove-watermark', icon: FileX },
      { title: 'PDF Redaction', desc: 'Permanent data removal.', path: '/redact', icon: ShieldOff },
      { title: 'Remove Metadata', desc: 'Strip hidden data.', path: '/remove-metadata', icon: FileText },
      { title: 'File Hash', desc: 'SHA verification.', path: '/file-hash', icon: ShieldCheck },
      { title: 'Flatten PDF', desc: 'Remove form fields.', path: '/flatten-pdf', icon: Layers },
    ],
  },
];

const CATEGORY_DECK = [
  {
    label: 'PDF Tools',
    sub: 'Merge, split, edit, rotate & compress PDFs',
    target: '#pdf-tools',
    bg: 'var(--pms-soft-rose)',
    accent: 'var(--pms-rose)',
    icon: Combine,
  },
  {
    label: 'Convert',
    sub: 'PDF ↔ Word, Excel, PPT, JPG & OCR',
    target: '#convert',
    bg: 'var(--pms-soft-blue)',
    accent: 'var(--pms-blue)',
    icon: RefreshCw,
  },
  {
    label: 'Image Tools',
    sub: 'Resize, crop, background cutout & sign cleaner',
    target: '#image-tools',
    bg: 'var(--pms-soft-lavender)',
    accent: 'var(--pms-violet)',
    icon: ImageIcon,
  },
  {
    label: 'Pro Tools',
    sub: 'Forensics, vector restore, print & KYC suites',
    target: '#pro-tools',
    bg: 'var(--pms-soft-mint)',
    accent: '#047857',
    icon: ShieldAlert,
  },
];

export default function Home() {
  useSEO(
    `PDF Media Suite | ${VERIFIED_TOOL_COUNT}+ Free Online PDF, Image & Document Tools`,
    `Free online PDF editor, merger, splitter, compressor, converter, OCR and ${VERIFIED_TOOL_COUNT}+ productivity tools. Fast, browser-first & privacy-respecting — no signup required.`
  );

  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    setRecent(readRecentTools().filter((r) => r.path !== '/').slice(0, 4));
  }, []);

  const toggleGroup = (title: string) =>
    setExpandedGroups((prev) => ({ ...prev, [title]: !prev[title] }));

  return (
    <div
      className="relative w-full overflow-x-clip transition-colors"
      style={{ backgroundColor: 'var(--pms-pearl)', color: 'var(--pms-ink)' }}
    >
      <PearlAuroraBackground mode="home" />

      <div className="relative z-10">
        {/* =============== HERO SECTION =============== */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-14 md:pt-16 md:pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
            {/* Left Editorial Column */}
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="lg:col-span-6 text-left"
            >
              <span
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wider uppercase border"
                style={{
                  backgroundColor: 'var(--pms-soft-rose)',
                  color: 'var(--pms-rose)',
                  borderColor: 'var(--pms-border)',
                }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                {VERIFIED_TOOL_COUNT}+ Verified Online Tools
              </span>

              <h1
                className="mt-5 text-4xl sm:text-5xl xl:text-6xl font-extrabold tracking-tight leading-[1.03]"
                style={{ color: 'var(--pms-ink)' }}
              >
                <span className="pms-gradient-accent">PDF Media Suite</span>
              </h1>

              <p
                className="mt-3 text-lg sm:text-xl font-bold tracking-tight"
                style={{ color: 'var(--pms-rose)' }}
              >
                Free Online PDF, Document &amp; Image Tools
              </p>

              <p
                className="mt-3.5 text-base sm:text-[17px] leading-relaxed max-w-xl"
                style={{ color: 'var(--pms-muted)' }}
              >
                A unified document productivity platform with browser-native WebAssembly editing, multi-script OCR, smart Office conversions, and instant print workflows.
              </p>

              {/* Inline Search */}
              <div className="mt-6">
                <HeroQuickSearch />
              </div>

              {/* Primary + Secondary CTAs */}
              <div className="mt-7 flex flex-col sm:flex-row gap-3.5">
                <Link
                  to="/all-tools"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full font-bold text-sm sm:text-base pms-btn-primary"
                >
                  Explore All Tools
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/edit"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full border font-bold text-sm sm:text-base transition-colors hover:border-rose-300 dark:hover:border-rose-700"
                  style={{
                    backgroundColor: 'var(--pms-white)',
                    borderColor: 'var(--pms-border-strong)',
                    color: 'var(--pms-ink)',
                    boxShadow: 'var(--pms-shadow-sm)',
                  }}
                >
                  <Edit3 className="w-4 h-4 text-[var(--pms-violet)]" />
                  Open PDF Editor
                </Link>
              </div>

              {/* Verified Benefits Row */}
              <div
                className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold"
                style={{ color: 'var(--pms-muted)' }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Browser-first tools
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#0284C7]" />
                  Zero watermarks
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#7C3AED]" />
                  No signup required
                </span>
              </div>
            </motion.div>

            {/* Right 2.5D Document Atelier Stage */}
            <div className="lg:col-span-6">
              <HeroDocumentStage />
            </div>
          </div>
        </section>

        {/* =============== CATEGORY DISCOVERY DECK =============== */}
        <section aria-label="Tool category shortcuts" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4"
          >
            {CATEGORY_DECK.map((cat) => (
              <motion.a
                key={cat.label}
                href={cat.target}
                whileHover={prefersReduced ? undefined : { y: -3 }}
                transition={{ type: 'spring', stiffness: 400, damping: 26 }}
                className="group rounded-2xl border p-4 transition-colors duration-200 hover:border-rose-300 dark:hover:border-rose-700"
                style={{
                  backgroundColor: 'var(--pms-white)',
                  borderColor: 'var(--pms-border)',
                  boxShadow: 'var(--pms-shadow-sm)',
                }}
              >
                <span
                  className="w-9 h-9 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-105"
                  style={{ backgroundColor: cat.bg, color: cat.accent }}
                >
                  <cat.icon className="w-4 h-4" />
                </span>
                <p className="text-sm font-bold" style={{ color: 'var(--pms-ink)' }}>{cat.label}</p>
                <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--pms-muted)' }}>{cat.sub}</p>
              </motion.a>
            ))}
            <Link
              to="/all-tools"
              className="col-span-2 md:col-span-1 group rounded-2xl border p-4 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5"
              style={{
                backgroundColor: 'var(--pms-lavender-surface)',
                borderColor: 'var(--pms-border-strong)',
                boxShadow: 'var(--pms-shadow-sm)',
              }}
            >
              <span
                className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                style={{ backgroundColor: 'var(--pms-white)', color: 'var(--pms-rose)' }}
              >
                <Layers className="w-4 h-4" />
              </span>
              <div>
                <p className="text-sm font-bold flex items-center justify-between" style={{ color: 'var(--pms-ink)' }}>
                  All {VERIFIED_TOOL_COUNT}+ Tools
                  <ArrowRight className="w-4 h-4 text-[var(--pms-rose)] transition-transform group-hover:translate-x-0.5" />
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--pms-muted)' }}>Browse complete directory</p>
              </div>
            </Link>
          </motion.div>
        </section>

        {/* =============== WELCOME BACK / RECENT TOOLS =============== */}
        {recent.length > 0 && (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
            <div
              className="rounded-2xl border p-4 sm:p-5"
              style={{
                backgroundColor: 'var(--pms-white)',
                borderColor: 'var(--pms-border)',
                boxShadow: 'var(--pms-shadow-sm)',
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Clock3 className="w-4 h-4 text-[var(--pms-rose)]" />
                <h2 className="text-sm font-bold" style={{ color: 'var(--pms-ink)' }}>Welcome back</h2>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                {recent.map((tool) => (
                  <Link
                    key={`${tool.path}-${tool.at}`}
                    to={tool.path}
                    className="rounded-xl border px-3 py-2 text-sm font-medium hover:border-rose-300 dark:hover:border-rose-700 hover:text-[var(--pms-rose)] transition-colors truncate"
                    style={{
                      backgroundColor: 'var(--pms-pearl)',
                      borderColor: 'var(--pms-border)',
                      color: 'var(--pms-ink)',
                    }}
                    title={tool.title}
                  >
                    {tool.title}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* =============== TOOL CATEGORIES (5 visible + More toggle per category) =============== */}
        {TOOL_GROUPS.map((group) => {
          const isExpanded = Boolean(expandedGroups[group.title]);
          const hasMore = group.tools.length > 5;
          const visibleTools = isExpanded || !hasMore ? group.tools : group.tools.slice(0, 5);
          const hiddenCount = group.tools.length - 5;

          return (
            <section
              key={group.id}
              id={group.id}
              className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 scroll-mt-20"
            >
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-5">
                <div>
                  <h2 className="text-xl md:text-2xl font-extrabold tracking-tight" style={{ color: 'var(--pms-ink)' }}>
                    {group.title}
                  </h2>
                  <p className="mt-1 text-xs sm:text-sm max-w-2xl" style={{ color: 'var(--pms-muted)' }}>
                    {group.desc}
                  </p>
                </div>
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.title)}
                    className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border hover:border-rose-300 dark:hover:border-rose-700 transition-colors cursor-pointer shrink-0"
                    style={{
                      backgroundColor: 'var(--pms-white)',
                      borderColor: 'var(--pms-border-strong)',
                      color: 'var(--pms-ink)',
                    }}
                  >
                    {isExpanded ? (
                      <>
                        Show less <ChevronUp className="w-3.5 h-3.5 text-[var(--pms-rose)]" />
                      </>
                    ) : (
                      <>
                        More (+{hiddenCount} tools) <ChevronDown className="w-3.5 h-3.5 text-[var(--pms-rose)]" />
                      </>
                    )}
                  </button>
                )}
              </div>

              <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <AnimatePresence initial={false}>
                  {visibleTools.map((tool, i) => (
                    <motion.div
                      key={tool.path + tool.title}
                      initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={prefersReduced ? undefined : { opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.22, delay: Math.min(i * 0.025, 0.2) }}
                    >
                      <PearlToolCard
                        title={tool.title}
                        desc={tool.desc}
                        path={tool.path}
                        icon={tool.icon}
                        badge={tool.badge}
                        tone={group.color}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            </section>
          );
        })}

        {/* =============== SCROLL-LINKED WORKFLOW SHOWCASE =============== */}
        <WorkflowShowcase />

        {/* =============== ARCHITECTURE & HOW IT WORKS =============== */}
        <section
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t"
          style={{ borderColor: 'var(--pms-border)' }}
        >
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight" style={{ color: 'var(--pms-ink)' }}>
              Built for speed, privacy, and crisp print fidelity
            </h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--pms-muted)' }}>
              Four straightforward steps from file drop to finished export — with honest client-first execution.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-10">
            {[
              { n: '01', title: 'Choose a tool', desc: 'Pick any PDF, OCR, or image utility.' },
              { n: '02', title: 'Drop your file', desc: 'Zero signup or software install needed.' },
              { n: '03', title: 'Edit or convert', desc: 'Processed via Wasm or ephemeral server engines.' },
              { n: '04', title: 'Download clean output', desc: 'Save print-ready files with zero watermarks.' },
            ].map((step, idx) => (
              <motion.div
                key={step.n}
                initial={prefersReduced ? false : { opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.34, delay: idx * 0.06, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-2xl border p-5 text-center"
                style={{
                  backgroundColor: 'var(--pms-white)',
                  borderColor: 'var(--pms-border)',
                  boxShadow: 'var(--pms-shadow-sm)',
                }}
              >
                <div
                  className="w-10 h-10 mx-auto rounded-xl flex items-center justify-center font-extrabold text-xs mb-3"
                  style={{ backgroundColor: 'var(--pms-soft-lavender)', color: 'var(--pms-violet)' }}
                >
                  {step.n}
                </div>
                <p className="font-bold text-sm" style={{ color: 'var(--pms-ink)' }}>{step.title}</p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--pms-muted)' }}>{step.desc}</p>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              className="rounded-2xl border p-5 flex items-start gap-3.5"
              style={{ backgroundColor: 'var(--pms-white)', borderColor: 'var(--pms-border)' }}
            >
              <span
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--pms-soft-mint)', color: '#047857' }}
              >
                <Cpu className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--pms-ink)' }}>Browser-First Wasm Core</h3>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--pms-muted)' }}>
                  Merge, split, watermark, redact, and image tools run inside your browser tab memory with zero uploads.
                </p>
              </div>
            </div>

            <div
              className="rounded-2xl border p-5 flex items-start gap-3.5"
              style={{ backgroundColor: 'var(--pms-white)', borderColor: 'var(--pms-border)' }}
            >
              <span
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--pms-soft-blue)', color: 'var(--pms-blue)' }}
              >
                <GlobeLock className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--pms-ink)' }}>Ephemeral Server Engines</h3>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--pms-muted)' }}>
                  Heavy Office/OCR conversions stream ephemerally and wipe automatically without document retention.
                </p>
              </div>
            </div>

            <div
              className="rounded-2xl border p-5 flex items-start gap-3.5"
              style={{ backgroundColor: 'var(--pms-white)', borderColor: 'var(--pms-border)' }}
            >
              <span
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--pms-soft-rose)', color: 'var(--pms-rose)' }}
              >
                <Shield className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--pms-ink)' }}>Shared PC Safe</h3>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--pms-muted)' }}>
                  Use “Clear Traces” in the footer anytime to wipe recent history, favorites, and local queue state.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* =============== FINAL PEARL CTA BANNER =============== */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div
            className="rounded-[2rem] border p-8 md:p-12 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6"
            style={{
              backgroundColor: 'var(--pms-white)',
              borderColor: 'var(--pms-border-strong)',
              boxShadow: 'var(--pms-shadow-card)',
            }}
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(50% 90% at 8% 50%, var(--pms-soft-rose) 0%, transparent 65%), radial-gradient(50% 90% at 92% 50%, var(--pms-soft-lavender) 0%, transparent 65%)',
              }}
            />
            <div className="relative z-10">
              <h2 className="text-2xl md:text-3xl font-extrabold leading-tight" style={{ color: 'var(--pms-ink)' }}>
                Ready to simplify your next document task?
              </h2>
              <p className="mt-2 text-sm max-w-xl" style={{ color: 'var(--pms-muted)' }}>
                Explore all {VERIFIED_TOOL_COUNT}+ free PDF, OCR, student, and office utilities — or learn more about our platform.
              </p>
              <div className="mt-4 flex flex-wrap gap-5 text-xs font-semibold" style={{ color: 'var(--pms-muted)' }}>
                <div className="inline-flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-[var(--pms-rose)]" />
                  {VERIFIED_TOOL_COUNT}+ tools
                </div>
                <div className="inline-flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-[var(--pms-violet)]" />
                  Privacy-first
                </div>
                <div className="inline-flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-[var(--pms-blue)]" />
                  No watermarks
                </div>
              </div>
            </div>
            <div className="relative z-10 flex flex-wrap gap-3 shrink-0">
              <Link
                to="/all-tools"
                className="px-6 py-3 rounded-full text-sm font-bold pms-btn-primary"
              >
                View All {VERIFIED_TOOL_COUNT}+ Tools
              </Link>
              <Link
                to="/about"
                className="px-6 py-3 rounded-full border text-sm font-semibold transition-colors hover:border-rose-300"
                style={{
                  backgroundColor: 'var(--pms-pearl)',
                  borderColor: 'var(--pms-border-strong)',
                  color: 'var(--pms-ink)',
                }}
              >
                About &amp; Team
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
