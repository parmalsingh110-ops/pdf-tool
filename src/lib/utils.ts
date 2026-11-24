import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { dataUrlToBytes, triggerBlobDownload } from "./blobUrl";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export { dataUrlToBytes };

export function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function downloadBlob(blob: Blob, filename: string): void {
  triggerBlobDownload(blob, filename);
}
