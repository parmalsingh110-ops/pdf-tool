import React from 'react';
import { Lock } from 'lucide-react';
import GenericToolUI from '../components/GenericToolUI';

export default function BatchProtect() {
  const handleProcess = async () => new Promise<string>(r => setTimeout(() => r('#done'), 1500));
  return <GenericToolUI title="Batch Protect" description="Protect multiple PDF files at once with a single password." icon={Lock} colorClass="text-purple-500" bgClass="bg-purple-50" actionText="Protect PDFs" onProcess={handleProcess} multiple={true} requiresBackendAlert={true} />;
}
