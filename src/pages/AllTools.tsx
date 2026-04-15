import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Combine, Scissors, Minimize2, Image as ImageIcon, FileImage, Layers, 
  Lock, Unlock, Droplet, Hash, Edit3, Target, ImageMinus, Maximize, 
  FileType, Tag, ArrowUpDown, FilePlus, Search, ShieldCheck, FileCode, CheckCircle,
  FileText, Trash2, Contrast, Sparkles, Ruler, ScanText,
  ContactRound, LayoutGrid, QrCode, Pen, ScanLine, GitCompare, Palette, Crop,
  FormInput, BarChart3, BookOpen, Copy, RotateCw, ShieldOff, RefreshCw,
  MonitorSmartphone, Stamp, FileX, Images, Code, Presentation, Layers2,
  Info, Zap,
} from 'lucide-react';

function categoryAnchor(title: string): string {
  if (title.includes('Currently Available')) return 'cat-available';
  if (title.includes('Pro & Advanced')) return 'cat-pro-tools';
  if (title.includes('Advanced Text')) return 'cat-advanced-ocr';
  if (title.includes('Image & Media')) return 'cat-media';
  if (title.includes('Creative & Productivity')) return 'cat-creative';
  if (title.includes('Security & Compliance')) return 'cat-security';
  if (title.includes('Coming Soon')) return 'cat-coming-soon';
  return 'cat-other';
}

const categories = [
  {
    title: "Currently Available Tools",
    tools: [
      { title: 'Merge PDF', path: '/merge', icon: Combine, color: 'text-red-500', bg: 'bg-red-50' },
      { title: 'Split PDF', path: '/split', icon: Scissors, color: 'text-orange-500', bg: 'bg-orange-50' },
      { title: 'Compress PDF', path: '/compress', icon: Minimize2, color: 'text-green-500', bg: 'bg-green-50' },
      { title: 'PDF to JPG', path: '/pdf-to-jpg', icon: ImageIcon, color: 'text-yellow-500', bg: 'bg-yellow-50' },
      { title: 'JPG to PDF', path: '/jpg-to-pdf', icon: FileImage, color: 'text-yellow-500', bg: 'bg-yellow-50' },
      { title: 'Organize PDF', path: '/organize', icon: Layers, color: 'text-blue-500', bg: 'bg-blue-50' },
      { title: 'Protect PDF', path: '/protect', icon: Lock, color: 'text-purple-500', bg: 'bg-purple-50' },
      { title: 'Unlock PDF', path: '/unlock', icon: Unlock, color: 'text-purple-500', bg: 'bg-purple-50' },
      { title: 'Watermark', path: '/watermark', icon: Droplet, color: 'text-cyan-500', bg: 'bg-cyan-50' },
      { title: 'Page Numbers', path: '/page-numbers', icon: Hash, color: 'text-pink-500', bg: 'bg-pink-50' },
      { title: 'Advanced Editor', path: '/edit', icon: Edit3, color: 'text-indigo-500', bg: 'bg-indigo-50' },
      { title: 'Target Compress', path: '/target-compress', icon: Target, color: 'text-emerald-500', bg: 'bg-emerald-50' },
      { title: 'Exact Image Size', path: '/exact-image-size', icon: ImageMinus, color: 'text-teal-500', bg: 'bg-teal-50' },
      { title: 'Pixel Resizer', path: '/pixel-resizer', icon: Maximize, color: 'text-sky-500', bg: 'bg-sky-50' },
      { title: 'Image Resizer (px/cm/mm)', path: '/image-resizer', icon: Ruler, color: 'text-sky-600', bg: 'bg-sky-50' },
      { title: 'Image Text Editor (OCR)', path: '/image-text-editor', icon: ScanText, color: 'text-cyan-600', bg: 'bg-cyan-50' },
      { title: 'Extract Text', path: '/extract-text', icon: FileType, color: 'text-violet-500', bg: 'bg-violet-50' },
      { title: 'Edit Metadata', path: '/edit-metadata', icon: Tag, color: 'text-fuchsia-500', bg: 'bg-fuchsia-50' },
      { title: 'Flatten PDF', path: '/flatten-pdf', icon: Layers, color: 'text-rose-500', bg: 'bg-rose-50' },
      { title: 'Reverse PDF', path: '/reverse', icon: ArrowUpDown, color: 'text-indigo-500', bg: 'bg-indigo-50' },
      { title: 'Add Margins', path: '/add-margins', icon: Maximize, color: 'text-teal-500', bg: 'bg-teal-50' },
    ]
  },
  {
    title: "Advanced Text & OCR",
    tools: [
      { title: 'Search & Replace', path: '/search-replace', icon: Search, color: 'text-blue-500', bg: 'bg-blue-50' },
      { title: 'PDF to Word (.docx)', path: '/pdf-to-word', icon: FileText, color: 'text-blue-700', bg: 'bg-blue-50' },
      { title: 'PDF to Excel (.xlsx)', path: '/pdf-to-excel', icon: FileText, color: 'text-emerald-700', bg: 'bg-emerald-50' },
      { title: 'PDF to PowerPoint', path: '/pdf-to-ppt', icon: FileText, color: 'text-orange-700', bg: 'bg-orange-50' },
      { title: 'Extract Tables to CSV', path: '/extract-tables', icon: FileCode, color: 'text-emerald-500', bg: 'bg-emerald-50' },
      { title: 'Font Extractor', path: '/font-extractor', icon: FileType, color: 'text-indigo-500', bg: 'bg-indigo-50' },
      { title: 'Add Bates Numbering', path: '/bates-numbering', icon: Hash, color: 'text-red-600', bg: 'bg-red-50' },
      { title: 'Add Headers & Footers', path: '/headers-footers', icon: Layers, color: 'text-teal-600', bg: 'bg-teal-50' },
      { title: 'Remove Text', path: '/remove-text', icon: Scissors, color: 'text-red-500', bg: 'bg-red-50' },
      { title: 'Highlight Search Terms', path: '/highlight-text', icon: Search, color: 'text-yellow-500', bg: 'bg-yellow-50' },
    ]
  },
  {
    title: "Image & Media Processing",
    tools: [
      { title: 'Extract All Images', path: '/extract-images', icon: ImageIcon, color: 'text-yellow-600', bg: 'bg-yellow-50' },
      { title: 'PDF to GIF', path: '/pdf-to-gif', icon: ImageIcon, color: 'text-purple-500', bg: 'bg-purple-50' },
      { title: 'Video to PDF', path: '/video-to-pdf', icon: ImageIcon, color: 'text-blue-500', bg: 'bg-blue-50' },
      { title: 'Remove Image Backgrounds', path: '/remove-background', icon: ImageIcon, color: 'text-pink-500', bg: 'bg-pink-50' },
      { title: 'Passport Photo Sheet', path: '/passport-photo-sheet', icon: ContactRound, color: 'text-rose-600', bg: 'bg-rose-50' },
      { title: 'Convert to WebP', path: '/convert-webp', icon: FileImage, color: 'text-emerald-500', bg: 'bg-emerald-50' },
      { title: 'Convert to TIFF', path: '/convert-tiff', icon: FileImage, color: 'text-indigo-500', bg: 'bg-indigo-50' },
      { title: 'Image Text Editor (OCR)', path: '/image-text-editor', icon: ScanText, color: 'text-cyan-600', bg: 'bg-cyan-50' },
      { title: 'Universal Converter', path: '/universal-converter', icon: FileType, color: 'text-indigo-600', bg: 'bg-indigo-50' },
      { title: 'Extract Audio/Video', path: '/extract-media', icon: FileCode, color: 'text-teal-500', bg: 'bg-teal-50' },
      { title: 'Grayscale PDF', path: '/grayscale-pdf', icon: Droplet, color: 'text-gray-500', bg: 'bg-gray-100' },
      { title: 'Invert Colors', path: '/invert-colors', icon: Droplet, color: 'text-zinc-800', bg: 'bg-zinc-100' },
      { title: 'Ink Saver PDF', path: '/ink-saver', icon: Contrast, color: 'text-emerald-600', bg: 'bg-emerald-50' },
      { title: 'Image Color Correction', path: '/image-color-correction', icon: Palette, color: 'text-pink-600', bg: 'bg-pink-50' },
      { title: 'Image Noise Reduction', path: '/image-noise-reduction', icon: Sparkles, color: 'text-violet-500', bg: 'bg-violet-50' },
    ]
  },
  {
    title: "Creative & Productivity Tools",
    tools: [
      { title: 'Image Collage Maker', path: '/image-collage', icon: LayoutGrid, color: 'text-pink-500', bg: 'bg-pink-50' },
      { title: 'QR Code & Barcode', path: '/qr-code', icon: QrCode, color: 'text-indigo-600', bg: 'bg-indigo-50' },
      { title: 'Digital Signature Pad', path: '/signature-pad', icon: Pen, color: 'text-violet-600', bg: 'bg-violet-50' },
      { title: 'Document Scanner', path: '/document-scanner', icon: ScanLine, color: 'text-blue-600', bg: 'bg-blue-50' },
      { title: 'PDF Comparison (Diff)', path: '/pdf-comparison', icon: GitCompare, color: 'text-orange-600', bg: 'bg-orange-50' },
      { title: 'Smart Image to PDF', path: '/smart-image-to-pdf', icon: FileImage, color: 'text-emerald-600', bg: 'bg-emerald-50' },
      { title: 'PDF Form Filler', path: '/pdf-form-filler', icon: FormInput, color: 'text-blue-700', bg: 'bg-blue-50' },
      { title: 'PDF Page Cropper', path: '/pdf-page-cropper', icon: Crop, color: 'text-orange-500', bg: 'bg-orange-50' },
      { title: 'Image Insert & Overlay', path: '/image-insert', icon: ImageIcon, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    ]
  },
  {
    title: "Security & Compliance",
    tools: [
      { title: 'Cryptographic Signatures', path: '/crypto-sign', icon: ShieldCheck, color: 'text-green-500', bg: 'bg-green-50' },
      { title: 'Validate Signatures', path: '/validate-signatures', icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50' },
      { title: 'PDF/A Conversion', path: '/pdf-a-conversion', icon: FileCode, color: 'text-blue-500', bg: 'bg-blue-50' },
      { title: 'Remove All Metadata', path: '/remove-metadata', icon: Trash2, color: 'text-red-500', bg: 'bg-red-50' },
      { title: 'Add DRM', path: '/add-drm', icon: Lock, color: 'text-red-500', bg: 'bg-red-50' },
      { title: 'Invisible Watermarks', path: '/invisible-watermark', icon: Droplet, color: 'text-indigo-500', bg: 'bg-indigo-50' },
      { title: 'Self-Destructing PDF', path: '/self-destruct', icon: ShieldCheck, color: 'text-orange-500', bg: 'bg-orange-50' },
      { title: 'Certify Document', path: '/certify-document', icon: CheckCircle, color: 'text-teal-500', bg: 'bg-teal-50' },
      { title: 'Password Strength Checker', path: '/password-strength', icon: Lock, color: 'text-purple-600', bg: 'bg-purple-100' },
      { title: 'Batch Protect', path: '/batch-protect', icon: Lock, color: 'text-purple-500', bg: 'bg-purple-50' },
    ]
  },
  {
    title: "Pro & Advanced Tools ✨",
    tools: [
      { title: 'PDF Word Counter & Stats', path: '/pdf-stats', icon: BarChart3, color: 'text-indigo-500', bg: 'bg-indigo-50' },
      { title: 'Extract Pages (Visual)', path: '/extract-pages', icon: FileImage, color: 'text-indigo-600', bg: 'bg-indigo-50' },
      { title: 'PDF to Booklet', path: '/booklet', icon: BookOpen, color: 'text-violet-600', bg: 'bg-violet-50' },
      { title: 'Duplicate Page Finder', path: '/duplicate-pages', icon: Copy, color: 'text-red-500', bg: 'bg-red-50' },
      { title: 'Rotate PDF Pages', path: '/rotate-pages', icon: RotateCw, color: 'text-sky-500', bg: 'bg-sky-50' },
      { title: 'PDF Redaction Tool', path: '/redact', icon: ShieldOff, color: 'text-red-600', bg: 'bg-red-50' },
      { title: 'Image Format Converter', path: '/image-converter', icon: RefreshCw, color: 'text-rose-500', bg: 'bg-rose-50' },
      { title: 'Image Watermark', path: '/image-watermark', icon: Droplet, color: 'text-cyan-500', bg: 'bg-cyan-50' },
      { title: 'Image Cropper', path: '/image-crop', icon: Crop, color: 'text-emerald-500', bg: 'bg-emerald-50' },
      { title: 'Image Metadata (EXIF)', path: '/image-metadata', icon: Info, color: 'text-amber-500', bg: 'bg-amber-50' },
      { title: 'Screenshot to PDF', path: '/screenshot-to-pdf', icon: MonitorSmartphone, color: 'text-teal-500', bg: 'bg-teal-50' },
      { title: 'Multi-PDF Page Counter', path: '/page-counter', icon: Hash, color: 'text-purple-500', bg: 'bg-purple-50' },
      { title: 'PDF Stamp Tool', path: '/stamp', icon: Stamp, color: 'text-red-600', bg: 'bg-red-50' },
      { title: 'Blank Page Remover', path: '/remove-blank-pages', icon: FileX, color: 'text-orange-500', bg: 'bg-orange-50' },
      { title: 'PDF to Images (ZIP)', path: '/pdf-to-images', icon: Images, color: 'text-blue-500', bg: 'bg-blue-50' },
      { title: 'Image to Base64', path: '/image-to-base64', icon: Code, color: 'text-violet-500', bg: 'bg-violet-50' },
      { title: 'PDF A/B Overlay', path: '/pdf-overlay', icon: Layers2, color: 'text-indigo-500', bg: 'bg-indigo-50' },
      { title: 'Color Palette Extractor', path: '/color-extractor', icon: Palette, color: 'text-pink-500', bg: 'bg-pink-50' },
      { title: 'PDF Slide Presenter', path: '/present', icon: Presentation, color: 'text-indigo-600', bg: 'bg-indigo-50' },
      { title: 'File Hash Calculator', path: '/file-hash', icon: ShieldCheck, color: 'text-green-600', bg: 'bg-green-50' },
    ]
  },
  {
    title: "AI & NLP Integration (Coming Soon)",
    tools: [
      { title: 'AI PDF Summarizer', icon: FileText },
      { title: 'AI Translator', icon: FileText },
      { title: 'Smart Redaction', icon: ShieldCheck },
      { title: 'Sentiment Analysis', icon: Search },
      { title: 'Auto-Tagging', icon: Tag },
      { title: 'Grammar & Spell Check', icon: CheckCircle },
      { title: 'Invoice Data Extractor', icon: FileCode },
      { title: 'Resume Parser', icon: FileText },
      { title: 'Question Generator', icon: FileText },
      { title: 'Tone Rewriter', icon: Edit3 },
    ]
  }
];

export default function AllTools() {
  const [sortMode, setSortMode] = useState<'most-used' | 'newest' | 'a-z'>('most-used');
  const [query, setQuery] = useState('');

  const quickSections = [
    { id: 'popular', label: 'Popular', icon: Sparkles },
    { id: 'cat-available', label: 'Essentials', icon: Combine },
    { id: 'cat-pro-tools', label: 'Pro Tools', icon: Zap },
    { id: 'cat-advanced-ocr', label: 'OCR & text', icon: ScanText },
    { id: 'cat-media', label: 'Media', icon: ImageIcon },
    { id: 'cat-creative', label: 'Creative', icon: LayoutGrid },
    { id: 'cat-security', label: 'Security', icon: ShieldCheck },
    { id: 'cat-coming-soon', label: 'Coming soon', icon: Sparkles },
  ];

  const sortedCategories = useMemo(() => {
    return categories.map((category) => {
      let tools = [...category.tools];
      if (query.trim()) {
        const q = query.toLowerCase();
        tools = tools.filter((t: any) => t.title.toLowerCase().includes(q));
      }

      if (sortMode === 'a-z') {
        tools.sort((a: any, b: any) => a.title.localeCompare(b.title));
      } else if (sortMode === 'newest') {
        tools = tools.reverse();
      }

      return { ...category, tools };
    });
  }, [sortMode, query]);

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-7xl mx-auto px-6 py-10 flex gap-8">
        <aside className="hidden lg:block w-72 sticky top-24 h-[calc(100vh-110px)] bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 p-6">
          <p className="text-[10px] uppercase tracking-[0.16em] text-rose-600 font-bold">Directory</p>
          <div className="mt-5 flex flex-col gap-2">
            {quickSections.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </a>
            ))}
          </div>

          <div className="mt-8 p-5 rounded-2xl bg-gradient-to-br from-rose-700 to-rose-500 text-white">
            <p className="text-xs opacity-90">Upgrade to</p>
            <h4 className="text-lg font-bold mt-1">MediaSuite Pro</h4>
            <button className="mt-4 px-4 py-2 rounded-full bg-white text-rose-700 text-xs font-bold">Unlock All</button>
          </div>
        </aside>

        <div className="flex-1">
          <header className="mb-12">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white">All Tools</h1>
            <p className="mt-3 text-lg text-slate-600 dark:text-slate-400 max-w-2xl">
              Curated collection of high-performance PDF and media processing utilities.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="inline-flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full p-1 text-xs font-bold">
                <button
                  onClick={() => setSortMode('most-used')}
                  className={`px-5 py-2 rounded-full ${sortMode === 'most-used' ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  Most Used
                </button>
                <button
                  onClick={() => setSortMode('newest')}
                  className={`px-5 py-2 rounded-full ${sortMode === 'newest' ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  Newest
                </button>
                <button
                  onClick={() => setSortMode('a-z')}
                  className={`px-5 py-2 rounded-full ${sortMode === 'a-z' ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  A-Z
                </button>
              </div>
              <input
                type="text"
                placeholder="Search tools..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-200 dark:text-slate-100"
              />
            </div>
          </header>

          <section id="popular" className="mb-16">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Popular Artifacts</h2>
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              <Link to="/merge" className="md:col-span-8 rounded-3xl bg-white border border-slate-200 p-8 shadow-[0px_20px_40px_rgba(0,0,0,0.04)] hover:-translate-y-1 transition-all">
                <span className="inline-flex text-xs px-3 py-1 rounded-full bg-rose-50 text-rose-700 font-bold">Essential</span>
                <h3 className="mt-5 text-2xl font-extrabold text-slate-900">Omni-Merge Pro</h3>
                <p className="mt-2 text-slate-600 text-sm">Combine PDFs with smooth ordering and high-fidelity outputs.</p>
              </Link>
              <Link to="/compress" className="md:col-span-4 rounded-3xl bg-white border border-slate-200 p-8 shadow-[0px_20px_40px_rgba(0,0,0,0.04)] hover:-translate-y-1 transition-all">
                <h3 className="text-xl font-bold text-slate-900">Ultra-Shrink</h3>
                <p className="mt-2 text-slate-600 text-sm">Reduce size while preserving readability.</p>
              </Link>
            </div>
          </section>

          <div className="space-y-16">
            {sortedCategories.map((category, catIdx) => (
              <section key={catIdx} id={categoryAnchor(category.title)}>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 pb-2 border-b border-slate-200 dark:border-slate-700">
                  {category.title}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                  {category.tools.map((tool: any, idx) => {
                    const isAvailable = !!tool.path;
                    const cardContent = (
                      <>
                        <div className={`w-10 h-10 rounded-xl ${tool.bg || 'bg-slate-100'} ${tool.color || 'text-slate-400'} flex items-center justify-center mb-3`}>
                          <tool.icon className="w-5 h-5" />
                        </div>
                        <h3 className={`font-semibold text-sm ${isAvailable ? 'text-slate-900 dark:text-slate-100 group-hover:text-rose-600 dark:group-hover:text-rose-400' : 'text-slate-500 dark:text-slate-500'}`}>
                          {tool.title}
                        </h3>
                        {!isAvailable && (
                          <span className="inline-block mt-2 text-[10px] uppercase tracking-wider font-bold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/60 border border-violet-200 dark:border-violet-800 px-2 py-1 rounded-md">
                            Coming soon
                          </span>
                        )}
                      </>
                    );

                    if (isAvailable) {
                      return (
                        <Link
                          key={idx}
                          to={tool.path}
                          className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-rose-200 dark:hover:border-rose-800 hover:shadow-md transition-all group"
                        >
                          {cardContent}
                        </Link>
                      );
                    }

                    return (
                      <div key={idx} className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 opacity-80 cursor-not-allowed">
                        {cardContent}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
