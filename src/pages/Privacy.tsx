import { Link } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';

export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 text-slate-700 dark:text-slate-300">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm font-semibold text-rose-600 dark:text-rose-400 mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to home
      </Link>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600">
          <Shield className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">Privacy &amp; processing</h1>
      </div>
      <div className="space-y-6 text-sm leading-relaxed">
        <p>
          Most tools in MediaSuite run <strong>in your browser</strong> (client-side). Files you select are
          processed locally where possible and are not uploaded to our servers by default.
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
          <strong>Recent tools</strong> (optional header list) stores only route names and titles in{' '}
          <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">localStorage</code> — not your files.
        </p>
        <p>
          <strong>AI / cloud features</strong> (if enabled in a tool) would only send data when you explicitly
          run that action; check each tool&apos;s on-screen notice.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          This page is informational and not legal advice. For enterprise deployments, add your own DPA and
          retention policy.
        </p>
      </div>
    </div>
  );
}
