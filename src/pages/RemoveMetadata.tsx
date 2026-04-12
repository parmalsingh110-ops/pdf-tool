import React from 'react';
import { Trash2 } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import GenericToolUI from '../components/GenericToolUI';

export default function RemoveMetadata() {
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
    
    const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
  };

  return (
    <GenericToolUI 
      title="Remove PDF Metadata"
      description="Remove author, title, and all other metadata tracks from your PDF."
      icon={Trash2}
      colorClass="text-red-500"
      bgClass="bg-red-50"
      actionText="Remove Metadata"
      onProcess={handleProcess}
    />
  );
}
