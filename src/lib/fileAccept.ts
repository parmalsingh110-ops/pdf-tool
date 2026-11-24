export const ACCEPT_PDF = 'application/pdf,.pdf';
export const ACCEPT_IMAGES = 'image/*,.jpg,.jpeg,.png,.webp,.heic,.heif,.avif';
export const ACCEPT_PDF_AND_IMAGES =
  'application/pdf,.pdf,image/*,.jpg,.jpeg,.png,.webp,.heic,.heif,.avif';

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif|avif|jfif|mpo|svg)$/i;
const PDF_EXT_RE = /\.pdf$/i;

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  mpo: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

/**
 * Checks whether a File is a PDF by MIME type or filename extension
 * (handles Android `content://` picks where `file.type` is empty or `application/octet-stream`).
 */
export function isPdfFile(file: File): boolean {
  if (!file) return false;
  const mime = (file.type || '').trim().toLowerCase();
  return mime === 'application/pdf' || PDF_EXT_RE.test(file.name || '');
}

/**
 * Checks whether a File is an image by MIME type or filename extension
 * (handles Android empty-MIME gallery files and iOS/Android HEIC/HEIF/AVIF/JFIF photos).
 */
export function isImageFile(file: File): boolean {
  if (!file) return false;
  const mime = (file.type || '').trim().toLowerCase();
  return mime.startsWith('image/') || IMAGE_EXT_RE.test(file.name || '');
}

/**
 * Returns `file.type` if non-empty and concrete, otherwise infers MIME from the
 * filename extension so Android empty-MIME images are never misrouted as `'application/pdf'`.
 */
export function inferMimeFromFile(
  file: File,
  fallback = 'application/octet-stream'
): string {
  if (!file) return fallback;
  const rawMime = (file.type || '').trim();
  const lowerMime = rawMime.toLowerCase();
  if (rawMime && lowerMime !== 'application/octet-stream' && lowerMime !== '*/*') {
    return rawMime;
  }

  const name = (file.name || '').trim().toLowerCase();
  const dotIdx = name.lastIndexOf('.');
  if (dotIdx !== -1 && dotIdx < name.length - 1) {
    const ext = name.slice(dotIdx + 1);
    if (ext in EXT_TO_MIME) {
      return EXT_TO_MIME[ext];
    }
  }
  return fallback;
}
