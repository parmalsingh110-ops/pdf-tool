import React from 'react';
import './lib/pdfWorker';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './context/ThemeContext';
import { initGlobalErrorLogging } from './lib/telemetry';
import { initDomResilience } from './lib/domResilience';
import { initChunkReloader } from './lib/chunkReloader';

// Automatically handle and recover from stale build chunk errors after deployments
initChunkReloader();

// Prevent browser translate and extension DOM mutations from crashing React
initDomResilience();

// Activate automatic silent crash and unhandled error reporter
initGlobalErrorLogging();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
