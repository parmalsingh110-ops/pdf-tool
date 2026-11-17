import { Globe } from 'lucide-react';
import { OCR_LANGUAGE_OPTIONS, setStoredOcrLang } from '../lib/ocrLanguages';

interface OcrLanguageSelectProps {
  value: string;
  onChange: (lang: string) => void;
  compact?: boolean;
  persist?: boolean;
  title?: string;
  className?: string;
}

export default function OcrLanguageSelect({
  value,
  onChange,
  compact = false,
  persist = true,
  title = 'Select document language or keep Auto Detect for any global script',
  className = '',
}: OcrLanguageSelectProps) {
  const handleChange = (next: string) => {
    if (persist) setStoredOcrLang(next);
    onChange(next);
  };

  return (
    <label
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-xl border border-[var(--pms-border)] bg-white/85 dark:bg-slate-900/75 text-[var(--pms-ink)] shadow-xs transition-colors hover:border-[var(--pms-border-strong)] ${
        compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
      } font-semibold ${className}`}
    >
      <Globe className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-[var(--pms-blue)] shrink-0`} />
      <select
        aria-label="Document OCR language"
        value={value || 'auto'}
        onChange={(e) => handleChange(e.target.value)}
        className="bg-transparent text-inherit font-semibold focus:outline-none cursor-pointer pr-1 max-w-[140px] sm:max-w-[205px] truncate"
      >
        {OCR_LANGUAGE_OPTIONS.map((opt) => (
          <option
            key={opt.code}
            value={opt.code}
            className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          >
            {compact ? opt.shortLabel : opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
