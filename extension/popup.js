/**
 * PDF Media Suite — Popup Controller
 * Handles search, categories, dropzone, and 1-click tool launch.
 */

const BASE_URL = 'https://www.pdfmediasuite.in';

const TOOLS_CATALOG = [
  // ⭐ Popular
  { id: 'compress', name: 'Compress PDF', desc: 'Reduce file size to target KB/MB with zero watermark', category: 'popular', icon: '⚡', path: '/compress', badge: 'Hot' },
  { id: 'merge', name: 'Merge PDF', desc: 'Combine multiple PDFs in custom order with page previews', category: 'popular', icon: '📑', path: '/merge', badge: 'Popular' },
  { id: 'pdf-to-word', name: 'PDF to Word (.docx)', desc: 'Convert PDF to editable Word document losslessly', category: 'popular', icon: '📝', path: '/pdf-to-word', badge: 'High-Res' },
  { id: 'sarkari-photo', name: 'Sarkari Photo & Sign Maker', desc: 'Auto resize photo & sign to exact 20–50 KB govt recruitment format', category: 'popular', icon: '🇮🇳', path: '/sarkari-photo-signature', badge: 'Govt KYC' },
  { id: 'unlock', name: 'Unlock Protected PDF', desc: 'Lossless removal of password & permissions via PyMuPDF', category: 'popular', icon: '🔓', path: '/unlock', badge: 'Lossless' },
  { id: 'scanner', name: 'Smart Document Scanner', desc: 'Scan and perspective warp docs with magic color enhancement', category: 'popular', icon: '📷', path: '/document-scanner', badge: 'Sobel AI' },

  // 📄 PDF Tools
  { id: 'split', name: 'Split PDF', desc: 'Extract specific page ranges or split into individual pages', category: 'pdf', icon: '✂️', path: '/split' },
  { id: 'rotate', name: 'Rotate PDF Pages', desc: 'Rotate individual pages 90°, 180°, or 270° and save', category: 'pdf', icon: '🔄', path: '/rotate-pages' },
  { id: 'organize', name: 'Organize PDF Pages', desc: 'Reorder, duplicate, delete and sort pages visually', category: 'pdf', icon: '🗂️', path: '/organize' },
  { id: 'watermark', name: 'Watermark PDF', desc: 'Add text or logo watermarks with opacity and angle controls', category: 'pdf', icon: '💧', path: '/watermark' },
  { id: 'page-numbers', name: 'Page Numbers', desc: 'Insert headers, footers and custom bates numbering', category: 'pdf', icon: '🔢', path: '/page-numbers' },
  { id: 'pdf-editor', name: 'Advanced PDF Editor', desc: 'Add text, shapes, signatures, whiteout, and annotations', category: 'pdf', icon: '✏️', path: '/edit' },
  { id: 'bookmarks', name: 'Create Bookmarks', desc: 'Create and organize native PDF Table of Contents outlines', category: 'pdf', icon: '🔖', path: '/create-bookmarks' },
  { id: 'flatten', name: 'Flatten PDF', desc: 'Lock fillable form fields and flatten annotations into pages', category: 'pdf', icon: '🥞', path: '/flatten-pdf' },

  // 🔄 Converters
  { id: 'pdf-to-excel', name: 'PDF to Excel (.xlsx)', desc: 'Extract tabular data and spreadsheets into Excel rows', category: 'convert', icon: '📊', path: '/pdf-to-excel' },
  { id: 'pdf-to-ppt', name: 'PDF to PowerPoint (.pptx)', desc: 'Turn PDF pages into presentation slides', category: 'convert', icon: '📽️', path: '/pdf-to-ppt' },
  { id: 'universal', name: 'Universal Converter', desc: 'Convert between 30+ formats: Office, PDF, Images, Text', category: 'convert', icon: '🌐', path: '/universal-converter', badge: 'All-in-One' },
  { id: 'jpg-to-pdf', name: 'JPG / PNG to PDF', desc: 'Convert images to crisp multi-page PDF documents', category: 'convert', icon: '🖼️', path: '/jpg-to-pdf' },
  { id: 'webpage-to-pdf', name: 'Webpage to PDF', desc: 'Convert any public website URL to a paginated PDF', category: 'convert', icon: '🌍', path: '/webpage-to-pdf' },
  { id: 'pdf-to-images', name: 'PDF to High-Res JPG/PNG', desc: 'Extract pages as 300 DPI crystal clear images', category: 'convert', icon: '🎨', path: '/pdf-to-jpg' },

  // 🇮🇳 Sarkari / Govt KYC
  { id: 'passport-sheet', name: 'Passport Photo 4x6 Sheet', desc: 'Make 4x6 / A4 printable passport photo sheets with dress change', category: 'sarkari', icon: '👔', path: '/passport-photo-sheet', badge: 'Print' },
  { id: 'clean-signature', name: 'Clean Signature Tool', desc: 'Remove paper background & shadows to get transparent sign', category: 'sarkari', icon: '✍️', path: '/clean-signature', badge: 'Pure Ink' },
  { id: 'masked-aadhaar', name: 'Masked Aadhaar Maker', desc: 'Mask first 8 digits (XXXX-XXXX-1234) per UIDAI & RBI KYC', category: 'sarkari', icon: '🛡️', path: '/masked-aadhaar', badge: 'RBI KYC' },
  { id: 'id-joiner', name: 'ID Card Front & Back Joiner', desc: 'Combine front and back of Aadhaar / Voter ID onto single page', category: 'sarkari', icon: '💳', path: '/id-card-joiner' },
  { id: 'exam-merger', name: 'Exam Document Merger', desc: 'Merge Admit Card, 10th marksheet & ID into one PDF', category: 'sarkari', icon: '🎓', path: '/exam-document-merger' },

  // 🔒 Security & Privacy
  { id: 'protect', name: 'Protect PDF (Password)', desc: 'Encrypt PDF with AES-256 password protection', category: 'security', icon: '🔒', path: '/protect' },
  { id: 'redact', name: 'Redact PDF (PII Deep Scan)', desc: 'Permanent blackout of Aadhaar, PAN, emails & sensitive info', category: 'security', icon: '⬛', path: '/redact', badge: 'Auto PII' },
  { id: 'remove-metadata', name: 'Remove PDF Metadata', desc: 'Scrub author names, GPS, device info & tracking tags', category: 'security', icon: '🧹', path: '/remove-metadata' },
  { id: 'validate-sig', name: 'Validate Digital Signatures', desc: 'Inspect PDF cryptographic signature dictionaries & SHA-256', category: 'security', icon: '🔍', path: '/validate-signatures' },
  { id: 'pdf-sanitizer', name: 'PDF Sanitizer', desc: 'Remove embedded JavaScript, macros & malicious actions', category: 'security', icon: '🧼', path: '/pdf-sanitizer' },
];

// State
let currentCategory = 'popular';
let searchQuery = '';

// DOM Elements
const searchInput = document.getElementById('tool-search');
const clearSearchBtn = document.getElementById('clear-search');
const tabs = document.querySelectorAll('.tab-btn');
const toolsContainer = document.getElementById('tools-list');
const quickDropzone = document.getElementById('quick-dropzone');
const dropFileInput = document.getElementById('drop-file-input');

// Render Tools
function renderTools() {
  const query = searchQuery.toLowerCase().trim();

  const filtered = TOOLS_CATALOG.filter((tool) => {
    // Search filter takes precedence
    if (query) {
      return (
        tool.name.toLowerCase().includes(query) ||
        tool.desc.toLowerCase().includes(query) ||
        tool.category.toLowerCase().includes(query)
      );
    }

    // Category filter
    if (currentCategory === 'all') return true;
    if (currentCategory === 'popular') return tool.category === 'popular';
    return tool.category === currentCategory;
  });

  if (filtered.length === 0) {
    toolsContainer.innerHTML = `
      <div class="no-results">
        <p>No tools matched "<strong>${escapeHtml(query)}</strong>"</p>
        <p style="margin-top: 6px; font-size: 11px;">
          <a href="${BASE_URL}/all-tools?utm_source=chrome_extension_search" target="_blank" style="color: var(--brand-red);">Browse all 110+ tools on website &rarr;</a>
        </p>
      </div>
    `;
    return;
  }

  toolsContainer.innerHTML = filtered
    .map(
      (tool) => `
    <div class="tool-item" data-path="${tool.path}">
      <div class="tool-left">
        <span class="tool-emoji">${tool.icon}</span>
        <div class="tool-details">
          <span class="tool-name">${tool.name}</span>
          <span class="tool-desc">${tool.desc}</span>
        </div>
      </div>
      ${tool.badge ? `<span class="tool-badge">${tool.badge}</span>` : ''}
    </div>
  `
    )
    .join('');

  // Attach click listeners to open tools in new tabs
  document.querySelectorAll('.tool-item').forEach((el) => {
    el.addEventListener('click', () => {
      const path = el.getAttribute('data-path');
      const url = `${BASE_URL}${path}?utm_source=chrome_extension_popup`;
      chrome.tabs.create({ url });
    });
  });
}

// Helpers
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Event Listeners
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  clearSearchBtn.style.display = searchQuery ? 'block' : 'none';
  renderTools();
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchQuery = '';
  clearSearchBtn.style.display = 'none';
  searchInput.focus();
  renderTools();
});

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    currentCategory = tab.getAttribute('data-category');
    // Clear search on tab switch for smooth browsing
    if (searchQuery) {
      searchInput.value = '';
      searchQuery = '';
      clearSearchBtn.style.display = 'none';
    }
    renderTools();
  });
});

// Dropzone Interactions
quickDropzone.addEventListener('click', () => {
  dropFileInput.click();
});

dropFileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    const file = e.target.files[0];
    // Open compress tool as default quick action
    chrome.tabs.create({
      url: `${BASE_URL}/compress?utm_source=chrome_extension_dropzone&filename=${encodeURIComponent(file.name)}`,
    });
  }
});

quickDropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  quickDropzone.classList.add('drag-active');
});

quickDropzone.addEventListener('dragleave', () => {
  quickDropzone.classList.remove('drag-active');
});

quickDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  quickDropzone.classList.remove('drag-active');
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    const file = e.dataTransfer.files[0];
    chrome.tabs.create({
      url: `${BASE_URL}/compress?utm_source=chrome_extension_dropzone&filename=${encodeURIComponent(file.name)}`,
    });
  }
});

// Initial Render
renderTools();

