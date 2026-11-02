# PDF Media Suite — Official Browser Extension (Manifest V3) v2.0

This browser extension brings the power of **PDF Media Suite (110+ Free Tools)** directly into Google Chrome, Microsoft Edge, Brave, Opera, and Arc browsers.

---

## 🌟 Key Features (v2.0 Advanced Edition)

1. **Active PDF Tab Detection & Badge**:
   - Whenever you browse or open any PDF file in your browser, a red **"PDF" badge** automatically lights up on the extension icon in the toolbar.
   - Clicking the icon reveals a special **"📄 PDF Detected!"** banner with instant 1-click actions:
     - ⚡ Compress PDF
     - 📝 Convert to Word (.docx)
     - 🚀 Open all PDF tools

2. **Keyboard Shortcut (1-Click Launch)**:
   - Press **`Ctrl+Shift+P`** (or **`Command+Shift+P`** on Mac) from ANY tab or window to instantly open the extension popup.

3. **Recently Used Tools History**:
   - Tracks your recently opened tools in browser local storage.
   - Click the clock icon (**🕐**) in the header to view or clear your history for rapid workflows.

4. **110+ Tools Catalog with Instant Search & Tags**:
   - Sleek 400px popup UI with smooth slide-in animations and skeleton loaders.
   - Search across 110+ tools by name, description, or common keywords (e.g. `20kb`, `aadhaar`, `ocr`, `cmyk`, `scanner`, `split`).
   - Categorized tabs: **⭐ Popular**, **📄 PDF**, **🔄 Convert**, **🖼️ Image**, **🇮🇳 Sarkari**, **🔒 Security**, **✨ All (110+)**.

5. **Smart Drag-and-Drop Dropzone**:
   - Drop any file right inside the popup:
     - Drops a **PDF** ➔ Launches Compress PDF
     - Drops an **Image (JPG/PNG/WebP)** ➔ Launches JPG to PDF
     - Drops an **Office file (Word/Excel/PPT)** ➔ Launches Universal Converter

6. **Google Search In-Search Quick Action Widget (PrintFriendly & Monica Style)**:
   - When searching on Google for *any* PDF query (*"compress pdf"*, *"pdf to word"*, *"merge pdf"*, *"sarkari photo"*, *"masked aadhaar"*, *"unlock pdf"*, *"50kb image"*, etc.):
   - Dynamically injects a beautiful, native-looking PDF Media Suite card right above the search results with the exact matched tool and 6 quick-action pills!
   - Supports light mode & dark mode on Google.

7. **Expanded Right-Click Context Menu (10+ Actions)**:
   - Right-click anywhere ➔ **Save Webpage as PDF**, **Screenshot Page to PDF**
   - Right-click any link ➔ **Compress this PDF**, **Convert PDF → Word**, **Convert PDF → Excel**, **Unlock Protected PDF**
   - Right-click any image ➔ **Convert Image to PDF**, **Remove Background**, **Make Sarkari Photo Sheet**
   - Quick launch for **Sarkari Photo & Sign**, **Document Scanner**, **Merge PDFs**, **All 110+ Tools**

8. **Welcome Onboarding Screen**:
   - Automatically opens PDF Media Suite upon first installation so users can explore all capabilities.

9. **100% Private & UTM-Tracked**:
   - All links include `utm_source=chrome_extension_*` so you can monitor traffic, clicks, and impressions live in Google Analytics.

---

## 🚀 How to Install and Test in Chrome / Edge (Developer Mode)

You can test this extension right now on your computer **without paying anything**:

1. Open Google Chrome (or Edge/Brave) and type in the address bar:
   ```
   chrome://extensions/
   ```
2. In the top-right corner, toggle **"Developer mode"** to **ON**.
3. In the top-left corner, click **"Load unpacked"** (or click the reload icon if already loaded).
4. Select the `extension/` folder located at:
   ```
   /Users/pankajmeena/pdf tool/pdf-tool/extension
   ```
5. **Done!**
   - Press `Command+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows) to test the shortcut.
   - Open any PDF in a Chrome tab to see the red "PDF" badge appear!
   - Search `compress pdf` on Google to see the in-search widget!

---

## 📦 How to Publish to Chrome Web Store

1. Run the build script from the project root:
   ```bash
   npm run build:extension
   ```
   This generates `pdf-media-suite-extension.zip` in your root folder.

2. Go to [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole).
3. Click **"New Item"** and upload `pdf-media-suite-extension.zip`.
4. Fill in:
   - **Name**: PDF Media Suite — 110+ Free PDF & Image Tools
   - **Summary**: All-in-one PDF & Image Toolsuite. Compress, Merge, Convert PDF to Word/Excel, Sarkari Photo Sheet, Scan & Edit in 1-Click.
   - **Privacy Policy**: `https://www.pdfmediasuite.in/privacy`
5. Submit for Review! (Approved within 24–48 hours).
