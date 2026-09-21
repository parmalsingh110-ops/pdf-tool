import { Link } from 'react-router-dom';
import { ArrowLeft, User, Target, Route } from 'lucide-react';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

export default function About() {
  useSEO('About Online Free | PDF Media Suite', 'Free online About tool. No signup or installation required.');

  usePageSEO(
    'About | PDF Media Suite',
    'PDF Media Suite is an independent, founder-led software project focused on making practical PDF and document productivity tools accessible through the web.'
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
          <User className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">About PDF Media Suite</h1>
      </div>
      
      <div className="space-y-10 text-base leading-relaxed">
        <section>
          <p>
            PDF Media Suite is an independent, founder-led software project focused on making practical PDF and document productivity tools accessible through the web.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
            <User className="w-5 h-5 text-rose-600" />
            Founder & Developer
          </h2>
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <p className="font-bold text-lg text-slate-900 dark:text-white mb-2">Parmal Singh Gurjar</p>
            <p className="text-slate-600 dark:text-slate-400">
              Founded and developed by Parmal Singh Gurjar.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
            <Target className="w-5 h-5 text-rose-600" />
            Vision
          </h2>
          <p>
            To make everyday PDF and document workflows simpler and more accessible through a single web-based productivity platform.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
            <Route className="w-5 h-5 text-rose-600" />
            Product Roadmap
          </h2>
          
          <div className="space-y-6">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white mb-2">Current</h3>
              <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400">
                <li>PDF editing</li>
                <li>Document conversion</li>
                <li>OCR</li>
                <li>PDF/image utilities</li>
                <li>Browser-based document workflows</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white mb-2">Next</h3>
              <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400">
                <li>Improved document conversion fidelity</li>
                <li>Improved PDF editing</li>
                <li>Faster processing</li>
                <li>Additional document automation</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-slate-900 dark:text-white mb-2">Future</h3>
              <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400">
                <li>Additional productivity workflows</li>
                <li>Optional premium capabilities if commercially appropriate</li>
                <li>Scalable infrastructure</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
