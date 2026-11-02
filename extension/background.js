/**
 * PDF Media Suite — Service Worker (Manifest V3) v2.0
 * Advanced background logic:
 * - PDF Tab Detection + Badge
 * - Welcome Page on First Install
 * - Context Menus (10+ actions)
 * - Recent History Storage
 */

const BASE_URL = 'https://www.pdfmediasuite.in';

// ─── INSTALL / UPDATE HANDLER ──────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(({ reason }) => {
  // Show welcome page only on fresh install
  if (reason === 'install') {
    chrome.tabs.create({
      url: `${BASE_URL}?utm_source=extension_welcome&ref=fresh_install`,
    });
  }

  // Set up context menus
  chrome.contextMenus.removeAll(() => {
    // Root menu
    chrome.contextMenus.create({
      id: 'pdf_media_suite_root',
      title: '🔴 PDF Media Suite (110+ Tools)',
      contexts: ['all'],
    });

    // ── Page actions ──
    chrome.contextMenus.create({
      id: 'convert_page_to_pdf',
      parentId: 'pdf_media_suite_root',
      title: '📄 Save this Page as PDF',
      contexts: ['page'],
    });

    chrome.contextMenus.create({
      id: 'screenshot_to_pdf',
      parentId: 'pdf_media_suite_root',
      title: '📸 Screenshot Page to PDF',
      contexts: ['page'],
    });

    // ── Link actions ──
    chrome.contextMenus.create({
      id: 'compress_pdf_link',
      parentId: 'pdf_media_suite_root',
      title: '⚡ Compress this PDF',
      contexts: ['link'],
    });

    chrome.contextMenus.create({
      id: 'pdf_to_word_link',
      parentId: 'pdf_media_suite_root',
      title: '📝 Convert PDF → Word (.docx)',
      contexts: ['link'],
    });

    chrome.contextMenus.create({
      id: 'pdf_to_excel_link',
      parentId: 'pdf_media_suite_root',
      title: '📊 Convert PDF → Excel (.xlsx)',
      contexts: ['link'],
    });

    chrome.contextMenus.create({
      id: 'unlock_pdf_link',
      parentId: 'pdf_media_suite_root',
      title: '🔓 Unlock (Remove Password) PDF',
      contexts: ['link'],
    });

    // ── Image actions ──
    chrome.contextMenus.create({
      id: 'convert_image_to_pdf',
      parentId: 'pdf_media_suite_root',
      title: '🖼️ Convert this Image to PDF',
      contexts: ['image'],
    });

    chrome.contextMenus.create({
      id: 'remove_background',
      parentId: 'pdf_media_suite_root',
      title: '✂️ Remove Image Background',
      contexts: ['image'],
    });

    chrome.contextMenus.create({
      id: 'sarkari_photo_from_image',
      parentId: 'pdf_media_suite_root',
      title: '🇮🇳 Make Sarkari Photo Sheet from Image',
      contexts: ['image'],
    });

    // ── Separator ──
    chrome.contextMenus.create({
      id: 'separator_1',
      parentId: 'pdf_media_suite_root',
      type: 'separator',
      contexts: ['all'],
    });

    // ── Shortcut launchers ──
    chrome.contextMenus.create({
      id: 'open_sarkari_photo',
      parentId: 'pdf_media_suite_root',
      title: '🇮🇳 Sarkari Photo & Signature (20–50 KB)',
      contexts: ['all'],
    });

    chrome.contextMenus.create({
      id: 'open_scanner',
      parentId: 'pdf_media_suite_root',
      title: '📷 Smart Document Scanner',
      contexts: ['all'],
    });

    chrome.contextMenus.create({
      id: 'open_merge',
      parentId: 'pdf_media_suite_root',
      title: '📑 Merge PDFs',
      contexts: ['all'],
    });

    chrome.contextMenus.create({
      id: 'open_all_tools',
      parentId: 'pdf_media_suite_root',
      title: '🚀 Browse All 110+ Tools',
      contexts: ['all'],
    });
  });
});

// ─── CONTEXT MENU CLICK HANDLER ────────────────────────────────────────────
chrome.contextMenus.onClicked.addListener((info, tab) => {
  let targetUrl = `${BASE_URL}?utm_source=extension_context_menu`;

  switch (info.menuItemId) {
    case 'convert_page_to_pdf':
      targetUrl = `${BASE_URL}/webpage-to-pdf?${info.pageUrl ? 'url=' + encodeURIComponent(info.pageUrl) + '&' : ''}utm_source=extension_context_menu`;
      break;

    case 'screenshot_to_pdf':
      targetUrl = `${BASE_URL}/screenshot-to-pdf?utm_source=extension_context_menu`;
      break;

    case 'compress_pdf_link':
      targetUrl = `${BASE_URL}/compress?${info.linkUrl ? 'src=' + encodeURIComponent(info.linkUrl) + '&' : ''}utm_source=extension_context_menu`;
      break;

    case 'pdf_to_word_link':
      targetUrl = `${BASE_URL}/pdf-to-word?${info.linkUrl ? 'src=' + encodeURIComponent(info.linkUrl) + '&' : ''}utm_source=extension_context_menu`;
      break;

    case 'pdf_to_excel_link':
      targetUrl = `${BASE_URL}/pdf-to-excel?${info.linkUrl ? 'src=' + encodeURIComponent(info.linkUrl) + '&' : ''}utm_source=extension_context_menu`;
      break;

    case 'unlock_pdf_link':
      targetUrl = `${BASE_URL}/unlock?${info.linkUrl ? 'src=' + encodeURIComponent(info.linkUrl) + '&' : ''}utm_source=extension_context_menu`;
      break;

    case 'convert_image_to_pdf':
      targetUrl = `${BASE_URL}/jpg-to-pdf?${info.srcUrl ? 'src=' + encodeURIComponent(info.srcUrl) + '&' : ''}utm_source=extension_context_menu`;
      break;

    case 'remove_background':
      targetUrl = `${BASE_URL}/remove-background?${info.srcUrl ? 'src=' + encodeURIComponent(info.srcUrl) + '&' : ''}utm_source=extension_context_menu`;
      break;

    case 'sarkari_photo_from_image':
      targetUrl = `${BASE_URL}/sarkari-photo-signature?utm_source=extension_context_menu`;
      break;

    case 'open_sarkari_photo':
      targetUrl = `${BASE_URL}/sarkari-photo-signature?utm_source=extension_context_menu`;
      break;

    case 'open_scanner':
      targetUrl = `${BASE_URL}/document-scanner?utm_source=extension_context_menu`;
      break;

    case 'open_merge':
      targetUrl = `${BASE_URL}/merge?utm_source=extension_context_menu`;
      break;

    case 'open_all_tools':
    default:
      targetUrl = `${BASE_URL}/all-tools?utm_source=extension_context_menu`;
      break;
  }

  chrome.tabs.create({ url: targetUrl });
});

// ─── PDF TAB DETECTION — BADGE ON ICON ────────────────────────────────────
// Detect when user navigates to a PDF file → show red "PDF" badge on icon
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;

  const url = tab.url || '';
  const isPdf =
    url.toLowerCase().endsWith('.pdf') ||
    url.toLowerCase().includes('.pdf?') ||
    url.toLowerCase().includes('/pdf/') ||
    (tab.title && tab.title.toLowerCase().endsWith('.pdf'));

  if (isPdf) {
    // Show red badge "PDF" on the extension icon
    chrome.action.setBadgeText({ text: 'PDF', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId });
    chrome.action.setTitle({ title: '📄 PDF detected! Click to compress, convert & more.', tabId });
  } else {
    // Clear badge on non-PDF tabs
    chrome.action.setBadgeText({ text: '', tabId });
    chrome.action.setTitle({ title: 'PDF Media Suite — 110+ Free Tools', tabId });
  }
});

// ─── RECENT FILES HELPER (called from popup) ──────────────────────────────
// Popup sends messages to background to read/write recent history
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_RECENT_FILES') {
    chrome.storage.local.get(['recentFiles'], (result) => {
      sendResponse({ recentFiles: result.recentFiles || [] });
    });
    return true; // async response
  }

  if (message.type === 'ADD_RECENT_FILE') {
    chrome.storage.local.get(['recentFiles'], (result) => {
      const existing = result.recentFiles || [];
      // Deduplicate by path, newest first, max 8
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
      if (!tab) { sendResponse({ isPdf: false, url: '' }); return; }
      const url = tab.url || '';
      const isPdf =
        url.toLowerCase().endsWith('.pdf') ||
        url.toLowerCase().includes('.pdf?') ||
        (tab.title && tab.title.toLowerCase().endsWith('.pdf'));
      sendResponse({ isPdf, url, title: tab.title || '' });
    });
    return true;
  }
});
