import React from 'react';
import { Droplet } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import GenericToolUI from '../components/GenericToolUI';

export default function InvertColorsPDF() {
  const handleProcess = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const numPages = pdf.numPages;
    const newPdfDoc = await PDFDocument.create();
    
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      await page.render({ 
        canvasContext: ctx, 
        viewport,
        canvas: canvas
      }).promise;
      
      // Invert colors
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      for (let j = 0; j < data.length; j += 4) {
        data[j] = 255 - data[j];         // red
        data[j + 1] = 255 - data[j + 1]; // green
        data[j + 2] = 255 - data[j + 2]; // blue
      }
      ctx.putImageData(imgData, 0, 0);
      
      const imgDataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const imgBytes = await fetch(imgDataUrl).then(res => res.arrayBuffer());
      
      const pdfImage = await newPdfDoc.embedJpg(imgBytes);
      const newPage = newPdfDoc.addPage([viewport.width, viewport.height]);
      newPage.drawImage(pdfImage, {
        x: 0,
        y: 0,
        width: viewport.width,
        height: viewport.height,
      });
      
      canvas.width = 0;
      canvas.height = 0;
    }
    
    const pdfBytes = await newPdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
  };

  return (
    <GenericToolUI 
      title="Invert Colors"
      description="Invert the colors of your PDF document (e.g., great for dark mode reading)."
      icon={Droplet}
      colorClass="text-zinc-800"
      bgClass="bg-zinc-100"
      actionText="Invert PDF Colors"
      onProcess={handleProcess}
    />
  );
}
