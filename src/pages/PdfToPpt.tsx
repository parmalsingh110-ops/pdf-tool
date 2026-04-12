import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pptxgen from 'pptxgenjs';
import GenericToolUI from '../components/GenericToolUI';

export default function PdfToPpt() {
  const [processingState, setProcessingState] = useState('');

  const handleProcess = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      
      const pres = new pptxgen();

      for (let i = 1; i <= pdf.numPages; i++) {
        setProcessingState(`Rendering high-res slide ${i} of ${pdf.numPages}...`);
        const page = await pdf.getPage(i);
        
        // Render to canvas to act as the slide background
        const viewport = page.getViewport({ scale: 2.0 }); // High quality
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
        
        const imgDataUrl = canvas.toDataURL('image/jpeg', 0.85);

        // Define layout based on page aspect ratio
        const aspect = viewport.width / viewport.height;
        const layoutId = aspect > 1 ? 'LAYOUT_16x9' : 'LAYOUT_4x3';
        pres.layout = layoutId;

        // Add to presentation
        const slide = pres.addSlide();
        slide.addImage({ data: imgDataUrl, x: 0, y: 0, w: '100%', h: '100%' });
        
        canvas.width = 0;
        canvas.height = 0;
      }

      setProcessingState('Compiling PowerPoint (.pptx)...');
      
      const blob = await pres.write({ outputType: 'blob' }) as Blob;
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error("PDF to PPT Error:", error);
      throw error;
    }
  };

  return (
    <GenericToolUI 
      title="PDF to PowerPoint"
      description="Convert PDF pages into high-fidelity PowerPoint (PPTX) slides."
      icon={FileText}
      colorClass="text-orange-700"
      bgClass="bg-orange-50"
      actionText={processingState || "Convert to PPT"}
      onProcess={handleProcess}
      requiresBackendAlert={false} // Currently fully functional using canvas rasterization!
      outputExtension=".pptx"
    />
  );
}
