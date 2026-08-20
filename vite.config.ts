import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      nodePolyfills({
        include: ['crypto', 'buffer', 'stream', 'vm', 'http', 'https', 'url', 'assert'],
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    // Render sends a real Host header; Vite 6 preview blocks unknown hosts unless listed here.
    preview: {
      host: '0.0.0.0',
      allowedHosts: [
        'mediasuite.onrender.com',
        'pdfmediasuite.in',
        'www.pdfmediasuite.in',
        'localhost',
        '127.0.0.1',
      ],
      // Content-Security-Policy via HTTP headers (stronger than <meta> tag).
      // Mirrors the policy in index.html; keep both in sync.
      headers: {
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src  'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
          "style-src   'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src    'self' https://fonts.gstatic.com data:",
          "img-src     'self' data: blob: https:",
          "media-src   'self' blob:",
          "connect-src 'self' https://*.onrender.com https://pdfmediasuite.in https://www.pdfmediasuite.in https://generativelanguage.googleapis.com https://staticimgly.com http://localhost:8000 http://127.0.0.1:8000",
          "worker-src  'self' blob:",
          "object-src  'none'",
          "frame-src   'none'",
          "base-uri    'self'",
          "form-action 'self'",
        ].join('; '),
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    },
  };
});
