import { Link } from 'react-router-dom';
import { ArrowLeft, Tag, CheckCircle } from 'lucide-react';
import { usePageSEO } from '../lib/usePageSEO';

export default function Pricing() {
  usePageSEO(
    'Pricing | PDF Media Suite',
    'PDF Media Suite currently provides its core PDF, document and image tools free of charge.'
  );

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 text-slate-700 dark:text-slate-300">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm font-semibold text-rose-600 dark:text-rose-400 mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to home
      </Link>
      
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600">
          <Tag className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">Pricing</h1>
      </div>
      
      <div className="space-y-8 text-base leading-relaxed">
        <section>
          <div className="p-8 rounded-2xl border-2 border-rose-100 dark:border-rose-900/50 bg-white dark:bg-slate-900 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Free</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              PDF Media Suite currently provides its core PDF, document and image tools free of charge.
            </p>
            
            <ul className="space-y-3 mb-6">
              <li className="flex items-start gap-3 text-slate-700 dark:text-slate-300">
                <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <span>Access to PDF editing, conversion, OCR and image processing tools.</span>
              </li>
              <li className="flex items-start gap-3 text-slate-700 dark:text-slate-300">
                <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <span>Browser-based processing for maximum privacy.</span>
              </li>
            </ul>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-sm">
              <p className="font-semibold text-slate-900 dark:text-white mb-1">Usage Note:</p>
              <p>Reasonable usage limits may apply to certain tools to protect service availability.</p>
            </div>
          </div>
        </section>
        
        <section className="pt-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Business Model</h2>
          <p className="mb-4">
            PDF Media Suite is a digital-first software product delivered through the web. The platform is designed to provide document and PDF processing capabilities directly through a browser rather than through consulting or custom development services.
          </p>
          <p>
            As the product grows, the platform may introduce optional premium capabilities or usage-based features to support continued development and infrastructure costs.
          </p>
        </section>
      </div>
    </div>
  );
}
