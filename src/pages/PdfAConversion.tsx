import React from 'react';
import { FileCode } from 'lucide-react';
import GenericToolUI from '../components/GenericToolUI';

export default function PdfAConversion() {
  const handleProcess = async () => new Promise<string>(r => setTimeout(() => r('#done'), 1500));
  return <GenericToolUI title="PDF/A Conversion" description="Convert your PDF to PDF/A for long-term archiving." icon={FileCode} colorClass="text-blue-500" bgClass="bg-blue-50" actionText="Convert to PDF/A" onProcess={handleProcess} requiresBackendAlert={true} />;
}
