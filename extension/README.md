# PDF Media Suite — Official Browser Extension (Manifest V3) v2.2.0

This browser extension brings the power of **PDF Media Suite (130+ Free Tools)** directly into Google Chrome, Microsoft Edge, Brave, Opera, and Arc browsers.

---

## 🌟 Key Features (v2.2.0 Cyber Cafe & Enterprise Edition)

1. **Scan to Print (QR Web-Drop) Quick-Launch**:
   - Customers scan the QR code on their phone to beam documents directly to your computer without sharing or saving WhatsApp numbers.
   - Dedicated **🖨️ Cyber Cafe** category tab for E-Mitra, CSC centers, and xerox shops.

2. **Target Size PDF Compress (KB & MB)**:
   - Compress PDFs strictly to 100 KB, 200 KB, 500 KB, 1 MB, 2 MB with decimal support.

3. **Passport Photo 4x6 Sheet Maker**:
   - Make printable 8, 16, or 32 passport photo sheets on 4×6 or A4 paper with AI dress and suit change.

4. **Clean Paper Signature Tool**:
   - Convert phone camera photos of handwritten signatures on notebook paper into clean transparent PNGs or 10–20 KB pure white JPGs.

5. **Smart KYC Slip Maker & Sarkari Portals**:
   - Combine Aadhaar, PAN card, and Bank passbook into a verified single-page slip for account opening and CSC services.

6. **Active PDF Tab Detection & Badge**:
   - Whenever you browse or open any PDF file in your browser, a red **"PDF" badge** automatically lights up on the extension icon in the toolbar.
   - Clicking the icon reveals a special **"📄 PDF Detected!"** banner with instant 1-click actions:
     - ⚡ Compress PDF
     - 📝 Convert to Word (.docx)
     - 🚀 Open all PDF tools

7. **Keyboard Shortcut (1-Click Launch)**:
   - Press **`Ctrl+Shift+P`** (or **`Command+Shift+P`** on Mac) from ANY tab or window to instantly open the extension popup.

8. **Recently Used Tools History**:
   - Tracks your recently opened tools in browser local storage.
   - Click the clock icon (**🕐**) in the header to view or clear your history for rapid workflows.

9. **130+ Tools Catalog with Instant Search & Tags**:
   - Sleek 400px popup UI with smooth slide-in animations and skeleton loaders.
   - Categorized tabs: **⭐ Popular**, **🖨️ Cyber Cafe**, **🇮🇳 Sarkari**, **📄 PDF**, **🔄 Convert**, **🖼️ Image**, **🔒 Security**, **✨ All (130+)**.

10. **Smart Drag-and-Drop Dropzone**:
   - Drop any file right inside the popup:
     - Drops a **PDF** ➔ Launches Compress PDF / Target Compress
     - Drops an **Image (JPG/PNG/WebP)** ➔ Launches JPG to PDF
     - Drops an **Office file (Word/Excel/PPT)** ➔ Launches Universal Converter

11. **Google Search In-Search Quick Action Widget**:
   - Injects a native-looking PDF Media Suite card right above Google search results for queries like *"scan to print"*, *"compress pdf 100kb"*, *"passport photo"*, *"clean signature"*, etc.

12. **Expanded Right-Click Context Menu**:
   - Quick launch for **Scan to Print**, **Target Compress**, **Passport Photo Sheet**, **Clean Signature**, **Smart KYC Slip**, **Sarkari Photo & Sign**, **Document Scanner**, **Merge PDFs**, **All 130+ Tools**.

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
