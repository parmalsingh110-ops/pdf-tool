/**
 * PDF Media Suite — Manifest V3 Service Worker v3.0
 * Features:
 *   - Built-in PDF Viewer Auto-Interceptor (`declarativeNetRequest` RE2 rules + Content-Type fallback)
 *   - Bypass support (`pms_native=1`) when user wants Chrome's default viewer
 *   - In-Viewer Context Menus (Open, Sign, Compress, Convert PDF → Word/Excel right inside viewer.html)
 *   - Active PDF Tab Badge + Recent Tools Storage
 */

const BASE_URL = 'https://www.pdfmediasuite.in';
const RULE_ID_REDIRECT_PDF = 1001;
const RULE_ID_BYPASS_NATIVE = 1002;

function getViewerUrlFor(pdfUrl, toolId = '') {
  const base = chrome.runtime.getURL('viewer.html');
  const qs = new URLSearchParams();
  if (pdfUrl) qs.set('file', pdfUrl);
  if (toolId) qs.set('tool', toolId);
  const query = qs.toString();
  return query ? `${base}?${query}` : base;
}

// ─── DECLARATIVE NET REQUEST PDF INTERCEPTOR ──────────────────────────────
async function syncPdfInterceptorRules(enabled) {
  const viewerBase = chrome.runtime.getURL('viewer.html');
  const removeRuleIds = [RULE_ID_REDIRECT_PDF, RULE_ID_BYPASS_NATIVE];

  const addRules = enabled
    ? [
        // Higher-priority allow rule so `#pms_native=1` or `?pms_native=1` opens in Chrome's built-in viewer
        {
          id: RULE_ID_BYPASS_NATIVE,
          priority: 100,
          action: { type: 'allow' },
          condition: {
            urlFilter: 'pms_native=1',
            resourceTypes: ['main_frame'],
          },
        },
        // Instant 0ms network-level redirect of .pdf navigations to our built-in Studio Viewer
        {
          id: RULE_ID_REDIRECT_PDF,
          priority: 10,
          action: {
            type: 'redirect',
            redirect: {
              regexSubstitution: `${viewerBase}#\\0`,
            },
          },
          condition: {
            regexFilter: '^(https?|file)://.+\\.[pP][dD][fF](\\?[^#]*)?$',
            resourceTypes: ['main_frame'],
          },
        },
      ]
    : [];

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules,
    });
  } catch (err) {
    console.warn('[PDFMediaSuite] DNR rule update warning:', err);
  }
}

// Ensure rules stay synced on browser startup & install
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['autoOpenPdfViewer'], (res) => {
    void syncPdfInterceptorRules(res.autoOpenPdfViewer !== false);
  });
});

// ─── INSTALL / UPDATE HANDLER & CONTEXT MENUS ──────────────────────────────
chrome.runtime.onInstalled.addListener(({ reason }) => {
  chrome.storage.local.get(['autoOpenPdfViewer'], (res) => {
    const enabled = res.autoOpenPdfViewer !== false;
    if (res.autoOpenPdfViewer === undefined) {
      chrome.storage.local.set({ autoOpenPdfViewer: true });
    }
    void syncPdfInterceptorRules(enabled);
  });

  if (reason === 'install') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('viewer.html'),
    });
  }

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'pdf_media_suite_root',
      title: '🔴 PDF Media Suite (Studio Viewer & 130+ Tools)',
      contexts: ['all'],
    });

    // ── Built-in Studio PDF Viewer Actions (NO website redirect!) ──
    chrome.contextMenus.create({
      id: 'open_studio_viewer',
      parentId: 'pdf_media_suite_root',
      title: '📖 Open PDF Studio Viewer & Editor',
      contexts: ['page', 'link'],
    });

    chrome.contextMenus.create({
      id: 'sign_pdf_link',
      parentId: 'pdf_media_suite_root',
      title: '✍️ Sign & Edit this PDF in Studio',
      contexts: ['link'],
    });

    chrome.contextMenus.create({
      id: 'compress_pdf_link',
      parentId: 'pdf_media_suite_root',
      title: '⚡ Compress this PDF (Target KB)',
      contexts: ['link'],
    });

    chrome.contextMenus.create({
      id: 'pdf_to_word_link',
      parentId: 'pdf_media_suite_root',
      title: '📝 Convert PDF → Word (.docx) in Viewer',
      contexts: ['link'],
    });

    chrome.contextMenus.create({
      id: 'pdf_to_excel_link',
      parentId: 'pdf_media_suite_root',
      title: '📊 Convert PDF → Excel (.xlsx) in Viewer',
      contexts: ['link'],
    });

    // ── Image actions (Opens directly in built-in Studio Viewer as PDF!) ──
    chrome.contextMenus.create({
      id: 'convert_image_to_pdf',
      parentId: 'pdf_media_suite_root',
      title: '🖼️ Open Image as PDF in Studio Viewer',
      contexts: ['image'],
    });

    chrome.contextMenus.create({
      id: 'sarkari_photo_from_image',
      parentId: 'pdf_media_suite_root',
      title: '👔 Passport / Sarkari Photo Studio',
      contexts: ['image', 'page'],
    });

    chrome.contextMenus.create({
      id: 'separator_1',
      parentId: 'pdf_media_suite_root',
      type: 'separator',
      contexts: ['all'],
    });

    // ── Cyber Cafe & Specialized Suite Shortcuts ──
    chrome.contextMenus.create({
      id: 'open_merge_studio',
      parentId: 'pdf_media_suite_root',
      title: '📑 Merge & Split PDFs (Built-in Studio)',
      contexts: ['all'],
    });

    chrome.contextMenus.create({
      id: 'open_scan_to_print',
      parentId: 'pdf_media_suite_root',
      title: '🖨️ Scan to Print (QR Web-Drop)',
      contexts: ['all'],
    });

    chrome.contextMenus.create({
      id: 'open_passport_photo',
      parentId: 'pdf_media_suite_root',
      title: '👔 AI Passport Photo 4×6 Sheet Maker',
      contexts: ['all'],
    });

    chrome.contextMenus.create({
      id: 'open_clean_signature',
      parentId: 'pdf_media_suite_root',
      title: '✍️ Clean Paper Signature (Transparent PNG)',
      contexts: ['all'],
    });

    chrome.contextMenus.create({
      id: 'open_all_tools',
      parentId: 'pdf_media_suite_root',
      title: '🚀 Browse All 130+ Web Tools',
      contexts: ['all'],
    });
  });
});

// ─── CONTEXT MENU CLICK HANDLER ────────────────────────────────────────────
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const candidatePdfUrl = info.linkUrl || (tab?.url && isLikelyPdfUrl(tab.url) ? tab.url : '');

  switch (info.menuItemId) {
    case 'open_studio_viewer':
      chrome.tabs.create({ url: getViewerUrlFor(candidatePdfUrl) });
      return;

    case 'sign_pdf_link':
      chrome.tabs.create({ url: getViewerUrlFor(info.linkUrl || candidatePdfUrl, 'sign') });
      return;

    case 'compress_pdf_link':
      chrome.tabs.create({ url: getViewerUrlFor(info.linkUrl || candidatePdfUrl, 'compress') });
      return;

    case 'pdf_to_word_link':
      chrome.tabs.create({ url: getViewerUrlFor(info.linkUrl || candidatePdfUrl, 'word') });
      return;

    case 'pdf_to_excel_link':
      chrome.tabs.create({ url: getViewerUrlFor(info.linkUrl || candidatePdfUrl, 'excel') });
      return;

    case 'convert_image_to_pdf':
      chrome.tabs.create({ url: getViewerUrlFor(info.srcUrl || '') });
      return;

    case 'open_merge_studio':
      chrome.tabs.create({ url: getViewerUrlFor('', 'merge') });
      return;

    case 'open_scan_to_print':
      chrome.tabs.create({ url: `${BASE_URL}/scan-to-print?utm_source=extension_context_menu` });
      return;

    case 'sarkari_photo_from_image':
    case 'open_passport_photo':
      chrome.tabs.create({ url: `${BASE_URL}/passport-photo-sheet?utm_source=extension_context_menu` });
      return;

    case 'open_clean_signature':
      chrome.tabs.create({ url: `${BASE_URL}/clean-signature?utm_source=extension_context_menu` });
      return;

    case 'open_all_tools':
    default:
      chrome.tabs.create({ url: `${BASE_URL}/all-tools?utm_source=extension_context_menu` });
      return;
  }
});

function isLikelyPdfUrl(url = '') {
  const low = url.toLowerCase();
  return low.endsWith('.pdf') || low.includes('.pdf?') || low.includes('.pdf#');
}

// ─── DYNAMIC PDF CONTENT-TYPE DETECTOR & ICON BADGE ────────────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab?.url) return;
  const url = tab.url;
  const extViewerPrefix = chrome.runtime.getURL('viewer.html');

  if (url.startsWith(extViewerPrefix)) {
    chrome.action.setBadgeText({ text: 'EDIT', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#6366f1', tabId });
    chrome.action.setTitle({ title: '📖 Active in PDF Media Suite Studio Viewer', tabId });
    return;
  }

  const bypassNative = url.includes('pms_native=1');
  const urlLooksPdf = isLikelyPdfUrl(url) || (tab.title && tab.title.toLowerCase().endsWith('.pdf'));

  if (urlLooksPdf) {
    chrome.action.setBadgeText({ text: 'PDF', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId });
    chrome.action.setTitle({ title: '📄 PDF detected! Click to open in PDF Studio Viewer.', tabId });
    return;
  }

  // Check dynamic portal URLs (e.g. /download?id=123) whose response Content-Type is application/pdf
  if (/^https?:\/\//i.test(url) && !bypassNative) {
    chrome.storage.local.get(['autoOpenPdfViewer'], (res) => {
      const autoEnabled = res.autoOpenPdfViewer !== false;
      chrome.scripting
        .executeScript({
          target: { tabId },
          func: () => document.contentType === 'application/pdf',
        })
        .then((results) => {
          if (results && results[0] && results[0].result === true) {
            if (autoEnabled) {
              chrome.tabs.update(tabId, { url: `${extViewerPrefix}#${url}` });
            } else {
              chrome.action.setBadgeText({ text: 'PDF', tabId });
              chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId });
            }
          } else {
            chrome.action.setBadgeText({ text: '', tabId });
          }
        })
        .catch(() => {
          chrome.action.setBadgeText({ text: '', tabId });
        });
    });
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
});

// ─── RUNTIME MESSAGE ROUTER ────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SET_AUTO_PDF_VIEWER') {
    const enabled = Boolean(message.enabled);
    chrome.storage.local.set({ autoOpenPdfViewer: enabled }, () => {
      syncPdfInterceptorRules(enabled).then(() => sendResponse({ ok: true, enabled }));
    });
    return true;
  }

  if (message.type === 'GET_AUTO_PDF_VIEWER') {
    chrome.storage.local.get(['autoOpenPdfViewer'], (res) => {
      sendResponse({ enabled: res.autoOpenPdfViewer !== false });
    });
    return true;
  }

  if (message.type === 'GET_RECENT_FILES') {
    chrome.storage.local.get(['recentFiles'], (result) => {
      sendResponse({ recentFiles: result.recentFiles || [] });
    });
    return true;
  }

  if (message.type === 'ADD_RECENT_FILE') {
    chrome.storage.local.get(['recentFiles'], (result) => {
      const existing = result.recentFiles || [];
      const updated = [
        message.file,
        ...existing.filter((f) => f.path !== message.file.path),
      ].slice(0, 8);
      chrome.storage.local.set({ recentFiles: updated });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'CLEAR_RECENT_FILES') {
    chrome.storage.local.set({ recentFiles: [] });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'GET_CURRENT_TAB_INFO') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) {
        sendResponse({ isPdf: false, url: '' });
        return;
      }
      const url = tab.url || '';
      const extViewerPrefix = chrome.runtime.getURL('viewer.html');
      const inStudio = url.startsWith(extViewerPrefix);
      const isPdf =
        !inStudio &&
        (isLikelyPdfUrl(url) || (tab.title && tab.title.toLowerCase().endsWith('.pdf')));
      sendResponse({ isPdf, inStudio, url, title: tab.title || '' });
    });
    return true;
  }
});
