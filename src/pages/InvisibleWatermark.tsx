import { Droplet, Info, Eye, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePageSEO } from '../lib/usePageSEO';

export default function InvisibleWatermark() {
  usePageSEO('Invisible Watermarks', 'Embed invisible steganographic tracking data into PDF documents for forensic tracing.');
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-100 dark:shadow-none">
            <Droplet className="w-10 h-10" />
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-3">Invisible Watermarks</h1>
          <p className="text-lg text-slate-500 dark:text-slate-400">
            Embed hidden tracking data into your PDF for forensic identification.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 mb-5 shadow-sm">
          <h2 className="font-bold text-slate-900 dark:text-white mb-3 text-lg">How Invisible Watermarking Works</h2>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li className="flex items-start gap-2"><Eye className="w-4 h-4 mt-0.5 text-indigo-500 shrink-0" /> Imperceptible to the human eye — looks like a normal PDF</li>
            <li className="flex items-start gap-2"><Eye className="w-4 h-4 mt-0.5 text-indigo-500 shrink-0" /> Unique ID embedded in PDF byte streams (steganography)</li>
            <li className="flex items-start gap-2"><Eye className="w-4 h-4 mt-0.5 text-indigo-500 shrink-0" /> Survives printing, scanning, and re-saving</li>
            <li className="flex items-start gap-2"><Eye className="w-4 h-4 mt-0.5 text-indigo-500 shrink-0" /> Used for forensic document tracing and leak detection</li>
          </ul>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-6 mb-8">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-amber-800 dark:text-amber-300 mb-2">Server-Side Processing Required</h3>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Invisible watermarking requires steganographic encoding at the binary level of PDF streams.
                This low-level byte manipulation cannot be done reliably or securely in a browser environment.
              </p>
            </div>
          </div>
        </div>

        <div className="text-center space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">Use visible watermarking instead:</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/watermark"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors"
            >
              <Droplet className="w-4 h-4" /> Visible Watermark
            </Link>
            <Link
              to="/pdf-sanitizer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              PDF Sanitizer <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
