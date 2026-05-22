import { useEffect } from 'react';

const BASE_URL = 'https://pdfmediasuite.in';

/**
 * usePageSEO — Comprehensive SEO hook for every tool page.
 * Sets document <title>, meta description, keywords, Open Graph, Twitter,
 * canonical URL, and injects a JSON-LD SoftwareApplication schema.
 *
 * @param title         - Short, keyword-rich page title (without site suffix)
 * @param description   - 1–2 sentence description with primary keywords
 * @param customKeywords - Optional: comma-separated extra keywords
 * @param canonicalPath  - Optional: page path e.g. "/merge" (auto-detected from window.location if omitted)
 */
export function usePageSEO(
  title: string,
  description: string,
  customKeywords?: string,
  canonicalPath?: string
) {
  useEffect(() => {
    const fullTitle = `${title} | PDF Media Suite`;
    const path = canonicalPath || window.location.pathname;
    const canonicalUrl = `${BASE_URL}${path}`;

    // ── Helper: update or create a <meta> tag ──────────────────────────────
    const setMeta = (selector: string, attrKey: string, value: string) => {
      let el = document.querySelector<HTMLMetaElement>(selector);
      if (!el) {
        el = document.createElement('meta');
        const nameMatch = selector.match(/name="([^"]+)"/);
        const propMatch = selector.match(/property="([^"]+)"/);
        if (nameMatch) el.setAttribute('name', nameMatch[1]);
        if (propMatch) el.setAttribute('property', propMatch[1]);
        document.head.appendChild(el);
      }
      el.setAttribute(attrKey, value);
    };

    // ── Helper: update or create a <link> tag ─────────────────────────────
    const setLink = (rel: string, href: string) => {
      let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
      if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', rel);
        document.head.appendChild(el);
      }
      el.setAttribute('href', href);
    };

    // ── Compose keywords ─────────────────────────────────────────────────
    const baseKeywords = `pdf media suite, free pdf tools, online pdf tools, ${title.toLowerCase()}`;
    const keywords = customKeywords
      ? `${customKeywords}, ${baseKeywords}`
      : `${title.toLowerCase()}, ${baseKeywords}, merge pdf, split pdf, compress pdf, convert pdf, edit pdf, pdf to word, pdf to jpg, image resizer, remove background`;

    // ── 1. Title ─────────────────────────────────────────────────────────
    const prevTitle = document.title;
    document.title = fullTitle;

    // ── 2. Standard Meta ──────────────────────────────────────────────────
    setMeta('meta[name="description"]', 'content', description);
    setMeta('meta[name="keywords"]', 'content', keywords);
    setMeta('meta[name="robots"]', 'content', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');

    // ── 3. Canonical URL ─────────────────────────────────────────────────
    setLink('canonical', canonicalUrl);

    // ── 4. Open Graph ─────────────────────────────────────────────────────
    setMeta('meta[property="og:title"]', 'content', fullTitle);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[property="og:url"]', 'content', canonicalUrl);
    setMeta('meta[property="og:type"]', 'content', 'website');
    setMeta('meta[property="og:site_name"]', 'content', 'PDF Media Suite');
    setMeta('meta[property="og:image"]', 'content', `${BASE_URL}/og-image.png`);

    // ── 5. Twitter Card ───────────────────────────────────────────────────
    setMeta('meta[name="twitter:card"]', 'content', 'summary_large_image');
    setMeta('meta[name="twitter:title"]', 'content', fullTitle);
    setMeta('meta[name="twitter:description"]', 'content', description);
    setMeta('meta[name="twitter:image"]', 'content', `${BASE_URL}/og-image.png`);

    // ── 6. JSON-LD: SoftwareApplication (per-page rich result) ───────────
    const jsonLdId = 'page-jsonld-schema';
    const existing = document.querySelector(`#${jsonLdId}`);
    if (existing) existing.remove();

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = jsonLdId;
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: `${title} — PDF Media Suite`,
      url: canonicalUrl,
      description: description,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any',
      inLanguage: 'en-US',
      isPartOf: {
        '@type': 'WebApplication',
        name: 'PDF Media Suite',
        url: BASE_URL,
      },
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'INR',
        availability: 'https://schema.org/InStock',
      },
      provider: {
        '@type': 'Organization',
        name: 'PDF Media Suite',
        url: BASE_URL,
      },
    });
    document.head.appendChild(script);

    // ── Cleanup ────────────────────────────────────────────────────────────
    return () => {
      document.title = prevTitle;
      const el = document.querySelector(`#${jsonLdId}`);
      if (el) el.remove();
    };
  }, [title, description, customKeywords, canonicalPath]);
}
