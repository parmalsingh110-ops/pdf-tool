import { Link } from 'react-router-dom';
import { ShieldCheck, Zap, Lock, HelpCircle, CheckCircle2, ArrowRight } from 'lucide-react';

export interface SEOStep {
  step: string;
  title: string;
  desc: string;
}

export interface SEOFaq {
  q: string;
  a: string;
}

export interface RelatedTool {
  name: string;
  path: string;
  desc: string;
}

interface ToolSEOSectionProps {
  toolName: string;
  headline?: string;
  description: string;
  steps?: SEOStep[];
  features?: { title: string; desc: string }[];
  faqs?: SEOFaq[];
  relatedTools?: RelatedTool[];
}

export default function ToolSEOSection({
  toolName,
  headline,
  description,
  steps,
  features,
  faqs,
  relatedTools,
}: ToolSEOSectionProps) {
  const defaultSteps: SEOStep[] = [
    {
      step: '01',
      title: 'Select or Drop Files',
      desc: `Upload or drag and drop your document directly into the ${toolName} workspace.`,
    },
    {
      step: '02',
      title: 'Configure & Process',
      desc: 'Adjust your preferred options or let our high-speed engine process your document instantly.',
    },
    {
      step: '03',
      title: 'Instant Download',
      desc: 'Save your processed document to your device immediately. 100% free with no watermark or limits.',
    },
  ];

  const defaultFeatures = [
    {
      title: '100% Client-Side Privacy',
      desc: 'Your files are processed directly inside your browser. No files are uploaded to cloud servers or stored.',
    },
    {
      title: 'Ultra-Fast Performance',
      desc: 'Powered by modern WebAssembly and vector engines for lightning-fast conversions without queuing.',
    },
    {
      title: 'No Limits or Subscriptions',
      desc: 'Enjoy unlimited document processing completely free forever. No email signup, credit card or account needed.',
    },
  ];

  const effectiveSteps = steps || defaultSteps;
  const effectiveFeatures = features || defaultFeatures;

  return (
    <section className="mt-16 pt-12 border-t border-slate-200/80 dark:border-slate-800/80 max-w-5xl mx-auto px-4 text-slate-700 dark:text-slate-300">
      {/* ── Headline & Overview ── */}
      <div className="text-center max-w-3xl mx-auto mb-12">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          {headline || `How to Use ${toolName} Online`}
        </h2>
        <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
          {description}
        </p>
      </div>

      {/* ── 3-Step Guide ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14">
        {effectiveSteps.map((s, idx) => (
          <div
            key={idx}
            className="p-6 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden"
          >
            <span className="text-4xl font-black text-rose-500/20 dark:text-rose-400/15 absolute right-4 top-3 select-none">
              {s.step}
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-sm mb-4">
              {idx + 1}
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">{s.title}</h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>

      {/* ── Core Value Props ── */}
      <div className="p-8 rounded-3xl bg-gradient-to-br from-slate-50 to-slate-100/60 dark:from-slate-900/50 dark:to-slate-900/20 border border-slate-200 dark:border-slate-800 mb-14">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 text-center sm:text-left">
          Why Choose PDF Media Suite?
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {effectiveFeatures.map((f, i) => (
            <div key={i} className="flex gap-3.5">
              <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-1">{f.title}</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FAQs ── */}
      {faqs && faqs.length > 0 && (
        <div className="mb-14">
          <div className="flex items-center gap-2 mb-6">
            <HelpCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              Frequently Asked Questions
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="p-5 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800"
              >
                <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-2">{faq.q}</h4>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Related Tools Internal Linking ── */}
      {relatedTools && relatedTools.length > 0 && (
        <div className="pt-6 border-t border-slate-200 dark:border-slate-800/60">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">
            Explore Related Tools
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {relatedTools.map((t, i) => (
              <Link
                key={i}
                to={t.path}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-700 transition-colors group"
              >
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-rose-600 dark:group-hover:text-rose-400 flex items-center justify-between">
                  {t.name}
                  <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">{t.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
