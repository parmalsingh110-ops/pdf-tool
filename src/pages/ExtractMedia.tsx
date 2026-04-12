import React from 'react';
import { FileCode } from 'lucide-react';
import GenericToolUI from '../components/GenericToolUI';

export default function ExtractMedia() {
  const handleProcess = async () => new Promise<string>(r => setTimeout(() => r('#done'), 1500));
  return <GenericToolUI title="Extract Audio/Video" description="Extract embedded audio and video files from your PDF." icon={FileCode} colorClass="text-teal-500" bgClass="bg-teal-50" actionText="Extract Media" onProcess={handleProcess} requiresBackendAlert={true} />;
}
