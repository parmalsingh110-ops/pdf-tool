import React from 'react';
import { FileImage } from 'lucide-react';
import GenericToolUI from '../components/GenericToolUI';

export default function ConvertToWebP() {
  const handleProcess = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('Failed to get context');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/webp', 0.8));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  return (
    <GenericToolUI 
      title="Convert to WebP"
      description="Convert JPG or PNG images to next-gen WebP format for smaller file sizes."
      icon={FileImage}
      colorClass="text-emerald-500"
      bgClass="bg-emerald-50"
      actionText="Convert to WebP"
      onProcess={handleProcess}
      accept={{ "image/*": [".png", ".jpg", ".jpeg"] }}
      outputExtension=".webp"
    />
  );
}
