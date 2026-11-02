# PDF Media Suite — Official Browser Extension (Manifest V3)

This browser extension brings the power of **PDF Media Suite (110+ Free Tools)** directly into Google Chrome, Microsoft Edge, Brave, Opera, and Arc browsers.

---

## 🌟 Key Features

1. **Quick-Access Toolbar Hub**:
   - Click the extension icon in Chrome toolbar to open a sleek 380px mini-suite.
   - Live instant search across all 110+ tools.
   - Filter by categories: Popular, PDF, Convert, Sarkari / Govt KYC, Security, All Tools.
   - Direct PDF drag-and-drop launcher.

2. **Google Search In-Search Quick Widget** (Like PrintFriendly):
   - Whenever user searches for PDF terms on Google (*"compress pdf"*, *"pdf to word"*, *"merge pdf"*, *"sarkari photo"*):
   - Injects a clean, non-intrusive PDF Media Suite launcher right at the top of Google Search results.
   - 1-click launch into the exact matched tool!

3. **Right-Click Context Menu**:
   - Right-click anywhere on any webpage ➔ **"Save Webpage as PDF"**
   - Right-click any PDF link ➔ **"Compress this PDF"** or **"Convert to Word"**
   - Right-click any image ➔ **"Convert Image to PDF"**
   - Right-click anywhere ➔ **"Make Sarkari Photo & Signature Sheet (20-50 KB)"**

4. **100% Private & UTM-Tracked**:
   - All visits are tracked in Google Analytics via `?utm_source=chrome_extension` so you can monitor extension traffic in real-time.

---

## 🚀 How to Install and Test in Chrome / Edge (Developer Mode)

You can test this extension right now on your computer **without paying anything**:

1. Open Google Chrome (or Edge/Brave) and type in the address bar:
   ```
   chrome://extensions/
   ```
2. In the top-right corner, toggle **"Developer mode"** to **ON**.
3. In the top-left corner, click **"Load unpacked"**.
4. Select the `extension/` folder located at:
   ```
   /Users/pankajmeena/pdf tool/pdf-tool/extension
   ```
5. **Done!** The PDF Media Suite icon will appear in your Chrome toolbar.
   - Click the extension icon to see the popup.
   - Right-click any webpage to see the context menus.
   - Go to Google and search `compress pdf` to see the live search widget!

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

