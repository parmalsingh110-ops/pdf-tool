import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import GenericToolUI from '../components/GenericToolUI';

export default function PdfToWord() {
  const [processingState, setProcessingState] = useState('');

  const handleProcess = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      
      const paragraphs: Paragraph[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        setProcessingState(`Extracting linguistic data from page ${i} of ${pdf.numPages}...`);
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        
        let lastY = -1;
        let currentLineText = '';

        const items = content.items.map((item: any) => ({
          text: item.str,
          y: item.transform[5]
        }));

        // Sort by Y descending
        items.sort((a, b) => b.y - a.y);

        items.forEach(item => {
          if (lastY !== -1 && Math.abs(lastY - item.y) > 4) {
            // New line detected
            if (currentLineText.trim()) {
              paragraphs.push(new Paragraph({
                children: [new TextRun(currentLineText.trim())]
              }));
            }
            currentLineText = item.text + ' ';
          } else {
            currentLineText += item.text + ' ';
          }
          lastY = item.y;
        });

        // Push final line of the page
        if (currentLineText.trim()) {
          paragraphs.push(new Paragraph({
            children: [new TextRun(currentLineText.trim())]
          }));
        }

        // Add a page break paragraph (or just visual space)
        if (i < pdf.numPages) {
          paragraphs.push(new Paragraph({ text: '' }));
          paragraphs.push(new Paragraph({ text: '--- Page Break ---' }));
          paragraphs.push(new Paragraph({ text: '' }));
        }
      }

      setProcessingState('Compiling Word Document (.docx)...');
      
      const doc = new Document({
        sections: [{
          properties: {},
          children: paragraphs,
        }],
      });

      const blob = await Packer.toBlob(doc);
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error("PDF to Word Error:", error);
      throw error;
    }
  };

  return (
    <GenericToolUI 
      title="PDF to Word"
      description="Extract logic-based text paragraphs into a true DOCX format directly in your browser."
      icon={FileText}
      colorClass="text-blue-700"
      bgClass="bg-blue-50"
      actionText={processingState || "Convert to Word"}
      onProcess={handleProcess}
      requiresBackendAlert={false} // Fully functional now!
      outputExtension=".docx"
    />
  );
}
