import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'mediasuite-theme';

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
} | null>(null);

/** Safe storage helpers — Safari private mode + disabled cookies + quota
 *  errors throw on access, which would otherwise crash the whole app at boot. */
function safeRead(): Theme | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

function safeWrite(v: Theme): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_KEY, v);
  } catch {
    /* ignore */
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Light-first Pearl Aurora default unless visitor explicitly switched and saved Dark mode
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = safeRead();
    if (stored) return stored;
    return 'light';
  });

  useEffect(() => {
    try {
      const root = document.documentElement;
      root.classList.add('pms-theme-switching');
      root.classList.toggle('dark', theme === 'dark');
      const id = window.requestAnimationFrame(() => {
        root.classList.remove('pms-theme-switching');
      });
      safeWrite(theme);
      return () => window.cancelAnimationFrame(id);
    } catch {
      /* defensive — should never fail in browsers, but don't crash if it does */
    }
    safeWrite(theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    const docAny = typeof document !== 'undefined' ? (document as any) : null;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (docAny && typeof docAny.startViewTransition === 'function' && !prefersReduced) {
      try {
        docAny.startViewTransition(() => {
          setThemeState(t);
        });
        return;
      } catch {
        /* fallback below */
      }
    }
    setThemeState(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
