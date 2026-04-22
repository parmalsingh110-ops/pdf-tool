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
        include: ['crypto', 'buffer', 'stream', 'vm'],
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
    },
  };
});
