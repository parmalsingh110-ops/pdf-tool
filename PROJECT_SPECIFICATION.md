# Project Core Specification: MediaSuite PDF Tool

This document provides a comprehensive technical and design overview of the MediaSuite PDF Tool project. Use this as the "Source of Truth" when adding new features or modifying existing ones to ensure consistency and efficiency (reducing token usage).

## 1. Project Identity & Stack
- **Name**: MediaSuite PDF Tool
- **Goal**: A premium, high-performance, in-browser PDF and Image processing suite.
- **Framework**: React 19 + Vite + TypeScript.
- **Styling**: Tailwind CSS 4 (with `@tailwindcss/vite`).
- **Icons**: [Lucide React](https://lucide.dev/).
- **Animations**: [Framer Motion](https://www.framer.com/motion/).
- **Routing**: [React Router DOM v7](https://reactrouter.com/).

### Core Libraries
| Library | Purpose |
| :--- | :--- |
| `pdf-lib` | Generating, merging, splitting, and modifying PDF structures. |
| `pdfjs-dist` | High-fidelity rendering of PDF pages to canvas/images. |
| `tesseract.js` | Optical Character Recognition (OCR) for text extraction/editing. |
| `canvas` | Image manipulation, resizing, and filtering. |
| `xlsx` / `docx` / `pptxgenjs` | Office format conversions. |
| `@imgly/background-removal` | AI-powered background removal for images. |
| `framer-motion` | Smooth UI transitions and micro-animations. |

---

## 2. Design System & Aesthetics
The project follows a **Premium, Modern, and Interactive** design language.

### Color Palette
- **Primary (Red/Rose)**: `#e11d48` (Rose 600) for "PDF" tools.
- **Secondary (Sky/Blue)**: `#0284c7` (Sky 600) for "Media/Image" tools.
- **Success (Green/Emerald)**: `#059669` (Emerald 600).
- **Dark Mode**: Fully supported using `dark:` classes and `slate-950` backgrounds.
- **Surface**: `white` in light mode, `slate-900` in dark mode. Borders use `slate-200` (light) or `slate-700` (dark).

### UI Patterns
- **Bento Grids**: Home page uses a bento-style gallery for tool selection.
- **Glassmorphism**: Use of `backdrop-blur`, `bg-white/30`, and `blur-3xl` for decorative backgrounds.
- **Cards**: Rounded-3xl corners, subtle shadows (`shadow-sm`, `shadow-lg` on hover).
- **Buttons**: Rounded-xl or full, gradient backgrounds for primary actions.
- **Dropzone**: Centered, dashed border, interactive state changes (Red/Rose for PDF, Sky for Media).

---

## 3. Feature Catalog
The suite is divided into logical categories. All tools are located in `src/pages/`.

### PDF Basics
- **Merge** (`/merge`): Combine multiple PDFs into one with reordering.
- **Split** (`/split`): Extract specific pages or ranges.
- **Compress** (`/compress`): Reduce file size via rasterization or metadata removal.
- **Organize** (`/organize`): Drag-and-drop page reordering and deletion.

### Advanced Editing
- **Advanced Editor** (`/edit`): Text overlay, annotations, and layout changes.
- **Image Text Editor (OCR)** (`/image-text-editor`): Edit text *inside* images/scans by replacing pixels with matched backgrounds and new text.
- **Search & Replace** (`/search-replace`): Find text in PDF and replace it.

### Security
- **Protect** (`/protect`): Add password encryption.
- **Unlock** (`/unlock`): Remove password protection.
- **Signatures** (`/crypto-sign`, `/signature-pad`): Digital and hand-drawn signatures.
- **Watermark** (`/watermark`, `/invisible-watermark`): Text/Image overlays.

### Media & Imaging
- **Image Resizer** (`/image-resizer`): Resize by px, cm, mm, %, or Target KB.
- **Background Removal** (`/remove-background`): AI portrait/product cutout.
- **Passport Photo** (`/passport-photo-sheet`): Auto-crop and grid generation.
- **Collage** (`/image-collage`): Combine images into grids.

### Converters
- **Universal Converter** (`/universal-converter`): Office (Docx, Xlsx, Pptx) to PDF.
- **PDF to JPG/WebP/TIFF**: Convert PDF pages to high-quality images.

---

## 4. Core Architecture & Workflows

### Component Architecture
- **Layout** (`src/components/Layout.tsx`): Shared Navbar/Footer and page wrapper.
- **FileDropzone** (`src/components/FileDropzone.tsx`): The standard entry point for all tools. Supports `variant='light' | 'dark'`.
- **Modals/Tooltips**: Reusable UI components from Radix/HeadlessUI patterns (if used) or custom Tailwind implementations.

### Standard Tool Workflow
1.  **Input Phase**: User drops files into `FileDropzone`.
2.  **Configuration Phase**: User selects options (e.g., compression level, page range, target size).
3.  **Processing Phase**:
    - Show `isProcessing` state with a spinner/loader.
    - PDF tools usually use `PDFDocument` from `pdf-lib`.
    - Image tools use HTML5 Canvas or external libraries.
4.  **Output Phase**:
    - Generate a `Blob` URL.
    - Display result with a "Download" button and "Reset" option.

### PDF-to-Image Flow (Standard Pattern)
```typescript
import * as pdfjs from 'pdfjs-dist';

// 1. Load document
const loadingTask = pdfjs.getDocument(url);
const pdf = await loadingTask.promise;

// 2. Render page to canvas
const page = await pdf.getPage(1);
const viewport = page.getViewport({ scale: 2 });
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d');
await page.render({ canvasContext: context, viewport }).promise;

// 3. Convert to Blob
const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
```

---

## 5. Coding Standards for AI Agents
- **Icons**: Always use `lucide-react`. Consistent icon sizing (`w-5 h-5`).
- **Tailwind**: Use arbitrary values `[...]` sparingly; prefer standard theme classes.
- **Safety**: Always include `try-catch` blocks for PDF/Image processing and provide user-friendly error alerts.
- **Performance**: Use `lazy` loading for large pages (see `App.tsx`). Use `Web Workers` for heavy OCR/Conversion if possible.
- **Accessibility**: Use semantic HTML (`section`, `h1-h3`, `button`). Ensure good contrast for dark mode.

## 6. Project Structure
- `src/pages/`: Page-level components (each tool is a page).
- `src/components/`: Reusable UI elements (Buttons, Dropzones, Cards).
- `src/lib/`: Utility functions (formatting, validation).
- `src/context/`: Global states (e.g., Theme, User Settings).

---
*Created on 2026-04-15*
