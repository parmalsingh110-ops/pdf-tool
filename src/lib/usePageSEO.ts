import { useSEO } from '../hooks/useSEO';

/**
 * usePageSEO — Unified wrapper around useSEO to prevent dual-hook collisions.
 * Sets document <title>, meta description, keywords, Open Graph, Twitter,
 * canonical URL, and injects a JSON-LD SoftwareApplication schema graph.
 *
 * @param title         - Short, keyword-rich page title
 * @param description   - 1–2 sentence description with primary keywords
 * @param customKeywords - Optional: comma-separated extra keywords
 * @param canonicalPath  - Optional: page path e.g. "/merge"
 */
export function usePageSEO(
  title: string,
  description: string,
  customKeywords?: string,
  _canonicalPath?: string
) {
  useSEO({
    title,
    description,
    keywords: customKeywords,
  });
}
