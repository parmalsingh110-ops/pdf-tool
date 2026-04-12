import React from 'react';
import { Lock } from 'lucide-react';
import GenericToolUI from '../components/GenericToolUI';

export default function AddDrm() {
  const handleProcess = async () => new Promise<string>(r => setTimeout(() => r('#done'), 1500));
  return <GenericToolUI title="Add DRM" description="Secure your document against unauthorized distribution." icon={Lock} colorClass="text-red-500" bgClass="bg-red-50" actionText="Add DRM" onProcess={handleProcess} requiresBackendAlert={true} />;
}
