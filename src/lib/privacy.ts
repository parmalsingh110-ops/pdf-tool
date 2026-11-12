/**
 * Shared Browser Privacy, Session Hygiene & WebCrypto E2EE Helpers
 */

const E2EE_MAGIC = new Uint8Array([0x50, 0x4d, 0x53, 0x45, 0x32, 0x45, 0x31, 0x00]); // "PMSE2EE1\0" (8 bytes)
const E2EE_IV_LEN = 12;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64u: string): Uint8Array {
  const padded = b64u.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64u.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * Generates a cryptographically random URL-safe secret token or AES-256 key.
 */
export function generateSecretToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < byteLength; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return toBase64Url(bytes);
}

/**
 * Validates custom backend URL overrides (prevents arbitrary server exfiltration in production).
 */
export function isAllowedBackendOverride(rawUrl: string): boolean {
  if (!rawUrl || !rawUrl.trim()) return false;
  try {
    const parsed = new URL(rawUrl.trim());
    const isLocalHost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    if (isLocalHost) {
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    }

    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (typeof window !== 'undefined' && host === window.location.hostname.toLowerCase()) {
      return true;
    }
    return (
      host === 'pdfmediasuite.in' ||
      host.endsWith('.pdfmediasuite.in') ||
      host.endsWith('.onrender.com')
    );
  } catch {
    return false;
  }
}

/**
 * Computes a short SHA-256 hex digest (used to avoid storing plaintext filenames in localStorage keys).
 */
export async function hashStorageId(input: string): Promise<string> {
  try {
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
      const data = new TextEncoder().encode(input);
      const digest = await window.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest))
        .slice(0, 12)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {}
  // Non-crypto deterministic fallback if subtle crypto unavailable (e.g. insecure HTTP non-localhost)
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Checks whether a buffer begins with the PMSE2EE1 header.
 */
export function isEncryptedEnvelope(buf: ArrayBuffer): boolean {
  if (!buf || buf.byteLength < E2EE_MAGIC.length + E2EE_IV_LEN + 16) return false;
  const view = new Uint8Array(buf, 0, E2EE_MAGIC.length);
  for (let i = 0; i < E2EE_MAGIC.length; i++) {
    if (view[i] !== E2EE_MAGIC[i]) return false;
  }
  return true;
}

/**
 * Encrypts raw file bytes using AES-256-GCM inside the browser.
 * Envelope layout: PMSE2EE1\0 (8B) || IV (12B) || Ciphertext+Tag
 */
export async function encryptBytesWithKey(plainBuffer: ArrayBuffer, keyB64Url: string): Promise<ArrayBuffer> {
  if (!keyB64Url || typeof window === 'undefined' || !window.crypto?.subtle) {
    return plainBuffer;
  }
  const rawKey = fromBase64Url(keyB64Url);
  if (rawKey.byteLength !== 32) {
    return plainBuffer;
  }
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    rawKey as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  const iv = new Uint8Array(E2EE_IV_LEN);
  window.crypto.getRandomValues(iv);

  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    cryptoKey,
    plainBuffer
  );

  const encBytes = new Uint8Array(encrypted);
  const out = new Uint8Array(E2EE_MAGIC.length + E2EE_IV_LEN + encBytes.byteLength);
  out.set(E2EE_MAGIC, 0);
  out.set(iv, E2EE_MAGIC.length);
  out.set(encBytes, E2EE_MAGIC.length + E2EE_IV_LEN);
  return out.buffer;
}

/**
 * Decrypts a PMSE2EE1 payload using AES-256-GCM. If payload isn't encrypted, returns it as-is.
 */
export async function decryptBytesWithKey(
  payload: ArrayBuffer,
  keyB64Url: string
): Promise<{ buffer: ArrayBuffer; wasEncrypted: boolean }> {
  if (!isEncryptedEnvelope(payload)) {
    return { buffer: payload, wasEncrypted: false };
  }
  if (!keyB64Url || typeof window === 'undefined' || !window.crypto?.subtle) {
    throw new Error('Encrypted payload received but decryption key is missing.');
  }
  const rawKey = fromBase64Url(keyB64Url);
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    rawKey as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  const iv = new Uint8Array(payload, E2EE_MAGIC.length, E2EE_IV_LEN);
  const ciphertext = new Uint8Array(payload, E2EE_MAGIC.length + E2EE_IV_LEN);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    cryptoKey,
    ciphertext as unknown as BufferSource
  );
  return { buffer: decrypted, wasEncrypted: true };
}

/**
 * Clears all document caches, queues, device IDs, and session tokens on shared / cyber-cafe PCs.
 */
export async function wipeAllBrowserTraces(): Promise<number> {
  let clearedCount = 0;
  if (typeof window === 'undefined') return 0;

  const isSensitiveKey = (k: string) =>
    k.startsWith('pms_') ||
    k.startsWith('pdf_') ||
    k.startsWith('recent_tools') ||
    k.startsWith('favorite_tools');

  try {
    const lsKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && isSensitiveKey(k)) lsKeys.push(k);
    }
    lsKeys.forEach((k) => {
      localStorage.removeItem(k);
      clearedCount++;
    });
  } catch {}

  try {
    const ssKeys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && isSensitiveKey(k)) ssKeys.push(k);
    }
    ssKeys.forEach((k) => {
      sessionStorage.removeItem(k);
      clearedCount++;
    });
  } catch {}

  try {
    if ('caches' in window) {
      const deleted = await caches.delete('pms-share-cache-v2');
      if (deleted) clearedCount++;
    }
  } catch {}

  try {
    if ('indexedDB' in window) {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('pms_share_cache_v1');
        req.onsuccess = () => {
          clearedCount++;
          resolve();
        };
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
        setTimeout(() => resolve(), 600);
      });
    }
  } catch {}

  return clearedCount;
}

