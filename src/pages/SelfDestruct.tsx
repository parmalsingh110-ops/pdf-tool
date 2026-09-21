import { Shield, Info, Clock, Lock, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

export default function SelfDestruct() {
  useSEO('Self Destruct Online Free | PDF Media Suite', 'Free online Self Destruct tool. No signup or installation required.');

  usePageSEO('Self-Destructing PDF', 'Create PDFs that expire or become inaccessible after a set time period.');
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-orange-50 dark:bg-orange-950/40 text-orange-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-orange-100 dark:shadow-none">
            <Shield className="w-10 h-10" />
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-3">Self-Destructing PDF</h1>
          <p className="text-lg text-slate-500 dark:text-slate-400">
            Create a PDF that expires or becomes inaccessible after a certain time or number of views.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 mb-5 shadow-sm">
          <h2 className="font-bold text-slate-900 dark:text-white mb-3 text-lg">How Self-Destructing Documents Work</h2>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li className="flex items-start gap-2"><Clock className="w-4 h-4 mt-0.5 text-orange-500 shrink-0" /> Time-based expiry — document opens only until a set date</li>
            <li className="flex items-start gap-2"><Clock className="w-4 h-4 mt-0.5 text-orange-500 shrink-0" /> View-count limits — accessible only N times</li>
            <li className="flex items-start gap-2"><Clock className="w-4 h-4 mt-0.5 text-orange-500 shrink-0" /> Key revocation — server removes decryption key after expiry</li>
            <li className="flex items-start gap-2"><Clock className="w-4 h-4 mt-0.5 text-orange-500 shrink-0" /> Remote kill-switch — revoke access from anywhere</li>
          </ul>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-6 mb-8">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-amber-800 dark:text-amber-300 mb-2">Server-Side Processing Required</h3>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Self-destructing documents require a licensing server that revokes decryption keys after a timeout.
                The PDF standard does not natively support time-based expiry — it requires an external key management system.
                This cannot be implemented in a browser environment.
              </p>
            </div>
          </div>
        </div>

        <div className="text-center space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">Use these alternatives to restrict access:</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/protect"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors"
            >
              <Lock className="w-4 h-4" /> Password Protect PDF
            </Link>
            <Link
              to="/add-drm"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              DRM Info <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
