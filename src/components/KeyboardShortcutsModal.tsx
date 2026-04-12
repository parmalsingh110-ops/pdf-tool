import { X } from 'lucide-react';

const ROWS: [string, string][] = [
  ['Open all tools', '/all-tools'],
  ['Edit PDF', '/edit'],
  ['Merge PDF', '/merge'],
  ['Split PDF', '/split'],
  ['Compress PDF', '/compress'],
  ['Target size PDF', '/target-compress'],
  ['Image resizer (forms)', '/image-resizer'],
  ['Image & screenshot text', '/image-text-editor'],
  ['Protect PDF', '/protect'],
  ['Universal converter', '/universal-converter'],
  ['Privacy & processing', '/privacy'],
];

export default function KeyboardShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50" role="dialog">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Shortcuts &amp; routes</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
          Press <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">?</kbd> anywhere
          to toggle this panel. Click a path in the address bar or use the links below.
        </p>
        <ul className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {ROWS.map(([label, path]) => (
            <li key={path} className="px-5 py-3 flex justify-between gap-4 text-sm">
              <span className="text-slate-700 dark:text-slate-200">{label}</span>
              <code className="text-rose-600 dark:text-rose-400 font-mono text-xs shrink-0">{path}</code>
            </li>
          ))}
        </ul>
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-500">
          Tip: bookmark frequent routes; theme persists in this browser.
        </div>
      </div>
    </div>
  );
}
