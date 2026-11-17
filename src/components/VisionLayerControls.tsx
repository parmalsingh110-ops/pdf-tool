import { useEffect, useState } from 'react';
import { Check, KeyRound, Lock, Sparkles, X } from 'lucide-react';
import {
  clearUserVisionApiKey,
  fetchServerVisionStatus,
  getVisionApiKey,
  getVisionProvider,
  setUserVisionApiKey,
  setVisionProvider,
  type DocumentLayerMode,
  type VisionProvider,
} from '../lib/advancedVisionEngine';
import OcrLanguageSelect from './OcrLanguageSelect';

interface VisionLayerControlsProps {
  showLayerMode?: boolean;
  layerMode?: DocumentLayerMode;
  onLayerModeChange?: (mode: DocumentLayerMode) => void;
  strictLocal: boolean;
  onStrictLocalChange: (strict: boolean) => void;
  lang?: string;
  onLangChange?: (lang: string) => void;
}

export default function VisionLayerControls({
  strictLocal,
  onStrictLocalChange,
  lang,
  onLangChange,
}: VisionLayerControlsProps) {
  const [serverAiReady, setServerAiReady] = useState(false);
  const [userKey, setUserKey] = useState(() => getVisionApiKey());
  const [provider, setProvider] = useState<VisionProvider>(() => getVisionProvider());
  const [showAiConfig, setShowAiConfig] = useState(false);
  const [draftKey, setDraftKey] = useState(() => getVisionApiKey());

  useEffect(() => {
    let mounted = true;
    fetchServerVisionStatus().then((st) => {
      if (mounted) {
        setServerAiReady(Boolean(st.enhanced_available ?? st.server_ai_configured));
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const hasCustomKey = userKey.trim().length > 10;
  const aiReady = !strictLocal && (serverAiReady || hasCustomKey);

  const handleSaveAiKey = () => {
    const cleaned = draftKey.trim();
    setUserVisionApiKey(cleaned);
    setUserKey(cleaned);
    if (cleaned.length > 10 && strictLocal) {
      onStrictLocalChange(false);
    }
    setShowAiConfig(false);
  };

  const handleClearAiKey = () => {
    clearUserVisionApiKey();
    setDraftKey('');
    setUserKey('');
  };

  const handleProviderChange = (next: VisionProvider) => {
    setProvider(next);
    setVisionProvider(next);
  };

  return (
    <div className="rounded-2xl border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/70 px-4 py-3 shadow-xs space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
              strictLocal
                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
                : aiReady
                ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400'
                : 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400'
            }`}
          >
            {strictLocal ? <Lock className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-bold text-[var(--pms-ink)] leading-tight">
                {strictLocal
                  ? 'On-Device Private Mode'
                  : aiReady
                  ? 'Smart AI Vision + Exact Table & Layout Engine'
                  : 'Unified Smart Auto Layout & OCR Engine'}
              </p>
              {!strictLocal && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    aiReady
                      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300'
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300'
                  }`}
                >
                  {aiReady ? 'AI Vision Active' : 'Auto Self-Verifying'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--pms-muted)] leading-snug mt-0.5">
              {strictLocal
                ? 'Processes strictly with offline local OCR and OpenCV table grid reconstruction.'
                : 'Automatically reconstructs exact tables, words, lines, stamps, and 100+ languages in one pass.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onLangChange && (
            <OcrLanguageSelect value={lang || 'auto'} onChange={onLangChange} compact />
          )}

          <button
            type="button"
            onClick={() => {
              if (strictLocal) {
                onStrictLocalChange(false);
              }
              setShowAiConfig((v) => !v);
            }}
            title="Configure AI Vision provider or API key for maximum OCR & layout precision"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
              aiReady
                ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                : 'border-[var(--pms-border)] bg-white/80 dark:bg-slate-800/60 text-[var(--pms-ink)] hover:border-blue-400'
            }`}
          >
            <KeyRound className="w-3 h-3" />
            {aiReady
              ? hasCustomKey
                ? `AI Vision (${provider.toUpperCase()}) ✓`
                : 'AI Vision Ready ✓'
              : 'AI Vision Key'}
          </button>

          <button
            type="button"
            onClick={() => onStrictLocalChange(!strictLocal)}
            title="Restrict processing strictly to on-device local pipelines"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
              strictLocal
                ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                : 'border-[var(--pms-border)] bg-white/80 dark:bg-slate-800/60 text-[var(--pms-muted)] hover:text-[var(--pms-ink)]'
            }`}
          >
            <Lock className="w-3 h-3" />
            {strictLocal ? 'Local Lock On' : 'Local Only'}
          </button>
        </div>
      </div>

      {showAiConfig && (
        <div className="pt-2.5 border-t border-[var(--pms-border)] flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as VisionProvider)}
            aria-label="Select AI Vision Provider"
            className="px-2.5 py-1.5 rounded-xl border border-[var(--pms-border)] bg-white dark:bg-slate-800 text-xs font-semibold text-[var(--pms-ink)]"
          >
            <option value="auto">Provider: Auto Detect</option>
            <option value="gemini">Google Gemini Vision</option>
            <option value="openai">OpenAI GPT-4o Vision</option>
            <option value="claude">Anthropic Claude Vision</option>
          </select>

          <input
            type="password"
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            placeholder={
              serverAiReady
                ? 'Server AI active — optional custom API key override...'
                : 'Paste Gemini / OpenAI / Claude API key for AI Vision boost...'
            }
            className="flex-1 px-3 py-1.5 rounded-xl border border-[var(--pms-border)] bg-white dark:bg-slate-800 text-xs text-[var(--pms-ink)] placeholder:text-[var(--pms-muted)] focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleSaveAiKey}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors"
            >
              <Check className="w-3.5 h-3.5" /> Save
            </button>
            {hasCustomKey && (
              <button
                type="button"
                onClick={handleClearAiKey}
                className="px-2.5 py-1.5 rounded-xl border border-[var(--pms-border)] text-xs font-semibold text-[var(--pms-muted)] hover:text-red-600"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAiConfig(false)}
              className="p-1.5 rounded-xl text-[var(--pms-muted)] hover:text-[var(--pms-ink)]"
              aria-label="Close AI settings"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
