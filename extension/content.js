/**
 * PDF Media Suite — Google Search In-Search Quick Action Widget
 * Injects a fast, non-intrusive PDF quick launcher when user searches PDF topics on Google.
 */

(function () {
  'use strict';

  // Prevent multiple injections
  if (document.getElementById('pdf-media-suite-search-widget')) return;

  const urlParams = new URLSearchParams(window.location.search);
  const query = (urlParams.get('q') || '').toLowerCase().trim();

  // Keywords that trigger the quick widget
  const triggers = [
    'pdf',
    'compress pdf',
    'merge pdf',
    'pdf to word',
    'pdf to excel',
    'word to pdf',
    'unlock pdf',
    'sarkari photo',
    'reduce pdf size',
    'edit pdf',
    'split pdf',
    'sign pdf',
    'pdf media suite',
    'target compress',
  ];

  const matched = triggers.some((t) => query.includes(t));
  if (!matched) return;

  // Determine active tool based on query
  let activeTool = {
    name: 'Compress PDF',
    desc: 'Compress PDF down to target KB/MB without losing crisp quality.',
    path: '/compress',
    badge: 'Popular',
  };

  if (query.includes('word') || query.includes('docx')) {
    activeTool = {
      name: 'PDF to Word (.docx)',
      desc: 'Convert PDF to editable Word document with precise formatting.',
      path: '/pdf-to-word',
      badge: 'Best Quality',
    };
  } else if (query.includes('merge') || query.includes('combine')) {
    activeTool = {
      name: 'Merge PDF Files',
      desc: 'Combine multiple PDFs into one document with live reordering.',
      path: '/merge',
      badge: '100% Private',
    };
  } else if (query.includes('sarkari') || query.includes('photo') || query.includes('signature')) {
    activeTool = {
      name: 'Sarkari Photo & Signature Maker',
      desc: 'Resize photo & signature to exact 20–50 KB govt recruitment format.',
      path: '/sarkari-photo-signature',
      badge: 'Govt Forms',
    };
  } else if (query.includes('unlock') || query.includes('password') || query.includes('remove password')) {
    activeTool = {
      name: 'Unlock Protected PDF',
      desc: 'Remove password and decrypt PDF losslessly in your browser.',
      path: '/unlock',
      badge: 'Instant Decrypt',
    };
  } else if (query.includes('excel') || query.includes('table')) {
    activeTool = {
      name: 'PDF to Excel (.xlsx)',
      desc: 'Extract tables and spreadsheet data from PDF into clean Excel rows.',
      path: '/pdf-to-excel',
      badge: 'Table AI',
    };
  } else if (query.includes('scan') || query.includes('scanner')) {
    activeTool = {
      name: 'Smart Document Scanner',
      desc: 'Perspective warp & crop scanned documents into crystal clear PDFs.',
      path: '/document-scanner',
      badge: 'Auto Crop',
    };
  }

  const BASE_URL = 'https://www.pdfmediasuite.in';

  function injectWidget() {
    // Target Google search results container
    const targetContainer =
      document.querySelector('#center_col') ||
      document.querySelector('#rso') ||
      document.querySelector('#search');

    if (!targetContainer) return;

    const widget = document.createElement('div');
    widget.id = 'pdf-media-suite-search-widget';
    widget.className = 'pms-search-widget';

    widget.innerHTML = `
      <div class="pms-widget-header">
        <div class="pms-widget-brand">
          <div class="pms-brand-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <div>
            <span class="pms-brand-title">PDF Media Suite</span>
            <span class="pms-brand-tag">110+ Free Tools</span>
          </div>
        </div>
        <div class="pms-header-actions">
          <span class="pms-badge">${activeTool.badge}</span>
          <button class="pms-close-btn" id="pms-close-widget" title="Dismiss">&times;</button>
        </div>
      </div>

      <div class="pms-widget-body">
        <div class="pms-tool-card">
          <div class="pms-tool-info">
            <h3 class="pms-tool-title">${activeTool.name}</h3>
            <p class="pms-tool-desc">${activeTool.desc}</p>
          </div>
          <a href="${BASE_URL}${activeTool.path}?utm_source=google_search_widget" target="_blank" class="pms-action-btn">
            Open Tool &rarr;
          </a>
        </div>

        <div class="pms-quick-pills">
          <a href="${BASE_URL}/compress?utm_source=google_search_widget" target="_blank" class="pms-pill">⚡ Compress</a>
          <a href="${BASE_URL}/merge?utm_source=google_search_widget" target="_blank" class="pms-pill">📑 Merge</a>
          <a href="${BASE_URL}/pdf-to-word?utm_source=google_search_widget" target="_blank" class="pms-pill">📝 PDF to Word</a>
          <a href="${BASE_URL}/sarkari-photo-signature?utm_source=google_search_widget" target="_blank" class="pms-pill">🇮🇳 Sarkari Photo</a>
          <a href="${BASE_URL}/unlock?utm_source=google_search_widget" target="_blank" class="pms-pill">🔓 Unlock</a>
          <a href="${BASE_URL}/all-tools?utm_source=google_search_widget" target="_blank" class="pms-pill pms-pill-accent">🚀 All 110+ Tools</a>
        </div>
      </div>

      <div class="pms-widget-footer">
        <span>🔒 100% Client-side privacy &bull; No watermarks &bull; Free forever</span>
        <a href="${BASE_URL}?utm_source=google_search_widget" target="_blank" class="pms-footer-link">pdfmediasuite.in</a>
      </div>
    `;

    targetContainer.prepend(widget);

    // Close button handler
    const closeBtn = document.getElementById('pms-close-widget');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        widget.style.display = 'none';
      });
    }
  }

  // Execute after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectWidget);
  } else {
    injectWidget();
  }
})();

