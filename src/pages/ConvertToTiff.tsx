import React from 'react';
import { FileImage } from 'lucide-react';
import GenericToolUI from '../components/GenericToolUI';

export default function ConvertToTiff() {
  const handleProcess = async () => new Promise<string>(r => setTimeout(() => r('#done'), 1500));
  return <GenericToolUI title="Convert to TIFF" description="Convert your PDF to high-quality TIFF images." icon={FileImage} colorClass="text-indigo-500" bgClass="bg-indigo-50" actionText="Convert to TIFF" onProcess={handleProcess} requiresBackendAlert={true} outputExtension=".tiff" />;
}
