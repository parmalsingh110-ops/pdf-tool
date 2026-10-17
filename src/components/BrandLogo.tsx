import React from 'react';

interface BrandLogoProps {
  className?: string;
}

/**
 * PDF Media Suite Official Brand Logo
 * Displays the iconic gradient rounded tile with the stylized white "P" emblem.
 */
export default function BrandLogo({ className = 'w-8 h-8' }: BrandLogoProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={`${className} shrink-0 drop-shadow-sm transition-transform group-hover:scale-105`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="PDF Media Suite Logo"
    >
      <defs>
        <linearGradient id="pms-brand-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e11d48" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect x="48" y="48" width="416" height="416" rx="96" fill="url(#pms-brand-gradient)" />
      {/* Bold Stylized Letter "P" */}
      <path
        d="M176 160h120c58.6 0 104 37.8 104 96s-45.4 96-104 96h-48v64h-72V160Zm72 64v64h48c23.8 0 40-12.8 40-32s-16.2-32-40-32h-48Z"
        fill="#ffffff"
      />
      {/* Folded Document Corner Accent */}
      <path d="M200 112h112l64 64v24H200z" fill="#ffffff" fillOpacity="0.28" />
    </svg>
  );
}
