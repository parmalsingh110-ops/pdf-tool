import React from 'react';
import { FileType } from 'lucide-react';
import GenericToolUI from '../components/GenericToolUI';

export default function FontExtractor() {
  const handleProcess = async () => new Promise<string>(r => setTimeout(() => r('#done'), 1500));
  return <GenericToolUI title="Font Extractor" description="Extract embedded fonts from your PDF documents." icon={FileType} colorClass="text-indigo-500" bgClass="bg-indigo-50" actionText="Extract Fonts" onProcess={handleProcess} requiresBackendAlert={true} />;
}
