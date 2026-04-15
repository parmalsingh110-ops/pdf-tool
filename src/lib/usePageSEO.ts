import { useEffect } from 'react';

/**
 * Sets document <title> and <meta name="description"> for the current page.
 * Each tool page should call this hook with a descriptive title and description
 * so Google can index it under relevant search queries like "PDF to JPG", "image resize", etc.
 */
export function usePageSEO(title: string, description: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} — MediaSuite | Free Online Tool`;

    const metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc = metaDesc?.getAttribute('content') || '';
    if (metaDesc) {
      metaDesc.setAttribute('content', description);
    }

    return () => {
      document.title = prev;
      if (metaDesc) metaDesc.setAttribute('content', prevDesc);
    };
  }, [title, description]);
}
