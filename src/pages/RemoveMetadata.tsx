import React from 'react';
import { Trash2 } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import GenericToolUI from '../components/GenericToolUI';
import { useSEO } from '../hooks/useSEO';
import { toArrayBufferBytes } from '../lib/blobUrl';

export default function RemoveMetadata() {
  useSEO('Remove Metadata Online Free | PDF Media Suite', 'Free online Remove Metadata tool. No signup or installation required.');

  const handleProcess = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    
    // Core metadata stripping
    pdfDoc.setTitle('');
    pdfDoc.setAuthor('');
    pdfDoc.setSubject('');
    pdfDoc.setKeywords([]);
    pdfDoc.setProducer('');
    pdfDoc.setCreator('');
    
    const pdfBytes = toArrayBufferBytes(await pdfDoc.save({ useObjectStreams: false }));
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
  };

  return (
    <GenericToolUI 
      title="Remove PDF Metadata"
      description="Remove author, title, and all other metadata tracks from your PDF."
      icon={Trash2}
      colorClass="text-red-500 dark:text-red-400"
      bgClass="bg-red-50 dark:bg-red-950/40"
      actionText="Remove Metadata"
      onProcess={handleProcess}
    />
  );
}
