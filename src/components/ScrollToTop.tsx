import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ScrollToTop Component
 * 
 * In React Single Page Applications (SPAs), navigating between routes does not
 * reload the browser, which causes the browser to preserve the previous scroll position.
 * If a user scrolls down the homepage (e.g. 2000px) and clicks a tool card,
 * the new tool page will render with the viewport stuck at 2000px, hiding the
 * file upload / dropzone at the top.
 * 
 * This component listens for route changes and automatically resets the scroll
 * position to the top-left (0, 0) instantly.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Instant scroll to top on route change
    try {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'instant' as ScrollBehavior,
      });
    } catch {
      window.scrollTo(0, 0);
    }

    // Cross-browser fallback for document element & body
    if (document.documentElement) {
      document.documentElement.scrollTop = 0;
    }
    if (document.body) {
      document.body.scrollTop = 0;
    }
  }, [pathname]);

  return null;
}

