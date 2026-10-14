import { Link } from 'react-router-dom';
import { FileQuestion, ArrowLeft, Search, Layers, Combine, FileText, Minimize2 } from 'lucide-react';
import { useSEO } from '../hooks/useSEO';

export default function NotFound() {
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
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16 dark:bg-slate-950">
      <div className="max-w-xl w-full text-center">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-6 shadow-sm border border-rose-100 dark:border-rose-900/40">
          <FileQuestion className="w-10 h-10" />
        </div>

        <span className="inline-block px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 rounded-full mb-3">
          Error 404 • Page Not Found
        </span>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-3">
          Looking for a PDF Tool?
        </h1>

        <p className="text-slate-600 dark:text-slate-300 text-sm sm:text-base mb-8 max-w-md mx-auto">
          The link you followed may be broken or the tool page has moved. Pick one of our popular tools below or search our 110+ free tools.
        </p>

        {/* Quick Links */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <Link
            to="/merge"
            className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-700 hover:shadow-md transition-all text-center group"
          >
            <Combine className="w-5 h-5 mx-auto mb-1.5 text-rose-600 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Merge PDF</span>
          </Link>
          <Link
            to="/pdf-to-word"
            className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all text-center group"
          >
            <FileText className="w-5 h-5 mx-auto mb-1.5 text-blue-600 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">PDF to Word</span>
          </Link>
          <Link
            to="/compress"
            className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md transition-all text-center group"
          >
            <Minimize2 className="w-5 h-5 mx-auto mb-1.5 text-emerald-600 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Compress</span>
          </Link>
          <Link
            to="/all-tools"
            className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-md transition-all text-center group"
          >
            <Layers className="w-5 h-5 mx-auto mb-1.5 text-violet-600 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">All 110+ Tools</span>
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-md transition-all w-full sm:w-auto"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Homepage
          </Link>
          <Link
            to="/all-tools"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-sm transition-all w-full sm:w-auto"
          >
            <Search className="w-4 h-4" />
            Search All Tools
          </Link>
        </div>
      </div>
    </div>
  );
}
