import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, X, Combine, Scissors, Minimize2, FileText, Image as ImageIcon,
  Edit3, Lock, Unlock, Droplet, Hash, Layers, RotateCw, ShieldOff, Stamp, BarChart3,
  BookOpen, Presentation, FileX, Images, Code, Palette, Crop, RefreshCw, ScanSearch,
  ShieldCheck, Maximize, Target, Ruler, ScanText, ContactRound, ArrowUpDown, FilePlus,
  Search as SearchIcon, Trash2, Contrast, Sparkles, LayoutGrid, QrCode, Pen, ScanLine,
  GitCompare, FormInput, Copy, MonitorSmartphone, Wand2, Globe, Volume2, Link as LinkIcon,
  Shield, Wrench, FileCode2, Type, BookMarked, Accessibility, Tag, BarChart2,
} from 'lucide-react';

interface ToolEntry {
  title: string;
  path: string;
  icon: React.ElementType;
  category: string;
  keywords?: string;
}

const ALL_TOOLS: ToolEntry[] = [
  // PDF Essentials
  { title: 'Merge PDF', path: '/merge', icon: Combine, category: 'PDF Tools', keywords: 'combine join' },
  { title: 'Split PDF', path: '/split', icon: Scissors, category: 'PDF Tools', keywords: 'separate divide' },
  { title: 'Compress PDF', path: '/compress', icon: Minimize2, category: 'PDF Tools', keywords: 'reduce size shrink' },
  { title: 'Edit PDF', path: '/edit', icon: Edit3, category: 'PDF Tools', keywords: 'annotate text editor' },
  { title: 'Protect PDF', path: '/protect', icon: Lock, category: 'PDF Tools', keywords: 'password encrypt' },
  { title: 'Unlock PDF', path: '/unlock', icon: Unlock, category: 'PDF Tools', keywords: 'remove password decrypt' },
  { title: 'Watermark PDF', path: '/watermark', icon: Droplet, category: 'PDF Tools', keywords: 'stamp brand' },
  { title: 'Remove Watermark', path: '/remove-watermark', icon: Droplet, category: 'PDF Tools', keywords: 'erase delete' },
  { title: 'Page Numbers', path: '/page-numbers', icon: Hash, category: 'PDF Tools', keywords: 'number footer' },
  { title: 'Organize PDF', path: '/organize', icon: Layers, category: 'PDF Tools', keywords: 'reorder pages drag' },
  { title: 'Rotate Pages', path: '/rotate-pages', icon: RotateCw, category: 'PDF Tools', keywords: '90 180 270 flip' },
  { title: 'Flatten PDF', path: '/flatten-pdf', icon: Layers, category: 'PDF Tools', keywords: 'form fields flatten' },
  { title: 'Reverse PDF', path: '/reverse', icon: ArrowUpDown, category: 'PDF Tools', keywords: 'flip order backward' },
  { title: 'Add Margins', path: '/add-margins', icon: Maximize, category: 'PDF Tools', keywords: 'border padding whitespace' },
  { title: 'Blank Page Remover', path: '/remove-blank-pages', icon: FileX, category: 'PDF Tools', keywords: 'empty delete scan' },
  { title: 'Grayscale PDF', path: '/grayscale-pdf', icon: Contrast, category: 'PDF Tools', keywords: 'black white bw monochrome' },
  { title: 'Invert Colors', path: '/invert-colors', icon: Contrast, category: 'PDF Tools', keywords: 'dark mode negative' },
  { title: 'Ink Saver PDF', path: '/ink-saver', icon: Contrast, category: 'PDF Tools', keywords: 'print save toner' },
  { title: 'PDF Repair Tool', path: '/pdf-repair', icon: Wrench, category: 'PDF Tools', keywords: 'fix corrupt broken' },
  { title: 'PDF Deep Sanitizer', path: '/pdf-sanitizer', icon: Shield, category: 'PDF Tools', keywords: 'clean safe remove scripts' },
  { title: 'Auto-Crop Margins', path: '/auto-crop-margins', icon: Crop, category: 'PDF Tools', keywords: 'trim white borders' },
  // Convert
  { title: 'PDF to Word', path: '/pdf-to-word', icon: FileText, category: 'Convert', keywords: 'docx editable' },
  { title: 'PDF to Excel', path: '/pdf-to-excel', icon: FileText, category: 'Convert', keywords: 'xlsx spreadsheet table' },
  { title: 'PDF to PowerPoint', path: '/pdf-to-ppt', icon: FileText, category: 'Convert', keywords: 'pptx slides' },
  { title: 'PDF to JPG', path: '/pdf-to-jpg', icon: ImageIcon, category: 'Convert', keywords: 'image jpeg photo' },
  { title: 'JPG to PDF', path: '/jpg-to-pdf', icon: ImageIcon, category: 'Convert', keywords: 'image jpeg to pdf' },
  { title: 'PDF to Images (ZIP)', path: '/pdf-to-images', icon: Images, category: 'Convert', keywords: 'all pages zip download' },
  { title: 'PDF to GIF', path: '/pdf-to-gif', icon: ImageIcon, category: 'Convert', keywords: 'animated gif' },
  { title: 'PDF to Markdown', path: '/pdf-to-markdown', icon: FileCode2, category: 'Convert', keywords: 'md text format' },
  { title: 'Universal Converter', path: '/universal-converter', icon: Wand2, category: 'Convert', keywords: 'auto detect word excel ppt' },
  { title: 'Word to PDF (Exact)', path: '/word-to-pdf-exact', icon: FileText, category: 'Convert', keywords: 'docx exact layout' },
  { title: 'Code / HTML to PDF', path: '/code-to-pdf', icon: Code, category: 'Convert', keywords: 'syntax highlight html' },
  { title: 'Screenshot to PDF', path: '/screenshot-to-pdf', icon: MonitorSmartphone, category: 'Convert', keywords: 'screen capture' },
  { title: 'Searchable PDF (OCR)', path: '/searchable-pdf', icon: ScanSearch, category: 'Convert', keywords: 'scan ocr text recognition' },
  { title: 'Webpage to PDF', path: '/webpage-to-pdf', icon: Globe, category: 'Convert', keywords: 'url website html' },
  { title: 'Long Image to PDF', path: '/long-image-to-pdf', icon: ImageIcon, category: 'Convert', keywords: 'tall scroll screenshot' },
  // Image Tools
  { title: 'Image Resizer', path: '/image-resizer', icon: Ruler, category: 'Image Tools', keywords: 'px cm mm percent resize' },
  { title: 'Pixel Resizer', path: '/pixel-resizer', icon: ImageIcon, category: 'Image Tools', keywords: 'width height exact px' },
  { title: 'Exact Image Size', path: '/exact-image-size', icon: Target, category: 'Image Tools', keywords: 'kb mb strict target' },
  { title: 'Image Cropper', path: '/image-crop', icon: Crop, category: 'Image Tools', keywords: 'trim aspect ratio' },
  { title: 'Format Converter', path: '/image-converter', icon: RefreshCw, category: 'Image Tools', keywords: 'jpg png webp tiff gif' },
  { title: 'Remove Background', path: '/remove-background', icon: Sparkles, category: 'Image Tools', keywords: 'ai cutout transparent' },
  { title: 'Image Watermark', path: '/image-watermark', icon: Droplet, category: 'Image Tools', keywords: 'text logo brand' },
  { title: 'Image Text Editor (OCR)', path: '/image-text-editor', icon: ScanText, category: 'Image Tools', keywords: 'ocr edit text inside image' },
  { title: 'Passport Photo Sheet', path: '/passport-photo-sheet', icon: ContactRound, category: 'Image Tools', keywords: 'visa id print grid' },
  { title: 'Color Extractor', path: '/color-extractor', icon: Palette, category: 'Image Tools', keywords: 'hex rgb palette brand' },
  { title: 'Image Collage Maker', path: '/image-collage', icon: LayoutGrid, category: 'Image Tools', keywords: 'grid combine multiple' },
  { title: 'Image Color Correction', path: '/image-color-correction', icon: Palette, category: 'Image Tools', keywords: 'brightness contrast saturation' },
  { title: 'Image Noise Reduction', path: '/image-noise-reduction', icon: Sparkles, category: 'Image Tools', keywords: 'denoise smooth clean' },
  { title: 'Convert to WebP', path: '/convert-webp', icon: ImageIcon, category: 'Image Tools', keywords: 'webp format' },
  { title: 'Convert to TIFF', path: '/convert-tiff', icon: ImageIcon, category: 'Image Tools', keywords: 'tiff format high quality' },
  { title: 'RGB to CMYK', path: '/cmyk-converter', icon: Palette, category: 'Image Tools', keywords: 'print color convert' },
  { title: 'Image to Base64', path: '/image-to-base64', icon: Code, category: 'Image Tools', keywords: 'encode data uri html' },
  { title: 'Image Metadata (EXIF)', path: '/image-metadata', icon: Tag, category: 'Image Tools', keywords: 'exif gps date camera info' },
  { title: 'Smart Image to PDF', path: '/smart-image-to-pdf', icon: ImageIcon, category: 'Image Tools', keywords: 'auto fit multi page' },
  // Text & OCR
  { title: 'Search & Replace', path: '/search-replace', icon: SearchIcon, category: 'Text & OCR', keywords: 'find replace text' },
  { title: 'Extract Text', path: '/extract-text', icon: FileText, category: 'Text & OCR', keywords: 'copy paste text pdf' },
  { title: 'Remove Text', path: '/remove-text', icon: Scissors, category: 'Text & OCR', keywords: 'delete erase text' },
  { title: 'Highlight Text', path: '/highlight-text', icon: SearchIcon, category: 'Text & OCR', keywords: 'mark yellow highlight' },
  { title: 'Extract Tables', path: '/extract-tables', icon: FileText, category: 'Text & OCR', keywords: 'csv table data' },
  { title: 'Edit Metadata', path: '/edit-metadata', icon: Tag, category: 'Text & OCR', keywords: 'title author subject keywords' },
  { title: 'Remove Metadata', path: '/remove-metadata', icon: Trash2, category: 'Text & OCR', keywords: 'strip clean private data' },
  { title: 'Font Extractor', path: '/font-extractor', icon: Type, category: 'Text & OCR', keywords: 'ttf otf font list' },
  { title: 'PDF Font Replacer', path: '/font-replacer', icon: Type, category: 'Text & OCR', keywords: 'change font substitute' },
  { title: 'PDF Link Extractor', path: '/link-extractor', icon: LinkIcon, category: 'Text & OCR', keywords: 'url hyperlink list' },
  { title: 'Bates Numbering', path: '/bates-numbering', icon: Hash, category: 'Text & OCR', keywords: 'legal document numbering' },
  { title: 'Headers & Footers', path: '/headers-footers', icon: Layers, category: 'Text & OCR', keywords: 'custom header footer' },
  { title: 'PDF to Markdown', path: '/pdf-to-markdown', icon: FileCode2, category: 'Text & OCR', keywords: 'md text format' },
  // Pro Tools
  { title: 'PDF Redaction', path: '/redact', icon: ShieldOff, category: 'Pro Tools', keywords: 'black out sensitive hide' },
  { title: 'PDF Stamp', path: '/stamp', icon: Stamp, category: 'Pro Tools', keywords: 'draft confidential approved' },
  { title: 'PDF Stats', path: '/pdf-stats', icon: BarChart3, category: 'Pro Tools', keywords: 'word count pages reading time' },
  { title: 'PDF Booklet', path: '/booklet', icon: BookOpen, category: 'Pro Tools', keywords: 'print fold booklet' },
  { title: 'Slide Presenter', path: '/present', icon: Presentation, category: 'Pro Tools', keywords: 'fullscreen presentation slides' },
  { title: 'Extract Pages', path: '/extract-pages', icon: Images, category: 'Pro Tools', keywords: 'pick visual select pages' },
  { title: 'Duplicate Finder', path: '/duplicate-pages', icon: Copy, category: 'Pro Tools', keywords: 'duplicate identical same pages' },
  { title: 'PDF Overlay', path: '/pdf-overlay', icon: Layers, category: 'Pro Tools', keywords: 'layer transparency two pdfs' },
  { title: 'PDF Comparison', path: '/pdf-comparison', icon: GitCompare, category: 'Pro Tools', keywords: 'diff compare two documents' },
  { title: 'PDF Form Filler', path: '/pdf-form-filler', icon: FormInput, category: 'Pro Tools', keywords: 'fill interactive form fields' },
  { title: 'PDF Page Cropper', path: '/pdf-page-cropper', icon: Crop, category: 'Pro Tools', keywords: 'trim margins page' },
  { title: 'N-Up Page Layout', path: '/n-up-layout', icon: LayoutGrid, category: 'Pro Tools', keywords: '2up 4up multiple per sheet' },
  { title: 'Target Size Compress', path: '/target-compress', icon: Target, category: 'Pro Tools', keywords: 'compress exact kb mb size' },
  { title: 'Increase PDF Size', path: '/increase-size', icon: Maximize, category: 'Pro Tools', keywords: 'inflate larger portal' },
  { title: 'File Hash Calculator', path: '/file-hash', icon: ShieldCheck, category: 'Pro Tools', keywords: 'sha256 md5 integrity verify' },
  { title: 'Multi-PDF Page Counter', path: '/page-counter', icon: Hash, category: 'Pro Tools', keywords: 'count pages multiple' },
  { title: 'PDF Read Aloud', path: '/pdf-to-audio', icon: Volume2, category: 'Pro Tools', keywords: 'tts text speech listen' },
  { title: 'Reading Tracker', path: '/reading-tracker', icon: BookMarked, category: 'Pro Tools', keywords: 'progress bookmark resume' },
  { title: 'Image Insert & Overlay', path: '/image-insert', icon: ImageIcon, category: 'Pro Tools', keywords: 'add image page layer' },
  // Creative
  { title: 'QR Code Generator', path: '/qr-code', icon: QrCode, category: 'Creative', keywords: 'barcode url qr' },
  { title: 'Digital Signature Pad', path: '/signature-pad', icon: Pen, category: 'Creative', keywords: 'draw sign handwritten' },
  { title: 'Document Scanner', path: '/document-scanner', icon: ScanLine, category: 'Creative', keywords: 'camera scan mobile' },
  { title: 'PDF Accessibility Checker', path: '/accessibility-checker', icon: Accessibility, category: 'Creative', keywords: 'wcag screen reader accessible' },
  // Security
  { title: 'Batch Protect', path: '/batch-protect', icon: Lock, category: 'Security', keywords: 'multiple password bulk' },
  { title: 'Password Strength Checker', path: '/password-strength', icon: ShieldCheck, category: 'Security', keywords: 'strong weak checker' },
  { title: 'Certify Document', path: '/certify-document', icon: ShieldCheck, category: 'Security', keywords: 'official sign certificate' },
  { title: 'PDF/A Conversion', path: '/pdf-a-conversion', icon: ShieldCheck, category: 'Security', keywords: 'archival long term storage' },
  { title: 'Cryptographic Signatures', path: '/crypto-sign', icon: ShieldCheck, category: 'Security', keywords: 'x509 pkcs digital sign' },
  { title: 'Validate Signatures', path: '/validate-signatures', icon: ShieldCheck, category: 'Security', keywords: 'verify certificate chain' },
  { title: 'Invisible Watermarks', path: '/invisible-watermark', icon: Droplet, category: 'Security', keywords: 'steganography hidden track' },
  { title: 'Self-Destructing PDF', path: '/self-destruct', icon: Shield, category: 'Security', keywords: 'expire time limit delete' },
  { title: 'Add DRM', path: '/add-drm', icon: Lock, category: 'Security', keywords: 'drm rights protection' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export default function GlobalSearch({ open, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? ALL_TOOLS.filter((t) => {
        const q = query.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          (t.keywords || '').toLowerCase().includes(q)
        );
      })
    : ALL_TOOLS.slice(0, 8); // show popular first 8 when no query

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === 'Enter') {
        if (filtered[selected]) {
          navigate(filtered[selected].path);
          onClose();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered, selected, navigate, onClose]);

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.children[selected] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  // Reset selection on query change
  useEffect(() => { setSelected(0); }, [query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-start justify-center pt-[12vh] px-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-search-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200 dark:border-slate-700">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools..."
            className="flex-1 bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 text-base outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-600">
            ESC
          </kbd>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-slate-400 text-sm">
              No tools found for "<span className="font-semibold text-slate-600 dark:text-slate-300">{query}</span>"
            </div>
          ) : (
            filtered.map((tool, i) => {
              const Icon = tool.icon;
              const isSelected = i === selected;
              return (
                <button
                  key={tool.path}
                  onClick={() => { navigate(tool.path); onClose(); }}
                  onMouseEnter={() => setSelected(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    isSelected
                      ? 'bg-rose-50 dark:bg-rose-950/40'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    isSelected ? 'bg-rose-100 dark:bg-rose-900/60' : 'bg-slate-100 dark:bg-slate-800'
                  }`}>
                    <Icon className={`w-4 h-4 ${isSelected ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${isSelected ? 'text-rose-700 dark:text-rose-300' : 'text-slate-800 dark:text-slate-200'}`}>
                      {highlight(tool.title, query)}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{tool.category}</p>
                  </div>
                  {isSelected && <ArrowRight className="w-4 h-4 text-rose-400 shrink-0" />}
                </button>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-2 flex items-center gap-4 text-[11px] text-slate-400">
          <span><kbd className="font-bold">↑↓</kbd> navigate</span>
          <span><kbd className="font-bold">↵</kbd> open</span>
          <span><kbd className="font-bold">Esc</kbd> close</span>
          <span className="ml-auto">{filtered.length} tool{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}
