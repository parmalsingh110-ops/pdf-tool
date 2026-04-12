import React from 'react';
import { Scissors } from 'lucide-react';
import GenericToolUI from '../components/GenericToolUI';

export default function RemoveText() {
  const handleProcess = async () => new Promise<string>(r => setTimeout(() => r('#done'), 1500));
  return <GenericToolUI title="Remove Text" description="Permanently remove or redact text from a PDF." icon={Scissors} colorClass="text-red-500" bgClass="bg-red-50" actionText="Remove Text" onProcess={handleProcess} requiresBackendAlert={true} />;
}
