import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  Combine, Scissors, Minimize2, Edit3, ArrowRight, Sparkles, FileText,
  Shield, Wand2, Ruler, ScanText, Target, Image as ImageIcon,
  ContactRound, Zap, BarChart3, ShieldOff, RotateCw, Crop, Palette,
  Presentation, BookOpen, Stamp, Layers2, Lock, Unlock, Droplet, Hash,
  Layers, RefreshCw, Code, ShieldCheck, FileX, MonitorSmartphone,
  Images, Copy, Info, Download, ScanSearch, Clock3, Maximize,
} from 'lucide-react';
import { readRecentTools, type RecentEntry } from '../lib/recentFiles';
import { usePageSEO } from '../lib/usePageSEO';


/* =============================================
   TOOL CATEGORIES — ordered by user usefulness
   ============================================= */

const TOOL_GROUPS = [
  {
    title: 'Most Popular PDF Tools',
    desc: 'The essentials — merge, split, compress, edit, and protect your PDFs.',
    color: 'rose',
    tools: [
      { title: 'Merge PDF', desc: 'Combine multiple PDFs into one.', path: '/merge', icon: Combine },
      { title: 'Split PDF', desc: 'Separate PDF into pages.', path: '/split', icon: Scissors },
      { title: 'Compress PDF', desc: 'Reduce file size instantly.', path: '/compress', icon: Minimize2 },
      { title: 'Edit PDF', desc: 'Annotate, edit text & layout.', path: '/edit', icon: Edit3 },
      { title: 'Protect PDF', desc: 'Add password encryption.', path: '/protect', icon: Lock },
      { title: 'Unlock PDF', desc: 'Remove PDF password.', path: '/unlock', icon: Unlock },
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
  rose: { card: 'hover:border-rose-300 dark:hover:border-rose-700', iconBg: 'bg-rose-50 dark:bg-rose-950/40', iconText: 'text-rose-600 dark:text-rose-400', btn: 'bg-rose-600 hover:bg-rose-700' },
  blue: { card: 'hover:border-blue-300 dark:hover:border-blue-700', iconBg: 'bg-blue-50 dark:bg-blue-950/40', iconText: 'text-blue-600 dark:text-blue-400', btn: 'bg-blue-600 hover:bg-blue-700' },
  sky: { card: 'hover:border-sky-300 dark:hover:border-sky-700', iconBg: 'bg-sky-50 dark:bg-sky-950/40', iconText: 'text-sky-600 dark:text-sky-400', btn: 'bg-sky-600 hover:bg-sky-700' },
  violet: { card: 'hover:border-violet-300 dark:hover:border-violet-700', iconBg: 'bg-violet-50 dark:bg-violet-950/40', iconText: 'text-violet-600 dark:text-violet-400', btn: 'bg-violet-600 hover:bg-violet-700' },
  emerald: { card: 'hover:border-emerald-300 dark:hover:border-emerald-700', iconBg: 'bg-emerald-50 dark:bg-emerald-950/40', iconText: 'text-emerald-600 dark:text-emerald-400', btn: 'bg-emerald-600 hover:bg-emerald-700' },
  amber: { card: 'hover:border-amber-300 dark:hover:border-amber-700', iconBg: 'bg-amber-50 dark:bg-amber-950/40', iconText: 'text-amber-600 dark:text-amber-400', btn: 'bg-amber-600 hover:bg-amber-700' },
};

export default function Home() {
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  // Set canonical for homepage
  usePageSEO(
    'PDF Media Suite — Free Online PDF & Image Tools',
    'Free online PDF editor, merger, splitter, compressor, image resizer, background remover, and 90+ tools. Fast, private, browser-based. No uploads required.',
    undefined,
    '/'
  );
  // Dynamic SEO
  useEffect(() => {
    document.title = 'PDF Media Suite | Free Online PDF & Document Tools';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', 'PDF Media Suite is a browser-based document productivity platform providing PDF editing, conversion, OCR and image tools.');
    // Add JSON-LD structured data
    const existing = document.querySelector('#mediasuite-jsonld');
    if (!existing) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.id = 'mediasuite-jsonld';
      script.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'PDF Media Suite',
        url: window.location.origin,
        description: 'PDF Media Suite is a browser-based document productivity platform providing PDF editing, conversion, OCR and image tools.',
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        featureList: 'PDF Merge, PDF Split, PDF Compress, PDF to Word, PDF to Excel, PDF to JPG, Image Resize, Image Crop, Background Removal, PDF Redaction, PDF Stamp, OCR',
      });
      document.head.appendChild(script);
    }
    return () => { const el = document.querySelector('#mediasuite-jsonld'); if (el) el.remove(); };
  }, []);

  useEffect(() => {
    setRecent(readRecentTools().filter((r) => r.path !== '/').slice(0, 4));
  }, []);

  return (
    <div className="w-full dark:bg-slate-950">
      {/* =============== HERO SECTION =============== */}
      <section className="relative overflow-hidden min-h-[68vh] px-6 py-20 dark:bg-slate-950">
        <div className="absolute top-[-120px] right-[-120px] w-[420px] h-[420px] bg-rose-200/30 dark:bg-rose-900/20 rounded-full blur-3xl" />
        <div className="absolute bottom-[-140px] left-[-140px] w-[360px] h-[360px] bg-indigo-200/30 dark:bg-indigo-900/20 rounded-full blur-3xl" />
        <div className="relative max-w-7xl mx-auto text-center">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 text-xs font-bold tracking-wider uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            85+ Free Online Tools
          </span>
          <h1 className="mt-6 text-5xl md:text-7xl font-extrabold tracking-tight leading-[0.95] text-slate-900 dark:text-white">
            PDF Media Suite
          </h1>
          <p className="mt-6 text-xl text-rose-600 dark:text-rose-400 font-bold max-w-3xl mx-auto">
            Free Online PDF, Document & Image Tools
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
        <section className="max-w-7xl mx-auto px-6 pb-12">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock3 className="w-4 h-4 text-rose-500" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Welcome back</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
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

      {/* =============== WHAT IS IT? / PROBLEM & SOLUTION =============== */}
      <section className="max-w-7xl mx-auto px-6 pb-16 pt-8">
        <div className="grid md:grid-cols-2 gap-12">
          <div className="p-8 rounded-3xl bg-slate-100 dark:bg-slate-900/50">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">The Problem</h2>
            <p className="text-slate-600 dark:text-slate-400">
              Working with PDF and digital documents often requires multiple separate tools for editing, conversion, OCR, compression and document processing. Finding a reliable, privacy-respecting tool for each task is frustrating and inefficient.
            </p>
          </div>
          <div className="p-8 rounded-3xl bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/50">
            <h2 className="text-2xl font-bold text-rose-700 dark:text-rose-300 mb-4">Our Solution</h2>
            <p className="text-rose-900/80 dark:text-rose-200">
              PDF Media Suite brings common PDF, document and image workflows together in a single browser-based software platform. Everything you need is accessible in one place without requiring local software installation.
            </p>
          </div>
        </div>
      </section>

      {/* =============== HOW IT WORKS =============== */}
      <section className="max-w-7xl mx-auto px-6 pb-20">
        <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white text-center mb-10">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-lg mb-4">1</div>
            <p className="font-semibold text-slate-900 dark:text-white">Choose a tool</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Select a document or image tool from our suite.</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-lg mb-4">2</div>
            <p className="font-semibold text-slate-900 dark:text-white">Select your file</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Upload or drop your document into the web application.</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-lg mb-4">3</div>
            <p className="font-semibold text-slate-900 dark:text-white">Process</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Process the document directly in the browser.</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-lg mb-4">4</div>
            <p className="font-semibold text-slate-900 dark:text-white">Download</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Download or continue working with the result.</p>
          </div>
        </div>
      </section>

      {/* =============== WORKING PRODUCT / FEATURES =============== */}
      <div className="max-w-7xl mx-auto px-6 mb-12">
        <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white text-center">Product Features</h2>
        <p className="mt-4 text-center text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          PDF Media Suite is a working browser-based document productivity application with tools for PDF editing, conversion, OCR and image processing. Users can access the available tools directly through the web application below.
        </p>
      </div>
      {TOOL_GROUPS.map((group) => {
        const c = COLOR_MAP[group.color] || COLOR_MAP.rose;
        return (
          <section key={group.title} className="max-w-7xl mx-auto px-6 pb-16">
            <div className="mb-8">
              <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white">{group.title}</h2>
              <p className="mt-2 text-slate-600 dark:text-slate-400 text-sm max-w-3xl">{group.desc}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {group.tools.map((tool) => (
                <Link
                  key={tool.path + tool.title}
                  to={tool.path}
                  className={`rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 ${c.card} hover:-translate-y-1 transition-all group`}
                >
                  <div className={`w-10 h-10 rounded-xl ${c.iconBg} ${c.iconText} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                    <tool.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm leading-tight">{tool.title}</h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{tool.desc}</p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      <section className="max-w-7xl mx-auto px-6 py-20 border-t border-slate-200 dark:border-slate-800">
        <div className="grid md:grid-cols-2 gap-16">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Target Users</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              PDF Media Suite is designed for people who regularly need to edit, convert, process or extract information from digital documents. Our primary users include:
            </p>
            <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-400">
              <li>Students</li>
              <li>Educators</li>
              <li>Professionals</li>
              <li>Freelancers</li>
              <li>Small businesses</li>
              <li>Document-heavy teams</li>
              <li>Individuals working with PDFs and digital documents</li>
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Technology</h2>
            <p className="text-slate-600 dark:text-slate-400">
              PDF Media Suite is built as a web-based software platform with a modern web frontend and Python-based backend document processing. Technologies include React, TypeScript, Python, FastAPI, and browser-based processing to ensure speed and privacy where possible.
            </p>
          </div>
        </div>
      </section>

      {/* =============== BUSINESS MODEL & PRICING =============== */}
      <section className="max-w-7xl mx-auto px-6 pb-20">
        <div className="p-10 rounded-3xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Business Model</h2>
              <p className="text-slate-600 dark:text-slate-400 mb-4">
                PDF Media Suite is a digital-first software product delivered through the web. The platform is designed to provide document and PDF processing capabilities directly through a browser rather than through consulting or custom development services.
              </p>
              <p className="text-slate-600 dark:text-slate-400">
                As the product grows, the platform may introduce optional premium capabilities or usage-based features to support continued development and infrastructure costs.
              </p>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Pricing</h2>
              <p className="text-slate-600 dark:text-slate-400 mb-4">
                PDF Media Suite currently provides its core PDF, document and image tools <strong>free of charge</strong>.
              </p>
              <p className="text-slate-600 dark:text-slate-400">
                Reasonable usage limits may apply to certain tools to protect service availability.
              </p>
              <div className="mt-6">
                <Link to="/pricing" className="text-rose-600 dark:text-rose-400 font-semibold hover:underline">Read more about pricing &rarr;</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =============== ABOUT & CONTACT =============== */}
      <section className="max-w-7xl mx-auto px-6 pb-24">
        <div className="grid md:grid-cols-2 gap-12">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">About PDF Media Suite</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              PDF Media Suite is an independent, founder-led software project focused on making practical PDF and document productivity tools accessible through the web.
            </p>
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 mb-6">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Founder & Developer</h3>
              <p className="text-xl font-bold text-slate-900 dark:text-white">Parmal Singh Gurjar</p>
            </div>
            <Link to="/about" className="text-rose-600 dark:text-rose-400 font-semibold hover:underline">View Vision & Roadmap &rarr;</Link>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Contact & Support</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              For product support, feedback, bug reports or business enquiries, contact:
            </p>
            <div className="p-6 rounded-2xl bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/50">
              <a href="mailto:parmalsingh26@gmail.com" className="text-lg font-bold text-rose-700 dark:text-rose-300 hover:underline">
                parmalsingh26@gmail.com
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* =============== CTA =============== */}
      <section className="max-w-7xl mx-auto px-6 pb-24">
        <div className="rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800 p-10 md:p-14 text-white">
          <h2 className="text-4xl font-extrabold max-w-2xl leading-tight">
            Ready to try the product?
          </h2>
          <p className="mt-4 text-slate-200 max-w-xl">
            Access our free browser-based suite of document productivity tools right now.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link to="/all-tools" className="px-6 py-3 rounded-full bg-white text-slate-900 font-bold">View All 85+ Tools</Link>
            <Link to="/protect" className="px-6 py-3 rounded-full border border-white/40 text-white font-semibold">Security Tools</Link>
          </div>
          <div className="mt-10 flex gap-6 text-sm text-slate-200">
            <div className="inline-flex items-center gap-2"><FileText className="w-4 h-4" />85+ tools</div>
            <div className="inline-flex items-center gap-2"><Shield className="w-4 h-4" />100% private</div>
            <div className="inline-flex items-center gap-2"><Download className="w-4 h-4" />No uploads</div>
          </div>
        </div>
      </section>
    </div>
  );
}
