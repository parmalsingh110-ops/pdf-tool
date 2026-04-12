import React from 'react';
import { Search } from 'lucide-react';
import GenericToolUI from '../components/GenericToolUI';

export default function HighlightText() {
  const handleProcess = async () => new Promise<string>(r => setTimeout(() => r('#done'), 1500));
  return <GenericToolUI title="Highlight Search Terms" description="Automatically highlight specific keywords in your PDF." icon={Search} colorClass="text-yellow-500" bgClass="bg-yellow-50" actionText="Highlight Terms" onProcess={handleProcess} requiresBackendAlert={true} />;
}
