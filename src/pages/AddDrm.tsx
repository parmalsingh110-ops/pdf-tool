import { Lock, Info, ShieldOff, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePageSEO } from '../lib/usePageSEO';

export default function AddDrm() {
  usePageSEO('Add DRM Protection', 'Add DRM (Digital Rights Management) protection to PDFs. Restrict copying, printing, and redistribution.');
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl mx-auto">
        {/* Icon + heading */}
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-red-50 dark:bg-red-950/40 text-red-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-red-100 dark:shadow-none">
            <Lock className="w-10 h-10" />
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-3">Add DRM Protection</h1>
          <p className="text-lg text-slate-500 dark:text-slate-400">
            Restrict copying, printing, and redistribution of your PDF documents.
          </p>
        </div>

        {/* What DRM does */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 mb-5 shadow-sm">
          <h2 className="font-bold text-slate-900 dark:text-white mb-3 text-lg">What DRM Provides</h2>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li className="flex items-start gap-2"><ShieldOff className="w-4 h-4 mt-0.5 text-red-400 shrink-0" /> Prevent unauthorized copying of document content</li>
            <li className="flex items-start gap-2"><ShieldOff className="w-4 h-4 mt-0.5 text-red-400 shrink-0" /> Restrict or disable printing permissions</li>
            <li className="flex items-start gap-2"><ShieldOff className="w-4 h-4 mt-0.5 text-red-400 shrink-0" /> Revoke access remotely after distribution</li>
          </ul>
        </div>

        {/* Why not in browser */}
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-6 mb-8">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-amber-800 dark:text-amber-300 mb-2">Server-Side Processing Required</h3>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                DRM protection requires cryptographic licensing servers and persistent access control infrastructure.
                True DRM cannot run in a browser — it requires a backend key management server.
              </p>
            </div>
          </div>
        </div>

        {/* Alternative CTA */}
        <div className="text-center space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">In the meantime, use these available alternatives:</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/protect"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors"
            >
              <Lock className="w-4 h-4" /> Password Protect PDF
            </Link>
            <Link
              to="/batch-protect"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Batch Protect <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
