import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  FileText,
  Search,
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
  Menu,
  X,
  Star,
  Trash2,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { readRecentTools, recordToolVisit, type RecentEntry } from '../lib/recentFiles';
import { getFavorites, toggleFavorite, type FavoriteItem } from '../lib/favorites';
import KeyboardShortcutsModal from './KeyboardShortcutsModal';
import ErrorBoundary from './ErrorBoundary';
import GlobalSearch from './GlobalSearch';

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
  '/code-to-pdf': 'Code to PDF',
};

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
      { to: '/universal-converter', label: 'Universal Converter', icon: RefreshCw },
      { to: '/screenshot-to-pdf', label: 'Screenshot to PDF', icon: FileText },
      { to: '/code-to-pdf', label: 'Code / HTML to PDF', icon: Code },
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

// Hover-based dropdown (opens on mouse enter, closes on mouse leave with small delay)
function NavDropdown({
  group,
  isOpen,
  onOpen,
  onClose,
  onNavigate,
}: {
  group: NavGroup;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onOpen();
  };

  const handleLeave = () => {
    timerRef.current = setTimeout(() => onClose(), 250);
  };

  return (
    <div
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg font-semibold text-sm transition-all duration-150 select-none ${
          isOpen
            ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40'
            : 'text-slate-700 dark:text-slate-200 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        {group.label}
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180 text-rose-500' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full pt-1 z-[60]">
          <div className="w-64 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl py-2 overflow-hidden">
            {group.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => { onClose(); onNavigate(); }}
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-rose-50 dark:hover:bg-slate-800 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
              >
                <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 shrink-0">
                  <item.icon className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
                </span>
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [favOpen, setFavOpen] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const recentRef = useRef<HTMLDivElement>(null);
  const favRef = useRef<HTMLDivElement>(null);

  // Close mobile menu & dropdowns on route change
  useEffect(() => {
    setMobileOpen(false);
    setOpenDropdown(null);
  }, [location.pathname]);

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
      if (favRef.current && !favRef.current.contains(t)) setFavOpen(false);
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
    // Cmd+K or Ctrl+K → global search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setSearchOpen((o) => !o);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  const toggleDropdown = (label: string) =>
    setOpenDropdown((prev) => (prev === label ? null : label));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col transition-colors">
      <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* ── HEADER ── */}
      <header className="fixed top-0 w-full z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-700/80 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center shrink-0 group-hover:bg-rose-700 transition-colors">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <span className="font-extrabold tracking-tight text-slate-900 dark:text-white text-[15px] hidden sm:block">
              PDF Media Suite
            </span>
            <span className="font-extrabold tracking-tight text-slate-900 dark:text-white text-[15px] sm:hidden">
              PMS
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-0.5 text-sm flex-1 ml-2">
            {NAV_GROUPS.map((g) => (
              <NavDropdown
                key={g.label}
                group={g}
                isOpen={openDropdown === g.label}
                onOpen={() => setOpenDropdown(g.label)}
                onClose={() => setOpenDropdown(null)}
                onNavigate={() => setOpenDropdown(null)}
              />
            ))}
            <Link
              to="/all-tools"
              className="inline-flex items-center py-1.5 px-3 rounded-lg font-semibold text-sm text-slate-700 dark:text-slate-200 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              All Tools
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center py-1.5 px-3 rounded-lg font-semibold text-sm text-slate-700 dark:text-slate-200 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              Pricing
            </Link>
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Recent */}
            <div className="relative hidden md:block" ref={recentRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setRecentOpen((o) => !o);
                  setRecent(readRecentTools());
                }}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
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

            {/* Favorites */}
            <div className="relative hidden md:block" ref={favRef}>
              <button
                type="button"
                title="Favorites (⭐)"
                onClick={(e) => {
                  e.stopPropagation();
                  setFavorites(getFavorites());
                  setFavOpen((o) => !o);
                }}
                className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Star className="w-4 h-4" />
              </button>
              {favOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-xl py-2 z-[60]">
                  <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Favorites</p>
                  {favorites.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-slate-400">
                      No favorites yet. Click ⭐ on any tool in All Tools.
                    </p>
                  ) : (
                    favorites.map((f) => (
                      <div key={f.path} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 group">
                        <Link
                          to={f.path}
                          onClick={() => setFavOpen(false)}
                          className="flex-1 text-sm text-slate-700 dark:text-slate-200 truncate"
                        >
                          {f.title}
                        </Link>
                        <button
                          onClick={() => {
                            toggleFavorite(f);
                            setFavorites(getFavorites());
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all"
                          title="Remove from favorites"
                        >
                          <Trash2 className="w-3 h-3 text-rose-500" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              title="Keyboard shortcuts (?)"
              className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Keyboard className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            {/* Search — opens Cmd+K modal */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              title="Search tools (⌘K)"
              className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Toggle menu"
              className="md:hidden p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* ── MOBILE MENU ── */}
        {mobileOpen && (
          <div className="md:hidden border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 max-h-[80vh] overflow-y-auto shadow-xl">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="border-b border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => toggleDropdown(group.label)}
                  className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-bold text-slate-800 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {group.label}
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${openDropdown === group.label ? 'rotate-180' : ''}`}
                  />
                </button>
                {openDropdown === group.label && (
                  <div className="bg-slate-50 dark:bg-slate-950/50 pb-2">
                    {group.items.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => { setMobileOpen(false); setOpenDropdown(null); }}
                        className="flex items-center gap-3 px-7 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <item.icon className="w-4 h-4 text-rose-500 shrink-0" />
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="p-4 grid grid-cols-2 gap-2">
              {[
                { to: '/all-tools', label: 'All Tools' },
                { to: '/pricing', label: 'Pricing' },
                { to: '/about', label: 'About' },
                { to: '/contact', label: 'Contact' },
              ].map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-semibold text-sm text-slate-700 dark:text-slate-200 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col pt-16">
        <ErrorBoundary locationKey={location.pathname}>
          <Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center min-h-[40vh] text-slate-500 dark:text-slate-400 text-sm font-medium">
                Loading tool…
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* ── FOOTER ── */}
      <footer className="bg-slate-50 dark:bg-slate-900 py-14 border-t border-slate-200/70 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 md:grid-cols-5 gap-10">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-rose-600 flex items-center justify-center">
                <FileText className="w-3.5 h-3.5 text-white" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">PDF Media Suite</h3>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Free online PDF & document tools. Fast, private, browser-based.
            </p>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-slate-900 dark:text-white text-sm">PDF Tools</h4>
            <ul className="space-y-2.5 text-sm text-slate-500 dark:text-slate-400">
              <li><Link to="/merge" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">Merge PDF</Link></li>
              <li><Link to="/split" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">Split PDF</Link></li>
              <li><Link to="/compress" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">Compress PDF</Link></li>
              <li><Link to="/edit" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">Edit PDF</Link></li>
              <li><Link to="/protect" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">Protect PDF</Link></li>
              <li><Link to="/rotate-pages" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">Rotate PDF</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-slate-900 dark:text-white text-sm">Convert</h4>
            <ul className="space-y-2.5 text-sm text-slate-500 dark:text-slate-400">
              <li><Link to="/pdf-to-word" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">PDF to Word</Link></li>
              <li><Link to="/pdf-to-excel" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">PDF to Excel</Link></li>
              <li><Link to="/pdf-to-jpg" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">PDF to JPG</Link></li>
              <li><Link to="/jpg-to-pdf" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">JPG to PDF</Link></li>
              <li><Link to="/pdf-to-images" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">PDF to Images</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-slate-900 dark:text-white text-sm">Image Tools</h4>
            <ul className="space-y-2.5 text-sm text-slate-500 dark:text-slate-400">
              <li><Link to="/image-resizer" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">Image Resizer</Link></li>
              <li><Link to="/image-crop" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">Image Cropper</Link></li>
              <li><Link to="/image-converter" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">Format Converter</Link></li>
              <li><Link to="/remove-background" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">Remove Background</Link></li>
              <li><Link to="/color-extractor" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">Color Extractor</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-slate-900 dark:text-white text-sm">Company</h4>
            <ul className="space-y-2.5 text-sm text-slate-500 dark:text-slate-400">
              <li><Link to="/all-tools" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">All Tools</Link></li>
              <li><Link to="/pricing" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">Pricing</Link></li>
              <li><Link to="/about" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">About</Link></li>
              <li><Link to="/contact" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">Contact</Link></li>
              <li><Link to="/privacy" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">Privacy Policy</Link></li>
              <li><Link to="/terms" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">Terms of Service</Link></li>
            </ul>
          </div>
        </div>

        {/* Founder strip */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold tracking-widest text-rose-600 dark:text-rose-400 uppercase">Founder & Developer</span>
              <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">Parmal Singh Gurjar</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Founded and developed by Parmal Singh Gurjar.</p>
            </div>
            <a
              href="mailto:parmalsingh26@gmail.com"
              className="inline-flex items-center gap-2 text-sm font-semibold text-rose-600 dark:text-rose-400 hover:underline shrink-0"
            >
              parmalsingh26@gmail.com
            </a>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 dark:text-slate-500">
          <span>&copy; {new Date().getFullYear()} PDF Media Suite. All rights reserved.</span>
          <div className="flex gap-5">
            <Link to="/privacy" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">Terms of Service</Link>
            <Link to="/contact" className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
