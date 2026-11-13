import { Link } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useSEO } from '../hooks/useSEO';
import PearlAuroraBackground from '../components/pearl/PearlAuroraBackground';

export default function Privacy() {
  const prefersReduced = useReducedMotion();
  useSEO(
    'Privacy Policy — Browser-First & Ephemeral Private Document Processing | PDF Media Suite',
    'PDF Media Suite runs most tools directly in your browser. Server-assisted Office/OCR conversions and E2EE print relays process files ephemerally with immediate deletion and zero permanent storage.'
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
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-2xl" style={{ backgroundColor: 'var(--pms-soft-rose)', color: 'var(--pms-rose)' }}>
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold" style={{ color: 'var(--pms-ink)' }}>Privacy &amp; processing</h1>
        </div>
        <div
          className="space-y-6 text-sm leading-relaxed rounded-3xl border p-6 sm:p-8"
          style={{
            backgroundColor: 'var(--pms-white)',
            borderColor: 'var(--pms-border)',
            boxShadow: 'var(--pms-shadow-card)',
          }}
        >
        <p>
          Most tools in PDF Media Suite run <strong>in your browser</strong> (client-side). Files you select are
          processed locally where possible and are not uploaded to our servers by default.
        </p>
        <p>
          <strong>Server-assisted conversions &amp; ephemeral E2EE relays</strong> (such as PDF/Office conversions,
          lossless unlock, URL-to-PDF, or QR Print Drop / Counter Kiosk) process data ephemerally with immediate
          post-response deletion or short TTL auto-purge (≤ 20 minutes). Print Drop &amp; TalkingNotes QR transfers
          use browser-side AES-256-GCM encryption with per-room access tokens.
        </p>
        <p>
          <strong>OCR &amp; image tools</strong> may download language or model data from third-party CDNs
          (e.g. Tesseract, background removal). That traffic is subject to those providers&apos; policies.
        </p>
        <p>
          <strong>Target file size</strong> features aim to keep output <em>at or below</em> your limit; exact
          byte size depends on format and content.
        </p>
        <p>
          <strong>Zero Permanent Storage &amp; Minimal Browser Storage:</strong> Preferences such as recent tools, theme,
          or shop billing settings stay strictly inside your local browser storage (<code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">localStorage</code> /{' '}
          <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">sessionStorage</code>). Shared OS/WhatsApp
          files cached via PWA Share Target auto-expire within 10 minutes or as soon as opened. You can wipe all
          browser traces, queued logs, and local keys in 1 click using the <strong>Erase All Browser Traces</strong> button in the footer.
        </p>
        <p>
          <strong>Privacy-Safe Crash Diagnostics &amp; AI Features:</strong> Automated crash telemetry strips document
          filenames, URL hash secrets (<code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">#k=</code>), tokens,
          and API keys before queuing or sending reports. Optional BYOK AI features send data only when explicitly
          triggered using your session-scoped key.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          This page is informational and not legal advice. For questions about our privacy practices or data handling, contact us at{' '}
          <a href="mailto:support@pdfmediasuite.in" className="font-medium hover:underline" style={{ color: 'var(--pms-rose)' }}>
            support@pdfmediasuite.in
          </a>.
        </p>
        </div>
      </motion.div>
    </div>
  );
}
