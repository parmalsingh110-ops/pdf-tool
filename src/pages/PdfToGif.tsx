import React from 'react';
import { ImageIcon } from 'lucide-react';
import GenericToolUI from '../components/GenericToolUI';

export default function PdfToGif() {
  const handleProcess = async () => new Promise<string>(r => setTimeout(() => r('#done'), 1500));
  return <GenericToolUI title="PDF to GIF" description="Create an animated GIF from your PDF pages." icon={ImageIcon} colorClass="text-purple-500" bgClass="bg-purple-50" actionText="Convert to GIF" onProcess={handleProcess} requiresBackendAlert={true} outputExtension=".gif" />;
}
