import React from 'react';
import { FileCode, Info } from 'lucide-react';

export default function PdfAConversion() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8 max-w-2xl mx-auto">
        <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <FileCode className="w-8 h-8" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">PDF/A Conversion</h1>
        <p className="text-xl text-gray-600 mb-6">Convert your PDF to PDF/A for long-term archiving compliance.</p>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-left">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-amber-800 mb-2">Server-Side Processing Required</h3>
              <p className="text-sm text-amber-700 mb-3">
                PDF/A conversion requires deep structure validation, font embedding checks, ICC color profile replacement, 
                and metadata schema compliance (XMP). This level of processing cannot be done in a browser — it requires 
                a backend service like Apache PDFBox, Ghostscript, or veraPDF.
              </p>
              <p className="text-xs text-amber-600">
                <strong>Alternative tools:</strong> Use our <a href="/flatten-pdf" className="underline font-semibold">Flatten PDF</a> or 
                <a href="/remove-metadata" className="underline font-semibold ml-1">Remove Metadata</a> tools for simpler archival preparation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
