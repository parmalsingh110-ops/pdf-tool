import { Link } from 'react-router-dom';
import { HelpCircle, CheckCircle2, ArrowRight } from 'lucide-react';

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
      title: 'Browser-First Zero-Retention Privacy',
      desc: 'Core tools run directly inside your browser. Server-assisted conversions and E2EE print relays run ephemerally with immediate deletion and zero storage.',
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
    <section
      className="mt-16 pt-12 border-t max-w-5xl mx-auto px-4"
      style={{ borderColor: 'var(--pms-border)', color: 'var(--pms-muted)' }}
    >
      {/* ── Headline & Overview ── */}
      <div className="text-center max-w-3xl mx-auto mb-12">
        <h2
          className="text-2xl sm:text-3xl font-extrabold tracking-tight"
          style={{ color: 'var(--pms-ink)' }}
        >
          {headline || `How to Use ${toolName} Online`}
        </h2>
        <p className="mt-3 text-sm sm:text-base leading-relaxed" style={{ color: 'var(--pms-muted)' }}>
          {description}
        </p>
      </div>

      {/* ── 3-Step Guide ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14">
        {effectiveSteps.map((s, idx) => (
          <div
            key={idx}
            className="p-6 rounded-2xl border relative overflow-hidden"
            style={{
              backgroundColor: 'var(--pms-white)',
              borderColor: 'var(--pms-border)',
              boxShadow: 'var(--pms-shadow-sm)',
            }}
          >
            <span
              className="text-4xl font-black absolute right-4 top-3 select-none opacity-15"
              style={{ color: 'var(--pms-violet)' }}
            >
              {s.step}
            </span>
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm mb-4"
              style={{ backgroundColor: 'var(--pms-soft-rose)', color: 'var(--pms-rose)' }}
            >
              {idx + 1}
            </div>
            <h3 className="text-base font-bold mb-2" style={{ color: 'var(--pms-ink)' }}>{s.title}</h3>
            <p className="text-xs sm:text-sm leading-relaxed" style={{ color: 'var(--pms-muted)' }}>{s.desc}</p>
          </div>
        ))}
      </div>

      {/* ── Core Value Props ── */}
      <div
        className="p-8 rounded-3xl border mb-14"
        style={{
          backgroundColor: 'var(--pms-lavender-surface)',
          borderColor: 'var(--pms-border)',
        }}
      >
        <h3 className="text-lg font-bold mb-6 text-center sm:text-left" style={{ color: 'var(--pms-ink)' }}>
          Why Choose PDF Media Suite?
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {effectiveFeatures.map((f, i) => (
            <div key={i} className="flex gap-3.5">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                style={{ backgroundColor: 'var(--pms-soft-mint)', color: '#047857' }}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="text-sm font-bold mb-1" style={{ color: 'var(--pms-ink)' }}>{f.title}</h4>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--pms-muted)' }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FAQs ── */}
      {faqs && faqs.length > 0 && (
        <div className="mb-14">
          <div className="flex items-center gap-2 mb-6">
            <HelpCircle className="w-5 h-5" style={{ color: 'var(--pms-rose)' }} />
            <h3 className="text-xl font-bold" style={{ color: 'var(--pms-ink)' }}>
              Frequently Asked Questions
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="p-5 rounded-2xl border"
                style={{ backgroundColor: 'var(--pms-white)', borderColor: 'var(--pms-border)' }}
              >
                <h4 className="text-sm font-bold mb-2" style={{ color: 'var(--pms-ink)' }}>{faq.q}</h4>
                <p className="text-xs sm:text-sm leading-relaxed" style={{ color: 'var(--pms-muted)' }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Related Tools Internal Linking ── */}
      {relatedTools && relatedTools.length > 0 && (
        <div className="pt-6 border-t" style={{ borderColor: 'var(--pms-border)' }}>
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--pms-subtle-text)' }}>
            Explore Related Tools
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {relatedTools.map((t, i) => (
              <Link
                key={i}
                to={t.path}
                className="p-3.5 rounded-xl border hover:border-rose-300 dark:hover:border-rose-700 transition-colors group"
                style={{ backgroundColor: 'var(--pms-white)', borderColor: 'var(--pms-border)' }}
              >
                <p
                  className="text-xs font-bold group-hover:text-rose-600 dark:group-hover:text-rose-400 flex items-center justify-between"
                  style={{ color: 'var(--pms-ink)' }}
                >
                  {t.name}
                  <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
                <p className="text-[11px] mt-0.5 line-clamp-1" style={{ color: 'var(--pms-muted)' }}>{t.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
