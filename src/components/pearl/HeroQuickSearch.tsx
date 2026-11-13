import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Search, X } from 'lucide-react';
import { ALL_TOOLS, VERIFIED_TOOL_COUNT } from '../GlobalSearch';

const QUICK_CHIPS = [
  { label: 'Merge PDF', path: '/merge' },
  { label: 'Edit PDF', path: '/edit' },
  { label: 'PDF to Word', path: '/pdf-to-word' },
  { label: 'Remove Background', path: '/remove-background' },
  { label: 'Compress PDF', path: '/compress' },
];

/**
 * Inline Pearl Aurora search bar for the homepage hero section.
 * Reuses ALL_TOOLS directly from GlobalSearch for zero duplicate routing logic.
 */
export default function HeroQuickSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_TOOLS.slice(0, 6);
    return ALL_TOOLS.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        (t.keywords || '').toLowerCase().includes(q),
    ).slice(0, 8);
  }, [query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const goTo = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div
        className="flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 transition-all focus-within:ring-2 focus-within:ring-[#7C3AED]/25"
        style={{
          backgroundColor: 'var(--pms-white)',
          borderColor: open ? 'var(--pms-border-strong)' : 'var(--pms-border)',
          boxShadow: 'var(--pms-shadow-sm)',
        }}
      >
        <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--pms-muted)' }} />
        <input
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActiveIdx((i) => Math.min(i + 1, Math.max(0, matches.length - 1)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter' && matches[activeIdx]) {
              e.preventDefault();
              goTo(matches[activeIdx].path);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          aria-label="Search across all verified tools"
          placeholder={`Search ${VERIFIED_TOOL_COUNT}+ tools (merge, OCR, compress, DOCX...)`}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--pms-muted)]"
          style={{ color: 'var(--pms-ink)' }}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search query"
            className="p-1 rounded-lg hover:opacity-80"
            style={{ color: 'var(--pms-muted)' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <kbd
          className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold shrink-0"
          style={{
            backgroundColor: 'var(--pms-lavender-surface)',
            borderColor: 'var(--pms-border)',
            color: 'var(--pms-muted)',
          }}
        >
          ⌘K
        </kbd>
      </div>

      {/* Quick shortcut pills */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold mr-0.5" style={{ color: 'var(--pms-muted)' }}>
          Quick:
        </span>
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip.path}
            type="button"
            onClick={() => goTo(chip.path)}
            className="px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors hover:border-rose-300 dark:hover:border-rose-700 cursor-pointer"
            style={{
              backgroundColor: 'var(--pms-white)',
              borderColor: 'var(--pms-border)',
              color: 'var(--pms-ink)',
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Instant dropdown matches */}
      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%-26px)] z-40 rounded-2xl border overflow-hidden py-1.5"
          style={{
            backgroundColor: 'var(--pms-white)',
            borderColor: 'var(--pms-border-strong)',
            boxShadow: 'var(--pms-shadow-float)',
          }}
        >
          {matches.length === 0 ? (
            <div className="px-4 py-5 text-center text-xs" style={{ color: 'var(--pms-muted)' }}>
              No tool found for “{query}”. Try keywords like merge, word, ocr, split, passport.
            </div>
          ) : (
            matches.map((tool, i) => {
              const Icon = tool.icon;
              const isSelected = i === activeIdx;
              return (
                <button
                  key={tool.path}
                  type="button"
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => goTo(tool.path)}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors"
                  style={{
                    backgroundColor: isSelected ? 'var(--pms-lavender-surface)' : 'transparent',
                  }}
                >
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: isSelected ? 'var(--pms-soft-rose)' : 'var(--pms-pearl)',
                      color: isSelected ? 'var(--pms-rose)' : 'var(--pms-violet)',
                    }}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate" style={{ color: 'var(--pms-ink)' }}>
                      {tool.title}
                    </span>
                    <span className="block text-[11px]" style={{ color: 'var(--pms-muted)' }}>
                      {tool.category}
                    </span>
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--pms-rose)' }} />
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

