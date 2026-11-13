import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring } from 'motion/react';
import {
  FileText,
  Search,
  Moon,
  Sun,
  ChevronDown,
  ChevronUp,
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
  Unlock,
  ContactRound,
  Pen,
  ShieldAlert,
  Maximize2,
  FileWarning,
  WifiOff,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { readRecentTools, recordToolVisit, type RecentEntry } from '../lib/recentFiles';
import { getFavorites, toggleFavorite, type FavoriteItem } from '../lib/favorites';
import { wipeAllBrowserTraces } from '../lib/privacy';
import KeyboardShortcutsModal from './KeyboardShortcutsModal';
import ErrorBoundary from './ErrorBoundary';
import GlobalSearch, { VERIFIED_TOOL_COUNT } from './GlobalSearch';
import ToolFeedback from './ToolFeedback';
import BrandLogo from './BrandLogo';
import { PearlRouteSkeleton } from './pearl/PearlMotion';

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
  '/sarkari-photo-signature': 'Sarkari Photo & Sign',
  '/clean-signature': 'Clean Signature',
  '/masked-aadhaar': 'Masked Aadhaar',
  '/exam-document-merger': 'Exam Bundle Merger',
  '/split-in-half': 'Split in Half',
  '/alternate-mix': 'Alternate & Mix',
  '/flip': 'Flip PDF (Mirror)',
  '/flip-pdf': 'Flip PDF (Mirror)',
  '/remove-annotations': 'Remove Annotations',
  '/deskew': 'Deskew PDF',
  '/rename-pdf': 'Rename PDF',
  '/create-bookmarks': 'Create Bookmarks',
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
      { to: '/unlock', label: 'Unlock PDF (Auto Helper)', icon: Unlock },
      { to: '/exam-document-merger', label: 'Exam Bundle (<1 MB)', icon: Combine },
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
      { to: '/sarkari-photo-signature', label: 'Sarkari Photo & Sign', icon: ContactRound },
      { to: '/clean-signature', label: 'Clean Paper Sign', icon: Pen },
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
      { to: '/doc-forensics', label: 'DocForensics™ (AI)', icon: ShieldAlert },
      { to: '/true-vector-4k', label: 'TrueVector 4K™', icon: Maximize2 },
      { to: '/contract-redline', label: 'Contract Redliner™', icon: FileWarning },
      { to: '/airgap-cleanroom', label: 'Airgap Cleanroom™', icon: WifiOff },
      { to: '/redact', label: 'PDF Redaction', icon: ShieldOff },
      { to: '/masked-aadhaar', label: 'Masked Aadhaar (XXXX)', icon: ShieldCheck },
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
            ? 'text-[var(--pms-rose)] bg-[var(--pms-soft-rose)]'
            : 'text-[var(--pms-ink)] hover:text-[var(--pms-rose)] hover:bg-[var(--pms-lavender-surface)]'
        }`}
      >
        {group.label}
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180 text-[var(--pms-rose)]' : ''}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 top-full pt-1.5 z-[60]"
          >
            <div
              className="w-64 rounded-2xl border overflow-hidden flex flex-col"
              style={{
                backgroundColor: 'var(--pms-white)',
                borderColor: 'var(--pms-border-strong)',
                boxShadow: 'var(--pms-shadow-float)',
              }}
            >
              <div className="max-h-[62vh] overflow-y-auto py-2">
                {group.items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => { onClose(); onNavigate(); }}
                    className="flex items-center gap-3 px-4 py-2 text-sm font-medium text-[var(--pms-ink)] hover:bg-[var(--pms-lavender-surface)] hover:text-[var(--pms-rose)] transition-colors"
                  >
                    <span
                      className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
                      style={{ backgroundColor: 'var(--pms-soft-rose)', color: 'var(--pms-rose)' }}
                    >
                      <item.icon className="w-3.5 h-3.5" />
                    </span>
                    {item.label}
                  </Link>
                ))}
              </div>
              <Link
                to="/all-tools"
                onClick={() => { onClose(); onNavigate(); }}
                className="block px-4 py-2.5 text-xs font-bold border-t transition-colors hover:opacity-90"
                style={{
                  backgroundColor: 'var(--pms-lavender-surface)',
                  borderColor: 'var(--pms-border)',
                  color: 'var(--pms-rose)',
                }}
              >
                View All {VERIFIED_TOOL_COUNT}+ Tools &rarr;
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const FOOTER_PDF_TOOLS = [
  { to: '/merge', label: 'Merge PDF' },
  { to: '/split', label: 'Split PDF' },
  { to: '/compress', label: 'Compress PDF' },
  { to: '/edit', label: 'Edit PDF' },
  { to: '/protect', label: 'Protect PDF' },
  { to: '/increase-size', label: 'Increase PDF Size' },
  { to: '/rotate-pages', label: 'Rotate PDF' },
  { to: '/id-card-joiner', label: 'ID Card Joiner' },
  { to: '/pvc-card-maker', label: 'PVC Card Maker' },
  { to: '/stamp-paper-aligner', label: 'E-Stamp Aligner' },
  { to: '/assignment-cover-page', label: 'Assignment Cover Page' },
  { to: '/rubber-stamp', label: 'Digital Rubber Stamp' },
  { to: '/scan-to-print', label: 'Scan to Print QR' },
  { to: '/gang-print-sheet', label: 'Gang-Print Sheet' },
  { to: '/land-record-darkener', label: 'Land Record Darkener' },
  { to: '/micro-pocket-notes', label: 'Micro-Pocket Notes' },
  { to: '/lab-journal-formatter', label: 'Lab Journal Formatter' },
  { to: '/board-notes-cleaner', label: 'Board Notes Cleaner' },
  { to: '/resume-compactor', label: 'Resume 1-Page Compactor' },
  { to: '/report-header-swapper', label: 'Report Header Swapper' },
  { to: '/print-cost-calculator', label: 'Print Cost & UPI QR' },
  { to: '/zero-trace-print', label: 'Zero-Trace Print' },
  { to: '/counter-kiosk', label: 'Counter Print Kiosk' },
  { to: '/talking-notes', label: 'Talking Notes Audio QR' },
  { to: '/admit-card-optimizer', label: 'Admit Card 1-Page + GPS' },
  { to: '/court-evidence-formatter', label: 'Court Evidence Formatter' },
  { to: '/smart-kyc-slip', label: 'Smart KYC OCR Slip' },
  { to: '/pamphlet-maker', label: 'Pamphlet & Flyer Maker' },
  { to: '/doc-forensics', label: '🔬 DocForensics™', bold: true },
  { to: '/true-vector-4k', label: '⚡ TrueVector 4K™', bold: true },
  { to: '/contract-redline', label: '⚖️ Contract Redliner™', bold: true },
  { to: '/airgap-cleanroom', label: '🛡️ Airgap Cleanroom™', bold: true },
];

const FOOTER_CONVERT_TOOLS = [
  { to: '/pdf-to-word', label: 'PDF to Word' },
  { to: '/pdf-to-excel', label: 'PDF to Excel' },
  { to: '/pdf-to-jpg', label: 'PDF to JPG' },
  { to: '/jpg-to-pdf', label: 'JPG to PDF' },
  { to: '/pdf-to-images', label: 'PDF to Images' },
  { to: '/pdf-to-ppt', label: 'PDF to PowerPoint' },
  { to: '/searchable-pdf', label: 'Searchable PDF (OCR)' },
  { to: '/universal-converter', label: 'Universal Converter' },
];

const FOOTER_IMAGE_TOOLS = [
  { to: '/image-resizer', label: 'Image Resizer' },
  { to: '/image-crop', label: 'Image Cropper' },
  { to: '/image-converter', label: 'Format Converter' },
  { to: '/remove-background', label: 'Remove Background' },
  { to: '/color-extractor', label: 'Color Extractor' },
  { to: '/passport-photo-sheet', label: 'Passport Photo Sheet' },
  { to: '/clean-signature', label: 'Clean Signature' },
  { to: '/exact-image-size', label: 'Exact Image Size' },
];

const FOOTER_COMPANY_LINKS = [
  { to: '/all-tools', label: 'All Tools' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/about', label: 'About & Team' },
  { to: '/contact', label: 'Contact' },
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/terms', label: 'Terms of Service' },
];

function FooterLinkColumn({
  title,
  items,
  initialLimit = 5,
}: {
  title: string;
  items: { to: string; label: string; bold?: boolean }[];
  initialLimit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = items.length > initialLimit;
  const visibleItems = expanded || !hasMore ? items : items.slice(0, initialLimit);
  const hiddenCount = items.length - initialLimit;

  return (
    <div>
      <h4 className="font-bold mb-4 text-sm" style={{ color: 'var(--pms-ink)' }}>{title}</h4>
      <ul className="space-y-2.5 text-sm" style={{ color: 'var(--pms-muted)' }}>
        {visibleItems.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              className={`hover:text-[var(--pms-rose)] transition-colors ${
                item.bold ? 'font-semibold' : ''
              }`}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-3 inline-flex items-center gap-1 text-xs font-bold hover:opacity-80 transition-opacity cursor-pointer"
          style={{ color: 'var(--pms-rose)' }}
        >
          {expanded ? (
            <>
              Show less <ChevronUp className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              More (+{hiddenCount}) <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      )}
    </div>
  );
}

export default function Layout() {
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
  const [tracesWiped, setTracesWiped] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const recentRef = useRef<HTMLDivElement>(null);
  const favRef = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 180, damping: 28, restDelta: 0.001 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleWipeTraces = useCallback(async () => {
    await wipeAllBrowserTraces();
    setRecent([]);
    setFavorites([]);
    setTracesWiped(true);
    setTimeout(() => setTracesWiped(false), 3000);
  }, []);

  // Close mobile menu & dropdowns and ensure scroll resets on route change
  useEffect(() => {
    setMobileOpen(false);
    setOpenDropdown(null);
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    } catch {
      window.scrollTo(0, 0);
    }
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
    <div
      className="min-h-screen flex flex-col transition-colors"
      style={{ backgroundColor: 'var(--pms-pearl)', color: 'var(--pms-ink)' }}
    >
      <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* ── HEADER ── */}
      <header
        className={`fixed top-0 w-full z-50 pms-glass-header transition-shadow duration-200 ${
          scrolled ? 'shadow-md' : 'shadow-none'
        }`}
      >
        {!prefersReduced && (
          <motion.div
            aria-hidden="true"
            className="absolute bottom-0 left-0 right-0 h-[2px] origin-left pointer-events-none"
            style={{
              scaleX,
              background: 'var(--pms-hero-gradient)',
            }}
          />
        )}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
            <BrandLogo className="w-8 h-8 rounded-xl shadow-sm" />
            <span className="font-extrabold tracking-tight text-[15px] hidden sm:block" style={{ color: 'var(--pms-ink)' }}>
              PDF Media Suite
            </span>
            <span className="font-extrabold tracking-tight text-[15px] sm:hidden" style={{ color: 'var(--pms-ink)' }}>
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
            {[
              { to: '/all-tools', label: 'All Tools' },
              { to: '/pricing', label: 'Pricing' },
              { to: '/about', label: 'About & Team' },
            ].map((navLink) => {
              const isActive = location.pathname === navLink.to;
              return (
                <Link
                  key={navLink.to}
                  to={navLink.to}
                  className={`relative inline-flex items-center py-1.5 px-3 rounded-lg font-semibold text-sm transition-all ${
                    isActive
                      ? 'text-[var(--pms-rose)]'
                      : 'text-[var(--pms-ink)] hover:text-[var(--pms-rose)] hover:bg-[var(--pms-lavender-surface)]'
                  }`}
                >
                  {navLink.label}
                  {isActive && (
                    <motion.span
                      layoutId="pms-nav-active"
                      className="absolute inset-0 rounded-lg -z-10"
                      style={{ backgroundColor: 'var(--pms-soft-rose)' }}
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    />
                  )}
                </Link>
              );
            })}
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
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-[var(--pms-muted)] hover:text-[var(--pms-ink)] hover:bg-[var(--pms-lavender-surface)] transition-colors"
              >
                Recent
              </button>
              {recentOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-56 max-h-72 overflow-y-auto rounded-xl border py-2 z-[60]"
                  style={{
                    backgroundColor: 'var(--pms-white)',
                    borderColor: 'var(--pms-border-strong)',
                    boxShadow: 'var(--pms-shadow-float)',
                  }}
                >
                  {recent.length === 0 ? (
                    <p className="px-3 py-2 text-xs" style={{ color: 'var(--pms-muted)' }}>No recent tools yet.</p>
                  ) : (
                    recent.map((r) => (
                      <Link
                        key={`${r.path}-${r.at}`}
                        to={r.path}
                        onClick={() => setRecentOpen(false)}
                        className="block px-3 py-2 text-sm text-[var(--pms-ink)] hover:bg-[var(--pms-lavender-surface)] truncate"
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
                className="p-2 rounded-full text-[var(--pms-muted)] hover:text-[var(--pms-ink)] hover:bg-[var(--pms-lavender-surface)] transition-colors"
              >
                <Star className="w-4 h-4" />
              </button>
              {favOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-64 rounded-xl border py-2 z-[60]"
                  style={{
                    backgroundColor: 'var(--pms-white)',
                    borderColor: 'var(--pms-border-strong)',
                    boxShadow: 'var(--pms-shadow-float)',
                  }}
                >
                  <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--pms-subtle-text)' }}>
                    Favorites
                  </p>
                  {favorites.length === 0 ? (
                    <p className="px-3 py-3 text-xs" style={{ color: 'var(--pms-muted)' }}>
                      No favorites yet. Click ⭐ on any tool in All Tools.
                    </p>
                  ) : (
                    favorites.map((f) => (
                      <div key={f.path} className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--pms-lavender-surface)] group">
                        <Link
                          to={f.path}
                          onClick={() => setFavOpen(false)}
                          className="flex-1 text-sm text-[var(--pms-ink)] truncate"
                        >
                          {f.title}
                        </Link>
                        <button
                          onClick={() => {
                            toggleFavorite(f);
                            setFavorites(getFavorites());
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--pms-soft-rose)] transition-all"
                          title="Remove from favorites"
                        >
                          <Trash2 className="w-3 h-3 text-[var(--pms-rose)]" />
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
              className="p-2 rounded-full text-[var(--pms-muted)] hover:text-[var(--pms-ink)] hover:bg-[var(--pms-lavender-surface)] transition-colors"
            >
              <Keyboard className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              className="p-2 rounded-full text-[var(--pms-muted)] hover:text-[var(--pms-ink)] hover:bg-[var(--pms-lavender-surface)] transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            {/* Search — opens Cmd+K modal */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              title="Search tools (⌘K)"
              className="p-2 rounded-full text-[var(--pms-muted)] hover:text-[var(--pms-ink)] hover:bg-[var(--pms-lavender-surface)] transition-colors"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Toggle menu"
              className="md:hidden p-2 rounded-full text-[var(--pms-muted)] hover:text-[var(--pms-ink)] hover:bg-[var(--pms-lavender-surface)] transition-colors"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* ── MOBILE MENU ── */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReduced ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="md:hidden border-t max-h-[80vh] overflow-y-auto shadow-xl"
              style={{ backgroundColor: 'var(--pms-white)', borderColor: 'var(--pms-border)' }}
            >
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="border-b" style={{ borderColor: 'var(--pms-border)' }}>
                <button
                  type="button"
                  onClick={() => toggleDropdown(group.label)}
                  className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-bold hover:bg-[var(--pms-lavender-surface)] transition-colors"
                  style={{ color: 'var(--pms-ink)' }}
                >
                  {group.label}
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${openDropdown === group.label ? 'rotate-180' : ''}`}
                    style={{ color: 'var(--pms-muted)' }}
                  />
                </button>
                {openDropdown === group.label && (
                  <div className="pb-2" style={{ backgroundColor: 'var(--pms-pearl)' }}>
                    {group.items.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => { setMobileOpen(false); setOpenDropdown(null); }}
                        className="flex items-center gap-3 px-7 py-2.5 text-sm font-medium text-[var(--pms-muted)] hover:text-[var(--pms-rose)] hover:bg-[var(--pms-lavender-surface)] transition-colors"
                      >
                        <item.icon className="w-4 h-4 text-[var(--pms-rose)] shrink-0" />
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
                { to: '/about', label: 'About & Team' },
                { to: '/contact', label: 'Contact' },
              ].map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center py-2.5 px-3 rounded-xl font-semibold text-sm border transition-colors hover:border-rose-300"
                  style={{
                    backgroundColor: 'var(--pms-lavender-surface)',
                    borderColor: 'var(--pms-border)',
                    color: 'var(--pms-ink)',
                  }}
                >
                  {link.label}
                </Link>
              ))}
            </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1 flex flex-col pt-16">
        <ErrorBoundary locationKey={location.pathname}>
          <Suspense fallback={<PearlRouteSkeleton />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
        <ToolFeedback />
      </main>

      {/* ── FOOTER ── */}
      <footer
        className="relative z-10 py-14 border-t transition-colors"
        style={{
          background: 'linear-gradient(180deg, var(--pms-pearl) 0%, var(--pms-lavender-surface) 100%)',
          borderColor: 'var(--pms-border)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 md:grid-cols-5 gap-8 sm:gap-10">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-3">
              <BrandLogo className="w-7 h-7 rounded-lg shadow-sm" />
              <h3 className="text-base font-bold" style={{ color: 'var(--pms-ink)' }}>PDF Media Suite</h3>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--pms-muted)' }}>
              Fast, private PDF, OCR &amp; image tools right in your browser.
            </p>
          </div>
          <FooterLinkColumn title="PDF Tools" items={FOOTER_PDF_TOOLS} initialLimit={5} />
          <FooterLinkColumn title="Convert" items={FOOTER_CONVERT_TOOLS} initialLimit={5} />
          <FooterLinkColumn title="Image Tools" items={FOOTER_IMAGE_TOOLS} initialLimit={5} />
          <FooterLinkColumn title="Company" items={FOOTER_COMPANY_LINKS} initialLimit={5} />
        </div>

        {/* Bottom bar */}
        <div
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-xs"
          style={{ borderColor: 'var(--pms-border)', color: 'var(--pms-subtle-text)' }}
        >
          <span>&copy; {new Date().getFullYear()} PDF Media Suite. All rights reserved.</span>
          <div className="flex flex-wrap items-center gap-5">
            <button
              type="button"
              onClick={handleWipeTraces}
              title="Clear recent tools, favorites, local print queues & browser cache on shared/cyber-cafe PCs"
              className="inline-flex items-center gap-1.5 hover:text-[var(--pms-rose)] font-medium transition-colors cursor-pointer"
              style={{ color: 'var(--pms-muted)' }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {tracesWiped ? 'Traces Cleared ✓' : 'Clear Traces (Shared PC)'}
            </button>
            <Link to="/privacy" className="hover:text-[var(--pms-rose)] transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-[var(--pms-rose)] transition-colors">Terms of Service</Link>
            <Link to="/contact" className="hover:text-[var(--pms-rose)] transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
