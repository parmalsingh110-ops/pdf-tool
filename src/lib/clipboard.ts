/**
 * Copies text to the system clipboard with a clean fallback for non-HTTPS LAN
 * testing and mobile in-app WebViews where `navigator.clipboard` is unavailable or blocked.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = String(text ?? '');

  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to execCommand fallback
    }
  }

  if (typeof document === 'undefined' || !document.body) {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';
  // 16px prevents iOS Safari from auto-zooming on programmatic focus
  textarea.style.fontSize = '16px';

  const activeElement = document.activeElement as HTMLElement | null;
  document.body.appendChild(textarea);

  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, value.length);
    return Boolean(document.execCommand('copy'));
  } catch {
    return false;
  } finally {
    try {
      if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
    } catch {}
    try {
      activeElement?.focus?.({ preventScroll: true });
    } catch {}
  }
}
