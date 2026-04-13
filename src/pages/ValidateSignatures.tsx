import React from 'react';
import { CheckCircle, Info } from 'lucide-react';

export default function ValidateSignatures() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8 max-w-2xl mx-auto">
        <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6"><CheckCircle className="w-8 h-8" /></div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Validate Signatures</h1>
        <p className="text-xl text-gray-600 mb-6">Check if digital signatures and certificates in a PDF are valid.</p>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-left">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-amber-800 mb-2">Server-Side Processing Required</h3>
              <p className="text-sm text-amber-700">Signature validation requires certificate chain verification against trusted root CAs, CRL/OCSP checking, and PKCS#7 parsing — none of which are available in a browser environment.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
