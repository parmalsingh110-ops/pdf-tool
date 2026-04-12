import React from 'react';
import { Hash } from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import GenericToolUI from '../components/GenericToolUI';

export default function BatesNumbering() {
  const handleProcess = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const pages = pdfDoc.getPages();
    
    pages.forEach((page, idx) => {
      const { width } = page.getSize();
      // Bates Numbering format: prefix-0000X
      const text = `DOC-000${idx + 1}`;
      const textWidth = helveticaFont.widthOfTextAtSize(text, 14);
      
      page.drawText(text, {
        x: width - textWidth - 30, // Bottom right corner
        y: 30,
        size: 14,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      });
    });

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
  };

  return (
    <GenericToolUI 
      title="Add Bates Numbering"
      description="Apply standard Bates numbering to your legal or business PDFs."
      icon={Hash}
      colorClass="text-red-600"
      bgClass="bg-red-50"
      actionText="Apply Bates Numbers"
      onProcess={handleProcess}
    />
  );
}
