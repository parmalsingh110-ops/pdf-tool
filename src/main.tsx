import React from 'react';
import './lib/pdfWorker';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './context/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';
import { initGlobalErrorLogging } from './lib/telemetry';
import { initDomResilience } from './lib/domResilience';
import { initChunkReloader } from './lib/chunkReloader';
import { registerServiceWorker } from './lib/shareTarget';

// Register Service Worker for PWA & Web Share Target (WhatsApp / System file share)
registerServiceWorker();

// Automatically handle and recover from stale build chunk errors after deployments
initChunkReloader();

// Prevent browser translate and extension DOM mutations from crashing React
initDomResilience();

// Activate automatic silent crash and unhandled error reporter
initGlobalErrorLogging();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary locationKey="root">
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
);
