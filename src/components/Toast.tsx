import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
}

// ─── Context ────────────────────────────────────────────────────
const ToastContext = createContext<ToastContextValue | null>(null);

// ─── Hook ───────────────────────────────────────────────────────
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

// ─── Single Toast Item ───────────────────────────────────────────
const STYLES: Record<ToastType, { bar: string; icon: string; bg: string; border: string; text: string }> = {
  success: {
    bar: 'bg-emerald-500',
    icon: 'text-emerald-500',
    bg: 'bg-white dark:bg-slate-900',
    border: 'border-emerald-200 dark:border-emerald-800',
    text: 'text-slate-800 dark:text-slate-100',
  },
  error: {
    bar: 'bg-rose-500',
    icon: 'text-rose-500',
    bg: 'bg-white dark:bg-slate-900',
    border: 'border-rose-200 dark:border-rose-800',
    text: 'text-slate-800 dark:text-slate-100',
  },
  info: {
    bar: 'bg-blue-500',
    icon: 'text-blue-500',
    bg: 'bg-white dark:bg-slate-900',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-slate-800 dark:text-slate-100',
  },
};

const ICONS: Record<ToastType, React.ElementType> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const s = STYLES[toast.type];
  const Icon = ICONS[toast.type];

  return (
    <div
      className={`relative flex items-start gap-3 w-full max-w-sm rounded-2xl border shadow-xl overflow-hidden ${s.bg} ${s.border} px-4 py-3 animate-toast-in`}
      style={{ minWidth: 280 }}
    >
      {/* Left color bar */}
      <div className={`absolute left-0 inset-y-0 w-1 ${s.bar}`} />

      <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${s.icon}`} />
      <p className={`flex-1 text-sm font-medium leading-snug ${s.text}`}>{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5 text-slate-400" />
      </button>
    </div>
  );
}

// ─── Provider ────────────────────────────────────────────────────
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const add = useCallback((type: ToastType, message: string) => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value: ToastContextValue = {
    success: (msg) => add('success', msg),
    error: (msg) => add('error', msg),
    info: (msg) => add('info', msg),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast container — bottom-right */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 items-end pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
