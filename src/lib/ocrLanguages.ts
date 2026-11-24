export interface OcrLanguageOption {
  code: string;
  label: string;
  shortLabel: string;
  region: string;
}

export const OCR_LANGUAGE_STORAGE_KEY = 'pms_ocr_language_v1';

export const OCR_LANGUAGE_OPTIONS: OcrLanguageOption[] = [
  { code: 'auto', label: 'Auto Detect (All Languages)', shortLabel: 'Auto (All)', region: 'Global' },
  { code: 'eng', label: 'English', shortLabel: 'English', region: 'Global' },
  { code: 'hin+eng', label: 'Hindi + English (हिन्दी)', shortLabel: 'Hindi + Eng', region: 'South Asia' },
  { code: 'hin', label: 'Hindi (हिन्दी)', shortLabel: 'Hindi', region: 'South Asia' },
  { code: 'ara+eng', label: 'Arabic + English (العربية)', shortLabel: 'Arabic + Eng', region: 'Middle East' },
  { code: 'ara', label: 'Arabic (العربية)', shortLabel: 'Arabic', region: 'Middle East' },
  { code: 'ben+eng', label: 'Bengali + English (বাংলা)', shortLabel: 'Bengali + Eng', region: 'South Asia' },
  { code: 'chi_sim+eng', label: 'Chinese Simplified (简体中文)', shortLabel: 'Chinese Simp', region: 'East Asia' },
  { code: 'chi_tra+eng', label: 'Chinese Traditional (繁體中文)', shortLabel: 'Chinese Trad', region: 'East Asia' },
  { code: 'nld', label: 'Dutch (Nederlands)', shortLabel: 'Dutch', region: 'Europe' },
  { code: 'fra', label: 'French (Français)', shortLabel: 'French', region: 'Europe' },
  { code: 'deu', label: 'German (Deutsch)', shortLabel: 'German', region: 'Europe' },
  { code: 'guj+eng', label: 'Gujarati + English (ગુજરાતી)', shortLabel: 'Gujarati', region: 'South Asia' },
  { code: 'ita', label: 'Italian (Italiano)', shortLabel: 'Italian', region: 'Europe' },
  { code: 'jpn+eng', label: 'Japanese + English (日本語)', shortLabel: 'Japanese', region: 'East Asia' },
  { code: 'kan+eng', label: 'Kannada + English (ಕನ್ನಡ)', shortLabel: 'Kannada', region: 'South Asia' },
  { code: 'kor+eng', label: 'Korean + English (한국어)', shortLabel: 'Korean', region: 'East Asia' },
  { code: 'mal+eng', label: 'Malayalam + English (മലയാളം)', shortLabel: 'Malayalam', region: 'South Asia' },
  { code: 'mar+eng', label: 'Marathi + English (मराठी)', shortLabel: 'Marathi', region: 'South Asia' },
  { code: 'nep+eng', label: 'Nepali + English (नेपाली)', shortLabel: 'Nepali', region: 'South Asia' },
  { code: 'pol', label: 'Polish (Polski)', shortLabel: 'Polish', region: 'Europe' },
  { code: 'por', label: 'Portuguese (Português)', shortLabel: 'Portuguese', region: 'Europe' },
  { code: 'pan+eng', label: 'Punjabi + English (ਪੰਜਾਬੀ)', shortLabel: 'Punjabi', region: 'South Asia' },
  { code: 'rus+eng', label: 'Russian + English (Русский)', shortLabel: 'Russian', region: 'Europe' },
  { code: 'spa', label: 'Spanish (Español)', shortLabel: 'Spanish', region: 'Americas/EU' },
  { code: 'tam+eng', label: 'Tamil + English (தமிழ்)', shortLabel: 'Tamil', region: 'South Asia' },
  { code: 'tel+eng', label: 'Telugu + English (తెలుగు)', shortLabel: 'Telugu', region: 'South Asia' },
  { code: 'tha+eng', label: 'Thai + English (ไทย)', shortLabel: 'Thai', region: 'SE Asia' },
  { code: 'tur', label: 'Turkish (Türkçe)', shortLabel: 'Turkish', region: 'Eurasia' },
  { code: 'ukr', label: 'Ukrainian (Українська)', shortLabel: 'Ukrainian', region: 'Europe' },
  { code: 'urd+eng', label: 'Urdu + English (اردو)', shortLabel: 'Urdu', region: 'South Asia' },
  { code: 'vie', label: 'Vietnamese (Tiếng Việt)', shortLabel: 'Vietnamese', region: 'SE Asia' },
];

export function getStoredOcrLang(): string {
  if (typeof window === 'undefined') return 'auto';
  try {
    const saved = localStorage.getItem(OCR_LANGUAGE_STORAGE_KEY);
    if (saved && OCR_LANGUAGE_OPTIONS.some((o) => o.code === saved)) {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return 'auto';
}

export function setStoredOcrLang(lang: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(OCR_LANGUAGE_STORAGE_KEY, lang || 'auto');
  } catch {
    // ignore storage errors
  }
}

export function getOcrLangLabel(code: string, compact = false): string {
  const found = OCR_LANGUAGE_OPTIONS.find((o) => o.code === code);
  if (found) return compact ? found.shortLabel : found.label;
  return code || 'Auto Detect';
}

export function toBrowserTesseractLang(code: string): string {
  if (!code || code === 'auto') return 'eng+hin';
  return code;
}
