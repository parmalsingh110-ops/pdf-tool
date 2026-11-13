import { Link } from 'react-router-dom';
import { FileQuestion, ArrowLeft, Search, Layers, Combine, FileText, Minimize2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useSEO } from '../hooks/useSEO';
import { VERIFIED_TOOL_COUNT } from '../components/GlobalSearch';
import PearlAuroraBackground from '../components/pearl/PearlAuroraBackground';

export default function NotFound() {
  const prefersReduced = useReducedMotion();
  useSEO({
    title: 'Page Not Found (404)',
    description: 'The page or PDF tool you are looking for does not exist or may have been moved.',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: '404 Not Found — PDF Media Suite',
      description: 'The requested page was not found.',
    },
  });

  return (
    <div
      className="relative flex-1 min-h-[75vh] flex items-center justify-center px-4 py-16 transition-colors"
      style={{ backgroundColor: 'var(--pms-pearl)', color: 'var(--pms-ink)' }}
    >
      <PearlAuroraBackground mode="workspace" />
      <motion.div
        initial={prefersReduced ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 max-w-xl w-full text-center"
      >
        <div
          className="w-20 h-20 mx-auto rounded-3xl flex items-center justify-center mb-6 border"
          style={{
            backgroundColor: 'var(--pms-soft-rose)',
            color: 'var(--pms-rose)',
            borderColor: 'var(--pms-border)',
            boxShadow: 'var(--pms-shadow-sm)',
          }}
        >
          <FileQuestion className="w-10 h-10" />
        </div>

        <span
          className="inline-block px-3.5 py-1 text-xs font-bold uppercase tracking-wider rounded-full mb-3 border"
          style={{
            backgroundColor: 'var(--pms-soft-lavender)',
            color: 'var(--pms-violet)',
            borderColor: 'var(--pms-border)',
          }}
        >
          Error 404 • Page Not Found
        </span>

        <h1 className="text-3xl sm:text-4xl font-extrabold mb-3" style={{ color: 'var(--pms-ink)' }}>
          Looking for a PDF Tool?
        </h1>

        <p className="text-sm sm:text-base mb-8 max-w-md mx-auto" style={{ color: 'var(--pms-muted)' }}>
          The link you followed may be broken or the tool page has moved. Pick one of our popular tools below or search our {VERIFIED_TOOL_COUNT}+ free tools.
        </p>

        {/* Quick Links */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <Link
            to="/merge"
            className="p-3.5 rounded-2xl border hover:border-rose-300 dark:hover:border-rose-700 hover:-translate-y-0.5 transition-all text-center group"
            style={{ backgroundColor: 'var(--pms-white)', borderColor: 'var(--pms-border)', boxShadow: 'var(--pms-shadow-sm)' }}
          >
            <Combine className="w-5 h-5 mx-auto mb-1.5 text-[var(--pms-rose)] group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold block" style={{ color: 'var(--pms-ink)' }}>Merge PDF</span>
          </Link>
          <Link
            to="/pdf-to-word"
            className="p-3.5 rounded-2xl border hover:border-sky-300 dark:hover:border-sky-700 hover:-translate-y-0.5 transition-all text-center group"
            style={{ backgroundColor: 'var(--pms-white)', borderColor: 'var(--pms-border)', boxShadow: 'var(--pms-shadow-sm)' }}
          >
            <FileText className="w-5 h-5 mx-auto mb-1.5 text-[var(--pms-blue)] group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold block" style={{ color: 'var(--pms-ink)' }}>PDF to Word</span>
          </Link>
          <Link
            to="/compress"
            className="p-3.5 rounded-2xl border hover:border-emerald-300 dark:hover:border-emerald-700 hover:-translate-y-0.5 transition-all text-center group"
            style={{ backgroundColor: 'var(--pms-white)', borderColor: 'var(--pms-border)', boxShadow: 'var(--pms-shadow-sm)' }}
          >
            <Minimize2 className="w-5 h-5 mx-auto mb-1.5 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold block" style={{ color: 'var(--pms-ink)' }}>Compress</span>
          </Link>
          <Link
            to="/all-tools"
            className="p-3.5 rounded-2xl border hover:border-violet-300 dark:hover:border-violet-700 hover:-translate-y-0.5 transition-all text-center group"
            style={{ backgroundColor: 'var(--pms-white)', borderColor: 'var(--pms-border)', boxShadow: 'var(--pms-shadow-sm)' }}
          >
            <Layers className="w-5 h-5 mx-auto mb-1.5 text-[var(--pms-violet)] group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold block" style={{ color: 'var(--pms-ink)' }}>All {VERIFIED_TOOL_COUNT}+ Tools</span>
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full pms-btn-primary font-bold text-sm w-full sm:w-auto"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Homepage
          </Link>
          <Link
            to="/all-tools"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border font-bold text-sm transition-all hover:border-rose-300 w-full sm:w-auto"
            style={{ backgroundColor: 'var(--pms-white)', borderColor: 'var(--pms-border-strong)', color: 'var(--pms-ink)' }}
          >
            <Search className="w-4 h-4" />
            Search All Tools
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
