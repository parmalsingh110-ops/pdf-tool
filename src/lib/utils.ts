import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convert a data: URL or base64 string to Uint8Array without fetch() (avoids CSP connect-src block on data: scheme)
 */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64Index = dataUrl.indexOf(',');
  const base64 = base64Index !== -1 ? dataUrl.slice(base64Index + 1) : dataUrl;
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

