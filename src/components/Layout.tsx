import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  FileText,
  Search,
  UserCircle2,
  Moon,
  Sun,
  ChevronDown,
  Image as ImageIcon,
  Keyboard,
  Combine,
  Scissors,
  Minimize2,
  Lock,
  Edit3,
  Layers,
  Hash,
  RotateCw,
  ShieldOff,
  Stamp,
  BarChart3,
  RefreshCw,
  ScanSearch,
  Crop,
  Droplet,
  Palette,
  Code,
  ShieldCheck,
  Presentation,
  BookOpen,
  Images,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { readRecentTools, recordToolVisit, type RecentEntry } from '../lib/recentFiles';
import KeyboardShortcutsModal from './KeyboardShortcutsModal';

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Home',
  '/merge': 'Merge PDF',
  '/split': 'Split PDF',
  '/compress': 'Compress PDF',
  '/target-compress': 'Target size PDF',
  '/edit': 'Edit PDF',
  '/image-resizer': 'Image resizer',
  '/pixel-resizer': 'Pixel resizer',
  '/exact-image-size': 'Exact image size',
  '/image-text-editor': 'Image text (OCR)',
  '/searchable-pdf': 'Searchable PDF (OCR)',
  '/remove-background': 'Remove background',
  '/passport-photo-sheet': 'Passport photo sheet',
  '/convert-webp': 'Convert to WebP',
  '/convert-tiff': 'Convert to TIFF',
  '/all-tools': 'All tools',
  '/privacy': 'Privacy',
};

// Navigation mega-menu data  — hover to open
interface NavGroup { label: string; items: { to: string; label: string; icon: any }[]; }

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'PDF Tools',
    items: [
      { to: '/edit', label: 'Edit PDF', icon: Edit3 },
      { to: '/merge', label: 'Merge PDF', icon: Combine },
      { to: '/split', label: 'Split PDF', icon: Scissors },
      { to: '/compress', label: 'Compress PDF', icon: Minimize2 },
      { to: '/organize', label: 'Organize PDF', icon: Layers },
      { to: '/watermark', label: 'Watermark', icon: Droplet },
      { to: '/protect', label: 'Protect PDF', icon: Lock },
      { to: '/searchable-pdf', label: 'Searchable PDF (OCR)', icon: ScanSearch },
      { to: '/page-numbers', label: 'Page Numbers', icon: Hash },
      { to: '/rotate-pages', label: 'Rotate Pages', icon: RotateCw },
      { to: '/reverse', label: 'Reverse PDF', icon: Layers },
    ],
  },
  {
    label: 'Convert',
    items: [
      { to: '/pdf-to-word', label: 'PDF to Word', icon: FileText },
      { to: '/pdf-to-excel', label: 'PDF to Excel', icon: FileText },
      { to: '/pdf-to-ppt', label: 'PDF to PPT', icon: FileText },
      { to: '/pdf-to-jpg', label: 'PDF to JPG', icon: ImageIcon },
      { to: '/jpg-to-pdf', label: 'JPG to PDF', icon: ImageIcon },
      { to: '/pdf-to-images', label: 'PDF to Images (ZIP)', icon: Images },
      { to: '/searchable-pdf', label: 'Searchable PDF (OCR)', icon: ScanSearch },
      { to: '/universal-converter', label: 'Universal Converter', icon: RefreshCw },
      { to: '/screenshot-to-pdf', label: 'Screenshot to PDF', icon: FileText },
    ],
  },
  {
    label: 'Image Tools',
    items: [
      { to: '/image-resizer', label: 'Image Resizer', icon: ImageIcon },
      { to: '/pixel-resizer', label: 'Pixel Resizer', icon: ImageIcon },
      { to: '/image-crop', label: 'Image Cropper', icon: Crop },
      { to: '/image-converter', label: 'Format Converter', icon: RefreshCw },
      { to: '/image-watermark', label: 'Image Watermark', icon: Droplet },
      { to: '/remove-background', label: 'Remove Background', icon: ImageIcon },
      { to: '/color-extractor', label: 'Color Extractor', icon: Palette },
      { to: '/image-to-base64', label: 'Image to Base64', icon: Code },
      { to: '/image-text-editor', label: 'Image Text (OCR)', icon: Edit3 },
      { to: '/searchable-pdf', label: 'Searchable PDF (OCR)', icon: ScanSearch },
    ],
  },
  {
    label: 'Pro Tools',
    items: [
      { to: '/redact', label: 'PDF Redaction', icon: ShieldOff },
      { to: '/stamp', label: 'PDF Stamp', icon: Stamp },
      { to: '/pdf-stats', label: 'PDF Stats', icon: BarChart3 },
      { to: '/booklet', label: 'PDF Booklet', icon: BookOpen },
      { to: '/present', label: 'Slide Presenter', icon: Presentation },
      { to: '/remove-blank-pages', label: 'Blank Page Remover', icon: FileText },
      { to: '/duplicate-pages', label: 'Duplicate Finder', icon: FileText },
      { to: '/extract-pages', label: 'Extract Pages', icon: FileText },
      { to: '/file-hash', label: 'File Hash', icon: ShieldCheck },
    ],
  },
];

function NavDropdown({ group }: { group: NavGroup }) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEnter = () => { if (timerRef.current) clearTimeout(timerRef.current); setOpen(true); };
  const onLeave = () => { timerRef.current = setTimeout(() => setOpen(false), 150); };

  return (
    <div className="relative" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-rose-600 dark:hover:text-rose-400 transition-colors">
        {group.label}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full pt-2 z-[60]">
          <div className="w-64 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl py-2 animate-in fade-in slide-in-from-top-1 duration-200">
            {group.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-rose-50 dark:hover:bg-slate-800 transition-colors"
              >
                <item.icon className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [recentOpen, setRecentOpen] = useState(false);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const recentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const path = location.pathname.replace(/\/$/, '') || '/';
    const title = ROUTE_TITLES[path] || path;
    recordToolVisit(path, title);
    setRecent(readRecentTools());
  }, [location.pathname]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (recentRef.current && !recentRef.current.contains(t)) setRecentOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (el?.closest('input, textarea, select, [contenteditable=true]')) return;
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      e.preventDefault();
      setShortcutsOpen((o) => !o);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col transition-colors">
      <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <header className="fixed top-0 w-full z-50 bg-white/80 dark:bg-slate-900/85 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-700/80 shadow-[0px_20px_40px_rgba(0,0,0,0.06)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2 text-rose-600 hover:text-rose-700 dark:text-rose-400 shrink-0 transition-colors">
            <FileText className="w-7 h-7" />
            <span className="text-xl font-extrabold tracking-tight">MediaSuite</span>
          </Link>
          <nav className="hidden md:flex items-center gap-5 lg:gap-6 text-sm font-semibold text-slate-600 dark:text-slate-300">
            {NAV_GROUPS.map((g) => (
              <NavDropdown key={g.label} group={g} />
            ))}
            <Link to="/all-tools" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">
              All Tools
            </Link>
          </nav>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <div className="relative hidden sm:block" ref={recentRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setRecentOpen((o) => !o);
                  setRecent(readRecentTools());
                }}
                className="px-2 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Recent
              </button>
              {recentOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-xl py-2 z-[60]">
                  {recent.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-500">No recent tools yet.</p>
                  ) : (
                    recent.map((r) => (
                      <Link
                        key={`${r.path}-${r.at}`}
                        to={r.path}
                        onClick={() => setRecentOpen(false)}
                        className="block px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 truncate"
                        title={r.title}
                      >
                        {r.title}
                      </Link>
                    ))
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              title="Shortcuts (?)"
              className="p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Keyboard className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              className="p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => navigate('/all-tools')}
              title="Search tools"
              className="p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              title="Go to home"
              className="p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <UserCircle2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 flex flex-col pt-16">
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center min-h-[40vh] text-slate-500 dark:text-slate-400 text-sm font-medium">
              Loading tool…
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      <footer className="bg-slate-50 dark:bg-slate-900 py-12 border-t border-slate-200/70 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 md:grid-cols-5 gap-8">
          <div className="col-span-2 md:col-span-1">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">MediaSuite</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Free online PDF & image tools. Fast, private, browser-based.
            </p>
          </div>
          <div>
            <h4 className="font-bold mb-3 text-slate-900 dark:text-white">PDF Tools</h4>
            <ul className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
              <li><Link to="/merge" className="hover:text-rose-600 dark:hover:text-rose-400">Merge PDF</Link></li>
              <li><Link to="/split" className="hover:text-rose-600 dark:hover:text-rose-400">Split PDF</Link></li>
              <li><Link to="/compress" className="hover:text-rose-600 dark:hover:text-rose-400">Compress PDF</Link></li>
              <li><Link to="/edit" className="hover:text-rose-600 dark:hover:text-rose-400">Edit PDF</Link></li>
              <li><Link to="/protect" className="hover:text-rose-600 dark:hover:text-rose-400">Protect PDF</Link></li>
              <li><Link to="/rotate-pages" className="hover:text-rose-600 dark:hover:text-rose-400">Rotate PDF</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-3 text-slate-900 dark:text-white">Convert</h4>
            <ul className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
              <li><Link to="/pdf-to-word" className="hover:text-rose-600 dark:hover:text-rose-400">PDF to Word</Link></li>
              <li><Link to="/pdf-to-excel" className="hover:text-rose-600 dark:hover:text-rose-400">PDF to Excel</Link></li>
              <li><Link to="/pdf-to-jpg" className="hover:text-rose-600 dark:hover:text-rose-400">PDF to JPG</Link></li>
              <li><Link to="/jpg-to-pdf" className="hover:text-rose-600 dark:hover:text-rose-400">JPG to PDF</Link></li>
              <li><Link to="/pdf-to-images" className="hover:text-rose-600 dark:hover:text-rose-400">PDF to Images</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-3 text-slate-900 dark:text-white">Image Tools</h4>
            <ul className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
              <li><Link to="/image-resizer" className="hover:text-rose-600 dark:hover:text-rose-400">Image Resizer</Link></li>
              <li><Link to="/image-crop" className="hover:text-rose-600 dark:hover:text-rose-400">Image Cropper</Link></li>
              <li><Link to="/image-converter" className="hover:text-rose-600 dark:hover:text-rose-400">Format Converter</Link></li>
              <li><Link to="/remove-background" className="hover:text-rose-600 dark:hover:text-rose-400">Remove Background</Link></li>
              <li><Link to="/color-extractor" className="hover:text-rose-600 dark:hover:text-rose-400">Color Extractor</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-3 text-slate-900 dark:text-white">More</h4>
            <ul className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
              <li><Link to="/all-tools" className="hover:text-rose-600 dark:hover:text-rose-400">All Tools</Link></li>
              <li><Link to="/redact" className="hover:text-rose-600 dark:hover:text-rose-400">PDF Redaction</Link></li>
              <li><Link to="/stamp" className="hover:text-rose-600 dark:hover:text-rose-400">PDF Stamp</Link></li>
              <li><Link to="/privacy" className="hover:text-rose-600 dark:hover:text-rose-400">Privacy</Link></li>
            </ul>
          </div>
        </div>

        {/* Web architect — compact strip, same visual weight as footer meta / Support */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10">
          <div className="rounded-lg border border-slate-200/70 dark:border-slate-700/80 bg-gradient-to-br from-white/90 via-slate-50/80 to-slate-50/40 dark:from-slate-900/90 dark:via-slate-900/70 dark:to-slate-950/50 px-3.5 py-2.5 sm:px-4 sm:py-3 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:shadow-none">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[10px] font-bold tracking-[0.12em] text-rose-600/85 dark:text-rose-400/90 shrink-0">
                Web architect
              </span>
              <span className="hidden sm:inline text-[10px] text-slate-300 dark:text-slate-600 select-none" aria-hidden>
                ·
              </span>
              <p className="text-xs leading-snug text-slate-600 dark:text-slate-400 min-w-0">
                <span className="font-semibold tracking-tight text-slate-800 dark:text-slate-200">
                  Parmal Singh Gurjar
                </span>
                <span className="text-slate-400 dark:text-slate-500 font-normal"> — </span>
                <span className="text-slate-500 dark:text-slate-400 font-normal">
                  product, build &amp; tooling
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500">
          &copy; {new Date().getFullYear()} MediaSuite. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
