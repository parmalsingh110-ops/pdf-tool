import React from 'react';
import { CheckCircle, Info } from 'lucide-react';

export default function CertifyDocument() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8 max-w-2xl mx-auto">
        <div className="w-16 h-16 bg-teal-50 text-teal-500 rounded-2xl flex items-center justify-center mx-auto mb-6"><CheckCircle className="w-8 h-8" /></div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Certify Document</h1>
        <p className="text-xl text-gray-600 mb-6">Certify your document to lock it against any further tampering.</p>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-left">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-amber-800 mb-2">Server-Side Processing Required</h3>
              <p className="text-sm text-amber-700 mb-3">Document certification requires PKCS#7 digital signatures with MDP (Modification Detection and Prevention) permissions — a secure server-side operation involving certificate chains and timestamping authorities (TSA).</p>
              <p className="text-xs text-amber-600"><strong>Alternative:</strong> Use our <a href="/edit" className="underline font-semibold">PDF Editor</a> to add a visual signature for informal certification.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
