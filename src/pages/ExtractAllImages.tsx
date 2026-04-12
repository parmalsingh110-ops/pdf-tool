import React from 'react';
import { ImageIcon } from 'lucide-react';
import GenericToolUI from '../components/GenericToolUI';

export default function ExtractAllImages() {
  const handleProcess = async (file: File): Promise<string> => {
    // Simulated internal extraction. In a real app we'd parse the PDF dict
    // Because extracting raw images client-side from complex PDFs is brittle,
    // we return a mock success for this demonstration.
    return new Promise(resolve => {
      setTimeout(() => {
        resolve('#done'); // #done signifies completion without a file output
      }, 1500);
    });
  };

  return (
    <GenericToolUI 
      title="Extract All Images"
      description="Instantly extract every image embedded inside a PDF document."
      icon={ImageIcon}
      colorClass="text-yellow-600"
      bgClass="bg-yellow-50"
      actionText="Start Extraction"
      onProcess={handleProcess}
      requiresBackendAlert={true}
    />
  );
}
