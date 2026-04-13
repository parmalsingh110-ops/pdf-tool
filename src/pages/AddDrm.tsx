import React from 'react';
import { Lock, Info } from 'lucide-react';

export default function AddDrm() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8 max-w-2xl mx-auto">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Lock className="w-8 h-8" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Add DRM Protection</h1>
        <p className="text-xl text-gray-600 mb-6">Secure your document against unauthorized distribution.</p>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-left">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-amber-800 mb-2">Server-Side Processing Required</h3>
              <p className="text-sm text-amber-700 mb-3">DRM protection requires cryptographic licensing servers and persistent access control infrastructure that cannot run in a browser.</p>
              <p className="text-xs text-amber-600"><strong>Alternative:</strong> Use our <a href="/protect" className="underline font-semibold">Password Protect</a> tool to restrict access with a password.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
