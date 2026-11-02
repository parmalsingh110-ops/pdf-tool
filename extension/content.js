/**
 * PDF Media Suite — Google Search Widget v2.0
 * Injects a smart PDF quick-launcher on Google when user searches PDF-related queries.
 * Features: 110+ keyword mappings, 6 quick pills, social proof, smooth animation.
 */

(function () {
  'use strict';

  if (document.getElementById('pdf-media-suite-search-widget')) return;

  const urlParams = new URLSearchParams(window.location.search);
  const query = (urlParams.get('q') || '').toLowerCase().trim();

  // ─── 110+ KEYWORD → TOOL MAPPING ──────────────────────────────────────
  const TOOL_MAP = [
    // Compress / Reduce
    { keys: ['compress pdf','reduce pdf','pdf compress','pdf size','small pdf','pdf kb','pdf mb','lightweight pdf','pdf reducer','optimize pdf','shrink pdf','pdf file size','pdf too large'], tool: { name:'Compress PDF', desc:'Compress PDF to exact KB/MB target without losing quality.', path:'/compress', badge:'⚡ No Watermark' } },
    // Merge / Combine
    { keys: ['merge pdf','combine pdf','join pdf','pdf combine','pdf join','multiple pdf','append pdf','pdf together','two pdf one','pdf files merge'], tool: { name:'Merge PDF Files', desc:'Combine multiple PDFs into one with live page reordering.', path:'/merge', badge:'📑 Popular' } },
    // PDF to Word
    { keys: ['pdf to word','pdf word','docx','word from pdf','convert pdf word','editable pdf','pdf editable','pdf text edit','pdf to doc'], tool: { name:'PDF → Word (.docx)', desc:'Convert PDF to fully editable Word document — precise formatting.', path:'/pdf-to-word', badge:'📝 Best Quality' } },
    // PDF to Excel
    { keys: ['pdf to excel','pdf excel','xlsx','table pdf','pdf table','pdf to xlsx','pdf spreadsheet','extract table','csv from pdf','data from pdf'], tool: { name:'PDF → Excel (.xlsx)', desc:'Extract tables and data from PDF into clean Excel spreadsheets.', path:'/pdf-to-excel', badge:'📊 Table AI' } },
    // PDF to PPT
    { keys: ['pdf to ppt','pdf powerpoint','pptx from pdf','pdf slides','pdf to presentation','pdf to pptx'], tool: { name:'PDF → PowerPoint (.pptx)', desc:'Turn PDF pages into editable presentation slides.', path:'/pdf-to-ppt', badge:'📽️ Slides' } },
    // Unlock / Remove password
    { keys: ['unlock pdf','remove password','pdf password','decrypt pdf','password pdf','protected pdf','open locked pdf','pdf password remove','pdf lock'], tool: { name:'Unlock Protected PDF', desc:'Remove PDF password and permissions losslessly in your browser.', path:'/unlock', badge:'🔓 Lossless' } },
    // Protect / Password PDF
    { keys: ['protect pdf','password protect','encrypt pdf','lock pdf','pdf encrypt','secure pdf','pdf security','add password'], tool: { name:'Protect PDF (Password)', desc:'Encrypt PDF with AES-256 password for maximum security.', path:'/protect', badge:'🔒 AES-256' } },
    // Split PDF
    { keys: ['split pdf','divide pdf','pdf split','pdf pages separate','extract page','pdf page range','cut pdf','separate pdf'], tool: { name:'Split PDF', desc:'Extract specific page ranges or split each page into separate PDFs.', path:'/split', badge:'✂️ Fast' } },
    // Rotate PDF
    { keys: ['rotate pdf','pdf rotate','turn pdf','landscape pdf','portrait pdf','flip pages','pdf orientation','sideways pdf'], tool: { name:'Rotate PDF Pages', desc:'Rotate individual pages 90°, 180°, or 270° and save.', path:'/rotate-pages', badge:'🔄 Instant' } },
    // Sarkari Photo / Signature
    { keys: ['sarkari photo','sarkari signature','govt form photo','government photo','recruitment photo','20kb photo','50kb photo','photo signature form','photo resize govt','rrb photo','upsc photo','ssc photo','railway photo'], tool: { name:'Sarkari Photo & Signature Maker', desc:'Resize photo & signature to exact 20–50 KB for govt recruitment forms.', path:'/sarkari-photo-signature', badge:'🇮🇳 Govt Format' } },
    // Remove Background
    { keys: ['remove background','bg remove','transparent background','cutout photo','background eraser','photo cutout','remove bg'], tool: { name:'Remove Image Background', desc:'AI-powered background removal — transparent PNG in seconds.', path:'/remove-background', badge:'✂️ AI Powered' } },
    // Image Resize
    { keys: ['resize image','image resize','image size reduce','compress image','photo size','image kb','image compress','photo compress','image dimensions'], tool: { name:'Image Resizer', desc:'Resize images to exact pixel dimensions or compress to target KB/MB.', path:'/image-resizer', badge:'📐 Exact Size' } },
    // JPG to PDF
    { keys: ['jpg to pdf','image to pdf','png to pdf','photo to pdf','convert image pdf','pic to pdf','picture to pdf'], tool: { name:'JPG / PNG → PDF', desc:'Convert images to crisp multi-page PDF documents instantly.', path:'/jpg-to-pdf', badge:'🖼️ Crisp' } },
    // Scanner
    { keys: ['document scanner','scan document','scan pdf','photo scan','scan to pdf','mobile scan','perspective scan','deskew','straighten document'], tool: { name:'Smart Document Scanner', desc:'Scan & perspective-warp documents with auto edge detection.', path:'/document-scanner', badge:'📷 AI Crop' } },
    // Watermark
    { keys: ['watermark pdf','add watermark','pdf stamp','logo watermark','text watermark'], tool: { name:'Watermark PDF', desc:'Add text or logo watermarks with opacity and angle controls.', path:'/watermark', badge:'💧 Custom' } },
    // Redact / PII
    { keys: ['redact pdf','pdf censor','hide text pdf','blackout pdf','pii pdf','aadhaar redact','pan redact','sensitive data pdf'], tool: { name:'Redact PDF (Auto PII Scan)', desc:'Auto-detect and permanently blackout Aadhaar, PAN, emails & PII.', path:'/redact', badge:'⬛ Auto PII' } },
    // OCR / Searchable
    { keys: ['ocr pdf','searchable pdf','scan to text','text recognition','optical character','image to text pdf','recognize text'], tool: { name:'OCR — Searchable PDF', desc:'Add OCR text layer to scanned PDFs to make them searchable.', path:'/searchable-pdf', badge:'👁️ OCR' } },
    // Edit PDF
    { keys: ['edit pdf','pdf editor','annotate pdf','write on pdf','text pdf','draw pdf','pdf sign','add text pdf'], tool: { name:'Advanced PDF Editor', desc:'Add text, shapes, signatures, highlights & annotations to PDF.', path:'/edit', badge:'✏️ Full Edit' } },
    // Webpage to PDF
    { keys: ['webpage to pdf','website to pdf','url to pdf','html to pdf','web page pdf','save page pdf'], tool: { name:'Webpage → PDF', desc:'Convert any website URL to a paginated, print-ready PDF.', path:'/webpage-to-pdf', badge:'🌍 Any URL' } },
    // Masked Aadhaar
    { keys: ['masked aadhaar','aadhaar mask','uidai','aadhaar kyc','mask aadhaar number','kyc aadhaar'], tool: { name:'Masked Aadhaar Maker', desc:'Mask first 8 Aadhaar digits (XXXX-XXXX-1234) per UIDAI & RBI KYC.', path:'/masked-aadhaar', badge:'🛡️ RBI KYC' } },
    // Compress Image Exact KB
    { keys: ['50kb photo','100kb image','200kb image','exact kb image','image file size','photo 20kb','image for portal','government portal image','20kb image','compress to kb'], tool: { name:'Exact Image Size (KB)', desc:'Compress photo to exact KB for government portal uploads.', path:'/exact-image-size', badge:'🎯 Exact KB' } },
    // Passport Photo
    { keys: ['passport photo','passport size photo','visa photo','id photo sheet','4x6 photo','photo sheet print','photo print sheet'], tool: { name:'Passport Photo Sheet Maker', desc:'Create printable 4×6 / A4 passport photo sheets — change dress color.', path:'/passport-photo-sheet', badge:'👔 Print Ready' } },
    // PDF to Images
    { keys: ['pdf to image','pdf to jpg','pdf to png','pdf screenshot','export pdf pages','pdf pages as images'], tool: { name:'PDF to Images (300 DPI)', desc:'Export PDF pages as crystal clear 300 DPI JPG/PNG images.', path:'/pdf-to-jpg', badge:'🎨 300 DPI' } },
    // Universal Converter
    { keys: ['word to pdf','docx to pdf','excel to pdf','ppt to pdf','office to pdf','convert to pdf','universal converter','any to pdf'], tool: { name:'Universal Converter', desc:'Convert between 30+ formats — Word, Excel, PPT, PDF, Images.', path:'/universal-converter', badge:'🌐 All-in-One' } },
    // File Hash
    { keys: ['file hash','md5','sha256','checksum','verify file','file integrity'], tool: { name:'File Hash Generator', desc:'Get MD5, SHA-1, SHA-256 hash of any file for verification.', path:'/file-hash', badge:'🔐 Integrity' } },
    // PDF Stats
    { keys: ['pdf info','pdf stats','pdf metadata','pdf page count','pdf size info','pdf details','pdf properties'], tool: { name:'PDF Stats Analyzer', desc:'View page count, file size, metadata & structure of any PDF.', path:'/pdf-stats', badge:'📊 Analyze' } },
  ];

  // Default tool
  let activeTool = {
    name: 'Compress PDF',
    desc: 'Compress PDF to exact KB/MB target without losing quality. No watermark. Free forever.',
    path: '/compress',
    badge: '⚡ No Watermark',
  };

  // Find best matching tool
  let matched = false;
  for (const entry of TOOL_MAP) {
    if (entry.keys.some((k) => query.includes(k))) {
      activeTool = entry.tool;
      matched = true;
      break;
    }
  }

  // Show widget only for PDF-related queries
  const genericPdfTriggers = ['pdf', 'compress', 'sarkari photo', 'merge pdf', 'split pdf', 'jpg to pdf', 'image to pdf', 'document scanner'];
  const shouldShow = matched || genericPdfTriggers.some((t) => query.includes(t));
  if (!shouldShow) return;

  const BASE_URL = 'https://www.pdfmediasuite.in';

  function injectWidget() {
    const targetContainer =
      document.querySelector('#center_col') ||
      document.querySelector('#rso') ||
      document.querySelector('#search');

    if (!targetContainer) return;

    const widget = document.createElement('div');
    widget.id = 'pdf-media-suite-search-widget';
    widget.className = 'pms-search-widget';

    widget.innerHTML = `
      <div class="pms-widget-inner">
        <div class="pms-widget-header">
          <div class="pms-widget-brand">
            <div class="pms-brand-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
            </div>
            <div class="pms-brand-info">
              <span class="pms-brand-title">PDF Media Suite</span>
              <span class="pms-brand-sub">110+ Free PDF & Image Tools</span>
            </div>
          </div>
          <div class="pms-header-right">
            <span class="pms-badge">${activeTool.badge}</span>
            <button class="pms-close-btn" id="pms-close-widget" title="Dismiss">&times;</button>
          </div>
        </div>

        <div class="pms-tool-row">
          <div class="pms-tool-info">
            <h3 class="pms-tool-title">${activeTool.name}</h3>
            <p class="pms-tool-desc">${activeTool.desc}</p>
          </div>
          <a href="${BASE_URL}${activeTool.path}?utm_source=google_search_widget" target="_blank" class="pms-action-btn">
            Open Free →
          </a>
        </div>

        <div class="pms-quick-pills">
          <a href="${BASE_URL}/compress?utm_source=google_search_widget" target="_blank" class="pms-pill">⚡ Compress</a>
          <a href="${BASE_URL}/merge?utm_source=google_search_widget" target="_blank" class="pms-pill">📑 Merge</a>
          <a href="${BASE_URL}/pdf-to-word?utm_source=google_search_widget" target="_blank" class="pms-pill">📝 PDF→Word</a>
          <a href="${BASE_URL}/sarkari-photo-signature?utm_source=google_search_widget" target="_blank" class="pms-pill">🇮🇳 Sarkari</a>
          <a href="${BASE_URL}/unlock?utm_source=google_search_widget" target="_blank" class="pms-pill">🔓 Unlock</a>
          <a href="${BASE_URL}/all-tools?utm_source=google_search_widget" target="_blank" class="pms-pill pms-pill-accent">🚀 All 110+ →</a>
        </div>

        <div class="pms-widget-footer">
          <span class="pms-footer-left">🔒 100% Free &bull; No watermarks &bull; Files auto-deleted</span>
          <a href="${BASE_URL}?utm_source=google_search_widget" target="_blank" class="pms-footer-link">pdfmediasuite.in</a>
        </div>
      </div>
    `;

    targetContainer.prepend(widget);

    // Close button
    const closeBtn = document.getElementById('pms-close-widget');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        widget.style.opacity = '0';
        widget.style.transform = 'translateY(-6px)';
        setTimeout(() => { widget.style.display = 'none'; }, 200);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectWidget);
  } else {
    injectWidget();
  }
})();
