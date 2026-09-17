/// <reference types="vite/client" />

// Generic ?url import (Vite asset URL transform)
declare module '*?url' {
  const content: string;
  export default content;
}

// Explicit .mjs?url — needed for pdfjs-dist worker import in some TS configs
declare module '*.mjs?url' {
  const content: string;
  export default content;
}

// Explicit .min.mjs?url — pdfjs-dist/build/pdf.worker.min.mjs?url
declare module '*.min.mjs?url' {
  const content: string;
  export default content;
}
