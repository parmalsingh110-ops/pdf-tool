import { ShieldCheck, Info, Pen, ArrowRight, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePageSEO } from '../lib/usePageSEO';

export default function CryptographicSignatures() {
  usePageSEO('Cryptographic PDF Signatures', 'Sign PDFs with valid X.509 cryptographic certificates. PKI-based digital signing for legal compliance.');
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-green-50 dark:bg-green-950/40 text-green-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-100 dark:shadow-none">
            <ShieldCheck className="w-10 h-10" />
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-3">Cryptographic Signatures</h1>
          <p className="text-lg text-slate-500 dark:text-slate-400">
            Sign your PDFs with valid X.509 certificates for legal and compliance-grade signing.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 mb-5 shadow-sm">
          <h2 className="font-bold text-slate-900 dark:text-white mb-3 text-lg">What Cryptographic Signing Provides</h2>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li className="flex items-start gap-2"><ShieldCheck className="w-4 h-4 mt-0.5 text-green-500 shrink-0" /> Legally binding digital signatures (eIDAS, ESIGN compliant)</li>
            <li className="flex items-start gap-2"><ShieldCheck className="w-4 h-4 mt-0.5 text-green-500 shrink-0" /> X.509 certificate chain verification</li>
            <li className="flex items-start gap-2"><ShieldCheck className="w-4 h-4 mt-0.5 text-green-500 shrink-0" /> PKCS#7/CMS standard signature embedding</li>
            <li className="flex items-start gap-2"><ShieldCheck className="w-4 h-4 mt-0.5 text-green-500 shrink-0" /> Timestamping for long-term validity</li>
          </ul>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-6 mb-8">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-amber-800 dark:text-amber-300 mb-2">Server-Side Processing Required</h3>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                X.509 certificate-based PDF signing requires a secure keystore and PKCS#7/CMS infrastructure.
                Browsers cannot access private keys or certificate chains for compliance-grade signing.
                This feature requires a backend HSM (Hardware Security Module) or secure key vault.
              </p>
            </div>
          </div>
        </div>

        <div className="text-center space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">Use these available signing alternatives:</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/signature-pad"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors"
            >
              <Pen className="w-4 h-4" /> Draw Signature
            </Link>
            <Link
              to="/certify-document"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Certify Document <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
