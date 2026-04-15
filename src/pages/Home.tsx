import { Link } from 'react-router-dom';
import {
  Combine,
  Scissors,
  Minimize2,
  Edit3,
  ArrowRight,
  Sparkles,
  FileText,
  Shield,
  Wand2,
  Ruler,
  ScanText,
  Target,
  Image as ImageIcon,
  ContactRound,
} from 'lucide-react';

const spotlightTools = [
  { title: 'Edit PDF', path: '/edit', desc: 'Editorial control over text, annotations and layout.', icon: Edit3, tone: 'bg-rose-50 text-rose-600' },
  { title: 'Merge PDF', path: '/merge', desc: 'Combine documents with smooth ordering flow.', icon: Combine, tone: 'bg-indigo-50 text-indigo-600' },
  { title: 'Split PDF', path: '/split', desc: 'Slice pages quickly into separate outputs.', icon: Scissors, tone: 'bg-amber-50 text-amber-600' },
  { title: 'Compress PDF', path: '/compress', desc: 'Reduce file size while preserving readability.', icon: Minimize2, tone: 'bg-emerald-50 text-emerald-600' },
  { title: 'Universal Converter', path: '/universal-converter', desc: 'Auto-detect and convert across formats.', icon: Wand2, tone: 'bg-violet-50 text-violet-600' },
  { title: 'Ink Saver PDF', path: '/ink-saver', desc: 'Optimize dark pages for low-ink printing.', icon: Sparkles, tone: 'bg-cyan-50 text-cyan-600' },
];

export default function Home() {
  return (
    <div className="w-full dark:bg-slate-950">
      <section className="relative overflow-hidden min-h-[72vh] px-6 py-20 dark:bg-slate-950">
        <div className="absolute top-[-120px] right-[-120px] w-[420px] h-[420px] bg-rose-200/30 dark:bg-rose-900/20 rounded-full blur-3xl" />
        <div className="absolute bottom-[-140px] left-[-140px] w-[360px] h-[360px] bg-indigo-200/30 dark:bg-indigo-900/20 rounded-full blur-3xl" />
        <div className="relative max-w-7xl mx-auto text-center">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 text-xs font-bold tracking-wider uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            Next-Generation Processing
          </span>
          <h1 className="mt-6 text-5xl md:text-7xl font-extrabold tracking-tight leading-[0.95] text-slate-900 dark:text-white">
            PDF &amp; Media Tools, <span className="text-rose-600 dark:text-rose-400">Reimagined.</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto leading-relaxed">
            A curated gallery of document tools designed for speed, clarity, and premium workflow feel.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/all-tools" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-gradient-to-br from-rose-700 to-rose-500 text-white font-bold hover:shadow-lg transition-all">
              Get Started
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/edit" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              Open Editor
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-20">
        <div className="flex items-end justify-between mb-10">
          <div>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">The Toolset</h2>
            <p className="mt-2 text-slate-600 dark:text-slate-400">High-performance utilities arranged in a modern bento-style gallery.</p>
          </div>
          <Link to="/all-tools" className="hidden md:inline-flex items-center gap-2 text-sm font-bold text-rose-600 dark:text-rose-400">
            Explore all tools <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Link to="/edit" className="lg:col-span-2 lg:row-span-2 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-10 shadow-[0px_20px_40px_rgba(0,0,0,0.05)] hover:-translate-y-1 transition-all group">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-8">
              <Edit3 className="w-7 h-7" />
            </div>
            <h3 className="text-3xl font-extrabold text-slate-900 dark:text-white">Edit PDF</h3>
            <p className="mt-3 text-slate-600 dark:text-slate-300 max-w-md">In-browser layout and markup. For <strong>text inside screenshots</strong> or scans, use{' '}
              <Link to="/image-text-editor" className="text-rose-600 dark:text-rose-400 font-semibold underline-offset-2 hover:underline">
                Image text (OCR)
              </Link>
              .
            </p>
            <span className="mt-10 inline-flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold">Open tool <ArrowRight className="w-4 h-4" /></span>
          </Link>

          {spotlightTools.slice(1).map((tool) => (
            <Link key={tool.title} to={tool.path} className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-7 shadow-[0px_20px_40px_rgba(0,0,0,0.04)] hover:-translate-y-1 transition-all group">
              <div className={`w-12 h-12 rounded-2xl ${tool.tone} dark:opacity-90 flex items-center justify-center mb-6`}>
                <tool.icon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">{tool.title}</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{tool.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white">Image &amp; media</h2>
            <p className="mt-2 text-slate-600 dark:text-slate-400 text-sm max-w-2xl">
              Resize for forms, hit exact pixels, OCR-edit screenshots, remove backgrounds, and convert raster formats.
            </p>
          </div>
          <Link to="/all-tools#cat-media" className="hidden sm:inline-flex text-sm font-bold text-sky-600 dark:text-sky-400">
            Directory <ArrowRight className="w-4 h-4 inline" />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: 'Image resizer', path: '/image-resizer', desc: 'px, cm, mm, %, social & target KB.', icon: Ruler, tone: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' },
            { title: 'Image text (OCR)', path: '/image-text-editor', desc: 'Edit text in screenshots & PDF page 1.', icon: ScanText, tone: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300' },
            { title: 'Pixel resizer', path: '/pixel-resizer', desc: 'Exact width × height in pixels.', icon: ImageIcon, tone: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' },
            { title: 'Remove background', path: '/remove-background', desc: 'Portrait & product cutouts in-browser.', icon: Sparkles, tone: 'bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300' },
            { title: 'Passport photo sheet', path: '/passport-photo-sheet', desc: 'Auto crop, background, and print-ready PDF grid.', icon: ContactRound, tone: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' },
          ].map((t) => (
            <Link key={t.path} to={t.path} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 hover:border-sky-300 dark:hover:border-sky-700 transition-colors">
              <div className={`w-10 h-10 rounded-xl ${t.tone} flex items-center justify-center mb-3`}>
                <t.icon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white">{t.title}</h3>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{t.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-20">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white">Compress tools</h2>
            <p className="mt-2 text-slate-600 dark:text-slate-400 text-sm max-w-2xl">
              Shrink PDFs for email, or aim for a strict kilobyte cap (raster path). See each tool for trade-offs.
            </p>
          </div>
          <Link to="/all-tools#cat-available" className="hidden sm:inline-flex text-sm font-bold text-emerald-600 dark:text-emerald-400">
            Essentials <ArrowRight className="w-4 h-4 inline" />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link to="/compress" className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 flex gap-4 items-start hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <Minimize2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">Compress PDF</h3>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Recommended / extreme raster paths plus metadata-only mode.</p>
            </div>
          </Link>
          <Link to="/target-compress" className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 flex gap-4 items-start hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
            <div className="p-3 rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">Target size PDF</h3>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Aim at or below a KB budget; optional page range before rasterizing.</p>
            </div>
          </Link>
          <Link to="/exact-image-size" className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 flex gap-4 items-start hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
            <div className="p-3 rounded-xl bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <ImageIcon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">Exact image size</h3>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Strict max KB for JPG/WebP with a second pass if still over.</p>
            </div>
          </Link>
        </div>
      </section>

      {/* NEW: ILovePDF Clone Categories */}
      <section className="max-w-7xl mx-auto px-6 pb-20">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white">Convert & Organize</h2>
            <p className="mt-2 text-slate-600 dark:text-slate-400 text-sm max-w-2xl">
              Switch formats instantly. Organize pages, or lock your documents.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { title: 'PDF to Word', path: '/pdf-to-word', tone: 'bg-blue-50 text-blue-600' },
            { title: 'PDF to Excel', path: '/pdf-to-excel', tone: 'bg-green-50 text-green-600' },
            { title: 'PDF to PPT', path: '/pdf-to-ppt', tone: 'bg-orange-50 text-orange-600' },
            { title: 'Word to PDF', path: '/universal-converter', tone: 'bg-blue-50 text-blue-800' },
            { title: 'Excel to PDF', path: '/universal-converter', tone: 'bg-green-50 text-green-800' },
            { title: 'Organize PDF', path: '/organize', tone: 'bg-indigo-50 text-indigo-600' },
            { title: 'Protect PDF', path: '/protect', tone: 'bg-slate-100 text-slate-800' },
            { title: 'Unlock PDF', path: '/unlock', tone: 'bg-slate-100 text-slate-600' },
            { title: 'Watermark', path: '/watermark', tone: 'bg-cyan-50 text-cyan-600' },
            { title: 'Page Numbers', path: '/page-numbers', tone: 'bg-purple-50 text-purple-600' },
            { title: 'PDF to PDF/A', path: '/pdf-a-conversion', tone: 'bg-rose-50 text-rose-600' },
            { title: 'Repair PDF', path: '/universal-converter', tone: 'bg-yellow-50 text-yellow-700' },
          ].map(t => (
            <Link key={t.title} to={t.path} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 hover:-translate-y-1 hover:shadow-md transition-all flex flex-col items-center text-center gap-3">
              <div className={`w-12 h-12 rounded-lg ${t.tone} flex items-center justify-center`}>
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight">{t.title}</h3>
            </Link>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-24">
        <div className="rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800 p-10 md:p-14 text-white">
          <h2 className="text-4xl font-extrabold max-w-2xl leading-tight">
            Ready to transform your workflow?
          </h2>
          <p className="mt-4 text-slate-200 max-w-xl">
            Run conversion, editing, OCR, ink optimization and media workflows from one premium interface.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link to="/all-tools" className="px-6 py-3 rounded-full bg-white text-slate-900 font-bold">View Gallery</Link>
            <Link to="/protect" className="px-6 py-3 rounded-full border border-white/40 text-white font-semibold">Security Tools</Link>
          </div>
          <div className="mt-10 flex gap-6 text-sm text-slate-200">
            <div className="inline-flex items-center gap-2"><FileText className="w-4 h-4" />100+ tools</div>
            <div className="inline-flex items-center gap-2"><Shield className="w-4 h-4" />Local processing</div>
          </div>
        </div>
      </section>
    </div>
  );
}
