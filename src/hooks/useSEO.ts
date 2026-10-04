import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface SEOOptions {
  /** Page title — will be suffixed with " | PDF Media Suite" */
  title: string;
  /** Meta description (max ~155 chars ideal for SERP) */
  description: string;
  /** Comma-separated keywords for meta keywords tag */
  keywords?: string;
  /** Override the og:type (defaults to "website") */
  ogType?: string;
  /** JSON-LD structured data object to inject */
  structuredData?: Record<string, unknown>;
}

/**
 * Advanced SEO hook that sets:
 * - <title>, meta description, keywords
 * - Open Graph + Twitter Card tags
 * - Canonical URL (removes trailing slashes, deduplicates)
 * - hreflang tags (en, hi, x-default)
 * - Per-page JSON-LD structured data
 * - robots meta (ensures index,follow)
 */
export function useSEO(titleOrOptions: string | SEOOptions, descriptionArg?: string) {
  const location = useLocation();

  // Support both old useSEO(title, desc) and new useSEO({ title, desc, ... })
  const options: SEOOptions =
    typeof titleOrOptions === 'string'
      ? { title: titleOrOptions, description: descriptionArg || '' }
      : titleOrOptions;

  const { title, description, keywords, ogType, structuredData } = options;

  useEffect(() => {
    const SITE_NAME = 'PDF Media Suite';
    const BASE_URL = 'https://pdfmediasuite.in';
    const canonicalPath = location.pathname.replace(/\/+$/, '') || '/';
    const canonicalUrl = `${BASE_URL}${canonicalPath}`;

    // Full title with branding suffix
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;

    // ── 1. Title ──
    document.title = fullTitle;

    // ── 2. Meta Description ──
    setMeta('name', 'description', description);

    // ── 3. Meta Keywords ──
    if (keywords) {
      setMeta('name', 'keywords', keywords);
    }

    // ── 4. Robots ──
    setMeta('name', 'robots', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');

    // ── 5. Canonical URL ──
    setLink('canonical', canonicalUrl);

    // ── 6. hreflang tags ──
    setLink('alternate', canonicalUrl, 'en');
    setLink('alternate', canonicalUrl, 'hi');
    setLink('alternate', canonicalUrl, 'x-default');

    // ── 7. Open Graph ──
    setMetaProp('og:title', fullTitle);
    setMetaProp('og:description', description);
    setMetaProp('og:url', canonicalUrl);
    setMetaProp('og:type', ogType || 'website');
    setMetaProp('og:site_name', SITE_NAME);
    setMetaProp('og:locale', 'en_IN');
    setMetaProp('og:image', `${BASE_URL}/og-image.png`);
    setMetaProp('og:image:width', '1200');
    setMetaProp('og:image:height', '630');
    setMetaProp('og:image:alt', fullTitle);

    // ── 8. Twitter Card ──
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:site', '@pdfmediasuite');
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:image', `${BASE_URL}/og-image.png`);
    setMeta('name', 'twitter:image:alt', fullTitle);

    // ── 9. Per-page JSON-LD Structured Data ──
    // Remove any previously injected per-page LD+JSON
    const existingLd = document.querySelector('script[data-seo-ld]');
    if (existingLd) existingLd.remove();

    // Build the LD+JSON: use provided structuredData, or generate a SoftwareApplication snippet
    const ldJson = structuredData || {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: fullTitle,
      description: description,
      url: canonicalUrl,
      isPartOf: {
        '@type': 'WebSite',
        name: SITE_NAME,
        url: BASE_URL,
      },
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
          ...(canonicalPath !== '/'
            ? [
                {
                  '@type': 'ListItem',
                  position: 2,
                  name: 'All Tools',
                  item: `${BASE_URL}/all-tools`,
                },
                {
                  '@type': 'ListItem',
                  position: 3,
                  name: title,
                  item: canonicalUrl,
                },
              ]
            : []),
        ],
      },
      provider: {
        '@type': 'Organization',
        name: SITE_NAME,
        url: BASE_URL,
      },
    };

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-seo-ld', 'page');
    script.textContent = JSON.stringify(ldJson);
    document.head.appendChild(script);

    // ── 10. Cleanup on unmount ──
    return () => {
      const el = document.querySelector('script[data-seo-ld="page"]');
      if (el) el.remove();
    };
  }, [title, description, keywords, ogType, structuredData, location.pathname]);
}

// ─── Helper: set or create <meta name="..." content="..."> ───
function setMeta(attr: 'name' | 'property', key: string, value: string) {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.querySelector(selector);
  if (el) {
    el.setAttribute('content', value);
  } else {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    el.setAttribute('content', value);
    document.head.appendChild(el);
  }
}

// ─── Helper: set or create <meta property="..." content="..."> ───
function setMetaProp(property: string, content: string) {
  setMeta('property', property, content);
}

// ─── Helper: set or create <link rel="..." href="..." hreflang="..."> ───
function setLink(rel: string, href: string, hreflang?: string) {
  const selector = hreflang
    ? `link[rel="${rel}"][hreflang="${hreflang}"]`
    : `link[rel="${rel}"]`;
  let el = document.querySelector(selector) as HTMLLinkElement | null;
  if (el) {
    el.href = href;
  } else {
    el = document.createElement('link');
    el.rel = rel;
    el.href = href;
    if (hreflang) el.hreflang = hreflang;
    document.head.appendChild(el);
  }
}
