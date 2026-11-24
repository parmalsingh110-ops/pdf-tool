# PDF Media Suite — Official Chrome Extension & Built-in PDF Studio Viewer (v3.0.0)

Manifest V3 Chrome, Edge, Brave, Opera & Arc extension featuring a **100% built-in Adobe Acrobat–style PDF Viewer & Studio Editor** powered by open-source **Mozilla PDF.js (`v6.5`, Apache-2.0)**, **`pdf-lib` (MIT)**, and **`JSZip` (MIT)**.

---

## 🌟 What's New in v3.0.0 (Built-in PDF Studio Edition)

1. **Automatic Built-in PDF Viewer (`viewer.html`)**:
   - Automatically opens `.pdf` links and dynamic `Content-Type: application/pdf` documents directly inside the extension's fast, sleek Studio Viewer via Manifest V3 `declarativeNetRequest` (toggleable ON/OFF anytime from the popup or viewer!).
   - Includes a 1-click **"Open in Chrome Default Viewer"** bypass button whenever needed.
   - Drag & drop any local PDF or image right into the extension popup or viewer tab — opens in `<80ms` via local `IndexedDB` with zero upload!

2. **True Native High-DPI Printing (`Ctrl+P`) & Search (`Ctrl+F`)**:
   - Crisp high-resolution in-tab printing with all live annotations, signatures, stamps, and edits baked in.
   - Real selectable/copyable text layer (`PDF.js TextLayer`), bookmarks outline tree, page thumbnails with hover quick-actions, and Dark / Light / Sepia / Night-Invert reading themes.

3. **18 Complete In-Viewer PDF Tools (Zero Website Redirects!)**:
   - **✏️ Live Markup**: Highlight, Add Text (with Unicode/Hindi support), Freehand Ink Pen, Whiteout Erase, Blackout Redact + full `Ctrl+Z` / `Ctrl+Y` Undo/Redo.
   - **✍️ Sign & Official Stamps**: Draw smooth signatures, Type cursive signatures, Upload signature photos (auto white-paper background removal!), or apply official stamps (`SELF-ATTESTED + Date`, `APPROVED`, `VERIFIED`, `CONFIDENTIAL`).
   - **⚡ Compress & Exact Target KB**: Shrink PDFs or hit strict portal limits (`100 KB`, `200 KB`, `500 KB`) directly inside the viewer.
   - **📑 Merge, ✂️ Split/Extract (PDF or ZIP), 🗂️ Organize, ✨ Auto-Remove Blank Pages, 🔄 Rotate**.
   - **💧 Watermark, 🔢 Page Numbers & Legal Bates Stamps, ⬛ Auto UIDAI Aadhaar Masker (`XXXX-XXXX-1234`) & PII Redactor**.
   - **🎨 PDF → 300 DPI JPG/PNG (Single or ZIP), ➕ Append Images as Pages, 📃 Extract Text & Markdown, 🖨️ Grayscale & Xerox Eco Ink-Saver, 🧹 Flatten & Scrub Metadata**.
   - **📝 PDF → Word (`.docx`), 📊 PDF → Excel (`.xlsx`), 📽️ PDF → PowerPoint (`.pptx`)** — converts and downloads directly inside the viewer!

---

## 📦 Build Web Store `.zip` Package

```bash
npm run build:extension
```

Produces:
- `pdf-media-suite-extension.zip` (ready for Chrome Web Store Developer Dashboard upload)
- `public/pdf-media-suite-extension.zip` (served on the website)
