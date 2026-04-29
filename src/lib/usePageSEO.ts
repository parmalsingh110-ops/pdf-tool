import { useEffect } from 'react';

/**
 * Sets document <title> and multiple SEO <meta> tags for the current page.
 * Each tool page calls this hook with a descriptive title and description
 * so Google can index it under relevant search queries.
 */
export function usePageSEO(title: string, description: string, customKeywords?: string) {
  useEffect(() => {
    const fullTitle = `${title} | PDF Media Suite`;
    
    // Helper to update or create meta tags
    const updateMetaTag = (selector: string, attr: string, value: string) => {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement('meta');
        if (selector.startsWith('meta[name=')) {
          el.setAttribute('name', selector.match(/name="([^"]+)"/)?.[1] || '');
        } else if (selector.startsWith('meta[property=')) {
          el.setAttribute('property', selector.match(/property="([^"]+)"/)?.[1] || '');
        }
        document.head.appendChild(el);
      }
      el.setAttribute(attr, value);
    };

    const prevTitle = document.title;
    document.title = fullTitle;

    // Update Standard Meta
    updateMetaTag('meta[name="description"]', 'content', description);
    
    const keywords = customKeywords || `${title.toLowerCase()}, pdf media suite, online pdf tools, free pdf editor, convert pdf, compress pdf, merge pdf`;
    updateMetaTag('meta[name="keywords"]', 'content', keywords);

    // Update Open Graph (Facebook/LinkedIn)
    updateMetaTag('meta[property="og:title"]', 'content', fullTitle);
    updateMetaTag('meta[property="og:description"]', 'content', description);

    // Update Twitter
    updateMetaTag('meta[name="twitter:title"]', 'content', fullTitle);
    updateMetaTag('meta[name="twitter:description"]', 'content', description);

    // Cleanup not strictly necessary for meta tags if every page overrides them,
    // but good practice to restore title on unmount.
    return () => {
      document.title = prevTitle;
    };
  }, [title, description, customKeywords]);
}
