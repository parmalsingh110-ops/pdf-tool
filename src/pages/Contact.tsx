import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, MessageSquare } from 'lucide-react';
import { usePageSEO } from '../lib/usePageSEO';

export default function Contact() {
  usePageSEO(
    'Contact & Support | PDF Media Suite',
    'Contact PDF Media Suite for product support, feedback, bug reports or business enquiries.'
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
          <MessageSquare className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">Contact & Support</h1>
      </div>
      
      <div className="space-y-8 text-base leading-relaxed">
        <section>
          <p className="mb-8">
            For product support, feedback, bug reports or business enquiries, contact:
          </p>

          <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center">
            <Mail className="w-10 h-10 text-rose-600 mx-auto mb-4" />
            <a 
              href="mailto:parmalsingh26@gmail.com" 
              className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
            >
              parmalsingh26@gmail.com
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
