import 'regenerator-runtime/runtime';
import { PDFDocument, PDFFont, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

let cachedRegularBytes: ArrayBuffer | null = null;
let cachedBoldBytes: ArrayBuffer | null = null;

export function hasNonAscii(text: string): boolean {
  return /[^\x00-\x7F]/.test(text);
}

/**
 * Embeds NotoSansDevanagari (Regular or Bold) into `pdfDoc` whenever `sampleText`
 * contains Hindi / Devanagari or any non-ASCII Unicode characters, avoiding
 * pdf-lib StandardFonts WinAnsi encoding crashes.
 */
export async function embedSmartFont(
  pdfDoc: PDFDocument,
  sampleText: string,
  options: { bold?: boolean; fallback?: StandardFonts } = {}
): Promise<PDFFont> {
  const { bold = false, fallback = bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica } = options;

  if (hasNonAscii(sampleText)) {
    try {
      pdfDoc.registerFontkit(fontkit);
      if (bold) {
        if (!cachedBoldBytes) {
          const res = await fetch('/fonts/NotoSansDevanagari-Bold.ttf');
          if (res.ok) cachedBoldBytes = await res.arrayBuffer();
        }
        if (cachedBoldBytes) {
          return await pdfDoc.embedFont(cachedBoldBytes, { subset: true });
        }
      } else {
        if (!cachedRegularBytes) {
          const res = await fetch('/fonts/NotoSansDevanagari-Regular.ttf');
          if (res.ok) cachedRegularBytes = await res.arrayBuffer();
        }
        if (cachedRegularBytes) {
          return await pdfDoc.embedFont(cachedRegularBytes, { subset: true });
        }
      }
    } catch (err) {
      console.warn('[pdfFontHelper] Unicode font load fallback:', err);
    }
  }

  return await pdfDoc.embedFont(fallback);
}

