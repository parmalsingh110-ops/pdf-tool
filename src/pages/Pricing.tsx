import { Link } from 'react-router-dom';
import { ArrowLeft, Tag, CheckCircle } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useSEO } from '../hooks/useSEO';
import { VERIFIED_TOOL_COUNT } from '../components/GlobalSearch';
import PearlAuroraBackground from '../components/pearl/PearlAuroraBackground';

export default function Pricing() {
  const prefersReduced = useReducedMotion();
  useSEO(
    'Pricing — 100% Free Forever | PDF Media Suite',
    `All ${VERIFIED_TOOL_COUNT}+ PDF and image tools on PDF Media Suite are 100% free with no subscription, no hidden charges, and no signup needed.`
  );

  return (
    <div className="relative flex-1 transition-colors" style={{ backgroundColor: 'var(--pms-pearl)', color: 'var(--pms-ink)' }}>
      <PearlAuroraBackground mode="workspace" />
      <motion.div
        initial={prefersReduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 max-w-3xl mx-auto px-6 py-12"
        style={{ color: 'var(--pms-muted)' }}
      >
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-semibold mb-8 hover:opacity-80"
          style={{ color: 'var(--pms-rose)' }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 rounded-2xl" style={{ backgroundColor: 'var(--pms-soft-rose)', color: 'var(--pms-rose)' }}>
            <Tag className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold" style={{ color: 'var(--pms-ink)' }}>Pricing</h1>
        </div>

        <div className="space-y-8 text-base leading-relaxed">
          <section>
            <div
              className="p-8 rounded-3xl border"
              style={{
                backgroundColor: 'var(--pms-white)',
                borderColor: 'var(--pms-border-strong)',
                boxShadow: 'var(--pms-shadow-card)',
              }}
            >
              <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--pms-ink)' }}>Free</h2>
              <p className="mb-6" style={{ color: 'var(--pms-muted)' }}>
                PDF Media Suite currently provides its core PDF, document and image tools free of charge.
              </p>

              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-3" style={{ color: 'var(--pms-ink)' }}>
                  <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>Access to PDF editing, conversion, OCR and image processing tools.</span>
                </li>
                <li className="flex items-start gap-3" style={{ color: 'var(--pms-ink)' }}>
                  <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>Browser-based processing for maximum privacy.</span>
                </li>
              </ul>

              <div
                className="p-4 rounded-xl border text-sm"
                style={{ backgroundColor: 'var(--pms-lavender-surface)', borderColor: 'var(--pms-border)' }}
              >
                <p className="font-semibold mb-1" style={{ color: 'var(--pms-ink)' }}>Usage Note:</p>
                <p>Reasonable usage limits may apply to certain tools to protect service availability.</p>
              </div>
            </div>
          </section>

          <section className="pt-6">
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--pms-ink)' }}>Business Model</h2>
            <p className="mb-4">
              PDF Media Suite is a digital-first software product delivered through the web. The platform is designed to provide document and PDF processing capabilities directly through a browser rather than through consulting or custom development services.
            </p>
            <p>
              As the product grows, the platform may introduce optional premium capabilities or usage-based features to support continued development and infrastructure costs.
            </p>
          </section>
        </div>
      </motion.div>
    </div>
  );
}
