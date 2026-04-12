import React, { useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import GenericToolUI from '../components/GenericToolUI';

export default function VideoToPdf() {
  const [processingState, setProcessingState] = useState('');

  const handleProcess = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      setProcessingState('Loading video buffer...');
      
      const video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      video.muted = true;
      video.crossOrigin = 'anonymous';

      video.onloadeddata = async () => {
        try {
          const duration = video.duration;
          // Capture up to 10 frames
          const frameCount = 10;
          const interval = duration / frameCount;
          
          const newPdf = await PDFDocument.create();
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          if (!ctx) throw new Error('Canvas context failed');

          for (let i = 0; i < frameCount; i++) {
            setProcessingState(`Extracting frame ${i + 1} of ${frameCount}...`);
            
            const timePos = i * interval;
            video.currentTime = timePos;
            
            // Wait for seek
            await new Promise<void>((res) => {
              video.onseeked = () => res();
            });

            // Draw current frame to canvas
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imgDataUrl = canvas.toDataURL('image/jpeg', 0.85);

            // Fetch as bytes and embed
            const imgBytes = await fetch(imgDataUrl).then(r => r.arrayBuffer());
            const pdfImage = await newPdf.embedJpg(imgBytes);

            const page = newPdf.addPage([canvas.width, canvas.height]);
            page.drawImage(pdfImage, {
              x: 0,
              y: 0,
              width: canvas.width,
              height: canvas.height
            });
          }

          setProcessingState('Compiling final PDF storyboard...');
          const pdfBytes = await newPdf.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          
          URL.revokeObjectURL(video.src);
          resolve(URL.createObjectURL(blob));
        } catch (err) {
          reject(err);
        }
      };

      video.onerror = (e) => reject(new Error('Failed to load video'));
    });
  };

  return (
    <GenericToolUI 
      title="Video to PDF"
      description="Extract frames from a video and compile them into a seamless PDF storyboard."
      icon={ImageIcon}
      colorClass="text-blue-500"
      bgClass="bg-blue-50"
      actionText={processingState || "Convert to PDF"}
      onProcess={handleProcess}
      accept={{"video/*": [".mp4", ".mov", ".webm"]}}
      requiresBackendAlert={false} // Implemented purely native mapping without backend!
    />
  );
}
