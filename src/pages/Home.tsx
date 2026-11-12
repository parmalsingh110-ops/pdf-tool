import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  Combine, Scissors, Minimize2, Edit3, ArrowRight, Sparkles, FileText,
  Shield, Wand2, Ruler, ScanText, Target, Image as ImageIcon,
  ContactRound, Zap, BarChart3, ShieldOff, RotateCw, Crop, Palette,
  Presentation, BookOpen, Stamp, Layers2, Lock, Unlock, Droplet, Hash,
  Layers, RefreshCw, Code, ShieldCheck, FileX, MonitorSmartphone,
  Images, Copy, Info, Download, ScanSearch, Clock3, Maximize, Pen,
  ChevronDown, ChevronUp,
  Shuffle, FlipHorizontal, Compass, Trash2, Tag, Bookmark,
  ScanLine, FileCheck, Receipt, BookMarked, Printer, Grid,
  Calculator, Monitor, Scale, GraduationCap, Megaphone,
  ShieldAlert, Maximize2, FileWarning, WifiOff,
} from 'lucide-react';
import { readRecentTools, type RecentEntry } from '../lib/recentFiles';
import { useSEO } from '../hooks/useSEO';


/* =============================================
   TOOL CATEGORIES — ordered by user usefulness
   ============================================= */

const TOOL_GROUPS = [
  {
    title: 'Deep-Tech & Forensics 🔬',
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
      { title: 'Searchable PDF (OCR)', desc: 'Scanned PDF ko searchable banayein.', path: '/searchable-pdf', icon: ScanSearch },
      { title: 'Universal Converter', desc: 'Auto-detect & convert.', path: '/universal-converter', icon: Wand2 },
    ],
  },
  {
    title: 'Image Tools',
    desc: 'Resize, crop, convert, edit, and optimize images — right in your browser.',
    color: 'sky',
    tools: [
      { title: 'Image Resizer', desc: 'Resize in px, cm, mm, %.', path: '/image-resizer', icon: Ruler },
      { title: 'Image Cropper', desc: 'Crop with preset ratios.', path: '/image-crop', icon: Crop },
      { title: 'Pixel Resizer', desc: 'Exact width × height.', path: '/pixel-resizer', icon: ImageIcon },
      { title: 'Format Converter', desc: 'JPG ↔ PNG ↔ WebP.', path: '/image-converter', icon: RefreshCw },
      { title: 'Remove Background', desc: 'AI-powered cutout.', path: '/remove-background', icon: Sparkles },
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
    title: 'Pro & Advanced',
    desc: 'Power tools for professionals — redaction, stamps, booklets, presenters, and more.',
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
    title: 'Compress & Optimize',
    desc: 'Reduce or artificially increase file sizes for email, uploads, and portals.',
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
    title: 'Security & Compliance',
    desc: 'Protect, encrypt, and verify your documents.',
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

const COLOR_MAP: Record<string, { card: string; iconBg: string; iconText: string; btn: string }> = {
  indigo: { card: 'hover:border-indigo-300 dark:hover:border-indigo-700', iconBg: 'bg-indigo-50 dark:bg-indigo-950/40', iconText: 'text-indigo-600 dark:text-indigo-400', btn: 'bg-indigo-600 hover:bg-indigo-700' },
  rose: { card: 'hover:border-rose-300 dark:hover:border-rose-700', iconBg: 'bg-rose-50 dark:bg-rose-950/40', iconText: 'text-rose-600 dark:text-rose-400', btn: 'bg-rose-600 hover:bg-rose-700' },
  blue: { card: 'hover:border-blue-300 dark:hover:border-blue-700', iconBg: 'bg-blue-50 dark:bg-blue-950/40', iconText: 'text-blue-600 dark:text-blue-400', btn: 'bg-blue-600 hover:bg-blue-700' },
  sky: { card: 'hover:border-sky-300 dark:hover:border-sky-700', iconBg: 'bg-sky-50 dark:bg-sky-950/40', iconText: 'text-sky-600 dark:text-sky-400', btn: 'bg-sky-600 hover:bg-sky-700' },
  violet: { card: 'hover:border-violet-300 dark:hover:border-violet-700', iconBg: 'bg-violet-50 dark:bg-violet-950/40', iconText: 'text-violet-600 dark:text-violet-400', btn: 'bg-violet-600 hover:bg-violet-700' },
  emerald: { card: 'hover:border-emerald-300 dark:hover:border-emerald-700', iconBg: 'bg-emerald-50 dark:bg-emerald-950/40', iconText: 'text-emerald-600 dark:text-emerald-400', btn: 'bg-emerald-600 hover:bg-emerald-700' },
  amber: { card: 'hover:border-amber-300 dark:hover:border-amber-700', iconBg: 'bg-amber-50 dark:bg-amber-950/40', iconText: 'text-amber-600 dark:text-amber-400', btn: 'bg-amber-600 hover:bg-amber-700' },
};

export default function Home() {
  useSEO(
    'PDF Media Suite | 100+ Free Online PDF, Image & Document Tools',
    'Free online PDF editor, merger, splitter, compressor, converter, OCR and 100+ productivity tools. Fast, 100% private in browser — no file uploads, no signup required.'
  );

  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setRecent(readRecentTools().filter((r) => r.path !== '/').slice(0, 4));
  }, []);

  const toggleGroup = (title: string) =>
    setExpandedGroups((prev) => ({ ...prev, [title]: !prev[title] }));

  return (
    <div className="w-full dark:bg-slate-950">
      {/* =============== HERO SECTION =============== */}
      <section className="relative overflow-hidden px-6 py-16 md:py-20 dark:bg-slate-950">
        <div className="absolute top-[-120px] right-[-120px] w-[420px] h-[420px] bg-rose-200/30 dark:bg-rose-900/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-140px] left-[-140px] w-[360px] h-[360px] bg-indigo-200/30 dark:bg-indigo-900/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-7xl mx-auto text-center">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 text-xs font-bold tracking-wider uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            100+ Free Online Tools
          </span>
          <h1 className="mt-6 text-5xl md:text-7xl font-extrabold tracking-tight leading-[0.95] text-slate-900 dark:text-white">
            PDF Media Suite
          </h1>
          <p className="mt-6 text-xl text-rose-600 dark:text-rose-400 font-bold max-w-3xl mx-auto">
            Free Online PDF, Document &amp; Image Tools
          </p>
          <p className="mt-4 text-lg md:text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto leading-relaxed">
            PDF Media Suite is a digital-first document productivity platform providing browser-based tools for PDF editing, document conversion, OCR and image/document processing.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/all-tools" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-gradient-to-br from-rose-700 to-rose-500 text-white font-bold hover:shadow-lg transition-all">
              Explore All Tools
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/edit" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              Open PDF Editor
            </Link>
          </div>
        </div>
      </section>

      {recent.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 pb-8">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <Clock3 className="w-4 h-4 text-rose-500" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Welcome back</h2>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              {recent.map((tool) => (
                <Link
                  key={`${tool.path}-${tool.at}`}
                  to={tool.path}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:border-rose-300 dark:hover:border-rose-800 hover:text-rose-600 dark:hover:text-rose-400 transition-colors truncate"
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
        const c = COLOR_MAP[group.color] || COLOR_MAP.rose;
        const isExpanded = Boolean(expandedGroups[group.title]);
        const hasMore = group.tools.length > 5;
        const visibleTools = isExpanded || !hasMore ? group.tools : group.tools.slice(0, 5);
        const hiddenCount = group.tools.length - 5;

        return (
          <section key={group.title} className="max-w-7xl mx-auto px-6 pb-12">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-5">
              <div>
                <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white">{group.title}</h2>
                <p className="mt-1 text-slate-600 dark:text-slate-400 text-xs sm:text-sm max-w-2xl">{group.desc}</p>
              </div>
              {hasMore && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.title)}
                  className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-rose-300 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer shrink-0"
                >
                  {isExpanded ? (
                    <>
                      Show less <ChevronUp className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <>
                      More (+{hiddenCount} tools) <ChevronDown className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {visibleTools.map((tool) => (
                <Link
                  key={tool.path + tool.title}
                  to={tool.path}
                  className={`rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:p-5 ${c.card} hover:-translate-y-1 transition-all group`}
                >
                  <div className={`w-9 h-9 rounded-xl ${c.iconBg} ${c.iconText} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                    <tool.icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm leading-tight">{tool.title}</h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{tool.desc}</p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      {/* =============== HOW IT WORKS (COMPACT) =============== */}
      <section className="max-w-7xl mx-auto px-6 py-12 border-t border-slate-200 dark:border-slate-800">
        <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white text-center mb-8">How it works</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-sm mb-3">1</div>
            <p className="font-semibold text-sm text-slate-900 dark:text-white">Choose a tool</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Pick any PDF, OCR, or image utility.</p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-sm mb-3">2</div>
            <p className="font-semibold text-sm text-slate-900 dark:text-white">Drop your file</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Zero signup or installation needed.</p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-sm mb-3">3</div>
            <p className="font-semibold text-sm text-slate-900 dark:text-white">Edit or convert</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Processed quickly &amp; privately.</p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-sm mb-3">4</div>
            <p className="font-semibold text-sm text-slate-900 dark:text-white">Download result</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Save print-ready output instantly.</p>
          </div>
        </div>
      </section>

      {/* =============== CTA =============== */}
      <section className="max-w-7xl mx-auto px-6 pb-16">
        <div className="rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800 p-8 md:p-12 text-white flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold leading-tight">
              Need a specific document tool?
            </h2>
            <p className="mt-2 text-sm text-slate-200 max-w-xl">
              Explore all 100+ free PDF, OCR, student, and e-Mitra utilities — or read more about our team.
            </p>
            <div className="mt-4 flex flex-wrap gap-5 text-xs text-slate-200">
              <div className="inline-flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />100+ tools</div>
              <div className="inline-flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" />Privacy-first</div>
              <div className="inline-flex items-center gap-1.5"><Download className="w-3.5 h-3.5" />No watermarks</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <Link to="/all-tools" className="px-6 py-3 rounded-full bg-white text-slate-900 text-sm font-bold hover:bg-slate-100 transition-colors">
              View All 100+ Tools
            </Link>
            <Link to="/about" className="px-6 py-3 rounded-full border border-white/40 text-white text-sm font-semibold hover:bg-white/10 transition-colors">
              About &amp; Team
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
