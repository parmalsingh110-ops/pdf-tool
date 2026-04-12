import React from 'react';
import { Droplet } from 'lucide-react';
import GenericToolUI from '../components/GenericToolUI';

export default function InvisibleWatermark() {
  const handleProcess = async () => new Promise<string>(r => setTimeout(() => r('#done'), 1500));
  return <GenericToolUI title="Invisible Watermarks" description="Embed invisible tracking data into your PDF." icon={Droplet} colorClass="text-indigo-500" bgClass="bg-indigo-50" actionText="Add Invisible Watermark" onProcess={handleProcess} requiresBackendAlert={true} />;
}
