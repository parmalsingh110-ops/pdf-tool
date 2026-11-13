import { Link } from 'react-router-dom';
import { ArrowLeft, Scale } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useSEO } from '../hooks/useSEO';
import PearlAuroraBackground from '../components/pearl/PearlAuroraBackground';

export default function TermsOfService() {
  const prefersReduced = useReducedMotion();
  useSEO(
    'Terms of Service | PDF Media Suite',
    'Terms and conditions for utilizing PDF Media Suite online document tools and services.'
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
            <Scale className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold" style={{ color: 'var(--pms-ink)' }}>Terms of Service</h1>
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
          By using PDF Media Suite, you agree to these Terms of Service. PDF Media Suite is a digital-first software product delivered through the web.
        </p>

        <section className="mt-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">1. Use of the Service</h2>
          <p>
            PDF Media Suite provides a working browser-based document productivity application with tools for PDF editing, conversion, OCR and image processing. The service is provided "as is" and "as available". We do not guarantee 100% perfect conversion accuracy or uninterrupted availability.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">2. User Responsibilities</h2>
          <p>
            You are solely responsible for the documents and images you process using this platform. You agree not to use the tools for illegal, abusive, or harmful activities, or to process files that infringe on the intellectual property rights of others.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">3. Usage Limits</h2>
          <p>
            While the core tools are currently free of charge, reasonable usage limits may apply to certain resource-intensive tools to protect service availability for all users.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">4. Intellectual Property</h2>
          <p>
            All rights, title, and interest in and to the PDF Media Suite platform, including its code, design, and features, belong to its developer.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">5. Limitation of Liability</h2>
          <p>
            PDF Media Suite and its founder shall not be liable for any direct, indirect, incidental, or consequential damages resulting from the use or inability to use the service, including data loss or file corruption.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">6. Contact & Enquiries</h2>
          <p>
            For any questions, legal notices, or feedback regarding these Terms, contact our official support team at{' '}
            <a href="mailto:support@pdfmediasuite.in" className="font-semibold hover:underline" style={{ color: 'var(--pms-rose)' }}>
              support@pdfmediasuite.in
            </a>.
          </p>
        </section>
        </div>
      </motion.div>
    </div>
  );
}
