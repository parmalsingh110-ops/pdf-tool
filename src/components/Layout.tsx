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
  '/remove-background': 'Remove background',
  '/passport-photo-sheet': 'Passport photo sheet',
  '/convert-webp': 'Convert to WebP',
  '/convert-tiff': 'Convert to TIFF',
  '/all-tools': 'All tools',
  '/privacy': 'Privacy',
};

const MEDIA_LINKS = [
  { to: '/image-resizer', label: 'Image resizer (px / cm / mm)' },
  { to: '/pixel-resizer', label: 'Pixel resizer' },
  { to: '/exact-image-size', label: 'Exact image size' },
  { to: '/image-text-editor', label: 'Image & text (OCR)' },
  { to: '/remove-background', label: 'Remove background' },
  { to: '/passport-photo-sheet', label: 'Passport photo sheet' },
  { to: '/convert-webp', label: 'Convert to WebP' },
  { to: '/convert-tiff', label: 'Convert to TIFF' },
];

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [mediaOpen, setMediaOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const mediaRef = useRef<HTMLDivElement>(null);
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
      if (mediaRef.current && !mediaRef.current.contains(t)) setMediaOpen(false);
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
            <Link to="/edit" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">
              Edit
            </Link>
            <Link to="/merge" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">
              Merge
            </Link>
            <Link to="/split" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">
              Split
            </Link>
            <Link to="/compress" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">
              Compress
            </Link>
            <div className="relative" ref={mediaRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMediaOpen((o) => !o);
                }}
                className="inline-flex items-center gap-1 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
              >
                Media hub
                <ChevronDown className={`w-4 h-4 transition-transform ${mediaOpen ? 'rotate-180' : ''}`} />
              </button>
              {mediaOpen && (
                <div className="absolute left-0 top-full mt-2 w-56 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-xl py-2 z-[60]">
                  {MEDIA_LINKS.map((l) => (
                    <Link
                      key={l.to}
                      to={l.to}
                      onClick={() => setMediaOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-rose-50 dark:hover:bg-slate-800"
                    >
                      <ImageIcon className="w-4 h-4 text-rose-500 shrink-0" />
                      {l.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <Link to="/target-compress" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">
              Target KB
            </Link>
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">MediaSuite</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Premium kinetic gallery for PDF and media processing workflows.
            </p>
          </div>
          <div>
            <h4 className="font-bold mb-3 text-slate-900 dark:text-white">PDF Tools</h4>
            <ul className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
              <li>
                <Link to="/edit" className="hover:text-rose-600 dark:hover:text-rose-400">
                  Edit PDF
                </Link>
              </li>
              <li>
                <Link to="/merge" className="hover:text-rose-600 dark:hover:text-rose-400">
                  Merge PDF
                </Link>
              </li>
              <li>
                <Link to="/compress" className="hover:text-rose-600 dark:hover:text-rose-400">
                  Compress PDF
                </Link>
              </li>
              <li>
                <Link to="/target-compress" className="hover:text-rose-600 dark:hover:text-rose-400">
                  Target size PDF
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-3 text-slate-900 dark:text-white">Explore</h4>
            <ul className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
              <li>
                <Link to="/all-tools" className="hover:text-rose-600 dark:hover:text-rose-400">
                  All Tools
                </Link>
              </li>
              <li>
                <Link to="/image-text-editor" className="hover:text-rose-600 dark:hover:text-rose-400">
                  Image text (OCR)
                </Link>
              </li>
              <li>
                <Link to="/universal-converter" className="hover:text-rose-600 dark:hover:text-rose-400">
                  Universal Converter
                </Link>
              </li>
              <li>
                <Link to="/ink-saver" className="hover:text-rose-600 dark:hover:text-rose-400">
                  Ink Saver
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-3 text-slate-900 dark:text-white">Legal</h4>
            <ul className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
              <li>
                <Link to="/privacy" className="hover:text-rose-600 dark:hover:text-rose-400">
                  Privacy
                </Link>
              </li>
              <li>Terms</li>
              <li>Support</li>
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
