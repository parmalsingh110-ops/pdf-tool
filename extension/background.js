/**
 * PDF Media Suite — Service Worker (Manifest V3)
 * Handles context menus, tab commands, and background integrations.
 */

const BASE_URL = 'https://www.pdfmediasuite.in';

chrome.runtime.onInstalled.addListener(() => {
  // Clear any existing context menus before recreating
  chrome.contextMenus.removeAll(() => {
    // Parent Menu
    chrome.contextMenus.create({
      id: 'pdf_media_suite_root',
      title: 'PDF Media Suite (110+ Tools)',
      contexts: ['all'],
    });

    // 1. Convert current webpage to PDF
    chrome.contextMenus.create({
      id: 'convert_page_to_pdf',
      parentId: 'pdf_media_suite_root',
      title: '📄 Save Webpage as PDF',
      contexts: ['page'],
    });

    // 2. Compress PDF link
    chrome.contextMenus.create({
      id: 'compress_pdf_link',
      parentId: 'pdf_media_suite_root',
      title: '⚡ Compress this PDF',
      contexts: ['link'],
    });

    // 3. Convert PDF to Word
    chrome.contextMenus.create({
      id: 'pdf_to_word_link',
      parentId: 'pdf_media_suite_root',
      title: '📝 Convert PDF to Word (.docx)',
      contexts: ['link'],
    });

    // 4. Convert Image to PDF
    chrome.contextMenus.create({
      id: 'convert_image_to_pdf',
      parentId: 'pdf_media_suite_root',
      title: '🖼️ Convert Image to PDF',
      contexts: ['image'],
    });

    // Separator
    chrome.contextMenus.create({
      id: 'separator_1',
      parentId: 'pdf_media_suite_root',
      type: 'separator',
      contexts: ['all'],
    });

    // 5. Sarkari Photo & Signature Maker
    chrome.contextMenus.create({
      id: 'open_sarkari_photo',
      parentId: 'pdf_media_suite_root',
      title: '🇮🇳 Sarkari Photo & Signature Sheet (20-50 KB)',
      contexts: ['all'],
    });

    // 6. Browse All 110+ Tools
    chrome.contextMenus.create({
      id: 'open_all_tools',
      parentId: 'pdf_media_suite_root',
      title: '🚀 Browse All 110+ Free Tools...',
      contexts: ['all'],
    });
  });
});

// Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  let targetUrl = `${BASE_URL}?utm_source=extension_context_menu`;

  switch (info.menuItemId) {
    case 'convert_page_to_pdf':
      if (tab?.url) {
        targetUrl = `${BASE_URL}/webpage-to-pdf?url=${encodeURIComponent(tab.url)}&utm_source=extension_context_menu`;
      } else {
        targetUrl = `${BASE_URL}/webpage-to-pdf?utm_source=extension_context_menu`;
      }
      break;

    case 'compress_pdf_link':
      if (info.linkUrl) {
        targetUrl = `${BASE_URL}/compress?src=${encodeURIComponent(info.linkUrl)}&utm_source=extension_context_menu`;
      } else {
        targetUrl = `${BASE_URL}/compress?utm_source=extension_context_menu`;
      }
      break;

    case 'pdf_to_word_link':
      if (info.linkUrl) {
        targetUrl = `${BASE_URL}/pdf-to-word?src=${encodeURIComponent(info.linkUrl)}&utm_source=extension_context_menu`;
      } else {
        targetUrl = `${BASE_URL}/pdf-to-word?utm_source=extension_context_menu`;
      }
      break;

    case 'convert_image_to_pdf':
      if (info.srcUrl) {
        targetUrl = `${BASE_URL}/jpg-to-pdf?src=${encodeURIComponent(info.srcUrl)}&utm_source=extension_context_menu`;
      } else {
        targetUrl = `${BASE_URL}/jpg-to-pdf?utm_source=extension_context_menu`;
      }
      break;

    case 'open_sarkari_photo':
      targetUrl = `${BASE_URL}/sarkari-photo-signature?utm_source=extension_context_menu`;
      break;

    case 'open_all_tools':
    default:
      targetUrl = `${BASE_URL}/all-tools?utm_source=extension_context_menu`;
      break;
  }

  chrome.tabs.create({ url: targetUrl });
});

